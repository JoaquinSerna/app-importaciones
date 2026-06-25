"use server";

import { revalidatePath } from "next/cache";

import { autoAnalizarCarpeta } from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { normalizarNcm8 } from "@/lib/ncm-match";
import { construirItemsCostosDespacho, extraerDatosDocumento, normalizarConceptoDespacho } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, TipoDocumento } from "@/lib/types";

export interface ItemDespachoEditable {
  item: number;
  ncm: string;
  conceptos: { concepto: string; monto: number }[];
}

// El usuario revisa y corrige (NCM y montos) los ítems que la IA extrajo del
// despacho antes de que se usen para nada — evita que un error de lectura en
// un PDF de muchas páginas se cuele directo a los costos sin que nadie lo vea.
export async function confirmarItemsDespacho(
  documentoId: string,
  contenedorId: string,
  items: ItemDespachoEditable[]
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("id", documentoId)
    .single();
  const datosPrevios = (doc?.datos_extraidos ?? {}) as Record<string, unknown>;

  const nuevosDatos = {
    ...datosPrevios,
    items,
    items_verificados: true,
    items_costos: construirItemsCostosDespacho({ ...datosPrevios, items }),
  };

  const { error } = await supabase
    .from("documentos")
    .update({ datos_extraidos: nuevosDatos })
    .eq("id", documentoId);
  if (error) {
    console.error("confirmarItemsDespacho", error);
    return { error: error.message };
  }

  revalidatePath(`/contenedores/${contenedorId}`);
  return {};
}

// Re-corre el análisis automático de Sección 3 para todas las carpetas
// asignadas a este contenedor (un documento del contenedor puede afectar a varias).
async function autoAnalizarCarpetasDelContenedor(contenedorId: string) {
  const supabase = createClient();
  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id")
    .eq("contenedor_id", contenedorId);
  for (const a of asignaciones ?? []) {
    await autoAnalizarCarpeta(a.carpeta_id);
  }
}

const BUCKET_DOCUMENTOS = "documentos";

function esAntiDumping(concepto: string) {
  return /anti[\s-]*dumping/i.test(concepto);
}

// Palabras clave para buscar en concepto del costo de la carpeta.
// IVA adicional va ANTES de IVA para que el match más específico tenga precedencia.
// El anti-dumping se excluye de "derecho" porque se maneja aparte (ver
// sincronizarAntiDumping): solo afecta a los SKUs marcados como paga_dumping.
const TRIBUTO_KEYWORDS: { keywords: string[]; excluir?: string[] }[] = [
  { keywords: ["derecho"], excluir: ["anti-dumping", "antidumping", "anti dumping", "antidump"] },
  { keywords: ["tasa estadística", "tasa estadistica", "estadísti"], excluir: ["máximo", "maximo"] },
  { keywords: ["iva adicional", "iva adic"] },
  { keywords: ["iva"], excluir: ["adicional"] },
  { keywords: ["ganancia"] },
];

// Conceptos que son valor de mercadería (no tributos) — no se sincronizan a costos
function esValorMercaderia(concepto: string) {
  return /fob|flete|seguro|cif/i.test(concepto);
}

interface ItemCostoConfirmado {
  concepto: string;
  monto: number;
  moneda: "USD" | "ARS";
  monto_usd: number;
}

function conceptoMatchesGrupo(concepto: string, grupo: { keywords: string[]; excluir?: string[] }) {
  const lower = concepto.toLowerCase();
  const matches = grupo.keywords.some((kw) => lower.includes(kw.toLowerCase()));
  const excluded = grupo.excluir?.some((ex) => lower.includes(ex.toLowerCase())) ?? false;
  return matches && !excluded;
}

// Tributos generales (derechos, tasa, IVA, ganancias): se prorratean por FOB
// entre TODAS las carpetas del contenedor, porque aplican a toda la mercadería.
// `conceptosCubiertos` son los conceptos que ya se resolvieron con precisión
// por ítem/NCM en sincronizarCostosSkuDesdeDespacho — se saltean acá para no
// pisar ese resultado más preciso con el reparto uniforme por FOB.
async function sincronizarCostosRealesDeDespacho(
  contenedorId: string,
  itemsCostosConfirmados: ItemCostoConfirmado[],
  conceptosCubiertos: Set<string> = new Set()
) {
  const supabase = createClient();
  const tributos = itemsCostosConfirmados.filter(
    (i) => !esValorMercaderia(i.concepto) && !esAntiDumping(i.concepto) && !conceptosCubiertos.has(i.concepto)
  );
  if (tributos.length === 0) return;

  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id, carpetas(fob_total_usd)")
    .eq("contenedor_id", contenedorId);
  if (!asignaciones || asignaciones.length === 0) return;

  const fobTotal = asignaciones.reduce(
    (a, c) => a + ((c.carpetas as unknown as { fob_total_usd: number } | null)?.fob_total_usd ?? 0),
    0
  );

  for (const asignacion of asignaciones) {
    const fobCarpeta = (asignacion.carpetas as unknown as { fob_total_usd: number } | null)?.fob_total_usd ?? 0;
    const fobProporcion = fobTotal > 0 ? fobCarpeta / fobTotal : 1 / asignaciones.length;

    const { data: costos } = await supabase
      .from("costos")
      .select("id, concepto")
      .eq("carpeta_id", asignacion.carpeta_id);
    if (!costos || costos.length === 0) continue;

    for (const grupo of TRIBUTO_KEYWORDS) {
      const item = tributos.find((i) => conceptoMatchesGrupo(i.concepto, grupo));
      if (!item || item.monto_usd <= 0) continue;
      const montoUsd = item.monto_usd * fobProporcion;

      const costo = costos.find((c) => conceptoMatchesGrupo(c.concepto, grupo));
      if (!costo) continue;

      await supabase.from("costos").update({ monto_real_usd: montoUsd }).eq("id", costo.id);
    }

    revalidatePath(`/carpetas/${asignacion.carpeta_id}`);
  }
}

interface ItemDespachoConMonedaUsd {
  item: number;
  ncm: string;
  conceptos: { concepto: string; monto: number }[];
}

// Tributos reales por SKU, leyendo el detalle por ítem/NCM de la DI (no el
// total aplanado). Cada ítem del despacho se matchea contra los SKUs cuyo
// NCM coincide (primeros 8 dígitos) y el monto de cada concepto se reparte
// por FOB entre esos SKUs — así un mismo ítem que agrupa varias medidas o
// colores con igual NCM (ej. 3 conos, 2 cascos) se reparte igual que se haría
// a mano con la DI real. Devuelve los conceptos normalizados que efectivamente
// se pudieron asignar a algún SKU, para que sincronizarCostosRealesDeDespacho
// no los vuelva a repartir de forma uniforme.
async function sincronizarCostosSkuDesdeDespacho(
  contenedorId: string,
  documentoId: string,
  itemsDespacho: ItemDespachoConMonedaUsd[],
  factorUsdPorConcepto: Map<string, number>
): Promise<Set<string>> {
  const supabase = createClient();
  const conceptosCubiertos = new Set<string>();
  if (itemsDespacho.length === 0) return conceptosCubiertos;

  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id")
    .eq("contenedor_id", contenedorId);
  const carpetaIds = (asignaciones ?? []).map((a) => a.carpeta_id);
  if (carpetaIds.length === 0) return conceptosCubiertos;

  const { data: skusRaw } = await supabase
    .from("skus")
    .select("id, carpeta_id, cantidad, precio_unitario_fob_usd, ncm_aranceles(codigo_ncm)")
    .in("carpeta_id", carpetaIds);
  const skus = (skusRaw ?? []) as unknown as {
    id: string;
    carpeta_id: string;
    cantidad: number;
    precio_unitario_fob_usd: number;
    ncm_aranceles: { codigo_ncm: string } | null;
  }[];

  // monto_usd por (sku_id, concepto normalizado)
  const montosPorSkuConcepto = new Map<string, number>();

  for (const item of itemsDespacho) {
    const ncmNorm = normalizarNcm8(item.ncm ?? "");
    if (!ncmNorm) continue;
    const skusMatch = skus.filter((s) => normalizarNcm8(s.ncm_aranceles?.codigo_ncm ?? "") === ncmNorm);
    if (skusMatch.length === 0) continue;

    const fobPorSku = new Map(skusMatch.map((s) => [s.id, (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0)]));
    const fobTotalGrupo = Array.from(fobPorSku.values()).reduce((a, v) => a + v, 0);

    for (const c of item.conceptos ?? []) {
      const monto = Number(c.monto) || 0;
      if (monto === 0) continue;
      const conceptoNorm = normalizarConceptoDespacho(c.concepto ?? "");
      const factor = factorUsdPorConcepto.get(conceptoNorm) ?? 1;
      const montoUsd = monto * factor;

      for (const sku of skusMatch) {
        const fobSku = fobPorSku.get(sku.id) ?? 0;
        const share = fobTotalGrupo > 0 ? fobSku / fobTotalGrupo : 1 / skusMatch.length;
        const montoSku = montoUsd * share;
        if (montoSku === 0) continue;
        const key = `${sku.id}__${conceptoNorm}`;
        montosPorSkuConcepto.set(key, (montosPorSkuConcepto.get(key) ?? 0) + montoSku);
      }
      conceptosCubiertos.add(conceptoNorm);
    }
  }

  // Idempotente: se borra lo previo de este documento antes de re-insertar.
  await supabase.from("costos_sku").delete().eq("documento_id", documentoId);

  if (montosPorSkuConcepto.size > 0) {
    const filas = Array.from(montosPorSkuConcepto.entries()).map(([key, monto]) => {
      const [skuId, concepto] = key.split("__");
      return { sku_id: skuId, documento_id: documentoId, concepto, monto_real_usd: monto };
    });
    await supabase.from("costos_sku").insert(filas);
  }

  // Refleja también el total por carpeta en `costos.monto_real_usd`, para que
  // la pestaña Costos (a nivel carpeta) siga mostrando un número consistente
  // con el detalle por SKU, en vez del reparto uniforme anterior.
  const totalPorCarpetaConcepto = new Map<string, number>();
  for (const [key, monto] of Array.from(montosPorSkuConcepto.entries())) {
    const [skuId, concepto] = key.split("__");
    const carpetaId = skus.find((s) => s.id === skuId)?.carpeta_id;
    if (!carpetaId) continue;
    const k = `${carpetaId}__${concepto}`;
    totalPorCarpetaConcepto.set(k, (totalPorCarpetaConcepto.get(k) ?? 0) + monto);
  }

  for (const carpetaId of Array.from(new Set(carpetaIds))) {
    const { data: costos } = await supabase.from("costos").select("id, concepto").eq("carpeta_id", carpetaId);
    if (!costos || costos.length === 0) continue;

    for (const grupo of TRIBUTO_KEYWORDS) {
      const entradaCarpeta = Array.from(totalPorCarpetaConcepto.entries()).find(
        ([k, ]) => k.startsWith(`${carpetaId}__`) && conceptoMatchesGrupo(k.split("__")[1], grupo)
      );
      if (!entradaCarpeta) continue;
      const costo = costos.find((c) => conceptoMatchesGrupo(c.concepto, grupo));
      if (!costo) continue;
      await supabase.from("costos").update({ monto_real_usd: entradaCarpeta[1] }).eq("id", costo.id);
    }
    revalidatePath(`/carpetas/${carpetaId}`);
  }

  return conceptosCubiertos;
}

// Anti-dumping (u otro tributo NCM-específico con el mismo nombre): el monto
// TOTAL del despacho se prorratea por FOB únicamente entre los SKUs que el
// usuario marcó como "paga_dumping" en la pestaña SKUs de su carpeta — nunca
// entre todos los SKUs del contenedor.
async function sincronizarAntiDumping(
  contenedorId: string,
  itemsCostosConfirmados: ItemCostoConfirmado[],
  conceptosCubiertos: Set<string> = new Set()
) {
  const item = itemsCostosConfirmados.find((i) => esAntiDumping(i.concepto));
  if (!item || item.monto_usd <= 0) return;
  // Ya se repartió con precisión por NCM/SKU en sincronizarCostosSkuDesdeDespacho
  // — el reparto uniforme por "paga_dumping" queda solo como fallback manual.
  if (conceptosCubiertos.has(normalizarConceptoDespacho(item.concepto))) return;

  const supabase = createClient();
  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id")
    .eq("contenedor_id", contenedorId);
  const carpetaIds = (asignaciones ?? []).map((a) => a.carpeta_id);
  if (carpetaIds.length === 0) return;

  const { data: skus } = await supabase
    .from("skus")
    .select("carpeta_id, cantidad, precio_unitario_fob_usd")
    .in("carpeta_id", carpetaIds)
    .eq("paga_dumping", true);

  const fobPorCarpeta = new Map<string, number>();
  for (const s of skus ?? []) {
    const fob = (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0);
    fobPorCarpeta.set(s.carpeta_id, (fobPorCarpeta.get(s.carpeta_id) ?? 0) + fob);
  }
  const fobTotalDumping = Array.from(fobPorCarpeta.values()).reduce((a, v) => a + v, 0);

  // Limpiar asignaciones previas en todas las carpetas del contenedor antes de
  // re-aplicar — si una carpeta ya no tiene SKUs marcados, queda en 0.
  await supabase.from("costos").delete().in("carpeta_id", carpetaIds).eq("concepto", item.concepto).eq("origen", "real");

  if (fobTotalDumping <= 0) return;

  for (const [carpetaId, fobCarpeta] of Array.from(fobPorCarpeta.entries())) {
    const monto = item.monto_usd * (fobCarpeta / fobTotalDumping);
    if (monto <= 0) continue;
    await supabase.from("costos").insert({
      carpeta_id: carpetaId,
      nivel: "carpeta" as const,
      concepto: item.concepto,
      categoria: "otro" as const,
      origen: "real" as const,
      monto_estimado_usd: 0,
      monto_real_usd: monto,
      notas: "Prorrateado por FOB entre los SKUs marcados como 'paga dumping'.",
    });
    revalidatePath(`/carpetas/${carpetaId}`);
  }
}

export async function subirDocumentoContenedor(
  contenedorId: string,
  tipo: TipoDocumento,
  formData: FormData
): Promise<Documento> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No se recibió ningún archivo.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = `contenedor/${contenedorId}/${tipo}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET_DOCUMENTOS).getPublicUrl(path);

  const { data: doc, error: dbError } = await supabase
    .from("documentos")
    .insert({
      contenedor_id: contenedorId,
      tipo,
      file_name: file.name,
      file_url: urlData.publicUrl,
      estado: "procesando",
      created_by: userData?.user?.id ?? null,
    })
    .select()
    .single();
  if (dbError || !doc) throw new Error(`Error guardando documento: ${dbError?.message}`);

  try {
    const datos = await extraerDatosDocumento(buffer, tipo, file.type);
    await supabase
      .from("documentos")
      .update({ estado: "extraido", datos_extraidos: datos })
      .eq("id", doc.id);

    await autoAnalizarCarpetasDelContenedor(contenedorId);

    revalidatePath(`/contenedores/${contenedorId}`);
    return { ...doc, estado: "extraido", datos_extraidos: datos } as Documento;
  } catch {
    await supabase.from("documentos").update({ estado: "error" }).eq("id", doc.id);
    revalidatePath(`/contenedores/${contenedorId}`);
    return { ...doc, estado: "error" } as Documento;
  }
}

export async function eliminarDocumentoContenedor(contenedorId: string, documentoId: string) {
  const supabase = createClient();
  await supabase.from("documentos").delete().eq("id", documentoId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

export async function confirmarMonedasDespacho(
  documentoId: string,
  contenedorId: string,
  items: { concepto: string; monto: number; moneda: "USD" | "ARS" }[],
  tipoCambio: number | null
) {
  const supabase = createClient();

  const hayArs = items.some((i) => i.moneda === "ARS");
  if (hayArs && (!tipoCambio || tipoCambio <= 0)) {
    throw new Error("Hay costos en ARS pero no se indicó el tipo de cambio.");
  }

  const itemsConfirmados: ItemCostoConfirmado[] = items.map((it) => ({
    concepto: it.concepto,
    monto: it.monto,
    moneda: it.moneda,
    monto_usd: it.moneda === "USD" ? it.monto : it.monto / (tipoCambio as number),
  }));

  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("id", documentoId)
    .single();
  const datosPrevios = (doc?.datos_extraidos ?? {}) as Record<string, unknown>;

  const nuevosDatos = {
    ...datosPrevios,
    tipo_cambio: tipoCambio,
    items_costos_confirmados: itemsConfirmados,
    monedas_confirmadas: true,
  };

  const { error } = await supabase
    .from("documentos")
    .update({ datos_extraidos: nuevosDatos })
    .eq("id", documentoId);
  if (error) throw new Error(error.message);

  // Factor para convertir el monto (en la moneda original de cada ítem) a USD,
  // por concepto — la moneda se confirma por concepto, no por ítem individual,
  // así que el mismo factor aplica a la versión "por NCM" de cada concepto.
  const factorUsdPorConcepto = new Map<string, number>();
  for (const it of itemsConfirmados) {
    factorUsdPorConcepto.set(it.concepto, it.monto !== 0 ? it.monto_usd / it.monto : it.monto_usd);
  }
  const itemsDespachoRaw = (datosPrevios.items ?? []) as ItemDespachoConMonedaUsd[];

  const conceptosCubiertos = await sincronizarCostosSkuDesdeDespacho(
    contenedorId,
    documentoId,
    itemsDespachoRaw,
    factorUsdPorConcepto
  );
  await sincronizarCostosRealesDeDespacho(contenedorId, itemsConfirmados, conceptosCubiertos);
  await sincronizarAntiDumping(contenedorId, itemsConfirmados, conceptosCubiertos);
  await autoAnalizarCarpetasDelContenedor(contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

// Re-sincroniza el anti-dumping con la selección actual de SKUs (paga_dumping)
// sin tener que volver a confirmar las monedas del despacho. Se llama cada vez
// que el usuario tilda/destilda un SKU en la pestaña SKUs de la carpeta. Solo
// aplica como fallback: si el antidumping ya se resolvió por NCM (costos_sku),
// no se vuelve a repartir de forma uniforme por "paga_dumping".
export async function resincronizarAntiDumpingDeContenedor(contenedorId: string) {
  const supabase = createClient();
  const { data: docs } = await supabase
    .from("documentos")
    .select("id, datos_extraidos")
    .eq("contenedor_id", contenedorId)
    .eq("tipo", "despacho_aduana")
    .eq("estado", "extraido")
    .order("created_at", { ascending: false })
    .limit(1);

  const documentoDespacho = docs?.[0] as { id: string; datos_extraidos: Record<string, unknown> } | undefined;
  const datos = documentoDespacho?.datos_extraidos;
  if (!datos?.monedas_confirmadas) return;

  const itemsConfirmados = (datos.items_costos_confirmados ?? []) as ItemCostoConfirmado[];

  const conceptosCubiertos = new Set<string>();
  if (documentoDespacho) {
    const { data: yaResuelto } = await supabase
      .from("costos_sku")
      .select("concepto")
      .eq("documento_id", documentoDespacho.id)
      .ilike("concepto", "%anti%dumping%")
      .limit(1);
    if (yaResuelto && yaResuelto.length > 0) conceptosCubiertos.add(yaResuelto[0].concepto);
  }

  await sincronizarAntiDumping(contenedorId, itemsConfirmados, conceptosCubiertos);
  await autoAnalizarCarpetasDelContenedor(contenedorId);
  revalidatePath(`/contenedores/${contenedorId}`);
}

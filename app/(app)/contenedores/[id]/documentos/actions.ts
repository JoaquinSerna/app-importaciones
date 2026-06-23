"use server";

import { revalidatePath } from "next/cache";

import { autoAnalizarCarpeta } from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, TipoDocumento } from "@/lib/types";

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

// Palabras clave para buscar en concepto del costo de la carpeta
// IVA adicional va ANTES de IVA para que el match más específico tenga precedencia.
// "Derechos anti-dumping" y "Tasa estadística monto máximo" se excluyen para que
// no se confundan con "Derechos de importación" / "Tasa estadística" comunes.
const TRIBUTO_KEYWORDS: { keywords: string[]; excluir?: string[] }[] = [
  { keywords: ["derecho"], excluir: ["anti-dumping", "antidumping"] },
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

async function sincronizarCostosRealesDeDespacho(
  contenedorId: string,
  itemsCostosConfirmados: ItemCostoConfirmado[]
) {
  const supabase = createClient();
  const tributos = itemsCostosConfirmados.filter((i) => !esValorMercaderia(i.concepto));
  if (tributos.length === 0) return;

  // Los tributos son % del valor de la mercadería (CIF/FOB), no del volumen —
  // se prorratean por proporción de FOB entre las carpetas del contenedor.
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
    const fobProporcion = fobTotal > 0
      ? fobCarpeta / fobTotal
      : 1 / asignaciones.length;

    const { data: costos } = await supabase
      .from("costos")
      .select("id, concepto")
      .eq("carpeta_id", asignacion.carpeta_id);
    if (!costos || costos.length === 0) continue;

    for (const grupo of TRIBUTO_KEYWORDS) {
      const item = tributos.find((i) => {
        const lower = i.concepto.toLowerCase();
        const matches = grupo.keywords.some((kw) => lower.includes(kw.toLowerCase()));
        const excluded = grupo.excluir?.some((ex) => lower.includes(ex.toLowerCase())) ?? false;
        return matches && !excluded;
      });
      if (!item || item.monto_usd <= 0) continue;
      const montoUsd = item.monto_usd * fobProporcion;

      const costo = costos.find((c) => {
        const lower = c.concepto.toLowerCase();
        const matches = grupo.keywords.some((kw) => lower.includes(kw.toLowerCase()));
        const excluded = grupo.excluir?.some((ex) => lower.includes(ex.toLowerCase())) ?? false;
        return matches && !excluded;
      });
      if (!costo) continue;

      await supabase.from("costos").update({ monto_real_usd: montoUsd }).eq("id", costo.id);
    }

    revalidatePath(`/carpetas/${asignacion.carpeta_id}`);
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

interface ItemPorNcmCrudo {
  ncm: string;
  fob_usd?: number;
  derechos_importacion?: number;
  tasa_estadistica?: number;
  iva?: number;
  iva_adicional?: number;
  ganancias?: number;
  otros_tributos?: { concepto: string; monto: number }[];
}

interface ItemPorNcmConfirmado {
  ncm: string;
  otros_tributos: { concepto: string; monto_usd: number }[];
}

// Los tributos específicos de un NCM (anti-dumping, salvaguardias, etc.) no
// pasan por la confirmación de moneda ítem por ítem — usamos la misma moneda
// que el usuario eligió para "Derechos de importación" (el tributo general
// más comparable), ya que en la práctica todo el despacho usa una sola moneda.
function convertirItemsPorNcm(
  itemsPorNcm: ItemPorNcmCrudo[],
  moneda: "USD" | "ARS",
  tipoCambio: number | null
): ItemPorNcmConfirmado[] {
  const factor = moneda === "USD" ? 1 : 1 / (tipoCambio || 1);
  return itemsPorNcm.map((item) => ({
    ncm: item.ncm,
    otros_tributos: (item.otros_tributos ?? []).map((o) => ({
      concepto: o.concepto,
      monto_usd: (o.monto ?? 0) * factor,
    })),
  }));
}

export interface SkuParaTributoNcm {
  skuId: string;
  carpetaId: string;
  carpetaNumero: string;
  descripcion: string | null;
  ncmCodigo: string | null;
  fobUsd: number;
  tributosActuales: { concepto: string; montoUsd: number }[];
}

// Lista todos los SKUs de las carpetas asignadas a este contenedor, con
// cualquier tributo específico por NCM que ya tengan cargado — para que el
// usuario elija a mano a quién corresponde (ej. derechos anti-dumping),
// en vez de que la IA intente adivinarlo por ítem del despacho.
export async function listarSkusParaTributoNcm(contenedorId: string): Promise<SkuParaTributoNcm[]> {
  const supabase = createClient();

  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id, carpetas(numero_carpeta)")
    .eq("contenedor_id", contenedorId);
  const carpetaIds = (asignaciones ?? []).map((a) => a.carpeta_id);
  if (carpetaIds.length === 0) return [];

  const numeroPorCarpeta = new Map(
    (asignaciones ?? []).map((a) => [
      a.carpeta_id,
      (a.carpetas as unknown as { numero_carpeta: string } | null)?.numero_carpeta ?? "—",
    ])
  );

  const [{ data: skus }, { data: costosNcm }] = await Promise.all([
    supabase
      .from("skus")
      .select("id, carpeta_id, descripcion, cantidad, precio_unitario_fob_usd, ncm_aranceles(codigo_ncm)")
      .in("carpeta_id", carpetaIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("costos")
      .select("carpeta_id, concepto, monto_real_usd, ncm_codigo")
      .in("carpeta_id", carpetaIds)
      .not("ncm_codigo", "is", null),
  ]);

  return (skus ?? []).map((s) => {
    const ncmCodigo = (s.ncm_aranceles as unknown as { codigo_ncm: string } | null)?.codigo_ncm ?? null;
    const tributosActuales = (costosNcm ?? [])
      .filter((c) => c.carpeta_id === s.carpeta_id && c.ncm_codigo === ncmCodigo)
      .map((c) => ({ concepto: c.concepto, montoUsd: c.monto_real_usd ?? 0 }));
    return {
      skuId: s.id,
      carpetaId: s.carpeta_id,
      carpetaNumero: numeroPorCarpeta.get(s.carpeta_id) ?? "—",
      descripcion: s.descripcion,
      ncmCodigo,
      fobUsd: (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0),
      tributosActuales,
    };
  });
}

export interface AsignacionTributoNcm {
  skuId: string;
  carpetaId: string;
  ncmCodigo: string;
  montoUsd: number;
}

// Reemplaza, para el concepto dado, todos los costos con ncm_codigo en las
// carpetas de este contenedor por la selección manual del usuario.
export async function asignarTributoPorNcm(
  contenedorId: string,
  concepto: string,
  asignaciones: AsignacionTributoNcm[]
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: asignacionesContenedor } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id")
    .eq("contenedor_id", contenedorId);
  const carpetaIds = (asignacionesContenedor ?? []).map((a) => a.carpeta_id);
  if (carpetaIds.length === 0) return { error: "Este contenedor no tiene carpetas asignadas." };

  const { error: deleteError } = await supabase
    .from("costos")
    .delete()
    .in("carpeta_id", carpetaIds)
    .eq("concepto", concepto)
    .not("ncm_codigo", "is", null);
  if (deleteError) return { error: deleteError.message };

  const validas = asignaciones.filter((a) => a.montoUsd > 0);
  if (validas.length > 0) {
    const { error: insertError } = await supabase.from("costos").insert(
      validas.map((a) => ({
        carpeta_id: a.carpetaId,
        nivel: "carpeta" as const,
        concepto,
        categoria: "otro" as const,
        origen: "real" as const,
        monto_estimado_usd: 0,
        monto_real_usd: a.montoUsd,
        ncm_codigo: a.ncmCodigo,
        notas: `Asignado manualmente al NCM ${a.ncmCodigo}`,
      }))
    );
    if (insertError) return { error: insertError.message };
  }

  for (const carpetaId of Array.from(new Set([...carpetaIds, ...validas.map((a) => a.carpetaId)]))) {
    revalidatePath(`/carpetas/${carpetaId}`);
  }
  revalidatePath(`/contenedores/${contenedorId}`);
  return {};
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

  const itemsPorNcmCrudo = (datosPrevios.items_por_ncm ?? []) as ItemPorNcmCrudo[];
  const itemDerecho = items.find((i) => /derecho/i.test(i.concepto) && !/anti-?dumping/i.test(i.concepto));
  const monedaDominante = itemDerecho?.moneda ?? items[0]?.moneda ?? "USD";
  const itemsPorNcmConfirmado = convertirItemsPorNcm(itemsPorNcmCrudo, monedaDominante, tipoCambio);

  const nuevosDatos = {
    ...datosPrevios,
    tipo_cambio: tipoCambio,
    items_costos_confirmados: itemsConfirmados,
    items_por_ncm_confirmado: itemsPorNcmConfirmado,
    monedas_confirmadas: true,
  };

  const { error } = await supabase
    .from("documentos")
    .update({ datos_extraidos: nuevosDatos })
    .eq("id", documentoId);
  if (error) throw new Error(error.message);

  await sincronizarCostosRealesDeDespacho(contenedorId, itemsConfirmados);
  // Los tributos específicos por NCM (anti-dumping, etc.) ya NO se asignan
  // automáticamente acá — la extracción por ítem no es confiable y terminaba
  // aplicándolos a SKUs que no correspondían. Ahora se asignan a mano con
  // asignarTributoPorNcm() (ver más abajo), eligiendo exactamente qué SKU.
  void itemsPorNcmConfirmado;
  await autoAnalizarCarpetasDelContenedor(contenedorId);

  revalidatePath(`/contenedores/${contenedorId}`);
}

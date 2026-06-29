"use server";

import { revalidatePath } from "next/cache";

import { autoAnalizarCarpeta } from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { familiaTributo } from "@/lib/ncm-match";
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

interface ItemCostoConfirmado {
  concepto: string;
  monto: number;
  moneda: "USD" | "ARS";
  monto_usd: number;
}

interface ItemDespachoConMonedaUsd {
  item: number;
  descripcion?: string;
  ncm: string;
  conceptos: { concepto: string; monto: number }[];
}

// Convierte los ítems del despacho (ya clasificados por concepto, en su
// moneda original) a filas de `di_items` con los 4 tributos relevantes
// expresados en USD. Reemplaza el matching automático por NCM — la
// asignación a carpeta/SKU ahora la hace asignarItemsDI() con revisión
// manual en /contenedores/[id]/di-asignacion.
async function construirYGuardarDiItems(
  contenedorId: string,
  documentoId: string,
  itemsDespacho: ItemDespachoConMonedaUsd[],
  factorUsdPorConcepto: Map<string, number>
) {
  const supabase = createClient();

  function montoUsdDeFamilia(item: ItemDespachoConMonedaUsd, esConcepto: (c: string) => boolean): number {
    return (item.conceptos ?? [])
      .filter((c) => esConcepto(c.concepto ?? ""))
      .reduce((acc, c) => {
        const monto = Number(c.monto) || 0;
        const conceptoNorm = normalizarConceptoDespacho(c.concepto ?? "");
        const factor = factorUsdPorConcepto.get(conceptoNorm) ?? 1;
        return acc + monto * factor;
      }, 0);
  }

  const filas = itemsDespacho.map((item) => ({
    contenedor_id: contenedorId,
    documento_id: documentoId,
    numero_item: String(item.item).padStart(4, "0"),
    descripcion_di: item.descripcion ?? null,
    ncm: item.ncm ?? null,
    derechos_usd: montoUsdDeFamilia(item, (c) => familiaTributo(c) === "derechos"),
    tasa_estadistica_usd: montoUsdDeFamilia(item, (c) => familiaTributo(c) === "tasa_estadistica"),
    antidumping_usd: montoUsdDeFamilia(item, (c) => familiaTributo(c) === "antidumping"),
    iva_usd: montoUsdDeFamilia(item, (c) => familiaTributo(c) === "iva" || familiaTributo(c) === "iva_adicional"),
  }));

  // Idempotente: se reemplazan los ítems de este documento (re-extracción o
  // reconfirmación de monedas no debe duplicarlos).
  await supabase.from("di_items").delete().eq("documento_id", documentoId);
  if (filas.length > 0) {
    await supabase.from("di_items").insert(filas);
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

// Repuebla di_items para despachos cuyas monedas ya estaban confirmadas
// ANTES de que existiera la tabla di_items (la primera confirmación no
// llegó a poblarla). Reusa los mismos datos ya guardados en datos_extraidos
// — items (en moneda original) y items_costos_confirmados (para derivar el
// factor de conversión a USD por concepto) — en vez de pedirle al usuario
// que vuelva a confirmar las monedas.
export async function poblarDiItemsDesdeDespacho(
  contenedorId: string,
  documentoId: string
): Promise<{ error?: string; insertados?: number }> {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("id", documentoId)
    .single();
  const datos = (doc?.datos_extraidos ?? {}) as Record<string, unknown>;

  const itemsDespachoRaw = (datos.items ?? []) as ItemDespachoConMonedaUsd[];
  if (itemsDespachoRaw.length === 0) {
    return { error: "El documento no tiene ítems individuales extraídos. Volvé a subir o extraer el Despacho de Importación." };
  }

  const itemsCostosConfirmados = (datos.items_costos_confirmados ?? []) as ItemCostoConfirmado[];
  if (itemsCostosConfirmados.length === 0) {
    return { error: "Este despacho todavía no tiene las monedas confirmadas. Confirmalas primero." };
  }

  const factorUsdPorConcepto = new Map<string, number>();
  for (const it of itemsCostosConfirmados) {
    factorUsdPorConcepto.set(it.concepto, it.monto !== 0 ? it.monto_usd / it.monto : it.monto_usd);
  }

  await construirYGuardarDiItems(contenedorId, documentoId, itemsDespachoRaw, factorUsdPorConcepto);

  const { count } = await supabase
    .from("di_items")
    .select("id", { count: "exact", head: true })
    .eq("documento_id", documentoId);

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath(`/contenedores/${contenedorId}/di-asignacion`);
  return { insertados: count ?? itemsDespachoRaw.length };
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

  // El matching a carpeta/SKU ya no es automático por NCM: queda guardado en
  // di_items para que el comprador lo revise y confirme en
  // /contenedores/[id]/di-asignacion (ver asignarItemsDI / confirmarAsignacionDI).
  await construirYGuardarDiItems(contenedorId, documentoId, itemsDespachoRaw, factorUsdPorConcepto);

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath(`/contenedores/${contenedorId}/di-asignacion`);
}

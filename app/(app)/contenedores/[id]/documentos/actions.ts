"use server";

import { revalidatePath } from "next/cache";

import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, TipoDocumento } from "@/lib/types";

const BUCKET_DOCUMENTOS = "documentos";

// Palabras clave para buscar en concepto del costo de la carpeta
// IVA adicional va ANTES de IVA para que el match más específico tenga precedencia
const TRIBUTO_KEYWORDS: { keywords: string[]; excluir?: string[] }[] = [
  { keywords: ["derecho"] },
  { keywords: ["tasa estadística", "tasa estadistica", "estadísti"] },
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

  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id, cbm_asignado")
    .eq("contenedor_id", contenedorId);
  if (!asignaciones || asignaciones.length === 0) return;

  const cbmTotal = asignaciones.reduce((a, c) => a + (c.cbm_asignado ?? 0), 0);

  for (const asignacion of asignaciones) {
    const cbmProporcion = cbmTotal > 0
      ? asignacion.cbm_asignado / cbmTotal
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
      const montoUsd = item.monto_usd * cbmProporcion;

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

  await sincronizarCostosRealesDeDespacho(contenedorId, itemsConfirmados);

  revalidatePath(`/contenedores/${contenedorId}`);
}

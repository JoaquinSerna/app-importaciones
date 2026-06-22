"use server";

import { revalidatePath } from "next/cache";

import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, TipoDocumento } from "@/lib/types";

// Mapa: campo del despacho → palabras clave para buscar en concepto del costo
// IVA adicional va ANTES de IVA para que el match más específico tenga precedencia
const TRIBUTO_CONCEPTO_MAP: { campo: string; keywords: string[]; excluir?: string[] }[] = [
  { campo: "derechos_importacion_usd", keywords: ["derecho"] },
  { campo: "tasa_estadistica_usd", keywords: ["tasa estadística", "tasa estadistica", "estadísti"] },
  { campo: "iva_adicional_usd", keywords: ["iva adicional", "iva adic"] },
  { campo: "iva_usd", keywords: ["iva"], excluir: ["adicional"] },
  { campo: "ganancias_usd", keywords: ["ganancia"] },
];

async function sincronizarCostosRealesDeDespacho(
  contenedorId: string,
  datos: Record<string, unknown>
) {
  const supabase = createClient();
  const totales = datos.totales as Record<string, number> | undefined;
  if (!totales) return;

  // Obtener todas las carpetas del contenedor con su CBM
  const { data: carpetas } = await supabase
    .from("carpetas")
    .select("id, cbm_total")
    .eq("contenedor_id", contenedorId);
  if (!carpetas || carpetas.length === 0) return;

  const cbmTotal = carpetas.reduce((a, c) => a + (c.cbm_total ?? 0), 0);

  for (const carpeta of carpetas) {
    const cbmProporcion = cbmTotal > 0 && carpeta.cbm_total
      ? carpeta.cbm_total / cbmTotal
      : 1 / carpetas.length;

    // Obtener costos de la carpeta
    const { data: costos } = await supabase
      .from("costos")
      .select("id, concepto")
      .eq("carpeta_id", carpeta.id);
    if (!costos || costos.length === 0) continue;

    for (const tributo of TRIBUTO_CONCEPTO_MAP) {
      const montoUsd_base = Number(totales[tributo.campo] ?? 0);
      if (montoUsd_base <= 0) continue;
      const montoUsd = montoUsd_base * cbmProporcion;

      // Buscar costo que coincida por concepto (case-insensitive), sin palabras excluidas
      const costo = costos.find(c => {
        const lower = c.concepto.toLowerCase();
        const matches = tributo.keywords.some(kw => lower.includes(kw.toLowerCase()));
        const excluded = tributo.excluir?.some(ex => lower.includes(ex.toLowerCase())) ?? false;
        return matches && !excluded;
      });
      if (!costo) continue;

      await supabase
        .from("costos")
        .update({ monto_real_usd: montoUsd })
        .eq("id", costo.id);
    }

    revalidatePath(`/carpetas/${carpeta.id}`);
  }
}

const BUCKET_DOCUMENTOS = "documentos";

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

    // Cuando se sube el despacho, sincronizar costos reales a todas las carpetas del contenedor
    if (tipo === "despacho_aduana" && datos) {
      await sincronizarCostosRealesDeDespacho(contenedorId, datos);
    }

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

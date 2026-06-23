"use server";

import { revalidatePath } from "next/cache";

import { autoAnalizarCarpeta } from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { extraerLiquidacionDesdePdf } from "@/lib/pdf-extractor";
import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, LiquidacionExtraida, TipoDocumento } from "@/lib/types";

const BUCKET_DOCUMENTOS = "documentos";

export interface SubirLiquidacionResult {
  path: string;
  liquidacion: LiquidacionExtraida;
}

/**
 * Sube un PDF de liquidación a Supabase Storage (bucket `documentos`) y
 * extrae sus datos estructurados vía Claude. No persiste la extracción:
 * eso lo hace `confirmarActualizacionCostos` luego de que el usuario revisa
 * el matching en la UI.
 */
export async function subirYExtraerLiquidacion(
  carpetaId: string,
  formData: FormData
): Promise<SubirLiquidacionResult> {
  const supabase = createClient();

  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No se recibió ningún archivo.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const path = `${carpetaId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    throw new Error(`Error subiendo el documento: ${uploadError.message}`);
  }

  const liquidacion = await extraerLiquidacionDesdePdf(buffer);

  revalidatePath(`/carpetas/${carpetaId}`);

  return { path, liquidacion };
}

// Cuando se sube la Proforma Invoice (o el Packing List si no hay proforma con
// items), copiamos el nombre de cada producto a los SKUs ya creados — así el
// usuario no tiene que tipear el nombre, viene solo del documento.
// Solo pisa la descripción de SKUs que todavía no tienen un nombre real
// (vacíos o que quedaron con el código de NCM puesto automáticamente al crear
// la carpeta), y solo cuando la cantidad de items coincide 1 a 1 con los SKUs.
async function sincronizarDescripcionesSkusDesdeDocumento(carpetaId: string, tipo: TipoDocumento) {
  if (tipo !== "proforma_invoice" && tipo !== "packing_list") return;

  const supabase = createClient();

  const { data: skus } = await supabase
    .from("skus")
    .select("id, descripcion, created_at, ncm_aranceles(codigo_ncm)")
    .eq("carpeta_id", carpetaId)
    .order("created_at", { ascending: true });
  if (!skus || skus.length === 0) return;

  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("carpeta_id", carpetaId)
    .eq("tipo", tipo)
    .eq("estado", "extraido")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const items = (doc?.datos_extraidos?.items ?? []) as { descripcion?: string }[];
  if (items.length === 0 || items.length !== skus.length) return;

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const descripcionNueva = items[i]?.descripcion?.trim();
    if (!descripcionNueva) continue;

    const codigoNcm = (sku.ncm_aranceles as unknown as { codigo_ncm: string } | null)?.codigo_ncm ?? null;
    const esPlaceholder = !sku.descripcion || sku.descripcion === codigoNcm;
    if (!esPlaceholder) continue;

    await supabase.from("skus").update({ descripcion: descripcionNueva }).eq("id", sku.id);
  }
}

/** Sube un documento de cualquier tipo, lo persiste en DB y extrae datos con IA */
export async function subirDocumento(
  carpetaId: string,
  tipo: TipoDocumento,
  formData: FormData
): Promise<Documento> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No se recibió ningún archivo.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = `${carpetaId}/${tipo}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET_DOCUMENTOS).getPublicUrl(path);

  // Crear registro en DB
  const { data: doc, error: dbError } = await supabase
    .from("documentos")
    .insert({
      carpeta_id: carpetaId,
      tipo,
      file_name: file.name,
      file_url: urlData.publicUrl,
      estado: "procesando",
      created_by: userData?.user?.id ?? null,
    })
    .select()
    .single();
  if (dbError || !doc) throw new Error(`Error guardando documento: ${dbError?.message}`);

  // Extraer datos con IA
  try {
    const datos = await extraerDatosDocumento(buffer, tipo, file.type);
    await supabase
      .from("documentos")
      .update({ estado: "extraido", datos_extraidos: datos })
      .eq("id", doc.id);

    // Si es comprobante de pago, actualizar fechas/montos en la carpeta
    if (datos && tipo === "comprobante_pago_anticipo") {
      await supabase.from("carpetas").update({
        fecha_pago_anticipo: (datos.fecha as string) ?? null,
        monto_anticipo_usd: (datos.monto as number) ?? null,
      }).eq("id", carpetaId);
    }
    if (datos && tipo === "comprobante_pago_saldo") {
      await supabase.from("carpetas").update({
        fecha_pago_saldo: (datos.fecha as string) ?? null,
        monto_saldo_usd: (datos.monto as number) ?? null,
      }).eq("id", carpetaId);
    }

    await sincronizarDescripcionesSkusDesdeDocumento(carpetaId, tipo);

    // Re-analizar costos reales automáticamente con el nuevo documento (best-effort).
    await autoAnalizarCarpeta(carpetaId);

    revalidatePath(`/carpetas/${carpetaId}`);
    return { ...doc, estado: "extraido", datos_extraidos: datos } as Documento;
  } catch {
    await supabase.from("documentos").update({ estado: "error" }).eq("id", doc.id);
    revalidatePath(`/carpetas/${carpetaId}`);
    return { ...doc, estado: "error" } as Documento;
  }
}

/** Elimina un documento (archivo + registro DB) */
export async function eliminarDocumento(carpetaId: string, documentoId: string) {
  const supabase = createClient();
  await supabase.from("documentos").delete().eq("id", documentoId);
  revalidatePath(`/carpetas/${carpetaId}`);
}

export interface ConfirmarActualizacionCostoInput {
  costoId: string;
  montoRealUsd: number;
  tcAplicado?: number;
}

/**
 * Actualiza monto_real_usd (y opcionalmente tc_aplicado) de los costos
 * matcheados con conceptos del PDF, marcando origen = 'pdf_despachante'.
 */
export async function confirmarActualizacionCostos(
  carpetaId: string,
  actualizaciones: ConfirmarActualizacionCostoInput[]
) {
  const supabase = createClient();

  for (const actualizacion of actualizaciones) {
    const { error } = await supabase
      .from("costos")
      .update({
        monto_real_usd: actualizacion.montoRealUsd,
        tc_aplicado: actualizacion.tcAplicado ?? null,
        origen: "pdf_despachante",
      })
      .eq("id", actualizacion.costoId);

    if (error) {
      throw new Error(`Error actualizando costo ${actualizacion.costoId}: ${error.message}`);
    }
  }

  revalidatePath(`/carpetas/${carpetaId}`);
}

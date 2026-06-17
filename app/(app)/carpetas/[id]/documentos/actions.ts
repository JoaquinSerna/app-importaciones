"use server";

import { revalidatePath } from "next/cache";

import { extraerLiquidacionDesdePdf } from "@/lib/pdf-extractor";
import { createClient } from "@/lib/supabase/server";
import type { LiquidacionExtraida } from "@/lib/types";

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

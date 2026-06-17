"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface NcmArancelInput {
  codigo_ncm: string;
  descripcion?: string;
  derecho_importacion_pct: number;
  iva_pct: number;
  aplica_iva_adicional: boolean;
  iva_adicional_pct: number;
  aplica_anticipo_ganancias: boolean;
  anticipo_ganancias_pct: number;
  aplica_iibb: boolean;
  iibb_pct: number;
  aplica_tasa_estadistica: boolean;
  tasa_estadistica_pct: number;
}

export async function crearNcm(input: NcmArancelInput) {
  const supabase = createClient();

  const { error } = await supabase.from("ncm_aranceles").insert({
    codigo_ncm: input.codigo_ncm.trim(),
    descripcion: input.descripcion?.trim() || null,
    derecho_importacion_pct: input.derecho_importacion_pct,
    iva_pct: input.iva_pct,
    aplica_iva_adicional: input.aplica_iva_adicional,
    iva_adicional_pct: input.iva_adicional_pct,
    aplica_anticipo_ganancias: input.aplica_anticipo_ganancias,
    anticipo_ganancias_pct: input.anticipo_ganancias_pct,
    aplica_iibb: input.aplica_iibb,
    iibb_pct: input.iibb_pct,
    aplica_tasa_estadistica: input.aplica_tasa_estadistica,
    tasa_estadistica_pct: input.tasa_estadistica_pct,
  });

  if (error) {
    throw new Error(`Error creando NCM: ${error.message}`);
  }

  revalidatePath("/ncm");
}

export async function actualizarNcm(id: string, input: NcmArancelInput) {
  const supabase = createClient();

  const { error } = await supabase
    .from("ncm_aranceles")
    .update({
      codigo_ncm: input.codigo_ncm.trim(),
      descripcion: input.descripcion?.trim() || null,
      derecho_importacion_pct: input.derecho_importacion_pct,
      iva_pct: input.iva_pct,
      aplica_iva_adicional: input.aplica_iva_adicional,
      iva_adicional_pct: input.iva_adicional_pct,
      aplica_anticipo_ganancias: input.aplica_anticipo_ganancias,
      anticipo_ganancias_pct: input.anticipo_ganancias_pct,
      aplica_iibb: input.aplica_iibb,
      iibb_pct: input.iibb_pct,
      aplica_tasa_estadistica: input.aplica_tasa_estadistica,
      tasa_estadistica_pct: input.tasa_estadistica_pct,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Error actualizando NCM: ${error.message}`);
  }

  revalidatePath("/ncm");
}

export async function listarNcms() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ncm_aranceles")
    .select("*")
    .order("codigo_ncm", { ascending: true });

  if (error) {
    throw new Error(`Error listando NCMs: ${error.message}`);
  }

  return data ?? [];
}

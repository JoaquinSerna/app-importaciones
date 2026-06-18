"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaCosto } from "@/lib/types";

export async function actualizarBlCarpeta(carpetaId: string, blNumber: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("carpetas")
    .update({ bl_number: blNumber.trim() || null })
    .eq("id", carpetaId);
  if (error) throw new Error(`Error actualizando BL: ${error.message}`);
  revalidatePath(`/carpetas/${carpetaId}`);
}

export interface AgregarCostoInput {
  carpetaId: string;
  concepto: string;
  categoria: CategoriaCosto;
  montoEstimadoUsd: number;
  montoRealUsd?: number;
  notas?: string;
}

export async function agregarCostoManual(input: AgregarCostoInput) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  const { error } = await supabase.from("costos").insert({
    carpeta_id: input.carpetaId,
    nivel: "carpeta",
    concepto: input.concepto,
    categoria: input.categoria,
    origen: "manual",
    monto_estimado_usd: input.montoEstimadoUsd,
    monto_real_usd: input.montoRealUsd ?? null,
    notas: input.notas ?? null,
    created_by: userId,
  });
  if (error) throw new Error(`Error agregando costo: ${error.message}`);
  revalidatePath(`/carpetas/${input.carpetaId}`);
}

export async function asignarContenedor(carpetaId: string, contenedorId: string | null) {
  const supabase = createClient();

  let fecha_embarque: string | null = null;
  let eta: string | null = null;

  if (contenedorId) {
    const { data: cont } = await supabase
      .from("contenedores")
      .select("fecha_zarpe, eta_contenedor")
      .eq("id", contenedorId)
      .single();
    fecha_embarque = cont?.fecha_zarpe ?? null;
    eta = cont?.eta_contenedor ?? null;
  }

  const { error } = await supabase
    .from("carpetas")
    .update({ contenedor_id: contenedorId, fecha_embarque, eta })
    .eq("id", carpetaId);
  if (error) throw new Error(error.message);
  revalidatePath(`/carpetas/${carpetaId}`);
}

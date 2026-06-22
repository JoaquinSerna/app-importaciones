"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaCosto } from "@/lib/types";

export async function actualizarBlCarpeta(carpetaId: string, blNumber: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("carpetas")
    .update({ bl_number: blNumber.trim() || null })
    .eq("id", carpetaId);
  if (error) {
    console.error("actualizarBlCarpeta", error);
    return { error: `Error actualizando BL: ${error.message}` };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export interface AgregarCostoInput {
  carpetaId: string;
  concepto: string;
  categoria: CategoriaCosto;
  montoEstimadoUsd: number;
  montoRealUsd?: number;
  notas?: string;
}

export async function agregarCostoManual(input: AgregarCostoInput): Promise<{ error?: string }> {
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
  if (error) {
    console.error("agregarCostoManual", error);
    return { error: `Error agregando costo: ${error.message}` };
  }
  revalidatePath(`/carpetas/${input.carpetaId}`);
  return {};
}

const CAPACIDAD_CBM: Record<string, number> = {
  "40HQ": 67,
  "20HQ": 28,
};

type CampoFechaCarpeta =
  | "fecha_pago_anticipo"
  | "fecha_pago_saldo"
  | "fecha_embarque"
  | "eta"
  | "fecha_arribo_real"
  | "fecha_liberacion"
  | "fecha_llegada_oficina";

export async function actualizarFechaCarpeta(
  carpetaId: string,
  campo: CampoFechaCarpeta,
  valor: string | null
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("carpetas")
    .update({ [campo]: valor })
    .eq("id", carpetaId);
  if (error) {
    console.error("actualizarFechaCarpeta", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export async function asignarContenedor(
  carpetaId: string,
  contenedorId: string | null
): Promise<{ error?: string }> {
  const supabase = createClient();

  let fecha_embarque: string | null = null;
  let eta: string | null = null;

  if (contenedorId) {
    const { data: cont } = await supabase
      .from("contenedores")
      .select("fecha_zarpe, eta_contenedor, tipo, numero_contenedor")
      .eq("id", contenedorId)
      .single();

    fecha_embarque = cont?.fecha_zarpe ?? null;
    eta = cont?.eta_contenedor ?? null;

    // Validar capacidad CBM si el tipo tiene límite
    const cap = cont?.tipo ? (CAPACIDAD_CBM[cont.tipo] ?? 0) : 0;
    if (cap > 0) {
      // CBM de la carpeta que queremos asignar
      const { data: carpeta } = await supabase
        .from("carpetas")
        .select("cbm_total")
        .eq("id", carpetaId)
        .single();
      const cbmCarpeta = carpeta?.cbm_total ?? 0;

      // CBM ya usado por otras carpetas en ese contenedor (excluyendo la carpeta actual por si ya estaba asignada)
      const { data: otrasCarpetas } = await supabase
        .from("carpetas")
        .select("cbm_total")
        .eq("contenedor_id", contenedorId)
        .neq("id", carpetaId);
      const cbmUsado = (otrasCarpetas ?? []).reduce((acc, c) => acc + (c.cbm_total ?? 0), 0);

      if (cbmUsado + cbmCarpeta > cap) {
        const disponible = cap - cbmUsado;
        return {
          error:
            `No hay espacio suficiente en el contenedor #${cont?.numero_contenedor ?? "—"} (${cont?.tipo}): ` +
            `capacidad ${cap} m³, ya tiene ${cbmUsado.toFixed(1)} m³ ocupados (disponible ${disponible.toFixed(1)} m³), ` +
            `y esta carpeta necesita ${cbmCarpeta.toFixed(1)} m³.`,
        };
      }
    }
  }

  const { error } = await supabase
    .from("carpetas")
    .update({ contenedor_id: contenedorId, fecha_embarque, eta })
    .eq("id", carpetaId);
  if (error) {
    console.error("asignarContenedor", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

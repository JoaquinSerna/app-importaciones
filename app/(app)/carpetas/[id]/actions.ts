"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaCosto, EstadoCarpeta } from "@/lib/types";

export async function actualizarTituloCarpeta(carpetaId: string, titulo: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("carpetas")
    .update({ titulo: titulo.trim() || null })
    .eq("id", carpetaId);
  if (error) {
    console.error("actualizarTituloCarpeta", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  revalidatePath("/carpetas");
  revalidatePath("/dashboard");
  return {};
}

const ORDEN_ESTADO: EstadoCarpeta[] = ["simulacion", "pre_embarque", "en_transito", "en_aduana", "finalizada"];

// Sube el estado de la carpeta al completar hitos del Timeline, pero nunca lo
// retrocede (si el usuario ya lo marcó manualmente más adelante, no se toca).
async function avanzarEstadoSegunFecha(
  supabase: ReturnType<typeof createClient>,
  carpetaId: string,
  campo: string,
  valor: string | null
) {
  if (!valor) return;
  const minimoPorCampo: Record<string, EstadoCarpeta> = {
    fecha_pago_anticipo: "pre_embarque",
    fecha_pago_saldo: "pre_embarque",
    fecha_embarque: "en_transito",
    fecha_arribo_real: "en_aduana",
    fecha_liberacion: "en_aduana",
    fecha_llegada_oficina: "finalizada",
  };
  const minimo = minimoPorCampo[campo];
  if (!minimo) return;

  const { data: carpeta } = await supabase.from("carpetas").select("estado").eq("id", carpetaId).single();
  if (!carpeta) return;

  const actual = ORDEN_ESTADO.indexOf(carpeta.estado as EstadoCarpeta);
  const objetivo = ORDEN_ESTADO.indexOf(minimo);
  if (objetivo > actual) {
    await supabase.from("carpetas").update({ estado: minimo }).eq("id", carpetaId);
  }
}

export async function actualizarEstadoCarpeta(carpetaId: string, estado: EstadoCarpeta): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("carpetas").update({ estado }).eq("id", carpetaId);
  if (error) {
    console.error("actualizarEstadoCarpeta", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  revalidatePath("/dashboard");
  return {};
}

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
  "40HQ": 70,
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
  await avanzarEstadoSegunFecha(supabase, carpetaId, campo, valor);
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export interface AsignacionContenedorInput {
  contenedorId: string;
  cbm: number;
}

// Una carpeta (compra/factura) puede repartirse entre varios contenedores,
// cada uno con su porción de CBM. Reemplaza por completo las asignaciones previas.
export async function asignarContenedores(
  carpetaId: string,
  asignaciones: AsignacionContenedorInput[]
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: carpeta } = await supabase
    .from("carpetas")
    .select("cbm_total")
    .eq("id", carpetaId)
    .single();
  const cbmTotalCarpeta = carpeta?.cbm_total ?? 0;

  const sumaAsignada = asignaciones.reduce((acc, a) => acc + a.cbm, 0);
  if (cbmTotalCarpeta > 0 && sumaAsignada > cbmTotalCarpeta + 0.01) {
    return {
      error: `El CBM repartido entre contenedores (${sumaAsignada.toFixed(1)} m³) supera el CBM total de la carpeta (${cbmTotalCarpeta.toFixed(1)} m³).`,
    };
  }

  // Validar capacidad de cada contenedor (considerando lo ya ocupado por OTRAS carpetas)
  for (const asignacion of asignaciones) {
    const { data: cont } = await supabase
      .from("contenedores")
      .select("tipo, numero_contenedor")
      .eq("id", asignacion.contenedorId)
      .single();
    const cap = cont?.tipo ? (CAPACIDAD_CBM[cont.tipo] ?? 0) : 0;
    if (cap <= 0) continue;

    const { data: otrasAsignaciones } = await supabase
      .from("carpeta_contenedores")
      .select("cbm_asignado")
      .eq("contenedor_id", asignacion.contenedorId)
      .neq("carpeta_id", carpetaId);
    const cbmUsado = (otrasAsignaciones ?? []).reduce((acc, a) => acc + (a.cbm_asignado ?? 0), 0);

    if (cbmUsado + asignacion.cbm > cap) {
      const disponible = cap - cbmUsado;
      return {
        error:
          `No hay espacio suficiente en el contenedor #${cont?.numero_contenedor ?? "—"} (${cont?.tipo}): ` +
          `capacidad ${cap} m³, ya tiene ${cbmUsado.toFixed(1)} m³ ocupados (disponible ${disponible.toFixed(1)} m³), ` +
          `y le estás asignando ${asignacion.cbm.toFixed(1)} m³.`,
      };
    }
  }

  // Reemplazar todas las asignaciones existentes de esta carpeta
  const { error: deleteError } = await supabase
    .from("carpeta_contenedores")
    .delete()
    .eq("carpeta_id", carpetaId);
  if (deleteError) {
    console.error("asignarContenedores: delete", deleteError);
    return { error: deleteError.message };
  }

  if (asignaciones.length > 0) {
    const { error: insertError } = await supabase.from("carpeta_contenedores").insert(
      asignaciones.map((a) => ({
        carpeta_id: carpetaId,
        contenedor_id: a.contenedorId,
        cbm_asignado: a.cbm,
      }))
    );
    if (insertError) {
      console.error("asignarContenedores: insert", insertError);
      return { error: insertError.message };
    }
  }

  // Sincronizar fechas: si hay un solo contenedor, tomamos sus fechas;
  // si hay varios, embarque = la más temprana, eta = la más tardía (el envío
  // no está completo hasta que llega el último contenedor).
  let fecha_embarque: string | null = null;
  let eta: string | null = null;
  if (asignaciones.length > 0) {
    const { data: contenedores } = await supabase
      .from("contenedores")
      .select("fecha_zarpe, eta_contenedor")
      .in("id", asignaciones.map((a) => a.contenedorId));
    const fechasZarpe = (contenedores ?? []).map((c) => c.fecha_zarpe).filter((f): f is string => !!f);
    const fechasEta = (contenedores ?? []).map((c) => c.eta_contenedor).filter((f): f is string => !!f);
    fecha_embarque = fechasZarpe.length > 0 ? fechasZarpe.sort()[0] : null;
    eta = fechasEta.length > 0 ? fechasEta.sort().slice(-1)[0] : null;
  }

  const { error } = await supabase
    .from("carpetas")
    .update({ fecha_embarque, eta })
    .eq("id", carpetaId);
  if (error) {
    console.error("asignarContenedores: update fechas", error);
    return { error: error.message };
  }
  await avanzarEstadoSegunFecha(supabase, carpetaId, "fecha_embarque", fecha_embarque);

  revalidatePath(`/carpetas/${carpetaId}`);
  revalidatePath("/contenedores");
  for (const a of asignaciones) {
    revalidatePath(`/contenedores/${a.contenedorId}`);
  }
  return {};
}

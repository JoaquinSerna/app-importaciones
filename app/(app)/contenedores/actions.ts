"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function eliminarContenedor(id: string): Promise<{ error?: string }> {
  const supabase = createClient();

  // Si hay carpetas con CBM asignado a este contenedor, avisamos antes de borrar
  // (carpeta_contenedores tiene ON DELETE CASCADE, así que no fallaría, pero
  // desvincular carpetas sin avisar sería confuso).
  const { data: asignaciones, error: asignacionesError } = await supabase
    .from("carpeta_contenedores")
    .select("carpetas(numero_carpeta)")
    .eq("contenedor_id", id);

  if (asignacionesError) {
    console.error("eliminarContenedor: error verificando carpetas asignadas", asignacionesError);
    return { error: "No se pudo verificar las carpetas asignadas al contenedor." };
  }

  if (asignaciones && asignaciones.length > 0) {
    const nombres = asignaciones
      .map((a) => (a.carpetas as unknown as { numero_carpeta: string } | null)?.numero_carpeta)
      .filter(Boolean)
      .join(", ");
    return {
      error: `No se puede eliminar: este contenedor tiene ${asignaciones.length} carpeta(s) asignada(s) (${nombres}). Reasigná o desvinculá esas carpetas primero.`,
    };
  }

  await supabase.from("criterios_prorrateo").delete().eq("contenedor_id", id);
  await supabase.from("costos").delete().eq("contenedor_id", id);

  const { error } = await supabase.from("contenedores").delete().eq("id", id);
  if (error) {
    console.error("eliminarContenedor: error eliminando contenedor", error);
    return { error: `Error eliminando el contenedor: ${error.message}` };
  }

  revalidatePath("/contenedores");
  return {};
}

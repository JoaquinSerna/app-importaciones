"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function eliminarContenedor(id: string): Promise<{ error?: string }> {
  const supabase = createClient();

  // carpetas.contenedor_id no tiene ON DELETE CASCADE — si hay carpetas asignadas,
  // el delete fallaría por violación de foreign key. Lo validamos antes con un mensaje claro.
  const { data: carpetasAsignadas, error: carpetasError } = await supabase
    .from("carpetas")
    .select("numero_carpeta")
    .eq("contenedor_id", id);

  if (carpetasError) {
    console.error("eliminarContenedor: error verificando carpetas asignadas", carpetasError);
    return { error: "No se pudo verificar las carpetas asignadas al contenedor." };
  }

  if (carpetasAsignadas && carpetasAsignadas.length > 0) {
    const nombres = carpetasAsignadas.map((c) => c.numero_carpeta).join(", ");
    return {
      error: `No se puede eliminar: este contenedor tiene ${carpetasAsignadas.length} carpeta(s) asignada(s) (${nombres}). Reasigná o desvinculá esas carpetas primero.`,
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

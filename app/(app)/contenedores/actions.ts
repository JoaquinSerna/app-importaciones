"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function eliminarContenedor(id: string) {
  const supabase = createClient();

  await supabase.from("criterios_prorrateo").delete().eq("contenedor_id", id);
  await supabase.from("costos").delete().eq("contenedor_id", id);

  const { error } = await supabase.from("contenedores").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando contenedor: ${error.message}`);

  revalidatePath("/contenedores");
}

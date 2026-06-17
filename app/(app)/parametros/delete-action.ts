"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function eliminarParametros(id: string) {
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userId) {
    const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", userId).single();
    if (perfil?.rol !== "admin") throw new Error("Solo un administrador puede eliminar parámetros.");
  }

  // No borrar si hay carpetas que lo referencian como snapshot
  const { count } = await supabase
    .from("carpetas")
    .select("id", { count: "exact", head: true })
    .eq("parametros_snapshot_id", id);

  if (count && count > 0) {
    throw new Error(
      `No se puede eliminar: hay ${count} carpeta${count > 1 ? "s" : ""} que usa${count === 1 ? " esta" : "n esta"} versión como snapshot.`
    );
  }

  const { error } = await supabase.from("parametros_globales").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando parámetros: ${error.message}`);

  revalidatePath("/parametros");
}

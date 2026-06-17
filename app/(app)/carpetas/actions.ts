"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function eliminarCarpeta(id: string) {
  const supabase = createClient();

  // Borrar registros dependientes primero
  await supabase.from("costos").delete().eq("carpeta_id", id);
  await supabase.from("skus").delete().eq("carpeta_id", id);

  const { error } = await supabase.from("carpetas").delete().eq("id", id);
  if (error) throw new Error(`Error eliminando carpeta: ${error.message}`);

  revalidatePath("/carpetas");
}

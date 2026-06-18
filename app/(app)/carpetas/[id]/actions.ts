"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function asignarContenedor(carpetaId: string, contenedorId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("carpetas")
    .update({ contenedor_id: contenedorId })
    .eq("id", carpetaId);
  if (error) throw new Error(error.message);
  revalidatePath(`/carpetas/${carpetaId}`);
}

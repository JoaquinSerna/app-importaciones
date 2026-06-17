"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function crearProveedor(nombre: string) {
  const nombre_trim = nombre.trim();
  if (!nombre_trim) throw new Error("El nombre no puede estar vacío.");

  const supabase = createClient();
  const { error } = await supabase.from("proveedores").insert({ nombre: nombre_trim });
  if (error) throw new Error(error.message);
  revalidatePath("/proveedores");
}

export async function eliminarProveedor(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("proveedores").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/proveedores");
}

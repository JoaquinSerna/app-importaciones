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

export async function subirFotoProveedor(proveedorId: string, formData: FormData): Promise<string> {
  const supabase = createClient();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No se recibió ningún archivo.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = `proveedores/${proveedorId}/foto-${Date.now()}${file.name.slice(file.name.lastIndexOf("."))}`;

  const { error: uploadError } = await supabase.storage
    .from("documentos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);

  const { error: dbError } = await supabase
    .from("proveedores")
    .update({ foto_url: urlData.publicUrl })
    .eq("id", proveedorId);
  if (dbError) throw new Error(dbError.message);

  revalidatePath("/proveedores");
  return urlData.publicUrl;
}

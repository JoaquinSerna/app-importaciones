"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { TipoContenedor } from "@/lib/types";

export interface CrearContenedorInput {
  numeroContenedor?: string;
  tipo: TipoContenedor;
  naviera?: string;
  blNumber?: string;
  fechaZarpe?: string;
  etaContenedor?: string;
  observaciones?: string;
}

export async function crearContenedor(input: CrearContenedorInput) {
  const supabase = createClient();

  const { data: contenedor, error } = await supabase
    .from("contenedores")
    .insert({
      numero_contenedor: input.numeroContenedor ?? null,
      tipo: input.tipo,
      naviera: input.naviera ?? null,
      bl_number: input.blNumber ?? null,
      fecha_zarpe: input.fechaZarpe ?? null,
      eta_contenedor: input.etaContenedor ?? null,
      observaciones: input.observaciones ?? null,
    })
    .select()
    .single();

  if (error || !contenedor) {
    throw new Error(`Error creando el contenedor: ${error?.message}`);
  }

  redirect(`/contenedores/${contenedor.id}`);
}

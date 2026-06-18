"use server";

import { createClient } from "@/lib/supabase/server";
import type { TipoContenedor } from "@/lib/types";

export interface CrearContenedorInput {
  numeroContenedor: string;
  tipo: TipoContenedor;
  fechaZarpe?: string;
  etaContenedor?: string;
  observaciones?: string;
}

export async function crearContenedor(input: CrearContenedorInput): Promise<string> {
  const supabase = createClient();

  const num = parseInt(input.numeroContenedor, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error("El número de contenedor debe ser un número entero positivo.");
  }

  // Verificar que sea mayor al máximo existente
  const { data: maxRow } = await supabase
    .from("contenedores")
    .select("numero_contenedor")
    .not("numero_contenedor", "is", null)
    .order("numero_contenedor", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxRow?.numero_contenedor) {
    const maxExistente = parseInt(maxRow.numero_contenedor, 10);
    if (!isNaN(maxExistente) && num <= maxExistente) {
      throw new Error(
        `El número de contenedor debe ser mayor al último registrado (${maxExistente}). Ingresaste ${num}.`
      );
    }
  }

  const { data: contenedor, error } = await supabase
    .from("contenedores")
    .insert({
      numero_contenedor: String(num),
      tipo: input.tipo,
      fecha_zarpe: input.fechaZarpe ?? null,
      eta_contenedor: input.etaContenedor ?? null,
      observaciones: input.observaciones ?? null,
    })
    .select()
    .single();

  if (error || !contenedor) {
    throw new Error(`Error creando el contenedor: ${error?.message}`);
  }

  return contenedor.id;
}

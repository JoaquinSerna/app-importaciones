"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface CrearParametrosInput {
  fleteInternacionalUsd: number;
  gastoTerminalUsd: number;
  fleteInternoUsd: number;
  seguroPct: number;
  honorariosDespachantePct: number;
  honorariosDespachanteMinimoUsd: number;
  tcUsdArs: number;
  gastosBancariosPct: number;
}

/**
 * Inserta una nueva versión de parametros_globales. NUNCA se hace UPDATE
 * sobre filas existentes: cada cambio crea una fila nueva, preservando el
 * historial completo y los snapshots ya fijados en carpetas existentes.
 */
export async function crearVersionParametros(input: CrearParametrosInput) {
  const supabase = createClient();

  const { data: profile } = await supabase.auth.getUser();
  const userId = profile?.user?.id ?? null;

  if (userId) {
    const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", userId).single();
    if (!perfil || perfil.rol !== "admin") {
      throw new Error("Solo un administrador puede crear una nueva versión de parámetros.");
    }
  } else {
    throw new Error("Debés estar autenticado para crear una nueva versión de parámetros.");
  }

  const { error } = await supabase.from("parametros_globales").insert({
    flete_internacional_usd: input.fleteInternacionalUsd,
    gasto_terminal_usd: input.gastoTerminalUsd,
    flete_interno_usd: input.fleteInternoUsd,
    seguro_pct: input.seguroPct,
    honorarios_despachante_pct: input.honorariosDespachantePct,
    honorarios_despachante_minimo_usd: input.honorariosDespachanteMinimoUsd,
    tc_usd_ars: input.tcUsdArs,
    gastos_bancarios_pct: input.gastosBancariosPct,
    created_by: userId,
  });

  if (error) {
    throw new Error(`Error creando la nueva versión de parámetros: ${error.message}`);
  }

  revalidatePath("/parametros");
}

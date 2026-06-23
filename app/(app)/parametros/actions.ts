"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CrearParametrosInput {
  // Marítimo
  fleteInternacionalUsd: number;
  peakSeasonUsd: number;
  // Gastos locales
  thcUsd: number;
  fleteInternoUsd: number;
  tollImportacionUsd: number;
  gastoTerminalUsd: number; // depósito fiscal por contenedor
  digitalizacionUsd: number;
  gastosOperativosUsd: number;
  gastosLocalesUsd: number;
  tramitacionesUsd: number;
  // Porcentuales
  seguroPct: number;
  honorariosDespachantePct: number;
  honorariosDespachanteMinimoUsd: number;
  tcUsdArs: number;
  gastosBancariosPct: number;
}

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
    peak_season_usd: input.peakSeasonUsd,
    thc_usd: input.thcUsd,
    flete_interno_usd: input.fleteInternoUsd,
    toll_importacion_usd: input.tollImportacionUsd,
    gasto_terminal_usd: input.gastoTerminalUsd,
    digitalizacion_usd: input.digitalizacionUsd,
    gastos_operativos_usd: input.gastosOperativosUsd,
    gastos_locales_usd: input.gastosLocalesUsd,
    tramitaciones_usd: input.tramitacionesUsd,
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

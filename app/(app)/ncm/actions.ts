"use server";

import { createClient } from "@/lib/supabase/server";

// /ncm es de solo lectura: los NCM se cargan automáticamente al clasificar
// los ítems en "Nueva carpeta" (ver app/(app)/carpetas/nueva/actions.ts),
// nunca a mano desde este módulo.

export async function listarNcms() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ncm_aranceles")
    .select("*")
    .order("codigo_ncm", { ascending: true });

  if (error) {
    throw new Error(`Error listando NCMs: ${error.message}`);
  }

  return data ?? [];
}

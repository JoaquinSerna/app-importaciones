import { SimuladorForm } from "@/components/simulador/SimuladorForm";
import { createClient } from "@/lib/supabase/server";

export default async function NuevaCarpetaPage() {
  const supabase = createClient();

  const { data: parametros } = await supabase
    .from("parametros_globales")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: proveedores } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva carpeta / Simulador de costos</h1>
        <p className="text-muted-foreground">
          Simulá la cascada impositiva de una importación antes de crear la carpeta.
        </p>
      </div>
      <SimuladorForm parametros={parametros ?? null} proveedores={proveedores ?? []} />
    </div>
  );
}

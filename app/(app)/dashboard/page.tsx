import { CarpetaCard } from "@/components/dashboard/CarpetaCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcularMetricas, type CarpetaConCostos } from "@/lib/dashboard-metrics";
import { createClient } from "@/lib/supabase/server";
import type { Carpeta, EstadoCarpeta } from "@/lib/types";

const COLUMNAS: { estado: EstadoCarpeta; titulo: string }[] = [
  { estado: "pre_embarque", titulo: "Pre-embarque" },
  { estado: "en_transito", titulo: "En tránsito" },
  { estado: "en_aduana", titulo: "En aduana" },
  { estado: "finalizada", titulo: "Finalizada" },
];

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const supabase = createClient();

  const { data: carpetasRaw } = await supabase
    .from("carpetas")
    .select("*, proveedores(nombre), costos(*)")
    .neq("estado", "simulacion")
    .order("created_at", { ascending: false });

  const carpetas: (Carpeta & { proveedor_nombre?: string | null })[] = (carpetasRaw ?? []).map(
    (c: Carpeta & { proveedores?: { nombre: string } | null }) => ({
      ...c,
      proveedor_nombre: c.proveedores?.nombre ?? null,
    })
  );

  const metricas = calcularMetricas(carpetas as CarpetaConCostos[]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Estado general de las importaciones activas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Carpetas activas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{metricas.carpetasActivas}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">FOB en tránsito</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatUsd(metricas.totalFobTransito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Promedio días en aduana
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {metricas.promedioDiasEnAduana.toFixed(1)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Varianza promedio</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {metricas.varianzaPromedioPct.toFixed(1)}%
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNAS.map((columna) => {
          const items = carpetas.filter((c) => c.estado === columna.estado);
          return (
            <div key={columna.estado} className="space-y-3">
              <h2 className="font-medium text-sm text-muted-foreground">
                {columna.titulo} ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((carpeta) => (
                  <CarpetaCard key={carpeta.id} carpeta={carpeta} />
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin carpetas en este estado.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

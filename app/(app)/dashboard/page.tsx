import Link from "next/link";

import { CarpetaCard } from "@/components/dashboard/CarpetaCard";
import { Button } from "@/components/ui/button";
import { calcularMetricas, proximoArribo, type CarpetaConCostos } from "@/lib/dashboard-metrics";
import { createClient } from "@/lib/supabase/server";
import type { Carpeta, EstadoCarpeta } from "@/lib/types";

export const revalidate = 60;

const COLUMNAS: { estado: EstadoCarpeta; titulo: string; badgeClassName: string }[] = [
  { estado: "pre_embarque", titulo: "Pre-embarque", badgeClassName: "bg-[#64748B] text-white" },
  { estado: "en_transito", titulo: "En tránsito", badgeClassName: "bg-cac-blue text-white" },
  { estado: "en_aduana", titulo: "En aduana", badgeClassName: "bg-[#D97706] text-white" },
  { estado: "finalizada", titulo: "Finalizada", badgeClassName: "bg-[#16A34A] text-white" },
];

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function MetricCard({ label, valor, sub, valorClassName }: { label: string; valor: string; sub?: string; valorClassName?: string }) {
  return (
    <div className="rounded-lg border-l-4 border-cac-blue bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className={`mt-1 text-[32px] font-semibold leading-none text-[#1A202C] ${valorClassName ?? ""}`}>{valor}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
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

  if (carpetas.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted-foreground">
          No hay importaciones activas. Creá la primera carpeta desde la sección Carpetas.
        </p>
        <Button asChild className="bg-cac-blue hover:bg-cac-blue/90">
          <Link href="/carpetas">Ir a Carpetas</Link>
        </Button>
      </div>
    );
  }

  const metricas = calcularMetricas(carpetas as CarpetaConCostos[]);
  const proxima = proximoArribo(carpetas as CarpetaConCostos[]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Estado general de las importaciones activas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Carpetas activas" valor={String(metricas.carpetasActivas)} />
        <MetricCard label="FOB en tránsito" valor={formatUsd(metricas.totalFobTransito)} />
        <MetricCard
          label="Próximo arribo"
          valor={proxima ? `En ${proxima.dias} día${proxima.dias === 1 ? "" : "s"}` : "—"}
          sub={proxima?.titulo}
        />
        <MetricCard
          label="Varianza promedio"
          valor={`${metricas.varianzaPromedioPct > 0 ? "+" : ""}${metricas.varianzaPromedioPct.toFixed(1)}%`}
          valorClassName={metricas.varianzaPromedioPct > 0 ? "text-[#DC2626]" : "text-[#16A34A]"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNAS.map((columna) => {
          const items = carpetas.filter((c) => c.estado === columna.estado);
          return (
            <div key={columna.estado} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${columna.badgeClassName}`}>
                  {columna.titulo}
                </span>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              <div className="space-y-3">
                {items.map((carpeta) => (
                  <CarpetaCard key={carpeta.id} carpeta={carpeta} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#E2E8F0] py-8 text-center text-sm text-muted-foreground">
                    Sin importaciones
                    <br />
                    en este estado
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { calcularVarianzaCarpeta, diasHastaEta } from "@/lib/dashboard-metrics";
import type { Carpeta, Costo, EstadoCarpeta } from "@/lib/types";

interface CarpetaCardProps {
  carpeta: Carpeta & { proveedor_nombre?: string | null; costos?: Costo[] };
}

const ESTADO_BADGE: Record<EstadoCarpeta, { label: string; className: string }> = {
  simulacion: { label: "Simulación", className: "bg-muted text-muted-foreground" },
  pre_embarque: { label: "Pre-embarque", className: "bg-[#64748B] text-white" },
  en_transito: { label: "En tránsito", className: "bg-cac-blue text-white" },
  en_aduana: { label: "En aduana", className: "bg-[#D97706] text-white" },
  finalizada: { label: "Finalizada", className: "bg-[#16A34A] text-white" },
};

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatFechaCorta(fecha: string) {
  return new Date(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function CarpetaCard({ carpeta }: CarpetaCardProps) {
  const varianza = calcularVarianzaCarpeta(carpeta.costos);
  const diasEta = diasHastaEta(carpeta);
  const etaVencida = diasEta !== null && diasEta < 0 && carpeta.estado !== "finalizada" && !carpeta.fecha_arribo_real;
  const sobrecoste = varianza !== null && varianza > 10;

  const cifEstimado = carpeta.fob_total_usd + (carpeta.costos ?? []).reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  const estadoBadge = ESTADO_BADGE[carpeta.estado];

  return (
    <Link href={`/carpetas/${carpeta.id}`}>
      <div
        className={cn(
          "rounded-lg border bg-white p-4 transition-all hover:border-cac-blue hover:shadow-md",
          etaVencida ? "border-2 border-[#DC2626]" : "border-[#E2E8F0]"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{carpeta.numero_carpeta}</span>
          <Badge className={cn("border-transparent", estadoBadge.className)}>{estadoBadge.label}</Badge>
        </div>

        <div className="mt-2">
          {carpeta.titulo ? (
            <p className="text-base font-semibold leading-tight text-[#1A202C]">{carpeta.titulo}</p>
          ) : (
            <p className="text-base italic leading-tight text-muted-foreground">{carpeta.numero_carpeta}</p>
          )}
          {carpeta.proveedor_nombre && <p className="text-[13px] text-muted-foreground">{carpeta.proveedor_nombre}</p>}
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">FOB: <span className="font-medium text-[#1A202C]">{formatUsd(carpeta.fob_total_usd)}</span></span>
          <span className="text-muted-foreground">CIF est: <span className="font-medium text-[#1A202C]">{formatUsd(cifEstimado)}</span></span>
        </div>

        <div className="mt-2 flex items-center justify-between">
          {carpeta.eta ? (
            <span className={cn("flex items-center gap-1 text-sm", etaVencida ? "text-[#DC2626]" : "text-[#16A34A]")}>
              <CalendarDays className="h-3.5 w-3.5" />
              ETA: {formatFechaCorta(carpeta.eta)}
              {diasEta !== null && (etaVencida ? ` (vencida hace ${Math.abs(diasEta)}d)` : ` (en ${diasEta}d)`)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Sin ETA cargado</span>
          )}
          {etaVencida && <Badge className="border-transparent bg-[#DC2626] text-white">ETA VENCIDA</Badge>}
        </div>

        <div className="mt-1 flex items-center justify-between">
          {varianza !== null ? (
            <span className={cn("flex items-center gap-1 text-sm font-medium", varianza > 0 ? "text-[#DC2626]" : "text-[#16A34A]")}>
              {varianza > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              Varianza: {varianza.toFixed(1)}%
            </span>
          ) : (
            <span />
          )}
          {sobrecoste && <Badge className="border-transparent bg-[#D97706] text-white">SOBRECOSTE</Badge>}
        </div>
      </div>
    </Link>
  );
}

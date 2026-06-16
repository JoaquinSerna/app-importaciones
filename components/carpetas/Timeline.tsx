import { CheckCircle2, Circle } from "lucide-react";

import type { Carpeta } from "@/lib/types";

interface HitoTimeline {
  label: string;
  fecha: string | null;
}

function formatFecha(fecha: string | null) {
  if (!fecha) return "Pendiente";
  return new Date(fecha).toLocaleDateString("es-AR");
}

export function Timeline({ carpeta }: { carpeta: Carpeta }) {
  const hitos: HitoTimeline[] = [
    { label: "Pago de anticipo", fecha: carpeta.fecha_pago_anticipo },
    { label: "Pago de saldo", fecha: carpeta.fecha_pago_saldo },
    { label: "Embarque", fecha: carpeta.fecha_embarque },
    { label: "ETA", fecha: carpeta.eta },
    { label: "Arribo real", fecha: carpeta.fecha_arribo_real },
    { label: "Liberación de aduana", fecha: carpeta.fecha_liberacion },
    { label: "Llegada a oficina", fecha: carpeta.fecha_llegada_oficina },
  ];

  return (
    <ol className="space-y-4">
      {hitos.map((hito) => {
        const cumplido = Boolean(hito.fecha);
        return (
          <li key={hito.label} className="flex items-center gap-3">
            {cumplido ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex flex-1 justify-between">
              <span className={cumplido ? "" : "text-muted-foreground"}>{hito.label}</span>
              <span className="text-sm text-muted-foreground">{formatFecha(hito.fecha)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

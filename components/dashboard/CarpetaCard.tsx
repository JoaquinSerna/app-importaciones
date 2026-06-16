import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcularAlertas } from "@/lib/alertas";
import { calcularVarianzaCarpeta, diasEnAduana, diasHastaEta } from "@/lib/dashboard-metrics";
import type { Carpeta, Costo } from "@/lib/types";

interface CarpetaCardProps {
  carpeta: Carpeta & { proveedor_nombre?: string | null; costos?: Costo[] };
}

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function CarpetaCard({ carpeta }: CarpetaCardProps) {
  const alertas = calcularAlertas(carpeta);
  const hayAlertaDanger = alertas.some((a) => a.severidad === "danger");
  const varianza = calcularVarianzaCarpeta(carpeta.costos);
  const diasAduana = diasEnAduana(carpeta);
  const diasEta = diasHastaEta(carpeta);

  return (
    <Link href={`/carpetas/${carpeta.id}`}>
      <Card className="hover:border-primary/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{carpeta.numero_carpeta}</CardTitle>
            {hayAlertaDanger && <Badge variant="destructive">Alerta</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {carpeta.proveedor_nombre && <p>{carpeta.proveedor_nombre}</p>}
          <p>FOB: {formatUsd(carpeta.fob_total_usd)}</p>
          {diasAduana !== null && <p>En aduana hace {diasAduana} día(s)</p>}
          {diasEta !== null && (
            <p>{diasEta >= 0 ? `ETA en ${diasEta} día(s)` : `ETA vencida hace ${Math.abs(diasEta)} día(s)`}</p>
          )}
          {varianza !== null && (
            <p className={varianza > 0 ? "text-destructive" : "text-emerald-600"}>
              Varianza: {varianza.toFixed(1)}%
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

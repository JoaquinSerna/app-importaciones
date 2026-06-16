import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AgregarCostoDialog } from "@/components/carpetas/AgregarCostoDialog";
import type { Costo } from "@/lib/types";

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function varianzaPct(estimado: number, real: number | null): number | null {
  if (real === null || real === undefined || estimado === 0) return null;
  return ((real - estimado) / estimado) * 100;
}

export function CostosTable({ carpetaId, costos }: { carpetaId: string; costos: Costo[] }) {
  const totalEstimado = costos.reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  const totalReal = costos.reduce((acc, c) => acc + (c.monto_real_usd ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AgregarCostoDialog carpetaId={carpetaId} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead className="text-right">Estimado</TableHead>
            <TableHead className="text-right">Real</TableHead>
            <TableHead className="text-right">Varianza</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {costos.map((costo) => {
            const varianza = varianzaPct(costo.monto_estimado_usd, costo.monto_real_usd ?? null);
            return (
              <TableRow key={costo.id}>
                <TableCell>{costo.concepto}</TableCell>
                <TableCell className="capitalize">{costo.categoria}</TableCell>
                <TableCell className="capitalize">{costo.origen}</TableCell>
                <TableCell className="text-right">{formatUsd(costo.monto_estimado_usd)}</TableCell>
                <TableCell className="text-right">
                  {costo.monto_real_usd !== null && costo.monto_real_usd !== undefined
                    ? formatUsd(costo.monto_real_usd)
                    : "-"}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    varianza !== null ? (varianza > 0 ? "text-destructive" : "text-emerald-600") : ""
                  }`}
                >
                  {varianza !== null ? `${varianza.toFixed(1)}%` : "-"}
                </TableCell>
              </TableRow>
            );
          })}
          {costos.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Sin costos cargados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex justify-end gap-6 text-sm font-medium">
        <span>Total estimado: {formatUsd(totalEstimado)}</span>
        <span>Total real: {formatUsd(totalReal)}</span>
      </div>
    </div>
  );
}

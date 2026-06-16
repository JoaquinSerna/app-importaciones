"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportarExcelButton } from "@/components/reportes/ExportarExcelButton";
import { ExportarPdfButton, type CarpetaReporteData } from "@/components/reportes/ExportarPdfButton";
import { construirFilaComparativa } from "@/lib/reportes";

function formatUsd(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function ReportesSelector({ carpetasData }: { carpetasData: CarpetaReporteData[] }) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const datosSeleccionados = useMemo(
    () => carpetasData.filter((d) => seleccionadas.has(d.carpeta.id)),
    [carpetasData, seleccionadas]
  );

  const filasComparativas = useMemo(
    () => datosSeleccionados.map((d) => construirFilaComparativa(d.carpeta, d.costos)),
    [datosSeleccionados]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carpetas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Carpeta</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Exportar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carpetasData.map((d) => (
                <TableRow key={d.carpeta.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(d.carpeta.id)}
                      onChange={() => toggle(d.carpeta.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{d.carpeta.numero_carpeta}</TableCell>
                  <TableCell>{d.proveedorNombre ?? "-"}</TableCell>
                  <TableCell className="capitalize">{d.carpeta.estado.replace("_", " ")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <ExportarPdfButton data={d} />
                      <ExportarExcelButton data={d} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {carpetasData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Sin carpetas disponibles.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reporte comparativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carpeta</TableHead>
                <TableHead className="text-right">FOB</TableHead>
                <TableHead className="text-right">CIF estimado</TableHead>
                <TableHead className="text-right">Costo real</TableHead>
                <TableHead className="text-right">Varianza</TableHead>
                <TableHead className="text-right">Días totales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filasComparativas.map((f) => (
                <TableRow key={f.carpetaId}>
                  <TableCell className="font-medium">{f.numeroCarpeta}</TableCell>
                  <TableCell className="text-right">{formatUsd(f.fobUsd)}</TableCell>
                  <TableCell className="text-right">{formatUsd(f.cifEstimadoUsd)}</TableCell>
                  <TableCell className="text-right">{formatUsd(f.costoRealUsd)}</TableCell>
                  <TableCell
                    className={`text-right ${
                      f.varianzaPct !== null ? (f.varianzaPct > 0 ? "text-destructive" : "text-emerald-600") : ""
                    }`}
                  >
                    {f.varianzaPct !== null ? `${f.varianzaPct.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right">{f.diasTotales ?? "-"}</TableCell>
                </TableRow>
              ))}
              {filasComparativas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Seleccioná una o más carpetas para ver el comparativo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

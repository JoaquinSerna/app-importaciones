"use client";

import { AlertTriangle, CheckCircle, FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmt(n: number) {
  return `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function diff(real: number, sim: number | null) {
  if (sim === null) return null;
  const d = real - sim;
  const pct = sim !== 0 ? (d / sim) * 100 : 0;
  return { d, pct };
}

interface ComparacionGuardada {
  concepto_real: string;
  concepto_simulado: string | null;
  monto_real_usd: number;
  monto_simulado_usd: number | null;
  fuente: string;
  es_nuevo: boolean;
  confirmado: boolean;
}

interface Props {
  carpetaId: string;
  comparacionGuardada: ComparacionGuardada[];
}

// Solo lectura: el matching, la confirmación y la escritura a Costos ya
// corrieron solos (autoAnalizarCarpeta) al subir cada documento — esta
// sección no tiene botones, solo muestra el resultado y señala qué
// conceptos quedaron con confianza baja para que se revisen a simple vista.
export function SeccionComparacion({ comparacionGuardada }: Props) {
  if (comparacionGuardada.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
          <FileSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-sm">
            Todavía no hay documentos con costos reales para comparar. Esto se completa solo apenas subas la
            Proforma Invoice, facturas o el despacho.
          </p>
        </CardContent>
      </Card>
    );
  }

  const items = comparacionGuardada;
  const necesitaRevision = items.filter((i) => !i.confirmado);
  const totalReal = items.reduce((a, i) => a + i.monto_real_usd, 0);
  const totalSimulado = items.reduce((a, i) => a + (i.monto_simulado_usd ?? 0), 0);

  return (
    <div className="space-y-4">
      {necesitaRevision.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {necesitaRevision.length} concepto(s) con coincidencia de baja confianza
          </p>
          <p className="text-xs text-amber-700">
            Los montos ya están aplicados a Costos. Revisá que el concepto asignado tenga sentido.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparación estimado vs. real</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Concepto simulado</th>
                <th className="text-right px-4 py-2 font-medium">Estimado</th>
                <th className="text-left px-4 py-2 font-medium">Real (del documento)</th>
                <th className="text-right px-4 py-2 font-medium">Real</th>
                <th className="text-right px-4 py-2 font-medium">Diferencia</th>
                <th className="text-center px-4 py-2 font-medium">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const d = diff(item.monto_real_usd, item.monto_simulado_usd);
                return (
                  <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      {item.es_nuevo ? <span className="text-amber-600 font-medium">★ Costo nuevo</span> : item.concepto_simulado}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {item.monto_simulado_usd != null ? fmt(item.monto_simulado_usd) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{item.concepto_real}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(item.monto_real_usd)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${item.es_nuevo ? "text-destructive" : !d ? "text-muted-foreground" : d.d > 0 ? "text-destructive" : "text-green-600"}`}>
                      {item.es_nuevo
                        ? `-${fmt(item.monto_real_usd)}`
                        : !d ? "—" : `${d.d > 0 ? "+" : ""}${fmt(d.d)} (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(0)}%)`}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {item.confirmado ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                          <CheckCircle className="h-3 w-3" />Alta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-400 text-amber-800 gap-1">
                          <AlertTriangle className="h-3 w-3" />Revisar
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right">{fmt(totalSimulado)}</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-right">{fmt(totalReal)}</td>
                <td className={`px-4 py-2 text-right text-xs ${totalReal > totalSimulado ? "text-destructive" : "text-green-600"}`}>
                  {totalReal > totalSimulado ? "+" : ""}{fmt(totalReal - totalSimulado)}
                </td>
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

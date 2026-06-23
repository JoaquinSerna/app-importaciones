"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle, HelpCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";

import {
  analizarCostosReales,
  guardarComparacion,
  type ItemPropuesto,
} from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const OPCIONES_SIMULACION = [
  "FOB del proveedor",
  "Flete internacional",
  "Peak Season",
  "Seguro",
  "Derechos de importación",
  "Tasa estadística",
  "IVA",
  "IVA adicional",
  "Anticipo de ganancias",
  "IIBB",
  "THC",
  "Flete local",
  "TOLL Importación",
  "Depósito fiscal",
  "Digitalización de despacho",
  "Gastos operativos",
  "Tramitaciones",
  "Honorarios despachante",
  "Gastos bancarios",
];

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

export function SeccionComparacion({ carpetaId, comparacionGuardada }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  // confirmado=true (alta confianza, auto-sincronizado a Costos) → confidence 1.
  // confirmado=false (dudoso, quedó pendiente de revisión) → confidence 0.
  const [items, setItems] = useState<ItemPropuesto[] | null>(
    comparacionGuardada.length > 0
      ? comparacionGuardada.map(c => ({ ...c, confidence: c.confirmado ? 1 : 0 }))
      : null
  );
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [fase, setFase] = useState<"idle" | "review" | "done">(
    comparacionGuardada.length === 0
      ? "idle"
      : comparacionGuardada.every((c) => c.confirmado)
        ? "done"
        : "review"
  );

  function handleAnalizar() {
    startTransition(async () => {
      try {
        const resultado = await analizarCostosReales(carpetaId);
        setItems(resultado.items);
        setAdvertencias(resultado.advertencias);
        setFase("review");
      } catch (err) {
        toast({
          title: "Error al analizar",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  function handleChangeMatch(index: number, conceptoSimulado: string) {
    if (!items) return;
    const updated = [...items];
    if (conceptoSimulado === "__nuevo__") {
      updated[index] = { ...updated[index], concepto_simulado: null, monto_simulado_usd: null, es_nuevo: true };
    } else {
      updated[index] = { ...updated[index], concepto_simulado: conceptoSimulado, es_nuevo: false };
    }
    setItems(updated);
  }

  function handleConfirmar() {
    if (!items) return;
    startTransition(async () => {
      try {
        await guardarComparacion(carpetaId, items);
        setFase("done");
        toast({ title: "Comparación guardada" });
      } catch (err) {
        toast({
          title: "Error al guardar",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  const necesitaRevision = items?.filter(i => i.confidence < 0.85) ?? [];
  const autoConfirmados = items?.filter(i => i.confidence >= 0.85) ?? [];

  // Totales para la tabla final
  const totalReal = (items ?? []).reduce((a, i) => a + i.monto_real_usd, 0);
  const totalSimulado = (items ?? []).reduce((a, i) => a + (i.monto_simulado_usd ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Advertencias */}
      {advertencias.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          {advertencias.map((a, i) => (
            <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{a}
            </p>
          ))}
        </div>
      )}

      {fase === "idle" && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Esto se analiza solo cada vez que subís un documento (Proforma Invoice en la carpeta, o facturas/despacho en el contenedor). Si todavía no hay nada acá, faltan documentos — o podés forzar un análisis manual.
            </p>
            <Button onClick={handleAnalizar} disabled={isPending}>
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analizando con IA…</> : <><Sparkles className="h-4 w-4 mr-2" />Analizar costos reales</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {fase === "review" && items && (
        <div className="space-y-4">
          {necesitaRevision.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-amber-500" />
                  Necesitan confirmación ({necesitaRevision.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item, idx) => {
                  if (item.confidence >= 0.85) return null;
                  return (
                    <div key={idx} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.concepto_real}</p>
                          <p className="text-xs text-muted-foreground">{item.fuente} · {fmt(item.monto_real_usd)}</p>
                        </div>
                        <span className="text-xs text-amber-600 shrink-0">
                          {Math.round(item.confidence * 100)}% confianza
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">¿Corresponde a?</span>
                        <Select
                          value={item.concepto_simulado ?? "__nuevo__"}
                          onValueChange={(v) => handleChangeMatch(idx, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__nuevo__">✦ Costo nuevo (no estaba en simulación)</SelectItem>
                            {OPCIONES_SIMULACION.map(o => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {autoConfirmados.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Matches automáticos ({autoConfirmados.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {items.map((item, idx) => {
                    if (item.confidence < 0.85) return null;
                    return (
                      <div key={idx} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                        <span className="text-muted-foreground">{item.concepto_real}</span>
                        <span className="text-muted-foreground">→</span>
                        <span>{item.es_nuevo ? <em className="text-muted-foreground">Costo nuevo</em> : item.concepto_simulado}</span>
                        <span className="font-medium">{fmt(item.monto_real_usd)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button onClick={handleConfirmar} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar y guardar
            </Button>
            <Button variant="outline" onClick={handleAnalizar} disabled={isPending}>
              <RefreshCw className="h-4 w-4 mr-2" />Reanalizar
            </Button>
          </div>
        </div>
      )}

      {fase === "done" && items && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Comparación estimado vs. real</CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setFase("idle"); setItems(null); }}>
              <RefreshCw className="h-3 w-3 mr-1" />Reanalizar
            </Button>
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
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const d = diff(item.monto_real_usd, item.monto_simulado_usd);
                  return (
                    <tr key={idx} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        {item.es_nuevo
                          ? <span className="text-amber-600 font-medium">★ Costo nuevo</span>
                          : item.concepto_simulado}
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
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

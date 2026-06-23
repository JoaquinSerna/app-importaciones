"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCw, Tag } from "lucide-react";

import { actualizarNombresSkusDesdeDocumentos } from "@/app/(app)/carpetas/[id]/documentos/actions";
import { actualizarPagaDumping, recalcularCostosDesdeSkus } from "@/app/(app)/carpetas/[id]/skus-actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { criterioPorConcepto, prorratear } from "@/lib/prorrateo";
import type { NcmArancel, Sku } from "@/lib/types";

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

interface CostoSimple {
  concepto: string;
  monto_estimado_usd: number;
  monto_real_usd: number | null;
}

function esAntiDumping(concepto: string) {
  return /anti-?dumping/i.test(concepto);
}

interface DesgloseItem {
  concepto: string;
  estimado: number;
  real: number;
}

interface Props {
  carpetaId: string;
  skus: Sku[];
  ncms: NcmArancel[];
  costos: CostoSimple[];
}

export function SkusEditor({ carpetaId, skus, costos }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Cada línea de costo se prorratea entre SKUs según su base correcta:
  // FOB para impuestos/seguro/honorarios (% del valor de la mercadería),
  // CBM para flete/THC/etc. (escalan con el volumen). El anti-dumping es un
  // caso especial: solo se reparte (por FOB) entre los SKUs marcados como
  // "paga dumping" — nunca entre todos.
  const { estimadoPorSku, realPorSku, desglosePorSku } = useMemo(() => {
    const estimado = new Map<string, number>();
    const real = new Map<string, number>();
    const desglose = new Map<string, DesgloseItem[]>();
    skus.forEach((s) => { estimado.set(s.id, 0); real.set(s.id, 0); desglose.set(s.id, []); });

    for (const costo of costos) {
      const esDumping = esAntiDumping(costo.concepto);
      const skusObjetivo = esDumping ? skus.filter((s) => s.paga_dumping) : skus;
      if (skusObjetivo.length === 0) continue;

      const items = skusObjetivo.map((s) => ({
        id: s.id,
        cbm: s.cbm ?? 0,
        fob: (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0),
      }));
      const criterio = esDumping ? "fob" : criterioPorConcepto(costo.concepto);

      const asigEst = prorratear(costo.monto_estimado_usd, items, criterio);
      const asigReal = costo.monto_real_usd != null ? prorratear(costo.monto_real_usd, items, criterio) : [];

      for (const a of asigEst) {
        estimado.set(a.id, (estimado.get(a.id) ?? 0) + a.montoAsignado);
      }
      for (const a of asigReal) {
        real.set(a.id, (real.get(a.id) ?? 0) + a.montoAsignado);
      }

      const idsConMonto = new Set([...asigEst, ...asigReal].map((a) => a.id));
      for (const id of Array.from(idsConMonto)) {
        const est = asigEst.find((a) => a.id === id)?.montoAsignado ?? 0;
        const rea = asigReal.find((a) => a.id === id)?.montoAsignado ?? 0;
        if (est <= 0 && rea <= 0) continue;
        desglose.get(id)?.push({ concepto: costo.concepto, estimado: est, real: rea });
      }
    }
    return { estimadoPorSku: estimado, realPorSku: real, desglosePorSku: desglose };
  }, [skus, costos]);

  const hayReal = costos.some((c) => c.monto_real_usd != null);

  function toggleExpandido(skuId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  const ncmsDistintos = new Set(skus.map((s) => s.ncm_id).filter(Boolean)).size;

  function handleRecalcular() {
    startTransition(async () => {
      const resultado = await recalcularCostosDesdeSkus(carpetaId);
      if (resultado.error) {
        toast({ title: "No se pudo recalcular", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Costos recalculados con el NCM ponderado de los SKUs" });
    });
  }

  function handleTogglePagaDumping(sku: Sku) {
    startTransition(async () => {
      const resultado = await actualizarPagaDumping(carpetaId, sku.id, !sku.paga_dumping);
      if (resultado.error) {
        toast({ title: "No se pudo actualizar", description: resultado.error, variant: "destructive" });
      }
    });
  }

  function handleActualizarNombres() {
    startTransition(async () => {
      const resultado = await actualizarNombresSkusDesdeDocumentos(carpetaId);
      if (resultado.error) {
        toast({ title: "No se pudieron asignar nombres", description: resultado.error, variant: "destructive" });
        return;
      }
      if (!resultado.actualizados) {
        toast({ title: "Nada para actualizar", description: "Los nombres ya estaban asignados." });
        return;
      }
      toast({ title: `${resultado.actualizados} nombre(s) actualizados desde la Proforma/Packing List` });
    });
  }

  if (skus.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin SKUs cargados.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleActualizarNombres} disabled={isPending}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Tag className="h-3.5 w-3.5 mr-1" />}
          Actualizar nombres desde Proforma/Packing List
        </Button>
      </div>

      {ncmsDistintos > 1 && (
        <div className="rounded-md border bg-amber-50 border-amber-200 px-3 py-2 text-sm flex items-center justify-between gap-3">
          <span className="text-amber-800">
            Esta carpeta tiene {ncmsDistintos} NCM distintos entre sus SKUs. Recalculá los costos para usar el promedio ponderado por FOB.
          </span>
          <Button size="sm" variant="outline" onClick={handleRecalcular} disabled={isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Recalcular costos
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Costo por unidad (landed cost)</h3>
        <p className="text-xs text-muted-foreground">
          FOB unitario + costos de la carpeta prorrateados por FOB (impuestos, seguro, honorarios) o por CBM
          (flete, THC, etc.), divididos por la cantidad de cada SKU.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>SKU</TableHead>
              <TableHead className="text-center">Paga dumping</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">FOB unit.</TableHead>
              <TableHead className="text-right">Costo total (est.)</TableHead>
              {hayReal && <TableHead className="text-right">Costo total (real)</TableHead>}
              <TableHead className="text-right">Costo unitario (est.)</TableHead>
              {hayReal && <TableHead className="text-right">Costo unitario (real)</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skus.map((sku) => {
              const cantidad = sku.cantidad || 1;
              const asignadoEst = estimadoPorSku.get(sku.id) ?? 0;
              const asignadoReal = realPorSku.get(sku.id) ?? 0;
              const fobSku = sku.precio_unitario_fob_usd * cantidad;
              const totalEst = fobSku + asignadoEst;
              const totalReal = fobSku + asignadoReal;
              const unitarioEst = totalEst / cantidad;
              const unitarioReal = totalReal / cantidad;
              const desglose = desglosePorSku.get(sku.id) ?? [];
              const expandido = expandidos.has(sku.id);
              return (
                <Fragment key={sku.id}>
                  <TableRow>
                    <TableCell className="w-8">
                      {desglose.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleExpandido(sku.id)}>
                          {expandido ? "−" : "+"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>{sku.codigo_sku ?? sku.descripcion ?? "-"}</TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={sku.paga_dumping}
                        disabled={isPending}
                        onChange={() => handleTogglePagaDumping(sku)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell className="text-right">{sku.cantidad}</TableCell>
                    <TableCell className="text-right">{formatUsd(sku.precio_unitario_fob_usd)}</TableCell>
                    <TableCell className="text-right font-medium">{formatUsd(totalEst)}</TableCell>
                    {hayReal && <TableCell className="text-right font-medium">{formatUsd(totalReal)}</TableCell>}
                    <TableCell className="text-right font-medium">{formatUsd(unitarioEst)}</TableCell>
                    {hayReal && <TableCell className="text-right font-medium">{formatUsd(unitarioReal)}</TableCell>}
                  </TableRow>
                  {expandido && desglose.length > 0 && (
                    <TableRow className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={hayReal ? 8 : 6} className="py-2">
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between font-medium text-muted-foreground">
                            <span>Concepto</span>
                            <span className="flex gap-6">
                              <span className="w-20 text-right">Estimado</span>
                              {hayReal && <span className="w-20 text-right">Real</span>}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>FOB</span>
                            <span className="flex gap-6">
                              <span className="w-20 text-right">{formatUsd(fobSku)}</span>
                              {hayReal && <span className="w-20 text-right">{formatUsd(fobSku)}</span>}
                            </span>
                          </div>
                          {desglose.map((d, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{d.concepto}</span>
                              <span className="flex gap-6">
                                <span className="w-20 text-right">{d.estimado > 0 ? formatUsd(d.estimado) : "—"}</span>
                                {hayReal && <span className="w-20 text-right">{d.real > 0 ? formatUsd(d.real) : "—"}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

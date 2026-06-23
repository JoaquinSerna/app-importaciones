"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";

import {
  actualizarSku,
  agregarSku,
  eliminarSku,
  recalcularCostosDesdeSkus,
  type SkuInput,
} from "@/app/(app)/carpetas/[id]/skus-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function vacio(): SkuInput {
  return { codigoSku: "", descripcion: "", cantidad: 0, precioUnitarioFobUsd: 0, pesoKg: undefined, cbm: undefined, ncmId: null };
}

interface CostoSimple {
  concepto: string;
  monto_estimado_usd: number;
  monto_real_usd: number | null;
}

interface Props {
  carpetaId: string;
  skus: Sku[];
  ncms: NcmArancel[];
  costos: CostoSimple[];
}

export function SkusEditor({ carpetaId, skus, ncms, costos }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [nuevo, setNuevo] = useState<SkuInput>(vacio());
  const [mostrandoNuevo, setMostrandoNuevo] = useState(false);

  // Cada línea de costo se prorratea entre SKUs según su base correcta:
  // FOB para impuestos/seguro/honorarios (% del valor de la mercadería),
  // CBM para flete/THC/etc. (escalan con el volumen).
  const { estimadoPorSku, realPorSku } = useMemo(() => {
    const estimado = new Map<string, number>();
    const real = new Map<string, number>();
    skus.forEach((s) => { estimado.set(s.id, 0); real.set(s.id, 0); });

    const items = skus.map((s) => ({
      id: s.id,
      cbm: s.cbm ?? 0,
      fob: (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0),
    }));

    for (const costo of costos) {
      const criterio = criterioPorConcepto(costo.concepto);
      for (const a of prorratear(costo.monto_estimado_usd, items, criterio)) {
        estimado.set(a.id, (estimado.get(a.id) ?? 0) + a.montoAsignado);
      }
      if (costo.monto_real_usd != null) {
        for (const a of prorratear(costo.monto_real_usd, items, criterio)) {
          real.set(a.id, (real.get(a.id) ?? 0) + a.montoAsignado);
        }
      }
    }
    return { estimadoPorSku: estimado, realPorSku: real };
  }, [skus, costos]);

  const hayReal = costos.some((c) => c.monto_real_usd != null);

  const ncmsDistintos = new Set(skus.map((s) => s.ncm_id).filter(Boolean)).size;

  function handleAgregar() {
    if (!nuevo.cantidad || !nuevo.precioUnitarioFobUsd) {
      toast({ title: "Completá cantidad y precio FOB unitario", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const resultado = await agregarSku(carpetaId, nuevo);
      if (resultado.error) {
        toast({ title: "Error agregando SKU", description: resultado.error, variant: "destructive" });
        return;
      }
      setNuevo(vacio());
      setMostrandoNuevo(false);
      toast({ title: "SKU agregado" });
    });
  }

  function handleCambiarNcm(sku: Sku, ncmId: string) {
    startTransition(async () => {
      const resultado = await actualizarSku(carpetaId, sku.id, {
        codigoSku: sku.codigo_sku ?? undefined,
        descripcion: sku.descripcion ?? undefined,
        cantidad: sku.cantidad,
        precioUnitarioFobUsd: sku.precio_unitario_fob_usd,
        pesoKg: sku.peso_kg ?? undefined,
        cbm: sku.cbm ?? undefined,
        ncmId: ncmId === "__sin_ncm__" ? null : ncmId,
      });
      if (resultado.error) {
        toast({ title: "Error actualizando NCM", description: resultado.error, variant: "destructive" });
      }
    });
  }

  function handleEliminar(skuId: string) {
    startTransition(async () => {
      const resultado = await eliminarSku(carpetaId, skuId);
      if (resultado.error) {
        toast({ title: "Error eliminando SKU", description: resultado.error, variant: "destructive" });
      }
    });
  }

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

  return (
    <div className="space-y-3">
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Precio FOB unit.</TableHead>
            <TableHead className="text-right">CBM</TableHead>
            <TableHead>NCM</TableHead>
            <TableHead className="text-right">Costo prorrateado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.map((sku) => (
            <TableRow key={sku.id}>
              <TableCell>{sku.codigo_sku ?? "-"}</TableCell>
              <TableCell>{sku.descripcion ?? "-"}</TableCell>
              <TableCell className="text-right">{sku.cantidad}</TableCell>
              <TableCell className="text-right">{formatUsd(sku.precio_unitario_fob_usd)}</TableCell>
              <TableCell className="text-right">{sku.cbm ?? "-"}</TableCell>
              <TableCell>
                <Select value={sku.ncm_id ?? "__sin_ncm__"} onValueChange={(v) => handleCambiarNcm(sku, v)} disabled={isPending}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Sin NCM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__sin_ncm__">Sin NCM</SelectItem>
                    {ncms.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.codigo_ncm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">{formatUsd(estimadoPorSku.get(sku.id) ?? 0)}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => handleEliminar(sku.id)} disabled={isPending}>
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {skus.length === 0 && !mostrandoNuevo && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Sin SKUs cargados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {skus.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Costo por unidad (landed cost)</h3>
          <p className="text-xs text-muted-foreground">
            FOB unitario + costos de la carpeta prorrateados por FOB (impuestos, seguro, honorarios) o por CBM
            (flete, THC, etc.), divididos por la cantidad de cada SKU.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">FOB unit.</TableHead>
                <TableHead className="text-right">Costos asignados (est.)</TableHead>
                {hayReal && <TableHead className="text-right">Costos asignados (real)</TableHead>}
                <TableHead className="text-right">Costo unitario (est.)</TableHead>
                {hayReal && <TableHead className="text-right">Costo unitario (real)</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.map((sku) => {
                const cantidad = sku.cantidad || 1;
                const asignadoEst = estimadoPorSku.get(sku.id) ?? 0;
                const asignadoReal = realPorSku.get(sku.id) ?? 0;
                const unitarioEst = sku.precio_unitario_fob_usd + asignadoEst / cantidad;
                const unitarioReal = sku.precio_unitario_fob_usd + asignadoReal / cantidad;
                return (
                  <TableRow key={sku.id}>
                    <TableCell>{sku.codigo_sku ?? sku.descripcion ?? "-"}</TableCell>
                    <TableCell className="text-right">{sku.cantidad}</TableCell>
                    <TableCell className="text-right">{formatUsd(sku.precio_unitario_fob_usd)}</TableCell>
                    <TableCell className="text-right">{formatUsd(asignadoEst)}</TableCell>
                    {hayReal && <TableCell className="text-right">{formatUsd(asignadoReal)}</TableCell>}
                    <TableCell className="text-right font-medium">{formatUsd(unitarioEst)}</TableCell>
                    {hayReal && <TableCell className="text-right font-medium">{formatUsd(unitarioReal)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {mostrandoNuevo ? (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              placeholder="Código SKU"
              value={nuevo.codigoSku}
              onChange={(e) => setNuevo({ ...nuevo, codigoSku: e.target.value })}
            />
            <Input
              placeholder="Descripción"
              className="sm:col-span-2"
              value={nuevo.descripcion}
              onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
            />
            <Select
              value={nuevo.ncmId ?? "__sin_ncm__"}
              onValueChange={(v) => setNuevo({ ...nuevo, ncmId: v === "__sin_ncm__" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="NCM" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__sin_ncm__">Sin NCM</SelectItem>
                {ncms.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.codigo_ncm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              type="number" min="0" step="1" placeholder="Cantidad"
              value={nuevo.cantidad || ""}
              onChange={(e) => setNuevo({ ...nuevo, cantidad: Number(e.target.value) || 0 })}
            />
            <Input
              type="number" min="0" step="0.01" placeholder="Precio FOB unit. (USD)"
              value={nuevo.precioUnitarioFobUsd || ""}
              onChange={(e) => setNuevo({ ...nuevo, precioUnitarioFobUsd: Number(e.target.value) || 0 })}
            />
            <Input
              type="number" min="0" step="0.01" placeholder="Peso (kg)"
              value={nuevo.pesoKg ?? ""}
              onChange={(e) => setNuevo({ ...nuevo, pesoKg: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input
              type="number" min="0" step="0.01" placeholder="CBM"
              value={nuevo.cbm ?? ""}
              onChange={(e) => setNuevo({ ...nuevo, cbm: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAgregar} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Guardar SKU
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setMostrandoNuevo(false); setNuevo(vacio()); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setMostrandoNuevo(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agregar SKU
        </Button>
      )}
    </div>
  );
}

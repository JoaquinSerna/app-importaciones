"use client";

import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prorratear } from "@/lib/prorrateo";
import type { Sku } from "@/lib/types";

interface SkusTableProps {
  skus: Sku[];
  /** Costos totales de la carpeta a prorratear entre los SKUs por CBM. */
  totalCostosUsd: number;
}

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function SkusTable({ skus, totalCostosUsd }: SkusTableProps) {
  const prorrateo = useMemo(() => {
    const items = skus.map((s) => ({ id: s.id, cbm: s.cbm ?? 0 }));
    const asignaciones = prorratear(totalCostosUsd, items, "cbm");
    const map = new Map(asignaciones.map((a) => [a.id, a.montoAsignado]));
    return map;
  }, [skus, totalCostosUsd]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Precio FOB unit.</TableHead>
          <TableHead className="text-right">CBM</TableHead>
          <TableHead className="text-right">Costo prorrateado (CBM)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skus.map((sku) => (
          <TableRow key={sku.id}>
            <TableCell>{sku.codigo_sku}</TableCell>
            <TableCell>{sku.descripcion}</TableCell>
            <TableCell className="text-right">{sku.cantidad}</TableCell>
            <TableCell className="text-right">{formatUsd(sku.precio_unitario_fob_usd)}</TableCell>
            <TableCell className="text-right">{sku.cbm ?? "-"}</TableCell>
            <TableCell className="text-right">{formatUsd(prorrateo.get(sku.id) ?? 0)}</TableCell>
          </TableRow>
        ))}
        {skus.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              Sin SKUs cargados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

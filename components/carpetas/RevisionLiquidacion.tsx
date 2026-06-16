"use client";

import { useMemo, useState, useTransition } from "react";

import { confirmarActualizacionCostos } from "@/app/carpetas/[id]/documentos/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { matchearCostosConLiquidacion } from "@/lib/matching-liquidacion";
import type { Costo, LiquidacionExtraida } from "@/lib/types";

function formatUsd(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

interface RevisionLiquidacionProps {
  carpetaId: string;
  costos: Costo[];
  liquidacion: LiquidacionExtraida;
  onConfirmado?: () => void;
}

export function RevisionLiquidacion({
  carpetaId,
  costos,
  liquidacion,
  onConfirmado,
}: RevisionLiquidacionProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmado, setConfirmado] = useState(false);

  const matches = useMemo(
    () => matchearCostosConLiquidacion(costos, liquidacion.conceptos),
    [costos, liquidacion.conceptos]
  );

  const matcheados = matches.filter((m) => m.matcheado && m.concepto?.monto_usd !== null);

  function handleConfirmar() {
    startTransition(async () => {
      try {
        await confirmarActualizacionCostos(
          carpetaId,
          matcheados.map((m) => ({
            costoId: m.costo.id,
            montoRealUsd: m.concepto!.monto_usd as number,
            tcAplicado: liquidacion.tc_utilizado ?? undefined,
          }))
        );
        setConfirmado(true);
        toast({ title: "Costos actualizados", description: `${matcheados.length} costo(s) actualizado(s).` });
        onConfirmado?.();
      } catch (err) {
        toast({
          title: "Error actualizando costos",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revisión de liquidación extraída</CardTitle>
        <p className="text-sm text-muted-foreground">
          Despacho: {liquidacion.numero_despacho ?? "no detectado"} · TC utilizado:{" "}
          {liquidacion.tc_utilizado ?? "no detectado"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Costo estimado (carpeta)</TableHead>
              <TableHead className="text-right">Estimado USD</TableHead>
              <TableHead>Concepto extraído del PDF</TableHead>
              <TableHead className="text-right">Monto USD</TableHead>
              <TableHead className="text-right">Monto ARS</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((m) => (
              <TableRow key={m.costo.id}>
                <TableCell>{m.costo.concepto}</TableCell>
                <TableCell className="text-right">{formatUsd(m.costo.monto_estimado_usd)}</TableCell>
                <TableCell>{m.concepto?.concepto ?? "-"}</TableCell>
                <TableCell className="text-right">{formatUsd(m.concepto?.monto_usd ?? null)}</TableCell>
                <TableCell className="text-right">{formatUsd(m.concepto?.monto_ars ?? null)}</TableCell>
                <TableCell>
                  {m.matcheado ? (
                    <Badge variant="secondary">Coincidencia</Badge>
                  ) : (
                    <Badge variant="destructive">Revisión manual</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {matches.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin costos estimados para comparar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {liquidacion.conceptos.length > matches.filter((m) => m.matcheado).length && (
          <p className="text-sm text-muted-foreground">
            Hay conceptos del PDF que no se asignaron a ningún costo estimado; revisalos manualmente si
            corresponde agregarlos como costo nuevo.
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={handleConfirmar} disabled={isPending || confirmado || matcheados.length === 0}>
            {confirmado
              ? "Costos actualizados"
              : isPending
                ? "Actualizando..."
                : `Confirmar y actualizar costos reales (${matcheados.length})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

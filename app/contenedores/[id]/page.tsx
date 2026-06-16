import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prorratearCostosContenedor } from "@/lib/prorrateo";
import { createClient } from "@/lib/supabase/server";
import type { Carpeta, Contenedor, Costo, CriterioProrrateo } from "@/lib/types";

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatFecha(fecha: string | null) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-AR");
}

export default async function ContenedorDetallePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: contenedor } = await supabase
    .from("contenedores")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!contenedor) {
    notFound();
  }

  const contenedorTyped = contenedor as Contenedor;

  const [{ data: carpetas }, { data: costosContenedor }, { data: criterios }] = await Promise.all([
    supabase
      .from("carpetas")
      .select("*, proveedores(nombre)")
      .eq("contenedor_id", params.id),
    supabase.from("costos").select("*").eq("nivel", "contenedor").eq("contenedor_id", params.id),
    supabase.from("criterios_prorrateo").select("*").eq("contenedor_id", params.id),
  ]);

  const carpetasList = (carpetas ?? []) as (Carpeta & { proveedores?: { nombre: string } | null })[];
  const costosList = (costosContenedor ?? []) as Costo[];
  const criteriosList = (criterios ?? []) as CriterioProrrateo[];

  const esLcl = contenedorTyped.tipo === "LCL";

  // Mapear criterio configurado por costo (default 'cbm' si no hay registro explícito).
  const criterioPorCosto = new Map(criteriosList.map((c) => [c.costo_id, c.criterio]));

  const carpetasParaProrrateo = carpetasList.map((c) => ({
    id: c.id,
    cbm: c.cbm_total ?? 0,
    peso: c.peso_total_kg ?? 0,
    fob: c.fob_total_usd ?? 0,
  }));

  const costosParaProrrateo = costosList.map((c) => ({
    id: c.id,
    monto_estimado_usd: c.monto_estimado_usd,
    criterio: criterioPorCosto.get(c.id) ?? "cbm",
  }));

  const asignaciones = prorratearCostosContenedor(costosParaProrrateo, carpetasParaProrrateo);

  const totalAsignadoPorCarpeta = new Map<string, number>();
  for (const asignacion of asignaciones) {
    totalAsignadoPorCarpeta.set(
      asignacion.carpetaId,
      (totalAsignadoPorCarpeta.get(asignacion.carpetaId) ?? 0) + asignacion.montoAsignado
    );
  }

  const totalCostosContenedor = costosList.reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  const cbmTotalContenedor = carpetasList.reduce((acc, c) => acc + (c.cbm_total ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{contenedorTyped.numero_contenedor ?? "(sin número)"}</h1>
          <p className="text-muted-foreground">
            {contenedorTyped.naviera ?? "Sin naviera"} · BL {contenedorTyped.bl_number ?? "-"}
          </p>
        </div>
        <Badge variant="secondary">{contenedorTyped.tipo}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estado consolidado</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {contenedorTyped.estado_contenedor ?? "-"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Zarpe</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatFecha(contenedorTyped.fecha_zarpe)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ETA</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatFecha(contenedorTyped.eta_contenedor)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CBM total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{cbmTotalContenedor.toFixed(2)}</CardContent>
        </Card>
      </div>

      {esLcl && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800">
            Este contenedor es LCL (carga consolidada): el prorrateo de costos a nivel contenedor se
            calcula automáticamente por definición, ya que cada carpeta ocupa una fracción del
            contenedor proporcional a su CBM.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carpetas asignadas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carpeta</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">FOB</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">Peso (kg)</TableHead>
                <TableHead className="text-right">Costos contenedor prorrateados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carpetasList.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/carpetas/${c.id}`} className="font-medium hover:underline">
                      {c.numero_carpeta}
                    </Link>
                  </TableCell>
                  <TableCell>{c.proveedores?.nombre ?? "-"}</TableCell>
                  <TableCell className="text-right">{formatUsd(c.fob_total_usd)}</TableCell>
                  <TableCell className="text-right">{(c.cbm_total ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{(c.peso_total_kg ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    {formatUsd(totalAsignadoPorCarpeta.get(c.id) ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
              {carpetasList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Sin carpetas asignadas a este contenedor.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costos a nivel contenedor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Criterio prorrateo</TableHead>
                <TableHead className="text-right">Monto estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costosList.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.concepto}</TableCell>
                  <TableCell className="capitalize">{c.categoria}</TableCell>
                  <TableCell className="capitalize">{criterioPorCosto.get(c.id) ?? "cbm"}</TableCell>
                  <TableCell className="text-right">{formatUsd(c.monto_estimado_usd)}</TableCell>
                </TableRow>
              ))}
              {costosList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin costos a nivel contenedor.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-end p-4 text-sm font-medium">
            Total costos contenedor: {formatUsd(totalCostosContenedor)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

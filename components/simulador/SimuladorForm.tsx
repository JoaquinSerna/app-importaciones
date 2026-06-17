"use client";

import { useMemo, useState, useTransition } from "react";

import { crearCarpetaDesdeSimulacion } from "@/app/(app)/carpetas/nueva/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { calcularCascada } from "@/lib/calculadora-costos";
import type { NcmArancel, ParametrosGlobales, TipoContenedor } from "@/lib/types";

interface SimuladorFormProps {
  parametros: ParametrosGlobales | null;
  proveedores: { id: string; nombre: string }[];
  ncms: NcmArancel[];
}

const MODALIDADES: TipoContenedor[] = ["FCL_20", "FCL_40", "FCL_40HC", "LCL", "AEREO"];

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatArs(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

export function SimuladorForm({ parametros, proveedores, ncms }: SimuladorFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [proveedorId, setProveedorId] = useState<string>("");
  const [fobTotalUsd, setFobTotalUsd] = useState<string>("");
  const [cbmTotal, setCbmTotal] = useState<string>("");
  const [pesoTotalKg, setPesoTotalKg] = useState<string>("");
  const [ncmId, setNcmId] = useState<string>("");
  const [modalidad, setModalidad] = useState<TipoContenedor>("FCL_40");
  const [fleteManual, setFleteManual] = useState<string>("");

  const ncmSeleccionado = useMemo(
    () => ncms.find((n) => n.id === ncmId) ?? null,
    [ncms, ncmId]
  );

  const resultado = useMemo(() => {
    if (!parametros) return null;
    const fob = parseFloat(fobTotalUsd);
    if (Number.isNaN(fob) || fob <= 0) return null;
    if (!ncmSeleccionado) return null;

    return calcularCascada(parametros, {
      fobTotalUsd: fob,
      cbmTotal: cbmTotal ? parseFloat(cbmTotal) : undefined,
      pesoTotalKg: pesoTotalKg ? parseFloat(pesoTotalKg) : undefined,
      ncm: ncmSeleccionado.codigo_ncm,
      fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
      ncmArancel: ncmSeleccionado,
    });
  }, [parametros, fobTotalUsd, cbmTotal, pesoTotalKg, ncmSeleccionado, fleteManual]);

  if (!parametros) {
    return (
      <p className="text-sm text-destructive">
        No hay parámetros globales configurados. Cargá parámetros antes de simular.
      </p>
    );
  }

  function handleSubmit() {
    const fob = parseFloat(fobTotalUsd);
    if (Number.isNaN(fob) || fob <= 0) {
      toast({ title: "FOB inválido", description: "Ingresá un valor de FOB total mayor a 0." });
      return;
    }
    if (!ncmSeleccionado) {
      toast({ title: "NCM requerido", description: "Seleccioná una posición arancelaria." });
      return;
    }

    startTransition(async () => {
      try {
        await crearCarpetaDesdeSimulacion({
          proveedorId: proveedorId || undefined,
          fobTotalUsd: fob,
          cbmTotal: cbmTotal ? parseFloat(cbmTotal) : undefined,
          pesoTotalKg: pesoTotalKg ? parseFloat(pesoTotalKg) : undefined,
          ncm: ncmSeleccionado.codigo_ncm,
          ncmId: ncmSeleccionado.id,
          ncmArancel: ncmSeleccionado,
          modalidad,
          fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
        });
      } catch (err) {
        toast({
          title: "Error creando la carpeta",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la simulación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proveedor">Proveedor</Label>
            <Select value={proveedorId} onValueChange={setProveedorId}>
              <SelectTrigger id="proveedor">
                <SelectValue placeholder="Seleccioná un proveedor (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fob">FOB total (USD)</Label>
              <Input
                id="fob"
                type="number"
                min="0"
                step="0.01"
                value={fobTotalUsd}
                onChange={(e) => setFobTotalUsd(e.target.value)}
                placeholder="10000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modalidad">Modalidad</Label>
              <Select value={modalidad} onValueChange={(v) => setModalidad(v as TipoContenedor)}>
                <SelectTrigger id="modalidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cbm">CBM total</Label>
              <Input
                id="cbm"
                type="number"
                min="0"
                step="0.01"
                value={cbmTotal}
                onChange={(e) => setCbmTotal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peso">Peso total (kg)</Label>
              <Input
                id="peso"
                type="number"
                min="0"
                step="0.01"
                value={pesoTotalKg}
                onChange={(e) => setPesoTotalKg(e.target.value)}
              />
            </div>
          </div>

          {/* NCM select — requerido */}
          <div className="space-y-2">
            <Label htmlFor="ncm">Posición arancelaria (NCM) *</Label>
            <Select value={ncmId} onValueChange={setNcmId}>
              <SelectTrigger id="ncm">
                <SelectValue placeholder="Seleccioná un NCM" />
              </SelectTrigger>
              <SelectContent>
                {ncms.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.codigo_ncm}{n.descripcion ? ` — ${n.descripcion}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ncms.length === 0 && (
              <p className="text-xs text-destructive">
                No hay NCMs cargados. Agregá posiciones arancelarias en la sección NCMs.
              </p>
            )}
          </div>

          {/* Aranceles del NCM seleccionado — readonly */}
          {ncmSeleccionado && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Aranceles del NCM seleccionado
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Derecho importación:</span>
                <span>{ncmSeleccionado.derecho_importacion_pct}%</span>
                <span className="text-muted-foreground">IVA:</span>
                <span>{ncmSeleccionado.iva_pct}%</span>
                {ncmSeleccionado.aplica_iva_adicional && (
                  <>
                    <span className="text-muted-foreground">IVA adicional:</span>
                    <span>{ncmSeleccionado.iva_adicional_pct}%</span>
                  </>
                )}
                {ncmSeleccionado.aplica_anticipo_ganancias && (
                  <>
                    <span className="text-muted-foreground">Anticipo ganancias:</span>
                    <span>{ncmSeleccionado.anticipo_ganancias_pct}%</span>
                  </>
                )}
                {ncmSeleccionado.aplica_iibb && (
                  <>
                    <span className="text-muted-foreground">IIBB:</span>
                    <span>{ncmSeleccionado.iibb_pct}%</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="flete">Flete manual (USD, opcional)</Label>
            <Input
              id="flete"
              type="number"
              min="0"
              step="0.01"
              value={fleteManual}
              onChange={(e) => setFleteManual(e.target.value)}
              placeholder="Dejar vacío para usar parámetros"
            />
          </div>

          <Button onClick={handleSubmit} disabled={isPending || !resultado} className="w-full">
            {isPending ? "Creando carpeta..." : "Crear Carpeta desde Simulación"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cascada de costos estimada</CardTitle>
        </CardHeader>
        <CardContent>
          {!resultado ? (
            <p className="text-sm text-muted-foreground">
              Ingresá el FOB total y seleccioná un NCM para ver el cálculo.
            </p>
          ) : (
            <dl className="space-y-2 text-sm">
              <Fila label="FOB" valor={resultado.fob} />
              <Fila label="Flete" valor={resultado.flete} />
              <Fila label="Seguro" valor={resultado.seguro} />
              <Fila label="CIF" valor={resultado.cif} destacado />
              <Fila label="Derechos de importación" valor={resultado.derechosImportacion} />
              <Fila label="Tasa estadística" valor={resultado.tasaEstadistica} />
              <Fila label="Base imponible IVA" valor={resultado.baseImponibleIva} destacado />
              <Fila label="IVA" valor={resultado.iva} />
              <Fila label="IVA adicional" valor={resultado.ivaAdicional} />
              <Fila label="Anticipo ganancias" valor={resultado.anticipoGanancias} />
              <Fila label="IIBB" valor={resultado.iibb} />
              <Fila label="Honorarios despachante" valor={resultado.honorariosDespachante} />
              <Fila label="Gastos bancarios" valor={resultado.gastosBancarios} />
              <hr className="my-2" />
              <Fila label="Total costos (USD)" valor={resultado.totalCostosUsd} destacado />
              <Fila label="Costo total (USD)" valor={resultado.costoTotalUsd} destacado />
              <div className="flex justify-between pt-2 text-muted-foreground">
                <span>Costo total (ARS)</span>
                <span>{formatArs(resultado.costoTotalArs)}</span>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fila({ label, valor, destacado }: { label: string; valor: number; destacado?: boolean }) {
  return (
    <div className={`flex justify-between ${destacado ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{formatUsd(valor)}</span>
    </div>
  );
}

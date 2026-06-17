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
import type { ParametrosGlobales, TipoContenedor } from "@/lib/types";

interface SimuladorFormProps {
  parametros: ParametrosGlobales | null;
  proveedores: { id: string; nombre: string }[];
}

const MODALIDADES: TipoContenedor[] = ["FCL_20", "FCL_40", "FCL_40HC", "LCL", "AEREO"];

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatArs(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

export function SimuladorForm({ parametros, proveedores }: SimuladorFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [proveedorId, setProveedorId] = useState<string>("");
  const [fobTotalUsd, setFobTotalUsd] = useState<string>("");
  const [cbmTotal, setCbmTotal] = useState<string>("");
  const [pesoTotalKg, setPesoTotalKg] = useState<string>("");
  const [ncm, setNcm] = useState<string>("");
  const [modalidad, setModalidad] = useState<TipoContenedor>("FCL_40");
  const [fleteManual, setFleteManual] = useState<string>("");
  const [ivaReducido, setIvaReducido] = useState(false);

  const resultado = useMemo(() => {
    if (!parametros) return null;
    const fob = parseFloat(fobTotalUsd);
    if (Number.isNaN(fob) || fob <= 0) return null;

    return calcularCascada(parametros, {
      fobTotalUsd: fob,
      cbmTotal: cbmTotal ? parseFloat(cbmTotal) : undefined,
      pesoTotalKg: pesoTotalKg ? parseFloat(pesoTotalKg) : undefined,
      ncm: ncm || undefined,
      fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
      ivaReducido,
    });
  }, [parametros, fobTotalUsd, cbmTotal, pesoTotalKg, ncm, fleteManual, ivaReducido]);

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

    startTransition(async () => {
      try {
        await crearCarpetaDesdeSimulacion({
          proveedorId: proveedorId || undefined,
          fobTotalUsd: fob,
          cbmTotal: cbmTotal ? parseFloat(cbmTotal) : undefined,
          pesoTotalKg: pesoTotalKg ? parseFloat(pesoTotalKg) : undefined,
          ncm: ncm || undefined,
          modalidad,
          fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
          ivaReducido,
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ncm">NCM</Label>
              <Input id="ncm" value={ncm} onChange={(e) => setNcm(e.target.value)} placeholder="8471.30.19" />
            </div>
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
          </div>

          <div className="flex items-center gap-2">
            <input
              id="iva-reducido"
              type="checkbox"
              checked={ivaReducido}
              onChange={(e) => setIvaReducido(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="iva-reducido">Aplicar IVA reducido (10,5%)</Label>
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
            <p className="text-sm text-muted-foreground">Ingresá el FOB total para ver el cálculo.</p>
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

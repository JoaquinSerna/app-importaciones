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

const MODALIDADES: { value: TipoContenedor; label: string }[] = [
  { value: "40HQ", label: "40HQ" },
  { value: "20HQ", label: "20HQ" },
  { value: "AEREO", label: "Aéreo" },
];

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
  const [modalidad, setModalidad] = useState<TipoContenedor>("40HQ");
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
      tipoContenedor: modalidad,
      ncm: ncmSeleccionado.codigo_ncm,
      fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
      ncmArancel: ncmSeleccionado,
    });
  }, [parametros, fobTotalUsd, cbmTotal, pesoTotalKg, modalidad, ncmSeleccionado, fleteManual]);

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
      {/* Formulario de entrada */}
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
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
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

          {resultado && (
            <p className="text-xs text-muted-foreground">
              Cantidad de contenedores estimada:{" "}
              <span className="font-medium text-foreground">{resultado.cantContenedores}</span>
              {" "}(basado en CBM/peso y tipo {modalidad})
            </p>
          )}

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
                {ncmSeleccionado.aplica_tasa_estadistica && (
                  <>
                    <span className="text-muted-foreground">Tasa estadística:</span>
                    <span>{ncmSeleccionado.tasa_estadistica_pct}%</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="flete">Flete internacional manual (USD, opcional)</Label>
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

      {/* Cascada de costos */}
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
            <dl className="space-y-1 text-sm">
              <Seccion label="Valor internacional" />
              <Fila label="FOB" valor={resultado.fob} />
              <Fila label="Flete internacional" valor={resultado.fleteInternacional} indent />
              <Fila label="Peak Season" valor={resultado.peakSeason} indent />
              <Fila label="Seguro" valor={resultado.seguro} indent />
              <Fila label="CIF" valor={resultado.cif} destacado />

              <div className="pt-2" />
              <Seccion label="Impuestos aduaneros" />
              <Fila label="Derechos de importación" valor={resultado.derechosImportacion} indent />
              <Fila label="Tasa estadística" valor={resultado.tasaEstadistica} indent />
              <Fila label="Base imponible IVA" valor={resultado.baseImponibleIva} destacado />
              <Fila label="IVA" valor={resultado.iva} indent />
              <Fila label="IVA adicional" valor={resultado.ivaAdicional} indent />
              <Fila label="Anticipo ganancias" valor={resultado.anticipoGanancias} indent />
              <Fila label="IIBB" valor={resultado.iibb} indent />
              <Fila label="Subtotal impuestos" valor={resultado.subtotalImpuestosUsd} destacado />

              <div className="pt-2" />
              <Seccion label="Gastos locales" />
              <Fila label="THC" valor={resultado.thc} indent />
              <Fila label="Flete local" valor={resultado.fleteLocal} indent />
              <Fila label="TOLL Importación" valor={resultado.tollImportacion} indent />
              <Fila
                label={`Depósito fiscal (× ${resultado.cantContenedores} cont.)`}
                valor={resultado.depositoFiscal}
                indent
              />
              <Fila label="Digitalización de despacho" valor={resultado.digitalizacionDespacho} indent />
              <Fila label="Gastos operativos" valor={resultado.gastosOperativos} indent />
              <Fila label="Tramitaciones" valor={resultado.tramitaciones} indent />
              <Fila label="Honorarios despachante" valor={resultado.honorariosDespachante} indent />
              <Fila label="Gastos bancarios" valor={resultado.gastosBancarios} indent />
              <Fila label="Subtotal gastos locales" valor={resultado.subtotalGastosLocalesUsd} destacado />

              <div className="border-t my-3" />
              <Fila label="Total costos (USD)" valor={resultado.totalCostosUsd} destacado />
              <Fila label="Costo total (USD)" valor={resultado.costoTotalUsd} destacado />
              <div className="flex justify-between pt-1 text-muted-foreground">
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

function Seccion({ label }: { label: string }) {
  return (
    <div className="pt-1 pb-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function Fila({
  label,
  valor,
  destacado,
  indent,
}: {
  label: string;
  valor: number;
  destacado?: boolean;
  indent?: boolean;
}) {
  if (valor === 0 && !destacado) return null;
  return (
    <div
      className={`flex justify-between ${destacado ? "font-semibold" : "text-muted-foreground"} ${indent ? "pl-3" : ""}`}
    >
      <span className={destacado ? "text-foreground" : ""}>{label}</span>
      <span className={destacado ? "text-foreground" : ""}>{formatUsd(valor)}</span>
    </div>
  );
}

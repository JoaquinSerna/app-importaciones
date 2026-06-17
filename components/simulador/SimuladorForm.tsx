"use client";

import { useState, useTransition } from "react";

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
import { calcularCascada, calcularFactorContenedor, type ResultadoCascada } from "@/lib/calculadora-costos";
import type { NcmArancel, ParametrosGlobales, TipoContenedor } from "@/lib/types";

const MODALIDADES: { value: TipoContenedor; label: string }[] = [
  { value: "40HQ", label: "40HQ" },
  { value: "20HQ", label: "20HQ" },
  { value: "AEREO", label: "Aéreo" },
];

function usd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function ars(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function pct(n: number) {
  return `${n % 1 === 0 ? n : n.toFixed(2)}%`;
}
function fmtFactor(f: number) {
  return f % 1 === 0 ? String(f) : f.toFixed(2);
}

export function SimuladorForm({
  parametros,
  proveedores,
  ncms,
}: {
  parametros: ParametrosGlobales | null;
  proveedores: { id: string; nombre: string }[];
  ncms: NcmArancel[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [proveedorId, setProveedorId] = useState("");
  const [fobInput, setFobInput] = useState("");
  const [cbmInput, setCbmInput] = useState("");
  const [pesoInput, setPesoInput] = useState("");
  const [ncmId, setNcmId] = useState("");
  const [modalidad, setModalidad] = useState<TipoContenedor>("40HQ");
  const [fleteManual, setFleteManual] = useState("");
  const [contenedorLleno, setContenedorLleno] = useState(true);

  const [resultado, setResultado] = useState<ResultadoCascada | null>(null);
  const [ncmSimulado, setNcmSimulado] = useState<NcmArancel | null>(null);
  const [dirty, setDirty] = useState(false);

  const ncmSeleccionado = ncms.find((n) => n.id === ncmId) ?? null;

  // Sugerencia de contenedores en tiempo real (sin necesidad de simular)
  const cbm = cbmInput ? parseFloat(cbmInput) : undefined;
  const peso = pesoInput ? parseFloat(pesoInput) : undefined;
  const factorLive = (cbm || peso)
    ? calcularFactorContenedor(cbm, peso, modalidad, contenedorLleno)
    : null;

  function handleSimular() {
    if (!parametros) return;
    const fob = parseFloat(fobInput);
    if (Number.isNaN(fob) || fob <= 0) {
      toast({ title: "FOB inválido", description: "Ingresá un valor mayor a 0." });
      return;
    }
    if (!ncmSeleccionado) {
      toast({ title: "NCM requerido", description: "Seleccioná una posición arancelaria." });
      return;
    }
    const r = calcularCascada(parametros, {
      fobTotalUsd: fob,
      cbmTotal: cbm,
      pesoTotalKg: peso,
      tipoContenedor: modalidad,
      contenedorLleno,
      ncm: ncmSeleccionado.codigo_ncm,
      fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
      ncmArancel: ncmSeleccionado,
    });
    setResultado(r);
    setNcmSimulado(ncmSeleccionado);
    setDirty(false);
  }

  function handleCrearCarpeta() {
    if (!parametros || !resultado || !ncmSeleccionado) return;
    startTransition(async () => {
      try {
        await crearCarpetaDesdeSimulacion({
          proveedorId: proveedorId || undefined,
          fobTotalUsd: parseFloat(fobInput),
          cbmTotal: cbm,
          pesoTotalKg: peso,
          ncm: ncmSeleccionado.codigo_ncm,
          ncmId: ncmSeleccionado.id,
          ncmArancel: ncmSeleccionado,
          modalidad,
          fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
        });
      } catch (err) {
        toast({ title: "Error creando la carpeta", description: err instanceof Error ? err.message : "Error desconocido" });
      }
    });
  }

  if (!parametros) {
    return <p className="text-sm text-destructive">No hay parámetros globales configurados.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Formulario */}
      <Card>
        <CardHeader><CardTitle>Datos de la simulación</CardTitle></CardHeader>
        <CardContent className="space-y-4">

          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Select value={proveedorId} onValueChange={(v) => { setProveedorId(v); setDirty(true); }}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>FOB total (USD) *</Label>
              <Input type="number" min="0" step="0.01" value={fobInput}
                onChange={(e) => { setFobInput(e.target.value); setDirty(true); }} placeholder="10000" />
            </div>
            <div className="space-y-2">
              <Label>Modalidad *</Label>
              <Select value={modalidad} onValueChange={(v) => { setModalidad(v as TipoContenedor); setDirty(true); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CBM total</Label>
              <Input type="number" min="0" step="0.01" value={cbmInput}
                onChange={(e) => { setCbmInput(e.target.value); setDirty(true); }} />
            </div>
            <div className="space-y-2">
              <Label>Peso total (kg)</Label>
              <Input type="number" min="0" step="0.01" value={pesoInput}
                onChange={(e) => { setPesoInput(e.target.value); setDirty(true); }} />
            </div>
          </div>

          {/* Sugerencia de contenedores en tiempo real */}
          {factorLive !== null && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span>
                  Ocupación estimada:{" "}
                  <strong>{fmtFactor(factorLive)} contenedor{factorLive !== 1 ? "es" : ""}</strong>
                  {modalidad !== "AEREO" && factorLive % 1 !== 0 && (
                    <span className="text-muted-foreground ml-1">
                      ({(factorLive % 1 * 100).toFixed(0)}% de un {modalidad})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={contenedorLleno ? "default" : "outline"}
                  onClick={() => { setContenedorLleno(true); setDirty(true); }}
                  className="flex-1 text-xs"
                >
                  Contenedor lleno
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!contenedorLleno ? "default" : "outline"}
                  onClick={() => { setContenedorLleno(false); setDirty(true); }}
                  className="flex-1 text-xs"
                >
                  Proporcional (LCL)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {contenedorLleno
                  ? "Se cobra el contenedor completo aunque no esté lleno."
                  : "Los costos variables se calculan proporcionalmente a la ocupación real."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Posición arancelaria (NCM) *</Label>
            <Select value={ncmId} onValueChange={(v) => { setNcmId(v); setDirty(true); }}>
              <SelectTrigger><SelectValue placeholder="Seleccioná un NCM" /></SelectTrigger>
              <SelectContent>
                {ncms.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.codigo_ncm}{n.descripcion ? ` — ${n.descripcion}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ncms.length === 0 && <p className="text-xs text-destructive">No hay NCMs cargados.</p>}
          </div>

          {ncmSeleccionado && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
              <p className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Aranceles del NCM</p>
              <span className="text-muted-foreground">Derecho:</span><span>{pct(ncmSeleccionado.derecho_importacion_pct)}</span>
              <span className="text-muted-foreground">IVA:</span><span>{pct(ncmSeleccionado.iva_pct)}</span>
              {ncmSeleccionado.aplica_iva_adicional && <><span className="text-muted-foreground">IVA adicional:</span><span>{pct(ncmSeleccionado.iva_adicional_pct)}</span></>}
              {ncmSeleccionado.aplica_anticipo_ganancias && <><span className="text-muted-foreground">Ganancias:</span><span>{pct(ncmSeleccionado.anticipo_ganancias_pct)}</span></>}
              {ncmSeleccionado.aplica_iibb && <><span className="text-muted-foreground">IIBB:</span><span>{pct(ncmSeleccionado.iibb_pct)}</span></>}
              {ncmSeleccionado.aplica_tasa_estadistica && <><span className="text-muted-foreground">Tasa estadística:</span><span>{pct(ncmSeleccionado.tasa_estadistica_pct)}</span></>}
            </div>
          )}

          <div className="space-y-2">
            <Label>Flete internacional manual (USD)</Label>
            <Input type="number" min="0" step="0.01" value={fleteManual}
              onChange={(e) => { setFleteManual(e.target.value); setDirty(true); }}
              placeholder="Vacío = usar parámetros × factor contenedores" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSimular} className="flex-1">
              {dirty || !resultado ? "Simular" : "✓ Simulado"}
            </Button>
            <Button onClick={handleCrearCarpeta} disabled={isPending || !resultado || dirty} variant="outline" className="flex-1">
              {isPending ? "Creando..." : "Crear carpeta"}
            </Button>
          </div>
          {dirty && resultado && (
            <p className="text-xs text-amber-600">Hay cambios sin simular. Presioná Simular antes de crear la carpeta.</p>
          )}
        </CardContent>
      </Card>

      {/* Cascada */}
      <Card>
        <CardHeader><CardTitle>Cascada de costos estimada</CardTitle></CardHeader>
        <CardContent>
          {!resultado ? (
            <p className="text-sm text-muted-foreground">Completá los datos y presioná <strong>Simular</strong>.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <Seccion label="Valor internacional" />
              <Linea label="FOB" valor={resultado.fob} fob={resultado.fob} />
              <Linea label={`Flete internacional${resultado.factorContenedor !== 1 ? ` (× ${fmtFactor(resultado.factorContenedor)})` : ""}`} valor={resultado.fleteInternacional} fob={resultado.fob} />
              <Linea label={`Peak Season${resultado.factorContenedor !== 1 ? ` (× ${fmtFactor(resultado.factorContenedor)})` : ""}`} valor={resultado.peakSeason} fob={resultado.fob} />
              <Linea label={`Seguro (${pct(parametros.seguro_pct)})`} valor={resultado.seguro} fob={resultado.fob} />
              <LineaTotal label="CIF" valor={resultado.cif} fob={resultado.fob} />

              <div className="pt-3" />
              <Seccion label="Impuestos aduaneros" />
              <Linea label={`Derechos de importación (${pct(ncmSimulado?.derecho_importacion_pct ?? 0)})`} valor={resultado.derechosImportacion} fob={resultado.fob} />
              {resultado.tasaEstadistica > 0 && <Linea label={`Tasa estadística (${pct(ncmSimulado?.tasa_estadistica_pct ?? 0)})`} valor={resultado.tasaEstadistica} fob={resultado.fob} />}
              <LineaTotal label="Base imponible IVA" valor={resultado.baseImponibleIva} fob={resultado.fob} />
              <Linea label={`IVA (${pct(ncmSimulado?.iva_pct ?? 21)})`} valor={resultado.iva} fob={resultado.fob} />
              {resultado.ivaAdicional > 0 && <Linea label={`IVA adicional (${pct(ncmSimulado?.iva_adicional_pct ?? 0)})`} valor={resultado.ivaAdicional} fob={resultado.fob} />}
              {resultado.anticipoGanancias > 0 && <Linea label={`Anticipo ganancias (${pct(ncmSimulado?.anticipo_ganancias_pct ?? 0)})`} valor={resultado.anticipoGanancias} fob={resultado.fob} />}
              {resultado.iibb > 0 && <Linea label={`IIBB (${pct(ncmSimulado?.iibb_pct ?? 0)})`} valor={resultado.iibb} fob={resultado.fob} />}
              <LineaTotal label="Subtotal impuestos" valor={resultado.subtotalImpuestosUsd} fob={resultado.fob} />

              <div className="pt-3" />
              <Seccion label={`Gastos locales — ${fmtFactor(resultado.factorContenedor)} contenedor${resultado.factorContenedor !== 1 ? "es" : ""} ${contenedorLleno ? "(lleno)" : "(proporcional)"}`} />
              <Linea label={`THC (× ${fmtFactor(resultado.factorContenedor)})`} valor={resultado.thc} fob={resultado.fob} />
              <Linea label={`Flete local (× ${fmtFactor(resultado.factorContenedor)})`} valor={resultado.fleteLocal} fob={resultado.fob} />
              <Linea label={`TOLL Importación (× ${fmtFactor(resultado.factorContenedor)})`} valor={resultado.tollImportacion} fob={resultado.fob} />
              <Linea label={`Depósito fiscal (× ${fmtFactor(resultado.factorContenedor)})`} valor={resultado.depositoFiscal} fob={resultado.fob} forzarMostrar />
              <Linea label="Digitalización de despacho" valor={resultado.digitalizacionDespacho} fob={resultado.fob} />
              <Linea label="Gastos operativos" valor={resultado.gastosOperativos} fob={resultado.fob} />
              <Linea label="Tramitaciones" valor={resultado.tramitaciones} fob={resultado.fob} />
              <Linea label={`Honorarios despachante (${pct(parametros.honorarios_despachante_pct)}, mín. ${usd(parametros.honorarios_despachante_minimo_usd)})`} valor={resultado.honorariosDespachante} fob={resultado.fob} />
              <Linea label={`Gastos bancarios (${pct(parametros.gastos_bancarios_pct)})`} valor={resultado.gastosBancarios} fob={resultado.fob} />
              <LineaTotal label="Subtotal gastos locales" valor={resultado.subtotalGastosLocalesUsd} fob={resultado.fob} />

              <div className="border-t my-3" />
              <LineaTotal label="Total costos (USD)" valor={resultado.totalCostosUsd} fob={resultado.fob} grande />
              <LineaTotal label="Costo total (FOB + costos)" valor={resultado.costoTotalUsd} fob={resultado.fob} grande />
              <div className="flex justify-between pt-1 text-muted-foreground">
                <span>Costo total (ARS)</span>
                <span>{ars(resultado.costoTotalArs)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Seccion({ label }: { label: string }) {
  return <p className="pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>;
}

function Linea({ label, valor, fob, forzarMostrar }: { label: string; valor: number; fob: number; forzarMostrar?: boolean }) {
  if (valor === 0 && !forzarMostrar) return null;
  const pctFob = fob > 0 ? ((valor / fob) * 100).toFixed(1) : null;
  return (
    <div className="flex justify-between items-baseline pl-3 gap-2">
      <span className="text-muted-foreground shrink-0 min-w-0">{label}</span>
      <span className="flex items-baseline gap-2 shrink-0">
        <span className="font-medium">{usd(valor)}</span>
        {pctFob !== null && <span className="text-xs text-muted-foreground w-14 text-right">{pctFob}% FOB</span>}
      </span>
    </div>
  );
}

function LineaTotal({ label, valor, fob, grande }: { label: string; valor: number; fob: number; grande?: boolean }) {
  const pctFob = fob > 0 ? ((valor / fob) * 100).toFixed(1) : null;
  return (
    <div className={`flex justify-between items-baseline gap-2 ${grande ? "font-bold" : "font-semibold"}`}>
      <span>{label}</span>
      <span className="flex items-baseline gap-2 shrink-0">
        <span>{usd(valor)}</span>
        {pctFob !== null && <span className="text-xs font-normal text-muted-foreground w-14 text-right">{pctFob}% FOB</span>}
      </span>
    </div>
  );
}

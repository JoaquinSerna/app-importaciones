"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

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
import { calcularArancelPonderado, calcularCascada, calcularFactorContenedor, type ResultadoCascada } from "@/lib/calculadora-costos";
import type { NcmArancel, ParametrosGlobales, TipoContenedor, TipoImportacion } from "@/lib/types";

interface LineaNcm {
  ncmId: string;
  fobUsd: string;
}

const MODALIDADES: { value: TipoContenedor; label: string }[] = [
  { value: "40HQ", label: "40HQ" },
  { value: "20HQ", label: "20HQ" },
  { value: "AEREO", label: "Aéreo" },
];

const TIPOS_IMPORTACION: { value: TipoImportacion; label: string; descripcion: string }[] = [
  { value: "bien_de_cambio", label: "Bien de cambio", descripcion: "Paga todo lo que tenga configurado el NCM" },
  { value: "bien_de_uso", label: "Bien de uso", descripcion: "Solo paga derechos de importación + IVA" },
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
  const [cbmInput, setCbmInput] = useState("");
  const [pesoInput, setPesoInput] = useState("");
  const [lineasNcm, setLineasNcm] = useState<LineaNcm[]>([{ ncmId: "", fobUsd: "" }]);
  const [modalidad, setModalidad] = useState<TipoContenedor>("40HQ");
  const [fleteManual, setFleteManual] = useState("");
  const [contenedorLleno, setContenedorLleno] = useState(true);
  const [tipoImportacion, setTipoImportacion] = useState<TipoImportacion>("bien_de_cambio");

  const [resultado, setResultado] = useState<ResultadoCascada | null>(null);
  const [ncmSimulado, setNcmSimulado] = useState<NcmArancel | null>(null);
  const [dirty, setDirty] = useState(false);

  const fobTotal = lineasNcm.reduce((acc, l) => acc + (parseFloat(l.fobUsd) || 0), 0);

  function actualizarLinea(idx: number, cambios: Partial<LineaNcm>) {
    setLineasNcm((prev) => prev.map((l, i) => (i === idx ? { ...l, ...cambios } : l)));
    setDirty(true);
  }
  function agregarLinea() {
    setLineasNcm((prev) => [...prev, { ncmId: "", fobUsd: "" }]);
  }
  function quitarLinea(idx: number) {
    setLineasNcm((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  // Sugerencia de contenedores en tiempo real (sin necesidad de simular)
  const cbm = cbmInput ? parseFloat(cbmInput) : undefined;
  const peso = pesoInput ? parseFloat(pesoInput) : undefined;
  const factorLive = (cbm || peso)
    ? calcularFactorContenedor(cbm, peso, modalidad, contenedorLleno)
    : null;

  function handleSimular() {
    if (!parametros) return;
    if (fobTotal <= 0) {
      toast({ title: "FOB inválido", description: "Ingresá al menos una línea con NCM y FOB mayor a 0." });
      return;
    }
    if (lineasNcm.some((l) => !l.ncmId || !(parseFloat(l.fobUsd) > 0))) {
      toast({ title: "Completá todas las líneas", description: "Cada línea necesita un NCM y un FOB mayor a 0." });
      return;
    }
    const arancelPonderado = calcularArancelPonderado(
      lineasNcm.map((l) => ({
        fobUsd: parseFloat(l.fobUsd) || 0,
        ncm: ncms.find((n) => n.id === l.ncmId) ?? null,
      }))
    );
    if (!arancelPonderado) {
      toast({ title: "NCM requerido", description: "Seleccioná al menos un NCM." });
      return;
    }
    const r = calcularCascada(parametros, {
      fobTotalUsd: fobTotal,
      cbmTotal: cbm,
      pesoTotalKg: peso,
      tipoContenedor: modalidad,
      contenedorLleno,
      ncm: arancelPonderado.codigo_ncm,
      fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
      ncmArancel: arancelPonderado,
      tipoImportacion,
    });
    setResultado(r);
    setNcmSimulado(arancelPonderado);
    setDirty(false);
  }

  function handleCrearCarpeta() {
    if (!parametros || !resultado || !ncmSimulado) return;
    startTransition(async () => {
      try {
        await crearCarpetaDesdeSimulacion({
          proveedorId: proveedorId || undefined,
          fobTotalUsd: fobTotal,
          cbmTotal: cbm,
          pesoTotalKg: peso,
          ncm: ncmSimulado.codigo_ncm,
          ncmId: lineasNcm.length === 1 ? lineasNcm[0].ncmId : undefined,
          ncmArancel: ncmSimulado,
          modalidad,
          fleteInternacionalUsd: fleteManual ? parseFloat(fleteManual) : undefined,
          tipoImportacion,
          lineasNcm: lineasNcm.map((l) => ({ ncmId: l.ncmId, fobUsd: parseFloat(l.fobUsd) || 0 })),
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

          <div className="space-y-2">
            <Label>Modalidad *</Label>
            <Select value={modalidad} onValueChange={(v) => { setModalidad(v as TipoContenedor); setDirty(true); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <Label>Productos / NCM *</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Una línea por cada NCM distinto de la compra, con su porción de FOB. El FOB total se calcula solo.
            </p>
            <div className="space-y-2">
              {lineasNcm.map((linea, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={linea.ncmId} onValueChange={(v) => actualizarLinea(idx, { ncmId: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="NCM" /></SelectTrigger>
                    <SelectContent>
                      {ncms.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.codigo_ncm}{n.descripcion ? ` — ${n.descripcion}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01" placeholder="FOB USD" className="w-32"
                    value={linea.fobUsd}
                    onChange={(e) => actualizarLinea(idx, { fobUsd: e.target.value })}
                  />
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => quitarLinea(idx)}
                    disabled={lineasNcm.length === 1}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={agregarLinea}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar NCM
            </Button>
            {ncms.length === 0 && <p className="text-xs text-destructive">No hay NCMs cargados.</p>}
            {fobTotal > 0 && (
              <p className="text-sm font-medium pt-1">FOB total: {usd(fobTotal)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo de importación *</Label>
            <Select value={tipoImportacion} onValueChange={(v) => { setTipoImportacion(v as TipoImportacion); setDirty(true); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_IMPORTACION.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TIPOS_IMPORTACION.find((t) => t.value === tipoImportacion)?.descripcion}
            </p>
          </div>

          {resultado && ncmSimulado && !dirty && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
              <p className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Aranceles {lineasNcm.length > 1 ? "(promedio ponderado por FOB)" : "del NCM"}
              </p>
              <span className="text-muted-foreground">Derecho:</span><span>{pct(ncmSimulado.derecho_importacion_pct)}</span>
              <span className="text-muted-foreground">IVA:</span><span>{pct(ncmSimulado.iva_pct)}</span>
              <span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : "text-muted-foreground"}>IVA adicional:</span><span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : ""}>{pct(ncmSimulado.iva_adicional_pct)}</span>
              <span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : "text-muted-foreground"}>Ganancias:</span><span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : ""}>{pct(ncmSimulado.anticipo_ganancias_pct)}</span>
              <span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : "text-muted-foreground"}>IIBB:</span><span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : ""}>{pct(ncmSimulado.iibb_pct)}</span>
              <span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : "text-muted-foreground"}>Tasa estadística:</span><span className={tipoImportacion === "bien_de_uso" ? "text-muted-foreground/40 line-through" : ""}>{pct(ncmSimulado.tasa_estadistica_pct)}</span>
              {tipoImportacion === "bien_de_uso" && (
                <p className="col-span-2 text-xs text-amber-600 mt-1">Bien de uso: los tachados no se cobran.</p>
              )}
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

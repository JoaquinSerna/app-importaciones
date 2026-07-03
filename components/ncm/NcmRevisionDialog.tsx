"use client";

import { useEffect, useState, useTransition } from "react";

import { buscarDiePorNcm } from "@/app/(app)/carpetas/nueva/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface OpcionNcmDialog {
  ncm: string;
  descripcionOficial: string;
  diePct: number;
  diferencia: string;
}

export interface FilaClasificacionNcm {
  index: number;
  descripcionItem: string;
  ncmPropuesto: string | null;
  descripcionOficial: string | null;
  diePct: number | null;
  confianza: "alta" | "media" | "baja";
  estado: "definido" | "ambiguo" | "no_encontrado";
  opcionesAlternativas: OpcionNcmDialog[];
  razonamiento: string;
}

export interface ResultadoAceptacionNcm {
  index: number;
  /** null = el ítem quedó sin NCM; se usa el arancel default provisorio al simular/crear la carpeta. */
  ncmCodigo: string | null;
  diePct: number;
  ivaPct: 21 | 10.5;
  pagaIvaAdicional: boolean;
  ncmOrigen: "clasificacion_automatica" | "manual" | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultados: FilaClasificacionNcm[];
  /** Se llama al apretar "Aceptar todos", con el NCM final (editado o no) de cada ítem. */
  onAceptar: (resultados: ResultadoAceptacionNcm[]) => void;
}

interface FilaEstado {
  ncm: string;
  diePct: number;
  descripcionOficial: string;
  ivaPct: 21 | 10.5;
  pagaIvaAdicional: boolean;
  buscando: boolean;
  errorBusqueda?: string;
}

const IVA_ADICIONAL_DEFAULT = { 21: 20, 10.5: 10 } as const;

function confianzaClass(confianza: "alta" | "media" | "baja") {
  if (confianza === "alta") return "text-green-700";
  if (confianza === "media") return "text-amber-700";
  return "text-red-700";
}

/** El NCM final quedó igual al que propuso la IA → viene de la clasificación automática; si el usuario lo tipeó/cambió → manual; si quedó vacío → null (sin clasificar, usa default). */
function origenPara(r: FilaClasificacionNcm, ncmFinal: string | null): "clasificacion_automatica" | "manual" | null {
  if (!ncmFinal) return null;
  if (r.ncmPropuesto && ncmFinal === r.ncmPropuesto) return "clasificacion_automatica";
  return "manual";
}

export function NcmRevisionDialog({ open, onOpenChange, resultados, onAceptar }: Props) {
  const [filas, setFilas] = useState<Record<number, FilaEstado>>({});
  const [, startBusqueda] = useTransition();

  // Al abrir: cada fila arranca con lo que propuso la IA (o vacía si quedó
  // "no encontrado"), IVA 21% y "paga IVA adicional" en Sí por default.
  useEffect(() => {
    if (!open) return;
    const inicial: Record<number, FilaEstado> = {};
    for (const r of resultados) {
      inicial[r.index] = {
        ncm: r.ncmPropuesto ?? "",
        diePct: r.diePct ?? 20,
        descripcionOficial: r.descripcionOficial ?? "",
        ivaPct: 21,
        pagaIvaAdicional: true,
        buscando: false,
      };
    }
    setFilas(inicial);
  }, [open, resultados]);

  function setFila(index: number, patch: Partial<FilaEstado>) {
    setFilas((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } as FilaEstado }));
  }

  function handleSeleccionOpcion(index: number, opcion: OpcionNcmDialog) {
    setFila(index, { ncm: opcion.ncm, diePct: opcion.diePct, descripcionOficial: opcion.descripcionOficial, errorBusqueda: undefined });
  }

  // Se dispara al salir del campo (no en cada tecla) para no saturar de
  // llamadas al server action mientras el usuario todavía está tipeando.
  function handleBlurNcm(index: number) {
    const codigo = filas[index]?.ncm?.trim();
    if (!codigo) {
      setFila(index, { errorBusqueda: undefined });
      return;
    }
    startBusqueda(async () => {
      setFila(index, { buscando: true, errorBusqueda: undefined });
      const pos = await buscarDiePorNcm(codigo);
      if (!pos) {
        setFila(index, { buscando: false, errorBusqueda: "NCM no encontrado en el nomenclador de AFIP." });
        return;
      }
      setFila(index, {
        buscando: false,
        ncm: pos.ncm8Dotted,
        diePct: pos.diePct,
        descripcionOficial: pos.descripcion,
        errorBusqueda: undefined,
      });
    });
  }

  function handleAceptarTodos() {
    const salida: ResultadoAceptacionNcm[] = resultados.map((r) => {
      const fila = filas[r.index];
      const ncmFinal = fila?.ncm?.trim() || null;
      return {
        index: r.index,
        ncmCodigo: ncmFinal,
        diePct: fila?.diePct ?? 20,
        ivaPct: fila?.ivaPct ?? 21,
        pagaIvaAdicional: fila?.pagaIvaAdicional ?? true,
        ncmOrigen: origenPara(r, ncmFinal),
      };
    });
    onAceptar(salida);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisión de clasificación NCM</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          El Derecho de Importación (DIE) sale del Arancel Integrado de AFIP — podés editar el NCM de cualquier
          ítem y el DIE se busca solo. Elegí el IVA (21% o 10,5%) y si el producto paga IVA adicional (se calcula
          automático: 20% o 10%). IIBB (2,5%) y Anticipo de ganancias (6%) quedan fijos. Si dejás un ítem sin NCM,
          se simula con Derecho 20% / IVA 21% / IVA adicional 20% hasta que lo clasifiques.
        </p>

        {resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay ítems para clasificar.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ítem</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead>Descripción oficial</TableHead>
                <TableHead className="text-right">DIE</TableHead>
                <TableHead>IVA</TableHead>
                <TableHead>IVA adicional</TableHead>
                <TableHead>Confianza</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultados.map((r) => {
                const fila = filas[r.index];
                const noEncontrado = r.estado === "no_encontrado" || !r.ncmPropuesto;
                const esAmbiguo = r.estado === "ambiguo" && r.opcionesAlternativas.length > 0;
                const bajaConfianza = r.confianza === "baja" && !noEncontrado;
                const vacia = !fila?.ncm?.trim();

                return (
                  <TableRow key={r.index} className={bajaConfianza || (noEncontrado && vacia) ? "bg-amber-50" : undefined}>
                    <TableCell>
                      <div className="max-w-[220px] truncate" title={r.descripcionItem}>
                        {r.descripcionItem}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          placeholder="ej. 4203.29.00"
                          value={fila?.ncm ?? ""}
                          onChange={(e) => setFila(r.index, { ncm: e.target.value })}
                          onBlur={() => handleBlurNcm(r.index)}
                          className="w-32 font-mono"
                        />
                        {fila?.buscando && <span className="text-xs text-muted-foreground">Buscando DIE...</span>}
                        {fila?.errorBusqueda && <span className="text-xs text-destructive">{fila.errorBusqueda}</span>}
                        {esAmbiguo && (
                          <Select value="" onValueChange={(v) => {
                            const opcion = v === r.ncmPropuesto
                              ? { ncm: r.ncmPropuesto!, descripcionOficial: r.descripcionOficial ?? "", diePct: r.diePct ?? 20, diferencia: "" }
                              : r.opcionesAlternativas.find((o) => o.ncm === v);
                            if (opcion) handleSeleccionOpcion(r.index, opcion);
                          }}>
                            <SelectTrigger className="w-32 h-7 text-xs">
                              <SelectValue placeholder="Alternativas" />
                            </SelectTrigger>
                            <SelectContent>
                              {r.ncmPropuesto && (
                                <SelectItem value={r.ncmPropuesto}>{r.ncmPropuesto} (propuesto)</SelectItem>
                              )}
                              {r.opcionesAlternativas.map((o) => (
                                <SelectItem key={o.ncm} value={o.ncm}>
                                  {o.ncm}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      {noEncontrado && vacia ? (
                        <span className="text-xs text-muted-foreground">{r.razonamiento}</span>
                      ) : (
                        <div className="text-xs">
                          <div>{fila?.descripcionOficial}</div>
                          {esAmbiguo && (
                            <div className="text-muted-foreground mt-0.5">
                              {r.opcionesAlternativas.find((o) => o.ncm === fila?.ncm)?.diferencia}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{vacia ? "20% (default)" : `${fila?.diePct ?? 0}%`}</TableCell>
                    <TableCell>
                      <Select
                        value={String(fila?.ivaPct ?? 21)}
                        onValueChange={(v) => setFila(r.index, { ivaPct: (v === "21" ? 21 : 10.5) as 21 | 10.5 })}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="21">21%</SelectItem>
                          <SelectItem value="10.5">10,5%</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={fila?.pagaIvaAdicional ?? true ? "si" : "no"}
                          onValueChange={(v) => setFila(r.index, { pagaIvaAdicional: v === "si" })}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="si">Sí</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                        {(fila?.pagaIvaAdicional ?? true) && (
                          <span className="text-xs text-muted-foreground">{IVA_ADICIONAL_DEFAULT[fila?.ivaPct ?? 21]}%</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {!noEncontrado && <span className={`text-xs font-medium ${confianzaClass(r.confianza)}`}>{r.confianza}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={noEncontrado ? "destructive" : esAmbiguo ? "secondary" : "default"}>
                        {noEncontrado ? "no encontrado" : esAmbiguo ? "ambiguo" : "definido"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAceptarTodos} disabled={resultados.length === 0}>
            Aceptar todos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

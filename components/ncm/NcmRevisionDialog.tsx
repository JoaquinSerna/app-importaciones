"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  confirmarNcmSkus,
  type ClasificacionSkuResultado,
  type ConfirmacionNcmInput,
} from "@/app/(app)/carpetas/[id]/skus-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carpetaId: string;
  resultados: ClasificacionSkuResultado[];
  /** Se llama después de confirmar y guardar los NCMs con éxito. */
  onConfirmado: () => void;
}

interface FilaEstado {
  incluida: boolean;
  ncm: string;
  diePct: number;
  descripcion: string;
  ivaPct: 21 | 10.5;
  pagaIvaAdicional: boolean;
}

interface FilaManual {
  ncm: string;
  die: string;
  ivaPct?: 21 | 10.5;
  pagaIvaAdicional?: boolean;
}

const IVA_ADICIONAL_DEFAULT = { 21: 20, 10.5: 10 } as const;

function confianzaClass(confianza: "alta" | "media" | "baja") {
  if (confianza === "alta") return "text-green-700";
  if (confianza === "media") return "text-amber-700";
  return "text-red-700";
}

export function NcmRevisionDialog({ open, onOpenChange, carpetaId, resultados, onConfirmado }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filas, setFilas] = useState<Record<string, FilaEstado>>({});
  const [manual, setManual] = useState<Record<string, FilaManual>>({});

  // Al abrir: definidos con confianza alta vienen pre-tildados; ambiguos y de
  // baja confianza quedan destildados para que el usuario los revise antes.
  useEffect(() => {
    if (!open) return;
    const inicial: Record<string, FilaEstado> = {};
    for (const r of resultados) {
      if (r.estado === "no_encontrado" || !r.ncm_propuesto) continue;
      inicial[r.sku_id] = {
        incluida: r.estado === "definido" && r.confianza === "alta",
        ncm: r.ncm_propuesto,
        diePct: r.die_pct ?? 0,
        descripcion: r.descripcion_oficial ?? "",
        ivaPct: 21,
        pagaIvaAdicional: true,
      };
    }
    setFilas(inicial);
    setManual({});
  }, [open, resultados]);

  function setFila(skuId: string, patch: Partial<FilaEstado>) {
    setFilas((prev) => ({ ...prev, [skuId]: { ...prev[skuId], ...patch } as FilaEstado }));
  }

  function handleSeleccionOpcion(r: ClasificacionSkuResultado, ncmElegido: string) {
    const opcion =
      ncmElegido === r.ncm_propuesto
        ? { ncm: r.ncm_propuesto!, diePct: r.die_pct ?? 0, descripcion: r.descripcion_oficial ?? "" }
        : (() => {
            const alt = r.opciones_alternativas.find((o) => o.ncm === ncmElegido);
            return alt ? { ncm: alt.ncm, diePct: alt.die_pct, descripcion: alt.descripcion_oficial } : null;
          })();
    if (!opcion) return;
    setFila(r.sku_id, { incluida: true, ...opcion });
  }

  function construirConfirmaciones(): ConfirmacionNcmInput[] {
    const confirmaciones: ConfirmacionNcmInput[] = [];
    for (const r of resultados) {
      const fila = filas[r.sku_id];
      if (fila?.incluida) {
        confirmaciones.push({
          sku_id: r.sku_id,
          ncm_codigo: fila.ncm,
          die_pct: fila.diePct,
          descripcion: fila.descripcion,
          iva_pct: fila.ivaPct,
          paga_iva_adicional: fila.pagaIvaAdicional,
        });
        continue;
      }
      const m = manual[r.sku_id];
      const die = parseFloat(m?.die ?? "");
      if (m?.ncm.trim() && Number.isFinite(die)) {
        confirmaciones.push({
          sku_id: r.sku_id,
          ncm_codigo: m.ncm.trim(),
          die_pct: die,
          descripcion: r.descripcion_sku,
          iva_pct: m.ivaPct ?? 21,
          paga_iva_adicional: m.pagaIvaAdicional ?? true,
        });
      }
    }
    return confirmaciones;
  }

  const cantidadSeleccionada = useMemo(construirConfirmaciones, [filas, manual, resultados]).length;

  function handleConfirmar() {
    const confirmaciones = construirConfirmaciones();
    if (confirmaciones.length === 0) {
      toast({ title: "No hay NCMs seleccionados", description: "Marcá al menos un SKU para confirmar." });
      return;
    }

    startTransition(async () => {
      const resultado = await confirmarNcmSkus(carpetaId, confirmaciones);
      if (resultado.error) {
        toast({ title: "Error guardando NCMs", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: `${confirmaciones.length} NCM(s) asignados`, description: "La simulación de la carpeta se recalculó con los nuevos NCM." });
      onOpenChange(false);
      onConfirmado();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisión de clasificación NCM</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          El Derecho de Importación (DIE) sale del Arancel Integrado de AFIP. Elegí el IVA (21% o 10,5%) y si el
          producto paga IVA adicional — se calcula automáticamente (20% o 10% según corresponda). IIBB (2,5%) y
          Anticipo de ganancias (6%) se cargan fijos; podés ajustarlos luego desde el módulo NCM si un caso puntual
          difiere.
        </p>

        {resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Todos los SKUs de esta carpeta ya tienen un NCM asignado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>SKU</TableHead>
                <TableHead>NCM propuesto</TableHead>
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
                const noEncontrado = r.estado === "no_encontrado" || !r.ncm_propuesto;
                const fila = filas[r.sku_id];
                const esAmbiguo = r.estado === "ambiguo" && r.opciones_alternativas.length > 0;
                const bajaConfianza = r.confianza === "baja" && !noEncontrado;
                const descripcionElegida = esAmbiguo
                  ? fila?.ncm === r.ncm_propuesto
                    ? r.descripcion_oficial
                    : r.opciones_alternativas.find((o) => o.ncm === fila?.ncm)?.descripcion_oficial
                  : r.descripcion_oficial;
                const diferenciaElegida = esAmbiguo
                  ? r.opciones_alternativas.find((o) => o.ncm === fila?.ncm)?.diferencia ??
                    r.opciones_alternativas[0]?.diferencia
                  : null;

                return (
                  <TableRow key={r.sku_id} className={bajaConfianza ? "bg-amber-50" : undefined}>
                    <TableCell>
                      {!noEncontrado && (
                        <input
                          type="checkbox"
                          checked={fila?.incluida ?? false}
                          onChange={(e) => setFila(r.sku_id, { incluida: e.target.checked })}
                          className="h-4 w-4 accent-cac-blue"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px] truncate" title={r.descripcion_sku}>
                        {r.sku_codigo ? `${r.sku_codigo} — ` : ""}
                        {r.descripcion_sku}
                      </div>
                    </TableCell>
                    <TableCell>
                      {noEncontrado ? (
                        <Input
                          placeholder="ej. 4203.29.00"
                          value={manual[r.sku_id]?.ncm ?? ""}
                          onChange={(e) =>
                            setManual((prev) => ({ ...prev, [r.sku_id]: { ...prev[r.sku_id], ncm: e.target.value, die: prev[r.sku_id]?.die ?? "" } }))
                          }
                          className="w-32"
                        />
                      ) : esAmbiguo ? (
                        <Select value={fila?.ncm} onValueChange={(v) => handleSeleccionOpcion(r, v)}>
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={r.ncm_propuesto!}>{r.ncm_propuesto}</SelectItem>
                            {r.opciones_alternativas.map((o) => (
                              <SelectItem key={o.ncm} value={o.ncm}>
                                {o.ncm}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="font-mono">{r.ncm_propuesto}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      {noEncontrado ? (
                        <span className="text-xs text-muted-foreground">{r.razonamiento}</span>
                      ) : (
                        <div className="text-xs">
                          <div>{descripcionElegida}</div>
                          {esAmbiguo && diferenciaElegida && (
                            <div className="text-muted-foreground mt-0.5">{diferenciaElegida}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {noEncontrado ? (
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="%"
                          value={manual[r.sku_id]?.die ?? ""}
                          onChange={(e) =>
                            setManual((prev) => ({ ...prev, [r.sku_id]: { ...prev[r.sku_id], ncm: prev[r.sku_id]?.ncm ?? "", die: e.target.value } }))
                          }
                          className="w-20"
                        />
                      ) : (
                        `${fila?.diePct ?? r.die_pct ?? 0}%`
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String((noEncontrado ? manual[r.sku_id]?.ivaPct : fila?.ivaPct) ?? 21)}
                        onValueChange={(v) => {
                          const ivaPct = (v === "21" ? 21 : 10.5) as 21 | 10.5;
                          if (noEncontrado) {
                            setManual((prev) => ({ ...prev, [r.sku_id]: { ...prev[r.sku_id], ncm: prev[r.sku_id]?.ncm ?? "", die: prev[r.sku_id]?.die ?? "", ivaPct } }));
                          } else {
                            setFila(r.sku_id, { ivaPct });
                          }
                        }}
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
                      {(() => {
                        const ivaPct = ((noEncontrado ? manual[r.sku_id]?.ivaPct : fila?.ivaPct) ?? 21) as 21 | 10.5;
                        const pagaIvaAdicional = (noEncontrado ? manual[r.sku_id]?.pagaIvaAdicional : fila?.pagaIvaAdicional) ?? true;
                        return (
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={pagaIvaAdicional ? "si" : "no"}
                              onValueChange={(v) => {
                                const paga = v === "si";
                                if (noEncontrado) {
                                  setManual((prev) => ({ ...prev, [r.sku_id]: { ...prev[r.sku_id], ncm: prev[r.sku_id]?.ncm ?? "", die: prev[r.sku_id]?.die ?? "", pagaIvaAdicional: paga } }));
                                } else {
                                  setFila(r.sku_id, { pagaIvaAdicional: paga });
                                }
                              }}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="si">Sí</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                            {pagaIvaAdicional && (
                              <span className="text-xs text-muted-foreground">{IVA_ADICIONAL_DEFAULT[ivaPct]}%</span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {!noEncontrado && (
                        <span className={`text-xs font-medium ${confianzaClass(r.confianza)}`}>{r.confianza}</span>
                      )}
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
          <Button onClick={handleConfirmar} disabled={isPending || resultados.length === 0}>
            {isPending ? "Guardando..." : `Confirmar y simular (${cantidadSeleccionada})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

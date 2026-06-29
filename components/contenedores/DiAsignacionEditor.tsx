"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { asignarItemsDI, confirmarAsignacionDI, type AsignacionItemInput, type DiItem } from "@/app/(app)/contenedores/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

function formatUsd(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

interface CarpetaConSkus {
  id: string;
  titulo: string | null;
  numero_carpeta: string;
  skus: { id: string; descripcion: string | null; descripcion_es: string | null }[];
}

interface DiItemConSkus extends DiItem {
  sku_ids_asignados: string[];
}

interface Props {
  contenedorId: string;
  contenedorNumero: string;
  items: DiItemConSkus[];
  carpetas: CarpetaConSkus[];
}

function nombreSku(sku: { descripcion: string | null; descripcion_es: string | null }) {
  return sku.descripcion_es ?? sku.descripcion ?? "(sin descripción)";
}

function badgeConfianza(confianza: number | null) {
  if (confianza === null) return null;
  const variant = confianza >= 0.85 ? "default" : confianza >= 0.7 ? "secondary" : "destructive";
  const color = confianza >= 0.85 ? "bg-emerald-600 hover:bg-emerald-600" : confianza >= 0.7 ? "bg-amber-500 hover:bg-amber-500 text-white" : "";
  return (
    <Badge variant={variant} className={color}>
      Confianza {(confianza * 100).toFixed(0)}%
    </Badge>
  );
}

export function DiAsignacionEditor({ contenedorId, contenedorNumero, items, carpetas }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [asignacion, setAsignacion] = useState<Map<string, AsignacionItemInput>>(
    new Map(
      items.map((it) => [
        it.id,
        { diItemId: it.id, carpetaId: it.carpeta_id ?? "", skuIds: it.sku_ids_asignados },
      ])
    )
  );

  const carpetaPorId = useMemo(() => new Map(carpetas.map((c) => [c.id, c])), [carpetas]);

  const todosAsignados = items.every((it) => {
    const a = asignacion.get(it.id);
    return a && a.carpetaId && a.skuIds.length > 0;
  });

  function handleCambiarCarpeta(diItemId: string, carpetaId: string) {
    setAsignacion((prev) => {
      const next = new Map(prev);
      next.set(diItemId, { diItemId, carpetaId, skuIds: [] });
      return next;
    });
  }

  function handleToggleSku(diItemId: string, skuId: string) {
    setAsignacion((prev) => {
      const next = new Map(prev);
      const actual = next.get(diItemId);
      if (!actual) return prev;
      const skuIds = actual.skuIds.includes(skuId)
        ? actual.skuIds.filter((id) => id !== skuId)
        : [...actual.skuIds, skuId];
      next.set(diItemId, { ...actual, skuIds });
      return next;
    });
  }

  function handleAsignarConIA() {
    startTransition(async () => {
      const resultado = await asignarItemsDI(contenedorId);
      if (resultado.error) {
        toast({ title: "No se pudo asignar con IA", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: `${resultado.asignados ?? 0} ítem(s) asignados por la IA` });
      router.refresh();
    });
  }

  function handleConfirmar() {
    startTransition(async () => {
      const resultado = await confirmarAsignacionDI(contenedorId, Array.from(asignacion.values()));
      if (resultado.error) {
        toast({ title: "No se pudo confirmar la asignación", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Asignación confirmada", description: "Los costos reales por SKU se actualizaron." });
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No hay ítems del despacho cargados para el contenedor {contenedorNumero}. Subí y confirmá el Despacho de
          Importación en la pestaña Documentos primero.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={handleAsignarConIA} disabled={isPending}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
          Asignar con IA
        </Button>
        <Button onClick={handleConfirmar} disabled={isPending || !todosAsignados}>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Confirmar asignación
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const actual = asignacion.get(item.id);
          const carpetaSeleccionada = actual?.carpetaId ? carpetaPorId.get(actual.carpetaId) : undefined;
          return (
            <Card key={item.id}>
              <CardContent className="grid gap-6 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Ítem {item.numero_item}</Badge>
                    {item.confirmado && <Badge className="bg-emerald-600 hover:bg-emerald-600">Confirmado</Badge>}
                  </div>
                  <p className="text-sm">{item.descripcion_di ?? "(sin descripción)"}</p>
                  <p className="text-xs text-muted-foreground">NCM: {item.ncm ?? "-"}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="text-muted-foreground">Derechos (010)</td>
                        <td className="text-right">{formatUsd(item.derechos_usd)}</td>
                      </tr>
                      <tr>
                        <td className="text-muted-foreground">Estadística (011)</td>
                        <td className="text-right">{formatUsd(item.tasa_estadistica_usd)}</td>
                      </tr>
                      {item.antidumping_usd > 0 && (
                        <tr className="text-destructive">
                          <td className="flex items-center gap-1">
                            Antidumping (017) <Badge variant="destructive" className="text-[10px]">DUMPING</Badge>
                          </td>
                          <td className="text-right">{formatUsd(item.antidumping_usd)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="text-muted-foreground">IVA (415)</td>
                        <td className="text-right">{formatUsd(item.iva_usd)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Asignación propuesta</span>
                    {badgeConfianza(item.confianza)}
                  </div>
                  <Select
                    value={actual?.carpetaId || undefined}
                    onValueChange={(v) => handleCambiarCarpeta(item.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí la carpeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {carpetas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.titulo ?? c.numero_carpeta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {carpetaSeleccionada && (
                    <div className="space-y-1 rounded-md border p-2">
                      {carpetaSeleccionada.skus.length === 0 && (
                        <p className="text-xs text-muted-foreground">Esta carpeta no tiene SKUs cargados.</p>
                      )}
                      {carpetaSeleccionada.skus.map((sku) => (
                        <label key={sku.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={actual?.skuIds.includes(sku.id) ?? false}
                            onChange={() => handleToggleSku(item.id, sku.id)}
                          />
                          {nombreSku(sku)}
                        </label>
                      ))}
                    </div>
                  )}

                  {item.razon && <p className="text-xs text-muted-foreground">{item.razon}</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";

import {
  confirmarItemsDespacho,
  type ItemDespachoEditable,
} from "@/app/(app)/contenedores/[id]/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface NcmPorCarpeta {
  ncmCodigo: string;
  carpetaId: string;
  carpetaLabel: string;
}

interface Props {
  documentoId: string;
  contenedorId: string;
  itemsIniciales: ItemDespachoEditable[];
  ncmPorCarpeta: NcmPorCarpeta[];
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compara NCM ignorando puntos/espacios — el despacho a veces los escribe
// distinto que como están guardados en NCMs (ej: "8426.11.00" vs "84261100").
function normalizarNcm(ncm: string) {
  return ncm.replace(/[^0-9]/g, "");
}

export function RevisarItemsDespacho({ documentoId, contenedorId, itemsIniciales, ncmPorCarpeta }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<ItemDespachoEditable[]>(
    itemsIniciales.length > 0 ? itemsIniciales : [{ item: 1, ncm: "", conceptos: [] }]
  );

  const totalPorConcepto = items
    .flatMap((it) => it.conceptos)
    .reduce<Record<string, number>>((acc, c) => {
      acc[c.concepto] = (acc[c.concepto] ?? 0) + (Number(c.monto) || 0);
      return acc;
    }, {});

  function actualizarNcm(idx: number, ncm: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ncm } : it)));
  }

  function actualizarConcepto(idx: number, cIdx: number, campo: "concepto" | "monto", valor: string) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const conceptos = it.conceptos.map((c, j) =>
          j === cIdx ? { ...c, [campo]: campo === "monto" ? Number(valor) || 0 : valor } : c
        );
        return { ...it, conceptos };
      })
    );
  }

  function agregarConcepto(idx: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, conceptos: [...it.conceptos, { concepto: "", monto: 0 }] } : it))
    );
  }

  function quitarConcepto(idx: number, cIdx: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, conceptos: it.conceptos.filter((_, j) => j !== cIdx) } : it))
    );
  }

  function agregarItem() {
    setItems((prev) => [...prev, { item: prev.length + 1, ncm: "", conceptos: [] }]);
  }

  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function carpetaParaNcm(ncm: string): NcmPorCarpeta | null {
    const norm = normalizarNcm(ncm).slice(0, 8);
    if (!norm) return null;
    return ncmPorCarpeta.find((n) => normalizarNcm(n.ncmCodigo).slice(0, 8) === norm) ?? null;
  }

  function handleConfirmar() {
    if (items.some((it) => !it.ncm.trim())) {
      toast({ title: "Falta el NCM", description: "Todos los ítems necesitan un NCM.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const resultado = await confirmarItemsDespacho(documentoId, contenedorId, items);
      if (resultado.error) {
        toast({ title: "No se pudo guardar", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Ítems del despacho confirmados" });
    });
  }

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base">Revisá los ítems del despacho antes de usarlos</CardTitle>
        <p className="text-sm text-muted-foreground">
          La IA extrajo esto del PDF — corregí el NCM o cualquier monto que esté mal antes de confirmar. Nada de esto
          se usa para calcular costos hasta que confirmes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((it, idx) => {
          const carpeta = carpetaParaNcm(it.ncm);
          return (
          <div key={idx} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Ítem {it.item} · NCM</span>
              <Input
                value={it.ncm}
                onChange={(e) => actualizarNcm(idx, e.target.value)}
                placeholder="ej: 8426.11.00"
                className="h-8 w-40 text-sm"
                disabled={isPending}
              />
              {it.ncm.trim() && (
                carpeta ? (
                  <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                    {carpeta.carpetaLabel}
                  </span>
                ) : (
                  <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                    Sin carpeta con este NCM
                  </span>
                )
              )}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => quitarItem(idx)} disabled={isPending} title="Quitar ítem">
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            <div className="space-y-1">
              {it.conceptos.map((c, cIdx) => (
                <div key={cIdx} className="flex items-center gap-2">
                  <Input
                    value={c.concepto}
                    onChange={(e) => actualizarConcepto(idx, cIdx, "concepto", e.target.value)}
                    placeholder="Concepto (ej: Tasa estadística)"
                    className="h-8 flex-1 text-sm"
                    disabled={isPending}
                  />
                  <Input
                    type="number"
                    value={c.monto}
                    onChange={(e) => actualizarConcepto(idx, cIdx, "monto", e.target.value)}
                    className="h-8 w-32 text-sm"
                    disabled={isPending}
                  />
                  <Button size="sm" variant="ghost" onClick={() => quitarConcepto(idx, cIdx)} disabled={isPending}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => agregarConcepto(idx)} disabled={isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar concepto a este ítem
            </Button>
          </div>
          );
        })}

        <Button size="sm" variant="outline" onClick={agregarItem} disabled={isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agregar ítem
        </Button>

        {Object.keys(totalPorConcepto).length > 0 && (
          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Totales según lo cargado arriba (verificá que cierren con el despacho)
            </p>
            {Object.entries(totalPorConcepto).map(([concepto, monto]) => (
              <div key={concepto} className="flex justify-between">
                <span className="text-muted-foreground">{concepto || "(sin nombre)"}</span>
                <span className="font-medium">{fmt(monto)}</span>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleConfirmar} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Confirmar ítems
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  asignarTributoPorNcm,
  listarSkusParaTributoNcm,
  type SkuParaTributoNcm,
} from "@/app/(app)/contenedores/[id]/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface FilaSku extends SkuParaTributoNcm {
  marcado: boolean;
  monto: string;
}

export function AsignarTributosNcm({ contenedorId }: { contenedorId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [cargando, setCargando] = useState(true);
  const [concepto, setConcepto] = useState("Derechos anti-dumping");
  const [filas, setFilas] = useState<FilaSku[]>([]);

  useEffect(() => {
    listarSkusParaTributoNcm(contenedorId).then((skus) => {
      setFilas(
        skus.map((s) => {
          const existente = s.tributosActuales.find((t) => t.concepto === "Derechos anti-dumping");
          return {
            ...s,
            marcado: !!existente,
            monto: existente ? String(existente.montoUsd) : "",
          };
        })
      );
      setCargando(false);
    });
  }, [contenedorId]);

  function toggleMarcado(skuId: string) {
    setFilas((prev) => prev.map((f) => (f.skuId === skuId ? { ...f, marcado: !f.marcado } : f)));
  }

  function cambiarMonto(skuId: string, monto: string) {
    setFilas((prev) => prev.map((f) => (f.skuId === skuId ? { ...f, monto } : f)));
  }

  function handleGuardar() {
    if (!concepto.trim()) {
      toast({ title: "Falta el nombre del tributo", variant: "destructive" });
      return;
    }
    const seleccionadas = filas.filter((f) => f.marcado);
    if (seleccionadas.some((f) => !f.ncmCodigo)) {
      toast({ title: "Hay SKUs marcados sin NCM asignado", description: "Asignales un NCM primero.", variant: "destructive" });
      return;
    }
    if (seleccionadas.some((f) => !(parseFloat(f.monto) > 0))) {
      toast({ title: "Falta el monto", description: "Todos los SKUs marcados necesitan un monto en USD mayor a 0.", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const resultado = await asignarTributoPorNcm(
        contenedorId,
        concepto.trim(),
        seleccionadas.map((f) => ({
          skuId: f.skuId,
          carpetaId: f.carpetaId,
          ncmCodigo: f.ncmCodigo as string,
          montoUsd: parseFloat(f.monto),
        }))
      );
      if (resultado.error) {
        toast({ title: "No se pudo guardar", description: resultado.error, variant: "destructive" });
        return;
      }
      toast({ title: "Tributo asignado", description: `Se aplicó solo a ${seleccionadas.length} SKU(s) seleccionado(s).` });
    });
  }

  if (cargando) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (filas.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tributos específicos por NCM (ej: derechos anti-dumping)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Marcá únicamente los SKUs que realmente tienen este tributo en el despacho — el resto no se ve afectado.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 max-w-sm">
          <label className="text-xs text-muted-foreground">Nombre del tributo</label>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="ej: Derechos anti-dumping" />
        </div>

        <div className="space-y-2">
          {filas.map((fila) => (
            <div key={fila.skuId} className="flex items-center gap-3 rounded-lg border p-2">
              <input
                type="checkbox"
                checked={fila.marcado}
                onChange={() => toggleMarcado(fila.skuId)}
                disabled={isPending || !fila.ncmCodigo}
                className="h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fila.descripcion || "(sin nombre)"}</p>
                <p className="text-xs text-muted-foreground">
                  Carpeta {fila.carpetaNumero} · NCM {fila.ncmCodigo ?? "sin asignar"} · FOB USD {fila.fobUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto USD"
                className="w-32 h-8"
                value={fila.monto}
                disabled={isPending || !fila.marcado}
                onChange={(e) => cambiarMonto(fila.skuId, e.target.value)}
              />
            </div>
          ))}
        </div>

        <Button onClick={handleGuardar} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Guardar asignación
        </Button>
      </CardContent>
    </Card>
  );
}

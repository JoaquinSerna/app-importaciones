"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { confirmarMonedasDespacho } from "@/app/(app)/contenedores/[id]/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface ItemCosto {
  concepto: string;
  monto: number;
}

interface Props {
  documentoId: string;
  contenedorId: string;
  itemsCostos: ItemCosto[];
  tipoCambioInicial: number | null;
}

export function RevisionMonedasDespacho({
  documentoId,
  contenedorId,
  itemsCostos,
  tipoCambioInicial,
}: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [monedas, setMonedas] = useState<Record<number, "USD" | "ARS">>({});
  const [tipoCambio, setTipoCambio] = useState<string>(
    tipoCambioInicial ? String(tipoCambioInicial) : ""
  );

  function marcarTodos(moneda: "USD" | "ARS") {
    const nuevo: Record<number, "USD" | "ARS"> = {};
    itemsCostos.forEach((_, i) => {
      nuevo[i] = moneda;
    });
    setMonedas(nuevo);
  }

  const faltanMonedas = itemsCostos.some((_, i) => !monedas[i]);
  const hayArs = Object.values(monedas).includes("ARS");
  const tcNumero = Number(tipoCambio.replace(",", "."));
  const tcInvalido = hayArs && (!tipoCambio || !(tcNumero > 0));

  function handleConfirmar() {
    if (faltanMonedas) {
      toast({
        title: "Faltan monedas",
        description: "Asigná USD o ARS a todos los costos antes de confirmar.",
        variant: "destructive",
      });
      return;
    }
    if (tcInvalido) {
      toast({
        title: "Falta tipo de cambio",
        description: "Ingresá el tipo de cambio para convertir los montos en ARS a USD.",
        variant: "destructive",
      });
      return;
    }
    startTransition(async () => {
      try {
        await confirmarMonedasDespacho(
          documentoId,
          contenedorId,
          itemsCostos.map((item, i) => ({
            concepto: item.concepto,
            monto: item.monto,
            moneda: monedas[i],
          })),
          hayArs ? tcNumero : null
        );
        toast({ title: "Monedas confirmadas", description: "Los costos reales se sincronizaron con la carpeta." });
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base">Confirmá la moneda de cada costo del despacho</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          La IA detectó estos montos pero no asume en qué moneda están — confirmalos uno por uno o usá los botones de abajo.
        </p>

        <div className="space-y-2">
          {itemsCostos.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border p-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.concepto}</p>
                <p className="text-xs text-muted-foreground">
                  {item.monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <Select
                value={monedas[i] ?? ""}
                onValueChange={(v) => setMonedas((m) => ({ ...m, [i]: v as "USD" | "ARS" }))}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Moneda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => marcarTodos("USD")}>
            Marcar todos USD
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => marcarTodos("ARS")}>
            Marcar todos ARS
          </Button>
        </div>

        {hayArs && (
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-muted-foreground shrink-0">Tipo de cambio (ARS por USD):</label>
            <input
              type="text"
              inputMode="decimal"
              className="h-8 w-28 rounded border px-2 text-sm"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              placeholder="ej: 1382"
              disabled={isPending}
            />
          </div>
        )}

        <Button onClick={handleConfirmar} disabled={isPending} className="mt-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Confirmar y guardar
        </Button>
      </CardContent>
    </Card>
  );
}

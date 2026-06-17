"use client";

import { useState, useTransition } from "react";

import { crearVersionParametros, type CrearParametrosInput } from "@/app/(app)/parametros/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { ParametrosGlobales } from "@/lib/types";

const CAMPOS: { key: keyof CrearParametrosInput; label: string; columnaSql: keyof ParametrosGlobales }[] = [
  { key: "gastoTerminalUsd", label: "Gasto terminal (USD)", columnaSql: "gasto_terminal_usd" },
  { key: "fleteInternoUsd", label: "Flete interno (USD)", columnaSql: "flete_interno_usd" },
  { key: "seguroPct", label: "Seguro (%)", columnaSql: "seguro_pct" },
  { key: "tasaEstadisticaPct", label: "Tasa estadística (%)", columnaSql: "tasa_estadistica_pct" },
  {
    key: "tasaEstadisticaTopeUsd",
    label: "Tope tasa estadística (USD)",
    columnaSql: "tasa_estadistica_tope_usd",
  },
  {
    key: "honorariosDespachantePct",
    label: "Honorarios despachante (%)",
    columnaSql: "honorarios_despachante_pct",
  },
  {
    key: "honorariosDespachanteMinimoUsd",
    label: "Mínimo honorarios despachante (USD)",
    columnaSql: "honorarios_despachante_minimo_usd",
  },
  { key: "tcUsdArs", label: "TC USD/ARS", columnaSql: "tc_usd_ars" },
  { key: "gastosBancariosPct", label: "Gastos bancarios (%)", columnaSql: "gastos_bancarios_pct" },
];

export function NuevaVersionParametrosForm({ ultimaVersion }: { ultimaVersion: ParametrosGlobales | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const valoresIniciales: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const valor = ultimaVersion ? ultimaVersion[campo.columnaSql] : "";
    valoresIniciales[campo.key] = valor !== null && valor !== undefined ? String(valor) : "";
  }

  const [valores, setValores] = useState<Record<string, string>>(valoresIniciales);

  function handleChange(key: string, value: string) {
    setValores((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const parsed: Partial<CrearParametrosInput> = {};
    for (const campo of CAMPOS) {
      const num = parseFloat(valores[campo.key]);
      if (Number.isNaN(num)) {
        toast({ title: "Datos incompletos", description: `Completá "${campo.label}" con un número válido.` });
        return;
      }
      parsed[campo.key] = num;
    }

    startTransition(async () => {
      try {
        await crearVersionParametros(parsed as CrearParametrosInput);
        toast({ title: "Nueva versión de parámetros creada" });
      } catch (err) {
        toast({
          title: "Error creando la nueva versión",
          description: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva versión de parámetros</CardTitle>
        <p className="text-sm text-muted-foreground">
          Se inserta como una fila nueva; las versiones anteriores nunca se modifican. Los aranceles
          por posición (derecho, IVA, etc.) se configuran en la sección NCMs.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {CAMPOS.map((campo) => (
            <div key={campo.key} className="space-y-2">
              <Label htmlFor={campo.key}>{campo.label}</Label>
              <Input
                id={campo.key}
                type="number"
                step="0.01"
                value={valores[campo.key]}
                onChange={(e) => handleChange(campo.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Guardando..." : "Crear nueva versión"}
        </Button>
      </CardContent>
    </Card>
  );
}

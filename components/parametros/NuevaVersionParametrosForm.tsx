"use client";

import { useState, useTransition } from "react";

import { crearVersionParametros, type CrearParametrosInput } from "@/app/(app)/parametros/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { ParametrosGlobales } from "@/lib/types";

interface Campo {
  key: keyof CrearParametrosInput;
  label: string;
  columnaSql: keyof ParametrosGlobales;
}

const SECCIONES: { titulo: string; campos: Campo[] }[] = [
  {
    titulo: "Transporte marítimo / aéreo",
    campos: [
      { key: "fleteInternacionalUsd", label: "Flete internacional (USD)", columnaSql: "flete_internacional_usd" },
      { key: "peakSeasonUsd", label: "Peak Season (USD)", columnaSql: "peak_season_usd" },
    ],
  },
  {
    titulo: "Gastos locales",
    campos: [
      { key: "thcUsd", label: "THC (USD)", columnaSql: "thc_usd" },
      { key: "fleteInternoUsd", label: "Flete local (USD)", columnaSql: "flete_interno_usd" },
      { key: "tollImportacionUsd", label: "TOLL Importación (USD)", columnaSql: "toll_importacion_usd" },
      { key: "gastoTerminalUsd", label: "Depósito fiscal por contenedor (USD)", columnaSql: "gasto_terminal_usd" },
      { key: "digitalizacionUsd", label: "Digitalización de despacho (USD)", columnaSql: "digitalizacion_usd" },
      { key: "gastosOperativosUsd", label: "Gastos operativos (USD)", columnaSql: "gastos_operativos_usd" },
      { key: "gastosLocalesUsd", label: "Gastos locales (USD)", columnaSql: "gastos_locales_usd" },
      { key: "tramitacionesUsd", label: "Tramitaciones (USD)", columnaSql: "tramitaciones_usd" },
    ],
  },
  {
    titulo: "Porcentuales y tipo de cambio",
    campos: [
      { key: "seguroPct", label: "Seguro (%)", columnaSql: "seguro_pct" },
      { key: "honorariosDespachantePct", label: "Honorarios despachante (%)", columnaSql: "honorarios_despachante_pct" },
      { key: "honorariosDespachanteMinimoUsd", label: "Mínimo honorarios (USD)", columnaSql: "honorarios_despachante_minimo_usd" },
      { key: "gastosBancariosPct", label: "Gastos bancarios (%)", columnaSql: "gastos_bancarios_pct" },
      { key: "tcUsdArs", label: "TC USD/ARS", columnaSql: "tc_usd_ars" },
    ],
  },
];

const TODOS_CAMPOS = SECCIONES.flatMap((s) => s.campos);

export function NuevaVersionParametrosForm({ ultimaVersion }: { ultimaVersion: ParametrosGlobales | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const valoresIniciales: Record<string, string> = {};
  for (const campo of TODOS_CAMPOS) {
    const valor = ultimaVersion ? ultimaVersion[campo.columnaSql] : "";
    valoresIniciales[campo.key] = valor !== null && valor !== undefined ? String(valor) : "";
  }

  const [valores, setValores] = useState<Record<string, string>>(valoresIniciales);

  function handleChange(key: string, value: string) {
    setValores((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const parsed: Partial<CrearParametrosInput> = {};
    for (const campo of TODOS_CAMPOS) {
      const num = parseFloat(valores[campo.key]);
      if (Number.isNaN(num)) {
        toast({ title: "Datos incompletos", description: `Completá "${campo.label}" con un número válido.` });
        return;
      }
      (parsed as Record<string, number>)[campo.key] = num;
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
          Se inserta como una fila nueva; las versiones anteriores nunca se modifican.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {SECCIONES.map((seccion) => (
          <div key={seccion.titulo}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {seccion.titulo}
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {seccion.campos.map((campo) => (
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
          </div>
        ))}
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Guardando..." : "Crear nueva versión"}
        </Button>
      </CardContent>
    </Card>
  );
}

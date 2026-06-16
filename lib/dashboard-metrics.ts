import { differenceInCalendarDays } from "date-fns";

import { calcularAlertas } from "@/lib/alertas";
import type { Carpeta, Costo } from "@/lib/types";

export interface CarpetaConCostos extends Carpeta {
  costos?: Costo[];
}

export interface MetricasDashboard {
  carpetasActivas: number;
  totalFobTransito: number;
  promedioDiasEnAduana: number;
  varianzaPromedioPct: number;
}

const ESTADOS_ACTIVOS: Carpeta["estado"][] = [
  "pre_embarque",
  "en_transito",
  "en_aduana",
];

const ESTADOS_EN_TRANSITO: Carpeta["estado"][] = ["en_transito"];

/** Varianza % entre el total estimado y el total real de costos de una carpeta. */
export function calcularVarianzaCarpeta(costos: Costo[] | undefined): number | null {
  if (!costos || costos.length === 0) return null;

  const conReal = costos.filter((c) => c.monto_real_usd !== null && c.monto_real_usd !== undefined);
  if (conReal.length === 0) return null;

  const totalEstimado = conReal.reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  const totalReal = conReal.reduce((acc, c) => acc + (c.monto_real_usd ?? 0), 0);

  if (totalEstimado === 0) return null;

  return ((totalReal - totalEstimado) / totalEstimado) * 100;
}

/** Días desde el arribo real hasta hoy (o null si no aplica). */
export function diasEnAduana(carpeta: Carpeta): number | null {
  if (carpeta.estado !== "en_aduana" || !carpeta.fecha_arribo_real) return null;
  return differenceInCalendarDays(new Date(), new Date(carpeta.fecha_arribo_real));
}

/** Días hasta el ETA (negativo si ya pasó). */
export function diasHastaEta(carpeta: Carpeta): number | null {
  if (!carpeta.eta) return null;
  return differenceInCalendarDays(new Date(carpeta.eta), new Date());
}

/** True si la carpeta tiene al menos una alerta de severidad "danger". */
export function tieneHitoVencido(carpeta: Carpeta): boolean {
  return calcularAlertas(carpeta).some((a) => a.severidad === "danger");
}

export function calcularMetricas(carpetas: CarpetaConCostos[]): MetricasDashboard {
  const activas = carpetas.filter((c) => ESTADOS_ACTIVOS.includes(c.estado));

  const enTransito = carpetas.filter((c) => ESTADOS_EN_TRANSITO.includes(c.estado));
  const totalFobTransito = enTransito.reduce((acc, c) => acc + (c.fob_total_usd || 0), 0);

  const enAduana = carpetas
    .map((c) => diasEnAduana(c))
    .filter((d): d is number => d !== null);
  const promedioDiasEnAduana =
    enAduana.length > 0 ? enAduana.reduce((a, b) => a + b, 0) / enAduana.length : 0;

  const varianzas = carpetas
    .map((c) => calcularVarianzaCarpeta(c.costos))
    .filter((v): v is number => v !== null);
  const varianzaPromedioPct =
    varianzas.length > 0 ? varianzas.reduce((a, b) => a + b, 0) / varianzas.length : 0;

  return {
    carpetasActivas: activas.length,
    totalFobTransito,
    promedioDiasEnAduana,
    varianzaPromedioPct,
  };
}

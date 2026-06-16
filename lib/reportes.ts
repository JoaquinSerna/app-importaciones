// Funciones puras para el módulo de Reportes y Exportación (F7).

import { differenceInCalendarDays } from "date-fns";

import type { Carpeta, Costo, Sku } from "@/lib/types";

export interface FilaComparativa {
  carpetaId: string;
  numeroCarpeta: string;
  fobUsd: number;
  cifEstimadoUsd: number;
  costoRealUsd: number | null;
  varianzaPct: number | null;
  diasTotales: number | null;
}

/**
 * CIF estimado = FOB + suma de costos estimados de categorías flete y
 * seguro (replica el paso CIF de la cascada sin volver a calcularla,
 * usando los costos ya persistidos para la carpeta).
 */
export function calcularCifEstimado(carpeta: Carpeta, costos: Costo[]): number {
  const fleteYSeguro = costos
    .filter((c) => c.categoria === "flete" || c.categoria === "seguro")
    .reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  return carpeta.fob_total_usd + fleteYSeguro;
}

/** Costo real total = FOB + suma de monto_real_usd de todos los costos con dato real. */
export function calcularCostoRealTotal(carpeta: Carpeta, costos: Costo[]): number | null {
  const conReal = costos.filter((c) => c.monto_real_usd !== null && c.monto_real_usd !== undefined);
  if (conReal.length === 0) return null;
  const totalReal = conReal.reduce((acc, c) => acc + (c.monto_real_usd ?? 0), 0);
  return carpeta.fob_total_usd + totalReal;
}

/** Varianza % entre costo real total y costo estimado total (FOB + estimados). */
export function calcularVarianzaTotalPct(carpeta: Carpeta, costos: Costo[]): number | null {
  const costoReal = calcularCostoRealTotal(carpeta, costos);
  if (costoReal === null) return null;

  const totalEstimado = carpeta.fob_total_usd + costos.reduce((acc, c) => acc + c.monto_estimado_usd, 0);
  if (totalEstimado === 0) return null;

  return ((costoReal - totalEstimado) / totalEstimado) * 100;
}

/** Días totales del proceso: desde fecha_embarque (o pago anticipo) hasta llegada a oficina (o hoy). */
export function calcularDiasTotales(carpeta: Carpeta): number | null {
  const inicio = carpeta.fecha_embarque ?? carpeta.fecha_pago_anticipo;
  if (!inicio) return null;

  const fin = carpeta.fecha_llegada_oficina ?? carpeta.fecha_arribo_real ?? null;
  const fechaFin = fin ? new Date(fin) : new Date();

  return differenceInCalendarDays(fechaFin, new Date(inicio));
}

export function construirFilaComparativa(carpeta: Carpeta, costos: Costo[]): FilaComparativa {
  return {
    carpetaId: carpeta.id,
    numeroCarpeta: carpeta.numero_carpeta,
    fobUsd: carpeta.fob_total_usd,
    cifEstimadoUsd: calcularCifEstimado(carpeta, costos),
    costoRealUsd: calcularCostoRealTotal(carpeta, costos),
    varianzaPct: calcularVarianzaTotalPct(carpeta, costos),
    diasTotales: calcularDiasTotales(carpeta),
  };
}

export interface CostoUnitarioSku {
  skuId: string;
  codigoSku: string | null;
  descripcion: string | null;
  cantidad: number;
  costoUnitarioUsd: number;
  costoUnitarioArs: number;
}

/**
 * Costo unitario por SKU: distribuye el costo total de la carpeta (FOB +
 * costos reales si existen, sino estimados) entre los SKUs proporcionalmente
 * a su participación en el FOB total, y lo divide por la cantidad de cada SKU.
 */
export function calcularCostoUnitarioPorSku(
  skus: Sku[],
  costos: Costo[],
  fobTotalUsd: number,
  tcAplicado: number
): CostoUnitarioSku[] {
  const tieneReal = costos.some((c) => c.monto_real_usd !== null && c.monto_real_usd !== undefined);
  const totalCostosAdicionales = tieneReal
    ? costos.reduce((acc, c) => acc + (c.monto_real_usd ?? c.monto_estimado_usd), 0)
    : costos.reduce((acc, c) => acc + c.monto_estimado_usd, 0);

  const costoTotalCarpeta = fobTotalUsd + totalCostosAdicionales;

  return skus.map((sku) => {
    const fobSku = sku.cantidad * sku.precio_unitario_fob_usd;
    const proporcion = fobTotalUsd > 0 ? fobSku / fobTotalUsd : 0;
    const costoTotalSku = proporcion * costoTotalCarpeta;
    const costoUnitarioUsd = sku.cantidad > 0 ? costoTotalSku / sku.cantidad : 0;

    return {
      skuId: sku.id,
      codigoSku: sku.codigo_sku,
      descripcion: sku.descripcion,
      cantidad: sku.cantidad,
      costoUnitarioUsd,
      costoUnitarioArs: costoUnitarioUsd * tcAplicado,
    };
  });
}

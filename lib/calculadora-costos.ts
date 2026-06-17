// Cascada impositiva de importación en Argentina.
// Funciones puras, testeables, sin dependencias externas.

import type { CategoriaCosto, NcmArancel, ParametrosGlobales } from "@/lib/types";

export interface DatosSimulacion {
  fobTotalUsd: number;
  cbmTotal?: number;
  pesoTotalKg?: number;
  ncm?: string;
  /** Si se especifica, se usa en lugar de gasto_terminal_usd + flete_interno_usd de parámetros. */
  fleteInternacionalUsd?: number;
  /** NCM con sus aranceles específicos. Requerido para calcular impuestos correctamente. */
  ncmArancel?: NcmArancel | null;
}

export interface ResultadoCascada {
  fob: number;
  flete: number;
  seguro: number;
  cif: number;
  derechosImportacion: number;
  tasaEstadistica: number;
  baseImponibleIva: number;
  iva: number;
  ivaAdicional: number;
  anticipoGanancias: number;
  iibb: number;
  honorariosDespachante: number;
  gastosBancarios: number;
  totalCostosUsd: number;
  totalCostosArs: number;
  costoTotalUsd: number;
  costoTotalArs: number;
  tcAplicado: number;
}

/**
 * Calcula la cascada completa de costos/impuestos de importación.
 * Los aranceles (derecho, IVA, IVA adicional, ganancias, IIBB) se toman
 * del NCM seleccionado. Los parámetros globales proveen solo los costos
 * fijos del negocio.
 *
 * Pasos:
 *  1. FOB
 *  2. Flete (internacional, manual o gasto_terminal + flete_interno de parámetros)
 *  3. Seguro = seguro_pct sobre (FOB + Flete)
 *  4. CIF = FOB + Flete + Seguro
 *  5. Derechos de importación = derecho_importacion_pct (del NCM) sobre CIF
 *  6. Tasa estadística = tasa_estadistica_pct sobre CIF, con tope
 *  7. Base imponible IVA = CIF + Derechos + Tasa estadística
 *  8. IVA = iva_pct (del NCM) sobre base imponible
 *  9. IVA adicional = iva_adicional_pct (del NCM, si aplica) sobre base imponible
 * 10. Anticipo ganancias = anticipo_ganancias_pct (del NCM, si aplica) sobre base imponible
 * 11. IIBB = iibb_pct (del NCM, si aplica) sobre base imponible
 * 12. Honorarios despachante = MAX(honorarios_despachante_pct% del FOB, honorarios_despachante_minimo_usd)
 * 13. Gastos bancarios = gastos_bancarios_pct sobre CIF
 */
export function calcularCascada(
  parametros: ParametrosGlobales,
  datos: DatosSimulacion
): ResultadoCascada {
  const fob = datos.fobTotalUsd || 0;
  const ncm = datos.ncmArancel ?? null;

  const flete =
    datos.fleteInternacionalUsd !== undefined
      ? datos.fleteInternacionalUsd
      : (parametros.gasto_terminal_usd || 0) + (parametros.flete_interno_usd || 0);

  const seguro = ((parametros.seguro_pct || 0) / 100) * (fob + flete);

  const cif = fob + flete + seguro;

  // Aranceles: siempre del NCM si está disponible, sino 0
  const derechoImportacionPct = ncm?.derecho_importacion_pct ?? 0;
  const derechosImportacion = (derechoImportacionPct / 100) * cif;

  const tasaEstadisticaSinTope = ((parametros.tasa_estadistica_pct || 0) / 100) * cif;
  const tope = parametros.tasa_estadistica_tope_usd ?? 150;
  const tasaEstadistica = Math.min(tasaEstadisticaSinTope, tope);

  const baseImponibleIva = cif + derechosImportacion + tasaEstadistica;

  const ivaPct = ncm?.iva_pct ?? 21;
  const iva = (ivaPct / 100) * baseImponibleIva;

  const ivaAdicionalPct = ncm?.aplica_iva_adicional ? (ncm.iva_adicional_pct ?? 0) : 0;
  const ivaAdicional = (ivaAdicionalPct / 100) * baseImponibleIva;

  const anticipoGananciasPct = ncm?.aplica_anticipo_ganancias ? (ncm.anticipo_ganancias_pct ?? 0) : 0;
  const anticipoGanancias = (anticipoGananciasPct / 100) * baseImponibleIva;

  const iibbPct = ncm?.aplica_iibb ? (ncm.iibb_pct ?? 0) : 0;
  const iibb = (iibbPct / 100) * baseImponibleIva;

  const honorariosDespachante = Math.max(
    ((parametros.honorarios_despachante_pct ?? 1) / 100) * fob,
    parametros.honorarios_despachante_minimo_usd ?? 450
  );

  const gastosBancarios = ((parametros.gastos_bancarios_pct || 0) / 100) * cif;

  const totalCostosUsd =
    flete +
    seguro +
    derechosImportacion +
    tasaEstadistica +
    iva +
    ivaAdicional +
    anticipoGanancias +
    iibb +
    honorariosDespachante +
    gastosBancarios;

  const tcAplicado = parametros.tc_usd_ars || 0;
  const totalCostosArs = totalCostosUsd * tcAplicado;

  const costoTotalUsd = fob + totalCostosUsd;
  const costoTotalArs = costoTotalUsd * tcAplicado;

  return {
    fob,
    flete,
    seguro,
    cif,
    derechosImportacion,
    tasaEstadistica,
    baseImponibleIva,
    iva,
    ivaAdicional,
    anticipoGanancias,
    iibb,
    honorariosDespachante,
    gastosBancarios,
    totalCostosUsd,
    totalCostosArs,
    costoTotalUsd,
    costoTotalArs,
    tcAplicado,
  };
}

export interface LineaCosto {
  concepto: string;
  categoria: CategoriaCosto;
  monto_estimado_usd: number;
}

/**
 * Convierte un ResultadoCascada en líneas listas para insertar en la tabla `costos`.
 * Omite líneas con monto 0 para no llenar la tabla de ruido (excepto FOB, que no se
 * inserta como costo: el FOB ya vive en carpetas.fob_total_usd).
 */
export function costosComoLineas(resultado: ResultadoCascada): LineaCosto[] {
  const lineas: LineaCosto[] = [
    { concepto: "Flete internacional", categoria: "flete", monto_estimado_usd: resultado.flete },
    { concepto: "Seguro", categoria: "seguro", monto_estimado_usd: resultado.seguro },
    {
      concepto: "Derechos de importación",
      categoria: "impuesto",
      monto_estimado_usd: resultado.derechosImportacion,
    },
    {
      concepto: "Tasa estadística",
      categoria: "impuesto",
      monto_estimado_usd: resultado.tasaEstadistica,
    },
    { concepto: "IVA", categoria: "impuesto", monto_estimado_usd: resultado.iva },
    {
      concepto: "IVA adicional",
      categoria: "impuesto",
      monto_estimado_usd: resultado.ivaAdicional,
    },
    {
      concepto: "Anticipo de ganancias",
      categoria: "impuesto",
      monto_estimado_usd: resultado.anticipoGanancias,
    },
    { concepto: "IIBB", categoria: "impuesto", monto_estimado_usd: resultado.iibb },
    {
      concepto: "Honorarios despachante",
      categoria: "honorarios",
      monto_estimado_usd: resultado.honorariosDespachante,
    },
    {
      concepto: "Gastos bancarios",
      categoria: "bancario",
      monto_estimado_usd: resultado.gastosBancarios,
    },
  ];

  return lineas.filter((l) => l.monto_estimado_usd > 0);
}

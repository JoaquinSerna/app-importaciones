import type { CategoriaCosto, NcmArancel, ParametrosGlobales, TipoContenedor } from "@/lib/types";

// Capacidad por tipo de contenedor: CBM y kg máximos
const CAPACIDAD_CONTENEDOR: Record<TipoContenedor, { cbm: number; kg: number }> = {
  "40HQ": { cbm: 70, kg: 27000 },
  "20HQ": { cbm: 25, kg: 20000 },
  "AEREO": { cbm: Infinity, kg: Infinity },
};

export function calcularCantContenedores(
  cbm?: number,
  pesoKg?: number,
  tipo?: TipoContenedor
): number {
  if (!tipo || tipo === "AEREO") return 1;
  const cap = CAPACIDAD_CONTENEDOR[tipo];
  const porCbm = cbm && cbm > 0 ? Math.ceil(cbm / cap.cbm) : 0;
  const porPeso = pesoKg && pesoKg > 0 ? Math.ceil(pesoKg / cap.kg) : 0;
  return Math.max(porCbm, porPeso, 1);
}

export interface DatosSimulacion {
  fobTotalUsd: number;
  cbmTotal?: number;
  pesoTotalKg?: number;
  ncm?: string;
  tipoContenedor?: TipoContenedor;
  /** Si se especifica, reemplaza al flete_internacional_usd de los parámetros. */
  fleteInternacionalUsd?: number;
  /** NCM con sus aranceles específicos. Requerido para calcular impuestos. */
  ncmArancel?: NcmArancel | null;
}

export interface ResultadoCascada {
  // Tramo internacional
  fob: number;
  fleteInternacional: number;
  peakSeason: number;
  seguro: number;
  cif: number;

  // Impuestos aduaneros
  derechosImportacion: number;
  tasaEstadistica: number;
  baseImponibleIva: number;
  iva: number;
  ivaAdicional: number;
  anticipoGanancias: number;
  iibb: number;

  // Gastos locales (post-aduana)
  thc: number;
  fleteLocal: number;
  tollImportacion: number;
  cantContenedores: number;
  depositoFiscal: number;
  digitalizacionDespacho: number;
  gastosOperativos: number;
  tramitaciones: number;
  honorariosDespachante: number;
  gastosBancarios: number;

  // Subtotales
  subtotalImpuestosUsd: number;
  subtotalGastosLocalesUsd: number;
  totalCostosUsd: number;
  totalCostosArs: number;
  costoTotalUsd: number;
  costoTotalArs: number;
  tcAplicado: number;

  // Flete combinado (para compatibilidad con código existente)
  flete: number;
}

/**
 * Cascada impositiva de importación en Argentina.
 *
 * Secciones:
 *  1. FOB
 *  2. Flete internacional (parámetro o manual)
 *  3. Peak season (parámetro fijo, antes del CIF)
 *  4. Seguro = seguro_pct × (FOB + Flete + Peak season)
 *  5. CIF = FOB + Flete + Peak season + Seguro
 *  6. Derechos de importación = derecho_pct (NCM) × CIF
 *  7. Tasa estadística = tasa_pct (NCM, si aplica) × CIF
 *  8. Base imponible IVA = CIF + Derechos + Tasa estadística
 *  9. IVA, IVA adicional, Anticipo ganancias, IIBB (todos × base imponible)
 * 10. Gastos locales: THC, Flete local, TOLL, Depósito fiscal × contenedores,
 *     Digitalización, Gastos operativos, Tramitaciones, Honorarios, Bancarios
 */
export function calcularCascada(
  parametros: ParametrosGlobales,
  datos: DatosSimulacion
): ResultadoCascada {
  const fob = datos.fobTotalUsd || 0;
  const ncm = datos.ncmArancel ?? null;

  // Tramo internacional
  const fleteInternacional =
    datos.fleteInternacionalUsd !== undefined
      ? datos.fleteInternacionalUsd
      : (parametros.flete_internacional_usd || 0);

  const peakSeason = parametros.peak_season_usd || 0;

  const seguro =
    ((parametros.seguro_pct || 0) / 100) * (fob + fleteInternacional + peakSeason);

  const cif = fob + fleteInternacional + peakSeason + seguro;

  // Impuestos sobre CIF
  const derechoImportacionPct = ncm?.derecho_importacion_pct ?? 0;
  const derechosImportacion = (derechoImportacionPct / 100) * cif;

  const tasaEstadistica = (ncm?.aplica_tasa_estadistica ?? false)
    ? ((ncm?.tasa_estadistica_pct ?? 0) / 100) * cif
    : 0;

  const baseImponibleIva = cif + derechosImportacion + tasaEstadistica;

  const ivaPct = ncm?.iva_pct ?? 21;
  const iva = (ivaPct / 100) * baseImponibleIva;

  const ivaAdicionalPct = ncm?.aplica_iva_adicional ? (ncm.iva_adicional_pct ?? 0) : 0;
  const ivaAdicional = (ivaAdicionalPct / 100) * baseImponibleIva;

  const anticipoGananciasPct = ncm?.aplica_anticipo_ganancias
    ? (ncm.anticipo_ganancias_pct ?? 0)
    : 0;
  const anticipoGanancias = (anticipoGananciasPct / 100) * baseImponibleIva;

  const iibbPct = ncm?.aplica_iibb ? (ncm.iibb_pct ?? 0) : 0;
  const iibb = (iibbPct / 100) * baseImponibleIva;

  // Gastos locales
  const thc = parametros.thc_usd || 0;
  const fleteLocal = parametros.flete_interno_usd || 0;
  const tollImportacion = parametros.toll_importacion_usd || 0;

  const cantContenedores = calcularCantContenedores(
    datos.cbmTotal,
    datos.pesoTotalKg,
    datos.tipoContenedor
  );
  const depositoFiscal = (parametros.gasto_terminal_usd || 0) * cantContenedores;

  const digitalizacionDespacho = parametros.digitalizacion_usd || 0;
  const gastosOperativos = parametros.gastos_operativos_usd || 0;
  const tramitaciones = parametros.tramitaciones_usd || 0;

  const honorariosDespachante = Math.max(
    ((parametros.honorarios_despachante_pct ?? 1) / 100) * fob,
    parametros.honorarios_despachante_minimo_usd ?? 450
  );

  const gastosBancarios = ((parametros.gastos_bancarios_pct || 0) / 100) * cif;

  // Subtotales
  const subtotalImpuestosUsd =
    derechosImportacion + tasaEstadistica + iva + ivaAdicional + anticipoGanancias + iibb;

  const subtotalGastosLocalesUsd =
    thc +
    fleteLocal +
    tollImportacion +
    depositoFiscal +
    digitalizacionDespacho +
    gastosOperativos +
    tramitaciones +
    honorariosDespachante +
    gastosBancarios;

  const totalCostosUsd =
    fleteInternacional +
    peakSeason +
    seguro +
    subtotalImpuestosUsd +
    subtotalGastosLocalesUsd;

  const tcAplicado = parametros.tc_usd_ars || 0;
  const totalCostosArs = totalCostosUsd * tcAplicado;
  const costoTotalUsd = fob + totalCostosUsd;
  const costoTotalArs = costoTotalUsd * tcAplicado;

  return {
    fob,
    fleteInternacional,
    peakSeason,
    seguro,
    cif,
    derechosImportacion,
    tasaEstadistica,
    baseImponibleIva,
    iva,
    ivaAdicional,
    anticipoGanancias,
    iibb,
    thc,
    fleteLocal,
    tollImportacion,
    cantContenedores,
    depositoFiscal,
    digitalizacionDespacho,
    gastosOperativos,
    tramitaciones,
    honorariosDespachante,
    gastosBancarios,
    subtotalImpuestosUsd,
    subtotalGastosLocalesUsd,
    totalCostosUsd,
    totalCostosArs,
    costoTotalUsd,
    costoTotalArs,
    tcAplicado,
    // alias para compatibilidad
    flete: fleteInternacional,
  };
}

export interface LineaCosto {
  concepto: string;
  categoria: CategoriaCosto;
  monto_estimado_usd: number;
}

export function costosComoLineas(resultado: ResultadoCascada): LineaCosto[] {
  const lineas: LineaCosto[] = [
    { concepto: "Flete internacional", categoria: "flete", monto_estimado_usd: resultado.fleteInternacional },
    { concepto: "Peak Season", categoria: "flete", monto_estimado_usd: resultado.peakSeason },
    { concepto: "Seguro", categoria: "seguro", monto_estimado_usd: resultado.seguro },
    { concepto: "Derechos de importación", categoria: "impuesto", monto_estimado_usd: resultado.derechosImportacion },
    { concepto: "Tasa estadística", categoria: "impuesto", monto_estimado_usd: resultado.tasaEstadistica },
    { concepto: "IVA", categoria: "impuesto", monto_estimado_usd: resultado.iva },
    { concepto: "IVA adicional", categoria: "impuesto", monto_estimado_usd: resultado.ivaAdicional },
    { concepto: "Anticipo de ganancias", categoria: "impuesto", monto_estimado_usd: resultado.anticipoGanancias },
    { concepto: "IIBB", categoria: "impuesto", monto_estimado_usd: resultado.iibb },
    { concepto: "THC", categoria: "otro", monto_estimado_usd: resultado.thc },
    { concepto: "Flete local", categoria: "flete", monto_estimado_usd: resultado.fleteLocal },
    { concepto: "TOLL Importación", categoria: "otro", monto_estimado_usd: resultado.tollImportacion },
    { concepto: `Depósito fiscal (${resultado.cantContenedores} cont.)`, categoria: "otro", monto_estimado_usd: resultado.depositoFiscal },
    { concepto: "Digitalización de despacho", categoria: "otro", monto_estimado_usd: resultado.digitalizacionDespacho },
    { concepto: "Gastos operativos", categoria: "otro", monto_estimado_usd: resultado.gastosOperativos },
    { concepto: "Tramitaciones", categoria: "otro", monto_estimado_usd: resultado.tramitaciones },
    { concepto: "Honorarios despachante", categoria: "honorarios", monto_estimado_usd: resultado.honorariosDespachante },
    { concepto: "Gastos bancarios", categoria: "bancario", monto_estimado_usd: resultado.gastosBancarios },
  ];

  return lineas.filter((l) => l.monto_estimado_usd > 0);
}

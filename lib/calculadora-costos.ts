import type { CategoriaCosto, NcmArancel, ParametrosGlobales, TipoContenedor, TipoImportacion } from "@/lib/types";

// Capacidad por tipo de contenedor: CBM y kg máximos
const CAPACIDAD_CONTENEDOR: Record<TipoContenedor, { cbm: number; kg: number }> = {
  "40HQ": { cbm: 70, kg: 27000 },
  "20HQ": { cbm: 25, kg: 20000 },
  "AEREO": { cbm: Infinity, kg: Infinity },
};

/**
 * Calcula el factor de contenedores.
 * - contenedorLleno=true  → Math.ceil (se paga el contenedor entero aunque no esté lleno)
 * - contenedorLleno=false → valor fraccionario (se paga proporcionalmente a la ocupación)
 * Devuelve el factor como número (puede ser 0.5, 1.3, 2, etc.)
 */
export function calcularFactorContenedor(
  cbm?: number,
  pesoKg?: number,
  tipo?: TipoContenedor,
  contenedorLleno = true
): number {
  if (!tipo || tipo === "AEREO") return 1;
  const cap = CAPACIDAD_CONTENEDOR[tipo];
  const porCbm = cbm && cbm > 0 ? cbm / cap.cbm : 0;
  const porPeso = pesoKg && pesoKg > 0 ? pesoKg / cap.kg : 0;
  const factor = Math.max(porCbm, porPeso, 0);
  if (factor === 0) return 1;
  return contenedorLleno ? Math.ceil(factor) : parseFloat(factor.toFixed(4));
}

/** @deprecated usa calcularFactorContenedor */
export function calcularCantContenedores(
  cbm?: number,
  pesoKg?: number,
  tipo?: TipoContenedor
): number {
  return calcularFactorContenedor(cbm, pesoKg, tipo, true);
}

/**
 * Cuando una carpeta tiene SKUs con NCM distintos, construye un NCM "sintético"
 * con las alícuotas promediadas, ponderadas por el FOB de cada SKU
 * (cantidad × precio_unitario_fob_usd). Así la cascada de impuestos refleja
 * la mezcla real de productos en vez de asumir un solo NCM para toda la carpeta.
 */
export function calcularArancelPonderado(
  skus: { fobUsd: number; ncm: NcmArancel | null }[]
): NcmArancel | null {
  const conNcm = skus.filter((s) => s.ncm && s.fobUsd > 0);
  if (conNcm.length === 0) return null;

  const fobTotal = conNcm.reduce((acc, s) => acc + s.fobUsd, 0);
  if (fobTotal <= 0) return conNcm[0].ncm;

  const ponderar = (campo: keyof NcmArancel) =>
    conNcm.reduce((acc, s) => acc + (s.fobUsd / fobTotal) * (Number(s.ncm![campo]) || 0), 0);

  const algunAplica = (campo: keyof NcmArancel) => conNcm.some((s) => Boolean(s.ncm![campo]));

  return {
    id: "ponderado",
    codigo_ncm: conNcm.map((s) => s.ncm!.codigo_ncm).join(" + "),
    descripcion: "NCM ponderado por FOB (varios SKUs)",
    derecho_importacion_pct: ponderar("derecho_importacion_pct"),
    iva_pct: ponderar("iva_pct"),
    aplica_iva_adicional: algunAplica("aplica_iva_adicional"),
    iva_adicional_pct: ponderar("iva_adicional_pct"),
    aplica_anticipo_ganancias: algunAplica("aplica_anticipo_ganancias"),
    anticipo_ganancias_pct: ponderar("anticipo_ganancias_pct"),
    aplica_iibb: algunAplica("aplica_iibb"),
    iibb_pct: ponderar("iibb_pct"),
    aplica_tasa_estadistica: algunAplica("aplica_tasa_estadistica"),
    tasa_estadistica_pct: ponderar("tasa_estadistica_pct"),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export interface DatosSimulacion {
  fobTotalUsd: number;
  cbmTotal?: number;
  pesoTotalKg?: number;
  ncm?: string;
  tipoContenedor?: TipoContenedor;
  /**
   * true  = se paga el contenedor entero (default). Ej: 35 CBM en un 40HQ → factor 1.
   * false = proporcional. Ej: 35 CBM en un 40HQ → factor 0.5.
   */
  contenedorLleno?: boolean;
  /** Si se especifica, reemplaza al flete_internacional_usd de los parámetros. */
  fleteInternacionalUsd?: number;
  /** NCM con sus aranceles específicos. Requerido para calcular impuestos. */
  ncmArancel?: NcmArancel | null;
  /**
   * "bien_de_cambio" (default) = paga todo lo que tenga configurado el NCM
   * (derechos, IVA, IVA adicional, anticipo ganancias, IIBB, tasa estadística).
   * "bien_de_uso" = solo paga derechos de importación + IVA.
   */
  tipoImportacion?: TipoImportacion;
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
  factorContenedor: number; // puede ser fraccionario (0.5, 1.3) o entero (1, 2)
  cantContenedores: number; // alias = factorContenedor
  depositoFiscal: number;
  digitalizacionDespacho: number;
  gastosOperativos: number;
  gastosLocales: number;
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

  // Factor de contenedores (entero o fraccionario según modo)
  const contenedorLleno = datos.contenedorLleno !== false; // default true
  const factorContenedor = calcularFactorContenedor(
    datos.cbmTotal,
    datos.pesoTotalKg,
    datos.tipoContenedor,
    contenedorLleno
  );

  // Tramo internacional — los costos por contenedor se multiplican por el factor
  const fleteInternacional =
    datos.fleteInternacionalUsd !== undefined
      ? datos.fleteInternacionalUsd // flete manual = costo real, no se escala
      : (parametros.flete_internacional_usd || 0) * factorContenedor;

  const peakSeason = (parametros.peak_season_usd || 0) * factorContenedor;

  const seguro =
    ((parametros.seguro_pct || 0) / 100) * (fob + fleteInternacional + peakSeason);

  const cif = fob + fleteInternacional + peakSeason + seguro;

  // Bien de uso: solo paga derechos de importación + IVA (no tasa estadística,
  // IVA adicional, anticipo de ganancias ni IIBB, aunque el NCM los tenga configurados).
  const esBienDeUso = datos.tipoImportacion === "bien_de_uso";

  // Impuestos sobre CIF
  const derechoImportacionPct = ncm?.derecho_importacion_pct ?? 0;
  const derechosImportacion = (derechoImportacionPct / 100) * cif;

  const tasaEstadistica = !esBienDeUso && (ncm?.aplica_tasa_estadistica ?? false)
    ? ((ncm?.tasa_estadistica_pct ?? 0) / 100) * cif
    : 0;

  const baseImponibleIva = cif + derechosImportacion + tasaEstadistica;

  const ivaPct = ncm?.iva_pct ?? 21;
  const iva = (ivaPct / 100) * baseImponibleIva;

  const ivaAdicionalPct = !esBienDeUso && ncm?.aplica_iva_adicional ? (ncm.iva_adicional_pct ?? 0) : 0;
  const ivaAdicional = (ivaAdicionalPct / 100) * baseImponibleIva;

  const anticipoGananciasPct = !esBienDeUso && ncm?.aplica_anticipo_ganancias
    ? (ncm.anticipo_ganancias_pct ?? 0)
    : 0;
  const anticipoGanancias = (anticipoGananciasPct / 100) * baseImponibleIva;

  const iibbPct = !esBienDeUso && ncm?.aplica_iibb ? (ncm.iibb_pct ?? 0) : 0;
  const iibb = (iibbPct / 100) * baseImponibleIva;

  // Gastos locales — los que varían por contenedor se multiplican por factorContenedor
  const thc = (parametros.thc_usd || 0) * factorContenedor;
  const fleteLocal = (parametros.flete_interno_usd || 0) * factorContenedor;
  const tollImportacion = (parametros.toll_importacion_usd || 0) * factorContenedor;
  const depositoFiscal = (parametros.gasto_terminal_usd || 0) * factorContenedor;

  const cantContenedores = factorContenedor; // alias para mostrar en UI

  const digitalizacionDespacho = parametros.digitalizacion_usd || 0;
  const gastosOperativos = parametros.gastos_operativos_usd || 0;
  const gastosLocales = parametros.gastos_locales_usd || 0;
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
    gastosLocales +
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
    factorContenedor,
    cantContenedores,
    depositoFiscal,
    digitalizacionDespacho,
    gastosOperativos,
    gastosLocales,
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
    { concepto: "Gastos locales", categoria: "otro", monto_estimado_usd: resultado.gastosLocales },
    { concepto: "Tramitaciones", categoria: "otro", monto_estimado_usd: resultado.tramitaciones },
    { concepto: "Honorarios despachante", categoria: "honorarios", monto_estimado_usd: resultado.honorariosDespachante },
    { concepto: "Gastos bancarios", categoria: "bancario", monto_estimado_usd: resultado.gastosBancarios },
  ];

  return lineas.filter((l) => l.monto_estimado_usd > 0);
}

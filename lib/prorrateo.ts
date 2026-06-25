// Motor de prorrateo: distribuye un monto entre items según un criterio
// proporcional (cbm, peso, fob o unidades).

export type CriterioProrrateo = "cbm" | "peso" | "fob" | "unidades";

// Conceptos que son % del valor de la mercadería (CIF/FOB) y por lo tanto se
// prorratean por FOB; el resto se prorratea por volumen (CBM).
const PATRONES_FOB = [/seguro/i, /derecho/i, /tasa estad/i, /\biva\b/i, /ganancia/i, /iibb/i, /honorario/i, /bancari/i];

export function criterioPorConcepto(concepto: string): CriterioProrrateo {
  return PATRONES_FOB.some((re) => re.test(concepto)) ? "fob" : "cbm";
}

// IVA facturado por la naviera o el despachante es crédito fiscal
// recuperable, no un costo real de la importación.
export function esCreditoFiscal(concepto: string): boolean {
  return /\biva\b/i.test(concepto);
}

export interface ItemProrrateable {
  id: string;
  cbm?: number;
  peso?: number;
  fob?: number;
  unidades?: number;
}

export interface MontoAsignado {
  id: string;
  montoAsignado: number;
}

function valorCriterio(item: ItemProrrateable, criterio: CriterioProrrateo): number {
  switch (criterio) {
    case "cbm":
      return item.cbm ?? 0;
    case "peso":
      return item.peso ?? 0;
    case "fob":
      return item.fob ?? 0;
    case "unidades":
      return item.unidades ?? 0;
    default:
      return 0;
  }
}

/**
 * Distribuye `monto` entre `items` proporcionalmente al peso relativo de cada
 * item según `criterio`. Si el total del criterio es 0 (o no hay items),
 * se distribuye equitativamente entre todos los items para evitar división
 * por cero.
 */
export function prorratear(
  monto: number,
  items: ItemProrrateable[],
  criterio: CriterioProrrateo
): MontoAsignado[] {
  if (items.length === 0) return [];

  const valores = items.map((item) => valorCriterio(item, criterio));
  const total = valores.reduce((acc, v) => acc + v, 0);

  if (total <= 0) {
    const montoIgual = monto / items.length;
    return items.map((item) => ({ id: item.id, montoAsignado: montoIgual }));
  }

  return items.map((item, i) => ({
    id: item.id,
    montoAsignado: (valores[i] / total) * monto,
  }));
}

export interface CostoContenedor {
  id: string;
  monto_estimado_usd: number;
  /** criterio de prorrateo asociado a este costo (ej. desde criterios_prorrateo) */
  criterio: CriterioProrrateo;
}

export interface CarpetaProrrateable {
  id: string;
  cbm?: number;
  peso?: number;
  fob?: number;
  unidades?: number;
}

export interface MontoPorCarpeta {
  carpetaId: string;
  costoId: string;
  montoAsignado: number;
}

/**
 * Prorratea una lista de costos de nivel=contenedor entre las carpetas
 * asignadas a ese contenedor, respetando el criterio configurado para
 * cada costo individual.
 */
export function prorratearCostosContenedor(
  costos: CostoContenedor[],
  carpetas: CarpetaProrrateable[]
): MontoPorCarpeta[] {
  const resultado: MontoPorCarpeta[] = [];

  for (const costo of costos) {
    const items: ItemProrrateable[] = carpetas.map((c) => ({
      id: c.id,
      cbm: c.cbm,
      peso: c.peso,
      fob: c.fob,
      unidades: c.unidades,
    }));

    const asignaciones = prorratear(costo.monto_estimado_usd, items, costo.criterio);

    for (const asignacion of asignaciones) {
      resultado.push({
        carpetaId: asignacion.id,
        costoId: costo.id,
        montoAsignado: asignacion.montoAsignado,
      });
    }
  }

  return resultado;
}

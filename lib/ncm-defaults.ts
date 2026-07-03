// Valores por defecto para simular costos de un ítem cuya clasificación NCM
// todavía no corrió o no fue confirmada por el usuario. Permiten que el
// simulador (SimuladorForm) y la creación de carpeta calculen una cascada
// aproximada sin bloquear al usuario esperando la IA.
//
// Fijos siempre (no varían por producto): IIBB e IVA adicional/Anticipo de
// ganancias son percepciones estándar de importación; el único valor que de
// verdad se "adivina" acá es el Derecho de Importación (DIE), que después se
// reemplaza por el real del nomenclador de AFIP en cuanto el usuario confirma
// el NCM del ítem.

import type { NcmArancel } from "@/lib/types";

type CamposArancel = Pick<
  NcmArancel,
  | "derecho_importacion_pct"
  | "iva_pct"
  | "aplica_iva_adicional"
  | "iva_adicional_pct"
  | "aplica_anticipo_ganancias"
  | "anticipo_ganancias_pct"
  | "aplica_iibb"
  | "iibb_pct"
  | "aplica_tasa_estadistica"
  | "tasa_estadistica_pct"
>;

export const NCM_ARANCEL_DEFAULT: CamposArancel = {
  derecho_importacion_pct: 20,
  iva_pct: 21,
  aplica_iva_adicional: true,
  iva_adicional_pct: 20,
  aplica_anticipo_ganancias: true,
  anticipo_ganancias_pct: 6,
  aplica_iibb: true,
  iibb_pct: 2.5,
  aplica_tasa_estadistica: true,
  tasa_estadistica_pct: 3,
};

// La percepción de IVA adicional de importación es, en la práctica de AFIP,
// 20% cuando el IVA general es 21% y 10% cuando el IVA general es 10.5%.
export function ivaAdicionalPct(ivaPct: 21 | 10.5): number {
  return ivaPct === 21 ? 20 : 10;
}

export interface DatosNcmItem {
  /** null = sin clasificar/confirmar todavía. */
  ncmCodigo: string | null;
  diePct: number;
  ivaPct: 21 | 10.5;
  pagaIvaAdicional: boolean;
}

/**
 * Arma un `NcmArancel` "en memoria" (no persistido) para un ítem, usando sus
 * datos reales si está clasificado/confirmado o el default provisorio si no.
 * Se usa tanto en el cliente (SimuladorForm, para la cascada en vivo) como en
 * el server action de creación de carpeta — ambos necesitan que
 * `calcularArancelPonderado()` pondere TODOS los ítems, nunca que excluya uno
 * por no tener NCM confirmado.
 */
export function construirNcmArancelProvisorio(item: DatosNcmItem): NcmArancel {
  const clasificado = item.ncmCodigo !== null;
  const diePct = clasificado ? item.diePct : NCM_ARANCEL_DEFAULT.derecho_importacion_pct;
  const ivaPct = clasificado ? item.ivaPct : (NCM_ARANCEL_DEFAULT.iva_pct as 21 | 10.5);
  const pagaIvaAdicional = clasificado ? item.pagaIvaAdicional : NCM_ARANCEL_DEFAULT.aplica_iva_adicional;

  return {
    id: "provisorio",
    codigo_ncm: item.ncmCodigo ?? "SIN CLASIFICAR",
    descripcion: null,
    derecho_importacion_pct: diePct,
    iva_pct: ivaPct,
    aplica_iva_adicional: pagaIvaAdicional,
    iva_adicional_pct: pagaIvaAdicional ? ivaAdicionalPct(ivaPct) : 0,
    aplica_anticipo_ganancias: NCM_ARANCEL_DEFAULT.aplica_anticipo_ganancias,
    anticipo_ganancias_pct: NCM_ARANCEL_DEFAULT.anticipo_ganancias_pct,
    aplica_iibb: NCM_ARANCEL_DEFAULT.aplica_iibb,
    iibb_pct: NCM_ARANCEL_DEFAULT.iibb_pct,
    aplica_tasa_estadistica: NCM_ARANCEL_DEFAULT.aplica_tasa_estadistica,
    tasa_estadistica_pct: NCM_ARANCEL_DEFAULT.tasa_estadistica_pct,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

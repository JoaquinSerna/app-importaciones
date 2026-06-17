// Tipos TS que matchean el schema SQL (supabase/migrations/0001_init.sql)

export type RolUsuario = "admin" | "operador" | "viewer";

export type TipoContenedor = "FCL_20" | "FCL_40" | "FCL_40HC" | "LCL" | "AEREO";

export type EstadoCarpeta =
  | "simulacion"
  | "pre_embarque"
  | "en_transito"
  | "en_aduana"
  | "finalizada";

export type NivelCosto = "carpeta" | "contenedor";

export type CategoriaCosto =
  | "impuesto"
  | "flete"
  | "seguro"
  | "honorarios"
  | "bancario"
  | "imprevistos"
  | "otro";

export type OrigenCosto = "simulador" | "manual" | "pdf_despachante";

export type CriterioProrrateoTipo = "cbm" | "peso" | "fob" | "unidades";

export interface Profile {
  id: string;
  rol: RolUsuario;
  nombre: string | null;
  created_at: string;
}

export interface ParametrosGlobales {
  id: string;
  gasto_terminal_usd: number;
  flete_interno_usd: number;
  seguro_pct: number;
  honorarios_despachante_pct: number;
  honorarios_despachante_minimo_usd: number;
  tc_usd_ars: number;
  gastos_bancarios_pct: number;
  created_at: string;
  created_by: string | null;
}

export interface NcmArancel {
  id: string;
  codigo_ncm: string;
  descripcion: string | null;
  derecho_importacion_pct: number;
  iva_pct: number;
  aplica_iva_adicional: boolean;
  iva_adicional_pct: number;
  aplica_anticipo_ganancias: boolean;
  anticipo_ganancias_pct: number;
  aplica_iibb: boolean;
  iibb_pct: number;
  aplica_tasa_estadistica: boolean;
  tasa_estadistica_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  pais: string;
  contacto: string | null;
  moneda_pago: string;
  created_at: string;
}

export interface Contenedor {
  id: string;
  numero_contenedor: string | null;
  tipo: TipoContenedor;
  naviera: string | null;
  bl_number: string | null;
  fecha_zarpe: string | null;
  eta_contenedor: string | null;
  estado_contenedor: string | null;
  observaciones: string | null;
  created_at: string;
}

export interface Carpeta {
  id: string;
  numero_carpeta: string;
  proveedor_id: string | null;
  incoterm: string;
  moneda: string;
  fob_total_usd: number;
  cbm_total: number | null;
  peso_total_kg: number | null;
  ncm: string | null;
  ncm_id: string | null;
  parametros_snapshot_id: string;
  tc_snapshot: number;
  contenedor_id: string | null;
  estado: EstadoCarpeta;
  fecha_pago_anticipo: string | null;
  fecha_pago_saldo: string | null;
  fecha_embarque: string | null;
  eta: string | null;
  fecha_arribo_real: string | null;
  fecha_liberacion: string | null;
  fecha_llegada_oficina: string | null;
  pct_anticipo: number;
  pct_saldo: number;
  monto_anticipo_usd: number | null;
  monto_saldo_usd: number | null;
  created_at: string;
  created_by: string | null;
}

export interface Sku {
  id: string;
  carpeta_id: string;
  codigo_sku: string | null;
  descripcion: string | null;
  cantidad: number;
  precio_unitario_fob_usd: number;
  peso_kg: number | null;
  cbm: number | null;
  created_at: string;
}

export interface Costo {
  id: string;
  carpeta_id: string | null;
  contenedor_id: string | null;
  nivel: NivelCosto;
  concepto: string;
  categoria: CategoriaCosto;
  origen: OrigenCosto;
  monto_estimado_usd: number;
  monto_real_usd: number | null;
  tc_aplicado: number | null;
  notas: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CriterioProrrateo {
  id: string;
  contenedor_id: string;
  costo_id: string;
  criterio: CriterioProrrateoTipo;
  created_at: string;
}

// ---------------------------------------------------------------------
// F4: Extracción de PDF de liquidación de despachante de aduana
// ---------------------------------------------------------------------

export interface ConceptoLiquidacion {
  concepto: string;
  monto_usd: number | null;
  monto_ars: number | null;
}

export interface LiquidacionExtraida {
  numero_despacho: string | null;
  tc_utilizado: number | null;
  conceptos: ConceptoLiquidacion[];
}

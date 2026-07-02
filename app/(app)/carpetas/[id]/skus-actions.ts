"use server";

import { revalidatePath } from "next/cache";

import { calcularArancelPonderado, calcularCascada, costosComoLineas } from "@/lib/calculadora-costos";
import { clasificarDescripcionNcm, type ClasificacionNcm } from "@/lib/ncm-clasificador";
import { createClient } from "@/lib/supabase/server";
import type { NcmArancel, ParametrosGlobales, TipoImportacion } from "@/lib/types";

// El anti-dumping ya no se prorratea por este flag: lo calcula
// confirmarAsignacionDI a partir de la asignación del despacho a cada SKU
// (ver app/(app)/contenedores/[id]/actions.ts). Este flag queda como
// referencia de qué SKUs paga(ron) anti-dumping en la última asignación.
export async function actualizarPagaDumping(carpetaId: string, skuId: string, pagaDumping: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("skus").update({ paga_dumping: pagaDumping }).eq("id", skuId);
  if (error) {
    console.error("actualizarPagaDumping", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export interface SkuInput {
  codigoSku?: string;
  descripcion?: string;
  cantidad: number;
  precioUnitarioFobUsd: number;
  pesoKg?: number;
  cbm?: number;
  ncmId?: string | null;
}

function datosSku(input: SkuInput) {
  return {
    codigo_sku: input.codigoSku?.trim() || null,
    descripcion: input.descripcion?.trim() || null,
    cantidad: input.cantidad,
    precio_unitario_fob_usd: input.precioUnitarioFobUsd,
    peso_kg: input.pesoKg ?? null,
    cbm: input.cbm ?? null,
    ncm_id: input.ncmId || null,
  };
}

export async function agregarSku(carpetaId: string, input: SkuInput): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("skus").insert({ carpeta_id: carpetaId, ...datosSku(input) });
  if (error) {
    console.error("agregarSku", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export async function actualizarSku(carpetaId: string, skuId: string, input: SkuInput): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("skus").update(datosSku(input)).eq("id", skuId);
  if (error) {
    console.error("actualizarSku", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

export async function eliminarSku(carpetaId: string, skuId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("skus").delete().eq("id", skuId);
  if (error) {
    console.error("eliminarSku", error);
    return { error: error.message };
  }
  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

// Recalcula la cascada de impuestos de la carpeta usando el NCM ponderado por
// FOB de todos sus SKUs, y reemplaza los costos generados por el simulador
// (no toca costos manuales ni montos reales ya cargados).
export async function recalcularCostosDesdeSkus(carpetaId: string): Promise<{ error?: string }> {
  const supabase = createClient();

  const { data: carpeta } = await supabase.from("carpetas").select("*").eq("id", carpetaId).single();
  if (!carpeta) return { error: "Carpeta no encontrada." };

  const { data: skus } = await supabase
    .from("skus")
    .select("*, ncm_aranceles(*)")
    .eq("carpeta_id", carpetaId);
  if (!skus || skus.length === 0) return { error: "No hay SKUs cargados para recalcular." };

  const { data: parametros } = await supabase
    .from("parametros_globales")
    .select("*")
    .eq("id", carpeta.parametros_snapshot_id)
    .single();
  if (!parametros) return { error: "No se encontraron los parámetros de la carpeta." };

  const skusParaPonderar = skus.map((s) => ({
    fobUsd: (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0),
    ncm: (s.ncm_aranceles as unknown as NcmArancel | null) ?? null,
  }));

  const arancelPonderado = calcularArancelPonderado(skusParaPonderar);
  if (!arancelPonderado) {
    return { error: "Ningún SKU tiene un NCM asignado todavía. Asignales un NCM a los SKUs primero." };
  }

  // Si los SKUs tienen su propio CBM/peso cargado, usamos la suma; sino, el de la carpeta.
  const cbmSkus = skus.reduce((acc, s) => acc + (s.cbm ?? 0), 0);
  const pesoSkus = skus.reduce((acc, s) => acc + (s.peso_kg ?? 0), 0);

  const resultado = calcularCascada(parametros as ParametrosGlobales, {
    fobTotalUsd: carpeta.fob_total_usd,
    cbmTotal: cbmSkus > 0 ? cbmSkus : carpeta.cbm_total ?? undefined,
    pesoTotalKg: pesoSkus > 0 ? pesoSkus : carpeta.peso_total_kg ?? undefined,
    ncmArancel: arancelPonderado,
    tipoImportacion: carpeta.tipo_importacion ?? "bien_de_cambio",
  });
  const lineas = costosComoLineas(resultado);

  await supabase.from("costos").delete().eq("carpeta_id", carpetaId).eq("origen", "simulador");

  if (lineas.length > 0) {
    const { error } = await supabase.from("costos").insert(
      lineas.map((linea) => ({
        carpeta_id: carpetaId,
        nivel: "carpeta" as const,
        concepto: linea.concepto,
        categoria: linea.categoria,
        origen: "simulador" as const,
        monto_estimado_usd: linea.monto_estimado_usd,
        tc_aplicado: parametros.tc_usd_ars,
      }))
    );
    if (error) {
      console.error("recalcularCostosDesdeSkus: insert costos", error);
      return { error: error.message };
    }
  }

  await supabase.from("carpetas").update({ ncm: arancelPonderado.codigo_ncm }).eq("id", carpetaId);

  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

// Cambia bien de cambio / bien de uso y recalcula los costos del simulador
// con el NCM que corresponda (ponderado por SKUs si hay, o el de la carpeta si no).
export async function actualizarTipoImportacion(
  carpetaId: string,
  tipoImportacion: TipoImportacion
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error: errorUpdate } = await supabase
    .from("carpetas")
    .update({ tipo_importacion: tipoImportacion })
    .eq("id", carpetaId);
  if (errorUpdate) {
    console.error("actualizarTipoImportacion", errorUpdate);
    return { error: errorUpdate.message };
  }

  const { data: skus } = await supabase
    .from("skus")
    .select("*, ncm_aranceles(*)")
    .eq("carpeta_id", carpetaId);

  if (skus && skus.length > 0 && skus.some((s) => s.ncm_id)) {
    return recalcularCostosDesdeSkus(carpetaId);
  }

  const { data: carpeta } = await supabase.from("carpetas").select("*").eq("id", carpetaId).single();
  if (!carpeta) return { error: "Carpeta no encontrada." };
  if (!carpeta.ncm_id) {
    revalidatePath(`/carpetas/${carpetaId}`);
    return {};
  }

  const [{ data: ncmArancel }, { data: parametros }] = await Promise.all([
    supabase.from("ncm_aranceles").select("*").eq("id", carpeta.ncm_id).single(),
    supabase.from("parametros_globales").select("*").eq("id", carpeta.parametros_snapshot_id).single(),
  ]);
  if (!ncmArancel || !parametros) {
    return { error: "No se pudo recalcular: falta el NCM o los parámetros de la carpeta." };
  }

  const resultado = calcularCascada(parametros as ParametrosGlobales, {
    fobTotalUsd: carpeta.fob_total_usd,
    cbmTotal: carpeta.cbm_total ?? undefined,
    pesoTotalKg: carpeta.peso_total_kg ?? undefined,
    ncmArancel: ncmArancel as NcmArancel,
    tipoImportacion,
  });
  const lineas = costosComoLineas(resultado);

  await supabase.from("costos").delete().eq("carpeta_id", carpetaId).eq("origen", "simulador");
  if (lineas.length > 0) {
    const { error } = await supabase.from("costos").insert(
      lineas.map((linea) => ({
        carpeta_id: carpetaId,
        nivel: "carpeta" as const,
        concepto: linea.concepto,
        categoria: linea.categoria,
        origen: "simulador" as const,
        monto_estimado_usd: linea.monto_estimado_usd,
        tc_aplicado: parametros.tc_usd_ars,
      }))
    );
    if (error) {
      console.error("actualizarTipoImportacion: insert costos", error);
      return { error: error.message };
    }
  }

  revalidatePath(`/carpetas/${carpetaId}`);
  return {};
}

// ---------------------------------------------------------------------
// Auto-clasificación NCM: propone el NCM de cada SKU sin clasificar a
// partir de su descripción (Proforma), usando el nomenclador de AFIP
// embebido + Claude Sonnet (lib/ncm-clasificador.ts). No escribe nada en la
// base — solo propone; confirmarNcmSkus() es la que persiste.
// ---------------------------------------------------------------------

export interface ClasificacionSkuResultado extends ClasificacionNcm {
  sku_id: string;
  sku_codigo: string | null;
  descripcion_sku: string;
}

function clasificacionFallida(razonamiento: string): ClasificacionNcm {
  return {
    ncm_propuesto: null,
    descripcion_oficial: null,
    die_pct: null,
    confianza: "baja",
    estado: "no_encontrado",
    opciones_alternativas: [],
    razonamiento,
  };
}

/** Clasifica (sin guardar) el NCM de todos los SKUs de la carpeta que todavía no tienen uno asignado. */
export async function clasificarNcmSkus(carpetaId: string): Promise<{ error?: string; resultados?: ClasificacionSkuResultado[] }> {
  const supabase = createClient();

  const { data: skus, error } = await supabase
    .from("skus")
    .select("id, codigo_sku, descripcion, descripcion_es")
    .eq("carpeta_id", carpetaId)
    .is("ncm_id", null);

  if (error) {
    console.error("clasificarNcmSkus", error);
    return { error: error.message };
  }
  if (!skus || skus.length === 0) return { resultados: [] };

  const resultados: ClasificacionSkuResultado[] = [];

  // Secuencial (no Promise.all): son llamadas a Claude, evitamos ráfagas de
  // rate limit cuando una carpeta tiene muchos SKUs.
  for (const sku of skus) {
    const descripcion = sku.descripcion_es?.trim() || sku.descripcion?.trim() || sku.codigo_sku?.trim() || "";

    if (!descripcion) {
      resultados.push({
        sku_id: sku.id,
        sku_codigo: sku.codigo_sku,
        descripcion_sku: "(sin descripción)",
        ...clasificacionFallida("Este SKU no tiene descripción cargada; no se puede clasificar automáticamente."),
      });
      continue;
    }

    try {
      const clasificacion = await clasificarDescripcionNcm(descripcion);
      resultados.push({ sku_id: sku.id, sku_codigo: sku.codigo_sku, descripcion_sku: descripcion, ...clasificacion });
    } catch (err) {
      console.error("clasificarNcmSkus:", sku.id, err);
      resultados.push({
        sku_id: sku.id,
        sku_codigo: sku.codigo_sku,
        descripcion_sku: descripcion,
        ...clasificacionFallida(err instanceof Error ? err.message : "Error inesperado clasificando este SKU."),
      });
    }
  }

  return { resultados };
}

export interface ConfirmacionNcmInput {
  sku_id: string;
  ncm_codigo: string; // NCM de 8 dígitos con puntos, ej "4203.29.00"
  die_pct: number;
  descripcion: string;
  /** IVA general del NCM: 21% (general) o 10.5% (productos esenciales). */
  iva_pct: 21 | 10.5;
  /** Si paga la percepción de IVA adicional (percepción de importación). */
  paga_iva_adicional: boolean;
}

// La percepción de IVA adicional de importación es, en la práctica de AFIP,
// 20% cuando el IVA general es 21% y 10% cuando el IVA general es 10.5%.
function ivaAdicionalPct(ivaPct: 21 | 10.5): number {
  return ivaPct === 21 ? 20 : 10;
}

// IIBB y Anticipo de ganancias no se piden en la pantalla de revisión: para
// los NCM que se crean automáticamente desde la clasificación se cargan
// siempre con estos valores fijos (a pedido del negocio), editables luego
// a mano desde /ncm si un NCM puntual difiere.
const IIBB_PCT_DEFAULT = 2.5;
const ANTICIPO_GANANCIAS_PCT_DEFAULT = 6;

/**
 * Guarda los NCMs elegidos por el usuario en la pantalla de revisión: crea
 * el NCM en ncm_aranceles si el código todavía no existe (usando el DIE real
 * de AFIP como derecho_importacion_pct, el IVA/IVA adicional elegidos por el
 * usuario, e IIBB/Ganancias fijos) y asigna cada NCM al SKU correspondiente.
 * Al final recalcula la cascada de la carpeta.
 */
export async function confirmarNcmSkus(
  carpetaId: string,
  confirmaciones: ConfirmacionNcmInput[]
): Promise<{ error?: string }> {
  if (confirmaciones.length === 0) return {};

  const supabase = createClient();

  for (const confirmacion of confirmaciones) {
    const codigo = confirmacion.ncm_codigo.trim();

    const { data: existente, error: errorBusqueda } = await supabase
      .from("ncm_aranceles")
      .select("id")
      .eq("codigo_ncm", codigo)
      .maybeSingle();
    if (errorBusqueda) {
      console.error("confirmarNcmSkus: búsqueda NCM", errorBusqueda);
      return { error: errorBusqueda.message };
    }

    let ncmId = existente?.id as string | undefined;

    if (!ncmId) {
      const { data: creado, error: errorInsert } = await supabase
        .from("ncm_aranceles")
        .insert({
          codigo_ncm: codigo,
          descripcion: confirmacion.descripcion || null,
          derecho_importacion_pct: confirmacion.die_pct,
          iva_pct: confirmacion.iva_pct,
          aplica_iva_adicional: confirmacion.paga_iva_adicional,
          iva_adicional_pct: confirmacion.paga_iva_adicional ? ivaAdicionalPct(confirmacion.iva_pct) : 0,
          aplica_anticipo_ganancias: true,
          anticipo_ganancias_pct: ANTICIPO_GANANCIAS_PCT_DEFAULT,
          aplica_iibb: true,
          iibb_pct: IIBB_PCT_DEFAULT,
          aplica_tasa_estadistica: true,
          tasa_estadistica_pct: 3,
        })
        .select("id")
        .single();
      if (errorInsert || !creado) {
        console.error("confirmarNcmSkus: insert NCM", errorInsert);
        return { error: `No se pudo crear el NCM ${codigo}: ${errorInsert?.message ?? "error desconocido"}` };
      }
      ncmId = creado.id;
    }

    const { error: errorSku } = await supabase.from("skus").update({ ncm_id: ncmId }).eq("id", confirmacion.sku_id);
    if (errorSku) {
      console.error("confirmarNcmSkus: update sku", errorSku);
      return { error: `No se pudo asignar el NCM al SKU: ${errorSku.message}` };
    }
  }

  revalidatePath("/ncm");
  return recalcularCostosDesdeSkus(carpetaId);
}

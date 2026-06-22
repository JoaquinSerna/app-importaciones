"use server";

import { revalidatePath } from "next/cache";

import { calcularArancelPonderado, calcularCascada, costosComoLineas } from "@/lib/calculadora-costos";
import { createClient } from "@/lib/supabase/server";
import type { NcmArancel, ParametrosGlobales, TipoImportacion } from "@/lib/types";

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

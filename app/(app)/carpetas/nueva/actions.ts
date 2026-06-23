"use server";

import { redirect } from "next/navigation";

import { calcularCascada, costosComoLineas, type DatosSimulacion } from "@/lib/calculadora-costos";
import { createClient } from "@/lib/supabase/server";
import type { NcmArancel, TipoContenedor, TipoImportacion } from "@/lib/types";

export interface CrearCarpetaInput {
  titulo?: string;
  proveedorId?: string;
  fobTotalUsd: number;
  cbmTotal?: number;
  pesoTotalKg?: number;
  ncm?: string;
  ncmId?: string;
  ncmArancel?: NcmArancel | null;
  modalidad: TipoContenedor;
  fleteInternacionalUsd?: number;
  tipoImportacion?: TipoImportacion;
  /** Una línea por cada NCM distinto de la compra, con su porción de FOB. Se cargan como SKUs. */
  lineasNcm?: { ncmId: string; fobUsd: number }[];
}

/** Genera el próximo número de carpeta con formato IMP-{año}-{secuencial 3 dígitos}. */
async function generarNumeroCarpeta(
  supabase: ReturnType<typeof createClient>,
  anio: number
): Promise<string> {
  const prefijo = `IMP-${anio}-`;

  const { data, error } = await supabase
    .from("carpetas")
    .select("numero_carpeta")
    .like("numero_carpeta", `${prefijo}%`)
    .order("numero_carpeta", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Error consultando último número de carpeta: ${error.message}`);
  }

  let siguiente = 1;
  if (data && data.length > 0) {
    const ultimo = data[0].numero_carpeta as string;
    const ultimoSecuencial = parseInt(ultimo.slice(prefijo.length), 10);
    if (!Number.isNaN(ultimoSecuencial)) {
      siguiente = ultimoSecuencial + 1;
    }
  }

  return `${prefijo}${String(siguiente).padStart(3, "0")}`;
}

export async function crearCarpetaDesdeSimulacion(input: CrearCarpetaInput) {
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  // 1. Traer los parámetros globales vigentes (más recientes).
  const { data: parametros, error: errorParametros } = await supabase
    .from("parametros_globales")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (errorParametros || !parametros) {
    throw new Error("No se pudieron obtener los parámetros globales vigentes.");
  }

  // 2. Calcular cascada de costos.
  const datos: DatosSimulacion = {
    fobTotalUsd: input.fobTotalUsd,
    cbmTotal: input.cbmTotal,
    pesoTotalKg: input.pesoTotalKg,
    tipoContenedor: input.modalidad,
    ncm: input.ncm,
    fleteInternacionalUsd: input.fleteInternacionalUsd,
    ncmArancel: input.ncmArancel ?? null,
    tipoImportacion: input.tipoImportacion ?? "bien_de_cambio",
  };
  const resultado = calcularCascada(parametros, datos);
  const lineas = costosComoLineas(resultado);

  // 3. Generar número de carpeta.
  const anio = new Date().getFullYear();
  const numeroCarpeta = await generarNumeroCarpeta(supabase, anio);

  // 4. Insertar carpeta con snapshot fijo de parámetros y tc.
  const { data: carpeta, error: errorCarpeta } = await supabase
    .from("carpetas")
    .insert({
      numero_carpeta: numeroCarpeta,
      titulo: input.titulo ?? null,
      proveedor_id: input.proveedorId ?? null,
      fob_total_usd: input.fobTotalUsd,
      cbm_total: input.cbmTotal ?? null,
      peso_total_kg: input.pesoTotalKg ?? null,
      ncm: input.ncm ?? null,
      ncm_id: input.ncmId ?? null,
      tipo_importacion: input.tipoImportacion ?? "bien_de_cambio",
      parametros_snapshot_id: parametros.id,
      tc_snapshot: parametros.tc_usd_ars,
      estado: "simulacion",
      created_by: userId,
    })
    .select()
    .single();

  if (errorCarpeta || !carpeta) {
    throw new Error(`Error creando la carpeta: ${errorCarpeta?.message}`);
  }

  // 5. Insertar líneas de costos generadas por el simulador.
  if (lineas.length > 0) {
    const { error: errorCostos } = await supabase.from("costos").insert(
      lineas.map((linea) => ({
        carpeta_id: carpeta.id,
        nivel: "carpeta" as const,
        concepto: linea.concepto,
        categoria: linea.categoria,
        origen: "simulador" as const,
        monto_estimado_usd: linea.monto_estimado_usd,
        tc_aplicado: parametros.tc_usd_ars,
        created_by: userId,
      }))
    );

    if (errorCostos) {
      throw new Error(`Error insertando costos del simulador: ${errorCostos.message}`);
    }
  }

  // 6. Si se cargaron varias líneas de NCM, las guardamos como SKUs para que
  // la pestaña SKUs ya quede coherente (y se pueda recalcular más adelante).
  if (input.lineasNcm && input.lineasNcm.length > 0) {
    const { data: ncmsData } = await supabase
      .from("ncm_aranceles")
      .select("id, codigo_ncm")
      .in("id", input.lineasNcm.map((l) => l.ncmId));
    const codigoPorId = new Map((ncmsData ?? []).map((n) => [n.id, n.codigo_ncm]));

    const { error: errorSkus } = await supabase.from("skus").insert(
      input.lineasNcm.map((l) => ({
        carpeta_id: carpeta.id,
        descripcion: codigoPorId.get(l.ncmId) ?? null,
        cantidad: 1,
        precio_unitario_fob_usd: l.fobUsd,
        ncm_id: l.ncmId,
      }))
    );
    if (errorSkus) {
      throw new Error(`Error guardando los productos (NCM) de la carpeta: ${errorSkus.message}`);
    }
  }

  redirect(`/carpetas/${carpeta.id}`);
}

export async function obtenerParametrosVigentes() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("parametros_globales")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Error obteniendo parámetros vigentes: ${error.message}`);
  }

  return data;
}

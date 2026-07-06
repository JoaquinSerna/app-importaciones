"use server";

import { redirect } from "next/navigation";

import { registrarDocumentoDesdeBuffer } from "@/app/(app)/carpetas/[id]/documentos/actions";
import { calcularArancelPonderado, calcularCascada, costosComoLineas, type DatosSimulacion } from "@/lib/calculadora-costos";
import { NCM_ARANCEL_DEFAULT, construirNcmArancelProvisorio, ivaAdicionalPct } from "@/lib/ncm-defaults";
import { clasificarDescripcionNcm } from "@/lib/ncm-clasificador";
import { buscarPorNcm8, type PosicionNcm } from "@/lib/nomenclador";
import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { NcmOrigen, TipoContenedor, TipoImportacion } from "@/lib/types";

// ---------------------------------------------------------------------
// Extracción de ítems desde una proforma subida en el simulador (efímera:
// no toca storage/documentos todavía, solo sirve para poblar la lista de
// ítems). El archivo se vuelve a registrar como documento recién al crear
// la carpeta, vía registrarDocumentoDesdeBuffer (ver crearCarpetaDesdeSimulacion).
// ---------------------------------------------------------------------

export interface ItemProformaExtraido {
  descripcion: string;
  descripcionEs?: string;
  cantidad: number;
  precioUnitarioFobUsd: number;
}

export async function extraerItemsProforma(
  formData: FormData
): Promise<{ items?: ItemProformaExtraido[]; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No se recibió ningún archivo." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const datos = await extraerDatosDocumento(buffer, "proforma_invoice", file.type);
    const items = (datos?.items ?? []) as {
      descripcion?: string;
      descripcion_es?: string;
      cantidad?: number;
      precio_unitario?: number;
      total?: number;
    }[];

    return {
      items: items
        .filter((it) => it.descripcion || it.descripcion_es)
        .map((it) => {
          const cantidad = it.cantidad && it.cantidad > 0 ? it.cantidad : 1;
          const total = it.total ?? cantidad * (it.precio_unitario ?? 0);
          return {
            descripcion: it.descripcion?.trim() || it.descripcion_es?.trim() || "",
            descripcionEs: it.descripcion_es?.trim(),
            cantidad,
            precioUnitarioFobUsd: it.precio_unitario ?? (cantidad > 0 ? total / cantidad : 0),
          };
        }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error extrayendo la proforma." };
  }
}

// ---------------------------------------------------------------------
// Clasificación NCM en background para la lista de ítems del simulador
// (todavía no existe carpeta ni SKUs — trabaja directo sobre el array).
// ---------------------------------------------------------------------

export interface ClasificacionItemSimulador {
  index: number;
  ncmPropuesto: string | null;
  descripcionOficial: string | null;
  diePct: number | null;
  confianza: "alta" | "media" | "baja";
  estado: "definido" | "ambiguo" | "no_encontrado";
  opcionesAlternativas: { ncm: string; descripcionOficial: string; diePct: number; diferencia: string }[];
  razonamiento: string;
}

export async function clasificarItemsSimulador(
  items: { descripcion: string; descripcionEs?: string }[]
): Promise<{ resultados?: ClasificacionItemSimulador[]; error?: string }> {
  const resultados: ClasificacionItemSimulador[] = [];

  // Secuencial (no Promise.all): son llamadas a Claude, evitamos ráfagas de
  // rate limit cuando hay muchos ítems.
  for (let i = 0; i < items.length; i++) {
    const descripcion = items[i].descripcion?.trim();
    if (!descripcion) {
      resultados.push({
        index: i,
        ncmPropuesto: null,
        descripcionOficial: null,
        diePct: null,
        confianza: "baja",
        estado: "no_encontrado",
        opcionesAlternativas: [],
        razonamiento: "Ítem sin descripción.",
      });
      continue;
    }
    try {
      const c = await clasificarDescripcionNcm(descripcion, items[i].descripcionEs);
      resultados.push({
        index: i,
        ncmPropuesto: c.ncm_propuesto,
        descripcionOficial: c.descripcion_oficial,
        diePct: c.die_pct,
        confianza: c.confianza,
        estado: c.estado,
        opcionesAlternativas: c.opciones_alternativas.map((o) => ({
          ncm: o.ncm,
          descripcionOficial: o.descripcion_oficial,
          diePct: o.die_pct,
          diferencia: o.diferencia,
        })),
        razonamiento: c.razonamiento,
      });
    } catch (err) {
      console.error("clasificarItemsSimulador:", i, err);
      resultados.push({
        index: i,
        ncmPropuesto: null,
        descripcionOficial: null,
        diePct: null,
        confianza: "baja",
        estado: "no_encontrado",
        opcionesAlternativas: [],
        razonamiento: err instanceof Error ? err.message : "Error inesperado clasificando este ítem.",
      });
    }
  }

  return { resultados };
}

/** Wrapper server-only de buscarPorNcm8 (usa fs/zlib) para que el diálogo de revisión pueda auto-completar el DIE al editar un NCM a mano. */
export async function buscarDiePorNcm(codigo: string): Promise<PosicionNcm | null> {
  return buscarPorNcm8(codigo);
}

// ---------------------------------------------------------------------
// Creación de la carpeta desde la simulación
// ---------------------------------------------------------------------

export interface ItemCarpetaInput {
  descripcion: string;
  descripcionEs?: string;
  cantidad: number;
  precioUnitarioFobUsd: number;
  /** null = el ítem quedó sin clasificar/confirmar; se usa el arancel default provisorio. */
  ncmCodigo: string | null;
  /** DIE real del nomenclador si ncmCodigo != null; se ignora si es null. */
  diePct: number;
  ivaPct: 21 | 10.5;
  pagaIvaAdicional: boolean;
  ncmOrigen: NcmOrigen | null;
}

export interface CrearCarpetaInput {
  titulo?: string;
  proveedorId?: string;
  cbmTotal?: number;
  pesoTotalKg?: number;
  modalidad: TipoContenedor;
  fleteInternacionalUsd?: number;
  tipoImportacion?: TipoImportacion;
  items: ItemCarpetaInput[];
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

/** Busca el NCM por código en ncm_aranceles; si no existe, lo crea con el DIE/IVA elegidos por el usuario. Devuelve null si el ítem quedó sin clasificar (no crea nada). */
async function resolverNcmIdParaItem(
  supabase: ReturnType<typeof createClient>,
  item: ItemCarpetaInput
): Promise<string | null> {
  if (!item.ncmCodigo) return null;
  const codigo = item.ncmCodigo.trim();

  const { data: existente, error: errorBusqueda } = await supabase
    .from("ncm_aranceles")
    .select("id")
    .eq("codigo_ncm", codigo)
    .maybeSingle();
  if (errorBusqueda) throw new Error(`Error buscando NCM ${codigo}: ${errorBusqueda.message}`);
  if (existente?.id) return existente.id as string;

  const { data: creado, error: errorInsert } = await supabase
    .from("ncm_aranceles")
    .insert({
      codigo_ncm: codigo,
      derecho_importacion_pct: item.diePct,
      iva_pct: item.ivaPct,
      aplica_iva_adicional: item.pagaIvaAdicional,
      iva_adicional_pct: item.pagaIvaAdicional ? ivaAdicionalPct(item.ivaPct) : 0,
      aplica_anticipo_ganancias: NCM_ARANCEL_DEFAULT.aplica_anticipo_ganancias,
      anticipo_ganancias_pct: NCM_ARANCEL_DEFAULT.anticipo_ganancias_pct,
      aplica_iibb: NCM_ARANCEL_DEFAULT.aplica_iibb,
      iibb_pct: NCM_ARANCEL_DEFAULT.iibb_pct,
      aplica_tasa_estadistica: NCM_ARANCEL_DEFAULT.aplica_tasa_estadistica,
      tasa_estadistica_pct: NCM_ARANCEL_DEFAULT.tasa_estadistica_pct,
    })
    .select("id")
    .single();
  if (errorInsert || !creado) {
    throw new Error(`No se pudo crear el NCM ${codigo}: ${errorInsert?.message ?? "error desconocido"}`);
  }
  return creado.id as string;
}

/**
 * Crea la carpeta a partir del simulador. `formData` trae:
 * - "input": JSON de CrearCarpetaInput
 * - "proformaFile" (opcional): el mismo PDF/Excel que se subió para extraer
 *   los ítems, para que quede registrado como documento de la carpeta
 *   (Sección 1, igual que si se subiera manualmente después).
 */
export async function crearCarpetaDesdeSimulacion(formData: FormData) {
  const inputRaw = formData.get("input");
  if (typeof inputRaw !== "string") throw new Error("Falta el input de la carpeta.");
  const input = JSON.parse(inputRaw) as CrearCarpetaInput;

  if (!input.items || input.items.length === 0) {
    throw new Error("La carpeta necesita al menos un ítem/producto.");
  }

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

  // 2. FOB total y arancel ponderado (cada ítem aporta su NCM real o el
  // default provisorio — nunca se excluye ninguno del promedio).
  const fobTotalUsd = input.items.reduce((acc, it) => acc + it.cantidad * it.precioUnitarioFobUsd, 0);
  const arancelPonderado = calcularArancelPonderado(
    input.items.map((it) => ({
      fobUsd: it.cantidad * it.precioUnitarioFobUsd,
      ncm: construirNcmArancelProvisorio({
        ncmCodigo: it.ncmCodigo,
        diePct: it.diePct,
        ivaPct: it.ivaPct,
        pagaIvaAdicional: it.pagaIvaAdicional,
      }),
    }))
  );
  if (!arancelPonderado) {
    throw new Error("No se pudo calcular el arancel: revisá el FOB de los ítems.");
  }

  const datos: DatosSimulacion = {
    fobTotalUsd,
    cbmTotal: input.cbmTotal,
    pesoTotalKg: input.pesoTotalKg,
    tipoContenedor: input.modalidad,
    ncm: arancelPonderado.codigo_ncm,
    fleteInternacionalUsd: input.fleteInternacionalUsd,
    ncmArancel: arancelPonderado,
    tipoImportacion: input.tipoImportacion ?? "bien_de_cambio",
  };
  const resultado = calcularCascada(parametros, datos);
  const lineas = costosComoLineas(resultado);

  // 3. Generar número de carpeta.
  const anio = new Date().getFullYear();
  const numeroCarpeta = await generarNumeroCarpeta(supabase, anio);

  // 4. Resolver (o crear) el NCM real de cada ítem clasificado — antes de
  // insertar la carpeta, para poder setear carpetas.ncm_id si hay un solo ítem.
  const ncmIdsPorItem = await Promise.all(input.items.map((it) => resolverNcmIdParaItem(supabase, it)));

  // 5. Insertar carpeta con snapshot fijo de parámetros y tc.
  const { data: carpeta, error: errorCarpeta } = await supabase
    .from("carpetas")
    .insert({
      numero_carpeta: numeroCarpeta,
      titulo: input.titulo ?? null,
      proveedor_id: input.proveedorId ?? null,
      fob_total_usd: fobTotalUsd,
      cbm_total: input.cbmTotal ?? null,
      peso_total_kg: input.pesoTotalKg ?? null,
      ncm: arancelPonderado.codigo_ncm,
      ncm_id: input.items.length === 1 ? ncmIdsPorItem[0] : null,
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

  // 6. Insertar líneas de costos generadas por el simulador.
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

  // 7. Insertar un SKU por ítem, con descripción/cantidad/FOB reales (no
  // placeholders) y su NCM + origen resueltos en el paso 4.
  const { error: errorSkus } = await supabase.from("skus").insert(
    input.items.map((it, i) => ({
      carpeta_id: carpeta.id,
      descripcion: it.descripcion,
      descripcion_es: it.descripcionEs?.trim() || null,
      cantidad: it.cantidad,
      precio_unitario_fob_usd: it.precioUnitarioFobUsd,
      ncm_id: ncmIdsPorItem[i],
      ncm_origen: ncmIdsPorItem[i] ? it.ncmOrigen : null,
    }))
  );
  if (errorSkus) {
    throw new Error(`Error guardando los productos (SKUs) de la carpeta: ${errorSkus.message}`);
  }

  // 8. Si se subió una proforma para extraer ítems, la registramos como
  // documento de la carpeta (Sección 1) — mismo pipeline que si se subiera a
  // mano después, best-effort para no romper el alta de la carpeta si falla.
  const proformaFile = formData.get("proformaFile") as File | null;
  if (proformaFile) {
    try {
      const buffer = Buffer.from(await proformaFile.arrayBuffer());
      await registrarDocumentoDesdeBuffer(carpeta.id, "proforma_invoice", buffer, proformaFile.name, proformaFile.type);
    } catch (err) {
      console.error("crearCarpetaDesdeSimulacion: registrarDocumentoDesdeBuffer", err);
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

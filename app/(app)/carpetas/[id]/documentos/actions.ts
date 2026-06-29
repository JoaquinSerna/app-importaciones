"use server";

import { revalidatePath } from "next/cache";

import { autoAnalizarCarpeta } from "@/app/(app)/carpetas/[id]/analizar-costos/actions";
import { extraerLiquidacionDesdePdf } from "@/lib/pdf-extractor";
import { extraerDatosDocumento } from "@/lib/pdf-extractor-documentos";
import { createClient } from "@/lib/supabase/server";
import type { Documento, LiquidacionExtraida, TipoDocumento } from "@/lib/types";

const BUCKET_DOCUMENTOS = "documentos";

export interface SubirLiquidacionResult {
  path: string;
  liquidacion: LiquidacionExtraida;
}

/**
 * Sube un PDF de liquidación a Supabase Storage (bucket `documentos`) y
 * extrae sus datos estructurados vía Claude. No persiste la extracción:
 * eso lo hace `confirmarActualizacionCostos` luego de que el usuario revisa
 * el matching en la UI.
 */
export async function subirYExtraerLiquidacion(
  carpetaId: string,
  formData: FormData
): Promise<SubirLiquidacionResult> {
  const supabase = createClient();

  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No se recibió ningún archivo.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const path = `${carpetaId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    throw new Error(`Error subiendo el documento: ${uploadError.message}`);
  }

  const liquidacion = await extraerLiquidacionDesdePdf(buffer);

  revalidatePath(`/carpetas/${carpetaId}`);

  return { path, liquidacion };
}

// Cuando se sube la Proforma Invoice (o el Packing List si no hay proforma con
// items), copiamos el nombre Y LA CANTIDAD real de cada producto a los SKUs ya
// creados — así el usuario no tiene que tipear nada y el costo por unidad
// divide por la cantidad real, no por el "1" que se pone como placeholder al
// crear la carpeta. El precio unitario FOB se recalcula (monto del ítem /
// cantidad del ítem) para que sea el precio por unidad real, no la suma total
// que se cargó como "precio unitario" cuando el SKU representaba todo un NCM.
// Solo pisa SKUs que todavía no tienen un nombre real (vacíos o que quedaron
// con el código de NCM puesto automáticamente), y solo si la cantidad de
// items coincide 1 a 1 con los SKUs.
async function sincronizarDescripcionesDeUnDocumento(
  supabase: ReturnType<typeof createClient>,
  carpetaId: string,
  tipo: "proforma_invoice" | "packing_list",
  skus: { id: string; descripcion: string | null; descripcion_es?: string | null; cantidad: number | null; ncm_aranceles: { codigo_ncm: string } | null }[]
): Promise<{ actualizados: number; itemsEncontrados: number }> {
  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("carpeta_id", carpetaId)
    .eq("tipo", tipo)
    .eq("estado", "extraido")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const items = (doc?.datos_extraidos?.items ?? []) as {
    descripcion?: string;
    descripcion_es?: string;
    cantidad?: number;
    precio_unitario?: number;
    total?: number;
    cbm?: number;
    peso_kg?: number;
  }[];
  if (items.length === 0 || items.length !== skus.length) {
    return { actualizados: 0, itemsEncontrados: items.length };
  }

  let actualizados = 0;
  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const item = items[i];

    // El Packing List es la única fuente de CBM/peso por SKU — a diferencia de
    // descripcion/cantidad/FOB, esto se sincroniza siempre (no solo en
    // placeholders) porque no hay otro lugar donde el usuario los cargue.
    if (tipo === "packing_list" && (item?.cbm || item?.peso_kg)) {
      const updateCbmPeso: Record<string, unknown> = {};
      if (item.cbm) updateCbmPeso.cbm = item.cbm;
      if (item.peso_kg) updateCbmPeso.peso_kg = item.peso_kg;
      await supabase.from("skus").update(updateCbmPeso).eq("id", sku.id);
    }

    // La cantidad/precio unitario se sincronizan en su propio criterio,
    // INDEPENDIENTE del de la descripción: al crear la carpeta desde la
    // simulación, todo SKU arranca con cantidad=1 y precio_unitario_fob_usd
    // = FOB total de la línea (ver crearCarpetaDesdeSimulacion). Si seguimos
    // en ese estado "1 unidad = el total", lo corregimos con la cantidad real
    // del documento aunque la descripción ya se haya sincronizado antes (si
    // dependiera del mismo gate que la descripción, una vez que esta dejara
    // de ser placeholder la cantidad quedaría en 1 para siempre).
    const cantidad = item.cantidad && item.cantidad > 0 ? item.cantidad : undefined;
    const montoTotal = item.total ?? (cantidad ? cantidad * (item.precio_unitario ?? 0) : undefined);
    const cantidadEsPlaceholder = sku.cantidad == null || sku.cantidad === 1;
    const update: Record<string, unknown> = {};
    if (cantidad && montoTotal && cantidadEsPlaceholder) {
      update.cantidad = cantidad;
      update.precio_unitario_fob_usd = montoTotal / cantidad;
    }

    const descripcionNueva = item?.descripcion?.trim() || item?.descripcion_es?.trim();
    const codigoNcm = sku.ncm_aranceles?.codigo_ncm ?? null;
    const descripcionEsPlaceholder = !sku.descripcion || sku.descripcion === codigoNcm;
    if (descripcionNueva && descripcionEsPlaceholder) {
      update.descripcion = descripcionNueva;
    }
    if (item?.descripcion_es?.trim() && !sku.descripcion_es) {
      update.descripcion_es = item.descripcion_es.trim();
    }

    if (Object.keys(update).length === 0) continue;
    await supabase.from("skus").update(update).eq("id", sku.id);
    actualizados++;
  }
  return { actualizados, itemsEncontrados: items.length };
}

async function sincronizarDescripcionesSkusDesdeDocumento(carpetaId: string, tipo: TipoDocumento) {
  if (tipo !== "proforma_invoice" && tipo !== "packing_list") return;
  const supabase = createClient();

  const { data: skus } = await supabase
    .from("skus")
    .select("id, descripcion, descripcion_es, cantidad, created_at, ncm_aranceles(codigo_ncm)")
    .eq("carpeta_id", carpetaId)
    .order("created_at", { ascending: true });
  if (!skus || skus.length === 0) return;

  await sincronizarDescripcionesDeUnDocumento(
    supabase,
    carpetaId,
    tipo,
    skus as unknown as { id: string; descripcion: string | null; descripcion_es: string | null; cantidad: number | null; ncm_aranceles: { codigo_ncm: string } | null }[]
  );
}

interface SkuParaNombrar {
  id: string;
  descripcion: string | null;
  descripcion_es: string | null;
  cantidad: number;
  precio_unitario_fob_usd: number;
  ncm_aranceles: { codigo_ncm: string } | null;
}

// Cada fila del documento es un SKU distinto e independiente — el NCM NUNCA
// es criterio para agrupar SKUs (eso se aplica después, al prorratear
// impuestos del DI). Cuando la cantidad de ítems no coincide con la cantidad
// de SKUs ya cargados (porque la carpeta se creó agrupando por NCM), esta
// función hace un matching 1 a 1 estricto por monto FOB más cercano contra
// los SKUs existentes, y crea un SKU nuevo para cada ítem que sobre — nunca
// combina dos ítems en un mismo SKU.
async function agruparDescripcionesConIA(
  supabase: ReturnType<typeof createClient>,
  carpetaId: string,
  tipo: "proforma_invoice" | "packing_list",
  skus: SkuParaNombrar[]
): Promise<number> {
  const { data: doc } = await supabase
    .from("documentos")
    .select("datos_extraidos")
    .eq("carpeta_id", carpetaId)
    .eq("tipo", tipo)
    .eq("estado", "extraido")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const items = (doc?.datos_extraidos?.items ?? []) as {
    descripcion?: string;
    descripcion_es?: string;
    cantidad?: number;
    precio_unitario?: number;
    total?: number;
  }[];
  if (items.length === 0) return 0;

  const itemsConMonto = items.map((it, i) => ({
    index: i,
    descripcion: it.descripcion?.trim() || it.descripcion_es?.trim() || `Item ${i + 1}`,
    descripcionEs: it.descripcion_es?.trim() || null,
    monto: it.total ?? (it.cantidad ?? 0) * (it.precio_unitario ?? 0),
    cantidad: it.cantidad && it.cantidad > 0 ? it.cantidad : 1,
    precioUnitario: it.precio_unitario ?? null,
  }));

  const skusInfo = skus.map((s, i) => ({
    index: i,
    montoFob: (s.cantidad ?? 1) * (s.precio_unitario_fob_usd ?? 0),
  }));

  // Greedy: para cada SKU existente (de mayor a menor FOB esperado), le
  // asigno el ítem libre cuyo monto sea el más parecido. Cada ítem se usa
  // como máximo una vez — nunca se reparte entre dos SKUs ni se combina.
  const itemsLibres = new Set(itemsConMonto.map((it) => it.index));
  const asignacionPorSku = new Map<number, number>(); // skuIndex -> itemIndex
  for (const sku of [...skusInfo].sort((a, b) => b.montoFob - a.montoFob)) {
    let mejorItem: number | null = null;
    let mejorDiferencia = Infinity;
    for (const itemIndex of Array.from(itemsLibres)) {
      const diferencia = Math.abs(itemsConMonto[itemIndex].monto - sku.montoFob);
      if (diferencia < mejorDiferencia) {
        mejorDiferencia = diferencia;
        mejorItem = itemIndex;
      }
    }
    if (mejorItem !== null) {
      asignacionPorSku.set(sku.index, mejorItem);
      itemsLibres.delete(mejorItem);
    }
  }

  let actualizados = 0;
  for (const [skuIndex, itemIndex] of Array.from(asignacionPorSku.entries())) {
    const sku = skus[skuIndex];
    const item = itemsConMonto[itemIndex];
    const update: Record<string, unknown> = { descripcion: item.descripcion };
    if (item.descripcionEs) update.descripcion_es = item.descripcionEs;
    if (item.cantidad > 0) {
      update.cantidad = item.cantidad;
      update.precio_unitario_fob_usd = item.precioUnitario ?? item.monto / item.cantidad;
    }
    await supabase.from("skus").update(update).eq("id", sku.id);
    actualizados++;
  }

  // Ítems que no encontraron SKU existente para emparejar (porque hay más
  // ítems en el documento que SKUs cargados): se crea un SKU nuevo por cada
  // uno, nunca se fusionan con otro.
  const itemsSinSku = Array.from(itemsLibres).map((i) => itemsConMonto[i]);
  if (itemsSinSku.length > 0) {
    const { error } = await supabase.from("skus").insert(
      itemsSinSku.map((item) => ({
        carpeta_id: carpetaId,
        descripcion: item.descripcion,
        descripcion_es: item.descripcionEs,
        cantidad: item.cantidad,
        precio_unitario_fob_usd: item.precioUnitario ?? (item.cantidad > 0 ? item.monto / item.cantidad : item.monto),
      }))
    );
    if (error) {
      console.error("agruparDescripcionesConIA: insert SKUs nuevos", error);
    } else {
      actualizados += itemsSinSku.length;
    }
  }

  return actualizados;
}

// Acción manual para carpetas donde la Proforma/Packing List ya estaban
// subidas antes de que existiera el sync automático — permite reintentarlo
// sin tener que volver a subir el documento.
export async function actualizarNombresSkusDesdeDocumentos(
  carpetaId: string
): Promise<{ error?: string; actualizados?: number }> {
  const supabase = createClient();

  const { data: skus } = await supabase
    .from("skus")
    .select("id, descripcion, descripcion_es, cantidad, precio_unitario_fob_usd, created_at, ncm_aranceles(codigo_ncm)")
    .eq("carpeta_id", carpetaId)
    .order("created_at", { ascending: true });
  if (!skus || skus.length === 0) {
    return { error: "Esta carpeta no tiene SKUs cargados." };
  }

  const skusTyped = skus as unknown as SkuParaNombrar[];

  const resultadoProforma = await sincronizarDescripcionesDeUnDocumento(supabase, carpetaId, "proforma_invoice", skusTyped);
  if (resultadoProforma.actualizados > 0) {
    revalidatePath(`/carpetas/${carpetaId}`);
    return { actualizados: resultadoProforma.actualizados };
  }

  const resultadoPacking = await sincronizarDescripcionesDeUnDocumento(supabase, carpetaId, "packing_list", skusTyped);
  if (resultadoPacking.actualizados > 0) {
    revalidatePath(`/carpetas/${carpetaId}`);
    return { actualizados: resultadoPacking.actualizados };
  }

  const itemsEncontrados = Math.max(resultadoProforma.itemsEncontrados, resultadoPacking.itemsEncontrados);
  if (itemsEncontrados === 0) {
    return { error: "No se encontró Proforma Invoice ni Packing List extraídos con items en esta carpeta." };
  }

  // Las cantidades no coinciden 1 a 1 — probablemente porque algunos ítems se
  // unificaron en un mismo SKU. Le pedimos a la IA que agrupe por monto FOB.
  const tipoConItems = resultadoProforma.itemsEncontrados > 0 ? "proforma_invoice" : "packing_list";
  try {
    const actualizadosIA = await agruparDescripcionesConIA(supabase, carpetaId, tipoConItems, skusTyped);
    if (actualizadosIA > 0) {
      revalidatePath(`/carpetas/${carpetaId}`);
      return { actualizados: actualizadosIA };
    }
  } catch (err) {
    console.error("agruparDescripcionesConIA", err);
    return { error: "No se pudo agrupar los ítems automáticamente. Probá de nuevo en un momento." };
  }

  return {
    error: `El documento tiene ${itemsEncontrados} ítems y la carpeta ${skus.length} SKUs. La IA no pudo agruparlos con confianza — puede que falten ítems o que los montos no cierren.`,
  };
}

/** Sube un documento de cualquier tipo, lo persiste en DB y extrae datos con IA */
export async function subirDocumento(
  carpetaId: string,
  tipo: TipoDocumento,
  formData: FormData
): Promise<Documento> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No se recibió ningún archivo.");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = `${carpetaId}/${tipo}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET_DOCUMENTOS).getPublicUrl(path);

  // Crear registro en DB
  const { data: doc, error: dbError } = await supabase
    .from("documentos")
    .insert({
      carpeta_id: carpetaId,
      tipo,
      file_name: file.name,
      file_url: urlData.publicUrl,
      estado: "procesando",
      created_by: userData?.user?.id ?? null,
    })
    .select()
    .single();
  if (dbError || !doc) throw new Error(`Error guardando documento: ${dbError?.message}`);

  // Extraer datos con IA
  try {
    const datos = await extraerDatosDocumento(buffer, tipo, file.type);
    await supabase
      .from("documentos")
      .update({ estado: "extraido", datos_extraidos: datos })
      .eq("id", doc.id);

    // Si es comprobante de pago, actualizar fechas/montos en la carpeta
    if (datos && tipo === "comprobante_pago_anticipo") {
      await supabase.from("carpetas").update({
        fecha_pago_anticipo: (datos.fecha as string) ?? null,
        monto_anticipo_usd: (datos.monto as number) ?? null,
      }).eq("id", carpetaId);
    }
    if (datos && tipo === "comprobante_pago_saldo") {
      await supabase.from("carpetas").update({
        fecha_pago_saldo: (datos.fecha as string) ?? null,
        monto_saldo_usd: (datos.monto as number) ?? null,
      }).eq("id", carpetaId);
    }

    await sincronizarDescripcionesSkusDesdeDocumento(carpetaId, tipo);

    // Re-analizar costos reales automáticamente con el nuevo documento (best-effort).
    await autoAnalizarCarpeta(carpetaId);

    revalidatePath(`/carpetas/${carpetaId}`);
    return { ...doc, estado: "extraido", datos_extraidos: datos } as Documento;
  } catch {
    await supabase.from("documentos").update({ estado: "error" }).eq("id", doc.id);
    revalidatePath(`/carpetas/${carpetaId}`);
    return { ...doc, estado: "error" } as Documento;
  }
}

/** Elimina un documento (archivo + registro DB) */
export async function eliminarDocumento(carpetaId: string, documentoId: string) {
  const supabase = createClient();
  await supabase.from("documentos").delete().eq("id", documentoId);
  revalidatePath(`/carpetas/${carpetaId}`);
}

export interface ConfirmarActualizacionCostoInput {
  costoId: string;
  montoRealUsd: number;
  tcAplicado?: number;
}

/**
 * Actualiza monto_real_usd (y opcionalmente tc_aplicado) de los costos
 * matcheados con conceptos del PDF, marcando origen = 'pdf_despachante'.
 */
export async function confirmarActualizacionCostos(
  carpetaId: string,
  actualizaciones: ConfirmarActualizacionCostoInput[]
) {
  const supabase = createClient();

  for (const actualizacion of actualizaciones) {
    const { error } = await supabase
      .from("costos")
      .update({
        monto_real_usd: actualizacion.montoRealUsd,
        tc_aplicado: actualizacion.tcAplicado ?? null,
        origen: "pdf_despachante",
      })
      .eq("id", actualizacion.costoId);

    if (error) {
      throw new Error(`Error actualizando costo ${actualizacion.costoId}: ${error.message}`);
    }
  }

  revalidatePath(`/carpetas/${carpetaId}`);
}

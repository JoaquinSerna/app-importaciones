"use server";

import Anthropic from "@anthropic-ai/sdk";
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
// items), copiamos el nombre de cada producto a los SKUs ya creados — así el
// usuario no tiene que tipear el nombre, viene solo del documento.
// Solo pisa la descripción de SKUs que todavía no tienen un nombre real
// (vacíos o que quedaron con el código de NCM puesto automáticamente al crear
// la carpeta), y solo cuando la cantidad de items coincide 1 a 1 con los SKUs.
async function sincronizarDescripcionesDeUnDocumento(
  supabase: ReturnType<typeof createClient>,
  carpetaId: string,
  tipo: "proforma_invoice" | "packing_list",
  skus: { id: string; descripcion: string | null; ncm_aranceles: { codigo_ncm: string } | null }[]
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

  const items = (doc?.datos_extraidos?.items ?? []) as { descripcion?: string }[];
  if (items.length === 0 || items.length !== skus.length) {
    return { actualizados: 0, itemsEncontrados: items.length };
  }

  let actualizados = 0;
  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const descripcionNueva = items[i]?.descripcion?.trim();
    if (!descripcionNueva) continue;

    const codigoNcm = sku.ncm_aranceles?.codigo_ncm ?? null;
    const esPlaceholder = !sku.descripcion || sku.descripcion === codigoNcm;
    if (!esPlaceholder) continue;

    await supabase.from("skus").update({ descripcion: descripcionNueva }).eq("id", sku.id);
    actualizados++;
  }
  return { actualizados, itemsEncontrados: items.length };
}

async function sincronizarDescripcionesSkusDesdeDocumento(carpetaId: string, tipo: TipoDocumento) {
  if (tipo !== "proforma_invoice" && tipo !== "packing_list") return;
  const supabase = createClient();

  const { data: skus } = await supabase
    .from("skus")
    .select("id, descripcion, created_at, ncm_aranceles(codigo_ncm)")
    .eq("carpeta_id", carpetaId)
    .order("created_at", { ascending: true });
  if (!skus || skus.length === 0) return;

  await sincronizarDescripcionesDeUnDocumento(
    supabase,
    carpetaId,
    tipo,
    skus as unknown as { id: string; descripcion: string | null; ncm_aranceles: { codigo_ncm: string } | null }[]
  );
}

interface SkuParaNombrar {
  id: string;
  descripcion: string | null;
  cantidad: number;
  precio_unitario_fob_usd: number;
  ncm_aranceles: { codigo_ncm: string } | null;
}

// Cuando la cantidad de ítems del documento no coincide 1 a 1 con los SKUs
// (típicamente porque dos productos con el mismo NCM se unificaron en un solo
// SKU al crear la carpeta), le pedimos a la IA que agrupe los ítems según el
// monto FOB de cada SKU en vez de pedirle al usuario que lo resuelva a mano.
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
    cantidad?: number;
    precio_unitario?: number;
    total?: number;
  }[];
  if (items.length === 0) return 0;

  const itemsConMonto = items.map((it, i) => ({
    index: i,
    descripcion: it.descripcion ?? `Item ${i + 1}`,
    monto: it.total ?? (it.cantidad ?? 0) * (it.precio_unitario ?? 0),
  }));

  const skusInfo = skus.map((s, i) => ({
    index: i,
    ncm: s.ncm_aranceles?.codigo_ncm ?? null,
    montoFob: (s.cantidad ?? 1) * (s.precio_unitario_fob_usd ?? 0),
  }));

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Tengo una lista de ítems de una proforma/packing list y una lista de SKUs (uno por NCM) de la misma carpeta. La cantidad de ítems NO coincide con la cantidad de SKUs porque a veces dos o más productos con el mismo NCM se agruparon en un solo SKU.

Tu tarea: asignar cada ítem a UN SOLO SKU, agrupando los que correspondan, de forma que la suma de los montos de los ítems asignados a cada SKU sea lo más cercana posible al "montoFob" de ese SKU. Todos los ítems deben quedar asignados a algún SKU.

SKUs (índice, NCM, monto FOB esperado):
${skusInfo.map(s => `- SKU ${s.index}: NCM ${s.ncm ?? "?"}, monto FOB USD ${s.montoFob.toFixed(2)}`).join("\n")}

Ítems (índice, descripción, monto):
${itemsConMonto.map(it => `- Item ${it.index}: "${it.descripcion}" — USD ${it.monto.toFixed(2)}`).join("\n")}

Respondé SOLO con JSON válido, sin texto adicional:
{
  "asignaciones": [
    { "skuIndex": número, "descripcion": "nombre combinado de los ítems asignados a este SKU, ej: 'Producto A + Producto B' si hay más de uno" }
  ]
}`,
    }],
  });

  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return 0;

  const resultado = JSON.parse(jsonMatch[0]) as { asignaciones: { skuIndex: number; descripcion: string }[] };

  let actualizados = 0;
  for (const asignacion of resultado.asignaciones) {
    const sku = skus[asignacion.skuIndex];
    if (!sku) continue;
    const codigoNcm = sku.ncm_aranceles?.codigo_ncm ?? null;
    const esPlaceholder = !sku.descripcion || sku.descripcion === codigoNcm;
    if (!esPlaceholder || !asignacion.descripcion?.trim()) continue;

    await supabase.from("skus").update({ descripcion: asignacion.descripcion.trim() }).eq("id", sku.id);
    actualizados++;
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
    .select("id, descripcion, cantidad, precio_unitario_fob_usd, created_at, ncm_aranceles(codigo_ncm)")
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

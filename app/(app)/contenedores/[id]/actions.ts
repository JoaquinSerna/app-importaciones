"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

import { familiaTributo } from "@/lib/ncm-match";
import { createClient } from "@/lib/supabase/server";

export interface DiItem {
  id: string;
  contenedor_id: string;
  documento_id: string | null;
  numero_item: string;
  descripcion_di: string | null;
  ncm: string | null;
  fob_usd: number;
  derechos_usd: number;
  tasa_estadistica_usd: number;
  antidumping_usd: number;
  iva_usd: number;
  carpeta_id: string | null;
  confianza: number | null;
  razon: string | null;
  confirmado: boolean;
}

export interface DiItemSkuAsignado {
  sku_id: string;
}

// Lee los di_items pendientes del contenedor y le pide a Claude que asigne
// cada uno a la carpeta y SKU(s) que correspondan, según la descripción y el
// NCM. Las asignaciones quedan guardadas como propuesta (confirmado: false)
// para que el comprador las revise en /contenedores/[id]/di-asignacion.
export async function asignarItemsDI(contenedorId: string): Promise<{ error?: string; asignados?: number }> {
  const supabase = createClient();

  const { data: diItems } = await supabase
    .from("di_items")
    .select("*")
    .eq("contenedor_id", contenedorId)
    .order("numero_item", { ascending: true });
  if (!diItems || diItems.length === 0) {
    return { error: "No hay ítems del despacho cargados para este contenedor. Subí y confirmá el Despacho de Importación primero." };
  }

  const { data: asignacionesCarpeta } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id, carpetas(id, titulo, numero_carpeta, fob_total_usd, skus(id, descripcion, descripcion_es, cantidad, precio_unitario_fob_usd))")
    .eq("contenedor_id", contenedorId);

  type CarpetaConSkus = {
    id: string;
    titulo: string | null;
    numero_carpeta: string;
    fob_total_usd: number;
    skus: { id: string; descripcion: string | null; descripcion_es: string | null; cantidad: number; precio_unitario_fob_usd: number }[];
  };

  const carpetas = (asignacionesCarpeta ?? [])
    .map((a) => a.carpetas as unknown as CarpetaConSkus | null)
    .filter((c): c is CarpetaConSkus => !!c);
  if (carpetas.length === 0) {
    return { error: "Este contenedor no tiene carpetas asignadas." };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Sos un despachante de aduana argentino. Tenés un Despacho de Importación con ${diItems.length} ítems y un contenedor con ${carpetas.length} carpetas (proveedores), cada una con sus SKUs.

Tu tarea es asignar cada ítem del DI a la carpeta y SKUs que corresponden.

ÍTEMS DEL DI:
${diItems.map((it) => `- Ítem ${it.numero_item}: "${it.descripcion_di ?? "(sin descripción)"}" — NCM ${it.ncm ?? "?"}`).join("\n")}

CARPETAS Y SKUs DEL CONTENEDOR:
${carpetas.map((c) => `- Carpeta "${c.titulo ?? c.numero_carpeta}" (id: ${c.id}):\n${c.skus.map((s) => `  - SKU (id: ${s.id}): "${s.descripcion_es ?? s.descripcion ?? "(sin descripción)"}" — FOB USD ${((s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0)).toFixed(2)}`).join("\n")}`).join("\n")}

Reglas:
- Cada ítem del DI pertenece a UNA sola carpeta.
- Un ítem puede corresponder a UNO o VARIOS SKUs de esa carpeta (mismo producto o mismo NCM).
- Usá la descripción del ítem del DI para identificar a qué producto/SKU corresponde.
- Si un ítem agrupa varios SKUs, listalos todos.
- Confianza: 1.0 = certeza total, 0.8 = muy probable, < 0.7 = dudoso.

Respondé SOLO con JSON válido, sin texto adicional:
{
  "asignaciones": [
    { "numero_item": "0001", "carpeta_id": "uuid", "sku_ids": ["uuid1", "uuid2"], "confianza": 0.95, "razon": "La descripción 'guantes de cuero' coincide con SKU CL520" }
  ]
}`,
    }],
  });

  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { error: "La IA no devolvió un resultado válido." };

  const resultado = JSON.parse(jsonMatch[0]) as {
    asignaciones: { numero_item: string; carpeta_id: string; sku_ids: string[]; confianza: number; razon: string }[];
  };

  const skuIdsValidos = new Set(carpetas.flatMap((c) => c.skus.map((s) => s.id)));
  const carpetaIdsValidas = new Set(carpetas.map((c) => c.id));

  let asignados = 0;
  for (const asignacion of resultado.asignaciones) {
    const diItem = diItems.find((it) => it.numero_item === asignacion.numero_item);
    if (!diItem) continue;
    if (!carpetaIdsValidas.has(asignacion.carpeta_id)) continue;

    await supabase
      .from("di_items")
      .update({ carpeta_id: asignacion.carpeta_id, confianza: asignacion.confianza, razon: asignacion.razon })
      .eq("id", diItem.id);

    await supabase.from("di_item_skus").delete().eq("di_item_id", diItem.id);
    const skuIds = (asignacion.sku_ids ?? []).filter((id) => skuIdsValidos.has(id));
    if (skuIds.length > 0) {
      await supabase.from("di_item_skus").insert(
        skuIds.map((skuId) => ({
          di_item_id: diItem.id,
          carpeta_id: asignacion.carpeta_id,
          sku_id: skuId,
        }))
      );
    }
    asignados++;
  }

  revalidatePath(`/contenedores/${contenedorId}/di-asignacion`);
  return { asignados };
}

export interface AsignacionItemInput {
  diItemId: string;
  carpetaId: string;
  skuIds: string[];
}

// Corre la propuesta de la IA y, si propuso algo para todos los ítems,
// la confirma en el mismo paso — para no obligar a un segundo click manual
// cuando la sugerencia ya está bien.
export async function asignarYConfirmarDI(contenedorId: string): Promise<{ error?: string; asignados?: number }> {
  const resultadoIA = await asignarItemsDI(contenedorId);
  if (resultadoIA.error) return resultadoIA;

  const supabase = createClient();
  const { data: diItems } = await supabase
    .from("di_items")
    .select("id, carpeta_id")
    .eq("contenedor_id", contenedorId);
  const diItemIds = (diItems ?? []).map((it) => it.id);

  const { data: diItemSkus } = diItemIds.length > 0
    ? await supabase.from("di_item_skus").select("di_item_id, sku_id").in("di_item_id", diItemIds)
    : { data: [] };

  const asignaciones: AsignacionItemInput[] = (diItems ?? [])
    .filter((it): it is { id: string; carpeta_id: string } => !!it.carpeta_id)
    .map((it) => ({
      diItemId: it.id,
      carpetaId: it.carpeta_id,
      skuIds: (diItemSkus ?? []).filter((dis) => dis.di_item_id === it.id).map((dis) => dis.sku_id),
    }))
    .filter((a) => a.skuIds.length > 0);

  if (asignaciones.length === 0) {
    return { error: "La IA no pudo proponer ninguna asignación con SKUs para confirmar." };
  }

  const resultadoConfirmacion = await confirmarAsignacionDI(contenedorId, asignaciones);
  if (resultadoConfirmacion.error) return { error: resultadoConfirmacion.error };

  return { asignados: asignaciones.length };
}

// Confirma (o corrige) la asignación de cada ítem del DI a su carpeta/SKUs,
// recalcula el prorrateo por FOB de cada tributo entre los SKUs de cada ítem,
// y vuelca el resultado a `costos` (origen 'real') y `costos_sku` por
// carpeta — reemplazando por completo lo que hubiera quedado de una
// confirmación anterior, para que sea re-ejecutable sin pasos manuales.
export async function confirmarAsignacionDI(
  contenedorId: string,
  asignaciones: AsignacionItemInput[]
): Promise<{ error?: string; diagnostico?: unknown }> {
  const supabase = createClient();

  const { data: diItems } = await supabase.from("di_items").select("*").eq("contenedor_id", contenedorId);
  if (!diItems || diItems.length === 0) return { error: "No hay ítems del despacho para confirmar." };

  const { data: asignacionesContenedor } = await supabase
    .from("carpeta_contenedores")
    .select("carpeta_id")
    .eq("contenedor_id", contenedorId);
  const carpetaIds = (asignacionesContenedor ?? []).map((a) => a.carpeta_id);
  if (carpetaIds.length === 0) return { error: "Este contenedor no tiene carpetas asignadas." };

  const { data: skusRaw } = await supabase
    .from("skus")
    .select("id, carpeta_id, cantidad, precio_unitario_fob_usd")
    .in("carpeta_id", carpetaIds);
  const skusPorId = new Map((skusRaw ?? []).map((s) => [s.id, s]));

  // documento_id de referencia para costos_sku (todos los di_items de este
  // contenedor vienen del mismo despacho confirmado más recientemente).
  const documentoId = diItems.find((it) => it.documento_id)?.documento_id ?? null;

  // monto por (sku_id, concepto), acumulado a través de todos los ítems del DI
  const montosPorSkuConcepto = new Map<string, number>();
  const antidumpingPorSku = new Map<string, number>();

  for (const asignacion of asignaciones) {
    const diItem = diItems.find((it) => it.id === asignacion.diItemId);
    if (!diItem) continue;

    const skusDelItem = asignacion.skuIds.map((id) => skusPorId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    if (skusDelItem.length === 0) continue;

    const fobPorSku = new Map(skusDelItem.map((s) => [s.id, (s.cantidad ?? 0) * (s.precio_unitario_fob_usd ?? 0)]));
    const fobTotalItem = Array.from(fobPorSku.values()).reduce((a, v) => a + v, 0);

    await supabase.from("di_item_skus").delete().eq("di_item_id", diItem.id);
    const filasDiItemSkus = skusDelItem.map((s) => {
      const fobSku = fobPorSku.get(s.id) ?? 0;
      const proporcionFob = fobTotalItem > 0 ? fobSku / fobTotalItem : 1 / skusDelItem.length;
      return { di_item_id: diItem.id, carpeta_id: asignacion.carpetaId, sku_id: s.id, proporcion_fob: proporcionFob };
    });
    await supabase.from("di_item_skus").insert(filasDiItemSkus);

    await supabase
      .from("di_items")
      .update({ carpeta_id: asignacion.carpetaId, confirmado: true })
      .eq("id", diItem.id);

    for (const fila of filasDiItemSkus) {
      const acumular = (concepto: string, montoItem: number) => {
        if (montoItem <= 0) return;
        const monto = montoItem * fila.proporcion_fob;
        const key = `${fila.sku_id}__${concepto}`;
        montosPorSkuConcepto.set(key, (montosPorSkuConcepto.get(key) ?? 0) + monto);
      };
      acumular("Derechos de importación", diItem.derechos_usd);
      acumular("Tasa estadística", diItem.tasa_estadistica_usd);
      acumular("IVA", diItem.iva_usd);
      if (diItem.antidumping_usd > 0) {
        const monto = diItem.antidumping_usd * fila.proporcion_fob;
        antidumpingPorSku.set(fila.sku_id, (antidumpingPorSku.get(fila.sku_id) ?? 0) + monto);
      }
    }
  }

  // Se vuelca una sola vez, ya con el total acumulado de todos los ítems del
  // DI, en vez de reescribirlo en cada vuelta del loop de arriba.
  for (const [skuId, monto] of Array.from(antidumpingPorSku.entries())) {
    if (monto > 0) montosPorSkuConcepto.set(`${skuId}__Derechos anti-dumping`, monto);
  }

  // Reset paga_dumping en todas las carpetas del contenedor antes de marcar
  // de nuevo a partir de esta asignación.
  await supabase.from("skus").update({ paga_dumping: false }).in("carpeta_id", carpetaIds);
  const skuIdsConDumping = Array.from(antidumpingPorSku.entries()).filter(([, m]) => m > 0).map(([id]) => id);
  if (skuIdsConDumping.length > 0) {
    await supabase.from("skus").update({ paga_dumping: true }).in("id", skuIdsConDumping);
  }

  // costos_sku: detalle real por SKU que usa la tab SKUs de cada carpeta.
  await supabase.from("costos_sku").delete().in("sku_id", Array.from(skusPorId.keys()));
  if (documentoId && montosPorSkuConcepto.size > 0) {
    const filas = Array.from(montosPorSkuConcepto.entries()).map(([key, monto]) => {
      const [skuId, concepto] = key.split("__");
      return { sku_id: skuId, documento_id: documentoId, concepto, monto_real_usd: monto };
    });
    await supabase.from("costos_sku").insert(filas);
  }

  // costos a nivel carpeta: suma de cada concepto entre los SKUs de esa carpeta.
  const totalPorCarpetaConcepto = new Map<string, number>();
  for (const [key, monto] of Array.from(montosPorSkuConcepto.entries())) {
    const [skuId, concepto] = key.split("__");
    const carpetaId = skusPorId.get(skuId)?.carpeta_id;
    if (!carpetaId) continue;
    const k = `${carpetaId}__${concepto}`;
    totalPorCarpetaConcepto.set(k, (totalPorCarpetaConcepto.get(k) ?? 0) + monto);
  }

  const NOTA_DI = "Asignación del despacho de importación (DI)";

  for (const carpetaId of Array.from(new Set(carpetaIds))) {
    // Limpio costos "nuevos" (sin equivalente en el simulador) insertados por
    // una confirmación anterior, antes de re-escribir desde cero.
    await supabase.from("costos").delete().eq("carpeta_id", carpetaId).eq("notas", NOTA_DI);

    // Limpio también filas de antidumping que hayan quedado de versiones
    // anteriores de este flujo (con otra nota u origen), para que no queden
    // duplicadas ni interfieran con el cálculo de esta confirmación.
    await supabase.from("costos").delete().eq("carpeta_id", carpetaId).ilike("concepto", "%anti%dumping%");

    const { data: costosExistentes } = await supabase.from("costos").select("id, concepto, origen").eq("carpeta_id", carpetaId);

    // Pongo en 0 los tributos conocidos antes de reaplicar — si esta
    // reconfirmación dejó algún concepto sin ítems asignados, no debe quedar
    // el monto de la confirmación anterior.
    const tributosConocidos = (costosExistentes ?? []).filter((c) => familiaTributo(c.concepto));
    for (const c of tributosConocidos) {
      await supabase.from("costos").update({ monto_real_usd: 0 }).eq("id", c.id);
    }

    const entradasCarpeta = Array.from(totalPorCarpetaConcepto.entries()).filter(([k]) => k.startsWith(`${carpetaId}__`));
    for (const [k, monto] of entradasCarpeta) {
      const concepto = k.split("__")[1];
      const familia = familiaTributo(concepto);
      const costoExistente = (costosExistentes ?? []).find((c) => familia && familiaTributo(c.concepto) === familia);
      console.log(
        `[confirmarAsignacionDI] concepto="${concepto}" familia="${familia}" costoExistente=${costoExistente?.id ?? "null"} monto=${monto}`
      );

      if (costoExistente) {
        await supabase.from("costos").update({ monto_real_usd: monto }).eq("id", costoExistente.id);
      } else {
        await supabase.from("costos").insert({
          carpeta_id: carpetaId,
          nivel: "carpeta" as const,
          concepto,
          categoria: "impuesto" as const,
          origen: "real" as const,
          monto_estimado_usd: 0,
          monto_real_usd: monto,
          notas: NOTA_DI,
        });
      }
    }
    revalidatePath(`/carpetas/${carpetaId}`);
  }

  revalidatePath(`/contenedores/${contenedorId}`);
  revalidatePath(`/contenedores/${contenedorId}/di-asignacion`);

  // Diagnóstico temporal — sacar después de confirmar el bug
  const diagnostico = {
    antidumpingPorSkuEntries: Array.from(antidumpingPorSku.entries()),
    montosPorSkuConceptoConDumping: Array.from(montosPorSkuConcepto.entries())
      .filter(([k]) => k.includes("anti")),
    totalPorCarpetaConceptoConDumping: Array.from(totalPorCarpetaConcepto.entries())
      .filter(([k]) => k.includes("anti")),
  };
  console.log("[DIAG antidumping]", JSON.stringify(diagnostico, null, 2));
  return { diagnostico };
}

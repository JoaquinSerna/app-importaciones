"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface ItemPropuesto {
  concepto_real: string;
  monto_real_usd: number;
  fuente: string;
  concepto_simulado: string | null;
  monto_simulado_usd: number | null;
  es_nuevo: boolean;
  confidence: number;
}

export interface ResultadoAnalisis {
  items: ItemPropuesto[];
  cbm_proporcion: number;
  advertencias: string[];
}

export async function analizarCostosReales(carpetaId: string): Promise<ResultadoAnalisis> {
  const supabase = createClient();
  const advertencias: string[] = [];

  // 1. Carpeta + parámetros
  const { data: carpeta } = await supabase
    .from("carpetas")
    .select("*")
    .eq("id", carpetaId)
    .single();
  if (!carpeta) throw new Error("Carpeta no encontrada");

  // 2. Simulación: usamos los costos YA GUARDADOS de la carpeta (origen='simulador'),
  // que ya tienen en cuenta el NCM y el tipo de importación reales. Recalcular la
  // cascada acá de nuevo sin esos datos hacía que Derechos/Tasa estadística salieran
  // en 0% y quedaran afuera de la lista — por eso la IA los marcaba siempre como "nuevo".
  const { data: costosSimulados } = await supabase
    .from("costos")
    .select("concepto, monto_estimado_usd")
    .eq("carpeta_id", carpetaId)
    .eq("origen", "simulador");

  const simulacionConFob = [
    { concepto: "FOB del proveedor", monto_estimado_usd: carpeta.fob_total_usd },
    ...(costosSimulados ?? []),
  ];

  // 3. Documentos de la carpeta
  const { data: docsCarpeta } = await supabase
    .from("documentos")
    .select("tipo, datos_extraidos")
    .eq("carpeta_id", carpetaId)
    .eq("estado", "extraido");

  // 4. Contenedores asignados a esta carpeta (puede ser más de uno, cada uno con su CBM)
  const { data: asignaciones } = await supabase
    .from("carpeta_contenedores")
    .select("contenedor_id, cbm_asignado, contenedores(numero_contenedor)")
    .eq("carpeta_id", carpetaId);

  const costosReales: { concepto: string; monto_usd: number; fuente: string }[] = [];
  let cbmProporcionPromedio = 1;

  if (!asignaciones || asignaciones.length === 0) {
    advertencias.push("Esta carpeta no está asignada a ningún contenedor. Los costos de logística y despachante no pueden prorratearse.");
  } else {
    for (const asignacion of asignaciones) {
      const numeroCont = (asignacion.contenedores as unknown as { numero_contenedor: string | null } | null)?.numero_contenedor ?? "—";

      const [{ data: docsContData }, { data: cbmsCont }, { data: fobsCont }] = await Promise.all([
        supabase
          .from("documentos")
          .select("tipo, datos_extraidos")
          .eq("contenedor_id", asignacion.contenedor_id)
          .eq("estado", "extraido"),
        supabase
          .from("carpeta_contenedores")
          .select("cbm_asignado")
          .eq("contenedor_id", asignacion.contenedor_id),
        supabase
          .from("carpeta_contenedores")
          .select("carpetas(fob_total_usd)")
          .eq("contenedor_id", asignacion.contenedor_id),
      ]);
      const docsContenedor = (docsContData ?? []) as { tipo: string; datos_extraidos: Record<string, unknown> | null }[];
      const cbmTotalCont = (cbmsCont ?? []).reduce((a, c) => a + (c.cbm_asignado ?? 0), 0);
      const cbmProporcion = cbmTotalCont > 0 ? asignacion.cbm_asignado / cbmTotalCont : 1;

      // El seguro se cobra como % del valor FOB de la mercadería, no del volumen —
      // por eso se prorratea por proporción de FOB en vez de CBM.
      const fobTotalCont = (fobsCont ?? []).reduce(
        (a, c) => a + ((c.carpetas as unknown as { fob_total_usd: number } | null)?.fob_total_usd ?? 0),
        0
      );
      const fobProporcion = fobTotalCont > 0 ? carpeta.fob_total_usd / fobTotalCont : cbmProporcion;
      const esSeguro = (concepto: string) => /seguro/i.test(concepto);

      const sufijoContenedor = asignaciones.length > 1 ? ` [contenedor #${numeroCont}]` : "";

      // Factura logística → prorateada por CBM (el seguro, por FOB)
      const factLog = docsContenedor.find(d => d.tipo === "factura_logistica");
      if (factLog?.datos_extraidos) {
        const conceptos = factLog.datos_extraidos.conceptos as { descripcion: string; monto: number; moneda: string }[] | undefined;
        if (conceptos?.length) {
          for (const c of conceptos) {
            const proporcion = esSeguro(c.descripcion) ? fobProporcion : cbmProporcion;
            const monto = Number(c.monto ?? 0) * proporcion;
            if (monto > 0) {
              costosReales.push({
                concepto: c.descripcion,
                monto_usd: monto,
                fuente: `Factura logística${proporcion < 0.999 ? ` (${(proporcion * 100).toFixed(0)}% del contenedor, por ${esSeguro(c.descripcion) ? "FOB" : "CBM"})` : ""}${sufijoContenedor}`,
              });
            }
          }
        } else {
          const total = Number(factLog.datos_extraidos.monto_total ?? 0) * cbmProporcion;
          if (total > 0) costosReales.push({ concepto: "Gastos logísticos", monto_usd: total, fuente: `Factura logística${sufijoContenedor}` });
        }
      } else {
        advertencias.push(`No se encontró Factura logística extraída en el contenedor #${numeroCont}.`);
      }

      // Factura despachante → prorateada por CBM, salvo honorarios y gastos
      // bancarios que son % de FOB/CIF y se prorratean por FOB.
      // (el SAF es solo adelanto, NO se suma)
      const esFobBased = (concepto: string) => /honorario|bancari/i.test(concepto);
      const factDesp = docsContenedor.find(d => d.tipo === "factura_despachante");
      if (factDesp?.datos_extraidos) {
        const conceptos = factDesp.datos_extraidos.conceptos as { descripcion: string; monto: number; moneda: string }[] | undefined;
        if (conceptos?.length) {
          for (const c of conceptos) {
            const proporcion = esFobBased(c.descripcion) ? fobProporcion : cbmProporcion;
            const monto = Number(c.monto ?? 0) * proporcion;
            if (monto > 0) {
              costosReales.push({
                concepto: c.descripcion,
                monto_usd: monto,
                fuente: `Factura despachante${proporcion < 0.999 ? ` (${(proporcion * 100).toFixed(0)}%, por ${esFobBased(c.descripcion) ? "FOB" : "CBM"})` : ""}${sufijoContenedor}`,
              });
            }
          }
        } else {
          const total = Number(factDesp.datos_extraidos.monto_total ?? 0) * cbmProporcion;
          if (total > 0) costosReales.push({ concepto: "Honorarios y gastos despachante", monto_usd: total, fuente: `Factura despachante${sufijoContenedor}` });
        }
      } else {
        advertencias.push(`No se encontró Factura del despachante extraída en el contenedor #${numeroCont}.`);
      }

      // Despacho de aduana → tributos reales en USD, prorateados por FOB
      // (derechos/tasa/IVA/etc. son % del valor de la mercadería, no del volumen).
      const despacho = docsContenedor.find(d => d.tipo === "despacho_aduana");
      if (despacho?.datos_extraidos?.monedas_confirmadas) {
        const itemsConfirmados = despacho.datos_extraidos.items_costos_confirmados as
          | { concepto: string; monto_usd: number }[]
          | undefined;
        if (itemsConfirmados) {
          const esValorMercaderia = (c: string) => /fob|flete|seguro|cif/i.test(c);
          const esAntiDumping = (c: string) => /anti-?dumping/i.test(c);
          for (const item of itemsConfirmados) {
            // Anti-dumping no entra acá: se prorratea por FOB solo entre los
            // SKUs marcados como "paga dumping" (ver pestaña SKUs), no por la
            // proporción genérica de toda la carpeta. Eso ya queda resuelto
            // en la tabla "costos" directamente al confirmar el despacho.
            if (esValorMercaderia(item.concepto) || esAntiDumping(item.concepto)) continue;
            const monto = item.monto_usd * fobProporcion;
            if (monto > 0) costosReales.push({ concepto: item.concepto, monto_usd: monto, fuente: `Despacho de aduana${sufijoContenedor}` });
          }
        }
      } else if (despacho) {
        advertencias.push(`El despacho de aduana del contenedor #${numeroCont} está cargado pero falta confirmar la moneda de cada costo (en la pestaña Documentos del contenedor).`);
      } else {
        advertencias.push(`No se encontró Despacho de aduana extraído en el contenedor #${numeroCont}.`);
      }

      cbmProporcionPromedio = cbmProporcion;
    }
  }

  // FOB real → Proforma Invoice (nunca comprobantes)
  const proforma = (docsCarpeta ?? []).find(d => d.tipo === "proforma_invoice");
  if (proforma?.datos_extraidos) {
    const fob = Number(proforma.datos_extraidos.fob_total ?? 0);
    if (fob > 0) costosReales.push({ concepto: "FOB del proveedor", monto_usd: fob, fuente: "Proforma Invoice" });
    else advertencias.push("La Proforma Invoice está cargada pero no se pudo extraer el FOB total.");
  } else {
    advertencias.push("No se encontró Proforma Invoice extraída. El FOB real no puede determinarse.");
  }

  if (costosReales.length === 0) {
    throw new Error("No hay documentos extraídos suficientes para analizar. Subí primero la Proforma Invoice y los documentos del contenedor.");
  }

  // 6. Llamar a Claude para el matching semántico
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Sos un despachante de aduana argentino experto en importaciones desde China. Tu tarea es relacionar costos reales (de documentos) con los conceptos de una simulación de importación.

CONCEPTOS DE LA SIMULACIÓN (estimados en USD):
${simulacionConFob.map(l => `- "${l.concepto}": USD ${Number(l.monto_estimado_usd).toFixed(2)}`).join("\n")}

COSTOS REALES EXTRAÍDOS DE DOCUMENTOS:
${costosReales.map(c => `- "${c.concepto}" (${c.fuente}): USD ${c.monto_usd.toFixed(2)}`).join("\n")}

Para cada costo real, determiná a qué concepto de la simulación corresponde y con qué nivel de confianza. Usá tu conocimiento del comercio exterior argentino:
- "Ocean freight", "Sea freight", "Flete marítimo" → Flete internacional
- "THC", "Terminal Handling Charge", "Gastos terminales", "Depósito fiscal" → THC o Depósito fiscal (según contexto)
- "BL fee", "OBL" → puede ser flete o costo nuevo
- "Sellado", "Estampillado" en factura despachante → parte de honorarios
- "Gastos extraordinarios", "Varios" → probablemente costo nuevo
- Los impuestos (IVA, derechos, tasa estadística, ganancias) siempre son directos
- Si el concepto real no puede relacionarse con NINGUNO de la simulación → es_nuevo: true

Confianza:
- 1.0: Mismo nombre o equivalente exacto (IVA = IVA)
- 0.9: Muy probable (Ocean freight = Flete internacional)
- 0.75-0.85: Probable pero con algo de ambigüedad
- < 0.75: Dudoso — el usuario debe confirmar

Respondé SOLO con JSON válido, sin texto adicional:
{
  "items": [
    {
      "concepto_real": "nombre exacto del costo real",
      "monto_real_usd": número,
      "fuente": "fuente exacta",
      "concepto_simulado": "nombre exacto del concepto de la simulación, o null si es nuevo",
      "monto_simulado_usd": número o null,
      "es_nuevo": boolean,
      "confidence": número 0.0-1.0
    }
  ]
}`,
    }],
  });

  const text = response.content.find(c => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("La IA no devolvió un resultado válido");

  const result = JSON.parse(jsonMatch[0]) as { items: ItemPropuesto[] };
  return { items: result.items, cbm_proporcion: cbmProporcionPromedio, advertencias };
}

// Lleva los montos reales confirmados de la comparación a la tabla "costos"
// (que es lo que ve la pestaña Costos). Sin esto, los resultados de la
// Sección 3 quedaban aislados y la columna "Real" de Costos seguía vacía.
async function sincronizarComparacionACostos(carpetaId: string, itemsConfirmados: ItemPropuesto[]) {
  const supabase = createClient();

  const conMatch = itemsConfirmados.filter((i) => i.concepto_simulado && i.concepto_simulado !== "FOB del proveedor");
  for (const item of conMatch) {
    await supabase
      .from("costos")
      .update({ monto_real_usd: item.monto_real_usd })
      .eq("carpeta_id", carpetaId)
      .eq("concepto", item.concepto_simulado as string);
  }

  // Costos nuevos (sin equivalente en la simulación) → se reemplazan enteros
  // cada vez para no duplicar entre re-análisis.
  await supabase.from("costos").delete().eq("carpeta_id", carpetaId).eq("origen", "real");
  const nuevos = itemsConfirmados.filter((i) => i.es_nuevo);
  if (nuevos.length > 0) {
    await supabase.from("costos").insert(
      nuevos.map((item) => ({
        carpeta_id: carpetaId,
        nivel: "carpeta" as const,
        concepto: item.concepto_real,
        categoria: "otro" as const,
        origen: "real" as const,
        monto_estimado_usd: 0,
        monto_real_usd: item.monto_real_usd,
        notas: `Detectado automáticamente en ${item.fuente}`,
      }))
    );
  }
}

export async function guardarComparacion(carpetaId: string, items: ItemPropuesto[]) {
  const supabase = createClient();
  await supabase.from("comparacion_items").delete().eq("carpeta_id", carpetaId);
  if (items.length > 0) {
    const { error } = await supabase.from("comparacion_items").insert(
      items.map(item => ({
        carpeta_id: carpetaId,
        concepto_simulado: item.concepto_simulado,
        monto_simulado_usd: item.monto_simulado_usd,
        concepto_real: item.concepto_real,
        monto_real_usd: item.monto_real_usd,
        fuente: item.fuente,
        es_nuevo: item.es_nuevo,
        confirmado: true,
      }))
    );
    if (error) throw new Error(error.message);
  }
  await sincronizarComparacionACostos(carpetaId, items);
  revalidatePath(`/carpetas/${carpetaId}`);
}

// Corre el análisis sin intervención del usuario: los matches con alta
// confianza se confirman y se sincronizan a Costos solos; los dudosos quedan
// guardados como pendientes para que la Sección 3 los muestre listos para
// revisar (en vez de arrancar vacía y obligar a apretar "Analizar").
export async function autoAnalizarCarpeta(carpetaId: string): Promise<void> {
  try {
    const resultado = await analizarCostosReales(carpetaId);
    const supabase = createClient();

    await supabase.from("comparacion_items").delete().eq("carpeta_id", carpetaId);
    if (resultado.items.length > 0) {
      const { error } = await supabase.from("comparacion_items").insert(
        resultado.items.map((item) => ({
          carpeta_id: carpetaId,
          concepto_simulado: item.concepto_simulado,
          monto_simulado_usd: item.monto_simulado_usd,
          concepto_real: item.concepto_real,
          monto_real_usd: item.monto_real_usd,
          fuente: item.fuente,
          es_nuevo: item.es_nuevo,
          confirmado: item.confidence >= 0.85,
        }))
      );
      if (error) {
        console.error("autoAnalizarCarpeta: insert comparacion_items", error);
        return;
      }
    }

    const confirmados = resultado.items.filter((i) => i.confidence >= 0.85);
    if (confirmados.length > 0) {
      await sincronizarComparacionACostos(carpetaId, confirmados);
    }

    revalidatePath(`/carpetas/${carpetaId}`);
  } catch (err) {
    // Best-effort: si faltan documentos o la IA falla, no debe romper la
    // subida del documento que disparó este análisis automático.
    console.error("autoAnalizarCarpeta", err);
  }
}

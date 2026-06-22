"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

import { calcularCascada, costosComoLineas } from "@/lib/calculadora-costos";
import { createClient } from "@/lib/supabase/server";
import type { ParametrosGlobales } from "@/lib/types";

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

  const { data: params } = await supabase
    .from("parametros_globales")
    .select("*")
    .eq("id", carpeta.parametros_snapshot_id)
    .single();
  if (!params) throw new Error("Parámetros no encontrados");

  // 2. Simulación
  const cascada = calcularCascada(params as ParametrosGlobales, {
    fobTotalUsd: carpeta.fob_total_usd,
    cbmTotal: carpeta.cbm_total ?? undefined,
    pesoTotalKg: carpeta.peso_total_kg ?? undefined,
  });
  const lineasSimulacion = costosComoLineas(cascada);
  const simulacionConFob = [
    { concepto: "FOB del proveedor", monto_estimado_usd: carpeta.fob_total_usd },
    ...lineasSimulacion,
  ];

  // 3. Documentos de la carpeta
  const { data: docsCarpeta } = await supabase
    .from("documentos")
    .select("tipo, datos_extraidos")
    .eq("carpeta_id", carpetaId)
    .eq("estado", "extraido");

  // 4. Documentos del contenedor + proporción CBM
  let docsContenedor: { tipo: string; datos_extraidos: Record<string, unknown> | null }[] = [];
  let cbmProporcion = 1;

  if (carpeta.contenedor_id) {
    const [{ data: docsContData }, { data: carpetasCont }] = await Promise.all([
      supabase
        .from("documentos")
        .select("tipo, datos_extraidos")
        .eq("contenedor_id", carpeta.contenedor_id)
        .eq("estado", "extraido"),
      supabase
        .from("carpetas")
        .select("cbm_total")
        .eq("contenedor_id", carpeta.contenedor_id),
    ]);
    docsContenedor = (docsContData ?? []) as typeof docsContenedor;
    const cbmTotalCont = (carpetasCont ?? []).reduce((a, c) => a + (c.cbm_total ?? 0), 0);
    if (cbmTotalCont > 0 && carpeta.cbm_total) {
      cbmProporcion = carpeta.cbm_total / cbmTotalCont;
    }
  } else {
    advertencias.push("Esta carpeta no está asignada a ningún contenedor. Los costos de logística y despachante no pueden prorratearse.");
  }

  // 5. Construir lista de costos reales para Claude
  const costosReales: { concepto: string; monto_usd: number; fuente: string }[] = [];

  // FOB real → Proforma Invoice (nunca comprobantes)
  const proforma = (docsCarpeta ?? []).find(d => d.tipo === "proforma_invoice");
  if (proforma?.datos_extraidos) {
    const fob = Number(proforma.datos_extraidos.fob_total ?? 0);
    if (fob > 0) costosReales.push({ concepto: "FOB del proveedor", monto_usd: fob, fuente: "Proforma Invoice" });
    else advertencias.push("La Proforma Invoice está cargada pero no se pudo extraer el FOB total.");
  } else {
    advertencias.push("No se encontró Proforma Invoice extraída. El FOB real no puede determinarse.");
  }

  // Factura logística → prorateada por CBM
  const factLog = docsContenedor.find(d => d.tipo === "factura_logistica");
  if (factLog?.datos_extraidos) {
    const conceptos = factLog.datos_extraidos.conceptos as { descripcion: string; monto: number; moneda: string }[] | undefined;
    if (conceptos?.length) {
      for (const c of conceptos) {
        const monto = Number(c.monto ?? 0) * cbmProporcion;
        if (monto > 0) {
          costosReales.push({
            concepto: c.descripcion,
            monto_usd: monto,
            fuente: `Factura logística${cbmProporcion < 0.999 ? ` (${(cbmProporcion * 100).toFixed(0)}% del contenedor)` : ""}`,
          });
        }
      }
    } else {
      const total = Number(factLog.datos_extraidos.monto_total ?? 0) * cbmProporcion;
      if (total > 0) costosReales.push({ concepto: "Gastos logísticos", monto_usd: total, fuente: "Factura logística" });
    }
  } else if (carpeta.contenedor_id) {
    advertencias.push("No se encontró Factura logística extraída en el contenedor.");
  }

  // Factura despachante → prorateada (el SAF es solo adelanto, NO se suma)
  const factDesp = docsContenedor.find(d => d.tipo === "factura_despachante");
  if (factDesp?.datos_extraidos) {
    const conceptos = factDesp.datos_extraidos.conceptos as { descripcion: string; monto: number; moneda: string }[] | undefined;
    if (conceptos?.length) {
      for (const c of conceptos) {
        const monto = Number(c.monto ?? 0) * cbmProporcion;
        if (monto > 0) {
          costosReales.push({
            concepto: c.descripcion,
            monto_usd: monto,
            fuente: `Factura despachante${cbmProporcion < 0.999 ? ` (${(cbmProporcion * 100).toFixed(0)}%)` : ""}`,
          });
        }
      }
    } else {
      const total = Number(factDesp.datos_extraidos.monto_total ?? 0) * cbmProporcion;
      if (total > 0) costosReales.push({ concepto: "Honorarios y gastos despachante", monto_usd: total, fuente: "Factura despachante" });
    }
  } else if (carpeta.contenedor_id) {
    advertencias.push("No se encontró Factura del despachante extraída en el contenedor.");
  }

  // Despacho de aduana → impuestos reales en USD (prorateados por CBM)
  const despacho = docsContenedor.find(d => d.tipo === "despacho_aduana");
  if (despacho?.datos_extraidos) {
    const t = despacho.datos_extraidos.totales as Record<string, number> | undefined;
    if (t) {
      const impuestos = [
        ["derechos_importacion_usd", "Derechos de importación"],
        ["tasa_estadistica_usd", "Tasa estadística"],
        ["iva_usd", "IVA"],
        ["iva_adicional_usd", "IVA adicional"],
        ["ganancias_usd", "Anticipo de ganancias"],
      ] as const;
      for (const [key, label] of impuestos) {
        const monto = Number(t[key] ?? 0) * cbmProporcion;
        if (monto > 0) costosReales.push({ concepto: label, monto_usd: monto, fuente: "Despacho de aduana" });
      }
    }
  } else if (carpeta.contenedor_id) {
    advertencias.push("No se encontró Despacho de aduana extraído en el contenedor.");
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
  return { items: result.items, cbm_proporcion: cbmProporcion, advertencias };
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
  revalidatePath(`/carpetas/${carpetaId}`);
}

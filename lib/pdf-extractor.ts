// Extracción de datos estructurados desde un PDF de liquidación de un
// despachante de aduana argentino, usando Claude (modelo haiku) con tool use
// para forzar una salida JSON con un schema fijo.

import Anthropic from "@anthropic-ai/sdk";

import type { LiquidacionExtraida } from "@/lib/types";

const MODELO_HAIKU = "claude-3-5-haiku-20241022";

const EXTRACTION_TOOL_NAME = "registrar_liquidacion";

const EXTRACTION_TOOL = {
  name: EXTRACTION_TOOL_NAME,
  description:
    "Registra los datos extraídos de una liquidación de gastos de un despachante de aduana argentino.",
  input_schema: {
    type: "object" as const,
    properties: {
      numero_despacho: {
        type: ["string", "null"],
        description:
          "Número de despacho de importación (formato típico tipo 21 dígitos, ej. 21001IC01000123F), o null si no se encuentra.",
      },
      tc_utilizado: {
        type: ["number", "null"],
        description: "Tipo de cambio USD/ARS utilizado en la liquidación, o null si no se encuentra.",
      },
      conceptos: {
        type: "array",
        description: "Lista de conceptos/líneas de la liquidación con sus montos.",
        items: {
          type: "object",
          properties: {
            concepto: { type: "string", description: "Descripción del concepto/ítem." },
            monto_usd: { type: ["number", "null"], description: "Monto en USD, o null si no aplica." },
            monto_ars: { type: ["number", "null"], description: "Monto en ARS, o null si no aplica." },
          },
          required: ["concepto", "monto_usd", "monto_ars"],
        },
      },
    },
    required: ["numero_despacho", "tc_utilizado", "conceptos"],
  },
};

const PROMPT_EXTRACCION = `Eres un asistente especializado en leer liquidaciones de gastos emitidas por despachantes de aduana en Argentina (despacho de importación).

Analizá el PDF adjunto y extraé:
1. El número de despacho de importación.
2. El tipo de cambio (TC) USD/ARS utilizado en la liquidación (si figura).
3. La lista completa de conceptos/ítems de la liquidación, con su monto en USD y/o ARS (cuando un concepto solo tenga un monto en una moneda, dejá el otro campo en null).

Usá la herramienta "${EXTRACTION_TOOL_NAME}" para devolver el resultado. No agregues texto fuera de la llamada a la herramienta.`;

/**
 * Extrae los datos estructurados de una liquidación de despachante de aduana
 * a partir de un PDF (en base64 o Buffer), usando Claude Haiku con tool use.
 *
 * Lanza un error explícito si no hay ANTHROPIC_API_KEY configurada o si la
 * respuesta del modelo no contiene el tool_use esperado.
 */
export async function extraerLiquidacionDesdePdf(
  pdf: Buffer | string
): Promise<LiquidacionExtraida> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada. Configurá la variable de entorno para poder extraer datos de PDFs."
    );
  }

  const base64Pdf = Buffer.isBuffer(pdf) ? pdf.toString("base64") : pdf;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 4096,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            type: "text",
            text: PROMPT_EXTRACCION,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === EXTRACTION_TOOL_NAME
  );

  if (!toolUse) {
    throw new Error(
      "Claude no devolvió una extracción estructurada del PDF. Verificá que el documento sea una liquidación válida."
    );
  }

  const input = toolUse.input as {
    numero_despacho: string | null;
    tc_utilizado: number | null;
    conceptos: { concepto: string; monto_usd: number | null; monto_ars: number | null }[];
  };

  return {
    numero_despacho: input.numero_despacho ?? null,
    tc_utilizado: input.tc_utilizado ?? null,
    conceptos: (input.conceptos ?? []).map((c) => ({
      concepto: c.concepto,
      monto_usd: c.monto_usd ?? null,
      monto_ars: c.monto_ars ?? null,
    })),
  };
}

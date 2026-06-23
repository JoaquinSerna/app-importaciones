import Anthropic from "@anthropic-ai/sdk";
import type { TipoDocumento } from "@/lib/types";

const client = new Anthropic();

const PROMPTS: Partial<Record<TipoDocumento, string>> = {
  proforma_invoice: `
Analizá esta Proforma Invoice y extraé la siguiente información en JSON:
{
  "proveedor": "nombre del proveedor/shipper",
  "fecha": "fecha del documento (YYYY-MM-DD)",
  "moneda": "USD/EUR/etc",
  "fob_total": número total FOB,
  "items": [{ "descripcion": "...", "cantidad": número, "precio_unitario": número, "total": número }],
  "notas": "observaciones importantes si hay"
}
Solo devolvé el JSON, sin texto adicional.`,

  packing_list: `
Analizá este Packing List y extraé la siguiente información en JSON:
{
  "destinatario": "nombre del destinatario/consignee",
  "destinatario_es_ppo": true o false (true si dice 'PPO Projects' o 'PPO PROJECTS'),
  "fecha": "YYYY-MM-DD",
  "cbm_total": número total en m3,
  "peso_bruto_total_kg": número,
  "peso_neto_total_kg": número,
  "bultos_total": número,
  "items": [{ "descripcion": "...", "cantidad": número, "cbm": número, "peso_kg": número }]
}
Solo devolvé el JSON, sin texto adicional.`,

  commercial_invoice: `
Analizá esta Commercial Invoice y extraé la siguiente información en JSON:
{
  "vendedor": "nombre del vendedor",
  "destinatario": "nombre del destinatario/consignee/buyer",
  "destinatario_es_ppo": true o false (true si dice 'PPO Projects' o 'PPO PROJECTS'),
  "fecha": "YYYY-MM-DD",
  "moneda": "USD/EUR/etc",
  "fob_total": número total FOB,
  "items": [{ "descripcion": "...", "cantidad": número, "precio_unitario": número, "total": número }],
  "condiciones_pago": "texto de condiciones si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  comprobante_pago_anticipo: `
Analizá este comprobante de pago y extraé la siguiente información en JSON:
{
  "fecha": "fecha del pago (YYYY-MM-DD)",
  "monto": número,
  "moneda": "USD/ARS/etc",
  "banco_origen": "nombre del banco si aparece",
  "beneficiario": "nombre del destinatario si aparece",
  "concepto": "concepto o descripción del pago si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  comprobante_pago_saldo: `
Analizá este comprobante de pago y extraé la siguiente información en JSON:
{
  "fecha": "fecha del pago (YYYY-MM-DD)",
  "monto": número,
  "moneda": "USD/ARS/etc",
  "banco_origen": "nombre del banco si aparece",
  "beneficiario": "nombre del destinatario si aparece",
  "concepto": "concepto o descripción del pago si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  instruccion_transferencia_anticipo: `
Analizá esta instrucción de transferencia bancaria y extraé la siguiente información en JSON:
{
  "fecha": "YYYY-MM-DD si aparece",
  "monto": número si aparece,
  "moneda": "USD/ARS/etc",
  "banco_destino": "nombre del banco beneficiario",
  "beneficiario": "nombre del beneficiario",
  "cuenta": "número de cuenta o IBAN si aparece",
  "swift": "código SWIFT si aparece",
  "concepto": "concepto del pago"
}
Solo devolvé el JSON, sin texto adicional.`,

  instruccion_transferencia_saldo: `
Analizá esta instrucción de transferencia bancaria y extraé la siguiente información en JSON:
{
  "fecha": "YYYY-MM-DD si aparece",
  "monto": número si aparece,
  "moneda": "USD/ARS/etc",
  "banco_destino": "nombre del banco beneficiario",
  "beneficiario": "nombre del beneficiario",
  "cuenta": "número de cuenta o IBAN si aparece",
  "swift": "código SWIFT si aparece",
  "concepto": "concepto del pago"
}
Solo devolvé el JSON, sin texto adicional.`,

  saf: `
Analizá este SAF (Servicio de Almacenaje y Fiscalización) del despachante de aduanas y extraé la siguiente información en JSON:
{
  "numero_saf": "número del SAF si aparece",
  "despachante": "nombre del despachante o empresa",
  "importador": "nombre del importador",
  "fecha": "YYYY-MM-DD",
  "monto_total": número total a pagar,
  "moneda": "USD/ARS/etc",
  "contenedor": "número de contenedor si aparece",
  "conceptos": [{ "descripcion": "...", "monto": número }]
}
Solo devolvé el JSON, sin texto adicional.`,

  comprobante_pago_saf: `
Analizá este comprobante de pago y extraé la siguiente información en JSON:
{
  "fecha": "fecha del pago (YYYY-MM-DD)",
  "monto": número,
  "moneda": "USD/ARS/etc",
  "banco_origen": "nombre del banco si aparece",
  "beneficiario": "nombre del destinatario si aparece",
  "concepto": "concepto o descripción del pago si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  factura_logistica: `
Analizá esta factura de servicios logísticos (puede ser de empresas como ACW Cargo, Cargo Express, etc.) y extraé la siguiente información en JSON:
{
  "numero_factura": "número de factura",
  "emisor": "nombre de la empresa logística",
  "cliente": "nombre del cliente/importador",
  "fecha": "YYYY-MM-DD",
  "monto_total": número total,
  "moneda": "USD/ARS/etc",
  "contenedor": "número de contenedor si aparece",
  "conceptos": [
    { "descripcion": "descripción del servicio (flete, THC, handling, depósito, etc.)", "monto": número, "moneda": "USD/ARS" }
  ]
}
Solo devolvé el JSON, sin texto adicional.`,

  comprobante_pago_logistica: `
Analizá este comprobante de pago y extraé la siguiente información en JSON:
{
  "fecha": "fecha del pago (YYYY-MM-DD)",
  "monto": número,
  "moneda": "USD/ARS/etc",
  "banco_origen": "nombre del banco si aparece",
  "beneficiario": "nombre del destinatario si aparece",
  "concepto": "concepto o descripción del pago si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  factura_despachante: `
Analizá esta factura del despachante de aduanas y extraé la siguiente información en JSON:
{
  "numero_factura": "número de factura",
  "despachante": "nombre del despachante o empresa",
  "cliente": "nombre del cliente/importador",
  "fecha": "YYYY-MM-DD",
  "monto_total": número total,
  "moneda": "USD/ARS/etc",
  "numero_despacho": "número de despacho si aparece",
  "conceptos": [
    { "descripcion": "descripción del concepto (honorarios, gastos, sellados, etc.)", "monto": número, "moneda": "USD/ARS" }
  ]
}
Solo devolvé el JSON, sin texto adicional.`,

  comprobante_pago_despachante: `
Analizá este comprobante de pago y extraé la siguiente información en JSON:
{
  "fecha": "fecha del pago (YYYY-MM-DD)",
  "monto": número,
  "moneda": "USD/ARS/etc",
  "banco_origen": "nombre del banco si aparece",
  "beneficiario": "nombre del destinatario si aparece",
  "concepto": "concepto o descripción del pago si aparece"
}
Solo devolvé el JSON, sin texto adicional.`,

  despacho_aduana: `
Analizá este despacho de aduana y extraé la siguiente información en JSON.

IMPORTANTE sobre montos: NO asumas ni asignes la moneda (USD o ARS) de cada costo — eso lo va a confirmar el usuario manualmente después, ya que los despachos varían y la IA no puede adivinar esto de forma confiable. Solo extraé el número exactamente como aparece en el documento, sin signo de moneda.

"valores_generales" son montos que aparecen UNA SOLA VEZ en el despacho (no por ítem) — normalmente en un resumen o en los datos generales: FOB total, Flete internacional total, Seguro total, CIF/Valor en aduana total, y tributos especiales (anti-dumping, salvaguardias, aranceles especiales) si el despacho los expresa como un total único. Extraé el número tal cual figura, no inventes ni calcules nada.

"items" es la lista de TODOS los ítems/posiciones NCM del despacho (puede haber muchos, en varias páginas). Para cada ítem extraé SOLO los montos de la columna "DEL ITEM" de Derechos de importación, Tasa estadística, IVA e IVA adicional/Anticipo de ganancias si aparecen — estos son los que varían ítem por ítem y NO tenés que sumarlos vos: el código de la aplicación los suma después automáticamente. Es más importante que cada número individual sea correcto que tratar de calcular un total.
- NO uses la columna "TOTAL" (acumulado/resumen que aparece en la primera hoja o se repite por página) para nada — ni la copies en "items" ni la sumes en "valores_generales".
- Si el despacho tiene una sola página/ítem, "items" tiene un solo elemento.

{
  "numero_despacho": "número completo del despacho (ej: 012D-2024-000123)",
  "importador": "nombre del importador",
  "despachante": "nombre del despachante",
  "fecha_oficializacion": "YYYY-MM-DD",
  "aduana": "nombre de la aduana",
  "regimen": "código y descripción del régimen de importación",
  "tipo_cambio": número (tipo de cambio / cotización que figura en el despacho, ej: "Cotiz = 1.382,00", o null si no aparece),
  "valores_generales": [
    { "concepto": "FOB", "monto": número },
    { "concepto": "Flete internacional", "monto": número },
    { "concepto": "Seguro", "monto": número },
    { "concepto": "CIF", "monto": número },
    { "concepto": "Derechos anti-dumping", "monto": número, "_comentario": "solo si el despacho lo muestra como un total único; si varía por ítem, ponelo en 'items' en cambio" }
  ],
  "items": [
    {
      "item": número de ítem,
      "ncm": "código NCM de 8 dígitos",
      "derechos_importacion": número,
      "tasa_estadistica": número,
      "iva": número,
      "iva_adicional": número,
      "ganancias": número,
      "arancel_sim": número,
      "anti_dumping": número
    }
  ]
}
Omití cualquier campo (en "valores_generales" o dentro de un ítem) que no aparezca en el documento — no inventes valores en cero. Solo devolvé el JSON, sin texto adicional.`,
};

export async function extraerDatosDocumento(
  buffer: Buffer,
  tipo: TipoDocumento,
  mimeType: string = "application/pdf"
): Promise<Record<string, unknown> | null> {
  const prompt = PROMPTS[tipo];
  if (!prompt) return null;

  const isImage = mimeType.startsWith("image/");
  const b64 = buffer.toString("base64");

  const fileBlock = isImage
    ? ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: b64,
        },
      })
    : ({
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: b64,
        },
      });

  // Los despachos pueden tener muchos ítems (varias páginas) — con pocos
  // tokens la respuesta se corta a la mitad y el JSON queda incompleto.
  const maxTokens = tipo === "despacho_aduana" ? 8192 : 2048;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: prompt }],
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let datos: Record<string, unknown> | null;
  try {
    datos = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  if (tipo === "despacho_aduana" && datos) {
    datos.items_costos = construirItemsCostosDespacho(datos);
  }

  return datos;
}

// Suma en código (no en la IA) los montos por ítem del despacho — la IA
// extrae cada número individual, que es confiable; pedirle que sume 10-20
// ítems mentalmente no lo es, y daba un total distinto en cada corrida.
function construirItemsCostosDespacho(datos: Record<string, unknown>): { concepto: string; monto: number }[] {
  const valoresGenerales = (datos.valores_generales ?? []) as { concepto: string; monto: number }[];
  const items = (datos.items ?? []) as Record<string, number | string | undefined>[];

  const sumarCampo = (campo: string) =>
    items.reduce((acc, item) => acc + (Number(item[campo]) || 0), 0);

  const resultado = [...valoresGenerales];

  const CAMPOS_POR_ITEM: { campo: string; concepto: string }[] = [
    { campo: "derechos_importacion", concepto: "Derechos de importación" },
    { campo: "tasa_estadistica", concepto: "Tasa estadística" },
    { campo: "iva", concepto: "IVA" },
    { campo: "iva_adicional", concepto: "IVA adicional" },
    { campo: "ganancias", concepto: "Anticipo de ganancias" },
    { campo: "arancel_sim", concepto: "Arancel SIM Impo" },
    { campo: "anti_dumping", concepto: "Derechos anti-dumping" },
  ];

  for (const { campo, concepto } of CAMPOS_POR_ITEM) {
    const total = sumarCampo(campo);
    if (total > 0) {
      // Si "valores_generales" ya traía este concepto (caso anti-dumping
      // como total único), no lo dupliques sumando también por ítem.
      const yaExiste = resultado.some((r) => r.concepto === concepto);
      if (!yaExiste) resultado.push({ concepto, monto: total });
    }
  }

  return resultado;
}

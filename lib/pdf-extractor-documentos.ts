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

En "items_costos" incluí TODOS los conceptos de valor o costo del despacho COMPLETO (FOB, Flete, Seguro, CIF, Derechos de importación, Tasa estadística, IVA, IVA adicional, Anticipo de ganancias, Derechos anti-dumping, salvaguardias, aranceles especiales, y cualquier otro tributo o concepto monetario que aparezca), cada uno con su monto TOTAL sumando todos los ítems del despacho. Omití los conceptos que no aparezcan en el documento — no inventes valores en cero.

IMPORTANTE sobre despachos con múltiples ítems/páginas (cada ítem es una posición NCM distinta): la tabla de liquidación tiene dos columnas de importe — "DEL ITEM" (el monto de ESE ítem puntual) y "TOTAL" (un acumulado/resumen que suele aparecer en la primera hoja o repetirse en cada página, y que YA es la suma de todo el despacho hecha por el propio documento).
- Para calcular el monto total de cada concepto en "items_costos", SUMÁ la columna "DEL ITEM" de TODOS los ítems/páginas (un valor por cada ítem, sumados entre sí). Esto es correcto y esperado.
- NO uses ni sumes la columna "TOTAL" de la primera hoja (o la que se repite por página) como si fuera un ítem más — esa columna ya es el resultado final, sumarla de nuevo duplica el monto. Podés usarla solo como verificación: el total que vos calculés sumando "DEL ITEM" de todos los ítems debería coincidir con esa columna "TOTAL".

Si un tributo como "Derechos anti-dumping" solo aparece en algunos ítems del despacho (no en todos), igual sumá el monto de los ítems que lo tengan y poné ese total en "items_costos" con su nombre — no hace falta indicar a qué ítems corresponde, eso lo va a definir el usuario manualmente en la app.

{
  "numero_despacho": "número completo del despacho (ej: 012D-2024-000123)",
  "importador": "nombre del importador",
  "despachante": "nombre del despachante",
  "fecha_oficializacion": "YYYY-MM-DD",
  "aduana": "nombre de la aduana",
  "regimen": "código y descripción del régimen de importación",
  "tipo_cambio": número (tipo de cambio / cotización que figura en el despacho, ej: "Cotiz = 1.382,00", o null si no aparece),
  "items_costos": [
    { "concepto": "FOB", "monto": número },
    { "concepto": "Flete internacional", "monto": número },
    { "concepto": "Seguro", "monto": número },
    { "concepto": "CIF", "monto": número },
    { "concepto": "Derechos de importación", "monto": número },
    { "concepto": "Tasa estadística", "monto": número },
    { "concepto": "IVA", "monto": número },
    { "concepto": "IVA adicional", "monto": número },
    { "concepto": "Anticipo de ganancias", "monto": número },
    { "concepto": "Derechos anti-dumping", "monto": número, "_comentario": "solo si aparece en el despacho" }
  ]
}
Solo devolvé el JSON, sin texto adicional.`,
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

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
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

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

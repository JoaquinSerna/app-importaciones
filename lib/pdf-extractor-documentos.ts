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

"items" es la lista de TODOS los ítems/posiciones NCM del despacho (puede haber muchos, en varias páginas). Cada ítem tiene una tabla de "Liquidación" o "Conceptos" con varias filas (Porc. / P-G-C / Importe / Concepto) — para cada ítem extraé TODAS esas filas tal como aparecen, usando el monto de la columna "DEL ITEM" (Importe), SIN omitir ninguna aunque no reconozcas el concepto. Copiá el nombre del concepto EXACTAMENTE como figura impreso (ej: "DERECHOS IMPORTACION", "I.V.A.", "TASA ESTAD MONT MAX", "DER. ANTIDUMPING", "ARANCEL SIM IMPO"), código incluido si lo tiene (ej: "(010) DERECHOS IMPORTACION"). NO tenés que sumar nada vos ni reconocer qué es cada concepto: el código de la aplicación se encarga de sumarlos y agruparlos después. Es más importante que cada fila y cada número individual sea correcto que tratar de interpretar o calcular un total.
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
    { "concepto": "CIF", "monto": número }
  ],
  "items": [
    {
      "item": número de ítem,
      "ncm": "código NCM de 8 dígitos",
      "conceptos": [
        { "concepto": "nombre exacto tal como figura impreso en la fila de liquidación de este ítem", "monto": número }
      ]
    }
  ]
}
Omití cualquier valor (en "valores_generales" o dentro de un ítem) que no aparezca en el documento — no inventes valores en cero. Solo devolvé el JSON, sin texto adicional.`,
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

// Normaliza el nombre tal como lo escribe el despacho (con códigos, puntos,
// abreviaturas, etc.) a un nombre canónico, para poder agrupar y sumar entre
// ítems aunque la IA copie el texto con variaciones menores. Si no reconoce
// el concepto, lo deja tal cual — aparece como "costo nuevo" en Sección 3.
function normalizarConceptoDespacho(raw: string): string {
  const compacto = raw
    .toLowerCase()
    .replace(/[^a-zà-ÿ]/g, ""); // solo letras (con tildes), sin espacios/puntos/números/códigos

  if (compacto.includes("antidump")) return "Derechos anti-dumping";
  if (compacto.includes("salvaguardia")) return "Salvaguardia";
  if (compacto.includes("tasaestad") && compacto.includes("max")) return "Tasa estadística monto máximo";
  if (compacto.includes("tasaestad")) return "Tasa estadística";
  if (compacto.includes("ivaadic")) return "IVA adicional";
  if (compacto === "iva" || (compacto.includes("iva") && compacto.length <= 5)) return "IVA";
  if (compacto.includes("ganancia")) return "Anticipo de ganancias";
  if (compacto.includes("arancel")) return "Arancel SIM Impo";
  if (compacto.includes("iibb") || compacto.includes("ingresosbrutos")) return "IIBB";
  if (compacto.includes("derecho")) return "Derechos de importación";
  return raw.trim();
}

// Suma en código (no en la IA) los montos por ítem del despacho — la IA
// extrae cada fila individual, que es confiable; pedirle que sume 10-20
// ítems mentalmente no lo es, y daba un total distinto en cada corrida.
function construirItemsCostosDespacho(datos: Record<string, unknown>): { concepto: string; monto: number }[] {
  const valoresGenerales = (datos.valores_generales ?? []) as { concepto: string; monto: number }[];
  const items = (datos.items ?? []) as { conceptos?: { concepto: string; monto: number }[] }[];

  const sumas = new Map<string, number>();
  for (const item of items) {
    for (const c of item.conceptos ?? []) {
      const monto = Number(c.monto) || 0;
      if (monto === 0) continue;
      const concepto = normalizarConceptoDespacho(c.concepto ?? "");
      sumas.set(concepto, (sumas.get(concepto) ?? 0) + monto);
    }
  }

  const resultado = [...valoresGenerales];
  for (const [concepto, monto] of Array.from(sumas.entries())) {
    const yaExiste = resultado.some((r) => r.concepto === concepto);
    if (!yaExiste) resultado.push({ concepto, monto });
  }

  return resultado;
}

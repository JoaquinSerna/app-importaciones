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
  "items": [{ "descripcion": "descripción tal cual figura en el documento (puede estar en inglés/chino/etc, no la traduzcas)", "descripcion_es": "traducción corta y clara al español del producto, sin código de producto ni medidas de empaque (ej: 'Guante de cuero AB grade con logo serigrafiado')", "cantidad": número, "precio_unitario": número, "total": número }],
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
  "items": [{ "descripcion": "descripción tal cual figura en el documento (no la traduzcas)", "descripcion_es": "traducción corta y clara al español del producto", "cantidad": número, "cbm": número, "peso_kg": número }]
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
  "items": [{ "descripcion": "descripción tal cual figura en el documento (no la traduzcas)", "descripcion_es": "traducción corta y clara al español del producto", "cantidad": número, "precio_unitario": número, "total": número }],
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

"items" es la lista de TODOS los ítems/posiciones NCM del despacho (puede haber muchos, en varias páginas). Cada ítem tiene una tabla de "Liquidación" o "Conceptos" con varias filas (Porc. / P-G-C / Importe / Concepto) — para cada fila de esa tabla extraé el monto de la columna "DEL ITEM" (Importe) y clasificá A QUÉ CONCEPTO REAL corresponde, usando tu conocimiento de despachos de aduana argentinos y los códigos AFIP habituales:
- (010) DERECHOS IMPORTACION → "Derechos de importación"
- (011)/(061) TASA ESTADISTICA, TASA ESTAD, TASA ESTAD MONT MAX (variante con tope máximo en vez de %) → SIEMPRE "Tasa estadística" (es el mismo tributo, no uno aparte)
- (415) I.V.A., IVA → "IVA"
- IVA ADIC, IVA ADICIONAL → "IVA adicional"
- GANANCIAS, ANTICIPO GANANCIAS → "Anticipo de ganancias"
- DER. ANTIDUMPING, DERECHO ANTI DUMPING, ANTIDUMPING → "Derechos anti-dumping"
- SALVAGUARDIA → "Salvaguardia"
- (500) ARANCEL SIM IMPO, ARANCEL SIM → "Arancel SIM Impo"
- IIBB, INGRESOS BRUTOS → "IIBB"
- Cualquier otro concepto que no reconozcas → copiá el texto tal como figura impreso, sin inventar a qué corresponde.
NO omitas ninguna fila aunque no la reconozcas. NO tenés que sumar nada entre ítems: el código de la aplicación se encarga de sumar los montos ya clasificados. Es más importante que cada fila y cada número individual esté bien clasificado y sea correcto que tratar de calcular un total.

ATENCIÓN — esto es la causa más común de error, y NO es que estén en bloques separados de la página: en la sección "LIQUIDACION", cada CONCEPTO ocupa UNA SOLA LÍNEA/FILA, y en esa misma fila aparecen DOS números, uno a cada lado del nombre del concepto:
  - A LA IZQUIERDA del nombre del concepto, con un "Porc." (porcentaje) al lado: es el monto "DEL ITEM" — SOLO de este ítem puntual. ESTE es el que tenés que usar.
  - A LA DERECHA del nombre del concepto, sin porcentaje, bajo la columna "TOTAL": es el ACUMULADO de todos los ítems del despacho hasta ese punto (va creciendo ítem a ítem; en el último ítem coincide con el total general del despacho). NUNCA uses este número — ni para "items" ni para "valores_generales" — da resultados mucho más altos que la realidad, y si lo confundís con el monto de otro concepto el desglose completo queda mal.

Ejemplo real COMPLETO de la tabla de un ítem tal como aparece en el PDF (todas las filas de "Conceptos" de un mismo ítem, una debajo de la otra):
  "        20,00  P     1.984,39  ( 010 ) DERECHOS IMPORTACION        P        13.422,89"
  "                                ( 011 ) TASA DE ESTADISTICA         P           729,71"
  "                                ( 017 ) DER. ANTI-DUMPING 2         P        13.272,96"
  "  0,00  P       180,00          ( 061 ) TASA ESTAD MONT MAX         P           720,00"
  "        21,00  P     2.538,14  ( 415 ) I.V.A.                      P        18.717,10"
  "                                ( 500 ) ARANCEL SIM IMPO            P            10,00"
  "PAGADO                4.702,53"
Para este ítem en particular, el resultado CORRECTO es:
  { "concepto": "Derechos de importación", "monto": 1984.39 }   ← el número antes del nombre, en SU MISMA fila
  { "concepto": "Tasa estadística", "monto": 180 }              ← viene de la fila "(061) TASA ESTAD MONT MAX", que SÍ tiene número antes del nombre (180,00); la fila "(011) TASA DE ESTADISTICA" de arriba NO tiene ningún número antes del nombre en este ítem, así que no aporta nada
  { "concepto": "IVA", "monto": 2538.14 }                       ← el número antes del nombre, en SU MISMA fila
  (NO se incluye "Derechos anti-dumping": la fila "(017) DER. ANTI-DUMPING 2" no tiene ningún número antes del nombre en este ítem — está vacía, solo tiene el acumulado 13.272,96 después — así que este ítem no paga antidumping y el concepto se omite directamente, NUNCA se le asigna el 13.272,96 ni ningún otro número de una fila vecina)
  (El "(500) ARANCEL SIM IMPO" tampoco tiene número antes del nombre en este ítem — se omite igual)
  Chequeo: 1984.39 + 180 + 2538.14 = 4702.53 = el "PAGADO" de este ítem. Si lo que extrajiste no suma el "PAGADO" de ese ítem, releé las filas: seguramente moviste un número a la fila de al lado.

Reglas generales que se desprenden de este ejemplo, aplicalas a TODAS las filas de TODOS los ítems:
- De cada fila, quedate SOLO con el número que está ANTES del nombre del concepto, en ESA MISMA fila. El número que aparece DESPUÉS del nombre (la columna "TOTAL") se descarta siempre, sin excepción — nunca lo uses ni para este concepto ni para ningún otro.
- Si una fila de concepto NO tiene ningún número antes del nombre (la celda aparece vacía o en blanco), ese concepto NO aportó nada en este ítem: OMITILO de la lista de "conceptos" de este ítem. No le asignes el número de la fila de arriba, de abajo, ni el acumulado de la derecha. La mayoría de los ítems van a tener antidumping, IVA adicional, ganancias, etc. en blanco — eso es lo normal, no un error a corregir inventando un número.
- Cada concepto (010, 011/061, 415, 017, etc.) aparece COMO MÁXIMO UNA VEZ por ítem en la lista "conceptos" de ese ítem.
- Si el ítem tiene una fila "PAGADO" con el total de ESE ítem, usala para verificar: la suma de los montos "DEL ITEM" que extrajiste para ese ítem tiene que coincidir con el "PAGADO" de esa misma fila (no con el "PAGADO"/"CANAL ASIGNADO" que aparece más abajo asociado a "GARANTIZADO"/"A COBRAR", que es el acumulado de todo el despacho).
- Si el despacho tiene una sola página/ítem, el monto "DEL ITEM" y el "TOTAL" pueden coincidir — está bien, usá igual el de la izquierda.

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
        { "concepto": "nombre del concepto YA CLASIFICADO según la lista de arriba (ej: 'Tasa estadística', no 'TASA ESTAD MONT MAX')", "monto": número }
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
    datos.items = depurarConceptosDuplicadosPorItem((datos.items ?? []) as ItemDespachoExtraido[]);
    datos.items_costos = construirItemsCostosDespacho(datos);
  }

  return datos;
}

interface ItemDespachoExtraido {
  item: number;
  ncm: string;
  conceptos: { concepto: string; monto: number }[];
}

// Salvaguarda en código contra el error más común de extracción: el PDF
// muestra, en la misma fila, el monto "DEL ITEM" (a usar) y el "TOTAL"
// acumulado del despacho (a ignorar) a cada lado del nombre del concepto —
// si la IA toma el de la derecha por error, un mismo concepto termina
// apareciendo dos veces dentro del mismo ítem con montos muy distintos. El
// acumulado de TODO el despacho hasta ese ítem nunca puede ser menor que el
// monto de ESE ítem individual, así que ante un concepto repetido nos
// quedamos con el menor de los dos (el correcto) y descartamos el mayor.
function depurarConceptosDuplicadosPorItem(items: ItemDespachoExtraido[]): ItemDespachoExtraido[] {
  return items.map((item) => {
    const porConcepto = new Map<string, { concepto: string; monto: number }>();
    for (const c of item.conceptos ?? []) {
      const clave = normalizarConceptoDespacho(c.concepto ?? "");
      const existente = porConcepto.get(clave);
      if (!existente || c.monto < existente.monto) {
        porConcepto.set(clave, { concepto: c.concepto, monto: c.monto });
      }
    }
    return { ...item, conceptos: Array.from(porConcepto.values()) };
  });
}

// Normaliza el nombre tal como lo escribe el despacho (con códigos, puntos,
// abreviaturas, etc.) a un nombre canónico, para poder agrupar y sumar entre
// ítems aunque la IA copie el texto con variaciones menores. Si no reconoce
// el concepto, lo deja tal cual — aparece como "costo nuevo" en Sección 3.
export function normalizarConceptoDespacho(raw: string): string {
  const compacto = raw
    .toLowerCase()
    .replace(/[^a-zà-ÿ]/g, ""); // solo letras (con tildes), sin espacios/puntos/números/códigos

  if (compacto.includes("antidump")) return "Derechos anti-dumping";
  if (compacto.includes("salvaguardia")) return "Salvaguardia";
  // "TASA ESTAD MONT MAX" no es un tributo aparte: es la misma tasa
  // estadística, calculada por el tope máximo en vez del % normal en los
  // ítems donde corresponde. Van al mismo total, no a uno separado.
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
export function construirItemsCostosDespacho(datos: Record<string, unknown>): { concepto: string; monto: number }[] {
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

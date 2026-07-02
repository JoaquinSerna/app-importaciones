// Clasificación arancelaria automática (NCM) de un SKU a partir de su
// descripción, usando el Arancel Integrado de AFIP embebido (lib/nomenclador.ts)
// y Claude Sonnet como asistente de clasificación (necesita razonamiento para
// elegir subpartidas específicas vs. genéricas — no se usa Haiku acá).
//
// El DIE que se persiste SIEMPRE sale de lib/nomenclador.ts (campos[4] del
// archivo de AFIP), nunca del texto que devuelve Claude: el modelo solo elige
// CUÁL posición de una lista de candidatas es la correcta, no inventa tasas.

import Anthropic from "@anthropic-ai/sdk";

import { buscarPorNcm8, filtrarPorCapitulos, rankearPorDescripcion, type PosicionNcm } from "@/lib/nomenclador";

const MODELO_CLASIFICADOR = "claude-sonnet-4-5";
const REINTENTOS_OVERLOADED = 3;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function crearMensajeConRetry(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  for (let intento = 1; intento <= REINTENTOS_OVERLOADED; intento++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      const esUltimoIntento = intento === REINTENTOS_OVERLOADED;
      if (status !== 529 || esUltimoIntento) throw err;

      const esperaMs = 1000 * 2 ** (intento - 1); // 1s, 2s, 4s
      console.warn(`[ncm-clasificador] 529 overloaded, reintento ${intento}/${REINTENTOS_OVERLOADED} en ${esperaMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------
// Paso 1: identificar capítulos (2 dígitos) probables para la descripción
// ---------------------------------------------------------------------

const TOOL_CAPITULOS = "identificar_capitulos";

async function identificarCapitulos(descripcionSku: string): Promise<string[]> {
  const response = await crearMensajeConRetry({
    model: MODELO_CLASIFICADOR,
    max_tokens: 512,
    tools: [
      {
        name: TOOL_CAPITULOS,
        description: "Devuelve los capítulos del Arancel de Aduanas (Sistema Armonizado / NCM) donde más probablemente se clasifica el producto.",
        input_schema: {
          type: "object",
          properties: {
            capitulos: {
              type: "array",
              description: "1 a 3 capítulos candidatos, como strings de 2 dígitos (ej. \"42\", \"84\").",
              items: { type: "string", pattern: "^[0-9]{2}$" },
              minItems: 1,
              maxItems: 3,
            },
          },
          required: ["capitulos"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_CAPITULOS },
    messages: [
      {
        role: "user",
        content: `Sos un despachante de aduana argentino experto en el Nomenclador Común del Mercosur (NCM / Sistema Armonizado).

Producto a clasificar: "${descripcionSku}"

Indicá los 1 a 3 capítulos (2 dígitos, 01 a 97) del arancel donde más probablemente se clasifica este producto. Si dudás entre materiales (ej. un producto textil que también podría ser de plástico), incluí ambos capítulos candidatos.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_CAPITULOS
  );
  const capitulos = (toolUse?.input as { capitulos?: string[] } | undefined)?.capitulos ?? [];
  return capitulos.filter((c) => /^\d{2}$/.test(c));
}

// ---------------------------------------------------------------------
// Paso 2: elegir la posición NCM correcta dentro de las candidatas del/los
// capítulo(s) identificados
// ---------------------------------------------------------------------

export interface OpcionNcm {
  ncm: string;
  descripcion_oficial: string;
  die_pct: number;
  diferencia: string;
}

export interface ClasificacionNcm {
  ncm_propuesto: string | null; // NCM de 8 dígitos con puntos, ej "4203.29.00"
  descripcion_oficial: string | null;
  die_pct: number | null;
  confianza: "alta" | "media" | "baja";
  estado: "definido" | "ambiguo" | "no_encontrado";
  opciones_alternativas: OpcionNcm[];
  razonamiento: string;
}

const TOOL_CLASIFICACION = "proponer_clasificacion_ncm";

const REGLAS_CLASIFICACION = `REGLAS DE CLASIFICACIÓN:
- Elegí SIEMPRE la subpartida más específica que aplique. "Los demás" / "Las demás" solo cuando no exista una subpartida más precisa para ese producto dentro del mismo nivel.
- Si hay 2 o 3 candidatas razonables (ambigüedad real, no podés decidir con la descripción disponible), marcá estado="ambiguo" y devolvé todas las opciones válidas con su diferencia explicada — el usuario elige. No inventes una sola respuesta si realmente es ambiguo.
- Si la descripción menciona "electric", "motorized", "eléctrico", "magnético" o equivalentes, priorizá subpartidas que lo nombren explícitamente antes de caer en "Los demás".
- Para telas o indumentaria sin % de composición declarado: ropa de trabajo/industrial → asumí sintético/poliéster; indumentaria informal/casual → asumí algodón. Dejalo aclarado en el razonamiento.
- Solo podés proponer un NCM que esté LITERALMENTE en la lista de candidatas de abajo (con su texto exacto). No inventes ni modifiques códigos NCM ni porcentajes de DIE: son datos oficiales ya provistos, vos solo elegís cuál aplica.
- Si ninguna candidata de la lista es razonable para este producto, marcá estado="no_encontrado" y explicá por qué en el razonamiento — no fuerces una respuesta.`;

function formatearCandidatas(posiciones: PosicionNcm[]): string {
  return posiciones
    .map((p, i) => `${i + 1}. NCM ${p.ncm8Dotted} — DIE ${p.diePct}% — ${p.descripcion}`)
    .join("\n");
}

/** Clasifica un único SKU: identifica capítulos candidatos, filtra el nomenclador y le pide a Claude que elija la posición correcta. */
export async function clasificarDescripcionNcm(descripcionSku: string): Promise<ClasificacionNcm> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no está configurada. Configurá la variable de entorno para poder clasificar NCMs automáticamente.");
  }

  const capitulos = await identificarCapitulos(descripcionSku);
  if (capitulos.length === 0) {
    return {
      ncm_propuesto: null,
      descripcion_oficial: null,
      die_pct: null,
      confianza: "baja",
      estado: "no_encontrado",
      opciones_alternativas: [],
      razonamiento: "No se pudo identificar un capítulo arancelario probable a partir de la descripción.",
    };
  }

  const candidatasCapitulo = filtrarPorCapitulos(capitulos);
  const candidatas = rankearPorDescripcion(candidatasCapitulo, descripcionSku, 200);

  if (candidatas.length === 0) {
    return {
      ncm_propuesto: null,
      descripcion_oficial: null,
      die_pct: null,
      confianza: "baja",
      estado: "no_encontrado",
      opciones_alternativas: [],
      razonamiento: `No se encontraron posiciones NCM en el capítulo ${capitulos.join("/")} del nomenclador embebido.`,
    };
  }

  const response = await crearMensajeConRetry({
    model: MODELO_CLASIFICADOR,
    max_tokens: 2048,
    tools: [
      {
        name: TOOL_CLASIFICACION,
        description: "Registra la propuesta de clasificación NCM para el producto.",
        input_schema: {
          type: "object",
          properties: {
            estado: { type: "string", enum: ["definido", "ambiguo", "no_encontrado"] },
            ncm_propuesto: {
              type: ["string", "null"],
              description: "El NCM elegido (texto exacto \"NCM x.xx.xx\" de la lista de candidatas), o null si estado=no_encontrado.",
            },
            confianza: { type: "string", enum: ["alta", "media", "baja"] },
            razonamiento: { type: "string", description: "Explicación breve de la elección (o de por qué es ambiguo / no encontrado)." },
            opciones_alternativas: {
              type: "array",
              description: "Solo si estado=\"ambiguo\": las 2-3 opciones candidatas (incluyendo la elegida como ncm_propuesto), cada una con su NCM tal cual aparece en la lista y por qué difiere de las demás.",
              items: {
                type: "object",
                properties: {
                  ncm: { type: "string", description: "NCM tal cual aparece en la lista de candidatas, ej \"4203.29.00\"." },
                  diferencia: { type: "string", description: "Por qué esta opción difiere de las otras candidatas." },
                },
                required: ["ncm", "diferencia"],
              },
            },
          },
          required: ["estado", "ncm_propuesto", "confianza", "razonamiento", "opciones_alternativas"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_CLASIFICACION },
    system: `Sos un despachante de aduana argentino experto en clasificación arancelaria (NCM / Sistema Armonizado).\n\n${REGLAS_CLASIFICACION}`,
    messages: [
      {
        role: "user",
        content: `Producto a clasificar: "${descripcionSku}"

Candidatas del Arancel Integrado de AFIP (capítulo${capitulos.length > 1 ? "s" : ""} ${capitulos.join(", ")}):
${formatearCandidatas(candidatas)}

Usá la herramienta "${TOOL_CLASIFICACION}" para responder.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_CLASIFICACION
  );

  if (!toolUse) {
    return {
      ncm_propuesto: null,
      descripcion_oficial: null,
      die_pct: null,
      confianza: "baja",
      estado: "no_encontrado",
      opciones_alternativas: [],
      razonamiento: "Claude no devolvió una clasificación estructurada para este producto.",
    };
  }

  const input = toolUse.input as {
    estado: "definido" | "ambiguo" | "no_encontrado";
    ncm_propuesto: string | null;
    confianza: "alta" | "media" | "baja";
    razonamiento: string;
    opciones_alternativas: { ncm: string; diferencia: string }[];
  };

  // Resolvemos SIEMPRE contra nuestros datos parseados del nomenclador — el
  // DIE y la descripción oficial nunca salen del texto libre de Claude.
  const resolver = (ncmTexto: string | null | undefined): PosicionNcm | null => {
    if (!ncmTexto) return null;
    const match = ncmTexto.match(/\d[\d.]*\d/);
    return match ? buscarPorNcm8(match[0]) : null;
  };

  if (input.estado === "no_encontrado" || !input.ncm_propuesto) {
    return {
      ncm_propuesto: null,
      descripcion_oficial: null,
      die_pct: null,
      confianza: input.confianza ?? "baja",
      estado: "no_encontrado",
      opciones_alternativas: [],
      razonamiento: input.razonamiento,
    };
  }

  const principal = resolver(input.ncm_propuesto);
  if (!principal) {
    return {
      ncm_propuesto: null,
      descripcion_oficial: null,
      die_pct: null,
      confianza: "baja",
      estado: "no_encontrado",
      opciones_alternativas: [],
      razonamiento: `Claude propuso "${input.ncm_propuesto}" pero no se encontró exactamente en el nomenclador. Requiere carga manual.`,
    };
  }

  const opciones_alternativas: OpcionNcm[] = (input.estado === "ambiguo" ? input.opciones_alternativas ?? [] : [])
    .map((op) => {
      const pos = resolver(op.ncm);
      if (!pos) return null;
      return {
        ncm: pos.ncm8Dotted,
        descripcion_oficial: pos.descripcion,
        die_pct: pos.diePct,
        diferencia: op.diferencia,
      };
    })
    .filter((op): op is OpcionNcm => op !== null && op.ncm !== principal.ncm8Dotted);

  return {
    ncm_propuesto: principal.ncm8Dotted,
    descripcion_oficial: principal.descripcion,
    die_pct: principal.diePct,
    confianza: input.confianza ?? "media",
    estado: input.estado === "ambiguo" && opciones_alternativas.length > 0 ? "ambiguo" : "definido",
    opciones_alternativas,
    razonamiento: input.razonamiento,
  };
}

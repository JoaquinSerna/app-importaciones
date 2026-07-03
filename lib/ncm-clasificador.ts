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

const REGLA_FUNCION_VS_MATERIAL = `REGLA CLAVE (Regla General Interpretativa 1 del Sistema Armonizado): un artículo manufacturado y terminado se clasifica según QUÉ ES y PARA QUÉ SIRVE (su función/uso final), no según los materiales que se mencionan en su descripción de pasada. Los capítulos de materias primas (ej. 39 = plásticos en formas primarias, 40 = caucho en formas primarias, 72-81 = metales en formas primarias/semielaborados) son SOLO para eso: materia prima sin transformar en un artículo de uso final. Si la descripción nombra un objeto de uso final reconocible (deportivo, mueble, herramienta, juguete, envase, indumentaria, etc.) que simplemente está hecho o recubierto de determinado material, el capítulo correcto es el del USO FINAL del artículo, nunca el del material.
Ejemplos:
- "PVC Coating Kettle Bell" / "pesa rusa con recubrimiento de PVC" → es un artículo de gimnasia/cultura física → Capítulo 95 (artículos para deportes), NO Capítulo 39 (el PVC es solo el recubrimiento, no lo que el artículo ES).
- "Silla de plástico" → Capítulo 94 (muebles), no Capítulo 39.
- "Juguete de goma" → Capítulo 95 (juguetes), no Capítulo 40.
- "Balde plástico" → Capítulo 39 SÍ aplica acá, porque un balde/envase genérico de plástico sin otro uso específico es justamente un artículo de plástico (no hay otro capítulo de "uso final" más específico que lo reclame).`;

async function identificarCapitulos(descripcionSku: string, capitulosDescartados: string[] = []): Promise<string[]> {
  const exclusion = capitulosDescartados.length > 0
    ? `\n\nYa se probó con el/los capítulo${capitulosDescartados.length > 1 ? "s" : ""} ${capitulosDescartados.join(", ")} y no había ninguna posición razonable ahí — significa que esos capítulos están mal, probablemente porque te dejaste guiar por un material mencionado de pasada en vez de la función del artículo. Proponé capítulos DISTINTOS a esos.`
    : "";

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
    system: `Sos un despachante de aduana argentino experto en el Nomenclador Común del Mercosur (NCM / Sistema Armonizado).\n\n${REGLA_FUNCION_VS_MATERIAL}`,
    messages: [
      {
        role: "user",
        content: `Producto a clasificar: "${descripcionSku}"

Indicá los 1 a 3 capítulos (2 dígitos, 01 a 97) del arancel donde más probablemente se clasifica este producto, aplicando la regla de función vs. material. Si dudás entre dos capítulos igual de razonables, incluí ambos.${exclusion}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_CAPITULOS
  );
  const capitulos = (toolUse?.input as { capitulos?: string[] } | undefined)?.capitulos ?? [];
  return capitulos.filter((c) => /^\d{2}$/.test(c) && !capitulosDescartados.includes(c));
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
- Si TODAS las candidatas de la lista son posiciones de materia prima/formas primarias (resinas, polímeros, chapas, perfiles, etc. sin transformar) y el producto descripto es claramente un artículo manufacturado de uso final (deportivo, mueble, herramienta, juguete, etc. — ver REGLA_FUNCION_VS_MATERIAL), NINGUNA candidata es correcta aunque el material coincida: marcá estado="no_encontrado" y explicá en el razonamiento que se buscó en el capítulo de material equivocado, no en el capítulo de uso final. No fuerces la respuesta menos mala de la lista.
- Si ninguna candidata de la lista es razonable para este producto por cualquier otro motivo, también marcá estado="no_encontrado" y explicá por qué — no fuerces una respuesta.`;

function formatearCandidatas(posiciones: PosicionNcm[]): string {
  return posiciones
    .map((p, i) => `${i + 1}. NCM ${p.ncm8Dotted} — DIE ${p.diePct}% — ${p.descripcion}`)
    .join("\n");
}

function sinResultado(razonamiento: string): ClasificacionNcm {
  return {
    ncm_propuesto: null,
    descripcion_oficial: null,
    die_pct: null,
    confianza: "baja",
    estado: "no_encontrado",
    opciones_alternativas: [],
    razonamiento,
  };
}

/** Segundo paso: dado un capítulo ya identificado y sus candidatas, le pide a Claude que elija la posición correcta (o decline si ninguna sirve). */
async function elegirNcmEntreCandidatas(
  descripcionSku: string,
  capitulos: string[],
  candidatas: PosicionNcm[]
): Promise<ClasificacionNcm> {
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
    system: `Sos un despachante de aduana argentino experto en clasificación arancelaria (NCM / Sistema Armonizado).\n\n${REGLA_FUNCION_VS_MATERIAL}\n\n${REGLAS_CLASIFICACION}`,
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
    return sinResultado("Claude no devolvió una clasificación estructurada para este producto.");
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
    return { ...sinResultado(input.razonamiento), confianza: input.confianza ?? "baja" };
  }

  const principal = resolver(input.ncm_propuesto);
  if (!principal) {
    return sinResultado(`Claude propuso "${input.ncm_propuesto}" pero no se encontró exactamente en el nomenclador. Requiere carga manual.`);
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

const MAX_INTENTOS_CAPITULO = 2;

/**
 * Clasifica un único SKU: identifica capítulos candidatos, filtra el
 * nomenclador y le pide a Claude que elija la posición correcta. Si el
 * primer capítulo elegido resulta un callejón sin salida (sin candidatas, o
 * Claude decide que ninguna candidata aplica de verdad — típicamente porque
 * se confundió un material mencionado de pasada con la función del
 * artículo), reintenta una vez más pidiendo capítulos distintos a los ya
 * descartados antes de rendirse.
 */
export async function clasificarDescripcionNcm(descripcionSku: string): Promise<ClasificacionNcm> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no está configurada. Configurá la variable de entorno para poder clasificar NCMs automáticamente.");
  }

  const capitulosDescartados: string[] = [];
  let ultimoResultado = sinResultado("No se pudo clasificar este producto.");

  for (let intento = 1; intento <= MAX_INTENTOS_CAPITULO; intento++) {
    const capitulos = await identificarCapitulos(descripcionSku, capitulosDescartados);
    if (capitulos.length === 0) {
      ultimoResultado = sinResultado(
        capitulosDescartados.length > 0
          ? `No se pudo identificar un capítulo alternativo distinto de ${capitulosDescartados.join(", ")}.`
          : "No se pudo identificar un capítulo arancelario probable a partir de la descripción."
      );
      break;
    }

    const candidatasCapitulo = filtrarPorCapitulos(capitulos);
    const candidatas = rankearPorDescripcion(candidatasCapitulo, descripcionSku, 200);

    if (candidatas.length === 0) {
      ultimoResultado = sinResultado(`No se encontraron posiciones NCM en el capítulo ${capitulos.join("/")} del nomenclador embebido.`);
      capitulosDescartados.push(...capitulos);
      continue;
    }

    const resultado = await elegirNcmEntreCandidatas(descripcionSku, capitulos, candidatas);
    ultimoResultado = resultado;

    if (resultado.estado !== "no_encontrado") {
      return resultado;
    }

    // Claude decidió que ninguna candidata de este/estos capítulo(s) aplica
    // de verdad — probablemente el capítulo elegido en el paso 1 fue el
    // equivocado (material vs. función). Reintentamos con otros capítulos.
    capitulosDescartados.push(...capitulos);
  }

  return ultimoResultado;
}

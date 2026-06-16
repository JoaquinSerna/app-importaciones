// Matching ingenuo (por palabras clave/substring) entre costos estimados de
// una carpeta y los conceptos extraídos de un PDF de liquidación de
// despachante. No es sofisticado a propósito: alcanza con detectar
// coincidencias razonables y marcar el resto para revisión manual.

import type { ConceptoLiquidacion, Costo } from "@/lib/types";

export interface MatchLiquidacion {
  costo: Costo;
  concepto: ConceptoLiquidacion | null;
  /** true si hubo coincidencia automática; false => requiere revisión manual */
  matcheado: boolean;
}

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "del",
  "y",
  "a",
  "en",
  "por",
  "para",
  "con",
  "al",
]);

function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((palabra) => palabra.length > 2 && !STOPWORDS.has(palabra));
}

/** Similitud simple: proporción de palabras en común sobre el total de palabras únicas. */
function similitud(a: string, b: string): number {
  const palabrasA = new Set(normalizar(a));
  const palabrasB = new Set(normalizar(b));

  if (palabrasA.size === 0 || palabrasB.size === 0) return 0;

  let interseccion = 0;
  palabrasA.forEach((palabra) => {
    if (palabrasB.has(palabra)) interseccion += 1;
  });

  const unionSet = new Set<string>();
  palabrasA.forEach((p) => unionSet.add(p));
  palabrasB.forEach((p) => unionSet.add(p));

  return unionSet.size === 0 ? 0 : interseccion / unionSet.size;
}

const UMBRAL_MATCH = 0.2;

/**
 * Empareja cada costo estimado de la carpeta con el concepto extraído del
 * PDF que tenga mayor similitud de texto, siempre que supere el umbral
 * mínimo. Cada concepto del PDF se usa como máximo una vez.
 */
export function matchearCostosConLiquidacion(
  costos: Costo[],
  conceptos: ConceptoLiquidacion[]
): MatchLiquidacion[] {
  const disponibles = [...conceptos];
  const resultado: MatchLiquidacion[] = [];

  for (const costo of costos) {
    let mejorIndice = -1;
    let mejorScore = 0;

    disponibles.forEach((concepto, idx) => {
      const score = similitud(costo.concepto, concepto.concepto);
      if (score > mejorScore) {
        mejorScore = score;
        mejorIndice = idx;
      }
    });

    if (mejorIndice >= 0 && mejorScore >= UMBRAL_MATCH) {
      const [concepto] = disponibles.splice(mejorIndice, 1);
      resultado.push({ costo, concepto, matcheado: true });
    } else {
      resultado.push({ costo, concepto: null, matcheado: false });
    }
  }

  return resultado;
}

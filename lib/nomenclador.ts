// Lectura y búsqueda sobre el Arancel Integrado de AFIP (nomenclador NCM),
// embebido comprimido en public/reference/nomenclador_30062026.txt.gz.
//
// Formato de cada línea de datos (separado por "@"):
//   2@<NCM>@<F1:DerImp>@<F2:ReintExtra>@<F3:DIE>@<F4:ReintIntra>@<F5:DIIntra>@<F6:DerEspMin>@<U1>@<U2>@<Descripción>
//
// El campo que usamos como Derecho de Importación Efectivo es F3, que es
// campos[4] al hacer split por "@" (campos[3] es el Reintegro Extrazona, NO
// es el DIE — es un error común confundirlos).
//
// El archivo trae muchas líneas por cada posición NCM de 8 dígitos (una por
// cada sufijo SIM/dígito verificador local), todas con el mismo DIE. Para no
// inflar los prompts de clasificación, este módulo devuelve posiciones
// deduplicadas por los 8 dígitos reales de NCM (que es lo que usa el resto
// de la app, ver lib/ncm-match.ts: normalizarNcm8).

import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export interface PosicionNcm {
  /** 8 dígitos sin puntos, ej "42032900". Es el codigo_ncm real usado en toda la app. */
  ncm8: string;
  /** 8 dígitos con puntos, ej "4203.29.00". */
  ncm8Dotted: string;
  /** Código completo tal cual figura en el nomenclador, con sufijo SIM y dígito verificador. */
  ncmCompleto: string;
  /** F3 del nomenclador (campos[4]): Derecho de Importación Efectivo, en %. */
  diePct: number;
  descripcion: string;
}

const NOMENCLADOR_PATH = path.join(process.cwd(), "public", "reference", "nomenclador_30062026.txt.gz");

let cachePorNcm8: Map<string, PosicionNcm> | null = null;

function parseNumero(campo: string | undefined): number {
  const n = parseFloat((campo ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseLinea(linea: string): PosicionNcm | null {
  if (!linea.startsWith("2@")) return null;
  const campos = linea.split("@");
  if (campos.length < 11) return null;

  const ncmRaw = campos[1]?.trim() ?? "";
  const ncm8 = ncmRaw.replace(/[^0-9]/g, "").slice(0, 8);
  if (ncm8.length !== 8) return null;

  const descripcion = campos[10]?.trim() ?? "";
  if (!descripcion) return null;

  return {
    ncm8,
    ncm8Dotted: `${ncm8.slice(0, 4)}.${ncm8.slice(4, 6)}.${ncm8.slice(6, 8)}`,
    ncmCompleto: ncmRaw,
    diePct: parseNumero(campos[4]),
    descripcion,
  };
}

/**
 * Parsea y cachea el nomenclador completo en memoria, deduplicado por NCM de
 * 8 dígitos (se queda con la descripción más larga/específica de cada uno,
 * ya que las variantes de sufijo suelen repetir o acortar el texto).
 */
function cargarNomenclador(): Map<string, PosicionNcm> {
  if (cachePorNcm8) return cachePorNcm8;

  const comprimido = readFileSync(NOMENCLADOR_PATH);
  const texto = gunzipSync(comprimido).toString("latin1");

  // Para un mismo NCM de 8 dígitos suele haber varias líneas: una de
  // encabezado (sin datos, ej. "--Los demás", con los campos de tributo en
  // blanco) y una o más líneas hoja con sufijo SIM (ej. "4203.29.00.100V" =
  // "Cortados en forma", "4203.29.00.900N" = "Los demás"). En el arancel, la
  // variante catch-all "Los/Las demás" siempre se lista al final del grupo —
  // por eso nos quedamos con la ÚLTIMA línea de cada NCM8 (no con la de
  // descripción más larga, que terminaba eligiendo variantes específicas en
  // vez del catch-all).
  const mapa = new Map<string, PosicionNcm>();
  for (const linea of texto.split("\n")) {
    const pos = parseLinea(linea);
    if (!pos) continue;
    mapa.set(pos.ncm8, pos);
  }

  cachePorNcm8 = mapa;
  return mapa;
}

/** Todas las posiciones NCM (deduplicadas) cuyo NCM8 empieza con alguno de los capítulos dados (2 dígitos, ej "42", "84"). */
export function filtrarPorCapitulos(capitulos: string[]): PosicionNcm[] {
  const mapa = cargarNomenclador();
  const prefijos = capitulos.map((c) => c.trim().padStart(2, "0")).filter((c) => /^\d{2}$/.test(c));
  if (prefijos.length === 0) return [];

  const resultado: PosicionNcm[] = [];
  Array.from(mapa.values()).forEach((pos) => {
    if (prefijos.some((p) => pos.ncm8.startsWith(p))) resultado.push(pos);
  });
  return resultado;
}

/** Busca una posición NCM exacta por sus 8 dígitos (con o sin puntos/sufijos). */
export function buscarPorNcm8(ncm: string): PosicionNcm | null {
  const ncm8 = ncm.replace(/[^0-9]/g, "").slice(0, 8);
  return cargarNomenclador().get(ncm8) ?? null;
}

const STOPWORDS_NOMENCLADOR = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "del",
  "y",
  "o",
  "a",
  "en",
  "por",
  "para",
  "con",
  "al",
  "un",
  "una",
  "sin",
  "demas",
]);

function palabrasClave(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 2 && !STOPWORDS_NOMENCLADOR.has(p))
  );
}

/**
 * De un set de posiciones candidatas (típicamente ya filtradas por capítulo),
 * devuelve las `limite` más relevantes según superposición de palabras clave
 * con la descripción del producto. Existe para acotar el tamaño del prompt
 * en capítulos muy grandes (ej. 84/85, con miles de posiciones).
 */
export function rankearPorDescripcion(
  posiciones: PosicionNcm[],
  descripcionProducto: string,
  limite = 200
): PosicionNcm[] {
  if (posiciones.length <= limite) return posiciones;

  const palabrasProducto = palabrasClave(descripcionProducto);
  if (palabrasProducto.size === 0) return posiciones.slice(0, limite);

  const conScore = posiciones.map((pos) => {
    const palabrasPos = palabrasClave(pos.descripcion);
    let interseccion = 0;
    palabrasPos.forEach((p) => {
      if (palabrasProducto.has(p)) interseccion += 1;
    });
    return { pos, score: interseccion };
  });

  conScore.sort((a, b) => b.score - a.score);
  return conScore.slice(0, limite).map((c) => c.pos);
}

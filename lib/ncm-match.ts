// Compara NCM ignorando puntos/espacios/letras de sufijo — el despacho a
// veces los escribe distinto que como están guardados en NCMs (ej:
// "8426.11.00.900N" vs "84261100"). Se matchea por los primeros 8 dígitos,
// que identifican la posición arancelaria real (el resto son sufijos locales
// de SIM/estadística que no hacen falta para encontrar el SKU correcto).
export function normalizarNcm8(ncm: string): string {
  return ncm.replace(/[^0-9]/g, "").slice(0, 8);
}

// Agrupa nombres de concepto en familias de tributo, para poder comparar un
// concepto guardado en `costos` (a veces con texto libre, ej. "Derechos de
// Importación 20%") contra el nombre canónico que devuelve
// normalizarConceptoDespacho() en `costos_sku` (ej. "Derechos de importación").
// Devuelve null si el concepto no es un tributo conocido (ej. flete, honorarios).
export function familiaTributo(concepto: string): string | null {
  const c = concepto.toLowerCase();
  if (/anti[\s-]*dumping/.test(c)) return "antidumping";
  if (/salvaguardia/.test(c)) return "salvaguardia";
  if (/tasa estad/.test(c)) return "tasa_estadistica";
  if (/iva adic/.test(c)) return "iva_adicional";
  if (/\biva\b/.test(c)) return "iva";
  if (/ganancia/.test(c)) return "ganancias";
  if (/iibb|ingresos brutos/.test(c)) return "iibb";
  if (/derecho/.test(c)) return "derechos";
  return null;
}

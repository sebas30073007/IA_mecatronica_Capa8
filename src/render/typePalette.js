// src/render/typePalette.js
//
// Espectro de tipo de nodo — fuente única de verdad.
//
// Los colores NO se declaran aquí: viven en los tokens `--type-*` de
// :root en style.css, y este módulo los lee con getComputedStyle. Así
// el CSS (halos, chips, bordes) y el JS (SVG de los iconos) no pueden
// desincronizarse, que era el problema de tener tres mapas de colores
// repartidos entre renderer.js y main.js.
//
// El tema claro redefine los mismos tokens con variantes oscurecidas,
// así que un cambio de tema solo requiere invalidar la caché.
//
// Regla de marca: este espectro es CODIFICACIÓN DE DATOS, no color de
// interfaz. Solo puede aparecer donde hay un dispositivo de ese tipo.
// Nunca como fondo de nav, card o sección, y nunca en el botón
// primario — ese le pertenece al acento del proyecto (Copper).

/** Tipos de nodo del esquema v3, en orden de espectro (matiz ascendente). */
export const TYPE_ORDER = [
  "ap", "ur3", "server", "switch", "cloud",
  "router", "pc", "plc", "agv", "firewall",
];

/** Etiqueta legible por tipo, para leyendas y chips. */
export const TYPE_LABEL = {
  router: "Router",
  switch: "Switch",
  pc: "PC",
  firewall: "Firewall",
  server: "Servidor",
  cloud: "Nube",
  ap: "Access Point",
  plc: "PLC",
  ur3: "UR3",
  agv: "AGV",
};

const FALLBACK = "#a78bfa"; // --type-pc en dark, por si el CSS no cargó aún

let _cache = null;
let _cacheTheme = null;

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function buildCache() {
  const styles = getComputedStyle(document.documentElement);
  const map = {};
  for (const type of TYPE_ORDER) {
    map[type] = styles.getPropertyValue(`--type-${type}`).trim() || FALLBACK;
  }
  _cache = map;
  _cacheTheme = currentTheme();
  return map;
}

/**
 * Color del espectro para un tipo de nodo, según el tema activo.
 * @param {string} type - tipo del esquema v3
 * @returns {string} color CSS resuelto
 */
export function getTypeColor(type) {
  if (!_cache || _cacheTheme !== currentTheme()) buildCache();
  return _cache[type] ?? _cache.pc ?? FALLBACK;
}

/** Mapa completo tipo → color, resuelto para el tema activo. */
export function getTypePalette() {
  if (!_cache || _cacheTheme !== currentTheme()) buildCache();
  return { ..._cache };
}

/**
 * Fuerza la relectura de los tokens. El cambio de tema ya se detecta
 * solo; esto es para cuando los tokens se modifican en caliente.
 */
export function invalidateTypePalette() {
  _cache = null;
  _cacheTheme = null;
}

const _paletteForTheme = {};

/**
 * Paleta de un tema concreto, sin importar cuál esté activo.
 *
 * Lo necesita la exportación a SVG/PNG, que recibe `darkMode` como
 * parámetro explícito y puede no coincidir con el tema en pantalla.
 * Resuelve los tokens con un elemento sonda para no tener que repetir
 * los hex — los selectores de tema son de atributo, así que aplican a
 * cualquier elemento, no solo a :root.
 *
 * @param {"light"|"dark"} theme
 * @returns {Record<string,string>} mapa tipo → color
 */
export function getTypePaletteFor(theme) {
  const key = theme === "light" ? "light" : "dark";
  if (_paletteForTheme[key]) return { ..._paletteForTheme[key] };

  const probe = document.createElement("div");
  if (key === "light") probe.dataset.theme = "light";
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);

  const styles = getComputedStyle(probe);
  const map = {};
  for (const type of TYPE_ORDER) {
    map[type] = styles.getPropertyValue(`--type-${type}`).trim() || FALLBACK;
  }
  probe.remove();

  _paletteForTheme[key] = map;
  return { ...map };
}

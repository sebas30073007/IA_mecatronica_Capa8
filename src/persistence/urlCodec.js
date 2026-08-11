// src/persistence/urlCodec.js
// "Truco Falstad": serializar estado en URL sin recargar.

const PARAM = "g";

function toBase64UTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64UTF8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportGraphToURL(graph) {
  const json = JSON.stringify(graph);
  const encoded = toBase64UTF8(json);

  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, encoded);

  window.history.pushState({ [PARAM]: encoded }, "", url.toString());
  return url.toString();
}

/**
 * Quita el grafo de la URL sin recargar.
 *
 * Hace falta al vaciar el lienzo: si el `?g=` se queda, al recargar se
 * restaura un grafo vacío con el toast "Cargado desde URL" en vez de
 * entrar en la pantalla de inicio.
 */
export function clearGraphFromURL() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, "", url.toString());
}

export function importGraphFromURL() {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get(PARAM);
  if (!encoded) return null;

  const json = fromBase64UTF8(encoded);
  return JSON.parse(json);
}

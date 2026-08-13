// src/render/renderer.js
import { getNodeBox } from "./hitTest.js";
import { FANOUT_THRESHOLD } from "../app/layout/index.js";
import { getTypeColor } from "./typePalette.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Construye el conjunto de IDs de switches con fan-out alto (Regla 9).
// Solo decide la OPACIDAD de la línea; las etiquetas ya no dependen de esto
// —ver `planLinkLabels`— porque el ruido no lo causa el tipo de dispositivo
// sino que tres etiquetas caigan una encima de otra.
function buildHighFanoutSet(graph) {
  const result = new Set();
  for (const n of graph.nodes) {
    if (n.type !== "switch") continue;
    const pcNeighbors = graph.links.filter(l => {
      const nbId = l.source === n.id ? l.target : l.target === n.id ? l.source : null;
      if (!nbId) return false;
      return graph.nodes.find(x => x.id === nbId)?.type === "pc";
    }).length;
    if (pcNeighbors >= FANOUT_THRESHOLD) result.add(n.id);
  }
  return result;
}

// ── Etiquetas de enlace ────────────────────────────────────────────────────
//
// La regla anterior era de tipo: "switch con 4+ PC → sin etiqueta". Fallaba
// en los dos sentidos. Tres PC colgando de un switch generan tres etiquetas
// casi superpuestas y la regla no se activaba (hacían falta cuatro); y un
// enlace suelto entre dos switches perdía su etiqueta solo por estar al lado
// de un abanico. Lo que estorba no es el tipo de nodo: es la proximidad.
//
// Ahora se decide por geometría, en tres reglas:
//   1. Un enlace importante —seleccionado, señalado, caído o en el camino de
//      un ping— conserva siempre su etiqueta.
//   2. Si tres o más etiquetas caen muy juntas, se apagan todas. Dejar una de
//      tres hermanas encendida confunde más que apagarlas.
//   3. Del resto, se van colocando por prioridad y se apaga la que se solape
//      con otra ya colocada.
//
// Apagada no es lo mismo que ausente: la etiqueta se dibuja transparente y
// reaparece al pasar el cursor por su enlace.

const LABEL_H       = 16;
const CROWD_RADIUS  = 95;  // "muy próximas", en px mundo
const CROWD_MIN     = 3;   // a partir de tres, se apagan todas
const PARALLEL_STEP = 9;   // separación entre enlaces del mismo par

// ── Dónde empieza y acaba una línea ────────────────────────────────────────
//
// El disco del icono NO está centrado en la caja del nodo: encima lleva la
// etiqueta y debajo la IP y los indicadores, así que los 48px del disco
// quedan unos 5px por encima del centro de la caja (ver el desglose de
// alturas en layout/geometry.js).
//
// Retraer la línea 26px desde el centro de la CAJA daba, en un enlace
// vertical, 7px de aire por debajo del disco y −3px por arriba: el mismo
// enlace sin tocar el icono en un extremo y metiéndose dentro en el otro.
// Anclando al centro del DISCO el aire es el mismo en los dos lados.
export const ICON_R       = 24;  // radio del disco .node-icon (48px)
export const ICON_DY      = -5;  // centro del disco respecto al de la caja
const LINK_GAP     = 7;          // aire entre el disco y el extremo de la línea
const LINK_RETRACT = ICON_R + LINK_GAP;

/** Centro del disco del icono, que es a lo que se enganchan las líneas. */
export const iconCenter = n => ({ x: n.x, y: n.y + ICON_DY });

/** Texto de la etiqueta de un enlace. */
export function linkLabelText(link) {
  return `${link.latencyMs ?? 10}ms • ${link.bandwidthMbps ?? 100}Mb`;
}

function labelWidth(text) {
  return Math.max(60, text.length * 5.5);
}

function cajasSeSolapan(p, q) {
  return Math.abs(p.cx - q.cx) < (p.w + q.w) / 2 &&
         Math.abs(p.cy - q.cy) < (p.h + q.h) / 2;
}

/**
 * Decide qué etiquetas se ven. Función pura sobre geometría ya calculada.
 *
 * @param {Array<{id:string, cx:number, cy:number, w:number, h:number, tier:number}>} cajas
 * @returns {Set<string>} ids de enlace con etiqueta visible
 */
export function planLinkLabels(cajas) {
  const visibles = new Set();

  // Regla 2: racimos de tres o más.
  //
  // El racimo es un componente conexo de la relación "está cerca", no la
  // cuenta de vecinos de cada etiqueta. Con tres PC en fila la del medio
  // toca a las otras dos pero los extremos no se tocan entre sí: contando
  // vecinos, solo la del medio se apagaría y quedarían las dos de fuera,
  // que es exactamente el ruido que se quería quitar.
  const vistos = new Array(cajas.length).fill(false);
  const apinada = new Set();

  for (let i = 0; i < cajas.length; i++) {
    if (vistos[i]) continue;
    const cola = [i];
    const racimo = [];
    vistos[i] = true;
    while (cola.length > 0) {
      const k = cola.pop();
      racimo.push(k);
      for (let j = 0; j < cajas.length; j++) {
        if (vistos[j]) continue;
        if (Math.hypot(cajas[j].cx - cajas[k].cx, cajas[j].cy - cajas[k].cy) < CROWD_RADIUS) {
          vistos[j] = true;
          cola.push(j);
        }
      }
    }
    if (racimo.length >= CROWD_MIN) {
      for (const k of racimo) {
        if (cajas[k].tier > 0) apinada.add(cajas[k].id);  // los importantes no
      }
    }
  }

  // Reglas 1 y 3. Orden estable: primero por prioridad, luego por id, para
  // que dos enlaces empatados no se turnen la etiqueta entre repintados.
  const orden = [...cajas].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  const puestas = [];
  for (const c of orden) {
    if (c.tier > 0 && apinada.has(c.id)) continue;
    if (c.tier > 0 && puestas.some(p => cajasSeSolapan(p, c))) continue;
    visibles.add(c.id);
    puestas.push(c);
  }
  return visibles;
}

/**
 * Geometría de la etiqueta de cada enlace, con su prioridad ya decidida.
 * Separada del dibujo para poder probarla sin DOM: es donde vive el juicio
 * de "qué enlace es importante".
 *
 * @param {{nodes:Array, links:Array}} graph
 * @param {{selectedLinkId?:string, hoveredLinkId?:string, highlight?:object,
 *          offsets?:Map<string,number>}} [opts]
 * @returns {Array<{id, cx, cy, w, h, tier}>}
 */
export function buildLabelBoxes(graph, opts = {}) {
  const { selectedLinkId = null, hoveredLinkId = null, highlight = null,
          offsets = new Map() } = opts;
  const porId = new Map(graph.nodes.map(n => [n.id, n]));
  const cajas = [];

  for (const link of graph.links) {
    const a = porId.get(link.source);
    const b = porId.get(link.target);
    if (!a || !b) continue;

    // Tier 0 = importante, nunca se apaga. El enlace que rompió un ping o el
    // camino que acaba de recorrer son justo lo que el usuario está mirando.
    const importante = link.id === selectedLinkId
                    || link.id === hoveredLinkId
                    || highlight?.failLinkId === link.id
                    || highlight?.linkIds?.includes(link.id)
                    || link.status === "down";

    const off = offsets.get(link.id) || 0;
    const ca = iconCenter(a), cb = iconCenter(b);
    const dx = cb.x - ca.x, dy = cb.y - ca.y;
    const d  = Math.hypot(dx, dy) || 1;
    cajas.push({
      id: link.id,
      cx: (ca.x + cb.x) / 2 + (-dy / d) * off,
      cy: (ca.y + cb.y) / 2 + ( dx / d) * off,
      w: labelWidth(linkLabelText(link)),
      h: LABEL_H,
      tier: importante ? 0 : 1,
    });
  }
  return cajas;
}

/**
 * Desplazamiento perpendicular de los enlaces que unen el mismo par de
 * nodos. Sin esto se dibujan exactamente encima y parecen uno solo, que es
 * justo lo contrario de lo que un enlace redundante debe comunicar.
 *
 * @returns {Map<string, number>} id de enlace → desplazamiento en px
 */
export function planParallelOffsets(links) {
  const porPar = new Map();
  for (const l of links) {
    const clave = [l.source, l.target].sort().join("::");
    if (!porPar.has(clave)) porPar.set(clave, []);
    porPar.get(clave).push(l.id);
  }
  const offsets = new Map();
  for (const ids of porPar.values()) {
    if (ids.length < 2) continue;
    ids.sort();
    ids.forEach((id, i) => {
      offsets.set(id, (i - (ids.length - 1) / 2) * PARALLEL_STEP);
    });
  }
  return offsets;
}

// Los colores por tipo se leen de los tokens --type-* del CSS.
// Ver src/render/typePalette.js — no declarar hex aquí.

// ── Íconos SVG por tipo de nodo (funciones que reciben el color) ────────────
export const NODE_ICON_FN = {
  router: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="22" stroke="${c}" stroke-width="1.8"/>
    <line x1="25" y1="21" x2="25" y2="13" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,10 21.5,15 28.5,15" fill="${c}"/>
    <line x1="25" y1="29" x2="25" y2="37" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,40 21.5,35 28.5,35" fill="${c}"/>
    <line x1="32" y1="25" x2="40" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="29,25 34,21.5 34,28.5" fill="${c}"/>
    <line x1="10" y1="25" x2="18" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="21,25 16,21.5 16,28.5" fill="${c}"/>
  </svg>`,

  switch: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="18" width="42" height="14" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="8"  y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2"/>
    <rect x="15" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".8"/>
    <rect x="22" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".6"/>
    <rect x="29" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".4"/>
    <circle cx="39" cy="25" r="2.2" fill="${c}"/>
  </svg>`,

  pc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="11" width="36" height="22" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="10" y="14" width="30" height="16" rx="1.5" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <line x1="14" y1="19" x2="28" y2="19" stroke="${c}" stroke-width="1" opacity=".5" stroke-linecap="round"/>
    <line x1="14" y1="22" x2="36" y2="22" stroke="${c}" stroke-width="1" opacity=".35" stroke-linecap="round"/>
    <line x1="14" y1="25" x2="22" y2="25" stroke="${c}" stroke-width="1" opacity=".25" stroke-linecap="round"/>
    <line x1="25" y1="33" x2="25" y2="38" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="16" y1="41" x2="34" y2="41" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="16" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="34" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  firewall: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 5L9 13v12c0 10 7 18 16 20 9-2 16-10 16-20V13L25 5z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="18" y="26" width="14" height="10" rx="2" stroke="${c}" stroke-width="1.5" fill="none"/>
    <path d="M20 26v-3a5 5 0 0110 0v3" stroke="${c}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="31" r="2" fill="${c}"/>
  </svg>`,

  server: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="9"  width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="21" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="33" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="10" y="11.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="23.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="35.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <circle cx="37" cy="13.5" r="2" fill="${c}"/>
    <circle cx="37" cy="25.5" r="2" fill="${c}" opacity=".6"/>
    <circle cx="37" cy="37.5" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  cloud: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M36 30H17a8 8 0 01-1-15.9A10 10 0 0133 16a7 7 0 013 12z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <line x1="19" y1="37" x2="19" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="39" x2="25" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="31" y1="37" x2="31" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="19" cy="38.5" r="1.5" fill="${c}"/>
    <circle cx="25" cy="40.5" r="1.5" fill="${c}"/>
    <circle cx="31" cy="38.5" r="1.5" fill="${c}"/>
  </svg>`,

  ap: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 15 A24 24 0 0 1 42 15" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M13 20 A17 17 0 0 1 37 20" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M18 25 A10 10 0 0 1 32 25" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="26" r="2.5" fill="${c}"/>
    <line x1="25" y1="28.5" x2="25" y2="33" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="16" y="33" width="18" height="5" rx="2.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="29" cy="35.5" r="1.2" fill="${c}" opacity=".7"/>
  </svg>`,

  plc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="10" width="34" height="28" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="12" y="14" width="26" height="7" rx="1" stroke="${c}" stroke-width="1.2" opacity=".5" fill="none"/>
    <circle cx="14" cy="27" r="2" fill="${c}"/>
    <circle cx="21" cy="27" r="2" fill="${c}" opacity=".6"/>
    <circle cx="28" cy="27" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  ur3: (c) => `<svg viewBox="4 18 42 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="39" width="12" height="5" rx="2.5" fill="${c}" opacity=".8"/>
    <rect x="11" y="34" width="6" height="6" rx="1" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="3" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="1" fill="${c}"/>
    <line x1="14" y1="33" x2="19" y2="23" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="20" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="20" cy="22" r="0.9" fill="${c}"/>
    <line x1="20" y1="22" x2="32" y2="22" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="33" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="33" cy="22" r="0.9" fill="${c}"/>
    <line x1="33" y1="22" x2="35" y2="33" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="35" cy="34" r="2.3" stroke="${c}" stroke-width="1.3" fill="none"/>
    <line x1="32" y1="36" x2="29" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="38" y1="36" x2="41" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="32" y1="37.5" x2="38" y2="37.5" stroke="${c}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
  </svg>`,

  agv: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="15" width="30" height="20" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <path d="M13 18 L8 22 L8 28 L13 32" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="14" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="14" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="8" cy="25" r="1.5" fill="${c}"/>
  </svg>`,
};

// ── Iconos macizos para el zoom alejado ───────────────────────────────────
//
// Los de arriba están dibujados con trazos de 1.2 a 1.8 sobre un viewBox de
// 50, que renderizado a 40px son entre 1 y 1.4px. Basta con alejar el
// lienzo a la mitad para que esos trazos caigan por debajo del píxel: el
// navegador los promedia contra el fondo y el icono se vuelve una mancha
// gris. No es un problema de nitidez que se arregle con más resolución —
// es que a esa escala no cabe el detalle.
//
// A tamaño diminuto lo único que sobrevive es la SILUETA, así que este
// juego apuesta primero a la forma exterior: masa maciza, sin trazos finos.
//
// El detalle interior que llevan va SIEMPRE como hueco recortado en esa masa
// (`fill-rule="evenodd"`), nunca como línea añadida encima. Un agujero de 4
// unidades sigue siendo un agujero cuando se encoge; un trazo de 1.4 se
// promedia con el fondo y desaparece. Y como es un hueco de verdad y no un
// relleno del color del fondo, funciona igual en claro (SVG blanco sobre
// disco de color) que en oscuro (SVG de color sobre transparente).
//
// PRESUPUESTO DE DETALLE — el SVG mide 40px sobre un viewBox de 50, o sea
// 0.8px por unidad a zoom 1. Este juego solo se usa por debajo de zoom 0.50,
// donde la unidad vale 0.4px, y hasta ZOOM_MIN (0.39) donde vale 0.31px. Por
// eso ninguna separación ni hueco de aquí baja de ~3.5 unidades: por debajo
// de eso el rasgo no llega al píxel y solo ensucia la silueta. Si añades
// detalle, mídelo contra esa regla antes que contra cómo se ve a zoom 1.
//
// `pc` y `firewall` se quedan a silueta pura a propósito: el monitor con pie
// y el escudo ya son inconfundibles de contorno, y meterles huecos solo les
// restaría masa.
//
// Mismos viewBox y misma firma que NODE_ICON_FN — son intercambiables.
export const NODE_ICON_MINI_FN = {
  // Disco central + 4 flechas: las flechas son lo que lo separa de un nodo
  // genérico, y macizas aguantan el encogido mucho mejor que los muñones.
  router: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="10.5" fill="${c}"/>
    <path d="M25 2 L31 11 H19 Z"  fill="${c}"/>
    <path d="M25 48 L31 39 H19 Z" fill="${c}"/>
    <path d="M2 25 L11 19 V31 Z"  fill="${c}"/>
    <path d="M48 25 L39 31 V19 Z" fill="${c}"/>
  </svg>`,

  // Chasis con 4 bocas recortadas. Sin los puertos era una barra redondeada
  // sin más — la fila de huecos es lo único que dice "switch".
  switch: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path fill="${c}" fill-rule="evenodd" d="M9 15 H41 A5 5 0 0 1 46 20 V30 A5 5 0 0 1 41 35 H9 A5 5 0 0 1 4 30 V20 A5 5 0 0 1 9 15 Z M10 23 h5 v5 h-5 z M19 23 h5 v5 h-5 z M28 23 h5 v5 h-5 z M37 23 h5 v5 h-5 z"/>
  </svg>`,

  pc: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="12" width="36" height="24" rx="4" fill="${c}"/>
    <rect x="17" y="38" width="16" height="5" rx="2.5" fill="${c}"/>
  </svg>`,

  firewall: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 5L9 13v12c0 10 7 18 16 20 9-2 16-10 16-20V13L25 5z" fill="${c}"/>
  </svg>`,

  // Tres unidades de rack, cada una con su ranura frontal y su piloto. Los
  // huecos son lo que las convierte en equipo montado y no en tres barras.
  server: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path fill="${c}" fill-rule="evenodd" d="M10 6 H40 A3 3 0 0 1 43 9 V13 A3 3 0 0 1 40 16 H10 A3 3 0 0 1 7 13 V9 A3 3 0 0 1 10 6 Z M11 9 h15 v4 h-15 z M34 9 h4 v4 h-4 z"/>
    <path fill="${c}" fill-rule="evenodd" d="M10 20 H40 A3 3 0 0 1 43 23 V27 A3 3 0 0 1 40 30 H10 A3 3 0 0 1 7 27 V23 A3 3 0 0 1 10 20 Z M11 23 h15 v4 h-15 z M34 23 h4 v4 h-4 z"/>
    <path fill="${c}" fill-rule="evenodd" d="M10 34 H40 A3 3 0 0 1 43 37 V41 A3 3 0 0 1 40 44 H10 A3 3 0 0 1 7 41 V37 A3 3 0 0 1 10 34 Z M11 37 h15 v4 h-15 z M34 37 h4 v4 h-4 z"/>
  </svg>`,

  // La nube maciza ya se leía; lo que le faltaba eran las bajantes a los
  // extremos, que es lo que la distingue de una mancha cualquiera.
  cloud: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path d="M36 31H17a8.5 8.5 0 01-1-16.9A10.5 10.5 0 0133.5 16 7.5 7.5 0 0136 31z" fill="${c}"/>
    <rect x="16"    y="30" width="3.5" height="8"  rx="1.75" fill="${c}"/>
    <rect x="23.25" y="30" width="3.5" height="10" rx="1.75" fill="${c}"/>
    <rect x="30.5"  y="30" width="3.5" height="8"  rx="1.75" fill="${c}"/>
    <circle cx="17.75" cy="40"   r="2.4" fill="${c}"/>
    <circle cx="25"    cy="42.2" r="2.4" fill="${c}"/>
    <circle cx="32.25" cy="40"   r="2.4" fill="${c}"/>
  </svg>`,

  // Dos ondas en vez de una, más el cuerpo del equipo debajo. Con un solo
  // arco y un punto parecía un paraguas; dos arcos concéntricos ya son wifi.
  ap: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 29 A19 19 0 0 1 44 29"  stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M15 29 A10 10 0 0 1 35 29" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="14" y="36" width="22" height="8" rx="4" fill="${c}"/>
  </svg>`,

  // Armario con display y fila de pilotos. El rectángulo pelado era el más
  // abstracto de todos: no decía nada que no dijera cualquier otra caja.
  plc: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <path fill="${c}" fill-rule="evenodd" d="M14 9 H36 A4 4 0 0 1 40 13 V37 A4 4 0 0 1 36 41 H14 A4 4 0 0 1 10 37 V13 A4 4 0 0 1 14 9 Z M15 14 h20 v8 h-20 z M13.5 28 h5 v5 h-5 z M22.5 28 h5 v5 h-5 z M31.5 28 h5 v5 h-5 z"/>
  </svg>`,

  // Brazo articulado: base, hombro, codo y pinza. Las articulaciones son
  // discos MÁS anchos que el segmento, así se leen como juntas sin necesidad
  // de dibujar un contorno; la muesca de la pinza va recortada.
  ur3: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="40" width="22" height="6" rx="3" fill="${c}"/>
    <rect x="14.5" y="22" width="9" height="19" rx="4.5" fill="${c}"/>
    <circle cx="19" cy="22" r="6" fill="${c}"/>
    <path d="M19 22 L34 17" stroke="${c}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="34" cy="17" r="6" fill="${c}"/>
    <path d="M34 17 L39 27" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
    <path d="M32 28 H46 V37 H42 V33 H36 V37 H32 Z" fill="${c}"/>
  </svg>`,

  // Vehículo con plataforma de carga encima, más ventana y sensor recortados.
  // La plataforma separada es lo que lo hace "AGV" y no un coche.
  agv: (c) => `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="4" width="26" height="5" rx="2.5" fill="${c}"/>
    <path fill="${c}" fill-rule="evenodd" d="M10 13 H40 A4 4 0 0 1 44 17 V27 A4 4 0 0 1 40 31 H10 A4 4 0 0 1 6 27 V17 A4 4 0 0 1 10 13 Z M11 17 h17 v5 h-17 z M32 17 h5 v5 h-5 z"/>
    <circle cx="15" cy="36" r="5.5" fill="${c}"/>
    <circle cx="35" cy="36" r="5.5" fill="${c}"/>
  </svg>`,
};

// Devuelve el <div class="node-icon"> completo con color/fondo según el tema activo.
// Dark mode : SVG del color de tipo + halo tint vía CSS (--node-color).
// Light mode: SVG blanco + fondo sólido del color de tipo (inline style).
// En ambos casos el color sale del mismo token --type-*, así que el
// SVG y el halo del CSS siempre coinciden.
//
// `lod` elige el juego: "mini" a partir de cierto alejamiento (lo decide
// main.js, que es quien conoce el zoom), "full" el resto del tiempo.
function getNodeIconHTML(type, lod = "full") {
  const isLight   = document.documentElement.dataset.theme === "light";
  const typeColor = getTypeColor(type);
  const juego     = lod === "mini" ? NODE_ICON_MINI_FN : NODE_ICON_FN;
  const fn        = juego[type] ?? juego.pc;
  const stylePart = isLight ? ` style="background:${typeColor}"` : "";
  return `<div class="node-icon"${stylePart}>${fn(isLight ? "#ffffff" : typeColor)}</div>`;
}

// Rastrea IDs de nodos ya renderizados para detectar nodos nuevos
const _seenNodeIds = new Set();

/**
 * Calcula en una sola pasada BFS el estado de cada nodo:
 * - connected : tiene al menos 1 enlace activo
 * - hasInternet: su componente conectada incluye un nodo tipo "cloud"
 */
function computeNodeStatuses(graph) {
  const { nodes, links } = graph;

  // Adyacencia solo con enlaces activos (status !== "down")
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    if (l.status === "down") continue;
    if (adj.has(l.source)) adj.get(l.source).push(l.target);
    if (adj.has(l.target)) adj.get(l.target).push(l.source);
  }

  const cloudIds = new Set(nodes.filter(n => n.type === "cloud").map(n => n.id));
  const connected   = new Map();
  const hasInternet = new Map();
  for (const n of nodes) {
    connected.set(n.id, (adj.get(n.id) || []).length > 0);
    hasInternet.set(n.id, false);
  }

  // BFS por componentes — si la componente tiene un cloud, todos ganan internet
  const visited = new Set();
  function bfsComponent(startId) {
    const comp = [];
    const q = [startId];
    visited.add(startId);
    while (q.length) {
      const cur = q.shift();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    return comp;
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const comp = bfsComponent(n.id);
      if (comp.some(id => cloudIds.has(id))) {
        for (const id of comp) hasInternet.set(id, true);
      }
    }
  }

  return { connected, hasInternet };
}

export function renderStage({ stageEl, svgEl, worldEl, state, dispatch, ActionTypes, runtime, hoveredLinkId = null, lod = "full" }) {
  const graph = state.graph;
  const ui = state.ui;

  // ── 1) SVG: enlaces + paquetes ───────────────────────────────────────
  // viewBox fijo en coordenadas mundo (4000×4000); el zoom/pan está en worldEl.transform
  svgEl.innerHTML = "";
  svgEl.setAttribute("viewBox", "0 0 4000 4000");
  svgEl.setAttribute("overflow", "visible"); // evita clip de enlaces en coordenadas fuera del viewBox

  // Links
  const highFanout = buildHighFanoutSet(graph); // switches con fan-out alto
  const paralelos  = planParallelOffsets(graph.links);

  // Plan de etiquetas: primero la geometría de todas, luego quién se ve.
  const cajasLabel = buildLabelBoxes(graph, {
    selectedLinkId: ui.selection?.kind === "link" ? ui.selection.id : null,
    hoveredLinkId,
    highlight: ui.highlight,
    offsets: paralelos,
  });
  const labelsVisibles = planLinkLabels(cajasLabel);
  const cajaPorId = new Map(cajasLabel.map(c => [c.id, c]));

  for (const link of graph.links) {
    const a = graph.nodes.find(n => n.id === link.source);
    const b = graph.nodes.find(n => n.id === link.target);
    if (!a || !b) continue;

    // Regla 9: enlace fan-out = switch de alta densidad → PC directa
    const isFanoutLink = (highFanout.has(link.source) && b.type === "pc")
                      || (highFanout.has(link.target) && a.type === "pc");

    // Entre centros de DISCO, no de caja: así el retraimiento es simétrico.
    const ca = iconCenter(a), cb = iconCenter(b);
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    // Desplazamiento perpendicular para los enlaces del mismo par de nodos.
    const off = paralelos.get(link.id) || 0;
    const px  = -uy * off;
    const py  =  ux * off;
    const x1 = ca.x + ux * LINK_RETRACT + px;
    const y1 = ca.y + uy * LINK_RETRACT + py;
    const x2 = cb.x - ux * LINK_RETRACT + px;
    const y2 = cb.y - uy * LINK_RETRACT + py;

    const isSelected = ui.selection?.kind === "link" && ui.selection.id === link.id;
    const isLight = document.documentElement.dataset.theme === "light";

    // Resaltado didáctico: el camino que recorre un ping, o el enlace
    // concreto que lo rompió. Prevalece sobre la selección.
    const hl = ui.highlight;
    const isOnPath = hl?.linkIds?.includes(link.id);
    const isFailLink = hl?.failLinkId === link.id;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    if (isFailLink || isOnPath) {
      line.setAttribute("class", isFailLink ? "link--fail" : "link--path");
      line.setAttribute("stroke-width", "4");
      line.setAttribute("opacity", "1");
      line.setAttribute("stroke-dasharray", link.status === "down" ? "8 6" : "none");
    } else {
      line.setAttribute("stroke", isSelected
        ? (isLight ? "#1a237e" : "#2d35a8")
        : (isLight ? "#3344bb" : "#4a55d4"));
      line.setAttribute("stroke-width", isSelected ? "3.5" : "2");
      // Fan-out links: opacidad reducida para no saturar visualmente (Regla 9)
      const baseOpacity = isLight ? 0.55 : 0.6;
      line.setAttribute("opacity", link.status === "down" ? "0.22" : isFanoutLink ? (isLight ? "0.25" : "0.3") : String(baseOpacity));
      line.setAttribute("stroke-dasharray", link.status === "down" ? "8 6" : "none");
    }
    svgEl.appendChild(line);

    // Etiqueta del enlace. Se dibuja SIEMPRE: las que el plan apaga salen
    // transparentes, para que el cursor pueda revelarlas sin repintar nada.
    {
      const caja = cajaPorId.get(link.id);
      const mx = caja.cx;
      const my = caja.cy;
      const text = linkLabelText(link);
      const w = caja.w;
      const oculta = !labelsVisibles.has(link.id);

      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", oculta ? "link-label link-label--oculta" : "link-label");
      g.dataset.linkId = link.id;

      const bg = document.createElementNS(SVG_NS, "rect");
      bg.setAttribute("x", String(mx - w/2));
      bg.setAttribute("y", String(my - 8));
      bg.setAttribute("width", String(w));
      bg.setAttribute("height", String(LABEL_H));
      bg.setAttribute("rx", "5");
      bg.setAttribute("fill", isLight ? "rgba(255,255,255,0.88)" : "rgba(10,10,20,0.5)");
      bg.setAttribute("stroke", isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)");
      bg.setAttribute("stroke-width", "1");
      g.appendChild(bg);

      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(mx));
      t.setAttribute("y", String(my + 3));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("fill", isLight ? "rgba(30,40,100,0.75)" : "rgba(180,190,220,0.7)");
      t.setAttribute("font-size", "9");
      t.setAttribute("font-weight", "500");
      t.setAttribute("font-family", "Inter, system-ui, sans-serif");
      t.setAttribute("text-rendering", "geometricPrecision");
      t.textContent = text;
      g.appendChild(t);

      svgEl.appendChild(g);
    }
  }

  // Destellos de llegada — anillo que se expande y se desvanece.
  // Marca "aquí llegó el paquete", que es lo que hace legible el salto a salto.
  for (const u of runtime.pulses || []) {
    const n = graph.nodes.find(x => x.id === u.nodeId);
    if (!n) continue;
    const k = Math.min(1, u.t / 0.45);          // 0→1 a lo largo del destello
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(n.x));
    ring.setAttribute("cy", String(n.y + ICON_DY));
    ring.setAttribute("r", String(20 + k * 22));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "currentColor");
    ring.setAttribute("stroke-width", String(2.5 * (1 - k)));
    ring.setAttribute("opacity", String(0.65 * (1 - k)));
    ring.setAttribute("class", "pkt-pulse");
    svgEl.appendChild(ring);
  }

  // Paquetes — se interpola entre los nodos del salto ACTUAL.
  // El sentido viene en el propio salto (fromId/toId), así que no hay que
  // deducirlo de link.source/target, que es lo que hacía que algunos paquetes
  // se vieran viajar hacia atrás.
  for (const p of runtime.packets) {
    const hop = p.hops?.[p.hopIndex];
    if (!hop) continue;
    const from = graph.nodes.find(n => n.id === hop.fromId);
    const to   = graph.nodes.find(n => n.id === hop.toId);
    if (!from || !to) continue;

    const cf = iconCenter(from), ct = iconCenter(to);
    const x = cf.x + (ct.x - cf.x) * p.progress;
    const y = cf.y + (ct.y - cf.y) * p.progress;

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", `pkt pkt--${p.kind}`);

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "6");
    dot.setAttribute("class", "pkt-dot");
    g.appendChild(dot);

    // La etiqueta ("TTL=2", "echo reply"…) es lo que convierte el punto en
    // una lección en vez de una mota que se mueve.
    if (p.label) {
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(x + 10));
      t.setAttribute("y", String(y - 9));
      t.setAttribute("class", "pkt-label");
      t.textContent = p.label;
      g.appendChild(t);
    }

    svgEl.appendChild(g);
  }

  // 2) DOM nodes — dentro del world container
  worldEl.querySelectorAll(".node").forEach(n => n.remove());

  const { connected, hasInternet } = computeNodeStatuses(graph);

  for (const node of graph.nodes) {
    const isNew      = !_seenNodeIds.has(node.id);
    _seenNodeIds.add(node.id);

    const isSelected = ui.selection?.kind === "node" && ui.selection.id === node.id;
    const isConn     = connected.get(node.id);
    const isNet      = hasInternet.get(node.id);

    // Resaltado didáctico: nodos del camino, y el que provocó el fallo
    // (un firewall que bloquea, el último alcanzable…).
    const onPath = ui.highlight?.nodeIds?.includes(node.id);
    const isFail = ui.highlight?.failNodeId === node.id;

    const el = document.createElement("div");
    el.className = `node ${node.type}${isSelected ? " selected" : ""}${isNew ? " node--entering" : ""}`
      + (onPath ? " node--path" : "") + (isFail ? " node--fail" : "");
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top  = `${node.y}px`;

    el.innerHTML = `
      <div class="node-label">${node.label}</div>
      ${getNodeIconHTML(node.type, lod)}
      <div class="node-meta" style="display:${ui.showIpLabels === false ? "none" : ""}">${node.ip || "sin IP"}</div>
      <div class="node-indicators">
        <span class="node-ind node-ind--link ${isConn ? "on" : "off"}"
              title="${isConn ? "Conectado" : "Sin conexiones"}"></span>
        <span class="node-ind node-ind--net ${isNet ? "on" : "off"}"
              title="${isNet ? "Internet disponible" : "Sin internet"}"></span>
      </div>
    `;

    worldEl.appendChild(el);
  }

  // Limpiar IDs de nodos eliminados para que reaparezcan con animación si se re-agregan
  const currentIds = new Set(graph.nodes.map(n => n.id));
  for (const id of _seenNodeIds) {
    if (!currentIds.has(id)) _seenNodeIds.delete(id);
  }
}

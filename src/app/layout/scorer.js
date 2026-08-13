// src/app/layout/scorer.js
//
// Dos funciones con propósitos distintos, y conviene no mezclarlas:
//
//   scoreLayout()   → penalización para ELEGIR entre variantes. Es una
//                     escala interna: solo tiene sentido comparar dos
//                     puntuaciones del mismo grafo.
//   layoutMetrics() → medidas absolutas para JUZGAR el motor entre
//                     versiones. No influye en nada de lo que se dibuja.
//
// La segunda no existía. Sin ella, "¿mejoró el layout?" solo se podía
// responder mirando, que es justo lo que hace imposible cambiar el motor
// con confianza.

import {
  MIN_GAP_X, MIN_GAP_Y, BASE_HGAP, BASE_VGAP, boxPenetration, boxesOverlap,
  segmentsIntersect, distPointToSegment, boundingBox,
} from "./geometry.js";

// Distancia bajo la cual se considera que un enlace atraviesa un nodo.
// Es algo mayor que el retraimiento real de la línea en el renderer (31px
// desde el centro del disco), así que peca de conservador, que es el lado
// correcto.
const EDGE_NODE_CLEARANCE = 38;

// Proporción ancho/alto a la que se aspira.
//
// NO es el tamaño de la ventana: es una de DOS constantes, elegida por
// clase de dispositivo. Un móvil se desplaza a lo largo con el pulgar y una
// pantalla de escritorio tiene ancho de sobra y poco alto, así que el mismo
// grafo pide dibujos distintos. Lo que se mantiene es el determinismo
// dentro de cada orientación: el mismo grafo y la misma orientación dan
// siempre el mismo dibujo, en cualquier tamaño de ventana.
//
// El ajuste real no lo hace solo el objetivo de aspecto: `foldMin*` decide
// a partir de cuántos niveles se prueba siquiera a plegar la columna. En
// horizontal se prueba pronto (3 niveles), en vertical prácticamente nunca.
export const ORIENTACIONES = {
  horizontal: { aspectTarget: 16 / 9, foldMin: 3, foldMin2: 6 },
  vertical:   { aspectTarget: 0.62,   foldMin: 8, foldMin2: 12 },
};

/** Orientación por defecto: escritorio, que es donde se diseña. */
export const ORIENTACION_DEFECTO = "horizontal";

export function perfilOrientacion(nombre) {
  return ORIENTACIONES[nombre] || ORIENTACIONES[ORIENTACION_DEFECTO];
}

// Cuánto pesan los términos de composición. Van acotados a 0..1 y con
// pesos menores que una sola violación de las de arriba: un diagrama
// bonito pero con un cruce nunca debe ganarle a uno feo sin cruces.
const W_ASPECT   = 300;
const W_AREA     = 200;
const W_EDGE_LEN = 150;
const W_MAINPATH = 600;

const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * Penalización de un conjunto de posiciones. Menor es mejor.
 *
 * Es una escala INTERNA: solo tiene sentido comparar dos puntuaciones del
 * mismo grafo. Para juzgar el motor entre versiones está `layoutMetrics`.
 *
 * Los términos se agrupan en dos bloques con intenciones distintas:
 *
 *   • CORRECCIÓN (solapes, cruces, enlaces sobre nodos, orden de lectura).
 *     Escala abierta, cientos o miles de puntos por incidencia.
 *   • COMPOSICIÓN (aspecto, área, longitud de enlaces). Acotados a 0..1 y
 *     multiplicados por pesos menores que una sola incidencia de arriba.
 *
 * Esa separación es deliberada: los términos de composición son
 * DESEMPATES. Sirven para elegir entre dos disposiciones igual de
 * correctas —la vertical y la plegada— y nunca pueden hacer que gane una
 * con un cruce más.
 *
 * @param {Map<string,{x:number,y:number}>} positions
 * @param {Array} links
 * @param {Map<string,number>} [layers] - nivel topológico por nodo
 * @param {{mainPath?:string[], orientation?:string}} [opts]
 */
export function scoreLayout(positions, links, layers, opts = {}) {
  let score = 0;
  const ids = [...positions.keys()];
  const objetivoAspecto = perfilOrientacion(opts.orientation).aspectTarget;

  // Cajas solapadas — lo más grave. Se mide sobre el eje de menor
  // penetración, que es lo que costaría separarlas: dos nodos que se pisan
  // en diagonal por 3px no son el mismo problema que dos superpuestos.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pa = positions.get(ids[i]), pb = positions.get(ids[j]);
      const { ox, oy } = boxPenetration(pa, pb);
      if (ox > 0 && oy > 0) score += 1000 * Math.min(ox / MIN_GAP_X, oy / MIN_GAP_Y);
    }
  }

  const edges = (links || []).filter(l => positions.has(l.source) && positions.has(l.target));

  // Cruces de enlaces
  for (let i = 0; i < edges.length; i++) {
    const p1 = positions.get(edges[i].source), p2 = positions.get(edges[i].target);
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].source === edges[j].source || edges[i].source === edges[j].target ||
          edges[i].target === edges[j].source || edges[i].target === edges[j].target) continue;
      const p3 = positions.get(edges[j].source), p4 = positions.get(edges[j].target);
      if (segmentsIntersect(p1, p2, p3, p4)) score += 1000;
    }
  }

  // Enlaces que pasan por encima de un nodo que no es su extremo
  for (const link of edges) {
    const p1 = positions.get(link.source), p2 = positions.get(link.target);
    for (const id of ids) {
      if (id === link.source || id === link.target) continue;
      if (distPointToSegment(positions.get(id).x, positions.get(id).y, p1.x, p1.y, p2.x, p2.y) < EDGE_NODE_CLEARANCE) score += 700;
    }
  }

  // Violación del orden de lectura: un nodo que va antes en el recorrido de
  // la red dibujado por debajo de uno que va después.
  //
  // Antes esto se medía contra ROLE_TIER, el nivel fijo por tipo de
  // dispositivo, y tenía un punto ciego grande: en un anillo o una malla
  // todos los nodos comparten rol, así que el chequeo se saltaba entero y
  // el colapso a una fila plana no generaba ninguna señal de alarma.
  //
  // Medido contra el nivel topológico real, dos nodos conectados solo
  // comparten nivel cuando de verdad son paralelos.
  if (layers) {
    for (const link of edges) {
      const lA = layers.get(link.source);
      const lB = layers.get(link.target);
      if (lA === undefined || lB === undefined) continue; // alguna hoja
      if (lA === lB) continue;
      const pa = positions.get(link.source), pb = positions.get(link.target);
      if (lA < lB && pa.y > pb.y + 40) score += 800;
      if (lB < lA && pb.y > pa.y + 40) score += 800;
    }
  }

  // Dos nodos conectados que NO son paralelos pero se dibujan a la misma
  // altura: se leen como una pareja redundante sin serlo. Es la
  // penalización que pide el documento, y vigila sobre todo a las
  // variantes plegadas, donde la Y ya no crece con el nivel.
  if (layers) {
    for (const link of edges) {
      const lA = layers.get(link.source);
      const lB = layers.get(link.target);
      if (lA === undefined || lB === undefined || lA === lB) continue;
      const pa = positions.get(link.source), pb = positions.get(link.target);
      if (Math.abs(pa.y - pb.y) < 40) score += 500;
    }
  }

  // Varianza de longitud (preferir enlaces parejos). Coeficiente bajo a
  // propósito: es un desempate, no una fuerza.
  if (edges.length > 1) {
    const lengths = edges.map(l => {
      const p1 = positions.get(l.source), p2 = positions.get(l.target);
      return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    });
    const avg = lengths.reduce((s, l) => s + l, 0) / lengths.length;
    const variance = lengths.reduce((s, l) => s + (l - avg) ** 2, 0) / lengths.length;
    score += Math.sqrt(variance) * 0.2;
  }

  // ── Orden de lectura de la ruta principal ─────────────────────────────
  // La columna vertebral tiene que descender. Si un nodo de la ruta queda a
  // la altura del anterior o por encima, el diagrama deja de leerse.
  const { mainPath } = opts;
  if (mainPath && mainPath.length > 1) {
    let fallos = 0;
    for (let i = 1; i < mainPath.length; i++) {
      const a = positions.get(mainPath[i - 1]);
      const b = positions.get(mainPath[i]);
      if (!a || !b) continue;
      if (b.y <= a.y) fallos++;
    }
    score += W_MAINPATH * fallos;
  }

  // ── Composición ───────────────────────────────────────────────────────
  if (ids.length > 1) {
    const { minX, minY, maxX, maxY } = boundingBox(positions);
    const w = maxX - minX;
    const h = maxY - minY;

    // Aspecto: distancia logarítmica al objetivo, para que "el doble de
    // ancho" y "la mitad de ancho" penalicen igual. Un diagrama sin ancho
    // —una columna perfectamente recta— es el peor caso posible.
    let aspecto = 1;
    if (w > 0 && h > 0) {
      aspecto = clamp01(Math.abs(Math.log((w / h) / objetivoAspecto)) / Math.log(8));
    }
    score += W_ASPECT * aspecto;

    // Área, contra lo que ocuparían los nodos en una rejilla holgada.
    // Solo penaliza el exceso: un diagrama compacto no gana puntos, no
    // los pierde.
    const areaRef = ids.length * BASE_HGAP * BASE_VGAP;
    score += W_AREA * clamp01(((w * h) / Math.max(1, areaRef) - 1) / 3);

    // Longitud total de enlaces, contra dos saltos de nivel por enlace.
    if (edges.length > 0) {
      const total = edges.reduce((s, l) => {
        const p1 = positions.get(l.source), p2 = positions.get(l.target);
        return s + Math.hypot(p2.x - p1.x, p2.y - p1.y);
      }, 0);
      score += W_EDGE_LEN * clamp01((total / Math.max(1, edges.length * 430) - 1) / 2);
    }
  }

  return score;
}

/**
 * Medidas absolutas de un layout, para comparar versiones del motor.
 *
 * A diferencia de scoreLayout, aquí no hay pesos ni criterio: son hechos.
 * Los consume `bench/layout_bench.mjs` y la línea base de los tests.
 *
 * @param {Map<string,{x:number,y:number}>} positions
 * @param {Array} links
 * @returns {{width:number, height:number, aspect:number, area:number,
 *            crossings:number, edgeThroughNode:number, edgeLenTotal:number,
 *            edgeLenMax:number, minPairDist:number, boxOverlaps:number,
 *            nodes:number, edges:number}}
 */
export function layoutMetrics(positions, links) {
  const ids = [...positions.keys()];
  const edges = (links || []).filter(l => positions.has(l.source) && positions.has(l.target));

  const { minX, minY, maxX, maxY } = ids.length ? boundingBox(positions)
                                               : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const width  = maxX - minX;
  const height = maxY - minY;

  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    const p1 = positions.get(edges[i].source), p2 = positions.get(edges[i].target);
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].source === edges[j].source || edges[i].source === edges[j].target ||
          edges[i].target === edges[j].source || edges[i].target === edges[j].target) continue;
      const p3 = positions.get(edges[j].source), p4 = positions.get(edges[j].target);
      if (segmentsIntersect(p1, p2, p3, p4)) crossings++;
    }
  }

  let edgeThroughNode = 0;
  for (const link of edges) {
    const p1 = positions.get(link.source), p2 = positions.get(link.target);
    for (const id of ids) {
      if (id === link.source || id === link.target) continue;
      if (distPointToSegment(positions.get(id).x, positions.get(id).y, p1.x, p1.y, p2.x, p2.y) < EDGE_NODE_CLEARANCE) edgeThroughNode++;
    }
  }

  let edgeLenTotal = 0, edgeLenMax = 0;
  for (const l of edges) {
    const p1 = positions.get(l.source), p2 = positions.get(l.target);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    edgeLenTotal += len;
    edgeLenMax = Math.max(edgeLenMax, len);
  }

  // `minPairDist` es distancia entre centros: sigue siendo informativa, pero
  // ya no es el criterio. `boxOverlaps` sí lo es, y debe ser 0 siempre.
  let minPairDist = Infinity;
  let boxOverlaps = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pa = positions.get(ids[i]), pb = positions.get(ids[j]);
      minPairDist = Math.min(minPairDist, Math.hypot(pb.x - pa.x, pb.y - pa.y));
      if (boxesOverlap(pa, pb)) boxOverlaps++;
    }
  }
  if (!isFinite(minPairDist)) minPairDist = 0;

  return {
    nodes: ids.length,
    edges: edges.length,
    width:  Math.round(width),
    height: Math.round(height),
    // Ancho/alto. 1 es cuadrado, <1 apaisado hacia vertical, >1 horizontal.
    aspect: height > 0 ? Number((width / height).toFixed(3)) : 0,
    area:   Math.round(width * height),
    crossings,
    edgeThroughNode,
    edgeLenTotal: Math.round(edgeLenTotal),
    edgeLenMax:   Math.round(edgeLenMax),
    minPairDist:  Math.round(minPairDist),
    boxOverlaps,
  };
}

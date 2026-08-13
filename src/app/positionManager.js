// src/app/positionManager.js
// Gestión de posiciones de nodos: colocación libre y resolución de colisiones
// tras un arrastre manual.
//
// La colisión NO se implementa aquí: se delega en `layout/geometry.js`, que
// es la misma que usa Pretty. Este archivo tenía su propia copia con una
// distancia propia (85 entre centros, contra los 110 del motor), así que un
// diagrama recién organizado y uno ajustado a mano obedecían a dos nociones
// distintas de "demasiado cerca". Ahora hay una sola, y mide la caja real.

import { resolveCollisions, MAX_COLLISION_ITER, MIN_GAP_Y } from "./layout/geometry.js";

// Rejilla de colocación de nodos nuevos. Es paso, no separación mínima: se
// mantiene por encima de `MIN_GAP_Y` para que una celda libre lo esté de
// verdad y el nodo recién creado no nazca ya solapado.
const GRID = Math.max(130, MIN_GAP_Y);
const COLS = 5;

/**
 * Calcula el centroide del grafo existente para anclar la rejilla cerca de los nodos actuales.
 */
function graphCentroid(nodes) {
  if (nodes.length === 0) return { x: 200, y: 200 };
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  return { x: Math.round(cx), y: Math.round(cy) };
}

/**
 * Devuelve la primera celda libre en una rejilla centrada en el centroide del grafo.
 * @param {object} graph - Grafo v3 con nodes[]
 * @returns {{ x: number, y: number }}
 */
export function computeFreePosition(graph) {
  const nodes = graph.nodes || [];
  const { x: cx, y: cy } = graphCentroid(nodes);

  // Inicio de la rejilla: un poco arriba-izquierda del centroide
  const startCX = Math.round(cx / GRID) - Math.floor(COLS / 2);
  const startCY = Math.round(cy / GRID) - 1;

  const occupied = new Set(
    nodes.map(n => `${Math.round(n.x / GRID)},${Math.round(n.y / GRID)}`)
  );

  for (let i = 0; i < 60; i++) {
    const gx = startCX + (i % COLS);
    const gy = startCY + Math.floor(i / COLS);
    const key = `${Math.round(gx)},${Math.round(gy)}`;
    if (!occupied.has(key)) {
      return { x: Math.round(gx * GRID), y: Math.round(gy * GRID) };
    }
  }
  // Fallback aleatorio
  return { x: Math.round(cx + Math.random() * 200 - 100), y: Math.round(cy + Math.random() * 200) };
}

/**
 * Decide la posición para un nuevo nodo a partir de una acción AI.
 * Ignora x,y de la IA (política del frontend de decidir toda posición).
 * @param {object} action - Acción add_node
 * @param {object} graph  - Grafo actual
 * @returns {{ x: number, y: number }}
 */
export function positionNewNode(action, graph) {
  // Coordenadas de la IA ignoradas intencionalmente
  return computeFreePosition(graph);
}

/**
 * Resuelve colisiones y aplica el resultado en un solo dispatch.
 * @param {object} store
 * @param {Function} dispatch
 * @param {object} ActionTypes
 * @param {string|null} anchorId - nodo que no se mueve (el recién soltado)
 */
export function resolveAndDispatch(store, dispatch, ActionTypes, anchorId = null) {
  const nodes = store.getState().graph.nodes;
  if (nodes.length < 2) return;

  // Guard: grafos muy grandes → solo 1 iteración (evitar O(N²) lento)
  const maxIter = nodes.length > 60 ? 1 : MAX_COLLISION_ITER;

  // El nodo recién soltado es el ancla: el usuario lo puso ahí a propósito,
  // así que ceden los demás. Es el mismo papel que el backbone en Pretty.
  const positions = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
  const fixedIds  = anchorId ? new Set([anchorId]) : new Set();
  resolveCollisions(positions, fixedIds, maxIter);

  const moves = [];
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (p && (p.x !== n.x || p.y !== n.y)) moves.push({ id: n.id, x: p.x, y: p.y });
  }
  if (moves.length > 0) {
    dispatch({ type: ActionTypes.APPLY_LAYOUT, payload: { moves } });
  }
}


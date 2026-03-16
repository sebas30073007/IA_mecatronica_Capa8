// src/app/positionManager.js
// Gestión de posiciones de nodos: colocación libre, detección y resolución de colisiones.

const GRID      = 130;
const COLS      = 5;
const COLL_DIST = 85; // distancia mínima entre centros (px mundo)

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
 * Resuelve colisiones entre nodos de forma pura (no tiene side effects).
 * @param {Array<{id, x, y}>} nodes
 * @param {string|null} anchorId - ID del nodo que actúa como ancla (no se mueve)
 * @returns {Map<string, {x: number, y: number}>} mapa id → nueva posición
 */
export function resolveCollisions(nodes, anchorId = null) {
  if (nodes.length < 2) {
    const m = new Map();
    for (const n of nodes) m.set(n.id, { x: n.x, y: n.y });
    return m;
  }

  const pos = {};
  for (const n of nodes) pos[n.id] = { x: n.x, y: n.y };

  let changed = true;
  let safety  = 0;
  while (changed && safety < 12) {
    changed = false;
    safety++;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a  = nodes[i], b = nodes[j];
        const pa = pos[a.id], pb = pos[b.id];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= COLL_DIST) continue;
        changed = true;
        const overlap = COLL_DIST - dist;
        const ux = dx / dist, uy = dy / dist;
        if (a.id === anchorId) {
          pos[b.id].x += ux * (overlap + 2);
          pos[b.id].y += uy * (overlap + 2);
        } else if (b.id === anchorId) {
          pos[a.id].x -= ux * (overlap + 2);
          pos[a.id].y -= uy * (overlap + 2);
        } else {
          const push = overlap / 2 + 1;
          pos[a.id].x -= ux * push; pos[a.id].y -= uy * push;
          pos[b.id].x += ux * push; pos[b.id].y += uy * push;
        }
      }
    }
  }

  const result = new Map();
  for (const n of nodes) {
    result.set(n.id, { x: Math.round(pos[n.id].x), y: Math.round(pos[n.id].y) });
  }
  return result;
}

/**
 * Resuelve colisiones y despacha solo los nodos que cambiaron de posición.
 * @param {object} store
 * @param {Function} dispatch
 * @param {object} ActionTypes
 * @param {string|null} anchorId
 */
export function resolveAndDispatch(store, dispatch, ActionTypes, anchorId = null) {
  const nodes = store.getState().graph.nodes;
  if (nodes.length < 2) return;

  // Guard: grafos muy grandes → solo 1 iteración (evitar O(N²) lento)
  const maxIter = nodes.length > 60 ? 1 : 12;
  const tempNodes = nodes.map(n => ({ ...n }));
  const newPos = resolveCollisionsN(tempNodes, anchorId, maxIter);

  for (const n of nodes) {
    const p = newPos.get(n.id);
    if (p && (p.x !== n.x || p.y !== n.y)) {
      dispatch({ type: ActionTypes.MOVE_NODE, payload: { id: n.id, x: p.x, y: p.y } });
    }
  }
}

// Variante interna con maxIter configurable
function resolveCollisionsN(nodes, anchorId, maxIter) {
  const pos = {};
  for (const n of nodes) pos[n.id] = { x: n.x, y: n.y };

  let changed = true;
  let safety  = 0;
  while (changed && safety < maxIter) {
    changed = false;
    safety++;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a  = nodes[i], b = nodes[j];
        const pa = pos[a.id], pb = pos[b.id];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= COLL_DIST) continue;
        changed = true;
        const overlap = COLL_DIST - dist;
        const ux = dx / dist, uy = dy / dist;
        if (a.id === anchorId) {
          pos[b.id].x += ux * (overlap + 2);
          pos[b.id].y += uy * (overlap + 2);
        } else if (b.id === anchorId) {
          pos[a.id].x -= ux * (overlap + 2);
          pos[a.id].y -= uy * (overlap + 2);
        } else {
          const push = overlap / 2 + 1;
          pos[a.id].x -= ux * push; pos[a.id].y -= uy * push;
          pos[b.id].x += ux * push; pos[b.id].y += uy * push;
        }
      }
    }
  }

  const result = new Map();
  for (const n of nodes) {
    result.set(n.id, { x: Math.round(pos[n.id].x), y: Math.round(pos[n.id].y) });
  }
  return result;
}

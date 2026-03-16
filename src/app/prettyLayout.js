// src/app/prettyLayout.js
// Pretty v2 — auto-layout semántico para topologías de red CAPA8.
// Incluye Regla madre: fan-out compacto para switches con muchos endpoints.

// ── Roles visuales y su tier jerárquico ──────────────────────────────────
const ROLE_TIER = {
  "wan":           0,
  "security-edge": 1,
  "edge-routing":  2,
  "core":          3,
  "distribution":  4,
  "access":        5,
  "wireless":      6,
  "service":       6,
  "endpoint":      7,
};

// ── Constantes de espaciado backbone ─────────────────────────────────────
const BASE_HGAP       = 160; // sep. horizontal entre nodos backbone
const BASE_VGAP       = 195; // sep. vertical entre tiers backbone
const COMP_PAD        = 160; // margen entre componentes (modo completo)
const PARK_MARGIN     =  90; // margen sobre zona de aislados

// ── Constantes fan-out (Regla madre) ─────────────────────────────────────
const FANOUT_THRESHOLD      =  5;  // mínimo de hijos hoja para activar fan-out
const MAX_PER_ROW           =  5;  // máximo de endpoints por sub-fila
const ENDPOINT_HGAP         = 120; // sep. horizontal entre endpoints en bloque
const ENDPOINT_SUBROW_VGAP  = 100; // sep. vertical entre sub-filas de endpoints
const FANOUT_VGAP           = 150; // distancia del parent a la primera fila de endpoints
const MIN_NEXT_TIER_GAP     =  60; // margen mínimo entre fondo de bloque y siguiente tier

// ── Distribución balanceada de filas (Regla 6) ───────────────────────────
// Reparte 'count' nodos en 'numRows' filas con diferencia <= 1, filas mayores primero.
function balancedRows(count, numRows) {
  const base  = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, i) => base + (i < extra ? 1 : 0));
}

// ── Ordenación natural de hojas por label (Regla 7) ──────────────────────
function sortLeavesByLabel(ids, nodeMap) {
  return [...ids].sort((a, b) => {
    const la = nodeMap.get(a)?.label || "";
    const lb = nodeMap.get(b)?.label || "";
    const na = parseInt(la.replace(/\D/g, ""), 10);
    const nb = parseInt(lb.replace(/\D/g, ""), 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return la.localeCompare(lb);
  });
}

// ── Altura total del bloque fan-out de un parent ─────────────────────────
function fanoutBlockHeight(leafCount) {
  const numRows = Math.min(4, Math.ceil(leafCount / MAX_PER_ROW));
  return FANOUT_VGAP + (numRows - 1) * ENDPOINT_SUBROW_VGAP;
}

// ── Construcción de adyacencia ────────────────────────────────────────────
function buildAdj(nodes, links) {
  const adj     = new Map();
  const nodeMap = new Map();
  for (const n of nodes) { adj.set(n.id, []); nodeMap.set(n.id, n); }
  for (const l of links) {
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);
  }
  return { adj, nodeMap };
}

// ── Inferencia de rol visual ──────────────────────────────────────────────
function inferRole(node, adj, nodeMap) {
  const nbs    = (adj.get(node.id) || []).map(id => nodeMap.get(id)).filter(Boolean);
  const degree = nbs.length;

  if (degree === 0) return "isolated";

  switch (node.type) {
    case "cloud":    return "wan";
    case "firewall": return "security-edge";

    case "router": {
      const hasWAN = nbs.some(n => n.type === "cloud" || n.type === "firewall");
      return hasWAN ? "edge-routing" : "distribution";
    }

    case "switch": {
      const switchNbs = nbs.filter(n => n.type === "switch");
      const infraNbs  = nbs.filter(n => ["router", "firewall", "cloud"].includes(n.type));
      if (switchNbs.length >= 2) return "core";
      if (switchNbs.length >= 1 && infraNbs.length >= 1) return "core";
      if (infraNbs.length >= 1 || switchNbs.length >= 1) return "distribution";
      return "access";
    }

    case "ap":     return "wireless";
    case "server": return degree >= 2 ? "service" : "endpoint";
    default:       return "endpoint";
  }
}

// ── Detección de componentes conexas ─────────────────────────────────────
function detectComponents(nodes, adj) {
  const visited    = new Set();
  const components = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp = [];
    const q    = [n.id];
    visited.add(n.id);
    while (q.length) {
      const cur = q.shift();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    components.push(comp);
  }
  return components;
}

// ── Ordenación barycenter ─────────────────────────────────────────────────
function barycenterOrder(ids, adj, tempPos, nodeMap) {
  return [...ids].sort((a, b) => {
    const scoreOf = id => {
      const known = (adj.get(id) || []).filter(nb => tempPos.has(nb));
      if (known.length > 0) return known.reduce((s, nb) => s + tempPos.get(nb).x, 0) / known.length;
      return nodeMap.get(id)?.x ?? 0;
    };
    return scoreOf(a) - scoreOf(b);
  });
}

// ── HGAP adaptativo según longitud de label ───────────────────────────────
function adaptiveHGap(ids, nodeMap) {
  const maxLen = Math.max(...ids.map(id => (nodeMap.get(id)?.label?.length || 4)));
  return Math.max(BASE_HGAP, 60 + maxLen * 7);
}

// ── HGAP mínimo para un tier considerando bloques fan-out ─────────────────
// Si el tier contiene parents con fan-out, el gap entre nodos debe ser al
// menos tan ancho como el bloque fan-out más ancho + padding lateral.
function tierHGap(ids, fanoutParents, nodeMap) {
  const base = adaptiveHGap(ids, nodeMap);
  let maxBlockW = 0;
  for (const id of ids) {
    if (fanoutParents.has(id)) {
      const leaves = fanoutParents.get(id);
      const w = (Math.min(leaves.length, MAX_PER_ROW) - 1) * ENDPOINT_HGAP;
      maxBlockW = Math.max(maxBlockW, w);
    }
  }
  return maxBlockW > 0 ? Math.max(base, maxBlockW + 80) : base;
}

// ── Layout de una componente conexa ──────────────────────────────────────
function layoutComponent({ compIds, adj, nodeMap, roles }) {
  const compNodes = compIds.map(id => nodeMap.get(id)).filter(Boolean);

  // Centroide actual — ancla horizontal y aproximación vertical
  const cx = compNodes.reduce((s, n) => s + n.x, 0) / compNodes.length;
  const cy = compNodes.reduce((s, n) => s + n.y, 0) / compNodes.length;

  // Tier semántico por nodo
  const tierOf = new Map();
  for (const n of compNodes) {
    tierOf.set(n.id, ROLE_TIER[roles.get(n.id) || "endpoint"] ?? 7);
  }

  // ── PASO A: detectar parents fan-out y sus hojas ──────────────────────
  const fanoutParents = new Map(); // parentId → [leafId, ...]
  const fanoutLeaves  = new Set();

  for (const n of compNodes) {
    const role = roles.get(n.id);
    // Solo nodos de infraestructura que conectan con endpoints
    if (!["access", "distribution", "core"].includes(role)) continue;

    const leafChildren = (adj.get(n.id) || []).filter(nbId =>
      compIds.includes(nbId) && roles.get(nbId) === "endpoint"
    );

    if (leafChildren.length >= FANOUT_THRESHOLD) {
      fanoutParents.set(n.id, leafChildren);
      leafChildren.forEach(id => fanoutLeaves.add(id));
    }
  }

  // ── PASO B: construir byTier sin hojas fan-out ────────────────────────
  const byTier = new Map();
  for (const n of compNodes) {
    if (fanoutLeaves.has(n.id)) continue; // excluidas del tier estándar
    const t = tierOf.get(n.id);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(n.id);
  }

  // Orden inicial estable: seed desde X previa
  for (const ids of byTier.values()) {
    ids.sort((a, b) => (nodeMap.get(a)?.x ?? 0) - (nodeMap.get(b)?.x ?? 0));
  }

  let sortedTiers = [...byTier.keys()].sort((a, b) => a - b);
  let numTierRows = sortedTiers.length;

  // ── PASO C: Y dinámico por tier (espacio extra para bloques fan-out) ──
  // Step-down entre tier[i] y tier[i+1] considera la altura máxima de
  // los bloques fan-out que cuelgan del tier i.
  const stepDowns = [];
  for (let ri = 0; ri < numTierRows - 1; ri++) {
    const t = sortedTiers[ri];
    let maxFanoutH = 0;
    for (const [pid, leaves] of fanoutParents) {
      if (tierOf.get(pid) === t) {
        maxFanoutH = Math.max(maxFanoutH, fanoutBlockHeight(leaves.length));
      }
    }
    stepDowns.push(Math.max(BASE_VGAP, maxFanoutH + MIN_NEXT_TIER_GAP));
  }

  const totalHeight = stepDowns.reduce((s, d) => s + d, 0);

  // Y de cada tier, centrado verticalmente en cy
  const tierYArr = [];
  let yAcc = cy - totalHeight / 2;
  tierYArr.push(yAcc);
  for (const step of stepDowns) { yAcc += step; tierYArr.push(yAcc); }

  // ── PASO D: posiciones temporales para barycenter ─────────────────────
  const tempPos = new Map();
  const refreshTempPos = () => {
    for (let ri = 0; ri < numTierRows; ri++) {
      const t    = sortedTiers[ri];
      const ids  = byTier.get(t);
      const hgap = tierHGap(ids, fanoutParents, nodeMap);
      const rowW = (ids.length - 1) * hgap;
      const y    = tierYArr[ri];
      ids.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y }));
    }
  };
  refreshTempPos();

  // ── PASO E: barridos barycenter (3 × top-down + bottom-up) ───────────
  for (let pass = 0; pass < 3; pass++) {
    for (let ri = 1; ri < numTierRows; ri++) {
      const t       = sortedTiers[ri];
      const ordered = barycenterOrder(byTier.get(t), adj, tempPos, nodeMap);
      byTier.set(t, ordered);
      const hgap = tierHGap(ordered, fanoutParents, nodeMap);
      const rowW = (ordered.length - 1) * hgap;
      ordered.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y: tierYArr[ri] }));
    }
    for (let ri = numTierRows - 2; ri >= 0; ri--) {
      const t       = sortedTiers[ri];
      const ordered = barycenterOrder(byTier.get(t), adj, tempPos, nodeMap);
      byTier.set(t, ordered);
      const hgap = tierHGap(ordered, fanoutParents, nodeMap);
      const rowW = (ordered.length - 1) * hgap;
      ordered.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y: tierYArr[ri] }));
    }
  }

  // ── PASO F: posiciones finales backbone ───────────────────────────────
  const finalPos = new Map();
  for (let ri = 0; ri < numTierRows; ri++) {
    const t    = sortedTiers[ri];
    const ids  = byTier.get(t);
    const hgap = tierHGap(ids, fanoutParents, nodeMap);
    const rowW = (ids.length - 1) * hgap;
    ids.forEach((id, i) => {
      finalPos.set(id, {
        x: Math.round(cx - rowW / 2 + i * hgap),
        y: Math.round(tierYArr[ri]),
      });
    });
  }

  // ── PASO G: bloques fan-out para cada parent (Regla madre) ───────────
  for (const [parentId, leafIds] of fanoutParents) {
    const parentPos = finalPos.get(parentId);
    if (!parentPos) continue;

    const sorted      = sortLeavesByLabel(leafIds, nodeMap);
    const count       = sorted.length;
    const numFanoutRows = Math.min(4, Math.ceil(count / MAX_PER_ROW));
    const rowSizes    = balancedRows(count, numFanoutRows);

    let blockMinX = Infinity, blockMaxX = -Infinity;
    let nodeIdx   = 0;

    for (let r = 0; r < rowSizes.length; r++) {
      const rowCount  = rowSizes[r];
      const rowW      = (rowCount - 1) * ENDPOINT_HGAP;
      const rowStartX = parentPos.x - rowW / 2;
      const rowY      = parentPos.y + FANOUT_VGAP + r * ENDPOINT_SUBROW_VGAP;

      for (let i = 0; i < rowCount && nodeIdx < sorted.length; i++, nodeIdx++) {
        const x = rowStartX + i * ENDPOINT_HGAP;
        finalPos.set(sorted[nodeIdx], { x: Math.round(x), y: Math.round(rowY) });
        blockMinX = Math.min(blockMinX, x);
        blockMaxX = Math.max(blockMaxX, x);
      }
    }

    // Centrar el parent en su bloque de hijos (Regla extra: switch-centered child block)
    if (isFinite(blockMinX)) {
      const blockCenterX = (blockMinX + blockMaxX) / 2;
      finalPos.set(parentId, { x: Math.round(blockCenterX), y: parentPos.y });
    }
  }

  // Bounding box para empaquetado de componentes (con padding para labels e iconos)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of finalPos.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  // Padding para compensar iconos (48px) y labels que sobresalen del centro del nodo
  minX -= 60; minY -= 20; maxX += 60; maxY += 60;

  return { positions: finalPos, minX, minY, maxX, maxY };
}

// ── Función principal exportada ───────────────────────────────────────────
/**
 * Aplica Pretty v2 al grafo actual.
 */
export function prettyLayout({ graph, pushHistorySnapshot, dispatch, ActionTypes, skipHistory = false }) {
  const { nodes, links } = graph;
  if (nodes.length === 0) return;

  if (!skipHistory) pushHistorySnapshot();

  const { adj, nodeMap } = buildAdj(nodes, links);
  const roles = new Map();
  for (const n of nodes) roles.set(n.id, inferRole(n, adj, nodeMap));

  const isolated  = nodes.filter(n => (adj.get(n.id) || []).length === 0);
  const connected = nodes.filter(n => (adj.get(n.id) || []).length >  0);

  const compIdGroups = detectComponents(connected, adj);

  const compResults = compIdGroups.map(ids => ({
    ids,
    ...layoutComponent({ compIds: ids, adj, nodeMap, roles }),
  }));

  const newPositions = new Map();

  if (compResults.length > 1) {
    // Ordenar de mayor a menor altura para empaquetado greedy
    compResults.sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY));

    // Empaquetado en 2 columnas: cada componente usa su propio ancho real
    const COL_GAP = 200;
    const CANVAS_CX = 700;
    // ancho máximo de cada columna, crece a medida que se asignan clusters
    let col0MaxW = 0, col1MaxW = 0;
    let col0Y = 150, col1Y = 150;

    // Primera pasada: asignar cada cluster a una columna (greedy por altura)
    const assignments = []; // { cr, col }
    for (const cr of compResults) {
      const col = col1Y < col0Y ? 1 : 0;
      const w = cr.maxX - cr.minX || 200;
      const h = cr.maxY - cr.minY || 0;
      if (col === 0) { col0MaxW = Math.max(col0MaxW, w); col0Y += h + COMP_PAD; }
      else           { col1MaxW = Math.max(col1MaxW, w); col1Y += h + COMP_PAD; }
      assignments.push({ cr, col });
    }

    // Centros de columna basados en los anchos reales
    const col0CX = CANVAS_CX - col1MaxW / 2 - COL_GAP / 2;
    const col1CX = CANVAS_CX + col0MaxW / 2 + COL_GAP / 2;
    let col0PackY = 150, col1PackY = 150;

    for (const { cr, col } of assignments) {
      const h = cr.maxY - cr.minY || 0;
      const w = cr.maxX - cr.minX || 0;
      const colCX  = col === 0 ? col0CX : col1CX;
      const packY  = col === 0 ? col0PackY : col1PackY;
      const offsetX = Math.round(colCX - (cr.minX + w / 2));
      const offsetY = Math.round(packY - cr.minY);
      for (const [id, pos] of cr.positions) {
        newPositions.set(id, { x: pos.x + offsetX, y: pos.y + offsetY });
      }
      if (col === 0) col0PackY += h + COMP_PAD;
      else           col1PackY += h + COMP_PAD;
    }
  } else {
    for (const cr of compResults) {
      for (const [id, pos] of cr.positions) newPositions.set(id, pos);
    }
  }

  // Aparcamiento de nodos aislados en banda inferior
  if (isolated.length > 0) {
    let parkY = 150;
    if (newPositions.size > 0) {
      parkY = Math.max(...[...newPositions.values()].map(p => p.y)) + PARK_MARGIN + BASE_VGAP;
    }
    const rowW = (isolated.length - 1) * BASE_HGAP;
    isolated.forEach((n, i) => {
      newPositions.set(n.id, {
        x: Math.round(700 - rowW / 2 + i * BASE_HGAP),
        y: Math.round(parkY),
      });
    });
  }

  // Normalización final: garantizar coordenadas siempre positivas (minX ≥ 150, minY ≥ 150)
  // Esto evita que el SVG (overflow:hidden 0-4000) corte los enlaces.
  if (newPositions.size > 0) {
    let gMinX = Infinity, gMinY = Infinity;
    for (const p of newPositions.values()) {
      gMinX = Math.min(gMinX, p.x);
      gMinY = Math.min(gMinY, p.y);
    }
    const shiftX = gMinX < 150 ? 150 - gMinX : 0;
    const shiftY = gMinY < 150 ? 150 - gMinY : 0;
    if (shiftX !== 0 || shiftY !== 0) {
      for (const [id, p] of newPositions) {
        newPositions.set(id, { x: p.x + shiftX, y: p.y + shiftY });
      }
    }
  }

  // Despachar solo nodos que realmente cambiaron
  for (const n of nodes) {
    const p = newPositions.get(n.id);
    if (p && (p.x !== n.x || p.y !== n.y)) {
      dispatch({ type: ActionTypes.MOVE_NODE, payload: { id: n.id, x: p.x, y: p.y } });
    }
  }
}

// ── Exportar umbral para uso en renderer ──────────────────────────────────
export { FANOUT_THRESHOLD };

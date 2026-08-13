// src/app/layout/groups.js
//
// Grupos semánticos y las formas con que se dibujan.
//
// Un "grupo" es un conjunto de hojas que cuelgan del mismo nodo backbone y
// que se leen como una familia: las PC de un laboratorio, los AGV de una
// célula, los servidores de una DMZ. Detectarlos es lo que evita que 30
// equipos se acomoden como 30 decisiones independientes.

import { sortByLabel, isRedundantGroup } from "./topology.js";
import {
  GROUP_HGAP, GROUP_VGAP, GROUP_BELOW_GAP, SIDE_OFFSET,
} from "./geometry.js";

// ─── Umbrales ────────────────────────────────────────────────────────────
export const REPEAT_GROUP_MIN = 3;  // nodos con el mismo prefijo para formar grupo
export const FANOUT_THRESHOLD = 4;  // hojas para considerar abanico (lo lee renderer.js)
export const MAX_GRID_COLS    = 6;  // columnas máximas de una matriz
export const ARC_RADIUS       = 130;

/** Reparte `count` elementos en `numRows` filas lo más parejas posible. */
function balancedRows(count, numRows) {
  const base  = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, i) => base + (i < extra ? 1 : 0));
}

// ─── Detección de grupos ─────────────────────────────────────────────────

/**
 * Subgrupos que comparten prefijo + sufijo numérico (PC1..PCn, UR3-1..UR3-8).
 * @returns {Array<{prefix:string, ids:string[]}>}
 */
export function extractPrefixGroups(ids, nodeMap) {
  const prefixMap = new Map();
  for (const id of ids) {
    const label = nodeMap.get(id)?.label || "";
    const m = label.match(/^(.+?)(\d+)$/);
    if (m) {
      const key = m[1].toLowerCase();
      if (!prefixMap.has(key)) prefixMap.set(key, []);
      prefixMap.get(key).push(id);
    }
  }
  return [...prefixMap.entries()]
    .filter(([, gids]) => gids.length >= REPEAT_GROUP_MIN)
    .map(([prefix, gids]) => ({ prefix, ids: sortByLabel(gids, nodeMap) }));
}

/**
 * Elige la forma de un conjunto de hijos.
 * Modos: 'grid' | 'arc' | 'fanout' | 'chain' | 'bus-side' | 'pair-lanes'
 */
export function chooseLayoutMode(childIds, parentId, nodeMap, roles, adj = new Map()) {
  const count = childIds.length;
  const types = childIds.map(id => nodeMap.get(id)?.type || "pc");
  const allSameType = new Set(types).size === 1;

  // Inalámbricos → arco, que da sensación de cobertura
  const parentType = nodeMap.get(parentId)?.type;
  if (parentType === "ap") return "arc";
  const wirelessCount = childIds.filter(id => ["ap"].includes(nodeMap.get(id)?.type) || roles.get(id) === "wireless").length;
  if (wirelessCount >= 3 || (wirelessCount >= 1 && count <= 6)) return "arc";

  // Muchos nodos homogéneos → matriz (laboratorios, líneas de PLC, flotas)
  if (count >= 6 && allSameType) return "grid";
  if (count >= 8) return "grid";

  // Nodos industriales en línea → bus lateral
  if (count >= 4 && types.every(t => ["plc","ur3","agv"].includes(t))) return "bus-side";

  // Cadena de infraestructura
  if (allSameType && ["router","switch"].includes(types[0]) && count >= 3) return "chain";

  // Par o cuarteto redundante — por topología, no por nombre
  if ([2, 4].includes(count) && allSameType && isRedundantGroup(childIds, adj, nodeMap)) return "pair-lanes";

  return "fanout";
}

/**
 * Todos los grupos de un componente: por cada nodo de la espina, sus hijos
 * que no son espina, partidos primero por prefijo y luego por tipo.
 *
 * @param {string[]} compIds
 * @param {Map} adj
 * @param {Map} nodeMap
 * @param {Map} roles
 * @param {Map} zones
 * @param {Set<string>} spine - qué nodos forman la espina de este componente.
 *        Se recibe en vez de derivarse de ROLE_TIER porque un componente sin
 *        infraestructura reconocible usa todos sus nodos como espina.
 * @returns {{groups:Array, ungrouped:Set<string>}}
 */
export function detectSemanticGroups(compIds, adj, nodeMap, roles, zones, spine) {
  const groups          = [];
  const assignedToGroup = new Set();

  const isBackbone = id => spine.has(id);

  // Marca los grupos de solo servidores con su zona (dmz / services).
  const tagGroup = (group) => {
    const allServers = group.nodeIds.every(id => nodeMap.get(id)?.type === "server");
    if (allServers) {
      const isDmz = group.nodeIds.some(id => zones.get(id) === "dmz");
      group.zone = isDmz ? "dmz" : "services";
    }
    return group;
  };

  // Recorrido canónico por etiqueta: `compIds` viene en orden de BFS, que
  // depende de cómo esté escrito el JSON. El orden en que se visitan las
  // anclas decide qué grupo reclama antes a un hijo compartido y en qué
  // orden se insertan las posiciones, así que tiene que ser estable.
  for (const parentId of sortByLabel(compIds, nodeMap)) {
    if (!isBackbone(parentId)) continue;

    const children = (adj.get(parentId) || []).filter(nbId =>
      compIds.includes(nbId) && !isBackbone(nbId) && !assignedToGroup.has(nbId)
    );
    if (children.length === 0) continue;

    // Subgrupos por prefijo (PC1..PCn)
    const prefixGroups = extractPrefixGroups(children, nodeMap);
    const usedInPrefix = new Set(prefixGroups.flatMap(g => g.ids));

    for (const pg of prefixGroups) {
      const mode = chooseLayoutMode(pg.ids, parentId, nodeMap, roles, adj);
      groups.push(tagGroup({ nodeIds: pg.ids, mode, anchorId: parentId, label: pg.prefix }));
      pg.ids.forEach(id => assignedToGroup.add(id));
    }

    // El resto, por tipo
    const remaining = children.filter(id => !usedInPrefix.has(id));
    if (remaining.length === 0) continue;

    const byType = new Map();
    for (const id of remaining) {
      const t = nodeMap.get(id)?.type || "pc";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(id);
    }

    if (byType.size === 1) {
      const allIds = sortByLabel(remaining, nodeMap);
      groups.push(tagGroup({ nodeIds: allIds, mode: chooseLayoutMode(allIds, parentId, nodeMap, roles, adj), anchorId: parentId }));
      allIds.forEach(id => assignedToGroup.add(id));
    } else {
      // Tipos mezclados: separar los que llegan al umbral, el resto en uno solo.
      //
      // El recorrido va por nombre de tipo y no por orden de inserción del
      // Map: ese orden lo hereda de `adj`, que a su vez lo hereda del array
      // `links` del JSON. Sin esto, el mismo grafo con los enlaces escritos
      // en otro orden produce un layout distinto.
      let mixedGroup = [];
      for (const t of [...byType.keys()].sort()) {
        const typeIds = byType.get(t);
        if (typeIds.length >= REPEAT_GROUP_MIN) {
          const sids = sortByLabel(typeIds, nodeMap);
          groups.push(tagGroup({ nodeIds: sids, mode: chooseLayoutMode(sids, parentId, nodeMap, roles, adj), anchorId: parentId }));
          sids.forEach(id => assignedToGroup.add(id));
        } else {
          mixedGroup = mixedGroup.concat(typeIds);
        }
      }
      if (mixedGroup.length > 0) {
        // Único grupo que se empujaba sin ordenar. El resto ya pasaba por
        // sortByLabel; era un descuido, no una decisión.
        const mids = sortByLabel(mixedGroup, nodeMap);
        groups.push(tagGroup({ nodeIds: mids, mode: chooseLayoutMode(mids, parentId, nodeMap, roles, adj), anchorId: parentId }));
        mids.forEach(id => assignedToGroup.add(id));
      }
    }
  }

  const ungrouped = new Set(compIds.filter(id => !assignedToGroup.has(id) && !isBackbone(id)));
  return { groups, ungrouped };
}

// ─── Formas ──────────────────────────────────────────────────────────────
// `side`: 'below' | 'left' | 'right'

/** Matriz de hasta MAX_GRID_COLS columnas. Laboratorios, flotas, granjas. */
function layoutGrid(nodeIds, anchorPos, side) {
  const count = nodeIds.length;
  const cols  = Math.min(MAX_GRID_COLS, Math.ceil(Math.sqrt(count)));
  const rows  = Math.ceil(count / cols);
  const totalW = (cols - 1) * GROUP_HGAP;
  const totalH = (rows - 1) * GROUP_VGAP;

  let startX, startY;
  if (side === "left") {
    startX = anchorPos.x - totalW - SIDE_OFFSET;
    startY = anchorPos.y - totalH / 2;
  } else if (side === "right") {
    startX = anchorPos.x + SIDE_OFFSET;
    startY = anchorPos.y - totalH / 2;
  } else {
    startX = anchorPos.x - totalW / 2;
    startY = anchorPos.y + GROUP_BELOW_GAP;
  }

  const positions = new Map();
  nodeIds.forEach((id, i) => {
    positions.set(id, {
      x: Math.round(startX + (i % cols) * GROUP_HGAP),
      y: Math.round(startY + Math.floor(i / cols) * GROUP_VGAP),
    });
  });
  return positions;
}

/** Abanico: filas parejas de hasta 5. Conjuntos pequeños y medianos. */
function layoutFanout(nodeIds, anchorPos, side) {
  const count = nodeIds.length;
  // Hasta 5 hijos van SIEMPRE en una sola fila.
  //
  // Antes era `min(5, ceil(sqrt(count)))`, que con 3 hijos da 2 y los
  // partía en dos filas. En la práctica el abanico casi nunca producía una
  // fila única: 3 y 4 salían en dos filas y 5 en 3+2. Eso inventaba una
  // profundidad visual que la topología no tiene — tres PC colgando de un
  // switch son tres hermanas, no una jerarquía de dos niveles.
  const maxPerRow = count <= 5 ? count : Math.min(5, Math.ceil(Math.sqrt(count)));
  const numRows    = Math.ceil(count / maxPerRow);
  const rowSizes   = balancedRows(count, numRows);
  const totalH     = (numRows - 1) * GROUP_VGAP;

  let baseX, baseY;
  if (side === "left") {
    const maxW = (Math.min(5, count) - 1) * GROUP_HGAP;
    baseX = anchorPos.x - maxW - SIDE_OFFSET;
    baseY = anchorPos.y - totalH / 2;
  } else if (side === "right") {
    baseX = anchorPos.x + SIDE_OFFSET;
    baseY = anchorPos.y - totalH / 2;
  } else {
    baseX = anchorPos.x;
    baseY = anchorPos.y + GROUP_BELOW_GAP;
  }

  const positions = new Map();
  let idx = 0;
  for (let r = 0; r < rowSizes.length; r++) {
    const rowCount = rowSizes[r];
    const rowW     = (rowCount - 1) * GROUP_HGAP;
    const rowStartX = (side === "left" || side === "right")
      ? baseX
      : baseX - rowW / 2;
    const rowY = baseY + r * GROUP_VGAP;
    for (let c = 0; c < rowCount && idx < nodeIds.length; c++, idx++) {
      positions.set(nodeIds[idx], {
        x: Math.round(rowStartX + c * GROUP_HGAP),
        y: Math.round(rowY),
      });
    }
  }
  return positions;
}

/** Arco: semicírculo bajo el ancla. Inalámbricos y móviles. */
function layoutArc(nodeIds, anchorPos) {
  const count     = nodeIds.length;
  const positions = new Map();
  if (count === 0) return positions;

  const radius    = Math.max(ARC_RADIUS, 30 + count * 25);
  const maxSpread = Math.min(Math.PI * 0.80, count * 0.30);

  nodeIds.forEach((id, i) => {
    const angle = count > 1 ? -maxSpread + (i / (count - 1)) * 2 * maxSpread : 0;
    positions.set(id, {
      x: Math.round(anchorPos.x + radius * Math.sin(angle)),
      y: Math.round(anchorPos.y + GROUP_BELOW_GAP + radius * 0.18 * (1 - Math.cos(angle))),
    });
  });
  return positions;
}

/** Cadena: secuencia lineal. Switches o routers en serie. */
function layoutChain(nodeIds, anchorPos, side) {
  const positions = new Map();
  nodeIds.forEach((id, i) => {
    if (side === "left") {
      positions.set(id, { x: Math.round(anchorPos.x - SIDE_OFFSET - i * GROUP_HGAP), y: Math.round(anchorPos.y) });
    } else if (side === "right") {
      positions.set(id, { x: Math.round(anchorPos.x + SIDE_OFFSET + i * GROUP_HGAP), y: Math.round(anchorPos.y) });
    } else {
      positions.set(id, { x: Math.round(anchorPos.x), y: Math.round(anchorPos.y + GROUP_BELOW_GAP + i * GROUP_VGAP) });
    }
  });
  return positions;
}

/** Bus lateral: columna vertical al costado. Muchos dispositivos OT. */
function layoutBusSide(nodeIds, anchorPos, side) {
  const positions = new Map();
  const totalH    = (nodeIds.length - 1) * GROUP_VGAP;
  const startY    = anchorPos.y - totalH / 2;
  const offsetX   = side === "left" ? -SIDE_OFFSET : SIDE_OFFSET;

  nodeIds.forEach((id, i) => {
    positions.set(id, {
      x: Math.round(anchorPos.x + offsetX),
      y: Math.round(startY + i * GROUP_VGAP),
    });
  });
  return positions;
}

/** Dos carriles: estructuras redundantes o duales. */
function layoutPairLanes(nodeIds, anchorPos, side) {
  const half      = Math.ceil(nodeIds.length / 2);
  const positions = new Map();

  if (side === "left" || side === "right") {
    const signX = side === "left" ? -1 : 1;
    nodeIds.forEach((id, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      positions.set(id, {
        x: Math.round(anchorPos.x + signX * (SIDE_OFFSET + col * GROUP_HGAP)),
        y: Math.round(anchorPos.y + (row - (half - 1) / 2) * GROUP_VGAP),
      });
    });
  } else {
    nodeIds.forEach((id, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      positions.set(id, {
        x: Math.round(anchorPos.x + (col - 0.5) * GROUP_HGAP * 1.4),
        y: Math.round(anchorPos.y + GROUP_BELOW_GAP + row * GROUP_VGAP),
      });
    });
  }
  return positions;
}

/** Despacha a la forma elegida. */
export function applyGroupLayout(group, anchorPos, side) {
  const { nodeIds, mode } = group;
  switch (mode) {
    case "grid":        return layoutGrid(nodeIds, anchorPos, side);
    case "arc":         return layoutArc(nodeIds, anchorPos);
    case "chain":       return layoutChain(nodeIds, anchorPos, side);
    case "bus-side":    return layoutBusSide(nodeIds, anchorPos, side);
    case "pair-lanes":  return layoutPairLanes(nodeIds, anchorPos, side);
    case "fanout":
    default:            return layoutFanout(nodeIds, anchorPos, side);
  }
}

/**
 * Ancho aproximado de un grupo sin llegar a colocarlo.
 * Es una estimación aparte de la geometría real de cada forma: pueden
 * divergir, y por eso solo se usa para repartir el espacio, no para medir.
 */
export function estimateGroupWidth(group) {
  const count = group.nodeIds.length;
  if (group.mode === "grid") {
    const cols = Math.min(MAX_GRID_COLS, Math.ceil(Math.sqrt(count)));
    return (cols - 1) * GROUP_HGAP + 60;
  }
  if (group.mode === "arc") {
    return Math.max(ARC_RADIUS * 2, count * 28);
  }
  if (group.mode === "bus-side") return GROUP_HGAP;
  if (group.mode === "chain") return count * GROUP_HGAP;
  const maxPerRow = Math.min(5, count);
  return (maxPerRow - 1) * GROUP_HGAP + 60;
}

/** Alto que ocupa un grupo colocado debajo de su ancla. */
export function estimateGroupBelowHeight(group) {
  const count = group.nodeIds.length;
  if (group.mode === "grid") {
    const rows = Math.ceil(count / Math.min(MAX_GRID_COLS, Math.ceil(Math.sqrt(count))));
    return GROUP_BELOW_GAP + rows * GROUP_VGAP;
  }
  return GROUP_BELOW_GAP + Math.ceil(count / 5) * GROUP_VGAP;
}

/**
 * Reparte los grupos de un mismo ancla entre abajo, izquierda y derecha.
 * Con más de 3 repite el ciclo — sin comprobar que no se pisen, lo cual
 * queda para la resolución de colisiones.
 */
export function assignGroupSides(groups, anchorConHijos = false) {
  const count = groups.length;
  if (count === 0) return [];
  if (count === 1) {
    // Un grupo suelto va debajo… salvo que sea UN SOLO NODO y el ancla siga
    // bajando por la espina. Ahí "debajo" significa METERSE EN EL TRONCO: el
    // servidor de un router acaba dibujado entre el router y el switch al
    // que baja, se lee como un salto más del recorrido y empuja el diagrama
    // entero hacia abajo. A un lado se lee como lo que es, una rama.
    //
    // La condición de UN SOLO NODO no es un detalle. Un grupo de dos o más
    // se coloca en fila, y una fila apartada a un lado queda alineada con su
    // ancla: el enlace al nodo más lejano pasa por encima del más cercano.
    // Centrado debajo, los enlaces divergen en abanico y eso no ocurre.
    if (anchorConHijos && groups[0].nodeIds.length === 1) {
      return [groups[0].preferredSide || "left"];
    }
    return [groups[0].preferredSide || "below"];
  }
  if (count === 2) return ["left", "right"];
  if (count === 3) return ["left", "below", "right"];
  const sides = ["left", "below", "right"];
  const result = [];
  for (let i = 0; i < count; i++) result.push(sides[i % sides.length]);
  return result;
}

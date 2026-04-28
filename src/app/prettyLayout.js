// src/app/prettyLayout.js
// Pretty v3 — Organic Hierarchical Layout for CAPA8 Network Topologies.
//
// 10-PHASE ALGORITHM:
//  1. Classify roles        → inferRole (type + neighborhood heuristics)
//  2. Detect backbone       → infrastructure spine, laid out tier-by-tier
//  3. Detect groups         → prefix-repeat, common-parent, type-cluster
//  4. Choose layout modes   → grid/arc/fanout/chain/bus-side/pair-lanes
//  5. Place backbone        → hierarchical Y tiers + barycenter X sweeps
//  6. Assign group sides    → below / left / right per anchor
//  7. Place group children  → apply chosen layout mode per group
//  8. Collision resolution  → iterative circle push-apart (backbone fixed)
//  9. Pack components       → bounding-box greedy packing
// 10. Normalize             → shift to ensure minX/minY >= 150

// ─── Exported layout constants (configurable) ────────────────────────────────
export const MIN_NODE_GAP       = 110;  // minimum center-to-center distance
export const MIN_CLUSTER_GAP    =  70;  // minimum bounding-box margin between groups
export const LABEL_PADDING      =  45;  // extra padding for label bounding box
export const EDGE_LABEL_PADDING =  28;  // reserved zone near link labels
export const MAX_GRID_COLS      =   6;  // max columns in grid layout
export const ARC_RADIUS         = 130;  // radius for arc layout
export const MAX_COLLISION_ITER =  35;  // max collision-resolution passes
export const REPEAT_GROUP_MIN   =   3;  // min nodes with same prefix to form a named group
export const FANOUT_THRESHOLD   =   4;  // min leaf children to activate group layout

// ─── Internal spacing constants ──────────────────────────────────────────────
const BASE_HGAP         = 170;  // horizontal gap between backbone nodes per tier
const BASE_VGAP         = 215;  // vertical gap between tiers
const COMP_PAD          = 190;  // padding between connected components
const PARK_MARGIN       =  90;  // margin above isolated-node parking band
const GROUP_HGAP        = 120;  // horizontal spacing inside a group
const GROUP_VGAP        = 115;  // vertical spacing between rows in a group
const GROUP_BELOW_GAP   = 155;  // Y distance from backbone node to first group row
const SIDE_OFFSET       = 145;  // X distance from anchor to side group edge
const ORGANIC_PULL      = 0.40; // fraction to shift single-node tiers toward neighbor centroid

// ─── Role → tier mapping ──────────────────────────────────────────────────────
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

// ─── Utility: balanced row distribution ──────────────────────────────────────
function balancedRows(count, numRows) {
  const base  = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, i) => base + (i < extra ? 1 : 0));
}

// ─── Utility: natural sort by label (PC1 < PC2 < PC10) ───────────────────────
function sortByLabel(ids, nodeMap) {
  return [...ids].sort((a, b) => {
    const la = nodeMap.get(a)?.label || "";
    const lb = nodeMap.get(b)?.label || "";
    const na = parseInt(la.replace(/\D/g, ""), 10);
    const nb = parseInt(lb.replace(/\D/g, ""), 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return la.localeCompare(lb);
  });
}

// ─── Utility: adjacency + nodeMap build ──────────────────────────────────────
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

// ─── Phase 1: Role inference ──────────────────────────────────────────────────
function inferRole(node, adj, nodeMap) {
  const nbs    = (adj.get(node.id) || []).map(id => nodeMap.get(id)).filter(Boolean);
  const degree = nbs.length;
  if (degree === 0) return "isolated";

  switch (node.type) {
    case "cloud":    return "wan";
    case "firewall": return "security-edge";

    case "router": {
      const hasWAN = nbs.some(n => n.type === "cloud" || n.type === "firewall");
      if (hasWAN) return "edge-routing";
      return nbs.some(n => n.type === "switch") ? "core" : "distribution";
    }

    case "switch": {
      const switchNbs = nbs.filter(n => n.type === "switch");
      const infraNbs  = nbs.filter(n => ["router","firewall","cloud"].includes(n.type));
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

// ─── Component detection ─────────────────────────────────────────────────────
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

// ─── Barycenter ordering (kept from v2) ──────────────────────────────────────
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

// ─── Adaptive H-gap based on label length ────────────────────────────────────
function adaptiveHGap(ids, nodeMap) {
  const maxLen = Math.max(...ids.map(id => (nodeMap.get(id)?.label?.length || 4)));
  return Math.max(BASE_HGAP, 60 + maxLen * 7);
}

// ─── Phase 3: Semantic group detection ───────────────────────────────────────

// Extract subgroups sharing a label prefix + numeric suffix (PC1..PCn, UR3-1..UR3-8).
// Returns [{prefix, ids[]}] sorted naturally by suffix number.
function extractPrefixGroups(ids, nodeMap) {
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

// Heuristic: pick layout mode for a set of children under a parent.
// Modes: 'grid' | 'arc' | 'fanout' | 'chain' | 'bus-side' | 'pair-lanes'
function chooseLayoutMode(childIds, parentId, nodeMap, roles) {
  const count = childIds.length;
  const types = childIds.map(id => nodeMap.get(id)?.type || "pc");
  const allSameType = new Set(types).size === 1;

  // Wireless/AP children → arc gives organic cloud-like feel
  const parentType = nodeMap.get(parentId)?.type;
  if (parentType === "ap") return "arc";
  const wirelessCount = childIds.filter(id => ["ap"].includes(nodeMap.get(id)?.type) || roles.get(id) === "wireless").length;
  if (wirelessCount >= 3 || (wirelessCount >= 1 && count <= 6)) return "arc";

  // Many homogeneous nodes → grid (computer labs, PLC lines, robot fleets)
  if (count >= 6 && allSameType) return "grid";
  if (count >= 8) return "grid";

  // Industrial/OT nodes in line → bus-side
  if (count >= 4 && types.every(t => ["plc","ur3","agv","server"].includes(t))) return "bus-side";

  // Infrastructure chain (e.g. daisy-chain of routers/switches)
  if (allSameType && ["router","switch"].includes(types[0]) && count >= 3) return "chain";

  // Redundant pair
  if ([2, 4].includes(count) && allSameType) return "pair-lanes";

  // Default: compact symmetric fanout
  return "fanout";
}

// Detect all semantic groups in a component.
// Strategy: for each backbone node, collect its non-backbone children,
// split into prefix subgroups first, then by type.
// Returns { groups: [{nodeIds, mode, anchorId, label?}], ungrouped: Set<id> }
function detectSemanticGroups(compIds, adj, nodeMap, roles) {
  const groups          = [];
  const assignedToGroup = new Set();

  const isBackbone = id => (ROLE_TIER[roles.get(id)] ?? 7) <= 5;

  for (const parentId of compIds) {
    if (!isBackbone(parentId)) continue;

    const children = (adj.get(parentId) || []).filter(nbId =>
      compIds.includes(nbId) && !isBackbone(nbId) && !assignedToGroup.has(nbId)
    );
    if (children.length === 0) continue;

    // Phase 3a: prefix subgroups (PC1..PCn style)
    const prefixGroups = extractPrefixGroups(children, nodeMap);
    const usedInPrefix = new Set(prefixGroups.flatMap(g => g.ids));

    for (const pg of prefixGroups) {
      const mode = chooseLayoutMode(pg.ids, parentId, nodeMap, roles);
      groups.push({ nodeIds: pg.ids, mode, anchorId: parentId, label: pg.prefix });
      pg.ids.forEach(id => assignedToGroup.add(id));
    }

    // Phase 3b: remaining children → subgroup by type
    const remaining = children.filter(id => !usedInPrefix.has(id));
    if (remaining.length === 0) continue;

    const byType = new Map();
    for (const id of remaining) {
      const t = nodeMap.get(id)?.type || "pc";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(id);
    }

    if (byType.size === 1) {
      // All same type — one group
      const allIds = sortByLabel(remaining, nodeMap);
      groups.push({ nodeIds: allIds, mode: chooseLayoutMode(allIds, parentId, nodeMap, roles), anchorId: parentId });
      allIds.forEach(id => assignedToGroup.add(id));
    } else {
      // Mixed types: separate each type if it reaches threshold, else one mixed group
      let mixedGroup = [];
      for (const [, typeIds] of byType) {
        if (typeIds.length >= REPEAT_GROUP_MIN) {
          const sids = sortByLabel(typeIds, nodeMap);
          groups.push({ nodeIds: sids, mode: chooseLayoutMode(sids, parentId, nodeMap, roles), anchorId: parentId });
          sids.forEach(id => assignedToGroup.add(id));
        } else {
          mixedGroup = mixedGroup.concat(typeIds);
        }
      }
      if (mixedGroup.length > 0) {
        groups.push({ nodeIds: mixedGroup, mode: chooseLayoutMode(mixedGroup, parentId, nodeMap, roles), anchorId: parentId });
        mixedGroup.forEach(id => assignedToGroup.add(id));
      }
    }
  }

  const ungrouped = new Set(compIds.filter(id => !assignedToGroup.has(id) && !isBackbone(id)));
  return { groups, ungrouped };
}

// ─── Phase 7: Group layout implementations ───────────────────────────────────

// 'side' parameter: 'below' | 'left' | 'right'

// Grid layout: rows of up to MAX_GRID_COLS columns.
// For large homogeneous sets (computer labs, PC grids, robot fleets).
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

// Fanout layout: balanced rows, max 5 per row.
// For small-to-medium mixed child sets (2–7 nodes).
function layoutFanout(nodeIds, anchorPos, side) {
  const count      = nodeIds.length;
  const maxPerRow  = Math.min(5, Math.ceil(Math.sqrt(count)));
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

// Arc layout: semicircle below anchor.
// For wireless endpoints, mobile devices, APs — feels organic.
function layoutArc(nodeIds, anchorPos) {
  const count     = nodeIds.length;
  const positions = new Map();
  if (count === 0) return positions;

  const radius   = Math.max(ARC_RADIUS, 30 + count * 25);
  // Spread from -maxSpread to +maxSpread, measured from straight-down axis.
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

// Chain layout: linear horizontal or vertical sequence.
// For infrastructure sequences, daisy-chain switches/routers.
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

// Bus-side layout: vertical column beside anchor.
// For many OT devices hanging off a PLC or switch bus.
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

// Pair-lanes: two balanced columns (for redundant/dual structures).
function layoutPairLanes(nodeIds, anchorPos, side) {
  const half      = Math.ceil(nodeIds.length / 2);
  const positions = new Map();

  if (side === "left" || side === "right") {
    // Stack two columns horizontally off the side
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
    // Two columns centered below anchor
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

// Dispatch to the appropriate layout function.
function applyGroupLayout(group, anchorPos, side) {
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

// Estimate the bounding box width of a group (without actually laying it out).
function estimateGroupWidth(group) {
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

// Assign placement sides to multiple groups under the same anchor.
// Prefers: below (single), left+right (2), left+below+right (3), then wrap.
function assignGroupSides(count) {
  if (count === 0) return [];
  if (count === 1) return ["below"];
  if (count === 2) return ["left", "right"];
  if (count === 3) return ["left", "below", "right"];
  // For 4+, use below + right columns (avoid making layout too wide)
  const sides = ["left", "below", "right"];
  const result = [];
  for (let i = 0; i < count; i++) result.push(sides[i % sides.length]);
  return result;
}

// ─── Phase 8: Collision resolution ───────────────────────────────────────────
// Treats each node as a circle of radius MIN_NODE_GAP/2.
// Pushes overlapping pairs apart until all clear or max iterations reached.
// fixedIds: nodes that should not move (backbone nodes).
function resolveCollisions(positions, fixedIds = new Set()) {
  const ids = [...positions.keys()];
  const R   = MIN_NODE_GAP;

  for (let iter = 0; iter < MAX_COLLISION_ITER; iter++) {
    let anyMove = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ia = ids[i], ib = ids[j];
        const pa = positions.get(ia);
        const pb = positions.get(ib);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < R && dist > 0.5) {
          const overlap = (R - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          anyMove = true;
          if (!fixedIds.has(ia)) positions.set(ia, { x: pa.x - nx * overlap, y: pa.y - ny * overlap });
          if (!fixedIds.has(ib)) positions.set(ib, { x: pb.x + nx * overlap, y: pb.y + ny * overlap });
        } else if (dist <= 0.5) {
          // Exact overlap — nudge apart deterministically
          if (!fixedIds.has(ib)) positions.set(ib, { x: pb.x + R, y: pb.y });
          anyMove = true;
        }
      }
    }
    if (!anyMove) break;
  }

  // Round all positions to integers
  for (const [id, p] of positions) {
    positions.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  }
}

// ─── Main per-component layout ────────────────────────────────────────────────
function layoutComponent({ compIds, adj, nodeMap, roles }) {
  // Fixed canonical center — never derived from current node positions so the
  // layout is idempotent (pressing O twice gives the same result).
  const cx = 700;
  const cy = 400;

  // ── Phase 2: separate backbone from leaf nodes ────────────────────────
  const isBackbone = id => (ROLE_TIER[roles.get(id)] ?? 7) <= 5;
  const backboneIds = compIds.filter(isBackbone);

  // ── Phase 3 & 4: detect semantic groups ──────────────────────────────
  const { groups, ungrouped } = detectSemanticGroups(compIds, adj, nodeMap, roles);

  // Index groups by anchor
  const groupsByAnchor = new Map(); // anchorId → [group, ...]
  for (const g of groups) {
    if (!groupsByAnchor.has(g.anchorId)) groupsByAnchor.set(g.anchorId, []);
    groupsByAnchor.get(g.anchorId).push(g);
  }

  // ── Phase 5: backbone tier layout ────────────────────────────────────
  const tierOf = new Map();
  for (const id of backboneIds) {
    tierOf.set(id, ROLE_TIER[roles.get(id)] ?? 7);
  }
  const byTier = new Map();
  for (const id of backboneIds) {
    const t = tierOf.get(id);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(id);
  }
  // Canonical label sort — position-independent so order is stable across calls.
  for (const t of byTier.keys()) {
    byTier.set(t, sortByLabel(byTier.get(t), nodeMap));
  }

  const sortedTiers = [...byTier.keys()].sort((a, b) => a - b);

  // Compute Y step-downs: give extra space to tiers whose nodes have groups below them.
  // Groups placed to the side don't need extra vertical space.
  function estimateGroupBelowHeight(g) {
    const count = g.nodeIds.length;
    if (g.mode === "grid") {
      const rows = Math.ceil(count / Math.min(MAX_GRID_COLS, Math.ceil(Math.sqrt(count))));
      return GROUP_BELOW_GAP + rows * GROUP_VGAP;
    }
    return GROUP_BELOW_GAP + Math.ceil(count / 5) * GROUP_VGAP;
  }

  const stepDowns = [];
  for (let ri = 0; ri < sortedTiers.length - 1; ri++) {
    const t = sortedTiers[ri];
    let maxBelowH = 0;
    for (const id of (byTier.get(t) || [])) {
      const gs = (groupsByAnchor.get(id) || []);
      const sides = assignGroupSides(gs.length);
      gs.forEach((g, gi) => {
        if (sides[gi] === "below") {
          maxBelowH = Math.max(maxBelowH, estimateGroupBelowHeight(g));
        }
      });
    }
    stepDowns.push(Math.max(BASE_VGAP, maxBelowH + 80));
  }

  const totalH = stepDowns.reduce((s, d) => s + d, 0);
  const tierYArr = [];
  let yAcc = cy - totalH / 2;
  tierYArr.push(yAcc);
  for (const step of stepDowns) { yAcc += step; tierYArr.push(yAcc); }

  // Backbone X: seed from previous positions, then barycenter sweeps.
  const tempPos = new Map();
  const refreshTempPos = () => {
    for (let ri = 0; ri < sortedTiers.length; ri++) {
      const t    = sortedTiers[ri];
      const ids  = byTier.get(t);
      const hgap = adaptiveHGap(ids, nodeMap);
      const rowW = (ids.length - 1) * hgap;
      ids.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y: tierYArr[ri] }));
    }
  };
  refreshTempPos();

  for (let pass = 0; pass < 3; pass++) {
    for (let ri = 1; ri < sortedTiers.length; ri++) {
      const t  = sortedTiers[ri];
      const ordered = barycenterOrder(byTier.get(t), adj, tempPos, nodeMap);
      byTier.set(t, ordered);
      const hgap = adaptiveHGap(ordered, nodeMap);
      const rowW = (ordered.length - 1) * hgap;
      ordered.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y: tierYArr[ri] }));
    }
    for (let ri = sortedTiers.length - 2; ri >= 0; ri--) {
      const t  = sortedTiers[ri];
      const ordered = barycenterOrder(byTier.get(t), adj, tempPos, nodeMap);
      byTier.set(t, ordered);
      const hgap = adaptiveHGap(ordered, nodeMap);
      const rowW = (ordered.length - 1) * hgap;
      ordered.forEach((id, i) => tempPos.set(id, { x: cx - rowW / 2 + i * hgap, y: tierYArr[ri] }));
    }
  }

  const finalPos = new Map(tempPos);

  // Organic offset: single-node tiers drift toward the centroid of their connected backbone neighbors.
  // This breaks the rigid "all nodes on a single vertical line" look.
  for (let ri = 0; ri < sortedTiers.length; ri++) {
    const t   = sortedTiers[ri];
    const ids = byTier.get(t);
    if (ids.length === 1) {
      const id        = ids[0];
      const neighbors = (adj.get(id) || []).filter(nb => finalPos.has(nb) && nb !== id);
      if (neighbors.length > 0) {
        const avgX  = neighbors.reduce((s, nb) => s + finalPos.get(nb).x, 0) / neighbors.length;
        const curX  = finalPos.get(id).x;
        const newX  = curX + (avgX - curX) * ORGANIC_PULL;
        finalPos.set(id, { x: Math.round(newX), y: finalPos.get(id).y });
      }
    }
  }

  // ── Phase 6 & 7: place groups around backbone ─────────────────────────
  for (const [anchorId, anchorGroups] of groupsByAnchor) {
    const anchorPos = finalPos.get(anchorId);
    if (!anchorPos) continue;

    const sides = assignGroupSides(anchorGroups.length);

    if (anchorGroups.length === 1) {
      // Single group — place directly below
      const gPos = applyGroupLayout(anchorGroups[0], anchorPos, "below");
      for (const [id, p] of gPos) finalPos.set(id, p);
    } else {
      // Multiple groups — spread them. For 'below' groups with width competition,
      // compute widths and adjust X centers so they don't overlap.
      const belowGroups = anchorGroups.filter((_, i) => sides[i] === "below");
      let belowStartX = anchorPos.x;
      if (belowGroups.length > 1) {
        const totalW = belowGroups.reduce((s, g) => s + estimateGroupWidth(g), 0)
                     + (belowGroups.length - 1) * MIN_CLUSTER_GAP;
        belowStartX = anchorPos.x - totalW / 2;
      }
      let belowCursor = belowStartX;

      for (let gi = 0; gi < anchorGroups.length; gi++) {
        const g    = anchorGroups[gi];
        const side = sides[gi];

        if (side === "below" && belowGroups.length > 1) {
          const w        = estimateGroupWidth(g);
          const gAnchorX = belowCursor + w / 2;
          belowCursor   += w + MIN_CLUSTER_GAP;
          const gPos = applyGroupLayout(g, { x: gAnchorX, y: anchorPos.y }, "below");
          for (const [id, p] of gPos) finalPos.set(id, p);
        } else {
          const gPos = applyGroupLayout(g, anchorPos, side);
          for (const [id, p] of gPos) finalPos.set(id, p);
        }
      }
    }
  }

  // Place any ungrouped leaves near their first backbone neighbor.
  for (const id of ungrouped) {
    const nbs = (adj.get(id) || []).filter(nb => finalPos.has(nb));
    if (nbs.length > 0) {
      const nb    = nbs[0];
      const nbPos = finalPos.get(nb);
      finalPos.set(id, { x: Math.round(nbPos.x + GROUP_HGAP), y: Math.round(nbPos.y + GROUP_BELOW_GAP) });
    } else {
      finalPos.set(id, { x: Math.round(cx), y: Math.round(cy + 350) });
    }
  }

  // ── Phase 8: collision resolution ─────────────────────────────────────
  // Backbone nodes are fixed; only leaf/group nodes get pushed apart.
  const fixedIds = new Set(backboneIds);
  resolveCollisions(finalPos, fixedIds);

  // Bounding box with icon+label padding for component packing
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of finalPos.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  minX -= 65; minY -= 25; maxX += 65; maxY += 65;

  return { positions: finalPos, minX, minY, maxX, maxY };
}

// ─── Phase 9: Component packing ───────────────────────────────────────────────
// Packs multiple components into a compact rectangular layout.
// Sorts by area (largest first) and places in 2 columns by greedy height-balance.
function packComponents(compResults) {
  const newPositions = new Map();
  const COL_GAP = 220;
  const CANVAS_CX = 700;

  // Sort largest component first for better bin-packing
  compResults.sort((a, b) => {
    const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
    const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
    return areaB - areaA;
  });

  // 2-column greedy: assign each component to the shorter column
  let col0MaxW = 0, col1MaxW = 0;
  let col0Y = 150, col1Y = 150;
  const assignments = [];

  for (const cr of compResults) {
    const w = cr.maxX - cr.minX || 200;
    const h = cr.maxY - cr.minY || 0;
    const col = col1Y <= col0Y ? 1 : 0;
    if (col === 0) { col0MaxW = Math.max(col0MaxW, w); col0Y += h + COMP_PAD; }
    else           { col1MaxW = Math.max(col1MaxW, w); col1Y += h + COMP_PAD; }
    assignments.push({ cr, col });
  }

  const col0CX = CANVAS_CX - col1MaxW / 2 - COL_GAP / 2;
  const col1CX = CANVAS_CX + col0MaxW / 2 + COL_GAP / 2;
  let col0PackY = 150, col1PackY = 150;

  for (const { cr, col } of assignments) {
    const h       = cr.maxY - cr.minY || 0;
    const w       = cr.maxX - cr.minX || 0;
    const colCX   = col === 0 ? col0CX : col1CX;
    const packY   = col === 0 ? col0PackY : col1PackY;
    const offsetX = Math.round(colCX - (cr.minX + w / 2));
    const offsetY = Math.round(packY - cr.minY);
    for (const [id, pos] of cr.positions) {
      newPositions.set(id, { x: pos.x + offsetX, y: pos.y + offsetY });
    }
    if (col === 0) col0PackY += h + COMP_PAD;
    else           col1PackY += h + COMP_PAD;
  }
  return newPositions;
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Applies Pretty v3 organic hierarchical layout to the current graph.
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

  let newPositions;

  // ── Phase 9: pack components ─────────────────────────────────────────
  if (compResults.length > 1) {
    newPositions = packComponents(compResults);
  } else {
    newPositions = new Map();
    for (const cr of compResults) {
      for (const [id, pos] of cr.positions) newPositions.set(id, pos);
    }
  }

  // Park isolated nodes in a band below all connected components
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

  // ── Phase 10: normalize — ensure minX >= 150, minY >= 150 ────────────
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

  // Dispatch only nodes that actually moved
  for (const n of nodes) {
    const p = newPositions.get(n.id);
    if (p && (p.x !== n.x || p.y !== n.y)) {
      dispatch({ type: ActionTypes.MOVE_NODE, payload: { id: n.id, x: p.x, y: p.y } });
    }
  }
}

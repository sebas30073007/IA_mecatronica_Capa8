// src/model/graph.js
// Helpers de grafo (BFS, búsqueda, validaciones)

export function findNode(graph, nodeId) {
  return graph.nodes.find(n => n.id === nodeId) || null;
}

export function findLink(graph, linkId) {
  return graph.links.find(l => l.id === linkId) || null;
}

export function findNodeByIp(graph, ip) {
  return graph.nodes.find(n => (n.ip || "").trim() === ip.trim()) || null;
}

export function linksForNode(graph, nodeId) {
  return graph.links.filter(l => l.source === nodeId || l.target === nodeId);
}

export function hasLinkBetween(graph, aId, bId) {
  return graph.links.some(l =>
    (l.source === aId && l.target === bId) ||
    (l.source === bId && l.target === aId)
  );
}

export function buildAdjacency(graph) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const l of graph.links) {
    if (l.status === "down") continue;
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source).push({ neighbor: l.target, link: l });
    adj.get(l.target).push({ neighbor: l.source, link: l });
  }
  return adj;
}

// BFS: devuelve path como lista de linkIds
export function bfsPath(graph, sourceId, targetId) {
  if (sourceId === targetId) return [];
  const adj = buildAdjacency(graph);

  const q = [{ nodeId: sourceId, path: [] }];
  const visited = new Set([sourceId]);

  while (q.length) {
    const cur = q.shift();
    const edges = adj.get(cur.nodeId) || [];
    for (const e of edges) {
      if (visited.has(e.neighbor)) continue;
      const nextPath = [...cur.path, e.link.id];
      if (e.neighbor === targetId) return nextPath;
      visited.add(e.neighbor);
      q.push({ nodeId: e.neighbor, path: nextPath });
    }
  }
  return [];
}

/**
 * Checks if any firewall in the BFS path blocks the packet.
 * Returns the blocking firewall node or null if permitted.
 * Firewall rules: evaluated in order, first match wins. Default: permit.
 */
export function checkAclPath(graph, linkIds, dstIp) {
  const adj = buildAdjacency(graph);
  // Collect node IDs along the path
  const nodeIds = new Set();
  for (const linkId of linkIds) {
    const l = graph.links.find(x => x.id === linkId);
    if (l) { nodeIds.add(l.source); nodeIds.add(l.target); }
  }
  for (const nodeId of nodeIds) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node?.type !== "firewall" || !node.rules?.length) continue;
    for (const rule of node.rules) {
      const matches = rule.ip === "*" || rule.ip === dstIp;
      if (matches) {
        if (rule.action === "deny") return node;
        break; // explicit permit — stop checking this firewall
      }
    }
  }
  return null;
}

/**
 * Computes round-trip time for a path.
 * If applyJitter is true, adds Gaussian-like jitter from each link's jitter field.
 */
export function computeRttMs(graph, linkIds, { applyJitter = false } = {}) {
  let sum = 0;
  for (const id of linkIds) {
    const l = graph.links.find(x => x.id === id);
    if (!l) continue;
    if (l.status === "down") return null; // path incluye link caído → sin ruta
    const latency = Number(l.latencyMs) || 0;
    const jitter  = applyJitter && Number(l.jitter) > 0
      ? (Math.random() * 2 - 1) * Number(l.jitter)  // uniform [-j, +j]
      : 0;
    sum += 2 * Math.max(0, latency + jitter);
  }
  return Math.round(sum * 100) / 100;
}

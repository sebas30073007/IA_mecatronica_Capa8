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

export function computeRttMs(graph, linkIds) {
  let sum = 0;
  for (const id of linkIds) {
    const l = graph.links.find(x => x.id === id);
    if (!l) continue;
    if (l.status === "down") return null; // path incluye link caído → sin ruta
    sum += 2 * (Number(l.latencyMs) || 0);
  }
  return Math.round(sum * 100) / 100;
}

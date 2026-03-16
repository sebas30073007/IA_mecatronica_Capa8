// src/ai/topology-analyzer.js
// Analiza el grafo y detecta problemas comunes de red (didáctico).

/**
 * @param {object} graph - Grafo v3 del store
 * @returns {{ id: string, severity: "error"|"warning"|"info", message: string }[]}
 */
export function analyzeTopology(graph) {
  const issues = [];
  const { nodes, links } = graph;

  // 1. IPs duplicadas entre nodos
  const ipCount = new Map();
  for (const n of nodes) {
    if (!n.ip) continue;
    ipCount.set(n.ip, (ipCount.get(n.ip) || 0) + 1);
  }
  for (const [ip, count] of ipCount) {
    if (count > 1) {
      issues.push({ id: `dup-ip-${ip}`, severity: "error", message: `IP duplicada: ${ip} aparece en ${count} nodos.` });
    }
  }

  // 2. Nodos sin IP
  for (const n of nodes) {
    if (!n.ip) {
      issues.push({ id: `no-ip-${n.id}`, severity: "warning", message: `Nodo "${n.label}" no tiene IP asignada.` });
    }
  }

  // 3. Nodos sin enlaces (aislados)
  const connectedIds = new Set();
  for (const l of links) {
    connectedIds.add(l.source);
    connectedIds.add(l.target);
  }
  for (const n of nodes) {
    if (!connectedIds.has(n.id)) {
      issues.push({ id: `isolated-${n.id}`, severity: "warning", message: `Nodo "${n.label}" está aislado (sin enlaces).` });
    }
  }

  // 4. PCs sin conexión a router (no hay camino BFS que pase por un router)
  //    Versión simple: PC directamente conectada solo a otras PCs
  const adjacency = buildAdj(graph);
  for (const n of nodes.filter(n => n.type === "pc")) {
    const neighbors = adjacency.get(n.id) || [];
    const hasRouterOrSwitch = neighbors.some(id => {
      const neighbor = nodes.find(x => x.id === id);
      return neighbor && (neighbor.type === "router" || neighbor.type === "switch");
    });
    if (!hasRouterOrSwitch && neighbors.length > 0) {
      issues.push({ id: `pc-no-infra-${n.id}`, severity: "info", message: `PC "${n.label}" no está conectada a ningún switch/router.` });
    }
  }

  // 5. Links caídos (informativos)
  const downLinks = links.filter(l => l.status === "down");
  for (const l of downLinks) {
    const a = nodes.find(n => n.id === l.source);
    const b = nodes.find(n => n.id === l.target);
    if (a && b) {
      issues.push({ id: `down-link-${l.id}`, severity: "info", message: `Enlace entre "${a.label}" y "${b.label}" está DOWN.` });
    }
  }

  // 6. Pérdida alta en links
  for (const l of links.filter(l => l.status !== "down" && (l.lossPct || 0) >= 20)) {
    const a = nodes.find(n => n.id === l.source);
    const b = nodes.find(n => n.id === l.target);
    if (a && b) {
      issues.push({ id: `high-loss-${l.id}`, severity: "warning", message: `Enlace "${a.label}"↔"${b.label}" tiene ${l.lossPct}% de pérdida de paquetes.` });
    }
  }

  // 7. PCs con IP pero sin gateway, cuando hay al menos un router en el grafo
  const hasRouter = nodes.some(n => n.type === "router");
  if (hasRouter) {
    for (const n of nodes.filter(n => n.type === "pc" && n.ip && !n.gateway)) {
      issues.push({ id: `no-gw-${n.id}`, severity: "warning", message: `"${n.label}" tiene IP pero sin gateway. No puede salir de su subred.` });
    }
  }

  // 8. Componentes aisladas — nodos físicamente desconectados entre sí
  if (nodes.length > 1) {
    const adjAll = new Map();
    for (const n of nodes) adjAll.set(n.id, []);
    for (const l of links) {
      adjAll.get(l.source)?.push(l.target);
      adjAll.get(l.target)?.push(l.source);
    }
    const visited = new Set();
    const bfs = startId => {
      const q = [startId];
      visited.add(startId);
      while (q.length) {
        const cur = q.shift();
        for (const nb of adjAll.get(cur) || []) {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        }
      }
    };
    bfs(nodes[0].id);
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        issues.push({ id: `disconnected-${n.id}`, severity: "warning", message: `"${n.label}" no está conectado al resto de la topología (componente aislada).` });
      }
    }
  }

  return issues;
}

function buildAdj(graph) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const l of graph.links) {
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source).push(l.target);
    adj.get(l.target).push(l.source);
  }
  return adj;
}

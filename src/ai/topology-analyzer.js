// src/ai/topology-analyzer.js
// Analiza el grafo y detecta problemas comunes de red (didáctico).
//
// Estos issues tienen DOS públicos y no quieren el mismo texto:
//
//   - El estudiante, que los lee en el panel de diagnóstico. Necesita
//     una frase en español que diga qué está mal, sin jerga interna.
//   - El LLM, al que context-builder le inyecta la lista para que pueda
//     corregir. Necesita saber con qué acción se arregla.
//
// Por eso `message` es humano y `llmHint` es opcional y técnico. Antes
// iban mezclados en `message`, lo que se notaba en cuanto alguien
// mostraba los issues en pantalla.
//
// `nodeId` / `linkId` permiten saltar al elemento culpable desde el panel;
// `kind` es el identificador estable de la regla, para agrupar o filtrar
// sin parsear el texto.

/**
 * @param {object} graph - Grafo v3 del store
 * @returns {{
 *   id: string,
 *   kind: string,
 *   severity: "error"|"warning"|"info",
 *   message: string,
 *   llmHint?: string,
 *   nodeId?: string,
 *   linkId?: string,
 *   nodeIds?: string[]
 * }[]}
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
      const culpables = nodes.filter(n => n.ip === ip);
      issues.push({
        id: `dup-ip-${ip}`,
        kind: "dup-ip",
        severity: "error",
        message: `IP duplicada: ${ip} está en ${count} dispositivos (${culpables.map(n => n.label).join(", ")}).`,
        // Se salta al primero; el panel puede recorrer el resto con nodeIds
        nodeId: culpables[0]?.id,
        nodeIds: culpables.map(n => n.id),
      });
    }
  }

  // 2. Nodos sin IP (cloud nodes are exempt — they represent external services)
  for (const n of nodes) {
    if (!n.ip && n.type !== "cloud") {
      issues.push({
        id: `no-ip-${n.id}`,
        kind: "no-ip",
        severity: "warning",
        message: `"${n.label}" no tiene IP asignada.`,
        nodeId: n.id,
      });
    }
  }

  // 2b. Nodos con IP pero sin máscara.
  //
  // La alcanzabilidad asume /24 cuando falta (ver effectivePrefix), así que
  // la red funciona — pero el alumno debe saber que está operando sobre un
  // supuesto. Se agrega en UN solo aviso: hay topologías con 15 nodos sin
  // máscara y quince filas idénticas serían ruido, no información.
  const sinMascara = nodes.filter(n => n.ip && n.mask == null);
  if (sinMascara.length) {
    issues.push({
      id: "no-mask",
      kind: "no-mask",
      severity: "info",
      message: sinMascara.length === 1
        ? `"${sinMascara[0].label}" no tiene máscara de subred; se asume /24.`
        : `${sinMascara.length} dispositivos no tienen máscara de subred; se asume /24 para todos.`,
      nodeId: sinMascara[0].id,
      nodeIds: sinMascara.map(n => n.id),
    });
  }

  // 3. Nodos sin enlaces (aislados)
  const connectedIds = new Set();
  for (const l of links) {
    connectedIds.add(l.source);
    connectedIds.add(l.target);
  }
  for (const n of nodes) {
    if (!connectedIds.has(n.id)) {
      issues.push({
        id: `isolated-${n.id}`,
        kind: "isolated",
        severity: "warning",
        message: `"${n.label}" está suelto: no tiene ningún cable conectado.`,
        nodeId: n.id,
      });
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
      issues.push({
        id: `pc-no-infra-${n.id}`,
        kind: "pc-no-infra",
        severity: "info",
        message: `"${n.label}" no llega a ningún switch ni router, así que solo puede hablar con sus vecinos directos.`,
        nodeId: n.id,
      });
    }
  }

  // 5. Links caídos (informativos)
  const downLinks = links.filter(l => l.status === "down");
  for (const l of downLinks) {
    const a = nodes.find(n => n.id === l.source);
    const b = nodes.find(n => n.id === l.target);
    if (a && b) {
      issues.push({
        id: `down-link-${l.id}`,
        kind: "down-link",
        severity: "info",
        message: `El enlace entre "${a.label}" y "${b.label}" está caído.`,
        linkId: l.id,
      });
    }
  }

  // 6. Pérdida alta en links
  for (const l of links.filter(l => l.status !== "down" && (l.lossPct || 0) >= 20)) {
    const a = nodes.find(n => n.id === l.source);
    const b = nodes.find(n => n.id === l.target);
    if (a && b) {
      issues.push({
        id: `high-loss-${l.id}`,
        kind: "high-loss",
        severity: "warning",
        message: `El enlace "${a.label}"↔"${b.label}" pierde ${l.lossPct}% de los paquetes.`,
        linkId: l.id,
      });
    }
  }

  // 7. PCs con IP pero sin gateway, cuando hay al menos un router en el grafo
  const hasRouter = nodes.some(n => n.type === "router");
  if (hasRouter) {
    for (const n of nodes.filter(n => n.type === "pc" && n.ip && !n.gateway)) {
      issues.push({
        id: `no-gw-${n.id}`,
        kind: "no-gateway",
        severity: "warning",
        message: `"${n.label}" no tiene puerta de enlace, así que no puede salir de su propia subred.`,
        // El LLM confundía esto con un problema de cableado y añadía un
        // enlace físico. Es una propiedad del nodo, no un cable.
        llmHint: "corregir con update_node + patch.gateway (NO agregar enlace físico)",
        nodeId: n.id,
      });
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
      if (visited.has(n.id)) continue;
      // Un nodo sin ningún enlace ya lo reportó la regla 3, y "está suelto"
      // es más accionable que "está en una isla". Sin este descarte, cada
      // nodo huérfano generaba DOS avisos que dicen casi lo mismo — ruido
      // que en el panel de diagnóstico se nota de inmediato.
      if (!connectedIds.has(n.id)) continue;
      issues.push({
        id: `disconnected-${n.id}`,
        kind: "disconnected",
        severity: "warning",
        message: `"${n.label}" está en una isla aparte: no hay camino hasta el resto de la red.`,
        nodeId: n.id,
      });
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

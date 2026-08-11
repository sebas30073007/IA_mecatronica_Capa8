// src/model/graph.js
// Helpers de grafo (BFS, búsqueda, validaciones)

import { effectivePrefix, sameSubnet, networkAddress } from "./addressing.js";

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
 * Convierte la salida de bfsPath (lista de linkIds) en una lista de saltos
 * con el sentido REAL de recorrido.
 *
 * Hace falta porque un enlace no sabe en qué dirección se atraviesa: guarda
 * `source` y `target` en el orden en que se creó, que no tiene por qué
 * coincidir con el orden en que lo recorre el camino. Antes la animación
 * usaba `direction: "ab"|"ba"` relativo a source/target, y por eso algunos
 * paquetes se veían viajar hacia atrás.
 *
 * @param {object} graph
 * @param {string} sourceId - nodo desde el que arranca el recorrido
 * @param {string[]} linkIds - salida de bfsPath()
 * @returns {{ linkId: string, fromId: string, toId: string }[]}
 */
export function linksToHops(graph, sourceId, linkIds) {
  const hops = [];
  let current = sourceId;
  for (const linkId of linkIds) {
    const l = graph.links.find(x => x.id === linkId);
    if (!l) break;
    // El extremo que NO es el nodo actual es el siguiente
    const next = l.source === current ? l.target : l.source;
    hops.push({ linkId, fromId: current, toId: next });
    current = next;
  }
  return hops;
}

/** Invierte un recorrido: mismos enlaces, sentido opuesto. */
export function reverseHops(hops) {
  return hops.slice().reverse().map(h => ({
    linkId: h.linkId,
    fromId: h.toId,
    toId: h.fromId,
  }));
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
 * Dispositivos de capa 3: cortan el dominio de difusión y pueden hacer de
 * puerta de enlace. El firewall entra aquí porque en una DMZ es él quien
 * enruta entre segmentos.
 */
const ENRUTADORES = new Set(["router", "firewall"]);

/**
 * ¿Este nodo puede enrutar entre subredes?
 *
 * Además de routers y firewalls, cuenta cualquier nodo al que algún host
 * apunte como puerta de enlace: si alguien lo usa de gateway, está haciendo
 * de dispositivo de capa 3. Eso cubre los switches de capa 3, que son lo
 * normal en un campus — en la topología `campus` la puerta de enlace de cada
 * edificio es su switch, y exigir un `router` por tipo dejaba incomunicados
 * los edificios entre sí.
 *
 * Se infiere del dato en vez de añadir un tipo de nodo nuevo, que saturaría
 * el espectro de color y obligaría a tocar validador, iconos y menús.
 */
function isLayer3(graph, node) {
  if (!node) return false;
  if (ENRUTADORES.has(node.type)) return true;
  return node.ip ? graph.nodes.some(n => n.gateway === node.ip) : false;
}

/** IDs de los nodos que toca una lista de enlaces. */
function nodesOfLinks(graph, linkIds) {
  const ids = new Set();
  for (const id of linkIds) {
    const l = graph.links.find(x => x.id === id);
    if (l) { ids.add(l.source); ids.add(l.target); }
  }
  return [...ids];
}

/**
 * BFS restringido a la capa 2: no atraviesa routers ni firewalls.
 * Sirve para responder "¿está este host en mi mismo segmento?".
 */
export function l2Path(graph, sourceId, targetId) {
  if (sourceId === targetId) return [];
  const adj = buildAdjacency(graph);
  const bloquea = id => ENRUTADORES.has(graph.nodes.find(x => x.id === id)?.type);

  const q = [{ nodeId: sourceId, path: [] }];
  const visited = new Set([sourceId]);
  while (q.length) {
    const cur = q.shift();
    for (const e of adj.get(cur.nodeId) || []) {
      if (visited.has(e.neighbor)) continue;
      const nextPath = [...cur.path, e.link.id];
      if (e.neighbor === targetId) return nextPath;
      visited.add(e.neighbor);
      // Un router en medio corta el dominio de capa 2: se puede llegar A él,
      // pero no A TRAVÉS de él.
      if (!bloquea(e.neighbor)) q.push({ nodeId: e.neighbor, path: nextPath });
    }
  }
  return [];
}

/**
 * Si no hay camino, ¿es porque hay un enlace caído?
 *
 * `buildAdjacency` descarta los enlaces `down`, así que un corte se manifiesta
 * como "no hay ruta" sin decir dónde. Esto rehace el BFS como si todo
 * estuviera levantado y devuelve el primer enlace caído del camino que
 * habría existido — que es justo lo que hay que señalar en el lienzo.
 *
 * @returns {string|null} id del enlace caído culpable
 */
export function findBlockingDownLink(graph, sourceId, targetId) {
  const comoSiTodoOk = { ...graph, links: graph.links.map(l => ({ ...l, status: "up" })) };
  const path = bfsPath(comoSiTodoOk, sourceId, targetId);
  if (!path.length) return null;
  return path.find(id => graph.links.find(l => l.id === id)?.status === "down") || null;
}

/**
 * Decide si un host alcanza una IP, aplicando direccionamiento IP y no solo
 * conectividad física.
 *
 * Es el concepto central de fundamentos de redes, y hasta ahora la app
 * enseñaba lo contrario: bastaba que hubiera cable. Dos PCs en 10.0.1.5/24 y
 * 192.168.1.7/24 unidas por un switch se hacían ping sin problema.
 *
 * SIMPLIFICACIÓN DELIBERADA: un nodo tiene una sola IP, así que un router no
 * puede tener interfaz en cada subred que conecta — en vlan_routing el router
 * es 192.168.1.1 mientras las VLANs son 192.168.10.0/24 y 192.168.20.0/24, y
 * el enrutamiento entre VLANs sería irrepresentable. Por eso el gateway se
 * valida como "su IP está en mi subred y hay un router en mi segmento L2", sin
 * exigir que la IP del router coincida con la del gateway; y se asume que un
 * router reenvía entre todas las subredes a las que está conectado.
 *
 * @returns {{ ok, reason, linkIds, failNodeId, failLinkId, message }}
 */
export function resolveReachability(graph, srcNode, dstIp) {
  const dst = findNodeByIp(graph, dstIp);
  if (!dst) return { ok: false, reason: "no-host", linkIds: [] };

  const prefix = effectivePrefix(srcNode);
  const mismaSubred = sameSubnet(srcNode.ip, dstIp, prefix);

  if (mismaSubred) {
    // Misma subred: basta con que haya camino físico.
    //
    // Se probó exigir además un camino de capa 2 sin atravesar routers, pero
    // marcaba como rota la red doméstica —donde el NAS cuelga del router y las
    // PCs del AP, todo en 192.168.1.0/24— porque un router doméstico hace de
    // switch para su propia LAN. Distinguir eso exigiría interfaces por nodo,
    // y el caso no enseña nada: la lección está en la subred y el gateway.
    const path = bfsPath(graph, srcNode.id, dst.id);
    if (path.length) return { ok: true, reason: "l2", linkIds: path };
    return {
      ok: false, reason: "no-path", linkIds: [], failNodeId: dst.id,
      message: `No hay conexión física entre ${srcNode.label} y ${dst.label}.`,
    };
  }

  // Distinta subred → hace falta puerta de enlace
  if (!srcNode.gateway) {
    return {
      ok: false, reason: "no-gateway", linkIds: [], failNodeId: srcNode.id,
      message: `${srcNode.label} (${srcNode.ip}/${prefix}) y ${dst.label} (${dstIp}) están en subredes distintas, y ${srcNode.label} no tiene puerta de enlace configurada.`,
    };
  }
  if (!sameSubnet(srcNode.ip, srcNode.gateway, prefix)) {
    return {
      ok: false, reason: "gateway-off-subnet", linkIds: [], failNodeId: srcNode.id,
      message: `La puerta de enlace ${srcNode.gateway} no está en la subred de ${srcNode.label} (${networkAddress(srcNode.ip, prefix)}/${prefix}), así que es inalcanzable.`,
    };
  }

  const path = bfsPath(graph, srcNode.id, dst.id);
  if (!path.length) {
    return {
      ok: false, reason: "no-path", linkIds: [], failNodeId: dst.id,
      message: `No hay conexión física entre ${srcNode.label} y ${dst.label}.`,
    };
  }

  // Para cambiar de subred hay que atravesar un dispositivo de capa 3. Si el
  // camino solo tiene switches, no hay nadie que enrute: es el error clásico
  // de conectar dos subredes con un switch y esperar que se hablen.
  const atraviesaL3 = nodesOfLinks(graph, path)
    .some(id => isLayer3(graph, graph.nodes.find(n => n.id === id)));
  if (!atraviesaL3) {
    return {
      ok: false, reason: "no-router", linkIds: path, failNodeId: srcNode.id,
      message: `${srcNode.label} y ${dst.label} están en subredes distintas y entre ellos solo hay switches: hace falta un router o un firewall que enrute.`,
    };
  }

  return { ok: true, reason: "routed", linkIds: path };
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

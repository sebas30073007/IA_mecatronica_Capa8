// src/ai/actionValidator.js
// Valida acciones CAPA8 contra el estado actual del grafo antes del dispatch.

const VALID_TYPES   = new Set(["router", "switch", "pc", "firewall", "server", "cloud", "ap", "plc", "ur3", "agv"]);
const VALID_STATUSES = new Set(["up", "down"]);

// Alias de tipos que la IA puede generar; se normalizan silenciosamente antes de validar
const TYPE_ALIASES = {
  wan:         "cloud",
  internet:    "cloud",
  hub:         "switch",
  host:        "pc",
  workstation: "pc",
  laptop:      "pc",
  terminal:    "pc",
  gateway:     "router",
  controller:  "plc",
  robot:       "ur3",
  vehicle:     "agv",
  mobile:      "agv",
};
const VALID_ACTIONS  = new Set([
  "add_node", "add_link", "delete_node", "delete_link", "set_link_status", "apply_graph",
]);

/**
 * Valida una acción CAPA8 contra el grafo actual.
 * @param {object} action - Objeto de acción parseado del bloque CAPA8_ACTION
 * @param {object} graph  - Grafo v3 del store
 * @returns {{ valid: boolean, error?: string, warnings?: string[] }}
 */
export function validateAction(action, graph) {
  if (!action || typeof action !== "object") {
    return { valid: false, error: "Acción inválida: no es un objeto." };
  }

  if (!VALID_ACTIONS.has(action.action)) {
    return {
      valid: false,
      error: `Acción desconocida: "${action.action}". Válidas: ${[...VALID_ACTIONS].join(", ")}.`,
    };
  }

  const nodes = graph?.nodes || [];
  const links = graph?.links || [];
  const warnings = [];

  function findNode(label, id) {
    if (id) {
      const byId = nodes.find(n => n.id === id);
      if (byId) return byId;
    }
    const matches = nodes.filter(n => n.label === label);
    if (matches.length > 1) {
      warnings.push(`Varios nodos con label "${label}", se usará el primero.`);
    }
    return matches[0] || null;
  }

  if (action.action === "add_node") {
    if (!action.label || typeof action.label !== "string" || !action.label.trim()) {
      return { valid: false, error: "add_node requiere un campo 'label' no vacío." };
    }
    // Normalizar alias de tipos antes de validar (mutación intencional: se propaga al dispatch)
    if (action.type && TYPE_ALIASES[action.type]) {
      action.type = TYPE_ALIASES[action.type];
    }
    if (action.type && !VALID_TYPES.has(action.type)) {
      return {
        valid: false,
        error: `Tipo inválido: "${action.type}". Válidos: router, switch, pc, firewall, server, cloud, ap, plc, ur3, agv.`,
      };
    }
    if (nodes.some(n => n.label === action.label)) {
      warnings.push(`Ya existe un nodo con label "${action.label}". Se creará de todas formas.`);
    }
    // Warn on duplicate IP
    if (action.ip && action.ip.trim()) {
      const dupIp = nodes.find(n => n.ip && n.ip === action.ip.trim());
      if (dupIp) {
        warnings.push(`IP "${action.ip}" ya está en uso por "${dupIp.label}". Considera usar otra dirección.`);
      }
    }
    return { valid: true, warnings };
  }

  if (action.action === "add_link") {
    if (!action.sourceLabel && !action.sourceId) {
      return { valid: false, error: "add_link requiere 'sourceLabel' o 'sourceId'." };
    }
    if (!action.targetLabel && !action.targetId) {
      return { valid: false, error: "add_link requiere 'targetLabel' o 'targetId'." };
    }
    const src = findNode(action.sourceLabel, action.sourceId);
    const tgt = findNode(action.targetLabel, action.targetId);
    if (!src) {
      return { valid: false, error: `Nodo origen no encontrado: "${action.sourceLabel || action.sourceId}".` };
    }
    if (!tgt) {
      return { valid: false, error: `Nodo destino no encontrado: "${action.targetLabel || action.targetId}".` };
    }
    const dup = links.find(l =>
      (l.source === src.id && l.target === tgt.id) ||
      (l.source === tgt.id && l.target === src.id)
    );
    if (dup) {
      warnings.push(`Ya existe un enlace entre "${src.label}" y "${tgt.label}".`);
    }
    return { valid: true, warnings };
  }

  if (action.action === "delete_node") {
    if (!action.label && !action.id) {
      return { valid: false, error: "delete_node requiere 'label' o 'id'." };
    }
    const node = findNode(action.label, action.id);
    if (!node) {
      return { valid: false, error: `Nodo no encontrado: "${action.label || action.id}".` };
    }
    if (nodes.length === 1) {
      warnings.push("Esto dejará el canvas vacío.");
    }
    return { valid: true, warnings };
  }

  if (action.action === "delete_link") {
    const src = findNode(action.sourceLabel, action.sourceId);
    const tgt = findNode(action.targetLabel, action.targetId);
    if (!src) {
      return { valid: false, error: `Nodo origen no encontrado: "${action.sourceLabel || action.sourceId}".` };
    }
    if (!tgt) {
      return { valid: false, error: `Nodo destino no encontrado: "${action.targetLabel || action.targetId}".` };
    }
    const link = links.find(l =>
      (l.source === src.id && l.target === tgt.id) ||
      (l.source === tgt.id && l.target === src.id)
    );
    if (!link) {
      return { valid: false, error: `Enlace entre "${src.label}" y "${tgt.label}" no encontrado.` };
    }
    return { valid: true, warnings };
  }

  if (action.action === "set_link_status") {
    const src = findNode(action.sourceLabel, action.sourceId);
    const tgt = findNode(action.targetLabel, action.targetId);
    if (!src) {
      return { valid: false, error: `Nodo origen no encontrado: "${action.sourceLabel || action.sourceId}".` };
    }
    if (!tgt) {
      return { valid: false, error: `Nodo destino no encontrado: "${action.targetLabel || action.targetId}".` };
    }
    if (!VALID_STATUSES.has(action.status)) {
      return { valid: false, error: `Estado inválido: "${action.status}". Debe ser "up" o "down".` };
    }
    const link = links.find(l =>
      (l.source === src.id && l.target === tgt.id) ||
      (l.source === tgt.id && l.target === src.id)
    );
    if (!link) {
      return { valid: false, error: `Enlace entre "${src.label}" y "${tgt.label}" no encontrado.` };
    }
    return { valid: true, warnings };
  }

  if (action.action === "apply_graph") {
    if (!action.graph || typeof action.graph !== "object") {
      return { valid: false, error: "apply_graph requiere un campo 'graph' con el grafo v3 completo." };
    }
    if (!Array.isArray(action.graph.nodes)) {
      return { valid: false, error: "apply_graph: el grafo debe tener un array 'nodes'." };
    }
    return { valid: true, warnings };
  }

  return { valid: true, warnings };
}

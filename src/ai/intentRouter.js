// src/ai/intentRouter.js
// Clasificación determinista de intención antes de llamar al LLM.

// Verbos imperativos/infinitivos de modificación explícita
const MODIFY_VERBS = /\b(agrega|agregar|añade|añadir|crea|crear|conecta|conectar|elimina|eliminar|diseña|diseñar|modifica\s+el|borra|borrar|quita|quitar|remueve|remover|pon|poner|inserta|insertar|add|create|connect|delete|remove|design)\b/i;

// Keywords de diagnóstico / solver
const SOLVER_KEYWORDS = /\b(problema|error|falla|fallo|por\s+qu[eé]\s+no|no\s+funciona|diagnostica|detecta|analiza|revisa|encuentra\s+el|qu[eé]\s+est[aá]\s+mal|qu[eé]\s+pasa|ping\s+falla|no\s+hay\s+ruta)\b/i;

// Preguntas directas de consulta
const QUERY_STARTERS = /^[¿¡]?(qu[eé]|cu[aá]ntos|cu[aá]ntas|d[oó]nde|cu[aá]l|cu[aá]les|hay\s+alg[uú]n|tiene|existe|mu[eé]strame|lista|dime)\b/i;

// Términos puramente conceptuales (no referencian el canvas)
const CONCEPTUAL_TERMS = /\b(qu[eé]\s+es\s+un?|diferencia\s+entre|explica|c[oó]mo\s+funciona|define|definici[oó]n|OSPF|BGP|VLAN|NAT|DHCP|TCP|UDP|OSI|subnetting|subredes|enrutamiento|routing|switching)\b/i;

// Targets vagos — sin referencia a un nodo específico
const VAGUE_TARGETS = /\b(un\s+dispositivo|algo|algunos?|m[aá]s\s+(nodos?|pcs?|routers?|switches?)|varios|unos?)\b/i;

/**
 * Clasifica la intención del mensaje del usuario.
 * @param {string} message
 * @param {object} graph - Grafo v3 actual
 * @param {string} surface - "home" | "diagrams"
 * @returns {{ type: string, confidence: "high"|"low", extractedRefs: object }}
 */
export function classifyIntent(message, graph, surface) {
  const msg = (message || "").trim();
  const msgLower = msg.toLowerCase();
  const nodes = graph?.nodes || [];

  // Check if message references a known node label
  const nodeLabels = nodes.map(n => (n.label || "").toLowerCase()).filter(Boolean);
  const hasNodeRef = nodeLabels.some(label => msgLower.includes(label));

  // 1. Solver / diagnóstico
  if (SOLVER_KEYWORDS.test(msgLower)) {
    return { type: "solver", confidence: "high", extractedRefs: {} };
  }

  // 2. Consulta sobre el grafo actual (solo en diagrams con pregunta directa)
  if (surface === "diagrams" && QUERY_STARTERS.test(msgLower) && !MODIFY_VERBS.test(msgLower)) {
    return { type: "query_graph", confidence: "high", extractedRefs: {} };
  }

  // 3. Pregunta puramente conceptual
  if (CONCEPTUAL_TERMS.test(msgLower) && !MODIFY_VERBS.test(msgLower)) {
    return { type: "conceptual", confidence: "high", extractedRefs: {} };
  }

  // 4. Modificación con verbo imperativo/infinitivo
  if (MODIFY_VERBS.test(msgLower)) {
    if (hasNodeRef || !VAGUE_TARGETS.test(msgLower)) {
      // Clear reference — we know what to modify
      const refs = nodeLabels.filter(l => msgLower.includes(l));
      return { type: "modify_clear", confidence: "high", extractedRefs: { labels: refs } };
    } else {
      // Vague — needs clarification
      return { type: "modify_ambiguous", confidence: "high", extractedRefs: {} };
    }
  }

  // 5. Default
  return {
    type: surface === "diagrams" ? "query_graph" : "conceptual",
    confidence: "low",
    extractedRefs: {},
  };
}

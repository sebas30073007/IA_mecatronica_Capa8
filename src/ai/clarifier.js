// src/ai/clarifier.js
// Genera preguntas de aclaración desde el estado del grafo (sin LLM).

/**
 * Genera un ClarificationState para instrucciones ambiguas.
 * @param {string} message - Mensaje original del usuario
 * @param {object} graph - Grafo v3 actual
 * @returns {object} ClarificationState
 */
export function generateClarificationState(message, graph) {
  const nodes = graph?.nodes || [];
  const routers = nodes.filter(n => n.type === "router");
  const switches = nodes.filter(n => n.type === "switch");
  const aps = nodes.filter(n => n.type === "ap");

  // Build connection target options from existing infrastructure nodes
  const targets = [...routers, ...switches, ...aps].slice(0, 4);
  const options = targets.map(n => ({
    label: `A ${n.label} (${n.type})`,
    value: { target: n.label },
  }));
  options.push({ label: "Recomiéndame", value: { auto: true } });

  const questions = [
    {
      id: "where_connect",
      question: nodes.length > 0
        ? "¿Dónde quieres conectarlo?"
        : "¿Dónde quieres colocarlo?",
      options: options.length > 1
        ? options
        : [{ label: "Sin conexión por ahora", value: { target: null } }, { label: "Recomiéndame", value: { auto: true } }],
    },
  ];

  return {
    originalMessage: message,
    questions,
    currentQuestionIdx: 0,
    collectedAnswers: {},
  };
}

/**
 * Construye el mensaje enriquecido con las respuestas de aclaración.
 * @param {object} state - ClarificationState
 * @returns {string}
 */
export function buildClarifiedMessage(state) {
  const { originalMessage, collectedAnswers } = state;
  const parts = [originalMessage];

  if (collectedAnswers.where_connect) {
    const ans = collectedAnswers.where_connect;
    if (ans.auto) {
      parts.push("Recomiéndame la mejor ubicación y configura todo automáticamente.");
    } else if (ans.target) {
      parts.push(`Conéctalo a ${ans.target}.`);
    }
  }

  return parts.join(" ");
}

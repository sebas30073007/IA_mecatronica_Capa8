// src/ai/modes.js
// Sistema de Nivel × Enfoque para la IA de CAPA 8.

export const NIVELES = {
  guiado: {
    label: "Guiado",
    snippet: `Explica paso a paso sin asumir conocimiento previo. Usa analogías simples. Advierte errores comunes del principiante. Termina con una pregunta de reflexión.`,
  },
  balanceado: {
    label: "Balanceado",
    snippet: `Sé directo y práctico. Responde en máximo 3 párrafos o una lista concisa. No sobre-expliques.`,
  },
  tecnico: {
    label: "Técnico",
    snippet: `Respuestas densas y precisas. Referencia RFC/IEEE/OSI cuando corresponda. Identifica proactivamente fallas de diseño. Trata al usuario como par técnico.`,
  },
};

export const ENFOQUES = {
  disenar: {
    label: "Diseñar",
    snippet: `Tu objetivo es ayudar a construir y completar topologías. Cuando el usuario describe una red, propón una estructura clara y emite acciones para crearla.`,
  },
  solver: {
    label: "Solver",
    snippet: `Tu objetivo es diagnosticar. Analiza la topología, detecta inconsistencias, explica el problema y propón correcciones concretas.`,
  },
};

export function getNivelSnippet(nivel) {
  return NIVELES[nivel]?.snippet || NIVELES.balanceado.snippet;
}

export function getEnfoqueSnippet(enfoque) {
  return ENFOQUES[enfoque]?.snippet || ENFOQUES.disenar.snippet;
}

export function normalizeNivel(nivel) {
  const n = (nivel || "").toLowerCase().trim();
  if (n === "guiado" || n === "junior") return "guiado";
  if (n === "tecnico" || n === "técnico" || n === "senior") return "tecnico";
  return "balanceado";
}

export function normalizeEnfoque(enfoque) {
  const e = (enfoque || "").toLowerCase().trim();
  if (e === "solver" || e.includes("problem")) return "solver";
  return "disenar";
}

/** Construye el system prompt base para chat (index.html). */
export function getSystemPrompt(nivel, enfoque) {
  const nivelKey = normalizeNivel(nivel);
  const enfoqueKey = normalizeEnfoque(enfoque);
  return [
    `Eres un asistente especializado en redes de computadoras llamado Capa_8. Responde SIEMPRE en español.`,
    ``,
    `Estilo de respuesta: ${getNivelSnippet(nivelKey)}`,
    ``,
    `Enfoque: ${getEnfoqueSnippet(enfoqueKey)}`,
  ].join("\n");
}

// Legacy shim — evita romper código que importe MODES
export const MODES = Object.fromEntries(
  Object.entries(NIVELES).map(([k, v]) => [k, v])
);

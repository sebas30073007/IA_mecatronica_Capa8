// src/ai/responseParser.js
// Centraliza el parsing de respuestas de la IA — extrae bloques CAPA8_ACTION.

const ACTION_REGEX = /\[CAPA8_ACTION\]([\s\S]*?)\[\/CAPA8_ACTION\]/g;

/**
 * Parsea el texto crudo de la IA y extrae acciones CAPA8.
 * @param {string} rawText
 * @returns {{ text: string, actions: Array<{raw,parsed,valid}>, clarificationAsked: boolean, clarificationQuestion: string|null }}
 */
export function parseResponse(rawText) {
  const text = typeof rawText === "string" ? rawText : "";

  const actions = [];
  const regex = new RegExp(ACTION_REGEX.source, ACTION_REGEX.flags);
  let m;
  while ((m = regex.exec(text)) !== null) {
    const json = m[1].trim();
    try {
      actions.push({ raw: json, parsed: JSON.parse(json), valid: true });
    } catch {
      actions.push({ raw: json, parsed: null, valid: false });
    }
  }

  // Remove action blocks from the displayed text
  const cleanText = text.replace(new RegExp(ACTION_REGEX.source, ACTION_REGEX.flags), "").trim();

  // Detect clarification question in the response
  const questionMatch = cleanText.match(/¿[^?]+\?/);
  const clarificationAsked = Boolean(questionMatch) && actions.length === 0;
  const clarificationQuestion = clarificationAsked ? questionMatch[0] : null;

  return { text: cleanText, actions, clarificationAsked, clarificationQuestion };
}

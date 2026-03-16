// src/ai/convStore.js
// Almacén compartido de conversación entre Home y Diagramas (sessionStorage).

const STORAGE_KEY = "capa8_shared_conv";
const MAX_MESSAGES = 40;

function defaultState() {
  return {
    messages: [],
    nivel: "balanceado",
    enfoque: "disenar",
    pendingClarification: null,
  };
}

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      nivel: parsed.nivel || "balanceado",
      enfoque: parsed.enfoque || "disenar",
      pendingClarification: parsed.pendingClarification || null,
    };
  } catch {
    return defaultState();
  }
}

function save(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

let _state = load();

export const convStore = {
  getState() { return _state; },

  addMessage(msg) {
    _state = { ..._state, messages: [..._state.messages, msg].slice(-MAX_MESSAGES) };
    save(_state);
    return _state;
  },

  setNivel(nivel) {
    _state = { ..._state, nivel };
    save(_state);
  },

  setEnfoque(enfoque) {
    _state = { ..._state, enfoque };
    save(_state);
  },

  /** Returns last N messages as { role, content } for the server. */
  getHistory(limit = 10) {
    return _state.messages.slice(-limit).map(m => ({ role: m.role, content: m.content }));
  },

  setPendingClarification(state) {
    _state = { ..._state, pendingClarification: state };
    save(_state);
  },

  clearClarification() {
    _state = { ..._state, pendingClarification: null };
    save(_state);
  },
};

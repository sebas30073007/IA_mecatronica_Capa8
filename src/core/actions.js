// src/core/actions.js
export const ActionTypes = Object.freeze({
  // UI
  SET_TOOL: "SET_TOOL",
  SET_SELECTION: "SET_SELECTION",
  CLEAR_SELECTION: "CLEAR_SELECTION",

  // Graph edit
  ADD_NODE: "ADD_NODE",
  MOVE_NODE: "MOVE_NODE",
  UPDATE_NODE: "UPDATE_NODE",
  DELETE_NODE: "DELETE_NODE",

  // Reposicionar muchos nodos de una vez. Existe porque cada dispatch
  // clona el estado entero y repinta el lienzo completo: aplicar un layout
  // de 40 nodos con MOVE_NODE costaba 40 clones y 40 repintados.
  APPLY_LAYOUT: "APPLY_LAYOUT",

  ADD_LINK: "ADD_LINK",
  UPDATE_LINK: "UPDATE_LINK",
  DELETE_LINK: "DELETE_LINK",

  // Persistence
  LOAD_GRAPH: "LOAD_GRAPH",
  NEW_GRAPH: "NEW_GRAPH",

  // Simulation / runtime
  SET_SIM_SPEED: "SET_SIM_SPEED",

  // Resaltado didáctico del lienzo (camino de un ping, dónde falló…).
  // Es estado de presentación, no del grafo: no entra en el historial.
  SET_HIGHLIGHT: "SET_HIGHLIGHT",
  CLEAR_HIGHLIGHT: "CLEAR_HIGHLIGHT",

  // Terminal
  TERMINAL_APPEND: "TERMINAL_APPEND",
  TERMINAL_CLEAR: "TERMINAL_CLEAR",

  // Canvas UI
  TOGGLE_IP_LABELS: "TOGGLE_IP_LABELS",
  // Identificador de acción de la barra de menús, no del store: el reducer
  // no tiene case para él, lo atiende main.js.
  PRETTY_LAYOUT: "PRETTY_LAYOUT",
});

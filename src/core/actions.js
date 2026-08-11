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
  PRETTY_LAYOUT:       "PRETTY_LAYOUT",
  PRETTY_LAYOUT_SUAVE: "PRETTY_LAYOUT_SUAVE",
});

// src/app/reducer.js
import { ActionTypes } from "../core/actions.js";
import { createDemoGraph, createEmptyGraph, normalizeGraph } from "../model/schema.js";
import { hasLinkBetween } from "../model/graph.js";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createInitialState() {
  return {
    graph: createDemoGraph(),
    ui: {
      tool: "select", // select|router|switch|pc|link
      selection: null, // {kind:'node'|'link', id}
      showIpLabels: true,
    },
    sim: {
      running: false,
      speed: 1,
    },
    terminalLog: "",
  };
}

export function reducer(state, action) {
  const next = deepClone(state);

  // ── Casos del reducer ─────────────────────────────────────────────────
  switch (action.type) {
    case ActionTypes.SET_TOOL: {
      next.ui.tool = action.payload.tool;
      return next;
    }

    case ActionTypes.SET_SELECTION: {
      next.ui.selection = action.payload.selection;
      return next;
    }

    case ActionTypes.CLEAR_SELECTION: {
      next.ui.selection = null;
      return next;
    }

    case ActionTypes.ADD_NODE: {
      next.graph.nodes.push(action.payload.node);
      next.graph.meta.updatedAt = Date.now();
      next.ui.selection = { kind: "node", id: action.payload.node.id };
      return next;
    }

    case ActionTypes.MOVE_NODE: {
      const n = next.graph.nodes.find(x => x.id === action.payload.id);
      if (!n) return state;
      n.x = action.payload.x;
      n.y = action.payload.y;
      next.graph.meta.updatedAt = Date.now();
      return next;
    }

    case ActionTypes.UPDATE_NODE: {
      const n = next.graph.nodes.find(x => x.id === action.payload.id);
      if (!n) return state;
      Object.assign(n, action.payload.patch || {});
      next.graph.meta.updatedAt = Date.now();
      return next;
    }

    case ActionTypes.DELETE_NODE: {
      const id = action.payload.id;
      next.graph.nodes = next.graph.nodes.filter(n => n.id !== id);
      next.graph.links = next.graph.links.filter(l => l.source !== id && l.target !== id);
      next.graph.meta.updatedAt = Date.now();
      next.ui.selection = null;
      return next;
    }

    case ActionTypes.ADD_LINK: {
      const { link } = action.payload;
      if (hasLinkBetween(next.graph, link.source, link.target)) return state;
      next.graph.links.push(link);
      next.graph.meta.updatedAt = Date.now();
      next.ui.selection = { kind: "link", id: link.id };
      return next;
    }

    case ActionTypes.UPDATE_LINK: {
      const l = next.graph.links.find(x => x.id === action.payload.id);
      if (!l) return state;
      Object.assign(l, action.payload.patch || {});
      next.graph.meta.updatedAt = Date.now();
      return next;
    }

    case ActionTypes.DELETE_LINK: {
      const id = action.payload.id;
      next.graph.links = next.graph.links.filter(l => l.id !== id);
      next.graph.meta.updatedAt = Date.now();
      if (next.ui.selection?.kind === "link" && next.ui.selection.id === id) next.ui.selection = null;
      return next;
    }

    case ActionTypes.LOAD_GRAPH: {
      next.graph = normalizeGraph(action.payload.graph);
      next.ui.selection = null;
      return next;
    }

    case ActionTypes.NEW_GRAPH: {
      next.graph = createEmptyGraph();
      next.ui.selection = null;
      next.terminalLog = "";
      return next;
    }

    case ActionTypes.TOGGLE_RUN: {
      next.sim.running = !next.sim.running;
      return next;
    }

    case ActionTypes.SET_SIM_SPEED: {
      next.sim.speed = action.payload.speed;
      return next;
    }

    case ActionTypes.TERMINAL_APPEND: {
      next.terminalLog = (next.terminalLog || "") + String(action.payload || "");
      return next;
    }

    case ActionTypes.TERMINAL_CLEAR: {
      next.terminalLog = "";
      return next;
    }

    case ActionTypes.TOGGLE_IP_LABELS: {
      next.ui.showIpLabels = !state.ui.showIpLabels;
      return next;
    }

    default:
      return state;
  }
}

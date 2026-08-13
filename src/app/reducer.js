// src/app/reducer.js
import { ActionTypes } from "../core/actions.js";
// createDemoGraph ya no se usa aquí: el arranque es vacío y el demo lo
// despacha main.js en la acción RESET_DEMO.
import { createEmptyGraph, normalizeGraph } from "../model/schema.js";
import { hasLinkBetween } from "../model/graph.js";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createInitialState() {
  return {
    // Arranca VACÍO, no con el demo.
    //
    // Con el demo de 4 nodos, la primera pantalla de un alumno era una
    // topología cualquiera sin explicación, y el estado vacío —que es
    // donde se ofrecen las 11 topologías y el «descríbeme tu red»— no
    // llegaba a verse nunca.
    //
    // El demo no se pierde: sigue en Archivo → Reset, y las topologías
    // de la galería son bastante más ricas que él.
    //
    // Si hay algo guardado (autosave) o viene un ?g= en la URL, main.js
    // despacha LOAD_GRAPH justo después y este vacío no se llega a ver.
    graph: createEmptyGraph(),
    ui: {
      tool: "select", // select|router|switch|pc|link
      selection: null, // {kind:'node'|'link', id}
      showIpLabels: true,
      // { linkIds[], nodeIds[], failLinkId, failNodeId } — lo pinta el
      // renderer para señalar el camino de un ping o dónde se rompió.
      highlight: null,
    },
    // `running` desapareció: la animación corre sola cuando hay paquetes.
    // `speed` es el multiplicador del selector 0.5× / 1× / 2×.
    sim: {
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

    // Reposicionamiento masivo (Pretty, ajuste a rejilla, colisiones).
    // Un solo clon del estado y un solo repintado para todo el lote.
    case ActionTypes.APPLY_LAYOUT: {
      const moves = action.payload?.moves;
      if (!Array.isArray(moves) || moves.length === 0) return state;
      const byId = new Map(next.graph.nodes.map(n => [n.id, n]));
      let changed = 0;
      for (const m of moves) {
        const n = byId.get(m.id);
        if (!n) continue;
        n.x = m.x;
        n.y = m.y;
        changed++;
      }
      if (changed === 0) return state;
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

    case ActionTypes.SET_HIGHLIGHT: {
      const h = action.payload || {};
      next.ui.highlight = {
        linkIds:    Array.isArray(h.linkIds) ? h.linkIds : [],
        nodeIds:    Array.isArray(h.nodeIds) ? h.nodeIds : [],
        failLinkId: h.failLinkId || null,
        failNodeId: h.failNodeId || null,
      };
      return next;
    }

    case ActionTypes.CLEAR_HIGHLIGHT: {
      next.ui.highlight = null;
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

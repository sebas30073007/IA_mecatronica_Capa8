// src/ai/actionDispatcher.js
// Despacha acciones CAPA8 al store con validación previa.
// Extraído de main.js para reducir su tamaño y facilitar el testing.

import { validateAction } from "./actionValidator.js";
import { positionNewNode, resolveAndDispatch } from "../app/positionManager.js";

// Umbral de nodos añadidos para auto-pretty tras un batch
const AUTO_PRETTY_THRESHOLD = 4;

/**
 * Fábrica del despachador de acciones IA.
 * @param {{ store, dispatch, ActionTypes, showToast, getChatPanel, pushHistorySnapshot, uid, postBatchCallback? }} deps
 */
export function createActionDispatcher({
  store,
  dispatch,
  ActionTypes,
  showToast,
  getChatPanel,
  pushHistorySnapshot,
  uid,
  postBatchCallback,
}) {
  // ── Aplicador atómico (sin push de historial — el caller decide) ──────
  function applyAction(action, graph) {
    if (action.action === "add_node") {
      // Posición siempre decidida por el frontend; coordenadas de la IA ignoradas
      const pos = positionNewNode(action, graph);
      const node = {
        id: uid("n"),
        type: action.type || "router",
        label: action.label || "Node",
        x: pos.x,
        y: pos.y,
        ip: action.ip || "",
      };
      dispatch({ type: ActionTypes.ADD_NODE, payload: { node } });
      showToast(`Nodo "${node.label}" agregado ✅`);
      return {};
    }

    if (action.action === "add_link") {
      const graph2 = store.getState().graph;
      const srcNode = graph2.nodes.find(n => n.label === action.sourceLabel || n.id === action.sourceId);
      const tgtNode = graph2.nodes.find(n => n.label === action.targetLabel || n.id === action.targetId);
      const link = {
        id: uid("l"),
        source: srcNode.id,
        target: tgtNode.id,
        latencyMs: action.latencyMs ?? 10,
        bandwidthMbps: action.bandwidthMbps ?? 100,
        lossPct: 0,
        status: "up",
      };
      dispatch({ type: ActionTypes.ADD_LINK, payload: { link } });
      showToast("Enlace creado ✅");
      return {};
    }

    if (action.action === "delete_node") {
      const graph2 = store.getState().graph;
      const node = graph2.nodes.find(n => n.label === action.label || n.id === action.id);
      dispatch({ type: ActionTypes.DELETE_NODE, payload: { id: node.id } });
      showToast(`Nodo "${node.label}" eliminado ✅`);
      return {};
    }

    if (action.action === "delete_link") {
      const graph2 = store.getState().graph;
      const srcNode = graph2.nodes.find(n => n.label === action.sourceLabel || n.id === action.sourceId);
      const tgtNode = graph2.nodes.find(n => n.label === action.targetLabel || n.id === action.targetId);
      const link = graph2.links.find(l =>
        (l.source === srcNode.id && l.target === tgtNode.id) ||
        (l.source === tgtNode.id && l.target === srcNode.id)
      );
      dispatch({ type: ActionTypes.DELETE_LINK, payload: { id: link.id } });
      showToast("Enlace eliminado ✅");
      return {};
    }

    if (action.action === "set_link_status") {
      const graph2 = store.getState().graph;
      const srcNode = graph2.nodes.find(n => n.label === action.sourceLabel || n.id === action.sourceId);
      const tgtNode = graph2.nodes.find(n => n.label === action.targetLabel || n.id === action.targetId);
      const link = graph2.links.find(l =>
        (l.source === srcNode.id && l.target === tgtNode.id) ||
        (l.source === tgtNode.id && l.target === srcNode.id)
      );
      dispatch({ type: ActionTypes.UPDATE_LINK, payload: { id: link.id, patch: { status: action.status } } });
      showToast("Estado del enlace actualizado ✅");
      return {};
    }

    if (action.action === "update_node") {
      const graph2 = store.getState().graph;
      const node   = graph2.nodes.find(n => n.label === action.label || n.id === action.id);
      dispatch({ type: ActionTypes.UPDATE_NODE, payload: { id: node.id, patch: action.patch } });
      showToast(`Nodo "${node.label}" actualizado ✅`);
      return {};
    }

    if (action.action === "apply_graph") {
      dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: action.graph } });
      // Resolver colisiones tras apply_graph (los nodos pueden llegar sin coordenadas)
      requestAnimationFrame(() => resolveAndDispatch(store, dispatch, ActionTypes, null));
      showToast("Topología aplicada ✅");
      return {};
    }

    return { error: `Acción desconocida: "${action.action}"` };
  }

  // ── Acción individual con validación ─────────────────────────────────
  function handleAIAction(action) {
    const graph = store.getState().graph;
    const validation = validateAction(action, graph);
    if (!validation.valid) {
      showToast("Acción inválida ❌");
      getChatPanel()?.appendErrorMessage(validation.error);
      return { error: validation.error };
    }
    pushHistorySnapshot();
    return applyAction(action, graph);
  }

  // ── Lote de acciones — un único paso de undo ─────────────────────────
  function handleAIActions(actionsArray) {
    if (!Array.isArray(actionsArray) || actionsArray.length === 0) {
      return { applied: 0, errors: ["Lista de acciones vacía."] };
    }

    pushHistorySnapshot();
    let applied   = 0;
    let nodesAdded = 0;
    const errors  = [];

    for (const action of actionsArray) {
      const graph = store.getState().graph; // refrescar tras cada dispatch
      const validation = validateAction(action, graph);
      if (!validation.valid) {
        errors.push(validation.error);
        continue;
      }
      const result = applyAction(action, graph);
      if (result?.error) errors.push(result.error);
      else {
        applied++;
        if (action.action === "add_node") nodesAdded++;
      }
    }

    // Resolver colisiones tras el batch
    requestAnimationFrame(() => resolveAndDispatch(store, dispatch, ActionTypes, null));

    // Auto-pretty si se agregaron suficientes nodos
    if (nodesAdded >= AUTO_PRETTY_THRESHOLD && typeof postBatchCallback === "function") {
      requestAnimationFrame(() => requestAnimationFrame(postBatchCallback));
    }

    return { applied, errors };
  }

  return { handleAIAction, handleAIActions };
}

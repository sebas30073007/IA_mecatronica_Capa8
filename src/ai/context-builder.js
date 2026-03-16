// src/ai/context-builder.js
// Serializa el grafo actual en texto legible para la IA.
import { analyzeTopology } from "./topology-analyzer.js";

/**
 * Convierte el estado del grafo en un bloque de contexto para el system prompt.
 * @param {object} graph - Grafo v3 del store
 * @param {object|null} selection - { kind: 'node'|'link', id } del store.ui.selection
 * @returns {string} Texto listo para insertar en el prompt
 */
export function buildGraphContext(graph, selection = null) {
  if (!graph || !graph.nodes?.length) {
    return "El canvas está vacío (sin nodos).";
  }

  const { nodes, links } = graph;
  const lines = [];

  lines.push(`Topología actual: ${nodes.length} nodo(s), ${links.length} enlace(s).`);

  // Dispositivos
  const byType = {};
  for (const n of nodes) {
    byType[n.type] = byType[n.type] || [];
    byType[n.type].push(n);
  }
  for (const [type, list] of Object.entries(byType)) {
    lines.push(`  ${type.toUpperCase()}s: ${list.map(n => `${n.label} [id:${n.id}, pos:${Math.round(n.x)},${Math.round(n.y)}] (${n.ip || "sin IP"})`).join(", ")}`);
  }

  // Enlaces con propiedades
  if (links.length > 0) {
    lines.push("Conexiones:");
    for (const l of links) {
      const a = nodes.find(n => n.id === l.source);
      const b = nodes.find(n => n.id === l.target);
      if (!a || !b) continue;
      const status = l.status === "down" ? " [DOWN]" : "";
      const loss = l.lossPct > 0 ? ` loss=${l.lossPct}%` : "";
      lines.push(`  ${a.label} ↔ ${b.label}: ${l.latencyMs}ms / ${l.bandwidthMbps}Mbps${loss}${status} [id:${l.id}]`);
    }
  }

  // Elemento seleccionado actualmente en el canvas
  if (selection) {
    if (selection.kind === "node") {
      const sel = nodes.find(n => n.id === selection.id);
      if (sel) lines.push(`Elemento seleccionado: ${sel.type} "${sel.label}" (${sel.ip || "sin IP"})`);
    } else if (selection.kind === "link") {
      const selLink = links.find(l => l.id === selection.id);
      if (selLink) {
        const a = nodes.find(n => n.id === selLink.source);
        const b = nodes.find(n => n.id === selLink.target);
        if (a && b) lines.push(`Enlace seleccionado: ${a.label} ↔ ${b.label}`);
      }
    }
  }

  // Problemas detectados
  const issues = analyzeTopology(graph);
  if (issues.length > 0) {
    lines.push("Problemas detectados:");
    for (const issue of issues) {
      const prefix = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`  ${prefix} ${issue.message}`);
    }
  } else {
    lines.push("No se detectaron problemas evidentes en la topología.");
  }

  return lines.join("\n");
}

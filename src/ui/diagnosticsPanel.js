// src/ui/diagnosticsPanel.js
//
// Hace visible lo que topology-analyzer ya sabía.
//
// Las 8 reglas del analyzer llevaban tiempo produciendo diagnósticos con
// severidad y texto redactado, y el usuario solo veía un número en un badge.
// Este panel los lista, deja saltar al elemento culpable y ofrece pedirle la
// corrección a la IA.
//
// Para uso en clase esto no es un linter: es la respuesta a «¿lo hice bien?»
// sin tener que preguntarle al profesor.

import { analyzeTopology } from "../ai/topology-analyzer.js";
import { typeSwatch, typeChip, typeCensus, typeCount, typeName } from "./typeTag.js";

const SEV_ORDER = { error: 0, warning: 1, info: 2 };

// El icono y la etiqueta acompañan siempre al color: la severidad se lee
// sin depender de él.
const SEV_META = {
  error:   { icon: "fa-circle-exclamation", label: "Error" },
  warning: { icon: "fa-triangle-exclamation", label: "Aviso" },
  info:    { icon: "fa-circle-info", label: "Nota" },
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * @param {Object} deps
 * @param {HTMLElement} deps.container       - #diag-panel
 * @param {(id:string)=>void} deps.onSelectNode
 * @param {(id:string)=>void} deps.onSelectLink
 * @param {(issue:object)=>void} deps.onFixRequest - manda el issue a la IA
 */
export function createDiagnosticsPanel({ container, onSelectNode, onSelectLink, onFixRequest }) {
  if (!container) return null;

  let lastIssues = [];

  container.addEventListener("click", e => {
    const row = e.target.closest("[data-issue-idx]");
    if (!row) return;
    const issue = lastIssues[Number(row.dataset.issueIdx)];
    if (!issue) return;

    if (e.target.closest(".diag-fix")) {
      onFixRequest?.(issue);
      return;
    }
    // Cualquier otro punto de la fila salta al elemento
    if (issue.nodeId) onSelectNode?.(issue.nodeId);
    else if (issue.linkId) onSelectLink?.(issue.linkId);
  });

  /**
   * Recalcula y, si el panel está visible, repinta.
   * Devuelve los conteos para el badge de la pestaña.
   *
   * El repintado se salta cuando el panel está cerrado: esto corre en
   * cada dispatch del store, y reconstruir el innerHTML a ciegas gastaba
   * trabajo y tiraba el foco de quien estuviera recorriendo la lista
   * con el teclado.
   */
  function render(graph) {
    const issues = analyzeTopology(graph)
      .slice()
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    lastIssues = issues;

    const errors = issues.filter(i => i.severity === "error").length;
    const warns  = issues.filter(i => i.severity === "warning").length;

    if (!container.classList.contains("open")) return { errors, warnings: warns };

    if (graph.nodes.length === 0) {
      container.innerHTML = `
        <div class="diag-header"><span class="diag-title">Revisión</span></div>
        <div class="diag-empty">
          <i class="fa-solid fa-wave-square" aria-hidden="true"></i>
          <p>Cuando construyas algo, aquí aparecerán los problemas que encuentre.</p>
        </div>`;
      return { errors: 0, warnings: 0 };
    }

    if (issues.length === 0) {
      container.innerHTML = `
        <div class="diag-header"><span class="diag-title">Revisión</span></div>
        <div class="diag-empty diag-empty--ok">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
          <p>Sin problemas detectados.</p>
          <div class="diag-census">
            ${typeCensus(graph.nodes)
              .map(({ type, count }) => typeChip(type, typeCount(type, count)))
              .join("")}
          </div>
          <span class="diag-empty-sub">
            ${graph.links.length} enlace${graph.links.length === 1 ? "" : "s"}
          </span>
        </div>`;
      return { errors: 0, warnings: 0 };
    }

    const rows = issues.map((issue, idx) => {
      const meta = SEV_META[issue.severity] || SEV_META.info;
      // Solo se ofrece corrección automática donde la IA puede actuar
      // sobre un nodo concreto. Un enlace caído se arregla en el inspector.
      const fixable = Boolean(issue.nodeId);
      // De qué dispositivo habla el problema. El borde y el icono siguen
      // siendo de severidad —ahí el color sí es estado—; el punto dice de
      // qué tipo es el culpable, que es un dato distinto.
      const culpable = issue.nodeId
        ? graph.nodes.find(n => n.id === issue.nodeId)
        : null;
      return `
        <li class="diag-row diag-row--${esc(issue.severity)}" data-issue-idx="${idx}" tabindex="0">
          <i class="fa-solid ${meta.icon} diag-icon" aria-hidden="true"></i>
          <span class="diag-sev">${meta.label}</span>
          <span class="diag-msg">${
            culpable ? typeSwatch(culpable.type, typeName(culpable.type)) : ""
          }${esc(issue.message)}</span>
          ${fixable ? `<button class="diag-fix" type="button" title="Pedirle a la IA que lo corrija">
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          </button>` : ""}
        </li>`;
    }).join("");

    container.innerHTML = `
      <div class="diag-header">
        <span class="diag-title">Revisión</span>
        <span class="diag-counts">
          ${errors ? `<span class="diag-count diag-count--error">${errors} error${errors > 1 ? "es" : ""}</span>` : ""}
          ${warns  ? `<span class="diag-count diag-count--warning">${warns} aviso${warns > 1 ? "s" : ""}</span>` : ""}
        </span>
      </div>
      <ul class="diag-list">${rows}</ul>
      <p class="diag-foot">Toca un problema para ir al dispositivo.</p>`;

    return { errors, warnings: warns };
  }

  return { render };
}

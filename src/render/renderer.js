// src/render/renderer.js
import { getNodeBox } from "./hitTest.js";
import { FANOUT_THRESHOLD } from "../app/prettyLayout.js";

// Construye el conjunto de IDs de switches con fan-out alto (Regla 9)
function buildHighFanoutSet(graph) {
  const result = new Set();
  for (const n of graph.nodes) {
    if (n.type !== "switch") continue;
    const pcNeighbors = graph.links.filter(l => {
      const nbId = l.source === n.id ? l.target : l.target === n.id ? l.source : null;
      if (!nbId) return false;
      return graph.nodes.find(x => x.id === nbId)?.type === "pc";
    }).length;
    if (pcNeighbors >= FANOUT_THRESHOLD) result.add(n.id);
  }
  return result;
}

// ── Paletas de color por tema ───────────────────────────────────────────────
const ICON_COLORS = {
  dark:  { router:"#60a5fa", switch:"#22d3ee", pc:"#a78bfa", firewall:"#f87171", server:"#34d399", cloud:"#7dd3fc", ap:"#fbbf24", plc:"#a78bfa", ur3:"#38bdf8", agv:"#fb923c" },
  light: { router:"#2563eb", switch:"#0891b2", pc:"#7c3aed", firewall:"#dc2626", server:"#059669", cloud:"#3b82f6", ap:"#d97706", plc:"#6d28d9", ur3:"#0369a1", agv:"#c2410c" },
};

// Light mode: fondo sólido de color por tipo (el SVG se renderiza en blanco)
const BUBBLE_COLORS_LIGHT = {
  router:"#2563eb", switch:"#0891b2", pc:"#7c3aed", firewall:"#dc2626",
  server:"#059669", cloud:"#3b82f6", ap:"#d97706", plc:"#6d28d9",
  ur3:"#0369a1", agv:"#c2410c",
};

// ── Íconos SVG por tipo de nodo (funciones que reciben el color) ────────────
export const NODE_ICON_FN = {
  router: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="22" stroke="${c}" stroke-width="1.8"/>
    <line x1="25" y1="21" x2="25" y2="13" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,10 21.5,15 28.5,15" fill="${c}"/>
    <line x1="25" y1="29" x2="25" y2="37" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,40 21.5,35 28.5,35" fill="${c}"/>
    <line x1="32" y1="25" x2="40" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="29,25 34,21.5 34,28.5" fill="${c}"/>
    <line x1="10" y1="25" x2="18" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="21,25 16,21.5 16,28.5" fill="${c}"/>
  </svg>`,

  switch: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="18" width="42" height="14" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="8"  y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2"/>
    <rect x="15" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".8"/>
    <rect x="22" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".6"/>
    <rect x="29" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".4"/>
    <circle cx="39" cy="25" r="2.2" fill="${c}"/>
  </svg>`,

  pc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="11" width="36" height="22" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="10" y="14" width="30" height="16" rx="1.5" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <line x1="14" y1="19" x2="28" y2="19" stroke="${c}" stroke-width="1" opacity=".5" stroke-linecap="round"/>
    <line x1="14" y1="22" x2="36" y2="22" stroke="${c}" stroke-width="1" opacity=".35" stroke-linecap="round"/>
    <line x1="14" y1="25" x2="22" y2="25" stroke="${c}" stroke-width="1" opacity=".25" stroke-linecap="round"/>
    <line x1="25" y1="33" x2="25" y2="38" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="16" y1="41" x2="34" y2="41" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="16" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="34" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  firewall: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 5L9 13v12c0 10 7 18 16 20 9-2 16-10 16-20V13L25 5z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="18" y="26" width="14" height="10" rx="2" stroke="${c}" stroke-width="1.5" fill="none"/>
    <path d="M20 26v-3a5 5 0 0110 0v3" stroke="${c}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="31" r="2" fill="${c}"/>
  </svg>`,

  server: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="9"  width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="21" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="33" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="10" y="11.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="23.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="35.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <circle cx="37" cy="13.5" r="2" fill="${c}"/>
    <circle cx="37" cy="25.5" r="2" fill="${c}" opacity=".6"/>
    <circle cx="37" cy="37.5" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  cloud: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M36 30H17a8 8 0 01-1-15.9A10 10 0 0133 16a7 7 0 013 12z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <line x1="19" y1="37" x2="19" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="39" x2="25" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="31" y1="37" x2="31" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="19" cy="38.5" r="1.5" fill="${c}"/>
    <circle cx="25" cy="40.5" r="1.5" fill="${c}"/>
    <circle cx="31" cy="38.5" r="1.5" fill="${c}"/>
  </svg>`,

  ap: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 15 A24 24 0 0 1 42 15" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M13 20 A17 17 0 0 1 37 20" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M18 25 A10 10 0 0 1 32 25" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="26" r="2.5" fill="${c}"/>
    <line x1="25" y1="28.5" x2="25" y2="33" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="16" y="33" width="18" height="5" rx="2.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="29" cy="35.5" r="1.2" fill="${c}" opacity=".7"/>
  </svg>`,

  plc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="10" width="34" height="28" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="12" y="14" width="26" height="7" rx="1" stroke="${c}" stroke-width="1.2" opacity=".5" fill="none"/>
    <circle cx="14" cy="27" r="2" fill="${c}"/>
    <circle cx="21" cy="27" r="2" fill="${c}" opacity=".6"/>
    <circle cx="28" cy="27" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  ur3: (c) => `<svg viewBox="4 18 42 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="39" width="12" height="5" rx="2.5" fill="${c}" opacity=".8"/>
    <rect x="11" y="34" width="6" height="6" rx="1" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="3" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="1" fill="${c}"/>
    <line x1="14" y1="33" x2="19" y2="23" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="20" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="20" cy="22" r="0.9" fill="${c}"/>
    <line x1="20" y1="22" x2="32" y2="22" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="33" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="33" cy="22" r="0.9" fill="${c}"/>
    <line x1="33" y1="22" x2="35" y2="33" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="35" cy="34" r="2.3" stroke="${c}" stroke-width="1.3" fill="none"/>
    <line x1="32" y1="36" x2="29" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="38" y1="36" x2="41" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="32" y1="37.5" x2="38" y2="37.5" stroke="${c}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
  </svg>`,

  agv: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="15" width="30" height="20" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <path d="M13 18 L8 22 L8 28 L13 32" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="14" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="14" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="8" cy="25" r="1.5" fill="${c}"/>
  </svg>`,
};

// Devuelve el <div class="node-icon"> completo con color/fondo según el tema activo.
// Dark mode : SVG de color semántico + fondo tint vía CSS.
// Light mode: SVG blanco + fondo sólido del color semántico (inline style).
function getNodeIconHTML(type) {
  const isLight  = document.documentElement.dataset.theme === "light";
  const color    = isLight ? "#ffffff" : (ICON_COLORS.dark[type] ?? ICON_COLORS.dark.pc);
  const fn       = NODE_ICON_FN[type] ?? NODE_ICON_FN.pc;
  const stylePart = isLight
    ? ` style="background:${BUBBLE_COLORS_LIGHT[type] ?? BUBBLE_COLORS_LIGHT.pc}"`
    : "";
  return `<div class="node-icon"${stylePart}>${fn(color)}</div>`;
}

// Rastrea IDs de nodos ya renderizados para detectar nodos nuevos
const _seenNodeIds = new Set();

/**
 * Calcula en una sola pasada BFS el estado de cada nodo:
 * - connected : tiene al menos 1 enlace activo
 * - hasInternet: su componente conectada incluye un nodo tipo "cloud"
 */
function computeNodeStatuses(graph) {
  const { nodes, links } = graph;

  // Adyacencia solo con enlaces activos (status !== "down")
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    if (l.status === "down") continue;
    if (adj.has(l.source)) adj.get(l.source).push(l.target);
    if (adj.has(l.target)) adj.get(l.target).push(l.source);
  }

  const cloudIds = new Set(nodes.filter(n => n.type === "cloud").map(n => n.id));
  const connected   = new Map();
  const hasInternet = new Map();
  for (const n of nodes) {
    connected.set(n.id, (adj.get(n.id) || []).length > 0);
    hasInternet.set(n.id, false);
  }

  // BFS por componentes — si la componente tiene un cloud, todos ganan internet
  const visited = new Set();
  function bfsComponent(startId) {
    const comp = [];
    const q = [startId];
    visited.add(startId);
    while (q.length) {
      const cur = q.shift();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    return comp;
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const comp = bfsComponent(n.id);
      if (comp.some(id => cloudIds.has(id))) {
        for (const id of comp) hasInternet.set(id, true);
      }
    }
  }

  return { connected, hasInternet };
}

export function renderStage({ stageEl, svgEl, worldEl, state, dispatch, ActionTypes, runtime }) {
  const graph = state.graph;
  const ui = state.ui;

  // ── 1) SVG: enlaces + paquetes ───────────────────────────────────────
  // viewBox fijo en coordenadas mundo (4000×4000); el zoom/pan está en worldEl.transform
  svgEl.innerHTML = "";
  svgEl.setAttribute("viewBox", "0 0 4000 4000");
  svgEl.setAttribute("overflow", "visible"); // evita clip de enlaces en coordenadas fuera del viewBox

  // Links
  const NODE_EDGE_RADIUS = 26;
  const highFanout = buildHighFanoutSet(graph); // switches con fan-out alto

  for (const link of graph.links) {
    const a = graph.nodes.find(n => n.id === link.source);
    const b = graph.nodes.find(n => n.id === link.target);
    if (!a || !b) continue;

    // Regla 9: enlace fan-out = switch de alta densidad → PC directa
    const isFanoutLink = (highFanout.has(link.source) && b.type === "pc")
                      || (highFanout.has(link.target) && a.type === "pc");

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    const x1 = a.x + ux * NODE_EDGE_RADIUS;
    const y1 = a.y + uy * NODE_EDGE_RADIUS;
    const x2 = b.x - ux * NODE_EDGE_RADIUS;
    const y2 = b.y - uy * NODE_EDGE_RADIUS;

    const isSelected = ui.selection?.kind === "link" && ui.selection.id === link.id;
    const isLight = document.documentElement.dataset.theme === "light";

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", isSelected
      ? (isLight ? "#1a237e" : "#2d35a8")
      : (isLight ? "#3344bb" : "#4a55d4"));
    line.setAttribute("stroke-width", isSelected ? "3.5" : "2");
    // Fan-out links: opacidad reducida para no saturar visualmente (Regla 9)
    const baseOpacity = isLight ? 0.55 : 0.6;
    line.setAttribute("opacity", link.status === "down" ? "0.22" : isFanoutLink ? (isLight ? "0.25" : "0.3") : String(baseOpacity));
    line.setAttribute("stroke-dasharray", link.status === "down" ? "8 6" : "none");
    svgEl.appendChild(line);

    // Label del enlace — omitido en enlaces fan-out para reducir ruido (Regla 9)
    if (!isFanoutLink || isSelected) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const text = `${link.latencyMs ?? 10}ms • ${link.bandwidthMbps ?? 100}Mb`;
      const w = Math.max(60, text.length * 5.5);

      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", String(mx - w/2));
      bg.setAttribute("y", String(my - 8));
      bg.setAttribute("width", String(w));
      bg.setAttribute("height", "16");
      bg.setAttribute("rx", "5");
      bg.setAttribute("fill", isLight ? "rgba(255,255,255,0.88)" : "rgba(10,10,20,0.5)");
      bg.setAttribute("stroke", isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)");
      bg.setAttribute("stroke-width", "1");
      bg.setAttribute("opacity", "1");
      svgEl.appendChild(bg);

      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", String(mx));
      t.setAttribute("y", String(my + 3));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("fill", isLight ? "rgba(30,40,100,0.75)" : "rgba(180,190,220,0.7)");
      t.setAttribute("font-size", "9");
      t.setAttribute("font-weight", "500");
      t.setAttribute("font-family", "Inter, system-ui, sans-serif");
      t.setAttribute("text-rendering", "geometricPrecision");
      t.textContent = text;
      svgEl.appendChild(t);
    }
  }

  // Packets
  for (const p of runtime.packets) {
    const link = graph.links.find(l => l.id === p.linkId);
    if (!link) continue;
    const a = graph.nodes.find(n => n.id === link.source);
    const b = graph.nodes.find(n => n.id === link.target);
    if (!a || !b) continue;

    const start = p.direction === "ab" ? a : b;
    const end = p.direction === "ab" ? b : a;

    const x = start.x + (end.x - start.x) * p.progress;
    const y = start.y + (end.y - start.y) * p.progress;

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", "#4a55d4");
    dot.setAttribute("stroke", "#ffffff");
    dot.setAttribute("stroke-width", "2");
    dot.setAttribute("opacity", p.kind === "icmp" ? "1" : "0.7");
    dot.setAttribute("filter", "drop-shadow(0 0 4px rgba(74,85,212,0.5))");
    svgEl.appendChild(dot);
  }

  // 2) DOM nodes — dentro del world container
  worldEl.querySelectorAll(".node").forEach(n => n.remove());

  const { connected, hasInternet } = computeNodeStatuses(graph);

  for (const node of graph.nodes) {
    const isNew      = !_seenNodeIds.has(node.id);
    _seenNodeIds.add(node.id);

    const isSelected = ui.selection?.kind === "node" && ui.selection.id === node.id;
    const isConn     = connected.get(node.id);
    const isNet      = hasInternet.get(node.id);

    const el = document.createElement("div");
    el.className = `node ${node.type}${isSelected ? " selected" : ""}${isNew ? " node--entering" : ""}`;
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top  = `${node.y}px`;

    el.innerHTML = `
      <div class="node-label">${node.label}</div>
      ${getNodeIconHTML(node.type)}
      <div class="node-meta" style="display:${ui.showIpLabels === false ? "none" : ""}">${node.ip || "sin IP"}</div>
      <div class="node-indicators">
        <span class="node-ind node-ind--link ${isConn ? "on" : "off"}"
              title="${isConn ? "Conectado" : "Sin conexiones"}"></span>
        <span class="node-ind node-ind--net ${isNet ? "on" : "off"}"
              title="${isNet ? "Internet disponible" : "Sin internet"}"></span>
      </div>
    `;

    worldEl.appendChild(el);
  }

  // Limpiar IDs de nodos eliminados para que reaparezcan con animación si se re-agregan
  const currentIds = new Set(graph.nodes.map(n => n.id));
  for (const id of _seenNodeIds) {
    if (!currentIds.has(id)) _seenNodeIds.delete(id);
  }
}

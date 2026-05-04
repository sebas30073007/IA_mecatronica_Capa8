// src/app/main.js
import { createStore } from "../core/store.js";
import { ActionTypes } from "../core/actions.js";
import { createHistory } from "../core/history.js";
import { createInitialState, reducer } from "./reducer.js";

import { createMenuBar } from "../ui/menuBar.js";
import { bindShortcuts } from "../ui/shortcutManager.js";
import { showToast } from "../ui/toast.js";
import { createInspector } from "../ui/inspectorPanel.js";
import { createTerminalPanel } from "../ui/terminalPanel.js";

import { renderStage, NODE_ICON_FN } from "../render/renderer.js";
import { hitTestLink } from "../render/hitTest.js";

import { importGraphFromURL, exportGraphToURL } from "../persistence/urlCodec.js";
import { downloadJson, openJsonFilePicker, graphToSvg, downloadSvg, downloadPng } from "../persistence/fileIO.js";
import { normalizeGraph, createDemoGraph } from "../model/schema.js";
import { suggestIp } from "../model/addressing.js";
import { analyzeTopology } from "../ai/topology-analyzer.js";
import { prettyLayout } from "./prettyLayout.js";
import { resolveAndDispatch } from "./positionManager.js";
import { loadExample } from "../examples/index.js";
import { createEngine } from "../sim/engine.js";
import { bfsPath, findNodeByIp, computeRttMs } from "../model/graph.js";
import { createChatPanel } from "../ui/chatPanel.js";
import { createActionDispatcher } from "../ai/actionDispatcher.js";
import { createAdvancedModal } from "../ui/advancedModal.js";

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ── Tema claro / oscuro ──────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem("capa8_theme");
  if (saved === "light") document.documentElement.dataset.theme = "light";
})();

document.addEventListener("DOMContentLoaded", async () => {
  // Botón toggle de tema
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const isLight = document.documentElement.dataset.theme === "light";
    document.documentElement.dataset.theme = isLight ? "" : "light";
    localStorage.setItem("capa8_theme", isLight ? "" : "light");
    const icon = document.querySelector("#theme-toggle i");
    if (icon) icon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    render();
  });
  // Sync icon on load
  const themeIcon = document.querySelector("#theme-toggle i");
  if (themeIcon && document.documentElement.dataset.theme === "light") {
    themeIcon.className = "fa-solid fa-sun";
  }

  const menubarEl = document.getElementById("sim-menubar");
  const stageEl   = document.getElementById("network-stage");
  const stageWrap = document.getElementById("sim-stage-wrap");
  const worldEl   = document.getElementById("stage-world");
  const svgEl     = document.getElementById("stage-svg");

  // ── Viewport (zoom + pan) ────────────────────────────────────────────
  const vp = { zoom: 1, panX: 0, panY: 0 };
  const ZOOM_MIN = 0.15, ZOOM_MAX = 4, ZOOM_STEP = 1.07;

  function applyViewport() {
    worldEl.style.transform = `translate(${vp.panX}px,${vp.panY}px) scale(${vp.zoom})`;
  }

  // Ajusta zoom y pan para que el contenido (nodos) ocupe el canvas visible.
  function fitToScreen(padding = 60, maxZoom = 0.92, scale = 1.0) {
    const nodes = store.getState().graph.nodes;
    if (nodes.length === 0) return;

    // Bounding box visual real: incluye icono (48px) + label arriba (~28px) + IP abajo (~62px)
    const NODE_HALF_W = 48;
    const NODE_ABOVE  = 28;
    const NODE_BELOW  = 62;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs) - NODE_HALF_W;
    const maxX = Math.max(...xs) + NODE_HALF_W;
    const minY = Math.min(...ys) - NODE_ABOVE;
    const maxY = Math.max(...ys) + NODE_BELOW;

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;

    const W = stageEl.clientWidth  || stageEl.offsetWidth  || 800;
    const H = stageEl.clientHeight || stageEl.offsetHeight || 600;
    const availW = W - padding * 2;
    const availH = H - padding * 2;

    const newZoom = Math.max(ZOOM_MIN, Math.min(maxZoom, Math.min(availW / contentW, availH / contentH))) * scale;

    // Centrar el bounding box de los nodos en el stage
    vp.zoom = newZoom;
    vp.panX = W / 2 - ((minX + maxX) / 2) * newZoom;
    vp.panY = H / 2 - ((minY + maxY) / 2) * newZoom;
    applyViewport();
  }

  function toWorld(sx, sy) {
    return { x: (sx - vp.panX) / vp.zoom, y: (sy - vp.panY) / vp.zoom };
  }

  stageEl.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = stageEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vp.zoom * factor));
    vp.panX = sx - (sx - vp.panX) * (newZoom / vp.zoom);
    vp.panY = sy - (sy - vp.panY) * (newZoom / vp.zoom);
    vp.zoom = newZoom;
    applyViewport();
  }, { passive: false });

  let panning = null;
  stageEl.addEventListener("mousedown", e => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panning = { sx: e.clientX, sy: e.clientY, px: vp.panX, py: vp.panY };
      stageEl.classList.add("is-panning");
    }
  });
  window.addEventListener("mousemove", e => {
    if (!panning) return;
    vp.panX = panning.px + (e.clientX - panning.sx);
    vp.panY = panning.py + (e.clientY - panning.sy);
    applyViewport();
  });
  window.addEventListener("mouseup", e => {
    if (panning && (e.button === 1 || e.button === 0)) {
      panning = null;
      stageEl.classList.remove("is-panning");
    }
  });

  // ── Store + history ──────────────────────────────────────────────────
  const store = createStore({ initialState: createInitialState(), reducer });
  const history = createHistory({ limit: 60 });

  // ── Engine ───────────────────────────────────────────────────────────
  const engine = createEngine({
    store,
    onFrame: () => render(),
  });
  engine.start();

  const DIAGRAM_KEY    = "capa8_diagram";
  const AUTOSAVE_LS_KEY = "capa8_diagram_ls";

  try {
    const raw = importGraphFromURL();
    if (raw) {
      store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: raw } });
      snapNodesToGrid();
      requestAnimationFrame(() => {
        resolveAndDispatch(store, store.dispatch, ActionTypes, null);
        runPrettyNoHistory();
      });
      showToast("Cargado desde URL ✅");
    } else {
      const saved = sessionStorage.getItem(DIAGRAM_KEY)
                 || localStorage.getItem(AUTOSAVE_LS_KEY);
      if (saved) {
        store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: JSON.parse(saved) } });
        requestAnimationFrame(() => {
          resolveAndDispatch(store, store.dispatch, ActionTypes, null);
          runPrettyNoHistory();
        });
        showToast("Diagrama restaurado ✅");
      }
    }
  } catch (e) {
    console.warn(e);
  }

  // ── Advanced properties modal ─────────────────────────────────────────
  const advModal = createAdvancedModal({
    dispatch: store.dispatch,
    ActionTypes,
    getState: store.getState,
  });

  // ── Inspector overlay ────────────────────────────────────────────────
  const inspector = createInspector({
    dispatch: store.dispatch,
    ActionTypes,
    onOpenAdvanced: advModal.open,
  });

  // ── Terminal panel ───────────────────────────────────────────────────
  const terminalPanel = createTerminalPanel({
    store,
    dispatch: store.dispatch,
    ActionTypes,
    onPingRequest: ({ fromId, toId, pathLinkIds }) => {
      engine.enqueuePathAnimation({ linkIds: pathLinkIds, kind: "icmp", direction: "ab" });
      engine.enqueuePathAnimation({ linkIds: [...pathLinkIds].reverse(), kind: "icmp", direction: "ba" });
    },
    onPingFail: ({ ip }) => {
      chatPanel?.notifyPingFail(ip);
    },
  });

  // ── Menubar ──────────────────────────────────────────────────────────
  createMenuBar({
    container: menubarEl,
    onAction: actionId => handleMenuAction(actionId),
    onStatus: text => console.debug("[status]", text),
  });

  // Mobile hamburger menubar (Archivo/Dibujar/Ajustes/Ejemplos)
  const mobileMenubarEl = document.getElementById("sim-menubar-mobile");
  if (mobileMenubarEl) {
    createMenuBar({
      container: mobileMenubarEl,
      onAction: actionId => { handleMenuAction(actionId); mobileMenu.hidden = true; hamburger?.classList.remove("open"); },
      onStatus: text => console.debug("[status]", text),
    });
  }

  // ── Shortcuts ────────────────────────────────────────────────────────
  bindShortcuts({
    onAction: actionId => handleMenuAction(actionId),
    onStatus: text => console.debug("[status]", text),
  });

  // ── Logo dropdown ────────────────────────────────────────────────────
  const logoBtn      = document.getElementById("onav-logo-btn");
  const logoDropdown = document.getElementById("onav-dropdown");
  const logoWrap     = logoBtn.closest(".onav-logo-wrap");
  logoBtn.addEventListener("click", e => {
    e.stopPropagation();
    logoDropdown.hidden ? openLogoDropdown() : closeLogoDropdown();
  });
  let logoHideTimer = null;
  const openLogoDropdown = () => {
    clearTimeout(logoHideTimer);
    logoDropdown.hidden = false;
    logoBtn.classList.add("open");
  };
  const closeLogoDropdown = () => {
    logoHideTimer = setTimeout(() => {
      logoDropdown.hidden = true;
      logoBtn.classList.remove("open");
    }, 180);
  };
  // Only listen on the wrap — logoDropdown is a child so mouse inside it
  // does NOT trigger mouseleave on logoWrap. No dropdown-level listeners needed.
  logoWrap.addEventListener("mouseenter", openLogoDropdown);
  logoWrap.addEventListener("mouseleave", closeLogoDropdown);
  document.addEventListener("click", e => {
    if (!logoBtn.contains(e.target) && !logoDropdown.contains(e.target)) {
      logoDropdown.hidden = true;
      logoBtn.classList.remove("open");
    }
  });

  // ── Hamburger (mobile) ───────────────────────────────────────────────
  const hamburger   = document.getElementById("onav-hamburger");
  const mobileMenu  = document.getElementById("onav-mobile-menu");
  hamburger?.addEventListener("click", e => {
    e.stopPropagation();
    mobileMenu.hidden = !mobileMenu.hidden;
    hamburger.classList.toggle("open", !mobileMenu.hidden);
  });
  document.addEventListener("click", e => {
    if (mobileMenu && !mobileMenu.hidden && !hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.hidden = true;
      hamburger.classList.remove("open");
    }
  });

  // ── Mobile action buttons ────────────────────────────────────────────
  document.getElementById("m-btn-run")?.addEventListener("click", () => handleMenuAction("TOGGLE_RUN"));
  document.getElementById("m-btn-terminal")?.addEventListener("click", () => setTerminalVisible(!showTerminal));
  document.getElementById("m-btn-copylink")?.addEventListener("click", () => {
    document.getElementById("btn-copylink").click();
  });

  // ── Run/Stop button ──────────────────────────────────────────────────
  const btnRun = document.getElementById("btn-run");
  btnRun.addEventListener("click", () => handleMenuAction("TOGGLE_RUN"));

  // ── Terminal toggle ──────────────────────────────────────────────────
  let showTerminal = false;
  const terminalBottom = document.getElementById("terminal-bottom");
  const btnTerminal    = document.getElementById("btn-terminal");

  function setTerminalVisible(visible, pcId = null) {
    showTerminal = visible;
    if (visible && window.innerWidth <= 768) {
      // On mobile: clear selection so inspector bottom sheet hides.
      // This triggers store.subscribe which resets terminalPanel.setPc(null),
      // so pcId must be re-applied AFTER the dispatch returns.
      store.dispatch({ type: ActionTypes.CLEAR_SELECTION });
    }
    terminalBottom.classList.toggle("terminal-bottom--hidden", !showTerminal);
    btnTerminal.classList.toggle("active", showTerminal);
    updateBottomElements();
    if (showTerminal) {
      if (pcId) terminalPanel.setPc(pcId); // override after subscriber reset
      terminalPanel.render();
    }
  }

  btnTerminal.addEventListener("click", () => setTerminalVisible(!showTerminal));
  document.getElementById("btn-term-close").addEventListener("click", () => setTerminalVisible(false));

  function updateBottomElements() {
    const offset = showTerminal ? "183px" : "";
    document.getElementById("status-badge").style.bottom = offset;
  }

  // ── Copy link button ─────────────────────────────────────────────────
  document.getElementById("btn-copylink").addEventListener("click", async () => {
    const url = exportGraphToURL(snapshotGraph());
    try {
      await navigator.clipboard.writeText(url);
      showToast("URL copiada ✅");
      const icon = document.getElementById("btn-copylink-icon");
      icon.className = "fa-solid fa-check";
      setTimeout(() => { icon.className = "fa-solid fa-link"; }, 2000);
    } catch {
      showToast("No se pudo copiar");
    }
  });

  // ── AI FAB ───────────────────────────────────────────────────────────
  let chatPanel = null;

  // Dispatcher necesita chatPanel por referencia (lazy), y chatPanel necesita el dispatcher.
  // Usamos getters tardíos para romper la dependencia circular.
  const { handleAIAction, handleAIActions } = createActionDispatcher({
    store,
    dispatch: store.dispatch,
    ActionTypes,
    showToast,
    getChatPanel: () => chatPanel,
    pushHistorySnapshot,
    uid,
    postBatchCallback: () => {
      runPretty();
      requestAnimationFrame(() => requestAnimationFrame(fitToScreen));
    },
  });

  try {
    chatPanel = createChatPanel({
      store,
      onApplyAction: handleAIAction,
      onApplyActions: handleAIActions,
    });
  } catch (e) { console.warn("chatPanel:", e); }

  const aiFabIcon = document.getElementById("ai-fab-icon");
  const aiFabPanel = document.getElementById("ai-fab-panel");

  function openSidebar() {
    // Reset to CSS default height (50dvh) each time the panel opens on mobile
    if (window.innerWidth <= 768) aiFabPanel.style.height = "";
    aiFabPanel.classList.add("open");
    stageWrap?.classList.add("has-ai-open");
    document.getElementById("ai-fab-btn")?.setAttribute("aria-expanded", "true");
    if (aiFabIcon) aiFabIcon.className = "fa-solid fa-chevron-right";
    const badge = document.getElementById("ai-tab-badge");
    if (badge) badge.hidden = true;
    chatPanel?.refreshWelcome();
    // On mobile: close terminal and inspector to avoid stacking conflicts
    if (window.innerWidth <= 768) {
      setTerminalVisible(false);
      store.dispatch({ type: ActionTypes.CLEAR_SELECTION });
    }
  }
  function closeSidebar() {
    aiFabPanel.classList.remove("open");
    stageWrap?.classList.remove("has-ai-open");
    document.getElementById("ai-fab-btn")?.setAttribute("aria-expanded", "false");
    if (aiFabIcon) aiFabIcon.className = "fa-solid fa-chevron-left";
  }

  document.getElementById("ai-fab-btn").addEventListener("click", () => {
    aiFabPanel.classList.contains("open") ? closeSidebar() : openSidebar();
  });

  // Sync close button inside panel (created dynamically by chatPanel.js)
  aiFabPanel.addEventListener("click", e => {
    if (e.target.closest("#fab-panel-close")) closeSidebar();
  });

  // ── Mobile: drag-to-resize handle for AI bottom sheet ────────────────
  if ("ontouchstart" in window) {
    const dragHandle = document.createElement("div");
    dragHandle.className = "ai-drag-handle";
    dragHandle.innerHTML = `<i class="fa-solid fa-grip-lines"></i>`;
    aiFabPanel.prepend(dragHandle);

    let phStartY = 0, phStartH = 0;
    dragHandle.addEventListener("touchstart", ev => {
      ev.preventDefault();
      phStartY = ev.touches[0].clientY;
      phStartH = aiFabPanel.getBoundingClientRect().height;
    }, { passive: false });

    dragHandle.addEventListener("touchmove", ev => {
      ev.preventDefault();
      const dy = phStartY - ev.touches[0].clientY; // positive = drag up = expand
      const vh = window.innerHeight;
      const newH = Math.max(vh * 0.22, Math.min(vh * 0.88, phStartH + dy));
      aiFabPanel.style.height = newH + "px";
    }, { passive: false });
  }

  // ── Context menu ─────────────────────────────────────────────────────
  const ctxMenu = document.getElementById("node-ctx-menu");

  function showContextMenu(clientX, clientY, nodeId) {
    const rect = stageWrap.getBoundingClientRect();
    const node = store.getState().graph.nodes.find(n => n.id === nodeId);
    const isTerminalNode = ["pc", "agv", "plc", "ur3"].includes(node?.type);

    // Position inside the stage, clamped so it doesn't overflow the right/bottom edge
    const menuW = 210, menuH = isTerminalNode ? 160 : 130;
    const stageW = rect.width, stageH = rect.height;
    const rawLeft = clientX - rect.left;
    const rawTop  = clientY - rect.top;
    ctxMenu.style.left = Math.min(rawLeft, stageW - menuW) + "px";
    ctxMenu.style.top  = Math.min(rawTop,  stageH - menuH) + "px";

    ctxMenu.innerHTML = `
      <div class="ctx-item" data-action="inspect">
        <i class="fa-solid fa-pen-to-square"></i> Editar propiedades
      </div>
      ${isTerminalNode ? `<div class="ctx-item" data-action="terminal">
        <i class="fa-solid fa-terminal"></i> Abrir terminal
      </div>` : ""}
      <div class="ctx-item" data-action="ping">
        <i class="fa-solid fa-signal"></i> Ping desde aquí
      </div>
      <div class="ctx-item danger" data-action="delete">
        <i class="fa-solid fa-trash"></i> Eliminar
      </div>
    `;
    ctxMenu.hidden = false;

    ctxMenu.onclick = e => {
      const item = e.target.closest("[data-action]");
      if (!item) return;
      ctxMenu.hidden = true;
      const action = item.dataset.action;
      if (action === "inspect") {
        store.dispatch({ type: ActionTypes.SET_SELECTION, payload: { selection: { kind: "node", id: nodeId } } });
        inspector.show();
      } else if (action === "terminal") {
        setTerminalVisible(true, nodeId); // pcId re-applied after CLEAR_SELECTION subscriber
      } else if (action === "ping") {
        const st = store.getState();
        const n  = st.graph.nodes.find(n => n.id === nodeId);
        if (["pc", "agv", "plc", "ur3"].includes(n?.type)) {
          terminalPanel.setPc(nodeId);
          setTerminalVisible(true);
        } else {
          showToast("Selecciona una PC, AGV, PLC o UR3 para hacer ping");
        }
      } else if (action === "delete") {
        pushHistorySnapshot();
        store.dispatch({ type: ActionTypes.DELETE_NODE, payload: { id: nodeId } });
      }
    };
  }

  document.addEventListener("click", () => { ctxMenu.hidden = true; });
  // On mobile, dismiss context menu immediately on touchstart (no 300ms click delay)
  document.addEventListener("touchstart", (e) => {
    if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) ctxMenu.hidden = true;
  }, { passive: true });

  stageEl.addEventListener("contextmenu", e => {
    e.preventDefault();
    if (e.button === 1) return;
    const nodeEl = e.target.closest(".node");
    if (nodeEl) showContextMenu(e.clientX, e.clientY, nodeEl.dataset.nodeId);
  });

  // ── Double-click: open advanced modal ────────────────────────────────
  stageEl.addEventListener("dblclick", e => {
    const nodeEl = e.target.closest(".node");
    if (nodeEl) {
      const id = nodeEl.dataset.nodeId;
      store.dispatch({ type: ActionTypes.SET_SELECTION, payload: { selection: { kind: "node", id } } });
      advModal.open("node", id);
    }
  });

  // ── Collision resolution (delegado a positionManager) ────────────────
  function resolveCollisions(anchorId) {
    resolveAndDispatch(store, store.dispatch, ActionTypes, anchorId);
  }

  // ── Snap to grid ─────────────────────────────────────────────────────
  const SNAP_GRID = 150;

  function getCellsAtRadius(cx, cy, r) {
    const cells = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
          cells.push({ cx: cx + dx, cy: cy + dy });
        }
      }
    }
    return cells;
  }

  function snapNodesToGrid() {
    const nodes = store.getState().graph.nodes;
    if (nodes.length === 0) return;

    const targets = nodes.map(n => {
      const cx = Math.round(n.x / SNAP_GRID);
      const cy = Math.round(n.y / SNAP_GRID);
      const dist = Math.hypot(n.x - cx * SNAP_GRID, n.y - cy * SNAP_GRID);
      return { id: n.id, cx, cy, dist };
    });

    targets.sort((a, b) => a.dist - b.dist);

    const occupied = new Set();

    for (const t of targets) {
      let placed = false;
      for (let r = 0; r <= 10 && !placed; r++) {
        const candidates = r === 0
          ? [{ cx: t.cx, cy: t.cy }]
          : getCellsAtRadius(t.cx, t.cy, r);
        candidates.sort((a, b) =>
          Math.hypot(a.cx - t.cx, a.cy - t.cy) - Math.hypot(b.cx - t.cx, b.cy - t.cy)
        );
        for (const c of candidates) {
          const key = `${c.cx},${c.cy}`;
          if (!occupied.has(key)) {
            occupied.add(key);
            const nx = c.cx * SNAP_GRID;
            const ny = c.cy * SNAP_GRID;
            const node = nodes.find(n => n.id === t.id);
            if (node && (nx !== node.x || ny !== node.y)) {
              store.dispatch({ type: ActionTypes.MOVE_NODE, payload: { id: t.id, x: nx, y: ny } });
            }
            placed = true;
            break;
          }
        }
      }
    }
  }

  // ── Pretty layout v2 — delegado al módulo prettyLayout.js ───────────
  function runPretty() {
    prettyLayout({
      graph: store.getState().graph,
      pushHistorySnapshot,
      dispatch: store.dispatch,
      ActionTypes,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => fitToScreen(60, ZOOM_MAX, 0.9)));
  }

  function runPrettyNoHistory() {
    prettyLayout({
      graph: store.getState().graph,
      pushHistorySnapshot,
      dispatch: store.dispatch,
      ActionTypes,
      skipHistory: true,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => fitToScreen(60, ZOOM_MAX, 0.9)));
  }

  // ── Stage: click / drag / link ───────────────────────────────────────
  let dragging = null;

  stageEl.addEventListener("mousedown", e => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) return;
    if (e.button !== 0) return;

    const state = store.getState();
    const tool  = state.ui.tool;
    const rect  = stageEl.getBoundingClientRect();
    const { x, y } = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const wx = Math.round(x), wy = Math.round(y);

    const nodeEl = e.target.closest(".node");
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      store.dispatch({ type: ActionTypes.SET_SELECTION, payload: { selection: { kind: "node", id: nodeId } } });
      if (tool === "select") {
        const node = state.graph.nodes.find(n => n.id === nodeId);
        if (node) dragging = { nodeId, offsetX: wx - node.x, offsetY: wy - node.y };
      }
      if (tool === "link") handleLinkClick(nodeId);
      return;
    }

    if (tool === "select") {
      const link = hitTestLink(state.graph, wx, wy, 10 / vp.zoom);
      if (link) {
        store.dispatch({ type: ActionTypes.SET_SELECTION, payload: { selection: { kind: "link", id: link.id } } });
        return;
      }
    }

    if (["router", "switch", "pc", "firewall", "server", "cloud", "ap", "plc", "ur3", "agv"].includes(tool)) {
      const node = {
        id: uid("n"),
        type: tool,
        label: `${tool.toUpperCase()} ${state.graph.nodes.filter(n => n.type === tool).length + 1}`,
        x: wx, y: wy,
        ip: suggestIp(tool, 10),
        mask: null,
        gateway: "",
        description: "", os: "", vlan: null, mtu: 1500,
      };
      pushHistorySnapshot();
      store.dispatch({ type: ActionTypes.ADD_NODE, payload: { node } });
      // Ghost drop flash
      if (ghostEl && ghostEl.classList.contains('ghost--visible')) {
        ghostEl.classList.remove("drop-flash");
        void ghostEl.offsetWidth; // reflow to restart animation
        ghostEl.classList.add("drop-flash");
        ghostEl.addEventListener("animationend", () => ghostEl.classList.remove("drop-flash"), { once: true });
      }
      return;
    }

    store.dispatch({ type: ActionTypes.CLEAR_SELECTION });
  });

  window.addEventListener("mousemove", e => {
    if (panning || !dragging) return;
    const rect = stageEl.getBoundingClientRect();
    const { x, y } = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    store.dispatch({ type: ActionTypes.MOVE_NODE, payload: {
      id: dragging.nodeId,
      x: Math.round(x - dragging.offsetX),
      y: Math.round(y - dragging.offsetY),
    }});
  });

  window.addEventListener("mouseup", e => {
    if (e.button === 0 && dragging) {
      const releasedId = dragging.nodeId;
      dragging = null;
      resolveCollisions(releasedId);
    }
  });

  // ── Touch events — drag de nodos + pan de canvas + pinch-zoom ────────
  let touchPan   = null;  // { sx, sy, px, py } — single finger pan
  let touchPinch = null;  // { dist, cx, cy } — two finger pinch
  let touchTapStart    = null; // { x, y, time } — tap origin for gesture detection
  let lastDrawTapTime  = 0;    // timestamp of previous draw-mode tap (double-tap detection)
  let lastDrawTapPos   = { x: 0, y: 0 }; // position of previous draw-mode tap
  let longPressTimer   = null; // setTimeout handle for long-press context menu
  let longPressTouchPos = null; // { x, y } — where the long-press started

  function getTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }
  function getTouchCenter(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  stageEl.addEventListener("touchstart", e => {
    if (e.touches.length === 2) {
      // Pinch-zoom starts — cancel any node drag or pan
      dragging = null;
      touchPan = null;
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      touchPinch = { dist: getTouchDist(t1, t2), ...getTouchCenter(t1, t2) };
      return;
    }
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const state = store.getState();
    const nodeEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".node");

    if (nodeEl && state.ui.tool === "select") {
      // Node drag
      e.preventDefault();
      const nodeId = nodeEl.dataset.nodeId;
      store.dispatch({ type: ActionTypes.SET_SELECTION, payload: { selection: { kind: "node", id: nodeId } } });
      const rect = stageEl.getBoundingClientRect();
      const { x, y } = toWorld(touch.clientX - rect.left, touch.clientY - rect.top);
      const node = state.graph.nodes.find(n => n.id === nodeId);
      if (node) dragging = { nodeId, offsetX: Math.round(x) - node.x, offsetY: Math.round(y) - node.y };

      // Long-press: show context menu after 550ms if finger doesn't move
      longPressTouchPos = { x: touch.clientX, y: touch.clientY };
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        dragging = null; // cancel drag so the menu feels intentional
        showContextMenu(longPressTouchPos.x, longPressTouchPos.y, nodeId);
      }, 550);
    } else if (!nodeEl) {
      // Canvas pan (may also be a tap — resolved on touchend)
      e.preventDefault();
      touchPan      = { sx: touch.clientX, sy: touch.clientY, px: vp.panX, py: vp.panY };
      touchTapStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }
  }, { passive: false });

  window.addEventListener("touchmove", e => {
    // Cancel long-press if finger moved significantly
    if (longPressTimer && e.touches.length === 1) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - longPressTouchPos.x, t.clientY - longPressTouchPos.y) > 8) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
    if (e.touches.length === 2 && touchPinch) {
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const newDist = getTouchDist(t1, t2);
      const factor = newDist / touchPinch.dist;
      const center = getTouchCenter(t1, t2);
      const rect = stageEl.getBoundingClientRect();
      const sx = center.x - rect.left;
      const sy = center.y - rect.top;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vp.zoom * factor));
      vp.panX = sx - (sx - vp.panX) * (newZoom / vp.zoom);
      vp.panY = sy - (sy - vp.panY) * (newZoom / vp.zoom);
      vp.zoom = newZoom;
      applyViewport();
      touchPinch = { dist: newDist, x: center.x, y: center.y };
      return;
    }
    if (e.touches.length === 1 && touchPan) {
      e.preventDefault();
      const touch = e.touches[0];
      vp.panX = touchPan.px + (touch.clientX - touchPan.sx);
      vp.panY = touchPan.py + (touch.clientY - touchPan.sy);
      applyViewport();
      return;
    }
    if (dragging && e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = stageEl.getBoundingClientRect();
      const { x, y } = toWorld(touch.clientX - rect.left, touch.clientY - rect.top);
      store.dispatch({ type: ActionTypes.MOVE_NODE, payload: {
        id: dragging.nodeId,
        x: Math.round(x - dragging.offsetX),
        y: Math.round(y - dragging.offsetY),
      }});
    }
  }, { passive: false });

  window.addEventListener("touchend", e => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (e.touches.length < 2) touchPinch = null;
    if (e.touches.length === 0) {
      // ── Tap gesture detection ──────────────────────────────────────────
      const endTouch = e.changedTouches[0];
      if (touchTapStart && endTouch && !dragging) {
        const moved    = Math.hypot(endTouch.clientX - touchTapStart.x, endTouch.clientY - touchTapStart.y);
        const duration = Date.now() - touchTapStart.time;
        if (moved < 10 && duration < 400) {
          const state = store.getState();
          const tool  = state.ui.tool;
          if (tool === "select" && state.ui.selection) {
            // Single tap on blank area → dismiss inspector
            store.dispatch({ type: ActionTypes.CLEAR_SELECTION });
          } else if (["router","switch","pc","firewall","server","cloud","ap","plc","ur3","agv"].includes(tool)) {
            // Double-tap in draw mode → place node (prevents accidental drops while scrolling)
            const now = Date.now();
            const sameTapSpot = Math.hypot(endTouch.clientX - lastDrawTapPos.x, endTouch.clientY - lastDrawTapPos.y) < 40;
            if (now - lastDrawTapTime < 350 && sameTapSpot) {
              const rect  = stageEl.getBoundingClientRect();
              const { x, y } = toWorld(endTouch.clientX - rect.left, endTouch.clientY - rect.top);
              const node = {
                id: uid("n"),
                type: tool,
                label: `${tool.toUpperCase()} ${state.graph.nodes.filter(n => n.type === tool).length + 1}`,
                x: Math.round(x), y: Math.round(y),
                ip: suggestIp(tool, 10),
                mask: null, gateway: "", description: "", os: "", vlan: null, mtu: 1500,
              };
              pushHistorySnapshot();
              store.dispatch({ type: ActionTypes.ADD_NODE, payload: { node } });
              lastDrawTapTime = 0;
            } else {
              lastDrawTapTime = now;
              lastDrawTapPos  = { x: endTouch.clientX, y: endTouch.clientY };
            }
          }
        }
      }
      touchTapStart = null;
      touchPan      = null;
      if (dragging) {
        const releasedId = dragging.nodeId;
        dragging = null;
        resolveCollisions(releasedId);
      }
    }
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  window.addEventListener("keydown", e => {
    // Ctrl+P — toggle presentation mode (works even while typing)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      togglePresentationMode();
      return;
    }

    const typing = ["input", "textarea", "select"].includes(
      (document.activeElement?.tagName || "").toLowerCase()
    );
    if (typing) return;

    // Esc also exits presentation mode
    if (e.key === "Escape" && presentationMode) {
      togglePresentationMode(false);
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      const sel = store.getState().ui.selection;
      if (!sel) return;
      pushHistorySnapshot();
      if (sel.kind === "node") store.dispatch({ type: ActionTypes.DELETE_NODE, payload: { id: sel.id } });
      if (sel.kind === "link") store.dispatch({ type: ActionTypes.DELETE_LINK, payload: { id: sel.id } });
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const snap = history.undo(snapshotGraph());
      if (snap) store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: snap } });
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      const snap = history.redo(snapshotGraph());
      if (snap) store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: snap } });
    }
  });

  // ── Link draft ───────────────────────────────────────────────────────
  let linkDraft = null;
  function handleLinkClick(nodeId) {
    if (!linkDraft) {
      linkDraft = nodeId;
      return;
    }
    if (linkDraft === nodeId) { linkDraft = null; return; }

    const link = {
      id: uid("l"),
      source: linkDraft,
      target: nodeId,
      latencyMs: 10,
      bandwidthMbps: 100,
      lossPct: 0,
      status: "up",
    };
    pushHistorySnapshot();
    store.dispatch({ type: ActionTypes.ADD_LINK, payload: { link } });
    linkDraft = null;
  }


  // ── AI tab issue badge ───────────────────────────────────────────────
  function updateFabBadge(graph) {
    const issues = analyzeTopology(graph);
    const count = issues.filter(i => i.severity === "error" || i.severity === "warning").length;
    const badge = document.getElementById("ai-tab-badge");
    if (!badge) return;
    const panelOpen = aiFabPanel?.classList.contains("open");
    if (count > 0 && !panelOpen) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // ── Ghost cursor setup ────────────────────────────────────────────────
  const ghostEl = document.getElementById("cursor-ghost");
  const GHOST_ICON_COLORS = {
    router: '#60a5fa', switch: '#22d3ee', pc: '#a78bfa',
    firewall: '#f87171', server: '#34d399', cloud: '#7dd3fc',
    ap: '#fbbf24', plc: '#a78bfa', ur3: '#38bdf8', agv: '#fb923c',
  };
  const GHOST_ICONS = {};
  for (const [type, fn] of Object.entries(NODE_ICON_FN)) {
    GHOST_ICONS[type] = fn(GHOST_ICON_COLORS[type] ?? '#60a5fa');
  }

  function showGhost(tool) {
    if (!ghostEl || !GHOST_ICONS[tool]) { hideGhost(); return; }
    ghostEl.innerHTML = GHOST_ICONS[tool];
    ghostEl.classList.add('ghost--visible');
    stageEl.classList.add("has-tool");
  }
  function hideGhost() {
    if (!ghostEl) return;
    ghostEl.classList.remove('ghost--visible');
    stageEl.classList.remove("has-tool");
    stageEl.classList.remove("has-link-tool");
  }

  stageEl.addEventListener("mousemove", e => {
    if (ghostEl?.classList.contains('ghost--visible')) {
      ghostEl.style.left = e.clientX + "px";
      ghostEl.style.top  = e.clientY + "px";
    }
  });
  stageEl.addEventListener("mouseleave", () => {
    if (ghostEl) ghostEl.classList.remove('ghost--visible');
  });
  stageEl.addEventListener("mouseenter", () => {
    const tool = store.getState().ui.tool;
    if (GHOST_ICONS[tool]) ghostEl.classList.add('ghost--visible');
  });

  // ── Menu actions ─────────────────────────────────────────────────────
  async function handleMenuAction(actionId) {
    const st = store.getState();

    if (actionId.startsWith("TOOL_")) {
      const tool = actionId.replace("TOOL_", "").toLowerCase();
      store.dispatch({ type: ActionTypes.SET_TOOL, payload: { tool } });
      linkDraft = null;
      if (tool === 'link') {
        stageEl.classList.add('has-link-tool');
        hideGhost();
      } else {
        stageEl.classList.remove('has-link-tool');
        if (GHOST_ICONS[tool]) showGhost(tool);
        else hideGhost();
      }
      render();
      return;
    }

    if (actionId === "TOGGLE_RUN") {
      store.dispatch({ type: ActionTypes.TOGGLE_RUN });
      const running = store.getState().sim.running;
      engine.setRunning(running);
      const runHtml = running
        ? `<i class="fa-solid fa-stop"></i> Stop`
        : `<i class="fa-solid fa-play"></i> Run`;
      btnRun.classList.toggle("running", running);
      btnRun.innerHTML = runHtml;
      const mBtnRun = document.getElementById("m-btn-run");
      if (mBtnRun) { mBtnRun.classList.toggle("running", running); mBtnRun.innerHTML = runHtml; }
      return;
    }

    if (actionId === "RESET_DEMO") {
      pushHistorySnapshot();
      try { sessionStorage.removeItem(DIAGRAM_KEY); localStorage.removeItem(AUTOSAVE_LS_KEY); } catch {}
      store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: createDemoGraph() } });
      requestAnimationFrame(() => {
        resolveAndDispatch(store, store.dispatch, ActionTypes, null);
        runPretty();
      });
      showToast("Reset ✅");
      return;
    }

    if (actionId === "EXPORT_URL") {
      exportGraphToURL(snapshotGraph());
      showToast("URL actualizada ✅");
      return;
    }

    if (actionId === "COPY_URL") {
      const url = exportGraphToURL(snapshotGraph());
      try {
        await navigator.clipboard.writeText(url);
        showToast("URL copiada ✅");
      } catch {
        showToast("No se pudo copiar");
      }
      return;
    }

    if (actionId === "FILE_EXPORT") {
      downloadJson(`capa8_${Date.now()}.json`, snapshotGraph());
      return;
    }

    if (actionId === "FILE_EXPORT_SVG") {
      const svgStr = graphToSvg(snapshotGraph(), { darkMode: document.documentElement.dataset.theme !== "light" });
      if (!svgStr) { showToast("El diagrama está vacío ❌"); return; }
      downloadSvg(`capa8_${Date.now()}.svg`, svgStr);
      showToast("SVG exportado ✅");
      return;
    }

    if (actionId === "FILE_EXPORT_PNG") {
      const svgStr = graphToSvg(snapshotGraph(), { darkMode: document.documentElement.dataset.theme !== "light" });
      if (!svgStr) { showToast("El diagrama está vacío ❌"); return; }
      showToast("Generando PNG…");
      downloadPng(`capa8_${Date.now()}.png`, svgStr)
        .then(() => showToast("PNG exportado ✅"))
        .catch(() => showToast("Error al exportar PNG ❌"));
      return;
    }

    if (actionId === "FILE_IMPORT") {
      const res = await openJsonFilePicker();
      if (!res) return;
      try {
        const raw = JSON.parse(res.text);
        if (raw.version !== 3) {
          showToast(`Versión ${raw.version ?? "desconocida"} no soportada. Se requiere v3 ❌`);
          return;
        }
        if (!Array.isArray(raw.nodes) || !Array.isArray(raw.links)) {
          showToast("JSON inválido: falta nodes[] o links[] ❌");
          return;
        }
        pushHistorySnapshot();
        store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: raw } });
        requestAnimationFrame(() => resolveAndDispatch(store, store.dispatch, ActionTypes, null));
        showToast("Importado ✅");
      } catch {
        showToast("JSON inválido ❌");
      }
      return;
    }

    if (actionId === "FILE_NEW") {
      pushHistorySnapshot();
      try { sessionStorage.removeItem(DIAGRAM_KEY); localStorage.removeItem(AUTOSAVE_LS_KEY); } catch {}
      store.dispatch({ type: ActionTypes.NEW_GRAPH });
      showToast("Nuevo ✅");
      return;
    }

    const EXAMPLE_MAP = {
      LOAD_EXAMPLE_SMALL_LAN:            "small_lan",
      LOAD_EXAMPLE_VLAN_ROUTING:         "vlan_routing",
      LOAD_EXAMPLE_WAN_REDUNDANT:        "wan_redundant",
      LOAD_EXAMPLE_DATA_CENTER:          "data_center",
      LOAD_EXAMPLE_HOME_NETWORK:         "home_network",
      LOAD_EXAMPLE_DMZ:                  "dmz",
      LOAD_EXAMPLE_CAMPUS:               "campus",
      LOAD_EXAMPLE_MPLS_WAN:             "mpls_wan",
      LOAD_EXAMPLE_RED_INDUSTRIAL:       "red_industrial",
      LOAD_EXAMPLE_RED_UNIVERSITARIA:    "red_universitaria",
      LOAD_EXAMPLE_ESTE_PROYECTO:        "este_proyecto",
    };
    if (actionId in EXAMPLE_MAP) {
      try {
        const ex = await loadExample(EXAMPLE_MAP[actionId]);
        pushHistorySnapshot();
        store.dispatch({ type: ActionTypes.LOAD_GRAPH, payload: { graph: ex } });
        requestAnimationFrame(() => {
          resolveAndDispatch(store, store.dispatch, ActionTypes, null);
          runPretty();
        });
        showToast("Ejemplo ✅");
      } catch {
        showToast("No se pudo cargar ejemplo");
      }
      return;
    }

    if (actionId === "SNAP_TO_GRID") {
      snapNodesToGrid();
      showToast("Nodos alineados ✅");
      return;
    }

    if (actionId === "TOGGLE_IP_LABELS") {
      store.dispatch({ type: ActionTypes.TOGGLE_IP_LABELS });
      return;
    }

    if (actionId === "PRETTY_LAYOUT") {
      runPretty();
      showToast("Diagrama organizado ✨");
      return;
    }

    if (actionId === "TOGGLE_PRESENTATION") {
      togglePresentationMode();
      return;
    }
  }

  // ── Modo presentación ────────────────────────────────────────────────
  let presentationMode = false;
  const presentationHint = document.getElementById("presentation-hint");

  function togglePresentationMode(force) {
    presentationMode = force !== undefined ? force : !presentationMode;
    document.body.classList.toggle("presentation-mode", presentationMode);
    if (presentationMode) {
      // Reset hint opacity after re-entering
      if (presentationHint) {
        presentationHint.style.opacity = "1";
        presentationHint.style.transition = "opacity 2s ease 3s";
        // Force reflow to restart animation
        void presentationHint.offsetWidth;
        presentationHint.style.opacity = "0";
      }
      showToast("Modo presentación activo (Ctrl+P para salir)");
      // Close open panels
      setTerminalVisible(false);
      closeSidebar();
      store.dispatch({ type: ActionTypes.CLEAR_SELECTION });
    } else {
      if (presentationHint) presentationHint.style.opacity = "0";
    }
    render();
  }

  // ── Autosave indicator ───────────────────────────────────────────────
  let autosaveHideTimer = null;
  const autosaveEl = document.getElementById("autosave-indicator");

  function flashAutosave() {
    if (!autosaveEl) return;
    autosaveEl.classList.add("visible");
    clearTimeout(autosaveHideTimer);
    autosaveHideTimer = setTimeout(() => autosaveEl.classList.remove("visible"), 2500);
  }

  // ── Status badge ─────────────────────────────────────────────────────
  function updateStatusBadge(state) {
    const { nodes, links } = state.graph;
    const simDot = state.sim.running
      ? ` · <span class="sim-dot"></span>simulando`
      : "";
    const uc = history.undoCount();
    const rc = history.redoCount();
    const undoRedo = (uc > 0 || rc > 0)
      ? ` · <span title="Pasos deshacer/rehacer" style="opacity:0.65">↩${uc} ↪${rc}</span>`
      : "";
    document.getElementById("status-badge").innerHTML =
      `${nodes.length} nodos · ${links.length} enlaces${simDot}${undoRedo}`;
  }

  // ── Subscribe ────────────────────────────────────────────────────────
  let autoExportTimer  = null;
  let autoLsTimer      = null;
  let lastExportedAt   = null;

  store.subscribe(() => {
    const st = store.getState();

    // Inspector overlay — on mobile, close terminal when inspector opens
    const inspectorWasHidden = document.getElementById("inspector-overlay").hidden;
    inspector.render(st);
    const inspectorNowVisible = !document.getElementById("inspector-overlay").hidden;
    if (inspectorNowVisible && inspectorWasHidden && window.innerWidth <= 768 && showTerminal) {
      setTerminalVisible(false);
    }

    // Status badge (includes undo/redo counts)
    updateStatusBadge(st);

    // AI FAB issue badge
    updateFabBadge(st.graph);

    // Terminal PC tracking
    const sel = st.ui.selection;
    const selNode = sel?.kind === "node"
      ? st.graph.nodes.find(n => n.id === sel.id)
      : null;
    terminalPanel.setPc(["pc", "agv", "plc", "ur3"].includes(selNode?.type) ? selNode.id : null);

    render();

    // Auto-persist: URL + sessionStorage (debounced 600 ms)
    const updatedAt = st.graph?.meta?.updatedAt;
    if (updatedAt && updatedAt !== lastExportedAt) {
      clearTimeout(autoExportTimer);
      autoExportTimer = setTimeout(() => {
        lastExportedAt = updatedAt;
        const snap = snapshotGraph();
        exportGraphToURL(snap);
        try { sessionStorage.setItem(DIAGRAM_KEY, JSON.stringify(snap)); } catch {}
      }, 600);

      // Autosave to localStorage (debounced 30 s) with visual indicator
      clearTimeout(autoLsTimer);
      autoLsTimer = setTimeout(() => {
        const snap = snapshotGraph();
        try {
          localStorage.setItem(AUTOSAVE_LS_KEY, JSON.stringify(snap));
          flashAutosave();
        } catch {}
      }, 30_000);
    }
  });

  // ── Render ───────────────────────────────────────────────────────────
  function render() {
    const st = store.getState();
    renderStage({
      stageEl, svgEl, worldEl,
      state: st,
      dispatch: store.dispatch,
      ActionTypes,
      runtime: engine.runtime,
    });
    if (showTerminal) terminalPanel.render();
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function snapshotGraph() {
    return normalizeGraph(store.getState().graph);
  }

  function pushHistorySnapshot() {
    history.push(snapshotGraph());
  }

  // ── Initial render ───────────────────────────────────────────────────
  applyViewport();
  inspector.render(store.getState());
  updateStatusBadge(store.getState());
  terminalPanel.render();
  render();
});

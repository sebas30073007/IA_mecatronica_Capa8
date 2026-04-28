// src/ui/inspectorPanel.js
import { isIPv4, parseMask, prefixToDotted, maskHint } from "../model/addressing.js";

export function createInspector({ dispatch, ActionTypes, onOpenAdvanced }) {
  function overlay() {
    return document.getElementById("inspector-overlay");
  }

  function show() {
    const el = overlay();
    if (el) el.hidden = false;
  }

  function hide() {
    const el = overlay();
    if (el) el.hidden = true;
  }

  function render(state) {
    const container = overlay();
    if (!container) return;

    // Don't replace DOM while the user is typing inside the inspector —
    // the dispatch triggered by the input event would destroy the focused element.
    if (container.contains(document.activeElement)) return;

    const sel = state.ui.selection;
    const graph = state.graph;

    if (!sel) {
      hide();
      return;
    }

    show();

    if (sel.kind === "node") {
      const node = graph.nodes.find(n => n.id === sel.id);
      if (!node) {
        container.innerHTML = `<div class="muted">Nodo no encontrado.</div>`;
        return;
      }

      // Check for duplicate IP in graph
      const dupIp = node.ip && node.ip !== ""
        && graph.nodes.some(n => n.id !== node.id && n.ip === node.ip);

      container.innerHTML = `
        <div class="field">
          <label>Nombre</label>
          <input id="ins-node-label" value="${escapeAttr(node.label)}" />
        </div>
        <div class="field">
          <label>IP</label>
          <input id="ins-node-ip" value="${escapeAttr(node.ip || "")}" placeholder="10.0.0.10"
            class="${node.ip && !isIPv4(node.ip) ? "field-invalid" : dupIp ? "field-warn" : ""}" />
          <small class="field-error" id="ins-ip-error">${
            !node.ip ? "" : !isIPv4(node.ip) ? "Formato inválido (ej: 10.0.0.1)" : dupIp ? "IP duplicada en el diagrama" : ""
          }</small>
        </div>
        <div class="field">
          <label>Tipo</label>
          <input value="${escapeAttr(node.type)}" disabled />
        </div>
        <div class="field">
          <label>Máscara de subred</label>
          <input id="ins-node-mask"
            value="${node.mask !== null && node.mask !== undefined ? '/' + node.mask : ''}"
            placeholder="/24  o  255.255.255.0" />
          <small id="ins-mask-hint" class="mask-hint">${
            node.mask !== null && node.mask !== undefined
              ? '= ' + prefixToDotted(node.mask) : ''
          }</small>
        </div>
        ${['pc', 'server', 'ap'].includes(node.type) ? `
        <div class="field">
          <label>Gateway predeterminado</label>
          <input id="ins-node-gw"
            value="${escapeAttr(node.gateway || '')}"
            placeholder="10.0.0.1"
            class="${node.gateway && !isIPv4(node.gateway) ? "field-invalid" : ""}" />
          <small class="field-error" id="ins-gw-error">${
            node.gateway && !isIPv4(node.gateway) ? "Formato inválido (ej: 10.0.0.1)" : ""
          }</small>
        </div>` : ''}
        <div class="muted" style="font-size:0.78rem;">
          Tip: en PC abre la <strong>Terminal</strong> para hacer <code>ping</code>.
        </div>
        <button id="ins-adv-btn" class="adv-open-btn">
          <i class="fa-solid fa-circle-info"></i> Saber más
        </button>
      `;

      const labelEl = container.querySelector("#ins-node-label");
      const ipEl    = container.querySelector("#ins-node-ip");

      labelEl?.addEventListener("input", () => {
        dispatch({ type: ActionTypes.UPDATE_NODE, payload: { id: node.id, patch: { label: labelEl.value } } });
      });

      const ipErrorEl = container.querySelector("#ins-ip-error");
      ipEl?.addEventListener("input", () => {
        const ip = ipEl.value.trim();
        const ipValid = ip === "" || isIPv4(ip);
        const dup = ip && ipValid && graph.nodes.some(n => n.id !== node.id && n.ip === ip);
        ipEl.classList.toggle("field-invalid", !ipValid);
        ipEl.classList.toggle("field-warn", !!(ipValid && dup));
        if (ipErrorEl) {
          ipErrorEl.textContent = !ipValid
            ? "Formato inválido (ej: 10.0.0.1)"
            : dup ? "IP duplicada en el diagrama" : "";
        }
        dispatch({ type: ActionTypes.UPDATE_NODE, payload: { id: node.id, patch: { ip } } });
      });

      const maskEl     = container.querySelector("#ins-node-mask");
      const maskHintEl = container.querySelector("#ins-mask-hint");
      const gwEl       = container.querySelector("#ins-node-gw");

      maskEl?.addEventListener("input", () => {
        const raw = maskEl.value.trim();
        const prefix = parseMask(raw);
        const valid = raw === "" || prefix !== null;
        maskEl.style.borderColor = valid ? "" : "#d9534f";
        if (maskHintEl) maskHintEl.textContent = raw ? maskHint(raw) : "";
        if (valid) dispatch({ type: ActionTypes.UPDATE_NODE,
          payload: { id: node.id, patch: { mask: prefix } } });
      });

      const gwErrorEl = container.querySelector("#ins-gw-error");
      gwEl?.addEventListener("input", () => {
        const gw = gwEl.value.trim();
        const valid = gw === "" || isIPv4(gw);
        gwEl.classList.toggle("field-invalid", !valid);
        if (gwErrorEl) gwErrorEl.textContent = valid ? "" : "Formato inválido (ej: 10.0.0.1)";
        if (valid) dispatch({ type: ActionTypes.UPDATE_NODE,
          payload: { id: node.id, patch: { gateway: gw } } });
      });

      container.querySelector("#ins-adv-btn")?.addEventListener("click", () => {
        onOpenAdvanced?.("node", node.id);
      });

      return;
    }

    // Link inspector
    const link = graph.links.find(l => l.id === sel.id);
    if (!link) {
      container.innerHTML = `<div class="muted">Enlace no encontrado.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="field">
        <label>Latencia (ms)</label>
        <input id="ins-link-lat" type="number" min="0" step="0.1" value="${link.latencyMs ?? 0.5}" />
      </div>
      <div class="field">
        <label>Ancho de banda (Mbps)</label>
        <input id="ins-link-bw" type="number" min="0.001" step="1" value="${link.bandwidthMbps ?? 1000}" />
      </div>
      <div class="field">
        <label>Pérdida (%)</label>
        <input id="ins-link-loss" type="number" min="0" max="100" step="0.01" value="${link.lossPct ?? 0}" />
      </div>
      <div class="field">
        <label>Estado</label>
        <select id="ins-link-status">
          <option value="up"   ${link.status === "up"   ? "selected" : ""}>UP</option>
          <option value="down" ${link.status === "down" ? "selected" : ""}>DOWN</option>
        </select>
      </div>
      <button id="ins-adv-link-btn" class="adv-open-btn">
        <i class="fa-solid fa-circle-info"></i> Saber más sobre este enlace
      </button>
    `;

    const latEl  = container.querySelector("#ins-link-lat");
    const bwEl   = container.querySelector("#ins-link-bw");
    const lossEl = container.querySelector("#ins-link-loss");
    const stEl   = container.querySelector("#ins-link-status");

    latEl?.addEventListener("input",  () => dispatch({ type: ActionTypes.UPDATE_LINK, payload: { id: link.id, patch: { latencyMs:     Number(latEl.value)  || 0   } } }));
    bwEl?.addEventListener("input",   () => dispatch({ type: ActionTypes.UPDATE_LINK, payload: { id: link.id, patch: { bandwidthMbps: Number(bwEl.value)   || 0.1 } } }));
    lossEl?.addEventListener("input", () => dispatch({ type: ActionTypes.UPDATE_LINK, payload: { id: link.id, patch: { lossPct: Math.max(0, Math.min(100, Number(lossEl.value) || 0)) } } }));
    stEl?.addEventListener("change",  () => dispatch({ type: ActionTypes.UPDATE_LINK, payload: { id: link.id, patch: { status: stEl.value } } }));

    container.querySelector("#ins-adv-link-btn")?.addEventListener("click", () => {
      onOpenAdvanced?.("link", link.id);
    });
  }

  return { render, show, hide };
}

function escapeAttr(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

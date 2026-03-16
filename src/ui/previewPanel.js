// src/ui/previewPanel.js
// UI de preview de acciones antes de aplicar al diagrama.

const OP_ICONS  = { add: "+", modify: "~", delete: "−" };
const OP_CLASSES = { add: "preview-op-add", modify: "preview-op-mod", delete: "preview-op-del" };

/**
 * Muestra un modal de preview de acciones.
 * @param {PreviewItem[]} items
 * @param {{ onApply: Function, onCancel: Function }} callbacks
 * @returns {{ destroy: Function }}
 */
export function showPreviewPanel(items, { onApply, onCancel } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "preview-backdrop";

  const panel = document.createElement("div");
  panel.className = "preview-panel";

  panel.innerHTML = `
    <div class="preview-header">
      <span class="preview-title">Vista previa — ${items.length} cambio${items.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="preview-items">
      ${items.map(item => `
        <div class="preview-item ${OP_CLASSES[item.op] || ""}">
          <span class="preview-op">[${OP_ICONS[item.op] || "?"}]</span>
          <span class="preview-detail">${escapeHtml(item.detail)}</span>
        </div>
      `).join("")}
    </div>
    <div class="preview-footer">
      <button class="preview-btn preview-btn-cancel">Cancelar</button>
      <button class="preview-btn preview-btn-apply">Aplicar todo (${items.length})</button>
    </div>
  `;

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  function destroy() { backdrop.remove(); }

  panel.querySelector(".preview-btn-cancel").addEventListener("click", () => {
    destroy();
    onCancel?.();
  });

  panel.querySelector(".preview-btn-apply").addEventListener("click", async () => {
    const btn = panel.querySelector(".preview-btn-apply");
    btn.disabled = true;
    btn.textContent = "Aplicando…";
    try {
      await onApply?.(items.map(i => i.action.parsed));
      destroy();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `Error: ${String(err.message || err)}`;
    }
  });

  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) { destroy(); onCancel?.(); }
  });

  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { destroy(); onCancel?.(); document.removeEventListener("keydown", onEsc); }
  }, { once: true });

  return { destroy };
}

/**
 * Convierte acciones parseadas en PreviewItems legibles.
 * @param {Array<{parsed: object, valid: boolean}>} actions
 * @returns {PreviewItem[]}
 */
export function actionsToPreviewItems(actions) {
  return actions.filter(a => a.valid && a.parsed).map(action => {
    const p = action.parsed;
    let op = "add", kind = "node", detail = "";

    switch (p.action) {
      case "add_node":
        op = "add"; kind = "node";
        detail = `Agregar ${p.type || "nodo"} "${p.label || "?"}"${p.ip ? ` (${p.ip})` : ""}`;
        break;
      case "add_link":
        op = "add"; kind = "link";
        detail = `Conectar ${p.sourceLabel} ↔ ${p.targetLabel}${p.latencyMs ? ` (${p.latencyMs}ms)` : ""}`;
        break;
      case "delete_node":
        op = "delete"; kind = "node";
        detail = `Eliminar nodo "${p.label || "?"}"`;
        break;
      case "delete_link":
        op = "delete"; kind = "link";
        detail = `Eliminar enlace ${p.sourceLabel} ↔ ${p.targetLabel}`;
        break;
      case "set_link_status":
        op = "modify"; kind = "link";
        detail = `Poner enlace ${p.sourceLabel} ↔ ${p.targetLabel} en ${p.status}`;
        break;
      case "apply_graph":
        op = "add"; kind = "node";
        detail = "Aplicar topología completa";
        break;
      default:
        op = "modify"; detail = p.action;
    }

    return { op, kind, detail, action };
  });
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

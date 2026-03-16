// src/ui/shortcutManager.js
// Mapea teclas a acciones (Falstad-like). Evita disparar cuando el usuario escribe en inputs.

const isTypingTarget = () => {
  const t = document.activeElement;
  if (!t) return false;
  const tag = (t.tagName || "").toLowerCase();
  return ["input", "textarea", "select"].includes(tag) || t.isContentEditable;
};

export function bindShortcuts({ onAction, onStatus }) {
  window.addEventListener("keydown", (e) => {
    if (isTypingTarget()) return;

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && key === "n") { e.preventDefault(); onAction("FILE_NEW"); return; }
    if (ctrl && key === "o") { e.preventDefault(); onAction("FILE_IMPORT"); return; }
    if (ctrl && key === "s") { e.preventDefault(); onAction("FILE_EXPORT"); return; }
    if (ctrl && key === "l") { e.preventDefault(); onAction("EXPORT_URL"); return; }

    if (e.key === "Escape") { onAction("TOOL_SELECT"); return; }
    if (e.key === " ") { e.preventDefault(); onAction("TOGGLE_RUN"); return; }

    if (key === "r") { onAction("TOOL_ROUTER");   onStatus?.("Herramienta: Router (R)"); return; }
    if (key === "s") { onAction("TOOL_SWITCH");   onStatus?.("Herramienta: Switch (S)"); return; }
    if (key === "p") { onAction("TOOL_PC");       onStatus?.("Herramienta: PC (P)"); return; }
    if (key === "f") { onAction("TOOL_FIREWALL"); onStatus?.("Herramienta: Firewall (F)"); return; }
    if (key === "l") { onAction("TOOL_LINK");     onStatus?.("Herramienta: Enlace (L)"); return; }
    if (key === "i") { onAction("TOGGLE_IP_LABELS"); onStatus?.("IPs alternadas (I)"); return; }
    if (key === "o") { onAction("PRETTY_LAYOUT"); onStatus?.("Diagrama organizado (O)"); return; }
  });
}

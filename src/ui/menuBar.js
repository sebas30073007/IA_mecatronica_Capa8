// src/ui/menuBar.js
// Menú desplegable estilo Falstad (pero CAPA 8)
// Lee la estructura de menús desde menuConfig.js (fuente única de verdad).
import { MENUS } from "./menuConfig.js";

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function closeAll(root) {
  root.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
  root.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
}

function buildItem(item, onAction, onStatus) {
  if (item.sep) {
    return el("div", "menu-sep");
  }

  const btn = el("button", "menu-item");
  btn.type = "button";
  btn.innerHTML = `
    <i class="${item.icon || "fa-solid fa-circle"}"></i>
    <span>${item.label}</span>
    <span class="menu-kbd">${item.shortcut || ""}</span>
  `;

  btn.addEventListener("click", () => {
    if (item.action) onAction?.(item.action);
    if (item.status) onStatus?.(item.status);
  });

  return btn;
}

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.container - #sim-menubar
 * @param {(actionId:string)=>void} opts.onAction
 * @param {(text:string)=>void} opts.onStatus
 */
export function createMenuBar({ container, onAction, onStatus }) {
  if (!container) return;

  container.innerHTML = "";

  // Shared close timer — prevents menu from closing while cursor crosses the
  // 8px gap between the menu button and the absolutely-positioned dropdown.
  let closeTimer = null;
  const CLOSE_DELAY = 250;

  function cancelClose() { clearTimeout(closeTimer); }
  function scheduleClose() {
    closeTimer = setTimeout(() => closeAll(container), CLOSE_DELAY);
  }

  MENUS.forEach(menuDef => {
    const menu = el("div", "menu");

    const btn = el("button", "menu-btn");
    btn.type = "button";
    btn.textContent = menuDef.label;

    const dropdown = el("div", "menu-dropdown");
    menuDef.items.forEach(item => dropdown.appendChild(buildItem(item, onAction, onStatus)));

    // ── Touch: toggle on first tap (prevents mouseenter interference) ────
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault(); // block the synthesized mouseenter + click
      const isOpen = menu.classList.contains("open");
      closeAll(container);
      if (!isOpen) {
        menu.classList.add("open");
        btn.classList.add("active");
      }
    }, { passive: false });

    // ── Click: toggle open/close (desktop) ──────────────────────────────
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("open");
      closeAll(container);
      if (!isOpen) {
        menu.classList.add("open");
        btn.classList.add("active");
      }
    });

    // ── Hover: open on enter (desktop only — skip on touch devices) ──────
    menu.addEventListener("mouseenter", () => {
      // On touch devices mouseenter fires on first tap and then click closes
      // the dropdown immediately, requiring a second tap. Skip on touch.
      if (window.matchMedia("(hover: none)").matches) return;
      cancelClose();
      if (menu.classList.contains("open")) return;
      container.querySelectorAll(".menu").forEach(m => {
        if (m !== menu) {
          m.classList.remove("open");
          m.querySelector(".menu-btn")?.classList.remove("active");
        }
      });
      menu.classList.add("open");
      btn.classList.add("active");
    });

    // When cursor leaves the entire menu+dropdown area, start close timer.
    menu.addEventListener("mouseleave", scheduleClose);

    // Dropdown keeps the menu alive even though it's positioned absolutely.
    dropdown.addEventListener("mouseenter", cancelClose);
    // dropdown.mouseleave is intentionally omitted — menu.mouseleave covers it.

    // Close immediately after clicking an item
    dropdown.addEventListener("click", () => { cancelClose(); closeAll(container); });

    menu.appendChild(btn);
    menu.appendChild(dropdown);
    container.appendChild(menu);
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) closeAll(container);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll(container);
  });

  // Acciones de UI puras (Ajustes) sin pasar por main.js
  container.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    const text = item.innerText.toLowerCase();
    const stage = document.getElementById("network-stage");
    if (!stage) return;
    if (text.includes("rejilla")) stage.classList.toggle("no-grid");
    if (text.includes("fondo blanco")) stage.classList.toggle("white-bg");
  });
}

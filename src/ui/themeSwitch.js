// src/ui/themeSwitch.js
//
// El interruptor claro/oscuro, compartido por el simulador y about.
//
// El cambio en sí es una línea —`dataset.theme`— y así estaba escrito,
// duplicado en las dos páginas. El problema era que reasignar los tokens
// repinta todo en un frame: el salto de luminancia con el lienzo a
// pantalla completa deslumbra, y en claro→oscuro deja postimagen.
//
// La solución es una transición corta de color, no una animación: 440 ms
// es suficiente para que el ojo siga el cambio en vez de recibirlo, y
// corto como para que no se lea como espera. La regla vive en
// `style.css` (`:root.theme-swap`), y aquí solo se pone y se quita la
// clase, porque dejarla puesta metería transiciones de color en el hover
// de toda la interfaz y en el arrastre de nodos.

const CLASE      = "theme-swap";
const DURACION_MS = 440;   // debe coincidir con :root.theme-swap en style.css
const CLAVE      = "capa8_theme";

let timer = null;

/** ¿Está activo el tema claro? */
export function isLight() {
  return document.documentElement.dataset.theme === "light";
}

/**
 * Cambia al tema contrario, con la transición puesta.
 *
 * @param {() => void} [onApply] - repintado que dependa del tema; lo usa
 *   el simulador porque el SVG lleva colores resueltos en JS, no en CSS.
 * @returns {boolean} true si el tema resultante es el claro.
 */
export function toggleTheme(onApply) {
  const root  = document.documentElement;
  const claro = !isLight();

  // Pulsar dos veces seguidas no debe cortar la transición a medias:
  // se reinicia la ventana en vez de acumular temporizadores.
  root.classList.add(CLASE);
  clearTimeout(timer);
  timer = setTimeout(() => root.classList.remove(CLASE), DURACION_MS);

  root.dataset.theme = claro ? "light" : "";
  try { localStorage.setItem(CLAVE, claro ? "light" : ""); } catch { /* modo privado */ }

  onApply?.();
  return claro;
}

/** Pone el icono del botón acorde al tema actual (sol en claro, luna en oscuro). */
export function syncThemeIcon(icon = document.querySelector("#theme-toggle i")) {
  if (icon) icon.className = isLight() ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

/**
 * Cablea el botón `#theme-toggle` y deja el icono sincronizado.
 * @param {() => void} [onApply]
 */
export function initThemeToggle(onApply) {
  const btn = document.getElementById("theme-toggle");
  syncThemeIcon(btn?.querySelector("i"));
  btn?.addEventListener("click", () => {
    toggleTheme(onApply);
    syncThemeIcon(btn.querySelector("i"));
  });
}

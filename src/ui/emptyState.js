// src/ui/emptyState.js
//
// La primera pantalla, que antes no existía.
//
// Cuando `nodes.length === 0`, main.js hacía `return` y el usuario se
// quedaba mirando una rejilla en blanco. Para uso en clase eso es el
// problema principal: nada de lo que la herramienta sabe hacer —los 8
// diagnósticos, el CLI, las 11 topologías, las fichas por dispositivo—
// es descubrible desde una pantalla vacía.
//
// Ofrece dos caminos hacia el primer nodo:
//
//   1. Describir la red en palabras. Es el camino que enseña de qué va
//      la herramienta, pero depende del modelo, así que puede fallar.
//   2. Abrir un ejemplo. Es determinista: siempre funciona.
//
// Cuál va primero lo decide LEAD, más abajo, y está atado a la medición
// de bench/emptycanvas_bench.mjs — no a una corazonada.

import { loadExample } from "../examples/index.js";

// Qué camino se presenta como principal.
//   "describe" → el input arriba, ejemplos debajo
//   "examples" → la galería arriba, el input debajo
//
// MEDIDO, no supuesto. bench/emptycanvas_bench.mjs, 12 descripciones × 3
// repeticiones sobre lienzo vacío, gemma3:12b:
//
//   emite acciones          100 %
//   grafo usable             69.4 %
//   responde a lo pedido     75 %
//   ÉXITO (ambas)            44.4 %
//   latencia mediana         82 s
//
// Dos razones para que la galería vaya primero, y la segunda pesa más
// que la primera:
//
//   1. Con 44 % de éxito, más de la mitad de los alumnos vería una
//      topología incompleta como primera impresión de la herramienta.
//   2. Aunque acertara siempre, 82 segundos de espera en la primera
//      pantalla se leen como «esto no funciona». Un ejemplo carga al
//      instante.
//
// El fallo típico no es JSON inválido —las acciones se aplican bien—
// sino que el modelo crea los dispositivos y no los cablea: 22 % de los
// grafos salen fragmentados y 31 % con nodos sueltos.
//
// Si algún día se mide mejor (Groq es bastante más rápido y acertaba
// más en el bench de acciones), cambiar esta constante basta.
const LEAD = "examples";

// Las once topologías, de menor a mayor complejidad: las seis primeras
// se muestran de entrada y el resto se despliega en el sitio.
//
// Desplegar aquí en vez de mandar al menú Ejemplos es deliberado: el
// estado vacío no debería depender de que el usuario encuentre un menú
// —que es justo el problema que este panel viene a resolver— ni el
// módulo debería acoplarse a la barra de menús para funcionar.
const EJEMPLOS = [
  { key: "small_lan",         nombre: "LAN pequeña",    desc: "Router, switch y PCs" },
  { key: "home_network",      nombre: "Red doméstica",  desc: "Lo que tienes en casa" },
  { key: "vlan_routing",      nombre: "VLAN + routing", desc: "Segmentar y enrutar" },
  { key: "dmz",               nombre: "DMZ",            desc: "Dos firewalls, zona pública" },
  { key: "campus",            nombre: "Campus",         desc: "Varios edificios" },
  { key: "red_industrial",    nombre: "Industrial",     desc: "PLC, robot y AGV" },
  { key: "wan_redundant",     nombre: "WAN redundante", desc: "Doble salida" },
  { key: "data_center",       nombre: "Data center",    desc: "Servidores y core" },
  { key: "mpls_wan",          nombre: "WAN MPLS",       desc: "Sucursales por MPLS" },
  { key: "red_universitaria", nombre: "Universitaria",  desc: "Red de una facultad" },
  { key: "este_proyecto",     nombre: "Este proyecto",  desc: "La arquitectura de Capa 8" },
];
const VISIBLES_INICIALMENTE = 6;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const bloqueDescribe = () => `
  <form class="es-ask" id="es-ask">
    <input class="es-input" id="es-input" type="text" autocomplete="off"
           placeholder="Describe la red que quieres construir…"
           aria-label="Describe la red que quieres construir">
    <button class="es-send" type="submit" aria-label="Construir">
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    </button>
  </form>
  <p class="es-ask-hint">Por ejemplo: «una red de oficina con un router, un switch y 3 PCs»</p>`;

const tarjeta = (e, oculta) => `
  <button class="es-card${oculta ? " es-card--extra" : ""}" type="button"
          data-example="${esc(e.key)}"${oculta ? " hidden" : ""}>
    <span class="es-card-name">${esc(e.nombre)}</span>
    <span class="es-card-desc">${esc(e.desc)}</span>
  </button>`;

const bloqueEjemplos = () => `
  <div class="es-gallery">
    ${EJEMPLOS.map((e, i) => tarjeta(e, i >= VISIBLES_INICIALMENTE)).join("")}
  </div>
  <button class="es-more" type="button" id="es-more">
    Ver las ${EJEMPLOS.length} topologías →
  </button>`;

/**
 * @param {Object} deps
 * @param {HTMLElement} deps.container - overlay dentro de .network-stage
 * @param {(texto:string)=>void} deps.onDescribe   - manda la descripción a la IA
 * @param {(graph:object)=>void} deps.onLoadExample
 */
export function createEmptyState({ container, onDescribe, onLoadExample }) {
  if (!container) return null;
  let montado = false;

  container.addEventListener("submit", e => {
    const form = e.target.closest("#es-ask");
    if (!form) return;
    e.preventDefault();
    const input = container.querySelector("#es-input");
    const texto = (input?.value || "").trim();
    if (!texto) return;
    input.value = "";
    onDescribe?.(texto);
  });

  container.addEventListener("click", async e => {
    const more = e.target.closest("#es-more");
    if (more) {
      container.querySelectorAll(".es-card--extra").forEach(el => { el.hidden = false; });
      more.remove();
      return;
    }

    const card = e.target.closest("[data-example]");
    if (!card) return;
    card.disabled = true;
    card.classList.add("es-card--loading");
    try {
      const graph = await loadExample(card.dataset.example);
      onLoadExample?.(graph);
    } catch {
      card.classList.remove("es-card--loading");
      card.disabled = false;
      card.classList.add("es-card--error");
      card.querySelector(".es-card-desc").textContent = "No se pudo cargar";
    }
  });

  function mostrar() {
    if (montado) return;
    montado = true;
    const primero  = LEAD === "describe" ? bloqueDescribe() : bloqueEjemplos();
    const segundo  = LEAD === "describe" ? bloqueEjemplos() : bloqueDescribe();
    const separador = LEAD === "describe"
      ? "o empieza desde un ejemplo"
      : "o descríbela y la construyo";

    container.innerHTML = `
      <div class="es-card-wrap">
        <h1 class="es-title">¿Qué red quieres construir?</h1>
        ${primero}
        <div class="es-sep"><span>${separador}</span></div>
        ${segundo}
        <p class="es-draw">
          o dibújala tú:
          <kbd>R</kbd> router · <kbd>S</kbd> switch · <kbd>P</kbd> PC · <kbd>L</kbd> enlace
        </p>
      </div>`;
    container.hidden = false;
  }

  function ocultar() {
    if (!montado) return;
    montado = false;
    container.hidden = true;
    container.innerHTML = "";
  }

  /** Llamado por el suscriptor del store en cada cambio. */
  function sync(graph) {
    if (graph.nodes.length === 0) mostrar();
    else ocultar();
  }

  return { sync };
}

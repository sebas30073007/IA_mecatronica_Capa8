// src/ui/emptyState.js
//
// La primera pantalla, que antes no existía.
//
// Cuando `nodes.length === 0`, main.js hacía `return` y el usuario se
// quedaba mirando una rejilla en blanco. Para uso en clase eso es el
// problema principal: nada de lo que la herramienta sabe hacer —los 8
// diagnósticos, el CLI, las topologías de ejemplo, las fichas por
// dispositivo— es descubrible desde una pantalla vacía.
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
import { compDots } from "./typeTag.js";

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

// Seis topologías, de menor a mayor complejidad. Seis y no las once que
// hay: la galería es la primera pantalla, y una rejilla que se despliega
// a once tarjetas convierte «elige un ejemplo» en una decisión. Las
// otras cinco siguen a un clic, en el menú Ejemplos, para quien ya sabe
// qué busca.
//
// El corte no es por complejidad sino por cobertura: entre estas seis
// aparecen los diez tipos de dispositivo y las tres escalas —casa, LAN,
// campus—, así que ninguna de las que se quedan fuera enseñaría algo que
// no esté ya aquí.
//
// `comp` es el censo de tipos de cada topología, y alimenta la fila de
// puntos de color de cada tarjeta: se ve de qué está hecha una red antes
// de abrirla, que es justo lo que una descripción de cuatro palabras no
// alcanza a decir.
//
// Va estático a propósito. Las alternativas eran seis `fetch` en el
// primer paint de la pantalla que debe cargar al instante, o acoplar el
// estado vacío a los JSON. A cambio hay que evitar la deriva:
// `tests/examples.test.js` recalcula el censo desde los JSON y falla si
// alguno de estos mapas deja de coincidir.
export const EJEMPLOS = [
  { key: "small_lan",         nombre: "LAN pequeña",    desc: "Router, switch y PCs",
    comp: { router: 1, switch: 1, pc: 2 } },
  { key: "home_network",      nombre: "Red doméstica",  desc: "Lo que tienes en casa",
    comp: { router: 1, ap: 1, pc: 4, server: 1 } },
  { key: "data_center",       nombre: "Data center",    desc: "Servidores y core",
    comp: { firewall: 1, switch: 2, server: 6 } },
  { key: "red_industrial",    nombre: "Industrial",     desc: "PLC, robot y AGV",
    comp: { firewall: 1, router: 1, switch: 1, plc: 2, ur3: 1, agv: 2, server: 1, pc: 1, ap: 1 } },
  { key: "campus",            nombre: "Campus",         desc: "Varios edificios",
    comp: { cloud: 1, router: 1, switch: 4, ap: 3, pc: 5, server: 1 } },
  { key: "este_proyecto",     nombre: "Este proyecto",  desc: "La arquitectura de Capa 8",
    comp: { cloud: 4, router: 1, switch: 1, pc: 3 } },
];

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

const tarjeta = e => `
  <button class="es-card" type="button" data-example="${esc(e.key)}">
    <span class="es-card-name">${esc(e.nombre)}</span>
    <span class="es-card-desc">${esc(e.desc)}</span>
    ${compDots(e.comp)}
  </button>`;

const bloqueEjemplos = () => `
  <div class="es-gallery">
    ${EJEMPLOS.map(tarjeta).join("")}
  </div>`;

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
          <kbd data-type="router">R</kbd> <span class="type-ink" data-type="router">router</span> ·
          <kbd data-type="switch">S</kbd> <span class="type-ink" data-type="switch">switch</span> ·
          <kbd data-type="pc">P</kbd> <span class="type-ink" data-type="pc">PC</span> ·
          <kbd>L</kbd> enlace
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

// src/sim/engine.js
// Motor de animación didáctico.
//
// Un paquete NO es "un punto sobre un enlace": es algo que recorre una ruta
// salto a salto. Antes se empujaba un paquete por cada enlace del camino, todos
// arrancando a la vez, y el alumno veía cuatro puntos aparecer simultáneamente
// en cuatro enlaces distintos en lugar de uno recorriendo la ruta. El comentario
// original lo llamaba "didáctico"; era justo lo contrario.
//
// Cada salto guarda `fromId`/`toId`, o sea el sentido REAL de recorrido. Un
// enlace no sabe hacia dónde se atraviesa —guarda source/target en el orden en
// que se creó— así que sin esto algunos paquetes se veían viajar hacia atrás.
//
// NO pretende implementar TCP/IP: modela latencia por enlace y poco más.

const PULSE_SECONDS = 0.45;   // duración del destello al llegar a un nodo
const MIN_LATENCY_MS = 10;    // fallback si el enlace no declara latencia

// ── Cuánto dura un salto en pantalla ────────────────────────────────────────
//
// Antes la velocidad era inversamente proporcional a la latencia sin más:
// `rate = 100 / latencyMs`. Suena razonable hasta que se miran los datos
// reales — las topologías de ejemplo usan de 0.1 ms a 20 ms, un rango de 200×.
// Un enlace de 0.5 ms tardaba 0.01 s por salto: el paquete se teletransportaba
// y no había nada que observar, que es justo lo contrario de lo que se busca.
//
// Ahora se piensa en DURACIÓN, no en velocidad, y se acota:
//
//   BASE           suelo: ningún salto baja de aquí, por rápido que sea el enlace
//   POR_MS         cuánto alarga cada ms de latencia
//   TOPE_LATENCIA  techo: un enlace WAN no debe eternizar la animación
//
// A 1× queda: 0.1 ms → 0.31 s · 1 ms → 0.35 s · 5 ms → 0.55 s · 20 ms → 1.3 s.
// El multiplicador de velocidad divide esa duración, así que 2× es el doble de
// rápido y 0.5× la mitad. La escala completa es ~4× más lenta que la anterior:
// el antiguo 0.5× equivale aproximadamente al 2× de ahora.
const BASE_SECONDS = 0.30;
const SECONDS_PER_MS = 0.05;
const MAX_LATENCY_MS = 25;

function hopSeconds(latencyMs) {
  return BASE_SECONDS + Math.min(latencyMs, MAX_LATENCY_MS) * SECONDS_PER_MS;
}

export function createEngine({ store, onFrame }) {
  // Estado del runtime, mutable y fuera del store: cambia cada frame y no
  // tiene por qué provocar re-render de nada más.
  const runtime = {
    speed: 1,
    packets: [],   // ver enqueuePacket
    pulses: [],    // [{ nodeId, t }] destellos de llegada
    lastTs: null,
  };

  function setSpeed(v) {
    runtime.speed = Math.max(0.25, Math.min(3, Number(v) || 1));
  }

  /**
   * Encola un paquete que recorrerá `hops` de principio a fin.
   *
   * @param {Object}   opts
   * @param {Array}    opts.hops     - [{ linkId, fromId, toId }] (ver linksToHops)
   * @param {string}   opts.kind     - "echo-request" | "echo-reply" | "probe" | "probe-reply"
   * @param {string}   [opts.label]  - texto junto al punto, p.ej. "TTL=2"
   * @param {Function} [opts.onHop]  - (nodeId, packet) al llegar a cada nodo
   * @param {Function} [opts.onArrive] - (packet) al completar la ruta
   * @returns {string|null} id del paquete
   */
  function enqueuePacket({ hops, kind = "echo-request", label = "", onHop, onArrive }) {
    if (!Array.isArray(hops) || hops.length === 0) return null;
    const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    runtime.packets.push({ id, kind, label, hops, hopIndex: 0, progress: 0, onHop, onArrive });
    return id;
  }

  /** Destello en un nodo, para marcar que algo llegó ahí. */
  function pulse(nodeId) {
    if (nodeId) runtime.pulses.push({ nodeId, t: 0 });
  }

  /** Vacía la escena (cambio de topología, comando nuevo…). */
  function clear() {
    runtime.packets = [];
    runtime.pulses = [];
  }

  function step(dt) {
    const graph = store.getState().graph;

    // Los callbacks pueden encolar paquetes nuevos (la respuesta de un echo,
    // la siguiente sonda de un traceroute). Si se invocaran dentro del filter,
    // esos paquetes se perderían al reasignar runtime.packets. Se difieren.
    const arrived = [];

    runtime.packets = runtime.packets.filter(p => {
      const hop = p.hops[p.hopIndex];
      const link = graph.links.find(l => l.id === hop.linkId);

      // El enlace desapareció bajo los pies del paquete (lo borraron mientras
      // viajaba): se descarta en vez de dejarlo avanzar sobre la nada.
      if (!link) return false;

      const latency = link.latencyMs > 0 ? link.latencyMs : MIN_LATENCY_MS;
      p.progress += dt * runtime.speed / hopSeconds(latency);

      if (p.progress < 1) return true;

      // Llegó al extremo del salto actual
      p.progress = 0;
      pulse(hop.toId);
      p.onHop?.(hop.toId, p);
      p.hopIndex++;

      if (p.hopIndex < p.hops.length) return true;

      arrived.push(p);
      return false;
    });

    for (const p of arrived) p.onArrive?.(p);

    if (runtime.pulses.length) {
      runtime.pulses = runtime.pulses.filter(u => (u.t += dt) < PULSE_SECONDS);
    }
  }

  function tick(ts) {
    if (runtime.lastTs == null) runtime.lastTs = ts;
    // Clamp: con la pestaña en segundo plano la animación se ralentiza en vez
    // de dar un salto enorme al volver.
    const dt = Math.min(0.05, (ts - runtime.lastTs) / 1000);
    runtime.lastTs = ts;

    // Solo se trabaja si hay algo que animar. Antes esto dependía de un flag
    // `running` que el usuario tenía que activar a mano: con él apagado los
    // paquetes quedaban congelados sobre el nodo origen acumulándose, y con él
    // encendido y el lienzo quieto se reconstruía toda la escena a 60 fps sin
    // cambio visual alguno.
    if (runtime.packets.length || runtime.pulses.length) {
      step(dt);
      onFrame?.(runtime);
    }

    requestAnimationFrame(tick);
  }

  function start() {
    requestAnimationFrame(tick);
  }

  return { runtime, start, setSpeed, enqueuePacket, pulse, clear };
}

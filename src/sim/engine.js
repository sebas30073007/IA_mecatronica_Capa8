// src/sim/engine.js
// Motor de simulación "ligero" (didáctico):
// - Loop requestAnimationFrame
// - Animación de paquetes sobre links (para pings / demos)
// - NO intenta implementar TCP/IP completo (aún)

export function createEngine({ store, onFrame, onStatus }) {
  // ── Estado del runtime (mutable, no en el store Redux) ───────────────
  const runtime = {
    running: false,
    speed: 1,
    packets: [], // {id, linkId, progress, direction, kind}
    lastTs: null,
  };

  function setRunning(value) {
    runtime.running = value;
  }

  function setSpeed(v) {
    runtime.speed = Math.max(0.25, Math.min(3, v || 1));
  }

  // ── Animación de paquetes ────────────────────────────────────────────
  function enqueuePathAnimation({ linkIds, kind = "icmp", direction = "ab" }) {
    // Un paquete por enlace del path — todos viajan en paralelo (didáctico).
    for (const linkId of linkIds) {
      runtime.packets.push({
        id: `p_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        linkId,
        progress: 0,
        direction,
        kind,
      });
    }
  }

  // ── Loop principal (requestAnimationFrame) ───────────────────────────
  function tick(ts) {
    if (runtime.lastTs == null) runtime.lastTs = ts;
    const dt = Math.min(0.05, (ts - runtime.lastTs) / 1000);
    runtime.lastTs = ts;

    if (runtime.running) {
      step(dt * runtime.speed);
      onFrame?.(runtime);
    }

    requestAnimationFrame(tick);
  }

  function step(dt) {
    const graph = store.getState().graph;
    runtime.packets = runtime.packets.filter(p => {
      const link = graph.links.find(l => l.id === p.linkId);
      // Velocidad inversamente proporcional a latencia: más latencia = más lento.
      // Base: 100ms = 1 seg real; escala con runtime.speed.
      const latency = (link?.latencyMs > 0 ? link.latencyMs : 10);
      const rate = (100 / latency) * runtime.speed;
      p.progress += dt * rate * 0.5;
      return p.progress < 1;
    });
  }

  function start() {
    requestAnimationFrame(tick);
  }

  return { runtime, start, setRunning, setSpeed, enqueuePathAnimation };
}

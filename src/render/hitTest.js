// src/render/hitTest.js
// Hit testing básico para nodos y enlaces (distancia a segmento)

export function hitTestNode(nodes, x, y) {
  // Itera al revés: el último dibujado "encima"
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const box = getNodeBox(n);
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      return n;
    }
  }
  return null;
}

export function getNodeBox(node) {
  const w = 90;
  const h = 112;
  return { x: node.x - w / 2, y: node.y - h / 2, w, h };
}

export function distancePointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const ab2 = abx * abx + aby * aby;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = ax + t * abx;
  const cy = ay + t * aby;

  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function hitTestLink(graph, x, y, threshold = 10) {
  // busca el enlace más cercano
  let best = null;
  let bestD = Infinity;

  for (const l of graph.links) {
    const a = graph.nodes.find(n => n.id === l.source);
    const b = graph.nodes.find(n => n.id === l.target);
    if (!a || !b) continue;

    const d = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < threshold && d < bestD) {
      bestD = d;
      best = l;
    }
  }

  return best;
}

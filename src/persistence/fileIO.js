// src/persistence/fileIO.js

// ── SVG/PNG diagram export ────────────────────────────────────────────────────

const NODE_COLORS = {
  router:   "#60a5fa", switch: "#22d3ee", pc:    "#a78bfa",
  firewall: "#f87171", server: "#34d399", cloud: "#7dd3fc",
  ap:       "#fbbf24", plc:    "#a78bfa", ur3:   "#38bdf8", agv: "#fb923c",
};

const NODE_SYMBOLS = {
  router:   "▣", switch: "⊞", pc:    "▢",
  firewall: "⬡", server: "▤", cloud: "☁",
  ap:       "⊕", plc:    "⊟", ur3:   "⊚", agv: "⊳",
};

/**
 * Builds an SVG string representing the graph for export.
 * Uses the same coordinate space as the diagram.
 */
export function graphToSvg(graph, { darkMode = true } = {}) {
  if (!graph?.nodes?.length) return null;

  const PAD   = 80;
  const R     = 22;    // node circle radius
  const LABEL_Y = 38;
  const IP_Y    = 52;

  const xs   = graph.nodes.map(n => n.x);
  const ys   = graph.nodes.map(n => n.y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  const W    = maxX - minX;
  const H    = maxY - minY;

  const bg      = darkMode ? "#0a0b1e" : "#f8f9fc";
  const textCol = darkMode ? "#e2e8f0" : "#1e293b";
  const subCol  = darkMode ? "#64748b" : "#94a3b8";
  const linkCol = darkMode ? "#334155" : "#cbd5e1";
  const downCol = "#ef4444";

  // Build node lookup
  const nodeMap = Object.fromEntries(graph.nodes.map(n => [n.id, n]));

  // Links
  const linksSvg = graph.links.map(l => {
    const a = nodeMap[l.source], b = nodeMap[l.target];
    if (!a || !b) return "";
    const color = l.status === "down" ? downCol : linkCol;
    const dash  = l.status === "down" ? ' stroke-dasharray="6 4"' : "";
    return `<line x1="${a.x - minX}" y1="${a.y - minY}" x2="${b.x - minX}" y2="${b.y - minY}" stroke="${color}" stroke-width="2"${dash}/>`;
  }).join("\n  ");

  // Nodes
  const nodesSvg = graph.nodes.map(n => {
    const cx    = n.x - minX;
    const cy    = n.y - minY;
    const color = NODE_COLORS[n.type] ?? "#60a5fa";
    const sym   = NODE_SYMBOLS[n.type] ?? "◻";
    const label = escSvg(n.label ?? "");
    const ip    = n.ip ? escSvg(n.ip) : "";
    return [
      `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}22" stroke="${color}" stroke-width="1.5"/>`,
      `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" fill="${color}" font-family="sans-serif">${sym}</text>`,
      `<text x="${cx}" y="${cy + LABEL_Y}" text-anchor="middle" font-size="11" fill="${textCol}" font-family="sans-serif" font-weight="500">${label}</text>`,
      ip ? `<text x="${cx}" y="${cy + IP_Y}" text-anchor="middle" font-size="10" fill="${subCol}" font-family="monospace">${ip}</text>` : "",
    ].join("\n    ");
  }).join("\n\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <!-- Links -->
  ${linksSvg}
  <!-- Nodes -->
  ${nodesSvg}
</svg>`;
}

function escSvg(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/** Download diagram as SVG file */
export function downloadSvg(filename, svgString) {
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

/** Render SVG to canvas and download as PNG */
export function downloadPng(filename, svgString) {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl  = svgDoc.documentElement;
    const W = parseInt(svgEl.getAttribute("width")  || "800");
    const H = parseInt(svgEl.getAttribute("height") || "600");

    const canvas = document.createElement("canvas");
    const SCALE  = 2;  // retina
    canvas.width  = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(svgBlob);
    const img  = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("canvas.toBlob failed")); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 500);
        resolve();
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

export function openJsonFilePicker({ accept = ".json" } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return resolve(null);

      const text = await file.text();
      resolve({ file, text });
    });

    input.click();
  });
}

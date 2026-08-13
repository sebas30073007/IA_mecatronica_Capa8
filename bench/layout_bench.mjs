// bench/layout_bench.mjs
//
// Línea base numérica del motor de layout.
//
// Corre Pretty sobre las topologías de `src/examples/` más un puñado de
// casos sintéticos que la auditoría marcó como problemáticos, y saca una
// tabla de métricas absolutas. Es el criterio con el que se juzga cada
// etapa de la reestructuración: sin esto, "¿mejoró el layout?" solo se
// puede responder mirando.
//
//   node bench/layout_bench.mjs                 tabla en consola
//   node bench/layout_bench.mjs --json out.json guarda para comparar
//   node bench/layout_bench.mjs --diff ref.json compara contra una corrida
//
// Las métricas no tienen "bueno" ni "malo" absoluto salvo dos: `crossings`
// y `edgeThroughNode` siempre es mejor que bajen. El resto se lee en
// contexto — un área menor con más cruces no es una mejora.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { computeLayout, layoutMetrics } from "../src/app/layout/index.js";
import { SINTETICOS } from "../tests/fixtures/topologies.js";

const RAIZ   = join(dirname(fileURLToPath(import.meta.url)), "..");
const EX_DIR = join(RAIZ, "src", "examples");

// ─── Recogida ────────────────────────────────────────────────────────────

// `--orientation vertical` mide la composición de móvil. La línea base es
// siempre la de escritorio, que es el defecto del motor.
const iOri = process.argv.indexOf("--orientation");
const ORIENTACION = iOri !== -1 ? process.argv[iOri + 1] : undefined;

function medir(graph) {
  const t0  = performance.now();
  const pos = computeLayout(graph, { orientation: ORIENTACION });
  const ms  = performance.now() - t0;
  return { ...layoutMetrics(pos, graph.links), ms: Number(ms.toFixed(2)) };
}

function recoger() {
  const out = {};
  for (const f of readdirSync(EX_DIR).filter(x => x.endsWith(".json")).sort()) {
    const graph = JSON.parse(readFileSync(join(EX_DIR, f), "utf8"));
    out[f.replace(/\.json$/, "")] = medir(graph);
  }
  for (const [nombre, graph] of Object.entries(SINTETICOS)) {
    out[nombre] = medir(graph);
  }
  return out;
}

// ─── Salida ──────────────────────────────────────────────────────────────

const COLS = [
  ["topología",  22, k => k],
  ["nodos",       6, m => m.nodes],
  ["cruces",      7, m => m.crossings],
  ["e/nodo",      7, m => m.edgeThroughNode],
  ["solap",       6, m => m.boxOverlaps],
  ["ancho",       7, m => m.width],
  ["alto",        7, m => m.height],
  ["aspecto",     8, m => m.aspect.toFixed(2)],
  ["área/1k",     9, m => Math.round(m.area / 1000)],
  ["enl.tot",     8, m => m.edgeLenTotal],
  ["enl.máx",     8, m => m.edgeLenMax],
  ["mín.par",     8, m => m.minPairDist],
  ["ms",          6, m => m.ms.toFixed(1)],
];

function tabla(datos) {
  const linea = COLS.map(([t, w]) => t.padEnd(w)).join("");
  console.log(linea);
  console.log("─".repeat(linea.length));
  for (const [k, m] of Object.entries(datos)) {
    console.log(COLS.map(([, w, fn], i) =>
      String(i === 0 ? fn(k) : fn(m)).padEnd(w)
    ).join(""));
  }
}

function diff(ahora, ref) {
  console.log("topología             métrica            antes    ahora    Δ");
  console.log("─".repeat(66));
  const claves = ["crossings", "edgeThroughNode", "boxOverlaps", "area", "aspect", "edgeLenTotal", "edgeLenMax"];
  let cambios = 0;
  for (const [k, m] of Object.entries(ahora)) {
    const r = ref[k];
    if (!r) { console.log(`${k.padEnd(22)}(nuevo)`); continue; }
    for (const c of claves) {
      if (m[c] === r[c]) continue;
      cambios++;
      const d = m[c] - r[c];
      // Para cruces y enlaces sobre nodos, bajar siempre es mejor.
      const mejor = ["crossings", "edgeThroughNode", "boxOverlaps"].includes(c) ? d < 0 : null;
      const marca = mejor === true ? " ✓" : mejor === false ? " ✗" : "";
      console.log(
        k.padEnd(22) + c.padEnd(19) +
        String(r[c]).padEnd(9) + String(m[c]).padEnd(9) +
        (d > 0 ? "+" : "") + d + marca
      );
    }
  }
  if (cambios === 0) console.log("(sin cambios)");
}

const args = process.argv.slice(2);
const datos = recoger();

const iJson = args.indexOf("--json");
const iDiff = args.indexOf("--diff");

if (iDiff !== -1) {
  diff(datos, JSON.parse(readFileSync(args[iDiff + 1], "utf8")));
} else {
  tabla(datos);
}

if (iJson !== -1) {
  writeFileSync(args[iJson + 1], JSON.stringify(datos, null, 2));
  console.log(`\nguardado en ${args[iJson + 1]}`);
}

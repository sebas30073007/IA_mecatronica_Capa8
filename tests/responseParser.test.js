// tests/responseParser.test.js
// Tests para src/ai/responseParser.js

// responseParser usa el browser global `marked` — shim it for Node.js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Load marked from the assets folder (UMD)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const markedSrc = readFileSync(join(__dirname, "../assets/marked.umd.js"), "utf8");
// Evaluate in global scope so marked is available as a global
const fn = new Function("globalThis", markedSrc + "; globalThis.marked = marked;");
fn(globalThis);

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "../src/ai/responseParser.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeAction(type, extra = {}) {
  return JSON.stringify({ type, ...extra });
}

// ── parseResponse: texto sin acciones ────────────────────────────────────────
test("parseResponse: texto plano → sin acciones", () => {
  const r = parseResponse("Hola, aquí tienes la explicación.");
  assert.equal(r.actions.length, 0);
  assert.ok(r.text.includes("Hola"));
});

// ── parseResponse: extrae acción add_node ────────────────────────────────────
// NOTA: actions es [{raw, parsed, valid}] — el objeto parseado está en .parsed
test("parseResponse: extrae una acción add_node", () => {
  const action = makeAction("add_node", { nodeType: "router", label: "R1", x: 100, y: 100 });
  const raw = `Añadiendo router.\n[CAPA8_ACTION]${action}[/CAPA8_ACTION]`;
  const r = parseResponse(raw);
  assert.equal(r.actions.length, 1);
  assert.ok(r.actions[0].valid);
  assert.equal(r.actions[0].parsed.type, "add_node");
  assert.equal(r.actions[0].parsed.label, "R1");
});

// ── parseResponse: extrae múltiples acciones ─────────────────────────────────
test("parseResponse: extrae múltiples acciones", () => {
  const a1 = makeAction("add_node", { nodeType: "router", label: "R1", x: 100, y: 100 });
  const a2 = makeAction("add_node", { nodeType: "switch", label: "SW1", x: 200, y: 200 });
  const raw = `Dos nodos.\n[CAPA8_ACTION]${a1}[/CAPA8_ACTION]\n[CAPA8_ACTION]${a2}[/CAPA8_ACTION]`;
  const r = parseResponse(raw);
  assert.equal(r.actions.length, 2);
  assert.ok(r.actions[1].valid);
  assert.equal(r.actions[1].parsed.label, "SW1");
});

// ── parseResponse: JSON inválido no rompe el parser ──────────────────────────
// NOTA: los bloques inválidos se incluyen con valid:false, parsed:null
test("parseResponse: JSON inválido dentro de bloque tiene valid:false", () => {
  const raw = "Texto\n[CAPA8_ACTION]{broken json[/CAPA8_ACTION]";
  const r = parseResponse(raw);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].valid, false);
  assert.equal(r.actions[0].parsed, null);
  assert.ok(r.text.includes("Texto"));
});

// ── parseResponse: texto libre preservado sin los bloques ────────────────────
test("parseResponse: texto sin bloques está limpio de tags", () => {
  const action = makeAction("add_node", { nodeType: "router", label: "R1", x: 0, y: 0 });
  const raw = `Primero texto.\n[CAPA8_ACTION]${action}[/CAPA8_ACTION]\nÚltimo texto.`;
  const r = parseResponse(raw);
  assert.ok(!r.text.includes("[CAPA8_ACTION]"), "text no debe contener el tag");
  assert.ok(r.text.includes("Primero texto") || r.text.includes("ltimo texto"));
});

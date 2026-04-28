// tests/actionValidator.test.js
// Tests para src/ai/actionValidator.js
// NOTA: el validador usa action.action (no action.type) como campo discriminador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAction } from "../src/ai/actionValidator.js";

const graph = {
  nodes: [
    { id: "n1", type: "router", label: "R1",  ip: "10.0.0.1"  },
    { id: "n2", type: "switch", label: "SW1", ip: "10.0.1.1"  },
    { id: "n3", type: "pc",     label: "PC1", ip: "10.0.1.10" },
  ],
  links: [
    { id: "l1", source: "n1", target: "n2", status: "up" },
    { id: "l2", source: "n2", target: "n3", status: "up" },
  ],
};

// ── add_node ─────────────────────────────────────────────────────────────────
test("validateAction: add_node válido", () => {
  const r = validateAction({ action: "add_node", type: "router", label: "R2", x: 100, y: 100 }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: add_node con tipo alias (laptop → pc) es válido", () => {
  const r = validateAction({ action: "add_node", type: "laptop", label: "PC2", x: 100, y: 200 }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: add_node con tipo desconocido es inválido", () => {
  const r = validateAction({ action: "add_node", type: "toaster", label: "T1", x: 0, y: 0 }, graph);
  assert.ok(!r.valid);
  assert.ok(r.error);
});

test("validateAction: add_node sin label es inválido", () => {
  const r = validateAction({ action: "add_node", type: "router", x: 0, y: 0 }, graph);
  assert.ok(!r.valid);
});

test("validateAction: add_node con label duplicada genera warning", () => {
  const r = validateAction({ action: "add_node", type: "router", label: "R1", x: 0, y: 0 }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
  assert.ok(r.warnings?.some(w => /R1/.test(w)), "debe haber warning sobre label duplicado");
});

// ── delete_node ──────────────────────────────────────────────────────────────
test("validateAction: delete_node por label existente es válido", () => {
  const r = validateAction({ action: "delete_node", label: "R1" }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: delete_node de nodo inexistente es inválido", () => {
  const r = validateAction({ action: "delete_node", label: "NoExiste" }, graph);
  assert.ok(!r.valid);
});

// ── add_link ─────────────────────────────────────────────────────────────────
test("validateAction: add_link entre nodos existentes es válido", () => {
  const r = validateAction({ action: "add_link", sourceLabel: "R1", targetLabel: "PC1" }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: add_link con nodo fuente inexistente es inválido", () => {
  const r = validateAction({ action: "add_link", sourceLabel: "NoExiste", targetLabel: "PC1" }, graph);
  assert.ok(!r.valid);
});

// ── delete_link ──────────────────────────────────────────────────────────────
test("validateAction: delete_link de enlace existente es válido", () => {
  const r = validateAction({ action: "delete_link", sourceLabel: "R1", targetLabel: "SW1" }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: delete_link de enlace inexistente es inválido", () => {
  const r = validateAction({ action: "delete_link", sourceLabel: "R1", targetLabel: "PC1" }, graph);
  assert.ok(!r.valid);
});

// ── set_link_status ──────────────────────────────────────────────────────────
test("validateAction: set_link_status válido", () => {
  const r = validateAction({ action: "set_link_status", sourceLabel: "R1", targetLabel: "SW1", status: "down" }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: set_link_status con estado inválido", () => {
  const r = validateAction({ action: "set_link_status", sourceLabel: "R1", targetLabel: "SW1", status: "broken" }, graph);
  assert.ok(!r.valid);
});

// ── tipo de acción desconocido ────────────────────────────────────────────────
test("validateAction: tipo de acción desconocido es inválido", () => {
  const r = validateAction({ action: "teleport_node" }, graph);
  assert.ok(!r.valid);
});

// ── apply_graph ──────────────────────────────────────────────────────────────
test("validateAction: apply_graph con grafo válido", () => {
  const r = validateAction({
    action: "apply_graph",
    graph: { nodes: [{ id: "x", type: "pc", label: "X" }], links: [] },
  }, graph);
  assert.ok(r.valid, `Esperaba válido, error: ${r.error}`);
});

test("validateAction: apply_graph sin campo graph es inválido", () => {
  const r = validateAction({ action: "apply_graph" }, graph);
  assert.ok(!r.valid);
});

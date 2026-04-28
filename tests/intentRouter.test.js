// tests/intentRouter.test.js
// Tests para src/ai/intentRouter.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../src/ai/intentRouter.js";

const emptyGraph = { nodes: [], links: [] };
const graphWithNodes = {
  nodes: [
    { id: "n1", type: "router", label: "R1", ip: "10.0.0.1" },
    { id: "n2", type: "pc",     label: "PC1", ip: "10.0.0.10" },
  ],
  links: [{ id: "l1", source: "n1", target: "n2", status: "up" }],
};

// ── solver intent ─────────────────────────────────────────────────────────────
test("classifyIntent: pregunta de diagnóstico → solver", () => {
  const r = classifyIntent("El ping no funciona entre PC1 y R1, ¿qué puede ser?", graphWithNodes, "diagrams");
  assert.equal(r.type, "solver");
});

test("classifyIntent: 'no conecta/no funciona' → solver o modify", () => {
  const r = classifyIntent("La PC no funciona, no hay ruta al host", emptyGraph, "chat");
  // Contiene "no hay ruta" que es SOLVER_KEYWORDS
  assert.equal(r.type, "solver");
});

// ── conceptual intent ─────────────────────────────────────────────────────────
test("classifyIntent: '¿qué es OSPF?' → conceptual", () => {
  const r = classifyIntent("¿Qué es OSPF y cómo funciona?", emptyGraph, "chat");
  assert.equal(r.type, "conceptual");
});

// ── query_graph intent ────────────────────────────────────────────────────────
test("classifyIntent: '¿cuántos nodos hay?' en diagrams → query_graph", () => {
  const r = classifyIntent("¿Cuántos nodos hay en el diagrama?", graphWithNodes, "diagrams");
  assert.equal(r.type, "query_graph");
});

// ── modify_clear / modify_ambiguous ──────────────────────────────────────────
test("classifyIntent: 'agrega un router' → modify_clear o modify_ambiguous", () => {
  const r = classifyIntent("Agrega un router al diagrama", emptyGraph, "diagrams");
  assert.ok(["modify_clear", "modify_ambiguous"].includes(r.type),
    `Expected modify_*, got ${r.type}`);
});

// ── confidence es "high" o "low" ──────────────────────────────────────────────
test("classifyIntent: confidence es 'high' o 'low'", () => {
  const r = classifyIntent("¿Cómo configuro VLANs?", emptyGraph, "chat");
  assert.ok(r.confidence === "high" || r.confidence === "low",
    `confidence debe ser high o low, recibido: ${r.confidence}`);
});

// ── extractedRefs es objeto ──────────────────────────────────────────────────
test("classifyIntent: extractedRefs es objeto", () => {
  const r = classifyIntent("Conecta PC1 con R1", graphWithNodes, "diagrams");
  assert.ok(typeof r.extractedRefs === "object" && r.extractedRefs !== null);
});

// tests/graph.test.js
// Tests para src/model/graph.js usando Node.js test runner nativo.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findNode, findLink, findNodeByIp, linksForNode, hasLinkBetween,
  buildAdjacency, bfsPath, computeRttMs, checkAclPath,
} from "../src/model/graph.js";

// ── Datos de prueba ──────────────────────────────────────────────────────────
const graph = {
  nodes: [
    { id: "n1", type: "pc",       label: "PC-1",   ip: "10.0.0.10" },
    { id: "n2", type: "switch",   label: "SW-1",   ip: "10.0.0.1"  },
    { id: "n3", type: "router",   label: "R-1",    ip: "10.0.0.254" },
    { id: "n4", type: "firewall", label: "FW-1",   ip: "10.0.1.1", rules: [] },
    { id: "n5", type: "pc",       label: "PC-2",   ip: "10.0.1.10" },
  ],
  links: [
    { id: "l1", source: "n1", target: "n2", latencyMs: 10,  bandwidthMbps: 100,  lossPct: 0, status: "up",   jitter: 0 },
    { id: "l2", source: "n2", target: "n3", latencyMs: 5,   bandwidthMbps: 1000, lossPct: 0, status: "up",   jitter: 0 },
    { id: "l3", source: "n3", target: "n4", latencyMs: 2,   bandwidthMbps: 1000, lossPct: 0, status: "up",   jitter: 0 },
    { id: "l4", source: "n4", target: "n5", latencyMs: 8,   bandwidthMbps: 100,  lossPct: 0, status: "up",   jitter: 0 },
    { id: "l5", source: "n2", target: "n5", latencyMs: 50,  bandwidthMbps: 10,   lossPct: 0, status: "down", jitter: 0 },
  ],
};

// ── findNode ─────────────────────────────────────────────────────────────────
test("findNode devuelve el nodo correcto", () => {
  const n = findNode(graph, "n3");
  assert.equal(n.label, "R-1");
});

test("findNode devuelve null si no existe", () => {
  assert.equal(findNode(graph, "n99"), null);
});

// ── findNodeByIp ─────────────────────────────────────────────────────────────
test("findNodeByIp encuentra nodo por IP exacta", () => {
  const n = findNodeByIp(graph, "10.0.0.10");
  assert.equal(n.id, "n1");
});

test("findNodeByIp devuelve null para IP inexistente", () => {
  assert.equal(findNodeByIp(graph, "99.99.99.99"), null);
});

// ── linksForNode ─────────────────────────────────────────────────────────────
test("linksForNode devuelve todos los enlaces de un nodo", () => {
  const links = linksForNode(graph, "n2");
  assert.equal(links.length, 3);
  assert.ok(links.every(l => l.source === "n2" || l.target === "n2"));
});

// ── hasLinkBetween ───────────────────────────────────────────────────────────
test("hasLinkBetween devuelve true si existe enlace directo", () => {
  assert.equal(hasLinkBetween(graph, "n1", "n2"), true);
  assert.equal(hasLinkBetween(graph, "n2", "n1"), true);
});

test("hasLinkBetween devuelve false si no hay enlace directo", () => {
  assert.equal(hasLinkBetween(graph, "n1", "n3"), false);
});

// ── buildAdjacency ───────────────────────────────────────────────────────────
test("buildAdjacency excluye enlaces caídos", () => {
  const adj = buildAdjacency(graph);
  // l5 está down → n2 no debe tener n5 como vecino
  const n2Neighbors = adj.get("n2").map(e => e.neighbor);
  assert.ok(!n2Neighbors.includes("n5"), "n5 no debe ser vecino de n2 (enlace down)");
});

// ── bfsPath ──────────────────────────────────────────────────────────────────
test("bfsPath encuentra camino entre PC-1 y PC-2", () => {
  const path = bfsPath(graph, "n1", "n5");
  assert.ok(path.length > 0, "debe haber un camino");
  // Camino esperado: n1→n2→n3→n4→n5 (l1,l2,l3,l4)
  assert.equal(path.length, 4);
});

test("bfsPath devuelve [] si no hay ruta", () => {
  const isolated = {
    nodes: [
      { id: "a", type: "pc", label: "A", ip: "1.1.1.1" },
      { id: "b", type: "pc", label: "B", ip: "1.1.1.2" },
    ],
    links: [],
  };
  assert.deepEqual(bfsPath(isolated, "a", "b"), []);
});

test("bfsPath devuelve [] al buscar mismo nodo", () => {
  assert.deepEqual(bfsPath(graph, "n1", "n1"), []);
});

// ── computeRttMs ─────────────────────────────────────────────────────────────
test("computeRttMs calcula RTT correcto sin jitter", () => {
  // path n1→n5: l1(10ms) + l2(5ms) + l3(2ms) + l4(8ms) = 25ms × 2 = 50ms
  const path = ["l1", "l2", "l3", "l4"];
  assert.equal(computeRttMs(graph, path, { applyJitter: false }), 50);
});

test("computeRttMs devuelve null si hay enlace caído en el path", () => {
  const path = ["l1", "l5"]; // l5 está down
  assert.equal(computeRttMs(graph, path, { applyJitter: false }), null);
});

test("computeRttMs con jitter devuelve número positivo", () => {
  const gJitter = {
    nodes: [{ id: "a", type: "pc" }, { id: "b", type: "pc" }],
    links: [{ id: "lj", source: "a", target: "b", latencyMs: 20, status: "up", jitter: 5 }],
  };
  const rtt = computeRttMs(gJitter, ["lj"], { applyJitter: true });
  assert.ok(typeof rtt === "number" && rtt >= 0);
});

// ── checkAclPath ─────────────────────────────────────────────────────────────
test("checkAclPath devuelve null si no hay reglas", () => {
  const path = bfsPath(graph, "n1", "n5");
  // FW sin reglas → todo permitido
  assert.equal(checkAclPath(graph, path, "10.0.1.10"), null);
});

test("checkAclPath bloquea si hay regla deny para la IP destino", () => {
  const gFw = {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === "n4"
        ? { ...n, rules: [{ action: "deny", ip: "10.0.1.10" }] }
        : n
    ),
  };
  const path = bfsPath(gFw, "n1", "n5");
  const blocker = checkAclPath(gFw, path, "10.0.1.10");
  assert.ok(blocker !== null, "debe bloquear");
  assert.equal(blocker.id, "n4");
});

test("checkAclPath no bloquea si deny es para otra IP", () => {
  const gFw = {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === "n4"
        ? { ...n, rules: [{ action: "deny", ip: "10.0.1.99" }] }
        : n
    ),
  };
  const path = bfsPath(gFw, "n1", "n5");
  assert.equal(checkAclPath(gFw, path, "10.0.1.10"), null);
});

test("checkAclPath bloquea con wildcard *", () => {
  const gFw = {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === "n4"
        ? { ...n, rules: [{ action: "deny", ip: "*" }] }
        : n
    ),
  };
  const path = bfsPath(gFw, "n1", "n5");
  const blocker = checkAclPath(gFw, path, "10.0.1.10");
  assert.ok(blocker !== null);
});

test("checkAclPath respeta permit explícito antes de deny *", () => {
  const gFw = {
    ...graph,
    nodes: graph.nodes.map(n =>
      n.id === "n4"
        ? { ...n, rules: [
            { action: "permit", ip: "10.0.1.10" },
            { action: "deny",   ip: "*" },
          ]}
        : n
    ),
  };
  const path = bfsPath(gFw, "n1", "n5");
  // Debe permitir porque la primera regla hace match y es permit
  assert.equal(checkAclPath(gFw, path, "10.0.1.10"), null);
});

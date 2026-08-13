// tests/prettyLayout.test.js
//
// Red de seguridad del motor de layout.
//
// Hasta ahora Pretty no tenía ni un test, y es el módulo más grande y más
// heurístico del proyecto. La auditoría verificó su comportamiento con
// scripts desechables que no quedaron en el repo; esto los convierte en
// regresiones vigiladas.
//
// Tres bloques con propósitos distintos:
//
//   1. INVARIANTES     — propiedades que deben cumplirse siempre, ahora y
//                        después de cualquier cambio del motor. Son la red
//                        de seguridad de verdad.
//   2. LÍNEA BASE      — las métricas de tests/fixtures/layout-baseline.json
//                        no deben empeorar. NO fija posiciones exactas: la
//                        reestructuración las va a mover todas, y ese es el
//                        objetivo.
//   3. COMPORTAMIENTO  — lo que el motor DEBERÍA hacer y todavía no hace.
//                        Van marcados `todo`, así que se reportan sin
//                        romper la corrida. Cuando la etapa 1 aterrice se
//                        les quita la marca y pasan a ser obligatorios.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { computeLayout, layoutMetrics } from "../src/app/layout/index.js";
import {
  MIN_GAP_X, MIN_GAP_Y, resolveCollisions, boxesOverlap,
} from "../src/app/layout/geometry.js";
import {
  SINTETICOS, anillo, estrellaSinBackbone, parHA, dobleFirewallSerie,
} from "./fixtures/topologies.js";

const RAIZ   = join(dirname(fileURLToPath(import.meta.url)), "..");
const EX_DIR = join(RAIZ, "src", "examples");

const EJEMPLOS = readdirSync(EX_DIR).filter(f => f.endsWith(".json")).sort();

function cargarEjemplo(archivo) {
  return JSON.parse(readFileSync(join(EX_DIR, archivo), "utf8"));
}

/** Aplica el layout y devuelve el grafo con las posiciones ya puestas. */
function colocar(graph) {
  const pos = computeLayout(graph);
  return {
    ...graph,
    nodes: graph.nodes.map(n => ({ ...n, ...(pos.get(n.id) || { x: n.x, y: n.y }) })),
  };
}

const y = (g, id) => g.nodes.find(n => n.id === id).y;
const x = (g, id) => g.nodes.find(n => n.id === id).x;

// ═══════════════════════════════════════════════════════════════════════
// 1. INVARIANTES
// ═══════════════════════════════════════════════════════════════════════

test("determinista: dos corridas dan el mismo resultado", () => {
  for (const f of EJEMPLOS) {
    const g = cargarEjemplo(f);
    const a = computeLayout(g);
    const b = computeLayout(g);
    for (const [id, p] of a) {
      assert.deepEqual(b.get(id), p, `${f}: ${id} cambió entre corridas`);
    }
  }
});

test("idempotente: aplicar el layout 5 veces no mueve nada tras la 1ª", () => {
  for (const f of EJEMPLOS) {
    let g = colocar(cargarEjemplo(f));
    const primera = new Map(g.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    for (let i = 0; i < 4; i++) g = colocar(g);
    for (const n of g.nodes) {
      assert.deepEqual({ x: n.x, y: n.y }, primera.get(n.id),
        `${f}: ${n.id} se movió al reaplicar`);
    }
  }
});

test("independiente del orden de nodes[] y links[]", () => {
  for (const f of EJEMPLOS) {
    const g = cargarEjemplo(f);
    const invertido = {
      ...g,
      nodes: [...g.nodes].reverse(),
      links: [...g.links].reverse(),
    };
    const a = computeLayout(g);
    const b = computeLayout(invertido);
    for (const [id, p] of a) {
      assert.deepEqual(b.get(id), p, `${f}: ${id} depende del orden del JSON`);
    }
  }
});

test("ninguna caja de nodo se solapa con otra", () => {
  // La separación se mide sobre la caja real de 90×112, no sobre un radio:
  // a dos nodos les basta estar separados en UN eje.
  //
  // Sin tolerancia, a propósito. El test anterior admitía 10px porque el
  // ajuste a la rejilla podía acercar un par ya separado; ahora el pase de
  // colisiones corre DESPUÉS de la rejilla y en múltiplos de ella, así que
  // la separación es exacta. Si esto vuelve a necesitar holgura, es que el
  // pase final dejó de ser la última palabra.
  const TOLERANCIA = 0;
  for (const f of EJEMPLOS) {
    const g = colocar(cargarEjemplo(f));
    for (let i = 0; i < g.nodes.length; i++) {
      for (let j = i + 1; j < g.nodes.length; j++) {
        const a = g.nodes[i], b = g.nodes[j];
        const ox = MIN_GAP_X - Math.abs(b.x - a.x);
        const oy = MIN_GAP_Y - Math.abs(b.y - a.y);
        assert.ok(ox <= TOLERANCIA || oy <= TOLERANCIA,
          `${f}: las cajas de ${a.id} y ${b.id} se solapan ` +
          `(${ox.toFixed(0)}px en x, ${oy.toFixed(0)}px en y)`);
      }
    }
  }
});

test("todo queda dentro del lienzo, con el margen de 150px", () => {
  for (const f of EJEMPLOS) {
    const g = colocar(cargarEjemplo(f));
    for (const n of g.nodes) {
      assert.ok(n.x >= 150, `${f}: ${n.id} en x=${n.x}`);
      assert.ok(n.y >= 150, `${f}: ${n.id} en y=${n.y}`);
    }
  }
});

test("un grafo vacío no produce posiciones", () => {
  assert.equal(computeLayout({ nodes: [], links: [] }).size, 0);
});

test("un solo nodo queda colocado y dentro del margen", () => {
  const g = { nodes: [{ id: "n1", type: "router", label: "R1", x: 0, y: 0 }], links: [] };
  const pos = computeLayout(g);
  assert.equal(pos.size, 1);
  assert.ok(pos.get("n1").x >= 150 && pos.get("n1").y >= 150);
});

test("todos los nodos reciben posición, también los aislados", () => {
  const g = {
    nodes: [
      { id: "a", type: "router", label: "R1", x: 0, y: 0 },
      { id: "b", type: "pc",     label: "PC1", x: 0, y: 0 },
      { id: "solo", type: "pc",  label: "PC9", x: 0, y: 0 },
    ],
    links: [{ id: "l1", source: "a", target: "b", status: "up" }],
  };
  const pos = computeLayout(g);
  assert.equal(pos.size, 3, "el nodo aislado también debe colocarse");
});

// ═══════════════════════════════════════════════════════════════════════
// 2. LÍNEA BASE DE MÉTRICAS
// ═══════════════════════════════════════════════════════════════════════

const BASE = JSON.parse(
  readFileSync(join(RAIZ, "tests", "fixtures", "layout-baseline.json"), "utf8")
);

test("los cruces y los enlaces sobre nodos no empeoran", () => {
  // Las dos únicas métricas con dirección absoluta: bajar siempre es mejor.
  // El resto (área, aspecto, longitudes) se lee en contexto y lo vigila
  // `bench/layout_bench.mjs --diff`, no un assert.
  const casos = {
    ...Object.fromEntries(EJEMPLOS.map(f => [f.replace(/\.json$/, ""), cargarEjemplo(f)])),
    ...SINTETICOS,
  };
  for (const [nombre, graph] of Object.entries(casos)) {
    const ref = BASE[nombre];
    if (!ref) continue; // caso nuevo, todavía sin línea base
    const m = layoutMetrics(computeLayout(graph), graph.links);
    assert.ok(m.crossings <= ref.crossings,
      `${nombre}: cruces subieron de ${ref.crossings} a ${m.crossings}`);
    assert.ok(m.edgeThroughNode <= ref.edgeThroughNode,
      `${nombre}: enlaces sobre nodos subieron de ${ref.edgeThroughNode} a ${m.edgeThroughNode}`);
  }
});

test("la línea base cubre todas las topologías del repo", () => {
  for (const f of EJEMPLOS) {
    assert.ok(BASE[f.replace(/\.json$/, "")],
      `falta ${f} en layout-baseline.json — regenerar con bench/layout_bench.mjs --json`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 3. COMPORTAMIENTO PENDIENTE
//
// Estos cuatro describen lo que el motor debería hacer. Fallan hoy: el
// nivel vertical sale de una tabla por tipo de dispositivo en vez de del
// lugar que ocupa el nodo en el recorrido de la red.
//
// Al aterrizar el layering topológico se les quita `{ todo: true }`.
// ═══════════════════════════════════════════════════════════════════════

test("dos firewalls en serie se leen en orden, no como pareja", () => {
  // Internet → FW-Externo → SW-DMZ → FW-Interno → SW-LAN
  // Hoy los dos firewalls comparten ROLE_TIER["security-edge"] = 1 y salen
  // a la misma altura, como si fueran un clúster de alta disponibilidad.
  // Es pedagógicamente lo contrario de lo que la topología dice.
  const g = colocar(dobleFirewallSerie());
  assert.ok(y(g, "fw1") < y(g, "sw1"), "FW-Externo debe ir sobre SW-DMZ");
  assert.ok(y(g, "sw1") < y(g, "fw2"), "SW-DMZ debe ir sobre FW-Interno");
  assert.ok(y(g, "fw2") < y(g, "sw2"), "FW-Interno debe ir sobre SW-LAN");
});

test("un anillo no colapsa a una fila plana", () => {
  // Hoy los 8 switches caen al mismo rol y quedan en y idéntica: la métrica
  // delatora es height === 0, y el enlace de cierre cruza todo el diagrama.
  const g = anillo(8);
  const m = layoutMetrics(computeLayout(g), g.links);
  assert.ok(m.height > 0, `altura ${m.height}: el anillo quedó en una fila`);
  assert.ok(m.edgeLenMax < m.edgeLenTotal / 2,
    `un solo enlace mide ${m.edgeLenMax} de ${m.edgeLenTotal} totales`);
});

test("una estrella sin infraestructura pone el centro en el centro", () => {
  // Ningún nodo alcanza rol de backbone, así que hoy cae en el reserva
  // ingenuo: fila recta con el hub en un extremo.
  const g = colocar(estrellaSinBackbone(5));
  const hojas = g.nodes.filter(n => n.id !== "hub");
  const minX = Math.min(...hojas.map(n => n.x));
  const maxX = Math.max(...hojas.map(n => n.x));
  const hubX = x(g, "hub");
  assert.ok(hubX > minX && hubX < maxX,
    `el hub en x=${hubX} queda fuera del rango de sus hojas [${minX}, ${maxX}]`);
});

test("un par redundante real se detecta por topología, no por nombre", () => {
  // FW-Principal y FW-Respaldo comparten vecino arriba y abajo: es un par
  // de alta disponibilidad de manual. `nameStem()` no encuentra raíz común
  // entre "principal" y "respaldo", así que hoy no los empareja.
  const g = colocar(parHA());
  assert.equal(y(g, "fwa"), y(g, "fwb"),
    "los dos firewalls redundantes deben compartir altura");
  assert.notEqual(x(g, "fwa"), x(g, "fwb"),
    "y estar uno al lado del otro");
});

// ─── El resolvedor de colisiones, ya compartido con el arrastre manual ────

test("un par en diagonal que el modelo circular daba por bueno se separa", () => {
  // Este es el caso que el radio único no veía. Centros a dx=80, dy=80:
  // 113px de distancia, más que los 110 que el modelo circular exigía, así
  // que los daba por separados. Pero las cajas son de 90×112 y se solapan
  // en los dos ejes — el solape se veía en pantalla y nadie lo medía.
  const pos = new Map([
    ["a", { x: 0,  y: 0  }],
    ["b", { x: 80, y: 80 }],
  ]);
  resolveCollisions(pos);
  const a = pos.get("a"), b = pos.get("b");
  const ox = MIN_GAP_X - Math.abs(b.x - a.x);
  const oy = MIN_GAP_Y - Math.abs(b.y - a.y);
  assert.ok(ox <= 0 || oy <= 0,
    `siguen solapadas: ${ox}px en x, ${oy}px en y`);
});

test("dos nodos en fila a 100px NO se separan: sus cajas ya no se tocan", () => {
  // El reverso del caso anterior. El modelo circular los empujaba porque
  // 100 < 110, inflando el dibujo sin motivo: a 100px de distancia
  // horizontal dos cajas de 90 de ancho tienen 10px de aire.
  const pos = new Map([
    ["a", { x: 0,   y: 0 }],
    ["b", { x: 100, y: 0 }],
  ]);
  resolveCollisions(pos);
  assert.deepEqual(pos.get("a"), { x: 0, y: 0 });
  assert.deepEqual(pos.get("b"), { x: 100, y: 0 });
});

test("el ancla no se mueve: cede el otro", () => {
  // Es el contrato del arrastre manual — el nodo que el usuario acaba de
  // soltar se queda donde lo puso — y el del backbone en Pretty.
  const pos = new Map([
    ["ancla", { x: 500, y: 500 }],
    ["otro",  { x: 520, y: 510 }],
  ]);
  resolveCollisions(pos, new Set(["ancla"]));
  assert.deepEqual(pos.get("ancla"), { x: 500, y: 500 }, "el ancla se movió");
  assert.ok(!boxesOverlap(pos.get("ancla"), pos.get("otro")));
});

test("dos nodos superpuestos exactamente se separan de forma determinista", () => {
  const hacer = () => {
    const pos = new Map([["a", { x: 300, y: 300 }], ["b", { x: 300, y: 300 }]]);
    resolveCollisions(pos);
    return pos;
  };
  const p1 = hacer(), p2 = hacer();
  assert.deepEqual([...p1], [...p2], "el desempate depende del orden de visita");
  assert.ok(!boxesOverlap(p1.get("a"), p1.get("b")));
});

// ─── Orientación: escritorio a lo ancho, móvil a lo alto ─────────────────

test("cada orientación es determinista por separado", () => {
  // El determinismo no se pierde al hacer configurable la composición: lo
  // que cambia es CUÁL de las dos constantes se pide, no que dependa del
  // tamaño real de la ventana.
  for (const f of EJEMPLOS) {
    const g = cargarEjemplo(f);
    for (const o of ["horizontal", "vertical"]) {
      const a = computeLayout(g, { orientation: o });
      const b = computeLayout(g, { orientation: o });
      for (const [id, p] of a) {
        assert.deepEqual(b.get(id), p, `${f} (${o}): ${id} cambió entre corridas`);
      }
    }
  }
});

test("horizontal nunca es más alto que vertical, y vertical nunca más ancho", () => {
  for (const f of EJEMPLOS) {
    const g = cargarEjemplo(f);
    const caja = o => {
      const p = computeLayout(g, { orientation: o });
      const xs = [...p.values()].map(v => v.x), ys = [...p.values()].map(v => v.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const h = caja("horizontal"), v = caja("vertical");
    assert.ok(h.h <= v.h, `${f}: horizontal (${h.h}) más alto que vertical (${v.h})`);
    assert.ok(v.w <= h.w, `${f}: vertical (${v.w}) más ancho que horizontal (${h.w})`);
  }
});

test("en un diagrama profundo, horizontal gana ancho de verdad", () => {
  // El DMZ tiene seis niveles: es el caso donde plegar debe notarse. Si esto
  // deja de cumplirse, la orientación se volvió decorativa.
  const g = cargarEjemplo("dmz.json");
  const asp = o => {
    const p = computeLayout(g, { orientation: o });
    const xs = [...p.values()].map(v => v.x), ys = [...p.values()].map(v => v.y);
    return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
  };
  assert.ok(asp("horizontal") > asp("vertical") * 2,
    `horizontal ${asp("horizontal").toFixed(2)} vs vertical ${asp("vertical").toFixed(2)}`);
});

test("una orientación desconocida cae en el defecto, no rompe", () => {
  const g = cargarEjemplo("dmz.json");
  const raro = computeLayout(g, { orientation: "diagonal" });
  const porDefecto = computeLayout(g);
  for (const [id, p] of porDefecto) assert.deepEqual(raro.get(id), p);
});

test("las dos orientaciones respetan el invariante de las cajas", () => {
  for (const f of EJEMPLOS) {
    for (const o of ["horizontal", "vertical"]) {
      const pos = computeLayout(cargarEjemplo(f), { orientation: o });
      const ids = [...pos.keys()];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pos.get(ids[i]), b = pos.get(ids[j]);
          const ox = MIN_GAP_X - Math.abs(b.x - a.x);
          const oy = MIN_GAP_Y - Math.abs(b.y - a.y);
          assert.ok(ox <= 0 || oy <= 0, `${f} (${o}): ${ids[i]} y ${ids[j]} se solapan`);
        }
      }
    }
  }
});

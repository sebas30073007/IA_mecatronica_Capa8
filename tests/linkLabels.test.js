// tests/linkLabels.test.js
//
// Política de etiquetas de enlace (paso 8 del rediseño de Pretty).
//
// La regla anterior era de tipo —"switch con 4+ PC no lleva etiquetas"— y
// fallaba en los dos sentidos: tres PC ya apiñan tres etiquetas y no se
// activaba, y un enlace suelto perdía la suya solo por estar al lado de un
// abanico. Ahora decide la geometría, y eso sí se puede probar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  planLinkLabels, planParallelOffsets, buildLabelBoxes,
} from "../src/render/renderer.js";
import { computeLayout } from "../src/app/layout/index.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Caja de etiqueta con valores por defecto realistas. */
function caja(id, cx, cy, tier = 1) {
  return { id, cx, cy, w: 60, h: 16, tier };
}

// ─── Regla 2: racimos de tres o más ──────────────────────────────────────

test("tres etiquetas apiñadas se apagan todas", () => {
  // El caso del documento: tres PC colgando del mismo switch. Dejar una de
  // las tres encendida es peor que apagarlas — parece que ese enlace tiene
  // algo especial.
  const visibles = planLinkLabels([
    caja("l1", 500, 500),
    caja("l2", 540, 510),
    caja("l3", 580, 505),
  ]);
  assert.equal(visibles.size, 0, `quedaron visibles: ${[...visibles]}`);
});

test("dos etiquetas cercanas pero separadas conservan las dos", () => {
  // Dos no son un racimo. Mientras las cajas no se toquen, se ven las dos.
  const visibles = planLinkLabels([
    caja("l1", 500, 500),
    caja("l2", 500, 560),
  ]);
  assert.deepEqual([...visibles].sort(), ["l1", "l2"]);
});

test("una etiqueta sola siempre se ve", () => {
  const visibles = planLinkLabels([caja("solo", 300, 300)]);
  assert.deepEqual([...visibles], ["solo"]);
});

// ─── Regla 1: lo importante no se apaga ──────────────────────────────────

test("un enlace importante conserva su etiqueta dentro de un racimo", () => {
  // Un ping que falla resalta su enlace: es justo lo que el usuario está
  // mirando, y sería absurdo que el apiñamiento se lo tapara.
  const visibles = planLinkLabels([
    caja("l1", 500, 500),
    caja("l2", 540, 510),
    caja("l3", 580, 505, 0),   // seleccionado / caído / en el camino
  ]);
  assert.deepEqual([...visibles], ["l3"]);
});

test("varios importantes se ven aunque se solapen entre ellos", () => {
  // El camino completo de un ping puede tener enlaces contiguos. Ninguno
  // cede: el tier 0 no pasa por la comprobación de solape.
  const visibles = planLinkLabels([
    caja("l1", 500, 500, 0),
    caja("l2", 505, 502, 0),
  ]);
  assert.equal(visibles.size, 2);
});

// ─── Regla 3: solapes de a dos ───────────────────────────────────────────

test("de dos etiquetas superpuestas solo sobrevive una, y siempre la misma", () => {
  const hacer = orden => planLinkLabels(orden);
  const a = [caja("zzz", 400, 400), caja("aaa", 405, 402)];
  const v1 = hacer(a);
  const v2 = hacer([...a].reverse());
  assert.equal(v1.size, 1, "deberían apagar una");
  assert.deepEqual([...v1], [...v2],
    "el resultado no puede depender del orden de links[]");
  assert.deepEqual([...v1], ["aaa"], "el desempate es por id, no por posición");
});

// ─── Enlaces paralelos ───────────────────────────────────────────────────

test("dos enlaces entre el mismo par se separan simétricamente", () => {
  const offs = planParallelOffsets([
    { id: "a", source: "n1", target: "n2" },
    { id: "b", source: "n1", target: "n2" },
  ]);
  assert.equal(offs.size, 2);
  assert.equal(offs.get("a") + offs.get("b"), 0, "deben repartirse alrededor del eje");
  assert.notEqual(offs.get("a"), 0);
});

test("el sentido en que se declaró el enlace no cambia el emparejamiento", () => {
  // n1→n2 y n2→n1 son el mismo par de nodos: la línea se dibuja igual.
  const offs = planParallelOffsets([
    { id: "a", source: "n1", target: "n2" },
    { id: "b", source: "n2", target: "n1" },
  ]);
  assert.equal(offs.size, 2, "no los reconoció como paralelos");
});

test("un enlace sin gemelo no se desplaza", () => {
  const offs = planParallelOffsets([
    { id: "a", source: "n1", target: "n2" },
    { id: "b", source: "n2", target: "n3" },
  ]);
  assert.equal(offs.size, 0);
});

// ─── De punta a punta sobre una topología real ───────────────────────────

test("en el DMZ, las tres PC pierden la etiqueta y el troncal la conserva", () => {
  // La motivación literal del documento. Las tres PC cuelgan de SW-LAN y sus
  // etiquetas caen casi encima; los enlaces del recorrido principal están
  // separados y deben seguir informando.
  const g = JSON.parse(readFileSync(join(RAIZ, "src", "examples", "dmz.json"), "utf8"));
  const pos = computeLayout(g);
  const colocado = {
    ...g,
    nodes: g.nodes.map(n => ({ ...n, ...(pos.get(n.id) || { x: n.x, y: n.y }) })),
  };

  const cajas = buildLabelBoxes(colocado, { offsets: planParallelOffsets(g.links) });
  const visibles = planLinkLabels(cajas);

  const porId = new Map(g.nodes.map(n => [n.id, n]));
  const esPCdeLan = l =>
    porId.get(l.source)?.type === "pc" || porId.get(l.target)?.type === "pc";

  const pcs = g.links.filter(esPCdeLan);
  assert.ok(pcs.length >= 3, "el ejemplo debería tener 3 PC");
  for (const l of pcs) {
    assert.ok(!visibles.has(l.id),
      `${l.source}-${l.target}: una PC apiñada no debería mostrar etiqueta`);
  }

  // Y no puede apagarlas todas: el diagrama quedaría mudo.
  assert.ok(visibles.size > 0, "no quedó ninguna etiqueta visible");
});

test("ninguna pareja de etiquetas visibles se solapa, en ningún ejemplo", () => {
  const ejemplos = ["dmz", "campus", "data_center", "home_network",
                    "red_industrial", "vlan_routing", "wan_redundant"];
  for (const nombre of ejemplos) {
    const g = JSON.parse(readFileSync(join(RAIZ, "src", "examples", `${nombre}.json`), "utf8"));
    const pos = computeLayout(g);
    const colocado = {
      ...g,
      nodes: g.nodes.map(n => ({ ...n, ...(pos.get(n.id) || { x: n.x, y: n.y }) })),
    };
    const cajas = buildLabelBoxes(colocado, { offsets: planParallelOffsets(g.links) });
    const visibles = planLinkLabels(cajas);
    const puestas = cajas.filter(c => visibles.has(c.id));

    for (let i = 0; i < puestas.length; i++) {
      for (let j = i + 1; j < puestas.length; j++) {
        const p = puestas[i], q = puestas[j];
        const solapa = Math.abs(p.cx - q.cx) < (p.w + q.w) / 2 &&
                       Math.abs(p.cy - q.cy) < (p.h + q.h) / 2;
        assert.ok(!solapa, `${nombre}: las etiquetas de ${p.id} y ${q.id} se pisan`);
      }
    }
  }
});

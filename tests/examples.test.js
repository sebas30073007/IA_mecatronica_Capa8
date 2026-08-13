// tests/examples.test.js
//
// Guardia contra la deriva de las tiras de composición.
//
// Cada tarjeta del estado vacío pinta una fila de puntos de color a
// partir del mapa `comp` declarado en EJEMPLOS. Ese mapa está escrito a
// mano para que la primera pantalla no tenga que hacer once `fetch`
// antes de dibujarse, lo que abre la puerta a que se desincronice del
// JSON: alguien añade un servidor a `dmz.json` y la tarjeta sigue
// mostrando la composición vieja, sin que nada se rompa a la vista.
//
// Esto lo convierte en un fallo de test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { EJEMPLOS } from "../src/ui/emptyState.js";
import { TYPE_ORDER } from "../src/render/typePalette.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const rutaEjemplo = key => join(raiz, "src", "examples", `${key}.json`);

/** Censo tipo → cantidad de un grafo, igual que typeCensus pero en Node. */
function censo(nodes) {
  const c = {};
  for (const n of nodes) c[n.type] = (c[n.type] || 0) + 1;
  return c;
}

test("cada ejemplo del estado vacío tiene su JSON", () => {
  for (const e of EJEMPLOS) {
    assert.ok(existsSync(rutaEjemplo(e.key)), `falta src/examples/${e.key}.json`);
  }
});

test("cada ejemplo está registrado en loadExample", () => {
  const fuente = readFileSync(join(raiz, "src", "examples", "index.js"), "utf8");
  for (const e of EJEMPLOS) {
    assert.ok(
      fuente.includes(`"${e.key}"`),
      `${e.key} no aparece en el mapa de src/examples/index.js`
    );
  }
});

test("el mapa `comp` coincide con el censo real del JSON", () => {
  for (const e of EJEMPLOS) {
    const grafo = JSON.parse(readFileSync(rutaEjemplo(e.key), "utf8"));
    assert.deepEqual(
      censo(grafo.nodes),
      e.comp,
      `${e.key}: la composición declarada no coincide con el JSON`
    );
  }
});

test("todos los tipos usados existen en el espectro", () => {
  for (const e of EJEMPLOS) {
    for (const tipo of Object.keys(e.comp)) {
      assert.ok(
        TYPE_ORDER.includes(tipo),
        `${e.key}: el tipo "${tipo}" no tiene color en el espectro`
      );
    }
  }
});

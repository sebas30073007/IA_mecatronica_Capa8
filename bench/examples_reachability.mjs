// bench/examples_reachability.mjs
//
// Comprueba que las topologías de ejemplo siguen siendo utilizables tras
// activar la alcanzabilidad consciente de subred.
//
// El riesgo de esa fase es concreto: 7 de las 11 no declaran máscara y varias
// no tienen gateway en sus hosts. Antes daba igual —bastaba que hubiera
// cable— y ahora no. Esto intenta el ping entre todos los pares de hosts de
// cada ejemplo y reporta los que fallan y por qué.
//
//   node bench/examples_reachability.mjs
//
// Salida esperada: los fallos deben ser DIDÁCTICOS (p. ej. dos VLANs sin
// gateway, a propósito) y no accidentales.

import fs from "node:fs";
import path from "node:path";
import { normalizeGraph } from "../src/model/schema.js";
import { resolveReachability } from "../src/model/graph.js";
import { effectivePrefix } from "../src/model/addressing.js";

const DIR = "src/examples";
const HOST_TYPES = new Set(["pc", "plc", "ur3", "agv", "server"]);

const ejemplos = fs.readdirSync(DIR).filter(f => f.endsWith(".json"));
let totalPares = 0, totalFallos = 0;
const porRazon = {};

for (const file of ejemplos) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  const graph = normalizeGraph(raw);
  const hosts = graph.nodes.filter(n => HOST_TYPES.has(n.type) && n.ip);

  const sinMascara = graph.nodes.filter(n => n.ip && n.mask == null).length;
  const sinGw = hosts.filter(h => !h.gateway).length;

  const fallos = [];
  for (const a of hosts) {
    for (const b of hosts) {
      if (a.id === b.id) continue;
      totalPares++;
      const r = resolveReachability(graph, a, b.ip);
      if (!r.ok) {
        totalFallos++;
        porRazon[r.reason] = (porRazon[r.reason] || 0) + 1;
        fallos.push(`${a.label} → ${b.label} [${r.reason}]`);
      }
    }
  }

  const nombre = file.replace(".json", "");
  const pares = hosts.length * (hosts.length - 1);
  const ok = pares - fallos.length;
  const marca = fallos.length === 0 ? "OK " : "  ↯";
  console.log(
    `${marca} ${nombre.padEnd(20)} hosts=${String(hosts.length).padEnd(3)} ` +
    `pares ok=${ok}/${pares}`.padEnd(18) +
    `sinMascara=${String(sinMascara).padEnd(3)} sinGateway=${sinGw}`
  );
  // Se muestran unos pocos para no ahogar la salida
  for (const f of fallos.slice(0, 4)) console.log(`      ${f}`);
  if (fallos.length > 4) console.log(`      … y ${fallos.length - 4} más`);
}

console.log("\n─────────────────────────────────────────────");
console.log(`pares probados: ${totalPares} · fallos: ${totalFallos}`);
console.log("por razón:", porRazon);

// tests/fixtures/topologies.js
//
// Topologías sintéticas de las que no hay ejemplo en el repo.
//
// Son los casos que la auditoría verificó como colapsos del motor: el
// anillo que queda en una fila plana, la estrella sin nodo de
// infraestructura, el par redundante que la detección por nombre no ve, y
// la cadena larga que crece hacia abajo sin fin.
//
// Las comparten `tests/prettyLayout.test.js` y `bench/layout_bench.mjs`
// para que el test y el banco vigilen exactamente el mismo grafo.

function nodo(id, type, label) {
  return { id, type, label, x: 0, y: 0, ip: "" };
}

function enlace(a, b) {
  return {
    id: `${a}-${b}`, source: a, target: b,
    latencyMs: 5, bandwidthMbps: 1000, lossPct: 0, status: "up",
  };
}

function grafo(name, nodes, links) {
  return { version: 3, meta: { name }, nodes, links };
}

/**
 * Anillo cerrado de switches.
 * Hoy: los N caen al mismo rol, misma altura, y el enlace de cierre cruza
 * el diagrama entero. Métrica delatora: `height === 0`.
 */
export function anillo(n = 8) {
  const nodes = Array.from({ length: n }, (_, i) => nodo(`s${i}`, "switch", `SW-${i + 1}`));
  const links = Array.from({ length: n }, (_, i) => enlace(`s${i}`, `s${(i + 1) % n}`));
  return grafo("anillo", nodes, links);
}

/**
 * Estrella cuyo centro es una PC — ningún nodo alcanza rol de backbone.
 * Hoy: fila recta con el centro en un extremo, no en el centro.
 */
export function estrellaSinBackbone(n = 5) {
  const nodes = [nodo("hub", "pc", "PC-Hub")];
  const links = [];
  for (let i = 0; i < n; i++) {
    nodes.push(nodo(`p${i}`, "pc", `PC-${i + 1}`));
    links.push(enlace("hub", `p${i}`));
  }
  return grafo("estrella-sin-backbone", nodes, links);
}

/**
 * Par redundante real: mismos vecinos arriba y abajo, en alta
 * disponibilidad. Los nombres NO comparten raíz tras quitar el sufijo, así
 * que `nameStem()` no los empareja aunque la topología lo grite.
 */
export function parHA() {
  const nodes = [
    nodo("cl",   "cloud",    "Internet"),
    nodo("fwa",  "firewall", "FW-Principal"),
    nodo("fwb",  "firewall", "FW-Respaldo"),
    nodo("core", "switch",   "Core"),
    nodo("pc1",  "pc",       "PC-1"),
  ];
  const links = [
    enlace("cl", "fwa"),  enlace("cl", "fwb"),
    enlace("fwa", "core"), enlace("fwb", "core"),
    enlace("core", "pc1"),
  ];
  return grafo("par-ha", nodes, links);
}

/** Cadena larga de routers: el caso que pide plegado. */
export function cadena(n = 6) {
  const nodes = [nodo("cl", "cloud", "Internet")];
  const links = [];
  let prev = "cl";
  for (let i = 0; i < n; i++) {
    const id = `r${i}`;
    nodes.push(nodo(id, "router", `R-${i + 1}`));
    links.push(enlace(prev, id));
    prev = id;
  }
  return grafo("cadena", nodes, links);
}

/**
 * Doble firewall en serie, con los nombres del caso de referencia.
 * Es `dmz.json` reducido a su espina: sin los servidores ni las PC, para
 * que la aserción de orden no dependa de cómo se acomoden las hojas.
 */
export function dobleFirewallSerie() {
  const nodes = [
    nodo("cl",  "cloud",    "Internet"),
    nodo("fw1", "firewall", "FW-Externo"),
    nodo("sw1", "switch",   "SW-DMZ"),
    nodo("fw2", "firewall", "FW-Interno"),
    nodo("sw2", "switch",   "SW-LAN"),
    nodo("pc1", "pc",       "PC-1"),
  ];
  const links = [
    enlace("cl", "fw1"), enlace("fw1", "sw1"),
    enlace("sw1", "fw2"), enlace("fw2", "sw2"),
    enlace("sw2", "pc1"),
  ];
  return grafo("doble-firewall-serie", nodes, links);
}

/** Los sintéticos con la clave que usan el banco y la línea base. */
export const SINTETICOS = {
  "~anillo8":        anillo(8),
  "~estrella-sinbb": estrellaSinBackbone(5),
  "~par-ha":         parHA(),
  "~cadena6":        cadena(6),
  "~doble-fw":       dobleFirewallSerie(),
};

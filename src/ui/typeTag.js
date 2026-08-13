// src/ui/typeTag.js
//
// El espectro de tipo, fuera del lienzo.
//
// Los paneles construyen su HTML por innerHTML, así que este módulo
// exporta constructores de string en vez de nodos DOM. Existe para que
// no acabemos con seis variantes del mismo <span> repartidas entre el
// inspector, el terminal, la revisión y el chat.
//
// Ninguna función declara un color: todas emiten `data-type`, que el CSS
// resuelve a `--node-color` (style.css, "El espectro fuera del lienzo").
// El único mapa tipo→color sigue siendo typePalette.js.
//
// REGLA DE MARCA: esto es codificación de datos, no color de interfaz.
// Solo puede aparecer donde hay un dispositivo de ese tipo, y siempre
// acompañado del texto que dice lo mismo — el color nunca es la única
// señal. Nunca como fondo de panel, card o sección.

import { TYPE_ORDER, TYPE_LABEL } from "../render/typePalette.js";

/**
 * Escapa para interpolar en HTML. Todo lo que pasa por aquí puede venir
 * de `node.label`, que el usuario edita libremente en el inspector.
 */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Nombre legible de un tipo; cae al tipo crudo si no está en el mapa. */
export function typeName(type) {
  return TYPE_LABEL[type] || type || "";
}

// Plural en español de cada tipo. Las siglas invariables (UR3) y las
// que ya pluralizan solo con -s van aquí explícitas para no inventar
// una regla morfológica que fallaría con "Switch" y "Servidor".
const TYPE_PLURAL = {
  router: "Routers",
  switch: "Switches",
  pc: "PCs",
  firewall: "Firewalls",
  server: "Servidores",
  cloud: "Nubes",
  ap: "Access Points",
  plc: "PLCs",
  ur3: "UR3",
  agv: "AGVs",
};

/** "3 PCs", "1 Router". */
export function typeCount(type, count) {
  const nombre = count === 1 ? typeName(type) : (TYPE_PLURAL[type] || typeName(type));
  return `${count} ${nombre}`;
}

/**
 * Punto de 8 px. Para leyendas, filas de lista y barras de composición.
 * @param {string} type
 * @param {string} [title] - tooltip; por defecto, el nombre del tipo
 */
export function typeSwatch(type, title) {
  const t = title === undefined ? typeName(type) : title;
  return `<span class="type-swatch" data-type="${esc(type)}"${
    t ? ` title="${esc(t)}"` : ""
  } aria-hidden="true"></span>`;
}

/**
 * Texto teñido con el color del tipo. El texto sigue siendo legible sin
 * color: el tinte es redundante, nunca la única información.
 */
export function typeInk(type, texto) {
  return `<span class="type-ink" data-type="${esc(type)}">${esc(texto)}</span>`;
}

/**
 * Chip con punto + etiqueta. Tinte contenido dentro del componente.
 * @param {string} type
 * @param {string} [texto] - por defecto, el nombre del tipo
 */
export function typeChip(type, texto) {
  const t = texto === undefined ? typeName(type) : texto;
  return `<span class="type-chip" data-type="${esc(type)}">`
    + `<span class="type-chip-dot" aria-hidden="true"></span>${esc(t)}</span>`;
}

/**
 * Censo de tipos presentes en un grafo, en orden de espectro (matiz
 * ascendente) para que la barra apilada siempre lea igual.
 * @param {Array<{type:string}>} nodes
 * @returns {Array<{type:string, count:number}>} solo los tipos con nodos
 */
export function typeCensus(nodes) {
  const conteo = new Map();
  for (const n of nodes || []) {
    conteo.set(n.type, (conteo.get(n.type) || 0) + 1);
  }
  return TYPE_ORDER
    .filter(t => conteo.has(t))
    .map(t => ({ type: t, count: conteo.get(t) }));
}

/**
 * Barra apilada del censo: un tramo por tipo, ancho proporcional al
 * número de dispositivos. Es la huella del diagrama — cambia con cada
 * topología. Devuelve "" con el grafo vacío.
 */
export function censusBar(nodes) {
  const censo = typeCensus(nodes);
  if (censo.length === 0) return "";
  const tramos = censo.map(({ type, count }) =>
    `<span class="status-census-seg" data-type="${esc(type)}" style="flex:${count}"`
    + ` title="${esc(typeCount(type, count))}"></span>`
  ).join("");
  return `<span class="status-census" role="img"`
    + ` aria-label="${esc(censo.map(c => typeCount(c.type, c.count)).join(", "))}">`
    + `${tramos}</span>`;
}

/**
 * Fila de puntos, uno por dispositivo, para describir de qué está hecha
 * una topología antes de abrirla. Con más de `max` dispositivos, corta y
 * añade "+N" — la fila describe la composición, no cuenta inventario.
 *
 * @param {Record<string, number>} comp - mapa tipo → cantidad
 * @param {number} [max=10]
 */
export function compDots(comp, max = 10) {
  const censo = TYPE_ORDER
    .filter(t => (comp?.[t] || 0) > 0)
    .map(t => ({ type: t, count: comp[t] }));
  if (censo.length === 0) return "";

  const total = censo.reduce((s, c) => s + c.count, 0);
  const puntos = [];
  for (const { type, count } of censo) {
    for (let i = 0; i < count && puntos.length < max; i++) {
      puntos.push(`<span class="comp-dot" data-type="${esc(type)}"></span>`);
    }
  }
  const resto = total - puntos.length;
  return `<span class="comp-strip" role="img"`
    + ` aria-label="${esc(censo.map(c => typeCount(c.type, c.count)).join(", "))}">`
    + puntos.join("")
    + (resto > 0 ? `<span class="comp-more">+${resto}</span>` : "")
    + `</span>`;
}

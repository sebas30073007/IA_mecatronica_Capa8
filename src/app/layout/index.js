// src/app/layout/index.js
//
// Pretty — organizador automático de topologías de CAPA 8.
//
// Punto de entrada del motor. El pipeline, en orden:
//
//   1. Clasificar roles          topology.inferRole
//   2. Separar componentes       topology.detectComponents
//   3. Detectar grupos           groups.detectSemanticGroups
//   4. Elegir formas             groups.chooseLayoutMode
//   5. Colocar backbone          candidates.placeComponent
//   6. Colocar grupos            candidates.placeComponent
//   7. Resolver colisiones       geometry.resolveCollisions
//   8. Empaquetar componentes    candidates.packComponents
//   9. Aparcar aislados          aquí
//  10. Normalizar y ajustar      aquí
//
// La frontera importante de este módulo es que `computeLayout` es PURA:
// recibe un grafo y devuelve posiciones, sin tocar el store. `prettyLayout`
// es la envoltura que las aplica. Separarlas permite probar el motor sin
// simular un store, y deja la puerta abierta a previsualizar el resultado
// antes de aplicarlo.

import {
  BASE_HGAP, BASE_VGAP, PARK_MARGIN, GRID_SIZE,
  MAX_COLLISION_ITER, resolveCollisions,
} from "./geometry.js";
import { buildAdj, inferRole, detectComponents } from "./topology.js";
import { placeComponent, packComponents, CANVAS_CX } from "./candidates.js";
import { ORIENTACION_DEFECTO } from "./scorer.js";

// Margen mínimo respecto al origen del lienzo.
const CANVAS_MARGIN = 150;

/**
 * Calcula las posiciones que Pretty daría a un grafo. Función pura: no
 * despacha nada ni lee el store.
 *
 * `orientation` elige entre dos composiciones: `"horizontal"` (escritorio,
 * el defecto) aprovecha el ancho y pliega la columna pronto; `"vertical"`
 * (móvil) mantiene la columna larga, que es la que se recorre con el
 * pulgar. NO es el tamaño de la ventana, son dos constantes: el mismo
 * grafo con la misma orientación da siempre el mismo dibujo.
 *
 * @param {{nodes:Array, links:Array}} graph
 * @param {{orientation?:"horizontal"|"vertical"}} [opts]
 * @returns {Map<string,{x:number,y:number}>} posición final por nodo
 */
export function computeLayout(graph, opts = {}) {
  const orientation = opts.orientation || ORIENTACION_DEFECTO;
  const { nodes, links } = graph;
  const newPositions = new Map();
  if (!nodes || nodes.length === 0) return newPositions;

  const { adj, nodeMap } = buildAdj(nodes, links);
  const roles = new Map();
  for (const n of nodes) roles.set(n.id, inferRole(n, adj, nodeMap));

  const isolated  = nodes.filter(n => (adj.get(n.id) || []).length === 0);
  const connected = nodes.filter(n => (adj.get(n.id) || []).length >  0);
  const compIdGroups = detectComponents(connected, adj);

  const compResults = compIdGroups.map(ids => {
    const compLinks = links.filter(l => ids.includes(l.source) && ids.includes(l.target));
    return { ids, ...placeComponent({ compIds: ids, adj, nodeMap, roles, compLinks, orientation }) };
  });

  // Empaquetado: solo hace falta con más de un componente.
  if (compResults.length > 1) {
    for (const [id, p] of packComponents(compResults)) newPositions.set(id, p);
  } else {
    for (const cr of compResults) {
      for (const [id, pos] of cr.positions) newPositions.set(id, pos);
    }
  }

  // Franja de nodos aislados, debajo de todo lo conectado.
  if (isolated.length > 0) {
    let parkY = CANVAS_MARGIN;
    if (newPositions.size > 0) {
      parkY = Math.max(...[...newPositions.values()].map(p => p.y)) + PARK_MARGIN + BASE_VGAP;
    }
    const rowW = (isolated.length - 1) * BASE_HGAP;
    isolated.forEach((n, i) => {
      newPositions.set(n.id, {
        x: Math.round(CANVAS_CX - rowW / 2 + i * BASE_HGAP),
        y: Math.round(parkY),
      });
    });
  }

  // Normalizar: nada por encima ni a la izquierda del margen.
  if (newPositions.size > 0) {
    let gMinX = Infinity, gMinY = Infinity;
    for (const p of newPositions.values()) {
      gMinX = Math.min(gMinX, p.x);
      gMinY = Math.min(gMinY, p.y);
    }
    const shiftX = gMinX < CANVAS_MARGIN ? CANVAS_MARGIN - gMinX : 0;
    const shiftY = gMinY < CANVAS_MARGIN ? CANVAS_MARGIN - gMinY : 0;
    if (shiftX !== 0 || shiftY !== 0) {
      for (const [id, p] of newPositions) {
        newPositions.set(id, { x: p.x + shiftX, y: p.y + shiftY });
      }
    }
  }

  // Ajustar a la rejilla invisible.
  for (const [id, p] of newPositions) {
    newPositions.set(id, {
      x: Math.round(p.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(p.y / GRID_SIZE) * GRID_SIZE,
    });
  }

  // Pase de garantía: la rejilla puede volver a juntar un par que el motor
  // ya había separado. Dos nodos a 98px se ajustan a 660 y 740 y acaban a
  // 80 — solapados otra vez. El empujón va en múltiplos de la rejilla, así
  // que corrige sin salirse de ella y no hace falta reajustar después.
  //
  // Es lo que convierte "las cajas no se tocan" en una garantía del motor y
  // no en algo que se cumple casi siempre.
  const gridFixed = new Set();
  for (const cr of compResults) {
    for (const id of cr.backboneIds || []) gridFixed.add(id);
  }
  resolveCollisions(newPositions, gridFixed, MAX_COLLISION_ITER, GRID_SIZE);

  return newPositions;
}

/**
 * Calcula el layout y lo aplica al store.
 *
 * El historial ya NO se toca aquí: lo maneja quien llama. Antes lo empujaba
 * el motor y además el llamador, y cargar un ejemplo costaba dos Ctrl+Z.
 *
 * Se aplica en UN solo dispatch. Antes era uno por nodo, y cada dispatch
 * clona el estado entero y repinta el lienzo completo.
 *
 * @param {{graph:object, dispatch:Function, ActionTypes:object,
 *          orientation?:string}} deps
 * @returns {number} cuántos nodos se movieron
 */
export function prettyLayout({ graph, dispatch, ActionTypes, orientation }) {
  const positions = computeLayout(graph, { orientation });
  if (positions.size === 0) return 0;

  const moves = [];
  for (const n of graph.nodes) {
    const p = positions.get(n.id);
    if (p && (p.x !== n.x || p.y !== n.y)) moves.push({ id: n.id, x: p.x, y: p.y });
  }
  if (moves.length > 0) {
    dispatch({ type: ActionTypes.APPLY_LAYOUT, payload: { moves } });
  }
  return moves.length;
}

// Reexportado para renderer.js, que atenúa los enlaces de un abanico con el
// mismo umbral que usa el motor para decidir que lo es.
export { FANOUT_THRESHOLD } from "./groups.js";
export { scoreLayout, layoutMetrics, ORIENTACIONES, ORIENTACION_DEFECTO } from "./scorer.js";

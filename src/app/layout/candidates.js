// src/app/layout/candidates.js
//
// Colocación: de "qué es cada nodo" a coordenadas concretas.
//
// Aquí viven las fases 5-9 del motor: niveles del backbone, orden por
// baricentro, colocación de grupos alrededor de sus anclas, resolución de
// colisiones y empaquetado de componentes desconectados.
//
// El nombre del módulo mira al futuro: hoy genera una sola disposición más
// su espejo horizontal, y la etapa 3 lo convierte en un generador de
// variantes (vertical, plegada a derecha, plegada a izquierda) entre las
// que elige el scorer.

import {
  BASE_VGAP, COMP_PAD, GROUP_HGAP, GROUP_BELOW_GAP, MIN_CLUSTER_GAP,
  ORGANIC_PULL, adaptiveHGap, resolveCollisions, boundingBox,
  snapshotRows, realignRows, MIN_GAP_X, MIN_GAP_Y, GRID_SIZE,
} from "./geometry.js";
import {
  isBackboneRole, sortByLabel, inferZone, computeLayers, findMainPath,
} from "./topology.js";
import {
  detectSemanticGroups, applyGroupLayout, estimateGroupWidth,
  estimateGroupBelowHeight, assignGroupSides,
} from "./groups.js";
import { scoreLayout, perfilOrientacion } from "./scorer.js";

// Centro canónico del lienzo. Fijo a propósito: nunca se deriva de las
// posiciones actuales, y eso es lo que hace el motor idempotente — pulsar
// "Organizar" dos veces da el mismo resultado.
const CANVAS_CX = 700;
const CANVAS_CY = 400;

/**
 * Ordena los nodos de un nivel por la media de X de sus vecinos ya
 * colocados. Es el paso que reduce cruces entre niveles consecutivos.
 */
function barycenterOrder(ids, adj, tempPos, nodeMap) {
  return [...ids].sort((a, b) => {
    const scoreOf = id => {
      const known = (adj.get(id) || []).filter(nb => tempPos.has(nb));
      if (known.length > 0) return known.reduce((s, nb) => s + tempPos.get(nb).x, 0) / known.length;
      return nodeMap.get(id)?.x ?? 0;
    };
    return scoreOf(a) - scoreOf(b);
  });
}

// ─── Plegado ─────────────────────────────────────────────────────────────
//
// Una jerarquía estrictamente vertical funciona con tres o cuatro niveles.
// Con una cadena larga produce una columna altísima —el caso extremo es un
// diagrama de ancho CERO— que no cabe en pantalla y desperdicia todo el
// espacio horizontal.
//
// La solución no es apilar dispositivos del mismo tipo en horizontal, que
// es lo que hacía la v3 y lo que rompía la lectura. Es plegar la ruta
// principal: seguir bajando, pero en una segunda columna al lado.
//
// El plegado es un CANDIDATO, no una regla. Se genera, se puntúa y solo
// gana si de verdad sale mejor; si estropea el dibujo, pierde y no se ve.

// A partir de cuántos niveles se prueba a plegar. Ya no es una constante:
// lo decide la orientación (ver `ORIENTACIONES` en scorer.js). En escritorio
// se pliega pronto, porque hay ancho de sobra y poco alto; en móvil casi
// nunca, porque la columna larga es justo la forma que se recorre con el
// pulgar.
const FOLD_STEP_Y     = 60;  // caída del pliegue: suficiente para que el nodo
                             // plegado no parezca hermano del pivote
const FOLD_GAP        = 150; // aire entre columnas
const FOLD_MIN_DX     = 320; // desplazamiento mínimo entre columnas
                             // (una cadena tiene filas de un solo nodo, así
                             //  que su "ancho de tramo" es cero y sin este
                             //  mínimo el pliegue no se notaría)

/**
 * Coloca un componente conexo completo.
 *
 * Genera las disposiciones posibles —vertical, y plegada a cada lado si el
 * diagrama crece demasiado a lo alto— y devuelve la de menor puntuación.
 * Si el plegado empeora el dibujo, pierde y no llega a verse.
 *
 * @returns {{positions:Map, minX:number, minY:number, maxX:number, maxY:number}}
 */
export function placeComponent(args) {
  const perfil = perfilOrientacion(args.orientation);
  const vertical = placeVariant(args, null);
  const candidatos = [vertical];

  // El plegado es un REMEDIO PARA EL ALTO, no una forma de ganar ancho.
  //
  // Sin esta condición, un árbol que ya es más ancho que alto —un switch
  // central con tres armarios y sus equipos debajo— también se plegaba, y el
  // resultado era peor de lo que arreglaba: al plegar, los niveles quedan en
  // columnas distintas y el tronco deja de poder centrarse sobre sus hijos,
  // así que el diagrama se lee escorado en vez de piramidal.
  //
  // Si ya es más ancho que alto, plegar solo puede pasarse de largo.
  const anchoVert = vertical.maxX - vertical.minX;
  const altoVert  = vertical.maxY - vertical.minY;
  const esColumna = altoVert > 0 && (anchoVert / altoVert) < 1;

  // Comparar variantes cuesta, y en un diagrama de tres niveles no hay nada
  // que ganar plegando.
  if (esColumna && vertical.layerCount >= perfil.foldMin) {
    candidatos.push(placeVariant(args, { dir: +1, count: 1 }));
    candidatos.push(placeVariant(args, { dir: -1, count: 1 }));
  }
  if (esColumna && vertical.layerCount >= perfil.foldMin2) {
    candidatos.push(placeVariant(args, { dir: +1, count: 2 }));
    candidatos.push(placeVariant(args, { dir: -1, count: 2 }));
  }

  let mejor = candidatos[0];
  for (const c of candidatos.slice(1)) {
    if (c.score < mejor.score) mejor = c;
  }
  return mejor;
}

/**
 * Una disposición concreta del componente.
 * @param {{dir:number, count:number}|null} fold - null para vertical.
 *        `dir` +1 pliega a la derecha, -1 a la izquierda.
 */
function placeVariant({ compIds, adj, nodeMap, roles, compLinks = [], orientation }, fold) {
  const cx = CANVAS_CX;
  const cy = CANVAS_CY;

  // Zona de cada servidor (dmz / services)
  const zones = new Map();
  for (const id of compIds) {
    const n = nodeMap.get(id);
    if (n) zones.set(id, inferZone(n, adj, nodeMap));
  }

  // ── Espina vs hojas ───────────────────────────────────────────────────
  //
  // La espina es la infraestructura: lo que se coloca en filas por nivel.
  // Cuando un componente no tiene NINGÚN nodo de infraestructura —una
  // estrella de PC sin switch, por ejemplo— la espina pasa a ser el
  // componente entero. Sin esto esos grafos caían en un reserva que anclaba
  // a todos los vecinos al mismo punto y dependía de la resolución de
  // colisiones para separarlos: el resultado era una fila recta con el
  // centro de la estrella en un extremo.
  let backboneIds = compIds.filter(id => isBackboneRole(roles.get(id)));
  const hasInfra  = backboneIds.length > 0;
  if (!hasInfra) backboneIds = [...compIds];
  const spine = new Set(backboneIds);

  // ── Niveles por topología ─────────────────────────────────────────────
  // Sustituye a ROLE_TIER como fuente de la altura. El rol sigue decidiendo
  // qué es espina y qué es hoja; el lugar en el recorrido lo decide esto.
  const { layers, succs, root } = computeLayers({ spineIds: backboneIds, adj, nodeMap, roles, hasInfra });

  // ── Grupos semánticos ─────────────────────────────────────────────────
  const { groups, ungrouped } = detectSemanticGroups(compIds, adj, nodeMap, roles, zones, spine);

  // Indexar por ancla. Los grupos con lado preferido van al final para que
  // assignGroupSides los mande a la derecha de forma natural.
  const groupsByAnchor = new Map();
  for (const g of groups) {
    if (!groupsByAnchor.has(g.anchorId)) groupsByAnchor.set(g.anchorId, []);
    groupsByAnchor.get(g.anchorId).push(g);
  }
  for (const [, gs] of groupsByAnchor) {
    gs.sort((a, b) => (a.preferredSide ? 1 : 0) - (b.preferredSide ? 1 : 0));
  }

  // ── Filas por nivel ───────────────────────────────────────────────────
  const byTier = new Map();
  for (const id of backboneIds) {
    const t = layers.get(id) ?? 0;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(id);
  }
  // Orden canónico por etiqueta: independiente de la posición, estable
  // entre llamadas.
  for (const t of byTier.keys()) {
    byTier.set(t, sortByLabel(byTier.get(t), nodeMap));
  }

  const sortedTiers = [...byTier.keys()].sort((a, b) => a - b);

  // ¿Este nodo de espina continúa hacia abajo? Decide si sus grupos pueden
  // ir "debajo" o tienen que apartarse a un lado para no partir el tronco.
  const sigueBajando = id => (succs.get(id) || new Set()).size > 0;

  // Caída de un grupo lateral cuyo ancla sigue bajando: se aparta Y baja un
  // poco, para que se lea en diagonal —colgando de su ancla— y no como un
  // hermano dibujado al lado.
  const CAIDA_DIAGONAL = Math.round(BASE_VGAP * 0.5);

  // Y se aparta algo más de lo normal. Cae en el hueco entre su ancla y el
  // siguiente nivel, así que no le separa la Y de ninguno de los dos: toda
  // la holgura tiene que salir de la X.
  const APARTE_LATERAL = 70;

  // Salto vertical por nivel: más aire donde haya grupos colgando debajo.
  // Los grupos laterales no piden espacio vertical extra.
  const stepDowns = [];
  for (let ri = 0; ri < sortedTiers.length - 1; ri++) {
    const t = sortedTiers[ri];
    let maxBelowH = 0;
    for (const id of (byTier.get(t) || [])) {
      const gs    = (groupsByAnchor.get(id) || []);
      const sides = assignGroupSides(gs, sigueBajando(id));
      gs.forEach((g, gi) => {
        if (sides[gi] === "below") {
          maxBelowH = Math.max(maxBelowH, estimateGroupBelowHeight(g));
        }
      });
    }
    stepDowns.push(Math.max(BASE_VGAP, maxBelowH + 80));
  }

  // Ancho que cada nodo reclama por lo que le cuelga debajo.
  //
  // Sin esto, el hueco entre dos nodos de una misma fila solo mira sus
  // etiquetas, así que dos switches vecinos con seis y dos servidores
  // debajo acaban con las dos filas de servidores entrelazadas y sus
  // enlaces cruzándose. Es el solapamiento entre grupos de anclas
  // distintas que hoy se delegaba entero a la resolución de colisiones,
  // que separa nodos pero no puede recomponer la lectura.
  const belowWidthOf = new Map();
  for (const id of backboneIds) {
    const gs = groupsByAnchor.get(id) || [];
    const sides = assignGroupSides(gs, sigueBajando(id));
    let w = 0;
    gs.forEach((g, gi) => {
      if (sides[gi] === "below") w = Math.max(w, estimateGroupWidth(g));
    });
    belowWidthOf.set(id, w);
  }

  /** Separación de una fila: la mayor entre etiquetas y subárboles. */
  const rowHGap = ids => {
    let maxBelow = 0;
    for (const id of ids) maxBelow = Math.max(maxBelow, belowWidthOf.get(id) || 0);
    return Math.max(adaptiveHGap(ids, nodeMap), maxBelow + MIN_CLUSTER_GAP);
  };

  /** Lo que ocupa a lo ancho un tramo de niveles, con sus grupos incluidos. */
  const segWidth = (desde, hasta) => {
    let w = 0;
    for (let ri = desde; ri <= hasta; ri++) {
      const ids = byTier.get(sortedTiers[ri]) || [];
      w = Math.max(w, (ids.length - 1) * rowHGap(ids)
                    + Math.max(...ids.map(id => belowWidthOf.get(id) || 0), 0));
    }
    return w;
  };

  // ── Marco: dónde cae el centro y la altura de cada nivel ──────────────
  //
  // Sin plegar es una sola columna en cx. Plegado, los niveles posteriores
  // al pivote se llevan a una segunda columna al lado y su Y avanza solo
  // FOLD_STEP_Y en vez del salto completo: así se ahorra alto sin que el
  // nodo plegado parezca hermano del pivote en vez de su continuación.
  const nTiers = sortedTiers.length;

  // Niveles donde se dobla la esquina, repartidos por igual. Van sobre la
  // ruta principal, que es la que hay que poder seguir con la vista.
  const pivotes = [];
  if (fold && nTiers > fold.count + 1) {
    for (let i = 1; i <= fold.count; i++) {
      const p = Math.round(i * (nTiers - 1) / (fold.count + 1));
      if (p > 0 && p < nTiers - 1 && !pivotes.includes(p)) pivotes.push(p);
    }
  }
  const esPivote = ri => pivotes.includes(ri);
  /** A qué columna pertenece un nivel. */
  const tramoDe = ri => pivotes.filter(p => p < ri).length;

  const marco = [];
  {
    // Cada columna se desplaza lo que ocupa la anterior más el aire, con un
    // mínimo para que el pliegue se lea aunque los tramos sean estrechos.
    const anchos = [];
    let ini = 0;
    for (const p of [...pivotes, nTiers - 1]) {
      anchos.push(segWidth(ini, p));
      ini = p + 1;
    }
    const dxDe = tramo => {
      let acc = 0;
      for (let t = 1; t <= tramo; t++) {
        acc += Math.max(anchos[t - 1] / 2 + anchos[t] / 2 + FOLD_GAP, FOLD_MIN_DX);
      }
      return (fold?.dir ?? 1) * acc;
    };

    let y = cy;
    for (let ri = 0; ri < nTiers; ri++) {
      if (ri > 0) y += esPivote(ri - 1) ? FOLD_STEP_Y : stepDowns[ri - 1];
      marco.push({ cx: cx + dxDe(tramoDe(ri)), y });
    }
    // Centrar el conjunto sobre (cx, cy).
    const altura = marco[nTiers - 1].y - marco[0].y;
    const ajusteY = cy - altura / 2 - marco[0].y;
    const xs = marco.map(m => m.cx);
    const ajusteX = cx - (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const m of marco) { m.y += ajusteY; m.cx += ajusteX; }
  }

  // X del backbone: fila centrada en el cx de su nivel, luego baricentro.
  const tempPos = new Map();

  /** Coloca una fila centrada en el cx de su nivel. */
  const layRow = (ids, ri) => {
    const hgap = rowHGap(ids);
    const rowW = (ids.length - 1) * hgap;
    const { cx: rowCX, y } = marco[ri];
    ids.forEach((id, i) => tempPos.set(id, { x: rowCX - rowW / 2 + i * hgap, y }));
  };

  for (let ri = 0; ri < nTiers; ri++) layRow(byTier.get(sortedTiers[ri]), ri);

  // Las pasadas de baricentro solo se hacen DENTRO de un tramo. Al plegar,
  // los dos tramos no comparten marco en X, así que ordenar el primer
  // nivel del segundo por la media de sus vecinos del primero lo arrastraría
  // a la columna equivocada.
  const mismoTramo = (a, b) => tramoDe(a) === tramoDe(b);
  for (let pass = 0; pass < 3; pass++) {
    for (let ri = 1; ri < nTiers; ri++) {
      if (!mismoTramo(ri, ri - 1)) continue;
      const ordered = barycenterOrder(byTier.get(sortedTiers[ri]), adj, tempPos, nodeMap);
      byTier.set(sortedTiers[ri], ordered);
      layRow(ordered, ri);
    }
    for (let ri = nTiers - 2; ri >= 0; ri--) {
      if (!mismoTramo(ri, ri + 1)) continue;
      const ordered = barycenterOrder(byTier.get(sortedTiers[ri]), adj, tempPos, nodeMap);
      byTier.set(sortedTiers[ri], ordered);
      layRow(ordered, ri);
    }
  }

  // ── Cada padre sobre el centro de sus hijos ───────────────────────────
  //
  // Hasta aquí las pasadas de baricentro solo REORDENAN: `layRow` vuelve a
  // centrar la fila en el cx del marco, que es el mismo para todos los
  // niveles. El efecto es que un tronco de un solo nodo se queda clavado en
  // el centro del lienzo mientras sus hijos se extienden hacia un lado, y
  // el diagrama entero se lee escorado en vez de piramidal.
  //
  // Esto lo corrige de abajo arriba: cada nodo apunta a la media de sus
  // hijos de espina y la fila se coloca lo más cerca posible de esos
  // objetivos sin bajar de la separación mínima. Un nodo sin hijos de
  // espina se queda donde está y actúa de ancla.
  const colocarEnObjetivos = (ids, ri, objetivos) => {
    const hgap = rowHGap(ids);
    const { y } = marco[ri];
    const xs = ids.map(id => objetivos.get(id) ?? tempPos.get(id).x);

    // Separación hacia la derecha respetando el orden ya decidido.
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + hgap);

    // Empujar a la derecha desplaza la fila entera; se devuelve al centro
    // que pedían los objetivos para no arrastrar el dibujo hacia un lado.
    const medObj = ids.reduce((s, id, i) => s + (objetivos.get(id) ?? xs[i]), 0) / ids.length;
    const medReal = xs.reduce((s, x) => s + x, 0) / xs.length;
    const ajuste = medObj - medReal;

    ids.forEach((id, i) => tempPos.set(id, { x: Math.round(xs[i] + ajuste), y }));
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let ri = nTiers - 2; ri >= 0; ri--) {
      if (!mismoTramo(ri, ri + 1)) continue;
      const ids = byTier.get(sortedTiers[ri]);
      const objetivos = new Map();
      for (const id of ids) {
        const hijos = [...(succs.get(id) || [])].filter(h => tempPos.has(h));
        if (hijos.length === 0) continue;   // hoja de espina: ancla
        objetivos.set(id, hijos.reduce((s, h) => s + tempPos.get(h).x, 0) / hijos.length);
      }
      if (objetivos.size === 0) continue;
      colocarEnObjetivos(ids, ri, objetivos);
    }
  }

  const finalPos = new Map(tempPos);

  // Desvío orgánico: un nivel de un solo nodo se acerca al centroide de
  // sus vecinos, para romper la línea vertical perfecta.
  for (let ri = 0; ri < sortedTiers.length; ri++) {
    const t   = sortedTiers[ri];
    const ids = byTier.get(t);
    if (ids.length === 1) {
      const id        = ids[0];
      // Un nodo que YA está sobre el centro de sus hijos no se desvía: la
      // pasada de baricentro lo puso ahí a propósito y el desvío orgánico lo
      // arrastraría fuera, que es lo que convertía una columna plegada en
      // una escalera diagonal.
      if ((succs.get(id) || new Set()).size > 0) continue;
      const neighbors = (adj.get(id) || []).filter(nb => finalPos.has(nb) && nb !== id);
      if (neighbors.length > 0) {
        const avgX  = neighbors.reduce((s, nb) => s + finalPos.get(nb).x, 0) / neighbors.length;
        const curX  = finalPos.get(id).x;
        const newX  = curX + (avgX - curX) * ORGANIC_PULL;
        finalPos.set(id, { x: Math.round(newX), y: finalPos.get(id).y });
      }
    }
  }

  // ── Reordenar niveles cuyos nodos forman un camino ────────────────────
  // Elimina cruces cuando los nodos de un mismo nivel están encadenados
  // entre sí (p. ej. switches en serie que la tabla de roles metió juntos).
  for (let ri = 0; ri < sortedTiers.length; ri++) {
    const t   = sortedTiers[ri];
    const ids = byTier.get(t);
    if (ids.length < 3) continue;

    const tierSet     = new Set(ids);
    const sameTierNbs = id => (adj.get(id) || []).filter(nb => tierSet.has(nb));
    if (!ids.every(id => sameTierNbs(id).length <= 2)) continue; // no es un camino simple
    const endpoints   = ids.filter(id => sameTierNbs(id).length <= 1);
    if (!endpoints.length) continue; // ciclo — se salta

    const visited = new Set();
    const chain   = [];
    let   cur     = endpoints[0];
    while (cur != null) {
      visited.add(cur); chain.push(cur);
      cur = sameTierNbs(cur).find(nb => !visited.has(nb));
    }
    if (chain.length !== ids.length) continue; // subgrafo desconectado

    // Dirección: el extremo con conexiones a otros niveles va del lado del
    // centroide de esas conexiones.
    const crossAvgX = ep => {
      const nbs = (adj.get(ep) || []).filter(nb => !tierSet.has(nb) && finalPos.has(nb));
      return nbs.length ? nbs.reduce((s, nb) => s + finalPos.get(nb).x, 0) / nbs.length : null;
    };
    const ep0x = crossAvgX(chain[0]);
    const ep1x = crossAvgX(chain[chain.length - 1]);
    if (ep1x !== null && ep0x === null) chain.reverse();
    else if (ep0x !== null && ep1x !== null) {
      if (ep1x < ep0x) chain.reverse();
    }

    byTier.set(t, chain);
    layRow(chain, ri);
    for (const id of chain) {
      const p = tempPos.get(id);
      finalPos.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  // ── Grupos alrededor del backbone ─────────────────────────────────────
  for (const [anchorId, anchorGroups] of groupsByAnchor) {
    const anchorPos = finalPos.get(anchorId);
    if (!anchorPos) continue;

    const conHijos = sigueBajando(anchorId);
    const sides = assignGroupSides(anchorGroups, conHijos);
    // Ancla efectiva de los grupos laterales: la real, caída lo justo.
    const anclaPara = side => {
      if (!conHijos || side === "below") return anchorPos;
      const dx = side === "left" ? -APARTE_LATERAL : side === "right" ? APARTE_LATERAL : 0;
      return { x: anchorPos.x + dx, y: anchorPos.y + CAIDA_DIAGONAL };
    };

    if (anchorGroups.length === 1) {
      const gPos = applyGroupLayout(anchorGroups[0], anclaPara(sides[0]), sides[0]);
      for (const [id, p] of gPos) finalPos.set(id, p);
    } else {
      // Varios grupos: los que van debajo compiten por el mismo ancho, así
      // que se reparten el espacio en vez de superponerse.
      const belowGroups = anchorGroups.filter((_, i) => sides[i] === "below");
      let belowStartX = anchorPos.x;
      if (belowGroups.length > 1) {
        const totalW = belowGroups.reduce((s, g) => s + estimateGroupWidth(g), 0)
                     + (belowGroups.length - 1) * MIN_CLUSTER_GAP;
        belowStartX = anchorPos.x - totalW / 2;
      }
      let belowCursor = belowStartX;

      for (let gi = 0; gi < anchorGroups.length; gi++) {
        const g    = anchorGroups[gi];
        const side = sides[gi];

        if (side === "below" && belowGroups.length > 1) {
          const w        = estimateGroupWidth(g);
          const gAnchorX = belowCursor + w / 2;
          belowCursor   += w + MIN_CLUSTER_GAP;
          const gPos = applyGroupLayout(g, { x: gAnchorX, y: anchorPos.y }, "below");
          for (const [id, p] of gPos) finalPos.set(id, p);
        } else {
          const gPos = applyGroupLayout(g, anclaPara(side), side);
          for (const [id, p] of gPos) finalPos.set(id, p);
        }
      }
    }
  }

  // Hojas sin grupo: junto a su primer vecino backbone.
  for (const id of ungrouped) {
    const nbs = (adj.get(id) || []).filter(nb => finalPos.has(nb));
    if (nbs.length > 0) {
      const nb    = nbs[0];
      const nbPos = finalPos.get(nb);
      finalPos.set(id, { x: Math.round(nbPos.x + GROUP_HGAP), y: Math.round(nbPos.y + GROUP_BELOW_GAP) });
    } else {
      finalPos.set(id, { x: Math.round(cx), y: Math.round(cy + 350) });
    }
  }

  // ── Compactar el alto sobrante ────────────────────────────────────────
  //
  // El salto entre dos niveles se calcula por NIVEL ENTERO: se reserva lo
  // que necesite el nodo más exigente de la fila. El resultado es que un
  // nodo paga el hueco que piden las hojas de sus hermanos aunque estén
  // lejos en horizontal — el caso que se veía en la WAN MPLS, con el router
  // de Cali colgando el triple de largo que los demás solo porque sus dos
  // switches hermanos tenían equipos debajo.
  //
  // Aquí, con las posiciones ya reales, se sube cada bloque lo que de
  // verdad sobra. Dos límites, y ninguno es negociable:
  //   • dos cajas cercanas en X no pueden acercarse más de MIN_GAP_Y
  //   • dos nodos ENLAZADOS conservan un nivel completo de separación, para
  //     que el enlace siga leyéndose hacia abajo y su etiqueta quepa
  const enlacesDe = new Map();
  for (const l of compLinks) {
    if (!enlacesDe.has(l.source)) enlacesDe.set(l.source, new Set());
    if (!enlacesDe.has(l.target)) enlacesDe.set(l.target, new Set());
    enlacesDe.get(l.source).add(l.target);
    enlacesDe.get(l.target).add(l.source);
  }
  const conectados = (a, b) => enlacesDe.get(a)?.has(b);

  for (let ri = 1; ri < nTiers; ri++) {
    if (!mismoTramo(ri, ri - 1)) continue;   // al plegar, la Y no manda
    const corte = marco[ri].y;
    const abajo = [], arriba = [];
    for (const [id, p] of finalPos) (p.y >= corte ? abajo : arriba).push(id);
    if (abajo.length === 0 || arriba.length === 0) continue;

    let subida = Infinity;
    for (const b of abajo) {
      const pb = finalPos.get(b);
      for (const a of arriba) {
        const pa = finalPos.get(a);
        const dy = pb.y - pa.y;
        if (dy <= 0) continue;
        if (conectados(a, b)) subida = Math.min(subida, dy - BASE_VGAP);
        else if (Math.abs(pb.x - pa.x) < MIN_GAP_X) subida = Math.min(subida, dy - MIN_GAP_Y);
      }
    }
    if (!isFinite(subida) || subida < GRID_SIZE) continue;
    subida = Math.floor(subida / GRID_SIZE) * GRID_SIZE;
    for (const id of abajo) {
      const p = finalPos.get(id);
      finalPos.set(id, { x: p.x, y: p.y - subida });
    }
    for (let k = ri; k < nTiers; k++) marco[k].y -= subida;
  }

  // ── Colisiones: el backbone no se mueve ───────────────────────────────
  //
  // Antes y después: se anota qué nodos de grupo comparten fila, se separan
  // las cajas y se devuelven las filas a su altura. Sin ese último paso, un
  // empujón de 6px deja una matriz escalonada — correcta y fea.
  const fixedIds   = new Set(backboneIds);
  const groupedIds = [];
  for (const gs of groupsByAnchor.values()) {
    for (const g of gs) groupedIds.push(...g.nodeIds);
  }
  const filas = snapshotRows(finalPos, groupedIds);
  resolveCollisions(finalPos, fixedIds);
  realignRows(finalPos, filas, fixedIds);

  // ── Refinamiento: comparar contra el espejo horizontal ────────────────
  // Se aplica dentro de cada variante, no entre variantes: el espejo no
  // cambia la estructura, solo hacia qué lado se abren las ramas.
  const mainPath = findMainPath({ layers, succs, root, spineIds: backboneIds, adj, nodeMap });
  if (compLinks.length > 0 || compIds.length > 3) {
    const mirroredPos = new Map();
    // Se refleja en torno al centro real del dibujo, no en torno a cx: al
    // plegar, el conjunto ya no está centrado ahí.
    const bbm = boundingBox(finalPos);
    const eje = (bbm.minX + bbm.maxX) / 2;
    for (const [id, p] of finalPos) {
      mirroredPos.set(id, { x: Math.round(2 * eje - p.x), y: p.y });
    }
    const scoreA = scoreLayout(finalPos, compLinks, layers, { mainPath, orientation });
    const scoreB = scoreLayout(mirroredPos, compLinks, layers, { mainPath, orientation });
    if (scoreB < scoreA * 0.90) {
      for (const [id, p] of mirroredPos) finalPos.set(id, p);
    }
  }

  // Caja envolvente con margen de icono + etiqueta, para el empaquetado
  const bb = boundingBox(finalPos);
  return {
    positions: finalPos,
    minX: bb.minX - 65,
    minY: bb.minY - 25,
    maxX: bb.maxX + 65,
    maxY: bb.maxY + 65,
    // Para que placeComponent pueda elegir entre variantes
    score: scoreLayout(finalPos, compLinks, layers, { mainPath, orientation }),
    layerCount: nTiers,
    // Lo necesita el pase de colisiones final de `computeLayout`, para no
    // deshacer con un empujón la alineación que decidió el layering.
    backboneIds,
  };
}

/**
 * Empaqueta varios componentes desconectados.
 * Ordena por área descendente y reparte en 2 columnas equilibrando altura.
 *
 * Limitación conocida (H14): son 2 columnas fijas, así que con 5+
 * componentes todo crece hacia abajo sin aprovechar el ancho.
 */
export function packComponents(compResults) {
  const newPositions = new Map();
  const COL_GAP = 220;

  compResults.sort((a, b) => {
    const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
    const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
    return areaB - areaA;
  });

  let col0MaxW = 0, col1MaxW = 0;
  let col0Y = 150, col1Y = 150;
  const assignments = [];

  for (const cr of compResults) {
    const w = cr.maxX - cr.minX || 200;
    const h = cr.maxY - cr.minY || 0;
    const col = col1Y <= col0Y ? 1 : 0;
    if (col === 0) { col0MaxW = Math.max(col0MaxW, w); col0Y += h + COMP_PAD; }
    else           { col1MaxW = Math.max(col1MaxW, w); col1Y += h + COMP_PAD; }
    assignments.push({ cr, col });
  }

  const col0CX = CANVAS_CX - col1MaxW / 2 - COL_GAP / 2;
  const col1CX = CANVAS_CX + col0MaxW / 2 + COL_GAP / 2;
  let col0PackY = 150, col1PackY = 150;

  for (const { cr, col } of assignments) {
    const h       = cr.maxY - cr.minY || 0;
    const w       = cr.maxX - cr.minX || 0;
    const colCX   = col === 0 ? col0CX : col1CX;
    const packY   = col === 0 ? col0PackY : col1PackY;
    const offsetX = Math.round(colCX - (cr.minX + w / 2));
    const offsetY = Math.round(packY - cr.minY);
    for (const [id, pos] of cr.positions) {
      newPositions.set(id, { x: pos.x + offsetX, y: pos.y + offsetY });
    }
    if (col === 0) col0PackY += h + COMP_PAD;
    else           col1PackY += h + COMP_PAD;
  }
  return newPositions;
}

export { CANVAS_CX, CANVAS_CY };

// src/app/layout/geometry.js
//
// Distancias, separaciones y geometría pura del motor de layout.
//
// Todo lo que responde "¿cuánto espacio ocupa esto?" o "¿estos dos se
// pisan?" vive aquí. Nada de este módulo sabe qué es un router.

// ─── Caja real del nodo ──────────────────────────────────────────────────
//
// Medida contra el DOM, no supuesta. `.node` es `width: 86px` fijo y su
// etiqueta es `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`
// (style.css, sección "Nodos"), así que un nombre largo se recorta con
// puntos suspensivos: NO desborda. El nodo es una caja constante.
//
// Alto ≈ 8.8 (padding) + 13.8 (etiqueta) + 4.8 + 48 (icono) + 4.8 + 11.5
//        (IP) + 4.8 + 7 (indicadores) + 8 (padding) ≈ 111.5.
//
// `hitTest.getNodeBox()` usa 90×112 — los mismos números con 4px de holgura
// horizontal. Es la fuente única: la colisión del motor y la del arrastre
// manual miden contra esta caja, no contra un radio aproximado.
export const NODE_W = 90;
export const NODE_H = 112;

// Nota sobre dos constantes retiradas: `LABEL_PADDING = 45` y
// `EDGE_LABEL_PADDING = 28` se exportaban sin que nadie las usara. La
// primera reservaba espacio para un desbordamiento de etiqueta que el CSS
// hace imposible. No volver a añadirlas sin medir antes.

// ─── Separación mínima: cajas, no círculos ───────────────────────────────
//
// Esto era un radio único de 110px entre centros. Un círculo no describe un
// nodo de 90×112, y el error iba en las dos direcciones:
//
//   • Dos nodos en diagonal a dx=80, dy=80 quedan a 113px de distancia. El
//     modelo circular los daba por separados aunque sus cajas se solapan en
//     ambos ejes — el solape que de verdad se ve en pantalla.
//   • Dos nodos en fila a 100px se empujaban sin necesidad, cuando a esa
//     distancia sus cajas ya tienen 10px de aire.
//
// La regla ahora es la que se ve: dos cajas no se tocan. Eso además cierra
// H8 de la auditoría (dos nodos apilados a 110 se solapaban 2px), porque la
// separación vertical mínima ya no puede ser menor que el alto real.
export const NODE_MARGIN = 8;                     // aire mínimo entre cajas
export const MIN_GAP_X   = NODE_W + NODE_MARGIN;  //  98
export const MIN_GAP_Y   = NODE_H + NODE_MARGIN;  // 120

// Holgura para no pelear con el redondeo: un solape menor que esto no lo ve
// nadie y perseguirlo haría que el resolvedor no convergiera nunca.
export const OVERLAP_EPS = 0.5;

export const MIN_CLUSTER_GAP    = 52;  // margen entre cajas de grupos distintos
export const MAX_COLLISION_ITER =  35;
export const GRID_SIZE          =  20;  // rejilla de ajuste final

// ─── Separaciones del backbone y de los grupos ───────────────────────────
//
// Estas son de composición, no de corrección: el suelo duro lo ponen
// MIN_GAP_X/MIN_GAP_Y, y bajar de ahí no sirve de nada porque el pase de
// colisiones lo deshace. Se apretaron en dos pasadas —la calibración
// original dejaba 103px de aire entre niveles para una caja de 112 de
// alto, casi el doble de lo que el dibujo pedía.
//
// El aire real entre dos cajas es `separación − alto/ancho de caja`. El
// límite de abajo no es el solape sino la ETIQUETA del enlace, que mide
// 16px de alto y vive en el punto medio: por debajo de ~145 de BASE_VGAP
// la etiqueta empieza a tocar las cajas. 148 deja 36px de aire, que es el
// mínimo con el que el dato todavía se lee.
export const BASE_HGAP       = 120;  // entre nodos backbone del mismo nivel
export const BASE_VGAP       = 148;  // entre niveles (36px de aire)
export const COMP_PAD        = 132;  // entre componentes desconectados
export const PARK_MARGIN     =  66;  // sobre la franja de nodos aislados
export const GROUP_HGAP      = 102;  // dentro de un grupo
// Entre filas de un grupo. Igual a MIN_GAP_Y a propósito: una matriz nace ya
// libre de solapes, así que el resolvedor no tiene que desarmarla para
// arreglarla. Era 115, que dejaba las filas 5px dentro del solape.
export const GROUP_VGAP      = MIN_GAP_Y;
export const GROUP_BELOW_GAP = 128;  // del ancla a la primera fila del grupo
export const SIDE_OFFSET     = 110;  // del ancla al borde de un grupo lateral
export const ORGANIC_PULL    = 0.40; // arrastre de un nivel de un solo nodo

/**
 * Separación horizontal adaptada a la etiqueta más larga del nivel.
 * La etiqueta se recorta a 86px, pero el texto sigue pidiendo aire visual.
 * El término por carácter también se apretó: con 7px por letra un nivel de
 * nombres largos abría el diagrama muy por encima de lo que la caja pide.
 */
export function adaptiveHGap(ids, nodeMap) {
  const maxLen = Math.max(...ids.map(id => (nodeMap.get(id)?.label?.length || 4)));
  return Math.max(BASE_HGAP, 42 + maxLen * 5.5);
}

// ─── Primitivas de segmento ──────────────────────────────────────────────

/** ¿Se cruzan dos segmentos, sin contar los extremos? */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-8) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/** Distancia de un punto al segmento AB. */
export function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ─── Resolución de colisiones ────────────────────────────────────────────

/**
 * Cuánto se meten dos cajas la una en la otra, por eje. Un valor ≤ 0 en
 * cualquiera de los dos significa que no se tocan: a las cajas les basta
 * estar separadas en UN eje.
 *
 * @returns {{ox:number, oy:number}} penetración en px (positiva = solape)
 */
export function boxPenetration(pa, pb) {
  return {
    ox: MIN_GAP_X - Math.abs(pb.x - pa.x),
    oy: MIN_GAP_Y - Math.abs(pb.y - pa.y),
  };
}

/** ¿Se solapan las cajas de estos dos nodos? */
export function boxesOverlap(pa, pb) {
  const { ox, oy } = boxPenetration(pa, pb);
  return ox > OVERLAP_EPS && oy > OVERLAP_EPS;
}

/**
 * Separa las cajas que se solapan, empujando por el eje de menor
 * penetración: el camino más corto para dejar de solaparse.
 *
 * Ese detalle es lo que respeta la composición. El empuje radial anterior
 * movía en diagonal, así que arreglar un solape dentro de una fila la
 * dejaba escalonada. Empujando por el eje corto, una fila se separa a lo
 * largo de la fila y sigue siendo una fila.
 *
 * `fixedIds` no se mueve nunca: en el motor son los nodos del backbone,
 * cuya posición la decidió el layering; en el arrastre manual es el nodo
 * que el usuario acaba de soltar. Es el mismo concepto y por eso es la
 * misma función — antes `positionManager` tenía su propia copia con otra
 * distancia (85), y un diagrama organizado y uno ajustado a mano obedecían
 * a nociones distintas de "demasiado cerca".
 *
 * `quantum` redondea cada empujón hacia arriba a un múltiplo suyo. Sirve
 * para el pase que corre DESPUÉS del ajuste a la rejilla: si las posiciones
 * ya están en la rejilla y los desplazamientos también, el resultado sigue
 * en la rejilla y no hace falta volver a ajustarlo — que es justo lo que
 * volvía a juntar los pares recién separados.
 *
 * @param {Map<string,{x:number,y:number}>} positions - se modifica in situ
 * @param {Set<string>} [fixedIds]
 * @param {number} [maxIter]
 * @param {number} [quantum] - 0 = desplazamiento libre
 */
export function resolveCollisions(positions, fixedIds = new Set(), maxIter = MAX_COLLISION_ITER, quantum = 0) {
  const cuantizar = v => (quantum > 0 ? Math.ceil(v / quantum) * quantum : v);
  // Orden canónico, no de inserción. El empuje de un par mueve a los dos,
  // así que con tres nodos en conflicto el resultado depende del orden en
  // que se visiten — y el de inserción lo hereda del array `links` del
  // JSON. Ordenar por id hace que el mismo grafo dé el mismo resultado,
  // esté escrito como esté.
  const ids = [...positions.keys()].sort();

  for (let iter = 0; iter < maxIter; iter++) {
    let anyMove = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ia = ids[i], ib = ids[j];
        const fa = fixedIds.has(ia), fb = fixedIds.has(ib);
        if (fa && fb) continue;               // ninguno puede ceder

        const pa = positions.get(ia), pb = positions.get(ib);
        const { ox, oy } = boxPenetration(pa, pb);
        if (ox <= OVERLAP_EPS || oy <= OVERLAP_EPS) continue;

        anyMove = true;
        // Reparto: si uno está fijo, el otro se lleva el desplazamiento
        // entero; si los dos son libres, mitad y mitad.
        const push = ox < oy ? ox : oy;
        const sa = fa ? 0 : cuantizar(fb ? push : push / 2);
        const sb = fb ? 0 : cuantizar(fa ? push : push / 2);

        if (ox < oy) {
          // Coincidencia exacta en X: `ids` está ordenado, así que el
          // primero va siempre a la izquierda. Determinista.
          const dir = pb.x > pa.x ? 1 : pb.x < pa.x ? -1 : 1;
          positions.set(ia, { x: pa.x - dir * sa, y: pa.y });
          positions.set(ib, { x: pb.x + dir * sb, y: pb.y });
        } else {
          const dir = pb.y > pa.y ? 1 : pb.y < pa.y ? -1 : 1;
          positions.set(ia, { x: pa.x, y: pa.y - dir * sa });
          positions.set(ib, { x: pb.x, y: pb.y + dir * sb });
        }
      }
    }
    if (!anyMove) break;
  }

  for (const [id, p] of positions) {
    positions.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  }
}

/**
 * Fotografía qué nodos comparten fila antes de resolver colisiones.
 * Solo interesan los grupos: el backbone está fijo y no lo desarma nadie.
 *
 * @param {Map<string,{x:number,y:number}>} positions
 * @param {Iterable<string>} ids - nodos agrupados
 * @returns {string[][]} filas de 2 o más nodos, en orden canónico
 */
export function snapshotRows(positions, ids) {
  const rows = new Map();
  for (const id of ids) {
    const p = positions.get(id);
    if (!p) continue;
    if (!rows.has(p.y)) rows.set(p.y, []);
    rows.get(p.y).push(id);
  }
  return [...rows.keys()].sort((a, b) => a - b)
    .map(y => rows.get(y).sort())
    .filter(r => r.length > 1);
}

/** ¿Alguno de estos nodos se solapa con algo del dibujo? */
function overlapsAnything(positions, ids) {
  for (const id of ids) {
    const p = positions.get(id);
    for (const [other, q] of positions) {
      if (other === id) continue;
      if (boxesOverlap(p, q)) return true;
    }
  }
  return false;
}

/**
 * Devuelve cada fila a una `y` común tras el empuje.
 *
 * El resolvedor solo sabe de pares, así que puede dejar una matriz con una
 * fila escalonada 6px — matemáticamente correcta y visualmente rota. Esto
 * la vuelve a alinear, pero solo si al hacerlo no reaparece un solape: la
 * corrección nunca puede costar más de lo que arregla.
 *
 * @param {Map<string,{x:number,y:number}>} positions - se modifica in situ
 * @param {string[][]} rows - salida de `snapshotRows`
 * @param {Set<string>} [fixedIds]
 */
export function realignRows(positions, rows, fixedIds = new Set()) {
  for (const row of rows) {
    const movable = row.filter(id => !fixedIds.has(id) && positions.has(id));
    if (movable.length < 2) continue;

    const targetY = Math.round(
      movable.reduce((s, id) => s + positions.get(id).y, 0) / movable.length
    );
    const previo = new Map();
    let algoCambia = false;
    for (const id of movable) {
      const p = positions.get(id);
      previo.set(id, p);
      if (p.y !== targetY) algoCambia = true;
      positions.set(id, { x: p.x, y: targetY });
    }
    if (!algoCambia) continue;

    if (overlapsAnything(positions, movable)) {
      for (const [id, p] of previo) positions.set(id, p);
    }
  }
}

/** Caja envolvente de un conjunto de posiciones. */
export function boundingBox(positions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

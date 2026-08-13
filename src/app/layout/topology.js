// src/app/layout/topology.js
//
// Comprensión de la red, antes de dibujar nada.
//
// Este módulo responde dos preguntas distintas, y conviene no confundirlas:
//
//   • ¿QUÉ ES este nodo?      → inferRole / inferZone. Decide si es
//     infraestructura o punto final, y cómo se acomodan sus hojas.
//   • ¿DÓNDE VA en la red?    → assignLayers. Decide su altura.
//
// La segunda pregunta la respondía `ROLE_TIER` hasta la v3, y de ahí salían
// los firewalls en serie dibujados como si fueran redundantes: el nivel era
// una constante del tipo de dispositivo, no su lugar en el recorrido.

// ─── Rol → nivel de referencia ───────────────────────────────────────────
//
// Ya NO decide la posición vertical. Se conserva para dos cosas:
//   1. separar backbone (≤5) de hoja (>5);
//   2. elegir la raíz de un componente, como orden de preferencia.
export const ROLE_TIER = {
  "wan":           0,
  "security-edge": 1,
  "edge-routing":  2,
  "core":          3,
  "distribution":  4,
  "access":        5,
  "wireless":      6,
  "service":       6,
  "endpoint":      7,
};

/** Un nodo es backbone cuando su rol lo pone en la espina de infraestructura. */
export function isBackboneRole(role) {
  return (ROLE_TIER[role] ?? 7) <= 5;
}

// ─── Utilidades ──────────────────────────────────────────────────────────

/**
 * Orden natural por etiqueta: PC1 < PC2 < PC10, y las familias no se
 * entremezclan (App-01, App-02, DB-01, DB-02 y no App-01, DB-01, App-02).
 *
 * Compara PRIMERO el prefijo y después el número. La versión anterior solo
 * miraba el sufijo numérico, así que "App-01" y "DB-01" empataban en 1 y el
 * desempate lo ponía el orden del array del JSON — el mismo grafo escrito
 * de otra forma daba otro dibujo.
 *
 * Es un orden total: el último desempate compara la etiqueta completa.
 */
export function sortByLabel(ids, nodeMap) {
  const clave = id => {
    const l = nodeMap.get(id)?.label || "";
    const m = l.match(/^(.*?)(\d+)\s*$/);
    return m ? { pre: m[1], num: parseInt(m[2], 10), raw: l }
             : { pre: l,    num: null,               raw: l };
  };
  return [...ids].sort((a, b) => {
    const ka = clave(a), kb = clave(b);
    const c = ka.pre.localeCompare(kb.pre);
    if (c !== 0) return c;
    if (ka.num !== null && kb.num !== null && ka.num !== kb.num) return ka.num - kb.num;
    if (ka.num === null && kb.num !== null) return 1;
    if (ka.num !== null && kb.num === null) return -1;
    return ka.raw.localeCompare(kb.raw);
  });
}

/** Lista de adyacencia + índice de nodos por id. */
export function buildAdj(nodes, links) {
  const adj     = new Map();
  const nodeMap = new Map();
  for (const n of nodes) { adj.set(n.id, []); nodeMap.set(n.id, n); }
  for (const l of links) {
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);
  }
  return { adj, nodeMap };
}

// ─── Clasificación de rol ────────────────────────────────────────────────
export function inferRole(node, adj, nodeMap) {
  const nbs    = (adj.get(node.id) || []).map(id => nodeMap.get(id)).filter(Boolean);
  const degree = nbs.length;
  if (degree === 0) return "isolated";

  switch (node.type) {
    case "cloud":    return "wan";
    case "firewall": return "security-edge";

    case "router": {
      const hasWAN = nbs.some(n => n.type === "cloud" || n.type === "firewall");
      if (hasWAN) return "edge-routing";
      return nbs.some(n => n.type === "switch") ? "core" : "distribution";
    }

    case "switch": {
      const switchNbs = nbs.filter(n => n.type === "switch");
      const infraNbs  = nbs.filter(n => ["router","firewall","cloud"].includes(n.type));
      if (switchNbs.length >= 2) return "core";
      if (switchNbs.length >= 1 && infraNbs.length >= 1) return "core";
      if (infraNbs.length >= 1 || switchNbs.length >= 1) return "distribution";
      return "access";
    }

    case "ap":     return "wireless";
    case "server": return degree >= 2 ? "service" : "endpoint";
    default:       return "endpoint";
  }
}

/**
 * Zona de un servidor: "dmz" si cuelga de un firewall, "services" si no.
 * Da a los servidores una zona visual propia junto a su ancla.
 */
export function inferZone(node, adj, nodeMap) {
  if (node.type !== "server") return null;
  const nbs = (adj.get(node.id) || []).map(id => nodeMap.get(id)).filter(Boolean);
  return nbs.some(n => n.type === "firewall") ? "dmz" : "services";
}

// ─── Componentes conexos ─────────────────────────────────────────────────
export function detectComponents(nodes, adj) {
  const visited    = new Set();
  const components = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp = [];
    const q    = [n.id];
    visited.add(n.id);
    while (q.length) {
      const cur = q.shift();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    components.push(comp);
  }
  return components;
}

// ─── Redundancia por topología ───────────────────────────────────────────
//
// La versión anterior exigía que las dos etiquetas compartieran raíz tras
// quitar el sufijo (`FW1`/`FW2` sí, `FW-Principal`/`FW-Respaldo` no), con lo
// que un par de alta disponibilidad de manual se le escapaba por cómo lo
// hubiera nombrado el usuario. Ahora la pregunta es topológica y el nombre
// no interviene.

/**
 * Dos nodos son paralelos cuando ocupan el mismo lugar en la red: mismo
 * tipo, mismos vecinos exactos, y sin enlace entre ellos.
 *
 * Las tres condiciones importan:
 *   • adyacentes ⇒ están en SECUENCIA, no en paralelo. Es justo el error
 *     que dibujaba dos firewalls en serie como si fueran una pareja.
 *   • grado < 2 ⇒ una hoja colgando de un solo padre no es redundante;
 *     esto es lo que descarta "dos PC en el mismo switch".
 *   • vecindarios idénticos ⇒ lo que hace de un par algo intercambiable.
 */
export function isParallelPair(idA, idB, adj, nodeMap) {
  const a = nodeMap.get(idA), b = nodeMap.get(idB);
  if (!a || !b || a.type !== b.type) return false;

  const na = new Set(adj.get(idA) || []);
  const nb = new Set(adj.get(idB) || []);

  if (na.has(idB) || nb.has(idA)) return false;   // secuencia, no paralelo
  if (na.size < 2 || nb.size < 2) return false;   // hoja de un solo padre
  if (na.size !== nb.size) return false;
  for (const x of na) if (!nb.has(x)) return false;
  return true;
}

/** Grupo de 2 o 4 nodos que forma un clúster redundante. */
export function isRedundantGroup(ids, adj, nodeMap) {
  if (ids.length === 2) return isParallelPair(ids[0], ids[1], adj, nodeMap);
  if (ids.length === 4) {
    let pares = 0;
    for (let i = 0; i < ids.length - 1; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (isParallelPair(ids[i], ids[j], adj, nodeMap)) pares++;
      }
    }
    return pares >= 3;
  }
  return false;
}

// ─── Niveles topológicos ─────────────────────────────────────────────────
//
// El corazón del motor, y lo que la v3 no tenía.
//
// Hasta ahora la altura de un nodo salía de `ROLE_TIER[rol]`: una constante
// del TIPO de dispositivo. Por eso dos firewalls separados por dos switches
// caían a la misma altura, un anillo colapsaba a una fila recta y la
// detección de redundancia tenía que apoyarse en los nombres.
//
// El pipeline correcto —y el que Pretty ya tenía a medias, porque el
// ordenamiento por baricentro y la asignación de coordenadas ya estaban— es
// el de un grafo por capas:
//
//   1. elegir raíz
//   2. romper ciclos
//   3. asignar capas         ← la pieza que faltaba
//   4. ordenar dentro de capa  (barycenterOrder, ya existía)
//   5. asignar coordenadas     (ya existía)
//
// Dos propiedades salen gratis de hacerlo bien:
//
//   • Dos nodos de infraestructura conectados en serie NO PUEDEN compartir
//     capa. Es la regla que antes había que perseguir con excepciones.
//   • Un par redundante converge en la misma capa por construcción, sin
//     mirar cómo se llame.

/** Excentricidad de cada nodo: a qué distancia queda el más lejano. */
function eccentricities(ids, adj, spine) {
  const ecc = new Map();
  for (const origen of ids) {
    const dist = new Map([[origen, 0]]);
    const cola = [origen];
    let max = 0;
    while (cola.length) {
      const cur = cola.shift();
      for (const nb of (adj.get(cur) || [])) {
        if (!spine.has(nb) || dist.has(nb)) continue;
        const d = dist.get(cur) + 1;
        dist.set(nb, d);
        if (d > max) max = d;
        cola.push(nb);
      }
    }
    ecc.set(origen, max);
  }
  return ecc;
}

// Hasta qué nivel de rol se considera un ancla fiable.
//
// `wan`, `security-edge` y `edge-routing` se ganan a partir de tipos de
// dispositivo inequívocos: una nube ES la salida, un firewall ES el borde,
// y un router vecino de cualquiera de los dos ES el enrutador de borde.
// De `core` hacia abajo el rol lo decide un conteo de vecinos que no
// distingue un router de proveedor de un switch de planta, así que a
// partir de ahí manda la topología.
const TIER_ANCLA_FIABLE = 2;

/**
 * Elige el nodo raíz de una espina: por dónde empieza a leerse la red.
 *
 * En orden:
 *
 *   1. Si existe un ancla fiable (nube, firewall, router de borde), la raíz
 *      sale de ahí. Es el criterio del propio documento: "la conexión desde
 *      Internet, WAN o cloud" antes que nada.
 *   2. Menos hojas colgando. Un dispositivo de borde no tiene equipos
 *      finales debajo; un switch de acceso sí. Es lo que separa los dos
 *      extremos de una topología sin nube: los routers de proveedor no
 *      tienen PC colgando, los switches de piso sí.
 *   3. Mayor excentricidad. Entre nodos igual de "altos", la raíz es el que
 *      ve la red más profunda: un extremo, no el centro.
 *   4. Menor ROLE_TIER y luego etiqueta, como desempates.
 *
 * El orden entre 2 y 3 importa y costó dos intentos. Con la excentricidad
 * primero, un router en L3 con dos switches de VLAN colgando —donde el
 * router es el CENTRO de la estrella y los switches los extremos— acababa
 * dibujado debajo de las PC.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.hasInfra=true] - si el componente tiene
 *        infraestructura reconocible. Cuando no la tiene no hay recorrido
 *        que leer, manda la forma, y la forma de una estrella la define su
 *        centro: ahí gana el grado.
 */
export function pickRoot(ids, roles, adj, nodeMap, { hasInfra = true } = {}) {
  const orden = sortByLabel(ids, nodeMap);
  if (orden.length === 0) return null;
  if (orden.length === 1) return orden[0];

  if (!hasInfra) {
    let mejor = orden[0];
    for (const id of orden) {
      if ((adj.get(id) || []).length > (adj.get(mejor) || []).length) mejor = id;
    }
    return mejor;
  }

  const spine  = new Set(ids);
  const tierDe = id => ROLE_TIER[roles.get(id)] ?? 7;

  // 1. Anclas fiables, si las hay.
  const minTier = Math.min(...orden.map(tierDe));
  const candidatos = minTier <= TIER_ANCLA_FIABLE
    ? orden.filter(id => tierDe(id) === minTier)
    : orden;
  if (candidatos.length === 1) return candidatos[0];

  // Guarda de coste: la excentricidad es O(V·(V+E)). Con espinas enormes se
  // omite; las topologías de clase no llegan ahí.
  const ecc = ids.length <= 300 ? eccentricities(ids, adj, spine) : new Map();
  const hojas = id => (adj.get(id) || []).filter(nb => !spine.has(nb)).length;

  const clave = id => [hojas(id), -(ecc.get(id) ?? 0), tierDe(id)];

  let mejor = candidatos[0], mejorClave = clave(mejor);
  for (const id of candidatos.slice(1)) {
    const k = clave(id);
    for (let i = 0; i < k.length; i++) {
      if (k[i] < mejorClave[i]) { mejor = id; mejorClave = k; break; }
      if (k[i] > mejorClave[i]) break;
    }
  }
  return mejor;
}

/**
 * Capas de una espina, por camino más largo sobre el grafo sin ciclos.
 *
 * Los ciclos se rompen por nivel de BFS: cada arista se orienta del nivel
 * menor al mayor, y las aristas dentro de un mismo nivel —las que cierran
 * un ciclo— se descartan del cálculo. Orientar así siempre da un DAG, y el
 * orden de BFS es un orden topológico válido para recorrerlo.
 *
 * El camino más largo, y no la distancia BFS, es lo que garantiza que una
 * arista nunca quede horizontal: `capa(v) = 1 + max(capa(u))` sobre todos
 * los predecesores.
 *
 * @param {{spineIds:string[], adj:Map, nodeMap:Map, roles:Map}} args
 * @returns {{layers:Map<string,number>, preds:Map<string,Set>, succs:Map<string,Set>, root:string|null}}
 */
export function computeLayers({ spineIds, adj, nodeMap, roles, hasInfra = true }) {
  const spine  = new Set(spineIds);
  const layers = new Map();
  const preds  = new Map();
  const succs  = new Map();
  for (const id of spineIds) { preds.set(id, new Set()); succs.set(id, new Set()); }

  const root = pickRoot(spineIds, roles, adj, nodeMap, { hasInfra });
  if (root == null) return { layers, preds, succs, root: null };

  // Vecinos dentro de la espina, en orden canónico: el recorrido no puede
  // depender de cómo esté escrito el array de enlaces.
  const vecinos = id => sortByLabel(
    (adj.get(id) || []).filter(nb => spine.has(nb) && nb !== id),
    nodeMap
  );

  // 1. Niveles de BFS — solo para orientar las aristas.
  const bfs = new Map([[root, 0]]);
  const cola = [root];
  while (cola.length) {
    const cur = cola.shift();
    for (const nb of vecinos(cur)) {
      if (!bfs.has(nb)) { bfs.set(nb, bfs.get(cur) + 1); cola.push(nb); }
    }
  }

  // 2. Orientar. Las aristas del mismo nivel cierran un ciclo y se descartan.
  const alcanzados = [...bfs.keys()].sort((a, b) => bfs.get(a) - bfs.get(b) ||
                                                    String(a).localeCompare(String(b)));
  for (const u of alcanzados) {
    for (const v of vecinos(u)) {
      if (!bfs.has(v)) continue;
      if (bfs.get(u) < bfs.get(v)) { succs.get(u).add(v); preds.get(v).add(u); }
    }
  }

  // 3. Camino más largo, recorriendo en orden de BFS (orden topológico válido).
  for (const id of alcanzados) {
    let capa = 0;
    for (const p of preds.get(id)) capa = Math.max(capa, (layers.get(p) ?? 0) + 1);
    layers.set(id, capa);
  }

  // 4. Nodos de la espina que no cuelgan del mismo árbol —alcanzables solo
  //    a través de una hoja, como un servidor con dos padres haciendo de
  //    puente—. Se enganchan un nivel por debajo del vecino más alto que ya
  //    tenga capa, iterando hasta que no quede ninguno.
  const sueltos = spineIds.filter(id => !layers.has(id));
  if (sueltos.length > 0) {
    let pendientes = sortByLabel(sueltos, nodeMap);
    let progreso = true;
    while (pendientes.length > 0 && progreso) {
      progreso = false;
      const siguiente = [];
      for (const id of pendientes) {
        const conCapa = (adj.get(id) || [])
          .filter(nb => layers.has(nb))
          .map(nb => layers.get(nb));
        if (conCapa.length > 0) {
          layers.set(id, Math.min(...conCapa) + 1);
          progreso = true;
        } else {
          siguiente.push(id);
        }
      }
      pendientes = siguiente;
    }
    // Sin ningún anclaje posible: al nivel de la raíz.
    for (const id of pendientes) layers.set(id, 0);
  }

  // 5. Igualar hermanos paralelos.
  //
  // El recorrido parte de UNA raíz, y eso desnivela a los nodos que
  // deberían ser fuentes gemelas: con dos proveedores de Internet
  // colgando del mismo router de borde, el primero queda en la capa 0 y el
  // segundo dos por debajo, al lado del switch de núcleo, como si fuera
  // parte de la red interna.
  //
  // Dos nodos de la espina con el MISMO tipo y EXACTAMENTE los mismos
  // vecinos dentro de la espina ocupan el mismo lugar en la red: se
  // igualan a la menor de sus capas.
  //
  // Bajar una capa nunca rompe nada: los sucesores toman el máximo de sus
  // predecesores, así que no se mueven, y cualquier arista que quedara
  // apuntando hacia arriba ya lo hacía para el gemelo, que tiene el mismo
  // vecindario por definición.
  const firmas = new Map();
  for (const id of sortByLabel(spineIds, nodeMap)) {
    const vs = (adj.get(id) || []).filter(nb => spine.has(nb) && nb !== id).sort();
    if (vs.length === 0) continue;
    const firma = `${nodeMap.get(id)?.type}|${vs.join(",")}`;
    if (!firmas.has(firma)) firmas.set(firma, []);
    firmas.get(firma).push(id);
  }
  for (const grupo of firmas.values()) {
    if (grupo.length < 2) continue;
    const min = Math.min(...grupo.map(id => layers.get(id) ?? 0));
    for (const id of grupo) layers.set(id, min);
  }

  return { layers, preds, succs, root };
}

/**
 * La ruta principal: la columna vertebral que explica el diagrama.
 *
 * Desde la raíz se sigue siempre el sucesor que lleva a más red. Es lo que
 * distingue una CONTINUACIÓN del backbone de una rama que muere: en el caso
 * DMZ, del switch de la zona desmilitarizada cuelgan un servidor de correo,
 * uno web y el firewall interno. Los dos servidores terminan ahí; el
 * firewall sigue hacia el switch de la LAN y tres equipos más. La ruta
 * principal es la que pasa por el firewall.
 *
 * El criterio, tomado del documento: más dispositivos finales debajo,
 * luego más infraestructura debajo, y la etiqueta como desempate.
 *
 * Se usa para dos cosas: anclar en X los nodos de la ruta, y elegir por
 * dónde plegar el diagrama cuando crece demasiado a lo alto.
 *
 * @returns {string[]} ids en orden, desde la raíz
 */
export function findMainPath({ layers, succs, root, spineIds, adj, nodeMap }) {
  if (root == null || !spineIds?.length) return [];
  const spine = new Set(spineIds);
  const hojasPropias = id => (adj.get(id) || []).filter(nb => !spine.has(nb)).length;

  // Descendientes de cada nodo, recorriendo de la capa más profunda a la
  // más alta. Se guardan como conjunto y no como cuenta: en un rombo, dos
  // ramas comparten descendientes y sumarlos los contaría dos veces.
  const porCapaDesc = [...spineIds].sort(
    (a, b) => (layers.get(b) ?? 0) - (layers.get(a) ?? 0)
  );
  const desc = new Map();
  for (const id of porCapaDesc) {
    const s = new Set();
    for (const su of (succs.get(id) || [])) {
      s.add(su);
      for (const d of (desc.get(su) || [])) s.add(d);
    }
    desc.set(id, s);
  }

  const hojasDebajo = id => {
    let n = hojasPropias(id);
    for (const d of desc.get(id) || []) n += hojasPropias(d);
    return n;
  };

  const camino = [root];
  const visto  = new Set([root]);
  let cur = root;
  while (true) {
    const sus = sortByLabel(
      [...(succs.get(cur) || [])].filter(s => !visto.has(s)),
      nodeMap
    );
    if (sus.length === 0) break;
    let mejor = sus[0];
    let mejorClave = [hojasDebajo(mejor), desc.get(mejor)?.size ?? 0];
    for (const s of sus.slice(1)) {
      const k = [hojasDebajo(s), desc.get(s)?.size ?? 0];
      if (k[0] > mejorClave[0] || (k[0] === mejorClave[0] && k[1] > mejorClave[1])) {
        mejor = s; mejorClave = k;
      }
    }
    camino.push(mejor);
    visto.add(mejor);
    cur = mejor;
  }
  return camino;
}

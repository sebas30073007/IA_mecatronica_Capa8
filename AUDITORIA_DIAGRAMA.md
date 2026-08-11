# Auditoría Técnica del Sistema de Diagramación — CAPA8

## 1. Portada

| Campo | Valor |
|---|---|
| Auditoría | Sistema de diagramación de topologías de red — énfasis en Pretty (auto-layout) |
| Fecha | 2026-08-04 |
| Rama analizada | `main` |
| Commit | `66d3399` — "navbar update" (HEAD al iniciar la auditoría) |
| Ubicación del archivo | Raíz del repositorio (`AUDITORIA_DIAGRAMA.md`) — no existía carpeta de auditorías/docs técnicas previa |
| Cambios realizados en el código | Ninguno. Solo se creó este archivo. Ver §21 para el estado final de git. |

**Alcance cubierto**: `src/app/prettyLayout.js`, `src/render/renderer.js`, `src/render/hitTest.js`, `src/app/main.js` (drag/pointer/MOVE_NODE), `src/app/positionManager.js`, `src/app/reducer.js`, `src/core/store.js`, `src/core/history.js`, `src/model/schema.js`, `src/model/graph.js`, `src/persistence/urlCodec.js`, `src/persistence/fileIO.js`, `style.css` (dimensiones reales de `.node`), `src/examples/dmz.json` (caso de referencia "DMZ con Doble Firewall"), y la suite `tests/*.test.js`.

**Limitaciones de esta auditoría**:
- No se abrió el sitio desplegado ni se hizo QA visual en navegador real; el análisis del renderer se basa en lectura de código SVG/DOM y en geometría calculada, no en capturas de pantalla.
- No existen tests automatizados de `prettyLayout.js` en el repo (`tests/` no tiene ningún `*.test.js` para diagramas). Toda la verificación de comportamiento de Pretty en esta auditoría se hizo con **scripts de sondeo temporales** (`node --experimental` ESM imports directos de `prettyLayout.js`), ejecutados fuera del repositorio (carpeta scratchpad de la sesión) y **no se dejaron como archivos del proyecto**.
- La matriz de 25 casos (§18) fue verificada empíricamente para ~12 escenarios representativos (documentados con evidencia real de posiciones/tiempos); el resto se deriva analíticamente del código reconstruido y se marca explícitamente como "inferido" en vez de "verificado".
- No se auditó `advancedModal.js`, `terminalPanel.js`, `chatPanel.js`, `menuBar.js` salvo en los puntos donde invocan Pretty o el drag de nodos.

---

## 2. Resumen ejecutivo

**Estado general**: Pretty v3 es un motor de layout artesanal, bien comentado y con una arquitectura de 10 fases razonablemente clara. Es **determinista e idempotente** en los casos probados (hallazgo positivo, poco común en este tipo de heurísticas). Sin embargo, su modelo mental — "todo es un árbol jerárquico por tiers de rol" — **se rompe visiblemente ante ciclos, mallas y redundancia de infraestructura sin nombres de imagen específicos**, y **conflacta agresivamente semántica de topología con heurísticas de nombre de nodo**. El sistema de colisión "sentido" por el usuario durante el arrastre manual **no existe como tal**: es un empuje correctivo post-hoc al soltar el mouse, con una constante de distancia distinta a la que usa Pretty. El renderer trata cada `MOVE_NODE` — incluido cada evento de `mousemove` durante un arrastre — como un evento de reducción completo (`JSON.stringify`/`parse` de todo el grafo + reanálisis completo de topología + reconstrucción total del DOM/SVG), lo cual no escala bien más allá de unos pocos cientos de nodos.

**Los cinco hallazgos más importantes**:

1. **H2 (P1)** — Topologías con ciclos (anillos) o mallas completas de dispositivos del mismo tipo colapsan a una única fila horizontal recta, porque el mapeo rol→tier es fijo por tipo/rol y no considera profundidad BFS ni estructura cíclica. El enlace de cierre del anillo se dibuja como una línea larga que cruza visualmente todo el diagrama.
2. **H1 (P1)** — Un doble firewall en serie (el caso de referencia de esta auditoría) se coloca **lado a lado en el mismo tier**, como si fueran redundantes en alta disponibilidad, cuando en realidad son capas secuenciales de defensa en profundidad separadas por dos switches. La causa es que `ROLE_TIER["security-edge"]` es una constante fija, no una función de la distancia real al nodo raíz.
3. **H17 (P1)** — Componentes sin ningún nodo de "backbone" reconocido (p. ej. una estrella compuesta solo de PCs, sin switch) no reciben ningún layout jerárquico: se colocan con un fallback secuencial ingenuo que ancla a todos los vecinos de un mismo nodo al mismo punto candidato, dependiendo enteramente de la resolución de colisiones genérica para separarlos — verificado: una estrella real de 5 PCs se renderiza como una fila recta con el nodo *hub* en un extremo, no como estrella.
4. **H5 (P1)** — Cada `MOVE_NODE` (incluidos los disparados en cada `mousemove` durante un arrastre) ejecuta: `JSON.stringify/parse` completo del estado en el reducer, `analyzeTopology()` completo del grafo, y una reconstrucción total del DOM/SVG (`worldEl.querySelectorAll(".node").forEach(remove)` + recreación de todos los nodos). No hay actualización incremental ni throttling.
5. **H6/H7 (P2)** — La "repulsión magnética" percibida al mover nodos no existe durante el arrastre: solo se aplica al soltar (`mouseup`), y usa una constante de distancia mínima (`COLL_DIST=85`) distinta a la que usa Pretty (`MIN_NODE_GAP=110`), por lo que un layout recién generado por Pretty y un layout ajustado manualmente obedecen a nociones de "demasiado cerca" distintas.

**Riesgo principal**: el acoplamiento entre "nombre del nodo" / "tipo declarado" y "tier visual" hace que el algoritmo sea frágil ante topologías reales de producción (alta disponibilidad, anillos, mallas, servidores multi-homed) — exactamente los casos que un curso de redes quiere enseñar a reconocer. El riesgo no es de crasheo ni de datos corruptos (el JSON del grafo permanece siempre válido), es de **enseñar visualmente lo incorrecto**: un layout que dibuja dos firewalls en serie como si fueran un clúster HA es pedagógicamente contraproducente en una plataforma educativa de redes.

**Principal oportunidad**: separar "tier por rol declarado" de "tier por profundidad BFS real desde la raíz/backbone", lo cual resolvería H1 y mejoraría sustancialmente el caso DMZ sin tocar el resto del pipeline (fase 5 es aislable). Es, además, el cambio de menor riesgo estructural de los identificados (ver §16 Quick wins).

---

## 3. Mapa de arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│ main.js (1030+ líneas) — orquestador de diagrams.html                    │
│  • store = createStore({ initialState, reducer })                        │
│  • store.subscribe(() => { inspector.render, updateStatusBadge,          │
│    updateFabBadge(analyzeTopology), render() })  ← se ejecuta en CADA    │
│    dispatch, incluidos los de arrastre                                   │
│  • mousedown/mousemove/mouseup, touchstart/move/end → dispatch(MOVE_NODE)│
│  • runPretty()/runPrettyNoHistory() → llama prettyLayout.js               │
│  • snapNodesToGrid() → grid manual (SNAP_GRID=150), independiente        │
│  • resolveCollisions(anchorId) → delega a positionManager.js, SOLO en    │
│    mouseup, no en mousemove                                              │
└─────────────────────────────────────────────────────────────────────────┘
         │ dispatch(action)                    │ getState()
         ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────────────┐
│ core/store.js        │◄─────────────┤ core/reducer.js (app/)       │
│ pub-sub simple        │  reducer()   │ deepClone(state) por         │
│                       │              │ JSON.stringify/parse EN CADA │
│                       │              │ dispatch (incl. MOVE_NODE)   │
└─────────────────────┘              └─────────────────────────────┘
         │
         ▼ notifica listeners
┌─────────────────────────────────────────────────────────────────────────┐
│ render/renderer.js — renderStage()                                       │
│  • SVG: recrea TODOS los <line>/<rect>/<text> de enlaces + paquetes      │
│  • DOM: worldEl.querySelectorAll(".node").forEach(remove) y RECREA       │
│    TODOS los <div class="node"> desde cero (no hay diffing)              │
│  • viewBox fijo "0 0 4000 4000" — coordenadas de MUNDO, no de viewport   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ app/prettyLayout.js — prettyLayout({graph, dispatch, ActionTypes, ...})  │
│  10 fases (ver §4) → termina despachando MOVE_NODE por cada nodo que      │
│  cambió de posición (1 dispatch por nodo, no batched)                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ app/positionManager.js — sistema PARALELO de colisión, usado por:        │
│  • main.js al soltar el mouse tras arrastrar un nodo (mouseup)           │
│  • computeFreePosition() al insertar nodos vía acción de IA              │
│  Constantes propias: GRID=130, COLS=5, COLL_DIST=85 (≠ MIN_NODE_GAP=110  │
│  de prettyLayout.js)                                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ render/hitTest.js — getNodeBox(): caja de 90×112 px (rectangular,        │
│  asimétrica), usada SOLO para hit-testing de click, nunca por Pretty ni  │
│  por positionManager (que tratan el nodo como un círculo/punto)          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ persistence/urlCodec.js — Base64(UTF-8(JSON.stringify(graph))) en ?g=    │
│  sin límite de tamaño ni advertencia; fileIO.js — export/import JSON     │
│  con validación de version===3 solo en main.js (no en fileIO mismo)     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Flujo de datos de Pretty** (resumen, detalle en §4):
`graph {nodes, links}` → `buildAdj()` → `inferRole()` por nodo → `detectComponents()` → por componente: `detectSemanticGroups()` + `layoutComponent()` (tiers, barycenter, grupos, colisión, mirror-scoring) → `packComponents()` (si hay >1 componente) → parking de aislados → normalización (`minX/minY ≥ 150`) → snap a grid de 20px → `dispatch(MOVE_NODE)` × nodo movido.

**Flujo de renderizado**: `store.subscribe` → `renderStage()` → reconstruye SVG completo (líneas + labels + paquetes) y DOM completo (divs de nodo) en cada cambio de estado, sin memoización ni virtual-DOM.

---

## 4. Reconstrucción de Pretty

### 4.1 Tabla de fases

| Fase | Funciones | Propósito | Supuestos implícitos | Riesgos |
|---|---|---|---|---|
| 1. Clasificar roles | `inferRole()`, `inferZone()` | Asigna un rol semántico (`wan`, `security-edge`, `core`, `distribution`, `access`, `wireless`, `service`, `endpoint`, `isolated`) por **tipo declarado + vecindario inmediato** (1 salto) | El tipo de nodo (`firewall`, `router`, `switch`...) es suficiente para inferir el rol; el rol no cambia con la profundidad en el grafo | Dos firewalls en serie con roles idénticos (H1); un `server` con 1 solo enlace cae a `endpoint` en vez de `service` (H3) |
| 2. Separar backbone / leaf | `layoutComponent()` (inline) vía `ROLE_TIER[role] ?? 7 <= 5` | Divide nodos del componente en "backbone" (tiers 0-5) y "hoja" (tiers 6-7) | Backbone = infraestructura de red; hoja = usuario final o servicio terminal | Componentes sin ningún nodo de rol ≤5 quedan sin backbone (H17); todo colapsa a hojas "ungrouped" |
| 3. Detectar grupos semánticos | `detectSemanticGroups()`, `extractPrefixGroups()`, `nameStem()` | Agrupa hijos de cada nodo backbone por prefijo de etiqueta (`PC1..PCn`) o por tipo | Etiquetas siguen convención `<prefijo><número>`; ≥3 nodos forman "grupo" (`REPEAT_GROUP_MIN`) | Sensible al separador del nombre (`PC-01` vs `PC_01`, H9); grupos de tamaño 1-2 nunca se etiquetan aunque sean claramente una familia |
| 4. Elegir modo de layout | `chooseLayoutMode()` | Decide entre `grid/arc/fanout/chain/bus-side/pair-lanes` por grupo | El tipo de dispositivo + cantidad predicen la mejor forma visual | Reglas ad-hoc por umbral (`count>=6`, `count>=8`) ajustadas a los ejemplos existentes (posible sobreajuste, ver §6) |
| 5. Colocar backbone | tiers Y fijos + `barycenterOrder()` + 3 pasadas + "organic pull" + "chain-sort" | Posiciona nodos backbone en filas (tiers) con X ajustado por barycenter para minimizar cruces | El orden vertical de tiers (`ROLE_TIER`) siempre refleja la jerarquía real de la topología | **No es cierto en general** — ver H1/H2: el tier es fijo por rol, no por distancia BFS real desde la raíz |
| 6. Asignar lados a grupos | `assignGroupSides()` | Reparte grupos de un mismo ancla entre `below/left/right` | Máximo 3 grupos por ancla caben cómodamente en 3 posiciones | Con >3 grupos, se repite ciclo `left,below,right` sin verificar que no se solapen entre sí ni con otros anclas vecinas |
| 7. Colocar hijos de grupo | `layoutGrid/Arc/Fanout/Chain/BusSide/PairLanes` | Aplica geometría concreta según el modo elegido en fase 4 | Cada función calcula su propio ancho estimado independientemente | `estimateGroupWidth()` es una aproximación separada de la geometría real que cada función produce — pueden divergir |
| 8. Resolución de colisiones | `resolveCollisions()` | Empuja pares de nodos superpuestos (`< MIN_NODE_GAP=110`) hasta 35 iteraciones; nodos backbone fijos | El modelo de círculo de radio 55px es representativo del tamaño visual real | El nodo real es una caja de 90×112px (H8); el push puede romper la alineación de un grupo ya colocado (chain/grid) sin verificarlo después |
| 9. Empaquetar componentes | `packComponents()` | Distribuye componentes desconectados en 2 columnas por altura | 2 columnas son suficientes para cualquier cantidad de componentes | Con ≥5 componentes, todo se apila verticalmente en solo 2 columnas (H14) |
| 10. Normalizar + snap | bloque final en `prettyLayout()` | Desplaza todo para que `minX,minY ≥ 150`; snapea a grid de 20px | El snap de 20px no introduce colisiones nuevas | Snap puede acercar nodos que estaban a distancia segura justo por debajo de `MIN_NODE_GAP` tras redondeo (no verificado post-snap) |

### 4.2 Constantes relevantes (con contraste real)

| Constante | Valor | Usada en | Contraste |
|---|---|---|---|
| `MIN_NODE_GAP` | 110 | Pretty: colisión + scoring | Caja real del nodo (`hitTest.getNodeBox`) es 90×112 → a distancia exacta de 110px vertical, las cajas **se superponen ~2px** (112 > 110) — ver H8 |
| `COLL_DIST` (positionManager.js) | 85 | Colisión post-arrastre manual | 25px **menor** que `MIN_NODE_GAP` — un layout de Pretty "válido" (≥110px) nunca dispara re-separación manual, pero un ajuste manual solo garantiza 85px, menos de lo que Pretty consideraría aceptable — ver H7 |
| `FANOUT_THRESHOLD` | 4 | `renderer.js` (opacidad reducida en enlaces) y `chooseLayoutMode` (activa modo grid) | Comparten la constante correctamente (import cruzado), buen ejemplo de cohesión |
| `MAX_COLLISION_ITER` | 35 | `resolveCollisions()` de Pretty | positionManager usa 12 (o 1 si >60 nodos) — inconsistencia adicional de "cuánto se resuelve" entre los dos sistemas |
| `GRID_SIZE` | 20 (Pretty) vs `SNAP_GRID`=150 (main.js, atajo "S") | Snap a grid — dos sistemas de snap distintos y no relacionados | El snap manual (150px) es 7.5× más grueso que el snap de Pretty (20px); presionar "S" después de Pretty puede reintroducir colisiones que Pretty ya había resuelto |

---

## 5. Auditoría de calidad del layout — evaluación del modelo jerárquico

El modelo "rol declarado → tier fijo" (tabla `ROLE_TIER`, líneas 40-50) asume que toda topología de red es reducible a una jerarquía OSI-like de una sola dimensión vertical. Esto es razonable para el caso canónico *Internet → router → switch → endpoints*, pero se degrada en los siguientes escenarios (✔ verificado empíricamente en esta auditoría, • inferido del código):

| Topología | Encaja en el modelo | Evidencia |
|---|---|---|
| Internet → router → switch → endpoints | ✔ Sí, es el caso de diseño | — |
| DMZ con doble firewall (caso de referencia) | ✘ No — ambos firewalls caen al mismo tier `security-edge=1` pese a estar separados por 2 switches | ✔ Verificado: `fw1(620,400)` y `fw2(780,400)`, mismo Y |
| Estrella simple | ✔ Sí, si hay un switch/router central (backbone reconocido) | ✔ Verificado (estrella de 30 PC bajo 1 switch → filas de grid ordenadas) |
| Estrella compuesta solo por endpoints (sin switch) | ✘ No — colapsa a fila recta con el hub en un extremo | ✔ Verificado (H17) |
| Cadena de switches | ~ Parcial — funciona si el `chain-sort` detecta el patrón de camino en el mismo tier, pero todos caen al mismo tier `core` sin reflejar el orden real de la cadena en Y | ✔ Verificado: anillo de 8 switches → una sola fila horizontal, h=0 |
| Anillo | ✘ No — no hay detección de ciclos; se comporta igual que una cadena de switches pero con un enlace de cierre que cruza toda la fila | ✔ Verificado |
| Malla parcial | ~ Depende de cuántos nodos alcanzan rol backbone; si son todos routers interconectados sin switch, todos caen en `distribution` (mismo tier) → fila recta | • Inferido por extensión directa del caso de malla completa (ver abajo) |
| Malla completa | ✘ No — todos los routers interconectados sin switch caen en el mismo rol `distribution` (`inferRole`: `router` sin `switch` vecino y sin WAN → `distribution`) → una sola fila; con E=O(N²) enlaces, el score de cruces es enorme pero **no cambia la estrategia**, solo decide push izquierda/derecha | ✔ Verificado con malla de 20 y 40 routers (medición de tiempo, no de calidad visual, en §12) |
| Dos proveedores de Internet | ✔ Bien resuelto — dos `cloud` en tier `wan=0` lado a lado, dos routers en tier `edge-routing`, converge en 1 switch | ✔ Verificado |
| Firewalls en alta disponibilidad (par redundante real) | ~ Depende del nombre — `isRedundantGroup()`/`nameStem()` solo detecta el par si ambas etiquetas comparten el mismo "stem" tras quitar sufijo numérico/letra final (`FW-1`/`FW-2` sí, `FW-Principal`/`FW-Respaldo` no) | • Inferido de `nameStem()` (líneas 250-256); no hay ejemplo de este caso en el repo |
| Routers/core redundante | ~ Mismo problema — depende del nombre, no solo de topología, contradiciendo el comentario del código que dice basarse en topología | • Inferido |
| Dos switches de distribución | ✔ Ambos caen en `distribution`/`core` según sus vecinos, quedan lado a lado — visualmente razonable | • Inferido por analogía con el caso DMZ (fw1/fw2 side-by-side) |
| Equipos con dos padres (dual-homed) | ✘ Se agrupan como hijo de **un solo** padre (el primero iterado en `compIds`); el enlace al segundo padre se dibuja como diagonal larga sin tratamiento especial | ✔ Verificado (servidor dual-homed a 2 switches) |
| VLAN lógica sobre infraestructura física | ✘ No hay ningún concepto de VLAN en Pretty; el campo `vlan` del nodo (schema.js) no se usa en absoluto en `prettyLayout.js` (`Grep` confirma cero referencias) | ✔ Verificado por ausencia en el código |
| Sucursales conectadas a sede | ~ Depende de si el router de sucursal cae en el mismo tier que el de sede; probablemente sí (mismo rol `edge-routing` o `distribution`), perdiendo la jerarquía sede/sucursal | • Inferido |
| Laboratorio con muchas PCs | ✔ Bien resuelto — grid layout activado por `count>=6 && allSameType` | ✔ Verificado (30 endpoints → grid ordenado) |
| Planta industrial (PLC/UR3/AGV) | ~ Bien resuelto para `count>=4` de tipos OT (`bus-side`), pero para grupos mixtos de <4 cae a `fanout` genérico, perdiendo la semántica de "bus industrial" | • Inferido de `chooseLayoutMode` línea 337 |
| Sin nube/Internet | ✔ Bien resuelto — simplemente no hay tier `wan`, el primer tier presente pasa a ser el más alto | • Inferido |
| Grafo sin raíz clara (todo mismo tipo, interconectado) | ✘ Ver malla completa | ✔ Verificado |
| Grafo con ciclos | ✘ Ver anillo | ✔ Verificado |
| Varios componentes desconectados | ~ Empaquetado a 2 columnas fijas, ver H14 | • Inferido de `packComponents()` |
| Nodos completamente aislados | ~ Franja horizontal de 1 sola fila sin límite de columnas, ver H15 | • Inferido |

**Conclusión de §5**: el enfoque por tiers **es apropiado y produce buenos resultados cuando existe un backbone jerárquico real de tipos distintos** (router→switch→pc, con o sin DMZ de un solo nivel). Se degrada de forma predecible y sistemática en tres familias de casos: (a) redundancia/HA de infraestructura del mismo tipo (colapsa a fila plana), (b) ciclos/mallas (mismo colapso, sin detección de ciclo), (c) componentes sin ningún nodo "backbone" reconocido (fallback ingenuo). Estas tres familias cubren una fracción significativa de topologías de nivel intermedio/avanzado que un curso de redes querría representar.

---

## 6. Auditoría de colisiones y repulsión

### 6.1 Dos sistemas distintos, no unificados

| | `prettyLayout.resolveCollisions()` | `positionManager.resolveCollisions()` / `resolveAndDispatch()` |
|---|---|---|
| Cuándo corre | Al final de cada `layoutComponent()`, antes del mirror-scoring | Solo en `mouseup` tras soltar un nodo arrastrado; también al insertar nodo vía IA (`computeFreePosition`) |
| Distancia mínima | `MIN_NODE_GAP = 110` | `COLL_DIST = 85` |
| Iteraciones máx. | 35 | 12 (o **1** si el grafo tiene >60 nodos — guard de rendimiento) |
| Nodos fijos | Todo el backbone (`fixedIds`) | Solo el nodo recién soltado (`anchorId`), si se pasa |
| Modelo geométrico | Círculo de radio 55 (mitad de 110), centro-a-centro | Círculo de radio 42.5 (mitad de 85), centro-a-centro |

**¿Existe "repulsión magnética" real al mover nodos?** No, en el sentido de una fuerza continua sentida durante el arrastre. El listener de `mousemove` (main.js:671-680) solo hace `dispatch(MOVE_NODE)` con la posición cruda del mouse — no hay ningún chequeo de colisión ni de repulsión mientras el nodo se arrastra. El usuario puede arrastrar un nodo literalmente encima de otro sin resistencia visual. Solo al soltar el botón (`mouseup`, línea 682-688) se invoca `resolveCollisions(releasedId)`, que empuja de vuelta (con el nodo soltado como ancla fija) a cualquier nodo que haya quedado a menos de 85px. Esto produce una sensación de "salto" post-soltar, no de repulsión en vivo.

### 6.2 Modelo geométrico: puntos/círculos, no cajas

Ni `prettyLayout.resolveCollisions()` ni `positionManager.resolveCollisions()` usan el tamaño real del nodo. Ambos tratan cada nodo como un punto con un radio de exclusión fijo (55px o 42.5px), igual para todos los tipos de nodo. Ninguno de los dos considera:

- El **ancho real del ícono** (48×48px CSS, `.node-icon`) — es menor que el diámetro de exclusión, así que a nivel de ícono nunca hay overlap real, esto está bien.
- El **texto de la etiqueta** (`.node-label`, `white-space: nowrap`, longitud variable según el nombre del dispositivo) — una etiqueta larga como `"Firewall-Perimetral-Sucursal-Norte"` puede extenderse muy por fuera del radio de 55px sin que el algoritmo lo sepa. `LABEL_PADDING=45` existe como constante exportada pero **no se usa en ningún lugar de `resolveCollisions()` ni de `scoreLayout()`** (confirmado por grep: solo aparece en la declaración, cero usos).
- La **dirección IP** (`.node-meta`, debajo del ícono) — mismo problema, no se mide.
- El **bounding box real del DOM** — imposible de conocer en el momento en que Pretty calcula posiciones, porque el cálculo es puramente aritmético sobre el modelo de datos, no consulta el DOM (`getBoundingClientRect` no se usa en absoluto en `prettyLayout.js`).
- El **zoom actual** — Pretty trabaja siempre en coordenadas de mundo; el zoom es aplicado después, en `main.js` (`applyViewport`), así que la separación en píxeles de pantalla percibida varía con el zoom, pero eso es correcto (es responsabilidad del renderer, no de Pretty).

**Caso concreto de discrepancia geométrica verificado**: la caja real de un nodo (`hitTest.getNodeBox`) mide 90×112px. `MIN_NODE_GAP=110` es la distancia mínima centro-a-centro que Pretty garantiza. Si dos nodos quedan exactamente a 110px de distancia vertical (el mínimo que Pretty acepta sin penalización), sus cajas de 112px de alto (56px arriba y abajo del centro cada una) se superponen matemáticamente en 2px (110 − 56 − 56 = −2). Es un margen pequeño, pero demuestra que el modelo de círculo de Pretty **no es conservador** respecto a la caja DOM real; en el eje horizontal (ancho de caja 90px vs. gap 110px) sí hay margen (20px), por lo que el problema es específicamente vertical.

### 6.3 Convergencia y efectos secundarios

- `resolveCollisions()` de Pretty tiene un caso de "overlap exacto" (`dist <= 0.5`) que empuja el segundo nodo `+R` en X de forma determinística — evita división por cero, correcto.
- No hay garantía de que resolver una colisión no genere otra: el bucle vuelve a verificar todos los pares en cada iteración (hasta 35 veces) y solo termina cuando `anyMove` es `false` en una pasada completa, así que **si converge, converge a un estado sin colisiones entre los nodos considerados**. Pero como el backbone es fijo (`fixedIds`) y los grupos no, empujar un nodo de grupo puede alejarlo de su fila/columna original de `layoutGrid`/`layoutChain`, **rompiendo la alineación visual del grupo sin que ningún paso posterior la restaure** — no hay fase 8b de "realinear tras colisión".
- positionManager usa un guard de rendimiento (`maxIter = nodes.length > 60 ? 1 : 12`) que en grafos grandes puede terminar **sin haber resuelto todas las colisiones** tras una sola pasada, dejando nodos parcialmente superpuestos de forma silenciosa.

---

## 7. Auditoría de componentes y nodos aislados

### 7.1 Nodos aislados (`prettyLayout()`, líneas 1027-1040)

Se colocan en una única fila horizontal, `BASE_HGAP=170` entre centros, debajo de todo lo demás (`parkY = max(Y de nodos conectados) + PARK_MARGIN(90) + BASE_VGAP(215)`). Verificado con 5 nodos aislados: fila perfecta en Y=160 (cuando no hay nada más en el grafo) espaciados 180px (170 tras snap a grid de 20).

**Problemas identificados**:
- **Sin límite de columnas** — con 30+ nodos aislados, la fila se extiende linealmente en X sin wrap, pudiendo desbordar muy por fuera del área donde están los componentes conectados (violación de "densidad visual" y de "aprovechamiento horizontal" pedidos en el prompt de auditoría). No hay ninguna zona visual explícita de "sin conexión" (ej. un recuadro punteado) — un nodo aislado se ve visualmente idéntico a cualquier otro, sin indicio de que no está conectado salvo el indicador `node-ind--link.off` (punto gris pequeño).
- **Orden determinista pero arbitrario**: el orden de la fila sigue el orden de `nodes.filter(...)`, es decir, el orden del array del grafo — no hay orden alfabético ni por tipo. Cambiar el orden del JSON de entrada cambia el orden visual de los aislados (aunque no su posición absoluta, que es fija por índice `i`).

### 7.2 Componentes conectados múltiples (`packComponents()`, líneas 943-990)

- Ordena componentes por área descendente (bin-packing greedy razonable).
- **Solo 2 columnas fijas** independientemente de cuántos componentes existan (H14). Con 5+ componentes desconectados, la 3ª+ columna no existe — todo se apila verticalmente dentro de 2 columnas, lo cual **crece en alto sin aprovechar el ancho disponible**, exactamente el problema que la auditoría pide evaluar en §3.
- `COMP_PAD=190` es la única separación entre componentes en un mismo eje — no varía según el tamaño relativo de los componentes empaquetados.
- **Componentes de tamaño muy distinto** (uno grande, varios pequeños): el componente grande domina la altura de su columna; los pequeños en la otra columna quedan con mucho espacio vacío alrededor si el algoritmo greedy los agrupó mal (no hay reequilibrio tras la asignación inicial).
- Los nodos aislados se "estacionan" **después** de `packComponents()`, en la posición Y máxima de *todo* lo ya colocado — así que si hay un componente muy alto en una sola columna, la franja de aislados se desplaza muy abajo, dejando mucho espacio vertical vacío al lado de la columna corta.

**Conclusión de §7**: el sistema no falla ni corrompe datos con múltiples componentes/aislados, pero **no optimiza el uso del canvas**: 2 columnas fijas y una única fila de aislados sin wrap son ambas decisiones que escalan mal más allá de un puñado de componentes/aislados, y ninguna de las dos se ajusta al tamaño real del viewport (ver H13, §8).

---

## 8. Auditoría de grupos numerosos

### 8.1 Detección de prefijos (`extractPrefixGroups`, regex `/^(.+?)(\d+)$/`)

Verificado con el set `["PC-01", "PC_01", "LAB1-PC01", "PC-A", "PC-B", "Estacion"]`, todos hijos del mismo switch:

- `PC-01` → prefijo clave `"pc-"`. `PC_01` → prefijo clave `"pc_"`. **No se fusionan** pese a ser, para un humano, la misma familia de dispositivo con una convención de nombre ligeramente distinta (H9).
- `LAB1-PC01` → prefijo `"lab1-pc"`, grupo de tamaño 1 — nunca alcanza `REPEAT_GROUP_MIN=3`.
- `PC-A`, `PC-B` → no matchean el regex en absoluto (no terminan en dígito) — nunca entran a `extractPrefixGroups`.
- Resultado real: como ningún prefijo alcanza 3 miembros, **todos los prefijos se descartan** (`filter(([, gids]) => gids.length >= REPEAT_GROUP_MIN)`) y los 6 nodos caen al fallback "agrupar por tipo" (`byType`), que como todos son `pc`, produce **un solo grupo de 6** con modo `grid` (activado por `count>=6 && allSameType`). El resultado visual es "correcto por casualidad" (porque no hay tipos mixtos), pero la etiqueta de grupo/prefijo se pierde y el criterio deja de ser fiable en cuanto se mezclan tipos.
- **Con tipos mixtos** (ej. 2 `PC-01`/`PC_01` + 2 `AGV-01`/`AGV_01`), cada prefijo individual seguiría sin alcanzar 3, cayendo al fallback por tipo — esto sí produciría 2 grupos correctos (uno por tipo), así que el problema de H9 es específicamente sobre la **etiqueta de grupo perdida** y el umbral `REPEAT_GROUP_MIN`, no sobre corrupción del layout en este caso particular.

### 8.2 Selección de columnas en `layoutGrid`

`cols = min(MAX_GRID_COLS=6, ceil(sqrt(count)))`. Para 30 nodos: `ceil(sqrt(30))=6` → 6 columnas, 5 filas — matriz razonablemente cuadrada. Para 100 nodos: `ceil(sqrt(100))=10`, pero el tope `MAX_GRID_COLS=6` lo recorta a 6 columnas × 17 filas — **una matriz muy alargada verticalmente** (proporción 6:17), no cuadrada, para grupos grandes. Esto es consistente con el sesgo general del sistema hacia crecimiento vertical (§9).

### 8.3 Detección de redundancia y `pair-lanes`

`isLikelyRedundantPair()` exige simultáneamente: mismo tipo, mismo `nameStem`, al menos un vecino compartido de tier inferior y uno de tier superior. Esto es correcto para rechazar "dos PCs en el mismo switch" (no tienen vecino de tier superior), pero:
- Depende 100% del nombre para el primer filtro (`stemA !== stemB` descarta inmediatamente). Un par `FW-Principal`/`FW-Backup` real (mismos vecinos arriba y abajo) **nunca se detecta como redundante** porque `nameStem()` no encuentra sufijo numérico/letra que quitar y ambos strings completos no coinciden.
- `nameStem()` (líneas 250-256) es una heurística de dos reemplazos regex encadenados; no maneja separadores por espacio de forma distinta a guion/guion bajo, ni normaliza español vs. inglés.

### 8.4 Espacio ocupado y persistencia de la matriz tras colisiones

`resolveCollisions()` corre **después** de colocar todos los grupos, con el backbone fijo pero **los nodos de grupo libres de moverse**. Una matriz `grid` ya está espaciada a `GROUP_HGAP=120`/`GROUP_VGAP=115`, ambos mayores que el `MIN_NODE_GAP=110` de colisión, así que en la práctica **la matriz no se ve perturbada por la resolución de colisiones en el caso normal** (los propios nodos de la matriz nunca están más cerca entre sí que 110px). El riesgo real es cuando dos grupos distintos (de dos anclas distintas) se solapan entre sí — `MIN_CLUSTER_GAP=70` intenta prevenir esto solo para grupos "below" bajo el mismo ancla (líneas 873-897), pero **no hay ninguna verificación de solapamiento entre grupos de anclas backbone distintas** (ej. el grid de PCs de un switch vs. el grid de PCs de otro switch vecino) — esto se delega enteramente a la resolución de colisiones genérica de fase 8, que si empuja nodos de una matriz grande puede desalinear filas/columnas sin restaurarlas (mismo problema de §6.3).

---

## 9. Auditoría de enlaces

### 9.1 Renderizado actual (`renderer.js`, líneas 219-297)

- Elemento SVG: `<line>` recto simple, sin curvas ni quiebres.
- `NODE_EDGE_RADIUS = 26` — el punto de inicio/fin de la línea se retrae 26px desde el centro del nodo hacia el otro extremo, a lo largo del vector unitario `(ux, uy)`. Esto separa la línea del ícono (48px de diámetro visual), pero **no considera la etiqueta ni el indicador**, solo el ícono.
- Detección de fan-out (`buildHighFanoutSet`): un switch con ≥4 vecinos tipo `pc` (`FANOUT_THRESHOLD`) marca esos enlaces como fan-out → opacidad reducida (0.25-0.3) y **sin etiqueta de latencia/ancho de banda** salvo que el enlace esté seleccionado.
- Etiqueta de enlace: rectángulo de fondo con ancho `max(60, text.length*5.5)` centrado en el punto medio del enlace (`mx, my`) — **no hay ninguna verificación de que esa etiqueta no se solape con otro nodo, otro enlace u otra etiqueta**; es puramente geométrico sobre el punto medio.
- Hit-testing de enlace: `hitTestLink()` (hitTest.js) calcula distancia punto-segmento con umbral `10/vp.zoom` — el área seleccionable es efectivamente una franja de 20px de ancho alrededor de la línea recta, coherente con lo que se ve.
- Animación de paquetes: interpolación lineal `start + (end-start)*progress` a lo largo del mismo segmento recto — no hay ningún desfase entre la geometría de la línea visual y la trayectoria del paquete (coherentes entre sí).

### 9.2 Discrepancia entre geometría de `scoreLayout` y geometría del DOM/SVG

`scoreLayout()` (prettyLayout.js) calcula cruces (`segmentsIntersect`) y "enlace atraviesa nodo" (`distPointToSegment < 38`) usando **las coordenadas centro-a-centro crudas de los nodos** (`positions.get(id).x/y`), sin aplicar el retraimiento de 26px (`NODE_EDGE_RADIUS`) que sí aplica el renderer real. Esto significa que:
- El umbral de "enlace atraviesa nodo" (38px de distancia punto-segmento) se mide contra el **centro** del nodo en el scoring, pero visualmente la línea real empieza a 26px del centro del nodo de origen — la geometría idealizada de `scoreLayout` y la geometría real del SVG **no son la misma**, aunque están razonablemente cerca (38 > 26, así que el score es, si acaso, ligeramente más conservador que la realidad, no menos).
- El scoring no conoce las etiquetas de enlace (rectángulos de fondo semitransparentes) ni las etiquetas de nodo — un cruce "limpio" según el score puede visualmente cruzar una etiqueta de texto.

### 9.3 Problemas visuales de enlaces rectos por escenario

| Escenario | ¿Penalizado por `scoreLayout`? | Comportamiento real esperado |
|---|---|---|
| Cruce entre 2 enlaces no adyacentes | Sí, +1000 por cruce (`segmentsIntersect`) | El único mecanismo de mitigación es el mirror-scoring (±X global), que no elimina cruces locales, solo decide la orientación global |
| Muchos enlaces desde un mismo switch (fan-out) | No penalizado directamente (los enlaces fan-out no cruzan entre sí por construcción radial/grid), pero si cruzan otros enlaces del grafo sí puntúan | Mitigado visualmente por opacidad reducida en renderer, no por geometría |
| Línea que atraviesa un nodo no relacionado | Sí, +700 (umbral 38px del centro) | — |
| Línea que atraviesa una etiqueta de enlace | **No detectado** — no hay geometría de etiqueta en el scoring | Puede ocurrir en zonas densas (ver H8/H9 sobre falta de modelo de caja real) |
| Etiquetas de enlace encimadas | **No detectado** — cada etiqueta se posiciona solo en función de su propio punto medio, sin conocer las demás | Ocurre con enlaces cortos y paralelos (ej. `grid` denso) |
| Enlaces casi paralelos / superpuestos | No hay separación explícita de enlaces paralelos entre el mismo par de nodos ni entre pares cercanos — cada `<line>` se dibuja independiente | Dos enlaces entre nodos casi colineales pueden visualmente fusionarse |
| Enlaces bidireccionales/duplicados | El reducer (`ADD_LINK`) rechaza duplicados exactos vía `hasLinkBetween()`, así que no debería haber 2 enlaces idénticos source→target en el modelo — pero A→B y B→A distintos (si el usuario los crea con roles invertidos) no están cubiertos por `hasLinkBetween` si esta función no normaliza el orden (no verificado en esta auditoría, fuera de alcance de `graph.js` no leído en detalle) | — |
| Diagonales dentro de matriz grid | Ocurre siempre que un nodo de un grid grande se conecta a algo fuera de la matriz (ej. servidor dual-homed) — sin mitigación | Ver H4 |
| Mallas / anillos | Mismo colapso de tier (H2) hace que todos los enlaces se amontonen en una franja horizontal estrecha, maximizando cruces | Ver H2 |

**Conclusión de §9**: el scoring de cruces/atravesamiento **sí existe y sí es razonablemente fiel** a la geometría real del ícono (diferencia de 12px entre umbral de score y retraimiento real, en la dirección conservadora), pero **no cubre etiquetas** (ni de nodo ni de enlace) y **no separa enlaces paralelos/casi paralelos**, que son justamente los defectos visuales más frecuentes en grafos densos (mallas, grids grandes).

---

## 10. Alternativas de enrutamiento de enlaces (sin implementar)

| Alternativa | Claridad | Complejidad de implementación | Compat. selección | Compat. animación paquetes | Compat. etiquetas | Impacto rendimiento | Riesgo UX | Conveniencia para CAPA8 |
|---|---|---|---|---|---|---|---|---|
| **A. Rectos (actual) + mejor posicionamiento** | Media-alta si el layout evita cruces | Baja — ya existe, solo mejorar fases 5-8 | Ya funciona (`hitTestLink` por distancia a segmento) | Ya funciona (interpolación lineal) | Ya funciona, mejorable (colisión de etiquetas) | Mínimo | Bajo | **Alta** — es incremental sobre lo que ya existe |
| **B. Polyline simple (1 punto intermedio, codo H-V o V-H)** | Alta para jerarquías estrictas (look "organigrama") | Media — requiere reescribir `hitTestLink`, renderer, y la interpolación de paquetes para 2 segmentos | Requiere generalizar `distancePointToSegment` a polilínea | Requiere reparametrizar el paquete sobre 2 tramos (longitud acumulada) | Más fácil de posicionar (centro de tramo más largo) | Bajo | Medio — puede verse "cuadriculado" en exceso si se aplica a enlaces cortos | Media-alta, buen encaje con el estilo jerárquico ya presente |
| **C. Enrutamiento ortogonal (Manhattan)** | Muy alta para grafos grandes tipo diagrama de circuitos | Alta — necesita un modelo de obstáculos/canales, tocaría casi todo el pipeline | Requiere reescritura completa de hit-testing | Requiere reparametrizar sobre N tramos | Fácil de posicionar en el tramo horizontal más largo | Medio-alto (routing es costoso, especialmente con obstáculos dinámicos en cada `MOVE_NODE`) | Alto — puede verse sobre-diseñado para diagramas educativos pequeños/medianos | Baja-media — sobredimensionado para el tamaño típico de topología educativa (10-50 nodos) |
| **D. Curvas Bézier** | Media — ayuda a desambiguar enlaces paralelos, pero añade una estética "orgánica" que puede leerse como menos técnica | Media — requiere `<path>` en vez de `<line>`, y aproximar distancia punto-curva para hit-testing (o usar el polígono de control) | Requiere aproximación numérica de distancia a curva | Requiere evaluar la curva paramétricamente (fácil con Bézier cúbica) | Difícil posicionar el punto medio "visual" de una curva (no es el promedio simple de extremos) | Bajo-medio | Medio — riesgo real de verse "no técnico" en un contexto de redes | Baja — no encaja con la estética de diagrama de red tipo Falstad que el proyecto ya adopta (ver `prettyLayout.js` comentario "Falstad-inspired") |
| **E. Bundling parcial (tronco común + ramificaciones)** | Alta para fan-out masivo (reduce ruido visual) | Alta — requiere agrupar geometría por switch y curvas de fusión/separación | Compatible con selección solo si se hace clic en la rama, no en el tronco | Complejo — cada paquete viaja por tronco+rama, dos tramos con proporciones distintas | Una sola etiqueta por tronco simplifica, pero pierde info por enlace individual (riesgo, exactamente lo que la auditoría pide evaluar) | Medio | Medio-alto — ocultar relaciones 1:1 puede confundir en un contexto donde el enlace individual (latencia, BW) es pedagógicamente relevante | Media — el proyecto ya mitiga esto con opacidad reducida en fan-out (Regla 9); bundling sería una extensión natural pero de alto costo relativo al beneficio |

**Conclusión de §10**: no hay evidencia de que se necesite enrutamiento ortogonal complejo. Los defectos documentados en §9 (etiquetas encimadas, enlaces paralelos sin separar, diagonales de dual-homing) se resuelven con mejoras incrementales sobre la alternativa A (mejor scoring de etiquetas, anclas por lado de nodo, desplazamiento de enlaces paralelos) antes de justificar el salto de complejidad a B/C/D/E.

---

## 11. Auditoría del scoring (`scoreLayout`)

| Penalización | Peso | Unidad | Prioridad relativa | Interacciones / dominancia |
|---|---|---|---|---|
| Solapamiento de nodos | hasta 1000 por par, proporcional a `(1 - d/R)` | puntos | Más alta — domina si hay overlap severo | Puede dominar el score total en grafos densos con muchos pares cercanos, opacando el resto |
| Cruces de enlaces | 1000 fijo por cruce | puntos | Igual de alta que overlap | En una malla completa (E=O(N²)), el número de cruces potencial crece muy rápido — el score total se vuelve enorme y deja de discriminar entre variantes (satura) |
| Enlace atraviesa nodo no-extremo | 700 fijo, umbral 38px | puntos | Alta | Mismo riesgo de saturación en grafos densos |
| Violación de tier (nodo de tier inferior visualmente más abajo que uno superior conectado) | 800 fijo por enlace violado, umbral 40px de Y | puntos | Alta | Es la única penalización explícitamente ligada a `ROLE_TIER` — en un anillo/malla donde todos comparten tier, esta penalización simplemente **no aplica nunca** (tA===tB → `continue`), por lo que el colapso de H2 no genera ninguna señal de alerta en el score |
| Varianza de longitud de enlaces | `sqrt(varianza) * 0.2` | puntos, escala continua | Muy baja — coeficiente 0.2 la hace irrelevante frente a las penalizaciones de cientos/miles de puntos | Prácticamente un desempate fino, no una fuerza real |

**Métricas ausentes** (relevantes para los objetivos declarados del editor — compacto, legible, equilibrado): área total ocupada, relación de aspecto, espacio vacío, distancia total de enlaces, longitud máxima de enlace, cruces ponderados por importancia (un cruce cerca de un nodo backbone es peor que uno entre dos hojas lejanas), colisión de etiquetas, simetría, estabilidad/movimiento total respecto a la posición anterior, densidad local, legibilidad del fan-out.

**¿El scoring selecciona alternativas reales o solo compara un layout con su espejo?** Verificado en el código: la única comparación de variantes ocurre en `layoutComponent()` líneas 917-930 — genera **exactamente una** variante alternativa (reflejo horizontal en torno a `cx`) y la adopta solo si su score es ≥10% mejor. No se generan variantes de orientación (vertical↔horizontal), de tier alternativo, ni de asignación de lados distinta. **La respuesta es: solo compara la distribución con su reflejo horizontal**, tal como plantea la pregunta guía de la auditoría. El "scoring" es real y matemáticamente correcto para lo que mide, pero el espacio de búsqueda que explora es mínimo (2 variantes).

---

## 12. Determinismo e idempotencia

**Verificado empíricamente** (script de sondeo, fixture `dmz.json` — "DMZ con Doble Firewall"):

| Prueba | Resultado |
|---|---|
| Pretty ×1 vs. Pretty ×5 (acumulativo) | **Idéntico** — todas las posiciones (x,y) coinciden exactamente entre la 1ª y la 5ª aplicación |
| Orden de `nodes[]`/`links[]` invertido en el JSON de entrada, luego Pretty ×1 | **Idéntico** al resultado con el orden original |
| Un solo nodo, Pretty ×1 | 1 solo `dispatch(MOVE_NODE)`, posición estable `(700, 160)` — coherente con `cx=700` y el tier único |

Esto es una fortaleza real del diseño: el uso de `cx=700, cy=400` como **constantes fijas** (nunca derivadas de la posición actual de los nodos, comentario explícito en el código línea 676-677) y el ordenamiento canónico por etiqueta (`sortByLabel`) en cada tier antes del barycenter sweep, hacen que Pretty sea efectivamente una función pura de `(nodes, links)` sin dependencia del estado visual previo ni del orden de los arrays. No se detectó no-determinismo en los casos probados (iteración de `Map`/`Set` en V8 preserva orden de inserción, y el código no depende de iteración de objetos planos sin orden garantizado).

**Lo no verificado / fuera del alcance empírico de esta auditoría**: cambios incrementales pequeños (mover 1 nodo manualmente y re-aplicar Pretty; agregar 1 endpoint a un grupo ya existente) — el código sugiere que sí pueden producir **reorganizaciones grandes**, porque el barycenter sweep en fase 5 y el chain-sort dependen de las posiciones actuales de los vecinos calculadas en la misma pasada, no de las posiciones previas del usuario (`tempPos` se reconstruye desde cero en `refreshTempPos()`, ignorando `node.x/y` existentes salvo como fallback cuando no hay vecino conocido en `barycenterOrder`). Es decir: **Pretty no intenta preservar el layout mental del usuario al reaplicarse tras un cambio pequeño** — recalcula todo desde los tiers canónicos. Esto es coherente con la idempotencia (bueno) pero significa que "aplicar Pretty" después de cualquier edición manual probablemente descarte el ajuste manual del usuario (no es una fusión incremental, es una re-generación completa). Se recomienda una prueba dedicada de esto en la fase de instrumentación (§19).

---

## 13. Rendimiento y escalabilidad

**Medido empíricamente** (topología switch + N PCs, un solo componente, un solo grupo `grid`):

| N nodos | Tiempo Pretty (ms) |
|---|---|
| 10 | 0.22 |
| 50 | 2.78 |
| 100 | 7.16 |
| 250 | 22.73 |
| 500 | 65.62 |

**Medido empíricamente** (malla completa, E = N(N-1)/2):

| N nodos | Enlaces | Tiempo Pretty (ms) |
|---|---|---|
| 20 | 190 | 4.69 |
| 40 | 780 | 44.04 |

El crecimiento super-lineal en el caso de malla completa es consistente con los bucles `O(E²)` de `scoreLayout` (cruces: doble bucle sobre enlaces) y `O(E·N)` (enlace atraviesa nodo: bucle enlaces × nodos), sumado al `O(N²)` de `resolveCollisions` (hasta 35 iteraciones × todos los pares). Para el caso estrella/grid (N=500, sin malla), el tiempo se mantiene manejable (~65ms, imperceptible para el usuario) porque `E=O(N)` en ese caso.

**Cuellos de botella identificados por inspección de bucles**:

| Operación | Complejidad aproximada | Ubicación |
|---|---|---|
| `scoreLayout` — solapamiento de nodos | O(N²) | prettyLayout.js:190-196 |
| `scoreLayout` — cruces de enlaces | O(E²) | prettyLayout.js:201-209 |
| `scoreLayout` — enlace atraviesa nodo | O(E·N) | prettyLayout.js:212-218 |
| `resolveCollisions` (Pretty) | O(N² · iter), iter≤35 | prettyLayout.js:641-666 |
| `resolveCollisions`/`resolveAndDispatch` (positionManager, manual) | O(N² · iter), iter≤12 (o 1 si N>60, guard explícito) | positionManager.js:143-169 |
| `isRedundantGroup` (par de 4) | O(1) — hasta 6 pares fijos, no escala con N | prettyLayout.js:285-297 |
| Dispatch final de Pretty | O(N) dispatches individuales, cada uno dispara reducer + render completos | prettyLayout.js:1066-1072, ver H5 |
| `renderStage()` tras cada `MOVE_NODE` | O(N + E) reconstrucción completa de DOM/SVG | renderer.js:215-364 |
| `reducer()` — `deepClone` por `JSON.stringify/parse` | O(tamaño total del estado, no solo del nodo movido) | reducer.js:6-8, en cada `dispatch` |
| `analyzeTopology()` vía `updateFabBadge` | No auditado en detalle en esta pasada (fuera del alcance leído), pero se ejecuta en cada `dispatch`, incl. cada `mousemove` de arrastre | main.js:909-910, `src/ai/topology-analyzer.js` |

**Estimación de escala** (extrapolando la tabla y los factores O(·) anteriores, no medida directamente):

- **10-50 nodos**: instantáneo en todos los sub-sistemas, sin riesgo perceptible.
- **100 nodos**: Pretty en sí sigue siendo rápido (~7ms), pero **cada `mousemove` durante un arrastre manual** dispara `deepClone` + `analyzeTopology` + `renderStage` completos — el costo por frame ya no es trivial y depende fuertemente de qué tan pesado sea `analyzeTopology` (no medido aquí).
- **250-500 nodos**: Pretty en sí se mantiene bajo 70ms (aceptable como operación puntual al presionar el botón), pero el **arrastre manual** (disparado en cada frame de mouse) es el riesgo real de UX en este rango — no hay throttling/debounce del `dispatch(MOVE_NODE)` durante `mousemove` (main.js:671-680, se dispara sin límite de frecuencia salvo el que impone el propio navegador al emitir eventos `mousemove`).
- **Malla densa (E=O(N²))**: el riesgo crece mucho más rápido; con N=40 ya se observan 44ms solo en Pretty (sin contar drag). Una malla de 100 nodos totalmente conectada (4950 enlaces) extrapola, por la tendencia O(E²) observada, a un tiempo de varios segundos — un caso de uso poco frecuente en un contexto educativo, pero no imposible (ej. demostrar "por qué las mallas completas no escalan" es justamente un tema típico de un curso de redes).

---

## 14. Arquitectura y mantenibilidad

**Acoplamiento actual dentro de `prettyLayout.js`** (un solo archivo, ~1075 líneas, sin separación de módulos):

- **Comprensión de la topología** (`inferRole`, `inferZone`, `detectComponents`, `isLikelyRedundantPair`) está entrelazada con **elección de estrategia** (`chooseLayoutMode`, `assignGroupSides`) y con **cálculo geométrico** (`layoutGrid/Arc/Fanout/Chain/BusSide/PairLanes`) dentro del mismo archivo y, en varios casos, dentro de la misma función (`layoutComponent()` es una función de ~270 líneas que hace las fases 2, 5, 6, 7, 8 y parte de 9 secuencialmente con variables compartidas por closure).
- La **resolución de colisiones** (fase 8) y la **evaluación de calidad** (`scoreLayout`, usada solo para el mirror-check) están desacopladas como funciones independientes — esto es una buena práctica ya presente, exportable y testeable de forma aislada (de hecho, son las dos funciones más fáciles de testear unitariamente hoy sin refactor).
- La **aplicación de movimientos** (dispatch final) está mezclada con el cálculo — no hay separación entre "calcular el layout objetivo" y "aplicarlo al store", lo cual complica escribir un test de "¿qué posiciones produciría Pretty?" sin mockear `dispatch`.
- El **renderer** (`renderer.js`) y el **hit-testing** (`hitTest.js`) están correctamente desacoplados de `prettyLayout.js` — solo importan `FANOUT_THRESHOLD` (constante) desde Pretty, una dependencia mínima y razonable.
- El **positionManager.js** duplica lógica de colisión con constantes distintas (ver H7) — es el ejemplo más claro de acoplamiento indebido *por ausencia* de una fuente única de verdad geométrica compartida.

**Separación futura propuesta (solo conceptual, no implementada)**:

```
topologyAnalyzer    → inferRole, inferZone, detectComponents, isLikelyRedundantPair, nameStem
layoutStrategySelector → chooseLayoutMode, assignGroupSides, detectSemanticGroups
layoutCandidates     → generación de N variantes (hoy solo 1: mirror) — candidato a expandir
layoutScorer         → scoreLayout (ya aislado, listo para extraer tal cual)
collisionResolver     → resolveCollisions (Pretty) + resolveCollisions (positionManager) UNIFICADOS
                         con una única constante de distancia mínima y un único modelo geométrico
edgeRouter            → hoy inexistente como módulo — la línea recta con retraimiento vive dentro
                         de renderer.js; si se explora la alternativa B/C de §10, este sería su hogar
layoutApplier         → el bloque de dispatch final de prettyLayout() + snap + normalize
layoutMetrics         → instrumentación para §19 (aspect ratio, área, longitud total de enlace, etc.)
                         — no existe hoy en ninguna forma
```

Esta separación no es urgente por sí misma (el código actual es legible y está razonablemente comentado), pero **sí sería un prerrequisito de bajo riesgo** antes de intentar cualquier cambio estructural mayor (nueva estrategia de tiering, nuevo enrutamiento de enlaces), porque hoy modificar la fase 5 (tiers) obliga a tocar una función de 270 líneas con efectos colaterales sobre las fases 6-9 vía variables compartidas por closure.

---

## 15. Librerías externas — evaluación conceptual (sin instalar nada)

| Opción | Vainilla JS | Peso | Jerarquías | Ciclos | Puertos | Routing ortogonal | Nodos tamaño variable | Grupos | Determinismo | Control visual | Conserva semántica CAPA8 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **ELK.js** | Sí (WASM/JS build) | Alto (~cientos de KB) | Excelente (motor Eclipse Layout Kernel, pensado para esto) | Excelente | Sí | Sí, nativo | Sí | Sí (jerárquico nativo) | Alto (algoritmo determinista por diseño) | Bajo — layout "genérico", requeriría post-proceso para el estilo CAPA8 | Baja sin trabajo adicional — es agnóstico de redes |
| **Dagre** | Sí | Medio | Buena (jerárquico por capas, similar a lo que Pretty ya intenta) | Limitada (requiere romper ciclos antes) | No | Aprox. (poligonal) | Sí | No nativo | Alto | Medio | Media — el modelo de "capas" es compatible con `ROLE_TIER`, pero perdería el control fino de modos (`arc`, `bus-side`, `pair-lanes`) que Pretty ya tiene a medida |
| **D3-force** | Sí | Bajo-medio | No — es simulación física, no jerárquica | Excelente (maneja ciclos de forma natural, es su punto fuerte) | No | No (líneas rectas) | Sí (con radios de colisión) | No nativo (requiere fuerzas custom) | **Bajo** — es iterativo/estocástico por naturaleza, requiere semilla fija y aun así puede no converger igual | Alto si se ajustan fuerzas | Baja — perdería completamente el modelo de tiers que sí importa pedagógicamente (mostrar "arriba está el core, abajo el acceso") |
| **WebCola** | Sí | Medio | Soporta restricciones de alineación/jerarquía combinadas con fuerzas | Buena | No | Aprox. | Sí | Vía restricciones | Medio | Medio-alto (constraints programables) | Media — es el más cercano en filosofía a "tiers + fuerzas", pero añade una curva de aprendizaje de su API de constraints |
| **Cytoscape.js layouts** | Sí | Alto si se adopta Cytoscape completo | Variable según el layout elegido (dagre, cose, etc. — reexporta otros motores) | Depende del sub-layout | No | Depende | Sí | Depende | Depende | Bajo si se usa el motor de render de Cytoscape, medio si solo se usa el cálculo de layout | Baja-media |

**Recomendación de esta auditoría (no vinculante, requiere decisión de producto — ver §20)**: ninguna librería reemplaza limpiamente lo que Pretty ya hace bien (modos de grupo específicos por tipo de dispositivo de red, zonas DMZ, fan-out con opacidad reducida) sin trabajo de adaptación sustancial. La opción de menor riesgo, si se decide *no* mantener el motor propio, sería usar **Dagre únicamente para la fase 5 (tiers + orden de barycenter)**, dejando fases 3-4, 6-7 (grupos, modos, lados) y el renderer intactos — es decir, usar una librería como *generadora de candidatos para una sub-fase*, no como reemplazo del motor completo. Mantener el algoritmo propio sigue siendo razonable dado que CAPA8 ya tiene semántica de dominio (roles de red, zonas DMZ, modos de grupo industrial) que ninguna librería genérica replica de fábrica.

---

## 16. Quick wins potenciales (bajo riesgo, alto impacto relativo)

Estos son candidatos a evaluar/prototipar, **no implementados**:

1. **Tier por profundidad BFS real, no solo por rol** (resolvería H1 directamente) — calcular la distancia BFS desde el nodo de menor `ROLE_TIER` del componente (ej. el `cloud`/`wan`) y usar `max(ROLE_TIER[rol], profundidad_BFS)` o una combinación, para que un firewall a 2 saltos de otro no comparta tier solo porque ambos son `firewall`. Aislado en la fase 5, no toca fases 3-4 ni 6-9.
2. **Unificar `MIN_NODE_GAP`/`COLL_DIST` en una sola constante compartida** (resolvería H7) — mover ambas a un módulo común de constantes geométricas.
3. **Aplicar `resolveCollisions()` de positionManager también en `mousemove` (throttled), no solo en `mouseup`** — daría la sensación de repulsión en vivo que hoy no existe (H6), con cuidado de no reintroducir el problema de rendimiento de H5 (requeriría throttle explícito, ej. cada 3er frame).
4. **Ampliar `MIN_NODE_GAP` a 115-120px o reducir la altura de `.node` en CSS** — resuelve el margen negativo de 2px de H8 con un cambio de una sola constante.
5. **Normalizar el separador en `nameStem()`/`extractPrefixGroups()`** (resolvería H9 parcialmente) — tratar `-`, `_` y espacio como equivalentes antes de extraer el prefijo.
6. **Elevar `packComponents()` de 2 a N columnas dinámicas según `sqrt(número de componentes)`** (mitiga H14) — cambio local a una función.

---

## 17. Refactorizaciones estructurales potenciales (mayor alcance, evaluar con cuidado)

1. Extraer `resolveCollisions` a un módulo compartido único entre Pretty y positionManager, con un modelo geométrico que use el tamaño real de caja (90×112) en vez de un círculo uniforme — toca ambos sistemas, requiere pruebas de regresión visual.
2. Introducir detección de ciclos (`core` con `switchNbs>=2` ya es una señal parcial) como una fase explícita previa a la asignación de tiers, para decidir un tratamiento especial (layout circular/radial) en vez de forzar el ciclo a una fila plana — es un cambio de estrategia real, no un ajuste de constante, y requeriría una nueva función de layout (`layoutRing`/`layoutRadial`) más una regla de activación en `chooseLayoutMode` o en la fase 5 misma.
3. Separar "cálculo de layout" de "aplicación al store" (permitiría previsualizar Pretty antes de aplicarlo, y testear unitariamente sin mockear `dispatch`).
4. Diseñar una fase 5b explícita de "realineación post-colisión" para grupos `grid`/`chain` que hayan sido desplazados por la fase 8, restaurando su espaciado uniforme tras la resolución de colisiones en vez de dejar el resultado tal cual quedó.
5. Dar a Pretty conocimiento del tamaño de viewport (pasar `viewportWidth/Height` como parámetro opcional) para decidir orientación dinámica (vertical/horizontal/híbrida) en vez de asumir siempre crecimiento vertical con `cx/cy` fijos — cambio de mayor alcance que toca la fase 5 y potencialmente el packing.

---

## 18. Matriz de pruebas recomendada

✔ = verificado empíricamente en esta auditoría · • = inferido del código, no ejecutado · — = no evaluado

| # | Caso | Comportamiento esperado | Estrategia actual de Pretty | Riesgo principal | Resultado | Prioridad |
|---|---|---|---|---|---|---|
| 1 | Un único nodo | Se centra en `(cx,cy)` | Tier único, sin backbone si no hay vecinos | Ninguno | ✔ `(700,160)`, 1 dispatch | Baja |
| 2 | Dos nodos conectados | Alineados verticalmente si hay jerarquía de tipo, u horizontal si mismo tier | Depende de `inferRole` de cada tipo | Ninguno | • | Baja |
| 3 | Tres nodos en línea | Cadena vertical simple | Chain-sort o tiers sucesivos | Ninguno | • | Baja |
| 4 | Estrella con 5 endpoints (con switch) | Fanout/arc balanceado bajo el switch | `fanout` (count≤6) | Ninguno | • | Media |
| 5 | Estrella con 30 endpoints (con switch) | Grid ordenado | `grid` (count≥8) | Matriz alargada si count grande | ✔ bbox 600×620, orden correcto | Media |
| 6 | Laboratorio (1 switch + muchas PCs) | Grid bajo el switch | `grid` | Ninguno | ✔ | Media |
| 7 | Dos laboratorios (2 switch × 8 PC, 1 router) | 2 grids simétricos, lados opuestos | `assignGroupSides` con 2 anclas | Ninguno grave | ✔ bbox 560×600 | Media |
| 8 | DMZ simple (1 firewall) | Jerarquía limpia de 3-4 tiers | — | Ninguno | • | Media |
| 9 | **DMZ con doble firewall** (caso de referencia) | Firewalls en niveles Y distintos reflejando su posición secuencial real | Ambos firewalls al mismo `ROLE_TIER=1` | **H1 (P1)** — firewalls lado a lado, parecen redundantes | ✔ verificado exhaustivamente | **Alta** |
| 10 | Core redundante (2 switches/routers "core") | Lado a lado, alineados, claramente pareja | Mismo tier, barycenter — visualmente razonable si nombre no rompe `nameStem` | Depende del nombre para `pair-lanes` | • | Alta |
| 11 | Dos ISP | 2 clouds tier0, converge en switch | Backbone estándar | Ninguno grave | ✔ verificado, correcto | Media |
| 12 | Cadena de switches | Fila única con orden reflejando la cadena | `chain-sort` si forma camino simple | Todos mismo tier, sin progresión vertical | • | Media |
| 13 | **Anillo** (8 switches) | Alguna forma que sugiera el ciclo (no una línea recta con un enlace de cierre atravesando todo) | Ninguna — cae en tier único, fila recta | **H2 (P1)** — enlace de cierre cruza todo el diagrama | ✔ verificado, `h=0`, fila perfecta | **Alta** |
| 14 | Malla parcial | Backbone parcialmente jerárquico | Depende de cuántos nodos alcanzan backbone | Similar a H2 si predominan mismos roles | • | Alta |
| 15 | Malla densa | — | Todos mismo tier (`distribution`) | Fila recta + O(E²) en scoring | ✔ verificado (colapso de rol + tiempos) | Alta |
| 16 | Servidor dual-homed | Posición que sugiera ambas conexiones, o enlace claramente tratado como "secundario" | Se agrupa como hijo de un solo padre | **H4 (P2)** — enlace diagonal largo sin tratamiento | ✔ verificado | Media |
| 17 | Varios componentes (3+) | Empaquetado eficiente en el ancho disponible | 2 columnas fijas | **H14 (P2)** con 3+ componentes | • | Media |
| 18 | Solo nodos aislados | Distribución compacta, posiblemente en cuadrícula | Fila horizontal sin límite de columnas | **H15 (P2/P3)** con muchos aislados | ✔ verificado con 5 (fila), inferido para N grande | Media |
| 19 | Componente grande + varios pequeños | Componente grande domina, pequeños se acomodan alrededor sin desperdicio | Packing greedy por área, 2 columnas | Desbalance de columna, ver H14 | • | Media |
| 20 | Topología industrial (PLC/UR3/AGV) | `bus-side` para grupos OT ≥4 | Correcto para ≥4 del mismo tipo OT | Grupos mixtos <4 caen a `fanout` genérico | • | Media |
| 21 | Nombres con prefijos consistentes | Grupo detectado y etiquetado | `extractPrefixGroups` funciona bien | Ninguno | • | Baja |
| 22 | Nombres sin prefijos | Agrupación por tipo | `byType` fallback | Pierde etiqueta de grupo, no rompe layout | • | Baja |
| 23 | Etiquetas extremadamente largas | Sin solapamiento de texto | Ningún mecanismo mide ancho real de etiqueta (`LABEL_PADDING` declarado pero no usado) | Colisión de texto no detectada por `scoreLayout` ni `resolveCollisions` | • confirmado por lectura de código (constante sin uso) | Alta |
| 24 | Diagrama de >100 nodos | Tiempo de Pretty aceptable (<200ms), drag manual fluido | Pretty en sí escala razonablemente en el caso estrella/grid; drag dispara pipeline completo por frame | **H5 (P1)** en el drag, no en Pretty mismo | ✔ Pretty: 500 nodos en 65ms; drag no medido directamente (fuera de entorno de navegador) | Alta |
| 25 | JSON con nodos y enlaces reordenados | Resultado idéntico al orden original | Orden canónico por `sortByLabel` en cada tier | Ninguno | ✔ verificado — idéntico | Baja (ya validado, riesgo cerrado) |

---

## 19. Plan sugerido por etapas

1. **Auditoría** (esta fase) — completada. Entregable: este documento.
2. **Instrumentación** — antes de tocar código, añadir métricas exportables desde `scoreLayout`/`prettyLayout` (sin cambiar su comportamiento): área total, aspect ratio, longitud total de enlaces, conteo de cruces reales vs. penalizados, tiempo de ejecución por fase. Esto da una línea base cuantitativa para comparar cualquier cambio futuro objetivamente, no solo "se ve mejor".
3. **Pruebas** — formalizar la matriz de §18 como `tests/prettyLayout.test.js` (hoy no existe ningún test de Pretty), cubriendo al menos los casos marcados "Alta prioridad": DMZ doble firewall, anillo, malla, dual-homed, componentes múltiples, idempotencia, orden-independencia. Esto convierte los hallazgos de esta auditoría en regresiones verificables.
4. **Prototipo** — implementar el quick win #1 de §16 (tier por profundidad BFS) de forma aislada, detrás de un flag, y comparar sus métricas de la fase 2 contra el comportamiento actual en la matriz de la fase 3.
5. **Implementación** — si el prototipo mejora las métricas sin regresionar los casos ya sanos (estrella, laboratorio, DMZ simple), integrarlo. Repetir el ciclo prototipo→implementación para el siguiente hallazgo priorizado (sugerido: H2 detección de ciclos, luego H7 unificación de constantes de colisión).
6. **Validación** — re-ejecutar la matriz completa de 25 casos + `npm test`, y idealmente una revisión visual manual en el navegador real (fuera del alcance de esta auditoría) antes de dar por cerrado cada hallazgo.

---

## 20. Preguntas que requieren decisión del propietario

Estas no pueden inferirse solo del código; son decisiones de producto/UX:

1. ¿Es aceptable que Pretty **no preserve** el ajuste manual del usuario al reaplicarse (§12)? Si se espera lo contrario, es un cambio de comportamiento mayor, no un quick win.
2. Para el caso de doble firewall (H1): ¿la expectativa pedagógica es que Pretty **siempre** muestre progresión vertical estricta según el camino real (Internet→FW-ext→DMZ→FW-int→LAN), o es aceptable que dispositivos del mismo tipo se agrupen visualmente aunque no sean redundantes, priorizando compacidad sobre fidelidad de secuencia?
3. Para anillos/mallas (H2): ¿vale la pena invertir en un modo de layout radial/circular dedicado (cambio estructural, §17.2), o es aceptable que el usuario reorganice manualmente esos casos poco frecuentes en un contexto educativo?
4. ¿Se prioriza el ancho de pantalla (layouts horizontales/híbridos) sobre mantener `cx=700,cy=400` fijos e idempotentes? Dar a Pretty el tamaño del viewport mejora el uso del espacio pero puede introducir dependencia del dispositivo/ventana en el resultado (dos usuarios con distinto tamaño de pantalla verían layouts distintos para el mismo grafo) — ¿es eso aceptable o se prefiere el determinismo absoluto actual?
5. ¿Vale la pena la inversión en unificar `positionManager.js` y `prettyLayout.js` en un solo sistema de colisión (§16.2, §17.1), sabiendo que hoy conviven sin conflicto aparente para el usuario final pero con inconsistencia interna?
6. Sobre bundling de enlaces fan-out (§10.E): ¿es más importante para CAPA8 la claridad visual en labs grandes, o la trazabilidad 1:1 de cada enlace individual (con su latencia/BW propios) como recurso pedagógico? Esto determina si el bundling es siquiera deseable a futuro.
7. ¿Existe apetito por adoptar Dagre solo para la fase 5 (§15), o la preferencia explícita es mantener el motor 100% propio sin dependencias nuevas, incluso a costa de reinventar soluciones que un motor externo ya resuelve para jerarquías con ciclos?

---

## 21. Apéndice técnico

### Funciones inspeccionadas (lista no exhaustiva de las más relevantes)
`inferRole`, `inferZone`, `detectComponents`, `barycenterOrder`, `adaptiveHGap`, `scoreLayout`, `segmentsIntersect`, `distPointToSegment`, `nameStem`, `isLikelyRedundantPair`, `isRedundantGroup`, `extractPrefixGroups`, `chooseLayoutMode`, `detectSemanticGroups`, `layoutGrid`, `layoutFanout`, `layoutArc`, `layoutChain`, `layoutBusSide`, `layoutPairLanes`, `applyGroupLayout`, `estimateGroupWidth`, `assignGroupSides`, `resolveCollisions` (prettyLayout.js), `layoutComponent`, `packComponents`, `prettyLayout` — todas en `src/app/prettyLayout.js`.
`renderStage`, `computeNodeStatuses`, `buildHighFanoutSet` — `src/render/renderer.js`.
`hitTestNode`, `getNodeBox`, `hitTestLink`, `distancePointToSegment` — `src/render/hitTest.js`.
`resolveCollisions`, `resolveAndDispatch`, `resolveCollisionsN`, `computeFreePosition`, `positionNewNode` — `src/app/positionManager.js`.
`reducer`, `createInitialState` — `src/app/reducer.js`.
`createStore` — `src/core/store.js`. `createHistory` — `src/core/history.js`.
`createEmptyGraph`, `createDemoGraph`, `normalizeGraph` — `src/model/schema.js`.
`exportGraphToURL`, `importGraphFromURL` — `src/persistence/urlCodec.js`.
Bloque de eventos `mousedown/mousemove/mouseup/touchstart/touchmove/touchend`, `snapNodesToGrid`, `runPretty`, `runPrettyNoHistory`, `updateFabBadge`, `updateStatusBadge`, `store.subscribe` — `src/app/main.js`.

### Constantes inspeccionadas
`MIN_NODE_GAP=110`, `MIN_CLUSTER_GAP=70`, `LABEL_PADDING=45` (declarada, **sin uso real**), `EDGE_LABEL_PADDING=28` (declarada, **sin uso real** confirmado por grep), `MAX_GRID_COLS=6`, `ARC_RADIUS=130`, `MAX_COLLISION_ITER=35`, `REPEAT_GROUP_MIN=3`, `FANOUT_THRESHOLD=4`, `GRID_SIZE=20`, `BASE_HGAP=170`, `BASE_VGAP=215`, `COMP_PAD=190`, `PARK_MARGIN=90`, `GROUP_HGAP=120`, `GROUP_VGAP=115`, `GROUP_BELOW_GAP=155`, `SIDE_OFFSET=145`, `ORGANIC_PULL=0.40`, `ROLE_TIER` (mapa fijo) — todas en `prettyLayout.js`.
`GRID=130`, `COLS=5`, `COLL_DIST=85` — `positionManager.js`.
`SNAP_GRID=150` — `main.js`.
`NODE_EDGE_RADIUS=26` — `renderer.js`.
Caja de nodo `90×112` — `hitTest.js`. Tamaños CSS: `.node{width:86px}`, `.node-icon{48×48px}` — `style.css`.

### Comandos ejecutados
```
git log --oneline -1 && git branch --show-current && git status --short
node --version                                  → v24.12.0
npm test                                        → 47/47 tests OK (0 fallos), 151.9ms
```
Y una serie de scripts de sondeo temporales (Node.js ESM, `import()` directo de `src/app/prettyLayout.js`), ejecutados desde la carpeta scratchpad de la sesión, **fuera del repositorio** y **no incluidos en el commit/diff**:
- Aplicación de Pretty sobre `src/examples/dmz.json` (1×, 5× acumulativo, con `nodes`/`links` invertidos) — idempotencia y orden-independencia.
- 10 topologías sintéticas construidas en memoria: estrella 30 endpoints, dos laboratorios, anillo de 8 switches, dos ISP, servidor dual-homed, 5 nodos aislados, nodo único, prefijos inconsistentes, cadena de 3 PCs sin backbone, estrella de 5 PCs sin backbone, mixto (backbone + no-backbone).
- Medición de tiempo de ejecución: switch+N PCs para N∈{10,50,100,250,500}; malla completa para N∈{20,40}.

### Resultados clave de los scripts (resumen; detalle inline en §4-§13)
- DMZ doble firewall: `fw1(620,400)`, `fw2(780,400)` — mismo tier Y, lado a lado. bbox 320×700 (aspect 0.46, muy vertical).
- Idempotencia: Pretty×1 == Pretty×5 exacto. Orden invertido de `nodes[]`/`links[]`: resultado idéntico.
- Anillo de 8 switches: los 8 nodos quedan en `y=400` (una sola fila), `bbox.h = 0`.
- Componente sin backbone (estrella de 5 PCs sin switch): el nodo *hub* queda en un extremo de una fila recta, no centrado.
- Rendimiento Pretty: N=500 (estrella) → 65.62ms; malla N=40 (780 enlaces) → 44.04ms.

### Estado final de Git (verificado al cierre de esta auditoría)
```
$ git status --short
M  .claude/settings.local.json      ← preexistente al inicio de la sesión, no modificado por esta auditoría
?? .claude/skills/                  ← preexistente
?? bench/                           ← preexistente
?? paper/                           ← preexistente
?? AUDITORIA_DIAGRAMA.md            ← ÚNICO archivo nuevo generado por esta auditoría

$ git diff --stat
(sin salida — no hay modificaciones a archivos ya trackeados por git)
```
`.claude/settings.local.json`, `.claude/skills/`, `bench/` y `paper/` ya figuraban como cambios pendientes en el `git status` inicial de la sesión (ver contexto de la tarea) y **no fueron tocados** por este trabajo.

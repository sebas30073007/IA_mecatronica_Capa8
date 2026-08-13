# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Start the local server (serves frontend + API)
npm start
# Server runs at http://localhost:3000 by default

# Environment variables (.env file)
PORT=3000
HOST=0.0.0.0
LLM_PROVIDER=groq          # "groq" or "ollama"
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
OLLAMA_URL=http://127.0.0.1:11434
MODEL=qwen3:8b             # Ollama model
CAPA8_TOKEN=your_token     # Optional auth token
```

The project has no build step — all frontend files are plain HTML/CSS/JS served directly by Express.
Pages: `index.html` (AI chat), `diagrams.html` (simulator), `about.html`, `debug.html`.

## Architecture Overview

Two-experience web app for networking education:
1. **AI Chat** (`index.html` + `src/index.js`) — conversational AI with Nivel × Enfoque mode system.
2. **Network Diagram Simulator** (`diagrams.html` + `src/app/main.js`) — SVG topology editor with packet simulation and AI panel.

Both pages share a conversation store (`src/ai/convStore.js`) via `sessionStorage`.

### Backend (`server.js`)
- Express server: `POST /api/chat`, `POST /api/debug-chat`, `GET /api/health`
- Dual LLM support: routes to **Groq** (cloud) or **Ollama** (local) based on `LLM_PROVIDER`
- `buildPrompt({ message, nivel, enfoque, intentType, history, graphContext })` composes system + user prompt
- `DIAGRAM_DIRECTIVE` injected into Ollama `system` field only when `intentType` is an action (not a query)
- Auto-retry: if no `[CAPA8_ACTION]` blocks on action request, retries once with stricter prompt
- Temperature varies by intent: `0.0` for `modify_*`, `0.2` for queries, `0.7` for conceptual

### AI Pipeline (`src/ai/`)
- `modes.js` — `NIVELES` (guiado/balanceado/tecnico) × `ENFOQUES` (disenar/solver); `getSystemPrompt(nivel, enfoque)`
- `intentRouter.js` — `classifyIntent(message, graph, surface)` → `{ type, confidence, extractedRefs }`
  - Types: `solver`, `query_graph`, `conceptual`, `modify_clear`, `modify_ambiguous`, `apply_graph`
- `convStore.js` — singleton sessionStorage store (`capa8_shared_conv`); cross-page; max 40 messages
- `responseParser.js` — `parseResponse(rawText)` → `{ text, actions[], clarificationAsked }`; extracts `[CAPA8_ACTION]{...}[/CAPA8_ACTION]` blocks
- `context-builder.js` — `buildGraphContext(graph, selection)` serializes graph + topology issues for the LLM prompt
- `actionValidator.js` — `validateAction(action, graph)` → `{ valid, error?, warnings? }`; checks types, IPs, node existence, duplicates
- `actionDispatcher.js` — `createActionDispatcher(deps)` factory; `handleAIAction` / `handleAIActions` (batch with single undo)
- `clarifier.js` — `generateClarificationState()` / `buildClarifiedMessage()` for ambiguous commands
- `topology-analyzer.js` — `analyzeTopology(graph)` detects 8 issue types (duplicate IPs, isolated nodes, no gateway, etc.)

### Frontend State Management (`src/core/`)
Custom Redux-like store (no external libraries):
- `store.js` — `createStore({ initialState, reducer })` → `{ getState(), dispatch(), subscribe() }`
- `actions.js` — all `ActionTypes` constants (frozen object)
- `reducer.js` — pure reducer; `UPDATE_LINK` uses `payload.patch` (not `payload.changes`)
- `history.js` — 60-snapshot undo/redo stack

### Graph Data Model (`src/model/`)
- `schema.js` — graph v3: `{ version:3, meta, nodes[], links[] }`. Node types: `"router"|"switch"|"pc"|"firewall"|"server"|"cloud"|"ap"|"plc"|"ur3"|"agv"`. Always use `normalizeGraph()` on import.
- `graph.js` — `bfsPath()`, `computeRttMs()`, `buildAdjacency()`, `linksForNode()`, `findNode()`, `findNodeByIp()`
- `addressing.js` — `isIPv4()`, `suggestIp(type, seed)`, `parseMask()`, `prefixToDotted()`, `generateMac()`, `networkAddress()`

### Rendering (`src/render/`)
- `renderer.js` — DOM divs for nodes (FontAwesome icons) + SVG for links/packets; `_seenNodeIds` Set drives `.node--entering` CSS animation on new nodes; fan-out links (switch with ≥4 PC neighbors) drawn with reduced opacity — that is the only thing `FANOUT_THRESHOLD` still governs
- Link labels are decided by **geometry, not device type**, in three exported pure functions: `buildLabelBoxes` (label box + priority per link), `planLinkLabels` (visibility), `planParallelOffsets` (perpendicular offset for links sharing a node pair). A label survives if the link is important (selected, hovered, down, on a ping's path), its cluster of mutually-close labels is smaller than 3, and its box does not overlap one already placed. Ties break by link id so labels do not flicker between repaints.
- Hidden labels stay in the DOM at `opacity: 0` (`.link-label--oculta`) and are revealed on hover by toggling `.link-label--revelada`. The hover lives in a `main.js` local, **never in the store** — a dispatch per `mousemove` would repaint the whole canvas dozens of times a second. `renderStage` takes `hoveredLinkId` as a parameter so an unrelated repaint does not drop the reveal.
- `hitTest.js` — rectangle hit detection for nodes, 10 px tolerance line-distance for links

### Simulation (`src/sim/engine.js`)
- `requestAnimationFrame` loop; packet: `{ id, linkId, progress, direction: "ab"|"ba", kind: "icmp" }`
- Speed multiplier via store; `enqueuePathAnimation(linkIds, direction)` for ping/traceroute visualization

### Layout & Positioning (`src/app/`)
- `main.js` — main entry; wires store, engine, all UI panels, touch/drag, zoom/pan
- `positionManager.js` — grid placement for new nodes, and collision push-apart after a manual drag. It no longer implements collision itself: it calls the engine's `resolveCollisions` with the just-dropped node as the fixed anchor, so a Pretty-organized diagram and a hand-adjusted one obey the same rule.
- `layout/` — the auto-layout engine ("Pretty"). Split by concern:
  - `index.js` — `computeLayout(graph) → Map<id,{x,y}>` is **pure**; `prettyLayout({graph, dispatch, ActionTypes})` applies it. History is the caller's job, not the engine's.
  - `geometry.js` — node box, spacings, `resolveCollisions`, segment primitives. Collision is **box-based, not circular**: the node is a 90×112 box, so two nodes only need clearance on **one** axis — `MIN_GAP_X=98` or `MIN_GAP_Y=120` (`NODE_W/H + NODE_MARGIN`). There is no single center-to-center radius anymore. The push goes along the axis of least penetration, which is what keeps a row a row.
  - `topology.js` — `inferRole`, `detectComponents`, `sortByLabel`, plus the layering: `pickRoot`, `computeLayers` (BFS-level cycle break + longest path), `findMainPath`, `isParallelPair`. **`ROLE_TIER` no longer decides vertical position** — only backbone-vs-leaf, and root choice when it is trustworthy (tier ≤ 2 comes from unambiguous device types; below that the topology decides).
  - `groups.js` — semantic groups + the 6 shapes (grid/arc/fanout/chain/bus-side/pair-lanes); exports `FANOUT_THRESHOLD`, which `renderer.js` reads
  - `candidates.js` — generates layout variants (vertical, folded left/right, 1–2 folds) and returns the best-scoring one; also component packing
- Three rules make the drawing read as a pyramid rather than leaning to one side. All three were added together and they depend on each other:
  1. **Parent over the centre of its children.** The barycenter passes used to only *reorder* a row — `layRow` re-centres it on the frame's `cx`, which is the same for every tier, so a one-node trunk stayed pinned to the canvas centre while its children spread sideways. A bottom-up pass now aims each node at the mean x of its spine successors.
  2. **Folding is a remedy for height, not a way to gain width.** Only offered as a candidate when the unfolded variant is taller than wide (`esColumna`). Folding puts tiers in separate columns, which disables rule 1 across the fold — doing that to an already-wide tree is what made `campus` lean.
  3. **A single leaf hanging off a node that keeps descending goes to the side, not below** (`assignGroupSides(groups, anchorConHijos)`), dropped by half a level so it reads as a diagonal branch. Restricted to **one-node** groups on purpose: a row of 2+ placed laterally is collinear with its anchor, so the link to the far node passes over the near one.
- `ORGANIC_PULL` skips any node with spine successors — it exists to break a perfectly straight column, which directly contradicts rule 1 and turned folded columns into diagonal staircases.
- After the groups are placed, a **compaction pass** lifts each block by the slack that is actually free. Tier spacing is computed per whole tier, so a node pays for the leaf groups hanging off its siblings even when they are far away horizontally (`mpls_wan`'s PE-Cali hung three times lower than its peers). The two limits it must never cross: boxes near in x keep `MIN_GAP_Y`, and **linked** nodes keep a full `BASE_VGAP` so the link still reads downward and its label fits.
  - `scorer.js` — `scoreLayout` (picks between variants) and `layoutMetrics` (judges the engine across versions)
- Three invariants the engine must never lose, all covered by tests: **determinism** (same graph → same layout regardless of `nodes[]`/`links[]` order — never iterate a `Map` built from link order without sorting), **two connected infrastructure nodes never share a layer** (guaranteed by longest-path layering, not by special cases), and **no two node boxes overlap** (`boxOverlaps` is 0 for every topology in the bench, and the test asserts it with zero tolerance).
- The 20 px grid snap in `computeLayout` used to be the last step, and it could pull an already-separated pair back together (98 px → 660/740 → 80 px, overlapping again). The snap is now followed by a **guarantee pass**: `resolveCollisions(..., quantum: GRID_SIZE)` pushes in grid multiples, so it fixes overlaps without leaving the grid and nothing needs re-snapping afterwards. Never add a step after it that moves nodes off-grid.
- `resolveCollisions` only knows about pairs, so it can leave a grid row stepped by a few px. `snapshotRows`/`realignRows` record which grouped nodes shared a `y` before the push and restore that `y` afterwards — but only when doing so does not create a new overlap.
- `scoreLayout` has two tiers of terms: correctness (overlaps, crossings, edge-through-node, reading order) on an open scale, and composition (aspect, area, edge length) clamped to 0..1 with smaller weights. Composition terms are **tiebreakers only** — they must never outweigh a single crossing.
- **Orientation** — `computeLayout(graph, { orientation })` picks one of two composition profiles in `scorer.js` `ORIENTACIONES`: `horizontal` (desktop, the default — aspect target 16/9, folds the column from 3 layers up) and `vertical` (mobile — aspect target 0.62, effectively never folds). These are **two constants, not the viewport size**: determinism holds within an orientation, and the window can be resized without the layout changing. `main.js` reads `window.innerWidth` only at the moment Pretty runs (≤820 px → vertical), never on resize — spinning the diagram under the user because they resized would be worse than leaving it. Bench both with `node bench/layout_bench.mjs --orientation vertical`; the committed baseline is the desktop one.
- Anything that repositions many nodes dispatches **one** `APPLY_LAYOUT`, never N `MOVE_NODE` — each dispatch deep-clones the state and repaints the whole canvas.
- `bench/layout_bench.mjs` prints the metric table for all examples; `--diff ref.json` compares two runs. `tests/fixtures/layout-baseline.json` is the committed baseline.
- Determinism is a hard invariant, covered by `tests/prettyLayout.test.js`: same graph → same layout, whatever the order of `nodes[]`/`links[]`. Never iterate a `Map` built from `links` order without sorting first.

### Persistence (`src/persistence/`)
- `urlCodec.js` — Base64 UTF-8 graph in `?g=` query param; `exportGraphToURL()` / `importGraphFromURL()`
- `fileIO.js` — JSON export (timestamped filenames) / import with v3 validation

### UI Panels (`src/ui/`)
- `menuBar.js` / `menuConfig.js` — dropdown menus: Archivo, Dibujar, Ajustes, Ejemplos
- `inspectorPanel.js` — property editor for selected node or link; `onOpenAdvanced` callback opens modal
- `advancedModal.js` — `createAdvancedModal()` blocking modal with media presets for links and educational info for nodes
- `terminalPanel.js` — virtual CLI: `ping`, `traceroute`, `ipconfig`, `show interfaces`, `show arp`, `route print`; `onPingFail` callback
- `chatPanel.js` — AI side panel in diagrams.html; batch apply preview if ≥3 actions; clarification flow
- `previewPanel.js` — `showPreviewPanel(items, callbacks)` modal to review batch AI actions before applying
- `shortcutManager.js` — keyboard shortcuts: Delete, Ctrl+Z/Y, R/S/P/F/N/A/L/I/O tool keys
- `toast.js` — `showToast(message, type)` transient notifications

### Chat Frontend (`src/index.js`)
- ES module; imports from `convStore`, `responseParser`, `modes`, `intentRouter`
- POST `/api/chat` with `{ message, nivel, enfoque, intentType, history, graphContext }`
- History from `convStore.getHistory(10)`; responses parsed with `parseResponse()`
- Detects `apply_graph` action → shows `.topology-open-btn` link to `diagrams.html?g=...`

### Examples (`src/examples/`)
- `index.js` — exports `EXAMPLES` array with name + JSON path for each topology
- JSON files: `small_lan`, `vlan_routing`, `wan_redundant`, `data_center`, `home_network`, `dmz`, `campus`

## Key Conventions
- **No build tooling** — vanilla ES6 modules via `<script type="module">`. No TypeScript, no bundler.
- **Graph version** — always `version: 3`; call `normalizeGraph()` on any import (see `schema.js`).
- **Dispatch-then-render** — all state changes via `store.dispatch()`; `main.js` subscriber calls `renderStage()` on every change.
- **UPDATE_LINK** — reducer expects `payload.patch` (partial object), not `payload.changes`.
- **Language** — UI labels and comments in Spanish; code identifiers in English.
- **LLM provider** — controlled by `LLM_PROVIDER` env var; never hardcode Ollama or Groq URLs in frontend.
- **Action flow** — always validate with `actionValidator.js` before dispatching AI actions; never dispatch unvalidated JSON from LLM.

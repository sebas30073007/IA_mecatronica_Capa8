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
- `renderer.js` — DOM divs for nodes (FontAwesome icons) + SVG for links/packets; `_seenNodeIds` Set drives `.node--entering` CSS animation on new nodes; fan-out links (switch with ≥4 PC neighbors) rendered with reduced opacity and no labels
- `hitTest.js` — rectangle hit detection for nodes, 10 px tolerance line-distance for links

### Simulation (`src/sim/engine.js`)
- `requestAnimationFrame` loop; packet: `{ id, linkId, progress, direction: "ab"|"ba", kind: "icmp" }`
- Speed multiplier via store; `enqueuePathAnimation(linkIds, direction)` for ping/traceroute visualization

### Layout & Positioning (`src/app/`)
- `main.js` — main entry (1 030 lines); wires store, engine, all UI panels, touch/drag, zoom/pan
- `positionManager.js` — collision resolution and grid-snap positioning for new nodes
- `prettyLayout.js` — Falstad-inspired force-directed layout; `prettyLayout(graph)` and `prettyLayoutSuave(graph)`

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

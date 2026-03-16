# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Start the local server (serves frontend + API)
npm start
# Server runs at http://localhost:3000 by default

# Environment variables (optional overrides)
PORT=3000
HOST=localhost
OLLAMA_URL=http://localhost:11434
MODEL=gemma3:4b
CAPA8_TOKEN=your_token   # Optional auth token
```

The project has no build step — all frontend files are plain HTML/CSS/JS served directly by Express. Open `index.html` (chat) or `diagrams.html` (simulator) via the server.

## Architecture Overview

This is a two-experience web app for networking education:
1. **AI Chat** (`index.html` + `server.js`) — AI assistant with three modes (Problem Solving, Network Architect, Dev. Junior) powered by a local Ollama LLM.
2. **Network Diagram Simulator** (`diagrams.html` + `src/app/`) — Interactive SVG-based topology editor with packet simulation.

### Backend (`server.js`)
- Express server exposing `/api/chat` (POST) and `/api/health` (GET)
- Proxies requests to Ollama, building prompts with full conversation history
- Mode is passed per-request; each mode has a distinct system prompt

### Frontend State Management (`src/core/`)
The diagram simulator uses a custom Redux-like store (no external libraries):
- `store.js` — minimal pub-sub store with `getState()`, `dispatch()`, `subscribe()`
- `actions.js` — all action type constants
- `reducer.js` — pure reducer; also holds the initial state shape
- `history.js` — 60-snapshot undo/redo stack

### Graph Data Model (`src/model/`)
- `schema.js` — canonical graph structure (v3): `{ version, meta, nodes[], links[] }`. Node types: `"router" | "switch" | "pc"`.
- `graph.js` — BFS path finding, RTT calculation, adjacency list building
- `addressing.js` — IPv4 utility helpers

### Rendering (`src/render/`)
- `renderer.js` — draws nodes (DOM divs with FontAwesome icons) and links/packets (SVG)
- `hitTest.js` — rectangular node hit detection and line-distance link hit detection (10 px tolerance)

### Simulation (`src/sim/engine.js`)
- `requestAnimationFrame` loop managing packets (progress 0→1 along a link)
- Packet object: `{ id, linkId, progress, direction: "ab"|"ba", kind: "icmp" }`
- Simulation speed multiplier exposed via store

### Persistence (`src/persistence/`)
- `urlCodec.js` — encodes the entire graph as Base64 UTF-8 in `?g=` query param (Falstad-style); restores on load via `window.history.pushState`
- `fileIO.js` — JSON import/export with timestamped filenames

### UI Panels (`src/ui/`)
- `menuBar.js` / `menuConfig.js` — dropdown menus (Archivo, Dibujar, Ajustes)
- `inspectorPanel.js` — property editor for selected node or link
- `terminalPanel.js` — virtual CLI: `ping <ip>`, `ipconfig`, `help`, `clear`; `ping` triggers BFS path animation
- `shortcutManager.js` — keyboard shortcuts (Delete, Ctrl+Z/Y, tool keys)

### Chat Frontend (`src/index.js`)
- POST to `/api/chat` with `{ message, mode, history }` (history capped at last 10 turns)
- Mode buttons update a local variable; no persistent state between page loads

## Key Conventions
- **No build tooling** — vanilla ES6 modules loaded via `<script type="module">`. No TypeScript, no bundler.
- **Graph version** — always set `version: 3` when creating or migrating graph objects (see `schema.js`).
- **Dispatch-then-render** — all state changes go through `store.dispatch()`; the main loop in `main.js` subscribes to re-render on every state change.
- **Language** — UI labels and comments are in Spanish; code identifiers are in English.

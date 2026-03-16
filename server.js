import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getSystemPrompt, getNivelSnippet, getEnfoqueSnippet, normalizeNivel, normalizeEnfoque } from "./src/ai/modes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===== Config =====
const PORT         = process.env.PORT         || 3000;
const HOST         = process.env.HOST         || "0.0.0.0";
const API_TOKEN    = process.env.CAPA8_TOKEN  || "";

// ── Proveedor LLM ──────────────────────────────────────────────────────────
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase(); // "groq" | "ollama"

// Ollama
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://127.0.0.1:11434";
const MODEL        = process.env.MODEL        || "qwen3:8b";

// Groq
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL   = process.env.GROQ_MODEL   || "llama-3.3-70b-versatile";
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";

// Nombre activo para logs y /api/health
const ACTIVE_MODEL = LLM_PROVIDER === "groq" ? GROQ_MODEL : MODEL;

// CORS — abierto para permitir peticiones desde GitHub Pages y cualquier origen
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Capa8-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "2mb" }));

app.get("/server.js", (_, res) => res.status(404).end());
app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("/api/health", (_, res) => res.json({ ok: true, model: ACTIVE_MODEL, provider: LLM_PROVIDER }));

// ===== Modos y prompts =====

// Base identity injected into every prompt
const BASE_PERSONA = `Eres el asistente de CAPA 8, especializado en redes de computadoras. Responde SIEMPRE en español. Si el usuario escribe en otro idioma, responde en español de todas formas.`;

// Injected FIRST when graphContext is present so the small model prioritizes actions over prose
const DIAGRAM_DIRECTIVE = `SYSTEM ROLE: You are the CAPA 8 diagram assistant. You control a network topology editor.

OUTPUT FORMAT — STRICT RULES:
- When the user asks to add, create, modify, or delete diagram elements: emit [CAPA8_ACTION] blocks ONLY.
- NEVER use Mermaid, PlantUML, ASCII art, markdown code blocks, or any other diagram format.
- NEVER ask clarifying questions before acting. Act immediately.
- One [CAPA8_ACTION] block per atomic action. Emit as many blocks as needed.
- Outside the blocks: one short sentence max describing what you did.
- NEVER include "x" or "y" coordinates in add_node actions — the frontend assigns positions automatically.

WRONG output (FORBIDDEN - never do this):
\`\`\`mermaid
graph LR
    PC1 --> Switch1
\`\`\`

CORRECT output (always do this):
Agregando PC1 y conectándola al Switch1.
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC1","ip":"192.168.1.10"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"PC1","targetLabel":"Switch1","latencyMs":2,"bandwidthMbps":100}
[/CAPA8_ACTION]

MORE EXAMPLES:

User: "agrega 2 PCs"
Assistant: Agregando 2 PCs.
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC1","ip":"192.168.1.10"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC2","ip":"192.168.1.11"}
[/CAPA8_ACTION]

User: "conecta PC1 al Switch1"
Assistant: Enlazando PC1 → Switch1.
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"PC1","targetLabel":"Switch1","latencyMs":2,"bandwidthMbps":100}
[/CAPA8_ACTION]

User: "elimina Router2"
Assistant: Eliminando Router2.
[CAPA8_ACTION]
{"action":"delete_node","label":"Router2"}
[/CAPA8_ACTION]

User: "diseña una red de oficina con 1 router, 1 switch y 3 PCs"
Assistant: Creando red de oficina.
[CAPA8_ACTION]
{"action":"add_node","type":"router","label":"Router1","ip":"192.168.1.1"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_node","type":"switch","label":"Switch1","ip":""}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC1","ip":"192.168.1.10"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC2","ip":"192.168.1.11"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_node","type":"pc","label":"PC3","ip":"192.168.1.12"}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"Router1","targetLabel":"Switch1","latencyMs":1,"bandwidthMbps":1000}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"Switch1","targetLabel":"PC1","latencyMs":2,"bandwidthMbps":100}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"Switch1","targetLabel":"PC2","latencyMs":2,"bandwidthMbps":100}
[/CAPA8_ACTION]
[CAPA8_ACTION]
{"action":"add_link","sourceLabel":"Switch1","targetLabel":"PC3","latencyMs":2,"bandwidthMbps":100}
[/CAPA8_ACTION]

AVAILABLE ACTIONS:
- add_node: {"action":"add_node","type":"router"|"switch"|"pc"|"firewall"|"server"|"cloud"|"ap"|"plc"|"ur3"|"agv","label":"NAME","ip":"x.x.x.x"}
  NOTE: Do NOT include "x" or "y" — positions are assigned automatically by the frontend.
- add_link: {"action":"add_link","sourceLabel":"NAME","targetLabel":"NAME","latencyMs":NUMBER,"bandwidthMbps":NUMBER}
- delete_node: {"action":"delete_node","label":"NAME"}
- delete_link: {"action":"delete_link","sourceLabel":"NAME","targetLabel":"NAME"}
- set_link_status: {"action":"set_link_status","sourceLabel":"NAME","targetLabel":"NAME","status":"up"|"down"}

For technical questions that do NOT modify the diagram, answer normally without [CAPA8_ACTION] blocks.`;

// Temperature by intent type
const INTENT_TEMPS = {
  query_graph: 0.2,
  conceptual: 0.2,
  modify_clear: 0.0,
  modify_ambiguous: 0.1,
  solver: 0.1,
  apply_graph: 0.0,
};

// Injected in chat mode (index.html) when user asks to design a topology
const TOPOLOGY_GUIDE = `
REGLA OBLIGATORIA — GENERACIÓN DE TOPOLOGÍAS:
Cuando el usuario pida diseñar, crear, generar, construir o armar una red o topología, DEBES responder ÚNICAMENTE con un bloque [CAPA8_ACTION] de tipo apply_graph que contenga el grafo completo. NUNCA describas la red en texto corrido. NUNCA preguntes "¿necesitas algo más?" antes de generar. Genera primero, comenta brevemente después si hace falta.

CORRECTO — emite el bloque directamente:
[CAPA8_ACTION]
{"action":"apply_graph","graph":{"version":3,"meta":{"label":"Red LAN","updatedAt":0},"nodes":[{"id":"n1","type":"router","label":"Router1","x":300,"y":150,"ip":"192.168.1.1"},{"id":"n2","type":"switch","label":"Switch1","x":300,"y":300,"ip":""},{"id":"n3","type":"pc","label":"PC1","x":150,"y":450,"ip":"192.168.1.10"},{"id":"n4","type":"pc","label":"PC2","x":450,"y":450,"ip":"192.168.1.11"}],"links":[{"id":"l1","source":"n1","target":"n2","latencyMs":2,"bandwidthMbps":1000,"lossPct":0,"status":"up"},{"id":"l2","source":"n2","target":"n3","latencyMs":1,"bandwidthMbps":100,"lossPct":0,"status":"up"},{"id":"l3","source":"n2","target":"n4","latencyMs":1,"bandwidthMbps":100,"lossPct":0,"status":"up"}]}}
[/CAPA8_ACTION]

INCORRECTO — NO hagas esto: "La topología consiste en un router conectado a un switch y 2 PCs..."

Tipos de nodos válidos: "router", "switch", "pc", "firewall", "server", "cloud", "ap"
Campos de nodo: id (único, ej "n1"), type, label, x, y, ip
Campos de enlace: id (único, ej "l1"), source, target, latencyMs, bandwidthMbps, lossPct (0), status ("up")`;

// Strip markdown fences that small models wrap around [CAPA8_ACTION] blocks
function cleanAnswer(text) {
  return text
    .replace(/```(?:json|javascript|text|mermaid)?\s*(\[CAPA8_ACTION\])/gi, "$1")
    .replace(/(\[\/CAPA8_ACTION\])\s*```/gi, "$1")
    .trim();
}

// Seed exchange: one action example + one Q&A example (no action)
const SEED_EXCHANGE = [
  { role: "User",      content: "agrega un router llamado R1 con IP 10.0.0.1" },
  { role: "Assistant", content: 'Agregando R1.\n[CAPA8_ACTION]\n{"action":"add_node","type":"router","label":"R1","ip":"10.0.0.1"}\n[/CAPA8_ACTION]' },
  { role: "User",      content: "¿cuál es la diferencia entre un router y un switch?" },
  { role: "Assistant", content: "Un **router** trabaja en capa 3 (red) y conecta redes distintas tomando decisiones basadas en direcciones IP. Un **switch** trabaja en capa 2 (enlace) y conecta dispositivos dentro de la misma red local usando direcciones MAC.\n\nEn la topología usa el router como puerta de enlace hacia otras subredes y el switch para interconectar los equipos de cada segmento." },
];

// Keywords that indicate the user explicitly wants to modify the diagram
// Requires unambiguous imperative verbs (not questions, not "¿qué modifica X?")
const ACTION_KEYWORDS = /\b(agrega|agregar|añade|añadir|crea|crear|conecta|conectar|elimina|eliminar|diseña|diseñar|modifica\s+el|borra|borrar|quita|quitar|remueve|remover|pon|poner|inserta|insertar|add|create|connect|delete|remove|design)\b/i;

function buildPrompt({ nivel, enfoque, intentType, history, message, graphContext, flags = {} }) {
  const {
    useSystemParam = true,  // Move DIAGRAM_DIRECTIVE to Ollama `system` field
    useSeedHistory = true,  // Pre-seed history with one correct example
  } = flags;

  const nivelKey  = normalizeNivel(nivel);
  const enfoqueKey = normalizeEnfoque(enfoque);
  const isDiagramMode = Boolean(graphContext && typeof graphContext === "string" && graphContext.trim());
  const lines = [];
  let system = undefined;

  // Intents that should emit CAPA8_ACTION blocks
  const isActionIntent = isDiagramMode && (
    intentType === "modify_clear" ||
    intentType === "solver" ||
    intentType === "apply_graph" ||
    (!intentType && ACTION_KEYWORDS.test(String(message || "")))
  );

  if (isDiagramMode) {
    // Build system prompt: base persona + nivel + enfoque snippets
    const systemParts = [
      BASE_PERSONA,
      `\nEstilo: ${getNivelSnippet(nivelKey)}`,
      `\nEnfoque: ${getEnfoqueSnippet(enfoqueKey)}`,
    ];

    systemParts.push(`\n${DIAGRAM_DIRECTIVE}`);

    if (useSystemParam) {
      system = systemParts.join("\n");
    } else {
      lines.push(systemParts.join("\n"));
    }

    // Current topology state
    lines.push(`\n--- Topología actual ---\n${graphContext.trim()}\n---`);

    // Seed + real history
    const recentHistory = (history || []).slice(-6);
    if (useSeedHistory && isActionIntent) {
      lines.push("\nEjemplos de referencia:");
      for (const h of SEED_EXCHANGE) {
        lines.push(`${h.role}: ${h.content}`);
      }
    }
    if (recentHistory.length > 0) {
      lines.push("\nConversación:");
      for (const h of recentHistory) {
        const role = h.role === "assistant" ? "Assistant" : "User";
        const content = String(h.content || "")
          .replace(/\[CAPA8_ACTION\][\s\S]*?\[\/CAPA8_ACTION\]/g, "[acción aplicada]")
          .trim();
        lines.push(`${role}: ${content}`);
      }
    }

    lines.push(`\nSolicitud: "${String(message || "").trim()}"`);
    lines.push(isActionIntent
      ? "Assistant (emite bloques [CAPA8_ACTION] como en los ejemplos — sin Mermaid, sin code fences):"
      : "Assistant:");

  } else {
    // Chat mode (index.html): build system from nivel + enfoque + topology format rules
    system = getSystemPrompt(nivelKey, enfoqueKey) + "\n\n" + TOPOLOGY_GUIDE;
    lines.push("\nConversación (reciente):");
    for (const h of (history || [])) {
      const role = h.role === "assistant" ? "Asistente" : "Usuario";
      lines.push(`${role}: ${String(h.content || "").trim()}`);
    }
    lines.push(`Usuario: ${String(message || "").trim()}`);
    lines.push("[INSTRUCCIÓN CRÍTICA: Responde SIEMPRE en español en tu siguiente mensaje]");
    lines.push("Asistente:");
  }

  return { prompt: lines.join("\n"), system, isDiagramMode, isActionIntent };
}

// ===== Capa de abstracción LLM =====
// Recibe prompt (string estilo Ollama), system (string|undefined) y temperature.
// Devuelve el texto generado o lanza un Error.
async function callLLM(prompt, system, temperature) {
  if (LLM_PROVIDER === "groq") {
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY no configurada en .env");

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature }),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Groq error ${r.status}: ${txt}`);
    }

    const data = await r.json();
    return data.choices?.[0]?.message?.content || "";

  } else {
    // Ollama
    const body = { model: MODEL, prompt, stream: false, options: { temperature } };
    if (system) body.system = system;

    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Ollama error ${r.status}: ${txt}`);
    }

    const data = await r.json();
    return data.response || "";
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    if (API_TOKEN) {
      const got = req.headers["x-capa8-token"] || "";
      if (got !== API_TOKEN) return res.status(401).json({ error: "Unauthorized" });
    }

    const { message, mode, nivel, enfoque, intentType, history, graphContext } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message requerido" });
    }

    const { prompt, system, isDiagramMode, isActionIntent } = buildPrompt({
      nivel: nivel || mode, enfoque, intentType, history, message, graphContext,
    });

    const temp = INTENT_TEMPS[intentType] ?? (isActionIntent ? 0.0 : isDiagramMode ? 0.1 : 0.2);

    let raw;
    try {
      raw = await callLLM(prompt, system, temp);
    } catch (e) {
      return res.status(502).json({ error: "LLM error", detail: String(e.message) });
    }
    let answer = cleanAnswer(raw);

    // Auto-retry: modo diagrama — si se esperaba acción pero no llegó bloque
    const isActionRequest = isActionIntent || ACTION_KEYWORDS.test(message);
    if (isDiagramMode && !(/\[CAPA8_ACTION\]/.test(answer)) && isActionRequest) {
      const retryPrompt = `${prompt}\n\nIMPORTANT: Previous response had no [CAPA8_ACTION] blocks. You MUST emit [CAPA8_ACTION] JSON blocks for: "${String(message).trim()}". No explanations, no Mermaid, only [CAPA8_ACTION] blocks.`;
      try {
        const retryAnswer = cleanAnswer(await callLLM(retryPrompt, system, 0.0));
        if (/\[CAPA8_ACTION\]/.test(retryAnswer)) answer = retryAnswer;
      } catch (_) { /* retry failed — keep original answer */ }
    }

    // Auto-retry: modo chat (index.html) — si pidió topología pero no generó bloque
    const TOPOLOGY_KEYWORDS = /\b(diseña|diseñar|crea|crear|genera|generar|haz|hacer|construye|construir|arma|armar|topolog[ií]a|red\s+de|red\s+con|una\s+red)\b/i;
    if (!isDiagramMode && TOPOLOGY_KEYWORDS.test(message) && !(/\[CAPA8_ACTION\]/.test(answer))) {
      const retryPrompt = `${prompt}\n\nRECUERDA: Debes responder con un bloque [CAPA8_ACTION] apply_graph completo con el grafo JSON. NO describas la red en texto. Emite el bloque directamente.`;
      try {
        const retryAnswer = cleanAnswer(await callLLM(retryPrompt, system, 0.0));
        if (/\[CAPA8_ACTION\]/.test(retryAnswer)) answer = retryAnswer;
      } catch (_) { /* retry failed */ }
    }

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
});

// ===== Debug endpoint — returns prompt + raw response for debug.html =====
app.post("/api/debug-chat", async (req, res) => {
  try {
    const { message, mode, nivel, enfoque, intentType, history, graphContext, temperature, flags } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message requerido" });
    }

    // flags from debug.html checkboxes: { useSystemParam, useSeedHistory, useAutoRetry }
    const resolvedFlags = {
      useSystemParam: flags?.useSystemParam ?? true,
      useSeedHistory: flags?.useSeedHistory ?? true,
    };
    const useAutoRetry = flags?.useAutoRetry ?? true;

    const { prompt, system, isDiagramMode, isActionIntent } = buildPrompt({
      nivel: nivel || mode, enfoque, intentType, history, message, graphContext, flags: resolvedFlags,
    });
    const temp = temperature != null ? Number(temperature) : (INTENT_TEMPS[intentType] ?? (isActionIntent ? 0.0 : isDiagramMode ? 0.1 : 0.2));

    const start = Date.now();
    let rawAnswer;
    try {
      rawAnswer = (await callLLM(prompt, system, temp)).trim();
    } catch (e) {
      return res.status(502).json({ error: "LLM error", detail: String(e.message) });
    }
    const elapsedMs = Date.now() - start;

    let answer = cleanAnswer(rawAnswer);
    let retried = false;

    // Auto-retry if flag enabled and no blocks on action request
    const isActionRequest = isActionIntent || ACTION_KEYWORDS.test(message);
    if (useAutoRetry && isDiagramMode && !(/\[CAPA8_ACTION\]/.test(answer)) && isActionRequest) {
      const retryPrompt = `${prompt}\n\nIMPORTANT: Previous response had no [CAPA8_ACTION] blocks. You MUST emit [CAPA8_ACTION] JSON blocks for: "${String(message).trim()}". No explanations, no Mermaid, only [CAPA8_ACTION] blocks.`;
      try {
        const retryAnswer = cleanAnswer(await callLLM(retryPrompt, system, 0.0));
        if (/\[CAPA8_ACTION\]/.test(retryAnswer)) { answer = retryAnswer; retried = true; }
      } catch (_) { /* retry failed */ }
    }

    res.json({ answer, rawAnswer, promptSent: prompt, systemSent: system || null, isDiagramMode, elapsedMs, model: ACTIVE_MODEL, provider: LLM_PROVIDER, temperature: temp, retried });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Capa8 server listo en http://${HOST}:${PORT}`);
  if (LLM_PROVIDER === "groq") {
    console.log(`Proveedor: Groq | Modelo: ${GROQ_MODEL}`);
  } else {
    console.log(`Proveedor: Ollama | URL: ${OLLAMA_URL} | Modelo: ${MODEL}`);
  }
});

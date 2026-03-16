// src/ui/chatPanel.js
// Panel de chat integrado en el simulador (diagrams.html).
import { API_BASE } from "../config.js";
import { buildGraphContext } from "../ai/context-builder.js";
import { analyzeTopology } from "../ai/topology-analyzer.js";
import { NIVELES, ENFOQUES } from "../ai/modes.js";
import { convStore } from "../ai/convStore.js";
import { parseResponse } from "../ai/responseParser.js";
import { classifyIntent } from "../ai/intentRouter.js";
import { generateClarificationState, buildClarifiedMessage } from "../ai/clarifier.js";
import { showPreviewPanel, actionsToPreviewItems } from "./previewPanel.js";

const MAX_HISTORY = 10;
// Batches above this threshold show a preview panel before applying
const PREVIEW_THRESHOLD = 2;

export function createChatPanel({ store, onApplyAction, onApplyActions }) {
  const panelEl = document.getElementById("ai-fab-panel");
  if (!panelEl) return null;

  // ── Init mode from convStore ─────────────────────────────────────────
  let currentNivel   = convStore.getState().nivel   || "balanceado";
  let currentEnfoque = convStore.getState().enfoque || "disenar";
  let quickActionsHidden = false;
  let msgCounter = 0;

  // ── Build DOM ───────────────────────────────────────────────────────────
  panelEl.innerHTML = `
    <div class="fab-panel-header">
      <span class="fab-panel-title">
        <i class="fa-solid fa-robot"></i> IA Asistente
      </span>
      <button class="fab-panel-close" id="fab-panel-close" title="Cerrar">✕</button>
    </div>
    <div class="fab-mode-row">
      <div class="fab-mode-group">
        <span class="fab-mode-label">NIVEL</span>
        ${Object.entries(NIVELES).map(([k, v]) =>
          `<button class="fab-nivel-chip${k === currentNivel ? " active" : ""}" data-nivel="${k}" title="${v.snippet}">${v.label}</button>`
        ).join("")}
      </div>
      <div class="fab-mode-group">
        <span class="fab-mode-label">MODO</span>
        ${Object.entries(ENFOQUES).map(([k, v]) =>
          `<button class="fab-enfoque-chip${k === currentEnfoque ? " active" : ""}" data-enfoque="${k}">${v.label}</button>`
        ).join("")}
      </div>
    </div>
    <div class="fab-messages" id="fab-messages"></div>
    <div class="fab-quick-actions" id="fab-quick-actions">
      <button class="fab-quick-btn" data-prompt="Analiza mi topología actual y dime qué ves">Analizar</button>
      <button class="fab-quick-btn" data-prompt="¿Cómo mejorarías esta red?">Optimizar</button>
      <button class="fab-quick-btn" data-prompt="Detecta y diagnostica problemas en esta topología">Diagnosticar</button>
    </div>
    <div class="fab-input-row">
      <input class="fab-input" id="fab-input" placeholder="Pregunta sobre tu red…" autocomplete="off" />
      <button class="fab-send-btn" id="fab-send-btn" title="Enviar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
      </button>
    </div>
  `;

  // ── References ──────────────────────────────────────────────────────────
  const messagesEl   = panelEl.querySelector("#fab-messages");
  const inputEl      = panelEl.querySelector("#fab-input");
  const sendBtn      = panelEl.querySelector("#fab-send-btn");
  const quickActions = panelEl.querySelector("#fab-quick-actions");

  // ── Close ───────────────────────────────────────────────────────────────
  panelEl.querySelector("#fab-panel-close").addEventListener("click", () => {
    panelEl.classList.remove("open");
  });

  // ── Nivel chips ─────────────────────────────────────────────────────────
  panelEl.querySelectorAll(".fab-nivel-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      panelEl.querySelectorAll(".fab-nivel-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentNivel = chip.dataset.nivel;
      convStore.setNivel(currentNivel);
    });
  });

  // ── Enfoque chips ───────────────────────────────────────────────────────
  panelEl.querySelectorAll(".fab-enfoque-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      panelEl.querySelectorAll(".fab-enfoque-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentEnfoque = chip.dataset.enfoque;
      convStore.setEnfoque(currentEnfoque);
    });
  });

  // ── Quick actions ───────────────────────────────────────────────────────
  panelEl.querySelectorAll(".fab-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const prompt = btn.dataset.prompt;
      if (prompt) sendMessage(prompt);
    });
  });

  // ── Input dynamic styling ───────────────────────────────────────────────
  inputEl.addEventListener("input", () => {
    sendBtn.classList.toggle("has-text", inputEl.value.trim().length > 0);
  });

  // ── Restore previous messages from convStore ────────────────────────────
  const prevMessages = convStore.getState().messages;
  if (prevMessages.length > 0) {
    quickActionsHidden = true;
    quickActions.hidden = true;
    for (const m of prevMessages) {
      _renderMessage(m.role, m.content);
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = (text !== undefined ? String(text) : inputEl.value).trim();
    if (!text) return;

    if (inputEl.value) {
      inputEl.value = "";
      sendBtn.classList.remove("has-text");
    }

    if (!quickActionsHidden) {
      quickActionsHidden = true;
      quickActions.hidden = true;
    }

    appendMessage("user", text);
    convStore.addMessage({ role: "user", content: text, surface: "diagrams", timestamp: Date.now() });

    // ── Intent classification ──────────────────────────────────────────
    const graph = store.getState().graph;
    const intent = classifyIntent(text, graph, "diagrams");

    // If ambiguous → start clarification flow
    if (intent.type === "modify_ambiguous") {
      const clarState = generateClarificationState(text, graph);
      convStore.setPendingClarification(clarState);
      _showClarificationStep(clarState);
      return;
    }

    await _callServer(text, intent.type);
  }

  async function _callServer(text, intentType) {
    const graph = store.getState().graph;
    const state = store.getState();
    const selection = state.ui?.selection || null;
    const graphContext = buildGraphContext(graph, selection);
    const thinkingId = appendTyping();
    sendBtn.disabled = true;
    inputEl.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          nivel: currentNivel,
          enfoque: currentEnfoque,
          intentType,
          graphContext,
          history: convStore.getHistory(MAX_HISTORY),
        }),
      });

      const data = await res.json();
      const rawAnswer = data.answer || data.error || "Sin respuesta.";
      const { text: cleanText, actions } = parseResponse(rawAnswer);

      replaceTyping(thinkingId, rawAnswer);

      convStore.addMessage({
        role: "assistant",
        content: rawAnswer,
        surface: "diagrams",
        timestamp: Date.now(),
        intentType,
        actions: actions.length > 0 ? actions : null,
      });

    } catch (err) {
      replaceTyping(thinkingId, `Error de conexión: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  // ── Clarification flow ──────────────────────────────────────────────────
  function _showClarificationStep(clarState) {
    const q = clarState.questions[clarState.currentQuestionIdx];
    if (!q) {
      // All answered — build clarified message and send
      const enriched = buildClarifiedMessage(clarState);
      convStore.clearClarification();
      _callServer(enriched, "modify_clear");
      return;
    }

    const cDiv = document.createElement("div");
    cDiv.className = "fab-msg assistant fab-clarification";

    const qText = document.createElement("p");
    qText.className = "fab-clarification-question";
    qText.textContent = q.question;
    cDiv.appendChild(qText);

    const optWrap = document.createElement("div");
    optWrap.className = "fab-clarification-options";

    for (const opt of q.options) {
      const btn = document.createElement("button");
      btn.className = "fab-clarification-opt";
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        // Record answer
        clarState.collectedAnswers[q.id] = opt.value;
        clarState.currentQuestionIdx++;
        // Disable all buttons in this step
        optWrap.querySelectorAll("button").forEach(b => b.disabled = true);
        btn.classList.add("selected");

        const updatedState = convStore.getState().pendingClarification;
        if (updatedState) {
          convStore.setPendingClarification({ ...updatedState, ...clarState });
        }
        _showClarificationStep(clarState);
      });
      optWrap.appendChild(btn);
    }

    cDiv.appendChild(optWrap);
    messagesEl.appendChild(cDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener("click", () => sendMessage());

  // ── Welcome message (only if no prior messages) ──────────────────────────
  function initWelcome() {
    if (convStore.getState().messages.length > 0) return;
    const graph = store.getState().graph;
    if (!graph?.nodes?.length) {
      appendMessage("assistant", "Canvas vacío. Crea nodos y podré analizarlos.");
    } else {
      const issues = analyzeTopology(graph);
      const n = graph.nodes.length, l = graph.links.length;
      let msg = `Veo ${n} nodo${n !== 1 ? "s" : ""} y ${l} enlace${l !== 1 ? "s" : ""}.`;
      const errors = issues.filter(i => i.severity === "error");
      const warnings = issues.filter(i => i.severity === "warning");
      if (errors.length) msg += `\n❌ ${errors.length} error${errors.length !== 1 ? "es" : ""} detectado${errors.length !== 1 ? "s" : ""}.`;
      if (warnings.length) msg += `\n⚠️ ${warnings.length} advertencia${warnings.length !== 1 ? "s" : ""}.`;
      appendMessage("assistant", msg);
    }
  }
  if (prevMessages.length === 0) initWelcome();

  // ── Public: refresh welcome when panel re-opens ──────────────────────────
  function refreshWelcome() {
    if (convStore.getState().messages.length === 0) {
      messagesEl.innerHTML = "";
      msgCounter = 0;
      quickActionsHidden = false;
      quickActions.hidden = false;
      initWelcome();
    }
  }

  // ── Public: notify from terminal on ping fail ────────────────────────────
  function notifyPingFail(ip) {
    if (panelEl.classList.contains("open")) {
      appendMessage("assistant", `Sin ruta a \`${ip}\`. ¿Quieres que analice la topología?\nPrueba **Diagnosticar** o pregúntame directamente.`);
    }
  }

  // ── Public: show validation error from handleAIAction ───────────────────
  function appendErrorMessage(text) {
    appendSystemMessage(`❌ ${text}`);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function appendMessage(role, text) {
    const id = _renderMessage(role, text);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
  }

  function _renderMessage(role, text) {
    const id = `fm-${++msgCounter}`;
    const div = document.createElement("div");
    div.className = `fab-msg ${role}`;
    div.id = id;
    if (role === "assistant") {
      renderAssistantContent(div, text);
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    return id;
  }

  function appendSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "fab-msg system";
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendTyping() {
    const id = `fm-${++msgCounter}`;
    const div = document.createElement("div");
    div.className = "fab-msg assistant fab-typing";
    div.id = id;
    div.innerHTML = `<span class="fab-dot"></span><span class="fab-dot"></span><span class="fab-dot"></span>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
  }

  function replaceTyping(id, text) {
    const el = messagesEl.querySelector(`#${id}`);
    if (!el) return;
    el.classList.remove("fab-typing");
    renderAssistantContent(el, text);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Parse CAPA8_ACTION blocks, render markdown, show Apply/Preview buttons.
  function renderAssistantContent(el, text) {
    const { text: cleanText, actions } = parseResponse(text);
    const validActions = actions.filter(a => a.valid);

    // Render the text part (markdown)
    el.innerHTML = marked.parse(cleanText || "");

    if (validActions.length === 0) return;

    if (validActions.length > PREVIEW_THRESHOLD) {
      // Show preview before applying
      const previewBtn = document.createElement("button");
      previewBtn.className = "fab-apply-btn fab-apply-btn--batch";
      previewBtn.innerHTML = `<i class="fa-solid fa-eye"></i> Ver y aplicar (${validActions.length} acciones)`;
      previewBtn.addEventListener("click", () => {
        const items = actionsToPreviewItems(validActions);
        showPreviewPanel(items, {
          onApply: async (parsedActions) => {
            previewBtn.disabled = true;
            previewBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Aplicando…`;
            const result = await onApplyActions?.(parsedActions);
            if (result?.errors?.length) {
              previewBtn.innerHTML = `⚠️ ${result.applied} aplicado(s), ${result.errors.length} error(es)`;
              appendSystemMessage(`⚠️ ${result.errors.join(" | ")}`);
            } else {
              previewBtn.innerHTML = `✅ ${result?.applied ?? parsedActions.length} acción(es) aplicada(s)`;
              appendSystemMessage(`✅ Aplicadas ${result?.applied ?? parsedActions.length} acción(es).`);
            }
          },
          onCancel: () => {},
        });
      });
      el.appendChild(previewBtn);

    } else if (validActions.length > 1) {
      // Batch mode — inline labels + single apply button
      const pendingLabels = validActions.map(a => {
        const p = a.parsed;
        return `[${p.action}${p.label ? ": " + p.label : ""}]`;
      }).join(" ");
      const pendingSpan = document.createElement("div");
      pendingSpan.className = "fab-action-pending";
      pendingSpan.textContent = pendingLabels;
      el.appendChild(pendingSpan);

      const batchBtn = document.createElement("button");
      batchBtn.className = "fab-apply-btn fab-apply-btn--batch";
      batchBtn.innerHTML = `<i class="fa-solid fa-circle-play"></i> Aplicar todo (${validActions.length} acciones)`;
      batchBtn.addEventListener("click", async () => {
        batchBtn.disabled = true;
        batchBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Aplicando…`;
        try {
          const result = await onApplyActions?.(validActions.map(a => a.parsed));
          if (result?.errors?.length) {
            batchBtn.innerHTML = `⚠️ ${result.applied} aplicado(s), ${result.errors.length} error(es)`;
            appendSystemMessage(`⚠️ ${result.errors.join(" | ")}`);
          } else {
            const count = result?.applied ?? validActions.length;
            batchBtn.innerHTML = `✅ ${count} acción(es) aplicada(s)`;
            appendSystemMessage(`✅ Aplicadas ${count} acción(es) al diagrama.`);
          }
        } catch (err) {
          batchBtn.innerHTML = "❌ Error al aplicar";
          appendSystemMessage(`❌ Error: ${err.message}`);
        }
      });
      el.appendChild(batchBtn);

    } else {
      // Single action
      const a = validActions[0];
      const btn = document.createElement("button");
      btn.className = "fab-apply-btn";
      btn.innerHTML = `<i class="fa-solid fa-circle-play"></i> Aplicar al diagrama`;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const result = await onApplyAction?.(a.parsed);
          if (result?.error) {
            btn.innerHTML = "❌ Error";
            btn.disabled = false;
            appendSystemMessage(`❌ ${result.error}`);
          } else {
            btn.innerHTML = "✅ Aplicado";
            appendSystemMessage("✅ Acción aplicada al diagrama.");
          }
        } catch (err) {
          btn.innerHTML = "❌ Error";
          btn.disabled = false;
          appendSystemMessage(`❌ Error: ${err.message}`);
        }
      });
      el.appendChild(btn);
    }
  }

  return { refreshWelcome, notifyPingFail, appendErrorMessage };
}

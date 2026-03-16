// src/index.js
import { API_BASE } from "./config.js";
import { convStore } from "./ai/convStore.js";
import { parseResponse } from "./ai/responseParser.js";
import { NIVELES, ENFOQUES } from "./ai/modes.js";

// Aplica tema guardado antes del primer paint
(function() {
  if (localStorage.getItem("capa8_theme") === "light")
    document.documentElement.dataset.theme = "light";
})();

document.addEventListener("DOMContentLoaded", () => {
  // Tema claro / oscuro
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    const themeIcon = themeToggle.querySelector("i");
    if (themeIcon && document.documentElement.dataset.theme === "light")
      themeIcon.className = "fa-solid fa-sun";
    themeToggle.addEventListener("click", () => {
      const isLight = document.documentElement.dataset.theme === "light";
      document.documentElement.dataset.theme = isLight ? "" : "light";
      localStorage.setItem("capa8_theme", isLight ? "" : "light");
      if (themeIcon) themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    });
  }

  // ── Logo dropdown ──────────────────────────────────────────────────
  const logoBtn      = document.getElementById("onav-logo-btn");
  const logoDropdown = document.getElementById("onav-dropdown");
  if (logoBtn && logoDropdown) {
    const logoWrap = logoBtn.closest(".onav-logo-wrap");
    let hideTimer = null;
    const openDropdown = () => {
      clearTimeout(hideTimer);
      logoDropdown.hidden = false;
      logoBtn.classList.add("open");
    };
    const closeDropdown = () => {
      hideTimer = setTimeout(() => {
        logoDropdown.hidden = true;
        logoBtn.classList.remove("open");
      }, 180);
    };
    logoBtn.addEventListener("click", e => {
      e.stopPropagation();
      logoDropdown.hidden ? openDropdown() : closeDropdown();
    });
    // Only listen on the wrap — logoDropdown is a child so mouse inside it
    // does NOT trigger mouseleave on logoWrap. No dropdown-level listeners needed.
    logoWrap?.addEventListener("mouseenter", openDropdown);
    logoWrap?.addEventListener("mouseleave", closeDropdown);
    document.addEventListener("click", e => {
      if (!logoBtn.contains(e.target) && !logoDropdown.contains(e.target)) {
        logoDropdown.hidden = true;
        logoBtn.classList.remove("open");
      }
    });
  }

  // ── Hamburger (mobile) ─────────────────────────────────────────────
  const hamburger  = document.getElementById("onav-hamburger");
  const mobileMenu = document.getElementById("onav-mobile-menu");
  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", e => {
      e.stopPropagation();
      mobileMenu.hidden = !mobileMenu.hidden;
      hamburger.classList.toggle("open", !mobileMenu.hidden);
    });
    document.addEventListener("click", e => {
      if (!mobileMenu.hidden && !hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.hidden = true;
        hamburger.classList.remove("open");
      }
    });
  }

  // ── MODE buttons (Nivel × Enfoque) ─────────────────────────────────
  const modeTitle = document.getElementById("chat-mode-title");

  // Load persisted values from convStore
  let currentNivel   = convStore.getState().nivel   || "balanceado";
  let currentEnfoque = convStore.getState().enfoque || "disenar";

  function syncModeChips() {
    document.querySelectorAll("[data-nivel]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.nivel === currentNivel);
    });
    document.querySelectorAll("[data-enfoque]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.enfoque === currentEnfoque);
    });
    if (modeTitle) {
      const nivelLabel   = NIVELES[currentNivel]?.label   || currentNivel;
      const enfoqueLabel = ENFOQUES[currentEnfoque]?.label || currentEnfoque;
      modeTitle.textContent = `${nivelLabel} · ${enfoqueLabel}`;
    }
  }
  syncModeChips();

  document.querySelectorAll("[data-nivel]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentNivel = btn.dataset.nivel;
      convStore.setNivel(currentNivel);
      syncModeChips();
    });
  });

  document.querySelectorAll("[data-enfoque]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentEnfoque = btn.dataset.enfoque;
      convStore.setEnfoque(currentEnfoque);
      syncModeChips();
    });
  });

  // ── Topology URL builder (IA → Diagrams) ──────────────────────────
  function makeTopologyURL(graph) {
    const json = JSON.stringify(graph);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `diagrams.html?g=${btoa(binary)}`;
  }

  // ====== CHAT wiring ======
  const chatMessages = document.querySelector(".chat-messages");
  const chatInput = document.querySelector(".chat-input");
  const sendBtn = document.querySelector(".send-btn");

  // Botón: toggle clase has-text según contenido del input
  chatInput?.addEventListener("input", () => {
    sendBtn?.classList.toggle("has-text", chatInput.value.trim().length > 0);
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + "px";
  });

  // Typing indicator
  let typingEl = null;
  function showTyping() {
    if (typingEl || !chatMessages) return;
    typingEl = document.createElement("div");
    typingEl.className = "typing-indicator";
    typingEl.innerHTML = `
      <div class="typing-avatar">C8</div>
      <div class="typing-bubble">
        <div class="typing-dot" style="animation-delay:0s"></div>
        <div class="typing-dot" style="animation-delay:0.16s"></div>
        <div class="typing-dot" style="animation-delay:0.32s"></div>
      </div>
    `;
    chatMessages.appendChild(typingEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function hideTyping() {
    typingEl?.remove();
    typingEl = null;
  }

  function appendMessage(role, text) {
    if (!chatMessages) return;

    const msg = document.createElement("div");
    msg.classList.add("message");

    if (role === "assistant") {
      msg.classList.add("ai-message");

      // Use responseParser — detect apply_graph for topology link
      const { text: cleanText, actions } = parseResponse(text);
      msg.innerHTML = marked.parse(cleanText || "");

      const applyGraph = actions.find(a => a.valid && a.parsed?.action === "apply_graph" && a.parsed.graph);
      if (applyGraph) {
        const link = document.createElement("a");
        link.href = makeTopologyURL(applyGraph.parsed.graph);
        link.className = "topology-open-btn";
        link.innerHTML = `<i class="fa-solid fa-diagram-project"></i> Abrir topología en Diagramas`;
        msg.appendChild(link);
      }
    } else {
      msg.classList.add("user-message");
      msg.textContent = text;
    }

    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendMessage() {
    const text = (chatInput?.value || "").trim();
    if (!text) return;

    appendMessage("user", text);
    convStore.addMessage({ role: "user", content: text, surface: "home", timestamp: Date.now() });

    chatInput.value = "";
    chatInput.style.height = "auto";
    sendBtn.classList.remove("has-text");
    chatInput.disabled = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nivel: currentNivel,
          enfoque: currentEnfoque,
          message: text,
          history: convStore.getHistory(10),
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error en /api/chat");

      const answer = (data.answer || "").trim() || "No pude generar respuesta.";
      hideTyping();
      appendMessage("assistant", answer);
      convStore.addMessage({ role: "assistant", content: answer, surface: "home", timestamp: Date.now() });

    } catch (e) {
      hideTyping();
      appendMessage("assistant", `⚠️ Error: ${String(e.message || e)}`);
    } finally {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  sendBtn?.addEventListener("click", sendMessage);
  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Restaurar historial desde convStore (mensajes de surface: home)
  const savedMessages = convStore.getState().messages.filter(m => m.surface === "home");
  if (savedMessages.length > 0) {
    for (const h of savedMessages) appendMessage(h.role, h.content);
  }
});

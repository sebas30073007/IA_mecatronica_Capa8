// src/ui/terminalPanel.js
import {
  findNodeByIp, bfsPath, computeRttMs, linksForNode, checkAclPath,
  buildAdjacency, resolveReachability, findBlockingDownLink,
} from "../model/graph.js";
import { generateMac, networkAddress, parseMask } from "../model/addressing.js";
import { TYPE_ORDER } from "../render/typePalette.js";

const TERMINAL_COMMANDS = [
  "help", "clear", "ipconfig", "ping", "traceroute",
  "route print", "show interfaces", "show arp",
  "show ip route", "show mac-address-table", "ifconfig",
];

/** IDs de los nodos que toca un camino de enlaces. */
function nodesOfPath(graph, linkIds) {
  const ids = new Set();
  for (const id of linkIds) {
    const l = graph.links.find(x => x.id === id);
    if (l) { ids.add(l.source); ids.add(l.target); }
  }
  return [...ids];
}

/**
 * Todo lo alcanzable físicamente desde un nodo.
 * Se usa para que "No route to host" muestre hasta dónde SÍ llega la red,
 * en vez de dejar al alumno sin ninguna pista de dónde está el corte.
 */
function reachableFrom(graph, startId) {
  const adj = buildAdjacency(graph);
  const seen = new Set([startId]);
  const q = [startId];
  while (q.length) {
    for (const e of adj.get(q.shift()) || []) {
      if (!seen.has(e.neighbor)) { seen.add(e.neighbor); q.push(e.neighbor); }
    }
  }
  return [...seen];
}

export function createTerminalPanel({ store, dispatch, ActionTypes, onPingRequest, onPingFail, onTraceProbe }) {
  let currentPcId = null;

  /** Resalta algo en el lienzo. Sin argumentos, limpia. */
  function highlight(payload) {
    dispatch(payload
      ? { type: ActionTypes.SET_HIGHLIGHT, payload }
      : { type: ActionTypes.CLEAR_HIGHLIGHT });
  }

  // Fixed DOM elements in the simulator page (index.html)
  const outputEl = document.getElementById("terminal-output");
  const inputEl  = document.getElementById("terminal-input");
  const sendEl   = document.getElementById("terminal-send");

  // ── Command history (↑ / ↓) ──────────────────────────────────────────
  const cmdHistory  = [];
  let historyIndex  = -1;
  let historyDraft  = "";   // preserves current draft when browsing history

  // Wire events once
  const run = () => {
    const state = store.getState();
    const pc = currentPcId ? state.graph.nodes.find(n => n.id === currentPcId) : null;
    if (!pc) return;
    const cmd = (inputEl?.value || "").trim();
    if (!cmd) return;
    if (inputEl) inputEl.value = "";
    // Push to history (avoid duplicates at top)
    if (cmd && cmdHistory[cmdHistory.length - 1] !== cmd) cmdHistory.push(cmd);
    if (cmdHistory.length > 100) cmdHistory.shift();
    historyIndex = -1;
    historyDraft = "";
    handleCommand(cmd, pc, state.graph);
  };

  inputEl?.addEventListener("keydown", e => {
    if (e.key === "Enter") { run(); return; }

    // ↑ / ↓ history navigation
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      if (historyIndex === -1) historyDraft = inputEl.value;
      historyIndex = Math.min(historyIndex + 1, cmdHistory.length - 1);
      inputEl.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) { historyIndex = -1; inputEl.value = historyDraft; return; }
      historyIndex--;
      inputEl.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
      return;
    }

    // Tab completion
    if (e.key === "Tab") {
      e.preventDefault();
      const val = inputEl.value;
      if (!val) return;
      const graph = store.getState().graph;
      // Build candidate list: static commands + node labels (for ping/traceroute target) + IPs
      const nodeIps    = graph.nodes.map(n => n.ip).filter(Boolean);
      const nodeLabels = graph.nodes.map(n => n.label).filter(Boolean);
      const candidates = [...TERMINAL_COMMANDS, ...nodeIps, ...nodeLabels];
      const matches = candidates.filter(c => c.startsWith(val) && c !== val);
      if (matches.length === 1) {
        inputEl.value = matches[0];
      } else if (matches.length > 1) {
        // Show matches as a hint line
        dispatch({ type: ActionTypes.TERMINAL_APPEND, payload: `\n${matches.join("   ")}\n` });
      }
      return;
    }
  });

  sendEl?.addEventListener("click", run);

  document.getElementById("btn-term-clear")?.addEventListener("click", () => {
    dispatch({ type: ActionTypes.TERMINAL_CLEAR });
  });

  function setPc(pcId) {
    currentPcId = pcId;
  }

  function render() {
    if (!outputEl) return;
    const state = store.getState();
    const pc = currentPcId ? state.graph.nodes.find(n => n.id === currentPcId) : null;
    const log = state.terminalLog || "";

    let rawText;
    if (log) {
      rawText = log;
    } else if (pc) {
      rawText = `CAPA8 Network Terminal v1.0 — escribe 'help' para ver comandos\n> Conectado a ${pc.label} (${pc.ip || "sin IP"})\n`;
    } else {
      rawText = "CAPA8 Network Terminal v1.0 — Selecciona una PC para comenzar.\n";
    }

    // Colorize via HTML
    const escaped = rawText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const colored = escaped
      // IPs and MACs: cyan
      .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d+)?)\b/g, '<span class="t-cyan">$1</span>')
      .replace(/\b([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})\b/g, '<span class="t-cyan">$1</span>')
      // RTT times: cyan
      .replace(/\b(\d+ms)\b/g, '<span class="t-cyan">$1</span>')
      // Error lines: red
      .replace(/(Request timed out\.|No route to host.*|Error.*|not found.*|inválido.*|no encontrado.*)/g, '<span class="t-error">$1</span>')
      // Prompt lines (> cmd): green
      .replace(/(^|\n)(&gt; .+)/g, '$1<span class="t-green">$2</span>')
      // Section headers (lines with ════ or ────): green
      .replace(/([═─]{4,})/g, '<span class="t-green">$1</span>')
      // Success indicators
      .replace(/(Reply from|bytes=\d+|TTL=\d+)/g, '<span class="t-success">$1</span>')
      // Tipo de dispositivo entre corchetes -> color del espectro.
      // `show interfaces` e `ifconfig` ya imprimen "[router]", "[plc]"…
      // así que basta teñirlo: el corchete sigue ahí, el color no es
      // la única señal.
      .replace(
        new RegExp(`\\[(${TYPE_ORDER.join("|")})\\]`, "g"),
        '<span class="type-ink" data-type="$1">[$1]</span>'
      );

    outputEl.innerHTML = colored;
    outputEl.scrollTop = outputEl.scrollHeight;

    if (inputEl) {
      inputEl.placeholder = pc ? "ping 10.0.0.1" : "Selecciona una PC";
      inputEl.disabled = !pc;
    }
    if (sendEl) sendEl.disabled = !pc;
  }

  function append(text) {
    dispatch({ type: ActionTypes.TERMINAL_APPEND, payload: text });
  }

  function appendHtml(html) {
    if (!outputEl) return;
    const span = document.createElement("span");
    span.innerHTML = html;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function handleCommand(cmd, pc, graph) {
    append(`> ${cmd}\n`);

    // Cada comando parte de un lienzo limpio: el resaltado del comando
    // anterior no debe mezclarse con el nuevo.
    highlight(null);

    const parts = cmd.split(/\s+/);
    const head = parts[0].toLowerCase();

    if (head === "help") {
      append("Comandos disponibles:\n- help\n- ipconfig\n- ping <ip>\n- traceroute <ip>\n- route print\n- show interfaces\n- show arp\n- show ip route [label]\n- show mac-address-table [label]\n- ifconfig <label>\n- acl <fw> deny|permit <ip|*>\n- acl <fw> clear\n- show acl [fw]\n- clear\n");
      return;
    }

    if (head === "clear") {
      dispatch({ type: ActionTypes.TERMINAL_CLEAR });
      return;
    }

    if (head === "ipconfig" || (head === "show" && parts[1]?.toLowerCase() === "ip")) {
      append(`IPv4 Address: ${pc.ip || "(sin IP)"}\nDevice: ${pc.label}\n`);
      return;
    }

    if (head === "ping") {
      const ip = parts[1];
      if (!ip) { append("Uso: ping <ip>\n"); return; }

      const dst = findNodeByIp(graph, ip);
      if (!dst) { append(`Ping request could not find host ${ip}.\n`); return; }

      // La alcanzabilidad ya no es solo "¿hay cable?": aplica subred y gateway.
      const r = resolveReachability(graph, pc, ip);
      if (!r.ok) {
        // Un enlace caído se manifiesta como "no hay ruta" porque el BFS los
        // descarta. Se comprueba aparte para poder señalar cuál.
        const downId = r.reason === "no-path"
          ? findBlockingDownLink(graph, pc.id, dst.id)
          : null;

        if (downId) {
          const l = graph.links.find(x => x.id === downId);
          const a = graph.nodes.find(n => n.id === l.source);
          const b = graph.nodes.find(n => n.id === l.target);
          append(`Destination host unreachable: el enlace ${a?.label} ↔ ${b?.label} está caído.\n`);
          highlight({ failLinkId: downId, nodeIds: reachableFrom(graph, pc.id) });
        } else {
          append(`Destination host unreachable.\n`);
          if (r.message) append(`  ${r.message}\n`);
          highlight({
            linkIds: r.linkIds || [],
            nodeIds: r.linkIds?.length ? nodesOfPath(graph, r.linkIds) : reachableFrom(graph, pc.id),
            failNodeId: r.failNodeId,
          });
        }
        onPingFail?.({ pc, ip });
        return;
      }

      const path = r.linkIds;
      const rtt = computeRttMs(graph, path, { applyJitter: false }) ?? 1;

      const fwBlock = checkAclPath(graph, path, ip);
      if (fwBlock) {
        append(`Destination unreachable. Blocked by firewall: ${fwBlock.label} (ACL deny).\n`);
        highlight({ linkIds: path, nodeIds: nodesOfPath(graph, path), failNodeId: fwBlock.id });
        onPingFail?.({ pc, ip });
        return;
      }

      append(`Pinging ${ip} with 32 bytes of data:\n`);
      highlight({ linkIds: path, nodeIds: nodesOfPath(graph, path) });
      onPingRequest?.({ fromId: pc.id, toId: dst.id, pathLinkIds: path });

      const linkLoss = estimatePathLossPct(graph, path);
      let recv = 0;
      for (let i = 0; i < 4; i++) {
        const lost = Math.random() < linkLoss / 100;
        if (lost) {
          append(`Request timed out.\n`);
        } else {
          recv++;
          // Apply link-level jitter per packet
          const rttWithJitter = computeRttMs(graph, path, { applyJitter: true }) ?? rtt;
          append(`Reply from ${ip}: bytes=32 time=${Math.max(1, Math.round(rttWithJitter))}ms TTL=64\n`);
        }
      }
      // `recv` se cuenta de las respuestas realmente impresas. Antes se
      // estimaba con Math.round(4*(1-loss/100)) y podía contradecir las
      // cuatro líneas de arriba.
      const lostPct = Math.round((4 - recv) / 4 * 100);
      append(`\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = ${recv}, Lost = ${4 - recv} (${lostPct}%)\n`);
      return;
    }

    if (head === "traceroute") {
      const ip = parts[1];
      if (!ip) { append("Uso: traceroute <ip>\n"); return; }

      const dst = findNodeByIp(graph, ip);
      if (!dst) { append(`traceroute: host ${ip} no encontrado.\n`); return; }

      const path = bfsPath(graph, pc.id, dst.id);
      if (!path.length) {
        append(`No route to host ${ip}.\n`);
        highlight({ nodeIds: reachableFrom(graph, pc.id), failNodeId: dst.id });
        onPingFail?.({ pc, ip });
        return;
      }

      append(`traceroute to ${ip} (${dst.label}), ${path.length} hops max:\n`);

      // Precalcula el nodo y el RTT acumulado de cada salto. La impresión se
      // hace luego de una en una, conforme vuelve cada sonda.
      const saltos = [];
      let accRtt = 0;
      let prevId = pc.id;
      for (let i = 0; i < path.length; i++) {
        const link = graph.links.find(l => l.id === path[i]);
        if (!link) continue;
        accRtt += 2 * (Number(link.latencyMs) || 0);
        const hopId = link.source === prevId ? link.target : link.source;
        prevId = hopId;
        saltos.push({
          node: graph.nodes.find(n => n.id === hopId) || dst,
          rtt: accRtt,
          linkIds: path.slice(0, i + 1),
        });
      }

      const linea = (i) => {
        const s = saltos[i];
        append(`  ${i + 1}  ${s.node.ip || "*"} (${s.node.label})  ${jittered(s.rtt)} ms\n`);
      };

      // Sin motor de animación (o si el caller no lo provee) se imprime todo
      // de golpe, como antes: el comando nunca debe quedarse a medias.
      if (!onTraceProbe) {
        saltos.forEach((_, i) => linea(i));
        highlight({ linkIds: path, nodeIds: nodesOfPath(graph, path) });
        return;
      }

      // Salto a salto, que es como funciona de verdad: la sonda va cada vez
      // más lejos y su respuesta es la que revela el nodo intermedio.
      const lanzar = (i) => {
        if (i >= saltos.length) return;
        onTraceProbe({
          fromId: pc.id,
          pathLinkIds: path,
          ttl: i + 1,
          onReturn: () => {
            linea(i);
            highlight({
              linkIds: saltos[i].linkIds,
              nodeIds: saltos.slice(0, i + 1).map(s => s.node.id).concat(pc.id),
            });
            lanzar(i + 1);
          },
        });
      };
      lanzar(0);
      return;
    }

    if (head === "show" && parts[1]?.toLowerCase() === "interfaces") {
      append("Interface list:\n");
      for (const n of graph.nodes) {
        const links = linksForNode(graph, n.id);
        const upLinks = links.filter(l => l.status === "up").length;
        append(`  ${n.label} [${n.type}]  IP: ${n.ip || "N/A"}  Links: ${upLinks}/${links.length} up\n`);
      }
      return;
    }

    if (head === "show" && parts[1]?.toLowerCase() === "arp") {
      const withIp = graph.nodes.filter(n => n.ip);
      if (!withIp.length) { append("Tabla ARP vacía (ningún nodo tiene IP asignada).\n"); return; }
      append("Tabla ARP\n════════════════════════════════════\n");
      append("IP              MAC                 Equipo\n");
      append("────────────────────────────────────\n");
      for (const n of withIp) {
        const mac = generateMac(n.id);
        append(`${n.ip.padEnd(16)}${mac.padEnd(20)}${n.label}\n`);
      }
      append("════════════════════════════════════\n");
      return;
    }

    if (head === "route" && parts[1]?.toLowerCase() === "print") {
      if (!pc.ip) { append("Sin IP configurada. No hay tabla de rutas.\n"); return; }
      const prefix = parseMask(pc.mask ?? "24") ?? 24;
      const net = networkAddress(pc.ip, prefix);
      append("Tabla de rutas IPv4\n════════════════════════════════════\n");
      append("Destino           Gateway          Interfaz\n");
      append("────────────────────────────────────\n");
      append(`${(net + "/" + prefix).padEnd(18)}${"0.0.0.0".padEnd(17)}eth0 (local)\n`);
      if (pc.gateway) {
        append(`${"0.0.0.0/0".padEnd(18)}${pc.gateway.padEnd(17)}eth0\n`);
      }
      append("════════════════════════════════════\n");
      return;
    }

    if (head === "show" && parts[1]?.toLowerCase() === "ip" && parts[2]?.toLowerCase() === "route") {
      const label = parts[3];
      const target = label
        ? graph.nodes.find(n => n.label.toLowerCase() === label.toLowerCase())
        : pc;
      if (!target) { append(`show ip route: '${label}' no encontrado.\n`); return; }

      if (target.type === "router") {
        append(`${target.label} — Tabla de rutas\n════════════════════════════════════\n`);
        append("Protocolo  Red             Next Hop       Interfaz\n");
        append("────────────────────────────────────\n");
        const links = linksForNode(graph, target.id).filter(l => l.status !== "down");
        let idx = 0;
        for (const l of links) {
          const peerId = l.source === target.id ? l.target : l.source;
          const peer = graph.nodes.find(n => n.id === peerId);
          if (!peer || !peer.ip) continue;
          const prefix = parseMask(peer.mask ?? "24") ?? 24;
          const net = networkAddress(peer.ip, prefix);
          const iface = `eth${idx++} (→ ${peer.label})`;
          append(`${"C".padEnd(11)}${(net + "/" + prefix).padEnd(16)}${"—".padEnd(15)}${iface}\n`);
        }
        append("════════════════════════════════════\n");
      } else {
        if (!target.ip) { append(`${target.label}: Sin IP configurada.\n`); return; }
        const prefix = parseMask(target.mask ?? "24") ?? 24;
        const net = networkAddress(target.ip, prefix);
        append(`${target.label} — Tabla de rutas\n════════════════════════════════════\n`);
        append("Destino           Gateway          Interfaz\n");
        append("────────────────────────────────────\n");
        append(`${(net + "/" + prefix).padEnd(18)}${"0.0.0.0".padEnd(17)}eth0 (local)\n`);
        if (target.gateway) {
          append(`${"0.0.0.0/0".padEnd(18)}${target.gateway.padEnd(17)}eth0\n`);
        }
        append("════════════════════════════════════\n");
      }
      return;
    }

    if (head === "show" && parts[1]?.toLowerCase() === "mac-address-table") {
      const label = parts[2];
      const sw = label
        ? graph.nodes.find(n => n.label.toLowerCase() === label.toLowerCase())
        : pc;
      if (!sw) { append(`show mac-address-table: '${label}' no encontrado.\n`); return; }
      const links = linksForNode(graph, sw.id).filter(l => l.status !== "down");
      if (!links.length) { append(`${sw.label}: Sin puertos activos.\n`); return; }
      append(`${sw.label} — Tabla MAC\n════════════════════════════════════\n`);
      append("VLAN  MAC                 Tipo      Puerto\n");
      append("────────────────────────────────────\n");
      for (const l of links) {
        const peerId = l.source === sw.id ? l.target : l.source;
        const peer = graph.nodes.find(n => n.id === peerId);
        if (!peer) continue;
        const mac = generateMac(peer.id);
        const vlan = peer.vlan ?? 1;
        append(`${String(vlan).padEnd(6)}${mac.padEnd(20)}${"DINÁMICO".padEnd(10)}→ ${peer.label}\n`);
      }
      append("════════════════════════════════════\n");
      return;
    }

    if (head === "ifconfig") {
      const label = parts[1];
      if (!label) { append("Uso: ifconfig <label>\n"); return; }
      const target = graph.nodes.find(n => n.label.toLowerCase() === label.toLowerCase());
      if (!target) { append(`ifconfig: '${label}' no encontrado.\n`); return; }
      const links = linksForNode(graph, target.id);
      append(`${target.label} [${target.type}]\n`);
      append(`  inet ${target.ip || "(sin IP)"}\n`);
      append(`  links: ${links.length} (${links.filter(l=>l.status==="up").length} up, ${links.filter(l=>l.status==="down").length} down)\n`);
      for (const l of links) {
        const peer = graph.nodes.find(n => n.id === (l.source === target.id ? l.target : l.source));
        append(`    ↔ ${peer?.label ?? "?"} [${l.status}] ${l.latencyMs}ms ${l.bandwidthMbps}Mbps\n`);
      }
      return;
    }

    // acl <fw_label> deny|permit <ip|*>   — añade regla ACL
    // acl <fw_label> clear                 — elimina todas las reglas
    if (head === "acl") {
      const fwLabel  = parts[1];
      const ruleCmd  = parts[2]?.toLowerCase();
      const ruleIp   = parts[3];
      if (!fwLabel) { append("Uso: acl <firewall> deny|permit <ip|*>  /  acl <firewall> clear\n"); return; }
      const fw = graph.nodes.find(n => n.label.toLowerCase() === fwLabel.toLowerCase());
      if (!fw) { append(`acl: '${fwLabel}' no encontrado.\n`); return; }
      if (fw.type !== "firewall") { append(`acl: '${fw.label}' no es un firewall.\n`); return; }

      if (ruleCmd === "clear") {
        dispatch({ type: ActionTypes.UPDATE_NODE, payload: { id: fw.id, patch: { rules: [] } } });
        append(`ACL en ${fw.label} eliminada.\n`);
        return;
      }
      if (ruleCmd !== "deny" && ruleCmd !== "permit") {
        append("Acción debe ser 'deny' o 'permit'.\n"); return;
      }
      if (!ruleIp) { append("Uso: acl <fw> deny|permit <ip|*>\n"); return; }
      const newRule = { action: ruleCmd, ip: ruleIp };
      const updatedRules = [...(fw.rules || []), newRule];
      dispatch({ type: ActionTypes.UPDATE_NODE, payload: { id: fw.id, patch: { rules: updatedRules } } });
      append(`Regla añadida en ${fw.label}: ${ruleCmd.toUpperCase()} ${ruleIp}\n`);
      return;
    }

    // show acl [fw_label]  — muestra reglas ACL de un firewall (o todos)
    if (head === "show" && parts[1]?.toLowerCase() === "acl") {
      const fwLabel = parts[2];
      const firewalls = fwLabel
        ? graph.nodes.filter(n => n.label.toLowerCase() === fwLabel.toLowerCase())
        : graph.nodes.filter(n => n.type === "firewall");
      if (!firewalls.length) { append(fwLabel ? `'${fwLabel}' no encontrado.\n` : "No hay firewalls en el diagrama.\n"); return; }
      for (const fw of firewalls) {
        append(`${fw.label} — ACL\n════════════════════════════════════\n`);
        if (!fw.rules?.length) { append("  (sin reglas — todo permitido)\n"); }
        else {
          fw.rules.forEach((r, i) => append(`  ${i + 1}. ${r.action.toUpperCase().padEnd(7)} ${r.ip}\n`));
          append("  * Política predeterminada: PERMIT\n");
        }
        append("════════════════════════════════════\n");
      }
      return;
    }

    append("Comando no reconocido. Escribe 'help'.\n");
  }

  function jittered(ms) {
    const j = ms * (0.08 * (Math.random() - 0.5));
    return Math.max(1, Math.round(ms + j));
  }

  function estimatePathLossPct(graph, pathLinkIds) {
    let pOk = 1;
    for (const id of pathLinkIds) {
      const l = graph.links.find(x => x.id === id);
      const loss = Math.max(0, Math.min(100, Number(l?.lossPct) || 0));
      pOk *= (1 - loss / 100);
    }
    return (1 - pOk) * 100;
  }

  return { setPc, render };
}

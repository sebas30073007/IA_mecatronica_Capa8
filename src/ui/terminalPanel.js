// src/ui/terminalPanel.js
import { findNodeByIp, bfsPath, computeRttMs, linksForNode } from "../model/graph.js";
import { generateMac, networkAddress, parseMask } from "../model/addressing.js";

export function createTerminalPanel({ store, dispatch, ActionTypes, onPingRequest, onPingFail }) {
  let currentPcId = null;

  // Fixed DOM elements in diagrams.html
  const outputEl = document.getElementById("terminal-output");
  const inputEl  = document.getElementById("terminal-input");
  const sendEl   = document.getElementById("terminal-send");

  // Wire events once
  const run = () => {
    const state = store.getState();
    const pc = currentPcId ? state.graph.nodes.find(n => n.id === currentPcId) : null;
    if (!pc) return;
    const cmd = (inputEl?.value || "").trim();
    if (!cmd) return;
    if (inputEl) inputEl.value = "";
    handleCommand(cmd, pc, state.graph);
  };

  inputEl?.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
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
      .replace(/(Reply from|bytes=\d+|TTL=\d+)/g, '<span class="t-success">$1</span>');

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

    const parts = cmd.split(/\s+/);
    const head = parts[0].toLowerCase();

    if (head === "help") {
      append("Comandos disponibles:\n- help\n- ipconfig\n- ping <ip>\n- traceroute <ip>\n- route print\n- show interfaces\n- show arp\n- show ip route [label]\n- show mac-address-table [label]\n- ifconfig <label>\n- clear\n");
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

      const path = bfsPath(graph, pc.id, dst.id);
      if (!path.length) { append(`No route to host ${ip}.\n`); onPingFail?.({ pc, ip }); return; }

      const rtt = computeRttMs(graph, path);
      if (rtt === null) { append(`No route to host ${ip} (enlace caído en el camino).\n`); onPingFail?.({ pc, ip }); return; }

      append(`Pinging ${ip} with 32 bytes of data:\n`);
      onPingRequest?.({ fromId: pc.id, toId: dst.id, pathLinkIds: path });

      const linkLoss = estimatePathLossPct(graph, path);
      for (let i = 0; i < 4; i++) {
        const lost = Math.random() < linkLoss / 100;
        if (lost) append(`Request timed out.\n`);
        else      append(`Reply from ${ip}: bytes=32 time=${jittered(rtt)}ms TTL=64\n`);
      }
      const recv = Math.round(4 * (1 - linkLoss / 100));
      append(`\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = ${recv}, Lost = ~${Math.round(linkLoss)}%\n`);
      return;
    }

    if (head === "traceroute") {
      const ip = parts[1];
      if (!ip) { append("Uso: traceroute <ip>\n"); return; }

      const dst = findNodeByIp(graph, ip);
      if (!dst) { append(`traceroute: host ${ip} no encontrado.\n`); return; }

      const path = bfsPath(graph, pc.id, dst.id);
      if (!path.length) { append(`No route to host ${ip}.\n`); onPingFail?.({ pc, ip }); return; }

      append(`traceroute to ${ip} (${dst.label}), ${path.length} hops max:\n`);
      let accRtt = 0;
      let prevId = pc.id;
      for (let i = 0; i < path.length; i++) {
        const link = graph.links.find(l => l.id === path[i]);
        if (!link) continue;
        accRtt += 2 * (Number(link.latencyMs) || 0);
        // El nodo del salto es el extremo del enlace que NO es el anterior
        const hopId = link.source === prevId ? link.target : link.source;
        const hopNode = graph.nodes.find(n => n.id === hopId) || dst;
        prevId = hopId;
        const hopIp = hopNode.ip || "*";
        append(`  ${i + 1}  ${hopIp} (${hopNode.label})  ${jittered(accRtt)} ms\n`);
      }
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

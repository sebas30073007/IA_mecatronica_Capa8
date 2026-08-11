// bench/emptycanvas_bench.mjs
//
// Mide lo que el ESTADO VACÍO de la fase 1 necesita saber:
// dado un lienzo en blanco y una descripción libre como la escribiría
// un estudiante, ¿sale una topología usable?
//
// Es una pregunta distinta a la de reliability_bench.mjs, que corre
// todos sus prompts contra un grafo semilla de 5 nodos y mide validez
// por acción. Aquí el grafo empieza VACÍO y lo que se puntúa es el
// resultado: se aplican las acciones y se evalúa el grafo final.
//
// Uso:
//   node bench/emptycanvas_bench.mjs [--reps 3] [--out bench/results-empty]
//
// Requiere el servidor levantado (npm start).

import fs from "node:fs";
import path from "node:path";
import { parseResponse }    from "../src/ai/responseParser.js";
import { validateAction }   from "../src/ai/actionValidator.js";
import { classifyIntent }   from "../src/ai/intentRouter.js";
import { buildGraphContext } from "../src/ai/context-builder.js";
import { analyzeTopology }  from "../src/ai/topology-analyzer.js";

const args    = process.argv.slice(2);
const argVal  = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const SERVER  = argVal("--server", "http://localhost:3000");
const REPEAT  = Number(argVal("--reps", "3"));
const OUT_DIR = argVal("--out", "bench/results-empty");
const PAUSE_MS = Number(argVal("--pause", "500"));

const EMPTY_GRAPH = { version: 3, meta: {}, nodes: [], links: [] };

// Descripciones tal como las escribiría un alumno frente al lienzo vacío.
// `wants` es lo mínimo que la topología debe contener para considerarse
// una respuesta a lo pedido.
const PROMPTS = [
  { id: "E01", msg: "una red de oficina con un router, un switch y 3 PCs",
    wants: { types: { router: 1, switch: 1, pc: 3 } } },
  { id: "E02", msg: "red doméstica simple: modem, router wifi y dos laptops",
    wants: { minNodes: 4 } },
  { id: "E03", msg: "quiero una red con DMZ y dos firewalls",
    wants: { types: { firewall: 2 } } },
  { id: "E04", msg: "arma una LAN con 5 computadoras conectadas a un switch",
    wants: { types: { switch: 1, pc: 5 } } },
  { id: "E05", msg: "una red pequeña de empresa con servidor web y servidor de base de datos",
    wants: { types: { server: 2 } } },
  { id: "E06", msg: "topología de campus con 3 edificios",
    wants: { minNodes: 6 } },
  { id: "E07", msg: "conecta dos sucursales por internet",
    wants: { types: { cloud: 1 }, minNodes: 4 } },
  { id: "E08", msg: "red industrial con un PLC y un robot UR3",
    wants: { types: { plc: 1, ur3: 1 } } },
  { id: "E09", msg: "necesito practicar VLANs, hazme una topología para eso",
    wants: { minNodes: 5 } },
  { id: "E10", msg: "red con access point para dispositivos inalámbricos",
    wants: { types: { ap: 1 } } },
  { id: "E11", msg: "haz una red",                       // deliberadamente vaga
    wants: { minNodes: 2 } },
  { id: "E12", msg: "un router conectado a internet y 2 PCs detrás",
    wants: { types: { router: 1, pc: 2 } } },
];

const sleep    = ms => new Promise(r => setTimeout(r, ms));
const deepCopy = o => JSON.parse(JSON.stringify(o));

let _seq = 0;
const uid = p => `${p}${++_seq}`;

async function callChat(body) {
  const r = await fetch(`${SERVER}/api/debug-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// ── Aplicador ───────────────────────────────────────────────────────────────
// Espeja actionDispatcher.applyAction sin el store: muta un grafo plano.
// Solo las acciones que tienen sentido sobre un lienzo vacío.
function applyToGraph(action, graph) {
  const findNode = ref => graph.nodes.find(n => n.label === ref || n.id === ref);

  if (action.action === "add_node") {
    graph.nodes.push({
      id: uid("n"),
      type: action.type || "router",
      label: action.label || "Node",
      x: action.x ?? 0, y: action.y ?? 0,
      ip: action.ip || "",
      gateway: action.gateway || "",
    });
    return true;
  }

  if (action.action === "add_link") {
    const s = findNode(action.sourceLabel ?? action.sourceId);
    const t = findNode(action.targetLabel ?? action.targetId);
    if (!s || !t) return false;
    graph.links.push({ id: uid("l"), source: s.id, target: t.id, status: "up", lossPct: 0 });
    return true;
  }

  if (action.action === "apply_graph") {
    const g = action.graph;
    if (!g || !Array.isArray(g.nodes)) return false;
    graph.nodes = deepCopy(g.nodes);
    graph.links = Array.isArray(g.links) ? deepCopy(g.links) : [];
    return true;
  }

  if (action.action === "update_node") {
    const n = findNode(action.label ?? action.id);
    if (!n) return false;
    Object.assign(n, action.patch || {});
    return true;
  }

  return false; // delete_* / set_link_status no aplican en lienzo vacío
}

// ── Evaluación de la topología resultante ───────────────────────────────────
function componentCount(graph) {
  if (graph.nodes.length === 0) return 0;
  const adj = new Map(graph.nodes.map(n => [n.id, []]));
  for (const l of graph.links) {
    if (adj.has(l.source) && adj.has(l.target)) {
      adj.get(l.source).push(l.target);
      adj.get(l.target).push(l.source);
    }
  }
  const seen = new Set();
  let comps = 0;
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    comps++;
    const stack = [n.id];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const nb of adj.get(cur) || []) if (!seen.has(nb)) stack.push(nb);
    }
  }
  return comps;
}

function evaluate(graph, wants) {
  const nodes = graph.nodes.length;
  const links = graph.links.length;
  const comps = componentCount(graph);
  const issues = analyzeTopology(graph);
  const errors = issues.filter(i => i.severity === "error");

  const linked  = new Set(graph.links.flatMap(l => [l.source, l.target]));
  const isolated = graph.nodes.filter(n => !linked.has(n.id)).length;

  // ¿Contiene lo que el usuario pidió?
  let matchesRequest = true;
  const missing = [];
  if (wants.minNodes && nodes < wants.minNodes) {
    matchesRequest = false;
    missing.push(`<${wants.minNodes} nodos`);
  }
  for (const [type, min] of Object.entries(wants.types || {})) {
    const got = graph.nodes.filter(n => n.type === type).length;
    if (got < min) { matchesRequest = false; missing.push(`${type} ${got}/${min}`); }
  }

  // "Usable" = lo que un estudiante puede empezar a tocar sin arreglar nada:
  // conectada de una pieza, sin nodos sueltos y sin errores duros.
  const usable = nodes >= 2 && links >= 1 && comps === 1 && isolated === 0 && errors.length === 0;

  return {
    nodes, links, components: comps, isolated,
    errorIssues: errors.length,
    warnIssues: issues.filter(i => i.severity === "warning").length,
    matchesRequest, missing,
    usable,
    // El criterio que decide la fase 1: usable Y responde a lo pedido
    success: usable && matchesRequest,
  };
}

// ── Corrida ─────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "full.json");
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : [];
  const done = new Set(results.map(r => `${r.id}#${r.rep}`));

  console.log(`\n=== Lienzo vacío: ${PROMPTS.length} prompts × ${REPEAT} reps ===`);
  console.log(`Servidor: ${SERVER} · ya hechos: ${done.size}\n`);

  for (let rep = 1; rep <= REPEAT; rep++) {
    for (const p of PROMPTS) {
      if (done.has(`${p.id}#${rep}`)) continue;

      const graph  = deepCopy(EMPTY_GRAPH);
      const intent = classifyIntent(p.msg, graph, "diagrams");

      process.stdout.write(`  [r${rep} ${p.id}] intent=${intent.type} ... `);

      let resp;
      try {
        resp = await callChat({
          message: p.msg,
          nivel: "balanceado",
          enfoque: "disenar",
          intentType: intent.type,
          history: [],
          graphContext: buildGraphContext(graph),
          flags: { useSystemParam: true, useSeedHistory: true, useAutoRetry: true },
        });
      } catch (e) {
        console.log(`ERROR ${e.message}`);
        results.push({ id: p.id, rep, msg: p.msg, error: String(e.message) });
        fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
        continue;
      }

      const parsed = parseResponse(resp.answer || "");
      const applyGraph = deepCopy(EMPTY_GRAPH);
      let nValid = 0, nApplied = 0;

      for (const a of parsed.actions) {
        if (!a.valid || !a.parsed) continue;
        const copy = deepCopy(a.parsed);
        const v = validateAction(copy, applyGraph);
        if (!v.valid) continue;
        nValid++;
        if (applyToGraph(copy, applyGraph)) nApplied++;
      }

      const evalR = evaluate(applyGraph, p.wants);
      const mark = evalR.success ? "OK " : evalR.usable ? "parcial" : "FALLA";
      console.log(
        `${mark}  bloques=${parsed.actions.length} aplicadas=${nApplied} ` +
        `nodos=${evalR.nodes} enlaces=${evalR.links} comp=${evalR.components}` +
        (evalR.missing.length ? ` falta:${evalR.missing.join(",")}` : "")
      );

      results.push({
        id: p.id, rep, msg: p.msg,
        intentType: intent.type,
        model: resp.model,
        elapsedMs: resp.elapsedMs,
        retried: Boolean(resp.retried),
        nBlocks: parsed.actions.length,
        nJsonValid: parsed.actions.filter(a => a.valid).length,
        nSemValid: nValid,
        nApplied,
        ...evalR,
        answerPreview: (resp.answer || "").slice(0, 300),
      });
      fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
      await sleep(PAUSE_MS);
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const ok = results.filter(r => !r.error);
  const pct = (n, d) => d ? (100 * n / d).toFixed(1) : "0.0";
  const byPrompt = {};
  for (const r of ok) {
    (byPrompt[r.id] ??= { n: 0, success: 0, usable: 0, matches: 0, msg: r.msg }).n++;
    if (r.success) byPrompt[r.id].success++;
    if (r.usable) byPrompt[r.id].usable++;
    if (r.matchesRequest) byPrompt[r.id].matches++;
  }

  const summary = {
    model: ok[0]?.model ?? null,
    prompts: PROMPTS.length,
    reps: REPEAT,
    n: ok.length,
    errors: results.length - ok.length,
    emissionRate:  pct(ok.filter(r => r.nBlocks > 0).length, ok.length),
    usableRate:    pct(ok.filter(r => r.usable).length, ok.length),
    matchesRate:   pct(ok.filter(r => r.matchesRequest).length, ok.length),
    successRate:   pct(ok.filter(r => r.success).length, ok.length),
    avgNodes:      (ok.reduce((s, r) => s + (r.nodes || 0), 0) / (ok.length || 1)).toFixed(1),
    fragmentedRate: pct(ok.filter(r => r.components > 1).length, ok.length),
    isolatedRate:   pct(ok.filter(r => r.isolated > 0).length, ok.length),
    medianLatencyMs: (() => {
      const xs = ok.map(r => r.elapsedMs).filter(Boolean).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    })(),
    byPrompt,
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\n──────────────────────────────────────────────`);
  console.log(`  modelo             ${summary.model}`);
  console.log(`  n                  ${summary.n} (${summary.errors} errores)`);
  console.log(`  emite acciones     ${summary.emissionRate}%`);
  console.log(`  grafo usable       ${summary.usableRate}%`);
  console.log(`  responde a lo pedido ${summary.matchesRate}%`);
  console.log(`  ÉXITO (ambas)      ${summary.successRate}%`);
  console.log(`  nodos promedio     ${summary.avgNodes}`);
  console.log(`  fragmentado (>1 componente) ${summary.fragmentedRate}%`);
  console.log(`  con nodos aislados ${summary.isolatedRate}%`);
  console.log(`  latencia mediana   ${summary.medianLatencyMs} ms`);
  console.log(`──────────────────────────────────────────────`);
  console.log(`\nPeores prompts:`);
  Object.entries(byPrompt)
    .sort((a, b) => (a[1].success / a[1].n) - (b[1].success / b[1].n))
    .slice(0, 5)
    .forEach(([id, s]) => console.log(`  ${id} ${s.success}/${s.n}  "${s.msg.slice(0, 52)}"`));
}

main().catch(e => { console.error(e); process.exit(1); });

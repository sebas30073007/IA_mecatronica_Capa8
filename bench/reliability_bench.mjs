// bench/reliability_bench.mjs
// Benchmark de confiabilidad de emisión de acciones CAPA8 con ablación de mecanismos.
// Uso: node bench/reliability_bench.mjs [--conditions full,no-seed,no-retry,no-system] [--only-category accion]
// Requiere el servidor corriendo en http://localhost:3000 con LLM_PROVIDER=groq.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseResponse } from "../src/ai/responseParser.js";
import { validateAction } from "../src/ai/actionValidator.js";
import { classifyIntent } from "../src/ai/intentRouter.js";
import { buildGraphContext } from "../src/ai/context-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.BENCH_SERVER || "http://localhost:3000";
const OUT_DIR = process.env.BENCH_OUT_DIR
  ? path.resolve(process.env.BENCH_OUT_DIR)
  : path.join(__dirname, "results");
const PAUSE_MS = Number(process.env.BENCH_PAUSE_MS ?? 2500); // pausa entre llamadas (rate limit en nube; local no necesita)
const MAX_RETRIES_HTTP = 4;     // reintentos ante 429/5xx con backoff
let REPEAT = Math.max(1, Number(process.env.BENCH_REPEAT ?? 1)); // k repeticiones por prompt → media ± DE (override con --repeat k)

// ── Grafo de prueba fijo (escenario con trampas deliberadas) ────────────────
// PC1: tiene IP pero NO gateway  → trampa "arregla el gateway" (update_node, no add_link)
// PC2: NO tiene IP               → trampa "asigna IP" (update_node, no add_node)
// Server1: IP 192.168.1.20       → trampa IP duplicada
const TEST_GRAPH = {
  version: 3,
  meta: { label: "bench", updatedAt: 0 },
  nodes: [
    { id: "n1", type: "router", label: "Router1", x: 300, y: 100, ip: "192.168.1.1" },
    { id: "n2", type: "switch", label: "Switch1", x: 300, y: 250, ip: "" },
    { id: "n3", type: "pc",     label: "PC1",     x: 150, y: 400, ip: "192.168.1.10", gateway: "" },
    { id: "n4", type: "pc",     label: "PC2",     x: 300, y: 400, ip: "",             gateway: "" },
    { id: "n5", type: "server", label: "Server1", x: 450, y: 400, ip: "192.168.1.20", gateway: "192.168.1.1" },
  ],
  links: [
    { id: "l1", source: "n1", target: "n2", latencyMs: 1, bandwidthMbps: 1000, lossPct: 0, status: "up" },
    { id: "l2", source: "n2", target: "n3", latencyMs: 2, bandwidthMbps: 100,  lossPct: 0, status: "up" },
    { id: "l3", source: "n2", target: "n4", latencyMs: 2, bandwidthMbps: 100,  lossPct: 0, status: "up" },
    { id: "l4", source: "n2", target: "n5", latencyMs: 1, bandwidthMbps: 1000, lossPct: 0, status: "up" },
  ],
};

// ── Suite de 30 prompts de estudiante ───────────────────────────────────────
// category: "accion" (se esperan bloques), "solver" (acciones aceptables),
//           "no-accion" (NO deben emitirse bloques)
// trap: validación semántica esperada (gateway→update_node, ip→update_node,
//       nonexistent→intercepción del validador, dup-ip→warning)
const PROMPTS = [
  // — Acciones claras (16)
  { id: "A01", category: "accion", enfoque: "disenar", msg: "agrega una PC llamada PC9 con IP 192.168.1.50" },
  { id: "A02", category: "accion", enfoque: "disenar", msg: "agrega 2 computadoras nuevas al diagrama" },
  { id: "A03", category: "accion", enfoque: "disenar", msg: "conecta PC1 al Switch1" },
  { id: "A04", category: "accion", enfoque: "disenar", msg: "agrega un firewall llamado FW1 con IP 192.168.1.2" },
  { id: "A05", category: "accion", enfoque: "disenar", msg: "elimina PC2" },
  { id: "A06", category: "accion", enfoque: "disenar", msg: "pon en down el enlace entre Router1 y Switch1" },
  { id: "A07", category: "accion", enfoque: "disenar", msg: "diseña una red de oficina con 1 router, 1 switch y 3 PCs" },
  { id: "A08", category: "accion", enfoque: "disenar", msg: "agrega un servidor llamado WebServer con IP 192.168.1.30 y conéctalo al Switch1" },
  { id: "A09", category: "accion", enfoque: "disenar", trap: "gateway", msg: "PC1 no tiene gateway configurado, arréglalo" },
  { id: "A10", category: "accion", enfoque: "disenar", trap: "ip-fix", msg: "asigna una IP a PC2" },
  { id: "A11", category: "accion", enfoque: "disenar", trap: "nonexistent", msg: "conecta PC7 al Router5" },
  { id: "A12", category: "accion", enfoque: "disenar", trap: "nonexistent", msg: "elimina el nodo Servidor3" },
  { id: "A13", category: "accion", enfoque: "disenar", msg: "agrega un access point llamado AP1 y conéctalo al Router1" },
  { id: "A14", category: "accion", enfoque: "disenar", trap: "alias", msg: "agrega una laptop llamada Laptop1 con IP 192.168.1.40" },
  { id: "A15", category: "accion", enfoque: "disenar", msg: "cambia la IP del Router1 a 10.0.0.1" },
  { id: "A16", category: "accion", enfoque: "disenar", trap: "dup-ip", msg: "agrega un servidor llamado Backup1 con IP 192.168.1.10" },
  // — Solver / diagnóstico (6)
  { id: "S01", category: "solver", enfoque: "solver", msg: "¿por qué no llega el ping de PC1 a PC2?" },
  { id: "S02", category: "solver", enfoque: "solver", msg: "hay un problema en mi red, ¿puedes detectarlo?" },
  { id: "S03", category: "solver", enfoque: "solver", msg: "analiza la topología y corrige los problemas que encuentres" },
  { id: "S04", category: "solver", enfoque: "solver", trap: "gateway", msg: "PC2 no puede salir de su subred, diagnostica la causa y arréglala" },
  { id: "S05", category: "solver", enfoque: "solver", msg: "el ping entre PC1 y Server1 falla, ¿qué está mal?" },
  { id: "S06", category: "solver", enfoque: "solver", msg: "revisa si hay IPs duplicadas y arréglalas" },
  // — Conceptuales / consulta: NO deben emitir acciones (8)
  { id: "C01", category: "no-accion", enfoque: "disenar", msg: "¿cuál es la diferencia entre un router y un switch?" },
  { id: "C02", category: "no-accion", enfoque: "disenar", msg: "¿qué es una VLAN y para qué sirve?" },
  { id: "C03", category: "no-accion", enfoque: "disenar", msg: "explícame cómo funciona el protocolo DHCP" },
  { id: "C04", category: "no-accion", enfoque: "disenar", msg: "¿qué significa la máscara de subred 255.255.255.0?" },
  { id: "C05", category: "no-accion", enfoque: "disenar", msg: "¿cuántos nodos hay en mi topología?" },
  { id: "C06", category: "no-accion", enfoque: "disenar", msg: "¿qué IP tiene PC1?" },
  { id: "C07", category: "no-accion", enfoque: "disenar", msg: "¿cuáles dispositivos están conectados al Switch1?" },
  { id: "C08", category: "no-accion", enfoque: "disenar", msg: "¿qué es el modelo OSI?" },
];

// ── Condiciones de ablación ─────────────────────────────────────────────────
const CONDITIONS = {
  "full":      { useSystemParam: true,  useSeedHistory: true,  useAutoRetry: true  },
  "no-seed":   { useSystemParam: true,  useSeedHistory: false, useAutoRetry: true  },
  "no-retry":  { useSystemParam: true,  useSeedHistory: true,  useAutoRetry: false },
  "no-system": { useSystemParam: false, useSeedHistory: true,  useAutoRetry: true  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const deepCopy = o => JSON.parse(JSON.stringify(o));

async function callDebugChat(body) {
  for (let attempt = 0; attempt <= MAX_RETRIES_HTTP; attempt++) {
    try {
      const r = await fetch(`${SERVER}/api/debug-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return await r.json();
      const txt = await r.text();
      if (r.status === 502 && /rate.?limit|429/i.test(txt) && attempt < MAX_RETRIES_HTTP) {
        const wait = 20000 * (attempt + 1);
        console.log(`    rate-limited, esperando ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
    } catch (e) {
      if (attempt >= MAX_RETRIES_HTTP) throw e;
      await sleep(10000 * (attempt + 1));
    }
  }
}

// Clasifica la corrección semántica en las trampas (lo que el validador NO puede ver)
function evalTrap(trap, actions) {
  const parsed = actions.filter(a => a.valid && a.parsed).map(a => a.parsed);
  if (trap === "gateway") {
    // correcto: update_node con patch.gateway; incorrecto: add_link
    const usedUpdate = parsed.some(a => a.action === "update_node" && a.patch && "gateway" in a.patch);
    const usedLink   = parsed.some(a => a.action === "add_link");
    return usedUpdate && !usedLink ? "correct" : usedLink ? "spurious-link" : "other";
  }
  if (trap === "ip-fix") {
    const usedUpdate = parsed.some(a => a.action === "update_node" && a.patch && "ip" in a.patch);
    const usedAdd    = parsed.some(a => a.action === "add_node");
    return usedUpdate && !usedAdd ? "correct" : usedAdd ? "duplicate-add" : "other";
  }
  return null;
}

async function runCondition(condName, flags, onlyCategory) {
  const outFile = path.join(OUT_DIR, `${condName}.json`);
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : [];
  const done = new Set(results.map(r => `${r.id}#${r.rep ?? 1}`));

  const suite = PROMPTS.filter(p => !onlyCategory || p.category === onlyCategory);
  console.log(`\n=== Condición: ${condName} (${suite.length} prompts × ${REPEAT} reps, ${done.size} ya hechos) ===`);

  for (let rep = 1; rep <= REPEAT; rep++) {
    for (const p of suite) {
      const key = `${p.id}#${rep}`;
      if (done.has(key)) continue;
      const graph = deepCopy(TEST_GRAPH);
      const graphContext = buildGraphContext(graph);
      const intent = classifyIntent(p.msg, graph, "diagrams");

      const body = {
        message: p.msg,
        nivel: "balanceado",
        enfoque: p.enfoque,
        intentType: intent.type,
        history: [],
        graphContext,
        flags,
      };

      process.stdout.write(`  [r${rep}/${REPEAT} ${p.id}] intent=${intent.type} ... `);
      let resp;
      try {
        resp = await callDebugChat(body);
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        results.push({ id: p.id, rep, category: p.category, intentType: intent.type, error: String(e.message) });
        fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
        await sleep(PAUSE_MS);
        continue;
      }

      // Parse + validación idéntica al flujo real del frontend
      const parsed = parseResponse(resp.answer || "");
      const validations = [];
      const validationGraph = deepCopy(TEST_GRAPH); // grafo fresco por prompt
      for (const a of parsed.actions) {
        if (!a.valid || !a.parsed) {
          validations.push({ stage: "json", valid: false, error: "JSON malformado" });
          continue;
        }
        const actionCopy = deepCopy(a.parsed); // validateAction puede mutar (alias, add→update)
        const v = validateAction(actionCopy, validationGraph);
        validations.push({
          stage: "semantic",
          valid: v.valid,
          error: v.error || null,
          warnings: v.warnings || [],
          actionType: a.parsed.action,
          normalizedTo: actionCopy.action !== a.parsed.action ? actionCopy.action : null,
        });
      }

      const rec = {
        id: p.id,
        rep,
        category: p.category,
        trap: p.trap || null,
        intentType: intent.type,
        msg: p.msg,
        elapsedMs: resp.elapsedMs,
        retried: Boolean(resp.retried),
        model: resp.model,
        nBlocks: parsed.actions.length,
        nJsonValid: parsed.actions.filter(a => a.valid).length,
        nSemValid: validations.filter(v => v.stage === "semantic" && v.valid).length,
        nIntercepted: validations.filter(v => !v.valid).length,
        nNormalized: validations.filter(v => v.normalizedTo).length,
        nWarnings: validations.reduce((s, v) => s + (v.warnings?.length || 0), 0),
        trapResult: p.trap ? evalTrap(p.trap, parsed.actions) : null,
        validations,
        answerPreview: (resp.answer || "").slice(0, 400),
      };
      results.push(rec);
      fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
      console.log(`blocks=${rec.nBlocks} jsonOk=${rec.nJsonValid} semOk=${rec.nSemValid} intercept=${rec.nIntercepted} retry=${rec.retried} ${rec.trapResult ? "trap=" + rec.trapResult : ""} (${resp.elapsedMs}ms)`);
      await sleep(PAUSE_MS);
    }
  }
  return results;
}

// ── Agregación → tabla resumen ──────────────────────────────────────────────
function summarize(condName, results) {
  const ok = results.filter(r => !r.error);
  const byCat = cat => ok.filter(r => r.category === cat);
  const accion = byCat("accion"), solver = byCat("solver"), noAccion = byCat("no-accion");
  const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

  const actionable = [...accion, ...solver];
  const emitted = accion.filter(r => r.nBlocks > 0);
  const totalBlocks = ok.reduce((s, r) => s + r.nBlocks, 0);
  const totalJsonValid = ok.reduce((s, r) => s + r.nJsonValid, 0);
  const totalSemValid = ok.reduce((s, r) => s + r.nSemValid, 0);
  const totalIntercepted = ok.reduce((s, r) => s + r.nIntercepted, 0);
  const totalNormalized = ok.reduce((s, r) => s + r.nNormalized, 0);
  const latencies = ok.map(r => r.elapsedMs).sort((a, b) => a - b);

  return {
    condition: condName,
    n: ok.length,
    errors: results.length - ok.length,
    actionEmissionRate: pct(emitted.length, accion.length),
    solverEmissionRate: pct(solver.filter(r => r.nBlocks > 0).length, solver.length),
    spuriousActionRate: pct(noAccion.filter(r => r.nBlocks > 0).length, noAccion.length),
    totalBlocks,
    jsonValidityRate: pct(totalJsonValid, totalBlocks),
    semanticValidityRate: pct(totalSemValid, totalJsonValid),
    interceptedActions: totalIntercepted,
    normalizedActions: totalNormalized,
    retryRate: pct(ok.filter(r => r.retried).length, actionable.length),
    medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    traps: Object.fromEntries(
      ok.filter(r => r.trap).map(r => [`${r.id}:${r.trap}`, r.trapResult ?? `${r.nIntercepted} intercepted, ${r.nWarnings} warnings`])
    ),
  };
}

// ── Agregación entre repeticiones → media ± DE muestral ─────────────────────
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sampleSD = xs => {
  if (xs.length < 2) return 0;                       // DE indefinida con 1 corrida → 0
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); // n-1
};
const round1 = x => (x == null ? null : Math.round(x * 10) / 10);
const fmt = st => (st.mean == null ? "—" : `${round1(st.mean)}±${round1(st.sd)}`);

const NUMERIC_KEYS = [
  "actionEmissionRate", "solverEmissionRate", "spuriousActionRate",
  "jsonValidityRate", "semanticValidityRate", "interceptedActions",
  "normalizedActions", "retryRate", "medianLatencyMs", "totalBlocks",
];

// Resume cada rep COMPLETA por separado, luego media±DE de cada métrica entre reps.
// Las reps a medias (cortadas por rate limit, etc.) se descartan para no sesgar.
function aggregateReps(condName, results) {
  const expected = PROMPTS.filter(p => !onlyCategory || p.category === onlyCategory).length;
  const allReps = [...new Set(results.map(r => r.rep ?? 1))].sort((a, b) => a - b);
  const completeReps = allReps.filter(rep =>
    results.filter(r => (r.rep ?? 1) === rep && !r.error).length >= expected);
  const partialRepsSkipped = allReps.length - completeReps.length;
  const usable = results.filter(r => completeReps.includes(r.rep ?? 1));

  const perRep = completeReps.map(rep => summarize(condName, usable.filter(r => (r.rep ?? 1) === rep)));
  const stats = {};
  for (const k of NUMERIC_KEYS) {
    const xs = perRep.map(s => s[k]).filter(v => v != null);
    stats[k] = { mean: mean(xs), sd: sampleSD(xs), n: xs.length };
  }
  // Estabilidad de trampas: conteo de cada resultado a lo largo de las reps completas
  const traps = {};
  for (const tk of [...new Set(usable.filter(r => r.trap).map(r => `${r.id}:${r.trap}`))]) {
    const [id] = tk.split(":");
    traps[tk] = usable.filter(r => r.id === id && !r.error)
      .map(r => r.trapResult ?? `${r.nIntercepted}int/${r.nWarnings}warn`)
      .reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  }
  return { condition: condName, reps: completeReps.length, partialRepsSkipped, stats, perRep, traps };
}

// ── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const condArg = args.includes("--conditions") ? args[args.indexOf("--conditions") + 1] : Object.keys(CONDITIONS).join(",");
const onlyCategory = args.includes("--only-category") ? args[args.indexOf("--only-category") + 1] : null;
if (args.includes("--repeat")) REPEAT = Math.max(1, Number(args[args.indexOf("--repeat") + 1]) || 1);

fs.mkdirSync(OUT_DIR, { recursive: true });

const health = await fetch(`${SERVER}/api/health`).then(r => r.json()).catch(() => null);
if (!health?.ok) {
  console.error("Servidor no disponible en " + SERVER);
  process.exit(1);
}
console.log(`Servidor OK — provider=${health.provider} model=${health.model} — REPEAT=${REPEAT}`);

const aggregates = [];
for (const condName of condArg.split(",")) {
  const flags = CONDITIONS[condName.trim()];
  if (!flags) { console.error(`Condición desconocida: ${condName}`); continue; }
  const results = await runCondition(condName.trim(), flags, onlyCategory);
  aggregates.push(aggregateReps(condName.trim(), results));
}

// summary.json: compacto (media±DE listo para el paper) ; summary-stats.json: completo (perRep + DE)
const compact = aggregates.map(a => ({
  condition: a.condition,
  reps: a.reps,
  skipped: a.partialRepsSkipped,
  actionEmissionRate: fmt(a.stats.actionEmissionRate),
  spuriousActionRate: fmt(a.stats.spuriousActionRate),
  jsonValidityRate: fmt(a.stats.jsonValidityRate),
  semanticValidityRate: fmt(a.stats.semanticValidityRate),
  interceptedActions: fmt(a.stats.interceptedActions),
  normalizedActions: fmt(a.stats.normalizedActions),
  retryRate: fmt(a.stats.retryRate),
  medianLatencyMs: fmt(a.stats.medianLatencyMs),
}));
fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(compact, null, 2));
fs.writeFileSync(path.join(OUT_DIR, "summary-stats.json"), JSON.stringify(aggregates, null, 2));

console.log("\n===== RESUMEN (media ± DE entre reps) =====");
console.table(compact);
console.log("Estabilidad de trampas (conteo por reps):");
for (const a of aggregates) console.log(a.condition, JSON.stringify(a.traps));

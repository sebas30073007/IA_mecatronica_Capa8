// src/model/schema.js
// Esquema y helpers de versionado/migración.
import { isIPv4 } from "./addressing.js";

export const GRAPH_VERSION = 3;

export function createEmptyGraph() {
  return {
    version: GRAPH_VERSION,
    meta: {
      name: "Untitled",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    nodes: [],
    links: [],
  };
}

export function createDemoGraph() {
  return {
    version: GRAPH_VERSION,
    meta: {
      name: "CAPA 8 Demo",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    nodes: [
      { id: "n1", type: "router", label: "Router 1", x: 420, y: 160, ip: "10.0.0.1" },
      { id: "n2", type: "switch", label: "Switch 1", x: 420, y: 260, ip: "10.0.1.2" },
      { id: "n3", type: "pc", label: "PC 1", x: 560, y: 360, ip: "10.0.1.10" },
      { id: "n4", type: "pc", label: "PC 2", x: 280, y: 360, ip: "10.0.1.11" },
    ],
    links: [
      { id: "l1", source: "n1", target: "n2", latencyMs: 5, bandwidthMbps: 1000, lossPct: 0, status: "up" },
      { id: "l2", source: "n2", target: "n3", latencyMs: 18, bandwidthMbps: 100, lossPct: 1, status: "up" },
      { id: "l3", source: "n2", target: "n4", latencyMs: 12, bandwidthMbps: 100, lossPct: 0, status: "up" },
    ],
  };
}

export function normalizeGraph(raw) {
  // Migración ligera: valida shape y llena defaults.
  if (!raw || typeof raw !== "object") return createEmptyGraph();
  const g = {
    version: Number(raw.version) || GRAPH_VERSION,
    meta: { ...(raw.meta || {}) },
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    links: Array.isArray(raw.links) ? raw.links : [],
  };

  g.meta.name = g.meta.name || "Imported";
  g.meta.updatedAt = Date.now();
  if (!g.meta.createdAt) g.meta.createdAt = Date.now();

  // Normalizar nodos
  g.nodes = g.nodes.map((n, idx) => ({
    id: n.id || `n${Date.now()}_${idx}`,
    type: n.type || "pc",
    label: n.label || "Node",
    x: Number.isFinite(n.x) ? n.x : 200 + (idx % 6) * 130,
    y: Number.isFinite(n.y) ? n.y : 200 + Math.floor(idx / 6) * 130,
    ip: n.ip || "",
    mask:        (typeof n.mask === "number" && n.mask >= 0 && n.mask <= 32) ? n.mask : null,
    gateway:     (n.gateway && isIPv4(n.gateway)) ? n.gateway : "",
    // Advanced fields
    description: n.description || "",
    os:          n.os || "",
    vlan:        (typeof n.vlan === "number" && n.vlan >= 1 && n.vlan <= 4094) ? n.vlan : null,
    mtu:         (typeof n.mtu === "number" && n.mtu >= 68) ? n.mtu : 1500,
  }));

  // Normalizar links
  g.links = g.links.map((l, idx) => ({
    id: l.id || `l${Date.now()}_${idx}`,
    source: l.source,
    target: l.target,
    latencyMs:     Number.isFinite(l.latencyMs)     ? l.latencyMs     : 0.5,
    bandwidthMbps: Number.isFinite(l.bandwidthMbps) ? l.bandwidthMbps : 1000,
    lossPct:       Number.isFinite(l.lossPct)       ? l.lossPct       : 0,
    status:        l.status || "up",
    // Advanced fields
    mediaType:    ["ethernet","fiber","wifi","serial","adsl"].includes(l.mediaType) ? l.mediaType : "ethernet",
    duplex:       l.duplex === "half" ? "half" : "full",
    jitter:       Number.isFinite(l.jitter) ? l.jitter : 0,
    mtu:          (typeof l.mtu === "number" && l.mtu >= 68) ? l.mtu : 1500,
    description:  l.description || "",
  })).filter(l => l.source && l.target);

  return g;
}

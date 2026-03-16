// src/model/addressing.js
// Helpers básicos IPv4 para uso didáctico (sin obsesión RFC)

export function isIPv4(ip) {
  const parts = String(ip).trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

export function suggestIp(type, seed = 10) {
  const base = ({
    router:   "10.0.0.",
    switch:   "10.0.1.",
    pc:       "10.0.2.",
    firewall: "10.0.3.",
    server:   "10.0.4.",
    cloud:    "",         // la nube generalmente no tiene IP local
    ap:       "10.0.5.",
    plc:      "10.0.6.",
    ur3:      "10.0.7.",
    agv:      "10.0.8.",
  }[type] ?? "10.0.9.");
  if (!base) return "";
  const last = seed + Math.floor(Math.random() * 200);
  return `${base}${last}`;
}

// Parsea "/24", "24", o "255.255.255.0" → integer 0-32, o null si inválido
export function parseMask(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // CIDR: /24 o simplemente 24
  const cidrMatch = s.match(/^\/?\s*(\d{1,2})$/);
  if (cidrMatch) {
    const prefix = Number(cidrMatch[1]);
    return (prefix >= 0 && prefix <= 32) ? prefix : null;
  }

  // Decimal punteada: 255.255.255.0
  if (isIPv4(s)) {
    const bits = s.split(".").map(Number)
      .reduce((acc, oct) => (acc << 8) | oct, 0) >>> 0;
    if (bits === 0) return 0;
    const inverted = (~bits) >>> 0;
    if ((inverted & (inverted + 1)) !== 0) return null; // máscara no contigua
    let prefix = 0;
    for (let i = 31; i >= 0; i--) {
      if ((bits >>> i) & 1) prefix++; else break;
    }
    return prefix;
  }

  return null;
}

// Convierte prefijo entero → "255.255.255.0"
export function prefixToDotted(prefix) {
  if (prefix === 0) return "0.0.0.0";
  if (prefix === 32) return "255.255.255.255";
  const bits = (~(0xFFFFFFFF >>> prefix)) >>> 0;
  return [24, 16, 8, 0].map(shift => (bits >>> shift) & 0xFF).join(".");
}

// Genera MAC determinista a partir del ID del nodo ("n3" → "02:CA:08:00:00:03")
export function generateMac(nodeId) {
  const num = parseInt(String(nodeId).replace(/\D/g, ""), 10) || 0;
  const b = [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  return `02:CA:08:${b[0].toString(16).padStart(2, "0").toUpperCase()}:${b[1].toString(16).padStart(2, "0").toUpperCase()}:${b[2].toString(16).padStart(2, "0").toUpperCase()}`;
}

// Retorna la dirección de red dado ip "10.0.2.5" y prefix 24 → "10.0.2.0"
export function networkAddress(ip, prefix) {
  if (!isIPv4(ip) || prefix === null || prefix < 0 || prefix > 32) return ip;
  const parts = ip.split(".").map(Number);
  const ipInt = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  const mask  = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0;
  const netInt = (ipInt & mask) >>> 0;
  return [24, 16, 8, 0].map(s => (netInt >>> s) & 0xff).join(".");
}

// Devuelve el texto de equivalencia para mostrar bajo el input
export function maskHint(raw) {
  const prefix = parseMask(raw);
  if (prefix === null) return "";
  const s = String(raw ?? "").trim().replace(/^\//, "");
  if (/^\d{1,2}$/.test(s)) return `= ${prefixToDotted(prefix)}`;
  if (isIPv4(s)) return `= /${prefix}`;
  return "";
}

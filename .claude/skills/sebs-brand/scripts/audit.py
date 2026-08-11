#!/usr/bin/env python3
"""
Auditoría de marca SEBS — detecta lo que es verificable por regla.

Uso:
    python audit.py <archivo-o-directorio> [...]
    python audit.py . --quiet        # solo crítico y mayor

NO sustituye el juicio de composición. El presupuesto de rojo, las tres
pruebas (grises, entrecerrado, conteo) y la jerarquía se evalúan a ojo.
Ver references/color.md §3.
"""

import os
import re
import sys

# --------------------------------------------------------------------- paleta

PALETTE = {
    "#ffffff": "Technical White", "#fff": "Technical White",
    "#111317": "Graphite",
    "#1a1d22": "Graphite raised",
    "#6b6f76": "Alloy",
    "#8e939b": "Alloy light",
    "#e5e7eb": "Mist",
    "#2a2d33": "Divider dark",
    "#e30613": "SEBS Signal",
    "#b80510": "Signal hover",
    "#ff3b47": "Signal light",
    "#2563eb": "Electric Blue", "#00bfa6": "Cyber Teal",
    "#ffc107": "Engine Yellow", "#7c3aed": "Violet Core",
    "#ff6b35": "Copper",
    "#16a34a": "Success green",
}

# Rojos de marca + rojos heredados del sistema SMV anterior
RED_HEX = {"#e30613", "#b80510", "#ff3b47", "#e00034", "#bd002c"}
LEGACY_HEX = {"#e00034": "--red (SMV)", "#bd002c": "--red-dark (SMV)",
              "#f3f3f4": "--paper (SMV)", "#0d0d0d": "--ink (SMV)"}
RED_TOKENS = {"--sebs-signal", "--sebs-signal-hover", "--sebs-signal-light",
              "--red", "--red-dark"}

SPACE_SCALE = {0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128}
RADIUS_SCALE = {0, 4, 6, 8, 12, 16, 9999}
FONTS_OK = {"manrope", "ibm plex mono"}
FONTS_GENERIC = {
    "sans-serif", "serif", "monospace", "system-ui", "-apple-system",
    "segoe ui", "roboto", "ui-monospace", "sf mono", "consolas", "inherit",
    "blinkmacsystemfont", "helvetica neue", "helvetica", "arial", "menlo",
}

# Propiedades donde el rojo se convierte en superficie
SURFACE_PROPS = re.compile(
    r"\b(background|background-color|background-image|fill)\s*:", re.I)
SPACING_PROPS = re.compile(
    r"^\s*(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:", re.I)
RADIUS_PROP = re.compile(r"^\s*border-radius\s*:", re.I)
FONT_PROP = re.compile(r"^\s*font-family\s*:\s*([^;}]+)", re.I)
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
PX_RE = re.compile(r"(-?\d+(?:\.\d+)?)px")

CRITICAL, MAJOR, MINOR = "CRITICO", "MAYOR", "MENOR"


def strip_comments(text):
    """Quita comentarios CSS y HTML preservando el conteo de lineas."""
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
    text = re.sub(r"<!--.*?-->", blank, text, flags=re.S)
    return text


def norm_hex(h):
    h = h.lower()
    if len(h) == 4:  # #abc -> #aabbcc
        h = "#" + "".join(c * 2 for c in h[1:])
    if len(h) == 9:  # #rrggbbaa -> ignora alfa
        h = h[:7]
    return h


def audit_text(text, path, findings):
    # Se conservan las lineas crudas: el marcador /* sebs-allow */ vive en un
    # comentario y strip_comments lo borraria.
    raw_lines = text.splitlines()
    text = strip_comments(text)
    in_root = False
    red_hits = 0

    for i, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        raw = raw_lines[i - 1] if i - 1 < len(raw_lines) else ""
        # Uso de rojo declarado como autorizado (boton primario, estado activo,
        # foco, indicador). Marcar con /* sebs-allow: motivo */ en la linea.
        allowed = "sebs-allow" in raw

        # El bloque :root define tokens: ahi los hex crudos son correctos.
        if ":root" in low or re.search(r"\.surface-\w+\s*\{", low):
            in_root = True
        if in_root and "}" in line:
            in_root = False
            continue

        def add(sev, msg):
            findings.append((sev, path, i, msg, line.strip()[:100]))

        # ---- rojo como superficie (critico) ----
        if SURFACE_PROPS.search(line):
            value = line.split(":", 1)[1] if ":" in line else ""
            vlow = value.lower()
            hit = None
            for h in HEX_RE.findall(value):
                if norm_hex(h) in RED_HEX:
                    hit = h
                    break
            if not hit:
                # Mas largo primero: --red-dark antes que --red.
                for t in sorted(RED_TOKENS, key=len, reverse=True):
                    if re.search(re.escape(t) + r"(?![\w-])", vlow):
                        hit = t
                        break
            if hit and not allowed:
                red_hits += 1
                add(CRITICAL,
                    "Rojo como superficie ({}). El rojo es senal, nunca fondo. "
                    "Excepcion: boton primario, unico por vista. Ver color.md sec.3."
                    .format(hit))

        # ---- hex fuera de paleta ----
        if not in_root:
            for h in HEX_RE.findall(line):
                n = norm_hex(h)
                if n in LEGACY_HEX:
                    add(MAJOR, "Color heredado del sistema SMV: {} ({}). "
                               "Migrar al token SEBS.".format(h, LEGACY_HEX[n]))
                elif n not in PALETTE:
                    add(MAJOR, "Hex fuera de paleta: {}. Usar var(--token).".format(h))
                else:
                    add(MINOR, "Hex crudo {} ({}). Usar var(--token) en su lugar."
                        .format(h, PALETTE[n]))

        # ---- tipografia ----
        m = FONT_PROP.search(line)
        if m:
            for fam in m.group(1).split(","):
                fam = fam.strip().strip('"\'').lower()
                if not fam or fam.startswith("var(") or fam in FONTS_GENERIC:
                    continue
                if fam not in FONTS_OK:
                    add(MAJOR, "Tipografia no oficial: '{}'. Solo Manrope "
                               "e IBM Plex Mono.".format(fam))

        # ---- spacing fuera de escala ----
        if SPACING_PROPS.search(line):
            for v in PX_RE.findall(line):
                n = abs(float(v))
                if n and n not in SPACE_SCALE:
                    add(MINOR, "Spacing fuera de escala: {}px. Escala base 4: "
                               "4/8/12/16/24/32/48/64/96/128.".format(v))

        # ---- radio fuera de escala ----
        if RADIUS_PROP.search(line):
            for v in PX_RE.findall(line):
                n = abs(float(v))
                if n and n not in RADIUS_SCALE:
                    add(MINOR, "Radio fuera de escala: {}px. Tokens: "
                               "4/6/8/12/16/9999.".format(v))

    return red_hits


def collect(paths):
    files = []
    skip = {"node_modules", ".git", "dist", "build", ".claude"}
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = [d for d in dirs if d not in skip]
            for n in names:
                if n.lower().endswith((".css", ".html", ".htm")):
                    files.append(os.path.join(root, n))
    return sorted(files)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    quiet = "--quiet" in sys.argv
    if not args:
        print(__doc__)
        return 2

    files = collect(args)
    if not files:
        print("Sin archivos .css/.html en las rutas dadas.")
        return 2

    findings = []
    red_total = 0
    for f in files:
        try:
            with open(f, "r", encoding="utf-8", errors="replace") as fh:
                red_total += audit_text(fh.read(), f, findings)
        except OSError as e:
            print("No se pudo leer {}: {}".format(f, e))

    order = {CRITICAL: 0, MAJOR: 1, MINOR: 2}
    findings.sort(key=lambda x: (order[x[0]], x[1], x[2]))

    counts = {CRITICAL: 0, MAJOR: 0, MINOR: 0}
    for f in findings:
        counts[f[0]] += 1

    print("\n  AUDITORIA DE MARCA SEBS")
    print("  {} archivo(s) | {} critico | {} mayor | {} menor\n"
          .format(len(files), counts[CRITICAL], counts[MAJOR], counts[MINOR]))

    shown = 0
    current = None
    for sev, path, line, msg, snippet in findings:
        if quiet and sev == MINOR:
            continue
        if sev != current:
            print("  " + "-" * 66)
            print("  {}".format(sev))
            print("  " + "-" * 66)
            current = sev
        print("  {}:{}".format(path, line))
        print("    {}".format(msg))
        print("    | {}".format(snippet))
        shown += 1

    if not shown:
        print("  Sin hallazgos automaticos.")

    print("\n  " + "=" * 66)
    print("  Usos de rojo como superficie detectados: {}".format(red_total))
    print("""
  El script no puede juzgar composicion. Falta verificar a ojo:
    1. Escala de grises  - la jerarquia aguanta sin color?
    2. Entrecerrado      - el rojo son puntos, no manchas?
    3. Conteo            - un boton primario y un estado activo por vista?
    4. Contraste WCAG    - tabla en references/color.md sec.5
""")
    return 1 if counts[CRITICAL] else 0


if __name__ == "__main__":
    sys.exit(main())

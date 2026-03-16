# Network Icon Update — Instrucciones para Claude Code

## Objetivo
Reemplazar los iconos SVG de nodos de red existentes por un nuevo set rediseñado.
Aplicar también la lógica de **color dual: dark mode (icono de color) / light mode (círculo de color sólido + icono blanco)**.

---

## 1. Nuevo set de iconos SVG

Cada icono es una función que recibe un color `(c)` como string hexadecimal y devuelve un SVG string.
Busca en el código existente dónde se definen los iconos por tipo (`router`, `switch`, `pc`, etc.) y reemplaza **cada uno** con las definiciones de abajo.

> Si el proyecto usa un objeto como `NODE_ICON`, `ICONS`, `iconMap` o similar, reemplaza las entradas correspondientes.
> Si usa componentes React individuales, adapta el SVG path al patrón que ya usa el proyecto.

```js
// ─────────────────────────────────────────────────────────────────
// NUEVO SET DE ICONOS — usar el color semántico de cada tipo
// Uso:  getSvg('router', '#60a5fa')  →  string SVG listo para innerHTML
// ─────────────────────────────────────────────────────────────────

const NODE_ICONS = {

  router: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="22" stroke="${c}" stroke-width="1.8"/>
    <line x1="25" y1="21" x2="25" y2="13" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,10 21.5,15 28.5,15" fill="${c}"/>
    <line x1="25" y1="29" x2="25" y2="37" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="25,40 21.5,35 28.5,35" fill="${c}"/>
    <line x1="32" y1="25" x2="40" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="29,25 34,21.5 34,28.5" fill="${c}"/>
    <line x1="10" y1="25" x2="18" y2="25" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>
    <polygon points="21,25 16,21.5 16,28.5" fill="${c}"/>
  </svg>`,

  switch: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="18" width="42" height="14" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="8"  y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2"/>
    <rect x="15" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".8"/>
    <rect x="22" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".6"/>
    <rect x="29" y="22" width="5" height="6" rx="1" stroke="${c}" stroke-width="1.2" opacity=".4"/>
    <circle cx="39" cy="25" r="2.2" fill="${c}"/>
  </svg>`,

  pc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="11" width="36" height="22" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="10" y="14" width="30" height="16" rx="1.5" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <line x1="14" y1="19" x2="28" y2="19" stroke="${c}" stroke-width="1" opacity=".5" stroke-linecap="round"/>
    <line x1="14" y1="22" x2="36" y2="22" stroke="${c}" stroke-width="1" opacity=".35" stroke-linecap="round"/>
    <line x1="14" y1="25" x2="22" y2="25" stroke="${c}" stroke-width="1" opacity=".25" stroke-linecap="round"/>
    <line x1="25" y1="33" x2="25" y2="38" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="16" y1="41" x2="34" y2="41" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="16" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="38" x2="34" y2="41" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  firewall: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 5L9 13v12c0 10 7 18 16 20 9-2 16-10 16-20V13L25 5z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="18" y="26" width="14" height="10" rx="2" stroke="${c}" stroke-width="1.5" fill="none"/>
    <path d="M20 26v-3a5 5 0 0110 0v3" stroke="${c}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="31" r="2" fill="${c}"/>
  </svg>`,

  server: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="9"  width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="21" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="7" y="33" width="36" height="9" rx="2" stroke="${c}" stroke-width="1.7" fill="none"/>
    <rect x="10" y="11.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="23.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <rect x="10" y="35.5" width="18" height="4" rx="1" stroke="${c}" stroke-width="1" opacity=".3" fill="none"/>
    <circle cx="37" cy="13.5" r="2" fill="${c}"/>
    <circle cx="37" cy="25.5" r="2" fill="${c}" opacity=".6"/>
    <circle cx="37" cy="37.5" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  cloud: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M36 30H17a8 8 0 01-1-15.9A10 10 0 0133 16a7 7 0 013 12z"
          fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <line x1="19" y1="37" x2="19" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="25" y1="39" x2="25" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="31" y1="37" x2="31" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="19" cy="38.5" r="1.5" fill="${c}"/>
    <circle cx="25" cy="40.5" r="1.5" fill="${c}"/>
    <circle cx="31" cy="38.5" r="1.5" fill="${c}"/>
  </svg>`,

  ap: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 15 A24 24 0 0 1 42 15" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M13 20 A17 17 0 0 1 37 20" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M18 25 A10 10 0 0 1 32 25" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="26" r="2.5" fill="${c}"/>
    <line x1="25" y1="28.5" x2="25" y2="33" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
    <rect x="16" y="33" width="18" height="5" rx="2.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="29" cy="35.5" r="1.2" fill="${c}" opacity=".7"/>
  </svg>`,

  plc: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="10" width="34" height="28" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <rect x="12" y="14" width="26" height="7" rx="1" stroke="${c}" stroke-width="1.2" opacity=".5" fill="none"/>
    <circle cx="14" cy="27" r="2" fill="${c}"/>
    <circle cx="21" cy="27" r="2" fill="${c}" opacity=".6"/>
    <circle cx="28" cy="27" r="2" fill="${c}" opacity=".35"/>
  </svg>`,

  ur3: (c) => `<svg viewBox="4 18 42 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="39" width="12" height="5" rx="2.5" fill="${c}" opacity=".8"/>
    <rect x="11" y="34" width="6" height="6" rx="1" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="3" stroke="${c}" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="33" r="1" fill="${c}"/>
    <line x1="14" y1="33" x2="19" y2="23" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="20" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="20" cy="22" r="0.9" fill="${c}"/>
    <line x1="20" y1="22" x2="32" y2="22" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="33" cy="22" r="2.8" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="33" cy="22" r="0.9" fill="${c}"/>
    <line x1="33" y1="22" x2="35" y2="33" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="35" cy="34" r="2.3" stroke="${c}" stroke-width="1.3" fill="none"/>
    <line x1="32" y1="36" x2="29" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="38" y1="36" x2="41" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="32" y1="37.5" x2="38" y2="37.5" stroke="${c}" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
  </svg>`,

  agv: (c) => `<svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="13" y="15" width="30" height="20" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
    <path d="M13 18 L8 22 L8 28 L13 32" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="14" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="11" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="14" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <rect x="30" y="35" width="8" height="4" rx="1.5" stroke="${c}" stroke-width="1.4" fill="none"/>
    <circle cx="8" cy="25" r="1.5" fill="${c}"/>
  </svg>`,
};
```

---

## 2. Colores semánticos por tipo de nodo

Usa estos valores. Hay dos sets: uno para **dark mode** (colores brillantes) y otro para **light mode** (colores más profundos).

```js
const NODE_COLORS = {
  dark: {
    router:   '#60a5fa',
    switch:   '#22d3ee',
    pc:       '#a78bfa',
    firewall: '#f87171',
    server:   '#34d399',
    cloud:    '#7dd3fc',
    ap:       '#fbbf24',
    plc:      '#a78bfa',
    ur3:      '#38bdf8',
    agv:      '#fb923c',
  },
  light: {
    router:   '#2563eb',
    switch:   '#0891b2',
    pc:       '#7c3aed',
    firewall: '#dc2626',
    server:   '#059669',
    cloud:    '#3b82f6',
    ap:       '#d97706',
    plc:      '#6d28d9',
    ur3:      '#0369a1',
    agv:      '#c2410c',
  },
};
```

---

## 3. Colores del círculo/burbuja de fondo

### Dark mode → tint semitransparente
```js
const BUBBLE_COLORS_DARK = {
  router:   'rgba(96,165,250,0.12)',
  switch:   'rgba(34,211,238,0.12)',
  pc:       'rgba(167,139,250,0.12)',
  firewall: 'rgba(248,113,113,0.12)',
  server:   'rgba(52,211,153,0.12)',
  cloud:    'rgba(125,211,252,0.12)',
  ap:       'rgba(251,191,36,0.12)',
  plc:      'rgba(167,139,250,0.12)',
  ur3:      'rgba(56,189,248,0.12)',
  agv:      'rgba(251,146,60,0.12)',
};
```

### Light mode → color sólido (el mismo que el icono), SVG en blanco
```js
const BUBBLE_COLORS_LIGHT = {
  router:   '#2563eb',
  switch:   '#0891b2',
  pc:       '#7c3aed',
  firewall: '#dc2626',
  server:   '#059669',
  cloud:    '#3b82f6',
  ap:       '#d97706',
  plc:      '#6d28d9',
  ur3:      '#0369a1',
  agv:      '#c2410c',
};
```

En **light mode**, el SVG dentro del círculo debe renderizarse en **blanco**.

- Si usas CSS: añade esta regla
  ```css
  body.light .node-bubble svg,
  .light-theme .node-bubble svg {
    filter: brightness(0) invert(1);
  }
  ```
- Si renderizas el color del icono via JS/prop: pasa `'#ffffff'` como color en light mode en lugar del color semántico.

---

## 4. Tamaño del icono dentro del círculo

El SVG del icono debe renderizarse a **46×46px** dentro de un círculo contenedor de **58×58px**.

```css
.node-bubble {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.node-bubble svg {
  width: 46px;
  height: 46px;
}
```

---

## 5. Cómo usarlo — ejemplo de integración

### Vanilla JS / innerHTML
```js
function renderNodeIcon(type, isDark) {
  const theme = isDark ? 'dark' : 'light';
  const color = isDark ? NODE_COLORS.dark[type] : '#ffffff'; // blanco en light
  const bubbleBg = isDark ? BUBBLE_COLORS_DARK[type] : BUBBLE_COLORS_LIGHT[type];
  const svgString = NODE_ICONS[type](color);

  return `<div class="node-bubble" style="background:${bubbleBg}">${svgString}</div>`;
}
```

### React
```jsx
function NodeIcon({ type, isDark }) {
  const color = isDark ? NODE_COLORS.dark[type] : '#ffffff';
  const bubbleBg = isDark ? BUBBLE_COLORS_DARK[type] : BUBBLE_COLORS_LIGHT[type];
  const svgString = NODE_ICONS[type](color);

  return (
    <div
      style={{
        width: 58, height: 58, borderRadius: '50%',
        background: bubbleBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}
```

---

## 6. Notas importantes

- El **router** usa `viewBox="0 0 50 50"` con un círculo `r="22"` — es intencionalmente grande para que las flechas queden dentro del círculo.
- El **UR3** usa `viewBox="4 18 42 32"` (recortado) para que el brazo llene el área visible y quede centrado en el círculo.
- Todos los demás usan `viewBox="0 0 50 50"`.
- Los iconos **no tienen relleno de fondo** — el círculo de color lo provee el contenedor `.node-bubble`.
- El icono del **switch** tiene `stroke` en los puertos (no `fill`) — en light mode con `filter: invert(1)` se ve correctamente blanco.

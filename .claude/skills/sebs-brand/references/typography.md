# Tipografía

Dos familias. Ninguna tercera.

---

## 1. Reparto

**Manrope** — todo lo que se lee como lenguaje: interfaz, navegación, títulos, cuerpo, botones, formularios, presentaciones, portafolio, documentación.

**IBM Plex Mono** — solo lo que se lee como dato:

- Revisiones y versiones — `REV 2.1`, `Firmware 2.1`
- IDs y códigos — `CTRL-04`, `RH-001`
- Estados técnicos — `STATUS: ACTIVE`
- Timestamps — `2026-05-12T10:30:00Z`
- Direcciones IP, nombres de señales, nombres de archivo
- Bloques de código, logs, especificaciones, información de PCB
- Valores en tablas técnicas

**IBM Plex Mono nunca es tipografía de cuerpo, de título ni de navegación.** El mono es lo que hace que un dato se lea como dato. Si se usa para prosa, deja de significar algo.

**El wordmark SEBS no es tipografía.** Es un asset geométrico propio. Nunca reescribirlo en Manrope ni en mono. Ver `logo.md`.

---

## 2. Escala

| Estilo | Familia | Peso | Tamaño | Line-height | Tracking |
|---|---|---:|---:|---:|---:|
| H1 | Manrope | ExtraBold 800 | 40px | 48px | -0.02em |
| H2 | Manrope | Bold 700 | 32px | 40px | -0.01em |
| H3 | Manrope | SemiBold 600 | 24px | 32px | 0 |
| H4 | Manrope | SemiBold 600 | 20px | 28px | 0 |
| H5 | Manrope | Medium 500 | 16px | 24px | 0 |
| Body | Manrope | Regular 400 | 16px | 24px | 0 |
| Small | Manrope | Regular 400 | 14px | 20px | 0 |
| Label | Manrope | Medium 500 | 12px | 16px | 0.02em |
| Technical | IBM Plex Mono | Regular 400 | 12px | 16px | 0 |

Notas:

- El tracking negativo en H1/H2 no es opcional — sin él Manrope ExtraBold se ve suelto y pierde el carácter técnico.
- No inventar tamaños intermedios. Si hace falta un escalón, se agrega a la escala del documento, no al componente.
- En hero de portafolio, H1 puede escalar con `clamp()` manteniendo la proporción y el tracking.

---

## 3. Jerarquía sin color

La jerarquía se construye con **peso, tamaño y espaciado** — nunca con rojo. Si un título necesita rojo para leerse como título, el problema es la escala.

Orden de recursos para dar énfasis, en este orden:

1. Tamaño y peso.
2. Espacio alrededor.
3. Contraste de superficie (`light` ↔ `dark`).
4. Color secundario (Alloy) para bajar jerarquía.
5. Rojo — solo si es una acción o un estado, no si es "importante".

---

## 4. Patrón de metadatos

El combo característico de SEBS: label en Manrope Medium 12px + dato en IBM Plex Mono 12px.

```html
<div class="meta">
  <span class="label">Revision</span>
  <span class="tech-data">REV 2.1</span>
</div>
```

En cards de proyecto, la categoría va como Label en Alloy sobre el título:

```html
<p class="label">Robotics · XR</p>
<h3>Remote Hands</h3>
```

---

## 5. CSS

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');

body {
  font-family: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 24px;
}

code, pre, .mono, .tech-data {
  font-family: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
}

h1 { font-weight: 800; font-size: 40px; line-height: 48px; letter-spacing: -0.02em; }
h2 { font-weight: 700; font-size: 32px; line-height: 40px; letter-spacing: -0.01em; }
h3 { font-weight: 600; font-size: 24px; line-height: 32px; }
h4 { font-weight: 600; font-size: 20px; line-height: 28px; }
h5 { font-weight: 500; font-size: 16px; line-height: 24px; }

.small { font-size: 14px; line-height: 20px; }
.label { font-weight: 500; font-size: 12px; line-height: 16px; letter-spacing: 0.02em; }
.tech-data { font-size: 12px; line-height: 16px; }
```

Preferir self-hosting de las fuentes en producción — evita la dependencia de red y el FOUT.

---

## 6. Antipatrones

- Una tercera familia tipográfica.
- Mono para prosa, títulos o navegación.
- Tipografías futuristas, condensadas display, o cualquier cosa que se lea "gamer".
- Wordmark SEBS reescrito con fuente.
- Títulos en rojo para crear jerarquía.
- Texto en mayúsculas sin tracking positivo.
- Line-height por debajo de 1.4 en cuerpo.

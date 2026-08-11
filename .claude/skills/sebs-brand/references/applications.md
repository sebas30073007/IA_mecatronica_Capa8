# Aplicaciones

Motion, iconografía, fotografía, hardware y documentación.

---

## 1. Motion

Debe sentirse **preciso, breve, funcional, deliberado**.

Puede inspirarse en: ensamble de módulos, aparición de capas, rotación controlada, convergencia, trayectorias, cambios de estado.

Guía práctica:

| | Valor |
|---|---|
| Micro-interacción (hover, foco) | 120–180 ms |
| Transición de componente | 200–300 ms |
| Entrada de sección | 300–450 ms |
| Easing por defecto | `cubic-bezier(0.4, 0, 0.2, 1)` |

- Sin rebotes exagerados ni overshoot.
- Sin glitch ni estética cyberpunk.
- Sin motion puramente decorativo — cada animación comunica un cambio de estado o una relación entre elementos.
- Respetar `prefers-reduced-motion`, siempre.

---

## 2. Iconografía

Simple, geométrica, grosor consistente, legible en tamaños pequeños, preferentemente lineal.

- Grosor de trazo uniforme en todo el set (1.5–2 px a 24 px).
- Terminaciones y radios consistentes.
- Un solo set — no mezclar librerías.

Evitar: íconos ilustrativos, detalle innecesario, brillos, sombras, 3D decorativo, estética gamer.

---

## 3. Fotografía y renders

Preferencias: producto como protagonista, fondos sobrios, iluminación limpia, contexto técnico real, detalles de materiales, componentes, procesos, prototipos, ensamble.

Evitar: stock genérico, tecnología abstracta de neón, gradientes azul-morado de "innovación", manos señalando hologramas.

**Las imágenes de galería se muestran en su proporción natural** — no recortarlas en cajas 16:9.

---

## 4. PCB y hardware

SEBS funciona como **firma discreta**, nunca como elemento dominante. Detalle en `logo.md` §8.

```
SEBS · CTRL-01
REV A
```

Etiquetado técnico en IBM Plex Mono. El protagonista visual es el objeto, no la marca.

---

## 5. Documentación

Comparte todo con el sistema: Manrope, IBM Plex Mono, grid, espaciado, neutros, señal, estilo de tablas, diagramas, callouts, versionado, portadas.

Bloques de datos en mono:

```txt
project_id: RH-001
revision: 2.1
status: ACTIVE
updated: 2026-05-12T10:30:00Z
```

Debe sentirse clara, replicable y profesional.

---

## 6. Grid y layout

**Desktop** — contenedor máx. `1280px` · 12 columnas · gutter `24px` · margen lateral mín. `24px`
**Tablet** — adaptación progresiva manteniendo gutter, jerarquía y ritmo
**Mobile** — una columna cuando sea necesario · margen lateral `16–24px` · evitar scroll horizontal salvo contenido técnico que realmente lo requiera

Espaciado — base **4px**:

| Token | | Token | |
|---|---:|---|---:|
| `xs` | 4px | `2xl` | 32px |
| `sm` | 8px | `3xl` | 48px |
| `md` | 12px | `4xl` | 64px |
| `lg` | 16px | `5xl` | 96px |
| `xl` | 24px | `6xl` | 128px |

Radios:

| Token | | Uso |
|---|---:|---|
| `xs` / `sm` | 4 / 6px | tags, chips, controles pequeños |
| `md` | 8px | inputs, botones |
| `lg` | 12px | cards |
| `xl` | 16px | paneles principales |
| `round` | 9999px | badges, pills, indicadores circulares |

Bordes: `hairline`/`thin` 1px · `medium` 2px · `thick` 3px. Reservar 2–3px para selección o estados destacados. Evitar bordes negros pesados en superficie clara.

Principios: usar tokens antes que valores arbitrarios · mantener ritmo vertical consistente · favorecer aire y claridad · la información técnica puede ser compacta, pero nunca apretada.

---

## 7. Arquitectura del portafolio

Dominio: `sebs.mx`

- **Selected Work** — proyectos curados con video, contexto, proceso, arquitectura, resultado y documentación.
- **Archive** — vista completa por año: proyectos, concursos, papers, PCBs, web, investigación, herramientas.
- **About**
- **Contact**

---

## 8. Tono visual

> Experimental, pero no caótico.
> Técnico, pero no frío.
> Accesible, pero no básico.
> Sobrio, pero no genérico.
> Profesional, pero no corporativo.
> Visualmente cuidado, pero nunca decorativo por sí mismo.

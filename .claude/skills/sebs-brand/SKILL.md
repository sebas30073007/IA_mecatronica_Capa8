---
name: sebs-brand
description: Sistema de identidad de marca SEBS (sebs.mx) — estudio de ingeniería de Sebastián Méndez. Usar al diseñar, construir o revisar cualquier interfaz, página, componente, documento o aplicación física de SEBS o de sus proyectos (Torke, Capa 8, Remote Hands, GearLab, PCBs, papers). Cubre color, superficies, tipografía, espaciado, componentes, uso de logo y sub-marcas. Invocar cuando se mencione SEBS, sebs.mx, marca, identidad, branding, paleta, "el rojo", tokens de diseño, o al escribir HTML/CSS para el portafolio.
---

# Identidad SEBS

Sistema de diseño de SEBS, estudio de ingeniería donde convergen hardware, software, UX y documentación.

**Fuente canónica:** `Identidad SEBS.md` v1.1, en `E:\20_UNI\Html proyects\portfolio\`. Esta skill es su forma operativa. Si hay conflicto, gana el documento — y actualiza esta skill.

Los assets de marca (logo, favicons) viven en `E:\20_UNI\Html proyects\portfolio\assets\img\`. Al trabajar en otro proyecto, copiarlos ahí en vez de enlazarlos.

---

## La regla que más importa

SEBS usa un rojo que es idéntico en espíritu al de muchas identidades institucionales mexicanas. Lo único que separa a SEBS de parecer una variación de una universidad es **cuánto rojo hay y dónde está**.

> **El rojo es señal, no superficie. ~1–2% del área visible. Nunca un fondo.**

El ritmo visual de SEBS se construye **alternando blanco y grafito como superficies**, no añadiendo color. Si una composición se siente plana, la respuesta es contraste de superficie, tipografía y espaciado — nunca más rojo.

Antes de dar por terminada cualquier pantalla, correr las tres pruebas de 3.4 (grises, entrecerrado, conteo). Están en `references/color.md`.

---

## No negociables

Estos aplican siempre, sin importar la tarea:

| | Regla |
|---|---|
| **Rojo** | `#E30613`. Solo botón primario (uno por vista), estado activo, indicador, borde de foco, dato en gráfica. Nunca fondo de nav, hero, card, sección, footer o banda. |
| **Superficies** | Toda sección declara `light`, `mist` o `dark`. Blanco y Grafito tienen el mismo rango — el negro no es "solo texto", el blanco no es "solo fondo". |
| **Tipografía** | Manrope para todo. IBM Plex Mono **solo** para datos técnicos: revisiones, IDs, timestamps, señales, archivos, código. Nunca mono como tipografía de cuerpo. |
| **Espaciado** | Escala base 4px. Usar tokens (`--space-*`), nunca valores arbitrarios. |
| **Radios** | Tokens (`--radius-*`). Cards `lg`, paneles `xl`, botones/inputs `md`. |
| **Color como única señal** | Prohibido. Todo estado lleva texto o ícono además del color. |
| **Wordmark** | El wordmark SEBS es un asset, no texto en Manrope. Nunca reescribirlo con fuente. |

**Antipatrones inmediatos:** RGB, neón, estética gamer, hexágonos tecnológicos, engranes, circuitos decorativos, degradados tecnológicos, glitch, glassmorphism decorativo, sombras pesadas.

---

## Rutas por tarea

Leer solo la referencia que corresponde a la tarea. No cargar todas.

| Tarea | Leer |
|---|---|
| Elegir o revisar colores, superficies, tintes, contraste | `references/color.md` |
| Tipografía, escala, jerarquía, uso de mono | `references/typography.md` |
| Construir botones, cards, tags, badges, tablas, formularios, nav | `references/components.md` |
| Colocar el logo, elegir variante, clear space, tamaño mínimo | `references/logo.md` |
| Dar identidad a un proyecto (Torke, Capa 8, Remote Hands…) | `references/subbrands.md` |
| Motion, iconografía, fotografía, PCB, documentación | `references/applications.md` |

**Tokens listos para copiar:** `assets/tokens.css` — pegar en `:root` y usar las clases `.surface-*`.

---

## Flujo: auditar una página existente

1. Correr el script de auditoría — detecta lo verificable por regex. La ruta
   depende de desde dónde se invoque (el runtime inyecta "Base directory for
   this skill" al cargarla):

   ```bash
   # Copia personal — funciona desde cualquier proyecto
   python ~/.claude/skills/sebs-brand/scripts/audit.py <archivo-o-directorio>

   # Copia del repo — solo dentro del portafolio
   python .claude/skills/sebs-brand/scripts/audit.py <archivo-o-directorio>
   ```

   Reporta: hex fuera de paleta, rojo usado como `background`, tipografías no oficiales, spacing y radios fuera de escala, y estima el presupuesto de rojo.

2. Leer `references/color.md` y aplicar las tres pruebas de la regla dura — el script no puede juzgar composición.

3. Revisar contraste WCAG de cada combinación texto/superficie (tabla en `references/color.md`).

4. Reportar hallazgos ordenados por gravedad: **crítico** (rojo como superficie, wordmark reescrito), **mayor** (fuera de paleta, tipografía incorrecta, contraste bajo), **menor** (spacing/radio arbitrario).

Corregir solo si se pidió. Auditar ≠ arreglar.

---

## Flujo: construir algo nuevo

1. **Declarar la superficie primero.** ¿La sección es `light`, `mist` o `dark`? Todo lo demás se deriva de ahí.
2. **Construir en gris.** Resolver jerarquía con tipografía, espaciado y contraste de superficie, sin rojo.
3. **Añadir el rojo al final**, en un solo lugar: la acción principal o el estado activo.
4. **Verificar** con las tres pruebas y con el script.

Este orden no es opcional — es lo que impide que el rojo termine sosteniendo la jerarquía.

---

## Estado del portafolio

**Migrado.** `css/styles.css` corre sobre tokens SEBS y el sistema de superficies. Auditoría en cero críticos y cero mayores.

Lo que se hizo: paleta y tipografía al sistema, superficies `light`/`dark` declaradas en header, footer, modal y paneles, y las 8 reglas que usaban rojo como superficie (hero, paneles About/Contact, tiras de folder-card, marcadores de año, chips) convertidas a Graphite.

Quedan **alias del sistema anterior** en `:root` (`--red`, `--ink`, `--paper`, `--white`, `--muted`, `--card`) apuntando a tokens SEBS. Mantienen vivo el CSS sin migrar; se retiran cuando no queden usos. Al escribir código nuevo, usar siempre los tokens SEBS, nunca los alias.

Pendientes conocidos:

- Wordmark: `.nav__logo` sigue siendo el texto "SMV", no el asset. `<title>` también.
- Escala tipográfica: solo `.hero__title` está en peso 800; los otros 11 títulos siguen en 700.
- `.gear-o` en featured-projects usa un engrane como recurso de marca — antipatrón explícito (§26).
- 21 hallazgos menores: radios y spacing fuera de escala.

### Convención `sebs-allow`

Un uso de rojo legítimamente autorizado se marca en la línea para que el auditor no lo reporte:

```css
background: var(--sebs-signal); /* sebs-allow: boton primario */
```

Usar solo para los casos que la regla 3.4 permite, y decir cuál. No es un silenciador de propósito general.

---

## Pendientes del sistema

Al topar con estos, señalarlo en vez de inventar el valor:

- Área de seguridad exacta del logo (unidad de clear space).
- Tamaños mínimos definitivos y posible micro-logo para 16–24 px.
- Archivos maestros SVG (hoy solo hay PNG).
- Validación WCAG completa de todas las combinaciones.

# Color y superficies

Referencia operativa de la sección 3 de `Identidad SEBS.md`.

---

## 1. Roles

Cada color tiene un rol y no puede ejercer otro. Esta tabla resuelve el 90% de las dudas:

| Color | HEX | Rol | Superficie | Texto | Señal |
|---|---|---|:---:|:---:|:---:|
| Technical White | `#FFFFFF` | Superficie | ✅ | ✅ sobre oscuro | ❌ |
| Graphite | `#111317` | Superficie | ✅ | ✅ sobre claro | ❌ |
| Mist | `#E5E7EB` | Apoyo | ✅ secundaria | ❌ | ❌ |
| Alloy | `#6B6F76` | Apoyo | ❌ | ✅ secundario | ❌ |
| SEBS Signal | `#E30613` | Señal | ❌ **nunca** | ⚠️ limitado | ✅ |

Variantes de ajuste (no son colores nuevos, son el mismo color corregido por contraste):

| Token | HEX | Para qué |
|---|---|---|
| `--alloy-light` | `#8E939B` | Texto secundario sobre superficie `dark`. Alloy normal falla WCAG ahí. |
| `--sebs-signal-hover` | `#B80510` | Hover/pressed del botón primario. |
| `--sebs-signal-light` | `#FF3B47` | Rojo como **texto** sobre superficie `dark`. |

**Blanco y Grafito son un par de superficies, no un par fondo/texto.** Los dos tienen el mismo rango. Una página SEBS bien hecha usa ambos como fondo.

---

## 2. Superficies

Toda sección, panel o card declara una superficie. No hay zonas sin superficie declarada.

| Superficie | Fondo | Texto | Texto 2º | Divisor | Logo |
|---|---|---|---|---|---|
| `light` | `#FFFFFF` | `#111317` | `#6B6F76` | `#E5E7EB` | Graphite |
| `mist` | `#E5E7EB` | `#111317` | `#6B6F76`* | `#FFFFFF` | Graphite |
| `dark` | `#111317` | `#FFFFFF` | `#8E939B` | `#2A2D33` | Blanco |

\* Alloy sobre Mist da 4.08:1 — solo válido para texto grande (≥18.66px bold o ≥24px). Para texto normal secundario sobre Mist, usar Graphite a opacidad reducida o subir el peso.

### Cómo se usan

- **Alternar superficies es el recurso principal de ritmo visual.** Una página gana jerarquía alternando `light` / `dark`, no añadiendo rojo.
- Una superficie `dark` **no es un modo oscuro** — es una decisión de composición dentro del mismo tema. Un hero grafito y la siguiente sección blanca es el patrón SEBS por defecto.
- Máximo **dos niveles de anidamiento**. Card `light` dentro de sección `dark` está bien; un tercer nivel no.
- Los tokens se heredan por contexto: declarar `.surface-dark` en la sección y los hijos ya reciben los valores correctos vía `var(--text)`, `var(--divider)`, etc.

```html
<section class="surface-dark">
  <h2>Research</h2>
  <p class="secondary">Hardware, software, human intent.</p>
  <article class="surface-light card">…</article>
</section>
```

---

## 3. La regla dura del rojo

> **~1–2% del área visible. Nunca superficie.**

### Permitido

- Botón primario — **uno** por vista.
- Estado activo en navegación (ítem actual, subrayado, barra lateral).
- Dot o indicador de estado.
- Borde de selección o de foco (1–3 px).
- Serie o dato destacado en gráfica.
- Métrica crítica puntual.
- Símbolo SEBS cuando el contexto lo requiera.
- Hover/underline de link en texto corrido.

### Prohibido

- Fondo de nav o header.
- Fondo de hero o sección completa.
- Fondo de card, panel, sidebar o footer.
- Banda o bloque de ancho completo.
- Fondo de tabla, fila o encabezado.
- Titular largo completo en rojo (H1/H2).
- Segundo color de superficie.
- Relleno de formas decorativas grandes.

### Excepción única

Un bloque rojo de superficie es válido **solo fuera de interfaz**: portada de presentación, sticker, serigrafía, packaging, splash screen. Nunca en web ni en UI de producto.

### Las tres pruebas

Correrlas antes de dar por terminada cualquier pantalla:

1. **Escala de grises** — desaturar la vista. Si la jerarquía se desarma, el rojo estaba haciendo el trabajo de la tipografía y el espaciado. Rehacer la jerarquía, no subir el rojo.
2. **Entrecerrado** — entrecerrar los ojos. El rojo debe aparecer como puntos aislados, no como manchas o bandas.
3. **Conteo** — máximo un botón primario rojo y un indicador de estado activo por vista.

### Por qué importa

El rojo `#E30613` es cromáticamente muy cercano al de identidades institucionales mexicanas, incluida la Universidad Iberoamericana. **La única diferencia perceptible es la proporción y la ubicación.** Un rojo en el header y en cada título lee como escudo institucional. Un rojo en un botón y un dot de estado lee como instrumento técnico. SEBS es lo segundo.

---

## 4. Tintes

Solo para comunicar **estado**, nunca decoración ni jerarquía.

| Token | Valor | Uso |
|---|---|---|
| `--sebs-signal-tint` | `rgba(227,6,19,0.12)` | Callout de error o alerta. |
| `--sebs-signal-tint-soft` | `rgba(227,6,19,0.06)` | Fila de tabla resaltada, campo con error. |

Un tinte es válido solo si cumple las tres:

1. Comunica un estado (error, alerta, selección).
2. Está **contenido en un componente delimitado** — callout, fila, campo. Nunca una sección o bloque de página.
3. Va acompañado de texto o ícono que comunica lo mismo sin color.

Un tinte que ocupe más de un componente cuenta como superficie roja y viola la regla dura.

---

## 5. Contraste WCAG (verificado)

| Texto | Sobre | Ratio | Normal | Grande |
|---|---|---:|---|---|
| Graphite | White | 18.59 | AAA | AA |
| Alloy | White | 5.05 | AA | AA |
| Signal | White | 4.88 | AA | AA |
| Graphite | Mist | 15.02 | AAA | AA |
| Alloy | Mist | 4.08 | ❌ | AA |
| Signal | Mist | 3.94 | ❌ | AA |
| White | Graphite | 18.59 | AAA | AA |
| Alloy | Graphite | 3.68 | ❌ | AA |
| Signal | Graphite | 3.81 | ❌ | AA |
| White | Signal | 4.88 | AA | AA |
| Graphite | Signal | 3.81 | ❌ | AA |
| Alloy Light `#8E939B` | Graphite | 6.02 | AA | AA |
| Signal Light `#FF3B47` | Graphite | 5.28 | AA | AA |

Reglas que se derivan:

- **Texto sobre botón primario rojo: siempre blanco.** Graphite sobre rojo falla (3.81).
- **Sobre superficie `dark`, nunca Alloy ni Signal puros para texto** — usar `--alloy-light` y `--sebs-signal-light`.
- Sobre Mist, Alloy solo para texto grande.
- "Grande" = ≥24px, o ≥18.66px en bold.

---

## 6. Acentos de proyecto

`#2563EB` Electric Blue · `#00BFA6` Cyber Teal · `#FFC107` Engine Yellow · `#7C3AED` Violet Core · `#FF6B35` Copper

Dos reglas:

1. **Heredan la regla dura.** Son señal, no superficie. Mismo presupuesto de ~1–2%, mismas prohibiciones. Un proyecto con acento Electric Blue no puede tener un hero azul.
2. **Reemplazan al rojo, no se suman.** En una vista de proyecto hay rojo **o** acento de proyecto, nunca los dos compitiendo. La firma SEBS se mantiene en Graphite o blanco.

Verificar contraste del acento elegido antes de usarlo — Engine Yellow y Cyber Teal fallan como texto sobre blanco.

Detalle en `subbrands.md`.

---

## 7. Tokens

Copiar de `../assets/tokens.css`. Nunca escribir hex crudos en el código — siempre `var(--token)`.

# Componentes

Todos los componentes leen sus colores de la superficie contenedora vía `var(--surface)`, `var(--text)`, `var(--divider)`. Nunca hardcodear color en un componente — así el mismo componente funciona en `light` y en `dark` sin duplicarse.

---

## 1. Botones

### Primario — el único rojo grande permitido

**Uno por vista.** Es el consumo de rojo más alto que autoriza el sistema. Si hay dos acciones, la segunda es secundaria.

```css
.btn-primary {
  background: var(--sebs-signal);
  color: #FFFFFF;                    /* siempre blanco — graphite falla WCAG */
  font-family: "Manrope"; font-weight: 600; font-size: 14px;
  padding: var(--space-md) var(--space-xl);
  border: none; border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-primary:hover  { background: var(--sebs-signal-hover); }
.btn-primary:active { background: var(--sebs-signal-hover); transform: translateY(1px); }
.btn-primary:focus-visible { outline: 2px solid var(--sebs-signal); outline-offset: 2px; }
.btn-primary:disabled { background: var(--mist); color: var(--alloy); cursor: not-allowed; }
```

Estado loading: spinner + texto, nunca solo spinner. El ancho no debe saltar.

### Secundario

```css
.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--divider);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-xl);
  font-weight: 600; font-size: 14px;
}
.btn-secondary:hover { border-color: var(--text-secondary); }
```

Funciona en cualquier superficie sin cambios — ese es el punto de los tokens semánticos.

### Terciario / texto

```css
.btn-text { background: none; border: none; color: var(--text); font-weight: 600; }
.btn-text:hover { color: var(--sebs-signal); }   /* aquí sí: hover puntual */
```

---

## 2. Cards

Claras, modulares, jerarquía tipográfica fuerte, bordes suaves, sin sombras exageradas.

```css
.card {
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  display: flex; flex-direction: column; gap: var(--space-md);
}
.card:hover { border-color: var(--text-secondary); }
.card--selected { border-color: var(--sebs-signal); border-width: 2px; }
```

Estructura canónica:

```html
<article class="card">
  <p class="label">Robotics · XR</p>       <!-- categoría, Alloy -->
  <h3>Remote Hands</h3>                     <!-- título -->
  <p class="small">Teleoperación háptica…</p>
  <div class="card-media">…</div>
  <a class="btn-text">View case study →</a>
</article>
```

**Nunca card con fondo rojo.** Para destacar una card: borde rojo de 2px, o cambiar su superficie a `dark`.

---

## 3. Tags y chips

Radio `xs`/`sm`. Nunca color como única señal — siempre texto legible.

```css
.tag {
  display: inline-flex; align-items: center; gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px; font-weight: 500;
  background: var(--surface-secondary);
  color: var(--text);
  border: 1px solid var(--divider);
}
```

Categorías: Default · Info · Success · Warning · Error · Neutral. Diferenciar con texto e ícono; el color acompaña, no sustituye.

---

## 4. Badges de estado

Ejemplos: Nuevo · En proceso · En revisión · Completado · Cancelado.

Patrón: **dot + etiqueta textual**. El dot es uno de los usos autorizados del rojo.

```html
<span class="badge"><i class="dot dot--active"></i>ACTIVE</span>
```

```css
.badge { display: inline-flex; align-items: center; gap: var(--space-sm);
         font-family: "IBM Plex Mono"; font-size: 12px; color: var(--text-secondary); }
.dot { width: 6px; height: 6px; border-radius: var(--radius-round); flex: none; }
.dot--active  { background: #16A34A; }
.dot--alert   { background: var(--sebs-signal); }
.dot--idle    { background: var(--alloy); }
```

El texto del estado en IBM Plex Mono — es un dato, no una palabra.

---

## 5. Tablas

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  font-family: "Manrope"; font-weight: 500; font-size: 12px;
  letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--text-secondary); text-align: left;
  padding: var(--space-md); border-bottom: 1px solid var(--divider);
}
.table td {
  padding: var(--space-md); border-bottom: 1px solid var(--divider);
  font-size: 14px; color: var(--text);
}
.table td.tech { font-family: "IBM Plex Mono"; font-size: 12px; }
.table tr:hover { background: var(--surface-secondary); }
.table tr.is-error { background: var(--sebs-signal-tint-soft); }  /* estado, no decoración */
```

- Encabezados nunca con fondo rojo.
- Datos técnicos (IPs, IDs, uptime, revisiones) en mono.
- Estados con badge + texto.
- Divisores ligeros — nada de bordes negros pesados en superficie clara.

---

## 6. Formularios

```css
.input {
  width: 100%;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--divider);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  font-family: "Manrope"; font-size: 14px;
}
.input:focus {
  outline: none;
  border-color: var(--sebs-signal);
  box-shadow: 0 0 0 3px var(--sebs-signal-tint);   /* foco: uso autorizado */
}
.input:disabled { background: var(--surface-secondary); color: var(--text-secondary); }
.input[aria-invalid="true"] { border-color: var(--sebs-signal); }
```

Reglas:

- Label siempre visible — no usar placeholder como label.
- Error = borde rojo **+ mensaje descriptivo** debajo. Nunca solo el borde.
- El mensaje de error dice qué hacer, no solo qué falló.
- Texto de ayuda en Alloy, 14px.

---

## 7. Navegación

**Nunca fondo rojo.** La nav es `light` o `dark` — nada más.

```css
.nav { background: var(--surface); border-bottom: 1px solid var(--divider);
       display: flex; align-items: center; gap: var(--space-xl);
       padding: var(--space-lg) var(--space-xl); }
.nav a { color: var(--text-secondary); font-weight: 500; font-size: 14px;
         text-decoration: none; padding: var(--space-sm) 0; }
.nav a:hover { color: var(--text); }
.nav a[aria-current="page"] {
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--sebs-signal);   /* estado activo: uso autorizado */
}
```

Presupuesto de rojo en la nav: **el subrayado del ítem activo, y nada más**. El CTA del header puede ser el botón primario de la vista — pero entonces ya no puede haber otro botón primario en la página.

---

## 8. Checklist de componente

Antes de dar uno por terminado:

- [ ] Lee color de la superficie (`var(--surface)`, `var(--text)`), no hex crudos.
- [ ] Funciona en `light` y en `dark` sin duplicar CSS.
- [ ] Spacing y radios en tokens.
- [ ] Ningún estado depende solo del color.
- [ ] Foco visible con teclado.
- [ ] Contraste verificado contra la tabla de `color.md`.
- [ ] Rojo solo en los usos autorizados.

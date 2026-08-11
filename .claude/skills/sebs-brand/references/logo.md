# Uso del logotipo

---

## 1. Assets disponibles

En `assets/img/` del portafolio:

| Archivo | Qué es | Cuándo |
|---|---|---|
| `Horizontal.png` | `[símbolo] [SEBS]`, negro, lienzo 700×700 | Master. **No usarlo directo en UI** — el lockup ocupa solo la banda central del cuadrado. |
| `logo-horizontal-invertido.png` | lockup blanco, recortado 625×177 | **Nav y UI sobre superficie `dark`.** Listo para usar. |
| `logo-horizontal-graphite.png` | lockup `#111317`, recortado 625×177 | Nav y UI sobre superficie `light` o `mist`. |
| `Vertical.png` | símbolo sobre wordmark | Portadas, splash screens, presentaciones, packaging, composiciones centradas. |
| `Simbolo.png` | solo monograma, negro | PCB, grabado, serigrafía, sellos, avatar, producto físico. |
| `Simbolo invertido.png` | solo monograma, blanco | Sobre superficie `dark` o sobre rojo. Sobre fondo blanco parece vacío — es correcto, es transparente. |
| `Web_icon.png` | icono de app: tesela blanca redondeada, marca negra, 700×700 | Master del favicon. No es el símbolo suelto. |
| `favicon-32.png` | derivado de `Web_icon.png` | Favicon. Marca oscura sobre claro: al reducir, conserva el borde mucho mejor que blanco-sobre-grafito, que florea. |
| `favicon-48.png` / `apple-touch-icon.png` | símbolo blanco sobre grafito | ⚠️ Todavía del master anterior — no coinciden con `favicon-32.png`. |

> **Pendientes:** no existen masters SVG (§30.4), y los PNG son negro puro `#000000` en vez de Graphite `#111317` — corregir al vectorizar. Para serigrafía y PCB, señalarlo: los PNG no sirven.

---

## 2. Elegir variante por superficie

| Superficie | Variante |
|---|---|
| `light` (`#FFFFFF`) | Horizontal/Símbolo en Graphite |
| `mist` (`#E5E7EB`) | Horizontal/Símbolo en Graphite |
| `dark` (`#111317`) | Versión blanca (`Simbolo invertido`) |
| Sobre SEBS Signal | Versión blanca |
| Foto o render | Blanca, sobre zona de suficiente contraste; nunca sobre detalle visual |

Regla general: el logo es **monocromático**. Una sola tinta, siempre.

---

## 3. El símbolo

Monograma geométrico circular: cada sección representa una letra de SEBS, construida con líneas y arcos concéntricos.

Lecturas abstractas válidas: sistema, capas, integración, módulos, trayectorias, conexión, núcleo, movimiento, arquitectura.

**No es** un engrane, un circuito, un robot ni una mira. Si un diseño lo hace leer como cualquiera de esos — por contexto, por composición o por acompañarlo de gráficos técnicos literales — está mal usado. Su fuerza está en ser abstracto y apropiable.

---

## 4. Proporción

**Altura visual del símbolo = 1.88 × altura visual del wordmark.**

Medido sobre el master vigente: lockup `625 × 177` (3.53:1) — símbolo `177 × 177`, corredor `32`, wordmark `416 × 94`.

Constante en todas las composiciones. Al colocar el logo horizontal, escalar el asset completo — nunca recomponer símbolo y wordmark por separado.

> El master de v1.0 daba 1.61 (`560 × 191`). El cambio vino de una revisión del archivo maestro, no del sistema.

---

## 5. Prohibido

- Degradados dentro del logo.
- Colores distintos por cuadrante.
- Sombras, contornos, efectos 3D.
- Transparencias decorativas.
- Distorsión vertical u horizontal (siempre escalar proporcional).
- Rotación arbitraria.
- Alterar la relación símbolo–wordmark.
- Reescribir el wordmark en Manrope o cualquier fuente.
- Colocarlo sobre imagen con detalle que compita.
- Encerrarlo en una caja que no forma parte del asset.

---

## 6. Área de seguridad

Ningún texto, borde, imagen ni elemento interactivo debe competir visualmente con el logo.

> **Pendiente de cierre técnico:** unidad exacta de clear space (punto 1 de la sección 30).
>
> Mientras tanto, usar como mínimo provisional: **el radio del círculo interior del símbolo** en los cuatro lados. Al aplicarlo, señalar que es provisional.

---

## 7. Tamaño mínimo

**32 px.** Verificado por render directo del master.

| Tamaño | |
|---|---|
| 16 px | ❌ Canales desaparecidos, se lee como anillo moteado |
| 24 px | ⚠️ Legible pero los canales ya se cierran |
| 32 px | ✅ **Mínimo recomendado** |
| 48 px | ✅ Limpio |

En el lockup horizontal el símbolo fija la altura, así que el mínimo del lockup completo también es 32 px de alto.

Falta validar en físico (5/7/10 mm): el sangrado de tinta cierra canales antes que el píxel.

El micro-logo para 16–24 px sigue pendiente y **requiere redibujar el símbolo con canales engrosados — no es un reescalado**. No inventarlo; señalarlo.

---

## 8. Firma en hardware

En PCB y producto físico SEBS es **firma discreta**, no elemento dominante:

```
SEBS · CTRL-01
REV A
```

Aplicaciones: serigrafía, esquina de PCB, reverso, placa de identificación, carcasa, etiqueta técnica. Texto acompañante en IBM Plex Mono.

La marca no debe dominar visualmente el producto. El protagonista es el objeto.

---

## 9. Arquitectura de nombres

SEBS es la marca principal; el proyecto no la necesita en cada aplicación.

```
Torke — by SEBS
Remote Hands — An SEBS project
```

Jerarquía: **Marca** (SEBS) → **Proyecto** (Torke, Capa 8, Remote Hands) → **Producto/módulo/versión** (Controller v2, Driver Board, Rev A, Firmware 2.1, Module 03).

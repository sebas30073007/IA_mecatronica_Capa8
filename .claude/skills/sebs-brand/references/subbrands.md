# Sub-marcas y proyectos

> La meta no es que todos los proyectos se vean iguales. La meta es que, aunque sean diferentes, se reconozca que **fueron concebidos dentro del mismo sistema.**

---

## 1. La regla 70/30

**70% SEBS · 30% identidad del proyecto.**

| Se hereda — no se toca | Puede variar |
|---|---|
| Manrope + IBM Plex Mono | Color de acento |
| Grid y contenedores | Símbolo del proyecto |
| Escala de espaciado | Hero |
| Radios y bordes | Patrón gráfico |
| Neutros y superficies | Motion |
| Lógica de componentes | Fotografía y renders |
| Lenguaje técnico | Narrativa visual |
| Firma SEBS | Nombre |

Si un proyecto quiere cambiar tipografía, grid o espaciado, ya no es una sub-marca de SEBS — es otra marca. Decirlo explícitamente en vez de romper el sistema.

---

## 2. Color de acento

Paleta autorizada:

| Acento | HEX |
|---|---|
| Electric Blue | `#2563EB` |
| Cyber Teal | `#00BFA6` |
| Engine Yellow | `#FFC107` |
| Violet Core | `#7C3AED` |
| Copper | `#FF6B35` |

Tres reglas:

1. **El acento hereda la regla dura del rojo.** Es señal, no superficie: ~1–2% del área, nunca fondo de nav, hero, card o sección. Un proyecto con Electric Blue no tiene un hero azul.
2. **El acento reemplaza al rojo, no se suma.** Dentro de una vista de proyecto hay rojo **o** acento — nunca los dos compitiendo. La firma SEBS se mantiene en Graphite o blanco.
3. **Un acento por proyecto.** No paletas de proyecto.

Verificar contraste antes de usar: Engine Yellow y Cyber Teal fallan como texto sobre blanco — sirven como fondo con texto Graphite, o como indicador, no como texto.

Implementación: redefinir el token de señal en el scope del proyecto y todo lo demás funciona igual.

```css
.project-torke { --sebs-signal: #2563EB; --sebs-signal-hover: #1D4ED8; }
```

---

## 3. Niveles de identidad

```
Nivel 1 — Marca       SEBS
Nivel 2 — Proyecto    Torke · Capa 8 · Remote Hands · GearLab
Nivel 3 — Producto    Controller v2 · Driver Board · Rev A · Firmware 2.1
```

Nomenclatura: `Torke — by SEBS`, `Remote Hands — An SEBS project`.

---

## 4. Al dar identidad a un proyecto nuevo

1. Elegir **un** acento de la paleta autorizada, verificando contraste.
2. Definir si el proyecto tiene símbolo propio. No es obligatorio — muchos funcionan solo con nombre en Manrope y la firma SEBS.
3. Decidir el patrón de superficies: qué secciones son `light` y cuáles `dark`. Aquí es donde el proyecto gana personalidad sin romper nada.
4. Elegir el tratamiento de hero y fotografía.
5. Definir motion, si aplica.
6. **No tocar** tipografía, grid, espaciado, radios ni lógica de componentes.

Verificación: poner la página del proyecto junto a la de SEBS. Deben verse distintas pero obviamente emparentadas. Si se ven idénticas, faltó personalidad. Si no se reconoce el parentesco, se rompió el 70%.

---

## 5. Proyectos actuales

`projects/`: capa-8 · gear-lab · remote-hands
`competitions/`: 2° Concurso Colombiano de Cohetería Deportiva · Reto del Fuego · The James Dyson Award
`pcbs/`: Drivers-controller · PuenteH · Servo-controller
`papers/`: Balancing Accuracy and Adaptability — Hybrid Analytical Neural Control in Omnidirectional Robots

Ninguno tiene acento asignado formalmente todavía. Al trabajar en uno, proponer el acento y registrarlo aquí.

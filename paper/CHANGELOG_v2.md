# CHANGELOG V1 → V2 — TALE 2026 "Validate Before You Apply"

V2 = `tale2026_short_v2.tex` (V1 intacto en `tale2026_short.tex`).
Decisión editorial de la revisión simulada: **Minor Revision**. Estado: aplicado.

## Must-Fix (Prioridad 1)

- **R1 (M1 / EIC-W1) — separar diseño vs. empírico.** Reescritos abstract, §IV-B
  y §VI: la interceptación se declara explícitamente *guaranteed by construction*
  y el aporte empírico se reencuadra como "con qué frecuencia y en qué clases los
  LLMs emiten acciones inválidas/espurias que la capa debe absorber" (10–12/modelo,
  incl. 70B). Elimina la tautología.
- **R2 (DA-M2) — acciones espurias como modo de fallo NO cubierto.** Nuevo bloque
  en §IV-B: el 37.5 % de prompts conceptuales del 4B produce acciones
  estructuralmente válidas pero espurias que el validador NO atrapa; solo el
  preview/undo humano las cubre → los dos salvaguardas son complementarios.
  Reforzado en §V con *automation complacency* (también cubre R3-W2 menor).
- **R3 (R1-W1) — varianza / k≥5.** Arnés `bench/reliability_bench.mjs` ampliado con
  `--repeat k`: corre cada prompt k veces, agrega **media ± DE muestral** en
  `summary-stats.json`. Tablas reformateadas a `mean ± SD`. **Pendiente:** correr
  k=5 y rellenar macros (ver `RUN_PLAN_v2.md`); ahora muestran `±0.0` placeholder.
- **R4 (R1-W3) — terminología.** §IV-A "Formal Verification of the Pipeline" →
  **"Unit-Test Coverage of the Deterministic Pipeline"**; añadida frase "these are
  unit tests, not formal proofs". También en §I: "formal unit verification" →
  "unit-test coverage".
- **R5 (R1-W2) — confound modelo×despliegue.** §V declara explícitamente el confound
  (Gemma vs. Llama; 4B/12B vs. 70B; local vs. nube) y reencuadra los 3 escenarios
  como "deployment options", no comparación de capacidad controlada. También en la
  nota al pie de la Tabla I.

## Should-Fix (Prioridad 2)

- **S1 (R2-W1) — referencias + matizar novedad.** Añadidas 3 refs reales verificadas:
  ReAct (Yao et al., ICLR 2023), ToolLLM (Qin et al., arXiv:2307.16789, 2023),
  Teach AI How to Code (Jin et al., CHI 2024). §II reconoce la línea de
  tool-use/agentes y reescribe el claim "to our knowledge" como instanciación en
  un tutor centrado en artefactos (no la idea abstracta).
- **S2 (R1-W5) — por qué el JSON/function-calling nativo no basta.** §II: esos modos
  restringen la *sintaxis* en tiempo de generación pero son *stateless* respecto al
  grafo vivo; no saben que "Router5" no existe en *este* grafo ni que una IP ya
  está en uso.
- **S3 (R2-W3, DA-M3) — suavizar transferencia + etiquetar escenario.** §V:
  "transfers directly" → "we *conjecture* —without yet testing it—". El walkthrough
  §IV-C se etiquetó como "constructed example" y luego se **eliminó** por presión de
  espacio (resuelve también el riesgo de leerlo como dato observado).

## Menores (Prioridad 3)

- **m1 (R1-W4) — AER no discrimina.** Columnas AER y JSON-validez (100 % en todas las
  celdas) **movidas al texto** de §IV-B; las tablas reportan solo las 3 métricas que
  varían (Spur., Valid., Interc.).
- **EIC-W2 — título.** "Learning Assistant" → **"An Action-Validation Layer for LLM
  Tutors that Act on Learner Artifacts"** (foco en el mecanismo).
- **R3-W2 — sobre-confianza.** Frase de *automation complacency* en §V.

## Recortes por presión de página (4 pp duras, IEEEtran)

Para acomodar el contenido nuevo manteniendo 4 páginas:
- **Table I (matriz Level×Focus) conservada** (en versión compacta); la prosa de §III-B
  se acortó porque la tabla vuelve a cargar el detalle por nivel/foco.
- Eliminado el **walkthrough** §IV-C (era hipotético; R2/R3 lo cuestionaban) — su
  retiro también cierra R2-W3.
- Comprimidas §III-A/B/C/D/E (descripción del sistema) y el Acknowledgment para
  compensar la tabla, sin tocar contenido exigido por revisores.
- Eliminada 1 ref redundante (Kurose, libro de texto).

## No abordado (queda como limitación declarada)

- **R1-W2 (variante fuerte) / baseline contra function-calling nativo:** no se corrió
  un baseline empírico; se argumenta conceptualmente en §II (S2). Honesto declararlo
  si el revisor insiste.
- **EIC-W1 / R3-W1 — evaluación de aprendizaje/usuario:** sigue siendo trabajo futuro
  (estudio en aula), ahora enmarcado desde el abstract ("we make no claim about
  learning outcomes").

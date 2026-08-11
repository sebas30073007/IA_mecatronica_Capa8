# Plan de corrida del benchmark k=5 — guía paso a paso

Objetivo: correr el benchmark **5 veces por prompt** en 3 modelos para obtener la
desviación estándar (DE) real, y reemplazar los `± 0.0` placeholder del paper por
los valores `media ± DE` de verdad.

> **Cómo funciona, en una frase:** dejas el servidor (`npm start`) corriendo en una
> ventana, y en OTRA ventana lanzas el benchmark, que le manda 30 preguntas al
> servidor 5 veces y guarda los resultados. Cambias de modelo editando `.env` y
> reiniciando el servidor. Lo repites 3 veces (4B, 12B, 70B).

> **Tranquilidad:** el benchmark es **reanudable**. Si se corta (cierras la ventana,
> se cae internet, etc.), vuelve a lanzar EXACTAMENTE el mismo comando y continúa
> donde se quedó. No repite lo ya hecho.

> **Tiempo aproximado:** 4B ≈ 20–40 min · 12B ≈ 30–60 min (es lento localmente) ·
> 70B ≈ 10–25 min (depende del rate limit de Groq). No tienes que mirar la pantalla;
> puedes dejarlo corriendo.

---

# PARTE 0 — Verificación previa (haz esto UNA sola vez)

Abre una ventana de **PowerShell** y ve a la carpeta del proyecto:

```powershell
cd "E:\20_UNI\Html proyects\Claude proyect Capa8\capa8_app"
```

Ahora comprueba que tienes todo. Ejecuta uno por uno:

**0.1 — Node instalado:**
```powershell
node --version
```
✅ Debe imprimir algo como `v20.x` o superior. Si dice "no se reconoce", instala Node.js.

**0.2 — Ollama instalado y con los modelos:**
```powershell
ollama list
```
✅ En la lista deben aparecer `gemma3:4b` y `gemma3:12b`. Si NO aparecen, descárgalos
(tardan, son varios GB):
```powershell
ollama pull gemma3:4b
ollama pull gemma3:12b
```
❓ Si `ollama` "no se reconoce", instala Ollama desde ollama.com y reinicia la terminal.

**0.3 — Tu Groq API key (para el modelo 70B en la nube):**
Abre el archivo `.env` (está en la raíz del proyecto, junto a `server.js`). Confirma
que tiene una línea como:
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```
✅ Si la tienes, perfecto. Si no, consíguela gratis en console.groq.com y pégala ahí.

Cuando 0.1, 0.2 y 0.3 estén ✅, pasa a la PARTE 1.

---

# PARTE 1 — Modelo local Gemma 3 **4B** (el más largo: full + 3 ablaciones)

### Paso 1.1 — Configurar `.env`
Abre `.env` y deja estas líneas EXACTAMENTE así (cambia las que existan, no dupliques):
```
LLM_PROVIDER=ollama
MODEL=gemma3:4b
OLLAMA_URL=http://127.0.0.1:11434
```
Guarda el archivo.

### Paso 1.2 — Arrancar el servidor (Ventana A)
En tu ventana de PowerShell (la de la PARTE 0), arranca el servidor:
```powershell
npm start
```
✅ Debe quedarse "colgado" mostrando algo como `Servidor en http://localhost:3000`
y NO devolverte el cursor. **Deja esta ventana abierta y corriendo.** Es la "Ventana A".

### Paso 1.3 — Comprobar que cargó el modelo correcto
Abre una **SEGUNDA** ventana de PowerShell ("Ventana B") y ve a la carpeta otra vez:
```powershell
cd "E:\20_UNI\Html proyects\Claude proyect Capa8\capa8_app"
Invoke-RestMethod http://localhost:3000/api/health
```
✅ Debe responder con `provider : ollama` y `model : gemma3:4b`.
❌ Si dice otro modelo: revisa el `.env`, vuelve a la Ventana A, pulsa `Ctrl + C` para
parar el servidor y haz `npm start` de nuevo (el servidor lee `.env` solo al arrancar).

### Paso 1.4 — Lanzar el benchmark (en la Ventana B)
Pega estas 3 líneas (las dos primeras configuran salida y pausa corta para local):
```powershell
$env:BENCH_OUT_DIR = "bench/results-4b"
$env:BENCH_PAUSE_MS = "300"
node bench/reliability_bench.mjs --repeat 5
```
✅ Verás líneas como `[r1/5 A01] intent=apply_graph ... blocks=1 ...` avanzando.
La primera línea confirma `model=gemma3:4b`. Déjalo correr.

### Paso 1.5 — Esperar el final
✅ Termina cuando aparece una tabla `===== RESUMEN (media ± DE entre reps) =====`.
Comprueba que se creó el archivo de resultados:
```powershell
Test-Path bench/results-4b/summary-stats.json
```
✅ Debe imprimir `True`. **Parte 1 lista.**

---

# PARTE 2 — Modelo local Gemma 3 **12B**

### Paso 2.1 — Cambiar el modelo en `.env`
Vuelve a la **Ventana A**, pulsa `Ctrl + C` para parar el servidor. Abre `.env` y
cambia SOLO la línea del modelo:
```
MODEL=gemma3:12b
```
(las demás líneas de la Parte 1 se quedan igual). Guarda.

### Paso 2.2 — Rearrancar el servidor (Ventana A)
```powershell
npm start
```

### Paso 2.3 — Comprobar el modelo (Ventana B)
```powershell
Invoke-RestMethod http://localhost:3000/api/health
```
✅ Debe decir `model : gemma3:12b`.

### Paso 2.4 — Lanzar el benchmark (Ventana B) — solo la condición `full`
```powershell
$env:BENCH_OUT_DIR = "bench/results-12b"
$env:BENCH_PAUSE_MS = "300"
node bench/reliability_bench.mjs --conditions full --repeat 5
```
⏳ El 12B es lento (cada respuesta puede tardar ~20 s). Es normal. Déjalo.

### Paso 2.5 — Confirmar
```powershell
Test-Path bench/results-12b/summary-stats.json
```
✅ `True`. **Parte 2 lista.**

---

# PARTE 3 — Modelo nube **Llama 3.3 70B** (Groq)

### Paso 3.1 — Cambiar a Groq en `.env`
**Ventana A:** `Ctrl + C`. Abre `.env` y deja estas líneas (tu key real en la primera):
```
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_tu_key_real_aqui
GROQ_MODEL=llama-3.3-70b-versatile
```
Guarda.

### Paso 3.2 — Rearrancar el servidor (Ventana A)
```powershell
npm start
```

### Paso 3.3 — Comprobar (Ventana B)
```powershell
Invoke-RestMethod http://localhost:3000/api/health
```
✅ Debe decir `provider : groq` y `model : llama-3.3-70b-versatile`.

### Paso 3.4 — Lanzar el benchmark (Ventana B) — solo `full`, con pausa larga
```powershell
$env:BENCH_OUT_DIR = "bench/results-70b"
$env:BENCH_PAUSE_MS = "2500"
node bench/reliability_bench.mjs --conditions full --repeat 5
```
ℹ️ Si Groq te limita (rate limit), el script espera y reintenta solo; verás mensajes
`rate-limited, esperando...`. No hagas nada, deja que continúe.

### Paso 3.5 — Confirmar
```powershell
Test-Path bench/results-70b/summary-stats.json
```
✅ `True`. **Parte 3 lista.**

---

# PARTE 4 — Avisarme (tu último paso)

Cuando existan estos 3 archivos:
- `bench/results-4b/summary-stats.json`
- `bench/results-12b/summary-stats.json`
- `bench/results-70b/summary-stats.json`

Vuelve a este chat y escríbeme literalmente:

> **«Ya corrí las 3 partes»**

Yo me encargo del resto: **leo esos 3 archivos**, sustituyo los `± 0.0` del paper por
los `media ± DE` reales, ajusto las dos frases que citan números ("ten to twelve",
"37.5%") si cambian, y recompilo confirmando que sigue en 4 páginas. Tú no tienes que
copiar ni pegar nada de los JSON.

> (Opcional: si quieres apurar, puedes pegarme el contenido de los 3 `summary-stats.json`,
> pero no hace falta — puedo abrirlos yo.)

---

# Apéndice — Si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| `Servidor no disponible en http://localhost:3000` | La Ventana A no está corriendo `npm start`, o se cayó. Reiníciala. |
| `Error: listen EADDRINUSE ... port 3000` al hacer `npm start` | Ya hay un servidor viejo ocupando el puerto. Mátalo: `Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` y vuelve a `npm start`. (O comprueba `/api/health`: si ya es el modelo correcto, úsalo tal cual.) |
| El health muestra un modelo equivocado | Editaste `.env` pero no reiniciaste el servidor. En Ventana A: `Ctrl + C` y `npm start`. |
| `ollama` u `node` "no se reconoce" | No están instalados o la terminal es vieja; instala y abre una PowerShell nueva. |
| El benchmark se cortó a la mitad | Relanza EXACTAMENTE el mismo comando `node bench/...` de esa parte; retoma solo. |
| Quiero empezar una parte de cero | Borra su carpeta de salida, p.ej. `Remove-Item -Recurse bench/results-4b`, y relanza. |
| Cada respuesta del 12B tarda muchísimo | Es normal en CPU; puedes bajar a `--conditions full` (ya está) y dejarlo de fondo. |
| `$env:BENCH_OUT_DIR` no tuvo efecto | Lo pusiste en una ventana distinta a la del `node`. Deben ir juntos en la Ventana B. |

**Regla de oro:** Ventana A = servidor corriendo (no la toques mientras corre el bench).
Ventana B = donde lanzas el `node bench/...` y donde fijas `$env:...`.

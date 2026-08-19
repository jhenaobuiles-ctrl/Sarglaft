# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Panel SARLAFT para una escuela de conducción colombiana: consulta contrapartes
contra listas restrictivas y deja constancia auditable de cada consulta.

**Todo el proyecto está en español**: identificadores, comentarios, mensajes de
commit e interfaz. Mantén esa convención.

## Comandos

```bash
node --test                                  # todas las pruebas (48)
node --test scripts/test/scoring.test.mjs    # un solo archivo
node --test --test-name-pattern="tildes"     # filtrar por nombre de prueba

npm run listas          # descarga y normaliza las listas (necesita salida a internet)
node scripts/construir-listas.mjs --forzar   # ignora el guardrail de encogimiento

python3 -m http.server 8000    # ver el panel en http://localhost:8000
```

`node --test scripts/test/` **falla** (Node interpreta el directorio como
módulo). Ejecuta `node --test` desde la raíz.

Las pruebas de fecha son sensibles a la zona horaria; verifica con
`TZ=UTC node --test` y `TZ=America/Bogota node --test` si tocas `fechaISO` o
`fechaCorta`.

## Arquitectura

Dos mitades que no comparten proceso, unidas por un contrato de datos:

```
scripts/  (Node, corre en GitHub Actions)  →  data/listas/*.json + manifest.json
                                                      ↓
app/      (navegador, sin build)           ←  descarga, indexa y consulta
```

**Cero dependencias en ambos lados**, sin paso de compilación y sin CDN.
Módulos ES nativos. No introduzcas paquetes sin una razón fuerte.

### El invariante que más importa

`app/motor/normalizar.js` lo usan **las dos mitades**: el script al construir el
índice de documentos y el navegador al consultar. Si las dos normalizaciones
dejan de coincidir, el sistema devuelve «sin hallazgos» falsos sin que nada
falle. Cualquier cambio ahí afecta a los datos ya publicados.

### Lado del build

`scripts/construir-listas.mjs` recorre `FUENTES` y para cada una descarga,
parsea, valida y escribe `data/listas/<id>.json` más una entrada en el
manifiesto con `sha256`, `registros`, `fechaPublicacion` y `estado`.

Un módulo de fuente (`scripts/fuentes/*.mjs`) exporta:

- `meta` — `{ id, nombre, fuente, autoridad, vinculante, formato }`
- `parsear(texto)` → `{ fechaPublicacion, registros }`
- `resolver(descargar)` → `{ url, fechaPublicacion }` — **opcional**, para
  fuentes sin URL fija (el Reino Unido cambia el identificador del adjunto en
  cada publicación; se resuelve por la API de contenidos de gov.uk)

Para añadir una fuente: crea el módulo, regístralo en `FUENTES`, añade una
fixture con la **estructura real del archivo** y prueba contra la fuente viva
(ver más abajo).

Los parsers buscan sus nodos **en profundidad** (`buscarTodos` en
`scripts/lib/xml.mjs`), no por ruta fija: cuando una fuente reorganiza su
envoltorio, una ruta rígida devolvería cero registros, o sea un «sin hallazgos»
falso.

`scripts/lib/registro.mjs` produce la forma canónica con claves cortas para
reducir el peso del archivo que descarga el navegador:

| clave | significado | clave | significado |
| --- | --- | --- | --- |
| `i` | id en la fuente | `nc` | nacionalidades |
| `t` | `P` persona · `E` entidad · `B` buque | `fn` | fechas de nacimiento |
| `n` | nombre principal | `pg` | programa de sanción |
| `a` | alias | `fl` | fecha de listado |
| `d` | documentos `{t,n,p}` | `ob` | observaciones |

`fechaISO(valor, orden)` exige que cada fuente **declare su convención**:
`12/11/1965` es diciembre en OFAC (`'MDA'`) y noviembre en OFSI (`'DMA'`).
Adivinarlo mete fechas de nacimiento erróneas en el expediente sin que nada
falle.

### Lado del navegador

`app/ui/app.js` arranca: `cargarManifiesto()` → `cargarListas()` →
`crearMotor()` → monta cada vista. El estado compartido vive en `estado` y las
vistas se refrescan vía `alCambiarRegistro` / `registroCambio()`.

- `app/datos/cargador.js` cachea cada lista con la **Cache API usando el sha256
  en la cadena de consulta**, no en un fragmento: la Cache API descarta los
  fragmentos y todas las versiones colapsarían en la misma entrada.
- `app/motor/indice.js` construye un índice invertido por token en memoria
  (~750 ms sobre 33 000 registros); sin él cada consulta compararía contra todo.
- `app/motor/scoring.js` puntúa con **F1 simétrico de cobertura de tokens**, no
  cobertura simple: sin la simetría, «Juan Restrepo» daría coincidencia
  perfecta contra «Juan Carlos Restrepo Ospina Mejía».
- `app/registro/db.js` — IndexedDB con los almacenes `consultas`, `evidencias`,
  `cruces`, `obligaciones`, `config`.

El cruce masivo (`app/ui/cruce.js`) corre en el hilo principal cediendo cada 200
filas. **No lo muevas a un Web Worker**: el motor resuelve mil consultas en
~40 ms y clonar decenas de MB a otro hilo costaría más de lo que ahorra.

## Reglas que no se pueden romper

**Ningún dato personal en el repositorio.** Es público. Nombres, documentos,
resultados y evidencias viven solo en el IndexedDB del navegador (Ley 1581 de
2012). Al repositorio suben únicamente código y listas de sanciones, que ya son
información pública oficial.

**Nunca publicar una lista encogida.** El guardrail (`CAIDA_MAXIMA = 0.6`)
rechaza una lista que pierda más del 40% de sus registros y conserva la versión
anterior. Una lista truncada produce «sin hallazgos» falsos, el peor resultado
posible aquí. Para una reducción legítima y verificada, `--forzar`.

**Aislamiento por fuente.** Si una lista falla, las demás se actualizan igual;
la afectada conserva su última versión buena marcada como `obsoleto`. No
conviertas un fallo puntual en un fallo total.

**El certificado no puede afirmar lo que no hizo.** `app/ui/certificado.js`
adapta título, explicación del veredicto y alcance a lo realmente verificado, y
declara de forma explícita qué **no** cubre. Una constancia de antecedentes no
cruzó listas y no debe decir que sí.

**Nada de scraping de las entidades colombianas.** Procuraduría, Contraloría,
Policía y Rama Judicial usan CAPTCHA y sus términos prohíben el acceso
automatizado. Se resuelven con enlace guiado y evidencia manual archivada
(`app/ui/antecedentes.js`).

## Probar los parsers

Las fixtures de `scripts/test/fixtures/` reproducen la **estructura real** de
cada archivo publicado, no una inventada. Esa distinción ya evitó un fallo:
suponer los nombres de columna del CSV británico rompía la agrupación y la
extracción de documentos.

Las fixtures prueban que sabemos leer el formato; **no** prueban que la fuente
siga publicando igual. Lo único que valida eso es la descarga real, y el
sandbox de desarrollo suele tener bloqueado el egreso a esos dominios. Por eso
`actualizar-listas.yml` se dispara con cada cambio en `scripts/**`: se depura
leyendo los logs de la corrida.

Para el panel hay pruebas de extremo a extremo con Playwright sobre el Chromium
preinstalado (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`) contra los
datos reales ya publicados. Es lo que ha destapado los fallos que las pruebas
unitarias no ven: fechas corridas un día, contadores muertos, evidencia que no
se podía recuperar.

## Despliegue

Tres workflows encadenados:

| Workflow | Se dispara con |
| --- | --- |
| `verificar.yml` | cualquier push y PR — ejecuta las pruebas |
| `actualizar-listas.yml` | cron diario 06:00 Bogotá, cambios en `scripts/**`, manual |
| `publicar-pages.yml` | push a la rama por defecto, y `workflow_run` al terminar la actualización de listas |

El `workflow_run` no es decorativo: los commits que empuja el bot con
`GITHUB_TOKEN` **no** disparan eventos `push`, así que sin él la actualización
diaria de listas nunca se republicaría en el sitio.

`publicar-pages.yml` tiene el nombre de la rama por defecto escrito en su
disparador `push`; si la rama se renombra, hay que actualizarlo.

El sitio se sirve bajo una subruta (`/Sarglaft/`), por lo que todas las rutas
son relativas a `import.meta.url`. Abrir `index.html` con doble clic (`file://`)
**no funciona**: el navegador bloquea los módulos ES y `fetch`. El modo sin
conexión lo da el service worker sobre la dirección web.

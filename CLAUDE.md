# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Constructor de las listas restrictivas que consulta el sistema de gestión de
recursos humanos de la empresa. **El panel SARLAFT que vivía aquí se retiró**:
se integró en ese sistema, que es donde ahora se consulta, se decide sobre cada
coincidencia y se guarda el expediente. Lo que queda aquí es la mitad que tiene
sentido pública —los datos— y lo que hace falta para construirla.

**Todo el proyecto está en español**: identificadores, comentarios, mensajes de
commit e interfaz. Mantén esa convención.

## Comandos

```bash
node --test                                  # todas las pruebas
node --test scripts/test/scoring.test.mjs    # un solo archivo
node --test --test-name-pattern="tildes"     # filtrar por nombre de prueba

npm run listas          # descarga y normaliza (necesita salida a internet)
node scripts/construir-listas.mjs --forzar   # ignora el guardrail de encogimiento
node scripts/evaluar-motor.mjs               # mide el motor contra las listas reales
```

`node --test scripts/test/` **falla** (Node interpreta el directorio como
módulo). Ejecuta `node --test` desde la raíz.

Las pruebas de fecha son sensibles a la zona horaria; verifica con
`TZ=UTC node --test` y `TZ=America/Bogota node --test` si tocas la frescura.

## Arquitectura

```
scripts/  (Node, corre en GitHub Actions)  →  data/listas/*.json + manifest.json
                                                      ↓
                                        GitHub Pages  →  el sistema de gestión
```

**Cero dependencias**, sin paso de compilación y sin CDN. Módulos ES nativos.

`app/` no es una aplicación: es lo que el constructor necesita compartir.

- `app/motor/normalizar.js` — la normalización con la que se indexa.
- `app/motor/{indice,scoring,consulta}.js` — los usa `evaluar-motor.mjs`, que es
  de donde salieron los umbrales que hoy aplica el sistema de gestión. Sin él no
  se puede volver a medir un cambio del motor.
- `app/lib/csv.js` — lo necesita la fuente del Reino Unido.
- `app/datos/frescura.js` — el mismo criterio que reporta el log del build.

### El invariante que más importa

`app/motor/normalizar.js` decide cómo queda indexado cada nombre y cada
documento. **Quien consulta tiene su propia copia portada**, en el sistema de
gestión. Si las dos dejan de coincidir, el cruce devuelve «sin hallazgos» sobre
alguien que sí está designado y **no falla nada**.

Por eso el manifiesto publica un contrato: `scripts/contrato-normalizacion.mjs`
declara un puñado de casos —la Ñ, los ceros a la izquierda, la forma
societaria, el dígito del NIT— y el constructor escribe en `manifest.json` el
resultado que esta normalización les da. Quien consulta compara con el suyo.

**Al tocar la normalización hay que revisar esos casos**, y subir `version` si
se añaden o se quitan. Y recordar que lo publicado hoy se indexó con la versión
de ayer: el desfase de un día existe siempre, y el contrato es lo que lo hace
visible.

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
fixture con la **estructura real del archivo** y prueba contra la fuente viva.

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

**El tipo de documento no puede quedar en blanco.** `variantesDocumento` solo
busca un NIT sin su dígito de verificación cuando el tipo declarado es NIT.

`fechaISO(valor, orden)` exige que cada fuente **declare su convención**:
`12/11/1965` es diciembre en OFAC (`'MDA'`) y noviembre en OFSI (`'DMA'`).
Adivinarlo mete fechas de nacimiento erróneas sin que nada falle.

### Las tres reglas de la actualización

- **Aislamiento por fuente.** Si una lista cambia de formato, las demás se
  actualizan igual y la afectada conserva su última versión buena.
- **Avisar cuando una lista deja de publicar.** Una que se descarga bien pero
  lleva meses congelada no falla por ningún lado. El aviso advierte, no descarta.
- **Nunca publicar una lista encogida.** Por debajo del 60 % de los registros
  anteriores se asume descarga incompleta. Una lista truncada produce un «sin
  hallazgos» falso, que es el peor resultado posible aquí.

## Reglas que no se pueden romper

**Ningún dato personal en el repositorio.** Es público. Lo consultado, los
resultados y las evidencias viven en el sistema de gestión, con control de
acceso por fila. Aquí solo sube código y listas de sanciones, que ya son
información pública oficial.

**Pages tiene que seguir sirviendo `data/listas/`.** De ahí las descarga el
sistema de gestión. Cualquier cambio que rompa esa publicación deja al sistema
consultando contra la última copia que tenga en caché, sin decírselo a nadie.

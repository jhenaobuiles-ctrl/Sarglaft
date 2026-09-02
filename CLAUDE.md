# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Panel SARLAFT para una escuela de conducción colombiana: consulta contrapartes
contra listas restrictivas y deja constancia auditable de cada consulta.

**Todo el proyecto está en español**: identificadores, comentarios, mensajes de
commit e interfaz. Mantén esa convención.

## Comandos

```bash
node --test                                  # todas las pruebas (148)
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

**El tipo de documento no puede quedar en blanco.** `variantesDocumento` solo
busca un NIT sin su dígito de verificación cuando el tipo declarado es NIT, de
modo que consultar «900.228.328-7» con el tipo sin declarar devuelve un «sin
hallazgos» falso sobre una empresa designada. Por eso el selector nace en
cédula y no en vacío, y `pareceNitConVerificacion` avisa cuando el número
está escrito como un NIT y el tipo dice otra cosa.

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
- Los `UMBRALES` de `app/motor/consulta.js` **no son simétricos entre alerta y
  revisión, y es a propósito**. Con menos de tres tokens alertar exige 0.98,
  pero revisar basta con 0.82: un designado del que solo se escribieron dos
  palabras puntúa alrededor de 0.80, así que el umbral normal lo devolvía como
  «sin hallazgos». Medido con `scripts/evaluar-motor.mjs` sobre los designados
  publicados de tres palabras, bajarlo llevó la recuperación del 4,7% al 57,3%
  sin mover la tasa de alerta, a cambio de unas 9 revisiones de más por cada
  300 contrapartes. Si vuelves a tocarlos, mídelo con ese script antes: el
  ruido de los nombres de cuatro palabras **no** pasa por esta regla, así que
  medir solo con esos hace parecer gratis cualquier cambio.
- `app/registro/db.js` — IndexedDB con los almacenes `consultas`, `evidencias`,
  `cruces`, `obligaciones`, `documentos` y `config`. Va por la **versión 2**:
  cada almacén nuevo se crea en su propio bloque `if (anterior < N)`, nunca
  dentro del bloque de la versión 1, o la base de quien ya usaba el panel se
  queda sin él.
- `app/lib/zip.js` — lector y escritor de ZIP a mano (deflate por
  `CompressionStream`, sin ZIP64). Existe porque la copia de seguridad tenía
  que llevar las evidencias, que son binarias y no caben en un JSON.
- `app/registro/respaldo.js` — arma y restaura esa copia. Al restaurar, el
  perfil de la empresa solo se aplica si el equipo no tiene uno propio
  (`equipoSinConfigurar`): sin eso, restaurar en una máquina recién puesta
  devolvía los documentos pero no quién los firma.

El cruce masivo (`app/ui/cruce.js`) tiene dos entradas —pegar la lista y cargar
un CSV— que confluyen en `ejecutarCruce(contrapartes)`. Lo que cambia es de
dónde salen las contrapartes, no lo que se hace con ellas: duplicar el bucle
haría que un camino guardara en el expediente algo distinto del otro.

Ese bucle **consulta el expediente antes de guardar nada**, con la misma
`planDeRegistro()` que usa el barrido periódico. La escuela pega la misma lista
de alumnos todos los meses: sin eso, cada cruce crearía otra consulta por
contraparte, la decisión de septiembre no se vería en octubre y el contador de
pendientes crecería para siempre. Se guarda fila nueva solo si la contraparte
no estaba en el expediente o si apareció algo que antes no estaba; si sigue
igual, la fila reutiliza el id de la consulta existente y el desplegable abre
la decisión ya tomada. La constancia de que se cruzaron las 300 la da la
entrada de `cruces`, no una fila por alumno y por mes.

`ultimaPorContraparte()` vive en `app/registro/contrapartes.js` y no en la
vista que la usa porque **la usan el cruce y la revisión**. Si cada una
agrupara por su cuenta, una contraparte podría contar como conocida en una
pantalla y como nueva en la otra.

`app/lib/pegado.js` interpreta lo que llega del portapapeles. Excel copia las
columnas separadas por tabulador, así que cuál es el nombre y cuál el
documento se deduce del **contenido** y no de la posición. La coma es el
último separador que se prueba: «PEREZ, JUAN» es un nombre, no dos columnas.
El tipo de documento se aplica a toda la lista pegada y solo cambia algo en
los NIT, a los que hay que buscar también sin su dígito de verificación.

Ese bucle corre en el hilo principal cediendo cada 200 filas. **No lo muevas a un Web Worker**: el motor resuelve mil consultas en
~40 ms y clonar decenas de MB a otro hilo costaría más de lo que ahorra.

`app/ui/desenlace.js` cierra las alertas. Una coincidencia exige una de cuatro
salidas —homónimo, seguimiento reforzado, no vincular, reportar a la UIAF— con
su sustento escrito, que es **obligatorio**: una decisión sin razones es el
vacío que el módulo existe para llenar. `estaCerrada()` es la única definición
de «alerta atendida» y la usan el resumen, el filtro del expediente y el
certificado; si se duplica esa regla en otro sitio, el panel y el expediente
acaban contando cosas distintas. Un formato de debida diligencia que cite la
consulta cierra la alerta igual que el desenlace.

El mismo formulario se monta en cuatro sitios —la consulta recién hecha y una
fila desplegable en el expediente, en el resultado del cruce y en el de la
revisión— mediante `alternarFila()` y `conectarDecisiones()`. Ese conector se
registra **al montar la vista y no al pintar los resultados**: pintar ocurre
una vez por cruce, y engancharlo ahí apila un manejador por cada uno hasta que
el desplegable se abre y se cierra en el mismo clic.

`app/registro/contrapartes.js` agrupa consultas, documentos y evidencias por
persona. La clave es el documento cuando lo hay y el nombre normalizado cuando
no; después une el grupo que solo tiene nombre con el del documento que lleve
ese mismo nombre, **pero solo si es uno**: dos personas pueden llamarse igual
y fundirlas diría que una sola tiene los papeles de dos. Es lo que por fin usa
los índices `documentoNormalizado` y `nombreNormalizado` de los dos almacenes.

La hoja imprimible de `app/ui/contrapartes.js` enumera además lo que **falta**
—sin consulta en listas, sin antecedentes, sin formatos, con alertas sin
decidir—. Un expediente impreso que calla sus vacíos induce a creerlo completo.

`planDeRegistro()` decide qué guarda un barrido. Vive en `desenlace.js` y no
en `revision.js` porque de esa regla depende que «una alerta abierta» siga
significando una contraparte y no un barrido: si la coincidencia sigue igual
que la última vez, la fila reutiliza la consulta ya abierta en vez de crear
una copia. Crear una copia cada mes reabriría una decisión ya tomada y dejaría
el contador de pendientes creciendo para siempre.

`app/ui/revision.js` vuelve a consultar a las contrapartes que ya están en el
expediente. Guarda **una** entrada de `cruces` con el barrido completo y filas
de `consultas` solo para las que cambiaron o no salieron limpias: una fila por
contraparte en cada barrido llenaría el expediente de «sin hallazgos»
repetidos y enterraría lo único que hay que mirar.

### Los documentos

`app/documentos/plantillas.js` declara los catorce formatos como datos
—secciones, campos, declaraciones, firmas— y `app/ui/documentos.js` los pinta
todos con el mismo formulario; `app/documentos/impreso.js` hace lo propio con
la versión imprimible. Añadir un formato es añadir un objeto, no escribir otra
pantalla. Tipos de campo: `texto`, `area`, `fecha`, `numero`, `select`,
`si_no`, `casillas` y `tabla`.

Una plantilla con `obligacion: '<id>'` marca esa obligación cumplida al
guardarse: el acta de capacitación *es* la prueba de la capacitación. El id
tiene que existir en `OBLIGACIONES_BASE` y hay una prueba que lo comprueba.

**Ninguna plantilla cita una norma de supervisión concreta.** El panel no sabe
qué superintendencia vigila a la escuela; ese texto se escribe en Ajustes
(`perfil.marcoNormativo`) y se imprime al pie. Hay una prueba que falla si
alguien mete una circular en las plantillas: una cita inventada en un formato
que va a firmar un tercero es peor que un campo vacío.

## Reglas que no se pueden romper

**Ningún dato personal en el repositorio.** Es público. Nombres, documentos,
resultados y evidencias viven solo en el IndexedDB del navegador (Ley 1581 de
2012). Al repositorio suben únicamente código y listas de sanciones, que ya son
información pública oficial.

**«Al día» mira la publicación, no la descarga.** El guardrail de encogimiento
no ve el fallo contrario: una fuente que se descarga sin problema pero deja de
publicar nuevo. El conteo no cambia, el sha256 no cambia y el estado dice
`ok`. `app/datos/frescura.js` —compartido por el build y el navegador, como el
normalizador— compara la fecha de publicación contra la **tolerancia que cada
fuente declara** en su `meta`. Un umbral único no sirve: la OFAC mueve su
lista de designados casi cada semana y la consolidada unas veces al año.
Avisar no es descartar: una lista atrasada se sigue consultando.

**Nunca publicar una lista encogida.** El guardrail (`CAIDA_MAXIMA = 0.6`)
rechaza una lista que pierda más del 40% de sus registros y conserva la versión
anterior. Una lista truncada produce «sin hallazgos» falsos, el peor resultado
posible aquí. Para una reducción legítima y verificada, `--forzar`.

**Aislamiento por fuente.** Si una lista falla, las demás se actualizan igual;
la afectada conserva su última versión buena marcada como `obsoleto`. No
conviertas un fallo puntual en un fallo total.

**No inventar la norma que obliga.** Ley 1581 de 2012, Decreto 830 de 2021 y
el reporte a la UIAF aplican con certeza y se citan. La circular de la
superintendencia que vigila a esta escuela, no: la escribe quien la conoce.

**El certificado no puede afirmar lo que no hizo.** `app/ui/certificado.js`
adapta título, explicación del veredicto y alcance a lo realmente verificado, y
declara de forma explícita qué **no** cubre. Una constancia de antecedentes no
cruzó listas y no debe decir que sí, y una alerta sin desenlace registrado se
imprime como pendiente en vez de callarlo.

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
se podía recuperar, y una restauración que devolvía los documentos pero no el
perfil de quien los firma. Cualquier cambio en el flujo de respaldo,
restauración o impresión se prueba así antes de darlo por bueno.

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

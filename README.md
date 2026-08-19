# SARLAFT — Escuela AC de Conducción SAS

Panel de cumplimiento SARLAFT con motor de consulta en listas restrictivas.
Sin dependencias, sin servidor y sin costo de operación.

## Qué resuelve

Permite consultar un nombre o un número de documento contra las listas de
sanciones oficiales, dejar constancia auditable de esa consulta, y correr el
cruce masivo mensual de todas las contrapartes. También diligencia e imprime
los formatos documentales del sistema —manual, matriz de riesgo, declaración
PEP, origen de fondos, actas— y guarda todo, evidencias incluidas, en una
copia de seguridad en ZIP.

Los servicios comerciales de *screening* cobran por la comodidad de una API,
no por el dato: las listas vinculantes son información pública y se descargan
gratis de la fuente original. Aquí se descargan una vez al día con GitHub
Actions, se normalizan a un índice consultable y el navegador hace el cruce en
local.

## Cómo está montado

```
data/listas/     Listas normalizadas + manifest.json (generado, no editar a mano)
scripts/         Descarga y normalización — corre en GitHub Actions
  fuentes/       Un parser por lista
app/motor/       Normalización, índice invertido y puntuación
app/documentos/  Catálogo de formatos y su versión imprimible
app/             Interfaz, registro de consultas y exportaciones
```

Ninguna dependencia de terceros: ni en el navegador ni en los scripts, y nada
de CDN.

**Sobre el uso sin conexión:** el panel se sirve desde una dirección web y un
service worker guarda una copia, así que después de abrirlo una vez con
conexión sigue funcionando sin ella. Lo que *no* funciona es abrir el
`index.html` con doble clic: en el protocolo `file://` el navegador bloquea
los módulos ES y `fetch`, así que no hay forma de que cargue las listas.

## Listas cubiertas

| Lista | Autoridad | Automática |
| --- | --- | --- |
| Lista Consolidada del Consejo de Seguridad | ONU | sí |
| Specially Designated Nationals (lista Clinton) | OFAC, EE. UU. | sí |
| Consolidated Sanctions List (no SDN) | OFAC, EE. UU. | sí |
| Lista Consolidada de Sanciones Financieras | Comisión Europea | sí |
| UK Sanctions List | OFSI, Reino Unido | sí |
| Procuraduría, Contraloría, Policía, Rama Judicial | Colombia | **no** |
| Firmas inhabilitadas | Banco Mundial | **no** |
| Notificaciones rojas | INTERPOL | **no** |

**La única lista estrictamente vinculante en Colombia es la de la ONU.** Las
demás se consultan como buena práctica de debida diligencia.

Los antecedentes colombianos **no se automatizan**: tienen CAPTCHA y sus
términos de uso prohíben el acceso automatizado. El panel genera el enlace a
cada consulta y archiva el PDF del resultado con sello de tiempo; el clic lo da
una persona.

Al **Banco Mundial** le pasa algo parecido por otro motivo: estaba prevista
como consulta automática, pero el endpoint que usa su propio sitio dejó de
aceptar peticiones anónimas (responde 401) y su listado no aparece en ningún
portal abierto —el dominio de datos financieros no expone ni un conjunto de
datos—. Queda como consulta manual. **INTERPOL** no permite descargar el
listado; el panel intenta su API pública desde el navegador y, si la política
de origen cruzado la bloquea, lo dice y ofrece el enlace.

## Las cuatro cosas que hace el panel

**Consultar.** Un nombre o un documento contra las listas cargadas. El
resultado se guarda con la versión exacta —fecha de publicación y `sha256`— de
cada archivo usado, y de ahí sale un certificado imprimible. Eso es lo que
pide un auditor: no que se consultara, sino contra qué se consultó.

**Revisar de nuevo.** Una consulta prueba que esa persona estaba limpia ese
día, y nada más; las designaciones se publican a diario. La *revisión
periódica* vuelve a pasar por las listas de hoy a todas las contrapartes que ya
están en el expediente —sin cargar ningún archivo— y señala cuáles empeoraron
desde la última vez. Con eso queda cubierta la obligación mensual de cruce.

**Documentar.** Catorce formatos que se diligencian, se guardan con fecha e
identificador y se imprimen: conocimiento de contraparte (natural y jurídica),
declaración PEP, origen de fondos, autorización de tratamiento de datos,
debida diligencia intensificada, análisis de operación inusual, constancias de
ROS y de ausencia de reportes, designación del oficial de cumplimiento, acta de
capacitación, informe del oficial, matriz de riesgo y manual del sistema. El
manual y la matriz vienen con contenido ajustado a una escuela de conducción,
para editar en vez de empezar en blanco. Los formatos que corresponden a una
obligación periódica la marcan cumplida al guardarse.

**Respaldar.** La copia de seguridad va en ZIP e incluye las evidencias
binarias —los PDF de la Procuraduría, las capturas—, más el expediente en CSV
legible sin el panel y un LEEME con las instrucciones de restauración. El
resumen avisa cuando la última copia pasa de un mes, y también cuando queda
una alerta sin analizar.

Sobre el **marco normativo**: el panel no supone qué superintendencia vigila a
la empresa ni cita ninguna circular por su cuenta. Ese dato se escribe en
Ajustes y se imprime al pie de cada documento. Poner una cita inventada en un
formato que va a firmar un tercero es peor que dejar el campo vacío.

## Privacidad

Este repositorio es público y **no contiene ni puede contener datos
personales**. Solo sube código y listas de sanciones, que ya son información
pública oficial.

Los nombres consultados, los documentos, los resultados y las evidencias viven
únicamente en el navegador de quien usa el panel (IndexedDB), con exportación e
importación manual. Es lo que exige la Ley 1581 de 2012.

El precio de esa decisión es que **no hay nada que respalde el expediente
salvo la copia que se exporte**. El ZIP contiene datos personales: se guarda
donde solo pueda abrirlo quien deba, nunca en un repositorio ni en una carpeta
compartida abierta.

## Operación

```bash
node --test                          # pruebas
node scripts/construir-listas.mjs    # descarga y normaliza (necesita salida a internet)
python3 -m http.server 8000          # ver el panel en http://localhost:8000
```

La actualización real corre sola todos los días a las 06:00 de Bogotá
(`.github/workflows/actualizar-listas.yml`). También se puede lanzar a mano
desde la pestaña Actions.

Dos reglas gobiernan esa actualización:

- **Aislamiento por fuente.** Si una lista cambia de formato, las demás se
  actualizan igual; la afectada conserva su última versión buena y queda
  marcada como obsoleta en el manifiesto y en el panel.
- **Nunca publicar una lista encogida.** Si una lista pierde más del 40% de sus
  registros se asume descarga incompleta y no se publica. Una lista truncada
  produciría un "sin hallazgos" falso, que es el peor resultado posible aquí.

Cuando algo falla, el trabajo abre un issue con la lista afectada y el motivo.

## Publicación

El panel se sirve desde GitHub Pages en:

**https://jhenaobuiles-ctrl.github.io/Sarglaft/**

Activar Pages es un paso manual que solo se hace una vez y que requiere
permisos de administrador del repositorio. Ni el `GITHUB_TOKEN` de Actions
puede crear el sitio (`Resource not accessible by integration`), ni se puede
hacer desde una sesión de Claude Code, cuyo proxy veta la ruta `/pages` de la
API.

1. Abrir <https://github.com/jhenaobuiles-ctrl/Sarglaft/settings/pages>
2. En **Source**, elegir **GitHub Actions**.

Con eso, `.github/workflows/publicar-pages.yml` publica el panel en cada
cambio de código y cada vez que se actualizan las listas. Si en su lugar se
elige *Deploy from a branch*, Pages también funciona —hay un `.nojekyll` en la
raíz para ello— y el flujo se aparta solo sin marcar error.

## Límites

- Esto documenta y sistematiza la debida diligencia; **no sustituye el criterio
  del oficial de cumplimiento**. Ante una coincidencia, la decisión y su
  sustento son de la persona responsable.
- Ante duda, prima la consulta en el sitio oficial de la lista. Lo que hay aquí
  es una copia fechada, no la fuente de verdad.
- Las listas se actualizan una vez al día. Si se necesita certeza al minuto
  para una operación crítica, hay que ir a la fuente.
- El puntaje de nombres compara conjuntos de palabras: reconoce el cambio de
  orden entre nombres y apellidos, pero por lo mismo no distingue "María de
  los Ángeles Cruz" de "María de la Cruz Ángeles". En cruce de listas eso se
  prefiere así —mejor una revisión de más que un hallazgo perdido—, pero
  conviene saberlo al leer la banda de revisión.

# Listas restrictivas — constructor y publicación

Descarga cada día las listas de sanciones oficiales, las normaliza a un índice
consultable y las publica con su huella. Sin dependencias, sin servidor y sin
costo de operación.

**El panel SARLAFT ya no vive aquí.** Se integró en el sistema de gestión de
recursos humanos de la empresa, que es donde ahora se consulta, se decide sobre
cada coincidencia y se guarda el expediente. Este repositorio conserva la mitad
que tiene sentido pública: los datos.

Los servicios comerciales de *screening* cobran por la comodidad de una API, no
por el dato: las listas vinculantes son información pública y se descargan
gratis de la fuente original.

## Qué hay aquí

```
data/listas/     Listas normalizadas + manifest.json (generado, no editar a mano)
scripts/         Descarga y normalización — corre en GitHub Actions
  fuentes/       Un parser por lista
app/motor/       Normalización, índice invertido y puntuación
app/lib/csv.js   Lectura de CSV, que necesita la fuente del Reino Unido
app/datos/       El criterio de frescura, compartido con el log del build
```

`app/motor/` se queda porque el constructor lo usa: la fuente del Reino Unido
normaliza al parsear, y `scripts/evaluar-motor.mjs` mide el motor contra las
listas reales, que es de donde salieron los umbrales que hoy usa el sistema de
gestión.

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
términos de uso prohíben el acceso automatizado. Al **Banco Mundial** le pasa
algo parecido por otro motivo: el endpoint que usa su propio sitio dejó de
aceptar peticiones anónimas. **INTERPOL** no permite descargar el listado.

## Cómo se construye

```bash
node --test                          # pruebas
node scripts/construir-listas.mjs    # descarga y normaliza (necesita salida a internet)
node scripts/evaluar-motor.mjs       # mide el motor contra las listas publicadas
```

La actualización real corre sola todos los días a las 06:00 de Bogotá
(`.github/workflows/actualizar-listas.yml`). También se puede lanzar a mano
desde la pestaña Actions.

Tres reglas gobiernan esa actualización:

- **Aislamiento por fuente.** Si una lista cambia de formato, las demás se
  actualizan igual; la afectada conserva su última versión buena y queda
  marcada como obsoleta en el manifiesto.
- **Avisar cuando una lista deja de publicar.** Cada fuente declara cuánto puede
  pasar sin novedades antes de que valga la pena mirar. Una lista que se
  descarga bien pero lleva meses congelada no falla por ningún lado, y sin ese
  aviso el sistema diría «al día» de un dato viejo. Se sigue consultando: el
  aviso advierte, no descarta.
- **Nunca publicar una lista encogida.** Si una lista pierde más del 40 % de sus
  registros se asume descarga incompleta y no se publica. Una lista truncada
  produciría un «sin hallazgos» falso, que es el peor resultado posible aquí.

Cuando algo falla, el trabajo abre un issue con la lista afectada y el motivo.

## El contrato de normalización

El índice de nombres y documentos se construye normalizando con
`app/motor/normalizar.js`. Quien consulta normaliza por su cuenta, con su propio
puerto de ese módulo. **Si las dos normalizaciones dejan de coincidir, el cruce
devuelve «sin hallazgos» sobre alguien que sí está designado y no falla nada**:
ni excepción, ni fila rechazada, ni una línea en ningún log.

Hay además un desfase que ninguna reorganización evita: lo que se sirve hoy se
indexó con la normalización de ayer.

Por eso el manifiesto publica un bloque `normalizacion` con un puñado de casos
—la Ñ que se iguala a la N, los ceros a la izquierda de una cédula, el recorte
de la forma societaria, el dígito de verificación del NIT— y el resultado que
esta normalización les da. Quien consulta pasa su propio normalizador por las
mismas entradas y compara; si no cuadran, no puede afirmar que su consulta
valga, y lo dice.

Los casos están en `scripts/contrato-normalizacion.mjs`. Al cambiar la
normalización hay que revisarlos, y subir `version` si se añaden o se quitan.

## Privacidad

Este repositorio es público y **no contiene ni puede contener datos
personales**. Solo sube código y listas de sanciones, que ya son información
pública oficial.

Lo consultado —nombres, documentos, resultados, decisiones y evidencias— vive en
el sistema de gestión, en una base con control de acceso por fila y copia de
seguridad. Antes vivía únicamente en el IndexedDB de un navegador, y el precio
de aquello era que no había nada que respaldara el expediente salvo la copia que
alguien se acordara de exportar.

## Publicación

El sitio se sirve desde GitHub Pages en:

**https://jhenaobuiles-ctrl.github.io/Sarglaft/**

De ahí baja las listas el sistema de gestión —Pages responde con
`Access-Control-Allow-Origin: *`— y por eso este repositorio sigue vivo aunque
su panel se haya retirado. `.github/workflows/publicar-pages.yml` publica en
cada cambio de código y cada vez que se actualizan las listas.

## Límites

- Lo que hay aquí es una copia fechada, no la fuente de verdad. Ante duda, prima
  la consulta en el sitio oficial de la lista.
- Las listas se actualizan una vez al día. Si se necesita certeza al minuto para
  una operación crítica, hay que ir a la fuente.

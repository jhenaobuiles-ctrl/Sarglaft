// Cruce masivo: verifica de una vez todas las contrapartes y cubre la
// obligación mensual.
//
// El proceso corre en el hilo principal, cediendo el control cada pocas filas
// para que la barra de progreso avance. Estaba previsto usar un Web Worker,
// pero medido contra los datos reales el motor resuelve mil consultas en unos
// 40 ms: mover el índice a otro hilo costaría más (clonar decenas de MB) de
// lo que ahorraría.

import { estado, registroCambio } from './app.js';
import { todos, guardar, guardarVarios, ALMACENES, nuevoId } from '../registro/db.js';
import { leerCSV, detectarSeparador, filasAObjetos, escribirCSV } from '../lib/csv.js';
import { interpretarPegado, resumirPegado } from '../lib/pegado.js';
import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';
import { marcarCumplida } from './obligaciones.js';
import { requiereDesenlace, conectarDecisiones, planDeRegistro } from './desenlace.js';
import { ultimaPorContraparte } from '../registro/contrapartes.js';
import { esc, ROTULOS, porcentaje, descargar, marcaArchivo, fechaHora } from './formato.js';

const FILAS_POR_TANDA = 200;

// Encabezados que se suelen encontrar en los archivos de contrapartes.
const PISTAS = {
  nombre: ['nombre', 'nombre completo', 'nombres y apellidos', 'razon social', 'razón social', 'contraparte', 'tercero', 'beneficiario'],
  tipoDocumento: ['tipo documento', 'tipo de documento', 'tipo doc', 'tipo id'],
  documento: ['documento', 'numero documento', 'número de documento', 'cedula', 'cédula', 'identificacion', 'identificación', 'nit', 'doc'],
  vinculo: ['vinculo', 'vínculo', 'rol', 'tipo contraparte', 'relacion', 'relación', 'cargo'],
};

let filasCargadas = [];
let encabezadoCargado = [];

export function montarCruce() {
  montarPegado();
  // El escuchador va aquí y no al pintar los resultados: pintarlos ocurre una
  // vez por cruce, y registrarlo ahí apilaría un manejador por cada cruce
  // hasta que el desplegable se abriera y se cerrara solo.
  conectarDecisiones('resultado-cruce', () => ({
    responsable: estado.config.responsable || '',
    alGuardar: registroCambio,
  }));

  document.getElementById('archivo-cruce').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const texto = await archivo.text();
    const filas = leerCSV(texto, detectarSeparador(texto));
    const { encabezado, objetos } = filasAObjetos(filas);

    if (!objetos.length) {
      document.getElementById('mapeo-cruce').innerHTML =
        '<div class="aviso error">El archivo no tiene filas de datos debajo del encabezado.</div>';
      return;
    }
    encabezadoCargado = encabezado;
    filasCargadas = objetos;
    pintarMapeo(archivo.name);
  });
}

/**
 * El camino corto: pegar la columna copiada de Excel.
 *
 * Sin selector de columnas ni archivo intermedio. El resumen se actualiza
 * mientras se escribe para que se vea qué entendió el panel antes de lanzar
 * el cruce, no después.
 */
function montarPegado() {
  const area = document.getElementById('pegado-cruce');
  const resumen = document.getElementById('resumen-pegado');
  const boton = document.getElementById('cruzar-pegado');
  let leido = { filas: [] };

  const revisar = () => {
    leido = interpretarPegado(area.value);
    boton.disabled = leido.filas.length === 0;
    boton.textContent = leido.filas.length
      ? `Cruzar ${leido.filas.length.toLocaleString('es-CO')} contraparte(s)`
      : 'Cruzar la lista';
    resumen.textContent = area.value.trim()
      ? resumirPegado(leido)
      : 'Pega la lista para empezar.';
  };

  area.addEventListener('input', revisar);
  revisar();

  boton.addEventListener('click', async () => {
    const tipoDocumento = document.getElementById('p-tipo-doc').value;
    const vinculo = document.getElementById('p-vinculo').value;
    await ejecutarCruce(
      leido.filas.map((f) => ({
        linea: f.linea,
        nombre: f.nombre,
        documento: f.documento,
        // El tipo se aplica a toda la lista: es lo que se puede saber de un
        // pegado suelto, y solo cambia el resultado en los NIT, a los que hay
        // que buscar también sin su dígito de verificación.
        tipoDocumento: f.documento ? tipoDocumento : '',
        vinculo,
      })),
    );
  });
}

function adivinar(campo) {
  const pistas = PISTAS[campo];
  const normalizadas = encabezadoCargado.map((h) => normalizarNombre(h));
  for (const pista of pistas) {
    const indice = normalizadas.indexOf(normalizarNombre(pista));
    if (indice !== -1) return encabezadoCargado[indice];
  }
  for (const pista of pistas) {
    const indice = normalizadas.findIndex((h) => h.includes(normalizarNombre(pista)));
    if (indice !== -1) return encabezadoCargado[indice];
  }
  return '';
}

function pintarMapeo(nombreArchivo) {
  const opciones = (seleccionada) =>
    ['<option value="">— ninguna —</option>']
      .concat(
        encabezadoCargado.map(
          (h) => `<option value="${esc(h)}"${h === seleccionada ? ' selected' : ''}>${esc(h)}</option>`,
        ),
      )
      .join('');

  document.getElementById('mapeo-cruce').innerHTML = `
    <h3 style="margin-top:20px">Indicar qué columna es cuál</h3>
    <p class="tenue">
      ${filasCargadas.length.toLocaleString('es-CO')} filas leídas de <strong>${esc(nombreArchivo)}</strong>.
    </p>
    <div class="campos">
      <div><label for="m-nombre">Nombre o razón social</label><select id="m-nombre">${opciones(adivinar('nombre'))}</select></div>
      <div><label for="m-tipo">Tipo de documento</label><select id="m-tipo">${opciones(adivinar('tipoDocumento'))}</select></div>
      <div><label for="m-doc">Número de documento</label><select id="m-doc">${opciones(adivinar('documento'))}</select></div>
      <div><label for="m-vinculo">Tipo de contraparte</label><select id="m-vinculo">${opciones(adivinar('vinculo'))}</select></div>
    </div>
    <div class="acciones">
      <button type="button" class="accion" id="ejecutar-cruce">Ejecutar el cruce</button>
    </div>
  `;
  document.getElementById('ejecutar-cruce').addEventListener('click', ejecutar);
}

async function ejecutar() {
  const columnas = {
    nombre: document.getElementById('m-nombre').value,
    tipoDocumento: document.getElementById('m-tipo').value,
    documento: document.getElementById('m-doc').value,
    vinculo: document.getElementById('m-vinculo').value,
  };
  if (!columnas.nombre && !columnas.documento) {
    alert('Indica al menos la columna del nombre o la del documento.');
    return;
  }

  const contrapartes = [];
  for (let i = 0; i < filasCargadas.length; i++) {
    const fila = filasCargadas[i];
    const valor = (columna) => (columna ? String(fila[columna] || '').trim() : '');
    const nombre = valor(columnas.nombre);
    const documento = valor(columnas.documento);
    if (!nombre && !documento) continue;
    contrapartes.push({
      // +2: la primera fila del archivo es el encabezado y las hojas de
      // cálculo cuentan desde uno, así que este es el número que ve quien
      // abra el archivo para revisar una alerta.
      linea: i + 2,
      nombre,
      documento,
      tipoDocumento: valor(columnas.tipoDocumento),
      vinculo: valor(columnas.vinculo),
    });
  }
  await ejecutarCruce(contrapartes);
}

/**
 * Cruza una lista de contrapartes contra las listas cargadas.
 *
 * Es el camino común del archivo CSV y del pegado: cambia de dónde salen las
 * contrapartes, no lo que se hace con ellas ni lo que queda registrado.
 *
 * @param {Array<{linea:number,nombre:string,documento:string,tipoDocumento?:string,vinculo?:string}>} contrapartes
 */
async function ejecutarCruce(contrapartes) {
  if (!contrapartes.length) {
    alert('No hay contrapartes que cruzar.');
    return;
  }

  const progreso = document.getElementById('progreso-cruce');
  const salida = document.getElementById('resultado-cruce');
  salida.innerHTML = '';
  progreso.innerHTML = `
    <div class="tarjeta">
      <h3 style="margin-top:0">Cruzando contra las listas…</h3>
      <progress id="barra-cruce" max="${contrapartes.length}" value="0"></progress>
      <p class="tenue" id="texto-cruce">0 de ${contrapartes.length.toLocaleString('es-CO')}</p>
    </div>`;
  const barra = document.getElementById('barra-cruce');
  const texto = document.getElementById('texto-cruce');

  const cruceId = nuevoId('x');
  const inicio = new Date().toISOString();
  const resultados = [];
  const registros = [];

  // La misma lista de alumnos se pega mes tras mes. Sin mirar lo que ya está
  // en el expediente, cada cruce crearía otra consulta para cada contraparte:
  // la decisión de septiembre («es homónimo, nuestro alumno tiene 19 años»)
  // no se vería en octubre y habría que volver a escribirla, mientras el
  // contador de pendientes crece para siempre. Es la misma regla que ya sigue
  // el barrido periódico, y tiene que ser la misma o «una alerta abierta»
  // significaría una cosa en una pantalla y otra en la otra.
  const previas = ultimaPorContraparte(await todos(ALMACENES.consultas));
  let reutilizadas = 0;

  for (let i = 0; i < contrapartes.length; i++) {
    const { linea, nombre, documento, tipoDocumento = '', vinculo = '' } = contrapartes[i];

    const resultado = estado.motor.consultar({ nombre, documento, tipoDocumento });
    const nombreNormalizado = normalizarNombre(nombre);
    const documentoNormalizado = normalizarDocumento(documento);
    const previa = previas.get(documentoNormalizado || nombreNormalizado);
    const plan = previa ? planDeRegistro(previa, resultado.resultado) : null;
    // Se guarda fila nueva si la contraparte no estaba en el expediente o si
    // apareció algo que no estaba antes. Si sigue igual, se reutiliza la que
    // ya existe: así el desplegable de esta fila abre la decisión ya tomada
    // en vez de una copia en blanco.
    const guardarFila = !plan || plan.empeoro;
    if (!guardarFila) reutilizadas++;

    // El identificador se comparte entre lo que se guarda y lo que se pinta:
    // sin él, la tabla de resultados no podría abrir la decisión de la fila.
    const idConsulta = guardarFila ? nuevoId('c') : previa.id;
    resultados.push({
      linea, nombre, documento, tipoDocumento, vinculo,
      id: idConsulta,
      yaConocida: !guardarFila,
      ...resultado,
    });

    if (guardarFila) registros.push({
      id: idConsulta,
      fecha: resultado.fecha,
      tipo: 'cruce',
      cruceId,
      vinculo: vinculo || previa?.vinculo || '',
      consulta: resultado.consulta,
      nombreNormalizado,
      documentoNormalizado,
      resultado: resultado.resultado,
      coincidencias: resultado.coincidencias,
      // Las listas no se repiten en cada fila: viven una sola vez en el cruce.
      listas: [],
      responsable: estado.config.responsable || '',
      ...(previa
        ? {
            pep: Boolean(previa.pep),
            pepDetalle: previa.pepDetalle || '',
            observaciones: `En el cruce del ${fechaHora(inicio)} apareció una coincidencia que no estaba en la consulta anterior (${fechaHora(previa.fecha)}), cuyo resultado era «${ROTULOS[previa.resultado] || previa.resultado}».`,
          }
        : {}),
    });

    if (i % FILAS_POR_TANDA === 0) {
      barra.value = i;
      texto.textContent = `${i.toLocaleString('es-CO')} de ${contrapartes.length.toLocaleString('es-CO')}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  barra.value = contrapartes.length;
  const listas = resultados[0]?.listas || estado.listas.map((l) => ({
    id: l.id, nombre: l.nombre, fechaPublicacion: l.fechaPublicacion,
    sha256: l.sha256, registros: l.registros.length, autoridad: l.autoridad,
  }));

  const conteo = (r) => resultados.filter((x) => x.resultado === r).length;
  const cruce = {
    id: cruceId,
    fecha: inicio,
    total: resultados.length,
    alertas: conteo('ALERTA'),
    revisiones: conteo('EN_REVISION'),
    limpias: conteo('SIN_HALLAZGOS'),
    // Cuántas ya venían del expediente. El total sigue siendo el de la lista
    // cruzada —que es lo que prueba la obligación mensual—; esto solo explica
    // por qué el expediente no creció en la misma cifra.
    reutilizadas,
    listas,
    responsable: estado.config.responsable || '',
  };

  await guardarVarios(ALMACENES.consultas, registros);
  await guardar(ALMACENES.cruces, cruce);
  await marcarCumplida('cruce-masivo', inicio);
  registroCambio();

  progreso.innerHTML = '';
  pintarResultados(cruce, resultados);
}

function pintarResultados(cruce, resultados) {
  const revisar = resultados
    .filter((r) => r.resultado !== 'SIN_HALLAZGOS')
    .sort((a, b) => (b.coincidencias[0]?.puntaje || 0) - (a.coincidencias[0]?.puntaje || 0));

  document.getElementById('resultado-cruce').innerHTML = `
    <div class="indicadores">
      <div class="indicador"><div class="cifra">${cruce.total.toLocaleString('es-CO')}</div><div class="rotulo">Contrapartes cruzadas</div></div>
      <div class="indicador limpio"><div class="cifra">${cruce.limpias.toLocaleString('es-CO')}</div><div class="rotulo">Sin hallazgos</div></div>
      <div class="indicador revision"><div class="cifra">${cruce.revisiones.toLocaleString('es-CO')}</div><div class="rotulo">En revisión</div></div>
      <div class="indicador alerta"><div class="cifra">${cruce.alertas.toLocaleString('es-CO')}</div><div class="rotulo">Con alerta</div></div>
    </div>

    <div class="tarjeta">
      <h2>Requieren atención</h2>
      ${
        revisar.length
          ? `<p class="tenue">
               Ordenadas por similitud. El resto de contrapartes salió sin hallazgos y quedó registrado en el expediente.
               ${cruce.reutilizadas ? `Las marcadas «ya en el expediente» (${cruce.reutilizadas.toLocaleString('es-CO')} de ${cruce.total.toLocaleString('es-CO')}) traen la decisión que ya se tomó sobre ellas: no hay que volver a decidirlas si nada cambió.` : ''}
             </p>
             <div class="envoltura-tabla"><table>
               <thead><tr><th>Línea</th><th>Contraparte</th><th>Documento</th><th>Resultado</th><th>Coincidencia más fuerte</th><th>Lista</th><th></th></tr></thead>
               <tbody>${revisar
                 .map((r) => {
                   const c = r.coincidencias[0];
                   return `<tr>
                     <td class="numero">${r.linea}</td>
                     <td>${esc(r.nombre) || '—'}${r.yaConocida ? '<br><span class="tenue">ya en el expediente</span>' : ''}</td>
                     <td class="numero">${esc(r.documento) || '—'}</td>
                     <td>
                       <span class="etiqueta ${r.resultado}">${esc(ROTULOS[r.resultado])}</span>
                       <br><span data-chip="${esc(r.id)}"></span>
                     </td>
                     <td>${c ? `${esc(c.registro.n)}<br><span class="tenue">${c.motivo === 'documento' ? 'documento exacto' : `similitud ${esc(porcentaje(c.puntaje))}`}</span>` : '—'}</td>
                     <td>${c ? esc(c.lista.nombre) : '—'}</td>
                     <td class="acciones-fila">
                       ${requiereDesenlace(r) ? `<button type="button" class="accion no-imprimir" data-analizar="${esc(r.id)}" data-rotulo="Decidir">Decidir</button>` : ''}
                     </td>
                   </tr>`;
                 })
                 .join('')}</tbody>
             </table></div>`
          : '<p class="vacio">Ninguna contraparte coincidió con las listas restrictivas.</p>'
      }
      <div class="acciones">
        <button type="button" class="accion secundaria" id="exportar-cruce">Exportar resultado completo (CSV)</button>
      </div>
      <p class="tenue" style="margin-top:12px">
        Cruce ejecutado el ${esc(fechaHora(cruce.fecha))}. La obligación mensual quedó marcada como cumplida.
      </p>
    </div>
  `;

  document.getElementById('exportar-cruce').addEventListener('click', () => {
    const filas = [
      ['Línea', 'Nombre', 'Tipo documento', 'Documento', 'Tipo contraparte', 'Resultado', 'Ya en el expediente', 'Coincidencias', 'Mejor coincidencia', 'Lista', 'Similitud', 'Motivo'],
      ...resultados.map((r) => {
        const c = r.coincidencias[0];
        return [
          r.linea, r.nombre, r.tipoDocumento, r.documento, r.vinculo,
          ROTULOS[r.resultado] || r.resultado,
          r.yaConocida ? 'Sí' : 'No',
          r.coincidencias.length,
          c ? c.registro.n : '',
          c ? c.lista.nombre : '',
          c ? (c.motivo === 'documento' ? 'exacta' : porcentaje(c.puntaje)) : '',
          c ? (c.motivo === 'documento' ? 'Número de documento' : 'Nombre') : '',
        ];
      }),
    ];
    descargar(`cruce-masivo-${marcaArchivo()}.csv`, escribirCSV(filas, ';'), 'text/csv;charset=utf-8');
  });
}

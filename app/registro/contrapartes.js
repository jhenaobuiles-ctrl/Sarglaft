// Reunir todo lo que hay de una misma persona o empresa.
//
// El panel guardaba las cosas por consulta: aquí una consulta, allá un
// documento, más allá una evidencia. Pero lo que pide quien revisa no es una
// consulta suelta sino «el expediente de este alumno», y armarlo a mano
// obligaba a recorrer tres pantallas y a acordarse de cómo se había escrito
// el nombre cada vez.
//
// La clave es el documento cuando lo hay, porque es lo único que identifica a
// alguien sin ambigüedad. Cuando no lo hay se usa el nombre normalizado, y
// después se intenta unir ese grupo con el del documento que lleve ese mismo
// nombre: es el caso corriente de haber consultado primero por nombre y haber
// registrado el documento más tarde.

// La regla de «alerta atendida» se importa en vez de repetirse: si el
// expediente de la contraparte contara las alertas con un criterio propio,
// acabaría diciendo algo distinto del resumen.
import { estaCerrada, requiereDesenlace, citadasEnDocumentos } from '../ui/desenlace.js';

/** Clave provisional de un registro, antes de intentar unir grupos. */
export function claveDe(registro) {
  if (registro.documentoNormalizado) return `d:${registro.documentoNormalizado}`;
  if (registro.nombreNormalizado) return `n:${registro.nombreNormalizado}`;
  return '';
}

function fichaVacia(clave) {
  return {
    clave,
    nombre: '',
    documento: '',
    tipoDocumento: '',
    vinculo: '',
    pep: false,
    pepDetalle: '',
    consultas: [],
    documentos: [],
    evidencias: [],
    ultimaConsulta: null,
    resultadoActual: null,
    alertasAbiertas: 0,
    nombres: new Set(),
  };
}

/**
 * Agrupa consultas, documentos y evidencias por contraparte.
 *
 * @returns {Array<object>} fichas ordenadas por la actividad más reciente
 */
export function construirFichas({ consultas = [], documentos = [], evidencias = [] } = {}) {
  const grupos = new Map();

  const grupo = (clave) => {
    if (!grupos.has(clave)) grupos.set(clave, fichaVacia(clave));
    return grupos.get(clave);
  };

  for (const consulta of consultas) {
    const clave = claveDe(consulta);
    if (!clave) continue;
    const ficha = grupo(clave);
    ficha.consultas.push(consulta);
    if (consulta.nombreNormalizado) ficha.nombres.add(consulta.nombreNormalizado);
  }

  for (const documento of documentos) {
    const clave = claveDe(documento);
    if (!clave) continue;
    const ficha = grupo(clave);
    ficha.documentos.push(documento);
    if (documento.nombreNormalizado) ficha.nombres.add(documento.nombreNormalizado);
  }

  unirPorNombre(grupos);

  // Las evidencias cuelgan de una consulta, así que llegan por ella.
  const porConsulta = new Map();
  for (const ficha of grupos.values()) {
    for (const consulta of ficha.consultas) porConsulta.set(consulta.id, ficha);
  }
  for (const evidencia of evidencias) {
    porConsulta.get(evidencia.consultaId)?.evidencias.push(evidencia);
  }

  const cerradasPorDocumento = citadasEnDocumentos(documentos);
  const fichas = [];
  for (const ficha of grupos.values()) {
    rematar(ficha, cerradasPorDocumento);
    fichas.push(ficha);
  }
  fichas.sort((a, b) => (b.ultimaActividad || '').localeCompare(a.ultimaActividad || ''));
  return fichas;
}

/**
 * Une el grupo que solo tiene nombre con el que tiene documento.
 *
 * Solo cuando ese nombre apunta a un único grupo con documento: dos personas
 * distintas pueden llamarse igual, y fundirlas sería peor que dejarlas
 * separadas.
 */
function unirPorNombre(grupos) {
  const porNombre = new Map();
  for (const [clave, ficha] of grupos) {
    if (!clave.startsWith('d:')) continue;
    for (const nombre of ficha.nombres) {
      if (!porNombre.has(nombre)) porNombre.set(nombre, []);
      porNombre.get(nombre).push(ficha);
    }
  }

  for (const [clave, ficha] of [...grupos]) {
    if (!clave.startsWith('n:')) continue;
    const candidatos = porNombre.get(clave.slice(2)) || [];
    if (candidatos.length !== 1) continue;
    const destino = candidatos[0];
    destino.consultas.push(...ficha.consultas);
    destino.documentos.push(...ficha.documentos);
    grupos.delete(clave);
  }
}

/** Calcula lo que se lee de un vistazo: quién es y qué queda pendiente. */
function rematar(ficha, cerradasPorDocumento) {
  ficha.consultas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  ficha.documentos.sort((a, b) =>
    (b.actualizado || b.fecha || '').localeCompare(a.actualizado || a.fecha || ''),
  );
  ficha.evidencias.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // El dato más reciente que no venga vacío: una consulta por cédula sin
  // nombre no debe borrar el nombre que ya se conocía.
  for (const consulta of ficha.consultas) {
    ficha.nombre ||= consulta.consulta?.nombre || '';
    ficha.documento ||= consulta.consulta?.documento || '';
    ficha.tipoDocumento ||= consulta.consulta?.tipoDocumento || '';
    ficha.vinculo ||= consulta.vinculo || '';
    if (consulta.pep) {
      ficha.pep = true;
      ficha.pepDetalle ||= consulta.pepDetalle || '';
    }
  }
  for (const documento of ficha.documentos) {
    ficha.nombre ||= documento.valores?.nombre || '';
    ficha.documento ||= documento.valores?.documento || '';
  }

  // Para saber si está limpia hoy vale la última consulta contra listas; una
  // constancia de antecedentes no cruzó ninguna.
  const contraListas = ficha.consultas.filter((c) => c.tipo !== 'antecedentes');
  ficha.ultimaConsulta = contraListas[0]?.fecha || null;
  ficha.resultadoActual = contraListas[0]?.resultado || null;

  ficha.alertasAbiertas = ficha.consultas.filter(
    (c) => requiereDesenlace(c) && !estaCerrada(c, cerradasPorDocumento),
  ).length;

  ficha.ultimaActividad = [
    ficha.consultas[0]?.fecha,
    ficha.documentos[0]?.actualizado || ficha.documentos[0]?.fecha,
  ]
    .filter(Boolean)
    .sort()
    .pop() || null;

  delete ficha.nombres;
  return ficha;
}

/** Filtra las fichas por lo que se escriba en el buscador. */
export function filtrarFichas(fichas, texto) {
  const aguja = String(texto || '').trim().toLowerCase();
  if (!aguja) return fichas;
  return fichas.filter((f) =>
    `${f.nombre} ${f.documento}`.toLowerCase().includes(aguja),
  );
}

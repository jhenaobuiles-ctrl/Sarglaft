// Utilidades compartidas de presentación.

export const ZONA = 'America/Bogota';

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA,
});
// Las fechas de publicación de las listas son días calendario, sin hora ni
// zona. Se formatean en UTC a propósito: convertirlas a hora de Bogotá las
// corre un día hacia atrás y el certificado acabaría citando una versión de
// la lista que no es la que se consultó.
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
const FECHA_LOCAL = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: ZONA });

export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FECHA_HORA.format(d);
}

export function fechaCorta(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    return FECHA.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  }
  // Marca de tiempo completa: ahí sí corresponde la hora de Colombia.
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return FECHA_LOCAL.format(d);
  }
  // Todo lo demás se muestra literal. `new Date` acepta cosas como
  // "circa 1980" y devuelve una fecha concreta e incorrecta; un certificado
  // no puede afirmar más de lo que dice la fuente.
  return iso;
}

export const ROTULOS = {
  ALERTA: 'Con alerta',
  EN_REVISION: 'En revisión',
  SIN_HALLAZGOS: 'Sin hallazgos',
};

/** Título del documento según lo que realmente se verificó. */
export const TITULOS_CERTIFICADO = {
  puntual: 'Certificado de consulta en listas restrictivas',
  cruce: 'Certificado de consulta en listas restrictivas',
  antecedentes: 'Constancia de consulta de antecedentes',
};

export const EXPLICACIONES = {
  ALERTA:
    'Hay una coincidencia fuerte. No se puede vincular a esta contraparte sin que el responsable de cumplimiento analice el caso y deje constancia de su decisión.',
  EN_REVISION:
    'Hay coincidencias parciales que pueden ser homónimos. Requiere revisión humana: contrasta documento, fecha de nacimiento y nacionalidad antes de decidir.',
  SIN_HALLAZGOS:
    'No se encontraron coincidencias en las listas consultadas, en su versión vigente a la fecha de esta consulta.',
};

/**
 * El mismo veredicto significa cosas distintas según lo consultado. En una
 * constancia de antecedentes no hay "coincidencia" que valga: lo que hay es
 * una entidad que reportó algo.
 */
export const EXPLICACIONES_ANTECEDENTES = {
  ALERTA:
    'Al menos una de las entidades consultadas reportó hallazgos. No se puede vincular a esta contraparte sin que el responsable de cumplimiento analice el caso y deje constancia de su decisión.',
  EN_REVISION:
    'Alguna de las entidades consultadas arrojó información que requiere revisión humana antes de decidir.',
  SIN_HALLAZGOS:
    'Ninguna de las entidades consultadas reportó hallazgos a la fecha de esta constancia.',
};

/** Explicación del veredicto adecuada al tipo de consulta. */
export function explicacionDe(consulta) {
  const tabla =
    consulta.tipo === 'antecedentes' ? EXPLICACIONES_ANTECEDENTES : EXPLICACIONES;
  return tabla[consulta.resultado] || '';
}

export const TIPOS_REGISTRO = { P: 'Persona natural', E: 'Persona jurídica', B: 'Buque o aeronave' };

/** Escapa texto antes de insertarlo en HTML. */
export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function porcentaje(valor) {
  return `${Math.round(valor * 100)}%`;
}

/** Descarga un texto como archivo. */
export function descargar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Marca de tiempo apta para nombres de archivo. */
export function marcaArchivo(fecha = new Date()) {
  return fecha.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/**
 * Condición de persona expuesta políticamente.
 *
 * En Colombia no existe un listado oficial de PEP que se pueda descargar y
 * cruzar, así que la fuente es la declaración de la propia contraparte —el
 * formato PEP que ya existe en el manual—. El Decreto 830 de 2021 extiende
 * las obligaciones a familiares y asociados cercanos, y por eso cuentan
 * igual para el indicador del panel.
 */
export const CONDICIONES_PEP = {
  pep: 'Persona expuesta políticamente',
  vinculado: 'Familiar o asociado cercano de un PEP',
};

export function etiquetaPEP(valor) {
  return CONDICIONES_PEP[valor] || '';
}

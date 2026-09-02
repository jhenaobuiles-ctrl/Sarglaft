// Interpretar una lista de contrapartes pegada desde Excel.
//
// El cruce masivo exigía un archivo CSV, y ese es el paso donde la gente se
// atasca: hay que ir a "Guardar como", elegir la codificación correcta y
// acordarse de dónde quedó el archivo. Copiar una columna y pegarla es lo que
// alguien hace sin pensar.
//
// Lo que llega al portapapeles desde Excel son columnas separadas por
// tabulador, así que pegar dos columnas —nombre y cédula— tiene que funcionar
// igual de bien que pegar una sola. Cuál es cuál se deduce del contenido y no
// de la posición: nadie copia siempre en el mismo orden.

import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';

// Por orden de fiabilidad. El tabulador es lo que pone Excel al copiar; la
// coma va la última porque los apellidos vienen separados por coma con
// demasiada frecuencia ("PEREZ, JUAN") como para partir por ahí a la ligera.
const SEPARADORES = ['\t', ';', '|', ','];

// Palabras que delatan la fila de encabezado, que casi siempre se copia
// arrastrada con los datos.
const ENCABEZADOS = new Set([
  'NOMBRE', 'NOMBRES', 'APELLIDOS', 'NOMBRE COMPLETO', 'NOMBRES Y APELLIDOS',
  'RAZON SOCIAL', 'CONTRAPARTE', 'TERCERO', 'BENEFICIARIO', 'CLIENTE',
  'ALUMNO', 'ESTUDIANTE', 'EMPLEADO', 'PROVEEDOR', 'SOCIO',
  'DOCUMENTO', 'DOCUMENTO DE IDENTIDAD', 'NUMERO DE DOCUMENTO', 'NUMERO DOCUMENTO',
  'CEDULA', 'CC', 'NIT', 'IDENTIFICACION', 'ID', 'DOC', 'NO', 'NUMERO',
  'TIPO DE DOCUMENTO', 'TIPO DOCUMENTO',
]);

/**
 * ¿Este valor parece un número de documento?
 *
 * Se aceptan de cinco a quince dígitos tras quitar puntos, espacios y
 * guiones: cubre la cédula colombiana, la de extranjería y el NIT con o sin
 * dígito de verificación. Por debajo de cinco es casi seguro un dato suelto
 * —un consecutivo, una edad— y no un documento.
 */
export function pareceDocumento(valor) {
  const limpio = String(valor ?? '').replace(/[.\s-]/g, '');
  return /^\d{5,15}$/.test(limpio);
}

function esEncabezado(campos) {
  return campos.some((c) => ENCABEZADOS.has(normalizarNombre(c)));
}

function partir(linea) {
  for (const sep of SEPARADORES) {
    if (linea.includes(sep)) {
      return linea.split(sep).map((c) => c.trim()).filter((c) => c !== '');
    }
  }
  return [linea.trim()];
}

/**
 * Reparte los campos de una línea entre nombre y documento.
 *
 * Por contenido y no por posición: se toma como documento el primer campo que
 * lo parezca y como nombre el primero que no. Así da igual que la columna de
 * la cédula vaya antes o después de la del nombre.
 */
function repartir(campos) {
  let nombre = '';
  let documento = '';
  for (const campo of campos) {
    if (!documento && pareceDocumento(campo)) documento = campo;
    else if (!nombre) nombre = campo;
  }
  // Una línea con un solo campo numérico es un documento, no un nombre.
  if (!nombre && !documento && campos.length) nombre = campos[0];
  return { nombre, documento };
}

/**
 * Convierte el texto pegado en contrapartes consultables.
 *
 * @param {string} texto lo que haya en el portapapeles
 * @returns {{filas: Array<{linea:number,nombre:string,documento:string}>,
 *            encabezadoOmitido: boolean, repetidas: number, descartadas: number}}
 */
export function interpretarPegado(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/);
  const filas = [];
  const vistas = new Set();
  let encabezadoOmitido = false;
  let repetidas = 0;
  let descartadas = 0;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;

    const campos = partir(linea);
    if (!campos.length) continue;

    if (!filas.length && !encabezadoOmitido && esEncabezado(campos)) {
      encabezadoOmitido = true;
      continue;
    }

    const { nombre, documento } = repartir(campos);
    if (!nombre && !documento) {
      descartadas++;
      continue;
    }

    // Repetir una contraparte en el mismo barrido no aporta nada y ensucia el
    // expediente con filas idénticas.
    const clave = normalizarDocumento(documento) || normalizarNombre(nombre);
    if (vistas.has(clave)) {
      repetidas++;
      continue;
    }
    vistas.add(clave);

    filas.push({ linea: i + 1, nombre, documento });
  }

  return { filas, encabezadoOmitido, repetidas, descartadas };
}

/** Cómo se le resume a quien pegó lo que el panel entendió. */
export function resumirPegado(resultado) {
  const conDocumento = resultado.filas.filter((f) => f.documento).length;
  const soloNombre = resultado.filas.length - conDocumento;
  const partes = [`${resultado.filas.length} contraparte(s)`];
  if (conDocumento) partes.push(`${conDocumento} con documento`);
  if (soloNombre) partes.push(`${soloNombre} solo con nombre`);
  if (resultado.repetidas) partes.push(`${resultado.repetidas} repetida(s) omitida(s)`);
  if (resultado.encabezadoOmitido) partes.push('se omitió la fila de encabezado');
  return partes.join(' · ');
}

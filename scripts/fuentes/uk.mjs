// Reino Unido — UK Sanctions List (OFSI).
//
// Dos rarezas del formato que condicionan el parser:
//
//  1. La URL del CSV lleva un identificador de archivo que cambia en cada
//     publicación, así que no se puede fijar. Se resuelve consultando la API
//     de contenidos de gov.uk y tomando el adjunto CSV vigente.
//  2. El CSV trae una fila por variante de nombre, no por sancionado. Hay que
//     agrupar por identificador de grupo: la primaria es el nombre y las
//     demás son alias.

import { leerCSV, detectarSeparador, filasAObjetos } from '../../app/lib/csv.js';
import { registro, fechaISO } from '../lib/registro.mjs';
import { normalizarNombre } from '../../app/motor/normalizar.js';

export const meta = {
  id: 'uk',
  nombre: 'Reino Unido — UK Sanctions List (OFSI)',
  fuente: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
  apiContenidos:
    'https://www.gov.uk/api/content/government/publications/the-uk-sanctions-list',
  autoridad: 'Office of Financial Sanctions Implementation, HM Treasury',
  vinculante: false,
  formato: 'csv',
};

/**
 * Localiza el CSV vigente y su fecha de publicación.
 *
 * La fecha sale de aquí y no del CSV a propósito: el archivo que publica el
 * FCDO no trae encabezado con fecha, y la fecha de publicación es lo que se
 * cita en el certificado de consulta.
 *
 * @param {(url:string)=>Promise<{cuerpo:string}>} descargar
 * @returns {Promise<{url:string, fechaPublicacion:string}>}
 */
export async function resolver(descargar) {
  const { cuerpo } = await descargar(meta.apiContenidos);
  const datos = JSON.parse(cuerpo);
  const url = localizarCSV(datos);
  if (!url) throw new Error('la publicación no expone un adjunto CSV');
  return { url, fechaPublicacion: fechaISO(fechaDePublicacion(datos)) };
}

/** Busca el adjunto CSV dentro de la respuesta de la API de contenidos. */
export function localizarCSV(contenidoApi) {
  const datos =
    typeof contenidoApi === 'string' ? JSON.parse(contenidoApi) : contenidoApi;
  const adjuntos = [];
  const pila = [datos];
  const vistos = new Set();
  while (pila.length) {
    const actual = pila.shift();
    if (!actual || typeof actual !== 'object' || vistos.has(actual)) continue;
    vistos.add(actual);
    if (Array.isArray(actual)) {
      for (const v of actual) pila.push(v);
      continue;
    }
    if (typeof actual.url === 'string') adjuntos.push(actual);
    for (const v of Object.values(actual)) pila.push(v);
  }
  const csv = adjuntos.filter((a) => /\.csv(\?|$)/i.test(a.url));
  if (!csv.length) return null;
  // Preferimos el adjunto cuyo título menciona la lista, no un anexo suelto.
  const preferido =
    csv.find((a) => /uk[\s_-]*sanctions[\s_-]*list/i.test(`${a.title || ''} ${a.url}`)) ||
    csv[0];
  return preferido.url;
}

function fechaDePublicacion(datos) {
  return (
    datos.public_updated_at ||
    datos.updated_at ||
    datos.first_published_at ||
    ''
  );
}

export function parsear(contenido) {
  const separador = detectarSeparador(contenido);
  const filas = leerCSV(contenido, separador);

  // Antes del encabezado real hay líneas de título con la fecha de generación.
  const indiceEncabezado = filas.findIndex(esEncabezado);
  const fechaPublicacion = fechaGenerada(filas.slice(0, Math.max(indiceEncabezado, 0)));
  if (indiceEncabezado === -1) {
    throw new Error('No se encontró la fila de encabezado del CSV del Reino Unido');
  }

  const { objetos } = filasAObjetos(filas, esEncabezado);

  const grupos = new Map();
  for (const fila of objetos) {
    // "Unique ID" (p. ej. RUS3355) es el identificador por designación y viene
    // en todas las filas. "OFSI Group ID" existe pero está vacío en buena
    // parte del archivo: usarlo como clave principal dejaba una de cada tres
    // filas sin agrupar, y la misma entidad salía repetida hasta 36 veces.
    const clave =
      campo(fila, 'unique id', 'ofsi group id', 'uk sanctions list ref') ||
      `sin-grupo-${grupos.size}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(fila);
  }

  const registros = [];
  for (const [clave, filasGrupo] of grupos) {
    const construido = grupo(clave, filasGrupo);
    if (construido) registros.push(construido);
  }
  return { fechaPublicacion, registros };
}

function esEncabezado(fila) {
  const celdas = fila.map((c) => normalizarNombre(c));
  return celdas.includes('NAME 6') || (celdas.includes('NAME 1') && celdas.includes('NAME TYPE'));
}

// Sobre el encabezado va una sola línea: "Report Date: 18-Aug-2026".
function fechaGenerada(filasPrevias) {
  for (const fila of filasPrevias) {
    for (const celda of fila) {
      const m = celda.match(/(\d{1,2}[-\s][A-Za-z]{3}[a-z]*[-\s]\d{4})/);
      if (m) return fechaISO(m[1]);
      const iso = celda.match(/\d{4}-\d{2}-\d{2}/);
      if (iso) return iso[0];
      const barras = celda.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (barras) return fechaISO(barras[0], 'DMA');
    }
  }
  return '';
}

const TIPOS = { INDIVIDUAL: 'P', ENTITY: 'E', SHIP: 'B', VESSEL: 'B', AIRCRAFT: 'B' };

/**
 * Determina si la designación es persona, entidad o buque.
 *
 * El archivo no trae una columna dedicada al tipo de sujeto, así que primero
 * se prueba el vocabulario de las columnas que podrían traerlo y, si no dicen
 * nada reconocible, se deduce de qué datos existen: una fecha de nacimiento o
 * un pasaporte solo los tiene una persona; un número IMO, solo un buque.
 */
function deducirTipo(filas) {
  for (const fila of filas) {
    const declarado = TIPOS[normalizarNombre(campo(fila, 'designation type', 'type of entity'))];
    if (declarado) return declarado;
  }
  const algunaTiene = (...columnas) =>
    filas.some((f) => columnas.some((c) => campo(f, c)));

  if (algunaTiene('imo number', 'type of ship', 'tonnage of ship', 'current believed flag of ship')) {
    return 'B';
  }
  if (algunaTiene('d o b', 'dob', 'passport number', 'gender', 'town of birth', 'position')) {
    return 'P';
  }
  return 'E';
}

function grupo(clave, filas) {
  const nombres = filas.map((f) => ({ fila: f, nombre: nombreCompleto(f) }));
  const conNombre = nombres.filter((n) => n.nombre);
  if (!conNombre.length) return null;

  // La fila primaria es la que el propio archivo marca como tal; si ninguna lo
  // está, la primera sirve.
  const indicePrimario = conNombre.findIndex((n) =>
    /PRIMARY/.test(normalizarNombre(campo(n.fila, 'name type'))),
  );
  const primario = conNombre[indicePrimario === -1 ? 0 : indicePrimario];
  const alias = conNombre.filter((n) => n !== primario).map((n) => n.nombre);

  const fila = primario.fila;
  const documentos = [];
  for (const [etiqueta, ...columnas] of [
    ['Pasaporte', 'passport number'],
    ['Documento nacional', 'national identifier number', 'national identification number'],
    ['Registro mercantil', 'business registration number s', 'business registration number'],
    ['IMO', 'imo number'],
  ]) {
    for (const f of filas) {
      const numero = campo(f, ...columnas);
      if (numero) documentos.push({ tipo: etiqueta, numero });
    }
  }

  const nacionalidades = unicos(
    filas.map((f) => campo(f, 'nationality ies', 'nationality')).filter(Boolean),
  );
  // La columna se llama "D.O.B", que al normalizar queda como tres palabras.
  const nacimientos = unicos(
    filas.map((f) => fechaISO(campo(f, 'd o b', 'dob', 'date of birth'), 'DMA')).filter(Boolean),
  );

  return registro({
    id: `UK-${clave}`,
    tipo: deducirTipo(filas),
    nombre: primario.nombre,
    alias,
    documentos,
    nacionalidades,
    nacimientos,
    programa: campo(fila, 'regime name', 'regime'),
    fechaListado: fechaISO(campo(fila, 'designation date', 'date designated'), 'DMA'),
    observaciones: campo(fila, 'uk statement of reasons', 'other information'),
    // Nota: `fila` es la primaria; el resto de columnas se leen de todo el grupo
    // porque el archivo reparte los datos entre las filas de cada designación.
  });
}

// OFSI reparte el nombre en seis columnas: "Name 6" es el apellido y "Name 1"
// a "Name 5" son los nombres de pila, en ese orden.
function nombreCompleto(fila) {
  const partes = [];
  for (let i = 1; i <= 5; i++) partes.push(campo(fila, `name ${i}`));
  partes.push(campo(fila, 'name 6'));
  const unido = partes.filter(Boolean).join(' ').trim();
  return unido || campo(fila, 'name', 'full name');
}

/**
 * Busca una columna por nombre normalizado, tolerando variaciones.
 *
 * Salta las columnas que existen pero vienen vacías y sigue con el siguiente
 * candidato. Sin eso, "OFSI Group ID" —presente pero en blanco en un tercio
 * del archivo— ganaba sobre "Unique ID" y devolvía cadena vacía como si la
 * columna no existiera.
 */
function campo(fila, ...candidatos) {
  const claves = Object.keys(fila);
  const exacto = (buscado) =>
    claves.find((clave) => normalizarNombre(clave) === buscado);
  const laxo = (buscado) =>
    claves.find((clave) => normalizarNombre(clave).startsWith(buscado));

  for (const buscar of [exacto, laxo]) {
    for (const candidato of candidatos) {
      const clave = buscar(normalizarNombre(candidato));
      if (clave === undefined) continue;
      const valor = String(fila[clave] ?? '').trim();
      if (valor) return valor;
    }
  }
  return '';
}

function unicos(a) {
  return [...new Set(a)];
}

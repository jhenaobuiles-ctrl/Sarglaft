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
    const clave =
      campo(fila, 'group id', 'ofsi group id', 'unique id', 'uk sanctions list ref') ||
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

function fechaGenerada(filasPrevias) {
  for (const fila of filasPrevias) {
    for (const celda of fila) {
      const m = celda.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`; // el Reino Unido escribe DD/MM/AAAA
      const iso = celda.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return iso[0];
    }
  }
  return '';
}

const TIPOS = { INDIVIDUAL: 'P', ENTITY: 'E', SHIP: 'B' };

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
  for (const [etiqueta, columna] of [
    ['Pasaporte', 'passport number'],
    ['Documento nacional', 'national identification number'],
  ]) {
    for (const f of filas) {
      const numero = campo(f, columna);
      if (numero) documentos.push({ tipo: etiqueta, numero });
    }
  }

  const nacionalidades = unicos(filas.map((f) => campo(f, 'nationality')).filter(Boolean));
  const nacimientos = unicos(
    filas.map((f) => fechaISO(campo(f, 'dob', 'date of birth'), 'DMA')).filter(Boolean),
  );

  return registro({
    id: `UK-${clave}`,
    tipo: TIPOS[normalizarNombre(campo(fila, 'individual entity ship', 'type'))] || 'E',
    nombre: primario.nombre,
    alias,
    documentos,
    nacionalidades,
    nacimientos,
    programa: campo(fila, 'regime name', 'regime'),
    fechaListado: fechaISO(campo(fila, 'designation date', 'date designated'), 'DMA'),
    observaciones: campo(fila, 'uk statement of reasons', 'other information'),
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

/** Busca una columna por nombre normalizado, tolerando variaciones. */
function campo(fila, ...candidatos) {
  for (const candidato of candidatos) {
    const buscado = normalizarNombre(candidato);
    for (const clave of Object.keys(fila)) {
      if (normalizarNombre(clave) === buscado) return String(fila[clave] || '').trim();
    }
  }
  // Segunda pasada más laxa: encabezados con paréntesis o notas al final.
  for (const candidato of candidatos) {
    const buscado = normalizarNombre(candidato);
    for (const clave of Object.keys(fila)) {
      if (normalizarNombre(clave).startsWith(buscado)) return String(fila[clave] || '').trim();
    }
  }
  return '';
}

function unicos(a) {
  return [...new Set(a)];
}

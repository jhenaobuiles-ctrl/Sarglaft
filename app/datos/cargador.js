// Carga de las listas normalizadas publicadas por GitHub Actions.
//
// El manifiesto trae el sha256 de cada archivo, así que sirve de doble
// propósito: es la huella que hace auditable la consulta y es la clave de
// caché. Mientras el hash no cambie, el navegador no vuelve a descargar la
// lista; cuando cambia, la entrada vieja se descarta sola.

import { revisarHuella, sePuedeVerificar } from './huella.js';

const BASE = new URL('../../data/listas/', import.meta.url);
const CACHE = 'sarglaft-listas-v1';

export class ErrorDeCarga extends Error {
  constructor(mensaje, causa) {
    super(mensaje);
    this.name = 'ErrorDeCarga';
    this.causa = causa;
  }
}

/**
 * Descarga el manifiesto. Si no hay red, recurre a la copia en caché para que
 * el panel siga consultando contra la última versión conocida.
 * @returns {Promise<{manifiesto: object, desdeCache: boolean}>}
 */
export async function cargarManifiesto() {
  const url = new URL('manifest.json', BASE).href;
  try {
    const respuesta = await fetch(url, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const manifiesto = await respuesta.json();
    await guardarEnCache(url, manifiesto);
    return { manifiesto, desdeCache: false };
  } catch (error) {
    const guardado = await leerDeCache(url);
    if (guardado) return { manifiesto: guardado, desdeCache: true };
    throw new ErrorDeCarga(
      'No se pudo cargar el manifiesto de listas y no hay copia local.',
      error,
    );
  }
}

/**
 * Descarga las listas indicadas.
 * @param {object} manifiesto
 * @param {object} opciones
 * @param {string[]} [opciones.ids] limita a estas listas; por omisión, todas
 * @param {(hecho:number,total:number,id:string)=>void} [opciones.alProgresar]
 */
export async function cargarListas(manifiesto, opciones = {}) {
  const seleccionadas = (manifiesto.listas || []).filter((l) => {
    if (opciones.ids && !opciones.ids.includes(l.id)) return false;
    // Una lista que nunca se pudo descargar no tiene archivo que cargar.
    return l.estado !== 'sin_datos' && l.archivo;
  });

  const listas = [];
  const fallos = [];
  const sinVerificar = [];
  let hecho = 0;

  for (const entrada of seleccionadas) {
    try {
      const { datos, verificada } = await cargarLista(entrada);
      listas.push({
        ...datos,
        // El manifiesto manda sobre el archivo: es lo que se cita en el
        // certificado y lo que el auditor puede verificar contra el repositorio.
        sha256: entrada.sha256,
        estado: entrada.estado,
        actualizado: entrada.actualizado,
        // Y ahora se sabe que el archivo es realmente ese, en vez de darlo
        // por supuesto. Viaja hasta el certificado: una huella citada sin
        // comprobar no prueba nada.
        huellaVerificada: verificada,
      });
      if (!verificada) sinVerificar.push({ id: entrada.id, nombre: entrada.nombre });
    } catch (error) {
      fallos.push({ id: entrada.id, nombre: entrada.nombre, error: error.message });
    }
    hecho++;
    if (opciones.alProgresar) opciones.alProgresar(hecho, seleccionadas.length, entrada.id);
  }

  return { listas, fallos, sinVerificar, sePuedeVerificar: sePuedeVerificar() };
}

async function cargarLista(entrada) {
  const url = new URL(entrada.archivo, BASE).href;
  // El sha256 va en la cadena de consulta, no en un fragmento: la Cache API
  // descarta los fragmentos al construir la petición, así que con '#' todas
  // las versiones colapsarían en la misma entrada y la lista vieja se
  // seguiría sirviendo para siempre.
  const clave = claveCache(entrada);

  // Se trabaja con los bytes y no con el objeto ya interpretado porque la
  // huella del manifiesto es la del archivo tal cual se publicó: volver a
  // serializar el JSON daría otro hash aunque el contenido fuera el mismo.
  const guardado = await leerBytesDeCache(clave);
  if (guardado) {
    const revision = await revisarHuella(entrada.sha256, guardado);
    if (revision.ok) return { datos: interpretar(guardado), verificada: revision.verificada };
    // La copia local no es la que dice ser. Se descarta en vez de servirla:
    // es exactamente el «sin hallazgos» falso que hay que evitar.
    await borrarDeCache(clave);
  }

  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al cargar ${entrada.archivo}`);
  const bytes = await respuesta.arrayBuffer();

  const revision = await revisarHuella(entrada.sha256, bytes);
  if (!revision.ok) throw new Error(revision.motivo);

  await guardarBytesEnCache(clave, bytes);
  return { datos: interpretar(bytes), verificada: revision.verificada };
}

function interpretar(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- caché ----------
 * La Cache API no existe en contextos no seguros. Si falta, todo sigue
 * funcionando: solo se pierde la caché entre recargas.
 */

async function abrirCache() {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function leerDeCache(clave) {
  const cache = await abrirCache();
  if (!cache) return null;
  try {
    const respuesta = await cache.match(clave);
    return respuesta ? await respuesta.json() : null;
  } catch {
    return null;
  }
}

async function leerBytesDeCache(clave) {
  const cache = await abrirCache();
  if (!cache) return null;
  try {
    const respuesta = await cache.match(clave);
    return respuesta ? await respuesta.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function guardarBytesEnCache(clave, bytes) {
  const cache = await abrirCache();
  if (!cache) return;
  try {
    await cache.put(
      clave,
      new Response(bytes, { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch {
    // Cuota llena o modo privado: no es motivo para interrumpir la consulta.
  }
}

async function borrarDeCache(clave) {
  const cache = await abrirCache();
  if (!cache) return;
  try {
    await cache.delete(clave);
  } catch {
    // Si no se puede borrar, la próxima descarga la volverá a rechazar.
  }
}

async function guardarEnCache(clave, datos) {
  const cache = await abrirCache();
  if (!cache) return;
  try {
    await cache.put(
      clave,
      new Response(JSON.stringify(datos), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    // Cuota llena o modo privado: no es motivo para interrumpir la consulta.
  }
}

/** Clave de caché de una lista: su URL más la huella de la versión. */
export function claveCache(entrada) {
  const url = new URL(entrada.archivo, BASE);
  url.searchParams.set('sha', entrada.sha256 || 'sin-hash');
  return url.href;
}

/** Borra las entradas de listas que ya no figuran en el manifiesto vigente. */
export async function limpiarCache(manifiesto) {
  const cache = await abrirCache();
  if (!cache) return 0;
  const vigentes = new Set(
    (manifiesto.listas || []).filter((l) => l.archivo).map(claveCache),
  );
  vigentes.add(new URL('manifest.json', BASE).href);

  let borradas = 0;
  for (const peticion of await cache.keys()) {
    if (!vigentes.has(peticion.url)) {
      if (await cache.delete(peticion)) borradas++;
    }
  }
  return borradas;
}

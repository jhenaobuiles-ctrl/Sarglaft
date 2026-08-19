// Copia de seguridad del expediente completo.
//
// El registro vive solo en el IndexedDB de este navegador: no hay servidor
// que lo respalde. Si se borran los datos del sitio, se cambia de equipo o se
// reinstala el sistema operativo, lo que no se haya exportado se perdió.
//
// La copia va en ZIP y no en JSON porque las evidencias —los certificados en
// PDF de la Procuraduría, las capturas de pantalla— son binarias. La versión
// anterior exportaba solo el JSON y avisaba de que los adjuntos quedaban
// fuera; eso dejaba una copia que probaba que la consulta se hizo pero no lo
// que la sustentaba, que es justo lo que pide un auditor.

import { todos, guardarVarios, escribirConfig, ALMACENES } from './db.js';
import { crearZip, leerZip, textoDe } from '../lib/zip.js';
import { escribirCSV } from '../lib/csv.js';

export const FORMATO = 'sarglaft-respaldo';
export const VERSION_RESPALDO = 2;

const CARPETA_EVIDENCIAS = 'evidencias';
// Excel no reconoce el UTF-8 de un CSV si no encuentra esta marca al inicio.
const BOM = '\uFEFF';

/**
 * Nombre de archivo seguro en cualquier sistema.
 *
 * Windows rechaza los caracteres \ / : * ? " < > |, y una evidencia llamada
 * "Certificado 12/08/2026.pdf" saldría del ZIP convertida en carpetas.
 */
export function nombreSeguro(valor, porOmision = 'evidencia') {
  const limpio = String(valor || '')
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return limpio || porOmision;
}

/** Marca de tiempo apta para nombres de archivo. */
export function marcaArchivo(fecha = new Date()) {
  return fecha.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/**
 * Arma la copia completa.
 *
 * @param {object} perfil datos de la empresa, para el LEEME
 * @param {(hecho: number, total: number) => void} [alProgresar]
 */
export async function construirRespaldo(perfil = {}, alProgresar = null) {
  const [consultas, cruces, obligaciones, documentos, evidencias] = await Promise.all([
    todos(ALMACENES.consultas),
    todos(ALMACENES.cruces),
    todos(ALMACENES.obligaciones),
    todos(ALMACENES.documentos),
    todos(ALMACENES.evidencias),
  ]);

  const entradas = [];
  const fichas = [];
  const usados = new Set();

  for (const evidencia of evidencias) {
    // El identificador va delante del nombre: dos consultas distintas suelen
    // adjuntar archivos que se llaman igual ("certificado.pdf") y sin el
    // prefijo uno pisaría al otro dentro del ZIP.
    let ruta = `${CARPETA_EVIDENCIAS}/${nombreSeguro(evidencia.id, 'e')}__${nombreSeguro(
      evidencia.nombreArchivo,
      'evidencia',
    )}`;
    let intento = 2;
    while (usados.has(ruta)) ruta = `${ruta}-${intento++}`;
    usados.add(ruta);

    entradas.push({
      nombre: ruta,
      datos: evidencia.archivo,
      fecha: new Date(evidencia.fecha || Date.now()),
    });
    // La ficha guarda todo menos el binario, que ya va como archivo del ZIP.
    const { archivo, ...resto } = evidencia;
    fichas.push({ ...resto, rutaEnZip: ruta });
    if (alProgresar) alProgresar(entradas.length, evidencias.length);
  }

  const contenido = {
    formato: FORMATO,
    version: VERSION_RESPALDO,
    generado: new Date().toISOString(),
    perfil,
    consultas,
    cruces,
    obligaciones,
    documentos,
    evidencias: fichas,
  };

  entradas.unshift(
    { nombre: 'respaldo.json', datos: JSON.stringify(contenido, null, 2) },
    { nombre: 'expediente.csv', datos: BOM + csvDeConsultas(consultas) },
    { nombre: 'LEEME.txt', datos: leeme(contenido, perfil) },
  );

  return {
    blob: await crearZip(entradas),
    nombre: `respaldo-sarlaft-${marcaArchivo()}.zip`,
    consultas: consultas.length,
    documentos: documentos.length,
    evidencias: evidencias.length,
  };
}

/**
 * Lee una copia, sea el ZIP actual o el JSON que exportaban las versiones
 * anteriores. Descartar los JSON viejos dejaría sin restaurar las copias que
 * ya se hicieron.
 */
export async function leerRespaldo(archivo) {
  const esZip = /\.zip$/i.test(archivo.name || '') || archivo.type === 'application/zip';
  if (!esZip) {
    const contenido = validar(JSON.parse(await archivo.text()));
    return { contenido, evidencias: [] };
  }

  const partes = await leerZip(archivo);
  const json = partes.get('respaldo.json');
  if (!json) throw new Error('El ZIP no contiene el archivo respaldo.json.');
  const contenido = validar(JSON.parse(textoDe(json)));

  const evidencias = [];
  for (const ficha of contenido.evidencias || []) {
    const bytes = ficha.rutaEnZip ? partes.get(ficha.rutaEnZip) : null;
    // Una evidencia sin su archivo se señala en vez de descartarse: es mejor
    // saber que faltó a que desaparezca en silencio.
    evidencias.push({
      ...ficha,
      archivo: bytes ? new Blob([bytes], { type: ficha.tipoArchivo || '' }) : null,
      archivoFaltante: !bytes,
    });
  }
  return { contenido, evidencias };
}

function validar(contenido) {
  if (!contenido || contenido.formato !== FORMATO) {
    throw new Error('El archivo no es una copia de seguridad de este panel.');
  }
  if (Number(contenido.version) > VERSION_RESPALDO) {
    throw new Error(
      `La copia se hizo con una versión más nueva del panel (v${contenido.version}). ` +
        'Actualiza el panel antes de restaurarla.',
    );
  }
  return contenido;
}

/**
 * Escribe la copia en el registro local.
 *
 * Fusiona en vez de reemplazar: quien restaura sobre un equipo que ya tiene
 * consultas no debería perderlas. Lo que coincide en identificador se
 * sobrescribe, que es lo esperable al restaurar la misma máquina.
 */
export async function restaurar({ contenido, evidencias }, perfilActual = {}) {
  const conteos = {
    consultas: (contenido.consultas || []).length,
    cruces: (contenido.cruces || []).length,
    obligaciones: (contenido.obligaciones || []).length,
    documentos: (contenido.documentos || []).length,
    evidencias: evidencias.filter((e) => e.archivo).length,
    evidenciasSinArchivo: evidencias.filter((e) => !e.archivo).length,
  };

  await guardarVarios(ALMACENES.consultas, contenido.consultas || []);
  await guardarVarios(ALMACENES.cruces, contenido.cruces || []);
  await guardarVarios(ALMACENES.obligaciones, contenido.obligaciones || []);
  await guardarVarios(ALMACENES.documentos, contenido.documentos || []);
  await guardarVarios(
    ALMACENES.evidencias,
    evidencias
      .filter((e) => e.archivo)
      .map(({ archivoFaltante, rutaEnZip, ...evidencia }) => evidencia),
  );

  conteos.perfil = null;
  if (contenido.perfil && equipoSinConfigurar(perfilActual)) {
    conteos.perfil = { ...perfilActual, ...contenido.perfil };
    await escribirConfig('perfil', conteos.perfil);
  }
  return conteos;
}

/**
 * ¿Este equipo tiene perfil propio?
 *
 * El perfil —empresa, NIT, responsable, marco normativo— solo se restaura si
 * no lo tiene. Sin esto, restaurar en una máquina recién puesta devolvía los
 * documentos pero no quién los firma, y salían impresos sin responsable;
 * pisar el perfil de un equipo ya configurado sería el error contrario.
 */
export function equipoSinConfigurar(perfil = {}) {
  return !String(perfil.responsable || '').trim() && !String(perfil.nit || '').trim();
}

export async function anotarCopia(nombre) {
  await escribirConfig('ultimaCopia', { fecha: new Date().toISOString(), nombre });
}

/**
 * Días transcurridos desde la última copia, o null si nunca se hizo una.
 * El panel lo usa para avisar antes de que el olvido sea irreversible.
 */
export function diasDesde(marca, ahora = new Date()) {
  if (!marca?.fecha) return null;
  const fecha = new Date(marca.fecha);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.floor((ahora - fecha) / 86400000);
}

/* ---------- piezas legibles dentro del ZIP ---------- */

const ROTULOS_RESULTADO = {
  ALERTA: 'Con alerta',
  EN_REVISION: 'En revisión',
  SIN_HALLAZGOS: 'Sin hallazgos',
};

function csvDeConsultas(consultas) {
  const filas = [
    ['Fecha', 'Contraparte', 'Tipo documento', 'Documento', 'Origen', 'Resultado', 'Coincidencias', 'Responsable', 'Observaciones', 'Identificador'],
    ...consultas.map((c) => [
      c.fecha || '',
      c.consulta?.nombre || '',
      c.consulta?.tipoDocumento || '',
      c.consulta?.documento || '',
      c.tipo || '',
      ROTULOS_RESULTADO[c.resultado] || c.resultado || '',
      (c.coincidencias || []).length,
      c.responsable || '',
      c.observaciones || '',
      c.id || '',
    ]),
  ];
  // Punto y coma: es lo que espera el Excel en configuración regional española.
  return escribirCSV(filas, ';');
}

function leeme(contenido, perfil) {
  return [
    'COPIA DE SEGURIDAD — PANEL SARLAFT',
    '='.repeat(60),
    '',
    `Empresa:   ${perfil.empresa || '(sin definir)'}`,
    `NIT:       ${perfil.nit || '(sin definir)'}`,
    `Generada:  ${contenido.generado}`,
    '',
    'CONTENIDO',
    `  respaldo.json   ${contenido.consultas.length} consulta(s), ${contenido.cruces.length} cruce(s),`,
    `                  ${contenido.documentos.length} documento(s) y las fichas de las evidencias.`,
    '  expediente.csv  El mismo historial en una tabla que abre Excel.',
    `  evidencias/     ${contenido.evidencias.length} archivo(s) adjunto(s).`,
    '',
    'CÓMO RESTAURARLA',
    '  Abre el panel, entra en "Expediente de consultas" y pulsa "Restaurar copia".',
    '  Selecciona este mismo archivo .zip, sin descomprimirlo.',
    '',
    'AVISOS',
    '  · Este archivo contiene datos personales de las contrapartes consultadas.',
    '    Guárdalo donde solo pueda abrirlo quien deba (Ley 1581 de 2012) y no lo',
    '    subas a un repositorio ni a una carpeta compartida abierta.',
    '  · El expediente vive únicamente en el navegador donde se hicieron las',
    '    consultas. Esta copia es la única forma de recuperarlo.',
    '  · El CSV y los PDF se leen sin el panel: si algún día el panel deja de',
    '    existir, la evidencia sigue siendo utilizable.',
    '',
  ].join('\n');
}

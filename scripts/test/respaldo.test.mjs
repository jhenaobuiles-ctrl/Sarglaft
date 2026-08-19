import test from 'node:test';
import assert from 'node:assert/strict';
import { crearZip } from '../../app/lib/zip.js';
import {
  nombreSeguro, diasDesde, leerRespaldo, equipoSinConfigurar, FORMATO, VERSION_RESPALDO,
} from '../../app/registro/respaldo.js';

/** Simula el File que entrega el selector de archivos del navegador. */
function comoArchivo(blob, name) {
  return Object.assign(blob, { name });
}

test('nombreSeguro no deja que un nombre de evidencia cree carpetas', () => {
  // "Certificado 12/08/2026.pdf" saldría del ZIP como tres carpetas anidadas.
  assert.equal(nombreSeguro('Certificado 12/08/2026.pdf'), 'Certificado 12_08_2026.pdf');
  assert.equal(nombreSeguro('a\\b:c*d?e"f<g>h|i'), 'a_b_c_d_e_f_g_h_i');
  // Ni barras ni puntos iniciales: al descomprimir con cualquier programa, el
  // archivo cae dentro de la carpeta de evidencias y no fuera de ella.
  assert.equal(nombreSeguro('../../etc/passwd'), '__.._etc_passwd');
});

test('nombreSeguro conserva tildes y eñes', () => {
  assert.equal(nombreSeguro('Certificación Peña.pdf'), 'Certificación Peña.pdf');
});

test('nombreSeguro devuelve algo cuando no queda nada', () => {
  assert.equal(nombreSeguro(''), 'evidencia');
  assert.equal(nombreSeguro(null, 'e'), 'e');
});

test('diasDesde cuenta desde la última copia', () => {
  const ahora = new Date('2026-08-19T12:00:00Z');
  assert.equal(diasDesde({ fecha: '2026-08-19T09:00:00Z' }, ahora), 0);
  assert.equal(diasDesde({ fecha: '2026-07-20T12:00:00Z' }, ahora), 30);
  // Nunca se ha exportado: el panel avisa distinto en ese caso.
  assert.equal(diasDesde(null, ahora), null);
  assert.equal(diasDesde({ fecha: 'no es una fecha' }, ahora), null);
});

test('leerRespaldo recupera el JSON y sus evidencias del ZIP', async () => {
  const contenido = {
    formato: FORMATO,
    version: VERSION_RESPALDO,
    generado: '2026-08-19T12:00:00.000Z',
    perfil: { empresa: 'Escuela AC de Conducción SAS' },
    consultas: [{ id: 'c_1', resultado: 'ALERTA' }],
    cruces: [],
    obligaciones: [],
    documentos: [{ id: 'd_1', plantilla: 'manual' }],
    evidencias: [
      { id: 'e_1', consultaId: 'c_1', nombreArchivo: 'procuraduría.pdf', tipoArchivo: 'application/pdf', rutaEnZip: 'evidencias/e_1__procuraduría.pdf' },
    ],
  };
  const zip = await crearZip([
    { nombre: 'respaldo.json', datos: JSON.stringify(contenido) },
    { nombre: 'evidencias/e_1__procuraduría.pdf', datos: new Uint8Array([37, 80, 68, 70]) },
  ]);

  const copia = await leerRespaldo(comoArchivo(zip, 'respaldo-sarlaft.zip'));
  assert.equal(copia.contenido.consultas.length, 1);
  assert.equal(copia.contenido.documentos.length, 1);
  assert.equal(copia.evidencias.length, 1);
  assert.equal(copia.evidencias[0].archivoFaltante, false);
  assert.deepEqual(
    [...new Uint8Array(await copia.evidencias[0].archivo.arrayBuffer())],
    [37, 80, 68, 70],
  );
});

test('una evidencia sin su archivo se marca en vez de desaparecer', async () => {
  const contenido = {
    formato: FORMATO,
    version: VERSION_RESPALDO,
    consultas: [],
    evidencias: [{ id: 'e_1', nombreArchivo: 'x.pdf', rutaEnZip: 'evidencias/no-esta.pdf' }],
  };
  const zip = await crearZip([{ nombre: 'respaldo.json', datos: JSON.stringify(contenido) }]);
  const copia = await leerRespaldo(comoArchivo(zip, 'r.zip'));

  assert.equal(copia.evidencias.length, 1);
  assert.equal(copia.evidencias[0].archivo, null);
  assert.equal(copia.evidencias[0].archivoFaltante, true);
});

test('sigue leyendo las copias .json de la versión anterior', async () => {
  const json = JSON.stringify({
    formato: FORMATO,
    version: 1,
    consultas: [{ id: 'c_1' }, { id: 'c_2' }],
    evidenciasNoIncluidas: 3,
  });
  const copia = await leerRespaldo(comoArchivo(new Blob([json]), 'respaldo-viejo.json'));
  assert.equal(copia.contenido.consultas.length, 2);
  assert.deepEqual(copia.evidencias, []);
});

test('rechaza un archivo que no es una copia de este panel', async () => {
  const zip = await crearZip([{ nombre: 'otra-cosa.txt', datos: 'hola' }]);
  await assert.rejects(() => leerRespaldo(comoArchivo(zip, 'x.zip')), /no contiene el archivo respaldo\.json/);

  const ajeno = JSON.stringify({ formato: 'otro-programa', consultas: [] });
  await assert.rejects(
    () => leerRespaldo(comoArchivo(new Blob([ajeno]), 'x.json')),
    /no es una copia de seguridad de este panel/,
  );
});

test('avisa cuando la copia viene de una versión más nueva del panel', async () => {
  const json = JSON.stringify({ formato: FORMATO, version: VERSION_RESPALDO + 1, consultas: [] });
  await assert.rejects(
    () => leerRespaldo(comoArchivo(new Blob([json]), 'x.json')),
    /versión más nueva del panel/,
  );
});

test('el perfil de la copia solo se aplica si el equipo no tiene uno propio', () => {
  // Restaurar en un equipo recién puesto devolvía los documentos pero no
  // quién los firma, y se imprimían sin responsable ni marco normativo.
  assert.equal(equipoSinConfigurar({}), true);
  assert.equal(equipoSinConfigurar({ empresa: 'Escuela AC de Conducción SAS' }), true);
  assert.equal(equipoSinConfigurar({ responsable: '  ' }), true);
  // Y no se pisa el perfil de un equipo que ya está configurado.
  assert.equal(equipoSinConfigurar({ responsable: 'Alexa Claudia Diago' }), false);
  assert.equal(equipoSinConfigurar({ nit: '900123456-7' }), false);
});

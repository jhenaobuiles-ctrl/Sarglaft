import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarPegado, pareceDocumento, resumirPegado } from '../../app/lib/pegado.js';

const filas = (texto) => interpretarPegado(texto).filas;

test('una columna de cédulas pegada tal cual', () => {
  const salida = filas('79123456\n1.144.087.221\n  16215230  ');
  assert.equal(salida.length, 3);
  assert.deepEqual(salida.map((f) => f.documento), ['79123456', '1.144.087.221', '16215230']);
  assert.deepEqual(salida.map((f) => f.nombre), ['', '', '']);
});

test('una columna de nombres pegada tal cual', () => {
  const salida = filas('María Fernanda Gómez\nJuan Carlos Restrepo Ospina');
  assert.deepEqual(salida.map((f) => f.nombre), ['María Fernanda Gómez', 'Juan Carlos Restrepo Ospina']);
  assert.deepEqual(salida.map((f) => f.documento), ['', '']);
});

test('dos columnas copiadas de Excel llegan separadas por tabulador', () => {
  const salida = filas('María Fernanda Gómez\t79123456\nJuan Restrepo\t1144087221');
  assert.deepEqual(salida[0], { linea: 1, nombre: 'María Fernanda Gómez', documento: '79123456' });
  assert.deepEqual(salida[1], { linea: 2, nombre: 'Juan Restrepo', documento: '1144087221' });
});

test('da igual el orden de las columnas', () => {
  // Nadie copia siempre la cédula en la misma posición: se reparte por
  // contenido, no por el sitio que ocupa cada campo.
  const salida = filas('79123456\tMaría Fernanda Gómez');
  assert.equal(salida[0].nombre, 'María Fernanda Gómez');
  assert.equal(salida[0].documento, '79123456');
});

test('omite la fila de encabezado arrastrada con los datos', () => {
  const salida = interpretarPegado('Nombre\tCédula\nMaría Gómez\t79123456');
  assert.equal(salida.encabezadoOmitido, true);
  assert.equal(salida.filas.length, 1);
  assert.equal(salida.filas[0].nombre, 'María Gómez');
});

test('no confunde un nombre con un encabezado', () => {
  const salida = interpretarPegado('María Gómez\t79123456\nPedro Pérez\t1020304050');
  assert.equal(salida.encabezadoOmitido, false);
  assert.equal(salida.filas.length, 2);
});

test('los apellidos con coma no se parten en dos', () => {
  // "PEREZ, JUAN" es un nombre, no dos columnas. Por eso la coma es el último
  // separador que se prueba y el tabulador manda.
  const salida = filas('GOMEZ RESTREPO, MARIA FERNANDA\t79123456');
  assert.equal(salida[0].nombre, 'GOMEZ RESTREPO, MARIA FERNANDA');
  assert.equal(salida[0].documento, '79123456');
});

test('descarta líneas en blanco y no cuenta de más', () => {
  const salida = interpretarPegado('79123456\n\n   \n1020304050\n');
  assert.equal(salida.filas.length, 2);
});

test('no repite la misma contraparte dentro del mismo pegado', () => {
  // El mismo documento escrito de dos formas es la misma persona.
  const salida = interpretarPegado('79.123.456\n79123456\n0079123456\n1020304050');
  assert.equal(salida.filas.length, 2);
  assert.equal(salida.repetidas, 2);
});

test('conserva el número de línea para poder señalar dónde estaba', () => {
  const salida = filas('Nombre\n\nMaría Gómez\nPedro Pérez');
  assert.deepEqual(salida.map((f) => f.linea), [3, 4]);
});

test('pareceDocumento distingue una cédula de un dato suelto', () => {
  assert.equal(pareceDocumento('79123456'), true);
  assert.equal(pareceDocumento('79.123.456'), true);
  assert.equal(pareceDocumento('900123456-7'), true);
  assert.equal(pareceDocumento('1 144 087 221'), true);
  // Demasiado corto para ser un documento: es un consecutivo o una edad.
  assert.equal(pareceDocumento('42'), false);
  assert.equal(pareceDocumento('María Gómez'), false);
  assert.equal(pareceDocumento(''), false);
  assert.equal(pareceDocumento('79123456A'), false);
});

test('un pegado vacío no rompe nada', () => {
  const salida = interpretarPegado('');
  assert.deepEqual(salida.filas, []);
  assert.equal(salida.repetidas, 0);
  assert.equal(interpretarPegado(null).filas.length, 0);
});

test('el resumen dice lo que el panel entendió', () => {
  const salida = interpretarPegado('Nombre\tCedula\nMaría Gómez\t79123456\nPedro Pérez\n79123456');
  const texto = resumirPegado(salida);
  assert.match(texto, /2 contraparte\(s\)/);
  assert.match(texto, /1 con documento/);
  assert.match(texto, /1 solo con nombre/);
  assert.match(texto, /1 repetida/);
  assert.match(texto, /encabezado/);
});

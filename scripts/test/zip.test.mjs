import test from 'node:test';
import assert from 'node:assert/strict';
import { crearZip, leerZip, crc32, textoDe } from '../../app/lib/zip.js';

const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

test('crc32 coincide con el valor conocido de la especificación', () => {
  // Valor de referencia del CRC-32 de "123456789"; si la tabla se rompe, el
  // ZIP se escribe igual y falla al abrirlo, que es un fallo mudo.
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('un ZIP de ida y vuelta devuelve el mismo contenido', async () => {
  const zip = await crearZip([
    { nombre: 'respaldo.json', datos: JSON.stringify({ consultas: [1, 2, 3] }) },
    { nombre: 'evidencias/certificación.pdf', datos: new Uint8Array([1, 2, 3, 4, 5]) },
  ]);
  const leido = await leerZip(await bytesDe(zip));

  assert.deepEqual([...leido.keys()], ['respaldo.json', 'evidencias/certificación.pdf']);
  assert.deepEqual(JSON.parse(textoDe(leido.get('respaldo.json'))), { consultas: [1, 2, 3] });
  assert.deepEqual([...leido.get('evidencias/certificación.pdf')], [1, 2, 3, 4, 5]);
});

test('el texto repetitivo se comprime y el binario incompresible no', async () => {
  const repetido = 'SARLAFT '.repeat(4000);
  const zip = await crearZip([{ nombre: 'a.txt', datos: repetido }]);
  assert.ok(zip.size < repetido.length / 4, `el ZIP no comprimió: ${zip.size} bytes`);

  // Bytes seudoaleatorios: desinflarlos los deja más grandes, y guardarlos
  // sin comprimir es justo lo que hay que hacer con un PDF o un JPEG.
  const ruido = new Uint8Array(20000);
  let semilla = 7;
  for (let i = 0; i < ruido.length; i++) {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    ruido[i] = semilla & 0xff;
  }
  const zipRuido = await crearZip([{ nombre: 'b.bin', datos: ruido }]);
  assert.ok(zipRuido.size < ruido.length + 300, `creció de más: ${zipRuido.size}`);
  const leido = await leerZip(await bytesDe(zipRuido));
  assert.deepEqual(leido.get('b.bin'), ruido);
});

test('los nombres con tildes y eñes sobreviven', async () => {
  const nombre = 'evidencias/e_1__Certificación Procuraduría — Peña Ñ.pdf';
  const zip = await crearZip([{ nombre, datos: 'x' }]);
  const leido = await leerZip(await bytesDe(zip));
  assert.ok(leido.has(nombre));
});

test('un ZIP vacío se escribe y se lee sin romperse', async () => {
  const zip = await crearZip([]);
  assert.equal((await leerZip(await bytesDe(zip))).size, 0);
});

test('un archivo que no es ZIP se rechaza con un mensaje entendible', async () => {
  await assert.rejects(
    () => leerZip(new TextEncoder().encode('esto es un PDF, no un ZIP')),
    /no es un ZIP válido/,
  );
});

test('acepta Blob además de bytes y texto', async () => {
  const zip = await crearZip([{ nombre: 'x.bin', datos: new Blob([new Uint8Array([9, 9])]) }]);
  const leido = await leerZip(zip);
  assert.deepEqual([...leido.get('x.bin')], [9, 9]);
});

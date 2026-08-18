import test from 'node:test';
import assert from 'node:assert/strict';
import { registro, fechaISO } from '../lib/registro.mjs';

test('fechaISO respeta la convención declarada por la fuente', () => {
  // La misma cadena, dos fechas distintas. Es el bug que este parámetro evita.
  assert.equal(fechaISO('12/11/1965', 'MDA'), '1965-12-11');
  assert.equal(fechaISO('12/11/1965', 'DMA'), '1965-11-12');
});

test('fechaISO corrige una convención mal declarada cuando el día delata', () => {
  // 25 no puede ser un mes: manda el dato sobre la etiqueta de la fuente.
  assert.equal(fechaISO('25/03/1980', 'MDA'), '1980-03-25');
  assert.equal(fechaISO('03/25/1980', 'DMA'), '1980-03-25');
});

test('fechaISO entiende los formatos con mes en letras', () => {
  assert.equal(fechaISO('12 Nov 1965'), '1965-11-12');
  assert.equal(fechaISO('07-MAY-2024'), '2024-05-07');
  assert.equal(fechaISO('2003-01-28'), '2003-01-28');
  assert.equal(fechaISO('2003-1-8'), '2003-01-08');
});

test('fechaISO conserva las fechas parciales en lugar de inventar un día', () => {
  assert.equal(fechaISO('1965'), '1965');
  assert.equal(fechaISO('Nov 1965'), '1965-11');
});

test('fechaISO devuelve lo que no entiende, sin romperse', () => {
  assert.equal(fechaISO('circa 1965'), 'circa 1965');
  assert.equal(fechaISO(''), '');
  assert.equal(fechaISO(null), '');
});

test('registro omite los campos vacíos para no inflar el archivo', () => {
  const r = registro({ id: 'X-1', tipo: 'E', nombre: '  Acme   S.A.  ' });
  assert.deepEqual(r, { i: 'X-1', t: 'E', n: 'Acme S.A.' });
});

test('registro descarta el alias que repite el nombre principal', () => {
  const r = registro({ id: 'X-1', tipo: 'P', nombre: 'Juan Perez', alias: ['Juan Perez', 'Juanito'] });
  assert.deepEqual(r.a, ['Juanito']);
});

test('registro deduplica documentos y descarta los que no traen número', () => {
  const r = registro({
    id: 'X-1',
    tipo: 'P',
    nombre: 'Juan Perez',
    documentos: [
      { tipo: 'Cedula', numero: '79123456' },
      { tipo: 'Cedula', numero: '79123456' },
      { tipo: 'Pasaporte', numero: '' },
    ],
  });
  assert.deepEqual(r.d, [{ n: '79123456', t: 'Cedula' }]);
});

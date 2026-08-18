import test from 'node:test';
import assert from 'node:assert/strict';
import { fechaCorta } from '../../app/ui/formato.js';

test('fechaCorta no corre un día las fechas de publicación', () => {
  // El error que motiva esta prueba: construir la fecha en hora local y
  // formatearla en hora de Colombia (UTC-5) imprimía el 17 como 16, es decir
  // el certificado citaba una versión de la lista distinta de la consultada.
  assert.match(fechaCorta('2026-08-17'), /17/);
  assert.match(fechaCorta('2026-01-01'), /1/);
  assert.match(fechaCorta('2026-12-31'), /31/);
});

test('fechaCorta respeta las fechas parciales sin inventar un día', () => {
  assert.equal(fechaCorta('1965'), '1965');
  assert.equal(fechaCorta('1965-11'), '1965-11');
});

test('fechaCorta tolera lo vacío y lo que no entiende', () => {
  assert.equal(fechaCorta(''), '—');
  assert.equal(fechaCorta('circa 1980'), 'circa 1980');
});

test('fechaCorta no convierte texto ambiguo en una fecha concreta', () => {
  // `new Date('circa 1980')` devuelve una fecha real: sin este corte, el
  // certificado imprimía "31/12/1979" para una fecha de nacimiento que la
  // fuente dejó sin precisar.
  assert.equal(fechaCorta('circa 1980'), 'circa 1980');
  assert.equal(fechaCorta('entre 1970 y 1975'), 'entre 1970 y 1975');
});

test('fechaCorta sí formatea las marcas de tiempo completas', () => {
  assert.match(fechaCorta('2026-08-18T15:07:36.791Z'), /2026/);
});

import { explicacionDe, TITULOS_CERTIFICADO, etiquetaPEP } from '../../app/ui/formato.js';

test('el veredicto se explica según lo que se consultó de verdad', () => {
  // Una constancia de antecedentes no cruza listas: hablar de "coincidencia
  // fuerte" ahí describe algo que no ocurrió.
  const listas = explicacionDe({ tipo: 'puntual', resultado: 'ALERTA' });
  const antecedentes = explicacionDe({ tipo: 'antecedentes', resultado: 'ALERTA' });
  assert.match(listas, /coincidencia/i);
  assert.match(antecedentes, /entidades consultadas/i);
  assert.doesNotMatch(antecedentes, /coincidencia/i);
});

test('el certificado no se titula como consulta de listas si no las consultó', () => {
  assert.match(TITULOS_CERTIFICADO.puntual, /listas restrictivas/i);
  assert.doesNotMatch(TITULOS_CERTIFICADO.antecedentes, /listas restrictivas/i);
});

test('etiquetaPEP distingue al PEP de su entorno y deja vacío lo no declarado', () => {
  assert.match(etiquetaPEP('pep'), /Persona expuesta/);
  assert.match(etiquetaPEP('vinculado'), /Familiar o asociado/);
  assert.equal(etiquetaPEP(''), '');
  assert.equal(etiquetaPEP('cualquier-cosa'), '');
});

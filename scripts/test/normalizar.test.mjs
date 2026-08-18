import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNombre,
  normalizarRazonSocial,
  normalizarDocumento,
  tokensSignificativos,
  variantesDocumento,
} from '../../app/motor/normalizar.js';

test('normalizarNombre quita tildes, puntuación y mayúsculas', () => {
  assert.equal(normalizarNombre('José Peña-Gómez, Jr.'), 'JOSE PENA GOMEZ JR');
  assert.equal(normalizarNombre('  múltiples   espacios  '), 'MULTIPLES ESPACIOS');
  assert.equal(normalizarNombre(''), '');
  assert.equal(normalizarNombre(null), '');
});

test('normalizarNombre iguala Ñ y N', () => {
  // Deliberado: las fuentes extranjeras transcriben los apellidos españoles
  // sin virgulilla y tienen que caer en la misma clave.
  assert.equal(normalizarNombre('Peña'), normalizarNombre('Pena'));
});

test('normalizarRazonSocial recorta la forma societaria escrita de cualquier modo', () => {
  const esperado = 'COMERCIALIZADORA ANDINA';
  for (const variante of [
    'Comercializadora Andina S.A.S.',
    'Comercializadora Andina SAS',
    'COMERCIALIZADORA ANDINA S A S',
    'Comercializadora Andina Ltda',
  ]) {
    assert.equal(normalizarRazonSocial(variante), esperado, variante);
  }
});

test('normalizarRazonSocial arrastra el conector que queda colgando', () => {
  assert.equal(normalizarRazonSocial('Inversiones Lopez y Cia Ltda'), 'INVERSIONES LOPEZ');
});

test('normalizarRazonSocial no vacía un nombre que es solo la forma societaria', () => {
  assert.equal(normalizarRazonSocial('SAS'), 'SAS');
  assert.equal(normalizarRazonSocial('Grupo'), 'GRUPO');
});

test('normalizarDocumento iguala las formas de escribir una cédula', () => {
  const esperado = '79123456';
  for (const v of ['79.123.456', '79123456', '0079123456', '79 123 456', '79-123-456']) {
    assert.equal(normalizarDocumento(v), esperado, v);
  }
});

test('normalizarDocumento conserva los alfanuméricos de pasaporte', () => {
  assert.equal(normalizarDocumento('AB-123 456'), 'AB123456');
});

test('variantesDocumento solo quita el dígito de verificación al NIT', () => {
  assert.deepEqual(variantesDocumento('900123456-7', 'NIT'), ['9001234567', '900123456']);
  // Recortarle el último dígito a una cédula produciría la cédula de otra
  // persona: por eso nunca se hace fuera del NIT.
  assert.deepEqual(variantesDocumento('1234567890', 'Cédula de ciudadanía'), ['1234567890']);
});

test('tokensSignificativos descarta partículas', () => {
  assert.deepEqual(tokensSignificativos('MARIA DE LOS ANGELES RESTREPO OSPINA'), [
    'MARIA', 'ANGELES', 'RESTREPO', 'OSPINA',
  ]);
});

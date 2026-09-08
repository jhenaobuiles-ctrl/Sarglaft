import test from 'node:test';
import assert from 'node:assert/strict';
import { contratoDeNormalizacion } from '../contrato-normalizacion.mjs';

// Lo que estas pruebas cuidan no es el formato del bloque: es que los casos
// publicados sigan cubriendo las decisiones que al perderse no rompen nada
// visible. Un contrato al que se le cae el caso de la Ñ deja de detectar
// justamente el fallo para el que existe.

const contrato = contratoDeNormalizacion();
const por = (entrada) => contrato.casos.find((c) => c.entrada === entrada);

test('el contrato se publica con versión y casos', () => {
  assert.equal(typeof contrato.version, 'number');
  assert.ok(contrato.casos.length >= 10);
  for (const caso of contrato.casos) {
    assert.ok(caso.entrada, 'hay un caso sin entrada');
    const salidas = Object.keys(caso).filter((k) => k !== 'entrada');
    assert.ok(salidas.length > 0, `${caso.entrada}: no ejercita ninguna función`);
  }
});

test('cubre que la Ñ y la N caen en la misma clave', () => {
  // Las fuentes extranjeras transcriben los apellidos españoles sin virgulilla.
  // Si un puerto conserva la Ñ, "PEÑA" deja de encontrar a "PENA" y nadie se
  // entera.
  assert.equal(por('Peña').nombre, por('Pena').nombre);
});

test('cubre los ceros a la izquierda de una cédula', () => {
  assert.equal(por('0079.123.456').documento, '79123456');
  assert.equal(por('79 123 456').documento, '79123456');
});

test('cubre el recorte de la forma societaria', () => {
  assert.equal(
    por('Comercializadora Andina S.A.S.').razonSocial,
    por('COMERCIALIZADORA ANDINA S A S').razonSocial,
  );
});

test('cubre que solo el NIT pierde su dígito de verificación', () => {
  // Recortarle el último dígito a una cédula produce la cédula de otra persona.
  assert.equal(por('900228328-7').variantesNit.length, 2);
  assert.equal(por('1144087221').variantesCedula.length, 1);
});

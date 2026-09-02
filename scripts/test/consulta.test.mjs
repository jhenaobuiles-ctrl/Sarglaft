import test from 'node:test';
import assert from 'node:assert/strict';
import { crearMotor, NIVEL, UMBRALES } from '../../app/motor/consulta.js';

const listas = [
  {
    id: 'prueba',
    nombre: 'Lista de prueba',
    fuente: 'https://example.org/lista',
    autoridad: 'Prueba',
    vinculante: true,
    fechaPublicacion: '2026-09-01',
    sha256: 'abc',
    registros: [
      { i: '1', t: 'P', n: 'CARLOS RENDON HERRERA', a: [], d: [] },
      { i: '2', t: 'P', n: 'DIEGO MURILLO BEJARANO', a: [], d: [] },
      {
        i: '3',
        t: 'E',
        n: 'CENTRO DE DIAGNOSTICO AUTOMOTRIZ',
        a: [],
        d: [{ t: 'NIT', n: '900228328', p: 'CO' }],
      },
    ],
  },
];

const motor = crearMotor(listas);

test('un designado escrito sin el último apellido sale a revisión', () => {
  // Es como llega media matrícula: la escuela apunta "Carlos Rendón" y el
  // designado está listado con tres palabras. Con el umbral corto en 0.93
  // esto devolvía SIN_HALLAZGOS, que es el peor resultado posible aquí.
  // Medido sobre los designados publicados de tres palabras, bajarlo a 0.82
  // lleva la recuperación del 4,7% al 57,3% sin mover la tasa de alerta.
  const r = motor.consultar({ nombre: 'Carlos Rendón' });
  assert.equal(r.resultado, NIVEL.REVISION);
  assert.equal(r.coincidencias[0].registro.n, 'CARLOS RENDON HERRERA');
});

test('el nombre corto abre revisión pero no alerta por sí solo', () => {
  // La contrapartida de abrir la revisión es que no puede convertirse en
  // bloqueo: una coincidencia parcial de dos palabras la mira una persona,
  // no detiene una matrícula. Por eso solo se movió el umbral de revisión.
  const r = motor.consultar({ nombre: 'Carlos Rendón' });
  assert.notEqual(r.resultado, NIVEL.ALERTA);
  assert.ok(UMBRALES.alertaNombreCorto > UMBRALES.revisionNombreCorto);
  assert.ok(r.coincidencias[0].puntaje < UMBRALES.alertaNombreCorto);
});

test('un nombre corriente que no está en la lista sigue limpio', () => {
  assert.equal(motor.consultar({ nombre: 'Alexa Diago' }).resultado, NIVEL.LIMPIO);
  assert.equal(motor.consultar({ nombre: 'Paula Grisales' }).resultado, NIVEL.LIMPIO);
});

test('el documento manda sobre el nombre', () => {
  const r = motor.consultar({
    nombre: 'Taller mecánico cualquiera',
    documento: '900.228.328-7',
    tipoDocumento: 'NIT',
  });
  assert.equal(r.resultado, NIVEL.ALERTA);
  assert.equal(r.coincidencias[0].motivo, 'documento');
});

test('la consulta deja constancia de contra qué versión se hizo', () => {
  const r = motor.consultar({ nombre: 'Rashid Taan' });
  assert.equal(r.listas[0].sha256, 'abc');
  assert.equal(r.listas[0].fechaPublicacion, '2026-09-01');
  assert.equal(r.umbrales.revision, UMBRALES.revisionNombreCorto);
});

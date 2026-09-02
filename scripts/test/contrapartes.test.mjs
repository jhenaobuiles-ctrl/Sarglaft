import test from 'node:test';
import assert from 'node:assert/strict';
import { construirFichas, claveDe, filtrarFichas } from '../../app/registro/contrapartes.js';

const consulta = (extra) => ({
  id: 'c',
  tipo: 'puntual',
  fecha: '2026-08-01T10:00:00.000Z',
  resultado: 'SIN_HALLAZGOS',
  consulta: {},
  ...extra,
});

test('la clave es el documento cuando lo hay, y el nombre cuando no', () => {
  assert.equal(claveDe({ documentoNormalizado: '79123456', nombreNormalizado: 'JUAN' }), 'd:79123456');
  assert.equal(claveDe({ nombreNormalizado: 'JUAN PEREZ' }), 'n:JUAN PEREZ');
  assert.equal(claveDe({}), '');
});

test('reúne consultas, documentos y evidencias de la misma persona', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456', nombreNormalizado: 'JUAN PEREZ', consulta: { nombre: 'Juan Pérez', documento: '79.123.456' } }),
      consulta({ id: 'c2', documentoNormalizado: '79123456', nombreNormalizado: 'JUAN PEREZ', fecha: '2026-08-15T10:00:00.000Z' }),
    ],
    documentos: [
      { id: 'd1', plantilla: 'pep', documentoNormalizado: '79123456', nombreNormalizado: 'JUAN PEREZ', valores: {}, actualizado: '2026-08-10T10:00:00.000Z' },
    ],
    evidencias: [{ id: 'e1', consultaId: 'c1', fecha: '2026-08-01T11:00:00.000Z' }],
  });

  assert.equal(fichas.length, 1);
  assert.equal(fichas[0].consultas.length, 2);
  assert.equal(fichas[0].documentos.length, 1);
  assert.equal(fichas[0].evidencias.length, 1);
  assert.equal(fichas[0].nombre, 'Juan Pérez');
  assert.equal(fichas[0].documento, '79.123.456');
});

test('el mismo documento escrito de otra forma sigue siendo la misma persona', () => {
  // 79.123.456 y 0079123456 normalizan igual, que es de lo que se encarga el
  // normalizador compartido; aquí basta con que la clave los junte.
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456' }),
      consulta({ id: 'c2', documentoNormalizado: '79123456' }),
    ],
  });
  assert.equal(fichas.length, 1);
});

test('une la consulta hecha solo por nombre con la que trae el documento', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', nombreNormalizado: 'MARIA GOMEZ', consulta: { nombre: 'María Gómez' } }),
      consulta({ id: 'c2', documentoNormalizado: '1144087221', nombreNormalizado: 'MARIA GOMEZ', consulta: { nombre: 'María Gómez', documento: '1144087221' } }),
    ],
  });
  assert.equal(fichas.length, 1, 'deberían quedar reunidas en una sola ficha');
  assert.equal(fichas[0].consultas.length, 2);
  assert.equal(fichas[0].documento, '1144087221');
});

test('no une dos personas que se llaman igual', () => {
  // Fundirlas sería peor que dejarlas separadas: el expediente diría que una
  // sola persona tiene los papeles de dos.
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', nombreNormalizado: 'MARIA GOMEZ' }),
      consulta({ id: 'c2', documentoNormalizado: '111', nombreNormalizado: 'MARIA GOMEZ' }),
      consulta({ id: 'c3', documentoNormalizado: '222', nombreNormalizado: 'MARIA GOMEZ' }),
    ],
  });
  assert.equal(fichas.length, 3);
});

test('cuenta las alertas que siguen sin decidir', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456', resultado: 'ALERTA' }),
      consulta({ id: 'c2', documentoNormalizado: '79123456', resultado: 'ALERTA', decision: { desenlace: 'homonimo' } }),
      consulta({ id: 'c3', documentoNormalizado: '79123456', resultado: 'SIN_HALLAZGOS' }),
    ],
  });
  assert.equal(fichas[0].alertasAbiertas, 1);
});

test('un formato de debida diligencia también cierra la alerta de la ficha', () => {
  const fichas = construirFichas({
    consultas: [consulta({ id: 'c1', documentoNormalizado: '79123456', resultado: 'ALERTA' })],
    documentos: [
      { id: 'd1', plantilla: 'debida-diligencia', documentoNormalizado: '79123456', valores: { consultaId: 'c1' } },
    ],
  });
  assert.equal(fichas[0].alertasAbiertas, 0);
});

test('el estado actual sale de la última consulta contra listas', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456', resultado: 'ALERTA', fecha: '2026-08-01T10:00:00.000Z' }),
      consulta({ id: 'c2', documentoNormalizado: '79123456', resultado: 'SIN_HALLAZGOS', fecha: '2026-08-20T10:00:00.000Z' }),
      // Una constancia de antecedentes no cruzó listas: no puede dictar el
      // estado frente a las listas restrictivas aunque sea la más reciente.
      consulta({ id: 'c3', documentoNormalizado: '79123456', tipo: 'antecedentes', resultado: 'ALERTA', fecha: '2026-08-25T10:00:00.000Z' }),
    ],
  });
  assert.equal(fichas[0].resultadoActual, 'SIN_HALLAZGOS');
  assert.equal(fichas[0].ultimaConsulta, '2026-08-20T10:00:00.000Z');
});

test('la condición PEP se conserva aunque una consulta posterior no la repita', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456', pep: true, pepDetalle: 'Persona expuesta políticamente' }),
      consulta({ id: 'c2', documentoNormalizado: '79123456', fecha: '2026-08-20T10:00:00.000Z' }),
    ],
  });
  assert.equal(fichas[0].pep, true);
  assert.equal(fichas[0].pepDetalle, 'Persona expuesta políticamente');
});

test('las fichas salen ordenadas por la actividad más reciente', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '111', fecha: '2026-08-01T10:00:00.000Z' }),
      consulta({ id: 'c2', documentoNormalizado: '222', fecha: '2026-08-20T10:00:00.000Z' }),
    ],
  });
  assert.deepEqual(fichas.map((f) => f.documento || f.clave), ['d:222', 'd:111']);
});

test('un registro sin nombre ni documento no crea una ficha fantasma', () => {
  const fichas = construirFichas({ consultas: [consulta({ id: 'c1' })] });
  assert.deepEqual(fichas, []);
});

test('el buscador encuentra por nombre y por documento', () => {
  const fichas = construirFichas({
    consultas: [
      consulta({ id: 'c1', documentoNormalizado: '79123456', consulta: { nombre: 'Juan Pérez', documento: '79.123.456' } }),
      consulta({ id: 'c2', documentoNormalizado: '1144087221', consulta: { nombre: 'María Gómez', documento: '1144087221' } }),
    ],
  });
  assert.equal(filtrarFichas(fichas, 'maría').length, 1);
  assert.equal(filtrarFichas(fichas, '79.123').length, 1);
  assert.equal(filtrarFichas(fichas, '').length, 2);
  assert.equal(filtrarFichas(fichas, 'nadie').length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararConsulta, puntuar, jaroWinkler, similitudTokens } from '../../app/motor/scoring.js';

const puntaje = (consulta, candidato) => {
  const p = prepararConsulta(consulta);
  return puntuar(p.tokens, p.ordenada, candidato);
};

test('jaroWinkler en los extremos', () => {
  assert.equal(jaroWinkler('ABC', 'ABC'), 1);
  assert.equal(jaroWinkler('', 'ABC'), 0);
  assert.ok(jaroWinkler('MARTHA', 'MARTA') > 0.9);
  assert.ok(jaroWinkler('LOPEZ', 'GUTIERREZ') < 0.6);
});

test('el orden de nombres y apellidos no cambia el puntaje', () => {
  // Es la forma en que OFAC y la ONU escriben a las personas.
  assert.equal(puntaje('Juan Carlos Restrepo Ospina', 'RESTREPO OSPINA, JUAN CARLOS'), 1);
});

test('tolera un error de transcripción', () => {
  assert.ok(puntaje('Juan Carlos Restrepo Ospina', 'Juan Carlos Restreppo Ospina') > 0.93);
});

test('un nombre corto no coincide con uno largo que lo contiene', () => {
  // El falso positivo clásico. Con cobertura simple daría 1,0.
  assert.ok(puntaje('Juan Restrepo', 'Juan Carlos Restrepo Ospina Mejia') < 0.7);
});

test('un nombre al que le falta un segundo nombre cae en la banda de revisión', () => {
  const p = puntaje('Juan Restrepo Ospina', 'Juan Carlos Restrepo Ospina');
  assert.ok(p >= 0.8 && p < 0.93, `esperaba banda de revisión, dio ${p}`);
});

test('nombres sin relación puntúan bajo', () => {
  assert.ok(puntaje('Alexa Claudia Diago', 'Juan Carlos Restrepo Ospina') < 0.4);
});

test('las tildes no bajan el puntaje', () => {
  assert.equal(puntaje('José Peña', 'Jose Pena'), 1);
});

test('similitudTokens es simétrica', () => {
  const a = ['JUAN', 'RESTREPO'];
  const b = ['JUAN', 'CARLOS', 'RESTREPO', 'OSPINA'];
  assert.equal(similitudTokens(a, b), similitudTokens(b, a));
});

test('tokens cortos exigen igualdad exacta', () => {
  // ANA y ANE no deben considerarse el mismo token pese al Jaro-Winkler alto.
  assert.ok(similitudTokens(['ANA'], ['ANE']) === 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frescuraDe, diasDesdePublicacion, explicarFrescura, listasConProblema,
  TOLERANCIA_POR_OMISION,
} from '../../app/datos/frescura.js';

const AHORA = new Date('2026-09-02T15:00:00Z');
const lista = (extra) => ({
  id: 'ofac_sdn',
  nombre: 'OFAC — SDN',
  estado: 'ok',
  vinculante: false,
  toleranciaDias: 30,
  fechaPublicacion: '2026-08-28',
  ...extra,
});

test('cuenta los días sin correrse por la zona horaria', () => {
  // Anclar la fecha en hora local la corre un día en Colombia; es el mismo
  // error que ya obligó a arreglar el certificado.
  assert.equal(diasDesdePublicacion('2026-09-02', AHORA), 0);
  assert.equal(diasDesdePublicacion('2026-09-01', AHORA), 1);
  assert.equal(diasDesdePublicacion('2026-08-28', AHORA), 5);
  assert.equal(diasDesdePublicacion('2026-07-27', AHORA), 37);
});

test('una fecha ausente o ilegible no se convierte en cero días', () => {
  assert.equal(diasDesdePublicacion('', AHORA), null);
  assert.equal(diasDesdePublicacion(undefined, AHORA), null);
  assert.equal(diasDesdePublicacion('circa 2026', AHORA), null);
});

test('una lista publicada hace poco está al día', () => {
  const f = frescuraDe(lista(), AHORA);
  assert.equal(f.nivel, 'ok');
  assert.equal(f.problema, false);
  assert.equal(f.dias, 5);
});

test('descargar bien no basta: si dejó de publicar, está atrasada', () => {
  // Este es el fallo que el guardrail de encogimiento no ve. El conteo no
  // cambia, el sha256 no cambia, el estado dice `ok`.
  const f = frescuraDe(lista({ fechaPublicacion: '2026-06-01' }), AHORA);
  assert.equal(f.nivel, 'atrasada');
  assert.equal(f.problema, true);
  assert.match(explicarFrescura(lista({ fechaPublicacion: '2026-06-01' }), AHORA), /sitio oficial/);
});

test('cada fuente marca su propio ritmo', () => {
  // 37 días es normal en la lista consolidada de OFAC y sospechoso en la de
  // designados. Un umbral único fallaría en una de las dos.
  const antigua = { fechaPublicacion: '2026-07-27' };
  assert.equal(frescuraDe(lista({ ...antigua, toleranciaDias: 120 }), AHORA).nivel, 'ok');
  assert.equal(frescuraDe(lista({ ...antigua, toleranciaDias: 30 }), AHORA).nivel, 'atrasada');
});

test('sin tolerancia declarada se aplica una generosa', () => {
  const f = frescuraDe({ estado: 'ok', fechaPublicacion: '2026-08-28' }, AHORA);
  assert.equal(f.tolerancia, TOLERANCIA_POR_OMISION);
  assert.equal(f.nivel, 'ok');
});

test('justo en el límite todavía no se avisa', () => {
  assert.equal(frescuraDe(lista({ fechaPublicacion: '2026-08-03' }), AHORA).dias, 30);
  assert.equal(frescuraDe(lista({ fechaPublicacion: '2026-08-03' }), AHORA).nivel, 'ok');
  assert.equal(frescuraDe(lista({ fechaPublicacion: '2026-08-02' }), AHORA).nivel, 'atrasada');
});

test('que la descarga falle pesa más que el retraso', () => {
  // Con la descarga caída, la copia en uso puede ser de cualquier antigüedad:
  // decir solo "atrasada" se quedaría corto.
  const f = frescuraDe(lista({ estado: 'obsoleto', fechaPublicacion: '2026-06-01' }), AHORA);
  assert.equal(f.nivel, 'obsoleta');
  assert.match(explicarFrescura(lista({ estado: 'obsoleto' }), AHORA), /copia anterior/);
});

test('una lista sin datos se distingue de una atrasada', () => {
  const f = frescuraDe(lista({ estado: 'sin_datos', fechaPublicacion: '' }), AHORA);
  assert.equal(f.nivel, 'sin_datos');
  assert.match(explicarFrescura(lista({ estado: 'sin_datos', fechaPublicacion: '' }), AHORA), /no se está consultando/);
});

test('una fuente sin fecha se señala en vez de darse por buena', () => {
  const f = frescuraDe(lista({ fechaPublicacion: '' }), AHORA);
  assert.equal(f.nivel, 'sin_fecha');
  assert.equal(f.problema, true);
});

test('los problemas salen con las vinculantes primero', () => {
  const problemas = listasConProblema(
    [
      lista({ id: 'ue', vinculante: false, fechaPublicacion: '2026-01-01' }),
      lista({ id: 'onu', vinculante: true, fechaPublicacion: '2026-01-01' }),
      lista({ id: 'uk', vinculante: false, fechaPublicacion: '2026-09-01' }),
    ],
    AHORA,
  );
  assert.deepEqual(problemas.map((p) => p.entrada.id), ['onu', 'ue']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESENLACES, requiereDesenlace, estaCerrada, citadasEnDocumentos,
  resumenDesenlaces, etiquetaDesenlace, claseDesenlace, planDeRegistro, gravedad,
} from '../../app/ui/desenlace.js';

const consulta = (extra = {}) => ({ id: 'c_1', resultado: 'ALERTA', ...extra });

test('solo las coincidencias piden una decisión', () => {
  assert.equal(requiereDesenlace(consulta({ resultado: 'ALERTA' })), true);
  assert.equal(requiereDesenlace(consulta({ resultado: 'EN_REVISION' })), true);
  // Una consulta limpia no cierra nada: no hay nada que decidir.
  assert.equal(requiereDesenlace(consulta({ resultado: 'SIN_HALLAZGOS' })), false);
});

test('una alerta sin decisión queda abierta', () => {
  assert.equal(estaCerrada(consulta()), false);
  // Escribir una observación ya no basta: no dice si se vinculó o no.
  assert.equal(estaCerrada(consulta({ observaciones: 'Revisado, parece homónimo' })), false);
});

test('el desenlace registrado cierra la alerta', () => {
  const c = consulta({ decision: { desenlace: 'homonimo', sustento: 'La cédula no corresponde.' } });
  assert.equal(estaCerrada(c), true);
});

test('un formato de debida diligencia también la cierra', () => {
  const documentos = [
    { plantilla: 'debida-diligencia', valores: { consultaId: ' c_1 ' } },
    { plantilla: 'manual', valores: {} },
  ];
  const citadas = citadasEnDocumentos(documentos);
  // El identificador se copia a mano del expediente y suele llegar con espacios.
  assert.deepEqual([...citadas], ['c_1']);
  assert.equal(estaCerrada(consulta(), citadas), true);
  assert.equal(estaCerrada(consulta({ id: 'c_2' }), citadas), false);
});

test('lo que no requiere decisión cuenta como cerrado', () => {
  assert.equal(estaCerrada(consulta({ resultado: 'SIN_HALLAZGOS' })), true);
});

test('el resumen cuenta las alertas por desenlace', () => {
  const consultas = [
    consulta({ id: 'a', decision: { desenlace: 'homonimo' } }),
    consulta({ id: 'b', decision: { desenlace: 'homonimo' } }),
    consulta({ id: 'c', resultado: 'EN_REVISION', decision: { desenlace: 'seguimiento' } }),
    consulta({ id: 'd' }),
    consulta({ id: 'e' }),
    consulta({ id: 'f', resultado: 'SIN_HALLAZGOS' }),
  ];
  const resumen = resumenDesenlaces(consultas, new Set(['e']));

  assert.equal(resumen.total, 5, 'las limpias no entran en el conteo');
  assert.equal(resumen.homonimo, 2);
  assert.equal(resumen.seguimiento, 1);
  assert.equal(resumen.rechazada, 0);
  // "e" está cerrada por un formato de debida diligencia, así que no cuenta
  // como pendiente aunque no tenga desenlace propio.
  assert.equal(resumen.sinCerrar, 1);
});

test('cada desenlace tiene rótulo, ayuda y color', () => {
  for (const d of DESENLACES) {
    assert.ok(d.id && d.rotulo && d.ayuda, `${d.id} incompleto`);
    assert.match(d.clase, /^(ALERTA|EN_REVISION|SIN_HALLAZGOS)$/);
  }
  assert.equal(new Set(DESENLACES.map((d) => d.id)).size, DESENLACES.length);
});

test('un desenlace desconocido no rompe la impresión', () => {
  // Puede llegar de una copia hecha con otra versión del panel.
  assert.equal(etiquetaDesenlace('inventado'), '');
  assert.equal(etiquetaDesenlace(undefined), '');
  assert.equal(claseDesenlace('inventado'), 'neutra');
});

test('los cuatro desenlaces cubren las salidas reales de una alerta', () => {
  const ids = DESENLACES.map((d) => d.id);
  assert.deepEqual(ids, ['homonimo', 'seguimiento', 'rechazada', 'reportada']);
});

/* ---------- qué registra la revisión periódica ---------- */

test('la revisión registra una consulta nueva solo si la contraparte empeoró', () => {
  const previa = { id: 'c_1', resultado: 'SIN_HALLAZGOS' };
  const plan = planDeRegistro(previa, 'ALERTA');
  assert.deepEqual(plan, { interesa: true, empeoro: true, reusaConsulta: false });
});

test('una alerta que sigue igual reutiliza la consulta ya abierta', () => {
  // Crear una copia en cada barrido reabriría una decisión ya tomada y dejaría
  // el contador de pendientes creciendo mes a mes por la misma alerta.
  const plan = planDeRegistro({ id: 'c_1', resultado: 'ALERTA' }, 'ALERTA');
  assert.deepEqual(plan, { interesa: true, empeoro: false, reusaConsulta: true });
});

test('una contraparte que sigue limpia no deja rastro individual', () => {
  const plan = planDeRegistro({ id: 'c_1', resultado: 'SIN_HALLAZGOS' }, 'SIN_HALLAZGOS');
  assert.equal(plan.interesa, false);
});

test('mejorar tampoco crea una consulta nueva, pero sí se muestra', () => {
  // La coincidencia bajó de alerta a revisión: sigue habiendo algo que mirar,
  // y lo que hay que mirar es la alerta que ya estaba abierta.
  const plan = planDeRegistro({ id: 'c_1', resultado: 'ALERTA' }, 'EN_REVISION');
  assert.equal(plan.interesa, true);
  assert.equal(plan.reusaConsulta, true);
});

test('la gravedad ordena los tres veredictos', () => {
  assert.ok(gravedad('ALERTA') > gravedad('EN_REVISION'));
  assert.ok(gravedad('EN_REVISION') > gravedad('SIN_HALLAZGOS'));
  assert.equal(gravedad('lo que sea'), 0);
});

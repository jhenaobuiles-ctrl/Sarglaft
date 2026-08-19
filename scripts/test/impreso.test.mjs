import test from 'node:test';
import assert from 'node:assert/strict';
import { documentoHTML } from '../../app/documentos/impreso.js';
import { POR_ID, valoresIniciales } from '../../app/documentos/plantillas.js';

const PERFIL = {
  empresa: 'Escuela AC de Conducción SAS',
  nit: '900123456-7',
  responsable: 'Alexa Claudia Diago',
  cargo: 'Oficial de cumplimiento',
};

function imprimir(idPlantilla, valores = {}, extra = {}) {
  const plantilla = POR_ID.get(idPlantilla);
  return documentoHTML(
    {
      id: 'd_prueba',
      plantilla: idPlantilla,
      fecha: '2026-08-19T15:00:00.000Z',
      valores: { ...valoresIniciales(plantilla), ...valores },
      ...extra,
    },
    plantilla,
    PERFIL,
  );
}

test('todas las plantillas se imprimen sin romperse', () => {
  for (const [id, plantilla] of POR_ID) {
    const html = imprimir(id);
    assert.ok(html.includes(plantilla.nombre), `${id}: falta el título`);
    assert.ok(!html.includes('undefined'), `${id}: imprime "undefined"`);
    assert.ok(!html.includes('[object Object]'), `${id}: imprime "[object Object]"`);
  }
});

test('las casillas se imprimen marcadas y sin marcar', () => {
  const html = imprimir('origen-fondos', { origen: ['Ahorros'] });
  // Lo que no se marcó también se imprime: en una revisión importa tanto la
  // respuesta como saber que la pregunta se hizo.
  assert.ok(html.includes('&#9745; Ahorros'), 'la opción marcada debería salir marcada');
  assert.ok(html.includes('&#9744; Crédito'), 'la opción sin marcar debería salir vacía');
});

test('una tabla vacía se imprime en blanco para llenarla a mano', () => {
  const html = imprimir('capacitacion');
  const filas = html.split('<tr>').length - 1;
  // Encabezado más las ocho filas de asistencia declaradas en la plantilla.
  assert.ok(filas >= 9, `salieron ${filas} filas; el acta se firma en papel`);
});

test('una tabla con datos imprime lo diligenciado', () => {
  const html = imprimir('capacitacion', {
    asistentes: [{ nombre: 'Juan Restrepo', documento: '79123456', cargo: 'Instructor', firma: '' }],
  });
  assert.ok(html.includes('Juan Restrepo'));
  assert.ok(html.includes('79123456'));
});

test('la matriz de riesgo sale con sus factores precargados', () => {
  const html = imprimir('matriz-riesgo');
  assert.ok(html.includes('listas restrictivas'));
  assert.ok(html.includes('Capacitación anual documentada'));
});

test('las fechas se imprimen en formato colombiano y sin correrse un día', () => {
  const html = imprimir('pep', { nombre: 'X', documento: '1', desde: '2026-08-17' });
  assert.match(html, /17/);
  assert.doesNotMatch(html, /2026-08-17/);
});

test('el texto de la contraparte se escapa antes de entrar al HTML', () => {
  const html = imprimir('pep', { nombre: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('los saltos de línea de un campo largo se conservan', () => {
  const html = imprimir('manual', { objetivo: 'Primera línea.\nSegunda línea.' });
  assert.ok(html.includes('Primera línea.<br>Segunda línea.'));
});

test('la firma del responsable se toma del perfil y las demás quedan en blanco', () => {
  const html = imprimir('origen-fondos');
  assert.ok(html.includes('Alexa Claudia Diago'), 'debería firmar quien está en Ajustes');
  assert.ok(html.includes('Nombre y documento de quien declara'), 'la contraparte firma a mano');
});

test('el marco normativo del perfil se imprime al pie y no se inventa', () => {
  const plantilla = POR_ID.get('manual');
  const base = { id: 'd_1', plantilla: 'manual', fecha: '2026-08-19T15:00:00.000Z', valores: valoresIniciales(plantilla) };

  const sinMarco = documentoHTML(base, plantilla, PERFIL);
  assert.doesNotMatch(sinMarco, /Circular/i);

  const conMarco = documentoHTML(base, plantilla, { ...PERFIL, marcoNormativo: 'Circular 007 de 2099' });
  assert.ok(conMarco.includes('Circular 007 de 2099'));
});

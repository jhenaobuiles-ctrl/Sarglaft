import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANTILLAS, POR_ID, GRUPOS, campos, valoresIniciales, faltantes,
} from '../../app/documentos/plantillas.js';
import { OBLIGACIONES_BASE } from '../../app/ui/obligaciones.js';

test('cada plantilla tiene identificador único', () => {
  const ids = PLANTILLAS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'hay identificadores repetidos');
  assert.equal(POR_ID.size, PLANTILLAS.length);
});

test('cada plantilla pertenece a un grupo que existe', () => {
  for (const plantilla of PLANTILLAS) {
    assert.ok(GRUPOS[plantilla.grupo], `${plantilla.id} está en el grupo "${plantilla.grupo}"`);
  }
});

test('los campos están bien declarados', () => {
  const CON_OPCIONES = new Set(['select', 'casillas']);
  for (const plantilla of PLANTILLAS) {
    const vistos = new Set();
    for (const campo of campos(plantilla)) {
      assert.ok(campo.id, `${plantilla.id}: hay un campo sin id`);
      assert.ok(campo.etiqueta, `${plantilla.id}/${campo.id}: sin etiqueta`);
      // Los identificadores se usan como selector dentro del formulario: si
      // se repiten, el segundo campo lee y escribe sobre el primero.
      assert.ok(!vistos.has(campo.id), `${plantilla.id}: campo repetido "${campo.id}"`);
      vistos.add(campo.id);

      if (CON_OPCIONES.has(campo.tipo)) {
        assert.ok(campo.opciones?.length, `${plantilla.id}/${campo.id}: sin opciones`);
      }
      if (campo.tipo === 'tabla') {
        assert.ok(campo.columnas?.length, `${plantilla.id}/${campo.id}: tabla sin columnas`);
        for (const columna of campo.columnas) {
          assert.ok(columna.id && columna.etiqueta, `${plantilla.id}/${campo.id}: columna incompleta`);
        }
      }
    }
  }
});

test('las plantillas que marcan una obligación apuntan a una que existe', () => {
  const conocidas = new Set(OBLIGACIONES_BASE.map((o) => o.id));
  const marcadoras = PLANTILLAS.filter((p) => p.obligacion);
  assert.ok(marcadoras.length, 'ninguna plantilla marca obligación');
  for (const plantilla of marcadoras) {
    assert.ok(
      conocidas.has(plantilla.obligacion),
      `${plantilla.id} apunta a la obligación inexistente "${plantilla.obligacion}"`,
    );
  }
});

test('valoresIniciales cubre todos los campos con el tipo correcto', () => {
  for (const plantilla of PLANTILLAS) {
    const valores = valoresIniciales(plantilla);
    for (const campo of campos(plantilla)) {
      assert.ok(campo.id in valores, `${plantilla.id}/${campo.id} sin valor inicial`);
      if (campo.tipo === 'casillas' || campo.tipo === 'tabla') {
        assert.ok(Array.isArray(valores[campo.id]), `${plantilla.id}/${campo.id} debería ser lista`);
      }
    }
  }
});

test('el manual y la matriz vienen con contenido para no partir de cero', () => {
  const manual = valoresIniciales(POR_ID.get('manual'));
  assert.match(manual.listas, /Naciones Unidas/);
  assert.ok(manual.politica.length > 100);

  const matriz = valoresIniciales(POR_ID.get('matriz-riesgo'));
  assert.ok(matriz.factores.length >= 5, 'la matriz debería traer factores precargados');
  for (const fila of matriz.factores) {
    assert.ok(fila.factor && fila.riesgo && fila.control);
  }
});

test('faltantes señala solo los campos obligatorios vacíos', () => {
  const plantilla = POR_ID.get('pep');
  const valores = valoresIniciales(plantilla);
  const pendientes = faltantes(plantilla, valores);
  assert.ok(pendientes.length >= 2, 'debería faltar al menos nombre y documento');

  valores.nombre = 'María Fernanda Gómez';
  valores.documento = '79123456';
  assert.deepEqual(faltantes(plantilla, valores), []);
});

test('faltantes no acepta espacios en blanco como diligenciado', () => {
  const plantilla = POR_ID.get('pep');
  const valores = { ...valoresIniciales(plantilla), nombre: '   ', documento: '79123456' };
  assert.deepEqual(faltantes(plantilla, valores), ['Nombres y apellidos']);
});

test('ninguna plantilla cita una norma concreta de supervisión', () => {
  // El panel no sabe qué superintendencia vigila a la empresa. Poner una
  // circular inventada en un formato que va a firmar un tercero es peor que
  // dejar el campo en manos de quien sí lo sabe (Ajustes → marco normativo).
  const texto = JSON.stringify(PLANTILLAS);
  assert.doesNotMatch(texto, /Circular Externa/i);
  assert.doesNotMatch(texto, /Supersociedades|Superintendencia de Sociedades/i);
});

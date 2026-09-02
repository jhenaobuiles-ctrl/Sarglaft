import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { huellaDe, revisarHuella, sePuedeVerificar } from '../../app/datos/huella.js';

const bytesDe = (texto) => new TextEncoder().encode(texto);

test('la huella coincide con la que calcula el build', async () => {
  // El build hashea los bytes del archivo tal como se escriben. Si el
  // navegador hashease el JSON reserializado daría otro valor y todas las
  // listas se rechazarían.
  const texto = '{"id":"onu","registros":[]}\n';
  const esperada = createHash('sha256').update(texto).digest('hex');
  assert.equal(await huellaDe(bytesDe(texto)), esperada);
});

test('una lista íntegra pasa y queda marcada como verificada', async () => {
  const texto = '{"registros":[1,2,3]}';
  const sha = createHash('sha256').update(texto).digest('hex');
  const r = await revisarHuella(sha, bytesDe(texto));
  assert.deepEqual(r, { ok: true, verificada: true, motivo: '' });
});

test('una descarga cortada se rechaza en vez de consultarse a medias', async () => {
  // Un JSON truncado a la mitad puede seguir siendo válido tras un corte
  // limpio, así que JSON.parse no protege: media lista devuelve «sin
  // hallazgos» sobre los designados que quedaron fuera.
  const completo = '{"registros":[1,2,3,4,5,6,7,8,9]}';
  const sha = createHash('sha256').update(completo).digest('hex');
  const r = await revisarHuella(sha, bytesDe('{"registros":[1,2,3]}'));
  assert.equal(r.ok, false);
  assert.equal(r.verificada, true);
  assert.match(r.motivo, /no corresponde/);
});

test('el motivo nombra las dos huellas para poder compararlas', async () => {
  const r = await revisarHuella('a'.repeat(64), bytesDe('cualquier cosa'));
  assert.match(r.motivo, /aaaaaaaaaaaa…/);
});

test('sin huella en el manifiesto se usa la lista, pero sin decir que se verificó', async () => {
  // Avisar no es descartar, igual que con una lista atrasada. Lo que no puede
  // pasar es que el certificado afirme una comprobación que no ocurrió.
  const r = await revisarHuella('', bytesDe('{}'));
  assert.equal(r.ok, true);
  assert.equal(r.verificada, false);
  assert.match(r.motivo, /no trae la huella/);
});

test('el entorno de pruebas sí puede verificar', () => {
  assert.equal(sePuedeVerificar(), true);
});

test('las listas publicadas cuadran con su huella del manifiesto', async () => {
  // Prueba de cordura sobre los datos reales: si el build y el navegador
  // calcularan la huella de forma distinta, el panel rechazaría todo.
  const dir = join(process.cwd(), 'data', 'listas');
  const ruta = join(dir, 'manifest.json');
  if (!existsSync(ruta)) return;
  const manifiesto = JSON.parse(readFileSync(ruta, 'utf8'));
  for (const entrada of manifiesto.listas || []) {
    if (!entrada.archivo || !existsSync(join(dir, entrada.archivo))) continue;
    const bytes = readFileSync(join(dir, entrada.archivo));
    const r = await revisarHuella(entrada.sha256, bytes);
    assert.equal(r.ok, true, `${entrada.id}: ${r.motivo}`);
    assert.equal(r.verificada, true, `${entrada.id} no se verificó`);
  }
});

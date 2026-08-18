#!/usr/bin/env node
// Diagnóstico puntual del CSV del Reino Unido.
//
// No forma parte de la actualización: existe para mirar la estructura real
// del archivo desde un entorno con salida a internet cuando el parser
// discrepa de lo que esperábamos.

import { resolver } from './fuentes/uk.mjs';
import { leerCSV, detectarSeparador } from '../app/lib/csv.js';

const descargar = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'sarglaft-listas/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { cuerpo: await r.text() };
};

const { url } = await resolver(descargar);
console.log('origen:', url);
const { cuerpo } = await descargar(url);
const filas = leerCSV(cuerpo, detectarSeparador(cuerpo));
console.log('filas totales:', filas.length);

const iEncabezado = filas.findIndex((f) =>
  f.some((c) => /^name\s*6$/i.test(c.trim())) || f.some((c) => /group\s*id/i.test(c)),
);
console.log('\n--- fila de encabezado (índice', iEncabezado, ') ---');
const encabezado = filas[iEncabezado] || [];
encabezado.forEach((c, i) => console.log(`  [${String(i).padStart(2)}] ${c}`));

console.log('\n--- filas previas al encabezado ---');
filas.slice(0, Math.max(iEncabezado, 0)).forEach((f) => console.log('  ', JSON.stringify(f.slice(0, 4))));

// El caso que delató el problema: una entidad repetida 36 veces.
const columnasClave = encabezado
  .map((c, i) => [c, i])
  .filter(([c]) => /group|unique|id|name type|alias/i.test(c));
console.log('\ncolumnas candidatas a clave:', columnasClave.map(([c, i]) => `${i}:${c}`).join(' | '));

const muestra = filas
  .slice(iEncabezado + 1)
  .filter((f) => f.some((c) => /ELEKTROZOND/i.test(c)))
  .slice(0, 6);
console.log(`\n--- ${muestra.length} filas de ELEKTROZOND, solo columnas clave ---`);
for (const fila of muestra) {
  console.log('  ', columnasClave.map(([c, i]) => `${c}=${JSON.stringify(fila[i] || '')}`).join('  '));
}

// ¿Cuántas filas traen vacía cada columna candidata?
console.log('\n--- vacíos por columna candidata ---');
const cuerpoFilas = filas.slice(iEncabezado + 1).filter((f) => f.length > 1);
for (const [c, i] of columnasClave) {
  const vacias = cuerpoFilas.filter((f) => !(f[i] || '').trim()).length;
  console.log(`  ${c}: ${vacias} vacías de ${cuerpoFilas.length}`);
}

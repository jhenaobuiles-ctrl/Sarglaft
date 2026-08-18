#!/usr/bin/env node
// Descarga las listas oficiales, las normaliza y las deja listas para que el
// navegador las consulte.
//
// Se ejecuta en GitHub Actions, no en el equipo de nadie. Dos reglas de
// seguridad gobiernan todo el archivo:
//
//   1. Aislamiento por fuente. Si OFSI cambia su formato, el resto de las
//      listas se actualiza igual y la del Reino Unido conserva su última
//      versión buena, marcada como obsoleta.
//   2. Nunca publicar una lista encogida. Una descarga cortada a la mitad
//      produciría "sin hallazgos" falsos, que es el peor resultado posible en
//      un sistema SARLAFT. Ante una caída brusca de registros se conserva la
//      versión anterior y el trabajo falla.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as onu from './fuentes/onu.mjs';
import { sdn, noSdn } from './fuentes/ofac.mjs';
import * as ue from './fuentes/ue.mjs';
import * as uk from './fuentes/uk.mjs';
import * as bancomundial from './fuentes/bancomundial.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'data', 'listas');
const MANIFIESTO = join(DESTINO, 'manifest.json');

// Por debajo de esta fracción de los registros anteriores se asume descarga
// incompleta o cambio de formato, no una depuración legítima de la lista.
const CAIDA_MAXIMA = 0.6;
const REINTENTOS = 4;
const TIEMPO_LIMITE_MS = 120000;

const FUENTES = [
  { ...onu.meta, parsear: onu.parsear },
  { ...sdn.meta, parsear: sdn.parsear },
  { ...noSdn.meta, parsear: noSdn.parsear },
  { ...ue.meta, parsear: ue.parsear },
  { ...uk.meta, parsear: uk.parsear, resolverURL: uk.resolverURL, apiContenidos: uk.meta.apiContenidos },
  { ...bancomundial.meta, parsear: bancomundial.parsear },
];

const forzar = process.argv.includes('--forzar');

async function principal() {
  mkdirSync(DESTINO, { recursive: true });
  const anterior = leerManifiestoAnterior();
  const entradas = [];
  let fallos = 0;

  for (const fuente of FUENTES) {
    const previa = anterior.listas?.find((l) => l.id === fuente.id) || null;
    process.stdout.write(`\n=== ${fuente.id} — ${fuente.nombre}\n`);
    try {
      const entrada = await procesar(fuente, previa);
      entradas.push(entrada);
      console.log(`    ✓ ${entrada.registros} registros · publicada ${entrada.fechaPublicacion || 'sin fecha'} · ${(entrada.bytes / 1048576).toFixed(2)} MB`);
    } catch (error) {
      fallos++;
      console.error(`    ✗ ${error.message}`);
      entradas.push(conservarAnterior(fuente, previa, error));
    }
  }

  const manifiesto = {
    generado: new Date().toISOString(),
    listas: entradas,
  };
  writeFileSync(MANIFIESTO, `${JSON.stringify(manifiesto, null, 2)}\n`);

  resumen(entradas);
  if (fallos) {
    console.error(`\n${fallos} de ${FUENTES.length} fuentes fallaron.`);
    process.exitCode = 1;
  }
}

async function procesar(fuente, previa) {
  let url = fuente.fuente;
  if (fuente.resolverURL) {
    const api = await descargar(fuente.apiContenidos, 'texto');
    url = fuente.resolverURL(api.cuerpo);
    if (!url) throw new Error('la publicación no expone un adjunto CSV');
    console.log(`    adjunto vigente: ${url}`);
  }

  const { cuerpo } = await descargar(url, 'texto');
  console.log(`    descargados ${(cuerpo.length / 1048576).toFixed(2)} MB`);

  const { fechaPublicacion, registros } = fuente.parsear(cuerpo);
  if (!registros.length) throw new Error('el parser no devolvió ningún registro');

  if (previa && previa.registros && !forzar) {
    const minimo = Math.floor(previa.registros * CAIDA_MAXIMA);
    if (registros.length < minimo) {
      throw new Error(
        `caída sospechosa de registros: ${registros.length} frente a ${previa.registros} anteriores ` +
          `(mínimo aceptado ${minimo}). Se conserva la versión anterior. ` +
          'Si la reducción es legítima, reejecutar con --forzar.',
      );
    }
  }

  const archivo = `${fuente.id}.json`;
  const contenido = JSON.stringify({
    id: fuente.id,
    nombre: fuente.nombre,
    fuente: url,
    autoridad: fuente.autoridad,
    vinculante: Boolean(fuente.vinculante),
    fechaPublicacion,
    generado: new Date().toISOString(),
    registros,
  });
  writeFileSync(join(DESTINO, archivo), contenido);

  return {
    id: fuente.id,
    nombre: fuente.nombre,
    fuente: url,
    autoridad: fuente.autoridad,
    vinculante: Boolean(fuente.vinculante),
    archivo,
    fechaPublicacion,
    registros: registros.length,
    bytes: Buffer.byteLength(contenido),
    sha256: createHash('sha256').update(contenido).digest('hex'),
    actualizado: new Date().toISOString(),
    estado: 'ok',
  };
}

// Una fuente caída no puede tumbar al resto ni, peor, dejar su lista vacía.
function conservarAnterior(fuente, previa, error) {
  const archivo = join(DESTINO, `${fuente.id}.json`);
  if (previa && existsSync(archivo)) {
    return {
      ...previa,
      estado: 'obsoleto',
      error: error.message,
      ultimoIntento: new Date().toISOString(),
    };
  }
  return {
    id: fuente.id,
    nombre: fuente.nombre,
    fuente: fuente.fuente,
    autoridad: fuente.autoridad,
    vinculante: Boolean(fuente.vinculante),
    archivo: `${fuente.id}.json`,
    fechaPublicacion: '',
    registros: 0,
    bytes: 0,
    sha256: '',
    estado: 'sin_datos',
    error: error.message,
    ultimoIntento: new Date().toISOString(),
  };
}

async function descargar(url, modo = 'texto') {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);
    try {
      const respuesta = await fetch(url, {
        signal: control.signal,
        redirect: 'follow',
        headers: {
          // Varias de estas fuentes rechazan las peticiones sin agente.
          'User-Agent': 'sarglaft-listas/1.0 (+https://github.com/jhenaobuiles-ctrl/Sarglaft)',
          Accept: '*/*',
        },
      });
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status} ${respuesta.statusText}`);
      }
      const cuerpo = await respuesta.text();
      if (!cuerpo.trim()) throw new Error('respuesta vacía');
      return { cuerpo, modo };
    } catch (error) {
      ultimoError = error;
      if (intento < REINTENTOS) {
        const espera = 2000 * 2 ** (intento - 1);
        console.log(`    intento ${intento} falló (${error.message}); reintento en ${espera / 1000}s`);
        await new Promise((r) => setTimeout(r, espera));
      }
    } finally {
      clearTimeout(reloj);
    }
  }
  throw new Error(`no se pudo descargar ${url}: ${ultimoError.message}`);
}

function leerManifiestoAnterior() {
  if (!existsSync(MANIFIESTO)) return {};
  try {
    return JSON.parse(readFileSync(MANIFIESTO, 'utf8'));
  } catch {
    return {};
  }
}

function resumen(entradas) {
  console.log('\n--- Resumen ---');
  let total = 0;
  let bytes = 0;
  for (const e of entradas) {
    total += e.registros || 0;
    const archivo = join(DESTINO, e.archivo);
    if (existsSync(archivo)) bytes += statSync(archivo).size;
    const marca = e.estado === 'ok' ? 'ok      ' : `${e.estado.padEnd(8)}`;
    console.log(`${marca} ${String(e.registros).padStart(7)}  ${e.id}`);
  }
  console.log(`         ${String(total).padStart(7)}  TOTAL · ${(bytes / 1048576).toFixed(1)} MB en disco`);
}

principal();

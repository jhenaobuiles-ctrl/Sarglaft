// Medida de parecido entre un nombre consultado y un nombre de lista.
//
// El problema real no es la distancia de edición: es que las listas escriben
// "RESTREPO OSPINA, JUAN CARLOS" y la consulta llega como "Juan Carlos
// Restrepo Ospina". Por eso el peso está en la comparación por conjuntos de
// tokens y no en la cadena completa.

import { normalizarNombre, tokensSignificativos } from './normalizar.js';

/**
 * Similitud de Jaro-Winkler. Devuelve 0..1.
 * Premia las coincidencias de prefijo, que es lo típico en errores de
 * transcripción de apellidos.
 */
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const ventana = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const usadosA = new Array(a.length).fill(false);
  const usadosB = new Array(b.length).fill(false);

  let coincidencias = 0;
  for (let i = 0; i < a.length; i++) {
    const desde = Math.max(0, i - ventana);
    const hasta = Math.min(b.length, i + ventana + 1);
    for (let j = desde; j < hasta; j++) {
      if (usadosB[j] || a[i] !== b[j]) continue;
      usadosA[i] = true;
      usadosB[j] = true;
      coincidencias++;
      break;
    }
  }
  if (coincidencias === 0) return 0;

  let transposiciones = 0;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (!usadosA[i]) continue;
    while (!usadosB[j]) j++;
    if (a[i] !== b[j]) transposiciones++;
    j++;
  }
  transposiciones /= 2;

  const jaro =
    (coincidencias / a.length +
      coincidencias / b.length +
      (coincidencias - transposiciones) / coincidencias) /
    3;

  let prefijo = 0;
  const tope = Math.min(4, a.length, b.length);
  while (prefijo < tope && a[prefijo] === b[prefijo]) prefijo++;

  return jaro + prefijo * 0.1 * (1 - jaro);
}

// Umbral por token: por debajo de esto dos tokens se consideran distintos.
// Con tokens cortos exigimos igualdad exacta, porque en nombres de tres o
// cuatro letras casi cualquier par pasa el umbral difuso.
const JW_MINIMO_TOKEN = 0.9;
const LONGITUD_MINIMA_DIFUSA = 4;

function similitudToken(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < LONGITUD_MINIMA_DIFUSA) return 0;
  const jw = jaroWinkler(a, b);
  return jw >= JW_MINIMO_TOKEN ? jw : 0;
}

/** Para cada token de `origen`, su mejor parecido en `destino`. Promedio. */
function cobertura(origen, destino) {
  if (origen.length === 0) return 0;
  let suma = 0;
  for (const t of origen) {
    let mejor = 0;
    for (const u of destino) {
      const s = similitudToken(t, u);
      if (s > mejor) mejor = s;
      if (mejor === 1) break;
    }
    suma += mejor;
  }
  return suma / origen.length;
}

/**
 * Parecido entre dos listas de tokens, como F1 de las coberturas en ambos
 * sentidos.
 *
 * La simetría es lo que impide el falso positivo clásico: consultar "Juan
 * Restrepo" contra la entrada "Juan Carlos Restrepo Ospina Mejía" cubre el
 * 100% de la consulta, pero solo el 40% de la entrada. Con cobertura simple
 * eso daría alerta; con F1 da 0,57 y se descarta.
 */
export function similitudTokens(tokensA, tokensB) {
  const a = cobertura(tokensA, tokensB);
  const b = cobertura(tokensB, tokensA);
  if (a + b === 0) return 0;
  return (2 * a * b) / (a + b);
}

const PESO_TOKENS = 0.75;
const PESO_CADENA = 0.25;

/**
 * Puntúa un nombre consultado contra un nombre de lista. Devuelve 0..1.
 *
 * @param {string[]} tokensConsulta tokens significativos ya normalizados
 * @param {string} ordenadaConsulta tokens de la consulta ordenados y unidos
 * @param {string} nombreCandidato nombre crudo del registro de la lista
 */
export function puntuar(tokensConsulta, ordenadaConsulta, nombreCandidato) {
  const tokensCandidato = tokensSignificativos(nombreCandidato);
  if (tokensCandidato.length === 0 || tokensConsulta.length === 0) return 0;

  const porTokens = similitudTokens(tokensConsulta, tokensCandidato);
  // Ordenar alfabéticamente neutraliza el cambio de orden entre nombres y
  // apellidos antes de comparar las cadenas completas.
  const ordenadaCandidato = [...tokensCandidato].sort().join(' ');
  const porCadena = jaroWinkler(ordenadaConsulta, ordenadaCandidato);

  return PESO_TOKENS * porTokens + PESO_CADENA * porCadena;
}

/** Prepara una consulta una sola vez para puntuarla contra muchos candidatos. */
export function prepararConsulta(nombre) {
  const tokens = tokensSignificativos(nombre);
  return {
    normal: normalizarNombre(nombre),
    tokens,
    ordenada: [...tokens].sort().join(' '),
  };
}

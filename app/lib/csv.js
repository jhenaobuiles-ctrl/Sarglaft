// Lector y escritor de CSV conforme a RFC 4180, sin dependencias.
// Lo usan el parser de la lista del Reino Unido y la carga de contrapartes
// para el cruce masivo.

/**
 * Convierte texto CSV en un arreglo de filas (arreglos de celdas).
 * Maneja comillas, comas dentro de comillas, comillas escapadas ("") y
 * saltos de línea CRLF o LF.
 *
 * @param {string} texto
 * @param {string} separador coma por defecto; el Excel en español usa punto y coma
 */
export function leerCSV(texto, separador = ',') {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += c;
      }
      continue;
    }

    if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else if (c === '\r') {
      // parte de un CRLF; el \n siguiente cierra la fila
    } else {
      celda += c;
    }
  }
  if (celda !== '' || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/**
 * Detecta el separador más probable mirando las primeras líneas.
 * Excel en configuración regional española exporta con punto y coma.
 */
export function detectarSeparador(texto) {
  const muestra = texto.slice(0, 8000).split('\n').slice(0, 10).join('\n');
  const cuenta = (s) => (muestra.split(s).length - 1);
  const candidatos = [
    [',', cuenta(',')],
    [';', cuenta(';')],
    ['\t', cuenta('\t')],
    ['|', cuenta('|')],
  ];
  candidatos.sort((a, b) => b[1] - a[1]);
  return candidatos[0][1] > 0 ? candidatos[0][0] : ',';
}

/**
 * Convierte filas en objetos usando una fila de encabezado.
 * `buscarEncabezado` recibe una fila y devuelve true si es el encabezado; sirve
 * para los CSV oficiales que traen líneas de título antes de las columnas.
 */
export function filasAObjetos(filas, buscarEncabezado) {
  let inicio = 0;
  if (buscarEncabezado) {
    inicio = filas.findIndex((f) => buscarEncabezado(f));
    if (inicio === -1) return { encabezado: [], objetos: [] };
  }
  const encabezado = filas[inicio].map((h) => h.trim());
  const objetos = [];
  for (let i = inicio + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.length === 1 && fila[0].trim() === '') continue;
    const obj = {};
    for (let j = 0; j < encabezado.length; j++) {
      obj[encabezado[j]] = (fila[j] || '').trim();
    }
    objetos.push(obj);
  }
  return { encabezado, objetos };
}

/** Escribe filas en CSV con BOM, para que Excel abra bien los acentos. */
export function escribirCSV(filas, separador = ',') {
  const escapar = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n\r]|[,;\t|]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + filas.map((f) => f.map(escapar).join(separador)).join('\r\n');
}

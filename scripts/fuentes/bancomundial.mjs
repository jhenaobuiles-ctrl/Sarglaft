// Banco Mundial — firmas e individuos inhabilitados (debarred).
//
// Relevante para la debida diligencia sobre proveedores: no es una lista de
// sanciones financieras, sino de contratistas excluidos por fraude o
// corrupción en proyectos financiados por el Banco.

import { registro, fechaISO } from '../lib/registro.mjs';

export const meta = {
  id: 'bancomundial',
  nombre: 'Banco Mundial — Firmas e individuos inhabilitados',
  fuente:
    'https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNCE_MGR/FIRM/SANCTIONED_FIRM',
  autoridad: 'Grupo Banco Mundial',
  vinculante: false,
  formato: 'json',
};

export function parsear(contenido) {
  const datos = typeof contenido === 'string' ? JSON.parse(contenido) : contenido;
  const filas = primerArregloDeObjetos(datos);

  const registros = filas.map((fila, indice) => {
    const nombre = valor(fila, ['SUPP_NAME', 'FIRM_NAME', 'NAME']);
    const desde = fechaISO(valor(fila, ['DEBAR_FROM_DATE', 'FROM_DATE']));
    const hasta = fechaISO(valor(fila, ['DEBAR_TO_DATE', 'TO_DATE']));
    const pais = valor(fila, ['COUNTRY_NAME', 'COUNTRY']);
    const motivo = valor(fila, ['DEBAR_REASON', 'GROUNDS']);

    return registro({
      id: `BM-${valor(fila, ['SUPP_ID', 'ID']) || indice}`,
      // El Banco Mundial no distingue persona de empresa en este archivo; la
      // inmensa mayoría son firmas.
      tipo: 'E',
      nombre,
      nacionalidades: pais ? [pais] : [],
      programa: 'Inhabilitación Banco Mundial',
      fechaListado: desde,
      observaciones: [motivo, hasta ? `Inhabilitado hasta ${hasta}` : '']
        .filter(Boolean)
        .join('. '),
    });
  });

  return { fechaPublicacion: '', registros: registros.filter((r) => r.n) };
}

// El envoltorio de la respuesta ha cambiado de nombre entre versiones de la
// API, así que buscamos el primer arreglo de objetos que aparezca.
function primerArregloDeObjetos(datos) {
  const pila = [datos];
  while (pila.length) {
    const actual = pila.shift();
    if (Array.isArray(actual)) {
      if (actual.length === 0 || typeof actual[0] === 'object') return actual;
      continue;
    }
    if (actual && typeof actual === 'object') {
      for (const v of Object.values(actual)) pila.push(v);
    }
  }
  return [];
}

function valor(fila, claves) {
  for (const clave of claves) {
    if (fila[clave] !== undefined && fila[clave] !== null && String(fila[clave]).trim()) {
      return String(fila[clave]).trim();
    }
  }
  return '';
}

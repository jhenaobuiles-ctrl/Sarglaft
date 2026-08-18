// Banco Mundial — firmas e individuos inhabilitados (debarred).
//
// Relevante para la debida diligencia sobre proveedores: no es una lista de
// sanciones financieras, sino de contratistas excluidos por fraude o
// corrupción en proyectos financiados por el Banco.
//
// El endpoint que usaba la web del Banco
// (apigwext.worldbank.org/dvsvc/.../SANCTIONED_FIRM) dejó de aceptar
// peticiones anónimas y responde 401. La vía abierta que queda es el portal
// de datos financieros, que corre sobre Socrata: su catálogo y sus conjuntos
// de datos no piden credenciales. Como el identificador del conjunto puede
// cambiar, se resuelve por búsqueda en el catálogo en vez de fijarlo.

import { registro, fechaISO } from '../lib/registro.mjs';

const PORTAL = 'https://finances.worldbank.org';
const TOPE_FILAS = 50000;

export const meta = {
  id: 'bancomundial',
  nombre: 'Banco Mundial — Firmas e individuos inhabilitados',
  fuente: `${PORTAL}/browse?q=debarred`,
  catalogo: `${PORTAL}/api/catalog/v1?only=dataset&limit=25&q=debarred%20firms`,
  autoridad: 'Grupo Banco Mundial',
  vinculante: false,
  formato: 'json',
};

/**
 * Encuentra el conjunto de datos vigente en el catálogo del portal.
 * @param {(url:string)=>Promise<{cuerpo:string}>} descargar
 */
export async function resolver(descargar) {
  const { cuerpo } = await descargar(meta.catalogo);
  const catalogo = JSON.parse(cuerpo);
  const id = elegirConjunto(catalogo);
  if (!id) throw new Error('el catálogo no expone un conjunto de firmas inhabilitadas');
  return { url: `${PORTAL}/resource/${id}.json?$limit=${TOPE_FILAS}` };
}

/**
 * Elige el conjunto de datos cuyo nombre habla de firmas inhabilitadas.
 *
 * Descarta explícitamente los conjuntos históricos o archivados: tomar uno de
 * esos como fuente daría inhabilitaciones vencidas y, peor, dejaría fuera las
 * vigentes.
 */
export function elegirConjunto(catalogo) {
  const resultados = catalogo.results || [];
  const candidatos = resultados
    .map((r) => r.resource || {})
    .filter((r) => r.id && /debarred|ineligible/i.test(`${r.name || ''} ${r.description || ''}`))
    .filter((r) => !/hist[oó]ric|archiv|deprecated|obsolet/i.test(r.name || ''));
  if (!candidatos.length) return null;
  const exacto = candidatos.find((r) => /^debarred\s+firms\s*$/i.test((r.name || '').trim()));
  return (exacto || candidatos[0]).id;
}

export function parsear(contenido) {
  const datos = typeof contenido === 'string' ? JSON.parse(contenido) : contenido;
  const filas = primerArregloDeObjetos(datos);

  const registros = filas.map((fila, indice) => {
    const nombre = valor(fila, 'supp_name', 'firm_name', 'name', 'firm');
    const desde = fechaISO(valor(fila, 'debar_from_date', 'from_date', 'ineligibility_from_date'));
    const hasta = fechaISO(valor(fila, 'debar_to_date', 'to_date', 'ineligibility_to_date'));
    const pais = valor(fila, 'country_name', 'country');
    const motivo = valor(fila, 'debar_reason', 'grounds');
    const ciudad = valor(fila, 'city_name', 'supp_addr_city_name', 'city');

    return registro({
      id: `BM-${valor(fila, 'supp_id', 'id') || indice}`,
      // El archivo no distingue persona de empresa; la inmensa mayoría son firmas.
      tipo: 'E',
      nombre,
      nacionalidades: pais ? [pais] : [],
      programa: 'Inhabilitación Banco Mundial',
      fechaListado: desde,
      observaciones: [
        motivo,
        ciudad ? `Ciudad: ${ciudad}` : '',
        hasta ? `Inhabilitado hasta ${hasta}` : '',
      ]
        .filter(Boolean)
        .join('. '),
    });
  });

  return { fechaPublicacion: '', registros: registros.filter((r) => r.n) };
}

// El envoltorio de la respuesta cambia entre APIs (Socrata devuelve el arreglo
// desnudo; la API anterior lo anidaba), así que buscamos el primer arreglo de
// objetos que aparezca.
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

// Socrata usa minúsculas con guión bajo; la API anterior usaba mayúsculas.
// Buscamos sin distinguir may/min para servir a las dos.
function valor(fila, ...claves) {
  const indice = new Map(Object.keys(fila).map((k) => [k.toLowerCase(), k]));
  for (const clave of claves) {
    const real = indice.get(clave.toLowerCase());
    if (real === undefined) continue;
    const v = fila[real];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return '';
}

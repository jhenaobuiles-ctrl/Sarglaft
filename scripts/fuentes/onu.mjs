// Lista Consolidada del Consejo de Seguridad de las Naciones Unidas.
//
// Es la única lista estrictamente vinculante en Colombia: su aplicación es
// obligatoria y no depende del criterio del sujeto obligado.

import { parsearXML, buscarTodos, texto, textos, hijo, hijos, attr } from '../lib/xml.mjs';
import { registro, fechaISO } from '../lib/registro.mjs';

export const meta = {
  id: 'onu',
  nombre: 'Consejo de Seguridad ONU — Lista Consolidada',
  fuente: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  autoridad: 'Organización de las Naciones Unidas',
  vinculante: true,
  // El Consejo de Seguridad no publica a diario, pero un mes entero sin
  // movimiento en la única lista vinculante en Colombia merece una mirada.
  toleranciaDias: 30,
  formato: 'xml',
};

export function parsear(contenido) {
  const doc = parsearXML(contenido);
  const raiz = hijo(doc, 'CONSOLIDATED_LIST') || doc;
  const fechaPublicacion = fechaISO(attr(raiz, 'dateGenerated'));

  const registros = [];
  for (const nodo of buscarTodos(doc, 'INDIVIDUAL')) {
    registros.push(individuo(nodo));
  }
  for (const nodo of buscarTodos(doc, 'ENTITY')) {
    registros.push(entidad(nodo));
  }
  return { fechaPublicacion, registros };
}

function nombreCompleto(nodo) {
  return ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME']
    .map((campo) => texto(nodo, campo))
    .filter(Boolean)
    .join(' ');
}

function comunes(nodo) {
  return {
    id: `ONU-${texto(nodo, 'DATAID') || texto(nodo, 'REFERENCE_NUMBER')}`,
    programa: texto(nodo, 'UN_LIST_TYPE'),
    fechaListado: fechaISO(texto(nodo, 'LISTED_ON')),
    observaciones: texto(nodo, 'COMMENTS1'),
  };
}

function individuo(nodo) {
  const alias = hijos(nodo, 'INDIVIDUAL_ALIAS')
    .map((a) => texto(a, 'ALIAS_NAME'))
    .filter(Boolean);

  const documentos = hijos(nodo, 'INDIVIDUAL_DOCUMENT').map((d) => ({
    tipo: texto(d, 'TYPE_OF_DOCUMENT') || texto(d, 'TYPE_OF_DOCUMENT2'),
    numero: texto(d, 'NUMBER'),
    pais: texto(d, 'ISSUING_COUNTRY') || texto(d, 'COUNTRY_OF_ISSUE'),
  }));

  const nacionalidades = [];
  for (const n of hijos(nodo, 'NATIONALITY')) {
    nacionalidades.push(...textos(n, 'VALUE'));
  }

  const nacimientos = hijos(nodo, 'INDIVIDUAL_DATE_OF_BIRTH')
    .map((f) => fechaISO(texto(f, 'DATE') || texto(f, 'YEAR') || texto(f, 'FROM_YEAR')))
    .filter(Boolean);

  return registro({
    ...comunes(nodo),
    tipo: 'P',
    nombre: nombreCompleto(nodo),
    alias,
    documentos,
    nacionalidades,
    nacimientos,
  });
}

function entidad(nodo) {
  const alias = hijos(nodo, 'ENTITY_ALIAS')
    .map((a) => texto(a, 'ALIAS_NAME'))
    .filter(Boolean);

  return registro({
    ...comunes(nodo),
    tipo: 'E',
    nombre: nombreCompleto(nodo),
    alias,
  });
}

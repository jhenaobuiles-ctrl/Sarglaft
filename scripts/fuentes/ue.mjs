// Unión Europea — Consolidated Financial Sanctions List (FSD).
//
// Particularidad del formato: casi todo viaja en atributos XML, no en texto.

import { parsearXML, buscarTodos, attr, hijo } from '../lib/xml.mjs';
import { registro, fechaISO } from '../lib/registro.mjs';

export const meta = {
  id: 'ue',
  nombre: 'Unión Europea — Lista Consolidada de Sanciones Financieras',
  // El token es público y lo publica la propia Comisión Europea; no es una
  // credencial. Aun así puede rotar: si esta descarga empieza a fallar hay que
  // buscar el token vigente en la ficha del conjunto de datos.
  fuente:
    'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
  autoridad: 'Comisión Europea',
  vinculante: false,
  formato: 'xml',
};

const TIPOS = { P: 'P', E: 'E', B: 'B' };

export function parsear(contenido) {
  const doc = parsearXML(contenido);
  const raiz = hijo(doc, 'export') || doc.hijos[0];
  const fechaPublicacion = fechaISO(attr(raiz, 'generationDate'));

  const registros = buscarTodos(doc, 'sanctionEntity').map(entidad);
  return { fechaPublicacion, registros };
}

function entidad(nodo) {
  const clasificacion = attr(buscarTodos(nodo, 'subjectType')[0], 'classificationCode');

  const nombres = buscarTodos(nodo, 'nameAlias')
    .map((n) => attr(n, 'wholeName') || unirPartes(n))
    .filter(Boolean);

  const documentos = buscarTodos(nodo, 'identification')
    .map((d) => ({
      tipo: attr(d, 'identificationTypeDescription') || attr(d, 'identificationTypeCode'),
      numero: attr(d, 'number') || attr(d, 'latinNumber'),
      pais: attr(d, 'countryIso2Code') || attr(d, 'countryDescription'),
    }))
    .filter((d) => d.numero);

  const nacionalidades = buscarTodos(nodo, 'citizenship')
    .map((c) => attr(c, 'countryDescription') || attr(c, 'countryIso2Code'))
    .filter(Boolean);

  const nacimientos = buscarTodos(nodo, 'birthdate')
    .map((b) => fechaISO(attr(b, 'birthdate') || attr(b, 'year')))
    .filter(Boolean);

  const regulaciones = buscarTodos(nodo, 'regulation');
  const programa = regulaciones
    .map((r) => attr(r, 'programme'))
    .filter(Boolean)[0] || '';
  const fechas = regulaciones
    .map((r) => fechaISO(attr(r, 'publicationDate')))
    .filter(Boolean)
    .sort();

  return registro({
    id: `UE-${attr(nodo, 'euReferenceNumber') || attr(nodo, 'logicalId')}`,
    tipo: TIPOS[clasificacion] || 'E',
    nombre: nombres[0] || '',
    alias: nombres.slice(1),
    documentos,
    nacionalidades,
    nacimientos,
    programa,
    fechaListado: fechas[0] || '',
    observaciones: attr(nodo, 'remark') || attr(nodo, 'designationDetails'),
  });
}

function unirPartes(nodo) {
  return ['firstName', 'middleName', 'lastName']
    .map((campo) => attr(nodo, campo))
    .filter(Boolean)
    .join(' ');
}

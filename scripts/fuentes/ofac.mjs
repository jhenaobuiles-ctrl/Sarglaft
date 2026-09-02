// OFAC — Office of Foreign Assets Control del Tesoro de Estados Unidos.
//
// Dos listas con el mismo esquema XML:
//   SDN          la "lista Clinton", con miles de designaciones colombianas
//   CONSOLIDATED las listas no-SDN (sectoriales, NS-MBS, etc.)
//
// Las designaciones sobre Colombia casi siempre traen la cédula o el NIT en
// <idList>, que es la coincidencia más fuerte que puede dar el motor.

import { parsearXML, buscarTodos, texto, hijo, attr } from '../lib/xml.mjs';
import { registro, fechaISO } from '../lib/registro.mjs';

const TIPOS = {
  individual: 'P',
  entity: 'E',
  vessel: 'B',
  aircraft: 'B',
};

// La tolerancia va por lista y no por fuente: la OFAC mueve la de designados
// casi cada semana y la consolidada apenas unas veces al año. Un mismo umbral
// gritaría en falso sobre la segunda o se quedaría callado sobre la primera.
function construir(id, nombre, url, toleranciaDias) {
  return {
    meta: {
      id,
      nombre,
      fuente: url,
      autoridad: 'OFAC — Departamento del Tesoro de Estados Unidos',
      vinculante: false,
      toleranciaDias,
      formato: 'xml',
    },
    parsear: (contenido) => parsearOFAC(contenido, id),
  };
}

export const sdn = construir(
  'ofac_sdn',
  'OFAC — Specially Designated Nationals (lista Clinton)',
  'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML',
  30,
);

export const noSdn = construir(
  'ofac_nosdn',
  'OFAC — Consolidated Sanctions List (no SDN)',
  'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONSOLIDATED.XML',
  120,
);

function parsearOFAC(contenido, prefijo) {
  const doc = parsearXML(contenido);

  const info = buscarTodos(doc, 'publshInformation')[0];
  let fechaPublicacion = info ? fechaISO(texto(info, 'Publish_Date')) : '';
  if (!fechaPublicacion) {
    const raiz = doc.hijos[0];
    fechaPublicacion = fechaISO(attr(raiz, 'dateOfIssue'));
  }

  const registros = buscarTodos(doc, 'sdnEntry').map((nodo) =>
    entrada(nodo, prefijo),
  );
  return { fechaPublicacion, registros };
}

// OFAC parte el nombre en dos campos; en las entidades solo usa lastName.
function unirNombre(nodo) {
  return [texto(nodo, 'firstName'), texto(nodo, 'lastName')]
    .filter(Boolean)
    .join(' ');
}

function entrada(nodo, prefijo) {
  const tipoCrudo = texto(nodo, 'sdnType').toLowerCase();

  const alias = buscarTodos(hijo(nodo, 'akaList') || vacio, 'aka')
    .map(unirNombre)
    .filter(Boolean);

  const documentos = buscarTodos(hijo(nodo, 'idList') || vacio, 'id').map((d) => ({
    tipo: texto(d, 'idType'),
    numero: texto(d, 'idNumber'),
    pais: texto(d, 'idCountry'),
  }));

  const nacionalidades = [
    ...buscarTodos(hijo(nodo, 'nationalityList') || vacio, 'nationality'),
    ...buscarTodos(hijo(nodo, 'citizenshipList') || vacio, 'citizenship'),
  ]
    .map((n) => texto(n, 'country'))
    .filter(Boolean);

  const nacimientos = buscarTodos(
    hijo(nodo, 'dateOfBirthList') || vacio,
    'dateOfBirthItem',
  )
    .map((f) => fechaISO(texto(f, 'dateOfBirth')))
    .filter(Boolean);

  const programas = buscarTodos(hijo(nodo, 'programList') || vacio, 'program')
    .map((p) => p.texto.trim())
    .filter(Boolean);

  return registro({
    id: `${prefijo.toUpperCase()}-${texto(nodo, 'uid')}`,
    tipo: TIPOS[tipoCrudo] || 'E',
    nombre: unirNombre(nodo),
    alias,
    documentos,
    nacionalidades,
    nacimientos,
    programa: programas.join(', '),
    observaciones: texto(nodo, 'remarks'),
  });
}

const vacio = { nombre: '#vacio', attrs: null, hijos: [], texto: '' };

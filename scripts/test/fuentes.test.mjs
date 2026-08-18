import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as onu from '../fuentes/onu.mjs';
import { sdn } from '../fuentes/ofac.mjs';

const fixture = (nombre) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${nombre}`, import.meta.url)), 'utf8');

test('ONU: lee individuos y entidades con su fecha de publicación', () => {
  const { fechaPublicacion, registros } = onu.parsear(fixture('onu.xml'));
  assert.equal(fechaPublicacion, '2026-08-15');
  assert.equal(registros.length, 3);

  const hambali = registros.find((r) => r.i === 'ONU-6908095');
  assert.equal(hambali.t, 'P');
  assert.equal(hambali.n, 'RIDUAN ISAMUDDIN');
  assert.deepEqual(hambali.a, ['Hambali', 'Nurjaman Riduan Isamuddin']); // el alias vacío se descarta
  assert.deepEqual(hambali.nc, ['Indonesia']);
  assert.deepEqual(hambali.fn, ['1964-04-04']);
  assert.deepEqual(hambali.d, [{ n: 'A 123456', t: 'Passport', p: 'Indonesia' }]);
  assert.equal(hambali.pg, 'Al-Qaida');
  assert.equal(hambali.fl, '2003-01-28');
});

test('ONU: une los cuatro campos de nombre en el orden publicado', () => {
  const { registros } = onu.parsear(fixture('onu.xml'));
  const colombiano = registros.find((r) => r.i === 'ONU-6908200');
  assert.equal(colombiano.n, 'JUAN CARLOS RESTREPO OSPINA');
});

test('ONU: las entidades salen como tipo E', () => {
  const { registros } = onu.parsear(fixture('onu.xml'));
  const empresa = registros.find((r) => r.i === 'ONU-6908500');
  assert.equal(empresa.t, 'E');
  assert.equal(empresa.n, 'COMERCIALIZADORA ANDINA S.A.S.');
  assert.deepEqual(empresa.a, ['Andina Trading']);
});

test('OFAC: lee la fecha de publicación en formato estadounidense', () => {
  const { fechaPublicacion } = sdn.parsear(fixture('ofac_sdn.xml'));
  assert.equal(fechaPublicacion, '2026-08-14');
});

test('OFAC: une firstName y lastName y recoge los alias', () => {
  const { registros } = sdn.parsear(fixture('ofac_sdn.xml'));
  const persona = registros.find((r) => r.i === 'OFAC_SDN-7078');
  assert.equal(persona.t, 'P');
  assert.equal(persona.n, 'Jose Alfonso MORENO GARCIA');
  assert.deepEqual(persona.a, ['Pepe MORENO', 'EL FLACO']);
  assert.equal(persona.pg, 'SDNT, SDNTK');
});

test('OFAC: extrae la cédula estructurada, no del texto libre', () => {
  const { registros } = sdn.parsear(fixture('ofac_sdn.xml'));
  const persona = registros.find((r) => r.i === 'OFAC_SDN-7078');
  assert.deepEqual(persona.d, [
    { n: '16257988', t: 'Cedula No.', p: 'Colombia' },
    { n: 'AB123456', t: 'Passport', p: 'Colombia' },
  ]);
  assert.deepEqual(persona.fn, ['1965-11-12']);
});

test('OFAC: distingue entidad y buque', () => {
  const { registros } = sdn.parsear(fixture('ofac_sdn.xml'));
  assert.equal(registros.find((r) => r.i === 'OFAC_SDN-9001').t, 'E');
  assert.equal(registros.find((r) => r.i === 'OFAC_SDN-9500').t, 'B');
});

import * as ue from '../fuentes/ue.mjs';
import * as uk from '../fuentes/uk.mjs';
import * as bancomundial from '../fuentes/bancomundial.mjs';

test('UE: lee los datos que viajan en atributos', () => {
  const { fechaPublicacion, registros } = ue.parsear(fixture('ue.xml'));
  assert.equal(fechaPublicacion, '2026-08-16');
  assert.equal(registros.length, 2);

  const persona = registros.find((r) => r.i === 'UE-EU.27.28');
  assert.equal(persona.t, 'P');
  assert.equal(persona.n, 'Zine El Abidine BEN ALI');
  assert.deepEqual(persona.a, ['Zine Al Abidine BEN ALI']);
  assert.deepEqual(persona.nc, ['Túnez']);
  assert.deepEqual(persona.fn, ['1936-09-03']);
  // La identificación sin número se descarta.
  assert.deepEqual(persona.d, [{ n: 'Z000000', t: 'Passport', p: 'TN' }]);
  // De las dos regulaciones toma la más antigua como fecha de listado.
  assert.equal(persona.fl, '2009-01-05');
});

test('UE: la clasificación E sale como entidad', () => {
  const { registros } = ue.parsear(fixture('ue.xml'));
  assert.equal(registros.find((r) => r.i === 'UE-EU.99.1').t, 'E');
});

test('Reino Unido: agrupa por Unique ID aunque OFSI Group ID venga vacío', () => {
  const { fechaPublicacion, registros } = uk.parsear(fixture('uk.csv'));
  // "Report Date: 18-Aug-2026", la única línea sobre el encabezado.
  assert.equal(fechaPublicacion, '2026-08-18');
  // Cinco filas de nombre, tres designaciones.
  assert.equal(registros.length, 3);

  const persona = registros.find((r) => r.i === 'UK-COL0001');
  assert.equal(persona.n, 'Jose Alfonso MORENO GARCIA');
  assert.deepEqual(persona.a, ['Pepe MORENO', 'EL FLACO']);
});

test('Reino Unido: lee los documentos de las columnas reales del archivo', () => {
  const { registros } = uk.parsear(fixture('uk.csv'));
  const persona = registros.find((r) => r.i === 'UK-COL0001');
  assert.deepEqual(persona.d, [
    { n: 'AB123456', t: 'Pasaporte' },
    { n: '16257988', t: 'Documento nacional' },
  ]);
  // "D.O.B" normaliza a tres palabras, y el Reino Unido escribe día/mes/año.
  assert.deepEqual(persona.fn, ['1965-11-12']);
  assert.deepEqual(persona.nc, ['Colombia']);
  assert.equal(persona.fl, '2019-10-21');
});

test('Reino Unido: deduce el tipo de sujeto cuando la columna no lo declara', () => {
  const { registros } = uk.parsear(fixture('uk.csv'));
  // "Designation Type" dice "Asset Freeze": describe la sanción, no al sujeto.
  // El tipo tiene que salir de qué datos existen.
  assert.equal(registros.find((r) => r.i === 'UK-COL0001').t, 'P', 'tiene fecha de nacimiento y pasaporte');
  assert.equal(registros.find((r) => r.i === 'UK-COL0002').t, 'E', 'no tiene datos de persona ni de buque');
  assert.equal(registros.find((r) => r.i === 'UK-RUS9500').t, 'B', 'tiene número IMO');
});

test('Reino Unido: localiza el CSV vigente en la API de contenidos', () => {
  const respuesta = {
    details: {
      attachments: [
        { title: 'Notas explicativas', url: 'https://assets.publishing.service.gov.uk/x/notas.pdf' },
        { title: 'UK Sanctions List', url: 'https://assets.publishing.service.gov.uk/media/abc123/UK_Sanctions_List.csv' },
      ],
    },
  };
  assert.equal(
    uk.localizarCSV(respuesta),
    'https://assets.publishing.service.gov.uk/media/abc123/UK_Sanctions_List.csv',
  );
});

test('Reino Unido: sin adjunto CSV devuelve null en vez de inventar una URL', () => {
  assert.equal(uk.localizarCSV({ details: { attachments: [{ url: 'x.pdf' }] } }), null);
});

test('Banco Mundial: descarta el conjunto histórico y toma el vigente', () => {
  const catalogo = {
    results: [
      { resource: { id: 'aaaa-1111', name: 'Contract Awards' } },
      { resource: { id: 'bbbb-2222', name: 'Debarred Firms and Individuals (histórico)' } },
      { resource: { id: 'cccc-3333', name: 'Debarred Firms' } },
    ],
  };
  assert.equal(bancomundial.elegirConjunto(catalogo), 'cccc-3333');
});

test('Banco Mundial: sin conjunto aplicable devuelve null en vez de adivinar', () => {
  assert.equal(bancomundial.elegirConjunto({ results: [{ resource: { id: 'x', name: 'Loans' } }] }), null);
});

test('Banco Mundial: lee tanto las claves de Socrata como las de la API anterior', () => {
  const socrata = [{ supp_id: '9', firm_name: 'Acme Ltda', country: 'Colombia', from_date: '2024-05-07' }];
  const { registros } = bancomundial.parsear(JSON.stringify(socrata));
  assert.equal(registros.length, 1);
  assert.equal(registros[0].n, 'Acme Ltda');
  assert.equal(registros[0].fl, '2024-05-07');
});

test('Banco Mundial: encuentra el arreglo bajo cualquier envoltorio', () => {
  const { registros } = bancomundial.parsear(fixture('bancomundial.json'));
  // La fila sin nombre se descarta.
  assert.equal(registros.length, 1);
  assert.equal(registros[0].n, 'Constructora del Valle S.A.S.');
  assert.equal(registros[0].fl, '2024-05-07');
  assert.match(registros[0].ob, /Inhabilitado hasta 2027-05-07/);
});

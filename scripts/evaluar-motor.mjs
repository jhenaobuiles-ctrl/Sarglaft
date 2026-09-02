// Mide el motor contra las listas realmente publicadas.
//
// Los umbrales estaban calibrados contra un puñado de casos escritos a mano.
// Eso comprueba que el algoritmo hace lo que se pensó, no que se comporte bien
// sobre treinta y tres mil registros reales, que es lo único que importa.
//
// Se miden las dos formas de fallar, porque tirar del umbral arregla una y
// empeora la otra:
//
//   Ruido    — cuántos nombres corrientes, que no están en ninguna lista,
//              acaban en revisión o en alerta. Si un cruce de trescientos
//              alumnos devuelve cuarenta para revisar, nadie los revisa, y el
//              sistema deja de servir aunque técnicamente funcione.
//   Alcance  — cuántas variantes de un nombre que SÍ está designado se
//              siguen encontrando: sin tildes, con los apellidos delante, sin
//              el segundo apellido, con una errata. Es como llegan los
//              nombres en la vida real.
//
// No es una prueba con veredicto: es una medición que se lee. Corre contra
// los datos publicados, así que la cifra cambia cuando cambian las listas.
//
//   node scripts/evaluar-motor.mjs
//   node scripts/evaluar-motor.mjs --nombres 5000
//   node scripts/evaluar-motor.mjs --barrido      compara juegos de umbrales

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { crearMotor } from '../app/motor/consulta.js';
import { normalizarNombre } from '../app/motor/normalizar.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const LISTAS = join(AQUI, '..', 'data', 'listas');

const argumento = (nombre, porOmision) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : Number(process.argv[i + 1]) || porOmision;
};

const CUANTOS_NOMBRES = argumento('nombres', 2000);
const CUANTOS_DESIGNADOS = argumento('designados', 400);

/* ---------- nombres colombianos corrientes, generados ---------- */

// Compuestos, no tomados de ninguna base: en este repositorio no puede entrar
// un dato personal. Lo que importa es que se parezcan a lo que escribe una
// escuela de conducción —dos nombres y dos apellidos, apellidos frecuentes—
// porque el ruido aparece justo ahí.
const NOMBRES = [
  'Juan', 'Carlos', 'Luis', 'Andrés', 'Diego', 'Santiago', 'Jorge', 'Miguel',
  'Fernando', 'Ricardo', 'Camilo', 'Sebastián', 'Julián', 'Óscar', 'Álvaro',
  'María', 'Ana', 'Luisa', 'Paula', 'Daniela', 'Catalina', 'Valentina',
  'Sandra', 'Claudia', 'Diana', 'Mónica', 'Adriana', 'Natalia', 'Carolina',
];
const APELLIDOS = [
  'Gómez', 'Rodríguez', 'Martínez', 'López', 'García', 'Pérez', 'Sánchez',
  'Ramírez', 'Torres', 'Flórez', 'Rivera', 'Gutiérrez', 'Jiménez', 'Ruiz',
  'Álvarez', 'Moreno', 'Muñoz', 'Rojas', 'Castro', 'Ortiz', 'Vargas',
  'Restrepo', 'Ospina', 'Cardona', 'Betancur', 'Zapata', 'Arango', 'Mejía',
  'Quintero', 'Salazar', 'Velásquez', 'Agudelo', 'Henao', 'Marín', 'Grisales',
];

// Generador reproducible: la misma corrida da la misma medición, de modo que
// un cambio en la cifra viene del motor o de las listas, no del azar.
function azarFijo(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Dos poblaciones, y hay que medir las dos.
 *
 * Un nombre de cuatro palabras nunca pasa por la regla del «nombre corto», de
 * modo que medir el ruido solo con esos hace parecer gratis relajarla. Pero
 * media escuela se apunta como «Juan Pérez», y ahí esa regla es justo lo que
 * evita que media lista Clinton salga en revisión.
 */
function generarNombres(cuantos, aleatorio, palabras = 4) {
  const salida = new Set();
  const tomar = (lista) => lista[Math.floor(aleatorio() * lista.length)];
  while (salida.size < cuantos) {
    salida.add(
      palabras === 2
        ? `${tomar(NOMBRES)} ${tomar(APELLIDOS)}`
        : `${tomar(NOMBRES)} ${tomar(NOMBRES)} ${tomar(APELLIDOS)} ${tomar(APELLIDOS)}`,
    );
  }
  return [...salida];
}

/* ---------- variantes con las que llega un nombre en la vida real ---------- */

const VARIANTES = {
  'tal cual': (n) => n,
  'sin tildes': (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  'apellidos primero': (n) => {
    const p = n.trim().split(/\s+/);
    if (p.length < 4) return n;
    const mitad = Math.ceil(p.length / 2);
    return [...p.slice(mitad), ...p.slice(0, mitad)].join(' ');
  },
  'sin el último apellido': (n) => {
    const p = n.trim().split(/\s+/);
    return p.length > 2 ? p.slice(0, -1).join(' ') : n;
  },
  'sin el segundo nombre': (n) => {
    const p = n.trim().split(/\s+/);
    return p.length > 2 ? [p[0], ...p.slice(2)].join(' ') : n;
  },
  'con una errata': (n) => {
    const i = Math.floor(n.length / 2);
    return n.slice(0, i) + (n[i] === 'a' ? 'e' : 'a') + n.slice(i + 1);
  },
};

/* ---------- carga ---------- */

function cargarListas() {
  const manifiesto = JSON.parse(readFileSync(join(LISTAS, 'manifest.json'), 'utf8'));
  const listas = [];
  for (const entrada of manifiesto.listas) {
    if (entrada.estado === 'sin_datos') continue;
    const archivo = join(LISTAS, entrada.archivo);
    if (!readdirSync(LISTAS).includes(entrada.archivo)) continue;
    const datos = JSON.parse(readFileSync(archivo, 'utf8'));
    listas.push({
      ...entrada,
      registros: datos.registros || datos,
    });
  }
  return { manifiesto, listas };
}

/* ---------- las dos mediciones ---------- */

function medirRuido(motor, nombres) {
  const cuenta = { SIN_HALLAZGOS: 0, EN_REVISION: 0, ALERTA: 0 };
  const ejemplos = [];
  for (const nombre of nombres) {
    const r = motor.consultar({ nombre });
    cuenta[r.resultado]++;
    if (r.resultado !== 'SIN_HALLAZGOS' && ejemplos.length < 8) {
      const c = r.coincidencias[0];
      ejemplos.push(`${nombre} → ${c.registro.n} (${Math.round(c.puntaje * 100)}%, ${c.lista.nombre})`);
    }
  }
  return { cuenta, ejemplos, total: nombres.length };
}

function medirAlcance(motor, designados) {
  const porVariante = new Map();
  for (const nombre of Object.keys(VARIANTES)) {
    porVariante.set(nombre, { encontrado: 0, alerta: 0, total: 0, perdidos: [] });
  }

  for (const registro of designados) {
    for (const [etiqueta, transformar] of Object.entries(VARIANTES)) {
      const consultado = transformar(registro.n);
      const fila = porVariante.get(etiqueta);
      fila.total++;
      const r = motor.consultar({ nombre: consultado });
      const acertó = r.coincidencias.some((c) => c.registro.i === registro.i);
      if (acertó) {
        fila.encontrado++;
        if (r.resultado === 'ALERTA') fila.alerta++;
      } else if (fila.perdidos.length < 4) {
        fila.perdidos.push(`${consultado}  (era: ${registro.n})`);
      }
    }
  }
  return porVariante;
}

function medirDocumentos(motor, listas) {
  const conDocumento = [];
  for (const lista of listas) {
    for (const registro of lista.registros) {
      for (const doc of registro.d || []) {
        if (/^[0-9]{6,12}$/.test(doc.n)) conDocumento.push({ registro, doc });
      }
    }
  }
  const muestra = conDocumento.slice(0, 500);
  let exacto = 0;
  let conPuntos = 0;
  for (const { registro, doc } of muestra) {
    const tipo = doc.t || '';
    if (motor.consultar({ documento: doc.n, tipoDocumento: tipo }).coincidencias
      .some((c) => c.registro.i === registro.i)) exacto++;
    // El mismo número escrito como lo escribe una persona.
    const punteado = doc.n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (motor.consultar({ documento: punteado, tipoDocumento: tipo }).coincidencias
      .some((c) => c.registro.i === registro.i)) conPuntos++;
  }
  return { total: muestra.length, exacto, conPuntos };
}

/**
 * Compara juegos de umbrales sobre los mismos datos.
 *
 * Subir un umbral quita ruido y pierde hallazgos; bajarlo hace lo contrario.
 * La única forma honesta de elegir es ver las dos cifras a la vez sobre los
 * registros reales, en vez de discutirlo en abstracto.
 */
function barrer(listas, nombres, cortos, designados, colombianos) {
  const juegos = [
    { etiqueta: 'actual', umbrales: {} },
    { etiqueta: 'corto 0.90', umbrales: { revisionNombreCorto: 0.9 } },
    { etiqueta: 'corto 0.87', umbrales: { revisionNombreCorto: 0.87 } },
    { etiqueta: 'corto 0.85', umbrales: { revisionNombreCorto: 0.85 } },
    { etiqueta: 'corto 0.82', umbrales: { revisionNombreCorto: 0.82 } },
    { etiqueta: 'corto 0.80', umbrales: { revisionNombreCorto: 0.8 } },
    { etiqueta: 'largo 0.75', umbrales: { revision: 0.75 } },
    { etiqueta: 'corto 0.85 + largo 0.75', umbrales: { revisionNombreCorto: 0.85, revision: 0.75 } },
  ];

  console.log('\nBARRIDO DE UMBRALES');
  console.log('  ruido = cuántas contrapartes de cada 300 saldrían a revisar de más');
  console.log(
    `  ${'juego'.padEnd(24)} ${'ruido 4 pal.'.padStart(12)} ${'ruido 2 pal.'.padStart(12)} ${'sin apellido'.padStart(13)} ${'col. sin ap.'.padStart(13)}`,
  );

  const porTrescientos = (motor, poblacion) => {
    const r = medirRuido(motor, poblacion);
    return ((r.cuenta.EN_REVISION + r.cuenta.ALERTA) / r.total) * 300;
  };

  for (const juego of juegos) {
    const motor = crearMotor(listas, { umbrales: juego.umbrales });
    const alcance = medirAlcance(motor, designados);
    const colombiano = medirAlcance(motor, colombianos);
    const pct = (m, k) => porcentaje(m.get(k).encontrado, m.get(k).total) + '%';
    console.log(
      `  ${juego.etiqueta.padEnd(24)} ${porTrescientos(motor, nombres).toFixed(1).padStart(12)} ` +
        `${porTrescientos(motor, cortos).toFixed(1).padStart(12)} ` +
        `${pct(alcance, 'sin el último apellido').padStart(13)} ${pct(colombiano, 'sin el último apellido').padStart(13)}`,
    );
  }
}

/* ---------- salida ---------- */

const porcentaje = (parte, total) => (total ? ((parte / total) * 100).toFixed(1) : '0.0');

function principal() {
  const { manifiesto, listas } = cargarListas();
  const registros = listas.reduce((n, l) => n + l.registros.length, 0);

  console.log(`Manifiesto del ${manifiesto.generado}`);
  console.log(`${registros.toLocaleString('es-CO')} registros en ${listas.length} listas\n`);

  const inicio = Date.now();
  const motor = crearMotor(listas);
  console.log(`Índice construido en ${Date.now() - inicio} ms\n`);

  /* Ruido */
  const aleatorio = azarFijo(20260902);
  const nombres = generarNombres(CUANTOS_NOMBRES, aleatorio);
  const cortos = generarNombres(CUANTOS_NOMBRES, azarFijo(777), 2);
  const t1 = Date.now();
  const ruido = medirRuido(motor, nombres);
  const msPorConsulta = ((Date.now() - t1) / nombres.length).toFixed(2);

  console.log('RUIDO — nombres corrientes que no están en ninguna lista');
  console.log('  (a) nombre completo: dos nombres y dos apellidos');
  console.log(`  ${ruido.total.toLocaleString('es-CO')} consultas · ${msPorConsulta} ms cada una`);
  console.log(`  sin hallazgos  ${String(ruido.cuenta.SIN_HALLAZGOS).padStart(6)}  ${porcentaje(ruido.cuenta.SIN_HALLAZGOS, ruido.total)}%`);
  console.log(`  en revisión    ${String(ruido.cuenta.EN_REVISION).padStart(6)}  ${porcentaje(ruido.cuenta.EN_REVISION, ruido.total)}%`);
  console.log(`  con alerta     ${String(ruido.cuenta.ALERTA).padStart(6)}  ${porcentaje(ruido.cuenta.ALERTA, ruido.total)}%`);
  const porCadaTrescientos = (
    ((ruido.cuenta.EN_REVISION + ruido.cuenta.ALERTA) / ruido.total) * 300
  ).toFixed(1);
  console.log(`  → en un cruce de 300 alumnos saldrían ${porCadaTrescientos} para revisar de más`);
  if (ruido.ejemplos.length) {
    console.log('  ejemplos:');
    for (const e of ruido.ejemplos) console.log(`    ${e}`);
  }

  // La otra mitad de la realidad: media escuela se apunta con un nombre y un
  // apellido, y ahí es donde muerde la regla del nombre corto.
  const ruidoCorto = medirRuido(motor, cortos);
  const sucioCorto = ruidoCorto.cuenta.EN_REVISION + ruidoCorto.cuenta.ALERTA;
  console.log('\n  (b) solo un nombre y un apellido');
  console.log(`  sin hallazgos  ${String(ruidoCorto.cuenta.SIN_HALLAZGOS).padStart(6)}  ${porcentaje(ruidoCorto.cuenta.SIN_HALLAZGOS, ruidoCorto.total)}%`);
  console.log(`  en revisión    ${String(ruidoCorto.cuenta.EN_REVISION).padStart(6)}  ${porcentaje(ruidoCorto.cuenta.EN_REVISION, ruidoCorto.total)}%`);
  console.log(`  con alerta     ${String(ruidoCorto.cuenta.ALERTA).padStart(6)}  ${porcentaje(ruidoCorto.cuenta.ALERTA, ruidoCorto.total)}%`);
  console.log(`  → ${((sucioCorto / ruidoCorto.total) * 300).toFixed(1)} de cada 300 saldrían a revisar de más`);

  /* Alcance */
  const personas = [];
  for (const lista of listas) {
    for (const r of lista.registros) {
      if (r.t === 'P' && normalizarNombre(r.n).split(' ').length >= 3) personas.push(r);
    }
  }
  const paso = Math.max(1, Math.floor(personas.length / CUANTOS_DESIGNADOS));
  const muestra = personas.filter((unused, i) => i % paso === 0).slice(0, CUANTOS_DESIGNADOS);

  console.log(`\nALCANCE — ${muestra.length} designados reales, escritos como llegan en la práctica`);
  const alcance = medirAlcance(motor, muestra);
  console.log(`  ${'variante'.padEnd(24)} ${'encontrado'.padStart(11)} ${'como alerta'.padStart(12)}`);
  for (const [etiqueta, fila] of alcance) {
    console.log(
      `  ${etiqueta.padEnd(24)} ${(porcentaje(fila.encontrado, fila.total) + '%').padStart(11)} ${(porcentaje(fila.alerta, fila.total) + '%').padStart(12)}`,
    );
  }
  for (const [etiqueta, fila] of alcance) {
    if (fila.perdidos.length && etiqueta !== 'con una errata') {
      console.log(`  se escaparon con «${etiqueta}»:`);
      for (const p of fila.perdidos) console.log(`    ${p}`);
    }
  }

  /* Designados con nacionalidad colombiana: la población que de verdad
     puede cruzarse con una escuela de conducción de Popayán. */
  const colombianos = personas.filter((r) =>
    (r.nc || []).some((n) => /colombia/i.test(n)) ||
    (r.d || []).some((d) => /cedula|cédula/i.test(d.t || '')),
  );
  const muestraCol = colombianos.slice(0, CUANTOS_DESIGNADOS);
  if (muestraCol.length) {
    console.log(`\nALCANCE — ${muestraCol.length} designados colombianos`);
    const alcanceCol = medirAlcance(motor, muestraCol);
    for (const [etiqueta, fila] of alcanceCol) {
      console.log(`  ${etiqueta.padEnd(24)} ${(porcentaje(fila.encontrado, fila.total) + '%').padStart(11)}`);
    }
  }

  if (process.argv.includes('--barrido')) barrer(listas, nombres, cortos, muestra, muestraCol);

  /* Documentos */
  const docs = medirDocumentos(motor, listas);
  console.log(`\nDOCUMENTO — ${docs.total} números tomados de las propias listas`);
  console.log(`  tal cual        ${porcentaje(docs.exacto, docs.total)}%`);
  console.log(`  con puntos      ${porcentaje(docs.conPuntos, docs.total)}%`);
}

principal();

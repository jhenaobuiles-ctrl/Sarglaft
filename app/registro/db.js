// Registro local de consultas, evidencias y obligaciones.
//
// Vive íntegramente en IndexedDB, en el navegador de quien usa el panel. Ni
// un nombre ni una cédula salen del equipo: el repositorio es público y la
// Ley 1581 de 2012 no admite otra cosa. El precio es que el registro no se
// comparte entre equipos, y por eso existen exportar e importar.

const NOMBRE_BD = 'sarglaft';
const VERSION = 1;

export const ALMACENES = {
  consultas: 'consultas',
  evidencias: 'evidencias',
  cruces: 'cruces',
  obligaciones: 'obligaciones',
  config: 'config',
};

let promesaBD = null;

export function abrir() {
  if (promesaBD) return promesaBD;
  promesaBD = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION);

    peticion.onupgradeneeded = (evento) => {
      const bd = peticion.result;
      const anterior = evento.oldVersion;

      if (anterior < 1) {
        const consultas = bd.createObjectStore(ALMACENES.consultas, { keyPath: 'id' });
        consultas.createIndex('fecha', 'fecha');
        consultas.createIndex('resultado', 'resultado');
        consultas.createIndex('nombreNormalizado', 'nombreNormalizado');
        consultas.createIndex('documentoNormalizado', 'documentoNormalizado');
        // Permite reabrir el detalle de un cruce masivo completo.
        consultas.createIndex('cruceId', 'cruceId');

        const evidencias = bd.createObjectStore(ALMACENES.evidencias, { keyPath: 'id' });
        evidencias.createIndex('consultaId', 'consultaId');

        const cruces = bd.createObjectStore(ALMACENES.cruces, { keyPath: 'id' });
        cruces.createIndex('fecha', 'fecha');

        bd.createObjectStore(ALMACENES.obligaciones, { keyPath: 'id' });
        bd.createObjectStore(ALMACENES.config, { keyPath: 'clave' });
      }
    };

    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
    peticion.onblocked = () =>
      rechazar(new Error('Hay otra pestaña del panel abierta con una versión distinta.'));
  });
  return promesaBD;
}

function transaccion(bd, almacenes, modo) {
  return bd.transaction(almacenes, modo);
}

function esperar(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function completar(tx) {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error || new Error('Transacción abortada'));
  });
}

/** Identificador ordenable por tiempo: los listados salen cronológicos solos. */
export function nuevoId(prefijo = 'c') {
  const marca = Date.now().toString(36).padStart(9, '0');
  const azar = Math.random().toString(36).slice(2, 8);
  return `${prefijo}_${marca}_${azar}`;
}

export async function guardar(almacen, registro) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readwrite');
  tx.objectStore(almacen).put(registro);
  await completar(tx);
  return registro;
}

/** Guarda muchos registros en una sola transacción. */
export async function guardarVarios(almacen, registros) {
  if (!registros.length) return 0;
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readwrite');
  const store = tx.objectStore(almacen);
  for (const registro of registros) store.put(registro);
  await completar(tx);
  return registros.length;
}

export async function obtener(almacen, clave) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readonly');
  return esperar(tx.objectStore(almacen).get(clave));
}

export async function todos(almacen) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readonly');
  return esperar(tx.objectStore(almacen).getAll());
}

export async function porIndice(almacen, indice, valor) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readonly');
  return esperar(tx.objectStore(almacen).index(indice).getAll(valor));
}

export async function borrar(almacen, clave) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readwrite');
  tx.objectStore(almacen).delete(clave);
  await completar(tx);
}

export async function contar(almacen) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readonly');
  return esperar(tx.objectStore(almacen).count());
}

/**
 * Recorre un almacén por su índice de fecha, de la más reciente a la más
 * antigua, sin cargarlo entero en memoria.
 */
export async function recientes(almacen, limite = 50, filtro = null) {
  const bd = await abrir();
  const tx = transaccion(bd, [almacen], 'readonly');
  const indice = tx.objectStore(almacen).index('fecha');
  const salida = [];
  return new Promise((resolver, rechazar) => {
    const peticion = indice.openCursor(null, 'prev');
    peticion.onerror = () => rechazar(peticion.error);
    peticion.onsuccess = () => {
      const cursor = peticion.result;
      if (!cursor || salida.length >= limite) return resolver(salida);
      if (!filtro || filtro(cursor.value)) salida.push(cursor.value);
      cursor.continue();
    };
  });
}

/* ---------- configuración ---------- */

export async function leerConfig(clave, porOmision = null) {
  const fila = await obtener(ALMACENES.config, clave);
  return fila ? fila.valor : porOmision;
}

export async function escribirConfig(clave, valor) {
  return guardar(ALMACENES.config, { clave, valor });
}

/* ---------- borrado total ---------- */

/**
 * Borra todo el registro local. Es una operación destructiva y sin vuelta
 * atrás: quien la use debería exportar antes.
 */
export async function borrarTodo() {
  const bd = await abrir();
  const nombres = Object.values(ALMACENES);
  const tx = transaccion(bd, nombres, 'readwrite');
  for (const nombre of nombres) tx.objectStore(nombre).clear();
  await completar(tx);
}

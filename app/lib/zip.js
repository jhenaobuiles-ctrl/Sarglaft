// Lector y escritor de archivos ZIP, sin dependencias.
//
// Existe por una razón concreta: la copia de seguridad del expediente tenía
// que dejar fuera las evidencias —los PDF de la Procuraduría, las capturas de
// pantalla— porque son binarios y no caben en un JSON. Una copia que no
// incluye la evidencia no es una copia: si el navegador se borra, queda el
// registro de que se consultó y no el documento que lo prueba.
//
// Se implementa a mano y no con una librería porque el proyecto no tiene
// dependencias ni paso de compilación, y el subconjunto del formato que hace
// falta es pequeño: un ZIP de una sola parte, sin cifrado y sin ZIP64.
//
// La compresión usa `CompressionStream('deflate-raw')`, que traen los
// navegadores actuales y Node 18 en adelante. Si no está, todo se guarda sin
// comprimir: el archivo pesa más pero se abre igual en cualquier lado.

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;

const SIN_COMPRIMIR = 0;
const DESINFLADO = 8;

// Bit 11 de las banderas: los nombres de archivo van en UTF-8. Sin esto,
// "evidencias/certificación.pdf" se abre con el nombre roto en Windows.
const BANDERA_UTF8 = 0x0800;

// Límites del formato sin ZIP64. Un expediente de una escuela de conducción
// no se acerca a ninguno de los dos, pero fallar con un mensaje claro es
// mejor que escribir un archivo corrupto que nadie podrá abrir.
const MAXIMO_ENTRADAS = 0xffff;
const MAXIMO_BYTES = 0xffffffff;

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Convierte a bytes lo que se quiera meter en el ZIP. */
async function aBytes(datos) {
  if (datos instanceof Uint8Array) return datos;
  if (typeof datos === 'string') return new TextEncoder().encode(datos);
  if (datos instanceof ArrayBuffer) return new Uint8Array(datos);
  if (ArrayBuffer.isView(datos)) {
    return new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
  }
  // Blob y File: es la forma en que IndexedDB devuelve las evidencias.
  if (datos && typeof datos.arrayBuffer === 'function') {
    return new Uint8Array(await datos.arrayBuffer());
  }
  throw new TypeError('Tipo de dato no soportado dentro del ZIP.');
}

async function transformar(bytes, transformacion) {
  const flujo = new Blob([bytes]).stream().pipeThrough(transformacion);
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function desinflar(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    return await transformar(bytes, new CompressionStream('deflate-raw'));
  } catch {
    return null;
  }
}

async function inflar(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador no puede descomprimir el archivo ZIP.');
  }
  return transformar(bytes, new DecompressionStream('deflate-raw'));
}

/** Fecha y hora en el formato de MS-DOS que exige el encabezado del ZIP. */
function fechaDOS(fecha) {
  const anio = Math.max(1980, fecha.getFullYear());
  return {
    fecha: ((anio - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
    hora:
      (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
  };
}

function escritor(tamano) {
  const bytes = new Uint8Array(tamano);
  const vista = new DataView(bytes.buffer);
  let posicion = 0;
  return {
    bytes,
    u16(valor) {
      vista.setUint16(posicion, valor, true);
      posicion += 2;
    },
    u32(valor) {
      vista.setUint32(posicion, valor >>> 0, true);
      posicion += 4;
    },
    crudo(origen) {
      bytes.set(origen, posicion);
      posicion += origen.length;
    },
  };
}

/**
 * Arma un ZIP.
 *
 * @param {Array<{nombre: string, datos: any, fecha?: Date}>} entradas
 * @returns {Promise<Blob>}
 */
export async function crearZip(entradas) {
  if (entradas.length > MAXIMO_ENTRADAS) {
    throw new Error(
      `El ZIP admite ${MAXIMO_ENTRADAS} archivos y se intentaron ${entradas.length}.`,
    );
  }

  const partes = [];
  const central = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    const nombre = new TextEncoder().encode(entrada.nombre);
    const crudos = await aBytes(entrada.datos);
    const comprimidos = await desinflar(crudos);

    // Un PDF o un JPEG ya vienen comprimidos: desinflarlos otra vez los deja
    // más grandes. Se guarda la versión que pese menos.
    const comprimir = comprimidos !== null && comprimidos.length < crudos.length;
    const cuerpo = comprimir ? comprimidos : crudos;
    const metodo = comprimir ? DESINFLADO : SIN_COMPRIMIR;
    const { fecha, hora } = fechaDOS(entrada.fecha instanceof Date ? entrada.fecha : new Date());
    const suma = crc32(crudos);

    const encabezado = escritor(30 + nombre.length);
    encabezado.u32(FIRMA_LOCAL);
    encabezado.u16(20);
    encabezado.u16(BANDERA_UTF8);
    encabezado.u16(metodo);
    encabezado.u16(hora);
    encabezado.u16(fecha);
    encabezado.u32(suma);
    encabezado.u32(cuerpo.length);
    encabezado.u32(crudos.length);
    encabezado.u16(nombre.length);
    encabezado.u16(0);
    encabezado.crudo(nombre);

    partes.push(encabezado.bytes, cuerpo);

    const ficha = escritor(46 + nombre.length);
    ficha.u32(FIRMA_CENTRAL);
    ficha.u16(20);
    ficha.u16(20);
    ficha.u16(BANDERA_UTF8);
    ficha.u16(metodo);
    ficha.u16(hora);
    ficha.u16(fecha);
    ficha.u32(suma);
    ficha.u32(cuerpo.length);
    ficha.u32(crudos.length);
    ficha.u16(nombre.length);
    ficha.u16(0);
    ficha.u16(0);
    ficha.u16(0);
    ficha.u16(0);
    ficha.u32(0);
    ficha.u32(desplazamiento);
    ficha.crudo(nombre);
    central.push(ficha.bytes);

    desplazamiento += encabezado.bytes.length + cuerpo.length;
    if (desplazamiento > MAXIMO_BYTES) {
      throw new Error('La copia supera los 4 GB, que es el límite de este formato ZIP.');
    }
  }

  const tamanoCentral = central.reduce((suma, b) => suma + b.length, 0);
  const fin = escritor(22);
  fin.u32(FIRMA_FIN);
  fin.u16(0);
  fin.u16(0);
  fin.u16(entradas.length);
  fin.u16(entradas.length);
  fin.u32(tamanoCentral);
  fin.u32(desplazamiento);
  fin.u16(0);

  return new Blob([...partes, ...central, fin.bytes], { type: 'application/zip' });
}

/**
 * Abre un ZIP y devuelve sus archivos.
 *
 * Se recorre el directorio central y no los encabezados locales: cuando un
 * ZIP se escribe en flujo, los encabezados locales llevan los tamaños en cero
 * y los reales van en un descriptor posterior. El directorio central siempre
 * los tiene bien.
 *
 * @returns {Promise<Map<string, Uint8Array>>} nombre → contenido
 */
export async function leerZip(fuente) {
  const bytes = await aBytes(fuente);
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const inicioFin = buscarFin(bytes, vista);
  if (inicioFin < 0) throw new Error('El archivo no es un ZIP válido.');

  const cuantas = vista.getUint16(inicioFin + 10, true);
  let puntero = vista.getUint32(inicioFin + 16, true);

  const salida = new Map();
  const decodificador = new TextDecoder();

  for (let i = 0; i < cuantas; i++) {
    if (vista.getUint32(puntero, true) !== FIRMA_CENTRAL) {
      throw new Error('El directorio del ZIP está dañado.');
    }
    const metodo = vista.getUint16(puntero + 10, true);
    const comprimido = vista.getUint32(puntero + 20, true);
    const largoNombre = vista.getUint16(puntero + 28, true);
    const largoExtra = vista.getUint16(puntero + 30, true);
    const largoComentario = vista.getUint16(puntero + 32, true);
    const desplazamiento = vista.getUint32(puntero + 42, true);
    const nombre = decodificador.decode(bytes.subarray(puntero + 46, puntero + 46 + largoNombre));

    if (vista.getUint32(desplazamiento, true) !== FIRMA_LOCAL) {
      throw new Error(`No se pudo leer "${nombre}" dentro del ZIP.`);
    }
    // Los tamaños de nombre y extra del encabezado local pueden diferir de los
    // del directorio central, así que el inicio de los datos se calcula aquí.
    const inicioDatos =
      desplazamiento +
      30 +
      vista.getUint16(desplazamiento + 26, true) +
      vista.getUint16(desplazamiento + 28, true);
    const crudos = bytes.subarray(inicioDatos, inicioDatos + comprimido);

    if (metodo === SIN_COMPRIMIR) salida.set(nombre, crudos);
    else if (metodo === DESINFLADO) salida.set(nombre, await inflar(crudos));
    else throw new Error(`"${nombre}" usa un método de compresión no soportado.`);

    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }
  return salida;
}

/** Busca el fin del directorio central desde el final, tolerando comentario. */
function buscarFin(bytes, vista) {
  const minimo = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= minimo; i--) {
    if (vista.getUint32(i, true) === FIRMA_FIN) return i;
  }
  return -1;
}

export function textoDe(bytes) {
  return new TextDecoder().decode(bytes);
}

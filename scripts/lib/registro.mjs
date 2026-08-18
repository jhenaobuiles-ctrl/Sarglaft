// Forma canónica de un registro de lista.
//
// Las claves son cortas a propósito: con ~60.000 registros, usar "nombre" en
// vez de "n" añade megabytes al archivo que el navegador de Alexa descarga.

/**
 * @param {object} datos
 * @param {string} datos.id        identificador dentro de la fuente
 * @param {'P'|'E'|'B'} datos.tipo persona, entidad o buque/aeronave
 * @param {string} datos.nombre    nombre principal
 * @param {string[]} [datos.alias]
 * @param {Array<{tipo?:string,numero:string,pais?:string}>} [datos.documentos]
 * @param {string[]} [datos.nacionalidades]
 * @param {string[]} [datos.nacimientos]
 * @param {string} [datos.programa]
 * @param {string} [datos.fechaListado]
 * @param {string} [datos.observaciones]
 */
export function registro(datos) {
  const salida = { i: datos.id, t: datos.tipo, n: limpiar(datos.nombre) };

  const alias = unicos((datos.alias || []).map(limpiar)).filter(
    (a) => a && a !== salida.n,
  );
  if (alias.length) salida.a = alias;

  const documentos = [];
  const vistos = new Set();
  for (const doc of datos.documentos || []) {
    const numero = limpiar(doc.numero);
    if (!numero) continue;
    const clave = `${doc.tipo || ''}|${numero}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const item = { n: numero };
    if (doc.tipo) item.t = limpiar(doc.tipo);
    if (doc.pais) item.p = limpiar(doc.pais);
    documentos.push(item);
  }
  if (documentos.length) salida.d = documentos;

  const nacionalidades = unicos((datos.nacionalidades || []).map(limpiar)).filter(Boolean);
  if (nacionalidades.length) salida.nc = nacionalidades;

  const nacimientos = unicos((datos.nacimientos || []).map(limpiar)).filter(Boolean);
  if (nacimientos.length) salida.fn = nacimientos;

  if (datos.programa) salida.pg = limpiar(datos.programa);
  if (datos.fechaListado) salida.fl = limpiar(datos.fechaListado);
  if (datos.observaciones) salida.ob = recortar(limpiar(datos.observaciones), 600);

  return salida;
}

function limpiar(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

function recortar(valor, tope) {
  return valor.length > tope ? `${valor.slice(0, tope - 1)}…` : valor;
}

function unicos(arreglo) {
  return [...new Set(arreglo)];
}

/**
 * Convierte a AAAA-MM-DD las fechas que publican las fuentes.
 *
 * El orden importa y no se puede adivinar: OFAC escribe 12/11/1965 como el 11
 * de diciembre y OFSI escribe esa misma cadena como el 12 de noviembre. Cada
 * fuente declara su convención; equivocarla mete una fecha de nacimiento
 * errónea en el expediente sin que nada falle.
 *
 * @param {string} valor
 * @param {'MDA'|'DMA'} orden convención de la fuente para fechas con barras.
 *   'MDA' = mes/día/año (Estados Unidos), 'DMA' = día/mes/año (Reino Unido,
 *   Europa, Colombia).
 */
export function fechaISO(valor, orden = 'MDA') {
  const s = limpiar(valor);
  if (!s) return '';

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) {
    let [, primero, segundo, anio] = m;
    // Si uno de los dos pasa de 12 la ambigüedad desaparece, y mandamos sobre
    // la convención declarada: así una fuente mal etiquetada no arruina el dato.
    let mes;
    let dia;
    if (Number(primero) > 12) {
      dia = primero;
      mes = segundo;
    } else if (Number(segundo) > 12) {
      mes = primero;
      dia = segundo;
    } else if (orden === 'DMA') {
      dia = primero;
      mes = segundo;
    } else {
      mes = primero;
      dia = segundo;
    }
    return `${anio}-${pad(mes)}-${pad(dia)}`;
  }

  // "12 Nov 1965" (ONU y OFAC) y "07-MAY-2024" (Banco Mundial).
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s-]+(\d{4})/);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    if (mes) return `${m[3]}-${mes}-${pad(m[1])}`;
  }

  // "Nov 1965" y "1965": año o año-mes sueltos, tal como los publican.
  m = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m) {
    const mes = MESES[m[1].toLowerCase()];
    if (mes) return `${m[2]}-${mes}`;
  }
  if (/^\d{4}$/.test(s)) return s;

  return s;
}

const MESES = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  ene: '01', abr: '04', ago: '08', dic: '12',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

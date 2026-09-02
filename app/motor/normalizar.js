// Normalización de nombres y documentos.
//
// Lo usa tanto el navegador (al consultar) como el script de construcción de
// listas (al indexar). Tiene que ser exactamente el mismo código en los dos
// lados: si el índice se construye con una normalización y la consulta usa
// otra, el sistema devuelve "sin hallazgos" falsos.

// Formas societarias que aparecen al final de una razón social. Se recortan
// solo desde el final, repetidamente: "COMERCIALIZADORA X S.A.S." y
// "COMERCIALIZADORA X" tienen que caer en la misma clave.
const SUFIJOS_SOCIETARIOS = new Set([
  'SAS', 'SA', 'LTDA', 'LIMITADA', 'EU', 'CIA', 'SCA', 'SCS', 'SENC',
  'INC', 'INCORPORATED', 'LLC', 'LLP', 'LP', 'CORP', 'CORPORATION',
  'LTD', 'LIMITED', 'GMBH', 'MBH', 'AG', 'SARL', 'SRL', 'SPA', 'SPRL',
  'BV', 'NV', 'PLC', 'PTY', 'PTE', 'OOO', 'ZAO', 'OAO', 'PJSC', 'JSC',
  'CO', 'COMPANY', 'SUCESORES', 'HIJOS', 'HERMANOS', 'SONS',
]);

// Conectores que quedan colgando tras recortar un sufijo: "X Y CIA" -> "X Y".
const CONECTORES_FINALES = new Set(['Y', 'E', 'AND', 'EN', 'DE']);

// Partículas sin poder discriminante. No se borran del nombre (cambiarían el
// orden de los apellidos) pero no generan entradas en el índice invertido.
const PARTICULAS = new Set([
  'DE', 'DEL', 'DELA', 'LA', 'LAS', 'LO', 'LOS', 'EL', 'Y', 'E', 'AL',
  'DA', 'DAS', 'DO', 'DOS', 'VAN', 'VON', 'BIN', 'BEN', 'ABU',
  'THE', 'OF', 'AND',
]);

/**
 * Pasa un nombre a su forma canónica: sin tildes, en mayúsculas, sin
 * puntuación y con espacios colapsados.
 *
 * Nota deliberada: la Ñ se descompone y pierde la virgulilla, de modo que
 * PEÑA y PENA quedan iguales. En cruce de listas eso es lo que queremos —
 * las fuentes extranjeras transcriben los apellidos españoles sin tilde.
 */
export function normalizarNombre(valor) {
  if (!valor) return '';
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Une las series de letras sueltas que deja la puntuación.
 * "S.A.S." llega aquí como ["S","A","S"] y tiene que salir como ["SAS"] para
 * que el recorte de formas societarias lo reconozca.
 */
function unirIniciales(partes) {
  const salida = [];
  let racha = [];
  const volcar = () => {
    if (racha.length >= 2) salida.push(racha.join(''));
    else if (racha.length === 1) salida.push(racha[0]);
    racha = [];
  };
  for (const parte of partes) {
    if (parte.length === 1 && /[A-Z]/.test(parte)) racha.push(parte);
    else {
      volcar();
      salida.push(parte);
    }
  }
  volcar();
  return salida;
}

/** Igual que normalizarNombre pero recortando las formas societarias finales. */
export function normalizarRazonSocial(valor) {
  let partes = unirIniciales(normalizarNombre(valor).split(' ').filter(Boolean));
  let recorto = true;
  while (recorto && partes.length > 1) {
    recorto = false;
    const ultima = partes[partes.length - 1];
    if (SUFIJOS_SOCIETARIOS.has(ultima) || CONECTORES_FINALES.has(ultima)) {
      partes = partes.slice(0, -1);
      recorto = true;
    }
  }
  return partes.join(' ');
}

/** Tokens del nombre ya normalizado. */
export function tokenizar(valor) {
  const normal = normalizarNombre(valor);
  return normal ? normal.split(' ') : [];
}

/** Tokens con poder discriminante: sin partículas ni fragmentos de una letra. */
export function tokensSignificativos(valor) {
  return tokenizar(valor).filter((t) => t.length > 1 && !PARTICULAS.has(t));
}

/**
 * Forma canónica de un número de documento.
 * Quita puntos, guiones y espacios; sube a mayúsculas; y en los documentos
 * puramente numéricos quita los ceros a la izquierda, porque las cédulas se
 * escriben indistintamente 0079123456 y 79.123.456.
 */
export function normalizarDocumento(valor) {
  if (!valor) return '';
  const limpio = String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!limpio) return '';
  if (/^[0-9]+$/.test(limpio)) {
    const sinCeros = limpio.replace(/^0+/, '');
    return sinCeros === '' ? '0' : sinCeros;
  }
  return limpio;
}

// Tipos de documento que llevan dígito de verificación al final.
const CON_DIGITO_VERIFICACION = new Set(['NIT', 'RUT']);

/**
 * Formas bajo las que hay que buscar un documento.
 *
 * Solo al NIT se le genera la variante sin dígito de verificación, porque el
 * mismo NIT circula como 900123456 y como 900123456-7. Hacerlo a ciegas sobre
 * cualquier número sería peligroso: recortarle el último dígito a una cédula
 * de 10 posiciones produce la cédula de otra persona.
 */
export function variantesDocumento(valor, tipo = '') {
  const base = normalizarDocumento(valor);
  if (!base) return [];
  const variantes = [base];
  const tipoNormal = normalizarNombre(tipo).replace(/ /g, '');
  if (CON_DIGITO_VERIFICACION.has(tipoNormal) && /^[0-9]{9,11}$/.test(base)) {
    variantes.push(base.slice(0, -1));
  }
  return [...new Set(variantes)];
}

/**
 * ¿Está escrito como un NIT con su dígito de verificación?
 *
 * "900.228.328-7" solo se busca también como "900228328" si el tipo declarado
 * es NIT. Elegir otro tipo con un número así escrito produce un «sin
 * hallazgos» falso sobre una empresa que sí está designada, así que el panel
 * lo advierte. Una cédula nunca se escribe con un guion y un dígito al final,
 * de modo que la señal no se confunde con nada.
 */
export function pareceNitConVerificacion(valor) {
  const limpio = String(valor ?? '').replace(/[.\s]/g, '');
  return /^[0-9]{6,12}-[0-9]$/.test(limpio);
}

export const _internos = { SUFIJOS_SOCIETARIOS, PARTICULAS, unirIniciales };

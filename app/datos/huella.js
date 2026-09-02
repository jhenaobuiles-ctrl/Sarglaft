// Comprobar que la lista descargada es la que el manifiesto dice.
//
// El manifiesto trae el sha256 de cada archivo y el certificado lo imprime
// como prueba de contra qué versión se consultó. Pero nadie lo comprobaba:
// se citaba el hash del manifiesto sobre un archivo que podía ser otro.
//
// El build tiene un guardrail para esto —una lista que pierde el 40% de sus
// registros no se publica—. Al navegador le faltaba el suyo, y el modo de
// fallar es peor: una descarga cortada a la mitad, una caché envenenada o un
// intermediario que sirve una copia vieja producen «sin hallazgos» falsos sin
// que nada falle, y el certificado los respalda con un hash que no verificó.
//
// Verificar no es desconfiar de la fuente: es que un JSON truncado sigue
// siendo un JSON válido, así que `JSON.parse` no protege de nada.

/** SHA-256 en hexadecimal de unos bytes. */
export async function huellaDe(bytes) {
  const resumen = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `crypto.subtle` solo existe en contextos seguros (https y localhost).
 *
 * Si falta, no se puede verificar. Eso no puede impedir consultar —una lista
 * sin verificar sigue siendo mejor que ninguna— pero sí tiene que constar,
 * porque el certificado deja de poder afirmar que comprobó la huella.
 */
export function sePuedeVerificar() {
  return typeof crypto !== 'undefined' && Boolean(crypto?.subtle?.digest);
}

/**
 * Compara el contenido descargado contra la huella del manifiesto.
 *
 * @returns {Promise<{ok: boolean, verificada: boolean, motivo: string}>}
 *   `ok` dice si la lista se puede usar; `verificada`, si se llegó a
 *   comprobar. Son cosas distintas: sin `crypto.subtle` se usa sin verificar.
 */
export async function revisarHuella(esperada, bytes) {
  if (!esperada) {
    return {
      ok: true,
      verificada: false,
      motivo: 'El manifiesto no trae la huella de esta lista, así que no se pudo comprobar.',
    };
  }
  if (!sePuedeVerificar()) {
    return {
      ok: true,
      verificada: false,
      motivo: 'Este navegador no expone SHA-256, así que la huella no se pudo comprobar.',
    };
  }

  const obtenida = await huellaDe(bytes);
  if (obtenida === esperada) return { ok: true, verificada: true, motivo: '' };

  // No se usa. Una lista que no es la que dice ser no sirve ni para consultar
  // ni para certificar, y usarla a medias es justo el fallo silencioso.
  return {
    ok: false,
    verificada: true,
    motivo: `El archivo descargado no corresponde a la huella del manifiesto (esperaba ${esperada.slice(0, 12)}…, llegó ${obtenida.slice(0, 12)}…). Puede ser una descarga cortada o una copia intermedia desactualizada.`,
  };
}

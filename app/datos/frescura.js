// Cuán reciente es el dato contra el que se está consultando.
//
// El guardrail del build protege contra una lista que encoge. Falta el fallo
// contrario y más callado: una fuente que sigue descargándose sin problema
// pero deja de publicar nuevo —una URL que devuelve una copia congelada, un
// adjunto que ya no rota—. El conteo no cambia, el sha256 no cambia, el
// estado dice `ok`, y el panel dice «Al día» durante meses.
//
// «Al día» describía la descarga, no el dato. Aquí se mira la fecha de
// publicación, que es lo que de verdad importa: consultar hoy contra una
// lista de hace cuatro meses es un «sin hallazgos» con menos valor del que
// aparenta, y quien firma el certificado tiene derecho a saberlo.
//
// Cada fuente declara su propia tolerancia porque los ritmos no se parecen:
// la OFAC mueve su lista de designados casi cada semana y su lista
// consolidada apenas unas veces al año. Un umbral único o gritaría en falso
// sobre la segunda o se quedaría callado sobre la primera. La tolerancia es
// un juicio sobre cuándo vale la pena mirar, no una afirmación sobre el
// calendario de cada autoridad.

// Se usa cuando la fuente no declara la suya. Generosa a propósito: más vale
// avisar tarde que convertir el aviso en ruido que nadie mira.
export const TOLERANCIA_POR_OMISION = 60;

export const NIVELES = {
  ok: 'Al día',
  atrasada: 'Publicación atrasada',
  obsoleta: 'No se pudo actualizar',
  sin_fecha: 'Sin fecha de publicación',
  sin_datos: 'Sin datos',
};

/**
 * Días transcurridos desde una fecha de publicación.
 *
 * La fecha viene como día calendario (`2026-08-05`) y se ancla en UTC: hacerlo
 * en hora local la corre un día en Colombia, que es el error que ya obligó a
 * arreglar el certificado una vez.
 */
export function diasDesdePublicacion(fecha, ahora = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  if (!m) return null;
  const publicada = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return Math.floor((hoy - publicada) / 86400000);
}

/**
 * Estado real de una entrada del manifiesto.
 *
 * @param {object} entrada entrada de `manifest.json`
 * @param {Date} [ahora]
 * @returns {{nivel: string, rotulo: string, dias: number|null, tolerancia: number, problema: boolean}}
 */
export function frescuraDe(entrada = {}, ahora = new Date()) {
  const tolerancia = Number(entrada.toleranciaDias) > 0
    ? Number(entrada.toleranciaDias)
    : TOLERANCIA_POR_OMISION;
  const dias = diasDesdePublicacion(entrada.fechaPublicacion, ahora);

  const armar = (nivel) => ({
    nivel,
    rotulo: NIVELES[nivel],
    dias,
    tolerancia,
    problema: nivel !== 'ok',
  });

  // Que la descarga falle es más grave que un retraso de publicación: la
  // copia que se está usando puede ser de cualquier antigüedad.
  if (entrada.estado === 'sin_datos') return armar('sin_datos');
  if (entrada.estado === 'obsoleto') return armar('obsoleta');
  if (dias === null) return armar('sin_fecha');
  return armar(dias > tolerancia ? 'atrasada' : 'ok');
}

/** Una frase que explica el retraso sin que haya que interpretar el número. */
export function explicarFrescura(entrada, ahora = new Date()) {
  const { nivel, dias, tolerancia } = frescuraDe(entrada, ahora);
  switch (nivel) {
    case 'atrasada':
      return `Se publicó hace ${dias} días y esta lista suele moverse antes de los ${tolerancia}. Conviene comprobar en el sitio oficial si la fuente cambió de dirección o de formato.`;
    case 'obsoleta':
      return 'La última descarga falló, así que se está usando la copia anterior.';
    case 'sin_datos':
      return 'No hay ninguna copia de esta lista, así que no se está consultando.';
    case 'sin_fecha':
      return 'La fuente no publica una fecha, así que no se puede saber su antigüedad.';
    default:
      return dias === null ? '' : `Se publicó hace ${dias} día(s).`;
  }
}

/** Las que hay que mirar, con las vinculantes primero. */
export function listasConProblema(listas = [], ahora = new Date()) {
  return listas
    .map((entrada) => ({ entrada, frescura: frescuraDe(entrada, ahora) }))
    .filter(({ frescura }) => frescura.problema)
    .sort((a, b) => Number(b.entrada.vinculante) - Number(a.entrada.vinculante));
}

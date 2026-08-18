// Índice invertido en memoria sobre las listas cargadas.
//
// Sin él cada consulta compararía contra ~60.000 registros (más sus alias).
// Con él solo se puntúan los registros que comparten al menos un token
// significativo con la consulta, que suelen ser unas decenas.

import { tokensSignificativos, normalizarDocumento } from './normalizar.js';

/**
 * @param {Array} listas registros ya cargados, con forma
 *   {id, nombre, fuente, fechaPublicacion, sha256, registros: [...]}
 */
export function construirIndice(listas) {
  // Aplanamos todo a un solo arreglo: el índice guarda posiciones enteras,
  // que es mucho más liviano que guardar referencias a objetos.
  const entradas = [];
  const porToken = new Map();
  const porDocumento = new Map();

  for (const lista of listas) {
    for (const registro of lista.registros) {
      const posicion = entradas.length;
      const nombres = [registro.n, ...(registro.a || [])].filter(Boolean);
      entradas.push({ lista, registro, nombres });

      const vistos = new Set();
      for (const nombre of nombres) {
        for (const token of tokensSignificativos(nombre)) {
          if (vistos.has(token)) continue;
          vistos.add(token);
          let posiciones = porToken.get(token);
          if (!posiciones) porToken.set(token, (posiciones = []));
          posiciones.push(posicion);
        }
      }

      for (const doc of registro.d || []) {
        const clave = normalizarDocumento(doc.n);
        if (!clave || clave.length < 4) continue;
        let posiciones = porDocumento.get(clave);
        if (!posiciones) porDocumento.set(clave, (posiciones = []));
        posiciones.push(posicion);
      }
    }
  }

  return { entradas, porToken, porDocumento, listas };
}

/**
 * Posiciones candidatas para un conjunto de tokens, con cuántos tokens de la
 * consulta tocó cada una.
 *
 * Los tokens muy frecuentes (JOSE, MARIA, LOPEZ...) arrastran miles de
 * posiciones; se saltan cuando la consulta tiene otros tokens más
 * discriminantes con los que generar candidatos.
 */
export function candidatos(indice, tokens, topeToken = 4000) {
  const golpes = new Map();
  const utiles = tokens.filter((t) => {
    const posiciones = indice.porToken.get(t);
    return posiciones && posiciones.length <= topeToken;
  });
  // Si todos los tokens son frecuentísimos no queda más que usarlos igual:
  // preferimos una consulta lenta a una consulta ciega.
  const aUsar = utiles.length > 0 ? utiles : tokens;

  for (const token of aUsar) {
    const posiciones = indice.porToken.get(token);
    if (!posiciones) continue;
    for (const p of posiciones) golpes.set(p, (golpes.get(p) || 0) + 1);
  }
  return golpes;
}

/** Posiciones cuyo documento coincide exactamente con alguna variante. */
export function porDocumentos(indice, variantes) {
  const salida = new Set();
  for (const v of variantes) {
    const posiciones = indice.porDocumento.get(v);
    if (posiciones) for (const p of posiciones) salida.add(p);
  }
  return salida;
}

// API de consulta: recibe un nombre y/o un documento, devuelve un resultado
// trazable contra las listas cargadas.

import { normalizarNombre, variantesDocumento } from './normalizar.js';
import { prepararConsulta, puntuar } from './scoring.js';
import { construirIndice, candidatos, porDocumentos } from './indice.js';

export const NIVEL = {
  ALERTA: 'ALERTA',
  REVISION: 'EN_REVISION',
  LIMPIO: 'SIN_HALLAZGOS',
};

// Calibrados contra los casos de prueba de scoring.test.js. Bajar el umbral
// de revisión inunda de falsos positivos; subirlo deja pasar variantes
// legítimas del mismo nombre.
export const UMBRALES = {
  alerta: 0.93,
  revision: 0.8,
  // Con uno o dos tokens ("Juan Pérez") casi cualquier apellido común pasa el
  // umbral normal, así que se exige mucho más.
  alertaNombreCorto: 0.98,
  revisionNombreCorto: 0.93,
};

export function crearMotor(listas, opciones = {}) {
  const indice = construirIndice(listas);
  const umbrales = { ...UMBRALES, ...(opciones.umbrales || {}) };

  function consultar({ nombre = '', documento = '', tipoDocumento = '' } = {}) {
    const preparada = prepararConsulta(nombre);
    const variantes = variantesDocumento(documento, tipoDocumento);
    const nombreCorto = preparada.tokens.length < 3;
    const topeAlerta = nombreCorto ? umbrales.alertaNombreCorto : umbrales.alerta;
    const topeRevision = nombreCorto
      ? umbrales.revisionNombreCorto
      : umbrales.revision;

    const porPosicion = new Map();

    // 1. Documento. Una coincidencia de documento es alerta siempre, sin
    //    importar cómo se escriba el nombre: es el criterio más fuerte y el
    //    más frecuente en las designaciones de OFAC sobre Colombia.
    if (variantes.length) {
      for (const posicion of porDocumentos(indice, variantes)) {
        const { lista, registro } = indice.entradas[posicion];
        porPosicion.set(posicion, {
          lista: resumenLista(lista),
          registro,
          motivo: 'documento',
          coincide: documento,
          puntaje: 1,
          nivel: NIVEL.ALERTA,
        });
      }
    }

    // 2. Nombre.
    if (preparada.tokens.length) {
      for (const [posicion, golpes] of candidatos(indice, preparada.tokens)) {
        // Con un solo token en común de una consulta larga no vale la pena
        // puntuar: nunca llegará al umbral.
        if (preparada.tokens.length >= 3 && golpes < 2) continue;

        const { lista, registro, nombres } = indice.entradas[posicion];
        let mejor = 0;
        let mejorNombre = '';
        for (const candidato of nombres) {
          const p = puntuar(preparada.tokens, preparada.ordenada, candidato);
          if (p > mejor) {
            mejor = p;
            mejorNombre = candidato;
          }
        }
        if (mejor < topeRevision) continue;

        const previo = porPosicion.get(posicion);
        if (previo && previo.motivo === 'documento') {
          // Ya está en alerta por documento; solo anotamos qué nombre casó.
          previo.coincideNombre = mejorNombre;
          previo.puntajeNombre = mejor;
          continue;
        }
        porPosicion.set(posicion, {
          lista: resumenLista(lista),
          registro,
          motivo: 'nombre',
          coincide: mejorNombre,
          puntaje: mejor,
          nivel: mejor >= topeAlerta ? NIVEL.ALERTA : NIVEL.REVISION,
        });
      }
    }

    const coincidencias = [...porPosicion.values()].sort(
      (a, b) => b.puntaje - a.puntaje,
    );

    let resultado = NIVEL.LIMPIO;
    if (coincidencias.some((c) => c.nivel === NIVEL.ALERTA)) {
      resultado = NIVEL.ALERTA;
    } else if (coincidencias.length) {
      resultado = NIVEL.REVISION;
    }

    return {
      consulta: {
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        documento,
        tipoDocumento,
      },
      fecha: new Date().toISOString(),
      // La huella de las listas es lo que hace auditable la consulta: permite
      // demostrar contra qué versión exacta se consultó.
      listas: indice.listas.map(resumenLista),
      umbrales: { alerta: topeAlerta, revision: topeRevision },
      coincidencias,
      resultado,
    };
  }

  return { consultar, indice };
}

function resumenLista(lista) {
  return {
    id: lista.id,
    nombre: lista.nombre,
    fuente: lista.fuente,
    autoridad: lista.autoridad,
    vinculante: Boolean(lista.vinculante),
    fechaPublicacion: lista.fechaPublicacion,
    sha256: lista.sha256,
    registros: lista.registros ? lista.registros.length : lista.total,
  };
}

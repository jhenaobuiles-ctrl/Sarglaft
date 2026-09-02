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
  // umbral normal, así que para *alertar* se exige mucho más.
  alertaNombreCorto: 0.98,
  // La revisión, en cambio, se abre. Medido con `scripts/evaluar-motor.mjs`
  // sobre las listas publicadas: a 0.93 un designado del que solo se escribió
  // el primer apellido —"Rashid Taan" por "Rashid Taan Kathim", que es como
  // llega media matrícula— se encontraba el 29% de las veces (69,5% entre los
  // designados colombianos); a 0.82 sube a 70,5% y 87%. El precio son unas 9
  // revisiones de más por cada 300 contrapartes de dos palabras, y **ninguna
  // alerta nueva**: `alertaNombreCorto` no se toca, así que lo que entra queda
  // en EN_REVISION, que es una mirada humana y no un bloqueo. En un panel
  // SARLAFT ese cambio vale: el falso negativo se firma sin enterarse, el
  // falso positivo se descarta leyendo dos líneas.
  revisionNombreCorto: 0.82,
};

export function crearMotor(listas, opciones = {}) {
  const indice = construirIndice(listas);
  const umbrales = { ...UMBRALES, ...(opciones.umbrales || {}) };
  // Las listas que debían estar y no se pudieron cargar. Viajan con cada
  // resultado y se guardan con él: meses después, quien lea el certificado no
  // tiene otra forma de saber que ese «sin hallazgos» se dio sin la lista de
  // la ONU. Callarlo es dejar que el certificado afirme lo que no hizo.
  const ausentes = (opciones.ausentes || []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    vinculante: Boolean(a.vinculante),
    motivo: a.error || a.motivo || '',
  }));

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
      ausentes,
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
    // Si el sha256 se llegó a comprobar contra el archivo descargado. Va en
    // el resumen y no solo en el arranque porque quien lee el certificado
    // meses después no tiene forma de saberlo de otro modo. Se copia tal
    // cual, sin dar por buena la ausencia: una consulta guardada antes de que
    // esto existiera no comprobó nada, y el certificado no puede decir que sí.
    huellaVerificada: lista.huellaVerificada,
    registros: lista.registros ? lista.registros.length : lista.total,
  };
}

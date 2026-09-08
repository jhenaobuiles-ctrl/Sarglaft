// El contrato de normalización que se publica con las listas.
//
// EL PROBLEMA QUE RESUELVE
//
// El índice de nombres y documentos de `data/listas/*.json` se construye
// normalizando con `app/motor/normalizar.js`. Quien consulta —hoy el sistema de
// gestión, que tiene su propio puerto de ese módulo— normaliza por su cuenta.
// Si las dos normalizaciones dejan de coincidir, el cruce devuelve «sin
// hallazgos» sobre alguien que sí está designado, y **no falla nada**: no hay
// excepción, ni fila rechazada, ni registro en ningún log.
//
// Hay además un desfase que ninguna reorganización de los repositorios evita:
// las listas que se sirven hoy se indexaron con la normalización de ayer. Un
// cambio de esta mañana no toca lo ya publicado hasta el barrido siguiente.
//
// LA FORMA DE COMPROBARLO
//
// El manifiesto publica un puñado de casos con el resultado que esta
// normalización les da. Quien consulta pasa su propio normalizador por las
// mismas entradas y compara. Si no cuadran, no puede afirmar que su consulta
// valga: lo dice en pantalla y lo deja escrito en la constancia, igual que
// hace con la huella de cada archivo.
//
// Los casos no son ejemplos bonitos: son las decisiones que se pueden perder al
// portar el módulo a otro lenguaje —la Ñ que se iguala a la N, los ceros a la
// izquierda de una cédula, el recorte de la forma societaria— y que al perderse
// no rompen nada visible.

import {
  normalizarNombre,
  normalizarRazonSocial,
  normalizarDocumento,
  variantesDocumento,
} from '../app/motor/normalizar.js';

const ENTRADAS = [
  // Tildes, puntuación y mayúsculas.
  { entrada: 'José Peña-Gómez, Jr.', nombre: true },
  // La Ñ pierde la virgulilla a propósito: las fuentes extranjeras transcriben
  // los apellidos españoles sin ella y tienen que caer en la misma clave.
  { entrada: 'Peña', nombre: true },
  { entrada: 'Pena', nombre: true },
  // Espacios de más y partículas sin poder discriminante.
  { entrada: '  María   de los Ángeles  Restrepo ', nombre: true },
  // Formas societarias, escritas de las tres maneras que aparecen.
  { entrada: 'Comercializadora Andina S.A.S.', razonSocial: true },
  { entrada: 'COMERCIALIZADORA ANDINA S A S', razonSocial: true },
  { entrada: 'Inversiones Lopez y Cia Ltda', razonSocial: true },
  // Un nombre que es solo la forma societaria no se puede vaciar.
  { entrada: 'SAS', razonSocial: true },
  // Cédulas escritas como las escribe cada quien.
  { entrada: '0079.123.456', documento: true },
  { entrada: '79 123 456', documento: true },
  // Pasaporte alfanumérico.
  { entrada: 'AB-123 456', documento: true },
  // El NIT es el único al que se le busca también la variante sin su dígito de
  // verificación. Hacerlo con una cédula produciría la cédula de otra persona.
  { entrada: '900228328-7', variantesNit: true },
  { entrada: '1144087221', variantesCedula: true },
];

/**
 * El bloque que va al manifiesto.
 *
 * Cada caso lleva su entrada y el resultado esperado de las funciones que
 * ejercita. Quien comprueba no necesita saber cuáles son: aplica las que
 * vengan.
 */
export function contratoDeNormalizacion() {
  return {
    // Sube cuando cambien los casos, para que quien compruebe pueda decir
    // «esto lo indexó una versión que no conozco» en vez de fallar en silencio.
    version: 1,
    casos: ENTRADAS.map((caso) => {
      const salida = { entrada: caso.entrada };
      if (caso.nombre) salida.nombre = normalizarNombre(caso.entrada);
      if (caso.razonSocial) salida.razonSocial = normalizarRazonSocial(caso.entrada);
      if (caso.documento) salida.documento = normalizarDocumento(caso.entrada);
      if (caso.variantesNit) salida.variantesNit = variantesDocumento(caso.entrada, 'NIT');
      if (caso.variantesCedula) {
        salida.variantesCedula = variantesDocumento(caso.entrada, 'Cédula de ciudadanía');
      }
      return salida;
    }),
  };
}

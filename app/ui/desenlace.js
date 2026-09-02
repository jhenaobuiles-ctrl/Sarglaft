// El desenlace de una alerta: qué se decidió y por qué.
//
// El panel avisaba de las alertas sin analizar pero no ofrecía forma de
// cerrarlas: lo único que había era el campo libre de observaciones. Un texto
// suelto no responde la pregunta que hace un auditor ante una coincidencia
// —«¿la vincularon o no, y con qué sustento?»— y no se puede contar ni
// resumir en un informe.
//
// Aquí el desenlace es un dato: una de cuatro salidas posibles, con su
// justificación, su fecha y quién la firmó. La justificación es obligatoria a
// propósito. Una decisión sin razones escritas es exactamente el vacío que
// este módulo existe para llenar.
//
// El mismo formulario se usa en la consulta recién hecha y en el expediente,
// porque la mayoría de las alertas no nacen de una consulta puntual sino de
// un cruce masivo, y allí la única puerta de entrada es el expediente.

import { guardar, obtener, ALMACENES } from '../registro/db.js';
import { esc, fechaHora } from './formato.js';

export const DESENLACES = [
  {
    id: 'homonimo',
    rotulo: 'Descartada: es un homónimo',
    ayuda: 'El documento, la fecha de nacimiento o la nacionalidad no corresponden.',
    clase: 'SIN_HALLAZGOS',
  },
  {
    id: 'seguimiento',
    rotulo: 'Se vincula con seguimiento reforzado',
    ayuda: 'La coincidencia no se confirma, pero el caso queda bajo vigilancia.',
    clase: 'EN_REVISION',
  },
  {
    id: 'rechazada',
    rotulo: 'No se vincula o se termina la relación',
    ayuda: 'La coincidencia se confirma o no se pudo descartar.',
    clase: 'ALERTA',
  },
  {
    id: 'reportada',
    rotulo: 'Se reporta a la UIAF como operación sospechosa',
    ayuda: 'El reporte se transmite por el SIREL; este panel no lo envía.',
    clase: 'ALERTA',
  },
];

const POR_ID = new Map(DESENLACES.map((d) => [d.id, d]));

export function etiquetaDesenlace(id) {
  return POR_ID.get(id)?.rotulo || '';
}

export function claseDesenlace(id) {
  return POR_ID.get(id)?.clase || 'neutra';
}

/** Solo las coincidencias piden una decisión; lo limpio no cierra nada. */
export function requiereDesenlace(consulta) {
  return consulta.resultado === 'ALERTA' || consulta.resultado === 'EN_REVISION';
}

/**
 * Una alerta está cerrada cuando consta qué se decidió.
 *
 * Vale el desenlace registrado aquí o un formato de debida diligencia
 * intensificada que cite la consulta: son dos caminos al mismo sitio y sería
 * absurdo exigir los dos.
 */
export function estaCerrada(consulta, conDebidaDiligencia = new Set()) {
  if (!requiereDesenlace(consulta)) return true;
  if (consulta.decision?.desenlace) return true;
  return conDebidaDiligencia.has(consulta.id);
}

/** Identificadores de consulta citados por un formato de debida diligencia. */
export function citadasEnDocumentos(documentos) {
  return new Set(
    documentos
      .filter((d) => d.plantilla === 'debida-diligencia')
      .map((d) => String(d.valores?.consultaId || '').trim())
      .filter(Boolean),
  );
}

/**
 * Cuenta las alertas por desenlace. Alimenta el informe del oficial de
 * cumplimiento, que hasta ahora obligaba a contarlas a mano.
 */
export function resumenDesenlaces(consultas, conDebidaDiligencia = new Set()) {
  const resumen = { total: 0, sinCerrar: 0 };
  for (const d of DESENLACES) resumen[d.id] = 0;

  for (const consulta of consultas) {
    if (!requiereDesenlace(consulta)) continue;
    resumen.total++;
    const elegido = consulta.decision?.desenlace;
    if (elegido && resumen[elegido] !== undefined) resumen[elegido]++;
    else if (!estaCerrada(consulta, conDebidaDiligencia)) resumen.sinCerrar++;
  }
  return resumen;
}

/** La etiqueta de color con el desenlace, o el aviso de que falta decidirlo. */
export function chipHTML(consulta) {
  if (!requiereDesenlace(consulta)) return '';
  const elegido = consulta.decision?.desenlace;
  if (elegido) {
    return `<span class="etiqueta ${claseDesenlace(elegido)} menuda">${esc(etiquetaDesenlace(elegido))}</span>`;
  }
  return '<span class="sin-decidir">Sin decidir</span>';
}

/**
 * Redacta el resumen de alertas para el informe del oficial de cumplimiento.
 *
 * El panel ya sabe cuántas alertas hubo y en qué acabaron; obligar a contarlas
 * a mano es pedir que alguien se equivoque escribiendo lo que el sistema tiene
 * delante. El texto se propone como borrador y se edita antes de firmar.
 */
export function redactarDesenlaces(resumen) {
  if (!resumen.total) {
    return 'En el período no se registraron coincidencias que requirieran decisión.';
  }
  const partes = DESENLACES.filter((d) => resumen[d.id]).map(
    (d) => `${resumen[d.id]} ${d.rotulo.toLowerCase()}`,
  );
  const frases = [`En el período se registraron ${resumen.total} coincidencia(s) que requerían decisión.`];
  if (partes.length) frases.push(`Desenlaces: ${partes.join('; ')}.`);
  frases.push(
    resumen.sinCerrar
      ? `Quedan ${resumen.sinCerrar} sin decisión registrada a la fecha de este informe.`
      : 'Todas cuentan con su decisión y su sustento registrados.',
  );
  return frases.join(' ');
}

/* ---------- una alerta abierta por contraparte ---------- */

const GRAVEDAD = { SIN_HALLAZGOS: 0, EN_REVISION: 1, ALERTA: 2 };

export function gravedad(resultado) {
  return GRAVEDAD[resultado] ?? 0;
}

/**
 * Qué registrar tras volver a consultar a una contraparte en un barrido.
 *
 * - Si empeoró, es un hallazgo nuevo: se registra una consulta propia.
 * - Si sigue coincidiendo igual que antes, se muestra en el barrido pero se
 *   reutiliza la consulta que ya está abierta. Crear una copia cada mes
 *   reabriría una decisión ya tomada y dejaría el contador de pendientes
 *   creciendo por una alerta que alguien ya atendió.
 * - Si salió limpia, no se registra nada: el barrido completo ya consta.
 *
 * Vive aquí y no en la revisión porque de esto depende que «una alerta
 * abierta» siga queriendo decir una contraparte y no un barrido.
 */
export function planDeRegistro(previa, resultadoNuevo) {
  const empeoro = gravedad(resultadoNuevo) > gravedad(previa.resultado);
  const interesa = empeoro || resultadoNuevo !== 'SIN_HALLAZGOS';
  return { interesa, empeoro, reusaConsulta: interesa && !empeoro };
}

/* ---------- formulario ---------- */

export function formularioHTML(consulta) {
  const decision = consulta.decision || {};
  const cerrada = Boolean(decision.desenlace);

  return `
    <div class="desenlace ${cerrada ? 'cerrada' : 'abierta'}" data-desenlace="${esc(consulta.id)}">
      <div class="desenlace-cab">
        <h3>Decisión sobre esta coincidencia</h3>
        ${
          cerrada
            ? `<span class="etiqueta ${claseDesenlace(decision.desenlace)}">${esc(etiquetaDesenlace(decision.desenlace))}</span>`
            : '<span class="etiqueta ALERTA">Sin decidir</span>'
        }
      </div>
      <p class="tenue">
        Mientras no quede escrito qué se decidió y por qué, el expediente está incompleto.
        Es la primera pregunta ante una coincidencia.
      </p>
      <div class="campos">
        <div style="grid-column: 1 / -1">
          <label for="des-${esc(consulta.id)}">Desenlace</label>
          <select id="des-${esc(consulta.id)}" data-campo="desenlace">
            <option value="">— elegir —</option>
            ${DESENLACES.map(
              (d) =>
                `<option value="${esc(d.id)}"${decision.desenlace === d.id ? ' selected' : ''}>${esc(d.rotulo)}</option>`,
            ).join('')}
          </select>
          <p class="tenue ayuda-desenlace" style="margin:.4em 0 0"></p>
        </div>
        <div style="grid-column: 1 / -1">
          <label for="sus-${esc(consulta.id)}">Sustento de la decisión</label>
          <textarea id="sus-${esc(consulta.id)}" data-campo="sustento"
            placeholder="Qué se contrastó (documento, fecha de nacimiento, nacionalidad), con qué fuente, y por qué se concluye lo anterior.">${esc(decision.sustento || '')}</textarea>
        </div>
      </div>
      <div class="acciones">
        <button type="button" class="accion" data-guardar-desenlace>
          ${cerrada ? 'Actualizar la decisión' : 'Guardar la decisión'}
        </button>
      </div>
      <p class="tenue estado-desenlace">${
        cerrada
          ? `Decidido el ${esc(fechaHora(decision.fecha))}${decision.responsable ? ` por ${esc(decision.responsable)}` : ''}.`
          : ''
      }</p>
    </div>
  `;
}

/**
 * Conecta el formulario. `alGuardar` recibe la consulta ya actualizada.
 *
 * Devuelve una función para soltar el escuchador, porque en el expediente el
 * formulario se abre y se cierra dentro de una fila que se vuelve a pintar.
 */
export function conectar(contenedor, consulta, opciones = {}) {
  const caja = contenedor.querySelector(`[data-desenlace="${CSS.escape(consulta.id)}"]`);
  if (!caja) return () => {};

  const select = caja.querySelector('[data-campo="desenlace"]');
  const sustento = caja.querySelector('[data-campo="sustento"]');
  const ayuda = caja.querySelector('.ayuda-desenlace');
  const estado = caja.querySelector('.estado-desenlace');

  const pintarAyuda = () => {
    ayuda.textContent = POR_ID.get(select.value)?.ayuda || '';
  };
  pintarAyuda();
  select.addEventListener('change', pintarAyuda);

  const alPulsar = async (evento) => {
    if (!evento.target.closest('[data-guardar-desenlace]')) return;

    if (!select.value) {
      estado.textContent = 'Elige un desenlace antes de guardar.';
      select.focus();
      return;
    }
    if (!sustento.value.trim()) {
      // Bloquear aquí es el punto del módulo: una decisión sin razones
      // escritas no cierra nada ante quien la revise.
      estado.textContent = 'Escribe el sustento: una decisión sin razones no cierra la alerta.';
      sustento.focus();
      return;
    }

    consulta.decision = {
      desenlace: select.value,
      sustento: sustento.value.trim(),
      fecha: new Date().toISOString(),
      responsable: opciones.responsable || '',
    };
    await guardar(ALMACENES.consultas, consulta);
    caja.classList.remove('abierta');
    caja.classList.add('cerrada');
    estado.textContent = `Decisión guardada el ${fechaHora(consulta.decision.fecha)}.`;
    if (opciones.alGuardar) opciones.alGuardar(consulta);
  };

  caja.addEventListener('click', alPulsar);
  return () => caja.removeEventListener('click', alPulsar);
}

/**
 * Despliega el formulario bajo la fila de una tabla, o lo recoge si ya estaba.
 *
 * Lo usan el expediente, el resultado de un cruce masivo y el de una revisión
 * periódica: son tres tablas distintas con el mismo gesto. El formulario va en
 * una fila propia y no dentro de la celda porque necesita el ancho de la
 * tabla; encajado en la columna de acciones queda ilegible.
 *
 * El botón trae la consulta en `data-analizar` y su rótulo original en
 * `data-rotulo`.
 */
export async function alternarFila(boton, opciones = {}) {
  const fila = boton.closest('tr');
  const abierta = fila.nextElementSibling;
  if (abierta?.classList.contains('fila-desenlace')) {
    abierta.remove();
    boton.textContent = boton.dataset.rotulo;
    return null;
  }

  const consulta = await obtener(ALMACENES.consultas, boton.dataset.analizar);
  if (!consulta) return null;

  const nueva = document.createElement('tr');
  nueva.className = 'fila-desenlace';
  const celda = document.createElement('td');
  celda.colSpan = fila.cells.length;
  celda.innerHTML = formularioHTML(consulta);
  nueva.appendChild(celda);
  fila.after(nueva);

  conectar(celda, consulta, opciones);
  boton.textContent = 'Ocultar';
  nueva.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return consulta;
}

/**
 * Deja decidir una alerta sin salir de la tabla donde apareció.
 *
 * El escuchador se registra una sola vez sobre un contenedor fijo, no al
 * pintar cada resultado: pintar ocurre una vez por cruce, y registrarlo ahí
 * apilaría un manejador por cada uno hasta que el desplegable se abriera y se
 * cerrara solo.
 *
 * `opciones()` se consulta en cada clic, no al montar, porque el responsable
 * puede haberse configurado después.
 */
export function conectarDecisiones(idContenedor, opciones = () => ({})) {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  contenedor.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-analizar]');
    if (!boton) return;
    const { responsable = '', alGuardar } = opciones() || {};
    await alternarFila(boton, {
      responsable,
      alGuardar: (consulta) => {
        const chip = document.querySelector(`[data-chip="${CSS.escape(consulta.id)}"]`);
        if (chip) chip.innerHTML = chipHTML(consulta);
        if (alGuardar) alGuardar(consulta);
      },
    });
  });
}

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

import { guardar, ALMACENES } from '../registro/db.js';
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

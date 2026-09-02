// Certificado de consulta: la constancia que se le muestra a un auditor.
//
// Se imprime con el propio navegador ("Guardar como PDF") en vez de generar
// el PDF con una librería. Es menos código, no añade dependencias y el
// resultado tiene el mismo valor probatorio.
//
// Lo que hace auditable el certificado no es el formato sino el contenido:
// deja constancia de contra qué versión exacta de cada lista se consultó
// —fecha de publicación y sha256 del archivo—, de modo que cualquiera pueda
// verificar ese mismo archivo en el repositorio público.

import {
  esc, fechaHora, fechaCorta, ROTULOS, TIPOS_REGISTRO, porcentaje,
  TITULOS_CERTIFICADO, explicacionDe,
} from './formato.js';
import { requiereDesenlace, etiquetaDesenlace } from './desenlace.js';

export function abrirCertificado(consulta, perfil) {
  imprimirHoja(certificadoHTML(consulta, perfil));
}

/**
 * Saca una hoja por la impresora del navegador.
 *
 * La usan el certificado de consulta y los documentos del catálogo: el
 * mecanismo —ocultar el panel, pintar la hoja, imprimir y recogerla— es el
 * mismo, y duplicarlo dejaría la pantalla trabada si solo se arreglara uno de
 * los dos.
 */
export function imprimirHoja(html) {
  const contenedor = document.createElement('div');
  contenedor.id = 'hoja-certificado';
  contenedor.innerHTML = html;
  document.body.appendChild(contenedor);
  document.body.classList.add('imprimiendo');

  const terminar = () => {
    document.body.classList.remove('imprimiendo');
    contenedor.remove();
    window.removeEventListener('afterprint', terminar);
  };
  window.addEventListener('afterprint', terminar);

  window.print();
  // Algunos navegadores no emiten afterprint; el respaldo evita que la hoja
  // se quede pegada en pantalla.
  setTimeout(() => {
    if (document.body.classList.contains('imprimiendo')) terminar();
  }, 60000);
}

export function certificadoHTML(consulta, perfil = {}) {
  const { resultado, fecha } = consulta;
  const c = consulta.consulta || {};

  return `
    <header class="cert-encabezado">
      <div>
        <h1>${esc(TITULOS_CERTIFICADO[consulta.tipo] || TITULOS_CERTIFICADO.puntual)}</h1>
        <p class="tenue">${esc(perfil.empresa || '')}${perfil.nit ? ` · NIT ${esc(perfil.nit)}` : ''}</p>
      </div>
      <div class="cert-sello etiqueta ${resultado}">${esc(ROTULOS[resultado] || resultado)}</div>
    </header>

    <section>
      <h2>Contraparte consultada</h2>
      <dl class="cert-datos">
        <dt>Nombre o razón social</dt><dd>${esc(c.nombre) || '—'}</dd>
        <dt>Documento</dt><dd>${c.documento ? `${esc(c.tipoDocumento || 'Documento')} ${esc(c.documento)}` : '—'}</dd>
        ${consulta.vinculo ? `<dt>Tipo de contraparte</dt><dd>${esc(consulta.vinculo)}</dd>` : ''}
        ${consulta.pepDetalle ? `<dt>Condición PEP</dt><dd>${esc(consulta.pepDetalle)}</dd>` : ''}
        <dt>Fecha y hora de la consulta</dt><dd>${esc(fechaHora(fecha))} (hora de Colombia)</dd>
        <dt>Realizada por</dt><dd>${esc(perfil.responsable || '—')}${perfil.cargo ? ` · ${esc(perfil.cargo)}` : ''}</dd>
        <dt>Identificador de la consulta</dt><dd class="mono">${esc(consulta.id || '—')}</dd>
      </dl>
    </section>

    <section>
      <h2>Resultado</h2>
      <p><strong>${esc(ROTULOS[resultado] || resultado)}.</strong> ${esc(explicacionDe(consulta))}</p>
      ${consulta.tipo === 'antecedentes' ? '' : coincidenciasHTML(consulta.coincidencias || [])}
    </section>

    ${decisionHTML(consulta)}

    ${fuentesHTML(consulta)}

    ${consulta.observaciones ? `<section><h2>Observaciones del responsable</h2><p>${esc(consulta.observaciones)}</p></section>` : ''}

    <section class="cert-nota">
      <h2>Alcance</h2>
      ${alcanceHTML(consulta)}
      <p>
        Este documento deja constancia de que la verificación se hizo y de contra qué se hizo. No
        sustituye el análisis ni la decisión del responsable de cumplimiento.
      </p>
      <div class="cert-firma">
        <div><span></span><p>${esc(perfil.responsable || '')}<br>${esc(perfil.cargo || 'Responsable de cumplimiento')}</p></div>
      </div>
    </section>
  `;
}

/**
 * La decisión sobre la coincidencia.
 *
 * Es la pregunta que sigue a un hallazgo, y el certificado la responde o dice
 * que todavía no está respondida. Imprimir una alerta sin decisión como si el
 * expediente estuviera completo sería afirmar lo que no ocurrió.
 */
function decisionHTML(consulta) {
  if (!requiereDesenlace(consulta)) return '';
  const decision = consulta.decision;

  if (!decision?.desenlace) {
    return `<section>
      <h2>Decisión sobre la coincidencia</h2>
      <p><strong>Pendiente.</strong> A la fecha de impresión de este documento no se había
      registrado la decisión del responsable de cumplimiento sobre esta coincidencia.</p>
    </section>`;
  }

  return `<section>
    <h2>Decisión sobre la coincidencia</h2>
    <dl class="cert-datos">
      <dt>Desenlace</dt><dd><strong>${esc(etiquetaDesenlace(decision.desenlace))}</strong></dd>
      <dt>Sustento</dt><dd>${esc(decision.sustento || '—')}</dd>
      <dt>Fecha de la decisión</dt><dd>${esc(fechaHora(decision.fecha))}</dd>
      <dt>Adoptada por</dt><dd>${esc(decision.responsable || '—')}</dd>
    </dl>
  </section>`;
}

/**
 * Qué se consultó realmente.
 *
 * Una consulta en listas y una constancia de antecedentes no se sustentan en
 * lo mismo: la primera con la versión de cada archivo de sanciones, la
 * segunda con las entidades donde una persona fue a mirar. Imprimir la tabla
 * de listas vacía en una constancia de antecedentes no solo no informaba:
 * dejaba un certificado que decía haber cruzado listas sin haberlo hecho.
 */
function fuentesHTML(consulta) {
  const partes = [];
  if ((consulta.listas || []).length) partes.push(listasHTML(consulta.listas));
  if ((consulta.revisiones || []).length) partes.push(revisionesHTML(consulta.revisiones));

  if (!partes.length) {
    return `<section>
      <h2>Fuentes consultadas</h2>
      <p class="tenue">Esta consulta no dejó registro de las fuentes verificadas.</p>
    </section>`;
  }
  return partes.join('\n');
}

function listasHTML(listas) {
  return `<section>
    <h2>Listas consultadas y su versión</h2>
    <p class="tenue">
      El sha256 identifica el archivo exacto contra el que se hizo el cruce. Permite verificar
      esta consulta contra el repositorio público sin depender de este panel.
    </p>
    <table>
      <thead><tr><th>Lista</th><th>Autoridad</th><th>Publicada</th><th>Registros</th><th>sha256</th></tr></thead>
      <tbody>
        ${listas
          .map(
            (l) => `<tr>
              <td>${esc(l.nombre)}${l.vinculante ? ' <strong>(vinculante)</strong>' : ''}</td>
              <td>${esc(l.autoridad || '—')}</td>
              <td>${esc(fechaCorta(l.fechaPublicacion))}</td>
              <td class="numero">${(l.registros || 0).toLocaleString('es-CO')}</td>
              <td class="mono">${esc((l.sha256 || '').slice(0, 16))}…</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </section>`;
}

function revisionesHTML(revisiones) {
  return `<section>
    <h2>Entidades consultadas</h2>
    <p class="tenue">
      Consultas hechas por una persona en el sitio de cada entidad. La evidencia adjunta queda
      archivada en el expediente con la fecha y hora de esta constancia.
    </p>
    <table>
      <thead><tr><th>Consulta</th><th>Entidad</th><th>Resultado</th><th>Evidencia</th></tr></thead>
      <tbody>
        ${revisiones
          .map(
            (r) => `<tr>
              <td>${esc(r.nombre)}</td>
              <td>${esc(r.entidad)}</td>
              <td>${esc(ROTULOS[r.resultado] || RESULTADOS_MANUALES[r.resultado] || r.resultado)}</td>
              <td>${r.conEvidencia ? esc(r.archivo || 'Adjunta') : '—'}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </section>`;
}

const RESULTADOS_MANUALES = {
  NO_APLICA: 'No aplica',
  SIN_REGISTRAR: 'Sin registrar',
};

function alcanceHTML(consulta) {
  const hayListas = (consulta.listas || []).length > 0;
  const hayRevisiones = (consulta.revisiones || []).length > 0;

  const parrafos = [];
  if (hayListas) {
    parrafos.push(
      'Esta consulta se realizó contra las listas relacionadas arriba, en la versión vigente en ' +
        'la fecha indicada. La Lista Consolidada del Consejo de Seguridad de las Naciones Unidas ' +
        'es de aplicación obligatoria; las demás se consultan como práctica de debida diligencia.',
    );
  }
  if (hayRevisiones) {
    parrafos.push(
      'Las entidades relacionadas arriba se consultaron de forma manual en sus sitios oficiales: ' +
        'usan CAPTCHA y sus términos de uso prohíben el acceso automatizado, así que la ' +
        'verificación la hizo una persona y lo que aquí consta es su resultado.',
    );
  }
  if (!hayListas) {
    parrafos.push(
      'Esta constancia no cubre el cruce contra listas restrictivas, que se realiza y se ' +
        'certifica por separado.',
    );
  }
  if (!hayRevisiones) {
    parrafos.push(
      'Esta consulta no cubre los antecedentes de Procuraduría, Contraloría, Policía ni Rama ' +
        'Judicial, que se consultan por separado y se archivan como evidencia aparte.',
    );
  }
  return parrafos.map((t) => `<p>${t}</p>`).join('\n      ');
}

function coincidenciasHTML(coincidencias) {
  if (!coincidencias.length) {
    return '<p class="tenue">No se registraron coincidencias.</p>';
  }
  return `
    <table>
      <thead><tr><th>Registro coincidente</th><th>Lista</th><th>Tipo</th><th>Motivo</th><th>Similitud</th></tr></thead>
      <tbody>
        ${coincidencias
          .map(
            (c) => `<tr>
              <td>${esc(c.registro.n)}${c.coincide && c.coincide !== c.registro.n ? `<br><span class="tenue">coincidió por: ${esc(c.coincide)}</span>` : ''}</td>
              <td>${esc(c.lista.nombre)}</td>
              <td>${esc(TIPOS_REGISTRO[c.registro.t] || '—')}</td>
              <td>${c.motivo === 'documento' ? 'Número de documento' : 'Nombre'}</td>
              <td class="numero">${c.motivo === 'documento' ? 'exacta' : esc(porcentaje(c.puntaje))}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

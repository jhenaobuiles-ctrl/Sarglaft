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

import { esc, fechaHora, fechaCorta, ROTULOS, EXPLICACIONES, TIPOS_REGISTRO, porcentaje } from './formato.js';

export function abrirCertificado(consulta, perfil) {
  const contenedor = document.createElement('div');
  contenedor.id = 'hoja-certificado';
  contenedor.innerHTML = certificadoHTML(consulta, perfil);
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
        <h1>Certificado de consulta en listas restrictivas</h1>
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
        <dt>Fecha y hora de la consulta</dt><dd>${esc(fechaHora(fecha))} (hora de Colombia)</dd>
        <dt>Realizada por</dt><dd>${esc(perfil.responsable || '—')}${perfil.cargo ? ` · ${esc(perfil.cargo)}` : ''}</dd>
        <dt>Identificador de la consulta</dt><dd class="mono">${esc(consulta.id || '—')}</dd>
      </dl>
    </section>

    <section>
      <h2>Resultado</h2>
      <p><strong>${esc(ROTULOS[resultado] || resultado)}.</strong> ${esc(EXPLICACIONES[resultado] || '')}</p>
      ${coincidenciasHTML(consulta.coincidencias || [])}
    </section>

    <section>
      <h2>Listas consultadas y su versión</h2>
      <p class="tenue">
        El sha256 identifica el archivo exacto contra el que se hizo el cruce. Permite verificar
        esta consulta contra el repositorio público sin depender de este panel.
      </p>
      <table>
        <thead><tr><th>Lista</th><th>Autoridad</th><th>Publicada</th><th>Registros</th><th>sha256</th></tr></thead>
        <tbody>
          ${(consulta.listas || [])
            .map(
              (l) => `<tr>
                <td>${esc(l.nombre)}</td>
                <td>${esc(l.autoridad || '—')}</td>
                <td>${esc(fechaCorta(l.fechaPublicacion))}</td>
                <td class="numero">${(l.registros || 0).toLocaleString('es-CO')}</td>
                <td class="mono">${esc((l.sha256 || '').slice(0, 16))}…</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>

    ${consulta.observaciones ? `<section><h2>Observaciones del responsable</h2><p>${esc(consulta.observaciones)}</p></section>` : ''}

    <section class="cert-nota">
      <h2>Alcance</h2>
      <p>
        Esta consulta se realizó contra las listas relacionadas arriba, en la versión vigente en la
        fecha indicada. La Lista Consolidada del Consejo de Seguridad de las Naciones Unidas es de
        aplicación obligatoria; las demás se consultan como práctica de debida diligencia.
      </p>
      <p>
        Este documento deja constancia de que la verificación se hizo y de contra qué se hizo. No
        sustituye el análisis ni la decisión del responsable de cumplimiento, y no cubre los
        antecedentes de Procuraduría, Contraloría, Policía ni Rama Judicial, que se consultan por
        separado y se archivan como evidencia aparte.
      </p>
      <div class="cert-firma">
        <div><span></span><p>${esc(perfil.responsable || '')}<br>${esc(perfil.cargo || 'Responsable de cumplimiento')}</p></div>
      </div>
    </section>
  `;
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

// El expediente de una contraparte: todo lo que hay de una misma persona.
//
// Lo que pide quien revisa no es una consulta suelta sino «el expediente de
// este alumno». Hasta ahora eso obligaba a recorrer tres pantallas —el
// historial, los documentos y las evidencias— y a acordarse de cómo se había
// escrito el nombre cada vez. Aquí se reúne solo, y se imprime de una pieza.

import { estado, alCambiarRegistro, registroCambio } from './app.js';
import { todos, obtener, ALMACENES } from '../registro/db.js';
import { construirFichas, filtrarFichas } from '../registro/contrapartes.js';
import { chipHTML, requiereDesenlace, conectarDecisiones, etiquetaDesenlace } from './desenlace.js';
import { abrirCertificado, imprimirHoja } from './certificado.js';
import { documentoHTML } from '../documentos/impreso.js';
import { POR_ID } from '../documentos/plantillas.js';
import { esc, fechaHora, ROTULOS, descargar } from './formato.js';

let fichas = [];
// Qué ficha está abierta, para volver a ella tras repintar.
let claveAbierta = null;

export function montarContrapartes() {
  document.getElementById('f-contraparte').addEventListener('input', pintarLista);

  document.getElementById('lista-contrapartes').addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-ficha]');
    if (!boton) return;
    claveAbierta = boton.dataset.ficha;
    pintarFicha();
  });

  document.getElementById('ficha-contraparte').addEventListener('click', alPulsarFicha);
  conectarDecisiones('ficha-contraparte', () => ({
    responsable: estado.config.responsable || '',
    alGuardar: registroCambio,
  }));

  recargar();
  alCambiarRegistro(recargar);
}

async function recargar() {
  const [consultas, documentos, evidencias] = await Promise.all([
    todos(ALMACENES.consultas),
    todos(ALMACENES.documentos),
    todos(ALMACENES.evidencias),
  ]);
  fichas = construirFichas({ consultas, documentos, evidencias });
  pintarLista();
  pintarFicha();
}

const fichaAbierta = () => fichas.find((f) => f.clave === claveAbierta) || null;

/* ---------- listado ---------- */

function pintarLista() {
  const destino = document.getElementById('lista-contrapartes');
  if (!fichas.length) {
    destino.innerHTML =
      '<div class="tarjeta"><p class="vacio">Todavía no hay contrapartes. Aparecen solas al consultar o al diligenciar un formato.</p></div>';
    return;
  }

  const lista = filtrarFichas(fichas, document.getElementById('f-contraparte').value);
  const pendientes = fichas.filter((f) => f.alertasAbiertas).length;

  destino.innerHTML = `
    <div class="tarjeta">
      <p class="tenue">
        ${fichas.length.toLocaleString('es-CO')} contraparte(s) en el expediente${
          pendientes ? ` · <strong>${pendientes} con alertas sin decidir</strong>` : ''
        }${lista.length !== fichas.length ? ` · ${lista.length} coincide(n) con la búsqueda` : ''}
      </p>
      ${
        lista.length
          ? `<div class="envoltura-tabla"><table>
              <thead><tr><th>Contraparte</th><th>Documento</th><th>Estado</th><th>Papeles</th><th>Última actividad</th><th></th></tr></thead>
              <tbody>${lista.slice(0, 300).map(filaHTML).join('')}</tbody>
            </table></div>
            ${lista.length > 300 ? '<p class="tenue">Se muestran las 300 más recientes; afina la búsqueda para ver el resto.</p>' : ''}`
          : '<p class="vacio">Ninguna contraparte coincide con la búsqueda.</p>'
      }
    </div>
  `;
}

function filaHTML(ficha) {
  return `<tr>
    <td>${esc(ficha.nombre) || '<span class="tenue">sin nombre registrado</span>'}</td>
    <td class="numero">${esc(ficha.documento) || '—'}</td>
    <td>
      ${
        ficha.resultadoActual
          ? `<span class="etiqueta ${ficha.resultadoActual}">${esc(ROTULOS[ficha.resultadoActual] || ficha.resultadoActual)}</span>`
          : '<span class="tenue">sin consultar</span>'
      }
      ${ficha.alertasAbiertas ? `<br><span class="sin-decidir">${ficha.alertasAbiertas} sin decidir</span>` : ''}
      ${ficha.pep ? '<br><span class="etiqueta EN_REVISION menuda">PEP</span>' : ''}
    </td>
    <td class="numero">${ficha.consultas.length} consulta(s)<br><span class="tenue">${ficha.documentos.length} documento(s)</span></td>
    <td class="numero">${esc(fechaHora(ficha.ultimaActividad))}</td>
    <td><button type="button" class="accion secundaria no-imprimir" data-ficha="${esc(ficha.clave)}">Ver expediente</button></td>
  </tr>`;
}

/* ---------- ficha ---------- */

function pintarFicha() {
  const destino = document.getElementById('ficha-contraparte');
  const ficha = fichaAbierta();
  if (!ficha) {
    destino.innerHTML = '';
    return;
  }

  destino.innerHTML = `
    <div class="tarjeta">
      <div class="encabezado-editor">
        <div>
          <h2>${esc(ficha.nombre) || 'Contraparte sin nombre registrado'}</h2>
          <p class="tenue">
            ${ficha.documento ? `${esc(ficha.tipoDocumento || 'Documento')} ${esc(ficha.documento)}` : 'Sin documento registrado'}
            ${ficha.vinculo ? ` · ${esc(ficha.vinculo)}` : ''}
            ${ficha.pepDetalle ? ` · ${esc(ficha.pepDetalle)}` : ''}
          </p>
        </div>
        <div class="acciones" style="margin:0">
          <button type="button" class="accion" data-accion="imprimir">Imprimir el expediente</button>
          <button type="button" class="accion secundaria" data-accion="cerrar">Cerrar</button>
        </div>
      </div>
      ${
        ficha.alertasAbiertas
          ? `<div class="aviso atencion">${ficha.alertasAbiertas} alerta(s) de esta contraparte siguen sin decisión registrada.</div>`
          : ''
      }
      ${consultasHTML(ficha)}
      ${documentosHTML(ficha)}
      ${evidenciasHTML(ficha)}
    </div>
  `;
}

function consultasHTML(ficha) {
  if (!ficha.consultas.length) return '<p class="tenue">Sin consultas registradas.</p>';
  return `
    <h3 style="margin-top:22px">Consultas (${ficha.consultas.length})</h3>
    <div class="envoltura-tabla"><table>
      <thead><tr><th>Fecha</th><th>Origen</th><th>Resultado</th><th></th></tr></thead>
      <tbody>${ficha.consultas
        .map(
          (c) => `<tr>
            <td class="numero">${esc(fechaHora(c.fecha))}</td>
            <td>${origen(c)}</td>
            <td>
              <span class="etiqueta ${c.resultado}">${esc(ROTULOS[c.resultado] || c.resultado)}</span>
              <br><span data-chip="${esc(c.id)}">${chipHTML(c)}</span>
            </td>
            <td class="acciones-fila">
              <button type="button" class="accion secundaria no-imprimir" data-certificado="${esc(c.id)}">Certificado</button>
              ${requiereDesenlace(c) ? `<button type="button" class="accion no-imprimir" data-analizar="${esc(c.id)}" data-rotulo="Decidir">Decidir</button>` : ''}
            </td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
}

function documentosHTML(ficha) {
  if (!ficha.documentos.length) {
    return '<h3 style="margin-top:22px">Documentos</h3><p class="tenue">Esta contraparte no tiene ningún formato diligenciado.</p>';
  }
  return `
    <h3 style="margin-top:22px">Documentos (${ficha.documentos.length})</h3>
    <div class="envoltura-tabla"><table>
      <thead><tr><th>Formato</th><th>Actualizado</th><th></th></tr></thead>
      <tbody>${ficha.documentos
        .map(
          (d) => `<tr>
            <td>${esc(d.nombrePlantilla || d.plantilla)}</td>
            <td class="numero">${esc(fechaHora(d.actualizado || d.fecha))}</td>
            <td><button type="button" class="accion secundaria no-imprimir" data-documento="${esc(d.id)}">Imprimir</button></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
}

function evidenciasHTML(ficha) {
  if (!ficha.evidencias.length) return '';
  return `
    <h3 style="margin-top:22px">Evidencias (${ficha.evidencias.length})</h3>
    <div class="lista-evidencias">${ficha.evidencias
      .map(
        (e) => `<div class="evidencia-fila">
          <button type="button" class="enlace-evidencia" data-evidencia="${esc(e.id)}">${esc(e.nombreArchivo)}</button>
          <span class="tenue">${(e.bytes / 1024).toFixed(0)} KB · ${esc(fechaHora(e.fecha))}</span>
        </div>`,
      )
      .join('')}</div>`;
}

function origen(c) {
  if (c.tipo === 'cruce') return 'Cruce o revisión';
  if (c.tipo === 'antecedentes') return 'Antecedentes Colombia';
  return 'Consulta puntual';
}

/* ---------- acciones ---------- */

async function alPulsarFicha(evento) {
  const ficha = fichaAbierta();
  if (!ficha) return;

  const accion = evento.target.closest('button[data-accion]');
  if (accion?.dataset.accion === 'cerrar') {
    claveAbierta = null;
    pintarFicha();
    return;
  }
  if (accion?.dataset.accion === 'imprimir') {
    imprimirHoja(expedienteHTML(ficha, estado.config));
    return;
  }

  const certificado = evento.target.closest('button[data-certificado]');
  if (certificado) {
    const consulta = ficha.consultas.find((c) => c.id === certificado.dataset.certificado);
    if (consulta) abrirCertificado(consulta, estado.config);
    return;
  }

  const documento = evento.target.closest('button[data-documento]');
  if (documento) {
    const guardado = await obtener(ALMACENES.documentos, documento.dataset.documento);
    const plantilla = guardado && POR_ID.get(guardado.plantilla);
    if (plantilla) imprimirHoja(documentoHTML(guardado, plantilla, estado.config));
    return;
  }

  const evidencia = evento.target.closest('button[data-evidencia]');
  if (evidencia) {
    const archivo = ficha.evidencias.find((e) => e.id === evidencia.dataset.evidencia);
    if (archivo) descargar(archivo.nombreArchivo, archivo.archivo, archivo.tipoArchivo);
  }
}

/* ---------- hoja imprimible ---------- */

/**
 * El expediente completo en una hoja.
 *
 * Enumera lo que hay y, con el mismo cuidado que el certificado, lo que no:
 * un expediente impreso que calla las alertas sin decidir o los formatos que
 * faltan induce a creer que está completo.
 */
export function expedienteHTML(ficha, perfil = {}) {
  const faltantes = [];
  if (!ficha.consultas.some((c) => c.tipo !== 'antecedentes')) {
    faltantes.push('No hay ninguna consulta contra listas restrictivas.');
  }
  if (!ficha.consultas.some((c) => c.tipo === 'antecedentes')) {
    faltantes.push('No hay constancia de consulta de antecedentes en Colombia.');
  }
  if (!ficha.documentos.length) {
    faltantes.push('No hay ningún formato diligenciado para esta contraparte.');
  }
  if (ficha.alertasAbiertas) {
    faltantes.push(`${ficha.alertasAbiertas} alerta(s) sin decisión registrada.`);
  }

  return `
    <header class="cert-encabezado">
      <div>
        <h1>Expediente de contraparte</h1>
        <p class="tenue">${esc(perfil.empresa || '')}${perfil.nit ? ` · NIT ${esc(perfil.nit)}` : ''}</p>
      </div>
      <div class="cert-sello etiqueta ${ficha.resultadoActual || 'neutra'}">
        ${esc(ROTULOS[ficha.resultadoActual] || 'Sin consultar')}
      </div>
    </header>

    <section>
      <h2>Contraparte</h2>
      <dl class="cert-datos">
        <dt>Nombre o razón social</dt><dd>${esc(ficha.nombre) || '—'}</dd>
        <dt>Documento</dt><dd>${ficha.documento ? `${esc(ficha.tipoDocumento || 'Documento')} ${esc(ficha.documento)}` : '—'}</dd>
        <dt>Tipo de contraparte</dt><dd>${esc(ficha.vinculo) || '—'}</dd>
        <dt>Condición PEP</dt><dd>${esc(ficha.pepDetalle) || 'No declara ser PEP'}</dd>
        <dt>Última consulta en listas</dt><dd>${esc(fechaHora(ficha.ultimaConsulta))}</dd>
      </dl>
    </section>

    <section>
      <h2>Consultas registradas</h2>
      ${
        ficha.consultas.length
          ? `<table>
              <thead><tr><th>Fecha</th><th>Origen</th><th>Resultado</th><th>Decisión</th></tr></thead>
              <tbody>${ficha.consultas
                .map(
                  (c) => `<tr>
                    <td>${esc(fechaHora(c.fecha))}</td>
                    <td>${origen(c)}</td>
                    <td>${esc(ROTULOS[c.resultado] || c.resultado)}</td>
                    <td>${decisionTexto(c)}</td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table>`
          : '<p class="tenue">Ninguna.</p>'
      }
    </section>

    <section>
      <h2>Documentos del expediente</h2>
      ${
        ficha.documentos.length
          ? `<table>
              <thead><tr><th>Formato</th><th>Fecha</th><th>Identificador</th></tr></thead>
              <tbody>${ficha.documentos
                .map(
                  (d) => `<tr>
                    <td>${esc(d.nombrePlantilla || d.plantilla)}</td>
                    <td>${esc(fechaHora(d.actualizado || d.fecha))}</td>
                    <td class="mono">${esc(d.id)}</td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table>`
          : '<p class="tenue">Ninguno.</p>'
      }
    </section>

    ${
      ficha.evidencias.length
        ? `<section>
            <h2>Evidencias archivadas</h2>
            <table>
              <thead><tr><th>Archivo</th><th>Fecha</th></tr></thead>
              <tbody>${ficha.evidencias
                .map((e) => `<tr><td>${esc(e.nombreArchivo)}</td><td>${esc(fechaHora(e.fecha))}</td></tr>`)
                .join('')}</tbody>
            </table>
          </section>`
        : ''
    }

    <section class="cert-nota">
      <h2>Lo que este expediente no cubre</h2>
      ${
        faltantes.length
          ? `<ul>${faltantes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          : '<p>No se advierten vacíos: hay consulta en listas, constancia de antecedentes, formatos diligenciados y ninguna alerta sin decidir.</p>'
      }
      <p>
        Impreso el ${esc(fechaHora(new Date().toISOString()))} (hora de Colombia).
        ${perfil.marcoNormativo ? `<br>${esc(perfil.marcoNormativo)}` : ''}
      </p>
      <div class="cert-firma">
        <div><span></span><p>${esc(perfil.responsable || '')}<br>${esc(perfil.cargo || 'Responsable de cumplimiento')}</p></div>
      </div>
    </section>
  `;
}

function decisionTexto(consulta) {
  if (!requiereDesenlace(consulta)) return '—';
  const decision = consulta.decision;
  if (!decision?.desenlace) return '<strong>Pendiente</strong>';
  // En papel el color no dice nada: va el rótulo en texto.
  return `${esc(etiquetaDesenlace(decision.desenlace))}<br><span class="tenue">${esc(decision.sustento || '')}</span>`;
}

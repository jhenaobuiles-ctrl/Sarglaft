// Consulta puntual de una contraparte.

import { estado, registroCambio } from './app.js';
import { guardar, ALMACENES, nuevoId } from '../registro/db.js';
import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';
import { abrirCertificado } from './certificado.js';
import {
  esc, fechaHora, fechaCorta, ROTULOS, TIPOS_REGISTRO, porcentaje, etiquetaPEP, explicacionDe,
} from './formato.js';

export function montarConsulta() {
  const formulario = document.getElementById('formulario-consulta');
  const salida = document.getElementById('resultado-consulta');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nombre = document.getElementById('c-nombre').value.trim();
    const documento = document.getElementById('c-doc').value.trim();
    const tipoDocumento = document.getElementById('c-tipo-doc').value;
    const vinculo = document.getElementById('c-vinculo').value;
    const condicionPep = document.getElementById('c-pep').value;

    if (!nombre && !documento) {
      salida.innerHTML =
        '<div class="aviso atencion">Escribe al menos un nombre o un número de documento.</div>';
      return;
    }

    const resultado = estado.motor.consultar({ nombre, documento, tipoDocumento });

    // El registro guarda campos normalizados aparte para poder buscarlos por
    // índice después, sin recorrer todo el expediente.
    const consulta = {
      ...resultado,
      id: nuevoId('c'),
      tipo: 'puntual',
      vinculo,
      pep: Boolean(condicionPep),
      pepDetalle: etiquetaPEP(condicionPep),
      nombreNormalizado: normalizarNombre(nombre),
      documentoNormalizado: normalizarDocumento(documento),
      responsable: estado.config.responsable || '',
      observaciones: '',
      cruceId: null,
    };
    await guardar(ALMACENES.consultas, consulta);
    registroCambio();

    salida.innerHTML = vistaResultado(consulta);
    conectarAcciones(salida, consulta);
    salida.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('boton-limpiar').addEventListener('click', () => {
    formulario.reset();
    salida.innerHTML = '';
    document.getElementById('c-nombre').focus();
  });
}

export function vistaResultado(consulta) {
  const { resultado } = consulta;
  return `
    <div class="veredicto ${resultado}">
      <h2>${esc(ROTULOS[resultado] || resultado)}</h2>
      <p>${esc(explicacionDe(consulta))}</p>
    </div>

    <div class="tarjeta no-imprimir">
      <label for="obs-${esc(consulta.id)}">Observación del responsable de cumplimiento</label>
      <textarea id="obs-${esc(consulta.id)}" placeholder="Análisis del caso, contraste de documento y fecha de nacimiento, decisión adoptada y su sustento.">${esc(consulta.observaciones || '')}</textarea>
      <div class="acciones">
        <button type="button" class="accion" data-accion="certificado">Imprimir certificado</button>
        <button type="button" class="accion secundaria" data-accion="guardar-obs">Guardar observación</button>
      </div>
      <p class="tenue" style="margin-top:10px">
        Consulta registrada el ${esc(fechaHora(consulta.fecha))} · identificador
        <span class="mono">${esc(consulta.id)}</span>
      </p>
    </div>

    ${bloqueCoincidencias(consulta)}
    ${bloqueListas(consulta)}
  `;
}

function bloqueCoincidencias(consulta) {
  const coincidencias = consulta.coincidencias || [];
  if (!coincidencias.length) return '';

  return `
    <div class="tarjeta">
      <h2>${coincidencias.length} coincidencia(s)</h2>
      <p class="tenue">
        Ordenadas de mayor a menor similitud. Contrasta documento, fecha de nacimiento y
        nacionalidad antes de concluir que se trata de la misma persona.
      </p>
      ${coincidencias.map(tarjetaCoincidencia).join('')}
    </div>
  `;
}

function tarjetaCoincidencia(c) {
  const r = c.registro;
  const filas = [];

  if (c.motivo === 'documento') {
    filas.push(['Coincidió por', `Número de documento (${esc(c.coincide)})`]);
  } else if (c.coincide && c.coincide !== r.n) {
    filas.push(['Coincidió por', `Alias: ${esc(c.coincide)}`]);
  }
  filas.push(['Tipo', esc(TIPOS_REGISTRO[r.t] || '—')]);
  if (r.a?.length) filas.push(['Alias', esc(r.a.slice(0, 6).join(' · '))]);
  if (r.d?.length) {
    filas.push([
      'Documentos',
      r.d.slice(0, 6).map((d) => `${esc(d.t || 'Documento')}: ${esc(d.n)}${d.p ? ` (${esc(d.p)})` : ''}`).join('<br>'),
    ]);
  }
  if (r.fn?.length) filas.push(['Nacimiento', esc(r.fn.join(' · '))]);
  if (r.nc?.length) filas.push(['Nacionalidad', esc(r.nc.join(' · '))]);
  if (r.pg) filas.push(['Programa', esc(r.pg)]);
  if (r.fl) filas.push(['Fecha de listado', esc(fechaCorta(r.fl))]);
  if (r.ob) filas.push(['Observaciones de la fuente', esc(r.ob)]);
  filas.push(['Identificador en la lista', `<span class="mono">${esc(r.i)}</span>`]);

  return `
    <div class="coincidencia ${c.nivel}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <h3 style="margin:0">${esc(r.n)}</h3>
        <span class="etiqueta ${c.nivel}">
          ${c.motivo === 'documento' ? 'Documento exacto' : `Similitud ${esc(porcentaje(c.puntaje))}`}
        </span>
      </div>
      <p class="tenue" style="margin:.3em 0 0">${esc(c.lista.nombre)}</p>
      <dl>${filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    </div>
  `;
}

function bloqueListas(consulta) {
  return `
    <div class="tarjeta">
      <h2>Listas consultadas</h2>
      <p class="tenue">Versión exacta usada en esta consulta. Es lo que se cita en el certificado.</p>
      <div class="envoltura-tabla"><table>
        <thead><tr><th>Lista</th><th>Publicada</th><th>Registros</th><th>sha256</th></tr></thead>
        <tbody>
          ${(consulta.listas || [])
            .map(
              (l) => `<tr>
                <td>${esc(l.nombre)}</td>
                <td>${esc(fechaCorta(l.fechaPublicacion))}</td>
                <td class="numero">${(l.registros || 0).toLocaleString('es-CO')}</td>
                <td class="mono">${esc((l.sha256 || '').slice(0, 16))}…</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

export function conectarAcciones(contenedor, consulta) {
  const area = contenedor.querySelector('textarea');

  contenedor.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    if (boton.dataset.accion === 'guardar-obs' || boton.dataset.accion === 'certificado') {
      // La observación se guarda antes de imprimir para que salga en el
      // certificado: si no, el auditor ve el hallazgo sin el análisis.
      consulta.observaciones = area ? area.value.trim() : '';
      consulta.responsable = estado.config.responsable || consulta.responsable || '';
      await guardar(ALMACENES.consultas, consulta);
      registroCambio();
    }

    if (boton.dataset.accion === 'certificado') {
      abrirCertificado(consulta, estado.config);
    } else if (boton.dataset.accion === 'guardar-obs') {
      boton.textContent = 'Guardada';
      setTimeout(() => (boton.textContent = 'Guardar observación'), 2000);
    }
  });
}

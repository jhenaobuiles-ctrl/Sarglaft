// Expediente: historial completo de consultas, con filtros y respaldo.
//
// Todo esto vive únicamente en este navegador. Exportar no es una comodidad:
// es la única copia de seguridad que existe.

import { estado, alCambiarRegistro, registroCambio, aplicarPerfil } from './app.js';
import { todos, obtener, porIndice, ALMACENES } from '../registro/db.js';
import {
  construirRespaldo, leerRespaldo, restaurar, anotarCopia,
} from '../registro/respaldo.js';
import { escribirCSV } from '../lib/csv.js';
import { abrirCertificado } from './certificado.js';
import {
  formularioHTML as desenlaceHTML, conectar as conectarDesenlace,
  requiereDesenlace, chipHTML, estaCerrada, citadasEnDocumentos, alternarFila,
} from './desenlace.js';
import { esc, fechaHora, ROTULOS, porcentaje, descargar, marcaArchivo } from './formato.js';

let consultas = [];
// Cuántos adjuntos tiene cada consulta, para no ir a la base por cada fila.
let evidenciasPorConsulta = new Map();
// Consultas citadas por un formato de debida diligencia: también cierran la
// alerta, y sin esto el expediente las seguiría mostrando como pendientes
// mientras el resumen ya no las contaba.
let cerradasPorDocumento = new Set();

export function montarExpediente() {
  const contenedor = document.getElementById('tabla-expediente');

  for (const id of ['f-texto', 'f-resultado', 'f-desde', 'f-hasta']) {
    const campo = document.getElementById(id);
    campo.addEventListener('input', pintar);
    campo.addEventListener('change', pintar);
  }

  document.getElementById('exportar-csv').addEventListener('click', exportarCSV);
  document.getElementById('exportar-zip').addEventListener('click', exportarZIP);
  document.getElementById('importar-copia').addEventListener('click', importarCopia);

  contenedor.addEventListener('click', async (evento) => {
    const verEvidencias = evento.target.closest('button[data-evidencias]');
    if (verEvidencias) {
      await mostrarEvidencias(verEvidencias);
      return;
    }
    const analizar = evento.target.closest('button[data-analizar]');
    if (analizar) {
      await mostrarDesenlace(analizar);
      return;
    }
    const boton = evento.target.closest('button[data-certificado]');
    if (!boton) return;
    const consulta = await obtener(ALMACENES.consultas, boton.dataset.certificado);
    if (!consulta) return;
    // Las filas de un cruce no repiten las listas: se toman del cruce.
    if (!consulta.listas?.length && consulta.cruceId) {
      const cruce = await obtener(ALMACENES.cruces, consulta.cruceId);
      if (cruce) consulta.listas = cruce.listas;
    }
    abrirCertificado(consulta, estado.config);
  });

  recargar();
  alCambiarRegistro(recargar);
}

async function recargar() {
  consultas = await todos(ALMACENES.consultas);
  consultas.sort((a, b) => b.fecha.localeCompare(a.fecha));

  evidenciasPorConsulta = new Map();
  for (const evidencia of await todos(ALMACENES.evidencias)) {
    const previas = evidenciasPorConsulta.get(evidencia.consultaId) || 0;
    evidenciasPorConsulta.set(evidencia.consultaId, previas + 1);
  }
  cerradasPorDocumento = citadasEnDocumentos(await todos(ALMACENES.documentos));
  pintar();
}

/**
 * Despliega los archivos adjuntos de una consulta con enlace de descarga.
 *
 * Sin esto la evidencia era de solo escritura: se adjuntaba el certificado de
 * la Procuraduría y no había forma de volver a sacarlo, que es justamente
 * para lo que se adjunta.
 */
async function mostrarEvidencias(boton) {
  const idConsulta = boton.dataset.evidencias;
  const contenedor = boton.closest('td');
  const abierto = contenedor.querySelector('.lista-evidencias');
  if (abierto) {
    abierto.remove();
    boton.textContent = boton.dataset.rotulo;
    return;
  }

  const evidencias = await porIndice(ALMACENES.evidencias, 'consultaId', idConsulta);
  const caja = document.createElement('div');
  caja.className = 'lista-evidencias';
  caja.innerHTML = evidencias.length
    ? evidencias
        .map(
          (e) => `<div class="evidencia-fila">
            <button type="button" class="enlace-evidencia" data-descargar="${esc(e.id)}">${esc(e.nombreArchivo)}</button>
            <span class="tenue">${(e.bytes / 1024).toFixed(0)} KB · ${esc(fechaHora(e.fecha))}</span>
          </div>`,
        )
        .join('')
    : '<p class="tenue">Sin archivos adjuntos.</p>';

  caja.addEventListener('click', async (evento) => {
    const enlace = evento.target.closest('button[data-descargar]');
    if (!enlace) return;
    const evidencia = evidencias.find((e) => e.id === enlace.dataset.descargar);
    if (!evidencia) return;
    // El archivo se guardó como Blob; se devuelve tal cual quedó.
    descargar(evidencia.nombreArchivo, evidencia.archivo, evidencia.tipoArchivo);
  });

  contenedor.appendChild(caja);
  boton.textContent = 'Ocultar';
}

async function mostrarDesenlace(boton) {
  await alternarFila(boton, {
    responsable: estado.config.responsable || '',
    // Al guardar se repinta todo: la fila pasa a mostrar el desenlace y el
    // resumen deja de contar esta alerta como pendiente.
    alGuardar: () => registroCambio(),
  });
}

function filtradas() {
  const texto = document.getElementById('f-texto').value.trim().toLowerCase();
  const resultado = document.getElementById('f-resultado').value;
  const desde = document.getElementById('f-desde').value;
  const hasta = document.getElementById('f-hasta').value;

  return consultas.filter((c) => {
    // "Pendientes de decidir" no es un veredicto sino lo que queda por hacer:
    // es el filtro con el que se trabaja después de un cruce masivo.
    if (resultado === 'SIN_DECIDIR') {
      if (estaCerrada(c, cerradasPorDocumento)) return false;
    } else if (resultado && c.resultado !== resultado) {
      return false;
    }
    const dia = (c.fecha || '').slice(0, 10);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (texto) {
      const aguja = `${c.consulta?.nombre || ''} ${c.consulta?.documento || ''}`.toLowerCase();
      if (!aguja.includes(texto)) return false;
    }
    return true;
  });
}

function pintar() {
  const lista = filtradas();
  const contenedor = document.getElementById('tabla-expediente');

  if (!consultas.length) {
    contenedor.innerHTML = '<p class="vacio">El expediente está vacío.</p>';
    return;
  }
  if (!lista.length) {
    contenedor.innerHTML = '<p class="vacio">Ninguna consulta coincide con los filtros.</p>';
    return;
  }

  // Con miles de filas de un cruce, pintarlas todas congela la página.
  const TOPE = 300;
  const visibles = lista.slice(0, TOPE);

  contenedor.innerHTML = `
    <p class="tenue">${lista.length.toLocaleString('es-CO')} consulta(s)${
      lista.length > TOPE ? ` · se muestran las ${TOPE} más recientes; exporta a CSV para verlas todas` : ''
    }</p>
    <div class="envoltura-tabla"><table>
      <thead><tr><th>Fecha</th><th>Contraparte</th><th>Documento</th><th>Origen</th><th>Resultado</th><th>Coincidencias</th><th></th></tr></thead>
      <tbody>${visibles
        .map(
          (c) => `<tr>
            <td class="numero">${esc(fechaHora(c.fecha))}</td>
            <td>${esc(c.consulta?.nombre) || '—'}</td>
            <td class="numero">${esc(c.consulta?.documento) || '—'}</td>
            <td>${origen(c)}</td>
            <td>
              <span class="etiqueta ${c.resultado}">${esc(ROTULOS[c.resultado] || c.resultado)}</span>
              ${desenlaceHTMLFila(c)}
            </td>
            <td>${resumenCoincidencias(c)}</td>
            <td class="acciones-fila">
              <button type="button" class="accion secundaria no-imprimir" data-certificado="${esc(c.id)}">Certificado</button>
              ${analisisHTML(c)}
              ${adjuntosHTML(c)}
            </td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
  `;
}

/** El desenlace bajo el veredicto, o el aviso de que falta decidirlo. */
function desenlaceHTMLFila(c) {
  if (!requiereDesenlace(c)) return '';
  if (!c.decision?.desenlace && cerradasPorDocumento.has(c.id)) {
    return '<br><span class="tenue">Analizada en un formato de debida diligencia</span>';
  }
  return `<br>${chipHTML(c)}`;
}

function adjuntosHTML(c) {
  const cuantas = evidenciasPorConsulta.get(c.id) || 0;
  if (!cuantas) return '';
  const rotulo = `Evidencias (${cuantas})`;
  return `<button type="button" class="accion secundaria no-imprimir" data-evidencias="${esc(c.id)}" data-rotulo="${esc(rotulo)}">${esc(rotulo)}</button>`;
}

function analisisHTML(c) {
  if (!requiereDesenlace(c)) return '';
  const rotulo = estaCerrada(c, cerradasPorDocumento) ? 'Ver decisión' : 'Analizar';
  const urgente = estaCerrada(c, cerradasPorDocumento) ? 'secundaria' : '';
  return `<button type="button" class="accion ${urgente} no-imprimir" data-analizar="${esc(c.id)}" data-rotulo="${rotulo}">${rotulo}</button>`;
}

function origen(c) {
  if (c.tipo === 'cruce') return 'Cruce masivo';
  if (c.tipo === 'antecedentes') return 'Antecedentes Colombia';
  return 'Consulta puntual';
}

function resumenCoincidencias(c) {
  if (c.tipo === 'antecedentes') {
    const conHallazgo = (c.revisiones || []).filter((r) => r.resultado === 'ALERTA').length;
    return conHallazgo
      ? `${conHallazgo} entidad(es) con hallazgos`
      : `${(c.revisiones || []).length} entidad(es) consultadas`;
  }
  const mejor = c.coincidencias?.[0];
  if (!mejor) return '—';
  return `${esc(mejor.registro.n)}<br><span class="tenue">${
    mejor.motivo === 'documento' ? 'documento exacto' : `similitud ${esc(porcentaje(mejor.puntaje))}`
  } · ${esc(mejor.lista.nombre)}</span>`;
}

/* ---------- exportar e importar ---------- */

function exportarCSV() {
  const lista = filtradas();
  const filas = [
    ['Fecha', 'Contraparte', 'Tipo documento', 'Documento', 'Tipo contraparte', 'Condición PEP', 'Origen', 'Resultado', 'Desenlace', 'Sustento de la decisión', 'Fecha de la decisión', 'Coincidencias', 'Mejor coincidencia', 'Lista', 'Similitud', 'Responsable', 'Observaciones', 'Identificador'],
    ...lista.map((c) => {
      const m = c.coincidencias?.[0];
      return [
        fechaHora(c.fecha),
        c.consulta?.nombre || '',
        c.consulta?.tipoDocumento || '',
        c.consulta?.documento || '',
        c.vinculo || '',
        c.pepDetalle || '',
        origen(c),
        ROTULOS[c.resultado] || c.resultado,
        etiquetaDesenlace(c.decision?.desenlace),
        c.decision?.sustento || '',
        c.decision?.fecha ? fechaHora(c.decision.fecha) : '',
        c.coincidencias?.length || 0,
        m ? m.registro.n : '',
        m ? m.lista.nombre : '',
        m ? (m.motivo === 'documento' ? 'exacta' : porcentaje(m.puntaje)) : '',
        c.responsable || '',
        c.observaciones || '',
        c.id,
      ];
    }),
  ];
  // Punto y coma: es lo que espera Excel en configuración regional española.
  descargar(`expediente-sarlaft-${marcaArchivo()}.csv`, escribirCSV(filas, ';'), 'text/csv;charset=utf-8');
}

async function exportarZIP() {
  const boton = document.getElementById('exportar-zip');
  const rotulo = boton.textContent;
  boton.disabled = true;

  try {
    const copia = await construirRespaldo(estado.config, (hecho, total) => {
      boton.textContent = `Empaquetando evidencia ${hecho} de ${total}…`;
    });
    boton.textContent = 'Descargando…';
    descargar(copia.nombre, copia.blob, 'application/zip');
    await anotarCopia(copia.nombre);
    registroCambio();
    alert(
      `Copia creada: ${copia.nombre}\n\n` +
        `${copia.consultas} consulta(s), ${copia.documentos} documento(s) y ` +
        `${copia.evidencias} archivo(s) de evidencia.\n\n` +
        'Guárdala fuera de este equipo. Contiene datos personales: no la subas a una carpeta ' +
        'compartida abierta.',
    );
  } catch (error) {
    alert(`No se pudo crear la copia: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = rotulo;
  }
}

function importarCopia() {
  const entrada = document.createElement('input');
  entrada.type = 'file';
  // Se siguen aceptando los .json que exportaban las versiones anteriores: una
  // copia vieja tiene que poder restaurarse.
  entrada.accept = '.zip,.json,application/zip,application/json';
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    try {
      const copia = await leerRespaldo(archivo);
      const cuantas = (copia.contenido.consultas || []).length;
      const conArchivo = copia.evidencias.filter((e) => e.archivo).length;
      if (
        !confirm(
          `La copia trae ${cuantas} consulta(s), ` +
            `${(copia.contenido.documentos || []).length} documento(s) y ` +
            `${conArchivo} evidencia(s).\n\n` +
            'Se añadirán a lo que ya existe; lo que tenga el mismo identificador se ' +
            'sobrescribe. ¿Continuar?',
        )
      ) {
        return;
      }
      const conteos = await restaurar(copia, estado.config);
      if (conteos.perfil) aplicarPerfil(conteos.perfil);
      // Avisar a las demás vistas: sin esto el expediente se actualiza pero
      // los indicadores del resumen se quedan en cero y parece que la
      // restauración no funcionó.
      registroCambio();
      alert(
        `Copia restaurada: ${conteos.consultas} consulta(s), ${conteos.documentos} documento(s) ` +
          `y ${conteos.evidencias} evidencia(s).` +
          (conteos.evidenciasSinArchivo
            ? `\n\n${conteos.evidenciasSinArchivo} evidencia(s) venían sin su archivo ` +
              '(la copia era un .json antiguo, que no los incluía).'
            : ''),
      );
    } catch (error) {
      alert(`No se pudo restaurar: ${error.message}`);
    }
  });
  entrada.click();
}

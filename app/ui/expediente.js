// Expediente: historial completo de consultas, con filtros y respaldo.
//
// Todo esto vive únicamente en este navegador. Exportar no es una comodidad:
// es la única copia de seguridad que existe.

import { estado, alCambiarRegistro, registroCambio } from './app.js';
import { todos, obtener, guardarVarios, porIndice, ALMACENES } from '../registro/db.js';
import { escribirCSV } from '../lib/csv.js';
import { abrirCertificado } from './certificado.js';
import { esc, fechaHora, ROTULOS, porcentaje, descargar, marcaArchivo } from './formato.js';

let consultas = [];
// Cuántos adjuntos tiene cada consulta, para no ir a la base por cada fila.
let evidenciasPorConsulta = new Map();

export function montarExpediente() {
  const contenedor = document.getElementById('tabla-expediente');

  for (const id of ['f-texto', 'f-resultado', 'f-desde', 'f-hasta']) {
    const campo = document.getElementById(id);
    campo.addEventListener('input', pintar);
    campo.addEventListener('change', pintar);
  }

  document.getElementById('exportar-csv').addEventListener('click', exportarCSV);
  document.getElementById('exportar-json').addEventListener('click', exportarJSON);
  document.getElementById('importar-json').addEventListener('click', importarJSON);

  contenedor.addEventListener('click', async (evento) => {
    const verEvidencias = evento.target.closest('button[data-evidencias]');
    if (verEvidencias) {
      await mostrarEvidencias(verEvidencias);
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

function filtradas() {
  const texto = document.getElementById('f-texto').value.trim().toLowerCase();
  const resultado = document.getElementById('f-resultado').value;
  const desde = document.getElementById('f-desde').value;
  const hasta = document.getElementById('f-hasta').value;

  return consultas.filter((c) => {
    if (resultado && c.resultado !== resultado) return false;
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
            <td><span class="etiqueta ${c.resultado}">${esc(ROTULOS[c.resultado] || c.resultado)}</span></td>
            <td>${resumenCoincidencias(c)}</td>
            <td class="acciones-fila">
              <button type="button" class="accion secundaria no-imprimir" data-certificado="${esc(c.id)}">Certificado</button>
              ${adjuntosHTML(c)}
            </td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
  `;
}

function adjuntosHTML(c) {
  const cuantas = evidenciasPorConsulta.get(c.id) || 0;
  if (!cuantas) return '';
  const rotulo = `Evidencias (${cuantas})`;
  return `<button type="button" class="accion secundaria no-imprimir" data-evidencias="${esc(c.id)}" data-rotulo="${esc(rotulo)}">${esc(rotulo)}</button>`;
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
    ['Fecha', 'Contraparte', 'Tipo documento', 'Documento', 'Tipo contraparte', 'Condición PEP', 'Origen', 'Resultado', 'Coincidencias', 'Mejor coincidencia', 'Lista', 'Similitud', 'Responsable', 'Observaciones', 'Identificador'],
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

async function exportarJSON() {
  const [listaConsultas, cruces, obligaciones] = await Promise.all([
    todos(ALMACENES.consultas),
    todos(ALMACENES.cruces),
    todos(ALMACENES.obligaciones),
  ]);
  // Las evidencias son archivos binarios y no caben en JSON; se avisa en vez
  // de dejar creer que la copia lo incluye todo.
  const evidencias = await todos(ALMACENES.evidencias);
  const respaldo = {
    formato: 'sarglaft-respaldo',
    version: 1,
    generado: new Date().toISOString(),
    perfil: estado.config,
    consultas: listaConsultas,
    cruces,
    obligaciones,
    evidenciasNoIncluidas: evidencias.length,
  };
  descargar(
    `respaldo-sarlaft-${marcaArchivo()}.json`,
    JSON.stringify(respaldo, null, 2),
    'application/json;charset=utf-8',
  );
  if (evidencias.length) {
    alert(
      `La copia incluye ${listaConsultas.length} consultas.\n\n` +
        `Los ${evidencias.length} archivo(s) de evidencia adjuntos NO van dentro del JSON: son ` +
        'archivos binarios.\n\nPara guardarlos, ábrelos desde el botón "Evidencias" de cada ' +
        'consulta en esta misma tabla y descárgalos a una carpeta junto a la copia.',
    );
  }
}

function importarJSON() {
  const entrada = document.createElement('input');
  entrada.type = 'file';
  entrada.accept = '.json,application/json';
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    try {
      const respaldo = JSON.parse(await archivo.text());
      if (respaldo.formato !== 'sarglaft-respaldo') {
        throw new Error('El archivo no es una copia de seguridad de este panel.');
      }
      const cuantas = (respaldo.consultas || []).length;
      if (
        !confirm(
          `La copia trae ${cuantas} consulta(s).\n\n` +
            'Se añadirán a las que ya existen; las que tengan el mismo identificador se ' +
            'sobrescriben. ¿Continuar?',
        )
      ) {
        return;
      }
      await guardarVarios(ALMACENES.consultas, respaldo.consultas || []);
      await guardarVarios(ALMACENES.cruces, respaldo.cruces || []);
      await guardarVarios(ALMACENES.obligaciones, respaldo.obligaciones || []);
      // Avisar a las demás vistas: sin esto el expediente se actualiza pero
      // los indicadores del resumen se quedan en cero y parece que la
      // restauración no funcionó.
      registroCambio();
      alert(`Copia restaurada: ${cuantas} consulta(s).`);
    } catch (error) {
      alert(`No se pudo restaurar: ${error.message}`);
    }
  });
  entrada.click();
}

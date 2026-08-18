// Expediente: historial completo de consultas, con filtros y respaldo.
//
// Todo esto vive únicamente en este navegador. Exportar no es una comodidad:
// es la única copia de seguridad que existe.

import { estado, alCambiarRegistro } from './app.js';
import { todos, obtener, guardarVarios, ALMACENES } from '../registro/db.js';
import { escribirCSV } from '../lib/csv.js';
import { abrirCertificado } from './certificado.js';
import { esc, fechaHora, ROTULOS, porcentaje, descargar, marcaArchivo } from './formato.js';

let consultas = [];

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
  pintar();
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
            <td><button type="button" class="accion secundaria no-imprimir" style="font-size:.75rem;padding:4px 10px" data-certificado="${esc(c.id)}">Certificado</button></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
  `;
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
    ['Fecha', 'Contraparte', 'Tipo documento', 'Documento', 'Tipo contraparte', 'Origen', 'Resultado', 'Coincidencias', 'Mejor coincidencia', 'Lista', 'Similitud', 'Responsable', 'Observaciones', 'Identificador'],
    ...lista.map((c) => {
      const m = c.coincidencias?.[0];
      return [
        fechaHora(c.fecha),
        c.consulta?.nombre || '',
        c.consulta?.tipoDocumento || '',
        c.consulta?.documento || '',
        c.vinculo || '',
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
        `Los ${evidencias.length} archivo(s) de evidencia adjuntos NO se incluyen: son archivos ` +
        'binarios. Guárdalos aparte desde la carpeta donde los descargaste.',
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
      await recargar();
      alert('Copia restaurada.');
    } catch (error) {
      alert(`No se pudo restaurar: ${error.message}`);
    }
  });
  entrada.click();
}

// Documentos del sistema: los formatos que hay que tener diligenciados.
//
// El panel resolvía la parte de consulta —¿está esta persona en una lista?—
// pero la carpeta que revisa una visita es más ancha: el manual, la matriz de
// riesgo, la declaración PEP firmada, el acta de la capacitación. Eso vivía
// en archivos sueltos de Word y no en ninguna parte comprobable.
//
// Aquí cada formato se diligencia, se guarda con fecha e identificador y se
// imprime. Los que corresponden a una obligación periódica la marcan cumplida
// al guardarse: el acta de capacitación es la prueba de la capacitación.

import { estado, registroCambio, alCambiarRegistro } from './app.js';
import { todos, obtener, guardar, borrar, ALMACENES, nuevoId } from '../registro/db.js';
import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';
import { PLANTILLAS, POR_ID, GRUPOS, valoresIniciales, faltantes } from '../documentos/plantillas.js';
import { documentoHTML } from '../documentos/impreso.js';
import { imprimirHoja } from './certificado.js';
import { marcarCumplida } from './obligaciones.js';
import { esc, fechaHora } from './formato.js';

let documentos = [];
// El documento abierto en el editor, o null si se está viendo el catálogo.
let enEdicion = null;

export function montarDocumentos() {
  document.getElementById('catalogo-documentos').addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-crear]');
    if (boton) crear(boton.dataset.crear);
  });

  document.getElementById('lista-documentos').addEventListener('click', alPulsarLista);
  document.getElementById('f-plantilla').addEventListener('change', pintarLista);

  pintarCatalogo();
  recargar();
  // Restaurar una copia trae documentos: la lista tiene que enterarse.
  alCambiarRegistro(recargar);
}

async function recargar() {
  documentos = await todos(ALMACENES.documentos);
  documentos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  pintarLista();
}

/* ---------- catálogo ---------- */

function pintarCatalogo() {
  const destino = document.getElementById('catalogo-documentos');
  destino.innerHTML = Object.entries(GRUPOS)
    .map(([clave, titulo]) => {
      const plantillas = PLANTILLAS.filter((p) => p.grupo === clave);
      return `<div class="tarjeta">
        <h2>${esc(titulo)}</h2>
        <div class="rejilla-plantillas">
          ${plantillas
            .map(
              (p) => `<div class="plantilla">
                <h3>${esc(p.nombre)}</h3>
                <p class="tenue">${esc(p.descripcion)}</p>
                <button type="button" class="accion secundaria" data-crear="${esc(p.id)}">Diligenciar</button>
              </div>`,
            )
            .join('')}
        </div>
      </div>`;
    })
    .join('');

  document.getElementById('f-plantilla').innerHTML =
    '<option value="">Todos los formatos</option>' +
    PLANTILLAS.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
}

/* ---------- editor ---------- */

async function crear(idPlantilla) {
  const plantilla = POR_ID.get(idPlantilla);
  if (!plantilla) return;

  const valores = valoresIniciales(plantilla);
  await rellenarCalculados(plantilla, valores);

  abrirEditor({
    id: nuevoId('d'),
    plantilla: plantilla.id,
    fecha: new Date().toISOString(),
    valores,
    observaciones: '',
    responsable: estado.config.responsable || '',
    nuevo: true,
  });
}

/**
 * Cifras que el panel ya conoce y que no tiene sentido volver a contar a mano.
 * Se proponen como valor inicial y se pueden corregir antes de firmar.
 */
async function rellenarCalculados(plantilla, valores) {
  const necesita = [...plantilla.secciones.flatMap((s) => s.campos)].some((c) => c.calculado);
  if (!necesita) return;

  const consultas = await todos(ALMACENES.consultas);
  const cruces = await todos(ALMACENES.cruces);
  const cuentas = {
    consultas: consultas.length,
    alertas: consultas.filter((c) => c.resultado === 'ALERTA').length,
    revision: consultas.filter((c) => c.resultado === 'EN_REVISION').length,
    pep: consultas.filter((c) => c.pep).length,
    cruces: cruces.length,
  };
  for (const seccion of plantilla.secciones) {
    for (const campo of seccion.campos) {
      if (campo.calculado && cuentas[campo.calculado] !== undefined) {
        valores[campo.id] = String(cuentas[campo.calculado]);
      }
    }
  }
}

function abrirEditor(documento) {
  enEdicion = documento;
  const plantilla = POR_ID.get(documento.plantilla);
  const destino = document.getElementById('editor-documento');

  destino.innerHTML = `
    <div class="tarjeta editor-documento">
      <div class="encabezado-editor">
        <div>
          <h2>${esc(plantilla.nombre)}</h2>
          <p class="tenue">${esc(plantilla.descripcion)}</p>
        </div>
        <button type="button" class="accion secundaria no-imprimir" data-editor="cerrar">Cerrar</button>
      </div>
      ${plantilla.nota ? `<div class="aviso info">${esc(plantilla.nota)}</div>` : ''}
      <form id="formulario-documento">
        ${plantilla.secciones.map(seccionFormulario).join('')}
        <div>
          <label for="doc-observaciones">Observaciones</label>
          <textarea id="doc-observaciones">${esc(documento.observaciones || '')}</textarea>
        </div>
        <div class="acciones">
          <button type="button" class="accion" data-editor="guardar">Guardar</button>
          <button type="button" class="accion secundaria" data-editor="imprimir">Guardar e imprimir</button>
        </div>
        <p class="tenue" id="aviso-documento"></p>
      </form>
    </div>
  `;

  aplicarValores(plantilla, documento.valores);
  destino.querySelector('.editor-documento').addEventListener('click', alPulsarEditor);
  destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function seccionFormulario(seccion) {
  return `<fieldset class="seccion-documento">
    <legend>${esc(seccion.titulo)}</legend>
    ${seccion.nota ? `<p class="tenue">${esc(seccion.nota)}</p>` : ''}
    <div class="campos">
      ${seccion.campos.map(campoHTML).join('')}
    </div>
  </fieldset>`;
}

function campoHTML(campo) {
  const id = `doc-${campo.id}`;
  const ancho = campo.ancho === 'completo' || campo.tipo === 'tabla' ? 'grid-column: 1 / -1' : '';
  const etiqueta = `<label for="${esc(id)}">${esc(campo.etiqueta)}${
    campo.requerido ? ' <span class="requerido">*</span>' : ''
  }</label>`;
  const ayuda = campo.ayuda ? `<p class="tenue" style="margin:.3em 0 0">${esc(campo.ayuda)}</p>` : '';

  let control;
  switch (campo.tipo) {
    case 'area':
      control = `<textarea id="${esc(id)}" data-campo="${esc(campo.id)}" rows="${campo.alto || 3}"></textarea>`;
      break;
    case 'fecha':
      control = `<input type="date" id="${esc(id)}" data-campo="${esc(campo.id)}">`;
      break;
    case 'numero':
      control = `<input type="text" inputmode="numeric" id="${esc(id)}" data-campo="${esc(campo.id)}">`;
      break;
    case 'select':
      control = `<select id="${esc(id)}" data-campo="${esc(campo.id)}">
        <option value=""></option>
        ${campo.opciones.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
      </select>`;
      break;
    case 'si_no':
      control = `<select id="${esc(id)}" data-campo="${esc(campo.id)}">
        <option value=""></option><option value="Sí">Sí</option><option value="No">No</option>
      </select>`;
      break;
    case 'casillas':
      control = `<div class="grupo-casillas" data-campo="${esc(campo.id)}" data-tipo="casillas">
        ${campo.opciones
          .map(
            (o, i) => `<label class="casilla"><input type="checkbox" id="${esc(id)}-${i}" value="${esc(o)}"> ${esc(o)}</label>`,
          )
          .join('')}
      </div>`;
      break;
    case 'tabla':
      control = tablaFormulario(campo, id);
      break;
    default:
      control = `<input type="text" id="${esc(id)}" data-campo="${esc(campo.id)}" autocomplete="off">`;
  }
  return `<div style="${ancho}">${etiqueta}${control}${ayuda}</div>`;
}

function tablaFormulario(campo, id) {
  const filas = campo.filas || 3;
  return `<div class="envoltura-tabla"><table class="tabla-editable" data-campo="${esc(campo.id)}" data-tipo="tabla" id="${esc(id)}">
    <thead><tr>${campo.columnas.map((c) => `<th>${esc(c.etiqueta)}</th>`).join('')}</tr></thead>
    <tbody>
      ${Array.from(
        { length: filas },
        () => `<tr>${campo.columnas
          .map((c) => `<td><input type="text" data-columna="${esc(c.id)}" autocomplete="off"></td>`)
          .join('')}</tr>`,
      ).join('')}
    </tbody>
  </table>
  <div class="acciones"><button type="button" class="accion secundaria" data-fila="${esc(campo.id)}">Añadir fila</button></div>
  </div>`;
}

function aplicarValores(plantilla, valores) {
  for (const seccion of plantilla.secciones) {
    for (const campo of seccion.campos) {
      const valor = valores[campo.id];
      if (campo.tipo === 'casillas') {
        const grupo = document.querySelector(`.grupo-casillas[data-campo="${campo.id}"]`);
        if (!grupo) continue;
        const marcadas = new Set(Array.isArray(valor) ? valor : []);
        for (const casilla of grupo.querySelectorAll('input')) {
          casilla.checked = marcadas.has(casilla.value);
        }
      } else if (campo.tipo === 'tabla') {
        aplicarTabla(campo, Array.isArray(valor) ? valor : []);
      } else {
        const control = document.querySelector(`[data-campo="${campo.id}"]`);
        if (control) control.value = valor ?? '';
      }
    }
  }
}

function aplicarTabla(campo, filas) {
  const tabla = document.querySelector(`.tabla-editable[data-campo="${campo.id}"]`);
  if (!tabla) return;
  const cuerpo = tabla.querySelector('tbody');
  while (cuerpo.rows.length < filas.length) cuerpo.appendChild(nuevaFila(campo));
  for (let i = 0; i < filas.length; i++) {
    for (const celda of cuerpo.rows[i].querySelectorAll('input')) {
      celda.value = filas[i][celda.dataset.columna] || '';
    }
  }
}

function nuevaFila(campo) {
  const fila = document.createElement('tr');
  fila.innerHTML = campo.columnas
    .map((c) => `<td><input type="text" data-columna="${esc(c.id)}" autocomplete="off"></td>`)
    .join('');
  return fila;
}

function leerValores(plantilla) {
  const valores = {};
  for (const seccion of plantilla.secciones) {
    for (const campo of seccion.campos) {
      if (campo.tipo === 'casillas') {
        const grupo = document.querySelector(`.grupo-casillas[data-campo="${campo.id}"]`);
        valores[campo.id] = grupo
          ? [...grupo.querySelectorAll('input:checked')].map((c) => c.value)
          : [];
      } else if (campo.tipo === 'tabla') {
        const tabla = document.querySelector(`.tabla-editable[data-campo="${campo.id}"]`);
        const filas = [];
        for (const fila of tabla?.querySelectorAll('tbody tr') || []) {
          const datos = {};
          let algo = false;
          for (const celda of fila.querySelectorAll('input')) {
            datos[celda.dataset.columna] = celda.value.trim();
            if (celda.value.trim()) algo = true;
          }
          // Las filas en blanco no se guardan: al imprimir se vuelven a
          // dibujar vacías para llenarlas a mano.
          if (algo) filas.push(datos);
        }
        valores[campo.id] = filas;
      } else {
        const control = document.querySelector(`[data-campo="${campo.id}"]`);
        valores[campo.id] = control ? control.value.trim() : '';
      }
    }
  }
  return valores;
}

async function alPulsarEditor(evento) {
  const fila = evento.target.closest('button[data-fila]');
  if (fila) {
    const plantillaActual = POR_ID.get(enEdicion.plantilla);
    const campo = plantillaActual.secciones
      .flatMap((seccion) => seccion.campos)
      .find((c) => c.id === fila.dataset.fila && c.tipo === 'tabla');
    const tabla = document.querySelector(`.tabla-editable[data-campo="${fila.dataset.fila}"]`);
    if (campo && tabla) tabla.querySelector('tbody').appendChild(nuevaFila(campo));
    return;
  }

  const boton = evento.target.closest('button[data-editor]');
  if (!boton) return;

  if (boton.dataset.editor === 'cerrar') {
    enEdicion = null;
    document.getElementById('editor-documento').innerHTML = '';
    return;
  }

  const guardado = await guardarEdicion();
  if (boton.dataset.editor === 'imprimir') {
    const plantilla = POR_ID.get(guardado.plantilla);
    const pendientes = faltantes(plantilla, guardado.valores);
    if (
      pendientes.length &&
      !confirm(
        `Faltan por diligenciar: ${pendientes.join(', ')}.\n\n¿Imprimir de todos modos?`,
      )
    ) {
      return;
    }
    imprimirHoja(documentoHTML(guardado, plantilla, estado.config));
  }
}

async function guardarEdicion() {
  const plantilla = POR_ID.get(enEdicion.plantilla);
  const valores = leerValores(plantilla);

  const documento = {
    id: enEdicion.id,
    plantilla: plantilla.id,
    nombrePlantilla: plantilla.nombre,
    fecha: enEdicion.fecha,
    actualizado: new Date().toISOString(),
    valores,
    observaciones: document.getElementById('doc-observaciones').value.trim(),
    responsable: estado.config.responsable || '',
    // Se guardan normalizados para poder reunir después todos los papeles de
    // una misma contraparte, escrita como se haya escrito.
    nombreNormalizado: normalizarNombre(valores.nombre || ''),
    documentoNormalizado: normalizarDocumento(valores.documento || ''),
  };

  await guardar(ALMACENES.documentos, documento);
  // Firmar el acta de capacitación es lo que prueba la capacitación: la
  // obligación se marca sola, como ya ocurre con el cruce masivo.
  if (plantilla.obligacion) await marcarCumplida(plantilla.obligacion, documento.actualizado);

  enEdicion = { ...enEdicion, ...documento, nuevo: false };
  // `registroCambio` recarga esta lista y, de paso, los indicadores del
  // resumen y el estado de las obligaciones.
  registroCambio();

  const aviso = document.getElementById('aviso-documento');
  if (aviso) {
    const pendientes = faltantes(plantilla, valores);
    aviso.textContent = pendientes.length
      ? `Guardado. Quedan sin diligenciar: ${pendientes.join(', ')}.`
      : `Guardado el ${fechaHora(documento.actualizado)}.`;
  }
  return documento;
}

/* ---------- lista de documentos diligenciados ---------- */

function pintarLista() {
  const filtro = document.getElementById('f-plantilla').value;
  const destino = document.getElementById('lista-documentos');
  const lista = filtro ? documentos.filter((d) => d.plantilla === filtro) : documentos;

  if (!documentos.length) {
    destino.innerHTML =
      '<p class="vacio">Todavía no hay documentos diligenciados. Empieza por el manual y la matriz de riesgo.</p>';
    return;
  }
  if (!lista.length) {
    destino.innerHTML = '<p class="vacio">No hay documentos de ese formato.</p>';
    return;
  }

  destino.innerHTML = `<div class="envoltura-tabla"><table>
    <thead><tr><th>Formato</th><th>Contraparte o asunto</th><th>Actualizado</th><th></th></tr></thead>
    <tbody>${lista
      .map(
        (d) => `<tr>
          <td>${esc(d.nombrePlantilla || d.plantilla)}</td>
          <td>${esc(asunto(d))}</td>
          <td class="numero">${esc(fechaHora(d.actualizado || d.fecha))}</td>
          <td class="acciones-fila">
            <button type="button" class="accion secundaria no-imprimir" data-abrir="${esc(d.id)}">Abrir</button>
            <button type="button" class="accion secundaria no-imprimir" data-imprimir="${esc(d.id)}">Imprimir</button>
            <button type="button" class="accion secundaria no-imprimir" data-eliminar="${esc(d.id)}">Eliminar</button>
          </td>
        </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

/** Qué identifica al documento en la lista, según lo que tenga diligenciado. */
function asunto(documento) {
  const v = documento.valores || {};
  if (v.nombre) return v.documento ? `${v.nombre} · ${v.documento}` : v.nombre;
  if (v.desde || v.hasta) return `Período ${v.desde || '…'} a ${v.hasta || '…'}`;
  if (v.version) return `Versión ${v.version}`;
  if (v.fechaSesion) return `Sesión del ${v.fechaSesion}`;
  return '—';
}

async function alPulsarLista(evento) {
  const abrir = evento.target.closest('button[data-abrir]');
  if (abrir) {
    const documento = await obtener(ALMACENES.documentos, abrir.dataset.abrir);
    if (documento) abrirEditor(documento);
    return;
  }

  const imprimir = evento.target.closest('button[data-imprimir]');
  if (imprimir) {
    const documento = await obtener(ALMACENES.documentos, imprimir.dataset.imprimir);
    const plantilla = documento && POR_ID.get(documento.plantilla);
    if (plantilla) imprimirHoja(documentoHTML(documento, plantilla, estado.config));
    return;
  }

  const eliminar = evento.target.closest('button[data-eliminar]');
  if (eliminar) {
    if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
    await borrar(ALMACENES.documentos, eliminar.dataset.eliminar);
    if (enEdicion?.id === eliminar.dataset.eliminar) {
      enEdicion = null;
      document.getElementById('editor-documento').innerHTML = '';
    }
    registroCambio();
  }
}

// Cruce masivo: verifica de una vez todas las contrapartes y cubre la
// obligación mensual.
//
// El proceso corre en el hilo principal, cediendo el control cada pocas filas
// para que la barra de progreso avance. Estaba previsto usar un Web Worker,
// pero medido contra los datos reales el motor resuelve mil consultas en unos
// 40 ms: mover el índice a otro hilo costaría más (clonar decenas de MB) de
// lo que ahorraría.

import { estado, registroCambio } from './app.js';
import { guardar, guardarVarios, ALMACENES, nuevoId } from '../registro/db.js';
import { leerCSV, detectarSeparador, filasAObjetos, escribirCSV } from '../lib/csv.js';
import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';
import { marcarCumplida } from './obligaciones.js';
import { esc, ROTULOS, porcentaje, descargar, marcaArchivo, fechaHora } from './formato.js';

const FILAS_POR_TANDA = 200;

// Encabezados que se suelen encontrar en los archivos de contrapartes.
const PISTAS = {
  nombre: ['nombre', 'nombre completo', 'nombres y apellidos', 'razon social', 'razón social', 'contraparte', 'tercero', 'beneficiario'],
  tipoDocumento: ['tipo documento', 'tipo de documento', 'tipo doc', 'tipo id'],
  documento: ['documento', 'numero documento', 'número de documento', 'cedula', 'cédula', 'identificacion', 'identificación', 'nit', 'doc'],
  vinculo: ['vinculo', 'vínculo', 'rol', 'tipo contraparte', 'relacion', 'relación', 'cargo'],
};

let filasCargadas = [];
let encabezadoCargado = [];

export function montarCruce() {
  document.getElementById('archivo-cruce').addEventListener('change', async (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const texto = await archivo.text();
    const filas = leerCSV(texto, detectarSeparador(texto));
    const { encabezado, objetos } = filasAObjetos(filas);

    if (!objetos.length) {
      document.getElementById('mapeo-cruce').innerHTML =
        '<div class="aviso error">El archivo no tiene filas de datos debajo del encabezado.</div>';
      return;
    }
    encabezadoCargado = encabezado;
    filasCargadas = objetos;
    pintarMapeo(archivo.name);
  });
}

function adivinar(campo) {
  const pistas = PISTAS[campo];
  const normalizadas = encabezadoCargado.map((h) => normalizarNombre(h));
  for (const pista of pistas) {
    const indice = normalizadas.indexOf(normalizarNombre(pista));
    if (indice !== -1) return encabezadoCargado[indice];
  }
  for (const pista of pistas) {
    const indice = normalizadas.findIndex((h) => h.includes(normalizarNombre(pista)));
    if (indice !== -1) return encabezadoCargado[indice];
  }
  return '';
}

function pintarMapeo(nombreArchivo) {
  const opciones = (seleccionada) =>
    ['<option value="">— ninguna —</option>']
      .concat(
        encabezadoCargado.map(
          (h) => `<option value="${esc(h)}"${h === seleccionada ? ' selected' : ''}>${esc(h)}</option>`,
        ),
      )
      .join('');

  document.getElementById('mapeo-cruce').innerHTML = `
    <h3 style="margin-top:20px">2. Indicar qué columna es cuál</h3>
    <p class="tenue">
      ${filasCargadas.length.toLocaleString('es-CO')} filas leídas de <strong>${esc(nombreArchivo)}</strong>.
    </p>
    <div class="campos">
      <div><label for="m-nombre">Nombre o razón social</label><select id="m-nombre">${opciones(adivinar('nombre'))}</select></div>
      <div><label for="m-tipo">Tipo de documento</label><select id="m-tipo">${opciones(adivinar('tipoDocumento'))}</select></div>
      <div><label for="m-doc">Número de documento</label><select id="m-doc">${opciones(adivinar('documento'))}</select></div>
      <div><label for="m-vinculo">Tipo de contraparte</label><select id="m-vinculo">${opciones(adivinar('vinculo'))}</select></div>
    </div>
    <div class="acciones">
      <button type="button" class="accion" id="ejecutar-cruce">Ejecutar el cruce</button>
    </div>
  `;
  document.getElementById('ejecutar-cruce').addEventListener('click', ejecutar);
}

async function ejecutar() {
  const columnas = {
    nombre: document.getElementById('m-nombre').value,
    tipoDocumento: document.getElementById('m-tipo').value,
    documento: document.getElementById('m-doc').value,
    vinculo: document.getElementById('m-vinculo').value,
  };
  if (!columnas.nombre && !columnas.documento) {
    alert('Indica al menos la columna del nombre o la del documento.');
    return;
  }

  const progreso = document.getElementById('progreso-cruce');
  const salida = document.getElementById('resultado-cruce');
  salida.innerHTML = '';
  progreso.innerHTML = `
    <div class="tarjeta">
      <h3 style="margin-top:0">Cruzando contra las listas…</h3>
      <progress id="barra-cruce" max="${filasCargadas.length}" value="0"></progress>
      <p class="tenue" id="texto-cruce">0 de ${filasCargadas.length.toLocaleString('es-CO')}</p>
    </div>`;
  const barra = document.getElementById('barra-cruce');
  const texto = document.getElementById('texto-cruce');

  const cruceId = nuevoId('x');
  const inicio = new Date().toISOString();
  const resultados = [];
  const registros = [];

  for (let i = 0; i < filasCargadas.length; i++) {
    const fila = filasCargadas[i];
    const nombre = columnas.nombre ? String(fila[columnas.nombre] || '').trim() : '';
    const documento = columnas.documento ? String(fila[columnas.documento] || '').trim() : '';
    const tipoDocumento = columnas.tipoDocumento ? String(fila[columnas.tipoDocumento] || '').trim() : '';
    const vinculo = columnas.vinculo ? String(fila[columnas.vinculo] || '').trim() : '';

    if (!nombre && !documento) continue;

    const resultado = estado.motor.consultar({ nombre, documento, tipoDocumento });
    resultados.push({ fila: i + 2, nombre, documento, tipoDocumento, vinculo, ...resultado });

    registros.push({
      id: nuevoId('c'),
      fecha: resultado.fecha,
      tipo: 'cruce',
      cruceId,
      vinculo,
      consulta: resultado.consulta,
      nombreNormalizado: normalizarNombre(nombre),
      documentoNormalizado: normalizarDocumento(documento),
      resultado: resultado.resultado,
      coincidencias: resultado.coincidencias,
      // Las listas no se repiten en cada fila: viven una sola vez en el cruce.
      listas: [],
      responsable: estado.config.responsable || '',
    });

    if (i % FILAS_POR_TANDA === 0) {
      barra.value = i;
      texto.textContent = `${i.toLocaleString('es-CO')} de ${filasCargadas.length.toLocaleString('es-CO')}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  barra.value = filasCargadas.length;
  const listas = resultados[0]?.listas || estado.listas.map((l) => ({
    id: l.id, nombre: l.nombre, fechaPublicacion: l.fechaPublicacion,
    sha256: l.sha256, registros: l.registros.length, autoridad: l.autoridad,
  }));

  const conteo = (r) => resultados.filter((x) => x.resultado === r).length;
  const cruce = {
    id: cruceId,
    fecha: inicio,
    total: resultados.length,
    alertas: conteo('ALERTA'),
    revisiones: conteo('EN_REVISION'),
    limpias: conteo('SIN_HALLAZGOS'),
    listas,
    responsable: estado.config.responsable || '',
  };

  await guardarVarios(ALMACENES.consultas, registros);
  await guardar(ALMACENES.cruces, cruce);
  await marcarCumplida('cruce-masivo', inicio);
  registroCambio();

  progreso.innerHTML = '';
  pintarResultados(cruce, resultados);
}

function pintarResultados(cruce, resultados) {
  const revisar = resultados
    .filter((r) => r.resultado !== 'SIN_HALLAZGOS')
    .sort((a, b) => (b.coincidencias[0]?.puntaje || 0) - (a.coincidencias[0]?.puntaje || 0));

  document.getElementById('resultado-cruce').innerHTML = `
    <div class="indicadores">
      <div class="indicador"><div class="cifra">${cruce.total.toLocaleString('es-CO')}</div><div class="rotulo">Contrapartes cruzadas</div></div>
      <div class="indicador limpio"><div class="cifra">${cruce.limpias.toLocaleString('es-CO')}</div><div class="rotulo">Sin hallazgos</div></div>
      <div class="indicador revision"><div class="cifra">${cruce.revisiones.toLocaleString('es-CO')}</div><div class="rotulo">En revisión</div></div>
      <div class="indicador alerta"><div class="cifra">${cruce.alertas.toLocaleString('es-CO')}</div><div class="rotulo">Con alerta</div></div>
    </div>

    <div class="tarjeta">
      <h2>Requieren atención</h2>
      ${
        revisar.length
          ? `<p class="tenue">Ordenadas por similitud. El resto de contrapartes salió sin hallazgos y quedó registrado en el expediente.</p>
             <div class="envoltura-tabla"><table>
               <thead><tr><th>Fila</th><th>Contraparte</th><th>Documento</th><th>Resultado</th><th>Coincidencia más fuerte</th><th>Lista</th></tr></thead>
               <tbody>${revisar
                 .map((r) => {
                   const c = r.coincidencias[0];
                   return `<tr>
                     <td class="numero">${r.fila}</td>
                     <td>${esc(r.nombre) || '—'}</td>
                     <td class="numero">${esc(r.documento) || '—'}</td>
                     <td><span class="etiqueta ${r.resultado}">${esc(ROTULOS[r.resultado])}</span></td>
                     <td>${c ? `${esc(c.registro.n)}<br><span class="tenue">${c.motivo === 'documento' ? 'documento exacto' : `similitud ${esc(porcentaje(c.puntaje))}`}</span>` : '—'}</td>
                     <td>${c ? esc(c.lista.nombre) : '—'}</td>
                   </tr>`;
                 })
                 .join('')}</tbody>
             </table></div>`
          : '<p class="vacio">Ninguna contraparte coincidió con las listas restrictivas.</p>'
      }
      <div class="acciones">
        <button type="button" class="accion secundaria" id="exportar-cruce">Exportar resultado completo (CSV)</button>
      </div>
      <p class="tenue" style="margin-top:12px">
        Cruce ejecutado el ${esc(fechaHora(cruce.fecha))}. La obligación mensual quedó marcada como cumplida.
      </p>
    </div>
  `;

  document.getElementById('exportar-cruce').addEventListener('click', () => {
    const filas = [
      ['Fila', 'Nombre', 'Tipo documento', 'Documento', 'Tipo contraparte', 'Resultado', 'Coincidencias', 'Mejor coincidencia', 'Lista', 'Similitud', 'Motivo'],
      ...resultados.map((r) => {
        const c = r.coincidencias[0];
        return [
          r.fila, r.nombre, r.tipoDocumento, r.documento, r.vinculo,
          ROTULOS[r.resultado] || r.resultado,
          r.coincidencias.length,
          c ? c.registro.n : '',
          c ? c.lista.nombre : '',
          c ? (c.motivo === 'documento' ? 'exacta' : porcentaje(c.puntaje)) : '',
          c ? (c.motivo === 'documento' ? 'Número de documento' : 'Nombre') : '',
        ];
      }),
    ];
    descargar(`cruce-masivo-${marcaArchivo()}.csv`, escribirCSV(filas, ';'), 'text/csv;charset=utf-8');
  });
}

// Resumen: indicadores, últimas consultas y estado de las obligaciones.

import { alCambiarRegistro, mostrarSeccion } from './app.js';
import { todos, leerConfig, ALMACENES } from '../registro/db.js';
import { diasDesde } from '../registro/respaldo.js';
import { listar, estadoDe, claseEstado, ESTADOS, marcarCumplida } from './obligaciones.js';
import { esc, fechaHora, ROTULOS } from './formato.js';

// A partir de aquí, la copia de seguridad se considera vieja. Un mes es el
// período de la obligación mensual: si se exporta al cerrar cada mes, el
// aviso no aparece nunca.
const DIAS_SIN_COPIA = 30;

export function montarPanel() {
  refrescar();
  alCambiarRegistro(refrescar);

  document.getElementById('obligaciones').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-cumplir]');
    if (!boton) return;
    await marcarCumplida(boton.dataset.cumplir);
    refrescar();
  });

  document.getElementById('avisos-panel').addEventListener('click', (evento) => {
    const enlace = evento.target.closest('button[data-ir]');
    if (enlace) mostrarSeccion(enlace.dataset.ir);
  });
}

async function refrescar() {
  const [consultas, documentos, ultimaCopia] = await Promise.all([
    todos(ALMACENES.consultas),
    todos(ALMACENES.documentos),
    leerConfig('ultimaCopia'),
  ]);
  pintarAvisos(consultas, documentos, ultimaCopia);
  pintarIndicadores(consultas, documentos);
  pintarUltimas(consultas);
  await pintarObligaciones();
}

/**
 * Lo que hay que hacer hoy, antes de cualquier cifra.
 *
 * Son los dos olvidos que dejan el sistema sin valor probatorio: una alerta
 * que nadie cerró —el auditor pregunta «¿y qué hicieron con esto?»— y una
 * copia de seguridad vieja, que con el registro viviendo solo en este
 * navegador significa que un formateo se lleva el expediente entero.
 */
function pintarAvisos(consultas, documentos, ultimaCopia) {
  const sinCerrar = alertasSinCerrar(consultas, documentos);
  const dias = diasDesde(ultimaCopia);
  const avisos = [];

  if (sinCerrar.length) {
    avisos.push(`<div class="aviso atencion">
      <strong>${sinCerrar.length} alerta(s) sin analizar.</strong>
      Una coincidencia sin decisión escrita deja el expediente incompleto: registra la
      observación en la consulta o diligencia el formato de debida diligencia intensificada.
      <button type="button" class="accion secundaria no-imprimir" style="margin-left:8px" data-ir="expediente">Ver el expediente</button>
    </div>`);
  }
  if (dias === null) {
    avisos.push(`<div class="aviso atencion">
      <strong>Nunca se ha exportado una copia de seguridad.</strong>
      El expediente vive solo en este navegador: si se borran los datos del sitio, se pierde.
      <button type="button" class="accion secundaria no-imprimir" style="margin-left:8px" data-ir="expediente">Crear la copia</button>
    </div>`);
  } else if (dias >= DIAS_SIN_COPIA) {
    avisos.push(`<div class="aviso atencion">
      <strong>La última copia de seguridad es de hace ${dias} días.</strong>
      <button type="button" class="accion secundaria no-imprimir" style="margin-left:8px" data-ir="expediente">Crear una nueva</button>
    </div>`);
  }
  document.getElementById('avisos-panel').innerHTML = avisos.join('');
}

/**
 * Una alerta está atendida cuando quedó por escrito qué se decidió: la
 * observación del responsable en la propia consulta, o un formato de debida
 * diligencia intensificada que la cite.
 */
export function alertasSinCerrar(consultas, documentos) {
  const analizadas = new Set(
    documentos
      .filter((d) => d.plantilla === 'debida-diligencia')
      .map((d) => (d.valores?.consultaId || '').trim())
      .filter(Boolean),
  );
  return consultas.filter(
    (c) =>
      (c.resultado === 'ALERTA' || c.resultado === 'EN_REVISION') &&
      !String(c.observaciones || '').trim() &&
      !analizadas.has(c.id),
  );
}

function pintarIndicadores(consultas, documentos) {
  const cuenta = (r) => consultas.filter((c) => c.resultado === r).length;
  // "PEP identificados" sale de la marca que deja el responsable en la
  // consulta, no de una lista: en Colombia no existe un listado oficial de
  // personas expuestas políticamente que se pueda descargar.
  const pep = consultas.filter((c) => c.pep).length;

  const tarjetas = [
    { rotulo: 'Consultas totales', valor: consultas.length, clase: '' },
    { rotulo: 'Sin hallazgos', valor: cuenta('SIN_HALLAZGOS'), clase: 'limpio' },
    { rotulo: 'En revisión', valor: cuenta('EN_REVISION'), clase: 'revision' },
    { rotulo: 'Con alerta', valor: cuenta('ALERTA'), clase: 'alerta' },
    { rotulo: 'PEP identificados', valor: pep, clase: '' },
    { rotulo: 'Documentos del sistema', valor: documentos.length, clase: '' },
  ];

  document.getElementById('indicadores').innerHTML = tarjetas
    .map(
      (t) => `<div class="indicador ${t.clase}">
        <div class="cifra">${t.valor.toLocaleString('es-CO')}</div>
        <div class="rotulo">${esc(t.rotulo)}</div>
      </div>`,
    )
    .join('');
}

function pintarUltimas(consultas) {
  const destino = document.getElementById('ultimas-consultas');
  if (!consultas.length) {
    destino.innerHTML =
      '<p class="vacio">Todavía no hay consultas registradas. Empieza por <a href="#consulta">Consulta puntual</a>.</p>';
    return;
  }

  const ultimas = [...consultas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);
  destino.innerHTML = `<div class="envoltura-tabla"><table>
    <thead><tr><th>Contraparte</th><th>Origen</th><th>Resultado</th><th>Fecha</th></tr></thead>
    <tbody>${ultimas
      .map(
        (c) => `<tr>
          <td>${esc(c.consulta?.nombre || c.consulta?.documento || '—')}</td>
          <td>${c.tipo === 'cruce' ? 'Cruce masivo' : c.tipo === 'antecedentes' ? 'Antecedentes' : 'Consulta puntual'}</td>
          <td><span class="etiqueta ${c.resultado}">${esc(ROTULOS[c.resultado] || c.resultado)}</span></td>
          <td class="numero">${esc(fechaHora(c.fecha))}</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

async function pintarObligaciones() {
  const obligaciones = await listar();
  document.getElementById('obligaciones').innerHTML = obligaciones
    .map((o) => {
      const est = estadoDe(o);
      return `<tr>
        <td>${esc(o.nombre)}</td>
        <td>${o.frecuencia === 'anual' ? 'Anual' : 'Mensual'}</td>
        <td class="numero">${o.ultimaEjecucion ? esc(fechaHora(o.ultimaEjecucion)) : '—'}</td>
        <td>
          <span class="etiqueta ${claseEstado(est)}">${esc(ESTADOS[est])}</span>
          ${o.automatica
            ? '<br><span class="tenue">se marca sola al correr el cruce</span>'
            : `<br><button type="button" class="accion secundaria no-imprimir" style="font-size:.75rem;padding:3px 9px;margin-top:5px" data-cumplir="${esc(o.id)}">Marcar cumplida hoy</button>`}
        </td>
      </tr>`;
    })
    .join('');
}

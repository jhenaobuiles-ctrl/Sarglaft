// Resumen: indicadores, últimas consultas y estado de las obligaciones.

import { alCambiarRegistro } from './app.js';
import { todos, ALMACENES } from '../registro/db.js';
import { listar, estadoDe, claseEstado, ESTADOS, marcarCumplida } from './obligaciones.js';
import { esc, fechaHora, ROTULOS } from './formato.js';

export function montarPanel() {
  refrescar();
  alCambiarRegistro(refrescar);

  document.getElementById('obligaciones').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-cumplir]');
    if (!boton) return;
    await marcarCumplida(boton.dataset.cumplir);
    refrescar();
  });
}

async function refrescar() {
  const consultas = await todos(ALMACENES.consultas);
  pintarIndicadores(consultas);
  pintarUltimas(consultas);
  await pintarObligaciones();
}

function pintarIndicadores(consultas) {
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

// Estado de las listas cargadas: qué versión se está usando y desde cuándo.

import { estado } from './app.js';
import { esc, fechaCorta, fechaHora } from './formato.js';

export function montarListas() {
  const destino = document.getElementById('estado-listas');
  const manifiesto = estado.manifiesto || {};
  const porId = new Map(estado.listas.map((l) => [l.id, l]));

  const filas = (manifiesto.listas || []).map((entrada) => {
    const cargada = porId.get(entrada.id);
    const problema = entrada.estado !== 'ok';
    return `<tr>
      <td>
        <strong>${esc(entrada.nombre)}</strong>
        ${entrada.vinculante ? '<br><span class="etiqueta ALERTA">Vinculante</span>' : ''}
        <br><span class="tenue">${esc(entrada.autoridad || '')}</span>
      </td>
      <td>${esc(fechaCorta(entrada.fechaPublicacion))}</td>
      <td class="numero">${(entrada.registros || 0).toLocaleString('es-CO')}</td>
      <td class="numero">${esc(fechaHora(entrada.actualizado))}</td>
      <td>
        <span class="etiqueta ${problema ? 'EN_REVISION' : 'SIN_HALLAZGOS'}">
          ${problema ? (entrada.estado === 'obsoleto' ? 'Desactualizada' : 'Sin datos') : 'Al día'}
        </span>
        ${entrada.error ? `<br><span class="tenue">${esc(entrada.error)}</span>` : ''}
        ${cargada ? '' : '<br><span class="tenue">no cargada en esta sesión</span>'}
      </td>
      <td class="mono">${esc((entrada.sha256 || '').slice(0, 16))}${entrada.sha256 ? '…' : ''}</td>
    </tr>`;
  });

  destino.innerHTML = `
    <p class="tenue">
      Las listas se actualizan solas todos los días a las 6:00 de la mañana. El sha256 identifica
      el archivo exacto contra el que se consulta y es lo que aparece en cada certificado.
      ${estado.desdeCache ? '<br><strong>Ahora mismo se está usando una copia guardada, sin conexión.</strong>' : ''}
    </p>
    <div class="envoltura-tabla"><table>
      <thead><tr><th>Lista</th><th>Publicada</th><th>Registros</th><th>Descargada</th><th>Estado</th><th>sha256</th></tr></thead>
      <tbody>${filas.join('')}</tbody>
    </table></div>
    <p class="tenue" style="margin-top:14px">
      Generado el ${esc(fechaHora(manifiesto.generado))}.
      Ante cualquier duda prima la consulta en el sitio oficial de la lista: lo que hay aquí es
      una copia fechada, no la fuente de verdad.
    </p>
  `;
}

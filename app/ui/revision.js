// Revisión periódica: volver a pasar por las listas a quien ya se consultó.
//
// Es la pieza que faltaba. Una consulta demuestra que en esa fecha la persona
// no estaba en ninguna lista, y nada más: las designaciones se publican todos
// los días, y un alumno limpio en marzo puede estar designado en agosto. Sin
// esto, el sistema solo miraba a las contrapartes nuevas y la cartera vieja
// envejecía sin que nadie la volviera a mirar.
//
// El insumo no es un archivo: son las contrapartes que ya están en el
// expediente. No hay que volver a exportar nada de Excel, que es justo el
// paso que hace que la revisión mensual no se haga.
//
// Qué se guarda: un registro del barrido completo —cuántas contrapartes,
// contra qué versión de cada lista— y una consulta individual solo para las
// que **empeoraron**. Guardar una fila por contraparte en cada barrido
// llenaría el expediente de miles de «sin hallazgos» repetidos y enterraría lo
// único que importa mirar.
//
// Y tampoco se duplica la alerta que ya se conocía: si la coincidencia sigue
// igual que la última vez, la fila del barrido apunta a la consulta que ya
// está abierta en el expediente. Crear una nueva cada mes reabriría una
// decisión ya tomada y dejaría el contador de pendientes creciendo para
// siempre por una alerta que alguien ya atendió.

import { estado, registroCambio, alCambiarRegistro } from './app.js';
import { todos, guardar, guardarVarios, ALMACENES, nuevoId } from '../registro/db.js';
import { marcarCumplida } from './obligaciones.js';
import { requiereDesenlace, conectarDecisiones, planDeRegistro } from './desenlace.js';
import { esc, ROTULOS, porcentaje, fechaHora, descargar, marcaArchivo } from './formato.js';
import { escribirCSV } from '../lib/csv.js';
import { ultimaPorContraparte } from '../registro/contrapartes.js';

const POR_TANDA = 200;

export function montarRevision() {
  document.getElementById('revision-periodica').addEventListener('click', (evento) => {
    if (evento.target.closest('#ejecutar-revision')) ejecutar();
  });
  conectarDecisiones('resultado-revision', () => ({
    responsable: estado.config.responsable || '',
    alGuardar: registroCambio,
  }));
  pintar();
  // Tras un cruce o una restauración hay más contrapartes que revisar.
  alCambiarRegistro(pintar);
}

/**
 * Una contraparte por documento, o por nombre si no tiene documento.
 *
 * Se toma la consulta más reciente de cada una: es el resultado con el que
 * hay que comparar para saber si algo cambió.
 */
export async function contrapartesDelExpediente() {
  return [...ultimaPorContraparte(await todos(ALMACENES.consultas)).values()];
}

async function pintar() {
  const destino = document.getElementById('revision-periodica');
  const contrapartes = await contrapartesDelExpediente();
  const revisiones = (await todos(ALMACENES.cruces)).filter((c) => c.tipo === 'revision');
  const ultima = revisiones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];

  destino.innerHTML = `
    <div class="tarjeta">
      <h2>Revisión periódica del expediente</h2>
      <p class="tenue">
        Vuelve a pasar por las listas de hoy a todas las contrapartes que ya están en el
        expediente, sin tener que cargar ningún archivo. Una consulta prueba que la persona
        estaba limpia ese día; las designaciones se publican a diario.
      </p>
      <div class="indicadores">
        <div class="indicador">
          <div class="cifra">${contrapartes.length.toLocaleString('es-CO')}</div>
          <div class="rotulo">Contrapartes en el expediente</div>
        </div>
        <div class="indicador">
          <div class="cifra" style="font-size:1rem;padding:.5rem 0">${
            ultima ? esc(fechaHora(ultima.fecha)) : 'Nunca'
          }</div>
          <div class="rotulo">Última revisión</div>
        </div>
      </div>
      <div class="acciones">
        <button type="button" class="accion" id="ejecutar-revision"${
          contrapartes.length ? '' : ' disabled'
        }>Revisar las ${contrapartes.length.toLocaleString('es-CO')} contrapartes</button>
      </div>
      ${
        contrapartes.length
          ? ''
          : '<p class="tenue">Todavía no hay a quién revisar: haz primero una consulta puntual o un cruce masivo.</p>'
      }
    </div>
  `;
}

async function ejecutar() {
  const boton = document.getElementById('ejecutar-revision');
  boton.disabled = true;
  const salida = document.getElementById('resultado-revision');
  const contrapartes = await contrapartesDelExpediente();

  salida.innerHTML = `<div class="tarjeta">
    <h3 style="margin-top:0">Revisando contra las listas de hoy…</h3>
    <progress id="barra-revision" max="${contrapartes.length}" value="0"></progress>
    <p class="tenue" id="texto-revision">0 de ${contrapartes.length.toLocaleString('es-CO')}</p>
  </div>`;
  const barra = document.getElementById('barra-revision');
  const texto = document.getElementById('texto-revision');

  const revisionId = nuevoId('r');
  const inicio = new Date().toISOString();
  const cambios = [];
  const nuevosRegistros = [];

  for (let i = 0; i < contrapartes.length; i++) {
    const previa = contrapartes[i];
    const datos = previa.consulta || {};
    const resultado = estado.motor.consultar({
      nombre: datos.nombre || '',
      documento: datos.documento || '',
      tipoDocumento: datos.tipoDocumento || '',
    });

    const { interesa, empeoro, reusaConsulta } = planDeRegistro(previa, resultado.resultado);
    if (interesa) {
      // Reutilizar el identificador de la consulta abierta hace que decidir
      // desde el barrido cierre esa y no una copia recién creada.
      const idConsulta = reusaConsulta ? previa.id : nuevoId('c');
      cambios.push({
        id: idConsulta,
        resultado: resultado.resultado,
        nombre: datos.nombre || '',
        documento: datos.documento || '',
        antes: previa.resultado,
        ahora: resultado.resultado,
        nuevo: empeoro,
        coincidencia: resultado.coincidencias[0] || null,
        fechaAnterior: previa.fecha,
      });
      if (empeoro) nuevosRegistros.push({
        id: idConsulta,
        fecha: resultado.fecha,
        tipo: 'cruce',
        cruceId: revisionId,
        vinculo: previa.vinculo || '',
        consulta: resultado.consulta,
        nombreNormalizado: previa.nombreNormalizado,
        documentoNormalizado: previa.documentoNormalizado,
        resultado: resultado.resultado,
        coincidencias: resultado.coincidencias,
        pep: Boolean(previa.pep),
        pepDetalle: previa.pepDetalle || '',
        // Las listas viven una sola vez, en el registro de la revisión.
        listas: [],
        responsable: estado.config.responsable || '',
        observaciones: `Detectada en la revisión periódica del ${fechaHora(inicio)}. En la consulta anterior (${fechaHora(previa.fecha)}) el resultado era «${ROTULOS[previa.resultado] || previa.resultado}».`,
      });
    }

    if (i % POR_TANDA === 0) {
      barra.value = i;
      texto.textContent = `${i.toLocaleString('es-CO')} de ${contrapartes.length.toLocaleString('es-CO')}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const revision = {
    id: revisionId,
    tipo: 'revision',
    fecha: inicio,
    total: contrapartes.length,
    nuevas: cambios.filter((c) => c.nuevo).length,
    alertas: cambios.filter((c) => c.ahora === 'ALERTA').length,
    revisiones: cambios.filter((c) => c.ahora === 'EN_REVISION').length,
    limpias: contrapartes.length - cambios.length,
    listas: estado.listas.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      autoridad: l.autoridad,
      vinculante: Boolean(l.vinculante),
      fechaPublicacion: l.fechaPublicacion,
      sha256: l.sha256,
      registros: l.registros.length,
    })),
    responsable: estado.config.responsable || '',
  };

  await guardarVarios(ALMACENES.consultas, nuevosRegistros);
  await guardar(ALMACENES.cruces, revision);
  // Revisar a todas las contrapartes contra las listas del día es exactamente
  // la obligación mensual de cruce, y sin tener que exportar nada de Excel.
  await marcarCumplida('cruce-masivo', inicio);
  registroCambio();

  pintarResultado(revision, cambios);
}

function pintarResultado(revision, cambios) {
  const nuevas = cambios.filter((c) => c.nuevo);
  const salida = document.getElementById('resultado-revision');

  salida.innerHTML = `
    <div class="indicadores">
      <div class="indicador"><div class="cifra">${revision.total.toLocaleString('es-CO')}</div><div class="rotulo">Contrapartes revisadas</div></div>
      <div class="indicador limpio"><div class="cifra">${revision.limpias.toLocaleString('es-CO')}</div><div class="rotulo">Siguen sin hallazgos</div></div>
      <div class="indicador alerta"><div class="cifra">${nuevas.length.toLocaleString('es-CO')}</div><div class="rotulo">Hallazgos nuevos</div></div>
    </div>

    <div class="tarjeta">
      <h2>${nuevas.length ? 'Contrapartes que empeoraron desde la última consulta' : 'Sin novedades'}</h2>
      ${
        cambios.length
          ? `<p class="tenue">
               Las marcadas como <strong>nuevas</strong> no coincidían la vez anterior: son las que hay
               que mirar hoy. Todas quedaron registradas en el expediente con su certificado.
             </p>
             <div class="envoltura-tabla"><table>
               <thead><tr><th></th><th>Contraparte</th><th>Documento</th><th>Antes</th><th>Ahora</th><th>Coincidencia</th><th></th></tr></thead>
               <tbody>${cambios
                 .sort((a, b) => Number(b.nuevo) - Number(a.nuevo))
                 .map(
                   (c) => `<tr>
                     <td>${c.nuevo ? '<span class="etiqueta ALERTA">nueva</span>' : ''}</td>
                     <td>${esc(c.nombre) || '—'}</td>
                     <td class="numero">${esc(c.documento) || '—'}</td>
                     <td><span class="tenue">${esc(ROTULOS[c.antes] || c.antes)}</span><br><span class="tenue">${esc(fechaHora(c.fechaAnterior))}</span></td>
                     <td>
                       <span class="etiqueta ${c.ahora}">${esc(ROTULOS[c.ahora] || c.ahora)}</span>
                       <br><span data-chip="${esc(c.id)}"></span>
                     </td>
                     <td>${
                       c.coincidencia
                         ? `${esc(c.coincidencia.registro.n)}<br><span class="tenue">${
                             c.coincidencia.motivo === 'documento'
                               ? 'documento exacto'
                               : `similitud ${esc(porcentaje(c.coincidencia.puntaje))}`
                           } · ${esc(c.coincidencia.lista.nombre)}</span>`
                         : '—'
                     }</td>
                     <td class="acciones-fila">
                       ${requiereDesenlace(c) ? `<button type="button" class="accion no-imprimir" data-analizar="${esc(c.id)}" data-rotulo="Decidir">Decidir</button>` : ''}
                     </td>
                   </tr>`,
                 )
                 .join('')}</tbody>
             </table></div>
             <div class="acciones">
               <button type="button" class="accion secundaria" id="exportar-revision">Exportar a CSV</button>
             </div>`
          : '<p class="vacio">Ninguna contraparte del expediente coincide hoy con las listas restrictivas.</p>'
      }
      <p class="tenue" style="margin-top:12px">
        Revisión ejecutada el ${esc(fechaHora(revision.fecha))} contra ${revision.listas.length}
        lista(s). La obligación mensual de cruce quedó marcada como cumplida.
      </p>
    </div>
  `;

  const exportar = document.getElementById('exportar-revision');
  if (exportar) {
    exportar.addEventListener('click', () => {
      const filas = [
        ['Contraparte', 'Documento', 'Resultado anterior', 'Fecha anterior', 'Resultado actual', '¿Hallazgo nuevo?', 'Coincidencia', 'Lista', 'Similitud'],
        ...cambios.map((c) => [
          c.nombre,
          c.documento,
          ROTULOS[c.antes] || c.antes,
          c.fechaAnterior || '',
          ROTULOS[c.ahora] || c.ahora,
          c.nuevo ? 'Sí' : 'No',
          c.coincidencia ? c.coincidencia.registro.n : '',
          c.coincidencia ? c.coincidencia.lista.nombre : '',
          c.coincidencia
            ? c.coincidencia.motivo === 'documento'
              ? 'exacta'
              : porcentaje(c.coincidencia.puntaje)
            : '',
        ]),
      ];
      descargar(
        `revision-periodica-${marcaArchivo()}.csv`,
        escribirCSV(filas, ';'),
        'text/csv;charset=utf-8',
      );
    });
  }
}

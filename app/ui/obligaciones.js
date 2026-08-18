// Obligaciones periódicas del régimen simplificado.
//
// El panel anterior las mostraba como una lista fija en "Pendiente". Aquí el
// estado se calcula: una obligación mensual está al día si se cumplió dentro
// del mes corriente, y el cruce masivo se marca solo cuando termina.

import { todos, guardar, obtener, ALMACENES } from '../registro/db.js';

export const OBLIGACIONES_BASE = [
  {
    id: 'cruce-masivo',
    nombre: 'Cruce masivo mensual contra listas restrictivas',
    frecuencia: 'mensual',
    // Esta se marca sola al terminar un cruce; las demás se marcan a mano.
    automatica: true,
  },
  { id: 'reporte-uiaf', nombre: 'Reporte AROS / ROS a la UIAF por el SIREL', frecuencia: 'mensual' },
  { id: 'capacitacion', nombre: 'Capacitación anual del personal', frecuencia: 'anual' },
  { id: 'revision-manual', nombre: 'Revisión y actualización del manual SARLAFT', frecuencia: 'anual' },
];

export const ESTADOS = {
  al_dia: 'Al día',
  proxima: 'Próxima a vencer',
  vencida: 'Vencida',
  pendiente: 'Pendiente',
};

/** Devuelve las obligaciones con su última ejecución, sembrando las que falten. */
export async function listar() {
  const guardadas = await todos(ALMACENES.obligaciones);
  const porId = new Map(guardadas.map((o) => [o.id, o]));
  const salida = [];
  for (const base of OBLIGACIONES_BASE) {
    const existente = porId.get(base.id);
    if (!existente) {
      const nueva = { ...base, ultimaEjecucion: null };
      await guardar(ALMACENES.obligaciones, nueva);
      salida.push(nueva);
    } else {
      salida.push({ ...base, ...existente });
    }
  }
  return salida;
}

export async function marcarCumplida(id, fechaISO = new Date().toISOString()) {
  const base = OBLIGACIONES_BASE.find((o) => o.id === id);
  if (!base) return null;
  const existente = (await obtener(ALMACENES.obligaciones, id)) || { ...base };
  const actualizada = { ...base, ...existente, ultimaEjecucion: fechaISO };
  await guardar(ALMACENES.obligaciones, actualizada);
  return actualizada;
}

/**
 * Estado de una obligación en una fecha dada.
 *
 * "Próxima a vencer" es deliberadamente generosa —los últimos siete días del
 * período— para que el aviso llegue con margen y no el mismo día del cierre.
 */
export function estadoDe(obligacion, ahora = new Date()) {
  const ultima = obligacion.ultimaEjecucion ? new Date(obligacion.ultimaEjecucion) : null;
  if (!ultima || Number.isNaN(ultima.getTime())) return 'pendiente';

  const inicioPeriodo =
    obligacion.frecuencia === 'anual'
      ? new Date(ahora.getFullYear(), 0, 1)
      : new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  if (ultima < inicioPeriodo) return 'vencida';

  const finPeriodo =
    obligacion.frecuencia === 'anual'
      ? new Date(ahora.getFullYear() + 1, 0, 1)
      : new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
  const diasRestantes = (finPeriodo - ahora) / 86400000;
  return diasRestantes <= 7 ? 'proxima' : 'al_dia';
}

export function claseEstado(estado) {
  if (estado === 'al_dia') return 'SIN_HALLAZGOS';
  if (estado === 'proxima') return 'EN_REVISION';
  if (estado === 'vencida' || estado === 'pendiente') return 'ALERTA';
  return 'neutra';
}

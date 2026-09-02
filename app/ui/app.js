// Arranque del panel: carga las listas, construye el motor y conecta las vistas.

import { cargarManifiesto, cargarListas, limpiarCache } from '../datos/cargador.js';
import { crearMotor } from '../motor/consulta.js';
import { leerConfig, escribirConfig, borrarTodo } from '../registro/db.js';
import { listasConProblema } from '../datos/frescura.js';
import { esc } from './formato.js';

import { montarPanel } from './panel.js';
import { montarConsulta } from './consulta.js';
import { montarCruce } from './cruce.js';
import { montarRevision } from './revision.js';
import { montarAntecedentes } from './antecedentes.js';
import { montarDocumentos } from './documentos.js';
import { montarContrapartes } from './contrapartes.js';
import { montarExpediente } from './expediente.js';
import { montarListas } from './listas.js';

/** Estado compartido por las vistas. */
export const estado = {
  manifiesto: null,
  listas: [],
  motor: null,
  desdeCache: false,
  fallos: [],
  config: {},
  // Las vistas se suscriben para refrescarse cuando cambia el registro.
  oyentes: new Set(),
};

export function alCambiarRegistro(fn) {
  estado.oyentes.add(fn);
}

export function registroCambio() {
  for (const fn of estado.oyentes) fn();
}

const CONFIG_POR_OMISION = {
  empresa: 'Escuela AC de Conducción SAS',
  nit: '',
  responsable: '',
  cargo: 'Oficial de cumplimiento',
  // La norma concreta que vigila a la empresa la escribe quien la conoce: se
  // imprime al pie de cada documento y suponerla sería citar una norma falsa.
  marcoNormativo: '',
};

async function arrancar() {
  conectarNavegacion();
  await cargarConfig();

  const aviso = document.getElementById('aviso-carga');
  try {
    const { manifiesto, desdeCache } = await cargarManifiesto();
    estado.manifiesto = manifiesto;
    estado.desdeCache = desdeCache;

    const total = (manifiesto.listas || []).filter((l) => l.estado !== 'sin_datos').length;
    const { listas, fallos } = await cargarListas(manifiesto, {
      alProgresar: (hecho) => {
        aviso.textContent = `Cargando listas restrictivas… ${hecho} de ${total}`;
      },
    });
    estado.listas = listas;
    estado.fallos = fallos;

    aviso.textContent = 'Preparando el índice de búsqueda…';
    // Un respiro para que el navegador pinte el aviso antes de bloquear el
    // hilo construyendo el índice.
    await new Promise((r) => setTimeout(r, 0));
    estado.motor = crearMotor(listas);

    limpiarCache(manifiesto).catch(() => {});
    mostrarEstadoCarga(aviso);
  } catch (error) {
    aviso.className = 'aviso error';
    aviso.innerHTML = `<strong>No se pudieron cargar las listas.</strong> ${esc(error.message)}`;
    return;
  }

  montarPanel();
  montarConsulta();
  montarCruce();
  montarRevision();
  montarAntecedentes();
  montarDocumentos();
  montarContrapartes();
  montarExpediente();
  montarListas();
  montarAjustes();

  mostrarSeccion(location.hash.replace('#', '') || 'panel');
}

function mostrarEstadoCarga(aviso) {
  const registros = estado.listas.reduce((suma, l) => suma + l.registros.length, 0);
  const obsoletas = estado.listas.filter((l) => l.estado === 'obsoleto');
  const partes = [
    `${registros.toLocaleString('es-CO')} registros cargados de ${estado.listas.length} listas.`,
  ];
  let clase = 'aviso info';

  if (estado.desdeCache) {
    partes.push('Sin conexión: se está usando la última copia descargada.');
    clase = 'aviso atencion';
  }
  if (obsoletas.length) {
    partes.push(
      `${obsoletas.length} lista(s) no se pudieron actualizar y están desactualizadas: ${obsoletas
        .map((l) => l.nombre)
        .join(', ')}.`,
    );
    clase = 'aviso atencion';
  }

  // Una lista que se descarga bien pero dejó de publicar no falla por ningún
  // lado. Si el aviso no sale aquí, hay que entrar a mirarlo a propósito, y
  // nadie entra a mirar lo que el panel dice que está al día.
  const atrasadas = listasConProblema(estado.manifiesto?.listas || []).filter(
    ({ frescura }) => frescura.nivel === 'atrasada',
  );
  if (atrasadas.length) {
    partes.push(
      `${atrasadas.length} lista(s) llevan más tiempo del previsto sin publicar: ${atrasadas
        .map(({ entrada, frescura }) => `${entrada.nombre} (${frescura.dias} días)`)
        .join(', ')}. Compruébalo en Estado de las listas.`,
    );
    clase = 'aviso atencion';
  }
  if (estado.fallos.length) {
    partes.push(`No se pudieron cargar: ${estado.fallos.map((f) => f.nombre).join(', ')}.`);
    clase = 'aviso atencion';
  }
  aviso.className = clase;
  aviso.textContent = partes.join(' ');
}

/* ---------- navegación ---------- */

function conectarNavegacion() {
  const nav = document.getElementById('navegacion');
  nav.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-seccion]');
    if (!boton) return;
    mostrarSeccion(boton.dataset.seccion);
  });
  window.addEventListener('hashchange', () =>
    mostrarSeccion(location.hash.replace('#', '') || 'panel'),
  );
}

export function mostrarSeccion(nombre) {
  const secciones = document.querySelectorAll('.seccion');
  let encontrada = false;
  for (const seccion of secciones) {
    const suya = seccion.id === `seccion-${nombre}`;
    seccion.hidden = !suya;
    if (suya) encontrada = true;
  }
  if (!encontrada) return mostrarSeccion('panel');

  for (const boton of document.querySelectorAll('#navegacion button')) {
    if (boton.dataset.seccion === nombre) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  if (location.hash !== `#${nombre}`) history.replaceState(null, '', `#${nombre}`);
  window.scrollTo(0, 0);
}

/* ---------- ajustes ---------- */

async function cargarConfig() {
  aplicarPerfil((await leerConfig('perfil')) || {});
}

/**
 * Deja el perfil en memoria y en pantalla. Lo usa el arranque y también la
 * restauración de una copia, que trae el perfil de quien la exportó.
 */
export function aplicarPerfil(perfil) {
  estado.config = { ...CONFIG_POR_OMISION, ...perfil };
  document.getElementById('marca-empresa').textContent =
    estado.config.empresa || CONFIG_POR_OMISION.empresa;
  for (const [clave, id] of Object.entries({
    empresa: 'a-empresa', nit: 'a-nit', responsable: 'a-responsable',
    cargo: 'a-cargo', marcoNormativo: 'a-marco',
  })) {
    const campo = document.getElementById(id);
    if (campo) campo.value = estado.config[clave] || '';
  }
}

function montarAjustes() {
  const formulario = document.getElementById('formulario-ajustes');
  const campos = {
    empresa: document.getElementById('a-empresa'),
    nit: document.getElementById('a-nit'),
    responsable: document.getElementById('a-responsable'),
    cargo: document.getElementById('a-cargo'),
    marcoNormativo: document.getElementById('a-marco'),
  };
  for (const [clave, campo] of Object.entries(campos)) campo.value = estado.config[clave] || '';

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const perfil = {};
    for (const [clave, campo] of Object.entries(campos)) perfil[clave] = campo.value.trim();
    estado.config = { ...estado.config, ...perfil };
    await escribirConfig('perfil', estado.config);
    document.getElementById('marca-empresa').textContent =
      estado.config.empresa || CONFIG_POR_OMISION.empresa;
    avisar(formulario, 'Ajustes guardados.');
  });

  document.getElementById('borrar-todo').addEventListener('click', async () => {
    const frase = 'BORRAR';
    const respuesta = prompt(
      `Esto elimina todas las consultas, evidencias y cruces guardados en este navegador y no se puede deshacer.\n\nEscribe ${frase} para confirmar:`,
    );
    if (respuesta !== frase) return;
    await borrarTodo();
    estado.config = { ...CONFIG_POR_OMISION };
    registroCambio();
    alert('El expediente local quedó vacío.');
  });
}

function avisar(contenedor, mensaje) {
  let nota = contenedor.querySelector('.nota-guardado');
  if (!nota) {
    nota = document.createElement('p');
    nota.className = 'nota-guardado tenue';
    contenedor.appendChild(nota);
  }
  nota.textContent = mensaje;
  setTimeout(() => nota.remove(), 4000);
}

// El modo sin conexión requiere un origen seguro; con doble clic sobre el
// archivo no se registra y el panel funciona igual, solo que en línea.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch(() => {});
  });
}

arrancar();

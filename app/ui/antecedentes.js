// Consultas que exigen intervención humana.
//
// Procuraduría, Contraloría, Policía y Rama Judicial usan CAPTCHA y sus
// términos de uso prohíben el acceso automatizado. No se automatizan: lo que
// aporta el panel es abrir cada consulta, recordar cuáles faltan y archivar
// el certificado descargado con constancia de cuándo se hizo.

import { estado, registroCambio } from './app.js';
import { guardar, guardarVarios, ALMACENES, nuevoId } from '../registro/db.js';
import { normalizarNombre, normalizarDocumento } from '../motor/normalizar.js';
import { esc, etiquetaPEP, CONDICIONES_PEP } from './formato.js';

export const FUENTES_MANUALES = [
  {
    id: 'procuraduria',
    nombre: 'Antecedentes disciplinarios',
    entidad: 'Procuraduría General de la Nación',
    url: 'https://www.procuraduria.gov.co/CertWEB/Certificado.aspx?tpo=1',
    aplica: 'ambos',
    nota: 'Genera un certificado en PDF. Descárgalo y adjúntalo aquí.',
  },
  {
    id: 'contraloria',
    nombre: 'Antecedentes fiscales (responsables fiscales)',
    entidad: 'Contraloría General de la República',
    url: 'https://www.contraloria.gov.co/control-fiscal/responsabilidad-fiscal/certificado-de-antecedentes-fiscales',
    aplica: 'ambos',
  },
  {
    id: 'policia',
    nombre: 'Antecedentes judiciales',
    entidad: 'Policía Nacional de Colombia',
    url: 'https://antecedentes.policia.gov.co:7005/WebJudicial/',
    aplica: 'persona',
  },
  {
    id: 'rnmc',
    nombre: 'Medidas correctivas (RNMC)',
    entidad: 'Policía Nacional de Colombia',
    url: 'https://srvpsi.policia.gov.co/PSC/frm_cnl_consulta.aspx',
    aplica: 'persona',
  },
  {
    id: 'rama',
    nombre: 'Procesos judiciales en curso',
    entidad: 'Rama Judicial',
    url: 'https://consultaprocesos.ramajudicial.gov.co/',
    aplica: 'ambos',
    nota: 'Se consulta por número de documento sin puntos.',
  },
  {
    id: 'bancomundial',
    nombre: 'Firmas e individuos inhabilitados',
    entidad: 'Banco Mundial',
    url: 'https://projects.worldbank.org/en/projects-operations/procurement/debarred-firms',
    aplica: 'empresa',
    nota:
      'Estaba prevista como consulta automática, pero el Banco Mundial cerró su descarga pública: ' +
      'el endpoint que usaba su propio sitio ahora exige credenciales y no publica el listado en ' +
      'ningún portal abierto. Queda como consulta manual.',
  },
  {
    id: 'interpol',
    nombre: 'Notificaciones rojas',
    entidad: 'INTERPOL',
    url: 'https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices',
    aplica: 'persona',
    api: 'https://ws-public.interpol.int/notices/v1/red',
    nota: 'INTERPOL no permite descargar el listado; solo se consulta de a un nombre.',
  },
];

const RESULTADOS = [
  { valor: 'SIN_HALLAZGOS', texto: 'Sin hallazgos' },
  { valor: 'EN_REVISION', texto: 'Requiere revisión' },
  { valor: 'ALERTA', texto: 'Con hallazgos' },
  { valor: 'NO_APLICA', texto: 'No aplica' },
];

export function montarAntecedentes() {
  const destino = document.getElementById('antecedentes');
  destino.innerHTML = `
    <form class="tarjeta" id="formulario-antecedentes">
      <h2>Contraparte</h2>
      <div class="campos">
        <div style="grid-column: 1 / -1">
          <label for="an-nombre">Nombre completo o razón social</label>
          <input type="text" id="an-nombre" autocomplete="off">
        </div>
        <div>
          <label for="an-tipo">Tipo</label>
          <select id="an-tipo">
            <option value="persona">Persona natural</option>
            <option value="empresa">Persona jurídica</option>
          </select>
        </div>
        <div>
          <label for="an-doc">Documento</label>
          <input type="text" id="an-doc" autocomplete="off">
        </div>
        <div>
          <label for="an-pep">Condición PEP <span class="tenue" style="font-weight:400">(según su declaración)</span></label>
          <select id="an-pep">
            <option value="">No declara ser PEP</option>
            ${Object.entries(CONDICIONES_PEP).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
          </select>
        </div>
      </div>
    </form>
    <div id="fuentes-manuales"></div>
    <div class="tarjeta no-imprimir">
      <div class="acciones">
        <button type="button" class="accion" id="guardar-antecedentes">Guardar constancia</button>
      </div>
      <p class="tenue" style="margin:10px 0 0">
        Se guarda una entrada en el expediente con lo registrado en cada entidad y los archivos
        adjuntos, con fecha y hora.
      </p>
    </div>
  `;

  document.getElementById('an-tipo').addEventListener('change', pintarFuentes);
  pintarFuentes();

  document.getElementById('fuentes-manuales').addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-interpol]');
    if (boton) await consultarInterpol(boton);
  });

  document
    .getElementById('guardar-antecedentes')
    .addEventListener('click', guardarConstancia);
}

function pintarFuentes() {
  const tipo = document.getElementById('an-tipo').value;
  const condicionPep = document.getElementById('an-pep').value;
  const aplicables = FUENTES_MANUALES.filter((f) => f.aplica === 'ambos' || f.aplica === tipo);

  document.getElementById('fuentes-manuales').innerHTML = aplicables
    .map(
      (f) => `<div class="tarjeta" data-fuente="${esc(f.id)}">
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <h3 style="margin:0">${esc(f.nombre)}</h3>
            <p class="tenue" style="margin:.2em 0 0">${esc(f.entidad)}</p>
          </div>
          <a class="accion secundaria" style="text-decoration:none" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Abrir consulta →</a>
        </div>
        ${f.nota ? `<p class="tenue" style="margin:.7em 0 0">${esc(f.nota)}</p>` : ''}
        ${f.api ? `<div class="acciones"><button type="button" class="accion secundaria" data-interpol="${esc(f.id)}">Intentar consulta automática</button></div><div class="resultado-api"></div>` : ''}
        <div class="campos" style="margin-top:14px">
          <div>
            <label for="r-${esc(f.id)}">Resultado</label>
            <select id="r-${esc(f.id)}" data-resultado>
              <option value="">Sin registrar</option>
              ${RESULTADOS.map((r) => `<option value="${r.valor}">${r.texto}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="e-${esc(f.id)}">Evidencia (PDF o imagen)</label>
            <input type="file" id="e-${esc(f.id)}" data-evidencia accept=".pdf,image/*">
          </div>
        </div>
      </div>`,
    )
    .join('');
}

/**
 * INTERPOL publica una API abierta, pero no está pensada para llamarse desde
 * un navegador y suele bloquearla la política de origen cruzado. Se intenta;
 * si no responde, se dice claramente que hay que hacerlo a mano.
 */
async function consultarInterpol(boton) {
  const tarjeta = boton.closest('[data-fuente]');
  const salida = tarjeta.querySelector('.resultado-api');
  const nombre = document.getElementById('an-nombre').value.trim();
  if (!nombre) {
    salida.innerHTML = '<div class="aviso atencion">Escribe primero el nombre.</div>';
    return;
  }

  const partes = nombre.split(/\s+/);
  const url = new URL('https://ws-public.interpol.int/notices/v1/red');
  url.searchParams.set('forename', partes[0]);
  if (partes.length > 1) url.searchParams.set('name', partes[partes.length - 1]);
  url.searchParams.set('resultPerPage', '20');

  boton.disabled = true;
  salida.innerHTML = '<p class="tenue">Consultando…</p>';
  try {
    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    const total = datos.total ?? 0;
    const avisos = datos._embedded?.notices || [];
    salida.innerHTML = total
      ? `<div class="aviso atencion"><strong>${total} notificación(es) roja(s) con nombre parecido.</strong>
           <ul style="margin:.5em 0 0;padding-left:1.2em">${avisos
             .slice(0, 10)
             .map((n) => `<li>${esc([n.forename, n.name].filter(Boolean).join(' '))}${n.nationalities ? ` — ${esc(n.nationalities.join(', '))}` : ''}</li>`)
             .join('')}</ul>
           <p style="margin:.6em 0 0">Verifica cada caso en el sitio de INTERPOL antes de concluir.</p></div>`
      : '<div class="aviso info">Sin notificaciones rojas con ese nombre.</div>';
  } catch (error) {
    salida.innerHTML = `<div class="aviso atencion">
      No se pudo consultar desde el navegador (${esc(error.message)}). INTERPOL no habilita
      su API para páginas web, así que esta consulta hay que hacerla en su sitio con el botón de arriba.
    </div>`;
  } finally {
    boton.disabled = false;
  }
}

async function guardarConstancia() {
  const nombre = document.getElementById('an-nombre').value.trim();
  const documento = document.getElementById('an-doc').value.trim();
  const tipo = document.getElementById('an-tipo').value;
  const condicionPep = document.getElementById('an-pep').value;

  if (!nombre && !documento) {
    alert('Escribe al menos un nombre o un número de documento.');
    return;
  }

  const idConsulta = nuevoId('a');
  const revisiones = [];
  const evidencias = [];

  for (const tarjeta of document.querySelectorAll('#fuentes-manuales [data-fuente]')) {
    const idFuente = tarjeta.dataset.fuente;
    const fuente = FUENTES_MANUALES.find((f) => f.id === idFuente);
    const resultado = tarjeta.querySelector('[data-resultado]').value;
    const archivo = tarjeta.querySelector('[data-evidencia]').files[0] || null;
    if (!resultado && !archivo) continue;

    revisiones.push({
      fuente: idFuente,
      nombre: fuente.nombre,
      entidad: fuente.entidad,
      url: fuente.url,
      resultado: resultado || 'SIN_REGISTRAR',
      conEvidencia: Boolean(archivo),
      // El nombre del archivo va en la constancia: un auditor tiene que poder
      // pedir un documento concreto, no "el adjunto".
      archivo: archivo ? archivo.name : '',
    });

    if (archivo) {
      evidencias.push({
        id: nuevoId('e'),
        consultaId: idConsulta,
        fuente: idFuente,
        nombreArchivo: archivo.name,
        tipoArchivo: archivo.type,
        bytes: archivo.size,
        fecha: new Date().toISOString(),
        archivo,
      });
    }
  }

  if (!revisiones.length) {
    alert('Registra el resultado de al menos una entidad antes de guardar.');
    return;
  }

  // El resultado global es el peor de los registrados: si una entidad reporta
  // hallazgos, la constancia entera queda en alerta.
  const orden = ['SIN_REGISTRAR', 'NO_APLICA', 'SIN_HALLAZGOS', 'EN_REVISION', 'ALERTA'];
  const peor = revisiones.reduce(
    (acc, r) => (orden.indexOf(r.resultado) > orden.indexOf(acc) ? r.resultado : acc),
    'SIN_HALLAZGOS',
  );
  const resultado = ['ALERTA', 'EN_REVISION'].includes(peor) ? peor : 'SIN_HALLAZGOS';

  await guardar(ALMACENES.consultas, {
    id: idConsulta,
    fecha: new Date().toISOString(),
    tipo: 'antecedentes',
    consulta: { nombre, documento, tipoDocumento: tipo === 'empresa' ? 'NIT' : '' },
    nombreNormalizado: normalizarNombre(nombre),
    documentoNormalizado: normalizarDocumento(documento),
    resultado,
    revisiones,
    pep: Boolean(condicionPep),
    pepDetalle: etiquetaPEP(condicionPep),
    coincidencias: [],
    listas: [],
    responsable: estado.config.responsable || '',
    cruceId: null,
  });
  await guardarVarios(ALMACENES.evidencias, evidencias);
  registroCambio();

  alert(
    `Constancia guardada con ${revisiones.length} entidad(es)` +
      `${evidencias.length ? ` y ${evidencias.length} evidencia(s) adjunta(s)` : ''}.`,
  );
  document.getElementById('formulario-antecedentes').reset();
  pintarFuentes();
}

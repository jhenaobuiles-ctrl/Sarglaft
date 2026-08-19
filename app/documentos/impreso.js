// Versión imprimible de un documento del catálogo.
//
// Un mismo renderizador sirve para los catorce formatos porque todos se
// declaran igual en plantillas.js. Lo que cambia entre ellos es el contenido,
// no la forma de imprimirlo.
//
// Las casillas de verificación se imprimen todas, marcadas y sin marcar. Es
// deliberado: en una revisión importa tanto lo que se respondió como lo que
// se preguntó, y una lista donde solo salen las respuestas afirmativas no
// deja ver si la pregunta llegó a hacerse.

import { esc, fechaCorta, fechaHora } from '../ui/formato.js';

const MARCADA = '&#9745;';
const VACIA = '&#9744;';

export function documentoHTML(documento, plantilla, perfil = {}) {
  const valores = documento.valores || {};
  return `
    <header class="cert-encabezado">
      <div>
        <h1>${esc(plantilla.nombre)}</h1>
        <p class="tenue">${esc(perfil.empresa || '')}${
          perfil.nit ? ` · NIT ${esc(perfil.nit)}` : ''
        }</p>
      </div>
      <div class="cert-sello etiqueta neutra">${esc(fechaCorta(documento.fecha))}</div>
    </header>

    ${plantilla.secciones.map((seccion) => seccionHTML(seccion, valores)).join('\n')}

    ${declaracionesHTML(plantilla)}

    ${
      documento.observaciones
        ? `<section><h2>Observaciones</h2><p>${parrafos(documento.observaciones)}</p></section>`
        : ''
    }

    <section class="cert-nota">
      ${firmasHTML(plantilla, perfil)}
      <p style="margin-top:22px">
        Documento generado por el panel SARLAFT de ${esc(perfil.empresa || 'la empresa')} el
        ${esc(fechaHora(documento.fecha))} (hora de Colombia). Identificador
        <span class="mono">${esc(documento.id)}</span>.
        ${perfil.marcoNormativo ? `<br>${esc(perfil.marcoNormativo)}` : ''}
      </p>
    </section>
  `;
}

function seccionHTML(seccion, valores) {
  const tablas = seccion.campos.filter((c) => c.tipo === 'tabla');
  const anchos = seccion.campos.filter((c) => c.tipo === 'area' || c.tipo === 'casillas');
  const simples = seccion.campos.filter(
    (c) => c.tipo !== 'tabla' && c.tipo !== 'area' && c.tipo !== 'casillas',
  );

  const partes = [];
  if (simples.length) {
    partes.push(
      `<dl class="cert-datos">${simples
        .map((c) => `<dt>${esc(c.etiqueta)}</dt><dd>${valorSimple(valores[c.id])}</dd>`)
        .join('')}</dl>`,
    );
  }
  for (const campo of anchos) {
    partes.push(
      `<div class="doc-bloque">
        <h3>${esc(campo.etiqueta)}</h3>
        ${campo.tipo === 'area' ? `<p>${parrafos(valores[campo.id])}</p>` : casillasHTML(campo, valores[campo.id])}
      </div>`,
    );
  }
  for (const campo of tablas) partes.push(tablaHTML(campo, valores[campo.id]));

  return `<section>
    <h2>${esc(seccion.titulo)}</h2>
    ${seccion.nota ? `<p class="tenue">${esc(seccion.nota)}</p>` : ''}
    ${partes.join('\n')}
  </section>`;
}

function valorSimple(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '<span class="tenue">—</span>';
  // Una fecha ISO sin hora se imprime en formato colombiano; el resto, literal.
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? esc(fechaCorta(texto)) : esc(texto);
}

function parrafos(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return '<span class="tenue">—</span>';
  return esc(limpio).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
}

function casillasHTML(campo, valor) {
  const marcadas = new Set(Array.isArray(valor) ? valor : []);
  return `<ul class="doc-casillas">${(campo.opciones || [])
    .map(
      (opcion) =>
        `<li>${marcadas.has(opcion) ? MARCADA : VACIA} ${esc(opcion)}</li>`,
    )
    .join('')}</ul>`;
}

function tablaHTML(campo, valor) {
  const filas = (Array.isArray(valor) ? valor : []).filter((fila) =>
    Object.values(fila || {}).some((v) => String(v ?? '').trim()),
  );
  // Sin filas, se imprime la cuadrícula en blanco: el acta de capacitación se
  // firma a mano y la lista de asistencia tiene que caber en el papel.
  const cuantas = filas.length || campo.filas || 3;

  return `<div class="doc-bloque">
    <h3>${esc(campo.etiqueta)}</h3>
    <table class="doc-tabla">
      <thead><tr>${campo.columnas.map((c) => `<th>${esc(c.etiqueta)}</th>`).join('')}</tr></thead>
      <tbody>
        ${Array.from({ length: cuantas }, (unused, i) => {
          const fila = filas[i] || {};
          return `<tr>${campo.columnas
            .map((c) => `<td>${esc(fila[c.id] || '')}</td>`)
            .join('')}</tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function declaracionesHTML(plantilla) {
  if (!plantilla.declaraciones?.length) return '';
  return `<section>
    <h2>Declaraciones</h2>
    ${plantilla.declaraciones.map((d) => `<p>${esc(d)}</p>`).join('')}
  </section>`;
}

function firmasHTML(plantilla, perfil) {
  const firmas = plantilla.firmas || [];
  if (!firmas.length) return '';
  return `<div class="doc-firmas">
    ${firmas
      .map(
        (f) => `<div class="cert-firma">
          <span></span>
          <p><strong>${esc(f.rotulo)}</strong><br>${
            f.desdePerfil && perfil.responsable
              ? `${esc(perfil.responsable)}${perfil.cargo ? `<br>${esc(perfil.cargo)}` : ''}`
              : `<span class="tenue">${esc(f.pie || '')}</span>`
          }</p>
        </div>`,
      )
      .join('')}
  </div>`;
}

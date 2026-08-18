// Parser XML mínimo, sin dependencias.
//
// No pretende ser un parser XML completo: está hecho para los documentos que
// publican la ONU, OFAC y la UE, que son generados por máquina, bien formados,
// sin espacios de nombres y sin contenido mixto. A cambio de esa suposición el
// repo entero se queda en cero dependencias y el parser se puede probar contra
// fixtures commiteadas.

const ENTIDADES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Expande entidades XML predefinidas y referencias numéricas. */
export function desescapar(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (todo, cuerpo) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X'
        ? parseInt(cuerpo.slice(2), 16)
        : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
    }
    const valor = ENTIDADES[cuerpo];
    return valor === undefined ? todo : valor;
  });
}

function nuevoNodo(nombre) {
  return { nombre, attrs: null, hijos: [], texto: '' };
}

/**
 * Convierte un documento XML en un árbol de nodos.
 * @returns {{nombre: string, attrs: Object|null, hijos: Array, texto: string}}
 */
export function parsearXML(texto) {
  // El BOM rompe la detección del primer '<'.
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const raiz = nuevoNodo('#documento');
  const pila = [raiz];
  const n = texto.length;
  let i = 0;

  while (i < n) {
    const abre = texto.indexOf('<', i);

    if (abre === -1) break;

    if (abre > i) {
      const cima = pila[pila.length - 1];
      const crudo = texto.slice(i, abre);
      // Ignoramos el sangrado entre etiquetas; solo guardamos texto con
      // contenido real.
      if (crudo.trim() !== '') cima.texto += desescapar(crudo);
    }

    // <!-- comentario -->, <![CDATA[...]]>, <!DOCTYPE ...>
    if (texto.startsWith('<!--', abre)) {
      const fin = texto.indexOf('-->', abre + 4);
      i = fin === -1 ? n : fin + 3;
      continue;
    }
    if (texto.startsWith('<![CDATA[', abre)) {
      const fin = texto.indexOf(']]>', abre + 9);
      const cima = pila[pila.length - 1];
      cima.texto += texto.slice(abre + 9, fin === -1 ? n : fin);
      i = fin === -1 ? n : fin + 3;
      continue;
    }
    if (texto.startsWith('<!', abre)) {
      i = saltarDeclaracion(texto, abre);
      continue;
    }
    // <?xml ... ?>
    if (texto.startsWith('<?', abre)) {
      const fin = texto.indexOf('?>', abre + 2);
      i = fin === -1 ? n : fin + 2;
      continue;
    }

    // </cierre>
    if (texto[abre + 1] === '/') {
      const fin = texto.indexOf('>', abre + 2);
      if (fin === -1) break;
      if (pila.length > 1) pila.pop();
      i = fin + 1;
      continue;
    }

    // <apertura ...> o <apertura .../>
    const fin = buscarFinEtiqueta(texto, abre + 1);
    if (fin === -1) break;

    const cuerpo = texto.slice(abre + 1, fin);
    const autoCerrada = cuerpo.endsWith('/');
    const interior = autoCerrada ? cuerpo.slice(0, -1) : cuerpo;

    let corte = interior.length;
    for (let k = 0; k < interior.length; k++) {
      const c = interior.charCodeAt(k);
      // espacio, \t, \n, \r
      if (c === 32 || c === 9 || c === 10 || c === 13) {
        corte = k;
        break;
      }
    }

    const nodo = nuevoNodo(interior.slice(0, corte));
    if (corte < interior.length) {
      nodo.attrs = parsearAtributos(interior.slice(corte));
    }

    pila[pila.length - 1].hijos.push(nodo);
    if (!autoCerrada) pila.push(nodo);

    i = fin + 1;
  }

  return raiz;
}

// El '>' de cierre no cuenta si está dentro de un valor de atributo.
function buscarFinEtiqueta(texto, desde) {
  let comilla = 0;
  for (let k = desde; k < texto.length; k++) {
    const c = texto[k];
    if (comilla) {
      if (c === comilla) comilla = 0;
    } else if (c === '"' || c === "'") {
      comilla = c;
    } else if (c === '>') {
      return k;
    }
  }
  return -1;
}

// <!DOCTYPE ...> puede llevar un subconjunto interno entre corchetes.
function saltarDeclaracion(texto, abre) {
  let profundidad = 0;
  for (let k = abre + 2; k < texto.length; k++) {
    const c = texto[k];
    if (c === '[') profundidad++;
    else if (c === ']') profundidad--;
    else if (c === '>' && profundidad <= 0) return k + 1;
  }
  return texto.length;
}

function parsearAtributos(s) {
  const attrs = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1]] = desescapar(m[3] !== undefined ? m[3] : m[4]);
  }
  return attrs;
}

/* ---------- helpers de navegación ---------- */

/** Primer hijo directo con ese nombre, o null. */
export function hijo(nodo, nombre) {
  if (!nodo) return null;
  for (const h of nodo.hijos) if (h.nombre === nombre) return h;
  return null;
}

/** Todos los hijos directos con ese nombre. */
export function hijos(nodo, nombre) {
  if (!nodo) return [];
  return nodo.hijos.filter((h) => h.nombre === nombre);
}

/**
 * Desciende por una ruta de nombres y devuelve los nodos del último tramo.
 * ruta('sdnEntry', 'idList', 'id') -> todos los <id> bajo <idList>.
 */
export function ruta(nodo, ...nombres) {
  let actuales = [nodo].filter(Boolean);
  for (const nombre of nombres) {
    const siguiente = [];
    for (const a of actuales) {
      for (const h of a.hijos) if (h.nombre === nombre) siguiente.push(h);
    }
    actuales = siguiente;
  }
  return actuales;
}

/** Texto de un hijo directo, ya recortado. Cadena vacía si no existe. */
export function texto(nodo, nombre) {
  const h = hijo(nodo, nombre);
  return h ? h.texto.trim() : '';
}

/** Textos de todos los hijos directos con ese nombre, sin vacíos. */
export function textos(nodo, nombre) {
  return hijos(nodo, nombre)
    .map((h) => h.texto.trim())
    .filter(Boolean);
}

/** Busca en profundidad el primer nodo con ese nombre. */
export function buscar(nodo, nombre) {
  if (!nodo) return null;
  const cola = [...nodo.hijos];
  while (cola.length) {
    const actual = cola.shift();
    if (actual.nombre === nombre) return actual;
    for (const h of actual.hijos) cola.push(h);
  }
  return null;
}

/**
 * Todos los nodos con ese nombre a cualquier profundidad.
 *
 * Los parsers usan esto en vez de rutas fijas a propósito: las fuentes
 * reorganizan sus envoltorios entre publicaciones (OFAC ya lo hizo al menos
 * una vez) y una ruta rígida convertiría ese cambio en una lista vacía, o sea
 * en un "sin hallazgos" falso.
 */
export function buscarTodos(nodo, nombre) {
  const salida = [];
  if (!nodo) return salida;
  // Recorrido en profundidad respetando el orden del documento: los hijos se
  // apilan al revés para que `pop` los devuelva en el orden en que aparecen.
  // El orden importa — el primer alias de OFAC es el fuerte, y las
  // identificaciones se muestran en el certificado tal como las publica la
  // fuente.
  const pila = [];
  for (let i = nodo.hijos.length - 1; i >= 0; i--) pila.push(nodo.hijos[i]);
  while (pila.length) {
    const actual = pila.pop();
    if (actual.nombre === nombre) salida.push(actual);
    for (let i = actual.hijos.length - 1; i >= 0; i--) pila.push(actual.hijos[i]);
  }
  return salida;
}

/** Valor de un atributo, o cadena vacía. */
export function attr(nodo, nombre) {
  if (!nodo || !nodo.attrs) return '';
  const v = nodo.attrs[nombre];
  return v === undefined ? '' : String(v).trim();
}

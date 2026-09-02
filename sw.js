// Service worker: deja el panel utilizable sin conexión.
//
// Nota sobre el alcance: abrir el index.html con doble clic (file://) no
// funciona, porque el navegador bloquea los módulos ES y fetch en ese
// protocolo. El modo sin conexión se consigue así: visitando el panel una vez
// con conexión y volviendo a abrirlo después, ya sin ella.

const CACHE = 'sarglaft-app-v9';

// Las listas no se precargan aquí: pesan decenas de MB y las gestiona el
// cargador con su propia caché por sha256.
const ARMAZON = [
  './',
  './index.html',
  './app/estilos.css',
  './app/ui/app.js',
  './app/ui/formato.js',
  './app/ui/panel.js',
  './app/ui/consulta.js',
  './app/ui/cruce.js',
  './app/ui/revision.js',
  './app/ui/antecedentes.js',
  './app/ui/documentos.js',
  './app/ui/contrapartes.js',
  './app/ui/expediente.js',
  './app/ui/listas.js',
  './app/ui/obligaciones.js',
  './app/ui/certificado.js',
  './app/ui/desenlace.js',
  './app/motor/normalizar.js',
  './app/motor/scoring.js',
  './app/motor/indice.js',
  './app/motor/consulta.js',
  './app/datos/cargador.js',
  './app/datos/frescura.js',
  './app/documentos/plantillas.js',
  './app/documentos/impreso.js',
  './app/registro/contrapartes.js',
  './app/registro/db.js',
  './app/registro/respaldo.js',
  './app/lib/csv.js',
  './app/lib/pegado.js',
  './app/lib/zip.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARMAZON)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Las listas y el manifiesto los maneja el cargador: si el service worker
  // también los guardara, una lista actualizada quedaría escondida detrás de
  // una copia vieja.
  if (url.pathname.includes('/data/listas/')) return;

  // Red primero para el armazón, con la copia como respaldo: así una versión
  // nueva del panel llega sin tener que borrar la caché a mano.
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(peticion, copia)).catch(() => {});
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((r) => r || caches.match('./index.html'))),
  );
});

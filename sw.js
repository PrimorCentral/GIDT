// ---------------------------------------------------------------
// Service Worker de GIDT
// Estrategia "network-first": siempre intenta traer la versión más
// reciente de cada archivo desde la red; solo recurre a la caché
// como respaldo si no hay conexión. Así, la detección de nuevas
// versiones (ver js/actualizaciones.js) no depende de que el propio
// sw.js cambie de bytes entre despliegues.
// ---------------------------------------------------------------
const CACHE_NAME = 'gidt-shell-v1';

const ASSETS_ESENCIALES = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_ESENCIALES))
      .catch(() => {}) // si falla el precache no bloqueamos la instalación
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // version.json nunca se sirve desde caché: tiene que llegar siempre fresco
  // para que la detección de actualizaciones funcione.
  if (event.request.url.includes('version.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia)).catch(() => {});
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});

// Permite forzar la activación inmediata de un SW en espera si se
// necesitara en el futuro (no imprescindible con skipWaiting arriba,
// pero se deja preparado).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

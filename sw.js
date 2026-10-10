/* Service worker de MiniArcade.
   - Código propio (HTML/JS/CSS/registro): network-first → siempre la última versión si hay red;
     sin red, la copia en caché. Así un deploy nuevo nunca queda tapado por la caché.
   - Recursos inmutables (Three.js versionado de cdnjs, fuentes, imágenes): cache-first.
   Subir VERSION invalida las cachés viejas. */
const VERSION = 'ml-v4';
const CORE = `${VERSION}-core`, STATIC = `${VERSION}-static`;
const PRECACHE = ['./', 'index.html', 'matelabs/arcade.js', 'matelabs/intro.js', 'matelabs/portal.js', 'matelabs/catalog.js',
  'games/registry.js', 'matelabs/missions.js', 'matelabs/characters.js', 'matelabs/mascota.webp', 'matelabs/mascota-128.webp', 'matelabs/favicon.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isImmutable = url => /\/vendor\/[^/]+-r?\d/.test(url.pathname) || /cdnjs\.cloudflare\.com\/ajax\/libs\/.+\/r?\d/.test(url.href) || /fonts\.(gstatic|googleapis)\.com/.test(url.host) || /\.(webp|png|jpg|svg|woff2?|glb)$/.test(url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isImmutable(url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(STATIC).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CORE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});

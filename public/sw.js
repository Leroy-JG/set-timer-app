// Service worker minimal : l'application fonctionne hors ligne après la première visite.
// Les fichiers de l'application (JS, icônes…) sont mis en cache à la volée ; la navigation retombe sur index.html.
const CACHE = 'st-cache-v1'; // à incrémenter si une icône change (les icônes sont servies depuis le cache)

// À l'installation : on met en cache la page ET les scripts qu'elle référence, pour que la première visite
// suffise à fonctionner hors ligne (sans dépendre du cache HTTP du navigateur).
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'reload' });
  const html = await res.clone().text();
  await cache.put('./', res);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], self.location).href);
  await cache.addAll(['manifest.webmanifest', 'icon-192.png', 'icon-512.png', ...scripts]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Réseau d'abord (nouvelle version), cache si hors ligne.
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Lien direct vers une page interne (404 côté serveur) : on sert l'application en cache.
          if (!res.ok) return caches.match('./').then((hit) => hit || res);
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // Fichiers versionnés : cache d'abord, puis réseau (et mise en cache).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

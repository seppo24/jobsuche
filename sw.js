// Offline-Hülle der App. Bei jeder Version die CACHE-Nummer hochzählen (zusammen mit VERSION in js/changelog.js).
const CACHE = 'jobsuche-1.0.22';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'lib/jszip.min.js', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/util.js', 'js/ui.js', 'js/store.js', 'js/dropbox.js', 'js/search.js', 'js/docs.js', 'js/files.js', 'js/importers.js', 'js/xlsxread.js', 'js/portals.js', 'js/changelog.js', 'js/install.js',
  'js/views/jobs.js', 'js/views/employers.js', 'js/views/applications.js', 'js/views/documents.js', 'js/views/info.js', 'js/views/tailor.js', 'js/views/discover.js', 'js/salary.js', 'js/zeugnis.js', 'data/seed-employers.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))); });
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Dropbox, GitHub, Anthropic: immer live
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

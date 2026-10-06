/* ============================================================
   SERVICE WORKER — HoTroHocTap PWA
   - Cache static assets
   - Nhận message từ page để hiện notification
   - Click notification → focus app
   ============================================================ */

const CACHE = 'hoctrohoctap-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './js/core.js',
  './js/pdf.js',
  './js/formulas.js',
  './js/notify.js',
  './js/main.js',
  './js/features/note.js',
  './js/features/flashcard.js',
  './js/features/pomodoro.js',
  './js/features/stats.js',
  './js/features/todo.js',
  './js/features/exam.js',
  './js/features/dictionary.js',
  './js/features/tts.js',
  './js/features/chat.js',
  './js/features/mindmap.js'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(url => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');
  const isJS = url.pathname.endsWith('.js');
  const isCSS = url.pathname.endsWith('.css');
  const isJSON = url.pathname.endsWith('.json');

  if (isHTML || isJS || isCSS || isJSON) {
    /* Network-first */
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    /* Cache-first */
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).catch(() => cached))
    );
  }
});

/* ---------- MESSAGE từ page ---------- */
self.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'show-notification') {
    const { title, options } = e.data;
    self.registration.showNotification(title, options || {});
  }
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(location.origin) && 'focus' in c) {
          c.postMessage({ type: 'notify-click', data: e.notification.data || {} });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
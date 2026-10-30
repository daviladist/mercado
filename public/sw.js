/* Service worker: permite instalar o app no celular e abrir o CAIXA (PDV) sem internet.
   Guarda só os arquivos do app (a tela). Dados e respostas da API NUNCA são guardados aqui:
   o catálogo do caixa fica guardado pela própria tela, sem custo nem margem. */
const CACHE = 'tino-app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>Sem internet</h2><p>O app precisa de internet para funcionar. Confira a conexão e tente de novo.</p><button onclick="location.reload()" style="padding:12px 20px;font-size:16px">Tentar de novo</button></body>';
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) return;                 // dados: sempre do servidor, nunca guardados
  const isPdv = /^(\/t\/[a-z0-9-]{1,40})?\/pdv\/?$/.test(u.pathname);
  const isApp = u.pathname === '/app.js';
  // internet primeiro; sem internet, só o caixa (e o código dele) abre pelo que ficou guardado
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (isPdv || isApp)) { const c = r.clone(); caches.open(CACHE).then(k => k.put(isApp ? '/app.js' : u.pathname, c)); }
    return r;
  }).catch(() => caches.open(CACHE).then(k => k.match(isApp ? '/app.js' : u.pathname)).then(r => r || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }))));
});
// a tela do caixa pede para guardar a própria página e o código (na 1ª visita o service worker ainda não existia)
self.addEventListener('message', e => {
  const L = (e.data && Array.isArray(e.data.guardar) ? e.data.guardar : []).filter(p => p === '/app.js' || /^(\/t\/[a-z0-9-]{1,40})?\/pdv\/?$/.test(p));
  if (L.length) e.waitUntil(caches.open(CACHE).then(k => Promise.all(L.map(p => fetch(p, { cache: 'no-store' }).then(r => r.ok && k.put(p, r)).catch(() => {})))));
});

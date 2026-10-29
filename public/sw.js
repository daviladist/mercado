/* Service worker mínimo: permite instalar o app no celular.
   Não guarda nada no aparelho (nem dados, nem respostas da API): tudo vem sempre do servidor. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>Sem internet</h2><p>O app precisa de internet para funcionar. Confira a conexão e tente de novo.</p><button onclick="location.reload()" style="padding:12px 20px;font-size:16px">Tentar de novo</button></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 })));
});

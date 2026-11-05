/* Interruptor de modo claro/escuro. Sem escolha, segue o celular. A escolha fica guardada só neste aparelho.
   Serve a todas as telas: se a página já tem o botão #tema (Controle de caixa), usa ele; nas outras, cria o botão no cabeçalho. */
(function () {
  var K = 'tino-tema', R = document.documentElement, mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function lido() { try { var v = localStorage.getItem(K); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function escuro() { var t = R.getAttribute('data-theme'); return t ? t === 'dark' : !!(mq && mq.matches); }
  function cor() {
    var m = document.querySelectorAll('meta[name=theme-color]'); if (!m.length) return;
    var c = escuro() ? '#0E1116' : '#FFFFFF';
    for (var i = 0; i < m.length; i++) { m[i].removeAttribute('media'); if (i) m[i].remove(); }
    m[0].setAttribute('content', c);
  }
  var t0 = lido(); if (t0) R.setAttribute('data-theme', t0);
  function pinta() { document.querySelectorAll('#tema').forEach(function (b) { b.setAttribute('aria-checked', escuro() ? 'true' : 'false'); b.title = escuro() ? 'Modo escuro ligado' : 'Modo claro ligado'; }); cor(); }
  var SVG = '<span class="tr"><span class="th"><svg class="sol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="lua" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></span></span>';
  var CSS = '.tema{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;padding:0 4px;min-height:40px;color:var(--muted,#667);cursor:pointer;flex:none}' +
    '.tema .tr{position:relative;width:42px;height:24px;border-radius:99px;background:var(--line,#ddd);border:1px solid var(--input,#bbb);transition:background .15s;box-sizing:border-box}' +
    '.tema .th{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--surface,#fff);box-shadow:0 1px 2px rgba(16,24,40,.3);display:grid;place-items:center;transition:transform .15s}' +
    '.tema .th svg{width:12px;height:12px;fill:none;stroke:var(--ink,var(--fg,#111));stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '.tema .th .lua{display:none}.tema[aria-checked=true] .tr{background:var(--brand,#1F3D2B);border-color:var(--brand,#1F3D2B)}' +
    '.tema[aria-checked=true] .th{transform:translateX(18px)}.tema[aria-checked=true] .th .sol{display:none}.tema[aria-checked=true] .th .lua{display:block}' +
    '@media (prefers-reduced-motion:reduce){.tema .tr,.tema .th{transition:none}}';
  function alvo() {
    return document.querySelector('.hd .in') || document.querySelector('body > header .in') || document.getElementById('topbar') || document.querySelector('body > header');
  }
  function monta() {
    if (document.getElementById('tema')) return;
    var a = alvo(); if (!a) return;
    if (!document.getElementById('tema-css')) { var s = document.createElement('style'); s.id = 'tema-css'; s.textContent = CSS; document.head.appendChild(s); }
    var b = document.createElement('button'); b.className = 'tema'; b.id = 'tema'; b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', 'Modo escuro'); b.innerHTML = SVG;
    var primeiro = a.querySelector('button, .who');
    if (primeiro && primeiro.parentNode === a) a.insertBefore(b, primeiro); else a.appendChild(b);
    pinta();
  }
  // cabeçalhos que o app redesenha (ex.: barra do atacado): recoloca o botão se sumir
  var espera = 0;
  function vigia() {
    if (!window.MutationObserver) return;
    new MutationObserver(function () { if (espera) return; espera = setTimeout(function () { espera = 0; monta(); }, 80); }).observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#tema') : null; if (!b) return;
    var novo = escuro() ? 'light' : 'dark';
    R.setAttribute('data-theme', novo);
    try { localStorage.setItem(K, novo); } catch (er) { /* sem guardar: vale até fechar */ }
    pinta();
  });
  document.addEventListener('DOMContentLoaded', function () { monta(); pinta(); vigia(); });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!lido()) pinta(); });
})();

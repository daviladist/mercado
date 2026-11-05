/* Interruptor de modo claro/escuro. Sem escolha, segue o celular. A escolha fica guardada só neste aparelho. */
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
  function pinta() { var b = document.getElementById('tema'); if (b) { b.setAttribute('aria-checked', escuro() ? 'true' : 'false'); b.title = escuro() ? 'Modo escuro ligado' : 'Modo claro ligado'; } cor(); }
  document.addEventListener('DOMContentLoaded', function () {
    pinta();
    var b = document.getElementById('tema'); if (!b) return;
    b.addEventListener('click', function () {
      var novo = escuro() ? 'light' : 'dark';
      R.setAttribute('data-theme', novo);
      try { localStorage.setItem(K, novo); } catch (e) { /* sem guardar: vale até fechar */ }
      pinta();
    });
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!lido()) pinta(); });
})();

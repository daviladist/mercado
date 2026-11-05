/* Tela firme, como um aplicativo: sem zoom por toque duplo nem por pinça.
   (O toque duplo não é interceptado: só o navegador deixa de dar zoom, então cliques rápidos em + e − continuam valendo.) */
(function () {
  var TA = 'pan-x pan-y';
  function trava() { document.documentElement.style.touchAction = TA; if (document.body) document.body.style.touchAction = TA; }
  trava(); document.addEventListener('DOMContentLoaded', trava);
  // Safari do iPhone ignora user-scalable=no: a pinça chega como "gesture"
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (e) { document.addEventListener(e, function (ev) { ev.preventDefault(); }, { passive: false }); });
  // dois dedos na tela = pinça: não deixa virar zoom (a rolagem com um dedo segue normal)
  document.addEventListener('touchmove', function (ev) { if (ev.touches && ev.touches.length > 1) ev.preventDefault(); }, { passive: false });
})();

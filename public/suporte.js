'use strict';
/* Tino — aviso do "modo suporte": aparece quando o dono do sistema entrou pela Central
   ("Entrar como esta empresa"). Mostra até quando vale e um botão para sair. */
(function () {
  const m = /^\/t\/([a-z0-9-]{1,40})(?:\/|$)/.exec(location.pathname);
  const slug = m ? m[1] : '@';
  let bar = null, fim = null, tique = null;
  function hora(iso) { const d = new Date(iso); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  // o aviso fica por cima: os cabeçalhos que grudam no topo descem a altura dele (senão o menu some ao rolar)
  function ajusta(h) {
    // o atacado já recua o corpo por --sat (que passa a incluir o aviso); rural e loja recuam pelo aviso
    const usaSat = !!getComputedStyle(document.documentElement).getPropertyValue('--sat').trim() && getComputedStyle(document.body).paddingTop !== '0px';
    if (!usaSat || !h) document.body.style.paddingTop = h ? h + 'px' : '';
    if (h) document.documentElement.style.setProperty('--sat', 'calc(env(safe-area-inset-top, 0px) + ' + h + 'px)'); else document.documentElement.style.removeProperty('--sat');
    let st = document.getElementById('sup-css');
    if (!h) { if (st) st.remove(); return; }
    if (!st) { st = document.createElement('style'); st.id = 'sup-css'; document.head.appendChild(st); }
    st.textContent = '.hd{top:' + h + 'px !important}';
  }
  function esconde() { if (bar) { bar.remove(); bar = null; ajusta(0); } clearInterval(tique); tique = null; }
  function mostra(me) {
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#B3261E;color:#fff;font:600 14px/1.3 system-ui,sans-serif;padding:8px 12px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.25)';
      const t = document.createElement('span'); t.className = 'sup-t';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Sair do suporte';
      b.style.cssText = 'background:#fff;color:#B3261E;border:0;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', sair);
      bar.appendChild(t); bar.appendChild(b);
      document.body.appendChild(bar);
    }
    bar.querySelector('.sup-t').textContent = '🛟 Modo suporte: você está como administrador desta empresa' + (me.ate ? ' · até ' + hora(me.ate) : '') + '. Tudo fica registrado.';
    ajusta(bar.offsetHeight);
    // só confere de novo quem está no suporte (os outros não fazem chamada nenhuma a mais)
    if (!tique) tique = setInterval(confere, 60000);
    clearTimeout(fim);
    const ms = new Date(me.ate).getTime() - Date.now();
    if (ms > 0 && ms < 2 * 3600e3) fim = setTimeout(() => location.reload(), ms + 1000);
  }
  async function sair() {
    // sai só se a sessão deste navegador ainda for a do suporte desta empresa (não derruba outro login que abriu depois)
    let me = null;
    try { const r = await fetch('/api/me', { credentials: 'same-origin', headers: { 'X-Tenant': slug } }); me = r.ok ? await r.json() : null; } catch (e) { /* segue */ }
    if (me && me.suporte) try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-App': '1', 'X-Tenant': slug }, body: '{}' }); } catch (e) { /* segue */ }
    location.href = '/central';
  }
  async function confere() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin', headers: { 'X-Tenant': slug } });
      const me = r.ok ? await r.json() : null;
      if (me && me.suporte) mostra(me); else esconde();
    } catch (e) { /* sem conexão: deixa como está */ }
  }
  confere();
})();

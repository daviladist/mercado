'use strict';
/* Gerador de Encartes dentro do Tino: entrar, trocar senha, equipe, e a ponte que troca a nuvem do Claude
   (claude.use: db, assets, user) pelas rotas do Tino (/api/encartes/*). Só depois de entrar o app é carregado. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }
  async function api(path, body) {
    const h = { 'X-App': '1', 'X-Tenant': slug || '@' };
    const opt = body === undefined ? { credentials: 'same-origin', headers: h } : { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem internet. Confira a conexão e tente de novo.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status, login: !!j.login, mustReset: !!j.mustReset, code: r.status === 413 ? 'invalid_argument' : undefined });
    return j;
  }
  let ME = null;
  const enc = encodeURIComponent;
  const doc = p => ({
    get: async () => { const r = await api('/api/encartes/doc?p=' + enc(p)); return { exists: !!r.exists, data: () => r.data }; },
    set: async d => { await api('/api/encartes/doc', { p, data: d }); },
    delete: async () => { await api('/api/encartes/doc', { p, del: true }); }
  });
  const db = { doc, collection: pre => ({ get: async () => { const r = await api('/api/encartes/col?p=' + enc(pre)); return { docs: r.docs.map(x => ({ id: x.p, data: () => x.data })) }; } }) };
  const toDataURL = b => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(b); });
  const assets = { upload: async blob => { const r = await api('/api/encartes/blob', { data: await toDataURL(blob) }); return { id: r.id }; } };
  const user = { id: async () => ME.id, isOwner: () => !!ME.dono };
  window.ENC_BLOB = '/api/encartes/blob?id=';
  window.TINO = { api, slug };

  /* ---------- telas de entrar ---------- */
  const box = (inner) => { let o = $('#tinoGate'); if (!o) { o = document.createElement('div'); o.id = 'tinoGate'; document.body.appendChild(o); } o.innerHTML = '<div class="tg">' + inner + '</div>'; return o; };
  const st = document.createElement('style');
  st.textContent = '#tinoGate{position:fixed;inset:0;z-index:9999;background:#16181d;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}' +
    '#tinoGate .tg{background:#fff;border-radius:14px;padding:22px;width:100%;max-width:380px}#tinoGate h1{font:700 22px Oswald,Inter,sans-serif;text-transform:uppercase;margin:0 0 4px}' +
    '#tinoGate label{display:block;font-weight:600;font-size:13px;margin:12px 0 4px}#tinoGate input[type=text],#tinoGate input[type=password]{width:100%;font-size:16px;padding:11px;border:1px solid #cfcac0;border-radius:8px;box-sizing:border-box}' +
    '#tinoGate button{width:100%;margin-top:14px;padding:13px;font-size:16px;font-weight:700;border:0;border-radius:8px;background:#d71920;color:#fff;cursor:pointer}#tinoGate .er{color:#b3261e;font-weight:600;min-height:18px;margin:8px 0 0;font-size:13px}#tinoGate .mu{color:#6b6f78;font-size:13px}' +
    '#tinoMenu{position:fixed;right:12px;bottom:12px;z-index:9000}#tinoMenu>button{background:#16181d;color:#fff;border:0;border-radius:20px;padding:9px 14px;font:600 13px Inter,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}' +
    '#tinoPop{position:fixed;right:12px;bottom:58px;z-index:9001;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:14px;width:min(360px,calc(100vw - 24px));max-height:70vh;overflow:auto;font-family:Inter,sans-serif;font-size:14px}' +
    '#tinoPop button{font:inherit}#tinoPop .r{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eee}#tinoPop input{font-size:15px;padding:8px;border:1px solid #ccc;border-radius:6px;width:100%;box-sizing:border-box;margin:3px 0}';
  document.head.appendChild(st);
  function showLogin(msg) {
    box(`<form id="tgF" autocomplete="on"><h1>Encartes</h1><p class="mu">${esc(brand.name || 'Tino')}</p>
      <label for="tgU">Usuário</label><input type="text" id="tgU" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required>
      <label for="tgP">Senha</label><input type="password" id="tgP" name="password" autocomplete="current-password" required>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="tgK" checked> Manter conectado neste aparelho</label>
      <p class="er" role="alert">${esc(msg || '')}</p><button type="submit">Entrar</button></form>`);
    $('#tgF').addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
      try { await api('/api/login', { login: $('#tgU').value.trim().toLowerCase(), password: $('#tgP').value, keep: $('#tgK').checked }); await start(); }
      catch (er) { e.target.querySelector('.er').textContent = er.message; $('#tgP').value = ''; b.disabled = false; }
    });
    setTimeout(() => $('#tgU') && $('#tgU').focus(), 50);
  }
  function showReset() {
    box(`<form id="tgR"><h1>Crie sua senha</h1><p class="mu">Primeiro acesso: troque a senha provisória por uma só sua (mínimo de 8 caracteres).</p>
      <label for="tgC">Senha atual (a provisória)</label><input type="password" id="tgC" autocomplete="current-password" required>
      <label for="tgN">Senha nova</label><input type="password" id="tgN" autocomplete="new-password" required minlength="8">
      <p class="er" role="alert"></p><button type="submit">Salvar e entrar</button></form>`);
    $('#tgR').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/password', { current: $('#tgC').value, next: $('#tgN').value }); await start(); }
      catch (er) { e.target.querySelector('.er').textContent = er.message; }
    });
  }
  /* ---------- menu da conta (sair, senha, equipe) ---------- */
  function menu() {
    if ($('#tinoMenu')) return;
    const m = document.createElement('div'); m.id = 'tinoMenu'; m.innerHTML = '<button type="button">👤 ' + esc(ME.nome || 'Conta') + '</button>'; document.body.appendChild(m);
    m.firstChild.addEventListener('click', () => { const p = $('#tinoPop'); if (p) return p.remove(); pop(); });
  }
  async function pop(msg) {
    let p = $('#tinoPop'); if (!p) { p = document.createElement('div'); p.id = 'tinoPop'; document.body.appendChild(p); }
    let eq = '';
    if (ME.dono) {
      let L = []; try { L = (await api('/api/encartes/pessoas')).pessoas; } catch (e) { /* segue */ }
      eq = `<h3 style="margin:14px 0 6px">Equipe (funcionários)</h3><p style="color:#666;font-size:12.5px;margin:0 0 6px">Funcionário entra no passo a passo; não vê o Painel do dono.</p>
        ${L.map(x => `<div class="r"><span><b>${esc(x.nome)}</b> <small>${esc(x.login)}${x.ativo ? '' : ' · desligado'}</small></span><span><button type="button" data-np="${esc(x.login)}">Nova senha</button> <button type="button" data-tg="${esc(x.login)}" data-at="${x.ativo ? 1 : 0}">${x.ativo ? 'Desligar' : 'Ligar'}</button></span></div>`).join('') || '<p style="color:#666">Ninguém cadastrado ainda.</p>'}
        <form id="tpN" style="margin-top:8px"><input id="tpNome" placeholder="Nome (ex.: Maria)" required><input id="tpLog" placeholder="Usuário (ex.: maria)" required autocapitalize="off"><button type="submit" style="width:100%;padding:9px;margin-top:4px;background:#16181d;color:#fff;border:0;border-radius:6px">+ Criar acesso</button></form>`;
    }
    p.innerHTML = `${msg ? `<div style="background:#e6f4ea;color:#17692e;padding:10px;border-radius:8px;margin-bottom:8px">${msg}</div>` : ''}
      <div class="r"><span><b>${esc(ME.nome || '')}</b><br><small>${ME.dono ? 'Dono' : 'Funcionário'}</small></span><button type="button" id="tpSair">Sair</button></div>${eq}`;
    $('#tpSair').onclick = async () => { try { await api('/api/logout', {}); } catch (e) { /* segue */ } location.reload(); };
    const pessoa = async (b, ok) => { try { const r = await api('/api/encartes/pessoa', b); pop(r.password ? `${esc(ok)}<br>Usuário: <b>${esc(r.login)}</b><br>Senha provisória: <b>${esc(r.password)}</b><br><small>Anote agora: ela não aparece de novo.</small>` : esc(ok)); } catch (e) { alert(e.message); } };
    const f = $('#tpN'); if (f) f.addEventListener('submit', e => { e.preventDefault(); pessoa({ nome: $('#tpNome').value.trim(), login: $('#tpLog').value.trim().toLowerCase() }, 'Acesso criado.'); });
    p.querySelectorAll('[data-np]').forEach(b => b.onclick = () => pessoa({ login: b.dataset.np, novaSenha: true }, 'Senha nova gerada.'));
    p.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => pessoa({ login: b.dataset.tg, ativo: b.dataset.at !== '1' }, b.dataset.at === '1' ? 'Acesso desligado.' : 'Acesso ligado.'));
  }
  /* ---------- início ---------- */
  let loaded = false;
  async function start() {
    try { ME = await api('/api/encartes/me'); }
    catch (e) { if (e.mustReset) return showReset(); if (e.status === 401 || e.login) return showLogin(e.status === 401 ? '' : e.message); return showLogin(e.message); }
    const g = $('#tinoGate'); if (g) g.remove();
    window.claude = { use: async k => { if (k === 'db') return db; if (k === 'assets') return assets; if (k === 'user') return user; throw Object.assign(new Error('Indisponível no Tino'), { code: 'unavailable' }); } };
    try { localStorage.setItem('encartes-tino-user', ME.id); } catch (e) { /* segue */ }
    menu();
    if (!loaded) { loaded = true; const s = document.createElement('script'); s.src = '/encartes/app.js'; document.body.appendChild(s); }
  }
  start();
})();

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
    '#tinoPop button{font:inherit}#tinoPop .r{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eee}#tinoPop input{font-size:15px;padding:8px;border:1px solid #ccc;border-radius:6px;width:100%;box-sizing:border-box;margin:3px 0}' +
    '#tinoUsr{position:fixed;inset:0;z-index:9500;background:#f4f2ee;overflow:auto;font-family:Inter,system-ui,sans-serif;font-size:15px;color:#16181d}#tinoUsr .w{max-width:560px;margin:0 auto;padding:14px 14px 90px}' +
    '#tinoUsr .hd{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;background:#f4f2ee;padding:10px 0;z-index:1}#tinoUsr h2{font:700 22px Oswald,Inter,sans-serif;text-transform:uppercase;margin:0}' +
    '#tinoUsr button{font:600 14px Inter,sans-serif;border:1px solid #cfcac0;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;color:#16181d}#tinoUsr button.pri{background:#d71920;border-color:#d71920;color:#fff}' +
    '#tinoUsr .card{background:#fff;border-radius:12px;padding:12px;margin:10px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}#tinoUsr .u{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}' +
    '#tinoUsr .tag{display:inline-block;font-size:11.5px;font-weight:700;border-radius:10px;padding:2px 8px;margin-left:4px}#tinoUsr .t-adm{background:#16181d;color:#fff}#tinoUsr .t-auto{background:#e8f0fe;color:#1a56c4}#tinoUsr .t-off{background:#eee;color:#777}' +
    '#tinoUsr .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#tinoUsr input,#tinoUsr select{font-size:16px;padding:10px;border:1px solid #cfcac0;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0 8px;background:#fff}' +
    '#tinoUsr .tseg{display:flex;gap:6px;margin:4px 0 8px}#tinoUsr .tseg label{flex:1;background:#fff;border:2px solid #cfcac0;border-radius:10px;padding:10px;cursor:pointer;font-size:13px;color:#555}#tinoUsr .tseg input{display:none}#tinoUsr .tseg label:has(input:checked){border-color:#d71920;color:#16181d;background:#fff5f5}#tinoUsr .tseg b{display:block;font-size:15px;color:#16181d}' +
    '#tinoUsr .ok{background:#e6f4ea;color:#17692e;padding:12px;border-radius:10px;margin:8px 0}#tinoUsr .mu{color:#6b6f78;font-size:13px}';
  document.head.appendChild(st);
  function showLogin(msg) {
    box(`<form id="tgF" autocomplete="on"><h1>Encartes</h1><p class="mu">${esc(brand.name || 'Tino')}</p>
      <label for="tgU">Usuário</label><input type="text" id="tgU" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required>
      <label for="tgP">Senha</label><input type="password" id="tgP" name="password" autocomplete="current-password" required>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="tgK" checked> Manter conectado neste aparelho</label>
      <p class="er" role="alert">${esc(msg || '')}</p><button type="submit">Entrar</button></form>`);
    $('#tgF').addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
      try { const pw = $('#tgP').value; await api('/api/login', { login: $('#tgU').value.trim().toLowerCase(), password: pw, keep: $('#tgK').checked }); TEMP = pw; await start(); }
      catch (er) { e.target.querySelector('.er').textContent = er.message; $('#tgP').value = ''; b.disabled = false; }
    });
    setTimeout(() => $('#tgU') && $('#tgU').focus(), 50);
  }
  /* a provisória acabou de ser digitada para entrar: não pede de novo (o iPhone preenchia o campo com outra senha salva) */
  let TEMP = '';
  function showReset() {
    box(`<form id="tgR"><h1>Crie sua senha</h1><p class="mu">Primeiro acesso: troque a senha provisória por uma só sua (mínimo de 8 caracteres).</p>
      ${TEMP ? '' : '<label for="tgC">Senha atual (a provisória)</label><input type="password" id="tgC" autocomplete="off" required>'}
      <label for="tgN">Senha nova</label><input type="password" id="tgN" autocomplete="new-password" required minlength="8">
      <p class="er" role="alert"></p><button type="submit">Salvar e entrar</button></form>`);
    $('#tgR').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/password', { current: TEMP || $('#tgC').value, next: $('#tgN').value }); TEMP = ''; await start(); }
      catch (er) { if (TEMP && er.status === 400 && /atual/i.test(er.message)) { TEMP = ''; return showReset(); } e.target.querySelector('.er').textContent = er.message; }
    });
  }
  /* ---------- menu da conta (sair, usuários) ---------- */
  function menu() {
    if ($('#tinoMenu')) return;
    const m = document.createElement('div'); m.id = 'tinoMenu'; m.innerHTML = '<button type="button">👤 ' + esc(ME.nome || 'Conta') + '</button>'; document.body.appendChild(m);
    m.firstChild.addEventListener('click', () => { const p = $('#tinoPop'); if (p) return p.remove(); pop(); });
  }
  async function pop(msg) {
    let p = $('#tinoPop'); if (!p) { p = document.createElement('div'); p.id = 'tinoPop'; document.body.appendChild(p); }
    const eq = ME.dono ? '<button type="button" id="tpUsr" style="width:100%;margin-top:10px;padding:10px;background:#16181d;color:#fff;border:0;border-radius:8px;font-weight:600">👥 Usuários</button>' : '';
    p.innerHTML = `${msg ? `<div style="background:#e6f4ea;color:#17692e;padding:10px;border-radius:8px;margin-bottom:8px">${msg}</div>` : ''}
      <div class="r"><span><b>${esc(ME.nome || '')}</b><br><small>${ME.dono ? 'Administrador' : 'Funcionário: ' + permTxt(ME.perms)}</small></span><button type="button" id="tpSair">Sair</button></div>${eq}`;
    $('#tpSair').onclick = async () => { try { await api('/api/logout', {}); } catch (e) { /* segue */ } location.reload(); };
    const u = $('#tpUsr'); if (u) u.onclick = () => { p.remove(); usuarios(); };
  }
  /* ---------- aba Usuários (só administrador) ---------- */
  const TIPO = { adm: 'Administrador', auto: 'Funcionário' };
  const permTxt = p => (p = p || {}, [p.encarte ? 'encarte' : '', p.plaquinha ? 'plaquinha' : ''].filter(Boolean).join(' e ') || 'sem permissão');
  async function usuarios(msg) {
    let o = $('#tinoUsr'); if (!o) { o = document.createElement('div'); o.id = 'tinoUsr'; document.body.appendChild(o); }
    let L = [], er = '';
    try { L = (await api('/api/encartes/pessoas')).pessoas; } catch (e) { er = e.message; }
    const linha = x => `<div class="card"><div class="u"><span><b>${esc(x.nome)}</b> <span class="tag t-${x.tipo}">${TIPO[x.tipo]}</span>${x.tipo === 'auto' ? ` <span class="mu">${esc(permTxt(x.perms))}</span>` : ''}${x.ativo ? '' : '<span class="tag t-off">desligado</span>'}<br><span class="mu">usuário: ${esc(x.login)}${x.principal ? ' · administrador principal' : ''}${x.voce ? ' · você' : ''}${x.trocarSenha && x.ativo ? ' · ainda não trocou a senha provisória' : ''}</span></span></div>
      ${x.principal || x.voce ? '' : `<div class="ac"><button type="button" data-tp="${esc(x.login)}" data-v="${x.tipo === 'adm' ? 'auto' : 'adm'}">Mudar para ${x.tipo === 'adm' ? 'Modo automático' : 'Administrador'}</button>${x.tipo === 'auto' ? `<button type="button" data-pm="${esc(x.login)}" data-e="${x.perms && x.perms.encarte ? 1 : 0}" data-p="${x.perms && x.perms.plaquinha ? 1 : 0}">O que pode fazer</button>` : ''}<button type="button" data-np="${esc(x.login)}">Nova senha</button><button type="button" data-tg="${esc(x.login)}" data-at="${x.ativo ? 1 : 0}">${x.ativo ? 'Desligar' : 'Ligar'}</button></div>`}</div>`;
    o.innerHTML = `<div class="w"><div class="hd"><h2>Usuários</h2><button type="button" id="tuX">✕ Fechar</button></div>
      ${msg ? `<div class="ok">${msg}</div>` : ''}${er ? `<div class="ok" style="background:#fdecea;color:#b3261e">${esc(er)}</div>` : ''}
      <div class="card"><b>+ Novo usuário</b><form id="tuF" style="margin-top:8px">
        <div class="tseg"><label><input type="radio" name="tp" value="auto" checked><b>Funcionário</b>Segue o passo a passo. Faz só o que você marcar abaixo.</label>
        <label><input type="radio" name="tp" value="adm"><b>Administrador</b>Vê tudo: painel do admin, modelos, banco, custos e esta aba.</label></div>
        <div id="tuPm"><label style="display:flex;gap:8px;align-items:center;margin:2px 0"><input type="checkbox" id="tuE" checked style="width:auto;margin:0"> Pode fazer encarte</label>
        <label style="display:flex;gap:8px;align-items:center;margin:6px 0 8px"><input type="checkbox" id="tuP" checked style="width:auto;margin:0"> Pode fazer plaquinha</label></div>
        <input id="tuN" placeholder="Nome (ex.: Maria)" required maxlength="80">
        <input id="tuL" placeholder="Usuário para entrar (ex.: maria)" required autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="40">
        <button type="submit" class="pri" style="width:100%;padding:12px">Criar acesso</button></form>
        <p class="mu" style="margin:6px 0 0">O app gera uma senha provisória; a pessoa troca no primeiro acesso.</p></div>
      ${L.map(linha).join('')}</div>`;
    $('#tuX').onclick = () => o.remove();
    const salvar = async (b, ok) => {
      try { const r = await api('/api/encartes/pessoa', b);
        usuarios(r.password ? `${esc(ok)}<br>Usuário: <b>${esc(r.login)}</b><br>Senha provisória: <b>${esc(r.password)}</b><br><small>Anote agora: ela não aparece de novo.</small>` : esc(ok));
        o.scrollTop = 0;
      } catch (e) { alert(e.message); } };
    const syncPm = () => { $('#tuPm').hidden = o.querySelector('input[name=tp]:checked').value !== 'auto'; };
    o.querySelectorAll('input[name=tp]').forEach(r => r.addEventListener('change', syncPm)); syncPm();
    $('#tuF').addEventListener('submit', e => { e.preventDefault(); const tp = o.querySelector('input[name=tp]:checked').value;
      const b = { criar: true, tipo: tp, nome: $('#tuN').value.trim(), login: $('#tuL').value.trim().toLowerCase() };
      if (tp === 'auto') { b.perms = { encarte: $('#tuE').checked, plaquinha: $('#tuP').checked }; if (!b.perms.encarte && !b.perms.plaquinha) return alert('Marque pelo menos encarte ou plaquinha.'); }
      salvar(b, `Acesso criado (${TIPO[tp]}).`); });
    /* o que o funcionário pode fazer: escolhe entre as três opções */
    o.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => {
      const op = [['enc', 'Só encarte', { encarte: true, plaquinha: false }], ['plq', 'Só plaquinha', { encarte: false, plaquinha: true }], ['dois', 'Encarte e plaquinha', { encarte: true, plaquinha: true }]];
      const cur = b.dataset.e === '1' && b.dataset.p === '1' ? 'dois' : b.dataset.e === '1' ? 'enc' : 'plq';
      const card = b.closest('.card'); let f = card.querySelector('.pmF'); if (f) return f.remove();
      f = document.createElement('div'); f.className = 'pmF'; f.innerHTML = '<div class="tseg" style="margin-top:8px">' + op.map(([k, t]) => `<label><input type="radio" name="pm_${esc(b.dataset.pm)}" value="${k}"${k === cur ? ' checked' : ''}><b>${t}</b></label>`).join('') + '</div><button type="button" class="pri">Salvar</button>';
      card.appendChild(f);
      f.querySelector('button').onclick = () => { const k = f.querySelector('input:checked').value; salvar({ login: b.dataset.pm, perms: op.find(x => x[0] === k)[2] }, 'Permissões salvas. Vale na próxima vez que a pessoa abrir o app.'); };
    });
    o.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { if (confirm(`Mudar ${b.dataset.tp} para ${TIPO[b.dataset.v]}? A pessoa precisa entrar de novo.`)) salvar({ login: b.dataset.tp, tipo: b.dataset.v }, `Agora é ${TIPO[b.dataset.v]}.`); });
    o.querySelectorAll('[data-np]').forEach(b => b.onclick = () => { if (confirm(`Gerar senha nova para ${b.dataset.np}? A senha atual para de funcionar.`)) salvar({ login: b.dataset.np, novaSenha: true }, 'Senha nova gerada.'); });
    o.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => salvar({ login: b.dataset.tg, ativo: b.dataset.at !== '1' }, b.dataset.at === '1' ? 'Acesso desligado.' : 'Acesso ligado.'));
  }
  /* ---------- início ---------- */
  let loaded = false;
  async function start() {
    try { ME = await api('/api/encartes/me'); }
    catch (e) { if (e.mustReset) return showReset(); if (e.status === 401 || e.login) return showLogin(e.status === 401 ? '' : e.message); return showLogin(e.message); }
    const g = $('#tinoGate'); if (g) g.remove();
    /* o app usa isto para saber o papel e o que mostrar (encarte, plaquinha); quem barra custo e configuração é o servidor */
    window.TINO.role = ME.dono ? 'admin' : 'func'; window.TINO.perms = ME.perms || { encarte: true, plaquinha: true };
    window.claude = { use: async k => { if (k === 'db') return db; if (k === 'assets') return assets; if (k === 'user') return user; throw Object.assign(new Error('Indisponível no Tino'), { code: 'unavailable' }); } };
    try { localStorage.setItem('encartes-tino-user', ME.id); } catch (e) { /* segue */ }
    menu();
    if (!loaded) { loaded = true; const s = document.createElement('script'); s.src = '/encartes/app.js'; document.body.appendChild(s); }
  }
  start();
})();

'use strict';
/* Tino — Central do sistema. Tudo é conferido no servidor; aqui só a tela. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SWATCHES = [['#1F3D2B', 'Verde Tino'], ['#E11F2C', 'Vermelho'], ['#0A66B2', 'Azul'], ['#B4410F', 'Laranja'], ['#6D28D9', 'Roxo']];
  const STATUS = { ativa: 'Ativa', em_preparo: 'Em preparo', suspensa: 'Suspensa' };
  let D = null, sel = null, draft = null, dirty = false;

  async function api(path, body) {
    const opt = body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-App': '1' }, body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status });
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); }

  function showLogin() { $('#loginView').hidden = false; $('#appView').hidden = true; $('#who').hidden = true; setTimeout(() => $('#lu').focus(), 50); }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#loginForm button[type=submit]'); b.disabled = true; $('#lerr').textContent = '';
    try { await api('/api/central/login', { login: $('#lu').value.trim(), password: $('#lp').value }); $('#lp').value = ''; await load(); }
    catch (er) { $('#lerr').textContent = er.message; $('#lp').value = ''; }
    finally { b.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { try { await api('/api/central/logout', {}); } catch (e) { /* segue */ } D = null; showLogin(); });

  async function load(keep) {
    try { D = await api('/api/central/state'); }
    catch (e) { if (e.status === 401) return showLogin(); toast(e.message); return; }
    $('#loginView').hidden = true; $('#appView').hidden = false; $('#who').hidden = false; $('#whoName').textContent = D.me.login;
    if (!keep || !D.tenants.some(t => t.id === sel)) sel = (D.tenants[0] || {}).id || null;
    pick(sel);
  }
  function pick(id) {
    const t = D.tenants.find(x => x.id === id);
    sel = id; dirty = false;
    draft = t ? JSON.parse(JSON.stringify(t)) : { id: null, name: '', logo: null, color: '#1F3D2B', segment: 'basico', status: 'em_preparo', primary: false, modules: presetMods('basico') };
    renderList(); renderEditor();
  }
  function presetMods(seg) { const s = D.segments.find(x => x.id === seg); const m = {}; D.modules.forEach(x => { m[x.code] = x.essential ? true : !!(s && s.modules[x.code]); }); return m; }
  function matchSegment() { return (D.segments.find(s => D.modules.every(m => m.essential || !!s.modules[m.code] === !!draft.modules[m.code])) || {}).id || null; }

  function renderList() {
    const L = $('#tlist');
    L.innerHTML = D.tenants.map(t => `<button type="button" class="tn" data-t="${esc(t.id)}" aria-current="${t.id === sel}"><b>${esc(t.name)}${t.primary ? ' <span class="st ativa">principal</span>' : ''}</b><span>${esc((D.segments.find(s => s.id === t.segment) || {}).name || 'Sem segmento')} · <span class="st ${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span></span></button>`).join('')
      + (sel === null ? '<button type="button" class="tn" aria-current="true"><b>Nova empresa</b><span>ainda não salva</span></button>' : '');
    L.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(b.dataset.t); }));
  }
  $('#newT').addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(null); });

  function renderEditor() {
    const t = draft, on = Object.entries(t.modules).filter(([k, v]) => v).length, seg = matchSegment();
    const groups = [...new Set(D.modules.map(m => m.group))];
    $('#editor').innerHTML = `
    <section class="card top">
      <div><h1>${esc(t.name || 'Nova empresa')}</h1><p class="muted small" style="margin:4px 0 0">${on} de ${D.modules.length} módulos ligados · essenciais sempre ativos</p></div>
      <div class="field" style="min-width:180px"><label for="fst">Situação</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''} ${t.primary && k === 'suspensa' ? 'disabled' : ''}>${v}</option>`).join('')}</select></div>
    </section>
    ${t.id ? accessCard(t) : '<div class="note">Salve a empresa para gerar o endereço e o acesso do administrador dela.</div>'}
    <section class="card" style="display:grid;gap:16px" aria-labelledby="hid">
      <h2 id="hid">Identidade da marca</h2>
      <div class="grid">
        <div class="field"><label for="fname">Nome exibido no sistema</label><input type="text" id="fname" maxlength="80" value="${esc(t.name)}"></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Logo</span>
          <div class="logo-row"><div class="logo-box">${t.logo ? `<img src="${esc(t.logo)}" alt="Logo atual">` : 'LOGO'}</div>
          <label class="btn" for="flogo" style="display:inline-flex;align-items:center">Enviar imagem</label><input type="file" id="flogo" accept="image/png,image/jpeg,image/webp" hidden>
          ${t.logo ? '<button class="btn" type="button" id="frmlogo">Tirar</button>' : ''}</div></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Cor principal</span>
          <div class="sw">${SWATCHES.map(([c, n]) => `<button type="button" data-c="${c}" aria-label="${n}" aria-pressed="${(t.color || '').toUpperCase() === c}" style="background:${c}"></button>`).join('')}<input type="color" id="fcolor" aria-label="Outra cor" value="${esc(t.color || '#1F3D2B')}"></div>
          ${t.primary && !t.color ? '<span class="small muted">Sem cor escolhida: o app mantém as cores atuais.</span>' : ''}</div>
      </div>
      <div class="preview"><span class="small muted">Prévia do botão da loja:</span><span class="pv-btn" style="background:${esc(t.color || '#E11F2C')}">Finalizar pedido</span></div>
    </section>
    <section class="card" style="display:grid;gap:12px" aria-labelledby="hseg">
      <div><h2 id="hseg">Modelo por segmento</h2><p class="muted small" style="margin:4px 0 0">Aplica um pacote pronto de módulos. Depois dá para ajustar um por um.</p></div>
      <div class="presets">${D.segments.map(s => `<button type="button" data-seg="${esc(s.id)}" aria-pressed="${seg === s.id}">${esc(s.name)}</button>`).join('')}${seg ? '' : '<button type="button" aria-pressed="true" disabled>Personalizado</button>'}</div>
    </section>
    ${groups.map(g => `<section class="card grp"><h2>${esc(g)}${g === 'Essenciais' ? '<small>Não podem ser desligados</small>' : ''}</h2>
      ${D.modules.filter(m => m.group === g).map(m => `<div class="mod"><div class="t"><div class="n">${esc(m.name)}${!m.essential && !m.enforced ? '<span class="tag">efeito na próxima etapa</span>' : ''}</div><div class="d">${esc(m.desc)}</div></div>
        ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-m="${esc(m.code)}" aria-checked="${!!t.modules[m.code]}" aria-label="${esc(m.name)}"><span></span></button>`}</div>`).join('')}</section>`).join('')}
    <div class="bar${dirty ? ' dirty' : ''}"><span>${dirty ? 'Há mudanças sem salvar.' : 'Tudo salvo.'}</span><div style="display:flex;gap:8px"><button class="btn ghost-light" type="button" id="undo" ${dirty ? '' : 'disabled'}>Desfazer</button><button class="btn primary" type="button" id="save" ${dirty ? '' : 'disabled'}>Salvar configuração</button></div></div>`;
    bind();
  }
  /* endereço e acesso do administrador da empresa */
  function accessCard(t) {
    const base = location.origin + (t.primary ? '' : '/t/' + t.id), st = t.stats || {};
    return `<section class="card" style="display:grid;gap:12px" aria-labelledby="hac">
      <h2 id="hac">Acesso da empresa</h2>
      <div class="grid">
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Endereço da equipe</span><code class="link">${esc(base + '/#admin')}</code></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Endereço dos clientes</span><code class="link">${esc(base + '/cliente')}</code></div>
      </div>
      <p class="small muted" style="margin:0">${st.products || 0} produtos · ${st.orders || 0} pedidos · ${st.users || 0} usuários${t.adminLogin ? ' · administrador: ' + esc(t.adminLogin) : ''}</p>
      ${t.primary ? '<p class="small muted" style="margin:0">A empresa principal cuida dos próprios acessos pelo painel dela.</p>' : `
      <div class="logo-row">
        <div class="field" style="flex:1 1 200px"><label for="alog">Usuário do administrador</label><input type="text" id="alog" value="${esc(t.adminLogin || 'admin')}" maxlength="40" autocapitalize="off" spellcheck="false"></div>
        <button class="btn dark" type="button" id="agen" style="align-self:end">${t.adminLogin ? 'Gerar nova senha' : 'Criar acesso do administrador'}</button>
      </div>
      <div id="aout" aria-live="polite"></div>`}
    </section>`;
  }
  async function genAdmin() {
    const login = $('#alog').value.trim().toLowerCase();
    if (draft.adminLogin && !confirm('Gerar uma nova senha derruba o acesso atual do administrador desta empresa. Continuar?')) return;
    const b = $('#agen'); b.disabled = true;
    try {
      const r = await api('/api/central/tenant-admin', { id: draft.id, login });
      const url = location.origin + '/t/' + r.tenant + '/#admin';
      $('#aout').innerHTML = `<div class="note" style="display:grid;gap:6px"><b>Anote agora: esta senha aparece só uma vez.</b>
        <span>Endereço: <code class="link">${esc(url)}</code></span><span>Usuário: <code>${esc(r.login)}</code></span><span>Senha provisória: <code style="font-size:17px">${esc(r.password)}</code></span>
        <span class="small">No primeiro acesso, a pessoa cria a senha dela.</span></div>`;
      const t = D.tenants.find(x => x.id === draft.id); if (t) { t.adminLogin = r.login; draft.adminLogin = r.login; }
      b.textContent = 'Gerar nova senha';
    } catch (e) { if (e.status === 401) return showLogin(); toast(e.message); }
    finally { b.disabled = false; }
  }
  function touch() { dirty = true; renderEditor(); }
  function bind() {
    const E = $('#editor');
    $('#fname').addEventListener('input', e => { draft.name = e.target.value; dirty = true; E.querySelector('h1').textContent = draft.name || 'Nova empresa'; $('#save').disabled = false; $('#undo').disabled = false; });
    $('#fst').addEventListener('change', e => { draft.status = e.target.value; touch(); });
    E.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { draft.color = b.dataset.c; touch(); }));
    $('#fcolor').addEventListener('change', e => { draft.color = e.target.value.toUpperCase(); touch(); });
    E.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { draft.segment = b.dataset.seg; draft.modules = presetMods(b.dataset.seg); touch(); }));
    E.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { draft.modules[b.dataset.m] = !draft.modules[b.dataset.m]; touch(); }));
    const rm = $('#frmlogo'); if (rm) rm.addEventListener('click', () => { draft.logo = null; touch(); });
    $('#flogo').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readLogo(f); });
    $('#undo').addEventListener('click', () => pick(sel));
    $('#save').addEventListener('click', save);
    const ag = $('#agen'); if (ag) ag.addEventListener('click', genAdmin);
  }
  /* reduz a logo para no máximo 256 px antes de enviar (fica leve e sem código escondido) */
  function readLogo(f) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Use PNG, JPG ou WEBP.'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('Imagem grande demais.'); return; }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      draft.logo = c.toDataURL('image/png'); touch();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Não consegui abrir essa imagem.'); };
    img.src = url;
  }
  async function save() {
    const b = $('#save'); b.disabled = true;
    const mods = {}; D.modules.forEach(m => { if (!m.essential) mods[m.code] = !!draft.modules[m.code]; });
    try {
      const r = await api('/api/central/tenant', { id: draft.id, name: draft.name, logo: draft.logo, color: draft.color, segment: matchSegment() || draft.segment, status: draft.status, modules: mods });
      sel = r.tenant.id; toast('Configuração salva'); await load(true);
    } catch (e) { if (e.status === 401) return showLogin(); toast(e.message); b.disabled = false; }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();

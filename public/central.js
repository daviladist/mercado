'use strict';
/* Tino — Central do sistema. Tudo é conferido no servidor; aqui só a tela. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SWATCHES = [['#1F3D2B', 'Verde Tino'], ['#E11F2C', 'Vermelho'], ['#0A66B2', 'Azul'], ['#B4410F', 'Laranja'], ['#6D28D9', 'Roxo']];
  const STATUS = { ativa: 'Ativa', em_preparo: 'Em preparo', suspensa: 'Suspensa' };
  let D = null, sel = null, draft = null, dirty = false, pendingDraft = null, segUI = null;

  async function api(path, body) {
    const opt = body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-App': '1' }, body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status });
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); }

  function showLogin(msg) { $('#lerr').textContent = msg || ''; $('#loginView').hidden = false; $('#appView').hidden = true; $('#who').hidden = true; setTimeout(() => $('#lu').focus(), 50); }
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
    if (pendingDraft) { const p = pendingDraft; pendingDraft = null; sel = p.sel; pick(sel); draft = p.draft; dirty = true; renderList(); renderEditor(); return; }
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
      <div class="field" style="min-width:180px"><label for="fst">Situação</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''} ${t.primary && k !== 'ativa' ? 'disabled' : ''}>${v}</option>`).join('')}</select></div>
    </section>
    <section class="card" style="display:grid;gap:10px" aria-labelledby="hwho">
      <div><h2 id="hwho">Quem usa o sistema</h2><p class="muted small" style="margin:4px 0 0">Sem app do cliente, a vitrine e tudo o que é do cliente ficam desligados: os pedidos entram pelos vendedores e pela loja.</p></div>
      <div class="presets"><button type="button" data-who="0" aria-pressed="${!t.modules.app_cliente}">Só a equipe (cliente compra pelo vendedor)</button><button type="button" data-who="1" aria-pressed="${!!t.modules.app_cliente}">Equipe e clientes (app do cliente)</button></div>
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
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn dark" id="segNew">+ Criar segmento</button><button type="button" class="btn" id="segList">Editar segmentos</button></div>
    </section>
    ${groups.filter(g => g !== 'Acesso').map(g => `<section class="card grp"><h2>${esc(g)}${g === 'Essenciais' ? '<small>Não podem ser desligados</small>' : ''}</h2>
      ${D.modules.filter(m => m.group === g).map(m => { const blk = m.requires && !t.modules[m.requires]; return `<div class="mod"><div class="t"><div class="n">${esc(m.name)}${blk ? '<span class="tag">precisa do app do cliente</span>' : !m.essential && !m.enforced ? '<span class="tag">efeito na próxima etapa</span>' : m.enforced === 'tela' ? '<span class="tag">só esconde a tela</span>' : ''}</div><div class="d">${esc(m.desc)}</div></div>
        ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-m="${esc(m.code)}" aria-checked="${!blk && !!t.modules[m.code]}" aria-label="${esc(m.name)}" ${blk ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}><span></span></button>`}</div>` }).join('')}</section>`).join('')}
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
        ${t.modules.app_cliente ? `<div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Endereço dos clientes</span><code class="link">${esc(base + '/cliente')}</code></div>` : '<div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Clientes</span><span class="small muted">Sem app do cliente: compram pelo vendedor.</span></div>'}
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
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) { toast('Usuário: de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).'); $('#alog').focus(); return; }
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
    } catch (e) { if (e.status === 401) return showLogin('Sua sessão terminou. Entre de novo.'); toast(e.message); }
    finally { b.disabled = false; }
  }
  function touch() { dirty = true; renderEditor(); }
  function bind() {
    const E = $('#editor');
    $('#fname').addEventListener('input', e => { draft.name = e.target.value; dirty = true; E.querySelector('h1').textContent = draft.name || 'Nova empresa'; $('#save').disabled = false; $('#undo').disabled = false; const bar = E.querySelector('.bar'); bar.classList.add('dirty'); bar.querySelector('span').textContent = 'Há mudanças sem salvar.'; });
    $('#fst').addEventListener('change', e => { draft.status = e.target.value; touch(); });
    E.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { draft.color = b.dataset.c; touch(); }));
    $('#fcolor').addEventListener('change', e => { draft.color = e.target.value.toUpperCase(); touch(); });
    E.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { draft.segment = b.dataset.seg; draft.modules = presetMods(b.dataset.seg); touch(); }));
    E.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; draft.modules[b.dataset.m] = !draft.modules[b.dataset.m]; touch(); }));
    E.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { const on = b.dataset.who === '1'; draft.modules.app_cliente = on; if (!on) D.modules.forEach(m => { if (m.requires === 'app_cliente') draft.modules[m.code] = false; }); touch(); }));
    const rm = $('#frmlogo'); if (rm) rm.addEventListener('click', () => { draft.logo = null; touch(); });
    $('#flogo').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readLogo(f); });
    $('#undo').addEventListener('click', () => pick(sel));
    $('#save').addEventListener('click', save);
    const ag = $('#agen'); if (ag) ag.addEventListener('click', genAdmin);
    $('#segNew').addEventListener('click', () => { segUI = { edit: { id: null, name: '', modules: segMods(draft.modules) }, fromCo: true }; renderSegs(); });
    $('#segList').addEventListener('click', () => { segUI = { edit: null }; renderSegs(); });
  }
  /* ---------- modelos por segmento: criar, editar, apagar ---------- */
  function segMods(src) { const m = {}; D.modules.forEach(x => { if (!x.essential) m[x.code] = !!(src && src[x.code]); }); return m; }
  function backToCompany() { segUI = null; renderEditor(); window.scrollTo(0, 0); }
  function renderSegs() {
    const E = $('#editor'), S = segUI, ed = S.edit;
    const groups = [...new Set(D.modules.map(m => m.group))];
    const nOn = s => Object.values(s.modules).filter(Boolean).length;
    if (!ed) {
      E.innerHTML = `<section class="card top"><div><h1>Modelos por segmento</h1><p class="muted small" style="margin:4px 0 0">Pacotes prontos de módulos para aplicar numa empresa com um clique. Mudar um modelo não mexe nas empresas que já existem.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="sgBack">← Voltar para a empresa</button><button class="btn dark" type="button" id="sgNew">+ Criar segmento</button></div></section>
        ${D.segments.map(s => `<section class="card" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div><h2 style="margin:0">${esc(s.name)}</h2><p class="muted small" style="margin:4px 0 0">${nOn(s)} módulo${nOn(s) === 1 ? '' : 's'} ligado${nOn(s) === 1 ? '' : 's'} além dos essenciais${s.builtin ? ' · modelo de fábrica' + (s.edited ? ' (editado)' : '') : ' · criado por você'} · ${D.tenants.filter(t => t.segment === s.id).length} empresa(s)</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-sge="${esc(s.id)}">Editar</button>
          ${s.builtin ? (s.edited ? `<button class="btn" type="button" data-sgd="${esc(s.id)}">Voltar ao original</button>` : '') : `<button class="btn" type="button" data-sgd="${esc(s.id)}">Apagar</button>`}</div></section>`).join('')}`;
      $('#sgBack').addEventListener('click', backToCompany);
      $('#sgNew').addEventListener('click', () => { segUI = { edit: { id: null, name: '', modules: segMods(null) } }; renderSegs(); });
      E.querySelectorAll('[data-sge]').forEach(b => b.addEventListener('click', () => { const s = D.segments.find(x => x.id === b.dataset.sge); segUI = { edit: { id: s.id, name: s.name, modules: segMods(s.modules), builtin: s.builtin } }; renderSegs(); }));
      E.querySelectorAll('[data-sgd]').forEach(b => b.addEventListener('click', async () => {
        const s = D.segments.find(x => x.id === b.dataset.sgd);
        if (!confirm(s.builtin ? 'Voltar "' + s.name + '" ao pacote original de fábrica?' : 'Apagar o modelo "' + s.name + '"? As empresas que usam ele continuam com os módulos delas.')) return;
        try { const r = await api('/api/central/segment-del', { id: s.id }); D.segments = r.segments; toast(r.restored ? 'Modelo voltou ao original' : 'Modelo apagado'); try { D.tenants = (await api('/api/central/state')).tenants; } catch (x) { /* segue */ } segUI = { edit: null }; renderSegs(); }
        catch (e) { if (e.status === 401) return showLogin('Sua sessão terminou. Entre de novo.'); toast(e.message); }
      }));
      window.scrollTo(0, 0); return;
    }
    const on = Object.values(ed.modules).filter(Boolean).length;
    E.innerHTML = `<section class="card top"><div><h1>${ed.id ? 'Editar modelo' : 'Novo modelo de segmento'}</h1><p class="muted small" style="margin:4px 0 0">${on} módulo${on === 1 ? '' : 's'} ligado${on === 1 ? '' : 's'} além dos essenciais. Módulos criados no futuro começam desligados no modelo: é só voltar aqui e ligar.</p></div>
      <button class="btn" type="button" id="sgCancel">Cancelar</button></section>
      <section class="card" style="display:grid;gap:12px"><div class="field"><label for="sgName">Nome do modelo</label><input type="text" id="sgName" maxlength="80" value="${esc(ed.name)}" placeholder="Ex.: Varejo, Mercadinho de bairro"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="small muted" style="align-self:center">Começar com:</span><button class="btn" type="button" id="sgFromCo">Os módulos da empresa aberta (${esc(draft.name || 'nova empresa')})</button><button class="btn" type="button" id="sgAll">Tudo ligado</button><button class="btn" type="button" id="sgNone">Tudo desligado</button></div></section>
      ${groups.map(g => `<section class="card grp"><h2>${esc(g)}${g === 'Essenciais' ? '<small>Sempre ligados em qualquer modelo</small>' : ''}</h2>
        ${D.modules.filter(m => m.group === g).map(m => `<div class="mod"><div class="t"><div class="n">${esc(m.name)}</div><div class="d">${esc(m.desc)}</div></div>
          ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-sgm="${esc(m.code)}" aria-checked="${!!ed.modules[m.code]}" aria-label="${esc(m.name)}"><span></span></button>`}</div>`).join('')}</section>`).join('')}
      <div class="bar dirty"><span>${ed.id ? 'Salvar muda só o modelo: as empresas que já existem não mudam.' : 'O modelo novo aparece em "Modelo por segmento" de todas as empresas.'}</span><div style="display:flex;gap:8px"><button class="btn ghost-light" type="button" id="sgCancel2">Cancelar</button><button class="btn primary" type="button" id="sgSave">${ed.id ? 'Salvar modelo' : 'Criar modelo'}</button></div></div>`;
    const keepName = () => { ed.name = $('#sgName').value; };
    const back = () => { segUI = S.fromCo ? null : { edit: null }; if (segUI) renderSegs(); else backToCompany(); };
    $('#sgCancel').addEventListener('click', back); $('#sgCancel2').addEventListener('click', back);
    $('#sgName').addEventListener('input', keepName);
    $('#sgFromCo').addEventListener('click', () => { keepName(); ed.modules = segMods(draft.modules); renderSegs(); });
    $('#sgAll').addEventListener('click', () => { keepName(); Object.keys(ed.modules).forEach(k => { ed.modules[k] = true; }); renderSegs(); });
    $('#sgNone').addEventListener('click', () => { keepName(); Object.keys(ed.modules).forEach(k => { ed.modules[k] = false; }); renderSegs(); });
    E.querySelectorAll('[data-sgm]').forEach(b => b.addEventListener('click', () => { keepName(); ed.modules[b.dataset.sgm] = !ed.modules[b.dataset.sgm]; if (!ed.modules.app_cliente) D.modules.forEach(m => { if (m.requires === 'app_cliente') ed.modules[m.code] = false; }); const y = window.scrollY; renderSegs(); window.scrollTo(0, y); }));
    $('#sgSave').addEventListener('click', async () => {
      keepName(); const nm = ed.name.trim();
      if (nm.length < 2) { toast('Dê um nome ao modelo (ex.: Varejo).'); $('#sgName').focus(); return; }
      const b = $('#sgSave'); b.disabled = true;
      try { const r = await api('/api/central/segment', { id: ed.id, name: nm, modules: ed.modules }); D.segments = r.segments; toast(ed.id ? 'Modelo salvo' : 'Modelo "' + r.segment.name + '" criado'); segUI = S.fromCo ? null : { edit: null }; if (segUI) renderSegs(); else backToCompany(); }
      catch (e) { if (e.status === 401) return showLogin('Sua sessão terminou. Entre de novo.'); toast(e.message); b.disabled = false; }
    });
    window.scrollTo(0, 0);
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
    } catch (e) { if (e.status === 401) { pendingDraft = { sel, draft }; return showLogin('Sua sessão terminou. Entre de novo: suas mudanças continuam aqui para salvar.'); } toast(e.message); b.disabled = false; }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();

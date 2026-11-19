'use strict';
/* Tino — Central do sistema. Tudo é conferido no servidor; aqui só a tela. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SWATCHES = [['#1F3D2B', 'Verde Tino'], ['#E11F2C', 'Vermelho'], ['#0A66B2', 'Azul'], ['#B4410F', 'Laranja'], ['#6D28D9', 'Roxo']];
  const STATUS = { ativa: 'Ativa', em_preparo: 'Em preparo', suspensa: 'Suspensa' };
  /* blocos abertos/fechados: lembrados enquanto a página estiver aberta */
  const OPEN = new Map();
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.fold[data-k]')) OPEN.set(d.dataset.k, d.open); }, true);
  const restoreOpen = () => document.querySelectorAll('#editor details.fold[data-k]').forEach(d => { if (OPEN.has(d.dataset.k) && d.open !== OPEN.get(d.dataset.k)) d.open = OPEN.get(d.dataset.k); });
  new MutationObserver(restoreOpen).observe(document.documentElement, { childList: true, subtree: true });
  let D = null, sel = null, draft = null, dirty = false, pendingDraft = null, segUI = null, aba = 'atacado';
  const ramoOf = t => (t && ['rural', 'loja', 'caixa', 'encartes'].includes(t.ramo) ? t.ramo : 'atacado');
  const modsOf = t => ramoOf(t) === 'rural' ? D.ruralModules : ramoOf(t) === 'loja' ? D.lojaModules : ramoOf(t) === 'caixa' ? D.caixaModules : ramoOf(t) === 'encartes' ? (D.encModules || []) : D.modules;
  const naAba = () => D.tenants.filter(t => ramoOf(t) === aba);
  /* textos de cada segmento (Rural e Loja online usam o mesmo editor) */
  const RAMO_UI = {
    rural: { tipo: 'Rural', novo: 'Novo produtor rural', criar: 'Criar produtor', acesso: 'Criar acesso do produtor', usuario: 'Usuário do produtor', exemplo: 'Ex.: Pisaia', nomeLabel: 'Nome (aparece como o dono nas divisões)', botao: '+ Lançar despesa',
      nota: d => 'App do produtor: cada roça é um projeto (meeiros com a porcentagem sobre o valor vendido, funcionários, despesas, adiantamentos e acerto), com um painel geral. O nome da empresa aparece como o dono nas divisões: <b>' + esc(d) + ' 60% · Lucas 40%</b>.',
      stats: st => `${st.rocas || 0} roças · ${st.lancamentos || 0} lançamentos`,
      links: base => [['App do produtor', base + '/', 'Painel, roças, lançamentos e acerto com os meeiros (celular ou computador)']] },
    loja: { tipo: 'Loja online', novo: 'Nova loja online', criar: 'Criar loja', acesso: 'Criar acesso da loja', usuario: 'Usuário da dona da loja', exemplo: 'Ex.: Ateliê Maria', nomeLabel: 'Nome da loja (aparece na vitrine)', botao: 'Enviar pedido',
      nota: () => 'Loja online: a loja publica os produtos com fotos, tamanhos, cores e preço por quantidade; o cliente escolhe pelo celular, monta o carrinho e envia o pedido. A loja confirma pelo painel e avisa pelo WhatsApp.',
      stats: st => `${st.lojaProdutos || 0} produtos · ${st.lojaPedidos || 0} pedidos`,
      links: base => [['Vitrine (para os clientes)', base + '/loja', 'Mande este link no WhatsApp, Instagram e status'], ['Painel da loja', base + '/', 'Produtos, pedidos e configurações (dona da loja)']] },
    caixa: { tipo: 'Painel gerencial', novo: 'Nova empresa (painel gerencial)', criar: 'Criar', acesso: 'Criar acesso', usuario: 'Usuário', exemplo: 'Ex.: Dávila Supermercados', nomeLabel: 'Nome da empresa', botao: '+ Lançar sangria',
      nota: () => 'Uso interno: saldo esperado em dinheiro na matriz, sangrias (quem fez, motivo e data) e conferência com as vendas e recebimentos em dinheiro do StarIA. Sem custo nem margem.',
      stats: st => `${st.caixaMov || 0} lançamentos`,
      links: base => [['Painel gerencial', base + '/', 'Saldo esperado, sangrias e conferência (dono e equipe)']] }
  };
  RAMO_UI.encartes = { tipo: 'Gerador de Encartes', novo: 'Nova empresa (encartes)', criar: 'Criar', acesso: 'Criar acesso do dono', usuario: 'Usuário do dono', exemplo: 'Ex.: Dávila Supermercados', nomeLabel: 'Nome da empresa', botao: 'Criar encarte',
    nota: () => 'Gerador de Encartes: encartes, plaquinhas, vídeo e TV a partir da lista de ofertas. O dono monta campanhas e modelos; o funcionário segue o passo a passo. A equipe é criada pelo dono, dentro do app.',
    stats: () => '',
    links: base => [['Gerador de Encartes', base + '/', 'Dono e funcionários (computador ou celular)']] };
  const ABAS = [['atacado', 'Atacado e varejo'], ['rural', 'Rural'], ['loja', 'Loja online'], ['caixa', 'Painel gerencial'], ['encartes', 'Gerador de Encartes'], ['banco', 'Banco de dados']];

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
  /* painel de erros do servidor: contador vermelho no topo e lista com "marcar como visto" */
  function errCount(n) { const b = $('#errN'); n = Number(n) || 0; b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; $('#errBtn').setAttribute('aria-label', 'Erros do servidor' + (n ? ': ' + n + ' não vistos' : '')); }
  const dt = s => { try { return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } };
  async function renderErrors() {
    let E; try { E = await api('/api/central/errors'); } catch (e) { toast(e.message); return; }
    errCount(E.unseen);
    const tn = id => { const t = D.tenants.find(x => x.id === id); return t ? t.name : (id || 'sem empresa'); };
    $('#editor').innerHTML = `<section class="card"><div class="top"><div><h1>Erros do servidor</h1><p class="muted small" style="margin:4px 0 0">Erros inesperados (o sistema já recusou ou mostrou "tente de novo"). Sem dados de clientes. Ficam os 500 mais recentes.</p></div>
      ${E.unseen ? '<button class="btn dark" id="errAll" type="button">Marcar todos como vistos</button>' : ''}</div>
      <div class="errl">${E.errors.length ? E.errors.map(x => `<div class="erri${x.seen ? '' : ' novo'}"><div style="min-width:0;flex:1"><div class="m">${esc(x.message)}</div>
        <div class="small muted">${esc(tn(x.tenant_id))} · <code>${esc(x.route)}</code>${x.place ? ' · <code>' + esc(x.place) + '</code>' : ''} · ${esc(dt(x.last_at))}${x.n > 1 ? ' · <b>' + x.n + ' vezes</b> (desde ' + esc(dt(x.at)) + ')' : ''}</div></div>
        ${x.seen ? '<span class="small muted">visto</span>' : `<button class="btn" type="button" data-eseen="${esc(x.id)}">Marcar como visto</button>`}</div>`).join('') : '<p class="muted">Nenhum erro registrado. Tudo certo.</p>'}</div></section>`;
    const mark = async b => { try { const r = await api('/api/central/errors-seen', b); errCount(r.unseen); renderErrors(); } catch (e) { toast(e.message); } };
    document.querySelectorAll('[data-eseen]').forEach(b => b.addEventListener('click', () => mark({ ids: [Number(b.dataset.eseen)] })));
    const all = $('#errAll'); if (all) all.addEventListener('click', () => mark({ all: true }));
  }
  $('#errBtn').addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; dirty = false; renderErrors(); });
  $('#logout').addEventListener('click', async () => { try { await api('/api/central/logout', {}); } catch (e) { /* segue */ } D = null; showLogin(); });

  async function load(keep) {
    try { D = await api('/api/central/state'); }
    catch (e) { if (e.status === 401) return showLogin(); toast(e.message); return; }
    $('#loginView').hidden = true; $('#appView').hidden = false; $('#who').hidden = false; $('#whoName').textContent = D.me.login; errCount(D.errUnseen);
    if (pendingDraft) { const p = pendingDraft; pendingDraft = null; sel = p.sel; pick(sel); draft = p.draft; dirty = true; renderList(); renderEditor(); return; }
    if (aba === 'banco') { dirty = false; if (BK.sel !== null && !bancoDe(BK.sel)) BK.sel = (D.bancos[0] || {}).id || null; renderList(); renderBanco(); if (BK.sel) loadBanco(); return; }
    const cur = D.tenants.find(t => t.id === sel);
    if (keep && cur) aba = ramoOf(cur);
    if (!keep || !cur) sel = (naAba()[0] || {}).id || null;
    pick(sel);
  }
  function pick(id) {
    const t = D.tenants.find(x => x.id === id);
    sel = id; dirty = false;
    draft = t ? JSON.parse(JSON.stringify(t)) : aba === 'atacado'
      ? { id: null, ramo: 'atacado', name: '', logo: null, color: '#1F3D2B', segment: 'basico', status: 'em_preparo', primary: false, modules: presetMods('basico') }
      : { id: null, ramo: aba, name: '', logo: null, color: '#1F3D2B', segment: null, status: 'em_preparo', primary: false, modules: Object.fromEntries(modsOf({ ramo: aba }).map(m => [m.code, true])) };
    renderList(); renderEditor();
  }
  function presetMods(seg) { const s = D.segments.find(x => x.id === seg); const m = {}; D.modules.forEach(x => { m[x.code] = x.essential ? true : !!(s && s.modules[x.code]); }); return m; }
  function matchSegment() { return (D.segments.find(s => D.modules.every(m => m.essential || !!s.modules[m.code] === !!draft.modules[m.code])) || {}).id || null; }

  function renderTabs() {
    const n = k => k === 'banco' ? (D.bancos || []).length : D.tenants.filter(t => ramoOf(t) === k).length;
    $('#rtabs').innerHTML = ABAS.map(([k, lb]) => `<button type="button" role="tab" data-aba="${k}" aria-selected="${aba === k}">${lb} <small>${n(k)}</small></button>`).join('');
    $('#rtabs').querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.aba === aba) return;
      if (dirty && !confirm('Sair sem salvar as mudanças?')) return;
      aba = b.dataset.aba; segUI = null;
      if (aba === 'banco') { dirty = false; return pickBanco(bancoDe(BK.sel) ? BK.sel : (D.bancos[0] || {}).id || null); }
      pick((naAba()[0] || {}).id || null);
    }));
  }
  function renderList() {
    renderTabs();
    const L = $('#tlist');
    document.querySelector('nav .head h2').textContent = aba === 'banco' ? 'Bancos' : 'Empresas';
    $('#newT').textContent = aba === 'banco' ? '+ Novo' : '+ Nova';
    if (aba === 'banco') {
      L.innerHTML = (D.bancos || []).map(b => { const ne = D.tenants.filter(t => t.banco === b.id).length; return `<button type="button" class="tn" data-b="${esc(b.id)}" aria-current="${b.id === BK.sel}"><b>${esc(b.name)}</b><span>${fmtN(b.produtos)} produtos · ${ne} empresa${ne === 1 ? '' : 's'}</span></button>`; }).join('')
        + (BK.sel === null ? '<button type="button" class="tn" aria-current="true"><b>Novo banco de dados</b><span>ainda não salvo</span></button>' : '');
      L.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => pickBanco(b.dataset.b)));
      return;
    }
    const lista = naAba();
    L.innerHTML = (!lista.length && sel !== null ? '<p class="small muted" style="margin:0">Nenhuma empresa aqui ainda. Toque em "+ Nova".</p>' : '') + lista.map(t => `<button type="button" class="tn" data-t="${esc(t.id)}" aria-current="${t.id === sel}"><b>${esc(t.name)}${t.primary ? ' <span class="st ativa">principal</span>' : ''}</b><span>${esc(ramoOf(t) !== 'atacado' ? RAMO_UI[ramoOf(t)].tipo : (D.segments.find(s => s.id === t.segment) || {}).name || 'Sem segmento')} · <span class="st ${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span></span></button>`).join('')
      + (sel === null ? `<button type="button" class="tn" aria-current="true"><b>${aba !== 'atacado' ? RAMO_UI[aba].novo : 'Nova empresa'}</b><span>ainda não salva</span></button>` : '');
    L.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(b.dataset.t); }));
  }
  $('#newT').addEventListener('click', () => { if (aba === 'banco') return pickBanco(null); if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(null); });

  function renderEditor() {
    if (aba === 'banco') return renderBanco();
    if (ramoOf(draft) !== 'atacado') return renderRamo();
    const t = draft, on = Object.entries(t.modules).filter(([k, v]) => v).length, seg = matchSegment();
    const groups = [...new Set(D.modules.map(m => m.group))];
    $('#editor').innerHTML = `
    <section class="card top">
      <div><h1>${esc(t.name || 'Nova empresa')}</h1><p class="muted small" style="margin:4px 0 0">${on} de ${D.modules.length} módulos ligados · essenciais sempre ativos</p></div>
      <div class="field" style="min-width:180px"><label for="fst">Situação</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''} ${t.primary && k !== 'ativa' ? 'disabled' : ''}>${v}</option>`).join('')}</select></div>
    </section>
    <details class="card fold" data-k="who"><summary><h2 id="hwho">Quem usa o sistema</h2><span class="sum">${t.modules.app_cliente ? 'Equipe e clientes' : 'Só a equipe'}</span></summary><div class="fb">
      <p class="muted small" style="margin:0">Sem app do cliente, a vitrine e tudo o que é do cliente ficam desligados: os pedidos entram pelos vendedores e pela loja.</p>
      <div class="presets"><button type="button" data-who="0" aria-pressed="${!t.modules.app_cliente}">Só a equipe (cliente compra pelo vendedor)</button><button type="button" data-who="1" aria-pressed="${!!t.modules.app_cliente}">Equipe e clientes (app do cliente)</button></div>
    </div></details>
    <details class="card fold" data-k="stk"><summary><h2 id="hstk">Venda sem estoque</h2><span class="sum">${t.modules.trava_estoque ? 'Não permite' + (t.modules.trava_reservado ? ' · desconta reservado' : '') : 'Permite'}</span></summary><div class="fb">
      <p class="muted small" style="margin:0">Não permitindo, o pedido do cliente ou do vendedor acima do estoque é recusado ("Só temos X un."). A loja sempre pode lançar.</p>
      <div class="presets"><button type="button" data-stk="0" aria-pressed="${!t.modules.trava_estoque}">Permitir venda sem estoque</button><button type="button" data-stk="1" aria-pressed="${!!t.modules.trava_estoque}">Não permitir venda sem estoque</button></div>
      ${t.modules.trava_estoque ? `<label class="subopt"><input type="checkbox" id="fstkres" ${t.modules.trava_reservado ? 'checked' : ''}><span><b>Descontar o que já está reservado</b><span class="small muted">Compara com o estoque menos o que os outros pedidos em aberto já vão levar.</span></span></label>` : ''}
    </div></details>
    ${t.id ? accessCard(t) : '<div class="note">Salve a empresa para gerar o endereço e o acesso do administrador dela.</div>'}
    <details class="card fold" data-k="id"><summary><h2 id="hid">Identidade da marca</h2><span class="sum">${esc(t.name || '')}${t.logo ? ' · com logo' : ''}${t.color ? ' · ' + esc(t.color) : ''}</span></summary><div class="fb" style="gap:14px">
      <div class="grid">
        <div class="field"><label for="fname">Nome exibido no sistema</label><input type="text" id="fname" maxlength="80" value="${esc(t.name)}"></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:var(--muted)">Logo</span>
          <div class="logo-row"><div class="logo-box">${t.logo ? `<img src="${esc(t.logo)}" alt="Logo atual">` : 'LOGO'}</div>
          <label class="btn" for="flogo" style="display:inline-flex;align-items:center">Enviar imagem</label><input type="file" id="flogo" accept="image/*" hidden>
          ${t.logo ? '<button class="btn" type="button" id="frmlogo">Tirar</button>' : ''}</div></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:var(--muted)">Cor principal</span>
          <div class="sw">${SWATCHES.map(([c, n]) => `<button type="button" data-c="${c}" aria-label="${n}" aria-pressed="${(t.color || '').toUpperCase() === c}" style="background:${c}"></button>`).join('')}<input type="color" id="fcolor" aria-label="Outra cor" value="${esc(t.color || '#1F3D2B')}"></div>
          ${t.primary && !t.color ? '<span class="small muted">Sem cor escolhida: o app mantém as cores atuais.</span>' : ''}</div>
      </div>
      <div class="preview"><span class="small muted">Prévia do botão da loja:</span><span class="pv-btn" style="background:${esc(t.color || '#E11F2C')}">Finalizar pedido</span></div>
    </div></details>
    <details class="card fold" data-k="seg"><summary><h2 id="hseg">Modelo por segmento</h2><span class="sum">${seg ? esc((D.segments.find(s => s.id === seg) || {}).name || '') : 'Personalizado'}</span></summary><div class="fb">
      <p class="muted small" style="margin:0">Aplica um pacote pronto de módulos. Depois dá para ajustar um por um.</p>
      <div class="presets">${D.segments.map(s => `<button type="button" data-seg="${esc(s.id)}" aria-pressed="${seg === s.id}">${esc(s.name)}</button>`).join('')}${seg ? '' : '<button type="button" aria-pressed="true" disabled>Personalizado</button>'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn dark" id="segNew">+ Criar segmento</button><button type="button" class="btn" id="segList">Editar segmentos</button></div>
    </div></details>
    ${groups.filter(g => g !== 'Acesso').map(g => { const gm = D.modules.filter(m => m.group === g), gon = gm.filter(m => m.essential || (t.modules[m.code] && !(m.requires && !t.modules[m.requires]))).length; return `<details class="card grp fold" data-k="g:${esc(g)}"><summary><h2>${esc(g)}</h2><span class="sum">${g === 'Essenciais' ? 'Sempre ativos' : gon + ' de ' + gm.length + ' ligados'}</span></summary><div class="fb">
      ${D.modules.filter(m => m.group === g).map(m => { const blk = m.requires && !t.modules[m.requires]; return `<div class="mod"><div class="t"><div class="n">${esc(m.name)}${blk ? `<span class="tag">precisa de "${esc((D.modules.find(x => x.code === m.requires) || {}).name || m.requires)}"</span>` : !m.essential && !m.enforced ? '<span class="tag">efeito na próxima etapa</span>' : m.enforced === 'tela' ? '<span class="tag">só esconde a tela</span>' : ''}</div><div class="d">${esc(m.desc)}</div></div>
        ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-m="${esc(m.code)}" aria-checked="${!blk && !!t.modules[m.code]}" aria-label="${esc(m.name)}" ${blk ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}><span></span></button>`}</div>` }).join('')}</div></details>`; }).join('')}
    ${bancoCard(t)}
    <div class="bar${dirty ? ' dirty' : ''}"><span>${dirty ? 'Há mudanças sem salvar.' : 'Tudo salvo.'}</span><div style="display:flex;gap:8px"><button class="btn ghost-light" type="button" id="undo" ${dirty ? '' : 'disabled'}>Desfazer</button><button class="btn primary" type="button" id="save" ${dirty ? '' : 'disabled'}>Salvar configuração</button></div></div>`;
    bind();
  }
  /* ---------- Rural e Loja online: mesmo editor, textos de cada segmento ---------- */
  function renderRamo() {
    const t = draft, U = RAMO_UI[ramoOf(t)], mods = modsOf(t), on = mods.filter(m => t.modules[m.code]).length;
    const groups = [...new Set(mods.map(m => m.group))];
    const dono = (t.name || 'Pisaia').trim();
    $('#editor').innerHTML = `
    <section class="card top">
      <div><h1>${esc(t.name || U.novo)}</h1><p class="muted small" style="margin:4px 0 0">${esc(U.tipo)} · ${on} de ${mods.length} funções ligadas · essenciais sempre ativas</p></div>
      <div class="field" style="min-width:180px"><label for="fst">Situação</label><select id="fst">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </section>
    <div class="note">${U.nota(dono)}</div>
    ${t.id ? accessCard(t) : '<div class="note">Salve para gerar o endereço e o acesso.</div>'}
    <details class="card fold" data-k="id"><summary><h2 id="hid">Identidade</h2><span class="sum">${esc(t.name || '')}${t.logo ? ' · com logo' : ''}${t.color ? ' · ' + esc(t.color) : ''}</span></summary><div class="fb" style="gap:14px">
      <div class="grid">
        <div class="field"><label for="fname">${esc(U.nomeLabel)}</label><input type="text" id="fname" maxlength="80" value="${esc(t.name)}" placeholder="${esc(U.exemplo)}"></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Logo</span>
          <div class="logo-row"><div class="logo-box">${t.logo ? `<img src="${esc(t.logo)}" alt="Logo atual">` : 'LOGO'}</div>
          <label class="btn" for="flogo" style="display:inline-flex;align-items:center">Enviar imagem</label><input type="file" id="flogo" accept="image/*" hidden>
          ${t.logo ? '<button class="btn" type="button" id="frmlogo">Tirar</button>' : ''}</div></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Cor principal</span>
          <div class="sw">${SWATCHES.map(([c, n]) => `<button type="button" data-c="${c}" aria-label="${n}" aria-pressed="${(t.color || '').toUpperCase() === c}" style="background:${c}"></button>`).join('')}<input type="color" id="fcolor" aria-label="Outra cor" value="${esc(t.color || '#1F3D2B')}"></div></div>
      </div>
      <div class="preview"><span class="small muted">Prévia do botão:</span><span class="pv-btn" style="background:${esc(t.color || '#1F3D2B')}">${esc(U.botao)}</span></div>
    </div></details>
    ${groups.map(g => { const gm = mods.filter(m => m.group === g), gon = gm.filter(m => m.essential || t.modules[m.code]).length; return `<details class="card grp fold" data-k="g:${esc(g)}"><summary><h2>${esc(g)}</h2><span class="sum">${g === 'Essenciais' ? 'Sempre ativas' : gon + ' de ' + gm.length + ' ligadas'}</span></summary><div class="fb">
      ${mods.filter(m => m.group === g).map(m => `<div class="mod"><div class="t"><div class="n">${esc(m.name)}</div><div class="d">${esc(m.desc)}</div></div>
        ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-m="${esc(m.code)}" aria-checked="${!!t.modules[m.code]}" aria-label="${esc(m.name)}"><span></span></button>`}</div>`).join('')}</div></details>`; }).join('')}
    ${bancoCard(t)}
    <div class="bar${dirty ? ' dirty' : ''}"><span>${dirty ? 'Há mudanças sem salvar.' : 'Tudo salvo.'}</span><div style="display:flex;gap:8px"><button class="btn ghost-light" type="button" id="undo" ${dirty ? '' : 'disabled'}>Desfazer</button><button class="btn primary" type="button" id="save" ${dirty ? '' : 'disabled'}>${t.id ? 'Salvar configuração' : esc(U.criar)}</button></div></div>`;
    bindCommon();
    const E = $('#editor');
    E.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { draft.modules[b.dataset.m] = !draft.modules[b.dataset.m]; touch(); }));
  }
  /* todos os endereços da empresa, conforme os módulos ligados */
  function accessLinks(t, base) {
    if (ramoOf(t) !== 'atacado') return RAMO_UI[ramoOf(t)].links(base);
    // "?v=": muda quando a marca muda, e o WhatsApp busca a prévia nova (ele guarda a antiga por dias)
    const v = t.primary ? '' : '?v=' + (new Date(t.updatedAt || 0).getTime() % 1e8).toString(36);
    const m = t.modules || {}, L = [['Painel do administrador', base + '/' + v + '#admin', 'Dono e gerentes']];
    L.push(['Vendedores', base + '/' + v + '#vendedor', 'Lançar pedidos dos clientes']);
    if (m.app_cliente) L.push(['App dos clientes', base + '/cliente' + v, 'Clientes fazem pedido sozinhos']);
    if (m.pdv) L.push(['Caixa (PDV)', base + '/pdv' + v, 'Operador de caixa, no computador do balcão']);
    if (m.conferencia) L.push(['Conferente', base + '/' + v + '#conferente', 'Separação e conferência']);
    if (m.faturamento) L.push(['Faturamento', base + '/' + v + '#faturamento', 'Notas e pedidos para faturar']);
    if (m.entregas) L.push(['Motoristas', base + '/' + v + '#entregador', 'Entregas e canhotos']);
    return L;
  }
  /* endereço e acesso do administrador da empresa */
  function accessCard(t) {
    const base = location.origin + (t.primary ? '' : '/t/' + t.id), st = t.stats || {};
    const nl = accessLinks(t, base).length;
    return `<details class="card fold" data-k="ac"><summary><h2 id="hac">Acesso da empresa</h2><span class="sum">${nl} endereço${nl === 1 ? '' : 's'}${t.adminLogin ? ' · admin: ' + esc(t.adminLogin) : t.primary ? '' : ' · sem administrador'}</span></summary><div class="fb">
      <div class="links">${accessLinks(t, base).map(([lb, url, note]) => `<div class="lk"><div class="lk-t"><b>${esc(lb)}</b>${note ? `<span class="small muted">${esc(note)}</span>` : ''}</div><code class="link">${esc(url)}</code><div class="lk-b"><button type="button" class="btn" data-copy="${esc(url)}">Copiar</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div></div>`).join('')}</div>
      ${ramoOf(t) !== 'atacado' || t.modules.app_cliente ? '' : '<p class="small muted" style="margin:0">Sem app do cliente: os clientes compram pelo vendedor (não há endereço de cliente).</p>'}
      <p class="small muted" style="margin:0">${ramoOf(t) !== 'atacado' ? RAMO_UI[ramoOf(t)].stats(st) : `${st.products || 0} produtos · ${st.orders || 0} pedidos`} · ${st.users || 0} usuários${t.adminLogin ? ' · administrador: ' + esc(t.adminLogin) : ''}</p>
      ${t.primary ? '<p class="small muted" style="margin:0">A empresa principal cuida dos próprios acessos pelo painel dela.</p>' : `
      <div class="logo-row">
        <div class="field" style="flex:1 1 200px"><label for="alog">${ramoOf(t) !== 'atacado' ? esc(RAMO_UI[ramoOf(t)].usuario) : 'Usuário do administrador'}</label><input type="text" id="alog" value="${esc(t.adminLogin || 'admin')}" maxlength="40" autocapitalize="off" spellcheck="false"></div>
        <button class="btn dark" type="button" id="agen" style="align-self:end">${t.adminLogin ? 'Gerar nova senha' : ramoOf(t) !== 'atacado' ? esc(RAMO_UI[ramoOf(t)].acesso) : 'Criar acesso do administrador'}</button>
      </div>
      <div id="aout" aria-live="polite"></div>
      <div class="logo-row" style="align-items:center"><button class="btn" type="button" id="aent">Entrar como esta empresa</button>
        <span class="small muted" style="flex:1 1 220px">${t.adminLogin || st.admins ? 'Abre o app numa aba nova como o administrador, sem trocar a senha dele. Vale 1 hora, mostra um aviso vermelho e fica no histórico. Neste navegador fica aberta uma empresa por vez.' : 'Esta empresa ainda não tem administrador: crie o acesso logo acima e depois entre por aqui.'}</span></div>`}
    </div></details>`;
  }
  async function genAdmin() {
    const login = $('#alog').value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) { toast('Usuário: de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).'); $('#alog').focus(); return; }
    if (draft.adminLogin && !confirm('Gerar uma nova senha derruba o acesso atual do administrador desta empresa. Continuar?')) return;
    const b = $('#agen'); b.disabled = true;
    try {
      const r = await api('/api/central/tenant-admin', { id: draft.id, login });
      const url = location.origin + '/t/' + r.tenant + (ramoOf(draft) !== 'atacado' ? '/' : '/#admin');
      $('#aout').innerHTML = `<div class="note" style="display:grid;gap:6px"><b>Anote agora: esta senha aparece só uma vez.</b>
        <span>Endereço: <code class="link">${esc(url)}</code></span><span>Usuário: <code>${esc(r.login)}</code></span><span>Senha provisória: <code style="font-size:17px">${esc(r.password)}</code></span>
        <span class="small">No primeiro acesso, a pessoa cria a senha dela.</span></div>`;
      const t = D.tenants.find(x => x.id === draft.id); if (t) { t.adminLogin = r.login; draft.adminLogin = r.login; }
      b.textContent = 'Gerar nova senha';
      const sn = $('#aent') && $('#aent').nextElementSibling; if (sn) sn.textContent = 'Abre o app numa aba nova como o administrador, sem trocar a senha dele. Vale 1 hora, mostra um aviso vermelho e fica no histórico. Neste navegador fica aberta uma empresa por vez.';
    } catch (e) { if (e.status === 401) return showLogin('Sua sessão terminou. Entre de novo.'); toast(e.message); }
    finally { b.disabled = false; }
  }
  /* suporte: abre o app da empresa numa aba nova, já entrado como o administrador */
  async function entrar() {
    const b = $('#aent'); b.disabled = true;
    const w = window.open('', '_blank');
    try {
      const r = await api('/api/central/entrar', { id: draft.id });
      if (w) { w.opener = null; w.location.href = r.url; }
      else if (!dirty || confirm('O navegador bloqueou a aba nova. Abrir aqui mesmo (perde o que não foi salvo)?')) location.href = r.url;
    } catch (e) { if (w) w.close(); if (e.status === 401) return showLogin('Sua sessão terminou. Entre de novo.'); toast(e.message); }
    finally { b.disabled = false; }
  }
  function touch() { dirty = true; const y = window.scrollY; renderEditor(); window.scrollTo(0, y); }
  function bindCommon() {
    const E = $('#editor');
    $('#fname').addEventListener('input', e => { draft.name = e.target.value; dirty = true; E.querySelector('h1').textContent = draft.name || (ramoOf(draft) !== 'atacado' ? RAMO_UI[ramoOf(draft)].novo : 'Nova empresa'); $('#save').disabled = false; $('#undo').disabled = false; const bar = E.querySelector('.bar'); bar.classList.add('dirty'); bar.querySelector('span').textContent = 'Há mudanças sem salvar.'; });
    $('#fst').addEventListener('change', e => { draft.status = e.target.value; touch(); });
    E.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { draft.color = b.dataset.c; touch(); }));
    $('#fcolor').addEventListener('change', e => { draft.color = e.target.value.toUpperCase(); touch(); });
    const rm = $('#frmlogo'); if (rm) rm.addEventListener('click', () => { draft.logo = null; touch(); });
    $('#flogo').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readLogo(f); });
    $('#undo').addEventListener('click', () => pick(sel));
    $('#save').addEventListener('click', save);
    const ag = $('#agen'); if (ag) ag.addEventListener('click', genAdmin);
    const ae = $('#aent'); if (ae) ae.addEventListener('click', entrar);
    bindBancoCard();
    E.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Endereço copiado'); } catch (e) { toast('Não consegui copiar: selecione o endereço e copie.'); } }));
  }
  function bind() {
    const E = $('#editor');
    $('#fname').addEventListener('input', e => { draft.name = e.target.value; dirty = true; E.querySelector('h1').textContent = draft.name || 'Nova empresa'; $('#save').disabled = false; $('#undo').disabled = false; const bar = E.querySelector('.bar'); bar.classList.add('dirty'); bar.querySelector('span').textContent = 'Há mudanças sem salvar.'; });
    $('#fst').addEventListener('change', e => { draft.status = e.target.value; touch(); });
    E.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { draft.color = b.dataset.c; touch(); }));
    $('#fcolor').addEventListener('change', e => { draft.color = e.target.value.toUpperCase(); touch(); });
    E.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { draft.segment = b.dataset.seg; draft.modules = presetMods(b.dataset.seg); touch(); }));
    E.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; draft.modules[b.dataset.m] = !draft.modules[b.dataset.m]; touch(); }));
    E.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { const on = b.dataset.who === '1'; draft.modules.app_cliente = on; if (!on) D.modules.forEach(m => { if (m.requires === 'app_cliente') draft.modules[m.code] = false; }); touch(); }));
    E.querySelectorAll('[data-stk]').forEach(b => b.addEventListener('click', () => { draft.modules.trava_estoque = b.dataset.stk === '1'; if (!draft.modules.trava_estoque) draft.modules.trava_reservado = false; touch(); }));
    { const r = $('#fstkres'); if (r) r.addEventListener('change', () => { draft.modules.trava_reservado = r.checked; touch(); }); }
    const rm = $('#frmlogo'); if (rm) rm.addEventListener('click', () => { draft.logo = null; touch(); });
    $('#flogo').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readLogo(f); });
    $('#undo').addEventListener('click', () => pick(sel));
    $('#save').addEventListener('click', save);
    const ag = $('#agen'); if (ag) ag.addEventListener('click', genAdmin);
    const ae = $('#aent'); if (ae) ae.addEventListener('click', entrar);
    bindBancoCard();
    E.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Endereço copiado'); } catch (e) { toast('Não consegui copiar: selecione o endereço e copie.'); } }));
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
  /* aceita qualquer imagem que o navegador abra (PNG, JPG, WEBP, GIF, BMP, SVG, HEIC no iPhone...),
     de qualquer tamanho, e o próprio sistema reduz e compacta até caber no limite do servidor */
  function readLogo(f) {
    if (f.type && !/^image\//.test(f.type)) { toast('Esse arquivo não é uma imagem.'); return; }
    if (f.size > 40 * 1024 * 1024) { toast('Imagem enorme (mais de 40 MB). Tire uma foto menor ou reduza antes.'); return; }
    const LIM = 380 * 1024, img = new Image(), fr = new FileReader();
    /* data: (e não blob:) porque a página só permite imagens data: */
    fr.onerror = () => toast('Não consegui ler esse arquivo.');
    fr.onload = () => { img.src = fr.result; };
    img.onload = () => {
      const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      const tenta = (lado, tipo, q) => {
        const k = Math.min(1, lado / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        const x = c.getContext('2d');
        if (tipo === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL(tipo, q);
      };
      const ok = d => /^data:image\/(png|jpeg|webp);base64,/.test(d) && d.length <= LIM;
      let out = null;
      for (const lado of [512, 384, 256, 192, 128]) {
        for (const [tipo, q] of [['image/png'], ['image/webp', .9], ['image/jpeg', .85]]) {
          const d = tenta(lado, tipo, q); if (ok(d)) { out = d; break; }
        }
        if (out) break;
      }
      if (!out) { toast('Não consegui reduzir essa imagem. Tente outra.'); return; }
      draft.logo = out; touch();
    };
    img.onerror = () => toast('Não consegui abrir essa imagem (formato HEIC/RAW?). Salve como JPG ou PNG e tente de novo.');
    fr.readAsDataURL(f);
  }
  /* ---------- Banco de dados de produtos (cadastro mestre) ---------- */
  /* Um banco guarda código interno, código de barras, nome, foto e custo. Cada empresa escolhe o banco que usa. */
  const BK = { sel: undefined, f: 'todos', q: '', p: 0, L: null, jobs: null, edit: null, novoP: false, fotoP: undefined, out: {} };
  const bancoDe = id => (D && D.bancos || []).find(b => b.id === id) || null;
  const usaBanco = t => (D.bancoRamos || []).includes(ramoOf(t));
  const fmtN = n => Number(n || 0).toLocaleString('pt-BR');
  const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 });
  const fotoUrl = id => '/api/central/banco/foto?b=' + encodeURIComponent(BK.sel) + '&id=' + encodeURIComponent(id);
  const pl = (n, um, varios) => fmtN(n) + ' ' + (n === 1 ? um : varios);
  const sessao = e => { if (e.status === 401) { showLogin('Sua sessão terminou. Entre de novo.'); return true; } return false; };
  /* o que entrou no banco quando a empresa foi ligada (ou quando se trouxe de novo) */
  function trouxeTxt(x) {
    if (!x || x.pulou) return 'Este tipo de empresa não tem produtos para trazer.';
    const partes = [pl(x.produtos, 'produto novo', 'produtos novos'), pl(x.fotos, 'foto', 'fotos'), pl(x.custos, 'custo', 'custos')];
    return 'Entraram no banco: ' + partes.join(', ') + '.' + (x.semCodigo ? ' ' + (ramoOf({ ramo: (D.tenants.find(t => t.id === x.empresa) || {}).ramo }) === 'encartes' ? pl(x.semCodigo, 'foto sem código ficou', 'fotos sem código ficaram') : pl(x.semCodigo, 'produto sem código ficou', 'produtos sem código ficaram')) + ' de fora.' : '');
  }
  /* dentro da empresa: "Utilizar banco de dados" abre a lista dos bancos; tocar num deles liga na hora */
  function bancoCard(t) {
    if (!t.id || !usaBanco(t) || !(D.bancos || []).length) return '';
    const cur = bancoDe(t.banco);
    return `<details class="card fold" data-k="bk"><summary><h2 id="hbk">Utilizar banco de dados</h2><span class="sum">${cur ? esc(cur.name) : 'Nenhum'}</span></summary><div class="fb">
      <p class="muted small" style="margin:0">${ramoOf(t) === 'encartes' ? 'Com um banco ligado, o produto com código já aparece no encarte com o nome e a foto do banco, e a foto nova colocada no encarte sobe para o banco.' : 'Com um banco ligado, o cadastro de produto busca nome, código de barras, custo e foto pelo código, na hora. E o produto com código que for salvo aqui sobe sozinho para o banco: a foto nova troca a do banco; nome e custo só entram onde o banco está vazio.'} Ao ligar, o que esta empresa já tem (produtos com código, fotos e custos) entra no banco.</p>
      <div class="presets" id="bkUse">${D.bancos.map(b => `<button type="button" data-bk="${esc(b.id)}" aria-pressed="${t.banco === b.id}">${esc(b.name)}</button>`).join('')}<button type="button" data-bk="" aria-pressed="${!t.banco}">Nenhum</button></div>
      <div id="bkOut" aria-live="polite">${BK.out[t.id] ? `<div class="note">${esc(BK.out[t.id])}</div>` : ''}</div>
    </div></details>`;
  }
  function bindBancoCard() { document.querySelectorAll('#bkUse [data-bk]').forEach(b => b.addEventListener('click', () => usarBanco(b.dataset.bk))); }
  async function usarBanco(id) {
    if ((draft.banco || '') === id) return;
    const bs = document.querySelectorAll('#bkUse [data-bk]'); bs.forEach(b => { b.disabled = true; });
    $('#bkOut').innerHTML = '<p class="small muted" style="margin:0">' + (id ? 'Ligando e trazendo os produtos desta empresa…' : 'Desligando…') + '</p>';
    try {
      const r = await api('/api/central/banco/usar', { empresa: draft.id, banco: id || null });
      D.bancos = r.bancos; const t = D.tenants.find(x => x.id === draft.id); if (t) t.banco = r.banco; draft.banco = r.banco;
      BK.out[draft.id] = r.banco ? 'Agora usa o banco ' + (bancoDe(r.banco) || {}).name + '. ' + trouxeTxt(r.trouxe) : 'Esta empresa não usa mais banco de dados. O que ela já colocou no banco continua lá.';
      toast(r.banco ? 'Banco de dados ligado' : 'Banco de dados desligado');
      const y = window.scrollY; renderList(); renderEditor(); window.scrollTo(0, y);
    } catch (e) { if (sessao(e)) return; toast(e.message); bs.forEach(b => { b.disabled = false; }); $('#bkOut').innerHTML = ''; }
  }
  function pickBanco(id) { BK.sel = id; BK.f = 'todos'; BK.q = ''; BK.p = 0; BK.L = null; BK.jobs = null; BK.edit = null; BK.novoP = false; renderList(); renderBanco(); window.scrollTo(0, 0); if (id) loadBanco(); }
  async function loadBanco(soLista) {
    const id = BK.sel; if (!id) return;
    try {
      const [L, Jb] = await Promise.all([
        api('/api/central/banco/produtos?b=' + encodeURIComponent(id) + '&f=' + BK.f + '&p=' + BK.p + '&q=' + encodeURIComponent(BK.q)),
        soLista ? Promise.resolve(BK.jobs) : api('/api/central/banco/jobs?b=' + encodeURIComponent(id))]);
      if (BK.sel !== id) return;
      BK.L = L; BK.jobs = Jb; renderProd(); if (!soLista) renderJobs();
    } catch (e) { if (sessao(e)) return; toast(e.message); }
  }
  async function recarregaBancos() { try { D.bancos = (await api('/api/central/banco/lista')).bancos; renderList(); const h = $('#bkNums'); const b = bancoDe(BK.sel); if (h && b) h.textContent = numsTxt(b); } catch (e) { /* segue com os números antigos */ } }
  const numsTxt = b => `${pl(b.produtos, 'produto', 'produtos')} · ${fmtN(b.comFoto)} com foto · ${fmtN(b.comCusto)} com custo`;
  function renderBanco() {
    const E = $('#editor');
    if (!BK.sel) {
      E.innerHTML = `<section class="card top"><div><h1>Novo banco de dados</h1><p class="muted small" style="margin:4px 0 0">Um banco por sistema de origem: cada cliente tem o dele.</p></div></section>
        <form class="card" id="bkNew" style="display:grid;gap:12px"><div class="grid">
          <div class="field"><label for="bkNm">Nome do banco</label><input type="text" id="bkNm" maxlength="60" placeholder="Ex.: StarIA Mercado do Zé" required></div>
          <div class="field"><label for="bkFl">Filial usada nas consultas</label><input type="text" id="bkFl" inputmode="numeric" maxlength="4" value="1"></div></div>
          <div><button class="btn primary" type="submit">Criar banco</button></div></form>`;
      $('#bkNew').addEventListener('submit', async e => { e.preventDefault(); try { const r = await api('/api/central/banco/salvar', { name: $('#bkNm').value, filial: $('#bkFl').value }); D.bancos = r.bancos; toast('Banco criado'); pickBanco(r.id); } catch (er) { if (sessao(er)) return; toast(er.message); } });
      return;
    }
    const b = bancoDe(BK.sel); if (!b) { E.innerHTML = ''; return; }
    const usam = D.tenants.filter(t => t.banco === b.id), podem = D.tenants.filter(usaBanco);
    E.innerHTML = `
    <section class="card top">
      <div><h1>${esc(b.name)}</h1><p class="muted small" style="margin:4px 0 0" id="bkNums">${numsTxt(b)}</p></div>
      <button class="btn" type="button" id="bkRen">Renomear</button>
    </section>
    <div class="note">O <b>código interno</b> liga o mesmo produto em todos os apps: a foto e o custo são cadastrados uma vez aqui e valem para as empresas que usam este banco.</div>
    <details class="card fold" data-k="bk:emp"><summary><h2>Empresas que usam este banco</h2><span class="sum">${usam.length ? usam.map(t => esc(t.name)).join(', ') : 'Nenhuma ainda'}</span></summary><div class="fb">
      ${usam.length ? `<div class="links">${usam.map(t => `<div class="lk"><div class="lk-t"><b>${esc(t.name)}</b></div><span class="small muted">${esc(ramoOf(t) === 'atacado' ? 'Atacado e varejo' : RAMO_UI[ramoOf(t)].tipo)}</span><div class="lk-b"><button type="button" class="btn" data-go="${esc(t.id)}">Abrir a empresa</button></div></div>`).join('')}</div>` : ''}
      <p class="small muted" style="margin:0">Para ligar uma empresa: abra a empresa e, no fim da tela, toque em <b>Utilizar banco de dados</b>.</p>
    </div></details>
    <details class="card fold" data-k="bk:imp"><summary><h2>Trazer o que já está nas empresas</h2><span class="sum">produtos com código, fotos e custos</span></summary><div class="fb">
      <p class="muted small" style="margin:0">Só preenche o que está vazio: o que já está no banco não muda. Custo de embalagem (fardo, caixa) entra dividido pela quantidade. Pode repetir quando quiser.</p>
      ${podem.length ? podem.map(t => `<label class="subopt" style="margin-top:0"><input type="checkbox" data-imp="${esc(t.id)}" checked><span><b>${esc(t.name)}</b><span class="small muted">${esc(ramoOf(t) === 'atacado' ? `App de pedidos · ${fmtN((t.stats || {}).products)} produtos` : 'Gerador de Encartes · produtos e fotos com código')}${t.banco === b.id ? ' · usa este banco' : ''}</span></span></label>`).join('') : '<p class="small muted" style="margin:0">Nenhuma empresa de atacado ou de encartes ainda.</p>'}
      <div><button class="btn dark" type="button" id="bkImp" ${podem.length ? '' : 'disabled'}>Trazer agora</button></div>
      <div id="bkImpOut" aria-live="polite"></div>
    </div></details>
    <details class="card fold" data-k="bk:arq"><summary><h2>Importar todos os produtos do StarIA</h2><span class="sum">arquivo da página Exportar StarIA</span></summary><div class="fb">
      <p class="muted small" style="margin:0">Para trazer o cadastro inteiro de uma vez, sem gastar o Claude: abra a página <b>Exportar StarIA</b> (nos seus artefatos do Claude), toque em Puxar produtos, baixe o arquivo e envie aqui. O StarIA manda no nome, no código de barras e no preço de venda; foto e custo do banco não mudam. Pode repetir quando quiser.</p>
      <div><label class="btn dark" for="bkArq" style="display:inline-flex;align-items:center">Enviar arquivo</label><input type="file" id="bkArq" accept=".json,.txt,application/json,text/plain" hidden></div>
      <div id="bkArqOut" aria-live="polite"></div>
    </div></details>
    <details class="card fold" data-k="bk:st"><summary><h2>Atualizar pelo StarIA</h2><span class="sum" id="bkStSum"></span></summary><div class="fb" id="bkSt"><p class="small muted" style="margin:0">Carregando…</p></div></details>
    <section class="card" style="display:grid;gap:10px">
      <div class="bk-bar"><h2>Produtos</h2><div style="display:flex;gap:6px;flex-wrap:wrap"><label class="btn" for="bkFotos" style="display:inline-flex;align-items:center" title="O nome de cada arquivo é o código interno ou o código de barras">Enviar várias fotos</label><input type="file" id="bkFotos" accept="image/*" multiple hidden><button class="btn dark" type="button" id="bkAdd">+ Produto</button></div></div>
      <input type="text" id="bkQ" placeholder="Buscar por nome, código ou código de barras" value="${esc(BK.q)}" aria-label="Buscar produto">
      <div class="presets" id="bkTabs"></div>
      <div id="bkFotosOut" aria-live="polite"></div>
      <div id="bkNovo"></div>
      <div id="bkRows"><p class="small muted" style="margin:0">Carregando…</p></div>
      <div class="bk-bar" id="bkPag"></div>
    </section>`;
    $('#bkRen').addEventListener('click', async () => { const n = prompt('Nome do banco de dados:', b.name); if (n == null || !n.trim() || n.trim() === b.name) return; try { const r = await api('/api/central/banco/salvar', { id: b.id, name: n, filial: b.filial }); D.bancos = r.bancos; toast('Nome salvo'); renderList(); renderBanco(); renderProd(); renderJobs(); } catch (e) { if (sessao(e)) return; toast(e.message); } });
    E.querySelectorAll('[data-go]').forEach(x => x.addEventListener('click', () => { const t = D.tenants.find(y => y.id === x.dataset.go); if (!t) return; aba = ramoOf(t); pick(t.id); window.scrollTo(0, 0); }));
    $('#bkImp').addEventListener('click', importarBanco);
    $('#bkArq').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importarArquivo(f); });
    let tq; $('#bkQ').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { BK.q = e.target.value.trim(); BK.p = 0; BK.edit = null; loadBanco(true); }, 300); });
    $('#bkAdd').addEventListener('click', () => { BK.novoP = !BK.novoP; BK.edit = null; BK.fotoP = undefined; renderProd(); const c = $('#bpC'); if (c) c.focus(); });
    $('#bkFotos').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) fotosPorNome(fs); });
    if (BK.L) { renderProd(); renderJobs(); }
  }
  async function importarBanco() {
    const ids = [...document.querySelectorAll('[data-imp]:checked')].map(x => x.dataset.imp), out = $('#bkImpOut'), bt = $('#bkImp');
    if (!ids.length) { toast('Marque pelo menos uma empresa.'); return; }
    bt.disabled = true; out.innerHTML = '<p class="small muted" style="margin:0">Trazendo… pode levar alguns segundos quando há muitas fotos.</p>';
    const linhas = [];
    try {
      // uma empresa por vez: cada pedido termina dentro do tempo do servidor, mesmo com muitas fotos
      for (const id of ids) { const r = await api('/api/central/banco/importar', { banco: BK.sel, empresas: [id] }); D.bancos = r.bancos; linhas.push(r.empresas[0]); out.innerHTML = linhas.map(x => `<div class="note" style="margin-top:6px"><b>${esc(x.nome)}</b>: ${esc(trouxeTxt(x))}</div>`).join(''); }
      toast('Pronto: banco atualizado'); renderList(); const h = $('#bkNums'), b = bancoDe(BK.sel); if (h && b) h.textContent = numsTxt(b); BK.p = 0; loadBanco(true);
    } catch (e) { if (sessao(e)) return; toast(e.message); out.innerHTML += `<div class="err">${esc(e.message)}</div>`; }
    finally { bt.disabled = false; }
  }
  /* arquivo com todos os produtos do StarIA: lido aqui e enviado em pedaços de 500 */
  async function importarArquivo(f) {
    const out = $('#bkArqOut');
    let itens;
    try { const j = JSON.parse(await f.text()); itens = Array.isArray(j) ? j : j && j.itens; if (!Array.isArray(itens) || !itens.length) throw 0; }
    catch (e) { out.innerHTML = '<div class="err">Este não é o arquivo da página Exportar StarIA.</div>'; return; }
    let aceitos = 0, novos = 0, ruins = 0, total = 0;
    try {
      for (let i = 0; i < itens.length; i += 500) {
        out.innerHTML = `<p class="small muted" style="margin:0">Enviando ${fmtN(Math.min(itens.length, i + 500))} de ${fmtN(itens.length)} produtos…</p>`;
        const r = await api('/api/central/banco/arquivo', { banco: BK.sel, itens: itens.slice(i, i + 500) });
        aceitos += r.aceitos; novos += r.novos; ruins += r.ruins; total = r.total;
      }
      out.innerHTML = `<div class="note"><b>${pl(aceitos, 'produto importado', 'produtos importados')}</b>: ${pl(novos, 'novo', 'novos')} e ${fmtN(aceitos - novos)} atualizados. O banco agora tem ${fmtN(total)}.${ruins ? ' ' + pl(ruins, 'linha sem código ou sem nome ficou', 'linhas sem código ou sem nome ficaram') + ' de fora.' : ''}</div>`;
      toast('Importação concluída'); BK.p = 0; await loadBanco(true); recarregaBancos();
    } catch (e) { if (sessao(e)) return; out.innerHTML = `<div class="err">Parou em ${fmtN(aceitos)} produtos: ${esc(e.message)} Envie o arquivo de novo: o que já entrou não duplica.</div>`; loadBanco(true); recarregaBancos(); }
  }
  /* ----- pedidos ao StarIA: o site não fala com o StarIA; o Claude lê o pedido, consulta e devolve ----- */
  function renderJobs() {
    const box = $('#bkSt'); if (!box) return;
    const P = (BK.jobs && BK.jobs.pedidos) || [], pend = P.find(j => j.status === 'pendente'), ult = P.find(j => j.status === 'pronta');
    $('#bkStSum').textContent = pend ? `pedido esperando o Claude (${pend.termos.length} códigos)` : ult ? 'última em ' + dt(ult.prontoEm) : 'nome, código de barras e preço';
    const ultTxt = ult ? `<p class="small muted" style="margin:0">Última atualização: ${esc(dt(ult.prontoEm))} · ${pl((ult.resumo || {}).atualizados || 0, 'produto atualizado', 'produtos atualizados')}${((ult.resumo || {}).naoAchou || []).length ? ' · não encontrados: ' + esc(ult.resumo.naoAchou.slice(0, 30).join(', ')) : ''}</p>` : '';
    box.innerHTML = pend ? `
      <div class="note"><b>Pedido esperando o Claude</b> · ${pl(pend.termos.length, 'código', 'códigos')} · pedido em ${esc(dt(pend.pedidoEm))}.<br>Com esta tela aberta no computador, peça ao Claude: <b>"processa o banco de dados"</b> (atalho: <code>1414</code>). Quando ele terminar, toque em Conferir.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" type="button" id="bkChk">Conferir</button><button class="btn" type="button" id="bkCan">Cancelar pedido</button></div>${ultTxt}` : `
      <p class="muted small" style="margin:0">O StarIA confere o <b>nome</b>, o <b>código de barras</b> e o <b>preço de venda</b> de cada código. O custo não vem daqui por enquanto: fica o que veio das empresas ou o que você digitar. Em branco, o pedido pega até 200 produtos do banco, começando pelos que nunca foram conferidos.</p>
      <div class="field"><label for="bkCod">Códigos para buscar (opcional: código interno ou código de barras, um por linha)</label><textarea id="bkCod" rows="3" placeholder="Em branco = conferir os produtos que já estão no banco"></textarea></div>
      <div><button class="btn dark" type="button" id="bkPed">Pedir atualização</button></div>${ultTxt}`;
    const ped = $('#bkPed'); if (ped) ped.addEventListener('click', async () => { ped.disabled = true; try { const r = await api('/api/central/banco/pedir', { banco: BK.sel, codigos: $('#bkCod').value }); toast(r.jaPedido ? 'Já havia um pedido esperando' : 'Pedido criado'); BK.jobs = await api('/api/central/banco/jobs?b=' + encodeURIComponent(BK.sel)); renderJobs(); } catch (e) { if (sessao(e)) return; toast(e.message); ped.disabled = false; } });
    const can = $('#bkCan'); if (can) can.addEventListener('click', async () => { if (!confirm('Cancelar o pedido que está esperando?')) return; try { await api('/api/central/banco/pedido-cancelar', { id: pend.id }); } catch (e) { if (sessao(e)) return; toast(e.message); } loadBanco(); });
    const chk = $('#bkChk'); if (chk) chk.addEventListener('click', async () => { await loadBanco(); recarregaBancos(); const p2 = ((BK.jobs && BK.jobs.pedidos) || []).find(j => j.status === 'pendente'); toast(p2 ? 'O pedido ainda está esperando o Claude' : 'Banco atualizado pelo StarIA'); });
  }
  /* ----- lista de produtos ----- */
  const FILTROS_BK = [['todos', 'Todos'], ['semfoto', 'Sem foto'], ['semcusto', 'Sem custo'], ['erros', 'Possivelmente errados']];
  function formProd(x) {
    const novo = !x; x = x || { codigo: '', nome: '', ean: '', custo: null, foto: null };
    return `<form class="bp-form" id="bpF">
      <div class="grid">
        ${novo ? '<div class="field"><label for="bpC">Código interno</label><input type="text" id="bpC" maxlength="30" autocapitalize="off" spellcheck="false" required></div>' : ''}
        <div class="field"><label for="bpN">Nome</label><input type="text" id="bpN" maxlength="160" value="${esc(x.nome)}"></div>
        <div class="field"><label for="bpE">Código de barras</label><input type="text" id="bpE" inputmode="numeric" maxlength="14" value="${esc(x.ean)}"></div>
        <div class="field"><label for="bpK">Custo de uma unidade (R$)</label><input type="text" id="bpK" inputmode="decimal" maxlength="14" value="${x.custo == null ? '' : esc(String(x.custo).replace('.', ','))}"></div>
      </div>
      <div class="logo-row"><label class="btn" for="bpFo" style="display:inline-flex;align-items:center">${x.foto ? 'Trocar foto' : 'Enviar foto'}</label><input type="file" id="bpFo" accept="image/*" hidden>${x.foto ? '<button type="button" class="btn" id="bpRm">Tirar foto</button>' : ''}<span class="small muted" id="bpFn"></span></div>
      <div class="err" id="bpErr" role="alert"></div>
      <div class="bk-bar">${novo ? '<span></span>' : '<button type="button" class="btn" id="bpDel" style="color:var(--danger)">Apagar do banco</button>'}<div style="display:flex;gap:8px"><button type="button" class="btn" id="bpX">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></div>
    </form>`;
  }
  function renderProd() {
    const L = BK.L, rows = $('#bkRows'); if (!L || !rows) return;
    const T = L.totais;
    $('#bkTabs').innerHTML = FILTROS_BK.map(([k, lb]) => `<button type="button" data-f="${k}" aria-pressed="${BK.f === k}">${lb} <small>${fmtN(T[k])}</small></button>`).join('');
    $('#bkTabs').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { if (BK.f === b.dataset.f) return; BK.f = b.dataset.f; BK.p = 0; BK.edit = null; loadBanco(true); }));
    $('#bkNovo').innerHTML = BK.novoP ? `<div class="bp on"><div class="bp-t" style="grid-column:1/-1"><b>Novo produto</b></div>${formProd(null)}</div>` : '';
    rows.innerHTML = L.itens.length ? L.itens.map(x => `<div class="bp${BK.edit === x.codigo ? ' on' : ''}">
        <div class="bp-f">${x.foto ? `<img loading="lazy" alt="" src="${esc(fotoUrl(x.foto))}">` : '<span>sem foto</span>'}</div>
        <div class="bp-t"><b>${x.nome ? esc(x.nome) : '<span class="muted">(sem nome)</span>'}</b><span class="small muted">Cód. ${esc(x.codigo)}${x.ean ? ' · ' + esc(x.ean) : ''}${x.preco != null ? ' · venda ' + brl(x.preco) : ''}</span>${x.erros.length ? `<span class="bp-e">${x.erros.map(e => `<span class="tag warn">${esc(e)}</span>`).join('')}</span>` : ''}</div>
        <div class="bp-c"><b class="num">${x.custo == null ? '—' : brl(x.custo)}</b><span class="small muted">${x.custo == null ? 'sem custo' : esc(x.custoFonte)}</span></div>
        <div class="bp-a"><button type="button" class="btn" data-ed="${esc(x.codigo)}">${BK.edit === x.codigo ? 'Fechar' : 'Editar'}</button></div>
        ${BK.edit === x.codigo ? formProd(x) : ''}</div>`).join('')
      : `<p class="small muted" style="margin:0">${T.todos ? 'Nenhum produto neste filtro.' : BK.q ? 'Nenhum produto com essa busca.' : 'O banco ainda está vazio. Abra "Trazer o que já está nas empresas" logo acima.'}</p>`;
    const ini = L.pagina * L.porPagina, tot = T[BK.f];
    $('#bkPag').innerHTML = tot > L.porPagina ? `<span class="small muted">${fmtN(ini + 1)}–${fmtN(Math.min(tot, ini + L.itens.length))} de ${fmtN(tot)}</span><div style="display:flex;gap:6px"><button class="btn" type="button" id="bkPrev" ${L.pagina ? '' : 'disabled'}>Anterior</button><button class="btn" type="button" id="bkNext" ${ini + L.itens.length < tot ? '' : 'disabled'}>Próxima</button></div>` : '';
    const pv = $('#bkPrev'), nx = $('#bkNext');
    if (pv) pv.addEventListener('click', () => { BK.p = Math.max(0, BK.p - 1); BK.edit = null; loadBanco(true).then(() => $('#bkQ').scrollIntoView({ block: 'start' })); });
    if (nx) nx.addEventListener('click', () => { BK.p++; BK.edit = null; loadBanco(true).then(() => $('#bkQ').scrollIntoView({ block: 'start' })); });
    rows.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => { BK.edit = BK.edit === b.dataset.ed ? null : b.dataset.ed; BK.novoP = false; BK.fotoP = undefined; renderProd(); }));
    bindFormProd();
  }
  function bindFormProd() {
    const f = $('#bpF'); if (!f) return;
    const cur = BK.novoP ? null : BK.L.itens.find(x => x.codigo === BK.edit);
    $('#bpX').addEventListener('click', () => { BK.edit = null; BK.novoP = false; BK.fotoP = undefined; renderProd(); });
    $('#bpFo').addEventListener('change', async e => { const fl = e.target.files && e.target.files[0]; if (!fl) return; try { BK.fotoP = await reduzFoto(fl); $('#bpFn').textContent = 'Foto escolhida: ' + fl.name + ' (entra ao salvar)'; } catch (er) { $('#bpErr').textContent = er.message; } });
    const rm = $('#bpRm'); if (rm) rm.addEventListener('click', () => { BK.fotoP = null; $('#bpFn').textContent = 'A foto sai ao salvar.'; });
    const del = $('#bpDel'); if (del) del.addEventListener('click', async () => { if (!confirm('Apagar "' + (cur.nome || cur.codigo) + '" do banco? As empresas que usam este banco deixam de receber o nome e a foto dele.')) return; try { await api('/api/central/banco/produto-del', { banco: BK.sel, codigo: cur.codigo }); toast('Produto apagado do banco'); BK.edit = null; await loadBanco(true); recarregaBancos(); } catch (e) { if (sessao(e)) return; $('#bpErr').textContent = e.message; } });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const bt = f.querySelector('button[type=submit]'); bt.disabled = true; $('#bpErr').textContent = '';
      const body = { banco: BK.sel, codigo: cur ? cur.codigo : $('#bpC').value.trim() };
      if (!cur) body.novo = true;
      const nome = $('#bpN').value.trim(), ean = $('#bpE').value.trim(), custo = $('#bpK').value.trim();
      if (!cur || nome !== cur.nome) body.nome = nome;
      if (!cur || ean !== cur.ean) body.ean = ean;
      if (!cur ? custo !== '' : custo !== (cur.custo == null ? '' : String(cur.custo).replace('.', ','))) body.custo = custo === '' ? null : custo;
      if (BK.fotoP !== undefined) body.foto = BK.fotoP;
      try { await api('/api/central/banco/produto', body); toast(cur ? 'Produto salvo' : 'Produto criado no banco'); BK.edit = null; BK.novoP = false; BK.fotoP = undefined; await loadBanco(true); recarregaBancos(); }
      catch (er) { if (sessao(er)) return; $('#bpErr').textContent = er.message; bt.disabled = false; }
    });
  }
  /* foto do produto: reduzida no aparelho (lado maior até 1000 px) antes de enviar, como no Gerador de Encartes */
  function reduzFoto(f) {
    return new Promise((ok, no) => {
      if (f.type && !/^image\//.test(f.type)) return no(new Error('Esse arquivo não é uma imagem.'));
      const img = new Image(), fr = new FileReader();
      fr.onerror = () => no(new Error('Não consegui ler esse arquivo.'));
      fr.onload = () => { img.src = fr.result; };
      img.onerror = () => no(new Error('Não consegui abrir essa imagem (formato HEIC/RAW?). Salve como JPG ou PNG e tente de novo.'));
      img.onload = () => {
        const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
        for (const lado of [1000, 800, 600]) {
          const k = Math.min(1, lado / Math.max(w, h)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let d = c.toDataURL('image/webp', .86); if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/png');
          if (d.length > 2400000) d = c.toDataURL('image/jpeg', .88);
          if (d.length <= 2400000) return ok(d);
        }
        no(new Error('Não consegui reduzir essa imagem. Tente outra.'));
      };
      fr.readAsDataURL(f);
    });
  }
  /* várias fotos de uma vez: o nome do arquivo (sem a extensão) é o código interno ou o código de barras */
  async function fotosPorNome(fs) {
    const out = $('#bkFotosOut'); let ok = 0; const ruins = [];
    for (let i = 0; i < fs.length; i++) {
      out.innerHTML = `<p class="small muted" style="margin:0">Enviando fotos ${i + 1} de ${fs.length}…</p>`;
      const termo = fs[i].name.replace(/\.[^.]+$/, '').trim();
      try { const r = await api('/api/central/banco/foto-nome', { banco: BK.sel, termo, foto: await reduzFoto(fs[i]) }); if (r.ok) ok++; else ruins.push(fs[i].name + ': ' + r.motivo); }
      catch (e) { if (sessao(e)) return; ruins.push(fs[i].name + ': ' + e.message); }
    }
    out.innerHTML = `<div class="note"><b>${pl(ok, 'foto entrou', 'fotos entraram')} no banco.</b>${ruins.length ? '<br>Ficaram de fora:<br>' + ruins.slice(0, 40).map(esc).join('<br>') : ''}</div>`;
    await loadBanco(true); recarregaBancos();
  }

  async function save() {
    const b = $('#save'); b.disabled = true;
    const ramo = ramoOf(draft), outro = ramo !== 'atacado';
    const mods = {}; modsOf(draft).forEach(m => { if (!m.essential) mods[m.code] = !!draft.modules[m.code]; });
    try {
      const r = await api('/api/central/tenant', { id: draft.id, ramo: draft.id ? undefined : ramo, name: draft.name, logo: draft.logo, color: draft.color, segment: outro ? null : matchSegment() || draft.segment, status: draft.status, modules: mods });
      sel = r.tenant.id; toast('Configuração salva'); await load(true);
    } catch (e) { if (e.status === 401) { pendingDraft = { sel, draft }; return showLogin('Sua sessão terminou. Entre de novo: suas mudanças continuam aqui para salvar.'); } toast(e.message); b.disabled = false; }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();

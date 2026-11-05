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
  const ramoOf = t => (t && ['rural', 'loja', 'caixa'].includes(t.ramo) ? t.ramo : 'atacado');
  const modsOf = t => ramoOf(t) === 'rural' ? D.ruralModules : ramoOf(t) === 'loja' ? D.lojaModules : ramoOf(t) === 'caixa' ? D.caixaModules : D.modules;
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
  const ABAS = [['atacado', 'Atacado e varejo'], ['rural', 'Rural'], ['loja', 'Loja online'], ['caixa', 'Painel gerencial']];

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
    const n = k => D.tenants.filter(t => ramoOf(t) === k).length;
    $('#rtabs').innerHTML = ABAS.map(([k, lb]) => `<button type="button" role="tab" data-aba="${k}" aria-selected="${aba === k}">${lb} <small>${n(k)}</small></button>`).join('');
    $('#rtabs').querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.aba === aba) return;
      if (dirty && !confirm('Sair sem salvar as mudanças?')) return;
      aba = b.dataset.aba; segUI = null; pick((naAba()[0] || {}).id || null);
    }));
  }
  function renderList() {
    renderTabs();
    const L = $('#tlist');
    const lista = naAba();
    L.innerHTML = (!lista.length && sel !== null ? '<p class="small muted" style="margin:0">Nenhuma empresa aqui ainda. Toque em "+ Nova".</p>' : '') + lista.map(t => `<button type="button" class="tn" data-t="${esc(t.id)}" aria-current="${t.id === sel}"><b>${esc(t.name)}${t.primary ? ' <span class="st ativa">principal</span>' : ''}</b><span>${esc(ramoOf(t) !== 'atacado' ? RAMO_UI[ramoOf(t)].tipo : (D.segments.find(s => s.id === t.segment) || {}).name || 'Sem segmento')} · <span class="st ${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span></span></button>`).join('')
      + (sel === null ? `<button type="button" class="tn" aria-current="true"><b>${aba !== 'atacado' ? RAMO_UI[aba].novo : 'Nova empresa'}</b><span>ainda não salva</span></button>` : '');
    L.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(b.dataset.t); }));
  }
  $('#newT').addEventListener('click', () => { if (dirty && !confirm('Sair sem salvar as mudanças?')) return; pick(null); });

  function renderEditor() {
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
          <label class="btn" for="flogo" style="display:inline-flex;align-items:center">Enviar imagem</label><input type="file" id="flogo" accept="image/png,image/jpeg,image/webp" hidden>
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
          <label class="btn" for="flogo" style="display:inline-flex;align-items:center">Enviar imagem</label><input type="file" id="flogo" accept="image/png,image/jpeg,image/webp" hidden>
          ${t.logo ? '<button class="btn" type="button" id="frmlogo">Tirar</button>' : ''}</div></div>
        <div class="field"><span style="font-size:13px;font-weight:600;color:#3B4A3F">Cor principal</span>
          <div class="sw">${SWATCHES.map(([c, n]) => `<button type="button" data-c="${c}" aria-label="${n}" aria-pressed="${(t.color || '').toUpperCase() === c}" style="background:${c}"></button>`).join('')}<input type="color" id="fcolor" aria-label="Outra cor" value="${esc(t.color || '#1F3D2B')}"></div></div>
      </div>
      <div class="preview"><span class="small muted">Prévia do botão:</span><span class="pv-btn" style="background:${esc(t.color || '#1F3D2B')}">${esc(U.botao)}</span></div>
    </div></details>
    ${groups.map(g => { const gm = mods.filter(m => m.group === g), gon = gm.filter(m => m.essential || t.modules[m.code]).length; return `<details class="card grp fold" data-k="g:${esc(g)}"><summary><h2>${esc(g)}</h2><span class="sum">${g === 'Essenciais' ? 'Sempre ativas' : gon + ' de ' + gm.length + ' ligadas'}</span></summary><div class="fb">
      ${mods.filter(m => m.group === g).map(m => `<div class="mod"><div class="t"><div class="n">${esc(m.name)}</div><div class="d">${esc(m.desc)}</div></div>
        ${m.essential ? '<span class="lock">Sempre ativo</span>' : `<button type="button" class="sw-t" role="switch" data-m="${esc(m.code)}" aria-checked="${!!t.modules[m.code]}" aria-label="${esc(m.name)}"><span></span></button>`}</div>`).join('')}</div></details>`; }).join('')}
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

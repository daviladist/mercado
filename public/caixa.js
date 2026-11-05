'use strict';
/* Tino — Painel gerencial (ramo 'caixa'); por enquanto com uma área só: Caixa (controle de caixa). Só a tela: tudo o que grava é conferido no servidor (lib/caixa.js). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const numIn = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dBR = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }

  let S = null, view = 'inicio';

  /* ---------- servidor ---------- */
  async function api(path, body) {
    const h = { 'X-App': '1', 'X-Tenant': slug || '@' };
    const opt = body === undefined ? { credentials: 'same-origin', headers: h } : { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem internet. Confira a conexão e tente de novo.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status, login: !!j.login, mustReset: !!j.mustReset });
    return j;
  }
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5200 : 2800); }
  function fail(e) { if (e.status === 401 || e.login) return showLogin('Entre de novo.'); if (e.mustReset) return showReset(); toast(e.message, true); }
  async function reload() { S = await api('/api/caixa/state'); applyBrand(); }
  async function post(path, body, okMsg) {
    try { const r = await api(path, body); await reload(); if (okMsg) toast(okMsg); closeSheet(); render(); return r; }
    catch (e) { fail(e); return null; }
  }

  /* ---------- marca ---------- */
  function applyBrand() {
    const nome = brand.name || 'Tino';
    $('#coName').textContent = nome;
    const cor = brand.color;
    if (cor && /^#[0-9a-f]{6}$/i.test(cor)) document.documentElement.style.setProperty('--brand', cor);
  }
  const isAdmin = () => !!(S && S.me.role === 'admin');
  const isFin = () => !!(S && S.me.role === 'financeiro');
  const tolerancia = () => Number((S && S.tolerancia) || 5);
  const dentro = d => Math.abs(Number(d) || 0) <= tolerancia() + 1e-9;


  /* ---------- entrar ---------- */
  function showLogin(msg) {
    S = null; $('#bn').hidden = true; $('#sair').hidden = true; $('#atualizar').hidden = true; $('#mods').hidden = true; closeSheet();
    $('#main').innerHTML = `<div class="login"><form class="card" id="lf" autocomplete="on">
      <h1>Entrar</h1><p class="muted small">${esc(brand.name || 'Tino')} · controle de caixa</p>
      <div class="field"><label for="lu">Usuário</label><input type="text" id="lu" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
      <div class="field"><label for="lp">Senha</label><input type="password" id="lp" autocomplete="current-password" required></div>
      <p class="neg small" id="le" role="alert" style="min-height:18px;font-weight:600">${esc(msg || '')}</p>
      <button class="btn pri full" type="submit">Entrar</button>
      <p class="tino">Quem tem <b>Tino</b>, vende melhor.</p></form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; $('#le').textContent = '';
      try { await api('/api/login', { login: $('#lu').value.trim().toLowerCase(), password: $('#lp').value }); $('#lp').value = ''; await start(); }
      catch (er) { $('#le').textContent = er.message; $('#lp').value = ''; } finally { b.disabled = false; }
    });
    setTimeout(() => { const u = $('#lu'); if (u) u.focus(); }, 50);
  }
  function showReset() {
    $('#bn').hidden = true;
    $('#main').innerHTML = `<div class="login"><form class="card" id="rf">
      <h1>Crie a sua senha</h1><p class="muted small">É o primeiro acesso. Use pelo menos 8 caracteres, com letras e números.</p>
      <div class="field"><label for="r0">Senha provisória (a que você recebeu)</label><input type="password" id="r0" autocomplete="current-password" required></div>
      <div class="field"><label for="r1">Senha nova</label><input type="password" id="r1" autocomplete="new-password" required></div>
      <div class="field"><label for="r2">Repita a senha nova</label><input type="password" id="r2" autocomplete="new-password" required></div>
      <p class="neg small" id="re" role="alert" style="min-height:18px;font-weight:600"></p>
      <button class="btn pri full" type="submit">Salvar senha</button></form></div>`;
    $('#rf').addEventListener('submit', async e => {
      e.preventDefault();
      if ($('#r1').value !== $('#r2').value) { $('#re').textContent = 'As duas senhas novas não são iguais.'; return; }
      const b = e.target.querySelector('button'); b.disabled = true;
      try { await api('/api/password', { current: $('#r0').value, next: $('#r1').value }); toast('Senha criada'); await start(); }
      catch (er) { $('#re').textContent = er.message; } finally { b.disabled = false; }
    });
  }
  // botão Atualizar no topo (em todas as telas): busca os dados de novo, inclusive a importação do StarIA
  $('#atualizar').addEventListener('click', async () => {
    const b = $('#atualizar'); if (b.disabled) return;
    b.disabled = true; b.classList.add('gira');
    try { await reload(); if (!$('#sheet').innerHTML) { const y = window.scrollY; render(); window.scrollTo(0, y); } toast('Atualizado'); }
    catch (e) { fail(e); }
    finally { b.disabled = false; b.classList.remove('gira'); }
  });
  $('#sair').addEventListener('click', async () => { try { await api('/api/logout', {}); } catch (e) { /* segue */ } showLogin(); });
  /* sessão que expira: 15 minutos sem tocar na tela e o app sai sozinho (celular esquecido em cima do balcão) */
  let ocioso = Date.now();
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { ocioso = Date.now(); }, { passive: true }));
  setInterval(async () => {
    if (!S || Date.now() - ocioso < 15 * 60e3) return;
    try { await api('/api/logout', {}); } catch (e) { /* segue */ }
    showLogin('Você ficou 15 minutos sem usar. Entre de novo.');
  }, 30e3);

  /* ---------- sheet (formulário em baixo) ---------- */
  function closeSheet() { $('#sheet').innerHTML = ''; }
  function openSheet(html, onMount) {
    $('#sheet').innerHTML = `<div class="sheet" id="shx"><div class="pn">${html}</div></div>`;
    $('#shx').addEventListener('click', e => { if (e.target.id === 'shx') closeSheet(); });
    if (onMount) onMount();
  }

  /* confirmação dentro do app. A janelinha de confirmação do navegador some em alguns celulares, apps
     instalados e no navegador do app Claude: o toque parecia não fazer nada. Resolve true/false. */
  function perguntar(titulo, texto, okTxt, perigo) {
    return new Promise(res => {
      let feito = false; const fim = v => { if (feito) return; feito = true; closeSheet(); res(v); };
      openSheet(`<div class="tt"><h2>${esc(titulo)}</h2><button class="x" type="button" id="cfx" aria-label="Fechar">✕</button></div>
        ${texto ? `<p class="muted" style="margin:6px 0 16px;white-space:pre-line">${esc(texto)}</p>` : ''}
        <div class="row" style="gap:10px"><button class="btn full" type="button" id="cfn">Cancelar</button><button class="btn ${perigo ? 'bad' : 'pri'} full" type="button" id="cfs">${esc(okTxt || 'Confirmar')}</button></div>`, () => {
        $('#cfs').addEventListener('click', () => fim(true));
        $('#cfn').addEventListener('click', () => fim(false));
        $('#cfx').addEventListener('click', () => fim(false));
        $('#shx').addEventListener('click', e => { if (e.target.id === 'shx') fim(false); });
      });
    });
  }

  /* ---------- ícones (SVG em linha, sem biblioteca; herdam a cor do texto) ---------- */
  const IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    count: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    out: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    in: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    sync: '<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
    tax: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    bank: '<path d="M3 10h18L12 4z"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 20h18"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    store: '<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6z"/><path d="M10 20v-5h4v5"/>',
    pin: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M12 7v6M9 10l3 3 3-3"/>'
  };
  const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;
  /* data e hora no fuso do aparelho (timestamps vêm em UTC; cortar a string dava o dia errado à noite) */
  const dtBR = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

  /* ---------- ícone e texto de cada lançamento ---------- */
  function movIcon(m) {
    const n = m.tipo === 'venda_staria' || m.tipo === 'crediario_staria' || m.tipo === 'gaveta_entrada' ? 'in'
      : m.tipo === 'sangria' || m.tipo === 'gaveta_saida' ? 'out' : 'edit';
    return ic(n);
  }
  const movTom = m => m.tipo === 'sangria' || m.tipo === 'gaveta_saida' || m.valor < 0 ? '' : 'ok';
  function movFilial(m) { const fs = Object.keys((m.detalhe || {}).porFilial || {}); return fs.length === 1 ? ' · Filial ' + esc(fs[0]) : ''; }
  function movTitulo(m) {
    if (m.tipo === 'venda_staria') return 'Vendas em dinheiro' + movFilial(m);
    if (m.tipo === 'crediario_staria') return 'Crediário em dinheiro' + movFilial(m);
    if (m.tipo === 'sangria') return m.destino === 'impostos' ? 'Sangria para a gaveta de impostos' : 'Sangria';
    if (m.tipo === 'gaveta_entrada') return 'Entrada na gaveta';
    if (m.tipo === 'gaveta_saida') return 'Pago com a gaveta';
    return 'Ajuste';
  }
  // sangria lançada pela equipe que o dono ainda não confirmou no banco (a do próprio dono é retirada dele)
  const semDeposito = m => m.tipo === 'sangria' && !m.depositadoEm && m.destino !== 'impostos' && m.criadoPorRole !== 'admin';
  // hora em que o lançamento foi feito (horário de Brasília), ex.: 14:32
  const horaBR = s => { const d = new Date(s); return !s || isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); };
  function movSub(m) {
    if (m.tipo === 'venda_staria' || m.tipo === 'crediario_staria') return dBR(m.data) + ' · sacola conferida';
    const h = horaBR(m.criadoEm);
    return dBR(m.data) + (h ? ' ' + h : '') + (m.motivo ? ' · ' + esc(m.motivo) : '') + (semDeposito(m) ? (isAdmin() ? ' · <b class="neg">falta confirmar no banco</b>' : ' · <b class="inf">aguardando o dono confirmar</b>') : '');
  }
  function sinal(m) { const s = m.tipo === 'sangria' || m.tipo === 'gaveta_saida' || m.valor < 0; return `<span class="${s ? 'neg' : 'pos'}">${s ? '−' : '+'}${money(Math.abs(m.valor))}</span>`; }
  /* uma linha tocável: abre o painel com detalhes e ações (marcar depositado / apagar) */
  const rowMov = m => `<button type="button" class="it" data-mov="${esc(m.id)}">
      <div class="ic ${movTom(m)}">${movIcon(m)}</div>
      <div class="tx"><b>${esc(movTitulo(m))}</b><span>${movSub(m)}</span></div>
      <div class="vl">${sinal(m)}</div></button>`;
  function ligarMovs(lista) {
    document.querySelectorAll('[data-mov]').forEach(b => b.addEventListener('click', () => { const m = lista.find(x => x.id === b.dataset.mov); if (m) sheetMov(m); }));
  }
  function sheetMov(m) {
    // só o dono confirma que o dinheiro chegou no banco (olhando o extrato): quem tira não confirma
    const podeDep = semDeposito(m) && isAdmin();
    const podeApagar = isAdmin() && ['sangria', 'ajuste', 'gaveta_saida', 'gaveta_entrada'].includes(m.tipo);
    openSheet(`<div class="tt"><h2>${esc(movTitulo(m))}</h2><button class="x" type="button" id="shxb" aria-label="Fechar">✕</button></div>
      <div style="font-size:30px;font-weight:800" class="num">${sinal(m)}</div>
      <div>
        <div class="kv"><span class="muted">Data</span><b>${dBR(m.data)}${m.tipo !== 'venda_staria' && m.tipo !== 'crediario_staria' && horaBR(m.criadoEm) ? ' ' + horaBR(m.criadoEm) : ''}</b></div>
        ${m.motivo ? `<div class="kv"><span class="muted">Motivo</span><b style="white-space:normal;text-align:right">${esc(m.motivo)}</b></div>` : ''}
        ${m.criadoPor ? `<div class="kv"><span class="muted">Quem lançou</span><b>${esc(m.criadoPor)}</b></div>` : ''}
        ${m.tipo === 'venda_staria' || m.tipo === 'crediario_staria' ? `<div class="kv"><span class="muted">Período</span><b>${dBR(m.periodoIni)} a ${dBR(m.periodoFim)}</b></div>` : ''}
        ${m.tipo === 'sangria' && m.destino !== 'impostos' ? `<div class="kv"><span class="muted">Banco</span><b class="${m.depositadoEm ? 'pos' : 'neg'}">${m.depositadoEm ? 'confirmado em ' + dBR(m.depositadoEm) : isAdmin() ? 'você ainda não confirmou' : 'aguardando o dono confirmar'}</b></div>` : ''}
      </div>
      ${podeDep ? `<p class="small muted">Abra o extrato do banco. Se o depósito está lá, confirme.</p><button class="btn pri lg full" type="button" data-dep="${esc(m.id)}">${ic('bank')} Confirmei no banco</button>` : ''}
      ${podeApagar ? `<button class="btn dan full" type="button" data-delmov="${esc(m.id)}">Apagar este lançamento</button>` : ''}`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      const d = document.querySelector('#sheet [data-dep]'); if (d) d.addEventListener('click', () => post('/api/caixa/depositado', { id: m.id, depositadoEm: hoje() }, 'Confirmado no banco'));
      const x = document.querySelector('#sheet [data-delmov]'); if (x) x.addEventListener('click', async () => { if (await perguntar('Apagar este lançamento?', 'Fica registrado nas ocorrências.', 'Apagar', true)) post('/api/caixa/mov/excluir', { id: m.id }, 'Lançamento apagado'); });
    });
  }

  /* ---------- o que precisa de atenção (calculado só com o que o /state já traz) ---------- */
  function resumo() {
    const admin = isAdmin(), fin = podeConferirSacola();
    const desde = Date.now() - 7 * 864e5;
    const alertas = admin ? (S.ocorrencias || []).filter(o => (o.tipo === 'conferencia' || o.tipo === 'sacola') && new Date(o.em).getTime() >= desde) : [];
    const difs = alertas.map(o => o.tipo === 'conferencia' ? Number(o.detalhe.diferenca) || 0 : r2((Number(o.detalhe.diferenca) || 0) + (Number(o.detalhe.crediDiferenca) || 0)));
    const faltou = r2(difs.filter(d => d < 0).reduce((a, d) => a - d, 0)), sobrou = r2(difs.filter(d => d > 0).reduce((a, d) => a + d, 0));
    const sac = S.sacolas || [];
    const tot = s => r2((s.valorStaria || 0) + (s.crediStaria || 0));
    const soma = (arr, f) => r2(arr.reduce((a, x) => a + f(x), 0));
    const naFilial = sac.filter(s => !s.conferidoEm && !s.chegouEm);
    const aConferir = sac.filter(s => !s.conferidoEm && s.chegouEm);
    const cxP = S.caixasPendentes || [];
    const semDep = (S.mov || []).filter(semDeposito);
    const jobP = admin ? (S.jobs || []).filter(j => j.status === 'pendente') : [];
    const tarefas = [];
    if (fin && aConferir.length) tarefas.push({ go: 'sacolas', ic: 'bag', urg: true, t: plural(aConferir.length, 'sacola para conferir', 'sacolas para conferir'), s: money(soma(aConferir, tot)) + ' já na matriz' });
    if (fin && cxP.length) tarefas.push({ go: 'sacolas', ic: 'sync', urg: true, t: plural(cxP.length, 'caixa do StarIA para marcar', 'caixas do StarIA para marcar'), s: 'Marque os que estão em preto no StarIA' });
    if (naFilial.length) tarefas.push({ go: 'sacolas', ic: 'truck', urg: !fin, t: plural(naFilial.length, 'sacola ainda na filial', 'sacolas ainda nas filiais'), s: 'Filial ' + [...new Set(naFilial.map(s => s.filial))].sort((a, b) => a - b).join(', ') + ' · ' + money(soma(naFilial, tot)) });
    if (semDep.length) tarefas.push({ go: 'extrato', ic: 'bank', urg: true, t: plural(semDep.length, 'sangria falta confirmar no banco', 'sangrias falta confirmar no banco'), s: money(soma(semDep, m => m.valor)) + ' fora do cofre' });
    if (jobP.length) tarefas.push({ go: 'staria', ic: 'clock', urg: false, t: 'Consulta ao StarIA esperando o Claude', s: 'Peça no chat: “processar as consultas do StarIA”' });
    const caminho = { staria: soma(cxP, l => l.dinheiro), filial: soma(naFilial, tot), matriz: soma(aConferir, tot) };
    caminho.total = r2(caminho.staria + caminho.filial + caminho.matriz);
    let st;
    if (faltou || sobrou) st = { k: 'bad', ic: 'alert', go: 'ocorrencias', t: faltou ? 'Faltou ' + money(faltou) + ' nos últimos 7 dias' : 'Sobrou ' + money(sobrou) + ' nos últimos 7 dias' };
    else if (tarefas.some(t => t.urg)) { const n = tarefas.filter(t => t.urg).length; st = { k: 'wa', ic: 'clock', t: (admin ? 'Sem diferenças · ' : '') + plural(n, 'coisa para resolver', 'coisas para resolver') }; }
    else st = { k: 'ok', ic: 'ok', t: admin ? 'Tudo certo · nenhuma diferença em 7 dias' : 'Tudo em dia' };
    return { alertas, tarefas, caminho, st, pendSacolas: (fin ? aConferir.length + cxP.length + (S.crediarios || []).filter(c => !c.forma).length : naFilial.length) };
  }

  /* ---------- Início: "quanto eu tenho agora e está tudo certo?" ---------- */
  function renderInicio() {
    if (!S.cfg) {
      if (!isAdmin()) { $('#main').innerHTML = '<div class="empty card"><div class="big">' + ic('clock') + '</div><p>O dono ainda não informou o dinheiro inicial do cofre. Volte mais tarde.</p></div>'; return; }
      $('#main').innerHTML = `<section class="card">
        <h1>Vamos começar</h1>
        <p class="muted">Conte o dinheiro que está hoje no cofre da matriz e digite aqui. A partir daí, o app soma o que entra e tira o que sai.</p>
        <form id="fcfg">
          <div class="field"><label for="cfSaldo">Quanto tem no cofre hoje</label><input type="text" inputmode="decimal" id="cfSaldo" placeholder="0,00" value="0"></div>
          <div class="field"><label for="cfData">Dia desta contagem</label><input type="date" id="cfData" value="${hoje()}" max="${hoje()}"></div>
          <button class="btn pri lg full" type="submit">Salvar e começar</button>
        </form></section>`;
      $('#fcfg').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/cfg', { saldoInicial: $('#cfSaldo').value, dataInicial: $('#cfData').value }, 'Saldo inicial salvo'); });
      return;
    }
    const admin = isAdmin();
    const ultimos = (S.mov || []).slice(0, 4);
    const acts = `<div class="acts">
        <button class="btn gold" type="button" id="btnConferir">${ic('count')}Contar o cofre</button>
        <button class="btn" type="button" id="btnSangria">${ic('out')}Fazer sangria</button>
      </div>`;
    // cada alerta/pendência leva direto para onde se resolve
    const IR = { contar: 'contar', banco: 'extrato', sacolas: 'sacolas', ocorrencias: 'ocorrencias', staria: 'staria', inicio: 'inicio', crediario: 'crediario' };
    const linhaAlerta = a => `<button type="button" class="it" ${a.ir === 'contar' ? 'data-contar="1"' : `data-go="${IR[a.ir] || 'inicio'}"`}>
        <div class="ic ${a.nivel === 'vermelho' ? 'bad' : 'wa'}">${ic(a.nivel === 'vermelho' ? 'alert' : 'clock')}</div>
        <div class="tx"><b>${esc(a.texto)}</b></div><span class="ch">${ic('chev')}</span></button>`;
    const ultimas = `<section class="card"><div class="sec"><h2>${admin ? 'Últimas movimentações' : 'O que você lançou'}</h2><button class="lnk" type="button" data-go="extrato">Ver tudo</button></div>
        ${ultimos.length ? `<div class="list">${ultimos.map(rowMov).join('')}</div>` : '<p class="muted small">Nada lançado ainda.</p>'}</section>`;
    if (!admin) {
      // equipe: contagem cega — nada de saldo nem valor esperado, só o que precisa ser feito
      const pend = S.pendencias || [];
      $('#main').innerHTML = `
        ${isFin() && S.saldo != null ? (() => { const v = S.saldo, reais = Math.trunc(Math.abs(v)), cent = money(v).split(',')[1] || '00';
          return `<section class="hero" aria-label="Dinheiro no cofre">
          <span class="lb">Dinheiro no cofre agora</span>
          <span class="val num"><small>R$</small>${v < 0 ? '−' : ''}${reais.toLocaleString('pt-BR')}<small style="margin:0 0 0 2px">,${cent}</small></span>
          <span class="sub">Olá, ${esc((S.me.nome || '').split(' ')[0])} · ${pend.length ? plural(pend.length, 'coisa para fazer', 'coisas para fazer') : 'tudo em dia'}</span>
        </section>`; })() : `<section class="hero" aria-label="Suas tarefas">
          <span class="lb">Olá, ${esc((S.me.nome || '').split(' ')[0])}</span>
          <span class="val" style="font-size:30px">${pend.length ? plural(pend.length, 'coisa para fazer', 'coisas para fazer') : 'Tudo em dia'}</span>
          <span class="sub">Conte sempre sem pressa. Você não vê o valor esperado: o app só diz se bateu.</span>
        </section>`}
        ${acts}
        ${isFin() ? `<section class="card" id="cardStaria"><div class="sec"><h2>Importar do StarIA</h2></div>
          <p class="small muted" style="margin:0 0 10px">Um dia por vez, igual à tela de Fechamento de Caixa. Depois de pedir, é só chamar o Claude: “processar as consultas do StarIA”.</p>
          ${seletorDia()}</section>` : ''}
        ${pend.length ? `<section class="card" id="tarefas"><div class="sec"><h2>Para fazer</h2><span class="badge">${pend.length}</span></div>
          <div class="list">${pend.map(linhaAlerta).join('')}</div></section>` : ''}
        ${ultimas}`;
      if (isFin()) ligarSeletorDia();
    } else {
      const R = S.resumo || { status: 'verde', naMatriz: S.saldo, alertas: [], nasLojas: { total: 0, porFilial: {} }, aCaminhoDoBanco: { total: 0, qtd: 0 }, gaveta: 0, tudo: S.saldo };
      const v = R.naMatriz, reais = Math.trunc(Math.abs(v)), cent = money(v).split(',')[1] || '00';
      const verm = R.alertas.filter(a => a.nivel === 'vermelho').length;
      const st = R.status === 'verde' ? { k: 'ok', ic: 'ok', t: 'Tudo certo' }
        : R.status === 'vermelho' ? { k: 'bad', ic: 'alert', t: plural(verm, 'problema', 'problemas') + (R.alertas.length > verm ? ' · ' + plural(R.alertas.length - verm, 'aviso', 'avisos') : '') }
        : { k: 'wa', ic: 'clock', t: plural(R.alertas.length, 'coisa para olhar', 'coisas para olhar') };
      const uc = R.ultimaContagem;
      const ucTxt = !uc ? 'O cofre ainda não foi contado. Conte para confirmar.'
        : 'Última contagem: ' + (uc.horas < 1 ? 'agora há pouco' : uc.horas < 24 ? 'há ' + uc.horas + ' h' : 'há ' + Math.floor(uc.horas / 24) + ' dia(s)') + ', ' + esc(uc.por || '') + ', ' + (dentro(uc.diferenca) ? 'bateu' : (uc.diferenca < 0 ? 'faltou ' : 'sobrou ') + money(Math.abs(uc.diferenca)));
      const pf = Object.entries(R.nasLojas.porFilial || {}).filter(([, x]) => x.caixasSemSacola || x.naFilial || x.chegouFaltaContar || x.crediario).sort((a, b) => a[0] - b[0]);
      const jobP = (S.jobs || []).some(j => j.status === 'pendente');
      $('#main').innerHTML = `
        <section class="hero" aria-label="Dinheiro na matriz">
          <span class="lb">Dinheiro na matriz agora</span>
          <span class="val num"><small>R$</small>${v < 0 ? '−' : ''}${reais.toLocaleString('pt-BR')}<small style="margin:0 0 0 2px">,${cent}</small></span>
          <span class="sub">${ucTxt}</span>
          <button type="button" class="stat ${st.k}" data-alvo="tarefas">${ic(st.ic)}<span>${esc(st.t)}</span>${R.alertas.length ? `<span class="go-ar">${ic('chev')}</span>` : ''}</button>
        </section>
        ${acts}
        ${R.alertas.length ? `<section class="card" id="tarefas"><div class="sec"><h2>O que olhar</h2><span class="badge${verm ? ' bad' : ''}">${R.alertas.length}</span></div>
          <div class="list">${R.alertas.map(linhaAlerta).join('')}</div></section>` : ''}
        <section class="card"><div class="sec"><h2>Todo o seu dinheiro</h2></div>
          <div>
            <div class="kv"><span>Na matriz (cofre)</span><b>${money(R.naMatriz)}</b></div>
            ${R.nasLojas.total ? `<button type="button" class="kv" data-go="sacolas" style="width:100%;background:none;border:0;padding-left:0;padding-right:0;font:inherit;color:inherit;text-align:left"><span>Nas lojas e a caminho <span class="small muted">(valor do StarIA, ainda não contado)</span></span><b>${money(R.nasLojas.total)}</b></button>
              ${pf.map(([f, x]) => `<div class="kv small muted" style="padding-left:12px"><span>Filial ${esc(f)}</span><span>${money(r2(x.caixasSemSacola + x.naFilial + x.chegouFaltaContar + (x.crediario || 0)))}${x.crediario ? ` <span class="small">(${money(x.crediario)} de crediário)</span>` : ''}</span></div>`).join('')}` : ''}
            ${R.aCaminhoDoBanco.total ? `<button type="button" class="kv" data-go="extrato" style="width:100%;background:none;border:0;padding-left:0;padding-right:0;font:inherit;color:inherit;text-align:left"><span>Saiu para o banco <span class="small muted">(${plural(R.aCaminhoDoBanco.qtd, 'sangria', 'sangrias')}, falta você confirmar)</span></span><b>${money(R.aCaminhoDoBanco.total)}</b></button>` : ''}
            <button type="button" class="kv" data-go="gaveta" style="width:100%;background:none;border:0;padding-left:0;padding-right:0;font:inherit;color:inherit;text-align:left"><span>Gaveta de impostos</span><b>${money(R.gaveta)}</b></button>
            <div class="kv tot"><span><b>Total</b></span><b>${money(R.tudo)}</b></div>
          </div></section>
        <section class="card"><div class="sec"><h2>StarIA</h2></div>
          <p class="small muted" style="margin:0 0 10px">${R.stariaAte ? 'Números até ' + dBR(R.stariaAte) + '.' : 'Nenhum número do StarIA ainda.'} ${jobP ? '<b>Pedido feito: falta o Claude processar.</b> Peça no chat: “processar as consultas do StarIA”.' : 'Um dia por vez, igual à tela de Fechamento de Caixa.'}</p>
          ${seletorDia()}</section>
        ${ultimas}`;
      ligarSeletorDia();
    }
    $('#btnConferir').addEventListener('click', sheetConferir);
    $('#btnSangria').addEventListener('click', sheetSangria);
    document.querySelectorAll('#main [data-contar]').forEach(b => b.addEventListener('click', sheetConferir));
    const al = document.querySelector('[data-alvo=tarefas]'); if (al) al.addEventListener('click', () => { const t = $('#tarefas'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    ligarMovs(ultimos);
  }

  /* ---------- Extrato: tudo que entrou e saiu (antes ficava embaixo do Início) ---------- */
  function renderExtrato() {
    const pf = Object.entries(S.porFilial || {}).sort((a, b) => a[0] - b[0]);
    const lista = S.mov || [];
    $('#main').innerHTML = `<div class="pagehd"><h1>Extrato</h1><p>${isAdmin() ? 'Tudo que entrou e saiu do cofre.' : 'O que você lançou.'} Toque numa linha para ver detalhes.</p></div>
      ${pf.length ? `<section class="card"><h2>Quanto cada filial trouxe</h2><div>
        ${pf.map(([f, v]) => `<div class="kv"><span>Filial ${esc(f)}${v.crediario ? ` <span class="small muted">(${money(v.crediario)} de crediário)</span>` : ''}</span><b>${money(r2(v.vendas + v.crediario))}</b></div>`).join('')}
        </div></section>` : ''}
      <section class="card">
        ${lista.length ? `<div class="list">${lista.map(rowMov).join('')}</div>` : '<div class="empty"><p>Nenhum lançamento ainda.</p></div>'}
      </section>
      ${isAdmin() ? `<button class="btn full" type="button" id="btnAjuste">${ic('edit')} Lançar ajuste (correção)</button>` : ''}`;
    const ba = $('#btnAjuste'); if (ba) ba.addEventListener('click', sheetAjuste);
    ligarMovs(lista);
  }

  /* ---------- Mais (só o dono): o que é raro fica aqui, fora da barra de baixo ---------- */
  function renderMais() {
    if (isFin()) {
      // financeiro: só um cantinho com a gaveta de impostos, para olhar (o resto do Mais é do dono)
      $('#main').innerHTML = `<div class="pagehd"><h1>Mais</h1></div>
        <section class="card menu"><div class="list">
          <button type="button" class="it" data-go="gaveta"><div class="ic">${ic('tax')}</div><div class="tx"><b>Gaveta de impostos</b><span>${money(S.saldoImpostos || 0)} guardado à parte</span></div><span class="ch">${ic('chev')}</span></button>
        </div></section>`;
      return;
    }
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const R = resumo();
    const jobP = (S.jobs || []).some(j => j.status === 'pendente');
    const item = (go, i, t, s, extra) => `<button type="button" class="it" data-go="${go}"><div class="ic">${ic(i)}</div><div class="tx"><b>${t}</b><span>${s}</span></div>${extra || ''}<span class="ch">${ic('chev')}</span></button>`;
    $('#main').innerHTML = `<div class="pagehd"><h1>Mais</h1></div>
      <section class="card menu"><div class="list">
        ${item('ocorrencias', 'shield', 'Ocorrências', 'Diferenças e tudo que foi apagado ou alterado', R.alertas.length ? `<span class="badge bad">${R.alertas.length}</span>` : '')}
        ${item('crediario', 'bank', 'Crediário: conferir no banco', (() => { const p = (S.crediarios || []).filter(c => c.forma && c.forma !== 'dinheiro' && c.banco !== 'achei'); return p.length ? plural(p.length, 'recebimento', 'recebimentos') + ' para conferir no extrato' : 'Pix e cartões de clientes pagando conta'; })())}
        ${item('staria', 'sync', 'Puxar do StarIA', jobP ? 'Uma consulta está esperando o Claude' : 'Pedir as vendas em dinheiro de um dia')}
        ${item('gaveta', 'tax', 'Gaveta de impostos', money(S.saldoImpostos || 0) + ' guardado à parte')}
        ${item('acessos', 'users', 'Pessoas com acesso', plural((S.pessoas || []).length, 'pessoa', 'pessoas'))}
        ${instalado() ? '' : `<button type="button" class="it" id="atalhoMais"><div class="ic">${ic('pin')}</div><div class="tx"><b>${rotuloAtalho()}</b><span>Ícone no computador ou na tela inicial do celular</span></div><span class="ch">${ic('chev')}</span></button>`}
        <button type="button" class="it" id="verCfg"><div class="ic">${ic('edit')}</div><div class="tx"><b>Dinheiro inicial do cofre</b><span>${money(S.cfg ? S.cfg.saldoInicial : 0)} em ${S.cfg ? dBR(S.cfg.dataInicial) : '—'}</span></div><span class="ch">${ic('chev')}</span></button>
      </div></section>`;
    $('#verCfg').addEventListener('click', () => { if (S.cfg) sheetCfg(); else { view = 'inicio'; render(); } });
    if ($('#atalhoMais')) $('#atalhoMais').addEventListener('click', criarAtalho);
  }
  function sheetCfg() {
    openSheet(`<div class="tt"><h2>Editar saldo inicial</h2><button class="x" type="button" id="shxb">✕</button></div>
      <form id="fcfg2">
        <div class="field"><label for="cfSaldo2">Saldo inicial</label><input type="text" inputmode="decimal" id="cfSaldo2" value="${numIn(S.cfg.saldoInicial)}"></div>
        <div class="field"><label for="cfData2">Data</label><input type="date" id="cfData2" value="${esc(S.cfg.dataInicial)}" max="${hoje()}"></div>
        <button class="btn pri full" type="submit">Salvar</button></form>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fcfg2').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/cfg', { saldoInicial: $('#cfSaldo2').value, dataInicial: $('#cfData2').value }, 'Saldo inicial atualizado'); });
    });
  }
  function sheetConferir() {
    const cego = !isAdmin() && !isFin();
    let tentativa = 0;
    openSheet(`<div class="tt"><h2>Contar o cofre</h2><button class="x" type="button" id="shxb" aria-label="Fechar">✕</button></div>
      <p class="muted small">Conte todo o dinheiro do cofre e digite o total. ${cego ? 'Você não vê o valor esperado: o app só diz se bateu. Se não bater, conte de novo.' : 'O app compara com o que deveria ter.'} Diferença de até ${money(tolerancia())}, para mais ou para menos, conta como "bateu".</p>
      <form id="fcf">
        <div class="field"><label for="cfValor">Quanto você contou</label><input type="text" inputmode="decimal" id="cfValor" placeholder="0,00" required></div>
        <div class="field"><label for="cfObs">Observação (opcional)</label><textarea id="cfObs" placeholder="Ex.: nota rasgada, troco emprestado…"></textarea></div>
        <button class="btn pri lg full" type="submit">Comparar</button>
      </form><div id="cfOut"></div>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fcf').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const r = await api('/api/caixa/conferir', { valorContado: $('#cfValor').value, motivo: $('#cfObs').value });
          await reload();
          if (r.bateu) { $('#fcf').hidden = true; const d0 = Number(r.diferenca) || 0; $('#cfOut').innerHTML = `<div class="okbox"><b>${d0 ? 'Bateu, dentro da margem.' : 'Bateu certinho!'}</b> O cofre confere${d0 ? ' (' + (d0 > 0 ? 'sobrou ' : 'faltou ') + money(Math.abs(d0)) + ')' : ''}.</div>`; return; }
          if (cego && tentativa === 0) {
            // não revela o valor: só pede para contar de novo (a 1ª contagem já ficou registrada para o dono)
            tentativa++;
            $('#cfOut').innerHTML = `<div class="warn"><b>Não bateu.</b> Conte de novo com calma e digite o total.</div>`;
            $('#cfValor').value = ''; $('#cfValor').focus();
            return;
          }
          $('#fcf').hidden = true;
          const dif = Number(r.diferenca);
          $('#cfOut').innerHTML = cego ? `<div class="warn"><b>Registrado.</b> Não bateu com o esperado: o dono vai ver.</div>`
            : `<div class="warn"><b>${dif > 0 ? 'Sobrou' : 'Faltou'} ${money(Math.abs(dif))}.</b> Ficou registrado nas Ocorrências.</div>`;
        } catch (er) { fail(er); } finally { b.disabled = false; }
      });
    });
  }
  function sheetAjuste() {
    openSheet(`<div class="tt"><h2>Lançar ajuste</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">Use só para corrigir uma diferença (sobra, falta, taxa do banco…). Valor negativo tira do saldo.</p>
      <form id="faj">
        <div class="field"><label for="ajValor">Valor (negativo para tirar)</label><input type="text" inputmode="decimal" id="ajValor" placeholder="-10,00" required></div>
        <div class="field"><label for="ajData">Data</label><input type="date" id="ajData" value="${hoje()}" max="${hoje()}"></div>
        <div class="field"><label for="ajMotivo">Motivo</label><textarea id="ajMotivo" required></textarea></div>
        <button class="btn pri full" type="submit">Lançar ajuste</button></form>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#faj').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/ajuste', { valor: $('#ajValor').value, data: $('#ajData').value, motivo: $('#ajMotivo').value }, 'Ajuste lançado'); });
    });
  }

  /* ---------- Sangria: agora é um painel de baixo (era uma aba inteira) ---------- */
  function sheetSangria() {
    openSheet(`<div class="tt"><h2>Fazer sangria</h2><button class="x" type="button" id="shxb" aria-label="Fechar">✕</button></div>
      <p class="muted small">Dinheiro que saiu do cofre.${isAdmin() ? '' : ' Quando for para o banco, o dono confirma no extrato.'}</p>
      <form id="fsg">
        <div class="field"><label for="sgValor">Quanto saiu</label><input type="text" inputmode="decimal" id="sgValor" placeholder="0,00" required></div>
        <div class="field"><label for="sgMotivo">Para quê</label>
          <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">${['Depósito no banco', 'Pagamento a fornecedor (com nota)', 'Outro: '].map(t => `<button type="button" class="pill mu" data-mot="${esc(t)}" style="border:0;cursor:pointer;min-height:36px">${esc(t.replace(': ', ''))}</button>`).join('')}</div>
          <input type="text" id="sgMotivo" placeholder="Ex.: depósito no Sicoob" required maxlength="300"></div>
        ${isAdmin() || isFin() ? `<div class="field"><label for="sgDestino">Para onde vai</label>
          <select id="sgDestino"><option value="">Retirada normal (para mim / banco)</option><option value="impostos">Gaveta de impostos e financiamentos</option></select></div>` : ''}
        <div class="field"><label for="sgData">Dia</label><input type="date" id="sgData" value="${hoje()}" max="${hoje()}"></div>
        <button class="btn pri lg full" type="submit">Lançar sangria</button>
      </form>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      setTimeout(() => { const v = $('#sgValor'); if (v) v.focus(); }, 50);
      document.querySelectorAll('#sheet [data-mot]').forEach(b => b.addEventListener('click', () => { const m = $('#sgMotivo'); m.value = b.dataset.mot; m.focus(); }));
      $('#fsg').addEventListener('submit', e => {
        e.preventDefault();
        const destino = isAdmin() || isFin() ? $('#sgDestino').value : '';
        post('/api/caixa/sangria', { valor: $('#sgValor').value, data: $('#sgData').value, motivo: $('#sgMotivo').value, destino: destino || undefined }, destino === 'impostos' ? 'Sangria lançada na gaveta de impostos' : 'Sangria lançada');
      });
    });
  }

  /* ---------- Gaveta de impostos e financiamentos (admin) ---------- */
  function renderGaveta() {
    if (!isAdmin() && !isFin()) { view = 'inicio'; return render(); }
    const dono = isAdmin();
    const cls = S.saldoImpostos > 0 ? 'p' : S.saldoImpostos < 0 ? 'n' : 'z';
    const lista = S.movImpostos || [];
    $('#main').innerHTML = `<section class="saldo ${cls}"><span>Gaveta de impostos e financiamentos</span><b>${money(S.saldoImpostos)}</b>
        <span class="small">separado do caixa principal</span></section>
      ${dono ? '<div class="row"><button class="btn sm pri" type="button" id="btnGavetaSaida">➖ Lançar pagamento (saída)</button></div>' : ''}
      <section class="card"><h2>Lançamentos da gaveta</h2>
        ${lista.length ? `<div class="list">${lista.map(m => `<div class="it">
            <div class="ic">${movIcon(m)}</div>
            <div class="tx"><b>${esc(movTitulo(m))}</b><span>${esc(m.motivo || '')} · ${esc(m.criadoPor || '')}</span></div>
            <div class="vl"><span class="${m.tipo === 'gaveta_saida' ? 'neg' : 'pos'}">${m.tipo === 'gaveta_saida' ? '−' : '+'}${money(m.valor)}</span>
              <br><small class="muted">${dBR(m.data)}</small>
              ${dono ? `<br><button class="btn sm dan" type="button" data-delmov="${esc(m.id)}" style="margin-top:4px">Apagar</button>` : ''}
            </div></div>`).join('')}</div>` : `<p class="muted">Nenhum lançamento ainda.${dono ? ' Lance uma sangria com destino "Gaveta de impostos" na tela de Sangria para alimentar aqui.' : ''}</p>`}
      </section>`;
    if ($('#btnGavetaSaida')) $('#btnGavetaSaida').addEventListener('click', sheetGavetaSaida);
    document.querySelectorAll('[data-delmov]').forEach(b => b.addEventListener('click', async () => { if (await perguntar('Apagar este lançamento da gaveta?', '', 'Apagar', true)) post('/api/caixa/mov/excluir', { id: b.dataset.delmov }, 'Lançamento apagado'); }));
  }
  function sheetGavetaSaida() {
    openSheet(`<div class="tt"><h2>Pagamento com a gaveta</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">Registra que você usou esse dinheiro da gaveta para pagar um imposto ou parcela. Não muda o saldo do caixa principal.</p>
      <form id="fgs">
        <div class="field"><label for="gsValor">Valor</label><input type="text" inputmode="decimal" id="gsValor" placeholder="0,00" required></div>
        <div class="field"><label for="gsData">Data</label><input type="date" id="gsData" value="${hoje()}" max="${hoje()}"></div>
        <div class="field"><label for="gsMotivo">Motivo</label><textarea id="gsMotivo" placeholder="Ex.: DAS de outubro" required></textarea></div>
        <button class="btn pri full" type="submit">Lançar saída</button></form>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fgs').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/gaveta-saida', { valor: $('#gsValor').value, data: $('#gsData').value, motivo: $('#gsMotivo').value }, 'Saída lançada na gaveta'); });
    });
  }

  /* ---------- escolher o dia da consulta ao StarIA: sempre UM dia, padrão ontem ---------- */
  const diaMenos = n => { const d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  let diaStaria = null;
  function seletorDia() {
    if (!diaStaria || diaStaria > hoje()) diaStaria = diaMenos(1);
    const ops = [[0, 'Hoje'], [1, 'Ontem'], [2, '2 dias atrás'], [3, '3 dias atrás'], [4, '4 dias atrás']];
    return `<div class="row" style="gap:6px;margin-bottom:8px">${ops.map(([n, t]) => `<button type="button" class="pill ${diaMenos(n) === diaStaria ? 'ok' : 'mu'}" data-dia="${diaMenos(n)}" style="border:0;cursor:pointer;min-height:36px;padding:0 12px">${t}</button>`).join('')}</div>
      <div class="field"><label for="stDia">Ou outro dia</label><input type="date" id="stDia" value="${diaStaria}" max="${hoje()}"></div>
      <button class="btn pri full" type="button" id="btnStaria">${ic('sync')} Buscar o dia ${dBR(diaStaria)}</button>`;
  }
  function ligarSeletorDia() {
    const atual = () => { $('#stDia').value = diaStaria; $('#btnStaria').innerHTML = ic('sync') + ' Buscar o dia ' + dBR(diaStaria);
      document.querySelectorAll('[data-dia]').forEach(b => { b.className = 'pill ' + (b.dataset.dia === diaStaria ? 'ok' : 'mu'); }); };
    document.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { diaStaria = b.dataset.dia; atual(); }));
    $('#stDia').addEventListener('change', () => { if ($('#stDia').value) { diaStaria = $('#stDia').value; atual(); } });
    $('#btnStaria').addEventListener('click', async () => {
      const r = await post('/api/caixa/staria/pedir', { dia: diaStaria }, null);
      if (r) toast((r.jaPedido ? 'O dia ' + dBR(r.periodoIni) + ' já estava pedido.' : 'Pedido o dia ' + dBR(r.periodoIni) + '.') + ' No chat, peça ao Claude: “processar as consultas do StarIA”.');
    });
  }
  /* ---------- StarIA (admin) ---------- */
  function jobBadge(j) {
    if (j.status === 'pendente') return '<span class="pill wa">Aguardando o Claude</span>';
    return '<span class="pill ok">' + (j.resultado && j.resultado.porCaixa ? 'Trazido · marque os caixas em Sacolas' : 'Trazido · veja em Sacolas') + '</span>';
  }
  function renderStaria() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const jobs = S.jobs;
    $('#main').innerHTML = `<section class="card">
      <h1>Puxar do StarIA</h1>
      <p class="muted small">Pede, de UM dia, o dinheiro de cada caixa e os recebimentos de crediário das 3 filiais, igual à tela "Fechamento de Caixa (PDV)" do StarIA. Quem consulta e devolve é o Claude (pelo seu pedido no chat). Tudo aparece em "Sacolas", para o financeiro marcar.</p>
      <div class="note">O StarIA não diz se o caixa já foi conferido lá (linha preta) ou não (vermelha). Por isso nada entra sozinho: só os caixas que o financeiro marcar viram sacola. Os outros ficam esperando, e a próxima consulta atualiza o valor deles.</div>
      ${seletorDia()}</section>
      <section class="card">
        <h2>Consultas</h2>
        ${jobs.length ? jobs.map(j => `<div class="it" style="align-items:flex-start">
            <div class="ic">🔄</div>
            <div class="tx"><b>${j.periodoIni === j.periodoFim ? 'Dia ' + dBR(j.periodoIni) : dBR(j.periodoIni) + ' a ' + dBR(j.periodoFim)}</b><span>${jobBadge(j)}</span>
              ${j.status !== 'pendente' && j.resultado ? (j.resultado.porCaixa
                ? `<div class="small" style="margin-top:6px">${j.resultado.linhas} caixa(s) com dinheiro · ${j.resultado.novas} novo(s), ${j.resultado.atualizadas} atualizado(s)${j.resultado.jaAceitas ? ', ' + j.resultado.jaAceitas + ' já estavam em sacola' : ''}<br><b>Dinheiro: ${money(j.resultado.total)}</b></div>`
                : `<div class="small" style="margin-top:6px">${Object.entries(j.resultado.porFilial || {}).map(([f, v]) => `Filial ${esc(f)}: ${money(v.vendasDinheiro)} vendas + ${money(v.recebCrediario)} crediário`).join('<br>')}
                <br><b>Total: ${money(j.resultado.total)}</b></div>`) : ''}
            </div>
          </div>`).join('') : '<p class="muted">Nenhuma consulta ainda.</p>'}
      </section>`;
    ligarSeletorDia();
  }

  /* ---------- Sacolas (venda em dinheiro + crediário recebido, por filial): na filial -> chegou na matriz ->
     conferida ---------- caixista e financeiro marcam a chegada; só financeiro (ou admin) confere o valor real de
     vendas, decide a forma de pagamento do crediário e lança no saldo. A filial 1 (matriz) nunca "viaja": já
     aparece pronta pra conferência, sem o passo de marcar chegada. */
  function podeConferirSacola() { return isAdmin() || S.me.role === 'financeiro'; }
  function sacolaStatus(s) {
    if (s.conferidoEm && s.diferenca == null) return s.bateu === false ? '<span class="pill bad">Não bateu</span>' : '<span class="pill ok">Conferida · bateu</span>';
    if (s.conferidoEm) {
      const okVenda = dentro(s.diferenca), okCredi = !s.crediStaria || dentro(s.crediDiferenca);
      if (okVenda && okCredi) return '<span class="pill ok">Conferida · bateu certinho</span>';
      const partes = [];
      if (!okVenda) partes.push((s.diferenca > 0 ? 'vendas: sobrou ' : 'vendas: faltou ') + money(Math.abs(s.diferenca)));
      if (!okCredi) partes.push((s.crediDiferenca > 0 ? 'crediário: sobrou ' : 'crediário: faltou ') + money(Math.abs(s.crediDiferenca)));
      return '<span class="pill bad">Conferida · ' + partes.join(' · ') + '</span>';
    }
    if (s.chegouEm) return '<span class="pill wa">' + (s.precisaChegar ? 'Chegou na matriz · aguardando conferência' : 'Pronta pra conferência') + '</span>';
    return '<span class="pill wa">Ainda na filial</span>';
  }
  /* caixas do StarIA (um por ECF por dia, só dinheiro) esperando o financeiro marcar os que já estão conferidos lá
     (linha preta na tela "Fechamento de Caixa"): só os marcados viram sacola. Agrupados por filial e dia. */
  const marcados = new Set();
  function caixasDe(s) {
    const cx = s.caixas || [];
    if (!cx.length) return '';
    const dias = [...new Set(cx.map(c => c.data))].sort();
    return 'Caixas ' + [...new Set(cx.map(c => c.ecf))].sort().map(esc).join(', ') + ' · ' + (dias.length === 1 ? dBR(dias[0]) : dBR(dias[0]) + ' a ' + dBR(dias[dias.length - 1]));
  }
  const grupoDe = l => l.filial + '|' + l.data;
  const cxDiasAbertos = new Set(); // dias de cada filial abertos (começam minimizados)
  const cxFilAbertas = new Set();  // filiais abertas na lista de caixas
  function htmlCaixasPendentes() {
    const lista = S.caixasPendentes;
    if (!lista || !lista.length) return '';
    for (const id of [...marcados]) if (!lista.some(l => l.id === id)) marcados.delete(id);
    const grupos = {};
    for (const l of lista) (grupos[grupoDe(l)] = grupos[grupoDe(l)] || []).push(l);
    const chaves = Object.keys(grupos).sort((a, b) => { const [fa, da] = a.split('|'), [fb, db] = b.split('|'); return fa - fb || (da < db ? -1 : da > db ? 1 : 0); });
    return `<section class="card">
      <div class="sec"><h2>Caixas do StarIA para marcar</h2><span class="badge">${lista.length}</span></div>
      <details class="how ajuda"><summary>Quais devo marcar?</summary>
        <p>Abra no StarIA a tela <b>Fechamento de Caixa (PDV)</b>. Marque aqui só os caixas que lá estão em <b>preto</b> (já conferidos). Os vermelhos ficam sem marcar: continuam aqui e a próxima consulta atualiza o valor.</p></details>
      <div>${[...new Set(chaves.map(k => k.split('|')[0]))].map(f => {
        // filial (minimizada) -> dias (minimizados, quando há mais de um) -> caixas. Nada some: caixa pendente
        // de dias atrás continua aqui até ser enviado para a sacola.
        const ks = chaves.filter(k => k.split('|')[0] === f), todos = ks.flatMap(k => grupos[k]);
        const totF = todos.some(l => l.dinheiro != null) ? money(r2(todos.reduce((a, l) => a + (l.dinheiro || 0), 0))) : '';
        const caixasDoDia = k => `<div class="list">${grupos[k].map(l => `<label class="it${marcados.has(l.id) ? ' on' : ''}" data-cxrow="${esc(l.id)}">
            <input type="checkbox" class="ck" data-cx="${esc(l.id)}" ${marcados.has(l.id) ? 'checked' : ''}>
            <div class="tx"><b>Caixa ${esc(l.ecf)}</b></div>${l.dinheiro == null ? '' : `<div class="vl">${money(l.dinheiro)}</div>`}
          </label>`).join('')}</div>`;
        const dia = k => { const ls = grupos[k], d = k.split('|')[1];
          const tot = ls.some(l => l.dinheiro != null) ? money(r2(ls.reduce((a, l) => a + (l.dinheiro || 0), 0))) : '';
          return ks.length > 1
            ? `<details class="crfil cxdia sub" data-cxdia="${esc(k)}"${cxDiasAbertos.has(k) ? ' open' : ''}>
                <summary><span class="tx"><b>${dBR(d)}</b><span class="small muted">${plural(ls.length, 'caixa', 'caixas')} · <span data-cxdiaresumo="${esc(k)}"></span>${atrasoTag(d)}</span></span><span class="vl">${tot}</span><span class="crfil-seta" aria-hidden="true"></span></summary>
                <div class="grp" style="border-top:0;padding-top:0"><span class="small muted">Caixas de ${dBR(d)}</span><button type="button" class="lnk" data-grupo="${esc(k)}">Marcar todos</button></div>
                ${caixasDoDia(k)}</details>`
            : `<div class="grp"><b>${dBR(d)}</b><span data-cxdiaresumo="${esc(k)}" class="small muted"></span><button type="button" class="lnk" data-grupo="${esc(k)}">Marcar todos</button></div>${caixasDoDia(k)}`; };
        return `<details class="crfil cxdia" data-cxfil="${esc(f)}"${cxFilAbertas.has(f) ? ' open' : ''}>
          <summary><span class="tx"><b>Filial ${esc(f)}</b><span class="small muted">${ks.length > 1 ? ks.length + ' dias · ' : dBR(ks[0].split('|')[1]) + ' · '}${plural(todos.length, 'caixa', 'caixas')} · <span data-cxfilresumo="${esc(f)}"></span></span></span><span class="vl">${totF}</span><span class="crfil-seta" aria-hidden="true"></span></summary>
          ${ks.map(dia).join('')}</details>`;
      }).join('')}</div>
      <div class="sbar"><div class="t" id="cxResumo"></div><button class="btn" type="button" id="btnEnviarCx" disabled>Enviar</button></div>
    </section>`;
  }
  function ligarCaixasPendentes() {
    const lista = S.caixasPendentes || [];
    const atualiza = () => {
      const sel = lista.filter(l => marcados.has(l.id));
      const total = r2(sel.reduce((a, l) => a + l.dinheiro, 0));
      const r = $('#cxResumo'), b = $('#btnEnviarCx');
      const comValor = sel.some(l => l.dinheiro != null);
      if (r) r.innerHTML = sel.length ? `${plural(sel.length, 'caixa marcado', 'caixas marcados')}${comValor ? `<b>${money(total)}</b>` : ''}` : 'Marque os caixas que estão em preto no StarIA';
      if (b) { b.disabled = !sel.length; b.textContent = sel.length ? 'Enviar para a sacola' : 'Enviar'; }
      document.querySelectorAll('[data-cxrow]').forEach(x => x.classList.toggle('on', marcados.has(x.dataset.cxrow)));
      document.querySelectorAll('[data-grupo]').forEach(g => { const ls = lista.filter(l => grupoDe(l) === g.dataset.grupo); g.textContent = ls.every(l => marcados.has(l.id)) ? 'Desmarcar' : 'Marcar todos'; });
      document.querySelectorAll('[data-cxdiaresumo]').forEach(el => { const ls = lista.filter(l => grupoDe(l) === el.dataset.cxdiaresumo), n = ls.filter(l => marcados.has(l.id)).length;
        el.textContent = !n ? 'nenhum marcado' : n === ls.length ? 'todos marcados' : n + ' de ' + ls.length + ' marcados'; el.style.color = n ? 'var(--ok)' : ''; el.style.fontWeight = n ? '700' : ''; });
      document.querySelectorAll('[data-cxfilresumo]').forEach(el => { const ls = lista.filter(l => String(l.filial) === el.dataset.cxfilresumo), n = ls.filter(l => marcados.has(l.id)).length;
        el.textContent = !n ? 'nenhum marcado' : n === ls.length ? 'todos marcados' : n + ' de ' + ls.length + ' marcados'; el.style.color = n ? 'var(--ok)' : ''; el.style.fontWeight = n ? '700' : ''; });
    };
    document.querySelectorAll('[data-cxdia]').forEach(d => d.addEventListener('toggle', () => { if (d.open) cxDiasAbertos.add(d.dataset.cxdia); else cxDiasAbertos.delete(d.dataset.cxdia); }));
    document.querySelectorAll('[data-cxfil]').forEach(d => d.addEventListener('toggle', () => { if (d.open) cxFilAbertas.add(d.dataset.cxfil); else cxFilAbertas.delete(d.dataset.cxfil); }));
    document.querySelectorAll('[data-cx]').forEach(c => c.addEventListener('change', () => { if (c.checked) marcados.add(c.dataset.cx); else marcados.delete(c.dataset.cx); atualiza(); }));
    document.querySelectorAll('[data-grupo]').forEach(g => g.addEventListener('click', () => {
      const ls = lista.filter(l => grupoDe(l) === g.dataset.grupo), todos = ls.every(l => marcados.has(l.id));
      ls.forEach(l => { if (todos) marcados.delete(l.id); else marcados.add(l.id); });
      document.querySelectorAll('[data-cx]').forEach(c => { c.checked = marcados.has(c.dataset.cx); });
      atualiza();
    }));
    const b = $('#btnEnviarCx');
    if (b) b.addEventListener('click', async () => {
      const sel = lista.filter(l => marcados.has(l.id)), ids = sel.map(l => l.id);
      const total = r2(sel.reduce((a, l) => a + l.dinheiro, 0));
      const vtxt = sel.some(l => l.dinheiro != null) ? ' (' + money(total) + ')' : '';
      if (!ids.length) return toast('Marque pelo menos um caixa antes de enviar.', true);
      if (!await perguntar('Enviar ' + plural(ids.length, 'caixa', 'caixas') + vtxt + ' para a sacola?', 'Confira se todos estão em preto no StarIA.', 'Enviar para a sacola')) return;
      b.disabled = true;
      const r = await post('/api/caixa/caixas/aceitar', { ids }, 'Enviado para a sacola');
      if (r) marcados.clear(); else b.disabled = false;
      render();
    });
    atualiza();
  }
  /* cartão de uma sacola a receber: valor grande, de onde veio, 3 etapas e UMA ação */
  function htmlSacola(s) {
    const chegou = !!s.chegouEm, pode = podeConferirSacola();
    const e1 = s.precisaChegar ? 'Na filial' : 'Na matriz';
    const acao = !chegou ? `<button class="btn pri full" type="button" data-chegou="${esc(s.id)}">${ic('truck')} A sacola chegou na matriz</button>`
      : pode ? `<button class="btn gold full" type="button" data-conferir="${esc(s.id)}">${ic('count')} Conferir agora</button>`
      : '<span class="pill wa">Esperando o financeiro conferir</span>';
    return `<div class="sac">
      <div class="top"><div><b>Filial ${esc(s.filial)}</b><div class="small muted">${caixasDe(s) || dBR(s.periodoIni) + ' a ' + dBR(s.periodoFim)}</div></div>
        ${s.valorStaria == null ? '' : `<div class="vl">${money(s.valorStaria)}</div>`}</div>
      ${s.crediStaria ? `<p class="small muted">+ ${money(s.crediStaria)} de crediário recebido (informar na conferência)</p>` : ''}
      <div><div class="steps"><span class="${chegou ? 'on' : 'cur'}"></span><span class="${chegou ? 'cur' : ''}"></span><span></span></div>
        <div class="stepl" style="margin-top:4px"><span>${e1}</span><span>Chegou</span><span>Conferida</span></div></div>
      ${acao}
    </div>`;
  }
  /* ---------- crediário recebido (cliente pagando a conta), um por um ----------
     O financeiro diz como cada um pagou. Dinheiro: vem na sacola da filial e é contado junto. Pix/cartão/outro: o
     dono confere no extrato (Mais → Crediário: conferir no banco). */
  // a loja confirmou que o comprovante/dinheiro desse recebimento foi na sacola? (só aparece para a filial ≠ matriz ou quando houver confirmação)
  const lojaTag = c => c.lojaOk ? `<span style="color:var(--ok);font-weight:600">✓ Loja confirmou que foi na sacola${c.lojaOkPor ? ' (' + esc(c.lojaOkPor) + ')' : ''}</span>`
    : c.filial !== 1 ? '<span style="color:var(--wa)">Loja ainda não confirmou</span>' : '';
  const FORMA_TXT = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', outro: 'Outro' };
  const escolhas = new Map();   // escolhas ainda não salvas: id -> forma
  const crFilAbertas = new Set(); // filiais do crediário abertas (começam minimizadas)
  const crCliAbertos = new Set();
  const crDiaAbertos = new Set(); // dias abertos dentro de cada filial (quando há mais de um) // clientes com vários títulos abertos (filial|data|nome)
  const sugestao = c => /CART/i.test(c.conta || '') ? 'cartao' : /SICOOB|BANCO|PIX/i.test(c.conta || '') ? 'pix' : null;
  function crediEsperado(s) {
    const fim = String(s.periodoFim).slice(0, 10);
    const ls = (S.crediarios || []).filter(c => c.filial === s.filial && c.forma === 'dinheiro' && !c.contado && c.data <= fim);
    // da mesma filial e período, ainda sem forma salva (ou com escolha na tela ainda não salva)
    const pend = (S.crediarios || []).filter(c => c.filial === s.filial && !c.contado && c.data <= fim && (!c.forma || (escolhas.has(c.id) && escolhas.get(c.id) !== c.forma)));
    return { n: ls.length, total: r2(ls.reduce((a, c) => a + c.valor, 0)), itens: ls, pend: pend.length };
  }
  const segFormas = (c, atual) => `<div class="seg${atual ? '' : ' vazio'}" role="group" aria-label="Forma de pagamento">${Object.keys(FORMA_TXT).map(f =>
    `<button type="button" data-cf="${esc(c.id)}" data-f="${f}" class="${atual === f ? 'on' : ''}" aria-pressed="${atual === f}">${FORMA_TXT[f]}</button>`).join('')}</div>`;
  function htmlCrediFormas() {
    if (!podeConferirSacola() || !S.crediarios) return '';
    const sem = S.crediarios.filter(c => !c.forma);
    const corrigiveis = S.crediarios.filter(c => c.forma && !c.contado && c.banco !== 'achei' && c.banco !== 'nao_achei');
    for (const c of sem) if (!escolhas.has(c.id) && sugestao(c)) escolhas.set(c.id, sugestao(c));
    for (const id of [...escolhas.keys()]) if (!S.crediarios.some(c => c.id === id)) escolhas.delete(id);
    if (!sem.length && !corrigiveis.length) return '';
    const grupos = {};
    for (const c of sem) (grupos[c.filial + '|' + c.data] = grupos[c.filial + '|' + c.data] || []).push(c);
    const chaves = Object.keys(grupos).sort((a, b) => { const [fa, da] = a.split('|'), [fb, db] = b.split('|'); return fa - fb || (da < db ? -1 : da > db ? 1 : 0); });
    // cliente com mais de um título no mesmo dia/filial: fica num bloco minimizado, com "todos" de uma vez
    const porCliente = (k, itens) => {
      const m = new Map(); for (const c of itens) { const n = c.cliente || 'Cliente'; (m.get(n) || m.set(n, []).get(n)).push(c); }
      return [...m.entries()].map(([nome, cs]) => cs.length === 1 ? linha(cs[0], escolhas.get(cs[0].id)) :
        `<details class="crcli" data-crcli="${esc(k + '|' + nome)}"${crCliAbertos.has(k + '|' + nome) ? ' open' : ''}>
          <summary><span class="tx"><b>${esc(nome)}</b><span>${plural(cs.length, 'título', 'títulos')} · <span data-crcliresumo="${esc(k + '|' + nome)}"></span></span></span><span class="vl">${money(r2(cs.reduce((a, c) => a + c.valor, 0)))}</span><span class="crfil-seta" aria-hidden="true"></span></summary>
          <div class="crcli-todos"><span class="small muted">Todos:</span>${Object.keys(FORMA_TXT).map(f => `<button type="button" class="lnk" data-crtodos="${esc(k + '|' + nome)}" data-f="${f}">${FORMA_TXT[f]}</button>`).join('')}</div>
          <div class="list">${cs.map(c => linha(c, escolhas.get(c.id), true)).join('')}</div></details>`).join('');
    };
    const linha = (c, atual, soTitulo) => `<div class="it cr"><div class="tx">${soTitulo ? `<b>Título ${esc(c.numero || '—')}</b><span>${c.conta && c.conta !== 'CONVENIOS' ? 'no StarIA: ' + esc(c.conta) : ''}</span>` : `<b>${esc(c.cliente || 'Cliente')}</b><span>Título ${esc(c.numero || '—')}${c.conta && c.conta !== 'CONVENIOS' ? ' · no StarIA: ' + esc(c.conta) : ''}</span>`}${lojaTag(c)}</div><div class="vl">${money(c.valor)}</div>${segFormas(c, atual)}</div>`;
    return `<section class="card">
      <div class="sec"><h2>Crediário: como o cliente pagou?</h2>${sem.length ? `<span class="badge">${sem.length}</span>` : ''}</div>
      <details class="how ajuda"><summary>Por que marcar?</summary>
        <p>O StarIA não diz como cada cliente pagou a conta. <b>Dinheiro</b> tem que vir na sacola da filial e é contado junto. <b>Pix</b> e <b>cartão</b> o dono confere no extrato. <b>Outro</b>: desconto em folha, cheque etc.</p></details>
      ${[...new Set(chaves.map(k => k.split('|')[0]))].map(f => {
        const ks = chaves.filter(k => k.split('|')[0] === f), itens = ks.flatMap(k => grupos[k]);
        return `<details class="crfil" data-crfil="${esc(f)}"${crFilAbertas.has(f) ? ' open' : ''}>
        <summary><span><b>Filial ${esc(f)}</b><span class="small muted"> · ${ks.length > 1 ? ks.length + ' dias · ' : ''}${plural(itens.length, 'recebimento', 'recebimentos')} · ${money(r2(itens.reduce((a, c) => a + c.valor, 0)))}</span></span><span class="crfil-seta" aria-hidden="true"></span></summary>
        ${ks.map(k => { const d = k.split('|')[1], ls = grupos[k];
          const corpo = `<div class="grp"${ks.length > 1 ? ' style="border-top:0;padding-top:0"' : ''}><b>${ks.length > 1 ? '' : dBR(d)}</b><button type="button" class="lnk" data-crgrupo="${esc(k)}">Os sem marcar = Dinheiro</button></div>
        <div class="list">${porCliente(k, ls)}</div>`;
          // mais de um dia na filial: cada dia vira um bloco minimizado (nada some até ser marcado)
          return ks.length > 1 ? `<details class="crfil sub" data-crdia="${esc(k)}"${crDiaAbertos.has(k) ? ' open' : ''}>
            <summary><span class="tx" style="flex:1;min-width:0;display:flex;flex-direction:column"><b>${dBR(d)}</b><span class="small muted">${plural(ls.length, 'recebimento', 'recebimentos')} · <span data-crdiaresumo="${esc(k)}"></span>${atrasoTag(d)}</span></span><span style="font-weight:700;white-space:nowrap">${money(r2(ls.reduce((a, c) => a + c.valor, 0)))}</span><span class="crfil-seta" aria-hidden="true"></span></summary>
            ${corpo}</details>` : corpo; }).join('')}
        </details>`; }).join('')}
      ${corrigiveis.length ? `<details class="how neutro" style="margin-top:12px"><summary>Já marcados, ainda dá para corrigir (${corrigiveis.length})</summary>
        <div class="list">${corrigiveis.map(c => linha(c, escolhas.get(c.id) || c.forma)).join('')}</div></details>` : ''}
      <div class="sbar"><div class="t" id="crResumo"></div><button class="btn" type="button" id="btnSalvarCr" disabled>Salvar</button></div>
    </section>`;
  }
  function ligarCrediFormas() {
    const lista = S.crediarios || [];
    const mudancas = () => [...escolhas.entries()].filter(([id, f]) => { const c = lista.find(x => x.id === id); return c && c.forma !== f; });
    const atualiza = () => {
      document.querySelectorAll('[data-cf]').forEach(b => { const c = lista.find(x => x.id === b.dataset.cf); const on = (escolhas.get(b.dataset.cf) || (c && c.forma)) === b.dataset.f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      document.querySelectorAll('.seg').forEach(g => g.classList.toggle('vazio', !g.querySelector('button.on')));
      document.querySelectorAll('[data-crcliresumo]').forEach(el => {
        const cs = doCli(el.dataset.crcliresumo), marc = cs.filter(c => escolhas.has(c.id));
        const fs = [...new Set(marc.map(c => FORMA_TXT[escolhas.get(c.id)]))];
        el.textContent = !marc.length ? 'sem marcar' : marc.length < cs.length ? (cs.length - marc.length) + ' sem marcar' : fs.join(' + ');
      });
      document.querySelectorAll('[data-crdiaresumo]').forEach(el => {
        const ls = lista.filter(c => !c.forma && c.filial + '|' + c.data === el.dataset.crdiaresumo), falta = ls.filter(c => !escolhas.has(c.id)).length;
        el.textContent = falta ? falta + ' sem marcar' : 'tudo marcado'; el.style.color = falta ? '' : 'var(--ok)'; el.style.fontWeight = falta ? '' : '700';
      });
      const m = mudancas(), r = $('#crResumo'), b = $('#btnSalvarCr');
      const falta = lista.filter(c => !c.forma && !escolhas.has(c.id)).length;
      if (r) r.innerHTML = m.length ? plural(m.length, 'recebimento para salvar', 'recebimentos para salvar') + (falta ? `<b>${plural(falta, 'sem marcar', 'sem marcar')}</b>` : '') : (falta ? 'Toque na forma de cada recebimento' : 'Tudo marcado');
      if (b) { b.disabled = !m.length; b.textContent = m.length ? 'Salvar ' + m.length : 'Salvar'; }
    };
    document.querySelectorAll('[data-crfil]').forEach(d => d.addEventListener('toggle', () => { if (d.open) crFilAbertas.add(d.dataset.crfil); else crFilAbertas.delete(d.dataset.crfil); }));
    document.querySelectorAll('[data-crdia]').forEach(d => d.addEventListener('toggle', () => { if (d.open) crDiaAbertos.add(d.dataset.crdia); else crDiaAbertos.delete(d.dataset.crdia); }));
    document.querySelectorAll('[data-crcli]').forEach(d => d.addEventListener('toggle', () => { if (d.open) crCliAbertos.add(d.dataset.crcli); else crCliAbertos.delete(d.dataset.crcli); }));
    const doCli = key => { const [f, d, ...n] = key.split('|'); const nome = n.join('|'); return lista.filter(c => !c.forma && String(c.filial) === f && c.data === d && (c.cliente || 'Cliente') === nome); };
    document.querySelectorAll('[data-crtodos]').forEach(b => b.addEventListener('click', () => { doCli(b.dataset.crtodos).forEach(c => escolhas.set(c.id, b.dataset.f)); atualiza(); }));
    document.querySelectorAll('[data-cf]').forEach(b => b.addEventListener('click', () => { escolhas.set(b.dataset.cf, b.dataset.f); atualiza(); }));
    document.querySelectorAll('[data-crgrupo]').forEach(g => g.addEventListener('click', () => {
      lista.filter(c => !c.forma && c.filial + '|' + c.data === g.dataset.crgrupo && !escolhas.has(c.id)).forEach(c => escolhas.set(c.id, 'dinheiro')); atualiza();
    }));
    const b = $('#btnSalvarCr');
    if (b) b.addEventListener('click', async () => {
      const itens = mudancas().map(([id, forma]) => ({ id, forma }));
      if (!itens.length) return;
      b.disabled = true;
      const r = await post('/api/caixa/credi/forma', { itens }, 'Forma do crediário salva');
      if (r) { itens.forEach(i => escolhas.delete(i.id)); if (r.travadas) toast(plural(r.travadas, 'recebimento já estava conferido e não mudou', 'recebimentos já estavam conferidos e não mudaram'), true); }
      render();
    });
    atualiza();
  }
  /* dono: confere no extrato do banco/maquininha o que foi marcado como Pix, cartão ou outro */
  function renderCrediarioBanco() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const todos = (S.crediarios || []).filter(c => c.forma && c.forma !== 'dinheiro');
    const naoAchei = todos.filter(c => c.banco === 'nao_achei');
    const pend = todos.filter(c => !c.banco);
    const achados = todos.filter(c => c.banco === 'achei');
    const porDia = {};
    for (const c of pend) (porDia[c.data] = porDia[c.data] || []).push(c);
    const dias = Object.keys(porDia).sort().reverse();
    const linha = (c, acoes) => `<div class="it cr"><div class="tx"><b>${esc(c.cliente || 'Cliente')} · ${money(c.valor)}</b><span>${FORMA_TXT[c.forma]} · Filial ${esc(c.filial)} · ${dBR(c.data)} · marcado por ${esc(c.formaPor || '')}</span></div>${acoes}</div>`;
    const botoes = c => `<div class="row" style="width:100%;justify-content:flex-end"><button type="button" class="btn sm" data-bk="${esc(c.id)}" data-r="nao_achei">Não achei</button><button type="button" class="btn sm pri" data-bk="${esc(c.id)}" data-r="achei">Achei</button></div>`;
    $('#main').innerHTML = `<div class="pagehd"><h1>Crediário no banco</h1><p>Abra o extrato do banco (e da maquininha, para cartão). Para cada recebimento, toque em <b>Achei</b> ou <b>Não achei</b>. O que não cair vira alerta.</p></div>
      ${naoAchei.length ? `<section class="card"><div class="sec"><h2 style="color:var(--bad)">Não caiu no banco</h2><span class="badge bad">${naoAchei.length}</span></div>
        <div class="list">${naoAchei.map(c => linha(c, `<div class="row" style="width:100%;justify-content:flex-end"><button type="button" class="btn sm" data-bk="${esc(c.id)}" data-r="achei">Caiu depois: achei</button></div>`)).join('')}</div></section>` : ''}
      <section class="card"><div class="sec"><h2>Para conferir</h2>${pend.length ? `<span class="badge">${pend.length}</span>` : ''}</div>
        ${dias.length ? dias.map(d => `<div class="grp"><b>${dBR(d)} · ${money(r2(porDia[d].reduce((a, c) => a + c.valor, 0)))}</b><button type="button" class="lnk" data-bkdia="${esc(d)}">Achei todos</button></div>
          <div class="list">${porDia[d].map(c => linha(c, botoes(c))).join('')}</div>`).join('')
        : `<div class="empty"><div class="big">${ic('ok')}</div><p>Nada para conferir agora.</p></div>`}
      </section>
      ${achados.length ? `<details class="how neutro card"><summary>Já conferidos (${achados.length})</summary><div class="list">${achados.slice(0, 50).map(c => linha(c, '')).join('')}</div></details>` : ''}`;
    document.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.r === 'nao_achei' && !await perguntar('Não achou no extrato?', 'Esse recebimento vai virar alerta e ocorrência.', 'Não achei', true)) return;
      post('/api/caixa/credi/banco', { ids: [b.dataset.bk], resultado: b.dataset.r }, b.dataset.r === 'achei' ? 'Conferido' : 'Marcado: não caiu no banco');
    }));
    document.querySelectorAll('[data-bkdia]').forEach(b => b.addEventListener('click', async () => {
      const ids = porDia[b.dataset.bkdia].map(c => c.id);
      if (await perguntar('Achou todos no extrato?', 'Os ' + ids.length + ' recebimentos de ' + dBR(b.dataset.bkdia) + '.', 'Achei todos')) post('/api/caixa/credi/banco', { ids, resultado: 'achei' }, 'Conferidos');
    }));
  }
  function renderSacolas() {
    const pendentes = (S.sacolas || []).filter(s => !s.conferidoEm)
      .sort((a, b) => (b.chegouEm ? 1 : 0) - (a.chegouEm ? 1 : 0) || a.filial - b.filial);
    const conferidas = (S.sacolas || []).filter(s => s.conferidoEm);
    $('#main').innerHTML = `<div class="pagehd"><h1>Sacolas</h1><p>O dinheiro de cada filial, do StarIA até entrar no cofre.</p></div>
    ${htmlCrediFormas()}
    ${htmlCaixasPendentes()}
    <section class="card">
      <div class="sec"><h2>A receber</h2>${pendentes.length ? `<span class="badge">${pendentes.length}</span>` : ''}</div>
      ${pendentes.length ? pendentes.map(htmlSacola).join('') : `<div class="empty"><div class="big">${ic('ok')}</div><p>Nenhuma sacola pendente.</p></div>`}
    </section>
    ${conferidas.length ? `<section class="card"><h2>Conferidas</h2><div class="list">${conferidas.slice(0, 20).map(s => `<div class="it">
        <div class="ic ${sacolaOk(s) ? 'ok' : 'bad'}">${ic(sacolaOk(s) ? 'ok' : 'alert')}</div>
        <div class="tx"><b>Filial ${esc(s.filial)}</b><span>${caixasDe(s) || dBR(s.periodoIni) + ' a ' + dBR(s.periodoFim)}</span><span style="margin-top:4px">${sacolaStatus(s)}</span></div>
        ${s.valorContado == null ? '' : `<div class="vl">${money(r2((s.valorContado || 0) + (s.crediDinheiro || 0)))}</div>`}
      </div>`).join('')}</div></section>` : ''}`;
    ligarCaixasPendentes();
    ligarCrediFormas();
    document.querySelectorAll('[data-chegou]').forEach(b => b.addEventListener('click', () => post('/api/caixa/sacola/chegou', { id: b.dataset.chegou }, 'Marcado: chegou na matriz')));
    document.querySelectorAll('[data-conferir]').forEach(b => b.addEventListener('click', () => sheetConferirSacola(S.sacolas.find(s => s.id === b.dataset.conferir))));
  }
  // a equipe recebe só "bateu" (contagem cega); o dono recebe a diferença
  const sacolaOk = s => s.diferenca == null ? s.bateu !== false : dentro(s.diferenca) && (!s.crediStaria || dentro(s.crediDiferenca));
  /* conferir a sacola. Para a equipe é às cegas: não vê o valor do StarIA, só conta e digita o total. Antes de
     gravar, o app CHECA (sem gravar) se bateu; se não bateu, pede para contar de novo uma vez, e só então registra. */
  function sheetConferirSacola(s) {
    const cego = !isAdmin(), legado = !!s.crediStaria && !String(s.jobId || '').startsWith('lt');
    const caixas = s.caixas || [];
    openSheet(`<div class="tt"><h2>Conferir sacola · Filial ${esc(s.filial)}</h2><button class="x" type="button" id="shxb" aria-label="Fechar">✕</button></div>
      <p class="muted small">${cego ? 'Conte todo o dinheiro de vendas que veio na sacola e digite o total. Você não vê o valor esperado: o app só diz se bateu.' : 'O StarIA apontou ' + money(s.valorStaria) + ' em vendas em dinheiro dessa filial. Digite o que realmente veio dentro da sacola: é esse valor que entra no cofre. Se houve sangria no caixa, informe abaixo: ela é descontada do esperado.'}</p>
      ${caixas.length ? `<div class="list small" style="margin-bottom:10px">${caixas.map(c => `<div class="it"><div class="tx"><b>Caixa ${esc(c.ecf)}</b><span>${dBR(c.data)}</span></div>${c.dinheiro == null ? '' : `<div class="vl">${money(c.dinheiro)}</div>`}</div>`).join('')}</div>` : ''}
      <form id="fcs">
        <div class="field"><label for="csSangria">Sangria feita no caixa (se houve)</label><input type="text" id="csSangria" inputmode="decimal" placeholder="0,00"><span class="small muted">Dinheiro que saiu do caixa durante o dia e não veio na sacola. O app desconta do que era esperado.</span></div>
        <div class="field"><label for="csValor">Total de vendas contado</label><input type="text" id="csValor" inputmode="decimal" placeholder="Digite o total contado" required></div>
        ${legado && !cego ? `<div class="note">O StarIA apontou ${money(s.crediStaria)} de crediário recebido. Diga quanto disso foi em cada forma, só o dinheiro entra no cofre.</div>
        <div class="field"><label for="csCrediDinheiro">Crediário em dinheiro</label><input type="text" id="csCrediDinheiro" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label for="csCrediCartao">Crediário em cartão</label><input type="text" id="csCrediCartao" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label for="csCrediPix">Crediário em Pix</label><input type="text" id="csCrediPix" inputmode="decimal" placeholder="0,00"></div>`
        : (() => { const e = crediEsperado(s);
          // dono: vê e já vem preenchido. Equipe: conta às cegas (campo vazio, só os nomes, sem valores nem total)
          const sem = s.filial !== 1 ? e.itens.filter(c => !c.lojaOk) : [];
          const tagLoja = c => s.filial !== 1 ? (c.lojaOk ? ' · <span style="color:var(--ok)">✓ loja confirmou</span>' : ' · <span style="color:var(--wa)">loja não confirmou</span>') : '';
          return `<div class="field"><label for="csCrediDinheiro">Dinheiro de crediário que veio na sacola (clientes pagando conta)</label><input type="text" id="csCrediDinheiro" inputmode="decimal" placeholder="${cego ? 'Conte e digite o total' : '0,00'}" value="${!cego && e.total ? numIn(e.total) : ''}"></div>
          ${e.pend ? `<div class="warn small" style="margin-top:-6px"><b>${plural(e.pend, 'recebimento desta filial está', 'recebimentos desta filial estão')} sem a forma salva.</b> Volte em Crediário, marque e toque em Salvar antes de conferir.</div>` : ''}
          ${sem.length ? `<div class="warn small" style="margin-top:-6px"><b>A loja não confirmou ${plural(sem.length, 'recebimento', 'recebimentos')} em dinheiro${cego ? '' : ' (' + money(r2(sem.reduce((a, c) => a + c.valor, 0))) + ')'}.</b> Confira com atenção se esse dinheiro veio mesmo na sacola.</div>` : ''}
          ${e.n ? `<details class="how" style="margin-top:-6px"><summary>${cego ? 'Papéis de crediário em dinheiro para procurar na sacola (' + e.n + ')' : 'Vem de ' + plural(e.n, 'recebimento marcado', 'recebimentos marcados') + ' como Dinheiro: ' + money(e.total)}</summary>
            <div class="list small">${e.itens.map(c => `<div class="it"><div class="tx"><b>${esc(c.cliente || 'Cliente')}</b><span>Título ${esc(c.numero || '—')} · ${dBR(c.data)}${tagLoja(c)}</span></div>${cego ? '' : `<div class="vl">${money(c.valor)}</div>`}</div>`).join('')}</div>
            <p>${cego ? 'Separe o dinheiro de crediário desses clientes, conte e digite o total acima. O app diz se bateu.' : 'Confira se esse dinheiro está mesmo na sacola. Se veio diferente, troque o valor.'}</p></details>`
          : `<p class="small muted" style="margin-top:-6px">Nenhum recebimento de crediário desta filial marcado como Dinheiro.</p>`}`; })()}
        <div class="field"><label for="csMotivo">Observação (opcional)</label><input type="text" id="csMotivo" maxlength="300" placeholder="Ex.: nota rasgada, envelope sem nome…"></div>
        <button class="btn pri lg full" type="submit">${cego ? 'Verificar' : 'Confirmar conferência'}</button>
      </form><div id="csOut"></div>`, () => {
      $('#shxb').addEventListener('click', () => { closeSheet(); render(); });
      let tentativa = 0;
      const confirmar = async () => {
        const cd = $('#csCrediDinheiro'), cc = $('#csCrediCartao'), cp = $('#csCrediPix');
        const r = await api('/api/caixa/sacola/conferir', {
          id: s.id, valorContado: $('#csValor').value, sangria: $('#csSangria').value, motivo: $('#csMotivo').value,
          crediDinheiro: cd ? cd.value : undefined, crediCartao: cc ? cc.value : undefined, crediPix: cp ? cp.value : undefined
        });
        await reload();
        $('#fcs').hidden = true;
        if (r.bateu) $('#csOut').innerHTML = `<div class="okbox"><b>Bateu certinho!</b> O dinheiro entrou no cofre.</div>`;
        else if (r.diferenca == null) $('#csOut').innerHTML = `<div class="warn"><b>Registrado.</b> Não bateu com o esperado: o dono vai ver.</div>`;
        else $('#csOut').innerHTML = `<div class="warn">${r.diferenca ? `<b>Vendas: ${r.diferenca > 0 ? 'sobrou' : 'faltou'} ${money(Math.abs(r.diferenca))}.</b><br>` : ''}${r.crediDiferenca ? `<b>Crediário: ${r.crediDiferenca > 0 ? 'sobrou' : 'faltou'} ${money(Math.abs(r.crediDiferenca))}.</b><br>` : ''}Ficou registrado nas Ocorrências.</div>`;
      };
      $('#fcs').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          if (!cego || tentativa >= 1) return await confirmar();
          // equipe, 1ª vez: só checa (não grava). Bateu → grava; não bateu → conta de novo, e na 2ª grava o que der.
          const cdv = $('#csCrediDinheiro');
          const c = await api('/api/caixa/sacola/checar', { id: s.id, valorContado: $('#csValor').value, sangria: $('#csSangria').value, crediDinheiro: cdv ? cdv.value : undefined });
          if (c.bateu) return await confirmar();
          tentativa++;
          $('#csOut').innerHTML = `<div class="warn"><b>Não bateu.</b> Conte de novo com calma e digite o total. Na próxima vez fica registrado o que você digitar.</div>`;
          b.textContent = 'Registrar a contagem'; $('#csValor').select();
        } catch (er) { fail(er); } finally { b.disabled = false; }
      });
    });
  }

  /* ---------- Acessos (admin): quem guarda o caixa (caixista), quem guarda o caixa e também confere as sacolas
     (financeiro — não é obrigatório ter as duas pessoas, uma só como financeiro cobre o dia a dia) e o acesso de
     automação (só o Claude, importação noturna do StarIA) ---------- */
  const papelLabel = (p, f) => p === 'loja' ? 'Loja · Filial ' + (f || '?') + ' · confirma o crediário que vai na sacola' : p === 'financeiro' ? 'Financeiro · guarda o caixa e confere as sacolas' : p === 'automacao' ? 'Automação · só StarIA' : 'Caixista · guarda o dinheiro';
  function renderAcessos() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    $('#main').innerHTML = `<section class="card">
      <h1>Acessos</h1>
      <p class="muted small">Quem pode entrar neste controle de caixa. Ninguém vê custo ou margem (não existe nada disso aqui), e ninguém apaga ou cancela nada — isso é só pelo seu usuário.</p>
      ${S.pessoas.length ? `<div class="list">${S.pessoas.map(p => `<div class="it">
          <div class="ic">${p.papel === 'financeiro' ? '✅' : p.papel === 'automacao' ? '🤖' : p.papel === 'loja' ? '🏪' : '👤'}</div><div class="tx"><b>${esc(p.nome)}</b><span>${esc(p.login)} · ${papelLabel(p.papel, p.filial)}${p.relatorios ? ' · abre os Relatórios' : ''}${p.ativo ? '' : ' · inativo'}${p.trocarSenha ? ' · ainda não trocou a senha provisória' : ''}</span></div>
          <div class="vl"><button class="btn sm" type="button" data-editp="${esc(p.login)}">Editar</button></div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhum acesso criado ainda.</p>'}
      <div class="row"><button class="btn pri" type="button" id="btnNovaCaixista">+ Nova pessoa do caixa</button><button class="btn pri" type="button" id="btnNovoFinanceiro">+ Novo acesso do financeiro</button></div>
      <div class="row"><button class="btn pri" type="button" id="btnNovaLoja">🏪 + Pessoa da loja (filial)</button></div>
      <div class="row"><button class="btn" type="button" id="btnNovaAutomacao">🤖 + Acesso de automação (StarIA)</button></div>
    </section>
    <section class="card">
      <h2>Recomeçar do zero</h2>
      <p class="muted small">Apaga o saldo inicial, todos os lançamentos (sangrias, ajustes, gaveta de impostos), as consultas ao StarIA, as sacolas e as conferências. As pessoas e senhas acima continuam. Não dá para desfazer.</p>
      <div class="row"><button class="btn" type="button" id="btnZerar" style="color:var(--red,#b42318);border-color:currentColor">Zerar dados do caixa</button></div>
    </section>
    <div id="pOut"></div>`;
    $('#btnZerar').addEventListener('click', sheetZerar);
    $('#btnNovaCaixista').addEventListener('click', () => sheetPessoa(null, 'caixista'));
    $('#btnNovoFinanceiro').addEventListener('click', () => sheetPessoa(null, 'financeiro'));
    $('#btnNovaAutomacao').addEventListener('click', () => sheetPessoa(null, 'automacao'));
    $('#btnNovaLoja').addEventListener('click', () => sheetPessoa(null, 'loja'));
    document.querySelectorAll('[data-editp]').forEach(b => b.addEventListener('click', () => sheetPessoa(S.pessoas.find(p => p.login === b.dataset.editp))));
  }
  function sheetPessoa(p, papelNovo) {
    const papel = p ? p.papel : papelNovo;
    const auto = papel === 'automacao';
    const loja = papel === 'loja';
    const titulo = p ? 'Editar acesso' : auto ? 'Novo acesso de automação' : loja ? 'Nova pessoa da loja' : (papel === 'financeiro' ? 'Novo acesso do financeiro' : 'Nova pessoa do caixa');
    const sub = loja ? 'Para quem manda a sacola da filial para a matriz. Vê só os recebimentos de crediário da própria filial (nome e valor) e confirma que o comprovante e o dinheiro vão na sacola. Não marca se foi Pix, dinheiro ou cartão (isso é do financeiro na matriz) e não vê saldo, cofre, sangria nem as outras filiais.'
      : auto ? 'Só para o Claude usar na importação noturna do StarIA: pede e entrega a consulta, deixando pronta pra você revisar. Não vê saldo, extrato, pessoas nem ocorrências — mesmo assim, é uma senha guardada fora do app, então escolha uma forte e não reaproveite de outro lugar.'
      : papel === 'financeiro' ? 'Faz tudo que a pessoa do caixa faz (lança sangria, marca quando um valor foi ao banco, confere o caixa físico) e também confere as sacolas das filiais: o valor real de vendas e a forma de pagamento do crediário recebido. Não é obrigatório ter as duas pessoas — pode ser só esta. Não vê os acessos nem a gaveta de impostos.' : 'Lança sangria, vê o saldo, marca quando um valor foi ao banco, confere o caixa físico e também pode marcar a chegada de uma sacola na matriz.';
    openSheet(`<div class="tt"><h2>${titulo}</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">${sub}</p>
      <form id="fp">
        <div class="field"><label for="pLogin">Usuário</label><input type="text" id="pLogin" value="${esc((p || {}).login || '')}" autocapitalize="off" spellcheck="false" ${p ? 'readonly' : ''} required></div>
        <div class="field"><label for="pNome">Nome</label><input type="text" id="pNome" value="${esc((p || {}).nome || '')}" ${auto ? '' : 'required'} placeholder="${auto ? 'Automação (StarIA)' : ''}"></div>
        ${loja ? `<div class="field"><label for="pFilial">Filial</label><select id="pFilial">${[1, 2, 3].map(f => `<option value="${f}" ${((p && p.filial) || 2) === f ? 'selected' : ''}>Filial ${f}</option>`).join('')}</select></div>` : ''}
        ${auto ? `<div class="field"><label for="pSenha">${p ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha'}</label>
            <input type="text" id="pSenha" autocapitalize="off" spellcheck="false" minlength="12" ${p ? '' : 'required'}></div>
          <p class="small muted">Pelo menos 12 caracteres, com letras e números.</p>` : ''}
        ${papel === 'financeiro' ? `<label class="row"><input type="checkbox" id="pRel" ${p && p.relatorios ? 'checked' : ''}> Pode abrir os Relatórios (painel ao vivo do StarIA)</label>` : ''}
        ${p ? `<label class="row"><input type="checkbox" id="pAtivo" ${p.ativo ? 'checked' : ''}> Acesso ativo</label>
          ${auto ? '' : '<label class="row"><input type="checkbox" id="pNova"> Gerar nova senha provisória</label>'}` : ''}
        <button class="btn pri full" type="submit">${p ? 'Salvar' : 'Criar acesso'}</button>
      </form><div id="pOutS"></div>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fp').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const body = { login: $('#pLogin').value.trim().toLowerCase(), nome: $('#pNome').value, papel, ativo: p ? $('#pAtivo').checked : true };
          if (auto) { if ($('#pSenha').value) body.senha = $('#pSenha').value; } else body.novaSenha = p ? $('#pNova').checked : true;
          if (loja) body.filial = Number($('#pFilial').value);
          if (papel === 'financeiro') body.relatorios = $('#pRel').checked;
          const r = await api('/api/caixa/pessoa', body);
          await reload();
          if (r.password) $('#pOutS').innerHTML = `<div class="note" style="display:grid;gap:6px"><b>Anote agora: esta senha aparece só uma vez.</b>
            <span>Usuário: <code>${esc(r.login)}</code></span><span>Senha provisória: <code style="font-size:17px">${esc(r.password)}</code></span>
            <span class="small">No primeiro acesso, a pessoa cria a senha dela.</span></div>`;
          else { toast('Salvo'); closeSheet(); render(); }
        } catch (er) { fail(er); } finally { b.disabled = false; }
      });
    });
  }

  function sheetZerar() {
    openSheet(`<div class="tt"><h2>Zerar dados do caixa</h2><button class="x" type="button" id="shxb">✕</button></div>
      <div class="warn"><b>Isto apaga tudo e não dá para desfazer:</b> saldo inicial, lançamentos (inclusive gaveta de impostos), consultas ao StarIA, sacolas e conferências. As pessoas e senhas continuam. Fica registrado nas Ocorrências.</div>
      <form id="fz">
        <div class="field"><label for="zSenha">Sua senha de administrador</label><input type="password" id="zSenha" autocomplete="current-password" required></div>
        <div class="field"><label for="zConf">Para confirmar, digite ZERAR</label><input type="text" id="zConf" autocapitalize="characters" spellcheck="false" autocomplete="off" required></div>
        <button class="btn pri full" type="submit" disabled>Zerar tudo</button>
      </form>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      const btn = $('#fz').querySelector('button');
      $('#zConf').addEventListener('input', () => { btn.disabled = $('#zConf').value.trim().toUpperCase() !== 'ZERAR'; });
      $('#fz').addEventListener('submit', async e => {
        e.preventDefault(); btn.disabled = true;
        try {
          await api('/api/caixa/zerar', { senha: $('#zSenha').value, confirmacao: $('#zConf').value });
          $('#zSenha').value = '';
          await reload(); closeSheet(); view = 'inicio'; render(); toast('Dados zerados. Configure o saldo inicial para recomeçar.');
        } catch (er) { fail(er); btn.disabled = $('#zConf').value.trim().toUpperCase() !== 'ZERAR'; }
      });
    });
  }

  /* ---------- Ocorrências (admin): conferências com diferença + tudo que foi apagado, alterado ou decidido,
     inclusive pelo próprio admin — para dar transparência e segurança a quem trabalha com o dinheiro. Só leitura. */
  function ocorIcon(o) { return o.tipo === 'conferencia' ? '⚖️' : o.tipo === 'sacola' ? '📦' : '🛡️'; }
  function ocorDetalheTxt(o) {
    const d = o.detalhe || {};
    if (o.tipo === 'conferencia') {
      const sinal = d.diferenca > 0 ? 'Sobrou ' : 'Faltou ';
      return sinal + money(Math.abs(d.diferenca)) + ' (contado ' + money(d.valorContado) + ', esperado ' + money(d.saldoEsperado) + ')' + (d.motivo ? ' · ' + esc(d.motivo) : '') + ' · ' + esc(d.por || '');
    }
    if (o.tipo === 'sacola') {
      const partes = [];
      if (d.diferenca) partes.push('vendas: ' + (d.diferenca > 0 ? 'sobrou ' : 'faltou ') + money(Math.abs(d.diferenca)) + ' (contado ' + money(d.valorContado) + ', StarIA apontava ' + money(d.valorStaria) + (d.sangria ? ', menos ' + money(d.sangria) + ' de sangria no caixa' : '') + ')');
      if (d.crediDiferenca) partes.push('crediário: ' + (d.crediDiferenca > 0 ? 'sobrou ' : 'faltou ') + money(Math.abs(d.crediDiferenca)) + ' (dinheiro+cartão+Pix somou ' + money(r2((d.crediDinheiro || 0) + (d.crediCartao || 0) + (d.crediPix || 0))) + ', StarIA apontava ' + money(d.crediStaria) + ')');
      return 'Filial ' + esc(d.filial) + ': ' + partes.join(' · ') + (d.motivo ? ' · ' + esc(d.motivo) : '') + ' · ' + esc(d.por || '');
    }
    if (o.tipo === 'credi') return 'Filial ' + esc(d.filial) + ' · ' + esc(d.cliente || '') + ' · ' + money(d.valor) + ' em ' + dBR(d.data) + ' · marcado por ' + esc(d.formaPor || '');
    if (o.titulo === 'Ajuste lançado') return (d.valor != null ? money(Number(d.valor)) : '') + ' · ' + esc(d.role || '');
    if (o.titulo === 'Saldo inicial alterado') return 'Novo saldo inicial: ' + money(Number(d.saldoInicial) || 0) + ' · ' + esc(d.role || '');
    if (o.titulo === 'Acesso criado ou alterado') return esc(d.login || '') + (d.papel ? ' · ' + esc(d.papel) : '') + ' · por ' + esc(d.role || '');
    if (o.titulo === 'Lançamento apagado') {
      const tipoTxt = { sangria: 'Sangria', ajuste: 'Ajuste', gaveta_entrada: 'Entrada na gaveta', gaveta_saida: 'Pagamento com a gaveta' }[d.tipo] || 'Lançamento';
      return d.valor != null ? tipoTxt + ' de ' + money(Number(d.valor)) + (d.data ? ' em ' + dBR(d.data) : '') + (d.motivo ? ' · ' + esc(d.motivo) : '') + (d.lancadoPor ? ' · lançado por ' + esc(d.lancadoPor) : '') + ' · apagado por ' + esc(d.role || '') : 'por ' + esc(d.role || '');
    }
    if (o.titulo === 'Forma do crediário trocada') { const F = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', outro: 'Outro' }; return 'Filial ' + esc(d.filial) + ' · ' + esc(d.cliente || '') + ' · título ' + esc(d.numero || '') + ' · ' + money(Number(d.valor) || 0) + ' · de ' + (F[d.de] || esc(d.de)) + ' para ' + (F[d.para] || 'sem forma') + (d.lojaConfirmou ? ' · a loja tinha confirmado que foi na sacola' : '') + ' · por ' + esc(d.por || d.role || ''); }
    if (o.titulo === 'Consulta ao StarIA pedida') return 'Período: ' + (d.periodo || []).map(dBR).join(' a ') + ' · por ' + esc(d.role || '');
    if (o.titulo === 'Consulta ao StarIA aplicada, em sacolas por filial') return 'Já criou as sacolas por filial · por ' + esc(d.role || '');
    if (o.titulo === 'Caixas do StarIA enviados para a sacola') return (Number(d.caixas) || 0) + ' caixa(s) · ' + money(Number(d.total) || 0) + ' em dinheiro · por ' + esc(d.role || '');
    if (o.titulo === 'Dados do caixa zerados (recomeço do zero)') return 'Apagados: ' + (Number(d.lancamentos) || 0) + ' lançamentos, ' + (Number(d.consultas) || 0) + ' consultas, ' + (Number(d.sacolas) || 0) + ' sacolas, ' + (Number(d.conferencias) || 0) + ' conferências · por ' + esc(d.role || '');
    return esc(d.role || '');
  }
  function renderOcorrencias() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const lista = S.ocorrencias || [];
    $('#main').innerHTML = `<div class="pagehd"><h1>Ocorrências</h1><p>Contagens que não bateram e tudo que foi apagado ou alterado, inclusive por você. Ninguém consegue apagar esta lista.</p></div>
      <section class="card">
      ${lista.length ? `<div class="list">${lista.map(o => { const dif = o.tipo === 'conferencia' || o.tipo === 'sacola' || o.tipo === 'credi' || (o.titulo === 'Forma do crediário trocada' && (o.detalhe || {}).de === 'dinheiro'); return `<div class="it" style="align-items:flex-start">
          <div class="ic ${dif ? 'bad' : ''}">${ic(dif ? 'alert' : 'shield')}</div>
          <div class="tx"><b>${esc(o.titulo)}</b><span>${ocorDetalheTxt(o)}</span><span>${dtBR(o.em)}</span></div>
        </div>`; }).join('')}</div>` : `<div class="empty"><div class="big">${ic('ok')}</div><p>Nenhuma ocorrência registrada.</p></div>`}
      </section>`;
  }

  /* ---------- atalho na área de trabalho / tela inicial ----------
     No Chrome e no Edge (computador e Android) o navegador oferece instalar: o app ganha um ícone na área de
     trabalho e abre em janela própria. Onde não oferece (iPhone, Firefox, Safari), mostra o passo a passo. */
  let pedidoInstalar = null;
  const instalado = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); } catch (e) { /* sem service worker */ }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; toast('Atalho criado. Procure o ícone na área de trabalho ou na tela inicial.'); if (S) render(); });
  const rotuloAtalho = () => /Android|iPhone|iPad|iPod/.test(navigator.userAgent || '') ? 'Criar ícone na tela do celular' : 'Criar atalho na área de trabalho';
  async function criarAtalho() {
    if (instalado()) return toast('O app já está aberto pelo atalho.');
    if (pedidoInstalar) {
      const p = pedidoInstalar; pedidoInstalar = null;
      try { await p.prompt(); const r = await p.userChoice; if (r && r.outcome === 'accepted') return; } catch (e) { /* segue para o passo a passo */ }
      return;
    }
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
    const edge = /Edg\//.test(ua), chrome = /Chrome\//.test(ua) && !edge, safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    const passos = ios ? ['Abra este endereço no <b>Safari</b>.', 'Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).', 'Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.']
      : android ? ['Abra este endereço no <b>Chrome</b>.', 'Toque nos <b>três pontinhos</b> (⋮), no canto de cima.', 'Toque em <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>) e confirme.']
      : edge ? ['Clique nos <b>três pontinhos</b> (…), no canto de cima à direita.', 'Vá em <b>Aplicativos</b> → <b>Instalar este site como um aplicativo</b>.', 'Clique em <b>Instalar</b>. Marque a opção de criar atalho na <b>área de trabalho</b>, se aparecer.']
      : chrome ? ['Clique nos <b>três pontinhos</b> (⋮), no canto de cima à direita.', 'Vá em <b>Transmitir, salvar e compartilhar</b> → <b>Instalar página como app</b> (ou <b>Criar atalho</b>).', 'Clique em <b>Instalar</b>. Se pedir, marque <b>Abrir como janela</b>.']
      : safari ? ['No menu <b>Arquivo</b>, clique em <b>Adicionar ao Dock</b>.', 'Clique em <b>Adicionar</b>. O ícone fica no Dock e no Launchpad.']
      : ['Abra este endereço no <b>Google Chrome</b> ou no <b>Microsoft Edge</b>.', 'Volte em <b>Criar atalho na área de trabalho</b> e siga os passos.'];
    openSheet(`<div class="tt"><h2>Criar atalho</h2><button class="x" type="button" id="shxb" aria-label="Fechar">✕</button></div>
      <p class="muted">O app ganha um ícone ${ios || android ? 'na tela inicial do celular' : 'na área de trabalho'} e abre direto, sem precisar digitar o endereço.</p>
      <ol class="passos">${passos.map(t => `<li>${t}</li>`).join('')}</ol>
      <button class="btn pri full" type="button" id="atOk">Entendi</button>`, () => {
      $('#shxb').addEventListener('click', closeSheet); $('#atOk').addEventListener('click', closeSheet);
    });
  }

  /* ---------- pessoa da loja: só confirma o crediário que vai na sacola ---------- */
  // dia que já devia ter ido (antes de ontem): marca "atrasado" para não passar despercebido
  const atrasoTag = d => { const ontem = new Date(Date.parse(hoje() + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10); return d < ontem ? ' · <b style="color:var(--bad)">atrasado</b>' : ''; };
  const lojaMarc = new Set();
  const ljDiasAbertos = new Set();
  function renderLoja() {
    const L = S.crediLoja || [], f = S.loja.filial;
    for (const id of [...lojaMarc]) if (!L.some(c => c.id === id && !c.ok)) lojaMarc.delete(id);
    const falta = L.filter(c => !c.ok), feitos = L.filter(c => c.ok);
    const dias = [...new Set(falta.map(c => c.data))].sort();
    const linha = c => `<label class="it${lojaMarc.has(c.id) ? ' on' : ''}" data-lrow="${esc(c.id)}"><input type="checkbox" class="ck" data-lj="${esc(c.id)}" ${lojaMarc.has(c.id) ? 'checked' : ''}>
      <div class="tx"><b>${esc(c.cliente || 'Cliente')}</b><span>Título ${esc(c.numero || '—')}</span></div><div class="vl">${money(c.valor)}</div></label>`;
    const sac = S.sacolasLoja || [];
    $('#main').innerHTML = `<div class="pagehd"><h1>Filial ${esc(f)}</h1><p>Olá, ${esc(S.me.nome)}. Confirme os recebimentos de crediário que vão na sacola para a matriz.</p></div>
      <section class="card">
        <div class="sec"><h2>Crediário para mandar na sacola</h2>${falta.length ? `<span class="badge">${falta.length}</span>` : ''}</div>
        <details class="how ajuda"><summary>Como fazer</summary><p>Para cada cliente da lista, confira se o papel do recebimento (e o dinheiro, se foi em dinheiro) está indo na sacola. Marque e toque em <b>Confirmar</b>. Não precisa dizer se foi Pix, dinheiro ou cartão: a matriz faz isso pelo papel.</p></details>
        ${dias.length ? dias.map(d => { const ls = falta.filter(c => c.data === d);
          const corpo = `<div class="grp"${dias.length > 1 ? ' style="border-top:0;padding-top:0"' : ''}><b>${dias.length > 1 ? '' : dBR(d)}</b><button type="button" class="lnk" data-ljdia="${esc(d)}">Marcar todos</button></div>
          <div class="list">${ls.map(linha).join('')}</div>`;
          // mais de um dia esperando (a sacola não foi todo dia): cada dia minimizado, e nada some até confirmar
          return dias.length > 1 ? `<details class="crfil sub" data-ljd="${esc(d)}"${ljDiasAbertos.has(d) ? ' open' : ''}>
            <summary><span style="flex:1;min-width:0;display:flex;flex-direction:column"><b>${dBR(d)}</b><span class="small muted">${plural(ls.length, 'recebimento', 'recebimentos')} · <span data-ljdiaresumo="${esc(d)}"></span>${atrasoTag(d)}</span></span><span style="font-weight:700;white-space:nowrap">${money(r2(ls.reduce((a, c) => a + c.valor, 0)))}</span><span class="crfil-seta" aria-hidden="true"></span></summary>
            ${corpo}</details>` : corpo; }).join('')
        : `<div class="empty"><div class="big">${ic('ok')}</div><p>Nada para confirmar agora.</p></div>`}
        ${falta.length ? `<div class="sbar"><div class="t" id="ljResumo"></div><button class="btn" type="button" id="btnLj" disabled>Confirmar</button></div>` : ''}
      </section>
      ${feitos.length ? `<details class="how neutro card"><summary>Já confirmados (${feitos.length})</summary><div class="list">${feitos.map(c => `<div class="it"><div class="ic ok">${ic('ok')}</div>
        <div class="tx"><b>${esc(c.cliente || 'Cliente')}</b><span>Título ${esc(c.numero || '—')} · ${dBR(c.data)}${c.okPor ? ' · por ' + esc(c.okPor) : ''}</span></div><div class="vl">${money(c.valor)}</div></div>`).join('')}</div>
        <p class="small">Confirmou errado? Avise a matriz.</p></details>` : ''}
      ${sac.length ? `<section class="card"><h2>Sacolas da filial</h2><div class="list">${sac.map(s => `<div class="it"><div class="tx"><b>${s.periodoIni === s.periodoFim ? dBR(s.periodoIni) : dBR(s.periodoIni) + ' a ' + dBR(s.periodoFim)}</b></div>
        <span class="pill ${s.conferida ? 'ok' : s.chegou ? 'wa' : ''}">${s.conferida ? 'Conferida na matriz' : s.chegou ? 'Chegou na matriz' : 'Na filial'}</span></div>`).join('')}</div></section>` : ''}`;
    const atualiza = () => {
      const sel = falta.filter(c => lojaMarc.has(c.id)), r = $('#ljResumo'), b = $('#btnLj');
      if (r) r.innerHTML = sel.length ? `${plural(sel.length, 'recebimento marcado', 'recebimentos marcados')}<b>${money(r2(sel.reduce((a, c) => a + c.valor, 0)))}</b>` : 'Marque o que está indo na sacola';
      if (b) { b.disabled = !sel.length; b.textContent = sel.length ? 'Confirmar ' + sel.length : 'Confirmar'; }
      document.querySelectorAll('[data-lrow]').forEach(x => x.classList.toggle('on', lojaMarc.has(x.dataset.lrow)));
      document.querySelectorAll('[data-ljdia]').forEach(g => { const ls = falta.filter(c => c.data === g.dataset.ljdia); g.textContent = ls.every(c => lojaMarc.has(c.id)) ? 'Desmarcar' : 'Marcar todos'; });
      document.querySelectorAll('[data-ljdiaresumo]').forEach(el => { const ls = falta.filter(c => c.data === el.dataset.ljdiaresumo), n = ls.filter(c => lojaMarc.has(c.id)).length;
        el.textContent = !n ? 'nenhum marcado' : n === ls.length ? 'todos marcados' : n + ' de ' + ls.length + ' marcados'; el.style.color = n ? 'var(--ok)' : ''; el.style.fontWeight = n ? '700' : ''; });
    };
    document.querySelectorAll('[data-ljd]').forEach(d => d.addEventListener('toggle', () => { if (d.open) ljDiasAbertos.add(d.dataset.ljd); else ljDiasAbertos.delete(d.dataset.ljd); }));
    document.querySelectorAll('[data-lj]').forEach(c => c.addEventListener('change', () => { if (c.checked) lojaMarc.add(c.dataset.lj); else lojaMarc.delete(c.dataset.lj); atualiza(); }));
    document.querySelectorAll('[data-ljdia]').forEach(g => g.addEventListener('click', () => {
      const ls = falta.filter(c => c.data === g.dataset.ljdia), todos = ls.every(c => lojaMarc.has(c.id));
      ls.forEach(c => { if (todos) lojaMarc.delete(c.id); else lojaMarc.add(c.id); });
      document.querySelectorAll('[data-lj]').forEach(c => { c.checked = lojaMarc.has(c.dataset.lj); }); atualiza();
    }));
    const b = $('#btnLj');
    if (b) b.addEventListener('click', async () => {
      const ids = [...lojaMarc];
      if (!ids.length) return toast('Marque pelo menos um recebimento.', true);
      const tot = r2(falta.filter(c => lojaMarc.has(c.id)).reduce((a, c) => a + c.valor, 0));
      if (!await perguntar('Confirmar ' + plural(ids.length, 'recebimento', 'recebimentos') + '?', 'Os papéis desses clientes (' + money(tot) + ' em crediário) estão indo na sacola para a matriz? Se algum foi em dinheiro, o dinheiro vai junto.', 'Confirmar')) return;
      b.disabled = true;
      const r = await post('/api/caixa/credi/loja', { ids }, 'Confirmado');
      if (r) lojaMarc.clear(); else b.disabled = false;
      render();
    });
    atualiza();
  }

  /* ---------- navegação: 3 abas para a equipe, 4 para o dono ---------- */
  const SUB_MAIS = ['staria', 'acessos', 'gaveta', 'ocorrencias', 'crediario'];
  function render() {
    if (S && S.loja) {
      $('#bn').hidden = true; $('#sair').hidden = false; $('#atualizar').hidden = false; $('#mods').hidden = false; renderLoja();
      if (!instalado()) { $('#main').insertAdjacentHTML('beforeend', `<button type="button" class="btn full" id="atalhoIni">${ic('pin')} ${rotuloAtalho()}</button>`); $('#atalhoIni').addEventListener('click', criarAtalho); }
      return;
    }
    $('#bn').hidden = false; $('#sair').hidden = false; $('#atualizar').hidden = false; $('#mods').hidden = false;
    // Relatórios ao vivo do StarIA: painel no Claude do dono, para o administrador da Dávila Supermercados e para o financeiro que o dono habilitar
    if ($('#modRel')) $('#modRel').hidden = !((isAdmin() || (S && S.me.role === 'financeiro' && S.me.relatorios)) && slug === 'fundo-de-caixa');
    if (view === 'sangria') { view = 'inicio'; setTimeout(sheetSangria, 0); }
    $('#navMais').hidden = !(isAdmin() || isFin());
    const aba = SUB_MAIS.includes(view) ? 'mais' : view;
    document.querySelectorAll('#bn [data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === aba));
    const n = S && S.cfg ? resumo().pendSacolas : 0, dot = $('#navSacolasN');
    if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n; }
    if (view === 'sacolas') renderSacolas();
    else if (view === 'extrato') renderExtrato();
    else if (view === 'mais') renderMais();
    else if (view === 'staria') renderStaria();
    else if (view === 'crediario') renderCrediarioBanco();
    else if (view === 'acessos') renderAcessos();
    else if (view === 'gaveta') renderGaveta();
    else if (view === 'ocorrencias') renderOcorrencias();
    else renderInicio();
    // equipe não tem a aba Mais: o atalho fica no fim do Início
    if (view === 'inicio' && !isAdmin() && !instalado()) {
      $('#main').insertAdjacentHTML('beforeend', `<button type="button" class="btn full" id="atalhoIni">${ic('pin')} ${rotuloAtalho()}</button>`);
      $('#atalhoIni').addEventListener('click', criarAtalho);
    }
    if (SUB_MAIS.includes(view) && (isAdmin() || (isFin() && view === 'gaveta'))) $('#main').insertAdjacentHTML('afterbegin', `<button type="button" class="lnk" data-go="mais" style="justify-self:start;display:inline-flex;align-items:center;gap:2px;margin:-8px 0 -8px -6px">${ic('back')} Mais</button>`);
  }
  function irPara(go) { view = go; closeSheet(); render(); window.scrollTo(0, 0); }
  document.querySelectorAll('#bn [data-go]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.go)));
  /* qualquer [data-go] dentro da tela (atalhos do Início, menu do Mais, "voltar") */
  $('#main').addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); irPara(g.dataset.go); } });
  async function start() {
    try { await reload(); render(); }
    catch (e) { fail(e); }
  }
  /* atualiza sozinho: ao voltar para o app (trocou de aba, desbloqueou o celular) e, enquanto uma consulta ao
     StarIA espera o Claude, a cada 20 s. Não atualiza com um painel aberto (contagem, sangria) para não
     atrapalhar quem está digitando; marcações ainda não salvas continuam marcadas. */
  let ultimaAtual = Date.now();
  async function atualizaSozinho(forcar) {
    if (!S || document.hidden || $('#sheet').innerHTML) return;
    if (!forcar && Date.now() - ultimaAtual < 15000) return;
    ultimaAtual = Date.now();
    const antes = JSON.stringify([(S.jobs || []).map(j => j.status), (S.caixasPendentes || []).length, (S.crediarios || []).length, (S.sacolas || []).length, S.saldo]);
    try { await reload(); } catch (e) { return; }
    const depois = JSON.stringify([(S.jobs || []).map(j => j.status), (S.caixasPendentes || []).length, (S.crediarios || []).length, (S.sacolas || []).length, S.saldo]);
    if (antes !== depois && !$('#sheet').innerHTML) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizaSozinho(true); });
  window.addEventListener('focus', () => atualizaSozinho(false));
  setInterval(() => { if (S && (S.jobs || []).some(j => j.status === 'pendente')) atualizaSozinho(true); }, 20000);
  start();
})();

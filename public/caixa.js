'use strict';
/* Tino — Controle de caixa (ramo 'caixa'). Só a tela: tudo o que grava é conferido no servidor (lib/caixa.js). */
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
  const isFinanceiro = () => !!(S && S.me.role === 'financeiro');
  const podeDecidirCrediario = () => isAdmin() || isFinanceiro();

  /* ---------- entrar ---------- */
  function showLogin(msg) {
    S = null; $('#bn').hidden = true; $('#sair').hidden = true; closeSheet();
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
  $('#sair').addEventListener('click', async () => { try { await api('/api/logout', {}); } catch (e) { /* segue */ } showLogin(); });

  /* ---------- sheet (formulário em baixo) ---------- */
  function closeSheet() { $('#sheet').innerHTML = ''; }
  function openSheet(html, onMount) {
    $('#sheet').innerHTML = `<div class="sheet" id="shx"><div class="pn">${html}</div></div>`;
    $('#shx').addEventListener('click', e => { if (e.target.id === 'shx') closeSheet(); });
    if (onMount) onMount();
  }

  /* ---------- ícone e texto de cada lançamento ---------- */
  function movIcon(m) { return m.tipo === 'venda_staria' ? '🔄' : m.tipo === 'crediario_staria' ? '💳' : m.tipo === 'sangria' ? '💵' : m.tipo === 'gaveta_entrada' ? '🧾' : m.tipo === 'gaveta_saida' ? '➖' : m.valor >= 0 ? '➕' : '➖'; }
  function movTitulo(m) {
    if (m.tipo === 'venda_staria') return 'Vendas em dinheiro';
    if (m.tipo === 'crediario_staria') return 'Recebimento de crediário';
    if (m.tipo === 'sangria') return m.destino === 'impostos' ? 'Sangria · gaveta de impostos' : 'Sangria';
    if (m.tipo === 'gaveta_entrada') return 'Entrada na gaveta (sangria)';
    if (m.tipo === 'gaveta_saida') return 'Pago com a gaveta';
    return 'Ajuste';
  }
  function crediarioBadge(m) {
    if (m.status === 'aprovado') return '<span class="pill ok">Aprovado' + (m.decididoPor ? ' · ' + esc(m.decididoPor) : '') + '</span>';
    if (m.status === 'rejeitado') return '<span class="pill" style="background:var(--red-bg);color:var(--red)">Rejeitado · não entra no saldo</span>';
    return '<span class="pill wa">Aguardando aprovação</span>';
  }
  function movSub(m) {
    if (m.tipo === 'venda_staria') return 'StarIA · ' + dBR(m.periodoIni) + ' a ' + dBR(m.periodoFim);
    if (m.tipo === 'crediario_staria') return 'StarIA · ' + dBR(m.periodoIni) + ' a ' + dBR(m.periodoFim) + ' · ' + crediarioBadge(m);
    const dep = m.tipo === 'sangria' ? (m.depositadoEm ? ' · depositado em ' + dBR(m.depositadoEm) : ' · ainda não foi ao banco') : '';
    return esc(m.motivo || '') + dep + ' · ' + esc(m.criadoPor || '');
  }

  /* ---------- Início ---------- */
  function renderInicio() {
    if (!S.cfg) {
      if (!isAdmin()) { $('#main').innerHTML = '<div class="empty card"><div class="big">⏳</div><p>O administrador ainda não configurou o saldo inicial. Volte mais tarde.</p></div>'; return; }
      $('#main').innerHTML = `<section class="card">
        <h1>Configurar o saldo inicial</h1>
        <p class="muted small">A contagem física do dinheiro no dia em que você começa a usar o controle de caixa. Depois disso, tudo é lançamento (vendas em dinheiro do StarIA, sangria e ajuste).</p>
        <form id="fcfg" class="card" style="padding:0;border:0">
          <div class="field"><label for="cfSaldo">Quanto tem em dinheiro hoje (guardado na matriz)</label><input type="text" inputmode="decimal" id="cfSaldo" placeholder="0,00" value="0"></div>
          <div class="field"><label for="cfData">Data desta contagem</label><input type="date" id="cfData" value="${hoje()}" max="${hoje()}"></div>
          <button class="btn pri full" type="submit">Salvar e começar</button>
        </form></section>`;
      $('#fcfg').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/cfg', { saldoInicial: $('#cfSaldo').value, dataInicial: $('#cfData').value }, 'Saldo inicial salvo'); });
      return;
    }
    const cls = S.saldo > 0 ? 'p' : S.saldo < 0 ? 'n' : 'z';
    const lista = S.mov;
    const pf = Object.entries(S.porFilial || {}).sort((a, b) => a[0] - b[0]);
    $('#main').innerHTML = `
      <section class="saldo ${cls}"><span>Saldo esperado em dinheiro (consolidado)</span><b>${money(S.saldo)}</b>
        <span class="small">desde ${dBR(S.cfg.dataInicial)}${isAdmin() ? ' · <a href="#" id="verCfg" style="color:inherit;font-weight:700">editar saldo inicial</a>' : ''}</span></section>
      ${pf.length ? `<section class="card"><h2>Por filial (já entrou no consolidado acima)</h2>
        <table><thead><tr><th>Filial</th><th class="n">Vendas</th><th class="n">Crediário aprovado</th><th class="n">Total</th></tr></thead><tbody>
        ${pf.map(([f, v]) => `<tr><td>${esc(f)}</td><td class="n">${money(v.vendas)}</td><td class="n">${money(v.crediario)}</td><td class="n"><b>${money(r2(v.vendas + v.crediario))}</b></td></tr>`).join('')}
        </tbody></table></section>` : ''}
      <div class="row">
        ${!isFinanceiro() ? '<button class="btn sm pri" type="button" id="btnConferir">⚖️ Conferir caixa</button>' : ''}
        ${isAdmin() ? '<button class="btn sm" type="button" id="btnAjuste">✏️ Lançar ajuste</button>' : ''}
      </div>
      <section class="card">
        <h2>Lançamentos</h2>
        ${lista.length ? `<div class="list">${lista.map(m => { const naoConta = m.tipo === 'crediario_staria' && m.status !== 'aprovado'; return `<div class="it">
            <div class="ic">${movIcon(m)}</div>
            <div class="tx"><b>${esc(movTitulo(m))}</b><span>${movSub(m)}</span></div>
            <div class="vl"><span class="${m.tipo === 'sangria' || m.valor < 0 ? 'neg' : 'pos'}" style="${naoConta ? 'opacity:.55' + (m.status === 'rejeitado' ? ';text-decoration:line-through' : '') : ''}">${m.tipo === 'sangria' ? '−' : m.valor < 0 ? '−' : '+'}${money(Math.abs(m.valor))}</span>
              <br><small class="muted">${dBR(m.data)}</small>
              ${m.tipo === 'sangria' && !m.depositadoEm ? `<br><button class="btn sm" type="button" data-dep="${esc(m.id)}" style="margin-top:4px">Marcar depositado</button>` : ''}
              ${m.tipo === 'crediario_staria' && m.status === 'pendente' && podeDecidirCrediario() ? `<br><button class="btn sm pri" type="button" data-aprovar="${esc(m.id)}" style="margin-top:4px">Aprovar</button>
                <button class="btn sm dan" type="button" data-rejeitar="${esc(m.id)}" style="margin-top:4px">Rejeitar</button>` : ''}
              ${isAdmin() && (m.tipo === 'sangria' || m.tipo === 'ajuste') ? `<br><button class="btn sm dan" type="button" data-delmov="${esc(m.id)}" style="margin-top:4px">Apagar</button>` : ''}
            </div></div>`; }).join('')}</div>` : '<p class="muted">Nenhum lançamento ainda.</p>'}
      </section>`;
    const vc = $('#verCfg'); if (vc) vc.addEventListener('click', e => { e.preventDefault(); sheetCfg(); });
    const ba = $('#btnAjuste'); if (ba) ba.addEventListener('click', sheetAjuste);
    const bc = $('#btnConferir'); if (bc) bc.addEventListener('click', sheetConferir);
    document.querySelectorAll('[data-dep]').forEach(b => b.addEventListener('click', () => post('/api/caixa/depositado', { id: b.dataset.dep, depositadoEm: hoje() }, 'Marcado como depositado')));
    document.querySelectorAll('[data-delmov]').forEach(b => b.addEventListener('click', () => { if (confirm('Apagar este lançamento?')) post('/api/caixa/mov/excluir', { id: b.dataset.delmov }, 'Lançamento apagado'); }));
    document.querySelectorAll('[data-aprovar]').forEach(b => b.addEventListener('click', () => post('/api/caixa/crediario/decidir', { id: b.dataset.aprovar, acao: 'aprovar' }, 'Crediário aprovado: entrou no saldo')));
    document.querySelectorAll('[data-rejeitar]').forEach(b => b.addEventListener('click', () => { if (confirm('Rejeitar este recebimento de crediário? Ele não vai entrar no saldo.')) post('/api/caixa/crediario/decidir', { id: b.dataset.rejeitar, acao: 'rejeitar' }, 'Crediário rejeitado'); }));
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
    openSheet(`<div class="tt"><h2>Conferir caixa</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">Conte o dinheiro físico e digite quanto deu. O sistema compara com o saldo esperado agora (${money(S.saldo)}) e, se for diferente, fica registrado para o administrador.</p>
      <form id="fcf">
        <div class="field"><label for="cfValor">Quanto você contou</label><input type="text" inputmode="decimal" id="cfValor" placeholder="0,00" required></div>
        <div class="field"><label for="cfObs">Observação (opcional)</label><textarea id="cfObs" placeholder="Ex.: nota rasgada, troco emprestado…"></textarea></div>
        <button class="btn pri full" type="submit">Conferir</button>
      </form><div id="cfOut"></div>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fcf').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const r = await api('/api/caixa/conferir', { valorContado: $('#cfValor').value, motivo: $('#cfObs').value });
          await reload();
          const dif = Number(r.diferenca);
          $('#fcf').hidden = true;
          $('#cfOut').innerHTML = dif === 0
            ? `<div class="note" style="background:var(--green-bg);color:var(--green)"><b>Bateu certinho!</b> O caixa confere com o esperado.</div>`
            : `<div class="warn"><b>${dif > 0 ? 'Sobrou' : 'Faltou'} ${money(Math.abs(dif))}.</b> Ficou registrado na aba Ocorrências para o administrador.</div>`;
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

  /* ---------- Sangria ---------- */
  function renderSangria() {
    if (isFinanceiro()) { view = 'inicio'; return render(); }
    $('#main').innerHTML = `<section class="card">
      <h1>Nova sangria</h1>
      <p class="muted small">Dinheiro que saiu do caixa principal. Pode ficar guardado alguns dias até o depósito; marque "depositado" quando chegar lá.</p>
      <form id="fsg">
        <div class="field"><label for="sgValor">Valor</label><input type="text" inputmode="decimal" id="sgValor" placeholder="0,00" required></div>
        <div class="field"><label for="sgData">Data</label><input type="date" id="sgData" value="${hoje()}" max="${hoje()}"></div>
        <div class="field"><label for="sgMotivo">Motivo / observação</label><textarea id="sgMotivo" placeholder="Ex.: para depósito no Banco do Brasil" required></textarea></div>
        ${isAdmin() ? `<div class="field"><label for="sgDestino">Destino</label>
          <select id="sgDestino"><option value="">Retirada normal (vai para mim)</option><option value="impostos">Gaveta de impostos e financiamentos</option></select></div>` : ''}
        <button class="btn pri full" type="submit">Lançar sangria</button>
      </form></section>`;
    $('#fsg').addEventListener('submit', async e => {
      e.preventDefault();
      const destino = isAdmin() ? $('#sgDestino').value : '';
      const r = await post('/api/caixa/sangria', { valor: $('#sgValor').value, data: $('#sgData').value, motivo: $('#sgMotivo').value, destino: destino || undefined }, destino === 'impostos' ? 'Sangria lançada na gaveta de impostos' : 'Sangria lançada');
      if (r) { view = 'inicio'; render(); }
    });
  }

  /* ---------- Gaveta de impostos e financiamentos (admin) ---------- */
  function renderGaveta() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const cls = S.saldoImpostos > 0 ? 'p' : S.saldoImpostos < 0 ? 'n' : 'z';
    const lista = S.movImpostos || [];
    $('#main').innerHTML = `<section class="saldo ${cls}"><span>Gaveta de impostos e financiamentos</span><b>${money(S.saldoImpostos)}</b>
        <span class="small">separado do caixa principal</span></section>
      <div class="row"><button class="btn sm pri" type="button" id="btnGavetaSaida">➖ Lançar pagamento (saída)</button></div>
      <section class="card"><h2>Lançamentos da gaveta</h2>
        ${lista.length ? `<div class="list">${lista.map(m => `<div class="it">
            <div class="ic">${movIcon(m)}</div>
            <div class="tx"><b>${esc(movTitulo(m))}</b><span>${esc(m.motivo || '')} · ${esc(m.criadoPor || '')}</span></div>
            <div class="vl"><span class="${m.tipo === 'gaveta_saida' ? 'neg' : 'pos'}">${m.tipo === 'gaveta_saida' ? '−' : '+'}${money(m.valor)}</span>
              <br><small class="muted">${dBR(m.data)}</small>
              <br><button class="btn sm dan" type="button" data-delmov="${esc(m.id)}" style="margin-top:4px">Apagar</button>
            </div></div>`).join('')}</div>` : '<p class="muted">Nenhum lançamento ainda. Lance uma sangria com destino "Gaveta de impostos" na tela de Sangria para alimentar aqui.</p>'}
      </section>`;
    $('#btnGavetaSaida').addEventListener('click', sheetGavetaSaida);
    document.querySelectorAll('[data-delmov]').forEach(b => b.addEventListener('click', () => { if (confirm('Apagar este lançamento da gaveta?')) post('/api/caixa/mov/excluir', { id: b.dataset.delmov }, 'Lançamento apagado'); }));
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

  /* ---------- StarIA (admin) ---------- */
  function jobBadge(j) {
    if (j.status === 'pendente') return '<span class="pill wa">Aguardando o Claude</span>';
    if (j.status === 'pronta') return '<span class="pill wa">Pronto · revise e aplique</span>';
    return '<span class="pill ok">Aplicado ao caixa</span>';
  }
  function renderStaria() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const jobs = S.jobs;
    $('#main').innerHTML = `<section class="card">
      <h1>Puxar do StarIA</h1>
      <p class="muted small">Pede o total de vendas em dinheiro e recebimento de crediário em dinheiro de todas as filiais, no período. Quem consulta e devolve o resultado é o Claude, pelo seu pedido no chat — depois disso, revise o número aqui antes de aplicar.</p>
      <div class="note">Peça só para um período em que as sacolas das lojas já chegaram e já foram conferidas na matriz. O StarIA não sabe se a sacola chegou ou se o caixa foi batido — ele só sabe o que foi vendido; quem garante que o dinheiro já está (ou já devia estar) aqui é a conferência física, antes de pedir.</div>
      <form id="fst">
        <div class="field"><label for="stIni">De</label><input type="date" id="stIni" max="${hoje()}" required></div>
        <div class="field"><label for="stFim">Até</label><input type="date" id="stFim" value="${hoje()}" max="${hoje()}" required></div>
        <button class="btn pri full" type="submit">Pedir consulta</button>
      </form></section>
      <section class="card">
        <h2>Consultas</h2>
        ${jobs.length ? jobs.map(j => `<div class="it" style="align-items:flex-start">
            <div class="ic">🔄</div>
            <div class="tx"><b>${dBR(j.periodoIni)} a ${dBR(j.periodoFim)}</b><span>${jobBadge(j)}</span>
              ${j.status !== 'pendente' ? `<div class="small" style="margin-top:6px">${Object.entries(j.resultado.porFilial).map(([f, v]) => `Filial ${esc(f)}: ${money(v.vendasDinheiro)} vendas + ${money(v.recebCrediarioDinheiro)} crediário`).join('<br>')}
                <br><b>Total: ${money(j.resultado.total)}</b></div>` : ''}
            </div>
            <div class="vl">${j.status === 'pronta' ? `<button class="btn sm pri" type="button" data-aplicar="${esc(j.id)}">Aplicar ao caixa</button>` : ''}</div>
          </div>`).join('') : '<p class="muted">Nenhuma consulta ainda.</p>'}
      </section>`;
    $('#fst').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/staria/pedir', { periodoIni: $('#stIni').value, periodoFim: $('#stFim').value }, 'Consulta pedida. Peça ao Claude para processar as consultas do StarIA.'); });
    document.querySelectorAll('[data-aplicar]').forEach(b => b.addEventListener('click', () => { if (confirm('Aplicar este resultado ao caixa? As vendas em dinheiro entram direto no saldo; o recebimento de crediário entra como pendente, aguardando aprovação. Depois de aplicado não pode ser desfeito (lance um ajuste se precisar corrigir).')) post('/api/caixa/staria/aplicar', { id: b.dataset.aplicar }, 'Aplicado: vendas no saldo, crediário aguardando aprovação'); }));
  }

  /* ---------- Acessos (admin): quem guarda o caixa (caixista) e quem aprova o crediário (financeiro) ---------- */
  const papelLabel = p => p === 'financeiro' ? 'Financeiro · aprova o crediário' : 'Caixista · guarda o dinheiro';
  function renderAcessos() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    $('#main').innerHTML = `<section class="card">
      <h1>Acessos</h1>
      <p class="muted small">Quem pode entrar neste controle de caixa. Nenhum dos dois vê custo ou margem (não existe nada disso aqui), e nenhum dos dois apaga ou cancela nada — isso é só pelo seu usuário.</p>
      ${S.pessoas.length ? `<div class="list">${S.pessoas.map(p => `<div class="it">
          <div class="ic">${p.papel === 'financeiro' ? '✅' : '👤'}</div><div class="tx"><b>${esc(p.nome)}</b><span>${esc(p.login)} · ${papelLabel(p.papel)}${p.ativo ? '' : ' · inativo'}${p.trocarSenha ? ' · ainda não trocou a senha provisória' : ''}</span></div>
          <div class="vl"><button class="btn sm" type="button" data-editp="${esc(p.login)}">Editar</button></div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhum acesso criado ainda.</p>'}
      <div class="row"><button class="btn pri" type="button" id="btnNovaCaixista">+ Nova pessoa do caixa</button><button class="btn pri" type="button" id="btnNovoFinanceiro">+ Novo aprovador (financeiro)</button></div>
    </section>
    <div id="pOut"></div>`;
    $('#btnNovaCaixista').addEventListener('click', () => sheetPessoa(null, 'caixista'));
    $('#btnNovoFinanceiro').addEventListener('click', () => sheetPessoa(null, 'financeiro'));
    document.querySelectorAll('[data-editp]').forEach(b => b.addEventListener('click', () => sheetPessoa(S.pessoas.find(p => p.login === b.dataset.editp))));
  }
  function sheetPessoa(p, papelNovo) {
    const papel = p ? p.papel : papelNovo;
    openSheet(`<div class="tt"><h2>${p ? 'Editar acesso' : (papel === 'financeiro' ? 'Novo aprovador (financeiro)' : 'Nova pessoa do caixa')}</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">${papel === 'financeiro' ? 'Só aprova ou rejeita o recebimento de crediário do StarIA; não lança sangria nem vê os acessos.' : 'Lança sangria, vê o saldo e marca quando um valor foi ao banco.'}</p>
      <form id="fp">
        <div class="field"><label for="pLogin">Usuário</label><input type="text" id="pLogin" value="${esc((p || {}).login || '')}" autocapitalize="off" spellcheck="false" ${p ? 'readonly' : ''} required></div>
        <div class="field"><label for="pNome">Nome</label><input type="text" id="pNome" value="${esc((p || {}).nome || '')}" required></div>
        ${p ? `<label class="row"><input type="checkbox" id="pAtivo" ${p.ativo ? 'checked' : ''}> Acesso ativo</label>
          <label class="row"><input type="checkbox" id="pNova"> Gerar nova senha provisória</label>` : ''}
        <button class="btn pri full" type="submit">${p ? 'Salvar' : 'Criar acesso'}</button>
      </form><div id="pOutS"></div>`, () => {
      $('#shxb').addEventListener('click', closeSheet);
      $('#fp').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const r = await api('/api/caixa/pessoa', { login: $('#pLogin').value.trim().toLowerCase(), nome: $('#pNome').value, papel, ativo: p ? $('#pAtivo').checked : true, novaSenha: p ? $('#pNova').checked : true });
          await reload();
          if (r.password) $('#pOutS').innerHTML = `<div class="note" style="display:grid;gap:6px"><b>Anote agora: esta senha aparece só uma vez.</b>
            <span>Usuário: <code>${esc(r.login)}</code></span><span>Senha provisória: <code style="font-size:17px">${esc(r.password)}</code></span>
            <span class="small">No primeiro acesso, a pessoa cria a senha dela.</span></div>`;
          else { toast('Salvo'); closeSheet(); render(); }
        } catch (er) { fail(er); } finally { b.disabled = false; }
      });
    });
  }

  /* ---------- Ocorrências (admin): conferências com diferença + tudo que foi apagado, alterado ou decidido,
     inclusive pelo próprio admin — para dar transparência e segurança a quem trabalha com o dinheiro. Só leitura. */
  function ocorIcon(o) { return o.tipo === 'conferencia' ? '⚖️' : '🛡️'; }
  function ocorDetalheTxt(o) {
    const d = o.detalhe || {};
    if (o.tipo === 'conferencia') {
      const sinal = d.diferenca > 0 ? 'Sobrou ' : 'Faltou ';
      return sinal + money(Math.abs(d.diferenca)) + ' (contado ' + money(d.valorContado) + ', esperado ' + money(d.saldoEsperado) + ')' + (d.motivo ? ' · ' + esc(d.motivo) : '') + ' · ' + esc(d.por || '');
    }
    if (o.titulo === 'Ajuste lançado') return (d.valor != null ? money(Number(d.valor)) : '') + ' · ' + esc(d.role || '');
    if (o.titulo === 'Saldo inicial alterado') return 'Novo saldo inicial: ' + money(Number(d.saldoInicial) || 0) + ' · ' + esc(d.role || '');
    if (o.titulo === 'Crediário aprovado/rejeitado') return (d.acao === 'aprovar' ? 'Aprovado' : 'Rejeitado') + ' por ' + esc(d.role || '');
    if (o.titulo === 'Acesso criado ou alterado') return esc(d.login || '') + (d.papel ? ' · ' + esc(d.papel) : '') + ' · por ' + esc(d.role || '');
    if (o.titulo === 'Lançamento apagado') return 'por ' + esc(d.role || '');
    return esc(d.role || '');
  }
  function renderOcorrencias() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const lista = S.ocorrencias || [];
    $('#main').innerHTML = `<section class="card">
      <h1>Ocorrências</h1>
      <p class="muted small">Conferências do caixa que não bateram, e tudo que foi apagado, alterado ou aprovado/rejeitado neste controle de caixa — inclusive por você. Só leitura.</p>
      ${lista.length ? `<div class="list">${lista.map(o => `<div class="it">
          <div class="ic">${ocorIcon(o)}</div>
          <div class="tx"><b>${esc(o.titulo)}</b><span>${ocorDetalheTxt(o)}</span></div>
          <div class="vl"><small class="muted">${dBR(o.em)} ${new Date(o.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhuma ocorrência registrada.</p>'}
      </section>`;
  }

  /* ---------- navegação ---------- */
  function render() {
    $('#bn').hidden = false; $('#sair').hidden = false;
    $('#navSangria').hidden = isFinanceiro(); $('#navStaria').hidden = !isAdmin(); $('#navAcessos').hidden = !isAdmin(); $('#navGaveta').hidden = !isAdmin(); $('#navOcorrencias').hidden = !isAdmin();
    document.querySelectorAll('#bn [data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === view));
    if (view === 'sangria') return renderSangria();
    if (view === 'staria') return renderStaria();
    if (view === 'acessos') return renderAcessos();
    if (view === 'gaveta') return renderGaveta();
    if (view === 'ocorrencias') return renderOcorrencias();
    return renderInicio();
  }
  document.querySelectorAll('#bn [data-go]').forEach(b => b.addEventListener('click', () => { view = b.dataset.go; closeSheet(); render(); window.scrollTo(0, 0); }));

  async function start() {
    try { await reload(); render(); }
    catch (e) { fail(e); }
  }
  start();
})();

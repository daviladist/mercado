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
  function movFilial(m) { const fs = Object.keys((m.detalhe || {}).porFilial || {}); return fs.length === 1 ? ' · Filial ' + esc(fs[0]) : ''; }
  function movTitulo(m) {
    if (m.tipo === 'venda_staria') return 'Vendas em dinheiro' + movFilial(m);
    if (m.tipo === 'crediario_staria') return 'Crediário recebido em dinheiro' + movFilial(m);
    if (m.tipo === 'sangria') return m.destino === 'impostos' ? 'Sangria · gaveta de impostos' : 'Sangria';
    if (m.tipo === 'gaveta_entrada') return 'Entrada na gaveta (sangria)';
    if (m.tipo === 'gaveta_saida') return 'Pago com a gaveta';
    return 'Ajuste';
  }
  function movSub(m) {
    if (m.tipo === 'venda_staria' || m.tipo === 'crediario_staria') return 'Sacola conferida · ' + dBR(m.periodoIni) + ' a ' + dBR(m.periodoFim);
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
        <table><thead><tr><th>Filial</th><th class="n">Vendas</th><th class="n">Crediário em dinheiro</th><th class="n">Total</th></tr></thead><tbody>
        ${pf.map(([f, v]) => `<tr><td>${esc(f)}</td><td class="n">${money(v.vendas)}</td><td class="n">${money(v.crediario)}</td><td class="n"><b>${money(r2(v.vendas + v.crediario))}</b></td></tr>`).join('')}
        </tbody></table></section>` : ''}
      <div class="row">
        <button class="btn sm pri" type="button" id="btnConferir">⚖️ Conferir caixa</button>
        ${isAdmin() ? '<button class="btn sm" type="button" id="btnAjuste">✏️ Lançar ajuste</button>' : ''}
      </div>
      <section class="card">
        <h2>Lançamentos</h2>
        ${lista.length ? `<div class="list">${lista.map(m => `<div class="it">
            <div class="ic">${movIcon(m)}</div>
            <div class="tx"><b>${esc(movTitulo(m))}</b><span>${movSub(m)}</span></div>
            <div class="vl"><span class="${m.tipo === 'sangria' || m.valor < 0 ? 'neg' : 'pos'}">${m.tipo === 'sangria' ? '−' : m.valor < 0 ? '−' : '+'}${money(Math.abs(m.valor))}</span>
              <br><small class="muted">${dBR(m.data)}</small>
              ${m.tipo === 'sangria' && !m.depositadoEm ? `<br><button class="btn sm" type="button" data-dep="${esc(m.id)}" style="margin-top:4px">Marcar depositado</button>` : ''}
              ${isAdmin() && (m.tipo === 'sangria' || m.tipo === 'ajuste') ? `<br><button class="btn sm dan" type="button" data-delmov="${esc(m.id)}" style="margin-top:4px">Apagar</button>` : ''}
            </div></div>`).join('')}</div>` : '<p class="muted">Nenhum lançamento ainda.</p>'}
      </section>`;
    const vc = $('#verCfg'); if (vc) vc.addEventListener('click', e => { e.preventDefault(); sheetCfg(); });
    const ba = $('#btnAjuste'); if (ba) ba.addEventListener('click', sheetAjuste);
    const bc = $('#btnConferir'); if (bc) bc.addEventListener('click', sheetConferir);
    document.querySelectorAll('[data-dep]').forEach(b => b.addEventListener('click', () => post('/api/caixa/depositado', { id: b.dataset.dep, depositadoEm: hoje() }, 'Marcado como depositado')));
    document.querySelectorAll('[data-delmov]').forEach(b => b.addEventListener('click', () => { if (confirm('Apagar este lançamento?')) post('/api/caixa/mov/excluir', { id: b.dataset.delmov }, 'Lançamento apagado'); }));
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
    return '<span class="pill ok">Trazido · veja em Sacolas</span>';
  }
  function renderStaria() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    const jobs = S.jobs;
    $('#main').innerHTML = `<section class="card">
      <h1>Puxar do StarIA</h1>
      <p class="muted small">Pede o total de vendas em dinheiro e de crediário recebido (em qualquer forma de pagamento) de todas as filiais, no período. Quem consulta e devolve o resultado é o Claude (pelo seu pedido no chat, ou pela importação automática da noite) — cada filial vira uma sacola em "Sacolas", esperando chegar na matriz e ser conferida.</p>
      <div class="note">O StarIA só sabe o que foi vendido e recebido — não sabe se o dinheiro já chegou na matriz, nem quanto do crediário foi em dinheiro, cartão ou Pix. É por isso que existe a sacola: o valor daqui é só uma expectativa; o saldo só sobe depois da conferência física na matriz, com o valor realmente contado e a forma de pagamento decidida pelo financeiro.</div>
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
              ${j.status !== 'pendente' ? `<div class="small" style="margin-top:6px">${Object.entries(j.resultado.porFilial).map(([f, v]) => `Filial ${esc(f)}: ${money(v.vendasDinheiro)} vendas + ${money(v.recebCrediario)} crediário`).join('<br>')}
                <br><b>Total: ${money(j.resultado.total)}</b></div>` : ''}
            </div>
          </div>`).join('') : '<p class="muted">Nenhuma consulta ainda.</p>'}
      </section>`;
    $('#fst').addEventListener('submit', e => { e.preventDefault(); post('/api/caixa/staria/pedir', { periodoIni: $('#stIni').value, periodoFim: $('#stFim').value }, 'Consulta pedida. Peça ao Claude para processar as consultas do StarIA.'); });
  }

  /* ---------- Sacolas (venda em dinheiro + crediário recebido, por filial): na filial -> chegou na matriz ->
     conferida ---------- caixista e financeiro marcam a chegada; só financeiro (ou admin) confere o valor real de
     vendas, decide a forma de pagamento do crediário e lança no saldo. A filial 1 (matriz) nunca "viaja": já
     aparece pronta pra conferência, sem o passo de marcar chegada. */
  function podeConferirSacola() { return isAdmin() || S.me.role === 'financeiro'; }
  function sacolaStatus(s) {
    if (s.conferidoEm) {
      const okVenda = s.diferenca === 0, okCredi = !s.crediStaria || s.crediDiferenca === 0;
      if (okVenda && okCredi) return '<span class="pill ok">Conferida · bateu certinho</span>';
      const partes = [];
      if (!okVenda) partes.push((s.diferenca > 0 ? 'vendas: sobrou ' : 'vendas: faltou ') + money(Math.abs(s.diferenca)));
      if (!okCredi) partes.push((s.crediDiferenca > 0 ? 'crediário: sobrou ' : 'crediário: faltou ') + money(Math.abs(s.crediDiferenca)));
      return '<span class="pill wa">Conferida · ' + partes.join(' · ') + '</span>';
    }
    if (s.chegouEm) return '<span class="pill wa">' + (s.precisaChegar ? 'Chegou na matriz · aguardando conferência' : 'Pronta pra conferência') + '</span>';
    return '<span class="pill wa">Ainda na filial</span>';
  }
  function renderSacolas() {
    const mc = S.miniCaixas || {};
    const filiais = Object.keys(mc).sort((a, b) => a - b);
    const pendentes = (S.sacolas || []).filter(s => !s.conferidoEm);
    const conferidas = (S.sacolas || []).filter(s => s.conferidoEm);
    $('#main').innerHTML = `<section class="card">
      <h1>Sacolas</h1>
      <p class="muted small">Cada filial manda uma sacola de dinheiro (vendas + crediário recebido) pra matriz. O StarIA diz quanto vendeu e recebeu; só depois que a sacola chega e é conferida de verdade é que esse dinheiro entra no saldo do caixa principal — com o valor realmente contado. A matriz (filial 1) não precisa chegar: já nasce pronta pra conferência.</p>
      ${filiais.length ? `<div class="list">${filiais.map(f => `<div class="it">
          <div class="ic">🏪</div><div class="tx"><b>Filial ${esc(f)}</b><span>${mc[f].naFilial ? 'Ainda na filial: ' + money(mc[f].naFilial) : ''}${mc[f].naFilial && mc[f].aguardandoConferencia ? ' · ' : ''}${mc[f].aguardandoConferencia ? 'Aguardando conferência: ' + money(mc[f].aguardandoConferencia) : ''}</span></div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhum valor pendente agora.</p>'}
    </section>
    <section class="card">
      <h2>Pendentes</h2>
      ${pendentes.length ? `<div class="list">${pendentes.map(s => `<div class="it" style="align-items:flex-start">
          <div class="ic">📦</div>
          <div class="tx"><b>Filial ${esc(s.filial)} · ${money(s.valorStaria)}${s.crediStaria ? ' + ' + money(s.crediStaria) + ' crediário' : ''}</b><span>${dBR(s.periodoIni)} a ${dBR(s.periodoFim)} · ${sacolaStatus(s)}</span></div>
          <div class="vl">${!s.chegouEm ? `<button class="btn sm pri" type="button" data-chegou="${esc(s.id)}">Chegou na matriz</button>`
            : podeConferirSacola() ? `<button class="btn sm pri" type="button" data-conferir="${esc(s.id)}">Conferir</button>` : ''}</div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhuma sacola pendente.</p>'}
    </section>
    ${conferidas.length ? `<section class="card"><h2>Conferidas</h2><div class="list">${conferidas.slice(0, 20).map(s => `<div class="it">
        <div class="ic">📦</div><div class="tx"><b>Filial ${esc(s.filial)} · ${money(s.valorContado)}${s.crediDinheiro ? ' + ' + money(s.crediDinheiro) + ' crediário' : ''}</b><span>${dBR(s.periodoIni)} a ${dBR(s.periodoFim)} · ${sacolaStatus(s)}</span></div>
      </div>`).join('')}</div></section>` : ''}
    <div id="pOut"></div>`;
    document.querySelectorAll('[data-chegou]').forEach(b => b.addEventListener('click', () => post('/api/caixa/sacola/chegou', { id: b.dataset.chegou }, 'Marcado: chegou na matriz')));
    document.querySelectorAll('[data-conferir]').forEach(b => b.addEventListener('click', () => sheetConferirSacola(S.sacolas.find(s => s.id === b.dataset.conferir))));
  }
  function sheetConferirSacola(s) {
    openSheet(`<div class="tt"><h2>Conferir sacola · Filial ${esc(s.filial)}</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">O StarIA apontou ${money(s.valorStaria)} em vendas dessa filial. Digite o que realmente veio dentro da sacola — é esse valor que entra no saldo do caixa principal.</p>
      <form id="fcs">
        <div class="field"><label for="csValor">Valor de vendas contado</label><input type="text" id="csValor" inputmode="decimal" placeholder="0,00" required></div>
        ${s.crediStaria ? `<div class="note">O StarIA apontou ${money(s.crediStaria)} de crediário recebido nessa filial e período. Diga quanto disso foi em cada forma de pagamento — só o dinheiro entra no saldo.</div>
        <div class="field"><label for="csCrediDinheiro">Crediário em dinheiro</label><input type="text" id="csCrediDinheiro" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label for="csCrediCartao">Crediário em cartão</label><input type="text" id="csCrediCartao" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label for="csCrediPix">Crediário em Pix</label><input type="text" id="csCrediPix" inputmode="decimal" placeholder="0,00"></div>` : ''}
        <div class="field"><label for="csMotivo">Observação (se sobrou ou faltou)</label><input type="text" id="csMotivo" maxlength="300"></div>
        <button class="btn pri full" type="submit">Confirmar conferência</button>
      </form><div id="csOut"></div>`, () => {
      $('#shxb').addEventListener('click', () => { closeSheet(); render(); });
      $('#fcs').addEventListener('submit', async e => {
        e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
        try {
          const cd = $('#csCrediDinheiro'), cc = $('#csCrediCartao'), cp = $('#csCrediPix');
          const r = await api('/api/caixa/sacola/conferir', {
            id: s.id, valorContado: $('#csValor').value, motivo: $('#csMotivo').value,
            crediDinheiro: cd ? cd.value : undefined, crediCartao: cc ? cc.value : undefined, crediPix: cp ? cp.value : undefined
          });
          await reload();
          $('#fcs').hidden = true;
          const okVenda = r.diferenca === 0, okCredi = !s.crediStaria || r.crediDiferenca === 0;
          $('#csOut').innerHTML = okVenda && okCredi
            ? `<div class="note" style="background:var(--green-bg);color:var(--green)"><b>Bateu certinho!</b> O valor contado confere com o que o StarIA apontou.</div>`
            : `<div class="warn">${!okVenda ? `<b>Vendas: ${r.diferenca > 0 ? 'sobrou' : 'faltou'} ${money(Math.abs(r.diferenca))}.</b><br>` : ''}${!okCredi ? `<b>Crediário: ${r.crediDiferenca > 0 ? 'sobrou' : 'faltou'} ${money(Math.abs(r.crediDiferenca))}.</b><br>` : ''}Ficou registrado na aba Ocorrências para o administrador.</div>`;
        } catch (er) { fail(er); } finally { b.disabled = false; }
      });
    });
  }

  /* ---------- Acessos (admin): quem guarda o caixa (caixista), quem guarda o caixa e também confere as sacolas
     (financeiro — não é obrigatório ter as duas pessoas, uma só como financeiro cobre o dia a dia) e o acesso de
     automação (só o Claude, importação noturna do StarIA) ---------- */
  const papelLabel = p => p === 'financeiro' ? 'Financeiro · guarda o caixa e confere as sacolas' : p === 'automacao' ? 'Automação · só StarIA' : 'Caixista · guarda o dinheiro';
  function renderAcessos() {
    if (!isAdmin()) { view = 'inicio'; return render(); }
    $('#main').innerHTML = `<section class="card">
      <h1>Acessos</h1>
      <p class="muted small">Quem pode entrar neste controle de caixa. Ninguém vê custo ou margem (não existe nada disso aqui), e ninguém apaga ou cancela nada — isso é só pelo seu usuário.</p>
      ${S.pessoas.length ? `<div class="list">${S.pessoas.map(p => `<div class="it">
          <div class="ic">${p.papel === 'financeiro' ? '✅' : p.papel === 'automacao' ? '🤖' : '👤'}</div><div class="tx"><b>${esc(p.nome)}</b><span>${esc(p.login)} · ${papelLabel(p.papel)}${p.ativo ? '' : ' · inativo'}${p.trocarSenha ? ' · ainda não trocou a senha provisória' : ''}</span></div>
          <div class="vl"><button class="btn sm" type="button" data-editp="${esc(p.login)}">Editar</button></div>
        </div>`).join('')}</div>` : '<p class="muted">Nenhum acesso criado ainda.</p>'}
      <div class="row"><button class="btn pri" type="button" id="btnNovaCaixista">+ Nova pessoa do caixa</button><button class="btn pri" type="button" id="btnNovoFinanceiro">+ Novo acesso do financeiro</button></div>
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
    document.querySelectorAll('[data-editp]').forEach(b => b.addEventListener('click', () => sheetPessoa(S.pessoas.find(p => p.login === b.dataset.editp))));
  }
  function sheetPessoa(p, papelNovo) {
    const papel = p ? p.papel : papelNovo;
    const auto = papel === 'automacao';
    const titulo = p ? 'Editar acesso' : auto ? 'Novo acesso de automação' : (papel === 'financeiro' ? 'Novo acesso do financeiro' : 'Nova pessoa do caixa');
    const sub = auto ? 'Só para o Claude usar na importação noturna do StarIA: pede e entrega a consulta, deixando pronta pra você revisar. Não vê saldo, extrato, pessoas nem ocorrências — mesmo assim, é uma senha guardada fora do app, então escolha uma forte e não reaproveite de outro lugar.'
      : papel === 'financeiro' ? 'Faz tudo que a pessoa do caixa faz (lança sangria, marca quando um valor foi ao banco, confere o caixa físico) e também confere as sacolas das filiais: o valor real de vendas e a forma de pagamento do crediário recebido. Não é obrigatório ter as duas pessoas — pode ser só esta. Não vê os acessos nem a gaveta de impostos.' : 'Lança sangria, vê o saldo, marca quando um valor foi ao banco, confere o caixa físico e também pode marcar a chegada de uma sacola na matriz.';
    openSheet(`<div class="tt"><h2>${titulo}</h2><button class="x" type="button" id="shxb">✕</button></div>
      <p class="muted small">${sub}</p>
      <form id="fp">
        <div class="field"><label for="pLogin">Usuário</label><input type="text" id="pLogin" value="${esc((p || {}).login || '')}" autocapitalize="off" spellcheck="false" ${p ? 'readonly' : ''} required></div>
        <div class="field"><label for="pNome">Nome</label><input type="text" id="pNome" value="${esc((p || {}).nome || '')}" ${auto ? '' : 'required'} placeholder="${auto ? 'Automação (StarIA)' : ''}"></div>
        ${auto ? `<div class="field"><label for="pSenha">${p ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha'}</label>
            <input type="text" id="pSenha" autocapitalize="off" spellcheck="false" minlength="12" ${p ? '' : 'required'}></div>
          <p class="small muted">Pelo menos 12 caracteres, com letras e números.</p>` : ''}
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
      if (d.diferenca) partes.push('vendas: ' + (d.diferenca > 0 ? 'sobrou ' : 'faltou ') + money(Math.abs(d.diferenca)) + ' (contado ' + money(d.valorContado) + ', StarIA apontava ' + money(d.valorStaria) + ')');
      if (d.crediDiferenca) partes.push('crediário: ' + (d.crediDiferenca > 0 ? 'sobrou ' : 'faltou ') + money(Math.abs(d.crediDiferenca)) + ' (dinheiro+cartão+Pix somou ' + money(r2((d.crediDinheiro || 0) + (d.crediCartao || 0) + (d.crediPix || 0))) + ', StarIA apontava ' + money(d.crediStaria) + ')');
      return 'Filial ' + esc(d.filial) + ': ' + partes.join(' · ') + (d.motivo ? ' · ' + esc(d.motivo) : '') + ' · ' + esc(d.por || '');
    }
    if (o.titulo === 'Ajuste lançado') return (d.valor != null ? money(Number(d.valor)) : '') + ' · ' + esc(d.role || '');
    if (o.titulo === 'Saldo inicial alterado') return 'Novo saldo inicial: ' + money(Number(d.saldoInicial) || 0) + ' · ' + esc(d.role || '');
    if (o.titulo === 'Acesso criado ou alterado') return esc(d.login || '') + (d.papel ? ' · ' + esc(d.papel) : '') + ' · por ' + esc(d.role || '');
    if (o.titulo === 'Lançamento apagado') return 'por ' + esc(d.role || '');
    if (o.titulo === 'Consulta ao StarIA pedida') return 'Período: ' + (d.periodo || []).map(dBR).join(' a ') + ' · por ' + esc(d.role || '');
    if (o.titulo === 'Consulta ao StarIA aplicada, em sacolas por filial') return 'Já criou as sacolas por filial · por ' + esc(d.role || '');
    if (o.titulo === 'Dados do caixa zerados (recomeço do zero)') return 'Apagados: ' + (Number(d.lancamentos) || 0) + ' lançamentos, ' + (Number(d.consultas) || 0) + ' consultas, ' + (Number(d.sacolas) || 0) + ' sacolas, ' + (Number(d.conferencias) || 0) + ' conferências · por ' + esc(d.role || '');
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
    $('#navStaria').hidden = !isAdmin(); $('#navAcessos').hidden = !isAdmin(); $('#navGaveta').hidden = !isAdmin(); $('#navOcorrencias').hidden = !isAdmin();
    document.querySelectorAll('#bn [data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === view));
    if (view === 'sangria') return renderSangria();
    if (view === 'sacolas') return renderSacolas();
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

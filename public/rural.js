'use strict';
/* Tino — app do produtor rural. Só a tela: tudo o que grava é conferido no servidor (lib/rural.js). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const pctTxt = v => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('pt-BR') + '%';
  /* número do jeito brasileiro: "1.500" = mil e quinhentos, "1.500,50", "25,5"; "1.5" (sem milhar) continua 1,5 */
  const toNum = v => {
    let s = String(v == null ? '' : v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!s) return null;
    if (!/^-?[\d.,]+$/.test(s)) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return isFinite(n) ? n : NaN;
  };
  const numIn = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const hex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const newId = k => k + hex(k === 'l' ? 8 : 6);
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dBR = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  /* forma de pagamento de uma venda, em texto curto: "Pix", "Cheque p/ 15/12/2026" */
  const pagDe = id => (S.pagamentos || []).find(p => p.id === id);
  const pagsDe = l => Array.isArray(l.pagamentos) && l.pagamentos.length ? l.pagamentos : l.pagamento ? [{ forma: l.pagamento, valor: l.valor, vence: l.vence, cheque: l.cheque || {} }] : [];
  const pagTxt = l => {
    const ps = pagsDe(l).filter(x => pagDe(x.forma)); if (!ps.length) return '';
    if (ps.length === 1) { const x = ps[0]; return pagDe(x.forma).nome + (x.vence && (x.forma === 'cheque' || x.forma === 'prazo') ? ' p/ ' + dBR(x.vence) : ''); }
    const n = {}; ps.forEach(x => { n[x.forma] = (n[x.forma] || 0) + 1; });
    return Object.keys(n).map(k => n[k] > 1 ? (k === 'cheque' ? n[k] + ' cheques' : pagDe(k).nome + ' (' + n[k] + 'x)') : pagDe(k).nome).join(' + ');
  };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }

  let retomar = null;
  let S = null, view = 'inicio', arg = null, per = 'ano', rocaTab = 'resumo', pesTab = 'meeiro', relRoca = '';

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
  async function reload() { S = await api('/api/rural/state'); applyBrand(); }
  async function post(path, body, okMsg) {
    try { const r = await api(path, body); await reload(); if (okMsg) toast(okMsg); return r; }
    catch (e) { fail(e); return null; }
  }

  /* ---------- marca ---------- */
  function applyBrand() {
    const nome = (S && S.empresa.nome) || brand.name || 'Tino';
    $('#coName').textContent = nome;
    const cor = (S && S.empresa.cor) || brand.color;
    if (cor && /^#[0-9a-f]{6}$/i.test(cor)) document.documentElement.style.setProperty('--brand', cor);
    if (S && S.empresa.logo && !applyBrand.done) { applyBrand.done = true; $('#lg').innerHTML = '<img alt="" src="/api/logo?t=' + encodeURIComponent(S.empresa.id) + '">'; }
  }
  const DONO = () => (S && S.empresa.nome) || 'Dono';
  const M = k => !!(S && S.modulos[k]);

  /* ---------- entrar ---------- */
  function showLogin(msg) {
    S = null; $('#bn').hidden = true; $('#sair').hidden = true; closeSheet();
    $('#main').innerHTML = `<div class="login"><form class="card" id="lf" autocomplete="on">
      <h1>Entrar</h1><p class="muted small">${esc(brand.name || 'Tino')} · app do produtor</p>
      <div class="field"><label for="lu">Usuário</label><input type="text" id="lu" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
      <div class="field"><label for="lp">Senha</label><input type="password" id="lp" autocomplete="current-password" required></div>
      <p class="neg small" id="le" role="alert" style="min-height:18px;font-weight:600">${esc(msg || '')}</p>
      <button class="btn pri full" type="submit">Entrar</button>
      <p class="tino">Quem tem <b>Tino</b>, vende melhor.</p></form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; $('#le').textContent = '';
      try { await api('/api/login', { role: 'admin', login: $('#lu').value.trim().toLowerCase(), password: $('#lp').value }); $('#lp').value = ''; await start(); }
      catch (er) { $('#le').textContent = er.message; $('#lp').value = ''; } finally { b.disabled = false; }
    });
    setTimeout(() => { const u = $('#lu'); if (u) u.focus(); }, 50);
  }
  function showReset() {
    $('#bn').hidden = true;
    $('#main').innerHTML = `<div class="login"><form class="card" id="rf">
      <h1>Crie a sua senha</h1><p class="muted small">É o primeiro acesso. Use pelo menos 10 caracteres, com letras e números.</p>
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

  /* ---------- contas (o servidor confere o acerto; aqui é só para mostrar) ---------- */
  const roca = id => S.rocas.find(r => r.id === id);
  const pessoa = id => S.pessoas.find(p => p.id === id);
  const cat = id => S.cats.find(c => c.id === id) || { id, nome: id || 'Outros', icone: '➕' };
  const nomeParte = k => k === 'dono' ? DONO() : (pessoa(k) || {}).nome || 'Meeiro';
  const meeirosDe = r => r && M('r_meeiros') ? Object.keys(r.parceria || {}).filter(pessoa) : [];
  const donoPct = r => r2(100 - Object.values((r && r.parceria) || {}).reduce((a, b) => a + Number(b || 0), 0));
  const vendaPartes = r => { const o = {}; meeirosDe(r).forEach(k => { o[k] = Number(r.parceria[k]); }); const d = donoPct(r); if (d > 0) o.dono = d; return Object.keys(o).length ? o : { dono: 100 }; };
  const partesDe = l => (l.partes && Object.keys(l.partes).length ? l.partes : { dono: 100 });
  /* parte de cada um em reais: cada meeiro arredonda os centavos dele e o dono fica com o resto (a soma sempre fecha com o valor) */
  const parte = (l, k) => {
    const ps = partesDe(l);
    if (k !== 'dono') return r2(l.valor * (Number(ps[k]) || 0) / 100);
    const outros = Object.keys(ps).filter(x => x !== 'dono').reduce((a, x) => a + r2(l.valor * (Number(ps[x]) || 0) / 100), 0);
    return r2(l.valor - outros);
  };
  function periodo() {
    const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    if (per === 'mes') return { de: y + '-' + m + '-01', ate: '9999', nome: 'neste mês' };
    if (per === 'ano') return { de: y + '-01-01', ate: '9999', nome: 'em ' + y };
    if (per === 'passado') return { de: (y - 1) + '-01-01', ate: (y - 1) + '-12-31', nome: 'em ' + (y - 1) };
    return { de: '0000', ate: '9999', nome: 'desde o começo' };
  }
  const noPeriodo = l => { const p = periodo(); return l.data >= p.de && l.data <= p.ate; };
  function resumo(lancs) {
    const o = { vendas: 0, desp: 0, despDono: 0, parteMeeiros: 0, vendaDono: 0, adiant: 0, cats: {} };
    lancs.forEach(l => {
      if (l.tipo === 'venda') { o.vendas += l.valor; const d = parte(l, 'dono'); o.vendaDono += d; o.parteMeeiros += l.valor - d; }
      else if (l.tipo === 'despesa') {
        o.desp += l.valor; const d = parte(l, 'dono'); o.despDono += d;
        const c = o.cats[l.categoria] || (o.cats[l.categoria] = { total: 0, dono: 0 }); c.total += l.valor; c.dono += d;
      } else o.adiant += l.valor;
    });
    Object.keys(o).forEach(k => { if (typeof o[k] === 'number') o[k] = r2(o[k]); });
    o.resultado = r2(o.vendaDono - o.despDono);
    return o;
  }
  /* o que falta acertar com um meeiro numa roça (todo o período) */
  function pendente(rocaId, pid) {
    let parteV = 0, desp = 0, adi = 0, n = 0;
    S.lanc.forEach(l => {
      if (l.rocaId !== rocaId || (l.acertos || {})[pid]) return;
      if (l.tipo === 'venda' && partesDe(l)[pid]) { parteV += parte(l, pid); n++; }
      else if (l.tipo === 'despesa' && partesDe(l)[pid]) { desp += parte(l, pid); n++; }
      else if (l.tipo === 'adiantamento' && l.pessoaId === pid) { adi += l.valor; n++; }
    });
    return { parte: r2(parteV), desp: r2(desp), adi: r2(adi), saldo: r2(parteV - desp - adi), n };
  }
  function pendencias() {
    const out = [];
    if (!M('r_meeiros')) return out;
    S.rocas.forEach(r => {
      const ps = new Set(meeirosDe(r));
      S.lanc.forEach(l => { if (l.rocaId === r.id) { Object.keys(partesDe(l)).forEach(k => { if (k !== 'dono') ps.add(k); }); if (l.tipo === 'adiantamento') ps.add(l.pessoaId); } });
      ps.forEach(pid => { const p = pendente(r.id, pid); if (p.n) out.push(Object.assign({ roca: r, pid }, p)); });
    });
    return out;
  }
  /* a cara da roça: ícone escolhido, ou o da cultura escrita, e a cor que vem com o ícone */
  const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function visual(x) {
    const C = (S && S.culturas) || [];
    let c = x && x.icone ? C.find(k => k.icone === x.icone) : null;
    if (!c && x && x.cultura) { const n = semAcento(x.cultura); const pal = n.split(/[^a-z0-9]+/); c = C.find(k => semAcento(k.nome) === n) || C.find(k => pal.includes(semAcento(k.nome))); }
    c = c || C.find(k => k.nome === 'Outra') || { icone: '🌿', cor: '#2C5139' };
    return { icone: c.icone, cor: /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : '#2C5139' };
  }
  const tile = (x, big) => { const v = visual(x); return `<span class="ctile${big ? ' big' : ''}" style="background:${v.cor}22;border-color:${v.cor}66" aria-hidden="true">${v.icone}</span>`; };
  const splitBar = r => {
    const ps = vendaPartes(r), keys = Object.keys(ps).sort((a, b) => (a === 'dono' ? -1 : b === 'dono' ? 1 : 0));
    return `<div class="split" role="img" aria-label="${esc(keys.map(k => nomeParte(k) + ' ' + pctTxt(ps[k])).join(', '))}">${keys.map(k => `<div style="flex:${ps[k]}">${esc(nomeParte(k))} ${pctTxt(ps[k])}</div>`).join('')}</div>`;
  };
  const modoTxt = m => ({ funcionarios: 'Só funcionários', meeiro: 'Meeiro', misto: 'Meeiro e funcionários' }[m] || '');
  const perChips = () => `<div class="chips noprint" role="group" aria-label="Período">${[['mes', 'Este mês'], ['ano', 'Este ano'], ['passado', 'Ano passado'], ['tudo', 'Tudo']].map(([k, n]) => `<button type="button" class="chip" data-per="${k}" aria-pressed="${per === k}">${n}</button>`).join('')}</div>`;
  function bindPer() { document.querySelectorAll('[data-per]').forEach(b => b.addEventListener('click', () => { per = b.dataset.per; render(); })); }

  /* ---------- navegação ---------- */
  /* cada tela entra no histórico: o "Voltar" do celular volta de tela (e fecha a folha aberta antes) em vez de sair do app */
  function go(v, a, replace) {
    view = v; arg = a == null ? null : a;
    const st = { v: view, a: arg }, url = '#' + v + (arg ? '/' + arg : '');
    if (replace) history.replaceState(st, '', url); else history.pushState(st, '', url);
    window.scrollTo(0, 0); render();
  }
  window.addEventListener('popstate', e => {
    if (!S) return;
    if ($('#sheet').innerHTML) { $('#sheet').innerHTML = ''; return; }
    const st = e.state && e.state.v ? e.state : (() => { const h = location.hash.slice(1).split('/'); return { v: h[0] || 'inicio', a: h.slice(1).join('/') || null }; })();
    view = st.v; arg = st.a || null; window.scrollTo(0, 0); render();
  });
  $('#bn').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'lancar') return lancarMenu(); go(b.dataset.go); }));
  function render() {
    if (!S) return;
    $('#bn').querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-current', String(b.dataset.go === view || (view === 'roca' && b.dataset.go === 'rocas'))));
    const V = { inicio: vInicio, rocas: vRocas, roca: vRoca, pessoas: vPessoas, relatorio: vRelatorio, acerto: vAcerto };
    (V[view] || vInicio)();
  }

  /* ---------- Início ---------- */
  function vInicio() {
    const L = S.lanc.filter(noPeriodo), R = resumo(L), pend = pendencias().filter(p => Math.abs(p.saldo) >= 0.01);
    const gerais = resumo(L.filter(l => !l.rocaId));
    const cats = Object.entries(R.cats).filter(([, v]) => v.dono > 0).sort((a, b) => b[1].dono - a[1].dono).slice(0, 5), maxC = cats.length ? cats[0][1].dono : 0;
    if (!S.rocas.length) {
      $('#main').innerHTML = `<div class="card empty"><div class="big">🌱</div><h1>Bem-vindo, ${esc(DONO())}!</h1>
        <p class="muted">Comece cadastrando a sua primeira roça. Cada roça fica independente, com os meeiros, os funcionários, as despesas e as vendas dela.</p>
        <button class="btn gold" type="button" id="nr">+ Cadastrar a primeira roça</button></div>`;
      $('#nr').addEventListener('click', () => wizard()); return;
    }
    $('#main').innerHTML = `
      <div class="between"><h1>Resumo ${esc(periodo().nome)}</h1></div>${perChips()}
      <div class="kpis">
        <div class="k"><span>Vendido</span><b class="pos">${money(R.vendas)}</b></div>
        <div class="k"><span>Gastos de ${esc(DONO())}</span><b class="neg">${money(R.despDono)}</b></div>
        <div class="k res"><span>Sobrou para ${esc(DONO())}</span><b>${money(R.resultado)}</b></div>
      </div>
      ${R.parteMeeiros ? `<p class="small muted">Do vendido, ${money(R.parteMeeiros)} é a parte dos meeiros. Gastos pagos pelos meeiros: ${money(r2(R.desp - R.despDono))}.</p>` : ''}
      ${chequesHtml()}
      ${pend.length ? `<section class="card"><h2>Acertos com meeiros</h2><div class="list">${pend.map(p => `<button type="button" class="it" data-acerto="${esc(p.roca.id)}/${esc(p.pid)}"><span class="ic">🤝</span><span class="tx"><b>${esc(nomeParte(p.pid))}</b><span>${esc(p.roca.nome)} · ${p.n} lançamento(s) em aberto</span></span><span class="vl ${p.saldo >= 0 ? 'pos' : 'neg'}">${money(Math.abs(p.saldo))}<small>${p.saldo >= 0 ? esc(DONO()) + ' paga' : esc(nomeParte(p.pid)) + ' deve'}</small></span></button>`).join('')}</div></section>` : ''}
      <section class="card"><div class="between"><h2>Roças</h2><button class="btn sm" type="button" id="nr">+ Nova roça</button></div>
        ${S.rocas.filter(r => r.ativa).map(r => { const x = resumo(L.filter(l => l.rocaId === r.id)); return `<button type="button" class="roca" data-roca="${esc(r.id)}" style="border-left:5px solid ${visual(r).cor}"><div class="t"><div class="row" style="flex-wrap:nowrap;min-width:0">${tile(r)}<div style="min-width:0"><b>${esc(r.nome)}</b><p class="small muted">${esc([r.cultura, r.local, modoTxt(r.modo)].filter(Boolean).join(' · '))}</p></div></div><span class="${x.resultado >= 0 ? 'pos' : 'neg'}" style="font-weight:800">${money(x.resultado)}</span></div>
          ${meeirosDe(r).length ? splitBar(r) : ''}<p class="small muted">Vendido ${money(x.vendas)} · Gastos ${money(x.despDono)}${x.desp !== x.despDono ? ' (total ' + money(x.desp) + ')' : ''}</p></button>`; }).join('')}
      </section>
      ${gerais.desp ? `<section class="card"><div class="between"><h2>Gastos gerais da fazenda</h2><b class="neg">${money(gerais.desp)}</b></div><p class="small muted">Veículos, energia e o que não é de uma roça só. Já estão descontados em "Sobrou para ${esc(DONO())}".</p></section>` : ''}
      ${cats.length ? `<section class="card"><h2>Onde ${esc(DONO())} mais gastou</h2><div class="bars">${cats.map(([c, v], i) => `<div class="bar${i === 0 ? ' top' : ''}"><div class="l"><span>${cat(c).icone} ${esc(cat(c).nome)}</span><b>${money(v.dono)}</b></div><div class="tr"><i style="width:${maxC ? Math.max(3, v.dono / maxC * 100) : 0}%"></i></div></div>`).join('')}</div></section>` : ''}
      <button class="btn gold full noprint" type="button" id="lc">+ Lançar despesa, venda ou adiantamento</button>`;
    bindPer();
    $('#nr').addEventListener('click', () => wizard());
    $('#lc').addEventListener('click', lancarMenu);
    document.querySelectorAll('#main [data-lc]').forEach(b => b.addEventListener('click', () => formLanc(S.lanc.find(l => l.id === b.dataset.lc))));
    document.querySelectorAll('[data-roca]').forEach(b => b.addEventListener('click', () => { rocaTab = 'resumo'; go('roca', b.dataset.roca); }));
    document.querySelectorAll('[data-acerto]').forEach(b => b.addEventListener('click', () => go('acerto', b.dataset.acerto)));
  }

  /* ---------- Roças ---------- */
  function vRocas() {
    const at = S.rocas.filter(r => r.ativa), ina = S.rocas.filter(r => !r.ativa);
    const card = r => `<button type="button" class="roca" data-roca="${esc(r.id)}" style="border-left:5px solid ${visual(r).cor}"><div class="t"><div class="row" style="flex-wrap:nowrap;min-width:0">${tile(r)}<div style="min-width:0"><b>${esc(r.nome)}</b><p class="small muted">${esc([r.cultura, r.local, r.area].filter(Boolean).join(' · '))}</p></div></div><span class="small muted">${esc(modoTxt(r.modo))}</span></div>${meeirosDe(r).length ? splitBar(r) : ''}</button>`;
    $('#main').innerHTML = `<div class="between"><h1>Roças</h1><button class="btn gold" type="button" id="nr">+ Nova roça</button></div>
      ${at.length ? at.map(card).join('') : '<div class="card empty"><div class="big">🌳</div><p class="muted">Nenhuma roça ainda.</p></div>'}
      ${ina.length ? `<h2 style="margin-top:8px">Encerradas</h2>${ina.map(card).join('')}` : ''}`;
    $('#nr').addEventListener('click', () => wizard());
    document.querySelectorAll('[data-roca]').forEach(b => b.addEventListener('click', () => { rocaTab = 'resumo'; go('roca', b.dataset.roca); }));
  }
  function vRoca() {
    const r = roca(arg); if (!r) return go('rocas');
    const all = S.lanc.filter(l => l.rocaId === r.id), L = all.filter(noPeriodo), R = resumo(L);
    const meeiros = meeirosDe(r), func = S.pessoas.filter(p => p.tipo === 'funcionario' && p.rocaId === r.id && p.ativo);
    const tabs = [['resumo', 'Resumo'], ['lanc', 'Lançamentos']].concat(meeiros.length || all.some(l => l.tipo === 'adiantamento') ? [['meeiros', 'Meeiros']] : []).concat(M('r_funcionarios') ? [['equipe', 'Equipe']] : []).concat([['regras', 'Regras']]);
    if (!tabs.some(t => t[0] === rocaTab)) rocaTab = 'resumo';
    let body = '';
    if (rocaTab === 'resumo') {
      const cats = Object.entries(R.cats).sort((a, b) => b[1].total - a[1].total), mx = cats.length ? cats[0][1].total : 0;
      body = `${perChips()}<div class="kpis"><div class="k"><span>Vendido</span><b class="pos">${money(R.vendas)}</b></div><div class="k"><span>Gastos de ${esc(DONO())}</span><b class="neg">${money(R.despDono)}</b></div><div class="k res"><span>Sobrou para ${esc(DONO())}</span><b>${money(R.resultado)}</b></div></div>
        ${meeiros.length ? `<section class="card"><h3>Divisão ${esc(periodo().nome)}</h3><div class="scroll"><table><thead><tr><th>Quem</th><th class="n">Parte na venda</th><th class="n">Despesas</th><th class="n">Resultado</th></tr></thead><tbody>
          ${['dono'].concat(meeiros).map(k => { const v = r2(L.filter(l => l.tipo === 'venda').reduce((a, l) => a + parte(l, k), 0)), d = r2(L.filter(l => l.tipo === 'despesa').reduce((a, l) => a + parte(l, k), 0)); return `<tr><td>${esc(nomeParte(k))}</td><td class="n">${money(v)}</td><td class="n">${money(d)}</td><td class="n ${v - d >= 0 ? 'pos' : 'neg'}">${money(v - d)}</td></tr>`; }).join('')}
          </tbody></table></div><p class="small muted">Adiantamentos não entram aqui: eles são descontados no acerto.</p></section>` : ''}
        <section class="card"><h3>Gastos por tipo</h3>${cats.length ? `<div class="bars">${cats.map(([c, v], i) => `<div class="bar${i === 0 ? ' top' : ''}"><div class="l"><span>${cat(c).icone} ${esc(cat(c).nome)}</span><b>${money(v.total)}</b></div><div class="tr"><i style="width:${mx ? Math.max(3, v.total / mx * 100) : 0}%"></i></div></div>`).join('')}</div>` : '<p class="muted small">Nenhuma despesa no período.</p>'}</section>`;
    } else if (rocaTab === 'lanc') {
      body = lancList(all, true);
    } else if (rocaTab === 'meeiros') {
      const ps = new Set(meeiros); all.forEach(l => { Object.keys(partesDe(l)).forEach(k => { if (k !== 'dono') ps.add(k); }); if (l.tipo === 'adiantamento') ps.add(l.pessoaId); });
      body = [...ps].map(pid => { const p = pendente(r.id, pid), hist = S.acertos.filter(a => a.rocaId === r.id && a.pessoaId === pid);
        return `<section class="card"><div class="between"><div><h3>${esc(nomeParte(pid))}</h3><p class="small muted">${r.parceria[pid] ? pctTxt(r.parceria[pid]) + ' do valor vendido' : 'não está mais na parceria'}${(pessoa(pid) || {}).telefone ? ' · ' + esc(pessoa(pid).telefone) : ''}</p></div>
          ${r.parceria[pid] ? `<button class="btn sm" type="button" data-adi="${esc(pid)}">+ Adiantamento</button>` : ''}</div>
          <div class="kpis"><div class="k"><span>Parte nas vendas</span><b class="pos">${money(p.parte)}</b></div><div class="k"><span>Despesas dele</span><b class="neg">${money(p.desp)}</b></div><div class="k"><span>Adiantamentos</span><b class="inf">${money(p.adi)}</b></div></div>
          ${p.n ? `<div class="saldo ${p.saldo > 0 ? 'p' : p.saldo < 0 ? 'n' : 'z'}"><span class="small">Em aberto hoje</span><b>${money(Math.abs(p.saldo))}</b><span class="small">${p.saldo > 0 ? esc(DONO()) + ' paga para ' + esc(nomeParte(pid)) : p.saldo < 0 ? esc(nomeParte(pid)) + ' deve para ' + esc(DONO()) : 'Zerado'}</span></div>
            <button class="btn pri full" type="button" data-acerto="${esc(r.id)}/${esc(pid)}">Fazer o acerto</button>` : '<p class="ok">Tudo acertado com ' + esc(nomeParte(pid)) + '.</p>'}
          ${hist.length ? `<h3>Acertos feitos</h3><div class="list">${hist.map(a => `<div class="it"><span class="ic">${a.desfeitoEm ? '↩️' : '✅'}</span><span class="tx"><b>Acerto nº ${a.numero} · ${dBR(a.data)}</b><span>${a.itens} lançamentos${a.desfeitoEm ? ' · desfeito' : ''}${a.obs ? ' · ' + esc(a.obs) : ''}</span></span><span class="vl">${money(Math.abs(a.saldo))}<small>${a.saldo >= 0 ? esc(DONO()) + ' pagou' : 'meeiro pagou'}</small>${a.desfeitoEm ? '' : `<button class="btn sm dan noprint" type="button" data-desf="${esc(a.id)}" style="margin-top:4px">Desfazer</button>`}</span></div>`).join('')}</div>` : ''}
        </section>`; }).join('') || '<div class="card"><p class="muted">Esta roça não tem meeiro.</p></div>';
    } else if (rocaTab === 'equipe') {
      body = `<section class="card"><div class="between"><h3>Funcionários fixos desta roça</h3><button class="btn sm" type="button" id="nf">+ Funcionário</button></div>
        ${func.length ? `<div class="list">${func.map(p => `<button type="button" class="it" data-pes="${esc(p.id)}"><span class="ic">👷</span><span class="tx"><b>${esc(p.nome)}</b><span>${esc(p.telefone || '')}</span></span><span class="vl">${p.salario ? money(p.salario) + '<small>por mês</small>' : ''}</span></button>`).join('')}</div>` : '<p class="muted small">Nenhum funcionário fixo nesta roça.</p>'}
        ${func.length ? '<button class="btn full" type="button" id="sal">Pagar salários do mês</button>' : ''}</section>`;
    } else {
      body = `<section class="card"><h3>Como a roça é tocada</h3><p>${esc(modoTxt(r.modo))}</p>${meeiros.length ? splitBar(r) + '<p class="small muted">A porcentagem é sobre o valor vendido (bruto).</p>' : ''}</section>
        ${meeiros.length ? `<section class="card"><h3>Quem paga cada despesa</h3><div class="list">${S.cats.map(c => { const p = r.regras[c.id] || { dono: 100 }; return `<div class="it"><span class="ic">${c.icone}</span><span class="tx"><b>${esc(c.nome)}</b><span>${esc(regraTxt(r, p))}</span></span></div>`; }).join('')}</div></section>` : ''}
        <section class="card"><h3>Dados</h3><p class="small">${esc([r.cultura && 'Cultura: ' + r.cultura, r.local && 'Local: ' + r.local, r.area && 'Área: ' + r.area, r.inicio && 'Início: ' + dBR(r.inicio)].filter(Boolean).join(' · ') || 'Sem detalhes.')}</p>${r.obs ? `<p class="small muted">${esc(r.obs)}</p>` : ''}</section>
        <button class="btn pri full" type="button" id="ed">Editar a roça</button>
        <button class="btn full" type="button" id="enc">${r.ativa ? 'Encerrar a roça (sai da tela inicial)' : 'Reabrir a roça'}</button>`;
    }
    $('#main').innerHTML = `<div class="row noprint"><button class="btn sm" type="button" id="bk">← Roças</button></div>
      <div class="row" style="flex-wrap:nowrap;align-items:center">${tile(r, true)}<div style="min-width:0"><h1>${esc(r.nome)}</h1><p class="muted small">${esc([r.cultura, r.local, r.area, modoTxt(r.modo)].filter(Boolean).join(' · '))}${r.ativa ? '' : ' · encerrada'}</p></div></div>
      ${meeiros.length ? splitBar(r) : ''}
      <div class="tabs noprint" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-rt="${k}" aria-selected="${rocaTab === k}">${n}</button>`).join('')}</div>
      ${body}
      <button class="btn gold full noprint" type="button" id="lc">+ Lançar nesta roça</button>`;
    $('#bk').addEventListener('click', () => go('rocas'));
    $('#lc').addEventListener('click', () => lancarMenu(r.id));
    document.querySelectorAll('[data-rt]').forEach(b => b.addEventListener('click', () => { rocaTab = b.dataset.rt; render(); }));
    bindPer(); bindLanc();
    document.querySelectorAll('[data-acerto]').forEach(b => b.addEventListener('click', () => go('acerto', b.dataset.acerto)));
    document.querySelectorAll('[data-adi]').forEach(b => b.addEventListener('click', () => formLanc({ tipo: 'adiantamento', rocaId: r.id, pessoaId: b.dataset.adi })));
    document.querySelectorAll('[data-desf]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Desfazer este acerto? Os lançamentos voltam a ficar em aberto para o próximo acerto.')) return;
      if (await post('/api/rural/acerto/desfazer', { id: b.dataset.desf }, 'Acerto desfeito')) render();
    }));
    document.querySelectorAll('[data-pes]').forEach(b => b.addEventListener('click', () => formPessoa(pessoa(b.dataset.pes))));
    const nf = $('#nf'); if (nf) nf.addEventListener('click', () => formPessoa({ tipo: 'funcionario', rocaId: r.id }));
    const sal = $('#sal'); if (sal) sal.addEventListener('click', () => formSalarios(r.id));
    const ed = $('#ed'); if (ed) ed.addEventListener('click', () => wizard(r));
    const enc = $('#enc'); if (enc) enc.addEventListener('click', async () => {
      if (r.ativa && !confirm('Encerrar "' + r.nome + '"? Os lançamentos continuam guardados e entram nos relatórios.')) return;
      if (await post('/api/rural/roca', Object.assign({}, r, { ativa: !r.ativa }), r.ativa ? 'Roça encerrada' : 'Roça reaberta')) render();
    });
  }
  function regraTxt(r, p) {
    const ks = Object.keys(p).filter(k => p[k] > 0);
    if (ks.length === 1) return nomeParte(ks[0]) + ' paga tudo';
    const vp = vendaPartes(r);
    if (ks.length === Object.keys(vp).length && ks.every(k => Math.abs((vp[k] || 0) - p[k]) < 0.01)) return 'Dividido igual à meação (' + ks.map(k => nomeParte(k) + ' ' + pctTxt(p[k])).join(' · ') + ')';
    return ks.map(k => nomeParte(k) + ' ' + pctTxt(p[k])).join(' · ');
  }

  /* lista de lançamentos (tocar abre para corrigir) */
  function lancList(list, semRoca) {
    if (!list.length) return '<div class="card empty"><div class="big">📝</div><p class="muted">Nada lançado ainda.</p></div>';
    const ic = l => l.tipo === 'venda' ? '💰' : l.tipo === 'adiantamento' ? '🤝' : cat(l.categoria).icone;
    const tit = l => l.tipo === 'venda' ? 'Venda' + (l.qtd ? ' · ' + numIn(l.qtd) + ' ' + (l.unidade || '') : '') : l.tipo === 'adiantamento' ? 'Adiantamento · ' + (l.pessoaNome || '') : cat(l.categoria).nome + (l.pessoaNome ? ' · ' + l.pessoaNome : '');
    const sub = l => [dBR(l.data), !semRoca && (l.rocaId ? (roca(l.rocaId) || {}).nome : 'Geral'), l.veiculoId && ((S.veiculos.find(v => v.id === l.veiculoId) || {}).nome), l.descricao, l.comprador, l.tipo === 'venda' && pagTxt(l), Object.keys(l.acertos || {}).length ? 'acertado' : ''].filter(Boolean).join(' · ');
    return `<section class="card"><div class="list">${list.map(l => `<button type="button" class="it" data-lc="${esc(l.id)}"><span class="ic">${ic(l)}</span><span class="tx"><b>${esc(tit(l))}</b><span>${esc(sub(l))}</span></span><span class="vl ${l.tipo === 'venda' ? 'pos' : l.tipo === 'adiantamento' ? 'inf' : 'neg'}">${l.tipo === 'venda' ? '+' : '−'} ${money(l.valor)}${l.tipo === 'despesa' && Object.keys(partesDe(l)).length > 1 ? '<small>dividida</small>' : ''}</span></button>`).join('')}</div></section>`;
  }
  function bindLanc() { document.querySelectorAll('[data-lc]').forEach(b => b.addEventListener('click', () => { const l = S.lanc.find(x => x.id === b.dataset.lc); if (l) formLanc(l); })); }

  /* ---------- folha (formulários) ---------- */
  function openSheet(title, html, onReady) {
    if (!$('#sheet').innerHTML) history.pushState({ v: view, a: arg, sheet: 1 }, '', location.hash);
    $('#sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="pn"><div class="tt"><h2>${esc(title)}</h2><button type="button" class="x" id="shx" aria-label="Fechar">×</button></div>${html}</div></div>`;
    $('#shx').addEventListener('click', fecharPeloUsuario);
    $('#sheet .sheet').addEventListener('click', e => { if (e.target.classList.contains('sheet')) fecharPeloUsuario(); });
    if (onReady) onReady($('#sheet .pn'));
  }
  function closeSheet() {
    if (!$('#sheet').innerHTML) return;
    $('#sheet').innerHTML = '';
    if (history.state && history.state.sheet) history.replaceState({ v: view, a: arg }, '', location.hash);
  }
  /* fechar no "×", fora da folha ou no Esc: volta um passo no histórico (o "Voltar" seguinte já troca de tela) */
  function fecharPeloUsuario() {
    if (history.state && history.state.sheet) history.back(); // o popstate fecha a folha
    else closeSheet();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').innerHTML) fecharPeloUsuario(); });

  function lancarMenu(rocaId) {
    const rid = typeof rocaId === 'string' ? rocaId : null;
    const r = rid ? roca(rid) : null;
    const temMeeiro = rid ? meeirosDe(r).length > 0 : S.rocas.some(x => x.ativa && meeirosDe(x).length);
    if (!S.rocas.length && !M('r_gerais')) { toast('Cadastre uma roça primeiro.'); return wizard(); }
    const temRoca = S.rocas.some(x => x.ativa);
    const op = [['despesa', '💸', 'Despesa', 'adubo, veneno, energia…']].concat(temRoca ? [['venda', '💰', 'Venda', 'o que foi vendido']] : [])
      .concat(M('r_meeiros') && temMeeiro ? [['adiantamento', '🤝', 'Adiantamento', 'ao meeiro']] : [])
      .concat(M('r_diaristas') ? [['diarista', '🧑‍🌾', 'Diarista', 'serviço pontual']] : [])
      .concat(M('r_funcionarios') && S.pessoas.some(p => p.tipo === 'funcionario' && p.ativo) ? [['salarios', '👷', 'Salários', 'pagar o mês']] : []);
    openSheet(r ? 'Lançar em ' + r.nome : 'O que você quer lançar?', `<div class="big-opts">${op.map(([k, i, n, s]) => `<button type="button" data-op="${k}"><i>${i}</i>${n}<small>${s}</small></button>`).join('')}</div>`, pn => {
      pn.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.op;
        if (k === 'salarios') return formSalarios(rid);
        if (k === 'diarista') return formLanc({ tipo: 'despesa', categoria: 'diarista', rocaId: rid });
        formLanc({ tipo: k, rocaId: rid });
      }));
    });
  }

  /* quem paga: chips com os nomes + dividir */
  function quemPagaHtml(F) {
    const r = F.rocaId ? roca(F.rocaId) : null, ms = meeirosDe(r);
    if (F.tipo !== 'despesa' || !ms.length) return '';
    const ks = ['dono'].concat(ms), p = F.partes || { dono: 100 }, vp = vendaPartes(r);
    const sel = Object.keys(p).filter(k => p[k] > 0);
    const isMea = sel.length === Object.keys(vp).length && sel.every(k => Math.abs((vp[k] || 0) - p[k]) < 0.01);
    const modo = F.qpOutra ? 'outra' : sel.length === 1 ? sel[0] : isMea ? 'meacao' : 'outra';
    const v = toNum(F.valor);
    return `<div class="field"><span class="lbl">Quem paga esta despesa?</span><div class="chips" id="qp">
      ${ks.map(k => `<button type="button" class="chip" data-qp="${esc(k)}" aria-pressed="${modo === k}">${esc(nomeParte(k))}</button>`).join('')}
      <button type="button" class="chip" data-qp="meacao" aria-pressed="${modo === 'meacao'}">Dividir igual à meação</button>
      <button type="button" class="chip" data-qp="outra" aria-pressed="${modo === 'outra'}">Outra divisão</button></div>
      ${modo === 'outra' ? `<div style="display:grid;gap:8px">${ks.map(k => `<div class="pct"><span>${esc(nomeParte(k))}</span><div class="n"><input inputmode="decimal" data-pp="${esc(k)}" value="${numIn(p[k] || 0)}" aria-label="Porcentagem de ${esc(nomeParte(k))}"></div></div>`).join('')}</div>` : ''}
      <p class="small muted" id="qpv">${v > 0 ? ks.filter(k => p[k] > 0).map(k => esc(nomeParte(k)) + ': ' + money(v * p[k] / 100)).join(' · ') : 'A regra desta roça já vem marcada; mude se esta compra for diferente.'}</p></div>`;
  }

  function formLanc(src) {
    const edit = !!(src && src.id && S.lanc.some(l => l.id === src.id));
    const F = Object.assign({ tipo: 'despesa', data: hoje(), valor: '', rocaId: null }, JSON.parse(JSON.stringify(src || {})));
    if (edit) { F.valor = numIn(F.valor); F.qtd = numIn(F.qtd); F.preco = numIn(F.preco); F.dias = numIn(F.dias); }
    const travado = edit && Object.keys(F.acertos || {}).length > 0;
    // pagamento: lista de partes {forma, valor, vence, cheque, aberto}; uma parte só = a venda toda
    F.pags = (edit ? pagsDe(src) : []).map(x => ({ forma: x.forma, valor: numIn(x.valor), vence: x.vence || '', cheque: Object.assign({}, x.cheque || {}), aberto: !!Object.keys(x.cheque || {}).length }));
    F.dividir = F.pags.length > 1;
    const origRoca = edit ? F.rocaId : null, origPartes = edit ? JSON.parse(JSON.stringify(F.partes || {})) : null;
    const ativas = S.rocas.filter(r => r.ativa || r.id === F.rocaId);
    if (!F.rocaId && F.tipo !== 'despesa' && ativas.length === 1) F.rocaId = ativas[0].id;
    if (edit && F.tipo === 'despesa') F.geral = !F.rocaId;
    if (!edit && !F.rocaId && F.tipo === 'despesa') { if (ativas.length === 1) F.rocaId = ativas[0].id; else if (!ativas.length) F.geral = true; }
    if (F.tipo === 'adiantamento' && !F.rocaId) { const cm = ativas.filter(x => meeirosDe(x).length); if (cm.length === 1) F.rocaId = cm[0].id; }
    if (F.tipo === 'adiantamento' && F.rocaId && !F.pessoaId) { const ms = meeirosDe(roca(F.rocaId)); if (ms.length === 1) F.pessoaId = ms[0]; }
    const regra = () => { const r = F.rocaId && roca(F.rocaId); F.partes = r && meeirosDe(r).length && F.categoria ? JSON.parse(JSON.stringify(r.regras[F.categoria] || { dono: 100 })) : { dono: 100 }; F.qpOutra = false; };
    if (!edit && F.tipo === 'despesa') regra();
    const diar = F.tipo === 'despesa' && F.categoria === 'diarista';
    const title = (edit ? 'Corrigir ' : '') + (F.tipo === 'venda' ? 'venda' : F.tipo === 'adiantamento' ? 'adiantamento' : diar ? 'diarista' : 'despesa');
    function draw() {
      const r = F.rocaId ? roca(F.rocaId) : null;
      const rocasOk = F.tipo === 'adiantamento' ? ativas.filter(x => meeirosDe(x).length) : ativas;
      const geralOk = F.tipo === 'despesa' && (M('r_gerais') || F.categoria === 'salario' || M('r_veiculos') && F.veiculoId);
      const vtotal = F.tipo === 'venda' && toNum(F.qtd) > 0 && toNum(F.preco) > 0 ? r2(toNum(F.qtd) * toNum(F.preco)) : diar && toNum(F.dias) > 0 && toNum(F.preco) > 0 ? r2(toNum(F.dias) * toNum(F.preco)) : null;
      if (vtotal != null) F.valor = numIn(vtotal);
      const html = `${travado ? '<p class="warn">Este lançamento já entrou num acerto. Para mudar, desfaça o acerto na aba Meeiros da roça.</p>' : ''}
        <div class="field"><span class="lbl">${F.tipo === 'venda' ? 'De qual roça?' : F.tipo === 'adiantamento' ? 'Roça do meeiro' : 'Onde foi o gasto?'}</span><div class="chips">
          ${rocasOk.map(x => `<button type="button" class="chip" data-r="${esc(x.id)}" aria-pressed="${F.rocaId === x.id}">${esc(x.nome)}</button>`).join('')}
          ${geralOk ? `<button type="button" class="chip" data-r="" aria-pressed="${!F.rocaId && !!F.geral}">Geral da fazenda</button>` : ''}</div></div>
        ${F.tipo === 'despesa' && !diar ? `<div class="field"><span class="lbl">Tipo de despesa</span><div class="cats">${S.cats.filter(c => c.id !== 'diarista' && (c.id !== 'salario' || M('r_funcionarios'))).map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${F.categoria === c.id}"><i>${c.icone}</i>${esc(c.nome)}</button>`).join('')}</div></div>` : ''}
        ${F.tipo === 'adiantamento' && r ? `<div class="field"><span class="lbl">Para qual meeiro?</span><div class="chips">${meeirosDe(r).map(k => `<button type="button" class="chip" data-pe="${esc(k)}" aria-pressed="${F.pessoaId === k}">${esc(nomeParte(k))}</button>`).join('')}</div></div>` : ''}
        ${diar ? `<div class="field"><label for="fpn">Nome do diarista</label><input type="text" id="fpn" maxlength="80" value="${esc(F.pessoaNome || '')}" placeholder="Ex.: João"></div>
          <div class="grid2"><div class="field"><label for="fdi">Dias</label><input inputmode="decimal" id="fdi" value="${esc(F.dias || '')}" placeholder="Ex.: 3"></div><div class="field"><label for="fpr">Valor do dia (R$)</label><input inputmode="decimal" id="fpr" value="${esc(F.preco || '')}" placeholder="Ex.: 120,00"></div></div>` : ''}
        ${F.tipo === 'venda' ? `<div class="grid2"><div class="field"><label for="fq">Quantidade</label><input inputmode="decimal" id="fq" value="${esc(F.qtd || '')}" placeholder="Ex.: 300"></div><div class="field"><label for="fpr">Preço por ${esc(F.unidade || 'unidade')} (R$)</label><input inputmode="decimal" id="fpr" value="${esc(F.preco || '')}" placeholder="Ex.: 25,00"></div></div>
          <div class="field"><span class="lbl">Unidade</span><div class="chips">${S.unidades.map(u => `<button type="button" class="chip" data-un="${u}" aria-pressed="${(F.unidade || '') === u}">${u}</button>`).join('')}</div></div>` : ''}
        <div class="field"><label for="fv">${F.tipo === 'venda' ? 'Total da venda (R$)' : 'Valor (R$)'}</label><input inputmode="decimal" class="money" id="fv" value="${esc(F.valor || '')}" placeholder="0,00" ${vtotal != null ? 'readonly' : ''}>${vtotal != null ? '<span class="small muted">Calculado: ' + (F.tipo === 'venda' ? 'quantidade × preço' : 'dias × valor do dia') + '.</span>' : ''}</div>
        ${F.tipo === 'venda' && r && meeirosDe(r).length ? `<p class="note" id="vnote" ${toNum(F.valor) > 0 ? '' : 'hidden'}>${vendaNote(r, toNum(F.valor))}</p>` : ''}
        ${quemPagaHtml(F)}
        ${F.tipo === 'despesa' && M('r_veiculos') && S.veiculos.some(v => v.ativo) ? `<div class="field"><span class="lbl">É de algum veículo ou máquina? (opcional)</span><div class="chips">${S.veiculos.filter(v => v.ativo || v.id === F.veiculoId).map(v => `<button type="button" class="chip" data-ve="${esc(v.id)}" aria-pressed="${F.veiculoId === v.id}">🚜 ${esc(v.nome)}</button>`).join('')}</div></div>` : ''}
        ${F.tipo === 'venda' ? `<div class="field"><label for="fc">Comprador (opcional)</label><input type="text" id="fc" maxlength="80" value="${esc(F.comprador || '')}" placeholder="Ex.: Ceasa, atravessador"></div>
          ${pagHtml()}` : ''}
        <div class="grid2"><div class="field"><label for="fd">Data</label><input type="date" id="fd" value="${esc(F.data)}" max="${hoje()}"></div>
        <div class="field"><label for="fds">${diar ? 'O que ele fez' : F.categoria === 'outros' ? 'O que foi' : 'Observação (opcional)'}</label><input type="text" id="fds" maxlength="200" value="${esc(F.descricao || '')}" placeholder="${diar ? 'Ex.: roçada, colheita' : F.tipo === 'adiantamento' ? 'Ex.: dinheiro, compra de veneno' : 'Ex.: 10 sacos, nota 123'}"></div></div>
        <p class="neg small" id="fe" role="alert" style="font-weight:600;min-height:16px"></p>
        <button class="btn pri full" type="button" id="fs" ${travado ? 'disabled' : ''}>${edit ? 'Salvar a correção' : 'Lançar'}</button>
        ${edit && !travado ? '<button class="btn dan full" type="button" id="fx">Excluir este lançamento</button>' : ''}`;
      openSheet(title.charAt(0).toUpperCase() + title.slice(1), html, bind);
    }
    const maxVence = () => (Number(hoje().slice(0, 4)) + 5) + hoje().slice(4);
    /* forma de pagamento da venda: uma forma só ou dividida em partes (ex.: 3 cheques; parte Pix, parte dinheiro).
       Cheque pede o vencimento (obrigatório) e, se quiser, os dados do cheque. */
    const PF = () => S.pagamentos || [];
    function chequeCampos(x, i) {
      const ch = x.cheque || {};
      return `<div class="field"><label for="pvc${i}">Vencimento do cheque (obrigatório)</label><input type="date" id="pvc${i}" data-pvc="${i}" value="${esc(x.vence || '')}" max="${maxVence()}" required></div>
        ${x.aberto ? `<p class="small muted" style="margin:0">Dados do cheque: opcional, preencha o que quiser.</p>
          <div class="field"><label for="pce${i}">Nome de quem passou o cheque</label><input type="text" id="pce${i}" data-pc="${i}:emitente" maxlength="80" value="${esc(ch.emitente || '')}" placeholder="Ex.: José da Silva"></div>
          <div class="grid2"><div class="field"><label for="pcb${i}">Banco</label><input type="text" id="pcb${i}" data-pc="${i}:banco" maxlength="40" value="${esc(ch.banco || '')}" placeholder="Ex.: Sicoob"></div><div class="field"><label for="pcn${i}">Número do cheque</label><input type="text" inputmode="numeric" id="pcn${i}" data-pc="${i}:numero" maxlength="20" value="${esc(ch.numero || '')}" placeholder="Ex.: 000123"></div></div>
          <div class="grid2"><div class="field"><label for="pca${i}">Agência</label><input type="text" inputmode="numeric" id="pca${i}" data-pc="${i}:agencia" maxlength="10" value="${esc(ch.agencia || '')}"></div><div class="field"><label for="pcc${i}">Conta</label><input type="text" inputmode="numeric" id="pcc${i}" data-pc="${i}:conta" maxlength="20" value="${esc(ch.conta || '')}"></div></div>`
        : `<button type="button" class="btn ghost full" data-pab="${i}">+ Dados do cheque (opcional)</button>`}`;
    }
    const prazoCampo = (x, i) => `<div class="field"><label for="pvc${i}">Vai receber em (opcional)</label><input type="date" id="pvc${i}" data-pvc="${i}" value="${esc(x.vence || '')}" max="${maxVence()}"></div>`;
    function pagHtml() {
      if (!F.dividir) {
        const x = F.pags[0] || { forma: '' };
        return `<div class="field"><span class="lbl">Forma de pagamento</span><div class="chips">${PF().map(p => `<button type="button" class="chip" data-pg="${esc(p.id)}" aria-pressed="${x.forma === p.id}">${esc(p.icone)} ${esc(p.nome)}</button>`).join('')}</div></div>
          ${x.forma === 'cheque' ? `<div class="chq"><div class="field"><span class="lbl">Quantos cheques?</span><div class="chips">${[1, 2, 3, 4, 5, 6].map(n => `<button type="button" class="chip" data-nch="${n}" aria-pressed="${n === 1}">${n}</button>`).join('')}</div></div>${chequeCampos(x, 0)}</div>` : ''}
          ${x.forma === 'prazo' ? prazoCampo(x, 0) : ''}
          <button type="button" class="btn ghost full" id="pdv">Dividir o pagamento (ex.: parte Pix, parte dinheiro, cheques)</button>`;
      }
      return `<div class="field"><span class="lbl">Pagamento dividido</span></div>
        ${F.pags.map((x, i) => `<div class="chq"><div class="between"><b>Parte ${i + 1}</b>${F.pags.length > 1 ? `<button type="button" class="btn sm" data-prm="${i}" aria-label="Tirar a parte ${i + 1}">Tirar</button>` : ''}</div>
          <div class="chips">${PF().map(p => `<button type="button" class="chip" data-pf="${i}:${esc(p.id)}" aria-pressed="${x.forma === p.id}">${esc(p.icone)} ${esc(p.nome)}</button>`).join('')}</div>
          <div class="field"><label for="pv${i}">Valor desta parte (R$)</label><input inputmode="decimal" class="money" id="pv${i}" data-pv="${i}" value="${esc(x.valor || '')}" placeholder="0,00"></div>
          ${x.forma === 'cheque' ? chequeCampos(x, i) : x.forma === 'prazo' ? prazoCampo(x, i) : ''}</div>`).join('')}
        <p class="note" id="psoma" aria-live="polite">${somaTxt()}</p>
        <div class="grid2"><button type="button" class="btn" id="pad">+ Outra parte</button><button type="button" class="btn ghost" id="pun">Uma forma só</button></div>`;
    }
    const centavos = v => Math.round((toNum(v) || 0) * 100);
    function somaTxt() {
      const tot = centavos(F.valor), so = F.pags.reduce((a, x) => a + centavos(x.valor), 0), d = tot - so;
      return 'Partes: <b>' + money(so / 100) + '</b> de ' + money(tot / 100) + (d === 0 ? ' ✓' : d > 0 ? ' · falta <b>' + money(d / 100) + '</b>' : ' · passou <b>' + money(-d / 100) + '</b>');
    }
    /* divide o total em n partes iguais (o último leva os centavos que sobram) */
    function emPartes(n, forma) {
      const tot = centavos(F.valor), base = Math.floor(tot / n), velhos = F.pags;
      F.pags = Array.from({ length: n }, (_, k) => Object.assign({ forma, vence: '', cheque: {}, aberto: false }, velhos[k] && velhos[k].forma === forma ? { vence: velhos[k].vence, cheque: velhos[k].cheque, aberto: velhos[k].aberto } : {}, { forma, valor: tot ? numIn(((k === n - 1 ? tot - base * (n - 1) : base) / 100).toFixed(2)) : '' }));
      F.dividir = n > 1;
    }
    /* venda corrigida na mesma roça: mostra a divisão gravada (do dia da venda), não a parceria de hoje */
    function vendaNote(r, v) { const ps = edit && F.rocaId === origRoca && Object.keys(origPartes).length ? origPartes : vendaPartes(r); return Object.entries(ps).map(([k, p]) => esc(nomeParte(k)) + ' (' + pctTxt(p) + '): <b>' + money((v || 0) * p / 100) + '</b>').join(' · '); }
    /* atualiza totais e prévias sem redesenhar (o campo que a pessoa tocou continua com o foco) */
    function upd() {
      keep();
      const fv = $('#fv'); if (!fv) return;
      const a = toNum(F.tipo === 'venda' ? F.qtd : F.dias), b = toNum(F.preco);
      if ((F.tipo === 'venda' || F.categoria === 'diarista') && a > 0 && b > 0) { F.valor = numIn(r2(a * b)); fv.value = F.valor; fv.readOnly = true; }
      else if (fv.readOnly) { fv.readOnly = false; fv.value = ''; F.valor = ''; }
      const v = toNum(F.valor), vn = $('#vnote'), r = F.rocaId && roca(F.rocaId);
      if (vn && r) { vn.hidden = !(v > 0); vn.innerHTML = vendaNote(r, v); }
      const ps = $('#psoma'); if (ps) ps.innerHTML = somaTxt();
      const q = $('#qpv'); if (q && v > 0) q.innerHTML = Object.keys(F.partes || {}).filter(k => F.partes[k] > 0).map(k => esc(nomeParte(k)) + ': ' + money(v * F.partes[k] / 100)).join(' · ');
    }
    function keep() {
      const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
      ['fv:valor', 'fd:data', 'fds:descricao', 'fq:qtd', 'fpr:preco', 'fc:comprador', 'fpn:pessoaNome', 'fdi:dias'].forEach(x => { const [id, k] = x.split(':'); const v = g(id); if (v !== undefined) F[k] = v; });
      document.querySelectorAll('[data-pp]').forEach(i => { F.partes = F.partes || {}; F.partes[i.dataset.pp] = toNum(i.value) || 0; });
      document.querySelectorAll('#sheet [data-pv]').forEach(e => { const x = F.pags[+e.dataset.pv]; if (x) x.valor = e.value; });
      document.querySelectorAll('#sheet [data-pvc]').forEach(e => { const x = F.pags[+e.dataset.pvc]; if (x) x.vence = e.value; });
      document.querySelectorAll('#sheet [data-pc]').forEach(e => { const [i, k] = e.dataset.pc.split(':'), x = F.pags[+i]; if (x) { x.cheque = Object.assign({}, x.cheque); x.cheque[k] = e.value; } });
    }
    function bind(pn) {
      const redraw = () => { const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; };
      pn.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
        if (edit && F.tipo === 'venda' && origRoca && (b.dataset.r || null) !== F.rocaId && !confirm('Mudar a roça desta venda refaz a divisão com a parceria de hoje da outra roça (a divisão do dia da venda se perde). Continuar?')) return;
        keep(); F.rocaId = b.dataset.r || null; F.geral = !F.rocaId; if (F.tipo === 'despesa') regra(); if (F.tipo === 'adiantamento') { const ms = meeirosDe(roca(F.rocaId)); F.pessoaId = ms.length === 1 ? ms[0] : null; } redraw(); }));
      pn.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { keep(); F.categoria = b.dataset.cat; regra(); redraw(); }));
      pn.querySelectorAll('[data-pe]').forEach(b => b.addEventListener('click', () => { keep(); F.pessoaId = b.dataset.pe; redraw(); }));
      pn.querySelectorAll('[data-un]').forEach(b => b.addEventListener('click', () => { keep(); F.unidade = F.unidade === b.dataset.un ? null : b.dataset.un; redraw(); }));
      pn.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { keep(); const x = F.pags[0]; if (x && x.forma === b.dataset.pg) F.pags = []; else F.pags = [Object.assign({ vence: '', cheque: {}, aberto: false }, x && x.forma === b.dataset.pg ? x : {}, { forma: b.dataset.pg, valor: '' })]; redraw(); }));
      pn.querySelectorAll('[data-nch]').forEach(b => b.addEventListener('click', () => { keep(); if (!(toNum(F.valor) > 0) && +b.dataset.nch > 1) { $('#fe').textContent = 'Informe o total da venda antes de dividir.'; return; } emPartes(+b.dataset.nch, 'cheque'); redraw(); }));
      const pdv = $('#pdv'); if (pdv) pdv.addEventListener('click', () => { keep(); const x = F.pags[0]; F.pags = [Object.assign({ forma: '', vence: '', cheque: {}, aberto: false }, x || {}, { valor: F.valor || '' }), { forma: '', valor: '', vence: '', cheque: {}, aberto: false }]; F.dividir = true; redraw(); });
      pn.querySelectorAll('[data-pf]').forEach(b => b.addEventListener('click', () => { keep(); const [i, f] = b.dataset.pf.split(':'); F.pags[+i].forma = f; redraw(); }));
      pn.querySelectorAll('[data-pab]').forEach(b => b.addEventListener('click', () => { keep(); F.pags[+b.dataset.pab].aberto = true; redraw(); }));
      pn.querySelectorAll('[data-prm]').forEach(b => b.addEventListener('click', () => { keep(); F.pags.splice(+b.dataset.prm, 1); if (F.pags.length < 2) F.dividir = false; if (F.pags.length === 1) F.pags[0].valor = ''; redraw(); }));
      const pad = $('#pad'); if (pad) pad.addEventListener('click', () => { keep(); const falta = centavos(F.valor) - F.pags.reduce((a, x) => a + centavos(x.valor), 0); const ult = F.pags[F.pags.length - 1]; F.pags.push({ forma: ult && ult.forma === 'cheque' ? 'cheque' : '', valor: falta > 0 ? numIn((falta / 100).toFixed(2)) : '', vence: '', cheque: {}, aberto: false }); redraw(); });
      const pun = $('#pun'); if (pun) pun.addEventListener('click', () => { keep(); const fs = [...new Set(F.pags.map(x => x.forma).filter(Boolean))]; F.pags = fs.length === 1 ? [Object.assign({}, F.pags.find(x => x.forma === fs[0]), { valor: '' })] : []; F.dividir = false; redraw(); });
      pn.querySelectorAll('[data-pv]').forEach(e => e.addEventListener('input', upd));
      pn.querySelectorAll('[data-ve]').forEach(b => b.addEventListener('click', () => { keep(); F.veiculoId = F.veiculoId === b.dataset.ve ? null : b.dataset.ve; redraw(); }));
      pn.querySelectorAll('[data-qp]').forEach(b => b.addEventListener('click', () => {
        keep(); const k = b.dataset.qp, r = roca(F.rocaId);
        if (k === 'meacao') { F.partes = vendaPartes(r); F.qpOutra = false; }
        else if (k === 'outra') { F.qpOutra = true; }
        else { F.partes = { [k]: 100 }; F.qpOutra = false; }
        redraw();
      }));
      ['fq', 'fpr', 'fdi', 'fv'].forEach(id => { const e = document.getElementById(id); if (e) e.addEventListener('input', upd); });
      pn.querySelectorAll('[data-pp]').forEach(i => i.addEventListener('input', upd));
      const fs = $('#fs'); if (fs) fs.addEventListener('click', salvar);
      const fx = $('#fx'); if (fx) fx.addEventListener('click', async () => { if (!confirm('Excluir este lançamento?')) return; fx.disabled = true; if (await post('/api/rural/lanc/excluir', { id: F.id }, 'Lançamento excluído')) { closeSheet(); render(); } else fx.disabled = false; });
    }
    async function salvar() {
      keep();
      const err = m => { $('#fe').textContent = m; };
      const valor = toNum(F.valor);
      if (F.tipo !== 'despesa' && !F.rocaId) return err('Escolha a roça.');
      if (F.tipo === 'despesa' && !F.rocaId && !F.geral) return err('Escolha onde foi o gasto: a roça ou "Geral da fazenda".');
      if (F.tipo === 'despesa' && !F.categoria) return err('Escolha o tipo da despesa.');
      if (F.tipo === 'adiantamento' && !F.pessoaId) return err('Escolha o meeiro.');
      if (!(valor > 0)) return err('Informe o valor.');
      if (F.categoria === 'outros' && !String(F.descricao || '').trim()) return err('Em "Outros", escreva o que foi.');
      if (F.categoria === 'diarista' && String(F.pessoaNome || '').trim().length < 2) return err('Escreva o nome do diarista.');
      if (F.tipo === 'despesa' && !F.rocaId && !M('r_gerais') && !F.veiculoId && F.categoria !== 'salario') return err('Escolha a roça.');
      let partes;
      if (F.tipo === 'despesa' && F.rocaId && meeirosDe(roca(F.rocaId)).length) {
        partes = {}; Object.entries(F.partes || {}).forEach(([k, v]) => { if (Number(v) > 0) partes[k] = Number(v); });
        const soma = Object.values(partes).reduce((a, b) => a + Math.round(b * 100), 0) / 100;
        if (soma !== 100) return err('A divisão precisa somar 100% (agora soma ' + pctTxt(soma) + ').');
      }
      const b = { id: F.id || newId('l'), novo: !edit, tipo: F.tipo, rocaId: F.rocaId || null, data: F.data, valor, categoria: F.categoria || null, descricao: F.descricao || '', qtd: toNum(F.qtd), unidade: F.unidade || null, preco: toNum(F.preco), comprador: F.comprador || '', pessoaId: F.pessoaId || null, pessoaNome: F.pessoaNome || '', dias: toNum(F.dias), veiculoId: F.veiculoId || null, partes };
      if (F.tipo === 'venda') {
        const ps = F.dividir ? F.pags : F.pags.filter(x => x.forma);
        const lista = [];
        for (let i = 0; i < ps.length; i++) {
          const x = ps[i], nm = ps.length > 1 ? 'Parte ' + (i + 1) + ': ' : '';
          if (!x.forma) return err(nm + 'escolha a forma de pagamento.');
          const o = { forma: x.forma };
          if (ps.length > 1) { const v = toNum(x.valor); if (!(v > 0)) return err(nm + 'informe o valor.'); o.valor = r2(v); }
          if (x.forma === 'cheque') { if (!x.vence) return err(nm + 'informe a data de vencimento do cheque.'); o.vence = x.vence; o.cheque = x.cheque || {}; }
          if (x.forma === 'prazo' && x.vence) o.vence = x.vence;
          lista.push(o);
        }
        if (lista.length > 1) { const d = Math.round(valor * 100) - lista.reduce((a, o) => a + Math.round(o.valor * 100), 0); if (d) return err(d > 0 ? 'Falta ' + money(d / 100) + ' nas partes do pagamento.' : 'As partes passaram ' + money(-d / 100) + ' do total.'); }
        b.pagamentos = lista;
      }
      F.id = b.id; // tocar duas vezes não lança duas vezes
      const bt = $('#fs'); bt.disabled = true;
      try { await api('/api/rural/lanc', b); await reload(); closeSheet(); toast((edit ? 'Correção salva: ' : 'Lançado ✓ ') + money(valor)); render(); }
      catch (e) { bt.disabled = false; if (e.status === 401 || e.login) { const keepF = Object.assign({}, F, { valor: numIn(valor) }); retomar = () => formLanc(keepF); return fail(e); } err(e.message); }
    }
    draw();
  }

  function formSalarios(rocaId) {
    const fs = S.pessoas.filter(p => p.tipo === 'funcionario' && p.ativo && (!rocaId || p.rocaId === rocaId));
    const d = new Date(), ref = MESES[d.getMonth()] + '/' + d.getFullYear();
    const mes = hoje().slice(0, 7);
    const pago = p => S.lanc.some(l => l.tipo === 'despesa' && l.categoria === 'salario' && l.pessoaId === p.id && String(l.data).slice(0, 7) === mes);
    const sel = Object.fromEntries(fs.map(p => [p.id, { on: !pago(p), valor: numIn(p.salario || ''), id: newId('l') }]));
    openSheet('Pagar salários', `<p class="small muted">Cada salário vira uma despesa na roça do funcionário (ou geral, se ele não for de uma roça só).</p>
      <div class="list">${fs.map(p => `<div class="it"><input type="checkbox" data-on="${esc(p.id)}" ${sel[p.id].on ? 'checked' : ''} aria-label="Pagar ${esc(p.nome)}" style="width:26px;height:26px;accent-color:var(--brand)"><span class="tx"><b>${esc(p.nome)}</b><span>${esc(p.rocaId ? (roca(p.rocaId) || {}).nome || '' : 'Geral')}</span>${pago(p) ? '<span class="neg" style="display:block;font-weight:700">Já recebeu salário este mês</span>' : ''}</span><input inputmode="decimal" data-val="${esc(p.id)}" value="${esc(sel[p.id].valor)}" style="max-width:130px;text-align:right;font-weight:700" aria-label="Salário de ${esc(p.nome)}"></div>`).join('')}</div>
      <div class="grid2"><div class="field"><label for="sd">Data do pagamento</label><input type="date" id="sd" value="${hoje()}" max="${hoje()}"></div><div class="field"><label for="sr">Referência</label><input type="text" id="sr" maxlength="40" value="${esc(ref)}"></div></div>
      <p class="neg small" id="se" role="alert" style="font-weight:600;min-height:16px"></p>
      <button class="btn pri full" type="button" id="ss">Lançar salários</button>`, pn => {
      $('#ss').addEventListener('click', async () => {
        const lista = [];
        for (const p of fs) {
          if (!pn.querySelector('[data-on="' + p.id + '"]').checked) continue;
          const v = toNum(pn.querySelector('[data-val="' + p.id + '"]').value);
          if (!(v > 0)) { $('#se').textContent = 'Informe o salário de ' + p.nome + '.'; return; }
          lista.push({ id: sel[p.id].id, pessoaId: p.id, valor: v });
        }
        if (!lista.length) { $('#se').textContent = 'Marque quem vai receber.'; return; }
        const bt = $('#ss'); bt.disabled = true;
        try { const r = await api('/api/rural/salarios', { lista, data: $('#sd').value, referencia: $('#sr').value }); await reload(); closeSheet(); toast(r.n + ' salário(s) lançado(s)'); render(); }
        catch (e) { bt.disabled = false; if (e.status === 401) return fail(e); $('#se').textContent = e.message; }
      });
    });
  }

  /* ---------- acerto ---------- */
  async function vAcerto() {
    const [rid, pid] = String(arg || '').split('/'); const r = roca(rid);
    if (!r) return go('inicio');
    $('#main').innerHTML = '<p class="muted">Calculando o acerto…</p>';
    let P; try { P = await api('/api/rural/acerto/previa?roca=' + encodeURIComponent(rid) + '&pessoa=' + encodeURIComponent(pid)); } catch (e) { fail(e); return go('roca', rid); }
    if (view !== 'acerto') return;
    const t = P.totais, nm = P.pessoaNome;
    const grp = (tipo, tit) => { const it = P.itens.filter(i => i.tipo === tipo); return it.length ? `<section class="card"><h3>${tit}</h3><div class="scroll"><table><thead><tr><th>Data</th><th>O quê</th>${tipo !== 'adiantamento' ? '<th class="n">Total</th><th class="n">%</th>' : ''}<th class="n">${esc(nm)}</th></tr></thead><tbody>
      ${it.map(i => `<tr><td>${dBR(i.data)}</td><td>${esc(i.tipo === 'venda' ? [i.qtd ? numIn(i.qtd) + ' ' + (i.unidade || '') : '', i.comprador].filter(Boolean).join(' · ') || 'Venda' : i.tipo === 'despesa' ? cat(i.categoria).nome + (i.descricao ? ' · ' + i.descricao : '') : i.descricao || 'Adiantamento')}</td>${tipo !== 'adiantamento' ? `<td class="n">${money(i.valor)}</td><td class="n">${pctTxt(i.pct)}</td>` : ''}<td class="n">${money(i.valorPessoa)}</td></tr>`).join('')}
      </tbody></table></div></section>` : ''; };
    $('#main').innerHTML = `<div class="row noprint"><button class="btn sm" type="button" id="bk">← ${esc(r.nome)}</button></div>
      <div><h1>Acerto com ${esc(nm)}</h1><p class="muted small">${esc(r.nome)} · tudo o que ainda não foi acertado · ${dBR(hoje())}</p></div>
      ${P.itens.length ? `
      <section class="card"><table><tbody>
        <tr><td>Vendas da roça no período do acerto</td><td class="n">${money(t.vendas)}</td></tr>
        <tr><td><b>Parte de ${esc(nm)} nas vendas</b></td><td class="n pos"><b>+ ${money(t.parte)}</b></td></tr>
        <tr><td>Despesas por conta de ${esc(nm)}</td><td class="n neg">− ${money(t.despesas)}</td></tr>
        <tr><td>Adiantamentos já recebidos</td><td class="n neg">− ${money(t.adiantamentos)}</td></tr>
        <tr class="tot"><td>Saldo</td><td class="n">${money(t.saldo)}</td></tr></tbody></table>
        <div class="saldo ${t.saldo > 0 ? 'p' : t.saldo < 0 ? 'n' : 'z'}"><b>${money(Math.abs(t.saldo))}</b><span>${t.saldo > 0 ? esc(DONO()) + ' paga para ' + esc(nm) : t.saldo < 0 ? esc(nm) + ' deve para ' + esc(DONO()) : 'Ninguém deve nada'}</span></div></section>
      ${grp('venda', 'Vendas')}${grp('despesa', 'Despesas de ' + esc(nm))}${grp('adiantamento', 'Adiantamentos')}
      <section class="card noprint"><div class="field"><label for="ao">Observação (opcional)</label><input type="text" id="ao" maxlength="300" placeholder="Ex.: pago em dinheiro"></div>
        <p class="small muted">Depois de confirmar, esses lançamentos ficam marcados como acertados e não entram de novo no próximo acerto.</p>
        <button class="btn pri full" type="button" id="ac">Confirmar o acerto</button><button class="btn full" type="button" id="pr">Imprimir / salvar PDF</button></section>` : '<div class="card"><p class="ok">Não há nada em aberto com ' + esc(nm) + ' nesta roça.</p></div>'}
      <p class="tino">${esc(DONO())} · Tino</p>`;
    $('#bk').addEventListener('click', () => { rocaTab = 'meeiros'; go('roca', rid); });
    const pr = $('#pr'); if (pr) pr.addEventListener('click', () => window.print());
    const ac = $('#ac'); if (ac) ac.addEventListener('click', async () => {
      if (!confirm('Confirmar o acerto com ' + nm + '? ' + (t.saldo > 0 ? DONO() + ' paga ' + money(t.saldo) : t.saldo < 0 ? nm + ' deve ' + money(-t.saldo) : 'Saldo zerado') + '.')) return;
      ac.disabled = true;
      try {
        const res = await api('/api/rural/acerto', { rocaId: rid, pessoaId: pid, assinatura: P.assinatura, obs: $('#ao').value, data: hoje() });
        await reload(); toast('Acerto nº ' + res.numero + ' feito'); rocaTab = 'meeiros'; go('roca', rid);
      } catch (e) { ac.disabled = false; if (e.status === 409) { toast(e.message, true); return vAcerto(); } fail(e); }
    });
  }

  /* ---------- nova roça / editar (passo a passo) ---------- */
  function wizard(r0) {
    const W = r0 ? { id: r0.id, nome: r0.nome, icone: r0.icone || '', iconeMao: !!r0.icone, cultura: r0.cultura || '', local: r0.local || '', area: r0.area || '', inicio: r0.inicio || '', modo: r0.modo, parceria: Object.assign({}, r0.parceria), regras: JSON.parse(JSON.stringify(r0.regras || {})), obs: r0.obs || '', ativa: r0.ativa, novos: [], func: S.pessoas.filter(p => p.tipo === 'funcionario' && p.rocaId === r0.id).map(p => p.id), novosF: [], step: 0 }
      : { id: newId('r'), nome: '', icone: '', cultura: '', local: '', area: '', inicio: hoje(), modo: M('r_meeiros') ? '' : 'funcionarios', parceria: {}, regras: {}, obs: '', ativa: true, novos: [], func: [], novosF: [], step: 0 };
    const CULT = (S.culturas || []).filter(c => c.nome !== 'Outra');
    const temMeeiro = () => W.modo === 'meeiro' || W.modo === 'misto';
    const temFunc = () => (W.modo === 'funcionarios' || W.modo === 'misto') && M('r_funcionarios');
    const steps = () => ['dados', 'modo'].concat(temMeeiro() ? ['meeiros', 'regras'] : []).concat(temFunc() ? ['equipe'] : []).concat(['revisar']);
    const meeiroNome = k => (W.novos.find(n => n.id === k) || pessoa(k) || {}).nome || 'Meeiro';
    const soma = () => r2(Object.values(W.parceria).reduce((a, b) => a + Number(b || 0), 0));
    const nomeK = k => k === 'dono' ? DONO() : meeiroNome(k);
    const vpW = () => { const o = {}; Object.keys(W.parceria).forEach(k => { o[k] = Number(W.parceria[k]); }); const d = r2(100 - soma()); if (d > 0) o.dono = d; return o; };
    function draw() {
      const st = steps(), k = st[W.step];
      let h = `<div class="steps" aria-label="Passo ${W.step + 1} de ${st.length}">${st.map((_, i) => `<i class="${i <= W.step ? 'on' : ''}"></i>`).join('')}</div>`;
      if (k === 'dados') h += `<div class="field"><label for="wn">Nome da roça</label><input type="text" id="wn" maxlength="60" value="${esc(W.nome)}" placeholder="Ex.: Banana do Córrego"></div>
        <div class="field"><span class="lbl">O que vai plantar / criar?</span><div class="chips">${CULT.map(c => `<button type="button" class="chip" data-cu="${esc(c.nome)}" aria-pressed="${W.cultura === c.nome}">${c.icone} ${esc(c.nome)}</button>`).join('')}</div><input type="text" id="wc" maxlength="40" value="${esc(W.cultura)}" placeholder="Ou escreva aqui"></div>
        <div class="field"><span class="lbl">Cara da roça</span><div class="row" style="flex-wrap:nowrap">${tile(W, true)}<span class="small muted">${W.iconeMao ? 'Ícone escolhido por você.' : 'O ícone vem da cultura. Toque em outro, se quiser.'}</span></div>
          <div class="icgrid" role="group" aria-label="Escolher ícone">${(S.culturas || []).map(c => `<button type="button" data-ic="${esc(c.icone)}" aria-pressed="${visual(W).icone === c.icone}" aria-label="${esc(c.nome)}" style="border-color:${c.cor}55">${c.icone}</button>`).join('')}</div></div>
        <div class="field"><label for="wl">Onde fica</label><input type="text" id="wl" maxlength="80" value="${esc(W.local)}" placeholder="Ex.: Sítio São José, Minas Gerais"></div>
        <div class="grid2"><div class="field"><label for="wa">Tamanho (opcional)</label><input type="text" id="wa" maxlength="40" value="${esc(W.area)}" placeholder="Ex.: 5 hectares, 3 mil pés"></div><div class="field"><label for="wi">Começou em</label><input type="date" id="wi" value="${esc(W.inicio)}"></div></div>`;
      if (k === 'modo') h += `<p>Quem toca esta roça?</p><div class="modo">
        ${M('r_meeiros') ? `<button type="button" data-mo="meeiro" aria-pressed="${W.modo === 'meeiro'}"><i>🤝</i><span><b>Meeiro</b><span>Um parceiro toca e ganha uma porcentagem do que for vendido</span></span></button>` : ''}
        <button type="button" data-mo="funcionarios" aria-pressed="${W.modo === 'funcionarios'}"><i>👷</i><span><b>Só funcionários</b><span>Gente que ganha por mês ou por dia; o resultado é todo de ${esc(DONO())}</span></span></button>
        ${M('r_meeiros') ? `<button type="button" data-mo="misto" aria-pressed="${W.modo === 'misto'}"><i>🤝👷</i><span><b>Meeiro e funcionários</b><span>Tem parceiro e também funcionário fixo</span></span></button>` : ''}</div>`;
      if (k === 'meeiros') {
        const lista = S.pessoas.filter(p => p.tipo === 'meeiro' && (p.ativo || W.parceria[p.id])).concat(W.novos);
        const d = r2(100 - soma());
        h += `<p>Marque os meeiros desta roça e arraste a barrinha com a porcentagem de cada um <b>sobre o valor vendido</b>.</p>
          <div class="chips">${lista.map(p => `<button type="button" class="chip" data-me="${esc(p.id)}" aria-pressed="${W.parceria[p.id] != null}">${esc(p.nome)}</button>`).join('')}</div>
          <div class="row"><input type="text" id="wmn" maxlength="80" placeholder="Nome do meeiro novo" style="flex:1 1 180px"><input type="tel" id="wmt" maxlength="30" placeholder="Telefone (opcional)" style="flex:1 1 140px"><button class="btn" type="button" id="wma">+ Adicionar</button></div>
          ${Object.keys(W.parceria).map(pid => `<div class="card" style="padding:12px;gap:6px"><b>${esc(meeiroNome(pid))}</b><div class="pct"><input type="range" min="1" max="100" step="1" value="${Number(W.parceria[pid])}" data-sl="${esc(pid)}" aria-label="Porcentagem de ${esc(meeiroNome(pid))}"><div class="n"><input inputmode="decimal" data-pn="${esc(pid)}" value="${numIn(W.parceria[pid])}" aria-label="Porcentagem de ${esc(meeiroNome(pid))}"></div></div></div>`).join('')}
          ${Object.keys(W.parceria).length ? `<div class="split">${[['dono', d]].concat(Object.entries(W.parceria)).filter(x => x[1] > 0).map(([kk, v]) => `<div style="flex:${v}">${esc(nomeK(kk))} ${pctTxt(v)}</div>`).join('')}</div>
            ${d < 0 ? '<p class="warn">Os meeiros passam de 100%. Diminua alguma porcentagem.</p>' : `<p class="small muted">${esc(DONO())} fica com ${pctTxt(d)} do valor vendido.</p>`}` : ''}`;
      }
      if (k === 'regras') {
        const ks = ['dono'].concat(Object.keys(W.parceria)), vp = vpW();
        const modoR = c => { const p = W.regras[c] || { dono: 100 }, sel = Object.keys(p).filter(x => p[x] > 0); if (W['outra_' + c]) return 'outra'; if (sel.length === 1) return sel[0]; if (sel.length === Object.keys(vp).length && sel.every(x => Math.abs((vp[x] || 0) - p[x]) < 0.01)) return 'meacao'; return 'outra'; };
        h += `<p>Quem paga cada tipo de despesa nesta roça? Isso já vem marcado na hora de lançar (dá para mudar em cada compra).</p>
          <div class="chips"><button type="button" class="btn sm" id="wtd">Tudo por conta de ${esc(DONO())}</button><button type="button" class="btn sm" id="wtm">Tudo dividido igual à meação</button></div>
          <div class="card" style="gap:0">${S.cats.map(c => { const m = modoR(c.id), p = W.regras[c.id] || { dono: 100 }; return `<div class="rule"><b>${c.icone} ${esc(c.nome)}</b><div class="chips">${ks.map(x => `<button type="button" class="chip" data-rg="${c.id}|${esc(x)}" aria-pressed="${m === x}">${esc(nomeK(x))}</button>`).join('')}<button type="button" class="chip" data-rg="${c.id}|meacao" aria-pressed="${m === 'meacao'}">Meação</button><button type="button" class="chip" data-rg="${c.id}|outra" aria-pressed="${m === 'outra'}">Outra</button></div>
            ${m === 'outra' ? `<div style="display:grid;gap:6px">${ks.map(x => `<div class="pct"><span>${esc(nomeK(x))}</span><div class="n"><input inputmode="decimal" data-rp="${c.id}|${esc(x)}" value="${numIn(p[x] || 0)}"></div></div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
      }
      if (k === 'equipe') {
        const lista = S.pessoas.filter(p => p.tipo === 'funcionario' && p.ativo);
        h += `<p>Quem são os funcionários fixos desta roça? (pode deixar para depois)</p>
          ${lista.length ? `<div class="chips">${lista.map(p => `<button type="button" class="chip" data-fu="${esc(p.id)}" aria-pressed="${W.func.includes(p.id)}">${esc(p.nome)}${p.rocaId && p.rocaId !== W.id ? ' · ' + esc((roca(p.rocaId) || {}).nome || '') : ''}</button>`).join('')}</div>` : ''}
          ${W.novosF.map(f => `<p class="small">➕ ${esc(f.nome)}${f.salario ? ' · ' + money(f.salario) + ' por mês' : ''}</p>`).join('')}
          <div class="row"><input type="text" id="wfn" maxlength="80" placeholder="Nome do funcionário novo" style="flex:1 1 180px"><input inputmode="decimal" id="wfs" placeholder="Salário (R$)" style="flex:1 1 120px"><button class="btn" type="button" id="wfa">+ Adicionar</button></div>`;
      }
      if (k === 'revisar') {
        const ms = Object.keys(W.parceria);
        h += `<section class="card"><div class="row" style="flex-wrap:nowrap">${tile(W, true)}<h2>${esc(W.nome)}</h2></div><p class="small muted">${esc([W.cultura, W.local, W.area].filter(Boolean).join(' · '))}</p><p>${esc(modoTxt(W.modo))}</p>
          ${ms.length ? `<div class="split">${Object.entries(vpW()).sort((a) => (a[0] === 'dono' ? -1 : 1)).map(([kk, v]) => `<div style="flex:${v}">${esc(nomeK(kk))} ${pctTxt(v)}</div>`).join('')}</div>` : ''}
          ${temFunc() ? `<p class="small">Funcionários: ${esc(W.func.map(id => (pessoa(id) || {}).nome).concat(W.novosF.map(f => f.nome)).filter(Boolean).join(', ') || 'nenhum por enquanto')}</p>` : ''}</section>
          <div class="field"><label for="wo">Observação (opcional)</label><input type="text" id="wo" maxlength="300" value="${esc(W.obs)}"></div>`;
      }
      h += `<p class="neg small" id="we" role="alert" style="font-weight:600;min-height:16px"></p><div class="grid2">${W.step ? '<button class="btn" type="button" id="wb">← Voltar</button>' : '<span></span>'}<button class="btn ${k === 'revisar' ? 'gold' : 'pri'}" type="button" id="wf">${k === 'revisar' ? (r0 ? 'Salvar a roça' : 'Criar a roça') : 'Continuar →'}</button></div>`;
      openSheet(r0 ? 'Editar roça' : 'Nova roça', h, bind);
    }
    function keep() {
      const v = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
      if (v('wn') !== undefined) W.nome = v('wn');
      if (v('wc') !== undefined) W.cultura = v('wc');
      if (v('wl') !== undefined) W.local = v('wl');
      if (v('wa') !== undefined) W.area = v('wa');
      if (v('wi') !== undefined) W.inicio = v('wi');
      if (v('wo') !== undefined) W.obs = v('wo');
      document.querySelectorAll('[data-pn]').forEach(i => { const n = toNum(i.value); if (n > 0) W.parceria[i.dataset.pn] = Math.min(100, n); });
      document.querySelectorAll('[data-rp]').forEach(i => { const [c, kk] = i.dataset.rp.split('|'); W.regras[c] = W.regras[c] || {}; W.regras[c][kk] = toNum(i.value) || 0; });
    }
    function bind(pn) {
      const redraw = () => { const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; };
      const err = m => { $('#we').textContent = m; };
      pn.querySelectorAll('[data-cu]').forEach(b => b.addEventListener('click', () => { keep(); W.cultura = W.cultura === b.dataset.cu ? '' : b.dataset.cu; if (!W.iconeMao) W.icone = ''; redraw(); }));
      pn.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => { keep(); W.icone = b.dataset.ic; W.iconeMao = true; redraw(); }));
      const wc = $('#wc'); if (wc) wc.addEventListener('change', () => { keep(); redraw(); });
      pn.querySelectorAll('[data-mo]').forEach(b => b.addEventListener('click', () => { keep(); W.modo = b.dataset.mo; if (W.modo === 'funcionarios') { W.parceria = {}; W.regras = {}; } redraw(); }));
      pn.querySelectorAll('[data-me]').forEach(b => b.addEventListener('click', () => { keep(); const k = b.dataset.me; if (W.parceria[k] != null) delete W.parceria[k]; else W.parceria[k] = Math.max(1, Math.min(50, r2(100 - soma()))); redraw(); }));
      pn.querySelectorAll('[data-sl]').forEach(s => { s.addEventListener('input', () => { W.parceria[s.dataset.sl] = Number(s.value); const n = pn.querySelector('[data-pn="' + s.dataset.sl + '"]'); if (n) n.value = s.value; }); s.addEventListener('change', () => { keep(); redraw(); }); });
      pn.querySelectorAll('[data-pn]').forEach(i => i.addEventListener('input', () => { const n = toNum(i.value); if (n > 0) { W.parceria[i.dataset.pn] = Math.min(100, n); const sl = pn.querySelector('[data-sl="' + i.dataset.pn + '"]'); if (sl) sl.value = W.parceria[i.dataset.pn]; } }));
      pn.querySelectorAll('[data-pn]').forEach(i => i.addEventListener('blur', () => setTimeout(() => { if (document.body.contains(i) && (!pn.contains(document.activeElement) || !document.activeElement.matches('input'))) { keep(); redraw(); } }, 150)));
      const wma = $('#wma'); if (wma) wma.addEventListener('click', () => { keep(); const n = $('#wmn').value.trim(); if (n.length < 2) return err('Escreva o nome do meeiro.'); const id = newId('p'); W.novos.push({ id, nome: n, telefone: $('#wmt').value.trim() }); W.parceria[id] = Math.max(1, Math.min(50, r2(100 - soma()))); redraw(); });
      pn.querySelectorAll('[data-rg]').forEach(b => b.addEventListener('click', () => {
        keep(); const [c, m] = b.dataset.rg.split('|'); delete W['outra_' + c];
        if (m === 'meacao') W.regras[c] = vpW(); else if (m === 'outra') { W['outra_' + c] = true; W.regras[c] = W.regras[c] || { dono: 100 }; } else W.regras[c] = { [m]: 100 };
        redraw();
      }));
      pn.querySelectorAll('[data-rp]').forEach(i => i.addEventListener('input', keep));
      const wtd = $('#wtd'); if (wtd) wtd.addEventListener('click', () => { keep(); S.cats.forEach(c => { W.regras[c.id] = { dono: 100 }; delete W['outra_' + c.id]; }); redraw(); });
      const wtm = $('#wtm'); if (wtm) wtm.addEventListener('click', () => { keep(); S.cats.forEach(c => { W.regras[c.id] = vpW(); delete W['outra_' + c.id]; }); redraw(); });
      pn.querySelectorAll('[data-fu]').forEach(b => b.addEventListener('click', () => { keep(); const k = b.dataset.fu; W.func = W.func.includes(k) ? W.func.filter(x => x !== k) : W.func.concat(k); redraw(); }));
      const wfa = $('#wfa'); if (wfa) wfa.addEventListener('click', () => { keep(); const n = $('#wfn').value.trim(); if (n.length < 2) return err('Escreva o nome do funcionário.'); W.novosF.push({ id: newId('p'), nome: n, salario: toNum($('#wfs').value) || null }); redraw(); });
      const wb = $('#wb'); if (wb) wb.addEventListener('click', () => { keep(); W.step--; draw(); });
      $('#wf').addEventListener('click', async () => {
        keep(); const st = steps(), k = st[W.step];
        if (k === 'dados' && W.nome.trim().length < 2) return err('Dê um nome para a roça.');
        if (k === 'modo' && !W.modo) return err('Escolha quem toca a roça.');
        if (k === 'meeiros') { if (!Object.keys(W.parceria).length) return err('Marque pelo menos um meeiro.'); if (soma() > 100) return err('Os meeiros passam de 100%.'); }
        if (k === 'regras') { for (const c of S.cats) { const p = W.regras[c.id]; if (!p) continue; const s = Object.values(p).reduce((a, b) => a + Math.round(Number(b || 0) * 100), 0); if (s !== 10000) return err(c.nome + ': a divisão precisa somar 100%.'); } }
        if (k !== 'revisar') { W.step++; return draw(); }
        // grava: meeiros e funcionários novos, a roça e quem é da equipe
        const bt = $('#wf'); bt.disabled = true;
        try {
          for (const n of W.novos) if (W.parceria[n.id] != null) await api('/api/rural/pessoa', { id: n.id, tipo: 'meeiro', nome: n.nome, telefone: n.telefone });
          const regras = {}; if (temMeeiro()) Object.entries(W.regras).forEach(([c, p]) => { const o = {}; Object.entries(p).forEach(([kk, v]) => { if (Number(v) > 0 && (kk === 'dono' || W.parceria[kk] != null)) o[kk] = Number(v); }); if (Object.keys(o).length) regras[c] = o; });
          await api('/api/rural/roca', { id: W.id, nome: W.nome, icone: W.iconeMao ? W.icone : (visual(W).icone || null), cultura: W.cultura, local: W.local, area: W.area, inicio: W.inicio || null, modo: W.modo, parceria: temMeeiro() ? W.parceria : {}, regras, obs: W.obs, ativa: W.ativa });
          if (temFunc()) {
            for (const f of W.novosF) await api('/api/rural/pessoa', { id: f.id, tipo: 'funcionario', nome: f.nome, salario: f.salario, rocaId: W.id });
            for (const p of S.pessoas.filter(x => x.tipo === 'funcionario')) {
              const quer = W.func.includes(p.id);
              if (quer && p.rocaId !== W.id) await api('/api/rural/pessoa', Object.assign({}, p, { rocaId: W.id }));
              if (!quer && p.rocaId === W.id) await api('/api/rural/pessoa', Object.assign({}, p, { rocaId: null }));
            }
          }
          await reload(); closeSheet(); toast(r0 ? 'Roça salva' : 'Roça criada 🌱'); rocaTab = 'resumo'; go('roca', W.id);
        } catch (e) { bt.disabled = false; if (e.status === 401) return fail(e); err(e.message); }
      });
    }
    draw();
  }

  /* ---------- cadastros ---------- */
  function vPessoas() {
    const tabs = [].concat(M('r_meeiros') ? [['meeiro', 'Meeiros']] : []).concat(M('r_funcionarios') ? [['funcionario', 'Funcionários']] : []).concat(M('r_veiculos') ? [['veiculo', 'Veículos e máquinas']] : []);
    if (!tabs.length) { $('#main').innerHTML = '<h1>Cadastros</h1><div class="card"><p class="muted">Nenhum cadastro ligado para esta empresa.</p></div>'; return; }
    if (!tabs.some(t => t[0] === pesTab)) pesTab = tabs[0][0];
    let list = '';
    if (pesTab === 'veiculo') list = S.veiculos.map(v => `<button type="button" class="it" data-ve="${esc(v.id)}"><span class="ic">🚜</span><span class="tx"><b>${esc(v.nome)}</b><span>${esc([v.tipo, v.placa, v.ativo ? '' : 'inativo'].filter(Boolean).join(' · '))}</span></span><span class="vl neg">${money(S.lanc.filter(l => l.veiculoId === v.id && noPeriodo(l)).reduce((a, l) => a + l.valor, 0))}<small>gasto ${esc(periodo().nome)}</small></span></button>`).join('');
    else list = S.pessoas.filter(p => p.tipo === pesTab).map(p => `<button type="button" class="it" data-pes="${esc(p.id)}"><span class="ic">${p.tipo === 'meeiro' ? '🤝' : '👷'}</span><span class="tx"><b>${esc(p.nome)}</b><span>${esc([p.telefone, p.tipo === 'funcionario' ? (p.rocaId ? (roca(p.rocaId) || {}).nome : 'Geral') : S.rocas.filter(r => r.parceria[p.id]).map(r => r.nome + ' ' + pctTxt(r.parceria[p.id])).join(', '), p.ativo ? '' : 'inativo'].filter(Boolean).join(' · '))}</span></span>${p.tipo === 'funcionario' && p.salario ? `<span class="vl">${money(p.salario)}<small>por mês</small></span>` : ''}</button>`).join('');
    $('#main').innerHTML = `<h1>Cadastros</h1><div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-pt="${k}" aria-selected="${pesTab === k}">${n}</button>`).join('')}</div>
      ${pesTab === 'veiculo' ? perChips() : ''}
      <section class="card">${list ? `<div class="list">${list}</div>` : '<p class="muted">Nada cadastrado ainda.</p>'}</section>
      <button class="btn gold full" type="button" id="np">+ ${pesTab === 'meeiro' ? 'Novo meeiro' : pesTab === 'funcionario' ? 'Novo funcionário' : 'Novo veículo ou máquina'}</button>`;
    document.querySelectorAll('[data-pt]').forEach(b => b.addEventListener('click', () => { pesTab = b.dataset.pt; render(); }));
    bindPer();
    document.querySelectorAll('[data-pes]').forEach(b => b.addEventListener('click', () => formPessoa(pessoa(b.dataset.pes))));
    document.querySelectorAll('[data-ve]').forEach(b => b.addEventListener('click', () => formVeiculo(S.veiculos.find(v => v.id === b.dataset.ve))));
    $('#np').addEventListener('click', () => pesTab === 'veiculo' ? formVeiculo(null) : formPessoa({ tipo: pesTab }));
  }
  function formPessoa(p0) {
    const p = Object.assign({ id: newId('p'), ativo: true }, p0 || {}), edit = S.pessoas.some(x => x.id === p.id), func = p.tipo === 'funcionario';
    openSheet((edit ? 'Editar ' : 'Novo ') + (func ? 'funcionário' : 'meeiro'), `
      <div class="field"><label for="pn">Nome</label><input type="text" id="pn" maxlength="80" value="${esc(p.nome || '')}"></div>
      <div class="grid2"><div class="field"><label for="pt">Telefone</label><input type="tel" id="pt" maxlength="30" value="${esc(p.telefone || '')}"></div><div class="field"><label for="pd">CPF (opcional)</label><input type="text" id="pd" maxlength="20" inputmode="numeric" value="${esc(p.documento || '')}"></div></div>
      ${func ? `<div class="grid2"><div class="field"><label for="ps">Salário por mês (R$)</label><input inputmode="decimal" id="ps" value="${esc(numIn(p.salario))}"></div><div class="field"><label for="pr">Trabalha em</label><select id="pr"><option value="">Geral (várias roças)</option>${S.rocas.filter(r => r.ativa || r.id === p.rocaId).map(r => `<option value="${esc(r.id)}" ${p.rocaId === r.id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></div></div>` : '<p class="small muted">A porcentagem do meeiro se marca em cada roça (pode ser diferente em cada uma).</p>'}
      <div class="field"><label for="po">Observação</label><input type="text" id="po" maxlength="300" value="${esc(p.obs || '')}"></div>
      ${edit ? `<label class="row"><input type="checkbox" id="pa" ${p.ativo ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> Ativo</label>` : ''}
      <p class="neg small" id="pe" role="alert" style="font-weight:600;min-height:16px"></p>
      <button class="btn pri full" type="button" id="psv">Salvar</button>`, () => {
      $('#psv').addEventListener('click', async () => {
        const b = { id: p.id, tipo: p.tipo, nome: $('#pn').value, telefone: $('#pt').value, documento: $('#pd').value, obs: $('#po').value, ativo: $('#pa') ? $('#pa').checked : true };
        if (func) { b.salario = toNum($('#ps').value); b.rocaId = $('#pr').value || null; if (Number.isNaN(b.salario)) { $('#pe').textContent = 'Salário inválido.'; return; } }
        if (String(b.nome).trim().length < 2) { $('#pe').textContent = 'Escreva o nome.'; return; }
        const bt = $('#psv'); bt.disabled = true;
        try { await api('/api/rural/pessoa', b); await reload(); closeSheet(); toast('Salvo'); render(); } catch (e) { bt.disabled = false; if (e.status === 401) return fail(e); $('#pe').textContent = e.message; }
      });
    });
  }
  /* cheques que ainda vão vencer (e os vencidos nos últimos 7 dias), do mais perto para o mais longe */
  function chequesHtml() {
    const h = hoje(), d7 = new Date(h + 'T12:00:00Z'); d7.setUTCDate(d7.getUTCDate() - 7); const lim = d7.toISOString().slice(0, 10);
    const cs = [];
    S.lanc.forEach(l => { if (l.tipo !== 'venda') return; const ps = pagsDe(l), chs = ps.filter(x => x.forma === 'cheque'); chs.forEach((x, k) => { if (x.vence && x.vence >= lim) cs.push({ l, x, k, n: chs.length }); }); });
    cs.sort((a, b) => a.x.vence < b.x.vence ? -1 : a.x.vence > b.x.vence ? 1 : 0);
    if (!cs.length) return '';
    const tot = r2(cs.filter(c => c.x.vence >= h).reduce((a, c) => a + Number(c.x.valor), 0));
    return `<section class="card"><div class="between"><h2>Cheques a vencer</h2><b class="pos">${money(tot)}</b></div><div class="list">${cs.slice(0, 8).map(({ l, x, k, n }) => { const venc = x.vence < h, hj = x.vence === h, ch = x.cheque || {}; return `<button type="button" class="it" data-lc="${esc(l.id)}"><span class="ic">🧾</span><span class="tx"><b>${hj ? 'Vence hoje' : (venc ? 'Venceu ' : 'Vence ') + dBR(x.vence)}</b><span>${esc([n > 1 ? 'cheque ' + (k + 1) + ' de ' + n : '', ch.emitente || l.comprador, (roca(l.rocaId) || {}).nome, ch.banco, ch.numero && 'nº ' + ch.numero].filter(Boolean).join(' · '))}</span></span><span class="vl ${venc ? 'neg' : 'pos'}">${money(x.valor)}</span></button>`; }).join('')}</div>${cs.length > 8 ? `<p class="small muted">E mais ${cs.length - 8} cheque(s).</p>` : ''}</section>`;
  }
  function formVeiculo(v0) {
    const v = Object.assign({ id: newId('v'), ativo: true }, v0 || {}), edit = !!v0;
    const TIPOS = ['Carro', 'Caminhonete', 'Caminhão', 'Trator', 'Moto', 'Roçadeira', 'Bomba', 'Outro'];
    openSheet(edit ? 'Editar veículo ou máquina' : 'Novo veículo ou máquina', `
      <div class="field"><label for="vn">Nome</label><input type="text" id="vn" maxlength="60" value="${esc(v.nome || '')}" placeholder="Ex.: Trator Massey, Hilux"></div>
      <div class="field"><span class="lbl">Tipo</span><div class="chips">${TIPOS.map(t => `<button type="button" class="chip" data-vt="${t}" aria-pressed="${v.tipo === t}">${t}</button>`).join('')}</div></div>
      <div class="field"><label for="vp">Placa (opcional)</label><input type="text" id="vp" maxlength="10" value="${esc(v.placa || '')}" autocapitalize="characters"></div>
      ${edit ? `<label class="row"><input type="checkbox" id="va" ${v.ativo ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> Ativo</label>` : ''}
      <p class="small muted">Os gastos do veículo (combustível, peças, manutenção) entram como gasto geral, ou na roça que você escolher na hora de lançar.</p>
      <p class="neg small" id="ve" role="alert" style="font-weight:600;min-height:16px"></p>
      <button class="btn pri full" type="button" id="vsv">Salvar</button>`, pn => {
      pn.querySelectorAll('[data-vt]').forEach(b => b.addEventListener('click', () => { v.tipo = v.tipo === b.dataset.vt ? null : b.dataset.vt; pn.querySelectorAll('[data-vt]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.vt === v.tipo))); }));
      $('#vsv').addEventListener('click', async () => {
        const b = { id: v.id, nome: $('#vn').value, tipo: v.tipo || '', placa: $('#vp').value, ativo: $('#va') ? $('#va').checked : true };
        if (String(b.nome).trim().length < 2) { $('#ve').textContent = 'Escreva o nome.'; return; }
        const bt = $('#vsv'); bt.disabled = true;
        try { await api('/api/rural/veiculo', b); await reload(); closeSheet(); toast('Salvo'); render(); } catch (e) { bt.disabled = false; if (e.status === 401) return fail(e); $('#ve').textContent = e.message; }
      });
    });
  }

  /* ---------- relatório ---------- */
  function pagRel(base) {
    const vs = base.filter(l => l.tipo === 'venda'); if (!vs.length) return '';
    const t = {}; vs.forEach(l => { const ps = pagsDe(l).filter(x => pagDe(x.forma)); if (!ps.length) { t[''] = r2((t[''] || 0) + l.valor); return; } ps.forEach(x => { t[x.forma] = r2((t[x.forma] || 0) + Number(x.valor)); }); });
    const ks = (S.pagamentos || []).map(p => p.id).filter(k => t[k]).concat(t[''] ? [''] : []);
    if (ks.length === 1 && ks[0] === '') return '';
    const tot = r2(vs.reduce((a, l) => a + l.valor, 0)) || 1;
    return `<section class="card"><h2>Vendas por forma de pagamento</h2><div class="scroll"><table><thead><tr><th>Forma</th><th class="n">Total</th><th class="n">%</th></tr></thead><tbody>
      ${ks.map(k => { const p = pagDe(k); return `<tr><td>${p ? esc(p.icone + ' ' + p.nome) : 'Não informada'}</td><td class="n">${money(t[k])}</td><td class="n">${pctTxt(r2(t[k] / tot * 100))}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }
  function vRelatorio() {
    const base = S.lanc.filter(noPeriodo).filter(l => relRoca === '' ? true : relRoca === 'geral' ? !l.rocaId : l.rocaId === relRoca);
    const R = resumo(base), tot = R.despDono || 1;
    const cats = Object.entries(R.cats).sort((a, b) => b[1].dono - a[1].dono);
    const meses = {}; base.forEach(l => { const k = l.data.slice(0, 7); const m = meses[k] || (meses[k] = []); m.push(l); });
    const mk = Object.keys(meses).sort();
    const rocasR = S.rocas.map(r => ({ r, x: resumo(base.filter(l => l.rocaId === r.id)) })).filter(o => o.x.vendas || o.x.desp);
    const gerais = resumo(base.filter(l => !l.rocaId));
    const ps = {}; base.forEach(l => { Object.keys(partesDe(l)).forEach(k => { if (k !== 'dono') ps[k] = 1; }); if (l.tipo === 'adiantamento') ps[l.pessoaId] = 1; });
    const veic = M('r_veiculos') ? S.veiculos.map(v => ({ v, t: r2(base.filter(l => l.veiculoId === v.id).reduce((a, l) => a + l.valor, 0)) })).filter(o => o.t) : [];
    const tituloRoca = relRoca === '' ? 'Todas as roças e gastos gerais' : relRoca === 'geral' ? 'Só gastos gerais' : (roca(relRoca) || {}).nome;
    $('#main').innerHTML = `<div class="between"><h1>Relatório</h1><button class="btn sm noprint" type="button" id="pr">Imprimir / PDF</button></div>
      <p class="muted small">${esc(DONO())} · ${esc(tituloRoca)} · ${esc(periodo().nome)}</p>
      ${perChips()}
      <div class="chips noprint"><button type="button" class="chip" data-rr="" aria-pressed="${relRoca === ''}">Tudo</button>${S.rocas.map(r => `<button type="button" class="chip" data-rr="${esc(r.id)}" aria-pressed="${relRoca === r.id}">${esc(r.nome)}</button>`).join('')}${M('r_gerais') || M('r_veiculos') ? `<button type="button" class="chip" data-rr="geral" aria-pressed="${relRoca === 'geral'}">Gastos gerais</button>` : ''}</div>
      <section class="card"><h2>Resultado</h2><table><tbody>
        <tr><td>Vendido (bruto)</td><td class="n pos">${money(R.vendas)}</td></tr>
        ${R.parteMeeiros ? `<tr><td>Parte dos meeiros nas vendas</td><td class="n">− ${money(R.parteMeeiros)}</td></tr><tr><td>Vendas de ${esc(DONO())}</td><td class="n">${money(R.vendaDono)}</td></tr>` : ''}
        <tr><td>Gastos de ${esc(DONO())}</td><td class="n neg">− ${money(R.despDono)}</td></tr>
        <tr class="tot"><td>${R.resultado >= 0 ? 'Ganhou' : 'Perdeu'}</td><td class="n ${R.resultado >= 0 ? 'pos' : 'neg'}">${money(R.resultado)}</td></tr></tbody></table>
        ${R.desp !== R.despDono ? `<p class="small muted">Gasto total ${money(R.desp)}, dos quais ${money(r2(R.desp - R.despDono))} por conta dos meeiros.</p>` : ''}
        ${R.adiant ? `<p class="small muted">Adiantamentos a meeiros no período: ${money(R.adiant)} (são descontados no acerto, não são gasto de ${esc(DONO())}).</p>` : ''}</section>
      ${pagRel(base)}
      <section class="card"><h2>Onde gastou</h2>${cats.length ? `<div class="scroll"><table><thead><tr><th>Tipo</th><th class="n">Total</th><th class="n">${esc(DONO())}</th><th class="n">% dos gastos</th></tr></thead><tbody>
        ${cats.map(([c, v], i) => `<tr><td>${cat(c).icone} ${esc(cat(c).nome)}${i === 0 ? ' <b class="neg small">maior gasto</b>' : ''}</td><td class="n">${money(v.total)}</td><td class="n">${money(v.dono)}</td><td class="n">${pctTxt(r2(v.dono / tot * 100))}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="n">${money(R.desp)}</td><td class="n">${money(R.despDono)}</td><td class="n">100%</td></tr></tbody></table></div>` : '<p class="muted small">Sem gastos no período.</p>'}</section>
      ${rocasR.length && relRoca === '' ? `<section class="card"><h2>Por roça</h2><div class="scroll"><table><thead><tr><th>Roça</th><th class="n">Vendido</th><th class="n">Gastos ${esc(DONO())}</th><th class="n">Resultado</th></tr></thead><tbody>
        ${rocasR.map(o => `<tr><td>${esc(o.r.nome)}</td><td class="n">${money(o.x.vendas)}</td><td class="n">${money(o.x.despDono)}</td><td class="n ${o.x.resultado >= 0 ? 'pos' : 'neg'}">${money(o.x.resultado)}</td></tr>`).join('')}
        ${gerais.desp ? `<tr><td>Gastos gerais</td><td class="n">—</td><td class="n">${money(gerais.despDono)}</td><td class="n neg">${money(-gerais.despDono)}</td></tr>` : ''}
        <tr class="tot"><td>Total</td><td class="n">${money(R.vendas)}</td><td class="n">${money(R.despDono)}</td><td class="n ${R.resultado >= 0 ? 'pos' : 'neg'}">${money(R.resultado)}</td></tr></tbody></table></div></section>` : ''}
      ${mk.length ? `<section class="card"><h2>Mês a mês</h2><div class="scroll"><table><thead><tr><th>Mês</th><th class="n">Vendido</th><th class="n">Gastos ${esc(DONO())}</th><th class="n">Resultado</th></tr></thead><tbody>
        ${mk.map(k => { const x = resumo(meses[k]); return `<tr><td>${MESES[Number(k.slice(5)) - 1]}/${k.slice(0, 4)}</td><td class="n">${money(x.vendas)}</td><td class="n">${money(x.despDono)}</td><td class="n ${x.resultado >= 0 ? 'pos' : 'neg'}">${money(x.resultado)}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
      ${Object.keys(ps).length ? `<section class="card"><h2>Meeiros no período</h2><div class="scroll"><table><thead><tr><th>Meeiro</th><th class="n">Parte nas vendas</th><th class="n">Despesas dele</th><th class="n">Adiantamentos</th><th class="n">Em aberto hoje</th></tr></thead><tbody>
        ${Object.keys(ps).map(k => { const v = r2(base.filter(l => l.tipo === 'venda').reduce((a, l) => a + parte(l, k), 0)), d = r2(base.filter(l => l.tipo === 'despesa').reduce((a, l) => a + parte(l, k), 0)), a = r2(base.filter(l => l.tipo === 'adiantamento' && l.pessoaId === k).reduce((s, l) => s + l.valor, 0)); const ab = r2(S.rocas.reduce((s, r) => s + pendente(r.id, k).saldo, 0)); return `<tr><td>${esc(nomeParte(k))}</td><td class="n">${money(v)}</td><td class="n">${money(d)}</td><td class="n">${money(a)}</td><td class="n ${ab >= 0 ? 'pos' : 'neg'}">${money(ab)}</td></tr>`; }).join('')}</tbody></table></div><p class="small muted">"Em aberto hoje": positivo = ${esc(DONO())} paga ao meeiro; negativo = o meeiro deve.</p></section>` : ''}
      ${veic.length ? `<section class="card"><h2>Veículos e máquinas</h2><table><tbody>${veic.map(o => `<tr><td>🚜 ${esc(o.v.nome)}</td><td class="n">${money(o.t)}</td></tr>`).join('')}</tbody></table></section>` : ''}
      <section class="card"><h2>Lançamentos</h2></section>${lancList(base, false)}
      <p class="tino">Gerado em ${dBR(hoje())} · <b>Tino</b></p>`;
    bindPer(); bindLanc();
    $('#pr').addEventListener('click', () => window.print());
    document.querySelectorAll('[data-rr]').forEach(b => b.addEventListener('click', () => { relRoca = b.dataset.rr; render(); }));
  }

  /* ---------- início ---------- */
  async function start() {
    try { await reload(); }
    catch (e) { if (e.mustReset) return showReset(); if (e.status === 401 || e.login || e.status === 403) return showLogin(e.status === 403 ? e.message : ''); $('#main').innerHTML = '<div class="card"><p class="warn">' + esc(e.message) + '</p><button class="btn" type="button" id="rt">Tentar de novo</button></div>'; $('#rt').addEventListener('click', start); return; }
    $('#bn').hidden = false; $('#sair').hidden = false;
    const h = location.hash.slice(1).split('/');
    const vs = ['inicio', 'rocas', 'roca', 'pessoas', 'relatorio', 'acerto'];
    go(vs.includes(h[0]) ? h[0] : 'inicio', h.slice(1).join('/') || null, true);
    if (retomar) { const f = retomar; retomar = null; f(); toast('O que você estava lançando continua aqui. Confira e toque em Lançar.'); }
  }
  if (brand.name) $('#coName').textContent = brand.name;
  if (brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)) document.documentElement.style.setProperty('--brand', brand.color);
  start();
})();

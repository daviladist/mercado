'use strict';
/* Tino — painel da Loja online (dona da loja). Só a tela: preços, estoque e pedidos são conferidos no servidor (lib/loja.js). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
  /* número do jeito brasileiro: "1.500" = mil e quinhentos, "1.500,50", "25,5" */
  const toNum = v => {
    let s = String(v == null ? '' : v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (!s) return null;
    if (!/^[\d.,]+$/.test(s)) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return isFinite(n) ? n : NaN;
  };
  const toInt = v => { const s = String(v == null ? '' : v).trim(); if (!s) return null; return /^\d+$/.test(s) ? Number(s) : NaN; };
  const numIn = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const hex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const dataHora = s => { try { const d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }
  /* telefone legível: (27) 98888-1111 */
  const fone = t => { const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const ST = { novo: 'Novo', confirmado: 'Confirmado', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
  const ACOES = { novo: [['confirmado', 'Confirmar pedido']], confirmado: [['pronto', 'Marcar como pronto']], pronto: [['entregue', 'Marcar como entregue']] };

  let S = null, view = 'inicio', filtro = 'abertos', busca = '', retomar = null, ultimoNovos = null;

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
  async function reload() { S = await api('/api/loja/admin/state'); applyBrand(); badge(); }
  const M = k => !!(S && S.modulos[k]);
  const lojaUrl = () => location.origin + '/t/' + slug + '/loja';

  function applyBrand() {
    $('#coName').textContent = (S && S.empresa.nome) || brand.name || 'Tino';
    const cor = (S && S.empresa.cor) || brand.color;
    if (cor && /^#[0-9a-f]{6}$/i.test(cor)) document.documentElement.style.setProperty('--brand', cor);
    if (S && S.empresa.logo && !applyBrand.done) { applyBrand.done = true; $('#lg').innerHTML = '<img alt="" src="/api/logo?t=' + encodeURIComponent(S.empresa.id) + '">'; }
  }
  function badge() { const n = S.pedidos.filter(p => p.status === 'novo').length; $('#nnovos').innerHTML = n ? '<span class="badge">' + n + '</span>' : ''; }

  /* ---------- entrar ---------- */
  function showLogin(msg) {
    S = null; $('#bn').hidden = true; $('#sair').hidden = true; closeSheet();
    $('#main').innerHTML = `<div class="login"><form class="card" id="lf" autocomplete="on">
      <h1>Entrar</h1><p class="muted small">${esc(brand.name || 'Tino')} · painel da loja</p>
      <div class="field"><label for="lu">Usuário</label><input type="text" id="lu" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
      <div class="field"><label for="lp">Senha</label><input type="password" id="lp" name="password" autocomplete="current-password" required></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" id="lk" checked style="width:20px;height:20px;margin:0"> Manter conectado neste aparelho</label>
      <p class="neg small" id="le" role="alert" style="min-height:18px;font-weight:600">${esc(msg || '')}</p>
      <button class="btn pri full" type="submit">Entrar</button>
      <p class="tino">Quem tem <b>Tino</b>, vende melhor.</p></form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; $('#le').textContent = '';
      try { await api('/api/login', { role: 'admin', login: $('#lu').value.trim().toLowerCase(), password: $('#lp').value, keep: $('#lk').checked }); if ($('#lk').checked) try { if (window.PasswordCredential && navigator.credentials) navigator.credentials.store(new PasswordCredential({ id: $('#lu').value.trim().toLowerCase(), password: $('#lp').value })).catch(() => {}); } catch (e) {} $('#lp').value = ''; await start(); }
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

  /* ---------- navegação (o Voltar do celular volta de tela e fecha a folha) ---------- */
  function go(v, replace) {
    view = v; const st = { v }, url = '#' + v;
    if (replace) history.replaceState(st, '', url); else history.pushState(st, '', url);
    window.scrollTo(0, 0); render();
  }
  window.addEventListener('popstate', e => {
    if (!S) return;
    if ($('#sheet').innerHTML) { $('#sheet').innerHTML = ''; return; }
    view = (e.state && e.state.v) || location.hash.slice(1) || 'inicio'; render();
  });
  $('#bn').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'novo') return formProduto(null); go(b.dataset.go); }));
  function render() {
    if (!S) return;
    $('#bn').querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-current', String(b.dataset.go === view)));
    ({ inicio: vInicio, pedidos: vPedidos, produtos: vProdutos, loja: vLoja }[view] || vInicio)();
  }
  let folhaAtual = null; // qual formulário está na folha (a foto que termina de subir não redesenha outra folha)
  function openSheet(title, html, onReady) {
    folhaAtual = null;
    if (!$('#sheet').innerHTML) history.pushState({ v: view, sheet: 1 }, '', location.hash);
    $('#sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="pn"><div class="tt"><h2>${esc(title)}</h2><button type="button" class="x" id="shx" aria-label="Fechar">×</button></div>${html}</div></div>`;
    $('#shx').addEventListener('click', fecharPeloUsuario);
    $('#sheet .sheet').addEventListener('click', e => { if (e.target.classList.contains('sheet')) fecharPeloUsuario(); });
    if (onReady) onReady($('#sheet .pn'));
  }
  function closeSheet() { if (!$('#sheet').innerHTML) return; $('#sheet').innerHTML = ''; if (history.state && history.state.sheet) history.replaceState({ v: view }, '', location.hash); }
  function fecharPeloUsuario() { if (history.state && history.state.sheet) history.back(); else closeSheet(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').innerHTML) fecharPeloUsuario(); });

  /* ---------- Início ---------- */
  function vInicio() {
    const P = S.pedidos;
    const novos = P.filter(p => p.status === 'novo'), abertos = P.filter(p => ['confirmado', 'pronto'].includes(p.status));
    const top = S.produtos.filter(p => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 5);
    const semFoto = S.produtos.filter(p => p.ativo && !p.fotos.length).length, esgot = S.produtos.filter(p => p.ativo && esgotado(p)).length;
    $('#main').innerHTML = `
      ${S.empresa.status === 'em_preparo' ? '<p class="note">A loja está <b>em preparo</b>: cadastre os produtos com calma. Os clientes só conseguem comprar depois que ela for ativada na Central.</p>' : ''}
      ${!S.config.aberta ? '<p class="warn">A loja está <b>fechada para pedidos</b>. Abra em "Minha loja".</p>' : ''}
      <div class="kpis">
        <div class="k"><span>Pedidos novos</span><b class="${novos.length ? 'neg' : ''}">${novos.length}</b></div>
        <div class="k"><span>Em andamento</span><b>${abertos.length}</b></div>
        <div class="k res"><span>Vendido no mês</span><b>${money(S.mes.vendido)}</b></div>
      </div>
      ${novos.length ? `<section class="card"><h2>Pedidos esperando você</h2><div class="list">${novos.slice(0, 8).map(itemPedido).join('')}</div></section>` : ''}
      <section class="card"><h2>Link da sua loja</h2><p class="small muted">Mande no WhatsApp, coloque no Instagram e no status. Quem abrir vê os produtos e faz o pedido.</p>
        <div class="link-box"><code>${esc(lojaUrl())}</code><button class="btn sm" type="button" id="cp">Copiar</button><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent('Confira a nossa loja e faça seu pedido pelo celular: ' + lojaUrl())}" target="_blank" rel="noopener">WhatsApp</a><a class="btn sm" href="${esc(lojaUrl())}" target="_blank" rel="noopener">Ver loja</a></div></section>
      ${!S.produtos.length ? '<div class="card empty"><div class="big">🛍️</div><h2>Cadastre o primeiro produto</h2><p class="muted">Tire uma foto, coloque o nome e o preço. Pronto: já aparece na vitrine.</p><button class="btn gold" type="button" id="np">+ Cadastrar produto</button></div>' : ''}
      ${semFoto || esgot ? `<section class="card"><h2>Atenção</h2>${semFoto ? `<p class="small">📷 ${semFoto} produto(s) à venda sem foto. Produto com foto vende mais.</p>` : ''}${esgot ? `<p class="small">📦 ${esgot} produto(s) esgotado(s).</p>` : ''}</section>` : ''}
      ${top.length ? `<section class="card"><h2>Mais vendidos</h2><div class="list">${top.map(p => `<div class="it"><span class="thumb">${p.fotos[0] ? `<img alt="" src="${esc(p.fotos[0].url)}">` : '🏷️'}</span><span class="tx"><b>${esc(p.nome)}</b><span>${money(p.preco)}</span></span><span class="vl">${p.vendidos}<small>vendidos</small></span></div>`).join('')}</div></section>` : ''}`;
    bindPed();
    const np = $('#np'); if (np) np.addEventListener('click', () => formProduto(null));
    $('#cp').addEventListener('click', copiarLink);
  }
  async function copiarLink() { try { await navigator.clipboard.writeText(lojaUrl()); toast('Link copiado'); } catch (e) { toast('Não consegui copiar: segure o dedo no link e copie.'); } }
  const esgotado = p => M('l_estoque') && (p.variacoes.length && M('l_variacoes') ? p.variacoes.every(v => v.estoque === 0) : p.estoque === 0);

  /* ---------- Pedidos ---------- */
  const itemPedido = p => `<button type="button" class="it" data-ped="${esc(p.id)}"><span class="ic">${p.entrega === 'entrega' ? '🛵' : '🏪'}</span><span class="tx"><b>Nº ${p.numero} · ${esc(p.clienteNome)}</b><span>${dataHora(p.criadoEm)} · ${p.itens.reduce((a, i) => a + i.qtd, 0)} item(s) · <span class="st ${esc(p.status)}">${esc(ST[p.status])}</span></span></span><span class="vl">${money(p.total)}</span></button>`;
  function bindPed() { document.querySelectorAll('[data-ped]').forEach(b => b.addEventListener('click', () => verPedido(b.dataset.ped))); }
  function vPedidos() {
    const F = { abertos: p => ['novo', 'confirmado', 'pronto'].includes(p.status), novo: p => p.status === 'novo', entregue: p => p.status === 'entregue', cancelado: p => p.status === 'cancelado', todos: () => true };
    const L = S.pedidos.filter(F[filtro] || F.abertos);
    $('#main').innerHTML = `<h1>Pedidos</h1>
      <div class="chips" role="group" aria-label="Filtro">${[['abertos', 'Em aberto'], ['novo', 'Novos'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados'], ['todos', 'Todos']].map(([k, n]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${filtro === k}">${n}</button>`).join('')}</div>
      ${L.length ? `<section class="card"><div class="list">${L.map(itemPedido).join('')}</div></section>` : '<div class="card empty"><div class="big">🧾</div><p class="muted">Nenhum pedido aqui.</p></div>'}`;
    document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.f; render(); }));
    bindPed();
  }
  const zap = tel => { const d = String(tel || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d; };
  function msgCliente(p, st, motivo) {
    const loja = S.empresa.nome, nome = p.clienteNome.split(' ')[0];
    if (st === 'confirmado') return `Olá, ${nome}! Seu pedido nº ${p.numero} na ${loja} foi confirmado. Total: ${money(p.total)}.` + (p.pagamento === 'pix' && S.config.pixChave ? ` Chave PIX: ${S.config.pixChave}` : '');
    if (st === 'pronto') return p.entrega === 'entrega' ? `Olá, ${nome}! Seu pedido nº ${p.numero} da ${loja} saiu para entrega.` : `Olá, ${nome}! Seu pedido nº ${p.numero} está pronto para retirar na ${loja}${S.config.endereco ? ' (' + S.config.endereco + ')' : ''}.`;
    if (st === 'entregue') return `Olá, ${nome}! Obrigado pela compra na ${loja}. Volte sempre!`;
    if (st === 'cancelado') return `Olá, ${nome}. Infelizmente o pedido nº ${p.numero} na ${loja} foi cancelado.${motivo ? ' Motivo: ' + motivo : ''}`;
    return `Olá, ${nome}! Recebemos o seu pedido nº ${p.numero} na ${loja}.`;
  }
  function verPedido(id) {
    const p = S.pedidos.find(x => x.id === id); if (!p) return;
    const acoes = ACOES[p.status] || [];
    openSheet('Pedido nº ' + p.numero, `
      <div class="between"><span class="st ${esc(p.status)}">${esc(ST[p.status])}</span><span class="small muted">${dataHora(p.criadoEm)}</span></div>
      <section class="card"><b>${esc(p.clienteNome)}</b><p class="small">📞 ${esc(fone(p.clienteTel))}</p>
        <p class="small">${p.entrega === 'entrega' ? '🛵 Entrega: ' + esc(p.endereco || '') : '🏪 Retirada na loja'}</p>
        <p class="small">💳 ${esc(S.pagamentosNomes[p.pagamento] || p.pagamento)}</p>${p.obs ? `<p class="small">📝 ${esc(p.obs)}</p>` : ''}
        <a class="btn full" href="https://wa.me/${esc(zap(p.clienteTel))}?text=${encodeURIComponent(msgCliente(p, p.status))}" target="_blank" rel="noopener">💬 Falar com ${esc(p.clienteNome.split(' ')[0])} no WhatsApp</a></section>
      <section class="card"><div class="scroll"><table><thead><tr><th>Item</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Total</th></tr></thead><tbody>
        ${p.itens.map(i => `<tr><td>${esc(i.nome)}${i.variacao ? ' · ' + esc((i.grupoVar ? i.grupoVar + ' ' : '') + i.variacao) : ''}${i.precoUnit < i.precoTabela ? '<br><span class="small pos">preço por quantidade</span>' : ''}</td><td class="n">${i.qtd}</td><td class="n">${money(i.precoUnit)}</td><td class="n">${money(i.total)}</td></tr>`).join('')}
        <tr><td colspan="3">Subtotal</td><td class="n">${money(p.subtotal)}</td></tr>
        ${p.desconto ? `<tr><td colspan="3">Cupom ${esc(p.cupom || '')}</td><td class="n pos">−${money(p.desconto)}</td></tr>` : ''}
        ${p.taxaEntrega ? `<tr><td colspan="3">Entrega</td><td class="n">${money(p.taxaEntrega)}</td></tr>` : p.entrega === 'entrega' ? '<tr><td colspan="3">Entrega</td><td class="n pos">grátis</td></tr>' : ''}
        <tr class="tot"><td colspan="3">Total</td><td class="n">${money(p.total)}</td></tr></tbody></table></div></section>
      ${acoes.map(([st, lb]) => `<button class="btn pri full" type="button" data-st="${st}">${lb}</button>`).join('')}
      ${['novo', 'confirmado', 'pronto'].includes(p.status) ? '<button class="btn dan full" type="button" data-st="cancelado">Cancelar pedido</button>' : ''}
      ${p.historico.length ? `<p class="small muted">${p.historico.map(h => esc(ST[h.status] || h.status) + ' ' + dataHora(h.em) + (h.motivo ? ' (' + esc(h.motivo) + ')' : '')).join(' → ')}</p>` : ''}`, pn => {
      pn.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', async () => {
        const st = b.dataset.st; let motivo = '';
        if (st === 'cancelado') { motivo = prompt('Cancelar o pedido nº ' + p.numero + '? Escreva o motivo (o estoque volta):', ''); if (motivo === null) return; }
        b.disabled = true;
        try {
          await api('/api/loja/admin/pedido/status', { id: p.id, status: st, motivo });
          await reload(); closeSheet(); render();
          const np = S.pedidos.find(x => x.id === p.id) || p;
          toast('Pedido nº ' + p.numero + ': ' + ST[st]);
          // já deixa a mensagem pronta para avisar o cliente
          openSheet('Avisar o cliente', `<p>${esc(msgCliente(np, st, motivo))}</p><a class="btn pri full" href="https://wa.me/${esc(zap(np.clienteTel))}?text=${encodeURIComponent(msgCliente(np, st, motivo))}" target="_blank" rel="noopener">💬 Enviar pelo WhatsApp</a><button class="btn full" type="button" id="dps">Agora não</button>`, () => { $('#dps').addEventListener('click', fecharPeloUsuario); });
        } catch (e) { b.disabled = false; if (e.status === 409) { await reload(); closeSheet(); render(); } fail(e); }
      }));
    });
  }

  /* ---------- Produtos ---------- */
  function vProdutos() {
    const q = busca.trim().toLowerCase();
    const L = S.produtos.filter(p => !q || (p.nome + ' ' + (p.categoria || '') + ' ' + (p.codigo || '')).toLowerCase().includes(q));
    $('#main').innerHTML = `<div class="between"><h1>Produtos</h1><div class="row">${M('l_staria_preco') ? `<button class="btn" type="button" id="sprc">Preços do StarIA${precoJob('pronta') ? ' <span class="badge">1</span>' : ''}</button>` : ''}<button class="btn" type="button" id="imp">Importar${stariaProntas() ? ' <span class="badge">' + stariaProntas() + '</span>' : ''}</button><button class="btn gold" type="button" id="np">+ Produto</button></div></div>
      <input type="text" id="bq" placeholder="Buscar produto" value="${esc(busca)}" aria-label="Buscar produto">
      ${L.length ? `<section class="card"><div class="list">${L.map(p => `<button type="button" class="it" data-pr="${esc(p.id)}"><span class="thumb">${p.fotos[0] ? `<img alt="" src="${esc(p.fotos[0].url)}">` : '🏷️'}</span><span class="tx"><b>${esc(p.nome)}</b><span>${esc([p.codigo ? 'cód. ' + p.codigo : '', p.categoria, !p.ativo ? 'fora da vitrine' : '', esgotado(p) ? 'esgotado' : '', p.destaque ? '⭐ destaque' : ''].filter(Boolean).join(' · '))}</span></span><span class="vl">${money(p.preco)}${p.faixas.length && M('l_volume') ? '<small>+ preço por qtd</small>' : ''}</span></button>`).join('')}</div></section>` : `<div class="card empty"><div class="big">🏷️</div><p class="muted">${S.produtos.length ? 'Nenhum produto com esse nome.' : 'Nenhum produto ainda.'}</p></div>`}`;
    $('#np').addEventListener('click', () => formProduto(null));
    $('#imp').addEventListener('click', importarMenu);
    { const b = $('#sprc'); if (b) b.addEventListener('click', precosMenu); }
    const bq = $('#bq'); bq.addEventListener('input', () => { busca = bq.value; const pos = bq.selectionStart; render(); const n = $('#bq'); n.focus(); n.setSelectionRange(pos, pos); });
    document.querySelectorAll('[data-pr]').forEach(b => b.addEventListener('click', () => formProduto(S.produtos.find(p => p.id === b.dataset.pr))));
  }
  /* ---------- Importar produtos: planilha do Excel ou StarIA ---------- */
  const stariaImp = () => (S.staria || []).filter(j => (j.tipo || 'importar') === 'importar');
  const stariaProntas = () => M('l_staria_imp') ? stariaImp().filter(j => j.status === 'pronta').length : 0;
  const precoJob = st => (S.staria || []).find(j => j.tipo === 'precos' && (!st || j.status === st));
  /* ---------- Atualizar preços pelo StarIA: preço de venda do momento; em promoção, o preço da promoção ---------- */
  const precoNovo = r => r && r.precoVenda > 0 ? (r.precoPromo != null && r.precoPromo < r.precoVenda ? { preco: r2(r.precoPromo), de: r2(r.precoVenda), promo: true, ate: r.promoAte } : { preco: r2(r.precoVenda), de: null, promo: false }) : null;
  function precosMenu() {
    const comCod = S.produtos.filter(p => p.codigo && /^\d{1,14}$/.test(p.codigo));
    const pend = precoJob('pendente'), pronta = precoJob('pronta'), feita = (S.staria || []).filter(j => j.tipo === 'precos' && j.status === 'importada')[0];
    let corpo;
    if (pronta) {
      const L = comCod.map(p => ({ p, n: precoNovo(pronta.resultados[p.codigo]) })).filter(x => x.n);
      const muda = L.filter(x => r2(x.p.preco) !== x.n.preco || (x.p.precoDe == null ? null : r2(x.p.precoDe)) !== x.n.de);
      const sem = comCod.length - L.length;
      corpo = `<section class="card"><h3>Preços que chegaram do StarIA</h3>
        <p class="small muted">${muda.length} produto${muda.length === 1 ? '' : 's'} muda${muda.length === 1 ? '' : 'm'} de preço · ${L.length - muda.length} já está${L.length - muda.length === 1 ? '' : 'ão'} certo${L.length - muda.length === 1 ? '' : 's'}${sem ? ' · ' + sem + ' não achado' + (sem === 1 ? '' : 's') + ' no StarIA (fica' + (sem === 1 ? '' : 'm') + ' como está)' : ''}.</p>
        ${muda.length ? `<div class="list">${muda.slice(0, 300).map(x => `<div class="it"><span class="tx"><b>${esc(x.p.nome)}</b><span>${x.n.promo ? '🏷️ promoção' + (x.n.ate ? ' até ' + esc(x.n.ate.split('-').reverse().join('/')) : '') + ' · de ' + money(x.n.de) : 'preço normal'}</span></span><span class="vl"><small style="text-decoration:line-through">${money(x.p.preco)}</small>${money(x.n.preco)}</span></div>`).join('')}</div>` : '<p class="muted">Nenhum preço mudou.</p>'}
        <button class="btn pri full" type="button" id="spa">${muda.length ? 'Aplicar os novos preços' : 'Concluir'}</button>
        <p class="neg small" id="spe" role="alert" style="font-weight:600"></p></section>`;
    } else if (pend) {
      corpo = `<section class="card"><h3>Esperando o StarIA</h3><p class="small muted">${pend.termos.length} produto${pend.termos.length === 1 ? '' : 's'} · pedido em ${esc(dataHora(pend.criadoEm))}.</p>
        <p class="note">O site não fala direto com o StarIA. Para ele responder, peça no Claude: <b>"processa as consultas do StarIA da loja"</b>. Depois toque em Atualizar.</p>
        <div class="grid2"><button class="btn pri" type="button" id="sat">Atualizar</button><button class="btn" type="button" data-sx="${esc(pend.id)}">Cancelar pedido</button></div></section>`;
    } else {
      corpo = `<section class="card"><h3>Atualizar preços pelo StarIA</h3>
        <p class="small muted">Busca no StarIA o <b>preço de venda de agora</b> de cada produto. Se o produto estiver <b>em promoção</b> no StarIA, entra o <b>preço da promoção</b> (e o preço normal aparece riscado na vitrine). Você confere antes de aplicar.</p>
        <p class="small">${comCod.length} produto${comCod.length === 1 ? '' : 's'} com código do StarIA${S.produtos.length - comCod.length ? ' · ' + (S.produtos.length - comCod.length) + ' sem código (não mudam)' : ''}.</p>
        <button class="btn pri full" type="button" id="spp"${comCod.length ? '' : ' disabled'}>Atualizar preços agora</button>
        ${feita ? `<p class="small muted">Última atualização aplicada: ${esc(dataHora(feita.feitoEm || feita.criadoEm))}.</p>` : ''}
        <p class="neg small" id="spe" role="alert" style="font-weight:600"></p></section>`;
    }
    openSheet('Preços do StarIA', corpo, pn => {
      const spp = $('#spp'); if (spp) spp.addEventListener('click', async () => { spp.disabled = true; try { await api('/api/loja/admin/staria/pedir', { id: 's' + hex(6), tipo: 'precos' }); await reload(); toast('Pedido de preços enviado ao StarIA'); precosMenu(); } catch (e) { spp.disabled = false; if (e.status === 401) return fail(e); $('#spe').textContent = e.message; } });
      const sat = $('#sat'); if (sat) sat.addEventListener('click', async () => { sat.disabled = true; try { await reload(); precosMenu(); } catch (e) { sat.disabled = false; fail(e); } });
      pn.querySelectorAll('[data-sx]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { await api('/api/loja/admin/staria/excluir', { id: b.dataset.sx }); await reload(); precosMenu(); } catch (e) { b.disabled = false; fail(e); } }));
      const spa = $('#spa'); if (spa) spa.addEventListener('click', async () => {
        spa.disabled = true; spa.textContent = 'Aplicando…';
        try { const r = await api('/api/loja/admin/staria/aplicar-precos', { id: pronta.id }); await reload(); closeSheet();
          toast((r.atualizados ? r.atualizados + ' preço' + (r.atualizados === 1 ? '' : 's') + ' atualizado' + (r.atualizados === 1 ? '' : 's') : 'Nenhum preço mudou') + (r.pulados.length ? ' · ' + r.pulados.length + ' pulado' + (r.pulados.length === 1 ? '' : 's') + ' (preço por quantidade)' : '')); go('produtos'); }
        catch (e) { spa.disabled = false; spa.textContent = 'Aplicar os novos preços'; if (e.status === 401) return fail(e); $('#spe').textContent = e.message; }
      });
    });
  }
  const MODELO_COLS = ['Código (EAN)', 'Nome', 'Preço', 'Preço de', 'Estoque', 'Categoria', 'Unidade', 'Descrição', 'Custo'];
  function importarMenu() {
    const js = stariaImp();
    const stTxt = { pendente: 'Esperando o StarIA', pronta: 'Pronta para revisar', importada: 'Importada' };
    openSheet('Importar produtos', `
      <section class="card"><h3>📊 Planilha do Excel</h3>
        <p class="small muted">Uma linha por produto. Precisa das colunas <b>Nome</b> e <b>Preço</b>. Se quiser, também: Código (EAN), Estoque, Categoria, Unidade, Descrição, Preço de e Custo. Código que já está na loja atualiza o produto em vez de criar outro.</p>
        <div class="grid2"><label class="btn pri" for="fxl" style="text-align:center">Escolher planilha</label><a class="btn" href="/modelo-produtos-loja.xlsx" download>Baixar modelo</a></div>
        <input type="file" id="fxl" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
        <p class="neg small" id="xe" role="alert" style="font-weight:600"></p></section>
      ${M('l_staria_imp') ? `<section class="card"><h3>🔎 Do StarIA</h3>
        <p class="small muted">Escreva um código ou EAN para importar um produto, ou vários (um por linha) para importar em massa.</p>
        <textarea id="stt" rows="4" placeholder="7891234567890&#10;7899876543210&#10;1234"></textarea>
        <button class="btn pri full" type="button" id="stp">Pedir ao StarIA</button>
        <p class="neg small" id="ste" role="alert" style="font-weight:600"></p>
        ${js.length ? `<div class="list">${js.map(j => `<div class="it"><span class="tx"><b>${j.termos.length} código${j.termos.length === 1 ? '' : 's'} · ${esc(stTxt[j.status] || j.status)}</b><span>${esc(dataHora(j.criadoEm))}${j.status !== 'pendente' ? ' · achou ' + Object.values(j.resultados).filter(Boolean).length : ''}</span></span>
          ${j.status === 'pendente' ? `<button class="btn sm" type="button" data-sx="${esc(j.id)}">Cancelar</button>` : `<button class="btn sm ${j.status === 'pronta' ? 'gold' : ''}" type="button" data-sr="${esc(j.id)}">${j.status === 'pronta' ? 'Revisar e importar' : 'Ver'}</button>`}</div>`).join('')}</div>` : ''}
        ${js.some(j => j.status === 'pendente') ? '<p class="note">O site não fala direto com o StarIA. Para ele responder, peça no Claude: <b>"processa as consultas do StarIA da loja"</b>. Depois toque em Atualizar.</p><button class="btn full" type="button" id="sat">Atualizar</button>' : ''}</section>` : ''}`, pn => {
      $('#fxl').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        $('#xe').textContent = 'Lendo a planilha…';
        try { const rows = await lerPlanilha(f); const R = montarImport(rows); revisarPlanilha(R, f.name); }
        catch (err) { $('#xe').textContent = err.message || 'Não consegui ler a planilha.'; e.target.value = ''; }
      });
      if ($('#stp')) $('#stp').addEventListener('click', async () => {
        const termos = [...new Set($('#stt').value.split(/[\s,;]+/).map(x => x.replace(/\D/g, '')).filter(Boolean))];
        if (!termos.length) { $('#ste').textContent = 'Escreva pelo menos um código ou EAN (só números).'; return; }
        const bt = $('#stp'); bt.disabled = true;
        try { await api('/api/loja/admin/staria/pedir', { id: 's' + hex(6), termos }); await reload(); toast('Pedido enviado ao StarIA'); importarMenu(); }
        catch (e) { bt.disabled = false; if (e.status === 401) return fail(e); $('#ste').textContent = e.message; }
      });
      const sat = $('#sat'); if (sat) sat.addEventListener('click', async () => { sat.disabled = true; try { await reload(); importarMenu(); } catch (e) { sat.disabled = false; fail(e); } });
      pn.querySelectorAll('[data-sx]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { await api('/api/loja/admin/staria/excluir', { id: b.dataset.sx }); await reload(); importarMenu(); } catch (e) { b.disabled = false; fail(e); } }));
      pn.querySelectorAll('[data-sr]').forEach(b => b.addEventListener('click', () => revisarStaria(js.find(j => j.id === b.dataset.sr))));
    });
  }
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const existe = cod => cod && S.produtos.find(p => p.codigo && p.codigo.toLowerCase() === String(cod).toLowerCase());
  /* manda em partes de até 1000; cada parte entra inteira ou não entra */
  async function enviarImport(itens, extra, bt) {
    let criados = 0, atualizados = 0;
    for (let i = 0; i < itens.length; i += 1000) {
      bt.textContent = itens.length > 1000 ? 'Importando ' + Math.min(i + 1000, itens.length) + ' de ' + itens.length + '…' : 'Importando…';
      let r;
      try { r = await api('/api/loja/admin/importar', Object.assign({ itens: itens.slice(i, i + 1000) }, extra)); }
      catch (e) { e.feitos = i; if (i) e.message = 'Os primeiros ' + i + ' já entraram. Depois parou: ' + e.message + ' Corrija e importe de novo: só os que faltam vão.'; throw e; }
      criados += r.criados; atualizados += r.atualizados;
    }
    return { criados, atualizados };
  }
  function fimImport(r) { closeSheet(); toast([r.criados ? r.criados + ' produto' + (r.criados === 1 ? ' novo' : 's novos') : '', r.atualizados ? r.atualizados + ' atualizado' + (r.atualizados === 1 ? '' : 's') : ''].filter(Boolean).join(' · ') || 'Nada mudou'); go('produtos'); }

  /* StarIA: revisa o que achou, põe o preço (custo + margem) e importa */
  function revisarStaria(j) {
    if (!j) return;
    const achados = j.termos.filter(t => j.resultados[t]), faltam = j.termos.filter(t => !j.resultados[t]);
    const temPv = achados.some(t => j.resultados[t].precoVenda > 0);
    const R = { m: '30', modo: temPv ? 'erp' : 'margem', est: !!M('l_estoque'), cat: '', rows: achados.map(t => { const r = j.resultados[t]; return { termo: t, r, on: true, nome: r.nome, preco: '', manual: false, codigo: r.ean || r.codigo || t }; }) };
    const precoDe = x => { if (R.modo === 'erp') return x.r.precoVenda > 0 ? numIn(x.r.precoVenda.toFixed(2)) : ''; const m = toNum(R.m); return x.r.custo > 0 && m >= 0 ? numIn(r2(x.r.custo * (1 + m / 100)).toFixed(2)) : ''; };
    const vistosCod = new Set();
    R.rows.forEach(x => { x.preco = precoDe(x); const k = String(x.codigo).toLowerCase(); x.dup = vistosCod.has(k); if (x.dup) x.on = false; vistosCod.add(k); });
    openSheet('Importar do StarIA', `
      ${achados.length && temPv ? `<div class="field"><span class="lbl">Preço na loja</span><div class="chips"><button type="button" class="chip" data-md="erp" aria-pressed="${R.modo === 'erp'}">Mesmo preço de venda do StarIA</button><button type="button" class="chip" data-md="margem" aria-pressed="${R.modo === 'margem'}">Custo + margem</button></div></div>` : ''}
      ${achados.length ? `<div class="grid2"><div class="field" id="fmg" ${R.modo === 'erp' ? 'hidden' : ''}><label for="smg">Margem sobre o custo (%)</label><input inputmode="decimal" id="smg" value="${esc(R.m)}"></div>
        <div class="field"><label for="sct">Categoria (opcional)</label><input type="text" id="sct" maxlength="40" placeholder="Ex.: Bebidas"></div></div>
        ${M('l_estoque') ? '<label class="row"><input type="checkbox" id="ses" checked style="width:22px;height:22px;accent-color:var(--brand)"> Usar o estoque que está no StarIA</label>' : ''}
        <p class="small muted" id="spx">${temPv ? 'Escolha de onde vem o preço.' : 'O preço vem do custo da última compra mais a margem.'} Pode mudar o preço de cada um. Produto com código que já está na loja é atualizado.</p>
        <div class="list">${R.rows.map((x, i) => `<div class="it" style="flex-wrap:wrap"><input type="checkbox" data-on="${i}" ${x.on ? 'checked' : ''} ${x.dup ? 'disabled' : ''} aria-label="Importar ${esc(x.nome)}" style="width:24px;height:24px;accent-color:var(--brand)">
          <span class="tx" style="flex:1 1 180px"><input type="text" data-nm="${i}" maxlength="80" value="${esc(x.nome)}" aria-label="Nome"><span>${esc(['cód. ' + x.codigo, x.r.custo != null ? 'custo ' + money(x.r.custo) : 'sem custo', x.r.precoVenda > 0 ? 'venda no StarIA ' + money(x.r.precoVenda) : '', x.r.estoque != null ? 'estoque ' + x.r.estoque : '', existe(x.codigo) ? 'já está na loja: atualiza' : '', x.r.varios ? 'mais de um cadastro no StarIA' : '', x.dup ? 'repetido (mesmo produto de outro código)' : ''].filter(Boolean).join(' · '))}</span></span>
          <input inputmode="decimal" class="money" data-pc="${i}" value="${esc(x.preco)}" placeholder="Preço" aria-label="Preço de ${esc(x.nome)}" style="max-width:120px"></div>`).join('')}</div>` : '<p class="muted">O StarIA não achou nenhum destes códigos.</p>'}
      ${faltam.length ? `<p class="small muted">Não achados no StarIA: ${esc(faltam.join(', '))}</p>` : ''}
      <p class="neg small" id="sre" role="alert" style="font-weight:600;min-height:16px"></p>
      ${achados.length ? `<button class="btn pri full" type="button" id="sri">Importar ${R.rows.filter(x => x.on).length} produto${R.rows.filter(x => x.on).length === 1 ? '' : 's'}</button>` : ''}`, pn => {
      const cont = () => { const n = R.rows.filter(x => x.on).length, b = $('#sri'); if (b) { b.textContent = 'Importar ' + n + ' produto' + (n === 1 ? '' : 's'); b.disabled = !n; } };
      const recalc = () => R.rows.forEach((x, i) => { if (!x.manual) { x.preco = precoDe(x); pn.querySelector('[data-pc="' + i + '"]').value = x.preco; } });
      pn.querySelectorAll('[data-md]').forEach(b => b.addEventListener('click', () => { R.modo = b.dataset.md; pn.querySelectorAll('[data-md]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.md === R.modo))); $('#fmg').hidden = R.modo === 'erp'; recalc(); }));
      const smg = $('#smg');
      if (smg) smg.addEventListener('input', () => { R.m = smg.value; recalc(); });
      pn.querySelectorAll('[data-pc]').forEach(e => e.addEventListener('input', () => { const x = R.rows[e.dataset.pc]; x.preco = e.value; x.manual = true; }));
      pn.querySelectorAll('[data-nm]').forEach(e => e.addEventListener('input', () => { R.rows[e.dataset.nm].nome = e.value; }));
      pn.querySelectorAll('[data-on]').forEach(e => e.addEventListener('change', () => { R.rows[e.dataset.on].on = e.checked; cont(); }));
      const bt = $('#sri'); if (!bt) return;
      bt.addEventListener('click', async () => {
        const err = m => { $('#sre').textContent = m; };
        const est = $('#ses') ? $('#ses').checked : false, cat = ($('#sct') || {}).value || '';
        const itens = [];
        for (const x of R.rows) {
          if (!x.on) continue;
          const p = toNum(x.preco);
          if (String(x.nome).trim().length < 2) return err('Escreva o nome de ' + x.codigo + '.');
          if (!(p > 0)) return err('Informe o preço de ' + x.nome + '.');
          const it = { codigo: x.codigo, nome: x.nome, preco: r2(p) };
          if (x.r.custo != null) it.custo = x.r.custo;
          if (est && x.r.estoque != null) it.estoque = x.r.estoque;
          if (cat.trim()) it.categoria = cat.trim();
          itens.push(it);
        }
        if (!itens.length) return err('Marque pelo menos um produto.');
        bt.disabled = true;
        try { const r = await enviarImport(itens, { stariaId: j.id }, bt); await reload(); fimImport(r); }
        catch (e) { bt.disabled = false; cont(); if (e.status === 401) return fail(e); err(e.message); }
      });
    });
  }

  /* ---------- leitura da planilha no aparelho (.xlsx ou .csv), sem enviar o arquivo ---------- */
  async function lerPlanilha(f) {
    if (f.size > 15 * 1024 * 1024) throw new Error('Planilha grande demais (máximo 15 MB).');
    const buf = await f.arrayBuffer(), u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return lerXlsx(buf);
    if (/\.xls$/i.test(f.name) || (u8[0] === 0xd0 && u8[1] === 0xcf)) throw new Error('Esse é o formato antigo do Excel (.xls). No Excel, use "Salvar como" e escolha "Pasta de Trabalho do Excel (.xlsx)".');
    let t = new TextDecoder('utf-8').decode(u8);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(u8);
    return lerCsv(t.replace(/^﻿/, ''));
  }
  function lerCsv(t) {
    const prim = t.split(/\r?\n/)[0] || '', sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cel = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cel); cel = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cel); rows.push(row); row = []; cel = ''; }
      else cel += c;
    }
    if (cel || row.length) { row.push(cel); rows.push(row); }
    return rows;
  }
  async function lerXlsx(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Não consegui abrir: o arquivo não parece uma planilha .xlsx.');
    const files = {}; let p = dv.getUint32(e + 16, true);
    for (let k = 0, n = dv.getUint16(e + 10, true); k < n && p + 46 <= u8.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { met: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    const ler = async nome => {
      const f = files[nome]; if (!f) return null;
      const st = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(st, st + f.csize);
      if (f.met === 0) return dec.decode(data);
      if (f.met !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Este aparelho não consegue abrir .xlsx. Salve a planilha como CSV e tente de novo.');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const xml = t => new DOMParser().parseFromString(t, 'application/xml');
    const tags = (d, n) => Array.from(d.getElementsByTagNameNS('*', n));
    const ss = await ler('xl/sharedStrings.xml');
    const shared = ss ? tags(xml(ss), 'si').map(si => tags(si, 't').map(x => x.textContent).join('')) : [];
    let alvo = 'xl/worksheets/sheet1.xml';
    try {
      const wb = xml(await ler('xl/workbook.xml')), rels = xml(await ler('xl/_rels/workbook.xml.rels'));
      const sh = tags(wb, 'sheet')[0], rid = sh && (sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id'));
      const rel = tags(rels, 'Relationship').find(r => r.getAttribute('Id') === rid);
      if (rel) { const tg = rel.getAttribute('Target').replace(/^\//, ''); alvo = tg.startsWith('xl/') ? tg : 'xl/' + tg; }
    } catch (err) { /* usa a primeira planilha */ }
    const sx = await ler(alvo) || await ler(Object.keys(files).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0] || '');
    if (!sx) throw new Error(files['xl/workbook.xml'] ? 'A planilha está vazia.' : 'Não é uma planilha do Excel (.xlsx). No programa da planilha, use "Salvar como" .xlsx ou .csv.');
    const col = ref => { let n = 0; for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const linhas = [];
    tags(xml(sx), 'row').forEach(r => {
      const out = [], rn = Number(r.getAttribute('r'));
      tags(r, 'c').forEach(c => {
        const t = c.getAttribute('t'), v = tags(c, 'v')[0], val = v ? v.textContent : '';
        let x;
        if (t === 's') x = shared[Number(val)] || '';
        else if (t === 'inlineStr') x = tags(c, 't').map(y => y.textContent).join('');
        else if (t === 'str' || t === 'b' || t === 'e') x = val;
        else x = val === '' ? '' : Number(val);
        const i = c.getAttribute('r') ? col(c.getAttribute('r')) : out.length;
        if (i >= 0 && i < 200) out[i] = x;
      });
      const idx = Number.isInteger(rn) && rn > 0 && rn <= 200000 ? rn - 1 : linhas.length;
      if (idx >= linhas.length) linhas[idx] = out;
    });
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = []; // Excel não grava linha vazia: mantém o número da linha
    return linhas;
  }
  /* reconhece as colunas pelo nome (do jeito que a pessoa escreveu) */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SINON = {
    codigo: ['codigoean', 'codigo', 'cod', 'ean', 'codigodebarras', 'codbarras', 'gtin', 'sku', 'referencia', 'ref', 'codigointerno'],
    nome: ['nome', 'produto', 'nomedoproduto', 'item', 'mercadoria', 'descricaodoproduto'],
    preco: ['preco', 'precodevenda', 'precovenda', 'valor', 'valordevenda', 'valorvenda', 'venda', 'precounitario', 'pv'],
    precoDe: ['precode', 'precoantigo', 'precoriscado', 'de'],
    estoque: ['estoque', 'quantidade', 'qtd', 'qtde', 'saldo', 'estoqueatual'],
    categoria: ['categoria', 'grupo', 'secao', 'departamento'],
    unidade: ['unidade', 'un', 'und', 'medida'],
    descricao: ['descricao', 'detalhes', 'observacao', 'obs'],
    custo: ['custo', 'precodecusto', 'precocusto', 'valorcusto', 'custounitario']
  };
  function montarImport(rows) {
    let h = -1, map = null;
    for (let i = 0, vistas = 0; i < rows.length && vistas < 10 && h < 0; i++) {
      if (!(rows[i] || []).some(c => c !== '' && c != null)) continue; // linha vazia não conta
      vistas++;
      const m = {}; (rows[i] || []).forEach((c, j) => { const n = norm(c); for (const [k, ns] of Object.entries(SINON)) if (m[k] == null && ns.includes(n)) { m[k] = j; break; } });
      if (m.nome == null && m.descricao != null) { m.nome = m.descricao; delete m.descricao; }
      if (m.nome != null && m.preco != null) { h = i; map = m; }
    }
    if (h < 0) throw new Error('Não achei as colunas "Nome" e "Preço" na primeira linha da planilha. Use o modelo (botão "Baixar modelo").');
    const txt = v => v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim();
    const dinheiro = v => typeof v === 'number' ? r2(v) : toNum(String(v || '').replace(/^R\$\s*/i, ''));
    const itens = [], erros = [], vistos = new Set();
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [], g = k => map[k] == null ? '' : r[map[k]];
      if (!Object.keys(map).some(k => txt(g(k)) !== '')) continue; // linha vazia
      const linha = i + 1, it = { linha }, prob = m => erros.push({ linha, erro: m });
      it.nome = txt(g('nome')).replace(/\s+/g, ' ');
      if (it.nome.length < 2) { prob('sem nome'); continue; }
      const p = dinheiro(g('preco'));
      if (!(p > 0)) { prob(it.nome + ': preço vazio ou inválido'); continue; }
      it.preco = r2(p);
      const cod = typeof g('codigo') === 'number' ? String(Math.round(g('codigo'))) : txt(g('codigo')).replace(/\s+/g, '');
      if (cod) { if (!/^[A-Za-z0-9._\/-]{1,30}$/.test(cod)) { prob(it.nome + ': código inválido'); continue; } if (vistos.has(cod.toLowerCase())) { prob(it.nome + ': código ' + cod + ' repetido'); continue; } vistos.add(cod.toLowerCase()); it.codigo = cod; }
      if (txt(g('precoDe'))) { const d = dinheiro(g('precoDe')); if (!(d > it.preco)) { prob(it.nome + ': "preço de" precisa ser maior que o preço'); continue; } it.precoDe = r2(d); }
      if (txt(g('custo'))) { const c = dinheiro(g('custo')); if (!(c >= 0)) { prob(it.nome + ': custo inválido'); continue; } it.custo = r2(c); }
      if (txt(g('estoque')) && M('l_estoque')) { const e = typeof g('estoque') === 'number' ? g('estoque') : toInt(g('estoque')); if (!(Number.isInteger(e) && e >= 0 && e <= 1000000)) { prob(it.nome + ': estoque precisa ser um número inteiro'); continue; } it.estoque = e; }
      if (txt(g('categoria'))) it.categoria = txt(g('categoria')).slice(0, 40);
      if (txt(g('descricao'))) it.descricao = txt(g('descricao')).slice(0, 1500);
      if (txt(g('unidade'))) { const u = txt(g('unidade')).toLowerCase(); if (!(S.unidades || []).includes(u)) { prob(it.nome + ': unidade "' + u + '" (use ' + (S.unidades || []).join(', ') + ')'); continue; } it.unidade = u; }
      itens.push(it);
    }
    return { itens, erros, cols: Object.keys(map) };
  }
  function revisarPlanilha(R, nome) {
    const at = R.itens.filter(x => existe(x.codigo)).length, nv = R.itens.length - at;
    const NOMES = { codigo: 'Código', nome: 'Nome', preco: 'Preço', precoDe: 'Preço de', estoque: 'Estoque', categoria: 'Categoria', unidade: 'Unidade', descricao: 'Descrição', custo: 'Custo' };
    openSheet('Importar planilha', `
      <p class="small muted">${esc(nome)} · colunas usadas: ${esc(R.cols.map(k => NOMES[k]).join(', '))}</p>
      <div class="kpis"><div class="k"><span>Novos</span><b class="pos">${nv}</b></div><div class="k"><span>Atualizam</span><b>${at}</b></div><div class="k"><span>Com erro</span><b class="${R.erros.length ? 'neg' : ''}">${R.erros.length}</b></div></div>
      ${R.cols.includes('estoque') && M('l_estoque') ? '<p class="note">O estoque da planilha substitui o estoque que está na loja hoje.</p>' : ''}
      ${R.erros.length ? `<div class="warn"><b>Linhas que não vão entrar:</b><br>${R.erros.slice(0, 15).map(x => 'Linha ' + x.linha + ': ' + esc(x.erro)).join('<br>')}${R.erros.length > 15 ? '<br>E mais ' + (R.erros.length - 15) + '.' : ''}</div>` : ''}
      ${R.itens.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>Código</th><th class="n">Preço</th>${R.cols.includes('estoque') && M('l_estoque') ? '<th class="n">Estoque</th>' : ''}<th></th></tr></thead><tbody>
        ${R.itens.slice(0, 30).map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.codigo || '')}</td><td class="n">${money(x.preco)}</td>${R.cols.includes('estoque') && M('l_estoque') ? `<td class="n">${x.estoque == null ? '' : x.estoque}</td>` : ''}<td class="small">${existe(x.codigo) ? 'atualiza' : 'novo'}</td></tr>`).join('')}</tbody></table></div>
        ${R.itens.length > 30 ? `<p class="small muted">Mostrando 30 de ${R.itens.length}.</p>` : ''}` : '<p class="muted">Nenhuma linha boa para importar.</p>'}
      <p class="neg small" id="pie" role="alert" style="font-weight:600;min-height:16px"></p>
      ${R.itens.length ? `<button class="btn pri full" type="button" id="pii">Importar ${R.itens.length} produto${R.itens.length === 1 ? '' : 's'}</button>` : ''}`, () => {
      const bt = $('#pii'); if (!bt) return;
      bt.addEventListener('click', async () => {
        bt.disabled = true;
        try { const r = await enviarImport(R.itens, {}, bt); await reload(); fimImport(r); }
        catch (e) { if (e.feitos) { R.itens = R.itens.slice(e.feitos); revisarPlanilha(R, nome); $('#pie').textContent = e.message; await reload().catch(() => {}); return; } bt.disabled = false; bt.textContent = 'Importar ' + R.itens.length + ' produto' + (R.itens.length === 1 ? '' : 's'); if (e.status === 401) return fail(e); $('#pie').textContent = e.message; await reload().catch(() => {}); }
      });
    });
  }

  const PRESETS = [['Tamanho', ['PP', 'P', 'M', 'G', 'GG']], ['Numeração', ['34', '36', '38', '40', '42', '44']], ['Calçado', ['34', '35', '36', '37', '38', '39', '40']], ['Cor', ['Preto', 'Branco', 'Azul', 'Vermelho']]];
  /* reduz a foto no aparelho antes de enviar (fica leve e sem dado escondido da câmera) */
  function reduzir(f) {
    return new Promise((ok, bad) => {
      if (!/^image\//.test(f.type)) return bad(new Error('Escolha uma foto.'));
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        let lado = 1200, q = 0.82, out = '';
        for (let k = 0; k < 4; k++) {
          const s = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q);
          if (out.length < 650 * 1024) break;
          lado -= 250; q -= 0.08;
        }
        URL.revokeObjectURL(url); ok(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('Não consegui abrir essa foto.')); };
      img.src = url;
    });
  }
  function formProduto(p0) {
    const edit = !!p0;
    const F = p0 ? JSON.parse(JSON.stringify(p0)) : { id: 'x' + hex(6), codigo: '', custo: '', nome: '', descricao: '', categoria: '', preco: '', precoDe: '', unidade: 'un', fotos: [], grupoVar: '', variacoes: [], estoque: '', faixas: [], ativo: true, destaque: false };
    // o estoque que estava gravado quando a dona abriu (o servidor só troca o que ela mexeu)
    const vistoProd = edit ? (p0.estoque == null ? null : p0.estoque) : undefined;
    const vistoVar = new Map(edit ? p0.variacoes.map(v => [v.id, v.estoque == null ? null : v.estoque]) : []);
    if (edit) { F.preco = numIn(F.preco); F.precoDe = numIn(F.precoDe); F.custo = numIn(F.custo); F.estoque = F.estoque == null ? '' : String(F.estoque); F.variacoes = F.variacoes.map(v => Object.assign({}, v, { estoque: v.estoque == null ? '' : String(v.estoque) })); F.faixas = F.faixas.map(f => ({ min: String(f.min), preco: numIn(f.preco) })); }
    const cats = [...new Set(S.produtos.map(p => p.categoria).filter(Boolean))].sort();
    const eu = {};
    let enviando = 0;
    function draw() {
      const comVar = M('l_variacoes') && F.variacoes.length > 0;
      const html = `
        <div class="field"><span class="lbl">Fotos (a primeira é a capa)</span><div class="fotos">
          ${F.fotos.map((f, i) => `<div class="f"><img alt="" src="${esc(f.url)}">${i === 0 ? '<span class="cap">capa</span>' : `<button type="button" class="noprint" data-capa="${i}" style="left:4px;right:auto" aria-label="Usar como capa">★</button>`}<button type="button" data-rmf="${i}" aria-label="Tirar foto">×</button></div>`).join('')}
          ${F.fotos.length < 6 ? `<label class="add" for="ff">${enviando ? 'Enviando…' : '📷<br>Adicionar foto'}</label><input type="file" id="ff" accept="image/*" multiple hidden>` : ''}</div>
          ${F.fotos.length < 6 ? `<div class="row" style="margin-top:8px;align-items:center;flex-wrap:wrap;gap:8px"><button type="button" class="btn sm" id="fweb">🔎 Buscar imagem na internet</button><div id="fcola" tabindex="0" role="textbox" aria-label="Colar imagem do produto" class="small muted" style="flex:1;min-width:180px;border:1.5px dashed currentColor;border-radius:10px;padding:8px 10px;cursor:text">Copiou uma imagem (Ctrl+C)? Clique aqui e cole com <b>Ctrl+V</b>.</div></div>` : ''}</div>
        <div class="field"><label for="pn">Nome do produto</label><input type="text" id="pn" maxlength="80" value="${esc(F.nome)}" placeholder="Ex.: Vestido midi floral"></div>
        <div class="grid2"><div class="field"><label for="pp">Preço (R$)</label><input inputmode="decimal" class="money" id="pp" value="${esc(F.preco)}" placeholder="0,00"></div>
          <div class="field"><label for="pd">Preço "de" riscado (opcional)</label><input inputmode="decimal" id="pd" value="${esc(F.precoDe)}" placeholder="Ex.: 199,90"></div></div>
        <div class="field"><label for="pc">Categoria</label><input type="text" id="pc" maxlength="40" value="${esc(F.categoria)}" placeholder="Ex.: Vestidos" list="pcl"><datalist id="pcl">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          ${cats.length ? `<div class="chips">${cats.slice(0, 12).map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${F.categoria === c}">${esc(c)}</button>`).join('')}</div>` : ''}</div>
        <div class="grid2"><div class="field"><label for="pcd">Código / EAN (opcional)</label><input type="text" id="pcd" maxlength="30" value="${esc(F.codigo || '')}" placeholder="Ex.: 7891234567890"></div>
          <div class="field"><label for="pcu">Custo (só você vê)</label><input inputmode="decimal" id="pcu" value="${esc(F.custo)}" placeholder="Ex.: 45,00"></div></div>
        <div class="field"><label for="pdz">Descrição (opcional)</label><textarea id="pdz" maxlength="1500" placeholder="Tecido, medidas, como usar…">${esc(F.descricao || '')}</textarea></div>
        <div class="field"><span class="lbl">Vende por</span><div class="chips">${S.unidades.map(u => `<button type="button" class="chip" data-un="${u}" aria-pressed="${F.unidade === u}">${({ un: 'unidade', kg: 'kg', pct: 'pacote', cx: 'caixa', par: 'par', kit: 'kit' })[u]}</button>`).join('')}</div></div>
        ${M('l_variacoes') ? `<section class="card"><h3>Tamanhos, cores ou opções</h3>
          ${comVar ? `<div class="field"><label for="pg">Nome da opção</label><input type="text" id="pg" maxlength="20" value="${esc(F.grupoVar || '')}" placeholder="Ex.: Tamanho, Cor, Sabor"></div>
            ${F.variacoes.map((v, i) => `<div class="vrow"><input type="text" data-vn="${i}" maxlength="30" value="${esc(v.nome)}" aria-label="Opção ${i + 1}">${M('l_estoque') ? `<input inputmode="numeric" data-ve="${i}" value="${esc(v.estoque)}" placeholder="estoque" aria-label="Estoque de ${esc(v.nome)}">` : '<span></span>'}<button type="button" class="x" data-vr="${i}" aria-label="Tirar opção">×</button></div>`).join('')}
            <button class="btn sm" type="button" id="va">+ Opção</button>` : `<p class="small muted">Sem opções. Se o produto tem tamanhos ou cores, comece por um modelo:</p>`}
          <div class="chips">${PRESETS.map(([g, l], i) => `<button type="button" class="chip" data-pre="${i}">${g}: ${l.slice(0, 3).join(', ')}…</button>`).join('')}</div>
          ${M('l_estoque') && comVar ? '<p class="small muted">Estoque em branco = não controla. 0 = esgotado.</p>' : ''}</section>` : ''}
        ${M('l_estoque') && !comVar ? `<div class="field"><label for="pe">Estoque (opcional)</label><input inputmode="numeric" id="pe" value="${esc(F.estoque)}" placeholder="Em branco = não controla"></div>` : ''}
        ${M('l_volume') ? `<section class="card"><h3>Preço por quantidade</h3><p class="small muted">Levando mais, paga menos. Vale somando todos os tamanhos e cores do produto.</p>
          ${F.faixas.map((f, i) => `<div class="frow"><span>A partir de</span><input inputmode="numeric" data-fm="${i}" value="${esc(f.min)}" aria-label="Quantidade"><span>un.:</span><input inputmode="decimal" data-fp="${i}" value="${esc(f.preco)}" placeholder="R$ cada" aria-label="Preço de cada"><button type="button" class="x" data-fr="${i}" aria-label="Tirar faixa">×</button></div>`).join('')}
          ${F.faixas.length < 5 ? '<button class="btn sm" type="button" id="fa">+ Faixa de quantidade</button>' : ''}</section>` : ''}
        <label class="row"><input type="checkbox" id="pa" ${F.ativo ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> Aparece na vitrine</label>
        <label class="row"><input type="checkbox" id="pz" ${F.destaque ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> ⭐ Destaque (aparece primeiro)</label>
        <p class="neg small" id="pe2" role="alert" style="font-weight:600;min-height:16px"></p>
        <button class="btn pri full" type="button" id="ps" ${enviando ? 'disabled' : ''}>${edit ? 'Salvar produto' : 'Publicar na vitrine'}</button>
        ${edit ? '<button class="btn dan full" type="button" id="px">Excluir produto</button>' : ''}`;
      openSheet(edit ? 'Editar produto' : 'Novo produto', html, bind);
      folhaAtual = eu;
    }
    const aberto = () => folhaAtual === eu && !!$('#sheet').innerHTML;
    function redesenhar() { if (!aberto()) return; keep(); const pn = $('#sheet .pn'), y = pn ? pn.scrollTop : 0; draw(); const n = $('#sheet .pn'); if (n) n.scrollTop = y; }
    function keep() {
      const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
      [['pn', 'nome'], ['pp', 'preco'], ['pd', 'precoDe'], ['pc', 'categoria'], ['pdz', 'descricao'], ['pg', 'grupoVar'], ['pe', 'estoque'], ['pcd', 'codigo'], ['pcu', 'custo']].forEach(([id, k]) => { const v = g(id); if (v !== undefined) F[k] = v; });
      const a = $('#pa'); if (a) F.ativo = a.checked; const z = $('#pz'); if (z) F.destaque = z.checked;
      document.querySelectorAll('#sheet [data-vn]').forEach(i => { F.variacoes[+i.dataset.vn].nome = i.value; });
      document.querySelectorAll('#sheet [data-ve]').forEach(i => { F.variacoes[+i.dataset.ve].estoque = i.value; });
      document.querySelectorAll('#sheet [data-fm]').forEach(i => { F.faixas[+i.dataset.fm].min = i.value; });
      document.querySelectorAll('#sheet [data-fp]').forEach(i => { F.faixas[+i.dataset.fp].preco = i.value; });
    }
    function bind(pn) {
      const redraw = () => { const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; };
      async function enviarFotos(lista) {
        const files = lista.slice(0, 6 - F.fotos.length); if (!files.length) return;
        enviando = files.length; redesenhar();
        for (const f of files) {
          try { const data = await reduzir(f); const r = await api('/api/loja/admin/foto', { data }); if (F.fotos.length < 6) F.fotos.push({ id: r.id, url: r.url }); }
          catch (e) { if (e.status === 401) { enviando = 0; if (aberto()) keep(); retomar = () => formProduto(F); return fail(e); } toast(e.message, true); }
          enviando--; redesenhar();
        }
      }
      const ff = $('#ff'); if (ff) ff.addEventListener('change', () => enviarFotos([...ff.files]));
      /* buscar imagem na internet: abre o Google Imagens com o nome do produto */
      const fw = $('#fweb'); if (fw) fw.addEventListener('click', () => {
        const nm = ($('#pn') ? $('#pn').value : F.nome || '').trim();
        if (!nm) { toast('Escreva o nome do produto primeiro'); const n = $('#pn'); if (n) n.focus(); return; }
        window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(nm), '_blank', 'noopener');
        toast('Achou? Botão direito na imagem › Copiar imagem, e cole aqui com Ctrl+V. No celular: salve e use "Adicionar foto".');
      });
      /* Ctrl+V: imagem copiada vira foto (texto colado nos campos continua normal) */
      if (!pn.dataset.colaOk) { pn.dataset.colaOk = '1'; pn.addEventListener('paste', e => {
        if (!$('#ff')) return;
        const imgs = [...((e.clipboardData && e.clipboardData.items) || [])].filter(it => it.kind === 'file' && /^image\//.test(it.type)).map(it => it.getAsFile()).filter(Boolean);
        if (!imgs.length) return;
        e.preventDefault(); keep(); enviarFotos(imgs);
      }); }
      pn.querySelectorAll('[data-rmf]').forEach(b => b.addEventListener('click', () => { keep(); F.fotos.splice(+b.dataset.rmf, 1); redraw(); }));
      pn.querySelectorAll('[data-capa]').forEach(b => b.addEventListener('click', () => { keep(); const [f] = F.fotos.splice(+b.dataset.capa, 1); F.fotos.unshift(f); redraw(); }));
      pn.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { keep(); F.categoria = b.dataset.cat; redraw(); }));
      pn.querySelectorAll('[data-un]').forEach(b => b.addEventListener('click', () => { keep(); F.unidade = b.dataset.un; redraw(); }));
      pn.querySelectorAll('[data-pre]').forEach(b => b.addEventListener('click', () => {
        keep(); const [g, l] = PRESETS[+b.dataset.pre];
        if (F.variacoes.length && !confirm('Trocar as opções atuais por "' + g + '"?')) return;
        F.grupoVar = g; F.variacoes = l.map(n => ({ id: 'v' + hex(4), nome: n, estoque: '' })); redraw();
      }));
      const va = $('#va'); if (va) va.addEventListener('click', () => { keep(); F.variacoes.push({ id: 'v' + hex(4), nome: '', estoque: '' }); redraw(); });
      pn.querySelectorAll('[data-vr]').forEach(b => b.addEventListener('click', () => { keep(); F.variacoes.splice(+b.dataset.vr, 1); redraw(); }));
      const fa = $('#fa'); if (fa) fa.addEventListener('click', () => { keep(); const last = F.faixas[F.faixas.length - 1]; F.faixas.push({ min: String(last ? (toInt(last.min) || 2) + 3 : 3), preco: '' }); redraw(); });
      pn.querySelectorAll('[data-fr]').forEach(b => b.addEventListener('click', () => { keep(); F.faixas.splice(+b.dataset.fr, 1); redraw(); }));
      $('#ps').addEventListener('click', salvar);
      const px = $('#px'); if (px) px.addEventListener('click', async () => {
        if (!confirm('Excluir "' + F.nome + '"? Ele sai da vitrine. Os pedidos antigos continuam guardados.')) return;
        px.disabled = true;
        try { await api('/api/loja/admin/produto/excluir', { id: F.id }); await reload(); closeSheet(); toast('Produto excluído'); render(); } catch (e) { px.disabled = false; fail(e); }
      });
    }
    async function salvar() {
      keep(); const err = m => { $('#pe2').textContent = m; };
      const preco = toNum(F.preco), precoDe = toNum(F.precoDe);
      if (String(F.nome).trim().length < 2) return err('Escreva o nome do produto.');
      if (!(preco > 0)) return err('Informe o preço.');
      if (Number.isNaN(precoDe) || (precoDe != null && precoDe <= preco)) return err('O preço "de" precisa ser maior que o preço de venda (ou deixe em branco).');
      const comVar = M('l_variacoes') && F.variacoes.length > 0;
      const vars = [];
      for (const v of (M('l_variacoes') ? F.variacoes : [])) {
        if (!String(v.nome).trim()) return err('Dê um nome para cada opção, ou tire a vazia.');
        const e = toInt(v.estoque); if (Number.isNaN(e)) return err('Estoque de ' + v.nome + ': use só números.');
        const x = { id: v.id, nome: v.nome.trim(), estoque: e };
        if (vistoVar.has(v.id)) x.estoqueVisto = vistoVar.get(v.id);
        vars.push(x);
      }
      const fx = [];
      for (const f of (M('l_volume') ? F.faixas : [])) {
        const mi = toInt(f.min), pr = toNum(f.preco);
        if (!(mi >= 2)) return err('Faixa: a quantidade precisa ser 2 ou mais.');
        if (!(pr > 0)) return err('Faixa a partir de ' + mi + ': informe o preço de cada.');
        if (pr >= preco) return err('Faixa a partir de ' + mi + ': o preço precisa ser menor que ' + money(preco) + '.');
        fx.push({ min: mi, preco: pr });
      }
      const est = toInt(F.estoque); if (Number.isNaN(est)) return err('Estoque: use só números.');
      const custo = toNum(F.custo); if (Number.isNaN(custo)) return err('Custo: use só números (ex.: 45,00).');
      const codigo = String(F.codigo || '').trim().replace(/\s+/g, ''); if (codigo && !/^[A-Za-z0-9._\/-]{1,30}$/.test(codigo)) return err('Código: use só letras, números, ponto ou traço.');
      if (enviando) return err('Espere as fotos terminarem de enviar.');
      const b = { id: F.id, nome: F.nome, preco, precoDe, categoria: F.categoria, descricao: F.descricao, unidade: F.unidade, fotos: F.fotos.map(f => f.id), grupoVar: comVar ? (F.grupoVar || 'Opção') : '', variacoes: vars, estoque: comVar ? null : est, faixas: fx, ativo: F.ativo, destaque: F.destaque, codigo, custo: custo == null ? '' : r2(custo) };
      if (edit) b.estoqueVisto = vistoProd;
      const bt = $('#ps'); bt.disabled = true;
      try { await api('/api/loja/admin/produto', b); await reload(); closeSheet(); toast(edit ? 'Produto salvo' : 'Publicado na vitrine ✓'); if (view !== 'produtos') go('produtos'); else render(); }
      catch (e) { bt.disabled = false; if (e.status === 401) { retomar = () => formProduto(F); return fail(e); } err(e.message); }
    }
    draw();
  }

  /* ---------- Minha loja (configurações) ---------- */
  function vLoja() {
    const c = S.config, C = JSON.parse(JSON.stringify(c));
    $('#main').innerHTML = `<h1>Minha loja</h1>
      <section class="card"><div class="between"><h2>Recebendo pedidos?</h2><button type="button" class="chip" id="ab" aria-pressed="${!!C.aberta}">${C.aberta ? '🟢 Aberta' : '🔴 Fechada'}</button></div>
        <p class="small muted">Fechada, a vitrine continua aparecendo, mas não deixa enviar pedido.</p></section>
      <section class="card"><h2>Link da loja</h2><div class="link-box"><code>${esc(lojaUrl())}</code><button class="btn sm" type="button" id="cp">Copiar</button><a class="btn sm" href="${esc(lojaUrl())}" target="_blank" rel="noopener">Ver loja</a></div></section>
      <section class="card"><h2>Contato</h2>
        <div class="field"><label for="cw">WhatsApp da loja (com DDD)</label><input type="tel" id="cw" maxlength="20" value="${esc(fone(C.whatsapp))}" placeholder="27 99999-0000"></div>
        <div class="field"><label for="ce">Endereço da loja</label><input type="text" id="ce" maxlength="200" value="${esc(C.endereco)}"></div>
        <div class="field"><label for="ch">Horário</label><input type="text" id="ch" maxlength="120" value="${esc(C.horario)}" placeholder="Seg a sáb, 9h às 18h"></div>
        <div class="field"><label for="cb">Mensagem de boas-vindas na vitrine</label><input type="text" id="cb" maxlength="300" value="${esc(C.boasVindas)}" placeholder="Novidades toda semana!"></div></section>
      <section class="card"><h2>Pagamento</h2><p class="small muted">O cliente escolhe na hora de pedir. O pagamento é combinado com a loja (o app não cobra cartão online).</p>
        <div class="chips">${Object.entries(S.pagamentosNomes).map(([k, n]) => `<button type="button" class="chip" data-pg="${k}" aria-pressed="${C.pagamentos.includes(k)}">${esc(n)}</button>`).join('')}</div>
        <div class="field"><label for="cx">Chave PIX (aparece para o cliente)</label><input type="text" id="cx" maxlength="77" value="${esc(C.pixChave)}"></div></section>
      <section class="card"><h2>Retirada e entrega</h2>
        ${M('l_entrega') ? `<label class="row"><input type="checkbox" id="cr" ${C.retirada ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> Cliente retira na loja</label>
          <label class="row"><input type="checkbox" id="cen" ${C.entrega ? 'checked' : ''} style="width:24px;height:24px;accent-color:var(--brand)"> Faço entrega</label>
          <div class="grid2"><div class="field"><label for="ct">Taxa de entrega (R$)</label><input inputmode="decimal" id="ct" value="${esc(numIn(C.taxaEntrega || ''))}" placeholder="0,00"></div>
          <div class="field"><label for="cg">Entrega grátis a partir de (R$, opcional)</label><input inputmode="decimal" id="cg" value="${esc(numIn(C.entregaGratisDe || ''))}" placeholder="Ex.: 80,00"></div></div>
          <div class="field"><label for="co">Onde entrega</label><input type="text" id="co" maxlength="200" value="${esc(C.entregaObs)}" placeholder="Centro e bairros próximos"></div>
          <p class="small muted">Com um valor em "Entrega grátis a partir de", o cliente vê na vitrine e no carrinho quanto falta para ganhar a entrega.</p>` : '<p class="small muted">Só retirada na loja (entrega desligada na Central).</p>'}
        <div class="field"><label for="cm">Pedido mínimo (R$, opcional)</label><input inputmode="decimal" id="cm" value="${esc(numIn(C.pedidoMinimo || ''))}" placeholder="0,00"></div></section>
      <section class="card"><h2>Previsão para o cliente</h2><p class="small muted">Aparece ao fechar o pedido e na confirmação. Deixe em branco o que não usar.</p>
        <div class="grid2"><div class="field"><label for="ctp">Tempo de preparo (min)</label><input inputmode="numeric" id="ctp" value="${esc(C.tempoPreparo ? String(C.tempoPreparo) : '')}" placeholder="Ex.: 40"></div>
        <div class="field"><label for="ceh">Entrega hoje até</label><input type="text" id="ceh" maxlength="40" value="${esc(C.entregaHoje || '')}" placeholder="Ex.: Entrega hoje até 18h"></div></div></section>
      <section class="card"><div class="between"><h2>Cupons de desconto</h2><button class="btn sm gold" type="button" id="ncp">+ Cupom</button></div>
        ${(C.cupons || []).length ? `<div class="list">${C.cupons.map((c, i) => `<div class="it cup"><span class="ic">🎟️</span><span class="tx"><b>${esc(c.codigo)} <span class="small muted">· ${c.tipo === 'pct' ? c.valor + '% de desconto' : money(c.valor) + ' de desconto'}</span></b><span>${esc([c.minimo ? 'mínimo ' + money(c.minimo) : '', c.validade ? 'até ' + c.validade.split('-').reverse().join('/') : '', c.primeiraCompra ? 'só 1ª compra' : '', c.ativo === false ? '⏸️ desativado' : 'ativo', 'usado ' + ((S.cuponsUso || {})[c.codigo] || 0) + 'x'].filter(Boolean).join(' · '))}</span></span><button class="btn sm" type="button" data-cpt="${i}">${c.ativo === false ? 'Ativar' : 'Desativar'}</button></div>`).join('')}</div>` : '<p class="small muted">Nenhum cupom. Crie um código (ex.: BEMVINDO10) para o cliente digitar no carrinho.</p>'}</section>
      <p class="neg small" id="cerr" role="alert" style="font-weight:600;min-height:16px"></p>
      <button class="btn pri full" type="button" id="cs">Salvar</button>`;
    $('#cp').addEventListener('click', copiarLink);
    $('#ab').addEventListener('click', () => { C.aberta = !C.aberta; const b = $('#ab'); b.setAttribute('aria-pressed', String(C.aberta)); b.textContent = C.aberta ? '🟢 Aberta' : '🔴 Fechada'; });
    document.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.pg; C.pagamentos = C.pagamentos.includes(k) ? C.pagamentos.filter(x => x !== k) : C.pagamentos.concat(k); b.setAttribute('aria-pressed', String(C.pagamentos.includes(k))); }));
    /* o que está nos campos agora (para salvar junto com um cupom novo sem perder o que a dona digitou) */
    function montarConfig(err) {
      const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
      const taxa = toNum(v('ct')), min = toNum(v('cm')), gratis = toNum(v('cg')), prep = toInt(v('ctp'));
      if (Number.isNaN(taxa) || Number.isNaN(min) || Number.isNaN(gratis)) return err('Valores: use só números (ex.: 10,00).');
      if (Number.isNaN(prep) || prep > 1440) return err('Tempo de preparo: só o número de minutos (até 1440).');
      if (!C.pagamentos.length) return err('Marque pelo menos uma forma de pagamento.');
      const b = { aberta: C.aberta, whatsapp: v('cw'), endereco: v('ce'), horario: v('ch'), boasVindas: v('cb'), pagamentos: C.pagamentos, pixChave: v('cx'), retirada: $('#cr') ? $('#cr').checked : true, entrega: $('#cen') ? $('#cen').checked : false, taxaEntrega: taxa || 0, entregaObs: v('co'), pedidoMinimo: min || 0,
        entregaGratisDe: gratis || 0, tempoPreparo: prep || 0, entregaHoje: v('ceh'), cupons: C.cupons || [] };
      if (M('l_entrega') && !b.retirada && !b.entrega) return err('Marque retirada, entrega ou as duas.');
      return b;
    }
    async function salvarConfig(bt, err, ok) {
      const b = montarConfig(err); if (!b) return;
      bt.disabled = true;
      try { await api('/api/loja/admin/config', b); await reload(); toast(ok || 'Loja salva'); closeSheet(); render(); }
      catch (e) { bt.disabled = false; if (e.status === 401 || e.login) { retomar = () => { go('loja'); toast('A sessão tinha terminado antes de salvar: confira a loja e salve de novo.', true); return true; }; return fail(e); } err(e.message); }
    }
    $('#cs').addEventListener('click', () => salvarConfig($('#cs'), m => { $('#cerr').textContent = m; }));
    document.querySelectorAll('[data-cpt]').forEach(b => b.addEventListener('click', () => { const c = C.cupons[+b.dataset.cpt]; c.ativo = c.ativo === false; salvarConfig(b, m => { $('#cerr').textContent = m; }, 'Cupom ' + c.codigo + (c.ativo ? ' ativado' : ' desativado')); }));
    $('#ncp').addEventListener('click', () => {
      const N = { tipo: 'pct', primeiraCompra: false };
      openSheet('Novo cupom', `
        <div class="field"><label for="kc">Código (o cliente digita no carrinho)</label><input type="text" id="kc" maxlength="20" autocapitalize="characters" placeholder="Ex.: BEMVINDO10" style="text-transform:uppercase"></div>
        <div class="field"><span class="lbl">Desconto</span><div class="chips"><button type="button" class="chip" data-kt="pct" aria-pressed="true">% do pedido</button><button type="button" class="chip" data-kt="reais" aria-pressed="false">R$ fixo</button></div></div>
        <div class="grid2"><div class="field"><label for="kv">Valor do desconto</label><input inputmode="decimal" id="kv" placeholder="Ex.: 10"></div>
        <div class="field"><label for="km">Pedido mínimo (R$, opcional)</label><input inputmode="decimal" id="km" placeholder="Ex.: 50,00"></div></div>
        <div class="field"><label for="kd">Vale até (opcional)</label><input type="date" id="kd"></div>
        <label class="row"><input type="checkbox" id="kp" style="width:24px;height:24px;accent-color:var(--brand)"> Só na primeira compra (WhatsApp sem pedido anterior)</label>
        <p class="neg small" id="ke" role="alert" style="font-weight:600;min-height:16px"></p>
        <button class="btn pri full" type="button" id="ks">Salvar cupom</button>`, pn => {
        pn.querySelectorAll('[data-kt]').forEach(b => b.addEventListener('click', () => { N.tipo = b.dataset.kt; pn.querySelectorAll('[data-kt]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.kt === N.tipo))); }));
        $('#ks').addEventListener('click', () => {
          const err = m => { $('#ke').textContent = m; };
          const codigo = $('#kc').value.trim().toUpperCase().replace(/\s+/g, ''), valor = toNum($('#kv').value), minimo = toNum($('#km').value);
          if (!/^[A-Z0-9]{2,20}$/.test(codigo)) return err('Código: só letras e números, de 2 a 20, sem espaço.');
          if ((C.cupons || []).some(c => c.codigo === codigo)) return err('Já existe um cupom ' + codigo + '.');
          if (!(valor > 0) || (N.tipo === 'pct' && valor > 100)) return err(N.tipo === 'pct' ? 'Desconto em %: de 1 a 100.' : 'Informe o valor do desconto.');
          if (Number.isNaN(minimo)) return err('Pedido mínimo: use só números.');
          C.cupons = (C.cupons || []).concat([{ codigo, tipo: N.tipo, valor: r2(valor), minimo: minimo || 0, validade: $('#kd').value || '', primeiraCompra: $('#kp').checked, ativo: true }]);
          salvarConfig($('#ks'), err, 'Cupom ' + codigo + ' criado');
        });
      });
    });
  }

  /* ---------- pedidos novos: confere a cada 30 s ---------- */
  setInterval(async () => {
    if (!S || document.hidden || $('#sheet').innerHTML) return;
    try {
      await reload();
      const n = S.pedidos.filter(p => p.status === 'novo').length;
      if (ultimoNovos != null && n > ultimoNovos) { toast('🛍️ Pedido novo chegou!'); try { navigator.vibrate && navigator.vibrate(200); } catch (e) { /* sem vibração */ } }
      ultimoNovos = n;
      if (view === 'inicio' || view === 'pedidos') render();
    } catch (e) { /* tenta de novo depois */ }
  }, 30000);

  async function start() {
    try { await reload(); }
    catch (e) { if (e.mustReset) return showReset(); if (e.status === 401 || e.login || e.status === 403) return showLogin(e.status === 403 ? e.message : ''); $('#main').innerHTML = '<div class="card"><p class="warn">' + esc(e.message) + '</p><button class="btn" type="button" id="rt">Tentar de novo</button></div>'; $('#rt').addEventListener('click', start); return; }
    ultimoNovos = S.pedidos.filter(p => p.status === 'novo').length;
    $('#bn').hidden = false; $('#sair').hidden = false;
    const h = location.hash.slice(1);
    go(['inicio', 'pedidos', 'produtos', 'loja'].includes(h) ? h : 'inicio', true);
    if (retomar) { const f = retomar; retomar = null; if (f() !== true) toast('O que você estava fazendo continua aqui. Confira e salve.'); }
  }
  if (brand.name) $('#coName').textContent = brand.name;
  if (brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)) document.documentElement.style.setProperty('--brand', brand.color);
  start();
})();

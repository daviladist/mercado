'use strict';
/* Tino — vitrine da Loja online (cliente). Só a tela: preço, estoque e total são conferidos no servidor (lib/loja.js). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const hex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const dataHora = s => { try { const d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }
  const ST = { novo: 'Recebido pela loja', confirmado: 'Confirmado', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
  const UN = { un: 'un.', kg: 'kg', pct: 'pct', cx: 'cx', par: 'par', kit: 'kit' };

  /* guardado só neste aparelho (o carrinho, os dados do cliente para não digitar de novo e os links dos pedidos) */
  const mem = {
    get(k, d) { try { const v = localStorage.getItem(k + ':' + slug); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k + ':' + slug, JSON.stringify(v)); } catch (e) { /* sem espaço ou bloqueado */ } }
  };
  let V = null, cart = mem.get('tino-carrinho', []), filtroCat = '', busca = '', enviando = false;
  if (!Array.isArray(cart)) cart = [];

  async function api(path, body) {
    const h = { 'X-App': '1', 'X-Tenant': slug || '@' };
    const opt = body === undefined ? { headers: h } : { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem internet. Confira a conexão e tente de novo.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status });
    return j;
  }
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 6000 : 2600); }

  /* ---------- preço: igual ao servidor (faixa pela quantidade TOTAL do produto no carrinho) ---------- */
  const prod = id => V.produtos.find(p => p.id === id);
  const qtdProduto = (pid, lista) => (lista || cart).filter(i => i.produtoId === pid).reduce((a, i) => a + i.qtd, 0);
  const unit = (p, qTotal) => { let u = p.preco; (p.faixas || []).forEach(f => { if (qTotal >= f.min && f.preco < u) u = f.preco; }); return u; };
  function totais() {
    let sub = 0;
    const linhas = cart.map(i => { const p = prod(i.produtoId); const u = r2(unit(p, qtdProduto(p.id))); const t = r2(u * i.qtd); sub += t; return { i, p, u, t }; });
    return { linhas, sub: r2(sub) };
  }
  const salvarCart = () => { mem.set('tino-carrinho', cart); barra(); };
  function limparCart() {
    // tira do carrinho o que não está mais à venda (produto ou opção)
    const antes = cart.length;
    cart = cart.filter(i => { const p = prod(i.produtoId); if (!p || !(i.qtd >= 1)) return false; if (p.variacoes.length) return p.variacoes.some(v => v.id === i.variacaoId && v.disponivel); return p.disponivel && !i.variacaoId; });
    if (cart.length !== antes) { salvarCart(); toast('Alguns itens saíram do carrinho porque não estão mais disponíveis.'); }
  }
  function barra() {
    const n = cart.reduce((a, i) => a + i.qtd, 0);
    $('#cartN').hidden = !n; $('#cartN').textContent = n;
    if (!V) return;
    const vis = n > 0 && !location.hash.startsWith('#pedido');
    $('#cartbar').hidden = !vis;
    if (vis) { $('#cartTxt').textContent = 'Ver carrinho (' + n + ')'; $('#cartTot').textContent = money(totais().sub); }
  }

  /* ---------- folha e Voltar do celular ---------- */
  function openSheet(title, html, onReady) {
    if (!$('#sheet').innerHTML) history.pushState({ sheet: 1 }, '', location.hash || location.pathname);
    $('#sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="pn"><div class="tt"><h2>${esc(title)}</h2><button type="button" class="x" id="shx" aria-label="Fechar">×</button></div>${html}</div></div>`;
    $('#shx').addEventListener('click', fechar);
    $('#sheet .sheet').addEventListener('click', e => { if (e.target.classList.contains('sheet')) fechar(); });
    if (onReady) onReady($('#sheet .pn'));
  }
  function closeSheet() { if (!$('#sheet').innerHTML) return; $('#sheet').innerHTML = ''; if (history.state && history.state.sheet) history.replaceState(null, '', location.hash || location.pathname); }
  function fechar() { if (history.state && history.state.sheet) history.back(); else closeSheet(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').innerHTML) fechar(); });
  window.addEventListener('popstate', () => { if ($('#sheet').innerHTML) { $('#sheet').innerHTML = ''; return; } rota(); });
  $('#cartTop').addEventListener('click', () => carrinho());
  $('#cartBtn').addEventListener('click', () => carrinho());

  /* ---------- vitrine ---------- */
  function vitrine() {
    const C = V.config;
    const cats = [...new Set(V.produtos.map(p => p.categoria).filter(Boolean))].sort();
    const q = busca.trim().toLowerCase();
    const L = V.produtos.filter(p => (!filtroCat || p.categoria === filtroCat) && (!q || (p.nome + ' ' + (p.categoria || '') + ' ' + (p.descricao || '')).toLowerCase().includes(q)));
    const meus = mem.get('tino-pedidos', []);
    $('#main').innerHTML = `
      ${!C.aberta ? '<p class="warn">A loja está fechada para pedidos no momento. Você pode olhar os produtos e voltar mais tarde.</p>' : ''}
      <section class="hero"><h1>${esc(V.loja.nome)}</h1>${C.boasVindas ? `<p>${esc(C.boasVindas)}</p>` : ''}
        <p>${esc([C.retirada ? 'Retirada na loja' : '', C.entrega ? 'Entrega' + (C.taxaEntrega ? ' ' + money(C.taxaEntrega) : ' grátis') : ''].filter(Boolean).join(' · '))}${C.pedidoMinimo ? ' · pedido mínimo ' + money(C.pedidoMinimo) : ''}</p></section>
      ${meus.length ? `<button class="btn full" type="button" id="mp">📦 Meus pedidos (${meus.length})</button>` : ''}
      <div class="search"><input type="text" id="bq" placeholder="Buscar produto" value="${esc(busca)}" aria-label="Buscar produto"></div>
      ${cats.length > 1 ? `<div class="cats-row" role="group" aria-label="Categorias"><button type="button" class="chip" data-c="" aria-pressed="${!filtroCat}">Tudo</button>${cats.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${filtroCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${L.length ? `<div class="grid">${L.map(card).join('')}</div>` : `<div class="card empty"><div class="big">🛍️</div><p class="muted">${V.produtos.length ? 'Nada encontrado.' : 'A loja ainda está colocando os produtos. Volte em breve!'}</p></div>`}
      <section class="card"><h3>${esc(V.loja.nome)}</h3>${C.endereco ? `<p class="small">📍 ${esc(C.endereco)}</p>` : ''}${C.horario ? `<p class="small">🕘 ${esc(C.horario)}</p>` : ''}${C.whatsapp ? `<a class="btn full" href="https://wa.me/${esc(zap(C.whatsapp))}" target="_blank" rel="noopener">💬 Falar com a loja no WhatsApp</a>` : ''}</section>
      <p class="tino">Loja feita com <b>Tino</b></p>`;
    document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => produto(b.dataset.p)));
    document.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { filtroCat = b.dataset.c; vitrine(); }));
    const bq = $('#bq'); bq.addEventListener('input', () => { busca = bq.value; const pos = bq.selectionStart; vitrine(); const n = $('#bq'); n.focus(); n.setSelectionRange(pos, pos); });
    const mp = $('#mp'); if (mp) mp.addEventListener('click', meusPedidos);
    barra();
  }
  const zap = tel => { const d = String(tel || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d; };
  function card(p) {
    const f = (p.faixas || [])[0];
    const off = !p.disponivel || (p.variacoes.length && !p.variacoes.some(v => v.disponivel));
    return `<button type="button" class="pc" data-p="${esc(p.id)}"><div class="im">${p.fotos[0] ? `<img alt="" loading="lazy" src="${esc(p.fotos[0].url)}">` : '🛍️'}${off ? '<span class="tag off">Esgotado</span>' : p.precoDe ? '<span class="tag">Oferta</span>' : p.destaque ? '<span class="tag">Destaque</span>' : ''}</div>
      <div class="bd"><span class="nm">${esc(p.nome)}</span>${p.precoDe ? `<span class="de">${money(p.precoDe)}</span>` : ''}<span class="pr">${money(p.preco)}${p.unidade !== 'un' ? ' <small style="font-size:12px;font-weight:600">/' + esc(UN[p.unidade] || p.unidade) + '</small>' : ''}</span>
      ${f ? `<span class="fx">A partir de ${f.min}: ${money(f.preco)} cada</span>` : ''}</div></button>`;
  }

  /* ---------- produto ---------- */
  function produto(id) {
    const p = prod(id); if (!p) return;
    const off = !p.disponivel || (p.variacoes.length && !p.variacoes.some(v => v.disponivel));
    let vid = p.variacoes.length === 1 && p.variacoes[0].disponivel ? p.variacoes[0].id : null, qtd = 1;
    function draw() {
      const jaNoCarrinho = qtdProduto(p.id);
      const u = unit(p, jaNoCarrinho + qtd);
      const prox = (p.faixas || []).find(f => f.min > jaNoCarrinho + qtd);
      openSheet(p.nome, `
        ${p.fotos.length ? `<div class="gal">${p.fotos.map(f => `<img alt="" src="${esc(f.url)}">`).join('')}</div>${p.fotos.length > 1 ? '<p class="small muted" style="text-align:center">Arraste para ver mais fotos</p>' : ''}` : ''}
        <div><p>${p.precoDe ? `<span class="de" style="text-decoration:line-through;color:var(--muted)">${money(p.precoDe)}</span> ` : ''}<b style="font-size:24px;color:var(--brand)">${money(p.preco)}</b>${p.unidade !== 'un' ? ' / ' + esc(UN[p.unidade] || p.unidade) : ''}</p>
        ${(p.faixas || []).length ? `<div class="note">💰 Levando mais, paga menos:<br>${p.faixas.map(f => 'a partir de <b>' + f.min + '</b>: ' + money(f.preco) + ' cada').join('<br>')}${p.variacoes.length ? '<br><span class="small">(vale somando tamanhos e cores)</span>' : ''}</div>` : ''}</div>
        ${p.descricao ? `<p style="white-space:pre-line">${esc(p.descricao)}</p>` : ''}
        ${p.variacoes.length ? `<div class="field"><span class="lbl">${esc(p.grupoVar || 'Opção')}</span><div class="chips">${p.variacoes.map(v => `<button type="button" class="chip" data-v="${esc(v.id)}" aria-pressed="${vid === v.id}" ${v.disponivel ? '' : 'disabled style="opacity:.4;text-decoration:line-through"'}>${esc(v.nome)}</button>`).join('')}</div></div>` : ''}
        ${off ? '<p class="warn">Esgotado no momento.</p>' : `
        <div class="between"><div class="qty"><button type="button" id="qm" aria-label="Menos">−</button><input inputmode="numeric" id="qv" value="${qtd}" aria-label="Quantidade"><button type="button" id="qp" aria-label="Mais">+</button></div>
          <div style="text-align:right"><b style="font-size:20px">${money(r2(u * qtd))}</b>${u < p.preco ? `<br><span class="small pos">${money(u)} cada (preço por quantidade)</span>` : ''}</div></div>
        ${prox ? `<p class="small pos">Leve ${prox.min - jaNoCarrinho} ou mais e pague ${money(prox.preco)} cada.</p>` : ''}
        ${jaNoCarrinho ? `<p class="small muted">Você já tem ${jaNoCarrinho} deste produto no carrinho.</p>` : ''}
        <p class="neg small" id="pe" role="alert" style="font-weight:600;min-height:16px"></p>
        <button class="btn pri full" type="button" id="add" ${V.config.aberta ? '' : 'disabled'}>${V.config.aberta ? 'Colocar no carrinho' : 'Loja fechada no momento'}</button>`}`, pn => {
        pn.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { vid = b.dataset.v; redraw(pn); }));
        const qv = $('#qv'); if (!qv) return;
        $('#qm').addEventListener('click', () => { qtd = Math.max(1, qtd - 1); redraw(pn); });
        $('#qp').addEventListener('click', () => { qtd = Math.min(999, qtd + 1); redraw(pn); });
        qv.addEventListener('change', () => { const n = parseInt(qv.value, 10); qtd = n >= 1 && n <= 999 ? n : 1; redraw(pn); });
        $('#add').addEventListener('click', () => {
          if (p.variacoes.length && !vid) { $('#pe').textContent = 'Escolha ' + (p.grupoVar || 'a opção').toLowerCase() + '.'; return; }
          const l = cart.find(i => i.produtoId === p.id && (i.variacaoId || null) === vid);
          if (l) l.qtd = Math.min(999, l.qtd + qtd); else cart.push({ produtoId: p.id, variacaoId: vid, qtd });
          salvarCart(); closeSheet(); toast('Colocado no carrinho ✓');
        });
      });
    }
    function redraw(pn) { const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; }
    draw();
  }

  /* ---------- carrinho e envio ---------- */
  function carrinho() {
    if (!V) return;
    limparCart();
    if (!cart.length) { openSheet('Carrinho', '<div class="empty"><div class="big">🛒</div><p class="muted">Seu carrinho está vazio.</p></div><button class="btn pri full" type="button" id="cv">Ver produtos</button>', () => $('#cv').addEventListener('click', fechar)); return; }
    const T = totais(), C = V.config, falta = C.pedidoMinimo && T.sub < C.pedidoMinimo ? r2(C.pedidoMinimo - T.sub) : 0;
    openSheet('Carrinho', `<div>${T.linhas.map(({ i, p, u, t }, k) => { const v = p.variacoes.find(x => x.id === i.variacaoId); return `<div class="ci"><span class="th">${p.fotos[0] ? `<img alt="" src="${esc(p.fotos[0].url)}">` : '🛍️'}</span>
        <div style="min-width:0"><b style="font-size:14px">${esc(p.nome)}</b>${v ? `<br><span class="small muted">${esc((p.grupoVar || 'Opção') + ': ' + v.nome)}</span>` : ''}<br><span class="small">${money(u)} cada${u < p.preco ? ' <span class="pos">(por quantidade)</span>' : ''}</span>
        <div class="qty sm" style="margin-top:6px"><button type="button" data-m="${k}" aria-label="Menos">−</button><input readonly value="${i.qtd}" aria-label="Quantidade"><button type="button" data-mais="${k}" aria-label="Mais">+</button></div></div>
        <b>${money(t)}</b></div>`; }).join('')}</div>
      <section class="card"><div class="between"><span>Subtotal</span><b>${money(T.sub)}</b></div>${falta ? `<p class="warn">Falta ${money(falta)} para o pedido mínimo de ${money(C.pedidoMinimo)}.</p>` : ''}</section>
      <button class="btn pri full" type="button" id="go" ${falta || !C.aberta ? 'disabled' : ''}>${C.aberta ? 'Continuar' : 'Loja fechada no momento'}</button>
      <button class="btn full" type="button" id="mais">Continuar comprando</button>`, pn => {
      pn.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.m; cart[k].qtd--; if (cart[k].qtd < 1) cart.splice(k, 1); salvarCart(); carrinho(); }));
      pn.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.mais; cart[k].qtd = Math.min(999, cart[k].qtd + 1); salvarCart(); carrinho(); }));
      $('#mais').addEventListener('click', fechar);
      const go = $('#go'); if (go) go.addEventListener('click', finalizar);
    });
  }
  function finalizar() {
    const C = V.config, cli = mem.get('tino-cliente', {});
    const F = { nome: cli.nome || '', telefone: cli.telefone || '', entrega: C.retirada ? 'retirada' : 'entrega', endereco: cli.endereco || '', pagamento: (C.pagamentos || [])[0] || '', obs: '' };
    function draw() {
      const T = totais(), taxa = F.entrega === 'entrega' ? C.taxaEntrega : 0;
      openSheet('Finalizar pedido', `
        <div class="field"><label for="fn">Seu nome</label><input type="text" id="fn" maxlength="80" autocomplete="name" value="${esc(F.nome)}"></div>
        <div class="field"><label for="ft">WhatsApp (com DDD)</label><input type="tel" id="ft" maxlength="20" autocomplete="tel" value="${esc(F.telefone)}" placeholder="27 99999-0000"></div>
        ${C.retirada && C.entrega ? `<div class="field"><span class="lbl">Como quer receber?</span><div class="chips"><button type="button" class="chip" data-e="retirada" aria-pressed="${F.entrega === 'retirada'}">🏪 Retirar na loja</button><button type="button" class="chip" data-e="entrega" aria-pressed="${F.entrega === 'entrega'}">🛵 Entrega${C.taxaEntrega ? ' (' + money(C.taxaEntrega) + ')' : ''}</button></div></div>` : `<p class="small">${C.entrega ? '🛵 Entrega' + (C.taxaEntrega ? ' (' + money(C.taxaEntrega) + ')' : '') : '🏪 Retirada na loja' + (C.endereco ? ': ' + esc(C.endereco) : '')}</p>`}
        ${F.entrega === 'entrega' ? `<div class="field"><label for="fe">Endereço de entrega</label><textarea id="fe" maxlength="300" autocomplete="street-address" placeholder="Rua, número, bairro, ponto de referência">${esc(F.endereco)}</textarea>${C.entregaObs ? `<span class="small muted">Entregamos: ${esc(C.entregaObs)}</span>` : ''}</div>` : ''}
        <div class="field"><span class="lbl">Pagamento</span><div class="chips">${(C.pagamentos || []).map(k => `<button type="button" class="chip" data-g="${esc(k)}" aria-pressed="${F.pagamento === k}">${esc(V.pagamentosNomes[k] || k)}</button>`).join('')}</div>
          ${F.pagamento === 'pix' && C.pixChave ? `<span class="small">Chave PIX da loja: <b>${esc(C.pixChave)}</b> (pague depois que a loja confirmar)</span>` : ''}</div>
        <div class="field"><label for="fo">Observação (opcional)</label><input type="text" id="fo" maxlength="500" value="${esc(F.obs)}" placeholder="Ex.: troco para R$ 100"></div>
        <section class="card"><div class="between"><span>Produtos</span><span>${money(T.sub)}</span></div>${taxa ? `<div class="between"><span>Entrega</span><span>${money(taxa)}</span></div>` : ''}<div class="between"><b>Total</b><b style="font-size:20px">${money(r2(T.sub + taxa))}</b></div></section>
        <p class="neg small" id="fer" role="alert" style="font-weight:600;min-height:16px"></p>
        <button class="btn pri full" type="button" id="env">Enviar pedido</button>
        <p class="small muted" style="text-align:center">A loja recebe o pedido e confirma com você pelo WhatsApp.</p>`, bind);
    }
    function keep() { const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; }; [['fn', 'nome'], ['ft', 'telefone'], ['fe', 'endereco'], ['fo', 'obs']].forEach(([id, k]) => { const v = g(id); if (v !== undefined) F[k] = v; }); }
    function bind(pn) {
      const redraw = () => { keep(); const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; };
      pn.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => { keep(); F.entrega = b.dataset.e; redraw(); }));
      pn.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { keep(); F.pagamento = b.dataset.g; redraw(); }));
      $('#env').addEventListener('click', enviar);
    }
    async function enviar() {
      keep(); const err = m => { $('#fer').textContent = m; };
      if (enviando) return;
      if (F.nome.trim().length < 2) return err('Escreva o seu nome.');
      const d = F.telefone.replace(/\D/g, ''); if (d.length < 10 || d.length > 13) return err('Escreva o WhatsApp com DDD.');
      if (F.entrega === 'entrega' && F.endereco.trim().length < 5) return err('Escreva o endereço de entrega.');
      if (!F.pagamento) return err('Escolha a forma de pagamento.');
      const T = totais(), taxa = F.entrega === 'entrega' ? C.taxaEntrega : 0, total = r2(T.sub + taxa);
      // id e chave do pedido saem do aparelho: tocar duas vezes não envia dois pedidos, e só quem tem o link acompanha
      const pend = mem.get('tino-envio', null);
      const env = pend && pend.cart === JSON.stringify(cart) ? pend : { id: 'o' + hex(8), chave: hex(16), cart: JSON.stringify(cart) };
      mem.set('tino-envio', env);
      enviando = true; const bt = $('#env'); bt.disabled = true; bt.textContent = 'Enviando…';
      try {
        const r = await api('/api/loja/pedido', { id: env.id, chave: env.chave, itens: cart, cliente: { nome: F.nome, telefone: F.telefone }, entrega: F.entrega, endereco: F.endereco, pagamento: F.pagamento, obs: F.obs, totalVisto: total });
        mem.set('tino-cliente', { nome: F.nome, telefone: F.telefone, endereco: F.endereco });
        const meus = mem.get('tino-pedidos', []); meus.unshift({ numero: r.numero, chave: env.chave, em: new Date().toISOString(), total }); mem.set('tino-pedidos', meus.slice(0, 30));
        const resumo = cart.map(i => { const p = prod(i.produtoId), v = p && p.variacoes.find(x => x.id === i.variacaoId); return i.qtd + 'x ' + (p ? p.nome : '') + (v ? ' (' + v.nome + ')' : ''); }).join(', ');
        cart = []; salvarCart(); mem.set('tino-envio', null);
        closeSheet(); sucesso(r.numero, env.chave, total, F, resumo);
      } catch (e) {
        enviando = false; bt.disabled = false; bt.textContent = 'Enviar pedido';
        if (e.status === 409) { await carregar(true); limparCart(); err(e.message); return; }
        if (e.status === 0) { err(e.message + ' O pedido NÃO foi enviado ainda.'); return; }
        err(e.message);
      }
      enviando = false;
    }
    draw();
  }
  function sucesso(numero, chave, total, F, resumo) {
    history.pushState(null, '', '#pedido/' + chave);
    const C = V.config, msg = `Olá! Acabei de fazer o pedido nº ${numero} na loja online (${money(total)}). ${resumo}. Nome: ${F.nome}.`;
    $('#main').innerHTML = `<div class="card empty"><div class="big">✅</div><h1>Pedido nº ${numero} enviado!</h1><p>A ${esc(V.loja.nome)} recebeu o seu pedido de <b>${money(total)}</b> e vai confirmar com você.</p>
      ${C.whatsapp ? `<a class="btn pri full" href="https://wa.me/${esc(zap(C.whatsapp))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 Avisar a loja no WhatsApp</a>` : ''}
      <button class="btn full" type="button" id="acp">Acompanhar o pedido</button><button class="btn full" type="button" id="vt">Voltar para a loja</button>
      <p class="small muted">Guarde este endereço: é por ele que você acompanha o pedido.</p></div>`;
    $('#cartbar').hidden = true;
    $('#acp').addEventListener('click', () => acompanhar(chave));
    $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); });
  }
  async function acompanhar(chave) {
    $('#cartbar').hidden = true;
    $('#main').innerHTML = '<p class="muted">Buscando o pedido…</p>';
    let r; try { r = await api('/api/loja/acompanhar?c=' + encodeURIComponent(chave)); } catch (e) { $('#main').innerHTML = `<div class="card"><p class="warn">${esc(e.message)}</p><button class="btn" type="button" id="vt">Voltar para a loja</button></div>`; $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); }); return; }
    const p = r.pedido, ordem = ['novo', 'confirmado', 'pronto', 'entregue'], at = ordem.indexOf(p.status);
    $('#main').innerHTML = `<div class="row"><button class="btn sm" type="button" id="vt">← Loja</button></div>
      <h1>Pedido nº ${p.numero}</h1><p class="muted small">${dataHora(p.criadoEm)}</p>
      ${p.status === 'cancelado' ? '<p class="warn">Este pedido foi cancelado pela loja.' + (p.historico.slice(-1)[0] && p.historico.slice(-1)[0].motivo ? ' Motivo: ' + esc(p.historico.slice(-1)[0].motivo) : '') + '</p>' : `<section class="card">${ordem.map((s, k) => `<div class="passo ${k < at ? 'on' : k === at ? 'agora' : ''}"><i>${k < at ? '✓' : k + 1}</i><span>${esc(s === 'pronto' ? (p.entrega === 'entrega' ? 'Saiu para entrega' : 'Pronto para retirar') : ST[s])}</span></div>`).join('')}</section>`}
      <section class="card">${p.itens.map(i => `<div class="between"><span>${i.qtd}x ${esc(i.nome)}${i.variacao ? ' (' + esc(i.variacao) + ')' : ''}</span><span>${money(i.total)}</span></div>`).join('')}
        ${p.taxaEntrega ? `<div class="between"><span>Entrega</span><span>${money(p.taxaEntrega)}</span></div>` : ''}<div class="between"><b>Total</b><b>${money(p.total)}</b></div>
        <p class="small muted">${p.entrega === 'entrega' ? 'Entrega' : 'Retirada na loja'} · ${esc(V.pagamentosNomes[p.pagamento] || p.pagamento)}</p></section>
      <button class="btn full" type="button" id="at">Atualizar</button>`;
    $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); });
    $('#at').addEventListener('click', () => acompanhar(chave));
  }
  function meusPedidos() {
    const L = mem.get('tino-pedidos', []);
    openSheet('Meus pedidos', `<div class="list">${L.map(p => `<button type="button" class="it" data-k="${esc(p.chave)}"><span class="ic">📦</span><span class="tx"><b>Pedido nº ${esc(p.numero)}</b><span>${dataHora(p.em)}</span></span><span class="vl">${money(p.total)}</span></button>`).join('')}</div><p class="small muted">Ficam guardados só neste aparelho.</p>`, pn => {
      pn.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.k; closeSheet(); history.pushState(null, '', '#pedido/' + k); acompanhar(k); }));
    });
  }

  /* ---------- início ---------- */
  function rota() {
    const m = /^#pedido\/([a-f0-9]{32})$/.exec(location.hash);
    if (m) return acompanhar(m[1]);
    vitrine();
  }
  async function carregar(silencioso) {
    try { V = await api('/api/loja/vitrine'); }
    catch (e) { if (silencioso) return; $('#main').innerHTML = `<div class="card empty"><div class="big">🏪</div><p>${esc(e.message)}</p><button class="btn" type="button" id="rt">Tentar de novo</button></div>`; $('#rt').addEventListener('click', () => carregar()); return; }
    $('#coName').textContent = V.loja.nome; document.title = V.loja.nome;
    if (V.loja.cor && /^#[0-9a-f]{6}$/i.test(V.loja.cor)) document.documentElement.style.setProperty('--brand', V.loja.cor);
    if (V.loja.logo && !carregar.logo) { carregar.logo = true; $('#lg').innerHTML = '<img alt="" src="/api/logo?t=' + encodeURIComponent(V.loja.id) + '">'; }
    if (!silencioso) { limparCart(); rota(); }
  }
  if (brand.name) $('#coName').textContent = brand.name;
  if (brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)) document.documentElement.style.setProperty('--brand', brand.color);
  carregar();
})();

'use strict';
/* Tino — vitrine da Loja online (cliente). Só a tela: preço, estoque, cupom, entrega grátis e total são conferidos no servidor (lib/loja.js). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const moneyC = v => money(v).replace(/,00$/, ''); // R$ 8 em vez de R$ 8,00 (linha curta)
  const hex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const dataHora = s => { try { const d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const slug = (/^\/t\/([a-z0-9-]{1,40})/.exec(location.pathname) || [])[1] || '';
  let brand = {}; try { brand = JSON.parse((document.querySelector('meta[name="tino-brand"]') || {}).content || '{}'); } catch (e) { brand = {}; }
  const ST = { novo: 'Recebido pela loja', confirmado: 'Confirmado', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
  const UN = { un: 'un.', kg: 'kg', pct: 'pct', cx: 'cx', par: 'par', kit: 'kit' };
  /* telefone do jeito que a pessoa lê: (27) 99999-0000 */
  const fmtTel = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); d = d.slice(0, 11); if (!d.length) return ''; if (d.length <= 2) return '(' + d; if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2); if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6); return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7); };

  /* guardado só neste aparelho (o carrinho, os dados do cliente para não digitar de novo, os links dos pedidos e o cupom digitado) */
  const mem = {
    get(k, d) { try { const v = localStorage.getItem(k + ':' + slug); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k + ':' + slug, JSON.stringify(v)); } catch (e) { /* sem espaço ou bloqueado */ } }
  };
  let V = null, cart = mem.get('tino-carrinho', []), filtroCat = '', busca = '', ordem = 'rel', enviando = false, cupom = mem.get('tino-cupom', null);
  if (!Array.isArray(cart)) cart = [];
  if (cupom && (typeof cupom !== 'object' || !cupom.codigo)) cupom = null;
  // carrinho de outra visita (mais de 30 min sem abrir a loja): avisa no topo
  let abandonado = cart.length > 0 && Date.now() - (Number(mem.get('tino-visita', 0)) || 0) > 30 * 60 * 1000;
  const tocar = () => mem.set('tino-visita', Date.now());
  tocar(); document.addEventListener('visibilitychange', () => { if (document.hidden) tocar(); });

  async function api(path, body) {
    const h = { 'X-App': '1', 'X-Tenant': slug || '@' };
    const opt = body === undefined ? { headers: h } : { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(body) };
    let r; try { r = await fetch(path, opt); } catch (e) { throw Object.assign(new Error('Sem internet. Confira a conexão e tente de novo.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro ' + r.status), { status: r.status });
    return j;
  }
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 6000 : 2600); }

  /* ---------- preço: igual ao servidor (faixa pela quantidade TOTAL do produto no carrinho; cupom; entrega grátis a partir de X) ---------- */
  const prod = id => V.produtos.find(p => p.id === id);
  const qtdProduto = (pid, lista) => (lista || cart).filter(i => i.produtoId === pid).reduce((a, i) => a + i.qtd, 0);
  const unit = (p, qTotal) => { let u = p.preco; (p.faixas || []).forEach(f => { if (qTotal >= f.min && f.preco < u) u = f.preco; }); return u; };
  const descontoDe = sub => !cupom || sub <= 0 || (cupom.minimo > 0 && sub < cupom.minimo) ? 0 : r2(Math.min(sub, cupom.tipo === 'pct' ? sub * cupom.valor / 100 : cupom.valor));
  const taxaDe = (sub, entrega) => { const C = V.config; if (entrega !== 'entrega') return 0; if (C.entregaGratisDe > 0 && sub >= C.entregaGratisDe) return 0; return r2(C.taxaEntrega); };
  function totais() {
    let sub = 0;
    const linhas = cart.map(i => { const p = prod(i.produtoId); const u = r2(unit(p, qtdProduto(p.id))); const t = r2(u * i.qtd); sub += t; return { i, p, u, t }; });
    sub = r2(sub);
    const desc = descontoDe(sub);
    return { linhas, sub, desc, n: cart.reduce((a, i) => a + i.qtd, 0) };
  }
  const salvarCart = () => { mem.set('tino-carrinho', cart); barra(); };
  const disponivel = p => p.disponivel && (!p.variacoes.length || p.variacoes.some(v => v.disponivel));
  const simples = p => disponivel(p) && !p.variacoes.length; // dá para colocar no carrinho com 1 toque
  const linhaSimples = pid => cart.find(i => i.produtoId === pid && !i.variacaoId);
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
    if (vis) { const T = totais(); $('#cartTxt').textContent = 'Ver carrinho (' + n + ')'; $('#cartTot').textContent = money(T.sub - T.desc); }
  }
  /* põe (ou soma) um produto simples no carrinho e avisa */
  function addSimples(pid, qtd) {
    const p = prod(pid); if (!p || !simples(p) || !V.config.aberta) return false;
    const l = linhaSimples(pid);
    if (l) l.qtd = Math.min(999, l.qtd + (qtd || 1)); else cart.push({ produtoId: pid, variacaoId: null, qtd: qtd || 1 });
    salvarCart(); atualizarCartoes(pid); return true;
  }
  function mudarSimples(pid, delta) {
    const l = linhaSimples(pid); if (!l) return;
    l.qtd = Math.min(999, l.qtd + delta); if (l.qtd < 1) cart.splice(cart.indexOf(l), 1);
    salvarCart(); atualizarCartoes(pid);
  }

  /* ---------- folha e Voltar do celular ---------- */
  function openSheet(title, html, onReady) {
    if (!$('#sheet').innerHTML) history.pushState({ sheet: 1 }, '', location.hash || location.pathname);
    $('#sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="pn"><div class="tt"><h2>${esc(title)}</h2><button type="button" class="x" id="shx" aria-label="Fechar">×</button></div>${html}</div></div>`;
    $('#shx').addEventListener('click', fechar);
    $('#sheet .sheet').addEventListener('click', e => { if (e.target.classList.contains('sheet')) fechar(); });
    if (onReady) onReady($('#sheet .pn'));
  }
  const semLinkProduto = () => { if (/^#p\//.test(location.hash)) history.replaceState(history.state, '', location.pathname); };
  function closeSheet() { if (!$('#sheet').innerHTML) return; $('#sheet').innerHTML = ''; if (history.state && history.state.sheet) history.replaceState(null, '', location.hash || location.pathname); semLinkProduto(); }
  function fechar() { if (history.state && history.state.sheet) history.back(); else closeSheet(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').innerHTML) fechar(); });
  window.addEventListener('popstate', () => {
    if ($('#sheet').innerHTML) {
      $('#sheet').innerHTML = '';
      // link de produto digitado/colado com uma folha aberta (entrada nova, sem estado): abre o produto; voltar de uma folha só fecha
      if (/^#p\//.test(location.hash) && history.state === null) { rota(); return; }
      semLinkProduto(); return;
    }
    rota();
  });
  $('#cartTop').addEventListener('click', () => carrinho());
  $('#cartBtn').addEventListener('click', () => carrinho());

  /* ---------- busca tolerante: sem acento, sem caixa, aceita 1 letra errada ou trocada, busca em nome, categoria e descrição ---------- */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palavras = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  function parecido(a, b) { // a e b diferem por no máximo 1 edição (letra a mais, a menos, trocada ou duas letras invertidas)
    if (a === b) return true;
    const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (d) return false; d = 1;
      if (la > lb) i++; else if (lb > la) j++; else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
    }
    return d + (la - i) + (lb - j) <= 1;
  }
  function pontua(p, toks) { // 0 = não bate; maior = mais parecido
    const nn = norm(p.nome), N = palavras(p.nome), Cw = palavras(p.categoria), D = palavras(p.descricao);
    let s = 0;
    for (const t of toks) {
      let b = 0;
      if (nn.includes(t)) b = 10;
      else if (N.some(w => w.startsWith(t))) b = 8;
      else if (t.length >= 4 && N.some(w => parecido(t, w) || (w.length > t.length && parecido(t, w.slice(0, t.length))))) b = 6;
      else if (Cw.some(w => w.startsWith(t) || (t.length >= 4 && parecido(t, w)))) b = 4;
      else if (norm(p.descricao).includes(t) || (t.length >= 4 && D.some(w => parecido(t, w)))) b = 2;
      if (!b) return 0;
      s += b;
    }
    return s;
  }
  function ordenar(L, toks) {
    const sc = new Map(L.map(p => [p.id, toks.length ? pontua(p, toks) : 0]));
    const cmp = { rel: (a, b) => (sc.get(b.id) - sc.get(a.id)) || (b.destaque - a.destaque), menor: (a, b) => a.preco - b.preco, maior: (a, b) => b.preco - a.preco, vend: (a, b) => (b.vendidos || 0) - (a.vendidos || 0) }[ordem] || (() => 0);
    return L.slice().sort(cmp);
  }

  /* ---------- vitrine ---------- */
  const pct = p => p.precoDe ? Math.round((1 - p.preco / p.precoDe) * 100) : 0;
  const etiquetaOferta = p => !p.precoDe ? '' : pct(p) >= 5 ? '-' + pct(p) + '%' : '−' + money(r2(p.precoDe - p.preco)).replace(/ /g, ' ');
  const topCat = (() => { let m = null; return () => { if (m) return m; m = new Map(); V.produtos.forEach(p => { if (p.categoria && (p.vendidos || 0) >= 5 && !(m.get(p.categoria) && m.get(p.categoria).vendidos >= p.vendidos)) m.set(p.categoria, p); }); return m; }; })();
  const maisPedido = p => { const t = topCat().get(p.categoria); return !!(t && t.id === p.id); };
  function condicoes(C) {
    const L = [];
    if (C.entrega) L.push('Entrega ' + (C.taxaEntrega ? moneyC(C.taxaEntrega) : 'grátis') + (C.taxaEntrega && C.entregaGratisDe ? ' · grátis acima de ' + moneyC(C.entregaGratisDe) : ''));
    if (C.retirada) L.push('Retirada');
    if (C.pedidoMinimo) L.push('mín. ' + moneyC(C.pedidoMinimo));
    return L.join(' · ');
  }
  function vitrine() {
    const C = V.config, cli = mem.get('tino-cliente', {});
    const cats = [...new Set(V.produtos.map(p => p.categoria).filter(Boolean))].sort();
    const toks = palavras(busca);
    const base = V.produtos.filter(p => !filtroCat || p.categoria === filtroCat);
    const L = ordenar(toks.length ? base.filter(p => pontua(p, toks) > 0) : base, toks);
    const sug = toks.length ? ordenar(V.produtos.filter(p => pontua(p, toks) > 0), toks).slice(0, 5) : [];
    const meus = mem.get('tino-pedidos', []);
    const prateleiras = !toks.length && !filtroCat ? montarPrateleiras(meus) : [];
    const nCart = cart.reduce((a, i) => a + i.qtd, 0);
    const primeiroNome = (cli.nome || '').trim().split(/\s+/)[0] || '';
    $('#main').innerHTML = `
      ${!C.aberta ? '<p class="warn">A loja está fechada para pedidos no momento. Você pode olhar os produtos e voltar mais tarde.</p>' : ''}
      ${abandonado && nCart ? `<button type="button" class="aband" id="abd">🛒 Você deixou ${nCart} ${nCart === 1 ? 'item' : 'itens'} no carrinho <b>Continuar pedido ›</b></button>` : ''}
      <section class="hero">${primeiroNome ? `<span class="oi">Oi, ${esc(primeiroNome)} 👋</span>` : ''}<h1>${esc(V.loja.nome)}</h1>
        <p class="cond">${esc(condicoes(C))}</p>${C.boasVindas ? `<p class="bv">${esc(C.boasVindas)}</p>` : ''}</section>
      <div class="toprow"><button class="btn sm" type="button" id="sobre">ℹ️ Sobre a loja</button>${meus.length ? `<button class="btn sm" type="button" id="mp">📦 Meus pedidos (${meus.length})</button>` : ''}<span class="selo">💬 Pedido direto no WhatsApp da loja</span></div>
      <div class="search"><input type="text" id="bq" placeholder="Buscar produto" value="${esc(busca)}" aria-label="Buscar produto" autocomplete="off"><select id="ord" aria-label="Ordenar">${[['rel', 'Relevância'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['vend', 'Mais vendidos']].map(([k, n]) => `<option value="${k}" ${ordem === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      ${toks.length && sug.length ? `<div class="sug" role="listbox" aria-label="Sugestões">${sug.map(p => `<button type="button" role="option" data-s="${esc(p.id)}"><span>${esc(p.nome)}</span><b>${money(p.preco)}</b></button>`).join('')}</div>` : ''}
      ${cats.length > 1 ? `<div class="cats-row" role="group" aria-label="Categorias"><button type="button" class="chip" data-c="" aria-pressed="${!filtroCat}">Tudo</button>${cats.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${filtroCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${prateleiras.map(s => `<section class="shelf"><h2>${s.titulo}</h2><div class="rail">${s.itens.map(card).join('')}</div></section>`).join('')}
      ${prateleiras.length && L.length ? '<h2 class="sec">Todos os produtos</h2>' : ''}
      ${L.length ? `<div class="grid">${L.map(card).join('')}</div>` : `<div class="card empty"><div class="big">🛍️</div><p class="muted">${V.produtos.length ? 'Nada encontrado com "' + esc(busca.trim()) + '". Tente outra palavra.' : 'A loja ainda está colocando os produtos. Volte em breve!'}</p></div>`}
      <section class="card"><h3>${esc(V.loja.nome)}</h3>${C.endereco ? `<p class="small">📍 ${esc(C.endereco)}</p>` : ''}${C.horario ? `<p class="small">🕘 ${esc(C.horario)}</p>` : ''}${C.whatsapp ? `<a class="btn full" href="https://wa.me/${esc(zap(C.whatsapp))}" target="_blank" rel="noopener">💬 Falar com a loja no WhatsApp</a>` : ''}</section>
      <p class="tino">Loja feita com <b>Tino</b></p>`;
    bindCartoes($('#main'));
    document.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { filtroCat = b.dataset.c; vitrine(); }));
    document.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => produto(b.dataset.s)));
    const bq = $('#bq'); bq.addEventListener('input', () => { busca = bq.value; const pos = bq.selectionStart; vitrine(); const n = $('#bq'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#ord').addEventListener('change', e => { ordem = e.target.value; vitrine(); });
    const mp = $('#mp'); if (mp) mp.addEventListener('click', meusPedidos);
    $('#sobre').addEventListener('click', sobreLoja);
    const abd = $('#abd'); if (abd) abd.addEventListener('click', () => { abandonado = false; carrinho(); });
    barra();
  }
  /* prateleiras que rolam de lado; cada uma some quando está vazia */
  function montarPrateleiras(meus) {
    const P = V.produtos, out = [];
    const ofertas = P.filter(p => p.precoDe && disponivel(p));
    if (ofertas.length) out.push({ titulo: '🏷️ Ofertas', itens: ofertas.slice(0, 12) });
    const comVenda = P.filter(p => (p.vendidos || 0) > 0 && disponivel(p));
    if (comVenda.length >= 3) out.push({ titulo: '🔥 Mais vendidos', itens: comVenda.slice().sort((a, b) => b.vendidos - a.vendidos).slice(0, 8) });
    const dest = P.filter(p => p.destaque && disponivel(p));
    if (dest.length) out.push({ titulo: '⭐ Destaques', itens: dest.slice(0, 12) });
    const ids = []; meus.forEach(o => (o.itens || []).forEach(i => { if (i && i.produtoId && !ids.includes(i.produtoId)) ids.push(i.produtoId); }));
    const ja = ids.map(id => prod(id)).filter(p => p && disponivel(p)).slice(0, 8);
    if (ja.length) out.push({ titulo: '🔁 Você já pediu', itens: ja });
    return out;
  }
  const zap = tel => { const d = String(tel || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d; };
  function rodapeCartao(p) {
    if (!disponivel(p)) return '<span class="esg">Esgotado</span>';
    if (!V.config.aberta) return '<span class="esg">Loja fechada</span>';
    if (p.variacoes.length) return `<button type="button" class="add" data-p="${esc(p.id)}">Escolher ${esc((p.grupoVar || 'opção').toLowerCase())}</button>`;
    const l = linhaSimples(p.id);
    if (l) return `<div class="qty sm" aria-label="Quantidade de ${esc(p.nome)}"><button type="button" data-m="${esc(p.id)}" aria-label="Menos">−</button><input readonly value="${l.qtd}" aria-label="Quantidade"><button type="button" data-mais="${esc(p.id)}" aria-label="Mais">+</button></div>`;
    return `<button type="button" class="add" data-add="${esc(p.id)}">+ Adicionar</button>`;
  }
  function card(p) {
    const f = (p.faixas || [])[0], off = !disponivel(p);
    const social = (p.vendidos || 0) >= 5 ? '🔥 Já vendeu ' + p.vendidos : p.restam ? '⚡ Só ' + p.restam + ' restantes' : '';
    return `<div class="pc" data-id="${esc(p.id)}"><button type="button" class="pcb" data-p="${esc(p.id)}" aria-label="${esc(p.nome)}"><div class="im">${p.fotos[0] ? `<img alt="" loading="lazy" src="${esc(p.fotos[0].url)}">` : '🛍️'}${off ? '<span class="tag off">Esgotado</span>' : p.precoDe ? `<span class="tag">${esc(etiquetaOferta(p))}</span>` : p.destaque ? '<span class="tag">Destaque</span>' : ''}</div>
      <div class="bd"><span class="nm">${esc(p.nome)}</span>${p.precoDe ? `<span class="de">${money(p.precoDe)}</span>` : ''}<span class="pr">${money(p.preco)}${p.unidade !== 'un' ? ' <small>/' + esc(UN[p.unidade] || p.unidade) + '</small>' : ''}</span>
      ${f ? `<span class="fx">A partir de ${f.min}: ${money(f.preco)} cada</span>` : ''}${social ? `<span class="soc">${social}</span>` : ''}</div></button>
      <div class="pf">${rodapeCartao(p)}</div></div>`;
  }
  function bindCartoes(root) {
    root.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => produto(b.dataset.p)));
    root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { if (addSimples(b.dataset.add, 1)) toast('Colocado no carrinho ✓'); }));
    root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => mudarSimples(b.dataset.m, -1)));
    root.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => mudarSimples(b.dataset.mais, 1)));
  }
  /* depois de mexer no carrinho pelo cartão, só o rodapé daquele produto é redesenhado (a tela não pula) */
  function atualizarCartoes(pid) {
    const p = prod(pid); if (!p) return;
    document.querySelectorAll('.pc[data-id="' + pid + '"] .pf').forEach(el => { el.innerHTML = rodapeCartao(p); bindCartoes(el); });
  }
  function sobreLoja() {
    const C = V.config;
    openSheet('Sobre a loja', `<section class="card">
      ${C.endereco ? `<p>📍 ${esc(C.endereco)}</p>` : ''}${C.horario ? `<p>🕘 ${esc(C.horario)}</p>` : ''}
      <p>${C.entrega ? '🛵 Entrega' + (C.taxaEntrega ? ' ' + money(C.taxaEntrega) : ' grátis') + (C.taxaEntrega && C.entregaGratisDe ? ' · grátis a partir de ' + money(C.entregaGratisDe) : '') + (C.entregaObs ? ' (' + esc(C.entregaObs) + ')' : '') : ''}${C.entrega && C.retirada ? '<br>' : ''}${C.retirada ? '🏪 Retirada na loja' : ''}</p>
      ${C.pedidoMinimo ? `<p>🧾 Pedido mínimo ${money(C.pedidoMinimo)}</p>` : ''}
      <p>💳 ${esc((C.pagamentos || []).map(k => V.pagamentosNomes[k] || k).join(', '))}</p>
      ${C.tempoPreparo || C.entregaHoje ? `<p>⏱️ ${esc(previsao())}</p>` : ''}</section>
      <p class="note">💬 O pedido vai direto para o WhatsApp da loja. Nada é cobrado pelo app: você combina o pagamento com a loja.</p>
      ${C.whatsapp ? `<a class="btn pri full" href="https://wa.me/${esc(zap(C.whatsapp))}" target="_blank" rel="noopener">💬 Falar com a loja no WhatsApp</a>` : ''}`);
  }
  function previsao() {
    const C = V.config, L = [];
    if (C.tempoPreparo) L.push('Pronto em cerca de ' + (C.tempoPreparo >= 60 && C.tempoPreparo % 60 === 0 ? (C.tempoPreparo / 60) + ' h' : C.tempoPreparo + ' min'));
    if (C.entregaHoje) L.push(C.entregaHoje);
    return L.join(' · ');
  }

  /* ---------- produto ---------- */
  const linkProduto = id => location.origin + location.pathname + '#p/' + id;
  async function compartilhar(p) {
    const url = linkProduto(p.id), texto = p.nome + ' por ' + money(p.preco) + ' na ' + V.loja.nome;
    if (navigator.share) { try { await navigator.share({ title: p.nome, text: texto, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto + ' ' + url), '_blank', 'noopener');
  }
  function produto(id) {
    const p = prod(id); if (!p) return;
    const off = !disponivel(p);
    let vid = p.variacoes.length === 1 && p.variacoes[0].disponivel ? p.variacoes[0].id : null, qtd = 1;
    const totHtml = u => `<b style="font-size:20px">${money(r2(u * qtd))}</b>${u < p.preco ? `<br><span class="small pos">${money(u)} cada (preço por quantidade)</span>` : ''}`;
    const junto = (p.junto || []).map(prod).filter(x => x && disponivel(x) && x.id !== p.id).slice(0, 3);
    const selos = [];
    if ((p.vendidos || 0) >= 5) selos.push('🔥 Já vendeu ' + p.vendidos);
    const rest = p.variacoes.length ? (vid && (p.variacoes.find(v => v.id === vid) || {}).restam) : p.restam;
    if (rest) selos.push('⚡ Só ' + rest + ' restantes');
    if (maisPedido(p)) selos.push('🏆 Mais pedido em ' + p.categoria);
    function draw() {
      const jaNoCarrinho = qtdProduto(p.id);
      const u = unit(p, jaNoCarrinho + qtd);
      const prox = (p.faixas || []).find(f => f.min > jaNoCarrinho + qtd);
      openSheet(p.nome, `
        ${p.fotos.length ? `<div class="gal">${p.fotos.map(f => `<img alt="" src="${esc(f.url)}">`).join('')}</div>${p.fotos.length > 1 ? '<p class="small muted" style="text-align:center">Arraste para ver mais fotos</p>' : ''}` : ''}
        <div><p>${p.precoDe ? `<span class="de" style="text-decoration:line-through;color:var(--muted)">${money(p.precoDe)}</span> <span class="tag inl">${esc(etiquetaOferta(p))}</span> ` : ''}<b style="font-size:24px;color:var(--brand-text)">${money(p.preco)}</b>${p.unidade !== 'un' ? ' / ' + esc(UN[p.unidade] || p.unidade) : ''}</p>
        ${selos.length ? `<div class="selos">${selos.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
        ${(p.faixas || []).length ? `<div class="note">💰 Levando mais, paga menos:<br>${p.faixas.map(f => 'a partir de <b>' + f.min + '</b>: ' + money(f.preco) + ' cada').join('<br>')}${p.variacoes.length ? '<br><span class="small">(vale somando tamanhos e cores)</span>' : ''}</div>` : ''}</div>
        ${p.descricao ? `<p style="white-space:pre-line">${esc(p.descricao)}</p>` : ''}
        ${p.variacoes.length ? `<div class="field"><span class="lbl">${esc(p.grupoVar || 'Opção')}</span><div class="chips">${p.variacoes.map(v => `<button type="button" class="chip" data-v="${esc(v.id)}" aria-pressed="${vid === v.id}" ${v.disponivel ? '' : 'disabled style="opacity:.4;text-decoration:line-through"'}>${esc(v.nome)}${v.disponivel && v.restam ? ' <small>(só ' + v.restam + ')</small>' : ''}</button>`).join('')}</div></div>` : ''}
        ${off ? '<p class="warn">Esgotado no momento.</p>' : `
        <div class="between"><div class="qty"><button type="button" id="qm" aria-label="Menos">−</button><input inputmode="numeric" id="qv" value="${qtd}" aria-label="Quantidade"><button type="button" id="qp" aria-label="Mais">+</button></div>
          <div style="text-align:right" id="ptot">${totHtml(u)}</div></div>
        ${prox ? `<p class="small pos">Leve ${prox.min - jaNoCarrinho} ou mais e pague ${money(prox.preco)} cada.</p>` : ''}
        ${jaNoCarrinho ? `<p class="small muted">Você já tem ${jaNoCarrinho} deste produto no carrinho.</p>` : ''}`}
        ${junto.length ? `<section class="card junto"><h3>🧺 Peça junto</h3>${junto.map(x => `<div class="imp"><span class="th">${x.fotos[0] ? `<img alt="" src="${esc(x.fotos[0].url)}">` : '🛍️'}</span><button type="button" class="tx" data-p="${esc(x.id)}"><b>${esc(x.nome)}</b><span>${money(x.preco)}</span></button>${x.variacoes.length ? `<button type="button" class="btn sm" data-p="${esc(x.id)}">Ver</button>` : linhaSimples(x.id) ? `<span class="small pos">no carrinho ✓</span>` : `<button type="button" class="btn sm" data-add="${esc(x.id)}">+ Adicionar</button>`}</div>`).join('')}</section>` : ''}
        <p class="neg small" id="pe" role="alert" style="font-weight:600;min-height:16px"></p>
        <div class="foot"><button class="btn" type="button" id="shr" aria-label="Compartilhar">📤</button>${off ? '<button class="btn pri full" type="button" disabled>Esgotado</button>' : `<button class="btn pri full" type="button" id="add" ${V.config.aberta ? '' : 'disabled'}>${V.config.aberta ? 'Colocar no carrinho' : 'Loja fechada no momento'}</button>`}</div>`, pn => {
        pn.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { vid = b.dataset.v; redraw(pn); }));
        $('#shr').addEventListener('click', () => compartilhar(p));
        pn.querySelectorAll('.junto [data-p]').forEach(b => b.addEventListener('click', () => { closeSheet(); produto(b.dataset.p); }));
        pn.querySelectorAll('.junto [data-add]').forEach(b => b.addEventListener('click', () => { if (addSimples(b.dataset.add, 1)) { toast('Colocado no carrinho ✓'); redraw(pn); } }));
        const qv = $('#qv'); if (!qv) return;
        $('#qm').addEventListener('click', () => { qtd = Math.max(1, qtd - 1); redraw(pn); });
        $('#qp').addEventListener('click', () => { qtd = Math.min(999, qtd + 1); redraw(pn); });
        qv.addEventListener('input', () => { const n = parseInt(qv.value, 10); if (n >= 1 && n <= 999) { qtd = n; const t = $('#ptot'); if (t) t.innerHTML = totHtml(unit(p, qtdProduto(p.id) + qtd)); } });
        qv.addEventListener('blur', () => { const n = parseInt(qv.value, 10); if (!(n >= 1 && n <= 999)) { qtd = 1; qv.value = '1'; const t = $('#ptot'); if (t) t.innerHTML = totHtml(unit(p, qtdProduto(p.id) + qtd)); } });
        $('#add').addEventListener('click', () => {
          if (p.variacoes.length && !vid) { $('#pe').textContent = 'Escolha ' + (p.grupoVar || 'a opção').toLowerCase() + '.'; return; }
          const l = cart.find(i => i.produtoId === p.id && (i.variacaoId || null) === vid);
          if (l) l.qtd = Math.min(999, l.qtd + qtd); else cart.push({ produtoId: p.id, variacaoId: vid, qtd });
          salvarCart(); atualizarCartoes(p.id); closeSheet(); toast('Colocado no carrinho ✓');
        });
      });
    }
    function redraw(pn) { const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; }
    draw();
  }

  /* ---------- carrinho, cupom e envio ---------- */
  function barraGratis(sub) {
    const C = V.config; if (!C.entrega || !(C.entregaGratisDe > 0) || !(C.taxaEntrega > 0)) return '';
    const falta = r2(C.entregaGratisDe - sub), pct = Math.min(100, Math.round(sub / C.entregaGratisDe * 100));
    return `<div class="bar gratis"><div class="l">${falta > 0 ? `<span>Faltam <b>${money(falta)}</b> para a entrega grátis</span>` : '<span>🎉 <b>Entrega grátis!</b></span>'}<span class="small muted">${money(C.entregaGratisDe)}</span></div><div class="tr"><i style="width:${pct}%"></i></div></div>`;
  }
  /* 2 a 3 produtos de impulso: mais vendidos baratos (até 30% do que já está no carrinho), que não estão no carrinho */
  function impulso(sub) {
    const fora = V.produtos.filter(p => simples(p) && !linhaSimples(p.id));
    let L = fora.filter(p => (p.vendidos || 0) > 0 && p.preco <= sub * 0.3).sort((a, b) => b.vendidos - a.vendidos);
    if (L.length < 2) L = fora.filter(p => (p.vendidos || 0) > 0).sort((a, b) => a.preco - b.preco);
    if (L.length < 2) L = fora.slice().sort((a, b) => a.preco - b.preco);
    return L.slice(0, 3);
  }
  async function aplicarCupom(codigo, err, depois) {
    const cod = String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!cod) return err('Escreva o código do cupom.');
    try { const r = await api('/api/loja/cupom?c=' + encodeURIComponent(cod)); cupom = r.cupom; mem.set('tino-cupom', cupom); toast('Cupom ' + cupom.codigo + ' aplicado ✓'); depois(); }
    catch (e) { err(e.message); }
  }
  function tirarCupom() { cupom = null; mem.set('tino-cupom', null); }
  function cupomHtml(sub) {
    const C = V.config; if (!C.temCupom && !cupom) return '';
    if (cupom) { const d = descontoDe(sub); return `<div class="cupom on"><span>🎟️ Cupom <b>${esc(cupom.codigo)}</b>${d ? ' · −' + money(d) : cupom.minimo > sub ? ' · vale a partir de ' + money(cupom.minimo) : ''}</span><button type="button" class="btn sm" id="cx">Tirar</button></div>`; }
    return `<div class="cupom"><input type="text" id="cc" placeholder="Cupom de desconto" aria-label="Cupom de desconto" autocapitalize="characters" autocomplete="off" maxlength="20"><button type="button" class="btn sm" id="ca">Aplicar</button></div><p class="neg small" id="ce" role="alert" style="font-weight:600"></p>`;
  }
  function bindCupom(pn, redesenha) {
    const ca = $('#ca'); if (ca) ca.addEventListener('click', () => { ca.disabled = true; aplicarCupom($('#cc').value, m => { ca.disabled = false; $('#ce').textContent = m; }, redesenha); });
    const cc = $('#cc'); if (cc) cc.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#ca').click(); } });
    const cx = $('#cx'); if (cx) cx.addEventListener('click', () => { tirarCupom(); redesenha(); });
  }
  function carrinho() {
    if (!V) return;
    limparCart();
    if (!cart.length) { openSheet('Carrinho', '<div class="empty"><div class="big">🛒</div><p class="muted">Seu carrinho está vazio.</p></div><button class="btn pri full" type="button" id="cv">Ver produtos</button>', () => $('#cv').addEventListener('click', fechar)); return; }
    const T = totais(), C = V.config, falta = C.pedidoMinimo && T.sub < C.pedidoMinimo ? r2(C.pedidoMinimo - T.sub) : 0, imp = impulso(T.sub);
    openSheet('Carrinho', `<div>${T.linhas.map(({ i, p, u, t }, k) => { const v = p.variacoes.find(x => x.id === i.variacaoId); return `<div class="ci"><span class="th">${p.fotos[0] ? `<img alt="" src="${esc(p.fotos[0].url)}">` : '🛍️'}</span>
        <div style="min-width:0"><b style="font-size:14px">${esc(p.nome)}</b>${v ? `<br><span class="small muted">${esc((p.grupoVar || 'Opção') + ': ' + v.nome)}</span>` : ''}<br><span class="small">${money(u)} cada${u < p.preco ? ' <span class="pos">(por quantidade)</span>' : ''}</span>
        <div class="qty sm" style="margin-top:6px"><button type="button" data-m="${k}" aria-label="Menos">−</button><input readonly value="${i.qtd}" aria-label="Quantidade"><button type="button" data-mais="${k}" aria-label="Mais">+</button></div></div>
        <b>${money(t)}</b></div>`; }).join('')}</div>
      ${barraGratis(T.sub)}
      ${imp.length >= 2 ? `<section class="card junto"><h3>✨ Aproveite e leve também</h3>${imp.map(x => `<div class="imp"><span class="th">${x.fotos[0] ? `<img alt="" src="${esc(x.fotos[0].url)}">` : '🛍️'}</span><span class="tx"><b>${esc(x.nome)}</b><span>${money(x.preco)}</span></span><button type="button" class="btn sm" data-add="${esc(x.id)}">+ Adicionar</button></div>`).join('')}</section>` : ''}
      ${cupomHtml(T.sub)}
      ${falta ? `<p class="warn">Falta ${money(falta)} para o pedido mínimo de ${money(C.pedidoMinimo)}.</p>` : ''}
      <div class="foot col"><div class="between"><span class="small">Subtotal</span><span>${money(T.sub)}</span></div>${T.desc ? `<div class="between pos"><span class="small">Cupom ${esc(cupom.codigo)}</span><span>−${money(T.desc)}</span></div>` : ''}
        <div class="between"><b>Total</b><b style="font-size:20px">${money(T.sub - T.desc)}</b></div>${C.entrega && C.taxaEntrega && !(C.entregaGratisDe > 0 && T.sub >= C.entregaGratisDe) ? '<p class="small muted">+ entrega, se escolher receber em casa</p>' : ''}
        <button class="btn pri full" type="button" id="go" ${falta || !C.aberta ? 'disabled' : ''}>${C.aberta ? 'Continuar' : 'Loja fechada no momento'}</button>
        <button class="btn full sm" type="button" id="mais">Continuar comprando</button></div>`, pn => {
      pn.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.m; const pid = cart[k].produtoId; cart[k].qtd--; if (cart[k].qtd < 1) cart.splice(k, 1); salvarCart(); atualizarCartoes(pid); carrinho(); }));
      pn.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.mais; cart[k].qtd = Math.min(999, cart[k].qtd + 1); salvarCart(); atualizarCartoes(cart[k].produtoId); carrinho(); }));
      pn.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { if (addSimples(b.dataset.add, 1)) { toast('Colocado no carrinho ✓'); carrinho(); } }));
      bindCupom(pn, carrinho);
      $('#mais').addEventListener('click', fechar);
      const go = $('#go'); if (go) go.addEventListener('click', finalizar);
    });
  }
  function finalizar() {
    const C = V.config, cli = mem.get('tino-cliente', {});
    const F = { nome: cli.nome || '', telefone: fmtTel(cli.telefone || ''), entrega: C.retirada ? 'retirada' : 'entrega', endereco: cli.endereco || '', pagamento: (C.pagamentos || [])[0] || '', obs: '' };
    function draw() {
      const T = totais(), taxa = taxaDe(T.sub, F.entrega), total = r2(T.sub - T.desc + taxa), prev = previsao();
      openSheet('Finalizar pedido', `
        <div class="resumo"><span>${T.n} ${T.n === 1 ? 'item' : 'itens'} · <b>${money(total)}</b></span><button type="button" class="btn sm" id="vc">Ver carrinho</button></div>
        <div class="field"><label for="fn">Seu nome</label><input type="text" id="fn" maxlength="80" autocomplete="name" value="${esc(F.nome)}"></div>
        <div class="field"><label for="ft">WhatsApp (com DDD)</label><input type="tel" id="ft" maxlength="16" autocomplete="tel" inputmode="numeric" value="${esc(F.telefone)}" placeholder="(27) 99999-0000"></div>
        ${C.retirada && C.entrega ? `<div class="field"><span class="lbl">Como quer receber?</span><div class="chips"><button type="button" class="chip" data-e="retirada" aria-pressed="${F.entrega === 'retirada'}">🏪 Retirar na loja</button><button type="button" class="chip" data-e="entrega" aria-pressed="${F.entrega === 'entrega'}">🛵 Entrega${C.taxaEntrega ? ' (' + (taxaDe(T.sub, 'entrega') ? money(C.taxaEntrega) : 'grátis') + ')' : ''}</button></div></div>` : `<p class="small">${C.entrega ? '🛵 Entrega' + (C.taxaEntrega ? ' (' + (taxa ? money(C.taxaEntrega) : 'grátis') + ')' : '') : '🏪 Retirada na loja' + (C.endereco ? ': ' + esc(C.endereco) : '')}</p>`}
        ${F.entrega === 'entrega' ? barraGratis(T.sub) : ''}
        ${F.entrega === 'entrega' ? `<div class="field"><label for="fe">Endereço de entrega</label>${cli.endereco && F.endereco !== cli.endereco ? `<button type="button" class="btn sm" id="mesmo" style="justify-self:start">📍 Usar o mesmo endereço de antes</button>` : ''}<textarea id="fe" maxlength="300" autocomplete="street-address" placeholder="Rua, número, bairro, ponto de referência">${esc(F.endereco)}</textarea>${C.entregaObs ? `<span class="small muted">Entregamos: ${esc(C.entregaObs)}</span>` : ''}</div>` : ''}
        <div class="field"><span class="lbl">Pagamento</span><div class="chips">${(C.pagamentos || []).map(k => `<button type="button" class="chip" data-g="${esc(k)}" aria-pressed="${F.pagamento === k}">${esc(V.pagamentosNomes[k] || k)}</button>`).join('')}</div>
          ${F.pagamento === 'pix' && C.pixChave ? `<span class="small">Chave PIX da loja: <b>${esc(C.pixChave)}</b> (pague depois que a loja confirmar)</span>` : ''}</div>
        <div class="field"><label for="fo">Observação (opcional)</label><input type="text" id="fo" maxlength="500" value="${esc(F.obs)}" placeholder="Ex.: troco para R$ 100"></div>
        ${cupomHtml(T.sub)}
        <section class="card"><div class="between"><span>Produtos</span><span>${money(T.sub)}</span></div>${T.desc ? `<div class="between pos"><span>Cupom ${esc(cupom.codigo)}</span><span>−${money(T.desc)}</span></div>` : ''}${F.entrega === 'entrega' && C.taxaEntrega ? `<div class="between"><span>Entrega</span><span>${taxa ? money(taxa) : '<b class="pos">Grátis</b>'}</span></div>` : ''}<div class="between"><b>Total</b><b style="font-size:20px">${money(total)}</b></div>
          ${prev ? `<p class="small">⏱️ ${esc(prev)}</p>` : ''}</section>
        <p class="neg small" id="fer" role="alert" style="font-weight:600;min-height:16px"></p>
        <div class="foot col"><button class="btn pri full" type="button" id="env">Enviar pedido · ${money(total)}</button>
        <p class="small muted" style="text-align:center">💬 O pedido vai direto para o WhatsApp da loja, que confirma com você.</p></div>`, bind);
    }
    function keep() { const g = id => { const e = document.getElementById(id); return e ? e.value : undefined; }; [['fn', 'nome'], ['ft', 'telefone'], ['fe', 'endereco'], ['fo', 'obs']].forEach(([id, k]) => { const v = g(id); if (v !== undefined) F[k] = v; }); }
    function bind(pn) {
      const redraw = () => { keep(); const y = pn.scrollTop; draw(); $('#sheet .pn').scrollTop = y; };
      pn.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => { F.entrega = b.dataset.e; redraw(); }));
      pn.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { F.pagamento = b.dataset.g; redraw(); }));
      const ft = $('#ft'); ft.addEventListener('input', () => { const v = fmtTel(ft.value); if (v !== ft.value) { ft.value = v; } });
      const mesmo = $('#mesmo'); if (mesmo) mesmo.addEventListener('click', () => { F.endereco = cli.endereco; $('#fe').value = cli.endereco; mesmo.hidden = true; });
      const fe = $('#fe'); if (fe) fe.addEventListener('input', () => { const m = $('#mesmo'); if (m) m.hidden = fe.value === cli.endereco; });
      $('#vc').addEventListener('click', () => { keep(); carrinho(); });
      bindCupom(pn, redraw);
      $('#env').addEventListener('click', enviar);
    }
    async function enviar() {
      keep(); const err = m => { $('#fer').textContent = m; };
      if (enviando) return;
      if (F.nome.trim().length < 2) return err('Escreva o seu nome.');
      const d = F.telefone.replace(/\D/g, ''); if (d.length < 10 || d.length > 13) return err('Escreva o WhatsApp com DDD.');
      if (F.entrega === 'entrega' && F.endereco.trim().length < 5) return err('Escreva o endereço de entrega.');
      if (!F.pagamento) return err('Escolha a forma de pagamento.');
      const T = totais(), taxa = taxaDe(T.sub, F.entrega), total = r2(T.sub - T.desc + taxa);
      // id e chave do pedido saem do aparelho: tocar duas vezes não envia dois pedidos, e só quem tem o link acompanha
      const pend = mem.get('tino-envio', null);
      const env = pend && pend.cart === JSON.stringify(cart) ? pend : { id: 'o' + hex(8), chave: hex(16), cart: JSON.stringify(cart) };
      mem.set('tino-envio', env);
      enviando = true; const bt = $('#env'); bt.disabled = true; bt.textContent = 'Enviando…';
      try {
        const r = await api('/api/loja/pedido', { id: env.id, chave: env.chave, itens: cart, cliente: { nome: F.nome, telefone: F.telefone }, entrega: F.entrega, endereco: F.endereco, pagamento: F.pagamento, obs: F.obs, totalVisto: total, cupom: cupom ? cupom.codigo : '' });
        mem.set('tino-cliente', { nome: F.nome, telefone: F.telefone, endereco: F.endereco });
        const meus = mem.get('tino-pedidos', []); meus.unshift({ numero: r.numero, chave: env.chave, em: new Date().toISOString(), total, itens: cart.map(i => ({ produtoId: i.produtoId, variacaoId: i.variacaoId || null, qtd: i.qtd })) }); mem.set('tino-pedidos', meus.slice(0, 30));
        const resumo = cart.map(i => { const p = prod(i.produtoId), v = p && p.variacoes.find(x => x.id === i.variacaoId); return i.qtd + 'x ' + (p ? p.nome : '') + (v ? ' (' + v.nome + ')' : ''); }).join(', ');
        cart = []; salvarCart(); mem.set('tino-envio', null); tirarCupom();
        closeSheet(); sucesso(r.numero, env.chave, total, F, resumo);
      } catch (e) {
        enviando = false; bt.disabled = false; bt.textContent = 'Enviar pedido · ' + money(total);
        if (e.status === 409) { const msg = e.message; await carregar(true); limparCart(); if (!cart.length) { closeSheet(); toast(msg, true); return; } draw(); $('#fer').textContent = msg; return; }
        if (e.status === 0) { err('A internet falhou e o pedido pode não ter chegado. Toque em "Enviar pedido" de novo sem mudar o carrinho: se já tiver chegado, ele não vai em dobro.'); return; }
        if (/cupom/i.test(e.message) && cupom) { tirarCupom(); draw(); $('#fer').textContent = e.message + ' O cupom saiu do pedido.'; return; }
        err(e.message);
      }
      enviando = false;
    }
    draw();
  }
  function sucesso(numero, chave, total, F, resumo) {
    history.pushState(null, '', '#pedido/' + chave);
    const C = V.config, prev = previsao(), msg = `Olá! Acabei de fazer o pedido nº ${numero} na loja online (${money(total)}). ${resumo}. Nome: ${F.nome}.`;
    $('#main').innerHTML = `<div class="card empty"><div class="big">✅</div><h1>Pedido nº ${numero} enviado!</h1><p>A ${esc(V.loja.nome)} recebeu o seu pedido de <b>${money(total)}</b> e vai confirmar com você.</p>
      ${prev ? `<p class="note">⏱️ ${esc(prev)}</p>` : ''}
      ${C.whatsapp ? `<a class="btn pri full" href="https://wa.me/${esc(zap(C.whatsapp))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 Avisar a loja no WhatsApp</a>` : ''}
      <button class="btn full" type="button" id="acp">Acompanhar o pedido</button><button class="btn full" type="button" id="vt">Voltar para a loja</button>
      <p class="small muted">Guarde este endereço: é por ele que você acompanha o pedido.</p></div>`;
    $('#cartbar').hidden = true;
    $('#acp').addEventListener('click', () => acompanhar(chave));
    $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); });
  }
  /* recompra: recoloca os itens de um pedido no carrinho (avisa os que não estão mais à venda) */
  function pedirDeNovo(itens) {
    let ok = 0, fora = 0;
    (itens || []).forEach(i => {
      const p = i && prod(i.produtoId), qtd = Math.min(999, Math.max(1, parseInt(i && i.qtd, 10) || 1));
      if (!p || !disponivel(p)) { fora++; return; }
      if (p.variacoes.length) { const v = p.variacoes.find(x => x.id === i.variacaoId); if (!v || !v.disponivel) { fora++; return; } const l = cart.find(x => x.produtoId === p.id && x.variacaoId === v.id); if (l) l.qtd = Math.min(999, l.qtd + qtd); else cart.push({ produtoId: p.id, variacaoId: v.id, qtd }); }
      else { const l = linhaSimples(p.id); if (l) l.qtd = Math.min(999, l.qtd + qtd); else cart.push({ produtoId: p.id, variacaoId: null, qtd }); }
      ok++; atualizarCartoes(p.id);
    });
    salvarCart();
    if (!ok) { toast('Nenhum item deste pedido está disponível agora.', true); return; }
    toast(ok + (ok === 1 ? ' item voltou' : ' itens voltaram') + ' para o carrinho' + (fora ? ' · ' + fora + ' não ' + (fora === 1 ? 'está' : 'estão') + ' mais disponíve' + (fora === 1 ? 'l' : 'is') : '') + '.', !!fora);
    closeSheet(); if (location.hash.startsWith('#pedido')) { history.pushState(null, '', location.pathname); vitrine(); }
    carrinho();
  }
  async function acompanhar(chave) {
    $('#cartbar').hidden = true;
    $('#main').innerHTML = '<p class="muted">Buscando o pedido…</p>';
    let r; try { r = await api('/api/loja/acompanhar?c=' + encodeURIComponent(chave)); } catch (e) { $('#main').innerHTML = `<div class="card"><p class="warn">${esc(e.message)}</p><button class="btn" type="button" id="vt">Voltar para a loja</button></div>`; $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); }); return; }
    const p = r.pedido, ordem_ = ['novo', 'confirmado', 'pronto', 'entregue'], at = ordem_.indexOf(p.status), prev = previsao();
    $('#main').innerHTML = `<div class="row"><button class="btn sm" type="button" id="vt">← Loja</button></div>
      <h1>Pedido nº ${p.numero}</h1><p class="muted small">${dataHora(p.criadoEm)}</p>
      ${p.status === 'cancelado' ? '<p class="warn">Este pedido foi cancelado pela loja.' + (p.historico.slice(-1)[0] && p.historico.slice(-1)[0].motivo ? ' Motivo: ' + esc(p.historico.slice(-1)[0].motivo) : '') + '</p>' : `<section class="card">${ordem_.map((s, k) => `<div class="passo ${k < at ? 'on' : k === at ? 'agora' : ''}"><i>${k < at ? '✓' : k + 1}</i><span>${esc(s === 'pronto' ? (p.entrega === 'entrega' ? 'Saiu para entrega' : 'Pronto para retirar') : ST[s])}</span></div>`).join('')}${prev && at < 2 ? `<p class="small muted">⏱️ ${esc(prev)}</p>` : ''}</section>`}
      <section class="card">${p.itens.map(i => `<div class="between"><span>${i.qtd}x ${esc(i.nome)}${i.variacao ? ' (' + esc(i.variacao) + ')' : ''}</span><span>${money(i.total)}</span></div>`).join('')}
        ${p.desconto ? `<div class="between pos"><span>Cupom ${esc(p.cupom || '')}</span><span>−${money(p.desconto)}</span></div>` : ''}${p.taxaEntrega ? `<div class="between"><span>Entrega</span><span>${money(p.taxaEntrega)}</span></div>` : ''}<div class="between"><b>Total</b><b>${money(p.total)}</b></div>
        <p class="small muted">${p.entrega === 'entrega' ? 'Entrega' : 'Retirada na loja'} · ${esc(V.pagamentosNomes[p.pagamento] || p.pagamento)}</p></section>
      ${V.config.aberta ? '<button class="btn pri full" type="button" id="again">🔁 Pedir de novo</button>' : ''}
      <button class="btn full" type="button" id="at">Atualizar</button>`;
    $('#vt').addEventListener('click', () => { history.pushState(null, '', location.pathname); vitrine(); });
    $('#at').addEventListener('click', () => acompanhar(chave));
    const ag = $('#again'); if (ag) ag.addEventListener('click', () => pedirDeNovo(p.itens));
  }
  function meusPedidos() {
    const L = mem.get('tino-pedidos', []);
    openSheet('Meus pedidos', `<div class="list">${L.map((p, k) => `<div class="it"><button type="button" class="tx" data-k="${esc(p.chave)}"><b>Pedido nº ${esc(p.numero)}</b><span>${dataHora(p.em)} · ${money(p.total)}</span></button>${(p.itens || []).length && V.config.aberta ? `<button type="button" class="btn sm" data-again="${k}">🔁 Pedir de novo</button>` : ''}</div>`).join('')}</div><p class="small muted">Ficam guardados só neste aparelho.</p>`, pn => {
      pn.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.k; closeSheet(); history.pushState(null, '', '#pedido/' + k); acompanhar(k); }));
      pn.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => pedirDeNovo((L[+b.dataset.again] || {}).itens)));
    });
  }

  /* ---------- início ---------- */
  function rota() {
    const m = /^#pedido\/([a-f0-9]{32})$/.exec(location.hash);
    if (m) return acompanhar(m[1]);
    vitrine();
    // link compartilhado de um produto: /loja#p/<id> abre a vitrine já com o produto
    const lp = /^#p\/(x[a-f0-9]{12})$/.exec(location.hash);
    if (lp) { if (prod(lp[1])) { history.replaceState({ ini: 1 }, '', location.href); produto(lp[1]); } else { toast('Esse produto não está mais na loja.', true); history.replaceState(null, '', location.pathname); } }
  }
  async function carregar(silencioso) {
    if (!silencioso && history.state === null) history.replaceState({ ini: 1 }, '', location.href);
    try { V = await api('/api/loja/vitrine'); }
    catch (e) { if (silencioso) return; $('#main').innerHTML = `<div class="card empty"><div class="big">🏪</div><p>${esc(e.message)}</p><button class="btn" type="button" id="rt">Tentar de novo</button></div>`; $('#rt').addEventListener('click', () => carregar()); return; }
    $('#coName').textContent = V.loja.nome; document.title = V.loja.nome;
    if (V.loja.cor && /^#[0-9a-f]{6}$/i.test(V.loja.cor)) document.documentElement.style.setProperty('--brand', V.loja.cor);
    if (V.loja.logo && !carregar.logo) { carregar.logo = true; $('#lg').innerHTML = '<img alt="" src="/api/logo?t=' + encodeURIComponent(V.loja.id) + '">'; }
    if (!V.config.temCupom) tirarCupom();
    if (!silencioso) { limparCart(); rota(); }
  }
  if (brand.name) $('#coName').textContent = brand.name;
  if (brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)) document.documentElement.style.setProperty('--brand', brand.color);
  carregar();
})();

'use strict';
/*
 * QUEM VÊ O QUÊ e QUEM PODE MUDAR O QUÊ. Tudo decidido aqui, no servidor.
 *  - project(): monta a "fatia" do banco que cada pessoa recebe. Custo, comissão,
 *    margem e dados de outros clientes são retirados ANTES de sair do servidor.
 *  - applySync(): confere cada alteração enviada pelo navegador. Preço é sempre
 *    recalculado com as mesmas regras do app; o que não é permitido é recusado.
 */
const makeCore = require('./core.generated');
const { USER_COLLS, httpErr, uid } = require('./store');

const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const eq = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const near = (a, b, tol = 0.006) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < tol;

function coreFor(S, view, extra) {
  const ui = Object.assign({ view, client: null, cart: {}, mode: 'retirada', pay: '', neg: {}, nf: false, addr: '', note: '' }, extra || {});
  return { C: makeCore(S, ui, uid), ui };
}

/* ---------------------------------------------------------------- leitura */
const STORE_PUBLIC = ['name', 'from', 'to', 'min', 'pickup', 'conds', 'billGate', 'pickupDisc', 'pickupOner', 'pickV', 'onerV', 'autoRec'];
const P_SECRET = ['cost', 'tablePrices', 'stock', 'minStock', 'idealStock', 'minMg', 'trib', 'commission'];
const I_SECRET = ['cost', 'commP', 'commX', 'prevComm'];
const O_SECRET = ['apprMg', 'apprMin', 'apprNeed', 'tolUsed', 'commAdj', 'sellerRate', 'stockApplied'];

function stripProduct(p, role) {
  const x = clone(p);
  P_SECRET.forEach(k => { if (!(role === 'vendedor' && k === 'commission')) delete x[k]; });
  if (role === 'conferente') { delete x.price; delete x.iePrice; delete x.rules; }
  return x;
}
function stripOrder(o, role) {
  const x = clone(o);
  O_SECRET.forEach(k => { if (!(role === 'vendedor' && (k === 'sellerRate' || k === 'commAdj' || k === 'apprNeed'))) delete x[k]; });
  (x.items || []).forEach(i => {
    I_SECRET.forEach(k => { if (!(role === 'vendedor' && k !== 'cost')) delete i[k]; });
    if (role === 'conferente') { delete i.price; delete i.base; delete i.negFrom; delete i.negAsk; delete i.prevPrice; }
  });
  if (role === 'conferente') { ['sub', 'disc', 'total', 'prevTotal', 'totalOrig', 'credit', 'occ'].forEach(k => delete x[k]); (x.sugs || []).forEach(s => { delete s.price; }); }
  if (!['admin', 'vendedor', 'cliente'].includes(role)) delete x.apprHist;
  return x;
}
function publicStore(st, role) {
  const o = {};
  STORE_PUBLIC.forEach(k => { if (st && st[k] !== undefined) o[k] = clone(st[k]); });
  if (st && st.neg) o.neg = { who: st.neg.who, on: st.neg.on, minItems: st.neg.minItems, minTotal: st.neg.minTotal, maxItems: st.neg.maxItems };
  return o;
}
const pick = (o, keys) => { const x = {}; keys.forEach(k => { if (o && o[k] !== undefined) x[k] = clone(o[k]); }); return x; };

function canSeeOrder(o, user, S) {
  const me = user.ref_id;
  switch (user.role) {
    case 'admin': return true;
    case 'cliente': return o.customerId === me;
    case 'vendedor': return o.sellerId === me;
    case 'conferente': return o.status !== 'cancelado' || !!o.checker;
    case 'faturamento': return ['separado', 'pronto', 'saiu', 'concluido', 'separando', 'novo'].includes(o.status);
    case 'entregador': return !!(o.deliv && o.deliv.drv === me) || !!(o.delivered && o.delivered.drv === me);
    default: return false;
  }
}

function project(S, user) {
  const role = user.role, me = user.ref_id;
  if (role === 'admin') { const x = clone(S); return x; }
  const out = { seq: S.seq };
  out.store = publicStore(S.store, role);
  out.payments = clone(S.payments || []);
  out.cashPays = clone(S.cashPays || []);
  out.payDays = clone(S.payDays || {});
  out.catTreeV1 = !!S.catTreeV1;
  out.categories = (S.categories || []).map(c => {
    const x = clone(c); delete x.minMg; if (role !== 'vendedor') delete x.comm;
    (x.subs || []).forEach(s => { delete s.minMg; if (role !== 'vendedor') delete s.comm; });
    return x;
  });
  out.cities = (S.cities || []).map(c => pick(c, ['id', 'name']));
  out.products = (S.products || []).filter(p => role === 'admin' || role === 'conferente' || role === 'faturamento' || p.active !== false).map(p => stripProduct(p, role));
  out.combos = role === 'conferente' ? (S.combos || []).map(c => pick(c, ['id', 'name', 'items', 'active', 'desc'])) : clone((S.combos || []).filter(c => c.active !== false));
  out.orders = (S.orders || []).filter(o => canSeeOrder(o, user, S)).map(o => stripOrder(o, role));
  const custIds = new Set(out.orders.map(o => o.customerId));
  const sellerMe = (S.sellers || []).find(s => s.id === me);
  const CUST_KEYS = { cliente: null, vendedor: ['id', 'name', 'phone', 'address', 'bairro', 'city', 'doc', 'fiscal', 'ieOk', 'pays', 'sellerId', 'creditLimit', 'canNeg', 'table', 'login'],
    faturamento: ['id', 'name', 'doc', 'fiscal', 'ieOk', 'city', 'address', 'bairro', 'phone'], entregador: ['id', 'name', 'phone', 'address', 'bairro', 'city'], conferente: ['id', 'name'] };
  out.customers = (S.customers || []).filter(c => {
    if (role === 'cliente') return c.id === me;
    if (role === 'vendedor') return sellerMe && (sellerMe.allCli || c.sellerId === me);
    return custIds.has(c.id);
  }).map(c => { const x = CUST_KEYS[role] ? pick(c, CUST_KEYS[role]) : clone(c); delete x.pass; delete x.mustReset; if (role !== 'admin') delete x.login; return x; });
  if (role === 'cliente') out.customers.forEach(c => { delete c.hasPass; delete c.notes; });
  const myCust = new Set(out.customers.map(c => c.id));
  out.receivables = (role === 'cliente' || role === 'vendedor') ? (S.receivables || []).filter(r => myCust.has(r.customerId) && (role === 'cliente' || out.orders.some(o => o.id === r.orderId))).map(clone) : [];
  out.sellers = (S.sellers || []).map(s => s.id === me && role === 'vendedor' ? pick(s, ['id', 'name', 'phone', 'commission', 'allCli', 'active']) : pick(s, ['id', 'name']));
  out.vehicles = (S.vehicles || []).filter(v => role === 'entregador' ? v.id === me : role === 'faturamento' || role === 'conferente').map(v => pick(v, ['id', 'driver', 'car']));
  out.checkers = role === 'conferente' ? (S.checkers || []).filter(c => c.id === me).map(c => pick(c, ['id', 'name'])) : [];
  out.billers = role === 'faturamento' ? (S.billers || []).filter(c => c.id === me).map(c => pick(c, ['id', 'name'])) : [];
  out.admins = [];
  out.counts = role === 'conferente' ? clone(S.counts || []) : [];
  out.romaneios = role === 'entregador' ? clone((S.romaneios || []).filter(r => r.drv === me)) : [];
  out.commPayouts = role === 'vendedor' ? clone((S.commPayouts || []).filter(p => p.sellerId === me)) : [];
  ['payables', 'trips'].forEach(k => { out[k] = []; });
  return out;
}

/* ---------------------------------------------------------------- escrita */
// o que cada papel pode criar/alterar/apagar em cada coleção (o resto é só do administrador)
const WRITE = {
  cliente: { orders: 'cu', customers: 'u' },
  vendedor: { orders: 'cu' },
  conferente: { orders: 'u', counts: 'cu' },
  faturamento: { orders: 'u' },
  entregador: { orders: 'u', romaneios: 'c', receivables: 'c' },
};
// coleções que o servidor mantém sozinho: o que vier do navegador é ignorado (não é erro)
const SERVER_OWNED = { meta: ['negLog'], receivables: 'auto' };

// campos do pedido que cada papel pode mudar (fora itens, situação e aprovação, que têm regra própria)
const OF = {
  cliente: ['apprAt', 'apprHist', 'apprNote', 'cliRej', 'removed', 'seenAt', 'events', 'prevTotal'],
  vendedor: ['apprAt', 'apprHist', 'apprNote', 'cliRej', 'removed', 'seenAt', 'events', 'sugs', 'editedAt', 'editedBy', 'prevTotal', 'mode', 'addr', 'bairro', 'pay', 'note', 'nf'],
  conferente: ['checker', 'checkStartAt', 'checkedAt', 'checkNote', 'chk', 'durs', 'scan', 'scanLog', 'sugs', 'volumes', 'totalOrig', 'adjAt', 'events'],
  faturamento: ['billed', 'events', 'nfExported'],
  entregador: ['deliv', 'delivered', 'occ', 'events'],
};
const OCC_OK = ['avaria', 'falta', 'naopedido', 'recusa'];

function refPrice(C, S, o, p, q) {
  const cli = (S.customers || []).find(x => x.id === o.customerId) || null;
  return C.withIe(!!(o.nf && C.ieClient(cli)), () => C.withClient(cli, () => C.withOner(o.mode, () => C.priceFor(p, q, o.mode, o.pay))));
}
function productOf(S, C, i) { return i.combo ? C.resolveCart(i.comboId) : (S.products || []).find(p => p.id === i.pid); }
function fillItem(C, p, base, extra) {
  return Object.assign({ ie: !!(extra && extra.ie), rp: !!(extra && extra.rp), commP: C.pCommOwn(p), pid: p.isCombo ? undefined : p.id, cat: p.cat || '', cost: p.cost > 0 ? p.cost : '', name: p.name, unit: p.unit,
    perPack: C.packOf(p) || '', kg: C.isKg(p) || undefined, code: p.code || '', ean: p.ean || '' },
  p.isCombo ? { combo: true, comboId: p.comboId, components: p.components } : {}, base);
}

/* pedido NOVO do cliente: refeito do zero no servidor, com as regras do carrinho (preço, negociação, crédito) */
function buildClientOrder(S, user, req) {
  const cust = (S.customers || []).find(c => c.id === user.ref_id);
  if (!cust) throw httpErr(403, 'Cliente não encontrado.');
  const cart = {}, neg = {};
  (req.items || []).forEach(i => {
    if (i.occLine || i.extra) throw httpErr(400, 'Item inválido.');
    const key = i.combo ? i.comboId : i.pid; const q = Number(i.q);
    if (!key || !(q > 0) || q > 99999 || !Number.isFinite(q)) throw httpErr(400, 'Quantidade inválida.');
    cart[key] = (cart[key] || 0) + q;
    if (i.negAsk != null && Number(i.negAsk) > 0) neg[key] = r2(i.negAsk);
  });
  const mode = req.mode === 'entrega' ? 'entrega' : 'retirada';
  const { C, ui } = coreFor(S, 'cliente', { client: cust, cart, mode, pay: String(req.pay || ''), nf: !!req.nf, neg });
  const items = C.withOner(mode, () => C.cartItems());
  if (!items.length || items.length !== Object.keys(cart).length) throw httpErr(400, 'Produto indisponível no pedido. Atualize a tela.');
  const cfg = C.negCfg();
  const ngs = items.filter(i => i.neg);
  if (Object.keys(neg).length && (!cfg.on || !C.negAllowed(cust))) throw httpErr(403, 'Negociação de preço não liberada para este cliente.');
  if (ngs.length > cfg.maxItems) throw httpErr(400, 'Proposta em produtos demais.');
  items.forEach(i => { if (i.neg && i.neg.asked < i.neg.from * 0.5) throw httpErr(400, 'Proposta muito abaixo do preço.'); });
  const sub = C.cartSub(), disc = C.pickupDisc(), total = C.cartTotal();
  const po = C.payOptions(cust, total);
  if (!po.list.includes(ui.pay)) throw httpErr(400, po.ci.blocked ? po.ci.reason + ' Escolha uma forma à vista.' : 'Escolha uma forma de pagamento.');
  if (mode === 'entrega' && !String(req.addr || '').trim()) throw httpErr(400, 'Informe o endereço de entrega.');
  const seller = C.sellerById(cust.sellerId);
  const o = {
    id: String(req.id || uid()).slice(0, 40), no: null, date: new Date().toISOString(), customerId: cust.id, customer: cust.name, doc: cust.doc || '', phone: cust.phone || '',
    sellerId: seller ? cust.sellerId : '', sellerRate: seller ? Number(seller.commission) || 0 : '',
    items: items.map(({ p, q, price, label, ie, rp, neg: ng }) => fillItem(C, p, Object.assign(ng ? { negFrom: ng.from, negAsk: ng.asked, negSt: ng.st } : {},
      { base: p.isCombo ? p.listPrice : C.withOner(mode, () => C.baseOf(p)), price, label, q }), { ie, rp })),
    sub, disc, discPct: mode === 'retirada' && !C.onerOn() ? Number(S.store.pickupDisc) || 0 : 0, total,
    nf: req.nf ? clone(req.nf) : null, mode, addr: mode === 'entrega' ? String(req.addr || '').trim().slice(0, 300) : '', bairro: mode === 'entrega' ? String(req.bairro || '').trim().slice(0, 120) : '',
    city: cust.city || '', cityName: (C.cityById(cust.city) || {}).name || '', table: C.tableOf(cust), pay: ui.pay, note: String(req.note || '').trim().slice(0, 1000), status: 'novo',
  };
  if (o.nf && items.some(i => i.ie) && (!o.nf.ie || o.nf.ie === 'ISENTO')) throw httpErr(400, 'Para o preço com inscrição estadual, informe a inscrição estadual nos dados da nota.');
  const log = [];
  const ng = o.items.filter(i => i.negAsk != null);
  if (ng.length) {
    o.negCli = true;
    ng.forEach(i => log.push({ at: o.date, pid: i.pid, name: i.name, cid: o.customerId, from: i.negFrom, asked: i.negAsk, st: i.negSt }));
    if (ng.some(i => i.negSt === 'an')) {
      o.appr = 'pendente'; let T = 0, Co = 0, CM = 0, W = 0, M = 0;
      o.items.forEach(i => { const x = C.anItemCalc(o, i, C.itemCommRate(o, i)); T += x.net; Co += x.cost; CM += x.comm; const pm = C.polMin(C.itemProduct(i)); W += x.net; M += x.net * (pm ? pm.v : cfg.defMin); });
      o.apprMg = T > 0 ? Math.round((T - Co - CM) / T * 1000) / 10 : 0; o.apprMin = W > 0 ? Math.round(M / W * 10) / 10 : 0;
      o.apprHist = [{ at: o.date, by: o.customer, what: 'proposta de preço do cliente' }];
    }
  }
  return { o, log, custFiscal: o.nf };
}

/* trava de margem do vendedor, calculada no servidor (o vendedor não recebe custo) */
function sellerLock(S, sellerId, o) {
  const { C, ui } = coreFor(S, 'vend', { seller: sellerId });
  const cli = (S.customers || []).find(x => x.id === o.customerId) || null;
  const its = o.items.filter(i => i.q > 0 && !i.occLine).map(i => ({ p: productOf(S, C, i), q: i.q, price: i.price })).filter(i => i.p);
  const R2 = { items: its, sub: r2(its.reduce((s, i) => s + i.price * i.q, 0)), total: o.total };
  const tblOk = its.every(i => i.price >= refPrice(C, S, o, i.p, i.q).price - 0.004);
  const K = C.lnLock(R2, cli, { nf: !!o.nf, sel: sellerId, _tblOk: tblOk });
  return K;
}
/* consulta da trava para a tela do vendedor (sem mandar custo): verde/amarelo/vermelho e quanto falta */
function lockCheck(S, user, req) {
  const cust = (S.customers || []).find(c => c.id === req.cid);
  const me = (S.sellers || []).find(s => s.id === user.ref_id);
  if (!cust || !me || !(me.allCli || cust.sellerId === me.id)) throw httpErr(403, 'Cliente fora da sua carteira.');
  const { C } = coreFor(S, 'vend', { seller: me.id });
  const F = C.calcCartFor(cust, req.cart || {}, req.mode === 'entrega' ? 'entrega' : 'retirada', String(req.pay || ''), req.over || null, !!req.nf, req.keep || null);
  const K = C.lnLock(F, cust, { nf: !!req.nf, sel: me.id, _tblOk: !!req.tblOk });
  const k = F.sub > 0 ? F.total / F.sub : 1;
  const levels = {};
  F.items.forEach(i => { if (!i.p.isCombo) levels[i.p.id] = C.lnItemLevel(i.p, i.price, k, { nf: !!req.nf, sel: me.id }, cust, refPrice(C, S, { customerId: cust.id, nf: !!req.nf, mode: req.mode, pay: req.pay }, i.p, i.q).price); });
  return { K: K ? { ok: K.ok, level: K.level, need: K.need != null ? K.need : null, tol: !!K.tol, table: !!K.table } : null, levels };
}
/* negociação do cliente: aceita na hora ou vai para a loja (resposta sem revelar custo/margem) */
function negCheck(S, user, req) {
  const cust = (S.customers || []).find(c => c.id === user.ref_id);
  const p = (S.products || []).find(x => x.id === req.pid && x.active !== false);
  if (!cust || !p) throw httpErr(404, 'Produto não encontrado.');
  const { C } = coreFor(S, 'cliente', { client: cust, mode: req.mode === 'entrega' ? 'entrega' : 'retirada', pay: String(req.pay || ''), nf: !!req.nf });
  if (!C.negCfg().on || !C.negAllowed(cust)) return { st: 'an' };
  return { st: C.negEval(p, Number(req.asked), Number(req.from)) };
}

function hiddenOf(full, vis) { const h = {}; Object.keys(full || {}).forEach(k => { if (!(k in (vis || {}))) h[k] = full[k]; }); return h; }
function mergeHidden(prev, vis, next) {
  const n = Object.assign({}, hiddenOf(prev, vis), clone(next));
  // itens: devolve os campos escondidos de cada item (casando pelo produto)
  const key = i => i.occLine ? 'occ:' + i.name + ':' + i.price : (i.combo ? 'c:' + i.comboId : 'p:' + i.pid) + (i.extra ? ':x' : '');
  const vi = new Map((vis.items || []).map((i, k) => [key((prev.items || [])[k]), [prev.items[k], i]]));
  n.items = (n.items || []).map(i => { if (i.occLine && i.price !== undefined) return i; const m = vi.get(key(Object.assign({}, i, i.occLine ? { price: undefined } : {}))) || vi.get(key(i)); return m ? Object.assign({}, hiddenOf(m[0], m[1]), i) : i; });
  if (Array.isArray(n.sugs) && Array.isArray(prev.sugs)) n.sugs = n.sugs.map(sg => { const p = prev.sugs.find(x => x.id === sg.id); return p && p.price !== undefined && sg.price === undefined ? Object.assign({}, sg, { price: p.price }) : sg; });
  return n;
}
/* junta mudanças simultâneas em campos diferentes; se as duas mexeram no mesmo campo, recusa (a tela recarrega) */
function mergeConcurrent(cur, baseStr, mine, role) {
  let base; try { base = typeof baseStr === 'string' ? JSON.parse(baseStr) : baseStr; } catch (e) { return null; }
  if (!base || typeof base !== 'object') return null;
  const vis = role === 'admin' ? cur : (cur && cur.items ? stripOrder(cur, role) : cur);
  const out = clone(vis);
  const keys = new Set([...Object.keys(base), ...Object.keys(mine)]);
  for (const k of keys) {
    if (eq(base[k], mine[k])) continue;            // não mexi neste campo
    if (!eq(base[k], vis[k])) {
      if (k === 'events' || k === 'apprHist') {      // listas que só crescem: junta as duas
        const extra = (mine[k] || []).slice((base[k] || []).length);
        out[k] = (vis[k] || []).concat(extra); continue;
      }
      return null;                                   // os dois mexeram no mesmo campo
    }
    if (k in mine) out[k] = clone(mine[k]); else delete out[k];
  }
  return out;
}
function appendOnly(prev, next, what) {
  const a = prev || [], b = next || [];
  if (b.length < a.length || !eq(a, b.slice(0, a.length))) throw httpErr(403, 'Não é permitido apagar ' + what + '.');
}

/* confere uma alteração de pedido feita por quem não é administrador */
function checkOrderUpdate(S, user, prev, next) {
  const role = user.role, me = user.ref_id;
  if (!canSeeOrder(prev, user, S)) throw httpErr(403, 'Pedido de outra pessoa.');
  const { C } = coreFor(S, role === 'vendedor' ? 'vend' : 'x', { seller: me });
  const o = clone(prev);
  // o que foi escondido desta pessoa (custo, comissão, preços para o conferente...) volta com o valor do servidor
  next = mergeHidden(prev, stripOrder(prev, role), next);
  // campos simples
  const allowed = new Set(OF[role] || []);
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (['items', 'status', 'appr', 'sub', 'disc', 'total', 'stockApplied', 'recLaunched', 'recAuto', 'doneAt'].includes(k)) continue;
    if (eq(prev[k], next[k])) continue;
    if (!allowed.has(k)) throw httpErr(403, `Você não pode alterar "${k}" do pedido.`);
    if (['mode', 'addr', 'bairro', 'pay', 'note', 'nf'].includes(k) && prev.status !== 'novo') throw httpErr(403, 'O pedido já está em separação: fale com a loja para mudar.');
    o[k] = clone(next[k]);
  }
  if (allowed.has('events')) appendOnly(prev.events, next.events, 'avisos');
  if (role === 'cliente' || role === 'vendedor') appendOnly(prev.apprHist, next.apprHist, 'o histórico');
  if (role === 'conferente') o.checker = user.name || o.checker;
  if (role === 'faturamento' && !eq(prev.billed, next.billed)) {
    if (next.billed) o.billed = Object.assign({}, clone(next.billed), { by: user.name, at: new Date().toISOString() });
    if (next.billed && !['separado', 'pronto', 'saiu', 'concluido'].includes(prev.status)) throw httpErr(403, 'O pedido ainda não foi separado.');
  }
  if (role === 'entregador') {
    const d0 = prev.deliv || {}, d1 = next.deliv || {};
    if ((d1.drv || '') !== (d0.drv || '')) throw httpErr(403, 'Só a loja muda o motorista.');
    appendOnly(d0.fails, d1.fails, 'as tentativas de entrega');
    if (!eq(prev.delivered, next.delivered) && prev.delivered) throw httpErr(403, 'Entrega já registrada.');
    if (next.delivered && !prev.delivered) {
      const D = o.delivered = clone(next.delivered);
      D.drv = me; D.by = user.name; D.pickup = false;
      if (!D.photo) throw httpErr(400, 'A foto do canhoto é obrigatória.');
      if (!String(D.name || '').trim()) throw httpErr(400, 'Informe quem recebeu.');
      if (!['', 'dinheiro', 'pix', 'nao'].includes(D.how || '')) throw httpErr(400, 'Forma de recebimento inválida.');
      D.settled = D.how !== 'dinheiro'; delete D.settledAt;
    }
    if (!eq(prev.occ, next.occ) && prev.occ) {
      // só pode marcar que o boleto foi refeito? não: isso é da loja/faturamento
      throw httpErr(403, 'Ocorrência já registrada.');
    }
  }
  if (role === 'faturamento' && !eq(prev.occ, next.occ)) {
    const a = clone(prev.occ) || {}, b = clone(next.occ) || {};
    delete a.reboleto; delete a.reboletoAt; delete b.reboleto; delete b.reboletoAt;
    if (!eq(a, b) || !prev.occ) throw httpErr(403, 'Você não pode alterar a ocorrência.');
    o.occ = clone(next.occ);
  } else if (role === 'faturamento') { /* nada */ }

  // ---- itens
  const editable = role === 'vendedor' && prev.status === 'novo';
  const prevByKey = new Map();
  (prev.items || []).forEach((i, k) => prevByKey.set((i.occLine ? 'occ' + k : (i.combo ? 'c:' + i.comboId : 'p:' + i.pid) + (i.extra ? ':x' : '')), i));
  const seen = new Set();
  let itemsChanged = false, priceDown = false;
  const outItems = [];
  for (const ni of (next.items || [])) {
    if (ni.occLine) {
      const was = (prev.items || []).find(i => i.occLine && eq(i, ni));
      if (was) { outItems.push(clone(was)); continue; }
      if (role !== 'entregador') throw httpErr(403, 'Ajuste de entrega só pelo entregador.');
      const maxPack = Math.max(0, ...(prev.items || []).filter(i => !i.occLine).map(i => Number(i.price) || 0));
      if (!(Number(ni.price) < 0) || -ni.price > maxPack + 0.01 || Number(ni.q) !== 1) throw httpErr(400, 'Ajuste de entrega inválido.');
      outItems.push({ name: String(ni.name || '').slice(0, 200), unit: 'ajuste na entrega', q: 1, price: r2(ni.price), label: 'Ocorrência na entrega', occLine: true });
      itemsChanged = true; continue;
    }
    const key = (ni.combo ? 'c:' + ni.comboId : 'p:' + ni.pid) + (ni.extra ? ':x' : '');
    const pi = prevByKey.get(key);
    if (pi && !seen.has(key)) {
      seen.add(key);
      const it = clone(pi);
      const q = Number(ni.q);
      if (!Number.isFinite(q) || q < 0) throw httpErr(400, 'Quantidade inválida.');
      const q0 = Number(pi.q);
      if (q > q0 + 1e-9 && !editable) throw httpErr(403, 'Só a loja pode aumentar a quantidade.');
      if (q < q0 - 1e-9) {
        if (!['cliente', 'vendedor', 'conferente', 'entregador'].includes(role)) throw httpErr(403, 'Você não pode mudar quantidades.');
        if (role === 'cliente' && !['contra', 'aceito', 'pendente'].includes(prev.appr)) throw httpErr(403, 'Para tirar produto, fale com a loja.');
      }
      it.q = q;
      ['qOrig', 'qOcc', 'removed', 'label'].forEach(k => { if (ni[k] !== undefined) it[k] = clone(ni[k]); else if (k !== 'label') delete it[k]; });
      if (!near(ni.price, pi.price)) {
        const p = productOf(S, C, pi);
        if (editable) { priceDown = priceDown || ni.price < pi.price - 0.004; it.price = r2(ni.price); }
        else if ((role === 'cliente' || role === 'vendedor') && ni.price > pi.price) {
          // volta ao preço de tabela (ex.: tirou produto e o pedido perdeu a negociação)
          const ref = p ? refPrice(C, S, prev, p, q || 1).price : pi.price;
          const ok = [pi.negFrom, pi.prevPrice, ref].some(v => v != null && near(v, ni.price));
          if (!ok) throw httpErr(403, 'Preço inválido.');
          it.price = r2(ni.price); delete it.negAsk; delete it.negSt; delete it.negFrom; delete it.prevPrice;
        } else throw httpErr(403, 'Você não pode mudar o preço.');
        if (!(it.price > 0)) throw httpErr(400, 'Preço inválido.');
      }
      if (q !== q0 || !near(it.price, pi.price)) itemsChanged = true;
      outItems.push(it);
    } else {
      // item novo
      const p = productOf(S, C, ni);
      if (!p || p.active === false) throw httpErr(400, 'Produto não encontrado.');
      const q = Number(ni.q);
      if (!(q > 0) || !Number.isFinite(q)) throw httpErr(400, 'Quantidade inválida.');
      const ref = refPrice(C, S, prev, p, q);
      let price = r2(ni.price);
      if (role === 'entregador') { if (!ni.extra) throw httpErr(403, 'Item novo só como "produto a mais".'); price = r2(C.baseOf(p)); }
      else if (role === 'vendedor') { if (!editable && price < ref.price - 0.004) throw httpErr(403, 'Preço abaixo da tabela: envie para a loja.'); if (price < ref.price - 0.004) priceDown = true; }
      else throw httpErr(403, 'Você não pode incluir produtos.');
      if (!(price > 0)) throw httpErr(400, 'Preço inválido.');
      outItems.push(fillItem(C, p, { base: p.isCombo ? p.listPrice : C.baseOf(p), price, label: ni.extra ? 'Adicionado na entrega' : (near(price, ref.price) ? ref.label : 'Preço negociado'), q, ...(ni.extra ? { extra: true } : {}) }, { ie: ref.ie, rp: ref.rp }));
      itemsChanged = true;
    }
  }
  const removed = [...prevByKey.entries()].filter(([k, i]) => !i.occLine && !seen.has(k));
  if (removed.length) {
    if (!(role === 'vendedor' && (editable || ['contra', 'aceito'].includes(prev.appr))) && !(role === 'cliente' && ['contra', 'aceito'].includes(prev.appr)) && role !== 'vendedor') throw httpErr(403, 'Você não pode tirar produtos deste pedido.');
    itemsChanged = true;
  }
  if ((prev.items || []).some((i, k) => i.occLine && !outItems.some(x => x.occLine && eq(x, i)))) throw httpErr(403, 'Não é permitido apagar ajuste de entrega.');
  o.items = outItems;
  Object.assign(o, C.orderTotals(o));
  if (!o.items.some(i => i.q > 0 && !i.occLine) && next.status !== 'cancelado') throw httpErr(400, 'O pedido não pode ficar sem produtos.');
  if (itemsChanged && (role === 'cliente' || role === 'vendedor') && o.total + 0.004 < Number(S.store.min || 0) && next.status !== 'cancelado') throw httpErr(400, 'O pedido ficaria abaixo do pedido mínimo.');

  // ---- aprovação
  const a0 = prev.appr || null, a1 = next.appr || null;
  if (a0 !== a1) {
    const OK = {
      cliente: [['contra', 'aceito'], ['contra', 'recusado']],
      vendedor: [['contra', 'aceito'], ['contra', 'recusado'], ['contra', 'pendente'], ['pendente', 'liberado'], [null, 'pendente'], ['liberado', 'pendente'], ['aprovado', 'pendente'], ['aceito', 'pendente']],
    }[role] || [];
    if (!OK.some(([x, y]) => x === a0 && y === a1)) throw httpErr(403, 'Mudança de aprovação não permitida.');
    o.appr = a1;
  }
  if (role === 'vendedor' && (editable || a1 === 'pendente') && itemsChanged) {
    const K = sellerLock(S, me, o);
    delete o.tolUsed;
    if (K && !K.ok) { o.appr = 'pendente'; o.apprMin = K.min; o.apprMg = Math.round(K.mg * 10) / 10; o.apprNeed = K.need; }
    else if (o.appr === 'pendente' && a0 !== 'pendente' && !priceDown) { /* reenviado por vontade do vendedor: fica pendente */ }
    if (K && K.ok && K.tol) o.tolUsed = { mg: Math.round(K.mg * 10) / 10, min: Math.round(K.min * 10) / 10, at: new Date().toISOString() };
    if (K && K.ok && o.appr === 'liberado' && a0 !== 'pendente') o.appr = a0;
  }
  if (o.appr === 'liberado' && a0 === 'pendente') {
    const K = sellerLock(S, me, o);
    if (K && !K.ok) throw httpErr(403, 'A margem ainda está abaixo do permitido.');
  }

  // ---- situação
  const s0 = prev.status, s1 = next.status;
  if (s0 !== s1) {
    const T = {
      cliente: [['novo', 'cancelado']],
      vendedor: [['novo', 'cancelado']],
      conferente: [['novo', 'separando'], ['separando', 'separado'], ['separando', 'pronto'], ['separando', 'novo']],
      faturamento: [['separado', 'pronto']],
      entregador: [['pronto', 'saiu'], ['saiu', 'concluido'], ['saiu', 'pronto']],
    }[role] || [];
    if (!T.some(([x, y]) => x === s0 && y === s1)) throw httpErr(403, `Você não pode mudar o pedido de "${s0}" para "${s1}".`);
    if ((s1 === 'cancelado') && !(o.appr === 'recusado' || ['contra', 'pendente'].includes(a0) || s0 === 'novo')) throw httpErr(403, 'Não é possível cancelar agora.');
    if (['pronto', 'saiu', 'concluido'].includes(s1) && C.needsBill(o) && !o.billed) throw httpErr(403, 'Pedido nº ' + o.no + ' ainda não foi faturado.');
    if (role === 'conferente' && s1 === 'pronto' && C.needsBill(o)) throw httpErr(403, 'Este pedido precisa passar pelo faturamento.');
    if (role === 'faturamento' && !o.billed) throw httpErr(403, 'Marque como faturado.');
    if (role === 'entregador') {
      if (s1 === 'saiu') { o.deliv = Object.assign({}, o.deliv, { outAt: new Date().toISOString() }); }
      if (s1 === 'concluido' && !o.delivered) throw httpErr(400, 'Confirme a entrega com a foto do canhoto.');
      if (s1 === 'pronto' && !((next.deliv || {}).fails || []).length) throw httpErr(400, 'Diga o motivo de não ter entregue.');
    }
    if (s1 === 'cancelado' && a1 === 'recusado') o.cliRej = role === 'cliente' || role === 'vendedor' ? true : o.cliRej;
    o.status = s1;
    if (s1 === 'concluido') o.doneAt = new Date().toISOString();
  }
  if ((role === 'cliente' || role === 'vendedor') && itemsChanged && !['novo'].includes(prev.status) && !['contra', 'aceito'].includes(prev.appr)) throw httpErr(403, 'O pedido já está em separação: fale com a loja.');

  // ---- entrega com ocorrência: os valores conferem com os itens?
  if (role === 'entregador' && next.occ && !prev.occ) {
    const oc = clone(next.occ), cash = C.isCash(o.pay);
    const extra = r2(o.items.filter(i => i.extra).reduce((s, i) => s + i.price * i.q, 0) - (prev.items || []).filter(i => i.extra).reduce((s, i) => s + i.price * i.q, 0));
    (oc.items || []).forEach(x => { if (!OCC_OK.includes(x.t)) throw httpErr(400, 'Tipo de ocorrência inválido.'); });
    oc.from = prev.total; oc.to = o.total; oc.extra = extra; oc.cash = cash; oc.desc = r2(prev.total - (o.total - extra));
    oc.collect = cash ? r2(o.total - extra) : 0; oc.reboleto = !cash;
    o.occ = oc;
  }
  if (role === 'entregador' && o.delivered && !prev.delivered) {
    const cash = C.isCash(o.pay);
    o.delivered.collect = cash ? (o.occ && !prev.occ ? o.occ.collect : o.total) : 0;
    if (cash && !o.delivered.how) throw httpErr(400, 'Toque em como o cliente pagou.');
  }
  if (itemsChanged && o.recLaunched && Math.abs(o.total - prev.total) > 0.004 && role !== 'entregador') o._dropRec = true;
  return o;
}

/*
 * Aplica um lote de alterações vindas do navegador.
 * changes: [{c, id, op:'put'|'del', doc, ver}], order: {coll:[ids]}
 * Devolve as mudanças aceitas (já corrigidas pelo servidor) para gravar.
 */
function applySync(S, V, user, changes, extra) {
  const role = user.role, me = user.ref_id;
  const writes = [], drops = [], effects = { products: new Set(), receivables: [] , negLog: [] };
  const byId = (c, id) => (S[c] || []).find(x => x && x.id === id);
  const verOf = (c, id) => c === 'meta' ? (V.meta || {})[id] : (V[c] || {})[id];

  for (const ch of changes) {
    const c = String(ch.c || ''), id = String(ch.id || '').slice(0, 80), op = ch.op === 'del' ? 'del' : 'put';
    if (!id || !c) throw httpErr(400, 'Alteração inválida.');
    if (role !== 'admin' && c === 'meta') continue;
    const exists = c === 'meta' ? S[id] !== undefined && verOf(c, id) != null : !!byId(c, id);
    if (exists && ch.ver !== verOf(c, id)) {
      // duas pessoas mexeram no mesmo registro: se mudaram partes diferentes, junta as duas mudanças
      const merged = c !== 'meta' && op === 'put' && ch.base ? mergeConcurrent(byId(c, id), ch.base, ch.doc, role) : null;
      if (!merged) throw httpErr(409, 'Outra pessoa alterou isso antes de você. Atualizando a tela.');
      ch.doc = merged; ch.ver = verOf(c, id);
    }
    if (!exists && ch.ver) throw httpErr(409, 'Esse registro foi apagado por outra pessoa. Atualizando a tela.');

    // ----- administrador: pode tudo, mas senhas viram hash e número do pedido é do servidor
    if (role === 'admin') {
      if (c === 'meta' && ['seq'].includes(id)) continue;
      if (op === 'del') { writes.push({ c, id, op, ver: ch.ver }); continue; }
      const doc = clone(ch.doc);
      if (!doc || typeof doc !== 'object' && c !== 'meta') throw httpErr(400, 'Registro inválido.');
      if (c !== 'meta') doc.id = id;
      const w = { c, id, op, doc, ver: exists ? ch.ver : undefined };
      if (USER_COLLS[c]) { w.syncUser = true; w.userOpts = { mustReset: !(c === 'admins' && id === me) }; }
      if (c === 'orders' && !exists) w.newOrder = true;
      writes.push(w);
      continue;
    }

    // ----- demais papéis
    if (c === 'meta' && SERVER_OWNED.meta.includes(id)) { continue; }
    if (c === 'receivables' && op === 'put' && !exists && ch.doc && ch.doc.auto) { drops.push({ c, id }); continue; }
    const perm = (WRITE[role] || {})[c] || '';
    if (op === 'del') throw httpErr(403, 'Você não pode apagar isso.');
    if (!exists && !perm.includes('c')) throw httpErr(403, 'Você não pode criar "' + c + '".');
    if (exists && !perm.includes('u')) throw httpErr(403, 'Você não pode alterar "' + c + '".');
    const doc = clone(ch.doc);
    if (!doc || typeof doc !== 'object') throw httpErr(400, 'Registro inválido.');

    if (c === 'orders') {
      if (!exists) {
        if (role === 'cliente') {
          const { o, log } = buildClientOrder(S, user, Object.assign({}, doc, { id }));
          writes.push({ c, id, op: 'put', doc: o, newOrder: true });
          effects.negLog.push(...log);
          S.orders.unshift(o);
        } else if (role === 'vendedor') {
          const o = buildSellerOrder(S, user, Object.assign({}, doc, { id }));
          writes.push({ c, id, op: 'put', doc: o, newOrder: true });
          S.orders.unshift(o);
        } else throw httpErr(403, 'Você não pode criar pedidos.');
        continue;
      }
      const prev = byId(c, id);
      const o = checkOrderUpdate(S, user, prev, doc);
      const prevStatus = prev.status;
      const { C } = coreFor(S, 'x');
      const k = S.orders.indexOf(prev); S.orders[k] = o;
      // efeitos que o servidor faz sozinho: estoque e contas a receber automáticas
      if (o.status !== prevStatus) {
        const before = new Map((S.products || []).map(p => [p.id, p.stock]));
        const recBefore = new Set((S.receivables || []).map(r => r.id));
        C.syncStock(o); C.autoReceivables(o, prevStatus);
        (S.products || []).forEach(p => { if (before.get(p.id) !== p.stock) effects.products.add(p.id); });
        (S.receivables || []).forEach(r => { if (!recBefore.has(r.id)) effects.receivables.push(r); });
      }
      if (o._dropRec) { delete o._dropRec; o.recLaunched = false; o.recAuto = false; effects.dropRecFor = (effects.dropRecFor || []).concat(o.id); }
      writes.push({ c, id, op: 'put', doc: o, ver: ch.ver });
      continue;
    }
    if (c === 'customers') { // cliente: só os dados da nota do próprio cadastro
      if (id !== me) throw httpErr(403, 'Cadastro de outra pessoa.');
      const prev = byId(c, id), x = clone(prev);
      for (const k of new Set([...Object.keys(prev), ...Object.keys(doc)])) {
        if (['hasPass', 'mustReset', 'login', 'pass'].includes(k) || !(k in doc) || eq(prev[k], doc[k])) continue;
        if (k !== 'fiscal') throw httpErr(403, 'Para mudar o cadastro, fale com a loja.');
        x.fiscal = clone(doc.fiscal);
      }
      writes.push({ c, id, op: 'put', doc: x, ver: ch.ver }); continue;
    }
    if (c === 'counts') { // conferente: contagem dele
      const prev = byId(c, id);
      if (prev && prev.by && prev.by !== user.name && prev.status !== 'aberta') throw httpErr(403, 'Contagem de outra pessoa.');
      doc.id = id; if (!prev) doc.by = user.name;
      writes.push({ c, id, op: 'put', doc, ver: ch.ver }); continue;
    }
    if (c === 'romaneios') { // entregador: romaneio só com os pedidos dele
      doc.id = id; doc.drv = me;
      const ok = (doc.ids || []).every(oid => { const o = byId('orders', oid); return o && o.deliv && o.deliv.drv === me; });
      if (!ok) throw httpErr(403, 'Romaneio com pedido de outro motorista.');
      writes.push({ c, id, op: 'put', doc }); continue;
    }
    if (c === 'receivables') { // entregador: "não pagou" e "produto a mais", com valor conferido
      const o = byId('orders', doc.orderId);
      if (!o || !o.delivered || o.delivered.drv !== me) throw httpErr(403, 'Conta de pedido que não é seu.');
      let amount = null;
      if (/^Não pagou na entrega/.test(doc.desc || '') && o.delivered.how === 'nao') amount = o.delivered.collect;
      else if (doc.desc === 'Produto a mais na entrega' && o.occ && o.occ.cash) amount = o.occ.extra;
      if (amount == null || !near(amount, doc.amount, 0.011)) throw httpErr(403, 'Valor da conta não confere com o pedido.');
      const r = { id, group: String(doc.group || id), orderId: o.id, customerId: o.customerId, customer: o.customer, orderNo: String(o.no), desc: doc.desc, parcel: '1/1', amount: r2(amount), due: doc.due || new Date().toISOString().slice(0, 10), paidAt: '', created: new Date().toISOString() };
      writes.push({ c, id, op: 'put', doc: r }); continue;
    }
    throw httpErr(403, 'Alteração não permitida.');
  }
  return { writes, drops, effects };
}

/* pedido NOVO do vendedor: confere preços com a tabela e aplica a trava de margem no servidor */
function buildSellerOrder(S, user, d) {
  const me = (S.sellers || []).find(s => s.id === user.ref_id);
  const cust = (S.customers || []).find(c => c.id === d.customerId);
  if (!me || me.active === false) throw httpErr(403, 'Vendedor inativo.');
  if (!cust || !(me.allCli || cust.sellerId === me.id)) throw httpErr(403, 'Cliente fora da sua carteira.');
  const { C } = coreFor(S, 'vend', { seller: me.id });
  const o = {
    id: d.id, no: null, date: new Date().toISOString(), customerId: cust.id, customer: cust.name, doc: cust.doc || '', phone: cust.phone || '',
    sellerId: me.id, sellerRate: Number(me.commission) || 0, mode: d.mode === 'entrega' ? 'entrega' : 'retirada', pay: String(d.pay || ''), nf: d.nf ? clone(d.nf) : null,
    addr: d.mode === 'entrega' ? String(d.addr || '').slice(0, 300) : '', bairro: d.mode === 'entrega' ? String(d.bairro || '').slice(0, 120) : '',
    city: cust.city || '', cityName: (C.cityById(cust.city) || {}).name || '', table: C.tableOf(cust), note: String(d.note || '').slice(0, 1000), status: 'novo', bySeller: me.name,
    discPct: d.mode === 'retirada' && !C.onerOn() ? Number(S.store.pickupDisc) || 0 : 0,
  };
  if (!C.allowedPays(cust).includes(o.pay)) throw httpErr(400, 'Forma de pagamento não liberada para este cliente.');
  if (o.mode === 'entrega' && !o.addr.trim()) throw httpErr(400, 'Informe o endereço de entrega.');
  o.items = (d.items || []).map(ni => {
    const p = productOf(S, C, ni);
    if (!p || p.active === false) throw httpErr(400, 'Produto não encontrado.');
    const q = Number(ni.q); if (!(q > 0) || !Number.isFinite(q)) throw httpErr(400, 'Quantidade inválida.');
    const ref = refPrice(C, S, o, p, q); const price = r2(ni.price);
    if (!(price > 0)) throw httpErr(400, 'Preço inválido.');
    return fillItem(C, p, { base: p.isCombo ? p.listPrice : C.baseOf(p), price, label: near(price, ref.price) ? ref.label : 'Preço negociado', q }, { ie: near(price, ref.price) ? ref.ie : !!ni.ie, rp: ref.rp });
  });
  if (!o.items.length) throw httpErr(400, 'Pedido sem produtos.');
  Object.assign(o, C.orderTotals(o));
  if (o.nf && o.items.some(i => i.ie) && (!o.nf.ie || o.nf.ie === 'ISENTO')) throw httpErr(400, 'Para o preço com IE, preencha a inscrição estadual nos dados da nota.');
  const K = sellerLock(S, me.id, o);
  if (K && !K.ok) { o.appr = 'pendente'; o.apprMin = K.min; o.apprMg = Math.round(K.mg * 10) / 10; o.apprNeed = K.need; }
  else if (d.appr === 'pendente') { o.appr = 'pendente'; }
  if (K && K.ok && K.tol) o.tolUsed = { mg: Math.round(K.mg * 10) / 10, min: Math.round(K.min * 10) / 10, at: new Date().toISOString() };
  C.addEvent(o, 'Seu pedido nº {NO} foi lançado pelo vendedor ' + me.name + ': ' + o.items.reduce((s, i) => s + i.q, 0) + ' itens, total ' + C.brl(o.total) + '.');
  return o;
}

module.exports = { project, applySync, lockCheck, negCheck, canSeeOrder, stripOrder, stripProduct, coreFor };

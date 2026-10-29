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
// comparação que não depende da ordem das chaves (o banco jsonb reordena as chaves dos objetos)
const canon = v => JSON.stringify(v === undefined ? null : v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
const eq = (a, b) => canon(a) === canon(b);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const near = (a, b, tol = 0.006) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < tol;

function coreFor(S, view, extra) {
  const ui = Object.assign({ view, client: null, cart: {}, mode: 'retirada', pay: '', neg: {}, nf: false, addr: '', note: '' }, extra || {});
  return { C: makeCore(S, ui, uid), ui };
}

/* ---------------------------------------------------------------- leitura */
const STORE_PUBLIC = ['name', 'from', 'to', 'min', 'pickup', 'conds', 'billGate', 'pickupDisc', 'pickupOner', 'pickV', 'onerV', 'autoRec'];
const P_SECRET = ['lastIn', 'cost', 'tablePrices', 'stock', 'minStock', 'idealStock', 'minMg', 'trib', 'commission'];
const I_SECRET = ['cost', 'commP', 'commX', 'prevComm'];
const O_SECRET = ['apprMg', 'apprMin', 'apprNeed', 'tolUsed', 'commAdj', 'sellerRate', 'stockApplied'];

function stripProduct(p, role) {
  const x = clone(p);
  P_SECRET.forEach(k => { if (!(role === 'vendedor' && k === 'commission') && !(role === 'faturamento' && k === 'trib')) delete x[k]; });
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
  if (st && role === 'faturamento' && st.tax) o.tax = clone(st.tax);   // impostos para calcular a margem na precificação de notas
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
  // entrada de mercadoria: o conferente recebe e confere; o faturamento precifica
  out.suppliers = role === 'conferente' || role === 'faturamento' ? (S.suppliers || []).filter(x => x.active !== false).map(x => pick(x, ['id', 'code', 'name'])) : [];
  out.receipts = role === 'conferente' || role === 'faturamento' ? (S.receipts || []).filter(r => r.status !== 'cancelada').map(r => {
    const x = clone(r); delete x.stockApplied;
    if (role === 'conferente') (x.items || []).forEach(i => { ['price', 'iePrice', 'trib', 'ieOn'].forEach(k => delete i[k]); });
    return x;
  }) : [];
  ['payables', 'trips'].forEach(k => { out[k] = []; });
  return out;
}

/* um registro só, com o MESMO filtro de project() (usado na resposta das gravações) */
function projectDoc(S, user, c, doc) {
  if (user.role === 'admin') return doc;
  if (!COLLS_SET.has(c)) return null;
  const mini = Object.assign({}, S); mini[c] = [doc];
  const P = project(mini, user);
  return (P[c] || [])[0] || null;
}

/* ---------------------------------------------------------------- escrita */
// o que cada papel pode criar/alterar/apagar em cada coleção (o resto é só do administrador)
const WRITE = {
  cliente: { orders: 'cu', customers: 'u' },
  vendedor: { orders: 'cu' },
  conferente: { orders: 'u', counts: 'cu', receipts: 'cu' },
  faturamento: { orders: 'u', receipts: 'u' },
  entregador: { orders: 'u', romaneios: 'c' },
};

// campos do pedido que cada papel pode mudar (fora itens, situação e aprovação, que têm regra própria)
const OF = {
  cliente: ['apprHist', 'apprNote', 'cliRej', 'seenAt'],
  vendedor: ['apprHist', 'apprNote', 'cliRej', 'seenAt', 'mode', 'addr', 'bairro', 'pay', 'note', 'nf'],
  conferente: ['checkStartAt', 'checkedAt', 'checkNote', 'chk', 'durs', 'scan', 'scanLog', 'volumes'],
  faturamento: ['nfExported'],
  entregador: [],
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
    if (!key || !qtyOk(q, !!i.kg)) throw httpErr(400, 'Quantidade inválida.');
    cart[key] = (cart[key] || 0) + q;
    if (i.negAsk != null && Number(i.negAsk) > 0) { if (!priceOk(Number(i.negAsk))) throw httpErr(400, 'Proposta inválida.'); neg[key] = r2(i.negAsk); }
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
  if (!(total > 0) || total + 0.004 < Number(S.store.min || 0)) throw httpErr(400, 'O pedido mínimo é de ' + C.brl(Number(S.store.min || 0)) + '.');
  const seller = C.sellerById(cust.sellerId);
  const o = {
    id: req.id, no: null, date: new Date().toISOString(), customerId: cust.id, customer: cust.name, doc: cust.doc || '', phone: cust.phone || '',
    sellerId: seller ? cust.sellerId : '', sellerRate: seller ? Number(seller.commission) || 0 : '',
    items: items.map(({ p, q, price, label, ie, rp, neg: ng }) => fillItem(C, p, Object.assign(ng ? { negFrom: ng.from, negAsk: ng.asked, negSt: ng.st } : {},
      { base: p.isCombo ? p.listPrice : C.withOner(mode, () => C.baseOf(p)), price, label, q }), { ie, rp })),
    sub: r2(sub), disc: r2(disc), discPct: mode === 'retirada' && !C.onerOn() ? Number(S.store.pickupDisc) || 0 : 0, total: r2(total),
    nf: cleanNf(req.nf), mode, addr: mode === 'entrega' ? String(req.addr || '').trim().slice(0, 300) : '', bairro: mode === 'entrega' ? String(req.bairro || '').trim().slice(0, 120) : '',
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
  return { K: K ? { ok: K.ok, level: K.level, need: K.need != null ? Math.ceil(Number(K.need) * 10 - 1e-9) / 10 : null, tol: !!K.tol, table: !!K.table } : null, levels };
}
/* negociação do cliente: aceita na hora ou vai para a loja (resposta sem revelar custo/margem) */
function negCheck(S, user, req) {
  const cust = (S.customers || []).find(c => c.id === user.ref_id);
  const p = (S.products || []).find(x => x.id === req.pid && x.active !== false);
  if (!cust || !p) throw httpErr(404, 'Produto não encontrado.');
  const { C } = coreFor(S, 'cliente', { client: cust, mode: req.mode === 'entrega' ? 'entrega' : 'retirada', pay: String(req.pay || ''), nf: !!req.nf });
  if (!C.negCfg().on || !C.negAllowed(cust)) return { st: 'an' };
  const q = Number(req.q) > 0 && Number(req.q) <= MAX_Q ? Number(req.q) : 1;
  const mode = req.mode === 'entrega' ? 'entrega' : 'retirada';
  const from = C.withIe(!!(req.nf && C.ieClient(cust)), () => C.withOner(mode, () => C.priceFor(p, q, mode, String(req.pay || '')).price));
  const asked = Number(req.asked);
  if (!(asked > 0) || !(from > 0)) return { st: 'an', from };
  if (asked >= from - 0.004) return { st: 'tabela', from };
  // degraus de 1% do preço: a resposta não permite descobrir o custo exato
  const pct = Math.ceil(((from - asked) / from * 100) - 1e-9);
  const probe = r2(from * (1 - pct / 100));
  return { st: C.negEval(p, probe, from), from };
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
/* junta mudanças simultâneas: campos diferentes, listas que só crescem e marcações item a item (conferência);
   se as duas pessoas mexeram exatamente na mesma coisa, recusa (a tela recarrega) */
const GROW = ['events', 'apprHist', 'sugs', 'scanLog'];
const PER_KEY = ['chk', 'scan', 'durs'];
function mergeConcurrent(cur, baseStr, mine, role) {
  let base; try { base = typeof baseStr === 'string' ? JSON.parse(baseStr) : baseStr; } catch (e) { return null; }
  if (!base || typeof base !== 'object' || !mine || typeof mine !== 'object') return null;
  const vis = role === 'admin' ? cur : (cur && cur.items ? stripOrder(cur, role) : cur);
  const out = clone(vis);
  const keys = new Set([...Object.keys(base), ...Object.keys(mine)]);
  for (const k of keys) {
    if (eq(base[k], mine[k])) continue;            // não mexi neste campo
    if (!eq(base[k], vis[k])) {
      if (GROW.includes(k)) {                        // listas que só crescem: junta as duas
        const b = base[k] || [], m = mine[k] || [], v = vis[k] || [];
        if (!Array.isArray(m) || !eq(m.slice(0, b.length), b)) return null;
        out[k] = v.concat(m.slice(b.length)); continue;
      }
      if (PER_KEY.includes(k) && isObj(base[k] || {}) && isObj(mine[k] || {}) && isObj(vis[k] || {})) {
        const b = base[k] || {}, m = mine[k] || {}, v = vis[k] || {}, o = clone(v);
        for (const x of new Set([...Object.keys(b), ...Object.keys(m)])) {
          if (eq(b[x], m[x])) continue;
          if (!eq(b[x], v[x]) && !eq(m[x], v[x])) return null;
          if (x in m) o[x] = clone(m[x]); else delete o[x];
        }
        out[k] = o; continue;
      }
      if (process.env.DEBUG_SYNC) console.log('junção recusada no campo', k);
      return null;                                   // os dois mexeram no mesmo campo
    }
    if (k in mine) out[k] = clone(mine[k]); else delete out[k];
  }
  return out;
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function appendOnly(prev, next, what) {
  const a = prev || [], b = next || [];
  if (!Array.isArray(b) || b.length < a.length || !eq(a, b.slice(0, a.length))) throw httpErr(403, 'Não é permitido apagar ' + what + '.');
  return b.slice(a.length);
}

/* ---------------------------------------------------------------- validação de entrada */
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const nowIso = () => new Date().toISOString();
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const isoOk = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d(T[\d:.]+(Z|[+-]\d\d:?\d\d)?)?$/.test(v);
const ikey = i => String(i.pid || i.code || i.name);
const itemKey = i => (i.combo ? 'c:' + i.comboId : 'p:' + i.pid) + (i.extra ? ':x' : '');
const MAX_Q = 99999, MAX_PRICE = 1e6;
function qtyOk(q, kg) {
  if (!Number.isFinite(q) || q <= 0 || q > MAX_Q) return false;
  return kg ? Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6 : Number.isInteger(q);
}
function priceOk(v) { return Number.isFinite(v) && v > 0 && v <= MAX_PRICE; }
/* nenhum texto com < ou > vindo de quem não é administrador (defesa extra contra HTML/JS injetado) */
function noMarkup(v, path) {
  if (typeof v === 'string') { if (/[<>]/.test(v)) throw httpErr(400, 'Texto com caractere não permitido (< ou >).'); return; }
  if (Array.isArray(v)) { v.forEach(x => noMarkup(x, path)); return; }
  if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (/[<>]/.test(k)) throw httpErr(400, 'Campo inválido.'); noMarkup(x, path); });
}
function sizeOk(v, max, what) { if (JSON.stringify(v === undefined ? null : v).length > max) throw httpErr(400, (what || 'Registro') + ' grande demais.'); }
function cleanNf(nf) {
  if (!nf) return null;
  if (!isObj(nf)) throw httpErr(400, 'Dados da nota inválidos.');
  const o = {}; Object.entries(nf).slice(0, 30).forEach(([k, v]) => { if (/^[A-Za-z0-9_]{1,30}$/.test(k)) o[k] = typeof v === 'boolean' ? v : str(v, 200); });
  return o;
}
const PHOTO_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const activeSeller = (S, o) => (S.sellers || []).find(s => s.id === o.sellerId && s.active !== false) || null;
const HOLD = ['pendente', 'ajustar', 'contra'];
const held = o => HOLD.includes(o.appr) || o.appr === 'recusado';
const PRESET_FAILS = ['Loja fechada', 'Cliente ausente', 'Cliente recusou tudo', 'Endereço não encontrado', 'Sem dinheiro para pagar'];

/* comparação dos itens: o que importa para o dinheiro */
const itemSig = i => JSON.stringify([i.occLine ? 'occ:' + i.name : itemKey(i), Number(i.q), r2(i.price)]);
const sameItems = (a, b) => eq((a || []).map(itemSig), (b || []).map(itemSig));

/* aplica uma falta (quantidade menor) num item; devolve o texto do aviso */
function applyFalta(C, o, key, q) {
  const it = o.items.find(i => !i.occLine && ikey(i) === key);
  if (!it) throw httpErr(400, 'O item não está mais no pedido.');
  if (!(Number.isFinite(q) && q >= 0 && q < Number(it.q))) throw httpErr(400, 'Quantidade da falta inválida.');
  if (o.totalOrig == null) o.totalOrig = o.total;
  if (it.qOrig == null) it.qOrig = it.q;
  it.q = q; Object.assign(o, C.orderTotals(o)); o.adjAt = nowIso();
  return 'Seu pedido nº ' + o.no + ' teve item em falta: ' + it.name + ' (pedido ' + it.qOrig + ', separado ' + it.q + '). Novo total: ' + C.brl(o.total) + '.';
}
/* aplica uma troca ou inclusão aprovada, com preço de tabela calculado aqui */
function applySwap(C, S, o, s) {
  const p = (S.products || []).find(x => x.id === s.pid && x.active !== false);
  if (!p) throw httpErr(400, 'Produto da troca não encontrado.');
  const q = Number(s.q);
  if (!qtyOk(q, C.isKg(p))) throw httpErr(400, 'Quantidade da troca inválida.');
  const std = refPrice(C, S, o, p, q);
  const item = fillItem(C, p, { base: C.baseOf(p), price: std.price, label: std.label, q }, { ie: std.ie, rp: std.rp });
  o.chk = isObj(o.chk) ? o.chk : {};
  let msg;
  if (s.type === 'troca') {
    const k = o.items.findIndex(i => !i.occLine && ikey(i) === s.fromKey);
    if (k < 0) throw httpErr(400, 'O item original não está mais no pedido.');
    const old = o.items[k]; o.items.splice(k, 1, item); delete o.chk[s.fromKey]; o.chk[ikey(item)] = true;
    msg = 'Seu pedido nº ' + o.no + ': ' + old.name + ' foi substituído por ' + p.name + ' (' + q + '). ';
  } else { o.items.push(item); o.chk[ikey(item)] = true; msg = 'Seu pedido nº ' + o.no + ': incluímos ' + q + '× ' + p.name + '. '; }
  Object.assign(o, C.orderTotals(o)); s.price = std.price;
  return msg + 'Novo total: ' + C.brl(o.total) + '.';
}

/* sugestões novas do conferente (troca, inclusão, falta) */
function confSugs(C, S, user, prev, next, o, events) {
  const add = appendOnly(prev.sugs, next.sugs, 'sugestões');
  noMarkup(add);
  if (add.length > 20) throw httpErr(400, 'Sugestões demais de uma vez.');
  const out = clone(prev.sugs || []);
  for (const s0 of add) {
    if (!isObj(s0) || !ID_RE.test(String(s0.id || ''))) throw httpErr(400, 'Sugestão inválida.');
    const type = s0.type;
    if (!['troca', 'inclusao', 'qtd'].includes(type)) throw httpErr(400, 'Tipo de sugestão inválido.');
    const s = { id: s0.id, type, by: user.name, at: nowIso(), status: 'pendente', note: str(s0.note, 300) };
    if (type !== 'inclusao') {
      const it = o.items.find(i => !i.occLine && ikey(i) === String(s0.fromKey));
      if (!it) throw httpErr(400, 'O item não está no pedido.');
      Object.assign(s, { fromKey: ikey(it), fromName: it.name });
    }
    if (type === 'qtd') {
      const it = o.items.find(i => !i.occLine && ikey(i) === s.fromKey);
      Object.assign(s, { qFrom: it.q, q: Number(s0.q), unit: it.unit || '', pk: Number(it.perPack) || '' });
      if (!(Number.isFinite(s.q) && s.q >= 0 && s.q < Number(it.q))) throw httpErr(400, 'Quantidade da falta inválida.');
      if (activeSeller(S, o)) { // pedido de vendedor: a falta já entra e o vendedor é avisado
        events.push(applyFalta(C, o, s.fromKey, s.q));
        Object.assign(s, { status: 'aprovada', auto: true, decBy: user.name, sellerSeen: false, doneAt: nowIso() });
      }
    } else {
      const p = (S.products || []).find(x => x.id === s0.pid && x.active !== false);
      if (!p) throw httpErr(400, 'Produto não encontrado.');
      const q = Number(s0.q); if (!qtyOk(q, C.isKg(p))) throw httpErr(400, 'Quantidade inválida.');
      Object.assign(s, { pid: p.id, name: p.name, unit: p.unit || '', pk: C.packOf(p) || '', q, toSeller: !!activeSeller(S, o) });
      if (type === 'inclusao') { s.fromKey = ''; s.fromName = ''; }
    }
    out.push(s);
  }
  return out;
}
/* vendedor decide as perguntas da separação (troca/inclusão) e marca avisos como vistos */
function sellerSugs(C, S, user, prev, next, o, events) {
  const P = prev.sugs || [], N = next.sugs || [];
  if (!Array.isArray(N) || N.length !== P.length) throw httpErr(403, 'Não é permitido incluir ou apagar sugestões.');
  const out = clone(P);
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = N[k];
    if (eq(a, b)) continue;
    if (!b || b.id !== a.id) throw httpErr(400, 'Sugestão inválida.');
    const s = out[k];
    if (a.status === 'pendente' && b.status !== 'pendente') {
      if (!a.toSeller || !['troca', 'inclusao'].includes(a.type)) throw httpErr(403, 'Essa decisão é da loja.');
      if (!['aprovada', 'recusada'].includes(b.status)) throw httpErr(400, 'Decisão inválida.');
      s.status = b.status; s.doneAt = nowIso(); s.decBy = user.name; s.sellerSeen = true;
      if (b.status === 'aprovada') events.push(applySwap(C, S, o, s));
    } else if (a.sellerSeen === false && b.sellerSeen === true && a.status !== 'pendente') {
      s.sellerSeen = true;
    } else throw httpErr(403, 'Você não pode alterar essa sugestão.');
  }
  return out;
}

/* entregador: ocorrência na entrega. O servidor confere item por item e recalcula. */
function driverItems(C, S, prev, next, o) {
  const P = (prev.items || []);
  const base = new Map(P.filter(i => !i.occLine && !i.extra).map(i => [ikey(i), i]));
  const usedU = new Map();
  const out = [];
  let newOcc = 0;
  for (const ni of (next.items || [])) {
    if (!isObj(ni)) throw httpErr(400, 'Item inválido.');
    if (ni.occLine) {
      const was = P.find(i => i.occLine && eq(i, ni));
      if (was) { out.push(clone(was)); continue; }
      const src = base.get(String(ni.src || ''));
      const pk = src ? Number(src.perPack) || 1 : 1, units = Number(ni.units);
      if (!src || !(units > 0) || units >= pk || ++newOcc > 30) throw httpErr(400, 'Ajuste de entrega inválido.');
      usedU.set(ikey(src), (usedU.get(ikey(src)) || 0) + units);
      const t = OCC_OK.includes(ni.t) ? ni.t : 'avaria';
      out.push({ name: str(ni.name, 200) || ('Ajuste: ' + units + ' de ' + src.name), unit: 'ajuste na entrega', q: 1, price: -r2(units * Number(src.price) / pk), label: 'Ocorrência na entrega', occLine: true, src: ikey(src), units, t });
      continue;
    }
    if (ni.extra) {
      const was = P.find(i => i.extra && itemKey(i) === itemKey(ni));
      if (was) { if (Number(ni.q) !== Number(was.q)) throw httpErr(403, 'Produto a mais já registrado.'); out.push(clone(was)); continue; }
      const p = (S.products || []).find(x => x.id === ni.pid && x.active !== false);
      const q = Number(ni.q);
      if (!p || !qtyOk(q, C.isKg(p)) || q > 9999) throw httpErr(400, 'Produto a mais inválido.');
      out.push(fillItem(C, p, { base: C.baseOf(p), price: r2(C.baseOf(p)), label: 'Adicionado na entrega', q, extra: true }, {}));
      continue;
    }
    const pi = base.get(ikey(ni));
    if (!pi || out.some(x => !x.occLine && !x.extra && ikey(x) === ikey(pi))) throw httpErr(403, 'Item inválido na entrega.');
    const q = Number(ni.q), q0 = Number(pi.q);
    if (!Number.isFinite(q) || q < 0 || q > q0 + 1e-9) throw httpErr(400, 'Quantidade inválida na entrega.');
    const it = clone(pi);
    if (q < q0) { it.q = q; it.qOcc = (Number(pi.qOcc) || 0) + (q0 - q); usedU.set(ikey(pi), (usedU.get(ikey(pi)) || 0) + (q0 - q) * (Number(pi.perPack) || 1)); }
    out.push(it);
  }
  for (const [k, pi] of base) {
    if (!out.some(x => !x.occLine && !x.extra && ikey(x) === k)) throw httpErr(403, 'Não é permitido tirar produto do pedido na entrega.');
    if ((usedU.get(k) || 0) > Number(pi.q) * (Number(pi.perPack) || 1) + 1e-9) throw httpErr(400, 'A ocorrência passa da quantidade entregue de ' + pi.name + '.');
  }
  if (P.some(i => (i.occLine || i.extra) && !out.some(x => eq(x, i)))) throw httpErr(403, 'Não é permitido apagar ajuste de entrega.');
  return out;
}
function cleanOcc(oc) {
  if (!isObj(oc)) throw httpErr(400, 'Ocorrência inválida.');
  const items = (Array.isArray(oc.items) ? oc.items : []).slice(0, 60).map(x => {
    if (!isObj(x) || !OCC_OK.includes(x.t)) throw httpErr(400, 'Tipo de ocorrência inválido.');
    const q = Number(x.q); if (!(Number.isFinite(q) && q > 0 && q <= MAX_Q)) throw httpErr(400, 'Quantidade da ocorrência inválida.');
    return { t: x.t, name: str(x.name, 200), q, u: x.u === 'un' ? 'un' : 'pk', txt: str(x.txt, 120), amount: r2(Number(x.amount) || 0) };
  });
  const extras = (Array.isArray(oc.extras) ? oc.extras : []).slice(0, 30).map(x => {
    const q = Number(x.q); if (!(Number.isFinite(q) && q > 0 && q <= 9999)) throw httpErr(400, 'Quantidade inválida.');
    return { pid: str(x.pid, 80), name: str(x.name, 200), q, price: r2(Number(x.price) || 0), amount: r2(Number(x.amount) || 0) };
  });
  return { at: nowIso(), items, extras };
}

/* confere uma alteração de pedido feita por quem não é administrador.
   Regra geral: depois que o pedido sai de "novo", só a loja mexe em itens e preços;
   cada papel só faz a sua etapa, e o servidor recalcula tudo o que envolve dinheiro. */
function checkOrderUpdate(S, user, prev, next) {
  const role = user.role, me = user.ref_id;
  if (!canSeeOrder(prev, user, S)) throw httpErr(403, 'Pedido de outra pessoa.');
  if (!isObj(next)) throw httpErr(400, 'Registro inválido.');
  sizeOk(next, 4000000, 'Pedido');
  const { C } = coreFor(S, role === 'vendedor' ? 'vend' : 'x', { seller: me });
  const o = clone(prev);
  next = mergeHidden(prev, stripOrder(prev, role), next);
  const s0 = prev.status, s1 = next.status || s0;
  const a0 = prev.appr || null, a1 = next.appr === undefined ? a0 : (next.appr || null);
  const events = [];
  const finished = ['concluido', 'cancelado'].includes(s0);
  if (s0 === 'cancelado' && s1 !== 'cancelado') throw httpErr(403, 'O pedido nº ' + prev.no + ' foi cancelado pela loja. Fale com a loja.');

  // ---- campos simples (cada papel só os seus)
  const allowed = new Set(OF[role] || []);
  const SPECIAL = ['items', 'status', 'appr', 'sub', 'disc', 'total', 'stockApplied', 'recLaunched', 'recAuto', 'doneAt', 'events', 'sugs', 'removed',
    'billed', 'deliv', 'delivered', 'occ', 'checker', 'apprHist', 'prevTotal', 'totalOrig', 'adjAt', 'editedAt', 'editedBy', 'apprAt'];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (SPECIAL.includes(k) || eq(prev[k], next[k])) continue;
    if (!allowed.has(k)) throw httpErr(403, `Você não pode alterar "${k}" do pedido.`);
    if (finished && !['seenAt', 'nfExported'].includes(k)) throw httpErr(403, 'Pedido já ' + (s0 === 'cancelado' ? 'cancelado' : 'concluído') + ': fale com a loja.');
    const v = next[k];
    noMarkup(v);
    switch (k) {
      case 'mode': case 'addr': case 'bairro': case 'pay': case 'note': case 'nf':
        if (prev.status !== 'novo') throw httpErr(403, 'O pedido já está em separação: fale com a loja para mudar.');
        if (k === 'mode') { if (!['entrega', 'retirada'].includes(v)) throw httpErr(400, 'Forma de receber inválida.'); o.mode = v; }
        else if (k === 'pay') { const cli = (S.customers || []).find(c => c.id === prev.customerId); if (!cli || !C.allowedPays(cli).includes(v)) throw httpErr(400, 'Forma de pagamento não liberada para este cliente.'); o.pay = v; }
        else if (k === 'nf') o.nf = cleanNf(v);
        else o[k] = str(v, k === 'note' ? 1000 : 300);
        break;
      case 'seenAt': case 'checkStartAt': case 'checkedAt':
        if (v != null && !isoOk(v)) throw httpErr(400, 'Data inválida.'); o[k] = v; break;
      case 'apprNote': case 'checkNote': o[k] = str(v, 500); break;
      case 'cliRej': o[k] = !!v; break;
      case 'volumes': { const n = Number(v); if (v !== '' && v != null && !(Number.isInteger(n) && n >= 0 && n <= 9999)) throw httpErr(400, 'Volumes inválidos.'); o[k] = v; break; }
      case 'chk': case 'scan': case 'durs': {
        if (v != null && !isObj(v)) throw httpErr(400, 'Conferência inválida.');
        sizeOk(v, 50000, 'Conferência'); o[k] = clone(v); break;
      }
      case 'scanLog': appendOnly(prev.scanLog, v, 'o registro de leitura'); sizeOk(v, 200000, 'Registro de leitura'); o[k] = clone(v); break;
      case 'nfExported': o[k] = typeof v === 'boolean' ? v : str(v, 40); break;
      default: o[k] = clone(v);
    }
  }
  if (allowed.has('apprHist') || role === 'cliente' || role === 'vendedor') {
    const add = appendOnly(prev.apprHist, next.apprHist, 'o histórico');
    noMarkup(add);
    if (add.length > 5) throw httpErr(400, 'Histórico inválido.');
    o.apprHist = (prev.apprHist || []).concat(add.map(h => ({ at: nowIso(), by: user.name, what: str(h && h.what, 300) })));
  } else if (!eq(prev.apprHist, next.apprHist) && next.apprHist !== undefined) throw httpErr(403, 'Você não pode alterar o histórico.');
  if (role === 'conferente') {
    if (!['novo', 'separando'].includes(s0) && !eq(prev.sugs, next.sugs)) throw httpErr(403, 'A conferência deste pedido já terminou.');
    if (!eq(prev.sugs, next.sugs)) o.sugs = confSugs(C, S, user, prev, next, o, events);
    if (!eq(prev.chk, next.chk) || !eq(prev.scan, next.scan)) { if (!['novo', 'separando'].includes(s0)) throw httpErr(403, 'A conferência deste pedido já terminou.'); }
    o.checker = user.name;
  } else if (role === 'vendedor' && !eq(prev.sugs, next.sugs)) {
    if (s0 !== 'separando') throw httpErr(403, 'O pedido não está em separação.');
    o.sugs = sellerSugs(C, S, user, prev, next, o, events);
  } else if (!eq(prev.sugs, next.sugs) && next.sugs !== undefined) {
    // aviso "visto" do vendedor vem pelo caminho acima; outros papéis não mexem
    throw httpErr(403, 'Você não pode alterar as sugestões.');
  }

  // ---- faturamento
  if (role === 'faturamento' && !eq(prev.billed, next.billed)) {
    if (next.billed) {
      if (prev.billed) throw httpErr(403, 'Pedido já faturado.');
      if (!['separado', 'pronto', 'saiu', 'concluido'].includes(s0)) throw httpErr(403, 'O pedido ainda não foi separado.');
      if (held(o)) throw httpErr(403, 'O pedido nº ' + o.no + ' está aguardando aprovação da loja.');
      const nf = String((next.billed && next.billed.nf) || '').replace(/[\s.]/g, '');
      if (nf && !/^\d{1,12}$/.test(nf)) throw httpErr(400, 'Número da nota inválido: use só números.');
      if (!nf && o.nf) throw httpErr(400, 'O pedido nº ' + o.no + ' é com nota fiscal: informe o número da NF.');
      o.billed = { at: nowIso(), by: user.name, nf };
    } else {
      if (!['separado', 'pronto'].includes(s0)) throw httpErr(403, 'O pedido já saiu: não dá para desfazer o faturamento.');
      delete o.billed;
    }
  }
  if (role !== 'faturamento' && !eq(prev.billed, next.billed) && next.billed !== undefined) throw httpErr(403, 'Você não pode alterar o faturamento.');

  // ---- entregador: entrega, tentativa e ocorrência
  if (role === 'entregador') {
    const d0 = prev.deliv || {}, d1 = isObj(next.deliv) ? next.deliv : {};
    if ((d1.drv || '') !== (d0.drv || '')) throw httpErr(403, 'Só a loja muda o motorista.');
    const addF = appendOnly(d0.fails, d1.fails, 'as tentativas de entrega');
    noMarkup(addF); noMarkup(next.delivered && { n: next.delivered.name, x: next.delivered.note }); noMarkup(next.occ);
    if (addF.length) {
      if (s0 !== 'saiu' || s1 !== 'pronto' || addF.length > 1) throw httpErr(400, 'Tentativa de entrega inválida.');
      const reason = str(addF[0] && addF[0].reason, 200).trim();
      if (!reason) throw httpErr(400, 'Diga o motivo de não ter entregue.');
      o.deliv = Object.assign({}, d0, { fails: (d0.fails || []).concat([{ at: nowIso(), reason, by: user.name }]) });
      events.push('Seu pedido nº ' + o.no + ' não pôde ser entregue' + (PRESET_FAILS.includes(reason) ? ' (' + reason.toLowerCase() + ')' : '') + '. Vamos reagendar.');
    }
    if (s0 === 'pronto' && s1 === 'saiu') o.deliv = Object.assign({}, o.deliv || d0, { outAt: nowIso() });
    const other = k => !['fails', 'outAt'].includes(k);
    if (Object.keys(Object.assign({}, d0, d1)).some(k => other(k) && !eq(d0[k], d1[k]))) throw httpErr(403, 'Você não pode alterar a entrega.');
    if (!eq(prev.delivered, next.delivered)) {
      if (prev.delivered) throw httpErr(403, 'Entrega já registrada.');
      if (s0 !== 'saiu' || s1 !== 'concluido') throw httpErr(400, 'Só dá para confirmar a entrega de pedido em rota.');
      const D0 = isObj(next.delivered) ? next.delivered : {};
      const photo = String(D0.photo || '');
      if (!photo) throw httpErr(400, 'A foto do canhoto é obrigatória.');
      if (!PHOTO_RE.test(photo) || photo.length > 3 * 1024 * 1024) throw httpErr(400, 'A foto do canhoto precisa ser uma imagem (JPG, PNG ou WEBP) de até 2 MB.');
      const name = str(D0.name, 120).trim();
      if (!name) throw httpErr(400, 'Informe quem recebeu.');
      const how = D0.how || '';
      if (!['', 'dinheiro', 'pix', 'nao'].includes(how)) throw httpErr(400, 'Forma de recebimento inválida.');
      o.delivered = { at: nowIso(), name, photo, how, note: str(D0.note, 300), drv: me, by: user.name, pickup: false, settled: !['dinheiro', 'pix'].includes(how) };
    }
    if (!eq(prev.occ, next.occ)) {
      if (prev.occ) throw httpErr(403, 'Ocorrência já registrada.');
      if (s0 !== 'saiu' || s1 !== 'concluido') throw httpErr(400, 'A ocorrência é registrada junto com a entrega.');
    }
  } else if (!eq(prev.deliv, next.deliv) && next.deliv !== undefined) throw httpErr(403, 'Só a loja programa a entrega.');
  else if (role === 'faturamento' && !eq(prev.delivered, next.delivered) && next.delivered !== undefined) {
    // acerto: faturamento confirma que o dinheiro chegou na loja ou que o PIX caiu na conta (só isso)
    const a = clone(prev.delivered) || {}, b = isObj(next.delivered) ? clone(next.delivered) : {};
    ['settled', 'settledAt', 'settledBy'].forEach(k => { delete a[k]; delete b[k]; });
    if (!prev.delivered || !eq(a, b) || prev.delivered.settled || next.delivered.settled !== true || !['dinheiro', 'pix'].includes(prev.delivered.how)) throw httpErr(403, 'Você só pode confirmar o recebimento do dinheiro ou do PIX.');
    o.delivered = Object.assign(clone(prev.delivered), { settled: true, settledAt: nowIso(), settledBy: user.name });
  }
  else if (!eq(prev.delivered, next.delivered) && next.delivered !== undefined) throw httpErr(403, 'Só o motorista confirma a entrega.');
  if (role === 'faturamento' && !eq(prev.occ, next.occ)) {
    const a = clone(prev.occ) || {}, b = clone(next.occ) || {};
    delete a.reboleto; delete a.reboletoAt; delete b.reboleto; delete b.reboletoAt;
    if (!eq(a, b) || !prev.occ || next.occ.reboleto !== false) throw httpErr(403, 'Você só pode marcar o boleto como refeito.');
    o.occ = Object.assign(clone(prev.occ), { reboleto: false, reboletoAt: nowIso() });
  } else if (role !== 'entregador' && !eq(prev.occ, next.occ) && next.occ !== undefined) throw httpErr(403, 'Você não pode alterar a ocorrência.');

  // ---- itens: quem pode mexer e quando
  const itemsChanged = !sameItems(prev.items, next.items) && next.items !== undefined;
  let removedNow = [];
  let sellerEdit = false, priceDown = false;
  if (role === 'vendedor' && s0 === 'separando') {
    // na separação, os itens do vendedor só mudam pelas decisões de troca/inclusão (já aplicadas acima)
  } else if (role === 'conferente') {
    // faltas já aplicadas pelo servidor em confSugs; fora isso o conferente não muda produto nem preço
    if (next.items !== undefined && !sameItems(o.items, next.items)) throw httpErr(403, 'Você não pode mudar produtos ou preços do pedido.');
  } else if (itemsChanged) {
    if (role === 'cliente') {
      if (!(s0 === 'novo' && a0 === 'contra' && a1 === 'aceito')) throw httpErr(403, 'Para mudar os produtos, fale com a loja.');
      removedNow = removeItems(prev, next, o);
      revertNeg(C, o, user, removedNow);
    } else if (role === 'vendedor') {
      if (s0 !== 'novo') throw httpErr(403, 'O pedido já está em separação: fale com a loja.');
      const r = sellerItems(C, S, prev, next, o);
      removedNow = r.removed; priceDown = r.priceDown; sellerEdit = true;
      if (a0 === 'contra' && a1 === 'aceito') revertNeg(C, o, user, removedNow);
    } else if (role === 'entregador') {
      if (!(s0 === 'saiu' && s1 === 'concluido' && next.occ && !prev.occ)) throw httpErr(403, 'Os produtos só mudam com ocorrência na entrega.');
      o.items = driverItems(C, S, prev, next, o);
    } else throw httpErr(403, 'Você não pode mudar os produtos do pedido.');
  }
  if (removedNow.length) o.removed = (prev.removed || []).concat(removedNow.map(i => ({ name: i.name, q: i.q, price: i.price, by: user.name })));
  Object.assign(o, C.orderTotals(o));
  if (!o.items.some(i => i.q > 0 && !i.occLine) && s1 !== 'cancelado') throw httpErr(400, 'O pedido não pode ficar sem produtos.');
  if ((role === 'cliente' || role === 'vendedor') && (itemsChanged || removedNow.length) && o.total + 0.004 < Number(S.store.min || 0) && s1 !== 'cancelado') throw httpErr(400, 'O pedido ficaria abaixo do pedido mínimo de ' + C.brl(Number(S.store.min)) + '.');

  // ---- aprovação
  if (a0 !== a1) {
    const OK = {
      cliente: [['contra', 'aceito'], ['contra', 'recusado']],
      vendedor: [['contra', 'aceito'], ['contra', 'recusado'], ['contra', 'pendente'], ['pendente', 'liberado'], [null, 'pendente'], ['liberado', 'pendente'], ['aprovado', 'pendente'], ['aceito', 'pendente']],
    }[role] || [];
    if (!OK.some(([x, y]) => x === a0 && y === a1)) throw httpErr(403, 'Mudança de aprovação não permitida.');
    if (s0 !== 'novo') throw httpErr(403, 'O pedido já está em separação.');
    if (a1 === 'recusado' && s1 !== 'cancelado') throw httpErr(400, 'Recusar a resposta da loja cancela o pedido.');
    o.appr = a1; o.apprAt = nowIso();
  }
  if (role === 'vendedor' && sellerEdit) {
    const K = sellerLock(S, me, o);
    delete o.tolUsed;
    if (K && !K.ok) { o.appr = 'pendente'; o.apprMin = K.min; o.apprMg = Math.round(K.mg * 10) / 10; o.apprNeed = K.need; }
    if (K && K.ok && K.tol) o.tolUsed = { mg: Math.round(K.mg * 10) / 10, min: Math.round(K.min * 10) / 10, at: nowIso() };
    if (K && K.ok && o.appr === 'liberado' && a0 !== 'pendente') o.appr = a0;
    o.editedAt = nowIso(); o.editedBy = user.name;
    if (!sameItems(prev.items, o.items)) events.push('Seu pedido nº ' + o.no + ' foi alterado pelo vendedor: ' + o.items.reduce((s, i) => s + (i.occLine ? 0 : Number(i.q) || 0), 0) + ' itens, total ' + C.brl(o.total) + '.');
    void priceDown;
  }
  if (o.appr === 'liberado' && a0 === 'pendente') {
    const K = sellerLock(S, me, o);
    if (K && !K.ok) throw httpErr(403, 'A margem ainda está abaixo do permitido.');
  }

  // ---- situação
  if (s0 !== s1) {
    const T = {
      cliente: [['novo', 'cancelado']],
      vendedor: [['novo', 'cancelado']],
      conferente: [['novo', 'separando'], ['separando', 'separado'], ['separando', 'pronto'], ['separando', 'novo']],
      faturamento: [['separado', 'pronto'], ['pronto', 'separado']],
      entregador: [['pronto', 'saiu'], ['saiu', 'concluido'], ['saiu', 'pronto']],
    }[role] || [];
    if (!T.some(([x, y]) => x === s0 && y === s1)) throw httpErr(403, `Você não pode mudar o pedido de "${s0}" para "${s1}".`);
    if (['separando', 'separado', 'pronto', 'saiu', 'concluido'].includes(s1) && held(o)) throw httpErr(403, 'O pedido nº ' + o.no + ' está aguardando aprovação da loja.');
    if (['pronto', 'saiu', 'concluido'].includes(s1) && C.needsBill(o) && !o.billed) throw httpErr(403, 'Pedido nº ' + o.no + ' ainda não foi faturado.');
    if (role === 'conferente' && s1 === 'pronto' && C.needsBill(o)) throw httpErr(403, 'Este pedido precisa passar pelo faturamento.');
    if (role === 'conferente' && ['separado', 'pronto'].includes(s1) && (o.sugs || []).some(s => s.status === 'pendente')) throw httpErr(403, 'Ainda há troca ou falta esperando decisão.');
    if (role === 'faturamento' && s1 === 'pronto' && !o.billed) throw httpErr(403, 'Marque como faturado.');
    if (role === 'faturamento' && s1 === 'separado' && (o.billed || !C.needsBill(o))) throw httpErr(403, 'Mudança não permitida.');
    if (role === 'entregador' && s1 === 'concluido' && !o.delivered) throw httpErr(400, 'Confirme a entrega com a foto do canhoto.');
    if (role === 'entregador' && s1 === 'pronto' && !((o.deliv || {}).fails || []).length) throw httpErr(400, 'Diga o motivo de não ter entregue.');
    if (s1 === 'cancelado' && o.appr === 'recusado') o.cliRej = true;
    o.status = s1;
    if (s1 === 'concluido') o.doneAt = nowIso();
    if (!(role === 'entregador' && s1 === 'pronto')) events.push(C.statusMsg(o));
  }

  // ---- entrega com ocorrência: os valores conferem com os itens?
  if (role === 'entregador' && next.occ && !prev.occ) {
    const oc = cleanOcc(next.occ), cash = C.isCash(o.pay);
    if (!(o.total > 0.004)) throw httpErr(400, 'Com essa ocorrência o pedido fica sem valor. Use "Não entregue" (cliente recusou tudo).');
    const extra = r2(o.items.filter(i => i.extra).reduce((s, i) => s + i.price * i.q, 0) - (prev.items || []).filter(i => i.extra).reduce((s, i) => s + i.price * i.q, 0));
    oc.from = prev.total; oc.to = o.total; oc.extra = extra; oc.cash = cash; oc.desc = r2(prev.total - (o.total - extra));
    oc.collect = cash ? r2(o.total - extra) : 0; oc.reboleto = !cash;
    o.occ = oc;
    events.push('Pedido nº ' + o.no + ' entregue com ocorrência. Novo valor: ' + C.brl(o.total) + '.');
  }
  if (role === 'entregador' && o.delivered && !prev.delivered) {
    const cash = C.isCash(o.pay);
    o.delivered.collect = cash ? (o.occ && !prev.occ ? o.occ.collect : o.total) : 0;
    if (cash && !o.delivered.how) throw httpErr(400, 'Toque em como o cliente pagou.');
    if (!cash) o.delivered.how = '';
  }
  // avisos: só os que o servidor gerou (texto livre de quem não é da loja não vira aviso oficial)
  o.events = clone(prev.events || []);
  events.filter(Boolean).forEach(t => C.addEvent(o, t));
  return o;
}
/* tira produtos (cliente/vendedor aceitando a contraproposta); devolve os retirados */
function removeItems(prev, next, o) {
  const keep = new Set((next.items || []).filter(i => !i.occLine).map(itemKey));
  const P = prev.items || [];
  const out = P.filter(i => !i.occLine && !keep.has(itemKey(i)));
  // o resto tem que ficar igual (só pode tirar)
  const rest = P.filter(i => !out.includes(i));
  const nx = (next.items || []).filter(i => !i.occLine);
  if (nx.length !== rest.length || rest.some(i => { const n = nx.find(x => itemKey(x) === itemKey(i)); return !n || Number(n.q) !== Number(i.q); })) throw httpErr(403, 'Aqui só dá para tirar produtos do pedido.');
  o.items = clone(rest);
  return out;
}
/* com menos produtos que o mínimo da negociação, o preço negociado volta ao normal (regra do servidor) */
function revertNeg(C, o, user, removed) {
  if (!o.negCli) return;
  const cfg = C.negCfg();
  const keep = o.items.filter(i => i.q > 0 && !i.occLine);
  if (keep.filter(i => !i.combo).length >= cfg.minItems) return;
  const lose = keep.filter(i => i.negAsk != null && Number(i.negFrom) > 0 && i.price < Number(i.negFrom) - 0.004);
  lose.forEach(i => { i.prevPrice = i.price; i.price = Number(i.negFrom); i.label = ''; });
  if (lose.length) (o.apprHist = o.apprHist || []).push({ at: nowIso(), by: user.name, what: 'preço negociado voltou ao normal: ' + lose.map(i => i.name).join(', ') });
  void removed;
}
/* vendedor editando pedido "novo": confere cada item */
function sellerItems(C, S, prev, next, o) {
  const P = prev.items || [];
  const prevBy = new Map(P.filter(i => !i.occLine).map(i => [itemKey(i), i]));
  const seen = new Set(), out = [];
  let priceDown = false;
  for (const ni of (next.items || [])) {
    if (!isObj(ni) || ni.occLine || ni.extra) throw httpErr(400, 'Item inválido.');
    const key = itemKey(ni);
    if (seen.has(key)) throw httpErr(400, 'Produto repetido no pedido.');
    seen.add(key);
    const pi = prevBy.get(key);
    const p = productOf(S, C, pi || ni);
    const q = Number(ni.q), price = r2(Number(ni.price));
    if (!qtyOk(q, p ? C.isKg(p) : false)) throw httpErr(400, 'Quantidade inválida' + (p ? ' em ' + p.name : '') + '.');
    if (!priceOk(Number(ni.price))) throw httpErr(400, 'Preço inválido' + (p ? ' em ' + p.name : '') + '.');
    if (pi) {
      const it = clone(pi);
      it.q = q;
      if (!near(price, pi.price)) {
        if (!p) throw httpErr(400, 'Produto não encontrado.');
        const ref = refPrice(C, S, o, p, q).price;
        if (price > ref * 5 + 0.01) throw httpErr(400, 'Preço de ' + p.name + ' muito acima da tabela. Confira o valor.');
        if (price < pi.price - 0.004) priceDown = true;
        it.price = price; it.label = near(price, ref) ? it.label : 'Preço negociado';
      }
      out.push(it);
    } else {
      if (!p || p.active === false) throw httpErr(400, 'Produto não encontrado.');
      const ref = refPrice(C, S, o, p, q);
      if (price > ref.price * 5 + 0.01) throw httpErr(400, 'Preço de ' + p.name + ' muito acima da tabela. Confira o valor.');
      if (price < ref.price - 0.004) priceDown = true;
      out.push(fillItem(C, p, { base: p.isCombo ? p.listPrice : C.baseOf(p), price, label: near(price, ref.price) ? ref.label : 'Preço negociado', q }, { ie: ref.ie, rp: ref.rp }));
    }
  }
  const removed = P.filter(i => !i.occLine && !seen.has(itemKey(i)));
  o.items = out;
  return { removed, priceDown };
}

/*
 * Aplica UMA alteração vinda do navegador (o servidor chama uma vez para cada, e recusa só a que estiver errada).
 * Devolve as gravações (já corrigidas pelo servidor) e os efeitos (estoque, contas, registro de propostas).
 */
function applySync(S, V, user, changes, effects) {
  const role = user.role, me = user.ref_id;
  const writes = [], drops = [];
  effects = effects || newEffects();
  const byId = (c, id) => (S[c] || []).find(x => x && x.id === id);
  const verOf = (c, id) => c === 'meta' ? (V.meta || {})[id] : (V[c] || {})[id];

  for (const ch of changes) {
    if (!isObj(ch)) throw httpErr(400, 'Alteração inválida.');
    const c = String(ch.c || ''), id = String(ch.id || ''), op = ch.op === 'del' ? 'del' : 'put';
    if (!ID_RE.test(id)) throw httpErr(400, 'Identificador inválido.');
    if (c === 'meta' ? !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(id) || COLLS_SET.has(id) || id === 'seq' : !COLLS_SET.has(c)) throw httpErr(400, 'Alteração inválida.');
    if (role !== 'admin' && c === 'meta') continue;
    const exists = c === 'meta' ? S[id] !== undefined && verOf(c, id) != null : !!byId(c, id);
    // contas que o servidor gera sozinho: o que vier do navegador de quem não é administrador é descartado
    if (role !== 'admin' && c === 'receivables' && op === 'put' && !exists) { drops.push({ c, id }); continue; }
    if (exists && ch.ver !== verOf(c, id)) {
      // duas pessoas mexeram no mesmo registro: se mudaram partes diferentes, junta as duas mudanças
      const merged = c !== 'meta' && op === 'put' && ch.base ? mergeConcurrent(byId(c, id), ch.base, ch.doc, role) : null;
      if (!merged) throw httpErr(409, 'Outra pessoa alterou isso antes de você. Atualizando a tela.');
      ch.doc = merged; ch.ver = verOf(c, id);
    }
    if (!exists && ch.ver) throw httpErr(409, 'Esse registro foi apagado por outra pessoa. Atualizando a tela.');

    // ----- administrador: pode tudo, mas senhas viram hash, número do pedido é do servidor,
    //       e estoque/contas automáticas dos pedidos são feitos aqui (não no navegador)
    if (role === 'admin') {
      if (op === 'del') { writes.push({ c, id, op, ver: ch.ver }); if (c === 'orders') { const k = S.orders.findIndex(x => x.id === id); if (k >= 0) S.orders.splice(k, 1); } continue; }
      const doc = clone(ch.doc);
      if (doc === undefined || (c !== 'meta' && !isObj(doc))) throw httpErr(400, 'Registro inválido.');
      if (c !== 'meta') doc.id = id;
      const w = { c, id, op, doc, ver: exists ? ch.ver : undefined };
      if (USER_COLLS[c]) { w.syncUser = true; w.userOpts = { mustReset: !(c === 'admins' && id === me), base: !(c === 'admins' && id === me) }; }
      if (c === 'romaneios' && !Array.isArray(doc.orders)) throw httpErr(400, 'Romaneio inválido.');
      if (c === 'suppliers') { w.doc = cleanSupplier(S, doc); S.suppliers = (S.suppliers || []).filter(x => x.id !== id).concat([w.doc]); }
      if (c === 'receipts') {
        const prev = exists ? byId(c, id) : null;
        w.doc = checkReceipt(S, user, prev, doc);
        receiptEffects(S, w.doc, prev, effects);
        if (prev) S.receipts[S.receipts.indexOf(prev)] = w.doc; else (S.receipts = S.receipts || []).push(w.doc);
      }
      if (c === 'orders') {
        if (!exists) w.newOrder = true;
        const prev = exists ? byId(c, id) : null;
        if (!Array.isArray(doc.items)) throw httpErr(400, 'Pedido inválido.');
        doc.items.forEach(i => { if (!isObj(i) || !Number.isFinite(Number(i.q)) || !Number.isFinite(Number(i.price)) || Math.abs(Number(i.price)) > MAX_PRICE || Number(i.q) > MAX_Q * 10) throw httpErr(400, 'Item com valor inválido no pedido.'); });
        ['sub', 'disc', 'total'].forEach(k => { if (doc[k] != null) doc[k] = r2(doc[k]); });
        doc.stockApplied = prev ? clone(prev.stockApplied || {}) : {};
        if (prev) { const k = S.orders.indexOf(prev); S.orders[k] = doc; } else S.orders.unshift(doc);
        orderEffects(S, doc, prev ? prev.status : null, effects);
      }
      writes.push(w);
      continue;
    }

    // ----- demais papéis
    const perm = (WRITE[role] || {})[c] || '';
    if (op === 'del') throw httpErr(403, 'Você não pode apagar isso.');
    if (!exists && !perm.includes('c')) throw httpErr(403, 'Você não pode criar "' + c + '".');
    if (exists && !perm.includes('u')) throw httpErr(403, 'Você não pode alterar "' + c + '".');
    const doc = clone(ch.doc);
    if (!isObj(doc)) throw httpErr(400, 'Registro inválido.');

    if (c === 'orders') {
      if (!exists) {
        noMarkup([doc.note, doc.addr, doc.bairro, doc.nf]); sizeOk(doc, 400000, 'Pedido');
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
      const k = S.orders.indexOf(prev); S.orders[k] = o;
      orderEffects(S, o, prev.status, effects);
      writes.push({ c, id, op: 'put', doc: o, ver: ch.ver });
      continue;
    }
    if (c === 'customers') { // cliente: só os dados da nota do próprio cadastro
      if (id !== me) throw httpErr(403, 'Cadastro de outra pessoa.');
      noMarkup(doc.fiscal);
      const prev = byId(c, id), x = clone(prev);
      for (const k of new Set([...Object.keys(prev), ...Object.keys(doc)])) {
        if (['hasPass', 'mustReset', 'login', 'pass'].includes(k) || !(k in doc) || eq(prev[k], doc[k])) continue;
        if (k !== 'fiscal') throw httpErr(403, 'Para mudar o cadastro, fale com a loja.');
        x.fiscal = cleanNf(doc.fiscal);
      }
      writes.push({ c, id, op: 'put', doc: x, ver: ch.ver }); continue;
    }
    if (c === 'counts') { // conferente: contagem de estoque aberta
      noMarkup(doc); sizeOk(doc, 500000, 'Contagem');
      const prev = byId(c, id);
      if (prev && prev.status !== 'aberta') throw httpErr(403, 'Contagem já encerrada.');
      if (!prev && (S.counts || []).some(x => x.status === 'aberta')) throw httpErr(409, 'Já existe uma contagem aberta. Atualizando a tela.');
      if (!['aberta', 'finalizada'].includes(doc.status)) throw httpErr(400, 'Situação da contagem inválida.');
      if (doc.items != null && !Array.isArray(doc.items)) throw httpErr(400, 'Contagem inválida.');
      doc.id = id; doc.by = prev ? prev.by : user.name;
      writes.push({ c, id, op: 'put', doc, ver: ch.ver }); continue;
    }
    if (c === 'receipts') { // entrada de mercadoria (conferente) e precificação da nota (faturamento)
      const prev = exists ? byId(c, id) : null;
      const r = checkReceipt(S, user, prev, Object.assign({}, doc, { id }));
      receiptEffects(S, r, prev, effects);
      if (prev) S.receipts[S.receipts.indexOf(prev)] = r; else (S.receipts = S.receipts || []).push(r);
      writes.push({ c, id, op: 'put', doc: r, ver: exists ? ch.ver : undefined }); continue;
    }
    if (c === 'romaneios') { // entregador: romaneio montado aqui, só com os pedidos dele que saíram agora
      if (exists) throw httpErr(403, 'Romaneio já registrado.');
      const ids = Array.isArray(doc.orders) ? doc.orders.map(String) : [];
      if (!ids.length || ids.length > 60) throw httpErr(400, 'Romaneio sem pedidos.');
      const os = ids.map(oid => byId('orders', oid));
      if (os.some(o => !o || !o.deliv || o.deliv.drv !== me || !['saiu', 'pronto'].includes(o.status))) throw httpErr(403, 'Romaneio com pedido que não é seu.');
      const r = { id, at: nowIso(), drv: me, orders: os.map(o => o.id), nos: os.map(o => o.no), total: r2(os.reduce((s, o) => s + Number(o.total || 0), 0)) };
      writes.push({ c, id, op: 'put', doc: r }); continue;
    }
    throw httpErr(403, 'Alteração não permitida.');
  }
  return { writes, drops, effects };
}
const COLLS_SET = new Set(require('./store').COLLS);
function newEffects() { return { stock: new Map(), stockIn: new Map(), prodPatch: new Map(), prodNew: [], recNew: [], recDel: [], negLog: [] }; }

/* ---------------------------------------------------------------- fornecedores e entrada de notas */
function cleanSupplier(S, d) {
  noMarkup(d);
  const name = str(d.name, 160).trim();
  if (!name) throw httpErr(400, 'Informe o nome do fornecedor.');
  const code = str(d.code, 30).trim();
  if (code && (S.suppliers || []).some(x => x.id !== d.id && String(x.code || '').trim().toLowerCase() === code.toLowerCase())) throw httpErr(400, 'Já existe fornecedor com o código ' + code + '.');
  return { id: d.id, code, name, doc: str(d.doc, 30).replace(/[^\d./-]/g, ''), phone: str(d.phone, 40), contact: str(d.contact, 80), note: str(d.note, 500), active: d.active !== false };
}
const RSTATUS = ['aberta', 'conferida', 'aprovada', 'cancelada'];
const money2 = v => Math.round(Number(v) * 100) / 100;
/* nota de entrada: o conferente lança e confere; faturamento ou loja precificam e aprovam */
function checkReceipt(S, user, prev, d) {
  const role = user.role;
  if (!isObj(d)) throw httpErr(400, 'Registro inválido.');
  noMarkup(d); sizeOk(d, 400000, 'Nota');
  const p0 = prev || {};
  const s0 = p0.status || null, s1 = RSTATUS.includes(d.status) ? d.status : (s0 || 'aberta');
  const isAdm = role === 'admin';
  if (role === 'conferente') {
    if (prev && s0 !== 'aberta') throw httpErr(403, 'Esta nota já foi conferida: fale com a loja para corrigir.');
    if (!['aberta', 'conferida', 'cancelada'].includes(s1)) throw httpErr(403, 'Mudança não permitida.');
  } else if (role === 'faturamento') {
    if (!prev) throw httpErr(403, 'Quem lança a nota é o conferente.');
    if (s0 !== 'conferida' || !['conferida', 'aprovada'].includes(s1)) throw httpErr(403, s0 === 'aprovada' ? 'Esta nota já foi aprovada.' : 'Esta nota ainda não foi conferida.');
  } else if (!isAdm) throw httpErr(403, 'Você não pode mexer em entrada de notas.');
  if (isAdm && s0 === 'aprovada' && s1 !== 'cancelada' && !eq(withoutMeta(prev), withoutMeta(d))) throw httpErr(403, 'Nota já aprovada: os preços já foram para os produtos.');
  const r = { id: d.id, status: s1 };
  // cabeçalho: na conferência vale o que o conferente digitou; depois, só a loja muda
  const head = !prev || s0 === 'aberta' || isAdm ? d : p0;
  r.nf = str(head.nf, 20).replace(/\s/g, '');
  if (!/^[0-9A-Za-z./-]{1,20}$/.test(r.nf)) throw httpErr(400, 'Informe o número da nota.');
  const sup = (S.suppliers || []).find(x => x.id === head.supplierId);
  if (!sup) throw httpErr(400, 'Escolha o fornecedor.');
  r.supplierId = sup.id; r.supplierCode = sup.code || ''; r.supplierName = sup.name;
  r.emissao = isoOk(head.emissao) ? String(head.emissao).slice(0, 10) : '';
  r.obs = str(head.obs, 500);
  if ((S.receipts || []).some(x => x.id !== r.id && x.status !== 'cancelada' && x.supplierId === r.supplierId && String(x.nf) === r.nf)) throw httpErr(400, 'A nota ' + r.nf + ' desse fornecedor já foi lançada.');
  r.by = p0.by || user.name; r.at = p0.at || nowIso();
  r.conferidaAt = p0.conferidaAt || ''; r.conferidaBy = p0.conferidaBy || '';
  r.aprovadaAt = p0.aprovadaAt || ''; r.aprovadaBy = p0.aprovadaBy || '';
  r.stockApplied = clone(p0.stockApplied || {});
  // itens
  const pricing = s0 === 'conferida' || (isAdm && s0 !== 'aberta' && prev);
  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length > 400) throw httpErr(400, 'Itens demais na nota.');
  const P = p0.items || [];
  if (pricing && !isAdm && (items.length !== P.length || items.some((x, k) => !x || x.k !== P[k].k))) throw httpErr(403, 'Na precificação não dá para incluir ou tirar itens.');
  r.items = items.map((x, k) => {
    if (!isObj(x)) throw httpErr(400, 'Item inválido.');
    const old = P.find(y => y.k === x.k) || {};
    const it = { k: ID_RE.test(String(x.k || '')) ? x.k : 'i' + k };
    const prod = (S.products || []).find(p => p.id === x.pid);
    if (x.pid && !prod) throw httpErr(400, 'Produto não encontrado na linha ' + (k + 1) + '.');
    it.pid = prod ? prod.id : '';
    it.name = prod ? prod.name : str(x.name, 160).trim();
    if (!it.name) throw httpErr(400, 'Informe o produto da linha ' + (k + 1) + '.');
    it.ean = str(x.ean || (prod && prod.ean) || '', 20).replace(/\D/g, '');
    it.code = str(x.code || (prod && prod.code) || '', 30);
    it.unit = prod ? prod.unit || '' : str(x.unit, 40);
    const q = Number(x.q), cost = Number(x.valor);
    if (!(Number.isFinite(q) && q > 0 && q <= MAX_Q)) throw httpErr(400, 'Quantidade inválida em ' + it.name + '.');
    if (!(Number.isFinite(cost) && cost >= 0 && cost <= MAX_PRICE)) throw httpErr(400, 'Valor inválido em ' + it.name + '.');
    it.q = Math.round(q * 1000) / 1000; it.valor = money2(cost);
    const pk = Number(x.perPack);
    it.perPack = Number.isFinite(pk) && pk >= 1 && pk <= 10000 ? Math.round(pk * 1000) / 1000 : (prod && Number(prod.perPack) > 1 ? Number(prod.perPack) : 1);
    // dados de preço: só na precificação (faturamento/loja)
    if (pricing || isAdm) {
      it.trib = !!x.trib; it.ieOn = !!x.ieOn;
      const pr = Number(x.price), ip = Number(x.iePrice);
      it.price = Number.isFinite(pr) && pr > 0 && pr <= MAX_PRICE ? money2(pr) : '';
      it.iePrice = it.ieOn && Number.isFinite(ip) && ip > 0 && ip <= MAX_PRICE ? money2(ip) : '';
      if (!prod && x.newProd) it.newProd = true;
    } else ['trib', 'ieOn', 'price', 'iePrice'].forEach(f => { if (old[f] !== undefined) it[f] = old[f]; });
    return it;
  });
  if (s1 !== 'aberta' && s1 !== 'cancelada' && !r.items.length) throw httpErr(400, 'A nota não tem itens.');
  r.totalNota = money2(r.items.reduce((a, i) => a + i.q * i.valor, 0));
  if (s1 === 'conferida' && s0 !== 'conferida') { r.conferidaAt = nowIso(); r.conferidaBy = user.name; }
  if (s1 === 'aprovada' && s0 !== 'aprovada') {
    if (s0 !== 'conferida') throw httpErr(400, 'A nota precisa ser conferida antes de aprovar.');
    r.items.forEach(i => {
      if (!i.pid && !i.newProd) throw httpErr(400, i.name + ': ligue a um produto do cadastro ou marque "criar produto".');
      if (!(i.price > 0)) throw httpErr(400, i.name + ': informe o preço de venda.');
      if (i.ieOn && !(i.iePrice > 0 && i.iePrice < i.price)) throw httpErr(400, i.name + ': o preço com IE precisa ser menor que o preço normal.');
    });
    r.aprovadaAt = nowIso(); r.aprovadaBy = user.name;
  }
  return r;
}
const withoutMeta = r => { const x = clone(r || {}); ['stockApplied'].forEach(k => delete x[k]); return x; };
/* efeitos da nota: estoque entra ao conferir (relativo), preços e custo vão para o produto ao aprovar */
function receiptEffects(S, r, prev, effects) {
  const want = {};
  if (['conferida', 'aprovada'].includes(r.status)) r.items.forEach(i => { if (i.pid) want[i.pid] = (want[i.pid] || 0) + i.q; });
  const had = r.stockApplied || {};
  new Set([...Object.keys(want), ...Object.keys(had)]).forEach(pid => {
    const d = Math.round(((want[pid] || 0) - (had[pid] || 0)) * 1000) / 1000;
    if (!d) return;
    effects.stockIn.set(pid, (effects.stockIn.get(pid) || 0) + d);
    const p = (S.products || []).find(x => x.id === pid); if (p) p.stock = (Number(p.stock) || 0) + d;
  });
  r.stockApplied = want;
  if (r.status === 'aprovada' && (!prev || prev.status !== 'aprovada')) {
    r.items.forEach(i => {
      const patch = { cost: i.valor, perPack: i.perPack > 1 ? i.perPack : '', trib: !!i.trib, price: i.price, iePrice: i.ieOn ? i.iePrice : '', lastIn: { nf: r.nf, supplier: r.supplierName, at: r.aprovadaAt } };
      if (i.pid) { effects.prodPatch.set(i.pid, Object.assign(effects.prodPatch.get(i.pid) || {}, patch)); return; }
      const id = 'p' + require('crypto').randomBytes(5).toString('hex');
      const np = Object.assign({ id, name: i.name, code: i.code || '', ean: i.ean || '', cat: 'Outros', sub: '', unit: i.unit || (i.perPack > 1 ? 'Fardo c/ ' + i.perPack : 'Unidade'), active: true, stock: i.q, rules: {}, created: nowIso() }, patch);
      effects.prodNew.push(np); (S.products = S.products || []).push(np);
      i.pid = id; delete i.newProd; want[id] = i.q;
    });
    r.stockApplied = want;
  }
}
/* efeitos de um pedido: estoque e contas a receber (inclusive "não pagou" e "produto a mais"), sempre no servidor */
function orderEffects(S, o, prevStatus, effects) {
  const { C } = coreFor(S, 'x');
  const before = new Map((S.products || []).map(p => [p.id, p.stock]));
  const recBefore = new Map((S.receivables || []).map(r => [r.id, r]));
  if (o.status !== prevStatus) { C.syncStock(o); C.autoReceivables(o, prevStatus); }
  else if (o.status === 'concluido') C.syncStock(o);   // pedido concluído que a loja corrigiu
  // conta "não pagou na entrega" e "produto a mais", uma só por pedido (id fixo)
  if (o.status === 'concluido' && prevStatus !== 'concluido' && o.delivered && !o.delivered.pickup) {
    const D = o.delivered, cash = C.isCash(o.pay);
    const add = (rid, desc, amount) => {
      if (!(amount > 0.004) || (S.receivables || []).some(r => r.id === rid)) return;
      S.receivables.push({ id: rid, group: rid, orderId: o.id, customerId: o.customerId, customer: o.customer, orderNo: String(o.no), desc, parcel: '1/1', amount: r2(amount), due: C.today(), paidAt: '', created: nowIso() });
    };
    if (cash && D.how === 'nao') add('np-' + o.id, 'Não pagou na entrega (' + o.pay + ')', Number(D.collect));
    if (o.occ && o.occ.cash && o.occ.extra > 0) add('px-' + o.id, 'Produto a mais na entrega', Number(o.occ.extra));
  }
  (S.products || []).forEach(p => {
    const b = before.get(p.id);
    if (b !== p.stock) { const d = (Number(p.stock) || 0) - (Number(b) || 0); effects.stock.set(p.id, (effects.stock.get(p.id) || 0) + d); }
  });
  const now = new Set((S.receivables || []).map(r => r.id));
  (S.receivables || []).forEach(r => { if (!recBefore.has(r.id)) effects.recNew.push(r); });
  recBefore.forEach((r, id) => { if (!now.has(id)) effects.recDel.push(id); });
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
    sellerId: me.id, sellerRate: Number(me.commission) || 0, mode: d.mode === 'entrega' ? 'entrega' : 'retirada', pay: String(d.pay || ''), nf: cleanNf(d.nf),
    addr: d.mode === 'entrega' ? String(d.addr || '').slice(0, 300) : '', bairro: d.mode === 'entrega' ? String(d.bairro || '').slice(0, 120) : '',
    city: cust.city || '', cityName: (C.cityById(cust.city) || {}).name || '', table: C.tableOf(cust), note: String(d.note || '').slice(0, 1000), status: 'novo', bySeller: me.name,
    discPct: d.mode === 'retirada' && !C.onerOn() ? Number(S.store.pickupDisc) || 0 : 0,
  };
  if (!C.allowedPays(cust).includes(o.pay)) throw httpErr(400, 'Forma de pagamento não liberada para este cliente.');
  if (o.mode === 'entrega' && !o.addr.trim()) throw httpErr(400, 'Informe o endereço de entrega.');
  if (!Array.isArray(d.items) || d.items.length > 300) throw httpErr(400, 'Pedido inválido.');
  const seen = new Set();
  o.items = d.items.map(ni => {
    if (!isObj(ni) || ni.occLine || ni.extra) throw httpErr(400, 'Item inválido.');
    const p = productOf(S, C, ni);
    if (!p || p.active === false) throw httpErr(400, 'Produto não encontrado.');
    if (seen.has(itemKey(ni))) throw httpErr(400, 'Produto repetido no pedido.'); seen.add(itemKey(ni));
    const q = Number(ni.q); if (!qtyOk(q, C.isKg(p))) throw httpErr(400, 'Quantidade inválida em ' + p.name + '.');
    const ref = refPrice(C, S, o, p, q); const price = r2(ni.price);
    if (!priceOk(Number(ni.price))) throw httpErr(400, 'Preço inválido em ' + p.name + '.');
    if (price > ref.price * 5 + 0.01) throw httpErr(400, 'Preço de ' + p.name + ' muito acima da tabela. Confira o valor.');
    return fillItem(C, p, { base: p.isCombo ? p.listPrice : C.baseOf(p), price, label: near(price, ref.price) ? ref.label : 'Preço negociado', q }, { ie: near(price, ref.price) ? ref.ie : !!ni.ie, rp: ref.rp });
  });
  if (!o.items.length) throw httpErr(400, 'Pedido sem produtos.');
  Object.assign(o, C.orderTotals(o));
  if (!(o.total > 0) || o.total + 0.004 < Number(S.store.min || 0)) throw httpErr(400, 'O pedido mínimo é de ' + C.brl(Number(S.store.min || 0)) + '.');
  if (o.nf && o.items.some(i => i.ie) && (!o.nf.ie || o.nf.ie === 'ISENTO')) throw httpErr(400, 'Para o preço com IE, preencha a inscrição estadual nos dados da nota.');
  const K = sellerLock(S, me.id, o);
  if (K && !K.ok) { o.appr = 'pendente'; o.apprMin = K.min; o.apprMg = Math.round(K.mg * 10) / 10; o.apprNeed = K.need; }
  else if (d.appr === 'pendente') { o.appr = 'pendente'; }
  if (K && K.ok && K.tol) o.tolUsed = { mg: Math.round(K.mg * 10) / 10, min: Math.round(K.min * 10) / 10, at: new Date().toISOString() };
  C.addEvent(o, 'Seu pedido nº {NO} foi lançado pelo vendedor ' + me.name + ': ' + o.items.reduce((s, i) => s + i.q, 0) + ' itens, total ' + C.brl(o.total) + '.');
  return o;
}

module.exports = { project, applySync, newEffects, lockCheck, negCheck, canSeeOrder, stripOrder, stripProduct, coreFor, projectDoc, checkOrderUpdate, mergeConcurrent };

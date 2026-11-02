'use strict';
/* Estoque e relatórios: limite de estoque no pedido, reservado na sugestão de compra, perda por avaria,
   frete devido x a vencer, ranking com o balcão. Rodar: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const policy = require('../../lib/policy');

const iso = '2026-10-28T12:00:00.000Z';
const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';
const clone = x => JSON.parse(JSON.stringify(x));
function base(rule, trava) {
  const S = {
    store: { name: 'LOJA', min: 0, autoRec: true, billGate: 'nf', semEstoque: rule || 'esgotado' }, payments: ['Pix', 'Boleto 28 dias'], cashPays: ['Pix'], payDays: { 'Boleto 28 dias': '28' },
    products: [
      { id: 'p1', name: 'Cerveja Lata', unit: 'Fardo 12 un', perPack: 12, price: 60, cost: 40, active: true, stock: 10, minStock: 5, idealStock: 40 },
      { id: 'p2', name: 'Refrigerante', unit: 'Fardo 6 un', perPack: 6, price: 30, cost: 20, active: true, stock: 50 },
      { id: 'k1', name: 'Queijo', unit: 'kg', kg: true, price: 40, cost: 25, active: true, stock: 2.5 },
      { id: 'p3', name: 'Sem controle', unit: 'UN', price: 5, active: true, stock: '' },
    ],
    combos: [{ id: 'cb1', name: 'Kit', price: 100, active: true, items: [{ pid: 'p1', q: 2 }] }],
    customers: [{ id: 'c1', name: 'Mercado', sellerId: 's1', pays: ['Pix', 'Boleto 28 dias'] }],
    sellers: [{ id: 's1', name: 'Vendedor', commission: 2, active: true, allCli: true }],
    vehicles: [{ id: 'v1', driver: 'Motorista' }],
    orders: [], receivables: [], categories: [], cities: [], counts: [], romaneios: [], admins: [], payables: [], commPayouts: [], trips: [],
  };
  // opção da empresa na Central (o servidor põe em S.__mods): "Não permitir venda sem estoque"
  Object.defineProperty(S, '__mods', { value: { trava_estoque: trava !== false }, enumerable: false, configurable: true });
  return S;
}
const U = { cliente: { role: 'cliente', ref_id: 'c1', name: 'Mercado' }, vendedor: { role: 'vendedor', ref_id: 's1', name: 'Vendedor' },
  entregador: { role: 'entregador', ref_id: 'v1', name: 'Motorista' }, admin: { role: 'admin', ref_id: 'a1', name: 'Admin' } };
const V0 = () => ({ orders: {}, meta: {} });
const novo = (S, user, doc, id) => policy.applySync(S, V0(), user, [{ c: 'orders', id: id || 'n1', op: 'put', doc }]);

test('"Não permitir venda sem estoque": cliente e vendedor não pedem mais do que tem; mensagem clara', () => {
  const S = base();
  assert.throws(() => novo(S, U.cliente, { items: [{ pid: 'p1', q: 11 }], mode: 'retirada', pay: 'Pix' }), /Só temos 10 un\. de Cerveja Lata/);
  assert.throws(() => novo(S, U.cliente, { items: [{ pid: 'k1', q: 3, kg: true }], mode: 'retirada', pay: 'Pix' }), /Só temos 2,5 kg de Queijo/);
  // avulso + combo somam (2 + 2×5 = 12 > 10)
  assert.throws(() => novo(S, U.cliente, { items: [{ pid: 'p1', q: 2 }, { combo: true, comboId: 'c:cb1', q: 5 }], mode: 'retirada', pay: 'Pix' }), /Só temos 10 un\./);
  assert.equal(novo(S, U.cliente, { items: [{ pid: 'p1', q: 10 }, { pid: 'p3', q: 999 }], mode: 'retirada', pay: 'Pix' }).writes.length, 1); // exato passa; sem controle passa
  assert.throws(() => novo(base(), U.vendedor, { customerId: 'c1', items: [{ pid: 'p1', q: 11, price: 60 }], mode: 'retirada', pay: 'Pix' }), /Só temos 10 un\./);
  // empresa que PERMITE venda sem estoque (padrão): aceita, mesmo com a vitrine marcando esgotado
  assert.equal(novo(base('manter', false), U.cliente, { items: [{ pid: 'p1', q: 50 }], mode: 'retirada', pay: 'Pix' }).writes.length, 1);
  assert.equal(novo(base('esgotado', false), U.cliente, { items: [{ pid: 'p1', q: 50 }], mode: 'retirada', pay: 'Pix' }).writes.length, 1);
  const semMods = Object.assign({}, base()); Object.defineProperty(semMods, '__mods', { value: {} });   // empresa antiga sem o campo
  assert.equal(novo(semMods, U.cliente, { items: [{ pid: 'p1', q: 50 }], mode: 'retirada', pay: 'Pix' }).writes.length, 1);
  // administrador continua podendo
  const A = base(); const r = policy.applySync(A, V0(), U.admin, [{ c: 'orders', id: 'a1', op: 'put', doc: { id: 'a1', customerId: 'c1', status: 'novo', items: [{ pid: 'p1', q: 50, price: 60 }], total: 3000 } }]);
  assert.equal(r.writes.length, 1);
});

test('estoque controlado: vendedor alterando pedido só é barrado no produto que aumentou', () => {
  const S = base();
  const o = { id: 'o1', no: 1001, date: iso, customerId: 'c1', customer: 'Mercado', sellerId: 's1', sellerRate: 2, mode: 'retirada', pay: 'Pix', status: 'novo',
    items: [{ pid: 'p1', name: 'Cerveja Lata', q: 8, price: 60, perPack: 12 }, { pid: 'p2', name: 'Refrigerante', q: 1, price: 30, perPack: 6 }], sub: 510, disc: 0, total: 510, events: [] };
  S.orders.push(o);
  S.products[0].stock = 5;                                    // estoque caiu depois do pedido
  const n = clone(o); n.items[1].q = 2;                        // mexe só no refrigerante
  assert.equal(policy.checkOrderUpdate(S, U.vendedor, o, n).items[1].q, 2);
  const n2 = clone(o); n2.items[0].q = 9;
  assert.throws(() => policy.checkOrderUpdate(S, U.vendedor, o, n2), /Só temos 5 un\. de Cerveja Lata/);
});

test('sugestão de compra: reservado dos pedidos em aberto (combos desmontados) e sugestão sobre o disponível', () => {
  const S = base(); const { C } = policy.coreFor(S, 'x');
  S.products[0].stock = 50; S.products[0].minStock = 20; S.products[0].idealStock = 100;
  S.orders.push({ id: 'a', status: 'novo', items: [{ pid: 'p1', name: 'Cerveja Lata', q: 20 }] });
  S.orders.push({ id: 'b', status: 'saiu', items: [{ combo: true, comboId: 'cb1', name: 'Kit', q: 5, components: [{ pid: 'p1', q: 2 }] }] });
  S.orders.push({ id: 'c', status: 'concluido', items: [{ pid: 'p1', q: 99 }] });          // já baixou
  S.orders.push({ id: 'd', status: 'cancelado', items: [{ pid: 'p1', q: 99 }] });
  S.orders.push({ id: 'e', status: 'separado', pdvVenda: 'v1', items: [{ pid: 'p1', q: 99 }] }); // balcão: já baixou
  assert.deepEqual(C.reservedMap(), { p1: 30 });
  const R = C.buildPurchase({ cat: 'todas' });
  const r = R.rows.find(x => x.p.id === 'p1');
  assert.ok(r, 'estoque 50 > mínimo 20, mas disponível 20 entra');
  assert.equal(r.res, 30); assert.equal(r.disp, 20); assert.equal(r.sug, 80); assert.equal(r.total, 3200);
});

test('avaria na entrega: as embalagens avariadas saem do estoque como perda; recusa volta como hoje', () => {
  const S = base('manter'); S.products[0].stock = 100;
  const o = { id: 'o1', no: 1001, date: iso, customerId: 'c1', customer: 'Mercado', mode: 'entrega', pay: 'Pix', status: 'saiu', deliv: { drv: 'v1' },
    items: [{ pid: 'p1', name: 'Cerveja Lata', q: 10, price: 60, perPack: 12 }], sub: 600, disc: 0, total: 600, events: [] };
  S.orders.push(o);
  const n = clone(o); Object.assign(n, { status: 'concluido', delivered: { name: 'Fulano', photo: PHOTO, how: 'pix' } });
  n.items[0].q = 7; n.items[0].qOcc = 3;
  n.occ = { items: [{ t: 'avaria', name: 'Cerveja Lata', q: 2, u: 'pk' }, { t: 'recusa', name: 'Cerveja Lata', q: 1, u: 'pk' }] };
  const r = policy.applySync(S, { orders: { o1: 1 }, meta: {} }, U.entregador, [{ c: 'orders', id: 'o1', op: 'put', doc: n, ver: 1 }]);
  const out = r.writes[0].doc;
  assert.deepEqual(out.loss, { p1: 2 });
  assert.equal(r.effects.stock.get('p1'), -9);               // 7 entregues + 2 avariados (o recusado volta)
  const { C } = policy.coreFor(S, 'x'); out.doneAt = new Date().toISOString();
  assert.equal(C.lossOf('p1', 90), 2);
  // pedido reaberto pela loja: tudo volta (coerente com a situação)
  const back = clone(out); back.status = 'saiu';
  const r2 = policy.applySync(S, { orders: { o1: 2 }, meta: {} }, U.admin, [{ c: 'orders', id: 'o1', op: 'put', doc: back, ver: 2 }]);
  assert.equal(r2.effects.stock.get('p1'), 9);
});

test('avaria: não passa do que saiu do pedido; pedido antigo concluído não muda', () => {
  const S = base('manter');
  const o = { id: 'o1', status: 'saiu', items: [{ pid: 'p1', name: 'Cerveja Lata', q: 9, qOcc: 1, perPack: 12, price: 60 }], occ: { items: [{ t: 'avaria', name: 'Cerveja Lata', q: 5, u: 'pk' }] }, total: 540 };
  S.orders.push(o);
  const d = clone(o); d.status = 'concluido';
  const r = policy.applySync(S, { orders: { o1: 1 }, meta: {} }, U.admin, [{ c: 'orders', id: 'o1', op: 'put', doc: d, ver: 1 }]);
  assert.deepEqual(r.writes[0].doc.loss, { p1: 1 });
  const S2 = base('manter'); const old = { id: 'o2', status: 'concluido', stockApplied: { p1: 9 }, items: [{ pid: 'p1', name: 'Cerveja Lata', q: 9, qOcc: 1, price: 60 }], occ: { items: [{ t: 'avaria', name: 'Cerveja Lata', q: 1, u: 'pk' }] } };
  S2.orders.push(old); const d2 = clone(old); d2.note = 'x';
  const r3 = policy.applySync(S2, { orders: { o2: 1 }, meta: {} }, U.admin, [{ c: 'orders', id: 'o2', op: 'put', doc: d2, ver: 1 }]);
  assert.equal(r3.writes[0].doc.loss, undefined); assert.equal(r3.effects.stock.size, 0);
});

/* frete.js roda no navegador: carrega num ambiente isolado com o mínimo que ele usa */
function frete(S) {
  const ctx = { S, ui: {}, document: { addEventListener() {} }, modOn: () => true, pnum: Number, esc: String, brl: String, toast() {}, uid: () => 'x', today: () => '2026-11-02' };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/frete.js'), 'utf8') + '\n;this.f3Summary=f3Summary;', ctx);
  return ctx;
}
test('frete de terceiro: devido (já saiu) x a vencer; saldo = devido − pago', () => {
  const S = { carriers: [{ id: 't1', name: 'Log', pct: 5 }], carrierPays: [{ id: 'p', carrierId: 't1', amount: 30, date: '2026-11-01' }], orders: [
    { id: 'a', status: 'concluido', total: 1000, frete3: { carrierId: 't1', pct: 5 } },
    { id: 'b', status: 'saiu', total: 200, frete3: { carrierId: 't1', pct: 5 } },
    { id: 'c', status: 'novo', total: 400, frete3: { carrierId: 't1', pct: 5 } },
    { id: 'd', status: 'separado', total: 100, frete3: { carrierId: 't1', pct: 5 } },
    { id: 'e', status: 'cancelado', total: 9999, frete3: { carrierId: 't1', pct: 5 } }] };
  const Sm = frete(S).f3Summary('t1');
  assert.equal(Sm.devido, 60); assert.equal(Sm.aVencer, 25); assert.equal(Sm.gerado, 85);
  assert.equal(Sm.pago, 30); assert.equal(Sm.saldo, 30);
});

test('ranking: vendas do balcão somam no mesmo produto; venda enviada para a nota não conta em dobro', () => {
  const S = base('manter'); const { C } = policy.coreFor(S, 'x');
  S.orders.push({ id: 'o1', status: 'concluido', mode: 'entrega', date: '2026-11-01T15:00:00.000Z', items: [{ pid: 'p1', name: 'Cerveja Lata', code: '', q: 2, price: 60, cost: 40 }] });
  S.orders.push({ id: 'o2', status: 'concluido', mode: 'retirada', pdvVenda: 'v9', date: '2026-11-01T15:00:00.000Z', items: [{ pid: 'p1', name: 'Cerveja Lata', q: 5, price: 60, cost: 40 }] });
  const pdv = [{ pid: 'p1', nome: 'Cerveja Lata', q: 3, t: 170, c: 120, tnc: 0, n: 2 }]; pdv.nVendas = 2;
  const f = { from: '2026-11-01', to: '2026-11-30', mode: 'todos', cat: 'todas', sort: 'q' };
  const sem = C.buildRanking(f, pdv), com = C.buildRanking(Object.assign({}, f, { pdv: true }), pdv);
  assert.equal(sem.rows[0].q, 2); assert.equal(sem.nPdv, 0);
  assert.equal(com.rows.length, 1); assert.equal(com.rows[0].q, 5); assert.equal(com.rows[0].rev, 290); assert.equal(com.nPdv, 2);
  assert.equal(Math.round(com.rows[0].profit * 100) / 100, 290 - 80 - 120);
  assert.equal(C.buildRanking(Object.assign({}, f, { pdv: true, mode: 'entrega' }), pdv).rows[0].q, 2); // balcão é retirada
});

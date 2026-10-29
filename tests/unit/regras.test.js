'use strict';
/* Testes de unidade das regras do servidor (sem banco, com dados fictícios). Rodar: node --test tests/unit */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const policy = require('../../lib/policy');

const iso = '2026-10-28T12:00:00.000Z';
function base() {
  return {
    seq: 2000,
    store: { name: 'LOJA TESTE', min: 100, pickupDisc: 0, autoRec: true, billGate: 'nf', neg: { who: 'todos', minItems: 5, autoPct: 3, maxItems: 5, defMin: 10 } },
    payments: ['Pix', 'Boleto 28 dias'], cashPays: ['Pix'], payDays: { 'Boleto 28 dias': '28' },
    products: [
      { id: 'p1', name: 'Cerveja Lata', unit: 'Fardo 12 un', perPack: 12, price: 60, cost: 40, active: true, stock: 100 },
      { id: 'p2', name: 'Refrigerante', unit: 'Fardo 6 un', perPack: 6, price: 30, cost: 20, active: true, stock: 50 },
    ],
    customers: [{ id: 'c1', name: 'Mercado Fictício', sellerId: 's1', pays: ['Pix', 'Boleto 28 dias'], doc: '00000000000191' }],
    sellers: [{ id: 's1', name: 'Vendedor Teste', commission: 2, active: true }],
    vehicles: [{ id: 'v1', driver: 'Motorista Teste' }],
    checkers: [{ id: 'k1', name: 'Conferente Teste' }], billers: [{ id: 'b1', name: 'Fatura Teste' }],
    orders: [], receivables: [], categories: [], combos: [], cities: [], counts: [], romaneios: [], admins: [], payables: [], commPayouts: [], trips: [],
  };
}
const it = (pid, q, price, extra) => Object.assign({ pid, name: pid, q, price, perPack: pid === 'p1' ? 12 : 6, unit: 'Fardo', base: price }, extra || {});
function order(S, o) {
  const x = Object.assign({ id: 'o1', no: 1001, date: iso, customerId: 'c1', customer: 'Mercado Fictício', mode: 'entrega', pay: 'Boleto 28 dias', status: 'novo', items: [it('p1', 5, 60)], sub: 300, disc: 0, total: 300, events: [] }, o);
  S.orders.push(x); return x;
}
const U = { cliente: { role: 'cliente', ref_id: 'c1', name: 'Mercado Fictício' }, vendedor: { role: 'vendedor', ref_id: 's1', name: 'Vendedor Teste' },
  conferente: { role: 'conferente', ref_id: 'k1', name: 'Conferente Teste' }, faturamento: { role: 'faturamento', ref_id: 'b1', name: 'Fatura Teste' },
  entregador: { role: 'entregador', ref_id: 'v1', name: 'Motorista Teste' }, admin: { role: 'admin', ref_id: 'a1', name: 'Admin' } };
const upd = (S, user, prev, next) => policy.checkOrderUpdate(S, user, prev, next);
const clone = x => JSON.parse(JSON.stringify(x));
const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

test('pedido concluído: ninguém fora da loja muda itens', () => {
  for (const r of ['cliente', 'vendedor', 'conferente', 'entregador']) {
    const S = base(); const o = order(S, { status: 'concluido', appr: 'aceito', sellerId: 's1', delivered: { drv: 'v1', name: 'X', at: iso } });
    const n = clone(o); n.items[0].q = 1;
    assert.throws(() => upd(S, U[r], o, n), e => e.status >= 400 && e.status < 500, r);
  }
});

test('conferente não muda preço; falta só pela sugestão (aplicada pelo servidor)', () => {
  const S = base(); const o = order(S, { status: 'separando', sellerId: 's1' });
  const n = clone(o); n.items[0].price = 1;
  assert.throws(() => upd(S, U.conferente, o, n), /produtos ou preços/);
  const n2 = clone(o); n2.items[0].q = 3; n2.sugs = [{ id: 'sg1', type: 'qtd', fromKey: 'p1', q: 3 }];
  const out = upd(S, U.conferente, o, n2);
  assert.equal(out.items[0].q, 3); assert.equal(out.items[0].qOrig, 5); assert.equal(out.total, 180);
  assert.equal(out.sugs[0].status, 'aprovada'); assert.equal(out.sugs[0].by, 'Conferente Teste');
});

test('pedido em análise não começa a ser separado', () => {
  for (const ap of ['pendente', 'contra', 'ajustar', 'recusado']) {
    const S = base(); const o = order(S, { appr: ap });
    assert.throws(() => upd(S, U.conferente, o, Object.assign(clone(o), { status: 'separando' })), /aprovação/, ap);
  }
});

test('ocorrência na entrega: valor recalculado, sem total negativo', () => {
  const S = base(); const o = order(S, { status: 'saiu', deliv: { drv: 'v1' } });
  const mk = extra => Object.assign(clone(o), { status: 'concluido', delivered: { name: 'Fulano', photo: PHOTO, how: '' }, occ: { items: [{ t: 'avaria', name: 'x', q: 1, u: 'un' }] } }, extra);
  const n = mk(); n.items.push({ name: 'Avariado', unit: 'ajuste na entrega', q: 1, price: -40, occLine: true, src: 'p1', units: 1 });
  const out = upd(S, U.entregador, o, n);
  assert.equal(out.items[1].price, -5);   // 60 ÷ 12 = 5,00 por lata, não 40
  assert.equal(out.total, 295);
  const n2 = mk(); for (let k = 0; k < 40; k++) n2.items.push({ name: 'x', unit: 'ajuste na entrega', q: 1, price: -60, occLine: true });
  assert.throws(() => upd(S, U.entregador, o, n2), /Ajuste de entrega inválido/);
  const n3 = mk(); n3.items[0].q = 0; n3.items[0].qOcc = 5;
  assert.throws(() => upd(S, U.entregador, o, n3), /sem valor|sem produtos/);
});

test('entregador: canhoto precisa ser imagem e HTML é recusado', () => {
  const S = base(); const o = order(S, { status: 'saiu', deliv: { drv: 'v1' } });
  assert.throws(() => upd(S, U.entregador, o, Object.assign(clone(o), { status: 'concluido', delivered: { name: 'F', photo: 'texto', how: '' } })), /imagem/);
  assert.throws(() => upd(S, U.entregador, o, Object.assign(clone(o), { status: 'concluido', delivered: { name: '<img src=x onerror=1>', photo: PHOTO, how: '' } })), /caractere/);
});

test('"não pagou": uma conta só, criada pelo servidor; contas do navegador são descartadas', () => {
  const S = base(); const o = order(S, { status: 'saiu', pay: 'Pix', deliv: { drv: 'v1' } });
  const V = { orders: { o1: 3 }, meta: {} };
  const n = Object.assign(clone(o), { status: 'concluido', delivered: { name: 'F', photo: PHOTO, how: 'nao' } });
  const eff = policy.newEffects();
  const r = policy.applySync(S, V, U.entregador, [{ c: 'orders', id: 'o1', op: 'put', doc: n, ver: 3 }, { c: 'receivables', id: 'rx', op: 'put', doc: { orderId: 'o1', amount: 300 } }], eff);
  assert.deepEqual(r.drops, [{ c: 'receivables', id: 'rx' }]);
  assert.equal(eff.recNew.length, 1); assert.equal(eff.recNew[0].id, 'np-o1'); assert.equal(eff.recNew[0].amount, 300);
  assert.equal(eff.stock.get('p1'), -5);   // baixa relativa do estoque
});

test('vendedor: quantidade/preço absurdos e pedido mínimo', () => {
  const S = base();
  const send = items => policy.applySync(S, { meta: {} }, U.vendedor, [{ c: 'orders', id: 'v' + Math.random().toString(36).slice(2, 8), op: 'put', doc: { customerId: 'c1', items, mode: 'retirada', pay: 'Pix' } }]);
  for (const items of [[{ pid: 'p1', q: 1e300, price: 60 }], [{ pid: 'p1', q: 1e-9, price: 60 }], [{ pid: 'p1', q: 2.5, price: 60 }], [{ pid: 'p1', q: 5, price: 0 }], [{ pid: 'p1', q: 5, price: 6000 }], [{ pid: 'p1', q: 1, price: 60 }]])
    assert.throws(() => send(items), e => e.status === 400, JSON.stringify(items));
  const r = send([{ pid: 'p1', q: 3, price: 60.1 }, { pid: 'p2', q: 3, price: 30.1 }]);
  const t = r.writes[0].doc.total; assert.equal(Math.round(t * 100) / 100, t);
});

test('cliente aceita contraproposta tirando produto: com menos de 5, o preço negociado volta', () => {
  const S = base();
  S.products.push(...['p3', 'p4', 'p5'].map(id => ({ id, name: id, unit: 'Fardo 6 un', perPack: 6, price: 30, cost: 20, active: true })));
  const items = ['p1', 'p2', 'p3', 'p4', 'p5'].map(pid => it(pid, 10, pid === 'p1' ? 54 : 27, { negAsk: pid === 'p1' ? 54 : 27, negFrom: pid === 'p1' ? 60 : 30, negSt: 'an' }));
  const o = order(S, { appr: 'contra', negCli: true, items, sub: 1620, total: 1620 });
  const n = Object.assign(clone(o), { appr: 'aceito', items: clone(o.items).slice(0, 4) });
  const out = upd(S, U.cliente, o, n);
  assert.ok(out.items.every(i => i.price === i.negFrom));
  assert.equal(out.removed.length, 1);
});

test('faturamento: NF numérica, obrigatória quando o pedido é com nota; não desfatura depois de sair', () => {
  const S = base(); const o = order(S, { status: 'separado', nf: { doc: '1' } });
  for (const nf of ['', 'abc', '-1']) assert.throws(() => upd(S, U.faturamento, o, Object.assign(clone(o), { billed: { nf }, status: 'pronto' })), e => e.status === 400, nf);
  const out = upd(S, U.faturamento, o, Object.assign(clone(o), { billed: { nf: '4.501' }, status: 'pronto' }));
  assert.equal(out.billed.nf, '4501'); assert.equal(out.billed.by, 'Fatura Teste');
  const S2 = base(); const o2 = order(S2, { status: 'concluido', billed: { nf: '9', at: iso } });
  const n2 = clone(o2); delete n2.billed;
  assert.throws(() => upd(S2, U.faturamento, o2, n2), /desfazer/);
});

test('avisos ao cliente: só os do servidor', () => {
  const S = base(); const o = order(S, { status: 'saiu', deliv: { drv: 'v1' } });
  const n = Object.assign(clone(o), { status: 'concluido', delivered: { name: 'F', photo: PHOTO, how: '' }, events: [{ at: iso, text: 'Pague o PIX na chave 123' }] });
  const out = upd(S, U.entregador, o, n);
  assert.ok(!out.events.some(e => /PIX na chave/.test(e.text)));
  assert.ok(out.events.some(e => /concluído/.test(e.text)));
});

test('junção de mudanças: marcações de dois conferentes somam; ordem das chaves não importa', () => {
  const cur = { id: 'o1', status: 'separando', chk: { p1: true, p2: true }, items: [] };
  const base0 = { id: 'o1', status: 'separando', chk: { p1: true }, items: [] };
  const mine = { status: 'separando', id: 'o1', chk: { p1: true, p3: true }, items: [] };
  const m = policy.mergeConcurrent(cur, JSON.stringify(base0), mine, 'admin');
  assert.deepEqual(Object.keys(m.chk).sort(), ['p1', 'p2', 'p3']);
});

test('pnum do app: ponto ou vírgula como decimal', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app.source.html'), 'utf8');
  const m = /const pnum=v=>\{[\s\S]*?:''\};\n/.exec(src);
  assert.ok(m, 'pnum não encontrado no app');
  const pnum = new Function(m[0] + 'return pnum;')();
  const cases = { '4.5': 4.5, '4,50': 4.5, '1.234,56': 1234.56, '1,234.56': 1234.56, '1.000': 1000, 'R$ 12,30': 12.3, 'abc': '', '-5': '', '': '' };
  for (const [k, v] of Object.entries(cases)) assert.equal(pnum(k), v, k);
});

/* ---------------- entrada de mercadoria e precificação de notas ---------------- */
function rbase() { const S = base(); S.suppliers = [{ id: 'f1', code: '10', name: 'Distribuidora Teste', active: true }]; S.receipts = []; return S; }
const recv = (over) => Object.assign({ id: 'r1', status: 'aberta', nf: '555', supplierId: 'f1', items: [{ k: 'a', pid: 'p1', q: 10, valor: 48.5 }] }, over || {});
function syncOne(S, user, c, doc, ver) {
  const eff = policy.newEffects();
  const V = { meta: {} }; V[c] = {}; (S[c] || []).forEach(d => { V[c][d.id] = 1; });
  const r = policy.applySync(S, V, user, [{ c, id: doc.id, op: 'put', doc, ver: ver === undefined ? V[c][doc.id] : ver }], eff);
  return { w: r.writes[0], eff };
}

test('conferente lança e confere a nota: estoque soma na hora (relativo), uma vez só', () => {
  const S = rbase();
  let { w, eff } = syncOne(S, U.conferente, 'receipts', recv());
  assert.equal(w.doc.status, 'aberta'); assert.equal(w.doc.supplierName, 'Distribuidora Teste'); assert.equal(eff.stockIn.size, 0);
  ({ w, eff } = syncOne(S, U.conferente, 'receipts', recv({ status: 'conferida' })));
  assert.equal(w.doc.status, 'conferida'); assert.equal(w.doc.conferidaBy, 'Conferente Teste');
  assert.equal(eff.stockIn.get('p1'), 10); assert.equal(w.doc.totalNota, 485);
  // conferente não mexe mais depois de conferida
  assert.throws(() => syncOne(S, U.conferente, 'receipts', recv({ status: 'conferida', items: [{ k: 'a', pid: 'p1', q: 99, valor: 1 }] })), /já foi conferida/);
});

test('nota repetida do mesmo fornecedor é recusada; sem fornecedor ou número também', () => {
  const S = rbase(); syncOne(S, U.conferente, 'receipts', recv());
  assert.throws(() => syncOne(S, U.conferente, 'receipts', recv({ id: 'r2' })), /já foi lançada/);
  assert.throws(() => syncOne(S, U.conferente, 'receipts', recv({ id: 'r3', nf: '' })), /número da nota/);
  assert.throws(() => syncOne(S, U.conferente, 'receipts', recv({ id: 'r4', nf: '9', supplierId: 'x' })), /fornecedor/);
});

test('faturamento corrige quantidade (estoque acompanha), precifica e aprova: preços e custo vão para o produto', () => {
  const S = rbase(); syncOne(S, U.conferente, 'receipts', recv({ status: 'conferida' }));
  const r = clone(S.receipts[0]);
  r.items[0].q = 12; r.items[0].perPack = 12; r.items[0].trib = true; r.items[0].ieOn = true; r.items[0].price = 66; r.items[0].iePrice = 62;
  let { w, eff } = syncOne(S, U.faturamento, 'receipts', r);
  assert.equal(eff.stockIn.get('p1'), 2); assert.equal(w.doc.status, 'conferida'); assert.equal(eff.prodPatch.size, 0);
  const r2 = clone(S.receipts[0]); r2.status = 'aprovada';
  ({ w, eff } = syncOne(S, U.faturamento, 'receipts', r2));
  assert.equal(w.doc.status, 'aprovada'); assert.equal(w.doc.aprovadaBy, 'Fatura Teste');
  const patch = eff.prodPatch.get('p1');
  assert.deepEqual([patch.cost, patch.perPack, patch.trib, patch.price, patch.iePrice], [48.5, 12, true, 66, 62]);
  // depois de aprovada, faturamento não muda mais
  assert.throws(() => syncOne(S, U.faturamento, 'receipts', Object.assign(clone(S.receipts[0]), { status: 'aprovada' })), /já foi aprovada/);
});

test('aprovação exige preço, IE menor que o normal e produto ligado (ou criar novo)', () => {
  const S = rbase(); syncOne(S, U.conferente, 'receipts', recv({ status: 'conferida', items: [{ k: 'a', pid: 'p1', q: 1, valor: 10 }, { k: 'b', name: 'Produto novo', ean: '7890000000017', q: 3, valor: 5 }] }));
  const ok = () => clone(S.receipts[0]);
  let r = ok(); r.status = 'aprovada'; r.items[0].price = 20;
  assert.throws(() => syncOne(S, U.faturamento, 'receipts', r), /ligue a um produto/);
  r = ok(); r.status = 'aprovada'; r.items[0].price = 20; r.items[0].ieOn = true; r.items[0].iePrice = 25; r.items[1].newProd = true; r.items[1].price = 9;
  assert.throws(() => syncOne(S, U.faturamento, 'receipts', r), /menor que o preço normal/);
  r.items[0].iePrice = 19;
  const { w, eff } = syncOne(S, U.faturamento, 'receipts', r);
  assert.equal(eff.prodNew.length, 1); assert.equal(eff.prodNew[0].name, 'Produto novo'); assert.equal(eff.prodNew[0].stock, 3); assert.equal(eff.prodNew[0].price, 9);
  assert.equal(w.doc.items[1].pid, eff.prodNew[0].id);
});

test('quem não é conferente/faturamento/loja não mexe em notas; HTML é recusado', () => {
  const S = rbase();
  for (const r of ['cliente', 'vendedor', 'entregador']) assert.throws(() => syncOne(S, U[r], 'receipts', recv()), e => e.status === 403, r);
  assert.throws(() => syncOne(S, U.faturamento, 'receipts', recv()), e => e.status === 403);
  assert.throws(() => syncOne(S, U.conferente, 'receipts', recv({ items: [{ k: 'a', name: '<img src=x onerror=1>', q: 1, valor: 1 }] })), /caractere/);
});

test('loja cancela nota conferida: estoque volta', () => {
  const S = rbase(); syncOne(S, U.conferente, 'receipts', recv({ status: 'conferida' }));
  const r = clone(S.receipts[0]); r.status = 'cancelada';
  const { eff } = syncOne(S, U.admin, 'receipts', r);
  assert.equal(eff.stockIn.get('p1'), -10);
});

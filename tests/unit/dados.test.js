'use strict';
/* Regras de dinheiro e de números digitados (revisão de qualidade de dados). Rodar: node --test tests/unit */
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../lib/policy');

function base() {
  return {
    store: { autoRec: true }, payments: ['Pix', 'Boleto', 'Boleto 28 dias', 'Cartão 3x'], cashPays: ['Pix'], payDays: { 'Boleto 28 dias': '28' },
    products: [{ id: 'p1', name: 'Feijão', price: 10, stock: 50, active: true }, { id: 'k1', name: 'Queijo', price: 40, stock: 20, kg: true, active: true }],
    customers: [{ id: 'c1', name: 'Cliente', creditLimit: 1000 }], sellers: [{ id: 's1', name: 'V', commission: 3 }],
    orders: [], receivables: [], categories: [], combos: [], cities: [],
  };
}
const core = S => policy.coreFor(S, 'x').C;
const iso = () => new Date().toISOString();

test('pedido a prazo concluído sem prazo identificado: avisa, não gera conta e CONTINUA contando no limite de crédito', () => {
  const S = base(), C = core(S);
  const o = { id: 'o1', no: 1001, customerId: 'c1', customer: 'Cliente', pay: 'Boleto', status: 'saiu', total: 800, date: iso(), items: [{ pid: 'p1', name: 'Feijão', q: 80, price: 10 }] };
  S.orders.push(o);
  assert.equal(C.creditInfo(S.customers[0], 0).used, 800);
  const msg = C.setOrderStatus(o, 'concluido');
  assert.match(msg, /Não identifiquei o prazo de "Boleto"/);
  assert.equal(C.autoRecWarn(o), msg);
  assert.equal(S.receivables.length, 0);
  assert.equal(C.recMissing(o), true);
  const ci = C.creditInfo(S.customers[0], 300);
  assert.equal(ci.used, 800); assert.equal(ci.semConta, 800); assert.equal(ci.blocked, true);
  // lançado no contas a receber: deixa de ser "sem conta" e conta só pela parcela
  o.recLaunched = true; S.receivables.push({ id: 'r1', customerId: 'c1', amount: 800, due: '2099-01-01', paidAt: '' });
  assert.equal(C.recMissing(o), false); assert.equal(C.creditInfo(S.customers[0], 0).used, 800);
});

test('sem conta a receber: à vista, venda do balcão e pedidos antigos (fora da janela) não pesam no limite', () => {
  const S = base(), C = core(S);
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  S.orders.push({ id: 'a', customerId: 'c1', pay: 'Pix', status: 'concluido', total: 500, doneAt: iso(), items: [] });
  S.orders.push({ id: 'b', customerId: 'c1', pay: 'PDV (pago no balcão)', status: 'concluido', total: 500, doneAt: iso(), pdvVenda: 'v1', recLaunched: true, items: [] });
  S.orders.push({ id: 'c', customerId: 'c1', pay: 'Boleto', status: 'concluido', total: 500, doneAt: old, items: [] });
  assert.equal(C.recMissing(S.orders[0]), false);
  assert.equal(C.recMissing(S.orders[1]), false);
  assert.equal(C.recMissing(S.orders[2]), true);               // aparece no aviso
  assert.equal(C.creditInfo(S.customers[0], 0).used, 0);       // mas não trava o limite (mais de 60 dias)
});

test('forma com prazo continua gerando as parcelas normalmente (sem aviso)', () => {
  const S = base(), C = core(S);
  const o = { id: 'o2', no: 1002, customerId: 'c1', customer: 'Cliente', pay: 'Boleto 28 dias', status: 'saiu', total: 100, items: [] };
  S.orders.push(o);
  assert.match(C.setOrderStatus(o, 'concluido'), /1 parcela gerada/);
  assert.equal(S.receivables.length, 1); assert.equal(C.recMissing(o), false); assert.equal(C.autoRecWarn(o), '');
});

test('"3x" no nome da forma é número de parcelas, não prazo em dias', () => {
  const S = base(), C = core(S);
  assert.equal(C.daysFromPay('Cartão 3x'), '');
  assert.equal(C.daysFromPay('Cartão 10X'), '');
  assert.equal(C.daysFromPay('Boleto 3x 30/60/90'), '30,60,90');
  assert.equal(C.daysFromPay('Boleto 28 dias'), '28');
  assert.equal(C.payNoTerm('Cartão 3x'), true);
  assert.equal(C.payNoTerm('Boleto'), true);
  assert.equal(C.payNoTerm('Pix'), false);
  assert.equal(C.payNoTerm('Boleto 28 dias'), false);
});

test('parcelas: soma sempre igual ao total e nunca parcela de R$ 0,00', () => {
  const C = core(base());
  const sum = L => Math.round(L.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  assert.deepEqual(C.splitParcels(100, [30, 60, 90]).map(p => p.amount), [33.33, 33.33, 33.34]);
  const t = C.splitParcels(0.02, [30, 60, 90]);
  assert.equal(t.length, 2); assert.ok(t.every(p => p.amount > 0)); assert.equal(sum(t), 0.02);
  assert.deepEqual(C.splitParcels(0.01, [7, 14]).map(p => [p.days, p.amount]), [[7, 0.01]]);
  for (const v of [1234.57, 0.05, 999.99, 10]) for (const n of [1, 2, 3, 4, 7]) {
    const L = C.splitParcels(v, Array.from({ length: n }, (_, k) => 7 * (k + 1)));
    assert.equal(sum(L), v); assert.ok(L.every(p => p.amount > 0));
  }
});

test('comissão por parcela: a soma fecha com a comissão do pedido', () => {
  const C = core(base());
  const recs = [{ id: 'r1', amount: 33.33, due: '2026-12-01' }, { id: 'r2', amount: 33.33, due: '2026-12-31' }, { id: 'r3', amount: 33.34, due: '2027-01-30' }];
  const m = C.parcelComm(10, recs, 100);
  assert.deepEqual([m.r1, m.r2, m.r3], [3.33, 3.33, 3.34]);
  // parcelas que não somam o total (ex.: devolução abatida): fica proporcional, sem "sobra"
  const m2 = C.parcelComm(10, [{ id: 'a', amount: 50, due: '2026-12-01' }], 100);
  assert.equal(m2.a, 5);
  assert.deepEqual(C.parcelComm(10, [], 100), {});
});

test('números das Configurações: ponto decimal não multiplica por 100; inválido é recusado', () => {
  const C = core(base());
  assert.equal(C.cfgNum('9.25'), 9.25);
  assert.equal(C.cfgNum('9,25'), 9.25);
  assert.equal(C.cfgNum('2.5'), 2.5);
  assert.equal(C.cfgNum('150.00'), 150);
  assert.equal(C.cfgNum('1.234,56'), 1234.56);
  assert.equal(C.cfgNum('R$ 200'), 200);
  assert.equal(C.cfgNum(''), 0);
  assert.ok(Number.isNaN(C.cfgNum('abc')));
  assert.ok(Number.isNaN(C.cfgNum('-5')));
});

test('importação de planilha: "1.234" sem vírgula é milhar (igual ao resto do app)', () => {
  const C = core(base());
  assert.equal(C.bnum('1.234'), 1234);
  assert.equal(C.bnum('1.234.567'), 1234567);
  assert.equal(C.bnum('1.234,56'), 1234.56);
  assert.equal(C.bnum('4.50'), 4.5);
  assert.equal(C.bnum('12.5'), 12.5);
  assert.equal(C.bnum(7.456), 7.46);
  assert.equal(C.bnum('R$ 4,50'), 4.5);
  assert.equal(C.pnum('1.234'), C.bnum('1.234'));
});

test('quantidade digitada no ajuste/devolução: kg aceita decimal; os demais, inteiro', () => {
  const S = base(), C = core(S);
  const kgItem = { pid: 'k1', name: 'Queijo', q: 3.5, price: 40, kg: true };
  const kgOld = { pid: 'k1', name: 'Queijo', q: 3.5, price: 40 };        // pedido antigo sem a marca kg: acha pelo produto
  const un = { pid: 'p1', name: 'Feijão', q: 10, price: 10 };
  assert.equal(C.qtyIn('2,5', kgItem), 2.5);
  assert.equal(C.qtyIn('2.5', kgItem), 2.5);
  assert.equal(C.qtyIn('1,2345', kgOld), 1.235);
  assert.equal(C.qtyIn('2,5', un), 2);
  assert.equal(C.qtyIn('7', un), 7);
  assert.equal(C.qtyIn('', un), 0);
  assert.equal(C.qtyIn('-3', kgItem), 0);
  assert.equal(C.qtyIn('abc', kgItem), 0);
});

test('data de pagamento: aceita data e data/hora antiga (UTC) e devolve o dia local', () => {
  const C = core(base());
  assert.equal(C.isoDay('2026-11-02'), '2026-11-02');
  const d = new Date(2026, 10, 2, 22, 30);   // 22h30 local = dia seguinte em UTC no Brasil
  assert.equal(C.isoDay(d.toISOString()), '2026-11-02');
  assert.equal(C.isoDay(''), '');
});

test('servidor: concluir pedido sem prazo identificado não gera conta, mas o cliente não ganha o limite de volta', () => {
  const S = base(); S.store.min = 0;
  const o = { id: 'o1', no: 1001, customerId: 'c1', customer: 'Cliente', pay: 'Boleto', status: 'saiu', total: 800, date: iso(), items: [{ pid: 'p1', name: 'Feijão', q: 80, price: 10 }] };
  S.orders.push(o);
  const doc = JSON.parse(JSON.stringify(o)); doc.status = 'concluido';
  const r = policy.applySync(S, { orders: { o1: 3 }, meta: {} }, { role: 'admin', ref_id: 'a' }, [{ c: 'orders', id: 'o1', op: 'put', doc, ver: 3 }]);
  assert.equal(r.effects.recNew.length, 0);
  const { C } = policy.coreFor(S, 'x');
  assert.equal(C.creditInfo(S.customers[0], 0).used, 800);
  assert.equal(C.payOptions(S.customers[0], 300).ci.blocked, true);
});

test('sem conta a receber: lançar com 1 toque (prazo escolhido) ou dispensar; dispensado sai do aviso e do limite', () => {
  const S = base(), C = core(S);
  const mk = id => { const o = { id, no: id === 'a' ? 1 : 2, customerId: 'c1', customer: 'Cliente', pay: 'Boleto', status: 'concluido', total: 100, doneAt: iso(), items: [] }; S.orders.push(o); return o; };
  const a = mk('a'), b = mk('b');
  assert.equal(C.creditInfo(S.customers[0], 0).used, 200);
  const parts = C.recLaunch(a, [14, 28], '2026-11-02');
  assert.deepEqual(parts.map(p => p.amount), [50, 50]);
  assert.deepEqual(S.receivables.map(r => [r.orderId, r.due, r.parcel]), [['a', '2026-11-16', '1/2'], ['a', '2026-11-30', '2/2']]);
  assert.equal(C.recMissing(a), false);
  b.recDismiss = { at: iso(), by: 'Loja', why: 'Já recebido / à vista' };
  assert.equal(C.recMissing(b), false);
  assert.equal(C.creditInfo(S.customers[0], 0).used, 100);           // só as parcelas do pedido a
});

test('servidor: só a loja dispensa a cobrança; o cliente não vê nem mexe', () => {
  const S = base(); S.store.min = 0;
  const o = { id: 'o1', no: 1001, date: iso(), customerId: 'c1', customer: 'Cliente', pay: 'Boleto', status: 'concluido', total: 100, items: [{ pid: 'p1', name: 'Feijão', q: 10, price: 10 }], recDismiss: { at: iso(), by: 'Loja' } };
  S.orders.push(o);
  const P = policy.project(S, { role: 'cliente', ref_id: 'c1' });
  assert.equal(P.orders[0].recDismiss, undefined);
  const o2 = Object.assign(JSON.parse(JSON.stringify(o)), { id: 'o2', status: 'novo' }); delete o2.recDismiss; S.orders.push(o2);
  const n = JSON.parse(JSON.stringify(o2)); n.recDismiss = { at: iso(), by: 'eu' };
  assert.throws(() => policy.checkOrderUpdate(S, { role: 'cliente', ref_id: 'c1', name: 'Cliente' }, o2, n), /recDismiss/);
});

test('perdas por avaria: período pela conclusão, valor a custo (do item; sem ele, do produto)', () => {
  const S = base(), C = core(S);
  S.products[0].cost = 7;
  S.orders.push({ id: 'x', no: 5, customer: 'Cli', status: 'concluido', doneAt: '2026-11-03T15:00:00.000Z', loss: { p1: 2, k1: 0.5 }, items: [{ pid: 'p1', name: 'Feijão', q: 8, cost: 6 }, { pid: 'k1', name: 'Queijo', q: 1 }] });
  S.orders.push({ id: 'y', no: 6, customer: 'Cli', status: 'concluido', doneAt: '2026-12-03T15:00:00.000Z', loss: { p1: 9 }, items: [{ pid: 'p1', name: 'Feijão', q: 1 }] });
  S.orders.push({ id: 'z', no: 7, customer: 'Cli', status: 'cancelado', doneAt: '2026-11-03T15:00:00.000Z', loss: { p1: 9 }, items: [] });
  const L = C.lossRows('2026-11-01', '2026-11-30');
  assert.deepEqual(L.map(r => [r.pid, r.q, r.cost, r.value]), [['p1', 2, 6, 12], ['k1', 0.5, null, null]]);
  const T = C.lossSum(L);
  assert.equal(T.total, 12); assert.equal(T.noCost, 1); assert.equal(T.by.length, 2);
  assert.equal(C.lossRows('2026-12-01', '2026-12-31')[0].value, 63);   // sem custo no item: usa o do produto (7 × 9)
});

test('sem conta a receber: PIX/dinheiro/"à vista" sem prazo cadastrado não viram aviso (loja que não marcou como à vista)', () => {
  const S = base(); S.cashPays = []; const C = core(S);
  const mk = pay => ({ id: pay, customerId: 'c1', pay, status: 'concluido', total: 10, items: [] });
  assert.equal(C.recMissing(mk('PIX')), false);
  assert.equal(C.recMissing(mk('Dinheiro')), false);
  assert.equal(C.recMissing(mk('Cartão à vista')), false);
  assert.equal(C.recMissing(mk('Boleto')), true);
  assert.equal(C.recMissing(mk('Pixel 30 dias')), true);
});

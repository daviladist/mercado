'use strict';
/* Fuzz (sem banco): cada papel manda alterações de pedido com valores estragados (nulo, texto, objeto, lista...)
   em pedidos de todas as situações. Nenhuma pode virar erro inesperado (500): tem que ser recusada com motivo ou gravada.
   Também confere que a fatia de dados de cada papel não leva custo/margem. */
const test = require('node:test');
const assert = require('node:assert');
const policy = require('../../lib/policy');
const store = require('../../lib/store');

const clone = x => JSON.parse(JSON.stringify(x));
function baseS(mods) {
  const S = {}; store.COLLS.forEach(c => { S[c] = []; });
  S.store = { name: 'LOJA', min: 0, pickupDisc: 2 };
  S.payments = ['PIX', 'Dinheiro', 'Boleto 28 dias'];
  S.products = [
    { id: 'pa', name: 'Arroz', price: 25, cost: 20, unit: 'UN', perPack: 6, stock: 50, active: true, cat: 'Mercearia', code: '1' },
    { id: 'pk', name: 'Queijo', price: 40, cost: 30, unit: 'KG', kg: true, stock: '', active: true, code: '2' },
    { id: 'pb', name: 'Feijão', price: 9, cost: 7, unit: 'UN', stock: 3, active: true, code: '3' }];
  S.combos = [{ id: 'cb', name: 'Kit', items: [{ pid: 'pa', q: 1 }, { pid: 'pb', q: 2 }], price: 40, active: true }];
  S.customers = [{ id: 'cl1', name: 'Cliente Um', sellerId: 's1', doc: '11222333000181', creditLimit: 5000, pays: ['PIX', 'Boleto 28 dias'] }, { id: 'cl2', name: 'Cliente Dois', sellerId: 's2' }];
  S.sellers = [{ id: 's1', name: 'Vend Um', commission: 2 }, { id: 's2', name: 'Vend Dois' }];
  S.vehicles = [{ id: 'd1', driver: 'Moto', car: 'Fiorino' }];
  S.checkers = [{ id: 'k1', name: 'Conf' }]; S.billers = [{ id: 'b1', name: 'Fat' }]; S.cashiers = [{ id: 'x1', name: 'Caixa' }];
  S.receivables = [{ id: 'r1', customerId: 'cl1', orderId: 'o-concluido', amount: 50, due: '2026-01-01', paidAt: '' }];
  const it = (pid, q, price, extra) => Object.assign({ pid, name: pid, q, price, base: price, unit: 'UN', cost: 20, commP: 2 }, extra || {});
  const ST = ['novo', 'separando', 'separado', 'pronto', 'saiu', 'concluido', 'cancelado'];
  let n = 1000;
  ST.forEach(st => ['', 's1'].forEach(sel => {
    const id = 'o-' + st + (sel ? '-v' : '');
    S.orders.push({ id, no: ++n, date: '2026-10-30T12:00:00.000Z', customerId: 'cl1', customer: 'Cliente Um', sellerId: sel, sellerRate: sel ? 2 : '', status: st, pay: 'Boleto 28 dias', mode: 'entrega',
      addr: 'Rua A', items: [it('pa', 4, 25, { perPack: 6, qOcc: 4 }), it('pb', 2, 9)], sub: 118, disc: 0, total: 118, nf: st === 'separado' ? { ie: 'ISENTO' } : null,
      deliv: ['pronto', 'saiu', 'concluido'].includes(st) ? { drv: 'd1', at: '2026-10-30T13:00:00Z', fails: [] } : undefined,
      sugs: st === 'separando' ? [{ id: 'sg1', type: 'troca', status: 'pendente', fromKey: 'pa', fromName: 'pa', pid: 'pb', q: 1, toSeller: !!sel }, { id: 'sg2', type: 'qtd', status: 'aprovada', fromKey: 'pb', q: 1, sellerSeen: false }] : [],
      chk: st === 'separando' ? { pa: true } : {}, events: [{ at: '2026-10-30T12:00:00Z', text: 'criado' }], apprHist: [],
      appr: st === 'novo' && sel ? 'contra' : undefined,
      billed: ['pronto', 'saiu', 'concluido'].includes(st) ? { at: 'x', by: 'Fat', nf: '' } : undefined,
      delivered: st === 'concluido' ? { at: 'x', name: 'Zé', photo: '/api/photo/o%3Ax', how: 'dinheiro', drv: 'd1', settled: false } : undefined,
      occ: st === 'concluido' ? { items: [{ t: 'avaria', name: 'pa', q: 1, u: 'cx' }], reboleto: true } : undefined });
  }));
  Object.defineProperty(S, '__mods', { value: mods || new Proxy({}, { get: () => true }), enumerable: false });
  const V = { meta: { store: 1, payments: 1 } }; store.COLLS.forEach(c => { V[c] = {}; (S[c] || []).forEach(d => { V[c][d.id] = 1; }); });
  return { S, V };
}
const USERS = [
  { role: 'cliente', ref_id: 'cl1', name: 'Cliente Um' }, { role: 'vendedor', ref_id: 's1', name: 'Vend Um' }, { role: 'conferente', ref_id: 'k1', name: 'Conf' },
  { role: 'faturamento', ref_id: 'b1', name: 'Fat' }, { role: 'entregador', ref_id: 'd1', name: 'Moto' }, { role: 'operador_caixa', ref_id: 'x1', name: 'Caixa' }];
// FUZZ=completo usa todos os valores (mais lento); o padrão roda no npm test em poucos segundos
const VALS = process.env.FUZZ === 'completo' ? [null, 'x', '', 0, -1, 1e308, true, {}, [], [null], ['x'], { a: null }] : [null, 'x', {}, [null]];
const NESTED = ['items.0', 'deliv', 'delivered', 'occ', 'occ.items.0', 'sugs.0', 'chk', 'billed', 'nf'];

function attempt(S0, V0, user, ch, bad, label) {
  const S = clone(S0); Object.defineProperty(S, '__mods', { value: S0.__mods, enumerable: false });
  try {
    const r = policy.applySync(S, clone(V0), user, [ch]);
    // o que foi aceito não pode guardar lixo em listas que as telas percorrem (registro nulo quebra a tela de quem abre)
    if (user.role !== 'admin') r.writes.filter(w => w.c === 'orders').forEach(w => ['items', 'events', 'apprHist', 'sugs', 'scanLog', 'removed'].forEach(k => {
      const v = w.doc[k]; if (v !== undefined && (!Array.isArray(v) || v.some(x => !x || typeof x !== 'object'))) bad.push(user.role + ' ' + label + ': gravou ' + k + ' inválido | lista ' + k);
    }));
  }
  catch (e) { if (!e.status || e.status >= 500) bad.push(user.role + ' ' + label + ': ' + String(e && e.stack || e).split('\n').slice(0, 2).join(' | ')); }
}
function mutations(o) {
  const out = [];
  const keys = new Set([...Object.keys(o), 'items', 'status', 'appr', 'deliv', 'delivered', 'occ', 'sugs', 'chk', 'scan', 'billed', 'apprHist', 'events', 'nf', 'durs', 'scanLog', 'volumes', 'cliRej', 'seenAt', 'loss', 'removed']);
  for (const k of keys) for (const v of VALS) out.push([k + '=' + JSON.stringify(v), d => { d[k] = clone(v); }]);
  for (const path of NESTED) {
    const parts = path.split('.');
    const get = d => parts.reduce((x, p) => x && x[p], d);
    const tgt = get(o);
    if (!tgt || typeof tgt !== 'object') continue;
    for (const k of new Set([...Object.keys(tgt), 'q', 'pid', 'price', 'status', 'type', 'id', 'photo', 'how', 'name', 'reboleto', 'settled', 'fails', 'drv', 'items', 'nf', 'occLine', 'combo', 'extra', 'units', 'src', 't']))
      for (const v of VALS) out.push([path + '.' + k + '=' + JSON.stringify(v), d => { const t = get(d); if (t && typeof t === 'object') t[k] = clone(v); }]);
  }
  // listas que só crescem: item estragado no fim
  ['events', 'apprHist', 'sugs', 'scanLog', 'removed'].forEach(k => VALS.forEach(v => out.push([k + '+' + JSON.stringify(v), d => { d[k] = (Array.isArray(d[k]) ? d[k] : []).concat([clone(v)]); }])));
  ['deliv.fails'].forEach(() => VALS.forEach(v => out.push(['deliv.fails+' + JSON.stringify(v), d => { d.deliv = Object.assign({}, d.deliv, { fails: [clone(v)] }); }])));
  // mudanças de situação e aprovação plausíveis
  ['novo', 'separando', 'separado', 'pronto', 'saiu', 'concluido', 'cancelado', 'x'].forEach(st => out.push(['status->' + st, d => { d.status = st; }]));
  [null, 'pendente', 'aceito', 'recusado', 'liberado'].forEach(a => out.push(['appr->' + a, d => { d.appr = a; }]));
  return out;
}

test('fuzz: alteração de pedido por cada papel nunca vira erro inesperado', () => {
  const bad = [];
  for (const mods of [undefined, Object.assign(new Proxy({}, { get: (t, k) => k in t ? t[k] : true }), { trava_estoque: true, negociacao: false })]) {
    const { S, V } = baseS(mods);
    for (const user of USERS) {
      const P = policy.project(S, user);
      for (const o0 of P.orders || []) {
        for (const [label, fn] of mutations(o0)) {
          const d = clone(o0); fn(d);
          attempt(S, V, user, { c: 'orders', id: o0.id, op: 'put', ver: V.orders[o0.id], doc: d }, bad, o0.id + ' ' + label);
          // mesma alteração chegando com conflito de versão (junção de mudanças)
          if (process.env.FUZZ === 'completo' && (label.startsWith('items') || label.startsWith('status'))) attempt(S, V, user, { c: 'orders', id: o0.id, op: 'put', ver: 0, base: JSON.stringify(o0), doc: d }, bad, o0.id + ' (junção) ' + label);
        }
      }
      // pedido novo com lixo
      const novo = { items: [{ pid: 'pa', q: 2, price: 25 }, { combo: true, comboId: 'cb', q: 1, price: 40 }], mode: 'entrega', addr: 'Rua', pay: 'PIX', customerId: 'cl1', nf: { ie: '123' } };
      for (const [label, fn] of mutations(novo)) { const d = clone(novo); fn(d); attempt(S, V, user, { c: 'orders', id: 'novo1', op: 'put', doc: d }, bad, 'novo ' + label); }
      // outras coleções que o papel pode tentar
      for (const c of ['customers', 'counts', 'receipts', 'romaneios', 'receivables', 'products', 'meta'])
        for (const v of VALS) attempt(S, V, user, { c, id: c === 'meta' ? 'store' : (c === 'customers' ? user.ref_id : 'z1'), op: 'put', doc: { items: v, status: v, orders: v, fiscal: v, name: 'x' } }, bad, c + ' ' + JSON.stringify(v));
    }
  }
  const loc = new Map(); bad.forEach(b => { const k = (b.split(" | ")[1] || b).trim(); if (!loc.has(k)) loc.set(k, b); }); assert.deepStrictEqual([...loc.values()], []);
});

test('fatia de cada papel não leva custo, margem nem dados de outro cliente', () => {
  const { S } = baseS();
  const SECRET = ['cost', 'refCost', 'refC', 'lastIn', 'minMg', 'apprMg', 'apprMin', 'tolUsed', 'stockApplied', 'frete3', 'commX', 'prevComm'];
  for (const user of USERS) {
    const P = policy.project(S, user);
    const seen = [];
    (function walk(x, path) {
      if (Array.isArray(x)) return x.forEach((y, i) => walk(y, path + '.' + i));
      if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => { if (SECRET.includes(k)) seen.push(path + '.' + k); walk(v, path + '.' + k); });
    })(P, user.role);
    assert.deepStrictEqual(seen, [], user.role + ' recebeu campo secreto');
    if (user.role !== 'vendedor') assert.ok(!(P.customers || []).some(c => 'lastBuyAt' in c), user.role + ' não recebe lastBuyAt');
    if (user.role === 'cliente') assert.deepStrictEqual((P.customers || []).map(c => c.id), ['cl1']);
    if (user.role === 'vendedor') { assert.ok((P.customers || []).every(c => c.sellerId === 's1')); assert.ok((P.orders || []).every(o => o.sellerId === 's1')); }
  }
});

'use strict';
/* Robustez da gravação (sem banco): erro inesperado num registro, loja sem configuração, envio em partes no app. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = require('../../lib/store');
const policy = require('../../lib/policy');
const { planSync } = require('../../lib/api');
const errlog = require('../../lib/errlog');
const logged = []; errlog.logError = async (tid, route, e) => { logged.push(route); };   // sem banco aqui

const base = () => {
  const S = {}; store.COLLS.forEach(c => { S[c] = []; });
  S.products = [{ id: 'pa', name: 'Arroz', price: 25, unit: 'UN', active: true }];
  S.customers = [{ id: 'cl1', name: 'Cliente', sellerId: 's1' }];
  S.sellers = [{ id: 's1', name: 'Vend', allCli: true }];
  const V = { meta: {} }; store.COLLS.forEach(c => { V[c] = {}; });
  return { S, V };
};
const ADMIN = { role: 'admin', ref_id: 'adm', tenant_id: 't', name: 'Dono' };
const T = { modules: new Proxy({}, { get: () => true }) };

test('erro inesperado numa alteração: só ela é recusada, as outras seguem e nada fica pela metade', async () => {
  const loadAll = store.loadAll, apply = policy.applySync;
  let loads = 0;
  store.loadAll = async () => { loads++; return base(); };
  policy.applySync = (S, V, u, chs, ef) => {
    const r = apply(S, V, u, chs, ef);
    if (chs[0].id === 'ruim') { S.products.push({ id: 'meio-gravado' }); throw new TypeError('quebrou'); }
    return r;
  };
  const err = console.error; console.error = () => {};
  try {
    const p = (id) => ({ c: 'products', id, op: 'put', doc: { id, name: id, price: 1 } });
    const out = await planSync(ADMIN, T, [p('bom1'), p('ruim'), p('bom2')]);
    assert.deepStrictEqual(out.writes.map(w => w.id), ['bom1', 'bom2']);
    assert.strictEqual(out.rejected.length, 1);
    assert.strictEqual(out.rejected[0].id, 'ruim');
    assert.ok(!out.S.products.some(x => x.id === 'meio-gravado'), 'conferência refeita do zero, sem a mudança pela metade');
    assert.strictEqual(loads, 2);
    assert.ok(logged.includes('/api/sync (products)'), 'erro inesperado vai para o painel da Central');
  } finally { store.loadAll = loadAll; policy.applySync = apply; console.error = err; }
});

test('muitos erros inesperados no mesmo envio: desiste (erro do servidor) em vez de repetir sem fim', async () => {
  const loadAll = store.loadAll, apply = policy.applySync;
  store.loadAll = async () => base();
  policy.applySync = () => { throw new TypeError('sempre'); };
  const err = console.error; console.error = () => {};
  try {
    const chs = Array.from({ length: 10 }, (_, i) => ({ c: 'products', id: 'x' + i, op: 'put', doc: {} }));
    await assert.rejects(planSync(ADMIN, T, chs), /sempre/);
  } finally { store.loadAll = loadAll; policy.applySync = apply; console.error = err; }
});

test('loja sem "store" e sem formas de pagamento: pedido do cliente é recusado com motivo (não quebra)', () => {
  const { S, V } = base(); S.__mods = {};
  const u = { role: 'cliente', ref_id: 'cl1', name: 'Cliente' };
  assert.throws(() => policy.applySync(S, V, u, [{ c: 'orders', id: 'o1', op: 'put', doc: { items: [{ pid: 'pa', q: 1 }], pay: 'PIX', mode: 'retirada' } }]),
    e => e.status === 400 && /forma de pagamento/.test(e.message));
  S.payments = ['PIX'];
  const r = policy.applySync(S, V, u, [{ c: 'orders', id: 'o2', op: 'put', doc: { items: [{ pid: 'pa', q: 1 }], pay: 'PIX', mode: 'retirada' } }]);
  assert.strictEqual(r.writes[0].doc.total, 25);
  assert.throws(() => policy.applySync(S, V, u, [{ c: 'orders', id: 'o3', op: 'put', doc: { items: [null], pay: 'PIX' } }]), e => e.status === 400);
  assert.throws(() => policy.applySync(S, V, u, [{ c: 'orders', id: 'o4', op: 'put', doc: { items: 'x', pay: 'PIX' } }]), e => e.status === 400);
});

test('configuração com nome herdado de objeto ("constructor") não vira conflito falso', () => {
  const { S, V } = base();
  const r = policy.applySync(S, V, ADMIN, [{ c: 'meta', id: 'constructor', op: 'put', doc: { a: 1 } }]);
  assert.strictEqual(r.writes.length, 1);
  assert.strictEqual(r.writes[0].ver, undefined);
});

test('app: envio grande vai em partes (até 400 alterações e ~2,5 MB por vez)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const m = /const SRV_MAXN=[\s\S]*?\nfunction srvChunk\([^\n]*\n/.exec(src);
  assert.ok(m, 'srvChunk está no app gerado');
  const ctx = {}; vm.runInNewContext(m[0] + 'this.srvChunk=srvChunk;', ctx);
  const L = Array.from({ length: 600 }, (_, i) => ({ c: 'products', id: 'p' + i, op: 'put', doc: { id: 'p' + i } }));
  const a = ctx.srvChunk(L); assert.strictEqual(a.length, 400);
  assert.strictEqual(ctx.srvChunk(L.slice(400)).length, 200);
  const grande = Array.from({ length: 5 }, (_, i) => ({ c: 'products', id: 'g' + i, op: 'put', doc: { photo: 'x'.repeat(900000) } }));
  assert.strictEqual(ctx.srvChunk(grande).length, 2);
  assert.strictEqual(ctx.srvChunk([{ doc: 'y'.repeat(3000000) }]).length, 1, 'um registro grande sozinho ainda vai (o servidor responde)');
});

test('app: registro sozinho grande demais (> 3,5 MB) volta como estava e o resto da fila segue', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const m = /const SRV_MAXN=[\s\S]*?\nfunction srvChunk\([^\n]*\n/.exec(src);
  const alerts = [];
  const ctx = { S: { products: [{ id: 'a', photo: 'x'.repeat(3600000) }, { id: 'b', name: 'novo' }], store: { logo: 'y'.repeat(3600000) } },
    SRV: { base: { products: { a: JSON.stringify({ id: 'a', photo: '' }) }, meta: { store: JSON.stringify({ name: 'LOJA' }) } } },
    srvAlert: t => alerts.push(t), srvSoftRender: () => {} };
  vm.runInNewContext(m[0] + 'this.srvDropHuge=srvDropHuge;', ctx);
  const L = [{ c: 'products', id: 'a', op: 'put', doc: ctx.S.products[0] }, { c: 'products', id: 'b', op: 'put', doc: ctx.S.products[1] }, { c: 'meta', id: 'store', op: 'put', doc: ctx.S.store }];
  const out = ctx.srvDropHuge(L);
  assert.strictEqual(out.map(x => x.id).join(), 'b');
  assert.strictEqual(ctx.S.products[0].photo, '', 'volta ao que está no servidor');
  assert.strictEqual(JSON.stringify(ctx.S.store), '{"name":"LOJA"}');
  assert.strictEqual(alerts.length, 1);
  assert.match(alerts[0], /2 registros grandes demais/);
});

test('histórico de aprovação: só em pedido em aberto e no máximo 50 registros', () => {
  const mk = (status, n) => {
    const { S, V } = base(); S.__mods = {}; S.payments = ['PIX'];
    S.orders = [{ id: 'o1', no: 1001, customerId: 'cl1', customer: 'Cliente', sellerId: 's1', status, pay: 'PIX', mode: 'retirada', items: [{ pid: 'pa', name: 'Arroz', q: 1, price: 25, base: 25 }], sub: 25, disc: 0, total: 25,
      apprHist: Array.from({ length: n }, (_, i) => ({ at: '2026-01-01', by: 'x', what: 'h' + i })) }];
    V.orders = { o1: 1 }; return { S, V };
  };
  const u = { role: 'cliente', ref_id: 'cl1', name: 'Cliente' };
  const send = (S, V) => policy.applySync(S, V, u, [{ c: 'orders', id: 'o1', op: 'put', ver: 1, doc: Object.assign(JSON.parse(JSON.stringify(S.orders[0])), { apprHist: S.orders[0].apprHist.concat([{ what: 'novo' }]) }) }]);
  { const { S, V } = mk('novo', 3); assert.strictEqual(send(S, V).writes[0].doc.apprHist.length, 4); }
  for (const st of ['concluido', 'cancelado']) { const { S, V } = mk(st, 3); assert.throws(() => send(S, V), e => e.status === 403); }
  { const { S, V } = mk('novo', 50); assert.throws(() => send(S, V), e => e.status === 400 && /cheio/.test(e.message)); }
});

test('painel de erros: mensagem sem CPF/CNPJ, e-mail nem texto longo', () => {
  const c = errlog.clean('value "12.345.678/0001-90" de joao@x.com.br falhou: "' + 'a'.repeat(40) + '"\nlinha 2');
  assert.ok(!/12\.345|joao@|aaaa|linha 2/.test(c), c);
});

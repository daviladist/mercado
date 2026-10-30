'use strict';
/* Tino: regras do catálogo de módulos (sem banco). */
const test = require('node:test');
const assert = require('node:assert');
const M = require('../../lib/modules');

test('essenciais ficam sempre ligados', () => {
  const r = M.resolve({ default_on: false, modules: { pedidos: false, catalogo: false } });
  M.MODULES.filter(m => m.essential).forEach(m => assert.strictEqual(r[m.code], true, m.code));
});
test('empresa principal (default_on) liga módulo novo que ainda não foi gravado', () => {
  const r = M.resolve({ default_on: true, modules: { pagar: false } });
  assert.strictEqual(r.pagar, false);
  assert.strictEqual(r.staria, true);
});
test('empresa nova começa desligada no que não veio no pacote', () => {
  const r = M.resolve({ default_on: false, modules: M.presetFor('suplementos') });
  assert.deepStrictEqual(Object.keys(r).filter(k => r[k] && !M.BY_CODE[k].essential).sort(), ['comissao', 'margem', 'painel', 'sabores', 'tabela_ie']);
});
test('toda coleção e papel protegidos apontam para módulo que existe e não é essencial', () => {
  Object.values(M.COLL_MODULE).concat(Object.values(M.ROLE_MODULE)).forEach(c => { assert.ok(M.BY_CODE[c]); assert.ok(!M.BY_CODE[c].essential); });
  ['orders', 'products', 'customers'].forEach(c => assert.strictEqual(M.COLL_MODULE[c], undefined));
  ['admin', 'cliente', 'vendedor'].forEach(r => assert.strictEqual(M.ROLE_MODULE[r], undefined));
});
test('códigos únicos', () => { assert.strictEqual(new Set(M.MODULES.map(m => m.code)).size, M.MODULES.length); });
test('módulo que diz "servidor" tem efeito no servidor (dados, configuração ou login)', () => {
  M.MODULES.filter(m => m.enforced === 'servidor' && m.code !== 'negociacao').forEach(m => {
    assert.ok((m.colls || []).length || (m.metas || []).length || (m.roles || []).length, m.code);
  });
  M.MODULES.filter(m => m.enforced === 'tela').forEach(m => assert.ok(!(m.colls || []).length && !(m.metas || []).length, m.code));
});
test('dados de módulo desligado não saem e não entram', () => {
  const P = M.stripOff({ payables: [{ id: 1 }], receivables: [{ id: 2 }], lastWeek: { ids: [] }, orders: [{ id: 3 }] }, M.resolve({ default_on: false }));
  assert.deepStrictEqual(P.payables, []); assert.deepStrictEqual(P.receivables, []); assert.strictEqual(P.lastWeek, undefined); assert.strictEqual(P.orders.length, 1);
  const off = M.resolve({ default_on: false });
  assert.strictEqual(M.blockedBy({ c: 'payables', id: 'x' }, off), 'pagar');
  assert.strictEqual(M.blockedBy({ c: 'meta', id: 'lastWeek' }, off), 'ofertas');
  assert.strictEqual(M.blockedBy({ c: 'orders', id: 'x' }, off), '');
  assert.strictEqual(M.blockedBy({ c: 'constructor', id: 'x' }, off), '');
});

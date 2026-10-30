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

'use strict';
/* Gerador de Encartes: quem pode ler e gravar o quê na "nuvem" da empresa (sem banco). */
const test = require('node:test');
const assert = require('node:assert');
const { checkPath, meuId } = require('../../lib/encartes');
const dono = { role: 'admin', ref_id: 'adm1' }, func = { role: 'caixista', ref_id: 'e123' };

test('ids: dono e funcionário nunca se confundem', () => {
  assert.strictEqual(meuId(dono), 'a_adm1');
  assert.strictEqual(meuId(func), 'f_e123');
});
test('endereços válidos passam', () => {
  for (const p of ['comum/dados', 'comum/imagens', 'salvos/abc123', 'data/users/f_e123/rascunho']) assert.strictEqual(checkPath(p, func, true), p);
  for (const p of ['app/estado', 'app/imagens', 'app/custos', 'app/acessos']) assert.strictEqual(checkPath(p, dono, true), p);
});
test('endereço estranho é recusado', () => {
  for (const p of ['', '/app', 'app/../x', 'a//b', 'app estado', 'x'.repeat(300)]) assert.throws(() => checkPath(p, dono, false));
});
test('rascunho de outra pessoa: funcionário não lê nem grava; dono pode', () => {
  assert.throws(() => checkPath('data/users/f_outro/rascunho', func, false), /outra pessoa/);
  assert.strictEqual(checkPath('data/users/f_outro/rascunho', dono, true), 'data/users/f_outro/rascunho');
});
test('banco de produtos: só o dono grava, todos leem', () => {
  assert.throws(() => checkPath('app/catalogo', func, true), /administrador/);
  assert.strictEqual(checkPath('app/catalogo', func, false), 'app/catalogo');
  assert.strictEqual(checkPath('app/catalogo', dono, true), 'app/catalogo');
});
test('configuração e acessos: funcionário lê a configuração, mas não grava nada em app/', () => {
  assert.strictEqual(checkPath('app/estado', func, false), 'app/estado');
  for (const p of ['app/estado', 'app/acessos', 'app/imagens']) assert.throws(() => checkPath(p, func, true), /administrador/);
});
test('custos: só o administrador lê e grava', () => {
  assert.throws(() => checkPath('app/custos', func, false), /custos/);
  assert.throws(() => checkPath('app/custos', func, true));
  assert.strictEqual(checkPath('app/custos', dono, false), 'app/custos');
});

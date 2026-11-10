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
  for (const p of ['app/estado', 'app/imagens', 'salvos/abc123', 'data/users/f_e123/rascunho']) assert.strictEqual(checkPath(p, func, true), p);
});
test('endereço estranho é recusado', () => {
  for (const p of ['', '/app', 'app/../x', 'a//b', 'app estado', 'x'.repeat(300)]) assert.throws(() => checkPath(p, dono, false));
});
test('rascunho de outra pessoa: funcionário não lê nem grava; dono pode', () => {
  assert.throws(() => checkPath('data/users/f_outro/rascunho', func, false), /outra pessoa/);
  assert.strictEqual(checkPath('data/users/f_outro/rascunho', dono, true), 'data/users/f_outro/rascunho');
});
test('banco de produtos: só o dono grava, todos leem', () => {
  assert.throws(() => checkPath('app/catalogo', func, true), /dono/);
  assert.strictEqual(checkPath('app/catalogo', func, false), 'app/catalogo');
  assert.strictEqual(checkPath('app/catalogo', dono, true), 'app/catalogo');
});

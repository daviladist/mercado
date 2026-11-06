'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { entende } = require('../../lib/telegram');

test('robô do Telegram entende valor, categoria e filial', () => {
  assert.deepStrictEqual(entende('diesel 400 caminhão', 1), { valor: 400, categoria: 'combustivel', filial: 1 });
  assert.deepStrictEqual(entende('conserto câmara fria 1.250,00 loja 2', 1), { valor: 1250, categoria: 'manutencao', filial: 2 });
  assert.deepStrictEqual(entende('contador 2000 rede', 1), { valor: 2000, categoria: 'contabilidade', filial: 0 });
  assert.deepStrictEqual(entende('luz f3 3.480,55', 2), { valor: 3480.55, categoria: 'energia', filial: 3 });
  assert.deepStrictEqual(entende('frete 89,90', 2), { valor: 89.9, categoria: 'frete', filial: 2 });
  assert.strictEqual(entende('bom dia pessoal', 1), null, 'sem número é conversa');
  assert.strictEqual(entende('almoço 0', 1), null, 'zero não lança');
});

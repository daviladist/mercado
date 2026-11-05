'use strict';
const test = require('node:test');
const assert = require('node:assert');
const w = require('../../lib/wa');
const T = Date.UTC(2026, 10, 5, 15);   // 05/11/2026, meio-dia em Brasília
test('robô do WhatsApp lê valor, categoria, filial e dia', () => {
  const c = (m, v, cat, fil, dia) => { const r = w.ler(m, T); assert.deepStrictEqual([r.valor, r.categoria, r.filial, r.data], [v, cat, fil, dia], m); };
  c('Éder acabou de colocar R$400 de óleo diesel no caminhão', 400, 'combustivel', null, '2026-11-05');
  c('Manuela abasteceu o Fiat Estrada, R$200', 200, 'combustivel', null, '2026-11-05');
  c('conserto do freezer filial 2 R$ 350 ontem', 350, 'loja', 2, '2026-11-04');
  c('comprei tomate na ceasa 1.250,50 dia 3', 1250.5, 'mercadoria', null, '2026-11-03');
  c('pneu do caminhão 2 mil', 2000, 'veiculo', null, '2026-11-05');
  c('paguei 03/11 frete 300 reais loja 3', 300, 'frete', 3, '2026-11-03');
  c('diesel 80 litros 480', 480, 'combustivel', null, '2026-11-05');
  c('ajudante descarregou a carreta 120', 120, 'pessoal', null, '2026-11-05');
  c('coisa qualquer 50', 50, 'outros', null, '2026-11-05');
  assert.strictEqual(w.valorDe('diesel no caminhão'), null);
});
test('celular do Brasil com e sem o 9', () => {
  assert.deepStrictEqual(w.variantes('5527999991234').sort(), ['552799991234', '5527999991234'].sort());
});

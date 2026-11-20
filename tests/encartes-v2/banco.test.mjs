import test from 'node:test';
import assert from 'node:assert/strict';
import { procurarPorNome, variacoesEan } from '../../public/encartes-v2/banco.js';

const ITENS = [
  { c: '101', e: '7896005800027', d: 'CAFE 3 CORACOES TRADICIONAL 500G' },
  { c: '102', e: '7896005800010', d: 'CAFE 3 CORACOES EXTRA FORTE 500G' },
  { c: '200', e: '', d: 'COXA SOBRECX C/DORSAL KG' },
  { c: '300', e: '7891000100103', d: 'LEITE PO NINHO INTEGRAL 400G' },
  { c: '301', e: '7891000100110', d: 'LEITE PO NINHO INTEGRAL 750G' },
];

test('liga sozinho quando o nome é claro', () => {
  assert.equal(procurarPorNome('Café 3 Corações Tradicional 500g', ITENS).item.c, '101');
});
test('tamanho tem que bater: 400g não liga no de 750g', () => {
  assert.equal(procurarPorNome('Leite Ninho integral 400g', ITENS).item.c, '300');
});
test('dúvida não liga sozinho: mostra candidatos', () => {
  const r = procurarPorNome('Café 3 Corações 500g', ITENS);
  assert.equal(r.item, null);
  assert.ok(r.candidatos.length >= 2);
});
test('código de barras de caixa acha o da unidade', () => {
  assert.ok(variacoesEan('17896534401129').includes('7896534401122'));
});

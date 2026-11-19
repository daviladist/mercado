'use strict';
/* Banco de dados de produtos: limpeza do que entra (código interno, código de barras, valores) e junção de lotes. Sem banco. */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../../lib/banco');

test('código interno: só números perde os zeros da frente; letras viram maiúsculas; lixo é recusado', () => {
  assert.strictEqual(B.cleanCodigo('00123'), '123');
  assert.strictEqual(B.cleanCodigo(' 14489 '), '14489');
  assert.strictEqual(B.cleanCodigo(502), '502');
  assert.strictEqual(B.cleanCodigo('red-01'), 'RED-01');
  for (const ruim of ['', '0', '000', 'a b', '<b>', '../x', 'c:1', 'x'.repeat(31), null, undefined]) assert.strictEqual(B.cleanCodigo(ruim), '', String(ruim));
});

test('código de barras: de 8 a 14 números; pontuação sai; curto, longo ou só zeros não vale', () => {
  assert.strictEqual(B.cleanEan('7894900027013'), '7894900027013');
  assert.strictEqual(B.cleanEan('789.4900-027013'), '7894900027013');
  for (const ruim of ['', '1234567', '123456789012345', '0000000000000', null]) assert.strictEqual(B.cleanEan(ruim), '', String(ruim));
});

test('dígito verificador: EAN-13 e EAN-8 certos passam; errado é apontado; código interno da loja e de balança não são conferidos', () => {
  assert.strictEqual(B.eanRuim('7894900027013'), false);   // Coca-Cola 2 L
  assert.strictEqual(B.eanRuim('7500435154420'), false);
  assert.strictEqual(B.eanRuim('96385074'), false);        // EAN-8
  assert.strictEqual(B.eanRuim('7894900027014'), true);
  assert.strictEqual(B.eanRuim('123456789'), true);        // 9 números: tamanho que não existe
  assert.strictEqual(B.eanRuim('0000000030986'), false);   // código interno com zeros na frente
  assert.strictEqual(B.eanRuim('2012345000000'), false);   // etiqueta de balança
  assert.strictEqual(B.eanRuim(''), false);
});

test('valores: vírgula ou ponto; negativo, texto e absurdo viram vazio', () => {
  assert.strictEqual(B.cleanValor('21,50', 4), 21.5);
  assert.strictEqual(B.cleanValor(10.123456, 4), 10.1235);
  assert.strictEqual(B.cleanValor(0, 4), 0);
  for (const ruim of ['', null, undefined, 'abc', -1, 1e9, NaN, Infinity]) assert.strictEqual(B.cleanValor(ruim, 4), null, String(ruim));
});

test('nome: sem marcação, sem quebra de linha, sem espaço sobrando, até 160 letras', () => {
  assert.strictEqual(B.cleanNome('  <b>Arroz</b>\n 5kg  '), 'Arroz 5kg');
  assert.strictEqual(B.cleanNome('<script>x</script>'), 'x');
  assert.strictEqual(B.cleanNome('a'.repeat(300)).length, 160);
});

test('lote com o mesmo código duas vezes vira um produto só, ficando o primeiro valor preenchido de cada campo', () => {
  const L = B.juntaLote([{ codigo: '1', ean: '', nome: '', custo: null }, { codigo: '1', ean: '7894900027013', nome: 'COCA', custo: 8.5 }, { codigo: '1', ean: '7500435154420', nome: 'OUTRO', custo: 9 }, { codigo: '2', nome: 'B' }]);
  assert.deepStrictEqual(L.map(x => [x.codigo, x.ean, x.nome, x.custo == null ? null : x.custo, x.ean_ruim]), [['1', '7894900027013', 'COCA', 8.5, false], ['2', '', 'B', null, false]]);
});

test('códigos digitados para o pedido: separa por espaço, vírgula ou linha, tira repetido e recusa o que não é código', () => {
  assert.deepStrictEqual(B.termosDe('00950, 7894900027013\n950;501'), ['950', '7894900027013', '501']);
  assert.deepStrictEqual(B.termosDe(['1', 2, ' 1 ']), ['1', '2']);
  assert.deepStrictEqual(B.termosDe(''), []);
  assert.throws(() => B.termosDe('abc def!'), /Código inválido/);
});

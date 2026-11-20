import test from 'node:test';
import assert from 'node:assert/strict';
import { lerLista, lerPreco } from '../../public/encartes-v2/lista.js';

test('preço com vírgula, ponto e R$', () => {
  assert.equal(lerPreco('4,99'), 4.99);
  assert.equal(lerPreco('R$4,99'), 4.99);
  assert.equal(lerPreco('1.299,90'), 1299.9);
  assert.equal(lerPreco('400'), null);
});
test('linha simples e linha com preço do app', () => {
  const { produtos } = lerLista('Arroz Risoto 5kg 15,78\nCoxa e sobrecoxa com dorsal kg 9,79 7,79');
  assert.deepEqual(produtos[0], { nome: 'Arroz Risoto 5kg', preco: 15.78, unidade: 'un' });
  assert.deepEqual(produtos[1], { nome: 'Coxa e sobrecoxa com dorsal', preco: 9.79, unidade: 'kg', precoApp: 7.79 });
});
test('número sem centavos fica no nome', () => {
  const { produtos } = lerLista('Leite Ninho 400 17,99\nCoca-Cola 2L 9,98');
  assert.equal(produtos[0].nome, 'Leite Ninho 400');
  assert.equal(produtos[1].nome, 'Coca-Cola 2L');
});
test('WhatsApp: tracinho, emoji, negrito e R$', () => {
  const { produtos } = lerLista('🔥 *Linguica toscana kg* - R$ 15,98\n• Pao frances kg R$ 12,90');
  assert.equal(produtos[0].nome, 'Linguiça toscana');
  assert.equal(produtos[0].unidade, 'kg');
  assert.equal(produtos[0].preco, 15.98);
  assert.equal(produtos[1].nome, 'Pão francês');
});
test('Excel com tab', () => {
  const { produtos } = lerLista('Feijao Carioca 1kg\t7,49\t6,99');
  assert.deepEqual(produtos[0], { nome: 'Feijão Carioca 1kg', preco: 7.49, unidade: 'un', precoApp: 6.99 });
});
test('preço do app pode vir antes ou depois: o menor é o do app', () => {
  const { produtos } = lerLista('Cafe 500g 16,99 17,99');
  assert.equal(produtos[0].preco, 17.99);
  assert.equal(produtos[0].precoApp, 16.99);
});
test('linha sem preço não some calada', () => {
  const r = lerLista('Arroz 5kg\nFeijão 1kg 7,49\n\n');
  assert.deepEqual(r.semPreco, ['Arroz 5kg']);
  assert.equal(r.produtos.length, 1);
});
test('leve vários liga a cascata', () => {
  const { produtos } = lerLista('Cerveja Brahma lata 350ml c/ 12 39,90\nKit 3 sabonetes 5,99\nSabonete 85g 2,39');
  assert.equal(produtos[0].repetir, true);
  assert.equal(produtos[1].repetir, true);
  assert.equal(produtos[2].repetir, undefined);
});

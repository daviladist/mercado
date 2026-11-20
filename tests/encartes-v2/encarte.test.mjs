import test from 'node:test';
import assert from 'node:assert/strict';
import { novoEncarte, colarLista, paginas, travar, destravar, alternarDestaque, conferir } from '../../public/encartes-v2/encarte-dados.js';

const modelo = { id: 'm1', dias: [6], porPagina: { capa: 3, verso: 4 }, maxDestaques: 2 };
const lista = Array.from({ length: 9 }, (_, i) => `Produto ${String.fromCharCode(65 + i)} 1${i},99`).join('\n');

test('colar a lista cria os produtos e a validade vem do modelo', () => {
  const e = novoEncarte(modelo, new Date(2026, 10, 20));
  const r = colarLista(e, lista + '\nSem preço');
  assert.equal(r.novos, 9);
  assert.deepEqual(r.semPreco, ['Sem preço']);
  assert.deepEqual(e.validade, { ini: '2026-11-21', fim: '2026-11-21' });
});
test('capa com 3 e versos com 4', () => {
  const e = novoEncarte(modelo); colarLista(e, lista);
  assert.deepEqual(paginas(e, modelo).map(p => p.produtos.length), [3, 4, 2]);
});
test('máximo de destaques do modelo', () => {
  const e = novoEncarte(modelo); colarLista(e, lista);
  const [a, b, c] = e.produtos;
  assert.equal(alternarDestaque(e, a.id, modelo), true);
  assert.equal(alternarDestaque(e, b.id, modelo), true);
  assert.equal(alternarDestaque(e, c.id, modelo), false);
});
test('cadeado: página travada não muda quando entra produto novo', () => {
  const e = novoEncarte(modelo); colarLista(e, lista);
  const antes = paginas(e, modelo).map(p => p.produtos.map(x => x.nome));
  travar(e, modelo, 0);
  colarLista(e, 'Novo destaque 1,99');
  alternarDestaque(e, e.produtos.at(-1).id, modelo);
  const depois = paginas(e, modelo);
  assert.deepEqual(depois[0].produtos.map(x => x.nome), antes[0]);
  assert.equal(depois[0].travada, true);
  assert.equal(depois[1].produtos[0].nome, 'Novo destaque');   // destaque novo vai para a próxima página
  destravar(e, 0);
  assert.equal(paginas(e, modelo)[0].produtos[0].nome, 'Novo destaque');
});
test('trava some sozinha se a lista trocou', () => {
  const e = novoEncarte(modelo); colarLista(e, lista); travar(e, modelo, 0);
  e.produtos = []; colarLista(e, 'Outro 2,99');
  assert.equal(paginas(e, modelo)[0].travada, false);
});
test('conferir: só dinheiro e data travam; banco e foto só avisam', () => {
  const e = novoEncarte(modelo); colarLista(e, 'Arroz 5kg 19,90\nFeijão 7,49');
  e.produtos[1].precoApp = 8.0;           // com app maior que sem app
  let r = conferir(e);
  assert.equal(r.podeBaixar, false);
  assert.equal(r.trava.length, 1);
  e.produtos[1].precoApp = 6.99;
  e.produtos[0].banco = { precoMinimo: 21, fotoBanco: 'x' };
  r = conferir(e);
  assert.equal(r.podeBaixar, true);
  assert.ok(r.avisa.some(a => /preço mínimo/.test(a.msg)));
});

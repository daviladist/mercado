// node --test tests/encartes-v2/
import test from 'node:test';
import assert from 'node:assert/strict';
import { campanhasDoDia, oQueFalta, textoDias, TODOS } from '../../public/encartes-v2/campanhas.js';
import { montarLinhas, paginar } from '../../public/encartes-v2/arte/diagrama.js';

const segTer = { nome: 'Segunda e Terça', dias: [1, 2], cabecalho: 'x' };
const quarta = { nome: 'Quarta Imbatível', dias: [3], cabecalho: 'x' };
const relampago = { nome: 'Oferta Relâmpago', dias: [TODOS], cabecalho: 'x' };
const L = [segTer, quarta, relampago];

test('filtro de segunda mostra segunda e terça + todos os dias', () => {
  assert.deepEqual(campanhasDoDia(L, 1).map(c => c.nome), ['Segunda e Terça', 'Oferta Relâmpago']);
});
test('filtro de terça também mostra a campanha de segunda e terça', () => {
  assert.deepEqual(campanhasDoDia(L, 2).map(c => c.nome), ['Segunda e Terça', 'Oferta Relâmpago']);
});
test('filtro de quarta', () => {
  assert.deepEqual(campanhasDoDia(L, 3).map(c => c.nome), ['Quarta Imbatível', 'Oferta Relâmpago']);
});
test('sem filtro mostra todas', () => assert.equal(campanhasDoDia(L, null).length, 3));
test('campanha sem dia, nome ou cabeçalho não pode ser liberada', () => {
  assert.deepEqual(oQueFalta({ nome: '', dias: [], cabecalho: null }), ['nome da campanha', 'dias da semana', 'cabeçalho']);
  assert.deepEqual(oQueFalta(segTer), []);
});
test('texto dos dias', () => {
  assert.equal(textoDias(segTer), 'Seg e Ter');
  assert.equal(textoDias({ dias: [5, 1, 3] }), 'Seg, Qua e Sex');
  assert.equal(textoDias(relampago), 'Todos os dias');
});

const P = (n, d = false) => Array.from({ length: n }, (_, i) => ({ nome: 'p' + i, destaque: d }));
test('nunca sobra produto sozinho numa linha', () => {
  for (let n = 2; n <= 24; n++) for (const est of ['cards', 'quadros']) {
    const linhas = montarLinhas(P(n), est).filter(l => l.tipo === 'normal');
    if (linhas.length > 1) assert.ok(linhas.every(l => l.itens.length >= 2), `n=${n} ${est}`);
  }
});
test('produtos por página: destaques primeiro e ninguém se perde', () => {
  const lista = [...P(7), ...P(3, true)];
  const pags = paginar(lista, 4);
  assert.equal(pags.flat().length, 10);
  assert.ok(pags[0].every(p => p.destaque) === false && pags[0].slice(0, 3).every(p => p.destaque));
  assert.deepEqual(pags.map(p => p.length), [4, 4, 2]);
  assert.deepEqual(paginar(P(30), 10, 16).map(p => p.length), [10, 16, 4]);
});

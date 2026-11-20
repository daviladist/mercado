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

import { validadePadrao, textoValidade, duplicarCampanha } from '../../public/encartes-v2/campanhas.js';
const sexta = new Date(2026, 10, 20);   // sexta, 20/11/2026
test('validade: campanha de sábado numa sexta = amanhã', () => {
  assert.deepEqual(validadePadrao({ dias: [6] }, sexta), { ini: '2026-11-21', fim: '2026-11-21' });
  assert.equal(textoValidade(validadePadrao({ dias: [6] }, sexta)), 'Ofertas válidas apenas dia 21/11');
});
test('validade: segunda e terça vira o bloco de dois dias', () => {
  assert.deepEqual(validadePadrao({ dias: [1, 2] }, sexta), { ini: '2026-11-23', fim: '2026-11-24' });
  assert.equal(textoValidade(validadePadrao({ dias: [1, 2] }, sexta)), 'Ofertas válidas de 23/11 a 24/11');
});
test('validade: campanha de hoje é hoje; todos os dias é hoje', () => {
  assert.deepEqual(validadePadrao({ dias: [5] }, sexta), { ini: '2026-11-20', fim: '2026-11-20' });
  assert.deepEqual(validadePadrao({ dias: [TODOS] }, sexta), { ini: '2026-11-20', fim: '2026-11-20' });
});
test('duplicar muda id e nome e não mexe na original', () => {
  const o = { id: 'a', nome: 'Quarta', dias: [3], cores: { fundo: '#000' } };
  const d = duplicarCampanha(o);
  assert.notEqual(d.id, 'a'); assert.equal(d.nome, 'Quarta (cópia)');
  d.cores.fundo = '#fff'; assert.equal(o.cores.fundo, '#000');
});

import { modelosDaEquipe, podeMarcarDestaque } from '../../public/encartes-v2/campanhas.js';
test('modelo pausado ou incompleto não aparece para a equipe', () => {
  const L2 = [{ ...quarta }, { ...quarta, nome: 'Pausado', pausado: true }, { nome: 'Sem cabeçalho', dias: [3] }];
  assert.deepEqual(modelosDaEquipe(L2, 3).map(c => c.nome), ['Quarta Imbatível']);
});
test('máximo de destaques do modelo trava a equipe', () => {
  const m = { maxDestaques: 2 };
  assert.equal(podeMarcarDestaque([{ destaque: true }, {}], m), true);
  assert.equal(podeMarcarDestaque([{ destaque: true }, { destaque: true }], m), false);
});

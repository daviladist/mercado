'use strict';
/* Voz dos vídeos: regras que não precisam de banco (pedido, custo, cache). */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../../lib/encartes-voz');

test('fala é limpa e o custo segue o modelo', () => {
  const q = V.pedido({ texto: '  Picanha\n bovina,   49 e 90  ' });
  assert.strictEqual(q.texto, 'Picanha bovina, 49 e 90');
  assert.strictEqual(q.voz, V.VOZ_PADRAO);
  assert.strictEqual(q.modelo, V.MODELO_PADRAO);
  assert.strictEqual(q.cred, q.texto.length);
  assert.strictEqual(V.pedido({ texto: 'abcd', modelo: 'eleven_flash_v2_5' }).cred, 2);
});
test('mesma fala, mesma voz e mesmo modelo = mesmo arquivo (não paga duas vezes)', () => {
  const a = V.pedido({ texto: 'Arroz 5 quilos' }), b = V.pedido({ texto: ' Arroz  5 quilos ' });
  assert.strictEqual(a.id, b.id);
  assert.notStrictEqual(a.id, V.pedido({ texto: 'Arroz 5 quilos', modelo: 'eleven_flash_v2_5' }).id);
  assert.notStrictEqual(a.id, V.pedido({ texto: 'Arroz 5 quilos', voz: 'zhza6dIY7yb1xz5MKTvQ' }).id);
  assert.match(a.id, /^[a-f0-9]{32}$/);
});
test('pedido estranho é recusado', () => {
  assert.throws(() => V.pedido({ texto: '' }), /vazia/);
  assert.throws(() => V.pedido({ texto: 'x'.repeat(V.MAX_TXT + 1) }), /longa/);
  assert.throws(() => V.pedido({ texto: 'oi', voz: '../../x' }), /Voz/);
  assert.throws(() => V.pedido({ texto: 'oi', modelo: 'eleven_v3_caro' }), /Modelo/);
});
test('funcionário não gera voz', async () => {
  await assert.rejects(V.handle({ method: 'POST', user: { role: 'caixista' }, tid: 't', body: async () => ({ texto: 'oi' }) }), /administrador/);
});
test('mês do uso', () => { assert.strictEqual(V.mesAtual(new Date('2026-11-17T12:00:00Z')), '2026-11'); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { medidaDoNome, precoPorMedida, registrar, vencidas, vencemHoje, conferirGondola } from '../../public/encartes-v2/plaquinhas-dados.js';

test('medida no nome', () => {
  assert.deepEqual(medidaDoNome('Café 3 Corações 500g'), { quantidade: 0.5, base: 'kg' });
  assert.deepEqual(medidaDoNome('Coca-Cola 2L'), { quantidade: 2, base: 'L' });
  assert.equal(medidaDoNome('Cerveja Brahma 350ml c/ 12').quantidade.toFixed(2), '4.20');
  assert.equal(medidaDoNome('Sabonete Lux'), null);
});
test('preço por kg ou litro (usa o preço do app quando tem)', () => {
  assert.deepEqual(precoPorMedida({ nome: 'Café 500g', preco: 17.98 }), { valor: 35.96, base: 'kg' });
  assert.deepEqual(precoPorMedida({ nome: 'Leite 500ml', preco: 4.99, precoApp: 4.49 }), { valor: 8.98, base: 'L' });
  assert.equal(precoPorMedida({ nome: 'Leite 1L', preco: 4.99 }), null);
  assert.equal(precoPorMedida({ nome: 'Coxa', preco: 9.79, unidade: 'kg' }), null);
});
test('registro das impressas e vencidas', () => {
  let r = [];
  r = registrar(r, [{ id: 'a', nome: 'Café', preco: 17.98, validade: '2026-11-20' }, { id: 'b', nome: 'Arroz', preco: 15.78, validade: '2026-11-22' }], 1);
  const hoje = new Date(2026, 10, 21);
  assert.deepEqual(vencidas(r, hoje).map(x => x.nome), ['Café']);
  assert.deepEqual(vencemHoje(r, new Date(2026, 10, 22)).map(x => x.nome), ['Arroz']);
  r[0].retirada = true;
  assert.equal(vencidas(r, hoje).length, 0);
});
test('gôndola x sistema: acusa preço diferente do caixa', () => {
  const r = registrar([], [{ id: 'a', nome: 'Café', preco: 17.98, validade: '2026-11-30', banco: { codigo: '101' } }, { id: 'b', nome: 'Arroz', preco: 15.78, validade: '2026-11-30', banco: { codigo: '200' } }], 1);
  const sistema = { 101: 17.98, 200: 19.9 };
  const dif = conferirGondola(r, x => sistema[x.codigo] ?? null, new Date(2026, 10, 21));
  assert.deepEqual(dif.map(x => [x.nome, x.precoSistema]), [['Arroz', 19.9]]);
});

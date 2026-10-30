// O catálogo que o caixa guarda no aparelho (src/pdv.js) tem de usar os mesmos cortes de lib/policy.js.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const pol = fs.readFileSync(path.join(__dirname, '../../lib/policy.js'), 'utf8');
const pdv = fs.readFileSync(path.join(__dirname, '../../src/pdv.js'), 'utf8');
const arr = (src, re) => { const m = src.match(re); assert.ok(m, 'lista não encontrada: ' + re); return JSON.stringify(eval(m[1])); };
test('produto guardado no caixa sai sem os mesmos campos secretos do servidor', () => {
  assert.strictEqual(arr(pdv, /const PDV_P_SECRET=(\[[^\]]*\])/), arr(pol, /const P_SECRET = (\[[^\]]*\])/));
});
test('loja guardada no caixa só com os campos públicos', () => {
  assert.strictEqual(arr(pdv, /const PDV_STORE_PUBLIC=(\[[^\]]*\])/), arr(pol, /const STORE_PUBLIC = (\[[^\]]*\])/));
});
test('cliente guardado no caixa só com os campos do operador', () => {
  assert.strictEqual(arr(pdv, /const PDV_CLI_KEYS=(\[[^\]]*\])/), arr(pol, /operador_caixa: (\[[^\]]*\])/));
});
test('snapshot usa o recorte, não o estado inteiro', () => {
  assert.match(pdv, /S:pdvSnapCut\(\)/);
});

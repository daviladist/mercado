'use strict';
/* Gerador de Encartes: o início do app tem que rodar depois de TODO o arquivo.
   Em 19/11 o início ficou no meio do app.js e chamava renderCamps()/render() antes de
   const TEMA_NOMES, temaCor e PLAQ_TAM existirem: o app abria em branco e nada baixava. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'encartes', 'app.js'), 'utf8');

test('encartes: inicio() existe uma vez e é a última instrução do app.js', () => {
  assert.strictEqual((src.match(/^function inicio\(\)\{/gm) || []).length, 1, 'function inicio(){ no começo da linha, uma vez só');
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.trim()).filter(Boolean);
  assert.strictEqual(codigo[codigo.length - 1], 'inicio();', 'a chamada inicio(); tem que ser a última linha de código');
});


'use strict';
/* Rede de segurança do banco: o schema.sql é dividido certo e nenhuma consulta esquece a empresa. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { statements } = require('../../lib/schema');
const ROOT = path.join(__dirname, '..', '..');

test('schema.sql: cada comando é UM comando (nada colado no anterior por falta de ";")', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'lib/schema.sql'), 'utf8');
  assert.ok(sql.trimEnd().endsWith(';'), 'o último comando precisa terminar com ";"');
  for (const st of statements(sql)) {
    assert.match(st, /^(create|alter|insert|drop|do|select|update)\b/i, 'comando estranho: ' + st.slice(0, 60));
    const rest = st.split('\n').slice(1).join('\n');
    assert.doesNotMatch(rest, /^\s*(create|alter|insert|drop|do)\s/im, 'dois comandos colados: ' + st.slice(0, 60));
    if (/^do\b/i.test(st)) assert.match(st, /\$\$\s*$/, 'bloco do $$ precisa estar inteiro numa linha: ' + st.slice(0, 60));
  }
});

test('toda consulta em docs_t e photos_t filtra/grava a empresa (tenant_id)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js') && f !== 'core.generated.js');
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
    // pega cada texto SQL entre crases/aspas que mexe em docs ou photos
    const re = /(`[^`]*`|'[^'\n]*')/g; let m;
    while ((m = re.exec(src))) {
      const q = m[1];
      if (!/\b(from|into|update|join)\s+(docs|photos)(_t)?\b/i.test(q)) continue;
      if (/tenant_id/.test(q)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(f + ':' + line + '  ' + q.slice(0, 80).replace(/\s+/g, ' '));
    }
  }
  assert.deepStrictEqual(bad, [], 'consulta sem empresa:\n' + bad.join('\n'));
});

test('nenhuma consulta usa os nomes antigos das tabelas (users/docs/photos sem _t)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js') && f !== 'core.generated.js');
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
    const re = /(`[^`]*`|'[^'\n]*')/g; let m;
    while ((m = re.exec(src))) if (/\b(from|into|update|join)\s+(users|docs|photos)\b(?!_)/i.test(m[1])) bad.push(f + ': ' + m[1].slice(0, 70));
  }
  assert.deepStrictEqual(bad, []);
});

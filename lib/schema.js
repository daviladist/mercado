'use strict';
/* Cria as tabelas se ainda não existirem (roda sozinho na primeira requisição). */
const fs = require('fs');
const path = require('path');
const db = require('./pg');
let ready = null;
function statements() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  return sql.split(/;\s*(?:\n|$)/).map(x => x.trim()).filter(Boolean);
}
function ensureSchema() {
  if (!ready) ready = (async () => { for (const st of statements()) await db.query(st); })().catch(e => { ready = null; throw e; });
  return ready;
}
module.exports = { ensureSchema };

'use strict';
/*
 * Cria/atualiza as tabelas (roda sozinho na primeira requisição de cada servidor).
 * - Tudo numa transação só, com trava: dois servidores subindo juntos não se atropelam,
 *   e uma atualização que falhar no meio volta inteira (o banco nunca fica pela metade).
 * - Guarda a "impressão digital" do schema.sql aplicado: se nada mudou, não roda nada
 *   (sem travar tabelas a cada início de servidor).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./pg');
let ready = null;
function source() { return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'); }
function statements(sql) {
  return sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map(x => x.trim()).filter(Boolean);
}
async function migrate() {
  const sql = source();
  const hash = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
  // caminho rápido: já aplicado (consulta simples, sem trava)
  try {
    const r = await db.query('select hash from schema_version where id=1');
    if (r.rows[0] && r.rows[0].hash === hash) return;
  } catch (e) { if (e.code !== '42P01') throw e; } // tabela ainda não existe
  await db.tx(async t => {
    await t.query('select pg_advisory_xact_lock(731107)');
    await t.query('create table if not exists schema_version (id int primary key, hash text not null, at timestamptz not null default now())');
    const r = await t.query('select hash from schema_version where id=1');
    if (r.rows[0] && r.rows[0].hash === hash) return; // outro servidor acabou de aplicar
    for (const st of statements(sql)) await t.query(st);
    await t.query('insert into schema_version(id,hash) values(1,$1) on conflict(id) do update set hash=excluded.hash, at=now()', [hash]);
  });
}
function ensureSchema() {
  if (!ready) ready = migrate().catch(e => { ready = null; throw e; });
  return ready;
}
module.exports = { ensureSchema, statements };

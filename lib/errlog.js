'use strict';
/* Registro de erros inesperados do servidor para o painel da Central.
   Guarda só o necessário para achar o problema (empresa, rota, mensagem, lugar no código) e tira da mensagem
   números longos (CPF/CNPJ/telefone), e-mails e textos entre aspas longos. Nunca derruba a resposta. */
const db = require('./pg');
const KEEP = 500;
function clean(msg) {
  return String(msg == null ? '' : msg).split('\n')[0]
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .replace(/\d[\d.\-/]{4,}\d/g, '[número]')
    .replace(/"([^"]{25,})"/g, '"[texto]"').replace(/'([^']{25,})'/g, "'[texto]'")
    .slice(0, 300) || 'Erro sem mensagem';
}
function placeOf(e) {
  const m = /(lib\/[\w.-]+\.js:\d+)/.exec(String(e && e.stack || ''));
  return m ? m[1] : null;
}
function routeOf(path) { return String(path || '').replace(/^(\/api\/photo\/).*/, '$1…').replace(/[^\w/.-]/g, '').slice(0, 80) || '?'; }
async function logError(tid, path, e) {
  try {
    const route = routeOf(path), message = clean(e && e.message || e), place = placeOf(e);
    const u = await db.query(`update server_errors set n=n+1, last_at=now() where id=(select id from server_errors where not seen and tenant_id is not distinct from $1 and route=$2 and message=$3
      and last_at>now()-interval '1 day' order by id desc limit 1) returning id`, [tid || null, route, message]);
    if (!u.rows.length) {
      await db.query('insert into server_errors(tenant_id,route,message,place) values($1,$2,$3,$4)', [tid || null, route, message, place]);
      await db.query(`delete from server_errors where id <= (select max(id) from server_errors) - ${KEEP}`);
    }
  } catch (x) { console.error('registro de erro falhou:', x.message); }
}
async function list() {
  const r = await db.query(`select e.id, e.at, e.last_at, e.n, e.tenant_id, t.name as tenant, e.route, e.message, e.place, e.seen
    from server_errors e left join tenants t on t.id=e.tenant_id order by e.seen, e.last_at desc limit 200`);
  const c = await db.query('select count(*)::int as n from server_errors where not seen');
  return { errors: r.rows, unseen: c.rows[0].n };
}
async function unseen() { return (await db.query('select count(*)::int as n from server_errors where not seen')).rows[0].n; }
async function markSeen(b) {
  if (b && b.all === true) await db.query('update server_errors set seen=true where not seen');
  else { const ids = (Array.isArray(b && b.ids) ? b.ids : []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0).slice(0, 500);
    if (ids.length) await db.query('update server_errors set seen=true where id in (select (jsonb_array_elements_text($1::jsonb))::bigint)', [JSON.stringify(ids)]); }
  return unseen();
}
module.exports = { logError, list, unseen, markSeen, clean };

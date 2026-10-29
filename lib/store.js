'use strict';
/*
 * Guarda o estado do app no banco: uma linha por registro (docs), fotos à parte,
 * e usuários/senhas na tabela users (as senhas NUNCA ficam dentro dos registros).
 */
const crypto = require('crypto');
const db = require('./pg');
const { hashPassword, passwordProblem, basePasswordProblem } = require('./auth');

// coleções com "id" (uma linha por item)
const COLLS = ['products', 'customers', 'orders', 'receivables', 'payables', 'sellers', 'checkers', 'billers', 'vehicles',
  'cities', 'categories', 'combos', 'counts', 'commPayouts', 'trips', 'romaneios', 'admins', 'suppliers', 'receipts'];
// coleções cuja ordem o administrador escolhe (guardamos a posição)
const ORDERED = new Set(['suppliers', 'products', 'customers', 'sellers', 'checkers', 'billers', 'vehicles', 'cities', 'categories', 'combos', 'admins', 'payables', 'receivables']);
// cadastro de pessoas -> papel de login
const USER_COLLS = { admins: 'admin', customers: 'cliente', sellers: 'vendedor', checkers: 'conferente', billers: 'faturamento', vehicles: 'entregador' };
const ROLE_COLL = Object.fromEntries(Object.entries(USER_COLLS).map(([c, r]) => [r, c]));

const short = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const uid = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 7).toLowerCase() || 'x' + Date.now().toString(36);

async function loadAll(only) {
  // only: carrega só algumas coleções (consultas leves, como a trava do vendedor)
  const r = only ? await db.query(`select coll,id,data,ver,ord from docs where coll='meta' or coll = any($1::text[]) order by ord nulls last, updated_at`, ['{' + only.join(',') + '}'])
    : await db.query('select coll,id,data,ver,ord from docs order by ord nulls last, updated_at');
  const S = {}, V = {};
  COLLS.forEach(c => { S[c] = []; V[c] = {}; });
  V.meta = {};
  const ord = {};
  for (const row of r.rows) {
    if (row.coll === 'meta') { S[row.id] = row.data; V.meta[row.id] = row.ver; continue; }
    if (!S[row.coll]) { S[row.coll] = []; V[row.coll] = {}; }
    S[row.coll].push(row.data); V[row.coll][row.id] = row.ver;
  }
  S.orders.sort((a, b) => (Number(b.no) || 0) - (Number(a.no) || 0));
  const seq = await db.query(`select last_value, is_called from order_no`);
  const s = seq.rows[0];
  S.seq = s ? Number(s.last_value) + (s.is_called ? 1 : 0) : 1001;
  // quem tem senha cadastrada (sem a senha)
  const u = await db.query('select role, ref_id, login, must_reset, active from users where pass_hash is not null');
  const has = {};
  u.rows.forEach(x => { has[x.role + ':' + x.ref_id] = x; });
  Object.entries(USER_COLLS).forEach(([c, role]) => (S[c] || []).forEach(d => {
    const x = has[role + ':' + d.id]; d.hasPass = !!x; d.mustReset = !!(x && x.must_reset); delete d.pass;
  }));
  return { S, V };
}

/* tira fotos grandes de dentro do registro e guarda à parte */
async function extractPhotos(q, coll, doc) {
  const isData = v => typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v);
  if (coll === 'products' && isData(doc.photo)) {
    if (doc.photo.length > 3 * 1024 * 1024) throw httpErr(413, 'Foto do produto grande demais.');
    const id = 'p:' + doc.id + ':' + short(doc.photo);
    await q(`insert into photos(id,data) values($1,$2) on conflict(id) do nothing`, [id, doc.photo]);
    doc.photo = '/api/photo/' + encodeURIComponent(id);
  }
  if (coll === 'orders' && doc.delivered && isData(doc.delivered.photo)) {
    if (doc.delivered.photo.length > 3 * 1024 * 1024) throw httpErr(413, 'Foto do canhoto grande demais.');
    const id = 'o:' + doc.id + ':' + short(doc.delivered.photo);
    await q(`insert into photos(id,data) values($1,$2) on conflict(id) do nothing`, [id, doc.delivered.photo]);
    doc.delivered.photo = '/api/photo/' + encodeURIComponent(id);
  }
}

/* cadastro de pessoa gravado pelo administrador -> usuário de login (senha vira hash) */
async function syncUser(q, coll, doc, opts = {}) {
  const role = USER_COLLS[coll];
  if (!role) return;
  const pass = doc.pass; delete doc.pass; delete doc.hasPass; delete doc.mustReset;
  const login = String(doc.login || '').trim().toLowerCase();
  const digits = coll === 'customers' ? String(doc.doc || '').replace(/\D/g, '') : '';
  if (!login && !digits) { await q('delete from users where role=$1 and ref_id=$2', [role, doc.id]); return; }
  const lg = login || digits;
  const clash = await q('select ref_id from users where login=$1 and not (role=$2 and ref_id=$3)', [lg, role, doc.id]);
  if (clash.rows.length) throw httpErr(400, `O usuário "${lg}" já é usado por outra pessoa. Escolha outro.`);
  const active = doc.active !== false && doc.blocked !== true;
  const name = doc.name || doc.driver || doc.login || '';
  let hash = null, must = true;
  if (pass) {
    if (!opts.skipPolicy) { const prob = opts.base ? basePasswordProblem(pass, lg) : passwordProblem(pass, lg, role); if (prob) throw httpErr(400, (name ? name + ': ' : '') + prob); }
    hash = await hashPassword(pass);
    must = opts.mustReset !== false;
  }
  await q(`insert into users(role,login,doc,ref_id,name,pass_hash,must_reset,active) values($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict(role,ref_id) do update set login=excluded.login, doc=excluded.doc, name=excluded.name, active=excluded.active,
      pass_hash=coalesce(excluded.pass_hash, users.pass_hash), must_reset=case when excluded.pass_hash is null then users.must_reset else excluded.must_reset end,
      updated_at=now()`, [role, lg, digits || null, doc.id, name, hash, must, active]);
  if (!active || pass) await q('delete from sessions where user_id in (select id from users where role=$1 and ref_id=$2)', [role, doc.id]);
}

const J = v => JSON.stringify(v === undefined ? null : v);
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

/* grava um conjunto de mudanças já validadas, com conferência de versão (ninguém sobrescreve o trabalho do outro sem saber) */
async function writeChanges(q, changes) {
  const out = [];
  for (const ch of changes) {
    if (ch.op === 'del') {
      const r = await q('delete from docs where coll=$1 and id=$2' + (ch.ver ? ' and ver=$3' : ''), ch.ver ? [ch.c, ch.id, ch.ver] : [ch.c, ch.id]);
      if (ch.ver && !r.rowCount) throw Object.assign(httpErr(409, 'Outra pessoa alterou este registro antes. Atualizando a tela.'), { retry: true });
      if (USER_COLLS[ch.c]) await q('delete from users where role=$1 and ref_id=$2', [USER_COLLS[ch.c], ch.id]);
      out.push({ c: ch.c, id: ch.id, op: 'del' });
      continue;
    }
    if (ch.c !== 'meta') await extractPhotos(q, ch.c, ch.doc);
    if (USER_COLLS[ch.c] && ch.syncUser) await syncUser(q, ch.c, ch.doc, ch.userOpts || {});
    let r;
    if (ch.ver) {
      r = await q(`update docs set data=$3, ver=ver+1, updated_at=now()${ch.ord != null ? ', ord=$5' : ''} where coll=$1 and id=$2 and ver=$4 returning ver`,
        ch.ord != null ? [ch.c, ch.id, J(ch.doc), ch.ver, ch.ord] : [ch.c, ch.id, J(ch.doc), ch.ver]);
      if (!r.rowCount) throw Object.assign(httpErr(409, 'Outra pessoa alterou este registro antes. Atualizando a tela.'), { retry: true });
    } else {
      r = await q(`insert into docs(coll,id,data,ord) values($1,$2,$3,$4) on conflict(coll,id) do nothing returning ver`, [ch.c, ch.id, J(ch.doc), ch.ord != null ? ch.ord : null]);
      if (!r.rowCount) throw httpErr(409, 'Esse registro já existe. Atualizando a tela.');
    }
    out.push({ c: ch.c, id: ch.id, op: 'put', doc: ch.doc, ver: r.rows[0].ver });
  }
  return out;
}

async function setOrder(q, coll, ids) {
  if (!ORDERED.has(coll) || !Array.isArray(ids)) return;
  await q(`update docs d set ord=x.n from jsonb_array_elements_text($2::jsonb) with ordinality as x(id,n) where d.coll=$1 and d.id=x.id`, [coll, JSON.stringify(ids)]);
}

/*
 * Importa um backup inteiro (migração do protótipo, ou "Restaurar" do administrador).
 * Senhas em texto puro do arquivo viram hash e ficam marcadas para TROCA OBRIGATÓRIA.
 */
async function importBackup(S, opts = {}) {
  if (!S || !Array.isArray(S.products)) throw httpErr(400, 'Arquivo de backup inválido.');
  const stats = { docs: 0, users: 0, photos: 0, senhasConvertidas: 0 };
  await db.tx(async t => {
    const q = (a, b) => t.query(a, b);
    if (opts.replace !== false) { await q('delete from docs'); }
    if (Array.isArray(S.admins)) S.admins.forEach(a => { if (!a.id) a.id = 'adm_' + short(String(a.login || uid())); });
    for (const [k, v] of Object.entries(S)) {
      if (k === 'seq' || k === '_seed' || k === 'admin') continue;
      if (COLLS.includes(k) && Array.isArray(v)) {
        let n = 0;
        for (const d of v) {
          if (!d || typeof d !== 'object') continue;
          if (!d.id) d.id = uid();
          const doc = JSON.parse(JSON.stringify(d));
          await extractPhotos(q, k, doc);
          if (USER_COLLS[k]) {
            // senhas antigas (texto puro) NÃO são aproveitadas por padrão: estavam no arquivo e devem ser tratadas como vazadas
            if (!opts.importPasswords || (opts.keepAdmin && k === 'admins' && doc.id === opts.keepAdmin.ref_id)) delete doc.pass;
            if (doc.pass) stats.senhasConvertidas++;
            await syncUser(q, k, doc, { skipPolicy: true, mustReset: true });
            if (doc.login || doc.doc) stats.users++;
          }
          await q(`insert into docs(coll,id,data,ord) values($1,$2,$3,$4) on conflict(coll,id) do update set data=excluded.data, ver=docs.ver+1, ord=excluded.ord, updated_at=now()`,
            [k, doc.id, J(doc), ORDERED.has(k) ? n : null]);
          n++; stats.docs++;
        }
      } else {
        await q(`insert into docs(coll,id,data) values('meta',$1,$2) on conflict(coll,id) do update set data=excluded.data, ver=docs.ver+1, updated_at=now()`, [k, J(v)]);
        stats.docs++;
      }
    }
    if (opts.keepAdmin) {
      const A = opts.keepAdmin;
      const has = await q(`select 1 from docs where coll='admins' and id=$1`, [A.ref_id]);
      if (!has.rows.length) await q(`insert into docs(coll,id,data) values('admins',$1,$2)`, [A.ref_id, J({ id: A.ref_id, login: A.login, name: A.name })]);
    }
    // acessos de pessoas que não existem mais no cadastro deixam de entrar
    for (const [c, role] of Object.entries(USER_COLLS)) {
      await q(`delete from users u where u.role=$1 and not exists (select 1 from docs d where d.coll=$2 and d.id=u.ref_id)`, [role, c]);
    }
    const maxNo = Math.max(1000, ...(S.orders || []).map(o => Number(o.no) || 0), (Number(S.seq) || 1001) - 1);
    await q(`select setval('order_no', $1)`, [maxNo]);
    const ph = await q('select count(*)::int as n from photos');
    stats.photos = ph.rows[0].n;
  });
  return stats;
}

/* backup completo para o administrador: com fotos, SEM senhas nem hashes */
async function exportBackup() {
  const { S } = await loadAll();
  const ph = await db.query('select id,data from photos');
  const P = Object.fromEntries(ph.rows.map(r => ['/api/photo/' + encodeURIComponent(r.id), r.data]));
  S.products.forEach(p => { if (P[p.photo]) p.photo = P[p.photo]; });
  S.orders.forEach(o => { if (o.delivered && P[o.delivered.photo]) o.delivered.photo = P[o.delivered.photo]; });
  Object.keys(USER_COLLS).forEach(c => (S[c] || []).forEach(d => { delete d.hasPass; delete d.mustReset; delete d.pass; }));
  return S;
}

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPassword() { const b = crypto.randomBytes(12); let p = ''; for (let i = 0; i < 10; i++) p += ALPHA[b[i] % ALPHA.length]; return p.slice(0, 5) + '-' + p.slice(5); }
async function tempPasswords() {
  const r = await db.query(`select id, role, login, name from users where pass_hash is null and active and role<>'admin' order by role, name`);
  const list = [];
  for (const u of r.rows) {
    const pass = tempPassword();
    await db.query('update users set pass_hash=$1, must_reset=true, updated_at=now() where id=$2 and pass_hash is null', [await hashPassword(pass), u.id]);
    list.push({ role: u.role, name: u.name, login: u.login, pass });
  }
  return list;
}
async function needsSetup() { const r = await db.query(`select count(*)::int as n from users where role='admin' and pass_hash is not null`); return r.rows[0].n === 0; }
async function setupAdmin(name, login, pass) {
  const lg = String(login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(lg)) throw httpErr(400, 'Usuário: use de 3 a 40 letras, números, ponto ou traço.');
  const prob = passwordProblem(pass, lg, 'admin'); if (prob) throw httpErr(400, prob);
  const id = 'adm_' + short(lg);
  await db.tx(async t => {
    const q = (a, b) => t.query(a, b);
    const r = await q(`select count(*)::int as n from users where role='admin' and pass_hash is not null`);
    if (r.rows[0].n > 0) throw httpErr(409, 'O administrador já foi criado.');
    await q(`insert into docs(coll,id,data) values('admins',$1,$2) on conflict(coll,id) do update set data=excluded.data`, [id, J({ id, login: lg, name: String(name || lg).slice(0, 80) })]);
    await q(`insert into users(role,login,ref_id,name,pass_hash,must_reset) values('admin',$1,$2,$3,$4,false)
      on conflict(role,ref_id) do update set login=excluded.login, pass_hash=excluded.pass_hash, must_reset=false, active=true`, [lg, id, String(name || lg).slice(0, 80), await hashPassword(pass)]);
  });
  return (await db.query(`select * from users where role='admin' and ref_id=$1`, [id])).rows[0];
}
/* administrador redefine a senha de alguém: nova senha base, sessões encerradas, troca obrigatória no próximo acesso */
async function resetPassword(coll, id, pass) {
  if (!USER_COLLS[coll] || coll === 'admins') throw httpErr(400, 'Cadastro inválido.');
  return db.tx(async t => {
    const q = (a, b) => t.query(a, b);
    const r = await q('select data from docs where coll=$1 and id=$2', [coll, id]);
    if (!r.rows[0]) throw httpErr(404, 'Cadastro não encontrado.');
    const doc = Object.assign({}, r.rows[0].data, { pass });
    if (!String(doc.login || '').trim() && !(coll === 'customers' && String(doc.doc || '').replace(/\D/g, ''))) throw httpErr(400, 'Cadastre um usuário para esta pessoa antes de definir a senha.');
    await syncUser(q, coll, doc, { base: true, mustReset: true });
    // a redefinição pela loja também destrava quem estava bloqueado por senha errada
    await q(`delete from login_attempts where key like 'u:' || (select id from users where role=$1 and ref_id=$2)::text || '%'`, [USER_COLLS[coll], id]);
    return { ok: true };
  });
}
async function loginClash(coll, doc) {
  const role = USER_COLLS[coll]; if (!role || !doc) return '';
  const login = String(doc.login || '').trim().toLowerCase();
  const digits = coll === 'customers' ? String(doc.doc || '').replace(/\D/g, '') : '';
  const lg = login || digits; if (!lg) return '';
  const r = await db.query('select 1 from users where login=$1 and not (role=$2 and ref_id=$3)', [lg, role, doc.id]);
  return r.rows.length ? `O usuário "${lg}" já é usado por outra pessoa. Escolha outro.` : '';
}
module.exports = { loginClash, resetPassword, tempPasswords, needsSetup, setupAdmin, COLLS, ORDERED, USER_COLLS, ROLE_COLL, loadAll, writeChanges, setOrder, importBackup, exportBackup, httpErr, uid, syncUser };

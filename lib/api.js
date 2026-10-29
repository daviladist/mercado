'use strict';
/* Rotas da API. Funciona na Vercel (api/index.js) e no servidor local (scripts/dev-server.js). */
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');
const policy = require('./policy');

const MAX_BODY = 4 * 1024 * 1024;
const SECURE = process.env.DEV_INSECURE_COOKIE !== '1';
const COOKIE = SECURE ? '__Host-sid' : 'sid';

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', headers['Content-Type'] || 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', headers['Cache-Control'] || 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  Object.entries(headers).forEach(([k, v]) => { if (k !== 'Content-Type' && k !== 'Cache-Control') res.setHeader(k, v); });
  res.end(data);
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function setCookie(res, token, maxAge) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '?').trim().slice(0, 64);
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw store.httpErr(413, 'Envio grande demais.'); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}
async function audit(user, action, detail) {
  try { await db.query('insert into audit(user_id,role,action,detail) values($1,$2,$3,$4)', [user ? user.id : null, user ? user.role : null, action, JSON.stringify(detail || {})]); } catch (e) {}
}
const meOut = u => ({ role: u.role, name: u.name, refId: u.ref_id, login: u.login, mustReset: !!u.must_reset });

/* versões dos registros que a pessoa recebeu (para conferir na hora de gravar) */
function versionsFor(P, V) {
  const out = { meta: {} };
  for (const [k, v] of Object.entries(P)) {
    if (Array.isArray(v) && store.COLLS.includes(k)) { out[k] = {}; v.forEach(d => { if (d && d.id && V[k] && V[k][d.id] != null) out[k][d.id] = V[k][d.id]; }); }
    else if (V.meta && V.meta[k] != null) out.meta[k] = V.meta[k];
  }
  return out;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  try {
    await require('./schema').ensureSchema();
    if (method !== 'GET' && method !== 'HEAD') {
      // proteção contra envio a partir de outro site (CSRF): cabeçalho próprio + mesma origem
      if (req.headers['x-app'] !== '1') return send(res, 403, { error: 'Requisição recusada.' });
      const origin = req.headers.origin;
      if (origin) { const h = new URL(origin).host; if (h !== req.headers.host && h !== req.headers['x-forwarded-host']) return send(res, 403, { error: 'Origem recusada.' }); }
    }
    if (path === '/api/health') {
      const r = await db.query('select count(*)::int as n from users');
      return send(res, 200, { ok: true, users: r.rows[0].n });
    }
    if (path === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      const r = await auth.login(String(b.role || ''), String(b.login || ''), String(b.password || ''), clientIp(req));
      if (r.error) { await audit(null, 'login_falhou', { role: b.role, login: String(b.login || '').slice(0, 60), ip: clientIp(req) }); return send(res, r.status || 401, { error: r.error }); }
      setCookie(res, r.token, r.maxAge);
      await audit(r.user, 'login', { ip: clientIp(req) });
      return send(res, 200, meOut(r.user));
    }
    if (path === '/api/setup-status') return send(res, 200, { needsSetup: await store.needsSetup() });
    if (path === '/api/setup' && method === 'POST') {
      // primeiro acesso: cria o administrador. Exige o código SETUP_CODE configurado na Vercel.
      const b = await readBody(req);
      const code = String(process.env.SETUP_CODE || '');
      const given = Buffer.from(String(b.code || '')), want = Buffer.from(code);
      if (code.length < 12 || given.length !== want.length || !require('crypto').timingSafeEqual(given, want)) { await audit(null, 'setup_negado', { ip: clientIp(req) }); return send(res, 403, { error: 'Código de instalação incorreto.' }); }
      if (!(await store.needsSetup())) return send(res, 409, { error: 'O administrador já foi criado.' });
      const u = await store.setupAdmin(b.name, b.login, String(b.password || ''));
      const sess = await auth.createSession(u);
      setCookie(res, sess.token, sess.maxAge);
      await audit(u, 'setup_admin', { ip: clientIp(req) });
      return send(res, 200, meOut(u));
    }
    const token = cookies(req)[COOKIE];
    if (path === '/api/logout' && method === 'POST') {
      await auth.destroySession(token);
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${SECURE ? '; Secure' : ''}`);
      return send(res, 200, { ok: true });
    }
    const user = await auth.getSession(token);
    if (!user) return send(res, 401, { error: 'Entre de novo.', login: true });
    if (path === '/api/me') return send(res, 200, meOut(user));
    if (path === '/api/password' && method === 'POST') {
      const b = await readBody(req);
      const r = await auth.changePassword(user.id, String(b.current || ''), String(b.next || ''));
      if (r.error) return send(res, 400, { error: r.error });
      await audit(user, 'troca_senha', {});
      return send(res, 200, { ok: true });
    }
    if (user.must_reset) return send(res, 403, { error: 'Crie uma senha nova antes de continuar.', mustReset: true });

    if (path === '/api/version') {
      const r = await db.query(`select coalesce(max(updated_at),'epoch')::text as v, (select count(*) from docs)::int as n from docs`);
      return send(res, 200, { v: r.rows[0].v + '|' + r.rows[0].n });
    }
    if (path === '/api/state' && method === 'GET') {
      const { S, V } = await store.loadAll();
      const P = policy.project(S, user);
      return send(res, 200, { me: meOut(user), S: P, V: versionsFor(P, V) });
    }
    if (path === '/api/sync' && method === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.changes) || b.changes.length > 500) return send(res, 400, { error: 'Envio inválido.' });
      const { S, V } = await store.loadAll();
      if (process.env.DEBUG_SYNC) console.log('SYNC', user.role, b.changes.map(c => c.c + ':' + c.id + ':v' + c.ver + (c.c === 'orders' ? ':' + (c.doc && c.doc.status) : '')).join(' '));
      const { writes, drops, effects } = policy.applySync(S, V, user, b.changes);
      const out = await db.tx(async t => {
        const q = (a, p) => t.query(a, p);
        for (const w of writes) {
          if (w.newOrder) {
            let no = null;
            const want = Number(w.doc.no);
            if (user.role === 'admin' && Number.isInteger(want) && want > 0) {
              const used = await q(`select 1 from docs where coll='orders' and (data->>'no')=$1`, [String(want)]);
              if (!used.rows.length) { no = want; await q(`select setval('order_no', greatest($1::bigint, (select last_value from order_no)))`, [want]); }
            }
            if (no == null) no = Number((await q(`select nextval('order_no') as n`)).rows[0].n);
            w.doc.no = no;
            (w.doc.events || []).forEach(e => { e.text = String(e.text || '').replace('{NO}', no); });
          }
        }
        const done = await store.writeChanges(q, writes);
        // efeitos do servidor: estoque, contas automáticas, registro de propostas
        for (const pid of effects.products) {
          const p = S.products.find(x => x.id === pid);
          await q(`update docs set data=jsonb_set(data,'{stock}',$3::jsonb), ver=ver+1, updated_at=now() where coll=$1 and id=$2`, ['products', pid, JSON.stringify(p.stock)]);
        }
        for (const r of effects.receivables) { await q(`insert into docs(coll,id,data) values('receivables',$1,$2) on conflict do nothing`, [r.id, JSON.stringify(r)]); done.push({ c: 'receivables', id: r.id, op: 'put', doc: r, ver: 1 }); }
        for (const oid of effects.dropRecFor || []) {
          const del = await q(`delete from docs where coll='receivables' and data->>'orderId'=$1 and coalesce(data->>'paidAt','')='' returning id`, [oid]);
          del.rows.forEach(r => done.push({ c: 'receivables', id: r.id, op: 'del' }));
        }
        if (effects.negLog.length) {
          await q(`insert into docs(coll,id,data) values('meta','negLog',$1::jsonb) on conflict(coll,id) do update set data=(case when jsonb_array_length(docs.data)>2000 then docs.data-0 else docs.data end)||excluded.data, ver=docs.ver+1, updated_at=now()`, [JSON.stringify(effects.negLog)]);
        }
        if (user.role === 'admin' && b.order && typeof b.order === 'object') for (const [c, ids] of Object.entries(b.order)) await store.setOrder(q, c, ids);
        return done;
      });
      // devolve o que foi gravado, já filtrado para quem enviou
      if (user.role === 'admin') {
        const ppl = out.filter(d => d.op === 'put' && store.USER_COLLS[d.c]);
        if (ppl.length) {
          const u = await db.query('select role, ref_id, must_reset from users where pass_hash is not null');
          const has = new Map(u.rows.map(x => [x.role + ':' + x.ref_id, x]));
          ppl.forEach(d => { const x = has.get(store.USER_COLLS[d.c] + ':' + d.id); d.doc = Object.assign({}, d.doc, { hasPass: !!x, mustReset: !!(x && x.must_reset) }); });
        }
      }
      const docs = out.map(d => {
        if (d.op === 'del' || user.role === 'admin') return d;
        if (d.c === 'orders') return Object.assign({}, d, { doc: policy.stripOrder(d.doc, user.role) });
        if (d.c === 'products') return Object.assign({}, d, { doc: policy.stripProduct(d.doc, user.role) });
        if (d.c === 'customers') { const x = Object.assign({}, d.doc); delete x.login; return Object.assign({}, d, { doc: x }); }
        if (d.c === 'receivables' && user.role !== 'cliente' && user.role !== 'vendedor') return null;
        return d;
      }).filter(Boolean);
      const seq = Number((await db.query(`select last_value from order_no`)).rows[0].last_value) + 1;
      return send(res, 200, { docs, drops, seq });
    }
    if (path === '/api/lock' && method === 'POST') {
      if (user.role !== 'vendedor') return send(res, 403, { error: 'Só para vendedor.' });
      const { S } = await store.loadAll();
      return send(res, 200, policy.lockCheck(S, user, await readBody(req)));
    }
    if (path === '/api/neg' && method === 'POST') {
      if (user.role !== 'cliente') return send(res, 403, { error: 'Só para cliente.' });
      const { S } = await store.loadAll();
      return send(res, 200, policy.negCheck(S, user, await readBody(req)));
    }
    if (path.startsWith('/api/photo/') && method === 'GET') {
      const id = decodeURIComponent(path.slice('/api/photo/'.length));
      if (id.startsWith('o:')) {
        const oid = id.split(':')[1];
        const r = await db.query(`select data from docs where coll='orders' and id=$1`, [oid]);
        if (!r.rows[0] || !policy.canSeeOrder(r.rows[0].data, user)) return send(res, 404, { error: 'Foto não encontrada.' });
      } else if (!id.startsWith('p:')) return send(res, 404, { error: 'Foto não encontrada.' });
      const r = await db.query('select data from photos where id=$1', [id]);
      if (!r.rows[0]) return send(res, 404, { error: 'Foto não encontrada.' });
      const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(r.rows[0].data);
      if (!m) return send(res, 404, { error: 'Foto inválida.' });
      return send(res, 200, Buffer.from(m[2], 'base64'), { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=604800, immutable' });
    }
    if (path === '/api/backup' && method === 'GET') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      await audit(user, 'backup', {});
      return send(res, 200, { app: 'pedidos-atacado', version: 2, savedAt: new Date().toISOString(), data: await store.exportBackup() });
    }
    if (path === '/api/users/reset' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const b = await readBody(req);
      await store.resetPassword(String(b.coll || ''), String(b.id || ''), String(b.pass || ''));
      await audit(user, 'redefiniu_senha', { coll: b.coll, id: b.id });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/temp-passwords' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const list = await store.tempPasswords();
      await audit(user, 'senhas_provisorias', { n: list.length });
      return send(res, 200, { list });
    }
    if (path === '/api/restore' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const b = await readBody(req);
      const data = b && b.data ? b.data : b;
      // o administrador que está restaurando continua com a senha dele
      const stats = await store.importBackup(data, { keepAdmin: user, importPasswords: false });
      await audit(user, 'restore', stats);
      return send(res, 200, { ok: true, stats });
    }
    return send(res, 404, { error: 'Não encontrado.' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return send(res, status, { error: status >= 500 ? 'Erro no servidor. Tente de novo.' : e.message });
  }
}
module.exports = { handle };

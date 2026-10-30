'use strict';
/* Rotas da API. Funciona na Vercel (api/index.js) e no servidor local (scripts/dev-server.js). */
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');
const policy = require('./policy');
const central = require('./central');
const MODS = require('./modules');

const MAX_BODY = 4 * 1024 * 1024;
const SECURE = process.env.DEV_INSECURE_COOKIE !== '1';
const COOKIE = SECURE ? '__Host-sid' : 'sid';
// cookie da Central do sistema (Tino): separado do cookie da loja
const CCOOKIE = SECURE ? '__Host-csid' : 'csid';

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
function setCookie(res, token, maxAge, name = COOKIE) {
  const parts = [`${name}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
/* IP de quem chamou: na Vercel vem no x-real-ip, que a própria Vercel preenche (o navegador não consegue forjar).
   Fora da Vercel (servidor local), só vale o endereço da conexão: cabeçalho enviado pelo navegador é ignorado. */
function clientIp(req) {
  const v = process.env.VERCEL ? String(req.headers['x-real-ip'] || '') : '';
  return (v || (req.socket && req.socket.remoteAddress) || '?').trim().slice(0, 64);
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return parseJson(req.body);
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw store.httpErr(413, 'Envio grande demais.'); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  return parseJson(s);
}
function parseJson(s) {
  if (!s) return {};
  let v; try { v = JSON.parse(s); } catch (e) { throw store.httpErr(400, 'Envio inválido.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw store.httpErr(400, 'Envio inválido.');
  return v;
}
async function audit(user, action, detail) {
  try { await db.query('insert into audit(user_id,role,action,detail) values($1,$2,$3,$4)', [user ? user.id : null, user ? user.role : null, action, JSON.stringify(detail || {})]); }
  catch (e) { console.error('audit falhou:', action, e.message); }
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
      if (origin) {
        let h = null; try { h = new URL(origin).host; } catch (e) { h = null; }
        if (!h || (h !== req.headers.host && h !== req.headers['x-forwarded-host'])) return send(res, 403, { error: 'Origem recusada.' });
      }
    }
    if (path === '/api/health') {
      const r = await db.query('select count(*)::int as n from users');
      return send(res, 200, { ok: true, users: r.rows[0].n });
    }
    if (path.startsWith('/api/central/')) return await handleCentral(req, res, path, method);
    if (path === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      const r = await auth.login(String(b.role || ''), String(b.login || ''), String(b.password || ''), clientIp(req));
      if (r.error) { await audit(null, 'login_falhou', { role: b.role, login: String(b.login || '').slice(0, 60), ip: clientIp(req) }); return send(res, r.status || 401, { error: r.error }); }
      if (!(await roleAllowed(r.user.role))) { await auth.destroySession(r.token); return send(res, 403, { error: 'Este acesso não está liberado para esta empresa.' }); }
      setCookie(res, r.token, r.maxAge);
      await audit(r.user, 'login', { ip: clientIp(req) });
      return send(res, 200, meOut(r.user));
    }
    if (path === '/api/setup-status') return send(res, 200, { needsSetup: await store.needsSetup() });
    if (path === '/api/setup' && method === 'POST') {
      // primeiro acesso: cria o administrador. Exige o código SETUP_CODE configurado na Vercel.
      if (await auth.tooMany('setup:' + clientIp(req), 10)) return send(res, 429, { error: 'Muitas tentativas. Espere 15 minutos.' });
      const b = await readBody(req);
      const code = String(process.env.SETUP_CODE || '');
      const given = Buffer.from(String(b.code || '')), want = Buffer.from(code);
      if (code.length < 12 || given.length !== want.length || !require('crypto').timingSafeEqual(given, want)) { await auth.bump('setup:' + clientIp(req)); await audit(null, 'setup_negado', { ip: clientIp(req) }); return send(res, 403, { error: 'Código de instalação incorreto.' }); }
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
    if (!(await roleAllowed(user.role))) return send(res, 403, { error: 'Este acesso foi desligado. Fale com a loja.', login: true });
    if (path === '/api/me') return send(res, 200, meOut(user));
    if (path === '/api/password' && method === 'POST') {
      const b = await readBody(req);
      const r = await auth.changePassword(user.id, String(b.current || ''), String(b.next || ''), token);
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
      return send(res, 200, { me: meOut(user), S: P, V: versionsFor(P, V), T: tenantOut(await central.primaryTenant()) });
    }
    if (path === '/api/sync' && method === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.changes) || b.changes.length > 500) return send(res, 400, { error: 'Envio inválido.' });
      // duas gravações no mesmo instante: a segunda é refeita uma vez sobre os dados novos (junta as mudanças)
      const original = JSON.stringify(b.changes);
      for (let attempt = 1; ; attempt++) {
        try { return await syncOnce(req, res, user, Object.assign({}, b, { changes: JSON.parse(original) })); }
        catch (e) { if (!(e.retry && attempt < 3)) throw e; }
      }
    }
    if (path === '/api/lock' && method === 'POST') {
      if (user.role !== 'vendedor') return send(res, 403, { error: 'Só para vendedor.' });
      if (await auth.tooMany('lock:' + user.id, 300)) return send(res, 429, { error: 'Muitas consultas. Espere alguns minutos.' });
      await auth.bump('lock:' + user.id);
      const { S } = await store.loadAll(['products', 'customers', 'sellers', 'categories', 'combos', 'cities']);
      return send(res, 200, policy.lockCheck(S, user, await readBody(req)));
    }
    if (path === '/api/neg' && method === 'POST') {
      if (user.role !== 'cliente') return send(res, 403, { error: 'Só para cliente.' });
      if (!(await central.primaryTenant()).modules.negociacao) return send(res, 200, { st: 'an' });
      const b = await readBody(req);
      // poucas consultas por produto: não dá para "varrer" preços e descobrir o custo
      const k1 = 'neg:' + user.id + ':' + String(b.pid || '').slice(0, 40), k2 = 'neg:' + user.id;
      if (await auth.tooMany(k1, 4) || await auth.tooMany(k2, 40)) return send(res, 200, { st: 'an', limit: true });
      await auth.bump(k1); await auth.bump(k2);
      const { S } = await store.loadAll(['products', 'customers', 'sellers', 'categories', 'combos', 'cities']);
      return send(res, 200, policy.negCheck(S, user, b));
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
      if (String(b.pass || '').length > 200) return send(res, 400, { error: 'Senha longa demais.' });
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
async function syncOnce(req, res, user, b) {
      const { S, V } = await store.loadAll();
      if (process.env.DEBUG_SYNC) console.log('SYNC', user.role, b.changes.map(c => c && (c.c + ':' + c.id + ':v' + c.ver + (c.c === 'orders' ? ':' + (c.doc && c.doc.status) : ''))).join(' '));
      // cada alteração é conferida sozinha: a que não pode é recusada (com o motivo) e as outras seguem
      const writes = [], drops = [], rejected = [], effects = policy.newEffects();
      const mods = (await central.primaryTenant()).modules;
      for (const ch of b.changes) {
        // módulo desligado na Central: o servidor não aceita gravar nele
        const need = ch && MODS.COLL_MODULE[ch.c];
        if (need && !mods[need]) { rejected.push({ c: String(ch.c), id: String(ch.id || '').slice(0, 80), error: 'Função desligada para esta empresa.' }); continue; }
        try {
          const r = policy.applySync(S, V, user, [ch], effects);
          writes.push(...r.writes); drops.push(...r.drops);
        } catch (e) {
          if (e.status === 409 || !e.status || e.status >= 500) throw e;
          rejected.push({ c: String(ch && ch.c || ''), id: String(ch && ch.id || '').slice(0, 80), error: e.message });
        }
      }
      // usuário repetido em outro cadastro: recusa só aquele cadastro, antes de gravar
      for (let k = writes.length - 1; k >= 0; k--) {
        const w = writes[k];
        if (w.syncUser) { const msg = await store.loginClash(w.c, w.doc); if (msg) { rejected.push({ c: w.c, id: w.id, error: msg }); writes.splice(k, 1); } }
      }
      if (rejected.length) await audit(user, 'sync_recusado', { rejected: rejected.slice(0, 20) });
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
            (w.doc.events || []).forEach(e => { e.text = String(e.text || '').replace(/\{NO\}|nº null|nº undefined/g, m => m === '{NO}' ? String(no) : 'nº ' + no); });
            effects.recNew.forEach(r => { if (r.orderId === w.doc.id) r.orderNo = String(no); });
          }
        }
        const done = await store.writeChanges(q, writes);
        // estoque: baixa/devolução RELATIVA, dentro da transação (duas conclusões ao mesmo tempo não se atropelam)
        for (const [pid, d] of effects.stock) {
          if (!d) continue;
          const r = await q(`update docs set data=jsonb_set(data,'{stock}',to_jsonb(round(((data->>'stock')::numeric + $2::numeric), 3))), ver=ver+1, updated_at=now()
            where coll='products' and id=$1 and (data->>'stock') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$' returning data, ver`, [pid, String(Math.round(d * 1000) / 1000)]);
          if (r.rows[0]) done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver });
        }
        // entrada de mercadoria: soma no estoque (produto sem estoque controlado passa a ter, começando pela quantidade recebida)
        for (const [pid, d] of effects.stockIn) {
          if (!d) continue;
          const r = await q(`update docs set data=jsonb_set(data,'{stock}',to_jsonb(round((case when (data->>'stock') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$' then (data->>'stock')::numeric else 0 end) + $2::numeric, 3))), ver=ver+1, updated_at=now()
            where coll='products' and id=$1 returning data, ver`, [pid, String(Math.round(d * 1000) / 1000)]);
          if (r.rows[0]) done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver });
        }
        // nota aprovada: custo, embalagem, tributação e preços vão para o produto
        for (const [pid, patch] of effects.prodPatch) {
          const r = await q(`update docs set data=(case when ($2::jsonb->>'cost') ~ '^[0-9]+(\\.[0-9]+)?$' and (data->>'refCost') ~ '^[0-9]+(\\.[0-9]+)?$' then (case when ($2::jsonb->>'cost')::numeric >= (data->>'refCost')::numeric then data - 'refCost' else data end) else data end)||$2::jsonb, ver=ver+1, updated_at=now() where coll='products' and id=$1 returning data, ver`, [pid, JSON.stringify(patch)]);
          if (r.rows[0]) { const k = done.findIndex(x => x.c === 'products' && x.id === pid); if (k >= 0) done.splice(k, 1); done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver }); }
        }
        for (const np of effects.prodNew) {
          const r = await q(`insert into docs(coll,id,data,ord) values('products',$1,$2,-1) on conflict do nothing returning ver`, [np.id, JSON.stringify(np)]);
          if (r.rows[0]) done.push({ c: 'products', id: np.id, op: 'put', doc: np, ver: r.rows[0].ver });
        }
        for (const r of effects.recNew) {
          const x = await q(`insert into docs(coll,id,data) values('receivables',$1,$2) on conflict do nothing returning ver`, [r.id, JSON.stringify(r)]);
          if (x.rows[0]) done.push({ c: 'receivables', id: r.id, op: 'put', doc: r, ver: x.rows[0].ver });
        }
        for (const id of effects.recDel) {
          const del = await q(`delete from docs where coll='receivables' and id=$1 and coalesce(data->>'paidAt','')='' returning id`, [id]);
          del.rows.forEach(r => done.push({ c: 'receivables', id: r.id, op: 'del' }));
        }
        if (effects.negLog.length) {
          // registro de propostas: guarda só as 2.000 mais recentes
          await q(`insert into docs(coll,id,data) values('meta','negLog',$1::jsonb) on conflict(coll,id) do update set
            data=(select coalesce(jsonb_agg(e order by n),'[]'::jsonb) from (select e, n from jsonb_array_elements(docs.data||excluded.data) with ordinality as x(e,n)
              order by n desc limit 2000) y), ver=docs.ver+1, updated_at=now()`, [JSON.stringify(effects.negLog)]);
        }
        if (user.role === 'admin' && b.order && typeof b.order === 'object') for (const [c, ids] of Object.entries(b.order)) await store.setOrder(q, c, ids);
        return done;
      });
      // devolve o que foi gravado, já filtrado para quem enviou (mesmo filtro do /api/state)
      if (user.role === 'admin') {
        const ppl = out.filter(d => d.op === 'put' && store.USER_COLLS[d.c]);
        if (ppl.length) {
          const u = await db.query('select role, ref_id, must_reset from users where pass_hash is not null');
          const has = new Map(u.rows.map(x => [x.role + ':' + x.ref_id, x]));
          ppl.forEach(d => { const x = has.get(store.USER_COLLS[d.c] + ':' + d.id); d.doc = Object.assign({}, d.doc, { hasPass: !!x, mustReset: !!(x && x.must_reset) }); });
        }
      }
      const docs = out.map(d => {
        if (d.op === 'del') return user.role === 'admin' || ['orders', 'receivables'].includes(d.c) ? d : null;
        const doc = policy.projectDoc(S, user, d.c, d.doc);
        return doc ? Object.assign({}, d, { doc }) : null;
      }).filter(Boolean);
      const seq = Number((await db.query(`select last_value from order_no`)).rows[0].last_value) + 1;
      return send(res, 200, { docs, drops, rejected, seq });
}
/* ---------- Tino: módulos e marca da empresa ---------- */
async function roleAllowed(role) {
  const need = MODS.ROLE_MODULE[role];
  if (!need) return true;
  return !!(await central.primaryTenant()).modules[need];
}
const tenantOut = t => ({ id: t.id, brand: { name: t.name || '', color: t.color || null, logo: t.logo || null }, modules: t.modules });

/* ---------- Tino: Central do sistema (/api/central/*) ---------- */
const SUPER = { id: null, role: 'super_admin' };
async function handleCentral(req, res, path, method) {
  const ip = clientIp(req);
  if (path === '/api/central/login' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.login(String(b.login || '').slice(0, 60), String(b.password || '').slice(0, 300), ip);
    if (r.error) { await audit(SUPER, 'central_login_falhou', { ip, login: String(b.login || '').slice(0, 60) }); return send(res, r.status || 401, { error: r.error }); }
    setCookie(res, r.token, r.maxAge, CCOOKIE);
    await audit(SUPER, 'central_login', { ip });
    return send(res, 200, { login: r.login });
  }
  const token = cookies(req)[CCOOKIE];
  if (path === '/api/central/logout' && method === 'POST') {
    await central.destroySession(token);
    res.setHeader('Set-Cookie', `${CCOOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${SECURE ? '; Secure' : ''}`);
    return send(res, 200, { ok: true });
  }
  const me = await central.getSession(token);
  if (!me) return send(res, 401, { error: 'Entre de novo.', login: true });
  if (path === '/api/central/me') return send(res, 200, me);
  if (path === '/api/central/state' && method === 'GET') {
    return send(res, 200, Object.assign({ me, tenants: await central.listTenants() }, central.catalog()));
  }
  if (path === '/api/central/tenant' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.saveTenant(b);
    const changed = r.before ? Object.keys(r.tenant.modules).filter(k => r.tenant.modules[k] !== r.before.modules[k]) : null;
    await audit(SUPER, r.before ? 'central_empresa_alterada' : 'central_empresa_criada', { ip, id: r.tenant.id, modulos: changed });
    return send(res, 200, { tenant: r.tenant });
  }
  return send(res, 404, { error: 'Não encontrado.' });
}
module.exports = { handle };

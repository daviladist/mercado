'use strict';
/* Rotas da API. Funciona na Vercel (api/index.js) e no servidor local (scripts/dev-server.js). */
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');
const policy = require('./policy');
const central = require('./central');
const MODS = require('./modules');
const pdv = require('./pdv');

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
async function audit(user, action, detail, tid) {
  try { await db.query('insert into audit(user_id,role,action,detail,tenant_id) values($1,$2,$3,$4,$5)', [user ? user.id : null, user ? user.role : null, action, JSON.stringify(detail || {}), (user && user.tenant_id) || tid || null]); }
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
        // X-Forwarded-Host só vale atrás do proxy da Vercel (que o preenche); fora dela qualquer um poderia mandar
        if (!h || (h !== req.headers.host && !(process.env.VERCEL && h === req.headers['x-forwarded-host']))) return send(res, 403, { error: 'Origem recusada.' });
      }
    }
    if (path === '/api/health') {
      await db.query('select 1');
      return send(res, 200, { ok: true });
    }
    if (path.startsWith('/api/central/')) return await handleCentral(req, res, path, method);
    // empresa do endereço (/t/<empresa>): o app manda no cabeçalho X-Tenant ("@" = empresa principal).
    // Sem cabeçalho (ex.: foto num <img>), vale a empresa da sessão.
    const tHdr = String(req.headers['x-tenant'] || '').trim().toLowerCase();
    const tSlug = tHdr === '@' ? '' : tHdr;
    const reqTenant = tSlug ? await central.tenantById(tSlug) : await central.primaryTenant();
    if (path === '/api/brand') {
      if (!reqTenant) return send(res, 404, { error: 'Empresa não encontrada.' });
      return send(res, 200, { id: reqTenant.id, name: reqTenant.name, color: reqTenant.color, logo: reqTenant.logo, primary: !!reqTenant.primary });
    }
    if (path === '/api/manifest' && method === 'GET') {
      const mt = await central.tenantById(String(url.searchParams.get('t') || '').toLowerCase());
      if (!mt || mt.primary) return send(res, 404, { error: 'Empresa não encontrada.' });
      return send(res, 200, manifestFor(mt, url.searchParams.get('k') === 'cliente'), { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
    }
    if (!reqTenant) return send(res, 404, { error: 'Empresa não encontrada. Confira o endereço.' });
    if (reqTenant.status === 'suspensa') return send(res, 403, { error: 'Acesso suspenso. Fale com o suporte.', login: true });
    if (path === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      const r = await auth.login(reqTenant.id, String(b.role || ''), String(b.login || ''), String(b.password || ''), clientIp(req));
      if (r.error) { await audit(null, 'login_falhou', { role: b.role, login: String(b.login || '').slice(0, 60), ip: clientIp(req) }, reqTenant.id); return send(res, r.status || 401, { error: r.error }); }
      if (!statusAllows(reqTenant, r.user.role)) { await auth.destroySession(r.token); return send(res, 403, { error: 'A loja ainda está sendo preparada. Tente mais tarde.' }); }
      if (!roleAllowed(reqTenant, r.user.role)) { await auth.destroySession(r.token); return send(res, 403, { error: 'Este acesso não está liberado para esta empresa.' }); }
      setCookie(res, r.token, r.maxAge);
      await audit(r.user, 'login', { ip: clientIp(req) });
      return send(res, 200, meOut(r.user));
    }
    if (path === '/api/setup-status') return send(res, 200, { needsSetup: reqTenant.primary ? await store.needsSetup(reqTenant.id) : false });
    if (path === '/api/setup' && method === 'POST') {
      // primeiro acesso: cria o administrador. Exige o código SETUP_CODE configurado na Vercel.
      if (await auth.tooMany('setup:' + clientIp(req), 10)) return send(res, 429, { error: 'Muitas tentativas. Espere 15 minutos.' });
      const b = await readBody(req);
      const code = String(process.env.SETUP_CODE || '');
      const given = Buffer.from(String(b.code || '')), want = Buffer.from(code);
      if (code.length < 12 || given.length !== want.length || !require('crypto').timingSafeEqual(given, want)) { await auth.bump('setup:' + clientIp(req)); await audit(null, 'setup_negado', { ip: clientIp(req) }); return send(res, 403, { error: 'Código de instalação incorreto.' }); }
      // empresas novas recebem o administrador pela Central; o código de instalação só vale na principal
      if (!reqTenant.primary || !(await store.needsSetup(reqTenant.id))) return send(res, 409, { error: 'O administrador já foi criado.' });
      const u = await store.setupAdmin(reqTenant.id, b.name, b.login, String(b.password || ''));
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
    // a sessão é de UMA empresa: aberta no endereço de outra, vale como "não logado"
    if (tHdr && user.tenant_id !== reqTenant.id) return send(res, 401, { error: 'Entre de novo.', login: true });
    const tid = user.tenant_id, T = user.tenant_id === reqTenant.id ? reqTenant : await central.tenantById(tid);
    if (!T || T.status === 'suspensa') return send(res, 403, { error: 'Acesso suspenso. Fale com o suporte.', login: true });
    if (!statusAllows(T, user.role)) return send(res, 403, { error: 'A loja ainda está sendo preparada. Tente mais tarde.', login: true });
    if (!roleAllowed(T, user.role)) return send(res, 403, { error: 'Este acesso foi desligado. Fale com a loja.', login: true });
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
      const r = await db.query(`select coalesce(max(updated_at),'epoch')::text as v, count(*)::int as n, (select updated_at::text from tenants where id=$1) as t from docs_t where tenant_id=$1`, [tid]);
      return send(res, 200, { v: r.rows[0].v + '|' + r.rows[0].n + '|' + r.rows[0].t });
    }
    if (path === '/api/state' && method === 'GET') {
      const { S, V } = await store.loadAll(tid);
      const P = MODS.stripOff(policy.project(S, user), T.modules);
      return send(res, 200, { me: meOut(user), S: P, V: versionsFor(P, V), T: tenantOut(T) });
    }
    if (path === '/api/sync' && method === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.changes) || b.changes.length > 500) return send(res, 400, { error: 'Envio inválido.' });
      // duas gravações no mesmo instante: a segunda é refeita uma vez sobre os dados novos (junta as mudanças)
      const original = JSON.stringify(b.changes);
      for (let attempt = 1; ; attempt++) {
        try { return await syncOnce(req, res, user, T, Object.assign({}, b, { changes: JSON.parse(original) })); }
        catch (e) { if (!(e.retry && attempt < 3)) throw e; }
      }
    }
    if (path === '/api/lock' && method === 'POST') {
      if (user.role !== 'vendedor') return send(res, 403, { error: 'Só para vendedor.' });
      if (await auth.tooMany('lock:' + user.id, 300)) return send(res, 429, { error: 'Muitas consultas. Espere alguns minutos.' });
      await auth.bump('lock:' + user.id);
      const { S } = await store.loadAll(tid, ['products', 'customers', 'sellers', 'categories', 'combos', 'cities']);
      return send(res, 200, policy.lockCheck(S, user, await readBody(req)));
    }
    if (path === '/api/neg' && method === 'POST') {
      if (user.role !== 'cliente') return send(res, 403, { error: 'Só para cliente.' });
      if (!T.modules.negociacao) return send(res, 200, { st: 'an' });
      const b = await readBody(req);
      // poucas consultas por produto: não dá para "varrer" preços e descobrir o custo
      const k1 = 'neg:' + user.id + ':' + String(b.pid || '').slice(0, 40), k2 = 'neg:' + user.id;
      if (await auth.tooMany(k1, 4) || await auth.tooMany(k2, 40)) return send(res, 200, { st: 'an', limit: true });
      await auth.bump(k1); await auth.bump(k2);
      const { S } = await store.loadAll(tid, ['products', 'customers', 'sellers', 'categories', 'combos', 'cities']);
      return send(res, 200, policy.negCheck(S, user, b));
    }
    // caixa de balcão (PDV): só com o módulo ligado na Central
    if (path.startsWith('/api/pdv/')) {
      if (!T.modules.pdv) return send(res, 403, { error: 'O caixa (PDV) não está ligado para esta empresa.' });
      const out = await pdv.handle({ path, method, user, tid, T, ip: clientIp(req), query: url.searchParams, body: () => readBody(req), audit: (a, d) => audit(user, a, d) });
      return send(res, 200, out);
    }
    if (path.startsWith('/api/photo/') && method === 'GET') {
      const id = decodeURIComponent(path.slice('/api/photo/'.length));
      if (id.startsWith('o:')) {
        const oid = id.split(':')[1];
        const r = await db.query(`select data from docs_t where tenant_id=$2 and coll='orders' and id=$1`, [oid, tid]);
        if (!r.rows[0] || !policy.canSeeOrder(r.rows[0].data, user)) return send(res, 404, { error: 'Foto não encontrada.' });
      } else if (!id.startsWith('p:')) return send(res, 404, { error: 'Foto não encontrada.' });
      const r = await db.query('select data from photos_t where tenant_id=$2 and id=$1', [id, tid]);
      if (!r.rows[0]) return send(res, 404, { error: 'Foto não encontrada.' });
      const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(r.rows[0].data);
      if (!m) return send(res, 404, { error: 'Foto inválida.' });
      return send(res, 200, Buffer.from(m[2], 'base64'), { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=604800, immutable' });
    }
    if (path === '/api/backup' && method === 'GET') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      await audit(user, 'backup', {});
      return send(res, 200, { app: 'pedidos-atacado', version: 2, savedAt: new Date().toISOString(), data: MODS.stripOff(await store.exportBackup(tid), T.modules) });
    }
    if (path === '/api/users/reset' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const b = await readBody(req);
      if (String(b.pass || '').length > 200) return send(res, 400, { error: 'Senha longa demais.' });
      await store.resetPassword(tid, String(b.coll || ''), String(b.id || ''), String(b.pass || ''));
      await audit(user, 'redefiniu_senha', { coll: b.coll, id: b.id });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/temp-passwords' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const list = await store.tempPasswords(tid);
      await audit(user, 'senhas_provisorias', { n: list.length });
      return send(res, 200, { list });
    }
    if (path === '/api/restore' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const b = await readBody(req);
      const data = b && b.data ? b.data : b;
      // o administrador que está restaurando continua com a senha dele
      // dados de módulos desligados: não entram do arquivo e os que existem ficam como estão
      const stats = await store.importBackup(tid, data, Object.assign({ keepAdmin: user, importPasswords: false }, MODS.offKeys(T.modules)));
      await audit(user, 'restore', stats);
      return send(res, 200, { ok: true, stats });
    }
    return send(res, 404, { error: 'Não encontrado.' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return send(res, status, Object.assign({ error: status >= 500 ? 'Erro no servidor. Tente de novo.' : e.message }, e.needAuth ? { needAuth: true } : {}, e.confirmarFiado ? { confirmarFiado: true } : {}));
  }
}
async function syncOnce(req, res, user, T, b) {
      const tid = user.tenant_id;
      const { S, V } = await store.loadAll(tid);
      if (process.env.DEBUG_SYNC) console.log('SYNC', user.role, b.changes.map(c => c && (c.c + ':' + c.id + ':v' + c.ver + (c.c === 'orders' ? ':' + (c.doc && c.doc.status) : ''))).join(' '));
      // cada alteração é conferida sozinha: a que não pode é recusada (com o motivo) e as outras seguem
      const writes = [], drops = [], rejected = [], effects = policy.newEffects();
      const mods = T.modules;
      for (const ch of b.changes) {
        // módulo desligado na Central: o servidor não aceita gravar nele
        if (MODS.blockedBy(ch, mods)) { rejected.push({ c: String(ch.c), id: String(ch.id || '').slice(0, 80), error: 'Função desligada para esta empresa.' }); continue; }
        // negociação desligada: pedido não leva proposta de preço
        if (!mods.negociacao && ch && ch.c === 'orders' && ch.doc && Array.isArray(ch.doc.items)) ch.doc.items.forEach(i => { if (i && typeof i === 'object') delete i.negAsk; });
        try {
          if (!Object.prototype.hasOwnProperty.call(S, '__mods')) Object.defineProperty(S, '__mods', { value: mods, enumerable: false });
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
        if (w.syncUser) { const msg = await store.loginClash(tid, w.c, w.doc); if (msg) { rejected.push({ c: w.c, id: w.id, error: msg }); writes.splice(k, 1); } }
      }
      if (rejected.length) await audit(user, 'sync_recusado', { rejected: rejected.slice(0, 20) });
      const out = await db.tx(async t => {
        const q = (a, p) => t.query(a, p);
        for (const w of writes) {
          if (w.newOrder) {
            let no = null;
            const want = Number(w.doc.no);
            if (user.role === 'admin' && Number.isInteger(want) && want > 0) {
              const used = await q(`select 1 from docs_t where tenant_id=$2 and coll='orders' and (data->>'no')=$1`, [String(want), tid]);
              if (!used.rows.length) { no = want; await store.bumpOrderNo(q, tid, want); }
            }
            if (no == null) no = await store.nextOrderNo(q, tid);
            w.doc.no = no;
            (w.doc.events || []).forEach(e => { e.text = String(e.text || '').replace(/\{NO\}|nº null|nº undefined/g, m => m === '{NO}' ? String(no) : 'nº ' + no); });
            effects.recNew.forEach(r => { if (r.orderId === w.doc.id) r.orderNo = String(no); });
          }
        }
        const done = await store.writeChanges(q, tid, writes);
        // estoque: baixa/devolução RELATIVA, dentro da transação (duas conclusões ao mesmo tempo não se atropelam)
        for (const [pid, d] of effects.stock) {
          if (!d) continue;
          const r = await q(`update docs_t set data=jsonb_set(data,'{stock}',to_jsonb(round(((data->>'stock')::numeric + $2::numeric), 3))), ver=ver+1, updated_at=now()
            where tenant_id=$3 and coll='products' and id=$1 and (data->>'stock') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$' returning data, ver`, [pid, String(Math.round(d * 1000) / 1000), tid]);
          if (r.rows[0]) done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver });
        }
        // entrada de mercadoria: soma no estoque (produto sem estoque controlado passa a ter, começando pela quantidade recebida)
        for (const [pid, d] of effects.stockIn) {
          if (!d) continue;
          const r = await q(`update docs_t set data=jsonb_set(data,'{stock}',to_jsonb(round((case when (data->>'stock') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$' then (data->>'stock')::numeric else 0 end) + $2::numeric, 3))), ver=ver+1, updated_at=now()
            where tenant_id=$3 and coll='products' and id=$1 returning data, ver`, [pid, String(Math.round(d * 1000) / 1000), tid]);
          if (r.rows[0]) done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver });
        }
        // nota aprovada: custo, embalagem, tributação e preços vão para o produto
        for (const [pid, patch] of effects.prodPatch) {
          const r = await q(`update docs_t set data=(case when ($2::jsonb ? 'refCost') then data - 'refGone' when ($2::jsonb->>'cost') ~ '^[0-9]+(\\.[0-9]+)?$' and (data->>'refCost') ~ '^[0-9]+(\\.[0-9]+)?$' then (case when ($2::jsonb->>'cost')::numeric >= (data->>'refCost')::numeric then (data - 'refCost') || jsonb_build_object('refGone', jsonb_build_object('v', (data->>'refCost')::numeric, 'cost', ($2::jsonb->>'cost')::numeric, 'at', now())) else data end) else data end)||$2::jsonb, ver=ver+1, updated_at=now() where tenant_id=$3 and coll='products' and id=$1 returning data, ver`, [pid, JSON.stringify(patch), tid]);
          if (r.rows[0]) { const k = done.findIndex(x => x.c === 'products' && x.id === pid); if (k >= 0) done.splice(k, 1); done.push({ c: 'products', id: pid, op: 'put', doc: r.rows[0].data, ver: r.rows[0].ver }); }
        }
        for (const np of effects.prodNew) {
          const r = await q(`insert into docs_t(tenant_id,coll,id,data,ord) values($3,'products',$1,$2,-1) on conflict do nothing returning ver`, [np.id, JSON.stringify(np), tid]);
          if (r.rows[0]) done.push({ c: 'products', id: np.id, op: 'put', doc: np, ver: r.rows[0].ver });
        }
        const recOff = !!MODS.blockedBy({ c: 'receivables' }, mods);
        for (const r of (recOff ? [] : effects.recNew)) {
          const x = await q(`insert into docs_t(tenant_id,coll,id,data) values($3,'receivables',$1,$2) on conflict do nothing returning ver`, [r.id, JSON.stringify(r), tid]);
          if (x.rows[0]) done.push({ c: 'receivables', id: r.id, op: 'put', doc: r, ver: x.rows[0].ver });
        }
        for (const id of (recOff ? [] : effects.recDel)) {
          const del = await q(`delete from docs_t where tenant_id=$2 and coll='receivables' and id=$1 and coalesce(data->>'paidAt','')='' returning id`, [id, tid]);
          del.rows.forEach(r => done.push({ c: 'receivables', id: r.id, op: 'del' }));
        }
        if (effects.negLog.length) {
          // registro de propostas: guarda só as 2.000 mais recentes
          await q(`insert into docs_t(tenant_id,coll,id,data) values($2,'meta','negLog',$1::jsonb) on conflict(tenant_id,coll,id) do update set
            data=(select coalesce(jsonb_agg(e order by n),'[]'::jsonb) from (select e, n from jsonb_array_elements(docs_t.data||excluded.data) with ordinality as x(e,n)
              order by n desc limit 2000) y), ver=docs_t.ver+1, updated_at=now()`, [JSON.stringify(effects.negLog), tid]);
        }
        if (user.role === 'admin' && b.order && typeof b.order === 'object') for (const [c, ids] of Object.entries(b.order)) await store.setOrder(q, tid, c, ids);
        return done;
      });
      // devolve o que foi gravado, já filtrado para quem enviou (mesmo filtro do /api/state)
      if (user.role === 'admin') {
        const ppl = out.filter(d => d.op === 'put' && store.USER_COLLS[d.c]);
        if (ppl.length) {
          const u = await db.query('select role, ref_id, must_reset from users_t where tenant_id=$1 and pass_hash is not null', [tid]);
          const has = new Map(u.rows.map(x => [x.role + ':' + x.ref_id, x]));
          ppl.forEach(d => { const x = has.get(store.USER_COLLS[d.c] + ':' + d.id); d.doc = Object.assign({}, d.doc, { hasPass: !!x, mustReset: !!(x && x.must_reset) }); });
        }
      }
      const docs = out.map(d => {
        if (MODS.blockedBy(d, mods)) return null; // dado de módulo desligado não volta para a tela
        if (d.op === 'del') return user.role === 'admin' || ['orders', 'receivables'].includes(d.c) ? d : null;
        const doc = policy.projectDoc(S, user, d.c, d.doc);
        return doc ? Object.assign({}, d, { doc }) : null;
      }).filter(Boolean);
      const seq = await store.peekOrderNo(tid);
      return send(res, 200, { docs, drops, rejected, seq });
}
/* ---------- Tino: módulos e marca da empresa ---------- */
/* empresa "em preparo": só o administrador entra (para cadastrar tudo antes de abrir para a equipe e os clientes) */
function statusAllows(T, role) { return !(T && T.status === 'em_preparo' && role !== 'admin'); }
/* app instalado no celular a partir de /t/<empresa>: abre a empresa certa, com o nome dela */
function manifestFor(t, cli) {
  const base = '/t/' + t.id, name = String(t.name || 'Tino').slice(0, 45);
  return { name: cli ? name : name + ' Equipe', short_name: name.slice(0, 12), start_url: base + (cli ? '/cliente' : '/'), scope: base + (cli ? '/cliente' : '/'), display: 'standalone',
    background_color: '#F6F1E7', theme_color: t.color || '#1F3D2B', lang: 'pt-BR',
    icons: [{ src: '/icons/tino-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/tino-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/tino-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
}
function roleAllowed(T, role) {
  const need = MODS.ROLE_MODULE[role];
  if (!need) return true;
  return !!(T && T.modules && T.modules[need]);
}
const tenantOut = t => ({ id: t.id, primary: !!t.primary, brand: { name: t.name || '', color: t.color || null, logo: t.logo || null }, modules: t.modules, off: MODS.offKeys(t.modules) });

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
  if (path === '/api/central/tenant-admin' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.tenantAdmin(b);
    await audit(SUPER, 'central_acesso_admin', { ip, tenant: r.tenant, login: r.login }, r.tenant);
    return send(res, 200, r);
  }
  return send(res, 404, { error: 'Não encontrado.' });
}
module.exports = { handle };

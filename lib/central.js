'use strict';
/*
 * Tino — Central do sistema: acesso do dono do sistema (super_admin).
 * - Separada da loja: outro cookie, outra tabela de sessões, outras rotas (/api/central/*).
 *   Sessão de administrador da loja não entra aqui, e a da Central não entra na loja.
 * - Senha: só o hash scrypt (nunca a senha). Vem da variável CENTRAL_HASH da Vercel, se existir;
 *   senão, de lib/central-cred.js. Trocar o hash derruba na hora todas as sessões da Central.
 * - Bloqueio: 5 tentativas do mesmo IP em 15 min (contadas de forma atômica, antes de conferir a senha).
 *   Não há bloqueio "geral": senão qualquer pessoa trancaria o dono do lado de fora.
 */
const crypto = require('crypto');
const db = require('./pg');
const auth = require('./auth');
const M = require('./modules');

const SESSION_HOURS = 8;
const PER_IP = 5;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function cred() {
  let c = null;
  const envHash = String(process.env.CENTRAL_HASH || '').trim();
  if (envHash) c = { login: String(process.env.CENTRAL_LOGIN || 'super_admin').trim().toLowerCase(), hash: envHash };
  else { try { c = require('./central-cred'); } catch (e) { c = null; } }
  if (!c || typeof c.hash !== 'string' || !c.hash.startsWith('scrypt$') || !c.login) return null;
  return { login: String(c.login), hash: c.hash, rev: sha(c.hash).slice(0, 16) };
}

async function login(loginName, password, ip) {
  const c = cred();
  if (!c) return { status: 503, error: 'A Central ainda não foi configurada.' };
  const kIp = 'central:ip:' + ip;
  // conta ANTES de conferir: 40 tentativas ao mesmo tempo não passam do limite
  if (await auth.hit(kIp) > PER_IP) return { status: 429, error: 'Muitas tentativas. Espere 15 minutos.' };
  const okLogin = String(loginName || '').trim().toLowerCase() === c.login;
  const okPass = okLogin ? await auth.verifyPassword(String(password || ''), c.hash) : await auth.dummyVerify(String(password || ''));
  if (!okLogin || !okPass) return { status: 401, error: 'Usuário ou senha incorretos.' };
  await auth.clearAttempts(kIp);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(`insert into central_sessions(token_hash,cred_rev,ip,expires_at) values($1,$2,$3,now()+($4||' hours')::interval)`, [sha(token), c.rev, ip, String(SESSION_HOURS)]);
  await db.query(`delete from central_sessions where expires_at<now()`);
  return { token, maxAge: SESSION_HOURS * 3600, login: c.login };
}
async function getSession(token) {
  const c = cred();
  if (!c || !token || token.length > 100) return null;
  const r = await db.query(`select token_hash from central_sessions where token_hash=$1 and cred_rev=$2 and expires_at>now()`, [sha(token), c.rev]);
  return r.rows[0] ? { login: c.login } : null;
}
async function destroySession(token) { if (token) await db.query('delete from central_sessions where token_hash=$1', [sha(token)]); }

/* ---------- empresas ---------- */
const STATUS = ['ativa', 'em_preparo', 'suspensa'];
const tenantOut = t => ({
  id: t.id, name: t.name, logo: t.logo || null, color: t.color || null, segment: t.segment || null,
  status: t.status, primary: !!t.primary_tenant, modules: Object.freeze(M.resolve(t)), updatedAt: t.updated_at
});
async function listTenants() {
  const r = await db.query(`select t.*,
      (select count(*) from users u where u.tenant_id=t.id and u.role='admin' and u.pass_hash is not null)::int as n_admins,
      (select count(*) from users u where u.tenant_id=t.id)::int as n_users,
      (select count(*) from docs d where d.tenant_id=t.id and d.coll='products')::int as n_products,
      (select count(*) from docs d where d.tenant_id=t.id and d.coll='orders')::int as n_orders,
      (select login from users u where u.tenant_id=t.id and u.role='admin' and u.ref_id=t.admin_ref) as admin_login
    from tenants t order by primary_tenant desc, created_at`);
  return r.rows.map(t => Object.assign(tenantOut(t), { stats: { admins: t.n_admins, users: t.n_users, products: t.n_products, orders: t.n_orders }, adminLogin: t.admin_login || null }));
}

/* acesso do administrador de uma empresa: cria (ou redefine) com senha provisória mostrada UMA vez.
   A pessoa é obrigada a trocar no primeiro acesso. Não vale para a empresa principal (ela tem o próprio fluxo). */
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPass() { const b = crypto.randomBytes(16); let p = ''; for (let i = 0; i < 12; i++) p += ABC[b[i] % ABC.length]; return p.slice(0, 4) + '-' + p.slice(4, 8) + '-' + p.slice(8); }
async function tenantAdmin(b) {
  const store = require('./store');
  const id = String((b && b.id) || '').slice(0, 40);
  const cur = (await db.query('select * from tenants where id=$1', [id])).rows[0];
  if (!cur) throw httpErr(404, 'Empresa não encontrada.');
  if (cur.primary_tenant) throw httpErr(400, 'A empresa principal cuida dos próprios acessos pelo painel dela.');
  const login = String(b.login || 'admin').trim().toLowerCase();
  const name = String(b.name || 'Administrador').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) || 'Administrador';
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw httpErr(400, 'Usuário: use de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).');
  // um acesso principal por empresa: gerar de novo (mesmo com outro usuário) substitui o anterior e derruba as sessões dele
  const refId = cur.admin_ref || 'adm_' + sha(id + ':' + login).slice(0, 10);
  const pass = tempPass();
  const u = await store.setupAdmin(id, name, login, pass, { base: true, mustReset: true, reset: true, refId });
  if (!cur.admin_ref) await db.query('update tenants set admin_ref=$2 where id=$1', [id, refId]);
  return { login: u.login, password: pass, tenant: id };
}
/* empresas em memória por 5 s (mudança feita na Central vale em segundos em todas as instâncias) */
const cache = new Map();
const PRIMARY = () => process.env.TENANT_ID || 'davila';
function clearCache() { cache.clear(); }
async function tenantById(id) {
  const k = String(id || '');
  if (!/^[a-z0-9-]{1,40}$/.test(k)) return null;
  const c = cache.get(k);
  if (c && Date.now() - c.at < 5000) return c.t;
  const r = await db.query('select * from tenants where id=$1', [k]);
  let t = r.rows[0] ? Object.freeze(tenantOut(r.rows[0])) : null;
  // banco sem a linha da empresa principal (não deveria acontecer): segue com tudo ligado
  if (!t && k === PRIMARY()) t = { id: k, name: '', logo: null, color: null, modules: M.resolve({ default_on: true }), status: 'ativa', primary: true };
  // só guarda o que existe (endereço inventado não ocupa memória) e no máximo 500 empresas
  if (t) { if (cache.size >= 500) cache.delete(cache.keys().next().value); cache.set(k, { at: Date.now(), t }); }
  return t;
}
async function primaryTenant() { return tenantById(PRIMARY()); }

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
function cleanName(v) {
  // tira marcações (<b>…</b>) inteiras e qualquer < > que sobrar
  const s = String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 80) throw httpErr(400, 'O nome precisa ter de 2 a 80 caracteres.');
  return s;
}
function cleanColor(v) {
  if (v == null || v === '') return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(String(v))) throw httpErr(400, 'Cor inválida.');
  return String(v).toUpperCase();
}
function cleanLogo(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  // só PNG, JPEG ou WEBP (SVG fica de fora: pode carregar código)
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s)) throw httpErr(400, 'Logo inválida: use PNG, JPG ou WEBP.');
  if (s.length > 400 * 1024) throw httpErr(413, 'Logo grande demais (máximo de cerca de 300 KB de imagem).');
  return s;
}
function cleanModules(v) {
  const out = {};
  if (v == null) return out;
  if (typeof v !== 'object' || Array.isArray(v)) throw httpErr(400, 'Módulos inválidos.');
  for (const [k, on] of Object.entries(v)) {
    const m = M.has(M.BY_CODE, k) ? M.BY_CODE[k] : null;
    if (!m) throw httpErr(400, 'Módulo desconhecido: ' + String(k).slice(0, 30));
    if (m.essential) continue;
    if (typeof on !== 'boolean') throw httpErr(400, 'Módulo inválido: ' + k);
    out[k] = on;
  }
  return out;
}
function slug(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'empresa';
}

async function saveTenant(b) {
  if (!b || typeof b !== 'object') throw httpErr(400, 'Envio inválido.');
  const name = cleanName(b.name), color = cleanColor(b.color), logo = cleanLogo(b.logo);
  const segment = b.segment == null || b.segment === '' ? null : String(b.segment);
  if (segment && !M.has(M.SEGMENTS, segment)) throw httpErr(400, 'Segmento desconhecido.');
  // empresa nova começa "em preparo" (só o administrador entra) se nada for dito
  const status = String(b.status || (b.id ? 'ativa' : 'em_preparo'));
  if (!STATUS.includes(status)) throw httpErr(400, 'Situação inválida.');
  const modules = cleanModules(b.modules);
  if (b.id) {
    const id = String(b.id).slice(0, 40);
    const cur = (await db.query('select * from tenants where id=$1', [id])).rows[0];
    if (!cur) throw httpErr(404, 'Empresa não encontrada.');
    // a empresa principal não pode ser suspensa pela Central: trancaria todo mundo de uma vez
    if (cur.primary_tenant && status === 'suspensa') throw httpErr(400, 'A empresa principal não pode ser suspensa por aqui.');
    // grava só o que foi escolhido: módulo criado depois continua seguindo o padrão da empresa
    const merged = Object.assign({}, cur.modules || {}, modules);
    const r = await db.query(`update tenants set name=$2, color=$3, logo=$4, segment=$5, status=$6, modules=$7::jsonb, updated_at=now() where id=$1 returning *`,
      [id, name, color, logo, segment, status, JSON.stringify(merged)]);
    clearCache();
    return { tenant: tenantOut(r.rows[0]), before: tenantOut(cur) };
  }
  // empresa nova: começa com o pacote do segmento (ou só o básico) e fica "em preparo"
  const base = segment ? M.presetFor(segment) : M.presetFor('basico');
  const mods = Object.assign(base, modules);
  let id = slug(name), n = 1;
  while ((await db.query('select 1 from tenants where id=$1', [id])).rows.length) { n++; id = slug(name).slice(0, 26) + '-' + n; if (n > 50) throw httpErr(409, 'Nome repetido demais.'); }
  // tudo ou nada: a empresa nunca fica criada pela metade
  const row = await db.tx(async t => {
    const r = await t.query(`insert into tenants(id,name,color,logo,segment,status,default_on,primary_tenant,modules) values($1,$2,$3,$4,$5,$6,false,false,$7::jsonb) returning *`,
      [id, name, color, logo, segment, status, JSON.stringify(mods)]);
    // dados iniciais da empresa: nome da loja (o resto o administrador dela cadastra)
    await t.query(`insert into docs(tenant_id,coll,id,data) values($1,'meta','store',$2) on conflict do nothing`, [id, JSON.stringify({ name: name.toUpperCase(), pickupDisc: 0, pickV: 1, onerV: 2, pickupOner: false })]);
    await t.query(`insert into order_seq(tenant_id,last_no) values($1,1000) on conflict do nothing`, [id]);
    return r.rows[0];
  });
  clearCache();
  return { tenant: tenantOut(row), before: null };
}

function catalog() {
  return {
    modules: M.MODULES.map(m => ({ code: m.code, group: m.group, name: m.name, desc: m.desc, essential: !!m.essential, enforced: m.enforced || null })),
    segments: Object.entries(M.SEGMENTS).map(([id, s]) => ({ id, name: s.name, modules: M.presetFor(id) }))
  };
}

module.exports = { cred, login, getSession, destroySession, listTenants, primaryTenant, tenantById, saveTenant, tenantAdmin, clearCache, catalog, SESSION_HOURS, PRIMARY };

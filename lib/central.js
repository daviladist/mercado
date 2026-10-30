'use strict';
/*
 * Tino — Central do sistema: acesso do dono do sistema (super_admin).
 * - Separada da loja: outro cookie, outra tabela de sessões, outras rotas (/api/central/*).
 *   Sessão de administrador da loja não entra aqui, e a da Central não entra na loja.
 * - Senha: só o hash scrypt fica em lib/central-cred.js (nunca a senha). Trocar o hash
 *   derruba na hora todas as sessões da Central (cada sessão guarda a "revisão" do hash).
 * - Bloqueio: 5 erros do mesmo IP = 15 min parado; 60 erros somando todos os IPs também param.
 */
const crypto = require('crypto');
const db = require('./pg');
const auth = require('./auth');
const M = require('./modules');

const SESSION_HOURS = 8;
const PER_IP = 5, ALL = 60;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function cred() {
  let c = null;
  try { c = require('./central-cred'); } catch (e) { c = null; }
  if (!c || typeof c.hash !== 'string' || !c.hash.startsWith('scrypt$') || !c.login) return null;
  return { login: String(c.login), hash: c.hash, rev: sha(c.hash).slice(0, 16) };
}

async function login(loginName, password, ip) {
  const c = cred();
  if (!c) return { status: 503, error: 'A Central ainda não foi configurada.' };
  const kIp = 'central:ip:' + ip, kAll = 'central:all';
  if (await auth.tooMany(kIp, PER_IP) || await auth.tooMany(kAll, ALL)) return { status: 429, error: 'Muitas tentativas. Espere 15 minutos.' };
  const okLogin = String(loginName || '').trim().toLowerCase() === c.login;
  const okPass = okLogin ? await auth.verifyPassword(String(password || ''), c.hash) : await auth.dummyVerify(String(password || ''));
  if (!okLogin || !okPass) { await auth.bump(kIp); await auth.bump(kAll); return { status: 401, error: 'Usuário ou senha incorretos.' }; }
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
  status: t.status, primary: !!t.primary_tenant, modules: M.resolve(t), updatedAt: t.updated_at
});
async function listTenants() {
  const r = await db.query('select * from tenants order by primary_tenant desc, created_at');
  return r.rows.map(tenantOut);
}
/* empresa dona dos dados atuais (até a separação completa por empresa) */
let cache = { at: 0, t: null };
async function primaryTenant() {
  if (cache.t && Date.now() - cache.at < 5000) return cache.t;
  const id = process.env.TENANT_ID || 'davila';
  const r = await db.query('select * from tenants where id=$1 or primary_tenant order by (id=$1) desc limit 1', [id]);
  const t = r.rows[0] ? tenantOut(r.rows[0]) : { id, name: '', modules: M.resolve({ default_on: true }), status: 'ativa', primary: true };
  cache = { at: Date.now(), t };
  return t;
}

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
function cleanName(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim();
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
  if (s.length > 400 * 1024) throw httpErr(413, 'Logo grande demais (máximo 300 KB).');
  return s;
}
function cleanModules(v) {
  const out = {};
  if (v == null) return out;
  if (typeof v !== 'object' || Array.isArray(v)) throw httpErr(400, 'Módulos inválidos.');
  for (const [k, on] of Object.entries(v)) {
    const m = M.BY_CODE[k];
    if (!m) throw httpErr(400, 'Módulo desconhecido: ' + String(k).slice(0, 30));
    if (m.essential) continue;
    if (typeof on !== 'boolean') throw httpErr(400, 'Módulo inválido: ' + k);
    out[k] = on;
  }
  return out;
}
function slug(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'empresa';
}

async function saveTenant(b) {
  if (!b || typeof b !== 'object') throw httpErr(400, 'Envio inválido.');
  const name = cleanName(b.name), color = cleanColor(b.color), logo = cleanLogo(b.logo);
  const segment = b.segment == null || b.segment === '' ? null : String(b.segment);
  if (segment && !M.SEGMENTS[segment]) throw httpErr(400, 'Segmento desconhecido.');
  const status = String(b.status || 'ativa');
  if (!STATUS.includes(status)) throw httpErr(400, 'Situação inválida.');
  const modules = cleanModules(b.modules);
  if (b.id) {
    const id = String(b.id).slice(0, 40);
    const cur = (await db.query('select * from tenants where id=$1', [id])).rows[0];
    if (!cur) throw httpErr(404, 'Empresa não encontrada.');
    // a empresa principal não pode ser suspensa pela Central: trancaria todo mundo de uma vez
    if (cur.primary_tenant && status === 'suspensa') throw httpErr(400, 'A empresa principal não pode ser suspensa por aqui.');
    const merged = Object.assign({}, M.resolve(cur), modules);
    M.MODULES.filter(m => m.essential).forEach(m => { delete merged[m.code]; });
    const r = await db.query(`update tenants set name=$2, color=$3, logo=$4, segment=$5, status=$6, modules=$7::jsonb, updated_at=now() where id=$1 returning *`,
      [id, name, color, logo, segment, status, JSON.stringify(merged)]);
    cache.t = null;
    return { tenant: tenantOut(r.rows[0]), before: tenantOut(cur) };
  }
  // empresa nova: começa com o pacote do segmento (ou só o básico) e fica "em preparo"
  const base = segment ? M.presetFor(segment) : M.presetFor('basico');
  const mods = Object.assign(base, modules);
  let id = slug(name), n = 1;
  while ((await db.query('select 1 from tenants where id=$1', [id])).rows.length) { n++; id = slug(name).slice(0, 26) + '-' + n; if (n > 50) throw httpErr(409, 'Nome repetido demais.'); }
  const r = await db.query(`insert into tenants(id,name,color,logo,segment,status,default_on,primary_tenant,modules) values($1,$2,$3,$4,$5,$6,false,false,$7::jsonb) returning *`,
    [id, name, color, logo, segment, status === 'suspensa' ? 'suspensa' : (status || 'em_preparo'), JSON.stringify(mods)]);
  return { tenant: tenantOut(r.rows[0]), before: null };
}

function catalog() {
  return {
    modules: M.MODULES.map(m => ({ code: m.code, group: m.group, name: m.name, desc: m.desc, essential: !!m.essential, enforced: !!m.enforced })),
    segments: Object.entries(M.SEGMENTS).map(([id, s]) => ({ id, name: s.name, modules: M.presetFor(id) }))
  };
}

module.exports = { cred, login, getSession, destroySession, listTenants, primaryTenant, saveTenant, catalog, SESSION_HOURS };

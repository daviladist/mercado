'use strict';
/*
 * Senhas e sessões.
 * - Senhas: scrypt (memória alta, resistente a GPU), sal aleatório por senha,
 *   parâmetros OWASP (N=2^17, r=8, p=1). Formato: scrypt$17$8$1$<sal>$<hash>.
 * - Sessão: token aleatório de 256 bits num cookie HttpOnly/Secure/SameSite=Strict.
 *   No banco fica só o SHA-256 do token (quem lê o banco não consegue entrar).
 * - Bloqueio: 5 erros seguidos no mesmo usuário = 15 min bloqueado; 30 erros
 *   por IP em 15 min = bloqueio do IP.
 */
const crypto = require('crypto');
const db = require('./pg');

const ROLES = ['admin', 'cliente', 'vendedor', 'conferente', 'faturamento', 'entregador'];
const SCRYPT = { logN: 17, r: 8, p: 1 };

function scrypt(pass, salt, logN, r, p) {
  return new Promise((res, rej) => crypto.scrypt(String(pass).normalize('NFKC'), salt, 32,
    { N: 2 ** logN, r, p, maxmem: 256 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
}
async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(pass, salt, SCRYPT.logN, SCRYPT.r, SCRYPT.p);
  return ['scrypt', SCRYPT.logN, SCRYPT.r, SCRYPT.p, salt.toString('base64'), k.toString('base64')].join('$');
}
async function verifyPassword(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
  const [, logN, r, p, salt, hash] = parts;
  const k = await scrypt(pass, Buffer.from(salt, 'base64'), Number(logN), Number(r), Number(p));
  const h = Buffer.from(hash, 'base64');
  return h.length === k.length && crypto.timingSafeEqual(h, k);
}
// hash falso para gastar o mesmo tempo quando o usuário não existe (não revela quem existe)
let DUMMY = null;
async function dummyVerify(pass) { if (!DUMMY) DUMMY = await hashPassword('x' + crypto.randomBytes(8).toString('hex')); await verifyPassword(pass, DUMMY); return false; }

function passwordProblem(pass, login, role) {
  const s = String(pass || '');
  const min = role === 'admin' ? 10 : 8;
  if (s.length < min) return `A senha precisa ter pelo menos ${min} caracteres.`;
  if (s.length > 200) return 'Senha longa demais.';
  if (login && s.toLowerCase().includes(String(login).toLowerCase())) return 'A senha não pode conter o usuário.';
  if (!/[a-zA-ZÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  if (/^(\d)\1+$/.test(s) || /^(0123|1234|2345|3456|4567|5678|6789)/.test(s) && /^\d+$/.test(s)) return 'Senha fácil demais. Misture letras e números.';
  if (['12345678', 'senha123', 'password', 'atacado', 'davila123'].some(w => s.toLowerCase().includes(w))) return 'Senha fácil demais. Escolha outra.';
  return '';
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SESSION_HOURS = { admin: 12, faturamento: 12, conferente: 12, vendedor: 24 * 7, entregador: 24 * 7, cliente: 24 * 30 };

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hours = SESSION_HOURS[user.role] || 12;
  await db.query(`insert into sessions(token_hash,user_id,expires_at) values($1,$2,now()+($3||' hours')::interval)`, [sha(token), user.id, String(hours)]);
  return { token, maxAge: hours * 3600 };
}
async function getSession(token) {
  if (!token || token.length > 100) return null;
  const r = await db.query(`select u.id,u.tenant_id,u.role,u.login,u.name,u.ref_id,u.must_reset,u.active,s.expires_at
    from sessions s join users_t u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()`, [sha(token)]);
  const u = r.rows[0];
  if (!u || !u.active) return null;
  db.query('update sessions set last_seen=now() where token_hash=$1', [sha(token)]).catch(() => {});
  return u;
}
async function destroySession(token) { if (token) await db.query('delete from sessions where token_hash=$1', [sha(token)]); }

async function attempts(key) {
  const r = await db.query(`select n from login_attempts where key=$1 and first_at>now()-interval '15 minutes'`, [key]);
  return r.rows[0] ? Number(r.rows[0].n) : 0;
}
async function bump(key) { await hit(key); }
// só as chaves DESTE usuário: 'u:12' e 'u:12|ip:...' (nunca 'u:120...', que é outra pessoa)
async function clearUserLocks(userId) { await db.query(`delete from login_attempts where key=$1 or key like $2`, ['u:' + userId, 'u:' + userId + '|%']); }
async function clearAttempts(key) { await db.query('delete from login_attempts where key=$1', [key]); }
/* conta mais uma tentativa e devolve o total, numa operação só (tentativas em paralelo não furam o limite) */
async function hit(key) {
  const r = await db.query(`insert into login_attempts(key,n,first_at) values($1,1,now())
    on conflict(key) do update set n=case when login_attempts.first_at>now()-interval '15 minutes' then login_attempts.n+1 else 1 end,
    first_at=case when login_attempts.first_at>now()-interval '15 minutes' then login_attempts.first_at else now() end returning n`, [key]);
  return Number(r.rows[0].n);
}
async function unhit(key) { await db.query(`update login_attempts set n=greatest(n-1,0) where key=$1`, [key]); }
async function tooMany(key, max) { return (await attempts(key)) >= max; }
const PER_USER_IP = 5, PER_USER = 60, PER_IP = 30;
const GENERIC = 'Usuário ou senha incorretos.';

/* login: usuário (cliente também pode usar o CNPJ/CPF) + senha. Uma tela só: o servidor acha o papel.
   Bloqueio: 5 erros do MESMO aparelho/IP num usuário bloqueiam só aquele IP (ninguém tranca o dono de fora);
   60 erros no usuário somando todos os IPs, ou 30 erros de um IP em qualquer usuário, também bloqueiam. */
async function login(tid, role, loginName, pass, ip) {
  if (!tid) return { error: 'Empresa não encontrada.', status: 404 };
  const u = String(loginName || '').trim().toLowerCase().slice(0, 120);
  const digits = u.replace(/\D/g, '');
  const ikey = 'ip:' + ip;
  if (!u) return { error: 'Informe o usuário.' };
  const onlyCli = role === 'cliente-only';
  let r = await db.query('select * from users_t where tenant_id=$1 and login=$2 and active order by id', [tid, u]);
  if (!r.rows.length && digits.length >= 11) r = await db.query(`select * from users_t where tenant_id=$1 and role='cliente' and doc=$2 and active`, [tid, digits]);
  // chave do bloqueio: a pessoa encontrada (id), não o texto digitado (CNPJ com ou sem pontos é a mesma pessoa)
  const ids = r.rows.map(x => x.id);
  const ukey = ids.length ? 'u:' + ids[0] : 'n:' + tid + ':' + (digits.length >= 11 ? digits : u);
  const uikey = ukey + '|' + ikey;
  // conta a tentativa ANTES de conferir a senha, numa operação só: tentativas em paralelo não furam o limite
  const nIp = await hit(ikey), nU = await hit(ukey), nUI = await hit(uikey);
  if (nIp > PER_IP) return { error: 'Muitas tentativas deste aparelho. Espere 15 minutos.', status: 429 };
  if (nUI > PER_USER_IP || nU > PER_USER) return { error: 'Usuário bloqueado por 15 minutos depois de muitas senhas erradas. Se precisar, a loja pode redefinir a sua senha.', status: 429 };
  let user = null;
  for (const x of r.rows) { if (x.pass_hash && await verifyPassword(pass, x.pass_hash)) { user = x; break; } }
  if (!r.rows.length || r.rows.every(x => !x.pass_hash)) await dummyVerify(pass);
  if (!user) {
    const left = PER_USER_IP - nUI;
    return { error: GENERIC + (left > 0 && left <= 3 ? ` Restam ${left} tentativa${left > 1 ? 's' : ''} antes de bloquear por 15 minutos.` : '') + ' Primeiro acesso? Peça à loja a senha base.' };
  }
  // senha certa: esta tentativa não conta contra a pessoa nem contra o aparelho (muita gente entra pelo mesmo Wi-Fi)
  await clearAttempts(uikey); await unhit(ukey); await unhit(ikey);
  // /cliente é só para clientes: a pessoa da equipe (com a senha certa) recebe um aviso, sem contar como erro
  if (onlyCli && user.role !== 'cliente') return { error: 'Este link é só para clientes. A equipe da loja entra pelo app da equipe.', status: 403 };
  db.query(`delete from sessions where expires_at<now()-interval '1 day'`).catch(() => {});
  db.query(`delete from login_attempts where first_at<now()-interval '1 day'`).catch(() => {});
  const s = await createSession(user);
  return { user, ...s };
}
/* senha base (provisória) que o administrador cria: regra simples, a pessoa troca no 1º acesso */
function basePasswordProblem(pass, login) {
  const s = String(pass || '');
  if (s.length < 8) return 'A senha base precisa ter pelo menos 8 caracteres.';
  if (s.length > 200) return 'Senha longa demais.';
  if (login && s.toLowerCase().includes(String(login).toLowerCase())) return 'A senha base não pode conter o usuário.';
  return '';
}

async function changePassword(userId, current, next, keepToken) {
  const r = await db.query('select * from users_t where id=$1', [userId]);
  const u = r.rows[0];
  if (!u) return { error: 'Usuário não encontrado.' };
  if (!(await verifyPassword(current, u.pass_hash))) return { error: 'A senha atual está errada.' };
  if (current === next) return { error: 'A nova senha precisa ser diferente da atual.' };
  const prob = passwordProblem(next, u.login, u.role);
  if (prob) return { error: prob };
  await db.query('update users_t set pass_hash=$1,must_reset=false,updated_at=now() where id=$2', [await hashPassword(next), u.id]);
  // quem tinha a sessão roubada perde o acesso: só fica a sessão de quem trocou
  await db.query('delete from sessions where user_id=$1 and token_hash<>$2', [u.id, sha(String(keepToken || ''))]);
  await clearUserLocks(u.id);
  return { ok: true };
}

module.exports = { clearUserLocks, tooMany, bump, hit, clearAttempts, dummyVerify, ROLES, hashPassword, verifyPassword, passwordProblem, basePasswordProblem, login, getSession, destroySession, changePassword, createSession, sha };

'use strict';
/* Gerador de Encartes (ramo 'encartes'): o app roda no navegador (public/encartes.html + public/encartes/app.js);
   aqui ficam só a "nuvem" dele, por empresa:
   - documentos (estado da campanha, rascunho de cada pessoa, encartes salvos, banco de produtos), como texto JSON;
   - imagens (fotos dos produtos, logos, fundos), guardadas no banco em base64;
   - equipe: o dono (admin) cria o acesso dos funcionários (no banco é o papel 'caixista', o mesmo do painel gerencial).
   Dono = admin; funcionário = caixista. O funcionário não grava o banco de produtos nem mexe na equipe. */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const auth = require('./auth');
const { hashPassword } = auth;
const httpErr = store.httpErr;

const PATH_RE = /^[A-Za-z0-9][A-Za-z0-9/_:.-]{0,199}$/;
const MAX_DOC = 3 * 1024 * 1024;       // um documento (o estado da campanha é o maior)
const MAX_IMG = 3 * 1024 * 1024;       // uma imagem, já em base64
const IMG_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPass() { const b = crypto.randomBytes(16); let p = ''; for (let i = 0; i < 12; i++) p += ABC[b[i] % ABC.length]; return p.slice(0, 4) + '-' + p.slice(4, 8) + '-' + p.slice(8); }

const isDono = u => u.role === 'admin';
const meuId = u => (isDono(u) ? 'a_' : 'f_') + String(u.ref_id || u.id);
function checkPath(p, user, escrever) {
  p = String(p || '');
  if (!PATH_RE.test(p) || p.includes('..') || p.includes('//')) throw httpErr(400, 'Endereço inválido.');
  const m = /^data\/users\/([^/]+)\//.exec(p);
  if (m && m[1] !== meuId(user) && !isDono(user)) throw httpErr(403, 'Este rascunho é de outra pessoa.');
  if (escrever && p === 'app/catalogo' && !isDono(user)) throw httpErr(403, 'Só o dono atualiza o banco de produtos.');
  return p;
}
function need(user) { if (!isDono(user)) throw httpErr(403, 'Só o dono mexe na equipe.'); }

async function pessoas(tid) {
  const r = await db.query(`select login, name, active, must_reset from users_t where tenant_id=$1 and role='caixista' order by name`, [tid]);
  return r.rows.map(u => ({ login: u.login, nome: u.name, ativo: u.active, trocarSenha: u.must_reset }));
}
async function savePessoa(tid, user, b) {
  need(user);
  const login = String(b.login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw httpErr(400, 'Usuário: use de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).');
  const cur = (await db.query(`select ref_id, name, active from users_t where tenant_id=$1 and role='caixista' and login=$2`, [tid, login])).rows[0];
  const clash = await db.query(`select 1 from users_t where tenant_id=$1 and login=$2 and role<>'caixista'`, [tid, login]);
  if (clash.rows.length) throw httpErr(400, `O usuário "${login}" já é usado por outra pessoa. Escolha outro.`);
  const nome = String(b.nome == null ? (cur ? cur.name : '') : b.nome).trim().slice(0, 80);
  if (nome.length < 2) throw httpErr(400, 'Nome: escreva pelo menos 2 letras.');
  const ativo = typeof b.ativo === 'boolean' ? b.ativo : (cur ? cur.active : true);
  const refId = cur ? cur.ref_id : 'e' + crypto.randomBytes(8).toString('hex');
  let novaSenha = null, pass = null;
  if (!cur || b.novaSenha === true) { novaSenha = tempPass(); pass = await hashPassword(novaSenha); }
  await db.query(`insert into users_t(tenant_id,role,login,ref_id,name,pass_hash,must_reset,active) values($1,'caixista',$2,$3,$4,$5,true,$6)
    on conflict(tenant_id,role,ref_id) do update set login=excluded.login, name=excluded.name, active=excluded.active,
      pass_hash=coalesce($5,users_t.pass_hash), must_reset=case when $5 is null then users_t.must_reset else true end, updated_at=now()`,
  [tid, login, refId, nome, pass, ativo]);
  if (pass || !ativo) await db.query(`delete from sessions where user_id in (select id from users_t where tenant_id=$1 and role='caixista' and ref_id=$2)`, [tid, refId]);
  return { login, nome, ativo, password: novaSenha };
}

async function handle({ path, method, user, tid, query, body, audit }) {
  if (path === '/api/encartes/me') return { id: meuId(user), dono: isDono(user), nome: user.name || user.login || '' };
  if (path === '/api/encartes/doc' && method === 'GET') {
    const p = checkPath(query.get('p'), user, false);
    const r = await db.query('select data, extract(epoch from updated_at)*1000 as at from enc_docs where tenant_id=$1 and path=$2', [tid, p]);
    if (!r.rows.length) return { exists: false };
    let data = null; try { data = JSON.parse(r.rows[0].data); } catch (e) { data = null; }
    return { exists: data != null, data };
  }
  if (path === '/api/encartes/doc' && method === 'POST') {
    const b = await body();
    const p = checkPath(b.p, user, true);
    if (b.del === true) { await db.query('delete from enc_docs where tenant_id=$1 and path=$2', [tid, p]); return { ok: true }; }
    if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) throw httpErr(400, 'Envio inválido.');
    const txt = JSON.stringify(b.data);
    if (txt.length > MAX_DOC) throw httpErr(413, 'Grande demais para a nuvem.');
    await db.query(`insert into enc_docs(tenant_id,path,data,updated_by) values($1,$2,$3,$4)
      on conflict(tenant_id,path) do update set data=excluded.data, updated_by=excluded.updated_by, updated_at=now()`, [tid, p, txt, meuId(user)]);
    return { ok: true };
  }
  if (path === '/api/encartes/col' && method === 'GET') {
    const pre = String(query.get('p') || '').replace(/\/+$/, '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(pre)) throw httpErr(400, 'Endereço inválido.');
    const r = await db.query(`select path, data from enc_docs where tenant_id=$1 and path like $2 order by updated_at desc limit 500`, [tid, pre + '/%']);
    const docs = [];
    for (const x of r.rows) { if (x.path.slice(pre.length + 1).includes('/')) continue; try { docs.push({ p: x.path, data: JSON.parse(x.data) }); } catch (e) { /* ignora */ } }
    return { docs };
  }
  if (path === '/api/encartes/blob' && method === 'POST') {
    const b = await body();
    const m = IMG_RE.exec(String(b.data || ''));
    if (!m) throw httpErr(400, 'Imagem inválida (use PNG, JPG ou WEBP).');
    if (m[2].length > MAX_IMG) throw httpErr(413, 'Imagem grande demais.');
    const id = crypto.createHash('sha256').update(m[2]).digest('hex').slice(0, 32);
    await db.query(`insert into enc_blobs(tenant_id,id,mime,b64) values($1,$2,$3,$4) on conflict(tenant_id,id) do nothing`, [tid, id, m[1], m[2]]);
    return { id };
  }
  if (path === '/api/encartes/blob' && method === 'GET') {
    const id = String(query.get('id') || '');
    if (!/^[a-f0-9]{32}$/.test(id)) throw httpErr(400, 'Imagem inválida.');
    const r = await db.query('select mime, b64 from enc_blobs where tenant_id=$1 and id=$2', [tid, id]);
    if (!r.rows.length) throw httpErr(404, 'Imagem não encontrada.');
    return { raw: Buffer.from(r.rows[0].b64, 'base64'), type: r.rows[0].mime };
  }
  if (path === '/api/encartes/pessoas' && method === 'GET') { need(user); return { pessoas: await pessoas(tid) }; }
  if (path === '/api/encartes/pessoa' && method === 'POST') {
    const out = await savePessoa(tid, user, await body());
    await audit('encartes_pessoa', { login: out.login, ativo: out.ativo, novaSenha: !!out.password });
    return out;
  }
  throw httpErr(404, 'Não encontrado.');
}

module.exports = { handle, checkPath, meuId, savePessoa, pessoas };

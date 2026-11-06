'use strict';
require('./envguard');   // chaves só de teste ficam desligadas na Vercel
/* Rotas da API. Funciona na Vercel (api/index.js) e no servidor local (scripts/dev-server.js). */
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');
const policy = require('./policy');
const central = require('./central');
const MODS = require('./modules');
const PERM = require('./perms');
const pdv = require('./pdv');
const errlog = require('./errlog');
const rural = require('./rural');
const loja = require('./loja');
const caixa = require('./caixa');

const fs = require('fs');
const zlib = require('zlib');
const pathMod = require('path');
const MAX_BODY = 4 * 1024 * 1024;
/* /t/<empresa>, /t/<empresa>/cliente e /t/<empresa>/pdv: a página sai com nome, cor e ícone da empresa
   (é o que o celular lê ao "instalar o app"); nada da empresa principal aparece numa empresa contratante */
const PAGE_RE = /^\/t\/([a-z0-9-]{1,40})(\/cliente|\/pdv|\/loja)?$/;
const pageCache = {};
function pageHtml(f) { if (!pageCache[f]) pageCache[f] = fs.readFileSync(pathMod.join(__dirname, '..', 'public', f), 'utf8'); return pageCache[f]; }
const escA = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const logoUrl = t => '/api/logo?t=' + encodeURIComponent(t.id) + '&v=' + encodeURIComponent(String(t.updatedAt ? new Date(t.updatedAt).getTime() : 1));
/* prévia do link no WhatsApp/Telegram/redes: nome, frase e imagem da própria empresa (Tino se não tiver logo) */
function ogTags(req, t, kind) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-z0-9.:-]/gi, '');
  const proto = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const base = host ? proto + '://' + host : '';
  const name = String(t.name || 'Tino');
  const img = base + (t.logo ? logoUrl(t) : '/icons/tino-512.png');
  const path = '/t/' + t.id + (kind === 'cliente' ? '/cliente' : kind === 'pdv' ? '/pdv' : kind === 'loja' ? '/loja' : '/');
  const desc = kind === 'loja' ? 'Compre online na ' + name + ': escolha, monte o carrinho e envie o pedido pelo celular.' : kind === 'lojaadm' ? 'Painel da loja online ' + name + '.' : kind === 'rural' ? 'Roças, despesas, vendas e acerto com os meeiros de ' + name + '.' : kind === 'caixa' ? 'Painel gerencial de ' + name + ': controle de caixa, sacolas das filiais e conferência com o StarIA.' : kind === 'cliente' ? 'Faça seus pedidos com a ' + name + '. Quem tem Tino, vende melhor.' : kind === 'pdv' ? 'Caixa de balcão da ' + name + '.' : 'Acesso da equipe da ' + name + ': vendedores, conferência, faturamento e entregas.';
  const title = kind === 'cliente' || kind === 'rural' || kind === 'loja' || kind === 'caixa' ? name : kind === 'lojaadm' ? name + ' · Painel' : name + (kind === 'pdv' ? ' · Caixa' : ' · Equipe');
  return ['<meta property="og:type" content="website">', '<meta property="og:site_name" content="' + escA(name) + '">', '<meta property="og:title" content="' + escA(title) + '">',
    '<meta property="og:description" content="' + escA(desc) + '">', '<meta name="description" content="' + escA(desc) + '">',
    base ? '<meta property="og:url" content="' + escA(base + path) + '">' : '', '<meta property="og:image" content="' + escA(img) + '">', '<meta property="og:image:alt" content="' + escA(name) + '">',
    '<meta name="twitter:card" content="summary">'].join('');
}
async function servePage(req, res, slug, kind) {
  await require('./schema').ensureSchema();
  const t = await central.tenantById(slug);
  if (!t) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><meta charset="utf-8"><title>Empresa não encontrada</title><p style="font:16px system-ui;padding:24px">Endereço não encontrado. Confira o link com a empresa.</p>'); }
  if (t.primary) { res.statusCode = 302; res.setHeader('Location', kind === 'cliente' ? '/cliente' : kind === 'pdv' ? '/pdv' : '/'); return res.end(); }
  // produtor rural e controle de caixa: um endereço só (/t/<empresa>/), com o app único (sem vitrine/cliente)
  const isRural = t.ramo === 'rural', isLoja = t.ramo === 'loja', isCaixa = t.ramo === 'caixa';
  if ((isRural || isCaixa) && kind !== 'equipe') { res.statusCode = 302; res.setHeader('Location', '/t/' + t.id + '/'); return res.end(); }
  // loja online: /t/<empresa>/loja = vitrine do cliente; /t/<empresa>/ = painel da loja; /cliente leva para a vitrine
  if (isLoja && (kind === 'cliente' || kind === 'pdv')) { res.statusCode = 302; res.setHeader('Location', '/t/' + t.id + (kind === 'cliente' ? '/loja' : '/')); return res.end(); }
  if (!isLoja && kind === 'loja') { res.statusCode = 302; res.setHeader('Location', '/t/' + t.id + '/'); return res.end(); }
  const pageKind = isRural ? 'rural' : isCaixa ? 'caixa' : isLoja ? (kind === 'loja' ? 'loja' : 'lojaadm') : kind;
  const cli = kind === 'cliente', name = String(t.name || 'Tino');
  const title = cli || isRural || isCaixa || pageKind === 'loja' ? name : pageKind === 'lojaadm' ? name + ' Painel' : name + (kind === 'pdv' ? ' Caixa' : ' Equipe');
  const color = /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '#1F3D2B';
  const icon = t.logo ? logoUrl(t) : '/icons/tino-180.png', icon192 = t.logo ? logoUrl(t) : '/icons/tino-192.png';
  const pre = { id: t.id, name, color: t.color || null };
  const h = pageHtml(isRural ? 'rural.html' : isCaixa ? 'caixa.html' : pageKind === 'loja' ? 'loja.html' : pageKind === 'lojaadm' ? 'lojaadm.html' : cli ? 'cliente.html' : 'index.html')
    .replace(/<title>[^<]*<\/title>/, '<title>' + escA(title) + '</title>')
    .replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="' + color + '">')
    .replace(/<link rel="manifest" href="[^"]*">/, '<link rel="manifest" href="/api/manifest?t=' + encodeURIComponent(t.id) + (cli || pageKind === 'loja' ? '&amp;k=cliente' : '') + '">')
    .replace(/<link rel="apple-touch-icon" href="[^"]*">/, '<link rel="apple-touch-icon" href="' + escA(icon) + '">')
    .replace(/<link rel="icon" type="image\/png" sizes="192x192" href="[^"]*">/, '<link rel="icon" type="image/png" sizes="192x192" href="' + escA(icon192) + '">')
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="' + escA(name.slice(0, 30)) + '">')
    .replace('<head>', '<head><meta name="tino-brand" content="' + escA(JSON.stringify(pre)) + '">' + ogTags(req, t, pageKind));
  res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache');
  return res.end(h);
}
const SECURE = process.env.DEV_INSECURE_COOKIE !== '1';
const COOKIE = SECURE ? '__Host-sid' : 'sid';
// cookie da Central do sistema (Tino): separado do cookie da loja
const CCOOKIE = SECURE ? '__Host-csid' : 'csid';

function send(res, status, body, headers = {}) {
  let data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.statusCode = status;
  const type = headers['Content-Type'] || 'application/json; charset=utf-8';
  // resposta de texto acima de ~1 KB vai comprimida (gzip) quando o navegador aceita: o estado de uma loja grande
  // cabe com folga no limite de resposta da Vercel (4,5 MB) e chega mais rápido no celular
  const req = res.__req, ae = String((req && req.headers['accept-encoding']) || '');
  if (/\bgzip\b/i.test(ae) && /^(application\/(json|manifest\+json)|text\/)/.test(type) && Buffer.byteLength(data) > 1024) {
    data = zlib.gzipSync(data, { level: 6 }); res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', headers['Cache-Control'] || 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  Object.entries(headers).forEach(([k, v]) => { if (k !== 'Content-Type' && k !== 'Cache-Control') res.setHeader(k, v); });
  res.end(data);
}
function cookies(req) {
  const out = {};
  // cookie estragado (ex.: "%E0%A4%A") não derruba a requisição: vale como não enviado
  String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* ignora */ } } });
  return out;
}
function setCookie(res, token, maxAge, name = COOKIE) {
  // maxAge null: cookie da sessão do navegador ("Manter conectado" desmarcado: sai ao fechar o navegador)
  const parts = [`${name}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'].concat(maxAge == null ? [] : [`Max-Age=${maxAge}`]);
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
  if (user && user.suporte) detail = Object.assign({}, detail || {}, { suporte: true });
  try { await db.query('insert into audit(user_id,role,action,detail,tenant_id) values($1,$2,$3,$4,$5)', [user ? user.id : null, user ? user.role : null, action, JSON.stringify(detail || {}), (user && user.tenant_id) || tid || null]); }
  catch (e) { console.error('audit falhou:', action, e.message); }
}
// sessão de suporte (aberta pela Central): não pede troca de senha e avisa na tela até quando vale
const meOut = u => Object.assign({ role: u.role, name: u.name, refId: u.ref_id, login: u.login, mustReset: !!u.must_reset && !u.suporte }, u.suporte ? { suporte: true, ate: u.expires_at } : {}, u.role === 'admin' ? { perms: u.perms || null } : {});

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
  res.__req = req;   // send() olha o Accept-Encoding
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  let errTid = null;   // empresa da requisição (para o painel de erros da Central)
  try {
    { const pm = (method === 'GET' || method === 'HEAD') && PAGE_RE.exec(path); if (pm) return await servePage(req, res, pm[1], pm[2] ? pm[2].slice(1) : 'equipe'); }
    await require('./schema').ensureSchema();
    // aviso do robô do Telegram (DRE): vem do servidor do Telegram, sem X-App; quem confere é o segredo do webhook
    { const tm = method === 'POST' && /^\/api\/tg\/([a-z0-9-]{1,64})$/.exec(path);
      if (tm) {
        let upd = null; try { upd = await readBody(req); } catch (e) { upd = null; }
        let out = { status: 200 };
        try { out = await require('./telegram').webhook(tm[1], req.headers, upd); } catch (e) { console.error('telegram', e && e.message); }
        return send(res, out.status, { ok: out.status === 200 });
      } }
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
      return send(res, 200, { id: reqTenant.id, name: reqTenant.name, color: reqTenant.color, logo: reqTenant.logo, primary: !!reqTenant.primary, ramo: reqTenant.ramo || 'atacado', clientes: !!(reqTenant.modules && reqTenant.modules.app_cliente) });
    }
    if (path === '/api/logo' && method === 'GET') {
      const lt = await central.tenantById(String(url.searchParams.get('t') || ''));
      const m = lt && lt.logo && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(lt.logo);
      if (!m) { res.statusCode = 302; res.setHeader('Location', '/icons/tino-192.png'); return res.end(); }
      return send(res, 200, Buffer.from(m[2], 'base64'), { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' });
    }
    if (path === '/api/manifest' && method === 'GET') {
      const mt = await central.tenantById(String(url.searchParams.get('t') || '').toLowerCase());
      if (!mt || mt.primary) return send(res, 404, { error: 'Empresa não encontrada.' });
      return send(res, 200, manifestFor(mt, url.searchParams.get('k') === 'cliente'), { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
    }
    if (!reqTenant) return send(res, 404, { error: 'Empresa não encontrada. Confira o endereço.' });
    errTid = reqTenant.id;
    // Loja online: vitrine, pedido e acompanhamento são públicos (sem login); a empresa vem do endereço
    if (path.startsWith('/api/loja/') && !path.startsWith('/api/loja/admin/')) {
      const qt = String(url.searchParams.get('t') || '').toLowerCase();
      const LT = !tHdr && qt ? await central.tenantById(qt) : reqTenant;
      if (!LT || LT.ramo !== 'loja') return send(res, 404, { error: 'Loja não encontrada.' });
      const out = await loja.publico({ path, method, T: LT, query: url.searchParams, body: () => readBody(req), ip: clientIp(req) });
      if (!out) return send(res, 404, { error: 'Não encontrado.' });
      if (out.raw) return send(res, 200, out.raw, { 'Content-Type': out.type, 'Cache-Control': 'public, max-age=604800, immutable' });
      if (path === '/api/loja/pedido') await audit(null, 'loja_pedido_novo', { numero: out.json.numero, ip: clientIp(req) }, LT.id);
      return send(res, 200, out.json);
    }
    if (reqTenant.status === 'suspensa') return send(res, 403, { error: 'Acesso suspenso. Fale com o suporte.', login: true });
    if (path === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      // keep: true = "Manter conectado" (sessão mais longa); false = sai ao fechar o navegador; sem o campo = como sempre foi
      const keep = b.keep === true ? true : b.keep === false ? false : undefined;
      const r = await auth.login(reqTenant.id, String(b.role || ''), String(b.login || ''), String(b.password || ''), clientIp(req), keep);
      if (r.error) { if (r.status !== 429) await audit(null, 'login_falhou', { role: b.role, login: String(b.login || '').slice(0, 60), ip: clientIp(req) }, reqTenant.id); return send(res, r.status || 401, { error: r.error }); }
      if (!statusAllows(reqTenant, r.user.role)) { await auth.destroySession(r.token); return send(res, 403, { error: 'A loja ainda está sendo preparada. Tente mais tarde.' }); }
      if (!roleAllowed(reqTenant, r.user.role)) { await auth.destroySession(r.token); return send(res, 403, { error: 'Este acesso não está liberado para esta empresa.' }); }
      setCookie(res, r.token, keep === false ? null : r.maxAge);
      if (r.user.role === 'admin') r.user.perms = await store.adminPerms(r.user.tenant_id, r.user.ref_id);
      await audit(r.user, 'login', { ip: clientIp(req), keep });
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
    errTid = tid;
    if (!T || T.status === 'suspensa') return send(res, 403, { error: 'Acesso suspenso. Fale com o suporte.', login: true });
    if (!statusAllows(T, user.role)) return send(res, 403, { error: 'A loja ainda está sendo preparada. Tente mais tarde.', login: true });
    if (!roleAllowed(T, user.role)) return send(res, 403, { error: 'Este acesso foi desligado. Fale com a loja.', login: true });
    if (user.role === 'admin') user.perms = await store.adminPerms(tid, user.ref_id);
    if (path === '/api/me') return send(res, 200, meOut(user));
    // só nos testes automáticos (variável ligada no CI): provoca um erro inesperado para conferir o painel de erros da Central
    if (process.env.TINO_TESTE_ERRO === '1' && path === '/api/teste-erro') { const x = null; return x.forcado; }
    if (path === '/api/password' && method === 'POST') {
      if (user.suporte) return send(res, 403, { error: 'No modo suporte não dá para trocar a senha do administrador.' });
      const b = await readBody(req);
      const r = await auth.changePassword(user.id, String(b.current || ''), String(b.next || ''), token);
      if (r.error) return send(res, 400, { error: r.error });
      await audit(user, 'troca_senha', {});
      return send(res, 200, { ok: true });
    }
    if (user.must_reset && !user.suporte) return send(res, 403, { error: 'Crie uma senha nova antes de continuar.', mustReset: true });

    // Produtor rural: só o app do produtor (/api/rural/*). As rotas do atacado não existem para ele, e vice-versa.
    if (T.ramo === 'rural') {
      if (!path.startsWith('/api/rural/')) return send(res, 404, { error: 'Não disponível para este tipo de empresa.' });
      const out = await rural.handle({ path, method, user, tid, T, query: url.searchParams, body: () => readBody(req), audit: (a, d) => audit(user, a, d) });
      return send(res, 200, out);
    }
    if (path.startsWith('/api/rural/')) return send(res, 404, { error: 'Não encontrado.' });
    // Loja online: o painel só usa /api/loja/admin/*; as rotas do atacado não existem para ela, e vice-versa
    if (T.ramo === 'loja') {
      if (!path.startsWith('/api/loja/admin/')) return send(res, 404, { error: 'Não disponível para este tipo de empresa.' });
      const out = await loja.handle({ path, method, user, tid, T, body: () => readBody(req), audit: (a, d) => audit(user, a, d) });
      return send(res, 200, out);
    }
    if (path.startsWith('/api/loja/')) return send(res, 404, { error: 'Não encontrado.' });
    // Controle de caixa: só /api/caixa/* (admin e caixista); as rotas do atacado não existem para ela, e vice-versa
    if (T.ramo === 'caixa') {
      if (!path.startsWith('/api/caixa/')) return send(res, 404, { error: 'Não disponível para este tipo de empresa.' });
      const out = await caixa.handle({ path, method, user, tid, T, query: url.searchParams, body: () => readBody(req), audit: (a, d) => audit(user, a, d) });
      return send(res, 200, out);
    }
    if (path.startsWith('/api/caixa/')) return send(res, 404, { error: 'Não encontrado.' });

    if (path === '/api/version') {
      const r = await db.query(`select coalesce(max(updated_at),'epoch')::text as v, count(*)::int as n, (select updated_at::text from tenants where id=$1) as t from docs_t where tenant_id=$1`, [tid]);
      return send(res, 200, { v: r.rows[0].v + '|' + r.rows[0].n + '|' + r.rows[0].t });
    }
    if (path === '/api/state' && method === 'GET') {
      const { S, V } = await store.loadAll(tid);
      // última compra no balcão (PDV) de cada cliente: entra em "Clientes parados" e na última compra do vendedor (só a data)
      if (T.modules.pdv && (user.role === 'admin' || user.role === 'vendedor')) {
        const r = await db.query(`select customer_id as c, max(created_at) as d from pdv_vendas where tenant_id=$1 and status<>'cancelada' and customer_id is not null group by 1`, [tid]);
        Object.defineProperty(S, '__pdvLast', { value: new Map(r.rows.map(x => [x.c, new Date(x.d).toISOString()])), enumerable: false });
      }
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
      if (user.perms && !(user.perms.pedidos && user.perms.editar)) return send(res, 403, { error: 'Seu acesso não inclui o caixa de balcão.' });
      const out = await pdv.handle({ path, method, user, tid, T, ip: clientIp(req), query: url.searchParams, body: () => readBody(req), audit: (a, d) => audit(user, a, d) });
      return send(res, 200, out);
    }
    if (path.startsWith('/api/photo/') && method === 'GET') {
      let id = ''; try { id = decodeURIComponent(path.slice('/api/photo/'.length)); } catch (e) { return send(res, 404, { error: 'Foto não encontrada.' }); }
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
      if (user.role !== 'admin' || user.perms) return send(res, 403, { error: 'Só o administrador principal.' });
      await audit(user, 'backup', {});
      return send(res, 200, { app: 'pedidos-atacado', version: 2, savedAt: new Date().toISOString(), data: MODS.stripOff(await store.exportBackup(tid), T.modules) });
    }
    if (path === '/api/users/reset' && method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { error: 'Só o administrador.' });
      const b = await readBody(req);
      if (user.perms && !(user.perms.editar && user.perms[String(b.coll) === 'customers' ? 'clientes' : 'equipe'])) return send(res, 403, { error: 'Você não tem acesso para redefinir esta senha.' });
      if (String(b.pass || '').length > 200) return send(res, 400, { error: 'Senha longa demais.' });
      await store.resetPassword(tid, String(b.coll || ''), String(b.id || ''), String(b.pass || ''));
      await audit(user, 'redefiniu_senha', { coll: b.coll, id: b.id });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/temp-passwords' && method === 'POST') {
      if (user.role !== 'admin' || user.perms) return send(res, 403, { error: 'Só o administrador principal.' });
      const list = await store.tempPasswords(tid);
      await audit(user, 'senhas_provisorias', { n: list.length });
      return send(res, 200, { list });
    }
    if (path === '/api/restore' && method === 'POST') {
      if (user.role !== 'admin' || user.perms) return send(res, 403, { error: 'Só o administrador principal.' });
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
    if (status >= 500) { console.error(e); await errlog.logError(errTid, path, e); }
    return send(res, status, Object.assign({ error: status >= 500 ? 'Erro no servidor. Tente de novo.' : e.message }, e.needAuth ? { needAuth: true } : {}, e.confirmarFiado ? { confirmarFiado: true } : {}));
  }
}
/* confere todas as alterações sobre os dados atuais. Erro inesperado numa alteração (registro malformado, dado antigo):
   recusa SÓ aquela e refaz a conferência do zero sem ela (nada fica pela metade na memória); as outras seguem. */
const MAX_UNEXPECTED = 5;
async function planSync(user, T, changes) {
  const tid = user.tenant_id, mods = T.modules, skip = new Map();
  for (;;) {
    const { S, V } = await store.loadAll(tid);
    if (!Object.prototype.hasOwnProperty.call(S, '__mods')) Object.defineProperty(S, '__mods', { value: mods, enumerable: false });
    const writes = [], drops = [], rejected = [], effects = policy.newEffects();
    let failed = -1;
    for (let k = 0; k < changes.length; k++) {
      // cópia: uma tentativa que falhou não pode deixar a alteração mexida para a próxima rodada
      const ch = changes[k] && typeof changes[k] === 'object' ? JSON.parse(JSON.stringify(changes[k])) : changes[k];
      const tag = { c: String(ch && ch.c || ''), id: String(ch && ch.id || '').slice(0, 80) };
      if (skip.has(k)) { rejected.push(Object.assign(tag, { error: skip.get(k) })); continue; }
      // módulo desligado na Central: o servidor não aceita gravar nele
      if (MODS.blockedBy(ch, mods)) { rejected.push(Object.assign(tag, { error: 'Função desligada para esta empresa.' })); continue; }
      // negociação desligada: pedido não leva proposta de preço
      if (!mods.negociacao && ch && ch.c === 'orders' && ch.doc && Array.isArray(ch.doc.items)) ch.doc.items.forEach(i => { if (i && typeof i === 'object') delete i.negAsk; });
      try {
        const r = policy.applySync(S, V, user, [ch], effects);
        writes.push(...r.writes); drops.push(...r.drops);
      } catch (e) {
        if (e.status === 409) throw e;
        if (!e.status || e.status >= 500) {
          console.error('alteração recusada por erro inesperado', user.role, tag.c, tag.id, e);
          await errlog.logError(tid, '/api/sync (' + tag.c + ')', e);
          if (skip.size >= MAX_UNEXPECTED) throw e;
          skip.set(k, 'Não foi possível gravar este registro (dados com problema). Confira e faça de novo.');
          failed = k; break;
        }
        rejected.push(Object.assign(tag, { error: e.message }));
      }
    }
    if (failed < 0) return { S, writes, drops, rejected, effects };
  }
}
async function syncOnce(req, res, user, T, b) {
      const tid = user.tenant_id;
      if (process.env.DEBUG_SYNC) console.log('SYNC', user.role, b.changes.map(c => c && (c.c + ':' + c.id + ':v' + c.ver + (c.c === 'orders' ? ':' + (c.doc && c.doc.status) : ''))).join(' '));
      // cada alteração é conferida sozinha: a que não pode é recusada (com o motivo) e as outras seguem
      const { S, writes, drops, rejected, effects } = await planSync(user, T, b.changes);
      const mods = T.modules;
      // usuário repetido em outro cadastro: recusa só aquele cadastro, antes de gravar
      for (let k = writes.length - 1; k >= 0; k--) {
        const w = writes[k];
        if (w.syncUser) { const msg = await store.loginClash(tid, w.c, w.doc); if (msg) { rejected.push({ c: w.c, id: w.id, error: msg }); writes.splice(k, 1); } }
      }
      if (rejected.length) await audit(user, 'sync_recusado', { rejected: rejected.slice(0, 20) });
      const out = await db.tx(async t => {
        const q = (a, p) => t.query(a, p);
        await recheckUnderLock(q, tid, user, mods, writes, rejected);
        for (const w of writes) {
          if (w.newOrder) {
            let no = null;
            const want = Number(w.doc.no);
            // número escolhido pelo administrador: só inteiro razoável (número enorme estouraria a numeração de todos os pedidos)
            if (user.role === 'admin' && Number.isSafeInteger(want) && want > 0 && want <= 999999999) {
              const used = await q(`select 1 from docs_t where tenant_id=$2 and coll='orders' and (data->>'no')=$1`, [String(want), tid]);
              if (!used.rows.length) { no = want; await store.bumpOrderNo(q, tid, want); }
            }
            if (no == null) no = await store.nextOrderNo(q, tid);
            w.doc.no = no;
            (Array.isArray(w.doc.events) ? w.doc.events : []).forEach(e => { if (!e || typeof e !== 'object') return; e.text = String(e.text || '').replace(/\{NO\}|nº null|nº undefined/g, m => m === '{NO}' ? String(no) : 'nº ' + no); });
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
        if (user.role === 'admin' && b.order && typeof b.order === 'object') for (const [c, ids] of Object.entries(b.order)) {
          if (user.perms && !(user.perms.editar && user.perms[PERM.permFor(c, '')])) continue;   // limitado: só reordena o que pode alterar
          await store.setOrder(q, tid, c, ids);
        }
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
/* Pedidos de cliente/vendedor com "não vender sem estoque" + "conta o reservado" (ou pedido a prazo do cliente, que usa o limite de crédito):
   dois pedidos ao mesmo tempo leriam o mesmo estoque/limite e passariam os dois. Aqui, dentro da gravação, a empresa fica travada
   (uma gravação dessas por vez) e a conferência é refeita com os dados já gravados pelos outros. O que não cabe mais é recusado sozinho. */
async function recheckUnderLock(q, tid, user, mods, writes, rejected) {
  if (user.role !== 'cliente' && user.role !== 'vendedor') return;
  const ows = writes.filter(w => w.c === 'orders' && w.doc && Array.isArray(w.doc.items));
  const needStock = ows.length && mods.trava_estoque === true && mods.trava_reservado === true;
  const needCredit = user.role === 'cliente' && ows.some(w => w.newOrder);
  if (!needStock && !needCredit) return;
  await q('select pg_advisory_xact_lock(hashtext($1))', [tid + ':estoque']);
  const r = await q(`select coll,id,data from docs_t where tenant_id=$1 and coll in ('products','orders','customers','receivables','meta')`, [tid]);
  const S2 = { products: [], orders: [], customers: [], receivables: [] };
  r.rows.forEach(x => { if (x.coll === 'meta') { if (!store.COLLS.includes(x.id) && x.id !== 'seq') S2[x.id] = x.data; } else S2[x.coll].push(x.data); });
  Object.defineProperty(S2, '__mods', { value: mods, enumerable: false });
  policy.ensureDefaults(S2);
  for (const w of ows) {
    const prev = S2.orders.find(o => o && o.id === w.id) || null;
    try {
      if (needStock) policy.stockLimit(S2, w.doc.items, w.newOrder ? null : (prev && prev.items) || null, w.id);
      if (needCredit && w.newOrder) policy.creditRecheck(S2, user, w.doc);
      S2.orders = S2.orders.filter(o => !o || o.id !== w.id).concat([w.doc]);   // vale para os próximos do mesmo envio
    } catch (e) {
      if (!e.status || e.status >= 500) throw e;
      writes.splice(writes.indexOf(w), 1); rejected.push({ c: 'orders', id: String(w.id).slice(0, 80), error: e.message });
    }
  }
}
/* ---------- Tino: módulos e marca da empresa ---------- */
/* empresa "em preparo": só o administrador entra (para cadastrar tudo antes de abrir para a equipe e os clientes) */
function statusAllows(T, role) { return !(T && T.status === 'em_preparo' && role !== 'admin'); }
/* app instalado no celular a partir de /t/<empresa>: abre a empresa certa, com o nome dela */
function manifestFor(t, cli) {
  const base = '/t/' + t.id, name = String(t.name || 'Tino').slice(0, 45);
  const cliPath = t.ramo === 'loja' ? '/loja' : '/cliente';
  return { name: cli || t.ramo === 'rural' ? name : t.ramo === 'loja' ? name + ' Painel' : t.ramo === 'caixa' ? name + ' Painel' : name + ' Equipe', short_name: name.slice(0, 12), start_url: base + (cli ? cliPath : '/'), scope: base + (cli ? cliPath : '/'), display: 'standalone',
    background_color: '#F6F1E7', theme_color: t.color || '#1F3D2B', lang: 'pt-BR',
    icons: t.logo ? [{ src: logoUrl(t), sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: logoUrl(t), sizes: '512x512', type: 'image/png', purpose: 'any' }]
      : [{ src: '/icons/tino-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/tino-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/tino-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
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
    if (r.error) { if (r.status !== 429) await audit(SUPER, 'central_login_falhou', { ip, login: String(b.login || '').slice(0, 60) }); return send(res, r.status || 401, { error: r.error }); }
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
    // logo vai como endereço (/api/logo), não como imagem dentro da resposta: a lista fica leve com muitas empresas
    const tenants = (await central.listTenants()).map(t => t.logo ? Object.assign({}, t, { logo: logoUrl(t) }) : t);
    return send(res, 200, Object.assign({ me, tenants, errUnseen: await errlog.unseen() }, await central.catalog()));
  }
  // painel de erros do servidor (só a Central): lista e "marcar como visto"
  if (path === '/api/central/errors' && method === 'GET') return send(res, 200, await errlog.list());
  if (path === '/api/central/errors-seen' && method === 'POST') {
    const unseen = await errlog.markSeen(await readBody(req));
    return send(res, 200, { ok: true, unseen });
  }
  if (path === '/api/central/tenant' && method === 'POST') {
    const b = await readBody(req);
    // a tela da Central recebe a logo como endereço: se voltar o mesmo endereço, a logo fica como está
    if (typeof b.logo === 'string' && b.logo.startsWith('/api/logo?')) delete b.logo;
    const r = await central.saveTenant(b);
    const changed = r.before ? Object.keys(r.tenant.modules).filter(k => r.tenant.modules[k] !== r.before.modules[k]) : null;
    await audit(SUPER, r.before ? 'central_empresa_alterada' : 'central_empresa_criada', { ip, id: r.tenant.id, modulos: changed });
    return send(res, 200, { tenant: r.tenant.logo ? Object.assign({}, r.tenant, { logo: logoUrl(r.tenant) }) : r.tenant });
  }
  if (path === '/api/central/segment' && method === 'POST') {
    const b = await readBody(req);
    const s = await central.saveSegment(b);
    await audit(SUPER, b.id ? 'central_modelo_alterado' : 'central_modelo_criado', { ip, id: s.id, nome: s.name });
    return send(res, 200, { segment: s, segments: await central.segmentList() });
  }
  if (path === '/api/central/segment-del' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.deleteSegment(b.id);
    await audit(SUPER, r.restored ? 'central_modelo_restaurado' : 'central_modelo_apagado', { ip, id: r.id });
    return send(res, 200, Object.assign(r, { segments: await central.segmentList() }));
  }
  if (path === '/api/central/entrar' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.suporteUser(b);
    const sess = await auth.createSession(r.user, { suporte: true });
    setCookie(res, sess.token, sess.maxAge);
    await audit(SUPER, 'central_suporte_entrou', { ip, tenant: r.tenant, login: r.user.login }, r.tenant);
    return send(res, 200, { ok: true, url: '/t/' + r.tenant + '/' });
  }
  if (path === '/api/central/tenant-admin' && method === 'POST') {
    const b = await readBody(req);
    const r = await central.tenantAdmin(b);
    await audit(SUPER, 'central_acesso_admin', { ip, tenant: r.tenant, login: r.login }, r.tenant);
    return send(res, 200, r);
  }
  return send(res, 404, { error: 'Não encontrado.' });
}
module.exports = { handle, planSync };

'use strict';
/*
 * Cliente Postgres mínimo, sem dependências (protocolo de rede v3).
 * - TLS (obrigatório na Neon) com SNI e verificação de certificado.
 * - Autenticação SCRAM-SHA-256 (padrão da Neon e do Postgres 14+).
 * - Consultas com parâmetros ($1, $2...) pelo protocolo estendido: os valores
 *   nunca são concatenados no SQL (sem SQL injection).
 */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function parseUrl(url) {
  const u = new URL(url);
  const q = u.searchParams;
  return {
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    ssl: (q.get('sslmode') || 'require') !== 'disable',
    // só para teste local com certificado próprio; em produção é sempre verificado
    insecure: process.env.PG_INSECURE_TLS === '1',
    options: q.get('options') || '',
  };
}

const TYPES = {
  16: v => v === 't',
  20: Number, 21: Number, 23: Number, 26: Number, 700: Number, 701: Number, 1700: Number,
  114: v => JSON.parse(v), 3802: v => JSON.parse(v),
};

class Conn {
  constructor(cfg) { this.cfg = cfg; this.buf = Buffer.alloc(0); this.waiters = []; this.chain = Promise.resolve(); this.dead = false; }

  async connect() {
    const c = this.cfg;
    let sock = net.connect({ host: c.host, port: c.port });
    await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
    if (c.ssl) {
      const req = Buffer.alloc(8); req.writeInt32BE(8, 0); req.writeInt32BE(80877103, 4);
      sock.write(req);
      const ans = await new Promise((res, rej) => { sock.once('data', d => res(d)); sock.once('error', rej); });
      if (ans[0] !== 0x53) throw new Error('O banco não aceitou conexão segura (TLS).');
      sock = tls.connect({ socket: sock, servername: net.isIP(c.host) ? undefined : c.host, rejectUnauthorized: !c.insecure });
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
    }
    this.sock = sock;
    sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this._pump(); });
    sock.on('error', e => this._fail(e));
    sock.on('close', () => this._fail(new Error('Conexão com o banco fechada.')));
    // startup
    const params = ['user', c.user, 'database', c.database, 'client_encoding', 'UTF8'];
    if (c.options) params.push('options', c.options);
    const body = Buffer.concat([int32(196608), ...params.map(cstr), Buffer.from([0])]);
    sock.write(Buffer.concat([int32(body.length + 4), body]));
    await this._auth();
  }

  _fail(e) { this.dead = true; const w = this.waiters; this.waiters = []; w.forEach(x => x.rej(e)); }
  _pump() {
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) return;
      const msg = { t: String.fromCharCode(this.buf[0]), b: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      if (msg.t === 'N' || msg.t === 'S' || msg.t === 'K' || msg.t === 'A') continue; // avisos e parâmetros
      const w = this.waiters.shift();
      if (w) w.res(msg); else (this.pending = this.pending || []).push(msg);
    }
  }
  _next() {
    if (this.pending && this.pending.length) return Promise.resolve(this.pending.shift());
    if (this.dead) return Promise.reject(new Error('Conexão com o banco fechada.'));
    return new Promise((res, rej) => this.waiters.push({ res, rej }));
  }
  _send(type, payload) { this.sock.write(Buffer.concat([Buffer.from(type), int32(payload.length + 4), payload])); }

  async _auth() {
    const c = this.cfg;
    let nonce, clientFirstBare, salted, authMsg;
    for (;;) {
      const m = await this._next();
      if (m.t === 'E') throw pgError(m.b);
      if (m.t === 'Z') return;
      if (m.t !== 'R') continue;
      const kind = m.b.readInt32BE(0);
      if (kind === 0) continue;
      if (kind === 10) {
        const mechs = m.b.subarray(4).toString().split('\0');
        if (!mechs.includes('SCRAM-SHA-256')) throw new Error('O banco não oferece SCRAM-SHA-256.');
        nonce = crypto.randomBytes(18).toString('base64');
        clientFirstBare = 'n=*,r=' + nonce;
        const first = Buffer.from('n,,' + clientFirstBare);
        this._send('p', Buffer.concat([cstr('SCRAM-SHA-256'), int32(first.length), first]));
      } else if (kind === 11) {
        const serverFirst = m.b.subarray(4).toString();
        const a = Object.fromEntries(serverFirst.split(',').map(x => [x[0], x.slice(2)]));
        if (!a.r || !a.r.startsWith(nonce)) throw new Error('Resposta SCRAM inválida.');
        salted = crypto.pbkdf2Sync(c.password.normalize('NFKC'), Buffer.from(a.s, 'base64'), Number(a.i), 32, 'sha256');
        const clientKey = hmac(salted, 'Client Key');
        const storedKey = crypto.createHash('sha256').update(clientKey).digest();
        const finalNoProof = 'c=biws,r=' + a.r;
        authMsg = clientFirstBare + ',' + serverFirst + ',' + finalNoProof;
        const sig = hmac(storedKey, authMsg);
        const proof = Buffer.from(clientKey.map((x, i) => x ^ sig[i]));
        this._send('p', Buffer.from(finalNoProof + ',p=' + proof.toString('base64')));
      } else if (kind === 12) {
        const v = Object.fromEntries(m.b.subarray(4).toString().split(',').map(x => [x[0], x.slice(2)])).v;
        const expect = hmac(hmac(salted, 'Server Key'), authMsg).toString('base64');
        if (v !== expect) throw new Error('Assinatura do servidor do banco não confere.');
      } else if (kind === 3) {
        this._send('p', cstr(c.password));
      } else {
        throw new Error('Método de autenticação do banco não suportado: ' + kind);
      }
    }
  }

  query(text, params = []) {
    const run = () => this._query(text, params);
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
  async _query(text, params) {
    const vals = params.map(v => v === null || v === undefined ? null : Buffer.from(typeof v === 'object' ? JSON.stringify(v) : String(v)));
    const bind = Buffer.concat([cstr(''), cstr(''), int16(0), int16(vals.length),
      ...vals.map(v => v === null ? int32(-1) : Buffer.concat([int32(v.length), v])), int16(0)]);
    this._send('P', Buffer.concat([cstr(''), cstr(text), int16(0)]));
    this._send('B', bind);
    this._send('D', Buffer.concat([Buffer.from('P'), cstr('')]));
    this._send('E', Buffer.concat([cstr(''), int32(0)]));
    this._send('S', Buffer.alloc(0));
    let fields = [], rows = [], err = null, rowCount = 0;
    for (;;) {
      const m = await this._next();
      if (m.t === 'T') fields = readFields(m.b);
      else if (m.t === 'D') rows.push(readRow(m.b, fields));
      else if (m.t === 'C') { const t = m.b.toString().replace(/\0$/, '').split(' '); rowCount = Number(t[t.length - 1]) || 0; }
      else if (m.t === 'E') err = pgError(m.b);
      else if (m.t === 'Z') break;
    }
    if (err) throw err;
    return { rows, rowCount };
  }
  end() { try { this._send('X', Buffer.alloc(0)); this.sock.end(); } catch (e) {} this.dead = true; }
}

function readFields(b) {
  const n = b.readInt16BE(0); let o = 2; const f = [];
  for (let i = 0; i < n; i++) { const e = b.indexOf(0, o); const name = b.subarray(o, e).toString(); o = e + 1; const type = b.readInt32BE(o + 6); o += 18; f.push({ name, type }); }
  return f;
}
function readRow(b, fields) {
  const n = b.readInt16BE(0); let o = 2; const r = {};
  for (let i = 0; i < n; i++) {
    const len = b.readInt32BE(o); o += 4;
    const f = fields[i];
    if (len === -1) { r[f.name] = null; continue; }
    const s = b.subarray(o, o + len).toString(); o += len;
    r[f.name] = TYPES[f.type] ? TYPES[f.type](s) : s;
  }
  return r;
}
function pgError(b) {
  const f = {}; let o = 0;
  while (o < b.length && b[o] !== 0) { const k = String.fromCharCode(b[o]); const e = b.indexOf(0, o + 1); f[k] = b.subarray(o + 1, e).toString(); o = e + 1; }
  const e = new Error(f.M || 'Erro no banco'); e.code = f.C; return e;
}
const int32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const int16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const cstr = s => Buffer.concat([Buffer.from(String(s)), Buffer.from([0])]);
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

/* Uma conexão reaproveitada por instância (o servidor da Vercel reaproveita entre requisições). */
let shared = null;
async function getConn() {
  if (shared && !shared.dead) return shared;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada.');
  const c = new Conn(parseUrl(url));
  await c.connect();
  shared = c;
  return c;
}
async function query(text, params) {
  const c = await getConn();
  return c.query(text, params);
}
/* Transação: tudo ou nada. Usa uma conexão própria para não misturar com outras requisições. */
async function tx(fn) {
  const c = new Conn(parseUrl(process.env.DATABASE_URL));
  await c.connect();
  try {
    await c.query('BEGIN');
    const out = await fn({ query: (t, p) => c.query(t, p) });
    await c.query('COMMIT');
    return out;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { c.end(); }
}
module.exports = { query, tx, Conn, parseUrl };

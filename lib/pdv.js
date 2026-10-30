'use strict';
/*
 * Tino PDV — caixa de balcão ("pague e leve"), no mesmo sistema e no mesmo banco.
 * Regras que valem SEMPRE no servidor (o aparelho não decide nada sozinho):
 *  - preço, desconto, margem e total são recalculados aqui com as mesmas regras do app;
 *    total diferente do que o aparelho mostrou = venda recusada (ou "a revisar", se veio da fila offline);
 *  - o operador de caixa nunca recebe custo nem margem;
 *  - desconto acima do limite ou abaixo da margem mínima precisa de autorização de gerente
 *    (administrador da empresa), que fica gravada na venda;
 *  - a mesma venda enviada duas vezes (clique duplo, reenvio da fila) grava uma vez só;
 *  - tudo numa transação: venda, itens, pagamentos, estoque e conta do fiado entram juntos ou nada entra.
 * Tabelas: caixas, pdv_vendas, pdv_itens, pdv_pagamentos, caixa_movimentos, pdv_autorizacoes, pdv_seq.
 */
const crypto = require('crypto');
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');
const policy = require('./policy');

const FORMAS = ['dinheiro', 'pix', 'debito', 'credito', 'fiado'];
const MAX_ITENS = 300, MAX_Q = 100000;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const httpErr = store.httpErr;
const isId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v);

/* configuração do PDV (meta "pdv"): só o que o caixa precisa; o resto fica com o administrador */
function cfgOf(S) {
  const c = (S && S.pdv) || {};
  const n = (v, d) => (v === '' || v == null || !isFinite(Number(v))) ? d : Number(v);
  return {
    maxDesc: Math.max(0, Math.min(100, n(c.maxDesc, 0))),   // desconto (%) que o caixa dá sem gerente
    minMg: c.minMg === '' || c.minMg == null ? null : n(c.minMg, null), // margem mínima quando a categoria não tem
    fiadoDias: Math.max(1, Math.min(120, Math.round(n(c.fiadoDias, 30)))),
    pixKey: String(c.pixKey || '').slice(0, 77), pixName: String(c.pixName || '').slice(0, 25), pixCity: String(c.pixCity || '').slice(0, 15)
  };
}
const publicCfg = c => ({ maxDesc: c.maxDesc, fiadoDias: c.fiadoDias, pixKey: c.pixKey, pixName: c.pixName, pixCity: c.pixCity });

async function nextNo(q, tid, tipo) {
  const r = await q(`insert into pdv_seq(tenant_id,tipo,last_no) values($1,$2,1) on conflict(tenant_id,tipo) do update set last_no=pdv_seq.last_no+1 returning last_no`, [tid, tipo]);
  return Number(r.rows[0].last_no);
}

/* ---------- gerente: login e senha de um administrador da empresa (com bloqueio por tentativas) ---------- */
async function checkManager(tid, g, ip) {
  if (!g || typeof g !== 'object') throw httpErr(403, 'Precisa da senha do gerente.');
  const login = String(g.login || '').trim().toLowerCase().slice(0, 60);
  // bloqueio por gerente (8 erros) e por aparelho/IP (30): um operador errando não tranca a loja inteira
  const key = 'pdvger:' + tid + ':' + login, kip = 'pdvgerip:' + tid + ':' + ip;
  if (await auth.hit(key) > 8 || await auth.hit(kip) > 30) throw httpErr(429, 'Muitas tentativas de senha de gerente. Espere 15 minutos.');
  const r = await db.query(`select id,name,login,pass_hash from users_t where tenant_id=$1 and role='admin' and active and login=$2`, [tid, login]);
  const u = r.rows[0];
  const ok = u && u.pass_hash ? await auth.verifyPassword(String(g.senha || '').slice(0, 200), u.pass_hash) : await auth.dummyVerify(String(g.senha || ''));
  if (!ok) throw httpErr(403, 'Usuário ou senha do gerente incorretos.');
  await auth.clearAttempts(key); await db.query(`update login_attempts set n=greatest(n-1,0) where key=$1`, [kip]);
  return { id: u.id, nome: u.name || u.login, login: u.login };
}

/* ---------- preço da venda, sempre calculado aqui ---------- */
function loadCart(S, b) {
  const cust = b.customerId ? (S.customers || []).find(c => c.id === String(b.customerId) && c.active !== false && c.blocked !== true) : null;
  if (b.customerId && !cust) throw httpErr(400, 'Cliente não encontrado ou bloqueado.');
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw httpErr(400, 'Venda sem itens.');
  if (items.length > MAX_ITENS) throw httpErr(400, 'Itens demais numa venda só.');
  return { cust, items };
}
/* devolve as linhas com preço, total e (só para uso interno) custo e margem */
function price(S, b) {
  const { cust, items } = loadCart(S, b);
  const { C } = policy.coreFor(S, 'x', { client: cust || null, mode: 'retirada' });
  const ie = !!(cust && C.ieClient(cust));
  const cfg = cfgOf(S);
  const lines = items.map((it, k) => {
    const p = (S.products || []).find(x => x.id === String(it.pid || ''));
    if (!p || p.active === false) throw httpErr(400, 'Produto ' + (k + 1) + ' indisponível. Atualize o caixa.');
    const q = Number(it.q);
    if (!(q > 0) || q > MAX_Q || (!C.isKg(p) && Math.abs(q - Math.round(q)) > 1e-9)) throw httpErr(400, 'Quantidade inválida no item ' + (k + 1) + '.');
    const unit = r2(C.withIe(ie, () => C.withOner('retirada', () => C.priceFor(p, q, 'retirada', '').price)));
    if (!(unit > 0)) throw httpErr(400, 'Produto sem preço: ' + p.name + '.');
    const cancel = it.cancel && typeof it.cancel === 'object';
    const motivo = cancel ? String(it.cancel.motivo || '').replace(/[<>]/g, '').trim().slice(0, 120) : '';
    if (cancel && motivo.length < 3) throw httpErr(400, 'Informe o motivo do cancelamento do item ' + (k + 1) + '.');
    const cost = Number(C.lockCost(p)) || null;
    const pm = C.polMin(p);
    return { seq: k + 1, p, q, unit, gross: cancel ? 0 : r2(unit * q), cancel, motivo, cost, min: pm ? Number(pm.v) : cfg.minMg };
  });
  const sub = r2(lines.reduce((s, l) => s + l.gross, 0));
  if (!(sub > 0)) throw httpErr(400, 'Venda sem itens válidos.');
  // desconto: em % ou em R$, sobre o total; distribuído entre os itens na proporção
  const d = b.desconto && typeof b.desconto === 'object' ? b.desconto : null;
  let desc = 0;
  if (d) {
    const v = Number(d.valor);
    if (!(v >= 0) || !isFinite(v)) throw httpErr(400, 'Desconto inválido.');
    desc = d.tipo === 'pct' ? r2(sub * Math.min(v, 100) / 100) : r2(v);
    if (desc >= sub) throw httpErr(400, 'Desconto maior que a venda.');
  }
  const total = r2(sub - desc);
  const k = sub > 0 ? total / sub : 1;
  const needAuth = sub > 0 && desc / sub * 100 > cfg.maxDesc + 1e-9;
  let abaixoMargem = false;
  let costTotal = 0, anyCost = false;
  lines.forEach(l => {
    l.desc = l.gross ? r2(l.gross - l.gross * k) : 0;
    l.total = r2(l.gross - l.desc);
    if (!l.gross) return;
    const net = l.unit * k;
    const c = l.cost > 0 ? C.effCost(l.p, l.cost, net, ie) : null;
    if (c != null) { anyCost = true; costTotal += c * l.q; }
    // mesma trava do app: margem do item depois do desconto contra a mínima da categoria (ou do PDV).
    // Só o GERENTE fica sabendo (na autorização): responder isso ao caixa deixaria descobrir o custo por tentativa.
    if (desc > 0 && l.min != null && (c == null || (net - c) / net * 100 < l.min - 1e-9)) abaixoMargem = true;
  });
  // centavos do rateio do desconto: a diferença vai para a última linha com valor (soma das linhas = total, como exige a nota fiscal)
  const resto = r2(total - lines.reduce((s, l) => s + (l.total || 0), 0));
  const ult = [...lines].reverse().find(l => l.gross > 0);
  if (resto && ult) { ult.total = r2(ult.total + resto); ult.desc = r2(ult.gross - ult.total); }
  // desconto que deixa a margem abaixo da mínima também exige gerente, mas isso só aparece quando o gerente autoriza
  return { cust, ie, lines, sub, desc, total, needAuth: desc > 0 && needAuth, abaixoMargem, costTotal: anyCost ? r2(costTotal) : null };
}
/* resumo que pode ir para o caixa: SEM custo e SEM margem */
const quoteOut = Q => ({
  customer: Q.cust ? { id: Q.cust.id, name: Q.cust.name, ie: Q.ie } : null,
  lines: Q.lines.map(l => ({ seq: l.seq, pid: l.p.id, name: l.p.name, q: l.q, unit: l.unit, total: l.total, cancel: !!l.cancel })),
  sub: Q.sub, desc: Q.desc, total: Q.total, needAuth: Q.needAuth
});
const contentKey = (b, uid) => sha(String(uid) + ':' + JSON.stringify([String(b.customerId || ''), (b.items || []).map(i => [String(i.pid || ''), Number(i.q), !!(i.cancel && typeof i.cancel === 'object')]), b.desconto && { t: b.desconto.tipo === 'pct' ? 'pct' : 'r', v: Number(b.desconto.valor) }]));

/* loja ainda sem configuração gravada: mesmos padrões do app */
function withDefaults(S) {
  S.store = Object.assign({ pickupDisc: 0, pickV: 1, onerV: 2, pickupOner: false }, S.store || {});
  ['payments', 'cashPays'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
  return S;
}

/* ---------- estado do caixa ---------- */
async function openCaixa(tid, user) {
  const r = await db.query(`select id,numero,fundo,aberto_em from caixas where tenant_id=$1 and operador_id=$2 and status='aberto'`, [tid, user.id]);
  const c = r.rows[0];
  return c ? { id: c.id, numero: Number(c.numero), fundo: Number(c.fundo), abertoEm: c.aberto_em } : null;
}
async function esperado(q, tid, caixaId) {
  const c = (await q(`select fundo from caixas where tenant_id=$1 and id=$2`, [tid, caixaId])).rows[0];
  const pg = await q(`select p.forma, sum(p.valor)::numeric as v from pdv_pagamentos p join pdv_vendas v on v.tenant_id=p.tenant_id and v.id=p.venda_id
    where v.tenant_id=$1 and v.caixa_id=$2 and v.status<>'cancelada' group by p.forma`, [tid, caixaId]);
  const tr = await q(`select coalesce(sum(troco),0)::numeric as t, count(*)::int as n, coalesce(sum(total),0)::numeric as tot from pdv_vendas where tenant_id=$1 and caixa_id=$2 and status<>'cancelada'`, [tid, caixaId]);
  const mv = await q(`select tipo, coalesce(sum(valor),0)::numeric as v from caixa_movimentos where tenant_id=$1 and caixa_id=$2 group by tipo`, [tid, caixaId]);
  const by = Object.fromEntries(pg.rows.map(x => [x.forma, Number(x.v)]));
  const m = Object.fromEntries(mv.rows.map(x => [x.tipo, Number(x.v)]));
  const e = {
    dinheiro: r2(Number(c.fundo) + (by.dinheiro || 0) - Number(tr.rows[0].t) + (m.suprimento || 0) - (m.sangria || 0)),
    pix: r2(by.pix || 0), debito: r2(by.debito || 0), credito: r2(by.credito || 0)
  };
  return { esperado: e, fiado: r2(by.fiado || 0), vendas: tr.rows[0].n, totalVendas: r2(tr.rows[0].tot), fundo: Number(c.fundo), sangria: r2(m.sangria || 0), suprimento: r2(m.suprimento || 0) };
}

/* ---------- rotas /api/pdv/* (o chamador já conferiu: sessão, empresa, módulo pdv ligado) ---------- */
async function handle(ctx) {
  const { path, method, user, tid, T, body, ip, audit } = ctx;
  const isAdmin = user.role === 'admin';
  if (!isAdmin && user.role !== 'operador_caixa') throw httpErr(403, 'Só para o caixa ou o administrador.');
  const S = () => store.loadAll(tid, ['products', 'customers', 'categories', 'combos', 'cities', 'receivables', 'orders']).then(x => withDefaults(x.S));

  if (path === '/api/pdv/state' && method === 'GET') {
    const s = await S();
    return { me: { nome: user.name || user.login, role: user.role }, caixa: await openCaixa(tid, user), cfg: publicCfg(cfgOf(s)), nfce: !!T.modules.pdv_nfce };
  }
  const b = method === 'POST' ? await body() : {};

  if (path === '/api/pdv/quote' && method === 'POST') {
    if (await auth.hit('pdvq:' + tid + ':' + user.id) > 900) throw httpErr(429, 'Muitas consultas seguidas. Espere alguns minutos.'); const s = await S(); const Q = price(s, b); return Object.assign(quoteOut(Q), { fiado: Q.cust ? fiadoInfo(s, Q.cust) : null }); }

  if (path === '/api/pdv/autorizar' && method === 'POST') {
    const g = await checkManager(tid, b.gerente, ip);
    const s = await S(); const Q = price(s, b);
    const token = crypto.randomBytes(24).toString('base64url');
    await db.query(`insert into pdv_autorizacoes(token_hash,tenant_id,gerente,conteudo,expira_em) values($1,$2,$3,$4,now()+interval '10 minutes')`, [sha(token), tid, g.nome, contentKey(b, user.id)]);
    await db.query(`delete from pdv_autorizacoes where expira_em<now()-interval '1 day'`);
    await audit('pdv_autorizacao', { gerente: g.login, desconto: Q.desc, total: Q.total, abaixoMargem: Q.abaixoMargem });
    // aviso para o GERENTE (que acabou de digitar a senha): o desconto deixa a margem abaixo da mínima
    return { token, gerente: g.nome, alerta: Q.abaixoMargem ? 'Atenção: com este desconto a margem fica abaixo da mínima.' : '' };
  }

  if (path === '/api/pdv/caixa/abrir' && method === 'POST') {
    const fundo = r2(b.fundo);
    if (!(fundo >= 0) || fundo > 100000) throw httpErr(400, 'Fundo de troco inválido.');
    if (await openCaixa(tid, user)) throw httpErr(409, 'Você já tem um caixa aberto.');
    const id = 'cx' + crypto.randomBytes(8).toString('hex');
    await db.tx(async t => {
      const n = await nextNo((a, p) => t.query(a, p), tid, 'caixa');
      await t.query(`insert into caixas(tenant_id,id,numero,operador_id,operador_nome,fundo) values($1,$2,$3,$4,$5,$6)`, [tid, id, n, user.id, user.name || user.login, fundo]);
    });
    await audit('pdv_caixa_aberto', { id, fundo });
    return { caixa: await openCaixa(tid, user) };
  }

  if (path === '/api/pdv/caixa/mov' && method === 'POST') {
    const cx = await openCaixa(tid, user); if (!cx) throw httpErr(409, 'Abra o caixa primeiro.');
    const tipo = b.tipo === 'suprimento' ? 'suprimento' : b.tipo === 'sangria' ? 'sangria' : '';
    const valor = r2(b.valor);
    if (!tipo || !(valor > 0) || valor > 1000000) throw httpErr(400, 'Informe o tipo e um valor válido.');
    const g = await checkManager(tid, b.gerente, ip);
    const id = 'mv' + crypto.randomBytes(8).toString('hex');
    await db.tx(async t => {
      const q = (a, p) => t.query(a, p);
      const c = (await q(`select status from caixas where tenant_id=$1 and id=$2 for update`, [tid, cx.id])).rows[0];
      if (!c || c.status !== 'aberto') throw httpErr(409, 'O caixa foi fechado.');
      if (tipo === 'sangria') { const E = await esperado(q, tid, cx.id); if (valor > E.esperado.dinheiro + 0.004) throw httpErr(400, 'Sangria maior que o dinheiro do caixa.'); }
      await q(`insert into caixa_movimentos(tenant_id,id,caixa_id,tipo,valor,motivo,autorizado_por,operador_id) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tid, id, cx.id, tipo, valor, String(b.motivo || '').replace(/[<>]/g, '').slice(0, 120), g.nome, user.id]);
    });
    await audit('pdv_' + tipo, { caixa: cx.id, valor, gerente: g.login });
    return { ok: true, id, autorizadoPor: g.nome };
  }

  if (path === '/api/pdv/caixa/fechar' && method === 'POST') {
    const cx = await openCaixa(tid, user); if (!cx) throw httpErr(409, 'Nenhum caixa aberto.');
    const c = b.contado && typeof b.contado === 'object' ? b.contado : null;
    if (!c) throw httpErr(400, 'Informe o que foi contado.');
    const contado = {};
    for (const f of ['dinheiro', 'pix', 'debito', 'credito']) { const v = r2(c[f]); if (!(v >= 0) || v > 10000000) throw httpErr(400, 'Valor contado inválido: ' + f + '.'); contado[f] = v; }
    const out = await db.tx(async t => {
      const q = (a, p) => t.query(a, p);
      await q(`select id from caixas where tenant_id=$1 and id=$2 for update`, [tid, cx.id]);   // espera vendas em andamento
      const E = await esperado(q, tid, cx.id);
      const dif = r2(['dinheiro', 'pix', 'debito', 'credito'].reduce((s, f) => s + contado[f] - E.esperado[f], 0));
      const r = await q(`update caixas set status='fechado', fechado_em=now(), contado=$3, esperado=$4, diferenca=$5 where tenant_id=$1 and id=$2 and status='aberto' returning id`,
        [tid, cx.id, JSON.stringify(contado), JSON.stringify(E.esperado), dif]);
      if (!r.rowCount) throw httpErr(409, 'Este caixa já foi fechado.');
      return Object.assign({ id: cx.id, numero: cx.numero, contado, diferenca: dif }, E);
    });
    await audit('pdv_caixa_fechado', { id: cx.id, diferenca: out.diferenca });
    return out;   // só depois de fechado o operador vê o esperado (fechamento às cegas)
  }

  if (path === '/api/pdv/venda' && method === 'POST') return await venda(ctx, b, await S());

  if (path === '/api/pdv/ean' && method === 'POST') {
    const g = await checkManager(tid, b.gerente, ip);
    const ean = String(b.ean || '').replace(/\D/g, '');
    if (ean.length < 8 || ean.length > 14) throw httpErr(400, 'Código de barras inválido (8 a 14 números).');
    const s = await S();
    const p = (s.products || []).find(x => x.id === String(b.pid || ''));
    if (!p) throw httpErr(404, 'Produto não encontrado.');
    const other = (s.products || []).find(x => [x.ean, x.ean2, x.code, ...(Array.isArray(x.eans) ? x.eans : [])].some(v => String(v || '').replace(/\D/g, '') === ean));
    if (other && other.id === p.id) throw httpErr(409, 'Este código já é deste produto.');
    if (other) throw httpErr(409, 'Este código já é do produto "' + other.name + '".');
    // o código novo ENTRA JUNTO (lista "eans"): a embalagem antiga continua passando no caixa
    const r = await db.query(`update docs_t set data=jsonb_set(data,'{eans}',coalesce(data->'eans','[]'::jsonb)||to_jsonb($3::text)), ver=ver+1, updated_at=now() where tenant_id=$1 and coll='products' and id=$2 returning ver`, [tid, p.id, ean]);
    if (!r.rowCount) throw httpErr(404, 'Produto não encontrado.');
    await audit('pdv_vinculou_ean', { pid: p.id, ean, gerente: g.login });
    return { ok: true, pid: p.id, ean };
  }

  // ---- administrador ----
  if (!isAdmin) throw httpErr(403, 'Só o administrador.');
  if (path === '/api/pdv/resumo' && method === 'GET') return await resumo(tid, ctx.query);
  if (path === '/api/pdv/justificar' && method === 'POST') {
    const txt = String(b.texto || '').replace(/[<>]/g, '').trim().slice(0, 300);
    if (txt.length < 5) throw httpErr(400, 'Escreva a justificativa (pelo menos 5 letras).');
    const r = await db.query(`update caixas set justificativa=$3, justificado_por=$4, justificado_em=now() where tenant_id=$1 and id=$2 and status='fechado' and justificativa is null returning id`, [tid, String(b.id || ''), txt, user.name || user.login]);
    if (!r.rowCount) throw httpErr(404, 'Caixa não encontrado ou já justificado.');
    await audit('pdv_justificou', { id: b.id });
    return { ok: true };
  }
  if (path === '/api/pdv/revisar' && method === 'POST') {
    const r = await db.query(`update pdv_vendas set status='concluida', revisar_motivo=revisar_motivo||' · conferido por '||$3 where tenant_id=$1 and id=$2 and status='revisar' returning id`, [tid, String(b.id || ''), user.name || user.login]);
    if (!r.rowCount) throw httpErr(404, 'Venda não encontrada.');
    await audit('pdv_revisou', { id: b.id });
    return { ok: true };
  }
  if (path === '/api/pdv/falha' && method === 'POST') {
    const txt = String(b.texto || '').replace(/[<>]/g, '').trim().slice(0, 300);
    if (txt.length < 5) throw httpErr(400, 'Escreva o que foi feito (pelo menos 5 letras).');
    const r = await db.query(`update pdv_falhas set resolvida_em=now(), resolvida_por=$3, resolucao=$4 where tenant_id=$1 and id=$2 and resolvida_em is null returning id`, [tid, String(b.id || ''), user.name || user.login, txt]);
    if (!r.rowCount) throw httpErr(404, 'Venda não encontrada ou já resolvida.');
    await audit('pdv_falha_resolvida', { id: b.id });
    return { ok: true };
  }
  if (path === '/api/pdv/faturar' && method === 'POST') return await faturar(ctx, String(b.id || ''));
  if (path === '/api/pdv/turno' && method === 'GET') return await turno(tid, String(ctx.query.get('id') || ''), true);
  throw httpErr(404, 'Não encontrado.');
}

/* fiado: MESMA regra de crédito do app (parcelas vencidas bloqueiam; pedidos a prazo em aberto contam no limite) */
function fiadoInfo(S, c, extra) {
  const { C } = policy.coreFor(S, 'x', {});
  const I = C.creditInfo(c, extra || 0);
  const vencido = I.overdue > 0.004;
  return { limite: r2(I.limit), disponivel: r2(Math.max(0, I.limit ? I.avail : 0)), vencido: vencido ? r2(I.overdue) : 0,
    motivo: !(I.limit > 0) ? 'Este cliente não tem limite de fiado.' : vencido ? 'Cliente com ' + I.overdue.toFixed(2).replace('.', ',') + ' em contas vencidas: fiado bloqueado.' : '' };
}

/* ---------- venda ---------- */
async function venda(ctx, b, S) {
  const { user, tid, audit } = ctx;
  if (!isId(b.id)) throw httpErr(400, 'Venda sem identificador.');
  // já gravada (clique duplo, reenvio da fila sem internet): devolve a mesma, sem gravar de novo
  const prev = (await db.query(`select numero,status,total,troco from pdv_vendas where tenant_id=$1 and id=$2`, [tid, b.id])).rows[0];
  if (prev) return { ok: true, repetida: true, id: b.id, numero: Number(prev.numero), status: prev.status, total: Number(prev.total), troco: Number(prev.troco) };
  const fprev = (await db.query(`select id from pdv_falhas where tenant_id=$1 and id=$2`, [tid, b.id])).rows[0];
  if (fprev) return { ok: true, repetida: true, id: b.id, status: 'falha' };
  if (!b.offline) {
    const cx = await openCaixa(tid, user);
    if (!cx || cx.id !== String(b.caixaId || '')) throw httpErr(409, 'O caixa desta venda não está aberto. Abra o caixa de novo.');
    return vendaGravar(ctx, b, S, { id: cx.id, operadorId: user.id, operadorNome: user.name || user.login }, '');
  }
  // venda feita SEM internet: o cliente já levou e já pagou. Nunca some:
  //  - caixa fechado nesse meio-tempo ou enviada por outro operador no mesmo aparelho: grava no caixa de origem, "a revisar";
  //  - algo que não dá para gravar como venda (produto apagado, cliente bloqueado...): vai para "vendas com problema" no painel.
  const c = (await db.query(`select id,status,operador_id,operador_nome from caixas where tenant_id=$1 and id=$2`, [tid, String(b.caixaId || '')])).rows[0];
  const nota = [];
  if (c && c.status !== 'aberto') nota.push('caixa já estava fechado quando a venda chegou');
  if (c && Number(c.operador_id) !== Number(user.id)) nota.push('enviada por ' + (user.name || user.login));
  try {
    if (!c) throw httpErr(400, 'Caixa da venda não encontrado.');
    return await vendaGravar(ctx, b, S, { id: c.id, operadorId: Number(c.operador_id), operadorNome: c.operador_nome, fechadoOk: true }, nota.join(' · '));
  } catch (e) {
    if (!e.status || e.status >= 500) throw e;
    await db.query(`insert into pdv_falhas(tenant_id,id,caixa_id,operador_id,operador_nome,dados,erro) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
      [tid, b.id, c ? c.id : null, user.id, user.name || user.login, JSON.stringify(b).slice(0, 200000), String(e.message).slice(0, 300)]);
    await audit('pdv_venda_falha', { id: b.id, erro: e.message });
    return { ok: true, id: b.id, status: 'falha', erro: e.message };
  }
}
async function vendaGravar(ctx, b, S, cx, notaOffline) {
  const { user, tid, audit } = ctx;
  const offline = !!b.offline;
  const Q = price(S, b);
  let revisar = notaOffline || '';
  // valor diferente do servidor: recusa SEMPRE. Marcar "sem internet" não afrouxa nada: a venda offline que não bate
  // vira "venda com problema" (não baixa estoque, não entra no caixa) e o gerente decide.
  const shown = r2(b.totalEsperado);
  if (!(Math.abs(shown - Q.total) < 0.006)) throw httpErr(409, 'O valor da venda não confere com o preço atual (' + Q.total.toFixed(2).replace('.', ',') + '). Confira e tente de novo.');
  let autorizou = null;
  if (Q.needAuth) {
    const tk = String(b.autorizacao || '');
    const a = tk ? (await db.query(`update pdv_autorizacoes set usado_em=now() where token_hash=$1 and tenant_id=$2 and conteudo=$3 and usado_em is null and expira_em>now() returning gerente`, [sha(tk), tid, contentKey(b, user.id)])).rows[0] : null;
    if (!a) throw Object.assign(httpErr(403, 'Este desconto precisa da senha do gerente.'), { needAuth: true });
    autorizou = a.gerente;
  }
  // pagamentos
  const pays = Array.isArray(b.pagamentos) ? b.pagamentos : [];
  if (!pays.length || pays.length > 10) throw httpErr(400, 'Informe o pagamento.');
  const P = pays.map(p => {
    const forma = String(p && p.forma || '');
    if (!FORMAS.includes(forma)) throw httpErr(400, 'Forma de pagamento inválida.');
    const valor = r2(p.valor);
    if (!(valor > 0) || valor > 10000000) throw httpErr(400, 'Valor de pagamento inválido.');
    if (forma === 'pix' && !p.conferido) throw httpErr(400, 'Confira o PIX recebido antes de finalizar.');
    return { forma, valor, recebido: forma === 'dinheiro' && Number(p.recebido) > 0 ? r2(p.recebido) : null, conferido: !!p.conferido };
  });
  const pago = r2(P.reduce((s, p) => s + p.valor, 0));
  const din = r2(P.filter(p => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0));
  // troco só sai do dinheiro: o que passou do total precisa ser em dinheiro
  const troco = r2(pago - Q.total);
  if (troco < -0.004) throw httpErr(400, 'Falta receber ' + (-troco).toFixed(2).replace('.', ',') + '.');
  if (troco > din + 0.004) throw httpErr(400, 'Troco só pode sair de pagamento em dinheiro.');
  const fiado = r2(P.filter(p => p.forma === 'fiado').reduce((s, p) => s + p.valor, 0));
  if (fiado > 0) {
    if (!Q.cust) throw httpErr(400, 'Fiado só para cliente identificado (F4).');
  }
  // fiado: confere (e reconfere dentro da trava do cliente) a mesma regra de crédito do app
  const fiadoOk = S2 => {
    const F = fiadoInfo(S2, Q.cust, fiado);
    const erro = F.motivo || (fiado > F.disponivel + 0.004 ? 'Passa do limite do cliente. Disponível: ' + F.disponivel.toFixed(2).replace('.', ',') + '.' : '');
    if (erro) throw httpErr(400, erro);
  };
  if (fiado > 0) fiadoOk(S);
  const out = await db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    // trava o caixa: venda e fechamento não se cruzam (fechamento espera; venda em caixa recém-fechado é recusada)
    const cs = (await q(`select status from caixas where tenant_id=$1 and id=$2 for update`, [tid, cx.id])).rows[0];
    if (!cs || (cs.status !== 'aberto' && !cx.fechadoOk)) throw httpErr(409, 'O caixa desta venda foi fechado. Abra o caixa de novo.');
    // trava o cliente do fiado: dois caixas vendendo fiado ao mesmo cliente não estouram o limite juntos
    if (fiado > 0) {
      await q(`select pg_advisory_xact_lock(hashtext($1))`, ['pdvfiado:' + tid + ':' + Q.cust.id]);
      fiadoOk(withDefaults((await store.loadAll(tid, ['customers', 'receivables', 'orders', 'products'])).S));
    }
    const numero = await nextNo(q, tid, 'venda');
    const ins = await q(`insert into pdv_vendas(tenant_id,id,numero,caixa_id,operador_id,operador_nome,customer_id,customer_nome,ie,subtotal,desconto,total,custo_total,troco,status,revisar_motivo,desconto_autorizado_por,offline,criado_no_aparelho)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict (tenant_id,id) do nothing returning id`,
      [tid, b.id, numero, cx.id, cx.operadorId, cx.operadorNome, Q.cust ? Q.cust.id : null, Q.cust ? Q.cust.name : null, Q.ie, Q.sub, Q.desc, Q.total, Q.costTotal, Math.max(0, troco),
        revisar ? 'revisar' : 'concluida', revisar || null, autorizou, offline, validDate(b.clientAt)]);
    if (!ins.rowCount) return null;  // outro envio da mesma venda chegou junto: fica o primeiro
    for (const l of Q.lines) {
      await q(`insert into pdv_itens(tenant_id,venda_id,seq,product_id,nome,ean,qtd,preco_unit,custo_unit,desconto,total,cancelado,motivo_cancel) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tid, b.id, l.seq, l.p.id, l.p.name, l.p.ean || null, l.q, l.unit, l.cost, l.desc || 0, l.total || 0, !!l.cancel, l.motivo || null]);
      // estoque: baixa relativa, dentro da transação (vendas ao mesmo tempo não se atropelam)
      if (!l.cancel) await q(`update docs_t set data=jsonb_set(data,'{stock}',to_jsonb(round(((data->>'stock')::numeric - $3::numeric), 3))), ver=ver+1, updated_at=now()
        where tenant_id=$1 and coll='products' and id=$2 and (data->>'stock') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$'`, [tid, l.p.id, String(l.q)]);
    }
    let n = 0;
    for (const p of P) {
      n++;
      let recId = null;
      if (p.forma === 'fiado') {
        // fiado vira conta a receber do cliente (aparece no Financeiro e no limite de crédito)
        recId = 'pdv' + crypto.randomBytes(6).toString('hex');
        const due = new Date(Date.now() + cfgOf(S).fiadoDias * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        const rec = { id: recId, customerId: Q.cust.id, customer: Q.cust.name, orderId: '', orderNo: 'PDV ' + numero, amount: p.valor, due, paidAt: '', parcel: '1/1', desc: 'Venda no balcão nº ' + numero + ' (fiado)', origin: 'pdv', pdvVenda: b.id, created: new Date().toISOString() };
        await q(`insert into docs_t(tenant_id,coll,id,data) values($1,'receivables',$2,$3)`, [tid, recId, JSON.stringify(rec)]);
      }
      await q(`insert into pdv_pagamentos(tenant_id,venda_id,seq,forma,valor,recebido,conferido,receivable_id) values($1,$2,$3,$4,$5,$6,$7,$8)`, [tid, b.id, n, p.forma, p.valor, p.recebido, p.conferido, recId]);
    }
    return { numero };
  });
  if (!out) return venda(ctx, b, S);  // devolve a que ficou gravada
  await audit('pdv_venda', { id: b.id, numero: out.numero, total: Q.total, desconto: Q.desc, autorizou, revisar: revisar || undefined, offline: offline || undefined });
  return { ok: true, id: b.id, numero: out.numero, status: revisar ? 'revisar' : 'concluida', total: Q.total, troco: Math.max(0, troco), sale: quoteOut(Q), autorizadoPor: autorizou };
}
function validDate(v) { const d = new Date(String(v || '')); return isNaN(d) || Math.abs(Date.now() - d) > 30 * 864e5 ? null : d.toISOString(); }

/* ---------- venda do balcão vira pedido normal para emitir NF-e ---------- */
async function faturar(ctx, id) {
  const { tid, user, audit } = ctx;
  const v = (await db.query(`select * from pdv_vendas where tenant_id=$1 and id=$2`, [tid, id])).rows[0];
  if (!v) throw httpErr(404, 'Venda não encontrada.');
  if (v.pedido_id) throw httpErr(409, 'Esta venda já foi enviada para o faturamento.');
  if (v.status !== 'concluida') throw httpErr(400, 'Confira a venda antes de enviar para o faturamento.');
  if (!v.customer_id) throw httpErr(400, 'Para emitir NF-e a venda precisa ter cliente identificado.');
  const it = (await db.query(`select * from pdv_itens where tenant_id=$1 and venda_id=$2 and not cancelado order by seq`, [tid, id])).rows;
  const S = withDefaults((await store.loadAll(tid, ['products', 'customers'])).S);
  const cust = (S.customers || []).find(c => c.id === v.customer_id) || {};
  const pedidoId = 'pv' + crypto.randomBytes(6).toString('hex');
  const no = await db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    const n = await store.nextOrderNo(q, tid);
    // preço de cada item já com o desconto do balcão, e a soma dos itens fecha EXATAMENTE no total pago
    // (quando o centavo não divide, a linha vira duas: N-1 unidades num preço e 1 unidade com a sobra)
    const items = [];
    it.forEach(i => {
      const p = (S.products || []).find(x => x.id === i.product_id) || {};
      const base = { pid: i.product_id, name: i.nome, unit: p.unit || '', code: p.code || '', ean: i.ean || '', cat: p.cat || '', base: Number(i.preco_unit), cost: i.custo_unit != null ? Number(i.custo_unit) : '', ie: !!v.ie };
      const q = Number(i.qtd), tot = Number(i.total), un = Math.floor(tot / q * 100 + 1e-6) / 100;
      if (Number.isInteger(q) && q > 1 && Math.abs(un * q - tot) > 0.004) { items.push(Object.assign({}, base, { q: q - 1, price: un })); items.push(Object.assign({}, base, { q: 1, price: r2(tot - un * (q - 1)) })); }
      else items.push(Object.assign({}, base, { q, price: Number.isInteger(q) ? r2(tot / q) : Math.round(tot / q * 10000) / 10000 }));
    });
    const totItens = r2(items.reduce((s, x) => s + x.price * x.q, 0));
    const o = { id: pedidoId, no: n, fee: 0, date: new Date().toISOString(), customerId: v.customer_id, customer: v.customer_nome || cust.name || '', doc: cust.doc || '', phone: cust.phone || '',
      items, sub: totItens, disc: 0, discPct: 0, total: totItens, pdvDesconto: Number(v.desconto), nf: { on: true }, mode: 'retirada', pay: 'PDV (pago no balcão)', note: 'Venda do balcão nº ' + v.numero,
      status: 'separado', origin: 'pdv', pdvVenda: id,
      // estoque já baixou e o dinheiro já entrou no balcão: o pedido não baixa de novo nem gera conta
      stockApplied: Object.fromEntries(items.map(i => [i.pid, i.q])), recLaunched: true,
      events: [{ at: new Date().toISOString(), text: 'Pedido nº ' + n + ' criado a partir da venda do balcão nº ' + v.numero + ' por ' + (user.name || user.login) }] };
    await q(`insert into docs_t(tenant_id,coll,id,data) values($1,'orders',$2,$3)`, [tid, pedidoId, JSON.stringify(o)]);
    const u = await q(`update pdv_vendas set pedido_id=$3 where tenant_id=$1 and id=$2 and pedido_id is null returning id`, [tid, id, pedidoId]);
    if (!u.rowCount) throw httpErr(409, 'Esta venda já foi enviada para o faturamento.');
    return n;
  });
  await audit('pdv_faturar', { venda: id, pedido: pedidoId, no });
  return { ok: true, pedidoId, no };
}

/* ---------- relatórios (administrador) ---------- */
async function turno(tid, id, admin) {
  const c = (await db.query(`select * from caixas where tenant_id=$1 and id=$2`, [tid, id])).rows[0];
  if (!c) throw httpErr(404, 'Caixa não encontrado.');
  const E = await esperado((a, p) => db.query(a, p), tid, id);
  const mv = (await db.query(`select tipo,valor,motivo,autorizado_por,created_at from caixa_movimentos where tenant_id=$1 and caixa_id=$2 order by created_at`, [tid, id])).rows;
  const canc = (await db.query(`select i.nome,i.qtd,i.motivo_cancel,v.numero from pdv_itens i join pdv_vendas v on v.tenant_id=i.tenant_id and v.id=i.venda_id where i.tenant_id=$1 and v.caixa_id=$2 and i.cancelado`, [tid, id])).rows;
  return { id: c.id, numero: Number(c.numero), operador: c.operador_nome, abertoEm: c.aberto_em, fechadoEm: c.fechado_em, status: c.status, fundo: Number(c.fundo),
    contado: c.contado, esperado: c.status === 'fechado' || admin ? E.esperado : null, diferenca: c.diferenca != null ? Number(c.diferenca) : null, justificativa: c.justificativa, justificadoPor: c.justificado_por,
    vendas: E.vendas, totalVendas: E.totalVendas, fiado: E.fiado, sangria: E.sangria, suprimento: E.suprimento,
    movimentos: mv.map(m => ({ tipo: m.tipo, valor: Number(m.valor), motivo: m.motivo, autorizadoPor: m.autorizado_por, em: m.created_at })),
    cancelados: canc.map(x => ({ venda: Number(x.numero), nome: x.nome, qtd: Number(x.qtd), motivo: x.motivo_cancel })) };
}
async function resumo(tid, query) {
  const diaBR = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD no horário de Brasília
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(query.get('de') || '')) ? query.get('de') : diaBR(Date.now() - 6 * 864e5);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(query.get('ate') || '')) ? query.get('ate') : diaBR(Date.now());
  const rng = [tid, de, ate];
  const where = `tenant_id=$1 and status<>'cancelada' and (created_at at time zone 'America/Sao_Paulo')::date between $2::date and $3::date`;
  const tot = (await db.query(`select count(*)::int as n, coalesce(sum(total),0)::numeric as total, coalesce(sum(desconto),0)::numeric as desc, coalesce(sum(custo_total),0)::numeric as custo, coalesce(sum(total) filter (where custo_total is not null),0)::numeric as tcusto from pdv_vendas where ${where}`, rng)).rows[0];
  const dia = (await db.query(`select (created_at at time zone 'America/Sao_Paulo')::date::text as d, count(*)::int as n, sum(total)::numeric as total from pdv_vendas where ${where} group by 1 order by 1`, rng)).rows;
  const formas = (await db.query(`select p.forma, sum(p.valor)::numeric as v from pdv_pagamentos p join pdv_vendas v on v.tenant_id=p.tenant_id and v.id=p.venda_id
    where v.tenant_id=$1 and v.status<>'cancelada' and (v.created_at at time zone 'America/Sao_Paulo')::date between $2::date and $3::date group by 1`, rng)).rows;
  const caixasAbertos = (await db.query(`select id,numero,operador_nome,aberto_em from caixas where tenant_id=$1 and status='aberto' order by aberto_em`, [tid])).rows;
  const diferencas = (await db.query(`select id,numero,operador_nome,fechado_em,diferenca from caixas where tenant_id=$1 and status='fechado' and diferenca<>0 and justificativa is null order by fechado_em desc limit 50`, [tid])).rows;
  const revisar = (await db.query(`select id,numero,total,revisar_motivo,operador_nome,created_at from pdv_vendas where tenant_id=$1 and status='revisar' order by created_at desc limit 50`, [tid])).rows;
  const falhas = (await db.query(`select id,operador_nome,erro,created_at,dados->>'totalEsperado' as total from pdv_falhas where tenant_id=$1 and resolvida_em is null order by created_at desc limit 50`, [tid])).rows;
  const vendas = (await db.query(`select id,numero,total,desconto,customer_nome,operador_nome,created_at,status,pedido_id,desconto_autorizado_por from pdv_vendas where ${where} order by created_at desc limit 100`, rng)).rows;
  const turnos = (await db.query(`select id,numero,operador_nome,aberto_em,fechado_em,status,diferenca,justificativa from caixas where tenant_id=$1 order by aberto_em desc limit 30`, [tid])).rows;
  const total = Number(tot.total), tcusto = Number(tot.tcusto), custo = Number(tot.custo);
  return {
    de, ate, vendas: tot.n, total: r2(total), desconto: r2(tot.desc),
    margem: tcusto > 0 ? Math.round((tcusto - custo) / tcusto * 1000) / 10 : null, // margem do balcão (só o administrador vê)
    porDia: dia.map(x => ({ d: x.d, n: x.n, total: r2(x.total) })), porForma: Object.fromEntries(formas.map(x => [x.forma, r2(x.v)])),
    caixasAbertos: caixasAbertos.map(x => ({ id: x.id, numero: Number(x.numero), operador: x.operador_nome, desde: x.aberto_em })),
    diferencas: diferencas.map(x => ({ id: x.id, numero: Number(x.numero), operador: x.operador_nome, em: x.fechado_em, diferenca: Number(x.diferenca) })),
    falhas: falhas.map(x => ({ id: x.id, operador: x.operador_nome, erro: x.erro, em: x.created_at, total: Number(x.total) || 0 })),
    revisar: revisar.map(x => ({ id: x.id, numero: Number(x.numero), total: Number(x.total), motivo: x.revisar_motivo, operador: x.operador_nome, em: x.created_at })),
    lista: vendas.map(x => ({ id: x.id, numero: Number(x.numero), total: Number(x.total), desconto: Number(x.desconto), cliente: x.customer_nome, operador: x.operador_nome, em: x.created_at, status: x.status, pedidoId: x.pedido_id, autorizou: x.desconto_autorizado_por })),
    turnos: turnos.map(x => ({ id: x.id, numero: Number(x.numero), operador: x.operador_nome, abertoEm: x.aberto_em, fechadoEm: x.fechado_em, status: x.status, diferenca: x.diferenca != null ? Number(x.diferenca) : null, justificativa: x.justificativa }))
  };
}

module.exports = { handle, price, cfgOf, contentKey };

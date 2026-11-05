'use strict';
/*
 * DRE — área do painel gerencial (ramo 'caixa'), só do administrador. Junta, por mês e filial (1 a 4):
 * - StarIA (o Claude consulta e grava aqui, pelo navegador do dono): vendas, impostos das vendas, custo das
 *   mercadorias (CMV) e as contas a pagar do mês por centro de custo (vencimento no mês);
 * - a Folha de pagamento do mês (pessoas + encargos e rescisões), da aba Folha;
 * - despesas avulsas (WhatsApp ou digitadas na tela) e as sangrias do cofre, cada uma com a categoria que o dono
 *   escolher ("não é despesa" fica de fora: depósito no banco, salário que já está na folha…).
 * O servidor devolve as partes; a tela monta as linhas do DRE.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const folha = require('./folha');
const httpErr = store.httpErr;

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const uid = p => p + crypto.randomBytes(8).toString('hex');
const CATS = {
  combustivel: 'Combustível', veiculo: 'Manutenção de veículos', loja: 'Manutenção da loja', mercadoria: 'Mercadoria comprada em dinheiro',
  frete: 'Frete e carreto', embalagem: 'Embalagens e sacolas', consumo: 'Limpeza e uso e consumo', alimentacao: 'Alimentação',
  pessoal: 'Diárias e ajudantes', servicos: 'Serviços e sistemas', marketing: 'Marketing', impostos: 'Impostos e taxas', outros: 'Outros'
};
const IGNORAR = 'ignorar';   // sangria que não é despesa

function txt(v, max) { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); return s || null; }
function mesOf(v) { const s = String(v || ''); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw httpErr(400, 'Mês inválido.'); return s; }
function filialOf(v, nulo) {
  if ((v == null || v === '') && nulo) return null;
  const f = Number(v); if (!(Number.isInteger(f) && f >= 1 && f <= 4)) throw httpErr(400, 'Filial inválida (1 a 4).'); return f;
}
function dataOf(v) {
  const s = String(v || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 2000 || d.getTime() > Date.now() + 2 * 864e5) throw httpErr(400, 'Data inválida.');
  return s;
}
function valorOf(v, label, zeroOk) {
  if (v === '' || v == null) { if (zeroOk) return 0; throw httpErr(400, label + ': informe o valor.'); }
  let t = String(v).trim().replace(/^R\$\s*/i, '');
  if (typeof v !== 'number' && !/^-?(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+)$/.test(t)) throw httpErr(400, label + ': valor inválido.');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = typeof v === 'number' ? v : Number(t);
  if (!isFinite(n) || Math.abs(n) > 100000000) throw httpErr(400, label + ': valor inválido.');
  if (!zeroOk && !(n > 0)) throw httpErr(400, label + ': informe um valor maior que zero.');
  return r2(n);
}
const need = user => { if (user.role !== 'admin') throw httpErr(403, 'Só o administrador abre o DRE.'); };
const iso = d => d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : null;
const fimDoMes = mes => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);

/* ---------- leitura ---------- */
async function state(tid, mes) {
  const ini = mes + '-01', fim = fimDoMes(mes);
  const [sr, fl, fe, dr, sg, rm] = await Promise.all([
    db.query('select * from dre_staria where tenant_id=$1 and competencia=$2 order by filial', [tid, mes]),
    db.query('select filial, valores from folha_linha where tenant_id=$1 and competencia=$2', [tid, mes]),
    db.query('select filial, tipo, valor from folha_encargo where tenant_id=$1 and competencia=$2', [tid, mes]),
    db.query('select * from dre_despesa where tenant_id=$1 and competencia=$2 order by data desc, created_at desc', [tid, mes]),
    // sangrias do cofre no mês (a da gaveta de impostos não sai da empresa: fica de fora)
    db.query(`select m.id, m.valor, m.data, m.motivo, m.criado_por, s.categoria, s.filial from caixa_mov m
        left join dre_sangria s on s.tenant_id=m.tenant_id and s.mov_id=m.id
      where m.tenant_id=$1 and m.caixa='principal' and m.tipo='sangria' and m.destino is null and m.data between $2 and $3
      order by m.data desc, m.created_at desc`, [tid, ini, fim]),
    db.query('select telefone, nome, filial, ativo from wa_remetente where tenant_id=$1 order by nome', [tid])
  ]);
  const staria = {};
  for (const s of sr.rows) staria[s.filial] = { vendas: Number(s.vendas), impostos: Number(s.impostos), cmv: Number(s.cmv), contas: s.contas || {}, atualizadoEm: s.updated_at };
  // folha por filial: pessoas (sem e com o combinado à parte) e encargos por tipo
  const fol = {};
  const F = f => fol[f] || (fol[f] = { pessoas: 0, qtd: 0, porFora: 0, encargos: 0 });
  for (const l of fl.rows) { const v = l.valores || {}, x = F(l.filial); x.qtd++; for (const c of folha.CAMPOS) { if (c === 'porFora') x.porFora = r2(x.porFora + (Number(v[c]) || 0)); else x.pessoas = r2(x.pessoas + (Number(v[c]) || 0)); } }
  for (const e of fe.rows) { const x = F(e.filial); x.encargos = r2(x.encargos + Number(e.valor)); }
  return {
    mes, cats: CATS,
    staria, folha: fol,
    despesas: dr.rows.map(d => ({ id: d.id, data: iso(d.data), filial: d.filial, categoria: d.categoria, descricao: d.descricao, valor: Number(d.valor), origem: d.origem, criadoPor: d.criado_por, telefone: d.telefone })),
    sangrias: sg.rows.map(s => ({ id: s.id, valor: Number(s.valor), data: iso(s.data), motivo: s.motivo, criadoPor: s.criado_por, categoria: s.categoria || null, filial: s.filial })),
    remetentes: rm.rows.map(r => ({ telefone: r.telefone, nome: r.nome, filial: r.filial, ativo: r.ativo })),
    whatsapp: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_APP_SECRET)
  };
}

/* ---------- StarIA (o Claude entrega) ---------- */
async function salvarStaria(tid, user, b) {
  const mes = mesOf(b.mes);
  const pf = b.porFilial && typeof b.porFilial === 'object' ? b.porFilial : {};
  const ks = Object.keys(pf); if (!ks.length) throw httpErr(400, 'Informe pelo menos uma filial.');
  for (const k of ks) {
    const f = filialOf(k), x = pf[k] || {};
    const contas = {};
    if (x.contas && typeof x.contas === 'object') for (const [c, v] of Object.entries(x.contas).slice(0, 300)) { const n = txt(c, 80); if (n) contas[n] = valorOf(v, 'Conta ' + n, true); }
    const vendas = valorOf(x.vendas, 'Vendas', true), impostos = valorOf(x.impostos, 'Impostos', true), cmv = valorOf(x.cmv, 'CMV', true);
    await db.query(`insert into dre_staria(tenant_id,competencia,filial,vendas,impostos,cmv,contas,atualizado_por) values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict(tenant_id,competencia,filial) do update set vendas=excluded.vendas, impostos=excluded.impostos, cmv=excluded.cmv, contas=excluded.contas, atualizado_por=excluded.atualizado_por, updated_at=now()`,
    [tid, mes, f, vendas, impostos, cmv, JSON.stringify(contas), user.name || user.login]);
    // a Folha usa as mesmas vendas para a % (filiais 1 a 3)
    if (f <= 3) await db.query(`insert into folha_venda(tenant_id,competencia,filial,valor,fonte,atualizado_por) values($1,$2,$3,$4,'StarIA',$5)
      on conflict(tenant_id,competencia,filial) do update set valor=excluded.valor, fonte=excluded.fonte, atualizado_por=excluded.atualizado_por, updated_at=now()`,
    [tid, mes, f, vendas, user.name || user.login]);
  }
  return { mes, filiais: ks.length };
}

/* ---------- despesas avulsas ---------- */
async function salvarDespesa(tid, user, b, extra) {
  const data = dataOf(b.data);
  const categoria = CATS[b.categoria] ? b.categoria : null;
  if (!categoria) throw httpErr(400, 'Escolha a categoria.');
  const valor = valorOf(b.valor, 'Valor');
  const filial = filialOf(b.filial, true);
  const descricao = txt(b.descricao, 200);
  const x = extra || {};
  if (b.id) {
    const r = await db.query(`update dre_despesa set data=$3, competencia=$4, filial=$5, categoria=$6, descricao=$7, valor=$8 where tenant_id=$1 and id=$2 returning id`,
      [tid, String(b.id), data, data.slice(0, 7), filial, categoria, descricao, valor]);
    if (!r.rows.length) throw httpErr(404, 'Despesa não encontrada. Atualize a tela.');
    return { id: String(b.id) };
  }
  const id = uid('dd');
  await db.query(`insert into dre_despesa(tenant_id,id,data,competencia,filial,categoria,descricao,valor,origem,telefone,wa_msg_id,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [tid, id, data, data.slice(0, 7), filial, categoria, descricao, valor, x.origem || 'tela', x.telefone || null, x.waMsgId || null, x.por || user.name || user.login]);
  return { id, data, filial, categoria, valor };
}
async function apagarDespesa(tid, b) {
  const r = await db.query('delete from dre_despesa where tenant_id=$1 and id=$2 returning categoria, valor, data', [tid, String(b.id || '')]);
  if (!r.rows.length) throw httpErr(404, 'Despesa não encontrada. Atualize a tela.');
  return { categoria: r.rows[0].categoria, valor: Number(r.rows[0].valor), data: iso(r.rows[0].data) };
}
async function classificarSangria(tid, b) {
  const movId = String(b.movId || '');
  const cat = b.categoria === IGNORAR || CATS[b.categoria] ? b.categoria : null;
  const m = (await db.query(`select 1 from caixa_mov where tenant_id=$1 and id=$2 and tipo='sangria' and caixa='principal'`, [tid, movId])).rows[0];
  if (!m) throw httpErr(404, 'Sangria não encontrada. Atualize a tela.');
  if (!cat) { await db.query('delete from dre_sangria where tenant_id=$1 and mov_id=$2', [tid, movId]); return { movId, categoria: null }; }
  const filial = filialOf(b.filial, true);
  await db.query(`insert into dre_sangria(tenant_id,mov_id,categoria,filial) values($1,$2,$3,$4)
    on conflict(tenant_id,mov_id) do update set categoria=excluded.categoria, filial=excluded.filial, updated_at=now()`, [tid, movId, cat, filial]);
  return { movId, categoria: cat };
}

/* ---------- quem pode mandar despesa pelo WhatsApp ---------- */
// telefone só com números, com o 55 do Brasil: 27 99999-9999 vira 5527999999999
function telefoneOf(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) throw httpErr(400, 'Telefone inválido. Use DDD + número, ex.: 27 99999-9999.');
  return d;
}
async function salvarRemetente(tid, b) {
  const telefone = telefoneOf(b.telefone);
  const nome = txt(b.nome, 60); if (!nome || nome.length < 2) throw httpErr(400, 'Nome: escreva pelo menos 2 letras.');
  const filial = filialOf(b.filial, true);
  const ativo = b.ativo !== false;
  await db.query(`insert into wa_remetente(tenant_id,telefone,nome,filial,ativo) values($1,$2,$3,$4,$5)
    on conflict(tenant_id,telefone) do update set nome=excluded.nome, filial=excluded.filial, ativo=excluded.ativo, updated_at=now()`, [tid, telefone, nome, filial, ativo]);
  return { telefone, nome };
}
async function apagarRemetente(tid, b) {
  const r = await db.query('delete from wa_remetente where tenant_id=$1 and telefone=$2 returning nome', [tid, String(b.telefone || '')]);
  if (!r.rows.length) throw httpErr(404, 'Número não encontrado.');
  return { nome: r.rows[0].nome };
}

/* ---------- rotas: /api/caixa/dre... ---------- */
async function handle(ctx) {
  const { path, method, user, tid, query, body, audit } = ctx;
  need(user);
  if (path === '/api/caixa/dre' && method === 'GET') return state(tid, mesOf(query && query.get('mes')));
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = (await body()) || {};
  let out;
  switch (path) {
    case '/api/caixa/dre/staria': out = await salvarStaria(tid, user, b); await audit('dre_staria', out); break;
    case '/api/caixa/dre/despesa': out = await salvarDespesa(tid, user, b); await audit('dre_despesa', { id: out.id, valor: b.valor, categoria: b.categoria }); break;
    case '/api/caixa/dre/despesa/excluir': out = await apagarDespesa(tid, b); await audit('dre_despesa_excluida', Object.assign({ id: b.id }, out)); break;
    case '/api/caixa/dre/sangria': out = await classificarSangria(tid, b); await audit('dre_sangria', out); break;
    case '/api/caixa/dre/remetente': out = await salvarRemetente(tid, b); await audit('dre_remetente', out); break;
    case '/api/caixa/dre/remetente/excluir': out = await apagarRemetente(tid, b); await audit('dre_remetente_excluido', out); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, CATS, salvarDespesa, apagarDespesa, telefoneOf };

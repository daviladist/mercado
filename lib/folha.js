'use strict';
/*
 * Folha de pagamento — área do painel gerencial (ramo 'caixa'), ao lado do Caixa. Uso interno do dono.
 *
 * - folha_func: o cadastro de cada pessoa (filial 1 a 3, cargo, admissão, valores de costume). É o "modelo" do mês.
 * - folha_linha: o que se paga a cada pessoa num mês (competência AAAA-MM). Nasce copiada do cadastro ("começar o
 *   mês") e pode ser mudada só naquele mês; mudar o cadastro não mexe em meses que já começaram.
 * - folha_encargo: o que a filial paga no mês além das pessoas: INSS, FGTS, IRRF, rescisão, férias, 13º…
 *
 * Quem abre: o administrador e quem ele liberar em Acessos (financeiro ou pessoa do caixa; tabela
 * caixa_pessoa_folha). O "combinado à parte" (valores.porFora) é só do dono: não sai na resposta para mais ninguém
 * e, se outra pessoa salvar a linha, o valor que já estava gravado continua.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const httpErr = store.httpErr;

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const uid = p => p + crypto.randomBytes(8).toString('hex');
const MAX_VALOR = 10000000;
const CAMPOS = ['salario', 'extras', 'ticket', 'valeTransporte', 'planoSaude', 'planoOdonto', 'seguroVida', 'outrosBen', 'porFora'];
const TIPOS = ['inss', 'fgts', 'irrf', 'rescisao', 'ferias', 'decimo', 'sindical', 'medicina', 'outro'];

function txt(v, max, label, required) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (required && s.length < 2) throw httpErr(400, label + ': escreva pelo menos 2 letras.');
  return s || null;
}
function mesOf(v) {
  const s = String(v || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s) || +s.slice(0, 4) < 2000 || +s.slice(0, 4) > 2100) throw httpErr(400, 'Mês inválido.');
  return s;
}
function filialOf(v) {
  const f = Number(v);
  if (!(Number.isInteger(f) && f >= 1 && f <= 3)) throw httpErr(400, 'Escolha a filial (1, 2 ou 3).');
  return f;
}
function dataOf(v, label) {
  if (v == null || v === '') return null;
  const s = String(v), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1950 || +m[1] > 2100) throw httpErr(400, label + ' inválida.');
  return s;
}
// valor em reais, zero ou mais; aceita "1.234,56", "1234,56", "1234.56" ou número
function valor0(v, label) {
  if (v === '' || v == null) return 0;
  let t = String(v).trim().replace(/^R\$\s*/i, '');
  if (typeof v !== 'number' && !/^(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+)$/.test(t)) throw httpErr(400, label + ': valor inválido.');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = typeof v === 'number' ? v : Number(t);
  if (!isFinite(n) || n < 0 || n > MAX_VALOR) throw httpErr(400, label + ': valor inválido.');
  return r2(n);
}
const ROTULO = { salario: 'Salário', extras: 'Horas extras e adicionais', ticket: 'Ticket', valeTransporte: 'Vale-transporte', planoSaude: 'Plano de saúde', planoOdonto: 'Plano odontológico', seguroVida: 'Seguro de vida', outrosBen: 'Outros benefícios', porFora: 'Combinado à parte' };
function valoresOf(v, admin, antigos) {
  const out = {};
  const src = v && typeof v === 'object' ? v : {};
  for (const c of CAMPOS) {
    if (c === 'porFora' && !admin) { out.porFora = r2((antigos || {}).porFora); continue; }
    out[c] = valor0(src[c], ROTULO[c]);
  }
  if (src.outrosDesc != null) out.outrosDesc = txt(src.outrosDesc, 80, 'Outros benefícios');
  else if (antigos && antigos.outrosDesc) out.outrosDesc = antigos.outrosDesc;
  return out;
}
function limpa(valores, admin) {
  const v = Object.assign({}, valores || {});
  for (const c of CAMPOS) v[c] = r2(v[c]);
  if (!admin) delete v.porFora;
  return v;
}

/* ---------- quem pode abrir ---------- */
async function pode(tid, user) {
  if (user.role === 'admin') return true;
  return require('./caixa-abas').tem(tid, user, 'folha');
}

/* ---------- leitura ---------- */
const funcOut = (f, admin) => ({ id: f.id, filial: f.filial, nome: f.nome, cargo: f.cargo, admissao: f.admissao ? String(f.admissao instanceof Date ? f.admissao.toISOString() : f.admissao).slice(0, 10) : null,
  demissao: f.demissao ? String(f.demissao instanceof Date ? f.demissao.toISOString() : f.demissao).slice(0, 10) : null, ativo: f.ativo, valores: limpa(f.valores, admin), obs: f.obs });
const linhaOut = (l, admin) => ({ funcId: l.func_id, filial: l.filial, nome: l.nome, cargo: l.cargo, valores: limpa(l.valores, admin), obs: l.obs, atualizadoPor: l.atualizado_por, atualizadoEm: l.updated_at });
const encOut = e => ({ id: e.id, filial: e.filial, tipo: e.tipo, descricao: e.descricao, valor: Number(e.valor), pagoEm: e.pago_em ? String(e.pago_em instanceof Date ? e.pago_em.toISOString() : e.pago_em).slice(0, 10) : null, criadoPor: e.criado_por });
// último mês fechado (horário de Brasília): em 04/11 é outubro; em 28/12, novembro
function ultimoFechado() { const d = new Date(Date.now() - 3 * 3600e3); return mesAnterior(d.toISOString().slice(0, 7)); }
// mês das vendas para comparar com a folha mostrada: o próprio mês se já fechou; senão, o último fechado
const mesVendas = mes => (mes <= ultimoFechado() ? mes : ultimoFechado());
function mesAnterior(m) { let y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1; if (mm < 1) { mm = 12; y--; } return y + '-' + String(mm).padStart(2, '0'); }

async function state(tid, user, mes) {
  const admin = user.role === 'admin';
  const ant = mesAnterior(mes);
  const mv = mesVendas(mes);
  const [fr, lr, er, la, ea, vr] = await Promise.all([
    db.query('select * from folha_func where tenant_id=$1 order by filial, nome', [tid]),
    db.query('select * from folha_linha where tenant_id=$1 and competencia=$2 order by filial, nome', [tid, mes]),
    db.query('select * from folha_encargo where tenant_id=$1 and competencia=$2 order by filial, created_at', [tid, mes]),
    db.query('select filial, valores from folha_linha where tenant_id=$1 and competencia=$2', [tid, ant]),
    db.query('select filial, valor from folha_encargo where tenant_id=$1 and competencia=$2', [tid, ant]),
    db.query('select filial, valor, fonte, updated_at from folha_venda where tenant_id=$1 and competencia=$2', [tid, mv])
  ]);
  const vendas = {};
  for (const v of vr.rows) vendas[v.filial] = Number(v.valor);
  // mês anterior: só o total por filial, para comparar ("subiu/desceu quanto")
  const anterior = { 1: 0, 2: 0, 3: 0 };
  for (const l of la.rows) { const v = l.valores || {}; anterior[l.filial] = r2(anterior[l.filial] + CAMPOS.filter(c => admin || c !== 'porFora').reduce((a, c) => a + (Number(v[c]) || 0), 0)); }
  for (const e of ea.rows) anterior[e.filial] = r2(anterior[e.filial] + Number(e.valor));
  return {
    mes, mesAnterior: ant, verPorFora: admin,
    funcs: fr.rows.map(f => funcOut(f, admin)),
    linhas: lr.rows.map(l => linhaOut(l, admin)),
    encargos: er.rows.map(encOut),
    vendas: { mes: mv, porFilial: vendas, temDados: vr.rows.length > 0, fonte: vr.rows[0] ? vr.rows[0].fonte : null, atualizadoEm: vr.rows.reduce((a, v) => (!a || v.updated_at > a ? v.updated_at : a), null) },
    anterior: { mes: ant, temDados: la.rows.length + ea.rows.length > 0, porFilial: anterior }
  };
}

/* ---------- gravação ---------- */
const quem = user => user.name || user.login;
// salva a pessoa no mês (e no cadastro, se for nova ou se pediu para valer nos próximos meses)
async function salvarLinha(tid, user, b) {
  const admin = user.role === 'admin';
  const mes = mesOf(b.mes);
  const filial = filialOf(b.filial);
  const nome = txt(b.nome, 80, 'Nome', true);
  const cargo = txt(b.cargo, 60, 'Cargo');
  const admissao = dataOf(b.admissao, 'Data de admissão');
  const obs = txt(b.obs, 300, 'Observação');
  let fid = b.funcId ? String(b.funcId) : null;
  const cur = fid ? (await db.query('select * from folha_func where tenant_id=$1 and id=$2', [tid, fid])).rows[0] : null;
  if (fid && !cur) throw httpErr(404, 'Pessoa não encontrada. Atualize a tela.');
  const linhaCur = fid ? (await db.query('select valores from folha_linha where tenant_id=$1 and competencia=$2 and func_id=$3', [tid, mes, fid])).rows[0] : null;
  const valores = valoresOf(b.valores, admin, linhaCur ? linhaCur.valores : cur ? cur.valores : {});
  await db.tx(async t => {
    if (!cur) {
      fid = uid('fu');
      // horas extras são do mês: o cadastro (modelo dos próximos meses) começa sempre sem elas
      await t.query(`insert into folha_func(tenant_id,id,filial,nome,cargo,admissao,valores,obs) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tid, fid, filial, nome, cargo, admissao, JSON.stringify(Object.assign({}, valores, { extras: 0 })), obs]);
    } else if (b.atualizarCadastro !== false) {
      const vc = Object.assign({}, valores, { extras: 0 }, admin ? {} : { porFora: r2((cur.valores || {}).porFora) });
      await t.query(`update folha_func set filial=$3, nome=$4, cargo=$5, admissao=$6, valores=$7, obs=$8, updated_at=now() where tenant_id=$1 and id=$2`,
        [tid, fid, filial, nome, cargo, admissao, JSON.stringify(vc), obs]);
    }
    await t.query(`insert into folha_linha(tenant_id,competencia,func_id,filial,nome,cargo,valores,obs,atualizado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict(tenant_id,competencia,func_id) do update set filial=excluded.filial, nome=excluded.nome, cargo=excluded.cargo, valores=excluded.valores,
        obs=excluded.obs, atualizado_por=excluded.atualizado_por, updated_at=now()`,
    [tid, mes, fid, filial, nome, cargo, JSON.stringify(valores), obs, quem(user)]);
  });
  return { funcId: fid, nova: !cur };
}
async function tirarDoMes(tid, user, b) {
  const mes = mesOf(b.mes);
  const r = await db.query('delete from folha_linha where tenant_id=$1 and competencia=$2 and func_id=$3 returning nome', [tid, mes, String(b.funcId || '')]);
  if (!r.rows.length) throw httpErr(404, 'Essa pessoa já não está na folha deste mês.');
  return { nome: r.rows[0].nome };
}
// desligar (sai do cadastro ativo: não entra nos próximos meses) ou religar
async function situacao(tid, user, b) {
  const ativo = b.ativo === true;
  const demissao = ativo ? null : dataOf(b.demissao, 'Data de saída');
  const r = await db.query('update folha_func set ativo=$3, demissao=$4, updated_at=now() where tenant_id=$1 and id=$2 returning nome',
    [tid, String(b.funcId || ''), ativo, demissao]);
  if (!r.rows.length) throw httpErr(404, 'Pessoa não encontrada. Atualize a tela.');
  return { nome: r.rows[0].nome, ativo };
}
// começar o mês de uma filial: copia do cadastro quem está ativo e ainda não está no mês
async function abrirMes(tid, user, b) {
  const mes = mesOf(b.mes);
  const filial = filialOf(b.filial);
  const fimMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
  const r = await db.query(`insert into folha_linha(tenant_id,competencia,func_id,filial,nome,cargo,valores,obs,atualizado_por)
      select f.tenant_id, $2, f.id, f.filial, f.nome, f.cargo, f.valores, null, $4 from folha_func f
      where f.tenant_id=$1 and f.filial=$3 and f.ativo and (f.admissao is null or f.admissao <= $5::date)
    on conflict(tenant_id,competencia,func_id) do nothing returning func_id`, [tid, mes, filial, quem(user), fimMes]);
  return { incluidas: r.rows.length };
}
async function salvarEncargo(tid, user, b) {
  const mes = mesOf(b.mes);
  const filial = filialOf(b.filial);
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw httpErr(400, 'Escolha o tipo do encargo.');
  const valor = valor0(b.valor, 'Valor');
  if (!(valor > 0)) throw httpErr(400, 'Valor: informe um valor maior que zero.');
  const descricao = txt(b.descricao, 120, 'Descrição', tipo === 'outro');
  const pagoEm = dataOf(b.pagoEm, 'Data do pagamento');
  if (b.id) {
    const r = await db.query(`update folha_encargo set competencia=$3, filial=$4, tipo=$5, descricao=$6, valor=$7, pago_em=$8 where tenant_id=$1 and id=$2 returning id`,
      [tid, String(b.id), mes, filial, tipo, descricao, valor, pagoEm]);
    if (!r.rows.length) throw httpErr(404, 'Encargo não encontrado. Atualize a tela.');
    return { id: String(b.id) };
  }
  const id = uid('fe');
  await db.query(`insert into folha_encargo(tenant_id,id,competencia,filial,tipo,descricao,valor,pago_em,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tid, id, mes, filial, tipo, descricao, valor, pagoEm, quem(user)]);
  return { id };
}
async function apagarEncargo(tid, user, b) {
  const r = await db.query('delete from folha_encargo where tenant_id=$1 and id=$2 returning tipo, valor, competencia, filial', [tid, String(b.id || '')]);
  if (!r.rows.length) throw httpErr(404, 'Encargo não encontrado. Atualize a tela.');
  const e = r.rows[0];
  return { tipo: e.tipo, valor: Number(e.valor), mes: e.competencia, filial: e.filial };
}

// vendas de um mês já fechado, por filial (o Claude entrega do StarIA; o dono também pode digitar). Só o dono.
async function salvarVendas(tid, user, b) {
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador lança as vendas do mês.');
  const mes = mesOf(b.mes);
  if (mes > ultimoFechado()) throw httpErr(400, 'Esse mês ainda não fechou. Use um mês já fechado.');
  const pf = b.porFilial && typeof b.porFilial === 'object' ? b.porFilial : {};
  const ks = Object.keys(pf);
  if (!ks.length) throw httpErr(400, 'Informe as vendas de pelo menos uma filial.');
  const fonte = txt(b.fonte, 80, 'Fonte') || 'digitado';
  for (const k of ks) {
    const f = filialOf(k), v = valor0(pf[k], 'Vendas da filial ' + f);
    await db.query(`insert into folha_venda(tenant_id,competencia,filial,valor,fonte,atualizado_por) values($1,$2,$3,$4,$5,$6)
      on conflict(tenant_id,competencia,filial) do update set valor=excluded.valor, fonte=excluded.fonte, atualizado_por=excluded.atualizado_por, updated_at=now()`,
    [tid, mes, f, v, fonte, quem(user)]);
  }
  return { mes, filiais: ks.length };
}

/* ---------- rotas: /api/caixa/folha... (chamado pelo lib/caixa.js, depois do login) ---------- */
async function handle(ctx) {
  const { path, method, user, tid, query, body, audit } = ctx;
  if (!(await pode(tid, user))) throw httpErr(403, 'Você não tem acesso à folha de pagamento. Peça ao administrador.');
  if (path === '/api/caixa/folha' && method === 'GET') return state(tid, user, mesOf(query && query.get('mes')));
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = (await body()) || {};
  let out;
  switch (path) {
    case '/api/caixa/folha/linha': out = await salvarLinha(tid, user, b); await audit('folha_linha', { mes: b.mes, funcId: out.funcId, nova: out.nova }); break;
    case '/api/caixa/folha/linha/tirar': out = await tirarDoMes(tid, user, b); await audit('folha_linha_tirada', { mes: b.mes, funcId: b.funcId }); break;
    case '/api/caixa/folha/situacao': out = await situacao(tid, user, b); await audit('folha_situacao', { funcId: b.funcId, ativo: out.ativo }); break;
    case '/api/caixa/folha/abrir': out = await abrirMes(tid, user, b); await audit('folha_mes_aberto', { mes: b.mes, filial: b.filial, incluidas: out.incluidas }); break;
    case '/api/caixa/folha/encargo': out = await salvarEncargo(tid, user, b); await audit('folha_encargo', { mes: b.mes, id: out.id, tipo: b.tipo }); break;
    case '/api/caixa/folha/vendas': out = await salvarVendas(tid, user, b); await audit('folha_vendas', { mes: out.mes, filiais: out.filiais }); break;
    case '/api/caixa/folha/encargo/excluir': out = await apagarEncargo(tid, user, b); await audit('folha_encargo_excluido', Object.assign({ id: b.id }, out)); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, pode, CAMPOS, TIPOS };

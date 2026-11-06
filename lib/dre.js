'use strict';
/*
 * DRE — demonstrativo de resultado do mês, área do painel gerencial (ramo 'caixa'), ao lado do Caixa e da Folha.
 * Só o dono (admin) abre: mostra lucro e margem de cada loja.
 *
 * Por filial (1, 2, 3) e Geral (soma das três + as despesas da "rede", filial 0, que não são de uma loja só:
 * contabilidade, escritório, sistema da rede…):
 *   Receita bruta − impostos sobre a venda = receita líquida − CMV = lucro bruto
 *   − pessoal (da Folha: pessoas do mês + encargos) − despesas fixas − despesas do dia a dia = resultado operacional
 *   − financiamentos, retiradas e investimentos = sobra de caixa do mês
 *
 * - dre_resultado: receita, impostos e CMV do mês por filial (StarIA, entregue pelo Claude, ou digitado pelo dono)
 * - dre_fixa: despesas que se repetem (aluguel, energia, internet…), com o valor de costume e o mês em que começa
 *   (e termina, quando para). dre_fixa_mes: o valor real de um mês, quando foi diferente do costume.
 * - dre_despesa: as despesas do dia a dia lançadas no mês (diesel, conserto, frete…).
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const folha = require('./folha');
const telegram = require('./telegram');
const httpErr = store.httpErr;

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const uid = p => p + crypto.randomBytes(8).toString('hex');
const MAX_VALOR = 100000000;
// categorias: as operacionais entram no resultado; as "abaixo" (financiamento, retirada, investimento) vêm depois
const CATS = {
  aluguel: 'Aluguel', energia: 'Energia', agua: 'Água', internet: 'Internet e telefone', sistema: 'Sistema e software',
  contabilidade: 'Contabilidade', combustivel: 'Combustível', manutencao: 'Manutenção e conserto', frete: 'Frete',
  marketing: 'Marketing e propaganda', taxas: 'Taxas de cartão e banco', embalagens: 'Embalagens e limpeza',
  seguro: 'Seguros', impostos: 'Impostos e taxas (fora da venda)', perdas: 'Perdas e quebras', outros: 'Outras despesas',
  financiamento: 'Parcelas de financiamento', retirada: 'Pró-labore e retiradas', investimento: 'Investimentos (equipamento, reforma)'
};
const ABAIXO = ['financiamento', 'retirada', 'investimento'];
const FILIAIS = [1, 2, 3];

function txt(v, max, label, required) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (required && s.length < 2) throw httpErr(400, label + ': escreva pelo menos 2 letras.');
  return s || null;
}
function mesOf(v, label) {
  const s = String(v || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s) || +s.slice(0, 4) < 2000 || +s.slice(0, 4) > 2100) throw httpErr(400, (label || 'Mês') + ' inválido.');
  return s;
}
// 0 = rede (despesa de todas as lojas juntas, só entra no Geral)
function filialOf(v, comRede) {
  const f = Number(v);
  if (Number.isInteger(f) && f >= 1 && f <= 3) return f;
  if (comRede && f === 0 && v !== '' && v != null) return 0;
  throw httpErr(400, comRede ? 'Escolha a filial (1, 2, 3 ou rede).' : 'Escolha a filial (1, 2 ou 3).');
}
function dataOf(v, label) {
  if (v == null || v === '') return null;
  const s = String(v), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 2000 || +m[1] > 2100) throw httpErr(400, label + ' inválida.');
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
function catOf(v) { if (!CATS[v]) throw httpErr(400, 'Escolha a categoria.'); return v; }
const dia = d => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
function mesAnterior(m) { let y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1; if (mm < 1) { mm = 12; y--; } return y + '-' + String(mm).padStart(2, '0'); }
function ultimoFechado() { const d = new Date(Date.now() - 3 * 3600e3); return mesAnterior(d.toISOString().slice(0, 7)); }
const quem = user => user.name || user.login;

const pode = user => user.role === 'admin';

/* ---------- leitura ---------- */
async function dadosMes(tid, mes) {
  const [rr, fr, lr, er, dr] = await Promise.all([
    db.query('select filial, receita, impostos, cmv, fonte, updated_at from dre_resultado where tenant_id=$1 and competencia=$2', [tid, mes]),
    db.query(`select f.*, m.valor as valor_mes from dre_fixa f left join dre_fixa_mes m on m.tenant_id=f.tenant_id and m.fixa_id=f.id and m.competencia=$2
      where f.tenant_id=$1 and f.inicio <= $2 and (f.fim is null or f.fim >= $2) order by f.filial, f.categoria, f.descricao`, [tid, mes]),
    db.query('select filial, valores from folha_linha where tenant_id=$1 and competencia=$2', [tid, mes]),
    db.query('select filial, valor from folha_encargo where tenant_id=$1 and competencia=$2', [tid, mes]),
    db.query(`select * from dre_despesa where tenant_id=$1 and competencia=$2 and status='ok' order by data nulls last, created_at`, [tid, mes])
  ]);
  const resultado = {};
  for (const r of rr.rows) resultado[r.filial] = { receita: Number(r.receita), impostos: Number(r.impostos), cmv: Number(r.cmv), fonte: r.fonte, atualizadoEm: r.updated_at };
  // pessoal: o que a Folha tem no mês (pessoas, incluindo o combinado à parte, + encargos e rescisões)
  const pessoal = { 1: 0, 2: 0, 3: 0 }, pessoas = { 1: 0, 2: 0, 3: 0 };
  for (const l of lr.rows) { const v = l.valores || {}; pessoas[l.filial]++; pessoal[l.filial] = r2(pessoal[l.filial] + folha.CAMPOS.reduce((a, c) => a + (Number(v[c]) || 0), 0)); }
  for (const e of er.rows) pessoal[e.filial] = r2(pessoal[e.filial] + Number(e.valor));
  const fixas = fr.rows.map(f => ({ id: f.id, filial: f.filial, categoria: f.categoria, descricao: f.descricao, costume: Number(f.valor),
    valor: f.valor_mes != null ? Number(f.valor_mes) : Number(f.valor), mudouNoMes: f.valor_mes != null, inicio: f.inicio, fim: f.fim }));
  const despesas = dr.rows.map(d => ({ id: d.id, filial: d.filial, categoria: d.categoria, descricao: d.descricao, valor: Number(d.valor), data: dia(d.data), criadoPor: d.criado_por }));
  return { resultado, pessoal, pessoas, folhaTem: lr.rows.length + er.rows.length > 0, fixas, despesas };
}
// conta o DRE de um conjunto de filiais (0 = rede entra só quando pedido)
function conta(D, filiais) {
  const T = { receita: 0, impostos: 0, cmv: 0, pessoal: 0, fixas: 0, variaveis: 0, abaixo: 0, temVendas: filiais.filter(f => f > 0).every(f => D.resultado[f]) };
  for (const f of filiais) {
    const r = D.resultado[f]; if (r) { T.receita += r.receita; T.impostos += r.impostos; T.cmv += r.cmv; }
    T.pessoal += D.pessoal[f] || 0;
  }
  for (const x of D.fixas) if (filiais.includes(x.filial)) { if (ABAIXO.includes(x.categoria)) T.abaixo += x.valor; else T.fixas += x.valor; }
  for (const x of D.despesas) if (filiais.includes(x.filial)) { if (ABAIXO.includes(x.categoria)) T.abaixo += x.valor; else T.variaveis += x.valor; }
  for (const k of Object.keys(T)) if (typeof T[k] === 'number') T[k] = r2(T[k]);
  T.liquida = r2(T.receita - T.impostos);
  T.bruto = r2(T.liquida - T.cmv);
  T.operacional = r2(T.bruto - T.pessoal - T.fixas - T.variaveis);
  T.sobra = r2(T.operacional - T.abaixo);
  return T;
}
async function state(tid, mes) {
  const ant = mesAnterior(mes);
  const [D, A, T] = await Promise.all([dadosMes(tid, mes), dadosMes(tid, ant), telegram.estado(tid)]);
  const tot = D2 => { const o = {}; for (const f of FILIAIS) o[f] = conta(D2, [f]); o.rede = conta(D2, [0]); o.geral = conta(D2, [0, 1, 2, 3]); return o; };
  return {
    mes, mesAnterior: ant, ultimoFechado: ultimoFechado(), categorias: CATS, abaixo: ABAIXO,
    telegram: T,
    resultado: D.resultado, pessoas: D.pessoas, folhaTem: D.folhaTem, fixas: D.fixas, despesas: D.despesas,
    totais: tot(D), anterior: { mes: ant, temVendas: Object.keys(A.resultado).length > 0, totais: tot(A) }
  };
}

/* ---------- gravação ---------- */
// receita, impostos e CMV do mês por filial (o Claude entrega do StarIA; o dono também pode digitar)
async function salvarResultado(tid, user, b) {
  const mes = mesOf(b.mes);
  const pf = b.porFilial && typeof b.porFilial === 'object' ? b.porFilial : {};
  const ks = Object.keys(pf);
  if (!ks.length) throw httpErr(400, 'Informe as vendas de pelo menos uma filial.');
  const fonte = txt(b.fonte, 80, 'Fonte') || 'digitado';
  const linhas = ks.map(k => {
    const f = filialOf(k), x = pf[k] || {};
    const receita = valor0(x.receita, 'Vendas da filial ' + f), impostos = valor0(x.impostos, 'Impostos da filial ' + f), cmv = valor0(x.cmv, 'Custo (CMV) da filial ' + f);
    if (impostos + cmv > receita * 3 && receita > 0) throw httpErr(400, 'Filial ' + f + ': impostos e custo muito acima das vendas. Confira os valores.');
    return [f, receita, impostos, cmv];
  });
  await db.tx(async t => {
    for (const [f, receita, impostos, cmv] of linhas) {
      await t.query(`insert into dre_resultado(tenant_id,competencia,filial,receita,impostos,cmv,fonte,atualizado_por) values($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict(tenant_id,competencia,filial) do update set receita=excluded.receita, impostos=excluded.impostos, cmv=excluded.cmv, fonte=excluded.fonte,
          atualizado_por=excluded.atualizado_por, updated_at=now()`, [tid, mes, f, receita, impostos, cmv, fonte, quem(user)]);
    }
  });
  return { mes, filiais: linhas.length };
}
// despesa fixa: cadastro (vale do mês de início em diante)
async function salvarFixa(tid, user, b) {
  const filial = filialOf(b.filial, true);
  const categoria = catOf(b.categoria);
  const descricao = txt(b.descricao, 80, 'Descrição', true);
  const valor = valor0(b.valor, 'Valor');
  if (!(valor > 0)) throw httpErr(400, 'Valor: informe um valor maior que zero.');
  const inicio = mesOf(b.inicio, 'Mês de início');
  if (b.id) {
    const r = await db.query(`update dre_fixa set filial=$3, categoria=$4, descricao=$5, valor=$6, inicio=$7, updated_at=now() where tenant_id=$1 and id=$2 returning id`,
      [tid, String(b.id), filial, categoria, descricao, valor, inicio]);
    if (!r.rows.length) throw httpErr(404, 'Despesa fixa não encontrada. Atualize a tela.');
    return { id: String(b.id) };
  }
  const id = uid('dx');
  await db.query(`insert into dre_fixa(tenant_id,id,filial,categoria,descricao,valor,inicio,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tid, id, filial, categoria, descricao, valor, inicio, quem(user)]);
  return { id };
}
// valor de um mês só (energia veio diferente); valor vazio volta ao de costume
async function fixaNoMes(tid, user, b) {
  const mes = mesOf(b.mes);
  const id = String(b.id || '');
  const f = (await db.query('select id from dre_fixa where tenant_id=$1 and id=$2', [tid, id])).rows[0];
  if (!f) throw httpErr(404, 'Despesa fixa não encontrada. Atualize a tela.');
  if (b.valor === '' || b.valor == null) { await db.query('delete from dre_fixa_mes where tenant_id=$1 and fixa_id=$2 and competencia=$3', [tid, id, mes]); return { id, costume: true }; }
  const valor = valor0(b.valor, 'Valor');
  await db.query(`insert into dre_fixa_mes(tenant_id,fixa_id,competencia,valor,atualizado_por) values($1,$2,$3,$4,$5)
    on conflict(tenant_id,fixa_id,competencia) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por, updated_at=now()`, [tid, id, mes, valor, quem(user)]);
  return { id, valor };
}
// parar de cobrar a partir de um mês (o último mês cobrado é o anterior); os meses passados ficam como estão
async function encerrarFixa(tid, user, b) {
  const mes = mesOf(b.mes);
  const r = await db.query(`update dre_fixa set fim=$3, updated_at=now() where tenant_id=$1 and id=$2 returning descricao, inicio`, [tid, String(b.id || ''), mesAnterior(mes)]);
  if (!r.rows.length) throw httpErr(404, 'Despesa fixa não encontrada. Atualize a tela.');
  if (r.rows[0].inicio >= mes) await db.query('delete from dre_fixa where tenant_id=$1 and id=$2', [tid, String(b.id)]);
  return { descricao: r.rows[0].descricao };
}
async function salvarDespesa(tid, user, b) {
  const mes = mesOf(b.mes);
  const filial = filialOf(b.filial, true);
  const categoria = catOf(b.categoria);
  const descricao = txt(b.descricao, 120, 'Descrição', true);
  const valor = valor0(b.valor, 'Valor');
  if (!(valor > 0)) throw httpErr(400, 'Valor: informe um valor maior que zero.');
  const data = dataOf(b.data, 'Data');
  if (data && data.slice(0, 7) !== mes) throw httpErr(400, 'A data tem que ser do mês que está aberto na tela.');
  if (b.id) {
    const r = await db.query(`update dre_despesa set competencia=$3, filial=$4, categoria=$5, descricao=$6, valor=$7, data=$8 where tenant_id=$1 and id=$2 returning id`,
      [tid, String(b.id), mes, filial, categoria, descricao, valor, data]);
    if (!r.rows.length) throw httpErr(404, 'Despesa não encontrada. Atualize a tela.');
    return { id: String(b.id) };
  }
  const id = uid('dd');
  await db.query(`insert into dre_despesa(tenant_id,id,competencia,filial,categoria,descricao,valor,data,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tid, id, mes, filial, categoria, descricao, valor, data, quem(user)]);
  return { id };
}
async function apagarDespesa(tid, user, b) {
  const r = await db.query('delete from dre_despesa where tenant_id=$1 and id=$2 returning descricao, valor, competencia', [tid, String(b.id || '')]);
  if (!r.rows.length) throw httpErr(404, 'Despesa não encontrada. Atualize a tela.');
  return { descricao: r.rows[0].descricao, valor: Number(r.rows[0].valor), mes: r.rows[0].competencia };
}

/* ---------- rotas: /api/caixa/dre... (chamado pelo lib/caixa.js, depois do login) ---------- */
async function handle(ctx) {
  const { path, method, user, tid, query, body, audit } = ctx;
  if (!pode(user)) throw httpErr(403, 'Só o administrador abre o DRE.');
  if (path === '/api/caixa/dre' && method === 'GET') return state(tid, mesOf(query && query.get('mes')));
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = (await body()) || {};
  let out;
  switch (path) {
    case '/api/caixa/dre/resultado': out = await salvarResultado(tid, user, b); await audit('dre_resultado', { mes: out.mes, filiais: out.filiais, fonte: b.fonte || 'digitado' }); break;
    case '/api/caixa/dre/fixa': out = await salvarFixa(tid, user, b); await audit('dre_fixa', { id: out.id, categoria: b.categoria, valor: b.valor }); break;
    case '/api/caixa/dre/fixa/mes': out = await fixaNoMes(tid, user, b); await audit('dre_fixa_mes', { id: out.id, mes: b.mes, valor: b.valor }); break;
    case '/api/caixa/dre/fixa/encerrar': out = await encerrarFixa(tid, user, b); await audit('dre_fixa_encerrada', { id: b.id, mes: b.mes }); break;
    case '/api/caixa/dre/despesa': out = await salvarDespesa(tid, user, b); await audit('dre_despesa', { id: out.id, mes: b.mes, categoria: b.categoria, valor: b.valor }); break;
    case '/api/caixa/dre/tg/ligar': out = await telegram.ligar(tid, user, b); await audit('dre_tg_ligado', { bot: out.bot }); break;
    case '/api/caixa/dre/tg/desligar': out = await telegram.desligar(tid); await audit('dre_tg_desligado', {}); break;
    case '/api/caixa/dre/tg/pessoa': out = await telegram.pessoa(tid, b); await audit('dre_tg_pessoa', { id: b.id, liberado: b.liberado === true, filial: b.filial, remover: b.remover === true }); break;
    case '/api/caixa/dre/aprovar': out = await telegram.aprovar(tid, user, b); await audit(b.ok === false ? 'dre_despesa_recusada' : 'dre_despesa_aprovada', { ids: b.ids || [b.id], feitas: out.feitas }); break;
    case '/api/caixa/dre/despesa/excluir': out = await apagarDespesa(tid, user, b); await audit('dre_despesa_excluida', Object.assign({ id: b.id }, out)); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, pode, CATS, ABAIXO, conta };

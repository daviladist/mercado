'use strict';
/*
 * Tino Controle de caixa (ramo 'caixa') — app interno, de uso próprio (Dávila Supermercados): o dinheiro das
 * lojas (filiais) converge fisicamente numa matriz, onde é conferido e, aos poucos, depositado no banco.
 *
 * Saldo esperado em caixa = saldo inicial (contagem física do dia em que começou a usar isto)
 *   + vendas em dinheiro de todas as filiais, no período (StarIA; já veio da sacola conferida no PDV)
 *   + recebimento de crediário em dinheiro de todas as filiais, no período (StarIA), MAS só depois de aprovado
 *   − sangrias (dinheiro que saiu do caixa para ir ao banco; pode ficar guardado alguns dias até o depósito)
 *   + ajustes (correção manual, só o admin; valor pode ser negativo)
 * O fundo de caixa fixo de cada loja (troco) não entra aqui: ele não se move, fica sempre lá.
 *
 * Por que o crediário precisa de aprovação e a venda não: a venda em dinheiro do PDV sempre passa pela sacola e
 * pela conferência física normal da matriz. O recebimento de crediário, não — às vezes é recebido num caixa
 * separado, direto no retaguarda, que não faz parte do fechamento/sacola do PDV. Então ele entra como
 * 'pendente' e só conta no saldo depois que alguém aprova (ou fica fora do saldo para sempre, se for rejeitado).
 *
 * As vendas/recebimentos em dinheiro não vêm de um sistema que o servidor fale direto: alguém (o Claude, pelo
 * navegador já logado do dono) consulta o StarIA e devolve o total do período (coleção caixa_jobs, como o
 * loja_staria do app da loja online). O dono revisa o número antes de aplicar.
 *
 * Papéis: 'admin' (o dono, tudo, incluindo excluir/cancelar qualquer coisa — isso é só dele); 'caixista' (guarda
 * e confere o dinheiro: lança sangria, vê o saldo e marca quando um valor foi ao banco); 'financeiro' (só
 * aprova ou rejeita o recebimento de crediário do StarIA). Nem caixista nem financeiro definem o saldo inicial,
 * lançam ajuste, pedem/aplicam consulta ao StarIA, apagam nada ou gerenciam outros acessos. Não existe custo
 * nem margem neste app.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const { hashPassword, passwordProblem } = require('./auth');

const httpErr = store.httpErr;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const MAX_VALOR = 50000000;
const uid = p => p + crypto.randomBytes(8).toString('hex');

function txt(v, max, label, required) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (required && s.length < 2) throw httpErr(400, label + ': escreva pelo menos 2 letras.');
  return s || null;
}
function dateOf(v, label, required) {
  if (v == null || v === '') { if (required) throw httpErr(400, (label || 'Data') + ': informe a data.'); return null; }
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1990 || d.getTime() > Date.now() + 2 * 864e5) throw httpErr(400, (label || 'Data') + ' inválida.');
  return s;
}
function valorOf(v, label, { signed = false } = {}) {
  if (v === '' || v == null) throw httpErr(400, label + ': informe o valor.');
  let t = String(v).trim();
  if (typeof v !== 'number' && !/^-?(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+)$/.test(t)) throw httpErr(400, label + ' inválido.');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = typeof v === 'number' ? v : Number(t);
  if (!isFinite(n) || Math.abs(n) > MAX_VALOR) throw httpErr(400, label + ' inválido.');
  if (!signed && !(n > 0)) throw httpErr(400, label + ': informe um valor maior que zero.');
  if (signed && n === 0) throw httpErr(400, label + ': informe um valor diferente de zero.');
  return r2(n);
}
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function need(role, roles, msg) { if (!roles.includes(role)) throw httpErr(403, msg || 'Função não disponível para o seu acesso.'); }

/* ---------- leitura ---------- */
const movOut = m => ({
  id: m.id, tipo: m.tipo, valor: Number(m.valor), data: m.data, periodoIni: m.periodo_ini, periodoFim: m.periodo_fim,
  detalhe: m.detalhe || {}, motivo: m.motivo, status: m.status, decididoPor: m.decidido_por, depositadoEm: m.depositado_em,
  criadoPor: m.criado_por, criadoPorRole: m.criado_por_role, criadoEm: m.created_at
});
const jobOut = j => ({ id: j.id, periodoIni: j.periodo_ini, periodoFim: j.periodo_fim, status: j.status, resultado: j.resultado || null, criadoPor: j.criado_por, criadoEm: j.created_at, prontoEm: j.pronto_em });

async function state(tid) {
  const [cfgR, movR, jobR] = await Promise.all([
    db.query('select * from caixa_cfg where tenant_id=$1', [tid]),
    db.query('select * from caixa_mov where tenant_id=$1 order by data desc, created_at desc limit 500', [tid]),
    db.query(`select * from caixa_jobs where tenant_id=$1 order by created_at desc limit 50`, [tid])
  ]);
  const cfg = cfgR.rows[0] || null;
  const saldoInicial = cfg ? Number(cfg.saldo_inicial) : 0;
  // saldo de TODOS os lançamentos (não só os últimos 500 mostrados), para não desviar com o tempo.
  // crediário do StarIA só entra quando aprovado (pendente/rejeitado não contam: pode ter sido recebido
  // num caixa separado, no retaguarda, que não passou pela conferência normal do PDV).
  const somaR = await db.query(`select coalesce(sum(case
      when tipo='sangria' then -valor
      when tipo='crediario_staria' and status is distinct from 'aprovado' then 0
      else valor end),0) as soma
    from caixa_mov where tenant_id=$1`, [tid]);
  const saldo = r2(saldoInicial + Number(somaR.rows[0].soma));
  return {
    cfg: cfg ? { saldoInicial, dataInicial: cfg.data_inicial } : null,
    saldo,
    mov: movR.rows.map(movOut),
    jobs: jobR.rows.map(jobOut)
  };
}

/* ---------- config (saldo inicial): só o admin, uma vez (dá para corrigir depois, também só o admin) ---------- */
async function saveCfg(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador define o saldo inicial.');
  const saldoInicial = valorOf(b.saldoInicial === '' || b.saldoInicial == null ? 0 : b.saldoInicial, 'Saldo inicial', { signed: true });
  if (saldoInicial < 0) throw httpErr(400, 'Saldo inicial: não pode ser negativo.');
  const dataInicial = dateOf(b.dataInicial, 'Data inicial', true);
  await db.query(`insert into caixa_cfg(tenant_id,saldo_inicial,data_inicial) values($1,$2,$3)
    on conflict(tenant_id) do update set saldo_inicial=excluded.saldo_inicial, data_inicial=excluded.data_inicial, updated_at=now()`, [tid, saldoInicial, dataInicial]);
  return { ok: true };
}

/* ---------- lançamentos: sangria (admin e caixista) e ajuste (só admin) ---------- */
async function saveSangria(tid, user, b) {
  need(user.role, ['admin', 'caixista'], 'Função não disponível para o seu acesso.');
  const valor = valorOf(b.valor, 'Valor da sangria');
  const data = dateOf(b.data, 'Data', true);
  const motivo = txt(b.motivo, 300, 'Motivo', true);
  const id = uid('m');
  await db.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,motivo,criado_por,criado_por_role) values($1,$2,'sangria',$3,$4,$5,$6,$7)`,
    [tid, id, valor, data, motivo, user.name || user.login, user.role]);
  return { id };
}
async function saveAjuste(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador lança ajuste.');
  const valor = valorOf(b.valor, 'Valor do ajuste', { signed: true });
  const data = dateOf(b.data, 'Data', true);
  const motivo = txt(b.motivo, 300, 'Motivo', true);
  const id = uid('m');
  await db.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,motivo,criado_por,criado_por_role) values($1,$2,'ajuste',$3,$4,$5,$6,$7)`,
    [tid, id, valor, data, motivo, user.name || user.login, user.role]);
  return { id };
}
/* marca (ou desmarca) quando uma sangria de fato chegou ao banco: não muda o saldo (ela já tinha saído do caixa) */
async function marcarDepositado(tid, user, b) {
  need(user.role, ['admin', 'caixista'], 'Função não disponível para o seu acesso.');
  const id = String(b.id || '');
  const r = await db.query(`select tipo from caixa_mov where tenant_id=$1 and id=$2`, [tid, id]);
  if (!r.rows[0]) throw httpErr(404, 'Lançamento não encontrado.');
  if (r.rows[0].tipo !== 'sangria') throw httpErr(400, 'Só uma sangria pode ser marcada como depositada.');
  const data = b.depositadoEm === null || b.depositadoEm === '' ? null : dateOf(b.depositadoEm, 'Data do depósito', true);
  await db.query(`update caixa_mov set depositado_em=$3 where tenant_id=$1 and id=$2`, [tid, id, data]);
  return { ok: true };
}
/* apaga sangria ou ajuste (nunca uma venda_staria: ela é o retrato do que o StarIA informou, fica sempre) */
async function delMov(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador apaga um lançamento.');
  const id = String((b && b.id) || '');
  const r = await db.query(`delete from caixa_mov where tenant_id=$1 and id=$2 and tipo in ('sangria','ajuste') returning id`, [tid, id]);
  if (!r.rows[0]) throw httpErr(404, 'Lançamento não encontrado (ou não pode ser apagado).');
  return { ok: true };
}

/* ---------- consulta ao StarIA: vendas em dinheiro + crediário em dinheiro, por filial, no período ----------
   pendente -> (Claude, pelo navegador do dono) pronta, com o resultado -> (dono revisa e aplica) aplicada: cria o lançamento. */
async function pedirConsulta(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador pede a consulta ao StarIA.');
  const periodoIni = dateOf(b.periodoIni, 'Data inicial', true);
  const periodoFim = dateOf(b.periodoFim, 'Data final', true);
  if (periodoFim < periodoIni) throw httpErr(400, 'A data final não pode ser antes da inicial.');
  if (periodoFim > hoje()) throw httpErr(400, 'A data final não pode ser no futuro.');
  const dup = await db.query(`select id from caixa_jobs where tenant_id=$1 and status<>'aplicada' and periodo_ini=$2 and periodo_fim=$3`, [tid, periodoIni, periodoFim]);
  if (dup.rows[0]) throw httpErr(409, 'Já existe uma consulta para este período, aguardando o Claude ou a sua revisão.');
  const id = uid('j');
  await db.query(`insert into caixa_jobs(tenant_id,id,periodo_ini,periodo_fim,criado_por) values($1,$2,$3,$4,$5)`, [tid, id, periodoIni, periodoFim, user.name || user.login]);
  return { id };
}
/* o Claude devolve o resultado (pelo navegador do dono, já logado): totais em dinheiro, por filial e geral */
function resultadoOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw httpErr(400, 'Resultado inválido.');
  const porFilial = {};
  const pf = r.porFilial && typeof r.porFilial === 'object' && !Array.isArray(r.porFilial) ? r.porFilial : {};
  for (const [k, v] of Object.entries(pf)) {
    if (!/^\d+$/.test(String(k))) throw httpErr(400, 'Filial inválida: ' + k);
    if (!v || typeof v !== 'object') throw httpErr(400, 'Resultado da filial ' + k + ' inválido.');
    const vendas = Number(v.vendasDinheiro) || 0, crediario = Number(v.recebCrediarioDinheiro) || 0;
    if (vendas < 0 || crediario < 0) throw httpErr(400, 'Resultado da filial ' + k + ' inválido (negativo).');
    porFilial[k] = { vendasDinheiro: r2(vendas), recebCrediarioDinheiro: r2(crediario) };
  }
  if (!Object.keys(porFilial).length) throw httpErr(400, 'Resultado sem nenhuma filial.');
  const total = r2(Object.values(porFilial).reduce((a, x) => a + x.vendasDinheiro + x.recebCrediarioDinheiro, 0));
  if (total > MAX_VALOR) throw httpErr(400, 'Total grande demais. Confira o período.');
  return { porFilial, total };
}
async function entregarResultado(tid, b) {
  const id = String((b && b.id) || '');
  const r = await db.query(`select * from caixa_jobs where tenant_id=$1 and id=$2`, [tid, id]);
  if (!r.rows[0]) throw httpErr(404, 'Consulta não encontrada.');
  if (r.rows[0].status !== 'pendente') throw httpErr(409, 'Esta consulta já tem resultado.');
  const resultado = resultadoOf(b.resultado);
  await db.query(`update caixa_jobs set status='pronta', resultado=$3::jsonb, pronto_em=now() where tenant_id=$1 and id=$2`, [tid, id, JSON.stringify(resultado)]);
  return { ok: true };
}
/* dono revisa o número devolvido e aplica: as vendas em dinheiro entram direto (já vieram da sacola conferida);
   o recebimento de crediário entra como pendente, porque às vezes é recebido num caixa separado, no retaguarda,
   que não passa pela conferência normal do PDV — só conta no saldo depois que alguém aprovar. Nenhum dos dois
   lançamentos se edita ou se exclui depois: só o crediário pode mudar de status (aprovar/rejeitar). */
async function aplicarResultado(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador aplica o resultado do StarIA.');
  const id = String((b && b.id) || '');
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_jobs where tenant_id=$1 and id=$2 for update`, [tid, id]);
    const job = r.rows[0];
    if (!job) throw httpErr(404, 'Consulta não encontrada.');
    if (job.status === 'aplicada') throw httpErr(409, 'Este resultado já foi aplicado ao caixa.');
    if (job.status !== 'pronta') throw httpErr(409, 'Esta consulta ainda não tem resultado do StarIA.');
    const filiais = Object.values(job.resultado.porFilial);
    const totalVendas = r2(filiais.reduce((a, x) => a + x.vendasDinheiro, 0));
    const totalCredi = r2(filiais.reduce((a, x) => a + x.recebCrediarioDinheiro, 0));
    const movIds = {};
    if (totalVendas > 0) {
      movIds.venda = uid('m');
      await t.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,periodo_ini,periodo_fim,detalhe,criado_por,criado_por_role) values($1,$2,'venda_staria',$3,$4,$5,$6,$7::jsonb,$8,'admin')`,
        [tid, movIds.venda, totalVendas, job.periodo_fim, job.periodo_ini, job.periodo_fim, JSON.stringify(job.resultado), user.name || user.login]);
    }
    if (totalCredi > 0) {
      movIds.crediario = uid('m');
      await t.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,periodo_ini,periodo_fim,detalhe,status,criado_por,criado_por_role) values($1,$2,'crediario_staria',$3,$4,$5,$6,$7::jsonb,'pendente',$8,'admin')`,
        [tid, movIds.crediario, totalCredi, job.periodo_fim, job.periodo_ini, job.periodo_fim, JSON.stringify(job.resultado), user.name || user.login]);
    }
    await t.query(`update caixa_jobs set status='aplicada' where tenant_id=$1 and id=$2`, [tid, id]);
    return { ok: true, movIds };
  });
}
/* admin ou financeiro aprova/rejeita o recebimento de crediário; o financeiro só decide uma vez (pendente),
   o admin pode corrigir depois (é o único que também pode excluir/cancelar qualquer coisa no sisteminha) */
async function decidirCrediario(tid, user, b) {
  need(user.role, ['admin', 'financeiro'], 'Função não disponível para o seu acesso.');
  const id = String((b && b.id) || '');
  const acao = String((b && b.acao) || '');
  if (!['aprovar', 'rejeitar'].includes(acao)) throw httpErr(400, 'Ação inválida.');
  const r = await db.query(`select tipo, status from caixa_mov where tenant_id=$1 and id=$2`, [tid, id]);
  if (!r.rows[0] || r.rows[0].tipo !== 'crediario_staria') throw httpErr(404, 'Lançamento não encontrado (ou não é um recebimento de crediário).');
  if (user.role === 'financeiro' && r.rows[0].status !== 'pendente') throw httpErr(409, 'Esta pendência já foi decidida.');
  const status = acao === 'aprovar' ? 'aprovado' : 'rejeitado';
  await db.query(`update caixa_mov set status=$3, decidido_por=$4 where tenant_id=$1 and id=$2`, [tid, id, status, user.name || user.login]);
  return { ok: true, status };
}

/* ---------- cadastro das pessoas com acesso (papéis 'caixista' e 'financeiro'): o admin cria/gerencia por dentro do próprio app.
   'caixista' guarda o dinheiro e lança sangria; 'financeiro' só aprova/rejeita o recebimento de crediário. Nenhum dos dois
   exclui ou cancela nada: isso é só pelo usuário do admin. */
const PAPEIS = ['caixista', 'financeiro'];
async function pessoas(tid) {
  const r = await db.query(`select login, name, role, active, must_reset from users_t where tenant_id=$1 and role in ('caixista','financeiro') order by role, name`, [tid]);
  return r.rows.map(u => ({ login: u.login, nome: u.name, papel: u.role, ativo: u.active, trocarSenha: u.must_reset }));
}
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPass() { const b = crypto.randomBytes(16); let p = ''; for (let i = 0; i < 12; i++) p += ABC[b[i] % ABC.length]; return p.slice(0, 4) + '-' + p.slice(4, 8) + '-' + p.slice(8); }
async function savePessoa(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador cria ou altera este acesso.');
  const login = String(b.login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw httpErr(400, 'Usuário: use de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).');
  const nome = txt(b.nome, 80, 'Nome', true);
  const cur = (await db.query(`select ref_id, role from users_t where tenant_id=$1 and role in ('caixista','financeiro') and login=$2`, [tid, login])).rows[0];
  const papel = cur ? cur.role : (b.papel === 'financeiro' ? 'financeiro' : 'caixista'); // tela antiga sem o campo: continua criando caixista
  if (!PAPEIS.includes(papel)) throw httpErr(400, 'Papel inválido.');
  const clash = await db.query(`select 1 from users_t where tenant_id=$1 and login=$2 and not (role in ('caixista','financeiro') and login=$2)`, [tid, login]);
  if (clash.rows.length) throw httpErr(400, `O usuário "${login}" já é usado por outra pessoa. Escolha outro.`);
  const refId = cur ? cur.ref_id : uid(papel === 'financeiro' ? 'f' : 'c');
  const ativo = b.ativo !== false;
  let pass = null, novaSenha = null;
  if (!cur || b.novaSenha === true) { novaSenha = tempPass(); pass = await hashPassword(novaSenha); }
  await db.query(`insert into users_t(tenant_id,role,login,ref_id,name,pass_hash,must_reset,active) values($1,$2,$3,$4,$5,$6,true,$7)
    on conflict(tenant_id,role,ref_id) do update set login=excluded.login, name=excluded.name, active=excluded.active,
      pass_hash=coalesce($6,users_t.pass_hash), must_reset=case when $6 is null then users_t.must_reset else true end, updated_at=now()`,
  [tid, papel, login, refId, nome, pass, ativo]);
  if (novaSenha || !ativo) await db.query(`delete from sessions where user_id in (select id from users_t where tenant_id=$1 and role=$2 and ref_id=$3)`, [tid, papel, refId]);
  return { login, nome, papel, password: novaSenha };
}

/* ---------- rotas /api/caixa/* ---------- */
async function handle(ctx) {
  const { path, method, user, tid, user: { role }, body, audit } = ctx;
  if (!['admin', 'caixista', 'financeiro'].includes(role)) throw httpErr(403, 'Só o administrador ou quem tem acesso a este caixa.');
  if (path === '/api/caixa/state' && method === 'GET') {
    const st = await state(tid);
    const pess = role === 'admin' ? await pessoas(tid) : [];
    return Object.assign({ me: { nome: user.name || user.login, login: user.login, role }, pessoas: pess }, st);
  }
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = await body();
  let out;
  switch (path) {
    case '/api/caixa/cfg': out = await saveCfg(tid, user, b); await audit('caixa_cfg', { saldoInicial: b.saldoInicial }); break;
    case '/api/caixa/sangria': out = await saveSangria(tid, user, b); await audit('caixa_sangria', { id: out.id, valor: b.valor }); break;
    case '/api/caixa/ajuste': out = await saveAjuste(tid, user, b); await audit('caixa_ajuste', { id: out.id, valor: b.valor }); break;
    case '/api/caixa/depositado': out = await marcarDepositado(tid, user, b); await audit('caixa_depositado', { id: b.id }); break;
    case '/api/caixa/mov/excluir': out = await delMov(tid, user, b); await audit('caixa_mov_excluido', { id: b.id }); break;
    case '/api/caixa/staria/pedir': out = await pedirConsulta(tid, user, b); await audit('caixa_staria_pedir', { id: out.id, periodo: [b.periodoIni, b.periodoFim] }); break;
    case '/api/caixa/staria/resultado':
      if (role !== 'admin') throw httpErr(403, 'Só o administrador.');
      out = await entregarResultado(tid, b); await audit('caixa_staria_resultado', { id: b.id }); break;
    case '/api/caixa/staria/aplicar': out = await aplicarResultado(tid, user, b); await audit('caixa_staria_aplicar', { id: b.id }); break;
    case '/api/caixa/crediario/decidir': out = await decidirCrediario(tid, user, b); await audit('caixa_crediario_decidir', { id: b.id, acao: b.acao }); break;
    case '/api/caixa/pessoa': out = await savePessoa(tid, user, b); await audit('caixa_pessoa', { login: out.login, papel: out.papel }); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, state, saveCfg, saveSangria, saveAjuste, marcarDepositado, delMov, pedirConsulta, entregarResultado, aplicarResultado, decidirCrediario, pessoas, savePessoa };

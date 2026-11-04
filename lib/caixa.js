'use strict';
/*
 * Tino Controle de caixa (ramo 'caixa') — app interno, de uso próprio (Dávila Supermercados): o dinheiro das
 * lojas (filiais) converge fisicamente numa matriz, onde é conferido e, aos poucos, depositado no banco.
 *
 * Saldo esperado em caixa (principal) = saldo inicial (contagem física do dia em que começou a usar isto)
 *   + vendas em dinheiro de todas as filiais, no período (StarIA; valor REAL contado na conferência da sacola)
 *   + recebimento de crediário em dinheiro de todas as filiais, no período (StarIA; valor REAL contado também,
 *     decidido pelo financeiro na mesma conferência — ver abaixo)
 *   − sangrias (dinheiro que saiu do caixa principal, com qualquer destino: para o dono ou para a gaveta de impostos)
 *   + ajustes (correção manual, só o admin; valor pode ser negativo)
 * O fundo de caixa fixo de cada loja (troco) não entra aqui: ele não se move, fica sempre lá.
 * Também existe um relatório por filial (quanto cada uma trouxe de venda/crediário), só um relatório: o dinheiro
 * físico continua todo consolidado na matriz, não existe saldo separado por filial.
 *
 * Sacola (venda + crediário por filial): o StarIA só sabe o que foi vendido e recebido de crediário — não sabe se
 * o dinheiro já chegou na matriz, nem quanto do crediário foi em dinheiro, cartão ou Pix. Por isso, cada filial
 * com venda e/ou crediário no período vira uma "sacola", que fica "na filial" até alguém (caixista ou financeiro)
 * marcar que chegou na matriz; só aí o financeiro confere o valor REAL de vendas e decide a forma de pagamento do
 * crediário recebido — só o dinheiro (de vendas e de crediário) entra no saldo, num clique só, já como decisão
 * final. A filial 1 (matriz) nunca "viaja": sua sacola já nasce pronta pra conferência, sem o passo de chegada.
 * Qualquer diferença (de vendas ou de crediário) vira ocorrência; a conferência nunca se edita — se um dia achar
 * diferença depois, o admin corrige com um ajuste.
 *
 * Gaveta de impostos e financiamentos: um segundo saldo (caixa='impostos'), separado do saldo principal, para a
 * retirada diária que o dono faz e guarda à parte para pagar imposto/parcela depois. Uma sangria do caixa
 * principal com destino='impostos' alimenta a gaveta (cria, na mesma operação, um 'gaveta_entrada' ligado por
 * par_id) — só o admin faz esse tipo de sangria. 'gaveta_saida' é o admin de fato usando esse dinheiro para
 * pagar algo; só afeta o saldo da gaveta. Só o admin vê, lança e exclui qualquer coisa da gaveta — caixista e
 * financeiro nem sabem que ela existe.
 *
 * As vendas/recebimentos em dinheiro não vêm de um sistema que o servidor fale direto: alguém (o Claude, pelo
 * navegador já logado do dono) consulta o StarIA e devolve o resultado (coleção caixa_jobs, como o loja_staria do
 * app da loja online). Formato atual: uma linha por caixa (ECF) por dia, só o dinheiro (tabela caixa_linha) — igual
 * à tela "Fechamento de Caixa (PDV)" do StarIA. O StarIA não diz se aquele caixa já foi conferido lá (linha preta)
 * ou não (vermelha); por isso o financeiro (ou o admin) marca, no app, os que já estão pretos, e só esses viram
 * sacola. O crediário recebido não vem do StarIA: o financeiro informa na conferência da sacola.
 *
 * Papéis: 'admin' (o dono, tudo, incluindo excluir/cancelar qualquer coisa — isso é só dele, e só ele lida com a
 * gaveta de impostos); 'caixista' (guarda o dinheiro, lança sangria normal, vê o saldo, marca quando um valor foi
 * ao banco, confere o caixa físico e também pode marcar a chegada de uma sacola na matriz); 'financeiro' (faz tudo
 * que o caixista faz, e também confere as sacolas: valor real de vendas + forma de pagamento do crediário — por
 * isso não é obrigatório ter as duas pessoas: uma só, como financeiro, pode cobrir o dia a dia inteiro, com o
 * admin cuidando do resto). Nem caixista nem financeiro definem o saldo inicial, lançam ajuste, pedem/aplicam
 * consulta ao StarIA, apagam nada, mexem na gaveta de impostos ou gerenciam outros acessos. Não existe custo nem
 * margem neste app.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const auth = require('./auth');
const { hashPassword, passwordProblem } = auth;

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
// destino/parId só vazam pra quem pode ver a gaveta (admin): pra caixista/financeiro, uma sangria destino='impostos'
// aparece como uma sangria comum — senão ela saberia que a gaveta existe, o que a regra proíbe.
const movOut = (m, role) => Object.assign({
  id: m.id, caixa: m.caixa, tipo: m.tipo, valor: Number(m.valor), data: m.data, periodoIni: m.periodo_ini, periodoFim: m.periodo_fim,
  detalhe: m.detalhe || {}, motivo: m.motivo, status: m.status, decididoPor: m.decidido_por, depositadoEm: m.depositado_em,
  criadoPor: m.criado_por, criadoPorRole: m.criado_por_role, criadoEm: m.created_at
}, role === 'admin' ? { destino: m.destino, parId: m.par_id } : {});
const jobOut = j => ({ id: j.id, periodoIni: j.periodo_ini, periodoFim: j.periodo_fim, status: j.status, resultado: j.resultado || null, criadoPor: j.criado_por, criadoEm: j.created_at, prontoEm: j.pronto_em });

/* quanto cada filial trouxe de venda/crediário aprovado, somando o detalhe.porFilial de todo venda_staria e
   crediario_staria (aprovado) já lançado — é só um relatório, o saldo físico é um só, consolidado. */
function porFilialDe(movRows) {
  // atenção: ao aplicar um resultado do StarIA, tanto o lançamento de venda_staria quanto o de crediario_staria
  // (quando os dois existem) guardam uma CÓPIA do mesmo detalhe.porFilial completo (vendas e crediário, de todas
  // as filiais) — não cada um a sua parte. Por isso cada linha só soma o campo que ela representa: venda_staria
  // soma só vendasDinheiro, crediario_staria (aprovado) soma só recebCrediarioDinheiro, nunca os dois pela mesma linha.
  const porFilial = {};
  for (const m of movRows) {
    if (m.caixa !== 'principal') continue;
    if (m.tipo !== 'venda_staria' && m.tipo !== 'crediario_staria') continue;
    if (m.tipo === 'crediario_staria' && m.status !== 'aprovado') continue;
    const pf = (m.detalhe && m.detalhe.porFilial) || {};
    for (const [k, v] of Object.entries(pf)) {
      const f = porFilial[k] || (porFilial[k] = { vendas: 0, crediario: 0 });
      if (m.tipo === 'venda_staria') f.vendas = r2(f.vendas + (Number(v.vendasDinheiro) || 0));
      else f.crediario = r2(f.crediario + (Number(v.recebCrediarioDinheiro) || 0));
    }
  }
  return porFilial;
}

/* saldo esperado do caixa principal agora (mesma conta usada em state()); aceita um client de transação opcional,
   para a conferência ler um valor consistente mesmo com lançamentos acontecendo ao mesmo tempo. */
async function saldoPrincipalAtual(tid, client) {
  const q = client ? client.query.bind(client) : db.query;
  const [cfgR, somaR] = await Promise.all([
    q('select saldo_inicial from caixa_cfg where tenant_id=$1', [tid]),
    q(`select coalesce(sum(case
        when tipo in ('sangria','gaveta_saida') then -valor
        when tipo='crediario_staria' and status is distinct from 'aprovado' then 0
        else valor end),0) as soma
      from caixa_mov where tenant_id=$1 and caixa='principal'`, [tid])
  ]);
  const saldoInicial = cfgR.rows[0] ? Number(cfgR.rows[0].saldo_inicial) : 0;
  return r2(saldoInicial + Number(somaR.rows[0].soma));
}

async function state(tid, role, user) {
  const [cfgR, movR, jobR, pfR, sacRows] = await Promise.all([
    db.query('select * from caixa_cfg where tenant_id=$1', [tid]),
    db.query('select * from caixa_mov where tenant_id=$1 order by data desc, created_at desc limit 500', [tid]),
    db.query(`select * from caixa_jobs where tenant_id=$1 order by created_at desc limit 50`, [tid]),
    // relatório por filial: de TODOS os venda_staria/crediario_staria (não só os últimos 500 do extrato acima),
    // senão some com filiais antigas conforme o tenant acumula lançamentos
    db.query(`select tipo, status, detalhe from caixa_mov where tenant_id=$1 and caixa='principal' and tipo in ('venda_staria','crediario_staria')`, [tid]),
    db.query(`select * from caixa_sacola where tenant_id=$1 order by conferido_em is null desc, created_at desc limit 300`, [tid]).then(r => r.rows)
  ]);
  // caixas do StarIA: os pendentes (esperando alguém marcar que já estão conferidos) e os que estão dentro das
  // sacolas mostradas (para cada sacola dizer de quais caixas/dias veio o dinheiro)
  const linR = await db.query(`select * from caixa_linha where tenant_id=$1 and (status='pendente'
      or sacola_id in (select id from caixa_sacola where tenant_id=$1 order by conferido_em is null desc, created_at desc limit 300))
    order by data desc, filial, ecf limit 4000`, [tid]);
  const caixasPorSacola = {};
  for (const l of linR.rows) if (l.sacola_id) (caixasPorSacola[l.sacola_id] = caixasPorSacola[l.sacola_id] || []).push(linhaOut(l));
  // recebimentos de crediário: tudo que ainda pede alguma ação (sem forma, dinheiro não contado, Pix/cartão que o
  // dono não conferiu ou não achou no banco) e o resto dos últimos 30 dias, para consulta
  const crediR = await db.query(`select * from caixa_credi where tenant_id=$1 and (forma is null or (forma='dinheiro' and sacola_id is null)
      or (forma<>'dinheiro' and (banco is null or banco='nao_achei')) or data >= current_date - 30)
    order by data desc, filial, cliente limit 3000`, [tid]);
  const cfg = cfgR.rows[0] || null;
  const saldoInicial = cfg ? Number(cfg.saldo_inicial) : 0;
  // saldo de TODOS os lançamentos (não só os últimos 500 mostrados), para não desviar com o tempo.
  // crediário do StarIA só entra quando aprovado (pendente/rejeitado não contam: pode ter sido recebido
  // num caixa separado, no retaguarda, que não passou pela conferência normal do PDV).
  const somaR = await db.query(`select caixa, coalesce(sum(case
      when tipo in ('sangria','gaveta_saida') then -valor
      when tipo='crediario_staria' and status is distinct from 'aprovado' then 0
      else valor end),0) as soma
    from caixa_mov where tenant_id=$1 group by caixa`, [tid]);
  const somaPorCaixa = { principal: 0, impostos: 0 };
  for (const row of somaR.rows) somaPorCaixa[row.caixa] = Number(row.soma);
  const saldo = r2(saldoInicial + somaPorCaixa.principal);
  const movsTodos = movR.rows.map(m => movOut(m, role));
  // mini caixa por filial: só informativo (não editável) — o que o StarIA apontou e ainda não foi conferido,
  // separado entre "ainda na filial" (sacola nem chegou) e "chegou, aguardando o financeiro conferir". Esse
  // dinheiro NÃO está no saldo principal: só entra depois da conferência, com o valor realmente contado.
  const miniCaixas = {};
  for (const s of sacRows) {
    if (s.conferido_em) continue;
    const mc = miniCaixas[s.filial] || (miniCaixas[s.filial] = { naFilial: 0, aguardandoConferencia: 0 });
    const total = r2(Number(s.valor_staria) + (Number(s.credi_staria) || 0));
    if (s.chegou_em) mc.aguardandoConferencia = r2(mc.aguardandoConferencia + total);
    else mc.naFilial = r2(mc.naFilial + total);
  }
  const out = {
    cfg: cfg ? { saldoInicial, dataInicial: cfg.data_inicial } : null,
    saldo,
    porFilial: porFilialDe(pfR.rows.map(m => ({ tipo: m.tipo, status: m.status, detalhe: m.detalhe, caixa: 'principal' }))),
    mov: movsTodos.filter(m => m.caixa === 'principal'),
    jobs: jobR.rows.map(jobOut),
    sacolas: sacRows.map(s => Object.assign(sacolaOut(s), { caixas: caixasPorSacola[s.id] || [] })),
    miniCaixas
  };
  // só quem marca os caixas conferidos vê a lista de pendentes (caixista não decide isso)
  if (role === 'admin' || role === 'financeiro') {
    out.caixasPendentes = linR.rows.filter(l => l.status === 'pendente').map(linhaOut);
    out.crediarios = crediR.rows.map(c => crediOut(c, role));
  }
  // gaveta de impostos: assunto só do dono, nem o saldo nem os lançamentos dela aparecem para caixista/financeiro
  if (role === 'admin') {
    out.saldoImpostos = r2(somaPorCaixa.impostos);
    out.movImpostos = movsTodos.filter(m => m.caixa === 'impostos');
  }
  const extra = await sinais(tid, { saldo, saldoImpostos: r2(somaPorCaixa.impostos), sacRows, linR: linR.rows, movRows: movR.rows, cfg, crediRows: crediR.rows });
  if (role === 'admin') { out.resumo = extra.resumo; return out; }
  return paraEquipe(out, user, extra.pendencias);
}

/* ---------- "quanto eu tenho agora e está tudo certo?" (só o dono) e as pendências da equipe ----------
   Tudo calculado aqui, com o que o app já tem — nada de consulta nova ao StarIA. Limites de alerta: */
const ALERTA = {
  cofreHoras: [24, 48],          // sem contar o cofre: amarelo, vermelho
  difVermelho: 20,               // R$: diferença a partir disso é vermelho
  sacolaNaoChegouH: [24, 48],
  sacolaSemContarH: [12, 24],
  caixaPendenteDias: 2,          // caixa do StarIA esperando ser marcado (ainda vermelho lá) há mais que isso
  sangriaSemBancoDias: [3, 7],
  faltaRepetida: 3,              // faltas da mesma filial em 30 dias
  donoSemContarDias: 7,
  stariaHoras: 30
};
const fmtR = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBRs = d => { const s = String(d || '').slice(0, 10); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''; };
const nivelPor = (v, [am, ver]) => v >= ver ? 'vermelho' : v >= am ? 'amarelo' : null;
const plural2 = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
async function sinais(tid, { saldo, saldoImpostos, sacRows, linR, movRows, cfg, crediRows }) {
  const desdeZerar = `coalesce((select max(at) from audit where tenant_id=$1 and action='caixa_zerado'), '-infinity'::timestamptz)`;
  const [confR, confAdmR, bancoR, jobR, linMaxR, mexR, idadeR] = await Promise.all([
    db.query(`select *, extract(epoch from now()-created_at)/3600 as horas from caixa_conferencia where tenant_id=$1 order by created_at desc limit 1`, [tid]),
    db.query(`select extract(epoch from now()-created_at)/86400 as dias from caixa_conferencia where tenant_id=$1 and criado_por_role='admin' order by created_at desc limit 1`, [tid]),
    db.query(`select count(*)::int as n, coalesce(sum(valor),0) as total, min(data) as desde from caixa_mov
      where tenant_id=$1 and caixa='principal' and tipo='sangria' and destino is null and depositado_em is null and criado_por_role<>'admin'`, [tid]),
    db.query(`select extract(epoch from now()-max(pronto_em))/3600 as horas from caixa_jobs where tenant_id=$1 and status='aplicada'`, [tid]),
    db.query(`select max(data) as ate from caixa_linha where tenant_id=$1`, [tid]),
    db.query(`select count(*)::int as n from audit where tenant_id=$1 and action in ('caixa_ajuste','caixa_mov_excluido') and at > now()-interval '7 days' and at >= ${desdeZerar}`, [tid]),
    db.query(`select id, extract(epoch from now()-created_at)/3600 as h_criada, extract(epoch from now()-chegou_em)/3600 as h_chegou,
        extract(epoch from now()-conferido_em)/86400 as d_conferida from caixa_sacola where tenant_id=$1 and (conferido_em is null or conferido_em > now()-interval '30 days')`, [tid])
  ]);
  const idade = {}; for (const r of idadeR.rows) idade[r.id] = r;
  const alertas = [], pend = [];
  const add = (nivel, codigo, texto, ir, equipe) => { if (!nivel) return; alertas.push({ nivel, codigo, texto, ir }); if (equipe) pend.push({ nivel, codigo, texto: equipe, ir }); };
  // cofre: quando foi contado pela última vez e se bateu
  const conf = confR.rows[0];
  const horasCofre = conf ? Number(conf.horas) : (cfg ? Infinity : 0);
  if (cfg) add(nivelPor(horasCofre, ALERTA.cofreHoras), 'COFRE_SEM_CONTAGEM',
    conf ? 'O cofre não é contado há ' + Math.floor(horasCofre) + ' horas.' : 'O cofre ainda não foi contado nenhuma vez.', 'contar',
    conf ? 'Contar o cofre (última contagem há ' + Math.floor(horasCofre) + ' horas).' : 'Contar o cofre pela primeira vez.');
  if (conf && Number(conf.diferenca) !== 0) {
    const ajusteDepois = movRows.some(m => m.tipo === 'ajuste' && String(m.created_at) > String(conf.created_at));
    if (!ajusteDepois) add(Math.abs(Number(conf.diferenca)) >= ALERTA.difVermelho ? 'vermelho' : 'amarelo', 'COFRE_DIFERENCA',
      'Última contagem do cofre (' + (conf.criado_por || '') + '): ' + (Number(conf.diferenca) > 0 ? 'sobrou ' : 'faltou ') + fmtR(Math.abs(Number(conf.diferenca))) + '.', 'ocorrencias');
  }
  // sacolas paradas: não chegou na matriz, ou chegou e ninguém contou
  const nasLojas = { total: 0, porFilial: {} };
  const pf = f => nasLojas.porFilial[f] || (nasLojas.porFilial[f] = { caixasSemSacola: 0, naFilial: 0, chegouFaltaContar: 0, crediario: 0 });
  const faltas = {};
  for (const s of sacRows) {
    const ida = idade[s.id] || {};
    if (!s.conferido_em) {
      const v = r2(Number(s.valor_staria) + (Number(s.credi_staria) || 0));
      if (s.chegou_em) pf(s.filial).chegouFaltaContar = r2(pf(s.filial).chegouFaltaContar + v); else pf(s.filial).naFilial = r2(pf(s.filial).naFilial + v);
      nasLojas.total = r2(nasLojas.total + v);
      if (!s.chegou_em) add(nivelPor(Number(ida.h_criada) || 0, ALERTA.sacolaNaoChegouH), 'SACOLA_NAO_CHEGOU',
        'Sacola da filial ' + s.filial + ' (' + dBRs(s.periodo_fim) + ') não chegou na matriz há ' + Math.floor((Number(ida.h_criada) || 0) / 24) + ' dia(s).', 'sacolas',
        'Sacola da filial ' + s.filial + ' (' + dBRs(s.periodo_fim) + ') ainda não chegou na matriz.');
      else add(nivelPor(Number(ida.h_chegou) || 0, ALERTA.sacolaSemContarH), 'SACOLA_SEM_CONTAR',
        'Sacola da filial ' + s.filial + ' chegou e ainda não foi contada.', 'sacolas', 'Contar a sacola da filial ' + s.filial + ' que já chegou.');
    } else if (Number(s.diferenca) < 0 && ida.d_conferida != null) {
      const f = faltas[s.filial] || (faltas[s.filial] = { n: 0, total: 0 });
      f.n++; f.total = r2(f.total + Math.abs(Number(s.diferenca)));
      if (Number(ida.d_conferida) <= 7) add(Math.abs(Number(s.diferenca)) >= ALERTA.difVermelho ? 'vermelho' : 'amarelo', 'SACOLA_FALTA',
        'Sacola da filial ' + s.filial + ' (' + dBRs(s.periodo_fim) + '): faltou ' + fmtR(Math.abs(Number(s.diferenca))) + '.', 'ocorrencias');
    }
  }
  for (const [f, x] of Object.entries(faltas)) if (x.n >= ALERTA.faltaRepetida) add('vermelho', 'FALTA_REPETIDA', 'Filial ' + f + ': faltou dinheiro em ' + x.n + ' sacolas no mês (' + fmtR(x.total) + ').', 'ocorrencias');
  // caixas do StarIA esperando ser marcados (ainda vermelhos lá)
  const pendentes = linR.filter(l => l.status === 'pendente');
  const diaLimite = new Date(Date.parse(hoje() + 'T12:00:00Z') - ALERTA.caixaPendenteDias * 864e5).toISOString().slice(0, 10);
  for (const l of pendentes) { pf(l.filial).caixasSemSacola = r2(pf(l.filial).caixasSemSacola + Number(l.dinheiro)); nasLojas.total = r2(nasLojas.total + Number(l.dinheiro)); }
  const velhos = pendentes.filter(l => String(l.data).slice(0, 10) <= diaLimite);
  if (velhos.length) {
    const ex = velhos[velhos.length - 1];
    add('amarelo', 'CAIXA_VERMELHO', velhos.length + ' caixa(s) do StarIA ainda sem conferir lá (o mais antigo: caixa ' + ex.ecf + ' da filial ' + ex.filial + ', ' + dBRs(ex.data) + ').', 'sacolas',
      velhos.length + ' caixa(s) ainda vermelhos no StarIA: conferir lá e marcar aqui.');
  }
  // crediário recebido: sem forma marcada, dinheiro ainda não contado, Pix/cartão para o dono conferir no banco
  const diaMenos = n => new Date(Date.parse(hoje() + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  const dCr = c => String(c.data).slice(0, 10);
  const somaV = arr => r2(arr.reduce((a, c) => a + Number(c.valor), 0));
  const cr = crediRows || [];
  const semForma = cr.filter(c => !c.forma && dCr(c) <= diaMenos(1));
  if (semForma.length) add('amarelo', 'CREDI_SEM_FORMA', plural2(semForma.length, 'recebimento', 'recebimentos') + ' de crediário (' + fmtR(somaV(semForma)) + ') sem a forma de pagamento marcada.', 'sacolas',
    plural2(semForma.length, 'recebimento', 'recebimentos') + ' de crediário sem a forma marcada (dinheiro, Pix ou cartão).');
  const credDin = cr.filter(c => c.forma === 'dinheiro' && !c.sacola_id);
  for (const c of credDin) { pf(c.filial).crediario = r2(pf(c.filial).crediario + Number(c.valor)); nasLojas.total = r2(nasLojas.total + Number(c.valor)); }
  const credDinVelho = credDin.filter(c => dCr(c) <= diaMenos(3));
  if (credDinVelho.length) add('amarelo', 'CREDI_DINHEIRO_PARADO', fmtR(somaV(credDinVelho)) + ' de crediário em dinheiro há mais de 3 dias e ainda não contado em nenhuma sacola.', 'sacolas');
  const paraBanco = cr.filter(c => c.forma && c.forma !== 'dinheiro' && !c.banco && dCr(c) <= diaMenos(2));
  if (paraBanco.length) add('amarelo', 'CREDI_CONFERIR_BANCO', plural2(paraBanco.length, 'Pix/cartão', 'Pix/cartões') + ' de crediário (' + fmtR(somaV(paraBanco)) + ') para você conferir no extrato.', 'crediario');
  const naoAchei = cr.filter(c => c.banco === 'nao_achei');
  if (naoAchei.length) add('vermelho', 'CREDI_NAO_ACHEI', plural2(naoAchei.length, 'recebimento', 'recebimentos') + ' de crediário marcado(s) como Pix/cartão que não caiu no banco (' + fmtR(somaV(naoAchei)) + ').', 'crediario');
  // dinheiro que saiu para o banco e o dono ainda não confirmou no extrato
  const banco = bancoR.rows[0];
  const aCaminhoDoBanco = { total: r2(Number(banco.total)), qtd: banco.n, desde: banco.desde ? String(banco.desde).slice(0, 10) : null };
  if (banco.n) {
    const dias = Math.floor((Date.parse(hoje() + 'T12:00:00Z') - Date.parse(aCaminhoDoBanco.desde + 'T12:00:00Z')) / 864e5);
    add(nivelPor(dias, ALERTA.sangriaSemBancoDias), 'SANGRIA_SEM_BANCO', fmtR(aCaminhoDoBanco.total) + ' saíram para o banco (desde ' + dBRs(aCaminhoDoBanco.desde) + ') e você ainda não confirmou no extrato.', 'banco');
  }
  const confAdm = confAdmR.rows[0];
  if (cfg && (!confAdm || Number(confAdm.dias) >= ALERTA.donoSemContarDias)) add('amarelo', 'DONO_SEM_CONTAR',
    confAdm ? 'Você não conta o cofre pessoalmente há ' + Math.floor(Number(confAdm.dias)) + ' dias.' : 'Você ainda não contou o cofre pessoalmente.', 'contar');
  const hJob = jobR.rows[0].horas == null ? null : Number(jobR.rows[0].horas);
  const stariaAte = linMaxR.rows[0].ate ? String(linMaxR.rows[0].ate).slice(0, 10) : null;
  if (cfg && hJob != null && hJob >= ALERTA.stariaHoras) add('amarelo', 'STARIA_ATRASADO', 'Os números do StarIA não são atualizados há ' + Math.floor(hJob / 24) + ' dia(s).', 'staria');
  if (mexR.rows[0].n) add('amarelo', 'MEXIDAS', mexR.rows[0].n + ' ajuste(s) ou lançamento(s) apagado(s) nesta semana.', 'ocorrencias');
  const ordem = a => (a.nivel === 'vermelho' ? 0 : 1);
  alertas.sort((a, b) => ordem(a) - ordem(b)); pend.sort((a, b) => ordem(a) - ordem(b));
  const vermelhos = alertas.filter(a => a.nivel === 'vermelho').length;
  return {
    resumo: {
      status: vermelhos ? 'vermelho' : alertas.length ? 'amarelo' : 'verde',
      naMatriz: saldo,
      ultimaContagem: conf ? { em: conf.created_at, horas: Math.floor(Number(conf.horas)), diferenca: Number(conf.diferenca), por: conf.criado_por, role: conf.criado_por_role } : null,
      nasLojas, aCaminhoDoBanco, gaveta: saldoImpostos,
      tudo: r2(saldo + nasLojas.total + aCaminhoDoBanco.total + saldoImpostos),
      stariaAte, stariaHoras: hJob == null ? null : Math.floor(hJob),
      alertas
    },
    pendencias: pend
  };
}
/* financeiro e caixista: contagem cega — não veem o saldo nem o valor esperado de nada que ainda vão contar
   (sacola, caixas do StarIA). Veem só o que eles mesmos lançaram e as pendências, sem valores. */
function paraEquipe(out, user, pendencias) {
  const eu = m => m.criadoPor === (user.name || user.login) && m.criadoPorRole === user.role;
  // caixista não marca caixa do StarIA nem forma de crediário: essas pendências são só do financeiro
  if (user.role === 'caixista') pendencias = pendencias.filter(p => !['CAIXA_VERMELHO', 'CREDI_SEM_FORMA'].includes(p.codigo));
  return {
    cfg: out.cfg ? { definido: true } : null,
    mov: out.mov.filter(eu).slice(0, 50),
    jobs: [],
    sacolas: out.sacolas.map(s => Object.assign({}, s, {
      valorStaria: null, crediStaria: null, diferenca: null, crediDiferenca: null, crediCartao: null, crediPix: null,
      bateu: s.conferidoEm ? (s.diferenca === 0 && !s.crediDiferenca) : null,
      caixas: s.caixas.map(c => Object.assign({}, c, { dinheiro: null }))
    })),
    caixasPendentes: out.caixasPendentes ? out.caixasPendentes.map(c => Object.assign({}, c, { dinheiro: null })) : undefined,
    // o financeiro precisa do valor e do cliente para dizer como cada um pagou; não vê se o dono já conferiu no banco
    crediarios: out.crediarios,
    pendencias
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
  need(user.role, ['admin', 'caixista', 'financeiro'], 'Função não disponível para o seu acesso.');
  const valor = valorOf(b.valor, 'Valor da sangria');
  const data = dateOf(b.data, 'Data', true);
  const motivo = txt(b.motivo, 300, 'Motivo', true);
  const destino = b.destino === 'impostos' ? 'impostos' : null;
  // sangria para a gaveta de impostos: só o admin (é ele quem faz essa retirada e controla a gaveta)
  if (destino === 'impostos') need(user.role, ['admin'], 'Função não disponível para o seu acesso.');
  const id = uid('m');
  if (destino !== 'impostos') {
    await db.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,motivo,criado_por,criado_por_role) values($1,$2,'sangria',$3,$4,$5,$6,$7)`,
      [tid, id, valor, data, motivo, user.name || user.login, user.role]);
    return { id };
  }
  // destino='impostos': a sangria sai do caixa principal e, na mesma operação, entra na gaveta (par_id liga as duas)
  return db.tx(async t => {
    const idGaveta = uid('m');
    await t.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,motivo,destino,par_id,criado_por,criado_por_role) values($1,$2,'sangria',$3,$4,$5,'impostos',$6,$7,$8)`,
      [tid, id, valor, data, motivo, idGaveta, user.name || user.login, user.role]);
    await t.query(`insert into caixa_mov(tenant_id,id,caixa,tipo,valor,data,motivo,par_id,criado_por,criado_por_role) values($1,$2,'impostos','gaveta_entrada',$3,$4,$5,$6,$7,$8)`,
      [tid, idGaveta, valor, data, motivo, id, user.name || user.login, user.role]);
    return { id };
  });
}
/* saída da gaveta de impostos: o admin de fato usando o dinheiro para pagar imposto/parcela. Só afeta o saldo
   da gaveta (caixa='impostos'), nunca o saldo principal. */
async function saveGavetaSaida(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador movimenta a gaveta de impostos.');
  const valor = valorOf(b.valor, 'Valor');
  const data = dateOf(b.data, 'Data', true);
  const motivo = txt(b.motivo, 300, 'Motivo', true);
  const id = uid('m');
  await db.query(`insert into caixa_mov(tenant_id,id,caixa,tipo,valor,data,motivo,criado_por,criado_por_role) values($1,$2,'impostos','gaveta_saida',$3,$4,$5,$6,$7)`,
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
/* conferência física do caixa principal: admin, caixista ou financeiro digita quanto contou; o servidor compara
   com o saldo esperado NAQUELE MOMENTO (dentro da transação, travando a leitura) e grava. Nunca muda o saldo nem
   se edita depois — é só um retrato. Toda diferença ≠ 0 aparece na aba Ocorrências (só o admin vê). */
async function conferir(tid, user, b) {
  need(user.role, ['admin', 'caixista', 'financeiro'], 'Função não disponível para o seu acesso.');
  // zero é um valor válido aqui (caixa contado e achado vazio): valorOf não aceita 0, então trata à parte.
  const bruto = String(b.valorContado == null ? '' : b.valorContado).trim();
  const ehZero = /^0+([.,]0+)?$/.test(bruto);
  const valorContado = ehZero ? 0 : valorOf(b.valorContado, 'Valor contado', { signed: false });
  const motivo = txt(b.motivo, 300, 'Observação');
  return db.tx(async t => {
    await t.query(`select tenant_id from caixa_cfg where tenant_id=$1 for update`, [tid]);
    const saldoEsperado = await saldoPrincipalAtual(tid, t);
    const diferenca = r2(valorContado - saldoEsperado);
    const id = uid('cf');
    await t.query(`insert into caixa_conferencia(tenant_id,id,valor_contado,saldo_esperado,diferenca,motivo,criado_por,criado_por_role) values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tid, id, valorContado, saldoEsperado, diferenca, motivo, user.name || user.login, user.role]);
    // contagem cega: quem não é o dono só fica sabendo se bateu (nunca o valor esperado nem quanto faltou) —
    // senão quem guarda o dinheiro poderia tirar a sobra e "bater certinho"
    return user.role === 'admin' ? { id, saldoEsperado, diferenca, bateu: diferenca === 0 } : { id, bateu: diferenca === 0 };
  });
}

/* ---------- ocorrências (só admin): toda conferência com diferença, e tudo que foi apagado, alterado ou
   aprovado/rejeitado no caixa — inclusive pelo próprio admin, com a própria senha, para dar transparência e
   segurança a quem trabalha com o dinheiro. É só leitura: nada aqui se edita ou se apaga. */
const ACOES_OCORRENCIA = ['caixa_mov_excluido', 'caixa_ajuste', 'caixa_cfg', 'caixa_pessoa', 'caixa_staria_pedir', 'caixa_staria_resultado', 'caixa_zerado', 'caixa_caixas_aceitos'];
const TITULO_ACAO = {
  caixa_mov_excluido: 'Lançamento apagado', caixa_ajuste: 'Ajuste lançado', caixa_cfg: 'Saldo inicial alterado',
  caixa_pessoa: 'Acesso criado ou alterado',
  caixa_staria_pedir: 'Consulta ao StarIA pedida', caixa_staria_resultado: 'Consulta ao StarIA aplicada, em sacolas por filial',
  caixa_zerado: 'Dados do caixa zerados (recomeço do zero)', caixa_caixas_aceitos: 'Caixas do StarIA enviados para a sacola'
};
async function ocorrencias(tid, user) {
  need(user.role, ['admin'], 'Função não disponível para o seu acesso.');
  // lib/pg.js não converte um array JS em array do Postgres num parâmetro $n (vira texto/JSON errado); como a
  // lista de ações é fixa e nunca vem do usuário, usamos ela literal no SQL em vez de ligar como parâmetro.
  const acoesLit = ACOES_OCORRENCIA.map(a => `'${a}'`).join(',');
  const [confR, sacR, audR, crR] = await Promise.all([
    db.query(`select * from caixa_conferencia where tenant_id=$1 and diferenca<>0 order by created_at desc limit 200`, [tid]),
    db.query(`select * from caixa_sacola where tenant_id=$1 and conferido_em is not null and (diferenca<>0 or credi_diferenca<>0) order by conferido_em desc limit 200`, [tid]),
    // depois de um "zerar", só conta o que veio dele em diante (o próprio "zerar" inclusive): o histórico de
    // auditoria continua guardado, mas as ocorrências de antes eram de dados que não existem mais
    db.query(`select action, detail, role, at from audit where tenant_id=$1 and action in (${acoesLit})
      and at >= coalesce((select max(at) from audit where tenant_id=$1 and action='caixa_zerado'), '-infinity'::timestamptz)
      order by at desc limit 200`, [tid]),
    db.query(`select * from caixa_credi where tenant_id=$1 and banco='nao_achei' order by banco_em desc limit 200`, [tid])
  ]);
  const confs = confR.rows.map(c => ({
    tipo: 'conferencia', titulo: 'Conferência com diferença', em: c.created_at,
    detalhe: { valorContado: Number(c.valor_contado), saldoEsperado: Number(c.saldo_esperado), diferenca: Number(c.diferenca), motivo: c.motivo, por: c.criado_por, role: c.criado_por_role }
  }));
  const sacs = sacR.rows.map(s => ({
    tipo: 'sacola', titulo: 'Sacola da filial com diferença', em: s.conferido_em,
    detalhe: {
      filial: s.filial, valorStaria: Number(s.valor_staria), valorContado: Number(s.valor_contado), diferenca: Number(s.diferenca),
      crediStaria: Number(s.credi_staria) || 0, crediDinheiro: s.credi_dinheiro == null ? null : Number(s.credi_dinheiro),
      crediCartao: s.credi_cartao == null ? null : Number(s.credi_cartao), crediPix: s.credi_pix == null ? null : Number(s.credi_pix),
      crediDiferenca: s.credi_diferenca == null ? null : Number(s.credi_diferenca),
      motivo: s.motivo, por: s.conferido_por, role: s.conferido_por_role
    }
  }));
  const auds = audR.rows.map(a => ({ tipo: 'auditoria', titulo: TITULO_ACAO[a.action] || a.action, em: a.at, detalhe: Object.assign({ role: a.role }, a.detail) }));
  const crs = crR.rows.map(c => ({
    tipo: 'credi', titulo: 'Crediário marcado como ' + (c.forma === 'pix' ? 'Pix' : c.forma === 'cartao' ? 'cartão' : 'outro') + ' que não caiu no banco', em: c.banco_em,
    detalhe: { filial: c.filial, data: String(c.data).slice(0, 10), cliente: c.cliente, numero: c.numero, valor: Number(c.valor), formaPor: c.forma_por, por: c.banco_por }
  }));
  return { ocorrencias: confs.concat(sacs, auds, crs).sort((x, y) => new Date(y.em) - new Date(x.em)).slice(0, 300) };
}

/* marca (ou desmarca) quando uma sangria de fato chegou ao banco: não muda o saldo (ela já tinha saído do caixa).
   Só o dono: quem tira o dinheiro não pode ser quem confirma que ele chegou (ele olha o extrato e confirma). */
async function marcarDepositado(tid, user, b) {
  need(user.role, ['admin'], 'Só o dono confirma que o dinheiro chegou no banco.');
  const id = String(b.id || '');
  const r = await db.query(`select tipo from caixa_mov where tenant_id=$1 and id=$2`, [tid, id]);
  if (!r.rows[0]) throw httpErr(404, 'Lançamento não encontrado.');
  if (r.rows[0].tipo !== 'sangria') throw httpErr(400, 'Só uma sangria pode ser marcada como depositada.');
  const data = b.depositadoEm === null || b.depositadoEm === '' ? null : dateOf(b.depositadoEm, 'Data do depósito', true);
  await db.query(`update caixa_mov set depositado_em=$3 where tenant_id=$1 and id=$2`, [tid, id, data]);
  return { ok: true };
}
/* apaga sangria, ajuste ou lançamento da gaveta (nunca uma venda_staria/crediario_staria: são o retrato do que o
   StarIA informou, ficam sempre). Uma sangria destino='impostos' tem par: apagar ela também apaga a gaveta_entrada
   ligada — mas só se esse dinheiro ainda estiver disponível na gaveta (senão, já foi usado num gaveta_saida, e
   apagar a entrada deixaria a gaveta inconsistente). */
async function delMov(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador apaga um lançamento.');
  const id = String((b && b.id) || '');
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_mov where tenant_id=$1 and id=$2 for update`, [tid, id]);
    const m = r.rows[0];
    if (!m || !['sangria', 'ajuste', 'gaveta_entrada', 'gaveta_saida'].includes(m.tipo)) throw httpErr(404, 'Lançamento não encontrado (ou não pode ser apagado).');
    if (m.par_id) {
      const parR = await t.query(`select * from caixa_mov where tenant_id=$1 and id=$2 for update`, [tid, m.par_id]);
      const par = parR.rows[0];
      const entrada = m.tipo === 'gaveta_entrada' ? m : (par && par.tipo === 'gaveta_entrada' ? par : null);
      if (entrada) {
        const somaR = await t.query(`select coalesce(sum(case when tipo='gaveta_saida' then -valor else valor end),0) as soma
          from caixa_mov where tenant_id=$1 and caixa='impostos'`, [tid]);
        const saldoGaveta = Number(somaR.rows[0].soma);
        if (saldoGaveta < Number(entrada.valor)) throw httpErr(409, 'Não é possível apagar: esse dinheiro já foi usado na gaveta de impostos.');
      }
      if (par) await t.query(`delete from caixa_mov where tenant_id=$1 and id=$2`, [tid, m.par_id]);
    }
    await t.query(`delete from caixa_mov where tenant_id=$1 and id=$2`, [tid, id]);
    return { ok: true };
  });
}

/* ---------- consulta ao StarIA: vendas em dinheiro + crediário em dinheiro, por filial, no período ----------
   pendente -> (Claude, pelo acesso de automação ou pelo navegador do dono) pronta, com o resultado ->
   (dono revisa e aplica) aplicada: cria o lançamento. */
async function pedirConsulta(tid, user, b) {
  need(user.role, ['admin', 'automacao'], 'Só o administrador pede a consulta ao StarIA.');
  // "Atualizar números do StarIA" (botão do Início): os últimos 7 dias até ONTEM (hoje ainda tem caixa aberto);
  // pedir de novo um período que já está esperando o Claude não é erro: devolve o mesmo pedido
  const auto = b && b.auto === true;
  const diaMenos = n => new Date(Date.parse(hoje() + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  const periodoIni = auto ? diaMenos(7) : dateOf(b.periodoIni, 'Data inicial', true);
  const periodoFim = auto ? diaMenos(1) : dateOf(b.periodoFim, 'Data final', true);
  if (periodoFim < periodoIni) throw httpErr(400, 'A data final não pode ser antes da inicial.');
  if (periodoFim > hoje()) throw httpErr(400, 'A data final não pode ser no futuro.');
  const dup = await db.query(`select id from caixa_jobs where tenant_id=$1 and status<>'aplicada' and periodo_ini=$2 and periodo_fim=$3`, [tid, periodoIni, periodoFim]);
  if (dup.rows[0] && auto) return { id: dup.rows[0].id, jaPedido: true, periodoIni, periodoFim };
  if (dup.rows[0]) throw httpErr(409, 'Já existe uma consulta para este período, aguardando o Claude ou a sua revisão.');
  const id = uid('j');
  await db.query(`insert into caixa_jobs(tenant_id,id,periodo_ini,periodo_fim,criado_por) values($1,$2,$3,$4,$5)`, [tid, id, periodoIni, periodoFim, user.name || user.login]);
  return { id, periodoIni, periodoFim };
}
/* formato por caixa (o atual): { linhas: [{ filial, ecf, data, dinheiro }] } — uma linha por caixa (ECF) por dia,
   só o dinheiro, exatamente como na tela "Fechamento de Caixa (PDV)" do StarIA. Linha com dinheiro 0 é ignorada. */
const MAX_LINHAS = 5000;
function linhasOf(lista) {
  if (!Array.isArray(lista)) throw httpErr(400, 'Resultado inválido: linhas.');
  if (lista.length > MAX_LINHAS) throw httpErr(400, 'Linhas demais. Peça um período menor.');
  const vistas = new Set();
  const out = [];
  for (const l of lista) {
    if (!l || typeof l !== 'object') throw httpErr(400, 'Linha inválida.');
    const filial = Number(l.filial);
    if (!Number.isInteger(filial) || filial < 1 || filial > 999) throw httpErr(400, 'Filial inválida: ' + l.filial);
    const ecf = String(l.ecf == null ? '' : l.ecf).trim();
    if (!/^[\w.-]{1,20}$/.test(ecf)) throw httpErr(400, 'Caixa (ECF) inválido: ' + ecf);
    const data = dateOf(l.data, 'Data do caixa', true);
    if (data > hoje()) throw httpErr(400, 'Data do caixa no futuro: ' + data);
    const dinheiro = Number(l.dinheiro);
    if (!isFinite(dinheiro) || dinheiro < 0 || dinheiro > MAX_VALOR) throw httpErr(400, 'Dinheiro inválido no caixa ' + ecf + ' de ' + data + '.');
    const chave = filial + '|' + ecf + '|' + data;
    if (vistas.has(chave)) throw httpErr(400, 'Caixa ' + ecf + ' da filial ' + filial + ' repetido no dia ' + data + '.');
    vistas.add(chave);
    if (r2(dinheiro) > 0) out.push({ filial, ecf, data, dinheiro: r2(dinheiro) });
  }
  return out;
}
/* o Claude devolve o resultado (pelo navegador do dono, já logado): totais em dinheiro, por filial e geral
   (formato antigo, por filial — continua aceito; o atual é por caixa, ver linhasOf) */
function resultadoOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw httpErr(400, 'Resultado inválido.');
  const porFilial = {};
  const pf = r.porFilial && typeof r.porFilial === 'object' && !Array.isArray(r.porFilial) ? r.porFilial : {};
  for (const [k, v] of Object.entries(pf)) {
    if (!/^\d+$/.test(String(k))) throw httpErr(400, 'Filial inválida: ' + k);
    if (!v || typeof v !== 'object') throw httpErr(400, 'Resultado da filial ' + k + ' inválido.');
    // recebCrediario: total de crediário recebido no período, em QUALQUER forma de pagamento (não só dinheiro) —
    // quem decide quanto disso é dinheiro, cartão ou Pix é o financeiro, na hora de conferir a sacola desta filial.
    const vendas = Number(v.vendasDinheiro) || 0, crediario = Number(v.recebCrediario) || 0;
    if (vendas < 0 || crediario < 0) throw httpErr(400, 'Resultado da filial ' + k + ' inválido (negativo).');
    porFilial[k] = { vendasDinheiro: r2(vendas), recebCrediario: r2(crediario) };
  }
  if (!Object.keys(porFilial).length) throw httpErr(400, 'Resultado sem nenhuma filial.');
  const total = r2(Object.values(porFilial).reduce((a, x) => a + x.vendasDinheiro + x.recebCrediario, 0));
  if (total > MAX_VALOR) throw httpErr(400, 'Total grande demais. Confira o período.');
  return { porFilial, total };
}
/* entregar o resultado: cria, na mesma hora, uma "sacola" pendente por filial com venda em dinheiro e/ou crediário
   recebido (apontados pelo StarIA) — ela fica "na filial" até alguém marcar que chegou na matriz e o financeiro
   conferir o valor real de vendas E decidir, do crediário, quanto foi em dinheiro/cartão/Pix (ver
   marcarChegada/conferirSacola). A filial 1 (matriz) nunca "viaja" fisicamente: sua sacola já nasce com chegou_em
   preenchido, pronta pra conferência direto. A consulta em si vira 'aplicada' aqui mesmo: a partir daqui, o que
   acontece com o dinheiro é acompanhado pelas sacolas, não pela consulta. */
async function entregarResultado(tid, user, b) {
  // o Claude entrega pelo acesso de automação (importação noturna) ou pelo navegador do dono (admin); a rota em
  // handle() também confere isso, mas a função se protege por conta própria, caso um dia seja chamada de outro lugar.
  need(user.role, ['admin', 'automacao'], 'Só o administrador entrega o resultado do StarIA.');
  const id = String((b && b.id) || '');
  if (b && b.resultado && typeof b.resultado === 'object' && (Array.isArray(b.resultado.linhas) || Array.isArray(b.resultado.crediario))) {
    return entregarLinhas(tid, id, linhasOf(b.resultado.linhas || []), crediOf(b.resultado.crediario || []));
  }
  const resultado = resultadoOf(b.resultado);
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_jobs where tenant_id=$1 and id=$2 for update`, [tid, id]);
    const job = r.rows[0];
    if (!job) throw httpErr(404, 'Consulta não encontrada.');
    if (job.status !== 'pendente') throw httpErr(409, 'Esta consulta já tem resultado.');
    const sacolas = [];
    for (const [filial, v] of Object.entries(resultado.porFilial)) {
      if (v.vendasDinheiro > 0 || v.recebCrediario > 0) {
        const sid = uid('sc');
        const ehMatriz = Number(filial) === 1;
        await t.query(`insert into caixa_sacola(tenant_id,id,job_id,filial,periodo_ini,periodo_fim,valor_staria,credi_staria,chegou_em) values($1,$2,$3,$4,$5,$6,$7,$8,${ehMatriz ? 'now()' : 'null'})`,
          [tid, sid, id, Number(filial), job.periodo_ini, job.periodo_fim, v.vendasDinheiro, v.recebCrediario]);
        sacolas.push(sid);
      }
    }
    await t.query(`update caixa_jobs set status='aplicada', resultado=$3::jsonb, pronto_em=now() where tenant_id=$1 and id=$2`, [tid, id, JSON.stringify(resultado)]);
    return { ok: true, sacolas };
  });
}

/* resultado por caixa: grava/atualiza cada linha como 'pendente' (uma já 'aceita' nunca é tocada — não entra de
   novo nem muda de valor). Nada vira sacola aqui: só quando o financeiro marcar as conferidas (aceitarLinhas). */
async function entregarLinhas(tid, id, linhas, credi) {
  credi = credi || [];
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_jobs where tenant_id=$1 and id=$2 for update`, [tid, id]);
    const job = r.rows[0];
    if (!job) throw httpErr(404, 'Consulta não encontrada.');
    if (job.status !== 'pendente') throw httpErr(409, 'Esta consulta já tem resultado.');
    // recebimentos de crediário: entram uma vez só (a mesma chave nunca é regravada — a forma marcada não se perde)
    let crediNovos = 0;
    for (const c of credi) {
      const ins = await t.query(`insert into caixa_credi(tenant_id,id,chave,filial,data,numero,cliente,valor,conta_staria,tipo_conta,forma,job_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(tenant_id,chave) do nothing returning id`,
      [tid, uid('cr'), c.chave, c.filial, c.data, c.numero, c.cliente, c.valor, c.conta, c.tipo, null, id]);
      crediNovos += ins.rows.length;
    }
    let novas = 0, atualizadas = 0, jaAceitas = 0;
    for (const l of linhas) {
      const ex = (await t.query(`select status from caixa_linha where tenant_id=$1 and filial=$2 and ecf=$3 and data=$4 for update`, [tid, l.filial, l.ecf, l.data])).rows[0];
      if (!ex) {
        await t.query(`insert into caixa_linha(tenant_id,id,filial,ecf,data,dinheiro,job_id) values($1,$2,$3,$4,$5,$6,$7)`, [tid, uid('l'), l.filial, l.ecf, l.data, l.dinheiro, id]);
        novas++;
      } else if (ex.status === 'pendente') {
        await t.query(`update caixa_linha set dinheiro=$5, job_id=$6, updated_at=now() where tenant_id=$1 and filial=$2 and ecf=$3 and data=$4`, [tid, l.filial, l.ecf, l.data, l.dinheiro, id]);
        atualizadas++;
      } else jaAceitas++;
    }
    const resumo = { porCaixa: true, linhas: linhas.length, novas, atualizadas, jaAceitas, total: r2(linhas.reduce((a, l) => a + l.dinheiro, 0)),
      crediario: credi.length, crediNovos, crediTotal: r2(credi.reduce((a, c) => a + c.valor, 0)) };
    await t.query(`update caixa_jobs set status='aplicada', resultado=$3::jsonb, pronto_em=now() where tenant_id=$1 and id=$2`, [tid, id, JSON.stringify(resumo)]);
    return Object.assign({ ok: true }, resumo);
  });
}
/* financeiro (ou admin) marca os caixas que já estão conferidos no StarIA (linha preta): eles saem da lista de
   pendentes e viram UMA sacola por filial, com a soma do dinheiro — a partir daí o caminho é o de sempre (chegou
   na matriz -> conferida com o valor contado). A matriz (filial 1) já nasce chegada. */
async function aceitarLinhas(tid, user, b) {
  need(user.role, ['admin', 'financeiro'], 'Função não disponível para o seu acesso.');
  const ids = Array.isArray(b && b.ids) ? [...new Set(b.ids.map(String))].filter(x => /^l[0-9a-f]{16}$/.test(x)) : [];
  if (!ids.length) throw httpErr(400, 'Marque pelo menos um caixa.');
  if (ids.length > 2000) throw httpErr(400, 'Caixas demais de uma vez.');
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_linha where tenant_id=$1 and id in (select jsonb_array_elements_text($2::jsonb)) for update`, [tid, JSON.stringify(ids)]);
    if (r.rows.length !== ids.length) throw httpErr(404, 'Algum caixa marcado não existe mais. Atualize a tela.');
    if (r.rows.some(l => l.status !== 'pendente')) throw httpErr(409, 'Algum caixa marcado já foi enviado para a sacola. Atualize a tela.');
    const lote = uid('lt');
    const porFilial = {};
    for (const l of r.rows) (porFilial[l.filial] = porFilial[l.filial] || []).push(l);
    const sacolas = [];
    for (const [filial, ls] of Object.entries(porFilial)) {
      const sid = uid('sc');
      const datas = ls.map(l => l.data instanceof Date ? l.data.toISOString().slice(0, 10) : String(l.data).slice(0, 10)).sort();
      const total = r2(ls.reduce((a, l) => a + Number(l.dinheiro), 0));
      const ehMatriz = Number(filial) === 1;
      await t.query(`insert into caixa_sacola(tenant_id,id,job_id,filial,periodo_ini,periodo_fim,valor_staria,credi_staria,chegou_em) values($1,$2,$3,$4,$5,$6,$7,0,${ehMatriz ? 'now()' : 'null'})`,
        [tid, sid, lote, Number(filial), datas[0], datas[datas.length - 1], total]);
      await t.query(`update caixa_linha set status='aceita', sacola_id=$3, aceita_em=now(), aceita_por=$4, aceita_por_role=$5, updated_at=now()
        where tenant_id=$1 and filial=$2 and status='pendente' and id in (select jsonb_array_elements_text($6::jsonb))`,
        [tid, Number(filial), sid, user.name || user.login, user.role, JSON.stringify(ls.map(l => l.id))]);
      sacolas.push({ id: sid, filial: Number(filial), caixas: ls.length, total });
    }
    return { sacolas, caixas: r.rows.length, total: r2(sacolas.reduce((a, s) => a + s.total, 0)) };
  });
}
/* ---------- crediário recebido (cliente pagando a conta), um por um ----------
   O StarIA traz cada pagamento (filial, data, título, cliente, valor e a "conta" em que ele foi lançado lá), mas não
   diz direito COMO foi pago. O financeiro marca a forma; cada forma tem quem confira:
   - dinheiro: entra na sacola daquela filial e é contado às cegas junto (ver conferirSacola);
   - Pix / cartão / outro: o dono confere no extrato do banco ou da maquininha ("achei" / "não achei"). */
const FORMAS = ['dinheiro', 'pix', 'cartao', 'outro'];
function crediOf(lista) {
  if (!Array.isArray(lista)) throw httpErr(400, 'Resultado inválido: crediário.');
  if (lista.length > MAX_LINHAS) throw httpErr(400, 'Recebimentos demais. Peça um período menor.');
  const out = [], vistos = {};
  for (const c of lista) {
    if (!c || typeof c !== 'object') throw httpErr(400, 'Recebimento de crediário inválido.');
    const filial = Number(c.filial);
    if (!Number.isInteger(filial) || filial < 1 || filial > 999) throw httpErr(400, 'Filial inválida no crediário: ' + c.filial);
    const data = dateOf(c.data, 'Data do recebimento', true);
    if (data > hoje()) throw httpErr(400, 'Recebimento de crediário no futuro: ' + data);
    const valor = Number(c.valor);
    if (!isFinite(valor) || valor < 0 || valor > MAX_VALOR) throw httpErr(400, 'Valor inválido no recebimento ' + (c.numero || '') + '.');
    if (!(r2(valor) > 0)) continue;
    const numero = txt(c.numero, 40, 'Título') || '';
    const base = filial + '|' + numero + '|' + data + '|' + r2(valor).toFixed(2);
    vistos[base] = (vistos[base] || 0) + 1;   // pagamentos parciais iguais no mesmo dia: 1º, 2º...
    out.push({ chave: base + '|' + vistos[base], filial, data, numero, cliente: txt(c.cliente, 80, 'Cliente'), valor: r2(valor), conta: txt(c.conta, 60, 'Conta'), tipo: txt(c.tipo, 60, 'Tipo') });
  }
  return out;
}
const crediOut = (c, role) => Object.assign({
  id: c.id, filial: c.filial, data: String(c.data).slice(0, 10), numero: c.numero, cliente: c.cliente, valor: Number(c.valor),
  conta: c.conta_staria, tipo: c.tipo_conta, forma: c.forma, formaPor: c.forma_por, contado: !!c.sacola_id
}, role === 'admin' ? { banco: c.banco, bancoEm: c.banco_em, bancoPor: c.banco_por } : {});
/* financeiro (ou dono) marca a forma de vários recebimentos de uma vez. Trava depois que o dinheiro foi contado
   numa sacola ou que o dono conferiu no banco (aí a forma não muda mais). forma null = desmarcar. */
async function salvarFormas(tid, user, b) {
  need(user.role, ['admin', 'financeiro'], 'Função não disponível para o seu acesso.');
  const itens = Array.isArray(b && b.itens) ? b.itens : [];
  if (!itens.length) throw httpErr(400, 'Marque a forma de pelo menos um recebimento.');
  if (itens.length > 2000) throw httpErr(400, 'Recebimentos demais de uma vez.');
  let alteradas = 0, travadas = 0;
  return db.tx(async t => {
    for (const it of itens) {
      const id = String((it && it.id) || '');
      const forma = it && (it.forma === null || it.forma === '') ? null : String((it && it.forma) || '');
      if (forma !== null && !FORMAS.includes(forma)) throw httpErr(400, 'Forma inválida: ' + forma);
      const r = await t.query(`update caixa_credi set forma=$3, forma_por=$4, forma_por_role=$5, forma_em=now(), updated_at=now()
        where tenant_id=$1 and id=$2 and sacola_id is null and banco is null returning id`, [tid, id, forma, user.name || user.login, user.role]);
      if (r.rows.length) alteradas++;
      else if ((await t.query(`select 1 from caixa_credi where tenant_id=$1 and id=$2`, [tid, id])).rows.length) travadas++;
      else throw httpErr(404, 'Recebimento não encontrado. Atualize a tela.');
    }
    return { alteradas, travadas };
  });
}
/* o dono confere no extrato: Pix/cartão/outro que ele achou (ou não achou) no banco/maquininha. "Não achei" vira
   alerta vermelho e ocorrência: foi marcado como Pix e não caiu. Dá para voltar atrás (resultado null). */
async function conferirBanco(tid, user, b) {
  need(user.role, ['admin'], 'Só o dono confere o crediário no banco.');
  const ids = Array.isArray(b && b.ids) ? [...new Set(b.ids.map(String))] : [];
  if (!ids.length) throw httpErr(400, 'Escolha pelo menos um recebimento.');
  const res = b.resultado === null ? null : String(b.resultado || '');
  if (res !== null && !['achei', 'nao_achei'].includes(res)) throw httpErr(400, 'Resultado inválido.');
  const r = await db.query(`update caixa_credi set banco=$3, banco_por=$4, banco_em=case when $3::text is null then null else now() end, updated_at=now()
    where tenant_id=$1 and id in (select jsonb_array_elements_text($2::jsonb)) and forma in ('pix','cartao','outro') returning id, valor, cliente`,
  [tid, JSON.stringify(ids), res, user.name || user.login]);
  if (r.rows.length !== ids.length) throw httpErr(409, 'Só dá para conferir no banco o que foi marcado como Pix, cartão ou outro. Atualize a tela.');
  return { conferidos: r.rows.length, total: r2(r.rows.reduce((a, x) => a + Number(x.valor), 0)), resultado: res };
}
const linhaOut = l => ({ id: l.id, filial: l.filial, ecf: l.ecf, data: l.data instanceof Date ? l.data.toISOString().slice(0, 10) : String(l.data).slice(0, 10), dinheiro: Number(l.dinheiro), status: l.status, sacolaId: l.sacola_id, atualizadaEm: l.updated_at });

/* ---------- sacolas (venda em dinheiro + crediário recebido, por filial): "na filial" -> chegou na matriz
   (caixista ou financeiro) -> conferida (financeiro ou admin, com o valor REAL de vendas contado e a forma de
   pagamento do crediário) -> aí sim entra no saldo, com o valor contado (não o do StarIA). Até a conferência,
   aquele dinheiro não existe no caixa principal: continua "lá na filial". A filial 1 (matriz) nunca "viaja": sua
   sacola já nasce com chegou_em preenchido (ver entregarResultado), pronta pra conferência direto. */
const sacolaOut = s => ({
  id: s.id, jobId: s.job_id, filial: s.filial, periodoIni: s.periodo_ini, periodoFim: s.periodo_fim,
  precisaChegar: Number(s.filial) !== 1,
  valorStaria: Number(s.valor_staria), crediStaria: Number(s.credi_staria) || 0,
  chegouEm: s.chegou_em, chegouPor: s.chegou_por, chegouPorRole: s.chegou_por_role,
  valorContado: s.valor_contado == null ? null : Number(s.valor_contado), diferenca: s.diferenca == null ? null : Number(s.diferenca),
  crediDinheiro: s.credi_dinheiro == null ? null : Number(s.credi_dinheiro), crediCartao: s.credi_cartao == null ? null : Number(s.credi_cartao),
  crediPix: s.credi_pix == null ? null : Number(s.credi_pix), crediDiferenca: s.credi_diferenca == null ? null : Number(s.credi_diferenca),
  motivo: s.motivo, conferidoEm: s.conferido_em, conferidoPor: s.conferido_por, criadoEm: s.created_at
});
/* caixista ou financeiro marca que a sacola física chegou na matriz (ainda não é a conferência: só avisa que já
   pode ser conferida). Idempotente: clicar de novo numa que já chegou não dá erro nem troca quem marcou. */
async function marcarChegada(tid, user, b) {
  need(user.role, ['admin', 'caixista', 'financeiro'], 'Função não disponível para o seu acesso.');
  const id = String((b && b.id) || '');
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_sacola where tenant_id=$1 and id=$2 for update`, [tid, id]);
    if (!r.rows[0]) throw httpErr(404, 'Sacola não encontrada.');
    if (r.rows[0].chegou_em) return { ok: true, jaChegou: true };
    await t.query(`update caixa_sacola set chegou_em=now(), chegou_por=$3, chegou_por_role=$4 where tenant_id=$1 and id=$2`,
      [tid, id, user.name || user.login, user.role]);
    return { ok: true };
  });
}
function valorZeroOk(v, label) {
  const bruto = String(v == null || v === '' ? '0' : v).trim();
  const ehZero = /^0+([.,]0+)?$/.test(bruto);
  return ehZero ? 0 : valorOf(v, label, { signed: false });
}
/* financeiro (ou admin) confere o valor REAL de vendas que veio na sacola e, do crediário que o StarIA apontou
   pra essa filial/período, decide quanto foi recebido em dinheiro, cartão ou Pix — só o dinheiro (de vendas e de
   crediário) entra no saldo, com o valor contado, nunca o do StarIA. Qualquer diferença (de vendas ou de
   crediário) vira ocorrência. Nunca se edita nem se refaz depois: é a decisão final, tudo num clique só. */
async function conferirSacola(tid, user, b) {
  need(user.role, ['admin', 'financeiro'], 'Função não disponível para o seu acesso.');
  const valorContado = valorZeroOk(b && b.valorContado, 'Valor contado');
  const crediDinheiro = valorZeroOk(b && b.crediDinheiro, 'Crediário em dinheiro');
  const crediCartao = valorZeroOk(b && b.crediCartao, 'Crediário em cartão');
  const crediPix = valorZeroOk(b && b.crediPix, 'Crediário em Pix');
  const motivo = txt(b && b.motivo, 300, 'Observação');
  const id = String((b && b.id) || '');
  return db.tx(async t => {
    const r = await t.query(`select * from caixa_sacola where tenant_id=$1 and id=$2 for update`, [tid, id]);
    const s = r.rows[0];
    if (!s) throw httpErr(404, 'Sacola não encontrada.');
    if (!s.chegou_em) throw httpErr(409, 'Marque que a sacola chegou na matriz antes de conferir.');
    if (s.conferido_em) throw httpErr(409, 'Esta sacola já foi conferida.');
    const diferenca = r2(valorContado - Number(s.valor_staria));
    const crediTotal = r2(crediDinheiro + crediCartao + crediPix);
    // sacola montada a partir dos caixas (job_id 'lt…'): o crediário esperado em dinheiro é a soma dos recebimentos
    // daquela filial que o financeiro marcou como DINHEIRO e ainda não foram contados em nenhuma sacola (até o último
    // dia da sacola). Eles ficam presos a esta sacola agora; a diferença do crediário vira ocorrência como a de vendas.
    const crediDoFinanceiro = String(s.job_id || '').startsWith('lt');
    let crediDiferenca;
    if (crediDoFinanceiro) {
      const cr = await t.query(`select id, valor from caixa_credi where tenant_id=$1 and filial=$2 and forma='dinheiro' and sacola_id is null and data<=$3 for update`,
        [tid, s.filial, s.periodo_fim]);
      const esperado = r2(cr.rows.reduce((a, x) => a + Number(x.valor), 0));
      crediDiferenca = r2(crediDinheiro - esperado);
      if (cr.rows.length) await t.query(`update caixa_credi set sacola_id=$2, updated_at=now() where tenant_id=$1 and id in (select jsonb_array_elements_text($3::jsonb))`,
        [tid, id, JSON.stringify(cr.rows.map(x => x.id))]);
      await t.query(`update caixa_sacola set credi_staria=$3 where tenant_id=$1 and id=$2`, [tid, id, esperado]);
    } else crediDiferenca = r2(crediTotal - Number(s.credi_staria));
    let movId = null;
    if (valorContado > 0) {
      movId = uid('m');
      const detalheVenda = { porFilial: { [String(s.filial)]: { vendasDinheiro: valorContado, recebCrediarioDinheiro: 0 } } };
      await t.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,periodo_ini,periodo_fim,detalhe,criado_por,criado_por_role) values($1,$2,'venda_staria',$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [tid, movId, valorContado, s.periodo_fim, s.periodo_ini, s.periodo_fim, JSON.stringify(detalheVenda), user.name || user.login, user.role]);
    }
    let crediMovId = null;
    if (crediDinheiro > 0) {
      crediMovId = uid('m');
      const detalheCredi = { porFilial: { [String(s.filial)]: { vendasDinheiro: 0, recebCrediarioDinheiro: crediDinheiro } } };
      await t.query(`insert into caixa_mov(tenant_id,id,tipo,valor,data,periodo_ini,periodo_fim,detalhe,status,criado_por,criado_por_role) values($1,$2,'crediario_staria',$3,$4,$5,$6,$7::jsonb,'aprovado',$8,$9)`,
        [tid, crediMovId, crediDinheiro, s.periodo_fim, s.periodo_ini, s.periodo_fim, JSON.stringify(detalheCredi), user.name || user.login, user.role]);
    }
    await t.query(`update caixa_sacola set valor_contado=$3, diferenca=$4, credi_dinheiro=$5, credi_cartao=$6, credi_pix=$7, credi_diferenca=$8,
        motivo=$9, conferido_em=now(), conferido_por=$10, conferido_por_role=$11, mov_id=$12, credi_mov_id=$13 where tenant_id=$1 and id=$2`,
      [tid, id, valorContado, diferenca, crediDinheiro, crediCartao, crediPix, crediDiferenca, motivo, user.name || user.login, user.role, movId, crediMovId]);
    const bateu = diferenca === 0 && (crediDiferenca == null || crediDiferenca === 0);
    return user.role === 'admin' ? { id, diferenca, crediDiferenca, movId, crediMovId, bateu } : { id, bateu };
  });
}
/* antes de confirmar, quem conta pode CHECAR se o total bate — sem gravar nada e sem saber o valor esperado. Se não
   bater, conta de novo. No máximo 2 checagens por sacola (contadas pela auditoria), para ninguém "chutar" até acertar. */
const MAX_CHECAGENS = 2;
async function checarSacola(tid, user, b) {
  need(user.role, ['admin', 'financeiro'], 'Função não disponível para o seu acesso.');
  const valorContado = valorZeroOk(b && b.valorContado, 'Valor contado');
  const id = String((b && b.id) || '');
  const s = (await db.query(`select * from caixa_sacola where tenant_id=$1 and id=$2`, [tid, id])).rows[0];
  if (!s) throw httpErr(404, 'Sacola não encontrada.');
  if (!s.chegou_em) throw httpErr(409, 'Marque que a sacola chegou na matriz antes de conferir.');
  if (s.conferido_em) throw httpErr(409, 'Esta sacola já foi conferida.');
  const n = Number((await db.query(`select count(*)::int as n from audit where tenant_id=$1 and action='caixa_sacola_checada' and detail->>'id'=$2`, [tid, id])).rows[0].n);
  if (n >= MAX_CHECAGENS) throw httpErr(429, 'Você já checou esta sacola ' + MAX_CHECAGENS + ' vezes. Confirme a conferência com o valor que contou.');
  let bateu = r2(valorContado - Number(s.valor_staria)) === 0;
  if (String(s.job_id || '').startsWith('lt')) {
    // checa também o crediário em dinheiro que veio na sacola (mesma regra da conferência)
    const crediDinheiro = valorZeroOk(b && b.crediDinheiro, 'Crediário em dinheiro');
    const e = (await db.query(`select coalesce(sum(valor),0) as v from caixa_credi where tenant_id=$1 and filial=$2 and forma='dinheiro' and sacola_id is null and data<=$3`,
      [tid, s.filial, s.periodo_fim])).rows[0];
    bateu = bateu && r2(crediDinheiro - Number(e.v)) === 0;
  }
  return { id, bateu, checagens: n + 1 };
}

/* ---------- cadastro das pessoas com acesso (papéis 'caixista', 'financeiro' e 'automacao'): o admin cria/gerencia
   por dentro do próprio app. 'caixista' guarda o dinheiro e lança sangria; 'financeiro' só aprova/rejeita o
   recebimento de crediário; 'automacao' é o acesso só para o Claude (importação noturna do StarIA), sem senha
   provisória (o admin escolhe a senha direto, já que ninguém troca pela tela). Nenhum dos três exclui ou cancela
   nada: isso é só pelo usuário do admin. */
const PAPEIS = ['caixista', 'financeiro', 'automacao'];
async function pessoas(tid) {
  const r = await db.query(`select login, name, role, active, must_reset from users_t where tenant_id=$1 and role in ('caixista','financeiro','automacao') order by role, name`, [tid]);
  return r.rows.map(u => ({ login: u.login, nome: u.name, papel: u.role, ativo: u.active, trocarSenha: u.must_reset }));
}
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPass() { const b = crypto.randomBytes(16); let p = ''; for (let i = 0; i < 12; i++) p += ABC[b[i] % ABC.length]; return p.slice(0, 4) + '-' + p.slice(4, 8) + '-' + p.slice(8); }
async function savePessoa(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador cria ou altera este acesso.');
  const login = String(b.login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw httpErr(400, 'Usuário: use de 3 a 40 letras minúsculas, números, ponto ou traço (sem espaço nem acento).');
  const cur = (await db.query(`select ref_id, role from users_t where tenant_id=$1 and role in ('caixista','financeiro','automacao') and login=$2`, [tid, login])).rows[0];
  const papel = cur ? cur.role : (PAPEIS.includes(b.papel) ? b.papel : 'caixista'); // tela antiga sem o campo: continua criando caixista
  if (!PAPEIS.includes(papel)) throw httpErr(400, 'Papel inválido.');
  const nome = txt(b.nome, 80, 'Nome', papel !== 'automacao') || (papel === 'automacao' ? 'Automação (StarIA)' : '');
  const clash = await db.query(`select 1 from users_t where tenant_id=$1 and login=$2 and not (role in ('caixista','financeiro','automacao') and login=$2)`, [tid, login]);
  if (clash.rows.length) throw httpErr(400, `O usuário "${login}" já é usado por outra pessoa. Escolha outro.`);
  const refId = cur ? cur.ref_id : uid(papel === 'financeiro' ? 'f' : papel === 'automacao' ? 'au' : 'c');
  const ativo = b.ativo !== false;
  let pass = null, novaSenha = null, mustReset = true;
  if (papel === 'automacao') {
    // sem tela de troca de senha: o admin escolhe a senha agora (ela só é obrigatória criando ou pedindo troca)
    if (cur && b.senha == null) { pass = null; } else {
      const problema = passwordProblem(b.senha, login, 'automacao');
      if (problema) throw httpErr(400, problema);
      pass = await hashPassword(String(b.senha));
    }
    mustReset = false;
  } else if (!cur || b.novaSenha === true) { novaSenha = tempPass(); pass = await hashPassword(novaSenha); }
  await db.query(`insert into users_t(tenant_id,role,login,ref_id,name,pass_hash,must_reset,active) values($1,$2,$3,$4,$5,$6,$8,$7)
    on conflict(tenant_id,role,ref_id) do update set login=excluded.login, name=excluded.name, active=excluded.active,
      pass_hash=coalesce($6,users_t.pass_hash), must_reset=case when $6 is null then users_t.must_reset else excluded.must_reset end, updated_at=now()`,
  [tid, papel, login, refId, nome, pass, ativo, mustReset]);
  if (novaSenha || pass || !ativo) await db.query(`delete from sessions where user_id in (select id from users_t where tenant_id=$1 and role=$2 and ref_id=$3)`, [tid, papel, refId]);
  return { login, nome, papel, password: novaSenha };
}

/* ---------- zerar os dados (só o admin, com a própria senha e digitando ZERAR) ----------
   Para recomeçar a alimentação do zero: apaga saldo inicial, todos os lançamentos (inclusive gaveta de impostos),
   consultas ao StarIA, sacolas e conferências desta empresa, numa transação só (ou apaga tudo, ou nada).
   Mantém as pessoas (acessos e senhas) e o histórico de auditoria (que não se apaga): as ocorrências passam a
   mostrar só o que aconteceu depois do último "zerar", que também aparece lá, com quem fez e quanto foi apagado.
   Sessão de suporte da Central não pode zerar (não é o dono). */
const ZERAR_MAX_ERROS = 5;
async function zerar(tid, user, b) {
  need(user.role, ['admin'], 'Só o administrador pode zerar os dados.');
  if (user.suporte) throw httpErr(403, 'O acesso de suporte da Central não pode zerar os dados da empresa.');
  if (String(b.confirmacao || '').trim().toUpperCase() !== 'ZERAR') throw httpErr(400, 'Para confirmar, digite ZERAR.');
  const chave = 'zerar:u:' + user.id;
  if (await auth.tooMany(chave, ZERAR_MAX_ERROS)) throw httpErr(429, 'Muitas tentativas com a senha errada. Espere 15 minutos.');
  const u = (await db.query('select pass_hash from users_t where id=$1 and tenant_id=$2', [user.id, tid])).rows[0];
  if (!u || !(await auth.verifyPassword(String(b.senha || ''), u.pass_hash))) {
    await auth.hit(chave);
    throw httpErr(400, 'Senha errada.');
  }
  await auth.clearAttempts(chave);
  return db.tx(async t => {
    const n = {};
    n.lancamentos = (await t.query('delete from caixa_mov where tenant_id=$1', [tid])).rowCount;
    n.caixas = (await t.query('delete from caixa_linha where tenant_id=$1', [tid])).rowCount;
    n.crediarios = (await t.query('delete from caixa_credi where tenant_id=$1', [tid])).rowCount;
    n.sacolas = (await t.query('delete from caixa_sacola where tenant_id=$1', [tid])).rowCount;
    n.consultas = (await t.query('delete from caixa_jobs where tenant_id=$1', [tid])).rowCount;
    n.conferencias = (await t.query('delete from caixa_conferencia where tenant_id=$1', [tid])).rowCount;
    n.saldoInicial = (await t.query('delete from caixa_cfg where tenant_id=$1', [tid])).rowCount;
    return { apagados: n };
  });
}

/* ---------- rotas /api/caixa/* ----------
   'automacao': acesso de uso só pelo Claude, para a importação noturna do StarIA (entrega o resultado do mesmo
   jeito que o admin — a consulta já fica "aplicada" na hora, em sacolas; quem revisa agora é o financeiro, sacola
   por sacola, não mais a consulta). Só pode pedir e entregar a consulta: não vê saldo, extrato, pessoas nem
   ocorrências — o mínimo necessário, mesmo sendo uma senha guardada fora do app. */
async function handle(ctx) {
  const { path, method, user, tid, user: { role }, body, audit } = ctx;
  if (!['admin', 'caixista', 'financeiro', 'automacao'].includes(role)) throw httpErr(403, 'Só o administrador ou quem tem acesso a este caixa.');
  if (role === 'automacao' && !(method === 'POST' && (path === '/api/caixa/staria/pedir' || path === '/api/caixa/staria/resultado'))) {
    throw httpErr(403, 'Este acesso só pede e entrega a consulta ao StarIA.');
  }
  if (path === '/api/caixa/state' && method === 'GET') {
    const st = await state(tid, role, user);
    const pess = role === 'admin' ? await pessoas(tid) : [];
    const oc = role === 'admin' ? await ocorrencias(tid, user) : {};
    return Object.assign({ me: { nome: user.name || user.login, login: user.login, role }, pessoas: pess }, st, oc);
  }
  if (path === '/api/caixa/ocorrencias' && method === 'GET') {
    if (role !== 'admin') throw httpErr(403, 'Só o administrador vê as ocorrências.');
    return ocorrencias(tid, user);
  }
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = await body();
  let out;
  switch (path) {
    case '/api/caixa/cfg': out = await saveCfg(tid, user, b); await audit('caixa_cfg', { saldoInicial: b.saldoInicial }); break;
    case '/api/caixa/sangria': out = await saveSangria(tid, user, b); await audit('caixa_sangria', { id: out.id, valor: b.valor, destino: b.destino }); break;
    case '/api/caixa/ajuste': out = await saveAjuste(tid, user, b); await audit('caixa_ajuste', { id: out.id, valor: b.valor }); break;
    case '/api/caixa/conferir': out = await conferir(tid, user, b); await audit('caixa_conferencia', { id: out.id, diferenca: out.diferenca }); break;
    case '/api/caixa/gaveta-saida': out = await saveGavetaSaida(tid, user, b); await audit('caixa_gaveta_saida', { id: out.id, valor: b.valor }); break;
    case '/api/caixa/depositado': out = await marcarDepositado(tid, user, b); await audit('caixa_depositado', { id: b.id }); break;
    case '/api/caixa/mov/excluir': out = await delMov(tid, user, b); await audit('caixa_mov_excluido', { id: b.id }); break;
    case '/api/caixa/staria/pedir': out = await pedirConsulta(tid, user, b); await audit('caixa_staria_pedir', { id: out.id, periodo: [out.periodoIni, out.periodoFim] }); break;
    case '/api/caixa/staria/resultado': out = await entregarResultado(tid, user, b); await audit('caixa_staria_resultado', { id: b.id }); break;
    case '/api/caixa/credi/forma': out = await salvarFormas(tid, user, b); await audit('caixa_credi_forma', { alteradas: out.alteradas }); break;
    case '/api/caixa/credi/banco': out = await conferirBanco(tid, user, b); await audit('caixa_credi_banco', { conferidos: out.conferidos, total: out.total, resultado: out.resultado }); break;
    case '/api/caixa/caixas/aceitar': out = await aceitarLinhas(tid, user, b); await audit('caixa_caixas_aceitos', { caixas: out.caixas, total: out.total }); break;
    case '/api/caixa/sacola/chegou': out = await marcarChegada(tid, user, b); await audit('caixa_sacola_chegou', { id: b.id }); break;
    case '/api/caixa/sacola/checar': out = await checarSacola(tid, user, b); await audit('caixa_sacola_checada', { id: out.id, bateu: out.bateu }); break;
    case '/api/caixa/sacola/conferir': out = await conferirSacola(tid, user, b); await audit('caixa_sacola_conferida', { id: out.id, diferenca: out.diferenca }); break;
    case '/api/caixa/pessoa': out = await savePessoa(tid, user, b); await audit('caixa_pessoa', { login: out.login, papel: out.papel }); break;
    case '/api/caixa/zerar': out = await zerar(tid, user, b); await audit('caixa_zerado', out.apagados); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, state, saveCfg, saveSangria, saveGavetaSaida, saveAjuste, marcarDepositado, delMov, pedirConsulta, entregarResultado, marcarChegada, conferirSacola, pessoas, savePessoa, conferir, ocorrencias, zerar, entregarLinhas, aceitarLinhas };

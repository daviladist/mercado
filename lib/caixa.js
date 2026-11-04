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
 * navegador já logado do dono) consulta o StarIA e devolve o total do período (coleção caixa_jobs, como o
 * loja_staria do app da loja online). O dono revisa o número antes de aplicar.
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

async function state(tid, role) {
  const [cfgR, movR, jobR, pfR, sacRows] = await Promise.all([
    db.query('select * from caixa_cfg where tenant_id=$1', [tid]),
    db.query('select * from caixa_mov where tenant_id=$1 order by data desc, created_at desc limit 500', [tid]),
    db.query(`select * from caixa_jobs where tenant_id=$1 order by created_at desc limit 50`, [tid]),
    // relatório por filial: de TODOS os venda_staria/crediario_staria (não só os últimos 500 do extrato acima),
    // senão some com filiais antigas conforme o tenant acumula lançamentos
    db.query(`select tipo, status, detalhe from caixa_mov where tenant_id=$1 and caixa='principal' and tipo in ('venda_staria','crediario_staria')`, [tid]),
    db.query(`select * from caixa_sacola where tenant_id=$1 order by conferido_em is null desc, created_at desc limit 300`, [tid]).then(r => r.rows)
  ]);
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
    sacolas: sacRows.map(sacolaOut),
    miniCaixas
  };
  // gaveta de impostos: assunto só do dono, nem o saldo nem os lançamentos dela aparecem para caixista/financeiro
  if (role === 'admin') {
    out.saldoImpostos = r2(somaPorCaixa.impostos);
    out.movImpostos = movsTodos.filter(m => m.caixa === 'impostos');
  }
  return out;
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
    return { id, saldoEsperado, diferenca };
  });
}

/* ---------- ocorrências (só admin): toda conferência com diferença, e tudo que foi apagado, alterado ou
   aprovado/rejeitado no caixa — inclusive pelo próprio admin, com a própria senha, para dar transparência e
   segurança a quem trabalha com o dinheiro. É só leitura: nada aqui se edita ou se apaga. */
const ACOES_OCORRENCIA = ['caixa_mov_excluido', 'caixa_ajuste', 'caixa_cfg', 'caixa_pessoa', 'caixa_staria_pedir', 'caixa_staria_resultado', 'caixa_zerado'];
const TITULO_ACAO = {
  caixa_mov_excluido: 'Lançamento apagado', caixa_ajuste: 'Ajuste lançado', caixa_cfg: 'Saldo inicial alterado',
  caixa_pessoa: 'Acesso criado ou alterado',
  caixa_staria_pedir: 'Consulta ao StarIA pedida', caixa_staria_resultado: 'Consulta ao StarIA aplicada, em sacolas por filial',
  caixa_zerado: 'Dados do caixa zerados (recomeço do zero)'
};
async function ocorrencias(tid, user) {
  need(user.role, ['admin'], 'Função não disponível para o seu acesso.');
  // lib/pg.js não converte um array JS em array do Postgres num parâmetro $n (vira texto/JSON errado); como a
  // lista de ações é fixa e nunca vem do usuário, usamos ela literal no SQL em vez de ligar como parâmetro.
  const acoesLit = ACOES_OCORRENCIA.map(a => `'${a}'`).join(',');
  const [confR, sacR, audR] = await Promise.all([
    db.query(`select * from caixa_conferencia where tenant_id=$1 and diferenca<>0 order by created_at desc limit 200`, [tid]),
    db.query(`select * from caixa_sacola where tenant_id=$1 and conferido_em is not null and (diferenca<>0 or credi_diferenca<>0) order by conferido_em desc limit 200`, [tid]),
    // depois de um "zerar", só conta o que veio dele em diante (o próprio "zerar" inclusive): o histórico de
    // auditoria continua guardado, mas as ocorrências de antes eram de dados que não existem mais
    db.query(`select action, detail, role, at from audit where tenant_id=$1 and action in (${acoesLit})
      and at >= coalesce((select max(at) from audit where tenant_id=$1 and action='caixa_zerado'), '-infinity'::timestamptz)
      order by at desc limit 200`, [tid])
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
  return { ocorrencias: confs.concat(sacs, auds).sort((x, y) => new Date(y.em) - new Date(x.em)).slice(0, 300) };
}

/* marca (ou desmarca) quando uma sangria de fato chegou ao banco: não muda o saldo (ela já tinha saído do caixa) */
async function marcarDepositado(tid, user, b) {
  need(user.role, ['admin', 'caixista', 'financeiro'], 'Função não disponível para o seu acesso.');
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
    const crediDiferenca = r2(crediTotal - Number(s.credi_staria));
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
    return { id, diferenca, crediDiferenca, movId, crediMovId };
  });
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
    const st = await state(tid, role);
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
    case '/api/caixa/staria/pedir': out = await pedirConsulta(tid, user, b); await audit('caixa_staria_pedir', { id: out.id, periodo: [b.periodoIni, b.periodoFim] }); break;
    case '/api/caixa/staria/resultado': out = await entregarResultado(tid, user, b); await audit('caixa_staria_resultado', { id: b.id }); break;
    case '/api/caixa/sacola/chegou': out = await marcarChegada(tid, user, b); await audit('caixa_sacola_chegou', { id: b.id }); break;
    case '/api/caixa/sacola/conferir': out = await conferirSacola(tid, user, b); await audit('caixa_sacola_conferida', { id: out.id, diferenca: out.diferenca }); break;
    case '/api/caixa/pessoa': out = await savePessoa(tid, user, b); await audit('caixa_pessoa', { login: out.login, papel: out.papel }); break;
    case '/api/caixa/zerar': out = await zerar(tid, user, b); await audit('caixa_zerado', out.apagados); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, state, saveCfg, saveSangria, saveGavetaSaida, saveAjuste, marcarDepositado, delMov, pedirConsulta, entregarResultado, marcarChegada, conferirSacola, pessoas, savePessoa, conferir, ocorrencias, zerar };

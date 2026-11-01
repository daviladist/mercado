'use strict';
/*
 * Tino Produtor rural — app do produtor (outro segmento, ramo 'rural'), no mesmo sistema e no mesmo banco.
 * Cada roça é um projeto independente: parceria (meeiros com % sobre o VALOR VENDIDO, bruto),
 * regras de quem paga cada tipo de despesa, vendas, despesas, adiantamentos e acerto com o meeiro.
 *
 * Regras que valem SEMPRE aqui no servidor:
 *  - só o administrador da empresa usa; módulo desligado na Central = o servidor recusa a gravação;
 *  - a parte de cada um na VENDA é tirada da parceria da roça no dia (o aparelho não escolhe);
 *  - a divisão de uma despesa só aceita quem é da roça (dono + meeiros dela) e precisa somar 100%;
 *  - o acerto é recalculado aqui, numa transação, com os lançamentos travados; se algo mudou desde
 *    a prévia, o acerto é recusado para a pessoa conferir de novo; lançamento acertado não muda nem sai.
 * O "dono" das divisões é a própria empresa (o nome cadastrado na Central, ex.: Pisaia).
 * Tabelas: rural_pessoas, rural_rocas, rural_veiculos, rural_lanc, rural_acertos, rural_seq.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');

const httpErr = store.httpErr;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const MAX_VALOR = 50000000;

/* tipos de despesa (o app mostra com ícone; "outros" pede uma descrição) */
const CATS = [
  { id: 'adubo', nome: 'Adubo', icone: '🌱' },
  { id: 'defensivo', nome: 'Defensivo / veneno', icone: '🧪' },
  { id: 'matamato', nome: 'Mata-mato', icone: '🌿' },
  { id: 'mudas', nome: 'Sementes e mudas', icone: '🌾' },
  { id: 'salario', nome: 'Salário', icone: '👷' },
  { id: 'diarista', nome: 'Diarista / empreita', icone: '🧑‍🌾' },
  { id: 'combustivel', nome: 'Combustível', icone: '⛽' },
  { id: 'manutencao', nome: 'Manutenção e peças', icone: '🔧' },
  { id: 'energia', nome: 'Energia elétrica', icone: '⚡' },
  { id: 'frete', nome: 'Frete', icone: '🚚' },
  { id: 'embalagem', nome: 'Caixas e embalagens', icone: '📦' },
  { id: 'ferramentas', nome: 'Ferramentas', icone: '🛠️' },
  { id: 'impostos', nome: 'Impostos e taxas', icone: '🧾' },
  { id: 'outros', nome: 'Outros', icone: '➕' }
];
const CAT_IDS = CATS.map(c => c.id);
const UNIDADES = ['caixa', 'kg', 'saca', 'cacho', 'tonelada', 'arroba', 'litro', 'unidade'];
const MODOS = ['funcionarios', 'meeiro', 'misto'];

/* ---------- limpeza do que chega ---------- */
const ID_RE = { pessoa: /^p[a-f0-9]{12}$/, roca: /^r[a-f0-9]{12}$/, veiculo: /^v[a-f0-9]{12}$/, lanc: /^l[a-f0-9]{16}$/ };
function idOf(kind, v, label) {
  const s = String(v == null ? '' : v);
  if (!ID_RE[kind].test(s)) throw httpErr(400, (label || 'Cadastro') + ' inválido.');
  return s;
}
function txt(v, max, label, required) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (required && s.length < 2) throw httpErr(400, label + ': escreva pelo menos 2 letras.');
  return s || null;
}
function num(v, label, { min = 0, max = MAX_VALOR, required = false, gt = false } = {}) {
  if (v === '' || v == null) { if (required) throw httpErr(400, label + ': informe o valor.'); return null; }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n) || n < min || n > max || (gt && !(n > 0))) throw httpErr(400, label + ' inválido.');
  return n;
}
function dateOf(v, label, required) {
  if (v == null || v === '') { if (required) throw httpErr(400, (label || 'Data') + ': informe a data.'); return null; }
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1990 || d.getTime() > Date.now() + 400 * 864e5) throw httpErr(400, (label || 'Data') + ' inválida.');
  return s;
}
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/* divisão em %: chaves 'dono' e meeiros da roça; soma 100 (com folga de centavos) */
function cleanPartes(p, allowed, label) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw httpErr(400, (label || 'Divisão') + ' inválida.');
  const out = {}; let soma = 0;
  for (const [k, v] of Object.entries(p)) {
    if (!allowed.includes(k)) throw httpErr(400, (label || 'Divisão') + ': pessoa que não é desta roça.');
    const n = Number(v);
    if (!isFinite(n) || n < 0 || n > 100) throw httpErr(400, (label || 'Divisão') + ': porcentagem inválida.');
    if (n > 0) { out[k] = Math.round(n * 100) / 100; soma += out[k]; }
  }
  if (Math.abs(soma - 100) > 0.011) throw httpErr(400, (label || 'Divisão') + ': as partes precisam somar 100%.');
  return out;
}
/* parceria da roça -> divisão da venda: dono fica com o que sobra */
function vendaPartes(parceria) {
  const out = {}; let soma = 0;
  for (const [k, v] of Object.entries(parceria || {})) { const n = Number(v) || 0; if (n > 0) { out[k] = n; soma += n; } }
  const dono = Math.round((100 - soma) * 100) / 100;
  if (dono > 0) out.dono = dono;
  return out;
}

/* ---------- leitura ---------- */
const rocaOut = r => ({ id: r.id, nome: r.nome, cultura: r.cultura, local: r.local, area: r.area, inicio: r.inicio, modo: r.modo, parceria: r.parceria || {}, regras: r.regras || {}, obs: r.obs, ativa: r.ativa });
const pessoaOut = p => ({ id: p.id, tipo: p.tipo, nome: p.nome, documento: p.documento, telefone: p.telefone, salario: p.salario == null ? null : Number(p.salario), rocaId: p.roca_id, obs: p.obs, ativo: p.ativo });
const veicOut = v => ({ id: v.id, nome: v.nome, tipo: v.tipo, placa: v.placa, ativo: v.ativo });
const lancOut = l => ({
  id: l.id, tipo: l.tipo, rocaId: l.roca_id, data: l.data, categoria: l.categoria, descricao: l.descricao, valor: Number(l.valor),
  qtd: l.qtd == null ? null : Number(l.qtd), unidade: l.unidade, preco: l.preco == null ? null : Number(l.preco), comprador: l.comprador,
  pessoaId: l.pessoa_id, pessoaNome: l.pessoa_nome, dias: l.dias == null ? null : Number(l.dias), veiculoId: l.veiculo_id,
  partes: l.partes || {}, acertos: l.acertos || {}, criadoEm: l.created_at
});
const acertoOut = a => ({ id: a.id, numero: Number(a.numero), rocaId: a.roca_id, pessoaId: a.pessoa_id, pessoaNome: a.pessoa_nome, data: a.data, vendas: Number(a.vendas), parte: Number(a.parte), despesas: Number(a.despesas), adiantamentos: Number(a.adiantamentos), saldo: Number(a.saldo), itens: a.itens, obs: a.obs, criadoPor: a.criado_por, criadoEm: a.created_at, desfeitoEm: a.desfeito_em });

async function getRoca(q, tid, id) {
  const r = await q('select * from rural_rocas where tenant_id=$1 and id=$2', [tid, id]);
  if (!r.rows[0]) throw httpErr(404, 'Roça não encontrada.');
  return r.rows[0];
}
async function getPessoa(q, tid, id, tipo) {
  const r = await q('select * from rural_pessoas where tenant_id=$1 and id=$2', [tid, id]);
  const p = r.rows[0];
  if (!p || (tipo && p.tipo !== tipo)) throw httpErr(404, (tipo === 'funcionario' ? 'Funcionário' : tipo === 'meeiro' ? 'Meeiro' : 'Pessoa') + ' não encontrado.');
  return p;
}
async function state(tid) {
  const [rocas, pessoas, veiculos, lanc, acertos] = await Promise.all([
    db.query('select * from rural_rocas where tenant_id=$1 order by ativa desc, created_at', [tid]),
    db.query('select * from rural_pessoas where tenant_id=$1 order by ativo desc, nome', [tid]),
    db.query('select * from rural_veiculos where tenant_id=$1 order by ativo desc, nome', [tid]),
    db.query('select * from rural_lanc where tenant_id=$1 order by data desc, created_at desc', [tid]),
    db.query('select * from rural_acertos where tenant_id=$1 order by created_at desc', [tid])
  ]);
  return { rocas: rocas.rows.map(rocaOut), pessoas: pessoas.rows.map(pessoaOut), veiculos: veiculos.rows.map(veicOut), lanc: lanc.rows.map(lancOut), acertos: acertos.rows.map(acertoOut) };
}

/* ---------- acerto com o meeiro (sempre calculado aqui) ----------
   Entra o que ainda não foi acertado POR ESSA PESSOA nesta roça:
   + parte dela nas vendas (retrato da parceria no dia da venda)
   - parte dela nas despesas
   - adiantamentos feitos a ela
   Saldo > 0: o dono paga ao meeiro. Saldo < 0: o meeiro deve ao dono. */
async function acertoCalc(q, tid, rocaId, pid, lock) {
  const r = await q(`select * from rural_lanc where tenant_id=$1 and roca_id=$2 and not (acertos ? $3)
      and ((tipo in ('venda','despesa') and coalesce((partes->>$3)::numeric,0) > 0) or (tipo='adiantamento' and pessoa_id=$3))
      order by data, created_at${lock ? ' for update' : ''}`, [tid, rocaId, pid]);
  let vendas = 0, parte = 0, despesas = 0, adiant = 0;
  const itens = r.rows.map(l => {
    const pct = Number((l.partes || {})[pid]) || 0, v = Number(l.valor);
    let valorPessoa = 0;
    if (l.tipo === 'venda') { valorPessoa = r2(v * pct / 100); vendas += v; parte += valorPessoa; }
    else if (l.tipo === 'despesa') { valorPessoa = r2(v * pct / 100); despesas += valorPessoa; }
    else { valorPessoa = v; adiant += v; }
    return Object.assign(lancOut(l), { pct, valorPessoa });
  });
  const t = { vendas: r2(vendas), parte: r2(parte), despesas: r2(despesas), adiantamentos: r2(adiant) };
  t.saldo = r2(t.parte - t.despesas - t.adiantamentos);
  return { itens, totais: t, assinatura: crypto.createHash('sha256').update(itens.map(i => i.id + ':' + i.valorPessoa).join('|')).digest('hex').slice(0, 24) };
}

/* ---------- gravações ---------- */
function need(T, code, msg) { if (!T.modules[code]) throw httpErr(403, msg || 'Função desligada para esta empresa.'); }

async function savePessoa(tid, T, b) {
  const id = idOf('pessoa', b.id);
  const tipo = String(b.tipo || '');
  if (!['meeiro', 'funcionario'].includes(tipo)) throw httpErr(400, 'Tipo de pessoa inválido.');
  need(T, tipo === 'meeiro' ? 'r_meeiros' : 'r_funcionarios', tipo === 'meeiro' ? 'Meeiros estão desligados para esta empresa.' : 'Funcionários estão desligados para esta empresa.');
  const nome = txt(b.nome, 80, 'Nome', true);
  const salario = tipo === 'funcionario' ? num(b.salario, 'Salário', { max: 1000000 }) : null;
  const rocaId = tipo === 'funcionario' && b.rocaId ? idOf('roca', b.rocaId, 'Roça') : null;
  if (rocaId) await getRoca((a, p) => db.query(a, p), tid, rocaId);
  const ativo = b.ativo !== false;
  const cur = (await db.query('select tipo from rural_pessoas where tenant_id=$1 and id=$2', [tid, id])).rows[0];
  if (cur && cur.tipo !== tipo) throw httpErr(400, 'Não dá para trocar o tipo da pessoa.');
  await db.query(`insert into rural_pessoas(tenant_id,id,tipo,nome,documento,telefone,salario,roca_id,obs,ativo) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict(tenant_id,id) do update set nome=excluded.nome, documento=excluded.documento, telefone=excluded.telefone, salario=excluded.salario, roca_id=excluded.roca_id, obs=excluded.obs, ativo=excluded.ativo, updated_at=now()`,
  [tid, id, tipo, nome, txt(b.documento, 20), txt(b.telefone, 30), salario, rocaId, txt(b.obs, 300), ativo]);
  return { id, novo: !cur };
}

async function saveVeiculo(tid, T, b) {
  need(T, 'r_veiculos', 'Veículos e máquinas estão desligados para esta empresa.');
  const id = idOf('veiculo', b.id);
  await db.query(`insert into rural_veiculos(tenant_id,id,nome,tipo,placa,ativo) values($1,$2,$3,$4,$5,$6)
    on conflict(tenant_id,id) do update set nome=excluded.nome, tipo=excluded.tipo, placa=excluded.placa, ativo=excluded.ativo, updated_at=now()`,
  [tid, id, txt(b.nome, 60, 'Nome', true), txt(b.tipo, 30), txt(b.placa, 10), b.ativo !== false]);
  return { id };
}

async function saveRoca(tid, T, b) {
  const id = idOf('roca', b.id);
  const nome = txt(b.nome, 60, 'Nome da roça', true);
  let modo = String(b.modo || 'funcionarios');
  if (!MODOS.includes(modo)) throw httpErr(400, 'Jeito de tocar a roça inválido.');
  if (!T.modules.r_meeiros && modo !== 'funcionarios') throw httpErr(403, 'Meeiros estão desligados para esta empresa.');
  // parceria: só meeiros cadastrados e ativos; o dono fica com o que sobra
  const parceria = {};
  if (modo !== 'funcionarios') {
    const p = b.parceria && typeof b.parceria === 'object' && !Array.isArray(b.parceria) ? b.parceria : {};
    const ids = Object.keys(p);
    if (!ids.length) throw httpErr(400, 'Escolha pelo menos um meeiro e a porcentagem dele.');
    if (ids.length > 10) throw httpErr(400, 'Meeiros demais numa roça.');
    let soma = 0;
    for (const pid of ids) {
      idOf('pessoa', pid, 'Meeiro');
      const pe = await getPessoa((a, x) => db.query(a, x), tid, pid, 'meeiro');
      if (!pe.ativo) throw httpErr(400, pe.nome + ' está inativo.');
      const n = Number(p[pid]);
      if (!isFinite(n) || n <= 0 || n > 100) throw httpErr(400, 'Porcentagem de ' + pe.nome + ' inválida.');
      parceria[pid] = Math.round(n * 100) / 100; soma += parceria[pid];
    }
    if (soma > 100.001) throw httpErr(400, 'As porcentagens dos meeiros passam de 100%.');
  }
  // regras de quem paga cada tipo de despesa (sem regra = o dono paga)
  const regras = {};
  const allowed = ['dono'].concat(Object.keys(parceria));
  const rg = b.regras && typeof b.regras === 'object' && !Array.isArray(b.regras) ? b.regras : {};
  for (const [cat, partes] of Object.entries(rg)) {
    if (!CAT_IDS.includes(cat)) throw httpErr(400, 'Tipo de despesa desconhecido.');
    if (Object.keys(parceria).length) regras[cat] = cleanPartes(partes, allowed, 'Quem paga ' + CATS.find(c => c.id === cat).nome);
  }
  await db.query(`insert into rural_rocas(tenant_id,id,nome,cultura,local,area,inicio,modo,parceria,regras,obs,ativa) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
    on conflict(tenant_id,id) do update set nome=excluded.nome, cultura=excluded.cultura, local=excluded.local, area=excluded.area, inicio=excluded.inicio, modo=excluded.modo,
      parceria=excluded.parceria, regras=excluded.regras, obs=excluded.obs, ativa=excluded.ativa, updated_at=now()`,
  [tid, id, nome, txt(b.cultura, 40), txt(b.local, 80), txt(b.area, 40), dateOf(b.inicio, 'Início'), modo, JSON.stringify(parceria), JSON.stringify(regras), txt(b.obs, 300), b.ativa !== false]);
  return { id };
}

/* monta e confere um lançamento (sem gravar) */
async function buildLanc(tid, T, b, user) {
  const q = (a, p) => db.query(a, p);
  const id = idOf('lanc', b.id, 'Lançamento');
  const tipo = String(b.tipo || '');
  if (!['venda', 'despesa', 'adiantamento'].includes(tipo)) throw httpErr(400, 'Tipo de lançamento inválido.');
  const data = dateOf(b.data, 'Data', true);
  const L = { id, tipo, data, roca_id: null, categoria: null, descricao: txt(b.descricao, 200), valor: null, qtd: null, unidade: null, preco: null, comprador: null, pessoa_id: null, pessoa_nome: null, dias: null, veiculo_id: null, partes: {}, criado_por: user.name || user.login };
  const roca = b.rocaId ? await getRoca(q, tid, idOf('roca', b.rocaId, 'Roça')) : null;
  if (roca) L.roca_id = roca.id;
  const parceria = roca && T.modules.r_meeiros ? (roca.parceria || {}) : {};

  if (tipo === 'venda') {
    if (!roca) throw httpErr(400, 'Escolha de qual roça foi a venda.');
    L.qtd = num(b.qtd, 'Quantidade', { max: 10000000 });
    L.unidade = b.unidade ? String(b.unidade) : null;
    if (L.unidade && !UNIDADES.includes(L.unidade)) throw httpErr(400, 'Unidade inválida.');
    L.preco = num(b.preco, 'Preço', { max: 10000000 });
    L.valor = r2(num(b.valor, 'Valor da venda', { required: true, gt: true }));
    // valor sempre bate com quantidade × preço quando os dois vieram
    if (L.qtd && L.preco && Math.abs(r2(L.qtd * L.preco) - L.valor) > 0.05) throw httpErr(400, 'O total não bate com quantidade × preço. Confira.');
    L.comprador = txt(b.comprador, 80);
    L.categoria = null;
    L.partes = vendaPartes(parceria); // a parte de cada um vem da parceria da roça, nunca do aparelho
    if (!Object.keys(L.partes).length) L.partes = { dono: 100 };
  } else if (tipo === 'adiantamento') {
    need(T, 'r_meeiros', 'Meeiros estão desligados para esta empresa.');
    if (!roca) throw httpErr(400, 'Escolha a roça do meeiro.');
    const pid = idOf('pessoa', b.pessoaId, 'Meeiro');
    if (!Object.prototype.hasOwnProperty.call(parceria, pid)) throw httpErr(400, 'Esse meeiro não é desta roça.');
    const pe = await getPessoa(q, tid, pid, 'meeiro');
    L.pessoa_id = pid; L.pessoa_nome = pe.nome;
    L.valor = r2(num(b.valor, 'Valor', { required: true, gt: true }));
    L.descricao = L.descricao || 'Adiantamento';
  } else {
    const cat = String(b.categoria || '');
    if (!CAT_IDS.includes(cat)) throw httpErr(400, 'Escolha o tipo da despesa.');
    L.categoria = cat;
    if (cat === 'outros' && !L.descricao) throw httpErr(400, 'Em "Outros", escreva o que foi.');
    L.valor = r2(num(b.valor, 'Valor', { required: true, gt: true }));
    if (b.veiculoId) {
      need(T, 'r_veiculos', 'Veículos e máquinas estão desligados para esta empresa.');
      const v = await q('select id from rural_veiculos where tenant_id=$1 and id=$2', [tid, idOf('veiculo', b.veiculoId, 'Veículo')]);
      if (!v.rows[0]) throw httpErr(404, 'Veículo não encontrado.');
      L.veiculo_id = b.veiculoId;
    }
    if (cat === 'salario') {
      need(T, 'r_funcionarios', 'Funcionários estão desligados para esta empresa.');
      if (b.pessoaId) { const pe = await getPessoa(q, tid, idOf('pessoa', b.pessoaId, 'Funcionário'), 'funcionario'); L.pessoa_id = pe.id; L.pessoa_nome = pe.nome; }
    }
    if (cat === 'diarista') {
      need(T, 'r_diaristas', 'Diaristas estão desligados para esta empresa.');
      L.pessoa_nome = txt(b.pessoaNome, 80, 'Nome do diarista', true);
      L.dias = num(b.dias, 'Dias', { max: 1000 });
      L.preco = num(b.preco, 'Valor do dia', { max: 100000 });
      if (L.dias && L.preco && Math.abs(r2(L.dias * L.preco) - L.valor) > 0.05) throw httpErr(400, 'O total não bate com dias × valor do dia. Confira.');
    }
    // fora de uma roça = gasto geral (precisa do módulo; veículo e salário sempre podem ser gerais)
    if (!roca && !T.modules.r_gerais && !L.veiculo_id && cat !== 'salario') throw httpErr(400, 'Escolha a roça desta despesa.');
    // quem paga: só gente da roça e somando 100%; sem meeiro na roça (ou gasto geral) = o dono paga tudo
    const allowed = ['dono'].concat(Object.keys(parceria));
    if (allowed.length === 1) L.partes = { dono: 100 };
    else if (b.partes) L.partes = cleanPartes(b.partes, allowed, 'Quem paga');
    else L.partes = (roca.regras || {})[cat] ? cleanPartes(roca.regras[cat], allowed, 'Quem paga') : { dono: 100 };
  }
  return L;
}

async function saveLanc(tid, T, b, user) {
  const L = await buildLanc(tid, T, b, user);
  return db.tx(async t => {
    const cur = (await t.query('select tipo, acertos from rural_lanc where tenant_id=$1 and id=$2 for update', [tid, L.id])).rows[0];
    if (cur && b.novo) return { id: L.id, repetido: true }; // o mesmo lançamento enviado duas vezes grava uma vez
    if (cur && Object.keys(cur.acertos || {}).length) throw httpErr(409, 'Este lançamento já entrou num acerto. Desfaça o acerto para mudar.');
    if (cur && cur.tipo !== L.tipo) throw httpErr(400, 'Não dá para trocar o tipo do lançamento.');
    const cols = ['tipo', 'roca_id', 'data', 'categoria', 'descricao', 'valor', 'qtd', 'unidade', 'preco', 'comprador', 'pessoa_id', 'pessoa_nome', 'dias', 'veiculo_id', 'partes'];
    const vals = cols.map(c => c === 'partes' ? JSON.stringify(L.partes) : L[c]);
    if (cur) {
      await t.query(`update rural_lanc set ${cols.map((c, i) => c + '=$' + (i + 3) + (c === 'partes' ? '::jsonb' : '')).join(',')}, updated_at=now() where tenant_id=$1 and id=$2`, [tid, L.id, ...vals]);
    } else {
      await t.query(`insert into rural_lanc(tenant_id,id,criado_por,${cols.join(',')}) values($1,$2,$3,${cols.map((c, i) => '$' + (i + 4) + (c === 'partes' ? '::jsonb' : '')).join(',')})`, [tid, L.id, L.criado_por, ...vals]);
    }
    return { id: L.id, novo: !cur };
  });
}

async function delLanc(tid, b) {
  const id = idOf('lanc', b.id, 'Lançamento');
  return db.tx(async t => {
    const cur = (await t.query('select acertos from rural_lanc where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!cur) return { id, jaSaiu: true };
    if (Object.keys(cur.acertos || {}).length) throw httpErr(409, 'Este lançamento já entrou num acerto. Desfaça o acerto para excluir.');
    await t.query('delete from rural_lanc where tenant_id=$1 and id=$2', [tid, id]);
    return { id };
  });
}

/* salários do mês de uma vez: uma despesa por funcionário (na roça dele, ou geral) */
async function salarios(tid, T, b, user) {
  need(T, 'r_funcionarios', 'Funcionários estão desligados para esta empresa.');
  const lista = Array.isArray(b.lista) ? b.lista : [];
  if (!lista.length || lista.length > 200) throw httpErr(400, 'Escolha quem vai receber.');
  const ref = txt(b.referencia, 40) || '';
  const feitos = [];
  // confere tudo antes de gravar qualquer um
  const built = [];
  for (const it of lista) {
    const pe = await getPessoa((a, p) => db.query(a, p), tid, idOf('pessoa', it.pessoaId, 'Funcionário'), 'funcionario');
    built.push(await buildLanc(tid, T, { id: it.id, tipo: 'despesa', categoria: 'salario', data: b.data, valor: it.valor, rocaId: pe.roca_id || null, pessoaId: pe.id, descricao: ('Salário ' + ref).trim() }, user));
  }
  await db.tx(async t => {
    for (const L of built) {
      const cols = ['tipo', 'roca_id', 'data', 'categoria', 'descricao', 'valor', 'pessoa_id', 'pessoa_nome', 'partes'];
      const r = await t.query(`insert into rural_lanc(tenant_id,id,criado_por,${cols.join(',')}) values($1,$2,$3,${cols.map((c, i) => '$' + (i + 4) + (c === 'partes' ? '::jsonb' : '')).join(',')}) on conflict do nothing returning id`,
        [tid, L.id, L.criado_por, ...cols.map(c => c === 'partes' ? JSON.stringify(L.partes) : L[c])]);
      if (r.rows[0]) feitos.push(L.id);
    }
  });
  return { n: feitos.length };
}

async function acertar(tid, T, b, user) {
  need(T, 'r_meeiros', 'Meeiros estão desligados para esta empresa.');
  const rocaId = idOf('roca', b.rocaId, 'Roça'), pid = idOf('pessoa', b.pessoaId, 'Meeiro');
  const id = 'a' + crypto.randomBytes(8).toString('hex');
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    await getRoca(q, tid, rocaId);
    const pe = await getPessoa(q, tid, pid, 'meeiro');
    const C = await acertoCalc(q, tid, rocaId, pid, true);
    if (!C.itens.length) throw httpErr(400, 'Não há nada para acertar com ' + pe.nome + ' nesta roça.');
    // mudou alguma coisa desde que a pessoa conferiu? recusa para conferir de novo
    if (String(b.assinatura || '') !== C.assinatura) throw httpErr(409, 'Os lançamentos mudaram desde que você abriu o acerto. Confira de novo.');
    const n = (await q(`insert into rural_seq(tenant_id,tipo,last_no) values($1,'acerto',1) on conflict(tenant_id,tipo) do update set last_no=rural_seq.last_no+1 returning last_no`, [tid])).rows[0].last_no;
    const tt = C.totais;
    await q(`insert into rural_acertos(tenant_id,id,numero,roca_id,pessoa_id,pessoa_nome,data,vendas,parte,despesas,adiantamentos,saldo,itens,obs,criado_por) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [tid, id, n, rocaId, pid, pe.nome, dateOf(b.data, 'Data') || hoje(), tt.vendas, tt.parte, tt.despesas, tt.adiantamentos, tt.saldo, C.itens.length, txt(b.obs, 300), user.name || user.login]);
    await q(`update rural_lanc set acertos=acertos||jsonb_build_object($3::text,$4::text), updated_at=now() where tenant_id=$1 and id = any($2::text[])`, [tid, '{' + C.itens.map(i => i.id).join(',') + '}', pid, id]);
    return { id, numero: Number(n), totais: tt, pessoaNome: pe.nome };
  });
}

async function desfazerAcerto(tid, b, user) {
  const id = String(b.id || '');
  if (!/^a[a-f0-9]{16}$/.test(id)) throw httpErr(400, 'Acerto inválido.');
  return db.tx(async t => {
    const a = (await t.query('select * from rural_acertos where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!a) throw httpErr(404, 'Acerto não encontrado.');
    if (a.desfeito_em) return { id, jaDesfeito: true };
    await t.query(`update rural_lanc set acertos=acertos-$3::text, updated_at=now() where tenant_id=$1 and roca_id=$2 and acertos->>$3::text=$4`, [tid, a.roca_id, a.pessoa_id, id]);
    await t.query('update rural_acertos set desfeito_em=now(), desfeito_por=$3 where tenant_id=$1 and id=$2', [tid, id, user.name || user.login]);
    return { id };
  });
}

/* ---------- rotas /api/rural/* ---------- */
async function handle(ctx) {
  const { path, method, user, tid, T, query, body, audit } = ctx;
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador.');
  if (path === '/api/rural/state' && method === 'GET') {
    return Object.assign({ me: { nome: user.name || user.login, login: user.login }, empresa: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo }, modulos: T.modules, cats: CATS, unidades: UNIDADES }, await state(tid));
  }
  if (path === '/api/rural/acerto/previa' && method === 'GET') {
    need(T, 'r_meeiros', 'Meeiros estão desligados para esta empresa.');
    const rocaId = idOf('roca', query.get('roca'), 'Roça'), pid = idOf('pessoa', query.get('pessoa'), 'Meeiro');
    const q = (a, p) => db.query(a, p);
    await getRoca(q, tid, rocaId); const pe = await getPessoa(q, tid, pid, 'meeiro');
    return Object.assign({ pessoaNome: pe.nome }, await acertoCalc(q, tid, rocaId, pid, false));
  }
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = await body();
  let out;
  switch (path) {
    case '/api/rural/pessoa': out = await savePessoa(tid, T, b); await audit('rural_pessoa', { id: out.id, tipo: b.tipo }); break;
    case '/api/rural/veiculo': out = await saveVeiculo(tid, T, b); await audit('rural_veiculo', { id: out.id }); break;
    case '/api/rural/roca': out = await saveRoca(tid, T, b); await audit('rural_roca', { id: out.id }); break;
    case '/api/rural/lanc': out = await saveLanc(tid, T, b, user); if (!out.repetido) await audit(out.novo ? 'rural_lanc_novo' : 'rural_lanc_alterado', { id: out.id, tipo: b.tipo }); break;
    case '/api/rural/lanc/excluir': out = await delLanc(tid, b); await audit('rural_lanc_excluido', { id: out.id }); break;
    case '/api/rural/salarios': out = await salarios(tid, T, b, user); await audit('rural_salarios', { n: out.n }); break;
    case '/api/rural/acerto': out = await acertar(tid, T, b, user); await audit('rural_acerto', { id: out.id, saldo: out.totais.saldo }); break;
    case '/api/rural/acerto/desfazer': out = await desfazerAcerto(tid, b, user); await audit('rural_acerto_desfeito', { id: out.id }); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, CATS, UNIDADES, vendaPartes, cleanPartes };

'use strict';
/*
 * Tino Produtor rural — app do produtor (outro segmento, ramo 'rural'), no mesmo sistema e no mesmo banco.
 * Cada roça é um projeto independente: cada meeiro tem a PARTE dele (pés, opcional) e ganha a % dele sobre a venda da parte dele
 * (sobre o "valor para o meeiro" que o patrão põe na venda; sem ele, sobre o vendido); a venda diz de quem é (um meeiro, o patrão ou misturado),
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
/* valor em reais: arredonda para centavos e só depois confere que é maior que zero */
function reais(v, label) { const x = r2(num(v, label, { required: true })); if (!(x > 0)) throw httpErr(400, label + ': informe um valor maior que zero.'); return x; }
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
/* culturas com ícone e cor: a roça fica com a cara do que é plantado (banana = 🍌 amarelo, café = ☕ marrom...) */
const CULTURAS = [
  { nome: 'Banana', icone: '🍌', cor: '#E9B10E' }, { nome: 'Café', icone: '☕', cor: '#6F4E37' }, { nome: 'Tomate', icone: '🍅', cor: '#D7322B' },
  { nome: 'Milho', icone: '🌽', cor: '#E8A33D' }, { nome: 'Feijão', icone: '🫘', cor: '#8B3A2E' }, { nome: 'Mamão', icone: '🥭', cor: '#F28C28' },
  { nome: 'Pimenta', icone: '🌶️', cor: '#C0221B' }, { nome: 'Cacau', icone: '🍫', cor: '#5A3A22' }, { nome: 'Coco', icone: '🥥', cor: '#8D6E4E' },
  { nome: 'Laranja', icone: '🍊', cor: '#F39200' }, { nome: 'Limão', icone: '🍋', cor: '#B9C21A' }, { nome: 'Uva', icone: '🍇', cor: '#6B2E7E' },
  { nome: 'Morango', icone: '🍓', cor: '#D62F4B' }, { nome: 'Abacaxi', icone: '🍍', cor: '#C9A21B' }, { nome: 'Melancia', icone: '🍉', cor: '#2E8B4A' },
  { nome: 'Abacate', icone: '🥑', cor: '#5B8C2A' }, { nome: 'Batata', icone: '🥔', cor: '#B08A54' }, { nome: 'Cebola', icone: '🧅', cor: '#A35A8C' },
  { nome: 'Alface', icone: '🥬', cor: '#3E9B3A' }, { nome: 'Cenoura', icone: '🥕', cor: '#E8721C' }, { nome: 'Arroz', icone: '🌾', cor: '#C8A951' },
  { nome: 'Soja', icone: '🌱', cor: '#4C8C2B' }, { nome: 'Cana', icone: '🎋', cor: '#5E9C3A' }, { nome: 'Eucalipto', icone: '🌳', cor: '#2F6B3B' },
  { nome: 'Gado', icone: '🐄', cor: '#6B5A4A' }, { nome: 'Galinhas', icone: '🐔', cor: '#C4612C' }, { nome: 'Leite', icone: '🥛', cor: '#5A8DB8' },
  { nome: 'Outra', icone: '🌿', cor: '#2C5139' }
];
const ICONES = CULTURAS.map(c => c.icone);

/* ---------- limpeza do que chega ---------- */
const ID_RE = { pessoa: /^p[a-f0-9]{12}$/, roca: /^r[a-f0-9]{12}$/, veiculo: /^v[a-f0-9]{12}$/, lanc: /^l[a-f0-9]{16}$/ };
function idOf(kind, v, label) {
  if (typeof v !== 'string') throw httpErr(400, (label || 'Cadastro') + ' inválido.');
  const s = v;
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
  // texto no jeito brasileiro: "1.500" = mil e quinhentos, "1.500,50", "25,5" (número JSON passa direto)
  let t = String(v).trim();
  if (typeof v !== 'number' && !/^-?(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+)$/.test(t)) throw httpErr(400, label + ' inválido.');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = typeof v === 'number' ? v : Number(t);
  if (!isFinite(n) || n < min || n > max || (gt && !(n > 0))) throw httpErr(400, label + ' inválido.');
  return n;
}
function dateOf(v, label, required) {
  if (v == null || v === '') { if (required) throw httpErr(400, (label || 'Data') + ': informe a data.'); return null; }
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1990 || d.getTime() > Date.now() + 2 * 864e5) throw httpErr(400, (label || 'Data') + ' inválida.');
  return s;
}
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/* formas de pagamento da venda. Cheque: vencimento obrigatório, o resto do cheque é opcional. A prazo: data opcional. */
const PAGAMENTOS = [
  { id: 'dinheiro', nome: 'Dinheiro', icone: '💵' },
  { id: 'pix', nome: 'Pix', icone: '⚡' },
  { id: 'cheque', nome: 'Cheque', icone: '🧾' },
  { id: 'transferencia', nome: 'Transferência', icone: '🏦' },
  { id: 'prazo', nome: 'A prazo', icone: '📅' }
];
const PAG_IDS = PAGAMENTOS.map(x => x.id);
/* valor para o meeiro: o patrão vende por um valor (relatórios, pagamento) e põe de cabeça o valor sobre o qual o meeiro
   ganha a parte dele (já descontando frete, caixa…). O meeiro só vê este valor; o vendido de verdade fica com o patrão. */
/* data de vencimento: pode ser no futuro (cheque pré-datado), até 5 anos */
function venceOf(v, label, required, fem) {
  if (v == null || v === '') { if (required) throw httpErr(400, label + ': informe a data.'); return null; }
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCDate() !== +m[3] || +m[1] < 1990 || d.getTime() > Date.now() + 5 * 366 * 864e5) throw httpErr(400, label + (fem ? ' inválida.' : ' inválido.'));
  return s;
}
const CHEQUE_CAMPOS = [['emitente', 80], ['banco', 40], ['agencia', 10], ['conta', 20], ['numero', 20]];
/* pagamento dividido: lista de partes {forma, valor, vence, cheque}; a soma fecha com o total da venda */
const MAX_PARTES_PAG = 24;
function partePag(x, i, n) {
  const lb = n > 1 ? 'Parte ' + (i + 1) + ' do pagamento' : 'Pagamento';
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw httpErr(400, lb + ' inválido.');
  if (typeof x.forma !== 'string' || !PAG_IDS.includes(x.forma)) throw httpErr(400, lb + ': forma de pagamento inválida.');
  const o = { forma: x.forma, valor: null, vence: null, cheque: {} };
  if (x.forma === 'cheque') { o.vence = venceOf(x.vence, (n > 1 ? lb + ': vencimento do cheque' : 'Vencimento do cheque'), true); o.cheque = chequeOf(x.cheque); }
  else if (x.forma === 'prazo') o.vence = venceOf(x.vence, lb + ': data para receber', false, true);
  return o;
}
function pagamentosOf(b, total) {
  const lista = b.pagamentos;
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw httpErr(400, 'Pagamento inválido.');
  if (lista.length > MAX_PARTES_PAG) throw httpErr(400, 'No máximo ' + MAX_PARTES_PAG + ' partes no pagamento.');
  const out = lista.map((x, i) => {
    const o = partePag(x, i, lista.length);
    // uma forma só sem valor = o total da venda
    o.valor = lista.length === 1 && (x.valor == null || x.valor === '') ? total : reais(x.valor, lista.length > 1 ? 'Valor da parte ' + (i + 1) : 'Valor do pagamento');
    return o;
  });
  const soma = out.reduce((a, o) => a + Math.round(o.valor * 100), 0);
  if (out.length && soma !== Math.round(total * 100)) throw httpErr(400, 'As partes do pagamento somam ' + (soma / 100).toFixed(2).replace('.', ',') + ' e a venda é de ' + total.toFixed(2).replace('.', ',') + '. Confira.');
  return out;
}
/* lista gravada (ou a forma única do jeito antigo) */
const pagsDe = l => Array.isArray(l.pagamentos) && l.pagamentos.length ? l.pagamentos : l.pagamento ? [{ forma: l.pagamento, valor: Number(l.valor), vence: l.vence || null, cheque: l.cheque || {} }] : [];
function chequeOf(c) {
  const o = {};
  if (c != null && (typeof c !== 'object' || Array.isArray(c))) throw httpErr(400, 'Dados do cheque inválidos.');
  for (const [k, max] of CHEQUE_CAMPOS) { const v = txt(c && c[k], max); if (v) o[k] = v; }
  return o;
}

/* divisão em %: chaves 'dono' e meeiros da roça; soma 100 (com folga de centavos) */
function cleanPartes(p, allowed, label) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw httpErr(400, (label || 'Divisão') + ' inválida.');
  const out = {}; let soma = 0;
  for (const [k, v] of Object.entries(p)) {
    if (!allowed.includes(k)) throw httpErr(400, (label || 'Divisão') + ': pessoa que não é desta roça.');
    if (typeof v !== 'number') throw httpErr(400, (label || 'Divisão') + ': porcentagem inválida.');
    const n = v;
    if (!isFinite(n) || n < 0 || n > 100) throw httpErr(400, (label || 'Divisão') + ': porcentagem inválida.');
    const c = Math.round(n * 100); // em centésimos de ponto: a soma é conferida sem erro de arredondamento
    if (c > 0) { out[k] = c / 100; soma += c; }
  }
  if (soma !== 10000) throw httpErr(400, (label || 'Divisão') + ': as partes precisam somar exatamente 100%.');
  return out;
}
/* origem da venda: de quem é a produção vendida. [{de: 'dono'|meeiro, qtd?, valor?}]; com mais de uma, diz quanto foi de cada.
   A parte do meeiro na venda = % dele × fração da venda que veio da parte dele; o patrão fica com o resto. */
const MAX_ORIGEM = 61; // até 60 meeiros + a parte do patrão
const r6 = n => Math.round(n * 1e6) / 1e6;
function origemOf(lista, allowed, L, nomeDe) {
  if (!Array.isArray(lista) || !lista.length) throw httpErr(400, 'Diga de quem é esta venda (de qual meeiro ou da parte do patrão).');
  if (lista.length > MAX_ORIGEM) throw httpErr(400, 'Gente demais numa venda só.');
  const vistos = new Set();
  const out = lista.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.de !== 'string') throw httpErr(400, 'De quem é a venda: item ' + (i + 1) + ' inválido.');
    if (!allowed.includes(x.de)) throw httpErr(400, (nomeDe(x.de) || 'Essa pessoa') + ' não é meeiro desta roça.');
    if (vistos.has(x.de)) throw httpErr(400, nomeDe(x.de) + ' aparece duas vezes na venda.');
    vistos.add(x.de);
    return { de: x.de, qtd: x.qtd, valor: x.valor };
  });
  if (out.length === 1) return [{ de: out[0].de }];
  const temQ = out.every(o => o.qtd != null && o.qtd !== ''), temV = out.every(o => o.valor != null && o.valor !== '');
  if (temQ) {
    if (!(L.qtd > 0)) throw httpErr(400, 'Venda misturada por quantidade: informe a quantidade da venda (ou divida por valor).');
    out.forEach(o => { o.qtd = num(o.qtd, 'Quantidade de ' + nomeDe(o.de), { max: 10000000, required: true }); if (!(o.qtd > 0)) throw httpErr(400, 'Quantidade de ' + nomeDe(o.de) + ': informe mais que zero.'); delete o.valor; });
    const soma = out.reduce((a, o) => a + o.qtd, 0);
    if (L.qtd && Math.abs(soma - L.qtd) > 0.0005) throw httpErr(400, 'As quantidades de cada um somam ' + String(r6(soma)).replace('.', ',') + ' e a venda é de ' + String(L.qtd).replace('.', ',') + '. Confira.');
  } else if (temV) {
    out.forEach(o => { o.valor = reais(o.valor, 'Valor de ' + nomeDe(o.de)); delete o.qtd; });
    const soma = out.reduce((a, o) => a + Math.round(o.valor * 100), 0), alvo = Math.round(L.valor * 100);
    if (soma !== alvo) throw httpErr(400, 'Os valores de cada um somam ' + (soma / 100).toFixed(2).replace('.', ',') + ' e a venda é de ' + (alvo / 100).toFixed(2).replace('.', ',') + '. Confira.');
  } else throw httpErr(400, 'Venda misturada: diga quanto foi de cada um (quantidade ou valor).');
  return out;
}
function partesDaOrigem(origem, parceria) {
  const w = origem.map(o => o.qtd != null ? o.qtd : o.valor != null ? o.valor : 1), tot = w.reduce((a, b) => a + b, 0);
  const out = {}; let soma = 0;
  origem.forEach((o, i) => {
    if (o.de === 'dono') return;
    const pct = r6(Number(parceria[o.de]) * w[i] / tot);
    if (pct > 0) { out[o.de] = pct; soma += pct; }
  });
  const dono = r6(100 - soma);
  if (dono > 0) out.dono = dono;
  return out;
}
const mesmaOrigem = (a, b) => JSON.stringify((a || []).map(o => [o.de, o.qtd == null ? null : Number(o.qtd), o.valor == null ? null : Number(o.valor)])) === JSON.stringify((b || []).map(o => [o.de, o.qtd == null ? null : Number(o.qtd), o.valor == null ? null : Number(o.valor)]));

/* venda da colheita: vários tipos do produto (Pepino Top, Pepino Torto…), cada um com caixas, preço de venda e preço para o
   meeiro por caixa, e as caixas de cada um (meeiros e patrão) fechando exato. A % de cada meeiro fica gravada no item (a do dia). */
const MAX_ITENS = 20;
function itensOf(lista, ms, parceria, nomeDe, prevItens) {
  if (!Array.isArray(lista) || !lista.length) throw httpErr(400, 'Coloque pelo menos um tipo na venda.');
  if (lista.length > MAX_ITENS) throw httpErr(400, 'Tipos demais numa venda (no máximo ' + MAX_ITENS + ').');
  const nomesVistos = new Set();
  return lista.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw httpErr(400, 'Tipo ' + (i + 1) + ' inválido.');
    const nome = txt(x.nome, 30);
    if (!nome) throw httpErr(400, 'Dê um nome para o tipo ' + (i + 1) + ' (ex.: Top, Torto).');
    if (nomesVistos.has(nome.toLowerCase())) throw httpErr(400, 'O tipo "' + nome + '" aparece duas vezes.');
    nomesVistos.add(nome.toLowerCase());
    const qtd = num(x.qtd, 'Caixas de ' + nome, { max: 10000000, required: true });
    if (!(qtd > 0)) throw httpErr(400, 'Caixas de ' + nome + ': informe mais que zero.');
    const preco = num(x.preco, 'Preço de venda de ' + nome, { max: 10000000, required: true });
    if (!(preco > 0)) throw httpErr(400, 'Preço de venda de ' + nome + ': informe mais que zero.');
    let pm = x.precoMeeiro == null || x.precoMeeiro === '' ? preco : num(x.precoMeeiro, 'Preço para o meeiro de ' + nome, { max: 10000000, required: true });
    if (!(pm > 0)) throw httpErr(400, 'Preço para o meeiro de ' + nome + ': informe mais que zero.');
    if (pm > preco) throw httpErr(400, nome + ': o preço para o meeiro não pode ser maior que o preço de venda.');
    const prevIt = (prevItens || []).find(p => String(p.nome).toLowerCase() === nome.toLowerCase());
    let origem;
    if (!ms.length && !(prevIt && (prevIt.origem || []).some(o => o.de !== 'dono'))) origem = [{ de: 'dono', qtd }];
    else {
      const og = Array.isArray(x.origem) ? x.origem : null;
      if (!og || !og.length) throw httpErr(400, nome + ': diga quantas caixas são de cada um.');
      const vistos = new Set();
      origem = og.map(o => {
        if (!o || typeof o !== 'object' || typeof o.de !== 'string') throw httpErr(400, nome + ': item inválido.');
        const antigo = prevIt && (prevIt.origem || []).find(p => p.de === o.de);
        if (o.de !== 'dono' && !ms.includes(o.de) && !antigo) throw httpErr(400, (nomeDe(o.de) || 'Essa pessoa') + ' não é meeiro desta roça.');
        if (vistos.has(o.de)) throw httpErr(400, nome + ': ' + nomeDe(o.de) + ' aparece duas vezes.');
        vistos.add(o.de);
        const q = num(o.qtd, nome + ': caixas de ' + nomeDe(o.de), { max: 10000000, required: true });
        if (!(q > 0)) throw httpErr(400, nome + ': caixas de ' + nomeDe(o.de) + ' precisam ser mais que zero.');
        const e = { de: o.de, qtd: q };
        if (o.de !== 'dono') e.pct = antigo && antigo.pct != null ? Number(antigo.pct) : Number(parceria[o.de]); // a % do dia da venda
        return e;
      });
      const soma = r6(origem.reduce((a, o) => a + o.qtd, 0));
      if (Math.abs(soma - qtd) > 0.0005) throw httpErr(400, nome + ': as caixas de cada um somam ' + String(soma).replace('.', ',') + ' e o total é ' + String(qtd).replace('.', ',') + '. Confira.');
    }
    return { nome, qtd, preco, precoMeeiro: pm, origem };
  });
}
/* totais da colheita: vendido, valor para o meeiro e a divisão (em % do valor para o meeiro) */
function contaItens(itens) {
  let valorC = 0, baseC = 0; const amt = {};
  itens.forEach(it => {
    valorC += Math.round(it.qtd * it.preco * 100); baseC += Math.round(it.qtd * it.precoMeeiro * 100);
    it.origem.forEach(o => { if (o.de !== 'dono') amt[o.de] = (amt[o.de] || 0) + o.pct / 100 * o.qtd * it.precoMeeiro; });
  });
  const base = baseC / 100, partes = {}; let soma = 0;
  Object.keys(amt).forEach(k => { const pct = r6(amt[k] / base * 100); if (pct > 0) { partes[k] = pct; soma += pct; } });
  const d = r6(100 - soma); if (d > 0) partes.dono = d;
  return { valor: valorC / 100, base, partes };
}

/* parceria da roça -> divisão da venda de uma roça com UM meeiro (jeito antigo, para telas antigas) */
function vendaPartes(parceria) {
  const out = {}; let soma = 0;
  for (const [k, v] of Object.entries(parceria || {})) { const n = Number(v) || 0; if (n > 0) { out[k] = n; soma += n; } }
  const dono = Math.round((100 - soma) * 100) / 100;
  if (dono > 0) out.dono = dono;
  return out;
}

/* ---------- leitura ---------- */
const rocaOut = r => ({ id: r.id, nome: r.nome, icone: r.icone || null, cultura: r.cultura, local: r.local, area: r.area, inicio: r.inicio, modo: r.modo, parceria: r.parceria || {}, pes: r.pes || {}, produtos: Array.isArray(r.produtos) ? r.produtos : [], regras: r.regras || {}, obs: r.obs, ativa: r.ativa });
const pessoaOut = p => ({ id: p.id, tipo: p.tipo, nome: p.nome, documento: p.documento, telefone: p.telefone, salario: p.salario == null ? null : Number(p.salario), rocaId: p.roca_id, obs: p.obs, ativo: p.ativo });
const veicOut = v => ({ id: v.id, nome: v.nome, tipo: v.tipo, placa: v.placa, ativo: v.ativo });
const lancOut = l => ({
  id: l.id, tipo: l.tipo, rocaId: l.roca_id, data: l.data, categoria: l.categoria, descricao: l.descricao, valor: Number(l.valor),
  qtd: l.qtd == null ? null : Number(l.qtd), unidade: l.unidade, preco: l.preco == null ? null : Number(l.preco), comprador: l.comprador,
  pessoaId: l.pessoa_id, pessoaNome: l.pessoa_nome, dias: l.dias == null ? null : Number(l.dias), veiculoId: l.veiculo_id,
  partes: l.partes || {}, acertos: l.acertos || {}, criadoEm: l.created_at,
  pagamento: l.pagamento || null, vence: l.vence || null, cheque: l.cheque || {}, pagamentos: pagsDe(l),
  origem: Array.isArray(l.origem) ? l.origem : [], itens: Array.isArray(l.itens) ? l.itens : [],
  base: l.base == null ? null : Number(l.base)
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
    const pct = Number((l.partes || {})[pid]) || 0, v = Number(l.tipo === 'venda' && l.base != null ? l.base : l.valor);
    let valorPessoa = 0;
    // venda misturada: o meeiro vê só a parte dele (quantidade e valor da parte dele, com a % dele)
    let frac = 1, qtdParte = null, itensParte = null;
    if (l.tipo === 'venda' && Array.isArray(l.itens) && l.itens.length) {
      itensParte = []; let vC = 0, pctDele = null;
      l.itens.forEach(it => { const o = (it.origem || []).find(x => x.de === pid); if (o) { itensParte.push({ nome: it.nome, qtd: Number(o.qtd), precoMeeiro: Number(it.precoMeeiro) }); vC += Math.round(o.qtd * it.precoMeeiro * 100); if (pctDele == null) pctDele = Number(o.pct); } });
      frac = v > 0 ? vC / 100 / v : 0;
      valorPessoa = r2(v * pct / 100); vendas += vC / 100; parte += valorPessoa;
      const o2 = lancOut(l); ['pagamentos', 'pagamento', 'vence', 'cheque', 'origem', 'base', 'partes', 'preco', 'itens'].forEach(k => { delete o2[k]; });
      return Object.assign(o2, { valor: vC / 100, qtd: r6(itensParte.reduce((a, x) => a + x.qtd, 0)), pct, valorPessoa, valorAcerto: vC / 100, pctParte: pctDele != null ? pctDele : pct, qtdParte: null, itensParte, misturada: true });
    }
    if (l.tipo === 'venda' && Array.isArray(l.origem) && l.origem.length > 1) {
      const w = l.origem.map(o => o.qtd != null ? Number(o.qtd) : o.valor != null ? Number(o.valor) : 0), tot = w.reduce((a, b) => a + b, 0), i = l.origem.findIndex(o => o.de === pid);
      if (i >= 0 && tot > 0) { frac = w[i] / tot; if (l.origem[i].qtd != null) qtdParte = Number(l.origem[i].qtd); }
    }
    if (l.tipo === 'venda') {
      valorPessoa = r2(v * pct / 100); vendas += r2(v * frac); parte += valorPessoa;
      const mist = Array.isArray(l.origem) && l.origem.length > 1, o = lancOut(l);
      ['pagamentos', 'pagamento', 'vence', 'cheque', 'origem', 'base', 'partes', 'preco', 'itens'].forEach(k => { delete o[k]; });
      return Object.assign(o, { valor: r2(v * frac), qtd: mist ? qtdParte : o.qtd, pct, valorPessoa, valorAcerto: r2(v * frac), pctParte: frac > 0 ? r6(pct / frac) : pct, qtdParte, misturada: mist });
    }
    else if (l.tipo === 'despesa') { valorPessoa = r2(v * pct / 100); despesas += valorPessoa; }
    else { valorPessoa = v; adiant += v; }
    return Object.assign(lancOut(l), { pct, valorPessoa, valorAcerto: v }); // valorAcerto: o que o meeiro vê da venda (o valor para o meeiro)
  });
  const t = { vendas: r2(vendas), parte: r2(parte), despesas: r2(despesas), adiantamentos: r2(adiant) };
  t.saldo = r2(t.parte - t.despesas - t.adiantamentos);
  return { itens, totais: t, assinatura: crypto.createHash('sha256').update(itens.map(i => i.id + ':' + i.valorPessoa + ':' + (i.valorAcerto != null ? i.valorAcerto : '') + ':' + (i.pctParte != null ? i.pctParte : '')).join('|')).digest('hex').slice(0, 24) };
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
  // ícone: só os da lista (em branco = o app escolhe pela cultura)
  const semIcone = !Object.prototype.hasOwnProperty.call(b, 'icone'); // sem o campo: fica o ícone gravado
  const icone = semIcone || b.icone == null || b.icone === '' ? null : (typeof b.icone === 'string' && ICONES.includes(b.icone) ? b.icone : (() => { throw httpErr(400, 'Ícone inválido.'); })());
  let modo = String(b.modo || 'funcionarios');
  if (!MODOS.includes(modo)) throw httpErr(400, 'Jeito de tocar a roça inválido.');
  const atual = (await db.query('select modo, parceria, regras from rural_rocas where tenant_id=$1 and id=$2', [tid, id])).rows[0];
  if (!T.modules.r_meeiros && atual && Object.keys(atual.parceria || {}).length) {
    // função desligada: dá para mudar nome, local etc., mas a parceria e as regras gravadas ficam intactas
    await db.query(`update rural_rocas set nome=$3, cultura=$4, local=$5, area=$6, inicio=$7, obs=$8, ativa=$9, icone=case when $11 then icone else $10 end, updated_at=now() where tenant_id=$1 and id=$2`,
      [tid, id, nome, txt(b.cultura, 40), txt(b.local, 80), txt(b.area, 40), dateOf(b.inicio, 'Início'), txt(b.obs, 300), b.ativa !== false, icone, semIcone]);
    return { id };
  }
  if (!T.modules.r_meeiros && modo !== 'funcionarios') throw httpErr(403, 'Meeiros estão desligados para esta empresa.');
  // parceria: só meeiros cadastrados e ativos; cada um tem a % dele sobre a venda da parte dele (não somam entre si)
  const parceria = {}, pes = {};
  if (modo !== 'funcionarios') {
    const p = b.parceria && typeof b.parceria === 'object' && !Array.isArray(b.parceria) ? b.parceria : {};
    const ids = Object.keys(p);
    if (!ids.length) throw httpErr(400, 'Escolha pelo menos um meeiro e a porcentagem dele.');
    if (ids.length > 60) throw httpErr(400, 'Meeiros demais numa roça (no máximo 60).');
    const pp = b.pes && typeof b.pes === 'object' && !Array.isArray(b.pes) ? b.pes : {};
    for (const pid of ids) {
      idOf('pessoa', pid, 'Meeiro');
      const pe = await getPessoa((a, x) => db.query(a, x), tid, pid, 'meeiro');
      if (!pe.ativo) throw httpErr(400, pe.nome + ' está inativo.');
      if (typeof p[pid] !== 'number') throw httpErr(400, 'Porcentagem de ' + pe.nome + ' inválida.');
      const c = Math.round(p[pid] * 100); // arredonda primeiro: pelo menos 0,01%
      if (!isFinite(c) || c < 1 || c > 10000) throw httpErr(400, 'Porcentagem de ' + pe.nome + ' inválida.');
      parceria[pid] = c / 100;
      if (pp[pid] != null && pp[pid] !== '') { const n = pp[pid]; if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100000000) throw httpErr(400, 'Pés de ' + pe.nome + ': use um número inteiro.'); if (n > 0) pes[pid] = n; }
    }
  }
  // regras de quem paga cada tipo de despesa (sem regra = o dono paga)
  const regras = {};
  const allowed = ['dono'].concat(Object.keys(parceria));
  const rg = b.regras && typeof b.regras === 'object' && !Array.isArray(b.regras) ? b.regras : {};
  for (const [cat, partes] of Object.entries(rg)) {
    if (!CAT_IDS.includes(cat)) throw httpErr(400, 'Tipo de despesa desconhecido.');
    if (Object.keys(parceria).length) regras[cat] = cleanPartes(partes, allowed, 'Quem paga ' + CATS.find(c => c.id === cat).nome);
  }
  const semPes = !Object.prototype.hasOwnProperty.call(b, 'pes'); // tela antiga: mantém os pés gravados
  // tipos do produto (Pepino Top, Pepino Torto…) para a venda da colheita
  const semProd = !Object.prototype.hasOwnProperty.call(b, 'produtos'), produtos = [];
  if (!semProd) {
    if (!Array.isArray(b.produtos) || b.produtos.length > MAX_ITENS) throw httpErr(400, 'Tipos do produto inválidos (no máximo ' + MAX_ITENS + ').');
    for (const x of b.produtos) { const n = txt(x, 30); if (!n) throw httpErr(400, 'Tipo do produto sem nome.'); if (produtos.some(p => p.toLowerCase() === n.toLowerCase())) throw httpErr(400, 'O tipo "' + n + '" está repetido.'); produtos.push(n); }
  }
  await db.query(`insert into rural_rocas(tenant_id,id,nome,cultura,local,area,inicio,modo,parceria,regras,obs,ativa,icone,pes,produtos) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$15::jsonb,$17::jsonb)
    on conflict(tenant_id,id) do update set nome=excluded.nome, icone=case when $14 then rural_rocas.icone else excluded.icone end, cultura=excluded.cultura, local=excluded.local, area=excluded.area, inicio=excluded.inicio, modo=excluded.modo,
      parceria=excluded.parceria, regras=excluded.regras, obs=excluded.obs, ativa=excluded.ativa, pes=case when $16 then rural_rocas.pes else excluded.pes end, produtos=case when $18 then rural_rocas.produtos else excluded.produtos end, updated_at=now()`,
  [tid, id, nome, txt(b.cultura, 40), txt(b.local, 80), txt(b.area, 40), dateOf(b.inicio, 'Início'), modo, JSON.stringify(parceria), JSON.stringify(regras), txt(b.obs, 300), b.ativa !== false, icone, semIcone, JSON.stringify(pes), semPes, JSON.stringify(produtos), semProd]);
  return { id };
}

/* monta e confere um lançamento (sem gravar) */
/* prev = o lançamento como está gravado (numa correção). A divisão do dia é mantida:
   corrigir o comprador ou a data de uma venda antiga não a reparte com a parceria de hoje. */
async function buildLanc(tid, T, b, user, prev) {
  const q = (a, p) => db.query(a, p);
  const id = idOf('lanc', b.id, 'Lançamento');
  const tipo = String(b.tipo || '');
  if (!['venda', 'despesa', 'adiantamento'].includes(tipo)) throw httpErr(400, 'Tipo de lançamento inválido.');
  const data = dateOf(b.data, 'Data', true);
  const L = { id, tipo, data, origem: [], itens: [], pagamento: null, vence: null, cheque: {}, pagamentos: [], base: null, roca_id: null, categoria: null, descricao: txt(b.descricao, 200), valor: null, qtd: null, unidade: null, preco: null, comprador: null, pessoa_id: null, pessoa_nome: null, dias: null, veiculo_id: null, partes: {}, criado_por: user.name || user.login };
  const roca = b.rocaId ? await getRoca(q, tid, idOf('roca', b.rocaId, 'Roça')) : null;
  if (roca) L.roca_id = roca.id;
  const parceria = roca && T.modules.r_meeiros ? (roca.parceria || {}) : {};
  const mesmaRoca = !!(prev && prev.tipo === tipo && (prev.roca_id || null) === L.roca_id);
  if (roca && !T.modules.r_meeiros && Object.keys(roca.parceria || {}).length && (tipo === 'venda' || tipo === 'despesa') && !mesmaRoca)
    throw httpErr(403, 'Esta roça tem meeiro, e Meeiros estão desligados para esta empresa. Ligue na Central para lançar nela.');

  if (tipo === 'venda') {
    if (!roca) throw httpErr(400, 'Escolha de qual roça foi a venda.');
    L.unidade = b.unidade ? String(b.unidade) : null;
    if (L.unidade && !UNIDADES.includes(L.unidade)) throw httpErr(400, 'Unidade inválida.');
    const prevItens = prev && prev.tipo === 'venda' && Array.isArray(prev.itens) && prev.itens.length ? prev.itens : null;
    const colheita = Object.prototype.hasOwnProperty.call(b, 'itens') ? Array.isArray(b.itens) && b.itens.length > 0 : !!prevItens;
    let contaC = null;
    if (colheita) {
      if (!Object.prototype.hasOwnProperty.call(b, 'itens')) { // tela antiga corrigindo uma venda da colheita: mantém os tipos e as caixas
        if (!mesmaRoca || (b.valor != null && b.valor !== '' && Math.abs(reais(b.valor, 'Valor vendido') - Number(prev.valor)) > 0.005)) throw httpErr(400, 'Esta venda é da colheita (com tipos e caixas de cada um). Atualize o app (feche e abra de novo) para corrigir.');
        L.itens = prevItens; L.unidade = prev.unidade;
      } else {
        const msC = Object.keys(parceria), nomesC = new Map();
        (await q(`select id, nome from rural_pessoas where tenant_id=$1 and tipo='meeiro'`, [tid])).rows.forEach(p => nomesC.set(p.id, p.nome));
        L.itens = itensOf(b.itens, msC, parceria, k => k === 'dono' ? T.name : nomesC.get(k) || null, mesmaRoca ? prevItens : null);
      }
      contaC = contaItens(L.itens);
      L.valor = contaC.valor; L.qtd = r6(L.itens.reduce((a, it) => a + Number(it.qtd), 0)); L.preco = null;
      if (b.valor != null && b.valor !== '' && Object.prototype.hasOwnProperty.call(b, 'itens') && Math.abs(reais(b.valor, 'Valor vendido') - L.valor) > 0.005) throw httpErr(400, 'O total não bate com caixas × preço de cada tipo. Confira.');
    } else {
      L.qtd = num(b.qtd, 'Quantidade', { max: 10000000 });
      L.preco = num(b.preco, 'Preço', { max: 10000000 });
      L.valor = reais(b.valor, 'Valor vendido');
      // vendido sempre bate com quantidade × preço quando os dois vieram
      if (L.qtd && L.preco && Math.abs(r2(L.qtd * L.preco) - L.valor) > 0.05) throw httpErr(400, 'O total não bate com quantidade × preço. Confira.');
    }
    L.comprador = txt(b.comprador, 80);
    L.categoria = null;
    // forma de pagamento (opcional), em uma ou várias partes (ex.: 3 cheques; parte Pix, parte dinheiro).
    // Cheque exige o vencimento; os dados do cheque são opcionais.
    const tem = k => Object.prototype.hasOwnProperty.call(b, k);
    const prevDiv = prev && prev.tipo === 'venda' && pagsDe(prev).length > 1;
    if (tem('pagamentos')) L.pagamentos = pagamentosOf(b, L.valor);
    else if (prevDiv && tem('pagamento') && b.pagamento != null && b.pagamento !== '') throw httpErr(409, 'Esta venda tem o pagamento dividido em partes. Atualize o app (feche e abra de novo) para mudar o pagamento.');
    else if (tem('pagamento') && !prevDiv) L.pagamentos = b.pagamento == null || b.pagamento === '' ? [] : pagamentosOf({ pagamentos: [{ forma: b.pagamento, vence: b.vence, cheque: b.cheque }] }, L.valor);
    else if (prev && prev.tipo === 'venda') { // tela antiga (sem o campo, ou sem saber de partes) corrigindo a venda: mantém o pagamento gravado
      const pp = pagsDe(prev);
      L.pagamentos = pp.length === 1 ? [Object.assign({}, pp[0], { valor: L.valor })] : pp;
      if (L.pagamentos.length > 1 && L.pagamentos.reduce((a, o) => a + Math.round(Number(o.valor) * 100), 0) !== Math.round(L.valor * 100)) throw httpErr(400, 'O total mudou e o pagamento está dividido em partes. Atualize o app e confira as partes.');
    }
    // colunas antigas espelham o pagamento de uma forma só (para telas antigas)
    if (L.pagamentos.length === 1) { L.pagamento = L.pagamentos[0].forma; L.vence = L.pagamentos[0].vence; L.cheque = L.pagamentos[0].cheque; }
    if (colheita) { // a divisão sai das caixas de cada um em cada tipo
      L.origem = []; L.partes = contaC.partes; L.base = contaC.base === L.valor ? null : contaC.base;
    } else {
    // de quem é a venda: a parte de cada um sai da % dele na parceria da roça NO DIA DA VENDA, nunca do aparelho.
    // Correção na mesma roça com a mesma origem mantém a divisão gravada.
    const ms = Object.keys(parceria);
    // origem gravada; venda de antes da divisão por meeiro: deduz da divisão gravada (um meeiro só, ou só o patrão)
    let prevOrig = mesmaRoca && Array.isArray(prev.origem) ? prev.origem : [];
    if (mesmaRoca && !prevOrig.length) { const ks = Object.keys(prev.partes || {}).filter(k => k !== 'dono'); if (ks.length === 1) prevOrig = [{ de: ks[0] }]; else if (!ks.length) prevOrig = [{ de: 'dono' }]; }
    const nomes = new Map(); if (ms.length || prevOrig.length) (await q(`select id, nome from rural_pessoas where tenant_id=$1 and tipo='meeiro'`, [tid])).rows.forEach(p => nomes.set(p.id, p.nome));
    const nomeDe = k => k === 'dono' ? T.name : nomes.get(k) || null;
    const manter = mesmaRoca && Object.keys(prev.partes || {}).length;
    if (!ms.length) { L.origem = manter && Array.isArray(prev.origem) ? prev.origem : []; L.partes = manter ? prev.partes : { dono: 100 }; } // roça sem meeiro agora (ou função desligada): a venda fica como era
    else if (Object.prototype.hasOwnProperty.call(b, 'origem')) {
      L.origem = origemOf(b.origem, ['dono'].concat(ms).concat(prevOrig.map(o => o.de).filter(k => !ms.includes(k) && k !== 'dono')), L, nomeDe);
      if (manter && mesmaOrigem(L.origem, prevOrig)) L.partes = prev.partes;
      else {
        const fora = L.origem.find(o => o.de !== 'dono' && !ms.includes(o.de));
        if (fora) throw httpErr(400, nomeDe(fora.de) + ' não é mais meeiro desta roça. Tire da venda ou ponha de volta na roça.');
        L.partes = partesDaOrigem(L.origem, parceria);
      }
    }
    else if (manter) { L.origem = prevOrig; L.partes = prev.partes; } // tela antiga corrigindo: mantém
    else if (ms.length === 1) { L.origem = [{ de: ms[0] }]; L.partes = partesDaOrigem(L.origem, parceria); }
    else throw httpErr(400, 'Esta roça tem vários meeiros: diga de quem é a venda. Atualize o app (feche e abra de novo).');
    if (!Object.keys(L.partes).length) L.partes = { dono: 100 };
    // valor para o meeiro (opcional; só quando a venda tem meeiro): é sobre ele que o meeiro ganha a parte dele
    const temMeeiro = Object.keys(L.partes).some(k => k !== 'dono');
    if (!ms.length && manter) L.base = prev.base != null ? Math.min(Number(prev.base), L.valor) : null; // sem meeiro agora: não mexe no valor para o meeiro (nunca acima do vendido)
    else if (Object.prototype.hasOwnProperty.call(b, 'base')) L.base = b.base == null || b.base === '' ? null : reais(b.base, 'Valor para o meeiro');
    else if (prev && prev.tipo === 'venda' && prev.base != null) L.base = Math.min(Number(prev.base), L.valor); // tela antiga corrigindo: mantém (nunca acima do vendido)
    if (L.base != null && L.base > L.valor) throw httpErr(400, 'O valor para o meeiro não pode ser maior que o valor vendido.');
    if (!temMeeiro || L.base === L.valor) L.base = null;
    }
  } else if (tipo === 'adiantamento') {
    need(T, 'r_meeiros', 'Meeiros estão desligados para esta empresa.');
    if (!roca) throw httpErr(400, 'Escolha a roça do meeiro.');
    const pid = idOf('pessoa', b.pessoaId, 'Meeiro');
    const jaEra = mesmaRoca && prev.pessoa_id === pid; // corrigir adiantamento de quem saiu da parceria continua valendo
    if (!Object.prototype.hasOwnProperty.call(parceria, pid) && !jaEra) throw httpErr(400, 'Esse meeiro não é desta roça.');
    const pe = await getPessoa(q, tid, pid, 'meeiro');
    L.pessoa_id = pid; L.pessoa_nome = pe.nome;
    L.valor = reais(b.valor, 'Valor');
    L.descricao = L.descricao || 'Adiantamento';
  } else {
    const cat = String(b.categoria || '');
    if (!CAT_IDS.includes(cat)) throw httpErr(400, 'Escolha o tipo da despesa.');
    L.categoria = cat;
    if (cat === 'outros' && !L.descricao) throw httpErr(400, 'Em "Outros", escreva o que foi.');
    L.valor = reais(b.valor, 'Valor');
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
    // numa correção, quem já estava na divisão (mesmo que tenha saído da parceria) continua podendo estar
    const antigos = mesmaRoca ? Object.keys(prev.partes || {}).filter(k => k !== 'dono') : [];
    const allowed = ['dono'].concat(Object.keys(parceria)).concat(antigos.filter(k => !Object.prototype.hasOwnProperty.call(parceria, k)));
    if (mesmaRoca && !b.partes && Object.keys(prev.partes || {}).length) L.partes = prev.partes;
    else if (allowed.length === 1) L.partes = { dono: 100 };
    else if (b.partes) L.partes = cleanPartes(b.partes, allowed, 'Quem paga');
    else L.partes = (roca.regras || {})[cat] ? cleanPartes(roca.regras[cat], allowed, 'Quem paga') : { dono: 100 };
  }
  return L;
}

async function saveLanc(tid, T, b, user) {
  const id0 = idOf('lanc', b.id, 'Lançamento');
  const prev = b.novo ? null : (await db.query('select * from rural_lanc where tenant_id=$1 and id=$2', [tid, id0])).rows[0] || null;
  travaGravado(T, prev);
  const L = await buildLanc(tid, T, b, user, prev);
  return db.tx(async t => {
    const cur = (await t.query('select tipo, acertos, partes, updated_at from rural_lanc where tenant_id=$1 and id=$2 for update', [tid, L.id])).rows[0];
    if (cur && b.novo) return { id: L.id, repetido: true }; // o mesmo lançamento enviado duas vezes grava uma vez
    // mudou entre a leitura e a gravação (outra aba, outro aparelho): confere de novo em vez de gravar por cima
    if (cur && (!prev || String(cur.updated_at) !== String(prev.updated_at))) throw httpErr(409, 'Este lançamento mudou enquanto você corrigia. Abra de novo e confira.');
    if (cur && Object.keys(cur.acertos || {}).length) throw httpErr(409, 'Este lançamento já entrou num acerto. Desfaça o acerto para mudar.');
    if (cur && cur.tipo !== L.tipo) throw httpErr(400, 'Não dá para trocar o tipo do lançamento.');
    const cols = ['tipo', 'roca_id', 'data', 'categoria', 'descricao', 'valor', 'qtd', 'unidade', 'preco', 'comprador', 'pessoa_id', 'pessoa_nome', 'dias', 'veiculo_id', 'partes', 'pagamento', 'vence', 'cheque', 'pagamentos', 'base', 'origem', 'itens'];
    const J = c => c === 'partes' || c === 'cheque' || c === 'pagamentos' || c === 'origem' || c === 'itens';
    const vals = cols.map(c => J(c) ? JSON.stringify(L[c]) : L[c]);
    if (cur) {
      await t.query(`update rural_lanc set ${cols.map((c, i) => c + '=$' + (i + 3) + (J(c) ? '::jsonb' : '')).join(',')}, updated_at=now() where tenant_id=$1 and id=$2`, [tid, L.id, ...vals]);
    } else {
      await t.query(`insert into rural_lanc(tenant_id,id,criado_por,${cols.join(',')}) values($1,$2,$3,${cols.map((c, i) => '$' + (i + 4) + (J(c) ? '::jsonb' : '')).join(',')})`, [tid, L.id, L.criado_por, ...vals]);
    }
    return { id: L.id, novo: !cur };
  });
}

/* função desligada na Central: não se mexe (corrigir ou excluir) em lançamento que depende dela */
function travaGravado(T, row) {
  if (!row) return;
  const temMeeiro = row.tipo === 'adiantamento' || Object.keys(row.partes || {}).some(k => k !== 'dono');
  if (temMeeiro) need(T, 'r_meeiros', 'Este lançamento tem parte de meeiro, e Meeiros estão desligados para esta empresa.');
  if (row.categoria === 'diarista') need(T, 'r_diaristas', 'Diaristas estão desligados para esta empresa.');
  if (row.categoria === 'salario') need(T, 'r_funcionarios', 'Funcionários estão desligados para esta empresa.');
  if (row.veiculo_id) need(T, 'r_veiculos', 'Veículos e máquinas estão desligados para esta empresa.');
}
async function delLanc(tid, T, b) {
  const id = idOf('lanc', b.id, 'Lançamento');
  return db.tx(async t => {
    const cur = (await t.query('select tipo, partes, categoria, veiculo_id, acertos from rural_lanc where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!cur) return { id, jaSaiu: true };
    travaGravado(T, cur);
    if (Object.keys(cur.acertos || {}).length) throw httpErr(409, 'Este lançamento já entrou num acerto. Desfaça o acerto para excluir.');
    await t.query('delete from rural_lanc where tenant_id=$1 and id=$2', [tid, id]);
    return { id };
  });
}

/* salários do mês de uma vez: uma despesa por funcionário (na roça dele, ou geral) */
async function salarios(tid, T, b, user) {
  need(T, 'r_funcionarios', 'Funcionários estão desligados para esta empresa.');
  const lista = Array.isArray(b.lista) ? b.lista : [];
  if (!lista.length || lista.length > 100) throw httpErr(400, 'Escolha quem vai receber (até 100 de uma vez).');
  if (lista.some(it => !it || typeof it !== 'object' || Array.isArray(it))) throw httpErr(400, 'Lista de salários inválida.');
  const ref = txt(b.referencia, 40) || '';
  const data = dateOf(b.data, 'Data', true);
  const feitos = [];
  // confere tudo antes de gravar qualquer um (pessoas e roças lidas de uma vez)
  const ids = lista.map(it => idOf('pessoa', it.pessoaId, 'Funcionário'));
  if (new Set(ids).size !== ids.length) throw httpErr(400, 'A mesma pessoa aparece duas vezes.');
  const pes = new Map((await db.query(`select * from rural_pessoas where tenant_id=$1 and tipo='funcionario' and id = any($2::text[])`, [tid, '{' + ids.join(',') + '}'])).rows.map(r => [r.id, r]));
  const rocaIds = [...new Set([...pes.values()].map(p => p.roca_id).filter(Boolean))];
  const rocas = new Map(rocaIds.length ? (await db.query('select * from rural_rocas where tenant_id=$1 and id = any($2::text[])', [tid, '{' + rocaIds.filter(x => ID_RE.roca.test(x)).join(',') + '}'])).rows.map(r => [r.id, r]) : []);
  const built = lista.map((it, k) => {
    const pe = pes.get(ids[k]); if (!pe) throw httpErr(404, 'Funcionário não encontrado.');
    const roca = pe.roca_id ? rocas.get(pe.roca_id) : null;
    if (roca && !T.modules.r_meeiros && Object.keys(roca.parceria || {}).length) throw httpErr(403, pe.nome + ' trabalha numa roça com meeiro, e Meeiros estão desligados para esta empresa. Ligue na Central para lançar.');
    const parceria = roca && T.modules.r_meeiros ? (roca.parceria || {}) : {};
    const allowed = ['dono'].concat(Object.keys(parceria));
    const partes = allowed.length > 1 && (roca.regras || {}).salario ? cleanPartes(roca.regras.salario, allowed, 'Quem paga') : { dono: 100 };
    return { id: idOf('lanc', it.id, 'Lançamento'), tipo: 'despesa', roca_id: roca ? roca.id : null, data, categoria: 'salario', descricao: ('Salário ' + ref).trim(), valor: reais(it.valor, 'Salário de ' + pe.nome), pessoa_id: pe.id, pessoa_nome: pe.nome, partes, criado_por: user.name || user.login };
  });
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
  const id = typeof b.id === 'string' ? b.id : '';
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
    const st = await state(tid);
    // função desligada: os dados dela não saem (como no atacado)
    if (!T.modules.r_meeiros) { st.acertos = []; st.lanc = st.lanc.filter(l => l.tipo !== 'adiantamento'); st.pessoas = st.pessoas.filter(p => p.tipo !== 'meeiro'); }
    if (!T.modules.r_funcionarios) st.pessoas = st.pessoas.filter(p => p.tipo !== 'funcionario');
    if (!T.modules.r_veiculos) st.veiculos = [];
    return Object.assign({ me: { nome: user.name || user.login, login: user.login }, empresa: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo }, modulos: T.modules, cats: CATS, unidades: UNIDADES, culturas: CULTURAS, pagamentos: PAGAMENTOS }, st);
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
    case '/api/rural/lanc/excluir': out = await delLanc(tid, T, b); await audit('rural_lanc_excluido', { id: out.id }); break;
    case '/api/rural/salarios': out = await salarios(tid, T, b, user); await audit('rural_salarios', { n: out.n }); break;
    case '/api/rural/acerto': out = await acertar(tid, T, b, user); await audit('rural_acerto', { id: out.id, saldo: out.totais.saldo }); break;
    case '/api/rural/acerto/desfazer': need(T, 'r_meeiros', 'Meeiros estão desligados para esta empresa.'); out = await desfazerAcerto(tid, b, user); await audit('rural_acerto_desfeito', { id: out.id }); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, CATS, UNIDADES, PAGAMENTOS, vendaPartes, cleanPartes };

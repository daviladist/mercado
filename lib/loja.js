'use strict';
/*
 * Tino Loja online (ramo 'loja'): a comerciante publica os produtos e o cliente compra pelo celular.
 * - Vitrine pública (/t/<empresa>/loja): catálogo, carrinho, enviar pedido, acompanhar pelo link.
 * - Painel do comerciante (/t/<empresa>/): produtos com fotos, variações, estoque, preço por quantidade, pedidos.
 *
 * Regras que valem SEMPRE aqui no servidor:
 *  - o preço do pedido é recalculado aqui (preço do produto e faixa por quantidade); se o total mudou desde
 *    que o cliente viu, o pedido é recusado para ele conferir (nunca cobra diferente do que mostrou);
 *  - estoque conferido e baixado dentro da transação (dois clientes não compram a última peça);
 *  - o mesmo pedido enviado duas vezes grava uma vez; envio limitado por aparelho/IP e por loja;
 *  - o cliente só vê o pedido dele pela chave do link (no banco fica só o SHA-256 da chave);
 *  - loja em preparo, suspensa ou fechada não recebe pedido; função desligada na Central = recusa.
 * Tabelas: loja_config, loja_produtos, loja_fotos, loja_pedidos, loja_seq.
 */
const crypto = require('crypto');
const db = require('./pg');
const auth = require('./auth');
const store = require('./store');

const httpErr = store.httpErr;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const PAGAMENTOS = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão (na entrega ou retirada)' };
const UNIDADES = ['un', 'kg', 'pct', 'cx', 'par', 'kit'];
const STATUS = ['novo', 'confirmado', 'pronto', 'entregue', 'cancelado'];
const PROXIMO = { novo: ['confirmado', 'cancelado'], confirmado: ['pronto', 'cancelado'], pronto: ['entregue', 'cancelado'], entregue: [], cancelado: [] };
const MAX_ITENS = 60, MAX_QTD = 999, MAX_PRODUTOS = 3000, MAX_FOTOS = 6000, FOTO_MAX = 700 * 1024;

/* ---------- limpeza do que chega ---------- */
const ID_RE = { produto: /^x[a-f0-9]{12}$/, foto: /^f[a-f0-9]{16}$/, variacao: /^v[a-f0-9]{8}$/, pedido: /^o[a-f0-9]{16}$/ };
function idOf(kind, v, label) {
  if (typeof v !== 'string' || !ID_RE[kind].test(v)) throw httpErr(400, (label || 'Cadastro') + ' inválido.');
  return v;
}
function txt(v, max, label, required) {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw httpErr(400, (label || 'Texto') + ' inválido.');
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  if (required && s.length < 2) throw httpErr(400, label + ': escreva pelo menos 2 letras.');
  return s || null;
}
const linha = (v, max, label, req) => { const s = txt(v, max, label, req); return s ? s.replace(/\s+/g, ' ') : s; };
/* dinheiro: número JSON ou texto no jeito brasileiro ("1.500", "1.500,50", "25,5") */
function reais(v, label, { required = true, allowZero = false } = {}) {
  if (v === '' || v == null) { if (required) throw httpErr(400, label + ': informe o valor.'); return null; }
  let n;
  if (typeof v === 'number') n = v;
  else {
    let t = String(v).trim();
    if (!/^(\d{1,3}(\.\d{3})+(,\d+)?|\d+(,\d+)?|\d+\.\d+)$/.test(t)) throw httpErr(400, label + ' inválido.');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    n = Number(t);
  }
  n = r2(n);
  if (!isFinite(n) || n < 0 || n > 10000000 || (!allowZero && !(n > 0))) throw httpErr(400, label + ' inválido.');
  return n;
}
function inteiro(v, label, min, max) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw httpErr(400, label + ' inválido.');
  return v;
}
const soDigitos = s => String(s || '').replace(/\D/g, '');
function telefone(v) {
  const d = soDigitos(v);
  if (d.length < 10 || d.length > 13) throw httpErr(400, 'Telefone/WhatsApp: escreva com DDD (ex.: 27 99999-0000).');
  return d;
}

/* ---------- preço: faixa por quantidade (a melhor faixa alcançada pela quantidade TOTAL do produto) ---------- */
function precoUnit(p, qtdTotal, modVolume) {
  let u = Number(p.preco);
  if (modVolume) for (const f of (p.faixas || [])) if (qtdTotal >= f.min && Number(f.preco) < u) u = Number(f.preco);
  return u;
}

/* ---------- leitura ---------- */
const fotoUrl = (tid, id) => '/api/loja/foto/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(tid);
function prodOut(p, admin) {
  const o = {
    id: p.id, nome: p.nome, descricao: p.descricao, categoria: p.categoria, preco: Number(p.preco), precoDe: p.preco_de == null ? null : Number(p.preco_de),
    unidade: p.unidade || 'un', fotos: (p.fotos || []).map(f => ({ id: f, url: fotoUrl(p.tenant_id, f) })), grupoVar: p.grupo_var,
    faixas: (p.faixas || []).map(f => ({ min: f.min, preco: Number(f.preco) })), destaque: !!p.destaque
  };
  if (admin) Object.assign(o, { ativo: p.ativo, estoque: p.estoque, variacoes: p.variacoes || [], vendidos: p.vendidos });
  else Object.assign(o, {
    // o cliente vê só se tem ou não (não a quantidade)
    disponivel: p.estoque == null || p.estoque > 0,
    variacoes: (p.variacoes || []).map(v => ({ id: v.id, nome: v.nome, disponivel: v.estoque == null || v.estoque > 0 }))
  });
  return o;
}
const pedOut = (o, admin) => {
  const x = {
    numero: Number(o.numero), status: o.status, clienteNome: o.cliente_nome, entrega: o.entrega, endereco: o.endereco, pagamento: o.pagamento,
    obs: o.obs, itens: o.itens, subtotal: Number(o.subtotal), taxaEntrega: Number(o.taxa_entrega), total: Number(o.total), historico: o.historico || [], criadoEm: o.created_at
  };
  if (admin) Object.assign(x, { id: o.id, clienteTel: o.cliente_tel, atualizadoEm: o.updated_at });
  return x;
};
const CFG_PADRAO = { aberta: true, whatsapp: '', endereco: '', horario: '', boasVindas: '', pagamentos: ['pix', 'dinheiro', 'cartao'], pixChave: '', retirada: true, entrega: false, taxaEntrega: 0, entregaObs: '', pedidoMinimo: 0 };
async function getCfg(q, tid) {
  const r = await q('select data from loja_config where tenant_id=$1', [tid]);
  return Object.assign({}, CFG_PADRAO, (r.rows[0] && r.rows[0].data) || {});
}
/* entrega só vale com a função ligada */
function cfgEfetiva(c, T) {
  const e = Object.assign({}, c);
  if (!T.modules.l_entrega) Object.assign(e, { entrega: false, taxaEntrega: 0, entregaObs: '' });
  if (!e.entrega) e.retirada = true; // sem entrega, a retirada sempre vale
  return e;
}
const cfgPublica = (c, T) => { const e = cfgEfetiva(c, T); return { aberta: !!e.aberta, whatsapp: e.whatsapp, endereco: e.endereco, horario: e.horario, boasVindas: e.boasVindas, pagamentos: e.pagamentos, pixChave: e.pixChave, retirada: !!e.retirada, entrega: !!e.entrega, taxaEntrega: Number(e.taxaEntrega) || 0, entregaObs: e.entregaObs, pedidoMinimo: Number(e.pedidoMinimo) || 0 }; };
/* o que o cliente vê de um produto depende das funções ligadas */
function vitrineProd(p, T) {
  const o = prodOut(p, false);
  if (!T.modules.l_variacoes) { o.variacoes = []; o.grupoVar = null; }
  if (!T.modules.l_volume) o.faixas = [];
  if (!T.modules.l_estoque) { o.disponivel = true; o.variacoes.forEach(v => { v.disponivel = true; }); }
  return o;
}

/* ---------- vitrine pública ---------- */
function lojaAberta(T) {
  if (T.status === 'suspensa') throw httpErr(403, 'Esta loja não está disponível.');
  if (T.status === 'em_preparo') throw httpErr(403, 'A loja está sendo preparada. Volte em breve!');
}
async function vitrine(T) {
  lojaAberta(T);
  const q = (a, p) => db.query(a, p);
  const cfg = await getCfg(q, T.id);
  const r = await q('select * from loja_produtos where tenant_id=$1 and ativo order by destaque desc, nome', [T.id]);
  return { loja: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo }, config: cfgPublica(cfg, T), produtos: r.rows.map(p => vitrineProd(p, T)), pagamentosNomes: PAGAMENTOS };
}

/* monta o pedido com os preços DE AGORA (sem gravar) */
function montar(prods, itens, T) {
  if (!Array.isArray(itens) || !itens.length) throw httpErr(400, 'O carrinho está vazio.');
  if (itens.length > MAX_ITENS) throw httpErr(400, 'Itens demais num pedido só.');
  const byId = new Map(prods.map(p => [p.id, p]));
  const linhas = [], porProduto = new Map(), chaves = new Set();
  for (const it of itens) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) throw httpErr(400, 'Item inválido.');
    const pid = idOf('produto', it.produtoId, 'Produto');
    const p = byId.get(pid);
    if (!p || !p.ativo) throw httpErr(409, 'Um produto do carrinho não está mais à venda. Confira o carrinho.');
    const qtd = inteiro(it.qtd, 'Quantidade', 1, MAX_QTD);
    let v = null;
    const vars = T.modules.l_variacoes ? (p.variacoes || []) : [];
    if (vars.length) {
      const vid = idOf('variacao', it.variacaoId, 'Opção');
      v = vars.find(x => x.id === vid);
      if (!v) throw httpErr(409, p.nome + ': essa opção não existe mais. Confira o carrinho.');
    } else if (it.variacaoId != null && it.variacaoId !== '') throw httpErr(400, 'Opção inválida.');
    const k = pid + '|' + (v ? v.id : '');
    if (chaves.has(k)) throw httpErr(400, 'Item repetido no carrinho.');
    chaves.add(k);
    linhas.push({ p, v, qtd });
    porProduto.set(pid, (porProduto.get(pid) || 0) + qtd);
  }
  let subtotal = 0;
  const out = linhas.map(({ p, v, qtd }) => {
    const unit = r2(precoUnit(p, porProduto.get(p.id), T.modules.l_volume));
    const total = r2(unit * qtd);
    subtotal += total;
    return { produtoId: p.id, nome: p.nome, variacaoId: v ? v.id : null, variacao: v ? v.nome : null, grupoVar: v ? p.grupo_var || null : null, qtd, unidade: p.unidade || 'un', precoUnit: unit, precoTabela: Number(p.preco), total };
  });
  return { itens: out, linhas, subtotal: r2(subtotal) };
}

async function novoPedido(T, b, ip) {
  lojaAberta(T);
  const tid = T.id;
  const id = idOf('pedido', b.id, 'Pedido');
  if (typeof b.chave !== 'string' || !/^[a-f0-9]{32}$/.test(b.chave)) throw httpErr(400, 'Pedido inválido.');
  const chaveHash = sha(tid + ':' + b.chave);
  // limite de envios: por aparelho/IP e pela loja inteira (contados antes de gravar)
  if (await auth.hit('lojaped:' + tid + ':' + ip) > 30 || await auth.hit('lojaped:' + tid) > 400) throw httpErr(429, 'Muitos pedidos seguidos. Espere alguns minutos ou fale com a loja pelo WhatsApp.');
  const c = b.cliente && typeof b.cliente === 'object' ? b.cliente : {};
  const nome = linha(c.nome, 80, 'Seu nome', true);
  const tel = telefone(c.telefone);
  const entrega = b.entrega === 'entrega' ? 'entrega' : b.entrega === 'retirada' ? 'retirada' : null;
  if (!entrega) throw httpErr(400, 'Escolha entrega ou retirada.');
  const endereco = entrega === 'entrega' ? txt(b.endereco, 300, 'Endereço', true) : null;
  const pagamento = String(b.pagamento || '');
  const obs = txt(b.obs, 500, 'Observação');
  const visto = reais(b.totalVisto, 'Total', { allowZero: true });
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    const dup = (await q('select numero, chave_hash from loja_pedidos where tenant_id=$1 and id=$2', [tid, id])).rows[0];
    if (dup) { if (dup.chave_hash !== chaveHash) throw httpErr(409, 'Pedido inválido.'); return { numero: Number(dup.numero), repetido: true }; }
    const cfg = cfgEfetiva(await getCfg(q, tid), T);
    if (!cfg.aberta) throw httpErr(403, 'A loja está fechada para pedidos no momento.');
    if (!Object.prototype.hasOwnProperty.call(PAGAMENTOS, pagamento) || !(cfg.pagamentos || []).includes(pagamento)) throw httpErr(400, 'Escolha uma forma de pagamento aceita pela loja.');
    if (entrega === 'entrega' && !cfg.entrega) throw httpErr(400, 'Esta loja não faz entrega. Escolha retirada.');
    if (entrega === 'retirada' && !cfg.retirada) throw httpErr(400, 'Esta loja só faz entrega.');
    const ids = [...new Set((Array.isArray(b.itens) ? b.itens : []).map(it => it && typeof it.produtoId === 'string' && ID_RE.produto.test(it.produtoId) ? it.produtoId : null).filter(Boolean))];
    // trava os produtos do pedido: o estoque é conferido e baixado sem atropelar outro cliente
    const prods = ids.length ? (await q(`select * from loja_produtos where tenant_id=$1 and id = any($2::text[]) order by id for update`, [tid, '{' + ids.join(',') + '}'])).rows : [];
    const M = montar(prods, b.itens, T);
    const taxa = entrega === 'entrega' ? r2(cfg.taxaEntrega) : 0;
    const total = r2(M.subtotal + taxa);
    if (Number(cfg.pedidoMinimo) > 0 && M.subtotal < Number(cfg.pedidoMinimo)) throw httpErr(400, 'O pedido mínimo é de R$ ' + Number(cfg.pedidoMinimo).toFixed(2).replace('.', ',') + '.');
    // o cliente viu outro total? recusa e manda conferir (preço ou faixa mudaram)
    if (Math.abs(total - visto) > 0.009) { const e = httpErr(409, 'Os preços mudaram desde que você abriu a loja. Confira o carrinho: o total agora é R$ ' + total.toFixed(2).replace('.', ',') + '.'); e.precos = true; throw e; }
    // estoque
    let baixou = false;
    if (T.modules.l_estoque) {
      const porProduto = new Map();
      for (const { p, v, qtd } of M.linhas) {
        const vars = T.modules.l_variacoes ? (p.variacoes || []) : [];
        if (v) { if (v.estoque != null && v.estoque < qtd) throw httpErr(409, p.nome + ' (' + v.nome + '): ' + (v.estoque > 0 ? 'só temos ' + v.estoque + '.' : 'esgotado.')); }
        else if (!vars.length) porProduto.set(p.id, (porProduto.get(p.id) || 0) + qtd);
      }
      for (const [pid, qtd] of porProduto) { const p = prods.find(x => x.id === pid); if (p.estoque != null && p.estoque < qtd) throw httpErr(409, p.nome + ': ' + (p.estoque > 0 ? 'só temos ' + p.estoque + '.' : 'esgotado.')); }
      for (const p of prods) {
        const vars = T.modules.l_variacoes ? (p.variacoes || []) : [];
        let mudou = false;
        // cada item guarda se baixou estoque: ao cancelar, só volta o que saiu de fato
        const novasVars = (p.variacoes || []).map(v => { const k = M.linhas.findIndex(x => x.p.id === p.id && x.v && x.v.id === v.id); if (k >= 0 && v.estoque != null) { mudou = true; M.itens[k].baixou = true; return Object.assign({}, v, { estoque: v.estoque - M.linhas[k].qtd }); } return v; });
        const novoEst = !vars.length && p.estoque != null && porProduto.has(p.id) ? p.estoque - porProduto.get(p.id) : p.estoque;
        if (novoEst !== p.estoque) M.linhas.forEach((x, k) => { if (x.p.id === p.id && !x.v) M.itens[k].baixou = true; });
        if (mudou || novoEst !== p.estoque) { baixou = true; await q('update loja_produtos set variacoes=$3::jsonb, estoque=$4, updated_at=now() where tenant_id=$1 and id=$2', [tid, p.id, JSON.stringify(novasVars), novoEst]); }
      }
    }
    const vendidos = new Map();
    M.linhas.forEach(l => vendidos.set(l.p.id, (vendidos.get(l.p.id) || 0) + l.qtd));
    for (const [pid, qtd] of vendidos) await q('update loja_produtos set vendidos=vendidos+$3 where tenant_id=$1 and id=$2', [tid, pid, qtd]);
    const n = Number((await q(`insert into loja_seq(tenant_id,last_no) values($1,1) on conflict(tenant_id) do update set last_no=loja_seq.last_no+1 returning last_no`, [tid])).rows[0].last_no);
    const hist = [{ status: 'novo', em: new Date().toISOString() }];
    await q(`insert into loja_pedidos(tenant_id,id,numero,chave_hash,cliente_nome,cliente_tel,entrega,endereco,pagamento,obs,itens,subtotal,taxa_entrega,total,estoque_baixado,historico,ip)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16::jsonb,$17)`,
    [tid, id, n, chaveHash, nome, tel, entrega, endereco, pagamento, obs, JSON.stringify(M.itens), M.subtotal, taxa, total, baixou, JSON.stringify(hist), String(ip).slice(0, 64)]);
    return { numero: n, total };
  });
}

async function verPedido(T, chave) {
  if (T.status === 'suspensa') throw httpErr(403, 'Esta loja não está disponível.');
  if (typeof chave !== 'string' || !/^[a-f0-9]{32}$/.test(chave)) throw httpErr(404, 'Pedido não encontrado.');
  const r = await db.query('select * from loja_pedidos where tenant_id=$1 and chave_hash=$2', [T.id, sha(T.id + ':' + chave)]);
  if (!r.rows[0]) throw httpErr(404, 'Pedido não encontrado.');
  return { pedido: pedOut(r.rows[0], false) };
}

/* ---------- painel do comerciante ---------- */
function need(T, code, msg) { if (!T.modules[code]) throw httpErr(403, msg || 'Função desligada para esta empresa.'); }

async function saveProduto(tid, T, b) {
  const id = idOf('produto', b.id, 'Produto');
  const q = (a, p) => db.query(a, p);
  const cur = (await q('select * from loja_produtos where tenant_id=$1 and id=$2', [tid, id])).rows[0];
  if (!cur && Number((await q('select count(*)::int n from loja_produtos where tenant_id=$1', [tid])).rows[0].n) >= MAX_PRODUTOS) throw httpErr(400, 'Limite de produtos atingido.');
  const nome = linha(b.nome, 80, 'Nome do produto', true);
  const preco = reais(b.preco, 'Preço');
  const precoDe = b.precoDe === '' || b.precoDe == null ? null : reais(b.precoDe, 'Preço "de"');
  if (precoDe != null && precoDe <= preco) throw httpErr(400, 'O preço "de" (riscado) precisa ser maior que o preço de venda.');
  const unidade = b.unidade == null || b.unidade === '' ? 'un' : String(b.unidade);
  if (!UNIDADES.includes(unidade)) throw httpErr(400, 'Unidade inválida.');
  // fotos: só as desta loja, até 6
  const fotos = Array.isArray(b.fotos) ? b.fotos : [];
  if (fotos.length > 6) throw httpErr(400, 'No máximo 6 fotos por produto.');
  fotos.forEach(f => idOf('foto', f, 'Foto'));
  if (new Set(fotos).size !== fotos.length) throw httpErr(400, 'Foto repetida.');
  if (fotos.length) { const n = Number((await q(`select count(*)::int n from loja_fotos where tenant_id=$1 and id = any($2::text[])`, [tid, '{' + fotos.join(',') + '}'])).rows[0].n); if (n !== fotos.length) throw httpErr(400, 'Foto não encontrada. Envie de novo.'); }
  // variações: com a função desligada, as gravadas ficam como estão
  let grupoVar = cur ? cur.grupo_var : null, variacoes = cur ? cur.variacoes || [] : [];
  if (T.modules.l_variacoes) {
    const vs = Array.isArray(b.variacoes) ? b.variacoes : [];
    if (vs.length > 40) throw httpErr(400, 'No máximo 40 opções por produto.');
    const nomes = new Set();
    variacoes = vs.map(v => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw httpErr(400, 'Opção inválida.');
      const vid = idOf('variacao', v.id, 'Opção'), vn = linha(v.nome, 30, 'Nome da opção');
      if (!vn) throw httpErr(400, 'Dê um nome para cada opção (ex.: P, M, G).');
      if (nomes.has(vn.toLowerCase())) throw httpErr(400, 'Opção repetida: ' + vn + '.');
      nomes.add(vn.toLowerCase());
      const old = cur && (cur.variacoes || []).find(x => x.id === vid);
      const est = T.modules.l_estoque ? (v.estoque === '' || v.estoque == null ? null : inteiro(v.estoque, 'Estoque de ' + vn, 0, 1000000)) : (old ? old.estoque : null);
      return { id: vid, nome: vn, estoque: est };
    });
    if (new Set(variacoes.map(v => v.id)).size !== variacoes.length) throw httpErr(400, 'Opção repetida.');
    grupoVar = variacoes.length ? (linha(b.grupoVar, 20, 'Tipo de opção') || 'Opção') : null;
  }
  let faixas = cur ? cur.faixas || [] : [];
  if (T.modules.l_volume) {
    const fs = Array.isArray(b.faixas) ? b.faixas : [];
    if (fs.length > 5) throw httpErr(400, 'No máximo 5 faixas de preço por quantidade.');
    faixas = fs.map(f => {
      if (!f || typeof f !== 'object') throw httpErr(400, 'Faixa inválida.');
      return { min: inteiro(f.min, 'Quantidade da faixa', 2, MAX_QTD), preco: reais(f.preco, 'Preço da faixa') };
    }).sort((a, x) => a.min - x.min);
    for (let i = 0; i < faixas.length; i++) {
      if (faixas[i].preco >= preco) throw httpErr(400, 'A partir de ' + faixas[i].min + ' unidades: o preço precisa ser menor que o preço normal.');
      if (i && (faixas[i].min === faixas[i - 1].min || faixas[i].preco >= faixas[i - 1].preco)) throw httpErr(400, 'Cada faixa de quantidade maior precisa ter preço menor que a anterior.');
    }
  }
  const estoque = T.modules.l_estoque ? (variacoes.length && T.modules.l_variacoes ? null : (b.estoque === '' || b.estoque == null ? null : inteiro(b.estoque, 'Estoque', 0, 1000000))) : (cur ? cur.estoque : null);
  await q(`insert into loja_produtos(tenant_id,id,nome,descricao,categoria,preco,preco_de,unidade,fotos,grupo_var,variacoes,estoque,faixas,ativo,destaque)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15)
    on conflict(tenant_id,id) do update set nome=excluded.nome, descricao=excluded.descricao, categoria=excluded.categoria, preco=excluded.preco, preco_de=excluded.preco_de,
      unidade=excluded.unidade, fotos=excluded.fotos, grupo_var=excluded.grupo_var, variacoes=excluded.variacoes, estoque=excluded.estoque, faixas=excluded.faixas,
      ativo=excluded.ativo, destaque=excluded.destaque, updated_at=now()`,
  [tid, id, nome, txt(b.descricao, 1500, 'Descrição'), linha(b.categoria, 40, 'Categoria'), preco, precoDe, unidade, JSON.stringify(fotos), grupoVar, JSON.stringify(variacoes), estoque, JSON.stringify(faixas), b.ativo !== false, b.destaque === true]);
  await limparFotos(tid);
  return { id, novo: !cur };
}
async function delProduto(tid, b) {
  const id = idOf('produto', b.id, 'Produto');
  const r = await db.query('delete from loja_produtos where tenant_id=$1 and id=$2 returning id', [tid, id]);
  await limparFotos(tid);
  return { id, apagado: !!r.rowCount };
}
/* fotos que nenhum produto usa e com mais de 1 dia saem (as recém-enviadas esperam o produto ser salvo) */
async function limparFotos(tid) {
  await db.query(`delete from loja_fotos f where f.tenant_id=$1 and f.created_at < now() - interval '1 day'
    and not exists (select 1 from loja_produtos p where p.tenant_id=$1 and p.fotos ? f.id)`, [tid]);
}
async function addFoto(tid, b) {
  const s = typeof b.data === 'string' ? b.data : '';
  // só JPEG, PNG ou WEBP em base64 (SVG fica de fora: pode carregar código)
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(s)) throw httpErr(400, 'Foto inválida: use JPG, PNG ou WEBP.');
  if (s.length > FOTO_MAX) throw httpErr(413, 'Foto grande demais.');
  const n = Number((await db.query('select count(*)::int n from loja_fotos where tenant_id=$1', [tid])).rows[0].n);
  if (n >= MAX_FOTOS) throw httpErr(400, 'Limite de fotos atingido.');
  const id = 'f' + crypto.randomBytes(8).toString('hex');
  await db.query('insert into loja_fotos(tenant_id,id,data) values($1,$2,$3)', [tid, id, s]);
  return { id, url: fotoUrl(tid, id) };
}
async function saveConfig(tid, T, b) {
  const c = {};
  c.aberta = b.aberta !== false;
  c.whatsapp = b.whatsapp ? telefone(b.whatsapp) : '';
  c.endereco = txt(b.endereco, 200, 'Endereço') || '';
  c.horario = txt(b.horario, 120, 'Horário') || '';
  c.boasVindas = txt(b.boasVindas, 300, 'Mensagem') || '';
  const pg = Array.isArray(b.pagamentos) ? b.pagamentos.filter(x => typeof x === 'string') : [];
  if (pg.some(x => !Object.prototype.hasOwnProperty.call(PAGAMENTOS, x))) throw httpErr(400, 'Forma de pagamento inválida.');
  if (!pg.length) throw httpErr(400, 'Marque pelo menos uma forma de pagamento.');
  c.pagamentos = [...new Set(pg)];
  c.pixChave = linha(b.pixChave, 77, 'Chave PIX') || '';
  const cur = await getCfg((a, p) => db.query(a, p), tid);
  if (T.modules.l_entrega) {
    c.retirada = b.retirada !== false; c.entrega = b.entrega === true;
    c.taxaEntrega = reais(b.taxaEntrega === '' || b.taxaEntrega == null ? 0 : b.taxaEntrega, 'Taxa de entrega', { allowZero: true });
    c.entregaObs = txt(b.entregaObs, 200, 'Onde entrega') || '';
    if (!c.retirada && !c.entrega) throw httpErr(400, 'Marque retirada, entrega ou as duas.');
  } else { c.retirada = true; c.entrega = cur.entrega; c.taxaEntrega = cur.taxaEntrega; c.entregaObs = cur.entregaObs; }
  c.pedidoMinimo = reais(b.pedidoMinimo === '' || b.pedidoMinimo == null ? 0 : b.pedidoMinimo, 'Pedido mínimo', { allowZero: true });
  await db.query(`insert into loja_config(tenant_id,data) values($1,$2::jsonb) on conflict(tenant_id) do update set data=excluded.data, updated_at=now()`, [tid, JSON.stringify(c)]);
  return { ok: true };
}
async function mudarStatus(tid, b, user) {
  const id = idOf('pedido', b.id, 'Pedido');
  const novo = String(b.status || '');
  if (!STATUS.includes(novo)) throw httpErr(400, 'Situação inválida.');
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    const o = (await q('select * from loja_pedidos where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!o) throw httpErr(404, 'Pedido não encontrado.');
    if (o.status === novo) return { id, status: novo, igual: true };
    if (!PROXIMO[o.status].includes(novo)) throw httpErr(409, 'Este pedido está "' + o.status + '" e não pode ir para "' + novo + '". Atualize a tela.');
    const motivo = novo === 'cancelado' ? txt(b.motivo, 200, 'Motivo') : null;
    // cancelado: o estoque volta (o que foi baixado por este pedido)
    if (novo === 'cancelado' && o.estoque_baixado) {
      for (const it of (o.itens || []).filter(x => x.baixou)) {
        const p = (await q('select * from loja_produtos where tenant_id=$1 and id=$2 for update', [tid, it.produtoId])).rows[0];
        if (!p) continue;
        if (it.variacaoId) {
          const vs = (p.variacoes || []).map(v => v.id === it.variacaoId ? Object.assign({}, v, { estoque: (v.estoque == null ? 0 : v.estoque) + it.qtd }) : v);
          await q('update loja_produtos set variacoes=$3::jsonb, updated_at=now() where tenant_id=$1 and id=$2', [tid, p.id, JSON.stringify(vs)]);
        } else await q('update loja_produtos set estoque=coalesce(estoque,0)+$3, updated_at=now() where tenant_id=$1 and id=$2', [tid, p.id, it.qtd]);
      }
    }
    if (novo === 'cancelado') for (const it of o.itens || []) await q('update loja_produtos set vendidos=greatest(vendidos-$3,0) where tenant_id=$1 and id=$2', [tid, it.produtoId, it.qtd]);
    const hist = (o.historico || []).concat([{ status: novo, em: new Date().toISOString(), por: user.name || user.login, motivo: motivo || undefined }]);
    await q('update loja_pedidos set status=$3, historico=$4::jsonb, estoque_baixado=$5, updated_at=now() where tenant_id=$1 and id=$2', [tid, id, novo, JSON.stringify(hist), novo === 'cancelado' ? false : o.estoque_baixado]);
    return { id, status: novo };
  });
}

async function adminState(tid, T, user) {
  const q = (a, p) => db.query(a, p);
  const [cfg, prods, peds] = await Promise.all([
    getCfg(q, tid),
    q('select * from loja_produtos where tenant_id=$1 order by ativo desc, destaque desc, nome', [tid]),
    q(`select * from loja_pedidos where tenant_id=$1 order by created_at desc limit 500`, [tid])
  ]);
  return { me: { nome: user.name || user.login }, empresa: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo, status: T.status }, modulos: T.modules, config: cfgEfetiva(cfg, T), produtos: prods.rows.map(p => prodOut(p, true)), pedidos: peds.rows.map(o => pedOut(o, true)), pagamentosNomes: PAGAMENTOS, unidades: UNIDADES };
}

/* rotas públicas (sem login): /api/loja/vitrine, /api/loja/pedido, /api/loja/acompanhar, /api/loja/foto/<id> */
async function publico(ctx) {
  const { path, method, T, query, body, ip } = ctx;
  if (path === '/api/loja/vitrine' && method === 'GET') return { json: await vitrine(T) };
  if (path === '/api/loja/pedido' && method === 'POST') return { json: await novoPedido(T, await body(), ip) };
  if (path === '/api/loja/acompanhar' && method === 'GET') {
    if (await auth.hit('lojaver:' + T.id + ':' + ip) > 300) throw httpErr(429, 'Muitas consultas. Espere alguns minutos.');
    return { json: await verPedido(T, query.get('c')) };
  }
  if (path.startsWith('/api/loja/foto/') && method === 'GET') {
    if (T.status === 'suspensa') throw httpErr(404, 'Foto não encontrada.');
    const id = decodeURIComponent(path.slice('/api/loja/foto/'.length));
    if (!ID_RE.foto.test(id)) throw httpErr(404, 'Foto não encontrada.');
    const r = await db.query('select data from loja_fotos where tenant_id=$1 and id=$2', [T.id, id]);
    const m = r.rows[0] && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(r.rows[0].data);
    if (!m) throw httpErr(404, 'Foto não encontrada.');
    return { raw: Buffer.from(m[2], 'base64'), type: m[1] };
  }
  return null;
}

/* rotas do painel (/api/loja/admin/*): só o administrador da empresa */
async function handle(ctx) {
  const { path, method, user, tid, T, body, audit } = ctx;
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador.');
  if (path === '/api/loja/admin/state' && method === 'GET') return adminState(tid, T, user);
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = await body();
  let out;
  switch (path) {
    case '/api/loja/admin/produto': out = await saveProduto(tid, T, b); await audit(out.novo ? 'loja_produto_novo' : 'loja_produto_alterado', { id: out.id }); break;
    case '/api/loja/admin/produto/excluir': out = await delProduto(tid, b); await audit('loja_produto_excluido', { id: out.id }); break;
    case '/api/loja/admin/foto': out = await addFoto(tid, b); break;
    case '/api/loja/admin/config': out = await saveConfig(tid, T, b); await audit('loja_config', {}); break;
    case '/api/loja/admin/pedido/status': out = await mudarStatus(tid, b, user); await audit('loja_pedido_status', { id: out.id, status: out.status }); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, publico, precoUnit, montar, PAGAMENTOS };

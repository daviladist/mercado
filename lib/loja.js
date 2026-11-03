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
const MAX_ITENS = 60, MAX_QTD = 999, MAX_PRODUTOS = 3000, MAX_FOTOS = 3000, FOTO_MAX = 700 * 1024;

/* ---------- limpeza do que chega ---------- */
const ID_RE = { staria: /^s[a-f0-9]{12}$/, produto: /^x[a-f0-9]{12}$/, foto: /^f[a-f0-9]{16}$/, variacao: /^v[a-f0-9]{8}$/, pedido: /^o[a-f0-9]{16}$/ };
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
    if (!/^(\d{1,3}(\.\d{3})+(,\d{1,2})?|\d+(,\d{1,2})?|\d+\.\d{1,2})$/.test(t)) throw httpErr(400, label + ' inválido.');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    n = Number(t);
  }
  if (typeof v === 'number' && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw httpErr(400, label + ': use no máximo 2 casas depois da vírgula.');
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
  if (admin) Object.assign(o, { ativo: p.ativo, estoque: p.estoque, variacoes: p.variacoes || [], vendidos: p.vendidos, codigo: p.codigo || null, custo: p.custo == null ? null : Number(p.custo) });
  else Object.assign(o, {
    // o cliente vê só se tem ou não (não a quantidade); "restam" só quando sobram poucas (escassez verdadeira)
    disponivel: p.estoque == null || p.estoque > 0,
    restam: p.estoque != null && p.estoque > 0 && p.estoque <= POUCOS ? p.estoque : null,
    vendidos: Number(p.vendidos) || 0,
    variacoes: (p.variacoes || []).map(v => ({ id: v.id, nome: v.nome, disponivel: v.estoque == null || v.estoque > 0, restam: v.estoque != null && v.estoque > 0 && v.estoque <= POUCOS ? v.estoque : null }))
  });
  return o;
}
const POUCOS = 5;
const pedOut = (o, admin) => {
  const x = {
    numero: Number(o.numero), status: o.status, clienteNome: o.cliente_nome, entrega: o.entrega, endereco: o.endereco, pagamento: o.pagamento,
    obs: o.obs, itens: o.itens, subtotal: Number(o.subtotal), taxaEntrega: Number(o.taxa_entrega), total: Number(o.total), historico: o.historico || [], criadoEm: o.created_at,
    cupom: o.cupom || null, desconto: Number(o.desconto) || 0,
    avaliacaoNota: o.avaliacao_nota || null, avaliacaoComentario: o.avaliacao_comentario || null,
    podeAvaliar: o.status === 'entregue' && !o.avaliacao_nota
  };
  if (admin) Object.assign(x, { id: o.id, clienteTel: o.cliente_tel, atualizadoEm: o.updated_at });
  return x;
};
const CFG_PADRAO = { aberta: true, whatsapp: '', endereco: '', horario: '', boasVindas: '', pagamentos: ['pix', 'dinheiro', 'cartao'], pixChave: '', retirada: true, entrega: false, taxaEntrega: 0, entregaObs: '', pedidoMinimo: 0,
  entregaGratisDe: 0, tempoPreparo: 0, entregaHoje: '', cupons: [] };
async function getCfg(q, tid) {
  const r = await q('select data from loja_config where tenant_id=$1', [tid]);
  return Object.assign({}, CFG_PADRAO, (r.rows[0] && r.rows[0].data) || {});
}
/* entrega só vale com a função ligada */
function cfgEfetiva(c, T) {
  const e = Object.assign({}, c);
  if (!T.modules.l_entrega) Object.assign(e, { entrega: false, taxaEntrega: 0, entregaObs: '', entregaGratisDe: 0 });
  if (!e.entrega) e.retirada = true; // sem entrega, a retirada sempre vale
  return e;
}
/* taxa de entrega do pedido: zero quando a loja dá entrega grátis a partir de um valor e o subtotal chegou lá */
function taxaDe(cfg, entrega, subtotal) {
  if (entrega !== 'entrega') return 0;
  const gratis = Number(cfg.entregaGratisDe) || 0;
  if (gratis > 0 && subtotal >= gratis) return 0;
  return r2(cfg.taxaEntrega);
}
const cfgPublica = (c, T) => {
  const e = cfgEfetiva(c, T);
  return { aberta: !!e.aberta, whatsapp: e.whatsapp, endereco: e.endereco, horario: e.horario, boasVindas: e.boasVindas, pagamentos: e.pagamentos, pixChave: e.pixChave, retirada: !!e.retirada, entrega: !!e.entrega, taxaEntrega: Number(e.taxaEntrega) || 0, entregaObs: e.entregaObs, pedidoMinimo: Number(e.pedidoMinimo) || 0,
    entregaGratisDe: Number(e.entregaGratisDe) || 0, tempoPreparo: Number(e.tempoPreparo) || 0, entregaHoje: e.entregaHoje || '',
    // o cliente só fica sabendo que existe cupom (os códigos não vão para a vitrine)
    temCupom: (e.cupons || []).some(c => c && c.ativo !== false) };
};
/* o que o cliente vê de um produto depende das funções ligadas */
function vitrineProd(p, T) {
  const o = prodOut(p, false);
  if (!T.modules.l_variacoes) { o.variacoes = []; o.grupoVar = null; }
  if (!T.modules.l_volume) o.faixas = [];
  if (!T.modules.l_estoque) { o.disponivel = true; o.restam = null; o.variacoes.forEach(v => { v.disponivel = true; v.restam = null; }); }
  return o;
}
const disponivelProd = o => o.disponivel && (!o.variacoes.length || o.variacoes.some(v => v.disponivel));

/* ---------- "Peça junto": produtos que mais aparecem nos mesmos pedidos (90 dias), por loja, em cache por 10 min ---------- */
const JUNTO_TTL = 10 * 60 * 1000, JUNTO_MAX = 3;
const juntoCache = new Map(); // tenant -> { em, pares: Map(produtoId -> Map(outroId -> n)) }
async function paresDaLoja(q, tid) {
  const c = juntoCache.get(tid);
  if (c && Date.now() - c.em < JUNTO_TTL) return c.pares;
  const r = await q(`select a.x->>'produtoId' as p1, b.x->>'produtoId' as p2, count(*)::int as n
    from loja_pedidos o, jsonb_array_elements(o.itens) a(x), jsonb_array_elements(o.itens) b(x)
    where o.tenant_id=$1 and o.status <> 'cancelado' and o.created_at > now() - interval '90 days' and a.x->>'produtoId' <> b.x->>'produtoId'
    group by 1, 2`, [tid]);
  const pares = new Map();
  for (const x of r.rows) { if (!pares.has(x.p1)) pares.set(x.p1, new Map()); pares.get(x.p1).set(x.p2, x.n); }
  juntoCache.set(tid, { em: Date.now(), pares });
  if (juntoCache.size > 500) juntoCache.delete(juntoCache.keys().next().value);
  return pares;
}
/* para cada produto da vitrine: até 3 ids para "Peça junto" (nunca ele mesmo, nunca esgotado); sem histórico, os mais vendidos da mesma categoria */
function montarJunto(prods, pares) {
  const ok = prods.filter(disponivelProd);
  for (const p of prods) {
    const vistos = new Set([p.id]), out = [];
    const m = pares.get(p.id);
    if (m) for (const [id] of [...m.entries()].sort((a, b) => b[1] - a[1])) { if (out.length >= JUNTO_MAX) break; const x = ok.find(o => o.id === id); if (x && !vistos.has(id)) { vistos.add(id); out.push(id); } }
    if (out.length < JUNTO_MAX) for (const x of ok.filter(o => o.categoria && o.categoria === p.categoria).sort((a, b) => b.vendidos - a.vendidos)) { if (out.length >= JUNTO_MAX) break; if (!vistos.has(x.id)) { vistos.add(x.id); out.push(x.id); } }
    p.junto = out;
  }
}

/* ---------- avaliações (nota 1-5 + comentário opcional, só depois de "entregue") ---------- */
const AVAL_TTL = 10 * 60 * 1000, AVAL_DEP_MAX = 6;
const avalCache = new Map(); // tenant -> { em, v: {media, total, depoimentos} }
async function avaliacoesDaLoja(q, tid) {
  const c = avalCache.get(tid);
  if (c && Date.now() - c.em < AVAL_TTL) return c.v;
  const r = await q(`select avaliacao_nota as nota, avaliacao_comentario as comentario, cliente_nome as nome
    from loja_pedidos where tenant_id=$1 and avaliacao_nota is not null order by avaliacao_em desc limit 300`, [tid]);
  const total = r.rows.length;
  const media = total ? Math.round(r.rows.reduce((a, x) => a + x.nota, 0) / total * 10) / 10 : 0;
  const depoimentos = r.rows.filter(x => x.comentario && x.comentario.trim()).slice(0, AVAL_DEP_MAX)
    .map(x => ({ nota: x.nota, comentario: x.comentario, nome: (x.nome || 'Cliente').trim().split(/\s+/)[0] || 'Cliente' }));
  const v = { media, total, depoimentos };
  avalCache.set(tid, { em: Date.now(), v });
  if (avalCache.size > 500) avalCache.delete(avalCache.keys().next().value);
  return v;
}
async function avaliarPedido(T, b) {
  if (typeof b.chave !== 'string' || !/^[a-f0-9]{32}$/.test(b.chave)) throw httpErr(404, 'Pedido não encontrado.');
  const nota = Number(b.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw httpErr(400, 'Escolha de 1 a 5 estrelas.');
  const comentario = txt(b.comentario, 300, 'Comentário');
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    const r = (await q('select id, status, avaliacao_nota from loja_pedidos where tenant_id=$1 and chave_hash=$2 for update', [T.id, sha(T.id + ':' + b.chave)])).rows[0];
    if (!r) throw httpErr(404, 'Pedido não encontrado.');
    if (r.status !== 'entregue') throw httpErr(400, 'Só dá para avaliar depois que o pedido for entregue.');
    if (r.avaliacao_nota) throw httpErr(409, 'Este pedido já foi avaliado. Obrigado!');
    await q('update loja_pedidos set avaliacao_nota=$3, avaliacao_comentario=$4, avaliacao_em=now() where tenant_id=$1 and id=$2', [T.id, r.id, nota, comentario]);
    avalCache.delete(T.id);
    return { ok: true };
  });
}

/* ---------- cupons de desconto ---------- */
const CUPOM_RE = /^[A-Z0-9]{2,20}$/;
const cupomCodigo = v => String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
const dataValida = d => { const x = new Date(d + 'T12:00:00Z'); return !isNaN(x) && x.toISOString().slice(0, 10) === d; };
function cupomLimpo(c, i) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw httpErr(400, 'Cupom inválido.');
  const codigo = cupomCodigo(c.codigo);
  if (!CUPOM_RE.test(codigo)) throw httpErr(400, 'Cupom ' + (i + 1) + ': o código tem só letras e números (2 a 20), sem espaço.');
  const tipo = c.tipo === 'reais' ? 'reais' : c.tipo === 'pct' ? 'pct' : null;
  if (!tipo) throw httpErr(400, 'Cupom ' + codigo + ': escolha % ou R$.');
  const valor = reais(c.valor, 'Cupom ' + codigo + ': valor');
  if (tipo === 'pct' && valor > 100) throw httpErr(400, 'Cupom ' + codigo + ': o desconto em % vai até 100.');
  const minimo = reais(c.minimo === '' || c.minimo == null ? 0 : c.minimo, 'Cupom ' + codigo + ': pedido mínimo', { allowZero: true });
  let validade = c.validade == null || c.validade === '' ? '' : String(c.validade).trim();
  if (validade && (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || !dataValida(validade))) throw httpErr(400, 'Cupom ' + codigo + ': validade precisa ser uma data válida (AAAA-MM-DD).');
  return { codigo, tipo, valor, minimo, validade, primeiraCompra: c.primeiraCompra === true, ativo: c.ativo !== false };
}
/* o cupom que o cliente pode usar agora (sem olhar o telefone ainda): existe, ativo e dentro da validade */
function cupomVigente(cfg, codigo) {
  const cod = cupomCodigo(codigo);
  if (!cod) return null;
  const c = (cfg.cupons || []).find(x => x && x.codigo === cod);
  if (!c) throw httpErr(404, 'Cupom não encontrado. Confira o código.');
  if (c.ativo === false) throw httpErr(410, 'Este cupom não está mais valendo.');
  if (c.validade && c.validade < hojeSP()) throw httpErr(410, 'Este cupom venceu em ' + c.validade.split('-').reverse().join('/') + '.');
  return c;
}
const descontoDe = (c, subtotal) => r2(Math.min(subtotal, c.tipo === 'pct' ? subtotal * Number(c.valor) / 100 : Number(c.valor)));
async function aplicarCupom(q, tid, cfg, codigo, subtotal, tel) {
  const c = cupomVigente(cfg, codigo);
  if (!c) return { cupom: null, desconto: 0 };
  if (Number(c.minimo) > 0 && subtotal < Number(c.minimo)) throw httpErr(400, 'O cupom ' + c.codigo + ' vale para pedidos a partir de R$ ' + Number(c.minimo).toFixed(2).replace('.', ',') + '.');
  if (c.primeiraCompra) {
    // dois pedidos do mesmo WhatsApp ao mesmo tempo (produtos diferentes): um de cada vez, senão os dois levariam o desconto
    await q('select pg_advisory_xact_lock(hashtext($1))', [tid + ':cupom1:' + tel]);
    const n = Number((await q(`select count(*)::int n from loja_pedidos where tenant_id=$1 and cliente_tel=$2 and status <> 'cancelado'`, [tid, tel])).rows[0].n);
    if (n) throw httpErr(400, 'O cupom ' + c.codigo + ' é só para a primeira compra, e este WhatsApp já fez pedido aqui.');
  }
  return { cupom: c.codigo, desconto: descontoDe(c, subtotal) };
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
  const produtos = r.rows.map(p => vitrineProd(p, T));
  montarJunto(produtos, await paresDaLoja(q, T.id));
  const avaliacoes = await avaliacoesDaLoja(q, T.id);
  return { loja: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo }, config: cfgPublica(cfg, T), produtos, pagamentosNomes: PAGAMENTOS, avaliacoes };
}
/* o cliente confere um cupom antes de fechar (mínimo e "primeira compra" são conferidos de novo no pedido) */
async function verCupom(T, codigo) {
  lojaAberta(T);
  const cfg = await getCfg((a, p) => db.query(a, p), T.id);
  const c = cupomVigente(cfg, codigo);
  if (!c) throw httpErr(400, 'Escreva o código do cupom.');
  return { cupom: { codigo: c.codigo, tipo: c.tipo, valor: Number(c.valor), minimo: Number(c.minimo) || 0, primeiraCompra: !!c.primeiraCompra, validade: c.validade || '' } };
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
  try { return await novoPedido1(T, b, ip); }
  catch (e) {
    // o mesmo pedido enviado ao mesmo tempo: um grava, o outro bate na chave única e responde "repetido"
    if (e.code !== '23505') throw e;
    const dup = (await db.query('select numero, chave_hash from loja_pedidos where tenant_id=$1 and id=$2', [T.id, String(b.id)])).rows[0];
    if (!dup || dup.chave_hash !== sha(T.id + ':' + b.chave)) throw httpErr(409, 'Pedido inválido.');
    return { numero: Number(dup.numero), repetido: true };
  }
}
async function novoPedido1(T, b, ip) {
  lojaAberta(T);
  const tid = T.id;
  const id = idOf('pedido', b.id, 'Pedido');
  if (typeof b.chave !== 'string' || !/^[a-f0-9]{32}$/.test(b.chave)) throw httpErr(400, 'Pedido inválido.');
  const chaveHash = sha(tid + ':' + b.chave);
  // limite de envios: por aparelho/IP e pela loja inteira (contados antes de gravar)
  if (await auth.hit('lojaped:' + tid + ':' + ip) > 30) throw httpErr(429, 'Muitos pedidos seguidos. Espere alguns minutos ou fale com a loja pelo WhatsApp.');
  const c = b.cliente && typeof b.cliente === 'object' ? b.cliente : {};
  const nome = linha(c.nome, 80, 'Seu nome', true);
  const tel = telefone(c.telefone);
  const entrega = b.entrega === 'entrega' ? 'entrega' : b.entrega === 'retirada' ? 'retirada' : null;
  if (!entrega) throw httpErr(400, 'Escolha entrega ou retirada.');
  const endereco = entrega === 'entrega' ? txt(b.endereco, 300, 'Endereço', true) : null;
  const pagamento = typeof b.pagamento === 'string' ? b.pagamento : '';
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
    if (Number(cfg.pedidoMinimo) > 0 && M.subtotal < Number(cfg.pedidoMinimo)) throw httpErr(400, 'O pedido mínimo é de R$ ' + Number(cfg.pedidoMinimo).toFixed(2).replace('.', ',') + '.');
    // cupom (quando o cliente digitou um) e entrega grátis a partir de um valor: as duas regras valem AQUI, não só na tela
    if (b.cupom != null && typeof b.cupom !== 'string') throw httpErr(400, 'Cupom inválido.');
    const { cupom, desconto } = await aplicarCupom(q, tid, cfg, b.cupom, M.subtotal, tel);
    const taxa = taxaDe(cfg, entrega, M.subtotal);
    const total = r2(M.subtotal - desconto + taxa);
    if (total > 1000000) throw httpErr(400, 'Pedido grande demais para a loja online. Fale com a loja pelo WhatsApp.');
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
    // quem já tem pedidos esperando a loja confirmar não segura mais estoque (evita "esgotar" a loja de brincadeira)
    const abertos = Number((await q(`select count(*)::int n from loja_pedidos where tenant_id=$1 and status='novo' and (cliente_tel=$2 or ip=$3)`, [tid, tel, String(ip).slice(0, 64)])).rows[0].n);
    if (abertos >= 5) throw httpErr(429, 'Você já tem pedidos esperando a loja confirmar. Fale com a loja pelo WhatsApp.');
    // limite da loja inteira: conta só o pedido que passou por todas as conferências (lixo não tranca a loja)
    if (await auth.hit('lojaped:' + tid) > 400) throw httpErr(429, 'A loja recebeu muitos pedidos agora. Tente de novo em alguns minutos ou fale com a loja pelo WhatsApp.');
    const n = Number((await q(`insert into loja_seq(tenant_id,last_no) values($1,1) on conflict(tenant_id) do update set last_no=loja_seq.last_no+1 returning last_no`, [tid])).rows[0].last_no);
    const hist = [{ status: 'novo', em: new Date().toISOString() }];
    await q(`insert into loja_pedidos(tenant_id,id,numero,chave_hash,cliente_nome,cliente_tel,entrega,endereco,pagamento,obs,itens,subtotal,taxa_entrega,total,estoque_baixado,historico,ip,cupom,desconto)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16::jsonb,$17,$18,$19)`,
    [tid, id, n, chaveHash, nome, tel, entrega, endereco, pagamento, obs, JSON.stringify(M.itens), M.subtotal, taxa, total, baixou, JSON.stringify(hist), String(ip).slice(0, 64), cupom, desconto]);
    juntoCache.delete(tid); // pedido novo: o "Peça junto" recalcula na próxima vitrine
    return { numero: n, total, taxaEntrega: taxa, desconto, cupom };
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

const KEEP = Symbol('mantem'), NOVO = Symbol('novo');
const estoqueDe = (v, label) => (v === '' || v == null ? null : inteiro(v, label, 0, 1000000));
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
      const est = T.modules.l_estoque ? estoqueDe(v.estoque, 'Estoque de ' + vn) : KEEP;
      return { id: vid, nome: vn, estoque: est, visto: Object.prototype.hasOwnProperty.call(v, 'estoqueVisto') ? estoqueDe(v.estoqueVisto, 'Estoque') : NOVO };
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
  const estPedido = T.modules.l_estoque ? (variacoes.length && T.modules.l_variacoes ? null : estoqueDe(b.estoque, 'Estoque')) : KEEP;
  const estVisto = Object.prototype.hasOwnProperty.call(b, 'estoqueVisto') ? estoqueDe(b.estoqueVisto, 'Estoque') : NOVO;
  const descricao = txt(b.descricao, 1500, 'Descrição'), categoria = linha(b.categoria, 40, 'Categoria');
  const temCod = Object.prototype.hasOwnProperty.call(b, 'codigo'), codigo = temCod ? codigoDe(b.codigo, 'Código') : null;
  const temCusto = Object.prototype.hasOwnProperty.call(b, 'custo'), custo = temCusto && b.custo !== '' && b.custo != null ? reais(b.custo, 'Custo', { allowZero: true }) : null;
  // grava travando o produto: o estoque que a dona NÃO mexeu fica como está agora (uma venda pode ter baixado);
  // se ela mexeu e ele mudou desde que ela abriu, recusa para ela conferir (não devolve peça que já foi vendida)
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    const atual = (await q('select * from loja_produtos where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    const muda = (pedido, visto, agora, nome) => {
      if (pedido === KEEP) return agora === undefined ? null : agora;
      if (visto === NOVO) return pedido;                          // produto ou opção nova
      if (agora === undefined) throw httpErr(409, nome + ' foi apagado em outra tela desde que você abriu. Feche e abra o produto de novo para conferir.');
      if (pedido === visto) return agora;                        // não mexeu: fica o de agora
      if (agora !== visto) throw httpErr(409, 'O estoque de ' + nome + ' mudou (teve venda ou cancelamento) desde que você abriu. Feche e abra o produto de novo para conferir.');
      return pedido;
    };
    const vars = variacoes.map(v => {
      if (v.visto === undefined) return v; // variações gravadas mantidas (função desligada)
      const old = atual && (atual.variacoes || []).find(x => x.id === v.id);
      return { id: v.id, nome: v.nome, estoque: muda(v.estoque, v.visto, old ? (old.estoque == null ? null : old.estoque) : undefined, nome + ' (' + v.nome + ')') };
    });
    const estoque = muda(estPedido, estVisto, atual ? atual.estoque : undefined, nome);
    await q(`insert into loja_produtos(tenant_id,id,nome,descricao,categoria,preco,preco_de,unidade,fotos,grupo_var,variacoes,estoque,faixas,ativo,destaque,codigo,custo)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$18)
    on conflict(tenant_id,id) do update set nome=excluded.nome, descricao=excluded.descricao, categoria=excluded.categoria, preco=excluded.preco, preco_de=excluded.preco_de,
      unidade=excluded.unidade, fotos=excluded.fotos, grupo_var=excluded.grupo_var, variacoes=excluded.variacoes, estoque=excluded.estoque, faixas=excluded.faixas,
      ativo=excluded.ativo, destaque=excluded.destaque, codigo=case when $17 then excluded.codigo else loja_produtos.codigo end, custo=case when $19 then excluded.custo else loja_produtos.custo end, updated_at=now()`,
  [tid, id, nome, descricao, categoria, preco, precoDe, unidade, JSON.stringify(fotos), grupoVar, JSON.stringify(vars), estoque, JSON.stringify(faixas), b.ativo !== false, b.destaque === true, codigo, temCod, custo, temCusto]);
    return { id, novo: !atual };
  }).catch(e => { if (e && e.code === '23505') throw httpErr(409, 'Já tem outro produto com o código ' + codigo + '.'); throw e; }).then(async r => { await limparFotos(tid); return r; });
}
/* ---------- importação de produtos (planilha do Excel ou resultado do StarIA) ----------
   Tudo numa transação: ou entram todas as linhas, ou nenhuma (o erro diz a linha).
   Código já cadastrado = atualiza aquele produto (nome, preço, custo e o que veio preenchido); sem código ou código novo = produto novo. */
const MAX_IMPORT = 1000;
const codigoDe = (v, label) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' && typeof v !== 'number') throw httpErr(400, label + ': código inválido.');
  const s = String(v).trim().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[A-Za-z0-9._\/-]{1,30}$/.test(s)) throw httpErr(400, label + ': código inválido (use só letras, números, ponto ou traço, até 30).');
  return s;
};
async function importar(tid, T, b, user) {
  const itens = Array.isArray(b.itens) ? b.itens : null;
  if (!itens || !itens.length) throw httpErr(400, 'Nenhum produto para importar.');
  if (itens.length > MAX_IMPORT) throw httpErr(400, 'No máximo ' + MAX_IMPORT + ' produtos por vez.');
  const jobId = b.stariaId == null ? null : idOf('staria', b.stariaId, 'Consulta do StarIA');
  if (jobId) need(T, 'l_staria_imp', 'Importação pelo StarIA desligada para esta loja.');
  const vistos = new Set();
  const L = itens.map((it, i) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) throw httpErr(400, 'Linha ' + (i + 1) + ' inválida.');
    const n = Number.isInteger(it.linha) && it.linha > 0 && it.linha < 1e6 ? it.linha : i + 1, lb = 'Linha ' + n;
    const tem = k => Object.prototype.hasOwnProperty.call(it, k) && it[k] !== '' && it[k] != null;
    const o = { n, lb };
    o.codigo = codigoDe(it.codigo, lb);
    if (o.codigo) { const k = o.codigo.toLowerCase(); if (vistos.has(k)) throw httpErr(400, lb + ': código ' + o.codigo + ' repetido na planilha.'); vistos.add(k); }
    o.nome = linha(it.nome, 80, lb + ' (nome)', true);
    o.preco = reais(it.preco, lb + ' (preço)');
    o.precoDe = tem('precoDe') ? reais(it.precoDe, lb + ' (preço "de")') : undefined;
    if (o.precoDe != null && o.precoDe <= o.preco) throw httpErr(400, lb + ': o preço "de" (riscado) precisa ser maior que o preço.');
    o.custo = tem('custo') ? reais(it.custo, lb + ' (custo)', { allowZero: true }) : undefined;
    o.estoque = tem('estoque') && T.modules.l_estoque ? inteiro(typeof it.estoque === 'string' && /^\d+$/.test(it.estoque.trim()) ? Number(it.estoque.trim()) : it.estoque, lb + ' (estoque)', 0, 1000000) : undefined;
    o.categoria = tem('categoria') ? linha(it.categoria, 40, lb + ' (categoria)') : undefined;
    o.descricao = tem('descricao') ? txt(it.descricao, 1500, lb + ' (descrição)') : undefined;
    if (tem('unidade')) { const u = String(it.unidade).trim().toLowerCase(); if (!UNIDADES.includes(u)) throw httpErr(400, lb + ': unidade inválida (use ' + UNIDADES.join(', ') + ').'); o.unidade = u; }
    return o;
  });
  return db.tx(async t => {
    const q = (a, p) => t.query(a, p);
    let job = null;
    if (jobId) {
      job = (await q('select status, tipo from loja_staria where tenant_id=$1 and id=$2 for update', [tid, jobId])).rows[0];
      if (!job || job.tipo === 'precos') throw httpErr(404, 'Consulta do StarIA não encontrada.');
      if (job.status === 'pendente') throw httpErr(409, 'O StarIA ainda não respondeu esta consulta.');
    }
    const cods = L.filter(o => o.codigo).map(o => o.codigo);
    const ex = new Map();
    if (cods.length) {
      const r = await q(`select * from loja_produtos where tenant_id=$1 and lower(codigo) in (select jsonb_array_elements_text($2::jsonb)) order by id for update`, [tid, JSON.stringify(cods.map(c => c.toLowerCase()))]);
      r.rows.forEach(p => ex.set(String(p.codigo).toLowerCase(), p));
    }
    const novos = L.filter(o => !o.codigo || !ex.has(o.codigo.toLowerCase())).length;
    const total = Number((await q('select count(*)::int n from loja_produtos where tenant_id=$1', [tid])).rows[0].n);
    if (total + novos > MAX_PRODUTOS) throw httpErr(400, 'Passa do limite de ' + MAX_PRODUTOS + ' produtos da loja (hoje tem ' + total + ', a importação cria ' + novos + ').');
    let criados = 0, atualizados = 0;
    for (const o of L) {
      const cur = o.codigo ? ex.get(o.codigo.toLowerCase()) : null;
      if (cur) {
        if (T.modules.l_volume && (cur.faixas || []).some(f => Number(f.preco) >= o.preco)) throw httpErr(400, o.lb + ': o produto "' + cur.nome + '" tem preço por quantidade maior ou igual ao preço novo. Ajuste as faixas dele antes.');
        const temVar = T.modules.l_variacoes && (cur.variacoes || []).length > 0;
        await q(`update loja_produtos set nome=$3, preco=$4, preco_de=case when $5::boolean then $6 else (case when preco_de > $4 then preco_de else null end) end,
          custo=case when $7::boolean then $8 else custo end, estoque=case when $9::boolean then $10 else estoque end,
          categoria=coalesce($11, categoria), descricao=coalesce($12, descricao), unidade=coalesce($13, unidade), updated_at=now() where tenant_id=$1 and id=$2`,
        [tid, cur.id, o.nome, o.preco, o.precoDe !== undefined, o.precoDe === undefined ? null : o.precoDe, o.custo !== undefined, o.custo === undefined ? null : o.custo,
          o.estoque !== undefined && !temVar, o.estoque === undefined ? null : o.estoque, o.categoria || null, o.descricao || null, o.unidade || null]);
        atualizados++;
      } else {
        const id = 'x' + crypto.randomBytes(6).toString('hex');
        await q(`insert into loja_produtos(tenant_id,id,nome,descricao,categoria,preco,preco_de,unidade,estoque,codigo,custo) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [tid, id, o.nome, o.descricao || null, o.categoria || null, o.preco, o.precoDe || null, o.unidade || 'un', o.estoque === undefined ? null : o.estoque, o.codigo, o.custo === undefined ? null : o.custo]);
        criados++;
      }
    }
    if (jobId) await q(`update loja_staria set status='importada' where tenant_id=$1 and id=$2`, [tid, jobId]);
    return { criados, atualizados };
  }).catch(e => { if (e && (e.code === '23505' || e.code === '40P01')) throw httpErr(409, 'Outra importação gravou os mesmos códigos agora há pouco. Importe de novo: eles vão ser atualizados.'); throw e; });
}

/* ---------- consultas ao StarIA ----------
   O site não fala com o StarIA: a loja grava o pedido (códigos ou EANs), o Claude consulta e devolve o resultado,
   e a loja revisa e importa. O que vem do StarIA é só dado (texto limpo, números conferidos). */
const MAX_TERMOS = 300;
const stariaOut = j => ({ id: j.id, tipo: j.tipo || 'importar', termos: j.termos, status: j.status, resultados: j.resultados || {}, criadoPor: j.criado_por, criadoEm: j.created_at, feitoEm: j.feito_em, feitoPor: j.feito_por });
async function stariaPedir(tid, T, b, user) {
  const id = idOf('staria', b.id, 'Consulta');
  const tipo = b.tipo === 'precos' ? 'precos' : 'importar';
  need(T, tipo === 'precos' ? 'l_staria_preco' : 'l_staria_imp', tipo === 'precos' ? 'Atualização de preço pelo StarIA desligada para esta loja.' : 'Importação pelo StarIA desligada para esta loja.');
  let termos;
  if (tipo === 'precos') {
    // atualização de preço: o próprio servidor junta os códigos de todos os produtos que têm código (só números = código do StarIA)
    const r = await db.query(`select codigo from loja_produtos where tenant_id=$1 and codigo ~ '^[0-9]{1,14}$' order by codigo`, [tid]);
    termos = [...new Set(r.rows.map(x => x.codigo))];
    if (!termos.length) throw httpErr(400, 'Nenhum produto com código do StarIA. Coloque o código (só números) nos produtos ou importe pelo StarIA.');
    if (termos.length > MAX_PRODUTOS) throw httpErr(400, 'Produtos demais para uma atualização.');
    const ab = Number((await db.query(`select count(*)::int n from loja_staria where tenant_id=$1 and tipo='precos' and status='pendente'`, [tid])).rows[0].n);
    if (ab) throw httpErr(409, 'Já tem uma atualização de preço esperando o StarIA.');
  } else {
  const brutos = Array.isArray(b.termos) ? b.termos : typeof b.termos === 'string' ? b.termos.split(/[\s,;]+/) : [];
  termos = [...new Set(brutos.map(x => (typeof x === 'string' || typeof x === 'number') ? String(x).replace(/\D/g, '') : '').filter(Boolean))];
  if (!termos.length) throw httpErr(400, 'Escreva pelo menos um código ou EAN (só números).');
  if (termos.length > MAX_TERMOS) throw httpErr(400, 'No máximo ' + MAX_TERMOS + ' códigos por consulta.');
  if (termos.some(x => x.length > 14)) throw httpErr(400, 'Código ou EAN com mais de 14 números.');
  }
  const pend = Number((await db.query(`select count(*)::int n from loja_staria where tenant_id=$1 and status='pendente'`, [tid])).rows[0].n);
  if (pend >= 20) throw httpErr(429, 'Já tem 20 consultas esperando o StarIA. Peça ao Claude para processar antes de pedir mais.');
  const r = await db.query(`insert into loja_staria(tenant_id,id,termos,criado_por,tipo) values($1,$2,$3::jsonb,$4,$5) on conflict do nothing returning id`, [tid, id, JSON.stringify(termos), user.name || user.login, tipo]);
  return { id, tipo, termos: termos.length, repetido: !r.rows[0] };
}
function stariaItem(v, termo) {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw httpErr(400, 'Resultado de ' + termo + ' inválido.');
  const dig = (x, max) => { const s = x == null ? '' : String(x).replace(/\D/g, ''); return s && s.length <= max ? s : null; };
  const num = (x, label) => { if (x == null || x === '') return null; const n = Number(x); if (!isFinite(n) || n < 0 || n > 10000000) throw httpErr(400, label + ' de ' + termo + ' inválido.'); return r2(n); };
  const nome = linha(v.nome, 80, 'Nome de ' + termo);
  if (!nome) throw httpErr(400, 'Resultado de ' + termo + ' sem nome.');
  let est = null;
  if (v.estoque != null && v.estoque !== '') { const n = Number(v.estoque); if (!isFinite(n)) throw httpErr(400, 'Estoque de ' + termo + ' inválido.'); est = Math.min(1000000, Math.max(0, Math.floor(n))); } // ERP com estoque negativo: 0 na loja
  return { codigo: dig(v.codigo, 20), ean: dig(v.ean, 14), nome, custo: num(v.custo, 'Custo'), precoVenda: num(v.precoVenda, 'Preço de venda'), estoque: est, fonte: linha(v.fonte, 200, 'Fonte') || null, varios: v.varios === true };
}
/* atualização de preço: precoVenda = preço normal de venda agora; precoPromo = promoção EM VIGOR hoje (ou null) */
function stariaPreco(v, termo) {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw httpErr(400, 'Resultado de ' + termo + ' inválido.');
  const num = (x, label, req) => { if (x == null || x === '') { if (req) throw httpErr(400, label + ' de ' + termo + ' faltando.'); return null; } const n = Number(x); if (!isFinite(n) || n <= 0 || n > 10000000) throw httpErr(400, label + ' de ' + termo + ' inválido.'); return r2(n); };
  const precoVenda = num(v.precoVenda, 'Preço de venda', true);
  let precoPromo = num(v.precoPromo, 'Preço da promoção', false);
  if (precoPromo != null && precoPromo >= precoVenda) precoPromo = null; // "promoção" igual ou maior que o preço normal não é promoção
  const data = x => x == null || x === '' ? null : (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? String(x) : (() => { throw httpErr(400, 'Data de ' + termo + ' inválida (AAAA-MM-DD).'); })());
  return { nome: linha(v.nome, 80, 'Nome de ' + termo) || null, precoVenda, precoPromo, promoAte: precoPromo == null ? null : data(v.promoAte), fonte: linha(v.fonte, 200, 'Fonte') || null };
}
async function stariaResultado(tid, b, user) {
  const id = idOf('staria', b.id, 'Consulta');
  const res = b.resultados;
  if (!res || typeof res !== 'object' || Array.isArray(res)) throw httpErr(400, 'Resultados inválidos.');
  return db.tx(async t => {
    const j = (await t.query('select * from loja_staria where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!j) throw httpErr(404, 'Consulta não encontrada.');
    if (j.status === 'importada') throw httpErr(409, 'Esta consulta já foi importada.');
    const out = {};
    for (const termo of j.termos) {
      if (!Object.prototype.hasOwnProperty.call(res, termo)) throw httpErr(400, 'Falta o resultado de ' + termo + ' (use null se não achou).');
      out[termo] = (j.tipo === 'precos' ? stariaPreco : stariaItem)(res[termo], termo);
    }
    if (Object.keys(res).some(k => !j.termos.includes(k))) throw httpErr(400, 'Resultado de um código que não foi pedido.');
    await t.query(`update loja_staria set status='pronta', resultados=$3::jsonb, feito_em=now(), feito_por=$4 where tenant_id=$1 and id=$2`, [tid, id, JSON.stringify(out), user.name || user.login]);
    return { id, achados: Object.values(out).filter(Boolean).length };
  });
}
/* aplica a atualização de preço: preço = promoção em vigor, se houver; senão o preço de venda normal.
   Com promoção, o preço normal vira o "de" (riscado na vitrine); sem promoção, o "de" sai. */
async function stariaAplicar(tid, T, b, user) {
  need(T, 'l_staria_preco', 'Atualização de preço pelo StarIA desligada para esta loja.');
  const id = idOf('staria', b.id, 'Consulta');
  return db.tx(async t => {
    const j = (await t.query('select * from loja_staria where tenant_id=$1 and id=$2 for update', [tid, id])).rows[0];
    if (!j || j.tipo !== 'precos') throw httpErr(404, 'Atualização de preço não encontrada.');
    if (j.status === 'pendente') throw httpErr(409, 'O StarIA ainda não respondeu esta atualização.');
    if (j.status === 'importada') throw httpErr(409, 'Estes preços já foram aplicados.');
    const res = j.resultados || {};
    const prods = (await t.query(`select * from loja_produtos where tenant_id=$1 and codigo ~ '^[0-9]{1,14}$' order by id for update`, [tid])).rows;
    let atualizados = 0, iguais = 0, semResultado = 0; const pulados = [];
    for (const p of prods) {
      const r = res[p.codigo];
      if (!r || !(r.precoVenda > 0)) { semResultado++; continue; }
      const promo = r.precoPromo != null && r.precoPromo < r.precoVenda;
      const preco = promo ? r2(r.precoPromo) : r2(r.precoVenda), de = promo ? r2(r.precoVenda) : null;
      if (Number(p.preco) === preco && (p.preco_de == null ? null : Number(p.preco_de)) === de) { iguais++; continue; }
      if (T.modules.l_volume && (p.faixas || []).some(f => Number(f.preco) >= preco)) { pulados.push({ nome: p.nome, motivo: 'tem preço por quantidade maior ou igual ao novo preço' }); continue; }
      await t.query('update loja_produtos set preco=$3, preco_de=$4, updated_at=now() where tenant_id=$1 and id=$2', [tid, p.id, preco, de]);
      atualizados++;
    }
    await t.query(`update loja_staria set status='importada' where tenant_id=$1 and id=$2`, [tid, id]);
    return { id, atualizados, iguais, semResultado, pulados };
  });
}
async function stariaExcluir(tid, b) {
  const id = idOf('staria', b.id, 'Consulta');
  await db.query('delete from loja_staria where tenant_id=$1 and id=$2', [tid, id]);
  return { id };
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
  await limparFotos(tid); // fotos enviadas e nunca usadas não se acumulam
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
    // campos novos: tela antiga (sem eles) não apaga o que estava gravado
    c.entregaGratisDe = Object.prototype.hasOwnProperty.call(b, 'entregaGratisDe') ? reais(b.entregaGratisDe === '' || b.entregaGratisDe == null ? 0 : b.entregaGratisDe, 'Entrega grátis a partir de', { allowZero: true }) : Number(cur.entregaGratisDe) || 0;
  } else { c.retirada = true; c.entrega = cur.entrega; c.taxaEntrega = cur.taxaEntrega; c.entregaObs = cur.entregaObs; c.entregaGratisDe = Number(cur.entregaGratisDe) || 0; }
  c.pedidoMinimo = reais(b.pedidoMinimo === '' || b.pedidoMinimo == null ? 0 : b.pedidoMinimo, 'Pedido mínimo', { allowZero: true });
  if (Object.prototype.hasOwnProperty.call(b, 'tempoPreparo')) { const t = b.tempoPreparo === '' || b.tempoPreparo == null ? 0 : (typeof b.tempoPreparo === 'string' && /^\d+$/.test(b.tempoPreparo.trim()) ? Number(b.tempoPreparo) : b.tempoPreparo); c.tempoPreparo = inteiro(t, 'Tempo de preparo (min)', 0, 1440); } else c.tempoPreparo = Number(cur.tempoPreparo) || 0;
  c.entregaHoje = Object.prototype.hasOwnProperty.call(b, 'entregaHoje') ? (linha(b.entregaHoje, 40, 'Entrega hoje até') || '') : (cur.entregaHoje || '');
  if (Object.prototype.hasOwnProperty.call(b, 'cupons')) {
    // tem que ser uma lista: qualquer outra coisa é recusada (um envio errado não pode apagar todos os cupons)
    if (b.cupons != null && !Array.isArray(b.cupons)) throw httpErr(400, 'Cupons inválidos.');
    const cs = Array.isArray(b.cupons) ? b.cupons : [];
    if (cs.length > 50) throw httpErr(400, 'No máximo 50 cupons.');
    c.cupons = cs.map(cupomLimpo);
    if (new Set(c.cupons.map(x => x.codigo)).size !== c.cupons.length) throw httpErr(400, 'Tem cupom com o mesmo código repetido.');
  } else c.cupons = Array.isArray(cur.cupons) ? cur.cupons : [];
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
      const vol = (o.itens || []).filter(x => x.baixou && ID_RE.produto.test(String(x.produtoId)));
      // trava todos os produtos do pedido de uma vez e na mesma ordem do pedido novo (sem impasse entre dois cancelamentos)
      const ids = [...new Set(vol.map(x => x.produtoId))];
      const prods = ids.length ? (await q(`select * from loja_produtos where tenant_id=$1 and id = any($2::text[]) order by id for update`, [tid, '{' + ids.join(',') + '}'])).rows : [];
      for (const p of prods) {
        // estoque em branco ("não controla") continua em branco
        const vs = (p.variacoes || []).map(v => { const n = vol.filter(x => x.produtoId === p.id && x.variacaoId === v.id).reduce((a, x) => a + x.qtd, 0); return n && v.estoque != null ? Object.assign({}, v, { estoque: v.estoque + n }) : v; });
        const nSimples = vol.filter(x => x.produtoId === p.id && !x.variacaoId).reduce((a, x) => a + x.qtd, 0);
        await q('update loja_produtos set variacoes=$3::jsonb, estoque=case when estoque is null then null else estoque+$4 end, updated_at=now() where tenant_id=$1 and id=$2', [tid, p.id, JSON.stringify(vs), nSimples]);
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
  const [cfg, prods, peds, mes, sj, cu] = await Promise.all([
    getCfg(q, tid),
    q('select * from loja_produtos where tenant_id=$1 order by ativo desc, destaque desc, nome', [tid]),
    q(`select * from loja_pedidos where tenant_id=$1 order by created_at desc limit 500`, [tid]),
    q(`select coalesce(sum(total),0) as total, count(*)::int as n from loja_pedidos where tenant_id=$1 and status in ('confirmado','pronto','entregue')
       and date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', now() at time zone 'America/Sao_Paulo')`, [tid]),
    q(`select * from loja_staria where tenant_id=$1 and (status <> 'importada' or created_at > now() - interval '7 days') order by created_at desc limit 30`, [tid]),
    q(`select cupom, count(*)::int as n from loja_pedidos where tenant_id=$1 and cupom is not null and status <> 'cancelado' group by cupom`, [tid])
  ]);
  const cuponsUso = {}; cu.rows.forEach(x => { cuponsUso[x.cupom] = x.n; });
  return { me: { nome: user.name || user.login }, empresa: { id: T.id, nome: T.name, cor: T.color || null, logo: !!T.logo, status: T.status }, modulos: T.modules, config: cfgEfetiva(cfg, T), produtos: prods.rows.map(p => prodOut(p, true)), pedidos: peds.rows.map(o => pedOut(o, true)), mes: { vendido: Number(mes.rows[0].total), pedidos: mes.rows[0].n }, pagamentosNomes: PAGAMENTOS, unidades: UNIDADES, staria: sj.rows.map(stariaOut), cuponsUso };
}

/* rotas públicas (sem login): /api/loja/vitrine, /api/loja/pedido, /api/loja/acompanhar, /api/loja/foto/<id> */
async function publico(ctx) {
  const { path, method, T, query, body, ip } = ctx;
  if (path === '/api/loja/vitrine' && method === 'GET') return { json: await vitrine(T) };
  if (path === '/api/loja/pedido' && method === 'POST') return { json: await novoPedido(T, await body(), ip) };
  if (path === '/api/loja/avaliar' && method === 'POST') {
    if (await auth.hit('lojaaval:' + T.id + ':' + ip) > 30) throw httpErr(429, 'Muitas tentativas. Espere alguns minutos.');
    return { json: await avaliarPedido(T, await body()) };
  }
  if (path === '/api/loja/acompanhar' && method === 'GET') {
    if (await auth.hit('lojaver:' + T.id + ':' + ip) > 300) throw httpErr(429, 'Muitas consultas. Espere alguns minutos.');
    return { json: await verPedido(T, query.get('c')) };
  }
  if (path === '/api/loja/cupom' && method === 'GET') {
    // por aparelho/IP e pela loja inteira (muitos IPs tentando adivinhar códigos curtos não passam do limite da loja)
    if (await auth.hit('lojacup:' + T.id + ':' + ip) > 60 || await auth.hit('lojacup:' + T.id) > 600) throw httpErr(429, 'Muitas tentativas de cupom. Espere alguns minutos.');
    return { json: await verCupom(T, query.get('c')) };
  }
  if (path.startsWith('/api/loja/foto/') && method === 'GET') {
    if (T.status === 'suspensa') throw httpErr(404, 'Foto não encontrada.');
    const id = path.slice('/api/loja/foto/'.length); // o id é só letras e números (não precisa decodificar)
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
    case '/api/loja/admin/importar': out = await importar(tid, T, b, user); await audit('loja_importacao', { criados: out.criados, atualizados: out.atualizados, origem: b.stariaId ? 'staria' : 'planilha' }); break;
    case '/api/loja/admin/staria/pedir': out = await stariaPedir(tid, T, b, user); await audit('loja_staria_pedido', { id: out.id, termos: out.termos }); break;
    case '/api/loja/admin/staria/resultado': out = await stariaResultado(tid, b, user); await audit('loja_staria_resultado', { id: out.id, achados: out.achados }); break;
    case '/api/loja/admin/staria/excluir': out = await stariaExcluir(tid, b); break;
    case '/api/loja/admin/staria/aplicar-precos': out = await stariaAplicar(tid, T, b, user); await audit('loja_staria_precos', { id: out.id, atualizados: out.atualizados, iguais: out.iguais, semResultado: out.semResultado, pulados: out.pulados.length }); break;
    case '/api/loja/admin/pedido/status': out = await mudarStatus(tid, b, user); await audit('loja_pedido_status', { id: out.id, status: out.status }); break;
    default: throw httpErr(404, 'Não encontrado.');
  }
  return Object.assign({ ok: true }, out);
}

module.exports = { handle, publico, precoUnit, montar, PAGAMENTOS, taxaDe, descontoDe, montarJunto };

'use strict';
/*
 * Tino — Banco de dados de produtos (cadastro mestre).
 * Um banco reúne os produtos de um sistema de origem (ex.: o StarIA da Dávila): código interno, código de barras,
 * nome, foto e custo. O código interno é a chave: é ele que liga o mesmo produto entre os apps.
 * - A Central (super_admin) cria bancos, traz o que já está nas empresas, corrige produtos e liga cada empresa a um banco.
 * - A empresa ligada CONSULTA o banco: o app de pedidos busca produto por código/EAN no cadastro; o Gerador de Encartes
 *   recebe nome, código e foto de cada produto. Empresa sem banco continua igual.
 * - O site não fala com o StarIA: a Central deixa um pedido (banco_jobs) e o Claude consulta e devolve.
 * Custo: só chega a quem pode ver custo (Central e administrador com a permissão "custos").
 */
const crypto = require('crypto');
const db = require('./pg');

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
const FOTO_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_FOTO = 3 * 1024 * 1024;         // uma foto, já em base64
const MAX_TERMOS = 200;                   // códigos por pedido ao sistema de origem
const PAG = 50;
const RAMOS_USAM = ['atacado', 'encartes'];   // tipos de empresa que sabem usar um banco
const fotoId = b64 => crypto.createHash('sha256').update(b64).digest('hex').slice(0, 32);
const uid = () => crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').toLowerCase();
const J = v => JSON.stringify(v);

/* ---------- limpeza do que entra ---------- */
/* código interno: letras, números, ponto e traço; só números perde os zeros da frente ("00123" = "123") */
function cleanCodigo(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(s)) return '';
  if (!/^\d+$/.test(s)) return s;
  return s.replace(/^0+/, '');            // "000" vira vazio: não é código
}
function cleanEan(v) { const s = String(v == null ? '' : v).replace(/\D/g, ''); return s.length >= 8 && s.length <= 14 && !/^0+$/.test(s) ? s : ''; }
/* código de barras com dígito verificador errado (os internos da loja, com zeros na frente ou de balança, não são conferidos) */
function eanRuim(ean) {
  if (!ean) return false;
  if (/^0{5,}/.test(ean) || (ean.length === 13 && ean[0] === '2')) return false;
  if (![8, 12, 13, 14].includes(ean.length)) return true;
  const d = ean.split('').map(Number), chk = d.pop();
  let s = 0; d.reverse().forEach((x, i) => { s += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (s % 10)) % 10 !== chk;
}
function cleanNome(v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); }
function cleanValor(v, casas) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n >= 1e9) return null;
  const k = Math.pow(10, casas); return Math.round(n * k) / k;
}
function parseFoto(v) {
  const m = FOTO_RE.exec(String(v || ''));
  if (!m) throw httpErr(400, 'Imagem inválida (use PNG, JPG ou WEBP).');
  if (m[2].length > MAX_FOTO) throw httpErr(413, 'Imagem grande demais.');
  return { id: fotoId(m[2]), mime: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], b64: m[2] };
}
const cleanBancoId = v => { const s = String(v == null ? '' : v); return /^[a-z0-9-]{1,40}$/.test(s) ? s : ''; };
function slug(name) { return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'banco'; }

/* junta produtos repetidos no mesmo lote (o banco recusa o mesmo código duas vezes num envio): fica o primeiro valor preenchido */
function juntaLote(itens) {
  const m = new Map();
  for (const it of itens) {
    const cur = m.get(it.codigo);
    if (!cur) { m.set(it.codigo, Object.assign({}, it)); continue; }
    for (const k of ['ean', 'nome', 'custo', 'custo_fonte', 'preco']) if ((cur[k] == null || cur[k] === '') && it[k] != null && it[k] !== '') cur[k] = it[k];
  }
  return [...m.values()].map(x => Object.assign(x, { ean: x.ean || '', nome: x.nome || '', ean_ruim: eanRuim(x.ean || '') }));
}
/* grava um lote. modo 'completa': só preenche o que está vazio (o que já está no banco não muda).
   modo 'origem': o sistema de origem manda no nome, no código de barras, no preço e no custo que vierem. */
async function gravaLote(q, bancoId, itens, fonte, modo) {
  const L = juntaLote(itens);
  const origem = modo === 'origem';
  for (let i = 0; i < L.length; i += 400) {
    await q(`insert into banco_produtos(banco_id,codigo,ean,ean_ruim,nome,custo,custo_fonte,custo_at,preco,fonte,staria,staria_at)
      select $1, x.codigo, nullif(x.ean,''), coalesce(x.ean_ruim,false), coalesce(x.nome,''), x.custo,
        case when x.custo is null then null else coalesce(x.custo_fonte,$3) end, case when x.custo is null then null else now() end, x.preco, $3,
        ${origem ? `'ok', now()` : 'null, null'}
      from jsonb_to_recordset($2::jsonb) as x(codigo text, ean text, ean_ruim boolean, nome text, custo numeric, custo_fonte text, preco numeric)
      on conflict (banco_id,codigo) do update set ` + (origem ? `
        ean = coalesce(excluded.ean, banco_produtos.ean),
        ean_ruim = case when excluded.ean is not null then excluded.ean_ruim else banco_produtos.ean_ruim end,
        nome = case when excluded.nome <> '' then excluded.nome else banco_produtos.nome end,
        custo = coalesce(excluded.custo, banco_produtos.custo),
        custo_fonte = case when excluded.custo is not null then excluded.custo_fonte else banco_produtos.custo_fonte end,
        custo_at = case when excluded.custo is not null then excluded.custo_at else banco_produtos.custo_at end,
        preco = coalesce(excluded.preco, banco_produtos.preco),
        staria = 'ok', staria_at = now(), updated_at = now()` : `
        ean = coalesce(banco_produtos.ean, excluded.ean),
        ean_ruim = case when banco_produtos.ean is null then excluded.ean_ruim else banco_produtos.ean_ruim end,
        nome = case when banco_produtos.nome = '' then excluded.nome else banco_produtos.nome end,
        custo = coalesce(banco_produtos.custo, excluded.custo),
        custo_fonte = case when banco_produtos.custo is null then excluded.custo_fonte else banco_produtos.custo_fonte end,
        custo_at = case when banco_produtos.custo is null then excluded.custo_at else banco_produtos.custo_at end,
        preco = coalesce(banco_produtos.preco, excluded.preco),
        updated_at = now()`), [bancoId, J(L.slice(i, i + 400)), fonte]);
  }
  return L.length;
}
async function conta(bancoId) {
  const r = await db.query(`select count(*)::int as n, count(foto)::int as f, count(custo)::int as c from banco_produtos where banco_id=$1`, [bancoId]);
  return r.rows[0];
}

/* ---------- trazer o que já está nas empresas ---------- */
/* App de pedidos (atacado, distribuidora): produtos com código, o custo e a foto de cada um.
   Custo de embalagem (fardo, caixa) entra dividido pela quantidade da embalagem: o banco guarda o custo de UMA unidade. */
async function absorveAtacado(bancoId, t) {
  const r = await db.query(`select data->>'code' as code, data->>'ean' as ean, data->>'name' as name, data->>'cost' as cost, data->>'perPack' as pack, data->>'photo' as photo
    from docs_t where tenant_id=$1 and coll='products' order by ord nulls last, updated_at`, [t.id]);
  return entraAtacado(bancoId, t, r.rows);
}
/* produtos do app de pedidos entrando no banco. Nome, código de barras e custo só preenchem o que está vazio.
   A foto também, a não ser que a linha venha com troca=true (o administrador acabou de trocar a foto do produto). */
async function entraAtacado(bancoId, t, rows) {
  const itens = [], fotos = []; let semCodigo = 0;
  for (const p of rows) {
    const codigo = cleanCodigo(p.code);
    if (!codigo) { semCodigo++; continue; }
    const pack = Number(p.pack) > 1 ? Number(p.pack) : 1;
    const bruto = cleanValor(p.cost, 4);
    const custo = bruto != null && bruto > 0 ? Math.round(bruto / pack * 10000) / 10000 : null;
    itens.push({ codigo, ean: cleanEan(p.ean), nome: cleanNome(p.name), custo, custo_fonte: custo == null ? null : t.name + (pack > 1 ? ' (custo da embalagem ÷ ' + pack + ')' : '') });
    const m = /^\/api\/photo\/(.+)$/.exec(String(p.photo || ''));
    if (m) { let pid = ''; try { pid = decodeURIComponent(m[1]); } catch (e) { pid = ''; } if (pid.startsWith('p:')) fotos.push({ codigo, pid, troca: p.troca === true }); }
  }
  await gravaLote((a, b) => db.query(a, b), bancoId, itens, t.name, 'completa');
  // fotos: copiadas de uma tabela para a outra dentro do banco (não passam pelo servidor)
  const HASH = `substr(encode(sha256(convert_to(split_part(ph.data,',',2),'UTF8')),'hex'),1,32)`;
  const OK = `ph.data ~ '^data:image/(png|jpe?g|webp|gif);base64,' and length(ph.data) <= ${MAX_FOTO + 64}`;
  for (let i = 0; i < fotos.length; i += 40) {
    const lote = J(fotos.slice(i, i + 40));
    const FROM = `from jsonb_to_recordset($3::jsonb) as x(codigo text, pid text, troca boolean)
      join photos_t ph on ph.tenant_id=$2 and ph.id=x.pid
      join banco_produtos bp on bp.banco_id=$1 and bp.codigo=x.codigo and (bp.foto is null or x.troca) where ${OK}`;
    await db.query(`insert into banco_fotos(banco_id,id,mime,b64)
      select distinct on (${HASH}) $1, ${HASH}, replace(substring(ph.data from '^data:(image/[a-z]+);base64,'),'image/jpg','image/jpeg'), split_part(ph.data,',',2) ${FROM}
      on conflict (banco_id,id) do nothing`, [bancoId, t.id, lote]);
    await db.query(`update banco_produtos p set foto=s.fid, foto_fonte=$4, updated_at=now()
      from (select distinct on (x.codigo) x.codigo, ${HASH} as fid, x.troca ${FROM}) s
      where p.banco_id=$1 and p.codigo=s.codigo and (p.foto is null or s.troca) and p.foto is distinct from s.fid`, [bancoId, t.id, lote, t.name]);
  }
  return { semCodigo, lidos: rows.length };
}
/* app de pedidos ligado a um banco: o produto que o administrador acabou de salvar sobe sozinho.
   fotoAntes = { id do produto: foto que ele tinha antes de salvar }: só a foto que MUDOU nesta gravação troca a do banco
   (salvar o preço de um produto não desfaz uma foto que foi trocada no banco por outro app). */
async function sobeAtacado(T, tid, docs, fotoAntes) {
  const rows = docs.filter(d => d && cleanCodigo(d.code)).map(d => ({ code: d.code, ean: d.ean, name: d.name, cost: d.cost, pack: d.perPack, photo: d.photo,
    troca: !!d.photo && String(d.photo) !== String((fotoAntes && fotoAntes[d.id]) || '') }));
  if (rows.length) await entraAtacado(T.banco, { id: tid, name: T.name }, rows);
}
/* Gerador de Encartes: o banco de produtos dele (código, EAN, nome, custo) e as fotos ligadas a um código ou a um código de barras */
const parseDoc = s => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
const inner = o => (o && typeof o.data === 'string' ? parseDoc(o.data) : null);
async function absorveEncartes(bancoId, t) {
  const r = await db.query(`select path, data from enc_docs where tenant_id=$1 and (path in ('app/catalogo','app/custos','comum/imagens','app/imagens','comum/dados')
      or ((path like 'salvos/%' or path like 'data/users/%/rascunho') and length(data) < 600000)) order by updated_at desc limit 300`, [t.id]);
  const D = {}; const soltos = [];
  for (const x of r.rows) { if (x.path.startsWith('salvos/') || x.path.startsWith('data/')) soltos.push(x.data); else D[x.path] = parseDoc(x.data); }
  const cat = inner(D['app/catalogo']) || {}, cus = (inner(D['app/custos']) || {}).m || {}, comum = inner(D['comum/dados']) || {};
  const map = Object.assign({}, (D['app/imagens'] || {}).map || {}, (D['comum/imagens'] || {}).map || {});
  const itens = [];
  for (const it of Array.isArray(cat.itens) ? cat.itens : []) {
    const codigo = cleanCodigo(it && it.c); if (!codigo) continue;
    const c = cus[String(it.c)] || cus[codigo] || null;
    const custo = c ? cleanValor(c.cu, 4) : null;
    itens.push({ codigo, ean: cleanEan(it.e), nome: cleanNome(it.d), custo: custo > 0 ? custo : null, custo_fonte: custo > 0 ? t.name : null, preco: cleanValor(it.pv, 2) });
  }
  // produtos dos encartes salvos e dos rascunhos: dão nome e código de barras a um código que só tem foto
  for (const s of soltos) {
    const rec = inner(parseDoc(s)); const ps = rec && Array.isArray(rec.products) ? rec.products.concat(Array.isArray(rec.avulsas) ? rec.avulsas : []) : [];
    for (const p of ps) { const codigo = cleanCodigo(p && p.code); if (codigo) itens.push({ codigo, ean: cleanEan(p.ean), nome: cleanNome(p.desc), custo: null }); }
  }
  // fotos: chave "c:<código>" liga direto; "e:<EAN>" e a lista fotoEan ligam pelo código de barras
  const pares = []; let soNome = 0;
  const okId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  for (const [k, id] of Object.entries(map)) {
    if (!okId(id)) continue;
    if (k.startsWith('c:')) { const codigo = cleanCodigo(k.slice(2)); if (codigo) { pares.push({ codigo, ean: null, fid: id }); itens.push({ codigo, ean: '', nome: '', custo: null }); } }
    else if (k.startsWith('e:')) { const ean = cleanEan(k.slice(2)); if (ean) pares.push({ codigo: null, ean, fid: id }); }
    else if (k.startsWith('n:') || k.startsWith('id:')) soNome++;
  }
  for (const [e, k] of Object.entries(comum.fotoEan || {})) { const ean = cleanEan(e), id = map[k]; if (ean && okId(id)) pares.push({ codigo: null, ean, fid: id }); }
  await gravaLote((a, b) => db.query(a, b), bancoId, itens, t.name, 'completa');
  await ligaFotosEnc(bancoId, t, pares, false);
  return { semCodigo: soNome, lidos: itens.length };
}
/* copia fotos do Gerador de Encartes para o banco e liga ao produto. troca=false: só produto ainda sem foto. */
async function ligaFotosEnc(bancoId, t, pares, troca) {
  if (!pares.length) return 0;
  const alvo = new Map();   // código -> foto (a ligação pelo código vale mais que a pelo código de barras)
  for (let i = 0; i < pares.length; i += 500) {
    const r = await db.query(`select bp.codigo, x.fid, (x.codigo is not null) as direto from jsonb_to_recordset($2::jsonb) as x(codigo text, ean text, fid text)
      join banco_produtos bp on bp.banco_id=$1 and ((x.codigo is not null and bp.codigo=x.codigo) or (x.codigo is null and bp.ean=x.ean))
      where ${troca ? 'bp.foto is distinct from x.fid' : 'bp.foto is null'}`, [bancoId, J(pares.slice(i, i + 500))]);
    for (const x of r.rows) if (x.direto || !alvo.has(x.codigo)) alvo.set(x.codigo, x.fid);
  }
  const L = [...alvo].map(([codigo, fid]) => ({ codigo, fid }));
  for (let i = 0; i < L.length; i += 40) {
    const lote = J(L.slice(i, i + 40));
    await db.query(`insert into banco_fotos(banco_id,id,mime,b64) select $1, b.id, b.mime, b.b64 from enc_blobs b
      where b.tenant_id=$2 and b.id in (select fid from jsonb_to_recordset($3::jsonb) as x(fid text)) on conflict (banco_id,id) do nothing`, [bancoId, t.id, lote]);
    await db.query(`update banco_produtos p set foto=x.fid, foto_fonte=$3, updated_at=now() from jsonb_to_recordset($2::jsonb) as x(codigo text, fid text)
      where p.banco_id=$1 and p.codigo=x.codigo and exists (select 1 from banco_fotos f where f.banco_id=$1 and f.id=x.fid)
        and ${troca ? 'p.foto is distinct from x.fid' : 'p.foto is null'}`, [bancoId, lote, t.name]);
  }
  return L.length;
}
/* traz os produtos de uma empresa para o banco; devolve o que mudou */
async function absorve(bancoId, t) {
  const antes = await conta(bancoId);
  const ramo = t.ramo || 'atacado';
  const x = ramo === 'encartes' ? await absorveEncartes(bancoId, t) : ramo === 'atacado' ? await absorveAtacado(bancoId, t) : null;
  if (!x) return { empresa: t.id, nome: t.name, pulou: true };
  const depois = await conta(bancoId);
  return { empresa: t.id, nome: t.name, lidos: x.lidos, semCodigo: x.semCodigo, produtos: depois.n - antes.n, fotos: depois.f - antes.f, custos: depois.c - antes.c };
}

/* ---------- Central ---------- */
async function bancoRow(id) {
  const r = await db.query('select * from bancos where id=$1', [cleanBancoId(id)]);
  if (!r.rows[0]) throw httpErr(404, 'Banco de dados não encontrado.');
  return r.rows[0];
}
const ERRO_SQL = `(p.nome = '' or p.ean is null or p.ean_ruim or (p.custo is not null and p.custo <= 0)
  or (p.custo is not null and p.preco is not null and p.preco > 0 and p.custo > p.preco) or p.staria = 'nao'
  or (p.ean is not null and exists (select 1 from banco_produtos o where o.banco_id=p.banco_id and o.ean=p.ean and o.codigo<>p.codigo)))`;
/* lista dos bancos com os números de cada um (vai junto com o estado da Central) */
async function resumo() {
  const r = await db.query(`select b.id, b.name, b.origem, b.filial,
      (select count(*) from banco_produtos p where p.banco_id=b.id)::int as produtos,
      (select count(*) from banco_produtos p where p.banco_id=b.id and p.foto is not null)::int as com_foto,
      (select count(*) from banco_produtos p where p.banco_id=b.id and p.custo is not null)::int as com_custo,
      (select count(*) from banco_jobs j where j.banco_id=b.id and j.status='pendente')::int as pendentes
    from bancos b order by b.created_at, b.id`);
  return r.rows.map(b => ({ id: b.id, name: b.name, origem: b.origem, filial: b.filial, produtos: b.produtos, comFoto: b.com_foto, comCusto: b.com_custo, pendentes: b.pendentes }));
}
async function salvaBanco(b) {
  const name = cleanNome(b && b.name).slice(0, 60);
  if (name.length < 2) throw httpErr(400, 'O nome do banco precisa ter pelo menos 2 letras.');
  const filial = Math.min(9999, Math.max(1, parseInt(b.filial, 10) || 1));
  const dup = await db.query('select id from bancos where lower(name)=lower($1) and id<>$2', [name, cleanBancoId(b.id) || '']);
  if (dup.rows.length) throw httpErr(400, 'Já existe um banco com esse nome.');
  if (b.id) { const cur = await bancoRow(b.id); await db.query('update bancos set name=$2, filial=$3, updated_at=now() where id=$1', [cur.id, name, filial]); return cur.id; }
  if ((await db.query('select count(*)::int as n from bancos')).rows[0].n >= 200) throw httpErr(400, 'Limite de 200 bancos.');
  let id = slug(name), n = 1;
  while ((await db.query('select 1 from bancos where id=$1', [id])).rows.length) { n++; id = slug(name).slice(0, 26) + '-' + n; if (n > 50) throw httpErr(409, 'Nome repetido demais.'); }
  await db.query(`insert into bancos(id,name,origem,filial) values($1,$2,'staria',$3)`, [id, name, filial]);
  return id;
}
/* liga (ou desliga) uma empresa a um banco. Ao ligar, o que a empresa já tem é trazido para o banco. */
async function usar(b, clearCache) {
  const tid = String((b && b.empresa) || '').slice(0, 40);
  const t = (await db.query('select id, name, ramo, banco_id from tenants where id=$1', [tid])).rows[0];
  if (!t) throw httpErr(404, 'Empresa não encontrada.');
  if (!RAMOS_USAM.includes(t.ramo || 'atacado')) throw httpErr(400, 'Este tipo de empresa ainda não usa banco de dados.');
  if (b.banco == null || b.banco === '') {
    await db.query('update tenants set banco_id=null, updated_at=now() where id=$1', [t.id]); clearCache();
    return { empresa: t.id, banco: null };
  }
  const bk = await bancoRow(b.banco);
  await db.query('update tenants set banco_id=$2, updated_at=now() where id=$1', [t.id, bk.id]); clearCache();
  return { empresa: t.id, banco: bk.id, trouxe: await absorve(bk.id, t) };
}
async function importar(b) {
  const bk = await bancoRow(b && b.banco);
  const ids = Array.isArray(b.empresas) ? b.empresas.map(x => String(x).slice(0, 40)).slice(0, 100) : [];
  if (!ids.length) throw httpErr(400, 'Marque pelo menos uma empresa.');
  const r = await db.query(`select id, name, ramo from tenants where id in (select jsonb_array_elements_text($1::jsonb)) order by primary_tenant desc, created_at`, [J(ids)]);
  const out = [];
  for (const t of r.rows) out.push(await absorve(bk.id, t));
  return { banco: bk.id, empresas: out, total: await conta(bk.id) };
}
function linhaOut(p) {
  const erros = [];
  if (p.nome === '') erros.push('sem nome');
  if (p.ean == null) erros.push('sem código de barras');
  if (p.ean_ruim) erros.push('código de barras inválido');
  if (p.e_dup) erros.push('código de barras repetido em outro produto');
  if (p.custo != null && Number(p.custo) <= 0) erros.push('custo zerado');
  if (p.custo != null && p.preco != null && Number(p.preco) > 0 && Number(p.custo) > Number(p.preco)) erros.push('custo maior que o preço de venda');
  if (p.staria === 'nao') erros.push('não encontrado no sistema');
  return { codigo: p.codigo, ean: p.ean || '', nome: p.nome, custo: p.custo == null ? null : Number(p.custo), custoFonte: p.custo_fonte || '', custoEm: p.custo_at || null,
    preco: p.preco == null ? null : Number(p.preco), foto: p.foto || null, fotoFonte: p.foto_fonte || '', fonte: p.fonte || '', conferidoEm: p.staria_at || null, erros };
}
const FILTROS = { todos: 'true', semfoto: 'p.foto is null', semcusto: 'p.custo is null', erros: ERRO_SQL };
async function produtos(query) {
  const bk = await bancoRow(query.get('b'));
  const f = Object.prototype.hasOwnProperty.call(FILTROS, query.get('f') || '') ? query.get('f') : 'todos';
  const pag = Math.min(100000, Math.max(0, parseInt(query.get('p'), 10) || 0));
  const toks = String(query.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map(x => x.slice(0, 40));
  const params = [bk.id]; let busca = '';
  for (const tk of toks) { params.push(tk); busca += ` and (position($${params.length} in lower(p.nome)) > 0 or p.codigo = upper($${params.length}) or p.ean = $${params.length})`; }
  const tot = (await db.query(`select count(*)::int as todos, count(*) filter (where p.foto is null)::int as semfoto, count(*) filter (where p.custo is null)::int as semcusto,
      count(*) filter (where ${ERRO_SQL})::int as erros from banco_produtos p where p.banco_id=$1${busca}`, params)).rows[0];
  const r = await db.query(`select p.*, (p.ean is not null and exists (select 1 from banco_produtos o where o.banco_id=p.banco_id and o.ean=p.ean and o.codigo<>p.codigo)) as e_dup
    from banco_produtos p where p.banco_id=$1${busca} and ${FILTROS[f]} order by (p.nome = '') desc, p.nome, p.codigo limit ${PAG} offset ${pag * PAG}`, params);
  return { banco: bk.id, filtro: f, pagina: pag, porPagina: PAG, totais: tot, itens: r.rows.map(linhaOut) };
}
async function guardaFoto(q, bancoId, f) { await q(`insert into banco_fotos(banco_id,id,mime,b64) values($1,$2,$3,$4) on conflict (banco_id,id) do nothing`, [bancoId, f.id, f.mime, f.b64]); }
/* cria ou corrige UM produto pela Central. Só muda o que veio no envio. */
async function salvaProduto(b) {
  const bk = await bancoRow(b && b.banco);
  const codigo = cleanCodigo(b.codigo);
  if (!codigo) throw httpErr(400, 'Código interno inválido: use letras, números, ponto ou traço (até 30).');
  const cur = (await db.query('select * from banco_produtos where banco_id=$1 and codigo=$2', [bk.id, codigo])).rows[0];
  if (b.novo === true && cur) throw httpErr(400, 'Já existe um produto com o código ' + codigo + ' neste banco.');
  if (!cur && b.novo !== true) throw httpErr(404, 'Produto não encontrado no banco.');
  const set = {};
  if (b.nome !== undefined) set.nome = cleanNome(b.nome);
  if (b.ean !== undefined) { const raw = String(b.ean == null ? '' : b.ean).trim(); const e = cleanEan(raw); if (raw && !e) throw httpErr(400, 'Código de barras: de 8 a 14 números.'); set.ean = e || null; set.ean_ruim = eanRuim(e); }
  if (b.custo !== undefined) {
    const c = b.custo === null || b.custo === '' ? null : cleanValor(b.custo, 4);
    if (b.custo !== null && b.custo !== '' && c == null) throw httpErr(400, 'Custo inválido.');
    set.custo = c; set.custo_fonte = c == null ? null : (cleanNome(b.custoFonte).slice(0, 80) || 'digitado na Central');
  }
  let foto;
  if (b.foto === null) set.foto = null;
  else if (b.foto !== undefined) { foto = parseFoto(b.foto); set.foto = foto.id; set.foto_fonte = 'enviada na Central'; }
  await db.tx(async t => {
    if (foto) await guardaFoto((a, c) => t.query(a, c), bk.id, foto);
    if (!cur) await t.query(`insert into banco_produtos(banco_id,codigo,fonte) values($1,$2,'criado na Central')`, [bk.id, codigo]);
    const ks = Object.keys(set);
    if (ks.length) await t.query(`update banco_produtos set ${ks.map((k, i) => k + '=$' + (i + 3)).join(', ')}${'custo' in set ? ', custo_at=' + (set.custo == null ? 'null' : 'now()') : ''}, updated_at=now() where banco_id=$1 and codigo=$2`, [bk.id, codigo].concat(ks.map(k => set[k])));
  });
  const r = await db.query(`select p.*, (p.ean is not null and exists (select 1 from banco_produtos o where o.banco_id=p.banco_id and o.ean=p.ean and o.codigo<>p.codigo)) as e_dup from banco_produtos p where p.banco_id=$1 and p.codigo=$2`, [bk.id, codigo]);
  return { produto: linhaOut(r.rows[0]), novo: !cur };
}
/* foto enviada pelo nome do arquivo: o nome é o código interno ou o código de barras */
async function fotoPorNome(b) {
  const bk = await bancoRow(b && b.banco);
  const termo = String(b.termo || '').trim();
  const foto = parseFoto(b.foto);
  const ean = /^\d{8,14}$/.test(termo) ? cleanEan(termo) : '', codigo = cleanCodigo(termo);
  let alvo = [];
  if (ean) alvo = (await db.query('select codigo from banco_produtos where banco_id=$1 and ean=$2', [bk.id, ean])).rows.map(x => x.codigo);
  if (!alvo.length && codigo) alvo = (await db.query('select codigo from banco_produtos where banco_id=$1 and codigo=$2', [bk.id, codigo])).rows.map(x => x.codigo);
  if (!alvo.length) return { ok: false, termo, motivo: ean ? 'nenhum produto com esse código de barras' : codigo ? 'nenhum produto com esse código' : 'o nome do arquivo precisa ser o código ou o código de barras' };
  await guardaFoto((a, c) => db.query(a, c), bk.id, foto);
  await db.query(`update banco_produtos set foto=$3, foto_fonte='enviada na Central', updated_at=now() where banco_id=$1 and codigo in (select jsonb_array_elements_text($2::jsonb))`, [bk.id, J(alvo), foto.id]);
  return { ok: true, termo, codigos: alvo };
}
async function apagaProduto(b) {
  const bk = await bancoRow(b && b.banco);
  const r = await db.query('delete from banco_produtos where banco_id=$1 and codigo=$2 returning codigo', [bk.id, cleanCodigo(b.codigo)]);
  if (!r.rowCount) throw httpErr(404, 'Produto não encontrado no banco.');
  return { ok: true };
}
async function fotoRaw(bancoId, id) {
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) throw httpErr(400, 'Imagem inválida.');
  const r = await db.query('select mime, b64 from banco_fotos where banco_id=$1 and id=$2', [bancoId, id]);
  if (!r.rows.length) throw httpErr(404, 'Imagem não encontrada.');
  return { raw: Buffer.from(r.rows[0].b64, 'base64'), type: r.rows[0].mime };
}

/* ---------- pedidos ao sistema de origem (o Claude atende) ---------- */
const jobOut = j => ({ id: j.id, banco: j.banco_id, status: j.status, termos: j.termos, resumo: j.resumo || null, pedidoEm: j.created_at, prontoEm: j.done_at || null });
function termosDe(v) {
  const L = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/);
  const out = [];
  for (const x of L) { const s = String(x).trim(); if (!s) continue; const t = /^\d{8,14}$/.test(s) ? (cleanEan(s) || cleanCodigo(s)) : cleanCodigo(s); if (!t) throw httpErr(400, 'Código inválido: "' + s.slice(0, 30) + '". Use o código interno ou o código de barras.'); if (!out.includes(t)) out.push(t); }
  return out;
}
async function pedir(b) {
  const bk = await bancoRow(b && b.banco);
  const pend = (await db.query(`select * from banco_jobs where banco_id=$1 and status='pendente' order by created_at limit 1`, [bk.id])).rows[0];
  if (pend) return { jaPedido: true, pedido: jobOut(pend) };
  let termos = termosDe(b.codigos);
  if (termos.length > MAX_TERMOS) throw httpErr(400, 'No máximo ' + MAX_TERMOS + ' códigos por pedido.');
  if (!termos.length) {
    // sem lista: os produtos do banco que nunca foram conferidos; depois, os conferidos há mais tempo
    termos = (await db.query(`select codigo from banco_produtos where banco_id=$1 order by staria_at nulls first, (nome = '') desc, created_at, codigo limit ${MAX_TERMOS}`, [bk.id])).rows.map(x => x.codigo);
    if (!termos.length) throw httpErr(400, 'O banco ainda está vazio. Traga os produtos das empresas ou digite os códigos que quer buscar.');
  }
  const id = 'bj' + uid();
  await db.query(`insert into banco_jobs(id,banco_id,termos) values($1,$2,$3::jsonb)`, [id, bk.id, J(termos)]);
  return { pedido: jobOut((await db.query('select * from banco_jobs where id=$1', [id])).rows[0]) };
}
async function jobs(query) {
  const bk = await bancoRow(query.get('b'));
  const r = await db.query(`select * from banco_jobs where banco_id=$1 order by (status='pendente') desc, created_at desc limit 10`, [bk.id]);
  return { banco: bk.id, filial: bk.filial, pedidos: r.rows.map(jobOut) };
}
async function cancelar(b) {
  const r = await db.query(`update banco_jobs set status='cancelada', done_at=now() where id=$1 and status='pendente' returning id`, [String((b && b.id) || '').slice(0, 40)]);
  if (!r.rowCount) throw httpErr(409, 'Este pedido não está mais esperando.');
  return { ok: true };
}
/* resultado de um pedido: { termo: {codigo, ean, nome, preco, custo, custoFonte} | null } com TODOS os termos do pedido */
async function resultado(b) {
  const id = String((b && b.id) || '').slice(0, 40);
  const R = b && b.resultados;
  if (!R || typeof R !== 'object' || Array.isArray(R)) throw httpErr(400, 'Envio inválido: faltam os resultados.');
  return db.tx(async t => {
    const j = (await t.query('select * from banco_jobs where id=$1 for update', [id])).rows[0];
    if (!j) throw httpErr(404, 'Pedido não encontrado.');
    if (j.status !== 'pendente') throw httpErr(409, 'Este pedido já foi atendido.');
    const itens = [], falta = [];
    for (const termo of j.termos) {
      if (!Object.prototype.hasOwnProperty.call(R, termo)) throw httpErr(400, 'Faltou o resultado do código ' + termo + '.');
      const x = R[termo];
      if (x == null) { falta.push(termo); continue; }
      if (typeof x !== 'object') throw httpErr(400, 'Resultado inválido no código ' + termo + '.');
      const codigo = cleanCodigo(x.codigo);
      if (!codigo) throw httpErr(400, 'Resultado sem código interno no código ' + termo + '.');
      const custo = cleanValor(x.custo, 4);
      itens.push({ codigo, ean: cleanEan(x.ean), nome: cleanNome(x.nome), preco: (v => (v > 0 ? v : null))(cleanValor(x.preco, 2)), custo: custo > 0 ? custo : null,
        custo_fonte: custo > 0 ? (cleanNome(x.custoFonte).slice(0, 80) || 'sistema de origem') : null });
    }
    const q = (a, c) => t.query(a, c);
    await gravaLote(q, j.banco_id, itens, 'sistema de origem', 'origem');
    // o que o sistema de origem não achou fica marcado (aparece em "Possivelmente errados"), se for um produto do banco
    if (falta.length) await t.query(`update banco_produtos set staria='nao', staria_at=now(), updated_at=now() where banco_id=$1 and codigo in (select jsonb_array_elements_text($2::jsonb))`, [j.banco_id, J(falta)]);
    const resumoJ = { atualizados: itens.length, naoAchou: falta.slice(0, MAX_TERMOS) };
    await t.query(`update banco_jobs set status='pronta', done_at=now(), resumo=$2::jsonb where id=$1`, [id, J(resumoJ)]);
    return Object.assign({ ok: true }, resumoJ);
  });
}

async function central({ path, method, query, body, audit, clearCache }) {
  const p = path.slice('/api/central/banco/'.length);
  if (method === 'GET') {
    if (p === 'lista') return { bancos: await resumo() };
    if (p === 'produtos') return produtos(query);
    if (p === 'jobs') return jobs(query);
    if (p === 'foto') return fotoRaw((await bancoRow(query.get('b'))).id, query.get('id'));
    throw httpErr(404, 'Não encontrado.');
  }
  if (method !== 'POST') throw httpErr(404, 'Não encontrado.');
  const b = await body();
  if (p === 'salvar') { const id = await salvaBanco(b); await audit(b.id ? 'central_banco_alterado' : 'central_banco_criado', { id }); return { id, bancos: await resumo() }; }
  if (p === 'usar') { const r = await usar(b, clearCache); await audit('central_banco_empresa', { empresa: r.empresa, banco: r.banco }, r.empresa); return Object.assign(r, { bancos: await resumo() }); }
  if (p === 'importar') { const r = await importar(b); await audit('central_banco_importou', { banco: r.banco, empresas: r.empresas.map(x => x.empresa) }); return Object.assign(r, { bancos: await resumo() }); }
  if (p === 'produto') { const r = await salvaProduto(b); await audit('central_banco_produto', { banco: b.banco, codigo: r.produto.codigo, novo: r.novo, campos: Object.keys(b).filter(k => !['banco', 'codigo', 'foto', 'novo'].includes(k)), foto: b.foto !== undefined }); return r; }
  if (p === 'foto-nome') return fotoPorNome(b);
  if (p === 'produto-del') { const r = await apagaProduto(b); await audit('central_banco_produto_apagado', { banco: b.banco, codigo: cleanCodigo(b.codigo) }); return r; }
  if (p === 'pedir') { const r = await pedir(b); if (!r.jaPedido) await audit('central_banco_pedido', { banco: r.pedido.banco, id: r.pedido.id, n: r.pedido.termos.length }); return r; }
  if (p === 'pedido-cancelar') return cancelar(b);
  if (p === 'resultado') { const r = await resultado(b); await audit('central_banco_resultado', { id: String(b.id).slice(0, 40), atualizados: r.atualizados, naoAchou: r.naoAchou.length }); return r; }
  throw httpErr(404, 'Não encontrado.');
}

/* ---------- empresa ligada a um banco: app de pedidos (atacado, distribuidora) ---------- */
/* Só o administrador que cuida de produtos consulta; o custo só vai para quem pode ver custo. */
async function empresa({ path, method, user, T, body }) {
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador consulta o banco de dados.');
  if (user.perms && !user.perms.produtos) throw httpErr(403, 'Seu acesso não inclui produtos.');
  const p = path.slice('/api/banco/'.length);
  if (!T.banco) { if (p === 'info' && method === 'GET') return { banco: null }; throw httpErr(404, 'Esta empresa não usa um banco de dados.'); }
  const verCusto = !user.perms || !!user.perms.custos;
  if (p === 'info' && method === 'GET') { const bk = await bancoRow(T.banco); return { banco: { id: bk.id, name: bk.name } }; }
  if (p.startsWith('foto/') && method === 'GET') return fotoRaw(T.banco, p.slice(5));
  if (p === 'consulta' && method === 'POST') {
    const b = await body();
    const termos = (Array.isArray(b.termos) ? b.termos : []).map(x => String(x).trim().replace(/[\s.\-]/g, '')).filter(Boolean).slice(0, MAX_TERMOS);
    const bk = await bancoRow(T.banco);
    const cods = [...new Set(termos.map(cleanCodigo).filter(Boolean))], eans = [...new Set(termos.map(cleanEan).filter(Boolean))];
    const r = await db.query(`select codigo, ean, nome, custo, custo_fonte, foto from banco_produtos where banco_id=$1
      and (codigo in (select jsonb_array_elements_text($2::jsonb)) or ean in (select jsonb_array_elements_text($3::jsonb))) order by codigo`, [bk.id, J(cods), J(eans)]);
    const out = {};
    for (const t of termos) {
      const e = cleanEan(t), c = cleanCodigo(t);
      // código de barras primeiro (como na busca do StarIA); depois o código interno
      const hits = r.rows.filter(x => e && x.ean === e); const x = hits[0] || r.rows.find(y => c && y.codigo === c) || null;
      out[t] = x ? Object.assign({ codigo: x.codigo, ean: x.ean || '', nome: x.nome, foto: x.foto ? '/api/banco/foto/' + x.foto : null, varios: hits.length > 1 },
        verCusto ? { custo: x.custo == null ? null : Number(x.custo), custoFonte: x.custo_fonte || '' } : {}) : null;
    }
    return { banco: { id: bk.id, name: bk.name }, resultados: out };
  }
  throw httpErr(404, 'Não encontrado.');
}

/* ---------- empresa ligada a um banco: Gerador de Encartes ---------- */
/* O app de encartes guarda as fotos num mapa (chave -> imagem) e os produtos num catálogo. Para a empresa ligada:
   - ao LER o mapa, as fotos do banco entram pela chave do código ("c:<código>") e valem mais que a da empresa;
   - ao LER o catálogo, os produtos do banco que a empresa não tem entram com código, código de barras e nome;
   - ao GRAVAR o mapa, a foto nova de um produto com código (ou com código de barras do banco) sobe para o banco;
   - o que veio do banco não é gravado de volta nos documentos da empresa (o banco continua sendo o dono). */
async function encLer(T, p, data) {
  if (p === 'comum/imagens') {
    const r = await db.query('select codigo, foto from banco_produtos where banco_id=$1 and foto is not null', [T.banco]);
    if (!r.rows.length) return data;
    const map = Object.assign({}, (data && typeof data.map === 'object' && data.map) || {});
    for (const x of r.rows) map['c:' + x.codigo] = x.foto;
    return Object.assign({}, data || {}, { map });
  }
  if (p === 'app/catalogo') {
    const r = await db.query(`select codigo, ean, nome from banco_produtos where banco_id=$1 and nome <> '' order by codigo`, [T.banco]);
    if (!r.rows.length) return data;
    const cat = (data && inner(data)) || { at: 0, filial: 1, itens: [] };
    if (!Array.isArray(cat.itens)) cat.itens = [];
    const tem = new Set(cat.itens.map(x => cleanCodigo(x && x.c)));
    const now = Date.now(); let n = 0;
    for (const x of r.rows) { if (tem.has(x.codigo)) continue; cat.itens.push({ c: x.codigo, e: x.ean || '', d: x.nome.slice(0, 120), pv: null, vv: null, pm: null, at: now, src: 'banco' }); n++; }
    if (!n) return data;
    if (!cat.at) cat.at = now;
    return Object.assign({}, data || {}, { at: (data && data.at) || cat.at, data: J(cat) });
  }
  return data;
}
async function encGravar(tid, T, p, data) {
  if (p === 'app/catalogo') {
    const cat = inner(data);
    if (!cat || !Array.isArray(cat.itens)) return data;
    const itens = cat.itens.filter(x => !(x && x.src === 'banco' && x.pv == null && x.vv == null && x.pm == null));
    return itens.length === cat.itens.length ? data : Object.assign({}, data, { data: J(Object.assign({}, cat, { itens })) });
  }
  if (p === 'comum/imagens') {
    if (!data || typeof data.map !== 'object' || !data.map || Array.isArray(data.map)) return data;
    const [antesR, meusR, bancoR] = await Promise.all([
      db.query(`select data from enc_docs where tenant_id=$1 and path='comum/imagens'`, [tid]),
      db.query('select id from enc_blobs where tenant_id=$1', [tid]),
      db.query('select codigo, ean, foto from banco_produtos where banco_id=$1', [T.banco])]);
    const antes = ((antesR.rows[0] && parseDoc(antesR.rows[0].data)) || {}).map || {};
    const meus = new Set(meusR.rows.map(x => x.id));
    const porCod = new Map(bancoR.rows.map(x => [x.codigo, x])), eans = new Set(bancoR.rows.filter(x => x.ean).map(x => x.ean));
    const map = {}, sobe = [], novos = [];
    for (const [k, id] of Object.entries(data.map)) {
      const codigo = k.startsWith('c:') ? cleanCodigo(k.slice(2)) : '', ean = k.startsWith('e:') ? cleanEan(k.slice(2)) : '';
      const meu = typeof id === 'string' && meus.has(id);
      // veio do banco: não grava na empresa. A última foto DELA para o código continua guardada (se for desligada, volta a valer;
      // e um aparelho aberto há dias, que reenvia a foto antiga, não desfaz a troca feita no banco)
      if (codigo && !meu) { if (typeof antes[k] === 'string' && meus.has(antes[k])) map[k] = antes[k]; continue; }
      map[k] = id;
      if (!meu || antes[k] === id) continue;              // só o que mudou nesta gravação sobe para o banco
      if (codigo) { sobe.push({ codigo, ean: null, fid: id }); if (!porCod.has(codigo)) novos.push({ codigo, ean: '', nome: '', custo: null }); }
      else if (ean && eans.has(ean)) sobe.push({ codigo: null, ean, fid: id });
    }
    if (sobe.length) {
      if (novos.length) await gravaLote((a, b) => db.query(a, b), T.banco, novos, T.name, 'completa');
      await ligaFotosEnc(T.banco, { id: tid, name: T.name }, sobe, true);
    }
    return Object.assign({}, data, { map });
  }
  return data;
}
async function encFoto(T, id) {
  const r = await db.query('select mime, b64 from banco_fotos where banco_id=$1 and id=$2', [T.banco, id]);
  return r.rows[0] ? { raw: Buffer.from(r.rows[0].b64, 'base64'), type: r.rows[0].mime } : null;
}

module.exports = { central, empresa, resumo, encLer, encGravar, encFoto, sobeAtacado, absorve, cleanCodigo, cleanEan, eanRuim, cleanNome, cleanValor, juntaLote, termosDe, RAMOS_USAM, MAX_TERMOS };

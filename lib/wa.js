'use strict';
/*
 * Robô do WhatsApp do DRE: a pessoa manda "Éder pôs R$ 400 de diesel no caminhão" para o número da empresa e a
 * despesa entra no DRE do mês, já com a categoria; o robô responde confirmando.
 *
 * WhatsApp Business Cloud API (Meta). Variáveis na Vercel:
 *   WA_TENANT     empresa que recebe (ex.: fundo-de-caixa)
 *   WA_VERIFY_TOKEN  texto qualquer, igual ao configurado no painel da Meta (confirmação do webhook)
 *   WA_APP_SECRET chave secreta do app da Meta (confere a assinatura de cada aviso)
 *   WA_TOKEN      token de acesso permanente (usuário do sistema) para responder
 *   WA_PHONE_ID   identificação do número na Meta
 *   WA_API_VERSION (opcional) versão da Graph API, padrão v23.0
 * Só números cadastrados no DRE ("Quem manda pelo WhatsApp") são aceitos; os outros não recebem nada.
 * Cada mensagem é tratada uma vez só (a Meta repete o aviso quando demora): tabela wa_msg.
 * Comandos: "apagar" desfaz a última despesa que a pessoa mandou nas últimas 24 h; "ajuda" mostra exemplos.
 * Sem IA: valor, filial, dia e categoria saem do texto por regras simples (sem custo por mensagem).
 */
const crypto = require('crypto');
const db = require('./pg');
const dre = require('./dre');

const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// palavras -> categoria (a primeira que aparecer na lista vence)
const PALAVRAS = [
  ['combustivel', /\b(diesel|gasolina|etanol|combustivel|abastec\w*|arla|posto)\b/],
  ['veiculo', /\b(pneu\w*|oficina|mecanic\w*|borrachari\w*|revisao|troca de oleo|freio\w*|embreagem|bateria do|ipva|licenciamento|lavagem do)\b/],
  ['frete', /\b(frete|carreto|mudanca)\b/],
  ['embalagem', /\b(sacola\w*|embalage\w*|bobina\w*|bandeja\w*)\b/],
  ['consumo', /\b(limpeza|detergente|desinfetante|vassoura|rodo|papel toalha|papel higienico|material de escritorio|uso e consumo)\b/],
  ['alimentacao', /\b(almoco|janta|jantar|lanche\w*|marmit\w*|refeic\w*|cafe da manha)\b/],
  ['pessoal', /\b(diaria\w*|diarista|freela\w*|ajudante\w*|chapa|bico)\b/],
  ['loja', /\b(manutencao|conserto|consertar|eletricista|encanador|pedreiro|reforma|pintura|lampada\w*|vidraceiro|serralheir\w*|ar condicionado|geladeira|freezer|balcao)\b/],
  ['marketing', /\b(propaganda|anuncio\w*|panfleto\w*|encarte\w*|carro de som|marketing|patrocinio|impulsionamento)\b/],
  ['impostos', /\b(imposto\w*|taxa\w*|darf|guia|alvara|multa\w*|cartorio|boleto da prefeitura)\b/],
  ['servicos', /\b(servico\w*|contador|advogad\w*|internet|telefone|sistema|software|dedetiza\w*|seguranca|vigia)\b/],
  ['mercadoria', /\b(mercadoria\w*|compra de|comprei|comprou|feira|ceasa|hortifruti|verdura\w*|fruta\w*|queijo\w*|tomate\w*|ovo\w*|pao|paes|carne\w*|frango)\b/]
];
function categoriaDe(texto) { const t = sem(texto); for (const [c, re] of PALAVRAS) if (re.test(t)) return c; return 'outros'; }
// valor: "R$ 1.234,56", "R$400", "400 reais", "400,00"; ignora o número da filial e datas
function valorDe(texto) {
  let t = sem(texto).replace(/\b(filial|loja)\s*\d\b/g, ' ').replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ').replace(/\bdia\s+\d{1,2}\b/g, ' ').replace(/\b\d{1,2}\s*(h|hs|horas?|km|l|litros?)\b/g, ' ');
  const num = s => { s = s.replace(/\s/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return isFinite(n) && n > 0 && n < 10000000 ? Math.round(n * 100) / 100 : null; };
  let m = /r\$\s*(\d[\d.]*(?:,\d{1,2})?)/.exec(t); if (m) return num(m[1]);
  m = /(\d[\d.]*(?:,\d{1,2})?)\s*(reais|real|conto|contos|pila|pilas|mil)\b/.exec(t);
  if (m) { const n = num(m[1]); return n && m[2] === 'mil' ? n * 1000 : n; }
  const todos = [...t.matchAll(/(?<![\w,.])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?![\w])/g)].map(x => num(x[1])).filter(Boolean);
  return todos.length ? todos[todos.length - 1] : null;
}
function filialDe(texto) { const m = /\b(filial|loja)\s*([1-4])\b/.exec(sem(texto)); return m ? Number(m[2]) : null; }
// dia: "ontem", "anteontem", "dia 3" ou "03/11"; senão hoje (horário de Brasília)
function dataDe(texto, agora) {
  const hoje = new Date((agora || Date.now()) - 3 * 3600e3); hoje.setUTCHours(0, 0, 0, 0);
  const t = sem(texto), dia = n => new Date(hoje.getTime() - n * 864e5).toISOString().slice(0, 10);
  if (/\banteontem\b/.test(t)) return dia(2);
  if (/\bontem\b/.test(t)) return dia(1);
  let m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  const monta = (d, mm, y) => { const x = new Date(Date.UTC(y, mm - 1, d)); return x.getUTCDate() === d && x <= hoje ? x.toISOString().slice(0, 10) : null; };
  if (m) { let y = m[3] ? +m[3] : hoje.getUTCFullYear(); if (y < 100) y += 2000; let r = monta(+m[1], +m[2], y); if (!r && !m[3]) r = monta(+m[1], +m[2], y - 1); if (r) return r; }
  m = /\bdia\s+(\d{1,2})\b/.exec(t);
  if (m) { const d = +m[1]; let r = monta(d, hoje.getUTCMonth() + 1, hoje.getUTCFullYear()); if (!r) { const ant = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)); r = monta(d, ant.getUTCMonth() + 1, ant.getUTCFullYear()); } if (r) return r; }
  return dia(0);
}
function ler(texto, agora) { return { valor: valorDe(texto), categoria: categoriaDe(texto), filial: filialDe(texto), data: dataDe(texto, agora) }; }

const money = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = s => s.slice(8, 10) + '/' + s.slice(5, 7);
// o WhatsApp às vezes manda celular do Brasil sem o 9 depois do DDD: compara as duas formas
function variantes(tel) {
  const d = String(tel || '').replace(/\D/g, ''), out = new Set([d]);
  if (/^55\d{2}9\d{8}$/.test(d)) out.add(d.slice(0, 4) + d.slice(5));
  if (/^55\d{2}\d{8}$/.test(d)) out.add(d.slice(0, 4) + '9' + d.slice(4));
  return [...out];
}

async function responder(para, texto) {
  const tok = process.env.WA_TOKEN, pid = process.env.WA_PHONE_ID, ver = process.env.WA_API_VERSION || 'v23.0';
  if (!tok || !pid || typeof fetch !== 'function') return;
  try {
    await fetch(`https://graph.facebook.com/${ver}/${encodeURIComponent(pid)}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto.slice(0, 4000) } })
    });
  } catch (e) { console.error('whatsapp: resposta falhou', e.message); }
}

const AJUDA = 'Mande a despesa numa mensagem só, com o valor. Exemplos:\n• Éder pôs R$ 400 de diesel no caminhão\n• Manuela abasteceu o Fiat Estrada, 200\n• conserto do freezer filial 2 R$ 350 ontem\n\nPara desfazer a última que você mandou: apagar';

// trata uma mensagem de texto de um número (já sem duplicidade); devolve o texto da resposta (ou null)
async function tratar(tid, de, texto, msgId, agora) {
  const vs = variantes(de);
  const rem = (await db.query('select telefone, nome, filial, ativo from wa_remetente where tenant_id=$1 and telefone in (select jsonb_array_elements_text($2::jsonb))', [tid, JSON.stringify(vs)])).rows[0];
  if (!rem || !rem.ativo) return null;   // número desconhecido: silêncio
  const t = sem(texto).trim();
  if (/^(ajuda|oi|ola|menu|\?)$/.test(t)) return 'Olá, ' + rem.nome + '! ' + AJUDA;
  if (/^(apagar|apaga|desfazer|desfaz|cancelar|cancela)$/.test(t)) {
    const r = await db.query(`delete from dre_despesa where ctid = (select ctid from dre_despesa where tenant_id=$1 and origem='whatsapp' and telefone=$2 and created_at > now() - interval '24 hours'
      order by created_at desc limit 1) returning valor, categoria`, [tid, rem.telefone]);
    if (!r.rows.length) return 'Não achei nenhuma despesa sua das últimas 24 horas para apagar.';
    return '🗑️ Apaguei: ' + (dre.CATS[r.rows[0].categoria] || r.rows[0].categoria) + ', ' + money(r.rows[0].valor) + '.';
  }
  const L = ler(texto, agora);
  if (!L.valor) return 'Não achei o valor na mensagem. ' + AJUDA;
  const filial = L.filial || rem.filial || null;
  const out = await dre.salvarDespesa(tid, { role: 'admin', name: rem.nome }, { data: L.data, categoria: L.categoria, valor: L.valor, filial, descricao: texto.slice(0, 200) },
    { origem: 'whatsapp', telefone: rem.telefone, waMsgId: msgId, por: rem.nome });
  return '✅ Lancei ' + money(out.valor) + ' em ' + dre.CATS[out.categoria] + (filial ? ', filial ' + filial : ', sem filial') + ', dia ' + dBR(out.data) + '.' +
    (L.categoria === 'outros' ? ' (Não reconheci a categoria: o dono ajusta no app.)' : '') + '\nErrado? Responda: apagar';
}

/* ---------- rota pública /api/wa/webhook (chamada pela Meta; sem login, com assinatura) ---------- */
async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 1024 * 1024) break; chunks.push(c); }
  return Buffer.concat(chunks);
}
async function webhook(req, res, url, send) {
  if (req.method === 'GET') {
    const ok = process.env.WA_VERIFY_TOKEN && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === process.env.WA_VERIFY_TOKEN;
    if (!ok) return send(res, 403, { error: 'Recusado.' });
    return send(res, 200, String(url.searchParams.get('hub.challenge') || ''), { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não aceito.' });
  const secret = process.env.WA_APP_SECRET, tid = process.env.WA_TENANT;
  if (!secret || !tid) return send(res, 503, { error: 'WhatsApp não configurado.' });
  const raw = await rawBody(req);
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return send(res, 401, { error: 'Assinatura inválida.' });
  let b = {}; try { b = JSON.parse(raw.toString('utf8') || '{}'); } catch (e) { return send(res, 200, { ok: true }); }
  const msgs = [];
  for (const en of (b.entry || [])) for (const ch of (en.changes || [])) for (const m of ((ch.value && ch.value.messages) || [])) msgs.push(m);
  for (const m of msgs.slice(0, 20)) {
    const id = String(m.id || '').slice(0, 200), de = String(m.from || '').replace(/\D/g, '');
    if (!id || !de) continue;
    const novo = await db.query('insert into wa_msg(id,tenant_id,telefone,texto) values($1,$2,$3,$4) on conflict(id) do nothing returning id', [id, tid, de, m.text ? String(m.text.body || '').slice(0, 1000) : '[' + m.type + ']']);
    if (!novo.rows.length) continue;   // repetido pela Meta
    let resp = null;
    try {
      if (m.type === 'text' && m.text && m.text.body) resp = await tratar(tid, de, String(m.text.body).slice(0, 1000), id);
      else {
        const conhecido = (await db.query('select 1 from wa_remetente where tenant_id=$1 and ativo and telefone in (select jsonb_array_elements_text($2::jsonb))', [tid, JSON.stringify(variantes(de))])).rows.length;
        if (conhecido) resp = 'Por enquanto eu só leio mensagem escrita (áudio e foto ainda não). ' + AJUDA;
      }
    } catch (e) { console.error('whatsapp:', e.message); resp = 'Não consegui lançar: ' + (e.status && e.status < 500 ? e.message : 'erro no sistema. Tente de novo daqui a pouco.'); }
    await db.query('update wa_msg set resultado=$2 where id=$1', [id, resp ? resp.slice(0, 500) : 'ignorada']);
    if (resp) await responder(de, resp);
  }
  return send(res, 200, { ok: true });
}

module.exports = { webhook, tratar, ler, valorDe, categoriaDe, filialDe, dataDe, variantes };

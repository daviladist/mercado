'use strict';
/*
 * Robô do Telegram para lançar despesas do dia a dia no DRE (ramo 'caixa').
 *
 * O dono cria o robô no BotFather e cola a chave no app (só o admin). O servidor confere a chave (getMe), liga o
 * webhook (/api/tg/<empresa>, com um segredo sorteado que o Telegram manda de volta em cada aviso) e guarda tudo
 * em dre_tg. A chave nunca volta para a tela.
 *
 * Quem pode lançar: dre_tg_pessoa. A primeira mensagem de alguém novo vira um pedido de acesso; o dono libera no
 * app e escolhe a filial padrão da pessoa. Mensagem com valor ("diesel 400 caminhão", "luz loja 2 1.250,00") vira
 * uma despesa do dia a dia PENDENTE: só entra no DRE quando o dono aprova. Responder a confirmação do robô com
 * "apagar" tira a despesa enquanto ainda estiver pendente. Mensagem sem número é conversa e o robô fica quieto.
 */
const crypto = require('crypto');
const db = require('./pg');
const store = require('./store');
const httpErr = store.httpErr;

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const API = 'https://api.telegram.org/bot';
const money = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function tg(token, metodo, params) {
  let r;
  try {
    r = await fetch(API + token + '/' + metodo, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal: AbortSignal.timeout(8000) });
  } catch (e) { throw httpErr(502, 'Não consegui falar com o Telegram agora. Tente de novo em instantes.'); }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { const e = httpErr(400, 'O Telegram recusou: ' + String(j.description || r.status).slice(0, 120)); e.tg = j; throw e; }
  return j.result;
}

/* ---------- entender a mensagem ---------- */
const CHAVES = [
  ['combustivel', /diesel|gasolin|etanol|alcool|álcool|combust|abastec|posto|arla/],
  ['manutencao', /consert|manuten|peça|peca|mec[aâ]nic|eletricist|encanador|pneu|borrach|oficina|reparo/],
  ['frete', /frete|carreto|transport|mudança/],
  ['energia', /\bluz\b|energia|edp|escelsa/],
  ['agua', /\bágua\b|\bagua\b|cesan|saae/],
  ['internet', /internet|telefone|celular|recarga|chip/],
  ['aluguel', /aluguel/],
  ['embalagens', /embalag|sacola|sacolinha|limpeza|detergente|papel|bobina|copo|material de/],
  ['marketing', /marketing|propaganda|an[uú]ncio|panfleto|carro de som|impuls|tr[aá]fego|banner|faixa/],
  ['taxas', /taxa|tarifa|maquininha|boleto banc/],
  ['perdas', /perda|quebra|vencid|estrag/],
  ['contabilidade', /contador|contabil/],
  ['seguro', /seguro/],
  ['impostos', /imposto|iptu|ipva|alvar|licenciamento|multa/]
];
function entende(texto, filialPadrao) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim();
  const baixo = t.toLowerCase();
  let filial = null;
  const mf = /\b(?:filial|loja|f)\s*([1-3])\b/i.exec(t);
  if (mf) { filial = +mf[1]; t = t.replace(mf[0], ' '); }
  else if (/\brede\b|todas as lojas/i.test(t)) filial = 0;
  // valor: o primeiro número com cara de dinheiro ("400", "1.250,00", "R$ 89,90", "1250.5")
  const mv = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/i.exec(t);
  if (!mv) return null;
  let s = mv[1];
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const valor = r2(Number(s));
  if (!(valor > 0) || valor > 1000000) return null;
  let categoria = 'outros';
  for (const [c, re] of CHAVES) if (re.test(baixo)) { categoria = c; break; }
  return { valor, categoria, filial: filial == null ? filialPadrao : filial };
}

/* ---------- configuração (só o dono, pelo app) ---------- */
async function cfg(tid) { return (await db.query('select * from dre_tg where tenant_id=$1', [tid])).rows[0] || null; }
async function estado(tid) {
  const c = await cfg(tid);
  const [pr, dr] = await Promise.all([
    db.query('select tg_user, nome, apelido, filial, liberado, created_at from dre_tg_pessoa where tenant_id=$1 order by liberado, created_at', [tid]),
    db.query(`select id, competencia, filial, categoria, descricao, valor, data, criado_por from dre_despesa where tenant_id=$1 and status='pendente' order by created_at`, [tid])
  ]);
  return {
    ligado: !!(c && c.ligado), bot: c ? c.bot_username : null,
    pessoas: pr.rows.map(p => ({ id: String(p.tg_user), nome: p.nome, apelido: p.apelido, filial: p.filial, liberado: p.liberado, pediuEm: p.created_at })),
    pendentes: dr.rows.map(d => ({ id: d.id, mes: d.competencia, filial: d.filial, categoria: d.categoria, descricao: d.descricao, valor: Number(d.valor), data: d.data ? String(d.data instanceof Date ? d.data.toISOString() : d.data).slice(0, 10) : null, criadoPor: d.criado_por }))
  };
}
async function ligar(tid, user, b) {
  const token = String(b.token || '').trim();
  if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token)) throw httpErr(400, 'Essa chave não parece a do BotFather. Copie a linha inteira, com os números, os dois-pontos e as letras.');
  const base = String(b.base || '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) throw httpErr(400, 'Abra o app pelo endereço https para ligar o robô.');
  const me = await tg(token, 'getMe');
  const secret = crypto.randomBytes(24).toString('hex');
  await tg(token, 'setWebhook', { url: base + '/api/tg/' + encodeURIComponent(tid), secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
  await db.query(`insert into dre_tg(tenant_id,token,secret,bot_username,ligado,atualizado_por) values($1,$2,$3,$4,true,$5)
    on conflict(tenant_id) do update set token=excluded.token, secret=excluded.secret, bot_username=excluded.bot_username, ligado=true, atualizado_por=excluded.atualizado_por, updated_at=now()`,
  [tid, token, secret, me.username || null, user.name || user.login]);
  return { bot: me.username };
}
async function desligar(tid) {
  const c = await cfg(tid);
  if (c && c.token) { try { await tg(c.token, 'deleteWebhook', {}); } catch (e) { /* segue: desliga aqui mesmo assim */ } }
  await db.query('update dre_tg set ligado=false, updated_at=now() where tenant_id=$1', [tid]);
  return { ligado: false };
}
async function pessoa(tid, b) {
  const id = String(b.id || '');
  if (!/^\d{1,15}$/.test(id)) throw httpErr(400, 'Pessoa inválida.');
  if (b.remover === true) { await db.query('delete from dre_tg_pessoa where tenant_id=$1 and tg_user=$2', [tid, id]); return { removida: true }; }
  const f = Number(b.filial);
  if (!(Number.isInteger(f) && f >= 0 && f <= 3)) throw httpErr(400, 'Escolha a filial padrão (1, 2, 3 ou rede).');
  const nome = String(b.nome || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60);
  if (nome.length < 2) throw httpErr(400, 'Nome: escreva pelo menos 2 letras.');
  const r = await db.query('update dre_tg_pessoa set nome=$3, filial=$4, liberado=$5 where tenant_id=$1 and tg_user=$2 returning tg_user', [tid, id, nome, f, b.liberado === true]);
  if (!r.rows.length) throw httpErr(404, 'Pessoa não encontrada. Atualize a tela.');
  return { liberado: b.liberado === true };
}
// aprovar (entra no DRE) ou recusar (apaga) despesas que vieram do robô
async function aprovar(tid, user, b) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(String).filter(x => /^[a-z0-9]{4,40}$/.test(x)).slice(0, 200);
  if (!ids.length) throw httpErr(400, 'Nada para aprovar.');
  const r = b.ok === false
    ? await db.query(`delete from dre_despesa where tenant_id=$1 and id = any(string_to_array($2, ',')) and status='pendente' returning id, tg_chat, valor`, [tid, ids.join(',')])
    : await db.query(`update dre_despesa set status='ok', aprovado_por=$3 where tenant_id=$1 and id = any(string_to_array($2, ',')) and status='pendente' returning id, tg_chat, valor`, [tid, ids.join(','), user.name || user.login]);
  return { feitas: r.rows.length };
}

/* ---------- aviso do Telegram (público, conferido pelo segredo) ---------- */
async function webhook(tid, headers, upd) {
  const c = await cfg(tid);
  const sec = String(headers['x-telegram-bot-api-secret-token'] || '');
  if (!c || !c.ligado || !c.secret || sec.length !== c.secret.length || !crypto.timingSafeEqual(Buffer.from(sec), Buffer.from(c.secret))) return { status: 403 };
  const m = upd && upd.message;
  if (!m || !m.from || m.from.is_bot || typeof m.text !== 'string') return { status: 200 };
  const uidTg = String(m.from.id), chat = m.chat.id, texto = m.text.trim();
  const responde = (text, extra) => tg(c.token, 'sendMessage', Object.assign({ chat_id: chat, text, reply_to_message_id: m.message_id, allow_sending_without_reply: true }, extra || {})).catch(() => null);
  const nomeTg = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ').slice(0, 60) || ('Telegram ' + uidTg);
  let p = (await db.query('select * from dre_tg_pessoa where tenant_id=$1 and tg_user=$2', [tid, uidTg])).rows[0];
  if (!p) {
    await db.query(`insert into dre_tg_pessoa(tenant_id,tg_user,nome,apelido,liberado) values($1,$2,$3,$4,false) on conflict do nothing`, [tid, uidTg, nomeTg, m.from.username || null]);
    await responde(`Olá, ${m.from.first_name || 'tudo bem'}! Pedi ao dono para liberar você. Assim que ele liberar, é só mandar a despesa aqui, tipo: diesel 400 caminhão.`);
    return { status: 200 };
  }
  const cmd = texto.toLowerCase();
  if (/^\/(start|ajuda|help)\b/.test(cmd)) {
    await responde(p.liberado ? 'Mande a despesa com o valor, tipo:\n• diesel 400 caminhão\n• conserto da câmara fria 1.250,00 loja 2\n• contador 2000 rede\nSem filial, vai para a filial ' + (p.filial === 0 ? 'rede' : p.filial) + '. Para tirar, responda a minha confirmação com "apagar".' : 'Seu acesso ainda não foi liberado pelo dono.');
    return { status: 200 };
  }
  if (!p.liberado) return { status: 200 };
  // "apagar" respondendo a confirmação do robô
  if (/^(apagar|apaga|cancelar|cancela)\b/.test(cmd) && m.reply_to_message) {
    const r = await db.query(`delete from dre_despesa where tenant_id=$1 and tg_chat=$2 and tg_msg=$3 and status='pendente' returning valor`, [tid, chat, m.reply_to_message.message_id]);
    await responde(r.rows.length ? 'Apagada: ' + money(r.rows[0].valor) + '.' : 'Essa já foi aprovada pelo dono ou já não existe. Fale com ele.');
    return { status: 200 };
  }
  const e = entende(texto, p.filial == null ? 1 : p.filial);
  if (!e) return { status: 200 };   // conversa: fica quieto
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const id = 'dd' + crypto.randomBytes(8).toString('hex');
  const ins = await db.query(`insert into dre_despesa(tenant_id,id,competencia,filial,categoria,descricao,valor,data,criado_por,status,origem,tg_chat,tg_update,tg_user)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente','telegram',$10,$11,$12) on conflict (tenant_id, tg_update) where tg_update is not null do nothing returning id`,
  [tid, id, hoje.slice(0, 7), e.filial, e.categoria, texto.slice(0, 120), e.valor, hoje, p.nome + ' (Telegram)', chat, upd.update_id, uidTg]);
  if (!ins.rows.length) return { status: 200 };   // aviso repetido do Telegram
  const { CATS } = require('./dre');
  const msg = await responde(`Lançado para o dono aprovar: ${money(e.valor)} · ${CATS[e.categoria]} · ${e.filial === 0 ? 'Rede' : 'Filial ' + e.filial}.\nErrado? Responda esta mensagem com "apagar".`);
  if (msg && msg.message_id) await db.query('update dre_despesa set tg_msg=$3 where tenant_id=$1 and id=$2', [tid, id, msg.message_id]);
  return { status: 200 };
}

module.exports = { webhook, estado, ligar, desligar, pessoa, aprovar, entende };

'use strict';
/* Voz dos vídeos de Stories/Feed do Gerador de Encartes (ElevenLabs).
   - A chave fica só no servidor (variável ELEVENLABS_API_KEY na Vercel); o navegador nunca a vê.
   - Só o administrador gera voz: cada fala gasta crédito.
   - Cada fala fica guardada pelo hash de voz + modelo + texto: a mesma fala nunca é paga duas vezes
     (vinheta da campanha, produto que repete na semana seguinte etc.).
   - Limite por mês (documento app/vozcfg, campo "limite"; padrão 30.000 = plano Starter): passou, recusa. */
const crypto = require('crypto');
const db = require('./pg');
const { httpErr } = require('./store');

/* créditos por caractere de cada modelo (tabela da ElevenLabs) */
const MODELOS = Object.freeze({ eleven_multilingual_v2: 1, eleven_flash_v2_5: 0.5 });
const MODELO_PADRAO = 'eleven_multilingual_v2';
const VOZ_PADRAO = 'HR2TRGmi4QbMsO5omv7l'; // Rômulo Franklin, radialista
const VOZ_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_TXT = 300;
const LIMITE_PADRAO = 30000;
const MAX_AUDIO = 2 * 1024 * 1024; // mp3 de uma fala (base64)

const limpa = t => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const chave = (voz, modelo, texto) => crypto.createHash('sha256').update(voz + '|' + modelo + '|' + texto).digest('hex').slice(0, 32);
const mesAtual = (d = new Date()) => d.toISOString().slice(0, 7);
const custo = (texto, modelo) => Math.ceil(texto.length * (MODELOS[modelo] || 1));

function pedido(b) {
  const texto = limpa(b && b.texto);
  if (!texto) throw httpErr(400, 'A fala está vazia.');
  if (texto.length > MAX_TXT) throw httpErr(400, `Fala longa demais (${texto.length} letras). Use até ${MAX_TXT}: fala curta gasta menos crédito.`);
  const voz = b && b.voz ? String(b.voz) : VOZ_PADRAO;
  if (!VOZ_RE.test(voz)) throw httpErr(400, 'Voz inválida.');
  const modelo = b && b.modelo ? String(b.modelo) : MODELO_PADRAO;
  if (!Object.prototype.hasOwnProperty.call(MODELOS, modelo)) throw httpErr(400, 'Modelo de voz inválido.');
  return { texto, voz, modelo, id: chave(voz, modelo, texto), cred: custo(texto, modelo) };
}

async function lerDoc(tid, p) {
  const r = await db.query('select data from enc_docs where tenant_id=$1 and path=$2', [tid, p]);
  try { return (r.rows[0] && JSON.parse(r.rows[0].data)) || null; } catch (e) { return null; }
}
async function gravarDoc(tid, p, data) {
  await db.query(`insert into enc_docs(tenant_id,path,data,updated_by) values($1,$2,$3,'voz')
    on conflict(tenant_id,path) do update set data=excluded.data, updated_by=excluded.updated_by, updated_at=now()`, [tid, p, JSON.stringify(data)]);
}
async function situacao(tid) {
  const cfg = (await lerDoc(tid, 'app/vozcfg')) || {};
  const lim = Number(cfg.limite);
  const limite = Number.isFinite(lim) && lim >= 0 ? Math.floor(lim) : LIMITE_PADRAO;
  const u = (await lerDoc(tid, 'app/vozuso')) || {};
  const mes = mesAtual();
  const usado = u.mes === mes ? Number(u.cred) || 0 : 0;
  return { ligada: !!process.env.ELEVENLABS_API_KEY, limite, usado, mes, vozPadrao: VOZ_PADRAO, modeloPadrao: MODELO_PADRAO, modelos: MODELOS, maxTexto: MAX_TXT };
}
async function somarUso(tid, cred) {
  const mes = mesAtual();
  const u = (await lerDoc(tid, 'app/vozuso')) || {};
  const base = u.mes === mes ? u : { mes, cred: 0, falas: 0 };
  await gravarDoc(tid, 'app/vozuso', { mes, cred: (Number(base.cred) || 0) + cred, falas: (Number(base.falas) || 0) + 1 });
}

function erroEleven(status, txt) {
  let det = ''; try { const j = JSON.parse(txt); det = String((j.detail && (j.detail.status || j.detail.message || j.detail)) || ''); } catch (e) { det = ''; }
  if (status === 401) return httpErr(502, 'A ElevenLabs recusou a chave. Confira a ELEVENLABS_API_KEY na Vercel.');
  if (/quota|credit/i.test(det) || status === 402) return httpErr(502, 'Acabaram os créditos da ElevenLabs neste mês.');
  if (status === 429) return httpErr(503, 'A ElevenLabs está ocupada agora. Tente de novo em um minuto.');
  if (/voice/i.test(det) && status === 400) return httpErr(502, 'A ElevenLabs não achou esta voz. Escolha outra voz.');
  return httpErr(502, 'A ElevenLabs não respondeu direito (' + status + '). Tente de novo.');
}

async function falar(q) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw httpErr(503, 'A voz ainda não está ligada: falta colocar a chave da ElevenLabs (ELEVENLABS_API_KEY) na Vercel.');
  const base = (!process.env.VERCEL && process.env.ELEVENLABS_BASE) || 'https://api.elevenlabs.io';
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 25000);
  let r;
  try {
    r = await fetch(base + '/v1/text-to-speech/' + q.voz + '?output_format=mp3_44100_128', {
      method: 'POST', signal: ctl.signal,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: q.texto, model_id: q.modelo, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } })
    });
  } catch (e) { throw httpErr(503, 'Não consegui falar com a ElevenLabs. Confira a internet e tente de novo.'); } finally { clearTimeout(tm); }
  if (!r.ok) throw erroEleven(r.status, await r.text().catch(() => ''));
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw httpErr(502, 'A ElevenLabs mandou um áudio vazio. Tente de novo.');
  return buf.toString('base64');
}

/* GET: como está a voz (ligada, uso do mês). POST {texto, voz, modelo, estimar}: devolve a fala em mp3 (base64). */
async function handle({ method, user, tid, body, audit }) {
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador gera vídeo com voz (cada fala gasta crédito).');
  if (method === 'GET') return situacao(tid);
  const b = await body();
  const q = pedido(b);
  const r = await db.query('select b64 from enc_blobs where tenant_id=$1 and id=$2', [tid, q.id]);
  if (r.rows.length) return { id: q.id, cache: true, cred: 0, audio: b.estimar === true ? undefined : r.rows[0].b64 };
  if (b.estimar === true) return { id: q.id, cache: false, cred: q.cred };
  const st = await situacao(tid);
  if (st.usado + q.cred > st.limite) throw httpErr(429, `Limite do mês atingido: ${st.usado} de ${st.limite} créditos. Aumente o limite no Painel do dono ou espere virar o mês.`);
  const b64 = await falar(q);
  if (b64.length > MAX_AUDIO) throw httpErr(502, 'Áudio grande demais. Encurte a fala.');
  await db.query(`insert into enc_blobs(tenant_id,id,mime,b64) values($1,$2,'audio/mpeg',$3) on conflict(tenant_id,id) do nothing`, [tid, q.id, b64]);
  await somarUso(tid, q.cred);
  if (audit) await audit('encartes_voz', { cred: q.cred, letras: q.texto.length, modelo: q.modelo });
  return { id: q.id, cache: false, cred: q.cred, audio: b64 };
}

module.exports = { handle, pedido, chave, custo, limpa, mesAtual, MODELOS, VOZ_PADRAO, MODELO_PADRAO, MAX_TXT, LIMITE_PADRAO };

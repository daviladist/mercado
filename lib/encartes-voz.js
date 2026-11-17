'use strict';
/* Voz dos vídeos de Stories/Feed do Gerador de Encartes (ElevenLabs).
   - A chave fica só no servidor (variável ELEVENLABS_API_KEY na Vercel); o navegador nunca a vê.
   - Só o administrador gera voz: cada fala gasta crédito.
   - Cada fala fica guardada pelo hash de voz + modelo + texto: a mesma fala não é paga duas vezes
     (vinheta da campanha, produto que repete na semana seguinte etc.). "refazer" grava de novo, de propósito.
   - Limite por mês (documento app/vozcfg, campo "limite"; padrão 30.000 = plano Starter): passou, recusa.
     A conta é feita no banco numa operação só (reserva antes de gerar): dois pedidos ao mesmo tempo não furam o limite.
   - Só um pedido gera cada fala por vez (trava em app/vozlock/<id>): duas abas não pagam a mesma fala.
   - O custo vem da própria ElevenLabs (cabeçalho da resposta) quando ela informa; senão, vale a estimativa.
   - Teto geral da conta (variável ELEVENLABS_TETO_MES, opcional): soma de todas as empresas no mês.
   - Saldo de verdade: lido da ElevenLabs quando a chave deixa (user_read); se faltar saldo lá, nem tenta gerar. */
const crypto = require('crypto');
const db = require('./pg');
const { httpErr } = require('./store');

/* créditos por caractere de cada modelo. O econômico custa de 0,5 a 1 conforme o plano: a estimativa usa 0,5
   e a conta é acertada pelo custo que a ElevenLabs devolve. */
const MODELOS = Object.freeze({ eleven_multilingual_v2: 1, eleven_flash_v2_5: 0.5 });
const MODELO_PADRAO = 'eleven_multilingual_v2';
const VOZ_PADRAO = 'HR2TRGmi4QbMsO5omv7l'; // Rômulo Franklin, radialista
const VOZ_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_TXT = 300;
const LIMITE_PADRAO = 30000;
const MAX_AUDIO = 2 * 1024 * 1024; // mp3 de uma fala (base64)
const TRAVA_S = 45;                // trava de uma fala em geração: mais velha que isso, foi pedido que morreu
const ESPERA_MS = 12000;           // quanto um segundo pedido espera a fala que outro está gerando

const limpa = t => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const chave = (voz, modelo, texto) => crypto.createHash('sha256').update(voz + '|' + modelo + '|' + texto).digest('hex').slice(0, 32);
const mesAtual = (d = new Date()) => d.toISOString().slice(0, 7);
const custo = (texto, modelo) => Math.ceil(texto.length * (MODELOS[modelo] || 1));
const base = () => (!process.env.VERCEL && process.env.ELEVENLABS_BASE) || 'https://api.elevenlabs.io';
const dorme = ms => new Promise(r => setTimeout(r, ms));
/* teto geral da conta, somando todas as empresas (0 ou vazio = sem teto) */
function tetoGeral() { const n = Math.floor(Number(process.env.ELEVENLABS_TETO_MES)); return Number.isFinite(n) && n > 0 ? n : null; }

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
/* uso do mês em texto JSON; o que não for JSON válido conta como zero */
const USO_SQL = `(case when enc_docs.data ~ '^\\s*\\{' and (enc_docs.data::jsonb->>'mes') = $2 and (enc_docs.data::jsonb->>'cred') ~ '^[0-9]+(\\.[0-9]+)?$' then (enc_docs.data::jsonb->>'cred')::numeric else 0 end)`;
const FALAS_SQL = `(case when enc_docs.data ~ '^\\s*\\{' and (enc_docs.data::jsonb->>'mes') = $2 and (enc_docs.data::jsonb->>'falas') ~ '^[0-9]+$' then (enc_docs.data::jsonb->>'falas')::int else 0 end)`;
/* Reserva os créditos numa operação só: soma ao uso do mês SE couber no limite. Devolve false se não coube. */
async function reservar(tid, cred, limite) {
  const mes = mesAtual();
  if (cred > limite) return false;
  const r = await db.query(`insert into enc_docs(tenant_id,path,data,updated_by) values($1,'app/vozuso',json_build_object('mes',$2::text,'cred',$3::numeric,'falas',1)::text,'voz')
    on conflict(tenant_id,path) do update set data=json_build_object('mes',$2::text,'cred',${USO_SQL}+$3::numeric,'falas',${FALAS_SQL}+1)::text, updated_by='voz', updated_at=now()
    where ${USO_SQL}+$3::numeric <= $4::numeric returning 1 as ok`, [tid, mes, cred, limite]);
  return r.rows.length > 0;
}
/* acerta a conta depois: devolve a reserva (falha) ou soma a diferença do custo real. Nunca deixa negativo. */
async function ajustar(tid, delta, falas) {
  if (!delta && !falas) return;
  await db.query(`update enc_docs set data=json_build_object('mes',$2::text,'cred',greatest(0,${USO_SQL}+$3::numeric),'falas',greatest(0,${FALAS_SQL}+$4::int))::text, updated_at=now()
    where tenant_id=$1 and path='app/vozuso'`, [tid, mesAtual(), delta, falas || 0]);
}
async function usoGeral() {
  const mes = mesAtual();
  const r = await db.query(`select coalesce(sum(${USO_SQL.replace(/\$2/g, '$1')}),0) as cred from enc_docs where path='app/vozuso'`, [mes]);
  return Number(r.rows[0] && r.rows[0].cred) || 0;
}

/* ---- ElevenLabs: saldo de verdade e situação da voz (melhor esforço: chave restrita pode não deixar ler) ---- */
let contaCache = { at: 0, v: null };
async function pegar(caminho, ms) {
  const key = process.env.ELEVENLABS_API_KEY; if (!key) return null;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms || 4000);
  try { const r = await fetch(base() + caminho, { headers: { 'xi-api-key': key, Accept: 'application/json' }, signal: ctl.signal }); return { status: r.status, json: r.ok ? await r.json().catch(() => null) : null }; }
  catch (e) { return null; } finally { clearTimeout(tm); }
}
async function contaReal(fresco) {
  if (!fresco && Date.now() - contaCache.at < 60000) return contaCache.v;
  const r = await pegar('/v1/user/subscription');
  const j = r && r.json; let v = null;
  if (j && Number.isFinite(Number(j.character_count)) && Number.isFinite(Number(j.character_limit)))
    v = { usado: Number(j.character_count), limite: Number(j.character_limit), renova: Number(j.next_character_count_reset_unix) || null, plano: j.tier ? String(j.tier).slice(0, 30) : null };
  contaCache = { at: Date.now(), v };
  return v;
}
/* a voz ainda existe para esta conta? ok: true/false; null = não deu para saber. "some": data em que o dono tira a voz */
async function vozReal(voz) {
  if (!VOZ_RE.test(String(voz || ''))) return null;
  const r = await pegar('/v1/voices/' + voz);
  if (!r) return null;
  if (r.status === 200 && r.json) { const s = r.json.sharing || {}; const d = Number(r.json.disable_at_unix || s.disable_at_unix) || null; return { ok: true, some: d }; }
  if (r.status === 400 || r.status === 404) return { ok: false, some: null };
  return null; // 401/403 (chave sem permissão de leitura) ou erro: não sabemos
}

async function situacao(tid, voz) {
  const cfg = (await lerDoc(tid, 'app/vozcfg')) || {};
  const teto = tetoGeral();
  const lim = Number(cfg.limite);
  let limite = Number.isFinite(lim) && lim >= 0 ? Math.floor(lim) : LIMITE_PADRAO;
  if (teto != null) limite = Math.min(limite, teto);
  const u = (await lerDoc(tid, 'app/vozuso')) || {};
  const mes = mesAtual();
  const usado = u.mes === mes ? Math.ceil(Number(u.cred) || 0) : 0;
  const ligada = !!process.env.ELEVENLABS_API_KEY;
  const out = { ligada, limite, usado, mes, teto, vozPadrao: VOZ_PADRAO, modeloPadrao: MODELO_PADRAO, modelos: MODELOS, maxTexto: MAX_TXT, conta: null, voz: null };
  if (ligada) { const [c, v] = await Promise.all([contaReal(false), voz ? vozReal(voz) : null]); out.conta = c; out.voz = v; }
  return out;
}

/* Atenção: o servidor esconde a mensagem de todo erro 5xx ("Erro no servidor"). Problema com a ElevenLabs é coisa que o
   administrador resolve (chave, crédito, voz), então sai como 424 (ou 429 para crédito/fila), com a mensagem inteira. */
function erroEleven(status, txt) {
  let det = ''; try { const j = JSON.parse(txt); det = String((j.detail && (j.detail.status || j.detail.message || j.detail)) || ''); } catch (e) { det = ''; }
  if (status === 401) return httpErr(/quota|credit/i.test(det) ? 429 : 424, /quota|credit/i.test(det) ? 'Acabaram os créditos da ElevenLabs (ou a cota desta chave) neste mês.' : 'A ElevenLabs recusou a chave. Confira a ELEVENLABS_API_KEY na Vercel.');
  if (/quota|credit/i.test(det) || status === 402) return httpErr(429, 'Acabaram os créditos da ElevenLabs (ou a cota desta chave) neste mês.');
  if (status === 429) return httpErr(429, 'A ElevenLabs está ocupada agora. Tente de novo em um minuto.');
  if (/voice/i.test(det) && (status === 400 || status === 404)) return httpErr(424, 'A ElevenLabs não tem mais esta voz na sua conta (o dono pode ter tirado, ou falta o "Add to my voices"). Escolha outra voz em "Voz e música".');
  return httpErr(424, 'A ElevenLabs não respondeu direito (' + status + '). Tente de novo.');
}

async function falar(q) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw httpErr(424, 'A voz ainda não está ligada: falta colocar a chave da ElevenLabs (ELEVENLABS_API_KEY) na Vercel.');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 20000);
  let r;
  try {
    r = await fetch(base() + '/v1/text-to-speech/' + q.voz + '?output_format=mp3_44100_128', {
      method: 'POST', signal: ctl.signal,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: q.texto, model_id: q.modelo, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } })
    });
  } catch (e) { throw httpErr(424, 'Não consegui falar com a ElevenLabs. Confira a internet e tente de novo.'); } finally { clearTimeout(tm); }
  if (!r.ok) throw erroEleven(r.status, await r.text().catch(() => ''));
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw httpErr(424, 'A ElevenLabs mandou um áudio vazio. Tente de novo.');
  /* custo cobrado de verdade (a ElevenLabs informa no cabeçalho); vale o maior entre ele e a estimativa */
  const real = Number(r.headers.get('character-cost') || r.headers.get('x-character-count'));
  return { b64: buf.toString('base64'), cred: Number.isFinite(real) && real > 0 ? Math.max(q.cred, Math.ceil(real)) : q.cred };
}

/* trava de uma fala: só um pedido gera por vez; trava velha (pedido que morreu) pode ser tomada */
async function travar(tid, id) {
  const r = await db.query(`insert into enc_docs(tenant_id,path,data,updated_by) values($1,$2,'{}','voz')
    on conflict(tenant_id,path) do update set updated_at=now() where enc_docs.updated_at < now() - make_interval(secs => $3) returning 1 as ok`, [tid, 'app/vozlock/' + id, TRAVA_S]);
  return r.rows.length > 0;
}
const soltar = (tid, id) => db.query('delete from enc_docs where tenant_id=$1 and path=$2', [tid, 'app/vozlock/' + id]).catch(() => {});
const guardada = async (tid, id) => { const r = await db.query('select b64 from enc_blobs where tenant_id=$1 and id=$2', [tid, id]); return r.rows.length ? r.rows[0].b64 : null; };

/* GET [?voz=ID]: como está a voz (ligada, uso do mês, saldo na ElevenLabs, situação da voz).
   POST {texto, voz, modelo, estimar, refazer}: devolve a fala em mp3 (base64). */
async function handle({ method, user, tid, body, audit, query }) {
  if (user.role !== 'admin') throw httpErr(403, 'Só o administrador gera vídeo com voz (cada fala gasta crédito).');
  if (method === 'GET') return situacao(tid, query && query.get ? query.get('voz') : null);
  if (method !== 'POST') throw httpErr(405, 'Método não aceito.');
  const b = await body();
  const q = pedido(b);
  const refazer = b.refazer === true;
  const tem = await guardada(tid, q.id);
  if (b.estimar === true) return { id: q.id, cache: !!tem, cred: tem && !refazer ? 0 : q.cred };
  if (tem && !refazer) return { id: q.id, cache: true, cred: 0, audio: tem };
  /* outro pedido (outra aba, outro administrador) pode estar gerando esta mesma fala: espera a dele em vez de pagar de novo */
  let minha = await travar(tid, q.id);
  const ate = Date.now() + ESPERA_MS;
  while (!minha) {
    if (Date.now() >= ate) throw httpErr(409, 'Esta fala já está sendo gerada em outra tela. Espere uns segundos e tente de novo.');
    await dorme(500);
    if (!refazer) { const g = await guardada(tid, q.id); if (g) return { id: q.id, cache: true, cred: 0, audio: g }; }
    minha = await travar(tid, q.id);
  }
  try {
    if (!refazer) { const g = await guardada(tid, q.id); if (g) return { id: q.id, cache: true, cred: 0, audio: g }; }
    const st = await situacao(tid, null);
    if (st.conta && st.conta.limite - st.conta.usado < q.cred) throw httpErr(429, `A ElevenLabs só tem ${Math.max(0, st.conta.limite - st.conta.usado)} créditos sobrando neste ciclo, e esta fala pede ${q.cred}. Espere renovar ou aumente o plano.`);
    if (st.teto != null && (await usoGeral()) + q.cred > st.teto) throw httpErr(429, `Teto geral da conta atingido (${st.teto} créditos no mês, somando todas as empresas).`);
    if (!(await reservar(tid, q.cred, st.limite))) throw httpErr(429, `Limite do mês atingido: ${st.usado} de ${st.limite} créditos. Aumente o limite em "Voz e música" ou espere virar o mês.`);
    let f;
    try { f = await falar(q); } catch (e) { await ajustar(tid, -q.cred, -1).catch(() => {}); throw e; }
    contaCache.at = 0; // o saldo mudou: a próxima leitura busca de novo
    if (f.cred > q.cred) await ajustar(tid, f.cred - q.cred, 0).catch(() => {});
    if (f.b64.length > MAX_AUDIO) throw httpErr(424, 'Áudio grande demais. Encurte a fala.');
    await db.query(`insert into enc_blobs(tenant_id,id,mime,b64) values($1,$2,'audio/mpeg',$3) on conflict(tenant_id,id) do update set b64=excluded.b64, created_at=now()`, [tid, q.id, f.b64]);
    if (audit) await audit('encartes_voz', { cred: f.cred, letras: q.texto.length, modelo: q.modelo, refazer });
    return { id: q.id, cache: false, cred: f.cred, audio: f.b64 };
  } finally { await soltar(tid, q.id); }
}

module.exports = { handle, pedido, chave, custo, limpa, mesAtual, tetoGeral, MODELOS, VOZ_PADRAO, MODELO_PADRAO, MAX_TXT, LIMITE_PADRAO };

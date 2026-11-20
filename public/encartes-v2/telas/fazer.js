// FAZER ENCARTE (a tela da equipe): 1. Modelo → 2. Produtos → 3. Conferir → 4. Baixar.
import { $, $$, esc, avisar, escolherArquivo } from './comum.js';
import { estado, imagensDasLogos, montarRodape, salvarRascunho, salvarEncarte } from '../estado.js';
import { DIAS_CURTOS, modelosDaEquipe, textoDias } from '../campanhas.js';
import { novoEncarte, colarLista, alternarDestaque, paginas, travar, destravar, conferir, validadeTexto, maxDestaques, agruparAvisos } from '../encarte-dados.js';
import { carregarBanco, procurarPorNome, ligar, banco } from '../banco.js';
import { subirImagem, enderecoImagem, carregarImagem, arquivoParaDataURL } from '../nuvem.js';
import { desenharPagina, FORMATOS } from '../arte/encarte.js';

const ORDEM = [1, 2, 3, 4, 5, 6, 0];
let passo = 1, filtroDia = new Date().getDay();
const reais = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',');
const lerReais = s => { const n = Number(String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };

const modeloAtual = () => estado.campanhas.find(c => c.id === estado.rascunho?.modeloId);

export async function mostrar(raiz) {
  if (!banco().carregado) carregarBanco();
  if (estado.rascunho && !modeloAtual()) estado.rascunho = null;
  if (!estado.rascunho) passo = 1;
  const nomes = ['Modelo', 'Produtos', 'Conferir', 'Baixar'];
  raiz.innerHTML = `
    <div class="linha" style="margin-bottom:12px">${nomes.map((n, i) => `<button class="btn ${passo === i + 1 ? 'esc' : ''}" data-passo="${i + 1}" ${!estado.rascunho && i ? 'disabled' : ''}>${i + 1}. ${n}</button>`).join('')}
      <span class="esp"></span>${estado.rascunho ? '<button class="btn" id="recomecar">Começar outro encarte</button>' : ''}</div>
    <div id="corpo"></div>`;
  $$('[data-passo]', raiz).forEach(b => b.onclick = () => { passo = +b.dataset.passo; mostrar(raiz); });
  const rc = $('#recomecar', raiz);
  if (rc) rc.onclick = () => { if (confirm('Começar outro encarte? O atual continua salvo nos encartes recentes se você já baixou.')) { estado.rascunho = null; salvarRascunho(); passo = 1; mostrar(raiz); } };
  const corpo = $('#corpo', raiz);
  const ir = n => { passo = n; mostrar(raiz); };
  if (passo === 1) return passo1(corpo, ir);
  if (passo === 2) return passo2(corpo, ir);
  if (passo === 3) return passo3(corpo, ir);
  return passo4(corpo, ir);
}

// ---------------- 1. modelo ----------------
function passo1(raiz, ir) {
  const lista = modelosDaEquipe(estado.campanhas, filtroDia);
  raiz.innerHTML = `<h2>Qual encarte?</h2><p class="sub">Aparecem os modelos liberados para o dia escolhido.</p>
    <div class="dias" id="dias">${ORDEM.map(d => `<button data-d="${d}" class="${filtroDia === d ? 'on' : ''} ${d === new Date().getDay() ? 'hoje' : ''}">${DIAS_CURTOS[d]}</button>`).join('')}</div>
    ${lista.length ? `<div class="grade">${lista.map(c => `<div class="camp" data-id="${esc(c.id)}"><div class="cab" style="background-image:url('${esc(enderecoImagem(c.cabecalho))}')"></div><div class="info"><div class="nome">${esc(c.nome)}</div><div class="dd">${esc(textoDias(c))}</div></div></div>`).join('')}</div>`
      : '<div class="vazio"><b>Nenhum modelo liberado para este dia.</b>Peça ao dono para cadastrar ou liberar o modelo.</div>'}`;
  $$('#dias button', raiz).forEach(b => b.onclick = () => { filtroDia = +b.dataset.d; passo1(raiz, ir); });
  $$('.camp', raiz).forEach(el => el.onclick = () => {
    const m = estado.campanhas.find(c => c.id === el.dataset.id);
    estado.rascunho = novoEncarte(m);
    salvarRascunho();
    ir(2);
  });
}

// ---------------- 2. produtos ----------------
function fotoDe(p) { return p.fotoId ? enderecoImagem(p.fotoId) : (p.banco && p.banco.fotoBanco ? enderecoImagem(p.banco.fotoBanco) : null); }

function passo2(raiz, ir) {
  const e = estado.rascunho, m = modeloAtual();
  const frases = estado.loja.frases || [];
  const nDest = e.produtos.filter(p => p.destaque).length;
  raiz.innerHTML = `
    <h2>${esc(m.nome)}: produtos</h2>
    <div class="caixa"><h3>Cole a lista</h3>
      <p class="sub" style="margin:0 0 8px">Uma linha por produto: <b>Nome  preço</b> ou <b>Nome  preço  preço-com-app</b>. Ex.: <i>Coxa e sobrecoxa kg 9,79 7,79</i></p>
      <textarea id="txt" rows="5" style="width:100%;padding:10px;border:1px solid var(--linha);border-radius:8px;font:inherit" placeholder="Arroz Risoto 5kg 15,78&#10;Coxa e sobrecoxa kg 9,79 7,79"></textarea>
      <div class="linha" style="margin-top:8px"><button class="btn pri" id="add">Adicionar à lista</button><span id="semPreco" class="sub" style="margin:0"></span></div>
    </div>
    <div class="caixa"><div class="linha"><h3 style="margin:0">${e.produtos.length} produtos</h3><span class="esp"></span><span class="sub" style="margin:0">Destaques: ${nDest} de ${maxDestaques(m)}</span></div>
      <div id="itens">${e.produtos.map((p, i) => linhaProduto(p, i, e.produtos.length, frases)).join('') || '<p class="sub">Nenhum produto ainda.</p>'}</div>
    </div>
    <div class="pe"><button class="btn pri" id="seguir" ${e.produtos.length ? '' : 'disabled'}>Conferir →</button></div>`;

  $('#add', raiz).onclick = () => {
    const r = colarLista(e, $('#txt', raiz).value, nome => ligar(procurarPorNome(nome).item));
    salvarRascunho();
    passo2(raiz, ir);
    if (r.semPreco.length) $('#semPreco', raiz).textContent = `Ficaram de fora (sem preço): ${r.semPreco.join(' • ')}`;
    else avisar(`${r.novos} produtos adicionados`);
  };
  $('#seguir', raiz).onclick = () => ir(3);

  const achar = el => e.produtos.find(p => p.id === el.closest('[data-id]').dataset.id);
  const mudou = () => { salvarRascunho(); passo2(raiz, ir); };
  $$('[data-a]', raiz).forEach(b => b.onclick = async ev => {
    ev.preventDefault();
    const p = achar(b), i = e.produtos.indexOf(p);
    const a = b.dataset.a;
    if (a === 'dest') { if (!alternarDestaque(e, p.id, m)) avisar(`Este modelo permite até ${maxDestaques(m)} destaques.`); return mudou(); }
    if (a === 'casc') { p.repetir = !p.repetir; return mudou(); }
    if (a === 'sobe' && i > 0) { [e.produtos[i - 1], e.produtos[i]] = [e.produtos[i], e.produtos[i - 1]]; return mudou(); }
    if (a === 'desce' && i < e.produtos.length - 1) { [e.produtos[i + 1], e.produtos[i]] = [e.produtos[i], e.produtos[i + 1]]; return mudou(); }
    if (a === 'tira') { e.produtos.splice(i, 1); return mudou(); }
    if (a === 'foto') { const f = await escolherArquivo('image/*'); if (f) await guardarFoto(p, f); return mudou(); }
    if (a === 'web') return fotoDaInternet(p, mudou);
    if (a === 'banco') return escolherNoBanco(p, mudou);
  });
  $$('[data-k]', raiz).forEach(inp => inp.onchange = () => {
    const p = achar(inp), k = inp.dataset.k;
    if (k === 'nome') p.nome = inp.value.trim() || p.nome;
    if (k === 'preco') p.preco = lerReais(inp.value) ?? p.preco;
    if (k === 'precoApp') p.precoApp = lerReais(inp.value);
    if (k === 'limite') p.limite = Math.max(0, Math.floor(+inp.value || 0)) || null;
    if (k === 'frase') p.frase = inp.value;
    mudou();
  });
}

function linhaProduto(p, i, n, frases) {
  const src = fotoDe(p);
  return `<div class="item" data-id="${esc(p.id)}">
    <div class="foto" style="${src ? `background-image:url('${esc(src)}')` : ''}">${src ? '' : 'sem foto'}</div>
    <div class="meio">
      <input type="text" data-k="nome" value="${esc(p.nome)}" class="nome">
      <div class="campos">
        <label>R$ <input type="text" data-k="preco" value="${reais(p.preco)}" inputmode="decimal"></label>
        <label>App <input type="text" data-k="precoApp" value="${reais(p.precoApp)}" placeholder="—" inputmode="decimal"></label>
        ${p.precoApp != null ? `<label>Limite <input type="number" data-k="limite" value="${p.limite || ''}" placeholder="—"></label>` : ''}
        <select data-k="frase"><option value="">Sem frase</option>${frases.map(f => `<option ${p.frase === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      </div>
      <div class="info">${p.banco ? `No banco: ${esc(p.banco.nomeBanco)}` : '<b class="alerta">Não achei no banco</b>'} · <a href="#" data-a="banco">trocar</a> · <a href="#" data-a="foto">${src ? 'trocar foto' : 'foto do aparelho'}</a>${src ? '' : ' · <a href="#" data-a="web">foto da internet</a>'}</div>
    </div>
    <div class="acoes">
      <button class="ic ${p.destaque ? 'on' : ''}" data-a="dest" title="Destaque">★</button>
      <button class="ic ${p.repetir ? 'on' : ''}" data-a="casc" title="Foto repetida (leve vários)">⧉</button>
      <button class="ic" data-a="sobe" title="Subir" ${i ? '' : 'disabled'}>↑</button>
      <button class="ic" data-a="desce" title="Descer" ${i < n - 1 ? '' : 'disabled'}>↓</button>
      <button class="ic" data-a="tira" title="Tirar do encarte">✕</button>
    </div></div>`;
}

async function guardarFoto(p, arquivo) {
  try {
    avisar('Subindo a foto…');
    const { dataURL, w, h } = await arquivoParaDataURL(arquivo, 1200);
    p.fotoId = await subirImagem(dataURL);
    p.fotoPequena = Math.max(w, h) < 400;
    avisar('Foto salva');
  } catch (e) { avisar('Não consegui usar essa foto: ' + e.message, 5000); }
}

// Foto da internet: abre a busca de imagens; a pessoa copia a imagem e cola aqui (Ctrl+V ou segurar e colar no celular).
function fotoDaInternet(p, pronto) {
  window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(p.nome), '_blank', 'noopener');
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:60';
  fundo.innerHTML = `<div class="caixa" style="max-width:420px;width:92%"><h3>Foto da internet: ${esc(p.nome)}</h3>
    <p class="sub">Abri a busca de imagens. Copie a foto do produto (de preferência fundo branco) e cole aqui.</p>
    <div id="cola" contenteditable="true" style="border:2px dashed var(--linha);border-radius:10px;padding:30px;text-align:center;color:var(--mut)">Toque aqui e cole (Ctrl+V)</div>
    <div class="linha" style="margin-top:10px"><button class="btn" id="fecha">Cancelar</button></div></div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.querySelector('#fecha').onclick = fechar;
  fundo.addEventListener('paste', async ev => {
    ev.preventDefault();
    const item = [...(ev.clipboardData?.items || [])].find(x => x.type.startsWith('image/'));
    if (!item) { avisar('Isso não é uma imagem. Copie a foto (não o link).', 4000); return; }
    fechar();
    await guardarFoto(p, item.getAsFile());
    pronto();
  });
}

function escolherNoBanco(p, pronto) {
  const { candidatos } = procurarPorNome(p.nome);
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:60';
  fundo.innerHTML = `<div class="caixa" style="max-width:520px;width:94%;max-height:80vh;overflow:auto"><h3>Qual destes é "${esc(p.nome)}"?</h3>
    <input type="text" id="busca" value="${esc(p.nome)}" placeholder="Procurar no banco">
    <div id="cands" style="margin-top:8px"></div>
    <div class="linha" style="margin-top:10px"><button class="btn" id="nenhum">Não está no banco</button><span class="esp"></span><button class="btn" id="fecha">Fechar</button></div></div>`;
  document.body.appendChild(fundo);
  const mostrarC = L => {
    fundo.querySelector('#cands').innerHTML = L.length ? L.map((it, i) => `<button class="btn" data-i="${i}" style="display:block;width:100%;text-align:left;margin-bottom:6px">${esc(it.d)} <small style="color:var(--mut)">cód. ${esc(it.c)}</small></button>`).join('') : '<p class="sub">Nada parecido no banco.</p>';
    fundo.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { p.banco = ligar(L[+b.dataset.i]); fundo.remove(); pronto(); });
  };
  mostrarC(candidatos);
  fundo.querySelector('#busca').oninput = ev => mostrarC(procurarPorNome(ev.target.value).candidatos);
  fundo.querySelector('#nenhum').onclick = () => { p.banco = null; fundo.remove(); pronto(); };
  fundo.querySelector('#fecha').onclick = () => fundo.remove();
}

// ---------------- 3. conferir ----------------
async function montarPaginas(formato = 'feed', economiaTinta = false) {
  const e = estado.rascunho, m = modeloAtual();
  const [logos, cab, rodape] = await Promise.all([imagensDasLogos(), carregarImagem(enderecoImagem(m.cabecalho)).catch(() => null), montarRodape(validadeTexto(e), e.obsPontual)]);
  const pags = paginas(e, m);
  const out = [];
  for (let i = 0; i < pags.length; i++) {
    const produtos = await Promise.all(pags[i].produtos.map(async p => ({ ...p, foto: await carregarImagem(fotoDe(p)).catch(() => null) })));
    out.push({ formato, tema: { ...m, cabecalho: cab }, logos, produtos, verso: i > 0, rodape, economiaTinta, travada: pags[i].travada });
  }
  return out;
}

async function passo3(raiz, ir) {
  const e = estado.rascunho, m = modeloAtual(), r = conferir(e);
  raiz.innerHTML = `
    <div class="editor">
      <div>
        <h2>Conferir</h2>
        ${r.trava.length ? `<div class="caixa" style="border-color:#e3a3a3"><h3 style="color:#b3261e">Arrume antes de baixar</h3>${r.trava.map(x => `<div>• ${esc(x.msg)}</div>`).join('')}</div>` : '<div class="caixa"><b style="color:var(--ok)">Tudo certo para baixar.</b></div>'}
        ${r.avisa.length ? `<div class="caixa"><h3 style="color:var(--aviso)">Avisos (não travam)</h3>${agruparAvisos(r.avisa).map(m => `<div class="sub" style="margin:2px 0">• ${esc(m)}</div>`).join('')}</div>` : ''}
        <div class="caixa"><h3>Data da oferta</h3>
          <div class="dupla"><div><label class="c">De</label><input type="date" id="ini" value="${e.validade?.ini || ''}"></div><div><label class="c">Até</label><input type="date" id="fim" value="${e.validade?.fim || ''}"></div></div>
          <p class="sub" style="margin:8px 0 0" id="vtxt">${esc(validadeTexto(e))}</p>
          <label class="c">Observação deste encarte (opcional, uma linha)</label><input type="text" id="obs" maxlength="70" value="${esc(e.obsPontual)}" placeholder="Ex.: Exceto feriado">
        </div>
        <div class="pe"><button class="btn" id="voltar">← Produtos</button><button class="btn pri" id="seguir" ${r.podeBaixar ? '' : 'disabled'}>Baixar →</button></div>
      </div>
      <div class="previas" id="prev"></div>
    </div>`;
  const re = () => { salvarRascunho(); passo3(raiz, ir); };
  $('#ini', raiz).onchange = ev => { e.validade.ini = ev.target.value; if (e.validade.fim < e.validade.ini) e.validade.fim = e.validade.ini; re(); };
  $('#fim', raiz).onchange = ev => { e.validade.fim = ev.target.value; re(); };
  $('#obs', raiz).onchange = ev => { e.obsPontual = ev.target.value.trim(); re(); };
  $('#voltar', raiz).onclick = () => ir(2);
  $('#seguir', raiz).onclick = () => ir(4);
  const pags = await montarPaginas('feed');
  const prev = $('#prev', raiz);
  prev.innerHTML = pags.map((p, i) => `<div style="margin-bottom:16px"><div class="linha"><small>${i ? 'Verso ' + i : 'Capa'} • ${p.produtos.length} produtos</small><span class="esp"></span><button class="btn" data-trava="${i}">${p.travada ? '🔒 Travada (destravar)' : '🔓 Travar esta página'}</button></div><canvas data-c="${i}"></canvas></div>`).join('');
  pags.forEach((p, i) => desenharPagina($(`[data-c="${i}"]`, prev).getContext('2d'), p));
  $$('[data-trava]', prev).forEach(b => b.onclick = () => {
    const i = +b.dataset.trava;
    if (pags[i].travada) destravar(e, i); else travar(e, m, i);
    re();
  });
}

// ---------------- 4. baixar ----------------
const nomeArquivo = (suf, ext) => {
  const m = modeloAtual(), d = estado.rascunho.validade.ini.slice(8, 10) + '-' + estado.rascunho.validade.ini.slice(5, 7);
  return `${m.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}_${d}_${suf}.${ext}`;
};

async function telasDe(formato, eco = false) {
  const pags = await montarPaginas(formato, eco);
  return pags.map(p => { const cv = document.createElement('canvas'); desenharPagina(cv.getContext('2d'), p); return cv; });
}
const blobDe = (cv, tipo = 'image/png', q) => new Promise(ok => cv.toBlob(ok, tipo, q));
function baixarBlob(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

async function pdfA4(eco) {
  const telas = await telasDe('a4', eco);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  telas.forEach((cv, i) => { if (i) doc.addPage(); doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
  return doc.output('blob');
}

function passo4(raiz) {
  raiz.innerHTML = `<h2>Baixar</h2><p class="sub">${esc(validadeTexto(estado.rascunho))} • ${estado.rascunho.produtos.length} produtos</p>
    <div class="grade">
      <button class="caixa btn" data-b="feed" style="text-align:left"><h3>WhatsApp e Instagram</h3>1080 × 1350, uma imagem por página</button>
      <button class="caixa btn" data-b="story" style="text-align:left"><h3>Story</h3>1080 × 1920, com a área segura do Instagram</button>
      <button class="caixa btn" data-b="a4" style="text-align:left"><h3>A4 para imprimir</h3>PDF com capa e verso</button>
      <button class="caixa btn" data-b="a4eco" style="text-align:left"><h3>A4 economia de tinta</h3>Fundo branco, gasta pouca tinta</button>
      <button class="caixa btn" data-b="zap" style="text-align:left"><h3>Compartilhar no WhatsApp</h3>Abre a tela de compartilhar do celular</button>
    </div>`;
  $$('[data-b]', raiz).forEach(b => b.onclick = async () => {
    const tipo = b.dataset.b;
    try {
      avisar('Gerando…');
      if (tipo === 'feed' || tipo === 'story') {
        const telas = await telasDe(tipo);
        for (let i = 0; i < telas.length; i++) baixarBlob(await blobDe(telas[i]), nomeArquivo(`${tipo}${telas.length > 1 ? '_' + (i + 1) : ''}`, 'png'));
      } else if (tipo === 'a4' || tipo === 'a4eco') {
        baixarBlob(await pdfA4(tipo === 'a4eco'), nomeArquivo(tipo === 'a4eco' ? 'a4_economia' : 'a4', 'pdf'));
      } else if (tipo === 'zap') {
        const telas = await telasDe('feed');
        const arqs = await Promise.all(telas.map(async (cv, i) => new File([await blobDe(cv, 'image/jpeg', 0.92)], nomeArquivo('feed_' + (i + 1), 'jpg'), { type: 'image/jpeg' })));
        if (navigator.canShare && navigator.canShare({ files: arqs })) await navigator.share({ files: arqs, text: validadeTexto(estado.rascunho) });
        else { arqs.forEach(f => baixarBlob(f, f.name)); avisar('Este aparelho não compartilha direto: baixei as imagens.', 4000); }
      }
      await salvarEncarte(estado.rascunho);
      avisar('Pronto');
    } catch (e) { if (e && e.name !== 'AbortError') avisar('Não consegui gerar: ' + e.message, 6000); }
  });
}

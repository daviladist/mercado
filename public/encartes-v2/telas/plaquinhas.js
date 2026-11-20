// PLAQUINHAS: do encarte em edição ou avulsas (digitando ou bipando o código de barras).
// Cada plaquinha: validade própria, perto de vencer, preço por kg/L (sim/não), observação.
// Ao gerar o PDF, entra no registro das impressas: é ele que avisa quando venceu e confere com o sistema.
import { $, $$, esc, avisar } from './comum.js';
import { estado, imagensDasLogos, salvarRascunho, salvarAvulsas, salvarRegistro } from '../estado.js';
import { lerLista } from '../lista.js';
import { carregarBanco, banco, procurarPorNome, ligar, variacoesEan } from '../banco.js';
import { enderecoImagem, carregarImagem } from '../nuvem.js';
import { TAMANHOS, tamanho, precoPorMedida, registrar, vencidas, vencemHoje, conferirGondola } from '../plaquinhas-dados.js';
import { desenharFolha, porFolha } from '../arte/plaquinha.js';

let origem = 'encarte', tamId = 'a5';
const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const reais = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',');
const lerReais = s => { const n = Number(String(s).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; };
const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

const modeloDoEncarte = () => estado.rascunho && estado.campanhas.find(c => c.id === estado.rascunho.modeloId);
function lista() {
  if (origem === 'avulsas') return estado.avulsas;
  return estado.rascunho ? estado.rascunho.produtos : [];
}
// campos da plaquinha ficam no próprio produto (p.plaq), com o padrão do encarte
function plaq(p) {
  if (!p.plaq) {
    const pk = precoPorMedida(p);
    p.plaq = { validade: (origem === 'encarte' && estado.rascunho?.validade?.fim) || hojeIso(), pertoVencer: '', mostrarPrecoKg: !!pk, obs: '', imprimir: true };
  }
  return p.plaq;
}
const salvar = () => (origem === 'encarte' ? salvarRascunho() : salvarAvulsas());

export async function mostrar(raiz) {
  if (!banco().carregado) await carregarBanco();
  const itens = lista(), venc = vencidas(estado.registro), hoje = vencemHoje(estado.registro);
  const difs = conferirGondola(estado.registro, r => precoDoSistema(r));
  raiz.innerHTML = `
    <div class="linha"><div><h2>Plaquinhas</h2><p class="sub">Escolha de onde vêm, confira cada uma e gere o PDF para imprimir.</p></div></div>
    ${venc.length || hoje.length ? `<div class="caixa" style="border-color:#e3a3a3"><h3 style="color:#b3261e">Tire da gôndola</h3>
      ${[...venc.map(r => [r, 'venceu ' + dm(r.validade)]), ...hoje.map(r => [r, 'vence hoje'])].map(([r, q]) => `<div class="linha" style="justify-content:space-between;border-top:1px solid var(--linha);padding:6px 0"><span><b>${esc(r.nome)}</b> — R$ ${reais(r.precoApp ?? r.preco)} • ${q}</span><button class="btn" data-ret="${esc(r.id)}">Já tirei</button></div>`).join('')}</div>` : ''}
    ${difs.length ? `<div class="caixa"><h3 style="color:var(--aviso)">Gôndola × sistema: preço diferente</h3>
      ${difs.map(r => `<div class="sub" style="margin:2px 0">• <b>${esc(r.nome)}</b>: plaquinha R$ ${reais(r.precoPlaca)}, caixa cobra R$ ${reais(r.precoSistema)}</div>`).join('')}</div>` : ''}
    <div class="dias"><button data-o="encarte" class="${origem === 'encarte' ? 'on' : ''}">Do encarte${estado.rascunho ? ` (${estado.rascunho.produtos.length})` : ''}</button><button data-o="avulsas" class="${origem === 'avulsas' ? 'on' : ''}">Avulsas (${estado.avulsas.length})</button></div>
    ${origem === 'avulsas' ? `<div class="caixa"><h3>Adicionar avulsa</h3>
      <textarea id="txt" rows="3" style="width:100%;padding:10px;border:1px solid var(--linha);border-radius:8px;font:inherit" placeholder="Nome  preço  (preço com app)"></textarea>
      <div class="linha" style="margin-top:8px"><button class="btn pri" id="add">Adicionar</button><button class="btn esc" id="cam">📷 Bipar código de barras</button></div></div>` : ''}
    <div class="caixa"><div class="linha"><h3 style="margin:0">${itens.length} plaquinhas</h3><span class="esp"></span>
      <select id="tam" style="width:auto">${TAMANHOS.map(t => `<option value="${t.id}" ${t.id === tamId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
      <button class="btn pri" id="pdf" ${itens.some(p => plaq(p).imprimir) ? '' : 'disabled'}>Gerar PDF</button></div>
      ${!itens.length ? `<p class="sub">${origem === 'encarte' ? 'Nenhum encarte em edição. Monte um em "Fazer encarte" ou use avulsas.' : 'Nenhuma avulsa ainda.'}</p>` : ''}
      ${itens.map(linha).join('')}
    </div>`;

  $$('[data-o]', raiz).forEach(b => b.onclick = () => { origem = b.dataset.o; mostrar(raiz); });
  $('#tam', raiz).onchange = e => { tamId = e.target.value; };
  $$('[data-ret]', raiz).forEach(b => b.onclick = async () => {
    await salvarRegistro(L => L.map(r => (r.id === b.dataset.ret ? { ...r, retirada: true } : r)));
    mostrar(raiz);
  });
  const add = $('#add', raiz);
  if (add) add.onclick = () => {
    const { produtos, semPreco } = lerLista($('#txt', raiz).value);
    for (const p of produtos) estado.avulsas.push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...p, banco: ligar(procurarPorNome(p.nome).item) });
    salvarAvulsas();
    if (semPreco.length) avisar('Sem preço: ' + semPreco.join(', '), 5000);
    mostrar(raiz);
  };
  const cam = $('#cam', raiz);
  if (cam) cam.onclick = () => bipar(() => mostrar(raiz));
  $$('[data-k]', raiz).forEach(i => i.onchange = () => {
    const p = lista().find(x => x.id === i.closest('[data-id]').dataset.id), q = plaq(p), k = i.dataset.k;
    if (k === 'imprimir' || k === 'mostrarPrecoKg') q[k] = i.checked;
    else if (k === 'perto') q.pertoVencer = i.checked ? (q.pertoVencer || hojeIso()) : '';
    else if (k === 'preco' || k === 'precoApp') p[k] = lerReais(i.value) ?? (k === 'preco' ? p.preco : null);
    else q[k] = i.value.trim();
    salvar();
    mostrar(raiz);
  });
  $$('[data-tira]', raiz).forEach(b => b.onclick = () => { estado.avulsas = estado.avulsas.filter(x => x.id !== b.dataset.tira); salvarAvulsas(); mostrar(raiz); });
  $('#pdf', raiz).onclick = () => gerarPdf(raiz);
}

function linha(p) {
  const q = plaq(p), pk = precoPorMedida(p);
  return `<div data-id="${esc(p.id)}" style="border-top:1px solid var(--linha);padding:8px 0">
    <div class="linha" style="gap:8px"><label class="chk" style="margin:0"><input type="checkbox" data-k="imprimir" ${q.imprimir ? 'checked' : ''}></label><b style="flex:1">${esc(p.nome)}</b>
      ${origem === 'avulsas' ? `<input type="text" data-k="preco" value="${reais(p.preco)}" style="width:80px;padding:6px"><input type="text" data-k="precoApp" value="${reais(p.precoApp)}" placeholder="app" style="width:70px;padding:6px"><button class="btn" data-tira="${esc(p.id)}">✕</button>` : `<span class="sub" style="margin:0">R$ ${reais(p.precoApp ?? p.preco)}</span>`}</div>
    <div class="linha" style="gap:10px;margin-top:6px">
      <label class="sub" style="margin:0">Validade da oferta <input type="date" data-k="validade" value="${q.validade}" style="width:auto;padding:5px"></label>
      <label class="chk" style="margin:0"><input type="checkbox" data-k="perto" ${q.pertoVencer ? 'checked' : ''}> Perto de vencer</label>
      ${q.pertoVencer ? `<input type="date" data-k="pertoVencer" value="${q.pertoVencer}" style="width:auto;padding:5px">` : ''}
      ${pk ? `<label class="chk" style="margin:0"><input type="checkbox" data-k="mostrarPrecoKg" ${q.mostrarPrecoKg ? 'checked' : ''}> Mostrar R$ ${reais(pk.valor)} o ${pk.base}</label>` : ''}
      <input type="text" data-k="obs" value="${esc(q.obs)}" maxlength="60" placeholder="Observação (opcional)" style="width:220px;padding:6px">
    </div></div>`;
}

function precoDoSistema(r) {
  const it = banco().itens.find(x => (r.codigo && x.c === r.codigo) || (r.ean && variacoesEan(x.e).includes(r.ean)));
  return it && it.pv != null ? it.pv : null;
}

async function gerarPdf(raiz) {
  try {
    avisar('Gerando as plaquinhas…');
    const tam = tamanho(tamId), modelo = origem === 'encarte' ? modeloDoEncarte() : null;
    const itens = lista().filter(p => plaq(p).imprimir);
    const logos = await imagensDasLogos();
    const prontos = await Promise.all(itens.map(async p => {
      const q = plaq(p), src = p.fotoId ? enderecoImagem(p.fotoId) : p.banco?.fotoBanco ? enderecoImagem(p.banco.fotoBanco) : null;
      return { ...p, foto: src ? await carregarImagem(src).catch(() => null) : null, codigo: p.banco?.codigo || '', validade: q.validade, pertoVencer: q.pertoVencer, obs: q.obs, mostrarPrecoKg: q.mostrarPrecoKg, precoKg: precoPorMedida(p) };
    }));
    const o = { cores: modelo ? modelo.cores : { cabecalho: '#16161a', destaque: '#ffd21f' }, logos, titulo: modelo ? modelo.nome : 'Oferta', impressaEm: hojeIso() };
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: tam.folha, orientation: tam.deitada ? 'landscape' : 'portrait' });
    const n = porFolha(tam), cv = document.createElement('canvas');
    for (let i = 0; i < prontos.length; i += n) {
      if (i) doc.addPage();
      desenharFolha(cv.getContext('2d'), tam, prontos.slice(i, i + n), o, 8);
      doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, tam.pw, tam.ph);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(doc.output('blob'));
    a.download = `plaquinhas_${(modelo ? modelo.nome : 'avulsas').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}_${hojeIso()}.pdf`;
    a.click();
    await salvarRegistro(L => registrar(L, prontos.map(p => ({ ...p, banco: { codigo: p.codigo, ean: p.banco?.ean } }))));
    avisar(`${prontos.length} plaquinhas geradas e registradas`);
    mostrar(raiz);
  } catch (e) { avisar('Não consegui gerar: ' + e.message, 6000); }
}

// Bipar: câmera lê o código de barras; o app procura no banco e pede só o preço.
async function bipar(pronto) {
  if (!window.ZXing) { avisar('Leitor de código não carregou.'); return; }
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:60';
  fundo.innerHTML = `<div class="caixa" style="max-width:460px;width:94%"><h3>Aponte para o código de barras</h3>
    <video id="vid" playsinline muted style="width:100%;border-radius:10px;background:#000"></video>
    <div id="res" style="margin-top:8px"></div>
    <div class="linha" style="margin-top:8px"><input type="text" id="cod" inputmode="numeric" placeholder="ou digite o código" style="flex:1"><button class="btn" id="ok">Buscar</button><button class="btn" id="fecha">Fechar</button></div></div>`;
  document.body.appendChild(fundo);
  const leitor = new window.ZXing.BrowserMultiFormatReader();
  const fechar = () => { try { leitor.reset(); } catch (_) { /* nada */ } fundo.remove(); pronto(); };
  fundo.querySelector('#fecha').onclick = fechar;
  const achou = codigo => {
    try { leitor.reset(); } catch (_) { /* nada */ }
    const vs = variacoesEan(codigo);
    const it = banco().itens.find(x => x.c === codigo || variacoesEan(x.e).some(v => vs.includes(v)));
    fundo.querySelector('#res').innerHTML = `<p><b>${esc(it ? it.d : 'Não está no banco')}</b> <small>${esc(codigo)}</small></p>
      ${it ? '' : '<input type="text" id="nome" placeholder="Nome do produto">'}
      <div class="linha" style="margin-top:6px"><input type="text" id="preco" inputmode="decimal" placeholder="Preço" style="width:110px"><input type="text" id="app" inputmode="decimal" placeholder="Com app" style="width:110px"><button class="btn pri" id="adc">Adicionar</button></div>`;
    fundo.querySelector('#preco').focus();
    fundo.querySelector('#adc').onclick = () => {
      const preco = lerReais(fundo.querySelector('#preco').value), app = lerReais(fundo.querySelector('#app').value);
      const nome = it ? it.d.charAt(0) + it.d.slice(1).toLowerCase() : (fundo.querySelector('#nome').value || '').trim();
      if (!preco || !nome) { avisar('Coloque o nome e o preço'); return; }
      estado.avulsas.push({ id: 'a' + Date.now().toString(36), nome, preco: app && app < preco ? preco : preco, precoApp: app && app < preco ? app : null, unidade: 'un', banco: it ? ligar(it) : { codigo: '', ean: codigo } });
      salvarAvulsas();
      avisar(nome + ' adicionado');
      fechar();
    };
  };
  fundo.querySelector('#ok').onclick = () => { const v = fundo.querySelector('#cod').value.replace(/\D/g, ''); if (v) achou(v); };
  try { leitor.decodeFromVideoDevice(null, fundo.querySelector('#vid'), r => { if (r) achou(r.getText()); }); }
  catch (_) { fundo.querySelector('#res').innerHTML = '<p class="sub">Câmera indisponível. Digite o código.</p>'; }
}

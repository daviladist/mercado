// Tela de Campanhas (dono): filtro por dia, lista, e o cadastro com prévia ao vivo.
import { $, $$, esc, avisar, escolherArquivo } from './comum.js';
import { estado, salvarCampanhas, imagensDasLogos, montarRodape } from '../estado.js';
import { DIAS_CURTOS, TODOS, ESTILOS, novaCampanha, campanhasDoDia, oQueFalta, textoDias, validadePadrao, textoValidade, duplicarCampanha } from '../campanhas.js';
const garantir = c => Object.assign({ pausado: false, maxDestaques: 3 }, c);
import { PALETAS, CAMPOS_COR } from '../cores.js';
import { subirImagem, enderecoImagem, carregarImagem, arquivoParaDataURL } from '../nuvem.js';
import { desenharPagina } from '../arte/encarte.js';
import { paginar } from '../arte/diagrama.js';
import { produtosDemo } from '../demo.js';

const ORDEM = [1, 2, 3, 4, 5, 6, 0];         // a semana começa na segunda
let filtro = new Date().getDay();

export async function mostrar(raiz) {
  const lista = campanhasDoDia(estado.campanhas, filtro);
  const hoje = new Date().getDay();
  raiz.innerHTML = `
    <div class="linha"><div><h2>Modelos</h2><p class="sub">O molde de cada encarte. A equipe só vê os modelos liberados, no dia marcado.</p></div>
      <span class="esp"></span><button class="btn pri" id="nova">+ Novo modelo</button></div>
    <div class="dias" id="filtro">
      <button data-d="" class="${filtro == null ? 'on' : ''}">Todas</button>
      ${ORDEM.map(d => `<button data-d="${d}" class="${filtro === d ? 'on' : ''} ${d === hoje ? 'hoje' : ''}">${DIAS_CURTOS[d]}</button>`).join('')}
    </div>
    ${lista.length ? `<div class="grade">${lista.map(cartao).join('')}</div>` : vazio()}`;
  $$('#filtro button', raiz).forEach(b => b.onclick = () => { filtro = b.dataset.d === '' ? null : +b.dataset.d; mostrar(raiz); });
  $('#nova', raiz).onclick = () => editar(raiz, novaCampanha(), true);
  $$('.camp', raiz).forEach(el => el.onclick = () => {
    const c = estado.campanhas.find(x => x.id === el.dataset.id);
    if (c) editar(raiz, garantir(structuredClone(c)), false);
  });
}

function cartao(c) {
  const falta = oQueFalta(c), src = enderecoImagem(c.cabecalho);
  return `<div class="camp" data-id="${esc(c.id)}">
    <div class="cab" style="${src ? `background-image:url('${esc(src)}')` : ''}">${src ? '' : 'sem cabeçalho'}</div>
    <div class="info"><div class="nome">${esc(c.nome || 'Sem nome')}</div><div class="dd">${esc(textoDias(c))} • ${esc(ESTILOS[c.estilo] || '')}</div>
    ${c.pausado ? '<span class="pill falta">Pausado</span>' : falta.length ? `<span class="pill falta">Falta: ${esc(falta.join(', '))}</span>` : '<span class="pill ok">Liberado para a equipe</span>'}</div></div>`;
}

function vazio() {
  const dia = filtro == null ? '' : ` para ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][filtro]}`;
  return `<div class="vazio"><b>Nenhum modelo${dia}.</b>Toque em "+ Novo modelo" para cadastrar. Sem modelo cadastrado, a equipe não consegue montar encarte.</div>`;
}

// ---------------- cadastro ----------------
function editar(raiz, c, nova) {
  raiz.innerHTML = `
    <div class="linha"><button class="btn" id="voltar">‹ Modelos</button><h2 style="margin-left:6px">${nova ? 'Novo modelo' : esc(c.nome)}</h2></div>
    <div class="editor">
      <div>
        <div class="caixa"><h3>1. Nome e dias</h3>
          <label class="c">Nome do modelo</label><input type="text" id="nome" value="${esc(c.nome)}" placeholder="Ex.: Sábado Imbatível">
          <label class="c">Em que dias a equipe pode usar?</label>
          <div class="marcar" id="dias">
            ${ORDEM.map(d => `<label><input type="checkbox" value="${d}" ${c.dias.includes(d) ? 'checked' : ''}>${DIAS_CURTOS[d]}</label>`).join('')}
            <label class="todos"><input type="checkbox" value="${TODOS}" ${c.dias.includes(TODOS) ? 'checked' : ''}>Todos os dias</label>
          </div>
        </div>
        <div class="caixa"><h3>2. Cabeçalho (do Photoshop)</h3>
          <div class="cabUp" id="cab">Toque para importar o cabeçalho<br>2160 × 800 px, JPG ou PNG</div>
          <div id="cabAviso"></div>
          <label class="c">Logos por cima do cabeçalho</label>
          <div class="seg" id="logosLado"><button data-v="1">Lado a lado</button><button data-v="0">Uma em cima da outra</button></div>
        </div>
        <div class="caixa"><h3>3. Visual</h3>
          <label class="c">Estilo dos produtos</label>
          <div class="seg" id="estilo">${Object.entries(ESTILOS).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>
          <label class="c">Cores</label>
          <div class="paletas" id="paletas">${Object.entries(PALETAS).map(([k, p]) => `<button data-p="${k}" title="${esc(p.nome)}"><i style="background:${p.fundo}"></i><i style="background:${p.cartaoDestaque}"></i><i style="background:${p.cartaoNormal}"></i><i style="background:${p.pilula}"></i></button>`).join('')}</div>
          <div class="cores" id="cores">${CAMPOS_COR.map(([k, n]) => `<label><input type="color" data-k="${k}" value="${c.cores[k] || '#000000'}">${n}</label>`).join('')}</div>
          <label class="chk"><input type="checkbox" id="fogo" ${c.fogo ? 'checked' : ''}> Fundo com fogo (dia D)</label>
        </div>
        <div class="caixa"><h3>4. Produtos por página</h3>
          <div class="dupla"><div><label class="c">Na capa</label><input type="number" id="capa" min="1" max="30" value="${c.porPagina.capa}"></div>
          <div><label class="c">No verso</label><input type="number" id="verso" min="1" max="40" value="${c.porPagina.verso}"></div></div>
          <label class="c">Máximo de destaques que a equipe pode marcar</label><input type="number" id="maxDest" min="0" max="6" value="${c.maxDestaques}">
          <label class="chk"><input type="checkbox" id="versoFino" ${c.versoFino ? 'checked' : ''}> Verso com faixa fininha (cabe mais produto)</label>
        </div>
        <label class="chk" style="margin:0 0 6px"><input type="checkbox" id="pausado" ${c.pausado ? 'checked' : ''}> Pausar este modelo (some para a equipe, sem apagar)</label>
        <div class="pe"><button class="btn pri" id="salvar">Salvar modelo</button>${nova ? '' : '<button class="btn" id="duplicar">Duplicar</button><button class="btn" id="apagar">Apagar</button>'}<span id="falta" class="sub" style="margin:0;align-self:center"></span></div>
      </div>
      <div class="previas"><div class="duas">
        <div><small>Capa (com produtos de exemplo)</small><canvas id="pCapa"></canvas></div>
        <div><small>Verso</small><canvas id="pVerso"></canvas></div>
      </div></div>
    </div>`;

  const seg = (id, valor, aoMudar) => {
    const marcar = v => $$(`#${id} button`, raiz).forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
    marcar(valor);
    $$(`#${id} button`, raiz).forEach(b => b.onclick = () => { aoMudar(b.dataset.v); marcar(b.dataset.v); atualizar(); });
  };
  seg('logosLado', c.logosLado ? 1 : 0, v => { c.logosLado = v === '1'; });
  seg('estilo', c.estilo, v => { c.estilo = v; });

  const mostrarCab = () => {
    const src = enderecoImagem(c.cabecalho), el = $('#cab', raiz);
    el.classList.toggle('tem', !!src);
    el.style.backgroundImage = src ? `url('${src}')` : '';
  };
  mostrarCab();

  $('#nome', raiz).oninput = e => { c.nome = e.target.value; atualizar(); };
  $$('#dias input', raiz).forEach(i => i.onchange = () => {
    if (i.value === TODOS && i.checked) $$('#dias input', raiz).forEach(o => { if (o !== i) o.checked = false; });
    if (i.value !== TODOS && i.checked) $(`#dias input[value="${TODOS}"]`, raiz).checked = false;
    c.dias = $$('#dias input:checked', raiz).map(o => (o.value === TODOS ? TODOS : +o.value));
    atualizar();
  });
  $('#cab', raiz).onclick = async () => {
    const f = await escolherArquivo('image/png,image/jpeg,image/webp');
    if (!f) return;
    try {
      avisar('Subindo o cabeçalho…');
      const { dataURL, w, h } = await arquivoParaDataURL(f, 2160);
      c.cabecalho = await subirImagem(dataURL);
      const prop = w / h;
      $('#cabAviso', raiz).innerHTML = Math.abs(prop - 2.7) > 0.35 ? `<div class="aviso">Esta imagem tem ${w} × ${h} px. O modelo é 2160 × 800: com outro formato o cabeçalho fica ${prop < 2.7 ? 'mais alto (sobra menos espaço para produto)' : 'mais baixo'}.</div>` : '';
      mostrarCab();
      avisar('Cabeçalho salvo na campanha');
      atualizar();
    } catch (e) { avisar('Não consegui usar essa imagem: ' + e.message, 5000); }
  };
  $$('#paletas button', raiz).forEach(b => b.onclick = () => {
    const p = PALETAS[b.dataset.p];
    Object.assign(c.cores, p);
    delete c.cores.nome;
    $$('#cores input', raiz).forEach(i => { i.value = c.cores[i.dataset.k]; });
    $$('#paletas button', raiz).forEach(x => x.classList.toggle('on', x === b));
    atualizar();
  });
  $$('#cores input', raiz).forEach(i => i.oninput = () => { c.cores[i.dataset.k] = i.value; $$('#paletas button', raiz).forEach(x => x.classList.remove('on')); atualizar(); });
  $('#fogo', raiz).onchange = e => { c.fogo = e.target.checked; atualizar(); };
  $('#maxDest', raiz).oninput = e => { c.maxDestaques = Math.max(0, Math.min(6, +e.target.value || 0)); atualizar(); };
  $('#pausado', raiz).onchange = e => { c.pausado = e.target.checked; };
  $('#versoFino', raiz).onchange = e => { c.versoFino = e.target.checked; atualizar(); };
  $('#capa', raiz).oninput = e => { c.porPagina.capa = Math.max(1, +e.target.value || 1); atualizar(); };
  $('#verso', raiz).oninput = e => { c.porPagina.verso = Math.max(1, +e.target.value || 1); atualizar(); };

  $('#voltar', raiz).onclick = () => mostrar(raiz);
  $('#salvar', raiz).onclick = async () => {
    c.nome = c.nome.trim();
    const i = estado.campanhas.findIndex(x => x.id === c.id);
    if (i >= 0) estado.campanhas[i] = c; else estado.campanhas.push(c);
    try {
      await salvarCampanhas();
      const falta = oQueFalta(c);
      avisar(c.pausado ? 'Modelo salvo e pausado' : falta.length ? `Salvo, mas ainda não liberado. Falta: ${falta.join(', ')}` : 'Modelo salvo e liberado para a equipe', 4000);
      mostrar(raiz);
    } catch (e) { avisar('Não consegui salvar: ' + e.message, 6000); }
  };
  const dup = $('#duplicar', raiz);
  if (dup) dup.onclick = () => { editar(raiz, duplicarCampanha(c), true); avisar('Cópia criada. Mude o que quiser e salve.'); };
  const ap = $('#apagar', raiz);
  if (ap) ap.onclick = async () => {
    if (!confirm(`Apagar o modelo "${c.nome}"? A equipe deixa de ver. Se for voltar a usar, prefira Pausar.`)) return;
    estado.campanhas = estado.campanhas.filter(x => x.id !== c.id);
    await salvarCampanhas();
    avisar('Modelo apagado');
    mostrar(raiz);
  };

  function mostrarCoresDoEstilo() {
    $$('#cores input', raiz).forEach(i => {
      const k = i.dataset.k, esconde = (k === 'pilula' && c.estilo !== 'quadros') || ((k === 'etiqueta') && c.estilo === 'quadros') || (k === 'cartaoNormal' && c.estilo !== 'quadros');
      i.parentElement.hidden = esconde;
    });
  }
  let vez = 0;
  async function atualizar() {
    const minha = ++vez;
    const falta = oQueFalta(c);
    $('#falta', raiz).textContent = falta.length ? 'Para liberar falta: ' + falta.join(', ') : 'Pronto para a equipe';
    mostrarCoresDoEstilo();
    const [logos, demo, cab, rodape] = await Promise.all([imagensDasLogos(), produtosDemo(), carregarImagem(enderecoImagem(c.cabecalho)).catch(() => null), montarRodape(textoValidade(validadePadrao(c)))]);
    if (minha !== vez) return;
    const tema = { ...c, cabecalho: cab };
    const amostra = demo.map((p, i) => ({ ...p, destaque: i < Math.min(3, c.maxDestaques) }));
    const pags = paginar([...amostra, ...demo.slice(3).map(p => ({ ...p, destaque: false }))], c.porPagina.capa, c.porPagina.verso);
    desenharPagina($('#pCapa', raiz).getContext('2d'), { formato: 'feed', tema, logos, produtos: pags[0], rodape });
    desenharPagina($('#pVerso', raiz).getContext('2d'), { formato: 'feed', tema, logos, produtos: pags[1] || pags[0], verso: true, rodape });
  }
  atualizar();
}

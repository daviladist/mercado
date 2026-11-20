// Dados da loja: rodapé, QR do app e as frases que a equipe pode usar. Valem para todos os encartes.
import { $, $$, esc, avisar, escolherArquivo } from './comum.js';
import { estado, salvarLoja } from '../estado.js';
import { subirImagem, enderecoImagem, arquivoParaDataURL } from '../nuvem.js';

export async function mostrar(raiz) {
  const L = estado.loja;
  const campo = (k, rot, ph = '') => `<label class="c">${rot}</label><input type="text" data-k="${k}" value="${esc(L[k])}" placeholder="${esc(ph)}">`;
  raiz.innerHTML = `
    <h2>Dados da loja</h2><p class="sub">Aparecem no rodapé de todos os encartes. Só você mexe aqui.</p>
    <div class="editor" style="grid-template-columns:1fr 1fr">
      <div class="caixa"><h3>Rodapé</h3>
        ${campo('lojas', 'Nomes das lojas', 'Joatuba e Itarana')}
        ${campo('whatsapp', 'WhatsApp', '(27) 99999-9999')}
        ${campo('endereco', 'Endereço', 'Rua…, Joatuba')}
        ${campo('observacao', 'Observação fixa', 'Enquanto durarem os estoques. Imagens ilustrativas.')}
        <label class="c">Faixa de bandeiras de cartão (imagem)</label>
        <div class="cabUp ${L.bandeiras ? 'tem' : ''}" id="band" style="aspect-ratio:5;background-size:contain;${L.bandeiras ? `background-image:url('${esc(enderecoImagem(L.bandeiras))}')` : ''}">Toque para subir a imagem das bandeiras</div>
      </div>
      <div>
        <div class="caixa"><h3>QR code: baixar o app</h3>
          ${campo('linkApp', 'Link para baixar o app da loja', 'https://…')}
          <p class="sub" style="margin-top:8px">Com o link preenchido, o QR aparece no rodapé com "BAIXE O APP". Sem link, não aparece.</p>
        </div>
        <div class="caixa"><h3>Frases que a equipe pode usar</h3>
          <p class="sub">Uma por linha. O funcionário só escolhe desta lista.</p>
          <textarea id="frases" rows="6" style="width:100%;padding:10px;border:1px solid var(--linha);border-radius:8px;font:inherit">${esc(L.frases.join('\n'))}</textarea>
        </div>
      </div>
    </div>
    <div class="pe"><button class="btn pri" id="salvar">Salvar dados da loja</button></div>`;
  $$('[data-k]', raiz).forEach(i => i.oninput = () => { L[i.dataset.k] = i.value.trim(); });
  $('#frases', raiz).oninput = e => { L.frases = e.target.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20); };
  $('#band', raiz).onclick = async () => {
    const f = await escolherArquivo('image/png,image/jpeg,image/webp');
    if (!f) return;
    try { const { dataURL } = await arquivoParaDataURL(f, 1600); L.bandeiras = await subirImagem(dataURL); await salvarLoja(); mostrar(raiz); avisar('Bandeiras salvas'); }
    catch (e) { avisar('Não consegui usar essa imagem: ' + e.message, 5000); }
  };
  $('#salvar', raiz).onclick = async () => {
    try { await salvarLoja(); avisar('Dados da loja salvos'); } catch (e) { avisar('Não consegui salvar: ' + e.message, 6000); }
  };
}

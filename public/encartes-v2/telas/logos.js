// Logos da loja: cadastradas uma vez, valem para todas as campanhas (uma ou duas).
import { $, $$, esc, avisar, escolherArquivo } from './comum.js';
import { estado, salvarLogos } from '../estado.js';
import { subirImagem, enderecoImagem, arquivoParaDataURL } from '../nuvem.js';

export async function mostrar(raiz) {
  const L = estado.logos;
  raiz.innerHTML = `
    <h2>Logos</h2><p class="sub">Cadastre uma ou duas logos. O app coloca por cima do cabeçalho de todas as campanhas, no canto esquerdo.${L.length ? '' : ' Enquanto não cadastrar, o app usa as logos D\'Ávila e RedeShow que já vieram com ele.'}</p>
    <div class="grade">${[0, 1].map(i => `<div class="caixa"><h3>Logo ${i + 1}${i ? ' (opcional)' : ''}</h3>
      <div class="cabUp ${L[i] ? 'tem' : ''}" data-i="${i}" style="aspect-ratio:1.6;background-size:contain;background-color:#3b404c;${L[i] ? `background-image:url('${esc(enderecoImagem(L[i]))}')` : ''}">Toque para escolher<br>PNG com fundo transparente</div>
      ${L[i] ? `<button class="btn" data-tirar="${i}" style="margin-top:8px">Tirar esta logo</button>` : ''}</div>`).join('')}</div>`;
  $$('.cabUp', raiz).forEach(el => el.onclick = async () => {
    const f = await escolherArquivo('image/png,image/webp,image/jpeg');
    if (!f) return;
    try {
      const { dataURL } = await arquivoParaDataURL(f, 1200);
      const id = await subirImagem(dataURL);
      const i = Math.min(+el.dataset.i, estado.logos.length);
      estado.logos[i] = id;
      await salvarLogos();
      avisar('Logo salva');
      mostrar(raiz);
    } catch (e) { avisar('Não consegui usar essa imagem: ' + e.message, 5000); }
  });
  $$('[data-tirar]', raiz).forEach(b => b.onclick = async () => {
    estado.logos.splice(+b.dataset.tirar, 1);
    await salvarLogos();
    mostrar(raiz);
  });
}

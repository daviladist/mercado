// Cabeçalho: SEMPRE a imagem do Photoshop da campanha (decisão do Eduardo, 20/11).
// As logos NÃO vão no Photoshop: o app coloca as logos cadastradas (uma ou duas) por cima,
// no canto esquerdo, lado a lado ou uma em cima da outra (escolha da campanha).
// O modelo de cabeçalho para baixar marca exatamente esta zona (ZONA_LOGOS).

// zona das logos, em fração do cabeçalho
export const ZONA_LOGOS = { x: 0.025, y: 0.08, w: 0.305, h: 0.84 };
import { imagemContida, FONTE, fonte, tom, textoSobre } from './util.js';

// Altura do cabeçalho: a da própria imagem (ela é feita na largura do encarte), no máximo 38% da arte.
export function alturaCabecalho(img, W, H) {
  if (!img || !img.width) return Math.round(W * 0.26);
  return Math.round(Math.min(H * 0.32, (W * img.height) / img.width));
}

// cab: { imagem, logos: [img, img], logosLado: true|false }
export function desenharCabecalho(c, W, H, cab, cores) {
  c.save();
  if (cab.imagem) {
    // a imagem entra inteira na largura, presa no topo: nunca corta logo nem título
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    c.drawImage(cab.imagem, 0, 0, W, (W * cab.imagem.height) / cab.imagem.width);
    c.restore();
  } else {
    c.fillStyle = cores.cabecalho || '#c8161d';
    c.fillRect(0, 0, W, H);
  }
  // canto esquerdo livre: até 30% da largura
  const Z = ZONA_LOGOS;
  logos(c, cab.logos, { x: W * Z.x, y: H * Z.y, w: W * Z.w, h: H * Z.h }, cab.logosLado !== false);
  // sombra caindo no fundo, separa o cabeçalho dos produtos
  const g = c.createLinearGradient(0, H, 0, H + H * 0.1);
  g.addColorStop(0, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, H, W, H * 0.1);
  c.restore();
}

function logos(c, imgs, a, lado) {
  imgs = (imgs || []).filter(Boolean);
  if (!imgs.length) return;
  const n = imgs.length, gap = (lado ? a.w : a.h) * 0.06;
  imgs.forEach((img, i) => {
    const bw = lado ? (a.w - gap * (n - 1)) / n : a.w;
    const bh = lado ? a.h : (a.h - gap * (n - 1)) / n;
    const bx = lado ? a.x + i * (bw + gap) : a.x;
    const by = lado ? a.y : a.y + i * (bh + gap);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = Math.min(bw, bh) * 0.07;
    c.shadowOffsetY = Math.min(bw, bh) * 0.025;
    imagemContida(c, img, bx, by, bw, bh);
    c.restore();
  });
}

// Verso: faixa fininha com o nome da campanha em letras, para sobrar espaço para os produtos.
// As logos vão pequenas no canto esquerdo.
export function desenharFaixaFina(c, W, H, nome, logosImgs, cores) {
  const base = cores.cabecalho || cores.etiqueta;
  c.save();
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tom(base, 0.1));
  g.addColorStop(1, tom(base, -0.15));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = cores.destaque || '#ffd21f';
  c.fillRect(0, H - Math.max(3, H * 0.06), W, Math.max(3, H * 0.06));
  logos(c, logosImgs, { x: W * 0.02, y: H * 0.1, w: W * 0.26, h: H * 0.76 }, true);
  const txt = String(nome || '').toUpperCase();
  let t = H * 0.62;
  c.font = fonte(400, t, FONTE.numero);
  const max = W * 0.66, lw = c.measureText(txt).width;
  if (lw > max) { t *= max / lw; c.font = fonte(400, t, FONTE.numero); }
  c.fillStyle = textoSobre(base);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(txt, W * 0.64, H * 0.5);
  c.restore();
}

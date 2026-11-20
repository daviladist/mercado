// Cabeçalho: SEMPRE a imagem do Photoshop do tema (decisão do Eduardo, 20/11).
// O app só coloca as logos no canto esquerdo, lado a lado ou uma em cima da outra (escolha do tema).
import { imagemContida } from './util.js';

// Altura do cabeçalho: a da própria imagem (ela é feita na largura do encarte), no máximo 38% da arte.
export function alturaCabecalho(img, W, H) {
  if (!img || !img.width) return Math.round(W * 0.26);
  return Math.round(Math.min(H * 0.25, (W * img.height) / img.width));
}

// cab: { imagem, logos: [img, img], logosLado: true|false }
export function desenharCabecalho(c, W, H, cab, cores) {
  c.save();
  if (cab.imagem) {
    const k = Math.max(W / cab.imagem.width, H / cab.imagem.height);
    const dw = cab.imagem.width * k, dh = cab.imagem.height * k;
    c.drawImage(cab.imagem, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    c.fillStyle = cores.cabecalho || '#c8161d';
    c.fillRect(0, 0, W, H);
  }
  // canto esquerdo livre: até 30% da largura
  const lado = cab.logosLado !== false;
  const area = lado ? { x: W * 0.03, y: H * 0.14, w: W * 0.36, h: H * 0.72 } : { x: W * 0.04, y: H * 0.06, w: W * 0.24, h: H * 0.88 };
  logos(c, cab.logos, area, lado);
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

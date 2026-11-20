// Cabeçalho: logos à esquerda (canto livre), título da campanha, faixa de chamada
// e, se houver, foto de pessoas à direita. Ou um cabeçalho pronto em imagem (Photoshop).
import { FONTE, fonte, caminhoArredondado, encaixarTexto, tom, textoSobre, imagemContida } from './util.js';

// cab: { titulo, chamada, foto (imagem de pessoas), imagemPronta, logos:[img...], logosLado: true }
export function desenharCabecalho(c, W, H, cab, cores) {
  c.save();
  if (cab.imagemPronta) {
    capa(c, cab.imagemPronta, 0, 0, W, H);
    if (cab.logosNaImagem) logos(c, cab.logos, W * 0.025, H * 0.08, W * 0.3, H * 0.84, cab.logosLado);
    sombraInferior(c, W, H);
    c.restore();
    return;
  }

  const base = cores.cabecalho;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tom(base, 0.1));
  g.addColorStop(1, tom(base, -0.18));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // foto de pessoas à direita, fundindo na cor do cabeçalho
  let fimTexto = W * 0.975;
  if (cab.foto) {
    const fw = W * 0.36, fx = W - fw;
    c.save();
    c.beginPath();
    c.rect(fx, 0, fw, H);
    c.clip();
    capa(c, cab.foto, fx, 0, fw, H);
    const f = c.createLinearGradient(fx, 0, fx + fw * 0.45, 0);
    f.addColorStop(0, tom(base, -0.05));
    f.addColorStop(1, tom(base, -0.05) + '00');
    c.fillStyle = f;
    c.fillRect(fx, 0, fw * 0.46, H);
    c.restore();
    fimTexto = fx + fw * 0.12;
  }

  // logos: canto esquerdo livre (padrão do Eduardo)
  const lx = W * 0.025, lw = W * 0.3;
  logos(c, cab.logos, lx, H * 0.08, lw, H * 0.84, cab.logosLado !== false);

  // título
  const tx = lx + lw + W * 0.025, tw = fimTexto - tx;
  const temChamada = !!cab.chamada;
  const titH = H * (temChamada ? 0.66 : 0.84);
  titulo(c, cab.titulo, tx, H * 0.06, tw, titH, cores);
  if (temChamada) chamada(c, cab.chamada, tx, H * 0.06 + titH + H * 0.02, tw, H * 0.2, cores);
  sombraInferior(c, W, H);
  c.restore();
}

function capa(c, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function sombraInferior(c, W, H) {
  const g = c.createLinearGradient(0, H, 0, H + H * 0.12);
  g.addColorStop(0, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, H, W, H * 0.12);
}

// Logos lado a lado (padrão) ou uma em cima da outra.
// Contorno suave em volta, para destacar do fundo sem virar borda grossa.
export function logos(c, imgs, x, y, w, h, ladoALado = true) {
  imgs = (imgs || []).filter(Boolean);
  if (!imgs.length) return;
  const n = imgs.length, gap = (ladoALado ? w : h) * 0.05;
  imgs.forEach((img, i) => {
    const bx = ladoALado ? x + i * ((w - gap * (n - 1)) / n + gap) : x;
    const by = ladoALado ? y : y + i * ((h - gap * (n - 1)) / n + gap);
    const bw = ladoALado ? (w - gap * (n - 1)) / n : w;
    const bh = ladoALado ? h : (h - gap * (n - 1)) / n;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = Math.min(bw, bh) * 0.06;
    c.shadowOffsetY = Math.min(bw, bh) * 0.02;
    imagemContida(c, img, bx, by, bw, bh);
    c.restore();
  });
}

// Título grande em letra condensada, com profundidade na cor escura do cabeçalho.
function titulo(c, texto, x, y, w, h, cores) {
  texto = String(texto || '').toUpperCase();
  const m = encaixarTexto(c, texto, { larg: w, alt: h, maxLinhas: 3, max: h, min: 20, peso: 400, familia: FONTE.numero, entrelinha: 0.98 });
  const corTit = cores.titulo || '#ffffff';
  const prof = tom(cores.cabecalho, -0.55);
  c.save();
  c.font = fonte(400, m.tamanho, FONTE.numero);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const passo = m.tamanho * 0.98, capH = m.tamanho * 0.735;
  const blocoH = (m.linhas.length - 1) * passo + capH;
  let by = y + (h - blocoH) / 2 + capH;
  for (const l of m.linhas) {
    for (let d = Math.max(2, m.tamanho * 0.05); d > 0; d -= 1) { c.fillStyle = prof; c.fillText(l, x + d * 0.5, by + d); }
    c.lineWidth = Math.max(2, m.tamanho * 0.025);
    c.strokeStyle = prof;
    c.strokeText(l, x, by);
    c.fillStyle = corTit;
    c.fillText(l, x, by);
    by += passo;
  }
  c.restore();
}

// Faixa de chamada embaixo do título (ex.: "ENCHE O CARRINHO E GASTA MENOS").
function chamada(c, texto, x, y, w, h, cores) {
  texto = String(texto || '').toUpperCase();
  const cor = cores.destaque, txt = textoSobre(cor);
  c.save();
  let t = h * 0.56;
  c.font = fonte(400, t, FONTE.forte);
  let lw = c.measureText(texto).width;
  if (lw > w - h) { t *= (w - h) / lw; c.font = fonte(400, t, FONTE.forte); lw = c.measureText(texto).width; }
  const bw = lw + h;
  caminhoArredondado(c, x, y + h * 0.08, bw, h, h * 0.25);
  c.fillStyle = tom(cor, -0.35);
  c.fill();
  caminhoArredondado(c, x, y, bw, h, h * 0.25);
  c.fillStyle = cor;
  c.fill();
  c.fillStyle = txt;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText(texto, x + h / 2, y + h / 2 + t * 0.03);
  c.restore();
}

// Ferramentas de desenho usadas por todas as partes da arte.
// Nenhuma função aqui sabe o que é "encarte": só desenha formas, textos e cores.

export const FONTE = {
  numero: 'Anton',            // números do preço e títulos
  nome: 'Oswald',             // nome do produto
  texto: 'Archivo',           // textos pequenos
  forte: '"Archivo Black"',   // selos e faixas
};

export function caminhoArredondado(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Sombra macia em camadas: sai igual em todo navegador e não depende de shadowBlur.
export function sombraMacia(c, x, y, w, h, r, forca = 1) {
  c.save();
  for (let i = 4; i >= 1; i--) {
    const d = i * 2.2 * forca;
    c.globalAlpha = 0.045 * forca;
    caminhoArredondado(c, x - d * 0.4, y + d * 0.6, w + d * 0.8, h + d * 0.8, r + d * 0.5);
    c.fillStyle = '#000';
    c.fill();
  }
  c.restore();
}

// ---------- cores ----------
export function hexParaRgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
}
export function rgbParaHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// mistura a cor com branco (t > 0) ou com preto (t < 0)
export function tom(hex, t) {
  const [r, g, b] = hexParaRgb(hex);
  const alvo = t > 0 ? 255 : 0, k = Math.abs(t);
  return rgbParaHex([r + (alvo - r) * k, g + (alvo - g) * k, b + (alvo - b) * k]);
}
export function luminancia(hex) {
  const [r, g, b] = hexParaRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const ehClara = hex => luminancia(hex) > 0.45;
export const textoSobre = hex => (ehClara(hex) ? '#1b1b1f' : '#ffffff');

// ---------- texto ----------
export function fonte(peso, tamanho, familia) {
  return `${peso} ${Math.round(tamanho)}px ${familia}`;
}

// Quebra o texto em até maxLinhas, buscando o MAIOR tamanho que cabe na caixa.
// Devolve { linhas, tamanho }.
export function encaixarTexto(c, texto, { larg, alt, maxLinhas = 2, max = 200, min = 10, peso = 700, familia = FONTE.nome, entrelinha = 1.02 }) {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return { linhas: [], tamanho: min };
  let melhor = null;
  for (let n = 1; n <= Math.min(maxLinhas, palavras.length); n++) {
    const linhas = dividirEquilibrado(c, palavras, n, peso, familia);
    c.font = fonte(peso, 100, familia);
    const maiorLarg = Math.max(...linhas.map(l => c.measureText(l).width));
    let tam = Math.min(max, (larg / maiorLarg) * 100, alt / (n * entrelinha));
    tam = Math.max(min, tam);
    if (!melhor || tam > melhor.tamanho * 1.04) melhor = { linhas, tamanho: tam };
  }
  return melhor;
}

// divide as palavras em n linhas de largura parecida
function dividirEquilibrado(c, palavras, n, peso, familia) {
  if (n === 1) return [palavras.join(' ')];
  c.font = fonte(peso, 100, familia);
  const total = c.measureText(palavras.join(' ')).width, alvo = total / n;
  const linhas = [];
  let atual = [];
  for (const p of palavras) {
    const teste = [...atual, p].join(' ');
    if (atual.length && c.measureText(teste).width > alvo * 1.08 && linhas.length < n - 1) {
      linhas.push(atual.join(' '));
      atual = [p];
    } else atual.push(p);
  }
  linhas.push(atual.join(' '));
  return linhas;
}

export function desenharLinhas(c, { linhas, tamanho }, x, yMeio, { peso = 700, familia = FONTE.nome, cor = '#111', alinhar = 'center', entrelinha = 1.02 } = {}) {
  c.save();
  c.font = fonte(peso, tamanho, familia);
  c.fillStyle = cor;
  c.textAlign = alinhar;
  c.textBaseline = 'middle';
  const passo = tamanho * entrelinha, y0 = yMeio - ((linhas.length - 1) * passo) / 2;
  linhas.forEach((l, i) => c.fillText(l, x, y0 + i * passo));
  c.restore();
}

// ---------- imagens ----------
// Desenha a imagem inteira dentro da caixa (nunca corta, nunca sai da caixa).
export function imagemContida(c, img, x, y, w, h, alinharV = 'center') {
  if (!img || !img.width) return null;
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  const dx = x + (w - dw) / 2;
  const dy = alinharV === 'bottom' ? y + h - dh : alinharV === 'top' ? y : y + (h - dh) / 2;
  c.drawImage(img, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

// Área útil da imagem: ignora margens brancas ou transparentes em volta do produto.
// Assim um produto com muita sobra na foto não fica pequeno no cartão.
const _recorteCache = new WeakMap();
export function areaUtil(img) {
  if (!img || !img.width) return null;
  if (_recorteCache.has(img)) return _recorteCache.get(img);
  const K = 160, k = Math.min(1, K / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  let r = { x: 0, y: 0, w: img.width, h: img.height };
  try {
    const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const vazio = d[i + 3] < 20 || (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244);
      if (!vazio) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 > x0 && y1 > y0) {
      const m = 1;
      r = { x: Math.max(0, (x0 - m) / k), y: Math.max(0, (y0 - m) / k), w: Math.min(img.width, (x1 - x0 + 2 * m) / k), h: Math.min(img.height, (y1 - y0 + 2 * m) / k) };
    }
  } catch (_) { /* imagem de outro site sem permissão: usa inteira */ }
  _recorteCache.set(img, r);
  return r;
}

// Desenha só a área útil do produto, o maior possível dentro da caixa, sem sair dela.
export function produtoContido(c, img, x, y, w, h, alinharV = 'bottom') {
  const a = areaUtil(img);
  if (!a) return null;
  const k = Math.min(w / a.w, h / a.h);
  const dw = a.w * k, dh = a.h * k;
  const dx = x + (w - dw) / 2;
  const dy = alinharV === 'bottom' ? y + h - dh : alinharV === 'top' ? y : y + (h - dh) / 2;
  c.drawImage(img, a.x, a.y, a.w, a.h, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

// ---------- dinheiro ----------
export function partesPreco(v) {
  const n = Math.round(Number(v) * 100);
  const inteiro = Math.floor(n / 100), cent = String(n % 100).padStart(2, '0');
  return { inteiro: inteiro.toLocaleString('pt-BR'), centavos: cent };
}
export const reais = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Preço do cartão, no padrão que o Eduardo aprovou (Esquenta Black Friday / Oferta Relâmpago):
// - preço normal: etiqueta na cor do tema com número branco grande;
// - com app: SEM APP (caixa colorida, menor) e COM APP (caixa branca, número preto maior) LADO A LADO,
//   com o limite numa faixa preta acima. Nunca "de/por".
import { FONTE, fonte, caminhoArredondado, tom, partesPreco, textoSobre } from './util.js';

const UNIDADE = { un: 'UN', kg: 'KG', l: 'L', bdj: 'BDJ', dz: 'DZ', pct: 'PCT', cx: 'CX', fd: 'FD' };
export const rotuloUnidade = u => UNIDADE[String(u || 'un').toLowerCase()] || String(u || 'UN').toUpperCase();
export const temApp = p => p.precoApp != null && p.precoApp < p.preco;

export function desenharPreco(c, prod, x, y, w, h, cores) {
  if (!temApp(prod)) return etiqueta(c, prod.preco, prod.unidade, x, y, w, h, cores.etiqueta, cores.etiquetaTexto || textoSobre(cores.etiqueta));

  let topo = 0;
  if (prod.limite) {
    topo = h * 0.2;
    faixaLimite(c, `LIMITE DE ${prod.limite} ${prod.limite > 1 ? 'UNIDADES' : 'UNIDADE'} NO PREÇO DO APP`, x, y, w, topo * 0.86, cores);
  }
  const by = y + topo, bh = h - topo, gap = w * 0.03;
  const ws = (w - gap) * 0.43, wc = w - gap - ws;
  caixaApp(c, 'SEM APP', prod.preco, prod.unidade, x, by + bh * 0.06, ws, bh * 0.94, cores.etiqueta, cores.etiquetaTexto || textoSobre(cores.etiqueta));
  caixaApp(c, 'COM APP', prod.precoApp, prod.unidade, x + ws + gap, by, wc, bh, '#ffffff', '#111111');
}

function faixaLimite(c, texto, x, y, w, h, cores) {
  c.save();
  let t = h * 0.7;
  c.font = fonte(700, t, FONTE.nome);
  let lw = c.measureText(texto).width;
  if (lw > w * 0.92) { t *= (w * 0.92) / lw; c.font = fonte(700, t, FONTE.nome); lw = c.measureText(texto).width; }
  const bw = Math.min(w, lw + h * 0.9), bx = x + (w - bw) / 2;
  caminhoArredondado(c, bx, y, bw, h, h * 0.3);
  c.fillStyle = '#111';
  c.fill();
  c.fillStyle = cores.destaque || '#ffd21f';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(texto, bx + bw / 2, y + h / 2 + t * 0.04);
  c.restore();
}

function caixaApp(c, rotulo, valor, unidade, x, y, w, h, fundo, cor) {
  c.save();
  const r = Math.min(w, h) * 0.1;
  sombraCurta(c, x, y, w, h, r);
  caminhoArredondado(c, x, y, w, h, r);
  c.fillStyle = fundo;
  c.fill();
  const rh = h * 0.24;
  let t = rh * 0.82;
  c.font = fonte(700, t, FONTE.nome);
  const lw = c.measureText(rotulo).width;
  if (lw > w * 0.86) { t *= (w * 0.86) / lw; c.font = fonte(700, t, FONTE.nome); }
  c.fillStyle = cor;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(rotulo, x + w / 2, y + rh * 0.62);
  numeroPreco(c, valor, unidade, x, y + rh, w, h - rh, cor, fundo);
  c.restore();
}

function sombraCurta(c, x, y, w, h, r) {
  c.save();
  c.globalAlpha = 0.22;
  caminhoArredondado(c, x, y + h * 0.035, w, h, r);
  c.fillStyle = '#000';
  c.fill();
  c.restore();
}

export function etiqueta(c, valor, unidade, x, y, w, h, fundo, cor) {
  c.save();
  const r = Math.min(w, h) * 0.14;
  sombraCurta(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tom(fundo, 0.12));
  g.addColorStop(1, tom(fundo, -0.12));
  caminhoArredondado(c, x, y, w, h, r);
  c.fillStyle = g;
  c.fill();
  numeroPreco(c, valor, unidade, x, y, w, h, cor, fundo);
  c.restore();
}

export function numeroPreco(c, valor, unidade, x, y, w, h, cor, fundo) {
  const { inteiro, centavos } = partesPreco(valor);
  const un = rotuloUnidade(unidade);
  let H = h * 0.9;
  const medir = H => {
    c.font = fonte(400, H, FONTE.numero);
    const li = c.measureText(inteiro).width;
    c.font = fonte(400, H * 0.44, FONTE.numero);
    const lc = c.measureText(',' + centavos).width;
    c.font = fonte(700, H * 0.17, FONTE.nome);
    const lu = c.measureText(un).width, lr = c.measureText('R$').width * 1.25;
    return { li, lc, lu, lr, tot: lr + H * 0.04 + li + H * 0.03 + Math.max(lc, lu) };
  };
  let m = medir(H);
  const maxW = w * 0.86;
  if (m.tot > maxW) { H *= maxW / m.tot; m = medir(H); }
  const x0 = x + (w - m.tot) / 2;
  const capa = H * 0.735, yBase = y + h / 2 + capa / 2;
  const claro = textoSobre(fundo) !== '#ffffff';
  c.save();
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const sombra = claro ? 'rgba(0,0,0,0.18)' : tom(fundo, -0.5);
  const escrever = (t, px, py) => {
    c.fillStyle = sombra; c.fillText(t, px + H * 0.015, py + H * 0.02);
    c.fillStyle = cor; c.fillText(t, px, py);
  };
  c.font = fonte(700, H * 0.17 * 1.25, FONTE.nome);
  escrever('R$', x0, yBase - capa + H * 0.2);
  c.font = fonte(400, H, FONTE.numero);
  const xi = x0 + m.lr + H * 0.04;
  escrever(inteiro, xi, yBase);
  const xc = xi + m.li + H * 0.03;
  c.font = fonte(400, H * 0.44, FONTE.numero);
  escrever(',' + centavos, xc, yBase - capa + H * 0.44 * 0.735);
  c.font = fonte(700, H * 0.17, FONTE.nome);
  escrever(un, xc + (m.lc - m.lu) / 2, yBase);
  c.restore();
}

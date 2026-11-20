// Etiqueta de preço do cartão.
// Formato do Eduardo: preço SEM app × preço COM app (nunca "de/por").
// O limite de unidades vale no preço do app.
import { FONTE, fonte, caminhoArredondado, tom, partesPreco, reais, textoSobre } from './util.js';

const UNIDADE = { un: 'UN', kg: 'KG', l: 'L', bdj: 'BDJ', dz: 'DZ', pct: 'PCT', cx: 'CX', fd: 'FD' };
export const rotuloUnidade = u => UNIDADE[String(u || 'un').toLowerCase()] || String(u || 'UN').toUpperCase();

// Quanto de altura a faixa "sem app" ocupa acima da etiqueta (proporção da altura do bloco).
export const FAIXA_APP = 0.34;

// Desenha o bloco de preço dentro de (x, y, w, h).
// prod: { preco, precoApp, limite, unidade }
// opt.reservarFaixa: true quando algum produto desta arte tem preço do app; assim
// o número sai do mesmo tamanho em cartões do mesmo tamanho.
export function desenharPreco(c, prod, x, y, w, h, cores, opt = {}) {
  const temApp = prod.precoApp != null && prod.precoApp < prod.preco;
  const faixa = opt.reservarFaixa || temApp ? h * FAIXA_APP : 0;

  if (temApp) faixaSemApp(c, prod, x, y, w, faixa * 0.48, cores);

  const ty = y + faixa, th = h - faixa;
  const valor = temApp ? prod.precoApp : prod.preco;
  etiqueta(c, valor, prod.unidade, x, ty, w, th, cores, temApp ? (prod.limite ? `NO APP • LIMITE ${prod.limite} ${rotuloUnidade(prod.unidade)}` : 'NO APP') : null);
}

function faixaSemApp(c, prod, x, y, w, h, cores) {
  c.save();
  const r = h * 0.5;
  caminhoArredondado(c, x + w * 0.04, y, w * 0.92, h, r);
  c.fillStyle = '#f1f1f1';
  c.fill();
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  const rot = 'SEM APP ', val = reais(prod.preco);
  let t = h * 0.62;
  c.font = fonte(700, t, FONTE.nome);
  const larg = c.measureText(rot + val).width;
  if (larg > w * 0.84) t *= (w * 0.84) / larg;
  c.font = fonte(600, t, FONTE.nome);
  const l1 = c.measureText(rot).width;
  c.font = fonte(700, t, FONTE.nome);
  const l2 = c.measureText(val).width, x0 = x + w / 2 - (l1 + l2) / 2;
  c.textAlign = 'left';
  c.font = fonte(600, t, FONTE.nome);
  c.fillStyle = '#555';
  c.fillText(rot, x0, y + h / 2 + t * 0.03);
  c.font = fonte(700, t, FONTE.nome);
  c.fillStyle = '#222';
  c.fillText(val, x0 + l1, y + h / 2 + t * 0.03);
  c.restore();
}

// A etiqueta: fundo na cor da campanha, com volume (luz em cima, base escura).
export function etiqueta(c, valor, unidade, x, y, w, h, cores, selo) {
  const base = cores.etiqueta, txt = cores.etiquetaTexto || textoSobre(base);
  const r = Math.min(h * 0.22, w * 0.12);
  c.save();
  // base escura (degrau embaixo)
  caminhoArredondado(c, x, y + h * 0.05, w, h * 0.95, r);
  c.fillStyle = tom(base, -0.35);
  c.fill();
  // corpo
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tom(base, 0.18));
  g.addColorStop(0.55, base);
  g.addColorStop(1, tom(base, -0.1));
  caminhoArredondado(c, x, y, w, h * 0.93, r);
  c.fillStyle = g;
  c.fill();
  // brilho
  c.save();
  caminhoArredondado(c, x, y, w, h * 0.93, r);
  c.clip();
  c.globalAlpha = 0.16;
  c.fillStyle = '#fff';
  c.fillRect(x, y, w, h * 0.3);
  c.restore();

  const corpoH = h * 0.93;
  // selo "NO APP": aba escura presa na borda de cima, sem roubar altura do número
  if (selo) {
    let t = corpoH * 0.17;
    c.font = fonte(700, t, FONTE.nome);
    let lw = c.measureText(selo).width;
    if (lw > w * 0.8) { t *= (w * 0.8) / lw; c.font = fonte(700, t, FONTE.nome); lw = c.measureText(selo).width; }
    const sh = t * 1.45, sw = lw + t * 1.2, sx = x + (w - sw) / 2, sy = y - sh * 0.55;
    caminhoArredondado(c, sx, sy, sw, sh, sh * 0.35);
    c.fillStyle = '#1d1d22';
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(selo, sx + sw / 2, sy + sh / 2 + t * 0.04);
  }
  const seloH = selo ? corpoH * 0.1 : 0;
  numeroPreco(c, valor, unidade, x, y + seloH, w, corpoH - seloH, txt, base);
  c.restore();
}

// "R$ 4,99 UN": inteiro grande, centavos em cima, unidade embaixo dos centavos.
export function numeroPreco(c, valor, unidade, x, y, w, h, cor, fundo) {
  const { inteiro, centavos } = partesPreco(valor);
  const un = rotuloUnidade(unidade);
  let H = h * 0.92;                      // altura do número inteiro
  const medir = H => {
    c.font = fonte(400, H, FONTE.numero);
    const li = c.measureText(inteiro).width;
    c.font = fonte(400, H * 0.46, FONTE.numero);
    const lc = c.measureText(',' + centavos).width;
    c.font = fonte(700, H * 0.2, FONTE.nome);
    const lu = c.measureText(un).width;
    c.font = fonte(700, H * 0.2, FONTE.nome);
    const lr = c.measureText('R$').width;
    return { li, lc, lu, lr, tot: lr + H * 0.06 + li + H * 0.04 + Math.max(lc, lu) };
  };
  let m = medir(H);
  const maxW = w * 0.88;
  if (m.tot > maxW) { H *= maxW / m.tot; m = medir(H); }
  const x0 = x + (w - m.tot) / 2;
  // Anton: a altura das maiúsculas é ~0,73 do tamanho; centraliza pelo desenho do número
  const capa = H * 0.735, yBase = y + h / 2 + capa / 2;
  c.save();
  c.fillStyle = cor;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  // sombra curta para dar relevo
  const sombra = tom(fundo, -0.45);
  const escrever = (t, px, py) => {
    c.fillStyle = sombra; c.fillText(t, px + H * 0.018, py + H * 0.024);
    c.fillStyle = cor; c.fillText(t, px, py);
  };
  c.font = fonte(700, H * 0.2, FONTE.nome);
  escrever('R$', x0, yBase - capa + H * 0.17);
  c.font = fonte(400, H, FONTE.numero);
  const xi = x0 + m.lr + H * 0.06;
  escrever(inteiro, xi, yBase);
  const xc = xi + m.li + H * 0.04;
  c.font = fonte(400, H * 0.46, FONTE.numero);
  escrever(',' + centavos, xc, yBase - capa + H * 0.46 * 0.735);
  c.font = fonte(700, H * 0.2, FONTE.nome);
  escrever(un, xc + (m.lc - m.lu) / 2, yBase);
  c.restore();
}

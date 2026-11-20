// Cartão de produto. A foto fica SEMPRE dentro do cartão.
// Em pé (produto normal): foto em cima, nome, preço embaixo.
// Deitado (destaque, como no Esquenta): foto à esquerda, nome e preço à direita, fundo na cor de destaque do tema.
import { FONTE, fonte, caminhoArredondado, sombraMacia, encaixarTexto, desenharLinhas, produtoContido, areaUtil, tom, textoSobre } from './util.js';
import { desenharPreco, temApp } from './preco.js';

export function desenharCartao(c, prod, x, y, w, h, cores, opt = {}) {
  if (opt.estilo === 'quadros') return quadro(c, prod, x, y, w, h, cores, opt);
  const deitado = opt.deitado ?? w / h >= 1.3;
  const r = Math.min(w, h) * 0.035;
  const fundo = deitado ? cores.cartaoDestaque : '#ffffff';
  sombraMacia(c, x, y, w, h, r, 1.3);
  c.save();
  caminhoArredondado(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tom(fundo, 0.08));
  g.addColorStop(1, tom(fundo, -0.06));
  c.fillStyle = g;
  c.fill();
  if (deitado) {
    c.lineWidth = Math.max(3, h * 0.012);
    c.strokeStyle = tom(fundo, -0.25);
    c.stroke();
  }
  c.restore();
  const pad = Math.min(w, h) * 0.05;
  return deitado ? cartaoDeitado(c, prod, x, y, w, h, pad, cores, opt) : cartaoEmPe(c, prod, x, y, w, h, pad, cores, opt);
}

// Em pé: nome em cima (nunca encoberto), foto grande no meio descendo um pouco por trás do preço
// (o produto fica maior; pedido do Eduardo), preço embaixo por cima da foto.
function cartaoEmPe(c, prod, x, y, w, h, pad, cores, opt) {
  const app = temApp(prod);
  const precoH = h * (app ? (prod.limite ? 0.36 : 0.31) : 0.24);
  const nomeH = h * 0.17;
  const m = medirNome(c, prod.nome, w - pad * 2, nomeH, 2);
  const tam = Math.min(m.tamanho, opt.tamanhoNome || Infinity);
  desenharLinhas(c, { ...m, tamanho: tam }, x + w / 2, y + pad * 0.6 + nomeH / 2, { peso: 700, familia: FONTE.nome, cor: '#16161a', entrelinha: 1.0 });
  const fy = y + pad * 0.6 + nomeH + pad * 0.3;
  const atras = precoH * (app ? 0.25 : 0.5);
  const fh = y + h - pad - precoH + atras - fy;
  foto(c, prod, x + pad, fy, w - pad * 2, fh, 'bottom');
  if (prod.frase) selo(c, prod.frase, x + pad * 0.4, fy, w * 0.7, Math.max(16, h * 0.075));
  desenharPreco(c, prod, x + pad, y + h - pad - precoH, w - pad * 2, precoH, cores);
}

function cartaoDeitado(c, prod, x, y, w, h, pad, cores, opt) {
  const fotoW = w * 0.47;
  foto(c, prod, x + pad, y + pad, fotoW - pad, h - pad * 2, 'center');
  if (prod.frase) selo(c, prod.frase, x - w * 0.012, y + pad * 0.5, fotoW * 0.95, Math.max(18, h * 0.13));
  const cx = x + fotoW + pad * 0.6, cw = w - fotoW - pad * 1.6;
  const app = temApp(prod);
  const precoH = h * (app ? (prod.limite ? 0.6 : 0.52) : 0.44);
  const nomeH = h - pad * 2.2 - precoH;
  const m = medirNome(c, prod.nome, cw, nomeH, 3);
  const txt = textoSobre(cores.cartaoDestaque);
  desenharLinhas(c, m, cx + cw / 2, y + pad + nomeH / 2, { peso: 700, familia: FONTE.nome, cor: txt === '#ffffff' ? '#fff' : '#16161a', entrelinha: 1.02 });
  desenharPreco(c, prod, cx, y + h - pad - precoH, cw, precoH, cores);
}

// Estilo "quadros" (como os encartes do Eduardo no Photoshop): quadros coloridos colados,
// nome em cima, foto grande no meio, preço numa pílula embaixo à esquerda.
function quadro(c, prod, x, y, w, h, cores, opt) {
  const fundo = opt.destaqueLinha ? cores.cartaoDestaque : (cores.cartaoNormal || cores.etiqueta);
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tom(fundo, 0.1));
  g.addColorStop(1, tom(fundo, -0.1));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  if (fundo.toLowerCase() === '#ffffff') { c.strokeStyle = '#c9c9c9'; c.lineWidth = Math.max(2, w * 0.006); c.strokeRect(x, y, w, h); }
  c.restore();
  const pad = Math.min(w, h) * 0.045;
  const txt = textoSobre(fundo) === '#ffffff' ? '#ffffff' : '#16161a';
  const nomeH = h * 0.2;
  const m = medirNome(c, prod.nome, w - pad * 2, nomeH, 2);
  const tam = Math.min(m.tamanho, opt.tamanhoNome || Infinity);
  desenharLinhas(c, { ...m, tamanho: tam }, x + w / 2, y + pad * 0.6 + nomeH / 2, { peso: 700, familia: FONTE.nome, cor: txt, entrelinha: 1.0 });
  const app = temApp(prod);
  const precoH = h * (app ? (prod.limite ? 0.34 : 0.3) : 0.25);
  const fy = y + pad * 0.6 + nomeH + pad * 0.3, fh = h - (fy - y) - precoH - pad * 0.5;
  foto(c, prod, x + pad, fy, w - pad * 2, fh + precoH * (app ? 0.2 : 0.5), 'bottom');
  if (prod.frase) selo(c, prod.frase, x + pad * 0.3, fy, w * 0.7, Math.max(16, h * 0.07));
  const corPilula = cores.pilula || '#16161a';
  const pilula = { etiqueta: corPilula, etiquetaTexto: cores.pilulaTexto || textoSobre(corPilula), destaque: cores.destaque };
  // preço sempre centralizado no quadro (pedido do Eduardo)
  const pw = app ? w - pad * 2 : w * 0.76;
  desenharPreco(c, prod, x + (w - pw) / 2, y + h - pad * 0.7 - precoH, pw, precoH, pilula);
}

export function medirNome(c, texto, larg, alt, maxLinhas = 2) {
  return encaixarTexto(c, String(texto || '').toUpperCase(), { larg, alt, maxLinhas, max: alt * (maxLinhas > 2 ? 0.4 : 0.6), min: 9, peso: 700, familia: FONTE.nome, entrelinha: 1.0 });
}

// Foto do produto. "Leve vários" (kit, fardo, combo): três cópias em cascata, como o deslocamento do Photoshop.
function foto(c, prod, x, y, w, h, alinhar) {
  if (!prod.foto) return semFoto(c, prod, x, y, w, h);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  if (prod.repetir) {
    const a = areaUtil(prod.foto), asp = a.w / a.h;
    // cada cópia ocupa ~62% da largura; ficam lado a lado, a do meio na frente
    let cw = w * 0.5, ch = cw / asp;
    if (ch > h * 0.92) { ch = h * 0.92; cw = ch * asp; }
    const passo = (w - cw) / 2, base = y + h;
    const pos = [[x, base - ch * 0.94, 0.94], [x + passo * 2, base - ch * 0.94, 0.94], [x + passo, base - ch, 1]];
    for (const [px, py, k] of pos) produtoContido(c, prod.foto, px + cw * (1 - k) / 2, py, cw * k, ch * k, 'bottom');
  } else produtoContido(c, prod.foto, x, y, w, h, alinhar);
  c.restore();
}

function semFoto(c, prod, x, y, w, h) {
  c.save();
  caminhoArredondado(c, x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.7, 12);
  c.fillStyle = 'rgba(0,0,0,0.05)';
  c.fill();
  c.restore();
}

// Frase de impacto ("TÁ MUITO BARATO!"): faixa amarela inclinada, saindo do canto como no Esquenta.
function selo(c, texto, x, y, maxW, h) {
  texto = String(texto).toUpperCase();
  c.save();
  let t = h * 0.72;
  c.font = fonte(400, t, FONTE.numero);
  let lw = c.measureText(texto).width;
  if (lw > maxW - h * 0.6) { t *= (maxW - h * 0.6) / lw; c.font = fonte(400, t, FONTE.numero); lw = c.measureText(texto).width; }
  const bw = lw + h * 0.6;
  c.translate(x, y + h / 2);
  c.rotate(-0.05);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(3, -h / 2 + 4, bw, h);
  c.fillStyle = '#ffd21f';
  c.fillRect(0, -h / 2, bw, h);
  c.strokeStyle = '#16161a';
  c.lineWidth = Math.max(2, h * 0.06);
  c.strokeRect(0, -h / 2, bw, h);
  c.fillStyle = '#16161a';
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(texto, bw / 2, h * 0.02);
  c.restore();
}

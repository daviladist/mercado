// O cartão de um produto. Regra do Eduardo: a foto fica SEMPRE dentro do cartão.
import { FONTE, fonte, caminhoArredondado, sombraMacia, encaixarTexto, desenharLinhas, produtoContido, tom, textoSobre } from './util.js';
import { desenharPreco, FAIXA_APP } from './preco.js';

// prod: { nome, preco, precoApp, limite, unidade, foto (imagem carregada), peso (0..3), frase }
// opt: { reservarFaixa, tamanhoNome (para igualar nomes da mesma linha) }
export function desenharCartao(c, prod, x, y, w, h, cores, opt = {}) {
  const r = Math.min(w, h) * 0.07;
  const destaque = (prod.peso || 1) >= 2;

  sombraMacia(c, x, y, w, h, r, 1.2);
  c.save();
  caminhoArredondado(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#f2f2f2');
  c.fillStyle = g;
  c.fill();
  if (destaque) {
    c.lineWidth = Math.max(3, Math.min(w, h) * 0.018);
    c.strokeStyle = cores.destaque;
    caminhoArredondado(c, x + c.lineWidth / 2, y + c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth, r - c.lineWidth / 2);
    c.stroke();
  }
  c.restore();

  const deitado = w / h >= 1.3;
  const pad = Math.min(w, h) * 0.045;
  if (!prod.foto) return semFoto(c, prod, x, y, w, h, pad, cores, opt);
  return deitado ? cartaoDeitado(c, prod, x, y, w, h, pad, cores, opt) : cartaoEmPe(c, prod, x, y, w, h, pad, cores, opt);
}

function cartaoEmPe(c, prod, x, y, w, h, pad, cores, opt) {
  const iw = w - pad * 2;
  const temFaixa = opt.reservarFaixa || prod.precoApp != null;
  const precoH = h * (temFaixa ? 0.36 : 0.25);
  const nomeH = h * 0.135;
  const fotoH = h - pad * 1.6 - nomeH - precoH - pad * 0.2;
  const fy = y + pad;
  // foto: dentro da caixa, encostada embaixo (o produto "pisa" no nome)
  c.save();
  caminhoArredondado(c, x, y, w, h, Math.min(w, h) * 0.07);
  c.clip();
  produtoContido(c, prod.foto, x + pad, fy, iw, fotoH, 'bottom');
  c.restore();
  if (prod.frase) selo(c, prod.frase, x + pad * 0.6, y + pad * 0.6, iw * 0.62, Math.max(18, h * 0.07), cores);
  const ny = fy + fotoH + pad * 0.1;
  nome(c, prod.nome, x + w / 2, ny, iw, nomeH, opt.tamanhoNome);
  desenharPreco(c, prod, x + pad * 0.6, y + h - pad * 0.8 - precoH, w - pad * 1.2, precoH, cores, opt);
}

function cartaoDeitado(c, prod, x, y, w, h, pad, cores, opt) {
  const fotoW = w * 0.46;
  c.save();
  caminhoArredondado(c, x, y, w, h, Math.min(w, h) * 0.07);
  c.clip();
  produtoContido(c, prod.foto, x + pad, y + pad, fotoW - pad, h - pad * 2, 'center');
  c.restore();
  if (prod.frase) selo(c, prod.frase, x + pad * 0.6, y + pad * 0.6, fotoW * 0.8, Math.max(18, h * 0.1), cores);
  const cx = x + fotoW + pad * 0.5, cw = w - fotoW - pad * 1.5;
  const nomeH = h * 0.34;
  nome(c, prod.nome, cx + cw / 2, y + pad, cw, nomeH, opt.tamanhoNome, 3);
  const temFaixa = opt.reservarFaixa || prod.precoApp != null;
  const precoH = Math.min(h - pad * 2 - nomeH, h * (temFaixa ? 0.56 : 0.46));
  desenharPreco(c, prod, cx, y + h - pad - precoH, cw, precoH, cores, opt);
}

function semFoto(c, prod, x, y, w, h, pad, cores, opt) {
  const precoH = h * 0.4;
  nome(c, prod.nome, x + w / 2, y + pad, w - pad * 2, h - precoH - pad * 2.2, null, 3);
  desenharPreco(c, prod, x + pad * 0.5, y + h - pad * 0.7 - precoH, w - pad, precoH, cores, opt);
}

export function medirNome(c, texto, larg, alt, maxLinhas = 2) {
  return encaixarTexto(c, String(texto || '').toUpperCase(), { larg, alt, maxLinhas, max: alt * 0.62, min: 9, peso: 700, familia: FONTE.nome, entrelinha: 1.0 });
}

function nome(c, texto, cx, y, larg, alt, tamanhoFixo, maxLinhas = 2) {
  let m = medirNome(c, texto, larg, alt, maxLinhas);
  if (tamanhoFixo && tamanhoFixo < m.tamanho) m = { ...m, tamanho: tamanhoFixo };
  desenharLinhas(c, m, cx, y + alt / 2, { peso: 700, familia: FONTE.nome, cor: '#1d1d22', entrelinha: 1.0 });
}

// Frase de impacto ("TÁ MUITO BARATO"): faixa inclinada no canto da foto.
function selo(c, texto, x, y, maxW, h, cores) {
  texto = String(texto).toUpperCase();
  c.save();
  let t = h * 0.6;
  c.font = fonte(400, t, FONTE.forte);
  let lw = c.measureText(texto).width;
  if (lw > maxW - h * 0.8) { t *= (maxW - h * 0.8) / lw; c.font = fonte(400, t, FONTE.forte); lw = c.measureText(texto).width; }
  const bw = lw + h * 0.8;
  c.translate(x, y + h / 2);
  c.rotate(-0.06);
  caminhoArredondado(c, 0, -h / 2, bw, h, h * 0.22);
  c.fillStyle = tom(cores.destaque, -0.3);
  c.fill();
  caminhoArredondado(c, 0, -h / 2, bw, h * 0.92, h * 0.22);
  c.fillStyle = cores.destaque;
  c.fill();
  c.fillStyle = textoSobre(cores.destaque);
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(texto, bw / 2, -h * 0.03);
  c.restore();
}

export { FAIXA_APP };

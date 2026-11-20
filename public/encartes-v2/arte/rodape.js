// Rodapé do encarte:
// faixa de cima com a validade; faixa de baixo com lojas, WhatsApp/endereço, observação fixa,
// observação pontual do encarte, bandeiras de cartão e o QR para baixar o app.
import { FONTE, fonte, tom, textoSobre, imagemContida, caminhoArredondado } from './util.js';

// altura que o rodapé precisa
export function alturaRodape(W, rod) {
  return Math.round(W * (temDetalhes(rod) ? 0.15 : 0.06));
}
const temDetalhes = r => !!(r && (r.lojas || r.whatsapp || r.endereco || r.observacao || r.obsPontual || r.bandeiras || r.qr));

// rod: { validade, lojas, whatsapp, endereco, observacao, obsPontual, bandeiras (imagem), qr (canvas) }
export function desenharRodape(c, x, y, W, H, rod, cores) {
  const base = cores.rodape || cores.etiqueta;
  c.save();
  const det = temDetalhes(rod);
  const h1 = det ? H * 0.4 : H;
  // faixa da validade
  const g = c.createLinearGradient(0, y, 0, y + h1);
  g.addColorStop(0, tom(base, 0.08));
  g.addColorStop(1, tom(base, -0.18));
  c.fillStyle = g;
  c.fillRect(x, y, W, h1);
  c.fillStyle = cores.destaque || '#ffd21f';
  c.fillRect(x, y, W, Math.max(3, h1 * 0.08));
  escrever(c, String(rod.validade || '').toUpperCase(), x + W / 2, y + h1 * 0.55, W * 0.9, h1 * 0.6, 700, FONTE.nome, textoSobre(base), 'center');
  if (!det) { c.restore(); return; }

  // faixa branca de baixo
  const y2 = y + h1, h2 = H - h1, pad = W * 0.025;
  c.fillStyle = '#ffffff';
  c.fillRect(x, y2, W, h2);
  let direita = x + W - pad;
  if (rod.qr) {
    const q = h2 * 0.84, qy = y2 + (h2 - q) / 2;
    c.drawImage(rod.qr, direita - q, qy, q, q);
    // "BAIXE O APP" ao lado do QR
    const tw = q * 0.95;
    caminhoArredondado(c, direita - q - tw - pad * 0.3, qy + q * 0.22, tw, q * 0.56, q * 0.08);
    c.fillStyle = cores.etiqueta || '#d7191f';
    c.fill();
    escrever(c, 'BAIXE O', direita - q - tw / 2 - pad * 0.3, qy + q * 0.37, tw * 0.8, q * 0.18, 700, FONTE.nome, textoSobre(cores.etiqueta || '#d7191f'), 'center');
    escrever(c, 'APP', direita - q - tw / 2 - pad * 0.3, qy + q * 0.6, tw * 0.8, q * 0.24, 400, FONTE.numero, textoSobre(cores.etiqueta || '#d7191f'), 'center');
    direita -= q + tw + pad * 0.8;
  }
  if (rod.bandeiras) {
    const bw = W * 0.3, bh = h2 * 0.7;
    imagemContida(c, rod.bandeiras, direita - bw, y2 + (h2 - bh) / 2, bw, bh);
    direita -= bw + pad;
  }
  const larg = direita - (x + pad);
  const linhas = [];
  const contato = [rod.whatsapp ? 'WhatsApp ' + rod.whatsapp : '', rod.endereco].filter(Boolean).join('  •  ');
  if (rod.lojas) linhas.push([String(rod.lojas).toUpperCase(), 700, FONTE.nome, '#16161a', 1]);
  if (contato) linhas.push([contato, 600, FONTE.texto, '#333', 0.8]);
  if (rod.obsPontual) linhas.push([rod.obsPontual, 700, FONTE.texto, '#16161a', 0.78]);
  if (rod.observacao) linhas.push([rod.observacao, 600, FONTE.texto, '#555', 0.62]);
  const soma = linhas.reduce((a, l) => a + l[4], 0) || 1, passo = (h2 * 0.8) / soma;
  let yy = y2 + h2 * 0.1;
  for (const [t, peso, fam, cor, k] of linhas) {
    escrever(c, t, x + pad, yy + (passo * k) / 2, larg, passo * k * 0.82, peso, fam, cor, 'left');
    yy += passo * k;
  }
  c.restore();
}

function escrever(c, texto, px, cy, w, h, peso, familia, cor, alinhar) {
  let t = h;
  c.font = fonte(peso, t, familia);
  const lw = c.measureText(texto).width;
  if (lw > w) t *= w / lw;
  c.save();
  c.font = fonte(peso, t, familia);
  c.fillStyle = cor;
  c.textAlign = alinhar;
  c.textBaseline = 'middle';
  c.fillText(texto, px, cy);
  c.restore();
}

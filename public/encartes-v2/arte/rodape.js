// Rodapé: lojas e validade da oferta, com observações em linha fina se houver.
import { FONTE, fonte, caminhoArredondado, tom, textoSobre } from './util.js';

// rod: { lojas: 'JOATUBA E ITARANA', validade: 'OFERTA VÁLIDA SÓ NO SÁBADO, 21/11', observacao }
export function desenharRodape(c, x, y, W, H, rod, cores) {
  const base = cores.cabecalho;
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, tom(base, 0.06));
  g.addColorStop(1, tom(base, -0.2));
  c.fillStyle = g;
  c.fillRect(x, y, W, H);
  c.fillStyle = cores.destaque;
  c.fillRect(x, y, W, Math.max(3, H * 0.05));

  const txt = textoSobre(base);
  const pad = W * 0.03;
  // validade: selo inclinado à direita, em destaque
  const vw = W * 0.42, vh = H * 0.5, vx = x + W - pad - vw, vy = y + (H - vh) / 2 + H * 0.02;
  c.save();
  c.translate(vx + vw / 2, vy + vh / 2);
  c.transform(1, 0, -0.18, 1, 0, 0);
  caminhoArredondado(c, -vw / 2, -vh / 2, vw, vh, vh * 0.12);
  c.fillStyle = cores.destaque;
  c.fill();
  c.restore();
  ajustar(c, String(rod.validade || '').toUpperCase(), vx + vw / 2, vy + vh / 2, vw * 0.86, vh * 0.56, 400, FONTE.numero, textoSobre(cores.destaque), 'center');

  // lojas à esquerda
  const lw = W - vw - pad * 3;
  ajustar(c, 'OFERTAS EXCLUSIVAS NAS NOSSAS LOJAS', x + pad, y + H * 0.36, lw, H * 0.24, 700, FONTE.nome, txt, 'left');
  ajustar(c, String(rod.lojas || '').toUpperCase(), x + pad, y + H * 0.6, lw, H * 0.18, 600, FONTE.nome, txt, 'left', 0.9);
  if (rod.observacao) ajustar(c, rod.observacao, x + pad, y + H * 0.82, lw, H * 0.12, 600, FONTE.texto, txt, 'left', 0.75);
  c.restore();
}

function ajustar(c, texto, x, yMeio, w, h, peso, familia, cor, alinhar, alfa = 1) {
  let t = h;
  c.font = fonte(peso, t, familia);
  const lw = c.measureText(texto).width;
  if (lw > w) t *= w / lw;
  c.save();
  c.globalAlpha = alfa;
  c.font = fonte(peso, t, familia);
  c.fillStyle = cor;
  c.textAlign = alinhar;
  c.textBaseline = 'middle';
  c.fillText(texto, x, yMeio);
  c.restore();
}

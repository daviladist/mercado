// Rodapé: faixa com a validade da oferta e, se houver, as observações em letra menor.
import { FONTE, fonte, tom, textoSobre } from './util.js';

// rod: { validade: 'OFERTA VÁLIDA SÓ NO DIA 18/11', observacao }
export function desenharRodape(c, x, y, W, H, rod, cores) {
  const base = cores.rodape || cores.etiqueta;
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, tom(base, 0.08));
  g.addColorStop(1, tom(base, -0.18));
  c.fillStyle = g;
  c.fillRect(x, y, W, H);
  c.fillStyle = cores.destaque || '#ffd21f';
  c.fillRect(x, y, W, Math.max(3, H * 0.06));
  const txt = textoSobre(base);
  const temObs = !!rod.observacao;
  escrever(c, String(rod.validade || '').toUpperCase(), x + W / 2, y + H * (temObs ? 0.42 : 0.53), W * 0.9, H * (temObs ? 0.42 : 0.52), 700, FONTE.nome, txt);
  if (temObs) escrever(c, rod.observacao, x + W / 2, y + H * 0.8, W * 0.9, H * 0.2, 600, FONTE.texto, txt, 0.85);
  c.restore();
}

function escrever(c, texto, cx, cy, w, h, peso, familia, cor, alfa = 1) {
  let t = h;
  c.font = fonte(peso, t, familia);
  const lw = c.measureText(texto).width;
  if (lw > w) t *= w / lw;
  c.save();
  c.globalAlpha = alfa;
  c.font = fonte(peso, t, familia);
  c.fillStyle = cor;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(texto, cx, cy);
  c.restore();
}

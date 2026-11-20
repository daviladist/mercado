// Fundo do encarte: a cor do modelo com luz no meio e bordas mais fechadas.
// Sem raios de sol, pontilhado ou brilho atrás do destaque: o Eduardo achou feio (20/11). Destaque é tamanho, lugar e cor do quadro.
// Sem texturas desenhadas (madeira, lousa…) e sem desenhos decorativos: decisão do Eduardo.
// Única exceção: o tema de fogo, usado no dia D.
import { tom } from './util.js';

export function desenharFundo(c, W, H, cores, opt = {}) {
  const base = cores.fundo;
  c.save();
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  if (opt.economiaTinta) { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.restore(); return; }

  // luz no centro, bordas mais escuras
  const g = c.createRadialGradient(W / 2, H * 0.45, W * 0.05, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  g.addColorStop(0, tom(base, 0.16));
  g.addColorStop(0.55, base);
  g.addColorStop(1, tom(base, -0.38));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  c.globalAlpha = 1;
  if (opt.fogo) fogo(c, W, H);
  c.restore();
}

// Chamas na parte de baixo. Sorteio fixo: sai igual toda vez.
function fogo(c, W, H) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const camadas = [['#7a0a00', 0.34], ['#c41c00', 0.27], ['#ff5a00', 0.2], ['#ffb300', 0.12]];
  for (const [cor, alt] of camadas) {
    c.beginPath();
    c.moveTo(0, H);
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W, pico = H - H * alt * (0.55 + rnd() * 0.6);
      const xm = x - W / n / 2;
      if (i > 0) c.quadraticCurveTo(xm, H - H * alt * 0.25, x, pico);
      else c.lineTo(x, pico);
    }
    c.lineTo(W, H);
    c.closePath();
    const g = c.createLinearGradient(0, H * (1 - alt * 1.2), 0, H);
    g.addColorStop(0, cor + '00');
    g.addColorStop(0.35, cor + 'cc');
    g.addColorStop(1, cor);
    c.fillStyle = g;
    c.fill();
  }
}

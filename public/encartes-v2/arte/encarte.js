// Junta as partes e desenha o encarte inteiro numa tela (canvas).
import { desenharFundo } from './fundo.js';
import { desenharCabecalho } from './cabecalho.js';
import { desenharRodape } from './rodape.js';
import { desenharCartao, medirNome } from './cartao.js';
import { posicionar } from './diagrama.js';

export const FORMATOS = {
  feed: { w: 1080, h: 1350, nome: 'WhatsApp e Instagram' },
  story: { w: 1080, h: 1920, nome: 'Story', seguroTopo: 252, seguroBase: 340 },
  a4: { w: 2480, h: 3508, nome: 'A4 para imprimir' },
};

// enc: { formato, cores, cabecalho, rodape, produtos, fogo, economiaTinta }
export function desenharEncarte(c, enc) {
  const F = FORMATOS[enc.formato] || FORMATOS.feed;
  const W = F.w, H = F.h;
  c.canvas.width = W;
  c.canvas.height = H;
  const cores = enc.cores;
  const topo = F.seguroTopo || 0, base = F.seguroBase || 0;

  desenharFundo(c, W, H, cores, { fogo: enc.fogo, economiaTinta: enc.economiaTinta });

  // story: a faixa coberta pelo Instagram leva a cor do cabeçalho/rodapé, sem "buraco"
  if (topo) { c.fillStyle = cores.cabecalho; c.fillRect(0, 0, W, topo); }
  const cabH = Math.round(W * 0.27);
  c.save();
  c.translate(0, topo);
  desenharCabecalho(c, W, cabH, enc.cabecalho, cores);
  c.restore();

  const rodH = Math.round(W * 0.105);
  const rodY = H - base - rodH;
  if (base) { c.fillStyle = cores.cabecalho; c.fillRect(0, H - base, W, base); }

  const m = W * 0.03;
  const area = { x: m, y: topo + cabH + m * 1.1, w: W - m * 2, h: rodY - (topo + cabH) - m * 2.1 };
  const pos = posicionar(enc.produtos, area);

  // mesmo tamanho de nome dentro de cada linha e mesma reserva para a faixa "sem app"
  // a faixa "sem app" é reservada por linha: cartões lado a lado ficam com o preço do mesmo tamanho
  const faixaPorLinha = {};
  for (const p of pos) if (p.prod.precoApp != null) faixaPorLinha[p.linha] = true;
  const nomePorLinha = {};
  for (const p of pos) {
    const deitado = p.w / p.h >= 1.3;
    const pad = Math.min(p.w, p.h) * 0.045;
    const larg = deitado ? p.w * 0.54 - pad * 1.5 : p.w - pad * 2;
    const alt = deitado ? p.h * 0.34 : p.h * 0.135;
    const t = medirNome(c, p.prod.nome, larg, alt, deitado ? 3 : 2).tamanho;
    nomePorLinha[p.linha] = Math.min(nomePorLinha[p.linha] ?? Infinity, t);
  }
  for (const p of pos) {
    desenharCartao(c, p.prod, p.x, p.y, p.w, p.h, cores, { reservarFaixa: !!faixaPorLinha[p.linha], tamanhoNome: nomePorLinha[p.linha] });
  }

  desenharRodape(c, 0, rodY, W, rodH, enc.rodape, cores);
  return { W, H, posicoes: pos };
}

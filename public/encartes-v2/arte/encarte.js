// Junta as partes e desenha UMA página do encarte numa tela (canvas).
import { desenharFundo } from './fundo.js';
import { desenharCabecalho, alturaCabecalho, desenharFaixaFina } from './cabecalho.js';
import { desenharRodape, alturaRodape } from './rodape.js';
import { desenharCartao, medirNome } from './cartao.js';
import { posicionar } from './diagrama.js';

export const FORMATOS = {
  feed: { w: 1080, h: 1350, nome: 'WhatsApp e Instagram' },
  story: { w: 1080, h: 1920, nome: 'Story', seguroTopo: 252, seguroBase: 340 },
  a4: { w: 2480, h: 3508, nome: 'A4 para imprimir' },
};

// pag: { formato, tema: { estilo ('cards' | 'quadros'), cores, cabecalho, logosLado, fogo }, logos, produtos, rodape }
export function desenharPagina(c, pag) {
  const F = FORMATOS[pag.formato] || FORMATOS.feed;
  const W = F.w, H = F.h, tema = pag.tema, cores = tema.cores;
  c.canvas.width = W;
  c.canvas.height = H;
  const topo = F.seguroTopo || 0, base = F.seguroBase || 0;

  desenharFundo(c, W, H, cores, { fogo: tema.fogo });
  if (topo) { c.fillStyle = cores.cabecalho || cores.etiqueta; c.fillRect(0, 0, W, topo); }

  const verso = pag.verso && tema.versoFino !== false;
  const cabH = verso ? Math.round(W * 0.09) : alturaCabecalho(tema.cabecalho, W, H - topo - base);
  c.save();
  c.translate(0, topo);
  if (verso) desenharFaixaFina(c, W, cabH, tema.nome, pag.logos, cores);
  else desenharCabecalho(c, W, cabH, { imagem: tema.cabecalho, logos: pag.logos, logosLado: tema.logosLado }, cores);
  c.restore();

  const rodH = alturaRodape(W, pag.rodape);
  const rodY = H - base - rodH;
  if (base) { c.fillStyle = cores.rodape || cores.etiqueta; c.fillRect(0, H - base, W, base); }

  const estilo = tema.estilo || 'cards';
  const m = estilo === 'quadros' ? W * 0.008 : W * 0.025;
  const area = { x: m, y: topo + cabH + m, w: W - m * 2, h: rodY - (topo + cabH) - m * 2 };
  const pos = posicionar(pag.produtos, area, { estilo, gap: estilo === 'quadros' ? W * 0.007 : undefined });

  // nomes da mesma linha com o mesmo tamanho de letra
  const tamLinha = {};
  for (const p of pos) {
    if (p.deitado) continue;
    const pad = Math.min(p.w, p.h) * (estilo === 'quadros' ? 0.045 : 0.05);
    const t = medirNome(c, p.prod.nome, p.w - pad * 2, p.h * (estilo === 'quadros' ? 0.2 : 0.17), 2).tamanho;
    tamLinha[p.linha] = Math.min(tamLinha[p.linha] ?? Infinity, t);
  }
  for (const p of pos) desenharCartao(c, p.prod, p.x, p.y, p.w, p.h, cores, { estilo, deitado: p.deitado, destaqueLinha: p.destaqueLinha, tamanhoNome: tamLinha[p.linha] });

  desenharRodape(c, 0, rodY, W, rodH, pag.rodape || {}, cores);
  return { W, H, posicoes: pos };
}

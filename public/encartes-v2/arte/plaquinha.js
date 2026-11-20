// Plaquinha de gôndola, no padrão das que o Eduardo já imprime (Oferta Relâmpago 19/11):
// faixa branca em cima para dobrar; faixa com logos e nome da campanha; foto à esquerda, nome e preço à direita;
// rodapé com validade, código e data de impressão. Fundo branco: gasta pouca tinta.
import { FONTE, fonte, caminhoArredondado, encaixarTexto, desenharLinhas, produtoContido, imagemContida, textoSobre, tom } from './util.js';
import { desenharPreco, etiqueta, temApp } from './preco.js';

const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

// p: { nome, preco, precoApp, limite, unidade, foto, codigo, validade, pertoVencer (data AAAA-MM-DD), obs, mostrarPrecoKg, precoKg: {valor, base} }
// o: { fold (px), cores, logos, titulo, impressaEm (AAAA-MM-DD), etiqueta: bool }
export function desenharPlaquinha(c, x, y, w, h, p, o) {
  c.save();
  c.fillStyle = '#fff';
  c.fillRect(x, y, w, h);
  if (o.etiqueta) { etiquetaGondola(c, x, y, w, h, p, o); c.restore(); return; }
  const k = w / 1000;                      // escala: tudo proporcional à largura
  let yy = y;
  // dobra
  if (o.fold) {
    c.fillStyle = '#9a9a9a';
    c.font = fonte(700, 18 * k * 1.4, FONTE.texto);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('▲  DOBRE AQUI E PRENDA NO SUPORTE DA GÔNDOLA  ▲', x + w / 2, y + o.fold * 0.55);
    c.setLineDash([12 * k, 10 * k]);
    c.strokeStyle = '#bbb';
    c.lineWidth = 2 * k;
    c.beginPath(); c.moveTo(x, y + o.fold); c.lineTo(x + w, y + o.fold); c.stroke();
    c.setLineDash([]);
    yy += o.fold;
  }
  const H = y + h - yy;
  // faixa de cima: logos + nome da campanha
  const fh = H * 0.15, cor = o.cores.cabecalho || o.cores.etiqueta || '#16161a';
  c.fillStyle = cor;
  c.fillRect(x, yy, w, fh);
  c.fillStyle = o.cores.destaque || '#ffd21f';
  c.fillRect(x, yy + fh - fh * 0.06, w, fh * 0.06);
  (o.logos || []).slice(0, 2).forEach((img, i) => imagemContida(c, img, x + w * 0.02 + i * w * 0.13, yy + fh * 0.1, w * 0.12, fh * 0.76));
  ajustar(c, String(o.titulo || 'OFERTA').toUpperCase(), x + w * 0.97, yy + fh * 0.48, w * 0.6, fh * 0.62, 400, FONTE.numero, textoSobre(cor), 'right');
  yy += fh;

  // rodapé
  const rh = H * 0.07;
  const partes = [p.validade ? `Oferta válida até ${dm(p.validade)}` : '', 'Imagem meramente ilustrativa', p.codigo ? `Cód. ${p.codigo}` : '', o.impressaEm ? `Impressa em ${dm(o.impressaEm)}` : ''].filter(Boolean);
  ajustar(c, partes.join('  •  '), x + w / 2, y + h - rh * 0.5, w * 0.94, rh * 0.5, 600, FONTE.texto, '#666', 'center');
  let corpoFim = y + h - rh;
  if (p.pertoVencer) {
    const ph = H * 0.08;
    c.fillStyle = '#ffd21f';
    c.fillRect(x, corpoFim - ph, w, ph);
    ajustar(c, `PRODUTO PRÓXIMO DO VENCIMENTO  •  VALIDADE ${dm(p.pertoVencer)}/${p.pertoVencer.slice(0, 4)}`, x + w / 2, corpoFim - ph / 2, w * 0.92, ph * 0.6, 700, FONTE.nome, '#16161a', 'center');
    corpoFim -= ph;
  }
  if (p.obs) {
    const oh = H * 0.06;
    ajustar(c, p.obs, x + w / 2, corpoFim - oh / 2, w * 0.92, oh * 0.7, 700, FONTE.texto, '#333', 'center');
    corpoFim -= oh;
  }

  // corpo
  const pad = w * 0.03, cy = yy + pad * 0.6, ch = corpoFim - cy - pad * 0.4;
  const precoCores = { etiqueta: o.cores.etiquetaPlaquinha || '#d7191f', etiquetaTexto: '#fff', destaque: '#ffd21f' };
  if (p.foto) {
    const fw = w * 0.42;
    produtoContido(c, p.foto, x + pad, cy, fw - pad, ch, 'center');
    colunaTexto(c, p, x + fw + pad * 0.5, cy, w - fw - pad * 1.5, ch, precoCores);
  } else {
    const nw = w * 0.55;
    const m = encaixarTexto(c, String(p.nome).toUpperCase(), { larg: nw - pad, alt: ch * 0.9, maxLinhas: 4, max: ch * 0.3, min: 10, peso: 700, familia: FONTE.nome });
    desenharLinhas(c, m, x + pad + (nw - pad) / 2, cy + ch / 2, { peso: 700, familia: FONTE.nome, cor: '#16161a' });
    precoBloco(c, p, x + nw + pad, cy + ch * 0.12, w - nw - pad * 2, ch * 0.76, precoCores);
  }
  c.restore();
}

function colunaTexto(c, p, x, y, w, h, cores) {
  const app = temApp(p);
  const nomeH = h * (app ? 0.36 : 0.42);
  const m = encaixarTexto(c, String(p.nome).toUpperCase(), { larg: w, alt: nomeH, maxLinhas: 3, max: nomeH * 0.42, min: 10, peso: 700, familia: FONTE.nome });
  desenharLinhas(c, m, x + w / 2, y + nomeH / 2, { peso: 700, familia: FONTE.nome, cor: '#16161a' });
  precoBloco(c, p, x, y + nomeH + h * 0.04, w, h - nomeH - h * 0.04, cores);
}

function precoBloco(c, p, x, y, w, h, cores) {
  const kg = p.mostrarPrecoKg && p.precoKg;
  const ph = kg ? h * 0.84 : h;
  if (temApp(p)) desenharPreco(c, p, x, y, w, ph, cores);
  else etiqueta(c, p.preco, p.unidade, x + w * 0.04, y, w * 0.92, ph, cores.etiqueta, '#fff');
  if (kg) ajustar(c, `R$ ${p.precoKg.valor.toFixed(2).replace('.', ',')} o ${p.precoKg.base}`, x + w / 2, y + ph + (h - ph) * 0.55, w, (h - ph) * 0.7, 700, FONTE.nome, '#333', 'center');
}

// etiqueta pequena de gôndola: nome, preço grande, linha de conferência
function etiquetaGondola(c, x, y, w, h, p, o) {
  const pad = w * 0.04;
  c.strokeStyle = '#ccc';
  c.lineWidth = 1;
  c.strokeRect(x, y, w, h);
  const m = encaixarTexto(c, String(p.nome).toUpperCase(), { larg: w - pad * 2, alt: h * 0.3, maxLinhas: 2, max: h * 0.16, min: 8, peso: 700, familia: FONTE.nome });
  desenharLinhas(c, m, x + w / 2, y + pad + h * 0.15, { peso: 700, familia: FONTE.nome, cor: '#16161a' });
  etiqueta(c, p.precoApp ?? p.preco, p.unidade, x + pad, y + h * 0.36, w - pad * 2, h * 0.44, '#16161a', '#fff');
  const lin = [p.precoApp != null ? 'Preço com app' : '', p.validade ? `Válido até ${dm(p.validade)}` : '', p.codigo ? `Cód. ${p.codigo}` : ''].filter(Boolean).join('  •  ');
  ajustar(c, lin, x + w / 2, y + h * 0.9, w - pad * 2, h * 0.07, 600, FONTE.texto, '#555', 'center');
}

function ajustar(c, texto, px, cy, w, h, peso, familia, cor, alinhar) {
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

// Monta uma FOLHA (canvas) com as plaquinhas na grade do tamanho escolhido. pxmm = pixels por milímetro.
export function desenharFolha(c, tam, itens, o, pxmm = 8) {
  const W = Math.round(tam.pw * pxmm), H = Math.round(tam.ph * pxmm);
  c.canvas.width = W;
  c.canvas.height = H;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  const cw = W / tam.cols, chh = H / tam.rows;
  itens.forEach((p, i) => {
    const col = i % tam.cols, row = Math.floor(i / tam.cols);
    desenharPlaquinha(c, col * cw, row * chh, cw, chh, p, { ...o, fold: tam.fold * pxmm, etiqueta: !!tam.etiqueta });
  });
  // linhas de corte
  c.strokeStyle = '#999';
  c.setLineDash([6, 6]);
  for (let k = 1; k < tam.cols; k++) { c.beginPath(); c.moveTo(k * cw, 0); c.lineTo(k * cw, H); c.stroke(); }
  for (let r = 1; r < tam.rows; r++) { c.beginPath(); c.moveTo(0, r * chh); c.lineTo(W, r * chh); c.stroke(); }
  c.setLineDash([]);
  return { W, H };
}
export const porFolha = tam => tam.cols * tam.rows;

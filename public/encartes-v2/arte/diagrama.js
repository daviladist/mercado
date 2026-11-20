// Onde cada produto fica na arte, no espaço livre embaixo do cabeçalho.
// Destaques: cartões deitados, 2 por linha, em cima. Os outros: em pé, até 5 por linha, embaixo.
// Nunca sobra um produto sozinho numa linha de produtos normais.

export function montarLinhas(produtos) {
  const destaques = produtos.filter(p => p.destaque);
  const normais = produtos.filter(p => !p.destaque);
  const linhas = [];
  for (let i = 0; i < destaques.length; i += 2) linhas.push({ tipo: 'destaque', itens: destaques.slice(i, i + 2) });
  const n = normais.length;
  if (n) {
    const max = n <= 4 ? 4 : 5;
    const nl = Math.ceil(n / max);
    const base = Math.floor(n / nl), extra = n % nl;
    let i = 0;
    for (let l = 0; l < nl; l++) {
      const q = base + (l < extra ? 1 : 0);    // as de cima ficam com um a mais
      linhas.push({ tipo: 'normal', itens: normais.slice(i, i + q) });
      i += q;
    }
  }
  return linhas;
}

// Devolve [{ prod, x, y, w, h, linha, deitado }].
export function posicionar(produtos, area, opt = {}) {
  const linhas = montarLinhas(produtos);
  if (!linhas.length) return [];
  const gap = opt.gap ?? area.w * 0.018;
  const peso = linhas.map(l => (l.tipo === 'destaque' ? 1.25 : 1));
  const soma = peso.reduce((a, b) => a + b, 0);
  const livre = area.h - gap * (linhas.length - 1);
  // linha de produto normal não fica mais alta que larga demais: limita a altura e centraliza o bloco
  const out = [];
  let y = area.y;
  linhas.forEach((linha, li) => {
    const h = (livre * peso[li]) / soma;
    const n = linha.itens.length;
    const w = (area.w - gap * (n - 1)) / n;
    linha.itens.forEach((prod, i) => out.push({ prod, x: area.x + i * (w + gap), y, w, h, linha: li, deitado: linha.tipo === 'destaque' }));
    y += h + gap;
  });
  return out;
}

// Divide a lista em páginas de "porPagina" produtos. Os destaques vão primeiro.
export function paginar(produtos, porPagina) {
  porPagina = Math.max(1, Math.floor(porPagina || produtos.length || 1));
  const ordem = [...produtos.filter(p => p.destaque), ...produtos.filter(p => !p.destaque)];
  const paginas = [];
  for (let i = 0; i < ordem.length; i += porPagina) paginas.push(ordem.slice(i, i + porPagina));
  return paginas.length ? paginas : [[]];
}

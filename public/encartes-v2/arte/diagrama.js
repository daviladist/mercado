// Onde cada produto fica na arte.
// Hierarquia: destaques na linha de cima (cartões maiores); as linhas de baixo têm mais cartões.
// Nunca sobra um produto sozinho numa linha.

export function montarLinhas(produtos) {
  const n = produtos.length;
  if (!n) return [];
  if (n <= 3) return [produtos.slice()];
  if (n === 4) return [produtos.slice(0, 2), produtos.slice(2)];

  const destaques = produtos.filter(p => (p.peso || 1) >= 2);
  const normais = produtos.filter(p => (p.peso || 1) < 2);
  let k1 = Math.min(3, Math.max(2, destaques.length || (n >= 9 ? 3 : 2)));
  if (n - k1 < 2) k1 = n;                       // pouca coisa: tudo numa linha só
  const ordem = [...destaques, ...normais];
  const topo = ordem.slice(0, k1), resto = ordem.slice(k1);
  const linhas = [topo];
  if (!resto.length) return linhas;

  const cols = resto.length <= 6 ? 3 : 4;
  const nl = Math.ceil(resto.length / cols);
  // distribui igual; as linhas de cima ficam com menos (cartões maiores)
  const base = Math.floor(resto.length / nl), extra = resto.length % nl;
  let i = 0;
  for (let l = 0; l < nl; l++) {
    const q = base + (l >= nl - extra ? 1 : 0);
    linhas.push(resto.slice(i, i + q));
    i += q;
  }
  return linhas;
}

// Devolve [{ prod, x, y, w, h, linha }] dentro da área (x, y, w, h).
export function posicionar(produtos, area, opt = {}) {
  const linhas = montarLinhas(produtos);
  const gap = opt.gap ?? area.w * 0.018;
  const temDestaque = linhas.length > 1 && linhas[0].some(p => (p.peso || 1) >= 2);
  const pesoLinha = linhas.map((l, i) => (i === 0 && linhas.length > 1 && (temDestaque || l.length < linhas[1].length) ? 1.32 : 1));
  const soma = pesoLinha.reduce((a, b) => a + b, 0);
  const altLivre = area.h - gap * (linhas.length - 1);
  const out = [];
  let y = area.y;
  linhas.forEach((linha, li) => {
    const h = (altLivre * pesoLinha[li]) / soma;
    const w = (area.w - gap * (linha.length - 1)) / linha.length;
    linha.forEach((prod, i) => out.push({ prod, x: area.x + i * (w + gap), y, w, h, linha: li }));
    y += h + gap;
  });
  return out;
}

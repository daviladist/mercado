// Banco de produtos da Central — SÓ LEITURA neste app (regra do CLAUDE.md).
// Lê pelos mesmos endereços do app antigo, que o servidor já liga ao banco:
//   app/catalogo  -> { data: '{"itens":[{c, e, d, pv, pm}]}' }  (código, EAN, nome, preço, preço mínimo)
//   comum/imagens -> { map: { 'c:<código>': idDaFoto, 'e:<ean>': idDaFoto } }
// Foto nova que o funcionário sobe fica guardada no encarte do app novo. Mandar para o banco só depois da troca
// de app, com o Eduardo aprovando (para não mexer no banco enquanto o app novo está em teste).
import { ler } from './nuvem.js';

let BANCO = { itens: [], fotos: {}, carregado: false };

const tirarAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const palavras = s => tirarAcento(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 || /\d/.test(w));

export async function carregarBanco() {
  try {
    const [cat, img] = await Promise.all([ler('app/catalogo'), ler('comum/imagens')]);
    let c = cat && (cat.data ?? cat);
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (_) { c = null; } }
    BANCO = { itens: (c && Array.isArray(c.itens)) ? c.itens : [], fotos: (img && img.map) || {}, carregado: true };
  } catch (_) {
    BANCO = { itens: [], fotos: {}, carregado: false };
  }
  return BANCO;
}
export const banco = () => BANCO;

// variações do código de barras: caixa (DUN-14) -> unidade, zeros à esquerda
function digito(c12) { let t = 0; for (let i = 0; i < 12; i++) t += (+c12[i]) * (i % 2 ? 3 : 1); return String((10 - t % 10) % 10); }
export function variacoesEan(e) {
  const c = String(e || '').replace(/\D/g, '');
  if (c.length < 8) return [];
  const o = new Set([c]);
  if (c.length === 14) { o.add(c.slice(1)); const n = c.slice(1, 13); o.add(n + digito(n)); }
  const z = c.replace(/^0+/, '');
  if (z.length >= 8) o.add(z);
  return [...o];
}

export function fotoDoItem(it) {
  if (!it) return null;
  if (BANCO.fotos['c:' + it.c]) return BANCO.fotos['c:' + it.c];
  for (const e of variacoesEan(it.e)) if (BANCO.fotos['e:' + e]) return BANCO.fotos['e:' + e];
  return null;
}

// Acha o item do banco pelo nome colado. Só liga sozinho quando há um candidato claro.
export function procurarPorNome(nome, itens = BANCO.itens) {
  const q = palavras(nome);
  if (!q.length) return { item: null, candidatos: [] };
  const pont = [];
  for (const it of itens) {
    const n = palavras(it.d);
    if (!n.length) continue;
    let acertos = 0;
    for (const w of q) if (n.some(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))) acertos++;
    if (!acertos) continue;
    // números (400g, 5kg, 2l) precisam bater: são o tamanho do produto
    const numQ = q.filter(w => /\d/.test(w)), numN = n.filter(w => /\d/.test(w));
    if (numQ.length && numN.length && !numQ.some(w => numN.includes(w))) continue;
    pont.push({ it, nota: acertos / Math.max(q.length, n.length * 0.75) });
  }
  pont.sort((a, b) => b.nota - a.nota);
  const melhor = pont[0], segundo = pont[1];
  const claro = melhor && melhor.nota >= 0.6 && (!segundo || melhor.nota - segundo.nota >= 0.15);
  return { item: claro ? melhor.it : null, candidatos: pont.slice(0, 8).map(x => x.it) };
}

// liga o produto ao banco: { codigo, ean, nomeBanco, precoSistema, precoMinimo, fotoBanco }
export function ligar(item) {
  if (!item) return null;
  return { codigo: item.c || '', ean: item.e || '', nomeBanco: item.d || '', precoSistema: item.pv ?? null, precoMinimo: item.pm ?? null, fotoBanco: fotoDoItem(item) };
}

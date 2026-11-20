// Produtos de exemplo, só para a prévia da campanha no cadastro (nunca entram num encarte de verdade).
import { carregarImagem } from './nuvem.js';

const BASE = new URL('./demo/', import.meta.url).href;
const LISTA = [
  { nome: 'Café 3 Corações Tradicional 500g', preco: 17.98, foto: 'cafe', destaque: true, frase: 'Tá muito barato!' },
  { nome: 'Batata McCain Airfryer 600g', preco: 16.9, foto: 'mccain', destaque: true },
  { nome: 'Cerveja Brahma Chopp lata 350ml', preco: 3.49, foto: 'brahma', destaque: true },
  { nome: 'Leite em pó Piracanjuba integral 400g', preco: 21.9, precoApp: 19.9, limite: 3, foto: 'leite-po' },
  { nome: 'Achocolatado Gury 1kg', preco: 9.99, foto: 'gury' },
  { nome: 'Filezinho Sassami Sadia', preco: 24.9, unidade: 'kg', foto: 'sassami' },
  { nome: 'Mini Chicken Perdigão 1kg', preco: 22.9, foto: 'minichicken' },
  { nome: 'Big Chicken Perdigão queijo 1kg', preco: 23.9, foto: 'bigqueijo' },
  { nome: 'Bebida láctea Ibituruna chocolate 200ml', preco: 1.99, foto: 'achocolatado', repetir: true },
  { nome: 'Big Chicken Perdigão tradicional 1kg', preco: 23.9, foto: 'bigtrad' },
];

let pronto = null;
export function produtosDemo() {
  if (!pronto) pronto = Promise.all(LISTA.map(async p => ({ ...p, foto: await carregarImagem(BASE + p.foto + '.webp').catch(() => null) })));
  return pronto;
}

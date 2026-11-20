// Modelos prontos: os cabeçalhos que o Eduardo já tinha (Quinta da Carne, Quarta Imbatível, Segunda e Terça,
// Ofertas de Sábado), refeitos no formato do modelo, com o canto esquerdo livre para as logos.
// Viram um modelo novo com um toque; depois ele muda o que quiser.
import { novaCampanha } from './campanhas.js';
import { PALETAS } from './cores.js';

export const PRONTOS = [
  { arq: 'quinta-da-carne', nome: 'Quinta da Carne', dias: [4], paleta: 'carne' },
  { arq: 'quarta-imbativel', nome: 'Quarta Imbatível', dias: [3], paleta: 'preto' },
  { arq: 'segunda-e-terca', nome: 'Segunda e Terça de Ofertas', dias: [1, 2], paleta: 'vermelho' },
  { arq: 'ofertas-de-sabado', nome: 'Ofertas de Sábado', dias: [6], paleta: 'laranja' },
];

export const enderecoPronto = arq => new URL('./modelos/prontos/' + arq + '.jpg', import.meta.url).href;

export function modeloDePronto(p) {
  const c = novaCampanha();
  const { nome: _n, ...cores } = PALETAS[p.paleta];
  return Object.assign(c, { nome: p.nome, dias: [...p.dias], cabecalho: 'pronto:' + p.arq, cores: { ...c.cores, ...cores } });
}

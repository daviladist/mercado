// Os dados do app num lugar só. Toda tela lê e grava por aqui.
import { ler, gravar, END, enderecoImagem, carregarImagem } from './nuvem.js';
import { completarLoja } from './loja.js';
import { qrDoLink } from './arte/qr.js';

export const estado = {
  campanhas: [],
  logos: [],          // ids das imagens das logos (1 ou 2)
  loja: completarLoja(null),
  carregado: false,
};

export async function carregar() {
  const [c, l, lj] = await Promise.all([ler(END.campanhas), ler(END.logos), ler(END.loja)]);
  estado.loja = completarLoja(lj);
  estado.campanhas = (c && Array.isArray(c.lista)) ? c.lista : [];
  estado.logos = (l && Array.isArray(l.logos)) ? l.logos : [];
  estado.carregado = true;
}

export async function salvarCampanhas() {
  await gravar(END.campanhas, { lista: estado.campanhas });
}

export async function salvarLogos() {
  await gravar(END.logos, { logos: estado.logos });
}

// logos como imagens prontas para desenhar; sem logo cadastrada usa as do app
export async function imagensDasLogos() {
  const ids = estado.logos.length ? estado.logos.map(enderecoImagem) : [new URL('./logos/davila.png', import.meta.url).href, new URL('./logos/redeshow.png', import.meta.url).href];
  return (await Promise.all(ids.map(src => carregarImagem(src).catch(() => null)))).filter(Boolean);
}

export async function salvarLoja() {
  await gravar(END.loja, estado.loja);
}

// o rodapé de um encarte: dados da loja + validade + observação pontual daquele encarte
export async function montarRodape(validade, obsPontual = '') {
  const L = estado.loja;
  const bandeiras = L.bandeiras ? await carregarImagem(enderecoImagem(L.bandeiras)).catch(() => null) : null;
  return { validade, lojas: L.lojas, whatsapp: L.whatsapp, endereco: L.endereco, observacao: L.observacao, obsPontual, bandeiras, qr: qrDoLink(L.linkApp) };
}

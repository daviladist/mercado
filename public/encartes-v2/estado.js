// Os dados do app num lugar só. Toda tela lê e grava por aqui.
import { ler, gravar, END, enderecoImagem, carregarImagem } from './nuvem.js';

export const estado = {
  campanhas: [],
  logos: [],          // ids das imagens das logos (1 ou 2)
  carregado: false,
};

export async function carregar() {
  const [c, l] = await Promise.all([ler(END.campanhas), ler(END.logos)]);
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

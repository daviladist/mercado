// Os dados do app num lugar só. Toda tela lê e grava por aqui.
import { ler, gravar, apagar, meuId, END, enderecoImagem, carregarImagem } from './nuvem.js';
import { completarLoja } from './loja.js';
import { qrDoLink } from './arte/qr.js';

export const estado = {
  campanhas: [],
  logos: [],          // ids das imagens das logos (1 ou 2)
  loja: completarLoja(null),
  rascunho: null,     // o encarte em edição desta pessoa
  carregado: false,
};

export async function carregar() {
  const [c, l, lj] = await Promise.all([ler(END.campanhas), ler(END.logos), ler(END.loja)]);
  estado.loja = completarLoja(lj);
  try { const r = await ler(`data/users/${await meuId()}/v2-rascunho`); estado.rascunho = r && r.encarte ? r.encarte : null; } catch (_) { estado.rascunho = null; }
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

// rascunho: o encarte em edição fica salvo (abre no mesmo ponto em outro aparelho)
let tRasc = 0;
export function salvarRascunho() {
  clearTimeout(tRasc);
  tRasc = setTimeout(async () => { try { await gravar(`data/users/${await meuId()}/v2-rascunho`, { encarte: estado.rascunho }); } catch (_) { /* tenta na próxima mudança */ } }, 600);
}

// encartes salvos: guarda os últimos 30 (para baixar de novo ou reaproveitar a lista)
const RECENTES = 'comum/v2-recentes';
export async function salvarEncarte(enc) {
  const modelo = estado.campanhas.find(c => c.id === enc.modeloId);
  await gravar('salvos/v2-' + enc.id, { encarte: enc });
  const idx = (await ler(RECENTES)) || { lista: [] };
  const lista = [{ id: enc.id, nome: modelo ? modelo.nome : '', validade: enc.validade, produtos: enc.produtos.length, em: Date.now() }, ...(idx.lista || []).filter(x => x.id !== enc.id)];
  for (const velho of lista.slice(30)) { try { await apagar('salvos/v2-' + velho.id); } catch (_) { /* fica */ } }
  await gravar(RECENTES, { lista: lista.slice(0, 30) });
}
export async function encartesRecentes() { return ((await ler(RECENTES)) || { lista: [] }).lista; }
export async function abrirSalvo(id) { const r = await ler('salvos/v2-' + id); return r && r.encarte; }

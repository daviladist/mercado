// O ENCARTE que a equipe monta a partir de um modelo: produtos, validade, observação, páginas travadas.
// Só regras (sem tela), para poder testar.
import { lerLista } from './lista.js';
import { validadePadrao, textoValidade } from './campanhas.js';

let seq = 0;
const novoId = () => 'p' + Date.now().toString(36) + (seq++).toString(36);

export function novoEncarte(modelo, hoje = new Date()) {
  return { id: 'e' + Date.now().toString(36), modeloId: modelo.id, criadoEm: Date.now(), produtos: [], validade: validadePadrao(modelo, hoje), obsPontual: '', travadas: [] };
}

// junta a lista colada no encarte; devolve as linhas sem preço para avisar
export function colarLista(enc, texto, ligarNoBanco = () => null) {
  const { produtos, semPreco } = lerLista(texto);
  for (const p of produtos) enc.produtos.push({ id: novoId(), ...p, destaque: false, frase: '', limite: null, banco: ligarNoBanco(p.nome) });
  return { novos: produtos.length, semPreco };
}

export function maxDestaques(modelo) { return modelo.maxDestaques ?? 3; }

export function alternarDestaque(enc, id, modelo) {
  const p = enc.produtos.find(x => x.id === id);
  if (!p) return false;
  if (!p.destaque && enc.produtos.filter(x => x.destaque).length >= maxDestaques(modelo)) return false;
  p.destaque = !p.destaque;
  return true;
}

// Páginas: as travadas ficam como estão (mesmos produtos, mesma ordem); o resto se distribui nas seguintes.
// A capa leva modelo.porPagina.capa produtos; cada verso leva modelo.porPagina.verso.
export function paginas(enc, modelo) {
  const capa = Math.max(1, modelo.porPagina?.capa || 10), verso = Math.max(1, modelo.porPagina?.verso || capa);
  const porId = new Map(enc.produtos.map(p => [p.id, p]));
  const usados = new Set();
  const out = [];
  const travadas = enc.travadas || [];
  // trava só vale enquanto a página ainda tem algum produto da lista
  for (let i = 0; i < travadas.length; i++) {
    const ids = (travadas[i] || []).filter(id => porId.has(id));
    if (!ids.length) break;
    out.push({ produtos: ids.map(id => porId.get(id)), travada: true });
    ids.forEach(id => usados.add(id));
  }
  const resto = enc.produtos.filter(p => !usados.has(p.id));
  const ordem = [...resto.filter(p => p.destaque), ...resto.filter(p => !p.destaque)];
  let i = 0;
  while (i < ordem.length) {
    const n = out.length ? verso : capa;
    out.push({ produtos: ordem.slice(i, i + n), travada: false });
    i += n;
  }
  if (!out.length) out.push({ produtos: [], travada: false });
  return out;
}

// travar a página n congela também as anteriores (para nada mudar de lugar)
export function travar(enc, modelo, n) {
  const pags = paginas(enc, modelo);
  enc.travadas = pags.slice(0, n + 1).map(p => p.produtos.map(x => x.id));
}
export function destravar(enc, n) {
  enc.travadas = (enc.travadas || []).slice(0, n);
}

// O que TRAVA o download (dinheiro errado ou data) e o que só AVISA.
export function conferir(enc) {
  const trava = [], avisa = [];
  if (!enc.validade || !enc.validade.ini || !enc.validade.fim) trava.push({ msg: 'Falta a data da oferta.' });
  if (!enc.produtos.length) trava.push({ msg: 'O encarte está sem produtos.' });
  for (const p of enc.produtos) {
    if (!(p.preco > 0)) trava.push({ id: p.id, msg: `${p.nome}: sem preço.` });
    if (p.precoApp != null && !(p.precoApp < p.preco)) trava.push({ id: p.id, msg: `${p.nome}: preço com app tem que ser menor que o sem app.` });
    if (!p.banco) avisa.push({ id: p.id, tipo: 'banco', nome: p.nome, msg: `${p.nome}: não achei no banco (preço e foto não conferidos).` });
    else if (p.banco.precoMinimo != null && (p.precoApp ?? p.preco) < p.banco.precoMinimo - 0.004) avisa.push({ id: p.id, msg: `${p.nome}: abaixo do preço mínimo (R$ ${p.banco.precoMinimo.toFixed(2).replace('.', ',')}). Confira o custo.` });
    if (!p.fotoId && !(p.banco && p.banco.fotoBanco)) avisa.push({ id: p.id, tipo: 'foto', nome: p.nome, msg: `${p.nome}: sem foto.` });
    else if (p.fotoPequena) avisa.push({ id: p.id, msg: `${p.nome}: foto com pouca resolução, vai sair borrada.` });
  }
  return { trava, avisa, podeBaixar: !trava.length };
}

export const validadeTexto = enc => textoValidade(enc.validade);

// avisos agrupados para a tela (uma linha por tipo, em vez de uma parede de texto)
export function agruparAvisos(avisa) {
  const grupos = { banco: 'Não achei no banco (preço e foto não conferidos)', foto: 'Sem foto' };
  const out = [], junta = {};
  for (const a of avisa) {
    if (a.tipo && grupos[a.tipo]) (junta[a.tipo] = junta[a.tipo] || []).push(a.nome);
    else out.push(a.msg);
  }
  for (const [k, nomes] of Object.entries(junta)) out.unshift(`${grupos[k]}: ${nomes.length === 1 ? nomes[0] : nomes.length + ' produtos — ' + nomes.join(', ')}`);
  return out;
}

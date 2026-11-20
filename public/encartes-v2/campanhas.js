// Campanhas (temas) da loja. Regras do Eduardo (20/11/2026):
// - a lista começa vazia: o funcionário só vê campanha que o dono cadastrou;
// - toda campanha tem os dias da semana em que pode ser usada (um ou vários, ex.: segunda e terça)
//   ou "todos os dias" (ex.: Oferta Relâmpago);
// - o filtro de cima mostra as campanhas daquele dia + as de todos os dias;
// - o cabeçalho é a imagem do Photoshop, importada e salva na campanha.

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const TODOS = 'todos';

export const ESTILOS = { cards: 'Cards brancos', quadros: 'Quadros coloridos' };

export function novaCampanha() {
  return {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nome: '',
    dias: [],                 // números 0..6 (domingo = 0) ou ['todos']
    cabecalho: null,          // endereço da imagem salva na nuvem
    logosLado: true,          // logos do app por cima do cabeçalho: lado a lado (true) ou em pé (false)
    estilo: 'quadros',
    fogo: false,
    cores: { fundo: '#a50f14', cartaoDestaque: '#ffc81f', cartaoNormal: '#d5141b', etiqueta: '#16161a', etiquetaTexto: '#ffffff', pilula: '#16161a', destaque: '#ffd21f', cabecalho: '#c8161d', rodape: '#16161a' },
    versoFino: true,          // verso com faixa fininha (nome da campanha em letras) para caber mais itens
    porPagina: { capa: 10, verso: 16 },
  };
}

export const valeTodoDia = c => (c.dias || []).includes(TODOS);

// campanhas que aparecem quando o filtro está no dia "dia" (0..6). dia = null mostra todas.
export function campanhasDoDia(lista, dia) {
  if (dia == null) return [...lista];
  return lista.filter(c => valeTodoDia(c) || (c.dias || []).includes(dia));
}

// o que falta para a campanha poder ser liberada para a equipe
export function oQueFalta(c) {
  const falta = [];
  if (!String(c.nome || '').trim()) falta.push('nome da campanha');
  if (!(c.dias || []).length) falta.push('dias da semana');
  if (!c.cabecalho) falta.push('cabeçalho');
  return falta;
}
export const podeLiberar = c => oQueFalta(c).length === 0;

export function textoDias(c) {
  if (valeTodoDia(c)) return 'Todos os dias';
  const d = [...(c.dias || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!d.length) return 'Sem dia marcado';
  return d.map(i => DIAS_CURTOS[i]).join(' e ').replace(/ e (?=.* e )/g, ', ');
}

// ---------- validade automática ----------
const dd = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// Campanha de um dia: a próxima data desse dia (hoje, se for hoje). Vários dias seguidos (seg e ter): o bloco todo.
// Todos os dias: hoje. Devolve { ini, fim } no formato AAAA-MM-DD.
export function validadePadrao(c, hoje = new Date()) {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = (c.dias || []).filter(d => d !== TODOS);
  if (valeTodoDia(c) || !dias.length) return { ini: iso(h), fim: iso(h) };
  let ini = new Date(h);
  for (let i = 0; i < 7 && !dias.includes(ini.getDay()); i++) ini.setDate(ini.getDate() + 1);
  const fim = new Date(ini);
  for (let i = 0; i < 6; i++) {
    const prox = new Date(fim); prox.setDate(prox.getDate() + 1);
    if (!dias.includes(prox.getDay())) break;
    fim.setTime(prox.getTime());
  }
  return { ini: iso(ini), fim: iso(fim) };
}

export function textoValidade({ ini, fim }) {
  const a = new Date(ini + 'T12:00'), b = new Date(fim + 'T12:00');
  return ini === fim ? `Ofertas válidas apenas dia ${dd(a)}` : `Ofertas válidas de ${dd(a)} a ${dd(b)}`;
}

export function duplicarCampanha(c) {
  const n = structuredClone(c);
  n.id = novaCampanha().id;
  n.nome = (c.nome || 'Campanha') + ' (cópia)';
  return n;
}

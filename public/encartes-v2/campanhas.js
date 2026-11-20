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

// Paletas prontas para as campanhas. O dono escolhe uma e, se quiser, ajusta cor por cor.
// Ficam travadas na campanha: o funcionário não mexe.
export const PALETAS = {
  vermelho: { nome: 'Vermelho e amarelo', fundo: '#a50f14', cabecalho: '#1b1030', cartaoDestaque: '#ffc81f', cartaoNormal: '#d5141b', pilula: '#16161a', etiqueta: '#16161a', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#16161a' },
  verde: { nome: 'Verde (hortifrúti)', fundo: '#1f6b22', cabecalho: '#1f6b22', cartaoDestaque: '#6b3d1f', cartaoNormal: '#2e8b2f', pilula: '#ffffff', etiqueta: '#1f6b22', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#1f6b22' },
  carne: { nome: 'Carne (vermelho escuro)', fundo: '#3b0a0a', cabecalho: '#3b0a0a', cartaoDestaque: '#ffc81f', cartaoNormal: '#8e1116', pilula: '#16161a', etiqueta: '#8e1116', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#16161a' },
  azul: { nome: 'Azul', fundo: '#0b3d91', cabecalho: '#0b3d91', cartaoDestaque: '#ffc81f', cartaoNormal: '#1559c7', pilula: '#d7191f', etiqueta: '#d7191f', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#0b3d91' },
  preto: { nome: 'Preto e amarelo (Black)', fundo: '#141414', cabecalho: '#141414', cartaoDestaque: '#ffd21f', cartaoNormal: '#262626', pilula: '#d7191f', etiqueta: '#d7191f', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#d7191f' },
  laranja: { nome: 'Laranja', fundo: '#c4470f', cabecalho: '#c4470f', cartaoDestaque: '#ffd21f', cartaoNormal: '#e2621a', pilula: '#16161a', etiqueta: '#16161a', etiquetaTexto: '#ffffff', destaque: '#ffd21f', rodape: '#16161a' },
};

// cores que o dono pode ajustar na mão, com o nome que aparece na tela
export const CAMPOS_COR = [
  ['fundo', 'Fundo'],
  ['cartaoDestaque', 'Quadro dos destaques'],
  ['cartaoNormal', 'Quadro dos outros produtos'],
  ['pilula', 'Preço (quadros)'],
  ['etiqueta', 'Preço (cards)'],
  ['rodape', 'Rodapé'],
];

// Dados da loja: valem para todos os encartes. Só o dono mexe.
export function lojaPadrao() {
  return {
    lojas: 'Joatuba e Itarana',
    observacao: 'Ofertas válidas no período ou enquanto durarem os estoques. Imagens ilustrativas.',
    whatsapp: '',
    endereco: '',
    linkApp: '',          // QR code no rodapé: link para baixar o app da loja
    bandeiras: null,      // imagem com as bandeiras de cartão (o dono sobe)
    frases: ['Tá muito barato!', 'Só hoje!', 'Poucas unidades', 'Imperdível!'],
  };
}

// junta o que veio da nuvem com o padrão (campo novo no futuro não quebra loja antiga)
export const completarLoja = l => Object.assign(lojaPadrao(), l || {});

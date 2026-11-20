// Entende a lista que o funcionário cola (Excel, WhatsApp, bloco de notas).
// Uma linha por produto: "Nome  preço" ou "Nome  preço  preço-app" (o 2º preço é o do app).
// Número sem centavos faz parte do nome ("Ninho 400g", "Coca 2L").

const PRECO = /^(?:r\$)?\s*(\d{1,3}(?:\.\d{3})+|\d{1,5})[.,](\d{2})$/i;

// acentos que o StarIA e o teclado do celular costumam comer (só palavras sem duplo sentido)
const ACENTOS = {
  acucar: 'açúcar', feijao: 'feijão', pao: 'pão', file: 'filé', linguica: 'linguiça', cafe: 'café', frances: 'francês',
  agua: 'água', oleo: 'óleo', sabao: 'sabão', limao: 'limão', mamao: 'mamão', melao: 'melão', macarrao: 'macarrão',
  paes: 'pães', calabresa: 'calabresa', acougue: 'açougue', bebida: 'bebida', lactea: 'láctea', suino: 'suíno', suina: 'suína',
  bovino: 'bovino', tradicional: 'tradicional', file_: 'filé', pernil: 'pernil', presunto: 'presunto', mussarela: 'muçarela',
  requeijao: 'requeijão', algodao: 'algodão', higienico: 'higiênico', sanitaria: 'sanitária', maracuja: 'maracujá',
};

const UNIDADES = [
  [/\b(kg|quilo|kilo)\b\.?$/i, 'kg'],
  [/\b(bdj|bandeja)\b\.?$/i, 'bdj'],
  [/\b(dz|duzia|dúzia)\b\.?$/i, 'dz'],
  [/\b(pct|pacote)\b\.?$/i, 'pct'],
];

// kit, fardo, combo, "c/ 12", "leve 3", "cx 24" … mostram a foto repetida em cascata
const LEVE_VARIOS = /\b(kit|fardo|combo|pack|leve\s*\d+|c\/\s*\d+|com\s+\d+\s*un|cx\s*\d+|caixa\s+c\/)/i;

function limparLinha(l) {
  return String(l)
    .replace(/[*_~]/g, '')
    .replace(/^\s*(?:[-–—•·▪►▶✅✔☑🔸🔹🔥⭐➡️➡]+|\d{1,2}[).]\s)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function arrumarNome(n) {
  return n.split(' ').map(p => {
    const k = p.toLowerCase();
    const a = ACENTOS[k];
    if (!a) return p;
    if (p === p.toUpperCase()) return a.toUpperCase();
    return p[0] === p[0].toUpperCase() ? a[0].toUpperCase() + a.slice(1) : a;
  }).join(' ');
}

export function lerPreco(t) {
  const m = PRECO.exec(String(t).trim());
  if (!m) return null;
  return Number(m[1].replace(/\./g, '') + '.' + m[2]);
}

// Devolve { produtos: [...], semPreco: ['linha', ...] }
export function lerLista(texto) {
  const produtos = [], semPreco = [];
  for (const bruta of String(texto || '').replace(/\r/g, '').split('\n')) {
    let l = limparLinha(bruta);
    if (!l) continue;
    // Excel e planilhas: tab ou ponto e vírgula viram espaço
    l = l.replace(/[\t;]+/g, ' ').replace(/\s+/g, ' ').trim();
    const partes = l.split(' ');
    const precos = [];
    while (partes.length > 1 && precos.length < 2) {
      let ult = partes[partes.length - 1];
      if (/^r\$$/i.test(partes[partes.length - 2] || '') && PRECO.test(ult)) { /* "R$ 4,99" */ }
      const v = lerPreco(ult);
      if (v == null) break;
      precos.unshift(v);
      partes.pop();
      if (/^r\$$/i.test(partes[partes.length - 1] || '')) partes.pop();
    }
    let nome = partes.join(' ').replace(/[\s\-–:=]+$/, '').trim();
    if (!precos.length) { if (/[a-zà-ú]/i.test(l)) semPreco.push(l); continue; }
    if (!nome) continue;
    let unidade = 'un';
    for (const [re, u] of UNIDADES) if (re.test(nome)) { unidade = u; nome = nome.replace(re, '').trim(); break; }
    const p = { nome: arrumarNome(nome), preco: Math.max(...precos), unidade };
    if (precos.length === 2 && precos[0] !== precos[1]) p.precoApp = Math.min(...precos);
    if (LEVE_VARIOS.test(nome)) p.repetir = true;
    produtos.push(p);
  }
  return { produtos, semPreco };
}

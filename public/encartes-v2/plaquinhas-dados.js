// Plaquinhas de gôndola: tamanhos, preço por kg/L, registro das impressas, vencidas e conferência com o sistema.
// Só regras (sem tela), para poder testar.

// Tamanhos (em mm). fold = espaço em branco em cima para dobrar e prender no suporte da gôndola.
export const TAMANHOS = [
  { id: 'a5', nome: 'Meia folha — 2 por folha A4', folha: 'a4', cols: 1, rows: 2, pw: 210, ph: 297, fold: 28 },
  { id: 'a4', nome: 'Folha inteira — 1 por folha A4 (deitada)', folha: 'a4', deitada: true, cols: 1, rows: 1, pw: 297, ph: 210, fold: 30 },
  { id: 'a6', nome: 'Pequena — 4 por folha A4', folha: 'a4', cols: 2, rows: 2, pw: 210, ph: 297, fold: 18 },
  { id: 'a3', nome: 'Cartaz A3 — 1 por folha A3 (deitada)', folha: 'a3', deitada: true, cols: 1, rows: 1, pw: 420, ph: 297, fold: 34 },
  { id: 'etq', nome: 'Etiqueta de gôndola — 8 por folha', folha: 'a4', cols: 2, rows: 4, pw: 210, ph: 297, fold: 0, etiqueta: true },
];
export const tamanho = id => TAMANHOS.find(t => t.id === id) || TAMANHOS[0];

// ---------- preço por kg ou litro (CDC) ----------
// tira o tamanho do nome: "Café 500g" -> 0,5 kg; "Coca 2L" -> 2 L; "Cerveja 350ml c/ 12" -> 4,2 L
export function medidaDoNome(nome) {
  const t = String(nome || '').toLowerCase().replace(/,/g, '.');
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|litros?|ml)\b/.exec(t);
  if (!m) return null;
  let q = parseFloat(m[1]);
  const u = m[2];
  let base = 'kg';
  if (u === 'g' || u === 'gr') q /= 1000;
  else if (u === 'ml') { q /= 1000; base = 'L'; }
  else if (u.startsWith('l')) base = 'L';
  const mult = /(?:c\/|com|cx|fardo|pack|leve)\s*(\d{1,3})\b|\b(\d{1,3})\s*x\b/.exec(t);
  if (mult) q *= parseInt(mult[1] || mult[2], 10);
  return q > 0 ? { quantidade: q, base } : null;
}

// "R$ 35,96 o kg"; null quando não dá para saber (ou quando já é vendido por kg)
export function precoPorMedida(prod) {
  if (prod.unidade === 'kg') return null;
  const m = medidaDoNome(prod.nome);
  if (!m || Math.abs(m.quantidade - 1) < 1e-9) return null;   // 1 kg ou 1 L: o preço já é por kg/L
  const v = (prod.precoApp ?? prod.preco) / m.quantidade;
  return { valor: Math.round(v * 100) / 100, base: m.base };
}

// ---------- registro das impressas ----------
// cada item: { id, nome, preco, precoApp, codigo, ean, validade (AAAA-MM-DD), impressaEm (ms), retirada: false }
export function registrar(registro, plaquinhas, agora = Date.now()) {
  const novos = plaquinhas.map(p => ({ id: p.id + '-' + agora, nome: p.nome, preco: p.preco, precoApp: p.precoApp ?? null, codigo: p.banco?.codigo || '', ean: p.banco?.ean || '', validade: p.validade || '', impressaEm: agora, retirada: false }));
  return [...novos, ...registro].slice(0, 500);
}

const dia = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

// plaquinhas que já passaram da validade e ainda não foram marcadas como retiradas
export function vencidas(registro, hoje = new Date()) {
  const h = dia(hoje);
  return registro.filter(r => !r.retirada && r.validade && r.validade < h);
}
export function vencemHoje(registro, hoje = new Date()) {
  const h = dia(hoje);
  return registro.filter(r => !r.retirada && r.validade === h);
}

// gôndola × sistema: plaquinha ainda na gôndola com preço diferente do que o caixa cobra (preço do banco)
export function conferirGondola(registro, precoNoSistema, hoje = new Date()) {
  const h = dia(hoje);
  return registro.filter(r => !r.retirada && (!r.validade || r.validade >= h)).map(r => {
    const s = precoNoSistema(r);
    const placa = r.precoApp ?? r.preco;
    return s == null ? null : Math.abs(s - placa) > 0.009 ? { ...r, precoSistema: s, precoPlaca: placa } : null;
  }).filter(Boolean);
}

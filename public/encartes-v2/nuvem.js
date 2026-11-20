// Onde o app guarda as coisas.
// Dentro do Tino: usa as rotas /api/encartes/* (as mesmas do app antigo), em endereços NOVOS do app v2,
// para não mexer em nada do que já existe. Os endereços "app/..." só o administrador grava.
// Fora do Tino (prova no computador): guarda no próprio navegador.

export const END = {
  campanhas: 'app/v2-campanhas',   // { lista: [campanha...] }
  logos: 'app/v2-logos',           // { logos: [idDaImagem, ...] }
};

const noTino = () => typeof window !== 'undefined' && window.TINO && typeof window.TINO.api === 'function';
const memoria = {};
const local = {
  ler(p) { try { const v = localStorage.getItem('encv2:' + p); return v ? JSON.parse(v) : (memoria[p] ?? null); } catch (_) { return memoria[p] ?? null; } },
  gravar(p, d) { memoria[p] = d; try { localStorage.setItem('encv2:' + p, JSON.stringify(d)); } catch (_) { /* sem espaço: fica só na memória */ } },
};

export async function ler(p) {
  if (!noTino()) return local.ler(p);
  const r = await window.TINO.api('/api/encartes/doc?p=' + encodeURIComponent(p));
  return r.exists ? r.data : null;
}

export async function gravar(p, data) {
  if (!noTino()) return local.gravar(p, data);
  await window.TINO.api('/api/encartes/doc', { p, data });
}

// Imagem: devolve um "id" para guardar na campanha. No Tino, a imagem sobe para a nuvem.
export async function subirImagem(dataURL) {
  if (!noTino()) { const id = 'local:' + Math.random().toString(36).slice(2); local.gravar('img/' + id, dataURL); return id; }
  const r = await window.TINO.api('/api/encartes/blob', { data: dataURL });
  return r.id;
}

export function enderecoImagem(id) {
  if (!id) return null;
  if (String(id).startsWith('local:')) return local.ler('img/' + id);
  return '/api/encartes/blob?id=' + encodeURIComponent(id);
}

const cacheImg = new Map();
export function carregarImagem(src) {
  if (!src) return Promise.resolve(null);
  if (cacheImg.has(src)) return cacheImg.get(src);
  const p = new Promise((ok, erro) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => { cacheImg.delete(src); erro(new Error('Não consegui abrir a imagem.')); };
    i.src = src;
  });
  cacheImg.set(src, p);
  return p;
}

// Lê um arquivo escolhido pela pessoa, reduz para no máximo "larg" de largura e devolve data URL.
export async function arquivoParaDataURL(arquivo, larg = 2160) {
  const url = await new Promise((ok, erro) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = erro; f.readAsDataURL(arquivo); });
  const img = await carregarImagem(url);
  if (img.width <= larg) return { dataURL: url, w: img.width, h: img.height };
  const k = larg / img.width, cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k);
  cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const png = /png/i.test(arquivo.type);
  return { dataURL: cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w: cv.width, h: cv.height };
}

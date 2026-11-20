// Onde o app guarda as coisas.
// Dentro do Tino: usa as rotas /api/encartes/* (as mesmas do app antigo), em endereços NOVOS do app v2,
// para não mexer em nada do que já existe. Os endereços "app/..." só o administrador grava.
// Fora do Tino (prova no computador): guarda no próprio navegador.

export const END = {
  campanhas: 'app/v2-campanhas',   // { lista: [campanha...] }
  logos: 'app/v2-logos',           // { logos: [idDaImagem, ...] }
  loja: 'app/v2-loja',             // dados da loja (rodapé, QR do app, frases)
};

// Dentro do Tino sem mexer no servidor: o app abre em /encartes-v2/?t=<empresa> e usa a mesma sessão
// (o mesmo login) do app atual. As chamadas vão para as mesmas rotas /api/encartes/*.
if (typeof window !== 'undefined' && !window.TINO) {
  const slug = new URLSearchParams(location.search).get('t');
  if (slug && /^[a-z0-9-]{1,40}$/.test(slug)) {
    window.TINO = {
      slug,
      async api(path, body) {
        const h = { 'X-App': '1', 'X-Tenant': slug };
        const opt = body === undefined ? { credentials: 'same-origin', headers: h } : { method: 'POST', credentials: 'same-origin', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
        let r;
        try { r = await fetch(path, opt); } catch (_) { throw new Error('Sem internet. Confira a conexão.'); }
        let j = {};
        try { j = await r.json(); } catch (_) { /* vazio */ }
        if (r.status === 401) { location.href = '/t/' + slug + '/'; throw new Error('Entre com seu usuário e volte para este link.'); }
        if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
        return j;
      },
    };
  }
}
const noTino = () => typeof window !== 'undefined' && window.TINO && typeof window.TINO.api === 'function';
const memoria = {};
const local = {
  ler(p) { try { const v = localStorage.getItem('encv2:' + p); return v ? JSON.parse(v) : (memoria[p] ?? null); } catch (_) { return memoria[p] ?? null; } },
  gravar(p, d) { memoria[p] = d; try { localStorage.setItem('encv2:' + p, JSON.stringify(d)); } catch (_) { /* sem espaço: fica só na memória */ } },
};

// id de quem está usando (para o rascunho de cada pessoa)
let _me = null;
let _dono = true;
export async function meuId() {
  if (_me) return _me;
  if (!noTino()) return (_me = 'local');
  const r = await window.TINO.api('/api/encartes/me');
  _dono = !!r.dono;
  return (_me = r.id);
}
// dono (administrador) vê Modelos, Dados da loja e Logos; funcionário só faz encarte e plaquinha
export async function souDono() { await meuId(); return _dono; }

export async function apagar(p) {
  if (!noTino()) { delete memoria[p]; try { localStorage.removeItem('encv2:' + p); } catch (_) { /* nada */ } return; }
  await window.TINO.api('/api/encartes/doc', { p, del: true });
}

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
  if (String(id).startsWith('pronto:')) return new URL('./modelos/prontos/' + String(id).slice(7) + '.jpg', import.meta.url).href;
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

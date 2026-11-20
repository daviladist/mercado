// Pequenas ajudas das telas.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tToast = 0;
export function avisar(msg, ms = 2600) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(tToast);
  tToast = setTimeout(() => { el.hidden = true; }, ms);
}

export function escolherArquivo(aceita = 'image/*') {
  return new Promise(ok => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = aceita;
    i.onchange = () => ok(i.files[0] || null);
    i.click();
  });
}

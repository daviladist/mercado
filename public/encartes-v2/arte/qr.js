// QR code desenhado numa tela pequena (usa a biblioteca qrcode-generator que já vem no Tino, em /vendor).
const cache = new Map();
export function qrDoLink(link) {
  if (!link || typeof window === 'undefined' || typeof window.qrcode !== 'function') return null;
  if (cache.has(link)) return cache.get(link);
  const q = window.qrcode(0, 'M');
  q.addData(link);
  q.make();
  const n = q.getModuleCount(), m = 2, k = 8, cv = document.createElement('canvas');
  cv.width = cv.height = (n + m * 2) * k;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) c.fillRect((col + m) * k, (r + m) * k, k, k);
  cache.set(link, cv);
  return cv;
}

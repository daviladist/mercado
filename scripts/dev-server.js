'use strict';
/* Servidor local para testar: serve public/ e a API no mesmo endereço (como na Vercel). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle } = require('../lib/api');
const PUB = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml' };
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const headersFor = p => (vercel.headers || []).filter(h => new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*') + '$').test(p)).flatMap(h => h.headers);
http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p.startsWith('/api/')) return handle(req, res);
  let f = path.join(PUB, p === '/' ? 'index.html' : p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  headersFor(p).forEach(h => res.setHeader(h.key, h.value));
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));

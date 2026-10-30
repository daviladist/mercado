'use strict';
/*
 * Gera lib/core.generated.js a partir do código do app (src/app.source.html):
 * copia as MESMAS funções de preço, margem, comissão, negociação e estoque que o
 * navegador usa, para o servidor recalcular tudo sem confiar no navegador.
 * Rodar sempre que mudar regra de preço no app: node scripts/build-core.js
 */
const fs = require('fs');
const path = require('path');
const ts = require(process.env.TS_PATH || 'typescript');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/app.source.html'), 'utf8');
const start = src.indexOf('<script>\n(function(){');
const end = src.indexOf('})();\n</script>', start);
const code = src.slice(start + '<script>\n(function(){'.length, end);
const sf = ts.createSourceFile('app.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

const ROOTS = `priceFor calcCartFor cartItems cartSub pickupDisc cartTotal negCfg negAllowed negState negEval negApply
refCOf lockCost orderTotals reTotal anItemCalc itemCommRate polMin pCommOwn catComm lnCommRate lnLock lnMargin lnTarget lnItemLevel lnItemMin mgTol
effCost itemProduct itemCost orderIeSale syncStock autoReceivables addEvent statusMsg payOptions creditInfo allowedPays isCash
tableOf packOf isKg baseOf resolveCart comboAsProduct withOner withIe withClient noDisc ieClient ieF needsBill billGate
sellerById cityById OPEN origQ today recStatus splitParcels parseDays daysFromPay addDays setOrderStatus itemNet orderComm pickAmt
setV hasVal ownComm brl onerOn`.split(/\s+/).filter(Boolean);
// nomes que o servidor fornece (não copiar)
const PROVIDED = new Set(['S', 'ui', 'uid']);

const decls = new Map(); // nome -> {text, idx, refs}
sf.statements.forEach((st, idx) => {
  let names = [];
  if (ts.isFunctionDeclaration(st) && st.name) names = [st.name.text];
  else if (ts.isVariableStatement(st)) names = st.declarationList.declarations.filter(d => ts.isIdentifier(d.name)).map(d => d.name.text);
  else return;
  const refs = new Set();
  const walk = n => { if (ts.isIdentifier(n)) refs.add(n.text); ts.forEachChild(n, walk); };
  walk(st);
  const text = st.getFullText(sf);
  names.forEach(nm => { if (!PROVIDED.has(nm)) decls.set(nm, { text, idx, refs, names }); });
});
const need = new Set(), queue = [...ROOTS];
const missing = [];
while (queue.length) {
  const n = queue.pop();
  if (need.has(n)) continue;
  const d = decls.get(n);
  if (!d) { missing.push(n); continue; }
  need.add(n);
  d.refs.forEach(r => { if (decls.has(r) && !need.has(r)) queue.push(r); });
}
if (missing.length) { console.error('Faltam no app:', missing.join(', ')); process.exit(1); }
const idxs = [...new Set([...need].map(n => decls.get(n).idx))].sort((a, b) => a - b);
let body = idxs.map(i => sf.statements[i].getFullText(sf)).join('\n');
// globais de navegador que não existem no servidor
const BROWSER = ['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'location', 'fetch', 'alert', 'confirm', 'prompt'];
const usedBrowser = BROWSER.filter(g => new RegExp('\\b' + g + '\\b').test(body));
const out = `'use strict';
/* GERADO por scripts/build-core.js a partir de src/app.source.html. Não editar à mão. */
module.exports = function makeCore(S, ui, uid) {
${usedBrowser.map(g => `  const ${g} = undefined;`).join('\n')}
  const $ = () => null, $$ = () => [], toast = () => {}, render = () => {}, save = () => {};
${body}
  return { ${[...need].sort().join(', ')} };
};
`;
fs.writeFileSync(path.join(ROOT, 'lib/core.generated.js'), out);
console.log('core.generated.js:', need.size, 'declarações,', Math.round(out.length / 1024), 'KB; globais de navegador neutralizados:', usedBrowser.join(', ') || 'nenhum');

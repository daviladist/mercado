'use strict';
/*
 * Monta public/index.html a partir do código do app (src/app.source.html):
 *  - tira qualquer senha e dado de exemplo do código;
 *  - troca o login feito no navegador pelo login no servidor;
 *  - troca o "salvar no navegador" por "enviar para o servidor" (que confere tudo);
 *  - trava de margem e negociação passam a ser calculadas no servidor.
 * A interface continua a mesma.  Rodar: node scripts/build-app.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(ROOT, 'src/app.source.html'), 'utf8');
const client = fs.readFileSync(path.join(ROOT, 'src/server-client.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/receber.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/importar.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src/pdv.js'), 'utf8');
let n = 0;
const EXPECTED = 65;      // número de trocas deste arquivo: mude junto quando incluir/tirar uma
const COUNT_LS = 3;      // gravações antigas no aparelho espalhadas pelo código (depois de tirar o save antigo)
// cada troca TEM que casar o número exato de vezes: se o código-fonte mudou, o build para (nada falha em silêncio)
function R(a, b, count = 1) {
  const c = s.split(a).length - 1;
  if (c !== count) { console.error(`Trecho encontrado ${c}x (esperado ${count}):\n${a.slice(0, 160)}`); process.exit(1); }
  s = s.split(a).join(b); n++;
}
function RX(re, fn, count = 1) {
  const c = (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
  if (c !== count) { console.error(`Expressão encontrada ${c}x (esperado ${count}): ${re}`); process.exit(1); }
  s = s.replace(re, fn); n++;
}

// ---------- 1. o código-fonte já não tem senha nem dado de exemplo (a conferência no fim garante)

// ---------- 2. estado vem do servidor; nada fica guardado no aparelho
R('const uid=()=>Math.random().toString(36).slice(2,9);', 'const uid=()=>Math.random().toString(36).slice(2,9);\n' + client);
R("let S; try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}", "let S=emptyState();try{localStorage.removeItem(KEY);localStorage.removeItem('pa-driver')}catch(e){}");
R("if(window.__SEED&&window.__SEED.products&&(!S||!S.products||S._seed!==window.__SEED_ID)){S=JSON.parse(JSON.stringify(window.__SEED));S._seed=window.__SEED_ID;try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}\n", '');
R('if(!S||!S.products) S=seed();\n', '');
RX(/^function save\(\)\{try\{localStorage\.setItem\(KEY,JSON\.stringify\(S\)\)\}.*\n/m, () => '');
RX(/^function reloadState\(\)\{try\{const n=JSON\.parse\(localStorage\.getItem\(KEY\)\).*\n/m, () => '');
// mudanças de versão antigas gravavam direto no aparelho: agora não gravam nada
R("try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}", '', COUNT_LS);

// ---------- 3. login no servidor (cada papel)
R(`    \${isAdmin?'':'<div class="hint">Para testar: usuário <b>cliente</b>, senha <b>1234</b>. Os acessos dos clientes são criados por você no painel do administrador.</div>'}`,
  `    <div class="hint">\${isAdmin?'':'Esqueceu a senha? Fale com a loja.'}</div>\${srvTeamLinks(isAdmin?'admin':'cliente')}`);
RX(/function bindLogin\(isAdmin\)\{\n  \$\('#lf'\)\.onsubmit=e=>\{e\.preventDefault\(\);\n[\s\S]*?\n  \};\n\}/, () => "function bindLogin(isAdmin){srvBindTeamLinks();if(isAdmin)srvMaybeSetup();\n  $('#lf').onsubmit=e=>{e.preventDefault();srvLogin(isAdmin?'admin':'cliente',$('#lu').value.trim(),$('#lp').value,$('#le'),$('#lf button[type=submit]'))};\n}");
R(`    <div class="hint">Os acessos de conferente são criados pelo administrador em CADASTROS &gt; Conferentes.</div></form>\``, `    <div class="hint">Os acessos de conferente são criados pelo administrador em CADASTROS &gt; Conferentes.</div>\${srvTeamLinks('conf')}</form>\``);
R(`if(!ui.checker){app.innerHTML=confLoginForm();$('#cfl').onsubmit=e=>{e.preventDefault();const u=$('#cflu').value.trim().toLowerCase(),p=$('#cflp').value;
    const k=(S.checkers||[]).find(x=>x.login.toLowerCase()===u&&x.pass===p);if(!k){$('#cfle').textContent='Usuário ou senha incorretos.';return}ui.checker=k.name||k.login;ui.confOrder=null;render()};return}`,
  `if(!ui.checker){app.innerHTML=confLoginForm();srvBindTeamLinks();$('#cfl').onsubmit=e=>{e.preventDefault();srvLogin('conferente',$('#cflu').value.trim(),$('#cflp').value,$('#cfle'),$('#cfl button[type=submit]'))};return}`);
R(`  if(!ui.driver){try{const k=localStorage.getItem('pa-driver');if(k&&drvById(k))ui.driver=k}catch(e){}}\n`, '');
R(`<div class="err" id="dvle"></div><button class="btn block" type="submit">Entrar</button><div class="hint">O acesso é criado pelo administrador em CADASTROS &gt; Motoristas e veículos.</div></form>\`;`,
  `<div class="err" id="dvle"></div><button class="btn block" type="submit">Entrar</button><div class="hint">O acesso é criado pelo administrador em CADASTROS &gt; Motoristas e veículos.</div>\${srvTeamLinks('ent')}</form>\`;srvBindTeamLinks();`);
R(`$('#dvl').onsubmit=e=>{e.preventDefault();const u=$('#dvlu').value.trim().toLowerCase(),p=$('#dvlp').value,k=drvList().find(v=>v.login&&v.login.toLowerCase()===u&&v.pass===p);if(!k){$('#dvle').textContent='Usuário ou senha incorretos.';return}ui.driver=k.id;try{localStorage.setItem('pa-driver',k.id)}catch(e){}render()};return}`,
  `$('#dvl').onsubmit=e=>{e.preventDefault();srvLogin('entregador',$('#dvlu').value.trim(),$('#dvlp').value,$('#dvle'),$('#dvl button[type=submit]'))};return}`);
R(`    <div class="hint">Os acessos de faturamento são criados pelo administrador em CADASTROS &gt; Faturamento.</div></form>\``, `    <div class="hint">Os acessos de faturamento são criados pelo administrador em CADASTROS &gt; Faturamento.</div>\${srvTeamLinks('fat')}</form>\``);
R(`if(!ui.biller){app.innerHTML=fatLoginForm();$('#fbl').onsubmit=e=>{e.preventDefault();const u=$('#fblu').value.trim().toLowerCase(),p=$('#fblp').value;
    const k=(S.billers||[]).find(x=>x.login.toLowerCase()===u&&x.pass===p);if(!k){$('#fble').textContent='Usuário ou senha incorretos.';return}ui.biller=k.name||k.login;render()};return}`,
  `if(!ui.biller){app.innerHTML=fatLoginForm();srvBindTeamLinks();$('#fbl').onsubmit=e=>{e.preventDefault();srvLogin('faturamento',$('#fblu').value.trim(),$('#fblp').value,$('#fble'),$('#fbl button[type=submit]'))};return}`);
R(`    <div class="hint">O acesso do vendedor é criado pelo administrador em CADASTROS &gt; Vendedores.</div></form>\``, `    <div class="hint">O acesso do vendedor é criado pelo administrador em CADASTROS &gt; Vendedores.</div>\${srvTeamLinks('vend')}</form>\``);
R(`if(!ui.seller){app.innerHTML=vendLoginForm();$('#vdl').onsubmit=e=>{e.preventDefault();const u=$('#vdlu').value.trim().toLowerCase(),p=$('#vdlp').value;
    const k=(S.sellers||[]).find(x=>x.login&&x.login.toLowerCase()===u&&x.pass===p&&x.active!==false);if(!k){$('#vdle').textContent='Usuário ou senha incorretos, ou acesso desativado.';return}ui.seller=k.id;ui.vtab='pedidos';ui.lanc=null;render()};return}`,
  `if(!ui.seller){app.innerHTML=vendLoginForm();srvBindTeamLinks();$('#vdl').onsubmit=e=>{e.preventDefault();srvLogin('vendedor',$('#vdlu').value.trim(),$('#vdlp').value,$('#vdle'),$('#vdl button[type=submit]'))};return}`);
R("const me=SVme();if(!me||me.active===false){ui.seller=null;renderVend();return}", "const me=SVme();if(!me||me.active===false){if(SRV.me){$('#app').innerHTML='<div class=\"empty\">Seu acesso de vendedor está desativado. Fale com a loja.</div>';return}ui.seller=null;renderVend();return}");

// ---------- 4. sair = encerrar a sessão no servidor
R("if(me)$('#vdOut').onclick=()=>{ui.seller=null;ui.lanc=null;render()};", "if(me)$('#vdOut').onclick=srvLogout;");
R("if(ui.biller)$('#fbOut').onclick=()=>{ui.biller=null;ui.fat=null;render()};", "if(ui.biller)$('#fbOut').onclick=srvLogout;");
R("if(ui.driver)$('#dvOut').onclick=()=>{ui.driver=null;try{localStorage.removeItem('pa-driver')}catch(e){}render()};", "if(ui.driver)$('#dvOut').onclick=srvLogout;");
R("if(ui.checker)$('#cfOut').onclick=()=>{ui.checker=null;ui.confOrder=null;render()};", "if(ui.checker)$('#cfOut').onclick=srvLogout;");
R("if(ui.admin)$('#admOut').onclick=()=>{ui.admin=false;render()};\n  }\n}",
  "if(ui.admin)$('#admOut').onclick=srvLogout;\n  }\n  if(SRV.me&&ui.view!=='cliente'){const o=t.querySelector('.iconbtn');if(o){const b=document.createElement('button');b.className='iconbtn';b.textContent='Senha';b.onclick=srvPassScreen;o.before(b)}}\n}");
R("    $('#logout').onclick=()=>{ui.client=null;ui.cart={};render()};", "    $('#logout').onclick=srvLogout;");
R("\n  $('#logout').onclick=()=>{ui.client=null;ui.cart={};render()};", "\n  $('#logout').onclick=srvLogout;{const b=document.createElement('button');b.className='btn ghost';b.style.minHeight='40px';b.textContent='Trocar senha';b.onclick=srvPassScreen;$('#logout').before(b)}");

// ---------- 5. cada pessoa fica na tela do seu papel; troca de tela só antes de entrar
R("function render(){\n", "function render(){if(SRV.me&&!SRV.me.mustReset)ui.view=PDV_PATH&&(SRV.me.role==='admin'||SRV.me.role==='operador_caixa')?'pdv':(ROLE_VIEW[SRV.me.role]||ui.view);\n");
RX(/\/\* outra aba do mesmo navegador salvou[\s\S]*?\nrender\(\);\n\}\)\(\);/, () => `window.addEventListener('hashchange',()=>{if(!SRV.me){ui.view=srvHashView();render()}});
ui.view=srvHashView();render();
(async()=>{try{await srvLoadBrand();render()}catch(e){return}try{const me=await api('/api/me');if(CLIENT_ONLY&&me.role!=='cliente')return;SRV.me=me;if(me.mustReset){srvResetScreen();return}await loadState();srvAfterLogin()}catch(e){if(e.status&&e.status!==401)toast(e.message)}})();
window.addEventListener('pagehide',()=>{try{const d=srvDiff();if(SRV.me&&d.ch.length&&!SRV.busy)fetch('/api/sync',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json','X-App':'1','X-Tenant':TSLUG||'@'},body:JSON.stringify({changes:d.ch,order:d.order})})}catch(e){}});
})();`);

// ---------- 6. senhas: só para DEFINIR (nunca aparecem)
R("<span class=\"small muted\">Usuário: ${esc(k.login)} · Senha: ${esc(k.pass)}</span></div>\n      ${ui.confirmDel==='ck'+k.id", "<span class=\"small muted\">Usuário: ${esc(k.login)} · ${srvPassLabel(k)}</span></div>\n      ${ui.confirmDel==='ck'+k.id");
R("<span class=\"small muted\">Usuário: ${esc(k.login)} · Senha: ${esc(k.pass)}</span></div>\n      ${ui.confirmDel==='fk'+k.id", "<span class=\"small muted\">Usuário: ${esc(k.login)} · ${srvPassLabel(k)}</span></div>\n      ${ui.confirmDel==='fk'+k.id");
R("${v.login?' · acesso de entregador: '+esc(v.login)+' / '+esc(v.pass):' · sem acesso ao app'}", "${v.login?' · acesso de entregador: '+esc(v.login)+' · '+srvPassLabel(v):' · sem acesso ao app'}");
R("Acesso: <b>${esc(x.login)}</b> · senha ${esc(x.pass||'')}", "Acesso: <b>${esc(x.login)}</b> · ${srvPassLabel(x)}");
R("<span class=\"small muted\">Usuário: ${esc(x.login)} · Senha: ${esc(x.pass)}${x.phone?", "<span class=\"small muted\">Usuário: ${esc(x.login)} · ${srvPassLabel(x)}${x.phone?");
R(`<input type="text" id="cp" value="\${esc(e.pass)}" required>`, `<input type="password" id="cp" value="" autocomplete="new-password" placeholder="\${e.id&&e.hasPass?'Em branco = manter a senha atual':'Senha base (mín. 8): a pessoa troca no 1º acesso'}">`);
R("pass:Math.floor(1000+Math.random()*9000).toString(),phone:''", "pass:'',phone:''");
R("const cu={...e,id:e.id||uid(),name,login,pass:$('#cp').value,", "if($('#cp').value&&$('#cp').value.length<8){$('#cerr').textContent='A senha precisa ter pelo menos 8 caracteres.';return}\n      const cu={...e,id:e.id||uid(),name,login,pass:$('#cp').value,");
R(`<input type="text" id="slpw" value="\${esc(E.pass||(E.id?'':String(Math.floor(1000+Math.random()*9000))))}">`, `<input type="password" id="slpw" value="" autocomplete="new-password" placeholder="\${E.id&&E.hasPass?'Em branco = manter a senha atual':'Senha base (mín. 8): a pessoa troca no 1º acesso'}">`);
R("if(lg&&!pw){$('#slerr').textContent='Informe a senha do vendedor.';return}", "if(lg&&!pw&&!E.hasPass){$('#slerr').textContent='Informe a senha do vendedor.';return}if(pw&&pw.length<8){$('#slerr').textContent='A senha precisa ter pelo menos 8 caracteres.';return}");
R("if(!n||!l||!p){$('#ckerr').textContent='Preencha nome, usuário e senha.';return}", "if(!n||!l||!p){$('#ckerr').textContent='Preencha nome, usuário e senha.';return}if(p.length<8){$('#ckerr').textContent='A senha precisa ter pelo menos 8 caracteres.';return}");
R("if(!n||!l||!p){$('#fkerr').textContent='Preencha nome, usuário e senha.';return}", "if(!n||!l||!p){$('#fkerr').textContent='Preencha nome, usuário e senha.';return}if(p.length<8){$('#fkerr').textContent='A senha precisa ter pelo menos 8 caracteres.';return}");
R("if(lg&&loginTaken(lg)){toast('O usuário \"'+lg+'\" já é usado por outra pessoa. Escolha outro.');return}", "if(lg&&loginTaken(lg)){toast('O usuário \"'+lg+'\" já é usado por outra pessoa. Escolha outro.');return}if(lg&&($('#vpas').value||'').trim().length<8){toast('A senha do motorista precisa ter pelo menos 8 caracteres.');return}");


// ---------- 6b. botão "Redefinir senha" em cada pessoa e senha base nos formulários
R("data-ckdel=\"${k.id}\">Excluir</button>`}</div>`).join('')", "data-ckdel=\"${k.id}\">Excluir</button>`}</div></div>`).join('')");
R("      ${ui.confirmDel==='ck'+k.id?", "      <div class=\"row\" style=\"gap:6px\">${srvResetBtn('checkers',k)}${ui.confirmDel==='ck'+k.id?");
R("data-fkdel=\"${k.id}\">Excluir</button>`}</div>`).join('')", "data-fkdel=\"${k.id}\">Excluir</button>`}</div></div>`).join('')");
R("      ${ui.confirmDel==='fk'+k.id?", "      <div class=\"row\" style=\"gap:6px\">${srvResetBtn('billers',k)}${ui.confirmDel==='fk'+k.id?");
R("data-vdel=\"${v.id}\">Excluir</button>`}</div>`).join('')", "data-vdel=\"${v.id}\">Excluir</button>`}</div></div>`).join('')");
R("      ${ui.confirmDel==='veh'+v.id?", "      <div class=\"row\" style=\"gap:6px\">${srvResetBtn('vehicles',v)}${ui.confirmDel==='veh'+v.id?");
R("data-sle=\"${x.id}\">Editar</button>${ui.confirmDel==='sl'+x.id?", "data-sle=\"${x.id}\">Editar</button>${srvResetBtn('sellers',x)}${ui.confirmDel==='sl'+x.id?");
R("<button class=\"btn ghost\" data-ce=\"${x.id}\" style=\"min-height:40px;padding:8px 12px\">Editar</button></div>`).join('')", "<div class=\"row\" style=\"gap:6px;justify-content:flex-end\">${srvResetBtn('customers',x)}<button class=\"btn ghost\" data-ce=\"${x.id}\" style=\"min-height:40px;padding:8px 12px\">Editar</button></div></div>`).join('')");

R("<h2>${isAdmin?'Acesso do administrador':'Entrar para fazer pedido'}</h2>", "<h2>${isAdmin?'Acesso do administrador':'Entrar'}</h2>");

// ---------- 7. trava de margem e negociação: resposta do servidor
R("function lnLock(R2,cli,L){const me=SVme();if(!me||!R2.items.length)return null;", "function lnLock(R2,cli,L){const me=SVme();if(!me||!R2.items.length)return null;if(SRV.me&&SRV.me.role==='vendedor')return srvLock(R2,cli,L);");
R("function lnItemLevel(p,packPrice,k,L,cli,tp){", "function lnItemLevel(p,packPrice,k,L,cli,tp){if(SRV.me&&SRV.me.role==='vendedor')return srvItemLevel(p,L,cli);");
R("function negEval(p,asked,from){const C=negCfg();", "function negEval(p,asked,from){if(SRV.me&&SRV.me.role==='cliente')return ((ui.negSt||{})[p.id+'|'+asked])||'an';const C=negCfg();");
R(`    ui.neg=ui.neg||{};ui.neg[id]=pack;ui.negEdit=null;rer();
    const r=cartItems().find(x=>x.p.id===id);toast(r&&r.neg&&r.neg.st==='ok'?'Proposta aceita! O preço já está no seu pedido.':'Proposta enviada: a loja analisa quando você finalizar o pedido.')};`,
  `    ui.neg=ui.neg||{};ui.neg[id]=pack;ui.negEdit=null;ui.negSt=ui.negSt||{};
    api('/api/neg',{pid:id,asked:pack,q:ui.cart[id]||1,mode:ui.mode,pay:ui.pay,nf:!!ui.nf}).then(x=>x.st,()=>'an').then(st=>{if(st==='tabela'){delete ui.neg[id];rer();toast('Esse valor não é menor que o preço da tabela. Proponha um valor menor.');return}ui.negSt[id+'|'+pack]=st;rer();toast(st==='ok'?'Proposta aceita! O preço já está no seu pedido.':'Proposta enviada: a loja analisa quando você finalizar o pedido.')})};`);

// ---------- 7b. estoque e contas automáticas dos pedidos: só o servidor faz (o navegador não mexe)
R("function syncStock(o){\n", "function syncStock(o){if(typeof SRV!=='undefined')return;\n");
R("function autoReceivables(o,prev){\n", "function autoReceivables(o,prev){if(typeof SRV!=='undefined')return '';\n");

// ---------- 8. backup e restauração pelo servidor; senhas provisórias
R("function backupNow(){const data=JSON.stringify({app:'pedidos-atacado',version:1,savedAt:new Date().toISOString(),data:S});\n  offerFile('backup-atacado-davila-'+stamp()+'.json',data).then(ok=>{if(ok){S.store.lastBackup=today();save();render()}})}", 'function backupNow(){srvBackup()}');
R("$('#bkOk').onclick=()=>{S=d;save();toast('Backup restaurado');try{location.reload()}catch(e){render()}}};", "$('#bkOk').onclick=()=>{$('#bkMsg').innerHTML='<div class=\"small muted\">Restaurando…</div>';srvRestore(d)}};");
R("Baixa um arquivo com tudo: produtos, fotos, clientes, pedidos, contas a receber, combos e cadastros. Guarde no computador, no pendrive ou no Google Drive. Se o navegador perder os dados, é só restaurar.",
  "Os dados ficam guardados no servidor. O backup é uma cópia extra com tudo (produtos, fotos, clientes, pedidos, contas e cadastros), <b>sem nenhuma senha</b>. Guarde num lugar seguro: ele tem dados dos seus clientes.");
R("  <div id=\"bkMsg\"></div></section>`}", "  <div id=\"bkMsg\"></div></section>\n  <section class=\"panel\" style=\"display:grid;gap:10px;max-width:620px;margin-top:14px\"><div><b>Acessos sem senha</b><div class=\"small muted\">Gera uma senha provisória para cada pessoa cadastrada com usuário que ainda não tem senha. Ela aparece uma única vez; a pessoa cria a própria senha no primeiro acesso.</div></div><div class=\"row\"><button type=\"button\" class=\"btn ghost\" id=\"tmpPw\">Gerar senhas provisórias</button></div><div id=\"tmpPwBox\"></div></section>`}");
R("  const sv=$('#bkSave');if(sv)sv.onclick=backupNow;", "  const sv=$('#bkSave');if(sv)sv.onclick=backupNow;{const tb=$('#tmpPw');if(tb)tb.onclick=()=>srvTempPasswords($('#tmpPwBox'))}");
R(" No protótipo os dados ficam só neste navegador.", " Os dados ficam no servidor; o backup é uma cópia extra.");

// ---------- 8b. "já vi os avisos" só grava quando há aviso novo (antes gravava a cada atualização da tela)
R("function markSeen(c){const t=new Date().toISOString();S.orders.forEach(o=>{if(o.customerId===c.id&&(o.events||[]).length)o.seenAt=t});save()}",
  "function markSeen(c){const t=new Date().toISOString();let ch=false;S.orders.forEach(o=>{if(o.customerId===c.id&&(o.events||[]).some(e=>!o.seenAt||e.at>o.seenAt)){o.seenAt=t;ch=true}});if(ch)save()}");

// ---------- 9. visual: barra de demonstração some; aviso de "salvando"
R('.demo{background:var(--surface-2);border-bottom:1px solid var(--line);font-size:13px}', '.demo{display:none!important}.teamlinks{margin-top:12px;color:var(--muted);line-height:1.8}.teamlinks a{color:var(--accent);font-weight:600}.srvbadge{position:fixed;right:12px;bottom:12px;background:var(--fg);color:var(--bg);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;z-index:99;opacity:.85}.srvbadge[hidden]{display:none}.instbox{margin:12px auto 0;max-width:420px;padding:0 4px;text-align:center}.pwbox{display:grid;gap:8px;padding:10px 12px;border:1px dashed var(--line);border-radius:10px;margin:2px 0 10px;background:var(--surface)}.srvnet{position:fixed;left:0;right:0;top:var(--sat,0px);z-index:120;background:#B3261E;color:#fff;font-weight:700;font-size:14px;padding:10px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)}.srvnet[hidden],.srvalert[hidden]{display:none}.srvalert{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:121;background:#fff4f2;color:#7a1610;border:2px solid #B3261E;border-radius:12px;padding:12px 14px;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 6px 18px rgba(0,0,0,.2)}.srvalert .btn{margin-left:auto}');
R('<title>Pedidos Atacado</title>', "<title>D'Ávila Pedidos</title>");

// ---------- documento final
// conferência: todas as trocas aplicadas (se o fonte mudou e alguma deixou de casar, o build já parou acima)
if (n !== EXPECTED) { console.error(`Foram aplicadas ${n} trocas; o esperado é ${EXPECTED}. Confira scripts/build-app.js.`); process.exit(1); }
// o código do app sai do HTML e vai para /app.js (sem script inline, a CSP bloqueia código injetado)
const sOpen = '<script>\n(function(){', sClose = '})();\n</script>';
const a0 = s.indexOf(sOpen), a1 = s.indexOf(sClose, a0);
if (a0 < 0 || a1 < 0 || s.indexOf(sOpen, a0 + 1) >= 0) { console.error('Não achei o bloco de script principal do app.'); process.exit(1); }
const appJs = '(function(){' + s.slice(a0 + sOpen.length, a1) + '})();\n';
s = s.slice(0, a0) + '<script src="/app.js?v=' + require('crypto').createHash('sha256').update(appJs).digest('hex').slice(0, 10) + '"></script>' + s.slice(a1 + sClose.length);
if (/<script>(?!<\/script>)/.test(s.replace(/<script src=[^>]*><\/script>/g, ''))) { console.error('Ainda há script inline no HTML.'); process.exit(1); }
const head = s.split('<style>')[0], body = s.slice(head.length);
const i = body.indexOf('</style>') + '</style>'.length;
const html = '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#E11F2C"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">\n'
  + head + body.slice(0, i) + '\n</head><body>\n' + body.slice(i) + '\n</body></html>\n';
// conferência: nada de senha nem dado embutido
const bad = ['1208' + '10', "pass:'1234'", '__SEED=', 'x.pass===p', 'a.pass===p', 'c.pass===p', 'v.pass===p', "localStorage.setItem(KEY,", 'onclick="'].filter(t => html.includes(t) || appJs.includes(t));
if (bad.length) { console.error('Ainda há trechos proibidos no app:', bad); process.exit(1); }
fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
// app instalável: cada endereço tem o seu nome, ícone e cor (equipe azul, cliente vermelho)
const pwa = (key, title, color) => `<link rel="manifest" href="/${key}.webmanifest"><link rel="apple-touch-icon" href="/icons/${key}-apple-180.png"><link rel="icon" type="image/png" sizes="192x192" href="/icons/${key}-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="${title}">`;
const withPwa = (h, key, title, color) => h.replace('<meta name="theme-color" content="#E11F2C">', `<meta name="theme-color" content="${color}">` + pwa(key, title, color)).replace("<title>D'Ávila Pedidos</title>", `<title>${title}</title>`);
const htmlEquipe = withPwa(html, 'equipe', "D'Ávila Equipe", '#0A66B2'), htmlCliente = withPwa(html, 'cliente', "D'Ávila Pedidos", '#E11F2C');
if (!htmlEquipe.includes('equipe.webmanifest') || !htmlCliente.includes('cliente.webmanifest')) { console.error('Não consegui colocar o manifesto do app.'); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'public/index.html'), htmlEquipe);
// /cliente: o mesmo app, aberto no modo "só clientes" (a página percebe pelo endereço)
fs.writeFileSync(path.join(ROOT, 'public/cliente.html'), htmlCliente);
fs.writeFileSync(path.join(ROOT, 'public/app.js'), appJs);
console.log('public/index.html:', Math.round(html.length / 1024), 'KB ·', n, 'trocas aplicadas');

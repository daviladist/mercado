/* ================= Tino PDV: caixa de balcão ("pague e leve") =================
 * Tela cheia, pensada para teclado e leitor USB (o leitor "digita" o código e aperta Enter).
 * O preço mostrado aqui é só para agilizar: o servidor recalcula tudo e recusa valor mexido.
 * Sem internet: a venda vai para uma fila no aparelho e é enviada sozinha quando a conexão volta. */
const PDV={st:null,items:[],cust:null,desc:null,auth:null,saleId:null,quote:null,qsig:'',modal:null,last:null,busy:false,qty:null,pays:[],online:navigator.onLine,qrLib:null};
const PDV_KEYS=['F2','F3','F4','F6','F7','F8','F9','F10','F11','F12'];
const PDV_HELP={F2:'Buscar nome',F3:'Quantidade',F4:'Cliente',F6:'Desconto',F7:'Cancelar item',F8:'Reimprimir',F9:'Consultar preço',F10:'Pagamento',F11:'Espera',F12:'Caixa'};
function pdvKey(s){return 'pdv:'+(TSLUG||'@')+':'+(s==='fila'||s==='falhas'?'':(SRV.me?(SRV.me.refId||SRV.me.login):''))+':'+s}
function pdvLoad(s,d){try{return JSON.parse(localStorage.getItem(pdvKey(s))||'null')||d}catch(e){return d}}
function pdvSave(s,v){try{localStorage.setItem(pdvKey(s),JSON.stringify(v))}catch(e){}}
function pdvNewId(){const a=new Uint8Array(12);crypto.getRandomValues(a);return 'v'+Date.now().toString(36)+Array.from(a,b=>b.toString(16).padStart(2,'0')).join('').slice(0,16)}
const pdvMoney=v=>brl(v);
function pdvNum(v){const s=String(v==null?'':v).trim().replace(/\s/g,'').replace(/^R\$/i,'');if(!s)return NaN;if(/^\d{1,3}(\.\d{3})+$/.test(s))return Number(s.replace(/\./g,''));return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s)}
/* o leitor USB "digita" muito rápido: guarda o tempo das teclas para saber se um Enter veio do leitor */
const PDV_KT=[];document.addEventListener('keydown',e=>{if(e.key.length===1){PDV_KT.push(Date.now());if(PDV_KT.length>30)PDV_KT.shift()}},true);
function pdvFromScanner(){const n=PDV_KT.length;if(n<3)return false;const t=PDV_KT.slice(-3);return Date.now()-t[2]<80&&t[2]-t[0]<60}
function pdvScanGuard(e){if(e.key==='Enter'&&pdvFromScanner()){e.preventDefault();e.stopPropagation();pdvBeep(false);toast('Leitura de código ignorada nesta janela. Termine aqui ou aperte Esc.');const t=e.target;if(t&&'value' in t&&t.tagName==='INPUT')t.value='';return true}return false}
/* som curto: agudo = ok, grave = erro (o operador não precisa olhar a tela a cada bipe) */
function pdvBeep(ok){try{const A=window.AudioContext||window.webkitAudioContext;PDV.ac=PDV.ac||new A();const a=PDV.ac,o=a.createOscillator(),g=a.createGain();
  o.type=ok?'sine':'square';o.frequency.value=ok?1320:200;g.gain.value=ok?.07:.09;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+(ok?.07:.32))}catch(e){}}
function pdvCss(){if(document.getElementById('pdvcss'))return;const st=document.createElement('style');st.id='pdvcss';st.textContent=`
body.pdvmode header.top,body.pdvmode .demo,body.pdvmode #srvbar{display:none!important}
body.pdvmode{background:#F6F1E7}body.pdvmode main{padding:0}body.pdvmode main>.wrap{max-width:none;padding:0}
.pdv{--g:#1F3D2B;--g2:#2C5139;--o:#E8A33D;--c:#F6F1E7;--l:#E6DCC8;--m:#5E6A5F;font-family:var(--body);color:var(--g);display:grid;grid-template-rows:auto 1fr auto;min-height:100vh;background:var(--c)}
.pdvh{background:var(--g);color:#fff;border-bottom:4px solid var(--o);display:flex;gap:14px;align-items:center;justify-content:space-between;padding:8px 16px;flex-wrap:wrap}
.pdvh .b{display:flex;align-items:center;gap:10px}.pdvh .ic{width:36px;height:36px;border-radius:10px;background:var(--o);display:grid;place-items:center}
.pdvh .wm{font-weight:800;font-size:22px;letter-spacing:-1px;color:var(--c)}.pdvh .s{font-size:13px;color:#E9E1D0}
.pdvh .net{font-size:13px;font-weight:700;border-radius:999px;padding:4px 10px;background:#E3EFE6;color:#1F5A33}.pdvh .net.off{background:#F8E1DF;color:#8C1D18}
.pdvm{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,380px);gap:14px;padding:14px;min-height:0}
@media (max-width:820px){.pdvm{grid-template-columns:1fr}}
.pdvl{display:flex;flex-direction:column;gap:10px;min-width:0}
.pdvin{display:flex;gap:10px;align-items:center;background:#fff;border:3px solid var(--g);border-radius:12px;padding:8px 12px}
.pdvin label{font-weight:700;font-size:14px;white-space:nowrap}.pdvin input{flex:1;min-width:0;border:0;font-size:26px;font-weight:700;letter-spacing:1px;outline:none;background:transparent;color:var(--g);min-height:44px}
.pdvin .qt{background:var(--o);color:var(--g);font-weight:800;border-radius:8px;padding:4px 10px;font-size:18px}
.pdvt{background:#fff;border:1px solid var(--l);border-radius:12px;overflow:auto;flex:1;min-height:240px;max-height:calc(100vh - 260px)}
.pdvt table{width:100%;border-collapse:collapse;font-size:16px}.pdvt th{position:sticky;top:0;background:#EFE7D6;text-align:left;padding:8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#3B4A3F}
.pdvt td{padding:8px;border-top:1px solid #EFE7D6}.pdvt td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pdvt tr.cx td{text-decoration:line-through;color:#9A8F7A}.pdvt tr.last td{background:#FBEFD9}
.pdvr{display:flex;flex-direction:column;gap:10px}
.pdvbox{background:#fff;border:1px solid var(--l);border-radius:12px;padding:12px 14px}
.pdvtot{background:var(--g);color:#fff;border-radius:12px;padding:16px;display:grid;gap:4px}
.pdvtot .lb{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#E9E1D0}.pdvtot .v{font-size:clamp(40px,6vw,64px);font-weight:800;line-height:1;color:var(--o);font-variant-numeric:tabular-nums}
.pdvrow{display:flex;justify-content:space-between;gap:10px;font-size:15px}.pdvrow b{font-variant-numeric:tabular-nums}
.pdvlast{font-size:18px;font-weight:700}.pdvmut{color:var(--m);font-size:13px}
.pdvf{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:var(--g2);border-top:1px solid var(--g)}
.pdvf button{background:var(--g);color:#fff;border:1px solid #5E7F6A;border-radius:8px;padding:6px 10px;font-size:13px;min-height:44px;font-family:inherit}
.pdvf button b{color:var(--o);margin-right:4px}
.pdvov{position:fixed;inset:0;background:rgba(15,30,20,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:80}
.pdvmd{background:#fff;border-radius:14px;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px;display:grid;gap:12px;color:var(--g);border-top:6px solid var(--o)}
.pdvmd h2{margin:0;font-size:22px}.pdvmd input,.pdvmd select,.pdvmd textarea{font:inherit;font-size:18px;min-height:44px;border:2px solid var(--l);border-radius:8px;padding:6px 10px;width:100%;box-sizing:border-box;color:var(--g)}
.pdvmd input:focus,.pdvmd select:focus{border-color:var(--g);outline:none}
.pdvmd .bt{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.pdvmd button{font:inherit;min-height:44px;border-radius:8px;padding:0 16px;border:1px solid var(--l);background:#fff;color:var(--g);font-weight:600}
.pdvmd button.ok{background:var(--o);border-color:var(--o);font-weight:800}.pdvmd button.dk{background:var(--g);color:#fff;border-color:var(--g)}
.pdvlist{display:grid;gap:4px;max-height:50vh;overflow:auto}.pdvlist button{text-align:left;display:flex;justify-content:space-between;gap:10px;min-height:44px;font-weight:500}
.pdvlist button[aria-selected=true]{background:#FBEFD9;border-color:var(--o)}
.pdverr{color:#B3261E;font-weight:700;min-height:20px}
.pdvqr{display:grid;justify-items:center;gap:6px}.pdvqr img{width:220px;height:220px;image-rendering:pixelated}.pdvqr code{font-size:11px;word-break:break-all;background:#F6F1E7;padding:6px;border-radius:6px;max-width:100%}
.pdvpays{display:grid;gap:4px}.pdvpays div{display:flex;justify-content:space-between;background:#F6F1E7;border-radius:6px;padding:6px 10px}
.pdvbig{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums}
.pdvlogin{max-width:420px;margin:40px auto;padding:0 16px}
#pdvprint{display:none}
@media (max-height:700px),(max-width:1100px){.pdvf button{padding:4px 8px;font-size:12px;min-height:38px}.pdvin input{font-size:20px}.pdvtot .v{font-size:40px}.pdvt{max-height:calc(100vh - 230px)}.pdvm{padding:10px;gap:10px}}
@media print{body *{visibility:hidden!important}#pdvprint,#pdvprint *{visibility:visible!important}#pdvprint{display:block!important;position:absolute;left:0;top:0;width:72mm;font:12px/1.35 monospace;color:#000}
  #pdvprint .c{text-align:center}#pdvprint table{width:100%;border-collapse:collapse}#pdvprint td{vertical-align:top;padding:1px 0}#pdvprint td.n{text-align:right}#pdvprint hr{border:0;border-top:1px dashed #000}@page{size:80mm auto;margin:3mm}}`;
  document.head.appendChild(st)}
const PDV_SPARK='<svg aria-hidden="true" viewBox="0 0 40 40" width="20" height="20"><path d="M20 0 C22 13 27 18 40 20 C27 22 22 27 20 40 C18 27 13 22 0 20 C13 18 18 13 20 0 Z" fill="#1F3D2B"/></svg>';

/* ---------------------------------------------------------------- tela principal */
async function renderPdv(){pdvCss();document.body.classList.add('pdvmode');const app=$('#app');
  if(!SRV.me){app.innerHTML=`<div class="pdv"><div class="pdvh"><div class="b"><span class="ic">${PDV_SPARK}</span><span class="wm">tino</span><span class="s">Caixa de balcão</span></div></div>
    <div class="pdvlogin"><form class="pdvmd" id="pdvl" style="width:100%"><h2>Entrar no caixa</h2><div><label for="pdvlu">Usuário</label><input id="pdvlu" autocomplete="username" autocapitalize="off" required></div>
    <div><label for="pdvlp">Senha</label><input id="pdvlp" type="password" autocomplete="current-password" required></div><div class="pdverr" id="pdvle" role="alert"></div><div class="bt"><button class="ok" type="submit">Entrar</button></div></form></div></div>`;
    $('#pdvl').onsubmit=e=>{e.preventDefault();srvLogin('operador_caixa',$('#pdvlu').value.trim(),$('#pdvlp').value,$('#pdvle'),$('#pdvl button[type=submit]'))};setTimeout(()=>{const i=$('#pdvlu');if(i)i.focus()},50);return}
  const role=SRV.me.role;
  if(role!=='operador_caixa'&&role!=='admin'){app.innerHTML='<div class="empty">Este acesso não usa o caixa.</div>';return}
  if(!modOn('pdv')){app.innerHTML='<div class="pdv"><div class="empty" style="padding:40px"><h2>O caixa (PDV) não está ligado para esta empresa.</h2><p>Fale com o suporte.</p></div></div>';return}
  if(!PDV.st){app.innerHTML='<div class="pdv"><div class="empty" style="padding:40px">Abrindo o caixa…</div></div>';
    try{PDV.st=await api('/api/pdv/state')}catch(e){app.innerHTML='<div class="pdv"><div class="empty" style="padding:40px">'+esc(e.message)+'</div></div>';return}
    const draft=pdvLoad('venda',null);if(draft&&Array.isArray(draft.items)){Object.assign(PDV,{items:draft.items,cust:draft.cust||null,desc:draft.desc||null,saleId:draft.saleId||null})}
    pdvStartQueue();pdvQrLib().catch(()=>{})}
  pdvSnapSave();
  if(!PDV.st.caixa){pdvOpenCaixa();return}
  if(!PDV.saleId)PDV.saleId=pdvNewId();
  app.innerHTML=`<div class="pdv" id="pdvroot">
    <div class="pdvh"><div class="b"><span class="ic">${PDV_SPARK}</span><span class="wm">tino</span><span class="s">Caixa nº ${PDV.st.caixa.numero} · ${esc(PDV.st.me.nome)}</span></div>
      <div class="b"><span class="net ${PDV.online?'':'off'}" id="pdvnet">${PDV.online?'Conectado':'Sem internet'}</span><span class="s" id="pdvfila"></span>${role==='admin'?`<a class="s" href="${TBASE}/#admin" style="color:#E8A33D">Voltar ao painel</a>`:''}</div></div>
    <div class="pdvm"><section class="pdvl" aria-label="Itens da venda">
      <div class="pdvin"><label for="pdvc">Código</label>${PDV.qty?`<span class="qt">${String(PDV.qty).replace('.',',')} ×</span>`:''}<input id="pdvc" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="Leia o código (4*código = 4 un.)"></div>
      <div class="pdvt"><table><thead><tr><th>#</th><th>Produto</th><th class="n">Qtd</th><th class="n">Unit.</th><th class="n">Total</th></tr></thead><tbody id="pdvitems"></tbody></table></div></section>
      <aside class="pdvr" aria-label="Total"><div class="pdvbox"><div class="pdvmut">Cliente (F4)</div><div class="pdvlast" id="pdvcli"></div></div>
        <div class="pdvbox" id="pdvnote" aria-live="assertive" hidden></div><div class="pdvbox" id="pdvlast" aria-live="polite"></div>
        <div class="pdvbox"><div class="pdvrow"><span>Itens</span><b id="pdvn">0</b></div><div class="pdvrow"><span>Subtotal</span><b id="pdvsub">${pdvMoney(0)}</b></div><div class="pdvrow"><span>Desconto (F6)</span><b id="pdvdesc">—</b></div></div>
        <div class="pdvtot"><span class="lb">Total a pagar</span><span class="v" id="pdvtot">${pdvMoney(0)}</span><span class="lb" id="pdvsrc"></span></div></aside></div>
    <div class="pdvf" role="toolbar" aria-label="Atalhos">${PDV_KEYS.map(k=>`<button type="button" data-k="${k}"><b>${k}</b>${PDV_HELP[k]}</button>`).join('')}</div>
    <div id="pdvmodal"></div><div id="pdvprint" aria-hidden="true"></div></div>`;
  app.querySelectorAll('.pdvf [data-k]').forEach(b=>b.onclick=()=>pdvAction(b.dataset.k));
  const inp=$('#pdvc');inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const v=inp.value;inp.value='';pdvScan(v)}};
  pdvPaint();pdvFocus();pdvFila()}
function pdvFocus(){if(PDV.modal)return;const i=$('#pdvc');if(i&&document.activeElement!==i)i.focus()}
/* teclado: atalhos valem na tela do caixa; o campo do código volta a ter foco sempre */
document.addEventListener('keydown',e=>{if(ui.view!=='pdv'||!document.getElementById('pdvroot'))return;
  if(e.key==='Escape'&&PDV.modal){e.preventDefault();pdvClose();return}
  let k=e.key;if(e.ctrlKey&&(k==='e'||k==='E'))k='F11';if(e.ctrlKey&&(k==='k'||k==='K'))k='F12';
  if(PDV_KEYS.includes(k)||k==='F1'){e.preventDefault();if(!PDV.modal||(k==='F10'&&PDV.modal==='pay'))pdvAction(k);return}
  if(!PDV.modal&&!e.ctrlKey&&!e.altKey&&!e.metaKey){const i=$('#pdvc');if(i&&e.target!==i&&(/^[0-9*xX]$/.test(e.key)||e.key==='Enter')){e.preventDefault();i.focus();if(e.key==='Enter'){const v=i.value;i.value='';pdvScan(v)}else i.value+=e.key}}});
document.addEventListener('focusout',e=>{if(ui.view==='pdv'&&e.target&&e.target.id==='pdvc')setTimeout(pdvFocus,0)});
document.addEventListener('click',()=>{if(ui.view==='pdv')setTimeout(pdvFocus,0)});
window.addEventListener('online',()=>{PDV.online=true;pdvNet();pdvSendQueue()});window.addEventListener('offline',()=>{PDV.online=false;pdvNet()});
function pdvNet(){const n=$('#pdvnet');if(n){n.className='net'+(PDV.online?'':' off');n.textContent=PDV.online?'Conectado':'Sem internet'}}

/* ---------------------------------------------------------------- itens */
function pdvFind(code){const c=String(code||'').trim();if(!c)return null;const d=c.replace(/\D/g,'');
  return S.products.find(p=>p.active!==false&&d&&(String(p.ean||'')===d||String(p.ean2||'')===d||(Array.isArray(p.eans)&&p.eans.includes(d))))||S.products.find(p=>p.active!==false&&String(p.code||'').toLowerCase()===c.toLowerCase())||null}
function pdvUnit(p,q){const ie=!!(PDV.cust&&PDV.cust.ie);try{return Math.round(withIe(ie,()=>withOner('retirada',()=>priceFor(p,q,'retirada','').price))*100)/100}catch(e){return Number(p.price)||0}}
function pdvScan(raw){let v=String(raw||'').trim();if(!v)return;let q=PDV.qty||1;
  if(v.includes('*')){const m=/^(\d+(?:[.,]\d+)?)\s*\*\s*(\S+)$/.exec(v);if(!m){pdvBeep(false);toast('Quantidade inválida. Use: quantidade*código (ex.: 4*789...).');return}q=pdvNum(m[1]);v=m[2].trim()}
  if(!(q>0)){pdvBeep(false);toast('Quantidade inválida.');return}
  if(q>999){pdvBeep(false);toast('Quantidade muito alta numa leitura só (máximo 999). Confira.');return}
  const p=pdvFind(v);
  if(!p){pdvBeep(false);pdvUnknown(v);return}
  if(!isKg(p)&&Math.abs(q-Math.round(q))>1e-9){pdvBeep(false);toast('Este produto é vendido por unidade.');return}
  pdvNote('');PDV.items.push({pid:p.id,name:p.name,ean:p.ean||'',q,unit:pdvUnit(p,q)});PDV.qty=null;PDV.auth=null;pdvBeep(true);pdvChanged()}
function pdvChanged(){pdvSave('venda',{items:PDV.items,cust:PDV.cust,desc:PDV.desc,saleId:PDV.saleId});PDV.quote=null;
  const qt=document.querySelector('.pdvin .qt');if(qt&&!PDV.qty)qt.remove();pdvPaint();pdvRequote()}
function pdvSig(){return JSON.stringify([PDV.cust&&PDV.cust.id,PDV.items.map(i=>[i.pid,i.q,!!i.cancel]),PDV.desc])}
let pdvQT=null;
function pdvRequote(){clearTimeout(pdvQT);if(!PDV.items.some(i=>!i.cancel)||(!PDV.cust&&!PDV.desc))return;pdvQT=setTimeout(()=>pdvQuote().catch(()=>{}),250)}
async function pdvQuote(){const sig=pdvSig();const r=await api('/api/pdv/quote',pdvBody());if(sig!==pdvSig())return null;PDV.quote=r;PDV.qsig=sig;pdvPaint();return r}
function pdvBody(){return {customerId:PDV.cust?PDV.cust.id:'',items:PDV.items.map(i=>({pid:i.pid,q:i.q,...(i.cancel?{cancel:{motivo:i.cancel}}:{})})),desconto:PDV.desc||null}}
function pdvTotals(){const Q=PDV.quote&&PDV.qsig===pdvSig()?PDV.quote:null;
  if(Q)return {sub:Q.sub,desc:Q.desc,total:Q.total,lines:Q.lines,server:true,needAuth:Q.needAuth};
  const lines=PDV.items.map((i,k)=>({seq:k+1,unit:i.unit,q:i.q,total:i.cancel?0:Math.round(i.unit*i.q*100)/100,cancel:!!i.cancel}));
  const sub=Math.round(lines.reduce((s,l)=>s+l.total,0)*100)/100;let desc=0;
  if(PDV.desc)desc=PDV.desc.tipo==='pct'?Math.round(sub*PDV.desc.valor)/100:Number(PDV.desc.valor)||0;
  return {sub,desc,total:Math.max(0,Math.round((sub-desc)*100)/100),lines,server:false}}
function pdvPaint(){const tb=$('#pdvitems');if(!tb)return;const T=pdvTotals();
  tb.innerHTML=PDV.items.map((i,k)=>{const l=T.lines[k]||{};return `<tr class="${i.cancel?'cx':''} ${k===PDV.items.length-1?'last':''}"><td>${k+1}</td><td>${esc(i.name)}${i.cancel?` <span class="pdvmut">(cancelado: ${esc(i.cancel)})</span>`:''}</td><td class="n">${String(i.q).replace('.',',')}</td><td class="n">${pdvMoney(l.unit!=null?l.unit:i.unit)}</td><td class="n">${pdvMoney(i.cancel?0:(l.total!=null?l.total:i.unit*i.q))}</td></tr>`}).join('')||'<tr><td colspan="5" class="pdvmut" style="padding:24px;text-align:center">Caixa livre. Leia o primeiro produto.</td></tr>';
  const sc=tb.parentElement.parentElement;sc.scrollTop=sc.scrollHeight;
  const last=PDV.items[PDV.items.length-1];$('#pdvlast').innerHTML=last?`<div class="pdvmut">Último item</div><div class="pdvlast">${esc(last.name)}</div><div class="pdvrow"><span>${String(last.q).replace('.',',')} × ${pdvMoney((T.lines[PDV.items.length-1]||{}).unit||last.unit)}</span></div>`:'<div class="pdvmut">Nenhum item ainda</div>';
  $('#pdvcli').textContent=PDV.cust?PDV.cust.name+(PDV.cust.ie?' · com IE':''):'Consumidor (sem cadastro)';
  $('#pdvn').textContent=PDV.items.filter(i=>!i.cancel).length;$('#pdvsub').textContent=pdvMoney(T.sub);$('#pdvdesc').textContent=T.desc?'− '+pdvMoney(T.desc)+(PDV.auth?' (autorizado)':''):'—';
  $('#pdvtot').textContent=pdvMoney(T.total);$('#pdvsrc').textContent=T.server?'conferido pelo servidor':''}

/* código não cadastrado: aviso; o gerente pode vincular o código a um produto */
/* aviso no lugar do "último item" (não abre janela: o caixa continua lendo os próximos produtos) */
function pdvNote(html){const b=$('#pdvnote');if(!b)return;b.hidden=!html;b.innerHTML=html||''}
function pdvUnknown(code){pdvNote(`<div class="pdverr">Código não cadastrado: ${esc(code)}</div><div class="pdvmut">O item NÃO entrou. Separe o produto e chame o gerente.</div><button type="button" id="pdvuv" tabindex="-1" style="margin-top:6px;min-height:40px;border-radius:8px;border:1px solid #1F3D2B;background:#fff;color:#1F3D2B;font-weight:600;padding:0 12px">Gerente: vincular este código</button>`);
  $('#pdvuv').onclick=()=>pdvSearch(p=>pdvLink(code,p))}
function pdvLink(code,p){pdvModal('link',`<h2>Vincular código</h2><p>Código <b>${esc(code)}</b> → <b>${esc(p.name)}</b></p>${pdvMgrFields()}<div class="pdverr" id="pdverr" role="alert"></div>
  <div class="bt"><button type="button" id="pdvlx">Cancelar</button><button type="button" class="ok" id="pdvlk">Vincular</button></div>`,()=>$('#pdvgl').focus());
  $('#pdvlx').onclick=pdvClose;$('#pdvlk').onclick=async()=>{const b=$('#pdvlk');if(b.disabled)return;b.disabled=true;try{await api('/api/pdv/ean',{pid:p.id,ean:code,gerente:pdvMgr()});const d=String(code).replace(/\D/g,'');p.eans=(p.eans||[]).concat([d]);pdvBeep(true);pdvClose();pdvNote('');toast('Código vinculado. Leia de novo.')}catch(e){pdvBeep(false);$('#pdverr').textContent=e.message}finally{b.disabled=false}}}

/* ---------------------------------------------------------------- janelas (modais) */
function pdvModal(name,html,after){PDV.modal=name;const m=$('#pdvmodal');m.innerHTML=`<div class="pdvov"><div class="pdvmd" role="dialog" aria-modal="true" aria-label="${esc(name)}">${html}</div></div>`;
  m.querySelector('.pdvov').addEventListener('click',e=>{if(e.target.classList.contains('pdvov')&&['busca','preco','cli','espera','caixa'].includes(name))pdvClose()});
  m.querySelector('.pdvmd').addEventListener('keydown',e=>{if(name!=='preco'&&name!=='busca'&&name!=='cli'&&pdvScanGuard(e))return;
    if(e.key==='Enter'&&name==='desc'&&(e.target.id==='pdvgl'||e.target.id==='pdvgp')){e.preventDefault();if(e.target.id==='pdvgl')$('#pdvgp').focus();else $('#pdvdok').click();return}
    if(e.key==='Enter'&&e.target.tagName==='INPUT'&&['mov','fechar','link'].includes(name)){e.preventDefault();const L=[...m.querySelectorAll('.pdvmd input')],k=L.indexOf(e.target);if(k>=0&&k<L.length-1)L[k+1].focus();else{const ok=m.querySelector('.pdvmd button.ok');if(ok)ok.click()}}},true);
  if(after)setTimeout(()=>{try{after()}catch(e){}},20)}
function pdvClose(){PDV.modal=null;const m=$('#pdvmodal');if(m)m.innerHTML='';pdvFocus()}
const pdvMgrFields=()=>`<fieldset style="border:1px solid #E6DCC8;border-radius:10px;padding:10px;display:grid;gap:8px"><legend style="font-weight:700">Senha do gerente</legend><div><label for="pdvgl">Usuário</label><input id="pdvgl" autocomplete="off" autocapitalize="off"></div><div><label for="pdvgp">Senha</label><input id="pdvgp" type="password" autocomplete="off"></div></fieldset>`;
const pdvMgr=()=>({login:($('#pdvgl')||{}).value||'',senha:($('#pdvgp')||{}).value||''});
function pdvListNav(input,listSel,onPick){let i=0;const items=()=>[...document.querySelectorAll(listSel+' button')];
  const mark=()=>items().forEach((b,k)=>b.setAttribute('aria-selected',k===i));
  input.onkeydown=e=>{const L=items();if(e.key==='ArrowDown'){e.preventDefault();i=Math.min(L.length-1,i+1);mark();L[i]&&L[i].scrollIntoView({block:'nearest'})}
    else if(e.key==='ArrowUp'){e.preventDefault();i=Math.max(0,i-1);mark();L[i]&&L[i].scrollIntoView({block:'nearest'})}else if(e.key==='Enter'){e.preventDefault();if(L[i])L[i].click()}};
  return ()=>{i=0;mark();items().forEach(b=>b.onclick=()=>onPick(b.dataset.id))}}
/* F2: busca por nome */
function pdvSearch(onPick){pdvModal('busca',`<h2>Buscar produto</h2><input id="pdvsq" placeholder="Nome, código ou parte do nome" autocomplete="off"><div class="pdvlist" id="pdvsl" role="listbox"></div><div class="pdvmut">↑ ↓ para escolher · Enter confirma · Esc volta</div>`,()=>$('#pdvsq').focus());
  const inp=$('#pdvsq');const bind=pdvListNav(inp,'#pdvsl',id=>{const p=S.products.find(x=>x.id===id);if(!p)return;if(onPick){onPick(p);return}pdvClose();const q=PDV.qty||1;if(!isKg(p)&&Math.abs(q-Math.round(q))>1e-9){pdvBeep(false);toast('Este produto é vendido por unidade.');return}PDV.items.push({pid:p.id,name:p.name,ean:p.ean||'',q,unit:pdvUnit(p,q)});PDV.qty=null;PDV.auth=null;pdvBeep(true);pdvChanged()});
  const run=()=>{const t=inp.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');const L=(t?S.products.filter(p=>p.active!==false&&(String(p.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(t)||String(p.code||'')===t||String(p.ean||'')===t)):[]).slice(0,40);
    $('#pdvsl').innerHTML=L.map(p=>`<button type="button" role="option" data-id="${esc(p.id)}"><span>${esc(p.name)} <span class="pdvmut">${esc(p.unit||'')}</span></span><b>${pdvMoney(pdvUnit(p,1))}</b></button>`).join('')||(t?'<div class="pdvmut">Nada encontrado.</div>':'');bind()};
  inp.oninput=run}
/* F3: quantidade para o próximo item */
function pdvQty(){pdvModal('qtd',`<h2>Quantidade do próximo item</h2><input id="pdvqq" inputmode="decimal" autocomplete="off"><div class="pdvmut">Dica: no campo do código, "4*código" também funciona.</div>`,()=>$('#pdvqq').focus());
  $('#pdvqq').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const q=pdvNum(e.target.value);if(!(q>0)||q>99999){pdvBeep(false);return}PDV.qty=q;pdvClose();renderPdv()}}}
/* F4: cliente (usa a tabela e a IE dele) */
function pdvCustomer(){pdvModal('cli',`<h2>Cliente</h2><input id="pdvcq" placeholder="Nome, CNPJ ou CPF" autocomplete="off"><div class="pdvlist" id="pdvcl" role="listbox"></div><div class="bt"><button type="button" id="pdvc0">Sem cliente (consumidor)</button></div>`,()=>$('#pdvcq').focus());
  const inp=$('#pdvcq');$('#pdvc0').onclick=()=>{PDV.cust=null;PDV.auth=null;pdvClose();pdvReprice();pdvChanged()};
  const bind=pdvListNav(inp,'#pdvcl',id=>{const c=S.customers.find(x=>x.id===id);if(!c)return;PDV.cust={id:c.id,name:c.name,ie:!!ieClient(c),limit:Number(c.creditLimit)||0};PDV.auth=null;pdvClose();pdvReprice();pdvChanged()});
  const run=()=>{const t=inp.value.trim().toLowerCase(),d=t.replace(/\D/g,'');const L=(t?S.customers.filter(c=>String(c.name||'').toLowerCase().includes(t)||(d.length>=3&&String(c.doc||'').replace(/\D/g,'').includes(d))):[]).slice(0,30);
    $('#pdvcl').innerHTML=L.map(c=>`<button type="button" role="option" data-id="${esc(c.id)}"><span>${esc(c.name)}<br><span class="pdvmut">${esc(c.doc||'')}${ieClient(c)?' · com IE':''}</span></span><span class="pdvmut">${Number(c.creditLimit)>0?'fiado até '+pdvMoney(c.creditLimit):''}</span></button>`).join('')||(t?'<div class="pdvmut">Nenhum cliente.</div>':'');bind()};
  inp.oninput=run}
function pdvReprice(){PDV.items.forEach(i=>{const p=S.products.find(x=>x.id===i.pid);if(p)i.unit=pdvUnit(p,i.q)})}
/* F6: desconto (acima do limite ou abaixo da margem: senha do gerente) */
function pdvDiscount(){if(!PDV.items.some(i=>!i.cancel)){pdvBeep(false);return}
  pdvModal('desc',`<h2>Desconto</h2><label for="pdvdv">Valor: "10%" ou "5,00" (em branco tira o desconto)</label><input id="pdvdv" autocomplete="off" value="${PDV.desc?(PDV.desc.tipo==='pct'?String(PDV.desc.valor).replace('.',',')+'%':String(PDV.desc.valor).replace('.',',')):''}">
    <div id="pdvdauth"></div><div class="pdverr" id="pdverr" role="alert"></div><div class="bt"><button type="button" id="pdvdx">Cancelar</button><button type="button" class="ok" id="pdvdok">Aplicar</button></div>`,()=>$('#pdvdv').select());
  $('#pdvdx').onclick=pdvClose;
  const apply=async()=>{const raw=$('#pdvdv').value.trim();const err=$('#pdverr');err.textContent='';
    if(!raw){PDV.desc=null;PDV.auth=null;pdvClose();pdvChanged();return}
    const pct=/%$/.test(raw),v=pdvNum(raw.replace('%',''));if(!(v>0)||pct&&v>=100){err.textContent='Desconto inválido.';return}
    const prev=PDV.desc,prevAuth=PDV.auth,want={tipo:pct?'pct':'valor',valor:v};PDV.desc=want;PDV.auth=null;
    const volta=()=>{PDV.desc=prev;PDV.auth=prevAuth;PDV.quote=null;pdvPaint()};
    try{const Q=await pdvQuote();if(!Q){volta();return}
      if(Q.needAuth){if(!$('#pdvgl')){volta();$('#pdvdauth').innerHTML='<p class="pdvmut">Este desconto passa do limite do caixa: precisa da senha do gerente.</p>'+pdvMgrFields();$('#pdvgl').focus();return}
        const a=await api('/api/pdv/autorizar',Object.assign(pdvBody(),{gerente:pdvMgr()}));PDV.auth=a.token;toast('Desconto autorizado por '+a.gerente+(a.alerta?'. '+a.alerta:''))}
      pdvBeep(true);pdvClose();pdvChanged()}
    catch(e){pdvBeep(false);volta();err.textContent=e.status===0?'Sem internet: desconto só com conexão.':e.message}};
  $('#pdvdok').onclick=apply;$('#pdvdv').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();apply()}}}
/* F7: cancelar item (com motivo) */
function pdvCancelItem(){const ok=PDV.items.map((x,k)=>k).filter(k=>!PDV.items[k].cancel);if(!ok.length){pdvBeep(false);return}
  pdvModal('canc',`<h2>Cancelar item</h2><label for="pdvkn">Número do item</label><input id="pdvkn" inputmode="numeric" value="${ok[ok.length-1]+1}"><label for="pdvkm">Motivo</label><input id="pdvkm" placeholder="Ex.: cliente desistiu, leitura duplicada" maxlength="120"><div class="pdverr" id="pdverr" role="alert"></div>
    <div class="bt"><button type="button" id="pdvkx">Voltar</button><button type="button" class="ok" id="pdvkok">Cancelar item</button></div>`,()=>$('#pdvkn').select());
  $('#pdvkx').onclick=pdvClose;const go=()=>{const n=Math.round(pdvNum($('#pdvkn').value))-1,m=$('#pdvkm').value.trim();const it=PDV.items[n];
    if(!it||it.cancel){$('#pdverr').textContent='Item inválido.';return}if(m.length<3){$('#pdverr').textContent='Escreva o motivo.';$('#pdvkm').focus();return}
    it.cancel=m.replace(/[<>]/g,'');PDV.auth=null;pdvClose();pdvChanged()};
  $('#pdvkok').onclick=go;$('#pdvkn').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#pdvkm').focus()}};$('#pdvkm').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}}}
/* F9: consultar preço (não entra na venda) */
function pdvPriceCheck(){pdvModal('preco',`<h2>Consultar preço</h2><input id="pdvpq" placeholder="Leia ou digite o código" autocomplete="off"><div id="pdvpr" aria-live="polite"></div>`,()=>$('#pdvpq').focus());
  $('#pdvpq').onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const p=pdvFind(e.target.value);e.target.value='';
    $('#pdvpr').innerHTML=p?`<div class="pdvlast">${esc(p.name)}</div><div class="pdvbig">${pdvMoney(pdvUnit(p,1))}</div><div class="pdvmut">${esc(p.unit||'')}${PDV.cust?' · preço para '+esc(PDV.cust.name):''}</div>`:'<div class="pdverr">Código não cadastrado.</div>';pdvBeep(!!p)}}
/* F11: venda em espera */
function pdvHold(){const L=pdvLoad('espera',[]);
  if(PDV.items.length){L.push({items:PDV.items,cust:PDV.cust,desc:PDV.desc,em:new Date().toISOString()});pdvSave('espera',L.slice(-10));pdvReset();toast('Venda em espera. F11 de novo para retomar.');return}
  if(!L.length){toast('Nenhuma venda em espera.');return}
  pdvModal('espera',`<h2>Vendas em espera</h2><div class="pdvlist" id="pdvwl">${L.map((v,k)=>`<button type="button" data-id="${k}"><span>${new Date(v.em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${v.items.length} itens${v.cust?' · '+esc(v.cust.name):''}</span><b>Retomar</b></button>`).join('')}</div>`,()=>{const b=document.querySelector('#pdvwl button');if(b)b.focus()});
  document.querySelectorAll('#pdvwl button').forEach(b=>b.onclick=()=>{const v=L.splice(Number(b.dataset.id),1)[0];pdvSave('espera',L);Object.assign(PDV,{items:v.items,cust:v.cust,desc:v.desc,auth:null,saleId:pdvNewId()});pdvClose();pdvChanged()})}
function pdvReset(){Object.assign(PDV,{items:[],cust:null,desc:null,auth:null,quote:null,qty:null,pays:[],saleId:pdvNewId()});pdvSave('venda',null);pdvPaint();pdvFocus()}

/* ---------------------------------------------------------------- pagamento (F10) */
const PDV_FORMAS=[['dinheiro','Dinheiro','1'],['pix','PIX','2'],['debito','Débito','3'],['credito','Crédito','4'],['fiado','Fiado','5']];
async function pdvPay(){if(!PDV.items.some(i=>!i.cancel)){pdvBeep(false);toast('Venda sem itens.');return}
  let T=pdvTotals(),srv=false;
  if(PDV.online){try{const Q=await pdvQuote();if(Q){T=pdvTotals();srv=true;if(Q.needAuth&&!PDV.auth){toast('O desconto precisa da senha do gerente (F6).');pdvDiscount();return}}}catch(e){if(e.status!==0){pdvBeep(false);toast(e.message);return}}}
  PDV.pays=[];PDV.payTotal=T.total;PDV.paySrv=srv;pdvPayPaint()}
function pdvPaid(){return Math.round(PDV.pays.reduce((s,p)=>s+p.valor,0)*100)/100}
function pdvPayPaint(){const T=PDV.payTotal,falta=Math.round((T-pdvPaid())*100)/100,din=PDV.pays.filter(p=>p.forma==='dinheiro').reduce((s,p)=>s+p.valor,0),troco=Math.max(0,-falta);
  const pend=PDV.pays.find(p=>p.forma==='pix'&&!p.conferido);
  pdvModal('pay',`<h2>Pagamento</h2><div class="pdvrow"><span>Total</span><b class="pdvbig">${pdvMoney(T)}</b></div>${PDV.paySrv?'':'<div class="pdvmut">Sem internet: o servidor confere quando a venda for enviada.</div>'}
    <div class="pdvpays">${PDV.pays.map((p,k)=>`<div><span>${esc(PDV_FORMAS.find(f=>f[0]===p.forma)[1])}${p.forma==='pix'?(p.conferido?' · conferido':' · aguardando conferência'):''}</span><b>${pdvMoney(p.valor)} <button type="button" data-rm="${k}" aria-label="Tirar pagamento" style="min-height:32px;padding:0 8px">×</button></b></div>`).join('')}</div>
    ${pend?pdvPixHtml(pend.valor):''}
    <div class="pdvrow"><span>${falta>0?'Falta':'Troco'}</span><b class="pdvbig" style="color:${falta>0?'#B3261E':'#1F5A33'}">${pdvMoney(falta>0?falta:troco)}</b></div>
    ${falta>0?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label for="pdvpf">Forma (1 a 5)</label><select id="pdvpf">${PDV_FORMAS.map(f=>`<option value="${f[0]}">${f[2]} · ${f[1]}</option>`).join('')}</select></div><div><label for="pdvpv">Valor</label><input id="pdvpv" inputmode="decimal" value="${String(falta.toFixed(2)).replace('.',',')}"></div></div>`:''}
    <div class="pdverr" id="pdverr" role="alert"></div>
    <div class="bt"><button type="button" id="pdvpx">Voltar (Esc)</button>${pend?'<button type="button" class="dk" id="pdvpc" tabindex="-1">Conferi o PIX no banco (Ctrl+Enter)</button>':''}${falta<=0&&!pend?'<button type="button" class="ok" id="pdvpok">Finalizar (F10)</button>':''}</div>`,()=>{const f=$('#pdvpf');if(f&&!pend){f.focus()}else{const d=document.querySelector('.pdvmd');d.tabIndex=-1;d.focus()}});
  $('#pdvpx').onclick=pdvClose;document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{PDV.pays.splice(Number(b.dataset.rm),1);pdvPayPaint()});
  const v=$('#pdvpv'),f=$('#pdvpf');
  if(v){v.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();pdvAddPay(f.value,v.value)}};
    f.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();v.focus();v.select()}};
    document.querySelector('.pdvmd').addEventListener('keydown',e=>{if(e.ctrlKey||e.altKey)return;const k=PDV_FORMAS.find(x=>x[2]===e.key);if(k&&document.activeElement!==v){e.preventDefault();f.value=k[0];v.value=String(Math.max(0,PDV.payTotal-pdvPaid()).toFixed(2)).replace('.',',');v.focus();v.select()}})}
  const pc=$('#pdvpc');if(pc){pc.onclick=()=>{pend.conferido=true;pdvPayPaint()};document.querySelector('.pdvmd').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();pc.click()}})}
  const ok=$('#pdvpok');if(ok)ok.onclick=pdvFinish;
  if(pend)pdvPixQr(pend.valor)}
function pdvAddPay(forma,raw){const err=$('#pdverr');const v=Math.round(pdvNum(raw)*100)/100,falta=Math.round((PDV.payTotal-pdvPaid())*100)/100;
  if(!(v>0)){err.textContent='Valor inválido.';return}
  if(/^\d{6,}$/.test(String(raw).trim())){err.textContent='Isto parece um código de barras, não um valor. Digite o valor recebido.';pdvBeep(false);return}
  if(forma==='dinheiro'&&v-falta>200.004){err.textContent='Troco acima de R$ 200,00: confira o valor recebido.';pdvBeep(false);return}
  if(forma!=='dinheiro'&&v>falta+0.004){err.textContent='Só o dinheiro pode passar do total (troco).';return}
  if(forma==='fiado'){if(!PDV.cust){err.textContent='Fiado só com cliente identificado (F4).';return}if(!(PDV.cust.limit>0)){err.textContent='Este cliente não tem limite de fiado.';return}
    const F=PDV.quote&&PDV.quote.fiado;if(F&&F.motivo){err.textContent=F.motivo;return}if(F&&v>F.disponivel+0.004){err.textContent='Passa do limite. Disponível: '+pdvMoney(F.disponivel);return}}
  if(forma==='pix'&&!(PDV.st.cfg&&PDV.st.cfg.pixKey)){err.textContent='Chave PIX não configurada (Painel › Caixa (PDV) › Configurar).';return}
  PDV.pays.push({forma,valor:v,...(forma==='dinheiro'?{recebido:v}:{}),...(forma==='pix'?{conferido:false}:{})});pdvBeep(true);pdvPayPaint()}
/* PIX: "copia e cola" (BR Code) no valor exato, com QR */
function pdvCrc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
function pdvBrCode(valor){const cf=PDV.st.cfg||{},clean=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 .-]/g,'').toUpperCase().trim();
  const f=(id,v)=>id+String(v.length).padStart(2,'0')+v;const tx=('PDV'+String(PDV.saleId||'').replace(/[^A-Za-z0-9]/g,'')).slice(0,25);
  const p=f('00','01')+f('26',f('00','br.gov.bcb.pix')+f('01',String(cf.pixKey).trim()))+f('52','0000')+f('53','986')+f('54',valor.toFixed(2))+f('58','BR')+f('59',clean(cf.pixName||'LOJA').slice(0,25)||'LOJA')+f('60',clean(cf.pixCity||'BRASIL').slice(0,15)||'BRASIL')+f('62',f('05',tx||'***'))+'6304';
  return p+pdvCrc(p)}
const pdvPixHtml=v=>`<div class="pdvqr"><div id="pdvqrimg" class="pdvmut">Gerando QR…</div><code id="pdvqrtxt">${esc(pdvBrCode(v))}</code><div class="pdvmut">Valor exato: ${pdvMoney(v)}. Confira no app do banco antes de apertar "Conferi o PIX".</div></div>`;
function pdvPixQr(v){const draw=()=>{const box=$('#pdvqrimg');if(!box)return;try{const q=window.qrcode(0,'M');q.addData(pdvBrCode(v));q.make();box.innerHTML='<img alt="QR Code do PIX" src="'+q.createDataURL(6,8)+'">'}catch(e){box.textContent='QR indisponível: use o código abaixo (copia e cola).'}};
  if(window.qrcode){draw();return}pdvQrLib().then(draw,()=>{const b=$('#pdvqrimg');if(b)b.textContent='Sem QR (sem internet?): use o código abaixo.'})}
/* gerador de QR carregado ao abrir o caixa (com internet), para o PIX funcionar mesmo se a conexão cair depois */
function pdvQrLib(){if(window.qrcode)return Promise.resolve();if(PDV.qrLib)return PDV.qrLib;PDV.qrLib=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';s.onload=ok;s.onerror=()=>{PDV.qrLib=null;no()};document.head.appendChild(s)});return PDV.qrLib}
async function pdvFinish(){if(PDV.busy)return;PDV.busy=true;const ok=$('#pdvpok');if(ok)ok.disabled=true;
  const body=Object.assign(pdvBody(),{id:PDV.saleId,caixaId:PDV.st.caixa.id,autorizacao:PDV.auth||'',pagamentos:PDV.pays.map(p=>({forma:p.forma,valor:p.valor,recebido:p.recebido,conferido:!!p.conferido})),totalEsperado:PDV.payTotal,clientAt:new Date().toISOString()});
  const snap={items:PDV.items.slice(),cust:PDV.cust,T:pdvTotals(),pays:PDV.pays.slice(),troco:Math.max(0,Math.round((pdvPaid()-PDV.payTotal)*100)/100)};
  try{const r=await api('/api/pdv/venda',body);pdvBeep(true);pdvDone(snap,r.numero,r.status==='revisar'||r.status==='falha')}
  catch(e){if(e.status===0){const F=pdvLoad('fila',[]);F.push(Object.assign(body,{offline:true}));pdvSave('fila',F);pdvBeep(true);pdvDone(snap,null,false);toast('Sem internet: venda guardada no aparelho. Será enviada sozinha.');pdvFila()}
    else{pdvBeep(false);const er=$('#pdverr');if(er)er.textContent=e.message;if(e.data&&e.data.needAuth){PDV.auth=null;pdvClose();pdvDiscount()}if(e.status===409){PDV.quote=null;if(/caixa/i.test(e.message)){pdvClose();toast(e.message);PDV.st=null;renderPdv()}}}}
  finally{PDV.busy=false;const b=$('#pdvpok');if(b)b.disabled=false}}
function pdvDone(snap,numero,revisar){PDV.last=Object.assign(snap,{numero,em:new Date(),caixa:PDV.st.caixa.numero,op:PDV.st.me.nome});pdvClose();pdvReset();
  pdvNote(`<div class="pdvlast">${numero?'Venda nº '+numero+' concluída':'Venda guardada (sem internet)'}</div>${snap.troco>0?`<div class="pdvrow"><span>Troco</span><b class="pdvbig">${pdvMoney(snap.troco)}</b></div>`:''}${revisar?'<div class="pdverr">O gerente confere esta venda no painel.</div>':''}<div class="pdvmut">F8 imprime o comprovante. Pode ler o próximo produto.</div>`)}
/* comprovante 80 mm (impressora térmica pelo navegador). Não é documento fiscal. */
function pdvPrint(){const L=PDV.last;if(!L){toast('Nenhuma venda para imprimir.');return}const box=$('#pdvprint');
  box.innerHTML=`<div class="c"><b>${esc(S.store.name||'')}</b><br>COMPROVANTE DE VENDA<br>(não é documento fiscal)</div><hr>
   <div>${L.numero?'Venda nº '+L.numero:'Venda (enviando)'} · Caixa ${L.caixa}<br>${L.em.toLocaleString('pt-BR')}<br>Operador: ${esc(L.op)}${L.cust?'<br>Cliente: '+esc(L.cust.name):''}</div><hr>
   <table>${L.items.map((i,k)=>{if(i.cancel)return '';const l=L.T.lines[k]||{};return `<tr><td colspan="2">${k+1} ${esc(i.name)}</td></tr><tr><td>${String(i.q).replace('.',',')} x ${pdvMoney(l.unit!=null?l.unit:i.unit)}</td><td class="n">${pdvMoney(i.cancel?0:(l.total!=null?l.total:i.unit*i.q))}</td></tr>`}).join('')}</table><hr>
   <table><tr><td>Subtotal</td><td class="n">${pdvMoney(L.T.sub)}</td></tr>${L.T.desc?`<tr><td>Desconto</td><td class="n">-${pdvMoney(L.T.desc)}</td></tr>`:''}<tr><td><b>TOTAL</b></td><td class="n"><b>${pdvMoney(L.T.total)}</b></td></tr>
   ${L.pays.map(p=>`<tr><td>${esc(PDV_FORMAS.find(f=>f[0]===p.forma)[1])}</td><td class="n">${pdvMoney(p.valor)}</td></tr>`).join('')}${L.troco>0?`<tr><td>Troco</td><td class="n">${pdvMoney(L.troco)}</td></tr>`:''}</table><hr><div class="c">Obrigado pela preferência!</div>`;
  window.print()}

/* ---------------------------------------------------------------- fila sem internet */
function pdvFila(){const n=pdvLoad('fila',[]).length,f=$('#pdvfila');if(f)f.textContent=n?n+' venda'+(n>1?'s':'')+' aguardando envio':''}
let pdvQTimer=null;
function pdvStartQueue(){clearInterval(pdvQTimer);pdvQTimer=setInterval(pdvSendQueue,15000);pdvSendQueue()}
/* envia a fila. Venda só sai da fila quando o servidor GUARDOU (como venda, "a revisar" ou "com problema" para o gerente).
   Sessão vencida, caixa desligado ou erro: a venda continua guardada aqui e tenta de novo depois. */
async function pdvSendQueue(){if(PDV.sending||!SRV.me)return;let F=pdvLoad('fila',[]);if(!F.length)return;PDV.sending=true;
  try{while(F.length){let r;try{r=await api('/api/pdv/venda',F[0])}catch(e){
      if(e.status===401){srvAlert('Entre de novo para enviar as vendas guardadas sem internet.')}
      else if(e.status&&e.status!==0&&e.status<500&&!PDV.warned){PDV.warned=true;srvAlert('Não foi possível enviar uma venda guardada sem internet: '+e.message+'. Ela continua guardada neste aparelho.')}
      break}
    if(r&&r.status==='falha')srvAlert('Venda feita sem internet guardada com problema ('+r.erro+'). O gerente resolve no painel.');
    F.shift();pdvSave('fila',F)}}finally{PDV.sending=false;pdvFila()}}

/* ---------------------------------------------------------------- caixa: abrir, sangria, suprimento, fechar */
function pdvOpenCaixa(){const app=$('#app');app.innerHTML=`<div class="pdv" id="pdvroot"><div class="pdvh"><div class="b"><span class="ic">${PDV_SPARK}</span><span class="wm">tino</span><span class="s">${esc(PDV.st.me.nome)}</span></div></div>
  <div class="pdvlogin"><form class="pdvmd" id="pdvab" style="width:100%"><h2>Abrir o caixa</h2><label for="pdvaf">Fundo de troco (dinheiro na gaveta)</label><input id="pdvaf" inputmode="decimal" placeholder="0,00" required>
  <div class="pdverr" id="pdverr" role="alert"></div><div class="bt"><button class="ok" type="submit">Abrir caixa</button></div></form></div><div id="pdvmodal"></div></div>`;
  setTimeout(()=>{const i=$('#pdvaf');if(i)i.focus()},30);
  $('#pdvab').onsubmit=async e=>{e.preventDefault();const v=pdvNum($('#pdvaf').value||'0');if(!(v>=0)){$('#pdverr').textContent='Valor inválido.';return}
    try{const r=await api('/api/pdv/caixa/abrir',{fundo:v});PDV.st.caixa=r.caixa;pdvBeep(true);renderPdv()}catch(er){$('#pdverr').textContent=er.message}}}
function pdvCaixaMenu(){pdvModal('caixa',`<h2>Caixa nº ${PDV.st.caixa.numero}</h2><div class="pdvlist" id="pdvxm">
  <button type="button" data-id="sangria"><span>Sangria (tirar dinheiro)</span><b>S</b></button><button type="button" data-id="suprimento"><span>Suprimento (pôr troco)</span><b>U</b></button>
  <button type="button" data-id="fechar"><span>Fechar o caixa</span><b>F</b></button><button type="button" data-id="sair"><span>Sair (trocar de operador)</span><b>X</b></button></div>`,()=>{const b=document.querySelector('#pdvxm button');b&&b.focus()});
  const go=id=>id==='fechar'?pdvClose2():id==='sair'?(pdvLoad('fila',[]).length?toast('Há vendas guardadas sem internet. Conecte e espere enviar antes de sair.'):srvLogout()):pdvMov(id);
  document.querySelectorAll('#pdvxm button').forEach(b=>b.onclick=()=>go(b.dataset.id));
  document.querySelector('.pdvmd').addEventListener('keydown',e=>{const m={s:'sangria',u:'suprimento',f:'fechar',x:'sair'}[e.key.toLowerCase()];if(m){e.preventDefault();go(m)}})}
function pdvMov(tipo){pdvModal('mov',`<h2>${tipo==='sangria'?'Sangria':'Suprimento'}</h2><label for="pdvmv">Valor</label><input id="pdvmv" inputmode="decimal"><label for="pdvmm">Motivo</label><input id="pdvmm" maxlength="120">${pdvMgrFields()}<div class="pdverr" id="pdverr" role="alert"></div>
  <div class="bt"><button type="button" id="pdvmx">Cancelar</button><button type="button" class="ok" id="pdvmok">Confirmar</button></div>`,()=>$('#pdvmv').focus());
  $('#pdvmx').onclick=pdvClose;$('#pdvmok').onclick=async()=>{const b=$('#pdvmok');b.disabled=true;try{const r=await api('/api/pdv/caixa/mov',{tipo,valor:pdvNum($('#pdvmv').value),motivo:$('#pdvmm').value,gerente:pdvMgr()});pdvBeep(true);pdvClose();toast((tipo==='sangria'?'Sangria':'Suprimento')+' registrado. Autorizado por '+r.autorizadoPor)}catch(e){pdvBeep(false);$('#pdverr').textContent=e.message}finally{b.disabled=false}}}
/* fechamento às cegas: o operador informa o que contou SEM ver o esperado */
function pdvClose2(){if(pdvLoad('espera',[]).length){toast('Há vendas em espera (F11). Retome ou cancele antes de fechar o caixa.');return}if(pdvLoad('fila',[]).length){toast('Há vendas aguardando envio. Conecte à internet antes de fechar o caixa.');return}if(PDV.items.length){toast('Termine ou ponha em espera a venda aberta antes de fechar.');return}
  pdvModal('fechar',`<h2>Fechar o caixa</h2><p class="pdvmut">Conte e informe. O sistema compara depois.</p>${['dinheiro','pix','debito','credito'].map(f=>`<div><label for="pdvz${f}">${{dinheiro:'Dinheiro na gaveta',pix:'PIX recebido',debito:'Débito (maquininha)',credito:'Crédito (maquininha)'}[f]}</label><input id="pdvz${f}" inputmode="decimal" placeholder="0,00"></div>`).join('')}
  <div class="pdverr" id="pdverr" role="alert"></div><div class="bt"><button type="button" id="pdvzx">Voltar</button><button type="button" class="ok" id="pdvzok">Fechar caixa</button></div>`,()=>$('#pdvzdinheiro').focus());
  $('#pdvzx').onclick=pdvClose;$('#pdvzok').onclick=async()=>{const c={};for(const f of ['dinheiro','pix','debito','credito']){const v=pdvNum($('#pdvz'+f).value||'0');if(!(v>=0)){$('#pdverr').textContent='Valor inválido.';return}c[f]=v}
    if(!confirm('Fechar o caixa agora? Depois de fechado não dá para vender nele.'))return;
    try{const r=await api('/api/pdv/caixa/fechar',{contado:c});PDV.st.caixa=null;pdvTurno(r)}catch(e){$('#pdverr').textContent=e.message}}}
function pdvTurno(r){const L=['dinheiro','pix','debito','credito'],nm={dinheiro:'Dinheiro',pix:'PIX',debito:'Débito',credito:'Crédito'};
  pdvModal('turno',`<h2>Caixa nº ${r.numero} fechado</h2><table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left">Forma</th><th style="text-align:right">Contado</th><th style="text-align:right">Esperado</th></tr>${L.map(f=>`<tr><td>${nm[f]}</td><td style="text-align:right">${pdvMoney(r.contado[f])}</td><td style="text-align:right">${pdvMoney(r.esperado[f])}</td></tr>`).join('')}</table>
   <div class="pdvrow"><span>Vendas</span><b>${r.vendas} · ${pdvMoney(r.totalVendas)}</b></div><div class="pdvrow"><span>Fiado</span><b>${pdvMoney(r.fiado)}</b></div><div class="pdvrow"><span>Sangrias / suprimentos</span><b>${pdvMoney(r.sangria)} / ${pdvMoney(r.suprimento)}</b></div>
   <div class="pdvrow"><span>Diferença</span><b class="pdvbig" style="color:${r.diferenca?'#B3261E':'#1F5A33'}">${pdvMoney(r.diferenca)}</b></div>${r.diferenca?'<p class="pdverr">A diferença vai para o painel do gerente até ser justificada.</p>':''}
   <div class="bt"><button type="button" id="pdvtp">Imprimir relatório</button><button type="button" class="ok" id="pdvtn">Concluir</button></div>`,()=>$('#pdvtn').focus());
  $('#pdvtp').onclick=()=>{$('#pdvprint').innerHTML=`<div class="c"><b>${esc(S.store.name||'')}</b><br>FECHAMENTO DO CAIXA nº ${r.numero}<br>${new Date().toLocaleString('pt-BR')}</div><hr><table>${L.map(f=>`<tr><td>${nm[f]}</td><td class="n">${pdvMoney(r.contado[f])} / ${pdvMoney(r.esperado[f])}</td></tr>`).join('')}<tr><td>Fundo</td><td class="n">${pdvMoney(r.fundo)}</td></tr><tr><td>Vendas (${r.vendas})</td><td class="n">${pdvMoney(r.totalVendas)}</td></tr><tr><td>Fiado</td><td class="n">${pdvMoney(r.fiado)}</td></tr><tr><td>Sangria</td><td class="n">${pdvMoney(r.sangria)}</td></tr><tr><td>Suprimento</td><td class="n">${pdvMoney(r.suprimento)}</td></tr><tr><td><b>Diferença</b></td><td class="n"><b>${pdvMoney(r.diferenca)}</b></td></tr></table><hr><div class="c">Contado / esperado</div>`;window.print()};
  $('#pdvtn').onclick=()=>{pdvClose();renderPdv()}}
function pdvAction(k){if(PDV.busy)return;if(k==='F10'&&PDV.modal==='pay'&&!$('#pdvpok')){pdvBeep(false);const e=$('#pdverr');if(e)e.textContent=PDV.pays.some(p=>p.forma==='pix'&&!p.conferido)?'Confira o PIX no app do banco antes de finalizar.':'Ainda falta receber.';return}({F2:()=>pdvSearch(),F3:pdvQty,F4:pdvCustomer,F6:pdvDiscount,F7:pdvCancelItem,F8:()=>{if(PDV.modal==='fim')pdvClose();pdvPrint()},F9:pdvPriceCheck,F10:()=>PDV.modal==='pay'?($('#pdvpok')?pdvFinish():0):pdvPay(),F11:pdvHold,F12:pdvCaixaMenu,F1:()=>toast('Atalhos na barra de baixo. Esc fecha janelas.')})[k]?.()}

/* ================= painel do administrador: Caixa (PDV) ================= */
async function pdvAdmin(c){c.innerHTML='<div class="sectionhead"><h2>Caixa (PDV)</h2></div><div class="empty">Carregando…</div>';let R;
  try{R=await api('/api/pdv/resumo')}catch(e){c.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
  const cfg=S.pdv||{},F=R.porForma||{},nm={dinheiro:'Dinheiro',pix:'PIX',debito:'Débito',credito:'Crédito',fiado:'Fiado'};
  c.innerHTML=`<div class="sectionhead row" style="justify-content:space-between"><h2>Caixa (PDV)</h2><a class="btn" href="${TBASE}/pdv">Abrir o caixa (tela cheia)</a></div>
   ${R.diferencas.length||R.revisar.length||(R.falhas||[]).length?`<div class="panel" style="border:2px solid #E8A33D;display:grid;gap:8px;margin-bottom:12px"><h3 style="margin:0">Avisos do balcão</h3>
     ${R.diferencas.map(d=>`<div class="row" style="justify-content:space-between"><span>Caixa nº ${d.numero} (${esc(d.operador)}) fechou com diferença de <b>${brl(d.diferenca)}</b></span><span class="row" style="gap:6px"><input id="pj${d.id}" placeholder="Justificativa" style="min-width:200px"><button class="btn ghost" data-pj="${d.id}">Justificar</button></span></div>`).join('')}
     ${R.revisar.map(v=>`<div class="row" style="justify-content:space-between"><span>Venda nº ${v.numero} (${brl(v.total)}) a revisar: ${esc(v.motivo||'')}</span><button class="btn ghost" data-rv="${v.id}">Conferido</button></div>`).join('')}
     ${(R.falhas||[]).map(f=>`<div class="row" style="justify-content:space-between"><span>Venda sem internet de ${esc(f.operador||'')} (${brl(f.total)}) não entrou: ${esc(f.erro)}</span><span class="row" style="gap:6px"><input id="pf${esc(f.id)}" placeholder="O que foi feito" style="min-width:200px"><button class="btn ghost" data-pf="${esc(f.id)}">Resolvido</button></span></div>`).join('')}</div>`:''}
   <div class="pnh small muted" style="margin-bottom:6px">Últimos 7 dias (${esc(R.de)} a ${esc(R.ate)})</div>
   <div class="dbkpis"><div class="dbk hero"><span class="lbl">Vendas no balcão</span><b>${brl(R.total)}</b><span class="muted small">${R.vendas} vendas</span></div>
     <div class="dbk"><span class="lbl">Margem do balcão</span><b>${R.margem==null?'—':String(R.margem).replace('.',',')+'%'}</b><span class="muted small">só o administrador vê</span></div>
     <div class="dbk"><span class="lbl">Descontos</span><b>${brl(R.desconto)}</b></div><div class="dbk"><span class="lbl">Caixas abertos</span><b>${R.caixasAbertos.length}</b><span class="muted small">${R.caixasAbertos.map(x=>esc(x.operador)).join(', ')}</span></div></div>
   <div class="panel" style="margin-bottom:12px"><b>Por forma de pagamento</b><div class="row" style="gap:14px;flex-wrap:wrap;margin-top:6px">${Object.keys(nm).map(k=>`<span>${nm[k]}: <b>${brl(F[k]||0)}</b></span>`).join('')}</div></div>
   <div class="panel" style="margin-bottom:12px"><b>Vendas</b><div class="tablewrap" style="overflow:auto"><table class="btable" style="min-width:640px"><thead><tr><th>Nº</th><th>Quando</th><th>Cliente</th><th>Operador</th><th>Total</th><th></th></tr></thead><tbody>
     ${R.lista.map(v=>`<tr><td>${v.numero}</td><td>${new Date(v.em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td>${esc(v.cliente||'Consumidor')}</td><td>${esc(v.operador||'')}</td><td>${brl(v.total)}${v.desconto?' <span class="small muted">(−'+brl(v.desconto)+(v.autorizou?' · '+esc(v.autorizou):'')+')</span>':''}</td>
       <td>${v.pedidoId?'<span class="small muted">enviado ao faturamento</span>':v.cliente&&v.status==='concluida'?`<button class="btn ghost dlb" data-ft="${v.id}">Enviar para faturamento</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhuma venda no período.</td></tr>'}</tbody></table></div></div>
   <div class="panel" style="margin-bottom:12px"><b>Turnos de caixa</b><div class="olist" style="margin-top:6px">${R.turnos.map(t=>`<div class="row" style="justify-content:space-between"><span>Caixa nº ${t.numero} · ${esc(t.operador)} · ${t.status==='aberto'?'aberto':'fechado'}${t.diferenca?' · diferença '+brl(t.diferenca):''}${t.justificativa?' · justificado':''}</span><button class="btn ghost dlb" data-tr="${t.id}">Relatório</button></div>`).join('')||'<span class="muted">Nenhum turno ainda.</span>'}</div></div>
   <form class="panel" id="pdvcfg" style="display:grid;gap:10px;max-width:640px"><b>Configurar o caixa</b>
     <div class="grid2"><div class="field"><label for="pcmd">Desconto que o caixa dá sem gerente (%)</label><input id="pcmd" inputmode="decimal" value="${esc(cfg.maxDesc??'')}" placeholder="0"></div>
     <div class="field"><label for="pcmm">Margem mínima do balcão (%)</label><input id="pcmm" inputmode="decimal" value="${esc(cfg.minMg??'')}" placeholder="usa a da categoria"></div>
     <div class="field"><label for="pcfd">Prazo do fiado (dias)</label><input id="pcfd" inputmode="numeric" value="${esc(cfg.fiadoDias??30)}"></div>
     <div class="field"><label for="pcpk">Chave PIX</label><input id="pcpk" value="${esc(cfg.pixKey||'')}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></div>
     <div class="field"><label for="pcpn">Nome no PIX</label><input id="pcpn" maxlength="25" value="${esc(cfg.pixName||'')}"></div><div class="field"><label for="pcpc">Cidade no PIX</label><input id="pcpc" maxlength="15" value="${esc(cfg.pixCity||'')}"></div></div>
     <div class="small muted">NFC-e (nota do consumidor) fica para a fase 2: módulo "NFC-e no caixa" na Central.</div><button class="btn" type="submit" style="justify-self:start">Salvar configuração</button></form>`;
  const re=()=>pdvAdmin(c);
  c.querySelectorAll('[data-pj]').forEach(b=>b.onclick=async()=>{try{await api('/api/pdv/justificar',{id:b.dataset.pj,texto:$('#pj'+b.dataset.pj).value});toast('Justificado');re()}catch(e){toast(e.message)}});
  c.querySelectorAll('[data-pf]').forEach(b=>b.onclick=async()=>{try{await api('/api/pdv/falha',{id:b.dataset.pf,texto:$('#pf'+b.dataset.pf).value});toast('Resolvido');re()}catch(e){toast(e.message)}});
  c.querySelectorAll('[data-rv]').forEach(b=>b.onclick=async()=>{try{await api('/api/pdv/revisar',{id:b.dataset.rv});toast('Venda conferida');re()}catch(e){toast(e.message)}});
  c.querySelectorAll('[data-ft]').forEach(b=>b.onclick=async()=>{if(!confirm('Transformar esta venda em pedido para emitir a NF-e?'))return;b.disabled=true;try{const r=await api('/api/pdv/faturar',{id:b.dataset.ft});toast('Pedido nº '+r.no+' criado em "A faturar"');srvRefresh(true);re()}catch(e){toast(e.message);b.disabled=false}});
  c.querySelectorAll('[data-tr]').forEach(b=>b.onclick=async()=>{try{const t=await api('/api/pdv/turno?id='+encodeURIComponent(b.dataset.tr));alert(`Caixa nº ${t.numero} · ${t.operador}\nAberto: ${new Date(t.abertoEm).toLocaleString('pt-BR')}${t.fechadoEm?'\nFechado: '+new Date(t.fechadoEm).toLocaleString('pt-BR'):''}\nFundo: ${brl(t.fundo)} · Vendas: ${t.vendas} (${brl(t.totalVendas)}) · Fiado: ${brl(t.fiado)}\nSangria: ${brl(t.sangria)} · Suprimento: ${brl(t.suprimento)}${t.contado?'\nContado: '+Object.entries(t.contado).map(([k,v])=>k+' '+brl(v)).join(', '):''}\nEsperado: ${Object.entries(t.esperado||{}).map(([k,v])=>k+' '+brl(v)).join(', ')}${t.diferenca!=null?'\nDiferença: '+brl(t.diferenca):''}${t.justificativa?'\nJustificativa: '+t.justificativa+' ('+t.justificadoPor+')':''}${t.cancelados.length?'\nItens cancelados: '+t.cancelados.map(x=>'venda '+x.venda+' '+x.nome+' ('+x.motivo+')').join('; '):''}`)}catch(e){toast(e.message)}});
  if(!$('#pdvcfg'))return;
  $('#pdvcfg').onsubmit=e=>{e.preventDefault();const n=id=>{const v=$(id).value.trim();return v===''?'':pnum(v)};S.pdv={maxDesc:n('#pcmd'),minMg:n('#pcmm'),fiadoDias:n('#pcfd')||30,pixKey:$('#pcpk').value.trim(),pixName:$('#pcpn').value.trim(),pixCity:$('#pcpc').value.trim()};save();toast('Configuração do caixa salva')}}
/* Cadastros › Usuários › Operadores de caixa */
function pdvAdmOperadores(c){const L=S.cashiers||(S.cashiers=[]);
  c.innerHTML=`<div class="panel" style="display:grid;gap:10px;max-width:720px;margin-bottom:12px"><b>Novo operador de caixa</b><div class="grid2"><div class="field"><label for="opn">Nome</label><input id="opn"></div><div class="field"><label for="opl">Usuário</label><input id="opl" autocapitalize="off"></div>
    <div class="field"><label for="opp">Senha base (mín. 8)</label><input id="opp" type="password" autocomplete="new-password"></div></div><div class="err" id="operr"></div><button class="btn" id="opadd" type="button" style="justify-self:start">Adicionar</button>
    <div class="small muted">O operador entra em <b>${esc(location.origin+TBASE)}/pdv</b>. Ele vende e recebe, mas nunca vê custo nem margem.</div></div>
    ${L.length?`<div class="list" style="max-width:720px">${L.map(k=>`<div class="prow" style="grid-template-columns:1fr auto"><div class="t"><b>${esc(k.name||k.login)}</b><span class="small muted">Usuário: ${esc(k.login)} · ${srvPassLabel(k)}</span></div><div class="row" style="gap:6px">${srvResetBtn('cashiers',k)}<button class="btn ghost dlb" data-opdel="${k.id}">Excluir</button></div></div>`).join('')}</div>`:'<div class="empty">Nenhum operador de caixa cadastrado.</div>'}`;
  $('#opadd').onclick=()=>{const n=$('#opn').value.trim(),l=$('#opl').value.trim().toLowerCase(),p=$('#opp').value;
    if(!n||!l||!p){$('#operr').textContent='Preencha nome, usuário e senha.';return}if(p.length<8){$('#operr').textContent='A senha precisa ter pelo menos 8 caracteres.';return}
    if(loginTaken(l)){$('#operr').textContent='O usuário "'+l+'" já é usado por outra pessoa. Escolha outro.';return}
    L.push({id:uid(),name:n,login:l,pass:p});save();toast('Operador adicionado');pdvAdmOperadores(c)};
  c.querySelectorAll('[data-opdel]').forEach(b=>b.onclick=()=>{if(!confirm('Excluir este operador? Ele deixa de entrar no caixa.'))return;S.cashiers=L.filter(x=>x.id!==b.dataset.opdel);save();pdvAdmOperadores(c)})}
/* painel (Visão geral): cartão do balcão, separado das vendas de pedidos */
async function pdvDashCard(){if(!modOn('pdv')||!SRV.me||SRV.me.role!=='admin'||ui.tab!=='hoje')return;const host=$('#tabc');if(!host)return;
  try{const hj=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});const R=await api('/api/pdv/resumo?de='+hj+'&ate='+hj);if(ui.tab!=='hoje'||!$('#tabc'))return;
    const d=document.createElement('div');d.className='panel';d.id='pdvdash';d.style.cssText='display:grid;gap:6px;margin-bottom:12px;border-left:5px solid #E8A33D';
    d.innerHTML=`<b>Balcão (PDV) hoje</b><div class="row" style="gap:16px;flex-wrap:wrap"><span>Vendas: <b>${R.vendas}</b></span><span>Total: <b>${brl(R.total)}</b></span><span>Margem: <b>${R.margem==null?'—':String(R.margem).replace('.',',')+'%'}</b></span></div>${R.diferencas.length?`<div class="warnc">${R.diferencas.length} caixa(s) com diferença aguardando justificativa</div>`:''}${R.revisar.length?`<div class="warnc">${R.revisar.length} venda(s) do balcão a revisar</div>`:''}${(R.falhas||[]).length?`<div class="warnc">${R.falhas.length} venda(s) sem internet com problema</div>`:''}`;
    const old=$('#pdvdash');if(old)old.remove();host.prepend(d)}catch(e){}}
/* Financeiro › Caixa da semana: o balcão (PDV) aparece separado, por dia e por forma */
async function pdvCaixaSemana(){if(!modOn('pdv'))return;const t=today(),W=ui.cxW||0,de=addDays(t,W*7),ate=addDays(de,6);
  try{const R=await api('/api/pdv/resumo?de='+de+'&ate='+ate);const c=$('#tabc');if(!c||ui.finTab!=='caixa')return;const nm={dinheiro:'Dinheiro',pix:'PIX',debito:'Débito',credito:'Crédito',fiado:'Fiado (vai para A receber)'};
    const d=document.createElement('div');d.className='panel';d.style.cssText='display:grid;gap:6px;margin-top:12px;border-left:5px solid #E8A33D';
    d.innerHTML=`<b>Balcão (PDV) nesta semana: ${brl(R.total)} em ${R.vendas} vendas</b><div class="row" style="gap:14px;flex-wrap:wrap">${Object.keys(nm).map(k=>R.porForma[k]?`<span>${nm[k]}: <b>${brl(R.porForma[k])}</b></span>`:'').join('')||'<span class="muted">Nenhuma venda no balcão.</span>'}</div>${R.porDia.length?`<div class="small muted">${R.porDia.map(x=>x.d.slice(8,10)+'/'+x.d.slice(5,7)+': '+brl(x.total)).join(' · ')}</div>`:''}`;
    c.appendChild(d)}catch(e){}}

/* ---------------------------------------------------------------- caixa sem internet
   Ao abrir o caixa COM internet, guarda no aparelho o catálogo que o operador já recebe (sem custo, sem margem,
   sem estoque) e o estado do caixa. Se a página for aberta/recarregada SEM internet, o caixa continua vendendo
   com esse catálogo: as vendas vão para a fila e o servidor confere tudo quando a conexão voltar. */
const PDV_SNAP=()=>'pdv:'+(TSLUG||'@')+':snap';
function pdvSnapSave(){if(!SRV.me||!PDV.st||!PDV.st.caixa)return;const pick=k=>S[k];
  const snap={at:Date.now(),me:SRV.me,T:TENANT,st:PDV.st,S:{store:pick('store'),products:pick('products'),categories:pick('categories'),combos:pick('combos'),customers:pick('customers'),payments:pick('payments'),cashPays:pick('cashPays'),payDays:pick('payDays'),cities:pick('cities'),catTreeV1:pick('catTreeV1')}};
  try{localStorage.setItem(PDV_SNAP(),JSON.stringify(snap))}catch(e){}
  try{if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(r=>r.active&&r.active.postMessage({guardar:[location.pathname,'/app.js']}))}catch(e){}}
function pdvSnapDrop(){try{localStorage.removeItem(PDV_SNAP())}catch(e){}}
function pdvOfflineBoot(){if(!PDV_PATH)return false;let x=null;try{x=JSON.parse(localStorage.getItem(PDV_SNAP())||'null')}catch(e){}
  if(!x||!x.me||!x.st||!x.st.caixa||Date.now()-x.at>3*864e5)return false;   // catálogo de até 3 dias
  SRV.me=x.me;TENANT=x.T||TENANT;S=Object.assign(emptyState(),x.S);srvFix();if(TENANT)srvBrand();PDV.st=x.st;PDV.online=false;PDV.offBoot=true;ui.view='pdv';render();
  toast('Sem internet: caixa aberto com o catálogo guardado. As vendas serão enviadas quando a conexão voltar.');
  window.addEventListener('online',()=>{setTimeout(async()=>{await pdvSendQueue();if(!pdvLoad('fila',[]).length)location.reload()},1500)});return true}

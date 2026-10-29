/* ================= SERVIDOR: os dados e o login ficam no servidor =================
 * O navegador só recebe o que a pessoa logada pode ver (o servidor filtra).
 * Toda gravação vai para o servidor, que confere e recalcula antes de aceitar.
 * Nada de senha, custo ou comissão fica guardado neste aparelho.            */
/* /cliente: link só para clientes (sem textos da equipe; só aceita login de cliente) */
const CLIENT_ONLY=/^\/cliente\/?$/.test(location.pathname);
const SRV={me:null,V:{meta:{}},base:{meta:{}},ord:{},t:null,busy:false,again:false,ver:'',poll:null,lastPass:''};
const SRV_COLLS=['products','customers','orders','receivables','payables','sellers','checkers','billers','vehicles','cities','categories','combos','counts','commPayouts','trips','romaneios','admins'];
const SRV_ORDERED=['products','customers','sellers','checkers','billers','vehicles','cities','categories','combos','admins','payables','receivables'];
const SRV_WRITE={cliente:['orders','customers'],vendedor:['orders'],conferente:['orders','counts'],faturamento:['orders'],entregador:['orders','romaneios','receivables']};
const ROLE_VIEW={admin:'admin',cliente:'cliente',vendedor:'vend',conferente:'conf',faturamento:'fat',entregador:'ent'};
const VIEW_ROLE={admin:'admin',cliente:'cliente',vend:'vendedor',conf:'conferente',fat:'faturamento',ent:'entregador'};
async function api(path,body){
  const opt=body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-App':'1'},body:JSON.stringify(body)};
  let r;try{r=await fetch(path,opt)}catch(e){const er=new Error('Sem conexão com o servidor. Confira a internet.');er.status=0;throw er}
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok){const e=new Error(j.error||('Erro '+r.status));e.status=r.status;e.data=j;throw e}
  return j}
function emptyState(){return {store:{name:'ATACADO DAVILA',pickupDisc:0,pickV:1,onerV:2,pickupOner:false},payments:[],cashPays:[],payDays:{},products:[],customers:[],orders:[],receivables:[],payables:[],sellers:[],checkers:[],billers:[],vehicles:[],cities:[],categories:[],combos:[],counts:[],commPayouts:[],trips:[],romaneios:[],admins:[],seq:1001,catTreeV1:true}}
function srvFix(){const E=emptyState();Object.keys(E).forEach(k=>{if(S[k]==null)S[k]=E[k]});S.store=Object.assign({},E.store,S.store||{});
  (S.products||[]).forEach(p=>{if(p.perPack===undefined)p.perPack=parsePack(p.unit);if(p.code==null)p.code='';if(p.ean==null)p.ean='';p.rules=Object.assign(emptyRules(),p.rules||{})})}
function srvSnap(){SRV.base={meta:{}};SRV.ord={};
  SRV_COLLS.forEach(c=>{SRV.base[c]={};(S[c]||[]).forEach(d=>{if(d&&d.id)SRV.base[c][d.id]=JSON.stringify(d)});SRV.ord[c]=(S[c]||[]).map(d=>d&&d.id)});
  Object.keys(S).forEach(k=>{if(!SRV_COLLS.includes(k)&&k!=='seq')SRV.base.meta[k]=JSON.stringify(S[k])})}
async function loadState(){const r=await api('/api/state');SRV.me=r.me;S=r.S;SRV.V=r.V||{meta:{}};srvFix();srvSnap();
  if(ui.client)ui.client=S.customers.find(c=>c.id===ui.client.id)||null;
  if(SRV.me&&SRV.me.role==='cliente')ui.client=S.customers.find(c=>c.id===SRV.me.refId)||ui.client}
function srvInPlace(t,s){Object.keys(t).forEach(k=>{if(!(k in s))delete t[k]});return Object.assign(t,s)}
function srvDiff(){const ch=[],order={},role=SRV.me&&SRV.me.role,can=c=>role==='admin'||(SRV_WRITE[role]||[]).includes(c);
  SRV_COLLS.forEach(c=>{const arr=S[c]||[],B=SRV.base[c]=SRV.base[c]||{},V=SRV.V[c]||{},ids=new Set();
    arr.forEach(d=>{if(!d||typeof d!=='object')return;if(!d.id)d.id=uid();ids.add(d.id);const s=JSON.stringify(d);if(B[d.id]!==s){if(can(c))ch.push({c,id:d.id,op:'put',doc:d,ver:V[d.id],base:V[d.id]?B[d.id]:undefined});else B[d.id]=s}});
    Object.keys(B).forEach(id=>{if(!ids.has(id)){if(role==='admin')ch.push({c,id,op:'del',ver:V[id]});else delete B[id]}});
    if(role==='admin'&&SRV_ORDERED.includes(c)){const now=arr.map(d=>d&&d.id);if(JSON.stringify(now)!==JSON.stringify(SRV.ord[c]||[]))order[c]=now}});
  Object.keys(S).forEach(k=>{if(SRV_COLLS.includes(k)||k==='seq')return;const s=JSON.stringify(S[k]);if(SRV.base.meta[k]!==s){if(role==='admin')ch.push({c:'meta',id:k,op:'put',doc:S[k],ver:(SRV.V.meta||{})[k]});else SRV.base.meta[k]=s}});
  return {ch,order}}
function srvApply(r,order,sent){const touched=new Set();
  (r.docs||[]).forEach(d=>{touched.add(d.c);
    if(d.c==='meta'){SRV.base.meta[d.id]=JSON.stringify(S[d.id]);(SRV.V.meta=SRV.V.meta||{})[d.id]=d.ver;return}
    const arr=S[d.c]=S[d.c]||[],k=arr.findIndex(x=>x&&x.id===d.id);SRV.V[d.c]=SRV.V[d.c]||{};SRV.base[d.c]=SRV.base[d.c]||{};
    if(d.op==='del'){if(k>=0)arr.splice(k,1);delete SRV.base[d.c][d.id];delete SRV.V[d.c][d.id];return}
    // se a pessoa mexeu de novo enquanto salvava, guarda essas mudanças por cima da versão do servidor
    let delta=null;const sentS=sent&&sent[d.c+':'+d.id];
    if(k>=0&&sentS){const sentO=JSON.parse(sentS),cur=arr[k];if(JSON.stringify(cur)!==sentS){delta={};new Set([...Object.keys(cur),...Object.keys(sentO)]).forEach(x=>{if(JSON.stringify(cur[x])!==JSON.stringify(sentO[x]))delta[x]=cur[x]===undefined?undefined:JSON.parse(JSON.stringify(cur[x]))})}}
    const tgt=k>=0?srvInPlace(arr[k],d.doc):(arr.unshift(d.doc),d.doc);SRV.base[d.c][d.id]=JSON.stringify(tgt);SRV.V[d.c][d.id]=d.ver;
    if(delta)Object.entries(delta).forEach(([x,v])=>{if(v===undefined)delete tgt[x];else tgt[x]=v})});
  (r.drops||[]).forEach(d=>{const arr=S[d.c]||[],k=arr.findIndex(x=>x&&x.id===d.id);if(k>=0)arr.splice(k,1);if(SRV.base[d.c])delete SRV.base[d.c][d.id]});
  Object.entries(order||{}).forEach(([c,ids])=>SRV.ord[c]=ids);
  if(r.seq)S.seq=r.seq;return touched}
function save(){clearTimeout(SRV.t);SRV.t=setTimeout(srvSync,120)}
async function srvSync(){if(!SRV.me)return;if(SRV.busy){SRV.again=true;return}
  const {ch,order}=srvDiff();if(!ch.length&&!Object.keys(order).length)return;
  SRV.busy=true;srvBadge(true);
  try{const sent={};ch.forEach(x=>{if(x.op==='put')sent[x.c+':'+x.id]=JSON.stringify(x.doc)});const r=await api('/api/sync',{changes:ch,order});const t=srvApply(r,order,sent);if(ui.admin&&['customers','sellers','checkers','billers','vehicles','admins'].some(c=>t.has(c)))srvSoftRender();else if(t.has('orders')||t.has('receivables'))srvSoftRender()}
  catch(e){if(e.status===401){toast('Sua sessão terminou. Entre de novo.');setTimeout(()=>location.reload(),1200);return}
    if(e.data&&e.data.mustReset){srvResetScreen();return}
    if(e.status===409){/* alguém gravou o mesmo registro antes: junta as mudanças quando foram em campos diferentes */
      const P=srvPatches(ch);try{await loadState()}catch(_){}
      const m=srvMerge(P);srvSoftRender(true);
      if(m.applied)SRV.again=true;
      if(m.lost)toast('Outra pessoa alterou a mesma informação antes de você. A tela foi atualizada: confira e faça de novo.');
      return}
    toast(e.message||'Não foi possível salvar.');try{await loadState()}catch(_){}srvSoftRender(true)}
  finally{SRV.busy=false;srvBadge(false);if(SRV.again){SRV.again=false;srvSync()}}}
function srvBadge(on){let b=document.getElementById('srvbadge');if(!b){b=document.createElement('div');b.id='srvbadge';b.className='srvbadge';b.textContent='Salvando…';document.body.appendChild(b)}b.hidden=!on}
/* atualiza a tela atual sem perder o que a pessoa está digitando */
function srvSoftRender(force){const typing=(document.activeElement&&document.activeElement.matches('input,textarea,select'))||(ui.tab==='cadastros'&&[...document.querySelectorAll('#cadc input[type=text],#cadc input[type=password]')].some(i=>i.value&&!i.closest('.pwbox')));if(typing&&!force)return;const y=window.scrollY;
  try{renderTop();if(ui.view==='conf'){if(!ui.confSug)renderConf()}else if(ui.view==='vend'){if(!ui.lanc||force)renderVend()}else if(ui.view==='fat')renderFat();else if(ui.view==='ent')renderEnt();else if(ui.view==='cliente'){if(ui.cliPage!=='catalogo'||force)renderClient()}else if(ui.admin&&(force||((ui.tab==='pedidos'&&!ui.lanc&&!ui.adj&&!ui.romView)||ui.tab==='hoje'||(ui.tab==='cadastros'&&!ui.edit&&!ui.selEdit))))renderAdmin()}catch(e){}
  window.scrollTo(0,y)}
function reloadState(){srvRefresh(true)}
async function srvRefresh(force){if(!SRV.me||SRV.busy)return;const {ch}=srvDiff();if(ch.length)return;
  try{const v=await api('/api/version');if(!force&&v.v===SRV.ver)return;SRV.ver=v.v;await loadState();srvSoftRender(force)}
  catch(e){if(e.status===401){location.reload()}}}
function srvStartPoll(){clearInterval(SRV.poll);SRV.poll=setInterval(()=>{if(document.visibilityState==='visible')srvRefresh(false)},20000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')srvRefresh(false)})}
/* entrar: o servidor confere a senha; o navegador nunca vê senha de ninguém */
async function srvLogin(role,u,p,errEl,btn){errEl.textContent='';if(btn)btn.disabled=true;
  try{const me=await api('/api/login',{role:CLIENT_ONLY?'cliente-only':role,login:u,password:p});SRV.me=me;SRV.lastPass=p;
    if(me.mustReset){srvResetScreen();return}await loadState();srvAfterLogin()}
  catch(e){errEl.textContent=e.message||'Não foi possível entrar.'}finally{if(btn)btn.disabled=false}}
function srvAfterLogin(){const me=SRV.me;SRV.lastPass='';ui.view=ROLE_VIEW[me.role]||'cliente';
  if(me.role==='admin'){ui.admin=true;ui.adminName=me.name||me.login}
  if(me.role==='cliente'){const c=S.customers.find(x=>x.id===me.refId);if(!c){toast('Cadastro não encontrado. Fale com a loja.');return}ui.client=c;ui.cart={};ui.nf=ieClient(c);ui.nfData=defaultNf(c);ui.addr=c.address||'';ui.bairro=c.bairro||'';ui.pay=allowedPays(c)[0]||'';ui.cliPage='catalogo'}
  if(me.role==='conferente'){ui.checker=me.name||me.login;ui.confOrder=null}
  if(me.role==='faturamento')ui.biller=me.name||me.login;
  if(me.role==='vendedor'){ui.seller=me.refId;ui.vtab='pedidos';ui.lanc=null}
  if(me.role==='entregador')ui.driver=me.refId;
  try{history.replaceState(null,'',location.pathname+(me.role==='cliente'?'':'#'+me.role))}catch(e){}
  render();srvStartPoll()}
async function srvLogout(){try{await api('/api/logout',{})}catch(e){}try{history.replaceState(null,'',location.pathname)}catch(e){}location.reload()}
/* primeira entrada com senha provisória: a pessoa cria a senha dela */
function srvResetScreen(){ui.view=ROLE_VIEW[SRV.me.role]||'cliente';const app=$('#app');try{renderTop()}catch(e){}$('#topbar').innerHTML=`<div class="brand">${logoImg()}<span class="bt"><span class="bn">${esc(S.store.name||'ATACADO DAVILA')}</span><small>Crie sua senha</small></span></div>`;
  app.innerHTML=`<div class="loginhero"><img src="${LOGO}" alt=""><div>Primeiro acesso</div></div><form class="login panel" id="rsf"><h2>Crie a sua senha</h2>
    <div class="small muted">Olá, ${esc(SRV.me.name||SRV.me.login)}. A senha que você usou é provisória. Crie uma senha só sua${SRV.me.role==='admin'?' (mínimo 10 caracteres)':' (mínimo 8 caracteres)'}, misturando letras e números.</div>
    ${SRV.lastPass?'':'<div class="field"><label for="rso">Senha atual</label><input type="password" id="rso" autocomplete="current-password" required></div>'}
    <div class="field"><label for="rsn">Nova senha</label><input type="password" id="rsn" autocomplete="new-password" required></div>
    <div class="field"><label for="rsn2">Repita a nova senha</label><input type="password" id="rsn2" autocomplete="new-password" required></div>
    <div class="err" id="rse"></div><button class="btn block" type="submit">Salvar e entrar</button><button type="button" class="link" id="rsx" style="margin-top:8px">Sair</button></form>`;
  $('#rsx').onclick=srvLogout;
  $('#rsf').onsubmit=async e=>{e.preventDefault();const cur=SRV.lastPass||$('#rso').value,n=$('#rsn').value;if(n!==$('#rsn2').value){$('#rse').textContent='As senhas não conferem.';return}
    try{await api('/api/password',{current:cur,next:n});SRV.me.mustReset=false;await loadState();srvAfterLogin();toast('Senha criada. Bem-vindo!')}catch(er){$('#rse').textContent=er.message}}}
/* trocar a própria senha quando quiser */
function srvPassScreen(){const app=$('#app');app.innerHTML=`<form class="login panel" id="psf" style="margin-top:18px"><h2>Trocar minha senha</h2>
  <div class="field"><label for="pso">Senha atual</label><input type="password" id="pso" autocomplete="current-password" required></div>
  <div class="field"><label for="psn">Nova senha</label><input type="password" id="psn" autocomplete="new-password" required></div>
  <div class="field"><label for="psn2">Repita a nova senha</label><input type="password" id="psn2" autocomplete="new-password" required></div>
  <div class="err" id="pse"></div><button class="btn block" type="submit">Trocar senha</button><button type="button" class="link" id="psx" style="margin-top:8px">Voltar</button></form>`;
  $('#psx').onclick=()=>render();
  $('#psf').onsubmit=async e=>{e.preventDefault();if($('#psn').value!==$('#psn2').value){$('#pse').textContent='As senhas não conferem.';return}
    try{await api('/api/password',{current:$('#pso').value,next:$('#psn').value});toast('Senha trocada.');render()}catch(er){$('#pse').textContent=er.message}}}
/* links de acesso da equipe na tela de login do cliente (cada pessoa entra pelo seu) */
function srvTeamLinks(cur){return cur==='cliente'&&!CLIENT_ONLY?'<div class="teamlinks small">Equipe da loja (vendedor, conferente, faturamento, motorista e administrador) também entra por aqui, com o usuário e a senha que a loja passou.</div>':''}
function srvBindTeamLinks(){document.querySelectorAll('[data-goview]').forEach(a=>a.onclick=e=>{e.preventDefault();ui.view=a.dataset.goview;try{history.replaceState(null,'','#'+VIEW_ROLE[ui.view])}catch(_){}render()})}
function srvHashView(){if(CLIENT_ONLY)return 'cliente';const h=String(location.hash||'').replace('#','');const k=Object.keys(VIEW_ROLE).find(v=>VIEW_ROLE[v]===h);return k||'cliente'}
/* trava de margem do vendedor: o cálculo é feito no servidor (o vendedor não recebe custo) */
const SRV_LK={};
function srvLockKey(cli,L){return JSON.stringify([cli&&cli.id,L.cart,L.over||{},L.mode,L.pay,!!L.nf,L.editId||'',!!L._tblOk])}
function srvLock(R2,cli,L){if(!R2.items.length||!cli)return null;const k=srvLockKey(cli,L),c=SRV_LK[k];if(c)return c.K?Object.assign({min:0,mg:0},c.K):null;
  if(!SRV_LK['p'+k]){SRV_LK['p'+k]=1;const eo=L.editId&&S.orders.find(o=>o.id===L.editId),keep=eo?Object.fromEntries(eo.items.filter(i=>!i.occLine).map(i=>[i.combo?i.comboId:i.pid,{price:i.price,label:i.label,ie:i.ie,rp:i.rp,base:i.base}])):null;
    api('/api/lock',{cid:cli.id,cart:L.cart,over:L.over||null,mode:L.mode,pay:L.pay,nf:!!L.nf,keep,tblOk:!!L._tblOk}).then(r=>{SRV_LK[k]=r;if(ui.lanc===L){const y=window.scrollY;admLancar();window.scrollTo(0,y)}}).catch(()=>{delete SRV_LK['p'+k]})}
  return null}
function srvItemLevel(p,L,cli){const c=SRV_LK[srvLockKey(cli,L)];return c&&c.levels?c.levels[p.id]||null:null}
/* backup completo vem do servidor (com fotos e sem senhas); restaurar também passa pelo servidor */
async function srvBackup(){try{const j=await api('/api/backup');const ok=await offerFile('backup-atacado-davila-'+stamp()+'.json',JSON.stringify(j));if(ok){S.store.lastBackup=today();save();render()}}catch(e){toast(e.message)}}
async function srvRestore(d){try{const r=await api('/api/restore',{data:d});toast('Backup restaurado: '+r.stats.docs+' registros.');await loadState();render()}catch(e){toast(e.message)}}
/* senhas provisórias para quem ainda não tem senha (mostradas uma única vez) */
async function srvTempPasswords(box){try{const r=await api('/api/temp-passwords',{});if(!r.list.length){box.innerHTML='<div class="small muted">Todo mundo com acesso já tem senha.</div>';return}
  const R={cliente:'Cliente',vendedor:'Vendedor',conferente:'Conferente',faturamento:'Faturamento',entregador:'Entregador'};
  box.innerHTML=`<div class="notice"><b>Anote ou imprima agora:</b> estas senhas aparecem só esta vez. Cada pessoa cria a própria senha no primeiro acesso.</div>
    <div class="tablewrap"><table class="btable"><thead><tr><th>Função</th><th>Nome</th><th>Usuário</th><th>Senha provisória</th></tr></thead><tbody>${r.list.map(x=>`<tr><td>${R[x.role]||x.role}</td><td>${esc(x.name||'')}</td><td>${esc(x.login)}</td><td><b class="num">${esc(x.pass)}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button type="button" class="btn ghost" onclick="window.print()">Imprimir</button></div>`;await loadState()}catch(e){box.innerHTML='<div class="err">'+esc(e.message)+'</div>'}}
function srvPassLabel(x){return x.pass?'senha base (salvando…)':x.hasPass?(x.mustReset?'senha base · aguardando 1º acesso':'senha própria definida'):'sem senha'}
/* primeiro acesso ao sistema novo: criar o administrador (exige o código de instalação) */
async function srvMaybeSetup(){try{const r=await api('/api/setup-status');if(!r.needsSetup||SRV.me)return}catch(e){return}
  const app=$('#app');app.innerHTML=`<div class="loginhero"><img src="${LOGO}" alt=""><div>Primeiro acesso</div></div><form class="login panel" id="stf"><h2>Criar o administrador</h2>
    <div class="small muted">Use o <b>código de instalação</b> que você cadastrou na Vercel (SETUP_CODE). Depois de criado, este formulário não aparece mais.</div>
    <div class="field"><label for="stc">Código de instalação</label><input type="password" id="stc" autocomplete="off" required></div>
    <div class="field"><label for="stn">Seu nome</label><input type="text" id="stn" required></div>
    <div class="field"><label for="stu">Usuário</label><input type="text" id="stu" autocapitalize="none" autocomplete="username" required></div>
    <div class="field"><label for="stp">Senha (mínimo 10 caracteres)</label><input type="password" id="stp" autocomplete="new-password" required></div>
    <div class="field"><label for="stp2">Repita a senha</label><input type="password" id="stp2" autocomplete="new-password" required></div>
    <div class="err" id="ste"></div><button class="btn block" type="submit">Criar e entrar</button></form>`;
  $('#stf').onsubmit=async e=>{e.preventDefault();if($('#stp').value!==$('#stp2').value){$('#ste').textContent='As senhas não conferem.';return}
    try{SRV.me=await api('/api/setup',{code:$('#stc').value,name:$('#stn').value.trim(),login:$('#stu').value.trim(),password:$('#stp').value});await loadState();srvAfterLogin();toast('Administrador criado. Agora restaure o backup em Cadastros › Configurações.')}catch(er){$('#ste').textContent=er.message}}}
/* junção de mudanças (por campo): o que eu mudei x o que estava antes; reaplica se a outra pessoa não mexeu no mesmo campo */
function srvPatches(ch){return ch.filter(x=>x.op==='put').map(x=>{const b=(SRV.base[x.c]||{})[x.id];if(!b)return {c:x.c,id:x.id,isNew:true,doc:x.doc};const o=JSON.parse(b),keys={},was={};
  new Set([...Object.keys(o),...Object.keys(x.doc)]).forEach(k=>{if(JSON.stringify(o[k])!==JSON.stringify(x.doc[k])){keys[k]=x.doc[k];was[k]=o[k]}});return {c:x.c,id:x.id,keys,was}})}
function srvMerge(P){let applied=0,lost=0;
  P.forEach(p=>{const arr=p.c==='meta'?null:(S[p.c]=S[p.c]||[]);
    if(p.c==='meta'){const k=p.id;if(JSON.stringify(S[k])===JSON.stringify(p.was&&p.was[k]))applied++;else lost++;return}
    const d=arr.find(x=>x&&x.id===p.id);
    if(p.isNew){if(!d){arr.unshift(p.doc);applied++}return}
    if(!d){lost++;return}
    const clash=Object.keys(p.keys).some(k=>JSON.stringify(d[k])!==JSON.stringify(p.was[k]));
    if(clash){lost++;return}
    Object.entries(p.keys).forEach(([k,v])=>{if(v===undefined)delete d[k];else d[k]=v});applied++});
  return {applied,lost}}
/* administrador: redefinir a senha de alguém (nova senha base; a pessoa cria a dela no próximo acesso) */
function srvResetBtn(coll,x){return (x&&(x.login||(coll==='customers'&&x.doc)))?`<button type="button" class="btn ghost dlb" data-pwreset="${coll}|${x.id}">${x.hasPass?'Redefinir senha':'Definir senha base'}</button>`:''}
function srvSuggestPass(){const a='abcdefghjkmnpqrstuvwxyz23456789',b=new Uint8Array(8);crypto.getRandomValues(b);let p='';b.forEach(v=>p+=a[v%a.length]);return p.slice(0,4)+'-'+p.slice(4)}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-pwreset]');if(!b||!SRV.me||SRV.me.role!=='admin')return;e.preventDefault();
  const [coll,id]=b.dataset.pwreset.split('|'),d=(S[coll]||[]).find(x=>x.id===id);if(!d)return;const row=b.closest('.prow')||b.parentElement;
  const old=row.parentElement.querySelector('.pwbox[data-for="'+id+'"]');if(old){old.remove();return}
  const box=document.createElement('div');box.className='pwbox';box.dataset.for=id;const nm=d.name||d.driver||d.login||'';
  box.innerHTML=`<b>Senha base para ${esc(nm)}</b><div class="small muted">Usuário de entrada: <b>${esc(d.login||String(d.doc||''))}</b>. A pessoa entra com esta senha e o app pede para ela criar a própria. Você não fica sabendo a senha nova.</div>
    <div class="row" style="gap:6px;align-items:center;flex-wrap:wrap"><input type="text" class="pwin" value="${srvSuggestPass()}" aria-label="Senha base" style="max-width:200px" autocomplete="off"><button type="button" class="btn dlb pwok">Salvar senha base</button><button type="button" class="btn ghost dlb pwx">Cancelar</button></div><div class="err pwerr"></div>`;
  row.after(box);const inp=box.querySelector('.pwin');inp.focus();inp.select();
  box.querySelector('.pwx').onclick=()=>box.remove();
  box.querySelector('.pwok').onclick=async()=>{const pass=inp.value.trim(),er=box.querySelector('.pwerr');er.textContent='';
    if(pass.length<8){er.textContent='Mínimo de 8 caracteres.';return}
    try{await api('/api/users/reset',{coll,id,pass});d.hasPass=true;d.mustReset=true;if(SRV.base[coll])SRV.base[coll][id]=JSON.stringify(d);
      box.innerHTML=`<div class="notice"><b>Pronto.</b> Passe para ${esc(nm)}: usuário <b>${esc(d.login||String(d.doc||''))}</b> e senha base <b class="num">${esc(pass)}</b>. No primeiro acesso o app pede uma senha nova. Se a pessoa estava logada em algum aparelho, foi desconectada.</div>`;
      const lbl=row.querySelector('.pwlbl');if(lbl)lbl.textContent=srvPassLabel(d)}
    catch(er2){er.textContent=er2.message}}});
/* app instalável no celular (sem loja de aplicativos) */
let SRV_INSTALL=null;
try{if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})}catch(e){}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();SRV_INSTALL=e;srvInstallBox()});
window.addEventListener('appinstalled',()=>{SRV_INSTALL=null;srvInstallBox();toast('App instalado na tela do celular.')});
function srvStandalone(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true}
function srvIsIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
/* aparece só nas telas de entrada, para não atrapalhar o uso */
function srvInstallBox(){document.querySelectorAll('.instbox').forEach(x=>x.remove());if(srvStandalone()||SRV.me)return;
  const f=document.querySelector('form.login');if(!f)return;const name=CLIENT_ONLY?"D'Ávila Pedidos":"D'Ávila Equipe";let html='';
  if(SRV_INSTALL)html=`<button type="button" class="btn ghost block" id="instBtn">📲 Instalar o app ${esc(name)} no celular</button>`;
  else if(srvIsIOS())html=`<div class="small muted">📲 Para ter o app na tela do iPhone: no Safari, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.</div>`;
  else if(/android/i.test(navigator.userAgent))html=`<div class="small muted">📲 Para ter o app na tela do celular: no Chrome, toque nos <b>três pontinhos</b> e em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</div>`;
  if(!html)return;const d=document.createElement('div');d.className='instbox';d.innerHTML=html;f.after(d);
  const b=document.getElementById('instBtn');if(b)b.onclick=async()=>{if(!SRV_INSTALL)return;SRV_INSTALL.prompt();try{await SRV_INSTALL.userChoice}catch(e){}SRV_INSTALL=null;srvInstallBox()}}
new MutationObserver(()=>{if(document.querySelector('form.login')&&!document.querySelector('.instbox')&&!SRV.me)srvInstallBox()}).observe(document.documentElement,{childList:true,subtree:true});

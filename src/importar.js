/* ================= IMPORTAÇÃO EM MASSA (StarIA) E ALTERAÇÃO EM MASSA =================
 * Cada importação vira um registro pendente (coleção "imports", só do administrador) que aparece em
 * Produtos › Precificação de notas, igual a uma nota de entrada. Sair da tela não perde nada: o que foi
 * digitado fica gravado no servidor e a linha continua lá até aprovar.
 * Na tela da importação, cada produto tem: nome, custo, tributado?, preço sem IE + margem e,
 * se tributado, preço com IE + margem. Dá para marcar vários e mudar tudo de uma vez.        */
const impOpen=()=>(S.imports||[]).filter(x=>x.status==='consultando'||x.status==='pendente');
const impLeft=im=>(im.items||[]).filter(i=>!i.done);
const imR2=v=>Math.round(Number(v)*100)/100;
/* custo da unidade de venda: custo unitário do StarIA × unidades na embalagem */
const imCost=i=>Number(i.ucost)>0?imR2(Number(i.ucost)*(Number(i.perPack)>1?Number(i.perPack):1)):'';
/* preço que dá a margem pedida (mesma conta da margem com débito e crédito dos tributados) */
function imPriceFor(c,m,trib,ie){if(!(c>0)||m===''||m==null||isNaN(m)||!(m<100))return '';
  if(!trib)return imR2(c/(1-m/100));
  const t=taxCfg(),den=1-(t.pd+icmsVenda(ie))/100-m/100;if(den<=0.01)return '';
  return imR2(c*(1-(t.pc+t.ic)/100)/den)}
function imMg(c,p,trib,ie){const m=rcMargins(c,p,trib,ie);return m?m.mg:null}
const imPctIn=v=>v==null||!isFinite(v)?'':String(Math.round(v*10)/10).replace('.',',');
/* sabor = o que sobra do nome depois da família ("FCKNG BOOSTER 300G - PINK LEMONADE" → "PINK LEMONADE") */
function imVarOf(name,fam){const n=String(name||''),f=String(fam||'').trim();if(!f)return '';
  if(rcNorm(n).startsWith(rcNorm(f))){const r=n.slice(f.length).replace(/^[\s\-–·:/]+/,'').trim();if(r)return r}
  return n}
function imMatch(code,ean){return (S.products||[]).find(p=>(code&&String(p.code||'')===String(code))||(ean&&p.ean&&p.ean===ean))}
function imItemFrom(term,r,mul){const ex=imMatch(String(r.code||''),String(r.ean||''));const pk=ex&&packOf(ex)?packOf(ex):(mul>1?mul:'');
  return {k:'m'+uid(),term:String(term),code:String(r.code||''),ean:String(r.ean||''),name:ex?ex.name:String(r.name||'Produto '+term),src:String(r.src||''),
    ucost:r.cost===''||r.cost==null||!(Number(r.cost)>0)?(ex&&Number(ex.cost)>0?imR2(Number(ex.cost)/(pk>1?pk:1)):''):Number(r.cost),
    pid:ex?ex.id:'',cat:ex?ex.cat||'':'',sub:ex?ex.sub||'':'',fam:ex?ex.fam||'':'',var:ex?ex.var||'':'',unit:ex?ex.unit||'':(pk>1?'Embalagem c/ '+pk+' unidades':'Unidade'),perPack:pk>1?pk:'',
    trib:!!(ex&&ex.trib),price:ex&&Number(ex.price)>0?Number(ex.price):'',iePrice:ex&&ex.trib&&Number(ex.iePrice)>0?Number(ex.iePrice):'',active:ex?ex.active!==false:true,done:false}}
/* preenche a importação quando todas as respostas do StarIA já chegaram */
function impFill(im,res){if(im.status!=='consultando')return false;
  const terms=im.terms||[],get=t=>res?res[t]:stariaCached(t);
  if(terms.some(t=>/^\d+$/.test(t)&&get(t)===undefined))return false;
  const items=[],miss=[];terms.forEach(t=>{const r=/^\d+$/.test(t)?get(t):null;if(r)items.push(imItemFrom(t,r,Number(im.mul)||1));else miss.push({term:t,why:/^\d+$/.test(t)?'não encontrado no StarIA':'código com letras ou símbolos'})});
  im.items=items;im.miss=miss;im.status=items.length?'pendente':'cancelada';im.filledAt=new Date().toISOString();return true}
function impFillAll(){let ch=false;(S.imports||[]).forEach(im=>{if(impFill(im))ch=true});if(ch)save();return ch}
/* cria a importação (no site, pede ao Claude o que ainda não foi consultado) */
function impCreate(terms,res,mul){S.imports=S.imports||[];
  const im={id:uid(),kind:'staria',status:'consultando',terms:[...new Set(terms.map(stNorm).filter(Boolean))],mul:mul>1?mul:1,items:[],miss:[],at:new Date().toISOString(),by:ui.adminName||''};
  S.imports.push(im);
  if(!res&&stariaWeb()){const miss=stariaMissing(im.terms);if(miss.length)stariaQueue(miss)}
  impFill(im,res||null);save();impWatch();return im}
/* enquanto houver importação esperando o Claude, o app confere de tempos em tempos e preenche sozinho */
let IMP_WAIT=null;
function impWatch(){if(IMP_WAIT||typeof SRV==='undefined')return;if(!(S.imports||[]).some(x=>x.status==='consultando'))return;let n=0;
  IMP_WAIT=setInterval(()=>{n++;
    if(impFillAll()&&ui.admin&&ui.tab==='precnotas'){const y=window.scrollY;renderAdmin();window.scrollTo(0,y)}
    if(!(S.imports||[]).some(x=>x.status==='consultando')||n>720){clearInterval(IMP_WAIT);IMP_WAIT=null;return}
    if(n%2===0&&typeof srvRefresh==='function')srvRefresh(false)},5000)}

/* ---------- formulário de alteração em massa (usado aqui e na lista de produtos) ---------- */
function bsHtml(n,withMg){const B=ui.bs=ui.bs||{},v=k=>esc(B[k]||''),sel=(k,a,b)=>`<option value="" ${!B[k]?'selected':''}>Não mudar</option><option value="1" ${B[k]==='1'?'selected':''}>${a}</option><option value="0" ${B[k]==='0'?'selected':''}>${b}</option>`;
  const subs=B.cat?subNames(B.cat):[...new Set(catList().flatMap(c=>c.subs.map(s=>s.name)))];
  const open=ui.bsOpen!=null?ui.bsOpen:window.innerWidth>900;
  return `<details class="panel bsbox" id="bsbox" ${open?'open':''}><summary class="bsh"><b>Alterar em massa</b><span class="small muted"><span id="bsn">${n}</span> marcado(s) · deixe em branco o que não quer mudar · escreva <b>-</b> para apagar subcategoria ou família</span></summary>
    <div class="bsgrid">
      <label>Categoria<input type="text" id="bscat" list="bscatl" value="${v('cat')}" autocomplete="off" placeholder="Ex.: Suplementos"><datalist id="bscatl">${catNames().map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Subcategoria<input type="text" id="bssub" list="bssubl" value="${v('sub')}" autocomplete="off" placeholder="Ex.: Proteínas"><datalist id="bssubl">${subs.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Família (sabores)<input type="text" id="bsfam" value="${v('fam')}" autocomplete="off" placeholder="Ex.: FCKNG BOOSTER 300G"></label>
      <label>Unidade de venda<input type="text" id="bsunit" value="${v('unit')}" autocomplete="off" placeholder="Ex.: Unidade, Caixa c/ 12"></label>
      <label>Unidades na embalagem<input type="number" id="bspk" min="1" step="1" value="${v('pk')}" placeholder="Ex.: 1"></label>
      <label>Tributado<select id="bstr">${sel('tr','Sim','Não')}</select></label>
      <label>Aparece para clientes<select id="bsact">${sel('act','Sim','Não')}</select></label>
      ${withMg?`<label>Margem sem IE (%)<input type="text" inputmode="decimal" id="bsmg" value="${v('mg')}" placeholder="Ex.: 30"></label>
      <label>Margem com IE (%)<input type="text" inputmode="decimal" id="bsmi" value="${v('mi')}" placeholder="só tributados"></label>`:''}
    </div>
    <div class="small muted">A família junta os sabores do mesmo produto: o sabor vem do resto do nome.${withMg?' A margem calcula o preço de cada marcado pelo custo dele.':' Mudar as unidades na embalagem não muda preço nem custo.'}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="bsgo" ${n?'':'disabled'}>Aplicar aos marcados</button><button class="btn ghost" type="button" id="bsclr">Limpar campos</button>${withMg?'<button class="btn ghost" type="button" id="bsrm" '+(n?'':'disabled')+'>Tirar marcados da importação</button>':''}</div></details>`}
function bsKeep(){const B=ui.bs=ui.bs||{};[['cat','bscat'],['sub','bssub'],['fam','bsfam'],['unit','bsunit'],['pk','bspk'],['tr','bstr'],['act','bsact'],['mg','bsmg'],['mi','bsmi']].forEach(([k,id])=>{const x=document.getElementById(id);if(x)B[k]=x.value});return B}
function bsBind(){bsKeep();{const d=$('#bsbox');if(d)d.addEventListener('toggle',()=>{ui.bsOpen=d.open})}
  ['bscat','bssub','bsfam','bsunit','bspk','bstr','bsact','bsmg','bsmi'].forEach(id=>{const x=document.getElementById(id);if(x)x.addEventListener('input',bsKeep)});
  const c=$('#bscat');if(c)c.addEventListener('change',()=>{const dl=$('#bssubl');if(dl)dl.innerHTML=(c.value.trim()?subNames(c.value.trim()):[]).map(x=>`<option value="${esc(x)}">`).join('')});
  const z=$('#bsclr');if(z)z.onclick=()=>{ui.bs={};['bscat','bssub','bsfam','bsunit','bspk','bsmg','bsmi'].forEach(id=>{const x=document.getElementById(id);if(x)x.value=''});['bstr','bsact'].forEach(id=>{const x=document.getElementById(id);if(x)x.value=''})}}
/* lê o formulário: devolve só o que foi preenchido (ou um texto de erro) */
function bsRead(){const B=bsKeep(),o={},t=k=>String(B[k]||'').trim();
  if(t('cat'))o.cat=t('cat');if(t('sub'))o.sub=t('sub')==='-'?'':t('sub');if(t('fam'))o.fam=t('fam')==='-'?'':t('fam');if(t('unit'))o.unit=t('unit');
  if(t('pk')){const n=parseInt(t('pk'));if(!(n>=1))return 'Unidades na embalagem: use um número inteiro (1 ou mais).';o.pk=n}
  if(B.tr)o.trib=B.tr==='1';if(B.act)o.active=B.act==='1';
  if(t('mg')){const m=pnum(t('mg'));if(m===''||!(m<95))return 'Margem sem IE inválida. Ex.: 30';o.mg=m}
  if(t('mi')){const m=pnum(t('mi'));if(m===''||!(m<95))return 'Margem com IE inválida. Ex.: 25';o.mi=m}
  if(!Object.keys(o).length)return 'Preencha pelo menos um campo para alterar.';return o}
/* estrutura: categoria, subcategoria, família/sabor, unidade e embalagem, tributado, ativo */
function bsApplyStruct(x,o){
  if(o.cat!==undefined&&o.cat!==x.cat){x.cat=o.cat;if(o.sub===undefined)x.sub=''}
  if(o.sub!==undefined)x.sub=o.sub;
  if(o.fam!==undefined){x.fam=o.fam;x.var=o.fam?imVarOf(x.name,o.fam):''}
  if(o.unit!==undefined){x.unit=o.unit;if(o.pk===undefined){const n=parsePack(o.unit);if(n)x.perPack=n}}
  if(o.pk!==undefined)x.perPack=o.pk>1?o.pk:'';
  if(o.trib!==undefined)x.trib=o.trib;
  if(o.active!==undefined)x.active=o.active}

/* ---------- tela da importação: precificar em lista ---------- */
function impWaitView(el,im){const P=ui.prc;
  el.innerHTML=`<div class="sectionhead"><h2>Importação StarIA</h2><button class="btn ghost dlb" id="imBack">Voltar</button></div>
    <div class="panel" style="display:grid;gap:10px;max-width:760px"><b>Aguardando o Claude consultar o StarIA (${(im.terms||[]).length} código${(im.terms||[]).length===1?'':'s'}).</b>
      <span class="small muted">Peça no Claude: "processa as consultas do StarIA". Quando ele responder, os produtos aparecem aqui sozinhos para você precificar. Pode sair desta tela: a importação fica guardada aqui em Precificação de notas.</span>
      <div class="pbar"><span style="width:35%" class="pulse"></span></div>
      <div><button class="btn ghost dlb" id="imDel">Cancelar esta importação</button></div></div>`;
  $('#imBack').onclick=()=>{P.imp=null;precScreen(el)};
  $('#imDel').onclick=()=>{if(!confirm('Cancelar esta importação?'))return;im.status='cancelada';save();P.imp=null;precScreen(el)};
  impWatch()}
function impEdit(el,im){im=liveDoc('imports',im);if(im.status==='consultando'){impFillAll();if(im.status==='consultando')return impWaitView(el,im)}
  const P=ui.prc;if(P.selFor!==im.id){P.sel={};ui.bs={}}const SEL=P.sel=P.sel||{};P.selFor=im.id;
  const L=impLeft(im),done=(im.items||[]).length-L.length;
  Object.keys(SEL).forEach(k=>{if(!L.some(i=>i.k===k))delete SEL[k]});
  const nSel=()=>Object.keys(SEL).filter(k=>SEL[k]).length;
  const ready=i=>Number(i.price)>0&&String(i.name||'').trim()&&!(i.trib&&Number(i.iePrice)>0&&Number(i.iePrice)>=Number(i.price));
  const mgCell=(i,ie)=>{const c=imCost(i),p=ie?i.iePrice:i.price,m=imMg(c,Number(p),i.trib,ie);return imPctIn(m)};
  const mkTxt=(i,ie)=>{const c=imCost(i),p=Number(ie?i.iePrice:i.price);return c>0&&p>0?'markup '+rcPct((p-c)/c*100):''};
  const neg=(i,ie)=>{const c=imCost(i),p=Number(ie?i.iePrice:i.price),m=imMg(c,p,i.trib,ie);return m!=null&&m<0};
  const row=i=>{const ex=i.pid?(S.products||[]).find(p=>p.id===i.pid):imMatch(i.code,i.ean);
    return `<div class="imline ${ready(i)?'ok':''} ${SEL[i.k]?'sel':''}" data-k="${i.k}">
      <label class="imck"><input type="checkbox" data-isel="${i.k}" ${SEL[i.k]?'checked':''} aria-label="Marcar ${esc(i.name)}"></label>
      <div class="imn"><input type="text" data-in="${i.k}" value="${esc(i.name)}" aria-label="Nome do produto">
        <span class="small muted">${[i.code&&'Cód. '+esc(i.code),i.ean&&'EAN '+esc(i.ean),esc((i.cat||'sem categoria')+(i.sub?' › '+i.sub:'')),i.fam?'família '+esc(i.fam):'',esc(i.unit||'Unidade')+(Number(i.perPack)>1?' ('+i.perPack+' un.)':''),i.active===false?'<b>não aparece para clientes</b>':'',ex?'<b>já cadastrado: atualiza</b>'+(Number(ex.refCost)>0?' · <b style="color:var(--accent)">custo de referência '+brl(Number(ex.refCost))+'</b>':''):'<b class="mgok">novo</b>'].filter(Boolean).join(' · ')}</span></div>
      <label class="imf imc"><span class="imlbl">Custo (R$)</span><input type="text" inputmode="decimal" class="imnum" data-ic="${i.k}" value="${rcMoney(imCost(i))}" placeholder="0,00" aria-label="Custo de ${esc(i.name)}"></label>
      <label class="imtr switch small"><input type="checkbox" data-itr="${i.k}" ${i.trib?'checked':''}> Tributado</label>
      <label class="imf imp1"><span class="imlbl">Preço s/ IE</span><input type="text" inputmode="decimal" class="imnum imp" data-ip="${i.k}" value="${rcMoney(i.price)}" placeholder="0,00" aria-label="Preço sem IE de ${esc(i.name)}"></label>
      <label class="imf imm1"><span class="imlbl">Margem %</span><input type="text" inputmode="decimal" class="imnum ${neg(i,false)?'neg':''}" data-im="${i.k}" value="${mgCell(i,false)}" placeholder="%" aria-label="Margem sem IE de ${esc(i.name)}"><span class="small muted imk" data-imk="${i.k}">${mkTxt(i,false)}</span></label>
      ${i.trib?`<label class="imf imp2"><span class="imlbl">Preço c/ IE</span><input type="text" inputmode="decimal" class="imnum imp" data-iq="${i.k}" value="${rcMoney(i.iePrice)}" placeholder="0,00" aria-label="Preço com IE de ${esc(i.name)}"></label>
      <label class="imf imm2"><span class="imlbl">Margem %</span><input type="text" inputmode="decimal" class="imnum ${neg(i,true)?'neg':''}" data-imi="${i.k}" value="${mgCell(i,true)}" placeholder="%" aria-label="Margem com IE de ${esc(i.name)}"><span class="small muted imk" data-imki="${i.k}">${mkTxt(i,true)}</span></label>`
      :'<span class="small muted imnoie">não tributado: só preço sem IE</span>'}
    </div>`};
  const t=taxCfg(),nr=L.filter(ready).length;
  el.innerHTML=`<div class="sectionhead"><h2>Precificar importação StarIA</h2><button class="btn ghost dlb" id="imBack">Voltar</button></div>
    <div class="panel rchead"><span><b>${(im.items||[]).length} produto${(im.items||[]).length===1?'':'s'}</b> · ${L.length} pendente${L.length===1?'':'s'}${done?' · '+done+' já aprovado'+(done===1?'':'s'):''}</span>
      <span class="small muted">Criada por ${esc(im.by||'')} em ${dBR(String(im.at||'').slice(0,10))} · custo = valor do fornecedor na última compra (StarIA) · tributado: ICMS de saída ${String(t.idNo).replace('.',',')}% sem IE e ${String(t.idIe).replace('.',',')}% com IE, mais PIS/COFINS ${String(t.pd).replace('.',',')}%. Tudo o que você digita fica salvo: pode sair e voltar depois.</span></div>
    ${(im.miss||[]).length?`<details class="panel" style="margin-bottom:12px"><summary><b>${im.miss.length} código${im.miss.length===1?'':'s'} sem resultado</b></summary>${im.miss.map(m=>`<div class="small"><b class="num">${esc(m.term)}</b> · ${esc(m.why)}</div>`).join('')}</details>`:''}
    ${bsHtml(nSel(),true)}
    <div class="row" style="gap:8px;margin:0 0 8px;align-items:center"><label class="switch small"><input type="checkbox" id="imAll" ${L.length&&nSel()===L.length?'checked':''}> Marcar todos (${L.length})</label></div>
    <div class="imhead"><span></span><span>Produto</span><span>Custo</span><span>Tributado?</span><span>Preço sem IE</span><span>Margem</span><span>Preço com IE</span><span>Margem</span></div>
    <div class="pclist" id="imlist">${L.map(row).join('')}</div>
    <div class="panel rcfoot"><span class="small muted">Linha verde = pronta (tem preço). Ao aprovar, os prontos viram produtos (ou atualizam os que já existem); os outros continuam aqui pendentes.</span>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="imOk" ${nr?'':'disabled'}>Aprovar os prontos (${nr})</button><button class="btn ghost" id="imSave">Salvar e continuar depois</button><button class="btn ghost" id="imDel">Cancelar importação</button></div></div>`;
  bsBind();const LL=()=>impLeft(im);
  const it=k=>(im.items||[]).find(x=>x.k===k);
  let tSave=null;const later=()=>{clearTimeout(tSave);tSave=setTimeout(save,1200)};
  const rer=()=>{const y=window.scrollY;impEdit(el,im);window.scrollTo(0,y)};
  const q=(a,k)=>el.querySelector('['+a+'="'+k+'"]');
  /* atualiza a linha sem redesenhar a tela (não perde o que está sendo digitado) */
  const upLine=(i,skip)=>{const set=(a,v)=>{const x=q(a,i.k);if(x&&x!==skip&&x!==document.activeElement)x.value=v};
    set('data-ip',rcMoney(i.price));set('data-iq',rcMoney(i.iePrice));set('data-im',mgCell(i,false));set('data-imi',mgCell(i,true));
    {const x=q('data-im',i.k);if(x)x.classList.toggle('neg',neg(i,false))}{const x=q('data-imi',i.k);if(x)x.classList.toggle('neg',neg(i,true))}
    {const x=q('data-imk',i.k);if(x)x.textContent=mkTxt(i,false)}{const x=q('data-imki',i.k);if(x)x.textContent=mkTxt(i,true)}
    const ln=el.querySelector('.imline[data-k="'+i.k+'"]');if(ln)ln.classList.toggle('ok',!!ready(i));
    const ok=$('#imOk'),n=LL().filter(ready).length;if(ok){ok.disabled=!n;ok.textContent='Aprovar os prontos ('+n+')'}};
  el.querySelectorAll('[data-in]').forEach(x=>{x.oninput=()=>{const i=it(x.dataset.in);if(!i)return;i.name=x.value;if(i.fam)i.var=imVarOf(i.name,i.fam);later();upLine(i,x)};x.onchange=()=>{const i=it(x.dataset.in);if(i){i.name=x.value.trim();x.value=i.name;save()}}});
  el.querySelectorAll('[data-ic]').forEach(x=>{x.oninput=()=>{const i=it(x.dataset.ic),v=pnum(x.value);if(!i)return;if(v!==''&&v>0){const pk=Number(i.perPack)>1?Number(i.perPack):1;i.ucost=v/pk;later();upLine(i,x)}};
    x.onchange=()=>{const i=it(x.dataset.ic),v=pnum(x.value);if(!i)return;if(x.value.trim()&&!(v>0)){toast('Custo inválido. Ex.: 45,90');x.value=rcMoney(imCost(i));return}
      const pk=Number(i.perPack)>1?Number(i.perPack):1;i.ucost=v===''?'':v/pk;x.value=rcMoney(imCost(i));save();upLine(i)}});
  const price=(a,f,ie)=>el.querySelectorAll('['+a+']').forEach(x=>{const k=x.getAttribute(a);
    x.oninput=()=>{const i=it(k),v=pnum(x.value);if(!i)return;if(v!==''&&v>0){i[f]=v;later();upLine(i,x)}else if(!x.value.trim()){i[f]='';later();upLine(i,x)}};
    x.onchange=()=>{const i=it(k),v=pnum(x.value);if(!i)return;if(x.value.trim()&&!(v>0)){toast('Preço inválido. Ex.: 59,90');x.value=rcMoney(i[f]);return}i[f]=v===''?'':v;x.value=rcMoney(i[f]);save();upLine(i)}});
  price('data-ip','price',false);price('data-iq','iePrice',true);
  const marg=(a,f,ie)=>el.querySelectorAll('['+a+']').forEach(x=>{const k=x.getAttribute(a);
    x.oninput=()=>{const i=it(k),m=pnum(x.value);if(!i)return;const c=imCost(i);if(!(c>0)){return}if(m!==''&&m<95){const p=imPriceFor(c,m,i.trib,ie);if(p>0){i[f]=p;later();upLine(i,x)}}};
    x.onchange=()=>{const i=it(k);if(!i)return;if(x.value.trim()&&!(imCost(i)>0)){toast('Informe o custo primeiro.')}x.value=mgCell(i,ie);save();upLine(i)}});
  marg('data-im','price',false);marg('data-imi','iePrice',true);
  el.querySelectorAll('[data-itr]').forEach(b=>b.onchange=()=>{const i=it(b.dataset.itr);if(!i)return;i.trib=b.checked;if(!b.checked)i.iePrice='';save();rer()});
  /* marcar: só atualiza a contagem (o que está escrito no formulário em massa continua) */
  const upSel=()=>{const n=nSel();const a=$('#bsn');if(a)a.textContent=n;['bsgo','bsrm'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=!n});const all=$('#imAll');if(all)all.checked=LL().length&&n===LL().length};
  el.querySelectorAll('[data-isel]').forEach(b=>b.onchange=()=>{SEL[b.dataset.isel]=b.checked;const ln=el.querySelector('.imline[data-k="'+b.dataset.isel+'"]');if(ln)ln.classList.toggle('sel',b.checked);upSel()});
  $('#imAll').onchange=e=>{LL().forEach(i=>{SEL[i.k]=e.target.checked});el.querySelectorAll('[data-isel]').forEach(b=>{b.checked=e.target.checked;const ln=el.querySelector('.imline[data-k="'+b.dataset.isel+'"]');if(ln)ln.classList.toggle('sel',e.target.checked)});upSel()};
  $('#bsgo').onclick=()=>{const o=bsRead();if(typeof o==='string'){toast(o);return}const ks=LL().filter(i=>SEL[i.k]);if(!ks.length){toast('Marque os produtos primeiro.');return}
    let semCusto=0;ks.forEach(i=>{bsApplyStruct(i,o);
      if(i.trib===false)i.iePrice='';
      if(o.mg!==undefined){const c=imCost(i);if(c>0)i.price=imPriceFor(c,o.mg,i.trib,false);else semCusto++}
      if(o.mi!==undefined&&i.trib){const c=imCost(i);if(c>0)i.iePrice=imPriceFor(c,o.mi,true,true)}});
    save();toast('Alterado em '+ks.length+' produto'+(ks.length===1?'':'s')+(semCusto?' ('+semCusto+' sem custo ficaram sem preço)':''));rer()};
  $('#bsrm').onclick=()=>{const ks=LL().filter(i=>SEL[i.k]);if(!ks.length)return;if(!confirm('Tirar '+ks.length+' produto(s) desta importação? Eles não serão cadastrados.'))return;
    im.items=im.items.filter(i=>!ks.includes(i));ks.forEach(i=>delete SEL[i.k]);if(!impLeft(im).length)im.status=(im.items||[]).length?'aprovada':'cancelada';save();
    if(im.status!=='pendente'){P.imp=null;precScreen(el);return}rer()};
  $('#imBack').onclick=()=>{save();P.imp=null;precScreen(el);window.scrollTo(0,0)};
  $('#imSave').onclick=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();save();toast('Importação salva. Ela continua pendente em Precificação de notas.');P.imp=null;precScreen(el);window.scrollTo(0,0)};
  $('#imDel').onclick=()=>{if(!confirm('Cancelar a importação inteira? Os '+LL().length+' produtos pendentes não serão cadastrados.'))return;im.status='cancelada';save();P.imp=null;precScreen(el)};
  $('#imOk').onclick=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
    const R=LL().filter(ready);if(!R.length){toast('Nenhum produto com preço ainda.');return}
    const bad=LL().filter(i=>i.trib&&Number(i.iePrice)>0&&Number(i.price)>0&&Number(i.iePrice)>=Number(i.price));
    const ng=R.filter(i=>neg(i,false)||(i.trib&&Number(i.iePrice)>0&&neg(i,true)));
    const nNew=R.filter(i=>!(i.pid&&(S.products||[]).some(p=>p.id===i.pid))&&!imMatch(i.code,i.ean)).length;
    if(!confirm('Aprovar '+R.length+' produto(s)? '+nNew+' novo(s) e '+(R.length-nNew)+' atualizado(s).'+(LL().length>R.length?'\n'+(LL().length-R.length)+' sem preço continuam pendentes aqui.':'')+(bad.length?'\n'+bad.length+' com preço com IE maior que o sem IE ficam de fora.':'')+(ng.length?'\nAtenção: '+ng.length+' com margem negativa ('+ng.map(i=>i.name).slice(0,3).join(', ')+').':'')))return;
    R.forEach(i=>{const cost=imCost(i),pk=Number(i.perPack)>1?Number(i.perPack):'';const ie=i.trib&&Number(i.iePrice)>0?Number(i.iePrice):'';
      let p=i.pid&&S.products.find(x=>x.id===i.pid);if(!p)p=imMatch(i.code,i.ean);
      const d={name:String(i.name).trim(),cat:String(i.cat||'').trim()||'Outros',sub:String(i.sub||'').trim(),fam:String(i.fam||'').trim(),var:i.fam?String(i.var||imVarOf(i.name,i.fam)):'',unit:String(i.unit||'').trim()||'Unidade',perPack:pk,price:imR2(i.price),trib:!!i.trib,active:i.active!==false};
      if(p){Object.assign(p,d);if(i.code)p.code=i.code;if(i.ean)p.ean=i.ean;if(cost>0)p.cost=cost;if(d.fam)p.famSync=false;if(i.trib)p.iePrice=ie}
      else{p={id:uid(),code:i.code||'',ean:i.ean||'',...d,famSync:false,cost:cost>0?cost:'',iePrice:ie,tablePrices:{},commission:'',stock:'',minStock:'',idealStock:'',showUnit:true,photo:ph(d.name,(d.name.length*37)%360),rules:emptyRules()};S.products.unshift(p)}
      i.pid=p.id;i.done=true;i.doneAt=new Date().toISOString()});
    if(!impLeft(im).length){im.status='aprovada';im.aprovadaAt=new Date().toISOString();im.aprovadaBy=ui.adminName||''}
    save();toast(R.length+' produto(s) aprovado(s)'+(im.status==='aprovada'?': importação concluída.':'. Os outros continuam pendentes.'));
    if(im.status==='aprovada'){P.imp=null;precScreen(el);window.scrollTo(0,0)}else rer()};
}
/* cartões das importações na lista de Precificação de notas */
function impCards(){const L=impOpen().sort((a,b)=>String(a.at).localeCompare(String(b.at)));if(!L.length)return '';
  return `<h3 class="dech">Importações em massa (StarIA) <span class="cnt2">${L.length}</span></h3><div class="rclist">${L.map(im=>{const n=(im.items||[]).length,left=impLeft(im).length,pr=impLeft(im).filter(i=>Number(i.price)>0).length;
    return `<button class="rccard pend" data-imo="${im.id}"><span><b>Importação StarIA</b> · ${im.status==='consultando'?(im.terms||[]).length+' códigos':n+' produto'+(n===1?'':'s')}</span><span class="small muted">${im.status==='consultando'?'aguardando o Claude consultar o StarIA':left+' pendente'+(left===1?'':'s')+' · '+pr+' com preço'+(n>left?' · '+(n-left)+' já aprovado'+(n-left===1?'':'s'):'')} · criada por ${esc(im.by||'')} em ${dBR(String(im.at||'').slice(0,10))}</span></button>`}).join('')}</div>`}

/* ---------- alteração em massa na lista de produtos (Produtos) ---------- */
function prodBulkHtml(list){const M=ui.pbulk;if(!M)return '';const n=Object.keys(M.sel).filter(k=>M.sel[k]).length;
  return `${bsHtml(n,false)}<div class="row" style="gap:8px;margin:0 0 8px;align-items:center"><label class="switch small"><input type="checkbox" id="pbAll" ${list.length&&list.every(p=>M.sel[p.id])?'checked':''}> Marcar todos da lista (${list.length})</label></div>`}
function prodBulkBind(list,rer){const M=ui.pbulk;if(!M)return;bsBind();const c=$('#tabc');
  const n=()=>Object.keys(M.sel).filter(k=>M.sel[k]).length;
  const upSel=()=>{const a=$('#bsn');if(a)a.textContent=n();const b=$('#bsgo');if(b)b.disabled=!n();const all=$('#pbAll');if(all)all.checked=list.length&&list.every(p=>M.sel[p.id])};
  c.querySelectorAll('[data-psel]').forEach(b=>b.onchange=()=>{M.sel[b.dataset.psel]=b.checked;upSel()});
  $('#pbAll').onchange=e=>{list.forEach(p=>{M.sel[p.id]=e.target.checked});c.querySelectorAll('[data-psel]').forEach(b=>b.checked=e.target.checked);upSel()};
  $('#bsgo').onclick=()=>{const o=bsRead();if(typeof o==='string'){toast(o);return}const ps=S.products.filter(p=>M.sel[p.id]);if(!ps.length){toast('Marque os produtos primeiro.');return}
    const what=[o.cat!==undefined&&'categoria "'+o.cat+'"',o.sub!==undefined&&(o.sub?'subcategoria "'+o.sub+'"':'sem subcategoria'),o.fam!==undefined&&(o.fam?'família "'+o.fam+'"':'sem família'),o.unit!==undefined&&'unidade "'+o.unit+'"',o.pk!==undefined&&o.pk+' un. na embalagem',o.trib!==undefined&&(o.trib?'tributado':'não tributado'),o.active!==undefined&&(o.active?'aparece para clientes':'escondido dos clientes')].filter(Boolean);
    if(!confirm('Alterar '+ps.length+' produto(s): '+what.join(', ')+'?'+(o.pk!==undefined?'\nPreço e custo não mudam.':'')))return;
    ps.forEach(p=>{bsApplyStruct(p,o);if(o.fam!==undefined)p.famSync=false});save();toast('Alterado em '+ps.length+' produto'+(ps.length===1?'':'s'));rer()}}

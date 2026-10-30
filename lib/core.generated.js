'use strict';
/* GERADO por scripts/build-core.js a partir de src/app.source.html. Não editar à mão. */
module.exports = function makeCore(S, ui, uid) {

  const $ = () => null, $$ = () => [], toast = () => {}, render = () => {}, save = () => {};

const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});


/* foto provisória: etiqueta colorida com as iniciais do produto */
function ph(name,hue){
  const ini=name.split(' ').filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="hsl(${hue} 45% 86%)"/><circle cx="150" cy="140" r="78" fill="hsl(${hue} 50% 72%)"/><text x="150" y="162" text-anchor="middle" font-family="Arial" font-weight="700" font-size="64" fill="hsl(${hue} 55% 25%)">${ini}</text><text x="150" y="262" text-anchor="middle" font-family="Arial" font-size="18" fill="hsl(${hue} 40% 35%)">foto de exemplo</text></svg>`;
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
}

/* condições de preço opcionais de cada produto */
function emptyRules(){return{qty:{on:false,tiers:[{min:'',price:''}]},vista:{on:false,price:''},retira:{on:false,price:''},promo:{on:false,price:'',until:''},limite:{on:false,max:''}}}

function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

function promoOk(r){return false}

/* condições de preço em uso (liga/desliga para a loja toda) */
const CONDS=[['qty','Desconto por quantidade',true],['ie','Preço com inscrição estadual (com nota)',true],['retira','Preço de retirada no depósito',true],['vista','Preço à vista',false]];

function condOn(k){const c=(S.store&&S.store.conds)||{};if(c[k]!=null)return !!c[k];const d=CONDS.find(x=>x[0]===k);return d?d[2]:true}

/* menor preço entre as condições que valem para esta quantidade, pagamento e forma de receber */
function priceFor(p,q,mode,pay){
  const r=p.rules||emptyRules();
  let best={price:baseOf(p),label:''};
  const tryp=(v,label)=>{v=Number(v);if(v>0&&v<best.price)best={price:v,label}};
  if(promoOk(r))tryp(ieAdj(p,r.promo.price),'Promoção');
  if(r.qty.on&&condOn('qty'))r.qty.tiers.forEach(t=>{if(t.min>0&&q>=t.min)tryp(ieAdj(p,t.price),'A partir de '+t.min)});
  if(r.vista.on&&condOn('vista')&&(S.cashPays||[]).includes(pay))tryp(ieAdj(p,r.vista.price),'À vista');
  if(r.retira.on&&condOn('retira')&&mode==='retirada')tryp(ieAdj(p,r.retira.price),'Retirada no depósito');
  best.ie=ieOn()&&ieF(p)<1;
  best.rp=!!(r.retira&&r.retira.on&&Number(r.retira.price)>0);
  return best;
}

function packOf(p){const n=p&&Number(p.perPack);return n>1?n:null}

/* produto vendido por peso: a embalagem tem X kg e o preço "unitário" é por kg */
const isKg=p=>!!(p&&p.kg);

/* situação com o nome certo para retirada ou entrega */
/* faturamento obrigatório antes de liberar: todos os pedidos, só os com nota, ou desligado */
const billGate=()=>(S.store&&S.store.billGate)||'todos';

function needsBill(o){const g=billGate();return g==='todos'||(g==='nf'&&!!(o&&o.nf))}


/* ================= NEGOCIAR PREÇO: o cliente propõe preço em poucos produtos, com condições que aumentam o pedido ================= */
function negCfg(){const n=(S.store&&S.store.neg)||{},who=n.who||(n.on===false?'off':'marcados');return {who,on:who!=='off',minItems:n.minItems!=null?Number(n.minItems)||0:5,minTotal:Number(n.minTotal)||0,autoPct:n.autoPct!=null?Number(n.autoPct)||0:3,maxItems:n.maxItems!=null?Math.max(1,Number(n.maxItems)||1):2,defMin:n.defMin!=null&&n.defMin!==''?Number(n.defMin):10}}

/* condições: quantos produtos diferentes e valor do pedido (com os preços normais) */
const negAllowed=c=>{const C=negCfg();return C.who==='todos'||(C.who==='marcados'&&!!(c&&c.canNeg))};

function negState(items){const C=negCfg(),its=items.filter(i=>!i.p.isCombo),n=its.length,sub=items.reduce((s,i)=>s+(i.neg?i.neg.from:i.price)*i.q,0);
  return {C,n,sub,ok:C.on&&negAllowed(ui.client)&&n>=C.minItems&&sub>=C.minTotal-0.004,needN:Math.max(0,C.minItems-n),needV:Math.max(0,C.minTotal-sub)}}

/* resposta na hora: aceita se ficar até X% abaixo do preço e ainda respeitar a margem mínima da política (sem mostrar nada ao cliente) */
function negEval(p,asked,from){const C=negCfg();if(!(asked>0)||!(from>0))return 'an';const off=(from-asked)/from*100;if(off>C.autoPct+1e-9)return 'an';
  const pm=polMin(p),sl=ui.client&&sellerById(ui.client.sellerId),slMin=sl&&setV(sl.minMg)?Number(sl.minMg):null,min=pm?pm.v:slMin!=null?slMin:C.defMin;if(min==null||!(lockCost(p)>0))return 'an';
  const k=ui.mode==='retirada'&&!onerOn()?1-(Number(S.store.pickupDisc)||0)/100:1,net=asked*k,ie=!!(ui.client&&ieClient(ui.client)&&ui.nf);
  const cost=effCost(p,lockCost(p),net,ie),rate=sl?lnCommRate(p,sl.id):0,mg=(net-cost-net*rate/100)/net*100;return mg>=min-1e-9?'ok':'an'}

function negApply(items){const C=negCfg();if(!C.on||!ui.neg||!negAllowed(ui.client))return items;const st=negState(items);if(!st.ok)return items;
  items.forEach(i=>{const v=Number(ui.neg[i.p.id]);if(i.p.isCombo||!(v>0)||!(v<i.price-0.004))return;const s=negEval(i.p,v,i.price);i.neg={from:i.price,asked:v,st:s,lbl:i.label||''};i.price=v;i.label=s==='ok'?'Preço negociado':'Proposta em análise'});return items}


function cartItems(){return negApply(withOner(ONER_M!=null?ONER_M:ui.mode,()=>Object.entries(ui.cart).map(([id,q])=>({p:resolveCart(id),q})).filter(i=>i.p&&i.p.active&&i.q>0).map(i=>Object.assign(i,priceFor(i.p,i.q,ui.mode,ui.pay)))))}

function cartSub(){return cartItems().reduce((s,i)=>s+i.price*i.q,0)}

/* desconto da retirada: vale para os itens que não usaram o preço especial de retirada do produto */
function pickupDisc(){if(ui.mode!=='retirada'||onerOn())return 0;const pc=Number(S.store.pickupDisc)||0;return pc?pickAmt(cartItems().filter(i=>!noDisc(i)),pc):0}

function cartTotal(){return cartSub()-pickupDisc()}

function allowedPays(c){const all=S.payments;return c&&Array.isArray(c.pays)?all.filter(p=>c.pays.includes(p)):all}

const OPEN=['novo','separando','separado','pronto','saiu'];

const origQ=i=>i.qOrig!=null?i.qOrig:i.q;

/* recalcula o pedido depois de ajustar quantidades (preço unitário combinado é mantido) */
function orderTotals(o,qs){
  const its=o.items.map((i,k)=>({i,q:qs?qs[k]:i.q}));
  const sub=Math.round(its.reduce((s,x)=>s+x.i.price*x.q,0)*100)/100;
  const disc=o.discPct?Math.round(its.filter(x=>!noDisc(x.i)).reduce((s,x)=>s+x.i.price*x.q,0)*o.discPct)/100:0;
  return {sub,disc,total:Math.round((sub-disc+(o.fee||0))*100)/100};
}


/* ---------- LANÇAR PEDIDO pelo administrador (cliente que não usa o celular) ---------- */
function withClient(c,fn){const prev=ui.client;ui.client=c;try{return fn()}finally{ui.client=prev}}

const noPickDisc=l=>l==='Retirada no depósito'||l==='Preço negociado'||l==='Proposta em análise';

const noDisc=i=>noPickDisc(i.label)||!!i.rp;

function calcCartFor(c,cart,mode,pay,over,nf,keep){
  return withOner(mode||'',()=>withIe(ieClient(c)&&!!nf,()=>withClient(c,()=>{
    const items=Object.entries(cart).map(([id,q])=>({p:resolveCart(id),q})).filter(i=>i.p&&(i.p.active!==false||(keep&&keep[i.p.id]))&&i.q>0).map(i=>Object.assign(i,priceFor(i.p,i.q,mode,pay),{base:i.p.isCombo?i.p.listPrice:baseOf(i.p)}));
    if(keep)items.forEach(i=>{const k=keep[i.p.id];if(k){i.price=k.price;i.label=k.label;i.ie=k.ie;i.rp=k.rp;if(k.base)i.base=k.base}});
    if(over)items.forEach(i=>{const v=Number(over[i.p.id]);if(v>0){i.std=i.price;i.price=v;i.label='Preço negociado'}});
    const sub=Math.round(items.reduce((s,i)=>s+i.price*i.q,0)*100)/100;
    const pct=mode==='retirada'&&!onerOn()?Number(S.store.pickupDisc)||0:0;
    const disc=pct?pickAmt(items.filter(i=>!noDisc(i)),pct):0;
    return {items,sub,disc,pct,total:Math.round((sub-disc)*100)/100,count:items.reduce((s,i)=>s+i.q,0)};
  })));
}

/* margem na hora de negociar: (preço − custo − comissão) ÷ preço, por embalagem */
function lnCommRate(p,sel){const o=pCommOwn(p);if(o!=='')return o;const s=sellerById(sel);return s?Number(s.commission)||0:0}


/* ---------- estoque: baixa automática quando o pedido é concluído ---------- */
const hasStock=p=>p&&p.stock!==''&&p.stock!=null&&!isNaN(p.stock);

/* deixa o estoque coerente com a situação do pedido: concluído baixa; se sair de concluído, devolve */
function syncStock(o){
  const want={};
  if(o.status==='concluido')o.items.forEach(i=>{if(!(i.q>0))return;(i.combo?(i.components||[]).map(c=>({p:S.products.find(x=>x.id===c.pid),q:c.q*i.q})):[{p:itemProduct(i),q:i.q}]).forEach(({p,q})=>{if(hasStock(p))want[p.id]=(want[p.id]||0)+q})});
  const had=o.stockApplied||{};
  new Set([...Object.keys(want),...Object.keys(had)]).forEach(pid=>{const d=(want[pid]||0)-(had[pid]||0);if(!d)return;const p=S.products.find(x=>x.id===pid);if(p&&hasStock(p))p.stock=Number(p.stock)-d});
  o.stockApplied=want;
}

/* ---------- tabela de preço por cliente (A para os grandes, B para os pequenos) ---------- */
const TABLES=[];

function tableOf(c){return c&&TABLES.includes(c.table)?c.table:''}

/* ---------- preço com IE: contribuinte de ICMS comprando com nota fiscal ---------- */
let IE_CTX=null;

function ieClient(c){return !!(c&&c.ieOk)}

function ieOn(){if(IE_CTX!=null)return IE_CTX;return ui.view==='cliente'&&ieClient(ui.client)&&!!ui.nf}

function ieF(p){if(!condOn('ie'))return 1;const a=Number(p&&p.iePrice),b=Number(p&&p.price);return p&&!p.isCombo&&a>0&&a<b?a/b:1}

/* tabela onerada: o preço do cadastro é o de retirada; para o cliente a tabela sai X% acima (frete) e, retirando, esse X% volta como desconto */
const onerOn=()=>!!S.store.pickupOner&&Number(S.store.pickupDisc)>0;

let ONER_M=null;
function withOner(m,fn){const pr=ONER_M;ONER_M=m;try{return fn()}finally{ONER_M=pr}}

/* tabela onerada: na entrega o preço leva +X% (frete); na retirada fica o preço de cadastro */
const onerPick=()=>ONER_M==='retirada';

function onerF(p){return onerOn()&&!onerPick()&&!(p&&p.rules&&p.rules.retira&&p.rules.retira.on&&Number(p.rules.retira.price)>0)?1+Number(S.store.pickupDisc)/100:1}

function pickAmt(list,pct){const t=list.reduce((s,i)=>s+i.price*i.q,0);return Math.round((onerOn()?t-t/(1+pct/100):t*pct/100)*100)/100}

function ieAdj(p,v){v=Number(v);const f=ieOn()?ieF(p):1;const r=f<1?Math.round(v*f*100)/100:v,o=onerF(p);return o>1?Math.round(r*o*100)/100:r}

function withIe(on,fn){const prev=IE_CTX;IE_CTX=on;try{return fn()}finally{IE_CTX=prev}}

function baseOf(p){const b=ieOn()&&ieF(p)<1?Number(p.iePrice):Number(p.price),o=onerF(p);return o>1?Math.round(b*o*100)/100:b}


/* ---------- limite de crédito ---------- */
const isCash=pay=>(S.cashPays||[]).includes(pay);

function creditInfo(c,extra){
  const limit=Number(c&&c.creditLimit)||0;
  const recs=(S.receivables||[]).filter(r=>r.customerId===c.id&&!r.paidAt);
  const overdue=recs.filter(r=>recStatus(r)==='vencido').reduce((s,r)=>s+r.amount,0);
  const pend=S.orders.filter(o=>o.customerId===c.id&&OPEN.includes(o.status)&&!isCash(o.pay)&&!o.recLaunched).reduce((s,o)=>s+o.total,0);
  const used=Math.round((recs.reduce((s,r)=>s+r.amount,0)+pend)*100)/100;
  const avail=limit?Math.round((limit-used)*100)/100:null;
  let reason='';
  if(overdue>0.004)reason='Você tem '+brl(overdue)+' em parcelas vencidas.';
  else if(limit&&used+(extra||0)>limit+0.004)reason=avail>0?'Este pedido passa do seu limite de crédito. Disponível a prazo: '+brl(avail)+'.':'Seu limite de crédito a prazo está todo utilizado.';
  return {limit,used,avail,overdue,blocked:!!reason,reason};
}

/* formas liberadas para este pedido: bloqueado = só as à vista */
function payOptions(c,total){const ap=allowedPays(c),ci=creditInfo(c,total);return {list:ci.blocked?ap.filter(isCash):ap,ci}}


/* ---------- contas a receber automático ao concluir ---------- */
function autoReceivables(o,prev){
  if(o.status==='concluido'&&!o.recLaunched){
    if(S.store.autoRec===false||isCash(o.pay))return '';
    let k=daysFromPay(o.pay);if(k.startsWith('outro:'))k=k.slice(6);
    const days=parseDays(k);
    if(!k||!days.length)return 'Não identifiquei o prazo de "'+o.pay+'". Lance no contas a receber pelo botão do pedido.';
    const cu=S.customers.find(x=>x.id===o.customerId),grp=uid(),parts=splitParcels(o.total,days),base=today();
    parts.forEach((p,i)=>S.receivables.push({id:uid(),group:grp,auto:true,orderId:o.id,customerId:o.customerId,customer:cu?cu.name:o.customer,orderNo:String(o.no),desc:o.pay,parcel:(i+1)+'/'+parts.length,amount:p.amount,due:addDays(base,p.days),paidAt:'',created:new Date().toISOString()}));
    o.recLaunched=true;o.recAuto=true;
    return parts.length+' parcela'+(parts.length>1?'s geradas':' gerada')+' no contas a receber';
  }
  if(prev==='concluido'&&o.status!=='concluido'&&o.recAuto){
    const mine=S.receivables.filter(r=>r.orderId===o.id&&r.auto);
    if(mine.some(r=>r.paidAt))return 'Este pedido já tem parcela paga. Confira o contas a receber.';
    S.receivables=S.receivables.filter(r=>!(r.orderId===o.id&&r.auto));o.recLaunched=false;o.recAuto=false;
    return 'Parcelas deste pedido removidas do contas a receber';
  }
  return '';
}


/* ---------- avisos para o cliente ---------- */
function statusMsg(o){const n='Seu pedido nº '+o.no;return {separando:n+' está sendo separado.',separado:n+' foi separado e está sendo faturado.',pronto:o.mode==='entrega'?n+' foi separado e logo sai para entrega.':n+' está pronto para retirada no depósito.',saiu:n+' saiu para entrega.',concluido:n+' foi concluído. Obrigado pela compra!',cancelado:n+' foi cancelado. Fale com a loja se tiver dúvida.',novo:n+' voltou para a fila de pedidos.'}[o.status]||''}

function addEvent(o,text){if(text)(o.events=o.events||[]).push({at:new Date().toISOString(),text})}

function setOrderStatus(o,st){const prev=o.status;if(prev===st)return '';o.status=st;if(st==='concluido')o.doneAt=new Date().toISOString();syncStock(o);const m=autoReceivables(o,prev);addEvent(o,statusMsg(o));return m}

const cityById=id=>(S.cities||[]).find(c=>c.id===id);

const nCat=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

/* ---------- VENDEDORES e comissão ---------- */
const sellerById=id=>id?(S.sellers||[]).find(x=>x.id===id):null;

const hasVal=v=>v!==''&&v!=null&&!isNaN(v);

/* comissão própria do produto só vale se for maior que zero; em branco ou 0 vale a do vendedor */
const ownComm=v=>hasVal(v)&&Number(v)>0;

/* política por categoria: margem mínima e comissão (produto > subcategoria > categoria) */
const setV=v=>v!==''&&v!=null&&!isNaN(v);

function catObj(name){return (S.categories||[]).find(c=>nCat(c.name)===nCat(name||'Outros'))||null}

function subObj(cat,sub){const c=catObj(cat);return c&&sub?(c.subs||[]).find(x=>nCat(x.name)===nCat(sub))||null:null}

function polMin(p){if(!p)return null;if(setV(p.minMg))return {v:Number(p.minMg),src:'do produto'};const sb=subObj(p.cat,p.sub);if(sb&&setV(sb.minMg))return {v:Number(sb.minMg),src:'da subcategoria'};const c=catObj(p.cat);if(c&&setV(c.minMg))return {v:Number(c.minMg),src:'da categoria'};return null}

function catComm(p){const sb=subObj(p.cat,p.sub);if(sb&&ownComm(sb.comm))return Number(sb.comm);const c=catObj(p.cat);if(c&&ownComm(c.comm))return Number(c.comm);return null}

function pCommOwn(p){if(!p)return '';if(ownComm(p.commission))return Number(p.commission);const cc=catComm(p);return cc!=null?cc:''}

/* comissão do item: a do produto, se tiver; senão a padrão do vendedor; sem vendedor na venda, zero */
function itemCommRate(o,i){
  const sl=sellerById(o.sellerId);if(!sl)return 0;
  if(hasVal(i.commX))return Number(i.commX);
  const def=hasVal(o.sellerRate)?Number(o.sellerRate):(Number(sl.commission)||0);
  if(i.commP!==undefined)return ownComm(i.commP)?Number(i.commP):def;
  const p=itemProduct(i),own=pCommOwn(p);return own!==''?own:def;
}

const itemNet=(o,i)=>i.price*i.q*(1-((o.discPct&&!noDisc(i))?o.discPct:0)/100);

function orderComm(o){return Math.round(o.items.reduce((s,i)=>s+(i.q>0?itemNet(o,i)*itemCommRate(o,i)/100:0),0)*100)/100}

/* ---------- COMBOS ---------- */
const comboById=id=>(S.combos||[]).find(c=>c.id===id);

/* soma do combo: preço de venda em separado (na tabela do cliente) e custo */
function comboTotals(cb,cli){
  let list=0,cost=0,miss=0;const parts=[];
  (cb.items||[]).forEach(it=>{const p=S.products.find(x=>x.id===it.pid);if(!p)return;const pv=p.price;list+=pv*it.q;if(p.cost>0)cost+=p.cost*it.q;else miss++;parts.push({p,q:it.q,pv})});
  return {list:Math.round(list*100)/100,cost:Math.round(cost*100)/100,miss,parts};
}

/* o combo vira um "produto" para o carrinho, o pedido e os relatórios */
function comboAsProduct(cb,cli){
  const T=comboTotals(cb,cli===undefined?ui.client:cli);
  return {id:'c:'+cb.id,isCombo:true,comboId:cb.id,name:'Combo: '+cb.name,unit:'Combo',code:'',ean:'',cat:'Combos',active:cb.active!==false&&T.parts.length>0,
    price:cb.price,cost:T.miss?'':T.cost,commission:'',rules:emptyRules(),photo:(T.parts[0]&&T.parts[0].p.photo)||ph(cb.name,30),
    listPrice:T.list,components:T.parts.map(x=>({pid:x.p.id,name:x.p.name,code:x.p.code||'',ean:x.p.ean||'',unit:x.p.unit||'',q:x.q})),desc:cb.desc||''};
}

function resolveCart(id){if(String(id).startsWith('c:')){const cb=comboById(id.slice(2));return cb?comboAsProduct(cb):null}return S.products.find(x=>x.id===id)}

const SVid=()=>ui.view==='vend'&&ui.seller?ui.seller:'';

const SVme=()=>sellerById(SVid());

/* margem do pedido (mesma conta do lucro estimado, mas item sem custo conta margem zero, por segurança) */
function lnMargin(R2,cli,L,f){f=f||1;if(!R2.items.length||!(R2.total>0))return null;
  const ie=!!(L.nf&&ieClient(cli)),k=R2.sub>0?R2.total/R2.sub:1;let cost=0,comm=0;
  R2.items.forEach(i=>{const net=i.price*f*k,pc=lockCost(i.p);cost+=(pc>0?effCost(i.p,pc,net,ie):net)*i.q;comm+=net*i.q*lnCommRate(i.p,L.sel)/100});
  const T=R2.total*f;return (T-cost-comm)/T*100}

function lnTarget(R2){const me=SVme();if(!me)return null;const adj=Number(me.minAdj)||0,dflt=setV(me.minMg)?Number(me.minMg):null;let w=0,t=0,any=false;
  R2.items.forEach(i=>{if(i.p.isCombo)return;const pm=polMin(i.p),m=pm?pm.v:dflt;if(m!=null)any=true;const net=i.price*i.q;w+=net;t+=net*(m!=null?m:0)});
  return any&&w>0?Math.max(0,t/w+adj):null}

function lnItemMin(p){const me=SVme();if(!me)return null;const pm=polMin(p),m=pm?pm.v:(setV(me.minMg)?Number(me.minMg):null);return m==null?null:Math.max(0,m+(Number(me.minAdj)||0))}

const mgTol=()=>{const v=S.store&&S.store.mgTol;return v==null||v===''?2:Math.max(0,Number(v)||0)};

function lnLock(R2,cli,L){const me=SVme();if(!me||!R2.items.length)return null;const min=lnTarget(R2);if(min==null)return null;
  const mg=lnMargin(R2,cli,L);if(mg>=min-1e-9)return {ok:true,min,mg,level:mg<min+1?'yellow':'green'};
  if(L._tblOk)return {ok:true,min,mg,level:'yellow',table:true};
  if(mgTol()>0&&mg>=min-mgTol()-1e-9)return {ok:true,min,mg,level:'yellow',tol:true};
  let lo=1,hi=3;if(lnMargin(R2,cli,L,hi)<min)return {ok:false,min,mg,level:'red',need:null};
  for(let k=0;k<40;k++){const m=(lo+hi)/2;if(lnMargin(R2,cli,L,m)>=min)hi=m;else lo=m}
  return {ok:false,min,mg,level:'red',need:Math.ceil(R2.total*(hi-1)*100)/100}}

/* luz por produto (vendedor): margem do item depois da comissão, contra o mínimo dele */
function lnItemLevel(p,packPrice,k,L,cli,tp){const min=lnItemMin(p);if(min==null||!(packPrice>0))return null;const atTable=tp>0&&packPrice>=tp-0.004;const pc=lockCost(p);if(!(pc>0))return atTable?'yellow':'red';
  const ie=!!(L.nf&&ieClient(cli)),net=packPrice*k,cost=effCost(p,pc,net,ie),mg=(net-cost-net*lnCommRate(p,L.sel)/100)/net*100;return mg<min-1e-9?(atTable?'yellow':'red'):mg<min+1?'yellow':'green'}


/* ================= ANÁLISE: pedidos de vendedor abaixo da margem, para você aprovar (e acertar a comissão) ================= */
function anItemCalc(o,i,rate){const net=itemNet(o,i),u=i.q>0?net/i.q:0,c=itemCost(i,u,orderIeSale(o));const cost=c==null?net:c*i.q,comm=net*rate/100;return {net,cost,comm,noCost:c==null,mg:net>0?(net-cost-comm)/net*100:null}}

/* refaz subtotal, desconto de retirada e total do pedido depois de mudar preços */
function reTotal(o){const its=o.items.filter(i=>i.q>0),sub=Math.round(its.reduce((t,i)=>t+i.price*i.q,0)*100)/100,pct=Number(o.discPct)||0;
  const dl=its.filter(i=>!noDisc(i)),t=dl.reduce((x,i)=>x+i.price*i.q,0);o.sub=sub;o.disc=pct?Math.round((onerOn()?t-t/(1+pct/100):t*pct/100)*100)/100:0;o.total=Math.round((sub+(Number(o.fee)||0)-o.disc)*100)/100}


/* ---------- CONTAS A RECEBER ---------- */
const PRAZOS=[['0','À vista'],['7','7 dias'],['14','14 dias'],['21','21 dias'],['28','28 dias'],['30','30 dias'],['7,14','7 / 14'],['7,14,21','7 / 14 / 21'],['14,28','14 / 28'],['7,14,21,28','7 / 14 / 21 / 28'],['30,60','30 / 60'],['30,60,90','30 / 60 / 90'],['outro','Outro prazo']];

const addDays=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);const t=new Date(y,m-1,d+n);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')};

function recStatus(r){if(r.paidAt)return 'pago';return r.due<today()?'vencido':'aberto'}

function parseDays(str){return String(str).split(/[\/,;\s]+/).map(x=>parseInt(x)).filter(n=>!isNaN(n)&&n>=0&&n<=720)}

/* prazo sugerido a partir do nome da forma de pagamento, ex.: "Boleto 14 dias" -> 14 */
function daysFromPay(pay){const ex=S.payDays&&S.payDays[pay];if(ex!=null&&ex!==''){const k=parseDays(ex).join(',');if(k)return PRAZOS.some(p=>p[0]===k)?k:'outro:'+k}const n=String(pay||'').match(/\d+(?:\s*[\/,]\s*\d+)*/);if(!n)return (S.cashPays||[]).includes(pay)?'0':'';const k=parseDays(n[0]).join(',');return PRAZOS.some(p=>p[0]===k)?k:'outro:'+k}

/* divide o valor em parcelas iguais; a última leva os centavos que sobram */
function splitParcels(total,days){const n=days.length,cents=Math.round(total*100),base=Math.floor(cents/n);return days.map((d,i)=>({days:d,amount:(i===n-1?cents-base*(n-1):base)/100}))}

/* acha o produto do item (pedidos antigos não guardavam categoria e custo) */
function itemProduct(i){return (i.pid&&S.products.find(p=>p.id===i.pid))||(i.code&&S.products.find(p=>String(p.code)===String(i.code)))||(i.ean&&S.products.find(p=>p.ean===i.ean))||S.products.find(p=>p.name===i.name)||null}

/* produto TRIBUTADO: custo efetivo = custo da nota − créditos (PIS/COFINS + ICMS) + débitos sobre o preço de venda */
/* ICMS da venda: 7% para cliente com inscrição estadual comprando com nota; 17% para os demais */
function taxCfg(){const t=S.store.tax||{},g=(v,d)=>v===''||v==null||isNaN(Number(v))?d:Number(v);return {pc:g(t.pc,9.25),ic:g(t.ic,7),pd:g(t.pd,9.25),idIe:g(t.idIe!=null?t.idIe:t.id,7),idNo:g(t.idNo,17)}}

function icmsVenda(ie){const t=taxCfg();return ie?t.idIe:t.idNo}

function effCostRaw(cost,price,ie){const t=taxCfg();return Number(cost)*(1-(t.pc+t.ic)/100)+Number(price)*((t.pd+icmsVenda(ie))/100)}

/* custo usado na trava do vendedor e nas propostas do cliente: o maior entre o custo real e o custo de referência (opcional) */
function lockCost(p){const c=Number(p&&p.cost)||0,r=Number(p&&p.refCost)||0;return r>c?r:c}

function effCost(p,cost,price,ie){return p&&p.trib&&Number(cost)>0?effCostRaw(cost,price,ie):Number(cost)}

function orderIeSale(o){if(!o||!o.nf)return false;const c=S.customers.find(x=>x.id===o.customerId);return ieClient(c)}

function itemCost(i,unitPrice,ie){let c=null;if(i.cost>0)c=Number(i.cost);const p=itemProduct(i);if(c==null&&p&&p.cost>0)c=Number(p.cost);if(c==null)return null;return p&&p.trib?effCostRaw(c,unitPrice!=null?unitPrice:i.price,ie||!!i.ie):c}
  return { CONDS, IE_CTX, ONER_M, OPEN, PRAZOS, SVid, SVme, TABLES, addDays, addEvent, allowedPays, anItemCalc, autoReceivables, baseOf, billGate, brl, calcCartFor, cartItems, cartSub, cartTotal, catComm, catObj, cityById, comboAsProduct, comboById, comboTotals, condOn, creditInfo, daysFromPay, effCost, effCostRaw, emptyRules, hasStock, hasVal, icmsVenda, ieAdj, ieClient, ieF, ieOn, isCash, isKg, itemCommRate, itemCost, itemNet, itemProduct, lnCommRate, lnItemLevel, lnItemMin, lnLock, lnMargin, lnTarget, lockCost, mgTol, nCat, needsBill, negAllowed, negApply, negCfg, negEval, negState, noDisc, noPickDisc, onerF, onerOn, onerPick, orderComm, orderIeSale, orderTotals, origQ, ownComm, pCommOwn, packOf, parseDays, payOptions, ph, pickAmt, pickupDisc, polMin, priceFor, promoOk, reTotal, recStatus, resolveCart, sellerById, setOrderStatus, setV, splitParcels, statusMsg, subObj, syncStock, tableOf, taxCfg, today, withClient, withIe, withOner };
};

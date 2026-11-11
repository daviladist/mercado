/* Gerador de Encartes (Tino). Gerado de encartes/index.html por tools/to_tino.py: não editar à mão. */
/* ================= base ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uid=()=>'p'+Math.random().toString(36).slice(2,9);
const clone=o=>JSON.parse(JSON.stringify(o));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const brl=n=>'R$ '+Number(n).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
function parseMoney(s){if(s==null)return null;s=String(s).replace(/r\$/i,'').replace(/\s/g,'');if(!s)return null;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isFinite(n)?Math.round(n*100)/100:null}
const moneyIn=n=>n==null?'':Number(n).toFixed(2).replace('.',',');

const FORMATS={
 story:{w:1080,h:1920,label:'Story',limit:6},
 insta:{w:1080,h:1350,label:'Instagram',limit:9},
 a4:{w:1654,h:2339,label:'A4',limit:16},
 a4h:{w:2339,h:1654,label:'A4 deitado',limit:12},
 tv:{w:1920,h:1080,label:'TV',limit:8},
};
const DAYS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const UNITS=['un','kg','100g','g','L','ml','bandeja','pct','cx','dz','fardo','garrafa','lata','pote','peça','maço','saco','galão','kit','combo','display','rolo','cartela','balde','par','metro','porção','cento'];
const PRESETS=[
 {id:'ofertas',nome:'Ofertas da Semana',dia:-1,titulo:'Ofertas da Semana',cores:{fundo:'#123a8f',cabecalho:'#d71920',titulo:'#ffffff',preco:'#d71920',precoTexto:'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'}},
 {id:'terca',nome:'Terça Verde',dia:2,titulo:'Terça Verde',cores:{fundo:'#1f7a32',cabecalho:'#0e4a1c',titulo:'#ffffff',preco:'#6b3a1e',precoTexto:'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'}},
 {id:'quarta',nome:'Quarta Imbatível',dia:3,titulo:'Quarta Imbatível',cores:{fundo:'#0d2a6e',cabecalho:'#d71920',titulo:'#ffffff',preco:'#d71920',precoTexto:'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'}},
 {id:'sabado',nome:'Sábado: família fazendo compras',src:'/encartes/modelos/head_sabado.jpg',cores:{fundo:'#d9640f',cabecalho:'#14204f',titulo:'#ffffff',preco:'#d71920',precoTexto:'#ffffff',adesivo:'#14204f',adesivoTexto:'#ffffff',cartao:'#ffffff'}},
 {id:'quinta',nome:'Quinta da Carne',dia:4,titulo:'Quinta da Carne',cores:{fundo:'#4a0b0b',cabecalho:'#b3121b',titulo:'#ffffff',preco:'#ffd400',precoTexto:'#8a0b0b',adesivo:'#ffffff',adesivoTexto:'#b3121b',cartao:'#ffffff'}},
 {id:'sexta',nome:'Sexta Show',dia:5,titulo:'Sexta Show',cores:{fundo:'#d71920',cabecalho:'#0d2a6e',titulo:'#ffd400',preco:'#0d2a6e',precoTexto:'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'}},
];
const COLOR_LABELS={fundo:'Fundo',cabecalho:'Cabeçalho e rodapé',titulo:'Texto do título',preco:'Retângulo do preço',precoTexto:'Texto do preço',adesivo:'Adesivo / faixa',adesivoTexto:'Texto do adesivo',cartao:'Cartão do produto'};
/* ---- diagramações: árvore de linhas (R_) e colunas (C_) com espaços de produto (S_) ---- */
const S_=(w=1)=>({t:'s',w}),R_=(w,...k)=>({t:'r',w,k}),C_=(w,...k)=>({t:'c',w,k});
const rowN=(n,w=1)=>R_(w,...Array.from({length:n},()=>S_())),gridT=(cols,rows)=>C_(1,...Array.from({length:rows},()=>rowN(cols)));
const LAYOUTS=[
 {id:'auto',nome:'Automático',auto:true,d:'O app monta sozinho conforme a quantidade'},
 {id:'p1',o:'p',nome:'Oferta do dia',tree:C_(1,S_()),d:'Um produto gigante. Ideal pro status do dia'},
 {id:'p2',o:'p',nome:'Dupla',tree:C_(1,S_(),S_()),d:'Dois produtos, um embaixo do outro'},
 {id:'p3',o:'p',nome:'1 grande + 2',tree:C_(1,S_(1.4),rowN(2)),d:'Âncora em cima e dois de apoio'},
 {id:'p4',o:'p',nome:'1 grande + 3',tree:C_(1,S_(1.3),rowN(3)),d:'Âncora em cima e uma linha de três'},
 {id:'p4g',o:'p',nome:'Grade 4',tree:gridT(2,2),d:'Quatro iguais, sem destaque'},
 {id:'p5',o:'p',nome:'1 grande + 4',tree:C_(1,S_(1.2),rowN(2),rowN(2)),d:'Âncora e quatro médios'},
 {id:'p6L',o:'p',nome:'Destaque em L',tree:C_(1,R_(2,S_(1.5),C_(1,S_(),S_())),rowN(3)),d:'Grande na esquerda, dois do lado, três embaixo'},
 {id:'p6',o:'p',nome:'Grade 6',tree:gridT(2,3),d:'Seis iguais, preço bem grande'},
 {id:'p7',o:'p',nome:'1 grande + 6',tree:C_(1,S_(1.1),rowN(3),rowN(3)),d:'O clássico: âncora e duas linhas de três'},
 {id:'p8m',o:'p',nome:'Mosaico 8',tree:C_(1,R_(1.3,S_(1.5),C_(1,S_(),S_())),R_(1.3,C_(1,S_(),S_()),S_(1.5)),rowN(2)),d:'Dois grandes em lados opostos, ritmo de revista'},
 {id:'p9',o:'p',nome:'Grade 9',tree:gridT(3,3),d:'Nove iguais'},
 {id:'p10z',o:'p',nome:'Zigue-zague 10',tree:C_(1,R_(1,S_(),C_(1,rowN(2),rowN(2))),R_(1,C_(1,rowN(2),rowN(2)),S_())),d:'Grande + 4 menores, depois 4 menores + grande do outro lado'},
 {id:'p10d',o:'p',nome:'2 grandes + 8',tree:C_(1,R_(1.5,S_(),S_()),rowN(4),rowN(4)),d:'Duas âncoras lado a lado e oito embaixo'},
 {id:'p11',o:'p',nome:'3 fortes + 8',tree:C_(1,R_(1.35,S_(),S_(),S_()),rowN(4),rowN(4)),d:'Três itens fortes no topo, 4 + 4 embaixo'},
 {id:'p11c',o:'p',nome:'Capa: 1 + 2 + 8',tree:C_(1,R_(1.7,S_(1.6),C_(1,S_(),S_())),rowN(4),rowN(4)),d:'Frente de tabloide: âncora, dois médios e oito'},
 {id:'p12',o:'p',nome:'Grade 12',tree:gridT(3,4),d:'Doze iguais'},
 {id:'p13',o:'p',nome:'Capa: 1 + 12',tree:C_(1,S_(1.5),rowN(4),rowN(4),rowN(4)),d:'Âncora larga e três linhas de quatro'},
 {id:'p16',o:'p',nome:'Grade 16',tree:gridT(4,4),d:'Dezesseis iguais, bom pro A4'},
 {id:'p20',o:'p',nome:'Verso: 4 + 16',tree:C_(1,R_(1.2,S_(),S_(),S_(),S_()),rowN(4),rowN(4),rowN(4),rowN(4)),d:'Linha de destaques e dezesseis embaixo'},
 {id:'p20g',o:'p',nome:'Grade 20',tree:gridT(4,5),d:'Vinte iguais, verso de tabloide'},
 {id:'p24',o:'p',nome:'Grade 24',tree:gridT(4,6),d:'Vinte e quatro, só pro A4'},
 {id:'p6c',o:'p',nome:'2 destaques + 4',tree:C_(1,R_(1.4,S_(),S_()),rowN(2),rowN(2)),d:'Dois fortes em cima e quatro médios'},
 {id:'p6s',o:'p',nome:'Sanduíche 1 + 4 + 1',tree:C_(1,S_(1.1),rowN(2),rowN(2),S_(1.1)),d:'Um destaque em cima e outro embaixo'},
 {id:'p7lat',o:'p',nome:'Herói lateral 1 + 6',tree:C_(1,R_(3,S_(1.4),C_(1,S_(),S_(),S_())),rowN(3)),d:'Grande alto na esquerda, três do lado e três embaixo'},
 {id:'p8s',o:'p',nome:'Sanduíche 1 + 6 + 1',tree:C_(1,S_(1.1),rowN(3),rowN(3),S_(1.1)),d:'Destaque em cima, seis no meio, destaque embaixo'},
 {id:'p9p',o:'p',nome:'Pirâmide 2 + 3 + 4',tree:C_(1,rowN(2,1.35),rowN(3,1.1),rowN(4)),d:'Do maior pro menor, de cima pra baixo'},
 {id:'p10p',o:'p',nome:'Pirâmide 1 + 2 + 3 + 4',tree:C_(1,S_(1.3),rowN(2,1.15),rowN(3),rowN(4)),d:'Âncora no topo e degraus diminuindo'},
 {id:'p10s',o:'p',nome:'Sanduíche 1 + 8 + 1',tree:C_(1,S_(),rowN(4),rowN(4),S_()),d:'Destaque em cima, oito no meio, destaque embaixo'},
 {id:'p10d4',o:'p',nome:'4 destaques + 6',tree:C_(1,R_(1.5,S_(),S_()),R_(1.5,S_(),S_()),rowN(3),rowN(3)),d:'Quatro fortes em 2×2 e seis embaixo'},
 {id:'p11x',o:'p',nome:'Destaque central 1 + 10',tree:C_(1,rowN(3),R_(1.7,C_(1,S_(),S_()),S_(2.2),C_(1,S_(),S_())),rowN(3)),d:'Âncora no meio, cercada pelos outros'},
 {id:'p12l',o:'p',nome:'4 destaques em linha + 8',tree:C_(1,R_(1.3,S_(),S_(),S_(),S_()),rowN(4),rowN(4)),d:'Faixa de quatro fortes no topo'},
 {id:'p12c',o:'p',nome:'Coluna de destaques 3 + 9',tree:R_(1,C_(1.25,S_(),S_(),S_()),C_(2,rowN(3),rowN(3),rowN(3))),d:'Três grandes na esquerda, nove na direita'},
 {id:'p14',o:'p',nome:'2 destaques + 12',tree:C_(1,R_(1.4,S_(),S_()),rowN(4),rowN(4),rowN(4)),d:'Duas âncoras e doze embaixo'},
 {id:'p15',o:'p',nome:'Grade 15',tree:gridT(3,5),d:'Quinze iguais'},
 {id:'p15c',o:'p',nome:'3 fortes + 12',tree:C_(1,R_(1.3,S_(),S_(),S_()),rowN(4),rowN(4),rowN(4)),d:'Três fortes e três linhas de quatro'},
 {id:'p16c',o:'p',nome:'4 destaques + 12',tree:C_(1,R_(1.3,S_(),S_(),S_(),S_()),rowN(4),rowN(4),rowN(4)),d:'Linha de destaques e doze embaixo'},
 {id:'p18',o:'p',nome:'Grade 18',tree:gridT(3,6),d:'Dezoito iguais'},
 {id:'p22s',o:'p',nome:'Sanduíche 1 + 20 + 1',tree:C_(1,S_(1.3),rowN(5),rowN(5),rowN(5),rowN(5),S_(1.3)),d:'Verso com destaque em cima e embaixo'},
 {id:'p30',o:'p',nome:'Grade 30',tree:gridT(5,6),d:'Trinta iguais, só pro A4'},
 {id:'p35',o:'p',nome:'Grade 35',tree:gridT(5,7),d:'Trinta e cinco, verso de tabloide A4'},
 {id:'l20',nome:'Listão 20',list:[2,10],d:'Lista com foto pequena e preço. Muitos itens'},
 {id:'l30',nome:'Listão 30',list:[2,15],d:'Lista de preços pro verso'},
 {id:'l40',nome:'Listão 40',list:[2,20],d:'Lista grande, só no A4'},
 {id:'h1',o:'l',nome:'Oferta do dia',tree:R_(1,S_()),d:'Um produto gigante'},
 {id:'h2',o:'l',nome:'Dupla',tree:R_(1,S_(),S_()),d:'Dois lado a lado'},
 {id:'h3',o:'l',nome:'1 grande + 2',tree:R_(1,S_(1.5),C_(1,S_(),S_())),d:'Âncora na esquerda e dois do lado'},
 {id:'h3r',o:'l',nome:'Trio',tree:rowN(3),d:'Três iguais'},
 {id:'h5',o:'l',nome:'1 grande + 4',tree:R_(1,S_(1.1),C_(1.4,rowN(2),rowN(2))),d:'Âncora e quatro'},
 {id:'h6',o:'l',nome:'Grade 6',tree:gridT(3,2),d:'Seis iguais'},
 {id:'h7',o:'l',nome:'1 grande + 6',tree:R_(1,S_(),C_(1.9,rowN(3),rowN(3))),d:'Âncora e duas linhas de três'},
 {id:'h8',o:'l',nome:'Grade 8',tree:gridT(4,2),d:'Oito iguais'},
 {id:'h10',o:'l',nome:'Grande, 8, grande',tree:R_(1,S_(),C_(2,rowN(4),rowN(4)),S_()),d:'Uma âncora de cada lado e oito no meio'},
 {id:'h12',o:'l',nome:'Grade 12',tree:gridT(6,2),d:'Doze iguais'},
 {id:'h4',o:'l',nome:'Quatro',tree:rowN(4),d:'Quatro iguais lado a lado'},
 {id:'h4d',o:'l',nome:'4 destaques 2×2',tree:gridT(2,2),d:'Quatro grandes'},
 {id:'h6s',o:'l',nome:'Grande, 4, grande',tree:R_(1,S_(1.3),C_(1.6,rowN(2),rowN(2)),S_(1.3)),d:'Destaque de cada lado e quatro no meio'},
 {id:'h9',o:'l',nome:'1 grande + 8',tree:R_(1,S_(1.2),C_(2.4,rowN(4),rowN(4))),d:'Âncora e oito'},
 {id:'h9x',o:'l',nome:'Destaque central 1 + 8',tree:R_(1,C_(1,S_(),S_()),C_(1,S_(),S_()),S_(1.8),C_(1,S_(),S_()),C_(1,S_(),S_())),d:'Âncora no meio e oito em volta'},
 {id:'l12h',o:'l',nome:'Listão 12',list:[2,6],d:'Lista pra TV'},
];
const leaves=n=>n.t==='s'?1:n.k.reduce((a,k)=>a+leaves(k),0);
LAYOUTS.forEach(l=>{if(l.tree)l.n=leaves(l.tree);if(l.list)l.n=l.list[0]*l.list[1]});
const layById=id=>LAYOUTS.find(l=>l.id===id)||LAYOUTS[0];
const orientOf=fk=>FORMATS[fk].w>FORMATS[fk].h?'l':'p';
function layFits(l,fk){if(l.auto)return true;if(l.list)return orientOf(fk)==='l'?l.id==='l12h':l.id!=='l12h';return l.o===orientOf(fk)}

const PHRASES=['TÁ MUITO BARATO!','POUCAS UNIDADES!','SÓ HOJE!','CORRE QUE ACABA!','IMPERDÍVEL!','LEVE 3 PAGUE 2'];

function P(o){return Object.assign({id:uid(),code:'',desc:'',unit:'un',price:null,old:null,phrase:'',featured:false,limit:0,sel:true,zoom:1,dy:0,setor:''},o)}
function sample(){return[
 P({desc:'Arroz tipo 1 5kg',price:26.9,app:24.9,appOn:true,limit:6,phrase:'TÁ MUITO BARATO!',featured:true,setor:'Mercearia'}),
 P({desc:'Feijão carioca 1kg',price:6.99,setor:'Mercearia'}),
 P({desc:'Óleo de soja 900ml',price:7.99,app:7.49,appOn:true,setor:'Mercearia'}),
 P({desc:'Açúcar cristal 5kg',price:19.9,setor:'Mercearia'}),
 P({desc:'Café torrado e moído 500g',price:17.9,phrase:'POUCAS UNIDADES!',limit:3,setor:'Mercearia'}),
 P({desc:'Leite UHT integral 1L',price:4.79,setor:'Frios e laticínios'}),
 P({desc:'Macarrão espaguete 500g',price:3.49,setor:'Mercearia'}),
]}
const SETORES=[['Hortifruti','#2f8f3a'],['Açougue','#b3121b'],['Mercearia','#123a8f'],['Frios e laticínios','#0277bd'],['Padaria','#8d5524'],['Bebidas','#6a1b9a'],['Limpeza','#00838f'],['Higiene e beleza','#c2185b'],['Congelados','#0097a7'],['Bazar','#546e7a']].map(([nome,cor])=>({nome,cor}));
const SEC_PAL=['#2f8f3a','#b3121b','#123a8f','#0277bd','#8d5524','#6a1b9a','#00838f','#c2185b','#e65100','#546e7a'];
function defaults(){return{format:'insta',campaignId:'ofertas',campaigns:clone(PRESETS),phrases:[...PHRASES],store:{nome:'',wa:'',ends:'',extra:''},val:{ini:today(),fim:today()},products:sample(),saved:[],tvSec:5,page:0,plaqPer:2,vidVert:false,lay:{},artes:{},setores:clone(SETORES)}}

const LS='gerador-encartes-v1';
let S;
try{S=JSON.parse(localStorage.getItem(LS))}catch(e){S=null}
if(!S||!Array.isArray(S.products))S=defaults();
S=Object.assign(defaults(),S);
(function onOpen(){
 const d=new Date().getDay();const m=S.campaigns.find(c=>+c.dia===d);if(m)S.campaignId=m.id;
 if(!S.val.fim||S.val.fim<today())S.val={ini:today(),fim:today()};
})();
const camp=()=>S.campaigns.find(c=>c.id===S.campaignId)||S.campaigns[0];

let saveT;function persist(){S.savedAt=Date.now();clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}},300);cloudSave()}
let rafP;function schedule(){cancelAnimationFrame(rafP);rafP=requestAnimationFrame(render)}
function changed(list=true){undoSnap();if(list){autoMatchPhotos();renderList();renderSecs()}schedule();persist()}

let toastT;function toast(t,ms=2600){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,ms)}

/* ================= imagens (IndexedDB) ================= */
const IDB=(()=>{const mem=new Map();let dbp;
 function open(){if(dbp)return dbp;dbp=new Promise(res=>{try{const r=indexedDB.open('encartes-img',1);r.onupgradeneeded=()=>r.result.createObjectStore('img');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}});return dbp}
 async function get(k){if(mem.has(k))return mem.get(k);const db=await open();if(!db)return null;return new Promise(res=>{try{const q=db.transaction('img').objectStore('img').get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch(e){res(null)}})}
 async function set(k,v,fromCloud){mem.set(k,v);if(!fromCloud)cloudPutImage(k,v);const db=await open();if(!db)return;try{db.transaction('img','readwrite').objectStore('img').put(v,k)}catch(e){}}
 async function del(k){mem.delete(k);cloudDelImage(k);const db=await open();if(!db)return;try{db.transaction('img','readwrite').objectStore('img').delete(k)}catch(e){}}
 async function keys(){const db=await open();if(!db)return[...mem.keys()];return new Promise(res=>{try{const q=db.transaction('img').objectStore('img').getAllKeys();q.onsuccess=()=>res([...new Set([...q.result.map(String),...mem.keys()])]);q.onerror=()=>res([...mem.keys()])}catch(e){res([...mem.keys()])}})}
 return{get,set,del,keys}})();
const imgCache=new Map(); // key -> {img,url}
const ownKey=p=>p.code&&p.code.trim()?'c:'+p.code.trim():'id:'+p.id;
const imgKey=p=>p.imgAlias&&imgCache.has(p.imgAlias)&&!imgCache.has(ownKey(p))?p.imgAlias:ownKey(p);
const getImg=p=>imgCache.get(imgKey(p))?.img||null;
const logos=[null,null];
const artCache=new Map(),artKey=(cid,fk)=>`art:${cid}:${fk}`;
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function fileToURL(f){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)})}
function trimCanvas(c,alphaOnly){
 const x=c.getContext('2d');const w=c.width,h=c.height;const d=x.getImageData(0,0,w,h).data;
 if(!alphaOnly){let t=0;for(let k=3;k<d.length;k+=16)if(d[k]<24)t++;if(t/(d.length/16)>0.02)alphaOnly=true}
 let a=w,b=h,A=-1,B=-1;
 for(let y=0;y<h;y++)for(let i=0;i<w;i++){const k=(y*w+i)*4;if(d[k+3]<24)continue;if(!alphaOnly&&d[k]>238&&d[k+1]>238&&d[k+2]>238)continue;if(i<a)a=i;if(i>A)A=i;if(y<b)b=y;if(y>B)B=y}
 if(A<0)return c;
 const pad=Math.round(Math.max(A-a,B-b)*0.015);a=Math.max(0,a-pad);b=Math.max(0,b-pad);A=Math.min(w-1,A+pad);B=Math.min(h-1,B+pad);
 const o=document.createElement('canvas');o.width=A-a+1;o.height=B-b+1;o.getContext('2d').drawImage(c,a,b,o.width,o.height,0,0,o.width,o.height);return o}
function removeWhite(c){
 const x=c.getContext('2d'),w=c.width,h=c.height,id=x.getImageData(0,0,w,h),d=id.data,seen=new Uint8Array(w*h),st=[];
 const bg=p=>{const k=p*4;if(d[k+3]<24)return true;const mx=Math.max(d[k],d[k+1],d[k+2]),mn=Math.min(d[k],d[k+1],d[k+2]);return mn>222&&mx-mn<28};
 for(let i=0;i<w;i++)st.push(i,(h-1)*w+i);for(let y=0;y<h;y++)st.push(y*w,y*w+w-1);
 while(st.length){const p=st.pop();if(seen[p])continue;seen[p]=1;if(!bg(p))continue;d[p*4+3]=0;const xx=p%w,yy=(p/w)|0;if(xx>0)st.push(p-1);if(xx<w-1)st.push(p+1);if(yy>0)st.push(p-w);if(yy<h-1)st.push(p+w)}
 for(let y=1;y<h-1;y++)for(let i=1;i<w-1;i++){const p=y*w+i,k=p*4;if(d[k+3]===0)continue;if(d[k+3-4]===0||d[k+3+4]===0||d[k+3-w*4]===0||d[k+3+w*4]===0){if(Math.min(d[k],d[k+1],d[k+2])>200)d[k+3]=110}}
 x.putImageData(id,0,0)}
async function processImage(src,white,alphaOnly){
 const img=await loadImg(src);const s=Math.min(1,1000/Math.max(img.width,img.height));
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));
 c.getContext('2d').drawImage(img,0,0,c.width,c.height);if(white)removeWhite(c);return trimCanvas(c,alphaOnly).toDataURL('image/png')}
async function setImage(p,url){delete p.imgAlias;delete p.autoFoto;delete p.noAuto;const k=ownKey(p);const img=await loadImg(url);imgCache.set(k,{img,url});rememberPhoto(p);await IDB.set(k,url);changed()}
async function setImageFromFile(p,file){toast('Ajustando a foto…',1500);try{await setImage(p,await processImage(await fileToURL(file),false))}catch(e){toast('Não consegui abrir essa imagem')}}
async function loadAllImages(){
 for(const[k,e]of MODIMG)if(k.startsWith('mod:')&&!e.img)MODIMG.delete(k);for(const[k,e]of HEADC)if(!e.img)HEADC.delete(k);
 const keys=new Set();S.products.forEach(p=>{keys.add(ownKey(p));if(p.imgAlias)keys.add(p.imgAlias)});Object.values(S.fotoNomes||{}).forEach(k=>keys.add(k));
 await Promise.all([...keys].map(async k=>{if(imgCache.has(k))return;const u=await IDB.get(k);if(u){try{imgCache.set(k,{img:await loadImg(u),url:u})}catch(e){}}}));
 S.products.forEach(p=>{if(imgCache.has(ownKey(p)))rememberPhoto(p)});autoMatchPhotos();
 for(let i=0;i<2;i++){const u=await IDB.get('logo'+i);if(u){try{logos[i]={img:await loadImg(u),url:u}}catch(e){}}}
 for(let i=0;i<2;i++){if(logos[i]||S.store['semLogoPadrao'+i])continue;try{const img=await loadImg('logos/logo'+(i+1)+'.png'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);const u=c.toDataURL('image/png');logos[i]={img:await loadImg(u),url:u};await IDB.set('logo'+i,u,true)}catch(e){}}
 for(const cp of S.campaigns)for(const fk of Object.keys(FORMATS)){const k=artKey(cp.id,fk);if(artCache.has(k))continue;const u=await IDB.get(k);if(u){try{artCache.set(k,{img:await loadImg(u),url:u})}catch(e){}}}
 renderList();renderLogos();renderArt();schedule();catLoad()}

/* ================= desenho ================= */
let CUR={W:1080,H:1350};
const F=s=>`${s}px Anton, Impact, "Arial Narrow", sans-serif`;
const O=(s,w=700)=>`${w} ${s}px Oswald, "Arial Narrow", sans-serif`;
function rr(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function wrap(c,t,maxW){const ws=String(t).split(/\s+/).filter(Boolean),L=[];let cur='';for(const w of ws){const n=cur?cur+' '+w:w;if(!cur||c.measureText(n).width<=maxW)cur=n;else{L.push(cur);cur=w}}if(cur)L.push(cur);return L}
function fitBlock(c,t,maxW,maxH,maxL,start,min,fn,lh=1.04){
 let s=start,L;
 for(let i=0;i<60;i++){c.font=fn(s);L=wrap(c,t,maxW);const wide=L.some(l=>c.measureText(l).width>maxW);if(L.length<=maxL&&L.length*s*lh<=maxH&&!wide)return{s,lines:L,ok:true};if(s<=min)break;s=Math.max(min,s*0.94)}
 c.font=fn(min);L=wrap(c,t,maxW);const cut=L.length>maxL;L=L.slice(0,maxL);
 L=L.map((l,i)=>{if(c.measureText(l).width<=maxW&&!(cut&&i===L.length-1))return l;let q=l;while(q.length>1&&c.measureText(q+'…').width>maxW)q=q.slice(0,-1);return q+'…'});
 return{s:min,lines:L,ok:false}}
function fitLine(c,t,maxW,maxS,fn){c.font=fn(maxS);const w=c.measureText(t).width;return w>maxW?maxS*maxW/w:maxS}
function asc(c,t,s){const m=c.measureText(t);return m.actualBoundingBoxAscent||s*0.8}
function contain(c,img,x,y,w,h,zoom=1,dy=0,align='bottom'){
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 const s=Math.min(w/img.width,h/img.height)*zoom,dw=img.width*s,dh=img.height*s;
 const yy=(align==='center'?y+(h-dh)/2:y+h-dh)+dy*h;c.drawImage(img,x+(w-dw)/2,yy,dw,dh);c.restore()}
function placeholder(c,x,y,w,h){c.save();c.fillStyle=CUR.noCards?'rgba(255,255,255,.18)':'#ece9e3';rr(c,x,y,w,h,Math.min(w,h)*0.04);c.fill();c.fillStyle='#a29c90';c.textAlign='center';c.textBaseline='middle';const s=Math.min(w,h)*0.11;c.font=O(s,600);c.fillText('SEM FOTO',x+w/2,y+h/2);c.restore()}
function multiCount(p,img,w,h){const r=(img.width/img.height)/(w/h);if(p.multi&&p.multi!=='auto')return +p.multi;return r<0.3?5:r<0.52?3:1}
/* contraste produto x fundo: mede a cor média do produto (só pixels visíveis) e do que está atrás */
const imgStats=new WeakMap();
function statsOf(img){let st=imgStats.get(img);if(st)return st;
 try{const c=document.createElement('canvas'),k=Math.min(1,120/Math.max(img.width,img.height));c.width=Math.max(1,img.width*k|0);c.height=Math.max(1,img.height*k|0);const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height).data;let r=0,g=0,b=0,n=0,tr=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<40){tr++;continue}r+=d[i];g+=d[i+1];b+=d[i+2];n++}
  st=n?{r:r/n,g:g/n,b:b/n,cut:tr/(d.length/4)}:{r:255,g:255,b:255,cut:0}}catch(e){st={r:128,g:128,b:128,cut:0}}
 imgStats.set(img,st);return st}
function devR(c,x,y,w,h){const t=c.getTransform?c.getTransform():{a:1,d:1,e:0,f:0};return[x*t.a+t.e,y*t.d+t.f,w*t.a,h*t.d]}
function bgColor(c,x,y,w,h){try{[x,y,w,h]=devR(c,x,y,w,h);const X=Math.max(0,x|0),Y=Math.max(0,y|0),W=Math.max(1,Math.min(c.canvas.width-X,w|0)),H=Math.max(1,Math.min(c.canvas.height-Y,h|0));
 const d=c.getImageData(X,Y,W,H).data,st=Math.max(4,((d.length/4/500)|0)*4);let r=0,g=0,b=0,n=0;for(let k=0;k<d.length;k+=st){r+=d[k];g+=d[k+1];b+=d[k+2];n++}return{r:r/n,g:g/n,b:b/n}}catch(e){return null}}
const lumOf=o=>(0.2126*o.r+0.7152*o.g+0.0722*o.b)/255;
function prodFx(c,img,x,y,w,h){
 const st=statsOf(img);if(st.cut<0.04)return null; /* foto com fundo próprio (não recortada): não mexe */
 const bg=bgColor(c,x,y,w,h);if(!bg)return null;
 const dist=Math.hypot(st.r-bg.r,st.g-bg.g,st.b-bg.b)/441,dl=Math.abs(lumOf(st)-lumOf(bg)),lb=lumOf(bg);
 if(dist>0.3&&dl>0.18)return null; /* já contrasta bem */
 const k=Math.min(1,(0.3-Math.min(dist,0.3))/0.3+0.35); /* quanto mais parecido, mais forte (ainda leve) */
 return lb>0.55?{color:`rgba(25,28,36,${(0.22+0.2*k).toFixed(2)})`,blur:0.045,off:0.012}:{color:`rgba(255,255,255,${(0.28+0.22*k).toFixed(2)})`,blur:0.05,off:0}}
function prodImg(c,p,x,y,w,h,clipR){
 const img=getImg(p);if(!img){placeholder(c,x,y,w,h);return}
 const fx=prodFx(c,img,x,y,w,h),n=multiCount(p,img,w,h);
 const zoom=p.zoom||1,setFx=sz=>{if(fx){c.shadowColor=fx.color;c.shadowBlur=sz*fx.blur*2;c.shadowOffsetY=sz*fx.off}};
 const clip=()=>{c.beginPath();if(clipR)c.rect(clipR.x,clipR.y,clipR.w,clipR.h);else c.rect(x-w*0.03,y-h*0.03,w*1.06,h*1.06);c.clip()},DX=(p.dx||0)*w;
 if(n<=1){const s=Math.min(w/img.width,h/img.height)*zoom,dw=img.width*s,dh=img.height*s,yy=y+h-dh+(p.dy||0)*h;
  c.save();clip();setFx(Math.min(dw,dh));c.drawImage(img,x+(w-dw)/2+DX,yy,dw,dh);c.restore();return}
 const L=n>=5?[[-2,0.74],[2,0.74],[-1,0.86],[1,0.86],[0,1]]:n===2?[[-1,0.92],[1,1]]:[[-1,0.86],[1,0.86],[0,1]];
 const off=k=>n===2?Math.sign(k)*0.42:Math.sign(k)*(Math.abs(k)>=2?0.7+0.86*0.7:0.7);
 const ext=Math.max(...L.map(([k,sc])=>Math.abs(off(k))+sc/2))*2;
 let s0=Math.min(w/img.width,h/img.height)*zoom;const dw0=img.width*s0;if(ext*dw0>w*0.98)s0*=w*0.98/(ext*dw0);
 const dw=img.width*s0,dh=img.height*s0,cx=x+w/2+DX,base=y+h+(p.dy||0)*h;
 c.save();clip();
 L.forEach(([k,sc])=>{const ww=dw*sc,hh=dh*sc,xx=cx+off(k)*dw-ww/2,yy=base-hh-(1-sc)*dh*0.18;
  c.filter=sc<0.8?'brightness(0.8)':sc<1?'brightness(0.9)':'none';
  if(fx)setFx(Math.min(ww,hh));else if(sc===1){c.shadowColor='rgba(0,0,0,.25)';c.shadowBlur=dw*0.08;c.shadowOffsetX=0}
  c.drawImage(img,xx,yy,ww,hh);c.shadowColor='transparent'});
 c.filter='none';c.restore()}
let HIT=null;
const TXTF=()=>({grande:1,medio:0.85,compacto:0.72})[S.store.txt||'grande']||1,PRF=()=>({grande:1,medio:0.93,compacto:0.85})[S.store.txt||'grande']||1;
function unitLabel(u){return(u||'un').toUpperCase()}
function splitPrice(n){const s=Number(n).toFixed(2).split('.');return[s[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'),s[1]]}

/* número grosso: contorno da mesma cor engrossa a fonte condensada, com sombra curta para dar volume */
function thick(c,t,x,y,z,k=0.07,sh=true){c.save();c.lineJoin='round';c.lineWidth=z*k;c.strokeStyle=c.fillStyle;if(sh){c.shadowColor='rgba(0,0,0,.28)';c.shadowOffsetY=z*0.035;c.shadowOffsetX=z*0.012}c.strokeText(t,x,y);c.shadowColor='transparent';c.fillText(t,x,y);c.restore()}
function drawPrice(c,x,y,w,h,price,unit,C,radius=true,opt={}){
 c.save();c.fillStyle=opt.bg||C.preco;rr(c,x,y,w,h,radius?Math.min(h*0.2,w*0.08):0);c.fill();
 const fg=opt.fg||C.precoTexto;c.fillStyle=fg;c.textBaseline='alphabetic';
 let py=y,phh=h;
 if(opt.label){const ls=fitLine(c,opt.label,w*0.86,h*0.17,z=>O(z,700));c.font=O(ls,700);c.textAlign='center';c.textBaseline='middle';c.fillText(opt.label,x+w/2,y+h*0.135);c.textBaseline='alphabetic';py=y+h*0.24;phh=h*0.76}
 if(price==null||isNaN(price)){c.textAlign='center';const s=fitLine(c,'R$ --,--',w*0.8,phh*0.6,F);c.font=F(s);c.fillText('R$ --,--',x+w/2,py+phh/2+s*0.36);c.restore();return}
 const[rs,cs]=splitPrice(price);const ul=unitLabel(unit);const aw=w*0.88,ah=phh*(opt.label?0.8:0.74);
 let Fz=ah*1.25,m;
 for(let i=0;i<50;i++){
  const fr=Fz*0.3,fc=Fz*0.46,fu=Fz*0.19;
  c.font=F(Fz);const wd=c.measureText(rs).width,ad=asc(c,rs,Fz);
  c.font=F(fr);const wr=c.measureText('R$').width,ar=asc(c,'R$',fr);
  c.font=F(fc);const wc=c.measureText(','+cs).width,ac=asc(c,','+cs,fc);
  c.font=O(fu,600);const wu=c.measureText(ul).width;
  const g=Fz*0.05;m={fr,fc,fu,wd,ad,wr,ar,wc,ac,wu,g,W:wr+g+wd+g*0.6+Math.max(wc,wu),H:ad};
  if(m.W<=aw&&m.H<=ah)break;Fz*=0.95}
 const ox=x+(w-m.W)/2,base=py+(phh+m.H)/2-(opt.label?phh*0.03:0),top=base-m.H;
 c.textAlign='left';
 c.font=F(m.fr);c.fillText('R$',ox,top+m.ar);
 c.font=F(Fz);thick(c,rs,ox+m.wr+m.g,base,Fz,0.028);
 const cx=ox+m.wr+m.g+m.wd+m.g*0.6;
 c.font=F(m.fc);thick(c,','+cs,cx,top+m.ac,m.fc,0.022,false);
 c.font=O(m.fu,600);c.fillText(ul,cx+(Math.max(m.wc,m.wu)-m.wu)/2,base);
 c.restore()}
/* legislação: preço por unidade de medida (kg / L), tirado do peso escrito na descrição */
function packOf(p){if(['kg','L','100g'].includes(p.unit))return null;const m=/(\d+(?:[.,]\d+)?)\s*(kg|kgs|quilos?|g|gr|grs|gramas?|l|lt|lts|litros?|ml)(?![a-z])/i.exec(p.desc||'');if(!m)return null;
 let q=parseFloat(m[1].replace(',','.'));if(!(q>0))return null;const u=m[2].toLowerCase();let mul=1;const mx=/(\d+)\s*(?:x|un\.?\s*de|unidades\s*de)\s*\d/i.exec(p.desc||'');if(mx)mul=parseInt(mx[1])||1;
 if(/^(g|gr|grs|grama|gramas)$/.test(u))return{q:q*mul/1000,u:'kg'};if(u==='ml')return{q:q*mul/1000,u:'L'};if(/^(l|lt|lts|litro|litros)$/.test(u))return{q:q*mul,u:'L'};return{q:q*mul,u:'kg'}}
function unitPriceText(p,short,force){if(!p.precoKg&&!force)return'';const k=packOf(p);if(!k||k.q===1&&!short)return'';if(p.price==null||isNaN(p.price))return'';const f=n=>brl(n/k.q);
 return hasApp(p)?`Equivale a ${f(p.price)} o ${k.u} (app ${f(p.app)})`:`Equivale a ${f(p.price)} o ${k.u}`}
function hexLum(hex){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');if(!m)return 0.5;return(0.2126*parseInt(m[1],16)+0.7152*parseInt(m[2],16)+0.0722*parseInt(m[3],16))/255}
function hexA(hex,a){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');if(!m)return`rgba(0,0,0,${a})`;return`rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`}
/* peso do produto no encarte: 3 ícone, 2 destaque, 1 normal, 0 complemento */
function discOf(p){if(p.price==null||isNaN(p.price))return 0;if(p.old>p.price)return(p.old-p.price)/p.old;if(hasApp(p)&&p.app<p.price)return(p.price-p.app)/p.price;return 0}
function tierOf(p){if(p.featured)return 3;if(p.papel==='destaque')return 2;if(p.papel==='complemento')return 0;return 1}
function scoreOf(p){return discOf(p)+(p.phrase?0.05:0)+(p.limit>0?0.03:0)}
const hasApp=p=>!!p.appOn&&p.app!=null&&!isNaN(p.app)&&p.price!=null&&!isNaN(p.price)&&p.app!==p.price;
function isReddish(hex){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');if(!m)return false;const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16);return r>140&&g<110&&b<110}
const semCol=(C,bg)=>isReddish(C.preco)||(bg&&isReddish(C.fundo))?{bg:'#111111',fg:'#ffffff'}:{bg:'#d71920',fg:'#ffffff'};
/* bloco de preço: sem app x com app. mode 'stack' = sem app em cima; 'split' = lado a lado */
function drawPriceBlock(c,p,x,y,w,h,C,mode,onBg){
 if(!hasApp(p)){drawPrice(c,x,y,w,h,p.price,p.unit,C);return}
 const sc=semCol(C,onBg),g=Math.max(3,Math.min(w,h)*0.035);
 if(mode==='stack'){
  const th=h*0.3;c.save();c.fillStyle=sc.bg;rr(c,x,y,w,th,Math.min(th*0.22,w*0.05));c.fill();
  const lab='SEM APP',pr=brl(p.price)+(p.unit&&p.unit!=='un'?' '+unitLabel(p.unit):'');
  let s=th*0.62;c.font=O(s*0.62,700);let lw=c.measureText(lab).width;c.font=F(s);let pw=c.measureText(pr).width;
  const k=Math.min(1,(w*0.9)/(lw+pw+s*0.5));s*=k;c.font=O(s*0.62,700);lw=c.measureText(lab).width;c.font=F(s);pw=c.measureText(pr).width;
  const sx=x+(w-(lw+pw+s*0.5))/2;c.fillStyle=sc.fg;c.textBaseline='middle';c.textAlign='left';c.font=O(s*0.62,700);c.fillText(lab,sx,y+th/2);c.font=F(s);c.fillText(pr,sx+lw+s*0.5,y+th/2+s*0.04);c.restore();
  drawPrice(c,x,y+th+g,w,h-th-g,p.app,p.unit,C,true,{label:'COM APP'})}
 else{const lw=w*0.4;drawPrice(c,x,y,lw,h,p.price,p.unit,C,true,{label:'SEM APP',bg:sc.bg,fg:sc.fg});drawPrice(c,x+lw+g,y,w-lw-g,h,p.app,p.unit,C,true,{label:'COM APP'})}}
function limitText(p,short){if(!(p.limit>0))return'';const n=p.limit,u=n===1?'UNIDADE':'UNIDADES';return hasApp(p)?(short?`LIMITE ${n} UN. NO APP`:`LIMITE DE ${n} ${u} NO PREÇO DO APP`):(short?`LIMITE ${n} UN.`:`LIMITE DE ${n} ${u} POR CLIENTE`)}
function drawLimit(c,p,x,y,w,h,dark=false){
 const t=limitText(p);if(!t)return false;c.save();let s=h*0.62;c.font=O(s,700);const tw=c.measureText(t).width;if(tw+s*0.7>w)s*=w/(tw+s*0.7);
 pill(c,t,x+w/2,y+(h-s*1.35)/2,s,'center',dark?'#ffd400':'#111111',dark?'#111111':'#ffd400');c.restore();return true}

/* frase de impacto: tamanho (A−/A+) e posição (arrastar no encarte) por produto */
function phraseAt(c,p,x,y,w,h,dx,dy,mw,sz,C){const k=p.phK||1,sx=p.phX!=null?x+p.phX*w:dx,sy=p.phY!=null?y+p.phY*h:dy;const r=drawSticker(c,p.phrase,sx,sy,Math.max(mw,w*0.95)*(k>1?1:1)*(p.phX!=null?1:1),sz*k,C);
 if(HIT&&c.canvas===HIT.cv)HIT.list.push({x:sx-4,y:sy-4,w:r.bw+8,h:r.bh+8,id:p.id,sticker:true,cx:x,cy:y,cw:w,ch:h})}
function drawSticker(c,text,x,y,maxW,size,C,rot=-0.1){
 if(!text)return{bw:0,bh:0};c.save();c.font=F(size);let tw=c.measureText(text).width;
 if(tw+size*0.8>maxW){size*=(maxW-size*0.8)/tw;c.font=F(size);tw=c.measureText(text).width}
 const bw=tw+size*0.7,bh=size*1.38;c.translate(x+bw/2,y+bh/2);c.rotate(rot);
 c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-bw/2+size*0.13,-bh/2+size*0.13,bw,bh);
 c.fillStyle=C.adesivo;c.fillRect(-bw/2,-bh/2,bw,bh);
 c.lineWidth=Math.max(2,size*0.09);c.strokeStyle=C.adesivo.toLowerCase()==='#ffffff'?C.adesivoTexto:'#ffffff';c.strokeRect(-bw/2,-bh/2,bw,bh);
 c.fillStyle=C.adesivoTexto;c.textAlign='center';c.textBaseline='middle';c.fillText(text,0,size*0.05);c.restore();return{bw,bh}}

function pill(c,text,x,y,s,align='left',bg='#111',fg='#ffd400'){
 c.save();c.font=O(s,700);const tw=c.measureText(text).width,pw=tw+s*0.7,ph=s*1.35;const px=align==='right'?x-pw:align==='center'?x-pw/2:x;
 c.fillStyle=bg;rr(c,px,y,pw,ph,ph*0.22);c.fill();c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.fillText(text,px+pw/2,y+ph/2+s*0.03);c.restore();return pw}

const NMV=(p,v)=>{if(v==='nup')p.nameDy=Math.max(-0.8,(p.nameDy||0)-0.15);else if(v==='ndn')p.nameDy=Math.min(0.8,(p.nameDy||0)+0.15);else return false;return true};
function drawDesc(c,p,x,y,w,h,iss,align='center',maxL=2,color='#15171c'){
 const t=(p.desc||'').toUpperCase();if(!t)return;
 if(p.nameDy)y+=p.nameDy*h;
 const tf=TXTF(),min=CUR.W*0.016*Math.max(0.85,tf);const r=fitBlock(c,t,w,h,maxL,Math.min(h/(maxL*1.04),w*(p._cap||0.13))*tf,min,s=>O(s,700));
 if(iss){if(!r.ok)iss.push(`Descrição cortada (longa demais): ${p.desc}`);else if(r.s<CUR.W*0.019)iss.push(`Letra pequena para ler no celular: ${p.desc}`)}
 c.save();c.font=O(r.s,700);c.fillStyle=color;c.textBaseline='middle';c.textAlign=align;if(color==='#ffffff'){c.shadowColor='rgba(0,0,0,.65)';c.shadowBlur=r.s*0.25;c.shadowOffsetY=r.s*0.06}
 const lh=r.s*1.04;let yy=y+(h-r.lines.length*lh)/2+lh/2;const xx=align==='center'?x+w/2:x;
 r.lines.forEach(l=>{c.fillText(l,xx,yy);yy+=lh});c.restore()}

function secTint(p){if(S.store.secCor===false||!p.setor)return null;const s=S.setores.find(x=>x.nome===p.setor);return s?s.cor:null}
/* sombra de chão: o produto "pousa" no cartão */
function groundShadow(c,p,x,y,w,h){const img=getImg(p);if(!img||statsOf(img).cut<0.04)return;const cx=x+w/2+(p.dx||0)*w,cy=y+h*(1+(p.dy||0))-h*0.01,rx=w*0.36,ry=Math.max(3,h*0.045);
 c.save();c.translate(cx,cy);c.scale(1,ry/rx);const gr=c.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,'rgba(0,0,0,.22)');gr.addColorStop(0.6,'rgba(0,0,0,.08)');gr.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=gr;c.beginPath();c.arc(0,0,rx,0,Math.PI*2);c.fill();c.restore()}
function drawUnitPrice(c,p,x,y,w,h,align='center',color='#5a5f6b'){let t=unitPriceText(p);if(!t)return false;c.save();const mn=CUR.W*0.013;let z=fitLine(c,t,w,h*0.85,q=>O(q,500));if(z<mn){t=t.replace('Equivale a ','').replace(/ o (kg|L)/g,'/$1');z=Math.max(fitLine(c,t,w,h*0.85,q=>O(q,500)),Math.min(mn,h*0.72))}z=Math.min(z,CUR.W*0.019*TXTF());c.font=O(z,500);c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(t,align==='center'?x+w/2:x,y+h/2);c.restore();return true}
const vencTxt=p=>p.vencData?'VENCE '+fmtDY(p.vencData):'VENCIMENTO PRÓXIMO';
function drawVenc(c,p,x,y,w,s){if(!p.venc)return;pill(c,vencTxt(p),x+w,y,s,'right','#ff6d00','#ffffff')}
function withVagas(pg){const it=pg.items||[];if(!(pg.lay&&pg.lay.auto&&pg.cfg&&pg.cfg.n>it.length&&!pg.cfg.grow))return it;return[...it,...Array.from({length:pg.cfg.n-it.length},(_,i)=>({id:'vaga'+i,vaga:true,desc:'',price:null,unit:'un'}))]}
const vagasDe=pg=>pg&&pg.lay&&pg.lay.auto&&pg.cfg&&pg.cfg.n>pg.items.length&&!pg.cfg.grow?pg.cfg.n-pg.items.length:0;
/* ===== estilo VITRINE: sem caixas. Produto recortado solto no fundo, luz atrás, etiqueta de preço cortada em diagonal sobrepondo o produto (linguagem de encarte de grande rede) ===== */
function tagShape(c,x,y,w,h,cut){c.beginPath();c.moveTo(x+cut,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.closePath()}
function drawTag(c,x,y,w,h,price,unit,bg,fg,label,C){c.save();const cut=h*0.32;
 c.fillStyle='rgba(0,0,0,.35)';tagShape(c,x+h*0.06,y+h*0.08,w,h,cut);c.fill();c.fillStyle=bg;tagShape(c,x,y,w,h,cut);c.fill();
 c.fillStyle='rgba(255,255,255,.14)';c.beginPath();c.moveTo(x+cut,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h*0.42);c.lineTo(x+cut*0.58,y+h*0.42);c.closePath();c.fill();c.restore();
 drawPrice(c,x+cut*0.55,y,w-cut*0.55,h,price,unit,C,false,{bg:'rgba(0,0,0,0)',fg,label})}
function drawVitrine(c,p,x,y,w,h,C,iss){
 if(HIT&&c.canvas===HIT.cv)HIT.list.push({x,y,w,h,id:p.id,card:1});
 const lt=hexLum(C.fundo)>0.6,txt=lt?'#15171c':'#ffffff',horiz=w/h>1.3,app=hasApp(p),m=Math.min(w,h);
 const pr=isReddish(C.fundo)&&isReddish(C.preco)?{bg:'#ffd400',fg:'#111111'}:{bg:C.preco,fg:C.precoTexto};
 const up0=!!unitPriceText(p),vph=h*(app?0.36:0.25),vlh=p.limit>0?h*0.055:0,vuh=up0?h*0.045:0,vdh=h*0.12*(p.descK||1),vdy=y+h-vph-vlh-vuh-vdh-h*0.01;
 const ix=horiz?x:x+w*0.02,iy=y+h*0.01,iw=horiz?w*0.56:w*0.96,ih=horiz?h*0.96:vdy-y-h*0.02;
 /* luz atrás do produto */
 c.save();const gx=ix+iw/2,gy=iy+ih*0.55,gr=c.createRadialGradient(gx,gy,0,gx,gy,Math.max(iw,ih)*0.62);gr.addColorStop(0,lt?'rgba(255,255,255,.9)':'rgba(255,255,255,.34)');gr.addColorStop(0.5,lt?'rgba(255,255,255,.4)':'rgba(255,255,255,.1)');gr.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=gr;c.fillRect(x-w*0.1,y-h*0.1,w*1.2,h*1.2);c.restore();
 if(p.featured&&destKind(p)!=='raios'&&destKind(p)!=='nenhum'){featBurst(c,x,y,w,h,Math.min(w,h)*0.03,C,horiz,destKind(p))}
 if(p.featured&&destKind(p)==='raios'){c.save();const R=Math.hypot(w,h)*0.6,n=24;c.beginPath();c.rect(x,y,w,h);c.clip();c.fillStyle=lt?'rgba(0,0,0,.05)':'rgba(255,255,255,.07)';for(let i=0;i<n;i+=2){const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2;c.beginPath();c.moveTo(gx,gy);c.lineTo(gx+Math.cos(a0)*R,gy+Math.sin(a0)*R);c.lineTo(gx+Math.cos(a1)*R,gy+Math.sin(a1)*R);c.closePath();c.fill()}c.restore()}
 groundShadow(c,p,ix,iy,iw,ih);prodImg(c,p,ix,iy,iw,ih,p.prOver?{x,y,w,h}:null);
 const up=!!unitPriceText(p);
 if(horiz){const tx=x+w*0.55,tw=w*0.45;const ph=h*(app?0.5:0.38),py=y+h-ph-h*0.04,lh=p.limit>0?h*0.1:0;
  const dh=py-lh-y-h*0.06-(up?h*0.08:0);drawDesc(c,p,tx,y+h*0.04,tw,dh,iss,'left',3,txt);if(up)drawUnitPrice(c,p,tx,y+h*0.04+dh,tw,h*0.08,'left',lt?'#444':'rgba(255,255,255,.85)');
  if(lh)drawLimit(c,p,tx,py-lh-h*0.02,tw,lh,!lt);
  if(app){const sh=ph*0.4;drawTag(c,tx+tw*0.22,py,tw*0.78,sh,p.price,p.unit,lt?'#15171c':'#ffffff',lt?'#ffffff':'#15171c','SEM APP',C);drawTag(c,tx-tw*0.04,py+sh+h*0.015,tw*1.04,ph-sh-h*0.015,p.app,p.unit,pr.bg,pr.fg,'COM APP',C)}
  else drawTag(c,tx-tw*0.04,py,tw*1.04,ph,p.price,p.unit,pr.bg,pr.fg,null,C)}
 else{const ph=vph,py=y+h-ph,dh=vdh,uh=vuh,lh=vlh,dy=vdy;
  drawDesc(c,p,x+w*0.03,dy,w*0.94,dh,iss,'center',2,txt);if(up)drawUnitPrice(c,p,x,dy+dh,w,uh,'center',lt?'#444':'rgba(255,255,255,.85)');if(lh)drawLimit(c,p,x+w*0.05,dy+dh+uh,w*0.9,lh,!lt);
  if(app){const sh=ph*0.4;drawTag(c,x+w*0.3,py,w*0.7,sh,p.price,p.unit,lt?'#15171c':'#ffffff',lt?'#ffffff':'#15171c','SEM APP',C);drawTag(c,x+w*0.02,py+sh+h*0.012,w*0.98,ph-sh-h*0.012,p.app,p.unit,pr.bg,pr.fg,'COM APP',C)}
  else drawTag(c,x+w*0.04,py,w*0.96,ph,p.price,p.unit,pr.bg,pr.fg,null,C)}
 if(p.phrase)phraseAt(c,p,x,y,w,h,x+m*0.02,y+m*0.03,w*0.8,m*(horiz?0.085:0.075),C);
 if(p.venc)drawVenc(c,p,x,y+(p.phrase?h*0.16:m*0.03),w-m*0.03,m*0.045)}
/* destaque: explosão de raios atrás do produto e moldura na cor do adesivo, o "estouro" clássico de encarte */
const DEST_FUNDOS=[['raios','Raios (estouro de encarte)'],['brilho','Brilho atrás do produto'],['degrade','Degradê da cor do preço'],['solido','Cor cheia do adesivo'],['pontos','Pontinhos (retícula)'],['listras','Listras diagonais'],['moldura','Só a moldura colorida'],['nenhum','Nenhum (igual aos outros)']];
function destKind(p){return p.destFundo||(CUR&&CUR.destFundo)||'raios'}
function featBurst(c,x,y,w,h,r,C,horiz,kind='raios'){const cx=horiz?x+w*0.26:x+w/2,cy=horiz?y+h*0.5:y+h*0.3,R=Math.hypot(w,h),wh=hexLum(C.adesivo)>0.92,col=wh?C.preco:C.adesivo,n=28;
 if(kind==='nenhum')return;
 c.save();rr(c,x,y,w,h,r);c.clip();c.fillStyle=hexA(col,wh?0.4:0.34);
 if(kind==='raios')for(let i=0;i<n;i+=2){const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a0)*R,cy+Math.sin(a0)*R);c.lineTo(cx+Math.cos(a1)*R,cy+Math.sin(a1)*R);c.closePath();c.fill()}
 else if(kind==='degrade'){const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,hexA(C.preco,0.05));g.addColorStop(1,hexA(C.preco,0.42));c.fillStyle=g;c.fillRect(x,y,w,h)}
 else if(kind==='solido'){c.fillStyle=hexA(col,0.55);c.fillRect(x,y,w,h)}
 else if(kind==='pontos'){const st=Math.max(6,Math.min(w,h)*0.045);c.fillStyle=hexA(col,0.5);for(let yy=y;yy<y+h+st;yy+=st)for(let xx=x+((yy-y)/st%2?st/2:0);xx<x+w+st;xx+=st){const d=Math.hypot(xx-cx,yy-cy)/R,rad=st*0.42*Math.min(1,0.25+d*1.4);c.beginPath();c.arc(xx,yy,rad,0,7);c.fill()}}
 else if(kind==='listras'){const st=Math.max(10,Math.min(w,h)*0.07);c.strokeStyle=hexA(col,0.38);c.lineWidth=st*0.45;for(let k=-h;k<w+h;k+=st){c.beginPath();c.moveTo(x+k,y);c.lineTo(x+k-h,y+h);c.stroke()}}
 if(kind==='moldura'){c.restore();c.save();rr(c,x,y,w,h,r);c.clip()}
 const g=c.createRadialGradient(cx,cy,0,cx,cy,Math.min(w,h)*0.55);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(0.55,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(x,y,w,h);
 const lw=Math.max(4,Math.min(w,h)*0.022);c.lineWidth=lw;c.strokeStyle=col;rr(c,x+lw/2,y+lw/2,w-lw,h-lw,r);c.stroke();c.restore()}
function drawCard(c,p,x,y,w,h,C,iss){
 if(p.precoCor)C=Object.assign({},C,{preco:p.precoCor,precoTexto:hexLum(p.precoCor)>0.6?'#111111':'#ffffff'});
 if(p.vaga){if(HIT&&c.canvas===HIT.cv)HIT.list.push({x,y,w,h,id:p.id,card:1});c.save();c.fillStyle='rgba(255,255,255,.14)';rr(c,x,y,w,h,Math.min(w,h)*0.035);c.fill();c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=Math.max(2,Math.min(w,h)*0.012);c.setLineDash([Math.min(w,h)*0.05,Math.min(w,h)*0.035]);rr(c,x+c.lineWidth,y+c.lineWidth,w-c.lineWidth*2,h-c.lineWidth*2,Math.min(w,h)*0.03);c.stroke();c.setLineDash([]);
  const t='+ PRODUTO',z=fitLine(c,t,w*0.7,h*0.14,F);c.font=F(z);c.fillStyle='#ffffff';c.textAlign='center';c.textBaseline='middle';c.fillText(t,x+w/2,y+h/2);c.restore();return}
 if(CUR.estilo==='vitrine'&&!CUR.noCards){drawVitrine(c,p,x,y,w,h,C,iss);return}
 if(HIT&&c.canvas===HIT.cv)HIT.list.push({x,y,w,h,id:p.id,card:1});
 const nc=!!CUR.noCards,r=Math.min(w,h)*0.012,sh=Math.max(3,Math.min(w,h)*0.014),dc=nc?'#ffffff':'#15171c',tc=nc?null:secTint(p);
 if(!nc){c.save();c.fillStyle='rgba(0,0,0,.3)';rr(c,x+sh,y+sh,w,h,r);c.fill();c.fillStyle=C.cartao;rr(c,x,y,w,h,r);c.fill();
  if(tc){c.save();rr(c,x,y,w,h,r);c.clip();const gr=c.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,hexA(tc,0.02));gr.addColorStop(0.55,hexA(tc,0.07));gr.addColorStop(1,hexA(tc,0.2));c.fillStyle=gr;c.fillRect(x,y,w,h);
   c.fillStyle=tc;c.fillRect(x,y,w,Math.max(4,Math.min(w,h)*0.018));c.restore()}
  if(p.featured)featBurst(c,x,y,w,h,r,C,w/h>1.45,destKind(p));
  c.restore()}
 const pad=Math.max(5,Math.min(w,h)*0.05);const horiz=w/h>1.45,app=hasApp(p),up=!!unitPriceText(p),vs=Math.min(w,h)*0.045;
 if(horiz){
  const iw=w*0.5-pad*1.5,ih=h-pad*2;if(!nc)groundShadow(c,p,x+pad,y+pad,iw,ih);prodImg(c,p,x+pad,y+pad,iw,ih,p.prOver?{x,y,w,h}:null);
  const cx=x+w*0.5+pad*0.5,cw=w*0.5-pad*1.5,ph=h*(app?0.52:0.4)*PRF()*(1-((p.descK||1)-1)*0.35),oh=p.limit>0?h*0.11:h*0.03,uh=up?h*0.075:0,dh=h-pad*2-ph-oh-uh-pad*0.4;
  drawDesc(c,p,cx,y+pad,cw,dh,iss,'center',3,dc);
  if(up)drawUnitPrice(c,p,cx,y+pad+dh,cw,uh,'center',nc?'#ffffff':'#5a5f6b');
  drawLimit(c,p,cx,y+pad+dh+uh,cw,oh,nc);
  drawPriceBlock(c,p,cx,y+h-pad-ph,cw,ph,C,'stack');
 }else{
  const dK=p.descK||1,ph=h*(app?0.29:0.27)*PRF(),oh=h*0.07,uh=up?Math.max(h*0.055,CUR.W*0.016):0,dh=h*0.13*dK,ih=h-pad*2.3-ph-oh-dh-uh;
  if(!nc)groundShadow(c,p,x+pad,y+pad,w-pad*2,ih);prodImg(c,p,x+pad,y+pad,w-pad*2,ih,p.prOver?{x,y,w,h}:null);
  const d0=y+pad*1.3+ih;drawDesc(c,p,x+pad,d0,w-pad*2,dh,iss,'center',2,dc);
  if(up)drawUnitPrice(c,p,x+pad,d0+dh,w-pad*2,uh,'center',nc?'#ffffff':'#5a5f6b');
  drawLimit(c,p,x+pad,d0+dh+uh,w-pad*2,oh,nc);
  drawPriceBlock(c,p,x+pad,y+h-pad-ph,w-pad*2,ph,C,'split');
 }
 if(p.phrase)phraseAt(c,p,x,y,w,h,x+pad*0.4,y+pad*0.7,w*0.82,Math.min(w,h)*(horiz?0.085:0.08),C);
 if(p.venc)drawVenc(c,p,x,y+(p.phrase?h*0.16:pad*0.7),w-pad*0.6,vs);
}

/* ===== motivos da ação: desenhos monocromáticos que dão vida ao fundo (sem imagem de terceiros) ===== */
const MOTIF={
 steak(c,s){c.beginPath();c.moveTo(-.5*s,-.1*s);c.bezierCurveTo(-.55*s,-.45*s,.1*s,-.55*s,.4*s,-.3*s);c.bezierCurveTo(.62*s,-.1*s,.5*s,.35*s,.15*s,.4*s);c.bezierCurveTo(-.2*s,.45*s,-.45*s,.25*s,-.5*s,-.1*s);c.fill();c.save();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(.18*s,-.05*s,.11*s,0,7);c.fill();c.lineWidth=s*.035;c.beginPath();c.moveTo(-.35*s,-.05*s);c.quadraticCurveTo(-.1*s,.1*s,.05*s,.3*s);c.stroke();c.restore()},
 leaf(c,s){c.beginPath();c.moveTo(0,-.55*s);c.bezierCurveTo(.45*s,-.3*s,.4*s,.3*s,0,.55*s);c.bezierCurveTo(-.4*s,.3*s,-.45*s,-.3*s,0,-.55*s);c.fill();c.save();c.globalCompositeOperation='destination-out';c.lineWidth=s*.04;c.beginPath();c.moveTo(0,-.45*s);c.lineTo(0,.5*s);for(let i=-2;i<=2;i++){c.moveTo(0,i*.16*s);c.lineTo(.22*s,i*.16*s-.12*s);c.moveTo(0,i*.16*s);c.lineTo(-.22*s,i*.16*s-.12*s)}c.stroke();c.restore()},
 bubble(c,s){c.lineWidth=s*.06;c.beginPath();c.arc(0,0,.45*s,0,7);c.stroke();c.beginPath();c.arc(-.15*s,-.17*s,.1*s,0,7);c.fill()},
 star(c,s){c.beginPath();for(let i=0;i<10;i++){const r=i%2?.22*s:.55*s,a=-Math.PI/2+i*Math.PI/5;c.lineTo(Math.cos(a)*r,Math.sin(a)*r)}c.closePath();c.fill()},
 sparkle(c,s){c.beginPath();for(let i=0;i<8;i++){const r=i%2?.1*s:.55*s,a=i*Math.PI/4;c.lineTo(Math.cos(a)*r,Math.sin(a)*r)}c.closePath();c.fill()},
 tag(c,s){c.beginPath();c.moveTo(-.5*s,-.28*s);c.lineTo(.25*s,-.28*s);c.lineTo(.5*s,0);c.lineTo(.25*s,.28*s);c.lineTo(-.5*s,.28*s);c.closePath();c.fill();c.save();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(.27*s,0,.06*s,0,7);c.fill();c.font=`900 ${.42*s}px Anton,Impact,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('%',-.12*s,.02*s);c.restore()},
 drum(c,s){c.save();c.rotate(-.6);c.beginPath();c.ellipse(-.1*s,0,.33*s,.25*s,0,0,7);c.fill();c.fillRect(.15*s,-.05*s,.32*s,.1*s);c.beginPath();c.arc(.5*s,-.07*s,.07*s,0,7);c.arc(.5*s,.07*s,.07*s,0,7);c.fill();c.restore()},
 fish(c,s){c.beginPath();c.ellipse(-.05*s,0,.38*s,.2*s,0,0,7);c.fill();c.beginPath();c.moveTo(.28*s,0);c.lineTo(.55*s,-.2*s);c.lineTo(.55*s,.2*s);c.closePath();c.fill();c.save();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(-.25*s,-.04*s,.04*s,0,7);c.fill();c.restore()},
 wheat(c,s){c.lineWidth=s*.04;c.beginPath();c.moveTo(0,.55*s);c.lineTo(0,-.5*s);c.stroke();for(let i=0;i<4;i++){const y=-.4*s+i*.18*s;[-1,1].forEach(k=>{c.beginPath();c.ellipse(k*.1*s,y,.07*s,.13*s,k*.5,0,7);c.fill()})}c.beginPath();c.ellipse(0,-.52*s,.06*s,.12*s,0,0,7);c.fill()},
 cube(c,s){rr(c,-.38*s,-.38*s,.76*s,.76*s,.14*s);c.fill();c.save();c.globalCompositeOperation='destination-out';rr(c,-.24*s,-.26*s,.2*s,.1*s,.05*s);c.fill();c.restore()},
 cheese(c,s){c.beginPath();c.moveTo(-.5*s,.3*s);c.lineTo(.5*s,.3*s);c.lineTo(.5*s,-.1*s);c.lineTo(-.5*s,.3*s);c.closePath();c.moveTo(-.5*s,.3*s);c.lineTo(.5*s,-.1*s);c.lineTo(.3*s,-.35*s);c.closePath();c.fill();c.save();c.globalCompositeOperation='destination-out';[[.2,.12,.07],[.35,.18,.04],[0,.22,.04]].forEach(([x,y,r])=>{c.beginPath();c.arc(x*s,y*s,r*s,0,7);c.fill()});c.restore()},
 paw(c,s){c.beginPath();c.ellipse(0,.15*s,.25*s,.2*s,0,0,7);c.fill();[[-.3,-.12],[-.11,-.32],[.11,-.32],[.3,-.12]].forEach(([x,y])=>{c.beginPath();c.ellipse(x*s,y*s,.09*s,.12*s,0,0,7);c.fill()})},
 heart(c,s){c.beginPath();c.moveTo(0,.45*s);c.bezierCurveTo(-.6*s,0,-.35*s,-.55*s,0,-.22*s);c.bezierCurveTo(.35*s,-.55*s,.6*s,0,0,.45*s);c.fill()},
 bolt(c,s){c.beginPath();c.moveTo(.12*s,-.55*s);c.lineTo(-.3*s,.08*s);c.lineTo(-.02*s,.08*s);c.lineTo(-.15*s,.55*s);c.lineTo(.32*s,-.12*s);c.lineTo(.04*s,-.12*s);c.closePath();c.fill()},
 plus(c,s){c.fillRect(-.12*s,-.45*s,.24*s,.9*s);c.fillRect(-.45*s,-.12*s,.9*s,.24*s)},
 coin(c,s){c.beginPath();c.arc(0,0,.45*s,0,7);c.fill();c.save();c.globalCompositeOperation='destination-out';c.font=`900 ${.55*s}px Anton,Impact,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('$',0,.03*s);c.restore()},
 bean(c,s){c.save();c.rotate(.6);c.beginPath();c.ellipse(0,0,.3*s,.42*s,0,0,7);c.fill();c.globalCompositeOperation='destination-out';c.lineWidth=s*.05;c.beginPath();c.moveTo(0,-.36*s);c.bezierCurveTo(-.12*s,-.1*s,.12*s,.1*s,0,.36*s);c.stroke();c.restore()},
 basket(c,s){c.beginPath();c.moveTo(-.5*s,-.05*s);c.lineTo(.5*s,-.05*s);c.lineTo(.38*s,.45*s);c.lineTo(-.38*s,.45*s);c.closePath();c.fill();c.lineWidth=s*.06;c.beginPath();c.arc(0,-.05*s,.32*s,Math.PI,0);c.stroke()},
};
const MOTIF_NOMES={'':'Sem desenho',steak:'Carne',drum:'Frango',fish:'Peixe',leaf:'Folhas (hortifruti)',bubble:'Bolhas (limpeza)',cube:'Gelo (bebidas)',cheese:'Queijo (frios)',wheat:'Trigo (padaria)',bean:'Café',heart:'Corações (doces)',paw:'Patinhas (pet)',sparkle:'Brilhos (beleza)',star:'Estrelas',bolt:'Raios',tag:'Etiquetas %',plus:'Sinal de mais',coin:'Moedas',basket:'Cestas'};
function drawMotifs(c,W,H,kind,C,area){const fn=MOTIF[kind];if(!fn)return;const lt=hexLum(C.fundo)>0.6,col=lt?'rgba(0,0,0,.12)':'rgba(255,255,255,.15)';
 let sd=kind.length*977+13;const rnd=()=>{sd=(sd*9301+49297)%233280;return sd/233280};const base=Math.max(W,H)*0.075,cols=Math.ceil(W/(base*1.7)),rows=Math.ceil(H/(base*1.7));
 c.save();c.fillStyle=col;c.strokeStyle=col;
 for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){if(rnd()<0.25)continue;const x=(k+0.5+(r%2?0.5:0))*base*1.7+(rnd()-0.5)*base*0.6,y=(r+0.5)*base*1.7+(rnd()-0.5)*base*0.6,sz=base*(0.6+rnd()*0.8);
  c.save();c.translate(x,y);c.rotate((rnd()-0.5)*1.2);fn(c,sz);c.restore()}
 c.restore()}
function drawHeroMotif(c,x,y,w,h,kind,C){const fn=MOTIF[kind];if(!fn)return;c.save();c.beginPath();c.rect(x,y,w,h);c.clip();const lt=hexLum(C.cabecalho)>0.6;c.fillStyle=c.strokeStyle=lt?'rgba(0,0,0,.16)':'rgba(255,255,255,.2)';
 const s=h*1.25;c.translate(x+w-s*0.22,y+h*0.5);c.rotate(-0.25);fn(c,s);c.restore();
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.fillStyle=c.strokeStyle=lt?'rgba(0,0,0,.08)':'rgba(255,255,255,.09)';const s2=h*0.7;c.translate(x+w*0.47,y+h*0.85);c.rotate(0.35);fn(c,s2);c.restore()}
function drawFire(c,W,H,C){
 const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#160303');g.addColorStop(0.55,'#4a0705');g.addColorStop(1,'#a3160a');c.fillStyle=g;c.fillRect(0,0,W,H);
 let sd=7;const rnd=()=>{sd=(sd*9301+49297)%233280;return sd/233280};
 c.save();c.globalCompositeOperation='lighter';
 for(let i=0;i<46;i++){const x=rnd()*W,w=W*(0.05+rnd()*0.12),h=H*(0.18+rnd()*0.42),by=H+H*0.02,lean=(rnd()-0.5)*w*1.6;
  const fg=c.createLinearGradient(0,by,0,by-h);fg.addColorStop(0,'rgba(255,214,64,.55)');fg.addColorStop(0.35,'rgba(255,120,20,.35)');fg.addColorStop(1,'rgba(200,20,0,0)');c.fillStyle=fg;
  c.beginPath();c.moveTo(x-w/2,by);c.bezierCurveTo(x-w*0.6,by-h*0.45,x+lean-w*0.15,by-h*0.7,x+lean,by-h);c.bezierCurveTo(x+lean+w*0.1,by-h*0.65,x+w*0.6,by-h*0.4,x+w/2,by);c.closePath();c.fill()}
 for(let i=0;i<70;i++){const x=rnd()*W,y=H*(0.25+rnd()*0.75),r=Math.max(1.5,W*0.0025*rnd()+1);c.fillStyle=`rgba(255,${150+rnd()*90|0},40,${0.35+rnd()*0.5})`;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}
 c.restore();const vg=c.createRadialGradient(W/2,H*0.45,Math.min(W,H)*0.2,W/2,H*0.5,Math.max(W,H)*0.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.45)');c.fillStyle=vg;c.fillRect(0,0,W,H)}
function halftone(c,W,H,C){const lt=hexLum(C.fundo)>0.6,st=Math.max(W,H)*0.017;c.save();c.fillStyle=lt?'rgba(0,0,0,.08)':'rgba(255,255,255,.1)';
 [[0,H],[W,0]].forEach(([ox,oy])=>{const M=Math.max(W,H)*0.55;for(let y=0;y<H;y+=st)for(let x=0;x<W;x+=st){const d=Math.hypot(x-ox,y-oy);if(d>M)continue;const rr_=st*0.46*(1-d/M);if(rr_<0.6)continue;c.beginPath();c.arc(x+((y/st)%2?st/2:0),y,rr_,0,7);c.fill()}});c.restore()}
function drawBg(c,W,H,C){if(CUR&&CUR.tema==='fogo'){drawFire(c,W,H,C);if(CUR.motivo)drawMotifs(c,W,H,CUR.motivo,C);return}if(CUR&&CUR.motivo){c.fillStyle=C.fundo;c.fillRect(0,0,W,H);drawMotifs(c,W,H,CUR.motivo,C);return}c.fillStyle=C.fundo;c.fillRect(0,0,W,H);halftone(c,W,H,C);c.save();c.strokeStyle='rgba(255,255,255,.035)';const s=Math.max(W,H)*0.04;c.lineWidth=s*0.42;for(let i=-H;i<W+H;i+=s){c.beginPath();c.moveTo(i,0);c.lineTo(i-H,H);c.stroke()}c.restore()}
function fmtD(iso){if(!iso)return'';const[y,m,d]=iso.split('-');return d+'/'+m}
function validText(){const{ini,fim}=S.val;if(!ini&&!fim)return'';if(!fim||!ini||ini===fim)return'OFERTA VÁLIDA SÓ NO DIA '+fmtD(ini||fim);return'OFERTAS DE '+fmtD(ini)+' A '+fmtD(fim)}
const logoAsp=i=>logos[i]?logos[i].img.width/logos[i].img.height:1.5;
function logoBright(i){const L=logos[i];if(!L)return 0;if(L.bright!=null)return L.bright;
 try{const c=document.createElement('canvas'),s=Math.min(1,160/Math.max(L.img.width,L.img.height));c.width=Math.max(1,L.img.width*s|0);c.height=Math.max(1,L.img.height*s|0);const x=c.getContext('2d');x.drawImage(L.img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height).data;let op=0,wh=0;for(let k=0;k<d.length;k+=4){if(d[k+3]<60)continue;op++;if(d[k]>225&&d[k+1]>225&&d[k+2]>225)wh++}L.bright=op?wh/op:0}catch(e){L.bright=0}
 return L.bright}
function bgLum(c,x,y,w,h){try{[x,y,w,h]=devR(c,x,y,w,h);const X=Math.max(0,x|0),Y=Math.max(0,y|0),W=Math.max(1,Math.min(c.canvas.width-X,w|0)),H=Math.max(1,Math.min(c.canvas.height-Y,h|0));
 const d=c.getImageData(X,Y,W,H).data,st=Math.max(4,((d.length/4/400)|0)*4);let sum=0,n=0;for(let k=0;k<d.length;k+=st){sum+=(0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])/255;n++}return n?sum/n:0.3}catch(e){return 0.3}}
function logoLum(i){const L=logos[i];if(!L)return 0.5;if(L.lum!=null)return L.lum;
 try{const c=document.createElement('canvas'),s=Math.min(1,160/Math.max(L.img.width,L.img.height));c.width=Math.max(1,L.img.width*s|0);c.height=Math.max(1,L.img.height*s|0);const x=c.getContext('2d');x.drawImage(L.img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height).data;let n=0,sm=0;for(let k=0;k<d.length;k+=4){if(d[k+3]<60)continue;n++;sm+=(0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])/255}L.lum=n?sm/n:0.5}catch(e){L.lum=0.5}return L.lum}
/* contorno suave: silhueta da logo em volta dela, na cor oposta ao fundo. Destaca sem virar borda grossa */
function logoContour(c,img,dx,dy,dw,dh,h,dark,k){
 if(!img||!(img.naturalWidth||img.width)||dw<1||dh<1)return;
 const r=Math.max(1.5,h*0.014),o=document.createElement('canvas');o.width=Math.ceil(dw+r*4);o.height=Math.ceil(dh+r*4);const x=o.getContext('2d');x.drawImage(img,r*2,r*2,dw,dh);x.globalCompositeOperation='source-in';x.fillStyle=dark?'rgb(18,22,30)':'rgb(255,255,255)';x.fillRect(0,0,o.width,o.height);
 c.save();c.globalAlpha=(dark?0.30:0.45)+0.25*k;for(let a=0;a<12;a++){const t=a/12*Math.PI*2;c.drawImage(o,dx-r*2+Math.cos(t)*r,dy-r*2+Math.sin(t)*r)}c.restore();
 c.save();c.shadowColor=dark?`rgba(18,22,30,${(0.25+0.2*k).toFixed(2)})`:`rgba(255,255,255,${(0.3+0.2*k).toFixed(2)})`;c.shadowBlur=h*0.06;c.drawImage(img,dx,dy,dw,dh);c.restore()}
/* escolha automática do destaque: olha a logo (muito branco ou colorida) E o fundo atrás dela */
function logoFxFor(i,bg){const f=S.store.logoFx||'auto';if(f!=='auto')return f;if(bg!=null&&Math.abs(logoLum(i)-bg)<0.42)return'contour';const white=logoBright(i)>0.3,light=bg!=null&&bg>0.6,dark=bg==null||bg<0.42;
 if(white)return light?'halo':'shadow';return dark?'glow':light?'soft':'glow'}
function logoBox(c,i,x,y,w,h){
 const L=logos[i];c.save();
 if(!L){c.strokeStyle='rgba(255,255,255,.65)';c.lineWidth=Math.max(2,h*0.025);c.setLineDash([h*0.08,h*0.06]);rr(c,x,y,w,h,h*0.12);c.stroke();c.setLineDash([]);
  c.fillStyle='rgba(255,255,255,.8)';c.textAlign='center';c.textBaseline='middle';c.font=O(h*0.22,600);c.fillText('LOGO '+(i+1),x+w/2,y+h/2);c.restore();return}
 const fx=logoFxFor(i,(S.store.logoFx||'auto')==='auto'?bgLum(c,x,y,w,h):null),pad=fx==='box'?h*0.1:h*0.04,iw=L.img.width,ih=L.img.height,s=Math.min((w-pad*2)/iw,(h-pad*2)/ih),dw=iw*s,dh=ih*s,dx=x+(w-dw)/2,dy=y+(h-dh)/2;
 if(fx==='contour'){const bl=bgLum(c,x,y,w,h),ll=logoLum(i),k=clamp(1-Math.abs(ll-bl)/0.42,0,1);logoContour(c,L.img,dx,dy,dw,dh,h,bl>0.5,k);c.drawImage(L.img,dx,dy,dw,dh)}
 else if(fx==='box'){c.fillStyle='#ffffff';rr(c,x,y,w,h,h*0.14);c.fill();c.drawImage(L.img,dx,dy,dw,dh)}
 else if(fx==='glow'){c.shadowColor='rgba(0,0,0,.28)';c.shadowBlur=h*0.05;c.shadowOffsetY=h*0.018;c.drawImage(L.img,dx,dy,dw,dh);c.shadowColor='rgba(255,255,255,.38)';c.shadowBlur=h*0.045;c.shadowOffsetY=0;c.drawImage(L.img,dx,dy,dw,dh)}
 else if(fx==='halo'){/* logo branca em fundo claro: sombreado escuro suave entre as letras, sem ficar preto */
  for(const[a,b]of[[0.4,0.12],[0.5,0.045],[0.55,0.015],[0.35,0.006]]){c.shadowColor=`rgba(20,24,32,${a})`;c.shadowBlur=h*b;c.shadowOffsetY=0;c.drawImage(L.img,dx,dy,dw,dh)}}
 else if(fx==='soft'){c.shadowColor='rgba(0,0,0,.22)';c.shadowBlur=h*0.05;c.shadowOffsetY=h*0.015;c.drawImage(L.img,dx,dy,dw,dh)}
 else if(fx==='shadow'){c.shadowColor='rgba(0,0,0,.75)';c.shadowBlur=h*0.09;c.shadowOffsetY=h*0.025;c.drawImage(L.img,dx,dy,dw,dh);c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=h*0.03;c.shadowOffsetY=0;c.drawImage(L.img,dx,dy,dw,dh)}
 else c.drawImage(L.img,dx,dy,dw,dh);
 c.restore()}
function fitArea(r,a){const hh=Math.min(r.h,r.w/a);return hh*hh*a}
function logoArrange(W,hh,sl,m){
 const zh=hh-sl*0.6-m*2,have=[0,1].filter(i=>logos[i]&&!(S.logoOff||{})[i]),ids=have.length?have:[0,1],pos=S.store.logoPos||'lado';
 if(ids.length===1){const a=logoAsp(ids[0]),bw=Math.min(W*0.4,zh*a*1.05);return{bw,rects:{[ids[0]]:{x:m,y:m,w:bw,h:zh}}}}
 const g=m*0.8,bwS=Math.min(W*0.3,hh*1.55),bwL=Math.min(W*0.44,hh*2.7);
 const st=[{x:m,y:m,w:bwS,h:(zh-g)/2},{x:m,y:m+(zh+g)/2,w:bwS,h:(zh-g)/2}],sd=[{x:m,y:m,w:(bwL-g)/2,h:zh},{x:m+(bwL+g)/2,y:m,w:(bwL-g)/2,h:zh}];
 const sc=r=>Math.min(fitArea(r[0],logoAsp(0)),fitArea(r[1],logoAsp(1)));
 const side=pos==='lado'||(pos==='auto'&&sc(sd)>=sc(st));
 return side?{bw:bwL,rects:{0:sd[0],1:sd[1]}}:{bw:bwS,rects:{0:st[0],1:st[1]}}}
function headerZones(W,hh){
 const sl=hh*0.13,m=hh*0.08,L=logoArrange(W,hh,sl,m),bw=L.bw,tx=m*2+bw,tw=W-tx-m*1.6,th=(hh-sl)*0.56;
 return{sl,m,logo1:L.rects[0]||null,logo2:L.rects[1]||null,title:{x:tx,y:m*0.6,w:tw,h:th*1.25},band:{x:tx+tw*0.05,y:m*0.6+th*1.25,w:tw*0.9,h:(hh-sl)*0.27}}}
function drawHeader(c,W,H,hh,C,cp,parts){
 const pt=Object.assign({band:true,logos:true,title:true,valid:true},parts||{});
 const Z=headerZones(W,hh),sl=Z.sl,m=Z.m;c.save();
 if(pt.band){c.fillStyle=C.cabecalho;c.beginPath();c.moveTo(0,0);c.lineTo(W,0);c.lineTo(W,hh-sl);c.lineTo(0,hh);c.closePath();c.fill();if(CUR&&CUR.motivo){c.save();c.beginPath();c.moveTo(0,0);c.lineTo(W,0);c.lineTo(W,hh-sl);c.lineTo(0,hh);c.closePath();c.clip();drawHeroMotif(c,Z.title.x,0,W-Z.title.x,hh,CUR.motivo,C);c.restore()}
  const lw=Math.max(4,hh*0.035);c.strokeStyle=C.adesivo;c.lineWidth=lw;c.beginPath();c.moveTo(0,hh+lw/2);c.lineTo(W,hh-sl+lw/2);c.stroke()}
 if(pt.logos){[Z.logo1,Z.logo2].forEach((r,i)=>{if(r)logoBox(c,i,r.x,r.y,r.w,r.h)})}
 if(cp.validPos==='rodape')pt.valid=false;
 const tx=Z.title.x,tw=Z.title.w,cx=tx+tw/2,title=(cp.titulo||cp.nome||'').toUpperCase().trim(),vt0=validText();
 /* título preenche o cabeçalho: testa 1, 2 ou 3 linhas e fica com a que deixa a letra maior */
 const avail=(hh-sl)*(vt0&&pt.valid?0.66:0.82)-m*0.9,words=title.split(/\s+/).filter(Boolean),cands=[[title]];
 for(let k=1;k<words.length;k++)cands.push([words.slice(0,k).join(' '),words.slice(k).join(' ')]);
 if(words.length>=4)for(let a=1;a<words.length-1;a++)for(let b=a+1;b<words.length;b++)cands.push([words.slice(0,a).join(' '),words.slice(a,b).join(' '),words.slice(b).join(' ')]);
 let best=null;c.font=F(100);const capK=asc(c,'H',100)/100;
 cands.forEach(L=>{c.font=F(100);const mw=Math.max(...L.map(t=>c.measureText(t).width))/100;const sz=Math.min(tw*0.98/mw,avail/(capK+(L.length-1)*capK*1.12));if(!best||sz>best.sz*1.04||(sz>best.sz*0.96&&L.length<best.L.length))best={L,sz}});
 const s=best.sz,lsp=s*capK*1.12,a=s*capK;const y0=m*0.9+a+Math.max(0,(avail-(a+lsp*(best.L.length-1)))*0.35);const ty=y0+lsp*(best.L.length-1);
 if(pt.title){/* título se adapta ao fundo: se a cor escolhida some no fundo, troca por branco ou grafite */
  const bl=bgLum(c,tx,m,tw,ty-m),hl=hexLum(C.titulo);let tc=C.titulo;if(Math.abs(hl-bl)<0.32)tc=bl>0.55?'#15171c':'#ffffff';const dark=hexLum(tc)<0.4;
  const t2=best.L.length>1&&Math.abs(hexLum(C.adesivo)-bl)>0.35&&C.adesivo.toLowerCase()!==tc.toLowerCase()?C.adesivo:tc;
  c.font=F(s);c.textAlign='center';c.textBaseline='alphabetic';c.lineJoin='round';
  best.L.forEach((t,i)=>{const y=y0+i*lsp,col=i===best.L.length-1&&best.L.length>1?t2:tc,dk=hexLum(col)<0.4;c.fillStyle=dk?'rgba(255,255,255,.35)':'rgba(0,0,0,.45)';c.fillText(t,cx+s*0.06,y+s*0.06);c.lineWidth=s*0.09;c.strokeStyle=dk?'#ffffff':'rgba(0,0,0,.55)';c.strokeText(t,cx,y);c.fillStyle=col;c.fillText(t,cx,y)})}
 const vt=vt0;
 if(vt&&pt.valid){const bs=Math.min(fitLine(c,vt,tw*0.86,(hh-sl)*0.15,F),s*0.42);c.font=F(bs);const bwid=c.measureText(vt).width+bs*1.2,bht=bs*1.4;const by=pt.title?ty+bs*0.45:Z.band.y;
  c.save();c.translate(cx,by+bht/2);c.transform(1,0,-0.2,1,0,0);c.fillStyle=C.adesivo;c.fillRect(-bwid/2,-bht/2,bwid,bht);c.restore();
  c.fillStyle=C.adesivoTexto;c.textAlign='center';c.textBaseline='middle';c.fillText(vt,cx,by+bht/2+bs*0.04)}
 c.restore()}
function waDigits(){let d=(S.store.wa||'').replace(/\D/g,'');if(d.length>=10&&d.length<=11)d='55'+d;return d.length>=12?d:''}
const qrMemo={};
function drawQR(c,text,x,y,size){
 if(typeof qrcode!=='function')return false;let q=qrMemo[text];
 if(!q){try{q=qrcode(0,'M');q.addData(text);q.make();qrMemo[text]=q}catch(e){return false}}
 const n=q.getModuleCount(),cs=size/n;c.fillStyle='#000';
 for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))c.fillRect(x+k*cs,y+r*cs,cs+0.6,cs+0.6);return true}
function footerLines(){
 const l1=S.store.wa?'PEÇA PELO WHATSAPP '+S.store.wa:'OFERTAS EXCLUSIVAS NAS NOSSAS LOJAS';
 const ends=(S.store.ends||'').split('\n').map(s=>s.trim()).filter(Boolean).join('  •  ');
 const vt=validText();const l3=(vt?vt.charAt(0)+vt.slice(1).toLowerCase()+' ou enquanto durarem os estoques. ':'Ofertas válidas enquanto durarem os estoques. ')+'Imagens meramente ilustrativas.'+(S.store.extra?' '+S.store.extra:'');
 return{l1,ends,l3}}
function drawFooter(c,W,H,fh,C,mode='full'){
 if(mode==='none')return;const y=H-fh;c.save();
 const inv=S.store.rodInv;if(mode==='full'){c.fillStyle=inv?C.adesivo:C.cabecalho;c.fillRect(0,y,W,fh);c.fillStyle=inv?C.cabecalho:C.adesivo;c.fillRect(0,y,W,Math.max(4,fh*0.05))}
 else{c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=fh*0.06;c.shadowOffsetY=fh*0.015}
 const m=fh*0.13;let x=m*1.2;const d=S.store.qr===false?'':waDigits();
 if(d){const q=fh-m*2;c.fillStyle='#fff';c.fillRect(x,y+m,q,q);c.shadowColor='transparent';drawQR(c,'https://wa.me/'+d,x+q*0.07,y+m+q*0.07,q*0.86);if(mode!=='full'){c.shadowColor='rgba(0,0,0,.6)'}x+=q+m}
 let right=W-m*1.2;const vtR=CUR&&CUR.validRod?validText():'';
 if(vtR){const C2=C,bh=fh*0.5,bs=fitLine(c,vtR,W*0.36,bh*0.62,F);c.save();c.shadowColor='transparent';c.font=F(bs);const bw=c.measureText(vtR).width+bs*1.3,bx=right-bw,by=y+(fh-bh)/2+fh*0.02;
  c.translate(bx+bw/2,by+bh/2);c.transform(1,0,-0.2,1,0,0);c.fillStyle=inv?C2.cabecalho:C2.adesivo;c.fillRect(-bw/2,-bh/2,bw,bh);c.restore();
  c.save();c.shadowColor='transparent';c.font=F(bs);c.fillStyle=inv?'#ffffff':C2.adesivoTexto;c.textAlign='center';c.textBaseline='middle';c.fillText(vtR,bx+bw/2,by+bh/2+bs*0.04);c.restore();right=bx-m}
 const tw=right-x,{l1,ends,l3}=footerLines();
 const s1=fitLine(c,l1,tw,fh*0.3,z=>O(z,700));const s2=ends?fitLine(c,ends,tw,fh*0.17,z=>O(z,500)):0;const s3=fitLine(c,l3,tw,fh*0.12,z=>`500 ${z}px Inter, sans-serif`);
 const tot=s1*1.1+(s2?s2*1.25:0)+s3*1.3;let yy=y+fh*0.03+(fh-tot)/2;
 c.textAlign=d?'left':'center';const tx=d?x:x+tw/2;c.textBaseline='top';c.fillStyle=bgLum(c,tx-(d?0:tw/2),y+fh*0.15,tw,fh*0.7)>0.6?'#15171c':'#fff';if(c.fillStyle!=='#ffffff'&&mode!=='full')c.shadowColor='rgba(255,255,255,.6)';
 c.font=O(s1,700);c.fillText(l1,tx,yy);yy+=s1*1.1;
 if(s2){c.font=O(s2,500);c.fillText(ends,tx,yy);yy+=s2*1.25}
 c.globalAlpha=mode==='full'?0.82:1;c.font=`500 ${s3}px Inter, sans-serif`;c.fillText(l3,tx,yy);c.restore()}

function layoutGrid(n,x,y,w,h,g){
 if(!n)return[];let best=null;
 for(let cols=1;cols<=Math.min(n,6);cols++){const rows=Math.ceil(n/cols),cw=(w-g*(cols-1))/cols,ch=(h-g*(rows-1))/rows;const sc=Math.min(cw,ch*0.82)*(1-0.05*(rows*cols-n));if(!best||sc>best.sc)best={cols,rows,cw,ch,sc}}
 const{cols,cw,ch}=best,cells=[];
 for(let i=0;i<n;i++){const r=Math.floor(i/cols),k=i%cols,inRow=Math.min(cols,n-r*cols);let cwi=cw,x0=x;
  if(inRow<cols){const st=(w-g*(inRow-1))/inRow;if(st/ch<=1.3)cwi=st;else x0=x+(w-(inRow*cw+g*(inRow-1)))/2}
  cells.push({x:x0+k*(cwi+g),y:y+r*(ch+g),w:cwi,h:ch})}
 return cells}

function areaOf(W,H,hhO){const land=W>H,hh=hhO||H*(land?0.2:W/H<0.6?0.165:0.2),fh=H*(land?0.085:W/H<0.6?0.062:0.07),m=W*0.022,g=W*(land?0.01:0.014),top=hh+m*1.25,bot=H-fh-m;return{W,H,land,hh,fh,m,g,top,ax:m,aw:W-m*2,ah:bot-top}}
const fmtOf=(W,H)=>Object.keys(FORMATS).find(k=>FORMATS[k].w===W&&FORMATS[k].h===H);
function autoSlots(items,A){
 const{land,g,top,ax,aw,ah}=A,out=[];const feat=items.filter(p=>p.featured).slice(0,4),rest=items.filter(p=>!feat.includes(p));
 /* hierarquia de designer: ícone > destaque > normal > complemento */
 let mids=[];
 if(rest.length>=5){const exp=rest.filter(p=>p.papel==='destaque');const pool=rest.filter(p=>tierOf(p)===1&&scoreOf(p)>=0.12).sort((a,b)=>scoreOf(b)-scoreOf(a));
  const cap=Math.max(0,Math.min(rest.length-3,Math.max(2,Math.round(rest.length/4))));mids=exp.slice(0,cap);pool.forEach(p=>{if(mids.length<Math.min(cap,exp.length+Math.max(2,Math.round(rest.length/4))))mids.push(p)});mids=mids.slice(0,cap);
  if(mids.length===1&&rest.length>=7){const nx=rest.filter(p=>!mids.includes(p)&&tierOf(p)>=1).sort((a,b)=>scoreOf(b)-scoreOf(a))[0];if(nx)mids.push(nx)}}
 const ord=a=>rest.filter(p=>a.includes(p));mids=ord(mids);let smalls=rest.filter(p=>!mids.includes(p));smalls=[...smalls.filter(p=>tierOf(p)>0),...smalls.filter(p=>tierOf(p)===0)];
 const fill=(list,x,y,w,h)=>layoutGrid(list.length,x,y,w,h,g).forEach((r,i)=>out.push({...r,p:list[i]}));
 const tiers=(x,y,w,h)=>{if(!mids.length){fill(smalls,x,y,w,h);return}
  const mc=Math.min(mids.length,land?4:3),mr=Math.ceil(mids.length/mc),sc=land?5:4,sr=Math.max(1,Math.ceil(smalls.length/sc));
  const mh=smalls.length?(h-g)*(mr*1.5)/(mr*1.5+sr):h;fill(mids,x,y,w,mh);if(smalls.length)fill(smalls,x,y+mh+g,w,h-mh-g)};
 if(feat.length>2&&rest.length){/* 3 ou 4 destaques: bloco 2x2 */
  if(land){const fw=aw*0.46;layoutGrid(feat.length,ax,top,fw,ah,g).forEach((r,i)=>out.push({...r,p:feat[i]}));tiers(ax+fw+g,top,aw-fw-g,ah)}
  else{const fH=ah*(rest.length>6?0.58:0.64),rows=2,ch=(fH-g)/rows,cw=(aw-g)/2;feat.forEach((p,i)=>{const r=Math.floor(i/2),k=i%2,inRow=Math.min(2,feat.length-r*2),w=inRow===1?aw:cw;out.push({x:ax+k*(cw+g),y:top+r*(ch+g),w,h:ch,p})});tiers(ax,top+fH+g,aw,ah-fH-g)}}
 else if(feat.length&&rest.length&&land){const fw=aw*0.38,fhh=(ah-g*(feat.length-1))/feat.length;feat.forEach((p,i)=>out.push({x:ax,y:top+i*(fhh+g),w:fw,h:fhh,p}));tiers(ax+fw+g,top,aw-fw-g,ah)}
 else if(feat.length){const fH=rest.length?ah*(rest.length>4?0.36:0.42):ah,fw=(aw-g*(feat.length-1))/feat.length;feat.forEach((p,i)=>out.push({x:ax+i*(fw+g),y:top,w:fw,h:fH,p}));if(rest.length)tiers(ax,top+fH+g,aw,ah-fH-g)}
 else tiers(ax,top,aw,ah);
 return out}
function place(n,x,y,w,h,g,out){
 if(n.t==='s'){out.push({x,y,w,h});return}
 const tot=n.k.reduce((a,k)=>a+k.w,0);
 if(n.t==='r'){const av=w-g*(n.k.length-1);let xx=x;n.k.forEach(k=>{const ww=av*k.w/tot;place(k,xx,y,ww,h,g,out);xx+=ww+g})}
 else{const av=h-g*(n.k.length-1);let yy=y;n.k.forEach(k=>{const hh=av*k.w/tot;place(k,x,yy,w,hh,g,out);yy+=hh+g})}}
function slotsOf(l,x,y,w,h,g){
 if(l.list){const[cols,rows]=l.list,lg=g*0.6,cw=(w-lg*(cols-1))/cols,rh=(h-lg*(rows-1))/rows,o=[];for(let k=0;k<cols;k++)for(let r=0;r<rows;r++)o.push({x:x+k*(cw+lg),y:y+r*(rh+lg),w:cw,h:rh});return o}
 const o=[];place(l.tree,x,y,w,h,g,o);return o}
function assign(items,slots){
 const res=new Array(slots.length).fill(null),big=slots.map((s,i)=>i).sort((a,b)=>(slots[b].w*slots[b].h-slots[a].w*slots[a].h)||a-b);
 const sz=i=>slots[i].w*slots[i].h;
 const feat=items.filter(p=>tierOf(p)>=2).sort((a,b)=>tierOf(b)-tierOf(a)),comp=items.filter(p=>tierOf(p)===0),rest=items.filter(p=>tierOf(p)===1);
 feat.forEach((p,i)=>{if(i<big.length)res[big[i]]=p});
 /* complementos vão para os menores espaços */
 const free=[...big].reverse().filter(i=>!res[i]),fmax=Math.max(0,...free.map(sz));comp.forEach((p,i)=>{if(i<free.length&&sz(free[i])<fmax*0.97)res[free[i]]=p;else rest.push(p)});
 let j=0;for(let i=0;i<slots.length&&j<rest.length;i++)if(!res[i])res[i]=rest[j++];
 return res}
function drawFiller(c,x,y,w,h,C,cp){
 c.save();c.fillStyle=C.cabecalho;rr(c,x,y,w,h,Math.min(w,h)*0.035);c.fill();
 const t=(cp.titulo||cp.nome||'OFERTAS').toUpperCase(),r=fitBlock(c,t,w*0.8,h*0.6,3,h*0.3,8,F,1.0);
 c.font=F(r.s);c.fillStyle=C.titulo;c.textAlign='center';c.textBaseline='middle';let yy=y+h/2-(r.lines.length-1)*r.s/2;r.lines.forEach(l=>{c.fillText(l,x+w/2,yy);yy+=r.s});c.restore()}
function drawListRow(c,p,x,y,w,h,C,iss){
 if(HIT&&c.canvas===HIT.cv)HIT.list.push({x,y,w,h,id:p.id,card:1});
 c.save();c.fillStyle=C.cartao;rr(c,x,y,w,h,h*0.1);c.fill();c.restore();
 const pad=h*0.08,is=h-pad*2;prodImg(c,p,x+pad,y+pad,is,is);
 const pw=hasApp(p)?Math.min(w*0.5,h*3.6):Math.min(w*0.36,h*2.4),px=x+w-pad-pw;drawPriceBlock(c,p,px,y+pad,pw,h-pad*2,C,'split');
 const sub=[p.phrase,p.venc?'VENCIMENTO PRÓXIMO':'',limitText(p,true),unitPriceText(p,true)].filter(Boolean).join('  •  ');
 const dx=x+pad*2+is,dw=px-dx-pad;drawDesc(c,p,dx,y+pad,dw,(h-pad*2)*0.64,iss,'left',2);
 if(sub){c.save();const s=fitLine(c,sub,dw,h*0.2,z=>O(z,700));c.font=O(s,700);c.fillStyle='#c8141b';c.textAlign='left';c.textBaseline='middle';c.fillText(sub,dx,y+h-pad-(h-pad*2)*0.17);c.restore()}}

const secColor=nm=>(S.setores.find(s=>s.nome===nm)||{}).cor||'#333333';
function sectionSlots(items,lay,A){
 const{ax,aw,top,ah,g,land,W,H}=A,out={cards:[],strips:[]};
 const feat=lay.dest?items.filter(p=>p.featured).slice(0,land?3:4):[];
 const secs=lay.setores.map(s=>({nome:s,its:items.filter(p=>(p.setor||'')===s&&!feat.includes(p))})).filter(s=>s.its.length);
 let y=top,avail=ah;
 if(feat.length){const bh=secs.length?ah*(land?0.36:0.26):ah,fw=(aw-g*(feat.length-1))/feat.length;feat.forEach((p,i)=>out.cards.push({x:ax+i*(fw+g),y,w:fw,h:bh,p}));y+=bh+g;avail-=bh+g}
 if(!secs.length)return out;
 const hs=land?H*0.06:W*0.058,k=secs.length;let best=null;
 for(let c=2;c<=8;c++){const cw=(aw-g*(c-1))/c,R=secs.reduce((a,s)=>a+Math.ceil(s.its.length/c),0);let ch=(avail-k*(hs+g*0.5)-(R-k)*g-(k-1)*g)/R;if(ch<=8)continue;ch=Math.min(ch,cw*1.7);
  const empty=secs.reduce((a,s)=>a+Math.ceil(s.its.length/c)*c-s.its.length,0);const sc=Math.min(cw,ch*0.82)*(1-0.02*empty);if(!best||sc>best.sc)best={c,cw,ch,R,sc}}
 if(!best)return out;
 const{c,cw,ch,R}=best,used=k*(hs+g*0.5)+R*ch+(R-k)*g+(k-1)*g,extra=Math.max(0,avail-used)/k;
 secs.forEach(s=>{out.strips.push({x:ax,y,w:aw,h:hs,nome:s.nome});y+=hs+g*0.5;const rows=Math.ceil(s.its.length/c);
  s.its.forEach((p,i)=>{const r=Math.floor(i/c),kk=i%c,inRow=Math.min(c,s.its.length-r*c),x0=ax+(aw-(inRow*cw+g*(inRow-1)))/2;out.cards.push({x:x0+kk*(cw+g),y:y+r*(ch+g),w:cw,h:ch,p})});
  y+=rows*ch+(rows-1)*g+g+extra});
 return out}
function drawStrip(c,s,C){
 const{x,y,w,h,nome}=s,cor=secColor(nome);c.save();
 c.fillStyle='rgba(0,0,0,.3)';c.fillRect(x+h*0.07,y+h*0.07,w,h);c.fillStyle=cor;c.fillRect(x,y,w,h);
 c.fillStyle=C.adesivo;c.beginPath();c.moveTo(x+w-h*2.2,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x+w-h*2.9,y+h);c.closePath();c.fill();
 c.fillStyle='#ffffff';c.fillRect(x,y,h*0.18,h);
 const t=nome.toUpperCase(),sz=fitLine(c,t,w-h*3.6,h*0.74,F);c.font=F(sz);c.fillStyle='#ffffff';c.textAlign='left';c.textBaseline='middle';c.fillText(t,x+h*0.5,y+h/2+sz*0.04);c.restore()}
/* ===== MODELOS DE ARTE PRÓPRIA: a arte do Photoshop vira campanha; só mudam produto, preço, foto e data ===== */
const fmtDY=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y};
const MODELOS={superdia:{nome:'Super Dia D',bg:'/encartes/modelos/superdia_bg.jpg',W:2109,H:2576,
 herois:[{n:[49,826,486,134],img:[6,972,674,535],sem:[231,1398,91],com:[474,1373,136],lim:[523,1057,112]},
  {n:[717,826,547,134],img:[717,972,778,535],sem:[1070,1380,88],com:[1300,1361,150],lim:[1205,1057,108]},
  {n:[1500,826,440,134],img:[1507,972,353,547],sem:[1696,1373,88],com:[1902,1367,140],lim:[1963,1070,112]}],
 peq:[{n:[100,1562,496,103],img:[0,1677,632,511],tag:[462,2151,328,182]},
  {n:[700,1550,449,60],img:[699,1610,298,310],tag:[1021,1841,207,134]},
  {n:[1180,1550,382,60],img:[1197,1617,268,303],tag:[1465,1854,207,134]},
  {n:[717,1939,462,67],img:[717,2006,365,279],tag:[1045,2237,207,134]},
  {n:[1180,1939,358,67],img:[1185,2042,359,243],tag:[1483,2237,207,134]},
  {n:[1600,1574,454,91],img:[1580,1702,486,498],tag:[1933,2151,316,182]}],
 data:[62,2338,640,225]}};
const modeloSlots=m=>m.slots?m.slots.length:m.herois.length+m.peq.length;
/* modelos criados pelo dono a partir de uma imagem (fundo limpo + vagas marcadas) */
const getMod=id=>id?(MODELOS[id]||(S.modelosU||[]).find(m=>m.id===id)||null):null;
const MODIMG=new Map();
function modeloBg(m){if(m.slots){const key='mod:'+m.id;let e=MODIMG.get(key);if(!e){e={img:null};MODIMG.set(key,e);IDB.get(key).then(async u=>{if(u){try{e.img=await loadImg(u);schedule()}catch(_){}}})}return e.img}
 let e=MODIMG.get(m.bg);if(!e){e={img:null};MODIMG.set(m.bg,e);const im=new Image();im.onload=()=>{e.img=im;schedule()};im.src=m.bg}return e.img}
const unU=p=>p.unit==='kg'?'KG':p.unit==='un'?'UND.':String(p.unit||'').toUpperCase();
function bigPrice(c,cx,cy,mw,mh,v,unit,col,ucol){if(v==null||isNaN(v))return;const[ri,ce]=Number(v).toFixed(2).split('.');
 let z=mh;c.font=F(z);let wi=c.measureText(ri).width,wc=0;const f=()=>{c.font=F(z);wi=c.measureText(ri).width;c.font=F(z*0.5);wc=Math.max(c.measureText(','+ce).width,c.measureText(unit).width*0.62)};f();while(wi+wc>mw&&z>8){z*=0.94;f()}
 const x0=cx-(wi+wc)/2,base=cy+z*0.36;c.save();c.fillStyle=col;c.textBaseline='alphabetic';c.textAlign='left';c.font=F(z);thick(c,ri,x0,base,z,0.028);
 c.font=F(z*0.5);thick(c,','+ce,x0+wi,base-z*0.36,z*0.5,0.022,false);c.shadowColor='transparent';c.font=F(z*0.24);c.fillStyle=ucol||col;c.textAlign='center';c.fillText(unit,x0+wi+wc/2,base);c.restore()}
function circleBadge(c,x,y,r,big){c.save();c.shadowColor='rgba(0,0,0,.5)';c.shadowBlur=r*0.18;c.shadowOffsetY=r*0.06;c.fillStyle=big?'#f05a1a':'#d23a17';c.beginPath();c.arc(x,y,r,0,7);c.fill();c.restore();
 c.save();const g=c.createRadialGradient(x-r*0.25,y-r*0.3,r*0.1,x,y,r*0.9);g.addColorStop(0,'#5a1a12');g.addColorStop(1,'#1d0806');c.fillStyle=g;c.beginPath();c.arc(x,y,r*(big?0.9:0.88),0,7);c.fill();c.restore()}
function drawHeroModelo(c,s,p,iss){const[nx,ny,nw,nh]=s.n,[ix,iy,iw,ih]=s.img;
 groundShadow(c,p,ix,iy,iw,ih);prodImg(c,p,ix,iy,iw,ih);
 const lines=wrapLines(c,String(p.desc||'').toUpperCase(),nw,z=>O(z,700),2,nh/2.1);c.save();c.fillStyle='#f5ecd6';c.textAlign='center';c.textBaseline='middle';c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=8;c.font=lines.font;lines.list.forEach((t,i)=>c.fillText(t,nx+nw/2,ny+nh/2+(i-(lines.list.length-1)/2)*lines.lh));c.restore();
 if(p.limit>0){const[lx,ly,lr]=s.lim;c.save();c.shadowColor='rgba(0,0,0,.45)';c.shadowBlur=lr*0.2;c.fillStyle='#ffffff';c.beginPath();c.arc(lx,ly,lr,0,7);c.fill();c.restore();const g=c.createLinearGradient(0,ly-lr,0,ly+lr);g.addColorStop(0,'#3f7bf5');g.addColorStop(1,'#1638a8');c.fillStyle=g;c.beginPath();c.arc(lx,ly,lr*0.92,0,7);c.fill();
  const L=[`${p.limit}${p.unit==='kg'?'KG':' UN'}/CPF`,'NO PREÇO','DO APP'];c.save();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';L.forEach((t,i)=>{const z=fitLine(c,t,lr*1.45,lr*0.36,q=>O(q,700));c.font=O(z,700);c.fillText(t,lx,ly+(i-1)*lr*0.42)});c.restore()}
 const app=hasApp(p);
 if(app){const[sx,sy,sr]=s.sem;circleBadge(c,sx,sy,sr,false);c.save();c.fillStyle='#f5ecd6';c.textAlign='center';c.font=O(sr*0.24,700);c.fillText('SEM APP',sx,sy-sr*0.45);c.restore();bigPrice(c,sx,sy+sr*0.1,sr*1.5,sr*0.86,p.price,unU(p),'#ffffff')}
 const[cx,cy,cr]=s.com;circleBadge(c,cx,cy,cr,true);if(app){c.save();c.fillStyle='#f5ecd6';c.textAlign='center';c.font=O(cr*0.2,700);c.fillText('COM APP',cx,cy-cr*0.5);c.restore()}
 bigPrice(c,cx,cy+cr*(app?0.1:0.02),cr*1.58,cr*0.96,app?p.app:p.price,unU(p),'#ffffff')}
function hexPath(c,x,y,w,h){const k=h*0.32;c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2+k,y-h/2);c.lineTo(x+w/2-k,y-h/2);c.lineTo(x+w/2,y);c.lineTo(x+w/2-k,y+h/2);c.lineTo(x-w/2+k,y+h/2);c.closePath()}
function drawPeqModelo(c,s,p){const[nx,ny,nw,nh]=s.n,[ix,iy,iw,ih]=s.img,[tx,ty,tw,th]=s.tag;
 groundShadow(c,p,ix,iy,iw,ih);prodImg(c,p,ix,iy,iw,ih);
 const lines=wrapLines(c,p.desc||'',nw,z=>`600 ${z}px Inter,Arial,sans-serif`,2,nh/2.15);c.save();c.fillStyle='#e9e5e1';c.textAlign='right';c.textBaseline='middle';c.font=lines.font;lines.list.forEach((t,i)=>c.fillText(t,nx+nw,ny+(p.nameDy||0)*nh+nh/2+(i-(lines.list.length-1)/2)*lines.lh));c.restore();
 c.save();c.shadowColor='rgba(0,0,0,.55)';c.shadowBlur=th*0.15;c.shadowOffsetY=th*0.05;const g=c.createLinearGradient(tx-tw/2,0,tx+tw/2,0);g.addColorStop(0,'#ffb72a');g.addColorStop(1,'#e2601a');c.fillStyle=g;hexPath(c,tx,ty,tw,th);c.fill();c.restore();
 c.fillStyle='#121212';hexPath(c,tx,ty,tw*0.94,th*0.88);c.fill();
 const rr_=th*0.17,rx=tx-tw/2+th*0.05;c.fillStyle='#f5a623';c.beginPath();c.arc(rx,ty,rr_,0,7);c.fill();c.fillStyle='#111';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${rr_*0.95}px Inter,Arial,sans-serif`;c.fillText('R$',rx,ty+rr_*0.05);
 const app=hasApp(p);bigPrice(c,tx+tw*0.05,ty,tw*0.7,th*0.72,app?p.app:p.price,p.unit==='kg'?'KG':'CADA','#ffffff','#f5a623');
 if(app){c.save();c.fillStyle='#f5ecd6';c.textAlign='center';c.font=`600 ${th*0.17}px Inter,Arial,sans-serif`;c.fillText(`sem app ${brl(p.price)} • com app`,tx,ty-th*0.62);c.restore()}}
function wrapLines(c,t,w,fontFn,max,z0){let z=z0;for(let k=0;k<40;k++){c.font=fontFn(z);const words=String(t).split(/\s+/),L=[];let cur='';words.forEach(wd=>{const tt=cur?cur+' '+wd:wd;if(c.measureText(tt).width<=w||!cur)cur=tt;else{L.push(cur);cur=wd}});if(cur)L.push(cur);
  if(L.length<=max&&L.every(l=>c.measureText(l).width<=w))return{list:L,font:fontFn(z),lh:z*1.08};z*=0.93}return{list:[String(t)],font:fontFn(z),lh:z*1.08}}
function drawModeloData(c,m){if(!m.data)return;let[x,y,w,h]=m.data;const v=S.val||{};const one=!v.fim||v.fim===v.ini,L=one?['OFERTA VÁLIDA','SOMENTE P/ O DIA',fmtDY(v.ini)||'--/--/----']:['OFERTA VÁLIDA','DE '+fmtD(v.ini),'ATÉ '+fmtDY(v.fim)];
 c.save();c.fillStyle=m.dataCor||'#fbf1e6';c.textBaseline='top';c.textAlign=m.slots?'center':'left';if(m.slots){x+=w/2;y+=h*0.04;h*=0.8}c.shadowColor='rgba(0,0,0,.3)';c.shadowOffsetY=3;const hs=[0.36,0.27,0.37];let yy=y;L.forEach((t,i)=>{const z=fitLine(c,t,w,h*hs[i],q=>F(q));c.font=F(z);c.fillText(t,x,yy);yy+=h*hs[i]});c.restore()}
function drawModeloU(c,W,H,items,cp,iss,m){const k=Math.min(W/m.W,H/m.H),ox=(W-m.W*k)/2,oy=(H-m.H*k)/2;
 c.save();c.fillStyle='#1e1f24';c.fillRect(0,0,W,H);c.translate(ox,oy);c.scale(k,k);const bg=modeloBg(m);if(bg)c.drawImage(bg,0,0,m.W,m.H);
 const hit=HIT;
 m.slots.forEach((s,i)=>{const p=items[i];if(!p)return;const lum=bgLum(c,s.x,s.y,s.w,s.h),C=Object.assign({},cp.cores,{fundo:lum>0.6?'#ffffff':'#000000'});
  HIT=null;c.save();c.beginPath();c.rect(s.x,s.y,s.w,s.h);c.clip();drawVitrine(c,p,s.x,s.y,s.w,s.h,C,iss);c.restore();HIT=hit;
  if(HIT&&c.canvas===HIT.cv)HIT.list.push({x:s.x*k+ox,y:s.y*k+oy,w:s.w*k,h:s.h*k,id:p.id,card:1})});
 drawModeloData(c,m);c.restore();
 if(items.length>m.slots.length)iss&&iss.push(`Este modelo tem ${m.slots.length} espaços; o resto vai para outra arte`)}
function drawModelo(c,W,H,items,cp,iss){const m=getMod(cp.modelo);if(m.slots)return drawModeloU(c,W,H,items,cp,iss,m);const k=Math.max(W/m.W,H/m.H),ox=(W-m.W*k)/2,oy=(H-m.H*k)/2;
 c.save();c.fillStyle='#232126';c.fillRect(0,0,W,H);c.translate(ox,oy);c.scale(k,k);const bg=modeloBg(m);if(bg)c.drawImage(bg,0,0,m.W,m.H);
 const push=(p,x,y,w,h)=>{if(HIT&&c.canvas===HIT.cv&&p)HIT.list.push({x:x*k+ox,y:y*k+oy,w:w*k,h:h*k,id:p.id,card:1})};
 m.herois.forEach((s,i)=>{const p=items[i];if(!p)return;drawHeroModelo(c,s,p,iss);push(p,s.n[0],s.n[1],s.img[0]+s.img[2]-s.n[0],s.img[1]+s.img[3]-s.n[1])});
 m.peq.forEach((s,i)=>{const p=items[m.herois.length+i];if(!p)return;drawPeqModelo(c,s,p);push(p,s.img[0],s.n[1],s.img[2],s.tag[1]+s.tag[3]/2-s.n[1])});
 drawModeloData(c,m);c.restore();
 if(items.length>modeloSlots(m))iss&&iss.push(`Este modelo tem ${modeloSlots(m)} espaços; o resto vai para outra arte`)}
function renderFlyer(c,W,H,items,cp,iss,lay){
 if(cp&&cp.modelo&&getMod(cp.modelo)){CUR={W,H,noCards:false};drawModelo(c,W,H,items,cp,iss);return}
 const fk=fmtOf(W,H),art=fk&&artCache.get(artKey(cp.id,fk));const HD=!art&&cp?headOf(cp,W,H):null;CUR={W,H,noCards:!!art&&cp.cards===false,tema:cp.tema||'',motivo:cp.motivo||'',estilo:cp.estilo||'',validRod:cp.validPos==='rodape'||!!HD,destFundo:cp.destFundo||''};let C=cp.cores;const A=areaOf(W,H,HD?HD.hh:0);if(S.store.tinta&&!art&&(fk==='a4'||fk==='a4h'))C=Object.assign({},C,{fundo:'#ffffff'});c.save();
 if(art)cover(c,art.img,0,0,W,H);else drawBg(c,W,H,C);
 if(HD){c.drawImage(HD.img,0,0,HD.img.width,Math.min(HD.img.height,HD.hh*HD.img.width/W),0,0,W,HD.hh);if(cp.headLogos)drawHeader(c,W,H,A.hh,C,cp,{band:false,title:false,valid:false,logos:true});drawFooter(c,W,H,A.fh,C)}
 else if(!art&&cp.headArt&&W>H){drawHeader(c,W,H,A.hh,C,cp,{logos:false});drawFooter(c,W,H,A.fh,C)}
 else if(!art){drawHeader(c,W,H,A.hh,C,cp);drawFooter(c,W,H,A.fh,C)}
 else{const o=artOpt(cp);drawHeader(c,W,H,A.hh,C,cp,o);drawFooter(c,W,H,A.fh,C,o.rodape)}
 if(lay&&lay.sec){const o=sectionSlots(items,lay,A);o.strips.forEach(st=>drawStrip(c,st,C));o.cards.forEach(r=>drawCard(c,r.p,r.x,r.y,r.w,r.h,C,iss));
  if(!items.length){c.fillStyle='#fff';c.textAlign='center';c.font=O(W*0.035,600);c.fillText(lay.setores.length?'Nenhum produto nesses setores':'Escolha os setores desta arte',W/2,A.top+A.ah/2)}c.restore();return}
 if(lay&&!lay.auto){
  const sl=slotsOf(lay,A.ax,A.top,A.aw,A.ah,A.g);
  if(lay.list)sl.forEach((r,i)=>{if(items[i])drawListRow(c,items[i],r.x,r.y,r.w,r.h,C,iss)});
  else{const as=assign(items,sl);sl.forEach((r,i)=>as[i]?drawCard(c,as[i],r.x,r.y,r.w,r.h,C,iss):drawFiller(c,r.x,r.y,r.w,r.h,C,cp))}
  c.restore();return}
 if(!items.length){c.fillStyle='#fff';c.textAlign='center';c.font=O(W*0.04,600);c.fillText('Adicione produtos na lista',W/2,A.top+A.ah/2);c.restore();return}
 autoSlots(items,A).forEach(r=>drawCard(c,r.p,r.x,r.y,r.w,r.h,C,iss));
 c.restore()}
function cover(c,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;c.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

/* ---------- croqui ---------- */
function drawCroqui(cv,l,fk,maxW=132,maxH=150,items){
 const f=FORMATS[fk],s=Math.min(maxW/f.w,maxH/f.h);cv.width=Math.round(f.w*s);cv.height=Math.round(f.h*s);
 const c=cv.getContext('2d');c.setTransform(s,0,0,s,0,0);const A=areaOf(f.w,f.h);
 c.fillStyle='#efece6';c.fillRect(0,0,f.w,f.h);c.fillStyle='#b8b0a1';c.fillRect(0,0,f.w,A.hh);c.fillRect(0,f.h-A.fh,f.w,A.fh);
 if(l.sec){const its=items||[];const o=sectionSlots(its,l,A);c.fillStyle='#6f6758';o.strips.forEach(r=>c.fillRect(r.x,r.y,r.w,r.h));c.lineWidth=2/s;c.strokeStyle='#fff';o.cards.forEach(r=>{c.fillStyle=r.p.featured&&l.dest?'#857d6e':'#c4bcae';c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h)});
  if(!o.strips.length&&!o.cards.length){for(let i=0;i<3;i++){const y=A.top+i*A.ah/3;c.fillStyle='#6f6758';c.fillRect(A.ax,y,A.aw,A.ah*0.06);c.fillStyle='#c4bcae';for(let k=0;k<3;k++)c.fillRect(A.ax+k*A.aw/3+A.g/2,y+A.ah*0.08,A.aw/3-A.g,A.ah/3-A.ah*0.1-A.g)}}return}
 let sl;if(l.auto){const n=Math.min(Math.max(S.products.length,1),FORMATS[fk].limit);sl=autoSlots(S.products.slice(0,n).length?S.products.slice(0,n):[{}],A)}else sl=slotsOf(l,A.ax,A.top,A.aw,A.ah,A.g);
 const ar=sl.map(r=>r.w*r.h),mx=Math.max(...ar),mn=Math.min(...ar),uni=mx/mn<1.15;
 c.lineWidth=2/s;c.strokeStyle='#ffffff';
 sl.forEach((r,i)=>{
  if(l.list){c.fillStyle='#ddd7cb';c.fillRect(r.x,r.y,r.w,r.h);c.fillStyle='#9a9283';c.fillRect(r.x+r.h*0.1,r.y+r.h*0.1,r.h*0.8,r.h*0.8);c.fillRect(r.x+r.w-r.w*0.32,r.y+r.h*0.1,r.w*0.3,r.h*0.8);return}
  const k=ar[i]/mx;c.fillStyle=uni?'#c4bcae':k>0.6?'#857d6e':k>0.3?'#ada595':'#d6cfc2';c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h)})}

/* ---------- plaquinhas ---------- */
function renderPlaque(c,W,H,p,cp,fold){
 CUR={W:W*0.75,H};const C=cp.cores;c.save();c.fillStyle='#fff';c.fillRect(0,0,W,H);
 c.strokeStyle='#9a9a9a';c.lineWidth=3;c.setLineDash([W*0.014,W*0.009]);c.beginPath();c.moveTo(0,fold);c.lineTo(W,fold);c.stroke();c.setLineDash([]);
 c.fillStyle='#a8a8a8';c.textAlign='center';c.textBaseline='middle';c.font=`500 ${fold*0.16}px Inter, sans-serif`;c.fillText('▲  DOBRE AQUI E PRENDA NO SUPORTE DA GÔNDOLA  ▲',W/2,fold*0.55);
 const y0=fold,bh=H-fold,land=W>bh,noImg=!getImg(p),hb=bh*(land?0.15:0.1)*(noImg?1.35:1),m=W*0.03;
 c.fillStyle=C.cabecalho;c.fillRect(0,y0,W,hb);c.fillStyle=C.adesivo;c.fillRect(0,y0+hb,W,Math.max(4,hb*0.06));
 const lh=hb*0.8,lw=lh*1.6;logoBox(c,0,m,y0+(hb-lh)/2,lw,lh);logoBox(c,1,m*1.5+lw,y0+(hb-lh)/2,lw,lh);
 const tx=m*2.5+lw*2,tw=W-tx-m,tt=(cp.titulo||cp.nome).toUpperCase();const ts=fitLine(c,tt,tw,hb*0.62,F);c.font=F(ts);c.fillStyle=C.titulo;c.textAlign='right';c.textBaseline='middle';c.fillText(tt,W-m,y0+hb/2+ts*0.04);
 const by=y0+hb+m,rest=H-by-m;const vH=rest*0.07;
 const upq=unitPriceText(p,true),vt=(upq?upq+' • ':'')+(p.venc?(p.vencData?'Vence em '+fmtDY(p.vencData)+' • ':'Vencimento próximo • '):'')+(S.val.fim?'Oferta válida até '+fmtD(S.val.fim):'')+(noImg?'':' • Imagem meramente ilustrativa');
 if(noImg&&land){/* sem foto: nome grande à esquerda, preço à direita, ocupa tudo */
  const lw2=W*0.5,lx=m*1.5,px=lx+lw2+m*1.5,pw=W-px-m*1.5;let yy=by+rest*0.02;
  if(p.phrase){drawSticker(c,p.phrase,lx,yy,lw2,rest*0.085,C,-0.04);yy+=rest*0.15}
  const lH=p.limit>0?rest*0.09:0,bot=by+rest-vH-rest*0.03;
  const nL=(p.desc||'').length<=12?1:(p.desc||'').length<=26?2:3;drawDesc(c,Object.assign({},p,{_cap:0.2}),lx,yy,lw2,bot-lH-(lH?rest*0.03:0)-yy,null,'left',nL);
  if(p.limit>0)drawLimit(c,p,lx,bot-lH,lw2,lH);
  c.fillStyle=C.adesivo;c.fillRect(lx+lw2+m*0.7,by+rest*0.06,Math.max(3,W*0.004),rest-vH-rest*0.12);
  const pH=rest*(hasApp(p)?0.7:0.6);drawPriceBlock(c,p,px,by+(rest-vH-pH)/2,pw,pH,C,'stack');
 }else if(noImg){/* sem foto, em pé: nome grande no alto, preço grande embaixo */
  let yy=by+rest*0.02;if(p.phrase){drawSticker(c,p.phrase,m,yy,W*0.75,rest*0.05,C);yy+=rest*0.09}
  const pH=rest*0.34,py=by+rest-vH-pH-rest*0.02,lH=p.limit>0?rest*0.06:0;
  const nL=(p.desc||'').length<=12?1:(p.desc||'').length<=24?2:(p.desc||'').length<=40?3:4;drawDesc(c,Object.assign({},p,{_cap:0.17}),m,yy,W-m*2,py-lH-rest*0.04-yy,null,'center',nL);
  if(p.limit>0)drawLimit(c,p,m*2,py-lH-rest*0.02,W-m*4,lH);
  drawPriceBlock(c,p,m,py,W-m*2,pH,C,'split');
 }else if(land){
  const iw=W*0.46;groundShadow(c,p,m,by,iw,rest-vH);prodImg(c,p,m,by,iw,rest-vH);
  const cx=m*2+iw,cw=W-cx-m;let yy=by;
  if(p.phrase){drawSticker(c,p.phrase,cx,yy,cw,rest*0.075,C,-0.05);yy+=rest*0.14}
  const pH=rest*(hasApp(p)?0.46:0.4),py=by+rest-vH-pH,lH=p.limit>0?rest*0.08:0,ly=py-lH-rest*0.025;
  drawDesc(c,p,cx,yy,cw,(p.limit>0?ly:py-rest*0.02)-yy,null,'left',3);
  if(p.limit>0)drawLimit(c,p,cx,ly,cw,lH);
  drawPriceBlock(c,p,cx,py,cw,pH,C,'stack');
 }else{
  const ih=rest*0.44;groundShadow(c,p,m,by,W-m*2,ih);prodImg(c,p,m,by,W-m*2,ih);
  if(p.phrase)drawSticker(c,p.phrase,m,by,W*0.7,rest*0.045,C);
  let yy=by+ih+rest*0.015;drawDesc(c,p,m,yy,W-m*2,rest*0.13,null,'center',3);yy+=rest*0.14;
  drawLimit(c,p,m*2,yy,W-m*4,rest*0.05);
  drawPriceBlock(c,p,m,by+rest-vH-rest*0.24,W-m*2,rest*0.24,C,'split');
 }
 if(p.venc){const s=rest*(land?0.055:0.04);pill(c,vencTxt(p),land&&!noImg?m+W*0.46:W-m,by+s*0.2,s,'right','#ff6d00','#ffffff')}
 const lt=vt;
 c.fillStyle='#555';c.textAlign='center';c.textBaseline='middle';c.font=`500 ${fitLine(c,lt,W-m*2,vH*0.55,z=>`500 ${z}px Inter, sans-serif`)}px Inter, sans-serif`;c.fillText(lt,W/2,H-m-vH/2);
 c.strokeStyle=C.cabecalho;c.lineWidth=W*0.006;c.strokeRect(c.lineWidth/2,y0+c.lineWidth/2,W-c.lineWidth,bh-c.lineWidth);
 c.restore()}
const hasLimitText=p=>p.limit>0;
/* folha e posição das plaquinhas: vertical (em pé) ou horizontal (deitada), 1 ou 2 por folha A4 */
function plaqDims(per,ori){ori=ori||(per===2?'h':'v');
 if(per===1)return ori==='v'?{page:'portrait',w:210,h:297,pos:[[0,0]]}:{page:'landscape',w:297,h:210,pos:[[0,0]]};
 return ori==='h'?{page:'portrait',w:210,h:148.5,pos:[[0,0],[0,148.5]],cut:[0,148.5,210,148.5]}:{page:'landscape',w:148.5,h:210,pos:[[0,0],[148.5,0]],cut:[148.5,0,148.5,210]}}
function plaqDoc(list,per,ori,cpx){const J=window.jspdf.jsPDF,PX=12,d=plaqDims(per,ori),doc=new J({unit:'mm',format:'a4',orientation:d.page}),n=d.pos.length;
 const mk=p=>{const c=document.createElement('canvas');c.width=Math.round(d.w*PX);c.height=Math.round(d.h*PX);renderPlaque(c.getContext('2d'),c.width,c.height,p,cpx||camp(),30*PX);return c.toDataURL('image/jpeg',0.92)};
 for(let i=0;i<list.length;i+=n){if(i)doc.addPage();d.pos.forEach(([x,y],k)=>{const p=list[i+k];if(p)doc.addImage(mk(p),'JPEG',x,y,d.w,d.h)});
  if(d.cut&&list[i+1]){doc.setDrawColor(140);doc.setLineDashPattern([3,2],0);doc.line(...d.cut);doc.setLineDashPattern([],0)}}
 return doc.output('blob')}

/* ---------- slides (TV e vídeo) ---------- */
/* tira o fundo branco liso de fotos JPG (só a área branca ligada à borda); devolve null se o fundo não for branco */
const CW=new WeakMap();
function cutWhite(img){if(CW.has(img))return CW.get(img);let r=null;
 try{const k=Math.min(1,900/Math.max(img.width,img.height)),w=Math.max(1,img.width*k|0),h=Math.max(1,img.height*k|0),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(img,0,0,w,h);const D=x.getImageData(0,0,w,h),d=D.data;
  const wh=i=>{const a=d[i],b=d[i+1],e=d[i+2];return Math.min(a,b,e)>228&&Math.max(a,b,e)-Math.min(a,b,e)<22};
  let n=0,t=0;for(let i=0;i<w;i++){t+=2;n+=wh(i*4)+wh(((h-1)*w+i)*4)}for(let j=0;j<h;j++){t+=2;n+=wh(j*w*4)+wh((j*w+w-1)*4)}
  if(n/t>0.88){const m=new Uint8Array(w*h),st=[];const push=q=>{if(!m[q]&&wh(q*4)){m[q]=1;st.push(q)}};
   for(let i=0;i<w;i++){push(i);push((h-1)*w+i)}for(let j=0;j<h;j++){push(j*w);push(j*w+w-1)}
   while(st.length){const q=st.pop(),qx=q%w;if(qx>0)push(q-1);if(qx<w-1)push(q+1);if(q>=w)push(q-w);if(q<w*(h-1))push(q+w)}
   let kept=0;for(let q=0;q<w*h;q++){if(m[q])d[q*4+3]=0;else{kept++;const qx=q%w;if((qx>0&&m[q-1])||(qx<w-1&&m[q+1])||(q>=w&&m[q-w])||(q<w*(h-1)&&m[q+w]))d[q*4+3]=150}}
   if(kept>w*h*0.04){x.putImageData(D,0,0);let x0=w,y0=h,x1=0,y1=0;for(let q=0;q<w*h;q++)if(!m[q]){const qx=q%w,qy=q/w|0;if(qx<x0)x0=qx;if(qx>x1)x1=qx;if(qy<y0)y0=qy;if(qy>y1)y1=qy}
    const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,-x0,-y0);r=o}}}catch(e){r=null}
 CW.set(img,r);return r}
function prodImgRaw(c,img,p,x,y,w,h){const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;
 c.save();const cx=x+w/2,cy=y+h-dh*0.01,rx=dw*0.4,ry=Math.max(3,h*0.04);const g=c.createRadialGradient(cx,cy,0,cx,cy,rx);g.addColorStop(0,'rgba(0,0,0,.35)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.fill();c.restore();
 const n=multiCount(p,img,w,h);if(n<=1){c.drawImage(img,x+(w-dw)/2,y+h-dh,dw,dh);return}
 const L=n>=5?[[-2,0.74],[2,0.74],[-1,0.86],[1,0.86],[0,1]]:[[-1,0.86],[1,0.86],[0,1]],off=k=>Math.sign(k)*(Math.abs(k)>=2?0.7+0.86*0.7:0.7),ext=Math.max(...L.map(([k,sc])=>Math.abs(off(k))+sc/2))*2;
 let s0=s;if(ext*img.width*s0>w*0.98)s0*=w*0.98/(ext*img.width*s0);const ew=img.width*s0,eh=img.height*s0;
 L.forEach(([k,sc])=>{c.filter=sc<0.8?'brightness(0.8)':sc<1?'brightness(0.9)':'none';c.drawImage(img,cx+off(k)*ew-ew*sc/2,y+h-eh*sc-(1-sc)*eh*0.18,ew*sc,eh*sc)});c.filter='none'}
/* vídeo/TV: produto em modo vitrine, nunca cortado (zoom do encarte ignorado) */
function vidImg(c,p,x,y,w,h){const img=getImg(p);
 c.save();const gx=x+w/2,gy=y+h*0.55,gr=c.createRadialGradient(gx,gy,0,gx,gy,Math.max(w,h)*0.62);gr.addColorStop(0,'rgba(255,255,255,.38)');gr.addColorStop(0.5,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=gr;c.fillRect(x-w*0.15,y-h*0.15,w*1.3,h*1.3);c.restore();
 if(!img){placeholder(c,x,y,w,h);return}
 if(statsOf(img).cut<0.04){const k=cutWhite(img);if(k){prodImgRaw(c,k,p,x,y,w,h);return}
  /* foto com fundo próprio (não branco): mostra inteira, cantos arredondados */
  const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s,dx=x+(w-dw)/2,dy=y+(h-dh)/2,r=Math.min(dw,dh)*0.05;
  c.save();c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=Math.min(dw,dh)*0.06;c.shadowOffsetY=Math.min(dw,dh)*0.02;c.fillStyle='#fff';rr(c,dx,dy,dw,dh,r);c.fill();c.restore();
  c.save();rr(c,dx,dy,dw,dh,r);c.clip();c.drawImage(img,dx,dy,dw,dh);c.restore();return}
 const q=Object.assign({},p,{zoom:Math.min(p.zoom||1,1),dy:0});groundShadow(c,q,x,y,w,h);prodImg(c,q,x,y,w,h)}
/* logos da final do vídeo, uma em cima da outra (só as que existem e estão ligadas) */
function outroLogos(c,x,y,w,h,a){const ids=[0,1].filter(i=>logos[i]&&!(S.logoOff||{})[i]);if(!ids.length)return false;
 const gap=h*0.06,bh=(h-gap*(ids.length-1))/ids.length,bh2=ids.length===1?Math.min(bh,h*0.6):bh;
 ids.forEach((i,k)=>{const yy=ids.length===1?y+(h-bh2)/2:y+k*(bh+gap);c.save();c.globalAlpha=a;logoBox(c,i,x,yy,w,bh2);c.restore()});return true}

const easeBack=t=>{const s=1.70158;t=t-1;return t*t*((s+1)*t+s)+1};
function slides(){return[{k:'intro',d:3},...S.products.map(p=>({k:'p',p,d:+S.tvSec||5})),{k:'outro',d:4}]}
function slideAt(L,t){const tot=L.reduce((a,s)=>a+s.d,0);t=((t%tot)+tot)%tot;for(const s of L){if(t<s.d)return{s,lt:t};t-=s.d}return{s:L[0],lt:0}}
function drawSlide(c,W,H,s,lt){
 CUR={W,H};const cp=camp(),C=cp.cores,land=W>H;c.save();drawBg(c,W,H,C);
 const pr=k=>clamp((lt-k)/0.55,0,1),pop=k=>easeBack(pr(k)),fade=k=>clamp((lt-k)/0.35,0,1);
 if(s.k==='intro'){
  const a=pop(0.1);const bw=land?W*0.2:W*0.42,bh=bw*0.72;c.globalAlpha=fade(0);
  logoBox(c,0,W/2-bw-W*0.01,H*(land?0.06:0.1),bw,bh);logoBox(c,1,W/2+W*0.01,H*(land?0.06:0.1),bw,bh);c.globalAlpha=1;
  const t=(cp.titulo||cp.nome).toUpperCase();const ts=fitLine(c,t,W*0.86,land?H*0.3:H*0.13,F);
  c.save();c.translate(W/2,H*0.52);c.scale(a,a);c.font=F(ts);c.textAlign='center';c.textBaseline='middle';c.fillStyle='rgba(0,0,0,.4)';c.fillText(t,ts*0.05,ts*0.05);c.fillStyle=C.titulo;c.fillText(t,0,0);c.restore();
  const vt=validText();if(vt){c.globalAlpha=fade(0.6);pill(c,vt,W/2,H*(land?0.68:0.6),land?H*0.05:W*0.045,'center',C.adesivo,C.adesivoTexto);c.globalAlpha=1}
  c.globalAlpha=fade(1);c.fillStyle='#fff';c.textAlign='center';c.font=O(land?H*0.05:W*0.05,600);c.fillText('CONFIRA AS OFERTAS',W/2,H*(land?0.86:0.75));c.globalAlpha=1;
 }else if(s.k==='outro'){
  const d=waDigits(),nl=[0,1].filter(i=>logos[i]&&!(S.logoOff||{})[i]).length;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';
  /* deitado: logos empilhadas à esquerda, texto à direita; em pé: logos empilhadas em cima */
  const LX=land&&nl?W*0.04:0,LW=land&&nl?W*0.36:0,cx=land&&nl?W*0.43+(W*0.57)/2-W*0.02:W/2,tw=land&&nl?W*0.5:W*0.85;
  if(nl){if(land)outroLogos(c,LX,H*0.12,LW,H*0.76,fade(0));else outroLogos(c,W*0.2,H*0.04,W*0.6,H*0.27,fade(0))}
  const t1=d?'PEÇA PELO WHATSAPP':'TE ESPERAMOS NAS NOSSAS LOJAS!';const s1=fitLine(c,t1,tw,land?H*0.1:W*0.1,F);c.save();c.translate(cx,land?H*(nl?0.14:0.18):H*(nl?0.37:0.2));const a=pop(0);c.scale(a,a);c.font=F(s1);c.fillText(t1,0,0);c.restore();
  let yy=land?H*(nl?0.24:0.3):H*(nl?0.42:0.3);
  if(d){const q=land?H*0.36:W*(nl?0.42:0.55);c.globalAlpha=fade(0.3);c.fillStyle='#fff';c.fillRect(cx-q/2,yy,q,q);drawQR(c,'https://wa.me/'+d,cx-q*0.45,yy+q*0.05,q*0.9);
   c.fillStyle='#fff';const s2=land?H*0.07:W*0.08;c.font=F(s2);c.fillText(S.store.wa,cx,yy+q+s2*0.9);yy+=q+s2*1.6;c.globalAlpha=1}
  const ends=(S.store.ends||'').split('\n').map(x=>x.trim()).filter(Boolean);c.globalAlpha=fade(0.7);c.fillStyle='#fff';
  ends.slice(0,4).forEach(e=>{const s3=fitLine(c,e,tw,land?H*0.045:W*0.042,z=>O(z,500));c.font=O(s3,500);c.fillText(e,cx,yy);yy+=s3*1.45});c.globalAlpha=1;
 }else{
  const p=s.p;const hh=H*(land?0.17:0.12);drawHeader(c,W,H,hh,C,cp);
  const m=W*0.035,top=hh+m*1.3;
  if(land){
   const iw=W*0.46,ih=H-top-m*1.2,a=pop(0);
   c.save();c.globalAlpha=fade(0);c.translate(m+iw/2,top+ih/2);c.scale(0.8+0.2*a,0.8+0.2*a);c.translate(-(m+iw/2),-(top+ih/2));
   vidImg(c,p,m+iw*0.04,top+ih*0.04,iw*0.92,ih*0.92);c.restore();
   const cx=m+iw+W*0.045,cw=W-cx-m;let yy=top;
   if(p.phrase){const a2=pop(0.35);c.save();c.globalAlpha=pr(0.35);c.translate(cx,yy);c.scale(a2,a2);drawSticker(c,p.phrase,0,0,cw,H*0.055,C,-0.06);c.restore();yy+=H*0.1}
   const ph=H*(hasApp(p)?0.31:0.26),py=H-m*1.2-ph-H*0.05,oh=H*0.06,oy=py-oh-H*0.02,showL=p.limit>0;
   const dh=(showL?oy:py-H*0.02)-yy;c.save();c.globalAlpha=fade(0.15);c.translate((1-pr(0.15))*W*0.06,0);drawDesc(c,p,cx,yy,cw,dh,null,'left',3,'#ffffff');c.restore();
   if(showL){c.save();c.globalAlpha=fade(0.3);drawLimit(c,p,cx,oy,cw,oh,true);c.restore()}
   const a3=pop(0.45);c.save();c.translate(cx+cw/2,py+ph/2);c.scale(a3,a3);c.translate(-(cx+cw/2),-(py+ph/2));drawPriceBlock(c,p,cx,py,cw,ph,C,'stack',true);c.restore();
   const ft=validText();c.globalAlpha=fade(0.6);c.fillStyle='#fff';c.textAlign='left';c.textBaseline='middle';c.font=O(H*0.032,500);c.fillText(ft,cx,H-m*1.2-H*0.015);c.globalAlpha=1;
  }else{
   const iw=W-m*2,ih=H*0.42,a=pop(0);
   c.save();c.globalAlpha=fade(0);c.translate(W/2,top+ih/2);c.scale(0.8+0.2*a,0.8+0.2*a);c.translate(-W/2,-(top+ih/2));
   vidImg(c,p,m+iw*0.04,top+ih*0.03,iw*0.92,ih*0.94);c.restore();
   if(p.phrase){const a2=pop(0.35);c.save();c.globalAlpha=pr(0.35);c.translate(m*0.6,top-m*0.4);c.scale(a2,a2);drawSticker(c,p.phrase,0,0,W*0.7,W*0.065,C);c.restore()}
   let yy=top+ih+H*0.025;c.save();c.globalAlpha=fade(0.15);drawDesc(c,p,m,yy,W-m*2,H*0.13,null,'center',2,'#ffffff');c.restore();yy+=H*0.135;
   c.save();c.globalAlpha=fade(0.3);drawLimit(c,p,m*2,yy,W-m*4,H*0.04,true);c.restore();yy+=H*0.05;
   const ph=H*0.15,pw=W*0.9,a3=pop(0.45);c.save();c.translate(W/2,yy+ph/2);c.scale(a3,a3);c.translate(-W/2,-(yy+ph/2));drawPriceBlock(c,p,(W-pw)/2,yy,pw,ph,C,'split',true);c.restore();
   c.globalAlpha=fade(0.6);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font=O(W*0.034,500);c.fillText(validText(),W/2,H-m*1.5);c.globalAlpha=1;
  }
 }
 const out=clamp((s.d-lt)/0.3,0,1);if(out<1){c.globalAlpha=1-out;c.fillStyle=C.fundo;c.fillRect(0,0,W,H);c.globalAlpha=1}
 c.restore()}

/* ================= UI: formato, preview ================= */
const ARTE_NOMES=['Frente','Verso','Arte 3','Arte 4'];
const arteNome=(i,pg)=>pg&&pg.extra?'Extra '+(i+1):(ARTE_NOMES[i]||'Arte '+(i+1));
function artesOf(fk){
 let a=S.artes&&S.artes[fk];
 if(!Array.isArray(a)||!a.length){const old=(S.lay&&S.lay[fk])||['auto'];a=old.map(id=>({t:'m',lay:id}))}
 return a.map(c=>c.t==='s'?{t:'s',setores:(c.setores||[]).filter(n=>S.setores.some(s=>s.nome===n)),dest:c.dest!==false}:Object.assign({t:'m',lay:layFits(layById(c.lay),fk)?c.lay:'auto'},layById(c.lay).auto||!layFits(layById(c.lay),fk)?{n:c.n,grow:c.grow}:{}))}
function setArtes(fk,a){S.artes[fk]=a}
function pagesFor(fk){
 const cfg=artesOf(fk),N=S.products,claimed=new Set(),pages=[];
 cfg.forEach(c=>{
  if(c.t==='s'){const its=[];c.setores.forEach(sn=>N.forEach(p=>{if((p.setor||'')===sn&&!claimed.has(p)){its.push(p);claimed.add(p)}}));
   pages.push({cfg:c,items:its,lay:{id:'sec',sec:true,setores:c.setores,dest:c.dest,nome:'Por setores'},cap:its.length})}
  else pages.push({cfg:c,items:null})});
 const rest=N.filter(p=>!claimed.has(p));let i=0;
 const lastMi=pages.reduce((k,pg,j)=>pg.items?k:j,-1);
 const MC=getMod(camp().modelo)?modeloSlots(getMod(camp().modelo)):0;
 pages.forEach((pg,j)=>{if(pg.items)return;const lay=layById(pg.cfg.lay);let cap=MC||(lay.auto?(pg.cfg.n||FORMATS[fk].limit):lay.n);if(!MC&&lay.auto&&pg.cfg.grow&&j===lastMi)cap=Math.max(cap,Math.min(40,rest.length-i));pg.lay=lay;pg.cap=cap;pg.items=rest.slice(i,i+cap);i+=cap});
 const lastM=[...cfg].reverse().find(c=>c.t==='m'),xl=layById(lastM?lastM.lay:'auto'),xc=MC||(xl.auto?FORMATS[fk].limit:xl.n);let guard=0;
 while(i<rest.length&&guard<50){pages.push({cfg:null,extra:true,lay:xl,cap:xc,items:rest.slice(i,i+xc)});i+=xc;guard++}
 return pages}
function pageInfo(){const P=pagesFor(S.format);S.page=clamp(S.page||0,0,P.length-1);return{P,n:P.length}}
const layLabel=pg=>pg.lay.sec?(pg.lay.setores.length?'Setores: '+pg.lay.setores.join(', '):'Por setores (escolher)'):pg.lay.nome;
let lastIssues=[],PREV_HIT=[];
function hitAt(e){const pv=$('#preview'),r=pv.getBoundingClientRect(),x=(e.clientX-r.left)*pv.width/r.width,y=(e.clientY-r.top)*pv.height/r.height;
 for(let i=PREV_HIT.length-1;i>=0;i--){const h=PREV_HIT[i];if(x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)return h.id}
 return null}
function render(){
 const f=FORMATS[S.format],pv=$('#preview');if(pv.width!==f.w)pv.width=f.w;if(pv.height!==f.h)pv.height=f.h;
 const{P,n}=pageInfo(),pg=P[S.page];const iss=[];HIT={cv:pv,list:[]};renderFlyer(pv.getContext('2d'),f.w,f.h,withVagas(pg),camp(),iss,pg.lay);PREV_HIT=HIT.list;HIT=null;lastIssues=iss;
 const th=$('#thumb');th.width=180;th.height=Math.round(180*f.h/f.w);th.getContext('2d').drawImage(pv,0,0,th.width,th.height);
 renderWarns(P,n);renderCmd(n);
 if(inWz()&&WZ===-1)avPrev();
 if(inWz()){const w=$('#wzPrev');if(w){w.width=pv.width;w.height=pv.height;w.getContext('2d').drawImage(pv,0,0)}if(WZ===3&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#wzList')))wzCheck()}}
function renderWarns(P,n){
 const el=$('#warns'),fk=S.format,cfg=artesOf(fk),pg=P[S.page],empty=pg.lay.auto||pg.lay.sec?0:Math.max(0,pg.cap-pg.items.length);
 let h=`<div class="laybar"><div class="seg2" id="nArtes" data-dono>${[1,2,3,4].map(k=>`<button data-k="${k}" class="${cfg.length===k?'on':''}">${k===1?'Só frente':k===2?'Frente e verso':k+' artes'}</button>`).join('')}</div>
 <button class="btn sm pri" id="pickLay" data-dono>Montar diagramação</button>
 <label class="vd" style="margin-left:auto">Validade <input type="date" id="lbIni" value="${S.val.ini||''}"> a <input type="date" id="lbFim" value="${S.val.fim||''}"></label>
 ${pg.lay.sec?'':`<div class="vd">Produtos nesta arte <button class="ico" id="stM" style="width:26px">−</button><b style="min-width:22px;text-align:center">${pg.items.length}</b><button class="ico" id="stP" style="width:26px">+</button>${pg.cfg&&pg.cfg.grow?'<small style="color:#1b7a34">cresce sozinho</small>':''}</div>`}
 <div class="chipsA" style="flex-basis:100%">${P.map((p,i)=>`<button class="artChip ${i===S.page?'on':''}" data-i="${i}" title="Toque de novo para trocar a diagramação"><canvas></canvas><span><small>${arteNome(i,p)}</small><b>${esc(layLabel(p))}</b><i>${p.items.length}${p.lay.sec||p.lay.auto?'':' de '+p.cap} itens</i></span></button>`).join('')}</div></div>`;
 const extras=P.filter(p=>p.extra);
 if(extras.length)h+=`<div class="warn">⚠ ${extras.reduce((a,p)=>a+p.items.length,0)} produtos não couberam nas artes escolhidas, então criei ${extras.length>1?extras.length+' artes extras':'uma arte extra'}. Escolha uma diagramação maior ou mais artes.</div>`;
 if(empty)h+=`<div class="warn">${arteNome(S.page,pg)} tem ${empty} ${empty>1?'espaços vazios':'espaço vazio'}: adicione produtos ou escolha uma diagramação menor.</div>`;
 const iss=collectIssues(S.products);
 if(iss.length)h+=`<div class="warn r" id="showIss">● ${iss.length} ${iss.length>1?'pontos para revisar':'ponto para revisar'} antes de baixar <u>ver</u></div>`;
 el.innerHTML=h;
 el.querySelectorAll('#nArtes button').forEach(b=>b.onclick=()=>{const k=+b.dataset.k;let a=artesOf(fk).slice(0,k);while(a.length<k)a.push({t:'m',lay:'auto'});setArtes(fk,a);S.page=Math.min(S.page,k-1);changed();if(k>1)openLayPicker(Math.min(k-1,1))});
 el.querySelectorAll('.artChip').forEach(b=>{const i=+b.dataset.i;drawCroqui(b.querySelector('canvas'),P[i].lay,fk,30,36,P[i].items);b.onclick=()=>{if(S.page===i){openLayPicker(i)}else{S.page=i;changed()}}});
 $('#pickLay').onclick=()=>openLayPicker(S.page);const sm=$('#stM'),sp=$('#stP');if(sm)sm.onclick=()=>stepArte(-1);if(sp)sp.onclick=()=>stepArte(1);renderSugs(P);
 $('#lbIni').onchange=e=>{S.val.ini=e.target.value;if(S.val.fim&&S.val.fim<S.val.ini)S.val.fim=S.val.ini;$('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim;changed(false)};
 $('#lbFim').onchange=e=>{S.val.fim=e.target.value;$('#vFim').value=S.val.fim;changed(false)};
 const si=$('#showIss');if(si)si.onclick=()=>reviewGate(S.products,true)}
function collectIssues(items){
 const o=[];
 items.forEach(p=>{const nm=p.desc||'(sem nome)',m=margem(p);if(m!=null&&m<0)o.unshift(`⛔ ABAIXO DO CUSTO: ${nm} (preço ${brl(effPrice(p))}${hasApp(p)?' no app':''}, custo ${brl(p.cost)})`);else if(m!=null&&m<margMin())o.unshift(`⚠ Margem baixa ${(m*100).toFixed(1).replace('.',',')}%: ${nm} (custo ${brl(p.cost)})`);if(!getImg(p))o.push(`Sem foto: ${nm}`);if(p.price==null)o.push(`Sem preço: ${nm}`);if(p.app!=null&&p.price!=null&&p.app>p.price)o.push(`Preço com app maior que o preço sem app: ${nm}`)});
 if(!S.val.ini&&!S.val.fim)o.push('Validade da oferta não preenchida');
 if(!logos[0]&&!logos[1])o.push('Logomarcas não enviadas (aba Loja)');
 if(!waDigits())o.push('WhatsApp não preenchido: o encarte sai sem QR Code (aba Loja)');
 lastIssues.forEach(x=>{if(!o.includes(x))o.push(x)});
 return o}
function reviewGate(items,viewOnly=false){
 return new Promise(res=>{
  const iss=collectIssues(items);if(!iss.length&&!viewOnly)return res(true);
  const PP=pagesFor(S.format);
  modal(`<h3>Revisão antes de baixar</h3><div class="revG"><div class="revP">${PP.map((q,i)=>`<div><small>${PP.length>1?esc(arteNome(i,q)):'Prévia'}</small><canvas data-p="${i}"></canvas></div>`).join('')}</div>
  <div class="revI">${iss.length?`<p class="hint">Confira estes pontos. Dá para baixar assim, mas o ideal é corrigir:</p><ul class="issues">${iss.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:'<p>Tudo certo!</p>'}</div></div>
  <div class="mfoot">${viewOnly?'<button class="btn pri" data-a="no">Entendi</button>':'<button class="btn" data-a="no">Voltar e corrigir</button><button class="btn pri" data-a="ok">Baixar mesmo assim</button>'}</div>`,b=>{b.classList.add('wide');
   const f=FORMATS[S.format];b.querySelectorAll('canvas[data-p]').forEach((cv,i)=>{const big=document.createElement('canvas');big.width=f.w;big.height=f.h;renderFlyer(big.getContext('2d'),f.w,f.h,PP[i].items,camp(),[],PP[i].lay);const k=Math.min(1,900/f.w);cv.width=Math.round(f.w*k);cv.height=Math.round(f.h*k);cv.getContext('2d').drawImage(big,0,0,cv.width,cv.height)});
   b.querySelector('[data-a=no]').onclick=()=>{closeModal();res(false);if(!viewOnly&&inWz()&&WZ===4)wzGo(3)};const ok=b.querySelector('[data-a=ok]');
   const lock=isFunc()&&iss.some(x=>/^(⛔|⚠ Margem)/.test(x));if(ok&&lock)ok.textContent='Liberar com a senha do dono';
   if(ok)ok.onclick=()=>{closeModal();if(lock)askPin('Produto abaixo da margem',()=>res(true));else res(true)}})})}

const LAY_GROUPS=[['Ofertas diárias',' 1 a 5 produtos',l=>!l.list&&l.n<=5],['Encarte',' 6 a 12 produtos',l=>!l.list&&l.n>=6&&l.n<=12],['Tabloide grande',' 13 ou mais',l=>!l.list&&l.n>=13],['Listão de preços',' muitos itens, foto pequena',l=>!!l.list]];
let pickOpen=0;
function openLayPicker(i=S.page){if(isFunc()){toast('Diagramação travada no modo funcionário');return}pickOpen=i;renderPicker(true)}
function secCount(nome){return S.products.filter(p=>(p.setor||'')===nome).length}
function renderPicker(first){
 const fk=S.format,lim=FORMATS[fk].limit,P=pagesFor(fk),cfg=artesOf(fk);
 const mb=$('#modal'),keep=first?0:mb.scrollTop;
 const card=(l,cur)=>`<button class="layOpt ${l.id===cur?'on':''}" data-id="${l.id}"><canvas></canvas><b>${esc(l.nome)}${!l.auto&&!l.list&&l.n>lim*1.5?'<span class="tg">fica pequeno</span>':''}</b><small>${l.auto?'':l.n+' itens • '}${esc(l.d)}</small></button>`;
 const bodyM=(c,i)=>{const opts=LAYOUTS.filter(l=>!l.auto&&layFits(l,fk));
  return `<div class="layGrid">${card(LAYOUTS[0],c.lay)}</div>`+LAY_GROUPS.map(([t,sub,f])=>{const ls=opts.filter(f).sort((x,y)=>x.n-y.n);if(!ls.length)return'';const has=ls.some(l=>l.id===c.lay);
   return `<details class="sec" ${has?'open':''}><summary>${t}<small>${sub} • ${ls.length} modelos</small></summary><div class="in"><div class="layGrid">${ls.map(l=>card(l,c.lay)).join('')}</div></div></details>`}).join('')};
 const bodyS=(c,i)=>{const chosen=c.setores,rest=S.setores.filter(s=>!chosen.includes(s.nome));
  const row=(nome,on,k)=>{const s=S.setores.find(x=>x.nome===nome),n=secCount(nome);return `<div class="secRow ${on?'on':''}"><input type="checkbox" data-sec="${esc(nome)}" ${on?'checked':''}><i class="dot" style="background:${s.cor}"></i><span>${esc(nome)} <small>• ${n} ${n===1?'produto':'produtos'}</small></span>${on?`<button class="ico" data-up="${k}">▲</button><button class="ico" data-dn="${k}">▼</button>`:''}</div>`};
  return `<label class="chk2"><input type="checkbox" id="pkDest" ${c.dest?'checked':''}> Destaques em cima (produtos marcados como destaque desses setores)</label>
  <p class="hint">Marque os setores desta arte, na ordem em que aparecem. Cada setor ganha uma faixa com o nome. O setor de cada produto você escolhe ao editar o produto.</p>
  ${chosen.map((n,k)=>row(n,true,k)).join('')}${rest.map(s=>row(s.nome,false)).join('')}
  ${S.products.some(p=>!p.setor)?`<p class="hint">${S.products.filter(p=>!p.setor).length} produtos estão sem setor: eles vão para as artes de modelo de grade.</p>`:''}`};
 const acc=(c,i)=>{const pg=P[i],open=i===pickOpen;
  return `<div class="acc ${open?'open':''}"><button class="accH" data-i="${i}"><canvas></canvas><span><small>${arteNome(i)}</small><b>${esc(layLabel(pg))}</b><i>${pg.items.length} itens</i></span><em>${open?'▴':'▾'}</em></button>
  ${open?`<div class="accB"><div class="seg2" style="margin-bottom:12px"><button data-t="m" data-i="${i}" class="${c.t==='m'?'on':''}">Modelo de grade</button><button data-t="s" data-i="${i}" class="${c.t==='s'?'on':''}">Dividido por setores</button></div>${c.t==='m'?bodyM(c,i):bodyS(c,i)}</div>`:''}</div>`};
 modal(`<h3>Montar encarte • ${FORMATS[fk].label}</h3>
 <div class="seg2" id="pkN" style="margin-bottom:8px">${[1,2,3,4].map(k=>`<button data-k="${k}" class="${cfg.length===k?'on':''}">${k===1?'Só frente':k===2?'Frente e verso':k+' artes'}</button>`).join('')}</div>
 <p class="hint">Toque numa arte para abrir. Cada arte pode ser um modelo de grade ou dividida por setores. Ex.: frente variada com "3 fortes + 8" e verso só de Açougue.</p>
 ${cfg.map(acc).join('')}${P.length>cfg.length?`<p class="hint">+ ${P.length-cfg.length} arte(s) extra criadas porque sobraram produtos.</p>`:''}
 <div class="mfoot"><button class="btn pri" data-a="x">Pronto</button></div>`,b=>{
  b.classList.add('wide');mb.scrollTop=keep;
  const save=a=>{setArtes(fk,a);changed();renderPicker()};
  b.querySelectorAll('.accH').forEach(h=>{const i=+h.dataset.i;drawCroqui(h.querySelector('canvas'),P[i].lay,fk,34,42,P[i].items);h.onclick=()=>{pickOpen=pickOpen===i?-1:i;S.page=i;changed();renderPicker()}});
  b.querySelectorAll('#pkN button').forEach(x=>x.onclick=()=>{const k=+x.dataset.k;let a=cfg.slice(0,k);while(a.length<k)a.push({t:'m',lay:'auto'});pickOpen=Math.min(k-1,pickOpen<0?0:pickOpen);if(k>cfg.length)pickOpen=cfg.length;save(a)});
  b.querySelectorAll('[data-t]').forEach(x=>x.onclick=()=>{const i=+x.dataset.i,a=cfg.slice();if(x.dataset.t==='m')a[i]={t:'m',lay:'auto'};else{const used=new Set(cfg.flatMap(c=>c.t==='s'?c.setores:[]));a[i]={t:'s',dest:true,setores:S.setores.filter(s=>secCount(s.nome)&&!used.has(s.nome)).map(s=>s.nome)}}save(a)});
  const i=pickOpen,c=cfg[i];if(i<0||!c){b.querySelector('[data-a=x]').onclick=closeModal;return}
  b.querySelectorAll('.layOpt').forEach(el=>{drawCroqui(el.querySelector('canvas'),layById(el.dataset.id),fk);el.onclick=()=>{const a=cfg.slice();a[i]={t:'m',lay:el.dataset.id};toast(`${arteNome(i)}: ${layById(el.dataset.id).nome}`);if(i+1<a.length)pickOpen=i+1;save(a)}});
  b.querySelectorAll('[data-sec]').forEach(x=>x.onchange=()=>{const a=cfg.slice(),s=a[i].setores.slice(),n=x.dataset.sec;if(x.checked){if(!s.includes(n))s.push(n)}else s.splice(s.indexOf(n),1);a[i]={...a[i],setores:s};save(a)});
  b.querySelectorAll('[data-up],[data-dn]').forEach(x=>x.onclick=()=>{const a=cfg.slice(),s=a[i].setores.slice(),k=+(x.dataset.up??x.dataset.dn),j=x.dataset.up!=null?k-1:k+1;if(j<0||j>=s.length)return;[s[k],s[j]]=[s[j],s[k]];a[i]={...a[i],setores:s};save(a)});
  const d=$('#pkDest');if(d)d.onchange=()=>{const a=cfg.slice();a[i]={...a[i],dest:d.checked};save(a)};
  b.querySelector('[data-a=x]').onclick=closeModal})}
function renderFormats(){const el=$('#formats');el.innerHTML=Object.entries(FORMATS).map(([k,f])=>`<button data-f="${k}" class="${S.format===k?'on':''}">${f.label}</button>`).join('');
 el.querySelectorAll('button').forEach(b=>b.onclick=()=>{S.format=b.dataset.f;S.page=0;renderFormats();renderArt();changed()})}

/* ================= UI: produtos ================= */
let pickTarget=null;
$('#fileIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||!pickTarget)return;const t=pickTarget;pickTarget=null;if(t.art){await setArt(f)}else if(t.logo!=null){await setLogo(t.logo,f)}else{await setImageFromFile(t,f);if(fillAfterFile){const f=fillAfterFile;fillAfterFile=null;f()}else if(!$('#modal').hidden&&editingId===t.id)openEditor(t.id)}};
function pickFor(t){pickTarget=t;if(t.logo!=null||t.art){$('#fileIn').click();return}openPhotoSource(t)}
let photoFor=null,photoBack=null;
const gImg=q=>'https://www.google.com/search?tbm=isch&q='+encodeURIComponent(q);
function openPhotoSource(p){
 photoBack=editingId;photoFor=p;const q=((p.desc||'')+' png fundo branco').trim();
 const sg=photoSugs(p,5);
 modal(`<h3>Foto do produto</h3><p class="hint" style="margin-top:-6px">${esc(p.desc||'(sem descrição)')}</p>
 <div class="wzSug"><small>${sg.length?'Fotos parecidas que você já usou, toque para escolher:':'Ainda não há foto parecida no seu banco. Cada foto que você colocar fica guardada e aparece aqui nas próximas vezes.'}</small><div>${sg.map(k=>`<button class="sg" data-k="${esc(k)}" style="background-image:url('${imgCache.get(k).url}')"></button>`).join('')}</div></div>
 <div class="row2"><button class="btn bigc" data-a="pc"><b>💻</b>Do computador ou celular</button><button class="btn bigc" data-a="web"><b>🌐</b>Buscar na web</button></div>
 <div id="webBox" hidden style="margin-top:14px">
  <label>Buscar por<input id="wq" value="${esc(q)}"></label>
  <a class="btn pri" id="wGo" href="${gImg(q)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">Abrir Google Imagens ↗</a>
  <ol class="hint" style="padding-left:18px;margin:10px 0">
   <li>No Google, clique com o botão direito na foto escolhida e toque em <b>Copiar imagem</b> (no celular: segure o dedo na foto → Copiar imagem).</li>
   <li>Volte aqui e cole no quadro abaixo: <b>Ctrl+V</b> (no celular: segure o dedo no quadro → Colar).</li></ol>
  <textarea id="pasteZone" class="pasteZone" placeholder="Cole a imagem aqui (Ctrl+V)"></textarea>
  <label class="chk2"><input type="checkbox" id="wWhite" checked> Tirar o fundo branco automaticamente</label>
  <p class="hint">Dica: buscando com "png fundo branco", a maioria das fotos já vem com fundo limpo. Fundo colorido ou foto de gôndola o app não consegue limpar.</p>
 </div>
 <div class="mfoot"><button class="btn" data-a="x">Voltar</button></div>`,b=>{
  const back=()=>{photoFor=null;if(photoBack)openEditor(photoBack);else closeModal()};
  b.querySelector('[data-a=x]').onclick=back;
  b.querySelectorAll('.wzSug .sg').forEach(x=>x.onclick=()=>{p.imgAlias=x.dataset.k;p.autoFoto=false;delete p.noAuto;rememberPhoto(p);changed();toast('Foto aplicada');back();if(inWz())wzCheck()});
  b.querySelector('[data-a=pc]').onclick=()=>{pickTarget=p;$('#fileIn').click();back()};
  b.querySelector('[data-a=web]').onclick=()=>{$('#webBox').hidden=false;$('#pasteZone').focus()};
  $('#wq').oninput=()=>{$('#wGo').href=gImg($('#wq').value)};
  const pz=$('#pasteZone');pz.ondragover=e=>e.preventDefault();
  pz.ondrop=e=>{e.preventDefault();const f=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(f)usePasted(f);else toast('Arrastar da internet não funciona aqui. Use Copiar imagem e cole.',4000)};
  pz.oninput=()=>{if(pz.value.trim()){pz.value='';toast('Veio só o endereço. No Google use "Copiar imagem", não "Copiar endereço".',4500)}}})}
async function usePasted(file,p=photoFor,white,onDone){
 if(!p)return;const w=white??($('#wWhite')?$('#wWhite').checked:false);toast(w?'Encaixando a foto e tirando o fundo…':'Encaixando a foto…',2000);
 try{await setImage(p,await processImage(await fileToURL(file),w));toast('Foto aplicada');const nx=onDone||FILL_NEXT,bk=photoBack;photoFor=null;if(nx){nx();return}if(!$('#modal').hidden){if(bk)openEditor(bk);else closeModal()}}catch(e){toast('Não consegui usar essa imagem')}}
document.addEventListener('paste',e=>{
 const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(i=>i.type&&i.type.startsWith('image/'));
 const p=photoFor||(editingId&&S.products.find(x=>x.id===editingId));
 /* Ctrl+V de uma lista (Excel, WhatsApp, bloco de notas) em qualquer lugar da tela: abre a digitação já preenchida */
 if(!p&&!it){const t=(e.clipboardData&&e.clipboardData.getData('text')||'').trim(),tg=e.target;if(t&&$('#modal').hidden&&!(tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.isContentEditable))&&parseQuick(t).length){e.preventDefault();openQuick(t)}return}
 if(!p)return;if(!it){if(photoFor&&!(e.clipboardData.getData('text')||'').trim())toast('Não veio imagem. No Google use "Copiar imagem".');return}
 e.preventDefault();if(!photoFor)photoBack=editingId;usePasted(it.getAsFile(),p,photoFor?undefined:false)});
const FULLV=()=>S.listMode==='f';
function inlEd(p){const us=[...new Set([...UNITS,p.unit])];return`<div class="inl">
 <input class="ds" data-k="desc" value="${esc(p.desc)}" placeholder="Descrição com marca e peso">
 <label>${p.appOn?'Sem app':'Preço'}<input data-k="price" inputmode="decimal" value="${moneyIn(p.price)}" placeholder="0,00"></label>
 ${p.appOn?`<label>Com app<input data-k="app" inputmode="decimal" value="${moneyIn(p.app)}" placeholder="0,00"></label>`:`<label class="apb"><input type="checkbox" data-k="appOn" style="width:15px;height:15px"> preço app</label>`}
 <label>Unidade<select data-k="unit">${us.map(u=>`<option ${u===p.unit?'selected':''}>${esc(u)}</option>`).join('')}</select></label>
 <label>Limite<input data-k="limit" type="number" min="0" value="${p.limit||''}" placeholder="—"></label></div>`}
function bindInl(row,p){const box=row.querySelector('.inl');['click','pointerdown','dragstart'].forEach(ev=>box.addEventListener(ev,e=>e.stopPropagation()));
 box.querySelectorAll('[data-k]').forEach(inp=>{const k=inp.dataset.k,ev=inp.tagName==='SELECT'||inp.type==='checkbox'?'change':'input';
  inp.addEventListener(ev,()=>{if(k==='price'||k==='app')p[k]=parseMoney(inp.value);else if(k==='limit')p.limit=Math.max(0,parseInt(inp.value)||0);else if(k==='appOn'){p.appOn=inp.checked;changed();return}else p[k]=k==='desc'?inp.value:inp.value;
   if(k==='unit'){changed();return}changed(false)});
  if(k==='desc')inp.addEventListener('change',()=>changed())})}
function renderList(){
 document.querySelectorAll('#lvMode button').forEach(b=>b.classList.toggle('on',(b.dataset.v==='f')===FULLV()));
 const el=$('#plist');const{P,n}=pageInfo();const mf=missingPhotos().length,fb=$('#fillP');if(fb)fb.textContent=mf?`Completar fotos (${mf})`:'Completar fotos ✓';const pgMap=new Map();P.forEach((q,k)=>q.items.forEach(x=>pgMap.set(x,k)));
 if(!S.products.length){el.innerHTML='<div class="empty">Nenhum produto. Toque em "+ Produto" ou cole sua lista do Excel.</div>';return}
 el.innerHTML='';
 S.products.forEach((p,i)=>{
  const row=document.createElement('div');row.className='prod';const ent=imgCache.get(imgKey(p));
  if(FULLV())row.classList.add('full');const pk=pgMap.get(p),pg=n>1&&pk!=null?`<span class="flag g">${arteNome(pk,P[pk]).toUpperCase()}</span>`:'';
  row.innerHTML=`<span class="grip" title="Arraste para mudar a ordem">⠿</span><input type="checkbox" ${p.sel?'checked':''} title="Selecionar para plaquinhas"><div class="th ${ent?'has':''}">${ent?'':'+ foto'}</div>
  <div><div class="d">${esc(p.desc||'(sem descrição)')}${p.featured?'<span class="flag">ÍCONE</span>':p.papel==='destaque'?'<span class="flag">DESTAQUE</span>':p.papel==='complemento'?'<span class="flag g">COMPLEMENTO</span>':''}${p.venc?'<span class="flag r">VENC. PRÓX.</span>':''}${!ent?'<span class="flag r">SEM FOTO</span>':p.autoFoto?'<span class="flag g" title="Foto reaproveitada de um produto com o mesmo nome">FOTO AUTOMÁTICA</span>':''}${margFlag(p)}${pg}</div>
  <div class="m">${p.setor?`<span class="dot" style="display:inline-block;width:9px;height:9px;vertical-align:0;background:${secColor(p.setor)}"></span> ${esc(p.setor)} • `:''}${p.code?'#'+esc(p.code)+' • ':''}${esc(p.unit)}${p.phrase?' • '+esc(p.phrase):''}${p.limit>0?' • limite '+p.limit:''}</div></div>
  <div class="p">${hasApp(p)?`<s style="text-decoration:none">sem app ${brl(p.price)}</s>${brl(p.app)} <small style="font:600 10px Inter;color:#b3121b">APP</small>`:(p.price!=null?brl(p.price):'—')}</div>
  <div class="ops"><button class="ico" data-a="up" title="Subir">▲</button><button class="ico" data-a="dn" title="Descer">▼</button></div><button class="ico delx" data-a="rm" title="Excluir produto">✕</button>${FULLV()?inlEd(p):''}`;
  if(ent)row.querySelector('.th').style.backgroundImage=`url("${ent.url}")`;
  if(FULLV())bindInl(row,p);
  row.querySelector('input').onclick=e=>{e.stopPropagation();p.sel=e.target.checked;persist()};
  row.querySelector('.th').onclick=e=>{e.stopPropagation();pickFor(p)};
  row.querySelector('[data-a=rm]').onclick=e=>{e.stopPropagation();confirmDel(p)};
  row.querySelector('[data-a=up]').onclick=e=>{e.stopPropagation();if(i>0){[S.products[i-1],S.products[i]]=[S.products[i],S.products[i-1]];changed()}};
  row.querySelector('[data-a=dn]').onclick=e=>{e.stopPropagation();if(i<S.products.length-1){[S.products[i+1],S.products[i]]=[S.products[i],S.products[i+1]];changed()}};
  row.onclick=()=>{if(dragSuppress)return;openEditor(p.id)};
  row.addEventListener('pointerdown',e=>dragDown(e,row,i));
  row.ondragover=e=>{e.preventDefault();row.classList.add('drop')};row.ondragleave=()=>row.classList.remove('drop');
  row.ondrop=e=>{e.preventDefault();row.classList.remove('drop');const f=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(f)setImageFromFile(p,f)};
  el.appendChild(row)})}

/* ---- arrastar para reordenar ---- */
let drag=null,pend=null,dragSuppress=false;
function dragDown(e,row,i){
 if(e.button!==0||drag)return;if(e.target.closest('input,button,.th,select'))return;
 const handle=!!e.target.closest('.grip');pend={x:e.clientX,y:e.clientY,row,i,handle,touch:e.pointerType==='touch'};
 if(handle){e.preventDefault();beginDrag()}
 else if(pend.touch)pend.t=setTimeout(()=>{if(pend)beginDrag()},320)}
function beginDrag(){
 const{row,i,y}=pend;clearTimeout(pend.t);pend=null;const r=row.getBoundingClientRect(),ph=document.createElement('div');
 ph.className='prodPh';ph.style.height=r.height+'px';row.parentNode.insertBefore(ph,row);row.classList.add('dragging');
 Object.assign(row.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',zIndex:50,pointerEvents:'none',margin:0});
 drag={row,ph,i,offY:y-r.top,y};document.body.classList.add('noselect');try{navigator.vibrate&&navigator.vibrate(15)}catch(_){}
 requestAnimationFrame(dragScroll)}
function dragMove(y){
 drag.y=y;drag.row.style.top=(y-drag.offY)+'px';const list=$('#plist');let before=null;
 for(const el of list.children){if(el===drag.row||el===drag.ph)continue;const r=el.getBoundingClientRect();if(y<r.top+r.height/2){before=el;break}}
 if(before)list.insertBefore(drag.ph,before);else list.appendChild(drag.ph)}
function dragEnd(cancel){
 const list=$('#plist'),kids=[...list.children].filter(el=>el!==drag.row),to=kids.indexOf(drag.ph),from=drag.i;
 drag=null;document.body.classList.remove('noselect');dragSuppress=true;setTimeout(()=>dragSuppress=false,80);
 if(!cancel&&to>=0&&to!==from){const[it]=S.products.splice(from,1);S.products.splice(to,0,it);changed()}else renderList()}
function dragScroller(){const p=document.querySelector('.panel');return p.scrollHeight>p.clientHeight+2&&getComputedStyle(p).position==='sticky'?p:null}
function dragScroll(){
 if(!drag)return;const sc=dragScroller(),r=sc?sc.getBoundingClientRect():{top:0,bottom:innerHeight},z=70,y=drag.y;let dy=0;
 if(y<r.top+z)dy=-Math.ceil((r.top+z-y)/5);else if(y>r.bottom-z)dy=Math.ceil((y-(r.bottom-z))/5);
 if(dy){if(sc)sc.scrollTop+=dy;else scrollBy(0,dy);dragMove(y)}requestAnimationFrame(dragScroll)}
document.addEventListener('pointermove',e=>{
 if(drag){e.preventDefault();dragMove(e.clientY);return}
 if(!pend)return;const d=Math.hypot(e.clientX-pend.x,e.clientY-pend.y);
 if(pend.touch){if(d>10){clearTimeout(pend.t);pend=null}}else if(d>6){pend.y=e.clientY;beginDrag()}},{passive:false});
document.addEventListener('pointerup',()=>{if(pend){clearTimeout(pend.t);pend=null}if(drag)dragEnd(false)});
document.addEventListener('pointercancel',()=>{if(pend){clearTimeout(pend.t);pend=null}if(drag)dragEnd(true)});
document.addEventListener('touchmove',e=>{if(drag)e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>{if(drag||pend)e.preventDefault()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag)dragEnd(true)});

function confirmDel(p,fromEditor){
 modal(`<h3>Excluir produto?</h3><p>Tem certeza que quer excluir <b>${esc(p.desc||'este produto')}</b>${p.price!=null?' ('+brl(p.price)+')':''} da lista?</p>
 <div class="mfoot"><button class="btn" data-a="n">Não</button><button class="btn pri" data-a="y">Sim, excluir</button></div>`,b=>{
  b.querySelector('[data-a=n]').onclick=()=>{if(fromEditor)openEditor(p.id);else closeModal()};
  b.querySelector('[data-a=y]').onclick=()=>{S.products=S.products.filter(x=>x!==p);closeModal();changed();toast('Produto excluído')};
  setTimeout(()=>b.querySelector('[data-a=n]').focus(),30)})}
let editingId=null;
let EDTAB='p';
function openEditor(id){
 const p=S.products.find(x=>x.id===id);if(!p)return;editingId=id;const ent=imgCache.get(imgKey(p));
 const phr=[...new Set([...S.phrases,p.phrase].filter(Boolean))];
 const T=EDTAB||'p',tab=(k,t)=>`<button data-tab="${k}" class="${T===k?'on':''}">${t}</button>`;
 modal(`<h3>Editar produto</h3>
 <div class="seg2 edTabs">${tab('p','Produto e preço')}${tab('v','Visual')}${tab('f','Foto e posição')}</div>
 <div class="edG" data-g="p" ${T==='p'?'':'hidden'}>
 <div class="edimg"><div class="th ${ent?'has':''}" data-a="foto">${ent?'':'Toque para<br>enviar foto'}</div>
  <div class="col" style="flex:1"><label style="margin:0">Nome no encarte<input name="desc" value="${esc(p.desc)}" placeholder="Marca, produto e peso"></label></div></div>
 <div class="seg2" id="appTg" style="margin:4px 0 10px"><button data-v="0" class="${p.appOn?'':'on'}">Preço único</button><button data-v="1" class="${p.appOn?'on':''}">Sem app × Com app</button></div>
 <div class="row2"><label>${p.appOn?'Preço sem app':'Preço'} (R$)<input name="price" inputmode="decimal" value="${moneyIn(p.price)}" placeholder="0,00"></label>
  ${p.appOn?`<label>Preço com app (R$)<input name="app" inputmode="decimal" value="${moneyIn(p.app)}" placeholder="0,00"></label>`:`<label>Limite por cliente<input name="limit" type="number" min="0" value="${p.limit||''}" placeholder="sem limite"></label>`}</div>
 ${p.appOn?`<label>Limite (unidades no preço do app)<input name="limit" type="number" min="0" value="${p.limit||''}" placeholder="sem limite"></label>`:''}
 <div class="secRow" style="flex-wrap:wrap;background:#f6f4ef">${p.cost!=null||p.sysPrice!=null?`<span style="font-weight:500">${p.sysPrice!=null?`Sistema <b>${brl(p.sysPrice)}</b> • `:''}${p.cost!=null?`Custo <b>${brl(p.cost)}</b> • `:''}<span id="edMarg">${margFlag(p)||'margem —'}</span></span>`:'<span style="font-weight:500">Sem ligação com o StarIA</span>'}<button class="btn sm dark" data-a="star">${p.code&&/^\d+$/.test(p.code)?'Atualizar':'Buscar no StarIA'}</button></div>
 <details class="edMore"><summary>Mais dados: código, unidade, setor</summary>
 <div class="row2"><label>Código<input name="code" value="${esc(p.code)}" placeholder="opcional"></label>
  <label>Unidade<select name="unit">${[...new Set([...UNITS,p.unit])].map(u=>`<option ${u===p.unit?'selected':''}>${esc(u)}</option>`).join('')}</select></label></div>
 <label>Setor<select name="setor"><option value="">Sem setor</option>${S.setores.map(x=>`<option ${x.nome===p.setor?'selected':''}>${esc(x.nome)}</option>`).join('')}<option value="__novo">+ Novo setor…</option></select></label>
 <div class="bar" id="novoSet" hidden><input id="novoSetN" placeholder="Nome do setor" style="margin:0;flex:1"><button class="btn sm pri" id="novoSetOk">Criar</button></div>
 ${packOf(p)?`<label class="chk2"><input type="checkbox" name="precoKg" ${p.precoKg?'checked':''}> Mostrar preço por ${packOf(p).u==='L'?'litro':'kg'} <small style="color:var(--mut);font-weight:500">(${esc(unitPriceText(p,true,true)||'')})</small></label>`:''}
 </details></div>
 <div class="edG" data-g="v" ${T==='v'?'':'hidden'}>
 <div class="row2"><label>Tamanho no encarte<select name="papel">${[['','Automático'],['icone','Gigante (destaque principal)'],['destaque','Médio'],['complemento','Pequeno']].map(([v,t])=>`<option value="${v}" ${(p.featured?'icone':(p.papel||''))===v?'selected':''}>${t}</option>`).join('')}</select></label>
 <label>Frase de impacto<select name="phrase"><option value="">Nenhuma</option>${phr.map(f=>`<option ${f===p.phrase?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>
 <div class="row2"><label>Cor do preço <small style="color:var(--mut);font-weight:500">(só deste)</small><span style="display:flex;gap:6px;align-items:center"><input type="color" name="precoCor" value="${p.precoCor||camp().cores.preco}" style="width:56px;margin:0">${p.precoCor?'<button class="btn sm" type="button" data-a="corRs">Voltar ao padrão</button>':''}</span></label>
 ${p.featured?`<label>Fundo do destaque<select name="destFundo"><option value="">Igual à campanha</option>${DEST_FUNDOS.map(([v,t])=>`<option value="${v}" ${p.destFundo===v?'selected':''}>${t}</option>`).join('')}</select></label>`:'<span></span>'}</div>
 <label class="chk2"><input type="checkbox" name="venc" ${p.venc?'checked':''}> Vencimento próximo (selo laranja)</label>
 <div class="szR" id="edSz"></div>
 <button class="btn sm dark" type="button" data-a="cores" style="margin-top:8px">🎨 Cores do encarte todo</button>
 </div>
 <div class="edG" data-g="f" ${T==='f'?'':'hidden'}>
 <div class="bar" style="margin-bottom:8px"><button class="btn sm" data-a="foto">${ent?'Trocar foto':'Enviar foto'}</button>${ent?'<button class="btn sm" data-a="fundo">Tirar fundo branco</button><button class="btn sm" data-a="rmfoto">Remover foto</button>':''}</div>
 ${ent?`<div class="row2"><label>Zoom<input type="range" name="zoom" min="60" max="160" value="${Math.round((p.zoom||1)*100)}"></label>
 <label>Repetir o produto<select name="multi">${[['auto','Automático'],['1','Só 1'],['2','2 lado a lado'],['3','3 (frente e dois atrás)'],['5','5 (prateleira cheia)']].map(([v,t])=>`<option value="${v}" ${String(p.multi||'auto')===v?'selected':''}>${t}</option>`).join('')}</select></label></div>
 <div class="row2"><label>Esquerda / direita<input type="range" name="dx" min="-40" max="40" value="${Math.round((p.dx||0)*100)}"></label>
 <label>Subir / descer<input type="range" name="dy" min="-50" max="50" value="${Math.round((p.dy||0)*100)}"></label></div>
 <label class="chk2"><input type="checkbox" name="prOver" ${p.prOver?'checked':''}> Preço por cima da foto</label>
 <button class="btn sm" type="button" data-mv="c">Voltar a foto ao centro</button>`:'<p class="hint">Envie a foto para ajustar posição e tamanho.</p>'}
 </div>
 <div class="mfoot"><button class="btn l" data-a="del">Excluir produto</button><button class="btn" data-a="dupl">Duplicar</button><button class="btn pri" data-a="ok">Pronto</button></div>`,b=>{
  const sz=()=>{const e=$('#edSz');if(!e)return;e.innerHTML=`<span>Letra do nome</span><button data-sz="desc-">A−</button><b>${Math.round((p.descK||1)*100)}%</b><button data-sz="desc+">A+</button><span style="margin-left:10px">Posição do nome</span><button data-sz="nup" title="Subir o nome">↑</button><button data-sz="ndn" title="Descer o nome">↓</button><span style="margin-left:14px">Frase</span><button data-sz="ph-">A−</button><b>${Math.round((p.phK||1)*100)}%</b><button data-sz="ph+">A+</button>${p.phX!=null?'<button data-sz="phR">frase na posição original</button>':''}<small style="flex-basis:100%;font-weight:500">Para mudar a frase de lugar, arraste ela no encarte.</small>`;
   e.querySelectorAll('[data-sz]').forEach(bt=>bt.onclick=()=>{const v=bt.dataset.sz;NMV(p,v);if(v==='desc+')p.descK=Math.min(1.8,(p.descK||1)+0.15);if(v==='desc-')p.descK=Math.max(0.7,(p.descK||1)-0.15);if(v==='ph+')p.phK=Math.min(2.2,(p.phK||1)+0.15);if(v==='ph-')p.phK=Math.max(0.5,(p.phK||1)-0.15);if(v==='phR'){delete p.phX;delete p.phY}changed(false);sz()})};sz();
  if(ent)b.querySelector('.th').style.backgroundImage=`url("${ent.url}")`;
  b.querySelectorAll('[data-a=foto]').forEach(x=>x.onclick=()=>pickFor(p));
  const fu=b.querySelector('[data-a=fundo]');if(fu)fu.onclick=async()=>{toast('Tirando o fundo branco…');const u=await processImage(imgCache.get(imgKey(p)).url,true);await setImage(p,u);openEditor(p.id)};
  const rm=b.querySelector('[data-a=rmfoto]');if(rm)rm.onclick=async()=>{if(p.imgAlias&&imgKey(p)===p.imgAlias){delete p.imgAlias;delete p.autoFoto;p.noAuto=true}else{const k=ownKey(p);imgCache.delete(k);await IDB.del(k);p.noAuto=true}changed();openEditor(p.id)};
  b.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{EDTAB=x.dataset.tab;b.querySelectorAll('[data-tab]').forEach(y=>y.classList.toggle('on',y===x));b.querySelectorAll('.edG').forEach(g=>g.hidden=g.dataset.g!==EDTAB)});
  b.querySelector('[data-a=ok]').onclick=closeModal;
  const crs=b.querySelector('[data-a=corRs]');if(crs)crs.onclick=()=>{delete p.precoCor;changed();openEditor(p.id)};
  b.querySelector('[data-a=cores]').onclick=()=>openCores();
  const mvc=b.querySelector('[data-mv=c]');if(mvc)mvc.onclick=()=>{p.dx=0;p.dy=0;p.zoom=1;changed();openEditor(p.id)};
  b.querySelector('[data-a=star]').onclick=()=>openStarSearch(p);
  b.querySelectorAll('#appTg button').forEach(x=>x.onclick=()=>{p.appOn=x.dataset.v==='1';changed();openEditor(p.id);setTimeout(()=>{const i=$('#mbody [name='+(p.appOn?'app':'price')+']');if(i)i.focus()},40)});
  b.querySelector('[data-a=del]').onclick=()=>confirmDel(p,true);
  b.querySelector('[data-a=dupl]').onclick=()=>{const q=Object.assign(clone(p),{id:uid(),code:''});const e=imgCache.get(imgKey(p));if(e){imgCache.set(imgKey(q),e);IDB.set(imgKey(q),e.url)}S.products.splice(S.products.indexOf(p)+1,0,q);changed();openEditor(q.id)};
  b.querySelectorAll('[name]').forEach(inp=>{
   const ev=inp.tagName==='SELECT'||inp.type==='checkbox'?'change':'input';
   inp.addEventListener(ev,()=>{const k=inp.name;
    if(k==='code'){const oldK=imgKey(p);p.code=inp.value.trim();moveImgKey(oldK,p)}
    else if(k==='price'||k==='app'){p[k]=parseMoney(inp.value);const em=$('#edMarg');if(em)em.innerHTML=margFlag(p)||'margem —'}
    else if(k==='limit')p.limit=Math.max(0,parseInt(inp.value)||0);
    else if(k==='papel'){p.featured=inp.value==='icone';p.papel=inp.value==='icone'?'':inp.value}
    else if(k==='venc')p.venc=inp.checked;
    else if(k==='precoKg')p.precoKg=inp.checked;
    else if(k==='setor'){if(inp.value==='__novo'){$('#novoSet').hidden=false;$('#novoSetN').focus();return}p.setor=inp.value}
    else if(k==='zoom')p.zoom=inp.value/100;else if(k==='dy')p.dy=inp.value/100;else if(k==='dx')p.dx=inp.value/100;else if(k==='prOver')p.prOver=inp.checked;
    else if(k==='precoCor'){p.precoCor=inp.value}else if(k==='destFundo'){p.destFundo=inp.value}
    else p[k]=inp.value;
    changed()})});
  $('#novoSetOk').onclick=()=>{const n=$('#novoSetN').value.trim();if(!n)return;addSetor(n);p.setor=n;changed();openEditor(p.id)};
  setTimeout(()=>{const d=b.querySelector('[name=desc]');if(!p.desc)d.focus()},50)})}
function addSetor(n){if(!S.setores.some(s=>norm(s.nome)===norm(n)))S.setores.push({nome:n,cor:SEC_PAL[S.setores.length%SEC_PAL.length]});renderSecs();return S.setores.find(s=>norm(s.nome)===norm(n)).nome}
function renderSecs(){const el=$('#secList');if(!el)return;
 el.innerHTML=S.setores.map((s,i)=>`<div class="secRow"><input type="color" data-i="${i}" value="${s.cor}"><span>${esc(s.nome)} <small>• ${secCount(s.nome)} produtos</small></span>${secCount(s.nome)?'':`<button class="ico" data-del="${i}" title="Excluir">✕</button>`}</div>`).join('')+`<div class="bar" style="margin-top:8px"><input id="secNew" placeholder="Novo setor" style="margin:0;flex:1"><button class="btn sm pri" id="secAdd">Adicionar</button></div>`;
 el.querySelectorAll('input[type=color]').forEach(x=>x.oninput=()=>{S.setores[+x.dataset.i].cor=x.value;changed()});
 el.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>{S.setores.splice(+x.dataset.del,1);renderSecs();changed()});
 $('#secAdd').onclick=()=>{const n=$('#secNew').value.trim();if(n){addSetor(n);changed()}}}
$('#quickP').onclick=openQuick;$('#fillP').onclick=()=>openFill(0);
$('#starP').onclick=()=>openStarSearch();$('#starAll').onclick=starRefreshAll;
$('#addP').onclick=()=>{const p=P({});S.products.push(p);changed();openEditor(p.id)};
$('#selAll').onclick=()=>{S.products.forEach(p=>p.sel=true);changed()};
$('#selNone').onclick=()=>{S.products.forEach(p=>p.sel=false);changed()};
$('#clearP').onclick=()=>{modal(`<h3>Tem certeza?</h3><p>Todos os ${S.products.length} produtos saem da lista. As fotos continuam guardadas e voltam sozinhas quando o produto for cadastrado de novo.</p><div class="mfoot"><button class="btn" data-a="n">Não</button><button class="btn pri" data-a="y">Sim, remover todos</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{S.products=[];S.page=0;closeModal();changed()}})};

function normUnit(u){u=norm(u);if(!u)return'un';if(['un','und','unid','unidade','u'].includes(u))return'un';if(['kg','quilo','kilo'].includes(u))return'kg';if(['bdj','bandeja'].includes(u))return'bandeja';if(['pct','pacote','pc'].includes(u))return'pct';if(['cx','caixa'].includes(u))return'cx';if(['l','lt','litro'].includes(u))return'L';if(u==='100g')return'100g';if(['dz','duzia'].includes(u))return'dz';return u}
function parsePaste(t){
 const out=[];
 t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(l=>{
  let c=l.includes('\t')?l.split('\t'):l.includes(';')?l.split(';'):l.split(/\s{2,}/);c=c.map(x=>x.trim());
  if(c.length<2)return;
  let code='',desc,price,unit='',old=null;
  let setor='';
  if(parseMoney(c[1])!=null&&/[a-z]/i.test(c[0])){[desc,price,unit,old,setor]=[c[0],parseMoney(c[1]),c[2]||'',parseMoney(c[3]),c[4]||'']}
  else{[code,desc,price,unit,old,setor]=[c[0],c[1],parseMoney(c[2]),c[3]||'',parseMoney(c[4]),c[5]||''];if(price==null&&parseMoney(c[3])!=null){price=parseMoney(c[3]);unit=c[2]}}
  if(setor&&!/\d/.test(setor))setor=addSetor(setor);else setor='';
  if(price==null||!desc)return;
  out.push(P({code:/^\d+$/.test(code)?code:'',desc,price,unit:normUnit(unit),app:old!=null&&old!==price?old:null,appOn:old!=null&&old!==price,setor}))});
 return out}
$('#pasteP').onclick=()=>modal(`<h3>Colar lista</h3><p class="hint">Copie as linhas do Excel ou do sistema e cole aqui. Colunas: <b>código, descrição, preço sem app, unidade, preço com app, setor</b> (só descrição e preço são obrigatórios). Linhas de cabeçalho são ignoradas.</p>
 <textarea id="pasteTx" style="min-height:200px" placeholder="7891234567890	Arroz tipo 1 5kg	24,90	un	29,90&#10;Picanha bovina	59,90	kg"></textarea>
 <div class="mfoot"><button class="btn l" data-a="n">Cancelar</button><button class="btn" data-a="rep">Substituir a lista</button><button class="btn pri" data-a="add">Adicionar</button></div>`,b=>{
 const go=rep=>{const l=parsePaste($('#pasteTx').value);if(!l.length){toast('Não achei produtos com preço nessas linhas');return}if(rep){S.products=l;S.page=0}else S.products.push(...l);closeModal();changed();loadAllImages();toast(`${l.length} produtos adicionados`)};
 b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=add]').onclick=()=>go(false);b.querySelector('[data-a=rep]').onclick=()=>go(true)});
$('#bulkP').onclick=()=>{toast('Dica: o nome do arquivo deve ser o código ou a descrição do produto',3500);$('#fileMulti').click()};
$('#fileMulti').onchange=async e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;toast('Encaixando as fotos…');let ok=0,miss=[];
 for(const f of fs){const nm=norm(f.name.replace(/\.[^.]+$/,''));const p=S.products.find(p=>p.code&&norm(p.code)===nm)||S.products.find(p=>norm(p.desc)===nm)||(nm.length>=4&&S.products.find(p=>norm(p.desc).includes(nm)));
  if(p){try{const u=await processImage(await fileToURL(f),false);const k=imgKey(p);imgCache.set(k,{img:await loadImg(u),url:u});await IDB.set(k,u);ok++}catch(err){miss.push(f.name)}}else miss.push(f.name)}
 changed();toast(`${ok} fotos encaixadas${miss.length?` • ${miss.length} sem produto correspondente`:''}`,4000)};

/* ================= StarIA ================= */
const STAR='StarIA',r2=n=>Math.round(n*100)/100;
let mcpP=null;
function getMcp(){if(!mcpP)mcpP=(async()=>{try{return window.claude&&window.claude.use?await window.claude.use('mcp'):null}catch(e){return null}})();return mcpP}
async function star(tool,input){const m=await getMcp();if(!m)throw{code:'no_mcp'};const r=await m.callTool(STAR,tool,input);return r.payload}
function starErr(e){const c=e&&e.code;
 if(c==='no_mcp'||c==='not_granted'||c==='capability_disabled'||c==='capability_removed')return'A conexão com o StarIA só funciona com o app aberto no claude.ai.';
 if(c==='server_not_connected'||c==='server_not_found')return'Conecte o StarIA em claude.ai > Configurações > Conectores.';
 if(c==='needs_reauth')return'O login do StarIA expirou. Reconecte em claude.ai > Configurações > Conectores.';
 if(c==='selection_required')return'Você tem mais de um StarIA conectado. Escolha qual usar no aviso do claude.ai.';
 if(c==='approval_required'||c==='not_in_manifest')return'Falta permitir que este app consulte o StarIA. Toque de novo e aceite o pedido.';
 if(c==='blocked_by_policy')return'A sua organização bloqueou esta consulta do StarIA.';
 if(c==='tool_error')return'O StarIA respondeu com erro: '+String(e.message||'').slice(0,160);
 return'Não consegui falar com o StarIA agora. Tente de novo em instantes.'}
const filial=()=>Math.max(1,parseInt(S.store.filial)||1);
async function starSearch(q){
 q=q.trim();const input={filial:filial(),limite:25,agruparPor:'MERCADORIA',statusMercadoria:'ATIVO',situacaoEstoque:'TODOS'};
 if(/^\d+$/.test(q)){if(q.length>=8)input.ean=q;else input.codigoMercadoria=+q}else input.nomeMercadoria=q;
 const pl=await star('consultar_estoque',input);
 return((pl&&pl.itens)||[]).map(it=>{const est=+it.estoque||0;return{code:String(it.codigoMercadoria),ean:it.ean||'',desc:it.mercadoria||'',estoque:est,
  sysPrice:est>0&&it.valorVendaTotal?r2(it.valorVendaTotal/est):null,cost:est>0&&it.valorCustoTotal?Math.round(it.valorCustoTotal/est*10000)/10000:null}})}
async function starLastCost(code){
 const pl=await star('consultar_ultima_compra_mercadoria',{codigoMercadoria:+code,filial:filial(),limite:1});const it=pl&&pl.itens&&pl.itens[0];
 return it&&it.quantidadeUltimaCompra?Math.round(it.custoUltimaCompra/it.quantidadeUltimaCompra*10000)/10000:null}
async function starFill(r){if(r.cost==null){try{r.cost=await starLastCost(r.code)}catch(e){}}return r}
function applyStar(p,r,{desc=false}={}){p.code=r.code;if(r.ean)p.ean=r.ean;if(desc||!p.desc)p.desc=r.desc;if(r.cost!=null)p.cost=r.cost;if(r.sysPrice!=null)p.sysPrice=r.sysPrice;p.sysAt=Date.now();if(p.price==null&&r.sysPrice!=null)p.price=r.sysPrice}
const effPrice=p=>hasApp(p)?Math.min(p.app,p.price):p.price;
const margem=p=>{const e=effPrice(p);return p.cost!=null&&e!=null&&e>0?(e-p.cost)/e:null};
const margMin=()=>{const v=parseFloat(String(S.store.margMin??'8').replace(',','.'));return isFinite(v)?v/100:0.08};
function margFlag(p){const m=margem(p);if(m==null)return'';if(m<0)return`<span class="flag r">ABAIXO DO CUSTO</span>`;if(m<margMin())return`<span class="flag r">MARGEM ${(m*100).toFixed(1).replace('.',',')}%</span>`;return`<span class="flag g">MARGEM ${(m*100).toFixed(0)}%</span>`}
function openStarSearch(target){
 const link=target&&target.id;
 modal(`<h3>${link?'Vincular ao StarIA':'Buscar no StarIA'}</h3>
 <p class="hint">Busque por nome, código interno ou código de barras. Filial ${filial()} (troque na aba Loja). Preço e custo vêm do estoque atual; sem estoque, o custo vem da última compra.</p>
 <div class="bar" style="flex-wrap:nowrap"><input id="sq" placeholder="Ex.: picanha, 360 ou 7897297900112" style="margin:0" value="${esc(link?(target.code||target.desc||''):'')}"><button class="btn pri" id="sgo">Buscar</button></div>
 <div id="sres"></div>
 <div class="mfoot"><button class="btn" data-a="x">${link?'Voltar':'Fechar'}</button></div>`,b=>{
  const back=()=>{if(link)openEditor(target.id);else closeModal()};b.querySelector('[data-a=x]').onclick=back;
  const go=async()=>{const q=$('#sq').value;if(!q.trim())return;const el=$('#sres');el.innerHTML='<p class="hint">Consultando o StarIA…</p>';
   let rs;try{rs=await starSearch(q)}catch(e){el.innerHTML=`<div class="warn r">${esc(starErr(e))}</div>`;return}
   if(!rs.length){el.innerHTML='<p class="hint">Nada encontrado. Tente outra palavra ou o código.</p>';return}
   el.innerHTML=rs.map((r,i)=>{const m=r.cost!=null&&r.sysPrice?((r.sysPrice-r.cost)/r.sysPrice*100).toFixed(0)+'%':'—';const has=S.products.some(p=>p.code===r.code);
    return`<div class="secRow" style="align-items:flex-start"><span><b style="font-weight:600">${esc(r.desc)}</b><br><small>#${esc(r.code)}${r.ean?' • '+esc(r.ean):''} • estoque ${String(r.estoque).replace('.',',')} • preço ${r.sysPrice!=null?brl(r.sysPrice):'—'} • custo ${r.cost!=null?brl(r.cost):'—'} • margem ${m}</small></span>
    <button class="btn sm ${has&&!link?'':'pri'}" data-i="${i}">${link?'Vincular':has?'Adicionar de novo':'Adicionar'}</button></div>`}).join('');
   el.querySelectorAll('[data-i]').forEach(x=>x.onclick=async()=>{x.disabled=true;const r=await starFill(rs[+x.dataset.i]);
    if(link){const p=S.products.find(q=>q.id===target.id);const oldK=imgKey(p);applyStar(p,r);moveImgKey(oldK,p);changed();toast('Produto vinculado ao StarIA');openEditor(p.id)}
    else{const p=P({setor:''});applyStar(p,r,{desc:true});S.products.push(p);changed();loadAllImages();x.textContent='Adicionado ✓';toast(`${r.desc} adicionado`)}})};
  $('#sgo').onclick=go;$('#sq').onkeydown=e=>{if(e.key==='Enter')go()};setTimeout(()=>{$('#sq').focus();if(link&&$('#sq').value)go()},40)})}
function moveImgKey(oldK,p){const nk=imgKey(p);if(oldK===nk)return;if(imgCache.has(oldK)&&!imgCache.has(nk)){const e=imgCache.get(oldK);imgCache.set(nk,e);IDB.set(nk,e.url);cloudPutImage(nk,e.url)}else if(!imgCache.has(nk)){IDB.get(nk).then(async u=>{if(u){imgCache.set(nk,{img:await loadImg(u),url:u});changed()}})}}
async function starRefreshAll(){
 const ps=S.products.filter(p=>/^\d+$/.test(p.code||''));if(!ps.length){toast('Nenhum produto com código do StarIA. Use "Buscar no StarIA" ou vincule pelo editor.',4500);return}
 let ok=0,fail=0,lastErr=null;
 for(let i=0;i<ps.length;i++){const p=ps[i];toast(`Atualizando do StarIA ${i+1}/${ps.length}…`,8000);
  try{const rs=await starSearch(p.code);const r=rs.find(x=>x.code===p.code)||rs[0];if(r){await starFill(r);if(r.cost!=null)p.cost=r.cost;if(r.sysPrice!=null)p.sysPrice=r.sysPrice;p.sysAt=Date.now();ok++}else fail++}
  catch(e){fail++;lastErr=e;if(['no_mcp','server_not_connected','needs_reauth','not_in_manifest','approval_required','blocked_by_policy','not_granted'].includes(e&&e.code))break}}
 changed();toast(lastErr&&!ok?starErr(lastErr):`${ok} produtos atualizados com custo e preço do sistema${fail?` • ${fail} sem resposta`:''}`,5000)}

/* ================= nuvem (db + assets) ================= */
const CLOUD={db:null,as:null,map:{},on:false,wq:Promise.resolve()};
function cloudStatus(t,cls){const el=$('#cloudSt');if(el){el.textContent=t;el.className='cloud '+(cls||'')}}
function dataURLtoBlob(u){const[h,b]=u.split(',');const mime=(h.match(/data:([^;]+)/)||[])[1]||'image/png';const bin=atob(b);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime})}
function cloudQueue(fn){CLOUD.wq=CLOUD.wq.then(fn).catch(()=>{});return CLOUD.wq}
const DRAFT=['avulsas','avTitle','avCamp','avVal','avPer','avOri','logoOff','tvAt','products','val','artes','page','campaignId','format','lay','listMode','ui','kitOpt'];
const stateForCloud=()=>{const o=Object.assign({},S);delete o.saved;delete o._sharedDirty;delete o.draftAt;DRAFT.forEach(k=>delete o[k]);return JSON.stringify(o)};
const draftForCloud=()=>{const o={};DRAFT.forEach(k=>{if(k in S)o[k]=S[k]});return JSON.stringify(o)};
let ME=null;async function meId(){if(ME!==null)return ME;try{const u=window.claude&&await window.claude.use('user');ME=u&&u.id?await u.id():'';USERCAP=u||null}catch(e){ME=''}return ME}
let USERCAP=null;const isOwnerV=()=>{try{return USERCAP?USERCAP.isOwner():null}catch(e){return null}};
let cloudT;
function cloudSave(){if(!CLOUD.on)return;clearTimeout(cloudT);cloudT=setTimeout(()=>cloudQueue(async()=>{
 try{cloudStatus('Salvando…');const id=await meId();if(id)await CLOUD.db.doc('data/users/'+id+'/rascunho').set({savedAt:S.savedAt||Date.now(),data:draftForCloud()});let base=null;try{const r=await CLOUD.db.doc('app/estado').get();base=r.exists?JSON.parse(r.data().data):null}catch(e){}
   /* banco de fotos e histórico de ofertas somam; o resto da configuração só o dono grava */
   if(base){S.fotoNomes=Object.assign({},base.fotoNomes||{},S.fotoNomes||{});S.ofertaHist=Object.assign({},base.ofertaHist||{},S.ofertaHist||{});S.fotoEan=Object.assign({},base.fotoEan||{},S.fotoEan||{});S.catalogo=Object.assign({},base.catalogo||{},S.catalogo||{})}
   let out;if(isOwnerV()===false&&base){const bc=base.campaigns||[];(S.campaigns||[]).forEach(c=>{if(c.padrao&&!bc.some(x=>x.id===c.id))bc.push(c)});out=Object.assign(base,{campaigns:bc,fotoNomes:S.fotoNomes,ofertaHist:S.ofertaHist,fotoEan:S.fotoEan,catalogo:S.catalogo,funcSeen:S.funcSeen||base.funcSeen});DRAFT.forEach(k=>delete out[k]);out=JSON.stringify(out)}else out=stateForCloud();
   delete S._sharedDirty;await CLOUD.db.doc('app/estado').set({savedAt:S.savedAt||Date.now(),data:out});cloudStatus('Salvo na nuvem','ok')}
 catch(e){cloudStatus(e&&e.code==='quota_exceeded'?'Nuvem cheia: apague encartes salvos antigos':'Sem conexão com a nuvem, salvo neste navegador','bad')}}),1500)}
let mapT;
function cloudSaveMap(){if(!CLOUD.on)return;clearTimeout(mapT);mapT=setTimeout(()=>cloudQueue(async()=>{try{await CLOUD.db.doc('app/imagens').set({map:CLOUD.map})}catch(e){}}),1000)}
async function cloudPutImage(k,url,quiet){
 if(!CLOUD.on||!CLOUD.as||!url||!url.startsWith('data:'))return;
 try{const r=await CLOUD.as.upload(dataURLtoBlob(url));CLOUD.map[k]=r.id;if(!quiet)cloudSaveMap()}
 catch(e){if(e&&e.code==='quota_or_state')cloudStatus('Espaço de fotos da nuvem cheio','bad')}}
function cloudDelImage(k){if(!CLOUD.on||!(k in CLOUD.map))return;delete CLOUD.map[k];cloudSaveMap()}
function cloudSaveEnc(rec){if(!CLOUD.on)return;return cloudQueue(async()=>{try{await CLOUD.db.doc('salvos/'+rec.id).set({at:rec.at,data:JSON.stringify(rec)})}catch(e){if(e&&e.code==='invalid_argument')toast('Este encarte salvo é grande demais para a nuvem.')}})}
function cloudDelEnc(id){if(!CLOUD.on)return;cloudQueue(async()=>{try{await CLOUD.db.doc('salvos/'+id).delete()}catch(e){}})}
async function blobToDataURL(id){const img=await loadImg((window.ENC_BLOB||'/_blob/')+id);const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return c.toDataURL('image/png')}
async function cloudSyncImages(){
 const local=await IDB.keys(),have=new Set(local);let got=0;
 const miss=Object.keys(CLOUD.map).filter(k=>!have.has(k));
 for(let i=0;i<miss.length;i++){cloudStatus(`Baixando fotos da nuvem ${i+1}/${miss.length}…`);try{await IDB.set(miss[i],await blobToDataURL(CLOUD.map[miss[i]]),true);got++}catch(e){}}
 if(CLOUD.as){const up=local.filter(k=>!(k in CLOUD.map));
  for(let i=0;i<up.length;i++){cloudStatus(`Enviando fotos para a nuvem ${i+1}/${up.length}…`);const u=await IDB.get(up[i]);if(u)await cloudPutImage(up[i],u,true)}
  if(up.length)cloudSaveMap()}
 if(got)await loadAllImages()}
function fillInputs(){$('#vIni').value=S.val.ini||'';$('#vFim').value=S.val.fim||'';$('#phr').value=S.phrases.join('\n');
 [['sNome','nome'],['sWa','wa'],['sEnd','ends'],['sExtra','extra'],['sFil','filial'],['sMarg','margMin'],['sMAlvo','margAlvo'],['sPin','pin']].forEach(([id,k])=>{$('#'+id).value=S.store[k]??''});$('#lgPos').value=S.store.logoPos||'lado';$('#lgFx').value=S.store.logoFx||'auto';$('#oSec').checked=S.store.secCor!==false;$('#oTinta').checked=!!S.store.tinta}
function refreshAll(){fillInputs();renderFormats();renderCamps();renderList();renderLogos();renderSaved();renderSecs();renderArt();schedule()}
async function cloudInit(){
 if(!(window.claude&&window.claude.use)){cloudStatus('Só neste navegador','bad');return}
 let db=null,as=null;try{[db,as]=await Promise.all([window.claude.use('db'),window.claude.use('assets').catch(()=>null)])}catch(e){}
 if(!db){cloudStatus('Só neste navegador','bad');return}
 CLOUD.db=db;CLOUD.as=as;cloudStatus('Conectando à nuvem…');
 const timer=setTimeout(()=>cloudStatus('Nuvem demorando, usando o que está neste navegador','bad'),10000);
 try{
  const[st,im,sv]=await Promise.all([db.doc('app/estado').get(),db.doc('app/imagens').get(),db.collection('salvos').get()]);clearTimeout(timer);
  CLOUD.map=Object.assign({},(im.exists&&im.data().map)||{});
  const remote=st.exists?st.data():null;
  const uid=await meId();let dr=null;if(uid){try{const x=await db.doc('data/users/'+uid+'/rascunho').get();dr=x.exists?x.data():null}catch(e){}}
  if(remote&&(remote.savedAt||0)>(S.savedAt||0)){try{const keep=S.saved,d=JSON.parse(remote.data),mine={};DRAFT.forEach(k=>{if(k in S)mine[k]=S[k]});
   /* config compartilhada vem da nuvem; o encarte em edição é de cada pessoa */
   DRAFT.forEach(k=>{if(!dr&&k in d)mine[k]=mine[k]??d[k];delete d[k]});S=Object.assign(defaults(),d,mine);S.saved=keep;S.savedAt=remote.savedAt;try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}refreshAll()}catch(e){}}
  if(dr&&(dr.savedAt||0)>(S.draftAt||0)){try{Object.assign(S,JSON.parse(dr.data));S.draftAt=dr.savedAt;refreshAll()}catch(e){}}
  const rs=sv.docs.map(d=>{try{return JSON.parse(d.data().data)}catch(e){return null}}).filter(r=>r&&r.id&&Array.isArray(r.products)),ids=new Set(rs.map(r=>r.id)),localOnly=S.saved.filter(x=>!ids.has(x.id));
  S.saved=[...rs,...localOnly].sort((a,b)=>(b.at||0)-(a.at||0));
  CLOUD.on=true;
  for(const x of localOnly)cloudSaveEnc(x);
  if(!remote||(remote.savedAt||0)<(S.savedAt||0)){S.savedAt=S.savedAt||Date.now();cloudSave()}
  renderSaved();await cloudSyncImages();cloudStatus('Salvo na nuvem','ok');applyModo();if(isFunc()&&!inWz())setUi('wz');else if(inWz())wzGo(WZ);setTimeout(catLoad,1500)
 }catch(e){clearTimeout(timer);cloudStatus('Sem conexão com a nuvem, salvo neste navegador','bad')}}

/* ================= digitar produtos ================= */
const isPriceTok=t=>/^(r\$)?\d{1,5}([.,]\d{1,2})?$/i.test(t)&&!/^r\$$/i.test(t);
const UNIT_WORDS={kg:'kg','/kg':'kg',quilo:'kg',bdj:'bandeja',bandeja:'bandeja',un:'un',und:'un',unid:'un',pct:'pct',pacote:'pct',cx:'cx',caixa:'cx',dz:'dz',duzia:'dz','dúzia':'dz'};
function parseQuick(txt){
 /* linha com preço de centavos (24,90): número inteiro solto nela é parte do nome (Ninho 400, Produto 2) */
 const out=[],toks=String(txt).replace(/\r/g,'').replace(/[*_~]/g,'').split('\n').map(l=>l.replace(/^\s*(?:[-–—•·▪►▶✅✔☑🔸🔹🔥⭐➡️➡]+|\d{1,2}[).]\s)\s*/u,'')).flatMap(l=>{const t=l.trim().split(/\s+/).filter(Boolean),dec=t.some(x=>/^(r\$)?\d{1,5}[.,]\d{2}$/i.test(x));return[...t.map((x,i)=>dec&&/^\d+$/.test(x)&&!/^(kg|g|gr|ml|l|lt|litro|litros|mg)$/i.test(t[i+1]||'')?'§'+x:x),'\n']});
 let words=[],prices=[];
 const flush=()=>{if(words.length&&prices.length){let unit='un';/* a unidade (kg, bandeja, dúzia…) vira a unidade do preço E continua escrita no nome, como no encarte feito à mão */const w=words.map(x=>{const u=UNIT_WORDS[norm(x)]||UNIT_WORDS[x.toLowerCase()];if(u&&words.length>1){unit=u;return u==='kg'?'kg':x}return x});
   let desc=w.join(' ').replace(/§/g,'');desc=desc.charAt(0).toUpperCase()+desc.slice(1);let[a,b]=prices;if(b!=null&&b>a)[a,b]=[b,a];/* o maior é sempre o sem app */
   out.push(P({desc,unit,price:a,app:b!=null&&b!==a?b:null,appOn:b!=null&&b!==a}))}words=[];prices=[]};
 for(let i=0;i<toks.length;i++){const t=toks[i];
  if(t==='\n'){flush();continue}
  if(/^(lim|limite|lmt)[:.]?$/i.test(t)&&/^§?\d{1,3}$/.test(toks[i+1]||'')){flush();const n=parseInt(String(toks[i+1]).replace('§',''));if(out.length)out[out.length-1].limit=n;i++;continue}
  if(/^r\$$/i.test(t))continue;
  if(isPriceTok(t)&&/^(kg|g|gr|ml|l|lt|litro|litros|mg)$/i.test(toks[i+1]||'')){words.push(t+toks[i+1].toLowerCase().replace(/^(lt|litro|litros)$/,'L').replace(/^l$/,'L'));i++;continue}
  if(isPriceTok(t)&&words.length){prices.push(parseMoney(t));const nx=toks[i+1]||'';if(prices.length>=2||!(isPriceTok(nx)||/^r\$$/i.test(nx)))flush();continue}
  if(prices.length)flush();words.push(t)}
 flush();return out}
function openQuick(pre){
 modal(`<h3>Digitar produtos</h3>
 <p class="hint">Escreva o produto e o preço na frente, separado por espaço. Pode ser um por linha ou tudo corrido: <b>Arroz Puro Grão 5kg 24,90 Feijão 1kg 6,99 Coca 2L 9,99</b>. Número sozinho vira preço; número grudado (2L, 5kg) fica na descrição. Para limitar no preço do app, escreva <b>lim 6</b> depois dos preços. Dois preços seguidos = <b>sem app</b> e <b>com app</b>. "kg" ou "bdj" sozinho vira a unidade.</p>
 <textarea id="qTx" style="min-height:140px" placeholder="Picanha kg 59,90 Alcatra kg 42,90&#10;Leite integral 1L 4,79 4,49"></textarea>
 <div id="qPrev" class="hint" style="max-height:180px;overflow:auto"></div>
 <div class="mfoot"><button class="btn l" data-a="n">Cancelar</button><button class="btn" data-a="rep">Substituir a lista</button><button class="btn pri" data-a="add">Adicionar</button></div>`,b=>{
  const tx=$('#qTx'),pv=$('#qPrev');
  const upd=()=>{const l=parseQuick(tx.value);pv.innerHTML=l.length?`<b>Entendi ${l.length} ${l.length>1?'produtos':'produto'}:</b><br>`+l.map(p=>`• ${esc(p.desc)}${p.unit!=='un'?' ('+p.unit+')':''} — ${brl(p.price)}${p.appOn?' • app '+brl(p.app):''}`).join('<br>'):''};
  tx.oninput=upd;if(pre){tx.value=pre;upd()}setTimeout(()=>tx.focus(),40);
  const go=rep=>{const l=parseQuick(tx.value);if(!l.length){toast('Não achei produto com preço. Ex.: Arroz 5kg 24,90');return}
   if(rep){S.products=l;S.page=0}else S.products.push(...l);changed();loadAllImages();askDistrib()};
  b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=add]').onclick=()=>go(false);b.querySelector('[data-a=rep]').onclick=()=>go(true)})}
/* pergunta frente x verso */
function askDistrib(){
 const fk=S.format,N=S.products.length,lim=FORMATS[fk].limit,cfg=artesOf(fk);
 if(cfg.some(c=>c.t==='s')){closeModal();toast(`${N} produtos na lista`);return}
 const sug=Math.min(N,lim);
 modal(`<h3>Como distribuir os ${N} produtos?</h3>
 <p class="hint">O formato ${FORMATS[fk].label} comporta bem até ${lim} produtos por arte. O verso cresce sozinho: cada produto que você adicionar depois entra nele e tudo se redistribui para ocupar a página inteira.</p>
 <div class="row2"><label>Produtos na frente<input type="number" id="dF" min="1" max="${N}" value="${sug}"></label><label>Produtos no verso<input type="number" id="dV" min="0" value="${N-sug}"></label></div>
 <div class="chips" id="dQuick">${[...new Set([N,lim,Math.ceil(N/2),Math.min(N,lim-1)].filter(v=>v>=1&&v<=N))].sort((a,b)=>b-a).map(v=>`<div class="chip" data-v="${v}">${v===N?'Tudo na frente ('+N+')':v+' na frente + '+(N-v)+' no verso'}</div>`).join('')}</div>
 <div class="mfoot"><button class="btn" data-a="n">Deixar como está</button><button class="btn pri" data-a="y">Aplicar</button></div>`,b=>{
  const f=$('#dF'),v=$('#dV');f.oninput=()=>{v.value=Math.max(0,N-(+f.value||0))};
  b.querySelectorAll('#dQuick .chip').forEach(x=>x.onclick=()=>{f.value=x.dataset.v;f.oninput()});
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=()=>{const nf=clamp(+f.value||N,1,N),nv=Math.max(0,+v.value||0);
   setArtes(fk,nf>=N&&!nv?[{t:'m',lay:'auto',n:N,grow:true}]:[{t:'m',lay:'auto',n:nf},{t:'m',lay:'auto',n:Math.max(nv,1),grow:true}]);S.page=0;closeModal();changed();
   toast(nf>=N?`${N} produtos na frente`:`Frente com ${nf}, verso com ${N-nf}`)}})}
/* sugestões de distribuição embaixo do encarte */
function renderSugs(P){
 const el=$('#sugs');if(!el)return;const fk=S.format,pg=P[S.page];
 if(!pg||pg.lay.sec||!pg.items.length){el.innerHTML='';return}
 const n=pg.items.length,cur=pg.lay.id,opts=[LAYOUTS[0],...LAYOUTS.filter(l=>!l.auto&&layFits(l,fk)&&l.n===n)];
 el.innerHTML=`<div class="sugH"><b>${opts.length>1?'Outras distribuições':'Distribuição'} para ${n} ${n>1?'produtos':'produto'}</b><span class="hint" style="margin:0">Toque para aplicar nesta arte</span></div>
 <div class="sugRow">${opts.map(l=>`<button class="layOpt sm ${l.id===cur?'on':''}" data-id="${l.id}"><canvas></canvas><b>${esc(l.auto?'Automático':l.nome)}</b></button>`).join('')}</div>`;
 el.querySelectorAll('.layOpt').forEach(b=>{const l=layById(b.dataset.id);drawCroqui(b.querySelector('canvas'),l,fk,70,84);
  b.onclick=()=>{const a=artesOf(fk).slice();while(a.length<=S.page)a.push({t:'m',lay:'auto'});const old=a[S.page]||{};a[S.page]=l.auto?{t:'m',lay:'auto',n:n,grow:old.grow}:{t:'m',lay:l.id};setArtes(fk,a);changed();toast(`${arteNome(S.page)}: ${l.auto?'Automático':l.nome}`)}})}
function stepArte(d){
 const fk=S.format,{P}=pageInfo(),pg=P[S.page];if(!pg||pg.lay.sec)return;const a=artesOf(fk).slice();while(a.length<=S.page)a.push({t:'m',lay:'auto'});
 const cur=pg.items.length||pg.cap,nx=clamp(cur+d,1,40);a[S.page]={t:'m',lay:'auto',n:nx,grow:false};
 /* tirou do verso: o produto volta para a arte anterior (a frente) */
 let before=P.slice(0,S.page).reduce((s,q)=>s+q.items.length,0);
 if(d<0&&S.page>0&&nx<cur){const pv=P[S.page-1],pc=a[S.page-1];if(pv&&pc&&pc.t==='m'&&layById(pc.lay).auto){a[S.page-1]=Object.assign({},pc,{n:pv.items.length+1,grow:false});before++}}
 if(S.page===a.length-1&&nx<S.products.length-before)a.push({t:'m',lay:'auto',n:1,grow:true});
 setArtes(fk,a);changed()}

/* ================= banco de fotos por nome + completar fotos ================= */
const STOPW=new Set(['de','da','do','das','dos','com','e','c','tipo','tp','tp1','t1','sabor','unid','un','und','pct','cx','emb','embalagem']);
const isSize=t=>/^\d+([.]\d+)?(kg|g|gr|ml|l|lt|mg|m)$/.test(t);
function norm2(desc){
 return String(desc||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/(\d),(\d)/g,'$1.$2').replace(/(\d)\s+(kg|g|gr|ml|l|lt|mg)\b/g,'$1$2').replace(/(\d)(litros?|lts?)\b/g,'$1l').replace(/(\d)gr\b/g,'$1g')
  .split(/[^a-z0-9.]+/).filter(x=>x&&!STOPW.has(x)&&!/^\d+$/.test(x))}
function nameKey(desc){const t=norm2(desc);return t.length?t.sort().join(' '):''}
function rememberPhoto(p){if(p.ean&&/^\d{8,14}$/.test(p.ean)){S.fotoEan=S.fotoEan||{};S.fotoEan[p.ean]=imgKey(p)}const k=nameKey(p.desc);if(!k)return;S.fotoNomes=S.fotoNomes||{};S.fotoNomes[k]=imgKey(p)}
function lev1(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,e=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++e>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}}return e+(a.length-i)+(b.length-j)<=1}
function tokEq(a,b){if(a===b)return true;const m=Math.min(a.length,b.length);if(m>=3&&(a.startsWith(b)||b.startsWith(a)))return true;return m>=5&&lev1(a,b)}
/* busca a foto mais parecida já usada: tolera abreviação, erro de 1 letra, tamanho faltando */
function findPhotoByName(p){
 const bank=S.fotoNomes||{},k=nameKey(p.desc);if(!k)return null;if(bank[k]&&imgCache.has(bank[k]))return bank[k];
 const q=norm2(p.desc),qs=q.filter(isSize),qw=q.filter(t=>!isSize(t));if(!qw.length)return null;
 let best=null,bs=0;
 for(const[bk,ik]of Object.entries(bank)){if(!imgCache.has(ik))continue;const b=bk.split(' '),bsz=b.filter(isSize),bw=b.filter(t=>!isSize(t));if(!bw.length)continue;
  const used=new Set();let hit=0;qw.forEach(t=>{const j=bw.findIndex((x,ix)=>!used.has(ix)&&tokEq(t,x));if(j>=0){used.add(j);hit++}});
  if(hit<Math.min(2,qw.length)||(qw.length===1&&bw.length>1))continue;
  let sc=0.7*hit/qw.length+0.3*hit/bw.length;
  if(qw.length>hit&&bw.length>hit)sc-=0.3; /* os dois têm palavra que o outro não tem: provável outra marca */
  if(qs.length&&bsz.length)sc+=qs.some(x=>bsz.includes(x))?0.12:-0.2;
  if(sc>bs){bs=sc;best=ik}}
 return bs>=0.72?best:null}
function autoMatchPhotos(){let n=0;S.products.forEach(p=>{if(p.noAuto||getImg(p))return;const ek=p.ean&&S.fotoEan&&S.fotoEan[p.ean],k=ek&&imgCache.has(ek)?ek:findPhotoByName(p);if(k){p.imgAlias=k;p.autoFoto=true;n++}});return n}
function missingPhotos(){return S.products.filter(p=>!getImg(p))}
function openFill(i=0){
 const miss=missingPhotos();if(!miss.length){closeModal();toast('Todos os produtos já têm foto ✓');return}
 const p=miss[Math.min(i,miss.length-1)],q=((p.desc||'')+' png fundo branco').trim();photoFor=p;photoBack=null;
 modal(`<h3>Completar fotos</h3><p class="hint" style="margin-top:-6px">Faltam <b>${miss.length}</b>. Agora: <b style="color:#16181d;font-size:15px">${esc(p.desc||'(sem nome)')}</b></p>
 <div class="bar"><a class="btn pri" id="fGo" href="${gImg(q)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir no Google ↗</a><button class="btn" id="fPc">Do computador</button><button class="btn ghost" id="fSkip">Pular</button></div>
 <p class="hint">No Google: botão direito na foto → <b>Copiar imagem</b>. Volte e cole aqui (Ctrl+V). O app tira o fundo, ajusta e passa para o próximo sozinho.</p>
 <textarea id="pasteZone" class="pasteZone" placeholder="Cole a imagem aqui (Ctrl+V)"></textarea>
 <label class="chk2"><input type="checkbox" id="wWhite" checked> Tirar o fundo branco automaticamente</label>
 <div class="mfoot"><button class="btn" data-a="x">Fechar</button></div>`,b=>{
  b.querySelector('[data-a=x]').onclick=()=>{photoFor=null;closeModal()};
  $('#fSkip').onclick=()=>openFill(i+1);
  $('#fPc').onclick=()=>{pickTarget=p;fillAfterFile=()=>openFill(i);$('#fileIn').click()};
  const pz=$('#pasteZone');setTimeout(()=>pz.focus(),40);pz.ondragover=e=>e.preventDefault();
  pz.ondrop=e=>{e.preventDefault();const f=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(f)usePasted(f,p,undefined,()=>openFill(i));else toast('Arrastar da internet não funciona aqui. Use Copiar imagem e cole.',4000)};
  pz.oninput=()=>{if(pz.value.trim()){pz.value='';toast('Veio só o endereço. No Google use "Copiar imagem".',4500)}};
  FILL_NEXT=()=>openFill(i)})}
let FILL_NEXT=null,fillAfterFile=null;

/* ================= UI: campanhas ================= */
function renderCamps(){modBtn();renderHeadBox();
 const el=$('#camps');el.innerHTML=S.campaigns.map(c=>`<div class="chip ${c.id===S.campaignId?'on':''}" data-id="${c.id}"><span class="dot" style="background:${c.cores.fundo}"></span><span class="dot" style="background:${c.cores.cabecalho}"></span>${esc(c.nome)}</div>`).join('');
 el.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>{S.campaignId=ch.dataset.id;renderCamps();changed(false)});
 const c=camp();
 $('#cform').innerHTML=`<div class="row2"><label>Nome da campanha<input data-k="nome" value="${esc(c.nome)}"></label>
 <label>Dia da semana<select data-k="dia"><option value="-1">Qualquer dia</option>${DAYS.map((d,i)=>`<option value="${i}" ${+c.dia===i?'selected':''}>${d}</option>`).join('')}</select></label></div>
 <div class="row2"><label>Título no encarte<input data-k="titulo" value="${esc(c.titulo)}"></label>
 <label>Fundo<select data-k="tema"><option value="">Cor lisa com listras</option><option value="fogo" ${c.tema==='fogo'?'selected':''}>Fogo (Dia D, churrasco)</option></select></label></div>
 <label>Validade do encarte<select data-k="validPos"><option value="">No cabeçalho, embaixo do título</option><option value="rodape" ${c.validPos==='rodape'?'selected':''}>No rodapé (cabeçalho livre para a arte)</option></select></label>
 <label>Estilo dos produtos<select data-k="estilo"><option value="">Cartões brancos</option><option value="vitrine" ${c.estilo==='vitrine'?'selected':''}>Vitrine: produto solto no fundo, etiqueta de preço (estilo grande rede)</option></select></label>
 <label>Fundo dos produtos em destaque<select data-k="destFundo">${DEST_FUNDOS.map(([v,t])=>`<option value="${v}" ${(c.destFundo||"raios")===v?"selected":""}>${t}</option>`).join("")}</select></label>
 <label>Desenhos no fundo<select data-k="motivo">${Object.entries(MOTIF_NOMES).map(([k,v])=>`<option value="${k}" ${(c.motivo||'')===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <div class="colors">${Object.keys(COLOR_LABELS).map(k=>`<label>${COLOR_LABELS[k]}<input type="color" data-c="${k}" value="${c.cores[k]}"></label>`).join('')}</div>
 <p class="hint">Abrindo o app no dia marcado, a campanha já vem selecionada.</p>`;
 $('#cform').querySelectorAll('[data-k]').forEach(i=>i.addEventListener(i.tagName==='SELECT'?'change':'input',()=>{c[i.dataset.k]=i.dataset.k==='dia'?+i.value:i.value;if(i.dataset.k==='nome')renderCampsChipsOnly();changed(false)}));
 $('#cform').querySelectorAll('[data-c]').forEach(i=>i.addEventListener('input',()=>{c.cores[i.dataset.c]=i.value;renderCampsChipsOnly();changed(false)}));renderArt()}
function renderCampsChipsOnly(){const el=$('#camps');el.querySelectorAll('.chip').forEach(ch=>{const c=S.campaigns.find(x=>x.id===ch.dataset.id);if(!c)return;const d=ch.querySelectorAll('.dot');d[0].style.background=c.cores.fundo;d[1].style.background=c.cores.cabecalho;ch.lastChild.textContent=c.nome})}
$('#newC').onclick=()=>{let vis='app';
 modal(`<h3>Nova campanha</h3>
 <label>Nome da campanha<input id="ncN" placeholder="Ex.: Festival do Churrasco"></label>
 <div class="row2"><label>Dia da semana<select id="ncD"><option value="-1">Qualquer dia</option>${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label>
 <label>Formato principal<select id="ncF">${Object.entries(FORMATS).map(([k,f])=>`<option value="${k}" ${k===S.format?'selected':''}>${f.label} • ${f.w}×${f.h}</option>`).join('')}</select></label></div>
 <label>Visual</label><div class="seg2" id="ncV"><button data-v="app" class="on">Cores do app</button><button data-v="ps">Arte própria (Photoshop)</button></div>
 <p class="hint" id="ncH" style="margin-top:8px">Começa com as cores da campanha atual. Você troca as cores depois em "Título, dia e cores".</p>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Criar campanha</button></div>`,b=>{
  b.querySelectorAll('#ncV button').forEach(x=>x.onclick=()=>{vis=x.dataset.v;b.querySelectorAll('#ncV button').forEach(y=>y.classList.toggle('on',y===x));$('#ncH').textContent=vis==='ps'?'Depois de criar, você baixa o kit do Photoshop (PSD com as áreas tracejadas), monta seu tema e sobe a arte pronta. Dá pra reaproveitar o mesmo cabeçalho em várias ações.':'Começa com as cores da campanha atual. Você troca as cores depois em "Título, dia e cores".'});
  setTimeout(()=>$('#ncN').focus(),40);b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=()=>{const nome=$('#ncN').value.trim()||'Nova campanha',fk=$('#ncF').value;
   const n=Object.assign(clone(camp()),{id:uid(),nome,titulo:nome,dia:+$('#ncD').value,artOpt:undefined,cab:undefined,rod:undefined});S.campaigns.push(n);S.campaignId=n.id;S.format=fk;S.page=0;
   renderFormats();renderCamps();changed(false);
   if(vis==='ps'){const f=FORMATS[fk];modal(`<h3>${esc(nome)} criada</h3><p>Agora monte o tema no Photoshop:</p>
    <ol class="hint" style="padding-left:18px"><li>Baixe o kit: um .zip com o PSD de ${f.w}×${f.h} px, as áreas tracejadas e as guias.</li><li>Crie fundo e cabeçalho fora das áreas reservadas.</li><li>Esconda o grupo GUIAS, exporte PNG e suba aqui.</li></ol>
    <div class="mfoot"><button class="btn" data-a="x">Fazer depois</button><button class="btn" data-a="up">Subir arte pronta</button><button class="btn pri" data-a="kit">Baixar kit Photoshop</button></div>`,b2=>{
     b2.querySelector('[data-a=x]').onclick=closeModal;b2.querySelector('[data-a=up]').onclick=()=>{closeModal();pickFor({art:true})};b2.querySelector('[data-a=kit]').onclick=()=>exportKit(fk)});
    document.querySelector('#tabs [data-t=camp]').click();const d=$('#artBox').closest('details');if(d)d.open=true}
   else{closeModal();toast('Campanha criada')}}})};
$('#dupC').onclick=()=>{const c=camp(),n=Object.assign(clone(c),{id:uid(),nome:c.nome+' (cópia)',dia:-1});S.campaigns.push(n);S.campaignId=n.id;renderCamps();changed(false)};
$('#delC').onclick=()=>{if(S.campaigns.length<2){toast('Precisa ter pelo menos uma campanha');return}const c=camp();modal(`<h3>Excluir "${esc(c.nome)}"?</h3><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Excluir</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{S.campaigns=S.campaigns.filter(x=>x!==c);S.campaignId=S.campaigns[0].id;closeModal();renderCamps();changed(false)}})};
$('#vIni').oninput=e=>{S.val.ini=e.target.value;if(S.val.fim&&S.val.fim<S.val.ini){S.val.fim=S.val.ini;$('#vFim').value=S.val.fim}changed(false)};
$('#vFim').oninput=e=>{S.val.fim=e.target.value;changed(false)};
$('#phr').oninput=e=>{S.phrases=e.target.value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean);persist()};

/* ================= arte própria (Photoshop) ================= */
function artOpt(cp){const o=Object.assign({band:false,logos:true,title:true,valid:true,rodape:'full'},cp.artOpt||{});if(!cp.artOpt){if(cp.cab===false)o.logos=o.title=o.valid=false;if(cp.rod===false)o.rodape='none'}return o}
function renderArt(){
 const el=$('#artBox');if(!el)return;const cp=camp(),fk=S.format,f=FORMATS[fk],has=artCache.has(artKey(cp.id,fk)),o=artOpt(cp);
 el.innerHTML=`<p class="hint"><b>Como funciona:</b> 1) baixe o kit do Photoshop, que vem com as áreas tracejadas; 2) crie seu fundo e seu cabeçalho fora das áreas reservadas; 3) esconda o grupo GUIAS, exporte em PNG e suba aqui. O tamanho padrão do ${f.label} é <b>${f.w} × ${f.h} px</b>.</p>
 <p>${has?`<span class="ok">✓ Arte enviada</span> para ${esc(cp.nome)} • ${f.label}`:`Sem arte própria para ${esc(cp.nome)} • ${f.label}. Usando o visual do app.`}</p>
 <div class="bar"><button class="btn sm dark" id="artKit">Baixar kit Photoshop (.psd)</button><button class="btn sm pri" id="artUp">${has?'Trocar arte':'Subir arte pronta'}</button>${has?'<button class="btn sm" id="artRm">Remover</button>':''}</div>
 <button class="btn sm ghost" id="artMolde">Baixar só o guia em PNG</button>
 ${has?`<h4>O que o app escreve por cima da sua arte</h4>
 <label class="chk2"><input type="checkbox" data-o="logos" ${o.logos?'checked':''}> Logomarcas</label>
 <label class="chk2"><input type="checkbox" data-o="title" ${o.title?'checked':''}> Título da campanha (desmarque se o título já está na arte)</label>
 <label class="chk2"><input type="checkbox" data-o="valid" ${o.valid?'checked':''}> Faixa de validade com a data</label>
 <label class="chk2"><input type="checkbox" data-o="band" ${o.band?'checked':''}> Fundo colorido do cabeçalho do app</label>
 <label>Produtos nesta arte<select id="artCards"><option value="1" ${cp.cards!==false?'selected':''}>Com cartão branco atrás de cada produto</option><option value="0" ${cp.cards===false?'selected':''}>Direto no fundo da arte (cartão invisível)</option></select></label>
 <label>Rodapé<select id="artRod"><option value="full" ${o.rodape==='full'?'selected':''}>Rodapé automático completo (faixa + textos)</option><option value="text" ${o.rodape==='text'?'selected':''}>Só os textos, por cima da minha arte</option><option value="none" ${o.rodape==='none'?'selected':''}>Nenhum, o rodapé está na arte</option></select></label>`:''}`;
 $('#artUp').onclick=()=>pickFor({art:true});$('#artMolde').onclick=exportMolde;$('#artKit').onclick=()=>exportKit(fk);
 const rm=$('#artRm');if(rm)rm.onclick=async()=>{const k=artKey(cp.id,fk);artCache.delete(k);await IDB.del(k);renderArt();schedule()};
 el.querySelectorAll('[data-o]').forEach(x=>x.onchange=()=>{cp.artOpt=Object.assign(artOpt(cp),{[x.dataset.o]:x.checked});changed(false)});
 const ro=$('#artRod');if(ro)ro.onchange=()=>{cp.artOpt=Object.assign(artOpt(cp),{rodape:ro.value});changed(false)};
 const ac=$('#artCards');if(ac)ac.onchange=()=>{cp.cards=ac.value==='1';changed(false);if(!cp.cards)offerWhiteAll()}}
async function removeWhiteAll(){const ps=S.products.filter(p=>imgCache.has(imgKey(p)));for(let i=0;i<ps.length;i++){toast(`Tirando o fundo branco ${i+1}/${ps.length}…`,6000);try{await setImage(ps[i],await processImage(imgCache.get(imgKey(ps[i])).url,true))}catch(e){}}toast('Fundos brancos removidos')}
function offerWhiteAll(){const n=S.products.filter(p=>imgCache.has(imgKey(p))).length;if(!n)return;
 modal(`<h3>Tirar o fundo branco das fotos?</h3><p>Sem o cartão branco, foto com fundo branco aparece como um quadrado em cima da sua arte. Posso tirar o fundo branco das ${n} fotos agora. Fundo colorido não sai.</p>
 <div class="mfoot"><button class="btn" data-a="n">Agora não</button><button class="btn pri" data-a="y">Tirar o fundo de todas</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{closeModal();removeWhiteAll()}})}
function askCards(cp){
 modal(`<h3>Como os produtos ficam nesta arte?</h3><p class="hint">Fica salvo na campanha "${esc(cp.nome)}". Dá pra mudar depois em Campanha > Arte própria.</p>
 <div class="row2"><button class="btn bigc" data-v="1"><b>▣</b>Com cartão branco<br><small style="font-weight:500;color:#666">cada produto num quadrado branco</small></button>
 <button class="btn bigc" data-v="0"><b>⬚</b>Direto no fundo<br><small style="font-weight:500;color:#666">cartão invisível: aparece seu fundo (fogo, cores, etc.)</small></button></div>`,b=>{
  b.querySelectorAll('[data-v]').forEach(x=>x.onclick=()=>{cp.cards=x.dataset.v==='1';changed(false);renderArt();if(cp.cards)closeModal();else offerWhiteAll();if(!cp.cards&&!S.products.some(p=>imgCache.has(imgKey(p))))closeModal()})})}
const libP={};
function loadLib(url,glob){if(window[glob])return Promise.resolve(window[glob]);if(!libP[url])libP[url]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=()=>window[glob]?res(window[glob]):rej(new Error('lib'));s.onerror=()=>{delete libP[url];rej(new Error('lib'))};document.head.appendChild(s)});return libP[url]}
function guideLayers(fk){
 const f=FORMATS[fk],W=f.w,H=f.h,A=areaOf(W,H),Z=headerZones(W,A.hh),cp=camp(),C=cp.cores;
 const mk=draw=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');draw(x);return c};
 const box=(x,r,t,fill,stroke,sub)=>{x.fillStyle=fill;x.fillRect(r.x,r.y,r.w,r.h);x.strokeStyle=stroke;x.lineWidth=Math.max(3,W*0.003);x.setLineDash([W*0.012,W*0.008]);x.strokeRect(r.x,r.y,r.w,r.h);x.setLineDash([]);
  const s=fitLine(x,t,r.w*0.9,Math.min(r.h*0.3,W*0.032),z=>O(z,700));x.font=O(s,700);x.fillStyle=stroke;x.textAlign='center';x.textBaseline='middle';x.fillText(t,r.x+r.w/2,r.y+r.h/2-(sub?s*0.45:0));
  if(sub){const s2=fitLine(x,sub,r.w*0.9,s*0.55,z=>`500 ${z}px Inter, sans-serif`);x.font=`500 ${s2}px Inter, sans-serif`;x.fillText(sub,r.x+r.w/2,r.y+r.h/2+s*0.55)}};
 const prod={x:A.ax,y:A.top,w:A.aw,h:A.ah},foot={x:0,y:H-A.fh,w:W,h:A.fh};
 const L={
  fundo:mk(x=>{drawBg(x,W,H,C)}),
  logos:mk(x=>{[Z.logo1,Z.logo2].forEach((r,i)=>{if(r)box(x,r,'LOGO '+(i+1),'rgba(0,140,255,.2)','#0a58c9','o app coloca')})}),
  titulo:mk(x=>{box(x,Z.title,'TÍTULO DA CAMPANHA','rgba(0,170,90,.18)','#0b7a3e','o app escreve, ou desligue e faça o seu');box(x,Z.band,'FAIXA DE VALIDADE (DATA)','rgba(255,170,0,.25)','#a35a00','o app escreve a data')}),
  produtos:mk(x=>box(x,prod,'ÁREA DOS PRODUTOS','rgba(255,0,140,.14)','#c2006b','não coloque nada aqui: os produtos entram por cima')),
  rodape:mk(x=>{box(x,foot,'RODAPÉ AUTOMÁTICO','rgba(120,0,255,.16)','#5b10b8','QR Code do WhatsApp, endereços e validade');}),
  exemplo:mk(x=>{drawHeader(x,W,H,A.hh,C,cp,{band:false,logos:true,title:true,valid:true});drawFooter(x,W,H,A.fh,C,'text')}),
 };
 const guides=[A.hh,A.top,A.top+A.ah,H-A.fh].map(v=>({location:Math.round(v),direction:'horizontal'})).concat([A.ax,A.ax+A.aw,Z.title.x].map(v=>({location:Math.round(v),direction:'vertical'})));
 return{W,H,L,guides,A}}
async function exportKit(fk){
 toast('Montando o kit do Photoshop…',4000);await fontsReady();
 let ag,JSZip;try{[ag,JSZip]=await Promise.all([loadLib('/vendor/ag-psd-34.1.0.js','agPsd'),loadLib('/vendor/jszip-3.10.1.min.js','JSZip')])}catch(e){toast('Não consegui carregar o gerador de PSD. Verifique a internet e tente de novo.');return}
 const f=FORMATS[fk],G=guideLayers(fk),{W,H,L}=G;
 const comp=document.createElement('canvas');comp.width=W;comp.height=H;const cx=comp.getContext('2d');['fundo','produtos','logos','titulo','rodape'].forEach(k=>cx.drawImage(L[k],0,0));
 const psd={width:W,height:H,canvas:comp,imageResources:{resolutionInfo:{horizontalResolution:72,horizontalResolutionUnit:'PPI',widthUnit:'Inches',verticalResolution:72,verticalResolutionUnit:'PPI',heightUnit:'Inches'},gridAndGuidesInformation:{grid:{horizontal:576,vertical:576},guides:G.guides}},
  children:[
   {name:'Seu fundo (pinte, troque, coloque fotos aqui)',canvas:L.fundo},
   {name:'Seu cabeçalho e enfeites (fora das áreas tracejadas)',canvas:(()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c})()},
   {name:'GUIAS — esconda antes de exportar',opened:true,children:[
    {name:'Exemplo do que o app escreve (ligue para conferir)',canvas:L.exemplo,hidden:true},
    {name:'Área dos produtos',canvas:L.produtos},
    {name:'Rodapé automático',canvas:L.rodape},
    {name:'Título e validade',canvas:L.titulo},
    {name:'Logos',canvas:L.logos}]}]};
 let buf;try{buf=ag.writePsd(psd,{generateThumbnail:true})}catch(e){toast('Erro ao gerar o PSD');return}
 const zip=new JSZip(),base=`kit_${slug(camp().nome)}_${fk}_${W}x${H}`;
 zip.file(base+'.psd',buf);zip.file(base+'_guia.png',await toBlob(comp));
 zip.file('LEIA-ME.txt',`KIT PHOTOSHOP • ${camp().nome} • ${f.label} (${W} x ${H} px)\r\n\r\n1. Abra o arquivo .psd no Photoshop.\r\n2. Crie seu fundo na camada "Seu fundo" e seu cabeçalho/enfeites na camada de cima.\r\n3. Não coloque nada importante dentro das áreas tracejadas:\r\n   - LOGO 1 e LOGO 2: o app coloca suas logomarcas.\r\n   - TÍTULO e FAIXA DE VALIDADE: o app escreve (pode desligar o título se ele já estiver na sua arte).\r\n   - ÁREA DOS PRODUTOS: os produtos entram por cima.\r\n   - RODAPÉ AUTOMÁTICO: WhatsApp, QR Code, endereços e validade.\r\n4. Esconda o grupo "GUIAS" e exporte em PNG (Arquivo > Exportar > Exportação rápida como PNG), no mesmo tamanho.\r\n5. No app: aba Campanha > Arte própria do Photoshop > Subir arte pronta.\r\n\r\nAs linhas-guia azuis do Photoshop (Exibir > Mostrar > Guias) marcam as bordas de cada área.\r\n`);
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
 saveFile(base+'.zip',blob,'zip')}
async function setArt(file){
 const cp=camp(),fk=S.format,f=FORMATS[fk],u=await fileToURL(file);let img;try{img=await loadImg(u)}catch(e){toast('Não consegui abrir essa imagem. Exporte do Photoshop como PNG ou JPG.');return}
 const k=artKey(cp.id,fk);artCache.set(k,{img,url:u});await IDB.set(k,u);renderArt();schedule();
 const diff=Math.abs(img.width/img.height-f.w/f.h)/(f.w/f.h);
 toast(diff>0.03?`Arte com ${img.width}×${img.height}: o ideal é ${f.w}×${f.h}. Cortei as sobras para caber.`:'Arte de fundo aplicada',4500);askCards(cp)}
async function exportMolde(){
 await fontsReady();const fk=S.format,f=FORMATS[fk],{P}=pageInfo(),pg=P[S.page],A=areaOf(f.w,f.h);
 const c=document.createElement('canvas');c.width=f.w;c.height=f.h;const x=c.getContext('2d');
 const lab=(t,rx,ry,rw,rh,fill,stroke)=>{x.fillStyle=fill;x.fillRect(rx,ry,rw,rh);x.strokeStyle=stroke;x.lineWidth=Math.max(3,f.w*0.003);x.setLineDash([f.w*0.012,f.w*0.008]);x.strokeRect(rx,ry,rw,rh);x.setLineDash([]);
  const s=fitLine(x,t,rw*0.85,Math.min(rh*0.22,f.w*0.035),z=>O(z,700));x.font=O(s,700);x.fillStyle=stroke;x.textAlign='center';x.textBaseline='middle';x.fillText(t,rx+rw/2,ry+rh/2)};
 lab('CABEÇALHO DO APP (logos + título + validade)',0,0,f.w,A.hh,'rgba(0,120,255,.18)','#0b5bd3');
 lab('RODAPÉ DO APP (WhatsApp, QR Code, endereços)',0,f.h-A.fh,f.w,A.fh,'rgba(0,120,255,.18)','#0b5bd3');
 let sl;if(pg.lay.sec){const o=sectionSlots(pg.items,pg.lay,A);o.strips.forEach(st=>lab('FAIXA: '+st.nome.toUpperCase(),st.x,st.y,st.w,st.h,'rgba(255,150,0,.25)','#b35c00'));sl=o.cards}else sl=pg.lay.auto?autoSlots(pg.items.length?pg.items:[{}],A):slotsOf(pg.lay,A.ax,A.top,A.aw,A.ah,A.g);
 sl.forEach((r,i)=>lab('PRODUTO '+(i+1),r.x,r.y,r.w,r.h,'rgba(255,0,140,.22)','#c2006b'));
 saveFile(`molde_${fk}_${f.w}x${f.h}_${slug(layLabel(pg))}.png`,await toBlob(c),'img')}

/* ================= UI: loja ================= */
async function setLogo(i,f){const u=await processImage(await fileToURL(f),false,true);logos[i]={img:await loadImg(u),url:u};await IDB.set('logo'+i,u);renderLogos();schedule()}
function renderLogos(){[0,1].forEach(i=>{const el=$('#logo'+i);const L=logos[i];el.classList.toggle('has',!!L);el.style.backgroundImage=L?`url("${L.url}")`:'';el.innerHTML=L?'<button class="x">remover</button>':`Toque para enviar<br>logo ${i+1}`;
 el.onclick=()=>pickFor({logo:i});const x=el.querySelector('.x');if(x)x.onclick=async e=>{e.stopPropagation();logos[i]=null;S.store['semLogoPadrao'+i]=true;persist();await IDB.del('logo'+i);renderLogos();schedule()}})}
[['sNome','nome'],['sWa','wa'],['sEnd','ends'],['sExtra','extra'],['sFil','filial'],['sMarg','margMin'],['sMAlvo','margAlvo'],['sPin','pin']].forEach(([id,k])=>{const el=$('#'+id);el.value=S.store[k]||'';el.oninput=()=>{S.store[k]=el.value;changed(false)}});
[['oSec','secCor'],['oTinta','tinta']].forEach(([id,k])=>{const el=$('#'+id);el.checked=k==='tinta'?!!S.store[k]:S.store[k]!==false;el.onchange=()=>{S.store[k]=el.checked;changed(false)}});

/* ================= UI: salvos ================= */
function renderSaved(){const el=$('#savedList');
 if(!S.saved.length){el.innerHTML='<div class="empty">Nenhum encarte salvo ainda.</div>';return}
 el.innerHTML=S.saved.map(s=>`<div class="saved" data-id="${s.id}"><div class="n">${esc(s.name)}<small>${esc((S.campaigns.find(c=>c.id===s.campaignId)||{}).nome||'')} • ${s.products.length} produtos • salvo ${new Date(s.at).toLocaleDateString('pt-BR')}</small></div>
 <button class="btn sm dark" data-a="res">Resultado</button><button class="btn sm" data-a="open">Abrir</button><button class="btn sm" data-a="dup">Duplicar</button><button class="ico" data-a="del" title="Excluir">✕</button></div>`).join('');
 el.querySelectorAll('.saved').forEach(r=>{const s=S.saved.find(x=>x.id===r.dataset.id);
  const load=(fresh)=>{S.products=clone(s.products).map(p=>fresh?Object.assign(p,{id:p.code?p.id:p.id}):p);if(S.campaigns.some(c=>c.id===s.campaignId))S.campaignId=s.campaignId;S.format=s.format||S.format;S.val=fresh?{ini:today(),fim:today()}:clone(s.val);S.page=0;$('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim;renderFormats();renderCamps();changed();loadAllImages()};
  r.querySelector('[data-a=open]').onclick=()=>{load(false);toast('Encarte aberto')};
  r.querySelector('[data-a=res]').onclick=()=>openResult(s);
  r.querySelector('[data-a=dup]').onclick=()=>{load(true);$('#saveName').value=s.name+' (nova)';toast('Cópia aberta com validade de hoje. Atualize os preços e salve.',4000)};
  r.querySelector('[data-a=del]').onclick=()=>modal(`<h3>Tem certeza?</h3><p>O encarte salvo "${esc(s.name)}" vai ser apagado.</p><div class="mfoot"><button class="btn" data-a="n">Não</button><button class="btn pri" data-a="y">Sim, apagar</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{closeModal();S.saved=S.saved.filter(x=>x!==s);cloudDelEnc(s.id);renderSaved();persist()}})})}
$('#saveB').onclick=()=>{const name=$('#saveName').value.trim()||`${camp().nome} ${fmtD(S.val.ini)}`;const ex=S.saved.find(s=>s.name===name);const rec={id:ex?ex.id:uid(),name,at:Date.now(),campaignId:S.campaignId,format:S.format,val:clone(S.val),products:clone(S.products)};
 if(ex)Object.assign(ex,rec);else S.saved.unshift(rec);renderSaved();persist();cloudSaveEnc(ex||rec);toast(ex?'Encarte atualizado':'Encarte salvo')};

/* ================= modal, abas ================= */
function modal(html,mount){FILL_NEXT=null;$('#mbody').classList.remove('wide');const sd=!!editingId;$('#modal').classList.toggle('side',sd);$('#modal').classList.toggle('r',sd&&inWz());$('#modal').classList.toggle('l',sd&&!inWz());$('#mbody').innerHTML=html;$('#modal').hidden=false;mount&&mount($('#mbody'))}
function closeModal(){$('#modal').hidden=true;editingId=null}
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#tv').hidden)closeTV();else closeModal()}});
$('#tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#tabs .on').classList.remove('on');b.classList.add('on');document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.id==='t-'+b.dataset.t))});

/* ================= downloads ================= */
let dlP=null;function getDL(){if(!dlP)dlP=(async()=>{try{return window.claude&&window.claude.use?await window.claude.use('downloads'):null}catch(e){return null}})();return dlP}
setTimeout(getDL,800);
const slug=s=>norm(String(s).replace(/\s+/g,'-')).slice(0,30)||'encarte';
function fname(ext,suf=''){return[slug(camp().nome),S.store.nome?slug(S.store.nome):'',(S.val.ini||today()).split('-').reverse().slice(0,2).join('-')].filter(Boolean).join('_')+suf+'.'+ext}
/* abre a tela de compartilhar do aparelho (WhatsApp aparece nela) com o arquivo anexado; se o aparelho não deixar, baixa */
async function sendWpp(name,blob,kind){const files=[new File([blob],name,{type:blob.type||'application/pdf'})];
 try{if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title:name});return true}}catch(e){if(e&&e.name==='AbortError')return false}
 toast('Este aparelho não deixou compartilhar direto. Vou baixar o PDF para você mandar.',4500);return saveFile(name,blob,kind)}
async function saveFile(name,blob,kind){
 const dl=await getDL();
 if(dl){try{await dl.save({filename:name,data:blob});toast('Arquivo pronto: '+name);return true}catch(e){const c=e&&e.code;if(c==='declined'){toast('Download cancelado');return false}if(c==='rate_limited'){toast('Já tem um download esperando confirmação');return false}}}
 const url=URL.createObjectURL(blob);
 if(window.TINO){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Arquivo baixado: '+name);return true}
 modal(`<h3>Seu arquivo</h3>${kind==='img'?`<img src="${url}" style="width:100%;border-radius:8px"><p class="hint">Toque e segure a imagem (celular) ou clique com o botão direito para salvar.</p>`:kind==='video'?`<video src="${url}" controls style="width:100%;border-radius:8px"></video><p class="hint">Use o menu do vídeo para baixar.</p>`:'<p class="hint">Aqui o download direto não está disponível. Abra este app pelo claude.ai para baixar o arquivo.</p>'}<div class="mfoot"><button class="btn pri" data-a="x">Fechar</button></div>`,b=>b.querySelector('[data-a=x]').onclick=closeModal);return false}
const toBlob=(c,t='image/png',q)=>new Promise(r=>c.toBlob(r,t,q));
async function fontsReady(){try{await Promise.all([document.fonts.load('100px Anton'),document.fonts.load('700 50px Oswald'),document.fonts.load('600 50px Oswald'),document.fonts.load('500 50px Oswald'),document.fonts.load('500 20px Inter')])}catch(e){}}

$('#bPng').onclick=async()=>{
 await fontsReady();const f=FORMATS[S.format],{P,n}=pageInfo();if(!await reviewGate(S.products))return;
 for(let pg=0;pg<n;pg++){const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,P[pg].items,camp(),[],P[pg].lay);
  const ok=await saveFile(fname('png',(S.format!=='insta'?'_'+S.format:'')+(n>1?`_arte${pg+1}`:'')),await toBlob(c),'img');if(!ok&&n>1)break}};
$('#bPdf').onclick=async()=>{
 const J=window.jspdf&&window.jspdf.jsPDF;if(!J){toast('A biblioteca de PDF não carregou. Recarregue a página.');return}
 await fontsReady();if(!await reviewGate(S.products))return;toast('Montando o PDF…');
 const fk=S.format==='a4h'?'a4h':'a4',land=fk==='a4h',f=FORMATS[fk],P=pagesFor(fk),n=P.length,doc=new J({unit:'mm',format:'a4',orientation:land?'landscape':'portrait'});
 for(let pg=0;pg<n;pg++){if(pg)doc.addPage();const c=hiRes(fk,P[pg],1.5);doc.addImage(c.toDataURL('image/jpeg',0.95),'JPEG',0,0,land?297:210,land?210:297,undefined,'SLOW')}
 saveFile(fname('pdf',land?'_A4_deitado':'_A4'),doc.output('blob'),'pdf')};
$('#bPlaq').onclick=()=>{const sel=S.products.filter(p=>p.sel);
 modal(`<h3>Baixar plaquinhas</h3><p><b>${sel.length}</b> de ${S.products.length} produtos marcados. Marque ou desmarque na lista de produtos.</p>
 <div class="row2"><label>Quantas por folha A4?<select id="plqPer"><option value="2" ${S.plaqPer==2?'selected':''}>2 por folha (padrão)</option><option value="1" ${S.plaqPer==1?'selected':''}>1 por folha (grande)</option></select></label>
 <label>Plaquinha<select id="plqOri"><option value="h" ${(S.plaqOri||(S.plaqPer==1?'v':'h'))==='h'?'selected':''}>Deitada (horizontal)</option><option value="v" ${(S.plaqOri||(S.plaqPer==1?'v':'h'))==='v'?'selected':''}>Em pé (vertical)</option></select></label></div>
 <p class="hint">Cada plaquinha tem uma faixa de 3 cm em cima, com linha tracejada, para dobrar e prender no suporte da gôndola.</p>
 <p class="hint" style="margin:6px 0 4px">Prévia da folha A4 como sai na impressora:</p><canvas id="plqPrev" style="width:100%;box-shadow:0 2px 10px #0003"></canvas>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn" data-a="w" ${sel.length?'':'disabled'}>Compartilhar</button><button class="btn pri" data-a="y" ${sel.length?'':'disabled'}>Baixar PDF</button></div>`,b=>{
  const prev=async()=>{await fontsReady();const per=+$('#plqPer').value,d=plaqDims(per,$('#plqOri').value),cv=$('#plqPrev'),PX=3,pw=d.page==='portrait'?210:297,ph=d.page==='portrait'?297:210;
   /* prévia da folha A4 inteira, como sai da impressora */
   cv.width=pw*PX;cv.height=ph*PX;cv.style.width=pw>ph?'100%':'60%';cv.style.display='block';cv.style.margin='0 auto';const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
   d.pos.forEach(([px,py],k)=>{const p=sel[k];const t=document.createElement('canvas');t.width=Math.round(d.w*PX);t.height=Math.round(d.h*PX);const tx=t.getContext('2d');
    if(p)renderPlaque(tx,t.width,t.height,p,camp(),30*PX);else{tx.fillStyle='#f6f4ef';tx.fillRect(0,0,t.width,t.height);tx.fillStyle='#999';tx.font='600 22px Inter,sans-serif';tx.textAlign='center';tx.fillText('2ª plaquinha (marque mais um produto)',t.width/2,t.height/2)}
    x.drawImage(t,px*PX,py*PX)});
   if(d.cut){x.strokeStyle='#888';x.lineWidth=2;x.setLineDash([9,6]);x.beginPath();x.moveTo(d.cut[0]*PX,d.cut[1]*PX);x.lineTo(d.cut[2]*PX,d.cut[3]*PX);x.stroke();x.setLineDash([])}
   x.strokeStyle='#bbb';x.lineWidth=2;x.strokeRect(1,1,cv.width-2,cv.height-2)};prev();
  $('#plqPer').onchange=()=>{S.plaqPer=+$('#plqPer').value;persist();prev()};$('#plqOri').onchange=()=>{S.plaqOri=$('#plqOri').value;persist();prev()};
  b.querySelector('[data-a=n]').onclick=closeModal;
  const go=wpp=>async()=>{const J=window.jspdf&&window.jspdf.jsPDF;if(!J){toast('A biblioteca de PDF não carregou');return}
   const per=+$('#plqPer').value||2,ori=$('#plqOri').value;S.plaqPer=per;S.plaqOri=ori;persist();closeModal();toast('Montando as plaquinhas…');await fontsReady();
   (wpp?sendWpp:saveFile)(fname('pdf','_plaquinhas'),plaqDoc(sel,per,ori),'pdf')};
  b.querySelector('[data-a=y]').onclick=go(false);b.querySelector('[data-a=w]').onclick=go(true)})};

/* ================= Modo TV ================= */
let tvRaf=null,idleT;
function openTV(pub){
 if(!S.products.length&&!pub){toast('Adicione produtos primeiro');return}
 cancelAnimationFrame(tvRaf);const ov=$('#tv'),cv=$('#tvCanvas'),vert=innerHeight>innerWidth*1.1;cv.width=vert?1080:1920;cv.height=vert?1920:1080;ov.hidden=false;const ctx=cv.getContext('2d'),t0=performance.now();
 if(pub&&tvCfg().modo==='enc'){const fk=vert?'story':'tv',f=FORMATS[fk],P=pagesFor(fk),sec=tvCfg().sec,frames=P.map(pg=>{const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,pg.items,camp(),[],pg.lay);return c});
  const loop=now=>{const t=(now-t0)/1000,k=Math.floor(t/sec)%frames.length,lt=t%sec;ctx.fillStyle='#000';ctx.fillRect(0,0,cv.width,cv.height);ctx.globalAlpha=Math.min(1,lt/0.6);cover(ctx,frames[k],0,0,cv.width,cv.height);ctx.globalAlpha=1;tvRaf=requestAnimationFrame(loop)};tvRaf=requestAnimationFrame(loop);poke();return}
 if(pub)S.tvSec=tvCfg().sec;
 if(!S.products.length)return;const L=slides();
 const loop=now=>{const{s,lt}=slideAt(L,(now-t0)/1000);drawSlide(ctx,cv.width,cv.height,s,lt);tvRaf=requestAnimationFrame(loop)};tvRaf=requestAnimationFrame(loop);poke()}
function poke(){const ov=$('#tv');ov.classList.remove('idle');clearTimeout(idleT);idleT=setTimeout(()=>ov.classList.add('idle'),2500)}
function closeTV(){cancelAnimationFrame(tvRaf);clearInterval(tvPoll);$('#tv').hidden=true;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}
$('#tv').onmousemove=poke;$('#tv').ontouchstart=poke;
$('#tvOut').onclick=closeTV;
$('#tvFs').onclick=()=>{const el=$('#tv');try{(el.requestFullscreen?el.requestFullscreen():Promise.reject()).catch(()=>toast('Tela cheia não liberada aqui. Abra o app pelo navegador da TV.'))}catch(e){toast('Tela cheia não liberada aqui')}};
$('#bTv').onclick=()=>modal(`<h3>Modo TV</h3><p class="hint">Mostra um produto por vez, com foto e preço grandes, em loop. Abra este app no navegador da TV da loja e deixe rodando em tela cheia.</p>
 <label>Segundos por produto<input type="number" id="tvS" min="2" max="20" value="${S.tvSec}"></label>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Começar</button></div>`,b=>{
 b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=async()=>{S.tvSec=clamp(+$('#tvS').value||5,2,20);persist();closeModal();await fontsReady();openTV()}});

/* ================= barra de comandos ================= */
function renderCmd(n){
 const cs=$('#cbCamp');if(cs){cs.innerHTML=S.campaigns.map(c=>`<option value="${esc(c.id)}" ${c.id===camp().id?'selected':''}>${esc(c.nome)}</option>`).join('')}
 $('#cbTxt').value=S.store.txt||'grande';$('#cbRod').value=S.store.rodInv?'i':'n';$('#cbQr').checked=S.store.qr!==false;
 $('#pgTxt').textContent=`Arte ${S.page+1} de ${n}`;$('#pgPrev').disabled=S.page<=0;$('#pgNext').disabled=S.page>=n-1}
document.querySelectorAll('.dd').forEach(d=>{d.querySelector('.ddT').onclick=e=>{e.stopPropagation();const o=d.classList.contains('open');document.querySelectorAll('.dd.open').forEach(x=>x.classList.remove('open'));if(!o)d.classList.add('open')};d.querySelectorAll('.ddM button').forEach(b=>b.addEventListener('click',()=>d.classList.remove('open')))});
document.addEventListener('click',e=>{if(!e.target.closest('.dd'))document.querySelectorAll('.dd.open').forEach(x=>x.classList.remove('open'))});
$('#cbRep').onclick=repeatLast;$('#sugP').onclick=openSugest;
$('#cbCamp').onchange=e=>{S.campaignId=e.target.value;renderCamps();renderArt();changed(false)};
$('#cbTxt').onchange=e=>{S.store.txt=e.target.value;changed(false)};
$('#cbRod').onchange=e=>{S.store.rodInv=e.target.value==='i';changed(false)};
$('#cbQr').onchange=e=>{S.store.qr=e.target.checked;if(e.target.checked&&!waDigits())toast('Coloque o WhatsApp na aba Loja para o QR aparecer',4000);changed(false)};
$('#pgPrev').onclick=()=>{if(S.page>0){S.page--;changed(false)}};
$('#pgNext').onclick=()=>{S.page++;changed(false)};
document.querySelectorAll('#lvMode button').forEach(b=>b.onclick=()=>{S.listMode=b.dataset.v;changed()});
/* modelos com prévia: troca o formato sem perder nada */
$('#cbModel').onclick=async()=>{await fontsReady();
 modal(`<h3>Modelos</h3><p class="hint">Mesmos produtos, mesma campanha. Toque para trocar, nada se perde.</p><div class="mGrid">${Object.entries(FORMATS).map(([k,f])=>`<button data-f="${k}" class="${k===S.format?'on':''}"><canvas data-c="${k}"></canvas>${esc(f.label)}<small style="font-weight:500;color:var(--mut)">${f.w}×${f.h} • até ${f.limit} por arte</small></button>`).join('')}</div>
 <div class="mfoot"><button class="btn" data-a="n">Fechar</button></div>`,b=>{b.classList.add('wide');
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelectorAll('.mGrid button').forEach(bt=>bt.onclick=()=>{S.format=bt.dataset.f;S.page=0;renderFormats();renderArt();closeModal();changed()});
  let i=0;const ks=Object.keys(FORMATS);const step=()=>{if(i>=ks.length||$('#modal').hidden)return;const k=ks[i++],f=FORMATS[k],cv=b.querySelector(`canvas[data-c="${k}"]`);if(!cv)return;
   const big=document.createElement('canvas');big.width=f.w;big.height=f.h;const pg=pagesFor(k)[0];renderFlyer(big.getContext('2d'),f.w,f.h,pg.items,camp(),[],pg.lay);
   const sc=Math.min(300/f.w,340/f.h);cv.width=Math.round(f.w*sc);cv.height=Math.round(f.h*sc);cv.getContext('2d').drawImage(big,0,0,cv.width,cv.height);setTimeout(step,10)};setTimeout(step,30)})};
/* publicar na TV: a TV da loja abre este app uma vez, vira "tela de TV" e passa a atualizar sozinha */
const TVKEY='encartes-esta-tela-e-tv';
function tvCfg(){return Object.assign({modo:'prod',sec:S.tvSec||5},S.tvPub||{})}
$('#cbTv').onclick=()=>{const t=tvCfg(),souTV=(()=>{try{return localStorage.getItem(TVKEY)==='1'}catch(e){return false}})();
 modal(`<h3>Publicar na TV</h3>
 <label>O que passa na TV<select id="tpM"><option value="prod" ${t.modo==='prod'?'selected':''}>Um produto por vez, grande (recomendado)</option><option value="enc" ${t.modo==='enc'?'selected':''}>O encarte inteiro, arte por arte</option></select></label>
 <label>Segundos por tela<input type="number" id="tpS" min="3" max="30" value="${t.sec}"></label>
 <p class="hint"><b>Como ligar a TV da loja (uma vez só):</b> no navegador da TV ou do computador ligado nela, entre na sua conta Claude, abra este app e toque em <b>"Esta tela é a TV da loja"</b>. A partir daí ela abre direto no modo TV e busca o encarte novo na nuvem a cada 2 minutos. Você muda o preço aqui, a TV atualiza sozinha.</p>
 <div class="mfoot"><button class="btn l" data-a="me">${souTV?'Esta tela deixou de ser TV':'Esta tela é a TV da loja'}</button><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Publicar</button></div>`,b=>{
  const save=()=>{S.tvPub={modo:$('#tpM').value,sec:clamp(+$('#tpS').value||5,3,30),at:Date.now()};S.tvSec=S.tvPub.sec;changed(false);if(CLOUD.on)cloudQueue(async()=>{try{await CLOUD.db.doc('app/tv').set({at:Date.now(),data:JSON.stringify({products:S.products,val:S.val,artes:S.artes,campaignId:S.campaignId,tvPub:S.tvPub,tvSec:S.tvSec})})}catch(e){toast('Não consegui publicar na nuvem')}})};
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=()=>{save();closeModal();toast(CLOUD.on?'Publicado. A TV atualiza em até 2 minutos.':'Salvo, mas a nuvem está desligada: a TV não vai receber.',4500)};
  b.querySelector('[data-a=me]').onclick=async()=>{try{if(souTV){localStorage.removeItem(TVKEY);closeModal();toast('Esta tela voltou ao normal')}else{save();localStorage.setItem(TVKEY,'1');closeModal();await fontsReady();startTvScreen()}}catch(e){toast('Este navegador não deixou guardar a opção')}}})};
let tvPoll=null;
function startTvScreen(){clearInterval(tvPoll);
 const pull=async(first)=>{if(!CLOUD.db)return;try{const st=await CLOUD.db.doc('app/tv').get();const r=st.exists?st.data():null;if(r&&(r.at||0)>(S.tvAt||0)){Object.assign(S,JSON.parse(r.data));S.tvAt=r.at;await cloudSyncImages();await loadAllImages();openTV(true)}else if(first)openTV(true)}catch(e){if(first)openTV(true)}};
 tvPoll=setInterval(()=>pull(false),120000);pull(true)}
/* ================= vídeo ================= */
$('#bVid').onclick=()=>{
 const ok=typeof MediaRecorder!=='undefined'&&HTMLCanvasElement.prototype.captureStream;
 modal(`<h3>Gerar vídeo</h3>${ok?'':'<p class="warn r">Este navegador não grava vídeo. Use o Chrome no computador.</p>'}
 <label>Formato<select id="vOr"><option value="h">Horizontal 1920×1080 (TV)</option><option value="v" ${S.vidVert?'selected':''}>Vertical 1080×1920 (status e reels)</option></select></label>
 <label>Segundos por produto<input type="number" id="vS" min="2" max="15" value="${S.tvSec}"></label>
 <p class="hint">Sai em MP4, aceito pelo WhatsApp, Instagram e TVs. Leva alguns segundos; deixe esta aba aberta até terminar.</p>
 <div class="prog" hidden id="vProg"><i></i></div>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y" ${ok&&S.products.length?'':'disabled'}>Gravar vídeo</button></div>`,b=>{
  b.querySelector('[data-a=n]').onclick=()=>{vidCancel=true;closeModal()};
  b.querySelector('[data-a=y]').onclick=async e=>{e.target.disabled=true;S.vidVert=$('#vOr').value==='v';S.tvSec=clamp(+$('#vS').value||5,2,15);persist();$('#vProg').hidden=false;
   try{const r=await recordVideo(S.vidVert,p=>{const i=$('#vProg i');if(i)i.style.width=(p*100)+'%'});closeModal();if(r)saveFile(fname(r.ext,S.vidVert?'_video_vertical':'_video_tv'),r.blob,'video')}catch(err){toast('Não consegui gravar o vídeo neste navegador');closeModal()}}})};
let vidCancel=false;
/* vídeo MP4 (H.264) gerado quadro a quadro: mais rápido que tempo real e aceito por WhatsApp, Instagram e TVs */
async function encodeMp4(vert,onP){
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')return null;
 const W=vert?1080:1920,H=vert?1920:1080,fps=30;let codec=null;
 for(const c of['avc1.640028','avc1.4d0028','avc1.42003e']){try{const r=await VideoEncoder.isConfigSupported({codec:c,width:W,height:H,bitrate:8e6,framerate:fps});if(r&&r.supported){codec=c;break}}catch(e){}}
 if(!codec)return null;
 let M;try{M=await loadLib('/vendor/mp4-muxer-5.2.2.js','Mp4Muxer')}catch(e){return null}
 vidCancel=false;await fontsReady();const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
 const L=slides(),tot=L.reduce((a,s)=>a+s.d,0),N=Math.ceil(tot*fps);
 const target=new M.ArrayBufferTarget(),mux=new M.Muxer({target,video:{codec:'avc',width:W,height:H,frameRate:fps},fastStart:'in-memory'});
 let err=null;const enc=new VideoEncoder({output:(ch,meta)=>mux.addVideoChunk(ch,meta),error:e=>{err=e}});
 enc.configure({codec,width:W,height:H,bitrate:8e6,framerate:fps,avc:{format:'avc'}});
 for(let i=0;i<N;i++){if(vidCancel||err)break;const{s,lt}=slideAt(L,i/fps);drawSlide(ctx,W,H,s,lt);
  const fr=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});enc.encode(fr,{keyFrame:i%(fps*2)===0});fr.close();
  if(enc.encodeQueueSize>6)await new Promise(r=>setTimeout(r,0));if(i%15===0){onP(i/N);await new Promise(r=>setTimeout(r,0))}}
 if(err){try{enc.close()}catch(e){}return null}
 await enc.flush();enc.close();if(vidCancel)return null;mux.finalize();onP(1);
 return{blob:new Blob([target.buffer],{type:'video/mp4'}),ext:'mp4'}}
async function recordVideo(vert,onP){
 try{const r=await encodeMp4(vert,onP);if(r||vidCancel)return r}catch(e){}
 vidCancel=false;await fontsReady();const W=vert?1080:1920,H=vert?1920:1080,cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
 const L=slides(),tot=L.reduce((a,s)=>a+s.d,0);
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m));
 const st=cv.captureStream(30),rec=new MediaRecorder(st,mime?{mimeType:mime,videoBitsPerSecond:8e6}:{}),ch=[];
 rec.ondataavailable=e=>e.data.size&&ch.push(e.data);
 const done=new Promise(r=>rec.onstop=r);
 drawSlide(ctx,W,H,L[0],0);rec.start(250);const t0=performance.now();
 await new Promise(res=>{const step=()=>{const t=(performance.now()-t0)/1000;if(vidCancel||t>=tot){res();return}const{s,lt}=slideAt(L,t);drawSlide(ctx,W,H,s,lt);onP(t/tot);setTimeout(step,1000/30)};step()});
 rec.stop();await done;st.getTracks().forEach(t=>t.stop());if(vidCancel)return null;
 const type=rec.mimeType||mime||'video/webm';return{blob:new Blob(ch,{type}),ext:type.includes('mp4')?'mp4':'webm'}}

/* ================= 1+2. ofertas sugeridas pelo StarIA ================= */
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return ymd(d)};
const margAlvo=()=>{const v=parseFloat(String(S.store.margAlvo??'12').replace(',','.'));return isFinite(v)?v/100:0.12};
const titleCase=t=>String(t||'').toLowerCase().replace(/(^|\s)(\S)/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(\d+)(Ml|L|Kg|G|Gr|Un)\b/g,(m,n,u)=>n+u.toLowerCase());
function priceEnd(v,min){const f=Math.floor(v),c=[f+0.99,f+0.49,f-0.01].filter(x=>x>0&&x<=v+1e-9).sort((a,b)=>b-a);let r=c.find(x=>x>=min-1e-9);if(r==null)r=Math.ceil((min+0.01)*10)/10-0.01;if(r<min)r=Math.round((min+0.005)*100)/100;return Math.round(r*100)/100}
function sugOffer(price,cost,code){if(!(price>0)||!(cost>0))return null;const m=margAlvo(),floor=cost/(1-m);if(floor>=price*0.97)return null;
 const h=S.ofertaHist&&S.ofertaHist[code];let v=Math.max(price*0.88,floor);if(h&&h.price>=floor&&h.price<price*0.97)v=h.price;
 const o=priceEnd(v,floor);return o<price*0.975?{o,from:h&&h.price===v?'hist':'calc'}:null}
let SUG=null;
async function openSugest(){
 modal(`<h3>Sugerir ofertas do StarIA</h3><p class="hint">Buscando os mais vendidos dos últimos 30 dias e o dinheiro parado em estoque da filial ${filial()}…</p><div class="prog"><i style="width:40%"></i></div>`,()=>{});
 try{
  const[abc,est]=await Promise.all([star('consultar_curva_abc',{dataInicial:daysAgo(30),dataFinal:daysAgo(1),filial:filial(),tipo:'VENDAS',limite:100}),
   star('consultar_estoque',{filial:filial(),ordenarPor:'VALOR_CUSTO',ordem:'DESC',situacaoEstoque:'POSITIVO',statusMercadoria:'ATIVO',agruparPor:'MERCADORIA',limite:100})]);
  const have=new Set(S.products.map(p=>p.code)),out=[],seen=new Set();
  ((abc&&abc.itens)||[]).forEach((it,i)=>{const q=+it.quantidadeVenda||0;if(q<=0)return;const code=String(it.mercadoria),price=r2(it.valorVenda/q),cost=(it.valorVenda-it.rentabilidade)/q;if(price<1||seen.has(code))return;
   const s=sugOffer(price,cost,code);if(!s)return;seen.add(code);out.push({code,desc:titleCase(it.nomeMercadoria),price,cost,offer:s.o,from:s.from,grp:'ima',why:`${i+1}º mais vendido • ${Math.round(q)} vendidos em 30 dias`,have:have.has(code)})});
  ((est&&est.itens)||[]).forEach(it=>{const code=String(it.codigoMercadoria);if(seen.has(code))return;const price=+it.valorVendaUnitario,cost=+it.valorCustoUnitario;if(!(price>=1))return;
   const s=sugOffer(price,cost,code);if(!s)return;seen.add(code);const dias=it.ultimaSaida?Math.round((Date.now()-new Date(it.ultimaSaida))/864e5):null;
   out.push({code,ean:it.ean||'',desc:titleCase(it.mercadoria),price,cost,offer:s.o,from:s.from,grp:'giro',why:`${brl(it.valorCustoTotal)} parados em estoque${dias!=null?` • última venda há ${dias} dias`:' • sem venda registrada'}`,have:have.has(code)})});
  SUG=out;renderSugest('ima')}
 catch(e){modal(`<h3>Sugerir ofertas</h3><p>${esc(starErr(e))}</p><div class="mfoot"><button class="btn pri" data-a="n">Fechar</button></div>`,b=>b.querySelector('[data-a=n]').onclick=closeModal)}}
function renderSugest(tab){const L=SUG.filter(x=>x.grp===tab),m=x=>(x.offer-x.cost)/x.offer;
 modal(`<h3>Sugerir ofertas do StarIA</h3>
 <div class="seg2" id="sgT" style="margin-bottom:8px"><button data-v="ima" class="${tab==='ima'?'on':''}">Puxam cliente (${SUG.filter(x=>x.grp==='ima').length})</button><button data-v="giro" class="${tab==='giro'?'on':''}">Estoque alto, girar (${SUG.filter(x=>x.grp==='giro').length})</button></div>
 <p class="hint">${tab==='ima'?'Os mais vendidos: oferta neles traz gente para a loja.':'Muito dinheiro parado: oferta neles vira caixa.'} Preço sugerido nunca fica abaixo da margem alvo de ${Math.round(margAlvo()*100)}% (aba Loja). Termina em ,99 ou ,49. Ajuste à vontade.</p>
 <div style="max-height:52vh;overflow:auto"><table class="sgt"><tr><th></th><th>Produto</th><th>Hoje</th><th>Custo</th><th>Oferta</th><th>Margem</th></tr>
 ${L.map((x,i)=>`<tr data-i="${SUG.indexOf(x)}"><td><input type="checkbox" ${x.pick?'checked':''} ${x.have?'disabled title="Já está no encarte"':''}></td><td><b>${esc(x.desc)}</b><small>${esc(x.why)}${x.from==='hist'?' • preço da última oferta':''}${x.have?' • já no encarte':''}</small></td><td>${brl(x.price)}</td><td>${brl(x.cost)}</td><td><input class="of" inputmode="decimal" value="${moneyIn(x.offer)}"></td><td class="mg">${(m(x)*100).toFixed(1).replace('.',',')}%</td></tr>`).join('')||'<tr><td colspan="6">Nada com espaço para oferta dentro da margem alvo.</td></tr>'}</table></div>
 <div class="mfoot"><button class="btn" data-a="n">Fechar</button><button class="btn pri" data-a="y">Adicionar marcados</button></div>`,b=>{b.classList.add('wide');
  b.querySelectorAll('#sgT button').forEach(x=>x.onclick=()=>renderSugest(x.dataset.v));
  b.querySelectorAll('tr[data-i]').forEach(tr=>{const x=SUG[+tr.dataset.i];tr.querySelector('input[type=checkbox]').onchange=e=>x.pick=e.target.checked;
   tr.querySelector('.of').oninput=e=>{const v=parseMoney(e.target.value);if(v){x.offer=v;const mm=(v-x.cost)/v,td=tr.querySelector('.mg');td.textContent=(mm*100).toFixed(1).replace('.',',')+'%';td.style.color=mm<margMin()?'#b3121b':''}}});
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=()=>{const pk=SUG.filter(x=>x.pick&&!x.have);if(!pk.length){toast('Marque pelo menos um produto');return}
   pk.forEach(x=>{S.products.push(P({code:x.code,ean:x.ean||'',desc:x.desc,price:x.offer,sysPrice:x.price,cost:Math.round(x.cost*10000)/10000,sysAt:Date.now()}));x.have=true;x.pick=false});
   closeModal();changed();loadAllImages();toast(`${pk.length} produtos entraram no encarte. As fotos que já existem no banco aparecem sozinhas.`,4500)}})}

/* ================= 3. repetir a última campanha ================= */
function lastOfCamp(id){return S.saved.filter(s=>s.campaignId===id).sort((a,b)=>(b.at||0)-(a.at||0))[0]}
async function repeatLast(){const s=lastOfCamp(S.campaignId);if(!s){toast(`Ainda não tem ${camp().nome} salva. Gere o kit uma vez e da próxima ela nasce pronta.`,5000);return}
 modal(`<h3>Repetir ${esc(camp().nome)}</h3><p>Vou trazer os <b>${s.products.length} produtos</b> da última (${new Date(s.at).toLocaleDateString('pt-BR')}), com validade de hoje, e conferir custo e preço no StarIA.</p><p class="hint">A lista de agora é substituída. Produto que ficou abaixo da margem aparece em vermelho para você corrigir.</p>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Repetir</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=async()=>{closeModal();S.products=clone(s.products).map(p=>Object.assign(p,{id:uid()}));S.val={ini:today(),fim:today()};$('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim;S.page=0;changed();loadAllImages();
   if(S.products.some(p=>/^\d+$/.test(p.code||'')))await starRefreshAll()}})}

/* ================= 4. modo funcionário ================= */
const MODOKEY='encartes-modo';
const isFunc=()=>{if(isOwnerV()===false)return true;try{return localStorage.getItem(MODOKEY)==='func'}catch(e){return false}};
function applyModo(){if(isOwnerV()===false&&!S.funcSeen){S.funcSeen=Date.now();S._sharedDirty=true;persist()}document.body.classList.toggle('func',isFunc());if(isFunc()&&S.ui==='dono'&&typeof setUi==='function'){S.ui='wz';document.body.classList.add('wz')}const b=$('#bModo');if(b)b.textContent=isFunc()?'Modo funcionário (travado)':'Modo dono';if(isFunc()){const t=document.querySelector('#tabs .on');if(t&&t.dataset.dono!=null)document.querySelector('#tabs [data-t=prod]').click()}}
function askPin(title,onOk){if(!S.store.pin){onOk();return}
 modal(`<h3>${esc(title)}</h3><label>Senha do dono<input id="pinIn" type="password" inputmode="numeric" autocomplete="off"></label><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Liberar</button></div>`,b=>{
  const go=()=>{if($('#pinIn').value===String(S.store.pin)){closeModal();onOk()}else{toast('Senha errada');$('#pinIn').value=''}};
  b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=go;$('#pinIn').onkeydown=e=>{if(e.key==='Enter')go()};setTimeout(()=>$('#pinIn').focus(),40)})}
$('#bModo').onclick=()=>{if(isFunc()){askPin('Voltar ao modo dono',()=>{try{localStorage.removeItem(MODOKEY)}catch(e){}applyModo();toast('Modo dono')})}
 else{if(!S.store.pin){toast('Crie a senha do dono na aba Loja antes de passar para funcionário',5000);document.querySelector('#tabs [data-t=loja]').click();setTimeout(()=>{const i=$('#sPin');if(i)i.focus()},100);return}
  modal(`<h3>Passar este aparelho para funcionário?</h3><p>Neste aparelho a pessoa vai poder: buscar e digitar produtos, trocar fotos e preços, escolher a campanha e gerar o kit.</p><p>Fica travado: cores, diagramação, dados da loja e qualquer download com produto abaixo da margem. Para destravar, só com a sua senha.</p><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Passar para funcionário</button></div>`,b=>{
   b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{try{localStorage.setItem(MODOKEY,'func')}catch(e){}closeModal();applyModo()}})}};

/* ================= 5. kit da semana ================= */
function plaqPdf(list,per){return plaqDoc(list,per,S.plaqOri||(per===1?'v':'h'))}
function hiRes(fk,pg,k){const f=FORMATS[fk],c=document.createElement('canvas');c.width=Math.round(f.w*k);c.height=Math.round(f.h*k);const x=c.getContext('2d');x.scale(k,k);renderFlyer(x,f.w,f.h,pg.items,camp(),[],pg.lay);return c}
function a4Pdf(fk){const J=window.jspdf.jsPDF,land=fk==='a4h',f=FORMATS[fk],P=pagesFor(fk),doc=new J({unit:'mm',format:'a4',orientation:land?'landscape':'portrait'});
 P.forEach((pg,i)=>{if(i)doc.addPage();const c=hiRes(fk,pg,1.5);doc.addImage(c.toDataURL('image/jpeg',0.95),'JPEG',0,0,land?297:210,land?210:297,undefined,'SLOW')});return doc.output('blob')}
async function pngs(fk){const f=FORMATS[fk],P=pagesFor(fk),o=[];for(let i=0;i<P.length;i++){const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,P[i].items,camp(),[],P[i].lay);o.push(await toBlob(c))}return o}
function gondolaCsv(){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',n=v=>v==null?'':Number(v).toFixed(2).replace('.',',');
 const rows=[['Código','Produto','Unidade','Preço normal (sistema)','Preço da oferta','Preço com app','Limite','Setor','Válido de','Válido até','Trocou na gôndola?']];
 S.products.forEach(p=>rows.push([p.code,p.desc,p.unit,n(p.sysPrice),n(p.price),hasApp(p)?n(p.app):'',p.limit||'',p.setor,fmtD(S.val.ini),fmtD(S.val.fim),'']));
 return new Blob(['﻿'+rows.map(r=>r.map(q).join(';')).join('\r\n')],{type:'text/csv'})}
function snapshotKit(){const name=`${camp().nome} ${fmtD(S.val.ini)}`,ex=S.saved.find(s=>s.name===name);const rec={id:ex?ex.id:uid(),name,at:Date.now(),campaignId:S.campaignId,format:S.format,val:clone(S.val),products:clone(S.products),kit:true};
 if(ex)Object.assign(ex,rec);else S.saved.unshift(rec);S.ofertaHist=S.ofertaHist||{};S.products.forEach(p=>{if(/^\d+$/.test(p.code||'')&&p.price!=null)S.ofertaHist[p.code]={price:p.price,at:Date.now()}});renderSaved();persist();cloudSaveEnc(ex||rec)}
$('#bKit').onclick=()=>{const K=Object.assign({insta:true,story:true,a4:true,plaq:true,gond:true,plaqSel:false},S.kitOpt||{});
 modal(`<h3>Gerar kit da semana</h3><p class="hint">Sai tudo num arquivo só (.zip), com as mesmas artes e preços. O encarte fica guardado em Salvos para repetir e para ver o resultado depois.</p>
 ${[['insta','Feed do Instagram e WhatsApp (imagem)'],['story','Story e status (imagem)'],['a4','A4 para imprimir (PDF)'],['plaq','Plaquinhas de gôndola (PDF)'],['gond','Lista de gôndola para a loja trocar os preços (abre no Excel)']].map(([k,t])=>`<label class="chk2"><input type="checkbox" data-k="${k}" ${K[k]?'checked':''}> ${t}</label>`).join('')}
 <label class="chk2" style="margin-left:26px"><input type="checkbox" data-k="plaqSel" ${K.plaqSel?'checked':''}> Plaquinha só dos produtos marcados na lista</label>
 <div class="prog" hidden id="kProg"><i></i></div>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Gerar kit</button></div>`,b=>{
  b.querySelectorAll('[data-k]').forEach(i=>i.onchange=()=>{K[i.dataset.k]=i.checked;S.kitOpt=K;persist()});
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=async()=>{if(!S.products.length){toast('Sem produtos');return}closeModal();await fontsReady();if(!await reviewGate(S.products))return;
   let JSZip;try{JSZip=await loadLib('/vendor/jszip-3.10.1.min.js','JSZip')}catch(e){toast('Não consegui carregar o compactador. Verifique a internet.');return}
   if(!window.jspdf){toast('A biblioteca de PDF não carregou. Recarregue a página.');return}
   toast('Montando o kit…',20000);const z=new JSZip(),base=slug(camp().nome)+'_'+(S.val.ini||today());
   try{const add=(n,bl)=>z.file(n,bl);
    if(K.insta)(await pngs('insta')).forEach((bl,i,a)=>add(`feed${a.length>1?'_arte'+(i+1):''}.png`,bl));
    if(K.story)(await pngs('story')).forEach((bl,i,a)=>add(`story${a.length>1?'_arte'+(i+1):''}.png`,bl));
    if(K.a4)add('A4_imprimir.pdf',a4Pdf('a4'));
    if(K.plaq){const l=K.plaqSel?S.products.filter(p=>p.sel):S.products;if(l.length)add('plaquinhas.pdf',plaqPdf(l,S.plaqPer||2))}
    if(K.gond)add('lista_de_gondola.csv',gondolaCsv());
    const blob=await z.generateAsync({type:'blob'});snapshotKit();await saveFile('kit_'+base+'.zip',blob,'zip')}
   catch(e){toast('Deu erro montando o kit. Tente de novo.')}}})};

/* ================= 6. resultado da campanha ================= */
async function vendasDe(codes,ini,fim){const out={};for(let i=0;i<codes.length;i+=10){const pl=await star('consultar_vendas',{dataInicial:ini,dataFinal:fim,filial:filial(),agruparPor:'MERCADORIA',mercadorias:codes.slice(i,i+10).map(Number),limite:10});((pl&&pl.itens)||[]).forEach(it=>{out[String(it.codigoMercadoria)]={q:+it.quantidade||0,v:+it.valorVendaTotal||0,c:+it.custoTotalCMV||0}})}return out}
async function openResult(s){const codes=[...new Set(s.products.map(p=>p.code).filter(c=>/^\d+$/.test(c||'')))];
 if(!codes.length){toast('Esse encarte não tem produtos ligados ao StarIA');return}
 const ini=s.val.ini||ymd(new Date(s.at)),fim=s.val.fim||ini;if(ini>daysAgo(0)){toast('A campanha ainda não começou');return}
 const d0=new Date(ini+'T12:00'),d1=new Date(fim+'T12:00'),len=Math.round((d1-d0)/864e5)+1,b1=new Date(d0);b1.setDate(b1.getDate()-7);const b2=new Date(b1);b2.setDate(b2.getDate()+len-1);
 modal(`<h3>Resultado: ${esc(s.name)}</h3><p class="hint">Buscando as vendas no StarIA…</p><div class="prog"><i style="width:50%"></i></div>`,()=>{});
 try{const[A,B]=await Promise.all([vendasDe(codes,ini,fim),vendasDe(codes,ymd(b1),ymd(b2))]);
  const rows=codes.map(c=>{const p=s.products.find(x=>x.code===c),a=A[c]||{q:0,v:0,c:0},b=B[c]||{q:0,v:0,c:0};return{d:p.desc,a,b,var:b.q>0?(a.q-b.q)/b.q:null,mg:a.v>0?(a.v-a.c)/a.v:null,lucro:a.v-a.c}}).sort((x,y)=>(y.var??9)-(x.var??9));
  const T=k=>rows.reduce((t,r)=>t+r[k].v,0),L=k=>rows.reduce((t,r)=>t+r[k].v-r[k].c,0),pc=v=>v==null?'novo':(v>=0?'+':'')+Math.round(v*100)+'%';
  const tv=T('a')-T('b'),tl=L('a')-L('b');
  modal(`<h3>Resultado: ${esc(s.name)}</h3>
  <p>De ${fmtD(ini)} a ${fmtD(fim)}, comparado com os mesmos ${len} dia(s) da semana anterior (${fmtD(ymd(b1))} a ${fmtD(ymd(b2))}). Filial ${filial()}.</p>
  <div class="resTot"><div><small>Vendeu nos itens do encarte</small><b>${brl(T('a'))}</b><i class="${tv>=0?'up':'dn'}">${tv>=0?'+':''}${brl(tv)}</i></div><div><small>Lucro bruto nesses itens</small><b>${brl(L('a'))}</b><i class="${tl>=0?'up':'dn'}">${tl>=0?'+':''}${brl(tl)}</i></div></div>
  <div style="max-height:46vh;overflow:auto"><table class="sgt"><tr><th>Produto</th><th>Antes</th><th>Na oferta</th><th>Variação</th><th>Margem</th></tr>
  ${rows.map(r=>`<tr><td><b>${esc(r.d)}</b></td><td>${r.b.q.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td><td>${r.a.q.toLocaleString('pt-BR',{maximumFractionDigits:1})}</td><td style="font-weight:700;color:${r.var==null||r.var>=0.2?'#1b7a34':r.var<0?'#b3121b':''}">${pc(r.var)}</td><td style="color:${r.mg!=null&&r.mg<margMin()?'#b3121b':''}">${r.mg==null?'—':(r.mg*100).toFixed(1).replace('.',',')+'%'}</td></tr>`).join('')}</table></div>
  <p class="hint">Verde: vendeu 20% ou mais que a semana anterior, a oferta puxou. Vermelho na variação: vendeu menos mesmo em oferta, não repita. Vermelho na margem: queimou margem.</p>
  <div class="mfoot"><button class="btn pri" data-a="n">Fechar</button></div>`,b=>{b.classList.add('wide');b.querySelector('[data-a=n]').onclick=closeModal})}
 catch(e){modal(`<h3>Resultado</h3><p>${esc(starErr(e))}</p><div class="mfoot"><button class="btn pri" data-a="n">Fechar</button></div>`,b=>b.querySelector('[data-a=n]').onclick=closeModal)}}

/* ================= campanhas padrão (para a hora da pressa) ================= */
const DIA_N=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],DIA_M=d=>d===0||d===6;
const PD_MOT={"carne": "steak", "verde": "leaf", "limpeza": "bubble", "imbativel": "star", "show": "sparkle", "precobaixo": "tag", "frango": "drum", "peixe": "fish", "padaria": "wheat", "gelada": "cube", "churrasco": "steak", "frios": "cheese", "beleza": "sparkle", "cesta": "basket", "pet": "paw", "doce": "heart", "feira": "leaf", "relampago": "bolt", "levemais": "plus", "cafe": "bean", "semana": "tag", "fds": "star", "feirao": "tag", "economia": "coin", "queima": "bolt", "diad": "star"};
const CP=(k,f,cores,m)=>({k,f,m,cores,motivo:PD_MOT[k]||'',estilo:'vitrine'});
const C8=(fundo,cabecalho,titulo,preco,precoTexto,adesivo,adesivoTexto)=>({fundo,cabecalho,titulo,preco,precoTexto,adesivo,adesivoTexto,cartao:'#ffffff'});
const PADRAO_DIA=[
 CP('carne','{D} da Carne',C8('#4a0b0b','#b3121b','#ffffff','#ffd400','#8a0b0b','#ffffff','#b3121b')),
 CP('verde','{D} Verde',C8('#1f7a32','#0e4a1c','#ffffff','#6b3a1e','#ffffff','#ffd400','#111111')),
 CP('limpeza','{D} da Limpeza',C8('#0a6f8f','#064a63','#ffffff','#0d2a6e','#ffffff','#7fe3ff','#06324a')),
 CP('imbativel','{D} Imbatível',C8('#0d2a6e','#d71920','#ffffff','#d71920','#ffffff','#ffd400','#111111')),
 CP('show','{D} Show',C8('#d71920','#0d2a6e','#ffd400','#0d2a6e','#ffffff','#ffd400','#111111')),
 CP('precobaixo','{D} do Preço Baixo',C8('#ffd400','#d71920','#ffffff','#d71920','#ffffff','#111111','#ffd400')),
 CP('frango','{D} do Frango',C8('#e8650a','#9c3d00','#ffffff','#9c1b10','#ffffff','#ffd400','#111111')),
 CP('peixe','{D} do Peixe',C8('#0b5ea8','#06315e','#ffffff','#e85d04','#ffffff','#ffffff','#06315e')),
 CP('padaria','{D} da Padaria',C8('#8d5524','#4e2a10','#ffe7b3','#c0392b','#ffffff','#ffe7b3','#4e2a10')),
 CP('gelada','{D} {G}',C8('#0b3d91','#071f4d','#ffd400','#ffd400','#071f4d','#7fd3ff','#071f4d'),{f:'Gelada',m:'Gelado'}),
 Object.assign(CP('churrasco','{D} do Churrasco',C8('#1b1b1b','#8a0b0b','#ffb000','#d71920','#ffffff','#ffb000','#111111')),{tema:'fogo'}),
 CP('frios','{D} dos Frios',C8('#3f8fd2','#1d4f86','#ffffff','#1d4f86','#ffffff','#ffd400','#111111')),
 CP('beleza','{D} da Beleza',C8('#c2185b','#7a0e3a','#ffffff','#7a0e3a','#ffffff','#ffe0ef','#7a0e3a')),
 CP('cesta','{D} da Cesta Básica',C8('#123a8f','#0b2560','#ffffff','#d71920','#ffffff','#ffd400','#111111')),
 CP('pet','{D} Pet',C8('#6a1b9a','#3f0f5c','#ffffff','#ff8f00','#ffffff','#ffd400','#3f0f5c')),
 CP('doce','{D} Doce',C8('#e91e63','#5d2a12','#ffffff','#5d2a12','#ffffff','#ffd1e1','#5d2a12')),
 CP('feira','{D} da Feira',C8('#2e7d32','#d71920','#ffffff','#d71920','#ffffff','#ffd400','#111111')),
 CP('relampago','{D} Relâmpago',C8('#111111','#ffd400','#111111','#d71920','#ffffff','#ffd400','#111111')),
 CP('levemais','{D} do Leve Mais',C8('#00838f','#d71920','#ffffff','#d71920','#ffffff','#ffd400','#111111')),
 CP('cafe','{D} do Café',C8('#4e342e','#2b1b16','#ffd9a0','#c62828','#ffffff','#ffd9a0','#2b1b16')),
];
const PADRAO_SEM=[
 CP('semana','Ofertas da Semana',C8('#123a8f','#d71920','#ffffff','#d71920','#ffffff','#ffd400','#111111')),
 CP('fds','Fim de Semana de Ofertas',C8('#d71920','#111111','#ffd400','#111111','#ffd400','#ffd400','#111111')),
 CP('feirao','Feirão de Preços',C8('#ffd400','#0d2a6e','#ffffff','#0d2a6e','#ffffff','#d71920','#ffffff')),
 CP('economia','Semana da Economia',C8('#1f7a32','#0d2a6e','#ffffff','#0d2a6e','#ffffff','#ffd400','#111111')),
 Object.assign(CP('queima','Queima de Estoque',C8('#b3121b','#2a0606','#ffb000','#2a0606','#ffb000','#ffb000','#2a0606')),{tema:'fogo'}),
 Object.assign(CP('diad','Dia D',C8('#4a0705','#1a0202','#ffd400','#d71920','#ffffff','#ffd400','#111111')),{tema:'fogo'}),
];
function padVal(t,sem){if(!sem){const dd=nextDay(PD_DIA);return{ini:dd,fim:dd}}if(t.k==='diad')return{ini:today(),fim:today()};if(t.k==='fds'){const a=nextDay(5),z=new Date(a+'T12:00');z.setDate(z.getDate()+2);return{ini:a,fim:ymd(z)}}const b=new Date();b.setDate(b.getDate()+6);return{ini:today(),fim:ymd(b)}}
function padNome(t,d){return t.f.replace('{D}',DIA_N[d]).replace('{G}',t.m?(DIA_M(d)?t.m.m:t.m.f):'')}
function nextDay(d){const x=new Date();x.setDate(x.getDate()+((d-x.getDay()+7)%7));return ymd(x)}
let PD_DIA=new Date().getDay();
function usePadrao(t,sem){const d=PD_DIA,nome=sem?t.f:padNome(t,d),id='pd-'+t.k+(sem?'':'-'+d);
 let c=S.campaigns.find(x=>x.id===id);if(!c){c={id,nome,titulo:nome,dia:sem?-1:d,cores:clone(t.cores),tema:t.tema||'',motivo:t.motivo||'',estilo:t.estilo||'',padrao:true};S.campaigns.push(c);S._sharedDirty=true}
 S.campaignId=id;S.val=padVal(t,sem);
 $('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim;closeModal();renderCamps();changed(false);wzGo(2)}
function openPadrao(){const its=(S.products.length?S.products:sample()).slice(0,9),f=FORMATS.insta;
 const card=(t,sem,i)=>`<button class="pdC" data-i="${i}" data-s="${sem?1:0}"><canvas width="216" height="270"></canvas><b>${esc(sem?t.f:padNome(t,PD_DIA))}</b></button>`;
 modal(`<h3>Campanhas padrão</h3><p class="hint">Para a hora da pressa: escolha o dia e toque na ação. Cores e título já vêm prontos.</p>
 <div class="seg2 pdDias">${[1,2,3,4,5,6,0].map(d=>`<button data-d="${d}" class="${d===PD_DIA?'on':''}">${DIA_N[d]}</button>`).join('')}</div>
 <h4>Ações do dia</h4><div class="pdGrid">${PADRAO_DIA.map((t,i)=>card(t,false,i)).join('')}</div>
 <h4>Semanais e datas fortes</h4><div class="pdGrid">${PADRAO_SEM.map((t,i)=>card(t,true,i)).join('')}</div>
 <div class="mfoot"><button class="btn" data-a="n">Fechar</button></div>`,b=>{b.classList.add('wide');
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelectorAll('.pdDias button').forEach(x=>x.onclick=()=>{PD_DIA=+x.dataset.d;openPadrao()});
  const big=document.createElement('canvas');big.width=f.w;big.height=f.h;const bx=big.getContext('2d');
  const cards=[...b.querySelectorAll('.pdC')];let k=0;
  const step=()=>{if(k>=cards.length||$('#modal').hidden)return;const el=cards[k++],sem=el.dataset.s==='1',t=(sem?PADRAO_SEM:PADRAO_DIA)[+el.dataset.i],nome=sem?t.f:padNome(t,PD_DIA);
   renderFlyer(bx,f.w,f.h,its,{id:'tmp',nome,titulo:nome,dia:-1,cores:t.cores,tema:t.tema||'',motivo:t.motivo||'',estilo:t.estilo||''},[],{id:'auto',auto:true});el.querySelector('canvas').getContext('2d').drawImage(big,0,0,216,270);setTimeout(step,15)};setTimeout(step,30);
  cards.forEach(el=>el.onclick=()=>pdVer(el.dataset.s==='1',+el.dataset.i))})}
/* ver a campanha padrão grande antes de usar */
function pdVer(sem,i){const L=sem?PADRAO_SEM:PADRAO_DIA,t=L[i],nome=sem?t.f:padNome(t,PD_DIA),f=FORMATS.insta,its=(S.products.length?S.products:sample()).slice(0,9);
 modal(`<div class="pdVer"><div class="pdVh"><button class="btn" data-a="back">◀ Voltar às campanhas</button><b>${esc(nome)}</b><span class="hint">${i+1} de ${L.length}</span></div>
 <div class="pdVc"><button class="pdArr" data-a="prev" ${i?'':'disabled'}>‹</button><canvas id="pdBig"></canvas><button class="pdArr" data-a="next" ${i<L.length-1?'':'disabled'}>›</button></div>
 <div class="mfoot"><button class="btn" data-a="back2">Voltar</button><button class="btn pri big" data-a="ok">Usar esta campanha</button></div></div>`,b=>{b.classList.add('wide');
  const cv=$('#pdBig');cv.width=f.w;cv.height=f.h;const sv=S.val;S.val=padVal(t,sem);renderFlyer(cv.getContext('2d'),f.w,f.h,its,{id:'tmp',nome,titulo:nome,dia:-1,cores:t.cores,tema:t.tema||'',motivo:t.motivo||'',estilo:t.estilo||''},[],{id:'auto',auto:true});S.val=sv;
  const back=()=>openPadrao();b.querySelector('[data-a=back]').onclick=back;b.querySelector('[data-a=back2]').onclick=back;
  b.querySelector('[data-a=ok]').onclick=()=>usePadrao(t,sem);
  b.querySelector('[data-a=prev]').onclick=()=>{if(i>0)pdVer(sem,i-1)};b.querySelector('[data-a=next]').onclick=()=>{if(i<L.length-1)pdVer(sem,i+1)};
  b.onkeydown=null;PD_KEYS=e=>{if($('#modal').hidden||!$('#pdBig')){PD_KEYS=null;return}if(e.key==='ArrowLeft'&&i>0)pdVer(sem,i-1);else if(e.key==='ArrowRight'&&i<L.length-1)pdVer(sem,i+1);else if(e.key==='Enter')usePadrao(t,sem);else if(e.key==='Escape')openPadrao()}})}
let PD_KEYS=null;document.addEventListener('keydown',e=>{if(PD_KEYS)PD_KEYS(e)});
/* ================= INÍCIO + PLAQUINHAS AVULSAS ================= */
function avCamp(){const c=S.campaigns.find(x=>x.id===S.avCamp)||camp();return Object.assign({},c,{titulo:(S.avTitle??'OFERTA')||c.titulo})}
function withVal(v,fn){const sv=S.val;S.val=v;try{return fn()}finally{S.val=sv}}
const avVal=()=>({ini:S.avVal||today(),fim:S.avVal||today()});
let AVSEL=0;
function avGo(){WZ=-1;document.querySelectorAll('.wzS').forEach(el=>el.hidden=el.dataset.s!=='av');wzSteps();S.avulsas=S.avulsas||[];if(!S.avulsas.length)S.avulsas.push(P({desc:'',price:null}));avRender();window.scrollTo(0,0)}
function avRender(){const L=S.avulsas||[];AVSEL=clamp(AVSEL,0,Math.max(0,L.length-1));
 $('#avCamps').innerHTML=S.campaigns.filter(c=>!c.modelo).map(c=>`<button data-id="${esc(c.id)}" class="${(S.avCamp||camp().id)===c.id?'on':''}" style="--c1:${c.cores.cabecalho};--c2:${c.cores.adesivo}"><i></i>${esc(c.nome)}</button>`).join('');
 $('#avCamps').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.avCamp=b.dataset.id;persist();avRender()});
 $('#avTit').value=S.avTitle??'OFERTA';$('#avDate').value=S.avVal||today();
 $('#avList').innerHTML=L.map((p,i)=>`<div class="avI ${i===AVSEL?'on':''}" data-i="${i}">
  <button class="avPh" data-a="foto" style="${getImg(p)?`background-image:url('${imgCache.get(imgKey(p)).url}')`:''}">${getImg(p)?'':'+ foto'}</button>
  <div class="avF"><input data-k="desc" placeholder="Produto (ex.: Arroz Tio João 5kg)" value="${esc(p.desc)}">
   <div class="avR"><label>Preço<input data-k="price" inputmode="decimal" placeholder="0,00" value="${moneyIn(p.price)}"></label><label>Com app<input data-k="app" inputmode="decimal" placeholder="opcional" value="${p.appOn?moneyIn(p.app):''}"></label><label>Limite<input data-k="limit" type="number" min="0" placeholder="—" value="${p.limit||''}"></label></div></div>
  <div class="avB"><button data-a="fino" title="Ajuste fino">✎</button><button data-a="rm" title="Tirar">✕</button></div>
  ${i===AVSEL&&S.avFino?avFino(p):''}</div>`).join('');
 $('#avList').querySelectorAll('.avI').forEach(row=>{const i=+row.dataset.i,p=L[i];
  row.addEventListener('focusin',()=>{if(AVSEL!==i){AVSEL=i;avPrev();row.parentNode.querySelectorAll('.avI').forEach(r=>r.classList.toggle('on',r===row))}});
  row.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=()=>{const k=inp.dataset.k;if(k==='desc')p.desc=inp.value;else if(k==='price')p.price=parseMoney(inp.value);else if(k==='app'){const v=parseMoney(inp.value);p.app=v;p.appOn=v!=null&&v!==p.price;if(p.appOn&&p.app>p.price&&p.price!=null)0}else if(k==='limit')p.limit=Math.max(0,parseInt(inp.value)||0);AVSEL=i;persist();avPrev()});
  row.querySelector('[data-a=foto]').onclick=()=>{AVSEL=i;openPhotoSource(p)};
  row.querySelector('[data-a=fino]').onclick=()=>{S.avFino=!(AVSEL===i&&S.avFino);AVSEL=i;avRender()};
  row.querySelector('[data-a=rm]').onclick=()=>modal(`<h3>Tem certeza?</h3><p>Tirar "${esc(p.desc||'este produto')}" das plaquinhas?</p><div class="mfoot"><button class="btn" data-a="n">Não</button><button class="btn pri" data-a="y">Sim, tirar</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{closeModal();L.splice(i,1);if(!L.length)L.push(P({desc:'',price:null}));persist();avRender()}});
  const fz=row.querySelector('.avFino');if(fz){fz.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{const v=b.dataset.z;NMV(p,v);
   if(v==='z+')p.zoom=Math.min(1.8,(p.zoom||1)+0.1);if(v==='z-')p.zoom=Math.max(0.5,(p.zoom||1)-0.1);if(v==='up')p.dy=(p.dy||0)-0.04;if(v==='dn')p.dy=Math.min(0.2,(p.dy||0)+0.04);if(v==='d+')p.descK=Math.min(1.8,(p.descK||1)+0.15);if(v==='d-')p.descK=Math.max(0.7,(p.descK||1)-0.15);if(v==='p+')p.phK=Math.min(2.2,(p.phK||1)+0.15);if(v==='p-')p.phK=Math.max(0.5,(p.phK||1)-0.15);if(v==='rs'){p.zoom=1;p.dy=0;p.descK=1;p.phK=1;p.nameDy=0}persist();avRender()});
   const ph=fz.querySelector('select');if(ph)ph.onchange=()=>{p.phrase=ph.value;persist();avPrev()};const vc=fz.querySelector('[data-venc]');if(vc)vc.onchange=()=>{p.venc=vc.checked;persist();avRender()};const vd=fz.querySelector('[data-vd]');if(vd)vd.onchange=()=>{p.vencData=vd.value;persist();avPrev()}}});
 avPrev()}
function avFino(p){const phr=[...new Set([...S.phrases,p.phrase].filter(Boolean))];return`<div class="avFino">
 <div class="szR"><span>Foto</span><button data-z="z-">−</button><b>${Math.round((p.zoom||1)*100)}%</b><button data-z="z+">+</button><button data-z="up">↑</button><button data-z="dn">↓</button></div>
 <div class="szR"><span>Letra do nome</span><button data-z="d-">A−</button><b>${Math.round((p.descK||1)*100)}%</b><button data-z="d+">A+</button><span style="margin-left:10px">Posição do nome</span><button data-z="nup" title="Subir o nome">↑</button><button data-z="ndn" title="Descer o nome">↓</button></div>
 <div class="szR"><span>Frase</span><select>${['',...phr].map(f=>`<option value="${esc(f)}" ${f===(p.phrase||'')?'selected':''}>${f?esc(f):'Nenhuma'}</option>`).join('')}</select>${p.phrase?`<button data-z="p-">A−</button><b>${Math.round((p.phK||1)*100)}%</b><button data-z="p+">A+</button>`:''}</div>
 <label class="chk2"><input type="checkbox" data-venc ${p.venc?'checked':''}> Vencimento próximo</label>${p.venc?`<input type="date" data-vd value="${p.vencData||''}" style="width:auto;display:inline-block;margin:0 8px">`:''} <button class="btn sm ghost" data-z="rs">Voltar ao padrão</button></div>`}
const avOk=p=>(p.desc||'').trim()&&p.price!=null;
function avPrev(){const L=S.avulsas||[],nOk=L.filter(avOk).length;$('#avN').textContent=`${nOk} plaquinha${nOk===1?'':'s'} pronta${nOk===1?'':'s'}`;const per=S.avPer||2,ori=S.avOri||(per===1?'v':'h'),d=plaqDims(per,ori),cv=$('#avPrev'),PX=3,pw=d.page==='portrait'?210:297,ph=d.page==='portrait'?297:210;
 $('#avPer').value=per;$('#avOri').value=ori;cv.width=pw*PX;cv.height=ph*PX;const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
 const start=Math.floor(AVSEL/d.pos.length)*d.pos.length;
 withVal(avVal(),()=>d.pos.forEach(([px,py],k)=>{const p=L[start+k];const t=document.createElement('canvas');t.width=Math.round(d.w*PX);t.height=Math.round(d.h*PX);const tx=t.getContext('2d');
  if(p&&avOk(p))renderPlaque(tx,t.width,t.height,p,avCamp(),30*PX);else{tx.fillStyle='#f6f4ef';tx.fillRect(0,0,t.width,t.height);tx.fillStyle='#999';tx.font='600 20px Inter,sans-serif';tx.textAlign='center';tx.fillText(p?'Preencha nome e preço':'Espaço livre na folha',t.width/2,t.height/2)}
  x.drawImage(t,px*PX,py*PX)}));
 if(d.cut){x.strokeStyle='#888';x.lineWidth=2;x.setLineDash([9,6]);x.beginPath();x.moveTo(d.cut[0]*PX,d.cut[1]*PX);x.lineTo(d.cut[2]*PX,d.cut[3]*PX);x.stroke();x.setLineDash([])}
 x.strokeStyle='#bbb';x.lineWidth=2;x.strokeRect(1,1,cv.width-2,cv.height-2)}
$('#avAdd').onclick=()=>{S.avulsas.push(P({desc:'',price:null}));AVSEL=S.avulsas.length-1;persist();avRender();setTimeout(()=>{const r=document.querySelector(`.avI[data-i="${AVSEL}"] [data-k=desc]`);if(r)r.focus()},50)};
$('#avPaste').onclick=()=>modal(`<h3>Colar lista</h3><p class="hint">Um produto por linha, com o preço na frente. Dois preços = sem app e com app. "lim 6" vira limite.</p><textarea id="avTx" style="min-height:150px"></textarea><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Adicionar</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;setTimeout(()=>$('#avTx').focus(),40);
 b.querySelector('[data-a=y]').onclick=()=>{const L=parseQuick($('#avTx').value);if(!L.length){toast('Não achei produto com preço');return}S.avulsas=S.avulsas.filter(avOk).concat(L);closeModal();persist();loadAllImages();avRender()}});
$('#avTit').oninput=e=>{S.avTitle=e.target.value;persist();avPrev()};$('#avDate').onchange=e=>{S.avVal=e.target.value;persist();avPrev()};
$('#avPer').onchange=e=>{S.avPer=+e.target.value;persist();avPrev()};$('#avOri').onchange=e=>{S.avOri=e.target.value;persist();avPrev()};
const avPdf=wpp=>async()=>{const L=(S.avulsas||[]).filter(avOk);if(!L.length){toast('Preencha pelo menos um produto com nome e preço');return}if(!window.jspdf){toast('A biblioteca de PDF não carregou. Recarregue.');return}
 toast('Montando as plaquinhas…');await fontsReady();const per=S.avPer||2,ori=S.avOri||(per===1?'v':'h');const blob=withVal(avVal(),()=>plaqDoc(L,per,ori,avCamp()));(wpp?sendWpp:saveFile)('plaquinhas_'+slug(S.avTitle||'oferta')+'_'+(S.avVal||today())+'.pdf',blob,'pdf')};
$('#avGo').onclick=avPdf(false);$('#avWpp').onclick=avPdf(true);
$('#avNew').onclick=()=>modal(`<h3>Começar plaquinhas novas?</h3><p>As ${S.avulsas.length} de agora saem da lista.</p><div class="mfoot"><button class="btn" data-a="n">Não</button><button class="btn pri" data-a="y">Sim, começar de novo</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{closeModal();S.avulsas=[P({desc:'',price:null})];AVSEL=0;persist();avRender()}});
$('#homeEnc').onclick=()=>wzGo(1);$('#homePlq').onclick=avGo;
/* ================= PASSO A PASSO (tela do funcionário) ================= */
let WZ=1;
const inWz=()=>S.ui!=='dono';
function setUi(m){S.ui=m;persist();document.body.classList.toggle('wz',inWz());$('#bDono').textContent=inWz()?'Painel do dono':'Voltar ao passo a passo';if(inWz())wzGo(WZ);else{renderList();schedule()}}
function wzSteps(){const N=['Campanha','Cole a lista','Conferir','Baixar'];if(WZ<1){$('#wzSteps').innerHTML=WZ===-1?'<button data-s="0">‹ Início</button>':'';const b=$('#wzSteps').querySelector('button');if(b)b.onclick=()=>wzGo(0);return}$('#wzSteps').innerHTML=`<button data-s="0">‹ Início</button><b>Passo ${WZ} de 4</b>`+N.map((n,i)=>`<button data-s="${i+1}" class="${WZ===i+1?'on':''} ${i+1<WZ?'ok':''}" ${i+1>WZ+1&&!(i+1<=2)?'disabled':''}>${i+1}. ${n}</button>`).join('');
 $('#wzSteps').querySelectorAll('button').forEach(b=>b.onclick=()=>{const s=+b.dataset.s;if(s===0){wzGo(0);return}if(s>=3&&!S.products.length){toast('Cole a lista de produtos primeiro');return}wzGo(s)})}
function wzGo(n){WZ=n;document.querySelectorAll('.wzS').forEach(el=>el.hidden=el.dataset.s!==String(n));wzSteps();window.scrollTo(0,0);
 if(n===1)wzCamps();if(n===2)wzPaste();if(n===3){S.page=Math.min(S.page,pageInfo().n-1);schedule();wzCheck()}if(n===4)wzDown()}
/* passo 1: campanhas em cards com miniatura real */
function pront(){const kits=S.saved.filter(x=>x.kit).length,last=S.saved.find(x=>x.kit),bank=Object.keys(S.fotoNomes||{}).length+Object.keys(S.fotoEan||{}).length;
 const fot=last&&last.products.length?Math.round(100*last.products.filter(p=>getImg(p)).length/last.products.length):0;
 return[['Logos das duas lojas',!!(logos[0]&&logos[1]),'Painel do dono › Loja'],['WhatsApp para o QR code',!!waDigits(),'Painel do dono › Loja'],['Senha do dono criada',!!S.store.pin,'Toque em Painel do dono'],
  ['Banco com 200 fotos ('+bank+' hoje)',bank>=200,'Painel do dono › Loja › Subir fotos em lote'],['Último encarte com 90% de fotos ('+fot+'%)',fot>=90,'Corrija no Passo 3'],
  ['5 encartes reais gerados ('+kits+' hoje)',kits>=5,'Cada download conta'],['Funcionário usando pela conta dele',!!S.funcSeen,'Compartilhe o app com permissão de interagir'],['TV da loja publicada',!!S.tvPub,'Passo 4 › TV › Publicar']]}
function renderPront(){const b=$('#prontB');if(!b)return;const show=isOwnerV()!==false&&!isFunc();b.hidden=!show;if(!show)return;const L=pront(),n=L.filter(x=>x[1]).length;
 b.innerHTML=`<b>Pronto para trocar o QR Ofertas: ${n} de ${L.length}</b><i style="width:${Math.round(100*n/L.length)}%"></i><small>Toque para ver o que falta</small>`;
 b.onclick=()=>modal(`<h3>O que falta para ser 10/10</h3><p class="hint">Código já está pronto. O que falta aqui é uso real.</p><ul class="pront">${L.map(([t,ok,o])=>`<li class="${ok?'ok':''}"><b>${ok?'✓':'○'}</b><div>${esc(t)}${ok?'':`<small>${esc(o)}</small>`}</div></li>`).join('')}</ul><div class="mfoot"><button class="btn pri" data-a="n">Fechar</button></div>`,x=>x.querySelector('[data-a=n]').onclick=closeModal)}
function wzCamps(){renderPront();const el=$('#wzCamps');const its=S.products.length?S.products:sample();
 const dw=new Date().getDay(),cs=[...S.campaigns].filter(c=>!c.padrao||c.id===S.campaignId).sort((a,b)=>(b.dia===dw)-(a.dia===dw));
 el.innerHTML=cs.map(c=>{const last=lastOfCamp(c.id),hj=c.dia===dw;return`<div class="wzCard ${hj?'hoje':''}" data-id="${esc(c.id)}" style="--cc:${c.cores.fundo};--ch:${c.cores.cabecalho}"><canvas></canvas><div class="wzCi">${hj?'<span class="tag">CAMPANHA DE HOJE</span>':''}<b>${esc(c.nome)}</b><small>${c.dia>=0?DAYS[c.dia]:'Qualquer dia'}</small>
  <button class="btn pri" data-a="go">Usar esta</button>${last?`<button class="btn" data-a="rep">Repetir a última (${new Date(last.at).toLocaleDateString('pt-BR').slice(0,5)}) e trocar preços</button>`:''}</div></div>`}).join('');
 el.querySelectorAll('.wzCard').forEach(card=>{const c=S.campaigns.find(x=>x.id===card.dataset.id),cv=card.querySelector('canvas'),f=FORMATS.insta;
  setTimeout(()=>{const big=document.createElement('canvas');big.width=f.w;big.height=f.h;const pg=pagesFor('insta')[0];renderFlyer(big.getContext('2d'),f.w,f.h,(pg.items.length?pg.items:its).slice(0,9),c,[],pg.lay);cv.width=270;cv.height=338;cv.getContext('2d').drawImage(big,0,0,270,338)},20);
  const pick=()=>{S.campaignId=c.id;renderCamps();renderArt();changed(false)};
  card.querySelector('[data-a=go]').onclick=e=>{e.stopPropagation();pick();wzGo(2)};
  card.querySelector('canvas').onclick=()=>{pick();wzGo(2)};
  const r=card.querySelector('[data-a=rep]');if(r)r.onclick=async e=>{e.stopPropagation();pick();const s=lastOfCamp(c.id);S.products=clone(s.products).map(p=>Object.assign(p,{id:uid()}));S.artes=clone(s.artes||S.artes);wzSetVal();S.page=0;changed();loadAllImages();wzGo(3);if(S.products.some(p=>/^\d+$/.test(p.code||'')))starRefreshAll()}});
 $('#wzIni').value=S.val.ini||'';$('#wzFim').value=S.val.fim||''}
function wzSetVal(){S.val={ini:$('#wzIni').value||today(),fim:$('#wzFim').value||$('#wzIni').value||today()};$('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim}
/* passo 2: colar a lista */
function wzPaste(){const tx=$('#wzTx');setTimeout(()=>tx.focus(),60);wzPrevList()}
function wzPrevList(){const L=parseQuick($('#wzTx').value),el=$('#wzRead');
 if(!L.length){el.innerHTML='<p class="hint">Cole a lista do jeito que veio no WhatsApp. Exemplo: <b>Arroz Tio João 5kg 24,90 22,90</b> (primeiro preço sem app, segundo com app). Um produto por linha ou tudo corrido.</p>';$('#wzMont').disabled=true;return}
 let fot=0;const rows=L.map(p=>{const k=findPhotoByName(p)||(imgCache.has(imgKey(p))?imgKey(p):null);if(k)fot++;const ent=k&&imgCache.get(k);
  return`<tr><td>${ent?`<i class="ph" style="background-image:url('${ent.url}')"></i>`:'<i class="ph no">sem foto</i>'}</td><td><b>${esc(p.desc)}</b>${p.unit!=='un'?` <small>${esc(p.unit)}</small>`:''}</td><td>${brl(p.price)}</td><td>${p.appOn?brl(p.app):'—'}</td></tr>`}).join('');
 el.innerHTML=`<p class="wzOk">Entendi <b>${L.length} produtos</b>. ${fot} já com foto${L.length-fot?`, ${L.length-fot} sem foto (você resolve no próximo passo)`:''}.</p><table class="sgt"><tr><th></th><th>Produto</th><th>Sem app</th><th>Com app</th></tr>${rows}</table>`;$('#wzMont').disabled=false}
function wzMontar(){const L=parseQuick($('#wzTx').value);if(!L.length)return;
 const go=two=>{S.products=L;S.page=0;const fk=S.format;setArtes(fk,two?[{t:'m',lay:'auto',n:Math.ceil(L.length/2)},{t:'m',lay:'auto',grow:true}]:[{t:'m',lay:'auto',grow:true}]);changed();loadAllImages();$('#wzTx').value='';wzGo(3)};
 const lim=FORMATS[S.format].limit;
 if(L.length>lim)modal(`<h3>São ${L.length} produtos</h3><p>Numa arte só eles ficam pequenos demais para ler no celular. Quer dividir em <b>frente e verso</b>?</p><div class="mfoot"><button class="btn" data-a="n">Não, tudo numa arte</button><button class="btn pri" data-a="y">Sim, dividir</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=()=>{closeModal();go(false)};b.querySelector('[data-a=y]').onclick=()=>{closeModal();go(true)}});
 else go(false)}
/* passo 3: conferir */
function photoSugs(p,max=3){const bank=S.fotoNomes||{},q=norm2(p.desc).filter(t=>!isSize(t)),out=[];if(!q.length)return out;
 for(const[bk,ik]of Object.entries(bank)){if(!imgCache.has(ik))continue;const b=bk.split(' ').filter(t=>!isSize(t));const hit=q.filter(t=>b.some(x=>tokEq(t,x))).length;if(hit)out.push({ik,sc:hit/Math.max(q.length,b.length)+hit*0.01})}
 return out.sort((a,b)=>b.sc-a.sc).filter((x,i,a)=>a.findIndex(y=>y.ik===x.ik)===i).slice(0,max).map(x=>x.ik)}
/* problemas de cada produto, cada um com um conserto automático */
function imgFill(p){const img=getImg(p),h=PREV_HIT.find(x=>x.id===p.id);if(!img||!h)return null;const horiz=h.w/h.h>1.45,bw=horiz?h.w*0.46:h.w*0.9,bh=horiz?h.h*0.9:h.h*0.45,b=bw/bh,a=img.width/img.height,n=multiCount(p,img,bw,bh),ae=a*n;return ae<b?ae/b:b/ae}
function prodIssues(p){const o=[],m=margem(p);if(!getImg(p))o.push(['foto','Sem foto']);if(p.price==null)o.push(['preco','Sem preço']);if(p.app!=null&&p.price!=null&&p.appOn&&p.app>p.price)o.push(['appinv','Preço com app maior que o sem app']);
 if(m!=null&&m<0)o.push(['margem','Abaixo do custo']);else if(m!=null&&m<margMin())o.push(['margem','Margem baixa']);
 lastIssues.forEach(x=>{if(x.includes(p.desc)&&/cortada|pequena/i.test(x))o.push(['nome',/cortada/i.test(x)?'Nome não cabe':'Letra do nome pequena'])});
 if((p.zoom||1)>1.25||(p.dy||0)<-0.04)o.push(['sobre','Foto encostando no nome']);else{const f=imgFill(p);if(f!=null&&f<0.4)o.push(['imgpeq','Foto pequena no espaço'])}
 return o}
const ABREV=[[/\brefrigerante\b/gi,'Refri'],[/\bsem\b/gi,'s/'],[/\bcom\b/gi,'c/'],[/\bpacote\b/gi,'pct'],[/\bcaixa\b/gi,'cx'],[/\bunidades?\b/gi,'un'],[/\bgarrafa\b/gi,'gf'],[/\btradicional\b/gi,'trad.'],[/\bembalagem\b/gi,''],[/\bsabor(es)?\b/gi,''],[/\btipo\b/gi,'T'],[/\bquilo(s)?\b/gi,'kg'],[/\blitro(s)?\b/gi,'L'],[/\bgramas?\b/gi,'g'],[/\bmililitros?\b/gi,'ml'],[/\bvariados?\b/gi,'']];
function shortName(t){let x=' '+t+' ';ABREV.forEach(([r,v])=>x=x.replace(r,v));x=x.replace(/\s*\([^)]*\)/g,'').replace(/\s+-\s+.*$/,'').replace(/\s{2,}/g,' ').trim();
 if(x.length>30){const w=x.split(' '),keep=[];for(const k of w){if((keep.join(' ')+' '+k).trim().length>30&&!/\d/.test(k))continue;keep.push(k)}x=keep.join(' ')}return x}
function fixIssue(p,t){
 if(t==='foto'){openPhotoSource(p);return}
 if(t==='preco'){wzOpen=p.id;wzCheck();setTimeout(()=>{const i=document.querySelector(`.wzP[data-id="${p.id}"] [data-k=price]`);if(i)i.focus()},60);return}
 if(t==='appinv'){[p.price,p.app]=[p.app,p.price];changed();toast('Preços trocados: o maior virou sem app');return}
 if(t==='margem'){if(!(p.cost>0))return;const mn=p.cost/(1-margMin()),nv=priceEnd(mn*1.0001,mn);if(hasApp(p))p.app=Math.max(nv,p.app||0);else p.price=nv;changed();toast(`Preço ajustado para ${brl(nv)}${hasApp(p)?' no app':''}, a margem mínima. Desfazer volta.`,5000);return}
 if(t==='nome'){if((p.descK||1)<1.7){p.descK=Math.min(1.7,(p.descK||1)+0.25);changed();toast('Letra do nome aumentada. Se ainda ficar pequena, toque de novo.',4000);return}const nv=shortName(p.desc);if(nv===p.desc){wzOpen=p.id;wzCheck();toast('Não deu para encurtar sozinho: edite o nome');setTimeout(()=>{const i=document.querySelector(`.wzP[data-id="${p.id}"] [data-k=desc]`);if(i)i.focus()},60);return}p.desc=nv;changed();toast(`Nome encurtado: ${nv}`,4000);return}
 if(t==='sobre'){p.zoom=1;p.dy=0;changed();toast('Foto voltou ao tamanho certo');return}
 if(t==='imgpeq'){const img=getImg(p);if(img&&img.width/img.height<1){p.multi='5'}else{p.zoom=Math.min(1.25,(p.zoom||1)+0.2)}changed();toast('Foto ajustada no espaço');return}}
function fixAll(){let n=0;S.products.forEach(p=>prodIssues(p).forEach(([t])=>{if(['appinv','nome','sobre','imgpeq'].includes(t)){fixIssue(p,t);n++}}));toast(n?`${n} ajustes automáticos feitos. Foto, preço e margem você confere.`:'Nada para ajustar sozinho: foto, preço e margem precisam de você.',4500)}
/* ligado ao StarIA? e qual a margem na oferta (o funcionário não vê a margem) */
function starTag(p){const lk=/^\d+$/.test(String(p.code||''))&&p.cost>0;if(!lk)return'<span class="stTag off" title="Produto sem código e custo do StarIA">sem StarIA</span>';
 const m=margem(p);if(m==null||isFunc())return'<span class="stTag on">StarIA</span>';const bad=m<margMin(),neg=m<0;
 return`<span class="stTag on ${neg?'neg':bad?'bad':''}" title="Margem com o preço ${hasApp(p)?'do app':'da oferta'}; custo ${brl(p.cost)}">StarIA • ${(m*100).toFixed(1).replace('.',',')}%</span>`}
let wzOpen=null;
/* logos deste encarte: toque para tirar ou pôr de volta (ação de uma loja só) */
function renderLogoT(){const el=$('#wzLogos');if(!el)return;const off=S.logoOff||{};const have=[0,1].filter(i=>logos[i]);
 el.innerHTML=have.length<2?'':'<small>Logos</small>'+have.map(i=>`<button data-i="${i}" class="${off[i]?'':'on'}" title="${off[i]?'Toque para pôr de volta':'Toque para tirar deste encarte'}"><i style="background-image:url('${logos[i].url}')"></i>${off[i]?'fora':'✓'}</button>`).join('');
 el.querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=+b.dataset.i,o=Object.assign({},S.logoOff||{});if(!o[i]&&have.filter(k=>!o[k]).length<=1){toast('Pelo menos uma logo precisa ficar');return}o[i]=!o[i];if(!o[i])delete o[i];S.logoOff=o;changed();renderLogoT()})}
/* arrastar para cima e para baixo: muda a ordem e o lugar no encarte */
function wzDragStart(e){e.preventDefault();e.stopPropagation();const row=e.target.closest('.wzP'),list=$('#wzList');row.classList.add('dragging');try{e.target.setPointerCapture(e.pointerId)}catch(_){}
 const move=ev=>{const y=ev.clientY;const rows=[...list.querySelectorAll('.wzP')].filter(r=>r!==row);let before=null;for(const r of rows){const b=r.getBoundingClientRect();if(y<b.top+b.height/2){before=r;break}}
  if(before)list.insertBefore(row,before);else list.appendChild(row);const lb=list.getBoundingClientRect();if(y<80)window.scrollBy(0,-12);else if(y>innerHeight-60)window.scrollBy(0,12)};
 const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);row.classList.remove('dragging');
  const ids=[...list.querySelectorAll('.wzP')].map(r=>r.dataset.id),old=S.products.map(p=>p.id).join();S.products.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));if(S.products.map(p=>p.id).join()!==old){changed();wzCheck()}};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',up)}
function wzCheck(){const el=$('#wzList');if(!el)return;document.querySelectorAll('.wzTools').forEach(x=>x.hidden=isFunc());
 renderLogoT();
 document.querySelectorAll('#wzVal button').forEach(b=>{b.classList.toggle('on',(camp().validPos||'')===b.dataset.v);b.onclick=()=>{camp().validPos=b.dataset.v;S._sharedDirty=true;changed();wzCheck()}});
 document.querySelectorAll('#wzEst button').forEach(b=>{b.classList.toggle('on',(camp().estilo||'')===b.dataset.v);b.onclick=()=>{camp().estilo=b.dataset.v;S._sharedDirty=true;changed();wzCheck()}});
 const fm=$('#wzFmt');if(fm){fm.innerHTML=Object.entries(FORMATS).map(([k,f])=>`<button data-f="${k}" class="${S.format===k?'on':''}">${f.label}</button>`).join('');fm.querySelectorAll('button').forEach(b=>b.onclick=()=>{S.format=b.dataset.f;S.page=0;renderFormats();changed();wzCheck()})}
 const{P,n}=pageInfo();
 const N=S.products.length,pg=P[S.page],nf=pg&&pg.items?pg.items.filter(p=>p.featured).length:0;
 $('#wzPages').innerHTML=(n>1?P.map((q,i)=>{const before=P.slice(0,i).reduce((a,x)=>a+x.items.length,0),last=i===n-1;
   const cnt=q.items.length+vagasDe(q),mx=Math.max(40,cnt);return`<div class="wzPg ${i===S.page?'on':''}"><button data-i="${i}">${arteNome(i,q)}</button><select data-i="${i}" title="Quantos produtos nesta arte">${Array.from({length:mx},(_,k)=>k+1).map(k=>`<option ${k===cnt?'selected':''}>${k}</option>`).join('')}</select><small>itens${vagasDe(q)?` • <b style="color:#b3121b">${vagasDe(q)} vagas</b>`:''}</small></div>`}).join(''):'')
  +(isFunc()?'':`<div class="wzPg dst"><small>Destaque${n>1?' nesta arte':''}</small>${[0,1,2,4].map(k=>`<button data-d="${k}" class="${nf===k?'on':''}">${k===0?'Nenhum':k}</button>`).join('')}</div>`);
 $('#wzPages').querySelectorAll('.wzPg button[data-i]').forEach(b=>b.onclick=()=>{S.page=+b.dataset.i;schedule();wzCheck()});
 $('#wzPages').querySelectorAll('select[data-i]').forEach(sel=>sel.onchange=()=>{const i=+sel.dataset.i,last=i===P.length-1,a=P.map(q=>({t:'m',lay:'auto',n:q.items.length+vagasDe(q),grow:false}));a[i].n=+sel.value;
  if(!last){const tl=a[a.length-1];if(!(vagasDe(P[P.length-1]))){tl.grow=true;delete tl.n}}setArtes(S.format,a);S.page=i;changed();wzCheck()});
 $('#wzPages').querySelectorAll('button[data-d]').forEach(b=>b.onclick=()=>{const k=+b.dataset.d,its=pageInfo().P[S.page].items;const cur=its.filter(p=>p.featured);
  its.forEach(p=>{p.featured=false});const keep=cur.slice(0,k);its.filter(p=>!keep.includes(p)).slice(0,k-keep.length).forEach(p=>keep.push(p));keep.forEach(p=>{p.featured=true;p.papel=''});changed();wzCheck()});
 const bad=S.products.filter(p=>prodIssues(p).length),gen=[];if(!S.val.ini)gen.push('Validade não preenchida');
 $('#wzSum').innerHTML=bad.length||gen.length?`<div class="wzBad">${bad.length} ${bad.length>1?'produtos precisam':'produto precisa'} de atenção. Toque em Ajustar ao lado do problema. <button class="btn sm" id="wzFixAll">Ajustar tudo que dá</button></div>`:`<div class="wzGood">Tudo certo. Confira o encarte e toque em "Está certo".</div>`;
 setTimeout(()=>{const fa=$('#wzFixAll');if(fa)fa.onclick=fixAll},0);
 el.innerHTML=S.products.map(p=>{const is=prodIssues(p),ent=getImg(p)&&imgCache.get(imgKey(p));
  return`<div class="wzP ${is.length?'bad':''} ${wzOpen===p.id?'open':''}" data-id="${p.id}"><div class="wzPh"><span class="drg" title="Arraste para mudar a ordem">⠿</span><i class="ph ${ent?'':'no'}" ${ent?`style="background-image:url('${ent.url}')"`:''}>${ent?'':'sem foto'}</i><div><b>${esc(p.desc)}</b><small>${hasApp(p)?`sem app ${brl(p.price)} • com app ${brl(p.app)}`:p.price!=null?brl(p.price):'sem preço'}${p.limit>0?' • limite '+p.limit:''}</small>${is.map(x=>`<span class="flag r">${esc(x[1])}<button class="fx" data-fx="${x[0]}">Ajustar</button></span>`).join('')}</div>${starTag(p)}<span class="chev">${wzOpen===p.id?'▴':'▾'}</span></div>
  ${wzOpen===p.id?wzFix(p):''}</div>`}).join('');
 el.querySelectorAll('.wzP .drg').forEach(h=>h.addEventListener('pointerdown',wzDragStart));
 el.querySelectorAll('.wzP .fx').forEach(b=>b.onclick=e=>{e.stopPropagation();const p=S.products.find(x=>x.id===b.closest('.wzP').dataset.id);if(p)fixIssue(p,b.dataset.fx)});
 el.querySelectorAll('.wzP').forEach(row=>{const p=S.products.find(x=>x.id===row.dataset.id);row.querySelector('.wzPh').onclick=e=>{if(e.target.closest('.drg'))return;wzOpen=wzOpen===p.id?null:p.id;wzCheck()};if(wzOpen===p.id)wzBindFix(row,p)})}
function wzFix(p){const sg=getImg(p)?[]:photoSugs(p);return`<div class="wzFix">
 ${!getImg(p)?`<div class="wzSug"><small>${sg.length?'Fotos parecidas do banco, toque para usar:':'Nenhuma foto parecida no banco ainda.'}</small><div>${sg.map(k=>`<button class="sg" data-k="${esc(k)}" style="background-image:url('${imgCache.get(k).url}')"></button>`).join('')}</div></div>`:''}
 <div class="bar"><button class="btn sm" data-a="pc">Foto do computador</button><button class="btn sm" data-a="web">Foto da internet</button><button class="btn sm dark" data-a="star">Buscar no StarIA</button></div>
 ${packOf(p)?`<label class="chk2"><input type="checkbox" data-pk ${p.precoKg?'checked':''}> Mostrar preço por ${packOf(p).u==='L'?'litro':'kg'} <small style="color:var(--mut);font-weight:500">(${esc(unitPriceText(p,true,true)||'')} • use quando o preço por ${packOf(p).u==='L'?'litro':'kg'} parecer barato)</small></label>`:''}
 <div class="szR"><span>Letra do nome</span><button data-sz="desc-">A−</button><b>${Math.round((p.descK||1)*100)}%</b><button data-sz="desc+">A+</button><span style="margin-left:10px">Posição do nome</span><button data-sz="nup" title="Subir o nome">↑</button><button data-sz="ndn" title="Descer o nome">↓</button>${p.phrase?`<span style="margin-left:14px">Frase</span><button data-sz="ph-">A−</button><b>${Math.round((p.phK||1)*100)}%</b><button data-sz="ph+">A+</button>${p.phX!=null?'<button data-sz="phR">posição original</button>':''}`:''}</div>
 ${p.phrase?'<p class="hint" style="margin:2px 0 6px">Para mudar a frase de lugar, arraste ela direto no encarte.</p>':''}
 <div class="row3"><label>Nome<input data-k="desc" value="${esc(p.desc)}"></label><label>${p.appOn?'Sem app':'Preço'}<input data-k="price" inputmode="decimal" value="${moneyIn(p.price)}"></label>${p.appOn?`<label>Com app<input data-k="app" inputmode="decimal" value="${moneyIn(p.app)}"></label>`:''}</div>
 <div class="bar">${isFunc()?'':`<button class="btn sm ${p.featured?'dark':''}" data-a="dest">`}${isFunc()?'':(p.featured?'Tirar do destaque':'Pôr em destaque')+'</button>'}<button class="btn sm ghost" data-a="fino">Ajuste fino (frase, zoom, limite…)</button><button class="btn sm ghost l" data-a="del">Excluir produto</button></div></div>`}
function wzBindFix(row,p){const f=row.querySelector('.wzFix');
 f.querySelectorAll('.sg').forEach(b=>b.onclick=()=>{p.imgAlias=b.dataset.k;p.autoFoto=false;delete p.noAuto;rememberPhoto(p);changed();wzCheck()});
 f.querySelector('[data-a=pc]').onclick=()=>pickFor(p);f.querySelector('[data-a=web]').onclick=()=>openPhotoSource(p);f.querySelector('[data-a=star]').onclick=()=>openStarSearch(p);
 f.querySelector('[data-a=fino]').onclick=()=>openEditor(p.id);
 const dz=f.querySelector('[data-a=dest]');if(dz)dz.onclick=()=>{if(!p.featured){const its=(pageInfo().P.find(q=>q.items.includes(p))||{items:[]}).items;if(its.filter(x=>x.featured).length>=4){toast('No máximo 4 destaques por arte');return}}p.featured=!p.featured;p.papel='';changed();wzCheck()};f.querySelector('[data-a=del]').onclick=()=>confirmDel(p);
 f.querySelectorAll('[data-sz]').forEach(b=>b.onclick=()=>{const v=b.dataset.sz;NMV(p,v);if(v==='desc+')p.descK=Math.min(1.8,(p.descK||1)+0.15);if(v==='desc-')p.descK=Math.max(0.7,(p.descK||1)-0.15);if(v==='ph+')p.phK=Math.min(2.2,(p.phK||1)+0.15);if(v==='ph-')p.phK=Math.max(0.5,(p.phK||1)-0.15);if(v==='phR'){delete p.phX;delete p.phY}changed();wzCheck()});
 const pk=f.querySelector('[data-pk]');if(pk)pk.onchange=()=>{p.precoKg=pk.checked;changed();wzCheck()};
 f.querySelectorAll('[data-k]').forEach(i=>{i.oninput=()=>{const k=i.dataset.k;p[k]=k==='desc'?i.value:parseMoney(i.value);changed(false)};i.onchange=()=>wzCheck()})}
/* passo 4: baixar */
function wzDown(){const n=pageInfo().n;$('#wzEnc').innerHTML=`Encarte<small>${FORMATS[S.format].label} • ${S.format==='insta'?'WhatsApp e Instagram':S.format==='story'?'status e story':S.format==='tv'?'TV e telão':'para imprimir'}</small>`;$('#wzStory').hidden=S.format==='story';$('#wzDInfo').textContent=`${camp().nome} • ${S.products.length} produtos • ${n>1?n+' artes':'1 arte'} • ${(()=>{const v=validText();return v?v.charAt(0)+v.slice(1).toLowerCase():'sem validade'})()}`}
async function dlEncarte(){await fontsReady();if(!await reviewGate(S.products))return;const P=pagesFor(S.format),f=FORMATS[S.format];snapshotKit();
 for(let i=0;i<P.length;i++){const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,P[i].items,camp(),[],P[i].lay);const ok=await saveFile(fname('png',P.length>1?'_'+(i===0?'frente':i===1?'verso':'arte'+(i+1)):''),await toBlob(c),'img');if(!ok&&P.length>1)break}}
async function dlStory(){await fontsReady();const P=pagesFor('story'),f=FORMATS.story;for(let i=0;i<P.length;i++){const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,P[i].items,camp(),[],P[i].lay);const ok=await saveFile(fname('png','_story'+(P.length>1?'_'+(i+1):'')),await toBlob(c),'img');if(!ok&&P.length>1)break}}
function dlTv(){modal(`<h3>TV da loja</h3><div class="wzBig"><button class="btn pri" data-a="vid">Gerar vídeo<small>um produto por vez, para pendrive ou status</small></button><button class="btn dark" data-a="pub">Publicar na TV<small>a TV da loja atualiza sozinha</small></button></div><div class="mfoot"><button class="btn" data-a="n">Voltar</button></div>`,b=>{b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=vid]').onclick=()=>$('#bVid').click();b.querySelector('[data-a=pub]').onclick=()=>$('#cbTv').click()})}
/* desfazer */
const UNDO=[];let undoT,undoing=false;
function undoSnap(){if(undoing)return;clearTimeout(undoT);undoT=setTimeout(()=>{const s=JSON.stringify({products:S.products,val:S.val,campaignId:S.campaignId,artes:S.artes});if(UNDO[UNDO.length-1]!==s){UNDO.push(s);if(UNDO.length>60)UNDO.shift()}updUndo()},350)}
function updUndo(){document.querySelectorAll('.bUndo').forEach(b=>b.disabled=UNDO.length<2)}
function undo(){if(UNDO.length<2){toast('Nada para desfazer');return}UNDO.pop();const d=JSON.parse(UNDO[UNDO.length-1]);undoing=true;Object.assign(S,d);changed();undoing=false;renderCamps();if(inWz())wzGo(WZ);updUndo();toast('Desfeito')}
document.addEventListener('keydown',e=>{const tg=e.target,typing=tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA');
 if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo();return}
 if(e.key==='Enter'&&inWz()&&$('#modal').hidden&&!typing){if(WZ===3){e.preventDefault();wzGo(4)}}
 if(e.key==='Enter'&&inWz()&&WZ===2&&tg&&tg.id==='wzTx'&&(e.ctrlKey||e.metaKey)){e.preventDefault();wzMontar()}});
$('#wzTx').oninput=wzPrevList;$('#wzMont').onclick=wzMontar;
$('#wzIni').onchange=()=>{if(!$('#wzFim').value||$('#wzFim').value<$('#wzIni').value)$('#wzFim').value=$('#wzIni').value;wzSetVal();changed(false)};$('#wzFim').onchange=()=>{wzSetVal();changed(false)};
$('#wzOkCheck').onclick=()=>{const v=pageInfo().P.reduce((a,q)=>a+vagasDe(q),0);if(v){toast(`Ainda tem ${v} vaga${v>1?'s':''} sem produto. Preencha ou diminua a quantidade.`,4500);return}wzGo(4)};
$('#wzLay').onclick=()=>{if(isFunc()){toast('Diagramação travada no modo funcionário');return}openLayPicker(S.page)};$('#wzBack2').onclick=()=>wzGo(2);
function wzAdd(){const v=pageInfo().P.reduce((a,q)=>a+vagasDe(q),0);
 modal(`<h3>Acrescentar produtos</h3>${v?`<p class="hint">Tem <b>${v} vagas</b> esperando produto. Os que você colar entram nelas, em ordem.</p>`:''}<textarea id="addTx" style="min-height:150px" placeholder="Feijão Kicaldo 1kg 6,99&#10;Coca-Cola 2L 9,99 8,99"></textarea><div id="addPv" class="hint"></div><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Acrescentar</button></div>`,b=>{
  const tx=$('#addTx');tx.oninput=()=>{const L=parseQuick(tx.value);$('#addPv').textContent=L.length?`Entendi ${L.length} produto${L.length>1?'s':''}.`:''};setTimeout(()=>tx.focus(),40);
  b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{const L=parseQuick(tx.value);if(!L.length){toast('Não achei produto com preço');return}S.products.push(...L);closeModal();changed();loadAllImages();wzCheck()}})}
$('#wzAddMore').onclick=wzAdd;
$('#wzEnc').onclick=dlEncarte;
$('#wzShare').onclick=async()=>{await fontsReady();if(!await reviewGate(S.products))return;const P=pagesFor(S.format),f=FORMATS[S.format],files=[];
 for(let i=0;i<P.length;i++){const c=document.createElement('canvas');c.width=f.w;c.height=f.h;renderFlyer(c.getContext('2d'),f.w,f.h,P[i].items,camp(),[],P[i].lay);files.push(new File([await toBlob(c)],fname('png',P.length>1?'_'+(i+1):''),{type:'image/png'}))}
 snapshotKit();
 try{if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title:camp().nome});return}}catch(e){if(e&&e.name==='AbortError')return}
 toast('Este aparelho não deixou compartilhar direto. Vou baixar a imagem para você mandar.',4500);for(const fl of files){const ok=await saveFile(fl.name,fl,'img');if(!ok)break}};$('#wzStory').onclick=dlStory;$('#wzPlaq').onclick=()=>$('#bPlaq').click();$('#wzTvB').onclick=dlTv;$('#wzKit').onclick=()=>$('#bKit').click();$('#wzA4').onclick=()=>$('#bPdf').click();
$('#wzNew').onclick=()=>wzGo(1);
function bankCount(){const el=$('#bankN');if(el)el.textContent=`${Object.keys(S.fotoNomes||{}).length+Object.keys(S.fotoEan||{}).length} fotos ligadas no banco`}
$('#bankUp').onclick=()=>$('#bankIn').click();
$('#bankIn').onchange=async e=>{const fs=[...e.target.files].filter(f=>f.type.startsWith('image/'));e.target.value='';if(!fs.length)return;let ok=0,bad=0;S.fotoNomes=S.fotoNomes||{};S.fotoEan=S.fotoEan||{};
 for(let i=0;i<fs.length;i++){const f=fs[i],nm=f.name.replace(/\.[^.]+$/,'').trim();toast(`Preparando fotos ${i+1}/${fs.length}…`,6000);
  try{const u=await processImage(await fileToURL(f),false),img=await loadImg(u);let k;
   if(/^\d{8,14}$/.test(nm)){k='e:'+nm;S.fotoEan[nm]=k}else if(/^\d{1,7}$/.test(nm)){k='c:'+nm}else{const nk=nameKey(nm);if(!nk){bad++;continue}k='n:'+nk;S.fotoNomes[nk]=k}
   imgCache.set(k,{img,url:u});await IDB.set(k,u);ok++}catch(err){bad++}}
 S._sharedDirty=true;changed();bankCount();toast(`${ok} fotos no banco${bad?` • ${bad} não abriram`:''}. Os produtos já procuram por elas sozinhos.`,5000)};$('#wzPadrao').onclick=openPadrao;
document.querySelectorAll('.bUndo').forEach(b=>b.onclick=undo);
$('#bDono').onclick=()=>{if(!inWz()){setUi('wz');return}
 if(isOwnerV()===true&&!isFunc()){setUi('dono');return}
 if(!S.store.pin){if(isOwnerV()===false){toast('O painel do dono é só do Eduardo.',4000);return}
  modal(`<h3>Crie a senha do dono</h3><p>O painel do dono mexe em cores, logos, campanhas e margem. Crie uma senha para o funcionário não entrar.</p><label>Senha nova<input id="pinNew" type="password" inputmode="numeric" autocomplete="new-password"></label><div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y">Salvar e entrar</button></div>`,b=>{
   b.querySelector('[data-a=n]').onclick=closeModal;b.querySelector('[data-a=y]').onclick=()=>{const v=$('#pinNew').value.trim();if(v.length<4){toast('Use pelo menos 4 números');return}S.store.pin=v;S._sharedDirty=true;$('#sPin').value=v;closeModal();persist();setUi('dono')}});return}
 askPin('Abrir o painel do dono',()=>setUi('dono'))};
$('#wzPrev').addEventListener('click',e=>{if(phMoved)return;const pv=$('#wzPrev'),r=pv.getBoundingClientRect(),x=(e.clientX-r.left)*pv.width/r.width,y=(e.clientY-r.top)*pv.height/r.height;
 for(let i=PREV_HIT.length-1;i>=0;i--){const h=PREV_HIT[i];if(x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h){if(String(h.id).startsWith('vaga')){wzAdd();return}wzOpen=h.id;wzCheck();const row=document.querySelector(`.wzP[data-id="${h.id}"]`);if(row)row.scrollIntoView({block:'nearest',behavior:'smooth'});return}}});

/* ================= cores do encarte (atalho rápido) ================= */
function openCores(){const c=camp();
 modal(`<h3>Cores e fundo: ${esc(c.nome)}</h3><p class="hint">Vale para todos os produtos desta campanha. Para mudar só um produto, use "Cor da caixa de preço" dentro dele.</p>
 <div class="colors">${Object.keys(COLOR_LABELS).map(k=>`<label>${COLOR_LABELS[k]}<input type="color" data-c="${k}" value="${c.cores[k]}"></label>`).join('')}</div>
 <label>Fundo dos produtos em destaque<select id="coDest">${DEST_FUNDOS.map(([v,t])=>`<option value="${v}" ${(c.destFundo||'raios')===v?'selected':''}>${t}</option>`).join('')}</select></label>
 <div class="mfoot"><button class="btn pri" data-a="ok">Pronto</button></div>`,b=>{const M=$('#modal');M.classList.add('side');M.classList.toggle('r',inWz());M.classList.toggle('l',!inWz());
  b.querySelectorAll('[data-c]').forEach(i=>i.addEventListener('input',()=>{c.cores[i.dataset.c]=i.value;S._sharedDirty=true;changed(false)}));
  $('#coDest').onchange=e=>{c.destFundo=e.target.value;S._sharedDirty=true;changed()};
  b.querySelector('[data-a=ok]').onclick=()=>{closeModal();renderCamps()}})}
$('#wzCores').onclick=openCores;
/* ================= cabeçalho pronto (só o topo, feito no Photoshop) ================= */
const HEADC=new Map();
function headImg(cp){if(!cp||!cp.headArt)return null;const key='head:'+cp.id;let e=HEADC.get(key);
 if(!e){e={img:null};HEADC.set(key,e);IDB.get(key).then(async u=>{if(u){try{e.url=u;e.img=await loadImg(u);schedule();renderHeadBox()}catch(_){}}else HEADC.delete(key)})}return e.img}
function headOf(cp,W,H){if(W>H)return null;const im=headImg(cp);if(!im)return null;return{img:im,hh:Math.min(W*im.height/im.width,H*0.42)}}
/* tira cores do cabeçalho: dominante vira fundo, a mais viva vira etiqueta de preço, a clara/amarela vira adesivo */
function headColors(img){const k=Math.min(1,96/Math.max(img.width,img.height)),w=Math.max(1,img.width*k|0),h=Math.max(1,img.height*k|0),cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h).data;
 const B=new Map();for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;const r=d[i]>>4,g=d[i+1]>>4,b=d[i+2]>>4,key=(r<<8)|(g<<4)|b;const o=B.get(key)||{n:0,r:0,g:0,b:0};o.n++;o.r+=d[i];o.g+=d[i+1];o.b+=d[i+2];B.set(key,o)}
 const L=[...B.values()].map(o=>{const r=o.r/o.n,g=o.g/o.n,b=o.b/o.n,mx=Math.max(r,g,b),mn=Math.min(r,g,b);return{n:o.n,r,g,b,sat:mx?(mx-mn)/mx:0,lum:(0.299*r+0.587*g+0.114*b)/255,hue:hueOf(r,g,b)}}).sort((a,b)=>b.n-a.n);
 const hex=o=>'#'+[o.r,o.g,o.b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
 const far=(a,b)=>Math.abs(a.lum-b.lum)>0.25||Math.min(Math.abs(a.hue-b.hue),360-Math.abs(a.hue-b.hue))>40;
 const tot=L.reduce((s,o)=>s+o.n,0)||1,big=L.filter(o=>o.n/tot>0.004);
 let fundo=big.find(o=>o.lum>0.06&&o.lum<0.5)||big.find(o=>o.lum>0.06&&o.lum<0.8)||big[0]||{r:18,g:58,b:143,lum:0.25,sat:0.8,hue:220};
 let preco=big.filter(o=>o.sat>0.55&&o.lum>0.22&&o.lum<0.7&&far(o,fundo)).sort((a,b)=>(b.sat*b.sat*Math.sqrt(b.n))-(a.sat*a.sat*Math.sqrt(a.n)))[0]||{r:215,g:25,b:32,lum:0.25,sat:0.9,hue:357};
 let ades=big.filter(o=>o.lum>0.55&&o.sat>0.35&&far(o,fundo)&&far(o,preco)).sort((a,b)=>b.n-a.n)[0]||{r:255,g:212,b:0,lum:0.8,sat:1,hue:50};
 const cab=big.find(o=>o!==fundo&&o.lum<0.5&&far(o,fundo)&&o!==preco)||{r:fundo.r*0.7,g:fundo.g*0.7,b:fundo.b*0.7};
 const P=hex(preco),A=hex(ades);return{fundo:hex(fundo),cabecalho:hex(cab),titulo:'#ffffff',preco:P,precoTexto:hexLum(P)>0.6?'#111111':'#ffffff',adesivo:A,adesivoTexto:hexLum(A)>0.6?'#111111':'#ffffff',cartao:'#ffffff'}}
function hueOf(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h}
const HEAD_LIB=[{id:'segter',nome:'Ofertas: carrinho cheio, preço caindo',src:'/encartes/modelos/head_segter.jpg',cores:{fundo:'#8f1016',cabecalho:'#5e0a0e',titulo:'#ffffff',preco:'#d71920',precoTexto:'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'}},
 {id:'quarta',nome:'Quarta Imbatível: preto, estilo Black Friday',src:'/encartes/modelos/head_quarta.jpg?v=2',cores:{fundo:'#0e0e12',cabecalho:'#000000',titulo:'#ffffff',preco:'#ffc400',precoTexto:'#111111',adesivo:'#e0181f',adesivoTexto:'#ffffff',cartao:'#ffffff'}},
 {id:'quinta',nome:'Açougue: açougueiro cortando carne',src:'/encartes/modelos/head_quinta.jpg',cores:{fundo:'#2b0c0c',cabecalho:'#170706',titulo:'#ffffff',preco:'#c8141c',precoTexto:'#ffffff',adesivo:'#ffc400',adesivoTexto:'#111111',cartao:'#ffffff'}}];
async function applyHead(u,cores){const img=await loadImg(u);if(img.width<900)toast(`Atenção: o cabeçalho tem só ${img.width} px de largura. Vai ficar borrado. Exporte com 1080 px.`,6000);
 if(img.height/img.width>0.7)toast('Esse cabeçalho é alto demais: o app vai cortar em 42% da altura do encarte.',5000);
 const cp=camp(),key='head:'+cp.id;await IDB.set(key,u);cloudPutImage(key,u);HEADC.set(key,{img,url:u});cp.headArt=true;cp.cores=Object.assign({},cp.cores,cores||headColors(img));
 S._sharedDirty=true;changed();renderCamps();renderHeadBox();toast('Cabeçalho aplicado. As cores do encarte saíram dele; ajuste em Cores se quiser.',4500)}
function renderHeadBox(){const el=$('#headBox');if(!el)return;const cp=camp(),im=headImg(cp);
 el.innerHTML=`<p class="hint">Faça no Photoshop <b>só o topo</b> do encarte, na largura de <b>1080 px</b> (a altura você escolhe; até uns 550 px fica bom). O app tira as cores dele e monta produtos e rodapé por baixo. Vale para Instagram, story e A4. Na TV (deitado) o app usa só o nome da campanha, sem a arte.</p>
 ${cp.headArt?`<div style="margin:8px 0;border-radius:8px;overflow:hidden;border:1px solid #ddd;background:#222">${im?`<img src="${HEADC.get('head:'+cp.id).url||''}" style="display:block;width:100%">`:'<p class="hint" style="color:#ccc;padding:8px">carregando…</p>'}</div>`:''}
 <p class="hint" style="margin:6px 0 4px"><b>Cabeçalhos com foto prontos</b> (toque para usar nesta campanha):</p><div class="hlib">${HEAD_LIB.map(h=>`<button data-hl="${h.id}" title="${esc(h.nome)}"><img src="${h.src}" alt=""><span>${esc(h.nome)}</span></button>`).join('')}</div>
 <div class="bar"><button class="btn sm pri" id="headUp">${cp.headArt?'Trocar cabeçalho':'Subir cabeçalho pronto'}</button>${cp.headArt?'<button class="btn sm" id="headCol">Tirar as cores de novo</button><button class="btn sm" id="headRm">Remover</button>':''}</div>
 ${cp.headArt?`<label class="chk2"><input type="checkbox" id="headLogo" ${cp.headLogos?'checked':''}> Colocar as logomarcas por cima (deixe desmarcado se a logo já está na arte)</label>`:''}`;
 $('#headUp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files[0];if(!f)return;try{
   const u0=await fileToURL(f),i0=await loadImg(u0),k=Math.min(1,1600/i0.width),c=document.createElement('canvas');c.width=Math.round(i0.width*k);c.height=Math.round(i0.height*k);c.getContext('2d').drawImage(i0,0,0,c.width,c.height);
   const png=/png/i.test(f.type),u=c.toDataURL(png?'image/png':'image/jpeg',0.92);await applyHead(u)}catch(_){toast('Não consegui abrir essa imagem')}};i.click()};
 el.querySelectorAll('[data-hl]').forEach(x=>x.onclick=async()=>{try{const it=HEAD_LIB.find(h=>h.id===x.dataset.hl),i0=await loadImg(it.src),c=document.createElement('canvas');c.width=i0.width;c.height=i0.height;c.getContext('2d').drawImage(i0,0,0);await applyHead(c.toDataURL('image/jpeg',0.92),it.cores)}catch(_){toast('Não consegui carregar esse cabeçalho')}});
 const hc=$('#headCol');if(hc)hc.onclick=()=>{const im=headImg(camp());if(!im)return;undoSnap&&undoSnap();camp().cores=Object.assign({},camp().cores,headColors(im));S._sharedDirty=true;changed();renderCamps();toast('Cores tiradas do cabeçalho de novo')};
 const hr=$('#headRm');if(hr)hr.onclick=()=>{if(!confirm('Remover o cabeçalho pronto desta campanha? As cores continuam.'))return;const cp=camp();cp.headArt=false;HEADC.delete('head:'+cp.id);IDB.del&&IDB.del('head:'+cp.id);S._sharedDirty=true;changed();renderHeadBox()};
 const hl=$('#headLogo');if(hl)hl.onchange=()=>{camp().headLogos=hl.checked;S._sharedDirty=true;changed()}}
/* ================= editor: novo modelo a partir de imagem ================= */
function modBtn(){const b=$('#modEd');if(b){const m=getMod(camp().modelo);b.hidden=!(m&&m.slots)}}
async function openModEditor(edit){
 let M=edit?JSON.parse(JSON.stringify(edit)):null,img=null,url=null;
 if(edit){img=modeloBg(edit);url=await IDB.get('mod:'+edit.id);if(!img&&url)img=await loadImg(url)}
 let mode='p',sel=-1,drag=null,test=false;
 modal(`<h3>${edit?'Editar modelo':'Novo modelo a partir de imagem'}</h3>
 <div id="mdUp" ${img?'hidden':''}><p class="hint">Escolha o encarte em JPG ou PNG <b>sem produtos, preços e data</b>. Se só tiver o encarte pronto, mande para o Claude no chat que ele devolve o fundo limpo.</p><button class="btn pri" id="mdFile">Escolher imagem</button><input type="file" id="mdIn" accept="image/*" hidden></div>
 <div id="mdEd" ${img?'':'hidden'}>
  <div class="wzTools"><div class="seg2" id="mdMode"><button data-m="p" class="on">Marcar produto</button><button data-m="d">Marcar data</button></div>
   <button class="btn sm" id="mdDel">Apagar vaga</button><button class="btn sm" id="mdTest">Testar com produtos</button><b id="mdN" style="margin-left:auto"></b></div>
  <p class="hint" id="mdHint">Arraste em cima de cada vaga de produto, na ordem (1 é o primeiro item da lista). Clique numa vaga para mover; puxe o canto de baixo à direita para mudar o tamanho.</p>
  <canvas id="mdCv" style="width:100%;max-height:62vh;object-fit:contain;display:block;background:#222;touch-action:none;cursor:crosshair"></canvas>
  <div class="row3" style="margin-top:10px"><label>Nome do modelo<input id="mdNome" value="${esc(M?M.nome:'')}" placeholder="Ex.: Feirão de Sábado"></label>
   <label>Cor da etiqueta de preço<input type="color" id="mdTag" value="${M?M.tag:'#d71920'}"></label><label>Cor da data<input type="color" id="mdDc" value="${M?M.dataCor:'#ffffff'}"></label></div>
 </div>
 <div class="mfoot"><button class="btn" data-a="n">Cancelar</button><button class="btn pri" data-a="y" ${img?'':'disabled'}>Salvar modelo</button></div>`,b=>{b.classList.add('wide');
  const cv=$('#mdCv'),x=cv.getContext('2d');
  const setImg=async(u)=>{url=u;img=await loadImg(u);M=M||{id:'m'+uid().slice(1),nome:'',slots:[],data:null,tag:'#d71920',dataCor:'#ffffff'};M.W=img.width;M.H=img.height;cv.width=img.width;cv.height=img.height;$('#mdUp').hidden=true;$('#mdEd').hidden=false;b.querySelector('[data-a=y]').disabled=false;draw()};
  const pt=e=>{const r=cv.getBoundingClientRect(),s=Math.min(r.width/cv.width,r.height/cv.height),ow=(r.width-cv.width*s)/2,oh=(r.height-cv.height*s)/2;return[(e.clientX-r.left-ow)/s,(e.clientY-r.top-oh)/s]};
  const lw=()=>Math.max(3,cv.width/300);
  function draw(){if(!img)return;cv.width=M.W;cv.height=M.H;
   if(test){const L=sample();const cp=Object.assign({},camp(),{modelo:'__t',cores:Object.assign({},camp().cores,{preco:$('#mdTag').value,precoTexto:hexLum($('#mdTag').value)>0.6?'#111111':'#ffffff'})});
    const tmp=Object.assign({},M,{nome:'t',dataCor:$('#mdDc').value});MODIMG.set('mod:'+tmp.id,{img});CUR={W:M.W,H:M.H,noCards:false};drawModeloU(x,M.W,M.H,L,cp,[],tmp);return}
   x.drawImage(img,0,0);const f=lw();
   M.slots.forEach((s,i)=>{x.fillStyle=i===sel?'rgba(255,212,0,.35)':'rgba(215,25,32,.28)';x.fillRect(s.x,s.y,s.w,s.h);x.strokeStyle=i===sel?'#ffd400':'#ff3b3b';x.lineWidth=f;x.strokeRect(s.x,s.y,s.w,s.h);
    const z=Math.min(s.w,s.h)*0.3;x.fillStyle='#fff';x.font=F(z);x.textAlign='center';x.textBaseline='middle';x.lineWidth=z*0.08;x.strokeStyle='#000';x.strokeText(String(i+1),s.x+s.w/2,s.y+s.h/2);x.fillText(String(i+1),s.x+s.w/2,s.y+s.h/2);
    if(i===sel){x.fillStyle='#ffd400';x.fillRect(s.x+s.w-f*6,s.y+s.h-f*6,f*6,f*6)}});
   if(M.data){const[a,b2,c2,d]=M.data;x.fillStyle=sel===-2?'rgba(0,160,255,.4)':'rgba(0,140,255,.28)';x.fillRect(a,b2,c2,d);x.strokeStyle='#29a3ff';x.lineWidth=f;x.strokeRect(a,b2,c2,d);x.fillStyle='#fff';const z=Math.min(c2,d)*0.3;x.font=F(z);x.textAlign='center';x.textBaseline='middle';x.fillText('DATA',a+c2/2,b2+d/2)}
   $('#mdN').textContent=`${M.slots.length} vaga${M.slots.length===1?'':'s'}${M.data?' • data marcada':' • sem data'}`}
  function sample(){const L=S.products.slice(0,M.slots.length);while(L.length<M.slots.length)L.push({id:'ex'+L.length,desc:'Produto exemplo '+(L.length+1),price:9.99,unit:'un'});return L}
  const hitR=(px,py)=>{for(let i=M.slots.length-1;i>=0;i--){const s=M.slots[i];if(px>=s.x&&px<=s.x+s.w&&py>=s.y&&py<=s.y+s.h)return i}if(M.data){const[a,b2,c2,d]=M.data;if(px>=a&&px<=a+c2&&py>=b2&&py<=b2+d)return -2}return -1};
  const R=i=>i===-2?{get x(){return M.data[0]},set x(v){M.data[0]=v},get y(){return M.data[1]},set y(v){M.data[1]=v},get w(){return M.data[2]},set w(v){M.data[2]=v},get h(){return M.data[3]},set h(v){M.data[3]=v}}:M.slots[i];
  cv.onpointerdown=e=>{if(test){test=false;$('#mdTest').textContent='Testar com produtos'}const[px,py]=pt(e);cv.setPointerCapture(e.pointerId);const f=lw()*8;
   if(sel!==-1){const r=R(sel);if(r&&Math.abs(px-(r.x+r.w))<f&&Math.abs(py-(r.y+r.h))<f){drag={t:'rs',sx:px,sy:py,w:r.w,h:r.h};return}}
   const h=hitR(px,py);if(h!==-1){sel=h;const r=R(h);drag={t:'mv',sx:px,sy:py,x:r.x,y:r.y};draw();return}
   sel=-1;drag={t:'new',sx:px,sy:py};if(mode==='d'){M.data=[px,py,1,1];sel=-2}else{M.slots.push({x:px,y:py,w:1,h:1});sel=M.slots.length-1}draw()};
  cv.onpointermove=e=>{if(!drag)return;const[px,py]=pt(e),r=R(sel);if(!r)return;
   if(drag.t==='new'){r.x=Math.min(drag.sx,px);r.y=Math.min(drag.sy,py);r.w=Math.abs(px-drag.sx);r.h=Math.abs(py-drag.sy)}
   else if(drag.t==='mv'){r.x=clamp(drag.x+px-drag.sx,0,M.W-r.w);r.y=clamp(drag.y+py-drag.sy,0,M.H-r.h)}
   else{r.w=Math.max(20,drag.w+px-drag.sx);r.h=Math.max(20,drag.h+py-drag.sy)}draw()};
  cv.onpointerup=()=>{if(drag&&drag.t==='new'){const r=R(sel);if(r&&(r.w<M.W*0.03||r.h<M.H*0.02)){if(sel===-2)M.data=null;else M.slots.splice(sel,1);sel=-1}else if(mode==='d'){mode='p';b.querySelectorAll('#mdMode button').forEach(q=>q.classList.toggle('on',q.dataset.m==='p'))}}drag=null;draw()};
  b.querySelectorAll('#mdMode button').forEach(q=>q.onclick=()=>{mode=q.dataset.m;b.querySelectorAll('#mdMode button').forEach(z=>z.classList.toggle('on',z===q));$('#mdHint').textContent=mode==='d'?'Arraste o retângulo onde a data e a validade devem aparecer (só uma área).':'Arraste em cima de cada vaga de produto, na ordem (1 é o primeiro item da lista). Clique numa vaga para mover; puxe o canto de baixo à direita para mudar o tamanho.'});
  $('#mdDel').onclick=()=>{if(sel===-2)M.data=null;else if(sel>=0)M.slots.splice(sel,1);else{toast('Clique numa vaga primeiro');return}sel=-1;draw()};
  $('#mdTest').onclick=async()=>{await fontsReady();test=!test;$('#mdTest').textContent=test?'Voltar a marcar':'Testar com produtos';sel=-1;draw()};
  $('#mdTag').oninput=$('#mdDc').oninput=()=>{if(test)draw()};
  $('#mdFile').onclick=()=>$('#mdIn').click();
  $('#mdIn').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const u0=await fileToURL(f),i0=await loadImg(u0),k=Math.min(1,2400/Math.max(i0.width,i0.height)),c=document.createElement('canvas');c.width=Math.round(i0.width*k);c.height=Math.round(i0.height*k);c.getContext('2d').drawImage(i0,0,0,c.width,c.height);await setImg(c.toDataURL('image/jpeg',0.9))}catch(_){toast('Não consegui abrir essa imagem')}};
  if(img){cv.width=M.W;cv.height=M.H;draw()}
  b.querySelector('[data-a=n]').onclick=closeModal;
  b.querySelector('[data-a=y]').onclick=async()=>{if(!M.slots.length){toast('Marque pelo menos uma vaga de produto');return}
   M.nome=$('#mdNome').value.trim()||'Modelo '+fmtD(today());M.tag=$('#mdTag').value;M.dataCor=$('#mdDc').value;
   M.slots=M.slots.map(s=>({x:Math.round(s.x),y:Math.round(s.y),w:Math.round(s.w),h:Math.round(s.h)}));if(M.data)M.data=M.data.map(Math.round);
   const key='mod:'+M.id;await IDB.set(key,url);MODIMG.set(key,{img});cloudPutImage(key,url);
   S.modelosU=(S.modelosU||[]).filter(q=>q.id!==M.id);S.modelosU.push(M);
   const cores={fundo:'#1e1f24',cabecalho:'#1e1f24',titulo:'#ffffff',preco:M.tag,precoTexto:hexLum(M.tag)>0.6?'#111111':'#ffffff',adesivo:'#ffd400',adesivoTexto:'#111111',cartao:'#ffffff'};
   let cp=S.campaigns.find(c=>c.modelo===M.id);if(cp){cp.nome=cp.titulo=M.nome;Object.assign(cp.cores,{preco:cores.preco,precoTexto:cores.precoTexto})}else{cp={id:'c'+M.id,nome:M.nome,titulo:M.nome,dia:-1,modelo:M.id,cores};S.campaigns.push(cp)}
   S.campaignId=cp.id;S.page=0;S._sharedDirty=true;closeModal();renderCamps();changed();toast(`Modelo "${M.nome}" salvo com ${M.slots.length} vagas. Já está selecionado.`,4500)}})}
$('#modNew').onclick=()=>openModEditor(null);
$('#modEd').onclick=()=>{const m=getMod(camp().modelo);if(m&&m.slots)openModEditor(m)};
/* ================= banco de produtos (importado do StarIA) ================= */
let CATB=null,CATRUN=false,CATIX={e:{},c:{}};
function catIndex(){CATIX={e:{},c:{}};((CATB&&CATB.itens)||[]).forEach(it=>{if(it.e)CATIX.e[cleanEan(it.e)]=it;if(it.c)CATIX.c[String(it.c)]=it});renderCatInfo()}
async function catLoad(){try{const u=await IDB.get('catalogo:base');if(u&&!CATB){CATB=JSON.parse(u);catIndex()}}catch(e){}
 if(CLOUD.db){try{const r=await CLOUD.db.doc('app/catalogo').get();if(r.exists){const d=JSON.parse(r.data().data);if(!CATB||d.at>=CATB.at){CATB=d;catIndex();IDB.set('catalogo:base',JSON.stringify(d),true)}}}catch(e){}}
 if(!CATRUN&&!window.TINO&&isOwnerV()===true&&(!CATB||Date.now()-CATB.at>30*864e5)){CATRUN=true;importCatalogo()}}
function renderCatInfo(){const el=$('#catInfo');if(!el)return;el.textContent=CATB?`${CATB.itens.length} produtos no banco • atualizado em ${new Date(CATB.at).toLocaleDateString('pt-BR')} (filial ${CATB.filial})`:'Banco ainda vazio'}
async function importCatalogo(N){
 const cur=(CATB&&CATB.itens||[]).length;if(!N)N=cur>=1000?cur+1000:1000;
 const fl=filial(),fim=new Date(Date.now()-864e5),ini=new Date(fim.getTime()-29*864e5),di=ymd(ini),df=ymd(fim);const st=t=>{toast(t,60000);const e=$('#catInfo');if(e)e.textContent=t};
 try{st('Buscando vendas por grupo no StarIA…');
  const g=await star('consultar_vendas',{dataInicial:di,dataFinal:df,filial:fl,agruparPor:'SUBGRUPO',ordenarPor:'VALOR_VENDA',ordem:'DESC',limite:100});
  const tot=g.resumo.valorVendaTotal||1,grupos=(g.itens||[]).filter(x=>x.subGrupo&&x.valorVendaTotal>0);let all=[];
  for(let i=0;i<grupos.length;i++){const gr=grupos[i],lim=Math.min(100,Math.ceil(gr.valorVendaTotal/tot*N*1.5)+3);st(`Lendo os mais vendidos ${i+1}/${grupos.length}: ${gr.subGrupo}`);
   try{const r=await star('consultar_vendas',{dataInicial:di,dataFinal:df,filial:fl,agruparPor:'MERCADORIA',subGrupo:gr.subGrupo,ordenarPor:'VALOR_VENDA',ordem:'DESC',limite:lim});all=all.concat(r.itens||[])}catch(e){}}
  const seen=new Set();all=all.filter(x=>x.codigoMercadoria&&!seen.has(x.codigoMercadoria)&&seen.add(x.codigoMercadoria)).sort((a,b)=>b.valorVendaTotal-a.valorVendaTotal).slice(0,N);
  const itens=all.map(x=>({c:String(x.codigoMercadoria),e:cleanEan(x.ean),d:x.mercadoria||'',tx:x.valorVendaTotal>0?Math.round((x.valorImpostos||0)/x.valorVendaTotal*10000)/10000:0,
   pm:x.quantidade>0?r2(x.valorVendaTotal/x.quantidade):null,cm:x.quantidade>0?Math.round(x.custoTotalCMV/x.quantidade*10000)/10000:null,vv:r2(x.valorVendaTotal)}));
  let done=0;const work=async it=>{try{const r=await star('consultar_estoque',{filial:fl,codigoMercadoria:+it.c,agruparPor:'MERCADORIA',situacaoEstoque:'TODOS',limite:1});const s=r.itens&&r.itens[0];
    if(s&&+s.estoque){it.pv=r2(s.valorVendaTotal/s.estoque);it.cu=Math.round(s.valorCustoTotal/s.estoque*10000)/10000;if(s.ean&&!it.e)it.e=cleanEan(s.ean)}}catch(e){}
   if(it.cu==null){try{it.cu=await starLastCost(it.c)}catch(e){}}if(it.cu==null)it.cu=it.cm;if(it.pv==null)it.pv=it.pm;done++;if(done%10===0)st(`Puxando preço e custo atuais ${done}/${itens.length}…`)};
  for(let i=0;i<itens.length;i+=6)await Promise.all(itens.slice(i,i+6).map(work));
  const novos=new Set(itens.map(x=>x.c));((CATB&&CATB.itens)||[]).forEach(o=>{if(o.c&&!novos.has(String(o.c)))itens.push(o)});
  CATB={at:Date.now(),filial:fl,de:di,ate:df,itens};catIndex();await IDB.set('catalogo:base',JSON.stringify(CATB),true);
  if(CLOUD.db)await CLOUD.db.doc('app/catalogo').set({at:CATB.at,data:JSON.stringify(CATB)});
  toast(`Banco atualizado: ${itens.length} produtos mais vendidos de ${fmtD(di)} a ${fmtD(df)}`,6000);renderCatInfo()}
 catch(e){toast(starErr(e),6000);renderCatInfo()}}
const margReal=(price,base)=>{if(!base||base.cu==null||!(price>0))return null;return(price-price*(base.tx||0)-base.cu)/price};
function margHtml(price,base,lbl){const m=margReal(price,base);if(m==null)return'';const cls=m<0?'r':m<margMin()?'o':'g';return`<div class="mgR ${cls}">${lbl}: <b>${(m*100).toFixed(1).replace('.',',')}%</b>${m<0?' • ABAIXO DO CUSTO':''}</div>`}
/* ================= plaquinhas: bipar código de barras ================= */
let ZXP=null;const zxLib=()=>ZXP||(ZXP=loadLib('/vendor/zxing-library-0.21.3.min.js','ZXing').catch(e=>{ZXP=null;throw e}));
async function decodeCanvas(cv){
 if('BarcodeDetector' in window){try{const r=await new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']}).detect(cv);if(r&&r[0])return r[0].rawValue}catch(e){}}
 const Z=await zxLib();const hints=new Map();hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.UPC_E,Z.BarcodeFormat.CODE_128]);hints.set(Z.DecodeHintType.TRY_HARDER,true);
 const rd=new Z.MultiFormatReader();rd.setHints(hints);
 try{return rd.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))).getText()}catch(e){return null}}
async function decodeImageURL(u){const img=await loadImg(u);
 for(const mx of [1600,1000,2400]){const k=Math.min(1,mx/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  const r=await decodeCanvas(cv);if(r)return r;
  const r2=document.createElement('canvas');r2.width=cv.height;r2.height=cv.width;const x=r2.getContext('2d');x.translate(r2.width,0);x.rotate(Math.PI/2);x.drawImage(cv,0,0);const q=await decodeCanvas(r2);if(q)return q}
 return null}
const cleanEan=v=>String(v||'').replace(/\D/g,'');
function catGet(ean){return(S.catalogo||{})[ean]||null}
function catSet(ean,o){S.catalogo=S.catalogo||{};S.catalogo[ean]=Object.assign({},S.catalogo[ean]||{},o,{at:Date.now()});S._sharedDirty=true}
async function lookupEan(raw){const code=cleanEan(raw);
 const base=CATIX.e[code]||CATIX.c[code]||(code.length===14&&CATIX.e[code.slice(1)])||null,ean=base&&base.e||code,ov=catGet(ean)||(base&&catGet(base.c))||null;
 if(base)return{ean,base,desc:(ov&&ov.desc)||base.d,code:base.c,src:'base'};
 if(ov)return{ean,base:ov.cu!=null?{cu:ov.cu,tx:ov.tx||0,pv:ov.pv}:null,desc:ov.desc,code:ov.code||'',src:'cat'};
 try{const rs=await starSearch(code);const s=rs.find(x=>cleanEan(x.ean)===code)||(code.length<8?rs.find(x=>x.code===code):null)||(code.length>=8?rs[0]:null);
  if(s){await starFill(s);return{ean:cleanEan(s.ean)||code,base:{c:s.code,cu:s.cost,pv:s.sysPrice,tx:null},desc:s.desc,code:s.code,src:'star'}}}catch(e){return{ean:code,starErr:starErr(e)}}
 return{ean:code}}
function photoByEan(ean){const k=S.fotoEan&&S.fotoEan[ean];if(k&&imgCache.has(k))return k;if(k){IDB.get(k).then(async u=>{if(u&&!imgCache.has(k)){imgCache.set(k,{img:await loadImg(u),url:u});avRender()}})}return k||null}
let scanStream=null;function stopScan(){if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null}}
function openScan(){
 modal(`<h3>Buscar produto</h3>
 <div class="bar" style="flex-wrap:nowrap"><input id="scCode" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Código de barras, código interno ou nome" style="margin:0;font-size:18px;padding:12px;-webkit-appearance:none;appearance:none;border-radius:10px"><button class="btn" id="scCam" title="Câmera" style="font-size:22px;padding:0 14px">📷</button></div><button class="btn pri" id="scGo" style="width:100%;margin-top:8px;padding:13px;font-size:17px">🔍 Buscar</button><div id="scSug"></div>
 <input type="file" id="scIn" accept="image/*" capture="environment" hidden>
 <div id="scVid" hidden style="position:relative;margin-top:10px"><video id="scV" playsinline muted style="width:100%;max-height:40vh;border-radius:12px;background:#000;object-fit:cover"></video><div style="position:absolute;left:12%;right:12%;top:50%;height:3px;background:#ff2d2d;box-shadow:0 0 8px #f00"></div></div>
 <div id="scRes" style="margin-top:12px"></div>
 <div class="mfoot"><button class="btn" data-a="x">Fechar</button></div>`,b=>{
  const res=$('#scRes');let busy=false;
  const close=()=>{stopScan();closeModal();avRender()};b.querySelector('[data-a=x]').onclick=close;
  const sug=$('#scSug');
  const pick=it=>{sug.innerHTML='';res.innerHTML='';const ean=cleanEan(it.e)||'';const ov=catGet(ean)||catGet(it.c);showRes({ean:ean||it.c,base:it.cu!=null||it.pv!=null?it:null,desc:(ov&&ov.desc)||it.d,code:it.c,src:'base'})};
  const nameList=(L,more)=>{sug.innerHTML=L.length?`<div class="scList">${L.map((it,i)=>`<button data-i="${i}"><b>${esc(it.d)}</b><small>${it.c?'Cód. '+esc(it.c):''}${it.pv!=null?' • '+brl(it.pv):''}</small></button>`).join('')}</div>`:`<p class="hint">Nada com esse nome no banco do app.${more?'':''}</p>`;
   sug.querySelectorAll('[data-i]').forEach(bt=>bt.onclick=()=>pick(L[+bt.dataset.i]))};
  const nw=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ');const localName=q=>{const t=nw(q).split(/\s+/).filter(Boolean).map(norm);if(!t.length)return[];const pool=[...((CATB&&CATB.itens)||[]),...Object.entries(S.catalogo||{}).filter(([k,v])=>v.desc&&!CATIX.e[k]).map(([k,v])=>({c:v.code||'',e:k,d:v.desc,cu:v.cu,pv:v.pv,tx:v.tx}))];
   return pool.filter(it=>{const n=norm(it.d);return t.every(w=>n.includes(w))}).slice(0,12)};
  const byName=async q=>{let L=localName(q);nameList(L);if(L.length||isOwnerV()!==true)return;
   sug.innerHTML='<p class="hint">Procurando no StarIA…</p>';try{const rs=await starSearch(q);L=rs.slice(0,12).map(x=>({c:x.code,e:x.ean,d:x.desc,pv:x.sysPrice,cu:x.cost,tx:null}));nameList(L)}catch(e){sug.innerHTML=`<p class="hint">${esc(starErr(e))}</p>`}};
  const go=async raw=>{raw=String(raw||'').trim();if(busy||!raw)return;if(/[a-zA-ZÀ-ú]/.test(raw)){res.innerHTML='';byName(raw);return}sug.innerHTML='';const code=cleanEan(raw);if(code.length<1||code.length>14){toast('Código inválido');return}
   busy=true;stopScan();$('#scVid').hidden=true;$('#scCode').value=code;res.innerHTML='<p class="hint">Procurando '+code+'…</p>';
   const r=await lookupEan(code);busy=false;showRes(r)};
  const showRes=r=>{const ean=r.ean,B=r.base;let fk=photoByEan(ean);if((!fk||!imgCache.has(fk))&&r.desc){const k2=findPhotoByName({desc:r.desc});if(k2&&imgCache.has(k2))fk=k2}const fu=fk&&imgCache.has(fk)?imgCache.get(fk).url:'';
   const novo=!r.desc;
   res.innerHTML=`<div class="scCard">${fu?`<div class="scPh" style="background-image:url('${fu}')"></div>`:`<button class="scPh none" id="scFoto">📷<br>foto do<br>produto</button>`}<div style="flex:1;min-width:0">
    ${novo?`<small class="flag r">NÃO ENCONTRADO</small><p class="hint" style="margin:4px 0">Não está no banco do app${r.starErr?' e o StarIA não respondeu neste aparelho':' nem no StarIA'}. Cadastre aqui: fica salvo para as próximas vezes.</p>`:''}
    <input id="scD" class="scNm" value="${esc(r.desc||'')}" placeholder="Nome do produto">
    ${B&&(B.cu!=null||B.pv!=null)?`<div class="scRO"><span>Custo <b>${B.cu!=null?brl(B.cu):'—'}</b></span><span>Preço atual <b>${B.pv!=null?brl(B.pv):'—'}</b></span></div>`:''}
    <small class="hint">${r.code?'Cód. '+esc(r.code)+' • ':''}EAN ${esc(ean)}</small></div></div>
   <label class="scBig">Preço da plaquinha<input id="scP" inputmode="decimal" placeholder="0,00"></label><div id="scM"></div>
   <label class="chk2 scT"><input type="checkbox" id="scAppOn"> Tem preço com app</label>
   <div id="scAppB" hidden><label class="scBig">Preço com app<input id="scA" inputmode="decimal" placeholder="0,00"></label><div id="scMA"></div></div>
   <label class="chk2 scT"><input type="checkbox" id="scVc"> Perto de vencer</label>
   <div id="scVcB" hidden><label>Data da validade<input type="date" id="scVd"></label></div>
   <button class="btn pri" id="scAdd" style="width:100%;margin-top:12px;padding:14px;font-size:17px">Adicionar plaquinha</button>`;
   const mB=B&&B.cu!=null?{cu:B.cu,tx:B.tx||0}:null;
   const upd=()=>{const p=parseMoney($('#scP').value),a=parseMoney($('#scA').value);$('#scM').innerHTML=mB?margHtml(p,mB,'Margem real'+(mB.tx?'':' (sem imposto cadastrado)')):(p&&!novo?'<div class="mgR">Sem custo no banco para calcular margem</div>':'');$('#scMA').innerHTML=mB?margHtml(a,mB,'Margem real no app'):''};
   $('#scP').oninput=upd;$('#scA').oninput=upd;
   $('#scAppOn').onchange=e=>{$('#scAppB').hidden=!e.target.checked;if(e.target.checked)$('#scA').focus()};
   $('#scVc').onchange=e=>{$('#scVcB').hidden=!e.target.checked};
   const fb=$('#scFoto');if(fb)fb.onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.capture='environment';i.onchange=async()=>{const f=i.files[0];if(!f)return;toast('Ajustando a foto…',1500);
    try{const u=await processImage(await fileToURL(f),false),k='e:'+ean;imgCache.set(k,{img:await loadImg(u),url:u});await IDB.set(k,u);cloudPutImage(k,u);S.fotoEan=S.fotoEan||{};S.fotoEan[ean]=k;S._sharedDirty=true;
     const ph=$('#scFoto');if(ph){const d=document.createElement('div');d.className='scPh';d.style.backgroundImage=`url('${u}')`;ph.replaceWith(d)}toast('Foto salva: das próximas vezes ela vem sozinha')}catch(_){toast('Não consegui usar essa foto')}};i.click()};
   $('#scAdd').onclick=()=>{const desc=$('#scD').value.trim(),price=parseMoney($('#scP').value),appOn=$('#scAppOn').checked,app=appOn?parseMoney($('#scA').value):null,vc=$('#scVc').checked;
    if(!desc){toast('Escreva o nome do produto');$('#scD').focus();return}if(price==null){toast('Coloque o preço');$('#scP').focus();return}
    if(appOn&&app==null){toast('Coloque o preço com app');$('#scA').focus();return}
    const p=P({desc,price,ean,code:r.code||'',venc:vc,vencData:vc?$('#scVd').value:''});
    if(appOn&&app!==price){p.price=Math.max(price,app);p.app=Math.min(price,app);p.appOn=true}
    if(mB)p.cost=mB.cu;if(fk)p.imgAlias=fk;
    const ov={desc};if(!B||B.cu==null)Object.assign(ov,{code:p.code});if(desc!==(B&&B.d)||novo)catSet(ean,ov);
    S.avulsas=(S.avulsas||[]).filter(q=>q.desc||q.price!=null);S.avulsas.push(p);AVSEL=S.avulsas.length-1;changed();avRender();
    toast(`${desc} adicionado${fk?'':' • sem foto'}`,2500);res.innerHTML='';$('#scCode').value='';$('#scCode').focus()};
   setTimeout(()=>{const e=novo?$('#scD'):$('#scP');e.focus()},60)};
  $('#scGo').onclick=()=>go($('#scCode').value);$('#scCode').onkeydown=e=>{if(e.key==='Enter')go(e.target.value)};let tN=0;
  /* lista na hora, enquanto digita: número = código interno que começa com ele ou EAN que contém; letras = nome */
  const nBanco=((CATB&&CATB.itens)||[]).length,info=()=>{sug.innerHTML=nBanco?`<p class="hint">Banco do app: <b>${nBanco}</b> produtos. Digite o código ou o nome.</p>`:`<p class="hint" style="color:#b3261e"><b>O banco de produtos está vazio neste app.</b> ${window.TINO?'Importe: Painel do dono → Banco de produtos → <b>Importar banco</b> (arquivo exportado no app do Claude).':'Painel do dono → Banco de produtos → <b>Atualizar banco do StarIA</b>.'}</p>`};
  const byCode=q=>{const L=((CATB&&CATB.itens)||[]);return[...L.filter(it=>String(it.c)===q),...L.filter(it=>String(it.c)!==q&&String(it.c).startsWith(q)),...(q.length>=4?L.filter(it=>!String(it.c).startsWith(q)&&String(it.e||'').includes(q)):[])].slice(0,12)};
  $('#scCode').oninput=e=>{const v=e.target.value.trim();clearTimeout(tN);if(!v){res.innerHTML='';info();return}
   tN=setTimeout(()=>{if(/[a-zA-ZÀ-ú]/.test(v)){if(v.length>=2){res.innerHTML='';nameList(localName(v))}}else{const d=v.replace(/\D/g,'');if(!d)return;const L=byCode(d);res.innerHTML='';sug.innerHTML='';if(L.length)nameList(L);else sug.innerHTML=`<p class="hint">Nenhum código começando com ${esc(d)} no banco. Toque em Buscar para procurar${isOwnerV()===true&&!window.TINO?' também no StarIA':''}.</p>`}},200)};
  info();
  $('#scIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;res.innerHTML='<p class="hint">Lendo o código na foto…</p>';
   let v=null;try{v=await decodeImageURL(await fileToURL(f))}catch(_){}
   if(v)go(v);else res.innerHTML='<div class="warn r">Não consegui ler o código nessa foto. Tente mais perto, com o código reto e sem reflexo, ou digite os números.</div>'};
  $('#scCam').onclick=async()=>{if(scanStream){stopScan();$('#scVid').hidden=true;return}
   try{scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}}})}catch(e){$('#scIn').click();return}
   const v=$('#scV');v.srcObject=scanStream;$('#scVid').hidden=false;await v.play().catch(()=>{});try{await zxLib()}catch(_){}
   const cv=document.createElement('canvas');const loop=async()=>{if(!scanStream||busy)return;if(v.videoWidth){const k=Math.min(1,1000/v.videoWidth);cv.width=v.videoWidth*k|0;cv.height=v.videoHeight*k|0;cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height);const r=await decodeCanvas(cv);if(r&&cleanEan(r).length>=8){navigator.vibrate&&navigator.vibrate(80);go(r);return}}setTimeout(loop,250)};loop()};
  setTimeout(()=>$('#scCode').focus(),60)})}
$('#avScan').onclick=openScan;$('#catUp').onclick=()=>importCatalogo();
$('#catExp').onclick=()=>{if(!CATB||!CATB.itens.length){toast('Banco vazio');return}saveFile(`banco-produtos-${CATB.itens.length}.json`,new Blob([JSON.stringify(CATB)],{type:'application/json'}),'file')};
$('#catImp').onclick=()=>$('#catFile').click();
$('#catFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const d=JSON.parse(await f.text());if(!d||!Array.isArray(d.itens)||!d.itens.length||!d.itens.every(x=>x&&x.c!=null))throw 0;
 const novos=new Set(d.itens.map(x=>String(x.c)));((CATB&&CATB.itens)||[]).forEach(o=>{if(o.c&&!novos.has(String(o.c)))d.itens.push(o)});d.at=Date.now();
 CATB=d;catIndex();await IDB.set('catalogo:base',JSON.stringify(CATB),true);if(CLOUD.db)await CLOUD.db.doc('app/catalogo').set({at:CATB.at,data:JSON.stringify(CATB)});toast(`Banco importado: ${CATB.itens.length} produtos`,5000)}
 catch(err){toast('Arquivo inválido: use o "Exportar banco" do outro app',5000)}};
/* ================= início ================= */
$('#vIni').value=S.val.ini;$('#vFim').value=S.val.fim;$('#phr').value=S.phrases.join('\n');
if(!S.campaigns.some(c=>c.modelo==='superdia')){S.campaigns.push({id:'superdiad',nome:'Super Dia D',titulo:'Super Dia D',dia:-1,modelo:'superdia',cores:{fundo:'#232126',cabecalho:'#b31a0c',titulo:'#ffffff',preco:'#d23a17',precoTexto:'#ffffff',adesivo:'#f5a623',adesivoTexto:'#111111',cartao:'#ffffff'}});S._sharedDirty=true}
renderFormats();renderCamps();renderList();renderLogos();renderSaved();renderSecs();render();applyModo();bankCount();if(inWz()&&S.format!=='insta'){S.format='insta';renderFormats()}document.body.classList.toggle('wz',inWz());$('#bDono').textContent=inWz()?'Painel do dono':'Voltar ao passo a passo';if(inWz())wzGo(0);undoSnap();
let phDrag=null,phMoved=false;
function phDown(cv,e){const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;
 const h=[...PREV_HIT].reverse().find(q=>q.sticker&&x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h);if(!h)return;const p=S.products.find(q=>q.id===h.id);if(!p)return;
 e.preventDefault();phMoved=false;phDrag={cv,p,h,ox:x-(h.x+4),oy:y-(h.y+4)};try{cv.setPointerCapture(e.pointerId)}catch(_){}}
function phMove(e){if(!phDrag)return;const{cv,p,h,ox,oy}=phDrag,r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;
 p.phX=clamp((x-ox-h.cx)/h.cw,-0.05,0.9);p.phY=clamp((y-oy-h.cy)/h.ch,-0.05,0.92);phMoved=true;schedule()}
function phUp(){if(phDrag){if(phMoved)changed(false);phDrag=null;setTimeout(()=>phMoved=false,50)}}
['#preview','#wzPrev'].forEach(sel=>{const cv=$(sel);cv.addEventListener('pointerdown',e=>phDown(cv,e));cv.addEventListener('pointermove',e=>{phMove(e);if(!phDrag){const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)*cv.width/r.width,y=(e.clientY-r.top)*cv.height/r.height;cv.style.cursor=PREV_HIT.some(q=>q.sticker&&x>=q.x&&x<=q.x+q.w&&y>=q.y&&y<=q.y+q.h)?'move':'pointer'}});cv.addEventListener('pointerup',phUp);cv.addEventListener('pointercancel',phUp);cv.style.touchAction='pan-y'});
$('#preview').addEventListener('click',e=>{if(phMoved)return;const id=hitAt(e);if(id)openEditor(id)});

fontsReady().then(schedule);if(document.fonts)document.fonts.ready.then(schedule);
loadAllImages();
setTimeout(async()=>{await cloudInit();let tv=false;try{tv=localStorage.getItem(TVKEY)==='1'}catch(e){}if(tv){await fontsReady();await loadAllImages();startTvScreen()}},300);
$('#lgPos').value=S.store.logoPos||'lado';$('#lgFx').value=S.store.logoFx||'auto';
$('#lgSwap').onclick=async()=>{const[a,b]=[await IDB.get('logo0'),await IDB.get('logo1')];if(b)await IDB.set('logo0',b);else await IDB.del('logo0');if(a)await IDB.set('logo1',a);else await IDB.del('logo1');[logos[0],logos[1]]=[logos[1],logos[0]];renderLogos();schedule()};
$('#lgPos').onchange=e=>{S.store.logoPos=e.target.value;changed(false)};$('#lgFx').onchange=e=>{S.store.logoFx=e.target.value;changed(false)};

document.querySelectorAll('[data-wzgo]').forEach(b=>b.addEventListener('click',()=>wzGo(+b.dataset.wzgo)));

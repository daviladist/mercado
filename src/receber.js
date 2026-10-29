/* ================= ENTRADA DE MERCADORIA, FORNECEDORES E PRECIFICAÇÃO DE NOTAS =================
 * Conferente (ou loja) lança a nota: fornecedor, número, produtos (bipando ou digitando), quantidade e valor.
 * Ao marcar "Conferido", o estoque soma na hora (o servidor faz a conta).
 * Depois a loja ou o faturamento precifica linha por linha e aprova: aí o custo, a embalagem,
 * a tributação e os preços vão para o produto. Enquanto não aprovar, o aviso não some.          */
const RC_ST={aberta:'Em conferência',conferida:'Conferida · aguardando preço',aprovada:'Aprovada',cancelada:'Cancelada'};
const rcPend=()=>(S.receipts||[]).filter(r=>r.status==='conferida');
const rcNorm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const rcMoney=v=>v===''||v==null||isNaN(v)?'':Number(v).toFixed(2).replace('.',',');
const rcQty=v=>v===''||v==null||isNaN(v)?'':String(Math.round(Number(v)*1000)/1000).replace('.',',');
function rcFindProducts(t){const q=rcNorm(t).trim(),d=String(t||'').replace(/\D/g,'');if(!q)return [];
  const P=(S.products||[]).filter(p=>p.active!==false||ui.admin);
  const exact=d.length>=4?P.filter(p=>[p.ean,p.ean2,p.code].some(c=>c&&normCode(c)===normCode(d))):[];
  if(exact.length)return exact;
  const words=q.split(/\s+/).filter(Boolean);
  return P.filter(p=>{const h=rcNorm(p.name+' '+(p.code||'')+' '+(p.ean||''));return words.every(w=>h.includes(w))}).slice(0,10)}
function rcFindSuppliers(t){const q=rcNorm(t).trim();const L=(S.suppliers||[]).filter(x=>x.active!==false);if(!q)return L.slice(0,30);
  return L.filter(x=>rcNorm(x.code).startsWith(q)||rcNorm(x.name).includes(q)).slice(0,30)}

/* ---------- CADASTROS › FORNECEDORES (administrador) ---------- */
function admFornecedores(){
  const c=$('#cadc');S.suppliers=S.suppliers||[];const F=ui.sup=ui.sup||{q:'',edit:null};
  const list=rcFindSuppliers(F.q).length||!F.q?(F.q?rcFindSuppliers(F.q):S.suppliers):[];
  const E=F.edit;
  c.innerHTML=`<div class="sectionhead"><h2>Fornecedores</h2><button class="btn" id="supNew">+ Novo fornecedor</button></div>
    ${E?`<form class="panel" id="supf" style="display:grid;gap:10px;margin-bottom:14px;max-width:720px">
      <b>${E.id?'Editar fornecedor':'Novo fornecedor'}</b>
      <div class="grid2"><div class="field"><label for="supc">Código</label><input type="text" id="supc" value="${esc(E.code||'')}" placeholder="Ex.: 1023" autocomplete="off"></div>
        <div class="field"><label for="supn">Nome / razão social</label><input type="text" id="supn" value="${esc(E.name||'')}" required></div></div>
      <div class="grid2"><div class="field"><label for="supd">CNPJ</label><input type="text" id="supd" inputmode="numeric" value="${esc(E.doc||'')}"></div>
        <div class="field"><label for="supt">Telefone</label><input type="text" id="supt" inputmode="tel" value="${esc(E.phone||'')}"></div></div>
      <div class="grid2"><div class="field"><label for="supk">Contato (vendedor/representante)</label><input type="text" id="supk" value="${esc(E.contact||'')}"></div>
        <div class="field"><label for="supo">Observação</label><input type="text" id="supo" value="${esc(E.note||'')}"></div></div>
      <label class="switch small"><input type="checkbox" id="supa" ${E.active!==false?'checked':''}> Ativo (aparece na entrada de notas)</label>
      <div class="err" id="supe"></div>
      <div class="row" style="gap:8px"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" id="supx">Cancelar</button></div></form>`:''}
    <input type="text" id="supq" value="${esc(F.q)}" placeholder="Buscar por código ou nome" style="margin-bottom:10px;max-width:720px" aria-label="Buscar fornecedor">
    ${list.length?`<div class="list" style="max-width:720px">${list.map(x=>`<div class="prow ${x.active===false?'off':''}" style="grid-template-columns:minmax(0,1fr) auto"><div class="t"><b>${x.code?esc(x.code)+' · ':''}${esc(x.name)}</b><span class="small muted">${[x.doc&&'CNPJ '+esc(x.doc),x.phone&&esc(x.phone),x.contact&&esc(x.contact)].filter(Boolean).join(' · ')||'—'}${x.active===false?' · inativo':''}</span></div>
      <div class="row" style="gap:6px">${ui.confirmDel==='sp'+x.id?`<button class="btn danger dlb" data-supok="${x.id}">Confirmar exclusão</button>`:`<button class="btn ghost dlb" data-supdel="${x.id}">Excluir</button>`}<button class="btn ghost dlb" data-supe="${x.id}">Editar</button></div></div>`).join('')}</div>`
      :`<div class="empty">${F.q?'Nenhum fornecedor encontrado.':'Nenhum fornecedor cadastrado. Toque em "+ Novo fornecedor".'}</div>`}`;
  const rer=()=>{const y=window.scrollY;admFornecedores();window.scrollTo(0,y)};
  $('#supNew').onclick=()=>{F.edit={code:'',name:'',active:true};rer();const n=$('#supc');if(n)n.focus()};
  {const q=$('#supq');q.oninput=()=>{F.q=q.value;const pos=q.selectionStart;rer();const n=$('#supq');n.focus();n.setSelectionRange(pos,pos)}}
  c.querySelectorAll('[data-supe]').forEach(b=>b.onclick=()=>{F.edit={...S.suppliers.find(x=>x.id===b.dataset.supe)};rer();window.scrollTo(0,0)});
  c.querySelectorAll('[data-supdel]').forEach(b=>b.onclick=()=>{ui.confirmDel='sp'+b.dataset.supdel;rer()});
  c.querySelectorAll('[data-supok]').forEach(b=>b.onclick=()=>{const id=b.dataset.supok;if((S.receipts||[]).some(r=>r.supplierId===id)){toast('Esse fornecedor tem notas lançadas: desative em vez de excluir.');ui.confirmDel=null;rer();return}
    S.suppliers=S.suppliers.filter(x=>x.id!==id);ui.confirmDel=null;save();toast('Fornecedor excluído');rer()});
  if(E){$('#supx').onclick=()=>{F.edit=null;rer()};
    $('#supf').onsubmit=ev=>{ev.preventDefault();const code=$('#supc').value.trim(),name=$('#supn').value.trim();
      if(!name){$('#supe').textContent='Informe o nome.';return}
      if(code&&S.suppliers.some(x=>x.id!==E.id&&String(x.code||'').trim().toLowerCase()===code.toLowerCase())){$('#supe').textContent='Já existe fornecedor com esse código.';return}
      const d={id:E.id||uid(),code,name,doc:$('#supd').value.trim(),phone:$('#supt').value.trim(),contact:$('#supk').value.trim(),note:$('#supo').value.trim(),active:$('#supa').checked};
      const k=S.suppliers.findIndex(x=>x.id===d.id);if(k>=0)S.suppliers[k]=d;else S.suppliers.push(d);
      F.edit=null;save();toast('Fornecedor salvo');rer()}}
}

/* ---------- RECEBER MERCADORIA (conferente e administrador) ---------- */
function recScreen(el){if(!el)return;S.receipts=S.receipts||[];const R=ui.rcv=ui.rcv||{};
  const cur=R.id&&S.receipts.find(r=>r.id===R.id);
  if(cur&&cur.status==='aberta')return recEdit(el,cur);
  R.id=null;
  const abertas=S.receipts.filter(r=>r.status==='aberta'),conf=rcPend(),feitas=S.receipts.filter(r=>r.status==='aprovada').sort((a,b)=>String(b.aprovadaAt).localeCompare(String(a.aprovadaAt))).slice(0,5);
  const N=R.nova,sups=N?rcFindSuppliers(N.sq):[],sel=N&&N.supplierId&&(S.suppliers||[]).find(x=>x.id===N.supplierId);
  const card=r=>`<button class="rccard" data-rco="${r.id}"><span><b>NF ${esc(r.nf)}</b> · ${esc(r.supplierName)}</span><span class="small muted">${(r.items||[]).length} ite${(r.items||[]).length===1?'m':'ns'} · ${brl(r.totalNota||0)} · ${esc(RC_ST[r.status]||r.status)}${r.conferidaBy?' · conferida por '+esc(r.conferidaBy):r.by?' · por '+esc(r.by):''}</span></button>`;
  el.innerHTML=`<div class="sectionhead"><h2>Receber mercadoria</h2>${N?'':'<button class="btn" id="rcNew">+ Nova nota</button>'}</div>
    ${N?`<form class="panel rcnew" id="rcnf">
      <b>Nova entrada de nota</b>
      <div class="field"><label for="rcsq">Fornecedor (código ou nome)</label>
        ${sel?`<div class="rcsel"><span><b>${sel.code?esc(sel.code)+' · ':''}${esc(sel.name)}</b></span><button type="button" class="link" id="rcsx">Trocar</button></div>`
          :`<input type="text" id="rcsq" value="${esc(N.sq||'')}" placeholder="Digite o código ou o nome" autocomplete="off">
          <div class="rcsups">${sups.length?sups.map(x=>`<button type="button" class="btn ghost dlb" data-rcs="${x.id}">${x.code?esc(x.code)+' · ':''}${esc(x.name)}</button>`).join(''):`<span class="small muted">${(S.suppliers||[]).length?'Nenhum fornecedor com esse código ou nome.':'Nenhum fornecedor cadastrado. '+(ui.admin?'Cadastre em Cadastros › Fornecedores.':'Peça à loja para cadastrar.')}</span>`}</div>`}</div>
      <div class="grid2"><div class="field"><label for="rcnfn">Número da nota</label><input type="text" id="rcnfn" inputmode="numeric" value="${esc(N.nf||'')}" placeholder="Ex.: 12345" autocomplete="off"></div>
        <div class="field"><label for="rcem">Data de emissão</label><input type="date" id="rcem" value="${esc(N.emissao||today())}"></div></div>
      <div class="err" id="rcerr"></div>
      <div class="row" style="gap:8px"><button class="btn" type="submit">Começar a conferência</button><button class="btn ghost" type="button" id="rcnx">Cancelar</button></div></form>`:''}
    <h3 class="dech">Em conferência <span class="cnt2">${abertas.length}</span></h3>
    ${abertas.length?`<div class="rclist">${abertas.map(card).join('')}</div>`:'<div class="small muted" style="margin-bottom:12px">Nenhuma nota em conferência.</div>'}
    <h3 class="dech">Conferidas · aguardando preço <span class="cnt2">${conf.length}</span></h3>
    ${conf.length?`<div class="rclist">${conf.map(card).join('')}</div>`:'<div class="small muted" style="margin-bottom:12px">Nenhuma nota esperando preço.</div>'}
    ${feitas.length?`<h3 class="dech">Últimas aprovadas</h3><div class="rclist">${feitas.map(card).join('')}</div>`:''}`;
  const rer=()=>{const y=window.scrollY;recScreen(el);window.scrollTo(0,y)};
  {const b=$('#rcNew');if(b)b.onclick=()=>{R.nova={sq:'',nf:'',emissao:today()};rer();const n=$('#rcsq');if(n)n.focus()}}
  el.querySelectorAll('[data-rco]').forEach(b=>b.onclick=()=>{const r=S.receipts.find(x=>x.id===b.dataset.rco);if(!r)return;if(r.status==='aberta'){R.id=r.id;rer();window.scrollTo(0,0)}else toast('NF '+r.nf+': '+(RC_ST[r.status]||r.status)+(r.status==='conferida'?'. A loja precifica e aprova.':'.'))});
  if(N){const keep=()=>{const f=$('#rcnfn'),e=$('#rcem');if(f)N.nf=f.value;if(e)N.emissao=e.value};
    {const q=$('#rcsq');if(q)q.oninput=()=>{keep();N.sq=q.value;const pos=q.selectionStart;rer();const n=$('#rcsq');n.focus();n.setSelectionRange(pos,pos)}}
    el.querySelectorAll('[data-rcs]').forEach(b=>b.onclick=()=>{keep();N.supplierId=b.dataset.rcs;rer();const f=$('#rcnfn');if(f)f.focus()});
    {const x=$('#rcsx');if(x)x.onclick=()=>{keep();N.supplierId=null;rer()}}
    $('#rcnx').onclick=()=>{R.nova=null;rer()};
    $('#rcnf').onsubmit=ev=>{ev.preventDefault();keep();const nf=String(N.nf||'').replace(/\s/g,''),er=$('#rcerr');
      if(!N.supplierId){er.textContent='Escolha o fornecedor.';return}
      if(!/^[0-9A-Za-z./-]{1,20}$/.test(nf)){er.textContent='Informe o número da nota.';return}
      if(S.receipts.some(r=>r.status!=='cancelada'&&r.supplierId===N.supplierId&&String(r.nf)===nf)){er.textContent='A nota '+nf+' desse fornecedor já foi lançada.';return}
      const s=(S.suppliers||[]).find(x=>x.id===N.supplierId);
      const r={id:uid(),status:'aberta',nf,supplierId:N.supplierId,supplierName:s?s.name:'',emissao:N.emissao||'',items:[],totalNota:0,by:ui.checker||ui.adminName||'',at:new Date().toISOString()};
      S.receipts.push(r);R.nova=null;R.id=r.id;save();rer();window.scrollTo(0,0);const n=$('#rcin');if(n)n.focus()}}
}
function recEdit(el,r){const R=ui.rcv;R.q=R.q||'';
  const hits=R.q&&!R.pick?rcFindProducts(R.q):[];
  const tot=()=>Math.round(r.items.reduce((a,i)=>a+(Number(i.q)||0)*(Number(i.valor)||0),0)*100)/100;
  el.innerHTML=`<div class="sectionhead"><h2>Conferindo NF ${esc(r.nf)}</h2><button class="btn ghost dlb" id="rcBack">Voltar</button></div>
    <div class="panel rchead"><span><b>${esc(r.supplierName)}</b></span><span class="small muted">Emissão ${r.emissao?dBR(r.emissao):'—'} · lançada por ${esc(r.by||'')}</span></div>
    <div class="panel rcscan"><label for="rcin" class="lbl">Bipe ou digite o produto (EAN, código ou nome)</label>
      <input type="text" id="rcin" value="${esc(R.q)}" placeholder="Bipe o código de barras ou digite" autocomplete="off" enterkeyhint="search">
      ${hits.length?`<div class="rchits">${hits.map(p=>`<button type="button" class="rchit" data-rcp="${p.id}"><b>${esc(p.name)}</b><span class="small muted">${[p.code&&'Cód. '+esc(p.code),p.ean&&'EAN '+esc(p.ean),esc(p.unit||'')].filter(Boolean).join(' · ')}</span></button>`).join('')}</div>`
        :R.q.trim()?`<div class="small muted">Nenhum produto com "${esc(R.q.trim())}". <button type="button" class="link" id="rcfree">Incluir sem cadastro</button> (a loja liga ao produto na precificação)</div>`:''}</div>
    ${r.items.length?`<div class="rcgrid"><div class="rcgh"><span>Produto</span><span>Qtd</span><span>Valor (R$)</span><span></span></div>
      ${r.items.map(i=>`<div class="rcline" data-k="${i.k}"><span class="rcn"><b>${esc(i.name)}</b><span class="small muted">${i.pid?esc(i.unit||''):'<span class="neg">sem cadastro</span>'}${i.ean?' · '+esc(i.ean):''}</span></span>
        <input type="text" inputmode="decimal" class="rcq" data-rq="${i.k}" value="${rcQty(i.q)}" aria-label="Quantidade de ${esc(i.name)}">
        <input type="text" inputmode="decimal" class="rcv" data-rv="${i.k}" value="${rcMoney(i.valor)}" placeholder="0,00" aria-label="Valor de ${esc(i.name)} na nota">
        <button type="button" class="rcx" data-rx="${i.k}" aria-label="Tirar ${esc(i.name)}">✕</button></div>`).join('')}</div>
      <div class="small muted" style="margin:6px 0 12px">Quantidade em embalagens (fardo, caixa, saco) e o valor unitário que está na nota. Bipar de novo o mesmo produto soma 1.</div>`
      :'<div class="empty">Bipe ou digite os produtos que chegaram.</div>'}
    <div class="panel rcfoot"><span>Total da nota: <b class="num" id="rctot">${brl(tot())}</b></span>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="rcOk" ${r.items.length?'':'disabled'}>Conferido: dar entrada no estoque</button><button class="btn ghost" id="rcDel">Cancelar esta nota</button></div></div>`;
  const rer=(focus)=>{const y=window.scrollY;recEdit(el,r);window.scrollTo(0,y);if(focus){const n=$(focus);if(n){n.focus();if(n.select)n.select()}}};
  const add=(p,name,ean)=>{const ex=p&&r.items.find(i=>i.pid===p.id);R.q='';
    if(ex){ex.q=(Number(ex.q)||0)+1;save();try{beep(true)}catch(e){}rer('[data-rq="'+ex.k+'"]');return}
    const it={k:'i'+uid(),pid:p?p.id:'',name:p?p.name:name,unit:p?p.unit||'':'',ean:p?p.ean||'':ean||'',code:p?p.code||'':'',perPack:p&&Number(p.perPack)>1?Number(p.perPack):1,q:1,valor:''};
    r.items.push(it);save();try{beep(!!p)}catch(e){}rer('[data-rq="'+it.k+'"]')};
  $('#rcBack').onclick=()=>{R.id=null;R.q='';recScreen(el)};
  {const inp=$('#rcin');
    inp.oninput=()=>{R.q=inp.value;const v=inp.value.trim();if(/^\d{8,14}$/.test(v))return;const pos=inp.selectionStart;rer();const n=$('#rcin');n.focus();n.setSelectionRange(pos,pos)};
    inp.onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const v=inp.value.trim();if(!v)return;const L=rcFindProducts(v);
      if(L.length===1||(/^\d{6,14}$/.test(v)&&L.length)){add(L[0]);return}
      R.q=v;rer('#rcin')};
    if(!document.activeElement||document.activeElement===document.body)inp.focus()}
  el.querySelectorAll('[data-rcp]').forEach(b=>b.onclick=()=>add((S.products||[]).find(p=>p.id===b.dataset.rcp)));
  {const f=$('#rcfree');if(f)f.onclick=()=>{const v=R.q.trim(),d=v.replace(/\D/g,'');add(null,/^\d{8,14}$/.test(v)?'Produto EAN '+d:v,/^\d{8,14}$/.test(v)?d:'')}}
  el.querySelectorAll('[data-rq]').forEach(i=>{i.onchange=()=>{const it=r.items.find(x=>x.k===i.dataset.rq),v=pnum(i.value);if(!it)return;if(!(v>0)){toast('Quantidade inválida.');i.value=rcQty(it.q);return}it.q=v;i.value=rcQty(v);save();$('#rctot').textContent=brl(tot())};
    i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const v=el.querySelector('[data-rv="'+i.dataset.rq+'"]');if(v){v.focus();v.select()}}}});
  el.querySelectorAll('[data-rv]').forEach(i=>{i.onchange=()=>{const it=r.items.find(x=>x.k===i.dataset.rv),v=pnum(i.value);if(!it)return;if(i.value.trim()&&v===''){toast('Valor inválido. Use números, ex.: 45,90');i.value=rcMoney(it.valor);return}it.valor=v===''?'':v;i.value=rcMoney(it.valor);save();$('#rctot').textContent=brl(tot())};
    i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();i.blur();const n=$('#rcin');if(n)n.focus()}}});
  el.querySelectorAll('[data-rx]').forEach(b=>b.onclick=()=>{r.items=r.items.filter(x=>x.k!==b.dataset.rx);save();rer()});
  $('#rcDel').onclick=()=>{if(!confirm('Cancelar a nota '+r.nf+'? Ela some da lista de conferência.'))return;r.status='cancelada';save();R.id=null;toast('Nota cancelada');recScreen(el)};
  $('#rcOk').onclick=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
    const semValor=r.items.filter(i=>!(Number(i.valor)>0)),n=r.items.reduce((a,i)=>a+(Number(i.q)||0),0);
    if(semValor.length&&!confirm(semValor.length+' produto(s) sem valor da nota ('+semValor.map(i=>i.name).slice(0,3).join(', ')+'). Conferir mesmo assim? A loja completa na precificação.'))return;
    if(!confirm('Confirmar a conferência da NF '+r.nf+'?\n'+r.items.length+' produto(s), '+rcQty(n)+' embalagem(ns), total '+brl(tot())+'.\nO estoque soma agora.'))return;
    r.items.forEach(i=>{if(!(Number(i.valor)>=0)||i.valor==='')i.valor=0});
    r.status='conferida';save();R.id=null;toast('NF '+r.nf+' conferida: estoque atualizado. Foi para a precificação.');recScreen(el);window.scrollTo(0,0)};
}

/* ---------- PRECIFICAÇÃO DE NOTAS (administrador e faturamento) ---------- */
function rcMargins(c,pv,trib,ie){if(!(c>0)||!(pv>0))return null;const ce=trib?effCostRaw(c,pv,ie):c;return {mg:(pv-ce)/pv*100,mk:(pv-c)/c*100}}
const rcPct=v=>isFinite(v)?(Math.round(v*10)/10).toFixed(1).replace('.',',')+'%':'—';
function rcMgTxt(c,pv,trib,ie){const m=rcMargins(c,pv,trib,ie);return m?`<span class="${m.mg<0?'neg':m.mg<8?'wkwarn':'mgok'}">margem ${rcPct(m.mg)}</span> / markup ${rcPct(m.mk)}`:'<span class="muted">margem — / markup —</span>'}
function precScreen(el){if(!el)return;S.receipts=S.receipts||[];const P=ui.prc=ui.prc||{};
  const cur=P.id&&S.receipts.find(r=>r.id===P.id&&r.status==='conferida');
  if(cur)return precEdit(el,cur);
  P.id=null;const L=rcPend().sort((a,b)=>String(a.conferidaAt).localeCompare(String(b.conferidaAt)));
  const ok=S.receipts.filter(r=>r.status==='aprovada').sort((a,b)=>String(b.aprovadaAt).localeCompare(String(a.aprovadaAt))).slice(0,8);
  el.innerHTML=`<div class="sectionhead"><h2>Precificação de notas</h2></div>
    ${L.length?`<div class="notice" style="margin-bottom:12px"><b>${L.length} nota${L.length>1?'s':''} esperando preço.</b> O estoque já entrou; os preços e o custo só mudam quando você aprovar.</div>
      <div class="rclist">${L.map(r=>`<button class="rccard pend" data-pco="${r.id}"><span><b>NF ${esc(r.nf)}</b> · ${esc(r.supplierName)}</span><span class="small muted">${r.items.length} ite${r.items.length===1?'m':'ns'} · ${brl(r.totalNota||0)} · conferida por ${esc(r.conferidaBy||r.by||'')} em ${r.conferidaAt?dBR(String(r.conferidaAt).slice(0,10)):''}</span></button>`).join('')}</div>`
      :'<div class="empty">Nenhuma nota esperando preço.</div>'}
    ${ok.length?`<h3 class="dech" style="margin-top:16px">Aprovadas recentemente</h3><div class="rclist">${ok.map(r=>`<div class="rccard"><span><b>NF ${esc(r.nf)}</b> · ${esc(r.supplierName)}</span><span class="small muted">${r.items.length} itens · ${brl(r.totalNota||0)} · aprovada por ${esc(r.aprovadaBy||'')}</span></div>`).join('')}</div>`:''}`;
  el.querySelectorAll('[data-pco]').forEach(b=>b.onclick=()=>{P.id=b.dataset.pco;precScreen(el);window.scrollTo(0,0)});
}
function precEdit(el,r){const P=ui.prc;P.lk=P.lk||{};
  // começa com o que o produto já tem (tributação, preços), para só ajustar
  let pre=false;r.items.forEach(i=>{const p=i.pid&&(S.products||[]).find(x=>x.id===i.pid);if(i.trib===undefined){i.trib=!!(p&&p.trib);pre=true}
    if(i.ieOn===undefined){i.ieOn=!!(p&&Number(p.iePrice)>0);pre=true}
    if(i.price===undefined||i.price===''){if(p&&Number(p.price)>0){i.price=Number(p.price);pre=true}}
    if(i.ieOn&&(i.iePrice===undefined||i.iePrice==='')&&p&&Number(p.iePrice)>0){i.iePrice=Number(p.iePrice);pre=true}});
  const row=i=>{const p=i.pid&&(S.products||[]).find(x=>x.id===i.pid),c=Number(i.valor)||0,pk=Number(i.perPack)>1?Number(i.perPack):1,lk=P.lk[i.k],hits=lk&&lk.q?rcFindProducts(lk.q):[];
    return `<div class="pcline" data-k="${i.k}">
      <div class="pcname"><b>${esc(i.name)}</b><span class="small muted">${p?[p.code&&'Cód. '+esc(p.code),esc(p.unit||''),Number(p.price)>0?'hoje '+brl(Number(p.price))+(Number(p.iePrice)>0?' (IE '+brl(Number(p.iePrice))+')':''):''].filter(Boolean).join(' · '):'<span class="neg">sem cadastro</span>'}</span>
        ${p?'':`<div class="pclink"><input type="text" data-plq="${i.k}" value="${esc(lk&&lk.q||'')}" placeholder="Ligar a um produto: digite nome, código ou EAN" autocomplete="off">
          ${hits.length?`<div class="rchits">${hits.slice(0,6).map(h=>`<button type="button" class="rchit" data-plp="${i.k}|${h.id}"><b>${esc(h.name)}</b><span class="small muted">${esc(h.unit||'')}</span></button>`).join('')}</div>`:''}
          <label class="switch small"><input type="checkbox" data-pnew="${i.k}" ${i.newProd?'checked':''}> Criar produto novo com este nome</label></div>`}</div>
      <div class="pcnums">
        <label>Qtd<input type="text" inputmode="decimal" data-pq="${i.k}" value="${rcQty(i.q)}"></label>
        <label>Fardo c/<input type="text" inputmode="decimal" data-ppk="${i.k}" value="${rcQty(pk)}"></label>
        <label>Valor unit. (R$)<input type="text" inputmode="decimal" data-pc="${i.k}" value="${rcMoney(i.valor)}"></label>
        <span class="small muted pcunit">${pk>1&&c>0?brl(c/pk)+' por unidade':''}</span></div>
      <div class="pcflags"><label class="switch small"><input type="checkbox" data-ptr="${i.k}" ${i.trib?'checked':''}> Tributado</label><label class="switch small"><input type="checkbox" data-pie="${i.k}" ${i.ieOn?'checked':''}> Preço com inscrição estadual</label></div>
      <div class="pcprices">
        <label>${i.ieOn?'Preço sem IE':'Preço de venda'} (R$)<input type="text" inputmode="decimal" data-pp="${i.k}" value="${rcMoney(i.price)}" placeholder="0,00"></label><span class="small pcmg" data-pmg="${i.k}">${rcMgTxt(c,Number(i.price),i.trib,false)}</span>
        ${i.ieOn?`<label>Preço com IE (R$)<input type="text" inputmode="decimal" data-pi="${i.k}" value="${rcMoney(i.iePrice)}" placeholder="0,00"></label><span class="small pcmg" data-pmi="${i.k}">${rcMgTxt(c,Number(i.iePrice),i.trib,true)}</span>`:''}
      </div></div>`};
  const t=taxCfg();
  el.innerHTML=`<div class="sectionhead"><h2>Precificar NF ${esc(r.nf)}</h2><button class="btn ghost dlb" id="pcBack">Voltar</button></div>
    <div class="panel rchead"><span><b>${esc(r.supplierName)}</b> · ${r.items.length} itens · ${brl(r.totalNota||0)}</span><span class="small muted">Conferida por ${esc(r.conferidaBy||r.by||'')}${r.emissao?' · emissão '+dBR(r.emissao):''} · tributado: ICMS de saída ${String(t.idNo).replace('.',',')}% sem IE e ${String(t.idIe).replace('.',',')}% com IE, mais PIS/COFINS ${String(t.pd).replace('.',',')}%</span></div>
    <div class="pclist">${r.items.map(row).join('')}</div>
    <div class="panel rcfoot"><span class="small muted">O estoque já entrou na conferência. Ao aprovar, custo, embalagem, tributação e preços vão para os produtos.</span>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="pcOk">Aprovar e atualizar preços</button><button class="btn ghost" id="pcSave">Salvar e continuar depois</button></div></div>`;
  if(pre)save();
  const rer=(focus)=>{const y=window.scrollY;precEdit(el,r);window.scrollTo(0,y);if(focus){const n=el.querySelector(focus);if(n)n.focus()}};
  const it=k=>r.items.find(x=>x.k===k);
  const upMg=i=>{const c=Number(i.valor)||0,a=el.querySelector('[data-pmg="'+i.k+'"]'),b=el.querySelector('[data-pmi="'+i.k+'"]');if(a)a.innerHTML=rcMgTxt(c,Number(i.price),i.trib,false);if(b)b.innerHTML=rcMgTxt(c,Number(i.iePrice),i.trib,true)};
  const num=(attr,field,fmt,min)=>el.querySelectorAll('['+attr+']').forEach(inp=>{const k=inp.getAttribute(attr);
    inp.oninput=()=>{const i=it(k),v=pnum(inp.value);if(!i)return;if(v!==''&&v>=min){i[field]=v;upMg(i)}};
    inp.onchange=()=>{const i=it(k),v=pnum(inp.value);if(!i)return;if(inp.value.trim()&&(v===''||v<min)){toast('Valor inválido.');inp.value=fmt(i[field]);return}i[field]=v===''?'':v;inp.value=fmt(i[field]);save();if(field==='perPack'||field==='valor')rer()}});
  num('data-pq','q',rcQty,0.001);num('data-ppk','perPack',rcQty,1);num('data-pc','valor',rcMoney,0);num('data-pp','price',rcMoney,0.01);num('data-pi','iePrice',rcMoney,0.01);
  el.querySelectorAll('[data-ptr]').forEach(b=>b.onchange=()=>{const i=it(b.dataset.ptr);i.trib=b.checked;save();rer()});
  el.querySelectorAll('[data-pie]').forEach(b=>b.onchange=()=>{const i=it(b.dataset.pie);i.ieOn=b.checked;if(!b.checked)i.iePrice='';save();rer(b.checked?'[data-pi="'+i.k+'"]':null)});
  el.querySelectorAll('[data-pnew]').forEach(b=>b.onchange=()=>{const i=it(b.dataset.pnew);i.newProd=b.checked;save()});
  el.querySelectorAll('[data-plq]').forEach(inp=>inp.oninput=()=>{P.lk[inp.dataset.plq]={q:inp.value};const pos=inp.selectionStart;rer();const n=el.querySelector('[data-plq="'+inp.dataset.plq+'"]');n.focus();n.setSelectionRange(pos,pos)});
  el.querySelectorAll('[data-plp]').forEach(b=>b.onclick=()=>{const [k,pid]=b.dataset.plp.split('|'),i=it(k),p=(S.products||[]).find(x=>x.id===pid);if(!i||!p)return;
    i.pid=p.id;i.name=p.name;i.unit=p.unit||'';delete i.newProd;if(Number(p.perPack)>1&&!(Number(i.perPack)>1))i.perPack=Number(p.perPack);if(i.price===''||i.price==null)i.price=Number(p.price)||'';i.trib=!!p.trib;delete P.lk[k];save();rer()});
  $('#pcBack').onclick=()=>{P.id=null;precScreen(el)};
  $('#pcSave').onclick=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();save();toast('Precificação salva. A nota continua aguardando aprovação.');P.id=null;precScreen(el)};
  $('#pcOk').onclick=()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
    const bad=r.items.map(i=>!i.pid&&!i.newProd?i.name+': ligue a um produto ou marque "criar produto novo"':!(Number(i.price)>0)?i.name+': falta o preço de venda':i.ieOn&&!(Number(i.iePrice)>0&&Number(i.iePrice)<Number(i.price))?i.name+': o preço com IE precisa ser menor que o preço normal':'').filter(Boolean);
    if(bad.length){toast(bad[0]+(bad.length>1?' (e mais '+(bad.length-1)+')':''));return}
    const neg=r.items.filter(i=>{const m=rcMargins(Number(i.valor),Number(i.price),i.trib,false);return m&&m.mg<0});
    if(!confirm('Aprovar a NF '+r.nf+' e atualizar custo e preço de '+r.items.length+' produto(s)?'+(neg.length?'\nAtenção: '+neg.length+' com margem negativa ('+neg.map(i=>i.name).slice(0,3).join(', ')+').':'')))return;
    r.status='aprovada';save();P.id=null;toast('NF '+r.nf+' aprovada: preços e custos atualizados.');precScreen(el);window.scrollTo(0,0)};
}
/* faturamento: aba "Precificar notas" dentro da tela dela */
function fatPrecView(app,F){const n=rcPend().length;
  app.innerHTML=`<div class="sectionhead"><h2>Faturamento</h2></div>
    <div class="seg repseg" role="group" aria-label="Lista"><button data-ft="fat" aria-pressed="false">A faturar</button><button data-ft="sep" aria-pressed="false">Em separação</button><button data-ft="feitos" aria-pressed="false">Faturados</button><button data-ft="prec" aria-pressed="true">Precificar notas${n?' ('+n+')':''}</button></div><div id="precwrap"></div>`;
  app.querySelectorAll('[data-ft]').forEach(b=>b.onclick=()=>{F.tab=b.dataset.ft;F.sel={};renderFat()});
  precScreen($('#precwrap'))}
/* aviso fixo no painel do administrador enquanto houver nota sem preço aprovado */
function rcAlert(){const n=rcPend().length,c=$('#tabc');if(!n||!c||ui.tab==='precnotas')return;
  const d=document.createElement('div');d.className='rcalert';d.innerHTML=`<span><b>${n} nota${n>1?'s':''} de entrada esperando preço.</b> O estoque já entrou; aprove os preços em Produtos › Precificação de notas.</span><button type="button" class="btn dlb">Precificar agora</button>`;
  c.prepend(d);d.querySelector('button').onclick=()=>{ui.tab='precnotas';renderAdmin();window.scrollTo(0,0)}}

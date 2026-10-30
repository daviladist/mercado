/* ===================== Frete de terceiro (módulo "frete3") =====================
   Transportadora cadastrada com um % combinado sobre o valor da nota (total do pedido).
   - No pedido (ao lançar/editar pelo painel e no cartão do pedido): marcar "Frete terceiro", escolher a transportadora (o % vem sozinho).
   - Financeiro › Frete de terceiro: quanto cada transportadora gerou, quanto já foi pago e o saldo a pagar.
   - Pagamento lançado com data e valor abate do saldo.
   Só o administrador vê e grava (o servidor esconde dos outros papéis). */
const f3On=()=>modOn('frete3');
const f3R=v=>Math.round((Number(v)||0)*100)/100;
const f3Pct=v=>String(f3R(v)).replace('.',',')+'%';
/* frete do pedido: % sobre o total (pedido cancelado não gera frete) */
const f3Val=o=>o&&o.frete3&&o.status!=='cancelado'?f3R((Number(o.total)||0)*Number(o.frete3.pct)/100):0;
const f3Day=o=>String(o.date||'').slice(0,10);
function f3List(all){return (S.carriers||[]).filter(x=>all||x.active!==false).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)))}
const f3ById=id=>(S.carriers||[]).find(x=>x.id===id)||null;
function f3Make(carrierId,pct){const cr=f3ById(carrierId);if(!cr)return null;const p=f3R(pnum(pct)===''?cr.pct:pnum(pct));
  return {carrierId:cr.id,name:cr.name,pct:p>0&&p<100?p:cr.pct,at:new Date().toISOString(),by:ui.adminName||'Loja'}}

/* caixinha de escolher o frete (usada no revisar pedido e no cartão do pedido) */
function f3Picker(cur,total,key){
  const L=f3List();
  if(!L.length)return `<div class="small muted">Nenhuma transportadora cadastrada. Cadastre em <b>CADASTROS › Fornecedores › Transportadoras</b>.</div>`;
  const on=!!cur,cr=cur&&f3ById(cur.carrierId),pct=cur?cur.pct:'';
  return `<div class="f3box" style="display:grid;gap:8px">
    <label class="switch small"><input type="checkbox" data-f3on="${key}" ${on?'checked':''}> <b>Frete terceiro</b> <span class="muted">(transportadora paga pela loja)</span></label>
    ${on?`<div class="grid2"><div class="field"><label for="f3c_${key}">Transportadora</label><select id="f3c_${key}" data-f3c="${key}">
        <option value="">Escolha a transportadora</option>${L.map(x=>`<option value="${x.id}" ${cur&&cur.carrierId===x.id?'selected':''}>${esc(x.name)} · ${f3Pct(x.pct)}</option>`).join('')}</select></div>
      <div class="field"><label for="f3p_${key}">% sobre a nota</label><input type="text" inputmode="decimal" id="f3p_${key}" data-f3p="${key}" value="${pct!==''?String(pct).replace('.',','):''}" ${cr?'':'disabled'}></div></div>
      ${cr?`<div class="small">Frete deste pedido: <b>${brl(f3R((Number(total)||0)*Number(pct)/100))}</b> <span class="muted">(${f3Pct(pct)} de ${brl(total)})</span>${Math.abs(Number(pct)-Number(cr.pct))>0.004?` · <span class="chgtxt">combinado é ${f3Pct(cr.pct)}</span>`:''}</div>`:''}`:''}
  </div>`;
}

/* no cartão do pedido (administrador) */
function f3OrderBox(o){
  if(!f3On())return '';
  if(ui.f3Edit===o.id){const T=ui.f3Tmp||null;
    return `<div class="panel" style="display:grid;gap:8px;padding:10px;margin:6px 0">${f3Picker(T,o.total,'o'+o.id)}
      <div class="row" style="gap:8px"><button type="button" class="btn" data-f3save="${o.id}">Salvar frete</button><button type="button" class="btn ghost" data-f3cancel="${o.id}">Cancelar</button></div></div>`}
  if(o.frete3)return `<div class="small">🚚 <b>Frete terceiro:</b> ${esc(o.frete3.name)} · ${f3Pct(o.frete3.pct)} = <b>${brl(f3Val(o))}</b>${o.status==='cancelado'?' <span class="muted">(pedido cancelado: não conta)</span>':''} <button type="button" class="link" data-f3edit="${o.id}">alterar</button></div>`;
  return `<button type="button" class="link" data-f3edit="${o.id}">+ Frete terceiro</button>`;
}

/* tudo pelo clique "delegado": o cartão do pedido aparece em mais de uma tela */
function f3Rer(){const y=window.scrollY;if(ui.lanc&&typeof admLancar==='function')admLancar();else renderAdmin();window.scrollTo(0,y)}
function f3Target(key){if(key==='ln')return ui.lanc;return null}
document.addEventListener('change',e=>{const t=e.target;if(!t||!t.dataset)return;
  const k=t.dataset.f3on||t.dataset.f3c||t.dataset.f3p;if(!k)return;
  const isLn=k==='ln',L=isLn?ui.lanc:null;
  const get=()=>isLn?(L?L.frete3:null):ui.f3Tmp,set=v=>{if(isLn){if(L)L.frete3=v}else ui.f3Tmp=v};
  if(t.dataset.f3on){if(t.checked){const one=f3List();set(one.length===1?f3Make(one[0].id):{carrierId:'',pct:''})}else set(null)}
  else if(t.dataset.f3c){set(t.value?f3Make(t.value):{carrierId:'',pct:''})}
  else if(t.dataset.f3p){const cur=get();if(cur&&cur.carrierId){const v=pnum(t.value);if(v===''||isNaN(v)||!(v>0&&v<100)){toast('Percentual inválido: use um número entre 0 e 100.');}else set(Object.assign({},cur,{pct:f3R(v)}))}}
  f3Rer()});
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-f3edit],[data-f3save],[data-f3cancel]');if(!b)return;
  if(b.dataset.f3edit){const o=S.orders.find(x=>x.id===b.dataset.f3edit);ui.f3Edit=b.dataset.f3edit;ui.f3Tmp=o&&o.frete3?Object.assign({},o.frete3):null;f3Rer();return}
  if(b.dataset.f3cancel){ui.f3Edit=null;ui.f3Tmp=null;f3Rer();return}
  if(b.dataset.f3save){const o=S.orders.find(x=>x.id===b.dataset.f3save);if(!o)return;const T=ui.f3Tmp;
    if(T&&!T.carrierId){toast('Escolha a transportadora ou desmarque o frete terceiro.');return}
    if(T){o.frete3=f3Make(T.carrierId,T.pct);toast('Frete terceiro salvo no pedido nº '+o.no+': '+brl(f3Val(o)))}else{delete o.frete3;toast('Frete terceiro tirado do pedido nº '+o.no)}
    ui.f3Edit=null;ui.f3Tmp=null;save();f3Rer()}});

/* ---------------- CADASTROS › Fornecedores › Transportadoras ---------------- */
function admTransportadoras(){
  const c=$('#cadc');S.carriers=S.carriers||[];const F=ui.car=ui.car||{edit:null};const E=F.edit,L=f3List(true);
  c.innerHTML=`<div class="sectionhead"><h2>Transportadoras (frete terceiro)</h2><button class="btn" id="carNew">+ Nova transportadora</button></div>
    <p class="small muted" style="max-width:720px;margin-top:0">Cadastre a empresa que faz a entrega para você e o <b>% combinado sobre o valor da nota</b>. No pedido, é só marcar "Frete terceiro" e escolher a transportadora.</p>
    ${E?`<form class="panel" id="carf" style="display:grid;gap:10px;margin-bottom:14px;max-width:720px">
      <b>${E.id?'Editar transportadora':'Nova transportadora'}</b>
      <div class="grid2"><div class="field"><label for="carn">Nome</label><input type="text" id="carn" value="${esc(E.name||'')}" required></div>
        <div class="field"><label for="carp">% do frete sobre a nota</label><input type="text" id="carp" inputmode="decimal" value="${E.pct!=null&&E.pct!==''?String(E.pct).replace('.',','):''}" placeholder="Ex.: 3,5" required></div></div>
      <div class="grid2"><div class="field"><label for="card">CNPJ</label><input type="text" id="card" inputmode="numeric" value="${esc(E.doc||'')}"></div>
        <div class="field"><label for="cart">Telefone</label><input type="text" id="cart" inputmode="tel" value="${esc(E.phone||'')}"></div></div>
      <div class="grid2"><div class="field"><label for="cark">Contato</label><input type="text" id="cark" value="${esc(E.contact||'')}"></div>
        <div class="field"><label for="caro">Observação</label><input type="text" id="caro" value="${esc(E.note||'')}"></div></div>
      <label class="switch small"><input type="checkbox" id="cara" ${E.active!==false?'checked':''}> Ativa (aparece para escolher no pedido)</label>
      ${E.id?`<div class="small muted">Mudar o % vale para os próximos pedidos. Pedidos que já têm frete continuam com o % que foi marcado neles.</div>`:''}
      <div class="err" id="care"></div>
      <div class="row" style="gap:8px"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" id="carx">Cancelar</button></div></form>`:''}
    ${L.length?`<div class="list" style="max-width:720px">${L.map(x=>`<div class="prow ${x.active===false?'off':''}" style="grid-template-columns:minmax(0,1fr) auto"><div class="t"><b>${esc(x.name)} · ${f3Pct(x.pct)}</b><span class="small muted">${[x.doc&&'CNPJ '+esc(x.doc),x.phone&&esc(x.phone),x.contact&&esc(x.contact)].filter(Boolean).join(' · ')||'—'}${x.active===false?' · inativa':''}</span></div>
      <div class="row" style="gap:6px">${ui.confirmDel==='cr'+x.id?`<button class="btn danger dlb" data-carok="${x.id}">Confirmar exclusão</button>`:`<button class="btn ghost dlb" data-cardel="${x.id}">Excluir</button>`}<button class="btn ghost dlb" data-care="${x.id}">Editar</button></div></div>`).join('')}</div>`
      :`<div class="empty">Nenhuma transportadora cadastrada. Toque em "+ Nova transportadora".</div>`}`;
  const rer=()=>{const y=window.scrollY;admTransportadoras();window.scrollTo(0,y)};
  $('#carNew').onclick=()=>{F.edit={name:'',pct:'',active:true};rer();const n=$('#carn');if(n)n.focus()};
  c.querySelectorAll('[data-care]').forEach(b=>b.onclick=()=>{F.edit={...f3ById(b.dataset.care)};rer();window.scrollTo(0,0)});
  c.querySelectorAll('[data-cardel]').forEach(b=>b.onclick=()=>{ui.confirmDel='cr'+b.dataset.cardel;rer()});
  c.querySelectorAll('[data-carok]').forEach(b=>b.onclick=()=>{const id=b.dataset.carok;
    if(S.orders.some(o=>o.frete3&&o.frete3.carrierId===id)||(S.carrierPays||[]).some(p=>p.carrierId===id)){toast('Essa transportadora tem fretes ou pagamentos: desative em vez de excluir.');ui.confirmDel=null;rer();return}
    S.carriers=S.carriers.filter(x=>x.id!==id);ui.confirmDel=null;save();toast('Transportadora excluída');rer()});
  if(E){$('#carx').onclick=()=>{F.edit=null;rer()};
    $('#carf').onsubmit=ev=>{ev.preventDefault();const name=$('#carn').value.trim(),pct=pnum($('#carp').value);
      if(!name){$('#care').textContent='Informe o nome.';return}
      if(pct===''||isNaN(pct)||!(pct>0&&pct<100)){$('#care').textContent='Informe o % combinado (ex.: 3,5).';return}
      if(S.carriers.some(x=>x.id!==E.id&&String(x.name||'').trim().toLowerCase()===name.toLowerCase())){$('#care').textContent='Já existe transportadora com esse nome.';return}
      const d={id:E.id||uid(),name,pct:f3R(pct),doc:$('#card').value.trim(),phone:$('#cart').value.trim(),contact:$('#cark').value.trim(),note:$('#caro').value.trim(),active:$('#cara').checked};
      const i=S.carriers.findIndex(x=>x.id===d.id);if(i>=0)S.carriers[i]=d;else S.carriers.push(d);
      F.edit=null;save();toast('Transportadora salva');rer()}}
}

/* ---------------- FINANCEIRO › Frete de terceiro ---------------- */
function f3Summary(cid){
  const orders=S.orders.filter(o=>o.frete3&&o.frete3.carrierId===cid&&o.status!=='cancelado');
  const pays=(S.carrierPays||[]).filter(p=>p.carrierId===cid);
  const gerado=f3R(orders.reduce((s,o)=>s+f3Val(o),0)),pago=f3R(pays.reduce((s,p)=>s+(Number(p.amount)||0),0));
  return {orders,pays,gerado,pago,saldo:f3R(gerado-pago)};
}
function admFretes(){
  const c=$('#tabc');const F=ui.f3r=ui.f3r||Object.assign({cid:'',pay:null},monthRange());
  const L=f3List(true).filter(x=>x.active!==false||f3Summary(x.id).saldo!==0||f3Summary(x.id).orders.length);
  if(!L.length){c.innerHTML=`<div class="sectionhead"><h2>Frete de terceiro</h2></div><div class="empty">Nenhuma transportadora cadastrada ainda. Cadastre em <b>CADASTROS › Fornecedores › Transportadoras</b> e marque o frete nos pedidos.</div>`;return}
  if(!F.cid||!L.some(x=>x.id===F.cid))F.cid=L[0].id;
  const cr=f3ById(F.cid),Sm=f3Summary(F.cid),bad=F.from>F.to;
  const per=bad?[]:Sm.orders.filter(o=>f3Day(o)>=F.from&&f3Day(o)<=F.to).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const perTot=f3R(per.reduce((s,o)=>s+f3Val(o),0)),perBase=f3R(per.reduce((s,o)=>s+(Number(o.total)||0),0));
  const pays=Sm.pays.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const P=F.pay;
  c.innerHTML=`<div class="sectionhead"><h2>Frete de terceiro</h2></div>
    <div class="list" style="margin-bottom:14px">${L.map(x=>{const s=f3Summary(x.id);return `<button type="button" class="prow" data-f3cr="${x.id}" aria-pressed="${x.id===F.cid}" style="grid-template-columns:minmax(0,1fr) auto;text-align:left;${x.id===F.cid?'outline:2px solid var(--accent)':''}">
      <div class="t"><b>${esc(x.name)} · ${f3Pct(x.pct)}</b><span class="small muted">Frete gerado ${brl(s.gerado)} · pago ${brl(s.pago)}</span></div>
      <div class="num" style="text-align:right"><div class="small muted">A pagar</div><b style="color:${s.saldo>0.004?'var(--warn)':'inherit'}">${brl(s.saldo)}</b></div></button>`}).join('')}</div>
    <section class="panel" style="display:grid;gap:12px">
      <div class="sectionhead" style="margin:0"><h2 style="margin:0">${esc(cr.name)}</h2><button class="btn" id="f3PayNew">Registrar pagamento</button></div>
      <div class="grid3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        <div class="panel"><div class="small muted">Frete gerado (total)</div><b class="num">${brl(Sm.gerado)}</b></div>
        <div class="panel"><div class="small muted">Já pago</div><b class="num">${brl(Sm.pago)}</b></div>
        <div class="panel"><div class="small muted">Saldo a pagar</div><b class="num" style="font-size:1.25em;color:${Sm.saldo>0.004?'var(--warn)':'inherit'}">${brl(Sm.saldo)}</b>${Sm.saldo<-0.004?'<div class="small chgtxt">Pago a mais (crédito com a transportadora)</div>':''}</div>
      </div>
      ${P?`<form class="panel" id="f3pf" style="display:grid;gap:10px;max-width:620px"><b>Pagamento para ${esc(cr.name)}</b>
        <div class="grid2"><div class="field"><label for="f3pd">Data do pagamento</label><input type="date" id="f3pd" value="${esc(P.date)}" required></div>
          <div class="field"><label for="f3pv">Valor pago (R$)</label><input type="text" id="f3pv" inputmode="decimal" value="${esc(P.amount||'')}" placeholder="Ex.: 5.000,00" required></div></div>
        <div class="field"><label for="f3pn">Observação</label><input type="text" id="f3pn" value="${esc(P.note||'')}" placeholder="Ex.: PIX, boleto, referente a outubro"></div>
        <div class="small muted">Saldo hoje: ${brl(Sm.saldo)}. O pagamento abate desse saldo.</div>
        <div class="err" id="f3pe"></div>
        <div class="row" style="gap:8px"><button class="btn" type="submit">Salvar pagamento</button><button class="btn ghost" type="button" id="f3px">Cancelar</button></div></form>`:''}
      <div class="field"><span class="lbl">Fretes por período (data do pedido)</span>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:end"><label class="small">De <input type="date" id="f3from" value="${F.from}"></label><label class="small">Até <input type="date" id="f3to" value="${F.to}"></label>
          <button type="button" class="btn ghost" id="f3xls" ${per.length||pays.length?'':'disabled'}>Baixar Excel</button></div>
        ${bad?'<div class="err">A data inicial é depois da final.</div>':''}</div>
      ${per.length?`<div class="tablewrap"><table class="btable"><thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th class="num">Valor da nota</th><th class="num">%</th><th class="num">Frete</th></tr></thead><tbody>
        ${per.map(o=>`<tr><td class="num">${dBR(f3Day(o))}</td><td class="num">nº ${o.no}</td><td>${esc(o.customer||'')}</td><td class="num">${brl(o.total)}</td><td class="num">${f3Pct(o.frete3.pct)}</td><td class="num"><b>${brl(f3Val(o))}</b></td></tr>`).join('')}
        <tr><td colspan="3"><b>${per.length} pedido${per.length===1?'':'s'} no período</b></td><td class="num">${brl(perBase)}</td><td></td><td class="num"><b>${brl(perTot)}</b></td></tr></tbody></table></div>`
        :`<div class="empty">Nenhum pedido com frete desta transportadora no período.</div>`}
      <div class="field"><span class="lbl">Pagamentos feitos</span>
      ${pays.length?`<div class="tablewrap"><table class="btable"><thead><tr><th>Data</th><th class="num">Valor</th><th>Observação</th><th></th></tr></thead><tbody>
        ${pays.map(p=>`<tr><td class="num">${dBR(p.date)}</td><td class="num"><b>${brl(p.amount)}</b></td><td>${esc(p.note||'')}${p.by?` <span class="muted small">· ${esc(p.by)}</span>`:''}</td>
          <td>${ui.confirmDel==='cp'+p.id?`<button class="btn danger dlb" data-f3pok="${p.id}">Confirmar exclusão</button>`:`<button class="btn ghost dlb" data-f3pdel="${p.id}">Excluir</button>`}</td></tr>`).join('')}</tbody></table></div>`
        :`<div class="empty">Nenhum pagamento lançado para esta transportadora.</div>`}</div>
    </section>`;
  const rer=()=>{const y=window.scrollY;admFretes();window.scrollTo(0,y)};
  c.querySelectorAll('[data-f3cr]').forEach(b=>b.onclick=()=>{F.cid=b.dataset.f3cr;F.pay=null;ui.confirmDel=null;rer()});
  $('#f3from').onchange=e=>{F.from=e.target.value||F.from;rer()};$('#f3to').onchange=e=>{F.to=e.target.value||F.to;rer()};
  $('#f3PayNew').onclick=()=>{F.pay={date:today(),amount:'',note:''};rer();const v=$('#f3pv');if(v)v.focus()};
  c.querySelectorAll('[data-f3pdel]').forEach(b=>b.onclick=()=>{ui.confirmDel='cp'+b.dataset.f3pdel;rer()});
  c.querySelectorAll('[data-f3pok]').forEach(b=>b.onclick=()=>{S.carrierPays=(S.carrierPays||[]).filter(p=>p.id!==b.dataset.f3pok);ui.confirmDel=null;save();toast('Pagamento excluído: o saldo voltou');rer()});
  if(P){$('#f3px').onclick=()=>{F.pay=null;rer()};
    $('#f3pf').onsubmit=ev=>{ev.preventDefault();const date=$('#f3pd').value,amount=pnum($('#f3pv').value),note=$('#f3pn').value.trim();
      Object.assign(P,{date,amount:$('#f3pv').value,note});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){$('#f3pe').textContent='Informe a data do pagamento.';return}
      if(amount===''||isNaN(amount)||!(amount>0)){$('#f3pe').textContent='Informe o valor pago (ex.: 5.000,00).';return}
      S.carrierPays=S.carrierPays||[];S.carrierPays.push({id:uid(),carrierId:cr.id,carrierName:cr.name,date,amount:f3R(amount),note,by:ui.adminName||'Loja',at:new Date().toISOString()});
      F.pay=null;save();toast('Pagamento de '+brl(amount)+' registrado. Saldo agora: '+brl(f3Summary(cr.id).saldo));rer()}}
  $('#f3xls').onclick=()=>{if(typeof XLSX==='undefined'){toast('Não consegui carregar o Excel. Verifique a internet.');return}
    const head=[[S.store.name],['Frete de terceiro · '+cr.name+' · '+f3Pct(cr.pct)],['Período',F.from.split('-').reverse().join('/')+' a '+F.to.split('-').reverse().join('/')],[],['Data','Pedido nº','Cliente','Valor da nota (R$)','%','Frete (R$)']];
    const rows=per.map(o=>[f3Day(o).split('-').reverse().join('/'),o.no,o.customer||'',Number(o.total)||0,Number(o.frete3.pct),f3Val(o)]);
    const foot=[['','','Total do período',perBase,'',perTot],[],['Pagamentos'],['Data','Valor (R$)','Observação'],...pays.map(p=>[String(p.date).split('-').reverse().join('/'),Number(p.amount)||0,p.note||'']),[],['Frete gerado (total)','',Sm.gerado],['Já pago','',Sm.pago],['Saldo a pagar','',Sm.saldo]];
    const ws=XLSX.utils.aoa_to_sheet([...head,...rows,...foot]);ws['!cols']=[{wch:14},{wch:12},{wch:34},{wch:18},{wch:8},{wch:14}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Frete');
    offerFile('frete-'+String(cr.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+F.from+'-a-'+F.to+'.xlsx',XLSX.write(wb,{type:'array',bookType:'xlsx'}))};
}

// Mejoras de flujo UX para Atlas Integrador demo.
// Mantiene la demo sin backend y evita tocar el core mientras validamos operación.

state.quoteDetail=null;
state.projectDetailId=null;
state.laborBuilder=null;
state.quoteYear=state.quoteYear||'2026';
state.quoteOwner=state.quoteOwner||'Todos';

const cloneDemo=x=>JSON.parse(JSON.stringify(x));
function ensureQuoteMeta(row){
  if(!row)return row;
  row.year=row.year||((String(row.date||'').match(/20\d{2}/)||['2026'])[0]);
  row.followups=row.followups||[];
  row.revisions=row.revisions||[];
  return row;
}
quotes.forEach(ensureQuoteMeta);
function quoteOwnerOptions(){return ['Todos',...new Set(quotes.map(q=>q.owner).filter(Boolean))]}
function quoteYearOptions(){return ['Todos',...new Set(quotes.map(q=>ensureQuoteMeta(q).year).filter(Boolean))].sort().reverse()}
function quoteStatusColor(status){return status==='Perdida'?'red':status==='Pendiente'?'orange':status==='Aceptada'?'green':status==='Borrador'?'gray':'blue'}
function quoteSnapshotSummary(snapshot){
  const q=cloneDemo(snapshot);const t=quoteTotals(q);
  return {revision:q.revision||0,total:t.total,subtotal:t.subtotal,cost:t.mc+t.lc,margin:t.margin};
}
function startQuoteRevision(row){
  ensureQuoteMeta(row);
  const current=savedQuoteObject(row);
  row.revisions.push({
    revision:row.revision||0,
    status:row.status,
    date:row.date,
    snapshot:cloneDemo(current),
    total:row.total
  });
  const next=cloneDemo(current);
  next.revision=(row.revision||0)+1;
  next.status='Borrador';
  next.step=2;
  row.revision=next.revision;
  row.status='Borrador';
  row.snapshot=cloneDemo(next);
  state.quoteDetail=null;
  state.quote=next;
  renderQuote();
}
function registerQuoteFollowup(row){
  const note=document.querySelector('#followup-note')?.value.trim();
  const type=document.querySelector('#followup-type')?.value||'Llamada';
  const nextDate=document.querySelector('#followup-next')?.value||'';
  if(!note)return alert('Agrega una nota breve del seguimiento.');
  ensureQuoteMeta(row);
  row.followups.unshift({type,note,nextDate,date:'28 sep 2026',owner:'Usuario actual'});
  if(row.status==='Enviada')row.status='Pendiente';
  if(row.snapshot)row.snapshot.status=row.status;
  render();
}
function demoQuoteTemplate(row){
  return {id:row.id,revision:row.revision||0,status:row.status||'Enviada',step:7,clientId:row.clientId,name:row.name,currency:'MXN',materials:[{model:'DS-2CD2143G2-I',desc:'Cámara IP domo 4 MP',qty:8,cost:1850,markup:35,category:'VIDEO VIGILANCIA'},{model:'UTP-CAT6-BL',desc:'Cable Cat6 caja 305 m',qty:2,cost:2890,markup:30,category:'VIDEO VIGILANCIA'}],laborRows:[{activity:'CANALIZACIÓN',category:'VIDEO VIGILANCIA',personId:1,mode:'día',normalQty:1,satQty:0,sunQty:0,markup:70}],indirect:{safety:.02,tools:.03,general:.10,field:.03,finance:.03},truckDays:2,truckDaily:250,directedTo:clients.find(c=>c.id===row.clientId)?.contact||'',payment:'Contado',delivery:'15 días hábiles',validity:'15 días',ivaRate:16,retainISR:false,isrRate:0,scope:'',materialPresentation:'detail',laborPresentation:'detail'};
}
function savedQuoteObject(row){return row.snapshot?cloneDemo(row.snapshot):demoQuoteTemplate(row)}
function persistQuoteSnapshot(q,status){
  let row=quotes.find(x=>x.id===q.id);
  if(!row){
    row={id:q.id,clientId:q.clientId,name:q.name||'Proyecto nuevo',status:status||q.status||'Borrador',date:'28 sep 2026',owner:'Usuario actual',revision:q.revision,total:quoteTotals(q).total,year:'2026',followups:[],revisions:[]};
    quotes.unshift(row);folioConfig.nextQuote++;
  }
  ensureQuoteMeta(row);
  row.clientId=q.clientId;
  row.name=q.name||row.name;
  row.status=status||q.status||row.status;
  row.revision=q.revision||0;
  row.total=quoteTotals(q).total;
  q.status=row.status;
  row.snapshot=cloneDemo(q);
}

function laborLineCost(line){const p=personnel.find(x=>x.id===+line.personId)||personnel[0];let unit=0;if(line.mode==='hora')unit=line.dayType==='Sábado'?p.hour*1.5:line.dayType==='Domingo'?p.hour*2:p.hour;else unit=line.dayType==='Sábado'?p.satDay:line.dayType==='Domingo'?p.sunDay:p.day;return unit*(+line.qty||0)}
function blankLaborBuilder(){return{activity:activityCatalog[0],category:'VIDEO VIGILANCIA',lines:[{personId:personnel[0].id,mode:'día',dayType:'Normal',qty:1,markup:70}]}}
function groupedLabor(q){const map=new Map();q.laborRows.forEach((x,i)=>{let k=x.activity+'|'+x.category;if(!map.has(k))map.set(k,{activity:x.activity,category:x.category,items:[]});map.get(k).items.push({...x,_i:i})});return [...map.values()]}
function rowToBuilderLine(x){let dayType=x.satQty?'Sábado':x.sunQty?'Domingo':'Normal',qty=x.satQty||x.sunQty||x.normalQty||0;return{personId:x.personId,mode:x.mode,dayType,qty,markup:x.markup}}
function builderToLaborRows(b){return b.lines.filter(l=>(+l.qty||0)>0).map(l=>({activity:b.activity,category:b.category,personId:+l.personId,mode:l.mode,normalQty:l.dayType==='Normal'?+l.qty:0,satQty:l.dayType==='Sábado'?+l.qty:0,sunQty:l.dayType==='Domingo'?+l.qty:0,markup:+l.markup||0}))}

const baseRenderQuote=renderQuote;
renderQuote=function(){baseRenderQuote();enhanceQuotePage()}
function enhanceQuotePage(){const q=state.quote;if(!q)return;
  if(q.step===3){const body=document.querySelector('#qbody');if(body&&!document.querySelector('#material-filter')){const box=document.createElement('div');box.className='toolbar';box.style.marginBottom='12px';box.innerHTML='<input id="material-filter" class="input" style="min-width:320px" placeholder="Buscar dentro de materiales agregados por modelo o descripción">';body.insertBefore(box,body.children[2]||body.firstChild);document.querySelector('#material-filter').oninput=e=>{let term=e.target.value.toLowerCase();document.querySelectorAll('#qbody tbody tr').forEach(r=>r.style.display=!term||r.innerText.toLowerCase().includes(term)?'':'none')}}}
  if(q.step===4)renderLaborBuilder(q);
  const save=document.querySelector('#save-quote');if(save)save.onclick=()=>{if(!q.name)q.name='Proyecto nuevo';persistQuoteSnapshot(q,'Borrador');state.quote=null;state.quoteDetail=q.id;render()};
  const sent=document.querySelector('#mark-sent');if(sent)sent.onclick=()=>{q.status='Enviada';persistQuoteSnapshot(q,'Enviada');const row=quotes.find(x=>x.id===q.id);ensureQuoteMeta(row);row.followups.unshift({type:'Envío',note:'Cotización enviada al cliente.',nextDate:'',date:'28 sep 2026',owner:'Usuario actual'});state.quote=null;state.quoteDetail=q.id;render()};
}
function renderLaborBuilder(q){let b=state.laborBuilder||blankLaborBuilder();state.laborBuilder=b;const body=document.querySelector('#qbody');const groups=groupedLabor(q);const people=personnel.filter(x=>x.active);
 body.innerHTML=`<h3>Mano de obra presupuestada</h3><p class="muted">Busca la actividad y agrega todos los recursos que realmente requiera. Una misma actividad puede combinar técnicos, ayudantes, días y horas.</p><div class="note"><div class="grid-2"><div><label>Buscar / seleccionar actividad</label><input id="lab-act" class="input" list="act-list" value="${b.activity}" style="width:100%"><datalist id="act-list">${activityCatalog.map(x=>`<option value="${x}">`).join('')}</datalist></div><div><label>Asignar a</label><input id="lab-cat" class="input" list="cat-list" value="${b.category}" style="width:100%"><datalist id="cat-list"><option value="VIDEO VIGILANCIA"><option value="CONTROL DE ACCESO"><option value="REDES"><option value="FIBRA ÓPTICA"><option value="No asignado"></datalist></div></div><h4 style="margin:16px 0 8px">Recursos de la actividad</h4><div class="table-wrap"><table class="table"><thead><tr><th>Buscar recurso</th><th>Modo</th><th>Jornada</th><th>Cantidad</th><th>% utilidad</th><th>Costo empresa</th><th>Cliente</th><th></th></tr></thead><tbody>${b.lines.map((l,i)=>{let p=people.find(x=>x.id===+l.personId)||people[0],cost=laborLineCost(l);return `<tr><td><input class="input lb-person" data-i="${i}" list="people-list" value="${p.name} · ${p.position}" style="min-width:190px"></td><td><select class="select lb-mode" data-i="${i}"><option value="día" ${l.mode==='día'?'selected':''}>Por día</option><option value="hora" ${l.mode==='hora'?'selected':''}>Por hora</option></select></td><td><select class="select lb-day" data-i="${i}"><option ${l.dayType==='Normal'?'selected':''}>Normal</option><option ${l.dayType==='Sábado'?'selected':''}>Sábado</option><option ${l.dayType==='Domingo'?'selected':''}>Domingo</option></select></td><td><input class="input lb-qty" data-i="${i}" type="number" min="0" value="${l.qty}" style="width:75px"></td><td><input class="input lb-mark" data-i="${i}" type="number" min="0" value="${l.markup}" style="width:80px"></td><td>${fmt(cost)}</td><td><strong>${fmt(cost*(1+l.markup/100))}</strong></td><td><button class="ghost lb-del" data-i="${i}">Quitar</button></td></tr>`}).join('')}</tbody></table><datalist id="people-list">${people.map(p=>`<option value="${p.name} · ${p.position}">`).join('')}</datalist></div><div class="toolbar" style="margin-top:12px"><button class="ghost" id="lb-add">+ Agregar recurso</button><button class="primary" id="lb-save">Guardar actividad en resumen</button></div></div><h3 style="margin-top:22px">Resumen de actividades</h3><div class="table-wrap"><table class="table"><thead><tr><th>Asignado a</th><th>Actividad</th><th>Recursos</th><th>Costo</th><th>Cliente</th><th></th></tr></thead><tbody>${groups.length?groups.map((g,gi)=>{let cost=g.items.reduce((s,x)=>s+laborRowCost(x),0),sale=g.items.reduce((s,x)=>s+laborRowCost(x)*(1+x.markup/100),0);return `<tr><td>${g.category}</td><td><strong>${g.activity}</strong></td><td>${g.items.length}</td><td>${fmt(cost)}</td><td><strong>${fmt(sale)}</strong></td><td><button class="ghost lb-edit-group" data-i="${gi}">Editar</button> <button class="ghost lb-delete-group" data-i="${gi}">Eliminar</button></td></tr>`}).join(''):'<tr><td colspan="6" class="muted">Todavía no has agregado mano de obra a esta cotización.</td></tr>'}</tbody></table></div>`;
 const sync=()=>{b.activity=document.querySelector('#lab-act').value;b.category=document.querySelector('#lab-cat').value};document.querySelector('#lab-act').onchange=sync;document.querySelector('#lab-cat').onchange=sync;
 document.querySelectorAll('.lb-person').forEach(el=>el.onchange=e=>{let i=+e.target.dataset.i,p=people.find(p=>e.target.value.startsWith(p.name+' ·'));if(p)b.lines[i].personId=p.id;renderQuote()});document.querySelectorAll('.lb-mode').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].mode=e.target.value;renderQuote()});document.querySelectorAll('.lb-day').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].dayType=e.target.value;renderQuote()});document.querySelectorAll('.lb-qty').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].qty=+e.target.value;renderQuote()});document.querySelectorAll('.lb-mark').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].markup=+e.target.value;renderQuote()});document.querySelectorAll('.lb-del').forEach(el=>el.onclick=()=>{b.lines.splice(+el.dataset.i,1);if(!b.lines.length)b.lines.push({personId:people[0].id,mode:'día',dayType:'Normal',qty:1,markup:70});renderQuote()});
 document.querySelector('#lb-add').onclick=()=>{sync();b.lines.push({personId:people[0].id,mode:'día',dayType:'Normal',qty:1,markup:70});renderQuote()};document.querySelector('#lb-save').onclick=()=>{sync();q.laborRows.push(...builderToLaborRows(b));state.laborBuilder=blankLaborBuilder();renderQuote()};
 document.querySelectorAll('.lb-delete-group').forEach(el=>el.onclick=()=>{const g=groups[+el.dataset.i];q.laborRows=q.laborRows.filter(x=>!(x.activity===g.activity&&x.category===g.category));renderQuote()});document.querySelectorAll('.lb-edit-group').forEach(el=>el.onclick=()=>{const g=groups[+el.dataset.i];state.laborBuilder={activity:g.activity,category:g.category,lines:g.items.map(rowToBuilderLine)};q.laborRows=q.laborRows.filter(x=>!(x.activity===g.activity&&x.category===g.category));renderQuote()});
}

cotizaciones=function(){
  if(state.quote){renderQuote();return ''}
  if(state.quoteDetail)return quoteDetailView();
  setHead('Cotizaciones','Comercial','Nueva cotización');
  document.querySelector('#primary-action').onclick=()=>newQuote();
  let term=state.quoteSearch.toLowerCase();
  let rows=quotes.filter(x=>{
    ensureQuoteMeta(x);
    let c=clients.find(c=>c.id===x.clientId);
    return (state.quoteStatus==='Todos'||x.status===state.quoteStatus)
      &&(state.quoteYear==='Todos'||x.year===state.quoteYear)
      &&(state.quoteOwner==='Todos'||x.owner===state.quoteOwner)
      &&(!term||[x.id,x.name,c?.name,x.owner].some(v=>String(v).toLowerCase().includes(term)));
  });
  setTimeout(()=>{
    document.querySelector('#quote-search').oninput=e=>{state.quoteSearch=e.target.value;render()};
    document.querySelector('#quote-status').onchange=e=>{state.quoteStatus=e.target.value;render()};
    document.querySelector('#quote-year').onchange=e=>{state.quoteYear=e.target.value;render()};
    document.querySelector('#quote-owner').onchange=e=>{state.quoteOwner=e.target.value;render()};
    document.querySelectorAll('.open-quote').forEach(b=>b.onclick=()=>{state.quoteDetail=b.dataset.id;render()});
  },0);
  const openCount=rows.filter(x=>!['Aceptada','Perdida'].includes(x.status)).length;
  const openValue=rows.filter(x=>!['Perdida'].includes(x.status)).reduce((sum,x)=>sum+(+x.total||0),0);
  return `<div class="kpi-grid"><div class="card kpi"><div class="label">Cotizaciones visibles</div><div class="value">${rows.length}</div><div class="delta">Según filtros actuales</div></div><div class="card kpi"><div class="label">Abiertas</div><div class="value">${openCount}</div><div class="delta">Por mover comercialmente</div></div><div class="card kpi"><div class="label">Valor visible</div><div class="value">${fmt(openValue)}</div><div class="delta">Sin cotizaciones perdidas</div></div><div class="card kpi"><div class="label">Conversión demo</div><div class="value">${quotes.filter(x=>x.status==='Aceptada').length}</div><div class="delta">Cotizaciones aceptadas</div></div></div>
  <div class="toolbar"><input id="quote-search" class="input" style="min-width:300px" value="${state.quoteSearch}" placeholder="Buscar folio, cliente, proyecto o promotor"><select id="quote-status" class="select">${['Todos','Borrador','Enviada','Pendiente','Aceptada','Perdida'].map(v=>`<option ${v===state.quoteStatus?'selected':''}>${v}</option>`).join('')}</select><select id="quote-year" class="select">${quoteYearOptions().map(v=>`<option ${v===state.quoteYear?'selected':''}>${v}</option>`).join('')}</select><select id="quote-owner" class="select">${quoteOwnerOptions().map(v=>`<option ${v===state.quoteOwner?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th>Rev.</th><th>Responsable</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>${rows.map(x=>{let c=clients.find(c=>c.id===x.clientId);return `<tr><td><strong>${x.id}</strong></td><td>${c?.name||''}</td><td>${x.name}</td><td>${x.date}</td><td>${x.revision}</td><td>${x.owner}</td><td>${chip(x.status,quoteStatusColor(x.status))}</td><td>${fmt(x.total)}</td><td><button class="ghost open-quote" data-id="${x.id}">Abrir</button></td></tr>`}).join('')}</tbody></table></div></div>
  <div class="note" style="margin-top:14px"><strong>Regla Atlas:</strong> una cotización puede tener varias revisiones y seguimientos, pero el proyecto nace únicamente cuando se registra una autorización.</div>`;
}

function quoteDetailView(){
  const row=ensureQuoteMeta(quotes.find(x=>x.id===state.quoteDetail));
  if(!row)return '<div class="card empty"><h3>Cotización no encontrada</h3></div>';
  const q=savedQuoteObject(row),c=clients.find(x=>x.id===row.clientId),t=quoteTotals(q);
  setHead(row.id,'Cotización guardada','');
  setTimeout(()=>{
    document.querySelector('#qd-back').onclick=()=>{state.quoteDetail=null;render()};
    const edit=document.querySelector('#qd-edit');if(edit)edit.onclick=()=>{state.quoteDetail=null;state.quote=q;state.quote.step=2;renderQuote()};
    const rev=document.querySelector('#qd-revision');if(rev)rev.onclick=()=>startQuoteRevision(row);
    document.querySelector('#qd-pdf').onclick=()=>{const old=state.quote;state.quote=q;atlasQuotePdf();state.quote=old};
    const lost=document.querySelector('#qd-lost');if(lost)lost.onclick=()=>{row.status='Perdida';if(row.snapshot)row.snapshot.status='Perdida';render()};
    const follow=document.querySelector('#qd-followup');if(follow)follow.onclick=()=>registerQuoteFollowup(row);
    const accept=document.querySelector('#qd-accept');if(accept)accept.onclick=()=>acceptQuoteDemo(row,q);
    const project=document.querySelector('#qd-project');if(project)project.onclick=()=>{state.quoteDetail=null;state.page='proyectos';state.projectDetailId=row.projectId;render()};
  },0);
  const canOperate=!['Aceptada','Perdida'].includes(row.status);
  const canDirectEdit=row.status==='Borrador';
  const history=[...row.revisions].reverse();
  return `<div class="card panel"><div class="project-header"><div><h2 style="margin:0 0 6px">${row.name}</h2><div class="project-meta">${chip(row.status,quoteStatusColor(row.status))} ${chip(c?.name||'')} ${chip('Rev. '+row.revision)} ${row.projectId?chip('Proyecto '+row.projectId,'green'):''}</div></div><button class="ghost" id="qd-back">← Volver</button></div>
  <div class="metric-strip"><div class="metric-box"><small>Folio</small><strong style="font-size:16px">${row.id}</strong></div><div class="metric-box"><small>Venta antes de IVA</small><strong>${fmt(t.subtotal)}</strong></div><div class="metric-box"><small>Costo base</small><strong>${fmt(t.mc+t.lc+t.ind)}</strong></div><div class="metric-box"><small>Margen referencia</small><strong>${t.subtotal?(((t.subtotal-(t.mc+t.lc+t.ind))/t.subtotal)*100).toFixed(1):'0.0'}%</strong></div></div>
  <div class="toolbar" style="margin-top:18px">${canDirectEdit?'<button class="ghost" id="qd-edit">Editar borrador</button>':canOperate?'<button class="primary" id="qd-revision">+ Nueva revisión</button>':''}<button class="ghost" id="qd-pdf">Descargar PDF</button>${canOperate?'<button class="ghost" id="qd-lost">Marcar perdida</button>':''}${row.projectId?'<button class="primary" id="qd-project">Abrir proyecto →</button>':''}</div>
  <div class="grid-2" style="margin-top:16px"><div class="card panel"><h3>Seguimiento comercial</h3>${canOperate?`<div class="toolbar"><select id="followup-type" class="select"><option>Llamada</option><option>WhatsApp</option><option>Correo</option><option>Reunión</option><option>Envío</option></select><input id="followup-note" class="input" style="min-width:260px" placeholder="¿Qué pasó con el cliente?"><input id="followup-next" class="input" type="date"><button class="primary" id="qd-followup">Registrar</button></div>`:''}<div class="timeline">${row.followups.length?row.followups.map(f=>`<div><strong>${f.date} · ${f.type}</strong><span>${f.note}${f.nextDate?' · Próximo: '+f.nextDate:''}</span></div>`).join(''):'<div><strong>Sin seguimientos</strong><span>Registra el primer contacto después del envío.</span></div>'}</div></div>
  <div class="card panel"><h3>Historial de revisiones</h3><div class="action-list"><div class="action-item"><div><strong>Rev. ${row.revision} · actual</strong><span>${row.status} · ${fmt(row.total)}</span></div>${chip('Actual','blue')}</div>${history.map(h=>`<div class="action-item"><div><strong>Rev. ${h.revision}</strong><span>${h.status} · ${fmt(h.total||0)}</span></div>${chip('Histórica','gray')}</div>`).join('')}</div></div></div>
  ${canOperate?`<div class="note" style="margin-top:18px"><h3 style="margin-top:0">Aceptar cotización y crear proyecto</h3><p class="muted">Al aceptar, Atlas congela esta revisión como línea base del proyecto. Los cambios posteriores ya se comparan contra lo aprobado.</p><div class="toolbar"><select id="accept-type" class="select"><option>Orden de compra</option><option>Anticipo</option><option>Contrato</option><option>Otro</option></select><input id="accept-ref" class="input" placeholder="OC / referencia"><input id="accept-date" class="input" type="date" value="2026-09-28"><button class="primary" id="qd-accept">Aceptar y crear proyecto</button></div></div>`:''}</div>`;
}

function acceptQuoteDemo(row,q){
  const ref=document.querySelector('#accept-ref')?.value.trim();
  if(!ref)return alert('Captura la OC o referencia de autorización.');
  const authorizationType=document.querySelector('#accept-type')?.value||'Orden de compra';
  const acceptedDate=document.querySelector('#accept-date')?.value||'2026-09-28';
  const id=folioConfig.projectTemplate.replace('{00000}',String(folioConfig.nextProject).padStart(5,'0'));
  const pin=String(1000+(folioConfig.nextProject%9000));
  const c=clients.find(x=>x.id===row.clientId),t=quoteTotals(q);
  const baselineCost=t.mc+t.lc+t.ind;
  const baseline={
    quoteId:row.id,
    revision:row.revision||0,
    approvedAt:acceptedDate,
    authorizationType,
    authorizationRef:ref,
    clientId:row.clientId,
    client:c?.name||'',
    name:row.name,
    currency:q.currency,
    scope:q.scope||'',
    materials:cloneDemo(q.materials||[]),
    laborRows:cloneDemo(q.laborRows||[]),
    indirect:cloneDemo(q.indirect||{}),
    truckDays:q.truckDays||0,
    truckDaily:q.truckDaily||0,
    payment:q.payment||'',
    delivery:q.delivery||'',
    validity:q.validity||'',
    costMaterial:t.mc,
    costLabor:t.lc,
    costIndirect:t.ind,
    cost:baselineCost,
    sale:t.subtotal,
    margin:t.subtotal?((t.subtotal-baselineCost)/t.subtotal*100):0
  };
  projects.unshift({id,client:c?.name||'',name:row.name,owner:row.owner,status:'Aprobado',sale:baseline.sale,budget:baseline.cost,real:0,margin:+baseline.margin.toFixed(1),po:ref,alert:'Por surtir',year:2026,pin,sourceQuote:row.id,sourceRevision:row.revision||0,authorizationType,acceptedDate,baseline});
  folioConfig.nextProject++;
  row.status='Aceptada';row.projectId=id;row.acceptedDate=acceptedDate;row.authorizationType=authorizationType;row.authorizationRef=ref;
  if(row.snapshot)row.snapshot.status='Aceptada';
  row.followups.unshift({type:'Aceptación',note:`${authorizationType}: ${ref}. Se creó el proyecto ${id}.`,nextDate:'',date:'28 sep 2026',owner:'Usuario actual'});
  state.quoteDetail=null;state.page='proyectos';state.projectDetailId=id;render();
}

const baseProyectos=proyectos;
proyectos=function(){if(state.projectDetailId)return projectDetailView(projects.find(p=>p.id===state.projectDetailId));let html=baseProyectos();setTimeout(()=>{document.querySelectorAll('#content tbody tr').forEach((tr,i)=>{tr.style.cursor='pointer';tr.onclick=()=>{let visible=projects.filter(p=>(state.projectYear==='Todos'||String(p.year)===state.projectYear)&&(!state.projectSearch||[p.id,p.client,p.name,p.owner,p.po].some(v=>String(v).toLowerCase().includes(state.projectSearch.toLowerCase()))));if(visible[i]){state.projectDetailId=visible[i].id;render()}}})},0);return html}
function projectDetailView(p){
  if(!p)return '<div class="card empty"><h3>Proyecto no encontrado</h3></div>';
  setHead(p.id,'Proyecto','');
  setTimeout(()=>{document.querySelector('#pd-back').onclick=()=>{state.projectDetailId=null;render()};document.querySelector('#pd-print').onclick=()=>atlasProjectPdf(p);const q=document.querySelector('#pd-source');if(q)q.onclick=()=>{state.projectDetailId=null;state.page='cotizaciones';state.quoteDetail=p.sourceQuote;render()}},0);
  const b=p.baseline||null;
  return `<div class="card panel"><div class="project-header"><div><h2 style="margin:0 0 6px">${p.name}</h2><div class="project-meta">${chip(p.status,'green')} ${chip(p.client,'blue')} ${chip(p.owner)} ${chip(p.po)} ${p.sourceRevision!=null?chip('Rev. '+p.sourceRevision,'gray'):''}</div></div><button class="ghost" id="pd-back">← Volver</button></div>
  <div class="metric-strip"><div class="metric-box"><small>Proyecto</small><strong>${p.id}</strong></div><div class="metric-box"><small>Venta aprobada</small><strong>${fmt(b?.sale||p.sale)}</strong></div><div class="metric-box"><small>Costo línea base</small><strong>${fmt(b?.cost||p.budget)}</strong></div><div class="metric-box"><small>Margen aprobado</small><strong>${(b?.margin??p.margin).toFixed(1)}%</strong></div></div>
  ${b?`<div class="grid-2" style="margin-top:16px"><div class="card panel"><h3>Línea base aprobada</h3><div class="action-list"><div class="action-item"><div><strong>Materiales</strong><span>${b.materials.length} partidas congeladas</span></div><strong>${fmt(b.costMaterial)}</strong></div><div class="action-item"><div><strong>Mano de obra</strong><span>${b.laborRows.length} registros presupuestados</span></div><strong>${fmt(b.costLabor)}</strong></div><div class="action-item"><div><strong>Indirectos</strong><span>Base aprobada para comparación</span></div><strong>${fmt(b.costIndirect)}</strong></div></div></div><div class="card panel"><h3>Autorización</h3><div class="action-list"><div class="action-item"><div><strong>${b.authorizationType}</strong><span>${b.authorizationRef}</span></div>${chip('Aprobada','green')}</div><div class="action-item"><div><strong>Fecha</strong><span>${b.approvedAt}</span></div>${chip('Origen '+b.quoteId,'blue')}</div></div></div></div>`:''}
  <div class="note" style="margin-top:16px"><strong>Regla Atlas:</strong> la línea base ya no cambia. Material, mano de obra y costos reales del proyecto se compararán contra esta revisión aprobada.</div>
  <div class="toolbar" style="margin-top:16px">${p.sourceQuote?'<button class="ghost" id="pd-source">Ver cotización origen</button>':''}<button class="primary" id="pd-print">Imprimir proyecto / hoja de surtido</button></div></div>`;
}

function atlasProjectPdf(p){const {jsPDF}=window.jspdf,doc=new jsPDF();doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,18);doc.setFontSize(13);doc.text('Proyecto '+p.id,14,30);doc.setFontSize(11);doc.text('Cliente: '+p.client,14,42);doc.text('Proyecto: '+p.name,14,50);doc.text('OC / referencia: '+p.po,14,58);doc.setFontSize(18);doc.text('PIN: '+(p.pin||'5837'),14,73);doc.setFontSize(10);doc.text('Documento interno para operación y surtido de materiales.',14,84);doc.save('Proyecto-'+p.id+'.pdf')}

atlasQuotePdf=function(){const q=state.quote;if(!q)return;const {jsPDF}=window.jspdf,doc=new jsPDF(),c=clients.find(x=>x.id===q.clientId),t=quoteTotals(q);doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,16);doc.setFontSize(11);doc.text('Cotización '+q.id+' · Rev. '+q.revision,14,25);doc.text('Cliente: '+(c?.name||''),14,34);doc.text('Contacto: '+(q.directedTo||c?.contact||''),14,41);doc.text('Proyecto: '+(q.name||''),14,48);let y=58;if(q.scope){doc.setFontSize(10);doc.text('Alcance: '+q.scope,14,y,{maxWidth:180});y+=18}doc.setFontSize(13);doc.text('Materiales',14,y);y+=5;if(q.materialPresentation==='summary'){doc.autoTable({startY:y,head:[['Descripción','Importe']],body:[['PRODUCTOS Y MATERIALES',fmt(t.ms)]],theme:'striped'});}else{doc.autoTable({startY:y,head:[['Descripción','Cant.','P. Unitario','Importe']],body:q.materials.map(x=>[x.model+' · '+x.desc,x.qty,fmt(materialPrice(x)),fmt(x.qty*materialPrice(x))]),theme:'striped'});}y=doc.lastAutoTable.finalY+12;if(q.laborRows.length){doc.setFontSize(13);doc.text('Mano de obra',14,y);let groups=groupedLabor(q);doc.autoTable({startY:y+5,head:[['Actividad','Importe']],body:groups.map(g=>[g.activity,fmt(g.items.reduce((s,x)=>s+laborRowCost(x)*(1+x.markup/100),0))]),theme:'striped'});y=doc.lastAutoTable.finalY+12}doc.autoTable({startY:y,body:[['Subtotal',fmt(t.subtotal)],['IVA '+q.ivaRate+'%',fmt(t.iva)],['TOTAL',fmt(t.total)]],theme:'plain',styles:{fontStyle:'bold'},columnStyles:{0:{halign:'right'},1:{halign:'right'}}});doc.setFontSize(9);doc.text('Condiciones de pago: '+q.payment+' · Entrega: '+q.delivery+' · Vigencia: '+q.validity,14,doc.lastAutoTable.finalY+12,{maxWidth:180});doc.save('Cotizacion-'+q.id+'.pdf')}

// Buscar también en inventario sin recargar manualmente.
const baseInventario=inventario;
inventario=function(){let html=baseInventario();setTimeout(()=>{const inp=document.querySelector('#content .toolbar input');if(inp)inp.oninput=e=>{let term=e.target.value.toLowerCase();document.querySelectorAll('#content tbody tr').forEach(r=>r.style.display=!term||r.innerText.toLowerCase().includes(term)?'':'none')}},0);return html}

// Limpieza de estados al navegar.
const baseNav=nav;
nav=function(){baseNav();document.querySelectorAll('.nav-btn').forEach(b=>{const old=b.onclick;b.onclick=()=>{state.quoteDetail=null;state.projectDetailId=null;state.laborBuilder=null;old&&old()}})}
render();

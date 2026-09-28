/* Atlas Integrador — revisión R5: UX, paginación, dashboards por rol y exportación */

/* ---------- Estado / utilidades compartidas ---------- */
state.quotePage=state.quotePage||1;
state.projectPage=state.projectPage||1;
state.quoteClientSearch=state.quoteClientSearch||'';
state.quoteClientPage=state.quoteClientPage||1;
state.invPage=state.invPage||1;
state.invShowAll=state.invShowAll||false;
state.invExportOpen=state.invExportOpen||false;
state.laborPage=state.laborPage||1;
state.clientAdminPage=state.clientAdminPage||1;
state.purchasePage=state.purchasePage||1;
state.warehouseHistoryPage=state.warehouseHistoryPage||1;
state.demoEngineer=state.demoEngineer||'Ing. Ramiro';

const ATLAS_PAGE_SIZE=10;
function atlasPageData(rows,page,size=ATLAS_PAGE_SIZE){
  const total=rows.length,pages=Math.max(1,Math.ceil(total/size)),p=Math.min(Math.max(1,+page||1),pages);
  return {rows:rows.slice((p-1)*size,p*size),page:p,pages,total,start:total?(p-1)*size+1:0,end:Math.min(p*size,total)};
}
function atlasPagination(meta,key){
  if(meta.total<=ATLAS_PAGE_SIZE)return '<div class="atlas-list-meta">Mostrando '+meta.start+'–'+meta.end+' de '+meta.total+'</div>';
  let buttons='';
  for(let i=1;i<=meta.pages;i++)buttons+='<button class="'+(i===meta.page?'primary':'ghost')+' atlas-page-btn" data-page="'+i+'" data-key="'+key+'">'+i+'</button>';
  return '<div class="atlas-pagination"><span>Mostrando '+meta.start+'–'+meta.end+' de '+meta.total+'</span><div>'+buttons+(meta.page<meta.pages?'<button class="ghost atlas-page-btn" data-page="'+(meta.page+1)+'" data-key="'+key+'">Siguiente →</button>':'')+'</div></div>';
}
function atlasBindPagination(){
  document.querySelectorAll('.atlas-page-btn').forEach(function(b){
    b.onclick=function(){
      const key=b.dataset.key,page=+b.dataset.page;
      const map={quotes:'quotePage',projects:'projectPage',quoteClients:'quoteClientPage',inventory:'invPage',labor:'laborPage',clients:'clientAdminPage',purchases:'purchasePage',warehouse:'warehouseHistoryPage'};
      if(map[key])state[map[key]]=page;
      if(key==='quoteClients')renderQuote();else render();
    };
  });
}

/* ---------- Navegación: Clientes sale del menú operativo ---------- */
const atlasClientNavIndex=navItems.findIndex(function(x){return x[0]==='clientes'});
if(atlasClientNavIndex>=0)navItems.splice(atlasClientNavIndex,1);
if(state.page==='clientes')state.page='cotizaciones';

function atlasAllowedPages(role){
  if(role==='Dirección')return ['inicio','dashboard','cotizaciones','proyectos','inventario','compras','mano','almacen','reportes','config'];
  if(role==='Ingeniería')return ['inicio','dashboard','cotizaciones','proyectos','inventario','mano','reportes'];
  if(role==='Comercial')return ['inicio','dashboard','cotizaciones','proyectos','reportes'];
  if(role==='Compras')return ['inicio','dashboard','proyectos','inventario','compras','almacen','reportes'];
  if(role==='Almacén')return ['inicio','dashboard','inventario','almacen'];
  return ['inicio','dashboard'];
}
const atlasNavR5Base=nav;
nav=function(){
  atlasNavR5Base();
  const allowed=atlasAllowedPages(state.role);
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.style.display=allowed.includes(b.dataset.page)?'block':'none';
    b.title=b.querySelector('span')?b.querySelector('span').textContent:'';
  });
  if(!allowed.includes(state.page)){state.page='dashboard'}
};

/* Demo de rol para comprobar Dashboard personalizado */
function atlasBindRoleSwitcher(){
  const b=document.querySelector('#role-btn');if(!b)return;
  b.textContent='Rol: '+state.role;
  b.onclick=function(){
    const roles=['Dirección','Ingeniería','Comercial','Compras','Almacén'];
    const i=roles.indexOf(state.role);state.role=roles[(i+1)%roles.length];
    if(state.role==='Ingeniería')state.demoEngineer='Ing. Ramiro';
    state.page='dashboard';state.quote=null;state.quoteDetail=null;state.projectDetailId=null;render();
  };
}

/* ---------- Sidebar expandible / minimizable ---------- */
function atlasSidebarStored(){
  try{return localStorage.getItem('atlasSidebarCollapsed')==='1'}catch(e){return false}
}
function atlasSetSidebar(collapsed){
  const shell=document.querySelector('.app-shell'),btn=document.querySelector('#sidebar-toggle');
  if(!shell)return;
  shell.classList.toggle('sidebar-collapsed',!!collapsed);
  if(btn){btn.textContent=collapsed?'›':'‹';btn.title=collapsed?'Mostrar menú':'Minimizar menú'}
  try{localStorage.setItem('atlasSidebarCollapsed',collapsed?'1':'0')}catch(e){}
}
function atlasInitSidebar(){
  const btn=document.querySelector('#sidebar-toggle');if(!btn)return;
  if(!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=function(){atlasSetSidebar(!document.querySelector('.app-shell').classList.contains('sidebar-collapsed'))}}
  atlasSetSidebar(atlasSidebarStored());
}

/* ---------- Nueva cotización: buscador + 10 clientes por página ---------- */
function atlasQuoteClientPicker(){
  const q=state.quote;if(!q||q.step!==1)return;
  const term=String(state.quoteClientSearch||'').trim().toLowerCase();
  const rows=clients.filter(function(c){
    return c.active!==false&&(!term||[c.name,c.tradeName,c.legalName,c.rfc,c.contact].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.quoteClientPage);
  state.quoteClientPage=meta.page;
  const body=document.querySelector('#qbody');if(!body)return;
  body.innerHTML='<div class="project-header"><div><h3 style="margin-bottom:5px">Selecciona el cliente</h3><p class="muted" style="margin:0">Busca por nombre comercial, razón social, RFC o contacto.</p></div></div>'
   +'<div class="toolbar"><input id="quote-client-search" class="input" style="min-width:380px" placeholder="Buscar cliente, RFC o contacto" value="'+state.quoteClientSearch+'"></div>'
   +'<div class="action-list">'+(meta.rows.length?meta.rows.map(function(x){return '<div class="action-item"><div><strong>'+x.name+'</strong><span>'+x.rfc+' · '+x.contact+'</span></div><button class="primary pick-client-r5" data-id="'+x.id+'">Seleccionar</button></div>'}).join(''):'<div class="empty">No encontré clientes activos con esa búsqueda.</div>')+'</div>'
   +atlasPagination(meta,'quoteClients');
  const next=document.querySelector('#qnext');if(next)next.style.display='none';
  const s=document.querySelector('#quote-client-search');if(s)s.oninput=function(e){state.quoteClientSearch=e.target.value;state.quoteClientPage=1;renderQuote()};
  document.querySelectorAll('.pick-client-r5').forEach(function(b){b.onclick=function(){q.clientId=+b.dataset.id;q.step=2;state.quoteClientSearch='';state.quoteClientPage=1;renderQuote()}});
  atlasBindPagination();
}
const atlasRenderQuoteR5Base=renderQuote;
renderQuote=function(){
  atlasRenderQuoteR5Base();
  if(state.quote&&state.quote.step===1)atlasQuoteClientPicker();
};

/* ---------- Cotizaciones: 10 por página ---------- */
cotizaciones=function(){
  if(state.quote){renderQuote();return ''}
  if(state.quoteDetail)return quoteDetailView();
  setHead('Cotizaciones','Comercial','Nueva cotización');
  document.querySelector('#primary-action').onclick=function(){newQuote()};
  const term=String(state.quoteSearch||'').toLowerCase();
  let rows=quotes.filter(function(x){
    ensureQuoteMeta(x);const c=clients.find(function(c){return c.id===x.clientId});
    const roleOk=state.role!=='Ingeniería'||x.owner===state.demoEngineer;
    return roleOk&&(state.quoteStatus==='Todos'||x.status===state.quoteStatus)
      &&(state.quoteYear==='Todos'||x.year===state.quoteYear)
      &&(state.quoteOwner==='Todos'||x.owner===state.quoteOwner)
      &&(!term||[x.id,x.name,c&&c.name,x.owner].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.quotePage);state.quotePage=meta.page;
  const open=rows.filter(function(x){return !['Aceptada','Perdida'].includes(x.status)}),openValue=rows.filter(function(x){return x.status!=='Perdida'}).reduce(function(s,x){return s+(+x.total||0)},0);
  setTimeout(function(){
    const qs=document.querySelector('#quote-search');if(qs)qs.oninput=function(e){state.quoteSearch=e.target.value;state.quotePage=1;render()};
    const st=document.querySelector('#quote-status');if(st)st.onchange=function(e){state.quoteStatus=e.target.value;state.quotePage=1;render()};
    const yr=document.querySelector('#quote-year');if(yr)yr.onchange=function(e){state.quoteYear=e.target.value;state.quotePage=1;render()};
    const ow=document.querySelector('#quote-owner');if(ow)ow.onchange=function(e){state.quoteOwner=e.target.value;state.quotePage=1;render()};
    document.querySelectorAll('.open-quote').forEach(function(b){b.onclick=function(){state.quoteDetail=b.dataset.id;render()}});
    atlasBindPagination();
  },0);
  return '<div class="kpi-grid"><div class="card kpi"><div class="label">Cotizaciones visibles</div><div class="value">'+rows.length+'</div><div class="delta">Según filtros actuales</div></div><div class="card kpi"><div class="label">Abiertas</div><div class="value">'+open.length+'</div><div class="delta">Por mover comercialmente</div></div><div class="card kpi"><div class="label">Valor visible</div><div class="value">'+fmt(openValue)+'</div><div class="delta">Sin cotizaciones perdidas</div></div><div class="card kpi"><div class="label">Aceptadas</div><div class="value">'+quotes.filter(function(x){return x.status==='Aceptada'}).length+'</div><div class="delta">Conversión registrada</div></div></div>'
   +'<div class="toolbar"><input id="quote-search" class="input" style="min-width:300px" value="'+state.quoteSearch+'" placeholder="Buscar folio, cliente, proyecto o promotor"><select id="quote-status" class="select">'+['Todos','Borrador','Enviada','Pendiente','Aceptada','Perdida'].map(function(v){return '<option '+(v===state.quoteStatus?'selected':'')+'>'+v+'</option>'}).join('')+'</select><select id="quote-year" class="select">'+quoteYearOptions().map(function(v){return '<option '+(v===state.quoteYear?'selected':'')+'>'+v+'</option>'}).join('')+'</select><select id="quote-owner" class="select">'+quoteOwnerOptions().map(function(v){return '<option '+(v===state.quoteOwner?'selected':'')+'>'+v+'</option>'}).join('')+'</select></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th>Rev.</th><th>Responsable</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>'+meta.rows.map(function(x){const c=clients.find(function(c){return c.id===x.clientId});return '<tr><td><strong>'+x.id+'</strong></td><td>'+(c?c.name:'')+'</td><td>'+x.name+'</td><td>'+x.date+'</td><td>'+x.revision+'</td><td>'+x.owner+'</td><td>'+chip(x.status,quoteStatusColor(x.status))+'</td><td>'+fmt(x.total)+'</td><td><button class="ghost open-quote" data-id="'+x.id+'">Abrir</button></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'quotes')+'</div>'
   +'<div class="note" style="margin-top:14px"><strong>Regla Atlas:</strong> una cotización puede tener varias revisiones y seguimientos, pero el proyecto nace únicamente cuando se registra una autorización.</div>';
};

/* ---------- Proyectos: paginación y privacidad de ingeniero ---------- */
proyectos=function(){
  if(state.projectDetailId)return projectDetailView(projects.find(function(p){return p.id===state.projectDetailId}));
  setHead('Proyectos','Operación','');
  const term=String(state.projectSearch||'').toLowerCase();
  let rows=projects.filter(function(p){
    const roleOk=state.role!=='Ingeniería'||p.owner===state.demoEngineer;
    return roleOk&&(state.projectYear==='Todos'||String(p.year)===state.projectYear)&&(!term||[p.id,p.client,p.name,p.owner,p.po].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.projectPage);state.projectPage=meta.page;
  setTimeout(function(){
    const s=document.querySelector('#ps');if(s)s.oninput=function(e){state.projectSearch=e.target.value;state.projectPage=1;render()};
    const y=document.querySelector('#py');if(y)y.onchange=function(e){state.projectYear=e.target.value;state.projectPage=1;render()};
    document.querySelectorAll('.project-open-r5').forEach(function(tr){tr.onclick=function(){state.projectDetailId=tr.dataset.id;render()}});
    atlasBindPagination();
  },0);
  return '<div class="toolbar"><input id="ps" class="input" value="'+state.projectSearch+'" placeholder="Buscar proyecto, cliente, promotor u OC"><select id="py" class="select"><option '+(state.projectYear==='2026'?'selected':'')+'>2026</option><option '+(state.projectYear==='2025'?'selected':'')+'>2025</option><option '+(state.projectYear==='Todos'?'selected':'')+'>Todos</option></select></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Promotor</th><th>Estado</th><th>OC</th><th>Venta</th><th>Margen aprobado</th></tr></thead><tbody>'+meta.rows.map(function(p){return '<tr class="project-open-r5" data-id="'+p.id+'" style="cursor:pointer"><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.client+'</td><td>'+p.owner+'</td><td>'+chip(p.status,'green')+'</td><td>'+p.po+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin+'%</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'projects')+'</div>';
};

/* ---------- Inventario: bajo demanda + paginación + XLSX ---------- */
function atlasInventoryExport(){
  if(typeof XLSX==='undefined'){alert('No se pudo cargar el generador de Excel.');return}
  const type=document.querySelector('#inv-export-type')?.value||'full';
  const location=document.querySelector('#inv-export-location')?.value||'Todos';
  const category=document.querySelector('#inv-export-category')?.value||'Todos';
  const blind=!!document.querySelector('#inv-export-blind')?.checked;
  let rows=inventory.filter(function(i){return i.active!==false});
  if(type==='cycle'&&location!=='Todos')rows=rows.filter(function(i){return i.loc===location});
  if(type==='cycle'&&category!=='Todos')rows=rows.filter(function(i){return i.category===category});
  const data=rows.map(function(i){return{
    Modelo:i.model,Marca:i.brand,Descripción:i.desc,Categoría:i.category,Ubicación:i.loc,
    'Unidad SAT':i.satUnit,'Clave SAT':i.satCode,'Existencia sistema':blind?'':i.stock,
    Mínimo:i.min,Máximo:i.max,'Conteo físico':'',Diferencia:'',Observaciones:''
  }});
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,type==='cycle'?'Conteo cíclico':'Inventario');
  XLSX.writeFile(wb,'Atlas-Inventario-'+(type==='cycle'?'Ciclico':'Completo')+'.xlsx');
}
const atlasInventoryR5Base=inventario;
inventario=function(){
  const html=atlasInventoryR5Base();
  setTimeout(function(){
    const q=document.querySelector('#inv-search');if(!q)return;
    const toolbar=q.parentElement;
    if(toolbar&&!document.querySelector('#inv-show-all')){
      const show=document.createElement('button');show.id='inv-show-all';show.className='ghost';show.textContent=state.invShowAll?'Ocultar catálogo':'Ver catálogo completo';
      show.onclick=function(){state.invShowAll=!state.invShowAll;state.invPage=1;render()};toolbar.appendChild(show);
      const exp=document.createElement('button');exp.id='inv-export-toggle';exp.className='secondary';exp.textContent='Exportar inventario';exp.onclick=function(){state.invExportOpen=!state.invExportOpen;render()};toolbar.appendChild(exp);
    }
    q.oninput=function(e){state.invSearch=e.target.value;state.invShowAll=false;state.invPage=1;render()};
    const wrap=document.querySelector('#content .table-wrap'),heading=wrap&&wrap.previousElementSibling;
    const shouldShow=state.invShowAll||String(state.invSearch||'').trim().length>=2;
    if(wrap){
      if(!shouldShow){wrap.style.display='none';if(heading&&heading.tagName==='H3')heading.style.display='none'}
      else{
        const rows=[...wrap.querySelectorAll('tbody tr')],meta=atlasPageData(rows,state.invPage);
        state.invPage=meta.page;
        rows.forEach(function(r,i){r.style.display=(i>=(meta.page-1)*ATLAS_PAGE_SIZE&&i<meta.page*ATLAS_PAGE_SIZE)?'':'none'});
        let pg=document.querySelector('#inv-pagination');if(!pg){pg=document.createElement('div');pg.id='inv-pagination';wrap.insertAdjacentElement('afterend',pg)}
        pg.innerHTML=atlasPagination({page:meta.page,pages:meta.pages,total:rows.length,start:rows.length?(meta.page-1)*ATLAS_PAGE_SIZE+1:0,end:Math.min(meta.page*ATLAS_PAGE_SIZE,rows.length)},'inventory');
        atlasBindPagination();
      }
    }
    let hint=document.querySelector('#inv-search-hint');
    if(!hint){hint=document.createElement('div');hint.id='inv-search-hint';hint.className='muted';toolbar.insertAdjacentElement('afterend',hint)}
    hint.textContent=shouldShow?'':'Escribe al menos 2 caracteres para mostrar coincidencias, o usa “Ver catálogo completo”.';
    if(state.invExportOpen&&!document.querySelector('#inv-export-panel')){
      const panel=document.createElement('div');panel.id='inv-export-panel';panel.className='note atlas-export-panel';
      panel.innerHTML='<strong>Exportar inventario a Excel</strong><div class="toolbar" style="margin-top:10px"><select id="inv-export-type" class="select"><option value="full">Inventario completo</option><option value="cycle">Conteo cíclico</option></select><select id="inv-export-location" class="select"><option>Todos</option>'+atlasActiveValues(atlasLocations,atlasInactiveLocations).map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><select id="inv-export-category" class="select"><option>Todos</option>'+atlasActiveValues(atlasCategories,atlasInactiveCategories).map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><label class="atlas-check"><input id="inv-export-blind" type="checkbox"> Conteo ciego (ocultar existencia)</label><button id="inv-export-download" class="primary">Descargar Excel</button></div><span class="muted">Incluye columnas para conteo físico, diferencia y observaciones.</span>';
      toolbar.parentElement.insertBefore(panel,toolbar.nextSibling);
      document.querySelector('#inv-export-download').onclick=atlasInventoryExport;
    }
  },0);
  return html;
};

/* ---------- Mano de obra real: paginación ---------- */
const atlasLaborR5Base=mano;
mano=function(){
  let html=atlasLaborR5Base();
  setTimeout(function(){
    const table=document.querySelector('#content .table-wrap table');if(!table)return;
    const rows=[...table.querySelectorAll('tbody tr')],meta=atlasPageData(rows,state.laborPage);state.laborPage=meta.page;
    rows.forEach(function(r,i){r.style.display=(i>=(meta.page-1)*ATLAS_PAGE_SIZE&&i<meta.page*ATLAS_PAGE_SIZE)?'':'none'});
    let pg=document.querySelector('#labor-pagination');if(!pg){pg=document.createElement('div');pg.id='labor-pagination';table.closest('.table-wrap').insertAdjacentElement('afterend',pg)}
    pg.innerHTML=atlasPagination({page:meta.page,pages:meta.pages,total:rows.length,start:rows.length?(meta.page-1)*ATLAS_PAGE_SIZE+1:0,end:Math.min(meta.page*ATLAS_PAGE_SIZE,rows.length)},'labor');atlasBindPagination();
  },0);
  return html;
};

/* ---------- Compras: lista paginada desde OC de demo ---------- */
compras=function(){
  setHead('Compras','Abastecimiento','Nueva OC');
  const meta=atlasPageData(atlasPurchaseOrders,state.purchasePage);state.purchasePage=meta.page;
  setTimeout(atlasBindPagination,0);
  return '<div class="card panel"><h3>Órdenes de compra / recepciones</h3><div class="table-wrap"><table class="table"><thead><tr><th>OC compra</th><th>Proyecto</th><th>Proveedor</th><th>Partidas</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>'+meta.rows.map(function(po){const total=po.lines.reduce(function(s,x){return s+x.qty},0),received=po.lines.reduce(function(s,x){return s+x.received},0);return '<tr><td><strong>#'+po.id+'</strong></td><td>'+po.projectId+'</td><td>'+po.supplier+'</td><td>'+po.lines.length+'</td><td>'+received+' / '+total+'</td><td>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Completa'?'green':atlasPoStatus(po)==='Parcial'?'orange':'blue')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'purchases')+'</div>';
};

/* ---------- Configuración: selects visibles + paginación de clientes ---------- */
atlasCatalogCard=function(type,title,list,inactive,prefix){
  const active=atlasActiveValues(list,inactive),editing=state.catalogEditType===type;
  let h='<div class="card panel atlas-catalog-card"><div class="project-header"><div><h3>'+title+'</h3><p class="muted">'+active.length+' activos · '+inactive.length+' inactivos</p></div></div>'
    +'<div class="toolbar"><input id="'+prefix+'-new" class="input" placeholder="Nuevo registro"><button id="'+prefix+'-add" class="primary">Agregar</button></div>'
    +'<label>Seleccionar existente</label><select id="'+prefix+'-select" class="select" style="width:100%;margin-top:6px"><option value="">— Selecciona —</option>'+active.map(function(x){return '<option value="'+x+'">'+x+'</option>'}).join('')+'</select>'
    +'<div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit" class="ghost">Editar</button><button id="'+prefix+'-disable" class="ghost">Desactivar</button></div>';
  if(editing)h+='<div class="note"><label>Nuevo nombre</label><input id="'+prefix+'-edit-value" class="input" style="width:100%;margin-top:6px" value="'+state.catalogEditValue+'"><div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit-save" class="primary">Guardar nombre</button><button id="'+prefix+'-edit-cancel" class="ghost">Cancelar</button></div></div>';
  if(inactive.length)h+='<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Inactivos ('+inactive.length+')</summary><div class="toolbar" style="margin-top:10px"><select id="'+prefix+'-inactive" class="select">'+inactive.map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><button id="'+prefix+'-reactivate" class="ghost">Reactivar</button></div></details>';
  return h+'</div>';
};

const atlasConfigClientsR5Base=atlasConfigClients;
atlasConfigClients=function(){
  const edit=state.clientAdminId==='new'?null:clients.find(function(c){return c.id===+state.clientAdminId});
  const form=edit||{legalName:'',tradeName:'',rfc:'',contact:'',phone:'',email:'',address:'',active:true};
  const term=String(state.clientAdminSearch||'').toLowerCase();
  const rows=clients.filter(function(c){return !term||[c.legalName,c.tradeName,c.name,c.rfc,c.contact,c.email].some(function(v){return String(v||'').toLowerCase().includes(term)})});
  const meta=atlasPageData(rows,state.clientAdminPage);state.clientAdminPage=meta.page;
  let h='<div class="card panel"><div class="project-header"><div><h3>Clientes</h3><p class="muted">Catálogo maestro. Solo usuarios con permiso de Configuración pueden crear o modificar clientes.</p></div><button class="primary" id="client-admin-new">+ Nuevo cliente</button></div><div class="toolbar"><input id="client-admin-search" class="input" style="min-width:320px" placeholder="Buscar razón social, nombre, RFC o contacto" value="'+state.clientAdminSearch+'"></div>';
  if(state.clientAdminId){
    h+='<div class="note atlas-admin-form"><strong>'+(state.clientAdminId==='new'?'Alta de cliente':'Editar cliente')+'</strong><div class="grid-2" style="margin-top:12px"><div><label>Razón social</label><input id="ca-legal" class="input" style="width:100%" value="'+form.legalName+'"></div><div><label>Nombre comercial</label><input id="ca-trade" class="input" style="width:100%" value="'+form.tradeName+'"></div><div><label>RFC</label><input id="ca-rfc" class="input" style="width:100%" value="'+form.rfc+'"></div><div><label>Contacto principal</label><input id="ca-contact" class="input" style="width:100%" value="'+form.contact+'"></div><div><label>Teléfono</label><input id="ca-phone" class="input" style="width:100%" value="'+form.phone+'"></div><div><label>Correo</label><input id="ca-email" class="input" type="email" style="width:100%" value="'+form.email+'"></div><div style="grid-column:1/-1"><label>Dirección</label><input id="ca-address" class="input" style="width:100%" value="'+form.address+'"></div></div><div class="toolbar" style="margin-top:12px"><button id="client-admin-save" class="primary">Guardar cliente</button><button id="client-admin-cancel" class="ghost">Cancelar</button></div></div>';
  }
  if(state.clientAdminMessage)h+='<div class="note" style="margin:12px 0"><strong>'+state.clientAdminMessage+'</strong></div>';
  h+='<div class="table-wrap"><table class="table"><thead><tr><th>Razón social / Cliente</th><th>RFC</th><th>Contacto</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>'+meta.rows.map(function(c){return '<tr style="'+(c.active===false?'opacity:.58':'')+'"><td><strong>'+c.legalName+'</strong><br><span class="muted">'+c.tradeName+'</span></td><td>'+c.rfc+'</td><td>'+c.contact+'</td><td>'+c.email+'</td><td>'+chip(c.active===false?'Inactivo':'Activo',c.active===false?'gray':'green')+'</td><td><button class="ghost client-admin-edit" data-id="'+c.id+'">Editar</button> <button class="ghost client-admin-toggle" data-id="'+c.id+'">'+(c.active===false?'Activar':'Desactivar')+'</button></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'clients')+'</div>';
  return h;
};

/* Config binding extra para paginación de clientes */
const atlasConfigR5Base=config;
config=function(){
  const html=atlasConfigR5Base();
  setTimeout(function(){
    const s=document.querySelector('#client-admin-search');if(s)s.oninput=function(e){state.clientAdminSearch=e.target.value;state.clientAdminPage=1;render()};
    atlasBindPagination();
  },0);
  return html;
};

/* ---------- Dashboard Dirección / Ingeniería ---------- */
function atlasProjectCurrentMargin(p){
  const cost=(+p.real>0?+p.real:+p.budget)||0;
  return p.sale?((p.sale-cost)/p.sale*100):0;
}
function atlasDashboardData(owner){
  const ps=owner?projects.filter(function(p){return p.owner===owner}):projects.slice();
  const qs=owner?quotes.filter(function(q){return q.owner===owner}):quotes.slice();
  const sales=ps.reduce(function(s,p){return s+(+p.sale||0)},0);
  const cost=ps.reduce(function(s,p){return s+((+p.real>0?+p.real:+p.budget)||0)},0);
  const profit=sales-cost,margin=sales?profit/sales*100:0;
  const openQs=qs.filter(function(q){return !['Perdida','Aceptada'].includes(q.status)});
  const pipeline=qs.filter(function(q){return q.status!=='Perdida'}).reduce(function(s,q){return s+(+q.total||0)},0);
  const active=ps.filter(function(p){return ['En ejecución','Aprobado'].includes(p.status)}).length;
  const risk=ps.filter(function(p){return atlasProjectCurrentMargin(p)<(+p.margin||0)-2});
  return {ps,qs,sales,cost,profit,margin,openQs,pipeline,active,risk};
}
function atlasDirectionDashboard(){
  const d=atlasDashboardData();
  const pos=atlasPurchaseOrders.filter(function(po){return atlasPoStatus(po)!=='Completa'}).length;
  const critical=inventory.filter(function(i){return i.active!==false&&i.stock<=i.min}).length;
  const engineers=[...new Set(projects.map(function(p){return p.owner}).filter(Boolean))].map(function(name){
    const x=atlasDashboardData(name);return {name,sales:x.sales,profit:x.profit,margin:x.margin,active:x.active,quotes:x.openQs.length,risk:x.risk.length};
  }).sort(function(a,b){return b.sales-a.sales});
  return '<div class="atlas-dashboard-hero"><div><span>VISIÓN 360°</span><h2>Dirección</h2><p>Lectura ejecutiva comercial, operativa y de rentabilidad.</p></div>'+chip('Dirección','blue')+'</div>'
   +'<div class="atlas-kpi-six"><div class="card kpi"><div class="label">Venta aprobada</div><div class="value">'+fmt(d.sales)+'</div><div class="delta">'+d.active+' proyectos activos</div></div><div class="card kpi"><div class="label">Utilidad actual</div><div class="value">'+fmt(d.profit)+'</div><div class="delta">Venta menos costo real/proyectado</div></div><div class="card kpi"><div class="label">Margen actual</div><div class="value">'+d.margin.toFixed(1)+'%</div><div class="delta">'+d.risk.length+' proyectos erosionando margen</div></div><div class="card kpi"><div class="label">Cotizaciones abiertas</div><div class="value">'+d.openQs.length+'</div><div class="delta">'+fmt(d.pipeline)+' visibles</div></div><div class="card kpi"><div class="label">OC por completar</div><div class="value">'+pos+'</div><div class="delta">Pendientes o parciales</div></div><div class="card kpi"><div class="label">Inventario en atención</div><div class="value">'+critical+'</div><div class="delta">En mínimo o crítico</div></div></div>'
   +'<div class="grid-2"><div class="card panel"><h3>Rentabilidad por proyecto</h3><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Responsable</th><th>Venta</th><th>Margen aprobado</th><th>Margen actual</th><th>Desviación</th></tr></thead><tbody>'+d.ps.map(function(p){const cur=atlasProjectCurrentMargin(p),dev=cur-(+p.margin||0),bad=dev<-2;return '<tr><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.owner+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin.toFixed(1)+'%</td><td><strong>'+cur.toFixed(1)+'%</strong></td><td>'+chip((dev>=0?'+':'')+dev.toFixed(1)+' pts',bad?'red':dev<0?'orange':'green')+'</td></tr>'}).join('')+'</tbody></table></div></div>'
   +'<div class="card panel"><h3>Radar de Dirección</h3><div class="action-list"><div class="action-item"><div><strong>Rentabilidad</strong><span>'+d.risk.length+' proyecto(s) debajo del margen aprobado.</span></div>'+chip(d.risk.length?'Revisar':'Sano',d.risk.length?'orange':'green')+'</div><div class="action-item"><div><strong>Abastecimiento</strong><span>'+pos+' OC pendientes o parciales.</span></div>'+chip('Compras','blue')+'</div><div class="action-item"><div><strong>Comercial</strong><span>'+d.openQs.length+' cotizaciones requieren seguimiento.</span></div>'+chip('Pipeline','blue')+'</div><div class="action-item"><div><strong>Inventario</strong><span>'+critical+' artículos en mínimo o crítico.</span></div>'+chip(critical?'Atención':'OK',critical?'red':'green')+'</div></div></div></div>'
   +'<div class="card panel" style="margin-top:16px"><h3>Equipo de proyectos</h3><p class="muted">La vista de Dirección conserva el comparativo del equipo; cada ingeniero verá únicamente su propia cartera.</p><div class="table-wrap"><table class="table"><thead><tr><th>Ingeniero</th><th>Venta</th><th>Utilidad</th><th>Margen actual</th><th>Proyectos activos</th><th>Cotizaciones abiertas</th><th>Alertas margen</th></tr></thead><tbody>'+engineers.map(function(e){return '<tr><td><strong>'+e.name+'</strong></td><td>'+fmt(e.sales)+'</td><td>'+fmt(e.profit)+'</td><td>'+e.margin.toFixed(1)+'%</td><td>'+e.active+'</td><td>'+e.quotes+'</td><td>'+chip(String(e.risk),e.risk?'orange':'green')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
function atlasEngineerDashboard(){
  const owner=state.demoEngineer,d=atlasDashboardData(owner),labor=atlasRealLabor.filter(function(l){const p=projects.find(function(x){return x.id===l.projectId});return p&&p.owner===owner}),laborCost=labor.reduce(function(s,l){return s+atlasLaborCost(l)},0);
  return '<div class="atlas-dashboard-hero"><div><span>MI OPERACIÓN</span><h2>'+owner+'</h2><p>Mis cotizaciones, mis proyectos, mi rentabilidad y pendientes.</p></div>'+chip('Ingeniería','green')+'</div>'
   +'<div class="atlas-kpi-six"><div class="card kpi"><div class="label">Mi venta aprobada</div><div class="value">'+fmt(d.sales)+'</div><div class="delta">'+d.active+' proyectos activos</div></div><div class="card kpi"><div class="label">Mi utilidad actual</div><div class="value">'+fmt(d.profit)+'</div><div class="delta">Sobre mis proyectos</div></div><div class="card kpi"><div class="label">Mi margen actual</div><div class="value">'+d.margin.toFixed(1)+'%</div><div class="delta">Vs línea base aprobada</div></div><div class="card kpi"><div class="label">Mis cotizaciones abiertas</div><div class="value">'+d.openQs.length+'</div><div class="delta">'+fmt(d.pipeline)+' en cartera</div></div><div class="card kpi"><div class="label">MO real registrada</div><div class="value">'+fmt(laborCost)+'</div><div class="delta">'+labor.length+' registros</div></div><div class="card kpi"><div class="label">Alertas de margen</div><div class="value">'+d.risk.length+'</div><div class="delta">Solo mis proyectos</div></div></div>'
   +'<div class="grid-2"><div class="card panel"><h3>Mis proyectos</h3><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Estado</th><th>Venta</th><th>Margen aprobado</th><th>Margen actual</th></tr></thead><tbody>'+d.ps.map(function(p){return '<tr><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.client+'</td><td>'+chip(p.status,'green')+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin.toFixed(1)+'%</td><td>'+atlasProjectCurrentMargin(p).toFixed(1)+'%</td></tr>'}).join('')+'</tbody></table></div></div><div class="card panel"><h3>Lo que requiere mi atención</h3><div class="action-list">'+(d.risk.length?d.risk.map(function(p){return '<div class="action-item"><div><strong>'+p.id+' · '+p.name+'</strong><span>Margen aprobado '+p.margin.toFixed(1)+'% → actual '+atlasProjectCurrentMargin(p).toFixed(1)+'%</span></div>'+chip('Revisar','orange')+'</div>'}).join(''):'<div class="action-item"><div><strong>Rentabilidad</strong><span>No hay alertas de margen en mis proyectos.</span></div>'+chip('OK','green')+'</div>')+(d.openQs.length?'<div class="action-item"><div><strong>Seguimiento comercial</strong><span>'+d.openQs.length+' cotización(es) abiertas.</span></div>'+chip('Pendiente','blue')+'</div>':'')+'</div></div></div>';
}
dashboard=function(){
  setHead('Dashboard',state.role,'');
  if(state.role==='Ingeniería')return atlasEngineerDashboard();
  if(state.role==='Dirección')return atlasDirectionDashboard();
  const d=atlasDashboardData();
  return '<div class="card panel"><h3>Dashboard · '+state.role+'</h3><p class="muted">La versión conectada mostrará únicamente los indicadores y pendientes autorizados para este rol.</p><div class="metric-strip"><div class="metric-box"><small>Proyectos activos</small><strong>'+d.active+'</strong></div><div class="metric-box"><small>Cotizaciones abiertas</small><strong>'+d.openQs.length+'</strong></div><div class="metric-box"><small>Inventario crítico</small><strong>'+inventory.filter(function(i){return i.stock<=i.min}).length+'</strong></div><div class="metric-box"><small>OC pendientes</small><strong>'+atlasPurchaseOrders.filter(function(po){return atlasPoStatus(po)!=='Completa'}).length+'</strong></div></div></div>';
};

/* ---------- Post-render R5 ---------- */
const atlasRenderR5Base=render;
render=function(){
  atlasRenderR5Base();
  setTimeout(function(){atlasBindRoleSwitcher();atlasInitSidebar();atlasBindPagination()},0);
};

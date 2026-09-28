/* Atlas Integrador — revisión R7: proveedores maestros + OC conectada */
state.supplierAdminId=state.supplierAdminId||null;
state.supplierAdminSearch=state.supplierAdminSearch||'';
state.supplierAdminMessage=state.supplierAdminMessage||'';
state.supplierAdminPage=state.supplierAdminPage||1;
state.purchaseMode=state.purchaseMode||'list';
state.purchaseDraft=state.purchaseDraft||null;

const atlasSuppliers=[
  {id:1,name:'SYSCOM',legalName:'SYSCOM México',rfc:'',contact:'',phone:'',email:'',currency:'MXN',paymentTerms:'Según cotización',leadDays:0,active:true},
  {id:2,name:'Panduit',legalName:'Panduit México',rfc:'',contact:'',phone:'',email:'',currency:'MXN',paymentTerms:'Según cotización',leadDays:0,active:true}
];

function atlasSupplierNextId(){return Math.max.apply(null,[0].concat(atlasSuppliers.map(function(s){return s.id})))+1}
function atlasSupplierByName(name){return atlasSuppliers.find(function(s){return atlasNormText(s.name)===atlasNormText(name)})}
function atlasActiveSuppliers(){return atlasSuppliers.filter(function(s){return s.active!==false})}

/* -------- Configuración → Proveedores -------- */
const atlasConfigMenuR7Base=atlasConfigMenu;
atlasConfigMenu=function(){
  const items=[
    ['personal','Personal y mano de obra'],
    ['access','Usuarios, roles y accesos'],
    ['clients','Clientes'],
    ['suppliers','Proveedores'],
    ['folios','Consecutivos'],
    ['catalogs','Inventario y catálogos'],
    ['company','Empresa y documentos']
  ];
  return '<div class="card panel atlas-config-menu" style="padding:10px">'+items.map(function(x){return '<button class="'+(state.configTab===x[0]?'primary':'ghost')+' ctab" data-tab="'+x[0]+'" style="width:100%;text-align:left;margin:4px 0">'+x[1]+'</button>'}).join('')+'</div>';
};

function atlasConfigSuppliers(){
  const edit=state.supplierAdminId==='new'?null:atlasSuppliers.find(function(s){return s.id===+state.supplierAdminId});
  const form=edit||{name:'',legalName:'',rfc:'',contact:'',phone:'',email:'',currency:'MXN',paymentTerms:'',leadDays:0,active:true};
  const term=String(state.supplierAdminSearch||'').toLowerCase();
  const rows=atlasSuppliers.filter(function(s){return !term||[s.name,s.legalName,s.rfc,s.contact,s.email].some(function(v){return String(v||'').toLowerCase().includes(term)})});
  const meta=atlasPageData(rows,state.supplierAdminPage);state.supplierAdminPage=meta.page;
  let h='<div class="card panel"><div class="project-header"><div><h3>Proveedores</h3><p class="muted">Catálogo maestro utilizado por Compras al crear órdenes de compra.</p></div><button class="primary" id="supplier-new">+ Nuevo proveedor</button></div>';
  h+='<div class="toolbar"><input id="supplier-search" class="input" style="min-width:320px" placeholder="Buscar proveedor, RFC o contacto" value="'+state.supplierAdminSearch+'"></div>';
  if(state.supplierAdminId){
    h+='<div class="note atlas-admin-form"><strong>'+(state.supplierAdminId==='new'?'Alta de proveedor':'Editar proveedor')+'</strong><div class="grid-2" style="margin-top:12px">';
    h+='<div><label>Nombre comercial</label><input id="sup-name" class="input" style="width:100%" value="'+form.name+'"></div>';
    h+='<div><label>Razón social</label><input id="sup-legal" class="input" style="width:100%" value="'+form.legalName+'"></div>';
    h+='<div><label>RFC</label><input id="sup-rfc" class="input" style="width:100%" value="'+form.rfc+'"></div>';
    h+='<div><label>Contacto principal</label><input id="sup-contact" class="input" style="width:100%" value="'+form.contact+'"></div>';
    h+='<div><label>Teléfono</label><input id="sup-phone" class="input" style="width:100%" value="'+form.phone+'"></div>';
    h+='<div><label>Correo</label><input id="sup-email" class="input" type="email" style="width:100%" value="'+form.email+'"></div>';
    h+='<div><label>Moneda habitual</label><select id="sup-currency" class="select" style="width:100%">'+atlasOpt('MXN',form.currency)+atlasOpt('USD',form.currency)+'</select></div>';
    h+='<div><label>Días estimados de entrega</label><input id="sup-lead" class="input" type="number" min="0" style="width:100%" value="'+form.leadDays+'"></div>';
    h+='<div style="grid-column:1/-1"><label>Condiciones de pago</label><input id="sup-terms" class="input" style="width:100%" value="'+form.paymentTerms+'" placeholder="Ej. Crédito 30 días / Contado"></div></div>';
    h+='<div class="toolbar" style="margin-top:12px"><button id="supplier-save" class="primary">Guardar proveedor</button><button id="supplier-cancel" class="ghost">Cancelar</button></div></div>';
  }
  if(state.supplierAdminMessage)h+='<div class="note" style="margin:12px 0"><strong>'+state.supplierAdminMessage+'</strong></div>';
  h+='<div class="table-wrap"><table class="table"><thead><tr><th>Proveedor</th><th>RFC</th><th>Contacto</th><th>Moneda</th><th>Entrega</th><th>Estado</th><th></th></tr></thead><tbody>';
  h+=meta.rows.map(function(s){return '<tr style="'+(s.active===false?'opacity:.58':'')+'"><td><strong>'+s.name+'</strong><br><span class="muted">'+s.legalName+'</span></td><td>'+(s.rfc||'—')+'</td><td>'+(s.contact||'—')+'</td><td>'+s.currency+'</td><td>'+(s.leadDays?s.leadDays+' días':'—')+'</td><td>'+chip(s.active===false?'Inactivo':'Activo',s.active===false?'gray':'green')+'</td><td><button class="ghost supplier-edit" data-id="'+s.id+'">Editar</button> <button class="ghost supplier-toggle" data-id="'+s.id+'">'+(s.active===false?'Activar':'Desactivar')+'</button></td></tr>'}).join('');
  h+='</tbody></table></div>'+atlasPagination(meta,'suppliers')+'</div>';
  return h;
}

function atlasBindSupplierConfig(){
  document.querySelectorAll('.ctab').forEach(function(b){b.onclick=function(){state.configTab=b.dataset.tab;state.supplierAdminId=null;state.supplierAdminMessage='';render()}});
  const search=document.querySelector('#supplier-search');if(search)search.oninput=function(e){state.supplierAdminSearch=e.target.value;state.supplierAdminPage=1;render()};
  const add=document.querySelector('#supplier-new');if(add)add.onclick=function(){state.supplierAdminId='new';state.supplierAdminMessage='';render()};
  const cancel=document.querySelector('#supplier-cancel');if(cancel)cancel.onclick=function(){state.supplierAdminId=null;state.supplierAdminMessage='';render()};
  document.querySelectorAll('.supplier-edit').forEach(function(b){b.onclick=function(){state.supplierAdminId=+b.dataset.id;state.supplierAdminMessage='';render()}});
  document.querySelectorAll('.supplier-toggle').forEach(function(b){b.onclick=function(){const s=atlasSuppliers.find(function(x){return x.id===+b.dataset.id});if(s){s.active=!s.active;render()}}});
  const save=document.querySelector('#supplier-save');if(save)save.onclick=function(){
    const id=state.supplierAdminId==='new'?null:+state.supplierAdminId;
    const data={
      name:document.querySelector('#sup-name').value.trim(),
      legalName:document.querySelector('#sup-legal').value.trim(),
      rfc:document.querySelector('#sup-rfc').value.trim().toUpperCase(),
      contact:document.querySelector('#sup-contact').value.trim(),
      phone:document.querySelector('#sup-phone').value.trim(),
      email:document.querySelector('#sup-email').value.trim(),
      currency:document.querySelector('#sup-currency').value,
      paymentTerms:document.querySelector('#sup-terms').value.trim(),
      leadDays:+document.querySelector('#sup-lead').value||0
    };
    if(!data.name){state.supplierAdminMessage='El nombre comercial del proveedor es obligatorio.';render();return}
    const dupName=atlasSuppliers.find(function(s){return s.id!==id&&atlasNormText(s.name)===atlasNormText(data.name)});
    if(dupName){state.supplierAdminId=dupName.id;state.supplierAdminMessage='Ya existe un proveedor con ese nombre. Atlas abrió el registro existente.';render();return}
    if(data.rfc){
      const dupRFC=atlasSuppliers.find(function(s){return s.id!==id&&s.rfc&&atlasNormRFC(s.rfc)===atlasNormRFC(data.rfc)});
      if(dupRFC){state.supplierAdminId=dupRFC.id;state.supplierAdminMessage='RFC duplicado: Atlas abrió el proveedor existente.';render();return}
    }
    if(id){const s=atlasSuppliers.find(function(x){return x.id===id});Object.assign(s,data);s.active=s.active!==false;state.supplierAdminMessage='Proveedor actualizado.'}
    else{const nid=atlasSupplierNextId();atlasSuppliers.push(Object.assign({id:nid,active:true},data));state.supplierAdminId=nid;state.supplierAdminMessage='Proveedor creado.'}
    render();
  };
  atlasBindPagination();
}

const atlasConfigR7Base=config;
config=function(){
  if(state.configTab!=='suppliers')return atlasConfigR7Base();
  setHead('Configuración','Administración','');
  setTimeout(atlasBindSupplierConfig,0);
  return '<div class="atlas-config-layout">'+atlasConfigMenu()+'<div class="atlas-config-content">'+atlasConfigSuppliers()+'</div></div>';
};

/* Paginación de proveedores */
const atlasBindPaginationR7Base=atlasBindPagination;
atlasBindPagination=function(){
  atlasBindPaginationR7Base();
  document.querySelectorAll('.atlas-page-btn[data-key="suppliers"]').forEach(function(b){b.onclick=function(){state.supplierAdminPage=+b.dataset.page;render()}});
};

/* -------- Compras → Nueva OC usando proveedores registrados -------- */
function atlasNewPurchaseDraft(){
  const supplier=atlasActiveSuppliers()[0]||null;
  return {supplierId:supplier?supplier.id:null,projectId:projects[0]?projects[0].id:'',lines:[],message:''};
}
function atlasPurchaseNextNumber(){
  return String(Math.max.apply(null,atlasPurchaseOrders.map(function(po){return +po.id||0}))+1);
}
function atlasPurchaseDraftTotal(draft){
  return draft.lines.reduce(function(s,l){return s+(+l.qty||0)*(+l.cost||0)},0);
}
function atlasPurchaseNewView(){
  const d=state.purchaseDraft||(state.purchaseDraft=atlasNewPurchaseDraft());
  const supplier=atlasSuppliers.find(function(s){return s.id===+d.supplierId});
  let h='<div class="card panel"><div class="project-header"><div><h3>Nueva orden de compra</h3><p class="muted">Selecciona un proveedor registrado. Compras define aquí los costos; Almacén solo recibirá cantidades.</p></div><button id="po-back" class="ghost">← Compras</button></div>';
  h+='<div class="grid-2"><div><label>Proveedor</label><select id="po-supplier" class="select" style="width:100%">'+atlasActiveSuppliers().map(function(s){return atlasOpt(s.id,d.supplierId,s.name+' · '+s.currency)}).join('')+'</select></div><div><label>Proyecto</label><select id="po-project" class="select" style="width:100%">'+projects.map(function(p){return atlasOpt(p.id,d.projectId,p.id+' · '+p.name)}).join('')+'</select></div></div>';
  if(supplier)h+='<div class="note" style="margin-top:12px"><strong>'+supplier.name+'</strong> · '+(supplier.paymentTerms||'Sin condiciones registradas')+(supplier.leadDays?' · Entrega estimada '+supplier.leadDays+' días':'')+'</div>';
  h+='<div class="note" style="margin-top:14px"><strong>Agregar partida</strong><div class="toolbar" style="margin-top:10px"><select id="po-item" class="select" style="min-width:360px">'+inventory.filter(function(i){return i.active!==false}).map(function(i){return atlasOpt(i.id,'',i.model+' · '+i.brand+' · '+i.desc)}).join('')+'</select><input id="po-qty" class="input" type="number" min="1" value="1" style="width:90px" title="Cantidad"><input id="po-cost" class="input" type="number" min="0" step="0.01" value="0" style="width:120px" placeholder="Costo unitario"><button id="po-add-line" class="primary">+ Agregar</button></div></div>';
  h+='<div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Cantidad</th><th>Costo unitario</th><th>Importe</th><th></th></tr></thead><tbody>';
  h+=(d.lines.length?d.lines.map(function(l,i){const item=inventory.find(function(x){return x.model===l.model});return '<tr><td><strong>'+l.model+'</strong></td><td>'+(item?item.desc:'')+'</td><td>'+l.qty+'</td><td>'+fmt(l.cost)+'</td><td>'+fmt(l.qty*l.cost)+'</td><td><button class="ghost po-remove-line" data-i="'+i+'">Quitar</button></td></tr>'}).join(''):'<tr><td colspan="6" class="muted">Aún no hay partidas en la orden.</td></tr>');
  h+='</tbody></table></div><div class="purchase-total"><span>Total OC</span><strong>'+fmt(atlasPurchaseDraftTotal(d))+'</strong></div>';
  if(d.message)h+='<div class="note" style="margin-top:12px"><strong>'+d.message+'</strong></div>';
  h+='<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button id="po-cancel" class="ghost">Cancelar</button><button id="po-save" class="primary">Guardar OC</button></div></div>';
  return h;
}
function atlasBindPurchaseNew(){
  const back=document.querySelector('#po-back'),cancel=document.querySelector('#po-cancel');
  const close=function(){state.purchaseMode='list';state.purchaseDraft=null;render()};
  if(back)back.onclick=close;if(cancel)cancel.onclick=close;
  const sup=document.querySelector('#po-supplier');if(sup)sup.onchange=function(e){state.purchaseDraft.supplierId=+e.target.value;render()};
  const pr=document.querySelector('#po-project');if(pr)pr.onchange=function(e){state.purchaseDraft.projectId=e.target.value};
  const item=document.querySelector('#po-item'),cost=document.querySelector('#po-cost');
  if(item&&cost){
    const syncCost=function(){const inv=inventory.find(function(i){return i.id===+item.value});if(inv)cost.value=inv.cost||0};
    item.onchange=syncCost;
    if(!+cost.value)syncCost();
  }
  const add=document.querySelector('#po-add-line');if(add)add.onclick=function(){
    const inv=inventory.find(function(i){return i.id===+document.querySelector('#po-item').value});
    const qty=+document.querySelector('#po-qty').value||0,cost=+document.querySelector('#po-cost').value||0;
    if(!inv||qty<=0||cost<0)return;
    const existing=state.purchaseDraft.lines.find(function(l){return l.model===inv.model});
    if(existing){existing.qty+=qty;existing.cost=cost}else state.purchaseDraft.lines.push({model:inv.model,qty:qty,received:0,cost:cost});
    state.purchaseDraft.message='';render();
  };
  document.querySelectorAll('.po-remove-line').forEach(function(b){b.onclick=function(){state.purchaseDraft.lines.splice(+b.dataset.i,1);render()}});
  const save=document.querySelector('#po-save');if(save)save.onclick=function(){
    const d=state.purchaseDraft,supplier=atlasSuppliers.find(function(s){return s.id===+d.supplierId&&s.active!==false});
    if(!supplier){d.message='Selecciona un proveedor activo registrado en Configuración.';render();return}
    if(!d.projectId){d.message='Selecciona el proyecto de la OC.';render();return}
    if(!d.lines.length){d.message='Agrega al menos una partida.';render();return}
    atlasPurchaseOrders.unshift({id:atlasPurchaseNextNumber(),projectId:d.projectId,supplier:supplier.name,supplierId:supplier.id,lines:d.lines.map(function(l){return Object.assign({},l)})});
    state.purchaseMode='list';state.purchaseDraft=null;state.purchasePage=1;render();
  };
}
function atlasPurchaseListView(){
  const meta=atlasPageData(atlasPurchaseOrders,state.purchasePage);state.purchasePage=meta.page;
  return '<div class="card panel"><h3>Órdenes de compra / recepciones</h3><p class="muted">Toda OC debe quedar ligada a un proveedor registrado.</p><div class="table-wrap"><table class="table"><thead><tr><th>OC compra</th><th>Proyecto</th><th>Proveedor</th><th>Partidas</th><th>Total compra</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>'+meta.rows.map(function(po){const total=po.lines.reduce(function(s,x){return s+x.qty},0),received=po.lines.reduce(function(s,x){return s+x.received},0),amount=po.lines.reduce(function(s,x){return s+x.qty*x.cost},0);return '<tr><td><strong>#'+po.id+'</strong></td><td>'+po.projectId+'</td><td>'+po.supplier+'</td><td>'+po.lines.length+'</td><td>'+fmt(amount)+'</td><td>'+received+' / '+total+'</td><td>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Completa'?'green':atlasPoStatus(po)==='Parcial'?'orange':'blue')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'purchases')+'</div>';
}
compras=function(){
  setHead('Compras','Abastecimiento','Nueva OC');
  const primary=document.querySelector('#primary-action');
  if(primary)primary.onclick=function(){state.purchaseMode='new';state.purchaseDraft=atlasNewPurchaseDraft();render()};
  if(state.purchaseMode==='new'){setTimeout(atlasBindPurchaseNew,0);return atlasPurchaseNewView()}
  setTimeout(atlasBindPagination,0);
  return atlasPurchaseListView();
};

/* Reporte de compras: conservar proveedor maestro como origen */
const atlasReportPurchasesR7Base=atlasReportPurchases;
atlasReportPurchases=function(){
  const base=atlasReportPurchasesR7Base();
  const active=atlasActiveSuppliers().length,inactive=atlasSuppliers.length-active;
  return '<div class="note" style="margin-bottom:14px"><strong>Proveedores:</strong> '+active+' activos'+(inactive?' · '+inactive+' inactivos':'')+'. Las OC nuevas solo pueden seleccionar proveedores activos registrados en Configuración.</div>'+base;
};

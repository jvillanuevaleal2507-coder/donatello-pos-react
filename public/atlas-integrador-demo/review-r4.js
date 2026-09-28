/* Atlas Integrador — revisión R4: clientes administrados + catálogos maestros */
state.clientAdminId=state.clientAdminId||null;
state.clientAdminSearch=state.clientAdminSearch||'';
state.clientAdminMessage=state.clientAdminMessage||'';
state.catalogEditType=state.catalogEditType||'';
state.catalogEditValue=state.catalogEditValue||'';

clients.forEach(function(c){
  if(c.legalName===undefined)c.legalName=c.name;
  if(c.tradeName===undefined)c.tradeName=c.name;
  if(c.phone===undefined)c.phone='';
  if(c.email===undefined)c.email='';
  if(c.address===undefined)c.address='';
  if(c.active===undefined)c.active=true;
});

const atlasBrands=[...new Set(inventory.map(function(i){return i.brand}).filter(Boolean).concat(['Dahua']))];
const atlasInactiveCategories=[];
const atlasInactiveLocations=[];
const atlasInactiveBrands=[];

function atlasNormText(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,' ')}
function atlasNormRFC(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9Ñ&]/g,'')}
function atlasIsInactive(list,value){return list.indexOf(value)>=0}
function atlasActiveValues(list,inactive){return list.filter(function(x){return !atlasIsInactive(inactive,x)})}
function atlasCatalogOptions(list,inactive,current){
  const values=atlasActiveValues(list,inactive).slice();
  if(current&&values.indexOf(current)<0)values.unshift(current);
  return values.map(function(x){return atlasOpt(x,current,x+(atlasIsInactive(inactive,x)?' · Inactiva':''))}).join('');
}
function atlasCatalogRename(type,oldValue,newValue){
  const nv=String(newValue||'').trim().toUpperCase();if(!nv)return false;
  let list,inactive,field;
  if(type==='category'){list=atlasCategories;inactive=atlasInactiveCategories;field='category'}
  if(type==='brand'){list=atlasBrands;inactive=atlasInactiveBrands;field='brand'}
  if(type==='location'){list=atlasLocations;inactive=atlasInactiveLocations;field='loc'}
  if(!list)return false;
  if(list.some(function(x){return atlasNormText(x)===atlasNormText(nv)&&x!==oldValue}))return false;
  const idx=list.indexOf(oldValue);if(idx<0)return false;
  list[idx]=nv;
  const inIdx=inactive.indexOf(oldValue);if(inIdx>=0)inactive[inIdx]=nv;
  inventory.forEach(function(i){if(i[field]===oldValue)i[field]=nv});
  return true;
}
function atlasCatalogDeactivate(type,value){
  const map={category:atlasInactiveCategories,brand:atlasInactiveBrands,location:atlasInactiveLocations},arr=map[type];
  if(arr&&value&&arr.indexOf(value)<0)arr.push(value);
}
function atlasCatalogReactivate(type,value){
  const map={category:atlasInactiveCategories,brand:atlasInactiveBrands,location:atlasInactiveLocations},arr=map[type];
  if(!arr)return;const i=arr.indexOf(value);if(i>=0)arr.splice(i,1);
}

/* Inventario consume catálogos maestros, no texto libre */
const atlasInventarioR3Final=inventario;
inventario=function(){
  let html=atlasInventarioR3Final();
  const selected=state.invSelectedId==='new'?null:inventory.find(function(x){return x.id===+state.invSelectedId});
  const form=selected||{brand:atlasActiveValues(atlasBrands,atlasInactiveBrands)[0]||'',category:atlasActiveValues(atlasCategories,atlasInactiveCategories)[0]||'',loc:atlasActiveValues(atlasLocations,atlasInactiveLocations)[0]||''};
  if(state.invSelectedId){
    html=html.replace(/<input id="inv-brand" class="input" style="width:100%" value="[^"]*">/,
      '<select id="inv-brand" class="select" style="width:100%">'+atlasCatalogOptions(atlasBrands,atlasInactiveBrands,form.brand)+'</select>');
    html=html.replace(/<select id="inv-category" class="select" style="width:100%">[\s\S]*?<\/select>/,
      '<select id="inv-category" class="select" style="width:100%">'+atlasCatalogOptions(atlasCategories,atlasInactiveCategories,form.category)+'</select>');
    html=html.replace(/<input id="inv-loc" class="input" list="atlas-locs" style="width:100%" value="[^"]*"><datalist id="atlas-locs">[\s\S]*?<\/datalist>/,
      '<select id="inv-loc" class="select" style="width:100%">'+atlasCatalogOptions(atlasLocations,atlasInactiveLocations,form.loc)+'</select>');
  }
  setTimeout(function(){
    const save=document.querySelector('#inv-save');if(!save)return;
    const baseSave=save.onclick;
    save.onclick=function(){
      const brand=document.querySelector('#inv-brand')?.value||'';
      const cat=document.querySelector('#inv-category')?.value||'';
      const loc=document.querySelector('#inv-loc')?.value||'';
      if(!brand||atlasIsInactive(atlasInactiveBrands,brand)){state.invMessage='Selecciona una marca activa registrada en Configuración.';render();return}
      if(!cat||atlasIsInactive(atlasInactiveCategories,cat)){state.invMessage='Selecciona una categoría activa registrada en Configuración.';render();return}
      if(!loc||atlasIsInactive(atlasInactiveLocations,loc)){state.invMessage='Selecciona una ubicación activa registrada en Configuración.';render();return}
      if(baseSave)baseSave();
    };
  },0);
  return html;
};

/* Clientes: uso comercial aquí; altas/cambios solo en Configuración */
clientes=function(){
  setHead('Clientes','Comercial','Nueva cotización');
  document.querySelector('#primary-action').onclick=function(){newQuote()};
  const q=state.clientSearch.toLowerCase();
  const rows=clients.filter(function(c){return c.active!==false&&(!q||[c.name,c.legalName,c.tradeName,c.rfc,c.contact].some(function(v){return String(v||'').toLowerCase().includes(q)}))});
  setTimeout(function(){
    const s=document.querySelector('#client-search');if(s)s.oninput=function(e){state.clientSearch=e.target.value;render()};
    document.querySelectorAll('.qclient').forEach(function(b){b.onclick=function(){newQuote(+b.dataset.id)}});
  },0);
  return '<div class="toolbar"><input id="client-search" class="input" style="min-width:320px" placeholder="Buscar cliente, RFC o contacto" value="'+state.clientSearch+'"></div>'
   +'<div class="card panel"><div class="note" style="margin-bottom:14px"><strong>Altas y cambios:</strong> se administran desde Configuración → Clientes según permisos.</div><table class="table"><thead><tr><th>Cliente</th><th>RFC</th><th>Contacto</th><th>Proyectos</th><th></th></tr></thead><tbody>'
   +rows.map(function(c){return '<tr><td><strong>'+c.name+'</strong></td><td>'+c.rfc+'</td><td>'+c.contact+'</td><td>'+c.closed+'</td><td><button class="ghost qclient" data-id="'+c.id+'">Cotizar</button></td></tr>'}).join('')
   +'</tbody></table></div>';
};

/* Administración de clientes */
function atlasConfigClients(){
  const edit=state.clientAdminId==='new'?null:clients.find(function(c){return c.id===+state.clientAdminId});
  const form=edit||{legalName:'',tradeName:'',rfc:'',contact:'',phone:'',email:'',address:'',active:true};
  const term=state.clientAdminSearch.toLowerCase();
  const rows=clients.filter(function(c){return !term||[c.legalName,c.tradeName,c.name,c.rfc,c.contact,c.email].some(function(v){return String(v||'').toLowerCase().includes(term))});
  let h='<div class="card panel"><div class="project-header"><div><h3>Clientes</h3><p class="muted">Catálogo maestro. Solo usuarios con permiso de Configuración pueden crear o modificar clientes.</p></div><button class="primary" id="client-admin-new">+ Nuevo cliente</button></div>';
  h+='<div class="toolbar"><input id="client-admin-search" class="input" style="min-width:320px" placeholder="Buscar razón social, nombre, RFC o contacto" value="'+state.clientAdminSearch+'"></div>';
  if(state.clientAdminId){
    h+='<div class="note atlas-admin-form"><strong>'+(state.clientAdminId==='new'?'Alta de cliente':'Editar cliente')+'</strong><div class="grid-2" style="margin-top:12px">';
    h+='<div><label>Razón social</label><input id="ca-legal" class="input" style="width:100%" value="'+form.legalName+'"></div>';
    h+='<div><label>Nombre comercial</label><input id="ca-trade" class="input" style="width:100%" value="'+form.tradeName+'"></div>';
    h+='<div><label>RFC</label><input id="ca-rfc" class="input" style="width:100%" value="'+form.rfc+'"></div>';
    h+='<div><label>Contacto principal</label><input id="ca-contact" class="input" style="width:100%" value="'+form.contact+'"></div>';
    h+='<div><label>Teléfono</label><input id="ca-phone" class="input" style="width:100%" value="'+form.phone+'"></div>';
    h+='<div><label>Correo</label><input id="ca-email" class="input" type="email" style="width:100%" value="'+form.email+'"></div>';
    h+='<div style="grid-column:1/-1"><label>Dirección</label><input id="ca-address" class="input" style="width:100%" value="'+form.address+'"></div></div>';
    h+='<div class="toolbar" style="margin-top:12px"><button id="client-admin-save" class="primary">Guardar cliente</button><button id="client-admin-cancel" class="ghost">Cancelar</button></div></div>';
  }
  if(state.clientAdminMessage)h+='<div class="note" style="margin:12px 0"><strong>'+state.clientAdminMessage+'</strong></div>';
  h+='<div class="table-wrap"><table class="table"><thead><tr><th>Razón social / Cliente</th><th>RFC</th><th>Contacto</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>';
  h+=rows.map(function(c){return '<tr style="'+(c.active===false?'opacity:.58':'')+'"><td><strong>'+c.legalName+'</strong><br><span class="muted">'+c.tradeName+'</span></td><td>'+c.rfc+'</td><td>'+c.contact+'</td><td>'+c.email+'</td><td>'+chip(c.active===false?'Inactivo':'Activo',c.active===false?'gray':'green')+'</td><td><button class="ghost client-admin-edit" data-id="'+c.id+'">Editar</button> <button class="ghost client-admin-toggle" data-id="'+c.id+'">'+(c.active===false?'Activar':'Desactivar')+'</button></td></tr>'}).join('');
  h+='</tbody></table></div></div>';
  return h;
}

/* Catálogos compactos: dropdown + editar/desactivar */
function atlasCatalogCard(type,title,list,inactive,prefix){
  const active=atlasActiveValues(list,inactive),editing=state.catalogEditType===type;
  let h='<div class="card panel atlas-catalog-card"><div class="project-header"><div><h3>'+title+'</h3><p class="muted">'+active.length+' activos · '+inactive.length+' inactivos</p></div></div>';
  h+='<div class="toolbar"><input id="'+prefix+'-new" class="input" placeholder="Nuevo registro"><button id="'+prefix+'-add" class="primary">Agregar</button></div>';
  h+='<label>Buscar / seleccionar existente</label><input id="'+prefix+'-select" class="input" list="'+prefix+'-list" style="width:100%;margin-top:6px" placeholder="Escribe para buscar"><datalist id="'+prefix+'-list">'+active.map(function(x){return '<option value="'+x+'">'}).join('')+'</datalist>';
  h+='<div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit" class="ghost">Editar</button><button id="'+prefix+'-disable" class="ghost">Desactivar</button></div>';
  if(editing){
    h+='<div class="note"><label>Nuevo nombre</label><input id="'+prefix+'-edit-value" class="input" style="width:100%;margin-top:6px" value="'+state.catalogEditValue+'"><div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit-save" class="primary">Guardar nombre</button><button id="'+prefix+'-edit-cancel" class="ghost">Cancelar</button></div></div>';
  }
  if(inactive.length){
    h+='<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Inactivos ('+inactive.length+')</summary><div class="toolbar" style="margin-top:10px"><select id="'+prefix+'-inactive" class="select">'+inactive.map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><button id="'+prefix+'-reactivate" class="ghost">Reactivar</button></div></details>';
  }
  h+='</div>';return h;
}
atlasConfigCatalogs=function(){
  return '<div class="atlas-catalog-grid">'
   +atlasCatalogCard('category','Categorías de inventario',atlasCategories,atlasInactiveCategories,'cfg-cat')
   +atlasCatalogCard('brand','Marcas',atlasBrands,atlasInactiveBrands,'cfg-brand')
   +atlasCatalogCard('location','Ubicaciones',atlasLocations,atlasInactiveLocations,'cfg-loc')
   +'</div><div class="note" style="margin-top:14px">Los catálogos desactivados conservan el historial, pero dejan de aparecer en nuevas altas de inventario. SAT se valida desde la ficha del artículo.</div>';
};

atlasConfigMenu=function(){
  const items=[
    ['personal','Personal y mano de obra'],
    ['access','Usuarios, roles y accesos'],
    ['clients','Clientes'],
    ['folios','Consecutivos'],
    ['catalogs','Inventario y catálogos'],
    ['company','Empresa y documentos']
  ];
  return '<div class="card panel atlas-config-menu" style="padding:10px">'+items.map(function(x){return '<button class="'+(state.configTab===x[0]?'primary':'ghost')+' ctab" data-tab="'+x[0]+'" style="width:100%;text-align:left;margin:4px 0">'+x[1]+'</button>'}).join('')+'</div>';
};

function atlasBindCatalog(type,list,inactive,prefix){
  const add=document.querySelector('#'+prefix+'-add');
  if(add)add.onclick=function(){
    const input=document.querySelector('#'+prefix+'-new'),v=String(input.value||'').trim().toUpperCase();if(!v)return;
    const found=list.find(function(x){return atlasNormText(x)===atlasNormText(v)});
    if(found){atlasCatalogReactivate(type,found);input.value='';render();return}
    list.push(v);input.value='';render();
  };
  const edit=document.querySelector('#'+prefix+'-edit');
  if(edit)edit.onclick=function(){
    const v=document.querySelector('#'+prefix+'-select').value;if(!v||list.indexOf(v)<0)return;
    state.catalogEditType=type;state.catalogEditValue=v;render();
  };
  const disable=document.querySelector('#'+prefix+'-disable');
  if(disable)disable.onclick=function(){
    const v=document.querySelector('#'+prefix+'-select').value;if(!v||list.indexOf(v)<0)return;
    atlasCatalogDeactivate(type,v);state.catalogEditType='';state.catalogEditValue='';render();
  };
  const save=document.querySelector('#'+prefix+'-edit-save');
  if(save)save.onclick=function(){
    const nv=document.querySelector('#'+prefix+'-edit-value').value;
    if(atlasCatalogRename(type,state.catalogEditValue,nv)){state.catalogEditType='';state.catalogEditValue='';render()}
  };
  const cancel=document.querySelector('#'+prefix+'-edit-cancel');
  if(cancel)cancel.onclick=function(){state.catalogEditType='';state.catalogEditValue='';render()};
  const react=document.querySelector('#'+prefix+'-reactivate');
  if(react)react.onclick=function(){const v=document.querySelector('#'+prefix+'-inactive').value;atlasCatalogReactivate(type,v);render()};
}

/* Configuración final R4 */
config=function(){
  setHead('Configuración','Administración','');
  let body='';
  if(state.configTab==='personal')body=atlasConfigPersonal();
  else if(state.configTab==='access')body=atlasConfigAccess();
  else if(state.configTab==='clients')body=atlasConfigClients();
  else if(state.configTab==='folios')body=atlasConfigFolios();
  else if(state.configTab==='catalogs')body=atlasConfigCatalogs();
  else body=atlasConfigCompany();

  setTimeout(function(){
    document.querySelectorAll('.ctab').forEach(function(b){b.onclick=function(){state.configTab=b.dataset.tab;state.clientAdminId=null;state.catalogEditType='';render()}});

    /* Personal */
    document.querySelectorAll('.person-edit').forEach(function(b){b.onclick=function(){state.personEditId=+b.dataset.id;render()}});
    document.querySelectorAll('.person-toggle').forEach(function(b){b.onclick=function(){const p=personnel.find(function(x){return x.id===+b.dataset.id});p.active=!p.active;render()}});
    const pn=document.querySelector('#person-new');if(pn)pn.onclick=function(){state.personEditId='new';render()};
    const pc=document.querySelector('#person-cancel');if(pc)pc.onclick=function(){state.personEditId=null;render()};
    const ps=document.querySelector('#person-save');if(ps)ps.onclick=function(){
      const d={name:document.querySelector('#pc-name').value.trim(),position:document.querySelector('#pc-position').value.trim(),hour:+document.querySelector('#pc-hour').value||0,day:+document.querySelector('#pc-day').value||0,satDay:+document.querySelector('#pc-sat').value||0,sunDay:+document.querySelector('#pc-sun').value||0,active:true};
      if(state.personEditId==='new'){d.id=Math.max.apply(null,personnel.map(function(x){return x.id}))+1;personnel.push(d)}
      else Object.assign(personnel.find(function(x){return x.id===+state.personEditId}),d);
      state.personEditId=null;render();
    };

    /* Accesos */
    document.querySelectorAll('.access-role').forEach(function(e){e.onchange=function(){atlasUsers.find(function(u){return u.id===+e.dataset.id}).role=e.value}});
    document.querySelectorAll('.access-active').forEach(function(e){e.onchange=function(){atlasUsers.find(function(u){return u.id===+e.dataset.id}).active=e.checked}});
    document.querySelectorAll('.access-perm').forEach(function(e){e.onchange=function(){const u=atlasUsers.find(function(x){return x.id===+e.dataset.id}),p=e.dataset.perm,has=u.permissions.indexOf(p)>=0;if(e.checked&&!has)u.permissions.push(p);if(!e.checked&&has)u.permissions.splice(u.permissions.indexOf(p),1)}});

    /* Clientes */
    const cs=document.querySelector('#client-admin-search');if(cs)cs.oninput=function(e){state.clientAdminSearch=e.target.value;render()};
    const cn=document.querySelector('#client-admin-new');if(cn)cn.onclick=function(){state.clientAdminId='new';state.clientAdminMessage='';render()};
    document.querySelectorAll('.client-admin-edit').forEach(function(b){b.onclick=function(){state.clientAdminId=+b.dataset.id;state.clientAdminMessage='';render()}});
    document.querySelectorAll('.client-admin-toggle').forEach(function(b){b.onclick=function(){const c=clients.find(function(x){return x.id===+b.dataset.id});c.active=!c.active;render()}});
    const cc=document.querySelector('#client-admin-cancel');if(cc)cc.onclick=function(){state.clientAdminId=null;state.clientAdminMessage='';render()};
    const csave=document.querySelector('#client-admin-save');if(csave)csave.onclick=function(){
      const id=state.clientAdminId==='new'?null:+state.clientAdminId;
      const d={
        legalName:document.querySelector('#ca-legal').value.trim(),
        tradeName:document.querySelector('#ca-trade').value.trim(),
        rfc:document.querySelector('#ca-rfc').value.trim().toUpperCase(),
        contact:document.querySelector('#ca-contact').value.trim(),
        phone:document.querySelector('#ca-phone').value.trim(),
        email:document.querySelector('#ca-email').value.trim(),
        address:document.querySelector('#ca-address').value.trim()
      };
      if(!d.legalName||!d.rfc){state.clientAdminMessage='Razón social y RFC son obligatorios.';render();return}
      const dupRFC=clients.find(function(c){return c.id!==id&&atlasNormRFC(c.rfc)===atlasNormRFC(d.rfc)});
      if(dupRFC){state.clientAdminId=dupRFC.id;state.clientAdminMessage='RFC duplicado: Atlas abrió el cliente existente para evitar un registro repetido.';render();return}
      const dupName=clients.find(function(c){return c.id!==id&&atlasNormText(c.legalName)===atlasNormText(d.legalName)});
      if(dupName){state.clientAdminId=dupName.id;state.clientAdminMessage='Ya existe un cliente con la misma razón social. Atlas abrió el registro existente.';render();return}
      if(id){const c=clients.find(function(x){return x.id===id});Object.assign(c,d);c.name=d.tradeName||d.legalName;c.active=c.active!==false;state.clientAdminMessage='Cliente actualizado.'}
      else{const nid=Math.max.apply(null,clients.map(function(x){return x.id}))+1;clients.push(Object.assign({id:nid,name:d.tradeName||d.legalName,closed:0,active:true},d));state.clientAdminId=nid;state.clientAdminMessage='Cliente creado.'}
      render();
    };

    /* Consecutivos */
    const fs=document.querySelector('#cfg-folio-save');if(fs)fs.onclick=function(){folioConfig.quoteTemplate=document.querySelector('#cfg-qtemplate').value;folioConfig.nextQuote=+document.querySelector('#cfg-qnext').value||folioConfig.nextQuote;folioConfig.projectTemplate=document.querySelector('#cfg-ptemplate').value;folioConfig.nextProject=+document.querySelector('#cfg-pnext').value||folioConfig.nextProject;render()};

    /* Catálogos */
    atlasBindCatalog('category',atlasCategories,atlasInactiveCategories,'cfg-cat');
    atlasBindCatalog('brand',atlasBrands,atlasInactiveBrands,'cfg-brand');
    atlasBindCatalog('location',atlasLocations,atlasInactiveLocations,'cfg-loc');

    /* Empresa / logo */
    const logo=document.querySelector('#cfg-logo');
    if(logo)logo.onchange=function(e){
      const file=e.target.files&&e.target.files[0];if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))return;
      const reader=new FileReader();reader.onload=function(){atlasCompany.logoData=String(reader.result||'');atlasCompany.logoName=file.name;atlasApplyBrand();render()};reader.readAsDataURL(file);
    };
    const companySave=document.querySelector('#cfg-company-save');
    if(companySave)companySave.onclick=function(){
      atlasCompany.name=document.querySelector('#cfg-company').value.trim()||atlasCompany.name;
      atlasCompany.legalName=document.querySelector('#cfg-legal').value.trim()||atlasCompany.legalName;
      atlasCompany.rfc=document.querySelector('#cfg-rfc').value.trim();
      atlasCompany.address=document.querySelector('#cfg-address').value.trim();
      atlasCompany.phone=document.querySelector('#cfg-phone').value.trim();
      atlasCompany.email=document.querySelector('#cfg-email').value.trim();
      atlasCompany.quoteTerms=document.querySelector('#cfg-terms').value.trim();
      atlasApplyBrand();render();
    };
    atlasApplyBrand();
  },0);

  return '<div class="atlas-config-layout">'+atlasConfigMenu()+'<div class="atlas-config-content">'+body+'</div></div>';
};

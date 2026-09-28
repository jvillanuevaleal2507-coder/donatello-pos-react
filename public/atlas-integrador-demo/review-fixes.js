/* Atlas Integrador — cierre de revisión operativa R2 */
state.invSearch=state.invSearch||'';
state.invSelectedId=state.invSelectedId||null;
state.invMessage=state.invMessage||'';
state.realLaborEditId=state.realLaborEditId||null;
state.warehouseMode=state.warehouseMode||'home';
state.warehousePo=state.warehousePo||'11113';
state.warehouseProject=state.warehouseProject||'P-13217';
state.configTab=state.configTab||'personal';

const atlasCompany={
  name:'ATLAS INTEGRADOR',
  legalName:'Atlas Integrador',
  rfc:'XAXX010101000',
  address:'Reynosa, Tamaulipas',
  phone:'',
  email:'',
  quoteTerms:'Precios en MXN. Vigencia y tiempo de entrega según la cotización.'
};
const atlasCategories=['VIDEO VIGILANCIA','CONTROL DE ACCESO','REDES','FIBRA ÓPTICA','CANALIZACIÓN'];
const atlasLocations=['A-02','A-06','B-01','C-04','PROYECTO'];
const atlasUsers=[
 {id:1,name:'Dirección',email:'direccion@demo.local',role:'Dirección',active:true,permissions:['costos','inventario','aceptar','config']},
 {id:2,name:'Comercial',email:'comercial@demo.local',role:'Comercial',active:true,permissions:['cotizaciones','clientes']},
 {id:3,name:'Ingeniería',email:'ingenieria@demo.local',role:'Ingeniería',active:true,permissions:['proyectos','mano']},
 {id:4,name:'Almacén',email:'almacen@demo.local',role:'Almacén',active:true,permissions:['inventario','almacen']}
];
const atlasRealLabor=[
 {id:1,projectId:'P-13217',activity:'CANALIZACIÓN',personId:1,date:'2026-09-10',mode:'día',dayType:'Normal',qty:1},
 {id:2,projectId:'P-13217',activity:'INSTALACIÓN CCTV',personId:2,date:'2026-09-10',mode:'hora',dayType:'Normal',qty:6}
];
const atlasPurchaseOrders=[
 {id:'11113',projectId:'P-13217',supplier:'SYSCOM',lines:[
  {model:'DS-2CD2143G2-I',qty:8,received:6,cost:1825},
  {model:'UTP-CAT6-BL',qty:2,received:2,cost:2850}
 ]},
 {id:'11114',projectId:'P-13217',supplier:'Panduit',lines:[
  {model:'UTP-CAT6-BL',qty:3,received:0,cost:2890},
  {model:'RG-RAP2266',qty:2,received:0,cost:2680}
 ]}
];
const atlasWarehouseMovements=[];

inventory.forEach(function(i){
  if(i.barcode===undefined)i.barcode='';
  if(i.currency===undefined)i.currency='MXN';
  if(i.max===undefined)i.max=Math.max(i.min*3,i.stock);
  if(i.category===undefined)i.category=i.model.indexOf('DS-')===0?'VIDEO VIGILANCIA':i.model.indexOf('RG-')===0?'REDES':'CANALIZACIÓN';
  if(i.satUnit===undefined)i.satUnit='H87';
  if(i.satCode===undefined)i.satCode=i.model.indexOf('UTP')>=0?'26121609':'46171610';
});
projects.forEach(function(p){if(!p.pin)p.pin=String(p.id).replace(/\D/g,'').slice(-4)});

function atlasNormModel(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function atlasOpt(v,current,label){return '<option value="'+v+'" '+(String(v)===String(current)?'selected':'')+'>'+(label||v)+'</option>'}
function atlasInvStatus(i){if(!i.active)return 'Inactivo';if(i.stock<=0)return 'Crítico';if(i.stock<=i.min)return 'Bajo';return 'OK'}
function atlasProjectMaterials(p){
  if(p&&p.baseline&&p.baseline.materials&&p.baseline.materials.length)return p.baseline.materials.map(function(x){return{model:x.model,desc:x.desc,qty:+x.qty||0}});
  const map={
    'P-13217':[{model:'DS-2CD2143G2-I',desc:'Cámara IP domo 4 MP',qty:8},{model:'UTP-CAT6-BL',desc:'Cable Cat6 azul caja 305 m',qty:2}],
    'P-13244':[{model:'DS-K1T341AMF',desc:'Terminal acceso facial',qty:2},{model:'UTP-CAT6-BL',desc:'Cable Cat6 azul caja 305 m',qty:1}],
    'P-13251':[{model:'RG-RAP2266',desc:'Access Point WiFi 6 AX3000',qty:3},{model:'UTP-CAT6-BL',desc:'Cable Cat6 azul caja 305 m',qty:1}]
  };
  return map[p&&p.id]||[];
}

/* 1 + 4. Inventario: buscador + ficha completa + SAT + duplicados */
inventario=function(){
  setHead('Inventario','Materiales','Nuevo artículo');
  const selected=state.invSelectedId==='new'?null:inventory.find(function(x){return x.id===+state.invSelectedId});
  const form=selected||{model:'',brand:'',barcode:'',desc:'',category:'VIDEO VIGILANCIA',cost:0,currency:'MXN',loc:'',min:0,max:0,stock:0,satUnit:'H87',satCode:'',active:true};
  const term=state.invSearch.toLowerCase();
  const matches=inventory.filter(function(i){return !term||[i.model,i.brand,i.desc,i.barcode].some(function(v){return String(v||'').toLowerCase().indexOf(term)>=0})});
  setTimeout(function(){
    document.querySelector('#primary-action').onclick=function(){state.invSelectedId='new';state.invMessage='';render()};
    const q=document.querySelector('#inv-search');if(q)q.oninput=function(e){state.invSearch=e.target.value;render()};
    document.querySelectorAll('.inv-select').forEach(function(b){b.onclick=function(){state.invSelectedId=+b.dataset.id;state.invMessage='';render()}});
    const cancel=document.querySelector('#inv-cancel');if(cancel)cancel.onclick=function(){state.invSelectedId=null;state.invMessage='';render()};
    const deactivate=document.querySelector('#inv-deactivate');if(deactivate)deactivate.onclick=function(){const x=inventory.find(function(i){return i.id===+state.invSelectedId});if(x){x.active=false;state.invMessage='Artículo desactivado. El historial permanece intacto.';render()}};
    const save=document.querySelector('#inv-save');if(save)save.onclick=function(){
      const id=state.invSelectedId==='new'?null:+state.invSelectedId;
      const data={
        model:document.querySelector('#inv-model').value.trim(),
        brand:document.querySelector('#inv-brand').value.trim(),
        barcode:document.querySelector('#inv-barcode').value.trim(),
        desc:document.querySelector('#inv-desc').value.trim(),
        category:document.querySelector('#inv-category').value,
        cost:+document.querySelector('#inv-cost').value||0,
        currency:document.querySelector('#inv-currency').value,
        loc:document.querySelector('#inv-loc').value.trim(),
        min:+document.querySelector('#inv-min').value||0,
        max:+document.querySelector('#inv-max').value||0,
        satUnit:document.querySelector('#inv-satunit').value,
        satCode:document.querySelector('#inv-satcode').value.trim()
      };
      if(!data.model||!data.desc){state.invMessage='Modelo y descripción son obligatorios.';render();return}
      const dup=inventory.find(function(i){return atlasNormModel(i.model)===atlasNormModel(data.model)&&i.id!==id});
      if(dup){state.invSelectedId=dup.id;state.invMessage='No se creó el artículo: el modelo ya existe. Atlas abrió el registro existente para evitar duplicados.';render();return}
      if(id){
        const x=inventory.find(function(i){return i.id===id});Object.assign(x,data);x.status=atlasInvStatus(x);
        state.invMessage='Cambios guardados. La existencia no fue modificada.';
      }else{
        const newId=Math.max.apply(null,inventory.map(function(i){return i.id}))+1;
        inventory.unshift(Object.assign({id:newId,stock:0,status:'Crítico',history:false,active:true},data));
        state.invSelectedId=newId;state.invMessage='Artículo agregado sin duplicar el catálogo.';
      }
      render();
    };
  },0);
  let html='<div class="card panel"><h3>Buscar y editar artículo</h3><p class="muted">Busca por modelo, marca, descripción o código. Selecciona una coincidencia y Atlas cargará la ficha completa arriba.</p>';
  html+='<div class="toolbar"><input id="inv-search" class="input" style="min-width:360px" placeholder="Modelo, marca, descripción o código" value="'+state.invSearch+'"></div>';
  if(state.invSelectedId){
    html+='<div class="note" style="margin:14px 0"><strong>'+(state.invSelectedId==='new'?'Nuevo artículo':'Editando '+form.model)+'</strong><div class="grid-2" style="margin-top:12px">';
    html+='<div><label>Modelo</label><input id="inv-model" class="input" style="width:100%" value="'+form.model+'"></div>';
    html+='<div><label>Marca</label><input id="inv-brand" class="input" style="width:100%" value="'+form.brand+'"></div>';
    html+='<div><label>Código de barras</label><input id="inv-barcode" class="input" style="width:100%" value="'+form.barcode+'"></div>';
    html+='<div><label>Categoría</label><select id="inv-category" class="select" style="width:100%">'+atlasCategories.map(function(x){return atlasOpt(x,form.category)}).join('')+'</select></div>';
    html+='<div><label>Costo de compra</label><input id="inv-cost" class="input" type="number" step="0.01" style="width:100%" value="'+form.cost+'"></div>';
    html+='<div><label>Moneda</label><select id="inv-currency" class="select" style="width:100%">'+atlasOpt('MXN',form.currency)+atlasOpt('USD',form.currency)+'</select></div>';
    html+='<div><label>Ubicación</label><input id="inv-loc" class="input" list="atlas-locs" style="width:100%" value="'+form.loc+'"><datalist id="atlas-locs">'+atlasLocations.map(function(x){return '<option value="'+x+'">'}).join('')+'</datalist></div>';
    html+='<div><label>Existencia actual</label><input class="input" style="width:100%" value="'+form.stock+'" disabled><small class="muted">Solo cambia mediante movimientos de inventario.</small></div>';
    html+='<div><label>Inventario mínimo</label><input id="inv-min" class="input" type="number" style="width:100%" value="'+form.min+'"></div>';
    html+='<div><label>Inventario máximo</label><input id="inv-max" class="input" type="number" style="width:100%" value="'+form.max+'"></div>';
    html+='<div><label>Unidad SAT</label><select id="inv-satunit" class="select" style="width:100%">'+atlasOpt('H87',form.satUnit,'H87 · Pieza')+atlasOpt('E48',form.satUnit,'E48 · Unidad de servicio')+atlasOpt('XBX',form.satUnit,'XBX · Caja')+atlasOpt('MTR',form.satUnit,'MTR · Metro')+'</select></div>';
    html+='<div><label>Clave producto/servicio SAT</label><input id="inv-satcode" class="input" style="width:100%" value="'+form.satCode+'" placeholder="Ej. 46171610"></div>';
    html+='<div style="grid-column:1/-1"><label>Descripción del artículo</label><textarea id="inv-desc" class="input" style="width:100%;min-height:75px">'+form.desc+'</textarea></div></div>';
    html+='<div class="toolbar" style="margin-top:12px"><button id="inv-save" class="primary">Guardar artículo</button><button id="inv-cancel" class="ghost">Cancelar</button>'+(selected?'<button id="inv-deactivate" class="ghost">Desactivar</button>':'')+'</div></div>';
  }
  if(state.invMessage)html+='<div class="note" style="margin-bottom:14px"><strong>'+state.invMessage+'</strong></div>';
  html+='<h3>Coincidencias / catálogo</h3><div class="table-wrap"><table class="table"><thead><tr><th>Modelo</th><th>Marca</th><th>Descripción</th><th>SAT</th><th>Existencia</th><th>Ubicación</th><th>Costo</th><th>Estado</th><th></th></tr></thead><tbody>';
  html+=matches.map(function(i){const st=atlasInvStatus(i);return '<tr style="'+(!i.active?'opacity:.55':'')+'"><td><strong>'+i.model+'</strong></td><td>'+i.brand+'</td><td>'+i.desc+'</td><td>'+i.satUnit+' / '+i.satCode+'</td><td>'+i.stock+'</td><td>'+i.loc+'</td><td>'+fmt(i.cost)+'</td><td>'+chip(st,st==='OK'?'green':st==='Bajo'?'orange':st==='Crítico'?'red':'gray')+'</td><td><button class="ghost inv-select" data-id="'+i.id+'">Seleccionar</button></td></tr>'}).join('');
  html+='</tbody></table></div></div><div class="note" style="margin-top:14px"><strong>Regla:</strong> el stock no se edita en la ficha maestra. Toda corrección debe quedar como movimiento con motivo y auditoría.</div>';
  return html;
};

/* 5. Mano de obra real: alta y edición funcional */
function atlasLaborCost(e){
  const p=personnel.find(function(x){return x.id===+e.personId})||personnel[0];
  let unit=0;
  if(e.mode==='hora')unit=e.dayType==='Sábado'?p.hour*1.5:e.dayType==='Domingo'?p.hour*2:p.hour;
  else unit=e.dayType==='Sábado'?p.satDay:e.dayType==='Domingo'?p.sunDay:p.day;
  return unit*(+e.qty||0);
}
mano=function(){
  setHead('Mano de obra','Costos reales','Registrar actividad');
  const edit=atlasRealLabor.find(function(x){return x.id===+state.realLaborEditId})||{projectId:projects[0].id,activity:activityCatalog[0],personId:personnel[0].id,date:'2026-09-28',mode:'día',dayType:'Normal',qty:1};
  setTimeout(function(){
    document.querySelector('#primary-action').onclick=function(){state.realLaborEditId=null;render()};
    document.querySelectorAll('.real-edit').forEach(function(b){b.onclick=function(){state.realLaborEditId=+b.dataset.id;render()}});
    document.querySelectorAll('.real-del').forEach(function(b){b.onclick=function(){const id=+b.dataset.id;const i=atlasRealLabor.findIndex(function(x){return x.id===id});if(i>=0)atlasRealLabor.splice(i,1);state.realLaborEditId=null;render()}});
    const cancel=document.querySelector('#real-cancel');if(cancel)cancel.onclick=function(){state.realLaborEditId=null;render()};
    document.querySelector('#real-save').onclick=function(){
      const data={
        projectId:document.querySelector('#real-project').value,
        activity:document.querySelector('#real-activity').value,
        personId:+document.querySelector('#real-person').value,
        date:document.querySelector('#real-date').value,
        mode:document.querySelector('#real-mode2').value,
        dayType:document.querySelector('#real-daytype').value,
        qty:+document.querySelector('#real-qty2').value||0
      };
      if(!data.date||data.qty<=0)return;
      if(state.realLaborEditId){const x=atlasRealLabor.find(function(r){return r.id===+state.realLaborEditId});Object.assign(x,data)}
      else{data.id=Math.max.apply(null,[0].concat(atlasRealLabor.map(function(x){return x.id})))+1;atlasRealLabor.unshift(data)}
      state.realLaborEditId=null;render();
    };
  },0);
  let html='<div class="card panel"><h3>'+(state.realLaborEditId?'Editar registro':'Registrar actividad por proyecto')+'</h3><div class="toolbar">';
  html+='<select id="real-project" class="select">'+projects.map(function(p){return atlasOpt(p.id,edit.projectId,p.id+' · '+p.name)}).join('')+'</select>';
  html+='<select id="real-activity" class="select">'+activityCatalog.map(function(x){return atlasOpt(x,edit.activity)}).join('')+'</select>';
  html+='<select id="real-person" class="select">'+personnel.filter(function(x){return x.active}).map(function(p){return atlasOpt(p.id,edit.personId,p.name+' · '+p.position)}).join('')+'</select>';
  html+='<input id="real-date" class="input" type="date" value="'+edit.date+'">';
  html+='<select id="real-mode2" class="select">'+atlasOpt('día',edit.mode,'Por día')+atlasOpt('hora',edit.mode,'Por hora')+'</select>';
  html+='<select id="real-daytype" class="select">'+['Normal','Sábado','Domingo'].map(function(x){return atlasOpt(x,edit.dayType)}).join('')+'</select>';
  html+='<input id="real-qty2" class="input" type="number" min="0.25" step="0.25" value="'+edit.qty+'" style="width:90px">';
  html+='<button id="real-save" class="primary">'+(state.realLaborEditId?'Guardar cambios':'Agregar')+'</button>'+(state.realLaborEditId?'<button id="real-cancel" class="ghost">Cancelar</button>':'')+'</div>';
  html+='<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Actividad</th><th>Empleado</th><th>Modo</th><th>Tiempo</th><th>Costo real</th><th></th></tr></thead><tbody>';
  html+=atlasRealLabor.map(function(x){const p=personnel.find(function(z){return z.id===+x.personId}),pr=projects.find(function(z){return z.id===x.projectId});return '<tr><td>'+x.date+'</td><td>'+x.projectId+'</td><td>'+x.activity+'</td><td>'+(p?p.name:'')+'</td><td>'+(x.mode==='día'?'Día':'Hora')+' / '+x.dayType+'</td><td>'+x.qty+' '+(x.mode==='día'?'día(s)':'h')+'</td><td><strong>'+fmt(atlasLaborCost(x))+'</strong></td><td><button class="ghost real-edit" data-id="'+x.id+'">Editar</button> <button class="ghost real-del" data-id="'+x.id+'">Eliminar</button></td></tr>'}).join('');
  html+='</tbody></table></div></div><div class="note" style="margin-top:14px">Los costos se calculan con la tarifa vigente del empleado configurada en <strong>Configuración → Personal y mano de obra</strong>.</div>';
  return html;
};

/* 6. Almacén funcional */
function atlasPoStatus(po){
  const total=po.lines.reduce(function(s,x){return s+x.qty},0),rec=po.lines.reduce(function(s,x){return s+x.received},0);
  return rec===0?'Pendiente':rec>=total?'Completa':'Parcial';
}
function atlasWarehouseHome(){
  return '<div class="warehouse-home"><div class="card warehouse-card"><div class="icon">📦</div><h3>Recibir orden de compra</h3><p>Busca una OC, valida cantidades parciales y actualiza inventario y costo.</p><button class="primary" id="wh-receive">Recibir OC</button></div><div class="card warehouse-card"><div class="icon">🔧</div><h3>Surtir o devolver proyecto</h3><p>Proyecto + PIN → materiales → cantidades → técnico receptor → guardar movimiento.</p><button class="primary" id="wh-project">Abrir proyecto</button></div></div>';
}
function atlasWarehouseReceive(){
  const po=atlasPurchaseOrders.find(function(x){return x.id===state.warehousePo})||atlasPurchaseOrders[0];
  let h='<div class="card panel"><div class="project-header"><div><h3>Recibir orden de compra</h3><p class="muted">Las recepciones parciales permanecen abiertas hasta completar la OC.</p></div><button class="ghost" id="wh-home">← Almacén</button></div>';
  h+='<div class="toolbar"><select id="wh-po" class="select">'+atlasPurchaseOrders.map(function(x){return atlasOpt(x.id,po.id,'OC #'+x.id+' · '+x.supplier+' · '+x.projectId)}).join('')+'</select>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Parcial'?'orange':atlasPoStatus(po)==='Completa'?'green':'blue')+'</div>';
  h+='<div class="table-wrap"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Ordenado</th><th>Recibido</th><th>Pendiente</th><th>Recibir ahora</th><th>Costo recibido</th></tr></thead><tbody>';
  h+=po.lines.map(function(l){const i=inventory.find(function(x){return x.model===l.model}),pending=Math.max(0,l.qty-l.received);return '<tr><td><strong>'+l.model+'</strong></td><td>'+(i?i.desc:'')+'</td><td>'+l.qty+'</td><td>'+l.received+'</td><td>'+pending+'</td><td><input class="input wh-rec-qty" data-model="'+l.model+'" type="number" min="0" max="'+pending+'" value="0" style="width:85px"></td><td><input class="input wh-rec-cost" data-model="'+l.model+'" type="number" step="0.01" value="'+l.cost+'" style="width:110px"></td></tr>'}).join('');
  h+='</tbody></table></div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="primary" id="wh-rec-save">Guardar recepción</button></div></div>';
  return h;
}
function atlasWarehouseProject(){
  const p=projects.find(function(x){return x.id===state.warehouseProject})||projects[0],mats=atlasProjectMaterials(p);
  let h='<div class="card panel"><div class="project-header"><div><h3>Surtir / devolver proyecto</h3><p class="muted">Todo movimiento queda ligado al proyecto, PIN y receptor.</p></div><button class="ghost" id="wh-home">← Almacén</button></div>';
  h+='<div class="toolbar"><select id="wh-proj" class="select">'+projects.map(function(x){return atlasOpt(x.id,p.id,x.id+' · '+x.name)}).join('')+'</select><input id="wh-pin" class="input" placeholder="PIN del proyecto" style="width:150px"><select id="wh-type" class="select"><option value="salida">Surtir</option><option value="devolucion">Devolución</option></select><select id="wh-recipient" class="select">'+personnel.filter(function(x){return x.active}).map(function(x){return atlasOpt(x.id,'',x.name)}).join('')+'</select></div>';
  h+='<div class="note"><strong>Demo:</strong> PIN de '+p.id+': <strong>'+p.pin+'</strong></div>';
  h+='<div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Presupuestado</th><th>Existencia</th><th>Cantidad</th></tr></thead><tbody>';
  h+=mats.map(function(m){const i=inventory.find(function(x){return x.model===m.model});return '<tr><td><strong>'+m.model+'</strong></td><td>'+m.desc+'</td><td>'+m.qty+'</td><td>'+(i?i.stock:0)+'</td><td><input class="input wh-mov-qty" data-model="'+m.model+'" type="number" min="0" value="0" style="width:90px"></td></tr>'}).join('');
  h+='</tbody></table></div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="primary" id="wh-mov-save">Guardar movimiento</button></div></div>';
  if(atlasWarehouseMovements.length)h+='<div class="card panel" style="margin-top:16px"><h3>Movimientos recientes</h3><table class="table"><thead><tr><th>Tipo</th><th>Proyecto / OC</th><th>Modelo</th><th>Cantidad</th><th>Receptor</th></tr></thead><tbody>'+atlasWarehouseMovements.slice(0,8).map(function(x){return '<tr><td>'+x.type+'</td><td>'+x.ref+'</td><td>'+x.model+'</td><td>'+x.qty+'</td><td>'+x.recipient+'</td></tr>'}).join('')+'</tbody></table></div>';
  return h;
}
almacen=function(){
  setHead('Almacén','Vista operativa','');
  setTimeout(function(){
    const r=document.querySelector('#wh-receive');if(r)r.onclick=function(){state.warehouseMode='receive';render()};
    const p=document.querySelector('#wh-project');if(p)p.onclick=function(){state.warehouseMode='project';render()};
    const home=document.querySelector('#wh-home');if(home)home.onclick=function(){state.warehouseMode='home';render()};
    const po=document.querySelector('#wh-po');if(po)po.onchange=function(e){state.warehousePo=e.target.value;render()};
    const pr=document.querySelector('#wh-proj');if(pr)pr.onchange=function(e){state.warehouseProject=e.target.value;render()};
    const rec=document.querySelector('#wh-rec-save');if(rec)rec.onclick=function(){
      const current=atlasPurchaseOrders.find(function(x){return x.id===state.warehousePo});
      document.querySelectorAll('.wh-rec-qty').forEach(function(inp){
        const qty=+inp.value||0;if(qty<=0)return;
        const line=current.lines.find(function(x){return x.model===inp.dataset.model}),pending=line.qty-line.received;
        if(qty>pending)return;
        const costInput=document.querySelector('.wh-rec-cost[data-model="'+inp.dataset.model+'"]'),cost=+costInput.value||line.cost;
        line.received+=qty;line.cost=cost;
        const item=inventory.find(function(x){return x.model===line.model});if(item){item.stock+=qty;item.cost=cost;item.status=atlasInvStatus(item)}
        atlasWarehouseMovements.unshift({type:'Recepción',ref:'OC '+current.id,model:line.model,qty:qty,recipient:'Almacén'});
      });render();
    };
    const mov=document.querySelector('#wh-mov-save');if(mov)mov.onclick=function(){
      const project=projects.find(function(x){return x.id===state.warehouseProject}),pin=document.querySelector('#wh-pin').value.trim();
      if(pin!==String(project.pin)){document.querySelector('#wh-pin').style.borderColor='#c2410c';return}
      const type=document.querySelector('#wh-type').value,recipientId=+document.querySelector('#wh-recipient').value,recipient=personnel.find(function(x){return x.id===recipientId});
      let valid=true;
      document.querySelectorAll('.wh-mov-qty').forEach(function(inp){const qty=+inp.value||0;if(qty<=0)return;const item=inventory.find(function(x){return x.model===inp.dataset.model});if(type==='salida'&&(!item||item.stock<qty))valid=false});
      if(!valid)return;
      document.querySelectorAll('.wh-mov-qty').forEach(function(inp){const qty=+inp.value||0;if(qty<=0)return;const item=inventory.find(function(x){return x.model===inp.dataset.model});if(item){item.stock+=type==='salida'?-qty:qty;item.status=atlasInvStatus(item)}atlasWarehouseMovements.unshift({type:type==='salida'?'Salida':'Devolución',ref:project.id,model:inp.dataset.model,qty:qty,recipient:recipient?recipient.name:''})});
      render();
    };
  },0);
  if(state.warehouseMode==='receive')return atlasWarehouseReceive();
  if(state.warehouseMode==='project')return atlasWarehouseProject();
  return atlasWarehouseHome();
};

/* 7. Configuración por submódulos */
function atlasConfigMenu(){
  const items=[['personal','Personal y mano de obra'],['access','Usuarios, roles y accesos'],['folios','Consecutivos'],['catalogs','Inventario y catálogos'],['company','Empresa y documentos']];
  return '<div class="card panel" style="padding:10px">'+items.map(function(x){return '<button class="'+(state.configTab===x[0]?'primary':'ghost')+' ctab" data-tab="'+x[0]+'" style="width:100%;text-align:left;margin:4px 0">'+x[1]+'</button>'}).join('')+'</div>';
}
function atlasConfigPersonal(){
  const edit=personnel.find(function(x){return x.id===+state.personEditId})||null;
  let h='<div class="card panel"><div class="project-header"><div><h3>Personal y costos de mano de obra</h3><p class="muted">Estas tarifas alimentan cotizaciones y costos reales.</p></div><button class="primary" id="person-new">+ Agregar personal</button></div>';
  if(edit||state.personEditId==='new'){
    const p=edit||{name:'',position:'',hour:0,day:0,satDay:0,sunDay:0,active:true};
    h+='<div class="note"><div class="grid-2"><div><label>Empleado</label><input id="pc-name" class="input" style="width:100%" value="'+p.name+'"></div><div><label>Puesto</label><input id="pc-position" class="input" style="width:100%" value="'+p.position+'"></div><div><label>Costo/hora</label><input id="pc-hour" class="input" type="number" value="'+p.hour+'"></div><div><label>Día normal</label><input id="pc-day" class="input" type="number" value="'+p.day+'"></div><div><label>Sábado</label><input id="pc-sat" class="input" type="number" value="'+p.satDay+'"></div><div><label>Domingo</label><input id="pc-sun" class="input" type="number" value="'+p.sunDay+'"></div></div><div class="toolbar" style="margin-top:12px"><button id="person-save" class="primary">Guardar</button><button id="person-cancel" class="ghost">Cancelar</button></div></div>';
  }
  h+='<table class="table"><thead><tr><th>Empleado</th><th>Puesto</th><th>Costo/hora</th><th>Día normal</th><th>Sábado</th><th>Domingo</th><th>Estado</th><th></th></tr></thead><tbody>'+personnel.map(function(p){return '<tr><td><strong>'+p.name+'</strong></td><td>'+p.position+'</td><td>'+fmt(p.hour)+'</td><td>'+fmt(p.day)+'</td><td>'+fmt(p.satDay)+'</td><td>'+fmt(p.sunDay)+'</td><td>'+chip(p.active?'Activo':'Inactivo',p.active?'green':'gray')+'</td><td><button class="ghost person-edit" data-id="'+p.id+'">Editar</button> <button class="ghost person-toggle" data-id="'+p.id+'">'+(p.active?'Desactivar':'Activar')+'</button></td></tr>'}).join('')+'</tbody></table></div>';
  return h;
}
function atlasConfigAccess(){
  const perms=[['costos','Ver costos'],['inventario','Ajustar inventario'],['aceptar','Aceptar cotizaciones'],['config','Configuración'],['cotizaciones','Cotizaciones'],['proyectos','Proyectos'],['almacen','Almacén']];
  return '<div class="card panel"><h3>Usuarios, roles y accesos</h3><p class="muted">Los permisos sensibles se controlan por usuario, independientemente del rol visual.</p><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th></tr></thead><tbody>'+atlasUsers.map(function(u){return '<tr><td><strong>'+u.name+'</strong><br><span class="muted">'+u.email+'</span></td><td><select class="select access-role" data-id="'+u.id+'">'+['Dirección','Comercial','Ingeniería','Compras','Almacén'].map(function(r){return atlasOpt(r,u.role)}).join('')+'</select></td><td>'+perms.map(function(p){return '<label style="display:inline-block;margin:3px 10px 3px 0"><input type="checkbox" class="access-perm" data-id="'+u.id+'" data-perm="'+p[0]+'" '+(u.permissions.indexOf(p[0])>=0?'checked':'')+'> '+p[1]+'</label>'}).join('')+'</td><td><label><input type="checkbox" class="access-active" data-id="'+u.id+'" '+(u.active?'checked':'')+'> Activo</label></td></tr>'}).join('')+'</tbody></table></div></div>';
}
function atlasConfigFolios(){
  return '<div class="card panel"><h3>Consecutivos e identificadores</h3><div class="grid-2"><div><label>Plantilla de cotización</label><input id="cfg-qtemplate" class="input" style="width:100%" value="'+folioConfig.quoteTemplate+'"></div><div><label>Siguiente cotización</label><input id="cfg-qnext" class="input" type="number" style="width:100%" value="'+folioConfig.nextQuote+'"></div><div><label>Plantilla de proyecto</label><input id="cfg-ptemplate" class="input" style="width:100%" value="'+folioConfig.projectTemplate+'"></div><div><label>Siguiente proyecto</label><input id="cfg-pnext" class="input" type="number" style="width:100%" value="'+folioConfig.nextProject+'"></div></div><div class="note" style="margin-top:14px">Ejemplo actual: <strong>'+nextQuoteFolio()+'</strong></div><button id="cfg-folio-save" class="primary" style="margin-top:14px">Guardar consecutivos</button></div>';
}
function atlasConfigCatalogs(){
  return '<div class="grid-2"><div class="card panel"><h3>Categorías de inventario</h3><div class="toolbar"><input id="cfg-cat-new" class="input" placeholder="Nueva categoría"><button id="cfg-cat-add" class="primary">Agregar</button></div><div class="action-list">'+atlasCategories.map(function(x){return '<div class="action-item"><strong>'+x+'</strong></div>'}).join('')+'</div></div><div class="card panel"><h3>Ubicaciones</h3><div class="toolbar"><input id="cfg-loc-new" class="input" placeholder="Nueva ubicación"><button id="cfg-loc-add" class="primary">Agregar</button></div><div class="action-list">'+atlasLocations.map(function(x){return '<div class="action-item"><strong>'+x+'</strong></div>'}).join('')+'</div><div class="note" style="margin-top:14px">Unidad SAT y clave de producto/servicio SAT se capturan en la ficha de cada artículo.</div></div></div>';
}
function atlasConfigCompany(){
  return '<div class="card panel"><h3>Empresa y documentos</h3><p class="muted">Estos datos alimentan la plantilla unificada de cotizaciones y proyectos.</p><div class="grid-2"><div><label>Nombre comercial</label><input id="cfg-company" class="input" style="width:100%" value="'+atlasCompany.name+'"></div><div><label>RFC</label><input id="cfg-rfc" class="input" style="width:100%" value="'+atlasCompany.rfc+'"></div><div><label>Dirección</label><input id="cfg-address" class="input" style="width:100%" value="'+atlasCompany.address+'"></div><div><label>Teléfono</label><input id="cfg-phone" class="input" style="width:100%" value="'+atlasCompany.phone+'"></div><div><label>Correo</label><input id="cfg-email" class="input" style="width:100%" value="'+atlasCompany.email+'"></div><div><label>Condiciones por defecto</label><textarea id="cfg-terms" class="input" style="width:100%;min-height:70px">'+atlasCompany.quoteTerms+'</textarea></div></div><button id="cfg-company-save" class="primary" style="margin-top:14px">Guardar datos</button></div>';
}
config=function(){
  setHead('Configuración','Administración','');
  let body=state.configTab==='personal'?atlasConfigPersonal():state.configTab==='access'?atlasConfigAccess():state.configTab==='folios'?atlasConfigFolios():state.configTab==='catalogs'?atlasConfigCatalogs():atlasConfigCompany();
  setTimeout(function(){
    document.querySelectorAll('.ctab').forEach(function(b){b.onclick=function(){state.configTab=b.dataset.tab;render()}});
    document.querySelectorAll('.person-edit').forEach(function(b){b.onclick=function(){state.personEditId=+b.dataset.id;render()}});
    document.querySelectorAll('.person-toggle').forEach(function(b){b.onclick=function(){const p=personnel.find(function(x){return x.id===+b.dataset.id});p.active=!p.active;render()}});
    const pn=document.querySelector('#person-new');if(pn)pn.onclick=function(){state.personEditId='new';render()};
    const pc=document.querySelector('#person-cancel');if(pc)pc.onclick=function(){state.personEditId=null;render()};
    const ps=document.querySelector('#person-save');if(ps)ps.onclick=function(){
      const d={name:document.querySelector('#pc-name').value.trim(),position:document.querySelector('#pc-position').value.trim(),hour:+document.querySelector('#pc-hour').value||0,day:+document.querySelector('#pc-day').value||0,satDay:+document.querySelector('#pc-sat').value||0,sunDay:+document.querySelector('#pc-sun').value||0,active:true};
      if(state.personEditId==='new'){d.id=Math.max.apply(null,personnel.map(function(x){return x.id}))+1;personnel.push(d)}else{Object.assign(personnel.find(function(x){return x.id===+state.personEditId}),d)}
      state.personEditId=null;render();
    };
    document.querySelectorAll('.access-role').forEach(function(e){e.onchange=function(){atlasUsers.find(function(u){return u.id===+e.dataset.id}).role=e.value}});
    document.querySelectorAll('.access-active').forEach(function(e){e.onchange=function(){atlasUsers.find(function(u){return u.id===+e.dataset.id}).active=e.checked}});
    document.querySelectorAll('.access-perm').forEach(function(e){e.onchange=function(){const u=atlasUsers.find(function(x){return x.id===+e.dataset.id}),p=e.dataset.perm,has=u.permissions.indexOf(p)>=0;if(e.checked&&!has)u.permissions.push(p);if(!e.checked&&has)u.permissions.splice(u.permissions.indexOf(p),1)}});
    const fs=document.querySelector('#cfg-folio-save');if(fs)fs.onclick=function(){folioConfig.quoteTemplate=document.querySelector('#cfg-qtemplate').value;folioConfig.nextQuote=+document.querySelector('#cfg-qnext').value||folioConfig.nextQuote;folioConfig.projectTemplate=document.querySelector('#cfg-ptemplate').value;folioConfig.nextProject=+document.querySelector('#cfg-pnext').value||folioConfig.nextProject;render()};
    const ca=document.querySelector('#cfg-cat-add');if(ca)ca.onclick=function(){const v=document.querySelector('#cfg-cat-new').value.trim().toUpperCase();if(v&&atlasCategories.indexOf(v)<0)atlasCategories.push(v);render()};
    const la=document.querySelector('#cfg-loc-add');if(la)la.onclick=function(){const v=document.querySelector('#cfg-loc-new').value.trim().toUpperCase();if(v&&atlasLocations.indexOf(v)<0)atlasLocations.push(v);render()};
    const cs=document.querySelector('#cfg-company-save');if(cs)cs.onclick=function(){atlasCompany.name=document.querySelector('#cfg-company').value.trim()||atlasCompany.name;atlasCompany.rfc=document.querySelector('#cfg-rfc').value.trim();atlasCompany.address=document.querySelector('#cfg-address').value.trim();atlasCompany.phone=document.querySelector('#cfg-phone').value.trim();atlasCompany.email=document.querySelector('#cfg-email').value.trim();atlasCompany.quoteTerms=document.querySelector('#cfg-terms').value.trim();render()};
  },0);
  return '<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px;align-items:start">'+atlasConfigMenu()+'<div>'+body+'</div></div>';
};

/* 1. Permitir borrar completamente la MO precargada del constructor */
const atlasOriginalRenderLaborBuilder=renderLaborBuilder;
renderLaborBuilder=function(q){
  atlasOriginalRenderLaborBuilder(q);
  document.querySelectorAll('.lb-del').forEach(function(el){
    el.onclick=function(){
      const b=state.laborBuilder||blankLaborBuilder();
      b.lines.splice(+el.dataset.i,1);
      state.laborBuilder=b;
      renderQuote();
    };
  });
};

/* 2 + 3. Plantilla documental unificada */
function atlasPdfHeader(doc,title,folio,subtitle){
  doc.setFillColor(15,35,60);doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(atlasCompany.name,14,12);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(atlasCompany.address||'Reynosa, Tamaulipas',14,19);
  doc.setTextColor(15,35,60);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(title,14,40);
  doc.setFontSize(10);doc.text(folio,196,36,{align:'right'});
  if(subtitle){doc.setFont('helvetica','normal');doc.setTextColor(90,100,115);doc.text(subtitle,196,42,{align:'right'})}
  doc.setDrawColor(198,92,36);doc.setLineWidth(1.2);doc.line(14,46,196,46);
}
function atlasPdfInfo(doc,rows,startY){
  doc.autoTable({startY:startY,body:rows,theme:'plain',styles:{fontSize:9,cellPadding:2,textColor:[40,50,65]},columnStyles:{0:{fontStyle:'bold',cellWidth:30,textColor:[100,80,65]},2:{fontStyle:'bold',cellWidth:30,textColor:[100,80,65]}},margin:{left:14,right:14}});
  return doc.lastAutoTable.finalY;
}
function atlasPdfSection(doc,title,y){
  doc.setFillColor(242,245,248);doc.roundedRect(14,y,182,8,1.5,1.5,'F');doc.setFont('helvetica','bold');doc.setTextColor(15,35,60);doc.setFontSize(10);doc.text(title,18,y+5.5);return y+11;
}
function atlasPdfFooter(doc){
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(220);doc.line(14,282,196,282);doc.setFontSize(7.5);doc.setTextColor(110);doc.text(atlasCompany.name+' · Documento generado por Atlas Integrador',14,287);doc.text('Página '+i+' de '+pages,196,287,{align:'right'})}
}
atlasQuotePdf=function(){
  const q=state.quote;if(!q)return;
  const J=window.jspdf&&window.jspdf.jsPDF;if(!J)return;
  const doc=new J(),c=clients.find(function(x){return x.id===q.clientId}),t=quoteTotals(q);
  atlasPdfHeader(doc,'COTIZACIÓN',q.id,'Revisión '+q.revision);
  let y=atlasPdfInfo(doc,[['Cliente',c?c.name:'','Fecha','28 sep 2026'],['Contacto',q.directedTo||(c?c.contact:''),'Moneda',q.currency],['Proyecto',q.name,'Vigencia',q.validity]],51)+5;
  if(q.scope){y=atlasPdfSection(doc,'ALCANCE',y);doc.setFont('helvetica','normal');doc.setTextColor(55);doc.setFontSize(9);const lines=doc.splitTextToSize(q.scope,174);doc.text(lines,18,y);y+=lines.length*4+4}
  y=atlasPdfSection(doc,'MATERIALES',y);
  const matBody=q.materialPresentation==='summary'?[['PRODUCTOS Y MATERIALES','',fmt(t.ms)]]:q.materials.map(function(x){return[x.model+' · '+x.desc,x.qty,fmt(materialPrice(x)),fmt(x.qty*materialPrice(x))]});
  doc.autoTable({startY:y,head:[['Descripción','Cant.','P. unitario','Importe']],body:matBody,theme:'grid',headStyles:{fillColor:[15,35,60],textColor:255,fontStyle:'bold'},styles:{fontSize:8.5,cellPadding:2.4},columnStyles:{1:{halign:'center',cellWidth:18},2:{halign:'right',cellWidth:28},3:{halign:'right',cellWidth:30}},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+7;
  if(q.laborRows&&q.laborRows.length){y=atlasPdfSection(doc,'MANO DE OBRA',y);const groups=groupedLabor(q);doc.autoTable({startY:y,head:[['Actividad','Importe']],body:groups.map(function(g){return[g.activity,fmt(g.items.reduce(function(s,x){return s+laborRowCost(x)*(1+x.markup/100)},0))]}),theme:'grid',headStyles:{fillColor:[15,35,60],textColor:255},styles:{fontSize:8.5},columnStyles:{1:{halign:'right',cellWidth:35}},margin:{left:14,right:14}});y=doc.lastAutoTable.finalY+7}
  doc.autoTable({startY:y,body:[['Subtotal',fmt(t.subtotal)],['IVA '+q.ivaRate+'%',fmt(t.iva)],['TOTAL',fmt(t.total)]],theme:'plain',styles:{fontSize:10,cellPadding:2.5,fontStyle:'bold'},columnStyles:{0:{halign:'right',cellWidth:135},1:{halign:'right',cellWidth:47,textColor:[15,35,60]}},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+8;y=atlasPdfSection(doc,'CONDICIONES COMERCIALES',y);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(70);doc.text(doc.splitTextToSize('Pago: '+q.payment+' · Entrega: '+q.delivery+' · Vigencia: '+q.validity+'. '+atlasCompany.quoteTerms,174),18,y);
  atlasPdfFooter(doc);doc.save('Cotizacion-'+q.id+'-Rev'+q.revision+'.pdf');
};
atlasProjectPdf=function(p){
  const J=window.jspdf&&window.jspdf.jsPDF;if(!J)return;
  const doc=new J(),b=p.baseline||null,mats=atlasProjectMaterials(p);
  atlasPdfHeader(doc,'PROYECTO APROBADO',p.id,p.status);
  let y=atlasPdfInfo(doc,[['Cliente',p.client,'OC / referencia',p.po||''],['Proyecto',p.name,'Responsable',p.owner||''],['Cotización origen',p.sourceQuote||'Histórica','Revisión',p.sourceRevision!=null?String(p.sourceRevision):'-'] ],51)+5;
  doc.setFillColor(250,238,228);doc.roundedRect(14,y,182,20,2,2,'F');doc.setTextColor(155,70,25);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('PIN OPERATIVO',20,y+7);doc.setFontSize(20);doc.text(String(p.pin||''),20,y+16);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text('Requerido para surtir o devolver material del proyecto.',58,y+12);y+=27;
  y=atlasPdfSection(doc,'LISTA DE MATERIALES APROBADA',y);
  doc.autoTable({startY:y,head:[['Modelo','Descripción','Cantidad']],body:mats.map(function(m){return[m.model,m.desc,m.qty]}),theme:'grid',headStyles:{fillColor:[15,35,60],textColor:255},styles:{fontSize:8.5,cellPadding:2.5},columnStyles:{0:{cellWidth:42},2:{halign:'center',cellWidth:24}},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+7;
  if(b&&b.laborRows&&b.laborRows.length){y=atlasPdfSection(doc,'MANO DE OBRA PRESUPUESTADA',y);doc.autoTable({startY:y,head:[['Actividad','Recursos']],body:groupedLabor({laborRows:b.laborRows}).map(function(g){return[g.activity,g.items.length]}),theme:'grid',headStyles:{fillColor:[15,35,60],textColor:255},styles:{fontSize:8.5},margin:{left:14,right:14}});y=doc.lastAutoTable.finalY+7}
  y=atlasPdfSection(doc,'AUTORIZACIÓN',y);doc.setFontSize(9);doc.setTextColor(60);doc.text((p.authorizationType||'Orden de compra')+': '+(p.po||'')+(p.acceptedDate?' · Fecha: '+p.acceptedDate:''),18,y);
  atlasPdfFooter(doc);doc.save('Proyecto-'+p.id+'.pdf');
};

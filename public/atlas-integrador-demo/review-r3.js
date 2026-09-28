/* Atlas Integrador — revisión R3: SAT, almacén y configuración/branding */
state.satMessage=state.satMessage||'';

const atlasSatCatalog={
  '46171610':'Cámaras de seguridad',
  '26121609':'Cable para transmisión de datos',
  '43222631':'Puntos de acceso inalámbrico',
  '46171619':'Sistemas de control de acceso',
  '81111809':'Instalación de sistemas de seguridad'
};
const atlasSatUnits={
  'H87':'Pieza',
  'E48':'Unidad de servicio',
  'XBX':'Caja',
  'MTR':'Metro'
};
function atlasSatDescription(code){return atlasSatCatalog[String(code||'').trim()]||''}

/* Inventario: validación descriptiva SAT sin cambiar el formulario base */
const atlasInventarioR2=inventario;
inventario=function(){
  const html=atlasInventarioR2();
  setTimeout(function(){
    const input=document.querySelector('#inv-satcode'),save=document.querySelector('#inv-save');
    if(!input)return;
    let help=document.querySelector('#inv-sat-help');
    if(!help){
      help=document.createElement('div');
      help.id='inv-sat-help';
      help.style.cssText='font-size:12px;margin-top:6px;font-weight:700';
      input.insertAdjacentElement('afterend',help);
    }
    const validate=function(){
      const code=input.value.trim(),desc=atlasSatDescription(code);
      if(!code){help.textContent='Captura una clave SAT.';help.style.color='#a95524';if(save)save.disabled=true;return}
      if(desc){help.textContent=desc;help.style.color='#16804a';input.style.borderColor='#86c99e';if(save)save.disabled=false}
      else{help.textContent='Clave SAT no reconocida en el catálogo demo.';help.style.color='#b42318';input.style.borderColor='#e3a2a2';if(save)save.disabled=true}
    };
    input.oninput=validate;validate();
  },0);
  return html;
};

/* Almacén: costos pertenecen a Compras; aquí solo se recibe contra pendiente */
atlasWarehouseHome=function(){
  return '<div class="warehouse-home"><div class="card warehouse-card"><div class="icon">📦</div><h3>Recibir orden de compra</h3><p>Busca una OC y registra únicamente las cantidades físicamente recibidas.</p><button class="primary" id="wh-receive">Recibir OC</button></div><div class="card warehouse-card"><div class="icon">🔧</div><h3>Surtir o devolver proyecto</h3><p>Proyecto + PIN → materiales → cantidades → técnico receptor → guardar movimiento.</p><button class="primary" id="wh-project">Abrir proyecto</button></div></div>';
};
atlasWarehouseReceive=function(){
  const po=atlasPurchaseOrders.find(function(x){return x.id===state.warehousePo})||atlasPurchaseOrders[0];
  const pendingLines=po.lines.filter(function(l){return Math.max(0,l.qty-l.received)>0});
  const completeLines=po.lines.filter(function(l){return Math.max(0,l.qty-l.received)===0});
  let h='<div class="card panel"><div class="project-header"><div><h3>Recibir orden de compra</h3><p class="muted">Almacén registra cantidades. Los costos permanecen bajo control de Compras.</p></div><button class="ghost" id="wh-home">← Almacén</button></div>';
  h+='<div class="toolbar"><select id="wh-po" class="select">'+atlasPurchaseOrders.map(function(x){return atlasOpt(x.id,po.id,'OC #'+x.id+' · '+x.supplier+' · '+x.projectId)}).join('')+'</select>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Parcial'?'orange':atlasPoStatus(po)==='Completa'?'green':'blue')+'</div>';
  if(pendingLines.length){
    h+='<div class="table-wrap"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Ordenado</th><th>Recibido</th><th>Pendiente</th><th>Recibir ahora</th></tr></thead><tbody>';
    h+=pendingLines.map(function(l){
      const i=inventory.find(function(x){return x.model===l.model}),pending=Math.max(0,l.qty-l.received);
      return '<tr><td><strong>'+l.model+'</strong></td><td>'+(i?i.desc:'')+'</td><td>'+l.qty+'</td><td>'+l.received+'</td><td><strong>'+pending+'</strong></td><td><input class="input wh-rec-qty" data-model="'+l.model+'" type="number" min="0" max="'+pending+'" value="0" oninput="if(+this.value>+this.max)this.value=this.max;if(+this.value<0)this.value=0" style="width:90px"><input type="hidden" class="wh-rec-cost" data-model="'+l.model+'" value="'+l.cost+'"></td></tr>';
    }).join('');
    h+='</tbody></table></div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="primary" id="wh-rec-save">Guardar recepción</button></div>';
  }else{
    h+='<div class="note" style="margin-top:14px"><strong>OC completa.</strong> No existen partidas pendientes por recibir.</div>';
  }
  if(completeLines.length){
    h+='<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:700;color:#6f665f">Partidas completadas ('+completeLines.length+')</summary><div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Ordenado</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>';
    h+=completeLines.map(function(l){const i=inventory.find(function(x){return x.model===l.model});return '<tr><td><strong>'+l.model+'</strong></td><td>'+(i?i.desc:'')+'</td><td>'+l.qty+'</td><td>'+l.received+'</td><td>'+chip('Completa','green')+'</td></tr>'}).join('');
    h+='</tbody></table></div></details>';
  }
  h+='</div>';
  return h;
};

/* Empresa / documentos: logo administrable */
if(atlasCompany.logoData===undefined)atlasCompany.logoData='';
if(atlasCompany.logoName===undefined)atlasCompany.logoName='';

atlasConfigCompany=function(){
  const logo=atlasCompany.logoData
    ?'<img src="'+atlasCompany.logoData+'" alt="Logo" style="max-width:180px;max-height:74px;object-fit:contain;display:block">'
    :'<div style="width:150px;height:64px;border:1px dashed #cfc5bc;border-radius:10px;display:grid;place-items:center;color:#8a8077;font-size:12px">Sin logotipo</div>';
  return '<div class="card panel atlas-company-card"><h3>Empresa y documentos</h3><p class="muted">Estos son los datos de la empresa integradora que utiliza Atlas. Se aplican automáticamente a cotizaciones y documentos de proyecto.</p>'
    +'<div class="atlas-logo-row"><div><label>Logotipo</label><div id="cfg-logo-preview" style="margin-top:8px">'+logo+'</div></div><div><label>Cambiar logotipo</label><input id="cfg-logo" class="input" type="file" accept="image/png,image/jpeg,image/webp" style="width:100%;margin-top:8px"><small class="muted">PNG o JPG recomendado. Al cargarlo se actualiza la vista y los PDFs de esta sesión.</small></div></div>'
    +'<div class="grid-2" style="margin-top:18px"><div><label>Nombre comercial</label><input id="cfg-company" class="input" style="width:100%" value="'+atlasCompany.name+'"></div><div><label>Razón social</label><input id="cfg-legal" class="input" style="width:100%" value="'+atlasCompany.legalName+'"></div><div><label>RFC</label><input id="cfg-rfc" class="input" style="width:100%" value="'+atlasCompany.rfc+'"></div><div><label>Dirección</label><input id="cfg-address" class="input" style="width:100%" value="'+atlasCompany.address+'"></div><div><label>Teléfono</label><input id="cfg-phone" class="input" style="width:100%" value="'+atlasCompany.phone+'"></div><div><label>Correo</label><input id="cfg-email" class="input" style="width:100%" value="'+atlasCompany.email+'"></div><div style="grid-column:1/-1"><label>Condiciones por defecto</label><textarea id="cfg-terms" class="input" style="width:100%;min-height:80px">'+atlasCompany.quoteTerms+'</textarea></div></div><button id="cfg-company-save" class="primary" style="margin-top:14px">Guardar datos</button></div>';
};

function atlasApplyBrand(){
  const mark=document.querySelector('.brand-mark');
  if(!mark)return;
  if(atlasCompany.logoData){
    mark.innerHTML='<img src="'+atlasCompany.logoData+'" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:10px;background:#fff;padding:3px">';
    mark.style.background='#fff';
  }else{
    mark.textContent='A';mark.style.background='';
  }
}

/* Mantener Configuración contenida y completar acciones de Empresa */
const atlasConfigR2=config;
config=function(){
  let html=atlasConfigR2();
  html=html.replace('<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px;align-items:start">','<div class="atlas-config-layout">');
  setTimeout(function(){
    const logo=document.querySelector('#cfg-logo');
    if(logo)logo.onchange=function(e){
      const file=e.target.files&&e.target.files[0];if(!file)return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type))return;
      const reader=new FileReader();
      reader.onload=function(){
        atlasCompany.logoData=String(reader.result||'');
        atlasCompany.logoName=file.name;
        const p=document.querySelector('#cfg-logo-preview');if(p)p.innerHTML='<img src="'+atlasCompany.logoData+'" alt="Logo" style="max-width:180px;max-height:74px;object-fit:contain;display:block">';
        atlasApplyBrand();
      };
      reader.readAsDataURL(file);
    };
    const save=document.querySelector('#cfg-company-save');
    if(save)save.onclick=function(){
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
  return html;
};

/* Logo corporativo dentro de la plantilla documental compartida */
atlasPdfHeader=function(doc,title,folio,subtitle){
  doc.setFillColor(15,35,60);doc.rect(0,0,210,28,'F');
  let textX=14;
  if(atlasCompany.logoData){
    try{
      const format=atlasCompany.logoData.indexOf('image/jpeg')>=0?'JPEG':atlasCompany.logoData.indexOf('image/webp')>=0?'WEBP':'PNG';
      doc.addImage(atlasCompany.logoData,format,14,5,18,18);
      textX=37;
    }catch(e){}
  }
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(atlasCompany.name,textX,12);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(atlasCompany.address||'Reynosa, Tamaulipas',textX,19);
  doc.setTextColor(15,35,60);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(title,14,40);
  doc.setFontSize(10);doc.text(folio,196,36,{align:'right'});
  if(subtitle){doc.setFont('helvetica','normal');doc.setTextColor(90,100,115);doc.text(subtitle,196,42,{align:'right'})}
  doc.setDrawColor(198,92,36);doc.setLineWidth(1.2);doc.line(14,46,196,46);
};

/* Aplicar marca tras cada render sin alterar navegación */
const atlasRenderR3=render;
render=function(){atlasRenderR3();setTimeout(atlasApplyBrand,0)};

// End-to-end commercial simulation for Atlas Integrador Demo.
// It adds a lightweight transaction story without requiring backend persistence.

state.demoFlow = state.demoFlow || {
  quoteApproved:false,
  purchaseIssued:false,
  materialReceived:false,
  laborRegistered:false,
  profitabilityReviewed:false
};

function atlasFlowStep(){
  const f=state.demoFlow;
  if(f.profitabilityReviewed)return 6;
  if(f.laborRegistered)return 5;
  if(f.materialReceived)return 4;
  if(f.purchaseIssued)return 3;
  if(f.quoteApproved)return 2;
  return 1;
}

function atlasFlowRibbon(){
  const current=atlasFlowStep();
  const labels=['Cotización','Proyecto','Compra','Almacén','Mano de obra','Rentabilidad'];
  return `<div class="atlas-flow-ribbon">${labels.map((label,i)=>{
    const n=i+1;const cls=n<current?'done':n===current?'active':'';
    return `<div class="atlas-flow-step ${cls}"><span>${n<current?'✓':n}</span><strong>${label}</strong></div>`;
  }).join('')}</div>`;
}

function atlasInjectFlowRibbon(){
  const content=document.querySelector('#content');
  if(!content||content.querySelector('.atlas-flow-ribbon'))return;
  const relevant=['cotizaciones','proyectos','compras','almacen','mano'];
  if(!relevant.includes(state.page))return;
  content.insertAdjacentHTML('afterbegin',atlasFlowRibbon());
}

function atlasFindButton(fragment){
  return [...document.querySelectorAll('#content button')].find(b=>b.textContent.includes(fragment));
}

function atlasApproveQuote(){
  state.demoFlow.quoteApproved=true;
  const q=quotes.find(x=>x.id==='COT-1048');if(q)q.status='Aprobada';
  const p=projects.find(x=>x.id==='P-13217');if(p)p.status='Aprobado';
  atlasToast('Cotización aprobada · Proyecto P-13217 creado');
  state.page='proyectos';state.project='P-13217';state.projectTab='Resumen';state.quote=null;
  render();
}

function atlasIssuePurchase(){
  state.demoFlow.purchaseIssued=true;
  atlasToast('Solicitud enviada a Compras · OC #11113 preparada');
  state.page='compras';state.project=null;render();
}

function atlasReceiveMaterial(){
  state.demoFlow.materialReceived=true;
  const camera=inventory.find(i=>i.model==='DS-2CD2143G2-I');
  if(camera){camera.stock=6;camera.status='OK';}
  atlasToast('Recepción parcial registrada · Inventario actualizado');
  state.page='almacen';state.warehouse=null;render();
}

function atlasRegisterLabor(){
  state.demoFlow.laborRegistered=true;
  const p=projects.find(x=>x.id==='P-13217');if(p)p.real=136900;
  atlasToast('14 h registradas al proyecto · Costo real actualizado');
  state.page='proyectos';state.project='P-13217';state.projectTab='Rentabilidad';render();
}

function atlasReviewProfit(){
  state.demoFlow.profitabilityReviewed=true;
  atlasToast('Rentabilidad revisada · Recorrido operativo completo');
  render();
}

function atlasEnhanceQuoteFlow(){
  if(state.page!=='cotizaciones'||state.quote!=='COT-1048')return;
  const content=document.querySelector('#content');if(!content)return;
  const old=atlasFindButton('Aprobar y convertir');
  if(old){
    old.onclick=atlasApproveQuote;
    old.textContent=state.demoFlow.quoteApproved?'✓ Aprobada · Ver proyecto →':'✓ Aprobar y convertir en proyecto →';
  }
  const header=content.querySelector('.project-header');
  if(header&&!content.querySelector('.atlas-flow-callout'))header.insertAdjacentHTML('afterend',`<div class="atlas-flow-callout"><div><strong>Momento clave</strong><span>La cotización conserva costo, venta y margen como línea base del proyecto.</span></div>${chip(state.demoFlow.quoteApproved?'Convertida':'Lista para aprobar',state.demoFlow.quoteApproved?'green':'blue')}</div>`);
}

function atlasEnhanceProjectFlow(){
  if(state.page!=='proyectos'||state.project!=='P-13217')return;
  const content=document.querySelector('#content');if(!content)return;
  if(state.projectTab==='Resumen'&&!content.querySelector('#atlas-buy-action')){
    const block=document.createElement('div');block.className='card panel atlas-next-action';block.id='atlas-buy-action';
    block.innerHTML=`<div><span class="eyebrow">Siguiente movimiento</span><h3>Convertir necesidades del proyecto en abastecimiento</h3><p class="muted">Compras recibe cantidades, proyecto y presupuesto sin volver a capturar la información.</p></div><button class="primary">${state.demoFlow.purchaseIssued?'Ver compra #11113 →':'Generar solicitud de compra →'}</button>`;
    block.querySelector('button').onclick=atlasIssuePurchase;
    content.appendChild(block);
  }
  if(state.projectTab==='Rentabilidad'&&!content.querySelector('.atlas-profit-story')){
    const p=projects.find(x=>x.id==='P-13217');
    const actual=p?.real||134200;const margin=((184500-actual)/184500*100).toFixed(1);
    const card=document.createElement('div');card.className='card panel atlas-profit-story';
    card.innerHTML=`<div class="panel-head"><div><h3>De margen vendido a margen real</h3><p class="muted">Atlas compara la promesa comercial contra lo que realmente costó ejecutar.</p></div>${chip(state.demoFlow.laborRegistered?'Actualizado':'En seguimiento',state.demoFlow.laborRegistered?'green':'orange')}</div><div class="atlas-before-after"><div><span>Margen vendido</span><strong>30.1%</strong><small>Base de cotización</small></div><div class="atlas-arrow">→</div><div><span>Margen real / proyectado</span><strong>${margin}%</strong><small>Material + MO + indirectos</small></div></div><div class="flow-actions"><button class="primary" id="atlas-review-profit">${state.demoFlow.profitabilityReviewed?'✓ Rentabilidad revisada':'Marcar revisión de Dirección'}</button></div>`;
    content.appendChild(card);
    card.querySelector('#atlas-review-profit').onclick=atlasReviewProfit;
  }
}

function atlasEnhancePurchaseFlow(){
  if(state.page!=='compras')return;
  const content=document.querySelector('#content');if(!content)return;
  if(!content.querySelector('.atlas-purchase-story')){
    const card=document.createElement('div');card.className='atlas-flow-callout atlas-purchase-story';
    card.innerHTML=`<div><strong>OC #11113 · Proyecto P-13217</strong><span>8 partidas · 6 disponibles para recepción · 2 pendientes del proveedor.</span></div><button class="primary">${state.demoFlow.materialReceived?'Recepción registrada ✓':'Enviar a recepción →'}</button>`;
    card.querySelector('button').onclick=()=>{state.demoFlow.purchaseIssued=true;state.page='almacen';state.warehouse='receive-demo';render();};
    content.prepend(card);
  }
}

function atlasEnhanceWarehouseFlow(){
  if(state.page!=='almacen')return;
  const content=document.querySelector('#content');if(!content)return;
  if(state.warehouse==='receive-demo'&&!content.querySelector('.atlas-receive-demo')){
    content.innerHTML=`${atlasFlowRibbon()}<div class="project-header"><div><h2>Recepción OC #11113</h2><p class="muted">Proyecto P-13217 · CCTV Nave 3 · Proveedor SYSCOM</p></div><button class="secondary" id="atlas-wh-back">← Volver</button></div><div class="card panel atlas-receive-demo"><h3>Validación contra orden de compra</h3><div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th><th>Resultado</th></tr></thead><tbody><tr><td>DS-2CD2143G2-I · Cámara IP 4 MP</td><td>6</td><td>6</td><td>0</td><td>${chip('Completo','green')}</td></tr><tr><td>UTP-CAT6-BL · Cable Cat6</td><td>2</td><td>0</td><td>2</td><td>${chip('Pendiente','orange')}</td></tr></tbody></table></div><div class="note"><strong>Control:</strong> Atlas mantiene pendiente lo no recibido y sólo incrementa existencia por cantidades físicamente validadas.</div><div class="flow-actions"><button class="primary" id="atlas-confirm-receive">${state.demoFlow.materialReceived?'✓ Recepción ya registrada':'Confirmar recepción parcial'}</button></div></div>`;
    content.querySelector('#atlas-wh-back').onclick=()=>{state.warehouse=null;render();};
    content.querySelector('#atlas-confirm-receive').onclick=()=>{atlasReceiveMaterial();};
    return;
  }
  const receive=atlasFindButton('Recibir OC');if(receive)receive.onclick=()=>{state.warehouse='receive-demo';render();};
}

function atlasEnhanceLaborFlow(){
  if(state.page!=='mano')return;
  const content=document.querySelector('#content');if(!content||content.querySelector('.atlas-labor-story'))return;
  const card=document.createElement('div');card.className='atlas-flow-callout atlas-labor-story';
  card.innerHTML=`<div><strong>Registrar ejecución real · P-13217</strong><span>Canalización 8 h + instalación CCTV 6 h · Técnico 01 / Técnico 02.</span></div><button class="primary">${state.demoFlow.laborRegistered?'14 h registradas ✓':'Registrar 14 h al proyecto'}</button>`;
  card.querySelector('button').onclick=atlasRegisterLabor;
  content.prepend(card);
}

function atlasFlowReset(){
  state.demoFlow={quoteApproved:false,purchaseIssued:false,materialReceived:false,laborRegistered:false,profitabilityReviewed:false};
  const camera=inventory.find(i=>i.model==='DS-2CD2143G2-I');if(camera){camera.stock=0;camera.status='Crítico';}
  const p=projects.find(x=>x.id==='P-13217');if(p){p.real=134200;p.status='En ejecución';}
}

const atlasFlowBaseReset=atlasResetDemo;
atlasResetDemo=function(){atlasFlowReset();atlasFlowBaseReset();};

const atlasFlowBaseDecorate=atlasDecorate;
atlasDecorate=function(){
  atlasFlowBaseDecorate();
  atlasInjectFlowRibbon();
  atlasEnhanceQuoteFlow();
  atlasEnhanceProjectFlow();
  atlasEnhancePurchaseFlow();
  atlasEnhanceWarehouseFlow();
  atlasEnhanceLaborFlow();
};

atlasDecorate();

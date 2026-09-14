const atlasTourSteps=[
 {title:'1. Oportunidad comercial',text:'Partimos de una cotización con costo, precio de venta y margen. El objetivo es proteger la utilidad desde antes de vender.',go(){state.page='cotizaciones';state.quote='COT-1048';state.project=null;state.warehouse=null;render();}},
 {title:'2. Conversión a proyecto',text:'Al aprobarse la cotización, Atlas conserva la base económica y la convierte en proyecto operativo.',go(){state.page='proyectos';state.project='P-13217';state.projectTab='Resumen';state.quote=null;render();}},
 {title:'3. Compras y abastecimiento',text:'Las órdenes de compra quedan ligadas al proyecto para dar seguimiento a pendientes y recepciones parciales.',go(){state.page='compras';state.project=null;render();}},
 {title:'4. Almacén y materiales',text:'Almacén recibe, surte y devuelve material contra un proyecto. Esto ayuda a conocer el costo real y mantener trazabilidad.',go(){state.page='almacen';state.warehouse=null;render();}},
 {title:'5. Mano de obra real',text:'Las horas y actividades del equipo se registran contra el proyecto para comparar presupuesto contra ejecución.',go(){state.page='mano';state.warehouse=null;render();}},
 {title:'6. Rentabilidad y dirección',text:'La dirección puede revisar desviaciones, margen real y proyectos que requieren atención sin esperar al cierre del mes.',go(){state.page='proyectos';state.project='P-13217';state.projectTab='Rentabilidad';render();}}
];
let atlasTourIndex=0;

function atlasRolePages(role){
 const map={
  'Dirección':['inicio','clientes','cotizaciones','proyectos','inventario','compras','mano','almacen','reportes','config'],
  'Comercial':['inicio','clientes','cotizaciones','proyectos','reportes'],
  'Ingeniería':['inicio','cotizaciones','proyectos','inventario','mano','reportes'],
  'Compras':['inicio','proyectos','inventario','compras','almacen','reportes'],
  'Almacén':['inicio','inventario','compras','almacen']
 };
 return map[role]||map['Dirección'];
}

function atlasApplyRoleVisibility(){
 const allowed=atlasRolePages(state.role);
 document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.style.display=allowed.includes(btn.dataset.page)?'block':'none';
 });
}

function atlasToast(message){
 let el=document.querySelector('#atlas-toast');
 if(!el){el=document.createElement('div');el.id='atlas-toast';el.className='atlas-toast';document.body.appendChild(el);}
 el.textContent=message;el.classList.add('show');
 clearTimeout(window.__atlasToastTimer);
 window.__atlasToastTimer=setTimeout(()=>el.classList.remove('show'),2200);
}

function atlasCloseTour(){document.querySelector('#atlas-tour')?.remove();}
function atlasShowTour(index=0){
 atlasTourIndex=Math.max(0,Math.min(index,atlasTourSteps.length-1));
 const step=atlasTourSteps[atlasTourIndex];
 step.go();
 atlasCloseTour();
 const overlay=document.createElement('div');overlay.id='atlas-tour';overlay.className='atlas-tour-overlay';
 overlay.innerHTML=`<div class="atlas-tour-card"><div class="atlas-tour-top"><span>Recorrido comercial · ${atlasTourIndex+1}/${atlasTourSteps.length}</span><button class="atlas-tour-x" aria-label="Cerrar">×</button></div><h3>${step.title}</h3><p>${step.text}</p><div class="atlas-tour-progress"><i style="width:${((atlasTourIndex+1)/atlasTourSteps.length)*100}%"></i></div><div class="atlas-tour-actions"><button class="ghost atlas-tour-exit">Salir</button>${atlasTourIndex?'<button class="secondary atlas-tour-prev">← Anterior</button>':''}<button class="primary atlas-tour-next">${atlasTourIndex===atlasTourSteps.length-1?'Terminar':'Siguiente →'}</button></div></div>`;
 document.body.appendChild(overlay);
 overlay.querySelector('.atlas-tour-x').onclick=atlasCloseTour;
 overlay.querySelector('.atlas-tour-exit').onclick=atlasCloseTour;
 const prev=overlay.querySelector('.atlas-tour-prev');if(prev)prev.onclick=()=>atlasShowTour(atlasTourIndex-1);
 overlay.querySelector('.atlas-tour-next').onclick=()=>{
  if(atlasTourIndex===atlasTourSteps.length-1){atlasCloseTour();state.page='inicio';state.project=null;state.quote=null;state.warehouse=null;render();atlasToast('Recorrido completado');}
  else atlasShowTour(atlasTourIndex+1);
 };
}

function atlasResetDemo(){
 state.page='inicio';state.role='Dirección';state.project=null;state.quote=null;state.projectTab='Resumen';state.warehouse=null;
 render();window.scrollTo({top:0,behavior:'smooth'});atlasToast('Demo reiniciado');
}

function atlasDecorate(){
 atlasApplyRoleVisibility();
 const actions=document.querySelector('.top-actions');
 if(actions&&!document.querySelector('#atlas-tour-btn')){
  const tour=document.createElement('button');tour.id='atlas-tour-btn';tour.className='ghost';tour.textContent='▶ Recorrido';tour.onclick=()=>atlasShowTour(0);
  const reset=document.createElement('button');reset.id='atlas-reset-btn';reset.className='ghost compact-action';reset.title='Reiniciar demo';reset.textContent='↺';reset.onclick=atlasResetDemo;
  actions.prepend(reset);actions.prepend(tour);
 }
 const footer=document.querySelector('.sidebar-footer small');if(footer)footer.textContent='Datos ficticios · Entorno demostrativo';
 const brand=document.querySelector('.brand strong');if(brand&&!document.querySelector('.demo-pill')){const p=document.createElement('span');p.className='demo-pill';p.textContent='DEMO';brand.parentElement.appendChild(p);}
}

const atlasBaseRender=render;
render=function(){atlasBaseRender();atlasDecorate();};

const atlasRoleButton=document.querySelector('#role-btn');
if(atlasRoleButton){
 atlasRoleButton.onclick=()=>{
  const i=roles.indexOf(state.role);state.role=roles[(i+1)%roles.length];
  const allowed=atlasRolePages(state.role);if(!allowed.includes(state.page)){state.page='inicio';state.project=null;state.quote=null;state.warehouse=null;}
  render();atlasToast('Vista de '+state.role);
 };
}

document.addEventListener('keydown',e=>{if(e.key==='Escape')atlasCloseTour();});
atlasDecorate();

// Final prospect-facing audit layer for Atlas Integrador Demo.
// Adds presentation safeguards, contextual help and a compact executive close.

function atlasCommercialClose(){
  if(state.page!=='inicio')return;
  const content=document.querySelector('#content');
  if(!content||content.querySelector('.atlas-commercial-close'))return;
  const card=document.createElement('div');
  card.className='card panel atlas-commercial-close';
  card.innerHTML=`
    <div class="panel-head">
      <div><span class="eyebrow">Visión Atlas</span><h3>Una sola trazabilidad: de lo cotizado a lo realmente ganado</h3><p class="muted">Ventas, proyecto, compras, almacén y ejecución comparten la misma línea económica.</p></div>
      ${chip('Demo comercial','blue')}
    </div>
    <div class="atlas-value-grid">
      <div><strong>1</strong><span>Captura una vez</span><small>La información viaja con el proyecto.</small></div>
      <div><strong>2</strong><span>Controla desviaciones</span><small>Costo, material y mano de obra contra presupuesto.</small></div>
      <div><strong>3</strong><span>Decide con margen real</span><small>Dirección ve rentabilidad antes del cierre.</small></div>
    </div>
    <div class="flow-actions"><button class="primary" id="atlas-start-story">Iniciar recorrido comercial →</button></div>`;
  content.appendChild(card);
  card.querySelector('#atlas-start-story').onclick=()=>atlasShowTour(0);
}

function atlasContextHint(){
  document.querySelector('#atlas-context-hint')?.remove();
  const map={
    clientes:['Cliente 360°','Cotizaciones, proyectos y seguimiento en una sola cuenta.'],
    cotizaciones:['Protección de margen','Costo y precio quedan como línea base antes de vender.'],
    proyectos:['Control de ejecución','Compara presupuesto contra costo real mientras el proyecto avanza.'],
    inventario:['Existencia con contexto','El inventario cambia por recepciones y movimientos ligados a operación.'],
    compras:['Compra ligada al proyecto','Abastecimiento sin recapturar cliente, proyecto ni cantidades.'],
    mano:['Mano de obra al costo real','Las horas ejecutadas impactan la rentabilidad del proyecto.'],
    almacen:['Trazabilidad física','Recepción, surtido y devolución contra proyecto.'],
    reportes:['Dirección sin hojas paralelas','Prioriza margen, desviaciones, compras y proyectos en riesgo.'],
    config:['Adaptable al integrador','Roles, reglas de margen y paqueterías de ingeniería configurables.']
  };
  const item=map[state.page];if(!item)return;
  const content=document.querySelector('#content');if(!content)return;
  const hint=document.createElement('div');hint.id='atlas-context-hint';hint.className='atlas-context-hint';
  hint.innerHTML=`<strong>${item[0]}</strong><span>${item[1]}</span>`;
  content.prepend(hint);
}

function atlasDemoGuardrails(){
  // Avoid controls that look broken during a live prospect presentation.
  document.querySelectorAll('#content button').forEach(btn=>{
    if(btn.dataset.atlasGuarded)return;
    const label=btn.textContent.trim().toLowerCase();
    const hasHandler=typeof btn.onclick==='function';
    if(!hasHandler && ['editar','exportar','descargar','guardar','eliminar'].some(x=>label===x||label.startsWith(x+' '))){
      btn.dataset.atlasGuarded='1';
      btn.onclick=()=>atlasToast('Función disponible en la implementación operativa');
    }
  });
}

function atlasPresentationFooter(){
  const footer=document.querySelector('.sidebar-footer');if(!footer)return;
  footer.title='Entorno de demostración con información ficticia';
}

const atlasAuditBaseDecorate=atlasDecorate;
atlasDecorate=function(){
  atlasAuditBaseDecorate();
  atlasCommercialClose();
  atlasContextHint();
  atlasDemoGuardrails();
  atlasPresentationFooter();
};

atlasDecorate();

// Commercial UX layer: makes the demo safer, clearer and more persuasive in a live sales meeting.
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function toast(msg){ if(typeof atlasToast==='function') atlasToast(msg); }
  function go(page,extra={}){ Object.assign(state,{page,project:null,quote:null,warehouse:null},extra); render(); }

  function executiveStart(){
    if(state.page!=='inicio')return;
    const content=$('#content'); if(!content||$('.atlas-exec-start',content))return;
    const block=document.createElement('div');
    block.className='card panel atlas-exec-start';
    block.innerHTML=`<div class="panel-head"><div><span class="eyebrow">Para Dirección</span><h3>¿Dónde se está moviendo el margen?</h3><p class="muted">Empieza por las excepciones. Atlas conecta la alerta con el proyecto y con la acción que la corrige.</p></div><span class="chip orange">3 puntos de atención</span></div><div class="atlas-decision-grid"><button data-go="risk"><span>Proyecto con desviación</span><strong>P-13217 · costo +4.1%</strong><small>Ver qué está erosionando el margen →</small></button><button data-go="purchase"><span>Abastecimiento pendiente</span><strong>OC #11113 · recepción parcial</strong><small>Seguir material pendiente →</small></button><button data-go="profit"><span>Rentabilidad</span><strong>30.1% vendido → 27.3% real</strong><small>Entender la diferencia →</small></button></div>`;
    content.prepend(block);
    $('[data-go="risk"]',block).onclick=()=>go('proyectos',{project:'P-13217',projectTab:'Resumen'});
    $('[data-go="purchase"]',block).onclick=()=>go('compras');
    $('[data-go="profit"]',block).onclick=()=>go('proyectos',{project:'P-13217',projectTab:'Rentabilidad'});
  }

  function projectDecision(){
    if(state.page!=='proyectos'||state.project!=='P-13217')return;
    const content=$('#content'); if(!content||$('.atlas-project-decision',content))return;
    const p=projects.find(x=>x.id==='P-13217'); const real=p?.real||134200;
    const variance=real-p.budget; const margin=((p.sale-real)/p.sale*100).toFixed(1);
    const box=document.createElement('div'); box.className='atlas-project-decision';
    box.innerHTML=`<div><span class="eyebrow">Lectura ejecutiva</span><strong>El proyecto ya consume ${fmt(variance)} más de lo presupuestado.</strong><small>Margen actual ${margin}% · línea base vendida 30.1%. La prioridad es identificar compras, material y horas fuera del presupuesto.</small></div><div class="atlas-decision-actions"><button class="ghost" data-action="buy">Revisar compras</button><button class="primary" data-action="profit">Ver rentabilidad →</button></div>`;
    const anchor=$('.metric-strip',content)||content.firstElementChild; anchor?.insertAdjacentElement('afterend',box);
    $('[data-action="buy"]',box).onclick=()=>go('compras');
    $('[data-action="profit"]',box).onclick=()=>{state.projectTab='Rentabilidad';render();};
  }

  function quoteDecision(){
    if(state.page!=='cotizaciones'||!state.quote||state.quote==='new')return;
    const content=$('#content'); if(!content||$('.atlas-quote-decision',content))return;
    const q=quotes.find(x=>x.id===state.quote); if(!q)return;
    const box=document.createElement('div');box.className='atlas-quote-decision';
    box.innerHTML=`<span>Antes de vender</span><strong>${q.margin>=30?'Margen dentro de política':'Margen por debajo de política'}</strong><small>${q.margin.toFixed(1)}% de margen · costo ${fmt(q.cost)} · venta ${fmt(q.sale)}. Esta cifra quedará congelada como línea base para medir la ejecución real.</small>`;
    const anchor=$('.metric-strip',content); anchor?.insertAdjacentElement('afterend',box);
  }

  function purchaseDecision(){
    if(state.page!=='compras')return;
    const content=$('#content');if(!content||$('.atlas-purchase-decision',content))return;
    const box=document.createElement('div');box.className='card panel atlas-purchase-decision';
    box.innerHTML=`<div class="panel-head"><div><span class="eyebrow">Control de abastecimiento</span><h3>Compra con impacto visible en proyecto</h3><p class="muted">No basta saber qué se compró: Dirección necesita saber para qué proyecto, contra qué presupuesto y qué falta por recibir.</p></div><span class="chip orange">2 partidas pendientes</span></div><div class="atlas-mini-metrics"><div><span>Proyecto</span><strong>P-13217</strong></div><div><span>OC</span><strong>#11113</strong></div><div><span>Recepción</span><strong>6 / 8 partidas</strong></div><div><span>Estado</span><strong>Parcial</strong></div></div>`;
    content.appendChild(box);
  }

  function laborDecision(){
    if(state.page!=='mano')return;
    const content=$('#content');if(!content||$('.atlas-labor-decision',content))return;
    const box=document.createElement('div');box.className='atlas-labor-decision';
    box.innerHTML=`<strong>La hora no sólo se registra: se costea.</strong><span>Cuando el técnico captura tiempo contra P-13217, Atlas actualiza el costo real y la rentabilidad que ve Dirección.</span>`;
    content.appendChild(box);
  }

  function safeButtons(){
    $$('#content button').forEach(btn=>{
      if(btn.onclick||btn.dataset.commercialSafe)return;
      const label=btn.textContent.trim(); if(!label)return;
      btn.dataset.commercialSafe='1';
      btn.onclick=()=>toast(`${label} · disponible en la versión operativa`);
    });
  }

  function markDemoReset(){
    const footer=$('.sidebar-footer');if(!footer||$('#atlas-reset-demo'))return;
    const b=document.createElement('button');b.id='atlas-reset-demo';b.className='atlas-reset-demo';b.textContent='↻ Reiniciar demo';
    b.onclick=()=>{ if(typeof atlasResetDemo==='function')atlasResetDemo(); else location.reload(); toast('Demo reiniciada'); };
    footer.appendChild(b);
  }

  function decorateCommercial(){ executiveStart();quoteDecision();projectDecision();purchaseDecision();laborDecision();safeButtons();markDemoReset(); }
  const base=window.atlasDecorate;
  window.atlasDecorate=function(){ if(typeof base==='function')base(); decorateCommercial(); };
  decorateCommercial();
})();

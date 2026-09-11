// Mejoras de interacción sobre el prototipo principal.
// Se cargan después de app.js para mantener el demo modular.

const atlasBaseRenderQuote = renderQuote;

function atlasEnhanceMaterials(){
  const q=state.quote;
  if(!q || q.step!==3) return;
  const table=document.querySelector('#qbody table');
  if(!table) return;

  const headRow=table.querySelector('thead tr');
  if(headRow && !headRow.querySelector('.atlas-actions-head')){
    const th=document.createElement('th');
    th.className='atlas-actions-head';
    th.textContent='Acciones';
    headRow.appendChild(th);
  }

  table.querySelectorAll('tbody tr').forEach((tr,i)=>{
    if(tr.querySelector('.remove-material')) return;
    const td=document.createElement('td');
    td.innerHTML=`<button class="ghost remove-material" data-i="${i}">Quitar</button>`;
    tr.appendChild(td);
  });

  const wrap=table.closest('.table-wrap');
  if(wrap && !document.querySelector('#material-adder')){
    const box=document.createElement('div');
    box.id='material-adder';
    box.className='note';
    box.style.marginTop='14px';
    box.innerHTML=`
      <strong>Agregar material del catálogo</strong>
      <div class="toolbar" style="margin-top:10px">
        <select id="material-catalog" class="select" style="min-width:360px">
          ${inventory.filter(x=>x.active).map(x=>`<option value="${x.id}">${x.model} · ${x.brand} · ${x.desc}</option>`).join('')}
        </select>
        <input id="material-add-qty" class="input" type="number" min="1" value="1" style="width:90px" title="Cantidad">
        <input id="material-add-markup" class="input" type="number" min="0" value="30" style="width:100px" title="% utilidad">
        <button id="add-material" class="primary">+ Agregar material</button>
      </div>
      <span class="muted">Si el modelo ya está en la cotización, Atlas suma la cantidad en lugar de duplicarlo.</span>`;
    wrap.insertAdjacentElement('afterend',box);
  }

  document.querySelectorAll('.remove-material').forEach(btn=>btn.onclick=()=>{
    const i=+btn.dataset.i;
    const item=q.materials[i];
    if(!item) return;
    if(confirm(`¿Quitar ${item.model} de esta cotización?`)){
      q.materials.splice(i,1);
      renderQuote();
    }
  });

  const add=document.querySelector('#add-material');
  if(add)add.onclick=()=>{
    const id=+document.querySelector('#material-catalog').value;
    const qty=Math.max(1,+document.querySelector('#material-add-qty').value||1);
    const markup=Math.max(0,+document.querySelector('#material-add-markup').value||0);
    const item=inventory.find(x=>x.id===id);
    if(!item) return;
    const existing=q.materials.find(x=>x.model===item.model);
    if(existing){
      existing.qty=+existing.qty+qty;
      existing.markup=markup;
    }else{
      q.materials.push({model:item.model,desc:item.desc,qty,cost:item.cost,markup,category:'No asignado'});
    }
    renderQuote();
  };
}

function atlasEnhanceLabor(){
  const q=state.quote;
  if(!q || q.step!==4) return;

  const save=document.querySelector('#save-labor');
  if(save) save.textContent=`+ Agregar ${state.laborDraft?.activity||'actividad'} al resumen`;

  document.querySelectorAll('.del-labor').forEach(btn=>{
    const td=btn.parentElement;
    const i=+btn.dataset.i;
    if(td && !td.querySelector('.edit-labor')){
      const edit=document.createElement('button');
      edit.className='ghost edit-labor';
      edit.dataset.i=String(i);
      edit.textContent='Editar';
      edit.style.marginRight='6px';
      td.insertBefore(edit,btn);
    }
    btn.textContent='Eliminar';
  });

  document.querySelectorAll('.edit-labor').forEach(btn=>btn.onclick=()=>{
    const i=+btn.dataset.i;
    const row=q.laborRows[i];
    if(!row) return;
    state.laborDraft={...row};
    q.laborRows.splice(i,1);
    renderQuote();
    document.querySelector('#qbody')?.scrollIntoView({behavior:'smooth',block:'start'});
  });

  const summary=document.querySelector('#qbody .table-wrap:last-child');
  if(summary && !document.querySelector('#new-labor-draft')){
    const actions=document.createElement('div');
    actions.className='toolbar';
    actions.style.marginTop='12px';
    actions.innerHTML=`<button id="new-labor-draft" class="ghost">+ Nueva actividad</button><span class="muted">Editar carga la actividad nuevamente en el formulario superior. Eliminar la quita de la cotización.</span>`;
    summary.insertAdjacentElement('afterend',actions);
    document.querySelector('#new-labor-draft').onclick=()=>{
      state.laborDraft=null;
      renderQuote();
      document.querySelector('#qbody')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
  }
}

renderQuote=function(){
  atlasBaseRenderQuote();
  atlasEnhanceMaterials();
  atlasEnhanceLabor();
};

// Si el usuario ya estaba dentro de una cotización al cargar este parche,
// vuelve a pintar la vista con los controles nuevos.
if(state.quote && state.page==='cotizaciones') renderQuote();

// Prospect-facing polish for Atlas Integrador Demo.
// Keeps the prototype static while making the commercial story feel complete.

state.client = state.client || null;

function atlasClientDetail(client){
  const relatedQuotes=quotes.filter(q=>q.client===client.name);
  const relatedProjects=projects.filter(p=>p.client===client.name);
  const openQuotes=relatedQuotes.filter(q=>q.status!=='Aprobada').length;
  setHead(client.name,'Cliente','');
  document.querySelector('#content').innerHTML=`
    <div class="project-header">
      <div>
        <h2>${client.name}</h2>
        <div class="project-meta">${chip(client.status,client.status==='Activo'?'green':'blue')} ${chip(client.id)} ${chip(client.contact,'blue')}</div>
        <p class="muted client-contact">${client.phone} · Cuenta comercial demostrativa</p>
      </div>
      <button class="secondary" id="atlas-client-back">← Volver</button>
    </div>
    <div class="metric-strip">
      ${kpi('Venta histórica',fmt(client.sales),'Acumulado demo')}
      ${kpi('Proyectos',String(client.projects),'Historial de ejecución')}
      ${kpi('Cotizaciones',String(client.quotes),openQuotes+' en seguimiento')}
      ${kpi('Último movimiento','13 sep','Actividad comercial')}
    </div>
    <div class="grid-2">
      <div class="card panel">
        <h3>Actividad de la cuenta</h3>
        <div class="timeline">
          <div><strong>Cotización actualizada</strong><span>13 sep · Ingeniería ajustó alcance y margen</span></div>
          <div><strong>Seguimiento comercial</strong><span>11 sep · Cliente solicitó propuesta final</span></div>
          <div><strong>Proyecto en ejecución</strong><span>10 sep · Material surtido a técnico</span></div>
          <div><strong>Recepción parcial</strong><span>08 sep · Compra ligada al proyecto</span></div>
        </div>
      </div>
      <div class="card panel">
        <h3>Próximas acciones</h3>
        <div class="action-list">
          <div class="action-item"><div><strong>Seguimiento de propuesta</strong><span>Responsable: Comercial</span></div>${chip('Hoy','orange')}</div>
          <div class="action-item"><div><strong>Validar material pendiente</strong><span>Responsable: Compras</span></div>${chip('Abierto','blue')}</div>
          <div class="action-item"><div><strong>Revisión de rentabilidad</strong><span>Responsable: Dirección</span></div>${chip('Control','green')}</div>
        </div>
        <div class="client-actions">
          <button class="ghost" data-atlas-toast="Actividad registrada en el demo">Registrar seguimiento</button>
          <button class="primary" id="atlas-client-quote">Nueva cotización</button>
        </div>
      </div>
    </div>
    <div class="card panel client-related">
      <h3>Negocio relacionado</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Folio</th><th>Proyecto</th><th>Importe</th><th>Estado</th></tr></thead><tbody>
        ${relatedQuotes.map(q=>`<tr class="clickable" data-quote="${q.id}"><td>Cotización</td><td><strong>${q.id}</strong></td><td>${q.name}</td><td>${fmt(q.sale)}</td><td>${chip(q.status,q.status==='Aprobada'?'green':'blue')}</td></tr>`).join('')}
        ${relatedProjects.map(p=>`<tr class="clickable" data-project="${p.id}"><td>Proyecto</td><td><strong>${p.id}</strong></td><td>${p.name}</td><td>${fmt(p.sale)}</td><td>${chip(p.status,'green')}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;

  document.querySelector('#atlas-client-back').onclick=()=>{state.client=null;render();};
  document.querySelector('#atlas-client-quote').onclick=()=>{state.client=null;state.page='cotizaciones';state.quote='new';render();};
  document.querySelectorAll('[data-quote]').forEach(el=>el.onclick=()=>{state.client=null;state.page='cotizaciones';state.quote=el.dataset.quote;render();});
  document.querySelectorAll('[data-project]').forEach(el=>el.onclick=()=>{state.client=null;state.page='proyectos';state.project=el.dataset.project;render();});
  atlasWireToastButtons();
}

function atlasNewClientModal(){
  document.querySelector('#atlas-client-modal')?.remove();
  const overlay=document.createElement('div');
  overlay.id='atlas-client-modal';overlay.className='atlas-tour-overlay';
  overlay.innerHTML=`<div class="atlas-tour-card atlas-form-card">
    <div class="atlas-tour-top"><span>Nuevo cliente · Demo</span><button class="atlas-tour-x">×</button></div>
    <h3>Alta de cuenta comercial</h3>
    <p>Ejemplo de los datos mínimos que conservaría Atlas antes de cotizar.</p>
    <div class="form-grid atlas-modal-grid">
      <label>Empresa<input class="input" value="Industria Ejemplo del Norte"></label>
      <label>Contacto<input class="input" value="Patricia López"></label>
      <label>Teléfono<input class="input" value="899 555 0199"></label>
      <label>Correo<input class="input" value="compras@industriaejemplo.mx"></label>
    </div>
    <div class="atlas-tour-actions"><button class="ghost atlas-cancel">Cancelar</button><button class="primary atlas-save">Guardar cliente</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('.atlas-tour-x').onclick=close;
  overlay.querySelector('.atlas-cancel').onclick=close;
  overlay.querySelector('.atlas-save').onclick=()=>{close();atlasToast('Cliente creado en modo demostración');};
}

function atlasWireToastButtons(){
  document.querySelectorAll('[data-atlas-toast]').forEach(b=>b.onclick=()=>atlasToast(b.dataset.atlasToast));
}

function atlasEnhanceClients(){
  if(state.page!=='clientes')return;
  if(state.client){
    const c=clients.find(x=>x.id===state.client);
    if(c){atlasClientDetail(c);return;}
  }
  const content=document.querySelector('#content');
  if(!content)return;
  const toolbar=content.querySelector('.toolbar');
  if(toolbar&&!toolbar.querySelector('.client-funnel')){
    const tag=document.createElement('span');tag.className='client-funnel';tag.textContent='360° cliente: cotizaciones + proyectos + seguimiento';toolbar.appendChild(tag);
  }
  const rows=content.querySelectorAll('tbody tr');
  rows.forEach((row,i)=>{
    if(!clients[i])return;
    row.classList.add('clickable');row.title='Abrir vista 360° del cliente';
    row.onclick=()=>{state.client=clients[i].id;atlasClientDetail(clients[i]);};
  });
  const buttons=[...content.querySelectorAll('button')];
  const add=buttons.find(b=>b.textContent.trim()==='Nuevo cliente');
  if(add)add.onclick=atlasNewClientModal;
}

function atlasEnhanceReports(){
  if(state.page!=='reportes')return;
  const content=document.querySelector('#content');if(!content||content.querySelector('.atlas-exec-summary'))return;
  const summary=document.createElement('div');summary.className='card panel atlas-exec-summary';
  summary.innerHTML=`<div class="panel-head"><div><h3>Lectura ejecutiva</h3><p class="muted">Lo que Dirección debería poder decidir sin abrir hojas de cálculo.</p></div>${chip('Septiembre','blue')}</div>
    <div class="exec-insights">
      <div><span>Oportunidad</span><strong>$412k</strong><small>en cotizaciones activas</small></div>
      <div><span>Riesgo</span><strong>2</strong><small>proyectos con desviación de costo</small></div>
      <div><span>Abasto</span><strong>7</strong><small>OC pendientes o parciales</small></div>
      <div><span>Rentabilidad</span><strong>28.7%</strong><small>margen real cerrado</small></div>
    </div>
    <div class="note"><strong>Valor comercial:</strong> Atlas conecta ventas, compras, almacén y ejecución para que el margen deje de ser una estimación aislada.</div>`;
  content.prepend(summary);
}

function atlasEnhanceConfig(){
  if(state.page!=='config')return;
  const content=document.querySelector('#content');if(!content||content.querySelector('.atlas-config-readiness'))return;
  const card=document.createElement('div');card.className='card panel atlas-config-readiness';
  card.innerHTML=`<div class="panel-head"><div><h3>Adaptable a cada integrador</h3><p class="muted">El demo muestra el producto; la implementación se parametriza a la operación real.</p></div>${chip('Configurable','green')}</div>
    <div class="settings-list">
      <div><strong>Identidad de empresa</strong><span>Nombre, logotipo y datos comerciales.</span></div>
      <div><strong>Usuarios y roles</strong><span>Dirección, Comercial, Ingeniería, Compras y Almacén.</span></div>
      <div><strong>Reglas de margen</strong><span>Objetivos, autorizaciones y alertas por desviación.</span></div>
      <div><strong>Paqueterías de ingeniería</strong><span>Reglas de materiales recurrentes para acelerar presupuestos y reducir omisiones.</span></div>
    </div>`;
  content.appendChild(card);
}

const atlasSalesBaseDecorate=atlasDecorate;
atlasDecorate=function(){
  atlasSalesBaseDecorate();
  atlasEnhanceClients();
  atlasEnhanceReports();
  atlasEnhanceConfig();
  atlasWireToastButtons();
};

atlasDecorate();

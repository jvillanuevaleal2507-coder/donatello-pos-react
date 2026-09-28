/* Atlas Integrador canonical runtime R10 */


/* ===== app.js ===== */
const navItems=[['inicio','⌂','Inicio'],['dashboard','▥','Dashboard'],['clientes','◉','Clientes'],['cotizaciones','▤','Cotizaciones'],['proyectos','▦','Proyectos'],['inventario','◫','Inventario'],['compras','⇄','Compras'],['mano','⌁','Mano de obra'],['almacen','⬡','Almacén'],['reportes','▥','Reportes'],['config','⚙','Configuración']];
const state={page:'inicio',role:'Dirección',quote:null,quoteSearch:'',quoteStatus:'Todos',clientSearch:'',projectSearch:'',projectYear:'2026',laborDraft:null,configTab:'personal'};
const clients=[
{id:1,name:'Cliente Industrial Norte',rfc:'CIN010203AA1',contact:'Carlos Méndez',closed:14},{id:2,name:'Manufactura Delta',rfc:'MDE040506BB2',contact:'Laura Garza',closed:8},{id:3,name:'Alimentos del Norte',rfc:'ANO070809CC3',contact:'Miguel Treviño',closed:5},{id:4,name:'Empaques Río Bravo',rfc:'ERB101112DD4',contact:'Andrea Salinas',closed:11}
];
const personnel=[
{id:1,name:'Técnico 01',position:'Técnico instalador',hour:110,day:880,satDay:1320,sunDay:1760,active:true},{id:2,name:'Técnico 02',position:'Técnico instalador',hour:115,day:920,satDay:1380,sunDay:1840,active:true},{id:3,name:'Ing. Proyecto',position:'Ingeniero',hour:220,day:1760,satDay:2640,sunDay:3520,active:true},{id:4,name:'Ayudante 01',position:'Ayudante',hour:80,day:640,satDay:960,sunDay:1280,active:true}
];
const activityCatalog=['CANALIZACIÓN','CABLEADO CÁMARAS','CABLEADO FIBRA ÓPTICA','INSTALACIÓN CCTV','CONFIGURACIÓN Y PUESTA EN MARCHA'];
const inventory=[
{id:1,model:'DS-2CD2143G2-I',brand:'Hikvision',desc:'Cámara IP domo 4 MP',stock:0,min:4,loc:'A-02',cost:1850,status:'Crítico',history:true,active:true},{id:2,model:'UTP-CAT6-BL',brand:'Panduit',desc:'Cable Cat6 azul caja 305 m',stock:7,min:3,loc:'B-01',cost:2890,status:'OK',history:true,active:true},{id:3,model:'RG-RAP2266',brand:'Ruijie',desc:'Access Point WiFi 6 AX3000',stock:3,min:2,loc:'C-04',cost:2680,status:'OK',history:false,active:true},{id:4,model:'DS-K1T341AMF',brand:'Hikvision',desc:'Terminal acceso facial',stock:1,min:2,loc:'A-06',cost:4220,status:'Bajo',history:true,active:true}
];
const projects=[
{id:'P-13217',client:'Cliente Industrial Norte',name:'CCTV Nave 3',owner:'Ing. Ramiro',status:'En ejecución',sale:184500,budget:128900,real:134200,margin:27.3,po:'OC-45821',alert:'Costo +4.1%',year:2026},{id:'P-13244',client:'Manufactura Delta',name:'Control de acceso planta',owner:'Ing. Celeste',status:'Aprobado',sale:96200,budget:68100,real:0,margin:29.2,po:'PO-9918',alert:'Por surtir',year:2026},{id:'P-13251',client:'Alimentos del Norte',name:'Red WiFi almacén',owner:'Ing. Alfredo',status:'En ejecución',sale:74200,budget:49500,real:51700,margin:30.3,po:'OC-11093',alert:'Material extra',year:2026}
];
const quotes=[
{id:'COT-2026-0046',clientId:2,name:'Control de acceso almacén',status:'Enviada',date:'08 sep 2026',owner:'Ing. Celeste',revision:0,total:96200},{id:'COT-2026-0045',clientId:1,name:'CCTV acceso norte',status:'Pendiente',date:'05 sep 2026',owner:'Ing. Ramiro',revision:1,total:184500},{id:'COT-2026-0044',clientId:3,name:'Enlace de fibra',status:'Perdida',date:'31 ago 2026',owner:'Ing. Alfredo',revision:0,total:74200}
];
let folioConfig={quoteTemplate:'COT-{AÑO}-{0000}',projectTemplate:'P-{00000}',nextQuote:47,nextProject:13266};
const fmt=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(n)||0);
const money=fmt;
function chip(text,color='gray'){return `<span class="chip ${color}">${text}</span>`}
function setHead(title,eye='Atlas Integrador',action=''){document.querySelector('#page-title').textContent=title;document.querySelector('#eyebrow').textContent=eye;const b=document.querySelector('#primary-action');b.textContent=action;b.style.display=action?'block':'none';b.onclick=null}
function nav(){document.querySelector('#nav').innerHTML=navItems.map(([id,ico,label])=>`<button class="nav-btn ${state.page===id?'active':''}" data-page="${id}">${ico} <span>${label}</span></button>`).join('');document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;state.quote=null;render()})}
function nextQuoteFolio(){return folioConfig.quoteTemplate.replace('{AÑO}','2026').replace('{MES}','09').replace('{0000}',String(folioConfig.nextQuote).padStart(4,'0')).replace('{000000}',String(folioConfig.nextQuote).padStart(6,'0'))}
function materialPrice(x){return +x.cost*(1+(+x.markup||0)/100)}
function laborRowCost(x){const p=personnel.find(p=>p.id===+x.personId)||personnel[0];if(x.mode==='hora')return (+x.normalQty||0)*p.hour+(+x.satQty||0)*(p.hour*1.5)+(+x.sunQty||0)*(p.hour*2);return (+x.normalQty||0)*p.day+(+x.satQty||0)*p.satDay+(+x.sunQty||0)*p.sunDay}
function quoteTotals(q=state.quote){if(!q)return{mc:0,ms:0,lc:0,ls:0,ind:0,subtotal:0,iva:0,isr:0,total:0,margin:0};let mc=q.materials.reduce((s,x)=>s+x.qty*x.cost,0),ms=q.materials.reduce((s,x)=>s+x.qty*materialPrice(x),0),lc=q.laborRows.reduce((s,x)=>s+laborRowCost(x),0),ls=q.laborRows.reduce((s,x)=>s+laborRowCost(x)*(1+x.markup/100),0),base=mc+lc,ind=lc*q.indirect.safety+lc*q.indirect.tools+base*q.indirect.general+base*q.indirect.field+base*q.indirect.finance+q.truckDays*q.truckDaily,subtotal=ms+ls+ind,iva=subtotal*(q.ivaRate/100),isr=q.retainISR?subtotal*(q.isrRate/100):0,total=subtotal+iva-isr,cost=mc+lc;return{mc,ms,lc,ls,ind,subtotal,iva,isr,total,margin:subtotal?(subtotal-cost)/subtotal*100:0}}
function newQuote(clientId=null){state.quote={id:nextQuoteFolio(),revision:0,status:'Borrador',step:clientId?2:1,clientId,name:'',currency:'MXN',materials:[{model:'DS-2CD2143G2-I',desc:'Cámara IP domo 4 MP',qty:8,cost:1850,markup:35,category:'VIDEO VIGILANCIA'},{model:'UTP-CAT6-BL',desc:'Cable Cat6 caja 305 m',qty:2,cost:2890,markup:30,category:'VIDEO VIGILANCIA'}],laborRows:[],indirect:{safety:.02,tools:.03,general:.10,field:.03,finance:.03},truckDays:2,truckDaily:250,directedTo:'',payment:'Contado',delivery:'15 días hábiles',validity:'15 días',ivaRate:16,retainISR:false,isrRate:0,scope:'',materialPresentation:'detail',laborPresentation:'detail',commercialReady:false};state.page='cotizaciones';renderQuote()}
function inicio(){setHead('Inicio',state.role,'Nueva cotización');document.querySelector('#primary-action').onclick=()=>newQuote();return `<div class="kpi-grid"><div class="card kpi"><div class="label">Cotizaciones pendientes</div><div class="value">6</div><div class="delta">2 con más de 7 días</div></div><div class="card kpi"><div class="label">Proyectos activos</div><div class="value">18</div><div class="delta">4 requieren atención</div></div><div class="card kpi"><div class="label">Utilidad estimada mes</div><div class="value">$486k</div><div class="delta">31.4% margen</div></div><div class="card kpi"><div class="label">Utilidad real cerrada</div><div class="value">$392k</div><div class="delta">28.7% margen real</div></div></div><div class="grid-2"><div class="card panel"><h3>Seguimiento comercial</h3><div class="action-list"><div class="action-item"><div><strong>COT-2026-0045</strong><span>CCTV acceso norte · 6 días</span></div>${chip('Pendiente','orange')}</div><div class="action-item"><div><strong>COT-2026-0046</strong><span>Control de acceso almacén · 3 días</span></div>${chip('Enviada','blue')}</div></div></div><div class="card panel"><h3>Atención operativa</h3><div class="action-list"><div class="action-item"><div><strong>P-13217</strong><span>Costo real +4.1% vs presupuesto</span></div>${chip('Revisar','orange')}</div><div class="action-item"><div><strong>Inventario crítico</strong><span>1 artículo en existencia cero</span></div>${chip('Inventario','red')}</div></div></div></div>`}
function dashboard(){
 setHead('Dashboard','Dirección','');
 const totalSales=projects.reduce((s,p)=>s+(+p.sale||0),0);
 const active=projects.filter(p=>p.status==='En ejecución'||p.status==='Aprobado').length;
 const projectedCost=projects.reduce((s,p)=>s+(+p.real||+p.budget||0),0);
 const projectedMargin=totalSales?((totalSales-projectedCost)/totalSales*100):0;
 const openQuotes=quotes.filter(q=>q.status!=='Perdida'&&q.status!=='Aceptada').length;
 const quoteValue=quotes.filter(q=>q.status!=='Perdida').reduce((s,q)=>s+(+q.total||0),0);
 return `<div class="project-header"><div><p class="eyebrow">Resultados ejecutivos</p><h2 style="margin:0 0 6px">Control económico de la operación</h2><p class="muted" style="margin:0">Una lectura rápida de venta, costo y proyectos que requieren atención.</p></div>${chip('Dirección','blue')}</div>
 <div class="kpi-grid">
  <div class="card kpi"><div class="label">Venta en cartera</div><div class="value">${fmt(totalSales)}</div><div class="delta">${active} proyectos activos</div></div>
  <div class="card kpi"><div class="label">Costo real / proyectado</div><div class="value">${fmt(projectedCost)}</div><div class="delta">Contra proyectos actuales</div></div>
  <div class="card kpi"><div class="label">Margen real / proyectado</div><div class="value">${projectedMargin.toFixed(1)}%</div><div class="delta">Lectura consolidada</div></div>
  <div class="card kpi"><div class="label">Cotizaciones abiertas</div><div class="value">${openQuotes}</div><div class="delta">${fmt(quoteValue)} en seguimiento</div></div>
 </div>
 <div class="grid-2">
  <div class="card panel"><h3>Proyectos que requieren atención</h3><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Responsable</th><th>Venta</th><th>Margen</th><th>Alerta</th></tr></thead><tbody>${projects.map(p=>{const cost=+p.real||+p.budget||0;const margin=p.sale?((p.sale-cost)/p.sale*100):0;return `<tr><td><strong>${p.id}</strong><br><span class="muted">${p.name}</span></td><td>${p.owner}</td><td>${fmt(p.sale)}</td><td>${margin.toFixed(1)}%</td><td>${chip(p.alert||'Sin alerta',(p.alert||'').includes('+')||(p.alert||'').toLowerCase().includes('extra')?'orange':'blue')}</td></tr>`}).join('')}</tbody></table></div></div>
  <div class="card panel"><h3>Lectura de Dirección</h3><div class="action-list"><div class="action-item"><div><strong>P-13217</strong><span>Costo real por arriba del presupuesto.</span></div>${chip('Revisar','orange')}</div><div class="action-item"><div><strong>Abastecimiento</strong><span>Hay órdenes con recepción parcial o pendiente.</span></div>${chip('Compras','blue')}</div><div class="action-item"><div><strong>Seguimiento comercial</strong><span>${openQuotes} cotizaciones siguen abiertas.</span></div>${chip('Comercial','blue')}</div></div></div>
 </div>`;
}
function clientes(){setHead('Clientes','Comercial','Nueva cotización');document.querySelector('#primary-action').onclick=()=>newQuote();let q=state.clientSearch.toLowerCase(),rows=clients.filter(c=>!q||[c.name,c.rfc,c.contact].some(v=>v.toLowerCase().includes(q)));setTimeout(()=>{const s=document.querySelector('#client-search');if(s)s.oninput=e=>{state.clientSearch=e.target.value;render()};document.querySelectorAll('.qclient').forEach(b=>b.onclick=()=>newQuote(+b.dataset.id))},0);return `<div class="toolbar"><input id="client-search" class="input" style="min-width:320px" placeholder="Buscar cliente, RFC o contacto" value="${state.clientSearch}"></div><div class="card panel"><table class="table"><thead><tr><th>Cliente</th><th>RFC</th><th>Contacto</th><th>Proyectos</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr><td><strong>${c.name}</strong></td><td>${c.rfc}</td><td>${c.contact}</td><td>${c.closed}</td><td><button class="ghost qclient" data-id="${c.id}">Cotizar</button></td></tr>`).join('')}</tbody></table></div>`}
function cotizaciones(){if(state.quote){renderQuote();return ''}setHead('Cotizaciones','Comercial','Nueva cotización');document.querySelector('#primary-action').onclick=()=>newQuote();let q=state.quoteSearch.toLowerCase(),rows=quotes.filter(x=>{let c=clients.find(c=>c.id===x.clientId);return(state.quoteStatus==='Todos'||x.status===state.quoteStatus)&&(!q||[x.id,x.name,c?.name,x.owner].some(v=>String(v).toLowerCase().includes(q)))});setTimeout(()=>{document.querySelector('#quote-search').oninput=e=>{state.quoteSearch=e.target.value;render()};document.querySelector('#quote-status').onchange=e=>{state.quoteStatus=e.target.value;render()};document.querySelectorAll('.open-quote').forEach(b=>b.onclick=()=>alert('En la versión conectada abrirá la revisión guardada con Ver / Editar / PDF / Seguimiento / Aceptar cotización.'))},0);return `<div class="toolbar"><input id="quote-search" class="input" style="min-width:320px" value="${state.quoteSearch}" placeholder="Buscar folio, cliente, proyecto o promotor"><select id="quote-status" class="select">${['Todos','Borrador','Enviada','Pendiente','Aceptada','Perdida'].map(s=>`<option ${s===state.quoteStatus?'selected':''}>${s}</option>`).join('')}</select><select class="select"><option>2026</option><option>2025</option></select></div><div class="card panel"><table class="table"><thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th>Rev.</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>${rows.map(x=>{let c=clients.find(c=>c.id===x.clientId);return `<tr><td><strong>${x.id}</strong></td><td>${c?.name||''}</td><td>${x.name}</td><td>${x.date}</td><td>${x.revision}</td><td>${chip(x.status,x.status==='Perdida'?'red':x.status==='Pendiente'?'orange':'blue')}</td><td>${fmt(x.total)}</td><td><button class="ghost open-quote">Abrir</button></td></tr>`}).join('')}</tbody></table></div><div class="note" style="margin-top:14px">Una cotización puede permanecer aquí semanas o meses. El proyecto nace solamente cuando la cotización es aceptada y se registra su autorización.</div>`}
function renderQuote(){nav();let q=state.quote,c=clients.find(x=>x.id===q.clientId),t=quoteTotals();setHead(q.id,'Cotización · Rev. '+q.revision,'');document.querySelector('#content').innerHTML=`<div class="tabs">${['Cliente','General','Materiales','Mano de obra','Indirectos','Resumen','Cotizar'].map((x,i)=>`<button class="tab qtab ${q.step===i+1?'active':''}" data-step="${i+1}">${i+1} ${x}</button>`).join('')}</div><div class="card panel" id="qbody"></div><div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button class="ghost" id="qclose">Cerrar</button>${q.step>1?'<button class="ghost" id="qprev">← Anterior</button>':''}${q.step<7?'<button class="primary" id="qnext">Continuar →</button>':''}</div>`;const b=document.querySelector('#qbody');
if(q.step===1)b.innerHTML=`<h3>Selecciona el cliente</h3><div class="action-list">${clients.map(x=>`<div class="action-item"><div><strong>${x.name}</strong><span>${x.rfc} · ${x.contact}</span></div><button class="primary pick-client" data-id="${x.id}">Seleccionar</button></div>`).join('')}</div>`;
if(q.step===2)b.innerHTML=`<h3>Datos generales</h3><div class="toolbar"><input id="qname" class="input" style="min-width:360px" value="${q.name}" placeholder="Descripción del proyecto"><select id="qcur" class="select"><option ${q.currency==='MXN'?'selected':''}>MXN</option><option ${q.currency==='USD'?'selected':''}>USD</option></select></div><div class="note"><strong>Folio:</strong> ${q.id} · <strong>Cliente:</strong> ${c?.name||'Pendiente'}</div>`;
if(q.step===3)b.innerHTML=`<h3>Materiales</h3><p class="muted">Costo actual del catálogo + utilidad por partida. Al aprobarse, la revisión conserva estos valores históricos.</p><div class="table-wrap"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Cant.</th><th>Costo</th><th>% utilidad</th><th>P. cliente</th><th>Importe</th></tr></thead><tbody>${q.materials.map((x,i)=>`<tr><td><strong>${x.model}</strong></td><td>${x.desc}</td><td><input class="input mq" data-i="${i}" type="number" value="${x.qty}" style="width:70px"></td><td>${fmt(x.cost)}</td><td><input class="input mm" data-i="${i}" type="number" value="${x.markup}" style="width:80px"></td><td>${fmt(materialPrice(x))}</td><td><strong>${fmt(x.qty*materialPrice(x))}</strong></td></tr>`).join('')}</tbody></table></div>`;
if(q.step===4){let d=state.laborDraft||{activity:activityCatalog[0],category:'VIDEO VIGILANCIA',personId:personnel[0].id,mode:'día',normalQty:1,satQty:0,sunQty:0,markup:70};state.laborDraft=d;let p=personnel.find(x=>x.id===+d.personId),cost=laborRowCost(d),sale=cost*(1+d.markup/100);b.innerHTML=`<h3>Mano de obra presupuestada</h3><p class="muted">Selecciona una actividad del catálogo, asígnala al alcance y después agrega recursos por día u hora. Día queda como modo predeterminado.</p><div class="note"><div class="toolbar"><select id="la" class="select">${activityCatalog.map(x=>`<option ${x===d.activity?'selected':''}>${x}</option>`).join('')}</select><select id="lcat" class="select"><option>VIDEO VIGILANCIA</option><option>CONTROL DE ACCESO</option><option>REDES</option><option>FIBRA ÓPTICA</option><option>No asignado</option></select><select id="lp" class="select">${personnel.filter(x=>x.active).map(x=>`<option value="${x.id}" ${x.id===+d.personId?'selected':''}>${x.name} · ${x.position}</option>`).join('')}</select><select id="lm" class="select"><option value="día" ${d.mode==='día'?'selected':''}>Por día</option><option value="hora" ${d.mode==='hora'?'selected':''}>Por hora</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Recurso</th><th>% utilidad</th><th>Cantidad</th><th>Costo empresa</th><th>Total cliente</th></tr></thead><tbody><tr><td>Normal</td><td>${p.name}</td><td><input id="lmk" class="input" type="number" value="${d.markup}" style="width:80px"></td><td><input id="ln" class="input" type="number" value="${d.normalQty}" style="width:75px"></td><td rowspan="3"><strong>${fmt(cost)}</strong></td><td rowspan="3"><strong>${fmt(sale)}</strong></td></tr><tr><td>Sábado</td><td>${p.position}</td><td></td><td><input id="ls" class="input" type="number" value="${d.satQty}" style="width:75px"></td></tr><tr><td>Domingo</td><td>${d.mode==='día'?'Tarifa especial día':'Tarifa extra hora'}</td><td></td><td><input id="ld" class="input" type="number" value="${d.sunQty}" style="width:75px"></td></tr></tbody></table></div><button class="primary" id="save-labor">Guardar mano de obra para ${d.activity}</button></div><h3 style="margin-top:22px">Resumen de actividades</h3><div class="table-wrap"><table class="table"><thead><tr><th>Asignado a</th><th>Actividad</th><th>Recurso</th><th>Modo</th><th>% utilidad</th><th>Costo</th><th>Cliente</th><th></th></tr></thead><tbody>${q.laborRows.length?q.laborRows.map((x,i)=>{let pp=personnel.find(p=>p.id===+x.personId);return `<tr><td>${x.category}</td><td><strong>${x.activity}</strong></td><td>${pp?.name}</td><td>${x.mode}</td><td>${x.markup}%</td><td>${fmt(laborRowCost(x))}</td><td><strong>${fmt(laborRowCost(x)*(1+x.markup/100))}</strong></td><td><button class="ghost del-labor" data-i="${i}">Eliminar</button></td></tr>`}).join(''):'<tr><td colspan="8" class="muted">Todavía no has agregado mano de obra a esta cotización.</td></tr>'}</tbody></table></div>`}
if(q.step===5){let mo=t.lc,base=t.mc+t.lc,rows=[['safety','Seguridad, Protección e Higiene',mo,'MO'],['tools','Herramienta menor',mo,'MO'],['general','Indirectos',base,'MO + materiales'],['field','Indirectos de campo',base,'MO + materiales'],['finance','Financiamiento',base,'MO + materiales']];b.innerHTML=`<h3>Gastos indirectos</h3><p class="muted">La base se calcula automáticamente; aquí únicamente se modifica el factor.</p><table class="table"><thead><tr><th>Concepto</th><th>Base calculada</th><th>Factor</th><th>Total cliente</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[1]}</td><td><strong>${fmt(r[2])}</strong><br><span class="muted">${r[3]}</span></td><td><input class="input ifactor" data-key="${r[0]}" type="number" step="0.01" value="${q.indirect[r[0]]}" style="width:100px"></td><td>${fmt(r[2]*q.indirect[r[0]])}</td></tr>`).join('')}<tr><td><strong>Camioneta</strong></td><td>Días <input id="truckd" class="input" type="number" value="${q.truckDays}" style="width:75px"></td><td>Costo/día <input id="truckc" class="input" type="number" value="${q.truckDaily}" style="width:100px"></td><td>${fmt(q.truckDays*q.truckDaily)}</td></tr></tbody></table>`}
if(q.step===6)b.innerHTML=`<h3>Resumen interno</h3><div class="metric-strip"><div class="metric-box"><small>Materiales</small><strong>${fmt(t.ms)}</strong></div><div class="metric-box"><small>Mano de obra</small><strong>${fmt(t.ls)}</strong></div><div class="metric-box"><small>Indirectos</small><strong>${fmt(t.ind)}</strong></div><div class="metric-box"><small>Margen estimado</small><strong>${t.margin.toFixed(1)}%</strong></div></div><div class="note" style="margin-top:16px"><strong>Subtotal comercial:</strong> ${fmt(t.subtotal)}. Aquí se guarda la cotización; todavía NO se crea un proyecto ni se solicita OC.</div><div class="toolbar" style="margin-top:16px"><button class="primary" id="save-quote">Guardar cotización</button><button class="ghost" id="go-commercial">Cotizar / preparar para cliente</button></div>`;
if(q.step===7)b.innerHTML=`<h3>Preparación comercial</h3><div class="grid-2"><div><label>Dirigido a</label><input id="directed" class="input" value="${q.directedTo}" placeholder="Nombre del contacto" style="width:100%"></div><div><label>Condiciones de pago</label><select id="payment" class="select" style="width:100%"><option ${q.payment==='Contado'?'selected':''}>Contado</option><option ${q.payment==='Crédito'?'selected':''}>Crédito</option></select></div><div><label>Tiempo de entrega</label><input id="delivery" class="input" value="${q.delivery}" style="width:100%"></div><div><label>Vigencia</label><input id="validity" class="input" value="${q.validity}" style="width:100%"></div><div><label>IVA</label><select id="iva" class="select" style="width:100%"><option value="16" ${q.ivaRate===16?'selected':''}>16%</option><option value="8" ${q.ivaRate===8?'selected':''}>8%</option></select></div><div><label>Retener ISR</label><select id="isr" class="select" style="width:100%"><option value="no" ${!q.retainISR?'selected':''}>No</option><option value="si" ${q.retainISR?'selected':''}>Sí · tasa configurada</option></select></div><div><label>Materiales en PDF</label><select id="matpres" class="select" style="width:100%"><option value="detail" ${q.materialPresentation==='detail'?'selected':''}>Detallado</option><option value="summary" ${q.materialPresentation==='summary'?'selected':''}>Resumido / ocultar modelos</option></select></div><div><label>Mano de obra en PDF</label><select id="labpres" class="select" style="width:100%"><option value="detail" ${q.laborPresentation==='detail'?'selected':''}>Detallada</option><option value="summary" ${q.laborPresentation==='summary'?'selected':''}>Resumida</option></select></div></div><label style="display:block;margin-top:14px">Alcance del proyecto / comentarios</label><textarea id="scope" class="input" style="width:100%;min-height:100px">${q.scope}</textarea><div class="metric-strip" style="margin-top:16px"><div class="metric-box"><small>Subtotal</small><strong>${fmt(t.subtotal)}</strong></div><div class="metric-box"><small>IVA ${q.ivaRate}%</small><strong>${fmt(t.iva)}</strong></div><div class="metric-box"><small>MO comercial</small><strong>${fmt(t.ls)}</strong></div><div class="metric-box"><small>Total</small><strong>${fmt(t.total)}</strong></div></div><div class="toolbar" style="margin-top:16px"><button class="primary" id="pdf-btn">Descargar PDF</button><button class="ghost" id="mark-sent">Guardar como enviada</button></div><div class="note" style="margin-top:12px">Folio visible configurable por empresa: <strong>${q.id}</strong>. El sistema conservará además un ID interno estable, listo para representar en código de barras o QR cuando se habilite operación con scanner.</div>`;
bindQuote();}
function bindQuote(){let q=state.quote;document.querySelectorAll('.qtab').forEach(x=>x.onclick=()=>{q.step=+x.dataset.step;renderQuote()});document.querySelector('#qclose').onclick=()=>{state.quote=null;state.page='cotizaciones';render()};let p=document.querySelector('#qprev');if(p)p.onclick=()=>{q.step--;renderQuote()};let n=document.querySelector('#qnext');if(n)n.onclick=()=>{if(q.step===2){q.name=document.querySelector('#qname').value||'Proyecto nuevo';q.currency=document.querySelector('#qcur').value}if(!q.clientId)return alert('Selecciona un cliente');q.step++;renderQuote()};document.querySelectorAll('.pick-client').forEach(x=>x.onclick=()=>{q.clientId=+x.dataset.id;q.step=2;renderQuote()});document.querySelectorAll('.mq').forEach(x=>x.onchange=e=>{q.materials[+e.target.dataset.i].qty=+e.target.value;renderQuote()});document.querySelectorAll('.mm').forEach(x=>x.onchange=e=>{q.materials[+e.target.dataset.i].markup=+e.target.value;renderQuote()});
if(q.step===4){['la','lcat','lp','lm','lmk','ln','ls','ld'].forEach(id=>{let el=document.querySelector('#'+id);if(el)el.onchange=e=>{let d=state.laborDraft;if(id==='la')d.activity=e.target.value;if(id==='lcat')d.category=e.target.value;if(id==='lp')d.personId=+e.target.value;if(id==='lm')d.mode=e.target.value;if(id==='lmk')d.markup=+e.target.value;if(id==='ln')d.normalQty=+e.target.value;if(id==='ls')d.satQty=+e.target.value;if(id==='ld')d.sunQty=+e.target.value;renderQuote()}});document.querySelector('#save-labor').onclick=()=>{q.laborRows.push({...state.laborDraft});state.laborDraft=null;renderQuote()};document.querySelectorAll('.del-labor').forEach(x=>x.onclick=()=>{q.laborRows.splice(+x.dataset.i,1);renderQuote()})}
document.querySelectorAll('.ifactor').forEach(x=>x.onchange=e=>{q.indirect[e.target.dataset.key]=+e.target.value;renderQuote()});let td=document.querySelector('#truckd');if(td)td.onchange=e=>{q.truckDays=+e.target.value;renderQuote()};let tc=document.querySelector('#truckc');if(tc)tc.onchange=e=>{q.truckDaily=+e.target.value;renderQuote()};let save=document.querySelector('#save-quote');if(save)save.onclick=()=>{if(!q.name)q.name='Proyecto nuevo';if(!quotes.some(x=>x.id===q.id)){quotes.unshift({id:q.id,clientId:q.clientId,name:q.name,status:'Borrador',date:'11 sep 2026',owner:'Usuario actual',revision:q.revision,total:quoteTotals().total});folioConfig.nextQuote++}alert('Cotización guardada en la demo. Aún no existe proyecto.')};let gc=document.querySelector('#go-commercial');if(gc)gc.onclick=()=>{q.step=7;renderQuote()};
if(q.step===7){['directed','payment','delivery','validity','iva','isr','matpres','labpres','scope'].forEach(id=>{let el=document.querySelector('#'+id);if(el)el.onchange=e=>{if(id==='directed')q.directedTo=e.target.value;if(id==='payment')q.payment=e.target.value;if(id==='delivery')q.delivery=e.target.value;if(id==='validity')q.validity=e.target.value;if(id==='iva')q.ivaRate=+e.target.value;if(id==='isr')q.retainISR=e.target.value==='si';if(id==='matpres')q.materialPresentation=e.target.value;if(id==='labpres')q.laborPresentation=e.target.value;if(id==='scope')q.scope=e.target.value;renderQuote()}});document.querySelector('#pdf-btn').onclick=()=>atlasQuotePdf();document.querySelector('#mark-sent').onclick=()=>{q.status='Enviada';let row=quotes.find(x=>x.id===q.id);if(row){row.status='Enviada';row.total=quoteTotals().total}else quotes.unshift({id:q.id,clientId:q.clientId,name:q.name,status:'Enviada',date:'11 sep 2026',owner:'Usuario actual',revision:q.revision,total:quoteTotals().total});alert('Cotización marcada como enviada. La aceptación se hará después desde Cotizaciones.')}}}
function proyectos(){setHead('Proyectos','Operación','');let q=state.projectSearch.toLowerCase(),rows=projects.filter(p=>(state.projectYear==='Todos'||String(p.year)===state.projectYear)&&(!q||[p.id,p.client,p.name,p.owner,p.po].some(v=>String(v).toLowerCase().includes(q))));setTimeout(()=>{document.querySelector('#ps').oninput=e=>{state.projectSearch=e.target.value;render()};document.querySelector('#py').onchange=e=>{state.projectYear=e.target.value;render()}},0);return `<div class="toolbar"><input id="ps" class="input" value="${state.projectSearch}" placeholder="Buscar proyecto, cliente, promotor u OC"><select id="py" class="select"><option ${state.projectYear==='2026'?'selected':''}>2026</option><option>2025</option><option>Todos</option></select></div><div class="card panel"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Promotor</th><th>Estado</th><th>OC</th><th>Venta</th><th>Margen</th></tr></thead><tbody>${rows.map(p=>`<tr><td><strong>${p.id}</strong><br><span class="muted">${p.name}</span></td><td>${p.client}</td><td>${p.owner}</td><td>${chip(p.status,'green')}</td><td>${p.po}</td><td>${fmt(p.sale)}</td><td>${p.margin}%</td></tr>`).join('')}</tbody></table></div>`}
function inventario(){setHead('Inventario','Materiales','Nuevo artículo');setTimeout(()=>{document.querySelectorAll('.edit-item').forEach(b=>b.onclick=()=>{let x=inventory.find(i=>i.id===+b.dataset.id),n=prompt('Descripción del artículo:',x.desc);if(n!==null){x.desc=n;render()}});document.querySelectorAll('.del-item').forEach(b=>b.onclick=()=>{let x=inventory.find(i=>i.id===+b.dataset.id);if(x.history){x.active=false;alert('Tiene historial: Atlas lo desactivó en lugar de borrarlo.')}else if(x.stock>0)alert('No se puede eliminar con existencia mayor a cero. Regulariza el inventario primero.');else if(confirm('Este artículo no tiene historial. ¿Eliminar definitivamente?'))inventory.splice(inventory.indexOf(x),1);render()})},0);return `<div class="toolbar"><input class="input" placeholder="Modelo, marca, descripción o código"><select class="select"><option>Activos</option><option>Inactivos</option></select></div><div class="card panel"><table class="table"><thead><tr><th>Modelo</th><th>Marca</th><th>Descripción</th><th>Existencia</th><th>Mínimo</th><th>Ubicación</th><th>Costo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${inventory.map(i=>`<tr style="${!i.active?'opacity:.55':''}"><td><strong>${i.model}</strong></td><td>${i.brand}</td><td>${i.desc}</td><td>${i.stock}</td><td>${i.min}</td><td>${i.loc}</td><td>${fmt(i.cost)}</td><td>${chip(i.active?i.status:'Inactivo',i.active?(i.status==='OK'?'green':i.status==='Bajo'?'orange':'red'):'gray')}</td><td><button class="ghost edit-item" data-id="${i.id}">Editar</button> <button class="ghost del-item" data-id="${i.id}">${i.history?'Desactivar':'Eliminar'}</button></td></tr>`).join('')}</tbody></table></div><div class="note" style="margin-top:14px"><strong>Regla:</strong> stock nunca se edita como dato maestro. Se corrige mediante Ajuste de inventario con permiso, motivo y auditoría.</div>`}
function mano(){setHead('Mano de obra','Costos reales','Registrar actividad');setTimeout(()=>{document.querySelector('#real-mode').onchange=e=>{document.querySelector('#real-qty').placeholder=e.target.value==='día'?'Días':'Horas'};document.querySelector('#real-add').onclick=()=>alert('Registro demo agregado. En la versión conectada tomará el costo configurado del empleado y quedará ligado al proyecto.')},0);return `<div class="card panel"><h3>Registro por proyecto</h3><div class="toolbar"><select class="select"><option>P-13217 · CCTV Nave 3</option></select><select class="select">${activityCatalog.map(x=>`<option>${x}</option>`).join('')}</select><select class="select">${personnel.filter(x=>x.active).map(x=>`<option>${x.name} · ${x.position}</option>`).join('')}</select><input class="input" type="date"><select id="real-mode" class="select"><option value="día">Por día</option><option value="hora">Por hora</option></select><select class="select"><option>Normal</option><option>Sábado</option><option>Domingo</option></select><input id="real-qty" class="input" type="number" placeholder="Días" style="width:100px"><button id="real-add" class="primary">Agregar</button></div><table class="table"><thead><tr><th>Fecha</th><th>Actividad</th><th>Empleado</th><th>Modo</th><th>Tiempo</th><th></th></tr></thead><tbody><tr><td>10 sep</td><td>Canalización</td><td>Técnico 01</td><td>Día</td><td>1 día</td><td><button class="ghost">Editar</button></td></tr><tr><td>10 sep</td><td>Instalación CCTV</td><td>Técnico 02</td><td>Hora</td><td>6 h</td><td><button class="ghost">Editar</button></td></tr></tbody></table></div><div class="note" style="margin-top:14px">Al cierre, Atlas podrá comparar MO presupuestada contra MO real usando las mismas tarifas configuradas de Personal.</div>`}
function config(){setHead('Configuración','Administración','');setTimeout(()=>{document.querySelectorAll('.ctab').forEach(b=>b.onclick=()=>{state.configTab=b.dataset.tab;render()});let qf=document.querySelector('#qfolio');if(qf)qf.onchange=e=>folioConfig.quoteTemplate=e.target.value},0);let body=state.configTab==='personal'?`<div class="card panel"><h3>Personal y costos de mano de obra</h3><p class="muted">Estos valores alimentan automáticamente cotizaciones y costos reales. La visibilidad de costos será controlada por permisos.</p><table class="table"><thead><tr><th>Empleado</th><th>Puesto</th><th>Costo/hora</th><th>Día normal</th><th>Sábado</th><th>Domingo</th><th>Estado</th></tr></thead><tbody>${personnel.map(p=>`<tr><td><strong>${p.name}</strong></td><td>${p.position}</td><td>${fmt(p.hour)}</td><td>${fmt(p.day)}</td><td>${fmt(p.satDay)}</td><td>${fmt(p.sunDay)}</td><td>${chip(p.active?'Activo':'Inactivo',p.active?'green':'gray')}</td></tr>`).join('')}</tbody></table><button class="primary" style="margin-top:14px">+ Agregar personal</button></div>`:`<div class="card panel"><h3>Consecutivos e identificadores</h3><p class="muted">Cada empresa puede definir el formato visible sin alterar el ID interno de Atlas.</p><label>Plantilla de cotización</label><input id="qfolio" class="input" value="${folioConfig.quoteTemplate}" style="width:320px"><p class="muted">Variables sugeridas: {AÑO}, {MES}, {0000}, {000000}</p><label>Plantilla de proyecto</label><input class="input" value="${folioConfig.projectTemplate}" style="width:320px"><div class="note" style="margin-top:16px">Ejemplo actual: <strong>${nextQuoteFolio()}</strong>. El ID interno queda preparado para código de barras Code 128 o QR en una futura operación con scanner.</div></div>`;return `<div class="tabs"><button class="tab ctab ${state.configTab==='personal'?'active':''}" data-tab="personal">Personal</button><button class="tab ctab ${state.configTab==='folios'?'active':''}" data-tab="folios">Consecutivos</button></div>${body}`}
function compras(){setHead('Compras','Abastecimiento','Nueva OC');return `<div class="card panel"><h3>Recepciones pendientes</h3><table class="table"><thead><tr><th>OC compra</th><th>Proyecto</th><th>Proveedor</th><th>Partidas</th><th>Recibido</th><th>Estado</th></tr></thead><tbody><tr><td>#11113</td><td>P-13217</td><td>SYSCOM</td><td>8</td><td>6 / 8</td><td>${chip('Parcial','orange')}</td></tr><tr><td>#11114</td><td>P-13217</td><td>Panduit</td><td>3</td><td>0 / 3</td><td>${chip('Pendiente','blue')}</td></tr></tbody></table></div>`}
function almacen(){setHead('Almacén','Vista operativa','');return `<div class="warehouse-home"><div class="card warehouse-card"><div class="icon">📦</div><h3>Recibir orden de compra</h3><p>Escanea o busca una OC, valida cantidades parciales y actualiza inventario/costo.</p><button class="primary">Recibir OC</button></div><div class="card warehouse-card"><div class="icon">🔧</div><h3>Surtir o devolver proyecto</h3><p>Proyecto + PIN → materiales → cantidades → técnico receptor → guardar lote.</p><button class="primary">Abrir proyecto</button></div></div>`}
function generic(title,eye){setHead(title,eye,'');return `<div class="card empty"><h3>${title}</h3><p>Este módulo se detallará en la siguiente iteración.</p></div>`}
function render(){nav();if(state.page==='cotizaciones'&&state.quote){renderQuote();return}let html='';switch(state.page){case'inicio':html=inicio();break;case'dashboard':html=dashboard();break;case'clientes':html=clientes();break;case'cotizaciones':html=cotizaciones();break;case'proyectos':html=proyectos();break;case'inventario':html=inventario();break;case'compras':html=compras();break;case'mano':html=mano();break;case'almacen':html=almacen();break;case'config':html=config();break;case'reportes':html=generic('Reportes','Análisis');break;default:html=inicio()}document.querySelector('#content').innerHTML=html}
document.querySelector('#role-btn').onclick=()=>alert('Demo: los costos sensibles, ajustes de inventario, aceptación de cotizaciones y finanzas tendrán permisos independientes.');render();


/* ===== flow.js ===== */
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



/* ===== pdf.js ===== */
function atlasQuotePdf(){
  const q=state.quote;if(!q)return alert('No hay cotización abierta.');
  if(!window.jspdf)return alert('No se pudo cargar el generador PDF.');
  const {jsPDF}=window.jspdf,doc=new jsPDF();
  const c=clients.find(x=>x.id===q.clientId),t=quoteTotals(q);
  const pageW=doc.internal.pageSize.getWidth();
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,18);
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Cotización comercial',14,25);
  doc.setFont('helvetica','bold');doc.text(`Cotización No. ${q.id}`,pageW-14,18,{align:'right'});
  doc.setFont('helvetica','normal');doc.text(`Revisión ${q.revision} · 11/09/2026`,pageW-14,25,{align:'right'});
  let y=36;
  const field=(label,value,x,w)=>{doc.setFont('helvetica','bold');doc.text(label,x,y);doc.setFont('helvetica','normal');doc.text(String(value||'—'),x,y+5,{maxWidth:w});};
  field('Cliente',c?.name,14,85);field('RFC',c?.rfc,105,45);field('Contacto / dirigido a',q.directedTo||c?.contact,155,40);y+=16;
  field('Proyecto',q.name||'Proyecto nuevo',14,85);field('Condiciones',q.payment,105,45);field('Entrega / vigencia',`${q.delivery} / ${q.validity}`,155,40);y+=18;
  doc.setDrawColor(220);doc.line(14,y,pageW-14,y);y+=7;
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Materiales',14,y);y+=4;
  let matBody;
  if(q.materialPresentation==='summary') matBody=[['PRODUCTOS / MATERIALES DEL PROYECTO','1',money(t.ms),money(t.ms)]];
  else matBody=q.materials.map(x=>[`${x.model} · ${x.desc}`,String(x.qty),money(materialPrice(x)),money(x.qty*materialPrice(x))]);
  doc.autoTable({startY:y,head:[['Descripción','Cant.','P. Unitario','Importe']],body:matBody,styles:{fontSize:8},headStyles:{fillColor:[48,48,48]},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+9;
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('Mano de obra',14,y);y+=4;
  let laborBody=[];
  if(q.laborRows.length){
    if(q.laborPresentation==='summary'){
      laborBody=[['MANO DE OBRA DEL PROYECTO',money(t.ls)]];
    }else{
      const grouped={};
      q.laborRows.forEach(x=>{
        const key=x.activity||'Mano de obra';
        grouped[key]=(grouped[key]||0)+laborRowCost(x)*(1+x.markup/100);
      });
      laborBody=Object.entries(grouped).map(([activity,total])=>[activity,money(total)]);
    }
  } else laborBody=[['Sin mano de obra agregada',money(0)]];
  doc.autoTable({startY:y,head:[['Actividad','Importe']],body:laborBody,styles:{fontSize:8},headStyles:{fillColor:[48,48,48]},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+9;
  if(q.scope){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Alcance del proyecto',14,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(9);const lines=doc.splitTextToSize(q.scope,pageW-28);doc.text(lines,14,y);y+=lines.length*4+5;}
  if(y>235){doc.addPage();y=20}
  const totalsBody=[['Subtotal',money(t.subtotal)],[`IVA ${q.ivaRate}%`,money(t.iva)],['TOTAL',money(t.total)]];
  doc.autoTable({startY:y,body:totalsBody,theme:'plain',styles:{fontSize:9},columnStyles:{0:{halign:'right',fontStyle:'bold'},1:{halign:'right'}},margin:{left:105,right:14}});
  y=doc.lastAutoTable.finalY+10;
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`Identificador: ${q.id} · ID interno preparado para código de barras/QR`,14,y);
  doc.text('Documento generado desde Atlas Integrador · Demo',14,doc.internal.pageSize.getHeight()-10);
  doc.save(`${q.id}-${(q.name||'cotizacion').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}



/* ===== enhancements.js ===== */
// Mejoras de flujo UX para Atlas Integrador demo.
// Mantiene la demo sin backend y evita tocar el core mientras validamos operación.

state.quoteDetail=null;
state.projectDetailId=null;
state.laborBuilder=null;
state.quoteYear=state.quoteYear||'2026';
state.quoteOwner=state.quoteOwner||'Todos';

const cloneDemo=x=>JSON.parse(JSON.stringify(x));
function ensureQuoteMeta(row){
  if(!row)return row;
  row.year=row.year||((String(row.date||'').match(/20\d{2}/)||['2026'])[0]);
  row.followups=row.followups||[];
  row.revisions=row.revisions||[];
  return row;
}
quotes.forEach(ensureQuoteMeta);
function quoteOwnerOptions(){return ['Todos',...new Set(quotes.map(q=>q.owner).filter(Boolean))]}
function quoteYearOptions(){return ['Todos',...new Set(quotes.map(q=>ensureQuoteMeta(q).year).filter(Boolean))].sort().reverse()}
function quoteStatusColor(status){return status==='Perdida'?'red':status==='Pendiente'?'orange':status==='Aceptada'?'green':status==='Borrador'?'gray':'blue'}
function quoteSnapshotSummary(snapshot){
  const q=cloneDemo(snapshot);const t=quoteTotals(q);
  return {revision:q.revision||0,total:t.total,subtotal:t.subtotal,cost:t.mc+t.lc,margin:t.margin};
}
function startQuoteRevision(row){
  ensureQuoteMeta(row);
  const current=savedQuoteObject(row);
  row.revisions.push({
    revision:row.revision||0,
    status:row.status,
    date:row.date,
    snapshot:cloneDemo(current),
    total:row.total
  });
  const next=cloneDemo(current);
  next.revision=(row.revision||0)+1;
  next.status='Borrador';
  next.step=2;
  row.revision=next.revision;
  row.status='Borrador';
  row.snapshot=cloneDemo(next);
  state.quoteDetail=null;
  state.quote=next;
  renderQuote();
}
function registerQuoteFollowup(row){
  const note=document.querySelector('#followup-note')?.value.trim();
  const type=document.querySelector('#followup-type')?.value||'Llamada';
  const nextDate=document.querySelector('#followup-next')?.value||'';
  if(!note)return alert('Agrega una nota breve del seguimiento.');
  ensureQuoteMeta(row);
  row.followups.unshift({type,note,nextDate,date:'28 sep 2026',owner:'Usuario actual'});
  if(row.status==='Enviada')row.status='Pendiente';
  if(row.snapshot)row.snapshot.status=row.status;
  render();
}
function demoQuoteTemplate(row){
  return {id:row.id,revision:row.revision||0,status:row.status||'Enviada',step:7,clientId:row.clientId,name:row.name,currency:'MXN',materials:[{model:'DS-2CD2143G2-I',desc:'Cámara IP domo 4 MP',qty:8,cost:1850,markup:35,category:'VIDEO VIGILANCIA'},{model:'UTP-CAT6-BL',desc:'Cable Cat6 caja 305 m',qty:2,cost:2890,markup:30,category:'VIDEO VIGILANCIA'}],laborRows:[{activity:'CANALIZACIÓN',category:'VIDEO VIGILANCIA',personId:1,mode:'día',normalQty:1,satQty:0,sunQty:0,markup:70}],indirect:{safety:.02,tools:.03,general:.10,field:.03,finance:.03},truckDays:2,truckDaily:250,directedTo:clients.find(c=>c.id===row.clientId)?.contact||'',payment:'Contado',delivery:'15 días hábiles',validity:'15 días',ivaRate:16,retainISR:false,isrRate:0,scope:'',materialPresentation:'detail',laborPresentation:'detail'};
}
function savedQuoteObject(row){return row.snapshot?cloneDemo(row.snapshot):demoQuoteTemplate(row)}
function persistQuoteSnapshot(q,status){
  let row=quotes.find(x=>x.id===q.id);
  if(!row){
    row={id:q.id,clientId:q.clientId,name:q.name||'Proyecto nuevo',status:status||q.status||'Borrador',date:'28 sep 2026',owner:'Usuario actual',revision:q.revision,total:quoteTotals(q).total,year:'2026',followups:[],revisions:[]};
    quotes.unshift(row);folioConfig.nextQuote++;
  }
  ensureQuoteMeta(row);
  row.clientId=q.clientId;
  row.name=q.name||row.name;
  row.status=status||q.status||row.status;
  row.revision=q.revision||0;
  row.total=quoteTotals(q).total;
  q.status=row.status;
  row.snapshot=cloneDemo(q);
}

function laborLineCost(line){const p=personnel.find(x=>x.id===+line.personId)||personnel[0];let unit=0;if(line.mode==='hora')unit=line.dayType==='Sábado'?p.hour*1.5:line.dayType==='Domingo'?p.hour*2:p.hour;else unit=line.dayType==='Sábado'?p.satDay:line.dayType==='Domingo'?p.sunDay:p.day;return unit*(+line.qty||0)}
function blankLaborBuilder(){return{activity:activityCatalog[0],category:'VIDEO VIGILANCIA',lines:[{personId:personnel[0].id,mode:'día',dayType:'Normal',qty:1,markup:70}]}}
function groupedLabor(q){const map=new Map();q.laborRows.forEach((x,i)=>{let k=x.activity+'|'+x.category;if(!map.has(k))map.set(k,{activity:x.activity,category:x.category,items:[]});map.get(k).items.push({...x,_i:i})});return [...map.values()]}
function rowToBuilderLine(x){let dayType=x.satQty?'Sábado':x.sunQty?'Domingo':'Normal',qty=x.satQty||x.sunQty||x.normalQty||0;return{personId:x.personId,mode:x.mode,dayType,qty,markup:x.markup}}
function builderToLaborRows(b){return b.lines.filter(l=>(+l.qty||0)>0).map(l=>({activity:b.activity,category:b.category,personId:+l.personId,mode:l.mode,normalQty:l.dayType==='Normal'?+l.qty:0,satQty:l.dayType==='Sábado'?+l.qty:0,sunQty:l.dayType==='Domingo'?+l.qty:0,markup:+l.markup||0}))}

const baseRenderQuote=renderQuote;
renderQuote=function(){baseRenderQuote();enhanceQuotePage()}
function enhanceQuotePage(){const q=state.quote;if(!q)return;
  if(q.step===3){const body=document.querySelector('#qbody');if(body&&!document.querySelector('#material-filter')){const box=document.createElement('div');box.className='toolbar';box.style.marginBottom='12px';box.innerHTML='<input id="material-filter" class="input" style="min-width:320px" placeholder="Buscar dentro de materiales agregados por modelo o descripción">';body.insertBefore(box,body.children[2]||body.firstChild);document.querySelector('#material-filter').oninput=e=>{let term=e.target.value.toLowerCase();document.querySelectorAll('#qbody tbody tr').forEach(r=>r.style.display=!term||r.innerText.toLowerCase().includes(term)?'':'none')}}}
  if(q.step===4)renderLaborBuilder(q);
  const save=document.querySelector('#save-quote');if(save)save.onclick=()=>{if(!q.name)q.name='Proyecto nuevo';persistQuoteSnapshot(q,'Borrador');state.quote=null;state.quoteDetail=q.id;render()};
  const sent=document.querySelector('#mark-sent');if(sent)sent.onclick=()=>{q.status='Enviada';persistQuoteSnapshot(q,'Enviada');const row=quotes.find(x=>x.id===q.id);ensureQuoteMeta(row);row.followups.unshift({type:'Envío',note:'Cotización enviada al cliente.',nextDate:'',date:'28 sep 2026',owner:'Usuario actual'});state.quote=null;state.quoteDetail=q.id;render()};
}
function renderLaborBuilder(q){let b=state.laborBuilder||blankLaborBuilder();state.laborBuilder=b;const body=document.querySelector('#qbody');const groups=groupedLabor(q);const people=personnel.filter(x=>x.active);
 body.innerHTML=`<h3>Mano de obra presupuestada</h3><p class="muted">Busca la actividad y agrega todos los recursos que realmente requiera. Una misma actividad puede combinar técnicos, ayudantes, días y horas.</p><div class="note"><div class="grid-2"><div><label>Buscar / seleccionar actividad</label><input id="lab-act" class="input" list="act-list" value="${b.activity}" style="width:100%"><datalist id="act-list">${activityCatalog.map(x=>`<option value="${x}">`).join('')}</datalist></div><div><label>Asignar a</label><input id="lab-cat" class="input" list="cat-list" value="${b.category}" style="width:100%"><datalist id="cat-list"><option value="VIDEO VIGILANCIA"><option value="CONTROL DE ACCESO"><option value="REDES"><option value="FIBRA ÓPTICA"><option value="No asignado"></datalist></div></div><h4 style="margin:16px 0 8px">Recursos de la actividad</h4><div class="table-wrap"><table class="table"><thead><tr><th>Buscar recurso</th><th>Modo</th><th>Jornada</th><th>Cantidad</th><th>% utilidad</th><th>Costo empresa</th><th>Cliente</th><th></th></tr></thead><tbody>${b.lines.map((l,i)=>{let p=people.find(x=>x.id===+l.personId)||people[0],cost=laborLineCost(l);return `<tr><td><input class="input lb-person" data-i="${i}" list="people-list" value="${p.name} · ${p.position}" style="min-width:190px"></td><td><select class="select lb-mode" data-i="${i}"><option value="día" ${l.mode==='día'?'selected':''}>Por día</option><option value="hora" ${l.mode==='hora'?'selected':''}>Por hora</option></select></td><td><select class="select lb-day" data-i="${i}"><option ${l.dayType==='Normal'?'selected':''}>Normal</option><option ${l.dayType==='Sábado'?'selected':''}>Sábado</option><option ${l.dayType==='Domingo'?'selected':''}>Domingo</option></select></td><td><input class="input lb-qty" data-i="${i}" type="number" min="0" value="${l.qty}" style="width:75px"></td><td><input class="input lb-mark" data-i="${i}" type="number" min="0" value="${l.markup}" style="width:80px"></td><td>${fmt(cost)}</td><td><strong>${fmt(cost*(1+l.markup/100))}</strong></td><td><button class="ghost lb-del" data-i="${i}">Quitar</button></td></tr>`}).join('')}</tbody></table><datalist id="people-list">${people.map(p=>`<option value="${p.name} · ${p.position}">`).join('')}</datalist></div><div class="toolbar" style="margin-top:12px"><button class="ghost" id="lb-add">+ Agregar recurso</button><button class="primary" id="lb-save">Guardar actividad en resumen</button></div></div><h3 style="margin-top:22px">Resumen de actividades</h3><div class="table-wrap"><table class="table"><thead><tr><th>Asignado a</th><th>Actividad</th><th>Recursos</th><th>Costo</th><th>Cliente</th><th></th></tr></thead><tbody>${groups.length?groups.map((g,gi)=>{let cost=g.items.reduce((s,x)=>s+laborRowCost(x),0),sale=g.items.reduce((s,x)=>s+laborRowCost(x)*(1+x.markup/100),0);return `<tr><td>${g.category}</td><td><strong>${g.activity}</strong></td><td>${g.items.length}</td><td>${fmt(cost)}</td><td><strong>${fmt(sale)}</strong></td><td><button class="ghost lb-edit-group" data-i="${gi}">Editar</button> <button class="ghost lb-delete-group" data-i="${gi}">Eliminar</button></td></tr>`}).join(''):'<tr><td colspan="6" class="muted">Todavía no has agregado mano de obra a esta cotización.</td></tr>'}</tbody></table></div>`;
 const sync=()=>{b.activity=document.querySelector('#lab-act').value;b.category=document.querySelector('#lab-cat').value};document.querySelector('#lab-act').onchange=sync;document.querySelector('#lab-cat').onchange=sync;
 document.querySelectorAll('.lb-person').forEach(el=>el.onchange=e=>{let i=+e.target.dataset.i,p=people.find(p=>e.target.value.startsWith(p.name+' ·'));if(p)b.lines[i].personId=p.id;renderQuote()});document.querySelectorAll('.lb-mode').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].mode=e.target.value;renderQuote()});document.querySelectorAll('.lb-day').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].dayType=e.target.value;renderQuote()});document.querySelectorAll('.lb-qty').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].qty=+e.target.value;renderQuote()});document.querySelectorAll('.lb-mark').forEach(el=>el.onchange=e=>{b.lines[+e.target.dataset.i].markup=+e.target.value;renderQuote()});document.querySelectorAll('.lb-del').forEach(el=>el.onclick=()=>{b.lines.splice(+el.dataset.i,1);if(!b.lines.length)b.lines.push({personId:people[0].id,mode:'día',dayType:'Normal',qty:1,markup:70});renderQuote()});
 document.querySelector('#lb-add').onclick=()=>{sync();b.lines.push({personId:people[0].id,mode:'día',dayType:'Normal',qty:1,markup:70});renderQuote()};document.querySelector('#lb-save').onclick=()=>{sync();q.laborRows.push(...builderToLaborRows(b));state.laborBuilder=blankLaborBuilder();renderQuote()};
 document.querySelectorAll('.lb-delete-group').forEach(el=>el.onclick=()=>{const g=groups[+el.dataset.i];q.laborRows=q.laborRows.filter(x=>!(x.activity===g.activity&&x.category===g.category));renderQuote()});document.querySelectorAll('.lb-edit-group').forEach(el=>el.onclick=()=>{const g=groups[+el.dataset.i];state.laborBuilder={activity:g.activity,category:g.category,lines:g.items.map(rowToBuilderLine)};q.laborRows=q.laborRows.filter(x=>!(x.activity===g.activity&&x.category===g.category));renderQuote()});
}

cotizaciones=function(){
  if(state.quote){renderQuote();return ''}
  if(state.quoteDetail)return quoteDetailView();
  setHead('Cotizaciones','Comercial','Nueva cotización');
  document.querySelector('#primary-action').onclick=()=>newQuote();
  let term=state.quoteSearch.toLowerCase();
  let rows=quotes.filter(x=>{
    ensureQuoteMeta(x);
    let c=clients.find(c=>c.id===x.clientId);
    return (state.quoteStatus==='Todos'||x.status===state.quoteStatus)
      &&(state.quoteYear==='Todos'||x.year===state.quoteYear)
      &&(state.quoteOwner==='Todos'||x.owner===state.quoteOwner)
      &&(!term||[x.id,x.name,c?.name,x.owner].some(v=>String(v).toLowerCase().includes(term)));
  });
  setTimeout(()=>{
    document.querySelector('#quote-search').oninput=e=>{state.quoteSearch=e.target.value;render()};
    document.querySelector('#quote-status').onchange=e=>{state.quoteStatus=e.target.value;render()};
    document.querySelector('#quote-year').onchange=e=>{state.quoteYear=e.target.value;render()};
    document.querySelector('#quote-owner').onchange=e=>{state.quoteOwner=e.target.value;render()};
    document.querySelectorAll('.open-quote').forEach(b=>b.onclick=()=>{state.quoteDetail=b.dataset.id;render()});
  },0);
  const openCount=rows.filter(x=>!['Aceptada','Perdida'].includes(x.status)).length;
  const openValue=rows.filter(x=>!['Perdida'].includes(x.status)).reduce((sum,x)=>sum+(+x.total||0),0);
  return `<div class="kpi-grid"><div class="card kpi"><div class="label">Cotizaciones visibles</div><div class="value">${rows.length}</div><div class="delta">Según filtros actuales</div></div><div class="card kpi"><div class="label">Abiertas</div><div class="value">${openCount}</div><div class="delta">Por mover comercialmente</div></div><div class="card kpi"><div class="label">Valor visible</div><div class="value">${fmt(openValue)}</div><div class="delta">Sin cotizaciones perdidas</div></div><div class="card kpi"><div class="label">Conversión demo</div><div class="value">${quotes.filter(x=>x.status==='Aceptada').length}</div><div class="delta">Cotizaciones aceptadas</div></div></div>
  <div class="toolbar"><input id="quote-search" class="input" style="min-width:300px" value="${state.quoteSearch}" placeholder="Buscar folio, cliente, proyecto o promotor"><select id="quote-status" class="select">${['Todos','Borrador','Enviada','Pendiente','Aceptada','Perdida'].map(v=>`<option ${v===state.quoteStatus?'selected':''}>${v}</option>`).join('')}</select><select id="quote-year" class="select">${quoteYearOptions().map(v=>`<option ${v===state.quoteYear?'selected':''}>${v}</option>`).join('')}</select><select id="quote-owner" class="select">${quoteOwnerOptions().map(v=>`<option ${v===state.quoteOwner?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th>Rev.</th><th>Responsable</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>${rows.map(x=>{let c=clients.find(c=>c.id===x.clientId);return `<tr><td><strong>${x.id}</strong></td><td>${c?.name||''}</td><td>${x.name}</td><td>${x.date}</td><td>${x.revision}</td><td>${x.owner}</td><td>${chip(x.status,quoteStatusColor(x.status))}</td><td>${fmt(x.total)}</td><td><button class="ghost open-quote" data-id="${x.id}">Abrir</button></td></tr>`}).join('')}</tbody></table></div></div>
  <div class="note" style="margin-top:14px"><strong>Regla Atlas:</strong> una cotización puede tener varias revisiones y seguimientos, pero el proyecto nace únicamente cuando se registra una autorización.</div>`;
}

function quoteDetailView(){
  const row=ensureQuoteMeta(quotes.find(x=>x.id===state.quoteDetail));
  if(!row)return '<div class="card empty"><h3>Cotización no encontrada</h3></div>';
  const q=savedQuoteObject(row),c=clients.find(x=>x.id===row.clientId),t=quoteTotals(q);
  setHead(row.id,'Cotización guardada','');
  setTimeout(()=>{
    document.querySelector('#qd-back').onclick=()=>{state.quoteDetail=null;render()};
    const edit=document.querySelector('#qd-edit');if(edit)edit.onclick=()=>{state.quoteDetail=null;state.quote=q;state.quote.step=2;renderQuote()};
    const rev=document.querySelector('#qd-revision');if(rev)rev.onclick=()=>startQuoteRevision(row);
    document.querySelector('#qd-pdf').onclick=()=>{const old=state.quote;state.quote=q;atlasQuotePdf();state.quote=old};
    const lost=document.querySelector('#qd-lost');if(lost)lost.onclick=()=>{row.status='Perdida';if(row.snapshot)row.snapshot.status='Perdida';render()};
    const follow=document.querySelector('#qd-followup');if(follow)follow.onclick=()=>registerQuoteFollowup(row);
    const accept=document.querySelector('#qd-accept');if(accept)accept.onclick=()=>acceptQuoteDemo(row,q);
    const project=document.querySelector('#qd-project');if(project)project.onclick=()=>{state.quoteDetail=null;state.page='proyectos';state.projectDetailId=row.projectId;render()};
  },0);
  const canOperate=!['Aceptada','Perdida'].includes(row.status);
  const canDirectEdit=row.status==='Borrador';
  const history=[...row.revisions].reverse();
  return `<div class="card panel"><div class="project-header"><div><h2 style="margin:0 0 6px">${row.name}</h2><div class="project-meta">${chip(row.status,quoteStatusColor(row.status))} ${chip(c?.name||'')} ${chip('Rev. '+row.revision)} ${row.projectId?chip('Proyecto '+row.projectId,'green'):''}</div></div><button class="ghost" id="qd-back">← Volver</button></div>
  <div class="metric-strip"><div class="metric-box"><small>Folio</small><strong style="font-size:16px">${row.id}</strong></div><div class="metric-box"><small>Venta antes de IVA</small><strong>${fmt(t.subtotal)}</strong></div><div class="metric-box"><small>Costo base</small><strong>${fmt(t.mc+t.lc+t.ind)}</strong></div><div class="metric-box"><small>Margen referencia</small><strong>${t.subtotal?(((t.subtotal-(t.mc+t.lc+t.ind))/t.subtotal)*100).toFixed(1):'0.0'}%</strong></div></div>
  <div class="toolbar" style="margin-top:18px">${canDirectEdit?'<button class="ghost" id="qd-edit">Editar borrador</button>':canOperate?'<button class="primary" id="qd-revision">+ Nueva revisión</button>':''}<button class="ghost" id="qd-pdf">Descargar PDF</button>${canOperate?'<button class="ghost" id="qd-lost">Marcar perdida</button>':''}${row.projectId?'<button class="primary" id="qd-project">Abrir proyecto →</button>':''}</div>
  <div class="grid-2" style="margin-top:16px"><div class="card panel"><h3>Seguimiento comercial</h3>${canOperate?`<div class="toolbar"><select id="followup-type" class="select"><option>Llamada</option><option>WhatsApp</option><option>Correo</option><option>Reunión</option><option>Envío</option></select><input id="followup-note" class="input" style="min-width:260px" placeholder="¿Qué pasó con el cliente?"><input id="followup-next" class="input" type="date"><button class="primary" id="qd-followup">Registrar</button></div>`:''}<div class="timeline">${row.followups.length?row.followups.map(f=>`<div><strong>${f.date} · ${f.type}</strong><span>${f.note}${f.nextDate?' · Próximo: '+f.nextDate:''}</span></div>`).join(''):'<div><strong>Sin seguimientos</strong><span>Registra el primer contacto después del envío.</span></div>'}</div></div>
  <div class="card panel"><h3>Historial de revisiones</h3><div class="action-list"><div class="action-item"><div><strong>Rev. ${row.revision} · actual</strong><span>${row.status} · ${fmt(row.total)}</span></div>${chip('Actual','blue')}</div>${history.map(h=>`<div class="action-item"><div><strong>Rev. ${h.revision}</strong><span>${h.status} · ${fmt(h.total||0)}</span></div>${chip('Histórica','gray')}</div>`).join('')}</div></div></div>
  ${canOperate?`<div class="note" style="margin-top:18px"><h3 style="margin-top:0">Aceptar cotización y crear proyecto</h3><p class="muted">Al aceptar, Atlas congela esta revisión como línea base del proyecto. Los cambios posteriores ya se comparan contra lo aprobado.</p><div class="toolbar"><select id="accept-type" class="select"><option>Orden de compra</option><option>Anticipo</option><option>Contrato</option><option>Otro</option></select><input id="accept-ref" class="input" placeholder="OC / referencia"><input id="accept-date" class="input" type="date" value="2026-09-28"><button class="primary" id="qd-accept">Aceptar y crear proyecto</button></div></div>`:''}</div>`;
}

function acceptQuoteDemo(row,q){
  const ref=document.querySelector('#accept-ref')?.value.trim();
  if(!ref)return alert('Captura la OC o referencia de autorización.');
  const authorizationType=document.querySelector('#accept-type')?.value||'Orden de compra';
  const acceptedDate=document.querySelector('#accept-date')?.value||'2026-09-28';
  const id=folioConfig.projectTemplate.replace('{00000}',String(folioConfig.nextProject).padStart(5,'0'));
  const pin=String(1000+(folioConfig.nextProject%9000));
  const c=clients.find(x=>x.id===row.clientId),t=quoteTotals(q);
  const baselineCost=t.mc+t.lc+t.ind;
  const baseline={
    quoteId:row.id,
    revision:row.revision||0,
    approvedAt:acceptedDate,
    authorizationType,
    authorizationRef:ref,
    clientId:row.clientId,
    client:c?.name||'',
    name:row.name,
    currency:q.currency,
    scope:q.scope||'',
    materials:cloneDemo(q.materials||[]),
    laborRows:cloneDemo(q.laborRows||[]),
    indirect:cloneDemo(q.indirect||{}),
    truckDays:q.truckDays||0,
    truckDaily:q.truckDaily||0,
    payment:q.payment||'',
    delivery:q.delivery||'',
    validity:q.validity||'',
    costMaterial:t.mc,
    costLabor:t.lc,
    costIndirect:t.ind,
    cost:baselineCost,
    sale:t.subtotal,
    margin:t.subtotal?((t.subtotal-baselineCost)/t.subtotal*100):0
  };
  projects.unshift({id,client:c?.name||'',name:row.name,owner:row.owner,status:'Aprobado',sale:baseline.sale,budget:baseline.cost,real:0,margin:+baseline.margin.toFixed(1),po:ref,alert:'Por surtir',year:2026,pin,sourceQuote:row.id,sourceRevision:row.revision||0,authorizationType,acceptedDate,baseline});
  folioConfig.nextProject++;
  row.status='Aceptada';row.projectId=id;row.acceptedDate=acceptedDate;row.authorizationType=authorizationType;row.authorizationRef=ref;
  if(row.snapshot)row.snapshot.status='Aceptada';
  row.followups.unshift({type:'Aceptación',note:`${authorizationType}: ${ref}. Se creó el proyecto ${id}.`,nextDate:'',date:'28 sep 2026',owner:'Usuario actual'});
  state.quoteDetail=null;state.page='proyectos';state.projectDetailId=id;render();
}

const baseProyectos=proyectos;
proyectos=function(){if(state.projectDetailId)return projectDetailView(projects.find(p=>p.id===state.projectDetailId));let html=baseProyectos();setTimeout(()=>{document.querySelectorAll('#content tbody tr').forEach((tr,i)=>{tr.style.cursor='pointer';tr.onclick=()=>{let visible=projects.filter(p=>(state.projectYear==='Todos'||String(p.year)===state.projectYear)&&(!state.projectSearch||[p.id,p.client,p.name,p.owner,p.po].some(v=>String(v).toLowerCase().includes(state.projectSearch.toLowerCase()))));if(visible[i]){state.projectDetailId=visible[i].id;render()}}})},0);return html}
function projectDetailView(p){
  if(!p)return '<div class="card empty"><h3>Proyecto no encontrado</h3></div>';
  setHead(p.id,'Proyecto','');
  setTimeout(()=>{document.querySelector('#pd-back').onclick=()=>{state.projectDetailId=null;render()};document.querySelector('#pd-print').onclick=()=>atlasProjectPdf(p);const q=document.querySelector('#pd-source');if(q)q.onclick=()=>{state.projectDetailId=null;state.page='cotizaciones';state.quoteDetail=p.sourceQuote;render()}},0);
  const b=p.baseline||null;
  return `<div class="card panel"><div class="project-header"><div><h2 style="margin:0 0 6px">${p.name}</h2><div class="project-meta">${chip(p.status,'green')} ${chip(p.client,'blue')} ${chip(p.owner)} ${chip(p.po)} ${p.sourceRevision!=null?chip('Rev. '+p.sourceRevision,'gray'):''}</div></div><button class="ghost" id="pd-back">← Volver</button></div>
  <div class="metric-strip"><div class="metric-box"><small>Proyecto</small><strong>${p.id}</strong></div><div class="metric-box"><small>Venta aprobada</small><strong>${fmt(b?.sale||p.sale)}</strong></div><div class="metric-box"><small>Costo línea base</small><strong>${fmt(b?.cost||p.budget)}</strong></div><div class="metric-box"><small>Margen aprobado</small><strong>${(b?.margin??p.margin).toFixed(1)}%</strong></div></div>
  ${b?`<div class="grid-2" style="margin-top:16px"><div class="card panel"><h3>Línea base aprobada</h3><div class="action-list"><div class="action-item"><div><strong>Materiales</strong><span>${b.materials.length} partidas congeladas</span></div><strong>${fmt(b.costMaterial)}</strong></div><div class="action-item"><div><strong>Mano de obra</strong><span>${b.laborRows.length} registros presupuestados</span></div><strong>${fmt(b.costLabor)}</strong></div><div class="action-item"><div><strong>Indirectos</strong><span>Base aprobada para comparación</span></div><strong>${fmt(b.costIndirect)}</strong></div></div></div><div class="card panel"><h3>Autorización</h3><div class="action-list"><div class="action-item"><div><strong>${b.authorizationType}</strong><span>${b.authorizationRef}</span></div>${chip('Aprobada','green')}</div><div class="action-item"><div><strong>Fecha</strong><span>${b.approvedAt}</span></div>${chip('Origen '+b.quoteId,'blue')}</div></div></div></div>`:''}
  <div class="note" style="margin-top:16px"><strong>Regla Atlas:</strong> la línea base ya no cambia. Material, mano de obra y costos reales del proyecto se compararán contra esta revisión aprobada.</div>
  <div class="toolbar" style="margin-top:16px">${p.sourceQuote?'<button class="ghost" id="pd-source">Ver cotización origen</button>':''}<button class="primary" id="pd-print">Imprimir proyecto / hoja de surtido</button></div></div>`;
}

function atlasProjectPdf(p){const {jsPDF}=window.jspdf,doc=new jsPDF();doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,18);doc.setFontSize(13);doc.text('Proyecto '+p.id,14,30);doc.setFontSize(11);doc.text('Cliente: '+p.client,14,42);doc.text('Proyecto: '+p.name,14,50);doc.text('OC / referencia: '+p.po,14,58);doc.setFontSize(18);doc.text('PIN: '+(p.pin||'5837'),14,73);doc.setFontSize(10);doc.text('Documento interno para operación y surtido de materiales.',14,84);doc.save('Proyecto-'+p.id+'.pdf')}

atlasQuotePdf=function(){const q=state.quote;if(!q)return;const {jsPDF}=window.jspdf,doc=new jsPDF(),c=clients.find(x=>x.id===q.clientId),t=quoteTotals(q);doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,16);doc.setFontSize(11);doc.text('Cotización '+q.id+' · Rev. '+q.revision,14,25);doc.text('Cliente: '+(c?.name||''),14,34);doc.text('Contacto: '+(q.directedTo||c?.contact||''),14,41);doc.text('Proyecto: '+(q.name||''),14,48);let y=58;if(q.scope){doc.setFontSize(10);doc.text('Alcance: '+q.scope,14,y,{maxWidth:180});y+=18}doc.setFontSize(13);doc.text('Materiales',14,y);y+=5;if(q.materialPresentation==='summary'){doc.autoTable({startY:y,head:[['Descripción','Importe']],body:[['PRODUCTOS Y MATERIALES',fmt(t.ms)]],theme:'striped'});}else{doc.autoTable({startY:y,head:[['Descripción','Cant.','P. Unitario','Importe']],body:q.materials.map(x=>[x.model+' · '+x.desc,x.qty,fmt(materialPrice(x)),fmt(x.qty*materialPrice(x))]),theme:'striped'});}y=doc.lastAutoTable.finalY+12;if(q.laborRows.length){doc.setFontSize(13);doc.text('Mano de obra',14,y);let groups=groupedLabor(q);doc.autoTable({startY:y+5,head:[['Actividad','Importe']],body:groups.map(g=>[g.activity,fmt(g.items.reduce((s,x)=>s+laborRowCost(x)*(1+x.markup/100),0))]),theme:'striped'});y=doc.lastAutoTable.finalY+12}doc.autoTable({startY:y,body:[['Subtotal',fmt(t.subtotal)],['IVA '+q.ivaRate+'%',fmt(t.iva)],['TOTAL',fmt(t.total)]],theme:'plain',styles:{fontStyle:'bold'},columnStyles:{0:{halign:'right'},1:{halign:'right'}}});doc.setFontSize(9);doc.text('Condiciones de pago: '+q.payment+' · Entrega: '+q.delivery+' · Vigencia: '+q.validity,14,doc.lastAutoTable.finalY+12,{maxWidth:180});doc.save('Cotizacion-'+q.id+'.pdf')}

// Buscar también en inventario sin recargar manualmente.
const baseInventario=inventario;
inventario=function(){let html=baseInventario();setTimeout(()=>{const inp=document.querySelector('#content .toolbar input');if(inp)inp.oninput=e=>{let term=e.target.value.toLowerCase();document.querySelectorAll('#content tbody tr').forEach(r=>r.style.display=!term||r.innerText.toLowerCase().includes(term)?'':'none')}},0);return html}

// Limpieza de estados al navegar.
const baseNav=nav;
nav=function(){baseNav();document.querySelectorAll('.nav-btn').forEach(b=>{const old=b.onclick;b.onclick=()=>{state.quoteDetail=null;state.projectDetailId=null;state.laborBuilder=null;old&&old()}})}
render();



/* ===== review-fixes.js ===== */
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



/* ===== review-r3.js ===== */
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



/* ===== review-r4.js ===== */
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
  const rows=clients.filter(function(c){return !term||[c.legalName,c.tradeName,c.name,c.rfc,c.contact,c.email].some(function(v){return String(v||'').toLowerCase().includes(term)})});
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



/* ===== review-r5.js ===== */
/* Atlas Integrador — revisión R5: UX, paginación, dashboards por rol y exportación */

/* ---------- Estado / utilidades compartidas ---------- */
state.quotePage=state.quotePage||1;
state.projectPage=state.projectPage||1;
state.quoteClientSearch=state.quoteClientSearch||'';
state.quoteClientPage=state.quoteClientPage||1;
state.invPage=state.invPage||1;
state.invShowAll=state.invShowAll||false;
state.invExportOpen=state.invExportOpen||false;
state.laborPage=state.laborPage||1;
state.clientAdminPage=state.clientAdminPage||1;
state.purchasePage=state.purchasePage||1;
state.warehouseHistoryPage=state.warehouseHistoryPage||1;
state.demoEngineer=state.demoEngineer||'Ing. Ramiro';

const ATLAS_PAGE_SIZE=10;
function atlasPageData(rows,page,size=ATLAS_PAGE_SIZE){
  const total=rows.length,pages=Math.max(1,Math.ceil(total/size)),p=Math.min(Math.max(1,+page||1),pages);
  return {rows:rows.slice((p-1)*size,p*size),page:p,pages,total,start:total?(p-1)*size+1:0,end:Math.min(p*size,total)};
}
function atlasPagination(meta,key){
  if(meta.total<=ATLAS_PAGE_SIZE)return '<div class="atlas-list-meta">Mostrando '+meta.start+'–'+meta.end+' de '+meta.total+'</div>';
  let buttons='';
  for(let i=1;i<=meta.pages;i++)buttons+='<button class="'+(i===meta.page?'primary':'ghost')+' atlas-page-btn" data-page="'+i+'" data-key="'+key+'">'+i+'</button>';
  return '<div class="atlas-pagination"><span>Mostrando '+meta.start+'–'+meta.end+' de '+meta.total+'</span><div>'+buttons+(meta.page<meta.pages?'<button class="ghost atlas-page-btn" data-page="'+(meta.page+1)+'" data-key="'+key+'">Siguiente →</button>':'')+'</div></div>';
}
function atlasBindPagination(){
  document.querySelectorAll('.atlas-page-btn').forEach(function(b){
    b.onclick=function(){
      const key=b.dataset.key,page=+b.dataset.page;
      const map={quotes:'quotePage',projects:'projectPage',quoteClients:'quoteClientPage',inventory:'invPage',labor:'laborPage',clients:'clientAdminPage',purchases:'purchasePage',warehouse:'warehouseHistoryPage'};
      if(map[key])state[map[key]]=page;
      if(key==='quoteClients')renderQuote();else render();
    };
  });
}

/* ---------- Navegación: Clientes sale del menú operativo ---------- */
const atlasClientNavIndex=navItems.findIndex(function(x){return x[0]==='clientes'});
if(atlasClientNavIndex>=0)navItems.splice(atlasClientNavIndex,1);
if(state.page==='clientes')state.page='cotizaciones';

function atlasAllowedPages(role){
  if(role==='Dirección')return ['inicio','dashboard','cotizaciones','proyectos','inventario','compras','mano','almacen','reportes','config'];
  if(role==='Ingeniería')return ['inicio','dashboard','cotizaciones','proyectos','inventario','mano','reportes'];
  if(role==='Comercial')return ['inicio','dashboard','cotizaciones','proyectos','reportes'];
  if(role==='Compras')return ['inicio','dashboard','proyectos','inventario','compras','almacen','reportes'];
  if(role==='Almacén')return ['inicio','dashboard','inventario','almacen'];
  return ['inicio','dashboard'];
}
const atlasNavR5Base=nav;
nav=function(){
  atlasNavR5Base();
  const allowed=atlasAllowedPages(state.role);
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.style.display=allowed.includes(b.dataset.page)?'block':'none';
    b.title=b.querySelector('span')?b.querySelector('span').textContent:'';
  });
  if(!allowed.includes(state.page)){state.page='dashboard'}
};

/* Demo de rol para comprobar Dashboard personalizado */
function atlasBindRoleSwitcher(){
  const b=document.querySelector('#role-btn');if(!b)return;
  b.textContent='Rol: '+state.role;
  b.onclick=function(){
    const roles=['Dirección','Ingeniería','Comercial','Compras','Almacén'];
    const i=roles.indexOf(state.role);state.role=roles[(i+1)%roles.length];
    if(state.role==='Ingeniería')state.demoEngineer='Ing. Ramiro';
    state.page='dashboard';state.quote=null;state.quoteDetail=null;state.projectDetailId=null;render();
  };
}

/* ---------- Sidebar expandible / minimizable ---------- */
function atlasSidebarStored(){
  try{return localStorage.getItem('atlasSidebarCollapsed')==='1'}catch(e){return false}
}
function atlasSetSidebar(collapsed){
  const shell=document.querySelector('.app-shell'),btn=document.querySelector('#sidebar-toggle');
  if(!shell)return;
  shell.classList.toggle('sidebar-collapsed',!!collapsed);
  if(btn){btn.textContent=collapsed?'›':'‹';btn.title=collapsed?'Mostrar menú':'Minimizar menú'}
  try{localStorage.setItem('atlasSidebarCollapsed',collapsed?'1':'0')}catch(e){}
}
function atlasInitSidebar(){
  const btn=document.querySelector('#sidebar-toggle');if(!btn)return;
  if(!btn.dataset.bound){btn.dataset.bound='1';btn.onclick=function(){atlasSetSidebar(!document.querySelector('.app-shell').classList.contains('sidebar-collapsed'))}}
  atlasSetSidebar(atlasSidebarStored());
}

/* ---------- Nueva cotización: buscador + 10 clientes por página ---------- */
function atlasQuoteClientPicker(){
  const q=state.quote;if(!q||q.step!==1)return;
  const term=String(state.quoteClientSearch||'').trim().toLowerCase();
  const rows=clients.filter(function(c){
    return c.active!==false&&(!term||[c.name,c.tradeName,c.legalName,c.rfc,c.contact].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.quoteClientPage);
  state.quoteClientPage=meta.page;
  const body=document.querySelector('#qbody');if(!body)return;
  body.innerHTML='<div class="project-header"><div><h3 style="margin-bottom:5px">Selecciona el cliente</h3><p class="muted" style="margin:0">Busca por nombre comercial, razón social, RFC o contacto.</p></div></div>'
   +'<div class="toolbar"><input id="quote-client-search" class="input" style="min-width:380px" placeholder="Buscar cliente, RFC o contacto" value="'+state.quoteClientSearch+'"></div>'
   +'<div class="action-list">'+(meta.rows.length?meta.rows.map(function(x){return '<div class="action-item"><div><strong>'+x.name+'</strong><span>'+x.rfc+' · '+x.contact+'</span></div><button class="primary pick-client-r5" data-id="'+x.id+'">Seleccionar</button></div>'}).join(''):'<div class="empty">No encontré clientes activos con esa búsqueda.</div>')+'</div>'
   +atlasPagination(meta,'quoteClients');
  const next=document.querySelector('#qnext');if(next)next.style.display='none';
  const s=document.querySelector('#quote-client-search');if(s)s.oninput=function(e){state.quoteClientSearch=e.target.value;state.quoteClientPage=1;renderQuote()};
  document.querySelectorAll('.pick-client-r5').forEach(function(b){b.onclick=function(){q.clientId=+b.dataset.id;q.step=2;state.quoteClientSearch='';state.quoteClientPage=1;renderQuote()}});
  atlasBindPagination();
}
const atlasRenderQuoteR5Base=renderQuote;
renderQuote=function(){
  atlasRenderQuoteR5Base();
  if(state.quote&&state.quote.step===1)atlasQuoteClientPicker();
};

/* ---------- Cotizaciones: 10 por página ---------- */
cotizaciones=function(){
  if(state.quote){renderQuote();return ''}
  if(state.quoteDetail)return quoteDetailView();
  setHead('Cotizaciones','Comercial','Nueva cotización');
  document.querySelector('#primary-action').onclick=function(){newQuote()};
  const term=String(state.quoteSearch||'').toLowerCase();
  let rows=quotes.filter(function(x){
    ensureQuoteMeta(x);const c=clients.find(function(c){return c.id===x.clientId});
    const roleOk=state.role!=='Ingeniería'||x.owner===state.demoEngineer;
    return roleOk&&(state.quoteStatus==='Todos'||x.status===state.quoteStatus)
      &&(state.quoteYear==='Todos'||x.year===state.quoteYear)
      &&(state.quoteOwner==='Todos'||x.owner===state.quoteOwner)
      &&(!term||[x.id,x.name,c&&c.name,x.owner].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.quotePage);state.quotePage=meta.page;
  const open=rows.filter(function(x){return !['Aceptada','Perdida'].includes(x.status)}),openValue=rows.filter(function(x){return x.status!=='Perdida'}).reduce(function(s,x){return s+(+x.total||0)},0);
  setTimeout(function(){
    const qs=document.querySelector('#quote-search');if(qs)qs.oninput=function(e){state.quoteSearch=e.target.value;state.quotePage=1;render()};
    const st=document.querySelector('#quote-status');if(st)st.onchange=function(e){state.quoteStatus=e.target.value;state.quotePage=1;render()};
    const yr=document.querySelector('#quote-year');if(yr)yr.onchange=function(e){state.quoteYear=e.target.value;state.quotePage=1;render()};
    const ow=document.querySelector('#quote-owner');if(ow)ow.onchange=function(e){state.quoteOwner=e.target.value;state.quotePage=1;render()};
    document.querySelectorAll('.open-quote').forEach(function(b){b.onclick=function(){state.quoteDetail=b.dataset.id;render()}});
    atlasBindPagination();
  },0);
  return '<div class="kpi-grid"><div class="card kpi"><div class="label">Cotizaciones visibles</div><div class="value">'+rows.length+'</div><div class="delta">Según filtros actuales</div></div><div class="card kpi"><div class="label">Abiertas</div><div class="value">'+open.length+'</div><div class="delta">Por mover comercialmente</div></div><div class="card kpi"><div class="label">Valor visible</div><div class="value">'+fmt(openValue)+'</div><div class="delta">Sin cotizaciones perdidas</div></div><div class="card kpi"><div class="label">Aceptadas</div><div class="value">'+quotes.filter(function(x){return x.status==='Aceptada'}).length+'</div><div class="delta">Conversión registrada</div></div></div>'
   +'<div class="toolbar"><input id="quote-search" class="input" style="min-width:300px" value="'+state.quoteSearch+'" placeholder="Buscar folio, cliente, proyecto o promotor"><select id="quote-status" class="select">'+['Todos','Borrador','Enviada','Pendiente','Aceptada','Perdida'].map(function(v){return '<option '+(v===state.quoteStatus?'selected':'')+'>'+v+'</option>'}).join('')+'</select><select id="quote-year" class="select">'+quoteYearOptions().map(function(v){return '<option '+(v===state.quoteYear?'selected':'')+'>'+v+'</option>'}).join('')+'</select><select id="quote-owner" class="select">'+quoteOwnerOptions().map(function(v){return '<option '+(v===state.quoteOwner?'selected':'')+'>'+v+'</option>'}).join('')+'</select></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Fecha</th><th>Rev.</th><th>Responsable</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>'+meta.rows.map(function(x){const c=clients.find(function(c){return c.id===x.clientId});return '<tr><td><strong>'+x.id+'</strong></td><td>'+(c?c.name:'')+'</td><td>'+x.name+'</td><td>'+x.date+'</td><td>'+x.revision+'</td><td>'+x.owner+'</td><td>'+chip(x.status,quoteStatusColor(x.status))+'</td><td>'+fmt(x.total)+'</td><td><button class="ghost open-quote" data-id="'+x.id+'">Abrir</button></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'quotes')+'</div>'
   +'<div class="note" style="margin-top:14px"><strong>Regla Atlas:</strong> una cotización puede tener varias revisiones y seguimientos, pero el proyecto nace únicamente cuando se registra una autorización.</div>';
};

/* ---------- Proyectos: paginación y privacidad de ingeniero ---------- */
proyectos=function(){
  if(state.projectDetailId)return projectDetailView(projects.find(function(p){return p.id===state.projectDetailId}));
  setHead('Proyectos','Operación','');
  const term=String(state.projectSearch||'').toLowerCase();
  let rows=projects.filter(function(p){
    const roleOk=state.role!=='Ingeniería'||p.owner===state.demoEngineer;
    return roleOk&&(state.projectYear==='Todos'||String(p.year)===state.projectYear)&&(!term||[p.id,p.client,p.name,p.owner,p.po].some(function(v){return String(v||'').toLowerCase().includes(term)}));
  });
  const meta=atlasPageData(rows,state.projectPage);state.projectPage=meta.page;
  setTimeout(function(){
    const s=document.querySelector('#ps');if(s)s.oninput=function(e){state.projectSearch=e.target.value;state.projectPage=1;render()};
    const y=document.querySelector('#py');if(y)y.onchange=function(e){state.projectYear=e.target.value;state.projectPage=1;render()};
    document.querySelectorAll('.project-open-r5').forEach(function(tr){tr.onclick=function(){state.projectDetailId=tr.dataset.id;render()}});
    atlasBindPagination();
  },0);
  return '<div class="toolbar"><input id="ps" class="input" value="'+state.projectSearch+'" placeholder="Buscar proyecto, cliente, promotor u OC"><select id="py" class="select"><option '+(state.projectYear==='2026'?'selected':'')+'>2026</option><option '+(state.projectYear==='2025'?'selected':'')+'>2025</option><option '+(state.projectYear==='Todos'?'selected':'')+'>Todos</option></select></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Promotor</th><th>Estado</th><th>OC</th><th>Venta</th><th>Margen aprobado</th></tr></thead><tbody>'+meta.rows.map(function(p){return '<tr class="project-open-r5" data-id="'+p.id+'" style="cursor:pointer"><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.client+'</td><td>'+p.owner+'</td><td>'+chip(p.status,'green')+'</td><td>'+p.po+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin+'%</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'projects')+'</div>';
};

/* ---------- Inventario: bajo demanda + paginación + XLSX ---------- */
function atlasInventoryExport(){
  if(typeof XLSX==='undefined'){alert('No se pudo cargar el generador de Excel.');return}
  const type=document.querySelector('#inv-export-type')?.value||'full';
  const location=document.querySelector('#inv-export-location')?.value||'Todos';
  const category=document.querySelector('#inv-export-category')?.value||'Todos';
  const blind=!!document.querySelector('#inv-export-blind')?.checked;
  let rows=inventory.filter(function(i){return i.active!==false});
  if(type==='cycle'&&location!=='Todos')rows=rows.filter(function(i){return i.loc===location});
  if(type==='cycle'&&category!=='Todos')rows=rows.filter(function(i){return i.category===category});
  const data=rows.map(function(i){return{
    Modelo:i.model,Marca:i.brand,Descripción:i.desc,Categoría:i.category,Ubicación:i.loc,
    'Unidad SAT':i.satUnit,'Clave SAT':i.satCode,'Existencia sistema':blind?'':i.stock,
    Mínimo:i.min,Máximo:i.max,'Conteo físico':'',Diferencia:'',Observaciones:''
  }});
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,type==='cycle'?'Conteo cíclico':'Inventario');
  XLSX.writeFile(wb,'Atlas-Inventario-'+(type==='cycle'?'Ciclico':'Completo')+'.xlsx');
}
const atlasInventoryR5Base=inventario;
inventario=function(){
  const html=atlasInventoryR5Base();
  setTimeout(function(){
    const q=document.querySelector('#inv-search');if(!q)return;
    const toolbar=q.parentElement;
    if(toolbar&&!document.querySelector('#inv-show-all')){
      const show=document.createElement('button');show.id='inv-show-all';show.className='ghost';show.textContent=state.invShowAll?'Ocultar catálogo':'Ver catálogo completo';
      show.onclick=function(){state.invShowAll=!state.invShowAll;state.invPage=1;render()};toolbar.appendChild(show);
      const exp=document.createElement('button');exp.id='inv-export-toggle';exp.className='secondary';exp.textContent='Exportar inventario';exp.onclick=function(){state.invExportOpen=!state.invExportOpen;render()};toolbar.appendChild(exp);
    }
    q.oninput=function(e){state.invSearch=e.target.value;state.invShowAll=false;state.invPage=1;render()};
    const wrap=document.querySelector('#content .table-wrap'),heading=wrap&&wrap.previousElementSibling;
    const shouldShow=state.invShowAll||String(state.invSearch||'').trim().length>=2;
    if(wrap){
      if(!shouldShow){wrap.style.display='none';if(heading&&heading.tagName==='H3')heading.style.display='none'}
      else{
        const rows=[...wrap.querySelectorAll('tbody tr')],meta=atlasPageData(rows,state.invPage);
        state.invPage=meta.page;
        rows.forEach(function(r,i){r.style.display=(i>=(meta.page-1)*ATLAS_PAGE_SIZE&&i<meta.page*ATLAS_PAGE_SIZE)?'':'none'});
        let pg=document.querySelector('#inv-pagination');if(!pg){pg=document.createElement('div');pg.id='inv-pagination';wrap.insertAdjacentElement('afterend',pg)}
        pg.innerHTML=atlasPagination({page:meta.page,pages:meta.pages,total:rows.length,start:rows.length?(meta.page-1)*ATLAS_PAGE_SIZE+1:0,end:Math.min(meta.page*ATLAS_PAGE_SIZE,rows.length)},'inventory');
        atlasBindPagination();
      }
    }
    let hint=document.querySelector('#inv-search-hint');
    if(!hint){hint=document.createElement('div');hint.id='inv-search-hint';hint.className='muted';toolbar.insertAdjacentElement('afterend',hint)}
    hint.textContent=shouldShow?'':'Escribe al menos 2 caracteres para mostrar coincidencias, o usa “Ver catálogo completo”.';
    if(state.invExportOpen&&!document.querySelector('#inv-export-panel')){
      const panel=document.createElement('div');panel.id='inv-export-panel';panel.className='note atlas-export-panel';
      panel.innerHTML='<strong>Exportar inventario a Excel</strong><div class="toolbar" style="margin-top:10px"><select id="inv-export-type" class="select"><option value="full">Inventario completo</option><option value="cycle">Conteo cíclico</option></select><select id="inv-export-location" class="select"><option>Todos</option>'+atlasActiveValues(atlasLocations,atlasInactiveLocations).map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><select id="inv-export-category" class="select"><option>Todos</option>'+atlasActiveValues(atlasCategories,atlasInactiveCategories).map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><label class="atlas-check"><input id="inv-export-blind" type="checkbox"> Conteo ciego (ocultar existencia)</label><button id="inv-export-download" class="primary">Descargar Excel</button></div><span class="muted">Incluye columnas para conteo físico, diferencia y observaciones.</span>';
      toolbar.parentElement.insertBefore(panel,toolbar.nextSibling);
      document.querySelector('#inv-export-download').onclick=atlasInventoryExport;
    }
  },0);
  return html;
};

/* ---------- Mano de obra real: paginación ---------- */
const atlasLaborR5Base=mano;
mano=function(){
  let html=atlasLaborR5Base();
  setTimeout(function(){
    const table=document.querySelector('#content .table-wrap table');if(!table)return;
    const rows=[...table.querySelectorAll('tbody tr')],meta=atlasPageData(rows,state.laborPage);state.laborPage=meta.page;
    rows.forEach(function(r,i){r.style.display=(i>=(meta.page-1)*ATLAS_PAGE_SIZE&&i<meta.page*ATLAS_PAGE_SIZE)?'':'none'});
    let pg=document.querySelector('#labor-pagination');if(!pg){pg=document.createElement('div');pg.id='labor-pagination';table.closest('.table-wrap').insertAdjacentElement('afterend',pg)}
    pg.innerHTML=atlasPagination({page:meta.page,pages:meta.pages,total:rows.length,start:rows.length?(meta.page-1)*ATLAS_PAGE_SIZE+1:0,end:Math.min(meta.page*ATLAS_PAGE_SIZE,rows.length)},'labor');atlasBindPagination();
  },0);
  return html;
};

/* ---------- Compras: lista paginada desde OC de demo ---------- */
compras=function(){
  setHead('Compras','Abastecimiento','Nueva OC');
  const meta=atlasPageData(atlasPurchaseOrders,state.purchasePage);state.purchasePage=meta.page;
  setTimeout(atlasBindPagination,0);
  return '<div class="card panel"><h3>Órdenes de compra / recepciones</h3><div class="table-wrap"><table class="table"><thead><tr><th>OC compra</th><th>Proyecto</th><th>Proveedor</th><th>Partidas</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>'+meta.rows.map(function(po){const total=po.lines.reduce(function(s,x){return s+x.qty},0),received=po.lines.reduce(function(s,x){return s+x.received},0);return '<tr><td><strong>#'+po.id+'</strong></td><td>'+po.projectId+'</td><td>'+po.supplier+'</td><td>'+po.lines.length+'</td><td>'+received+' / '+total+'</td><td>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Completa'?'green':atlasPoStatus(po)==='Parcial'?'orange':'blue')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'purchases')+'</div>';
};

/* ---------- Configuración: selects visibles + paginación de clientes ---------- */
atlasCatalogCard=function(type,title,list,inactive,prefix){
  const active=atlasActiveValues(list,inactive),editing=state.catalogEditType===type;
  let h='<div class="card panel atlas-catalog-card"><div class="project-header"><div><h3>'+title+'</h3><p class="muted">'+active.length+' activos · '+inactive.length+' inactivos</p></div></div>'
    +'<div class="toolbar"><input id="'+prefix+'-new" class="input" placeholder="Nuevo registro"><button id="'+prefix+'-add" class="primary">Agregar</button></div>'
    +'<label>Seleccionar existente</label><select id="'+prefix+'-select" class="select" style="width:100%;margin-top:6px"><option value="">— Selecciona —</option>'+active.map(function(x){return '<option value="'+x+'">'+x+'</option>'}).join('')+'</select>'
    +'<div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit" class="ghost">Editar</button><button id="'+prefix+'-disable" class="ghost">Desactivar</button></div>';
  if(editing)h+='<div class="note"><label>Nuevo nombre</label><input id="'+prefix+'-edit-value" class="input" style="width:100%;margin-top:6px" value="'+state.catalogEditValue+'"><div class="toolbar" style="margin-top:10px"><button id="'+prefix+'-edit-save" class="primary">Guardar nombre</button><button id="'+prefix+'-edit-cancel" class="ghost">Cancelar</button></div></div>';
  if(inactive.length)h+='<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Inactivos ('+inactive.length+')</summary><div class="toolbar" style="margin-top:10px"><select id="'+prefix+'-inactive" class="select">'+inactive.map(function(x){return '<option>'+x+'</option>'}).join('')+'</select><button id="'+prefix+'-reactivate" class="ghost">Reactivar</button></div></details>';
  return h+'</div>';
};

const atlasConfigClientsR5Base=atlasConfigClients;
atlasConfigClients=function(){
  const edit=state.clientAdminId==='new'?null:clients.find(function(c){return c.id===+state.clientAdminId});
  const form=edit||{legalName:'',tradeName:'',rfc:'',contact:'',phone:'',email:'',address:'',active:true};
  const term=String(state.clientAdminSearch||'').toLowerCase();
  const rows=clients.filter(function(c){return !term||[c.legalName,c.tradeName,c.name,c.rfc,c.contact,c.email].some(function(v){return String(v||'').toLowerCase().includes(term)})});
  const meta=atlasPageData(rows,state.clientAdminPage);state.clientAdminPage=meta.page;
  let h='<div class="card panel"><div class="project-header"><div><h3>Clientes</h3><p class="muted">Catálogo maestro. Solo usuarios con permiso de Configuración pueden crear o modificar clientes.</p></div><button class="primary" id="client-admin-new">+ Nuevo cliente</button></div><div class="toolbar"><input id="client-admin-search" class="input" style="min-width:320px" placeholder="Buscar razón social, nombre, RFC o contacto" value="'+state.clientAdminSearch+'"></div>';
  if(state.clientAdminId){
    h+='<div class="note atlas-admin-form"><strong>'+(state.clientAdminId==='new'?'Alta de cliente':'Editar cliente')+'</strong><div class="grid-2" style="margin-top:12px"><div><label>Razón social</label><input id="ca-legal" class="input" style="width:100%" value="'+form.legalName+'"></div><div><label>Nombre comercial</label><input id="ca-trade" class="input" style="width:100%" value="'+form.tradeName+'"></div><div><label>RFC</label><input id="ca-rfc" class="input" style="width:100%" value="'+form.rfc+'"></div><div><label>Contacto principal</label><input id="ca-contact" class="input" style="width:100%" value="'+form.contact+'"></div><div><label>Teléfono</label><input id="ca-phone" class="input" style="width:100%" value="'+form.phone+'"></div><div><label>Correo</label><input id="ca-email" class="input" type="email" style="width:100%" value="'+form.email+'"></div><div style="grid-column:1/-1"><label>Dirección</label><input id="ca-address" class="input" style="width:100%" value="'+form.address+'"></div></div><div class="toolbar" style="margin-top:12px"><button id="client-admin-save" class="primary">Guardar cliente</button><button id="client-admin-cancel" class="ghost">Cancelar</button></div></div>';
  }
  if(state.clientAdminMessage)h+='<div class="note" style="margin:12px 0"><strong>'+state.clientAdminMessage+'</strong></div>';
  h+='<div class="table-wrap"><table class="table"><thead><tr><th>Razón social / Cliente</th><th>RFC</th><th>Contacto</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>'+meta.rows.map(function(c){return '<tr style="'+(c.active===false?'opacity:.58':'')+'"><td><strong>'+c.legalName+'</strong><br><span class="muted">'+c.tradeName+'</span></td><td>'+c.rfc+'</td><td>'+c.contact+'</td><td>'+c.email+'</td><td>'+chip(c.active===false?'Inactivo':'Activo',c.active===false?'gray':'green')+'</td><td><button class="ghost client-admin-edit" data-id="'+c.id+'">Editar</button> <button class="ghost client-admin-toggle" data-id="'+c.id+'">'+(c.active===false?'Activar':'Desactivar')+'</button></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'clients')+'</div>';
  return h;
};

/* Config binding extra para paginación de clientes */
const atlasConfigR5Base=config;
config=function(){
  const html=atlasConfigR5Base();
  setTimeout(function(){
    const s=document.querySelector('#client-admin-search');if(s)s.oninput=function(e){state.clientAdminSearch=e.target.value;state.clientAdminPage=1;render()};
    atlasBindPagination();
  },0);
  return html;
};

/* ---------- Dashboard Dirección / Ingeniería ---------- */
function atlasProjectCurrentMargin(p){
  const cost=(+p.real>0?+p.real:+p.budget)||0;
  return p.sale?((p.sale-cost)/p.sale*100):0;
}
function atlasDashboardData(owner){
  const ps=owner?projects.filter(function(p){return p.owner===owner}):projects.slice();
  const qs=owner?quotes.filter(function(q){return q.owner===owner}):quotes.slice();
  const sales=ps.reduce(function(s,p){return s+(+p.sale||0)},0);
  const cost=ps.reduce(function(s,p){return s+((+p.real>0?+p.real:+p.budget)||0)},0);
  const profit=sales-cost,margin=sales?profit/sales*100:0;
  const openQs=qs.filter(function(q){return !['Perdida','Aceptada'].includes(q.status)});
  const pipeline=qs.filter(function(q){return q.status!=='Perdida'}).reduce(function(s,q){return s+(+q.total||0)},0);
  const active=ps.filter(function(p){return ['En ejecución','Aprobado'].includes(p.status)}).length;
  const risk=ps.filter(function(p){return atlasProjectCurrentMargin(p)<(+p.margin||0)-2});
  return {ps,qs,sales,cost,profit,margin,openQs,pipeline,active,risk};
}
function atlasDirectionDashboard(){
  const d=atlasDashboardData();
  const pos=atlasPurchaseOrders.filter(function(po){return atlasPoStatus(po)!=='Completa'}).length;
  const critical=inventory.filter(function(i){return i.active!==false&&i.stock<=i.min}).length;
  const engineers=[...new Set(projects.map(function(p){return p.owner}).filter(Boolean))].map(function(name){
    const x=atlasDashboardData(name);return {name,sales:x.sales,profit:x.profit,margin:x.margin,active:x.active,quotes:x.openQs.length,risk:x.risk.length};
  }).sort(function(a,b){return b.sales-a.sales});
  return '<div class="atlas-dashboard-hero"><div><span>VISIÓN 360°</span><h2>Dirección</h2><p>Lectura ejecutiva comercial, operativa y de rentabilidad.</p></div>'+chip('Dirección','blue')+'</div>'
   +'<div class="atlas-kpi-six"><div class="card kpi"><div class="label">Venta aprobada</div><div class="value">'+fmt(d.sales)+'</div><div class="delta">'+d.active+' proyectos activos</div></div><div class="card kpi"><div class="label">Utilidad actual</div><div class="value">'+fmt(d.profit)+'</div><div class="delta">Venta menos costo real/proyectado</div></div><div class="card kpi"><div class="label">Margen actual</div><div class="value">'+d.margin.toFixed(1)+'%</div><div class="delta">'+d.risk.length+' proyectos erosionando margen</div></div><div class="card kpi"><div class="label">Cotizaciones abiertas</div><div class="value">'+d.openQs.length+'</div><div class="delta">'+fmt(d.pipeline)+' visibles</div></div><div class="card kpi"><div class="label">OC por completar</div><div class="value">'+pos+'</div><div class="delta">Pendientes o parciales</div></div><div class="card kpi"><div class="label">Inventario en atención</div><div class="value">'+critical+'</div><div class="delta">En mínimo o crítico</div></div></div>'
   +'<div class="grid-2"><div class="card panel"><h3>Rentabilidad por proyecto</h3><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Responsable</th><th>Venta</th><th>Margen aprobado</th><th>Margen actual</th><th>Desviación</th></tr></thead><tbody>'+d.ps.map(function(p){const cur=atlasProjectCurrentMargin(p),dev=cur-(+p.margin||0),bad=dev<-2;return '<tr><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.owner+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin.toFixed(1)+'%</td><td><strong>'+cur.toFixed(1)+'%</strong></td><td>'+chip((dev>=0?'+':'')+dev.toFixed(1)+' pts',bad?'red':dev<0?'orange':'green')+'</td></tr>'}).join('')+'</tbody></table></div></div>'
   +'<div class="card panel"><h3>Radar de Dirección</h3><div class="action-list"><div class="action-item"><div><strong>Rentabilidad</strong><span>'+d.risk.length+' proyecto(s) debajo del margen aprobado.</span></div>'+chip(d.risk.length?'Revisar':'Sano',d.risk.length?'orange':'green')+'</div><div class="action-item"><div><strong>Abastecimiento</strong><span>'+pos+' OC pendientes o parciales.</span></div>'+chip('Compras','blue')+'</div><div class="action-item"><div><strong>Comercial</strong><span>'+d.openQs.length+' cotizaciones requieren seguimiento.</span></div>'+chip('Pipeline','blue')+'</div><div class="action-item"><div><strong>Inventario</strong><span>'+critical+' artículos en mínimo o crítico.</span></div>'+chip(critical?'Atención':'OK',critical?'red':'green')+'</div></div></div></div>'
   +'<div class="card panel" style="margin-top:16px"><h3>Equipo de proyectos</h3><p class="muted">La vista de Dirección conserva el comparativo del equipo; cada ingeniero verá únicamente su propia cartera.</p><div class="table-wrap"><table class="table"><thead><tr><th>Ingeniero</th><th>Venta</th><th>Utilidad</th><th>Margen actual</th><th>Proyectos activos</th><th>Cotizaciones abiertas</th><th>Alertas margen</th></tr></thead><tbody>'+engineers.map(function(e){return '<tr><td><strong>'+e.name+'</strong></td><td>'+fmt(e.sales)+'</td><td>'+fmt(e.profit)+'</td><td>'+e.margin.toFixed(1)+'%</td><td>'+e.active+'</td><td>'+e.quotes+'</td><td>'+chip(String(e.risk),e.risk?'orange':'green')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
function atlasEngineerDashboard(){
  const owner=state.demoEngineer,d=atlasDashboardData(owner),labor=atlasRealLabor.filter(function(l){const p=projects.find(function(x){return x.id===l.projectId});return p&&p.owner===owner}),laborCost=labor.reduce(function(s,l){return s+atlasLaborCost(l)},0);
  return '<div class="atlas-dashboard-hero"><div><span>MI OPERACIÓN</span><h2>'+owner+'</h2><p>Mis cotizaciones, mis proyectos, mi rentabilidad y pendientes.</p></div>'+chip('Ingeniería','green')+'</div>'
   +'<div class="atlas-kpi-six"><div class="card kpi"><div class="label">Mi venta aprobada</div><div class="value">'+fmt(d.sales)+'</div><div class="delta">'+d.active+' proyectos activos</div></div><div class="card kpi"><div class="label">Mi utilidad actual</div><div class="value">'+fmt(d.profit)+'</div><div class="delta">Sobre mis proyectos</div></div><div class="card kpi"><div class="label">Mi margen actual</div><div class="value">'+d.margin.toFixed(1)+'%</div><div class="delta">Vs línea base aprobada</div></div><div class="card kpi"><div class="label">Mis cotizaciones abiertas</div><div class="value">'+d.openQs.length+'</div><div class="delta">'+fmt(d.pipeline)+' en cartera</div></div><div class="card kpi"><div class="label">MO real registrada</div><div class="value">'+fmt(laborCost)+'</div><div class="delta">'+labor.length+' registros</div></div><div class="card kpi"><div class="label">Alertas de margen</div><div class="value">'+d.risk.length+'</div><div class="delta">Solo mis proyectos</div></div></div>'
   +'<div class="grid-2"><div class="card panel"><h3>Mis proyectos</h3><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Estado</th><th>Venta</th><th>Margen aprobado</th><th>Margen actual</th></tr></thead><tbody>'+d.ps.map(function(p){return '<tr><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.client+'</td><td>'+chip(p.status,'green')+'</td><td>'+fmt(p.sale)+'</td><td>'+p.margin.toFixed(1)+'%</td><td>'+atlasProjectCurrentMargin(p).toFixed(1)+'%</td></tr>'}).join('')+'</tbody></table></div></div><div class="card panel"><h3>Lo que requiere mi atención</h3><div class="action-list">'+(d.risk.length?d.risk.map(function(p){return '<div class="action-item"><div><strong>'+p.id+' · '+p.name+'</strong><span>Margen aprobado '+p.margin.toFixed(1)+'% → actual '+atlasProjectCurrentMargin(p).toFixed(1)+'%</span></div>'+chip('Revisar','orange')+'</div>'}).join(''):'<div class="action-item"><div><strong>Rentabilidad</strong><span>No hay alertas de margen en mis proyectos.</span></div>'+chip('OK','green')+'</div>')+(d.openQs.length?'<div class="action-item"><div><strong>Seguimiento comercial</strong><span>'+d.openQs.length+' cotización(es) abiertas.</span></div>'+chip('Pendiente','blue')+'</div>':'')+'</div></div></div>';
}
dashboard=function(){
  setHead('Dashboard',state.role,'');
  if(state.role==='Ingeniería')return atlasEngineerDashboard();
  if(state.role==='Dirección')return atlasDirectionDashboard();
  const d=atlasDashboardData();
  return '<div class="card panel"><h3>Dashboard · '+state.role+'</h3><p class="muted">La versión conectada mostrará únicamente los indicadores y pendientes autorizados para este rol.</p><div class="metric-strip"><div class="metric-box"><small>Proyectos activos</small><strong>'+d.active+'</strong></div><div class="metric-box"><small>Cotizaciones abiertas</small><strong>'+d.openQs.length+'</strong></div><div class="metric-box"><small>Inventario crítico</small><strong>'+inventory.filter(function(i){return i.stock<=i.min}).length+'</strong></div><div class="metric-box"><small>OC pendientes</small><strong>'+atlasPurchaseOrders.filter(function(po){return atlasPoStatus(po)!=='Completa'}).length+'</strong></div></div></div>';
};

/* ---------- Post-render R5 ---------- */
const atlasRenderR5Base=render;
render=function(){
  atlasRenderR5Base();
  setTimeout(function(){atlasBindRoleSwitcher();atlasInitSidebar();atlasBindPagination()},0);
};



/* ===== review-r6.js ===== */
/* Atlas Integrador — revisión R6: Reportes visibles + cartera de clientes en Dirección */
state.reportTab=state.reportTab||'resumen';
state.reportYear=state.reportYear||'2026';
state.reportOwner=state.reportOwner||'Todos';
state.reportPage=state.reportPage||1;

function atlasClientMetrics(){
  const active=clients.filter(function(c){return c.active!==false});
  const quotedIds=new Set(quotes.map(function(q){return q.clientId}).filter(Boolean));
  const quoted=active.filter(function(c){return quotedIds.has(c.id)});
  const unquoted=active.filter(function(c){return !quotedIds.has(c.id)});
  const withProjects=active.filter(function(c){return projects.some(function(p){return p.client===c.name||p.client===c.tradeName||p.client===c.legalName})});
  const openQuoteIds=new Set(quotes.filter(function(q){return !['Aceptada','Perdida'].includes(q.status)}).map(function(q){return q.clientId}));
  const withOpenQuotes=active.filter(function(c){return openQuoteIds.has(c.id)});
  const salesByClient=active.map(function(c){
    const sale=projects.filter(function(p){return p.client===c.name||p.client===c.tradeName||p.client===c.legalName}).reduce(function(s,p){return s+(+p.sale||0)},0);
    const quoteCount=quotes.filter(function(q){return q.clientId===c.id}).length;
    const openQuotes=quotes.filter(function(q){return q.clientId===c.id&&!['Aceptada','Perdida'].includes(q.status)}).length;
    const projectCount=projects.filter(function(p){return p.client===c.name||p.client===c.tradeName||p.client===c.legalName}).length;
    return {client:c,sale,quoteCount,openQuotes,projectCount};
  }).sort(function(a,b){return b.sale-a.sale});
  const totalSales=salesByClient.reduce(function(s,x){return s+x.sale},0);
  const topSales=salesByClient.slice(0,5).reduce(function(s,x){return s+x.sale},0);
  return {active,quoted,unquoted,withProjects,withOpenQuotes,salesByClient,totalSales,topShare:totalSales?topSales/totalSales*100:0};
}

const atlasDirectionDashboardR6Base=atlasDirectionDashboard;
atlasDirectionDashboard=function(){
  const base=atlasDirectionDashboardR6Base();
  const c=atlasClientMetrics();
  const attention=c.salesByClient.filter(function(x){return x.quoteCount===0||x.openQuotes>0||x.projectCount===0});
  return base
    +'<div class="card panel atlas-client-dashboard" style="margin-top:16px"><div class="project-header"><div><h3>Cartera de clientes</h3><p class="muted">Cobertura comercial calculada con los clientes, cotizaciones y proyectos cargados actualmente.</p></div>'+chip(c.active.length+' registrados','blue')+'</div>'
    +'<div class="atlas-kpi-four"><div class="metric-box"><small>Clientes activos</small><strong>'+c.active.length+'</strong></div><div class="metric-box"><small>Clientes cotizados</small><strong>'+c.quoted.length+'</strong></div><div class="metric-box"><small>Sin cotización</small><strong>'+c.unquoted.length+'</strong></div><div class="metric-box"><small>Con proyecto</small><strong>'+c.withProjects.length+'</strong></div></div>'
    +'<div class="grid-2" style="margin-top:14px"><div><h3>Clientes que requieren atención</h3><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Cotizaciones</th><th>Abiertas</th><th>Proyectos</th><th>Venta</th></tr></thead><tbody>'
    +(attention.length?attention.map(function(x){return '<tr><td><strong>'+x.client.name+'</strong></td><td>'+x.quoteCount+'</td><td>'+x.openQuotes+'</td><td>'+x.projectCount+'</td><td>'+fmt(x.sale)+'</td></tr>'}).join(''):'<tr><td colspan="5" class="muted">No hay clientes pendientes con la información cargada.</td></tr>')
    +'</tbody></table></div></div><div><h3>Concentración de cartera</h3><div class="action-list"><div class="action-item"><div><strong>Top 5 clientes</strong><span>Participación sobre la venta aprobada cargada.</span></div><strong>'+c.topShare.toFixed(1)+'%</strong></div><div class="action-item"><div><strong>Clientes con cotización abierta</strong><span>Requieren seguimiento comercial.</span></div>'+chip(String(c.withOpenQuotes.length),c.withOpenQuotes.length?'orange':'green')+'</div><div class="action-item"><div><strong>Clientes sin cotizar</strong><span>No tienen cotización registrada en los datos actuales.</span></div>'+chip(String(c.unquoted.length),c.unquoted.length?'orange':'green')+'</div></div><div class="note" style="margin-top:12px">Aún no se calcula “clientes nuevos del año” ni “días sin movimiento” porque el demo no guarda fecha de alta ni fecha completa de actividad por cliente.</div></div></div></div>';
};

function atlasReportScopeProjects(){
  let rows=projects.slice();
  if(state.reportYear!=='Todos')rows=rows.filter(function(p){return String(p.year)===String(state.reportYear)});
  if(state.reportOwner!=='Todos')rows=rows.filter(function(p){return p.owner===state.reportOwner});
  if(state.role==='Ingeniería')rows=rows.filter(function(p){return p.owner===state.demoEngineer});
  return rows;
}
function atlasReportScopeQuotes(){
  let rows=quotes.slice();
  rows.forEach(ensureQuoteMeta);
  if(state.reportYear!=='Todos')rows=rows.filter(function(q){return String(q.year)===String(state.reportYear)});
  if(state.reportOwner!=='Todos')rows=rows.filter(function(q){return q.owner===state.reportOwner});
  if(state.role==='Ingeniería')rows=rows.filter(function(q){return q.owner===state.demoEngineer});
  return rows;
}
function atlasReportOwners(){
  return ['Todos',...new Set(projects.map(function(p){return p.owner}).concat(quotes.map(function(q){return q.owner})).filter(Boolean))];
}
function atlasReportYears(){
  return ['Todos',...new Set(projects.map(function(p){return String(p.year)}).concat(quotes.map(function(q){return ensureQuoteMeta(q).year})).filter(Boolean))].sort().reverse();
}
function atlasReportTabs(){
  const tabs=[
    ['resumen','Resumen'],
    ['comercial','Comercial'],
    ['proyectos','Proyectos / rentabilidad'],
    ['clientes','Clientes'],
    ['inventario','Inventario'],
    ['compras','Compras'],
    ['mano','Mano de obra']
  ];
  return '<div class="tabs atlas-report-tabs">'+tabs.map(function(x){return '<button class="tab report-tab '+(state.reportTab===x[0]?'active':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>';
}
function atlasReportFilters(){
  return '<div class="toolbar atlas-report-filter"><select id="report-year" class="select">'+atlasReportYears().map(function(y){return '<option '+(String(y)===String(state.reportYear)?'selected':'')+'>'+y+'</option>'}).join('')+'</select>'
    +(state.role==='Ingeniería'?'':('<select id="report-owner" class="select">'+atlasReportOwners().map(function(o){return '<option '+(o===state.reportOwner?'selected':'')+'>'+o+'</option>'}).join('')+'</select>'))
    +'<button id="report-export" class="secondary">Exportar vista a Excel</button><button id="report-print" class="ghost">Imprimir</button></div>';
}
function atlasReportTable(headers,rows){
  const meta=atlasPageData(rows,state.reportPage);state.reportPage=meta.page;
  return '<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'
    +(meta.rows.length?meta.rows.map(function(r){return '<tr>'+r.map(function(v){return '<td>'+v+'</td>'}).join('')+'</tr>'}).join(''):'<tr><td colspan="'+headers.length+'" class="muted">Sin registros para los filtros actuales.</td></tr>')
    +'</tbody></table></div>'+atlasPagination(meta,'reports')+'</div>';
}
function atlasReportResumen(){
  const ps=atlasReportScopeProjects(),qs=atlasReportScopeQuotes(),cm=atlasClientMetrics();
  const sale=ps.reduce(function(s,p){return s+(+p.sale||0)},0),cost=ps.reduce(function(s,p){return s+((+p.real>0?+p.real:+p.budget)||0)},0);
  const profit=sale-cost,margin=sale?profit/sale*100:0,open=qs.filter(function(q){return !['Aceptada','Perdida'].includes(q.status)});
  const poPending=atlasPurchaseOrders.filter(function(po){return atlasPoStatus(po)!=='Completa'}).length,critical=inventory.filter(function(i){return i.active!==false&&i.stock<=i.min}).length;
  return '<div class="atlas-kpi-six"><div class="card kpi"><div class="label">Venta aprobada</div><div class="value">'+fmt(sale)+'</div><div class="delta">'+ps.length+' proyectos visibles</div></div><div class="card kpi"><div class="label">Utilidad actual</div><div class="value">'+fmt(profit)+'</div><div class="delta">'+margin.toFixed(1)+'% margen</div></div><div class="card kpi"><div class="label">Cotizaciones abiertas</div><div class="value">'+open.length+'</div><div class="delta">'+fmt(open.reduce(function(s,q){return s+(+q.total||0)},0))+' en seguimiento</div></div><div class="card kpi"><div class="label">Clientes activos</div><div class="value">'+cm.active.length+'</div><div class="delta">'+cm.unquoted.length+' sin cotizar</div></div><div class="card kpi"><div class="label">OC pendientes</div><div class="value">'+poPending+'</div><div class="delta">Pendientes o parciales</div></div><div class="card kpi"><div class="label">Inventario en atención</div><div class="value">'+critical+'</div><div class="delta">Mínimo o crítico</div></div></div>'
    +'<div class="note"><strong>Alcance actual:</strong> esta primera vista usa únicamente los datos cargados en la demo. Comparativos mensuales/multianuales, metas históricas y antigüedad real se activarán cuando Atlas tenga la base histórica.</div>';
}
function atlasReportComercial(){
  const qs=atlasReportScopeQuotes(),open=qs.filter(function(q){return !['Aceptada','Perdida'].includes(q.status)}),accepted=qs.filter(function(q){return q.status==='Aceptada'}),lost=qs.filter(function(q){return q.status==='Perdida'});
  const total=qs.reduce(function(s,q){return s+(+q.total||0)},0),conversion=(accepted.length+lost.length)?accepted.length/(accepted.length+lost.length)*100:0;
  const rows=qs.map(function(q){const c=clients.find(function(x){return x.id===q.clientId});return ['<strong>'+q.id+'</strong>',c?c.name:'',q.name,q.owner,q.status,fmt(q.total)]});
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Cotizaciones</div><div class="value">'+qs.length+'</div><div class="delta">'+fmt(total)+' acumulado</div></div><div class="card kpi"><div class="label">Abiertas</div><div class="value">'+open.length+'</div><div class="delta">Requieren seguimiento</div></div><div class="card kpi"><div class="label">Aceptadas</div><div class="value">'+accepted.length+'</div><div class="delta">Con proyecto generado</div></div><div class="card kpi"><div class="label">Conversión disponible</div><div class="value">'+conversion.toFixed(1)+'%</div><div class="delta">Aceptadas / decididas</div></div></div>'+atlasReportTable(['Folio','Cliente','Proyecto','Responsable','Estado','Total'],rows);
}
function atlasReportProjects(){
  const ps=atlasReportScopeProjects();
  const rows=ps.map(function(p){const actual=atlasProjectCurrentMargin(p),dev=actual-(+p.margin||0),cost=(+p.real>0?+p.real:+p.budget)||0;return ['<strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span>',p.client,p.owner,fmt(p.sale),fmt(cost),p.margin.toFixed(1)+'%',actual.toFixed(1)+'%',chip((dev>=0?'+':'')+dev.toFixed(1)+' pts',dev<-2?'red':dev<0?'orange':'green')]});
  const sale=ps.reduce(function(s,p){return s+(+p.sale||0)},0),cost=ps.reduce(function(s,p){return s+((+p.real>0?+p.real:+p.budget)||0)},0),profit=sale-cost;
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Proyectos</div><div class="value">'+ps.length+'</div><div class="delta">Según filtros</div></div><div class="card kpi"><div class="label">Venta</div><div class="value">'+fmt(sale)+'</div></div><div class="card kpi"><div class="label">Costo actual</div><div class="value">'+fmt(cost)+'</div></div><div class="card kpi"><div class="label">Utilidad actual</div><div class="value">'+fmt(profit)+'</div><div class="delta">'+(sale?profit/sale*100:0).toFixed(1)+'% margen</div></div></div>'+atlasReportTable(['Proyecto','Cliente','Responsable','Venta','Costo','Margen aprobado','Margen actual','Desviación'],rows);
}
function atlasReportClients(){
  const cm=atlasClientMetrics();
  const rows=cm.salesByClient.map(function(x){let status=x.quoteCount===0?'Sin cotizar':x.openQuotes>0?'Seguimiento':'Con actividad';return ['<strong>'+x.client.name+'</strong>',x.client.rfc,x.quoteCount,x.openQuotes,x.projectCount,fmt(x.sale),chip(status,status==='Sin cotizar'?'orange':status==='Seguimiento'?'blue':'green')]});
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Registrados activos</div><div class="value">'+cm.active.length+'</div></div><div class="card kpi"><div class="label">Cotizados</div><div class="value">'+cm.quoted.length+'</div></div><div class="card kpi"><div class="label">Sin cotizar</div><div class="value">'+cm.unquoted.length+'</div></div><div class="card kpi"><div class="label">Top 5 / venta</div><div class="value">'+cm.topShare.toFixed(1)+'%</div><div class="delta">Concentración de cartera</div></div></div>'+atlasReportTable(['Cliente','RFC','Cotizaciones','Abiertas','Proyectos','Venta','Estado comercial'],rows)+'<div class="note" style="margin-top:14px">El demo todavía no guarda fecha de alta del cliente, por eso no mostramos “clientes nuevos del año” ni días desde el último contacto.</div>';
}
function atlasReportInventory(){
  const active=inventory.filter(function(i){return i.active!==false}),critical=active.filter(function(i){return i.stock<=i.min}),value=active.reduce(function(s,i){return s+(+i.stock||0)*(+i.cost||0)},0);
  const rows=active.map(function(i){return ['<strong>'+i.model+'</strong>',i.brand,i.desc,i.category,i.loc,i.stock,i.min,fmt(i.cost),fmt(i.stock*i.cost),chip(atlasInvStatus(i),atlasInvStatus(i)==='OK'?'green':atlasInvStatus(i)==='Bajo'?'orange':'red')]});
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Artículos activos</div><div class="value">'+active.length+'</div></div><div class="card kpi"><div class="label">En atención</div><div class="value">'+critical.length+'</div></div><div class="card kpi"><div class="label">Unidades registradas</div><div class="value">'+active.reduce(function(s,i){return s+(+i.stock||0)},0)+'</div></div><div class="card kpi"><div class="label">Valuación demo</div><div class="value">'+fmt(value)+'</div><div class="delta">Existencia × costo actual</div></div></div>'+atlasReportTable(['Modelo','Marca','Descripción','Categoría','Ubicación','Existencia','Mínimo','Costo','Valor','Estado'],rows);
}
function atlasReportPurchases(){
  const pos=atlasPurchaseOrders.slice(),pending=pos.filter(function(po){return atlasPoStatus(po)!=='Completa'}),ordered=pos.reduce(function(s,po){return s+po.lines.reduce(function(a,l){return a+l.qty},0)},0),received=pos.reduce(function(s,po){return s+po.lines.reduce(function(a,l){return a+l.received},0)},0);
  const rows=pos.map(function(po){const total=po.lines.reduce(function(s,l){return s+l.qty},0),rec=po.lines.reduce(function(s,l){return s+l.received},0);return ['<strong>#'+po.id+'</strong>',po.projectId,po.supplier,po.lines.length,total,rec,total-rec,chip(atlasPoStatus(po),atlasPoStatus(po)==='Completa'?'green':atlasPoStatus(po)==='Parcial'?'orange':'blue')]});
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">OC registradas</div><div class="value">'+pos.length+'</div></div><div class="card kpi"><div class="label">Pendientes / parciales</div><div class="value">'+pending.length+'</div></div><div class="card kpi"><div class="label">Unidades ordenadas</div><div class="value">'+ordered+'</div></div><div class="card kpi"><div class="label">Unidades recibidas</div><div class="value">'+received+'</div></div></div>'+atlasReportTable(['OC','Proyecto','Proveedor','Partidas','Ordenado','Recibido','Pendiente','Estado'],rows)+'<div class="note" style="margin-top:14px">La antigüedad de OC todavía no se calcula porque las OC demo no contienen fecha de creación/compromiso.</div>';
}
function atlasReportLabor(){
  let rows=atlasRealLabor.slice();
  if(state.role==='Ingeniería'){const ids=new Set(projects.filter(function(p){return p.owner===state.demoEngineer}).map(function(p){return p.id}));rows=rows.filter(function(l){return ids.has(l.projectId)})}
  if(state.reportOwner!=='Todos'){const ids=new Set(projects.filter(function(p){return p.owner===state.reportOwner}).map(function(p){return p.id}));rows=rows.filter(function(l){return ids.has(l.projectId)})}
  const cost=rows.reduce(function(s,l){return s+atlasLaborCost(l)},0);
  const table=rows.map(function(l){const p=personnel.find(function(x){return x.id===+l.personId}),pr=projects.find(function(x){return x.id===l.projectId});return [l.date,l.projectId,pr?pr.owner:'',l.activity,p?p.name:'',l.mode+' / '+l.dayType,l.qty,fmt(atlasLaborCost(l))]});
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Registros MO</div><div class="value">'+rows.length+'</div></div><div class="card kpi"><div class="label">Costo real registrado</div><div class="value">'+fmt(cost)+'</div></div><div class="card kpi"><div class="label">Proyectos con MO</div><div class="value">'+new Set(rows.map(function(l){return l.projectId})).size+'</div></div><div class="card kpi"><div class="label">Personal involucrado</div><div class="value">'+new Set(rows.map(function(l){return l.personId})).size+'</div></div></div>'+atlasReportTable(['Fecha','Proyecto','Responsable','Actividad','Empleado','Modo','Cantidad','Costo real'],table);
}
function atlasReportCurrentBody(){
  if(state.reportTab==='comercial')return atlasReportComercial();
  if(state.reportTab==='proyectos')return atlasReportProjects();
  if(state.reportTab==='clientes')return atlasReportClients();
  if(state.reportTab==='inventario')return atlasReportInventory();
  if(state.reportTab==='compras')return atlasReportPurchases();
  if(state.reportTab==='mano')return atlasReportLabor();
  return atlasReportResumen();
}
function atlasReportExportRows(){
  if(state.reportTab==='comercial')return atlasReportScopeQuotes().map(function(q){const c=clients.find(function(x){return x.id===q.clientId});return {Folio:q.id,Cliente:c?c.name:'',Proyecto:q.name,Responsable:q.owner,Estado:q.status,Total:q.total}});
  if(state.reportTab==='proyectos')return atlasReportScopeProjects().map(function(p){const cur=atlasProjectCurrentMargin(p);return {Proyecto:p.id,Cliente:p.client,Responsable:p.owner,Venta:p.sale,Costo:(+p.real>0?+p.real:+p.budget)||0,'Margen aprobado %':p.margin,'Margen actual %':cur,'Desviación pts':cur-p.margin}});
  if(state.reportTab==='clientes')return atlasClientMetrics().salesByClient.map(function(x){return {Cliente:x.client.name,RFC:x.client.rfc,Cotizaciones:x.quoteCount,'Cotizaciones abiertas':x.openQuotes,Proyectos:x.projectCount,Venta:x.sale}});
  if(state.reportTab==='inventario')return inventory.filter(function(i){return i.active!==false}).map(function(i){return {Modelo:i.model,Marca:i.brand,Descripción:i.desc,Categoría:i.category,Ubicación:i.loc,Existencia:i.stock,Mínimo:i.min,Costo:i.cost,Valor:i.stock*i.cost,Estado:atlasInvStatus(i)}});
  if(state.reportTab==='compras')return atlasPurchaseOrders.map(function(po){const total=po.lines.reduce(function(s,l){return s+l.qty},0),rec=po.lines.reduce(function(s,l){return s+l.received},0);return {OC:po.id,Proyecto:po.projectId,Proveedor:po.supplier,Partidas:po.lines.length,Ordenado:total,Recibido:rec,Pendiente:total-rec,Estado:atlasPoStatus(po)}});
  if(state.reportTab==='mano')return atlasRealLabor.map(function(l){const p=personnel.find(function(x){return x.id===+l.personId}),pr=projects.find(function(x){return x.id===l.projectId});return {Fecha:l.date,Proyecto:l.projectId,Responsable:pr?pr.owner:'',Actividad:l.activity,Empleado:p?p.name:'',Modo:l.mode+' / '+l.dayType,Cantidad:l.qty,'Costo real':atlasLaborCost(l)}});
  const ps=atlasReportScopeProjects();return ps.map(function(p){return {Proyecto:p.id,Cliente:p.client,Responsable:p.owner,Venta:p.sale,'Margen aprobado':p.margin,'Margen actual':atlasProjectCurrentMargin(p)}});
}
function atlasExportCurrentReport(){
  if(typeof XLSX==='undefined')return alert('No se pudo cargar el generador de Excel.');
  const data=atlasReportExportRows();if(!data.length)return alert('No hay datos para exportar con los filtros actuales.');
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Reporte');
  XLSX.writeFile(wb,'Atlas-Reporte-'+state.reportTab+'-'+state.reportYear+'.xlsx');
}
function reportes(){
  setHead('Reportes','Análisis','');
  if(state.role==='Ingeniería')state.reportOwner=state.demoEngineer;
  setTimeout(function(){
    document.querySelectorAll('.report-tab').forEach(function(b){b.onclick=function(){state.reportTab=b.dataset.tab;state.reportPage=1;render()}});
    const y=document.querySelector('#report-year');if(y)y.onchange=function(e){state.reportYear=e.target.value;state.reportPage=1;render()};
    const o=document.querySelector('#report-owner');if(o)o.onchange=function(e){state.reportOwner=e.target.value;state.reportPage=1;render()};
    const ex=document.querySelector('#report-export');if(ex)ex.onclick=atlasExportCurrentReport;
    const pr=document.querySelector('#report-print');if(pr)pr.onclick=function(){window.print()};
    atlasBindPagination();
  },0);
  return '<div class="atlas-report-head"><div><h2 style="margin:0 0 5px">Centro de reportes</h2><p class="muted" style="margin:0">Consulta detallada de la información que Atlas ya tiene registrada.</p></div></div>'+atlasReportTabs()+atlasReportFilters()+atlasReportCurrentBody();
};

/* Agregar reports a la paginación común */
const atlasBindPaginationR6Base=atlasBindPagination;
atlasBindPagination=function(){
  atlasBindPaginationR6Base();
  document.querySelectorAll('.atlas-page-btn[data-key="reports"]').forEach(function(b){b.onclick=function(){state.reportPage=+b.dataset.page;render()}});
};

/* Render final: sustituir placeholder de Reportes por módulo real */
const atlasRenderR6Base=render;
render=function(){
  if(state.page==='reportes'&&!state.quote){
    nav();document.querySelector('#content').innerHTML=reportes();
    setTimeout(function(){atlasBindRoleSwitcher();atlasInitSidebar();atlasBindPagination()},0);
    return;
  }
  atlasRenderR6Base();
};



/* ===== review-r7.js ===== */
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



/* ===== review-r8.js ===== */
/* Atlas Integrador — revisión R8: Finanzas + Facturación separadas por responsabilidad */

/* ---------- Navegación y permisos ---------- */
if(!navItems.some(function(x){return x[0]==='finanzas'})){
  const ri=navItems.findIndex(function(x){return x[0]==='reportes'});
  navItems.splice(ri>=0?ri:navItems.length,0,['finanzas','$','Finanzas'],['facturacion','▣','Facturación']);
}
if(!atlasUsers.some(function(u){return u.role==='Finanzas'})){
  atlasUsers.push({id:Math.max.apply(null,atlasUsers.map(function(u){return u.id}))+1,name:'Finanzas',email:'finanzas@demo.local',role:'Finanzas',active:true,permissions:['costos','finanzas','facturacion','reportes']});
}

atlasAllowedPages=function(role){
  if(role==='Dirección')return ['inicio','dashboard','cotizaciones','proyectos','inventario','compras','mano','almacen','finanzas','facturacion','reportes','config'];
  if(role==='Finanzas')return ['inicio','dashboard','finanzas','facturacion','reportes'];
  if(role==='Ingeniería')return ['inicio','dashboard','cotizaciones','proyectos','inventario','mano','reportes'];
  if(role==='Comercial')return ['inicio','dashboard','cotizaciones','proyectos','reportes'];
  if(role==='Compras')return ['inicio','dashboard','proyectos','inventario','compras','almacen','reportes'];
  if(role==='Almacén')return ['inicio','dashboard','inventario','almacen'];
  return ['inicio','dashboard'];
};
atlasBindRoleSwitcher=function(){
  const b=document.querySelector('#role-btn');if(!b)return;
  b.textContent='Rol: '+state.role;
  b.onclick=function(){
    const roles=['Dirección','Ingeniería','Comercial','Compras','Almacén','Finanzas'];
    const i=roles.indexOf(state.role);state.role=roles[(i+1)%roles.length];
    if(state.role==='Ingeniería')state.demoEngineer='Ing. Ramiro';
    state.page='dashboard';state.quote=null;state.quoteDetail=null;state.projectDetailId=null;render();
  };
};

atlasConfigAccess=function(){
  const perms=[['costos','Ver costos'],['inventario','Ajustar inventario'],['aceptar','Aceptar cotizaciones'],['config','Configuración'],['cotizaciones','Cotizaciones'],['proyectos','Proyectos'],['almacen','Almacén'],['finanzas','Finanzas'],['facturacion','Facturación'],['reportes','Reportes']];
  const roles=['Dirección','Comercial','Ingeniería','Compras','Almacén','Finanzas'];
  return '<div class="card panel"><h3>Usuarios, roles y accesos</h3><p class="muted">Finanzas y Facturación se autorizan por separado. Un ingeniero no obtiene acceso financiero por el hecho de operar proyectos.</p><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th></tr></thead><tbody>'+atlasUsers.map(function(u){return '<tr><td><strong>'+u.name+'</strong><br><span class="muted">'+u.email+'</span></td><td><select class="select access-role" data-id="'+u.id+'">'+roles.map(function(r){return atlasOpt(r,u.role)}).join('')+'</select></td><td>'+perms.map(function(p){return '<label style="display:inline-block;margin:3px 10px 3px 0"><input type="checkbox" class="access-perm" data-id="'+u.id+'" data-perm="'+p[0]+'" '+(u.permissions.indexOf(p[0])>=0?'checked':'')+'> '+p[1]+'</label>'}).join('')+'</td><td><label><input type="checkbox" class="access-active" data-id="'+u.id+'" '+(u.active?'checked':'')+'> Activo</label></td></tr>'}).join('')+'</tbody></table></div></div>';
};

/* ---------- Datos demo financieros ---------- */
state.financeTab=state.financeTab||'expenses';
state.financeMode=state.financeMode||'list';
state.expensePage=state.expensePage||1;
state.arPage=state.arPage||1;
state.bankMovePage=state.bankMovePage||1;
state.billingTab=state.billingTab||'projects';
state.billingDraft=state.billingDraft||null;
state.invoicePage=state.invoicePage||1;
state.paymentPage=state.paymentPage||1;
state.creditPage=state.creditPage||1;
state.financeMessage=state.financeMessage||'';
state.billingMessage=state.billingMessage||'';

const atlasExpenseCategories=['RENTA DE EQUIPO','FLETES','VIÁTICOS','HERRAMIENTA','SERVICIOS','ADMINISTRATIVO','OTROS'];
const atlasBankAccounts=[
  {id:1,bank:'Banco demo',name:'Cuenta operativa MXN',last4:'0001',currency:'MXN',openingBalance:250000,active:true},
  {id:2,bank:'Banco demo',name:'Cuenta USD',last4:'0002',currency:'USD',openingBalance:10000,active:true}
];
const atlasExpenses=[
  {id:'G-0001',date:'2026-09-12',concept:'Renta de plataforma elevadora',category:'RENTA DE EQUIPO',supplierId:null,subtotal:3800,iva:608,paymentMethod:'Transferencia',bankId:1,reference:'TRX-001',projectId:'P-13217',scope:'Proyecto',notes:'Dato demo'},
  {id:'G-0002',date:'2026-09-15',concept:'Internet oficina',category:'SERVICIOS',supplierId:null,subtotal:2000,iva:320,paymentMethod:'Transferencia',bankId:1,reference:'TRX-002',projectId:'',scope:'General',notes:'Dato demo'}
];
const atlasInvoices=[
  {id:'FAC-2026-0001',date:'2026-09-18',clientId:1,projectId:'P-13217',kind:'Proyecto',concept:'Avance proyecto CCTV Nave 3',subtotal:100000,iva:16000,total:116000,paymentTerms:'PPD',dueDate:'2026-10-18',satStatus:'Demo · no timbrada'},
  {id:'FAC-2026-0002',date:'2026-09-08',clientId:2,projectId:'P-13244',kind:'Proyecto',concept:'Anticipo control de acceso planta',subtotal:40000,iva:6400,total:46400,paymentTerms:'PPD',dueDate:'2026-09-20',satStatus:'Demo · no timbrada'}
];
const atlasPayments=[
  {id:'PAG-0001',date:'2026-09-25',invoiceId:'FAC-2026-0001',amount:50000,bankId:1,reference:'DEP-001',repStatus:'Pendiente de timbrado'}
];
const atlasCreditNotes=[];
const atlasBankMovements=[
  {id:'BM-0001',date:'2026-09-12',bankId:1,type:'Salida',concept:'Gasto G-0001 · Renta de plataforma elevadora',amount:4408,relation:'G-0001'},
  {id:'BM-0002',date:'2026-09-15',bankId:1,type:'Salida',concept:'Gasto G-0002 · Internet oficina',amount:2320,relation:'G-0002'},
  {id:'BM-0003',date:'2026-09-25',bankId:1,type:'Entrada',concept:'Cobro FAC-2026-0001',amount:50000,relation:'PAG-0001'}
];

function atlasSeq(prefix,rows,pad){
  let max=0;rows.forEach(function(x){const m=String(x.id||'').match(/(\d+)$/);if(m)max=Math.max(max,+m[1])});
  return prefix+String(max+1).padStart(pad||4,'0');
}
function atlasExpenseTotal(e){return (+e.subtotal||0)+(+e.iva||0)}
function atlasInvoiceCredits(inv){return atlasCreditNotes.filter(function(n){return n.invoiceId===inv.id}).reduce(function(s,n){return s+(+n.amount||0)},0)}
function atlasInvoiceEffectiveTotal(inv){return Math.max(0,(+inv.total||0)-atlasInvoiceCredits(inv))}
function atlasInvoicePaid(inv){return atlasPayments.filter(function(p){return p.invoiceId===inv.id}).reduce(function(s,p){return s+(+p.amount||0)},0)}
function atlasInvoiceBalance(inv){return Math.max(0,atlasInvoiceEffectiveTotal(inv)-atlasInvoicePaid(inv))}
function atlasInvoiceStatus(inv){
  const bal=atlasInvoiceBalance(inv),paid=atlasInvoicePaid(inv);
  if(bal<=0)return 'Pagada';
  if(inv.dueDate&&new Date(inv.dueDate+'T23:59:59')<new Date())return 'Vencida';
  return paid>0?'Parcial':'Pendiente';
}
function atlasProjectExpense(p){return atlasExpenses.filter(function(e){return e.scope==='Proyecto'&&e.projectId===p.id}).reduce(function(s,e){return s+(+e.subtotal||0)},0)}
const atlasProjectCurrentMarginR8Base=atlasProjectCurrentMargin;
atlasProjectCurrentMargin=function(p){
  const baseCost=(+p.real>0?+p.real:+p.budget)||0;
  const expense=atlasProjectExpense(p);
  return p.sale?((p.sale-baseCost-expense)/p.sale*100):0;
};
function atlasBankBalance(a){
  const moves=atlasBankMovements.filter(function(m){return m.bankId===a.id});
  return (+a.openingBalance||0)+moves.reduce(function(s,m){return s+(m.type==='Entrada'?+m.amount:-m.amount)},0);
}
function atlasFinanceTotals(){
  const invoiced=atlasInvoices.reduce(function(s,i){return s+atlasInvoiceEffectiveTotal(i)},0);
  const collected=atlasInvoices.reduce(function(s,i){return s+atlasInvoicePaid(i)},0);
  const receivable=atlasInvoices.reduce(function(s,i){return s+atlasInvoiceBalance(i)},0);
  const overdue=atlasInvoices.filter(function(i){return atlasInvoiceStatus(i)==='Vencida'}).reduce(function(s,i){return s+atlasInvoiceBalance(i)},0);
  const expenses=atlasExpenses.reduce(function(s,e){return s+e.subtotal},0);
  return {invoiced,collected,receivable,overdue,expenses};
}

/* ---------- Finanzas ---------- */
function atlasFinanceTabs(){
  const tabs=[['expenses','Registro de gasto'],['ar','Cuentas por cobrar'],['banks','Bancos'],['movements','Movimientos bancarios']];
  return '<div class="tabs">'+tabs.map(function(x){return '<button class="tab finance-tab '+(state.financeTab===x[0]?'active':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>';
}
function atlasExpenseForm(){
  return '<div class="card panel"><div class="project-header"><div><h3>Registrar gasto</h3><p class="muted">Un gasto puede afectar un proyecto específico o la operación general.</p></div><button id="expense-cancel" class="ghost">Cancelar</button></div>'
   +'<div class="grid-2"><div><label>Fecha</label><input id="exp-date" class="input" type="date" style="width:100%" value="2026-09-28"></div><div><label>Concepto</label><input id="exp-concept" class="input" style="width:100%" placeholder="Descripción del gasto"></div>'
   +'<div><label>Categoría</label><select id="exp-category" class="select" style="width:100%">'+atlasExpenseCategories.map(function(x){return '<option>'+x+'</option>'}).join('')+'</select></div><div><label>Proveedor (opcional)</label><select id="exp-supplier" class="select" style="width:100%"><option value="">— Sin proveedor —</option>'+atlasActiveSuppliers().map(function(s){return atlasOpt(s.id,'',s.name)}).join('')+'</select></div>'
   +'<div><label>Importe antes de IVA</label><input id="exp-subtotal" class="input" type="number" min="0" step="0.01" style="width:100%" value="0"></div><div><label>IVA</label><input id="exp-iva" class="input" type="number" min="0" step="0.01" style="width:100%" value="0"></div>'
   +'<div><label>Ámbito</label><select id="exp-scope" class="select" style="width:100%"><option>General</option><option>Proyecto</option></select></div><div><label>Proyecto asociado</label><select id="exp-project" class="select" style="width:100%"><option value="">— No aplica —</option>'+projects.map(function(p){return atlasOpt(p.id,'',p.id+' · '+p.name)}).join('')+'</select></div>'
   +'<div><label>Forma de pago</label><select id="exp-method" class="select" style="width:100%"><option>Transferencia</option><option>Tarjeta</option><option>Cheque</option><option>Efectivo</option></select></div><div><label>Cuenta bancaria</label><select id="exp-bank" class="select" style="width:100%"><option value="">— No aplica —</option>'+atlasBankAccounts.filter(function(a){return a.active}).map(function(a){return atlasOpt(a.id,'',a.name+' · '+a.currency)}).join('')+'</select></div>'
   +'<div><label>Referencia</label><input id="exp-ref" class="input" style="width:100%"></div><div><label>Observaciones</label><input id="exp-notes" class="input" style="width:100%"></div></div>'
   +'<div class="note" style="margin-top:12px">Para rentabilidad de proyecto, Atlas usa el importe antes de IVA. El tratamiento fiscal definitivo se configurará al conectar contabilidad/facturación real.</div>'
   +'<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button id="expense-save" class="primary">Guardar gasto</button></div></div>';
}
function atlasExpenseList(){
  const meta=atlasPageData(atlasExpenses.slice().reverse(),state.expensePage);state.expensePage=meta.page;
  const projectExpense=atlasExpenses.filter(function(e){return e.scope==='Proyecto'}).reduce(function(s,e){return s+e.subtotal},0);
  const generalExpense=atlasExpenses.filter(function(e){return e.scope==='General'}).reduce(function(s,e){return s+e.subtotal},0);
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Gastos registrados</div><div class="value">'+atlasExpenses.length+'</div></div><div class="card kpi"><div class="label">Gasto proyectos</div><div class="value">'+fmt(projectExpense)+'</div><div class="delta">Impacta rentabilidad</div></div><div class="card kpi"><div class="label">Gasto general</div><div class="value">'+fmt(generalExpense)+'</div></div><div class="card kpi"><div class="label">IVA registrado</div><div class="value">'+fmt(atlasExpenses.reduce(function(s,e){return s+e.iva},0))+'</div></div></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Fecha</th><th>Concepto</th><th>Ámbito</th><th>Proyecto</th><th>Subtotal</th><th>IVA</th><th>Total</th></tr></thead><tbody>'+meta.rows.map(function(e){return '<tr><td><strong>'+e.id+'</strong></td><td>'+e.date+'</td><td>'+e.concept+'</td><td>'+chip(e.scope,e.scope==='Proyecto'?'blue':'gray')+'</td><td>'+(e.projectId||'—')+'</td><td>'+fmt(e.subtotal)+'</td><td>'+fmt(e.iva)+'</td><td>'+fmt(atlasExpenseTotal(e))+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'expenses')+'</div>';
}
function atlasAccountsReceivable(){
  const rows=atlasInvoices.filter(function(i){return atlasInvoiceBalance(i)>0}).map(function(i){const c=clients.find(function(x){return x.id===i.clientId});return {i,c}});
  const meta=atlasPageData(rows,state.arPage);state.arPage=meta.page;
  const t=atlasFinanceTotals();
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Facturado vigente</div><div class="value">'+fmt(t.invoiced)+'</div></div><div class="card kpi"><div class="label">Cobrado</div><div class="value">'+fmt(t.collected)+'</div></div><div class="card kpi"><div class="label">Por cobrar</div><div class="value">'+fmt(t.receivable)+'</div></div><div class="card kpi"><div class="label">Vencido</div><div class="value">'+fmt(t.overdue)+'</div></div></div>'
   +'<div class="card panel"><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Factura</th><th>Proyecto</th><th>Total vigente</th><th>Cobrado</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>'+meta.rows.map(function(x){return '<tr><td><strong>'+(x.c?x.c.name:'')+'</strong></td><td>'+x.i.id+'</td><td>'+(x.i.projectId||'Libre')+'</td><td>'+fmt(atlasInvoiceEffectiveTotal(x.i))+'</td><td>'+fmt(atlasInvoicePaid(x.i))+'</td><td><strong>'+fmt(atlasInvoiceBalance(x.i))+'</strong></td><td>'+x.i.dueDate+'</td><td>'+chip(atlasInvoiceStatus(x.i),atlasInvoiceStatus(x.i)==='Vencida'?'red':atlasInvoiceStatus(x.i)==='Parcial'?'orange':'blue')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'ar')+'</div>';
}
function atlasBanks(){
  return '<div class="card panel"><div class="project-header"><div><h3>Bancos</h3><p class="muted">Cuentas administrativas de la empresa. No es conciliación bancaria automática.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Banco</th><th>Cuenta</th><th>Moneda</th><th>Saldo inicial</th><th>Saldo demo</th><th>Estado</th></tr></thead><tbody>'+atlasBankAccounts.map(function(a){return '<tr><td>'+a.bank+'</td><td><strong>'+a.name+'</strong> · ****'+a.last4+'</td><td>'+a.currency+'</td><td>'+fmt(a.openingBalance)+'</td><td><strong>'+fmt(atlasBankBalance(a))+'</strong></td><td>'+chip(a.active?'Activa':'Inactiva',a.active?'green':'gray')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
function atlasBankMoves(){
  const meta=atlasPageData(atlasBankMovements.slice().reverse(),state.bankMovePage);state.bankMovePage=meta.page;
  return '<div class="card panel"><h3>Movimientos bancarios</h3><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Concepto</th><th>Relación</th><th>Importe</th></tr></thead><tbody>'+meta.rows.map(function(m){const a=atlasBankAccounts.find(function(x){return x.id===m.bankId});return '<tr><td>'+m.date+'</td><td>'+(a?a.name:'')+'</td><td>'+chip(m.type,m.type==='Entrada'?'green':'orange')+'</td><td>'+m.concept+'</td><td>'+m.relation+'</td><td><strong>'+fmt(m.amount)+'</strong></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'bankMoves')+'</div>';
}
function finanzas(){
  setHead('Finanzas','Administración financiera',state.financeTab==='expenses'?'Registrar gasto':'');
  const primary=document.querySelector('#primary-action');if(primary&&state.financeTab==='expenses')primary.onclick=function(){state.financeMode='new';render()};
  setTimeout(function(){
    document.querySelectorAll('.finance-tab').forEach(function(b){b.onclick=function(){state.financeTab=b.dataset.tab;state.financeMode='list';render()}});
    const cancel=document.querySelector('#expense-cancel');if(cancel)cancel.onclick=function(){state.financeMode='list';render()};
    const save=document.querySelector('#expense-save');if(save)save.onclick=function(){
      const scope=document.querySelector('#exp-scope').value,projectId=document.querySelector('#exp-project').value;
      const subtotal=+document.querySelector('#exp-subtotal').value||0,iva=+document.querySelector('#exp-iva').value||0;
      if(!document.querySelector('#exp-concept').value.trim()||subtotal<=0){state.financeMessage='Concepto e importe son obligatorios.';render();return}
      if(scope==='Proyecto'&&!projectId){state.financeMessage='Selecciona el proyecto al que corresponde el gasto.';render();return}
      const e={id:atlasSeq('G-',atlasExpenses,4),date:document.querySelector('#exp-date').value,concept:document.querySelector('#exp-concept').value.trim(),category:document.querySelector('#exp-category').value,supplierId:+document.querySelector('#exp-supplier').value||null,subtotal,iva,paymentMethod:document.querySelector('#exp-method').value,bankId:+document.querySelector('#exp-bank').value||null,reference:document.querySelector('#exp-ref').value.trim(),projectId:scope==='Proyecto'?projectId:'',scope,notes:document.querySelector('#exp-notes').value.trim()};
      atlasExpenses.push(e);
      if(e.bankId&&e.paymentMethod!=='Efectivo')atlasBankMovements.push({id:atlasSeq('BM-',atlasBankMovements,4),date:e.date,bankId:e.bankId,type:'Salida',concept:'Gasto '+e.id+' · '+e.concept,amount:atlasExpenseTotal(e),relation:e.id});
      state.financeMode='list';state.financeMessage='';state.expensePage=1;render();
    };
    atlasBindPagination();
  },0);
  let body=state.financeTab==='ar'?atlasAccountsReceivable():state.financeTab==='banks'?atlasBanks():state.financeTab==='movements'?atlasBankMoves():(state.financeMode==='new'?atlasExpenseForm():atlasExpenseList());
  return '<div class="project-header"><div><h2 style="margin:0 0 6px">Finanzas</h2><p class="muted" style="margin:0">Gastos, cartera y bancos permanecen separados de la operación del proyecto.</p></div>'+chip('Acceso financiero','blue')+'</div>'+atlasFinanceTabs()+(state.financeMessage?'<div class="note" style="margin:12px 0"><strong>'+state.financeMessage+'</strong></div>':'')+body;
}

/* ---------- Facturación administrativa (sin PAC/timbrado todavía) ---------- */
function atlasBillingTabs(){
  const tabs=[['projects','Proyectos'],['free','Factura libre'],['issued','Facturas emitidas'],['payments','Pagos / REP'],['credits','Notas de crédito']];
  return '<div class="tabs">'+tabs.map(function(x){return '<button class="tab billing-tab '+(state.billingTab===x[0]?'active':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>';
}
function atlasProjectInvoicedSubtotal(pid){return atlasInvoices.filter(function(i){return i.projectId===pid}).reduce(function(s,i){const creditTotal=atlasCreditNotes.filter(function(n){return n.invoiceId===i.id}).reduce(function(a,n){return a+(+n.amount||0)},0),ratio=i.total?i.subtotal/i.total:1;return s+(+i.subtotal||0)-creditTotal*ratio},0)}
function atlasBillingProjects(){
  return '<div class="card panel"><h3>Facturación desde proyectos</h3><p class="muted">Finanzas selecciona aquí el proyecto. El módulo Proyectos no muestra botones de facturación.</p><div class="table-wrap"><table class="table"><thead><tr><th>Proyecto</th><th>Cliente</th><th>Venta aprobada</th><th>Facturado (subtotal)</th><th>Base pendiente</th><th></th></tr></thead><tbody>'+projects.map(function(p){const inv=atlasProjectInvoicedSubtotal(p.id),pending=Math.max(0,p.sale-inv);return '<tr><td><strong>'+p.id+'</strong><br><span class="muted">'+p.name+'</span></td><td>'+p.client+'</td><td>'+fmt(p.sale)+'</td><td>'+fmt(inv)+'</td><td>'+fmt(pending)+'</td><td><button class="primary billing-project" data-id="'+p.id+'">Preparar factura</button></td></tr>'}).join('')+'</tbody></table></div><div class="note" style="margin-top:14px">La demo usa la venta aprobada como referencia de base. En producción se conservarán explícitamente subtotal, IVA, retenciones y moneda desde la cotización aceptada.</div></div>';
}
function atlasBillingDraftView(d){
  const client=clients.find(function(c){return c.id===+d.clientId});
  return '<div class="card panel"><div class="project-header"><div><h3>'+(d.kind==='Proyecto'?'Preparar factura de proyecto':'Preparar factura libre')+'</h3><p class="muted">Documento administrativo de demo. Aún no timbra CFDI ni se conecta a PAC/SAT.</p></div><button id="bill-cancel" class="ghost">Cancelar</button></div>'
   +'<div class="grid-2"><div><label>Cliente</label>'+(d.kind==='Proyecto'?'<input class="input" style="width:100%" disabled value="'+(client?client.name:'')+'">':'<select id="bill-client" class="select" style="width:100%">'+clients.filter(function(c){return c.active!==false}).map(function(c){return atlasOpt(c.id,d.clientId,c.name)}).join('')+'</select>')+'</div>'
   +'<div><label>Proyecto</label><input class="input" style="width:100%" disabled value="'+(d.projectId||'Factura libre')+'"></div>'
   +'<div style="grid-column:1/-1"><label>Concepto</label><input id="bill-concept" class="input" style="width:100%" value="'+d.concept+'"></div>'
   +'<div><label>Subtotal</label><input id="bill-subtotal" class="input" type="number" min="0" step="0.01" style="width:100%" value="'+d.subtotal+'"></div><div><label>IVA %</label><input id="bill-iva-rate" class="input" type="number" min="0" step="0.01" style="width:100%" value="'+d.ivaRate+'"></div>'
   +'<div><label>Método</label><select id="bill-terms" class="select" style="width:100%"><option '+(d.paymentTerms==='PUE'?'selected':'')+'>PUE</option><option '+(d.paymentTerms==='PPD'?'selected':'')+'>PPD</option></select></div><div><label>Vencimiento</label><input id="bill-due" class="input" type="date" style="width:100%" value="'+d.dueDate+'"></div></div>'
   +'<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button id="bill-save" class="primary">Guardar factura demo</button></div></div>';
}
function atlasBillingIssued(){
  const meta=atlasPageData(atlasInvoices.slice().reverse(),state.invoicePage);state.invoicePage=meta.page;
  return '<div class="card panel"><h3>Facturas emitidas</h3><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Proyecto</th><th>Total vigente</th><th>Cobrado</th><th>Saldo</th><th>Estado</th><th>CFDI</th></tr></thead><tbody>'+meta.rows.map(function(i){const c=clients.find(function(x){return x.id===i.clientId});return '<tr><td><strong>'+i.id+'</strong></td><td>'+i.date+'</td><td>'+(c?c.name:'')+'</td><td>'+(i.projectId||'Libre')+'</td><td>'+fmt(atlasInvoiceEffectiveTotal(i))+'</td><td>'+fmt(atlasInvoicePaid(i))+'</td><td>'+fmt(atlasInvoiceBalance(i))+'</td><td>'+chip(atlasInvoiceStatus(i),atlasInvoiceStatus(i)==='Vencida'?'red':atlasInvoiceStatus(i)==='Pagada'?'green':'orange')+'</td><td><span class="muted">'+i.satStatus+'</span></td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'invoices')+'</div>';
}
function atlasPaymentView(){
  const open=atlasInvoices.filter(function(i){return atlasInvoiceBalance(i)>0});
  const meta=atlasPageData(atlasPayments.slice().reverse(),state.paymentPage);state.paymentPage=meta.page;
  return '<div class="grid-2"><div class="card panel"><h3>Registrar pago</h3><div class="grid-2"><div style="grid-column:1/-1"><label>Factura</label><select id="pay-invoice" class="select" style="width:100%">'+open.map(function(i){return atlasOpt(i.id,'',i.id+' · saldo '+fmt(atlasInvoiceBalance(i)))}).join('')+'</select></div><div><label>Fecha</label><input id="pay-date" class="input" type="date" value="2026-09-28"></div><div><label>Importe</label><input id="pay-amount" class="input" type="number" min="0" step="0.01"></div><div><label>Banco</label><select id="pay-bank" class="select">'+atlasBankAccounts.filter(function(a){return a.active}).map(function(a){return atlasOpt(a.id,'',a.name)}).join('')+'</select></div><div><label>Referencia</label><input id="pay-ref" class="input"></div></div><button id="pay-save" class="primary" style="margin-top:14px">Registrar pago</button><div class="note" style="margin-top:12px">Si la factura es PPD, Atlas marca el REP como pendiente hasta conectar el PAC.</div></div>'
   +'<div class="card panel"><h3>Pagos registrados</h3><div class="table-wrap"><table class="table"><thead><tr><th>Pago</th><th>Fecha</th><th>Factura</th><th>Importe</th><th>REP</th></tr></thead><tbody>'+meta.rows.map(function(p){return '<tr><td><strong>'+p.id+'</strong></td><td>'+p.date+'</td><td>'+p.invoiceId+'</td><td>'+fmt(p.amount)+'</td><td>'+chip(p.repStatus,p.repStatus.includes('Pendiente')?'orange':'green')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'payments')+'</div></div>';
}
function atlasCreditView(){
  const meta=atlasPageData(atlasCreditNotes.slice().reverse(),state.creditPage);state.creditPage=meta.page;
  return '<div class="grid-2"><div class="card panel"><h3>Nueva nota de crédito</h3><div><label>Factura relacionada</label><select id="credit-invoice" class="select" style="width:100%">'+atlasInvoices.map(function(i){return atlasOpt(i.id,'',i.id+' · '+fmt(atlasInvoiceEffectiveTotal(i)))}).join('')+'</select></div><div class="grid-2" style="margin-top:10px"><div><label>Fecha</label><input id="credit-date" class="input" type="date" value="2026-09-28"></div><div><label>Importe total</label><input id="credit-amount" class="input" type="number" min="0" step="0.01"></div></div><div style="margin-top:10px"><label>Motivo</label><input id="credit-reason" class="input" style="width:100%"></div><button id="credit-save" class="primary" style="margin-top:14px">Guardar nota demo</button></div>'
   +'<div class="card panel"><h3>Notas de crédito</h3><div class="table-wrap"><table class="table"><thead><tr><th>Folio</th><th>Fecha</th><th>Factura</th><th>Motivo</th><th>Importe</th></tr></thead><tbody>'+(meta.rows.length?meta.rows.map(function(n){return '<tr><td><strong>'+n.id+'</strong></td><td>'+n.date+'</td><td>'+n.invoiceId+'</td><td>'+n.reason+'</td><td>'+fmt(n.amount)+'</td></tr>'}).join(''):'<tr><td colspan="5" class="muted">Sin notas de crédito registradas.</td></tr>')+'</tbody></table></div>'+atlasPagination(meta,'credits')+'</div></div>';
}
function atlasNewProjectBilling(pid){
  const p=projects.find(function(x){return x.id===pid}),c=clients.find(function(x){return x.name===p.client||x.tradeName===p.client||x.legalName===p.client});
  const pending=Math.max(0,p.sale-atlasProjectInvoicedSubtotal(p.id));
  return {kind:'Proyecto',projectId:p.id,clientId:c?c.id:null,concept:'Facturación '+p.name,subtotal:pending,ivaRate:16,paymentTerms:'PPD',dueDate:'2026-10-28'};
}
function atlasNewFreeBilling(){const c=clients.find(function(x){return x.active!==false});return {kind:'Libre',projectId:'',clientId:c?c.id:null,concept:'',subtotal:0,ivaRate:16,paymentTerms:'PUE',dueDate:'2026-09-28'}}
function atlasSaveBillingDraft(){
  const d=state.billingDraft;if(!d)return;
  if(d.kind==='Libre')d.clientId=+document.querySelector('#bill-client').value;
  d.concept=document.querySelector('#bill-concept').value.trim();d.subtotal=+document.querySelector('#bill-subtotal').value||0;d.ivaRate=+document.querySelector('#bill-iva-rate').value||0;d.paymentTerms=document.querySelector('#bill-terms').value;d.dueDate=document.querySelector('#bill-due').value;
  if(!d.clientId||!d.concept||d.subtotal<=0){state.billingMessage='Cliente, concepto e importe son obligatorios.';render();return}
  const iva=d.subtotal*d.ivaRate/100;
  atlasInvoices.push({id:atlasSeq('FAC-2026-',atlasInvoices,4),date:'2026-09-28',clientId:d.clientId,projectId:d.projectId,kind:d.kind,concept:d.concept,subtotal:d.subtotal,iva,total:d.subtotal+iva,paymentTerms:d.paymentTerms,dueDate:d.dueDate,satStatus:'Demo · no timbrada'});
  state.billingDraft=null;state.billingTab='issued';state.billingMessage='Factura administrativa creada. No se timbró CFDI.';state.invoicePage=1;render();
}
function facturacion(){
  setHead('Facturación','Finanzas','');
  setTimeout(function(){
    document.querySelectorAll('.billing-tab').forEach(function(b){b.onclick=function(){state.billingTab=b.dataset.tab;state.billingDraft=null;state.billingMessage='';render()}});
    document.querySelectorAll('.billing-project').forEach(function(b){b.onclick=function(){state.billingDraft=atlasNewProjectBilling(b.dataset.id);render()}});
    const cancel=document.querySelector('#bill-cancel');if(cancel)cancel.onclick=function(){state.billingDraft=null;render()};
    const save=document.querySelector('#bill-save');if(save)save.onclick=atlasSaveBillingDraft;
    const pay=document.querySelector('#pay-save');if(pay)pay.onclick=function(){
      const invoice=atlasInvoices.find(function(i){return i.id===document.querySelector('#pay-invoice').value}),amount=+document.querySelector('#pay-amount').value||0;
      if(!invoice||amount<=0||amount>atlasInvoiceBalance(invoice)){state.billingMessage='El pago debe ser mayor a cero y no puede superar el saldo de la factura.';render();return}
      const p={id:atlasSeq('PAG-',atlasPayments,4),date:document.querySelector('#pay-date').value,invoiceId:invoice.id,amount,bankId:+document.querySelector('#pay-bank').value,reference:document.querySelector('#pay-ref').value.trim(),repStatus:invoice.paymentTerms==='PPD'?'Pendiente de timbrado':'No aplica'};
      atlasPayments.push(p);atlasBankMovements.push({id:atlasSeq('BM-',atlasBankMovements,4),date:p.date,bankId:p.bankId,type:'Entrada',concept:'Cobro '+invoice.id,amount:p.amount,relation:p.id});state.paymentPage=1;render();
    };
    const credit=document.querySelector('#credit-save');if(credit)credit.onclick=function(){
      const invoice=atlasInvoices.find(function(i){return i.id===document.querySelector('#credit-invoice').value}),amount=+document.querySelector('#credit-amount').value||0,reason=document.querySelector('#credit-reason').value.trim();
      if(!invoice||amount<=0||amount>atlasInvoiceEffectiveTotal(invoice)||!reason){state.billingMessage='Selecciona factura, motivo e importe válido.';render();return}
      atlasCreditNotes.push({id:atlasSeq('NC-',atlasCreditNotes,4),date:document.querySelector('#credit-date').value,invoiceId:invoice.id,amount,reason});state.creditPage=1;render();
    };
    atlasBindPagination();
  },0);
  let body;
  if(state.billingDraft)body=atlasBillingDraftView(state.billingDraft);
  else if(state.billingTab==='free'){state.billingDraft=atlasNewFreeBilling();body=atlasBillingDraftView(state.billingDraft)}
  else if(state.billingTab==='issued')body=atlasBillingIssued();
  else if(state.billingTab==='payments')body=atlasPaymentView();
  else if(state.billingTab==='credits')body=atlasCreditView();
  else body=atlasBillingProjects();
  return '<div class="project-header"><div><h2 style="margin:0 0 6px">Facturación</h2><p class="muted" style="margin:0">La acción de facturar vive aquí, no dentro del Proyecto.</p></div>'+chip('Acceso financiero','blue')+'</div>'+atlasBillingTabs()+(state.billingMessage?'<div class="note" style="margin:12px 0"><strong>'+state.billingMessage+'</strong></div>':'')+body;
}

/* ---------- Dashboards / Reportes financieros ---------- */
function atlasFinanceDashboard(){
  const t=atlasFinanceTotals();
  return '<div class="atlas-dashboard-hero"><div><span>CONTROL FINANCIERO</span><h2>Finanzas</h2><p>Facturación, cartera, cobros y gastos bajo acceso financiero.</p></div>'+chip('Finanzas','blue')+'</div><div class="atlas-kpi-six"><div class="card kpi"><div class="label">Facturado</div><div class="value">'+fmt(t.invoiced)+'</div></div><div class="card kpi"><div class="label">Cobrado</div><div class="value">'+fmt(t.collected)+'</div></div><div class="card kpi"><div class="label">Por cobrar</div><div class="value">'+fmt(t.receivable)+'</div></div><div class="card kpi"><div class="label">Vencido</div><div class="value">'+fmt(t.overdue)+'</div></div><div class="card kpi"><div class="label">Gastos</div><div class="value">'+fmt(t.expenses)+'</div></div><div class="card kpi"><div class="label">Facturas abiertas</div><div class="value">'+atlasInvoices.filter(function(i){return atlasInvoiceBalance(i)>0}).length+'</div></div></div>'+atlasAccountsReceivable();
}
const atlasDashboardR8Base=dashboard;
dashboard=function(){
  if(state.role==='Finanzas'){setHead('Dashboard','Finanzas','');return atlasFinanceDashboard()}
  return atlasDashboardR8Base();
};
const atlasDirectionDashboardR8Base=atlasDirectionDashboard;
atlasDirectionDashboard=function(){
  const base=atlasDirectionDashboardR8Base(),t=atlasFinanceTotals();
  return base+'<div class="card panel" style="margin-top:16px"><div class="project-header"><div><h3>Lectura financiera</h3><p class="muted">Indicadores disponibles a partir de Finanzas y Facturación.</p></div>'+chip('Dirección','blue')+'</div><div class="atlas-kpi-four"><div class="metric-box"><small>Facturado</small><strong>'+fmt(t.invoiced)+'</strong></div><div class="metric-box"><small>Cobrado</small><strong>'+fmt(t.collected)+'</strong></div><div class="metric-box"><small>Por cobrar</small><strong>'+fmt(t.receivable)+'</strong></div><div class="metric-box"><small>Vencido</small><strong>'+fmt(t.overdue)+'</strong></div></div></div>';
};

const atlasReportTabsR8Base=atlasReportTabs;
atlasReportTabs=function(){
  const tabs=[['resumen','Resumen'],['comercial','Comercial'],['proyectos','Proyectos / rentabilidad'],['clientes','Clientes'],['inventario','Inventario'],['compras','Compras'],['mano','Mano de obra'],['finanzas','Finanzas'],['facturacion','Facturación']];
  return '<div class="tabs atlas-report-tabs">'+tabs.map(function(x){return '<button class="tab report-tab '+(state.reportTab===x[0]?'active':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>';
};
function atlasReportFinance(){
  const t=atlasFinanceTotals();
  return '<div class="atlas-kpi-four"><div class="card kpi"><div class="label">Facturado</div><div class="value">'+fmt(t.invoiced)+'</div></div><div class="card kpi"><div class="label">Cobrado</div><div class="value">'+fmt(t.collected)+'</div></div><div class="card kpi"><div class="label">Por cobrar</div><div class="value">'+fmt(t.receivable)+'</div></div><div class="card kpi"><div class="label">Gastos</div><div class="value">'+fmt(t.expenses)+'</div></div></div>'+atlasAccountsReceivable();
}
function atlasReportBilling(){return atlasBillingIssued()}
const atlasReportCurrentBodyR8Base=atlasReportCurrentBody;
atlasReportCurrentBody=function(){if(state.reportTab==='finanzas')return atlasReportFinance();if(state.reportTab==='facturacion')return atlasReportBilling();return atlasReportCurrentBodyR8Base()};
const atlasReportExportRowsR8Base=atlasReportExportRows;
atlasReportExportRows=function(){
  if(state.reportTab==='finanzas')return atlasExpenses.map(function(e){return {Folio:e.id,Fecha:e.date,Concepto:e.concept,Ámbito:e.scope,Proyecto:e.projectId,Subtotal:e.subtotal,IVA:e.iva,Total:atlasExpenseTotal(e)}});
  if(state.reportTab==='facturacion')return atlasInvoices.map(function(i){const c=clients.find(function(x){return x.id===i.clientId});return {Factura:i.id,Fecha:i.date,Cliente:c?c.name:'',Proyecto:i.projectId,Subtotal:i.subtotal,IVA:i.iva,'Total vigente':atlasInvoiceEffectiveTotal(i),Cobrado:atlasInvoicePaid(i),Saldo:atlasInvoiceBalance(i),Estado:atlasInvoiceStatus(i)}});
  return atlasReportExportRowsR8Base();
};

/* ---------- Paginación financiera ---------- */
const atlasBindPaginationR8Base=atlasBindPagination;
atlasBindPagination=function(){
  atlasBindPaginationR8Base();
  const map={expenses:'expensePage',ar:'arPage',bankMoves:'bankMovePage',invoices:'invoicePage',payments:'paymentPage',credits:'creditPage'};
  Object.keys(map).forEach(function(k){document.querySelectorAll('.atlas-page-btn[data-key="'+k+'"]').forEach(function(b){b.onclick=function(){state[map[k]]=+b.dataset.page;render()}})});
};

/* ---------- Render final R8: módulos independientes ---------- */
const atlasRenderR8Base=render;
render=function(){
  if((state.page==='finanzas'||state.page==='facturacion')&&!state.quote){
    nav();
    document.querySelector('#content').innerHTML=state.page==='finanzas'?finanzas():facturacion();
    setTimeout(function(){atlasBindRoleSwitcher();atlasInitSidebar();atlasBindPagination()},0);
    return;
  }
  atlasRenderR8Base();
};


/* R8 startup: paint the final navigation after all R8 modules and permissions exist */
render();



/* ===== review-r9.js ===== */
/* Atlas Integrador — revisión R9: multimoneda MXN/USD + tipo de cambio histórico */
state.fxMessage=state.fxMessage||'';
state.fxRefreshing=state.fxRefreshing||false;

const atlasFxSettings={
  baseCurrency:'MXN',
  allowedCurrencies:['MXN','USD'],
  source:'Frankfurter · referencia diaria combinada',
  sourceKey:'frankfurter',
  referenceRate:17.6816,
  referenceDate:'2026-09-28',
  lastUpdated:'2026-09-28',
  protectionPct:0,
  manualOverride:false,
  manualRate:17.6816
};

clients.forEach(function(c,i){
  if(!c.allowedCurrencies)c.allowedCurrencies=i===0?['MXN','USD']:['MXN'];
  if(!c.preferredCurrency)c.preferredCurrency=i===0?'USD':'MXN';
});
inventory.forEach(function(i){
  if(!i.currency)i.currency='MXN';
});
atlasPurchaseOrders.forEach(function(po){
  if(!po.currency)po.currency='MXN';
  if(!po.fxAppliedRate)po.fxAppliedRate=1;
  if(!po.fxReferenceRate)po.fxReferenceRate=po.fxAppliedRate;
  if(!po.fxDate)po.fxDate='2026-09-28';
});
atlasInvoices.forEach(function(inv){
  if(!inv.currency)inv.currency='MXN';
  if(!inv.fxAppliedRate)inv.fxAppliedRate=1;
});
projects.forEach(function(p){
  if(!p.documentCurrency)p.documentCurrency='MXN';
  if(!p.fxAppliedRate)p.fxAppliedRate=1;
});

function atlasMoney(v,currency){
  return new Intl.NumberFormat('es-MX',{style:'currency',currency:currency||'MXN',maximumFractionDigits:2}).format(Number(v)||0)+' '+(currency||'MXN');
}
function atlasFxReference(){return atlasFxSettings.manualOverride?(+atlasFxSettings.manualRate||atlasFxSettings.referenceRate):atlasFxSettings.referenceRate}
function atlasFxApplied(){
  const ref=atlasFxReference();
  return ref*(1+(+atlasFxSettings.protectionPct||0)/100);
}
function atlasRefreshFx(doRender){
  if(atlasFxSettings.manualOverride)return Promise.resolve(atlasFxReference());
  state.fxRefreshing=true;
  return fetch('https://api.frankfurter.dev/v2/rate/usd/mxn')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
    .then(function(d){
      if(!(d&&+d.rate>0))throw new Error('Respuesta sin tasa');
      atlasFxSettings.referenceRate=+d.rate;
      atlasFxSettings.referenceDate=d.date||new Date().toISOString().slice(0,10);
      atlasFxSettings.lastUpdated=new Date().toISOString();
      state.fxMessage='Tipo de cambio actualizado.';
      return atlasFxSettings.referenceRate;
    })
    .catch(function(){
      state.fxMessage='No se pudo actualizar la referencia automática. Atlas conserva el último TC disponible.';
      return atlasFxSettings.referenceRate;
    })
    .finally(function(){state.fxRefreshing=false;if(doRender)render()});
}
function atlasQuoteNeedsFx(q){
  return !!q&&(q.currency==='USD'||(q.materials||[]).some(function(x){return (x.costCurrency||'MXN')==='USD'}));
}
function atlasEnsureQuoteFx(q,force){
  if(!q)return;
  if(!atlasQuoteNeedsFx(q)){q.fxReferenceRate=1;q.fxAppliedRate=1;q.fxDate='';q.fxSource='';return}
  if(force||!(+q.fxAppliedRate>1)){
    q.fxReferenceRate=atlasFxReference();
    q.fxAppliedRate=atlasFxApplied();
    q.fxDate=atlasFxSettings.referenceDate;
    q.fxSource=atlasFxSettings.source;
    q.fxProtectionPct=+atlasFxSettings.protectionPct||0;
  }
}
function atlasMaterialSource(x){
  const inv=inventory.find(function(i){return i.model===x.model});
  return {
    amount:+(x.costSource!=null?x.costSource:(inv?inv.cost:x.cost))||0,
    currency:x.costCurrency||(inv&&inv.currency)||'MXN'
  };
}
function atlasMaterialCostMXN(x,q){
  const src=atlasMaterialSource(x);
  if(src.currency==='USD'){atlasEnsureQuoteFx(q,false);return src.amount*(+q.fxAppliedRate||atlasFxApplied())}
  return src.amount;
}
function atlasMaterialSaleMXN(x,q){return atlasMaterialCostMXN(x,q)*(1+(+x.markup||0)/100)}
function atlasToQuoteCurrency(mx,q){
  if(q&&q.currency==='USD'){atlasEnsureQuoteFx(q,false);return mx/(+q.fxAppliedRate||atlasFxApplied())}
  return mx;
}
function atlasQuoteMoney(mx,q){return atlasMoney(atlasToQuoteCurrency(mx,q),q&&q.currency||'MXN')}

/* ---------- Configuración: monedas y TC ---------- */
const atlasConfigMenuR9Base=atlasConfigMenu;
atlasConfigMenu=function(){
  const items=[
    ['personal','Personal y mano de obra'],
    ['access','Usuarios, roles y accesos'],
    ['clients','Clientes'],
    ['suppliers','Proveedores'],
    ['fx','Monedas y tipo de cambio'],
    ['folios','Consecutivos'],
    ['catalogs','Inventario y catálogos'],
    ['company','Empresa y documentos']
  ];
  return '<div class="card panel atlas-config-menu" style="padding:10px">'+items.map(function(x){return '<button class="'+(state.configTab===x[0]?'primary':'ghost')+' ctab" data-tab="'+x[0]+'" style="width:100%;text-align:left;margin:4px 0">'+x[1]+'</button>'}).join('')+'</div>';
};
function atlasConfigFx(){
  const applied=atlasFxApplied();
  return '<div class="card panel"><div class="project-header"><div><h3>Monedas y tipo de cambio</h3><p class="muted">Moneda base contable MXN. Los documentos pueden operar en MXN o USD y conservan su TC histórico.</p></div>'+chip('MXN / USD','blue')+'</div>'
    +'<div class="atlas-kpi-four"><div class="metric-box"><small>TC referencia USD/MXN</small><strong>'+atlasFxReference().toFixed(4)+'</strong></div><div class="metric-box"><small>Protección cambiaria</small><strong>'+Number(atlasFxSettings.protectionPct).toFixed(2)+'%</strong></div><div class="metric-box"><small>TC aplicado nuevo</small><strong>'+applied.toFixed(4)+'</strong></div><div class="metric-box"><small>Fecha referencia</small><strong style="font-size:16px">'+atlasFxSettings.referenceDate+'</strong></div></div>'
    +'<div class="grid-2" style="margin-top:14px"><div><label>Fuente automática</label><select id="fx-source" class="select" style="width:100%"><option value="frankfurter" selected>Frankfurter · referencia diaria</option><option value="manual">Manual / política de empresa</option></select></div><div><label>Margen de protección %</label><input id="fx-protection" class="input" type="number" step="0.01" style="width:100%" value="'+atlasFxSettings.protectionPct+'"></div>'
    +'<div><label>TC manual USD/MXN</label><input id="fx-manual-rate" class="input" type="number" min="0" step="0.0001" style="width:100%" value="'+atlasFxSettings.manualRate+'"></div><div><label>Usar TC manual</label><select id="fx-manual" class="select" style="width:100%"><option value="no" '+(!atlasFxSettings.manualOverride?'selected':'')+'>No · automático</option><option value="si" '+(atlasFxSettings.manualOverride?'selected':'')+'>Sí · autorizado</option></select></div></div>'
    +'<div class="toolbar" style="margin-top:14px"><button id="fx-refresh" class="primary">'+(state.fxRefreshing?'Actualizando…':'Actualizar TC ahora')+'</button><button id="fx-save" class="secondary">Guardar política</button></div>'
    +(state.fxMessage?'<div class="note" style="margin-top:12px"><strong>'+state.fxMessage+'</strong></div>':'')
    +'<div class="note" style="margin-top:12px"><strong>Regla Atlas:</strong> cambiar el TC global solo afecta documentos nuevos o borradores cuando se actualizan explícitamente. Cotizaciones enviadas, proyectos, OC y facturas conservan el TC con el que fueron generados.</div>'
    +'<div class="note" style="margin-top:12px">La referencia automática de esta demo usa una API pública de tasas diarias. En una implantación mexicana se podrá configurar Banxico FIX, el banco del cliente o una política corporativa como fuente oficial.</div></div>';
}
const atlasConfigR9Base=config;
config=function(){
  if(state.configTab!=='fx')return atlasConfigR9Base();
  setHead('Configuración','Administración','');
  setTimeout(function(){
    document.querySelectorAll('.ctab').forEach(function(b){b.onclick=function(){state.configTab=b.dataset.tab;render()}});
    const refresh=document.querySelector('#fx-refresh');if(refresh)refresh.onclick=function(){atlasRefreshFx(true)};
    const save=document.querySelector('#fx-save');if(save)save.onclick=function(){
      atlasFxSettings.protectionPct=+document.querySelector('#fx-protection').value||0;
      atlasFxSettings.manualRate=+document.querySelector('#fx-manual-rate').value||atlasFxSettings.referenceRate;
      atlasFxSettings.manualOverride=document.querySelector('#fx-manual').value==='si';
      atlasFxSettings.sourceKey=atlasFxSettings.manualOverride?'manual':'frankfurter';
      atlasFxSettings.source=atlasFxSettings.manualOverride?'Manual / política de empresa':'Frankfurter · referencia diaria combinada';
      state.fxMessage='Política de moneda guardada para la demo.';render();
    };
  },0);
  return '<div class="atlas-config-layout">'+atlasConfigMenu()+'<div class="atlas-config-content">'+atlasConfigFx()+'</div></div>';
};

/* ---------- Clientes: moneda permitida / preferida ---------- */
const atlasConfigClientsR9Base=atlasConfigClients;
atlasConfigClients=function(){
  let h=atlasConfigClientsR9Base();
  const edit=state.clientAdminId==='new'?null:clients.find(function(c){return c.id===+state.clientAdminId});
  const form=edit||{allowedCurrencies:['MXN'],preferredCurrency:'MXN'};
  if(state.clientAdminId){
    const both=(form.allowedCurrencies||[]).includes('USD');
    const fxFields='<div><label>Monedas permitidas</label><select id="ca-currencies" class="select" style="width:100%"><option value="MXN" '+(!both?'selected':'')+'>Solo MXN</option><option value="MXN,USD" '+(both?'selected':'')+'>MXN y USD</option></select></div><div><label>Moneda preferida</label><select id="ca-preferred" class="select" style="width:100%"><option '+(form.preferredCurrency==='MXN'?'selected':'')+'>MXN</option><option '+(form.preferredCurrency==='USD'?'selected':'')+'>USD</option></select></div>';
    h=h.replace('<div style="grid-column:1/-1"><label>Dirección</label>',fxFields+'<div style="grid-column:1/-1"><label>Dirección</label>');
  }
  return h;
};
const atlasConfigR9ClientBase=config;
config=function(){
  const html=atlasConfigR9ClientBase();
  if(state.configTab==='clients'){
    setTimeout(function(){
      const save=document.querySelector('#client-admin-save');
      if(save&&!save.dataset.fxwrapped){
        save.dataset.fxwrapped='1';
        const old=save.onclick;
        save.onclick=function(){
          const rfc=document.querySelector('#ca-rfc')?.value.trim().toUpperCase()||'';
          const allowed=(document.querySelector('#ca-currencies')?.value||'MXN').split(',');
          let preferred=document.querySelector('#ca-preferred')?.value||'MXN';
          if(allowed.indexOf(preferred)<0)preferred='MXN';
          if(old)old();
          const c=clients.find(function(x){return atlasNormRFC(x.rfc)===atlasNormRFC(rfc)});
          if(c){c.allowedCurrencies=allowed;c.preferredCurrency=preferred;render()}
        };
      }
    },0);
  }
  return html;
};

/* ---------- Cotizaciones: costo fuente + TC del documento ---------- */
const atlasQuoteTotalsR9Base=quoteTotals;
quoteTotals=function(q){
  q=q||state.quote;
  if(!q)return atlasQuoteTotalsR9Base(q);
  atlasEnsureQuoteFx(q,false);
  let mcMXN=(q.materials||[]).reduce(function(s,x){return s+(+x.qty||0)*atlasMaterialCostMXN(x,q)},0);
  let msMXN=(q.materials||[]).reduce(function(s,x){return s+(+x.qty||0)*atlasMaterialSaleMXN(x,q)},0);
  let lcMXN=(q.laborRows||[]).reduce(function(s,x){return s+laborRowCost(x)},0);
  let lsMXN=(q.laborRows||[]).reduce(function(s,x){return s+laborRowCost(x)*(1+(+x.markup||0)/100)},0);
  let baseMXN=mcMXN+lcMXN;
  let indMXN=lcMXN*(q.indirect?.safety||0)+lcMXN*(q.indirect?.tools||0)+baseMXN*(q.indirect?.general||0)+baseMXN*(q.indirect?.field||0)+baseMXN*(q.indirect?.finance||0)+(+q.truckDays||0)*(+q.truckDaily||0);
  let subtotalMXN=msMXN+lsMXN+indMXN;
  let ivaMXN=subtotalMXN*((+q.ivaRate||0)/100);
  let isrMXN=q.retainISR?subtotalMXN*((+q.isrRate||0)/100):0;
  let totalMXN=subtotalMXN+ivaMXN-isrMXN;
  let costMXN=mcMXN+lcMXN;
  const conv=function(v){return atlasToQuoteCurrency(v,q)};
  return {mc:conv(mcMXN),ms:conv(msMXN),lc:conv(lcMXN),ls:conv(lsMXN),ind:conv(indMXN),subtotal:conv(subtotalMXN),iva:conv(ivaMXN),isr:conv(isrMXN),total:conv(totalMXN),margin:subtotalMXN?(subtotalMXN-costMXN)/subtotalMXN*100:0,
    mcMXN,msMXN,lcMXN,lsMXN,indMXN,subtotalMXN,ivaMXN,isrMXN,totalMXN,costMXN};
};

const atlasNewQuoteR9Base=newQuote;
newQuote=function(clientId){
  atlasNewQuoteR9Base(clientId);
  if(!state.quote)return;
  state.quote.materials.forEach(function(x){
    const inv=inventory.find(function(i){return i.model===x.model});
    if(inv){x.costSource=+inv.cost||+x.cost||0;x.costCurrency=inv.currency||'MXN'}
  });
  if(clientId){
    const c=clients.find(function(x){return x.id===+clientId});
    if(c)state.quote.currency=c.preferredCurrency||'MXN';
  }
  atlasEnsureQuoteFx(state.quote,true);
  renderQuote();
};

function atlasDecorateQuoteCurrency(){
  const q=state.quote;if(!q)return;
  q.materials.forEach(function(x){const inv=inventory.find(function(i){return i.model===x.model});if(inv&&x.costSource==null){x.costSource=+inv.cost||+x.cost||0;x.costCurrency=inv.currency||'MXN'}});
  atlasEnsureQuoteFx(q,false);
  const c=clients.find(function(x){return x.id===q.clientId});
  if(q.step===1){
    document.querySelectorAll('.pick-client-r5,.pick-client').forEach(function(b){
      b.onclick=function(){
        q.clientId=+b.dataset.id;
        const cc=clients.find(function(x){return x.id===q.clientId});
        q.currency=cc?.preferredCurrency||'MXN';
        atlasEnsureQuoteFx(q,true);
        q.step=2;renderQuote();
      };
    });
  }
  if(q.step===2){
    const cur=document.querySelector('#qcur');
    if(cur){
      const allowed=(c&&c.allowedCurrencies&&c.allowedCurrencies.length?c.allowedCurrencies:['MXN']);
      cur.innerHTML=allowed.map(function(x){return '<option '+(x===q.currency?'selected':'')+'>'+x+'</option>'}).join('');
      if(allowed.indexOf(q.currency)<0)q.currency=allowed[0];
      cur.onchange=function(e){q.currency=e.target.value;atlasEnsureQuoteFx(q,true);renderQuote()};
      const note=document.querySelector('#qbody .note');
      if(note){
        const needs=atlasQuoteNeedsFx(q);
        note.insertAdjacentHTML('afterend','<div class="note atlas-fx-quote" style="margin-top:12px"><strong>Moneda:</strong> '+q.currency+(needs?' · <strong>TC referencia:</strong> '+(+q.fxReferenceRate).toFixed(4)+' · <strong>TC aplicado:</strong> '+(+q.fxAppliedRate).toFixed(4)+' MXN/USD · '+(q.fxProtectionPct||0).toFixed(2)+'% protección · '+q.fxDate:' · No requiere conversión USD')+' '+(needs?'<button id="quote-fx-refresh" class="ghost" style="margin-left:8px">Tomar TC actual</button>':'')+'</div>');
        const rf=document.querySelector('#quote-fx-refresh');if(rf)rf.onclick=function(){q.fxReferenceRate=atlasFxReference();q.fxAppliedRate=atlasFxApplied();q.fxDate=atlasFxSettings.referenceDate;q.fxSource=atlasFxSettings.source;q.fxProtectionPct=+atlasFxSettings.protectionPct||0;renderQuote()};
      }
    }
    const next=document.querySelector('#qnext');
    if(next){const old=next.onclick;next.onclick=function(){q.currency=document.querySelector('#qcur')?.value||q.currency;atlasEnsureQuoteFx(q,false);if(old)old()}}
  }
  if(q.step===3){
    const rows=[...document.querySelectorAll('#qbody tbody tr')];
    rows.forEach(function(tr,i){
      const x=q.materials[i];if(!x||!tr.children||tr.children.length<7)return;
      const src=atlasMaterialSource(x),costMXN=atlasMaterialCostMXN(x,q),saleMXN=atlasMaterialSaleMXN(x,q);
      tr.children[3].innerHTML='<strong>'+atlasMoney(src.amount,src.currency)+'</strong><br><span class="muted">Equiv. '+atlasMoney(costMXN,'MXN')+'</span>';
      tr.children[5].textContent=atlasMoney(atlasToQuoteCurrency(saleMXN,q),q.currency);
      tr.children[6].innerHTML='<strong>'+atlasMoney(atlasToQuoteCurrency((+x.qty||0)*saleMXN,q),q.currency)+'</strong>';
    });
    const p=document.querySelector('#qbody p.muted');if(p)p.textContent='El costo conserva su moneda de origen. Atlas convierte costos USD con el TC congelado de esta cotización.';
  }
  if(q.step===4){
    const d=state.laborDraft||null;
    const table=document.querySelector('#qbody table');
    if(d&&table){
      const cost=laborRowCost(d),sale=cost*(1+(+d.markup||0)/100);
      const cells=table.querySelectorAll('tbody tr:first-child td');
      if(cells.length>=6){cells[4].innerHTML='<strong>'+atlasQuoteMoney(cost,q)+'</strong>';cells[5].innerHTML='<strong>'+atlasQuoteMoney(sale,q)+'</strong>'}
    }
    document.querySelectorAll('#qbody h3+div.table-wrap tbody tr').forEach(function(){});
  }
  if(q.step===5){
    const tc=document.querySelector('#truckc');
    if(tc&&q.currency==='USD'){
      tc.value=(+q.truckDaily/(+q.fxAppliedRate||1)).toFixed(2);
      tc.onchange=function(e){q.truckDaily=(+e.target.value||0)*(+q.fxAppliedRate||1);renderQuote()};
      const row=tc.closest('tr');if(row&&row.children.length>=4)row.children[3].textContent=atlasQuoteMoney((+q.truckDays||0)*(+q.truckDaily||0),q);
    }
  }
  if(q.step===6||q.step===7){
    const body=document.querySelector('#qbody');
    if(body)body.insertAdjacentHTML('afterbegin','<div class="note atlas-currency-banner" style="margin-bottom:14px"><strong>Documento en '+q.currency+'</strong>'+(atlasQuoteNeedsFx(q)?' · TC aplicado y congelado: '+(+q.fxAppliedRate).toFixed(4)+' MXN/USD · '+q.fxDate:'')+'</div>');
  }
  ['save-quote','mark-sent'].forEach(function(id){
    const b=document.querySelector('#'+id);if(!b||b.dataset.fxwrapped)return;b.dataset.fxwrapped='1';const old=b.onclick;
    b.onclick=function(){
      atlasEnsureQuoteFx(q,false);
      if(old)old();
      const row=quotes.find(function(x){return x.id===q.id});
      if(row){row.currency=q.currency;row.fxReferenceRate=q.fxReferenceRate;row.fxAppliedRate=q.fxAppliedRate;row.fxDate=q.fxDate;row.fxSource=q.fxSource;if(row.snapshot){Object.assign(row.snapshot,{currency:q.currency,fxReferenceRate:q.fxReferenceRate,fxAppliedRate:q.fxAppliedRate,fxDate:q.fxDate,fxSource:q.fxSource})}}
    };
  });
}
const atlasRenderQuoteR9Base=renderQuote;
renderQuote=function(){atlasRenderQuoteR9Base();setTimeout(atlasDecorateQuoteCurrency,0)};

/* Cotizaciones guardadas: moneda visible */
const atlasCotizacionesR9Base=cotizaciones;
cotizaciones=function(){
  const h=atlasCotizacionesR9Base();
  setTimeout(function(){
    document.querySelectorAll('#content tbody tr').forEach(function(tr){
      const id=tr.children&&tr.children[0]?tr.children[0].innerText.trim().split(/\s/)[0]:'';
      const q=quotes.find(function(x){return x.id===id});
      if(q&&tr.children.length>=8){tr.children[7].innerHTML='<strong>'+atlasMoney(q.total,q.currency||'MXN')+'</strong>'}
    });
  },0);
  return h;
};

/* Cotización detalle/PDF con TC histórico */
const atlasQuoteDetailR9Base=quoteDetailView;
quoteDetailView=function(){
  const h=atlasQuoteDetailR9Base();
  const row=quotes.find(function(x){return x.id===state.quoteDetail});
  if(!row)return h;
  const cur=row.currency||row.snapshot?.currency||'MXN',fx=row.fxAppliedRate||row.snapshot?.fxAppliedRate||1,date=row.fxDate||row.snapshot?.fxDate||'';
  return h.replace('<div class="metric-strip">','<div class="note" style="margin:0 0 14px"><strong>Moneda del documento:</strong> '+cur+(cur==='USD'?' · <strong>TC histórico:</strong> '+Number(fx).toFixed(4)+' MXN/USD · '+date:'')+'</div><div class="metric-strip">');
};

atlasQuotePdf=function(){
  const q=state.quote;if(!q)return;atlasEnsureQuoteFx(q,false);
  const {jsPDF}=window.jspdf,doc=new jsPDF(),c=clients.find(function(x){return x.id===q.clientId}),t=quoteTotals(q);
  const fm=function(v){return atlasMoney(v,q.currency)};
  doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',14,16);doc.setFontSize(11);doc.text('Cotización '+q.id+' · Rev. '+q.revision,14,25);
  doc.text('Cliente: '+(c?.name||''),14,34);doc.text('Moneda: '+q.currency,14,41);
  if(atlasQuoteNeedsFx(q))doc.text('TC aplicado: '+(+q.fxAppliedRate).toFixed(4)+' MXN/USD · '+q.fxDate,14,48);
  doc.text('Proyecto: '+(q.name||''),14,atlasQuoteNeedsFx(q)?55:48);
  let y=atlasQuoteNeedsFx(q)?65:58;
  if(q.scope){doc.setFontSize(10);doc.text('Alcance: '+q.scope,14,y,{maxWidth:180});y+=18}
  doc.setFontSize(13);doc.text('Materiales',14,y);y+=5;
  doc.autoTable({startY:y,head:[['Descripción','Cant.','P. Unitario','Importe']],body:(q.materials||[]).map(function(x){const unit=atlasToQuoteCurrency(atlasMaterialSaleMXN(x,q),q);return [x.model+' · '+x.desc,x.qty,fm(unit),fm((+x.qty||0)*unit)]}),theme:'striped'});
  y=doc.lastAutoTable.finalY+12;
  if(q.laborRows.length){doc.setFontSize(13);doc.text('Mano de obra',14,y);doc.autoTable({startY:y+5,head:[['Actividad','Importe']],body:groupedLabor(q).map(function(g){return [g.activity,fm(atlasToQuoteCurrency(g.items.reduce(function(s,x){return s+laborRowCost(x)*(1+x.markup/100)},0),q))]}),theme:'striped'});y=doc.lastAutoTable.finalY+12}
  doc.autoTable({startY:y,body:[['Subtotal',fm(t.subtotal)],['IVA '+q.ivaRate+'%',fm(t.iva)],['TOTAL',fm(t.total)]],theme:'plain',styles:{fontStyle:'bold'},columnStyles:{0:{halign:'right'},1:{halign:'right'}}});
  doc.setFontSize(9);doc.text('Condiciones de pago: '+q.payment+' · Entrega: '+q.delivery+' · Vigencia: '+q.validity,14,doc.lastAutoTable.finalY+12,{maxWidth:180});
  doc.save('Cotizacion-'+q.id+'.pdf');
};

/* Aceptación: proyecto canónico MXN + documento original congelado */
const atlasAcceptQuoteR9Base=acceptQuoteDemo;
acceptQuoteDemo=function(row,q){
  atlasEnsureQuoteFx(q,false);
  const cur=q.currency||'MXN',rate=cur==='USD'?(+q.fxAppliedRate||1):1,t=quoteTotals(q);
  const doc={currency:cur,fxReferenceRate:q.fxReferenceRate||1,fxAppliedRate:rate,fxDate:q.fxDate||'',fxSource:q.fxSource||'',sale:t.subtotal,cost:t.mc+t.lc+t.ind};
  atlasAcceptQuoteR9Base(row,q);
  const p=projects.find(function(x){return x.id===row.projectId});if(!p)return;
  p.documentCurrency=cur;p.fxAppliedRate=rate;p.fxReferenceRate=doc.fxReferenceRate;p.fxDate=doc.fxDate;p.fxSource=doc.fxSource;
  p.documentSale=doc.sale;p.documentCost=doc.cost;
  if(cur==='USD'){
    p.sale=doc.sale*rate;p.budget=doc.cost*rate;
    if(p.baseline){
      p.baseline.documentCurrency='USD';p.baseline.documentSale=doc.sale;p.baseline.documentCost=doc.cost;
      p.baseline.fxAppliedRate=rate;p.baseline.fxReferenceRate=doc.fxReferenceRate;p.baseline.fxDate=doc.fxDate;p.baseline.fxSource=doc.fxSource;
      p.baseline.sale*=rate;p.baseline.cost*=rate;p.baseline.costMaterial*=rate;p.baseline.costLabor*=rate;p.baseline.costIndirect*=rate;
    }
  }
  render();
};
const atlasProjectDetailR9Base=projectDetailView;
projectDetailView=function(p){
  const h=atlasProjectDetailR9Base(p);if(!p||p.documentCurrency!=='USD')return h;
  return h.replace('<div class="metric-strip">','<div class="note" style="margin-bottom:14px"><strong>Origen comercial:</strong> '+atlasMoney(p.documentSale,'USD')+' · TC congelado '+Number(p.fxAppliedRate).toFixed(4)+' MXN/USD · equivalente base '+atlasMoney(p.sale,'MXN')+'</div><div class="metric-strip">');
};

/* ---------- Inventario: costo en moneda de origen ---------- */
const atlasInventarioR9Base=inventario;
inventario=function(){
  const h=atlasInventarioR9Base();
  setTimeout(function(){
    document.querySelectorAll('#content tbody tr').forEach(function(tr){
      const model=tr.children&&tr.children[0]?tr.children[0].innerText.trim():'';
      const i=inventory.find(function(x){return x.model===model});
      if(i&&tr.children.length>=7){
        const mx=i.currency==='USD'?(+i.cost||0)*atlasFxApplied():(+i.cost||0);
        tr.children[6].innerHTML='<strong>'+atlasMoney(i.cost,i.currency||'MXN')+'</strong>'+(i.currency==='USD'?'<br><span class="muted">Ref. '+atlasMoney(mx,'MXN')+'</span>':'');
      }
    });
  },0);
  return h;
};

/* ---------- Compras multimoneda ---------- */
atlasNewPurchaseDraft=function(){
  const supplier=atlasActiveSuppliers()[0]||null;
  const cur=supplier?.currency||'MXN';
  return {supplierId:supplier?supplier.id:null,projectId:projects[0]?projects[0].id:'',currency:cur,fxReferenceRate:cur==='USD'?atlasFxReference():1,fxAppliedRate:cur==='USD'?atlasFxApplied():1,fxDate:cur==='USD'?atlasFxSettings.referenceDate:'',lines:[],message:''};
};
function atlasEnsurePurchaseFx(d,force){
  if(!d)return;if(d.currency!=='USD'){d.fxReferenceRate=1;d.fxAppliedRate=1;d.fxDate='';return}
  if(force||!(+d.fxAppliedRate>1)){d.fxReferenceRate=atlasFxReference();d.fxAppliedRate=atlasFxApplied();d.fxDate=atlasFxSettings.referenceDate}
}
atlasPurchaseNewView=function(){
  const d=state.purchaseDraft||(state.purchaseDraft=atlasNewPurchaseDraft());atlasEnsurePurchaseFx(d,false);
  const supplier=atlasSuppliers.find(function(s){return s.id===+d.supplierId});
  let h='<div class="card panel"><div class="project-header"><div><h3>Nueva orden de compra</h3><p class="muted">La OC conserva moneda y TC histórico. Almacén recibe cantidades; no modifica costos.</p></div><button id="po-back" class="ghost">← Compras</button></div>';
  h+='<div class="grid-2"><div><label>Proveedor</label><select id="po-supplier" class="select" style="width:100%">'+atlasActiveSuppliers().map(function(s){return atlasOpt(s.id,d.supplierId,s.name+' · habitual '+s.currency)}).join('')+'</select></div><div><label>Proyecto</label><select id="po-project" class="select" style="width:100%">'+projects.map(function(p){return atlasOpt(p.id,d.projectId,p.id+' · '+p.name)}).join('')+'</select></div>';
  h+='<div><label>Moneda OC</label><select id="po-currency" class="select" style="width:100%">'+['MXN','USD'].map(function(c){return atlasOpt(c,d.currency)}).join('')+'</select></div><div><label>TC aplicado</label><div class="toolbar"><input id="po-fx" class="input" type="number" step="0.0001" style="width:160px" value="'+(d.currency==='USD'?Number(d.fxAppliedRate).toFixed(4):'1.0000')+'" '+(d.currency==='USD'?'':'disabled')+'><button id="po-fx-current" class="ghost" '+(d.currency==='USD'?'':'disabled')+'>Tomar TC actual</button></div></div></div>';
  if(supplier)h+='<div class="note" style="margin-top:12px"><strong>'+supplier.name+'</strong> · '+(supplier.paymentTerms||'Sin condiciones registradas')+(d.currency==='USD'?' · TC '+Number(d.fxAppliedRate).toFixed(4)+' · '+d.fxDate:'')+'</div>';
  h+='<div class="note" style="margin-top:14px"><strong>Agregar partida</strong><div class="toolbar" style="margin-top:10px"><select id="po-item" class="select" style="min-width:360px">'+inventory.filter(function(i){return i.active!==false}).map(function(i){return atlasOpt(i.id,'',i.model+' · '+i.brand+' · costo '+atlasMoney(i.cost,i.currency||'MXN'))}).join('')+'</select><input id="po-qty" class="input" type="number" min="1" value="1" style="width:90px"><input id="po-cost" class="input" type="number" min="0" step="0.01" value="0" style="width:120px" placeholder="Costo unitario"><button id="po-add-line" class="primary">+ Agregar</button></div></div>';
  h+='<div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Modelo</th><th>Descripción</th><th>Cantidad</th><th>Costo unitario</th><th>Importe</th><th>Equiv. MXN</th><th></th></tr></thead><tbody>';
  h+=(d.lines.length?d.lines.map(function(l,i){const item=inventory.find(function(x){return x.model===l.model}),imp=l.qty*l.cost,mxn=d.currency==='USD'?imp*d.fxAppliedRate:imp;return '<tr><td><strong>'+l.model+'</strong></td><td>'+(item?item.desc:'')+'</td><td>'+l.qty+'</td><td>'+atlasMoney(l.cost,d.currency)+'</td><td>'+atlasMoney(imp,d.currency)+'</td><td>'+atlasMoney(mxn,'MXN')+'</td><td><button class="ghost po-remove-line" data-i="'+i+'">Quitar</button></td></tr>'}).join(''):'<tr><td colspan="7" class="muted">Aún no hay partidas en la orden.</td></tr>');
  const total=atlasPurchaseDraftTotal(d),mxn=d.currency==='USD'?total*d.fxAppliedRate:total;
  h+='</tbody></table></div><div class="purchase-total"><span>Total OC</span><strong>'+atlasMoney(total,d.currency)+'</strong><span class="muted">Equiv. '+atlasMoney(mxn,'MXN')+'</span></div>';
  if(d.message)h+='<div class="note" style="margin-top:12px"><strong>'+d.message+'</strong></div>';
  h+='<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button id="po-cancel" class="ghost">Cancelar</button><button id="po-save" class="primary">Guardar OC</button></div></div>';return h;
};
atlasBindPurchaseNew=function(){
  const d=state.purchaseDraft,close=function(){state.purchaseMode='list';state.purchaseDraft=null;render()};
  const back=document.querySelector('#po-back'),cancel=document.querySelector('#po-cancel');if(back)back.onclick=close;if(cancel)cancel.onclick=close;
  const sup=document.querySelector('#po-supplier');if(sup)sup.onchange=function(e){d.supplierId=+e.target.value;const s=atlasSuppliers.find(function(x){return x.id===d.supplierId});d.currency=s?.currency||'MXN';atlasEnsurePurchaseFx(d,true);render()};
  const pr=document.querySelector('#po-project');if(pr)pr.onchange=function(e){d.projectId=e.target.value};
  const cur=document.querySelector('#po-currency');if(cur)cur.onchange=function(e){d.currency=e.target.value;atlasEnsurePurchaseFx(d,true);render()};
  const fx=document.querySelector('#po-fx');if(fx)fx.onchange=function(e){d.fxAppliedRate=+e.target.value||atlasFxApplied();render()};
  const fxnow=document.querySelector('#po-fx-current');if(fxnow)fxnow.onclick=function(){atlasEnsurePurchaseFx(d,true);render()};
  const item=document.querySelector('#po-item'),cost=document.querySelector('#po-cost');
  const syncCost=function(){const inv=inventory.find(function(i){return i.id===+item.value});if(!inv)return;let mxn=inv.currency==='USD'?inv.cost*atlasFxApplied():inv.cost;cost.value=(d.currency==='USD'?mxn/d.fxAppliedRate:mxn).toFixed(2)};
  if(item&&cost){item.onchange=syncCost;if(!+cost.value)syncCost()}
  const add=document.querySelector('#po-add-line');if(add)add.onclick=function(){const inv=inventory.find(function(i){return i.id===+item.value}),qty=+document.querySelector('#po-qty').value||0,c=+cost.value||0;if(!inv||qty<=0||c<0)return;const old=d.lines.find(function(l){return l.model===inv.model});if(old){old.qty+=qty;old.cost=c}else d.lines.push({model:inv.model,qty:qty,received:0,cost:c});render()};
  document.querySelectorAll('.po-remove-line').forEach(function(b){b.onclick=function(){d.lines.splice(+b.dataset.i,1);render()}});
  const save=document.querySelector('#po-save');if(save)save.onclick=function(){
    const supplier=atlasSuppliers.find(function(s){return s.id===+d.supplierId&&s.active!==false});
    if(!supplier||!d.projectId||!d.lines.length){d.message='Proveedor, proyecto y al menos una partida son obligatorios.';render();return}
    atlasEnsurePurchaseFx(d,false);
    atlasPurchaseOrders.unshift({id:atlasPurchaseNextNumber(),projectId:d.projectId,supplier:supplier.name,supplierId:supplier.id,currency:d.currency,fxReferenceRate:d.fxReferenceRate,fxAppliedRate:d.fxAppliedRate,fxDate:d.fxDate,lines:d.lines.map(function(l){return Object.assign({},l)})});
    state.purchaseMode='list';state.purchaseDraft=null;state.purchasePage=1;render();
  };
};
atlasPurchaseListView=function(){
  const meta=atlasPageData(atlasPurchaseOrders,state.purchasePage);state.purchasePage=meta.page;
  return '<div class="card panel"><h3>Órdenes de compra / recepciones</h3><p class="muted">Cada OC conserva su moneda y tipo de cambio histórico.</p><div class="table-wrap"><table class="table"><thead><tr><th>OC</th><th>Proyecto</th><th>Proveedor</th><th>Moneda / TC</th><th>Total compra</th><th>Equiv. MXN</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>'+meta.rows.map(function(po){const qty=po.lines.reduce(function(s,x){return s+x.qty},0),rec=po.lines.reduce(function(s,x){return s+x.received},0),amount=po.lines.reduce(function(s,x){return s+x.qty*x.cost},0),cur=po.currency||'MXN',rate=cur==='USD'?(+po.fxAppliedRate||1):1;return '<tr><td><strong>#'+po.id+'</strong></td><td>'+po.projectId+'</td><td>'+po.supplier+'</td><td>'+cur+(cur==='USD'?'<br><span class="muted">'+rate.toFixed(4)+' · '+po.fxDate+'</span>':'')+'</td><td>'+atlasMoney(amount,cur)+'</td><td>'+atlasMoney(amount*rate,'MXN')+'</td><td>'+rec+' / '+qty+'</td><td>'+chip(atlasPoStatus(po),atlasPoStatus(po)==='Completa'?'green':atlasPoStatus(po)==='Parcial'?'orange':'blue')+'</td></tr>'}).join('')+'</tbody></table></div>'+atlasPagination(meta,'purchases')+'</div>';
};

/* ---------- Facturación: conserva moneda del proyecto/documento ---------- */
const atlasNewProjectBillingR9Base=atlasNewProjectBilling;
atlasNewProjectBilling=function(pid){
  const d=atlasNewProjectBillingR9Base(pid),p=projects.find(function(x){return x.id===pid});
  d.currency=p?.documentCurrency||'MXN';d.fxAppliedRate=d.currency==='USD'?(p.fxAppliedRate||atlasFxApplied()):1;d.fxReferenceRate=p?.fxReferenceRate||d.fxAppliedRate;d.fxDate=p?.fxDate||atlasFxSettings.referenceDate;
  if(d.currency==='USD'){
    const invoiced=atlasInvoices.filter(function(i){return i.projectId===pid&&i.currency==='USD'}).reduce(function(s,i){return s+(+i.subtotal||0)},0);
    d.subtotal=Math.max(0,(p.documentSale||p.sale/d.fxAppliedRate)-invoiced);
  }
  return d;
};
const atlasNewFreeBillingR9Base=atlasNewFreeBilling;
atlasNewFreeBilling=function(){const d=atlasNewFreeBillingR9Base();d.currency='MXN';d.fxAppliedRate=1;d.fxReferenceRate=1;d.fxDate='';return d};
const atlasBillingDraftViewR9Base=atlasBillingDraftView;
atlasBillingDraftView=function(d){
  let h=atlasBillingDraftViewR9Base(d);
  const extra='<div><label>Moneda</label><select id="bill-currency" class="select" style="width:100%"><option '+(d.currency==='MXN'?'selected':'')+'>MXN</option><option '+(d.currency==='USD'?'selected':'')+'>USD</option></select></div><div><label>TC aplicado</label><input id="bill-fx" class="input" type="number" step="0.0001" style="width:100%" value="'+(d.currency==='USD'?Number(d.fxAppliedRate||atlasFxApplied()).toFixed(4):'1.0000')+'" '+(d.currency==='USD'?'':'disabled')+'></div>';
  h=h.replace('<div><label>Método</label>',extra+'<div><label>Método</label>');
  return h;
};
const atlasSaveBillingDraftR9Base=atlasSaveBillingDraft;
atlasSaveBillingDraft=function(){
  const d=state.billingDraft;if(d){
    d.currency=document.querySelector('#bill-currency')?.value||d.currency||'MXN';
    d.fxAppliedRate=d.currency==='USD'?(+document.querySelector('#bill-fx')?.value||atlasFxApplied()):1;
    d.fxReferenceRate=d.currency==='USD'?atlasFxReference():1;
    d.fxDate=d.currency==='USD'?atlasFxSettings.referenceDate:'';
  }
  const before=atlasInvoices.length;atlasSaveBillingDraftR9Base();
  if(atlasInvoices.length>before){const inv=atlasInvoices[atlasInvoices.length-1];inv.currency=d.currency;inv.fxAppliedRate=d.fxAppliedRate;inv.fxReferenceRate=d.fxReferenceRate;inv.fxDate=d.fxDate;render()}
};
const atlasBillingIssuedR9Base=atlasBillingIssued;
atlasBillingIssued=function(){
  const h=atlasBillingIssuedR9Base();
  setTimeout(function(){
    document.querySelectorAll('#content tbody tr').forEach(function(tr){
      const id=tr.children?.[0]?.innerText.trim(),inv=atlasInvoices.find(function(i){return i.id===id});
      if(inv&&tr.children.length>=7){tr.children[4].innerHTML=atlasMoney(atlasInvoiceEffectiveTotal(inv),inv.currency||'MXN');tr.children[5].innerHTML=atlasMoney(atlasInvoicePaid(inv),inv.currency||'MXN');tr.children[6].innerHTML='<strong>'+atlasMoney(atlasInvoiceBalance(inv),inv.currency||'MXN')+'</strong>'}
    });
  },0);return h;
};
const atlasFinanceTotalsR9Base=atlasFinanceTotals;
atlasFinanceTotals=function(){
  const mx=function(inv,v){return (inv.currency||'MXN')==='USD'?v*(+inv.fxAppliedRate||atlasFxApplied()):v};
  const invoiced=atlasInvoices.reduce(function(s,i){return s+mx(i,atlasInvoiceEffectiveTotal(i))},0);
  const collected=atlasInvoices.reduce(function(s,i){return s+mx(i,atlasInvoicePaid(i))},0);
  const receivable=atlasInvoices.reduce(function(s,i){return s+mx(i,atlasInvoiceBalance(i))},0);
  const overdue=atlasInvoices.filter(function(i){return atlasInvoiceStatus(i)==='Vencida'}).reduce(function(s,i){return s+mx(i,atlasInvoiceBalance(i))},0);
  const expenses=atlasExpenses.reduce(function(s,e){return s+e.subtotal},0);
  return {invoiced,collected,receivable,overdue,expenses};
};

/* ---------- Render/arranque ---------- */
render();
atlasRefreshFx(false);



/* ===== review-r10.js ===== */
/* Atlas Integrador — revisión R10: gráficas ejecutivas inspiradas en INTEREY 360 */
const atlasChartInstances={};

function atlasChartDestroy(id){
  if(atlasChartInstances[id]){
    try{atlasChartInstances[id].destroy()}catch(e){}
    delete atlasChartInstances[id];
  }
}
function atlasChartMoney(v){
  return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v)||0);
}
function atlasChartBaseOptions(extra){
  return Object.assign({
    responsive:true,
    maintainAspectRatio:false,
    animation:{duration:260},
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{position:'top',align:'end',labels:{boxWidth:12,boxHeight:12,usePointStyle:true,font:{size:11}}},
      tooltip:{backgroundColor:'#0f233c',titleColor:'#fff',bodyColor:'#fff',padding:10,cornerRadius:8}
    },
    scales:{
      x:{grid:{display:false},ticks:{color:'#64748b',font:{size:11}}},
      y:{grid:{color:'#e9eef5'},ticks:{color:'#64748b',font:{size:11}}}
    }
  },extra||{});
}
function atlasChartColors(){
  return {
    navy:'#17324d',
    blue:'#315a7d',
    blueSoft:'#8ea9bf',
    teal:'#2f7d73',
    orange:'#c47a1b',
    red:'#b55252',
    gray:'#9aa8b6',
    pale:'#dce5ec'
  };
}
function atlasChartCard(id,title,caption,height){
  return '<div class="card panel atlas-chart-card"><div class="atlas-chart-title"><h3>'+title+'</h3>'+(caption?'<p class="muted">'+caption+'</p>':'')+'</div><div class="atlas-chart-wrap" style="height:'+(height||330)+'px"><canvas id="'+id+'"></canvas></div></div>';
}
function atlasProjectMarginData(rows){
  return rows.slice().sort(function(a,b){return (+a.margin||0)-atlasProjectCurrentMargin(a)-((+b.margin||0)-atlasProjectCurrentMargin(b))}).slice(0,10);
}
function atlasQuoteStatusData(rows){
  const statuses=['Borrador','Enviada','Pendiente','Aceptada','Perdida'];
  return statuses.map(function(s){return {status:s,count:rows.filter(function(q){return q.status===s}).length}}).filter(function(x){return x.count>0});
}
function atlasSpendByCategory(){
  const map={};
  atlasExpenses.forEach(function(e){map[e.category]=(map[e.category]||0)+(+e.subtotal||0)});
  return Object.keys(map).map(function(k){return {name:k,value:map[k]}}).sort(function(a,b){return b.value-a.value});
}
function atlasPurchaseSupplierData(){
  const map={};
  atlasPurchaseOrders.forEach(function(po){
    const rate=(po.currency||'MXN')==='USD'?(+po.fxAppliedRate||1):1;
    const amount=po.lines.reduce(function(s,l){return s+(+l.qty||0)*(+l.cost||0)},0)*rate;
    map[po.supplier]=(map[po.supplier]||0)+amount;
  });
  return Object.keys(map).map(function(k){return {name:k,value:map[k]}}).sort(function(a,b){return b.value-a.value});
}
function atlasLaborPersonData(){
  const map={};
  atlasRealLabor.forEach(function(l){
    const p=personnel.find(function(x){return x.id===+l.personId});
    const name=p?p.name:'Sin asignar';map[name]=(map[name]||0)+atlasLaborCost(l);
  });
  return Object.keys(map).map(function(k){return {name:k,value:map[k]}}).sort(function(a,b){return b.value-a.value});
}
function atlasInventoryStatusData(){
  const statuses=['OK','Bajo','Crítico'];
  return statuses.map(function(s){return {name:s,value:inventory.filter(function(i){return i.active!==false&&atlasInvStatus(i)===s}).length}}).filter(function(x){return x.value>0});
}
function atlasInvoiceStatusData(){
  const statuses=['Pendiente','Parcial','Pagada','Vencida'];
  return statuses.map(function(s){return {name:s,value:atlasInvoices.filter(function(i){return atlasInvoiceStatus(i)===s}).length}}).filter(function(x){return x.value>0});
}

function atlasRenderProjectMarginChart(id,rows){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors(),ps=atlasProjectMarginData(rows);
  atlasChartInstances[id]=new Chart(el,{
    type:'bar',
    data:{labels:ps.map(function(p){return p.id}),datasets:[
      {label:'Margen aprobado',data:ps.map(function(p){return +p.margin||0}),backgroundColor:c.blueSoft,borderRadius:6},
      {label:'Margen actual',data:ps.map(function(p){return +atlasProjectCurrentMargin(p).toFixed(2)}),backgroundColor:c.navy,borderRadius:6}
    ]},
    options:atlasChartBaseOptions({
      plugins:{legend:{position:'top',align:'end',labels:{usePointStyle:true,boxWidth:12}},tooltip:{backgroundColor:'#0f233c',callbacks:{label:function(ctx){return ctx.dataset.label+': '+ctx.parsed.y.toFixed(1)+'%'}}}},
      scales:{x:{grid:{display:false},ticks:{color:'#64748b'}},y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{color:'#64748b',callback:function(v){return v+'%'}}}}
    })
  });
}
function atlasRenderClientSalesChart(id){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors(),rows=atlasClientMetrics().salesByClient.filter(function(x){return x.sale>0}).slice(0,8).reverse();
  atlasChartInstances[id]=new Chart(el,{
    type:'bar',
    data:{labels:rows.map(function(x){return x.client.name}),datasets:[{label:'Venta aprobada',data:rows.map(function(x){return x.sale}),backgroundColor:c.blue,borderRadius:6}]},
    options:atlasChartBaseOptions({
      indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f233c',callbacks:{label:function(ctx){return atlasChartMoney(ctx.parsed.x)}}}},
      scales:{x:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{color:'#64748b',callback:function(v){return '$'+Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:1}).format(v)}}},y:{grid:{display:false},ticks:{color:'#475569',autoSkip:false}}}
    })
  });
}
function atlasRenderFinanceChart(id){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors(),t=atlasFinanceTotals();
  atlasChartInstances[id]=new Chart(el,{
    type:'bar',
    data:{labels:['Facturado','Cobrado','Por cobrar','Vencido'],datasets:[{label:'MXN',data:[t.invoiced,t.collected,t.receivable,t.overdue],backgroundColor:[c.navy,c.teal,c.orange,c.red],borderRadius:7}]},
    options:atlasChartBaseOptions({
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f233c',callbacks:{label:function(ctx){return atlasChartMoney(ctx.parsed.y)}}}},
      scales:{x:{grid:{display:false},ticks:{color:'#475569'}},y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{color:'#64748b',callback:function(v){return '$'+Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:1}).format(v)}}}}
    })
  });
}
function atlasRenderQuoteStatusChart(id,rows){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors(),d=atlasQuoteStatusData(rows);
  atlasChartInstances[id]=new Chart(el,{
    type:'doughnut',
    data:{labels:d.map(function(x){return x.status}),datasets:[{data:d.map(function(x){return x.count}),backgroundColor:[c.gray,c.blue,c.orange,c.teal,c.red],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:10,font:{size:11}}},tooltip:{backgroundColor:'#0f233c'}}}
  });
}
function atlasRenderSimpleMoneyBar(id,data,label,horizontal){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors();
  atlasChartInstances[id]=new Chart(el,{
    type:'bar',
    data:{labels:data.map(function(x){return x.name}),datasets:[{label:label,data:data.map(function(x){return x.value}),backgroundColor:c.blue,borderRadius:6}]},
    options:atlasChartBaseOptions({
      indexAxis:horizontal?'y':'x',
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f233c',callbacks:{label:function(ctx){return atlasChartMoney(horizontal?ctx.parsed.x:ctx.parsed.y)}}}},
      scales:horizontal?{x:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{color:'#64748b',callback:function(v){return '$'+Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:1}).format(v)}}},y:{grid:{display:false},ticks:{color:'#475569',autoSkip:false}}}:{x:{grid:{display:false},ticks:{color:'#475569'}},y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{color:'#64748b',callback:function(v){return '$'+Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:1}).format(v)}}}}
    })
  });
}
function atlasRenderSimpleCountBar(id,data,label){
  const el=document.getElementById(id);if(!el||typeof Chart==='undefined')return;
  atlasChartDestroy(id);const c=atlasChartColors();
  atlasChartInstances[id]=new Chart(el,{
    type:'bar',
    data:{labels:data.map(function(x){return x.name}),datasets:[{label:label,data:data.map(function(x){return x.value}),backgroundColor:[c.teal,c.orange,c.red,c.blue,c.gray],borderRadius:6}]},
    options:atlasChartBaseOptions({plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f233c'}},scales:{x:{grid:{display:false},ticks:{color:'#475569'}},y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{precision:0,color:'#64748b'}}}})
  });
}

/* ---------- Dashboard Dirección ---------- */
const atlasDirectionDashboardR10Base=atlasDirectionDashboard;
atlasDirectionDashboard=function(){
  const base=atlasDirectionDashboardR10Base();
  return base
    +'<div class="atlas-chart-section"><div class="atlas-section-heading"><div><span>LECTURA VISUAL</span><h2>Indicadores ejecutivos</h2><p>Gráficas con la misma filosofía de lectura rápida de INTEREY 360, usando datos nativos de Atlas.</p></div></div>'
    +'<div class="atlas-chart-grid">'+atlasChartCard('atlas-chart-margin','Margen aprobado vs actual','Detecta erosión de rentabilidad por proyecto.',340)+atlasChartCard('atlas-chart-clients','Clientes con mayor venta aprobada','Concentración comercial de la cartera actual.',340)+'</div>'
    +'<div class="atlas-chart-grid">'+atlasChartCard('atlas-chart-finance','Facturación y cobranza','Lectura financiera consolidada en MXN.',320)+atlasChartCard('atlas-chart-quotes','Cotizaciones por estado','Distribución del pipeline comercial cargado.',320)+'</div>'
    +'<div class="note atlas-chart-history-note"><strong>Comparativo mensual multianual:</strong> se activará cuando Atlas tenga histórico mensual suficiente. No se generan meses ficticios para llenar la gráfica.</div></div>';
};
const atlasEngineerDashboardR10Base=atlasEngineerDashboard;
atlasEngineerDashboard=function(){
  const base=atlasEngineerDashboardR10Base(),d=atlasDashboardData(state.demoEngineer);
  return base+'<div class="atlas-chart-grid" style="margin-top:16px">'+atlasChartCard('atlas-chart-engineer-margin','Mi margen aprobado vs actual','Solo proyectos asignados a '+state.demoEngineer+'.',330)+atlasChartCard('atlas-chart-engineer-quotes','Mis cotizaciones por estado','Seguimiento visual de mi cartera comercial.',330)+'</div>';
};

/* ---------- Reportes: una gráfica contextual por pestaña ---------- */
function atlasReportChartMarkup(tab){
  if(tab==='comercial')return atlasChartCard('atlas-report-chart','Cotizaciones por estado','Distribución según los filtros actuales.',320);
  if(tab==='proyectos')return atlasChartCard('atlas-report-chart','Margen aprobado vs actual','Comparación por proyecto según filtros.',350);
  if(tab==='clientes')return atlasChartCard('atlas-report-chart','Top clientes por venta','Concentración de venta aprobada.',340);
  if(tab==='inventario')return atlasChartCard('atlas-report-chart','Inventario por estado','Artículos activos en condición OK, baja o crítica.',300);
  if(tab==='compras')return atlasChartCard('atlas-report-chart','Compras por proveedor','Importe de OC convertido a MXN con el TC histórico de cada orden.',330);
  if(tab==='mano')return atlasChartCard('atlas-report-chart','Costo de mano de obra por persona','Costo real registrado en actividades.',330);
  if(tab==='finanzas')return atlasChartCard('atlas-report-chart','Gastos por categoría','Importes antes de IVA.',330);
  if(tab==='facturacion')return atlasChartCard('atlas-report-chart','Facturas por estado','Pendientes, parciales, pagadas y vencidas.',300);
  if(tab==='resumen')return atlasChartCard('atlas-report-chart','Facturación y cobranza','Resumen financiero disponible en Atlas.',320);
  return '';
}
const atlasReportCurrentBodyR10Base=atlasReportCurrentBody;
atlasReportCurrentBody=function(){
  return atlasReportChartMarkup(state.reportTab)+atlasReportCurrentBodyR10Base();
};

function atlasRenderContextCharts(){
  if(typeof Chart==='undefined')return;
  if(state.page==='dashboard'){
    if(state.role==='Dirección'){
      atlasRenderProjectMarginChart('atlas-chart-margin',projects);
      atlasRenderClientSalesChart('atlas-chart-clients');
      atlasRenderFinanceChart('atlas-chart-finance');
      atlasRenderQuoteStatusChart('atlas-chart-quotes',quotes);
    }else if(state.role==='Ingeniería'){
      const d=atlasDashboardData(state.demoEngineer);
      atlasRenderProjectMarginChart('atlas-chart-engineer-margin',d.ps);
      atlasRenderQuoteStatusChart('atlas-chart-engineer-quotes',d.qs);
    }
  }
  if(state.page==='reportes'){
    if(state.reportTab==='resumen')atlasRenderFinanceChart('atlas-report-chart');
    else if(state.reportTab==='comercial')atlasRenderQuoteStatusChart('atlas-report-chart',atlasReportScopeQuotes());
    else if(state.reportTab==='proyectos')atlasRenderProjectMarginChart('atlas-report-chart',atlasReportScopeProjects());
    else if(state.reportTab==='clientes')atlasRenderClientSalesChart('atlas-report-chart');
    else if(state.reportTab==='inventario')atlasRenderSimpleCountBar('atlas-report-chart',atlasInventoryStatusData(),'Artículos');
    else if(state.reportTab==='compras')atlasRenderSimpleMoneyBar('atlas-report-chart',atlasPurchaseSupplierData(),'Compras MXN',true);
    else if(state.reportTab==='mano')atlasRenderSimpleMoneyBar('atlas-report-chart',atlasLaborPersonData(),'Costo real',true);
    else if(state.reportTab==='finanzas')atlasRenderSimpleMoneyBar('atlas-report-chart',atlasSpendByCategory(),'Gastos',true);
    else if(state.reportTab==='facturacion')atlasRenderSimpleCountBar('atlas-report-chart',atlasInvoiceStatusData(),'Facturas');
  }
}

/* Render final R10 */
const atlasRenderR10Base=render;
render=function(){
  atlasRenderR10Base();
  setTimeout(atlasRenderContextCharts,30);
};
render();


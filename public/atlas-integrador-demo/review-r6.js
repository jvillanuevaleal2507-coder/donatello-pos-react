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

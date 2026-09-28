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

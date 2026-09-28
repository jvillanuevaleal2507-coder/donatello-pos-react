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

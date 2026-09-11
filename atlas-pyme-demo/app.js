const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
const KEY='atlasPymeDemoV1';
const initial={
  business:{name:'Casa Norte'},
  products:[
    {id:1,name:'Lámpara decorativa',category:'Decoración',stock:5,cost:420,price:950},
    {id:2,name:'Buró 2 cajones',category:'Muebles',stock:3,cost:690,price:1450},
    {id:3,name:'Espejo circular',category:'Decoración',stock:2,cost:520,price:1100},
    {id:4,name:'Banco alto',category:'Muebles',stock:6,cost:610,price:1290},
    {id:5,name:'Set de repisas',category:'Hogar',stock:1,cost:280,price:650}
  ],
  sales:[
    {id:101,date:new Date(Date.now()-86400000*1).toISOString(),productId:2,product:'Buró 2 cajones',qty:1,price:1450,cost:690,customer:'Laura'},
    {id:102,date:new Date(Date.now()-86400000*2).toISOString(),productId:1,product:'Lámpara decorativa',qty:2,price:900,cost:420,customer:'Mostrador'},
    {id:103,date:new Date(Date.now()-86400000*4).toISOString(),productId:4,product:'Banco alto',qty:1,price:1290,cost:610,customer:'Carlos'}
  ]
};
let state=load();
function clone(v){return JSON.parse(JSON.stringify(v))}
function load(){try{return JSON.parse(localStorage.getItem(KEY))||clone(initial)}catch{return clone(initial)}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function saleTotal(s){return s.qty*s.price}
function saleProfit(s){return s.qty*(s.price-s.cost)}
function startOfMonth(d=new Date()){return new Date(d.getFullYear(),d.getMonth(),1)}
function isToday(iso){const a=new Date(iso),b=new Date();return a.toDateString()===b.toDateString()}
function notify(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}

function setView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active-view',v.id===id));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  const titles={dashboard:'Resumen del negocio',inventory:'Inventario',sale:'Venta rápida',history:'Historial de ventas'};
  document.getElementById('viewTitle').textContent=titles[id]||'Atlas PyME';
  if(id==='sale')syncSaleForm();
}

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));

function render(){
  document.getElementById('businessName').textContent=state.business.name;
  renderDashboard();renderInventory();renderHistory();populateProducts();
}
function renderDashboard(){
  const now=new Date(),monthStart=startOfMonth(now);
  const today=state.sales.filter(s=>isToday(s.date));
  const month=state.sales.filter(s=>new Date(s.date)>=monthStart);
  const invCost=state.products.reduce((a,p)=>a+p.cost*p.stock,0);
  const invValue=state.products.reduce((a,p)=>a+p.price*p.stock,0);
  const mSales=month.reduce((a,s)=>a+saleTotal(s),0),mProfit=month.reduce((a,s)=>a+saleProfit(s),0);
  document.getElementById('todaySales').textContent=money.format(today.reduce((a,s)=>a+saleTotal(s),0));
  document.getElementById('todayProfit').textContent=money.format(today.reduce((a,s)=>a+saleProfit(s),0));
  document.getElementById('monthSales').textContent=money.format(mSales);
  document.getElementById('monthProfit').textContent=money.format(mProfit);
  document.getElementById('monthTickets').textContent=`${month.length} tickets`;
  document.getElementById('marginPct').textContent=`${mSales?Math.round(mProfit/mSales*100):0}% margen`;
  document.getElementById('inventoryCost').textContent=money.format(invCost);
  document.getElementById('inventoryUnits').textContent=`${state.products.reduce((a,p)=>a+p.stock,0)} piezas`;
  document.getElementById('inventoryValue').textContent=money.format(invValue);
  const recent=[...state.sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  document.getElementById('recentSales').innerHTML=recent.length?recent.map(s=>`<div class="list-row"><div><strong>${esc(s.product)}</strong><small>${new Date(s.date).toLocaleDateString('es-MX')} · ${esc(s.customer||'Mostrador')}</small></div><strong>${money.format(saleTotal(s))}</strong></div>`).join(''):'<p>Sin ventas registradas.</p>';
  const low=state.products.filter(p=>p.stock<=2).sort((a,b)=>a.stock-b.stock).slice(0,5);
  document.getElementById('lowStock').innerHTML=low.length?low.map(p=>`<div class="list-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div><span class="stock-badge">${p.stock} piezas</span></div>`).join(''):'<p>Sin alertas de stock.</p>';
}
function margin(p){return p.price?Math.round((p.price-p.cost)/p.price*100):0}
function renderInventory(){
  document.getElementById('inventoryTable').innerHTML=state.products.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.category)}</td><td>${p.stock}</td><td>${money.format(p.cost)}</td><td>${money.format(p.price)}</td><td>${margin(p)}%</td></tr>`).join('');
}
function renderHistory(){
  const arr=[...state.sales].sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('historyTable').innerHTML=arr.map(s=>`<tr><td>${new Date(s.date).toLocaleDateString('es-MX')}</td><td>${esc(s.product)}</td><td>${s.qty}</td><td>${esc(s.customer||'Mostrador')}</td><td>${money.format(saleTotal(s))}</td><td>${money.format(saleProfit(s))}</td></tr>`).join('');
}
function populateProducts(){
  const sel=document.getElementById('productSelect');
  const selected=Number(sel.value);
  sel.innerHTML=state.products.filter(p=>p.stock>0).map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.stock} disp.</option>`).join('');
  if(state.products.some(p=>p.id===selected&&p.stock>0))sel.value=selected;
  syncSaleForm();
}
function syncSaleForm(){
  const p=state.products.find(x=>x.id===Number(document.getElementById('productSelect').value));
  if(!p)return;
  const price=document.getElementById('salePrice');if(!price.value||price.dataset.productId!=p.id){price.value=p.price;price.dataset.productId=p.id}
  updateSaleSummary();
}
function updateSaleSummary(){
  const p=state.products.find(x=>x.id===Number(document.getElementById('productSelect').value));if(!p)return;
  const qty=Math.max(1,Number(document.getElementById('saleQty').value)||1),price=Number(document.getElementById('salePrice').value)||0;
  document.getElementById('saleSubtotal').textContent=money.format(qty*price);
  document.getElementById('saleCost').textContent=money.format(qty*p.cost);
  document.getElementById('saleProfit').textContent=money.format(qty*(price-p.cost));
}
['productSelect','saleQty','salePrice'].forEach(id=>document.getElementById(id).addEventListener('input',id==='productSelect'?syncSaleForm:updateSaleSummary));

document.getElementById('registerSale').addEventListener('click',()=>{
  const p=state.products.find(x=>x.id===Number(document.getElementById('productSelect').value));if(!p)return notify('Selecciona un producto');
  const qty=Math.max(1,Number(document.getElementById('saleQty').value)||1);if(qty>p.stock)return notify('No hay suficiente existencia');
  const price=Number(document.getElementById('salePrice').value);if(price<=0)return notify('Captura un precio válido');
  p.stock-=qty;
  state.sales.push({id:Date.now(),date:new Date().toISOString(),productId:p.id,product:p.name,qty,price,cost:p.cost,customer:document.getElementById('customerName').value.trim()||'Mostrador'});
  save();document.getElementById('customerName').value='';document.getElementById('saleQty').value=1;render();notify('Venta registrada');setView('dashboard');
});

const modal=document.getElementById('productModal');
document.getElementById('openProductModal').addEventListener('click',()=>{modal.classList.add('open');modal.setAttribute('aria-hidden','false')});
document.getElementById('closeProductModal').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
document.getElementById('saveProduct').addEventListener('click',()=>{
  const name=document.getElementById('newName').value.trim(),category=document.getElementById('newCategory').value.trim()||'General',cost=Number(document.getElementById('newCost').value),price=Number(document.getElementById('newPrice').value),stock=Math.max(0,Number(document.getElementById('newStock').value)||0);
  if(!name||cost<0||price<=0)return notify('Completa los datos del producto');
  state.products.push({id:Date.now(),name,category,cost,price,stock});save();['newName','newCategory','newCost','newPrice'].forEach(id=>document.getElementById(id).value='');document.getElementById('newStock').value=1;closeModal();render();notify('Producto agregado');
});
document.getElementById('resetDemo').addEventListener('click',()=>{state=clone(initial);save();render();notify('Demo restablecida')});
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
render();
// Final routing layer for Atlas Integrador demo.
// Keeps Dashboard as a first-class Dirección-only destination without changing the POS app.
(function(){
  const items=[['inicio','⌂','Inicio'],['dashboard','▥','Dashboard'],['clientes','◉','Clientes'],['cotizaciones','▤','Cotizaciones'],['proyectos','▦','Proyectos'],['inventario','◫','Inventario'],['compras','⇄','Compras'],['mano','⌁','Mano de obra'],['almacen','⬡','Almacén'],['reportes','▥','Reportes'],['config','⚙','Configuración']];
  const operationalRender=window.render;

  function finalNav(){
    const navEl=document.querySelector('#nav');
    if(!navEl)return;
    const visible=items.filter(([id])=>id!=='dashboard'||state.role==='Dirección');
    navEl.innerHTML=visible.map(([id,ico,label])=>`<button class="nav-btn ${state.page===id?'active':''}" data-page="${id}">${ico} <span>${label}</span></button>`).join('');
    navEl.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>{
      state.page=btn.dataset.page;
      state.project=null;state.quote=null;state.warehouse=null;
      window.render();
    });
  }

  window.nav=finalNav;
  window.render=function(){
    if(state.page==='dashboard'){
      if(state.role!=='Dirección')state.page='inicio';
      else{
        finalNav();
        const content=document.querySelector('#content');
        content.innerHTML=typeof window.atlasExecutiveDashboard==='function'
          ? window.atlasExecutiveDashboard()
          : `<div class="card panel"><h2>Dashboard</h2><p class="muted">Control económico de la operación.</p></div>`;
        if(typeof window.atlasRoleWire==='function')window.atlasRoleWire();
        if(typeof window.atlasDecorate==='function')window.atlasDecorate();
        return;
      }
    }
    operationalRender();
    finalNav();
  };

  const roleBtn=document.querySelector('#role-btn');
  if(roleBtn){
    roleBtn.onclick=()=>{
      const i=(roles.indexOf(state.role)+1)%roles.length;
      state.role=roles[i];
      roleBtn.textContent='Rol: '+state.role;
      if(state.role!=='Dirección'&&state.page==='dashboard')state.page='inicio';
      window.render();
    };
  }

  window.render();
})();

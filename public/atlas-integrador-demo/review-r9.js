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

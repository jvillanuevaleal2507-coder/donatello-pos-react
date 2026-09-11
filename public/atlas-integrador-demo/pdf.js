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
    if(q.laborPresentation==='summary')laborBody=[['MANO DE OBRA DEL PROYECTO','—',money(t.ls)]];
    else laborBody=q.laborRows.map(x=>{const p=personnel.find(p=>p.id===+x.personId);const qty=`${x.normalQty||0} normal / ${x.satQty||0} sáb / ${x.sunQty||0} dom`;return [`${x.activity} · ${p?.position||''}`,`${x.mode} · ${qty}`,money(laborRowCost(x)*(1+x.markup/100))]});
  } else laborBody=[['Sin mano de obra agregada','—',money(0)]];
  doc.autoTable({startY:y,head:[['Actividad','Modalidad / cantidad','Importe']],body:laborBody,styles:{fontSize:8},headStyles:{fillColor:[48,48,48]},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+9;
  if(q.scope){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Alcance del proyecto',14,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(9);const lines=doc.splitTextToSize(q.scope,pageW-28);doc.text(lines,14,y);y+=lines.length*4+5;}
  if(y>235){doc.addPage();y=20}
  const totalsBody=[['Materiales',money(t.ms)],['Mano de obra',money(t.ls)],['Indirectos',money(t.ind)],['Subtotal',money(t.subtotal)],[`IVA ${q.ivaRate}%`,money(t.iva)]];
  if(q.retainISR)totalsBody.push(['Retención ISR',q.isrRate?`-${money(t.isr)}`:'Tasa pendiente de configuración']);
  totalsBody.push(['TOTAL',money(t.total)]);
  doc.autoTable({startY:y,body:totalsBody,theme:'plain',styles:{fontSize:9},columnStyles:{0:{halign:'right',fontStyle:'bold'},1:{halign:'right'}},margin:{left:105,right:14}});
  y=doc.lastAutoTable.finalY+10;
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`Identificador: ${q.id} · ID interno preparado para código de barras/QR`,14,y);
  doc.text('Documento generado desde Atlas Integrador · Demo',14,doc.internal.pageSize.getHeight()-10);
  doc.save(`${q.id}-${(q.name||'cotizacion').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

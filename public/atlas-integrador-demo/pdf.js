function atlasQuotePdf(){
  if(!quote||!quote.clientId)return alert('Primero selecciona un cliente y completa la cotización.');
  if(!window.jspdf||!window.jspdf.jsPDF)return alert('No fue posible cargar el generador PDF. Intenta recargar la página.');
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'letter'});
  const c=clients.find(x=>x.id==quote.clientId);
  const t=totals();
  const accent=[180,92,54];
  doc.setFillColor(...accent);doc.rect(0,0,216,24,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('ATLAS INTEGRADOR',16,15);
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('Cotización comercial',160,15);
  doc.setTextColor(35,35,35);doc.setFontSize(10);doc.setFont('helvetica','bold');doc.text('Cliente',16,34);doc.setFont('helvetica','normal');doc.text(c?.name||'—',16,40);
  doc.setFont('helvetica','bold');doc.text('RFC',90,34);doc.setFont('helvetica','normal');doc.text(c?.rfc||'—',90,40);
  doc.setFont('helvetica','bold');doc.text('Contacto',145,34);doc.setFont('helvetica','normal');doc.text(c?.contact||'—',145,40);
  doc.setFont('helvetica','bold');doc.text('Proyecto',16,50);doc.setFont('helvetica','normal');doc.text(quote.name||'Proyecto nuevo',16,56);
  doc.setFont('helvetica','bold');doc.text('Moneda',145,50);doc.setFont('helvetica','normal');doc.text(quote.currency||'MXN',145,56);
  const materialRows=quote.materials.map(x=>[x.model,x.desc,String(x.qty),money(x.price),money(x.qty*x.price)]);
  doc.autoTable({startY:64,head:[['Modelo','Descripción','Cant.','P. Unitario','Importe']],body:materialRows,theme:'grid',styles:{fontSize:8,cellPadding:2.4},headStyles:{fillColor:accent,textColor:255},columnStyles:{2:{halign:'center'},3:{halign:'right'},4:{halign:'right'}}});
  let y=doc.lastAutoTable.finalY+8;
  doc.setFontSize(9);doc.setTextColor(45,45,45);
  doc.setFont('helvetica','bold');doc.text('Mano de obra',120,y);doc.setFont('helvetica','normal');doc.text(money(quote.labor),198,y,{align:'right'});y+=6;
  doc.setFont('helvetica','bold');doc.text('Indirectos',120,y);doc.setFont('helvetica','normal');doc.text(money(t.ind),198,y,{align:'right'});y+=8;
  doc.setDrawColor(190,190,190);doc.line(120,y-3,198,y-3);
  doc.setFontSize(12);doc.setFont('helvetica','bold');doc.text('TOTAL',120,y+3);doc.setTextColor(...accent);doc.text(money(t.sale),198,y+3,{align:'right'});
  doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text('Documento generado desde Atlas Integrador · Demo',16,260);
  const safe=(quote.name||'cotizacion').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/-+/g,'-');
  doc.save(`Cotizacion-${safe}.pdf`);
}

const atlasOriginalRenderQuote=renderQuote;
renderQuote=function(){
  atlasOriginalRenderQuote();
  if(!quote)return;
  const toolbar=document.querySelector('#qbody .toolbar:last-child');
  const body=document.querySelector('#qbody');
  if(quote.step===6&&body&&!document.querySelector('#download-quote-pdf')){
    const box=document.createElement('div');
    box.className='toolbar';
    box.style.marginTop='12px';
    box.innerHTML='<button class="secondary" id="download-quote-pdf">↓ Descargar cotización PDF</button><span class="muted">PDF para cliente: no muestra costos internos ni margen.</span>';
    body.appendChild(box);
    document.querySelector('#download-quote-pdf').onclick=atlasQuotePdf;
  }
};

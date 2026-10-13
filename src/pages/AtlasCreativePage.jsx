import {useEffect,useMemo,useRef,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {createClient} from "@supabase/supabase-js";
import {authorizedAtlasFetch} from "../atlas/authFetch";

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const ENGINE="http://127.0.0.1:4477";
const templates={editorial:"Editorial cálido",detalles:"Detalles que enamoran",imagina:"Imagina tu espacio"};
const motions={suave:"Suave",lateral:"Desplazamiento lateral",revelado:"Revelado",estatico:"Estático"};
const palettes={calido:"Cálido",verde:"Verde Donatello",arena:"Arena"};
const CONCEPT_DIRECTIONS=["cinema","revista","impacto"];
const conceptCaptions={cinema:"Primero el mueble, después el mensaje y al final el precio.",revista:"Primero una idea, después la fotografía y al final la marca.",impacto:"Primero el precio, después el mueble y al final una pregunta."};
const artDirections={
 cinema:"Cine · fotografía a pantalla completa",
 revista:"Revista · papel claro, composición asimétrica",
 impacto:"Cartel · titular y precio grandes",
 galeria:"Galería · mosaico de fotografías"
};
const directionDescriptions={
 cinema:"Sin marcos: fotografía protagonista, textos directamente sobre el ambiente y precio integrado.",
 revista:"Diseño de revista: tipografía editorial, espacios claros, fotografía sin bordes y precio sin tarjeta.",
 impacto:"Anuncio gráfico: titulares grandes, colores sólidos, cortes marcados y otra presentación del precio.",
 galeria:"Varias fotografías reales protagonistas en composiciones de galería, sin recuadros comerciales."
};
const layouts={escaparate:"Escaparate · imagen central",dividida:"Revista · foto y texto lateral",galeria:"Galería · dos fotografías",portada:"Portada · foto protagonista"};
const transitions={fundido:"Fundido elegante",cortina:"Cortina editorial",lateral:"Desplazamiento lateral",vertical:"Aparición vertical"};
const sceneLayouts={hero:"Fotografía protagonista",magazine:"Editorial de revista",duo:"Galería de dos fotos",detail:"Título superior",offer:"Cierre con precio"};
const sceneEffects={rise:"Ascenso",stagger:"Palabra por palabra",mask:"Revelado del título",side:"Entrada lateral",scale:"Escala suave"};
const sceneTransitions={fade:"Fundido",wipe:"Cortina",push:"Desplazamiento",up:"Entrada vertical"};
const CAMPAIGN_KEY="donatello_atlas_creativo_v6";
function loadCampaign(){
  try {const x=JSON.parse(localStorage.getItem(CAMPAIGN_KEY)||"{}");return {queue:Array.isArray(x.queue)?x.queue.slice(0,15):[],drafts:x.drafts&&typeof x.drafts==="object"?x.drafts:{}}}
  catch{return {queue:[],drafts:{}}}
}
const props=[
  ["title1","Título inicial",55],["sub1","Frase de apertura",110],
  ["title2","Título segunda escena",55],["sub2","Frase segunda escena",110],
  ["details","Detalle final",100],["cta","Pregunta final",75],
  ["tag1","Etiqueta inicial",32],["tag2","Etiqueta final",32]
];
const empty={concept:"",why:"",template:"editorial",motion:"suave",palette:"calido",artDirection:"cinema",layout:"escaparate",transition:"fundido",
 image1:0,image2:1,title1:"Un detalle para tu hogar.",title2:"Dale personalidad a tu espacio.",
 sub1:"Conoce este producto en Donatello.",sub2:"Un complemento especial.",
 details:"",cta:"¿Dónde lo pondrías?",tag1:"Donatello",tag2:"Pregunta sin compromiso"};
const imagesOf=p=>[p?.image_url,p?.image_url_2,p?.image_url_3,p?.image_url_4].filter(Boolean);
const money=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(Number(v||0));
const css=[
".atlas-creative{max-width:1250px;margin:0 auto;color:#274032}",
".atlas-creative *{box-sizing:border-box}",
".atlas-creative .ac-hero{background:linear-gradient(130deg,#173827,#42634b);color:#fff;padding:26px;border-radius:17px;margin:0 0 20px}",
".atlas-creative .ac-hero h2{margin:4px 0 10px;font-size:clamp(26px,4vw,36px)}",
".atlas-creative .ac-grid{display:grid;grid-template-columns:minmax(0,1.13fr) minmax(270px,.87fr);gap:20px}",
".atlas-creative .ac-card{background:#fffdf9;border:1px solid #dfd9ce;border-radius:16px;padding:20px;margin-bottom:18px;min-width:0}",
".atlas-creative h3{margin:0 0 15px;font-size:21px}",
".atlas-creative label{display:block;font-size:13px;font-weight:800;margin:12px 0 6px}",
".atlas-creative input,.atlas-creative textarea,.atlas-creative select{width:100%;padding:11px;border-radius:9px;border:1px solid #bdc8b9;background:white;color:#233d2b;font:inherit}",
".atlas-creative textarea{min-height:96px;resize:vertical}",
".atlas-creative .ac-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
".atlas-creative .ac-photo{padding:12px;border:1px solid #dfd6c7;border-radius:12px;min-width:0}",
".atlas-creative .ac-photo img{display:block;width:100%;height:215px;object-fit:contain;background:#f1eade;border-radius:8px}",
".atlas-creative .ac-film{background:linear-gradient(180deg,#2b3329,#4d3d2d);padding:17px;border-radius:15px;color:#f7efe4}",
".atlas-creative .ac-film[data-palette=verde]{background:#143b2b;color:#fffaf2;border:5px solid #c9d6b4}",
".atlas-creative .ac-film[data-palette=verde] img{background:#eee9dc;border:3px solid #c7d4bb}",
".atlas-creative .ac-film[data-palette=verde] h3{color:#eee8c6}",
".atlas-creative .ac-film[data-palette=verde] p{color:#faf1de}",
".atlas-creative .ac-film[data-palette=arena]{background:#e9dbc5;color:#392e24;border:5px solid #bb9e7d}",
".atlas-creative .ac-film[data-palette=arena] img{background:#fbf7ed;border:3px solid #bb9e7d}",
".atlas-creative .ac-film[data-palette=arena] h3{color:#6d5037}",
".atlas-creative .ac-film[data-palette=arena] p{color:#594431}",
".atlas-creative .ac-film img{width:100%;height:260px;object-fit:contain;background:#20231d;border-radius:9px}",
".atlas-creative .ac-film h3{color:#f8ddb7;margin:12px 0 4px}",
".atlas-creative .ac-film p{color:#eadcc6;margin:0 0 13px}",
".atlas-creative .ac-muted{font-size:12px;color:#697667}",
".atlas-creative .ac-btn{display:inline-flex;align-items:center;justify-content:center;background:#244b36;color:white;border:0;border-radius:10px;padding:13px 16px;min-height:43px;width:100%;font-weight:800;cursor:pointer;margin-top:13px;text-decoration:none}",
".atlas-creative .ac-btn:disabled{opacity:.5;cursor:not-allowed}",
".atlas-creative .ac-status{padding:13px;margin-top:14px;border-radius:10px;background:#ebf1e5;color:#37593b;font-size:13px;white-space:pre-wrap}",
".atlas-creative .ac-error{background:#ffebe5;color:#913a2b}",
".atlas-creative .ac-concept{padding:14px;border-left:4px solid #ba8c55;background:#f7f1e6;border-radius:8px;margin:16px 0}",
".atlas-creative video{width:100%;max-height:650px;border-radius:12px;background:#1c1c1c}",
".atlas-creative .ac-queue{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0}",
".atlas-creative .ac-concepts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:17px}",
".atlas-creative .ac-concept-item{min-width:0;border:1px solid #cfc4b5;border-radius:12px;padding:10px;background:#fbf8ef}",
".atlas-creative .ac-concept-item.selected{border:3px solid #38684a;background:#eff4e7}",
".atlas-creative .ac-concept-item iframe{display:block;width:100%;height:310px;background:#292d24;border:0;border-radius:8px;margin:8px 0}",
".atlas-creative .ac-concept-item h4{font-size:14px;margin:0 0 8px}",
".atlas-creative .ac-concept-item p{font-size:12px;color:#596455;line-height:1.4;margin:8px 0}",
".atlas-creative .ac-concept-item button{border:0;background:#204b35;color:white;padding:10px;border-radius:8px;width:100%;font-weight:800;cursor:pointer}",
"@media(max-width:680px){.atlas-creative .ac-concepts{grid-template-columns:1fr}.atlas-creative .ac-concept-item iframe{height:450px}}",
".atlas-creative .ac-queue button{background:#f5f0e5;color:#294634;border:1px solid #cdd0be;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:700}",
".atlas-creative .ac-queue button.active{background:#214a34;color:#fff}",
".atlas-creative .ac-queue small{display:block;font-weight:500}",
".atlas-creative .ac-scenes{display:grid;gap:11px;margin:12px 0}",
".atlas-creative .ac-scene{border:1px solid #e0d8cc;background:#faf7f0;border-radius:13px;padding:12px}",
".atlas-creative .ac-scene .ac-two{margin-top:5px}",
".atlas-creative .ac-help{font-size:12px;color:#747a6c}",
".atlas-creative .ac-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
".atlas-creative .ac-actions button{border:1px solid #b1c5b2;background:#edf3ea;border-radius:9px;color:#1c4c2e;cursor:pointer;padding:10px 13px;font-weight:800}",
"@media(max-width:900px){.atlas-creative .ac-grid{grid-template-columns:1fr}}",
"@media(max-width:600px){.atlas-creative .ac-two{grid-template-columns:1fr}.atlas-creative .ac-photo img{height:250px}}"
].join("\n");
function asDataUrl(blob){
 return new Promise((resolve,reject)=>{
  if(blob.size>12*1024*1024)return reject(Error("La foto pesa más de 12 MB."));
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("No se pudo leer la foto."));reader.readAsDataURL(blob);
 });
}
async function photoBytes(url,file){
 if(file)return asDataUrl(file);
 if(!url)throw Error("Falta una fotografía.");
 let r;try{r=await fetch(url,{mode:"cors"})}catch{throw Error("La fotografía bloquea la descarga. Guárdala y súbela desde Windows.")}
 if(!r.ok)throw Error("La fotografía no pudo descargarse. Puedes subirla localmente.");
 return asDataUrl(await r.blob());
}
async function motorJson(path,options={}){
 const r=await fetch(ENGINE+path,{cache:"no-store",...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"Fallo del motor local.");
 return data;
}
export default function AtlasCreativePage({products=[]}){
 const [query,setQuery]=useSearchParams(),id=query.get("producto")||"";
 const stock=useMemo(()=>products.filter(p=>Number(p.stock)>0),[products]);
 const product=stock.find(p=>String(p.id)===id)||null;
 const photos=useMemo(()=>imagesOf(product),[product]);
 const [filter,setFilter]=useState("");
 const [plan,setPlan]=useState(empty);
 const [instruction,setInstruction]=useState("");
 const [iteration,setIteration]=useState(0);
 const [pastTitles,setPastTitles]=useState([]);
 const [pastLayouts,setPastLayouts]=useState([]);
 const [concepts,setConcepts]=useState([]);
 const [conceptPreviews,setConceptPreviews]=useState({});
 const [conceptReplay,setConceptReplay]=useState({});
 const [selectedConcept,setSelectedConcept]=useState("");
 const preserveChosenPreview=useRef(false);
 const [campaign,setCampaign]=useState(loadCampaign);
 const queue=campaign.queue.filter(q=>stock.some(p=>String(p.id)===String(q)));
 const statusFor=pid=>campaign.drafts[String(pid)]?.state||"pendiente";
 const lastSelected=Object.values(campaign.drafts)
   .filter(d=>d.selectedConcept&&d.updatedAt)
   .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))
   .slice(0,6).map(d=>d.selectedConcept);
 const preferredDirection=CONCEPT_DIRECTIONS.slice().sort((a,b)=>
   lastSelected.filter(v=>v===a).length-lastSelected.filter(v=>v===b).length)[0];
 const [postCopy,setPostCopy]=useState("");
 const [file1,setFile1]=useState(null),[file2,setFile2]=useState(null);
 const [localUrls,setLocalUrls]=useState(["",""]);
 const [connected,setConnected]=useState(false),[motorVersion,setMotorVersion]=useState("");
 const [busy,setBusy]=useState(false),[rendering,setRendering]=useState(false);
 const [status,setStatus]=useState("Selecciona un producto y pide una propuesta a Atlas.");
 const [failed,setFailed]=useState(false),[video,setVideo]=useState("");
 const [projectId,setProjectId]=useState(""),[previewUrl,setPreviewUrl]=useState("");
 const [previewing,setPreviewing]=useState(false);
 const alive=useRef(true);
 useEffect(()=>{try{localStorage.setItem(CAMPAIGN_KEY,JSON.stringify(campaign))}catch{}},[campaign]);
 function track(pid,patch){
   if(!pid)return;
   setCampaign(c=>({...c,drafts:{...c.drafts,[String(pid)]:{...(c.drafts[String(pid)]||{}),...patch,updatedAt:new Date().toISOString()}}}));
 }
 function addQueue(pid){
   if(!pid)return;
   setCampaign(c=>c.queue.some(v=>String(v)===String(pid))?c:{...c,queue:[...c.queue,String(pid)].slice(0,15)});
 }
 function removeQueue(pid){
   setCampaign(c=>({...c,queue:c.queue.filter(v=>String(v)!==String(pid))}));
 }
 function nextPending(){
   const start=queue.indexOf(id);
   const ordered=[...queue.slice(start+1),...queue.slice(0,start+1)];
   const next=ordered.find(pid=>pid!==id&&statusFor(pid)!=="aprobado");
   if(next)setQuery({producto:String(next)});
   else message("No quedan productos pendientes en esta tanda. Puedes añadir otros desde el inventario.");
 }
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  let running=true;
  motorJson("/health").then(d=>{if(running){setMotorVersion(d.version||"");setConnected(Number.parseFloat(d.version)>=8)}}).catch(()=>{if(running)setConnected(false)});
  return()=>{running=false};
 },[]);
 useEffect(()=>{
  const saved=campaign.drafts[String(id)]||{};
  setPlan({...empty,details:product?.name||"",image2:photos.length>1?1:0,...(saved.plan||{})});
  setConcepts(Array.isArray(saved.concepts)?saved.concepts:[]);
  setConceptPreviews({});setConceptReplay({});
  setSelectedConcept(saved.selectedConcept||"");
  setPostCopy(saved.postCopy||"");
  setFile1(null);setFile2(null);setVideo(saved.video||"");setProjectId("");setPreviewUrl("");
  setPastTitles([]);setPastLayouts([]);setIteration(0);
 },[id,product?.name,photos.length]);
 useEffect(()=>{
  const urls=[file1,file2].map(f=>f?URL.createObjectURL(f):"");
  setLocalUrls(urls);
  return()=>urls.forEach(u=>u&&URL.revokeObjectURL(u));
 },[file1,file2]);
 useEffect(()=>{
  if(preserveChosenPreview.current){preserveChosenPreview.current=false;return}
  setProjectId("");setPreviewUrl("");
 },[plan,file1,file2,id]);
 const results=useMemo(()=>{
  const q=filter.toLocaleLowerCase("es-MX").trim();
  return stock.filter(p=>!q||(String(p.name)+" "+String(p.code)+" "+String(p.category)).toLocaleLowerCase("es-MX").includes(q)).slice(0,40);
 },[stock,filter]);
 const change=(key,value)=>setPlan(prev=>({...prev,[key]:value}));
 const choose=n=>photos[Number(plan["image"+n])||0]||"";
 function message(s,error=false){setStatus(s);setFailed(error)}
 async function proposeThree(){
  if(!product)return;
  setBusy(true);setVideo("");
  setConcepts([]);setConceptPreviews({});setConceptReplay({});setSelectedConcept("");
  message("Atlas está preparando tres conceptos realmente diferentes para "+product.name+"...");
  const proposals=[];
  const previews={};
  try {
    let images=null;
    if(connected){
      try {
        images=await Promise.all(photos.slice(0,4).map((src,i)=>photoBytes(src,i===0?file1:i===1?file2:null)));
      }catch(err){
        message("Las propuestas se podrán crear, pero la vista animada no estará disponible hasta cargar las fotografías originales. "+err.message,true);
      }
    }
    for(const direction of CONCEPT_DIRECTIONS){
      message("Atlas: creando concepto "+artDirections[direction]+" ("+(proposals.length+1)+"/3)...");
      const response=await authorizedAtlasFetch("/api/atlas/enrich?mode=creative",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          productId:product.id,instruction,variation:iteration+proposals.length+1,
          pastTitles,pastLayouts,forcedDirection:direction,
          pastDirections:Object.values(campaign.drafts)
            .sort((a,b)=>String(a.updatedAt||"").localeCompare(String(b.updatedAt||"")))
            .slice(-8).map(d=>d.plan?.artDirection).filter(Boolean)
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.creative)throw Error(data.error||"Atlas no devolvió el concepto "+direction);
      const concept={...empty,...data.creative,artDirection:direction};
      proposals.push(concept);setConcepts([...proposals]);
      if(connected&&images){
        try {
          const job=await motorJson("/api/project",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              product:product.name,price:product.price,images,palette:concept.palette,
              artDirection:direction,title1:concept.title1,title2:concept.title2,
              sub1:concept.sub1,sub2:concept.sub2,details:concept.details,cta:concept.cta,
              storyboard:concept.storyboard
            })
          });
          previews[direction]={id:job.id,url:ENGINE+job.preview+"&embed=1"};
          setConceptPreviews({...previews});
        }catch(err){message("Concepto "+direction+" creado, pero sin animación previa: "+err.message,true)}
      }
    }
    addQueue(product.id);
    setIteration(v=>v+3);
    track(product.id,{concepts:proposals,state:"borrador"});
    message("✓ Tres conceptos listos. Abre las vistas animadas y elige SOLO uno para convertirlo en MP4.");
  }catch(err){
    message("Se prepararon "+proposals.length+" de tres conceptos. "+String(err.message||err),true);
    if(proposals.length)track(product.id,{concepts:proposals,state:"borrador"});
  }finally{setBusy(false)}
 }
 function chooseConcept(direction){
  const selected=concepts.find(x=>x.artDirection===direction);
  if(!selected||!product)return;
  preserveChosenPreview.current=true;
  setPlan(selected);
  setPostCopy(selected.facebookPost||"");
  setSelectedConcept(direction);
  setVideo("");
  setProjectId(conceptPreviews[direction]?.id||"");
  setPreviewUrl(conceptPreviews[direction]?.url||"");
  track(product.id,{
    plan:selected,concepts,selectedConcept:direction,postCopy:selected.facebookPost||"",state:"borrador"
  });
  message("✓ Elegiste "+artDirections[direction]+". Revisa el guion y genera el MP4 de este concepto.");
 }
 async function createLocalProject(){
  if(!product)throw Error("Selecciona un producto.");
  if(!connected)throw Error("Inicia el motor V8 de Windows y recarga el POS.");
  const {data:p,error:e}=await supabase.from("products")
    .select("id,price,stock,image_url,image_url_2,image_url_3,image_url_4")
    .eq("id",product.id).single();
  if(e||!p)throw Error("No pude verificar el inventario actual.");
  if(Number(p.stock)<=0)throw Error("Producto agotado: no se generará Reel.");
  if(Number(p.price)!==Number(product.price))throw Error("El precio cambió. Actualiza el POS antes de generar.");
  const scenes=plan.storyboard?.scenes;
  if(!Array.isArray(scenes)||scenes.length<2||scenes.length>4)
    throw Error("Primero pide a Atlas un storyboard nuevo de dos a cuatro escenas.");
  message("Preparando fotografías originales y animaciones...");
  const images=[];
  for(let i=0;i<photos.length&&i<4;i++){
    const replaceFile=i===0?file1:i===1?file2:null;
    images.push(await photoBytes(photos[i],replaceFile));
  }
  const payload={
    product:product.name,price:product.price,images,palette:plan.palette,artDirection:plan.artDirection||"cinema",
    title1:plan.title1,title2:plan.title2,sub1:plan.sub1,sub2:plan.sub2,
    details:plan.details,cta:plan.cta,storyboard:plan.storyboard
  };
  const job=await motorJson("/api/project",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
  });
  setProjectId(job.id);setPreviewUrl(ENGINE+job.preview+"&embed=1");
  track(product.id,{plan,postCopy,state:"borrador"});
  return job.id;
 }
 async function preparePreview(){
  setPreviewing(true);setVideo("");message("Preparando vista animada sin renderizar MP4...");
  try {await createLocalProject();message("✓ Vista animada lista. Revísala; si te gusta, genera el MP4.")}
  catch(e){message(e.message||String(e),true)}
  finally{setPreviewing(false)}
 }
 async function generate(){
  if(!product)return;
  setRendering(true);setVideo("");
  try {
   const id=projectId||await createLocalProject();
   message("HyperFrames está renderizando el MP4 local...");
   await motorJson("/api/render/"+id+"/high",{method:"POST"});
   for(let attempt=0;attempt<250;attempt++){
     await new Promise(r=>setTimeout(r,1600));
     if(!alive.current)return;
     const state=await motorJson("/api/status/"+id);
     if(state.state==="done"){
       const url=ENGINE+state.output;setVideo(url);
       track(product.id,{video:url,state:"renderizado",postCopy,plan});
       message("✓ MP4 generado. Reprodúcelo, apruébalo y continúa con el siguiente producto.");return;
     }
     if(state.state==="error")throw Error(state.message||"Error de HyperFrames.");
     message(state.state==="queued"?"En cola local: "+String(state.message):"Renderizando: "+String(state.message||"Procesando").slice(0,145));
   }
   throw Error("El seguimiento tardó demasiado. Revisa CMD y el proyecto guardado.");
  }catch(e){message(e.message||String(e),true)}
  finally{setRendering(false)}
 }
 return <section className="atlas-creative"><style>{css}</style>
  <div className="ac-hero"><small>POS DONATELLO · HERRAMIENTA PRIVADA</small><h2>✦ Atlas Creativo</h2>
   <p>Atlas diseña con IA; HyperFrames + FFmpeg convierten HTML a MP4 gratis en tu computadora. Tú apruebas antes de publicar.</p></div>
  <div className="ac-grid">
   <div>
    <article className="ac-card"><h3>1 · Tanda de producción</h3>
     <p className="ac-muted">Agrega productos al lote, genera el Reel de cada uno y pasa al siguiente. El progreso se guarda en este navegador.</p>
     <div className="ac-queue">{queue.length?queue.map(pid=>{
       const p=stock.find(x=>String(x.id)===String(pid));if(!p)return null;
       return <button type="button" key={pid} className={id===String(pid)?"active":""} onClick={()=>setQuery({producto:String(pid)})}>
        {p.name.slice(0,28)}<small>{statusFor(pid)==="aprobado"?"✓ Aprobado":statusFor(pid)==="renderizado"?"MP4 listo":statusFor(pid)==="borrador"?"Guion listo":"Pendiente"}</small>
       </button>
     }):<span className="ac-help">Tu tanda está vacía. Selecciona un producto y pulsa «Agregar a tanda».</span>}</div>
     <label htmlFor="acFilter">Buscar productos</label>
     <input id="acFilter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nombre, código o categoría"/>
     <label htmlFor="acProduct">Solo productos con stock</label>
     <select id="acProduct" value={product?.id||""} onChange={e=>{setQuery({producto:e.target.value});setFilter("")}}>
      <option value="">Selecciona producto...</option>
      {results.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price)} · {p.stock} pza.</option>)}
      {product&&!results.some(p=>p.id===product.id)&&<option value={product.id}>{product.name}</option>}
     </select>
     {product&&<div className="ac-actions">
       <button type="button" onClick={()=>addQueue(product.id)}>＋ Agregar a tanda</button>
       {queue.includes(String(product.id))&&<button type="button" onClick={()=>removeQueue(product.id)}>Quitar de tanda</button>}
       <button type="button" onClick={nextPending} disabled={!queue.length}>Siguiente pendiente →</button>
     </div>}
     {product&&<div className="ac-concept" style={{display:"flex",gap:12,alignItems:"center"}}>
      {photos[0]&&<img src={photos[0]} alt="" style={{width:75,height:85,objectFit:"contain"}}/>}
      <div><strong>{product.name}</strong><p>{product.category} · {product.code}</p><strong>{money(product.price)} · Stock {product.stock}</strong>
      <p className="ac-muted">{photos.length} foto(s) reales. El costo de compra no se envía a Atlas.</p></div>
     </div>}
    </article>
    <article className="ac-card"><h3>2 · Atlas crea tres anuncios diferentes</h3>
     <p className="ac-help">Cine empieza con el producto; Editorial empieza con texto; Impacto empieza con el precio. Las fotos son siempre las originales del POS.</p>
     <label htmlFor="acTalk">Dile a Atlas qué buscas (opcional)</label>
     <textarea id="acTalk" maxLength={600} value={instruction} onChange={e=>setInstruction(e.target.value)}
       placeholder="Por ejemplo: elegante, con movimientos tranquilos y una pregunta natural. Nada de textos exagerados."/>
     <button type="button" className="ac-btn" disabled={!product||!photos.length||busy||rendering}
       onClick={proposeThree}>{busy?"Atlas está preparando tus tres opciones...":"✦ Generar 3 conceptos diferentes"}</button>
     {concepts.length>0&&<div className="ac-concepts">
       {CONCEPT_DIRECTIONS.map((direction,i)=>{
         const proposal=concepts.find(x=>x.artDirection===direction);
         if(!proposal)return <div className="ac-concept-item" key={direction}><h4>{i+1} · {artDirections[direction]}</h4><p>Preparando...</p></div>;
         const animation=conceptPreviews[direction];
         return <div className={"ac-concept-item"+(selectedConcept===direction?" selected":"")} key={direction}>
           <h4>{i+1} · {artDirections[direction]}</h4>
           {direction===preferredDirection&&<p style={{fontWeight:800,color:"#24673f"}}>✦ Recomendado para no repetir estilo</p>}
           {animation?<iframe key={direction+"-"+(conceptReplay[direction]||0)} src={animation.url+"&r="+(conceptReplay[direction]||0)} title={"Animación "+direction} loading="lazy"/>:
              <div style={{padding:12,background:"#e8e4d8",borderRadius:8,minHeight:95}}>
                <p>Storyboard listo, sin previsualización animada. Para verla, inicia el motor V8 y vuelve a generar las opciones.</p>
              </div>}
           <p><strong>{proposal.concept||proposal.title1}</strong></p>
           <p>{conceptCaptions[direction]}</p>
           <p>{proposal.storyboard?.scenes?.length||0} escenas · {Math.round((proposal.storyboard?.scenes||[]).reduce((n,x)=>n+Number(x.duration||0),0)*10)/10}s</p>
           {animation&&<button type="button" style={{background:"#e0ecdf",color:"#204b35",marginBottom:8}} onClick={()=>setConceptReplay(x=>({...x,[direction]:(x[direction]||0)+1}))}>↻ Repetir animación</button>}
           <button type="button" onClick={()=>chooseConcept(direction)}>{selectedConcept===direction?"✓ Elegido":"Elegir este concepto"}</button>
         </div>;
       })}
     </div>}
     {selectedConcept&&<p className="ac-status">Seleccionado: <strong>{artDirections[selectedConcept]}</strong>. Ahora solo ese diseño se convierte a MP4.</p>}
     {!selectedConcept&&concepts.length>0&&<p className="ac-help">Para evitar tres renders innecesarios, las animaciones son vistas HTML rápidas; HyperFrames producirá únicamente el MP4 que apruebes.</p>}
    </article>
    <article className="ac-card"><h3>3 · Dirección de arte del Reel</h3>
     <label htmlFor="acArtDirection">Estilo completo del video (no solo colores)</label>
     <select id="acArtDirection" value={plan.artDirection||"cinema"} onChange={e=>change("artDirection",e.target.value)}>
       {Object.entries(artDirections).filter(([k])=>photos.length>1||k!=="galeria").map(([k,v])=><option key={k} value={k}>{v}</option>)}
     </select>
     <p className="ac-muted">{directionDescriptions[plan.artDirection||"cinema"]}</p>
     <p className="ac-help">Atlas puede elegir esta dirección automáticamente. Si quieres otra, cámbiala aquí y previsualiza el resultado sin generar un MP4.</p>
     <h3 style={{marginTop:22}}>Storyboard por escenas</h3>
     {Array.isArray(plan.storyboard?.scenes)&&<div className="ac-scenes">{plan.storyboard.scenes.map((scene,i)=><div className="ac-scene" key={i}>
       <strong>{i+1}. {sceneLayouts[scene.layout]||scene.layout} · {scene.duration}s</strong>
       <p className="ac-help">{sceneTransitions[scene.transition]||scene.transition} · Texto: {sceneEffects[scene.animation]||scene.animation} · Foto {scene.image+1}</p>
       <details><summary>Editar esta escena</summary>
         <div className="ac-two">
           <div><label>Diseño</label><select value={scene.layout} disabled={i===plan.storyboard.scenes.length-1} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,layout:e.target.value}:v)})}>
             {Object.entries(sceneLayouts).filter(([k])=>i===plan.storyboard.scenes.length-1?k==="offer":k!=="offer").map(([k,v])=><option key={k} value={k}>{v}</option>)}
           </select></div>
           <div><label>Transición</label><select value={scene.transition} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,transition:e.target.value}:v)})}>{Object.entries(sceneTransitions).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
           <div><label>Aparición de texto</label><select value={scene.animation} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,animation:e.target.value}:v)})}>{Object.entries(sceneEffects).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
           <div><label>Duración (segundos)</label><input type="number" min={i===plan.storyboard.scenes.length-1?3.5:2.5} max="5.5" step="0.1" value={scene.duration} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,duration:Number(e.target.value)}:v)})}/></div>
           <div><label>Fotografía real</label><select value={scene.image} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,image:Number(e.target.value)}:v)})}>{photos.map((u,j)=><option key={u+j} value={j}>Foto {j+1}</option>)}</select></div>
           {scene.layout==="duo"&&<div><label>Segunda fotografía</label><select value={scene.secondaryImage} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,secondaryImage:Number(e.target.value)}:v)})}>{photos.map((u,j)=><option key={u+j} value={j}>Foto {j+1}</option>)}</select></div>}
         </div>
         {i!==plan.storyboard.scenes.length-1&&<><label>Título</label><input maxLength={65} value={scene.title} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,title:e.target.value}:v)})}/>
           <label>Subtítulo</label><input maxLength={120} value={scene.subtitle} onChange={e=>change("storyboard",{scenes:plan.storyboard.scenes.map((v,j)=>i===j?{...v,subtitle:e.target.value}:v)})}/></>}
       </details>
     </div>)}</div>}
     <p className="ac-muted">La IA define las escenas. Edita solo lo necesario. El precio final siempre se obtiene del POS.</p>
     <label htmlFor="acPalette">Identidad visual de Donatello</label>
     <select id="acPalette" value={plan.palette} onChange={e=>change("palette",e.target.value)}>{Object.entries(palettes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
     <label htmlFor="acQuestion">Pregunta final del Reel</label>
     <input id="acQuestion" value={plan.cta||""} maxLength={75} onChange={e=>change("cta",e.target.value)}/>
     <details style={{margin:"18px 0",padding:12,border:"1px solid #ddd4c5",borderRadius:10}}>
       <summary style={{fontWeight:800,cursor:"pointer"}}>Revisar fotografías o sustituir una foto real</summary>
       <div className="ac-two" style={{marginTop:12}}>
         {photos.map((u,i)=><div className="ac-photo" key={u+i}><strong>Foto {i+1} del POS</strong>
           <img src={i===0&&localUrls[0]?localUrls[0]:i===1&&localUrls[1]?localUrls[1]:u} alt={"Fotografía "+(i+1)}/>
           {i<2&&<><label htmlFor={"file"+i}>Cambiar por otra foto auténtica desde Windows</label>
             <input id={"file"+i} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>i===0?setFile1(e.target.files?.[0]||null):setFile2(e.target.files?.[0]||null)}/></>}
         </div>)}
       </div>
       <p className="ac-help">Las escenas eligen qué fotografía usar. No se generan imágenes artificiales ni se recorta el mueble.</p>
     </details>
     <button type="button" className="ac-btn" style={{background:"#d2e0ca",color:"#1a4630"}} disabled={!product||!photos.length||busy||rendering||previewing||!connected} onClick={preparePreview}>
      {previewing?"Preparando storyboard...":"◉ Previsualizar animaciones sin renderizar"}
     </button>
     {previewUrl&&<div style={{padding:"14px 0"}}>
       <p className="ac-muted">Vista animada en tiempo real. No consume render MP4.</p>
       <iframe src={previewUrl} title="Vista animada HyperFrames" style={{width:"100%",maxWidth:365,height:655,border:"1px solid #bfad88",borderRadius:12,background:"#182419"}}/>
     </div>}
     <button type="button" className="ac-btn" disabled={!product||!photos.length||busy||rendering||previewing||!connected} onClick={generate}>{rendering?"HyperFrames está creando el MP4...":"▶ Generar MP4 gratis con HyperFrames"}</button>
     <p role="status" className={"ac-status"+(failed?" ac-error":"")}>{status}</p>
     <p className="ac-muted">Motor Windows: {connected?"V8 conectado":motorVersion?"versión "+motorVersion+" (se requiere V8)":"no conectado"}. Ninguna publicación es automática.</p>
    </article>
   </div>
   <div>
    <article className="ac-card"><h3>Guion fotográfico</h3>
     <div className="ac-film" data-palette={plan.palette}>
      <p style={{fontSize:12}}>VENTAS DONATELLO · {artDirections[plan.artDirection||"cinema"]} · {palettes[plan.palette]}</p>
      {Array.isArray(plan.storyboard?.scenes)?plan.storyboard.scenes.map((scene,i)=><div key={i} style={{marginBottom:19,borderBottom:"1px solid #97836a",paddingBottom:14}}>
        <p style={{fontSize:12}}>{i+1} · {sceneLayouts[scene.layout]} · {scene.duration} segundos · {sceneEffects[scene.animation]}</p>
        <img src={photos[scene.image]||""} alt={"Escena "+(i+1)}/>
        <h3>{scene.layout==="offer"?product?.name:scene.title}</h3>
        <p>{scene.layout==="offer"?money(product?.price):scene.subtitle}</p>
      </div>):<p>Selecciona un producto y pídele a Atlas que proponga un Reel.</p>}
      <p style={{fontSize:12}}>El producto siempre se presenta con sus fotografías originales.</p>
    </div><p className="ac-muted">Esta vista muestra fotos y textos; las animaciones se comprueban en el MP4 final.</p>
    </article>
    <article className="ac-card"><h3>Texto para Facebook y grupos</h3>
      <label htmlFor="acPost">Publicación preparada por Atlas · editable</label>
      <textarea id="acPost" rows={7} value={postCopy} onChange={e=>{setPostCopy(e.target.value);if(product)track(product.id,{postCopy:e.target.value})}} placeholder="Atlas propondrá un texto natural con la dirección y el catálogo."/>
      <div className="ac-actions">
        <button type="button" disabled={!postCopy.trim()} onClick={async()=>{try{await navigator.clipboard.writeText(postCopy);message("✓ Texto copiado. Puedes pegarlo en Facebook o Metricool.")}catch{message("Selecciona y copia el texto manualmente.",true)}}}>Copiar publicación</button>
        <button type="button" disabled={!product||!postCopy.trim()} onClick={()=>{track(product.id,{plan,postCopy,state:video?"renderizado":"borrador"});message("✓ Se guardó el texto y el storyboard en este navegador.")}}>Guardar borrador</button>
      </div>
      <p className="ac-help">No publica en Facebook ni Metricool automáticamente. Tú revisas y decides cuándo programar.</p>
    </article>
    {video&&<article className="ac-card"><h3>Reel terminado</h3>
      <video src={video} controls playsInline/>
      <a className="ac-btn" href={video} download>⬇ Descargar MP4</a>
      <p className="ac-muted">Revisa producto, fotografías, precio y ortografía antes de publicarlo.</p>
      <button className="ac-btn" type="button" onClick={()=>{track(product.id,{plan,postCopy,video,state:"aprobado"});message("✓ Reel aprobado; listo para programar.");nextPending()}}>✓ Aprobar Reel y siguiente producto →</button>
    </article>}
   </div>
  </div>
 </section>;
}

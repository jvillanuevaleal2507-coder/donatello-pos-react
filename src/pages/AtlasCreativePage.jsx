import {useEffect,useMemo,useRef,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {createClient} from "@supabase/supabase-js";
import {authorizedAtlasFetch} from "../atlas/authFetch";

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const ENGINE="http://127.0.0.1:4477";
const templates={editorial:"Editorial cálido",detalles:"Detalles que enamoran",imagina:"Imagina tu espacio"};
const motions={suave:"Suave",lateral:"Desplazamiento lateral",revelado:"Revelado",estatico:"Estático"};
const palettes={calido:"Cálido",verde:"Verde Donatello",arena:"Arena"};
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
const empty={concept:"",why:"",template:"editorial",motion:"suave",palette:"calido",layout:"escaparate",transition:"fundido",
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
 const [campaign,setCampaign]=useState(loadCampaign);
 const queue=campaign.queue.filter(q=>stock.some(p=>String(p.id)===String(q)));
 const statusFor=pid=>campaign.drafts[String(pid)]?.state||"pendiente";
 const [postCopy,setPostCopy]=useState("");
 const [file1,setFile1]=useState(null),[file2,setFile2]=useState(null);
 const [localUrls,setLocalUrls]=useState(["",""]);
 const [connected,setConnected]=useState(false),[motorVersion,setMotorVersion]=useState("");
 const [busy,setBusy]=useState(false),[rendering,setRendering]=useState(false);
 const [status,setStatus]=useState("Selecciona un producto y pide una propuesta a Atlas.");
 const [failed,setFailed]=useState(false),[video,setVideo]=useState("");
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
  motorJson("/health").then(d=>{if(running){setMotorVersion(d.version||"");setConnected(Number.parseFloat(d.version)>=6)}}).catch(()=>{if(running)setConnected(false)});
  return()=>{running=false};
 },[]);
 useEffect(()=>{
  const saved=campaign.drafts[String(id)]||{};
  setPlan(saved.plan||{...empty,details:product?.name||"",image2:photos.length>1?1:0});
  setPostCopy(saved.postCopy||"");
  setFile1(null);setFile2(null);setVideo(saved.video||"");
  setPastTitles([]);setPastLayouts([]);setIteration(0);
 },[id,product?.name,photos.length]);
 useEffect(()=>{
  const urls=[file1,file2].map(f=>f?URL.createObjectURL(f):"");
  setLocalUrls(urls);
  return()=>urls.forEach(u=>u&&URL.revokeObjectURL(u));
 },[file1,file2]);
 const results=useMemo(()=>{
  const q=filter.toLocaleLowerCase("es-MX").trim();
  return stock.filter(p=>!q||(String(p.name)+" "+String(p.code)+" "+String(p.category)).toLocaleLowerCase("es-MX").includes(q)).slice(0,40);
 },[stock,filter]);
 const change=(key,value)=>setPlan(prev=>({...prev,[key]:value}));
 const choose=n=>photos[Number(plan["image"+n])||0]||"";
 function message(s,error=false){setStatus(s);setFailed(error)}
 async function propose(){
  if(!product)return;
  setBusy(true);setVideo("");message("Atlas está preparando una propuesta original con las fotos y datos del POS...");
  try {
    const r=await authorizedAtlasFetch("/api/atlas/enrich?mode=creative",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({productId:product.id,instruction,variation:iteration+1,pastTitles,pastLayouts})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.creative)throw Error(d.error||"Atlas no devolvió una propuesta.");
    setPlan(prev=>({...prev,...d.creative}));setFile1(null);setFile2(null);
    setPostCopy(d.creative.facebookPost||"");
    addQueue(product.id);
    track(product.id,{plan:{...plan,...d.creative},postCopy:d.creative.facebookPost||"",state:"borrador"});
    setIteration(v=>v+1);setPastTitles(p=>[...p,d.creative.title1,d.creative.title2].slice(-8));
    setPastLayouts(p=>[...p,d.creative.layout].slice(-8));
    message("✓ Propuesta preparada. Revisa y modifica los textos antes de generar.");
  }catch(e){message(e.message||String(e),true)}finally{setBusy(false)}
 }
 async function generate(){
  if(!product)return;
  if(!connected){message("Actualiza el motor de Windows a V6. Luego reinicia CMD y recarga la página.",true);return}
  setRendering(true);setVideo("");message("Verificando el precio y stock actuales...");
  try{
   const {data:p,error:e}=await supabase.from("products").select("id,price,stock,image_url,image_url_2,image_url_3,image_url_4").eq("id",product.id).single();
   if(e||!p)throw Error("No pude verificar el inventario actual.");
   if(Number(p.stock)<=0)throw Error("Producto agotado: no se generará el Reel.");
   if(Number(p.price)!==Number(product.price))throw Error("El precio cambió. Actualiza el POS antes de generar.");
   const scenes=plan.storyboard?.scenes;
   if(!Array.isArray(scenes)||scenes.length<2||scenes.length>4)throw Error("Pide a Atlas un storyboard nuevo con el motor V6 para poder renderizar.");
   message("Preparando las fotografías originales...");
   const images=[];
   for(let i=0;i<photos.length&&i<4;i++){
     const replaceFile=i===Number(plan.image1)&&file1?file1:i===Number(plan.image2)&&file2?file2:null;
     images.push(await photoBytes(photos[i],replaceFile));
   }
   const payload={product:product.name,price:product.price,images,template:plan.template,motion:plan.motion,palette:plan.palette,layout:plan.layout,transition:plan.transition,
     title1:plan.title1,title2:plan.title2,sub1:plan.sub1,sub2:plan.sub2,details:plan.details,cta:plan.cta,tag1:plan.tag1,tag2:plan.tag2,
     storyboard:plan.storyboard};
   const job=await motorJson("/api/project",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   message("HyperFrames está convirtiendo HTML a MP4 en tu computadora...");
   await motorJson("/api/render/"+job.id+"/high",{method:"POST"});
   for(let attempt=0;attempt<250;attempt++){
     await new Promise(r=>setTimeout(r,1600));
     if(!alive.current)return;
     const state=await motorJson("/api/status/"+job.id);
     if(state.state==="done"){
       const url=ENGINE+state.output;setVideo(url);
       track(product.id,{video:url,state:"renderizado",postCopy,plan});
       message("✓ MP4 generado. Revísalo, apruébalo y sigue con el próximo producto.");return
     }
     if(state.state==="error")throw Error(state.message||"Error de HyperFrames.");
     message("Generando MP4: "+String(state.message||"Procesando").slice(0,145));
   }
   throw Error("La página agotó el tiempo de seguimiento. Revisa CMD.");
  }catch(e){message(e.message||String(e),true)}finally{setRendering(false)}
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
    <article className="ac-card"><h3>2 · Pídele una propuesta a Atlas</h3>
     <label htmlFor="acTalk">Tu instrucción creativa</label>
     <textarea id="acTalk" maxLength={600} value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ej. Dale un toque editorial diferente, no hagas mucho zoom y enfócate en el mueble real."/>
     <button type="button" className="ac-btn" disabled={!product||!photos.length||busy||rendering} onClick={propose}>{busy?"Atlas está creando...":"✦ Atlas, propón un Reel diferente"}</button>
     {plan.concept&&<div className="ac-concept"><strong>{plan.concept}</strong><p>{plan.why}</p></div>}
    </article>
    <article className="ac-card"><h3>3 · Guion de escenas de Atlas</h3>
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
     <p className="ac-muted">Atlas elige automáticamente el ambiente editorial, la posición de las fotos y la transición. Puedes corregir su propuesta antes de generar.</p>
     <div className="ac-two">
       <div><label htmlFor="acLayout">Forma del video</label>
        <select id="acLayout" value={plan.layout} onChange={e=>change("layout",e.target.value)}>
         {Object.entries(layouts).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
       </div>
       <div><label htmlFor="acTransition">Transición entre fotografías</label>
        <select id="acTransition" value={plan.transition} onChange={e=>change("transition",e.target.value)}>
         {Object.entries(transitions).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
       </div>
     </div>
     <p className="ac-muted">Propuesta visual: {layouts[plan.layout]} + {transitions[plan.transition]}. La imagen real siempre se muestra completa.</p>
     <div className="ac-two">
      <div><label htmlFor="acTpl">Composición base</label><select id="acTpl" value={plan.template} onChange={e=>change("template",e.target.value)}>{Object.entries(templates).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      <div><label htmlFor="acMotion">Movimiento</label><select id="acMotion" value={plan.motion} onChange={e=>change("motion",e.target.value)}>{Object.entries(motions).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
     </div>
     <label htmlFor="acPalette">Paleta visual</label><select id="acPalette" value={plan.palette} onChange={e=>change("palette",e.target.value)}>{Object.entries(palettes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
     <div className="ac-two">
      {[1,2].map(i=><div className="ac-photo" key={i}><strong>{i===1?"Primera foto":"Segunda foto y precio"}</strong>
       <img src={localUrls[i-1]||choose(i)||""} alt={"Foto "+i}/>
       <label htmlFor={"pick"+i}>Elegir del POS</label><select id={"pick"+i} value={plan["image"+i]} onChange={e=>{change("image"+i,Number(e.target.value));i===1?setFile1(null):setFile2(null)}}>
        {photos.map((url,k)=><option key={url+k} value={k}>Foto {k+1}</option>)}
       </select>
       <label htmlFor={"file"+i}>O cargar foto real desde Windows</label>
       <input id={"file"+i} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>i===1?setFile1(e.target.files?.[0]||null):setFile2(e.target.files?.[0]||null)}/>
      </div>)}
     </div>
     <p className="ac-muted">Fotografías completas, sin zoom agresivo. La paleta ahora cambia el estudio entero: cálido fotográfico, verde Donatello o arena clara. Revisa el storyboard a la derecha.</p>
     <div className="ac-two">{props.map(([key,label,max])=><div key={key}>
       <label htmlFor={"field"+key}>{label}</label><input id={"field"+key} maxLength={max} value={plan[key]||""} onChange={e=>change(key,e.target.value)}/>
      </div>)}</div>
     <button type="button" className="ac-btn" disabled={!product||!photos.length||busy||rendering||!connected} onClick={generate}>{rendering?"HyperFrames está creando el MP4...":"▶ Generar MP4 gratis con HyperFrames"}</button>
     <p role="status" className={"ac-status"+(failed?" ac-error":"")}>{status}</p>
     <p className="ac-muted">Motor Windows: {connected?"V6 conectado":motorVersion?"versión "+motorVersion+" (se requiere V6)":"no conectado"}. Ninguna publicación es automática.</p>
    </article>
   </div>
   <div>
    <article className="ac-card"><h3>Vista previa del proyecto</h3>
     <div className="ac-film" data-palette={plan.palette}>
      <p style={{fontSize:12}}>VENTAS DONATELLO · {templates[plan.template]}</p>
      <p style={{fontSize:12}}>Storyboard: {layouts[plan.layout]} · {transitions[plan.transition]}</p>
      <img src={localUrls[0]||choose(1)||""} alt="Escena uno"/><h3>{plan.title1}</h3><p>{plan.sub1}</p>
      <img src={localUrls[1]||choose(2)||""} alt="Escena dos"/><h3>{plan.title2}</h3><p>{plan.sub2}</p>
      <div style={{border:"1px solid #c0ab82",borderRadius:10,padding:15}}>
       <strong>{product?.name||"Selecciona un producto"}</strong>
       <h3>{product?money(product.price):""}</h3><p>{plan.details}</p><p>{plan.cta}</p>
      </div>
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

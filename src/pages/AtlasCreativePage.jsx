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
 const [file1,setFile1]=useState(null),[file2,setFile2]=useState(null);
 const [localUrls,setLocalUrls]=useState(["",""]);
 const [connected,setConnected]=useState(false),[motorVersion,setMotorVersion]=useState("");
 const [busy,setBusy]=useState(false),[rendering,setRendering]=useState(false);
 const [status,setStatus]=useState("Selecciona un producto y pide una propuesta a Atlas.");
 const [failed,setFailed]=useState(false),[video,setVideo]=useState("");
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  let running=true;
  motorJson("/health").then(d=>{if(running){setMotorVersion(d.version||"");setConnected(Number.parseFloat(d.version)>=5)}}).catch(()=>{if(running)setConnected(false)});
  return()=>{running=false};
 },[]);
 useEffect(()=>{
  setPlan({...empty,details:product?.name||"",image2:photos.length>1?1:0});
  setFile1(null);setFile2(null);setVideo("");setPastTitles([]);setPastLayouts([]);setIteration(0);
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
    setIteration(v=>v+1);setPastTitles(p=>[...p,d.creative.title1,d.creative.title2].slice(-8));
    setPastLayouts(p=>[...p,d.creative.layout].slice(-8));
    message("✓ Propuesta preparada. Revisa y modifica los textos antes de generar.");
  }catch(e){message(e.message||String(e),true)}finally{setBusy(false)}
 }
 async function generate(){
  if(!product)return;
  if(!connected){message("Actualiza el motor de Windows a V5. Luego reinicia CMD y recarga la página.",true);return}
  setRendering(true);setVideo("");message("Verificando el precio y stock actuales...");
  try{
   const {data:p,error:e}=await supabase.from("products").select("id,price,stock,image_url,image_url_2,image_url_3,image_url_4").eq("id",product.id).single();
   if(e||!p)throw Error("No pude verificar el inventario actual.");
   if(Number(p.stock)<=0)throw Error("Producto agotado: no se generará el Reel.");
   if(Number(p.price)!==Number(product.price))throw Error("El precio cambió. Actualiza el POS antes de generar.");
   if(!plan.title1.trim()||!plan.title2.trim())throw Error("Completa los títulos de las dos escenas.");
   message("Preparando las fotografías originales...");
   const images=[await photoBytes(choose(1),file1),await photoBytes(choose(2),file2)];
   const payload={product:product.name,price:product.price,images,template:plan.template,motion:plan.motion,palette:plan.palette,layout:plan.layout,transition:plan.transition,
     title1:plan.title1,title2:plan.title2,sub1:plan.sub1,sub2:plan.sub2,details:plan.details,cta:plan.cta,tag1:plan.tag1,tag2:plan.tag2};
   const job=await motorJson("/api/project",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   message("HyperFrames está convirtiendo HTML a MP4 en tu computadora...");
   await motorJson("/api/render/"+job.id+"/high",{method:"POST"});
   for(let attempt=0;attempt<250;attempt++){
     await new Promise(r=>setTimeout(r,1600));
     if(!alive.current)return;
     const state=await motorJson("/api/status/"+job.id);
     if(state.state==="done"){setVideo(ENGINE+state.output);message("✓ MP4 generado. Reprodúcelo y revísalo antes de publicar.");return}
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
    <article className="ac-card"><h3>1 · Selecciona el producto</h3>
     <label htmlFor="acFilter">Buscar productos</label>
     <input id="acFilter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nombre, código o categoría"/>
     <label htmlFor="acProduct">Solo productos con stock</label>
     <select id="acProduct" value={product?.id||""} onChange={e=>{setQuery({producto:e.target.value});setFilter("")}}>
      <option value="">Selecciona producto...</option>
      {results.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price)} · {p.stock} pza.</option>)}
      {product&&!results.some(p=>p.id===product.id)&&<option value={product.id}>{product.name}</option>}
     </select>
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
    <article className="ac-card"><h3>3 · Dirección visual y textos</h3>
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
     <p className="ac-muted">Fotografías completas, sin zoom agresivo. Si hay una sola, puede usarse dos veces o añadirse otra foto auténtica.</p>
     <div className="ac-two">{props.map(([key,label,max])=><div key={key}>
       <label htmlFor={"field"+key}>{label}</label><input id={"field"+key} maxLength={max} value={plan[key]||""} onChange={e=>change(key,e.target.value)}/>
      </div>)}</div>
     <button type="button" className="ac-btn" disabled={!product||!photos.length||busy||rendering||!connected} onClick={generate}>{rendering?"HyperFrames está creando el MP4...":"▶ Generar MP4 gratis con HyperFrames"}</button>
     <p role="status" className={"ac-status"+(failed?" ac-error":"")}>{status}</p>
     <p className="ac-muted">Motor Windows: {connected?"V5 conectado":motorVersion?"versión "+motorVersion+" (se requiere V5)":"no conectado"}. Ninguna publicación es automática.</p>
    </article>
   </div>
   <div>
    <article className="ac-card"><h3>Vista previa del proyecto</h3>
     <div className="ac-film">
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
    {video&&<article className="ac-card"><h3>Reel terminado</h3>
      <video src={video} controls playsInline/>
      <a className="ac-btn" href={video} download>⬇ Descargar MP4</a>
      <p className="ac-muted">Revisa producto, fotografías, precio y ortografía antes de publicarlo.</p>
    </article>}
   </div>
  </div>
 </section>;
}

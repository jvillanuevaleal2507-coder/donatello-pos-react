import { requirePosUser } from "../../api/atlas/_auth.js";

const MODEL = "gpt-5.6";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const TEMPLATES = ["editorial", "detalles", "imagina"];
const MOTIONS = ["suave", "lateral", "revelado", "estatico"];
const PALETTES = ["calido", "verde", "arena"];
const LAYOUTS = ["escaparate", "dividida", "galeria", "portada"];
const TRANSITIONS = ["fundido", "cortina", "lateral", "vertical"];
const SCENE_LAYOUTS = ["hero","magazine","duo","detail","offer"];
const SCENE_EFFECTS = ["rise","stagger","mask","side","scale"];
const SCENE_TRANSITIONS = ["fade","wipe","push","up"];

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}
function extractText(body) {
  if (typeof body.output_text === "string") return body.output_text;
  for (const item of body.output || [])
    for (const c of item.content || [])
      if (c.type === "output_text" && typeof c.text === "string") return c.text;
  return "";
}
function safeImages(product) {
  return ["image_url","image_url_2","image_url_3","image_url_4"]
    .map(key => product[key])
    .filter(value => typeof value === "string" && /^https:\/\/[^ ]+$/i.test(value));
}
function shorten(value, max) { return String(value ?? "").trim().slice(0, max); }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, {error:"Método no permitido."});
  }
  const auth = await requirePosUser(req, res);
  if (!auth) return;
  if (auth.role !== "admin") return json(res, 403, {error:"Atlas Creativo está reservado al administrador del POS."});
  if (!process.env.OPENAI_API_KEY) return json(res, 503, {error:"Falta configurar OPENAI_API_KEY en Vercel."});
  const productId = Number(req.body?.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0) return json(res, 400, {error:"Selecciona un producto válido."});
  const instruction = shorten(req.body?.instruction, 600);
  const variation = Number.isInteger(Number(req.body?.variation)) ? Math.max(1, Math.min(1000,Number(req.body.variation))) : 1;
  const pastTitles = Array.isArray(req.body?.pastTitles) ? req.body.pastTitles.slice(-8).map(t=>shorten(t,90)) : [];
  const pastLayouts = Array.isArray(req.body?.pastLayouts) ? req.body.pastLayouts.slice(-8).filter(x=>LAYOUTS.includes(x)) : [];
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return json(res,503,{error:"No está configurada la consulta segura de inventario."});
  try {
    const params = new URLSearchParams({
      select:"id,code,name,category,price,stock,image_url,image_url_2,image_url_3,image_url_4",
      id:"eq."+productId,
      limit:"1"
    });
    const dbRes=await fetch(supabaseUrl+"/rest/v1/products?"+params,{
      headers:{apikey:anonKey,Authorization:auth.authorization,"Accept":"application/json"}
    });
    if (!dbRes.ok) return json(res,dbRes.status===403?403:502,{error:"No se pudo verificar el inventario desde el POS."});
    const [product] = await dbRes.json();
    if (!product) return json(res,404,{error:"El producto no existe o no tienes permiso para consultarlo."});
    if (!(Number(product.stock)>0)) return json(res,409,{error:"El producto está agotado. No generar anuncios de productos sin stock."});
    if (!(Number(product.price)>0)) return json(res,409,{error:"El producto no tiene un precio válido."});
    const images=safeImages(product);
    if (!images.length) return json(res,409,{error:"El producto no tiene fotografías verificadas en el POS."});

    const brief=[
      "Eres Atlas Creativo, director de arte de Ventas Donatello en Reynosa, México.",
      "Propón una composición editorial ORIGINAL para un Reel vertical de muebles utilizando únicamente las fotos reales que el POS tiene del artículo.",
      "El render SIEMPRE es HTML/CSS/GSAP local con HyperFrames y FFmpeg. No propongas otro generador.",
      "Tu salida configura un compositor SEGURO con movimientos y paletas preaprobados; nunca escribas HTML, CSS o JS.",
      "TU RESPONSABILIDAD ES DIRIGIR EL VIDEO COMPLETO, NO SOLO REDACTAR TEXTOS.",
      "Nueva función V6: construye storyboard.scenes con 2 a 4 escenas REALES (no siempre las mismas tres).",
      "Cada escena debe definir layout, transition, animation, image, secondaryImage, duration, title y subtitle.",
      "El motor usa las composiciones hero (foto grande con texto inferior), magazine (foto a la izquierda y texto a la derecha), duo (dos fotos en apertura), detail (titular superior y foto inferior), offer (precio y CTA final).",
      "La última escena SIEMPRE debe ser offer, mínimo 3.5 segundos, máximo 5.5.",
      "Cada otra escena entre 2.5 y 5.5 segundos. Duración TOTAL entre 7 y 19 segundos.",
      "Cada escena usa imágenes originales por índice cero-based. Elige image y secondaryImage válidos. Nunca duo si hay menos de dos fotografías.",
      "Animación del TÍTULO: rise = ascenso suave; stagger = palabra por palabra; mask = revelado por máscara; side = entrada lateral; scale = crecimiento sutil.",
      "Transiciones: fade, wipe, push, up. No repitas idénticas transiciones y animaciones en todos los segmentos.",
      "Variar cantidad, orden y ritmo de escenas según las fotos; no agregar escenas sin aportar información visual.",
      "No colocar información inventada en escena detail; la disposición detail es un estilo gráfico, no un aumento artificial de detalle.",
      "Si sólo hay una foto, considera 2 escenas (hero, offer), con movimiento y tipografía diferentes.",
      "La publicación facebookPost acompaña el Reel: español mexicano natural, de 180 a 350 caracteres; incluir dirección Calle Donatello 201, Jarachina Sur, catálogo catalogo.ventasdonatello.com y una pregunta; sin menciones falsas de escasez.",
      "Evita hashtags genéricos, exageraciones y textos que parezcan redactados por un bot.",
      "Debes escoger layout y transition en función del uso y las fotos reales del producto.",
      "Layouts: escaparate = foto central completa y texto inferior; dividida = foto grande a un lado y texto editorial al otro; galeria = ambas fotos juntas en apertura y cierre grande; portada = titular arriba y foto grande debajo.",
      "Transiciones: fundido = disolvencia suave; cortina = revelado lateral; lateral = una escena desplaza a la otra; vertical = segunda escena entra desde abajo.",
      "Preferencias: una sola foto o ficha de dimensiones -> escaparate o portada; dos fotos de ambiente reales -> galeria; objeto pequeño o lateral -> dividida; escenas con fotos amplias -> portada.",
      "Si el producto no encaja, razona en why una propuesta comercial mejor sin inventar escenas nuevas.",
      "Reglas absolutas:",
      "- Piensa como alguien que quiere vender exactamente este producto; identifica primero para qué sirve.",
      "- No confundas mesa lateral, buró, mesa de centro, escritorio o mesa de comedor.",
      "- Nunca inventes materiales, marcas, dimensiones, cantidad, propiedades, escenas o usos específicos que no aparezcan en el nombre o fotografías.",
      "- Fotografía auténtica y objeto COMPLETO: sin zoom exagerado ni reemplazos visuales.",
      "- Textos humanos, específicos, variados y naturales en español mexicano; nada de frases artificiales.",
      "- Precio y stock son datos controlados por el POS: no los incluyas en los textos.",
      "- Cierre con una pregunta breve que invite a escribir, sin urgencia falsa.",
      "- Elegir editorial, detalles o imagina como punto de partida; elegir también motion, palette, layout y transition. Debe notarse la diferencia en el video terminado.",
      "- Evita repetir el mismo layout/transition en productos consecutivos siempre que las fotografías lo permitan.",
      "- Apertura y segunda escena deben ser diferentes entre sí y respecto a otros Reels.",
      "- Elige image1 e image2 como índices CERO-BASED de la galería real; puedes repetir únicamente si hay una sola foto.",
      "- Usa image2 como escena final con precio, sin cierre adicional.",
      "- Mantén campos de texto breves para pantallas móviles: title1/title2 <= 55 caracteres, sub1/sub2 <= 110, details <= 100, cta <= 75, tags <= 32.",
      "Nombre exacto: "+shorten(product.name,100),
      "Categoría: "+shorten(product.category,70),
      "Fotos verificadas disponibles: "+images.length,
      "Código de producto: "+shorten(product.code,40),
      "Variación creativa solicitada: "+variation,
      "Títulos usados recientemente (evita repetir): "+(pastTitles.join(" | ")||"ninguno"),
      "Layouts usados recientemente: "+(pastLayouts.join(" | ")||"ninguno"),
      "Instrucción del administrador: "+(instruction||"Haz una propuesta elegante y orientada a consultas."),
      "Selecciona imágenes según la utilidad comercial y sin presentar fichas técnicas como protagonistas cuando haya fotografías de ambiente."
    ].join("\n");
    const content=[{type:"input_text",text:brief}];
    // Mostrar las cuatro fotos disponibles para distinguir ambiente, ficha técnica y acabado.
    for(const url of images.slice(0,4)) {
      content.push({type:"input_image",image_url:url,detail:"low"});
    }
    const request={
      model:MODEL,reasoning:{effort:"low"},max_output_tokens:2300,
      input:[{role:"user",content}],
      text:{format:{type:"json_schema",name:"donatello_creative_reel",strict:true,
        schema:{type:"object",additionalProperties:false,properties:{
          concept:{type:"string"},why:{type:"string"},
          template:{type:"string",enum:TEMPLATES},
          motion:{type:"string",enum:MOTIONS},
          palette:{type:"string",enum:PALETTES},
          layout:{type:"string",enum:LAYOUTS},
          transition:{type:"string",enum:TRANSITIONS},
          image1:{type:"integer"},image2:{type:"integer"},
          title1:{type:"string"},title2:{type:"string"},
          sub1:{type:"string"},sub2:{type:"string"},
          details:{type:"string"},cta:{type:"string"},
          tag1:{type:"string"},tag2:{type:"string"},
          facebookPost:{type:"string"},
          storyboard:{type:"object",additionalProperties:false,properties:{
            scenes:{type:"array",minItems:2,maxItems:4,items:{
              type:"object",additionalProperties:false,
              properties:{
                layout:{type:"string",enum:SCENE_LAYOUTS},
                transition:{type:"string",enum:SCENE_TRANSITIONS},
                animation:{type:"string",enum:SCENE_EFFECTS},
                image:{type:"integer"},secondaryImage:{type:"integer"},
                duration:{type:"number"},title:{type:"string"},subtitle:{type:"string"}
              },required:["layout","transition","animation","image","secondaryImage","duration","title","subtitle"]
            }}
          },required:["scenes"]}
        },required:["concept","why","template","motion","palette","layout","transition","image1","image2","title1","title2","sub1","sub2","details","cta","tag1","tag2","facebookPost","storyboard"]}}}
    };
    const aiRes=await fetch(OPENAI_URL,{
      method:"POST",
      headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify(request)
    });
    const result=await aiRes.json();
    if (!aiRes.ok) return json(res,502,{error:result?.error?.message||"Atlas no consiguió generar una propuesta."});
    const output=extractText(result);
    if (!output) return json(res,502,{error:"Atlas no devolvió una propuesta utilizable."});
    const draft=JSON.parse(output);
    if (!TEMPLATES.includes(draft.template)||!MOTIONS.includes(draft.motion)||!PALETTES.includes(draft.palette)||!LAYOUTS.includes(draft.layout)||!TRANSITIONS.includes(draft.transition)) throw Error("La propuesta usa parámetros de video no permitidos.");
    const minmax=index=>Number.isInteger(index)?Math.max(0,Math.min(images.length-1,index)):0;
    const creative={
      concept:shorten(draft.concept,180),why:shorten(draft.why,300),
      template:draft.template,motion:draft.motion,palette:draft.palette,
      layout:images.length===1&&draft.layout==="galeria"?"portada":draft.layout,transition:draft.transition,
      image1:minmax(draft.image1),image2:minmax(draft.image2),
      title1:shorten(draft.title1,55),title2:shorten(draft.title2,55),
      sub1:shorten(draft.sub1,110),sub2:shorten(draft.sub2,110),
      details:shorten(draft.details,100),cta:shorten(draft.cta,75),
      tag1:shorten(draft.tag1,32),tag2:shorten(draft.tag2,32),
      facebookPost:shorten(draft.facebookPost,650)
    };
    const proposed = draft.storyboard?.scenes || [];
    if(proposed.length<2 || proposed.length>4)throw Error("Storyboard fuera del límite de escenas.");
    const scenes = proposed.map((item,i)=>{
      const isLast=i===proposed.length-1;
      const layout = isLast ? "offer" : SCENE_LAYOUTS.includes(item.layout)&&item.layout!=="offer"?item.layout:"hero";
      const image = minmax(item.image);
      const secondaryImage = minmax(item.secondaryImage);
      const safeLayout = layout==="duo" && images.length===1?"hero":layout;
      const duration = Math.max(isLast?3.5:2.5,Math.min(5.5,Number(item.duration)||3.5));
      return {
        layout:safeLayout,
        transition:SCENE_TRANSITIONS.includes(item.transition)?item.transition:"fade",
        animation:SCENE_EFFECTS.includes(item.animation)?item.animation:"rise",
        image,secondaryImage,duration:Math.round(duration*10)/10,
        title:shorten(item.title,65),subtitle:shorten(item.subtitle,120)
      };
    });
    let total=scenes.reduce((n,scene)=>n+scene.duration,0);
    if(total>19){const over=total-19;scenes[0].duration=Math.max(2.5,Math.round((scenes[0].duration-over)*10)/10)}
    creative.storyboard={scenes};
    return json(res,200,{ok:true,creative,product:{id:product.id,code:product.code,name:product.name,category:product.category,price:product.price,stock:product.stock,images},usage:result.usage||null});
  } catch(error) {
    console.error("Atlas Creative:",error);
    return json(res,500,{error:"No se pudo preparar el Reel. Revisa el producto e inténtalo nuevamente."});
  }
}

// Motor comercial puro: solo consulta nombre, categoría, código y precio PUBLICADO.
// No usa IA generativa, no consulta costos ni promete políticas no verificadas.
export function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}
const IGNORE = new Set([
  "quiero","busco","tienes","tienen","de","la","el","los","las","una","uno","un","con",
  "por","para","que","hay","precio","cuanto","cuesta","cuestan","disponible","cual",
  "me","puedes","mostrar","vender","venden","alguna","algun","ver","en","y",
]);
export function commercialReply(message, inventory) {
  const q = normalize(message).slice(0,300);
  const includes = (...values) => values.some(v => q.includes(normalize(v)));
  if (q === "2" || includes("asesor","humano","persona","hablar con", "quiero hablar")) {
    return { text: "Claro, te atenderá una persona de Donatello por este WhatsApp. En cuanto esté disponible continuará tu consulta.", human: true };
  }
  if (q === "1") {
    return { text: "¡Perfecto! Dime qué producto buscas: por ejemplo, silla, lámpara, mesa o sillón. Te comparto los precios que tenemos publicados.", human: false };
  }
  if (!q || includes("hola","buen dia","buenas","inicio","menu","informacion general") && q.split(" ").length < 4) {
    return { text: "¡Hola! 👋 Bienvenido a Donatello.\n\n1️⃣ Informes y precios de muebles, lámparas y decoración.\n2️⃣ Hablar con una persona de Donatello.\n\nTambién puedes escribir directamente qué producto estás buscando.", human: false };
  }
  if (includes("direccion","ubicacion","donde estan","como llego","donde se encuentran")) {
    return { text: "Estamos en Calle Donatello 201, Jarachina Sur, Reynosa. Atendemos hasta las 9:30 p. m.", human: false };
  }
  if (includes("horario","hora abren","cierran","a que hora")) {
    return { text: "Atendemos hasta las 9:30 p. m. La hora de apertura puede confirmártela una persona de Donatello.", human: false };
  }
  if (includes("envio","entrega","domicilio","flete","reparto","garantia","devolucion",
    "descuento","apartar","apartado","reservar","mayoreo","factura","medidas",
    "dimensiones","material","pago","tarjeta","credito","meses","instalacion","armado")) {
    return { text: "Para darte una respuesta correcta sobre esa condición, te atenderá una persona de Donatello por este WhatsApp. En cuanto esté disponible continuará tu consulta.", human: true };
  }
  const terms = q.split(" ").filter(t=>t.length>=3&&!IGNORE.has(t)).slice(0,7);
  if (terms.length === 0) return { text: "Puedo ayudarte con muebles, iluminación y decoración. Escribe el nombre del producto que buscas o escribe 2 para hablar con Donatello.", human: false };
  const hits = inventory.map(p => {
    const name = normalize(p.name), cat = normalize(p.category), code = normalize(p.code);
    let score = 0;
    for (const part of terms) {
      const variants = [part];
      if (part.endsWith("es")&&part.length>5) variants.push(part.slice(0,-2));
      if (part.endsWith("s")&&part.length>4) variants.push(part.slice(0,-1));
      if (variants.some(v=>name.includes(v)))score+=5;
      if (variants.some(v=>cat.includes(v)))score+=3;
      if (variants.some(v=>code.includes(v)))score+=12;
    }
    return { p,score };
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
  if (!hits.length) {
    return { text: "No encontré una coincidencia confirmada en el catálogo. Una persona de Donatello te atenderá por este WhatsApp para revisar otras opciones.", human: true };
  }
  const lines = hits.map(({p}) => {
    const price = Number(p.price);
    const valid = Number.isFinite(price) && price > 0;
    return "• " + String(p.name).slice(0,100) +
      (valid ? " — $" + price.toLocaleString("es-MX",{maximumFractionDigits:2}) + " MXN" : "") +
      "\nhttps://catalogo.ventasdonatello.com/p/" + encodeURIComponent(p.id);
  });
  return { text: "Estas opciones aparecen disponibles en el catálogo:\n\n" +
    lines.join("\n\n") +
    "\n\nLos precios y existencias se confirman al cerrar la compra. Si quieres atención personal, responde 2.",human:false };
}
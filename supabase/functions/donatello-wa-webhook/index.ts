import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { commercialReply } from "../_shared/donatello-commercial-replies.ts";

// Webhook exclusivo de Donatello. Nunca procesar las WABA ajenas.
const MAX_BYTES = 256 * 1024;
const MAX_EVENTS = 30;
const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function canonicalPhone(value: unknown) {
  const v = String(value || "").replace(/\D/g,"");
  return /^521\d{10}$/.test(v) ? "52" + v.slice(3) : v;
}
async function verifySignature(raw: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("META_DONATELLO_APP_SECRET");
  if (!secret || !signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const bytes = new Uint8Array((signature.slice(7).match(/.{2}/g) || []).map(x=>parseInt(x,16)));
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    { name: "HMAC",hash: "SHA-256" },false,["verify"]);
  return crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(raw));
}
async function rpc(name: string, args: Record<string,unknown> = {}) {
  const { data,error } = await admin.rpc(name,args);
  if (error) throw new Error(name + " failed");
  return data;
}
async function handleInbound(message: any, phoneId: string, waba: string, config: any) {
  if (!message?.id || typeof message.id !== "string" || !message.id.startsWith("wamid.") ||
    message.id.length>256) return;
  const sender = canonicalPhone(message.from);
  if (!/^\d{8,16}$/.test(sender)) return;
  const accepted = await rpc("donatello_wa_receive",{
    p_message_id: message.id,p_phone_id:phoneId,p_waba:waba,p_from:sender,p_human:false
  });
  if (accepted?.accepted !== true) return;
  const botOn = Deno.env.get("DONATELLO_WA_AUTOSEND_ENABLED") === "true";
  if (!botOn || !config?.bot_enabled || !config?.token || !config?.webhook_subscribed ||
      (config.token_expires_at && Date.parse(config.token_expires_at) < Date.now())) {
    await rpc("donatello_wa_finish",{p_message_id:message.id,p_status:"paused"});
    return;
  }
  if (message.type !== "text" ||
      typeof message?.text?.body !== "string" ||
      message.text.body.length>2000 || !message.text.body.trim()) {
    await rpc("donatello_wa_contact_handoff",{p_phone:sender,p_human:true});
    await rpc("donatello_wa_finish",{p_message_id:message.id,p_status:"manual"});
    return;
  }

  // Inventory contains ONLY publicly published fields, never cost/profit.
  const { data: products, error } = await admin.from("products")
    .select("id,name,code,category,price,stock")
    .gt("stock",0).order("id",{ascending:false}).limit(250);
  if (error) {
    await rpc("donatello_wa_finish",{p_message_id:message.id,p_status:"uncertain"});
    return;
  }
  const answer = commercialReply(message.text.body,products || []);
  if (answer.human && !answer.text) {
    await rpc("donatello_wa_contact_handoff",{p_phone:sender,p_human:true});
    await rpc("donatello_wa_finish",{p_message_id:message.id,p_status:"manual"});
    return;
  }
  if (!(await rpc("donatello_wa_can_send",{
    p_message_id:message.id,p_phone_id:phoneId,p_from:sender,
  }))) {
    await rpc("donatello_wa_finish",{p_message_id:message.id,p_status:"manual"});
    return;
  }
  // Exactly one Graph send attempt per provider wamid. No automatic retry on error/timeout.
  let status = "uncertain", outbound: string | null = null;
  try {
    const response = await fetch("https://graph.facebook.com/v26.0/" + phoneId + "/messages",{
      method:"POST",
      headers:{
        Authorization:"Bearer " + String(config.token),
        "Content-Type":"application/json",
      },
      body:JSON.stringify({
        messaging_product:"whatsapp",recipient_type:"individual",to:sender,
        type:"text",text:{preview_url:false,body:answer.text.slice(0,4000)},
      }),
      signal:AbortSignal.timeout(12000),
    });
    const result = await response.json().catch(()=>({}));
    if (response.ok && typeof result?.messages?.[0]?.id==="string") {
      status="sent";outbound=String(result.messages[0].id);
    }
  } catch {
    // Graph may have accepted the message; do not retry.
  }
  await rpc("donatello_wa_finish",{
    p_message_id:message.id,p_status:status,p_outbound_id:outbound,
  });
  if (answer.human) {
    // Whether Meta delivered the advisory or not, hand control to a person.
    await rpc("donatello_wa_contact_handoff",{p_phone:sender,p_human:true});
  }
}
async function handleEcho(echo:any,phoneId:string,waba:string,displayPhone:string) {
  // Only a signed outgoing WhatsApp Business-app echo proves human involvement.
  if (!echo || typeof echo.id!=="string" || !echo.id.startsWith("wamid.") ||
      canonicalPhone(echo.from)!==canonicalPhone(displayPhone) ||
      !["text","image","video","audio","document","sticker","location","contacts"].includes(echo.type)) return;
  const recipient=canonicalPhone(echo.to);
  if (!/^\d{8,16}$/.test(recipient))return;
  await rpc("donatello_wa_receive",{
    p_message_id:echo.id,p_phone_id:phoneId,p_waba:waba,p_from:recipient,p_human:true,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const u = new URL(req.url);
    const expected = Deno.env.get("DONATELLO_WA_VERIFY_TOKEN") || "";
    if (expected && u.searchParams.get("hub.mode")==="subscribe" &&
       u.searchParams.get("hub.verify_token")===expected &&
       u.searchParams.get("hub.challenge")) {
      return new Response(u.searchParams.get("hub.challenge"),{status:200});
    }
    return new Response("Forbidden",{status:403});
  }
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});
  if (Number(req.headers.get("content-length")||0)>MAX_BYTES) return new Response("Too large",{status:413});
  const raw=await req.text();
  if (raw.length>MAX_BYTES) return new Response("Too large",{status:413});
  if (!(await verifySignature(raw,req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature",{status:401});
  }
  let payload:any;
  try { payload=JSON.parse(raw); } catch { return new Response("Invalid JSON",{status:400}); }
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return new Response("ok",{status:200});
  }
  let events=0;
  try {
    const config=await rpc("donatello_wa_access");
    if (!config?.waba_id || !config?.phone_number_id) return new Response("ok",{status:200});
    for (const entry of payload.entry.slice(0,10)) {
      if (String(entry.id)!==String(config.waba_id)) continue;
      for (const change of (Array.isArray(entry.changes)?entry.changes:[]).slice(0,10)) {
        const value=change?.value;
        if (String(value?.metadata?.phone_number_id)!==String(config.phone_number_id)) continue;
        if (change.field==="smb_message_echoes" && Array.isArray(value?.message_echoes)) {
          for (const echo of value.message_echoes) {
            if (++events>MAX_EVENTS) return new Response("Too many events",{status:413});
            await handleEcho(echo,config.phone_number_id,config.waba_id,
              String(value?.metadata?.display_phone_number||config.display_phone||""));
          }
        } else if (change.field==="messages" && Array.isArray(value?.messages)) {
          for (const message of value.messages) {
            if (++events>MAX_EVENTS) return new Response("Too many events",{status:413});
            await handleInbound(message,config.phone_number_id,config.waba_id,config);
          }
        }
      }
    }
    return new Response("ok",{status:200});
  } catch {
    console.error("donatello-wa-webhook: signed delivery could not be reconciled");
    return new Response("Temporary error",{status:503});
  }
});
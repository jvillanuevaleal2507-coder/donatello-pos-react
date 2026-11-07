import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const META_APP_ID = "2173704550192119";
const META_CONFIG_ID = "2133113274004543";
const box = { border: "1px solid #d7e0d9", borderRadius: 16, background: "#fff", padding: 20, display: "grid", gap: 14 };
const green = { background: "#174d36", color: "white", border: 0, padding: "12px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 800 };
const neutral = { background: "#f6f5f1", color: "#173e2d", border: "1px solid #cad8ca", padding: "11px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700 };
const danger = { ...green, background: "#7f2727" };

async function execute(action, fields = {}) {
  const { data, error } = await sb.functions.invoke("donatello-wa-control", {
    body: { action, ...fields },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || "La operación no se completó");
  return data;
}

export default function DonatelloWhatsAppBotPage() {
  const [status, setStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [previewText, setPreviewText] = useState("¿Tienen lámparas?");
  const [preview, setPreview] = useState(null);
  const metaDataRef = useRef(null);
  const metaCodeRef = useRef("");
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await execute("status");
      setStatus(data);
      const rows = await execute("contacts");
      setContacts(Array.isArray(rows.contacts) ? rows.contacts : []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    const initialize = () => {
      if (!window.FB) return;
      window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: "v24.0" });
      if (active) setSdkReady(true);
    };
    const oldInit = window.fbAsyncInit;
    window.fbAsyncInit = () => { if (typeof oldInit === "function") oldInit(); initialize(); };
    if (window.FB) initialize();
    else if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk"; script.async = true; script.defer = true;
      script.crossOrigin = "anonymous"; script.src = "https://connect.facebook.net/en_US/sdk.js";
      document.head.appendChild(script);
    }
    const onMessage = (event) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let payload = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP" || !payload?.data) return;
      if (!payload?.data?.waba_id || !payload?.data?.phone_number_id) return;
      metaDataRef.current = payload.data;
      finishWhenReady();
    };
    window.addEventListener("message", onMessage);
    return () => {
      active = false; window.removeEventListener("message", onMessage);
      if (window.fbAsyncInit !== oldInit) window.fbAsyncInit = oldInit;
    };
    // finishWhenReady only reads refs and uses the stable function invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishWhenReady() {
    const details = metaDataRef.current;
    const code = metaCodeRef.current;
    if (!details?.waba_id || !details?.phone_number_id || !code || pendingRef.current) return;
    pendingRef.current = true;
    setBusy("connect"); setError(""); setMessage("Verificando número y coexistencia en Meta…");
    try {
      const result = await execute("connect", {
        code, waba_id: details.waba_id, phone_number_id: details.phone_number_id,
      });
      if (result.connected) {
        setMessage("Número vinculado. El bot permanece apagado hasta que autorices sus respuestas.");
        await refresh();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(""); pendingRef.current = false;
      metaCodeRef.current = ""; metaDataRef.current = null;
    }
  }

  function connect() {
    if (!sdkReady || !window.FB) { setError("El módulo de Meta aún no está disponible."); return; }
    if (!status?.app_secret_ready || !status?.verify_token_ready) {
      setError("Primero configura los dos secretos de Meta indicados abajo en Supabase."); return;
    }
    if (!window.confirm("Se abrirá Meta para vincular únicamente el WhatsApp de Donatello (899 912 2313). ¿Continuar?")) return;
    setError("");setMessage("");
    metaCodeRef.current = ""; metaDataRef.current = null; pendingRef.current = false;
    window.FB.login(
      (response) => {
        if (response?.authResponse?.code) {
          metaCodeRef.current = response.authResponse.code;
          finishWhenReady();
        } else {
          setError("Meta no entregó la autorización. Comprueba permisos y vuelve a intentarlo.");
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        // Embedded Signup v4: productos, activos y permisos se configuran
        // en Facebook Login for Business (META_CONFIG_ID).
        // Conservar explícito Coexistence para seguir usando WhatsApp Business.
        // No enviar campos heredados de v2/v3 (sessionInfoVersion/features).
        extras: {
          version: "v4",
          featureType: "whatsapp_business_app_onboarding",
        },
      },
    );
  }

  async function toggle() {
    const next = status?.bot_enabled !== true;
    if (next && !window.confirm(
      "Esto permitirá responder automáticamente en el WhatsApp de Donatello. Las conversaciones que tomes manualmente deberán quedar asignadas a una persona. ¿Activar?"
    )) return;
    setBusy("toggle"); setError("");setMessage("");
    try {
      const result = await execute("toggle", { enabled: next });
      setMessage(result.enabled ? "Bot de Donatello activado." : "Bot de Donatello apagado.");
      await refresh();
    } catch (e) { setError(e.message); }
    finally {setBusy("");}
  }
  async function setHuman(phone, human) {
    setBusy(phone);setError("");
    try {
      await execute("takeover",{phone,human});
      setMessage(human ? "Atención humana activada para el contacto." : "Contacto devuelto al bot.");
      await refresh();
    } catch (e) {setError(e.message);}
    finally {setBusy("");}
  }
  async function simulate() {
    setBusy("preview");setPreview(null);setError("");
    try {
      const result = await execute("preview",{message:previewText});
      setPreview(result.preview);
    } catch (e) {setError(e.message);}
    finally {setBusy("");}
  }

  return (
    <section style={{ display: "grid", gap: 17, maxWidth: 1040, margin: "auto", padding: "4px 0 24px" }}>
      <header>
        <span style={{fontWeight:800,fontSize:12,letterSpacing:2,color:"#b6883e"}}>DONATELLO / AUTOMATIZACIÓN</span>
        <h2 style={{margin:"7px 0"}}>Bot de WhatsApp Business</h2>
        <p style={{color:"#596960"}}>Atiende consultas de muebles, precios y ubicación con el inventario real. Tú o Daly pueden tomar cualquier conversación desde WhatsApp Business.</p>
      </header>
      {error && <p role="alert" style={{color:"#9d2323",background:"#fff1f1",borderRadius:10,padding:12}}>{error}</p>}
      {message && <p role="status" style={{color:"#115e37",background:"#effbf2",borderRadius:10,padding:12}}>{message}</p>}
      {!status ? <p>Consultando el estado de Donatello…</p> : <>
        <div style={box}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"center"}}>
            <div>
              <strong style={{fontSize:18}}>Estado: {status.bot_enabled ? "Respuestas activas" : "Respuestas apagadas"}</strong>
              <p style={{color:"#647168",margin:"6px 0"}}>{status.connected ? "Número enlazado: " + status.display_phone : "Número pendiente de vinculación a Meta"}</p>
            </div>
            <button type="button" style={status.bot_enabled?danger:green}
              onClick={toggle} disabled={!!busy || (!status.connected && !status.bot_enabled) || (!status.autosend_permitted && !status.bot_enabled)}>
              {status.bot_enabled ? "Apagar bot" : "Activar bot"}
            </button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:16,color:"#56685c",fontSize:13}}>
            <span>Conexión Meta: {status.connected?"Conectada":"Pendiente"}</span>
            <span>Webhook: {status.webhook_subscribed?"Suscrito":"Pendiente"}</span>
            <span>Autorización de envío: {status.autosend_permitted?"Disponible":"Apagada"}</span>
            <span>Conversaciones con persona: {status.human_contacts || 0}</span>
          </div>
        </div>
        <div style={box}>
          <h3 style={{margin:0}}>1. Vincular WhatsApp de Donatello</h3>
          <p style={{margin:0}}>Número esperado: <strong>899 912 2313</strong>. Se verificará que Meta permita conservar WhatsApp Business en el teléfono y que la cuenta conectada sea la de Donatello.</p>
          <p style={{margin:0,fontSize:13,color:"#6a5d43"}}>
            Antes de conectar, configura en Supabase de Donatello los secretos <code>META_DONATELLO_APP_SECRET</code> y <code>DONATELLO_WA_VERIFY_TOKEN</code>. El segundo debe ser una cadena aleatoria larga. No pegues esos valores en el chat ni en GitHub.
          </p>
          <p style={{margin:0,fontSize:13}}>
            Callback exclusivo de Donatello: <code style={{wordBreak:"break-all"}}>{status.webhook_url}</code>
          </p>
          <p style={{margin:0,fontSize:13,color:"#6a5d43"}}>
            Meta debe permitir el dominio del POS en los dominios autorizados de la aplicación. La suscripción se hará por cuenta WABA para no modificar Mi Casa Loto.
          </p>
          <button type="button" style={green} onClick={connect}
            disabled={!!busy || !sdkReady || !status.app_secret_ready || !status.verify_token_ready}>
            {busy==="connect"?"Conectando…":status.connected?"Reconectar con Meta":"Conectar WhatsApp Business"}
          </button>
          {(!status.app_secret_ready || !status.verify_token_ready) && <small style={{color:"#9a6730"}}>Faltan secretos de Meta en Supabase. La conexión se mantiene bloqueada hasta configurarlos.</small>}
        </div>
        <div style={box}>
          <h3 style={{margin:0}}>2. Probar respuestas sin enviar mensajes</h3>
          <p style={{margin:0,fontSize:13,color:"#687569"}}>Prueba el motor antes de habilitarlo. El simulador nunca utiliza WhatsApp para enviar.</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <input aria-label="Pregunta de prueba" value={previewText} maxLength={300}
              onChange={e=>setPreviewText(e.target.value)} style={{flex:"1 1 220px",padding:12,border:"1px solid #c4d1c9",borderRadius:9}} />
            <button type="button" disabled={!!busy || !previewText.trim()} onClick={simulate} style={neutral}>Simular respuesta</button>
          </div>
          {preview && <div style={{background:"#f6f8f5",padding:14,borderRadius:10,whiteSpace:"pre-wrap",lineHeight:1.5}}>
            {preview.human?"Se derivaría a una persona.":"El bot respondería:"}
            <p style={{marginBottom:0}}>{preview.text || "No respondería automáticamente para respetar la atención humana."}</p>
          </div>}
        </div>
        <div style={box}>
          <h3 style={{margin:0}}>3. Atención humana</h3>
          <p style={{margin:0,fontSize:13,color:"#687569"}}>
            Cuando contestes desde WhatsApp Business y Meta entregue el eco correspondiente, el bot se detendrá para ese contacto. También puedes pausarlo manualmente aquí.
          </p>
          <button type="button" style={neutral} onClick={refresh} disabled={!!busy}>Actualizar contactos</button>
          {contacts.length === 0 ? <p style={{margin:0,color:"#758078"}}>Aún no hay contactos registrados en este bot.</p> : (
            <div style={{display:"grid",gap:9}}>
              {contacts.map(c=>(
                <div key={c.phone} style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",border:"1px solid #e3e7de",borderRadius:12,padding:12}}>
                  <div><strong>{c.phone}</strong><div style={{fontSize:12,color:"#758078"}}>{c.human_takeover?"Atención humana":"Bot habilitable"} · {c.last_inbound_at ? new Date(c.last_inbound_at).toLocaleString("es-MX") : "Sin fecha"}</div></div>
                  <button type="button" style={neutral} disabled={!!busy} onClick={()=>setHuman(c.phone,!c.human_takeover)}>
                    {c.human_takeover?"Devolver al bot":"Tomar conversación"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <p style={{fontSize:12,color:"#69776d",margin:0}}>
          Mi Casa Loto está completamente separado. No se envían promociones masivas ni mensajes fuera de conversaciones iniciadas por clientes. Los precios siempre provienen del inventario público.
        </p>
      </>}
    </section>
  );
}
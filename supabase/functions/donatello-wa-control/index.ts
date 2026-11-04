import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

// Esta función solo administra el número comercial de Donatello.
// No acepta tokens, WABAs ni secretos proporcionados directamente por el navegador.
const APP_ID = "2173704550192119";
const GRAPH = "v26.0";
const PROJECT_URL = "https://lotgmhfqzthhhadavwlu.supabase.co";
const WEBHOOK = PROJECT_URL + "/functions/v1/donatello-wa-webhook";
const ORIGINS = new Set(["https://pos.ventasdonatello.com","http://localhost:5173"]);
const DONATELLO_NUMBER = new Set(["528999122313","5218999122313"]);

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function allowOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (ORIGINS.has(origin) || /^https:\/\/donatello-pos-react-[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  return "";
}
function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    },
  });
}
function errorFromMeta(body: any): string {
  return String(body?.error?.message || "Meta no pudo completar la solicitud.").slice(0,180);
}
async function graph(path: string, token: string, method = "GET", body?: object) {
  const res = await fetch("https://graph.facebook.com/" + GRAPH + path, {
    method,
    headers: {
      "Authorization": "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorFromMeta(data));
  return data;
}
async function adminAuthorization(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !anonKey) return false;
  const token = auth.slice(7);
  if (token.length < 30 || token.length > 6000) return false;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error } = await client.auth.getUser(token);
  if (error || !u?.user) return false;
  const { data: allowed, error: roleError } = await client.from("pos_authorized_users")
    .select("role,active").eq("user_id", u.user.id).single();
  return !roleError && allowed?.role === "admin" && allowed?.active === true;
}
function cleanPhone(v: any) {
  return String(v || "").replace(/\D/g, "");
}
function detailsWithFlags(data: any) {
  return {
    ...data,
    meta_app_id: APP_ID,
    webhook_url: WEBHOOK,
    app_secret_ready: Boolean(Deno.env.get("META_DONATELLO_APP_SECRET")),
    verify_token_ready: Boolean(Deno.env.get("DONATELLO_WA_VERIFY_TOKEN")),
    autosend_permitted: Deno.env.get("DONATELLO_WA_AUTOSEND_ENABLED") === "true",
  };
}
Deno.serve(async (req: Request) => {
  const origin = allowOrigin(req);
  if (origin === "") return json({ error: "origen_no_autorizado" }, 403, null);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "metodo_no_permitido" }, 405, origin);
  if (!url || !serviceKey) return json({ error: "servicio_no_disponible" }, 503, origin);
  if (!(await adminAuthorization(req))) return json({ error: "solo_administrador_pos" }, 403, origin);
  let args: Record<string, any> = {};
  try {
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "payload_demasiado_grande" }, 413, origin);
    args = JSON.parse(raw);
  } catch { return json({ error: "json_invalido" }, 400, origin); }

  const action = String(args.action || "");
  try {
    if (action === "status") {
      const { data, error } = await service.rpc("donatello_wa_read_status");
      if (error) throw error;
      return json(detailsWithFlags(data), 200, origin);
    }
    if (action === "contacts") {
      const { data, error } = await service.rpc("donatello_wa_contacts_read");
      if (error) throw error;
      return json({ contacts: data || [] }, 200, origin);
    }
    if (action === "takeover") {
      const phone = cleanPhone(args.phone);
      if (!/^\d{8,16}$/.test(phone) || typeof args.human !== "boolean") {
        return json({ error: "solicitud_invalida" }, 400, origin);
      }
      const { data, error } = await service.rpc("donatello_wa_contact_handoff", {
        p_phone: phone, p_human: args.human,
      });
      if (error || data !== true) return json({ error: "contacto_no_encontrado" }, 404, origin);
      return json({ ok: true, human_takeover: args.human }, 200, origin);
    }
    if (action === "toggle") {
      if (typeof args.enabled !== "boolean") return json({ error: "estado_invalido" }, 400, origin);
      if (args.enabled && Deno.env.get("DONATELLO_WA_AUTOSEND_ENABLED") !== "true") {
        return json({ error: "La autorización final de envíos sigue apagada en Supabase." }, 409, origin);
      }
      const { data, error } = await service.rpc("donatello_wa_set_bot_enabled", { p_enabled: args.enabled });
      if (error || data !== true) return json({ error: "No se pudo cambiar el estado; verifica la conexión de Meta." }, 409, origin);
      return json({ ok: true, enabled: args.enabled }, 200, origin);
    }
    if (action === "connect") {
      const secret = Deno.env.get("META_DONATELLO_APP_SECRET");
      const verifyToken = Deno.env.get("DONATELLO_WA_VERIFY_TOKEN");
      if (!secret || !verifyToken) {
        return json({ error: "Configura META_DONATELLO_APP_SECRET y DONATELLO_WA_VERIFY_TOKEN en este proyecto Supabase." }, 409, origin);
      }
      const code = String(args.code || "");
      const waba = String(args.waba_id || "");
      const phoneId = String(args.phone_number_id || "");
      if (!/^[A-Za-z0-9_-]{15,3000}$/.test(code) ||
          !/^\d{6,30}$/.test(waba) || !/^\d{6,30}$/.test(phoneId)) {
        return json({ error: "Meta no devolvió una autorización completa del número." }, 400, origin);
      }

      const exchange = new URL("https://graph.facebook.com/" + GRAPH + "/oauth/access_token");
      exchange.searchParams.set("client_id", APP_ID);
      exchange.searchParams.set("client_secret", secret);
      exchange.searchParams.set("code", code);
      const exchangeRes = await fetch(exchange.toString(), { signal: AbortSignal.timeout(15000) });
      const tokenData = await exchangeRes.json().catch(() => ({}));
      if (!exchangeRes.ok || !tokenData?.access_token) {
        return json({ error: errorFromMeta(tokenData) }, 502, origin);
      }
      const accessToken = String(tokenData.access_token);

      const list = await graph("/" + waba + "/phone_numbers?fields=id,display_phone_number,verified_name", accessToken);
      const selected = (Array.isArray(list.data) ? list.data : [])
        .find((x: any) => String(x.id) === phoneId);
      if (!selected || !DONATELLO_NUMBER.has(cleanPhone(selected.display_phone_number))) {
        return json({ error: "El número autorizado no coincide con el WhatsApp de Donatello. No se guardó la conexión." }, 409, origin);
      }
      const detail = await graph("/" + phoneId + "?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type", accessToken);
      if (detail?.is_on_biz_app !== true) {
        return json({ error: "Meta no confirmó coexistencia con WhatsApp Business. No modificaré la conexión del teléfono." }, 409, origin);
      }
      // WABA-specific override: jamás modificar callback global de la app Meta,
      // porque Mi Casa Loto utiliza la misma aplicación Donatello Platform.
      await graph("/" + waba + "/subscribed_apps", accessToken, "POST", {
        override_callback_uri: WEBHOOK,
        verify_token: verifyToken,
      });
      const expiry = Number(tokenData?.expires_in);
      const { error: storeError } = await service.rpc("donatello_wa_store_connection", {
        p_waba: waba, p_phone_id: phoneId,
        p_display: String(detail.display_phone_number || selected.display_phone_number || ""),
        p_name: String(detail.verified_name || selected.verified_name || ""),
        p_token: accessToken,
        p_token_expiry: Number.isFinite(expiry) && expiry > 0
          ? new Date(Date.now() + expiry * 1000).toISOString() : null,
        p_webhook_ok: true,
      });
      if (storeError) throw storeError;
      return json({ ok: true, connected: true, display_phone: selected.display_phone_number,
        bot_enabled: false, webhook_subscribed: true }, 200, origin);
    }
    return json({ error: "accion_no_permitida" }, 400, origin);
  } catch (err) {
    // No exponer tokens, secretos ni payload completo de Meta en respuestas/logs.
    const msg = err instanceof Error ? err.message : "";
    console.error("donatello-wa-control", action, msg.slice(0,100));
    return json({ error: "No se pudo completar la operación. Revisa la conexión y configuración de Meta." }, 502, origin);
  }
});
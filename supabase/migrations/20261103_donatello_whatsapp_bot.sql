-- Donatello: infraestructura WhatsApp comercial, separada de Mi Casa Loto.
-- Valor inicial: BOT APAGADO. Sin cambio de mensajes ni precios existentes.
CREATE SCHEMA IF NOT EXISTS donatello_internal;
REVOKE ALL ON SCHEMA donatello_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA donatello_internal TO service_role;

CREATE TABLE IF NOT EXISTS donatello_internal.wa_connection (
  id smallint PRIMARY KEY CHECK(id = 1),
  waba_id text,
  phone_number_id text,
  display_phone text,
  verified_name text,
  token_secret_id uuid,
  token_expires_at timestamptz,
  webhook_subscribed boolean NOT NULL DEFAULT false,
  bot_enabled boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_requires_verified_connection CHECK (
    bot_enabled = false OR
    (waba_id IS NOT NULL AND phone_number_id IS NOT NULL
     AND token_secret_id IS NOT NULL AND webhook_subscribed = true)
  )
);
INSERT INTO donatello_internal.wa_connection(id,bot_enabled) VALUES(1,false)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS donatello_internal.wa_contacts (
  phone text PRIMARY KEY CHECK(phone ~ '^[0-9]{8,16}$'),
  human_takeover boolean NOT NULL DEFAULT false,
  last_human_at timestamptz,
  last_inbound_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS donatello_internal.wa_receipts (
  provider_message_id text PRIMARY KEY,
  phone_number_id text NOT NULL,
  from_phone text NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK(status IN ('attempted','sent','uncertain','manual','paused')),
  outbound_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS wa_contacts_latest_idx ON donatello_internal.wa_contacts(last_inbound_at DESC);
ALTER TABLE donatello_internal.wa_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE donatello_internal.wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE donatello_internal.wa_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA donatello_internal FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA donatello_internal TO service_role;

CREATE OR REPLACE FUNCTION public.donatello_wa_read_status()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
SELECT jsonb_build_object(
 'connected', c.phone_number_id IS NOT NULL,
 'bot_enabled', c.bot_enabled,
 'display_phone', c.display_phone,
 'phone_number_id', c.phone_number_id,
 'waba_id', c.waba_id,
 'webhook_subscribed', c.webhook_subscribed,
 'token_expires_at', c.token_expires_at,
 'connected_at', c.connected_at,
 'contacts_total', (SELECT count(*) FROM donatello_internal.wa_contacts),
 'human_contacts', (SELECT count(*) FROM donatello_internal.wa_contacts WHERE human_takeover),
 'messages_handled', (SELECT count(*) FROM donatello_internal.wa_receipts WHERE status='sent')
) FROM donatello_internal.wa_connection c WHERE c.id = 1;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_store_connection(
 p_waba text, p_phone_id text, p_display text, p_name text,
 p_token text, p_token_expiry timestamptz, p_webhook_ok boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE sid uuid;
BEGIN
  IF p_waba !~ '^[0-9]{6,30}$' OR p_phone_id !~ '^[0-9]{6,30}$'
    OR regexp_replace(coalesce(p_display,''), '\D','','g') NOT IN ('528999122313','5218999122313')
    OR length(p_token) < 30 OR NOT p_webhook_ok
  THEN RAISE EXCEPTION 'Meta connection does not match Donatello verified number'; END IF;

  SELECT token_secret_id INTO sid FROM donatello_internal.wa_connection WHERE id=1 FOR UPDATE;
  IF sid IS NULL THEN
    sid := vault.create_secret(p_token, 'donatello_whatsapp_access_token', 'Donatello commercial WhatsApp Cloud API');
  ELSE
    PERFORM vault.update_secret(sid, p_token);
  END IF;
  -- Change the connection only after the external Meta subscription succeeds.
  -- Disable responses on re-link to avoid unexpected activity.
  UPDATE donatello_internal.wa_connection SET
    waba_id=p_waba,phone_number_id=p_phone_id,display_phone=p_display,
    verified_name=left(coalesce(p_name,''),100),token_secret_id=sid,
    token_expires_at=p_token_expiry, webhook_subscribed=p_webhook_ok,
    bot_enabled=false,connected_at=now(),updated_at=now() WHERE id=1;
END;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_access()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT jsonb_build_object(
  'token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=c.token_secret_id),
  'waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'display_phone',c.display_phone,
  'bot_enabled',c.bot_enabled,'token_expires_at',c.token_expires_at,
  'webhook_subscribed',c.webhook_subscribed
 )
 FROM donatello_internal.wa_connection c WHERE c.id=1;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_set_bot_enabled(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  IF p_enabled THEN
    UPDATE donatello_internal.wa_connection
      SET bot_enabled=true,updated_at=now()
    WHERE id=1 AND token_secret_id IS NOT NULL AND webhook_subscribed
      AND waba_id IS NOT NULL AND phone_number_id IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at>now()+interval '1 day');
  ELSE
    UPDATE donatello_internal.wa_connection SET bot_enabled=false,updated_at=now() WHERE id=1;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n=1;
END;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_receive(
  p_message_id text,p_phone_id text,p_waba text,p_from text,p_human boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE bot_on boolean; inserted integer; human_now boolean;
BEGIN
  IF p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 16 AND 256
      OR p_phone_id !~ '^[0-9]+$' OR p_waba !~ '^[0-9]+$'
      OR p_from !~ '^[0-9]{8,16}$'
  THEN RETURN jsonb_build_object('accepted',false,'reason','invalid'); END IF;
  PERFORM 1 FROM donatello_internal.wa_connection
    WHERE id=1 AND phone_number_id=p_phone_id AND waba_id=p_waba;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'reason','wrong_connection'); END IF;
  INSERT INTO donatello_internal.wa_contacts(phone,last_inbound_at,updated_at)
    VALUES(p_from,now(),now())
    ON CONFLICT(phone) DO UPDATE SET last_inbound_at=now(),updated_at=now();
  IF p_human THEN
    UPDATE donatello_internal.wa_contacts
     SET human_takeover=true,last_human_at=now(),updated_at=now() WHERE phone=p_from;
    RETURN jsonb_build_object('accepted',false,'reason','human_echo');
  END IF;
  INSERT INTO donatello_internal.wa_receipts(provider_message_id,phone_number_id,from_phone,status)
   VALUES(p_message_id,p_phone_id,p_from,'attempted')
   ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN jsonb_build_object('accepted',false,'reason','duplicate'); END IF;
  SELECT bot_enabled INTO bot_on FROM donatello_internal.wa_connection WHERE id=1;
  SELECT human_takeover INTO human_now FROM donatello_internal.wa_contacts WHERE phone=p_from;
  IF NOT bot_on OR human_now THEN
    UPDATE donatello_internal.wa_receipts SET status=CASE WHEN human_now THEN 'manual' ELSE 'paused' END,
    finished_at=now() WHERE provider_message_id=p_message_id;
    RETURN jsonb_build_object('accepted',false,'reason',CASE WHEN human_now THEN 'human_takeover' ELSE 'bot_off' END);
  END IF;
  RETURN jsonb_build_object('accepted',true,'reason','claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_can_send(
  p_message_id text,p_phone_id text,p_from text
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT exists(
 SELECT 1 FROM donatello_internal.wa_receipts r
 JOIN donatello_internal.wa_connection c ON c.phone_number_id=r.phone_number_id AND c.id=1
 JOIN donatello_internal.wa_contacts h ON h.phone=r.from_phone
 WHERE r.provider_message_id=p_message_id AND r.phone_number_id=p_phone_id
   AND r.from_phone=p_from AND r.status='attempted'
   AND c.bot_enabled AND NOT h.human_takeover
 );
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_finish(p_message_id text,p_status text,p_outbound_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF p_status NOT IN ('sent','uncertain','paused','manual') THEN
   RAISE EXCEPTION 'invalid status';
 END IF;
 UPDATE donatello_internal.wa_receipts
 SET status=p_status, outbound_message_id=left(p_outbound_id,256), finished_at=now()
 WHERE provider_message_id=p_message_id AND status='attempted';
END;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_contacts_read()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'phone', phone,'human_takeover',human_takeover,'last_inbound_at',last_inbound_at
 ) ORDER BY last_inbound_at DESC),'[]'::jsonb)
 FROM (SELECT phone,human_takeover,last_inbound_at FROM donatello_internal.wa_contacts
    ORDER BY last_inbound_at DESC LIMIT 30) t;
$$;

CREATE OR REPLACE FUNCTION public.donatello_wa_contact_handoff(p_phone text,p_human boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
 UPDATE donatello_internal.wa_contacts
 SET human_takeover=p_human,
     last_human_at=CASE WHEN p_human THEN now() ELSE last_human_at END,
     updated_at=now()
 WHERE phone=p_phone;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n=1;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
 'donatello_wa_read_status()',
 'donatello_wa_store_connection(text,text,text,text,text,timestamp with time zone,boolean)',
 'donatello_wa_access()',
 'donatello_wa_set_bot_enabled(boolean)',
 'donatello_wa_receive(text,text,text,text,boolean)',
 'donatello_wa_can_send(text,text,text)',
 'donatello_wa_finish(text,text,text)',
 'donatello_wa_contacts_read()',
 'donatello_wa_contact_handoff(text,boolean)'
 ] LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION public.'||fn||' FROM PUBLIC, anon, authenticated';
   EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fn||' TO service_role';
 END LOOP;
END $$;
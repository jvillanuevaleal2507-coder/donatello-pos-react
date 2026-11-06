-- PostgreSQL desechable: simula solo las interfaces necesarias.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $auth$
  SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$auth$;

CREATE TABLE public.pos_authorized_users (
  user_id uuid PRIMARY KEY, role text NOT NULL, active boolean NOT NULL
);
INSERT INTO public.pos_authorized_users(user_id,role,active)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);

CREATE TABLE public.test_movements (
  id bigserial PRIMARY KEY,
  user_id uuid,
  mode text NOT NULL
);
GRANT SELECT ON public.test_movements TO authenticated;

-- Fixture: imita el RPC de cobro transaccional, sin dinero ni inventario real.
CREATE FUNCTION public.donatello_checkout(
  p_mode text, p_items jsonb, p_discount_percent numeric,
  p_received numeric, p_customer_name text, p_customer_phone text,
  p_deposit numeric, p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fixture$
DECLARE
  v_id bigint;
BEGIN
  IF p_mode = 'failure' THEN
    RAISE EXCEPTION 'Simulated checkout failure';
  END IF;
  -- Produce carreras reales entre solicitudes simultáneas del mismo UUID.
  PERFORM pg_catalog.pg_sleep(0.4);
  INSERT INTO public.test_movements(user_id,mode)
    VALUES (auth.uid(),p_mode)
    RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object(
    'id',v_id,'type',p_mode,'total',10,
    'sale_items','[]'::jsonb
  );
END;
$fixture$;

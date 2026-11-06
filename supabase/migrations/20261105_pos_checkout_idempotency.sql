-- ATLAS / Ventas Donatello
-- PREPARADA PARA PRUEBAS AISLADAS: NO ejecutar en producción antes de validar
-- idempotencia concurrente, autorización, recibos y pérdida de conexión.

-- La tabla privada no se publica por PostgREST y niega accesos de cliente.
CREATE TABLE private.pos_checkout_requests (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'completed',
  request_hash text,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id),
  CONSTRAINT checkout_valid_state CHECK (state IN ('completed','cancelled')),
  CONSTRAINT checkout_valid_payload CHECK (
    (state='completed' AND request_hash ~ '^[0-9a-f]{64}$' AND receipt IS NOT NULL)
    OR (state='cancelled' AND request_hash IS NULL AND receipt IS NULL)
  )
);
ALTER TABLE private.pos_checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.pos_checkout_requests FROM PUBLIC, anon, authenticated;

-- Un mismo UUID de cobro solo puede producir una operación confirmada.
-- SECURITY DEFINER es necesario para guardar/comprobar el registro privado.
-- Autorización explícita a admin activo; la operación de venta revalida precio,
-- inventario y monto recibido en public.donatello_checkout.
CREATE FUNCTION public.donatello_checkout_once(
  p_operation_id uuid,
  p_mode text,
  p_items jsonb,
  p_discount_percent numeric DEFAULT 0,
  p_received numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_deposit numeric DEFAULT 0,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_request_hash text;
  v_old_hash text;
  v_old_state text;
  v_receipt jsonb;
  v_canonical jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id = v_user AND active IS TRUE AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador de cobro inválido' USING ERRCODE = '22023';
  END IF;

  -- JSONB representa canónicamente el objeto completo de la solicitud.
  -- No guardar PII de solicitud: solo hash y el comprobante autorizado.
  v_canonical := pg_catalog.jsonb_build_object(
    'mode', p_mode, 'items', p_items,
    'discount', p_discount_percent, 'received', p_received,
    'customer_name', p_customer_name, 'customer_phone', p_customer_phone,
    'deposit', p_deposit, 'due_date', p_due_date
  );
  v_request_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_canonical::text,'UTF8')), 'hex'
  );

  -- Bloqueo transaccional por usuario+operación: la segunda petición espera
  -- el COMMIT/ROLLBACK de la primera antes de revisar el comprobante.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_operation_id::text,0::bigint)
  );

  SELECT state,request_hash,receipt
  INTO v_old_state,v_old_hash,v_receipt
  FROM private.pos_checkout_requests
  WHERE user_id = v_user AND operation_id = p_operation_id;

  IF FOUND THEN
    IF v_old_state='cancelled' THEN
      RAISE EXCEPTION 'La operación fue cancelada; no puede cobrarse'
        USING ERRCODE = '22023';
    END IF;
    IF v_old_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Identificador ya utilizado con datos diferentes'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt;
  END IF;

  v_receipt := public.donatello_checkout(
    p_mode, p_items, p_discount_percent, p_received,
    p_customer_name, p_customer_phone, p_deposit, p_due_date
  );

  INSERT INTO private.pos_checkout_requests
    (user_id,operation_id,state,request_hash,receipt)
  VALUES (v_user,p_operation_id,'completed',v_request_hash,v_receipt);

  RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.donatello_checkout_once(
  uuid,text,jsonb,numeric,numeric,text,text,numeric,date
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_checkout_once(
  uuid,text,jsonb,numeric,numeric,text,text,numeric,date
) TO authenticated;

-- Una consulta NULL NO demuestra que una solicitud atrasada no llegue después.
-- Para reintentar, primero hay que cancelar ese UUID desde el servidor.
CREATE FUNCTION public.donatello_checkout_status(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_receipt jsonb;
  v_state text;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id = v_user AND active IS TRUE AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador de cobro inválido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_checkout_requests
  WHERE user_id = v_user AND operation_id = p_operation_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_state='cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.donatello_checkout_status(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_checkout_status(uuid)
  TO authenticated;

-- El UUID cancelado impide un cobro retrasado. Si el cobro se confirmó
-- previamente, devuelve el comprobante original (no revierte la venta).
CREATE FUNCTION public.donatello_checkout_cancel(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_state text;
  v_receipt jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador de cobro inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_checkout_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_state='completed' THEN RETURN v_receipt; END IF;
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  INSERT INTO private.pos_checkout_requests
    (user_id,operation_id,state,request_hash,receipt)
  VALUES (v_user,p_operation_id,'cancelled',NULL,NULL);
  RETURN pg_catalog.jsonb_build_object('state','cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.donatello_checkout_cancel(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_checkout_cancel(uuid)
  TO authenticated;

COMMENT ON TABLE private.pos_checkout_requests IS
  'ATLAS private receipts and permanent cancelled UUID tombstones. Do not purge until a verified retention/reconciliation policy exists.';

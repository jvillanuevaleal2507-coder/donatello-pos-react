-- ATLAS / Donatello POS / apartados: transacciones e idempotencia.
-- SOLO rama de prueba: no aplicar a producción antes de aprobar validación.
-- Independiente de la migración de checkout inicial (#16).
CREATE TABLE private.pos_layaway_payment_requests (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL,
  layaway_id bigint,
  amount numeric,
  expected_balance numeric,
  payment_id bigint REFERENCES public.layaway_payments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,operation_id),
  CONSTRAINT layaway_payment_request_state CHECK (
    (state='completed' AND layaway_id IS NOT NULL AND amount > 0
      AND expected_balance >= 0 AND payment_id IS NOT NULL)
    OR (state='cancelled' AND layaway_id IS NULL AND amount IS NULL
      AND expected_balance IS NULL AND payment_id IS NULL)
  )
);
ALTER TABLE private.pos_layaway_payment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.pos_layaway_payment_requests FROM PUBLIC,anon,authenticated;

-- Comprobante reconstituido del historial ORIGINAL. El ledger no duplica PII.
CREATE FUNCTION private.pos_layaway_payment_receipt(p_payment_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $receipt$
 SELECT pg_catalog.jsonb_build_object(
   'id',p.layaway_id,
   'payment_id',p.id,
   'type',CASE WHEN p.payment_type='liquidation' THEN 'liquidation' ELSE 'payment' END,
   'payment_date',p.created_at,
   'customer_name',p.customer_name,
   'customer_phone',p.customer_phone,
   'total',p.total,
   'previous_deposit',p.previous_deposit,
   'payment_amount',p.payment_amount,
   'total_deposit',p.new_deposit,
   'previous_balance',p.previous_balance,
   'balance',p.new_balance,
   'due_date',p.due_date,
   'items',COALESCE(p.items,'[]'::jsonb),
   'sale_id',p.sale_id
 )
 FROM public.layaway_payments p
 WHERE p.id=p_payment_id;
$receipt$;
REVOKE ALL ON FUNCTION private.pos_layaway_payment_receipt(bigint)
  FROM PUBLIC,anon,authenticated;

-- Al repetir el mismo UUID, retorna el recibo anterior (sin volver a cobrar).
-- Bloqueo de apartado evita abonos simultáneos que usen el mismo saldo inicial.
CREATE FUNCTION public.donatello_layaway_payment_once(
  p_operation_id uuid, p_layaway_id bigint,
  p_amount numeric, p_expected_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $payment$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_state text;
  v_old_layaway_id bigint;
  v_old_amount numeric;
  v_old_expected numeric;
  v_payment_id bigint;
  v_sale_id bigint := NULL;
  v_layaway public.layaways%ROWTYPE;
  v_new_balance numeric;
  v_new_deposit numeric;
  v_payment_type text;
  v_items jsonb;
  v_item jsonb;
  v_profit numeric := 0;
  v_count integer := 0;
  v_receipt jsonb;
  v_rows integer;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores POS pueden registrar abonos'
      USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
     p_operation_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador de abono inválido' USING ERRCODE='22023';
  END IF;
  IF p_layaway_id IS NULL OR p_layaway_id <= 0 OR
     p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR
     p_amount <= 0 OR p_amount > 100000000 OR
     p_amount <> pg_catalog.round(p_amount,2) OR
     p_expected_balance IS NULL OR
     p_expected_balance::text IN ('NaN','Infinity','-Infinity') OR
     p_expected_balance < 0 OR p_expected_balance > 100000000 OR
     p_expected_balance <> pg_catalog.round(p_expected_balance,2) THEN
    RAISE EXCEPTION 'Monto, saldo o apartado inválido' USING ERRCODE='22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'donatello.layaway.payment:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,layaway_id,amount,expected_balance,payment_id
    INTO v_state,v_old_layaway_id,v_old_amount,v_old_expected,v_payment_id
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_state='cancelled' THEN
      RAISE EXCEPTION 'El intento fue cancelado y no puede cobrarse'
        USING ERRCODE='22023';
    END IF;
    IF v_old_layaway_id IS DISTINCT FROM p_layaway_id OR
       v_old_amount IS DISTINCT FROM p_amount OR
       v_old_expected IS DISTINCT FROM p_expected_balance THEN
      RAISE EXCEPTION 'Identificador reutilizado con datos diferentes'
        USING ERRCODE='22023';
    END IF;
    SELECT private.pos_layaway_payment_receipt(v_payment_id) INTO v_receipt;
    IF v_receipt IS NULL THEN
      RAISE EXCEPTION 'Falta comprobante de abono confirmado';
    END IF;
    RETURN v_receipt;
  END IF;

  SELECT * INTO v_layaway FROM public.layaways
  WHERE id=p_layaway_id FOR UPDATE;
  IF NOT FOUND OR lower(btrim(coalesce(v_layaway.status,''))) <> 'active' THEN
    RAISE EXCEPTION 'Apartado inexistente o ya liquidado';
  END IF;
  IF v_layaway.total IS NULL OR v_layaway.deposit IS NULL OR
     v_layaway.balance IS NULL OR v_layaway.balance <= 0 OR
     pg_catalog.abs(v_layaway.total-v_layaway.deposit-v_layaway.balance)>0.01 THEN
    RAISE EXCEPTION 'Los importes del apartado requieren revisión';
  END IF;
  IF p_expected_balance <> pg_catalog.round(v_layaway.balance,2) THEN
    RAISE EXCEPTION 'El saldo cambió. Actualiza el apartado antes de registrar el abono';
  END IF;
  IF p_amount > pg_catalog.round(v_layaway.balance,2) THEN
    RAISE EXCEPTION 'El abono no puede superar el saldo actual';
  END IF;
  v_new_balance := pg_catalog.round(v_layaway.balance-p_amount,2);
  v_new_deposit := pg_catalog.round(v_layaway.deposit+p_amount,2);
  v_payment_type := CASE WHEN v_new_balance=0 THEN 'liquidation' ELSE 'payment' END;

  IF v_payment_type='liquidation' THEN
    v_items := v_layaway.items;
    IF v_items IS NULL OR pg_catalog.jsonb_typeof(v_items)<>'array' OR
       pg_catalog.jsonb_array_length(v_items)=0 THEN
      RAISE EXCEPTION 'El apartado carece de detalle para venta final';
    END IF;
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_item)<>'object' OR
         (v_item->>'qty') IS NULL OR (v_item->>'qty')::integer<=0 THEN
        RAISE EXCEPTION 'Producto inválido en apartado';
      END IF;
      v_count := v_count+(v_item->>'qty')::integer;
      v_profit := v_profit+COALESCE((v_item->>'profit')::numeric,0);
    END LOOP;

    -- Las existencias se reservaron en el ALTA del apartado: no descontar de nuevo.
    INSERT INTO public.sales(
      total,profit,received,change_amount,items_count,
      subtotal_original,discount_percent,discount_amount,status,updated_at
    ) VALUES (
      v_layaway.total,v_profit,v_new_deposit,0,v_count,
      v_layaway.total,0,0,'completed',now()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) AS x(value)
    LOOP
      INSERT INTO public.sale_items(
        sale_id,product_id,code,name,qty,cost,price,subtotal,profit
      ) VALUES (
        v_sale_id,NULLIF(v_item->>'product_id','')::bigint,
        v_item->>'code',v_item->>'name',(v_item->>'qty')::integer,
        COALESCE((v_item->>'cost')::numeric,0),
        COALESCE((v_item->>'price')::numeric,0),
        COALESCE((v_item->>'subtotal')::numeric,0),
        COALESCE((v_item->>'profit')::numeric,0)
      );
    END LOOP;
  END IF;

  UPDATE public.layaways
  SET deposit=v_new_deposit,balance=v_new_balance,
      status=CASE WHEN v_new_balance=0 THEN 'paid' ELSE 'active' END,
      notes=CASE WHEN v_new_balance=0
        THEN 'Apartado liquidado y registrado como venta #'||v_sale_id
        ELSE notes END
  WHERE id=p_layaway_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'No se pudo actualizar apartado'; END IF;

  INSERT INTO public.layaway_payments(
    layaway_id,payment_amount,previous_balance,new_balance,
    previous_deposit,new_deposit,payment_type,sale_id,customer_name,
    customer_phone,total,due_date,items
  ) VALUES (
    p_layaway_id,p_amount,v_layaway.balance,v_new_balance,
    v_layaway.deposit,v_new_deposit,v_payment_type,v_sale_id,
    v_layaway.customer_name,v_layaway.customer_phone,v_layaway.total,
    v_layaway.due_date,COALESCE(v_layaway.items,'[]'::jsonb)
  ) RETURNING id INTO v_payment_id;

  INSERT INTO private.pos_layaway_payment_requests(
    user_id,operation_id,state,layaway_id,amount,expected_balance,payment_id
  ) VALUES (
    v_user,p_operation_id,'completed',p_layaway_id,p_amount,p_expected_balance,v_payment_id
  );
  SELECT private.pos_layaway_payment_receipt(v_payment_id) INTO v_receipt;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'Comprobante no disponible'; END IF;
  RETURN v_receipt;
END;
$payment$;

REVOKE ALL ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric,numeric)
  TO authenticated;

-- NULL = todavía no consta operación, NO garantiza ausencia de petición tardía.
CREATE FUNCTION public.donatello_layaway_payment_status(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $status$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_state text;
  v_payment_id bigint;
  v_receipt jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
     p_operation_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'donatello.layaway.payment:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,payment_id INTO v_state,v_payment_id
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_state='cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  SELECT private.pos_layaway_payment_receipt(v_payment_id) INTO v_receipt;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'Comprobante no disponible'; END IF;
  RETURN v_receipt;
END;
$status$;
REVOKE ALL ON FUNCTION public.donatello_layaway_payment_status(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_status(uuid)
  TO authenticated;

-- Cancelación terminal: si el pago existe devuelve su comprobante;
-- si no existe escribe una lápida para bloquear pagos retrasados.
CREATE FUNCTION public.donatello_layaway_payment_cancel(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $cancel$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_state text;
  v_payment_id bigint;
  v_receipt jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
     p_operation_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'donatello.layaway.payment:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,payment_id INTO v_state,v_payment_id
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_state='cancelled' THEN
      RETURN pg_catalog.jsonb_build_object('state','cancelled');
    END IF;
    SELECT private.pos_layaway_payment_receipt(v_payment_id) INTO v_receipt;
    IF v_receipt IS NULL THEN RAISE EXCEPTION 'Comprobante no disponible'; END IF;
    RETURN v_receipt;
  END IF;
  INSERT INTO private.pos_layaway_payment_requests(
    user_id,operation_id,state,layaway_id,amount,expected_balance,payment_id
  ) VALUES(v_user,p_operation_id,'cancelled',NULL,NULL,NULL,NULL);
  RETURN pg_catalog.jsonb_build_object('state','cancelled');
END;
$cancel$;
REVOKE ALL ON FUNCTION public.donatello_layaway_payment_cancel(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_cancel(uuid)
  TO authenticated;

COMMENT ON TABLE private.pos_layaway_payment_requests IS
  'ATLAS: completed payments refer to immutable payment history. Cancelled UUID tombstones must not be purged without a safe retention policy.';

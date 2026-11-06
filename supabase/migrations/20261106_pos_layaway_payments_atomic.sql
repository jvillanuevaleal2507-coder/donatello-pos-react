-- ATLAS Donatello. SOLO EN RAMA DE PRUEBAS: no aplicar en producción.
-- Movimientos de apartados atómicos, idempotentes y conciliables.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.pos_layaway_payment_requests (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL,
  request_hash text,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,operation_id),
  CONSTRAINT layaway_request_state CHECK (state IN ('completed','cancelled')),
  CONSTRAINT layaway_request_payload CHECK (
    (state='completed' AND request_hash ~ '^[0-9a-f]{64}$' AND receipt IS NOT NULL)
    OR (state='cancelled' AND request_hash IS NULL AND receipt IS NULL)
  )
);
ALTER TABLE private.pos_layaway_payment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.pos_layaway_payment_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.donatello_layaway_pay_once(
  p_operation_id uuid, p_layaway_id bigint, p_amount numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_request_hash text;
  v_old_hash text;
  v_old_state text;
  v_receipt jsonb;
  v_layaway public.layaways%ROWTYPE;
  v_balance numeric;
  v_deposit numeric;
  v_sale_id bigint;
  v_payment_id bigint;
  v_payment_date timestamptz;
  v_type text;
  v_items_count integer := 0;
  v_subtotal numeric := 0;
  v_cost numeric := 0;
  v_discount numeric := 0;
  v_item jsonb;
  v_qty integer;
  v_price numeric;
  v_item_cost numeric;
  v_product_id bigint;
  v_line_total numeric;
  v_line_profit numeric;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_layaway_id IS NULL OR p_layaway_id<=0
    OR p_amount IS NULL OR p_amount::text !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR p_amount<=0 OR p_amount>100000000
    OR p_amount<>round(p_amount,2)
  THEN
    RAISE EXCEPTION 'Identificador, apartado o importe inválido' USING ERRCODE='22023';
  END IF;
  v_request_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('layaway_id',p_layaway_id,
      'amount_cents',(p_amount*100)::bigint)::text,'UTF8')),'hex');

  -- Serializa los reintentos del mismo UUID y las cancelaciones tardías.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,request_hash,receipt INTO v_old_state,v_old_hash,v_receipt
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_old_state='cancelled' THEN
      RAISE EXCEPTION 'Intento cancelado: no puede cobrarse' USING ERRCODE='22023';
    END IF;
    IF v_old_hash<>v_request_hash THEN
      RAISE EXCEPTION 'Identificador utilizado con datos diferentes' USING ERRCODE='22023';
    END IF;
    RETURN v_receipt;
  END IF;

  -- SERIALIZA todos los movimientos (incluso distintos UUID) por apartado.
  SELECT * INTO v_layaway FROM public.layaways
  WHERE id=p_layaway_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apartado no encontrado' USING ERRCODE='22023';
  END IF;
  IF v_layaway.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Este apartado ya no está activo' USING ERRCODE='22023';
  END IF;
  IF v_layaway.total IS NULL OR v_layaway.deposit IS NULL OR v_layaway.balance IS NULL
    OR v_layaway.total<=0 OR v_layaway.deposit<0 OR v_layaway.balance<=0
    OR v_layaway.total<>round(v_layaway.total,2)
    OR v_layaway.deposit<>round(v_layaway.deposit,2)
    OR v_layaway.balance<>round(v_layaway.balance,2)
    OR round(v_layaway.deposit+v_layaway.balance,2)<>v_layaway.total
  THEN
    RAISE EXCEPTION 'Apartado con saldos inconsistentes: requiere conciliación' USING ERRCODE='22023';
  END IF;
  IF p_amount>v_layaway.balance THEN
    RAISE EXCEPTION 'El pago supera el saldo actualizado del apartado' USING ERRCODE='22023';
  END IF;

  v_deposit := round(v_layaway.deposit+p_amount,2);
  v_balance := round(v_layaway.balance-p_amount,2);
  v_type := CASE WHEN v_balance=0 THEN 'liquidation' ELSE 'payment' END;

  IF v_type='liquidation' THEN
    IF v_layaway.items IS NULL OR pg_catalog.jsonb_typeof(v_layaway.items)<>'array'
      OR pg_catalog.jsonb_array_length(v_layaway.items) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Detalle de apartado inválido' USING ERRCODE='22023';
    END IF;
    -- Las líneas salen SOLO del apartado persistido; nunca del navegador.
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_layaway.items) AS x(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_item)<>'object'
        OR coalesce(v_item->>'qty','') !~ '^[1-9][0-9]*$'
        OR coalesce(v_item->>'price','') !~ '^[0-9]+(\.[0-9]+)?$'
        OR coalesce(v_item->>'cost','') !~ '^[0-9]+(\.[0-9]+)?$'
      THEN
        RAISE EXCEPTION 'Producto con importes o cantidad inválidos' USING ERRCODE='22023';
      END IF;
      v_qty := (v_item->>'qty')::integer;
      v_price := (v_item->>'price')::numeric;
      v_item_cost := (v_item->>'cost')::numeric;
      IF v_qty>1000 OR v_price>100000000 OR v_item_cost>100000000
        OR v_price<>round(v_price,2) OR v_item_cost<>round(v_item_cost,2)
      THEN
        RAISE EXCEPTION 'Detalle fuera de límites contables' USING ERRCODE='22023';
      END IF;
      v_subtotal := v_subtotal+round(v_price*v_qty,2);
      v_cost := v_cost+round(v_item_cost*v_qty,2);
      v_items_count := v_items_count+v_qty;
    END LOOP;
    v_discount := round(v_subtotal-v_layaway.total,2);
    IF v_subtotal<=0 OR v_discount<0 THEN
      RAISE EXCEPTION 'Detalle y total no concuerdan' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.sales(
      total,profit,received,change_amount,items_count,
      subtotal_original,discount_percent,discount_amount,status,updated_at
    ) VALUES (
      v_layaway.total,round(v_layaway.total-v_cost,2),v_deposit,0,v_items_count,
      v_subtotal,round(v_discount*100/v_subtotal,6),v_discount,'completed',now()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_layaway.items) AS x(value)
    LOOP
      v_qty := (v_item->>'qty')::integer;
      v_price := (v_item->>'price')::numeric;
      v_item_cost := (v_item->>'cost')::numeric;
      v_line_total := round(v_price*v_qty,2);
      v_line_profit := round((v_price-v_item_cost)*v_qty,2);
      IF coalesce(v_item->>'product_id','')~'^[1-9][0-9]*$' THEN
        v_product_id := (v_item->>'product_id')::bigint;
      ELSE v_product_id := NULL;
      END IF;
      INSERT INTO public.sale_items(
        sale_id,product_id,code,name,qty,cost,price,subtotal,profit
      ) VALUES (
        v_sale_id,v_product_id,v_item->>'code',v_item->>'name',v_qty,
        v_item_cost,v_price,v_line_total,v_line_profit
      );
    END LOOP;
  END IF;

  UPDATE public.layaways SET
    deposit=v_deposit,balance=v_balance,
    status=CASE WHEN v_type='liquidation' THEN 'paid' ELSE 'active' END,
    notes=CASE WHEN v_type='liquidation'
      THEN 'Apartado liquidado y registrado como venta #'||v_sale_id::text
      ELSE notes END
  WHERE id=v_layaway.id;

  -- Si falla esta inserción, se revierten también venta, detalle y apartado.
  INSERT INTO public.layaway_payments(
    layaway_id,payment_amount,previous_balance,new_balance,
    previous_deposit,new_deposit,payment_type,sale_id,
    customer_name,customer_phone,total,due_date,items
  ) VALUES (
    v_layaway.id,p_amount,v_layaway.balance,v_balance,
    v_layaway.deposit,v_deposit,v_type,v_sale_id,
    v_layaway.customer_name,v_layaway.customer_phone,
    v_layaway.total,v_layaway.due_date,v_layaway.items
  ) RETURNING id,created_at INTO v_payment_id,v_payment_date;

  v_receipt := pg_catalog.jsonb_build_object(
    'id',v_layaway.id,'payment_id',v_payment_id,'payment_date',v_payment_date,
    'type',v_type,'customer_name',v_layaway.customer_name,
    'customer_phone',v_layaway.customer_phone,'total',v_layaway.total,
    'previous_deposit',v_layaway.deposit,'payment_amount',p_amount,
    'total_deposit',v_deposit,'previous_balance',v_layaway.balance,
    'balance',v_balance,'due_date',v_layaway.due_date,
    'items',v_layaway.items,'sale_id',v_sale_id
  );
  INSERT INTO private.pos_layaway_payment_requests(
    user_id,operation_id,state,request_hash,receipt
  ) VALUES (v_user,p_operation_id,'completed',v_request_hash,v_receipt);
  RETURN v_receipt;
END;
$fn$;

REVOKE ALL ON FUNCTION public.donatello_layaway_pay_once(uuid,bigint,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_pay_once(uuid,bigint,numeric)
  TO authenticated;

CREATE FUNCTION public.donatello_layaway_pay_status(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
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
    RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_state='cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  RETURN v_receipt;
END;
$fn$;
REVOKE ALL ON FUNCTION public.donatello_layaway_pay_status(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_pay_status(uuid) TO authenticated;

CREATE FUNCTION public.donatello_layaway_pay_cancel(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
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
    RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_user::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_layaway_payment_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_state='completed' THEN RETURN v_receipt; END IF;
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  INSERT INTO private.pos_layaway_payment_requests (
    user_id,operation_id,state,request_hash,receipt
  ) VALUES (v_user,p_operation_id,'cancelled',NULL,NULL);
  RETURN pg_catalog.jsonb_build_object('state','cancelled');
END;
$fn$;
REVOKE ALL ON FUNCTION public.donatello_layaway_pay_cancel(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_pay_cancel(uuid) TO authenticated;

COMMENT ON TABLE private.pos_layaway_payment_requests IS
  'ATLAS: recibos privados y UUID cancelados permanentes; no purgar sin política de reconciliación.';

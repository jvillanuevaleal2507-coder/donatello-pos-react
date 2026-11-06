-- ATLAS Donatello: DRAFT ONLY; not deployed. Test in disposable PostgreSQL.
-- Payment amount, balance and liquidation are determined under a row lock.
-- Inventory is NOT deducted on liquidation: it was reserved at layaway creation.
CREATE TABLE private.pos_layaway_attempts (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('completed','cancelled')),
  layaway_id bigint,
  amount numeric,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,operation_id),
  CONSTRAINT attempt_consistency CHECK (
    (state='cancelled' AND layaway_id IS NULL AND amount IS NULL AND receipt IS NULL)
    OR (state='completed' AND layaway_id IS NOT NULL AND amount>0 AND receipt IS NOT NULL)
  )
);
REVOKE ALL ON private.pos_layaway_attempts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.donatello_layaway_payment_once(
  p_operation_id uuid,p_layaway_id bigint,p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_old private.pos_layaway_attempts%ROWTYPE;
  v_l public.layaways%ROWTYPE;
  v_new_balance numeric;
  v_new_deposit numeric;
  v_sale_id bigint;
  v_payment_id bigint;
  v_payment_date timestamptz;
  v_type text;
  v_items jsonb;
  v_item jsonb;
  v_profit numeric := 0;
  v_qty integer := 0;
  v_receipt jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_uid AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_layaway_id IS NULL OR p_layaway_id<=0
    OR p_amount IS NULL OR p_amount<=0 OR p_amount<>pg_catalog.round(p_amount,2)
  THEN
    RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_uid::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT * INTO v_old FROM private.pos_layaway_attempts
  WHERE user_id=v_uid AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_old.state='cancelled' THEN
      RAISE EXCEPTION 'Intento cancelado' USING ERRCODE='22023';
    END IF;
    IF v_old.layaway_id IS DISTINCT FROM p_layaway_id
      OR v_old.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'UUID reutilizado con otro importe' USING ERRCODE='22023';
    END IF;
    RETURN v_old.receipt;
  END IF;

  SELECT * INTO v_l FROM public.layaways WHERE id=p_layaway_id FOR UPDATE;
  IF NOT FOUND OR v_l.status IS DISTINCT FROM 'active'
    OR v_l.balance IS NULL OR v_l.balance<=0
    OR v_l.deposit IS NULL OR v_l.deposit<0
    OR v_l.total IS NULL OR v_l.total<=0
    OR pg_catalog.abs(v_l.total-v_l.deposit-v_l.balance)>0.01
    OR p_amount>v_l.balance THEN
    RAISE EXCEPTION 'Apartado no activo, inconsistente o pago excesivo' USING ERRCODE='22023';
  END IF;

  v_new_balance:=pg_catalog.round(v_l.balance-p_amount,2);
  v_new_deposit:=pg_catalog.round(v_l.deposit+p_amount,2);
  v_type:=CASE WHEN v_new_balance=0 THEN 'liquidation' ELSE 'payment' END;
  v_items:=v_l.items;
  IF v_items IS NULL OR pg_catalog.jsonb_typeof(v_items)<>'array'
    OR pg_catalog.jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'Detalle de apartado inválido' USING ERRCODE='22023';
  END IF;

  IF v_type='liquidation' THEN
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) a(value) LOOP
      IF pg_catalog.jsonb_typeof(v_item)<>'object'
        OR coalesce(v_item->>'qty','') !~ '^[1-9][0-9]*$'
        OR coalesce(v_item->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$'
        OR coalesce(v_item->>'cost','') !~ '^[0-9]+([.][0-9]{1,2})?$'
        OR coalesce(v_item->>'subtotal','') !~ '^[0-9]+([.][0-9]{1,2})?$'
        OR coalesce(v_item->>'profit','') !~ '^[-]?[0-9]+([.][0-9]{1,2})?$'
      THEN
        RAISE EXCEPTION 'Detalle de venta inválido' USING ERRCODE='22023';
      END IF;
      v_qty:=v_qty+(v_item->>'qty')::integer;
      v_profit:=v_profit+(v_item->>'profit')::numeric;
    END LOOP;
    INSERT INTO public.sales(
      total,profit,received,change_amount,items_count,subtotal_original,
      discount_percent,discount_amount,status,updated_at
    ) VALUES (
      v_l.total,v_profit,v_new_deposit,0,v_qty,v_l.total,
      0,0,'completed',now()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) a(value) LOOP
      INSERT INTO public.sale_items(
        sale_id,product_id,code,name,qty,cost,price,subtotal,profit
      ) VALUES (
        v_sale_id,NULLIF(v_item->>'product_id','')::bigint,
        v_item->>'code',v_item->>'name',(v_item->>'qty')::integer,
        (v_item->>'cost')::numeric,(v_item->>'price')::numeric,
        (v_item->>'subtotal')::numeric,(v_item->>'profit')::numeric
      );
    END LOOP;
  END IF;

  UPDATE public.layaways SET
    balance=v_new_balance,deposit=v_new_deposit,
    status=CASE WHEN v_type='liquidation' THEN 'paid' ELSE 'active' END,
    notes=CASE WHEN v_type='liquidation'
      THEN 'Apartado liquidado y registrado como venta #'||v_sale_id::text
      ELSE notes END
  WHERE id=p_layaway_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apartado no actualizado' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.layaway_payments(
    layaway_id,payment_amount,previous_balance,new_balance,
    previous_deposit,new_deposit,payment_type,sale_id,customer_name,
    customer_phone,total,due_date,items
  ) VALUES (
    p_layaway_id,p_amount,v_l.balance,v_new_balance,
    v_l.deposit,v_new_deposit,v_type,v_sale_id,v_l.customer_name,
    v_l.customer_phone,v_l.total,v_l.due_date,v_items
  ) RETURNING id,created_at INTO v_payment_id,v_payment_date;

  v_receipt:=pg_catalog.jsonb_build_object(
    'id',p_layaway_id,'payment_id',v_payment_id,'type',v_type,
    'payment_date',v_payment_date,'customer_name',v_l.customer_name,
    'customer_phone',v_l.customer_phone,'total',v_l.total,
    'previous_deposit',v_l.deposit,'payment_amount',p_amount,
    'total_deposit',v_new_deposit,'previous_balance',v_l.balance,
    'balance',v_new_balance,'due_date',v_l.due_date,'items',v_items,
    'sale_id',v_sale_id
  );
  INSERT INTO private.pos_layaway_attempts(
    user_id,operation_id,state,layaway_id,amount,receipt
  ) VALUES (v_uid,p_operation_id,'completed',p_layaway_id,p_amount,v_receipt);
  RETURN v_receipt;
END;
$fn$;

CREATE FUNCTION public.donatello_layaway_payment_status(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_uid uuid:=(SELECT auth.uid());
  v_state text;
  v_receipt jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_uid AND active IS TRUE AND role='admin'
  ) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'UUID requerido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_uid::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_layaway_attempts
  WHERE user_id=v_uid AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_state='cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  RETURN v_receipt;
END;
$fn$;

CREATE FUNCTION public.donatello_layaway_payment_cancel(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_uid uuid:=(SELECT auth.uid());
  v_state text;
  v_receipt jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_uid AND active IS TRUE AND role='admin'
  ) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'UUID requerido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('layaway:'||v_uid::text||':'||p_operation_id::text,0::bigint)
  );
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_layaway_attempts
  WHERE user_id=v_uid AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_state='completed' THEN RETURN v_receipt; END IF;
    RETURN pg_catalog.jsonb_build_object('state','cancelled');
  END IF;
  INSERT INTO private.pos_layaway_attempts(user_id,operation_id,state)
  VALUES(v_uid,p_operation_id,'cancelled');
  RETURN pg_catalog.jsonb_build_object('state','cancelled');
END;
$fn$;

REVOKE ALL ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.donatello_layaway_payment_status(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.donatello_layaway_payment_cancel(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_status(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_cancel(uuid)
  TO authenticated;

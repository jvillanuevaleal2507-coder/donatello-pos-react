-- ATLAS: atomic settlement of Donatello layaways.
-- Stacked on PR #16 checkout ledger; staged only, never apply to production.
-- Assumes private.pos_checkout_requests and its status/cancel RPCs exist.
CREATE FUNCTION public.donatello_layaway_payment_once(
  p_operation_id uuid, p_layaway_id bigint, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_hash text;
  v_existing private.pos_checkout_requests%ROWTYPE;
  v_lay public.layaways%ROWTYPE;
  v_new_balance numeric; v_new_deposit numeric; v_type text;
  v_items jsonb; v_item jsonb;
  v_sale_id bigint; v_payment_id bigint; v_payment_at timestamptz;
  v_items_count integer := 0; v_profit numeric := 0; v_receipt jsonb;
  v_subtotal numeric := 0; v_cost numeric := 0; v_discount numeric := 0;
  v_line_subtotal numeric; v_line_cost numeric; v_line_discount numeric;
  v_discount_allocated numeric := 0; v_item_idx integer := 0;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id = v_user AND active IS TRUE AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
    p_operation_id = '00000000-0000-0000-0000-000000000000'::uuid OR
    p_layaway_id IS NULL OR p_layaway_id <= 0 OR
    p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000 OR
    p_amount <> round(p_amount,2) THEN
    RAISE EXCEPTION 'Abono invalido' USING ERRCODE='22023';
  END IF;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','layaway_payment', 'layaway_id',p_layaway_id,'amount',p_amount
    )::text,'UTF8'
  )),'hex');

  -- Exact same UUID mutex used by checkout_once and checkout_cancel.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_operation_id::text,0::bigint)
  );
  SELECT * INTO v_existing FROM private.pos_checkout_requests
    WHERE user_id=v_user AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_existing.state='cancelled' THEN
      RAISE EXCEPTION 'Intento cancelado' USING ERRCODE='22023';
    END IF;
    IF v_existing.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'UUID reutilizado con otros datos' USING ERRCODE='22023';
    END IF;
    RETURN v_existing.receipt;
  END IF;

  -- Unique row lock serializes competing payments, even with different UUIDs.
  SELECT * INTO v_lay FROM public.layaways WHERE id=p_layaway_id FOR UPDATE;
  IF NOT FOUND OR v_lay.status IS DISTINCT FROM 'active'
    OR v_lay.balance IS NULL OR v_lay.balance <= 0 THEN
    RAISE EXCEPTION 'Apartado no activo' USING ERRCODE='22023';
  END IF;
  IF p_amount > v_lay.balance OR v_lay.deposit IS NULL
     OR v_lay.total IS NULL OR abs(v_lay.total-v_lay.deposit-v_lay.balance)>0.01 THEN
    RAISE EXCEPTION 'Monto o saldo inconsistente' USING ERRCODE='22023';
  END IF;
  v_items := v_lay.items;
  IF pg_catalog.jsonb_typeof(v_items) <> 'array'
    OR pg_catalog.jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'Detalle de apartado invalido' USING ERRCODE='22023';
  END IF;

  v_new_balance := round(v_lay.balance-p_amount,2);
  v_new_deposit := round(v_lay.deposit+p_amount,2);
  v_type := CASE WHEN v_new_balance=0 THEN 'liquidation' ELSE 'payment' END;

  -- Stock was already reserved during the original layaway. Do not touch it.
  IF v_type='liquidation' THEN
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) a(value) LOOP
      IF pg_catalog.jsonb_typeof(v_item)<>'object'
        OR coalesce(v_item->>'qty','') !~ '^[0-9]+$'
        OR (v_item->>'qty')::integer NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Cantidad invalida en apartado' USING ERRCODE='22023';
      END IF;
      v_items_count := v_items_count+(v_item->>'qty')::integer;
      v_line_subtotal := coalesce(
        (v_item->>'subtotal')::numeric,
        coalesce((v_item->>'price')::numeric,0)*(v_item->>'qty')::integer
      );
      v_line_cost := coalesce((v_item->>'cost')::numeric,0)*(v_item->>'qty')::integer;
      IF v_line_subtotal <= 0 OR v_line_cost < 0 THEN
        RAISE EXCEPTION 'Costo o subtotal invalido en apartado' USING ERRCODE='22023';
      END IF;
      v_subtotal := v_subtotal+round(v_line_subtotal,2);
      v_cost := v_cost+round(v_line_cost,2);
    END LOOP;

    -- La utilidad correcta de un apartado con descuento se calcula a partir
    -- del total acordado, no de 'item.profit' previo al descuento.
    IF v_subtotal < v_lay.total OR v_lay.total <= 0 THEN
      RAISE EXCEPTION 'Total de apartado supera el subtotal de articulos'
        USING ERRCODE='22023';
    END IF;
    v_discount := round(v_subtotal-v_lay.total,2);
    v_profit := round(v_lay.total-v_cost,2);

    INSERT INTO public.sales(
      total,profit,received,change_amount,items_count,subtotal_original,
      discount_percent,discount_amount,status,updated_at
    ) VALUES (
      v_lay.total,v_profit,v_new_deposit,0,v_items_count,v_subtotal,
      round(v_discount*100/v_subtotal,4),v_discount,'completed',now()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_items) a(value) LOOP
      v_item_idx := v_item_idx+1;
      v_line_subtotal := round(coalesce(
        (v_item->>'subtotal')::numeric,
        coalesce((v_item->>'price')::numeric,0)*(v_item->>'qty')::integer
      ),2);
      v_line_cost := round(coalesce((v_item->>'cost')::numeric,0)*(v_item->>'qty')::integer,2);
      -- Distribuir descuento entre partidas; la ultima absorbe redondeo.
      IF v_item_idx=pg_catalog.jsonb_array_length(v_items) THEN
        v_line_discount := v_discount-v_discount_allocated;
      ELSE
        v_line_discount := round(v_discount*v_line_subtotal/v_subtotal,2);
        v_discount_allocated := v_discount_allocated+v_line_discount;
      END IF;
      INSERT INTO public.sale_items(
        sale_id,product_id,code,name,qty,cost,price,subtotal,profit
      ) VALUES (
        v_sale_id,nullif(v_item->>'product_id','')::bigint,
        v_item->>'code',v_item->>'name',(v_item->>'qty')::integer,
        coalesce((v_item->>'cost')::numeric,0),
        coalesce((v_item->>'price')::numeric,0),
        v_line_subtotal,round(v_line_subtotal-v_line_cost-v_line_discount,2)
      );
    END LOOP;
  END IF;

  UPDATE public.layaways SET
    balance=v_new_balance,deposit=v_new_deposit,
    status=CASE WHEN v_new_balance=0 THEN 'paid' ELSE 'active' END,
    notes=CASE WHEN v_new_balance=0
      THEN 'Apartado liquidado y registrado como venta #'||v_sale_id::text
      ELSE notes END
  WHERE id=p_layaway_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se actualizo el apartado' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.layaway_payments(
    layaway_id,payment_amount,previous_balance,new_balance,
    previous_deposit,new_deposit,payment_type,sale_id,
    customer_name,customer_phone,total,due_date,items
  ) VALUES (
    p_layaway_id,p_amount,v_lay.balance,v_new_balance,
    v_lay.deposit,v_new_deposit,v_type,v_sale_id,
    v_lay.customer_name,v_lay.customer_phone,v_lay.total,v_lay.due_date,v_items
  ) RETURNING id,created_at INTO v_payment_id,v_payment_at;

  v_receipt := pg_catalog.jsonb_build_object(
    'id',p_layaway_id,'payment_id',v_payment_id,'type',v_type,
    'payment_date',v_payment_at,'customer_name',v_lay.customer_name,
    'customer_phone',v_lay.customer_phone,'total',v_lay.total,
    'previous_deposit',v_lay.deposit,'payment_amount',p_amount,
    'total_deposit',v_new_deposit,'previous_balance',v_lay.balance,
    'balance',v_new_balance,'due_date',v_lay.due_date,'items',v_items,
    'sale_id',v_sale_id
  );

  INSERT INTO private.pos_checkout_requests
    (user_id,operation_id,state,request_hash,receipt)
  VALUES (v_user,p_operation_id,'completed',v_hash,v_receipt);
  RETURN v_receipt;
END;
$body$;

REVOKE ALL ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_layaway_payment_once(uuid,bigint,numeric)
  TO authenticated;

-- Donatello: la venta/apartado y el descuento de existencias deben ser atómicos.
-- Función SECURITY INVOKER: respeta RLS y requiere usuario autorizado.
CREATE OR REPLACE FUNCTION public.donatello_checkout(
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
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_item jsonb;
  v_product record;
  v_product_id bigint;
  v_previous_id bigint := NULL;
  v_qty integer;
  v_count integer := 0;
  v_subtotal numeric := 0;
  v_cost numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_profit numeric;
  v_change numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_sale_id bigint;
  v_due_date date;
  v_recorded_at timestamptz := now();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id = v_user AND active = true
  ) THEN
    RAISE EXCEPTION 'Usuario sin autorización POS' USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('sale', 'layaway') THEN
    RAISE EXCEPTION 'Tipo de operación inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Carrito inválido (1 a 100 productos)';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent >= 100 THEN
    RAISE EXCEPTION 'Descuento fuera de rango';
  END IF;

  -- Bloquea las filas en el mismo orden: evita venta doble por carreras concurrentes.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items) AS a(value)
    ORDER BY (value->>'id')::bigint
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR coalesce(v_item->>'id','') !~ '^[0-9]+$'
      OR coalesce(v_item->>'qty','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Producto o cantidad inválida';
    END IF;
    v_product_id := (v_item->>'id')::bigint;
    v_qty := (v_item->>'qty')::integer;
    IF v_qty NOT BETWEEN 1 AND 1000 OR
       (v_previous_id IS NOT NULL AND v_previous_id = v_product_id) THEN
      RAISE EXCEPTION 'Cantidad o producto duplicado';
    END IF;
    v_previous_id := v_product_id;
    SELECT id,code,name,cost,price,stock INTO v_product
    FROM public.products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;
    IF coalesce(v_product.stock,0) < v_qty THEN
      RAISE EXCEPTION 'Existencia insuficiente: %', v_product.name;
    END IF;
    IF coalesce(v_item->>'expected_price','') = '' OR
       (v_item->>'expected_price')::numeric <> coalesce(v_product.price,0) THEN
      RAISE EXCEPTION 'El precio cambió. Actualiza el carrito y confirma nuevamente.';
    END IF;

    v_subtotal := v_subtotal + round(coalesce(v_product.price,0) * v_qty,2);
    v_cost := v_cost + round(coalesce(v_product.cost,0) * v_qty,2);
    v_count := v_count + v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'code',v_product.code,'name',v_product.name,
      'qty',v_qty,'cost',coalesce(v_product.cost,0),'price',coalesce(v_product.price,0),
      'subtotal',round(coalesce(v_product.price,0) * v_qty,2),
      'profit',round((coalesce(v_product.price,0)-coalesce(v_product.cost,0)) * v_qty,2)
    ));
  END LOOP;

  v_total := round(v_subtotal * (1-p_discount_percent/100),2);
  v_discount := v_subtotal - v_total;
  v_profit := v_subtotal - v_cost - v_discount;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El total debe ser mayor que cero';
  END IF;

  IF p_mode = 'sale' THEN
    IF p_received IS NULL OR p_received < v_total THEN
      RAISE EXCEPTION 'El monto recibido es insuficiente';
    END IF;
    v_change := round(p_received-v_total,2);
    INSERT INTO public.sales(
      total,profit,received,change_amount,items_count,
      subtotal_original,discount_percent,discount_amount,status,updated_at
    ) VALUES (
      v_total,v_profit,p_received,v_change,v_count,
      v_subtotal,p_discount_percent,v_discount,'completed',now()
    ) RETURNING id,sale_date INTO v_sale_id,v_recorded_at;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) AS a(value) LOOP
      INSERT INTO public.sale_items (
        sale_id,product_id,code,name,qty,cost,price,subtotal,profit
      ) VALUES (
        v_sale_id,(v_item->>'product_id')::bigint,v_item->>'code',v_item->>'name',
        (v_item->>'qty')::integer,(v_item->>'cost')::numeric,(v_item->>'price')::numeric,
        (v_item->>'subtotal')::numeric,(v_item->>'profit')::numeric
      );
    END LOOP;
  ELSE
    IF nullif(btrim(coalesce(p_customer_name,'')),'') IS NULL THEN
      RAISE EXCEPTION 'El nombre del cliente es obligatorio para un apartado';
    END IF;
    IF p_deposit IS NULL OR p_deposit <= 0 OR p_deposit > v_total THEN
      RAISE EXCEPTION 'Anticipo inválido';
    END IF;
    v_due_date := p_due_date;
    INSERT INTO public.layaways (
      customer_name,customer_phone,total,deposit,balance,due_date,status,items,notes
    ) VALUES (
      btrim(p_customer_name),nullif(btrim(coalesce(p_customer_phone,'')),''),
      v_total,p_deposit,round(v_total-p_deposit,2),v_due_date,'active',v_items,
      'El apartado se mantiene vigente hasta la fecha acordada. Posterior a ese plazo, el anticipo podrá utilizarse como saldo a favor en otra compra.'
    ) RETURNING id,created_at INTO v_sale_id,v_recorded_at;
  END IF;

  -- Si falla una sola actualización, Postgres revierte también venta y detalle.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) AS a(value) LOOP
    UPDATE public.products SET stock = coalesce(stock,0) - (v_item->>'qty')::integer
    WHERE id = (v_item->>'product_id')::bigint
      AND coalesce(stock,0) >= (v_item->>'qty')::integer;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No pudo descontarse el inventario; operación revertida';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'type', p_mode,
    'sale_date', v_recorded_at,
    'customer_name', CASE WHEN p_mode='layaway' THEN btrim(p_customer_name) ELSE NULL END,
    'customer_phone', CASE WHEN p_mode='layaway' THEN p_customer_phone ELSE NULL END,
    'subtotal_original', v_subtotal,
    'discount_percent', p_discount_percent,
    'discount_amount', v_discount,
    'total', v_total,
    'profit', v_profit,
    'received', CASE WHEN p_mode='sale' THEN p_received ELSE p_deposit END,
    'change_amount', v_change,
    'deposit', CASE WHEN p_mode='layaway' THEN p_deposit ELSE NULL END,
    'balance', CASE WHEN p_mode='layaway' THEN round(v_total-p_deposit,2) ELSE NULL END,
    'due_date', CASE WHEN p_mode='layaway' THEN v_due_date ELSE NULL END,
    'items_count', v_count,
    'sale_items', v_items
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.donatello_checkout(
  text,jsonb,numeric,numeric,text,text,numeric,date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donatello_checkout(
  text,jsonb,numeric,numeric,text,text,numeric,date
) TO authenticated;

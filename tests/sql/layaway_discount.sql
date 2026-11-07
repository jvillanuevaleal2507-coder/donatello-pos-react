\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $discount_test$
DECLARE
  r jsonb;
  v_sale record;
  v_line_sum numeric;
BEGIN
  r:=public.donatello_layaway_payment_once(
    '88888888-8888-4888-8888-888888888888'::uuid,204,70
  );
  SELECT * INTO v_sale FROM public.sales WHERE id=(r->>'sale_id')::bigint;
  IF v_sale.total<>90 OR v_sale.subtotal_original<>100
     OR v_sale.discount_amount<>10 OR v_sale.discount_percent<>10
     OR v_sale.profit<>70 OR (r->>'balance')::numeric<>0 THEN
    RAISE EXCEPTION 'Liquidacion con descuento: total/utilidad incorrecta';
  END IF;
  SELECT sum(profit) INTO v_line_sum FROM public.sale_items
    WHERE sale_id=v_sale.id;
  IF v_line_sum<>70 THEN
    RAISE EXCEPTION 'Partida no absorbe descuento';
  END IF;

  r:=public.donatello_layaway_payment_once(
    '99999999-9999-4999-8999-999999999999'::uuid,205,70
  );
  SELECT * INTO v_sale FROM public.sales WHERE id=(r->>'sale_id')::bigint;
  SELECT sum(profit) INTO v_line_sum FROM public.sale_items WHERE sale_id=v_sale.id;
  IF v_sale.profit<>70 OR v_line_sum<>70 OR v_sale.discount_amount<>10
    OR (SELECT count(*) FROM public.sale_items WHERE sale_id=v_sale.id)<>2
    OR (SELECT stock FROM public.products WHERE id=12)<>7 THEN
    RAISE EXCEPTION 'Reparto de descuento o stock incorrecto';
  END IF;
END;
$discount_test$;
RESET ROLE;
SELECT CASE WHEN
  (SELECT count(*) FROM public.sales)=6
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='completed')=8
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='cancelled')=2
THEN 'DISCOUNT_OK' ELSE 'DISCOUNT_FAILED' END;

\set ON_ERROR_STOP on
-- The same void_sale_transaction implementation currently deployed by Donatello
-- must restore stock for a normal sale but roll back fully for liquidation.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $test$
DECLARE
  regular_sale bigint;
  liquidation_sale bigint;
  restock_qty integer;
  before_stock integer;
  after_stock integer;
BEGIN
  SELECT s.id,coalesce(sum(si.qty),0)::int INTO regular_sale,restock_qty
  FROM public.sales s JOIN public.sale_items si ON si.sale_id=s.id
  WHERE s.status='completed' AND si.product_id=12
    AND NOT EXISTS (
      SELECT 1 FROM public.layaway_payments p
      WHERE p.sale_id=s.id AND p.payment_type='liquidation'
    )
  GROUP BY s.id ORDER BY s.id LIMIT 1;
  IF regular_sale IS NULL OR restock_qty<=0 THEN
    RAISE EXCEPTION 'Missing ordinary sale for positive void test';
  END IF;
  SELECT stock INTO before_stock FROM public.products WHERE id=12;
  PERFORM public.void_sale_transaction(regular_sale,'Synthetic ordinary sale');
  SELECT stock INTO after_stock FROM public.products WHERE id=12;
  IF after_stock<>before_stock+restock_qty OR
     (SELECT status FROM public.sales WHERE id=regular_sale)<>'voided' THEN
    RAISE EXCEPTION 'Ordinary sale void changed behavior';
  END IF;

  SELECT p.sale_id INTO liquidation_sale
  FROM public.layaway_payments p JOIN public.sales s ON p.sale_id=s.id
  WHERE p.payment_type='liquidation' AND p.sale_id IS NOT NULL
    AND s.status='completed'
  ORDER BY p.sale_id LIMIT 1;
  IF liquidation_sale IS NULL THEN
    RAISE EXCEPTION 'Missing paid layaway sale to protect';
  END IF;
  SELECT stock INTO before_stock FROM public.products WHERE id=12;
  BEGIN
    PERFORM public.void_sale_transaction(
      liquidation_sale,'Synthetic liquidation reversal denied'
    );
    RAISE EXCEPTION 'Liquidation void incorrectly succeeded'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  SELECT stock INTO after_stock FROM public.products WHERE id=12;
  IF after_stock<>before_stock
    OR (SELECT status FROM public.sales WHERE id=liquidation_sale)<>'completed'
    OR NOT EXISTS(SELECT 1 FROM public.layaway_payments
       WHERE sale_id=liquidation_sale AND payment_type='liquidation') THEN
    RAISE EXCEPTION 'Failed liquidation void affected stock or audit';
  END IF;

  BEGIN
    UPDATE public.sales SET status='voided'
    WHERE id=liquidation_sale;
    RAISE EXCEPTION 'Direct SQL void bypassed liquidation guard'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
  IF (SELECT stock FROM public.products WHERE id=12)<>before_stock THEN
    RAISE EXCEPTION 'Direct void changed stock';
  END IF;
END;
$test$;
RESET ROLE;

SELECT CASE WHEN
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='pos_block_liquidation_sale_void'
    AND NOT tgisinternal)
  AND (SELECT count(*) FROM public.sales WHERE status='voided')>=1
  AND EXISTS (SELECT 1 FROM public.layaway_payments p
    JOIN public.sales s ON s.id=p.sale_id
    WHERE p.payment_type='liquidation' AND s.status='completed')
THEN 'LAYAWAY_VOID_GUARD_OK' ELSE 'LAYAWAY_VOID_GUARD_FAILED' END;

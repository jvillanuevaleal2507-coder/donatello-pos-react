\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $server$
DECLARE
  k uuid:='11111111-1111-4111-8111-222222222222';
  other uuid:='11111111-1111-4111-8111-333333333333';
  cancelled uuid:='11111111-1111-4111-8111-444444444444';
  payment uuid:='11111111-1111-4111-8111-555555555555';
  got jsonb; receipt jsonb; initial_stock integer; initial_sales integer;
BEGIN
  initial_stock:=(SELECT stock FROM public.products WHERE id=12);
  initial_sales:=(SELECT count(*) FROM public.sales);
  IF public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected pending operation'; END IF;

  PERFORM public.donatello_payment_reserve(k,'checkout');
  got:=public.donatello_payment_recover();
  IF got->>'operation_id'<>k::text OR got->>'kind'<>'checkout' OR
     got->>'state'<>'reserved' OR got->>'receipt' IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot recover reserved UUID after browser reset'; END IF;
  IF public.donatello_payment_reserve(k,'checkout')->>'operation_id'<>k::text THEN
    RAISE EXCEPTION 'Idempotent reservation lost'; END IF;

  BEGIN
    PERFORM public.donatello_payment_reserve(other,'checkout');
    RAISE EXCEPTION 'Other concurrent reservation succeeded' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_payment_ack(k);
    RAISE EXCEPTION 'Uncommitted reservation acknowledged' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_checkout_once(other,'sale',
      '[{"id":12,"qty":1,"expected_price":10}]'::jsonb,0,10,NULL,NULL,0,NULL);
    RAISE EXCEPTION 'Unreserved checkout committed' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  IF (SELECT count(*) FROM public.sales)<>initial_sales OR
     (SELECT stock FROM public.products WHERE id=12)<>initial_stock THEN
    RAISE EXCEPTION 'Unreserved attempt changed financial data'; END IF;

  receipt:=public.donatello_checkout_once(k,'sale',
    '[{"id":12,"qty":1,"expected_price":10}]'::jsonb,0,10,NULL,NULL,0,NULL);
  got:=public.donatello_payment_recover();
  IF got->>'state'<>'completed' OR got->'receipt' IS DISTINCT FROM receipt THEN
    RAISE EXCEPTION 'Completed sale not recoverable'; END IF;
  IF (SELECT count(*) FROM public.sales)<>initial_sales+1 OR
     (SELECT stock FROM public.products WHERE id=12)<>initial_stock-1 THEN
    RAISE EXCEPTION 'Reserved checkout did not commit once'; END IF;
  BEGIN
    PERFORM public.donatello_payment_reserve(other,'checkout');
    RAISE EXCEPTION 'Unacknowledged result allowed next checkout' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  IF public.donatello_payment_ack(k)->>'state'<>'acknowledged' OR
     public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Acknowledged receipt still blocks POS'; END IF;

  PERFORM public.donatello_payment_reserve(cancelled,'checkout');
  PERFORM public.donatello_checkout_cancel(cancelled);
  got:=public.donatello_payment_recover();
  IF got->>'state'<>'cancelled' THEN RAISE EXCEPTION 'Cancel not recoverable'; END IF;
  PERFORM public.donatello_payment_ack(cancelled);
  BEGIN
    PERFORM public.donatello_checkout_once(cancelled,'sale',
      '[{"id":12,"qty":1,"expected_price":10}]'::jsonb,0,10,NULL,NULL,0,NULL);
    RAISE EXCEPTION 'Late cancelled UUID charged' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  PERFORM public.donatello_payment_reserve(payment,'layaway_payment');
  receipt:=public.donatello_layaway_payment_once(payment,201,10);
  got:=public.donatello_payment_recover();
  IF got->>'kind'<>'layaway_payment' OR got->>'state'<>'completed'
      OR got->'receipt' IS DISTINCT FROM receipt OR
      receipt->>'type'<>'liquidation' THEN
    RAISE EXCEPTION 'Payment receipt not recoverable after browser reset'; END IF;
  PERFORM public.donatello_payment_ack(payment);
  IF public.donatello_payment_recover() IS NOT NULL OR
     (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=201)<>1 OR
     (SELECT status FROM public.layaways WHERE id=201)<>'paid' OR
     (SELECT stock FROM public.products WHERE id=12)<>initial_stock-1 THEN
    RAISE EXCEPTION 'Payment ack/settlement changed stock or duplicated charge'; END IF;
END;
$server$;

SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $second$
BEGIN
  IF public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Cross-admin receipt leaked'; END IF;
  BEGIN
    PERFORM public.donatello_payment_ack('11111111-1111-4111-8111-222222222222'::uuid);
    RAISE EXCEPTION 'Cross-admin ACK allowed' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END;
$second$;

SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $operator$
BEGIN
  BEGIN PERFORM public.donatello_payment_recover();
    RAISE EXCEPTION 'Operator listed pending receipts' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_payment_reserve(
      '11111111-1111-4111-8111-666666666666'::uuid,'checkout');
    RAISE EXCEPTION 'Operator reserved checkout' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$operator$;

SET request.jwt.claim.sub = '';
DO $unauth$
BEGIN
  BEGIN PERFORM public.donatello_payment_recover();
    RAISE EXCEPTION 'Missing identity listed receipts' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$unauth$;
RESET ROLE;
SELECT CASE WHEN
  has_function_privilege('authenticated','public.donatello_payment_reserve(uuid,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.donatello_payment_recover()','EXECUTE')
  AND has_function_privilege('authenticated','public.donatello_payment_ack(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.donatello_payment_recover()','EXECUTE')
  AND NOT has_schema_privilege('authenticated','private','USAGE')
  AND (SELECT count(*) FROM private.pos_payment_pending)=0
  AND (SELECT count(*) FROM public.sales)=8
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='completed')=10
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='cancelled')=3
THEN 'RECOVERY_OK' ELSE 'RECOVERY_FAILED' END;

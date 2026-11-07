\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $test$
DECLARE
 p uuid:='11111111-1111-4111-8111-111111111111';
 q uuid:='22222222-2222-4222-8222-222222222222';
 reject_id uuid:='33333333-3333-4333-8333-333333333333';
 late uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; replay jsonb;
BEGIN
 r:=public.donatello_layaway_payment_once(p,200,30);
 replay:=public.donatello_layaway_payment_once(p,200,30);
 IF r IS DISTINCT FROM replay OR r->>'type'<>'payment' OR (r->>'balance')::numeric<>50
   THEN RAISE EXCEPTION 'Partial payment/replay mismatch'; END IF;
 IF (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=200)<>1
   OR (SELECT balance FROM public.layaways WHERE id=200)<>50
   OR (SELECT deposit FROM public.layaways WHERE id=200)<>50
   OR (SELECT count(*) FROM public.sales)<>2 THEN
   RAISE EXCEPTION 'Partial payment wrote incomplete data';
 END IF;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(p,200,20);
   RAISE EXCEPTION 'Expected different amount to fail' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

 r:=public.donatello_layaway_payment_once(q,200,50);
 IF r->>'type'<>'liquidation' OR (r->>'balance')::numeric<>0
   OR (r->>'total_deposit')::numeric<>100 THEN
    RAISE EXCEPTION 'Wrong liquidation receipt'; END IF;
 IF public.donatello_layaway_payment_once(q,200,50) IS DISTINCT FROM r THEN
   RAISE EXCEPTION 'Repeated liquidation changed receipt'; END IF;
 IF (SELECT status FROM public.layaways WHERE id=200)<>'paid'
   OR (SELECT count(*) FROM public.sales)<>3
   OR (SELECT count(*) FROM public.sale_items si
       JOIN public.layaway_payments lp ON si.sale_id=lp.sale_id
       WHERE lp.layaway_id=200 AND lp.payment_type='liquidation')<>1
   OR (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=200)<>2
   OR (SELECT stock FROM public.products WHERE id=12)<>7 THEN
   RAISE EXCEPTION 'Liquidation not atomic or double-deducted stock'; END IF;
 IF public.donatello_checkout_cancel(q) IS DISTINCT FROM r THEN
   RAISE EXCEPTION 'Cancel after commit should return receipt'; END IF;
 BEGIN
   PERFORM public.donatello_layaway_payment_once('55555555-5555-4555-8555-555555555555',200,50);
   RAISE EXCEPTION 'Second liquidation unexpectedly succeeded' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

 IF public.donatello_checkout_cancel(late)->>'state'<>'cancelled' THEN
   RAISE EXCEPTION 'Terminal cancellation not stored'; END IF;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(late,201,10);
   RAISE EXCEPTION 'Late payment after cancellation succeeded' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 IF (SELECT balance FROM public.layaways WHERE id=201)<>10 THEN
   RAISE EXCEPTION 'Cancelled payment modified balance'; END IF;

 BEGIN
   PERFORM public.donatello_layaway_payment_once(reject_id,203,13.37);
   RAISE EXCEPTION 'Forced journal error did not fire' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM <> 'Synthetic payment journal failure' THEN RAISE; END IF;
 END;
 IF (SELECT balance FROM public.layaways WHERE id=203)<>20
   OR EXISTS(SELECT 1 FROM public.layaway_payments WHERE layaway_id=203)
   OR public.donatello_checkout_status(reject_id) IS NOT NULL THEN
   RAISE EXCEPTION 'Rollback leaked partial payment'; END IF;
END;
$test$;
SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $test$
BEGIN
 BEGIN
  PERFORM public.donatello_layaway_payment_once(
    '66666666-6666-4666-8666-666666666666'::uuid,201,10
  );
  RAISE EXCEPTION 'Operator was allowed to pay' USING ERRCODE='P0002';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$test$;
RESET ROLE;
SELECT CASE WHEN
  has_function_privilege('authenticated',
    'public.donatello_layaway_payment_once(uuid,bigint,numeric)','EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.donatello_layaway_payment_once(uuid,bigint,numeric)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','private','USAGE')
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='completed')=5
  AND (SELECT count(*) FROM private.pos_checkout_requests WHERE state='cancelled')=2
THEN 'LAYAWAY_OK' ELSE 'LAYAWAY_FAILED' END;

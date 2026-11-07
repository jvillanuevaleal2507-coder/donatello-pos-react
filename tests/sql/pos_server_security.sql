\set ON_ERROR_STOP on
-- All users are synthetic. The tests exercise the actual SECURITY DEFINER
-- functions under simulated authenticated role + auth.uid(), never prod Auth.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $isolation$
DECLARE
  a uuid:='11111111-1111-4111-8111-999999999999';
  b uuid:='22222222-2222-4222-8222-999999999999';
  result jsonb;
BEGIN
  -- A and B can each hold a separate reservation; the account key is scoped.
  result:=public.donatello_payment_reserve(a,'checkout');
  IF result->>'operation_id'<>a::text THEN
    RAISE EXCEPTION 'Admin A reservation missing';
  END IF;
END;
$isolation$;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $isolation$
DECLARE
  a uuid:='11111111-1111-4111-8111-999999999999';
  b uuid:='22222222-2222-4222-8222-999999999999';
  result jsonb;
BEGIN
  IF public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Admin B saw Admin A reservation';
  END IF;
  BEGIN
    PERFORM public.donatello_payment_ack(a);
    RAISE EXCEPTION 'Admin B acknowledged Admin A reservation'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  result:=public.donatello_payment_reserve(b,'layaway_payment',201);
  IF result->>'operation_id'<>b::text OR
     public.donatello_payment_recover()->>'operation_id'<>b::text THEN
    RAISE EXCEPTION 'Admin B cannot reserve its own payment';
  END IF;
  BEGIN
    PERFORM public.donatello_payment_ack(b);
    RAISE EXCEPTION 'Unsettled payment ACK succeeded'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_payment_reserve(b,'checkout');
    RAISE EXCEPTION 'Changed kind for same UUID accepted'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_payment_reserve(b,'layaway_payment',202);
    RAISE EXCEPTION 'Changed layaway for same UUID accepted'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM public.donatello_checkout_cancel(b);
  IF public.donatello_payment_recover()->>'state'<>'cancelled' THEN
    RAISE EXCEPTION 'Cancelled payment reservation not recoverable';
  END IF;
  PERFORM public.donatello_payment_ack(b);
  IF public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Admin B reservation not cleared after terminal ACK';
  END IF;
END;
$isolation$;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $isolation$
DECLARE
  a uuid:='11111111-1111-4111-8111-999999999999';
BEGIN
  IF public.donatello_payment_recover()->>'operation_id'<>a::text THEN
    RAISE EXCEPTION 'Admin B acknowledgement affected Admin A reservation';
  END IF;
  BEGIN
    PERFORM public.donatello_payment_ack(
      '22222222-2222-4222-8222-999999999999'::uuid);
    RAISE EXCEPTION 'Admin A acknowledged Admin B cancelled UUID'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  PERFORM public.donatello_checkout_cancel(a);
  PERFORM public.donatello_payment_ack(a);
  IF public.donatello_payment_recover() IS NOT NULL THEN
    RAISE EXCEPTION 'Admin A reservation not cleared';
  END IF;
END;
$isolation$;
RESET ROLE;
SELECT CASE WHEN
  (SELECT count(*) FROM private.pos_payment_pending)=0
  AND (SELECT count(*) FROM private.pos_checkout_requests
       WHERE operation_id IN (
        '11111111-1111-4111-8111-999999999999'::uuid,
        '22222222-2222-4222-8222-999999999999'::uuid
       ) AND state='cancelled')=2
  AND NOT has_schema_privilege('authenticated','private','USAGE')
  AND NOT has_table_privilege('authenticated','private.pos_payment_pending','SELECT')
  AND NOT has_table_privilege('anon','private.pos_payment_pending','SELECT')
  AND NOT has_function_privilege('anon','public.donatello_payment_reserve(uuid,text,bigint)','EXECUTE')
  AND NOT has_function_privilege('anon','public.donatello_payment_ack(uuid)','EXECUTE')
THEN 'RECOVERY_SECURITY_OK' ELSE 'RECOVERY_SECURITY_FAILED' END;

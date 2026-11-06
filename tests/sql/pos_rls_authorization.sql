\set ON_ERROR_STOP on
-- Synthetic RLS + real RPC functions. No connection to production Auth.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- A valid admin can view existing simulated data through the policies.
DO $auth$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sales) OR
     NOT EXISTS(SELECT 1 FROM public.layaway_payments) OR
     NOT EXISTS(SELECT 1 FROM public.products) THEN
    RAISE EXCEPTION 'Active admin lost authorized SELECT access';
  END IF;
  IF (SELECT count(*) FROM public.pos_authorized_users)<>1 THEN
    RAISE EXCEPTION 'Admin should see only its own active POS authorization';
  END IF;
END;
$auth$;

-- A second authorized admin must not retrieve another admin's UUID receipt.
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $auth$
BEGIN
  IF public.donatello_checkout_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Cross-admin ledger receipt leakage';
  END IF;
  IF public.donatello_checkout_status(
    '22222222-2222-4222-8222-222222222222'::uuid
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Cross-admin payment receipt leakage';
  END IF;
END;
$auth$;

-- The synthetic active operator was created by checkout_idempotency.sql.
SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $auth$
DECLARE
  v_rows bigint;
BEGIN
  IF (SELECT count(*) FROM public.pos_authorized_users)<>1 THEN
    RAISE EXCEPTION 'Active operator cannot read its authorization row';
  END IF;
  -- NOTE: Operator can currently read sensitive product cost through the
  -- existing broad SELECT policy. This is a release blocker for operators.
  IF NOT EXISTS(SELECT 1 FROM public.products) THEN
    RAISE EXCEPTION 'Expected current POS read policy to be reproduced';
  END IF;

  BEGIN
    PERFORM public.donatello_checkout_once(
      '12345678-1234-4234-8234-123456789012'::uuid,
      'sale','[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
      0,10,NULL,NULL,0,NULL
    );
    RAISE EXCEPTION 'Operator executed privileged checkout'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  BEGIN
    PERFORM public.donatello_layaway_payment_once(
      '12345678-1234-4234-8234-123456789013'::uuid,201,10
    );
    RAISE EXCEPTION 'Operator executed privileged layaway payment'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  BEGIN
    PERFORM public.donatello_checkout_cancel(
      '12345678-1234-4234-8234-123456789014'::uuid
    );
    RAISE EXCEPTION 'Operator canceled a privileged operation'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  -- RLS rejects direct sale inserts even though GRANT INSERT is provided.
  BEGIN
    INSERT INTO public.sales(total,profit,received,items_count) VALUES(1,1,1,1);
    RAISE EXCEPTION 'Operator inserted a sale directly'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  BEGIN
    INSERT INTO public.layaway_payments(
      layaway_id,payment_amount,previous_balance,new_balance
    ) VALUES(201,1,10,9);
    RAISE EXCEPTION 'Operator inserted a payment journal directly'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  -- RLS silently filters UPDATE rows: confirm 0 changed.
  UPDATE public.layaways SET deposit=5 WHERE id=201;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>0 THEN RAISE EXCEPTION 'Operator updated layaway balance'; END IF;
  UPDATE public.products SET stock=999 WHERE id=12;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>0 THEN RAISE EXCEPTION 'Operator updated product stock'; END IF;

  -- Private schema cannot be accessed by authenticated caller.
  BEGIN
    PERFORM 1 FROM private.pos_checkout_requests LIMIT 1;
    RAISE EXCEPTION 'Operator read private idempotency ledger'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$auth$;

-- Suspended admin cannot read rows or invoke either privileged RPC.
SET request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $auth$
BEGIN
  IF EXISTS(SELECT 1 FROM public.sales) OR
    EXISTS(SELECT 1 FROM public.pos_authorized_users) THEN
    RAISE EXCEPTION 'Inactive administrator retained read access';
  END IF;
  BEGIN
    PERFORM public.donatello_checkout_status(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    );
    RAISE EXCEPTION 'Inactive admin read receipt'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_layaway_payment_once(
      '12345678-1234-4234-8234-123456789015'::uuid,201,10
    );
    RAISE EXCEPTION 'Inactive admin registered payment'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$auth$;

-- Unlisted authenticated user cannot access any POS finance objects.
SET request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
DO $auth$
BEGIN
  IF EXISTS(SELECT 1 FROM public.layaways) OR
     EXISTS(SELECT 1 FROM public.sales) OR
     EXISTS(SELECT 1 FROM public.products) THEN
    RAISE EXCEPTION 'Unlisted user gained access';
  END IF;
  BEGIN
    PERFORM public.donatello_checkout_status(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    );
    RAISE EXCEPTION 'Unlisted user read receipt'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$auth$;

-- A caller with no JWT identity is not authorized, even if role='authenticated'.
SET request.jwt.claim.sub = '';
DO $auth$
BEGIN
  IF EXISTS(SELECT 1 FROM public.sales) THEN
    RAISE EXCEPTION 'Missing JWT was granted read access';
  END IF;
  BEGIN
    PERFORM public.donatello_checkout_once(
      '12345678-1234-4234-8234-123456789016'::uuid,
      'sale','[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
      0,10,NULL,NULL,0,NULL
    );
    RAISE EXCEPTION 'Null user executed checkout'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$auth$;

RESET ROLE;
SET ROLE anon;
DO $auth$
BEGIN
  BEGIN
    PERFORM public.donatello_checkout_status(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    );
    RAISE EXCEPTION 'Anonymous role executed restricted RPC'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.donatello_layaway_payment_once(
      '12345678-1234-4234-8234-123456789017'::uuid,201,10
    );
    RAISE EXCEPTION 'Anonymous role executed layaway RPC'
      USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$auth$;
RESET ROLE;

SELECT CASE WHEN
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.sales'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.layaway_payments'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.pos_authorized_users'::regclass)
  AND (SELECT count(*) FROM public.pos_authorized_users WHERE active=true AND role='operator')=1
  AND (SELECT count(*) FROM public.sales)=6
  AND (SELECT count(*) FROM public.layaway_payments)=4
  AND (SELECT stock FROM public.products WHERE id=12)=7
THEN 'AUTH_RLS_OK' ELSE 'AUTH_RLS_FAILED' END;

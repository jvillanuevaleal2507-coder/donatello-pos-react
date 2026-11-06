\set ON_ERROR_STOP on

-- The synthetic schema already contains paid sales and layaway payments from
-- prior tests. It is now protected by the same 5 restrictive policies planned
-- for production. These tests run with simulated JWT claims, not live Auth.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.products)
    OR NOT EXISTS (SELECT 1 FROM public.sales)
    OR NOT EXISTS (SELECT 1 FROM public.sale_items)
    OR NOT EXISTS (SELECT 1 FROM public.layaways)
    OR NOT EXISTS (SELECT 1 FROM public.layaway_payments) THEN
   RAISE EXCEPTION 'Active admin lost access to financial data';
 END IF;
 IF (SELECT count(*) FROM public.pos_authorized_users)<>1 THEN
   RAISE EXCEPTION 'Admin POS role row not visible';
 END IF;
END;
$test$;

-- An operator knows SQL and may request columns directly, independently of UI.
SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.pos_authorized_users)<>1 THEN
   RAISE EXCEPTION 'Operator authorization record was not found';
 END IF;
 IF EXISTS(SELECT cost FROM public.products LIMIT 1)
    OR EXISTS(SELECT profit FROM public.sales LIMIT 1)
    OR EXISTS(SELECT cost,profit FROM public.sale_items LIMIT 1)
    OR EXISTS(SELECT items FROM public.layaways LIMIT 1)
    OR EXISTS(SELECT items FROM public.layaway_payments LIMIT 1) THEN
   RAISE EXCEPTION 'Operator leaked one or more financial records';
 END IF;
END;
$test$;

-- A suspended administrator remains blocked even when JWT still contains uid.
SET request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.products)
    OR EXISTS(SELECT 1 FROM public.sales)
    OR EXISTS(SELECT 1 FROM public.layaways) THEN
   RAISE EXCEPTION 'Inactive administrator could read finance records';
 END IF;
END;
$test$;

-- Authentication without authorization does not grant access.
SET request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.products)
    OR EXISTS(SELECT 1 FROM public.sale_items) THEN
   RAISE EXCEPTION 'Unlisted user could read sensitive data';
 END IF;
END;
$test$;
RESET ROLE;

-- Explicitly verify FIVE policies are restrictive and only target authenticated;
-- this guard MUST NOT change any anon/public catalog policies.
SELECT CASE WHEN
 (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND policyname LIKE 'pos_admin_read_guard_%'
    AND permissive='RESTRICTIVE' AND cmd='SELECT'
    AND roles='{authenticated}')=5
 AND (SELECT count(*) FROM public.products)>0
 AND (SELECT count(*) FROM public.sales)>0
 AND (SELECT count(*) FROM public.pos_authorized_users
      WHERE active AND role='operator')=1
THEN 'OPERATOR_READ_GUARDS_OK' ELSE 'OPERATOR_READ_GUARDS_FAILED' END;

\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.donatello_layaway_payment_once(
  '77777777-7777-4777-8777-777777777777'::uuid,
  202,10
)->>'payment_id';

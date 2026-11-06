\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.donatello_layaway_payment_once(
  'aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa'::uuid,10,40,100
)->>'payment_id';

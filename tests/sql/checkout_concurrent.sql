\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.donatello_checkout_once(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
  'sale',
  '[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
  0,10,NULL,NULL,0,NULL
)->>'id';

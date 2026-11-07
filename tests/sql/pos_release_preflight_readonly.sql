-- ATLAS Donatello: ONLY read metadata and anonymous aggregates.
-- NEVER contains INSERT/UPDATE/DELETE/ALTER/GRANT/REVOKE/NOTIFY.
-- For a PRE-release readiness readout only; rerun before any approved cutover.
-- This file is NOT an authorization to execute production migrations.
WITH required_columns(table_name,column_name,udt_name) AS (
  VALUES
  ('products','id','int8'),('products','price','numeric'),('products','cost','numeric'),('products','stock','int4'),
  ('sales','id','int8'),('sales','total','numeric'),('sales','profit','numeric'),
  ('sales','received','numeric'),('sales','change_amount','numeric'),('sales','items_count','int4'),
  ('sales','subtotal_original','numeric'),('sales','discount_percent','numeric'),('sales','discount_amount','numeric'),
  ('sales','status','text'),('sales','updated_at','timestamptz'),
  ('sale_items','sale_id','int8'),('sale_items','product_id','int8'),('sale_items','code','text'),
  ('sale_items','name','text'),('sale_items','qty','int4'),('sale_items','cost','numeric'),
  ('sale_items','price','numeric'),('sale_items','subtotal','numeric'),('sale_items','profit','numeric'),
  ('layaways','id','int8'),('layaways','status','text'),('layaways','balance','numeric'),
  ('layaways','deposit','numeric'),('layaways','total','numeric'),('layaways','items','jsonb'),
  ('layaways','customer_name','text'),('layaways','customer_phone','text'),('layaways','due_date','date'),('layaways','notes','text'),
  ('layaway_payments','id','int8'),('layaway_payments','created_at','timestamptz'),
  ('layaway_payments','layaway_id','int8'),('layaway_payments','payment_amount','numeric'),
  ('layaway_payments','previous_balance','numeric'),('layaway_payments','new_balance','numeric'),
  ('layaway_payments','previous_deposit','numeric'),('layaway_payments','new_deposit','numeric'),
  ('layaway_payments','payment_type','text'),('layaway_payments','sale_id','int8'),
  ('layaway_payments','customer_name','text'),('layaway_payments','customer_phone','text'),('layaway_payments','total','numeric'),
  ('layaway_payments','due_date','date'),('layaway_payments','items','jsonb'),
  ('pos_authorized_users','user_id','uuid'),('pos_authorized_users','role','text'),('pos_authorized_users','active','bool')
), mismatches AS (
  SELECT r.table_name,r.column_name,r.udt_name,c.udt_name AS actual_type
  FROM required_columns r LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
  WHERE c.column_name IS NULL OR c.udt_name IS DISTINCT FROM r.udt_name
)
SELECT 'schema_columns' AS check_name,
  CASE WHEN NOT EXISTS (SELECT 1 FROM mismatches) THEN 'PASS' ELSE 'NO_GO' END AS status,
  (SELECT count(*) FROM required_columns) AS expected,
  (SELECT count(*) FROM mismatches) AS discrepancies;

SELECT 'pre_release_ledger_absent' AS check_name,
  CASE WHEN to_regclass('private.pos_checkout_requests') IS NULL
    AND to_regclass('private.pos_payment_pending') IS NULL
    THEN 'PASS' ELSE 'REVIEW' END AS status;

SELECT 'legacy_rpc_present_until_cutover' AS check_name,
  CASE WHEN to_regprocedure('public.donatello_checkout(text,jsonb,numeric,numeric,text,text,numeric,date)') IS NOT NULL
    THEN 'PASS' ELSE 'REVIEW' END AS status;

SELECT 'anonymous_cannot_select_cost' AS check_name,
  CASE WHEN NOT has_column_privilege('anon','public.products','cost','SELECT')
    THEN 'PASS' ELSE 'NO_GO' END AS status;

SELECT 'active_operator_count' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE role='operator' AND active IS TRUE
  ) THEN 'PASS' ELSE 'NO_GO' END AS status;

WITH checks AS (
 SELECT l.status,l.total,l.deposit,l.balance,
   jsonb_typeof(l.items) AS item_type,
   jsonb_array_length(CASE WHEN jsonb_typeof(l.items)='array' THEN l.items ELSE '[]'::jsonb END) AS item_count,
   EXISTS (
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(l.items)='array' THEN l.items ELSE '[]'::jsonb END
     ) AS p(item)
     WHERE jsonb_typeof(p.item)<>'object' OR NOT (p.item ? 'qty')
       OR NOT (p.item ? 'cost') OR NOT (p.item ? 'price')
   ) AS missing_item_fields
 FROM public.layaways l
)
SELECT 'active_layaway_consistency' AS check_name,
 CASE WHEN count(*) FILTER(WHERE status='active' AND (
   item_type IS DISTINCT FROM 'array' OR item_count=0 OR missing_item_fields
   OR balance IS NULL OR balance<=0 OR deposit IS NULL OR total IS NULL
   OR abs(total-deposit-balance)>0.01
 ))=0 THEN 'PASS' ELSE 'NO_GO' END AS status,
 count(*) FILTER(WHERE status='active') AS active_layaways,
 count(*) FILTER(WHERE status='paid') AS paid_layaways;

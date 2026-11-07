-- ATLAS Donatello: READ-ONLY post-migration release gate.
-- Run only after approved migrations and before reopening the real POS.
-- Reports 6 explicit PASS/NO_GO checks; never inserts, alters, or deletes.
WITH statuses AS (
 SELECT 1 AS check_order,'private_ledger_and_pending'::text AS check_name,
   CASE WHEN
      to_regclass('private.pos_checkout_requests') IS NOT NULL AND
      to_regclass('private.pos_payment_pending') IS NOT NULL AND
      EXISTS (SELECT 1 FROM pg_class
        WHERE oid=to_regclass('private.pos_checkout_requests') AND relrowsecurity) AND
      EXISTS (SELECT 1 FROM pg_class
        WHERE oid=to_regclass('private.pos_payment_pending') AND relrowsecurity) AND
      NOT has_table_privilege('authenticated','private.pos_checkout_requests','SELECT') AND
      NOT has_table_privilege('authenticated','private.pos_payment_pending','SELECT') AND
      NOT has_table_privilege('anon','private.pos_checkout_requests','SELECT') AND
      NOT has_table_privilege('anon','private.pos_payment_pending','SELECT')
      THEN 'PASS' ELSE 'NO_GO' END::text AS status
 UNION ALL
 SELECT 2,'new_financial_rpcs',
   CASE WHEN
      to_regprocedure('public.donatello_checkout_once(uuid,text,jsonb,numeric,numeric,text,text,numeric,date)') IS NOT NULL AND
      to_regprocedure('public.donatello_layaway_payment_once(uuid,bigint,numeric)') IS NOT NULL AND
      to_regprocedure('public.donatello_payment_reserve(uuid,text,bigint)') IS NOT NULL AND
      to_regprocedure('public.donatello_payment_recover()') IS NOT NULL AND
      to_regprocedure('public.donatello_payment_ack(uuid)') IS NOT NULL AND
      to_regprocedure('public.donatello_checkout_cancel(uuid)') IS NOT NULL
      THEN 'PASS' ELSE 'NO_GO' END
 UNION ALL
 SELECT 3,'old_checkout_revoked',
   CASE WHEN
      to_regprocedure('public.donatello_checkout(text,jsonb,numeric,numeric,text,text,numeric,date)') IS NOT NULL AND
      NOT has_function_privilege('authenticated',
       'public.donatello_checkout(text,jsonb,numeric,numeric,text,text,numeric,date)','EXECUTE') AND
      NOT has_function_privilege('anon',
       'public.donatello_checkout(text,jsonb,numeric,numeric,text,text,numeric,date)','EXECUTE')
      THEN 'PASS' ELSE 'NO_GO' END
 UNION ALL
 SELECT 4,'financial_inserts_revoked',
   CASE WHEN NOT has_table_privilege('authenticated','public.sales','INSERT') AND
      NOT has_table_privilege('authenticated','public.sale_items','INSERT') AND
      NOT has_table_privilege('authenticated','public.layaways','INSERT') AND
      NOT has_table_privilege('authenticated','public.layaway_payments','INSERT')
      THEN 'PASS' ELSE 'NO_GO' END
 UNION ALL
 SELECT 5,'admin_only_financial_reads',
   CASE WHEN
      (SELECT count(*) FROM pg_policies
       WHERE schemaname='public' AND cmd='SELECT' AND permissive='RESTRICTIVE'
         AND ((tablename='products' AND policyname='pos_admin_read_guard_products')
           OR (tablename='sales' AND policyname='pos_admin_read_guard_sales')
           OR (tablename='sale_items' AND policyname='pos_admin_read_guard_sale_items')
           OR (tablename='layaways' AND policyname='pos_admin_read_guard_layaways')
           OR (tablename='layaway_payments' AND policyname='pos_admin_read_guard_layaway_payments')))=5 AND
      NOT has_column_privilege('anon','public.products','cost','SELECT')
      THEN 'PASS' ELSE 'NO_GO' END
 UNION ALL
 SELECT 6,'ledger_and_liquidation_triggers',
   CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid=to_regclass('private.pos_checkout_requests')
        AND tgname='pos_require_reserved_checkout' AND NOT tgisinternal
     ) AND EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid=to_regclass('public.sales')
        AND tgname='pos_block_liquidation_sale_void' AND NOT tgisinternal
     ) THEN 'PASS' ELSE 'NO_GO' END
)
SELECT check_name,status FROM statuses ORDER BY check_order;

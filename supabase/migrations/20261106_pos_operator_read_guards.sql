-- ATLAS Donatello: prevent exposure of financial information to POS operators.
-- STAGED ONLY. Requires PR #16 + #19 coordinated release.
-- NOTE: This intentionally blocks operators from reading these tables, even
-- product inventory. An operator-safe catalog/financial workflow is a separate
-- feature and must be released before enabling any operator account.
--
-- PostgreSQL uses one "authenticated" role for admins and operators.
-- Column hiding in React, or only GRANT/REVOKE on authenticated, is NOT a
-- security boundary between those application users.
--
-- RESTRICTIVE SELECT policies intersect the existing permissive SELECT
-- policies. No existing policy is dropped, and explicit admin authorization
-- is checked from the server-owned POS role registry.
-- Role "anon" (public catalog) is not targeted by this migration.

CREATE POLICY pos_admin_read_guard_products
ON public.products AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_authorized_users AS pau
  WHERE pau.user_id=(SELECT auth.uid()) AND pau.active IS TRUE AND pau.role='admin'
));

CREATE POLICY pos_admin_read_guard_sales
ON public.sales AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_authorized_users AS pau
  WHERE pau.user_id=(SELECT auth.uid()) AND pau.active IS TRUE AND pau.role='admin'
));

CREATE POLICY pos_admin_read_guard_sale_items
ON public.sale_items AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_authorized_users AS pau
  WHERE pau.user_id=(SELECT auth.uid()) AND pau.active IS TRUE AND pau.role='admin'
));

CREATE POLICY pos_admin_read_guard_layaways
ON public.layaways AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_authorized_users AS pau
  WHERE pau.user_id=(SELECT auth.uid()) AND pau.active IS TRUE AND pau.role='admin'
));

CREATE POLICY pos_admin_read_guard_layaway_payments
ON public.layaway_payments AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pos_authorized_users AS pau
  WHERE pau.user_id=(SELECT auth.uid()) AND pau.active IS TRUE AND pau.role='admin'
));

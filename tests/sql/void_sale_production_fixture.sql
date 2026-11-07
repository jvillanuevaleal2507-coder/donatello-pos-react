-- CI-only metadata mirror of the production void_sale_transaction contract,
-- captured by read-only pg_get_functiondef in November 2026. No real data.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_status_check CHECK (status IN ('completed','voided'));

CREATE OR REPLACE FUNCTION public.void_sale_transaction(p_sale_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  current_status text;
  changed_rows integer;
BEGIN
  IF current_user = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users AS p
    WHERE p.user_id = (SELECT auth.uid()) AND p.active IS TRUE AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden anular ventas' USING ERRCODE = '42501';
  ELSIF current_user NOT IN ('authenticated','service_role','postgres') THEN
    RAISE EXCEPTION 'Rol no autorizado para anulación' USING ERRCODE = '42501';
  END IF;

  IF p_sale_id IS NULL OR p_sale_id <= 0 THEN
    RAISE EXCEPTION 'Venta inválida';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Debes indicar el motivo de anulación';
  END IF;

  SELECT coalesce(status,'completed') INTO current_status
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF current_status = 'voided' THEN
    RAISE EXCEPTION 'La venta ya está anulada';
  END IF;

  UPDATE public.products p
  SET stock=coalesce(p.stock,0)+si.qty
  FROM (
    SELECT product_id,sum(qty)::integer AS qty
    FROM public.sale_items WHERE sale_id=p_sale_id AND product_id IS NOT NULL
    GROUP BY product_id
  ) si
  WHERE p.id=si.product_id;

  UPDATE public.sales
  SET status='voided',void_reason=btrim(p_reason),
      voided_at=now(),updated_at=now()
  WHERE id=p_sale_id;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'No se pudo confirmar la anulación de venta; transacción revertida';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION public.void_sale_transaction(bigint,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.void_sale_transaction(bigint,text)
  TO authenticated;

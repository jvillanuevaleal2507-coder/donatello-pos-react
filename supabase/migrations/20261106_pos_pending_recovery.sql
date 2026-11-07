-- ATLAS Donatello / Server-side recovery gate, stacked after PR #16 + #19.
-- DRAFT ONLY: deploy checkout, layaway and this migration together after
-- isolated Auth/PostgREST validation. No production writes in this PR.
--
-- Invariant: one reserved/unacknowledged POS financial operation per user.
-- A new device can recover its UUID even if all browser storage is erased.
-- Ledger receipts and cancelled UUID tombstones remain immutable.

CREATE TABLE private.pos_payment_pending (
  user_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('checkout','layaway_payment')),
  layaway_id bigint,
  CONSTRAINT pending_kind_layaway CHECK (
    (kind='checkout' AND layaway_id IS NULL) OR
    (kind='layaway_payment' AND layaway_id>0)
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.pos_payment_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.pos_payment_pending FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE private.pos_payment_pending IS
  'One reserved or unacknowledged financial attempt per administrator. Remove only via authenticated receipt acknowledgement.';

-- Ledger insert is the shared commit point for checkout and layaway payments.
-- This guard also rejects older clients that bypass the reservation API.
CREATE FUNCTION private.pos_require_reserved_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
  v_kind text;
BEGIN
  IF NEW.state <> 'completed' THEN RETURN NEW; END IF;
  v_kind := CASE
    WHEN NEW.receipt->>'type' IN ('sale','layaway') THEN 'checkout'
    WHEN NEW.receipt->>'type' IN ('payment','liquidation') THEN 'layaway_payment'
    ELSE NULL
  END;
  IF v_kind IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.pos_payment_pending p
    WHERE p.user_id=NEW.user_id AND p.operation_id=NEW.operation_id
      AND p.kind=v_kind
      AND (v_kind<>'layaway_payment' OR
        p.layaway_id=(NEW.receipt->>'id')::bigint)
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Operacion no reservada o incompatible'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION private.pos_require_reserved_operation()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pos_require_reserved_checkout
BEFORE INSERT ON private.pos_checkout_requests
FOR EACH ROW EXECUTE FUNCTION private.pos_require_reserved_operation();

CREATE FUNCTION public.donatello_payment_reserve(
  p_operation_id uuid,p_kind text,p_layaway_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $reserve$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_row private.pos_payment_pending%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
     p_operation_id='00000000-0000-0000-0000-000000000000'::uuid OR
     p_kind IS NULL OR p_kind NOT IN ('checkout','layaway_payment') OR
     (p_kind='checkout' AND p_layaway_id IS NOT NULL) OR
     (p_kind='layaway_payment' AND
       (p_layaway_id IS NULL OR p_layaway_id<=0)) THEN
    RAISE EXCEPTION 'Reserva invalida' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-pending:'||v_user::text,0::bigint)
  );
  SELECT * INTO v_row FROM private.pos_payment_pending
  WHERE user_id=v_user FOR UPDATE;
  IF FOUND THEN
    IF v_row.operation_id=p_operation_id AND v_row.kind=p_kind
       AND v_row.layaway_id IS NOT DISTINCT FROM p_layaway_id THEN
      RETURN pg_catalog.jsonb_build_object('operation_id',p_operation_id,
        'kind',p_kind,'state','reserved');
    END IF;
    RAISE EXCEPTION 'Existe otra operacion financiera sin conciliar'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM private.pos_checkout_requests
    WHERE user_id=v_user AND operation_id=p_operation_id
  ) THEN
    RAISE EXCEPTION 'UUID anterior no reutilizable' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.pos_payment_pending(user_id,operation_id,kind,layaway_id)
  VALUES(v_user,p_operation_id,p_kind,p_layaway_id);
  RETURN pg_catalog.jsonb_build_object('operation_id',p_operation_id,
    'kind',p_kind,'state','reserved');
END;
$reserve$;

CREATE FUNCTION public.donatello_payment_recover()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $recover$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_op uuid; v_kind text; v_layaway_id bigint; v_state text; v_receipt jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  SELECT operation_id,kind,layaway_id INTO v_op,v_kind,v_layaway_id
  FROM private.pos_payment_pending WHERE user_id=v_user FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT state,receipt INTO v_state,v_receipt
  FROM private.pos_checkout_requests
  WHERE user_id=v_user AND operation_id=v_op;
  RETURN pg_catalog.jsonb_build_object(
    'operation_id',v_op,'kind',v_kind,'layaway_id',v_layaway_id,
    'state',coalesce(v_state,'reserved'),'receipt',v_receipt
  );
END;
$recover$;

-- Acknowledgement is allowed ONLY when the ledger has a durable result.
-- It frees the next operation but does not purge receipt/tombstone history.
CREATE FUNCTION public.donatello_payment_ack(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $ack$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_op uuid; v_state text;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pos_authorized_users
    WHERE user_id=v_user AND active IS TRUE AND role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrador POS no autorizado' USING ERRCODE='42501';
  END IF;
  IF p_operation_id IS NULL OR
     p_operation_id='00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'UUID requerido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos-pending:'||v_user::text,0::bigint)
  );
  SELECT operation_id INTO v_op FROM private.pos_payment_pending
  WHERE user_id=v_user FOR UPDATE;
  IF FOUND AND v_op<>p_operation_id THEN
    RAISE EXCEPTION 'Otro intento ocupa la reserva' USING ERRCODE='22023';
  END IF;
  SELECT state INTO v_state FROM private.pos_checkout_requests
  WHERE user_id=v_user AND operation_id=p_operation_id;
  IF v_state IS NULL OR v_state NOT IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'No existe resultado definitivo para confirmar'
      USING ERRCODE='22023';
  END IF;
  IF v_op=p_operation_id THEN
    DELETE FROM private.pos_payment_pending
    WHERE user_id=v_user AND operation_id=p_operation_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('state','acknowledged');
END;
$ack$;

REVOKE ALL ON FUNCTION public.donatello_payment_reserve(uuid,text,bigint)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.donatello_payment_recover()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.donatello_payment_ack(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_payment_reserve(uuid,text,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_payment_recover()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.donatello_payment_ack(uuid)
  TO authenticated;

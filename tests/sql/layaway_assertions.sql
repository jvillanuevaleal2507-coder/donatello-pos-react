\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $assert$
DECLARE
 op uuid := '11111111-1111-4111-8111-111111111111';
 liquid_id uuid := '22222222-2222-4222-8222-222222222222';
 late_id uuid := '33333333-3333-4333-8333-333333333333';
 fail_id uuid := '44444444-4444-4444-8444-444444444444';
 r1 jsonb;
 r2 jsonb;
 got_error boolean;
BEGIN
 r1:=public.donatello_layaway_payment_once(op,7,200,650);
 IF r1->>'type'<>'payment' OR (r1->>'balance')::numeric<>450 OR
    (r1->>'total_deposit')::numeric<>850 OR
    (r1->>'previous_balance')::numeric<>650 THEN
    RAISE EXCEPTION 'Recibo parcial incorrecto';
 END IF;
 IF (SELECT deposit FROM public.layaways WHERE id=7)<>850 OR
    (SELECT balance FROM public.layaways WHERE id=7)<>450 OR
    (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=7)<>1 THEN
    RAISE EXCEPTION 'Estado de abono parcial incorrecto';
 END IF;

 r2:=public.donatello_layaway_payment_once(op,7,200,650);
 IF r1 IS DISTINCT FROM r2 OR
    (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=7)<>1 THEN
   RAISE EXCEPTION 'Replay duplicó abono';
 END IF;
 got_error:=false;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(op,7,201,650);
 EXCEPTION WHEN SQLSTATE '22023' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'UUID con parámetros nuevos pasó'; END IF;

 got_error:=false;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(
     '66666666-6666-4666-8666-666666666666'::uuid,7,50,650
   );
 EXCEPTION WHEN SQLSTATE 'P0001' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'Aceptó saldo desactualizado'; END IF;

 got_error:=false;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(
     '77777777-7777-4777-8777-777777777777'::uuid,7,500,450
   );
 EXCEPTION WHEN SQLSTATE 'P0001' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'Aceptó sobrepago'; END IF;

 r1:=public.donatello_layaway_payment_once(liquid_id,8,80,80);
 IF r1->>'type'<>'liquidation' OR (r1->>'balance')::numeric<>0 OR
    (r1->>'sale_id') IS NULL THEN
   RAISE EXCEPTION 'Liquidación sin venta ni recibo';
 END IF;
 IF (SELECT status FROM public.layaways WHERE id=8)<>'paid' OR
    (SELECT count(*) FROM public.sales)<>1 OR
    (SELECT count(*) FROM public.sale_items)<>1 OR
    (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=8)<>1 THEN
   RAISE EXCEPTION 'Liquidación parcialmente confirmada';
 END IF;
 IF public.donatello_layaway_payment_status(liquid_id) IS DISTINCT FROM r1
    OR public.donatello_layaway_payment_cancel(liquid_id) IS DISTINCT FROM r1 THEN
   RAISE EXCEPTION 'El recibo cambió al comprobar o cancelar pago confirmado';
 END IF;
 IF public.donatello_layaway_payment_once(liquid_id,8,80,80) IS DISTINCT FROM r1
    OR (SELECT count(*) FROM public.sales)<>1 THEN
   RAISE EXCEPTION 'Repetición de liquidación creó otra venta';
 END IF;

 -- Una falla DESPUÉS de insertar venta debe deshacer TODO: venta,
 -- detalle, saldo, historial e idempotencia.
 got_error:=false;
 BEGIN
   PERFORM pg_catalog.set_config('atlas.fail_history','on',true);
   PERFORM public.donatello_layaway_payment_once(fail_id,9,80,80);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'No se simuló fallo de historial'; END IF;
 IF (SELECT status FROM public.layaways WHERE id=9)<>'active' OR
    (SELECT balance FROM public.layaways WHERE id=9)<>80 OR
    (SELECT count(*) FROM public.sales)<>1 OR
    (SELECT count(*) FROM public.layaway_payments WHERE layaway_id=9)<>0 OR
    public.donatello_layaway_payment_status(fail_id) IS NOT NULL THEN
   RAISE EXCEPTION 'Falló la atomicidad ante error de historial';
 END IF;

 IF public.donatello_layaway_payment_status(late_id) IS NOT NULL THEN
   RAISE EXCEPTION 'UUID no encontrado debería devolver null';
 END IF;
 IF public.donatello_layaway_payment_cancel(late_id)->>'state'<>'cancelled' OR
    public.donatello_layaway_payment_status(late_id)->>'state'<>'cancelled' THEN
   RAISE EXCEPTION 'No se confirmó lápida de cancelación';
 END IF;
 got_error:=false;
 BEGIN
   PERFORM public.donatello_layaway_payment_once(late_id,7,50,450);
 EXCEPTION WHEN SQLSTATE '22023' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'UUID cancelado volvió a cobrar'; END IF;
END;
$assert$;

SET request.jwt.claim.sub='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $deny$
DECLARE
 got_error boolean:=false;
BEGIN
 BEGIN
   PERFORM public.donatello_layaway_payment_once(
     '88888888-8888-4888-8888-888888888888'::uuid,7,50,450
   );
 EXCEPTION WHEN SQLSTATE '42501' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'Operador autorizado a modificar pagos'; END IF;
 got_error:=false;
 BEGIN
   PERFORM public.donatello_layaway_payment_status(
     '11111111-1111-4111-8111-111111111111'::uuid
   );
 EXCEPTION WHEN SQLSTATE '42501' THEN got_error:=true; END;
 IF NOT got_error THEN RAISE EXCEPTION 'Operador recibió comprobante de otro rol'; END IF;
END;
$deny$;

RESET ROLE;
SELECT CASE WHEN
 not has_function_privilege('anon','public.donatello_layaway_payment_once(uuid,bigint,numeric,numeric)','EXECUTE')
 AND not has_function_privilege('anon','public.donatello_layaway_payment_status(uuid)','EXECUTE')
 AND not has_function_privilege('anon','public.donatello_layaway_payment_cancel(uuid)','EXECUTE')
 AND has_function_privilege('authenticated','public.donatello_layaway_payment_once(uuid,bigint,numeric,numeric)','EXECUTE')
 AND not has_schema_privilege('authenticated','private','USAGE')
 AND not has_table_privilege('authenticated','private.pos_layaway_payment_requests','SELECT')
THEN 'PRIVILEGES_OK' ELSE 'PRIVILEGES_BAD' END;

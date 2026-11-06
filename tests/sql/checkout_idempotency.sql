-- Un solo PostgreSQL desechable, sin proyecto Supabase ni clientes.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $test$
DECLARE
  op uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  failed_op uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  r1 jsonb;
  r2 jsonb;
BEGIN
  r1 := public.donatello_checkout_once(
    op,'sale','[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
    0,10,NULL,NULL,0,NULL
  );
  r2 := public.donatello_checkout_once(
    op,'sale','[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
    0,10,NULL,NULL,0,NULL
  );
  IF r1 IS DISTINCT FROM r2 THEN RAISE EXCEPTION 'Replay retornó otro comprobante'; END IF;
  IF (SELECT count(*) FROM public.test_movements) <> 1
    THEN RAISE EXCEPTION 'Replay creó movimiento duplicado'; END IF;
  IF public.donatello_checkout_status(op) IS DISTINCT FROM r1
    THEN RAISE EXCEPTION 'Status no encontró el comprobante'; END IF;
  IF public.donatello_checkout_status('99999999-9999-4999-8999-999999999999'::uuid) IS NOT NULL
    THEN RAISE EXCEPTION 'Status debería regresar NULL si no se cobró'; END IF;

  -- El mismo UUID con datos diferentes debe fallar, nunca reutilizar ticket.
  BEGIN
    PERFORM public.donatello_checkout_once(
      op,'sale','[{"id":12,"qty":2,"expected_price":10}]'::jsonb,
      0,10,NULL,NULL,0,NULL
    );
    RAISE EXCEPTION 'No rechazó payload diferente';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  -- Un fallo del cobro debe dejar el registro privado sin operación.
  BEGIN
    PERFORM public.donatello_checkout_once(
      failed_op,'failure','[]'::jsonb,0,10,NULL,NULL,0,NULL
    );
    RAISE EXCEPTION 'No se simuló error de cobro';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'Simulated checkout failure' THEN RAISE; END IF;
  END;
  IF public.donatello_checkout_status(failed_op) IS NOT NULL
    THEN RAISE EXCEPTION 'Fallo dejó registro de cobro'; END IF;
END;
$test$;

-- Un usuario autenticado no autorizado no puede consultar recibos ajenos.
SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $test$
BEGIN
  BEGIN
    PERFORM public.donatello_checkout_status(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    );
    RAISE EXCEPTION 'Usuario no autorizado obtuvo acceso';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$test$;

RESET ROLE;
SELECT CASE WHEN
  has_function_privilege('anon','public.donatello_checkout_once(uuid,text,jsonb,numeric,numeric,text,text,numeric,date)','EXECUTE') = false
  AND has_function_privilege('anon','public.donatello_checkout_status(uuid)','EXECUTE') = false
  AND has_schema_privilege('authenticated','private','USAGE') = false
THEN 'GRANTS_OK' ELSE pg_catalog.concat('GRANTS_BAD') END;

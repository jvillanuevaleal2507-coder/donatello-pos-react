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
      failed_op,'sale','[{"id":12,"qty":999,"expected_price":10}]'::jsonb,
      0,9990,NULL,NULL,0,NULL
    );
    RAISE EXCEPTION 'No rechazó stock insuficiente';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Existencia insuficiente:%' THEN RAISE; END IF;
  END;
  IF public.donatello_checkout_status(failed_op) IS NOT NULL
    THEN RAISE EXCEPTION 'Fallo dejó registro de cobro'; END IF;
  IF (SELECT stock FROM public.products WHERE id=12) <> 9
    THEN RAISE EXCEPTION 'Stock alterado tras fallo o replay'; END IF;

  -- Apartado real, con anticipo y saldo calculados por el servidor.
  r1 := public.donatello_checkout_once(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    'layaway','[{"id":12,"qty":1,"expected_price":10}]'::jsonb,
    0,0,'Cliente sintético',NULL,3,'2026-12-20'::date
  );
  IF r1->>'type' <> 'layaway' OR (r1->>'balance')::numeric <> 7
    THEN RAISE EXCEPTION 'Apartado no devuelve recibo o saldo correcto'; END IF;
  IF (SELECT count(*) FROM public.layaways) <> 1
    THEN RAISE EXCEPTION 'Apartado no fue creado'; END IF;
  IF (SELECT stock FROM public.products WHERE id=12) <> 8
    THEN RAISE EXCEPTION 'Apartado no descontó una pieza'; END IF;
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

-- Un operador activo no puede ejecutar funciones financieras privilegiadas.
SET request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
RESET ROLE;
INSERT INTO public.pos_authorized_users(user_id,role,active)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','operator',true);
SET ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.donatello_checkout_status(
      'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid
    );
    RAISE EXCEPTION 'Operador accedió al recibo administrativo';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$test$;
RESET ROLE;
SELECT CASE WHEN
  has_function_privilege('anon','public.donatello_checkout_once(uuid,text,jsonb,numeric,numeric,text,text,numeric,date)','EXECUTE') = false
  AND has_function_privilege('anon','public.donatello_checkout_status(uuid)','EXECUTE') = false
  AND has_schema_privilege('authenticated','private','USAGE') = false
THEN 'GRANTS_OK' ELSE pg_catalog.concat('GRANTS_BAD') END;

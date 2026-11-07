# ATLAS — Puerta de liberación coordinada del POS Donatello

**Estado:** PREPARACIÓN / NO AUTORIZA PUBLICACIÓN  
**Fecha de referencia:** 2026-11-07  
**Alcance:** PR #16 `security/atomic-checkout-preview-20261105` y PR #19 `security/layaway-payments-atomic-20261106`.  
**Prohibido desde este documento:** aplicar SQL a producción, fusionar PR, promover despliegue, crear ramas de pago o simular cobros con datos reales.

## 1. Confirmaciones comprobadas

- PR #16 está basado en `main` y permanece borrador. **PR #19 ahora apunta directamente a `main` y contiene el código de ambos PR**; la única eventual fusión autorizada será #19. No fusionar #16 por separado.
- CI de checkout atómico/SQL, GoTrue + PostgREST con cuentas sintéticas, tarjetas y WhatsApp pasó 4/4 para la rama auditada. Compilaciones de preview de Vercel verificadas, pero **un preview no equivale a que exista el nuevo backend en producción**.
- Ensayos físicos Android: venta normal y devolución de una unidad; liquidación de apartado protegida contra anulación ordinaria; abonos y liquidación sin segundo descuento de stock; recuperación tras cierre de pestaña; pérdida de Wi-Fi con conservación final del carrito LAB-MESA y $300 capturados.
- Lectura de metadatos de Supabase Donatello (2026-11-07): `private` existe; función antigua `donatello_checkout(text,jsonb,numeric,numeric,text,text,numeric,date)` existe y `authenticated` todavía tiene EXECUTE; `anon` no. **No** existen `private.pos_checkout_requests`, `private.pos_payment_pending` ni las nuevas RPC en producción.
- Lectura de permisos: `anon` **no** tiene SELECT sobre `public.products.cost`; `authenticated` sí tiene permisos de columna que requieren la nueva RLS de operador. Una cuenta `admin` activa, ningún `operator` activo.
- Las 18 entradas de PostgREST disponibles en la consulta agregada de la ventana observada no contenían referencia a `donatello_checkout`; esto **no demuestra** que ninguna integración externa lo invoque, ni cubre otros días, clientes o transportes.
- Se inspeccionaron las **16 Edge Functions** presentes en Donatello; tres funciones comerciales tienen código sustancial sin llamadas al checkout antiguo, y otras funciones consultadas resultaron en respuestas pequeñas de inhabilitación/no operación financiera. Búsqueda adicional en los repositorios GitHub conectados no encontró referencias externas. Integraciones privadas fuera de ese alcance siguen sin certificar.
- Preflight productivo de solo lectura: las **52 columnas** del contrato de ventas, apartados, abonos, productos y roles coinciden en tipo y nombre. La base contiene **5 apartados pagados, 0 activos**, sin saldos abiertos que migrar. Evidencia reproducible: `tests/sql/pos_release_preflight_readonly.sql`.
- Vercel POS verificado: proyecto **`donatello-pos-react`**, dominio **`pos.ventasdonatello.com`**, Git `main` apunta a despliegues `production`; la versión productiva observada proviene de `main` (`ffca07f89e85864235842fb44b52cc8bd97ef5aa`).

## 2. Dependencias y riesgos que bloquean el GO

1. **Consumidores antiguos**: el cambio final revoca EXECUTE de `donatello_checkout`. Inspección del código versionado y de las Edge Functions conocidas no encontró un segundo cliente financiero; **clientes privados, integraciones independientes, sesiones antiguas y apps fuera del repositorio no están certificados**. Confirmar que ninguno necesita el RPC legado antes del corte.
2. **Despliegue doble no permitido**: Vercel publica automáticamente los commits fusionados a `main`. **PR #19 ya es una PR consolidada contra `main`**: NO fusionar PR #16 primero. Seleccionar **una única vía de publicación** para el corte: SQL con caja cerrada, luego *un solo merge* aprobado de #19 a `main` y esperar su despliegue Git en Vercel. No mezclarlo con un `vercel promote` o deploy manual que cause una segunda versión.
3. **Reservas abandonadas**: la función server-side conserva una reserva por cuenta hasta resultado terminal y confirmación ACK; está diseñado para bloquear cobros que podrían duplicarse. No implementar limpieza por antigüedad ni eliminación de tombstones.
4. **Operadores**: la política restrictiva bloquea lecturas de productos/costos/ventas para operadores; no habilitar ninguna cuenta operador antes de tener vista/RPC de catálogo limitado. Hoy no hay operadores activos.
5. **Rollback delicado**: restaurar una versión antigua del POS después de revocar EXECUTE del RPC legado **no es un rollback seguro por sí solo**. Nunca borrar ledger, reservas, comprobantes ni UUID cancelados.

## 3. Secuencia de un eventual corte (solo con autorización explícita posterior)

### A. Preparación y congelamiento

- Reconfirmar `main`, SHA exacto revisado, PR #16 y #19, 4/4 CI y objetivo de Vercel (proyecto, entorno y dominio) antes del cambio.
- Confirmar por las personas que usan la caja que **no hay ventas, abonos, apartados ni comprobantes en trámite**. Elegir un período sin atención activa; no asumir que cerrar una pestaña equivale a confirmar un cobro.
- Tener **CI del mismo SHA exacto de PR #19**, preview de compilación verificado y una **única vía de publicación automática** tras el merge final; no promover ninguna preview al dominio. No usar preview conectado a backend productivo para cobros.
- Ejecutar el preflight **solo lectura** `tests/sql/pos_release_preflight_readonly.sql` y verificar metadatos, tipos y firmas de tablas, RPC, RLS y grants que exigen los cuatro scripts. Un desacuerdo bloquea el corte y se corrige en una PR nueva, no editando improvisadamente la BD.

### B. Aplicación ordenada de SQL (NO ejecutar ahora)

Con el POS en ventana de mantenimiento y una persona responsable controlando los cambios, aplicar **en orden estricto**, verificando salida/error de cada una:

1. `supabase/migrations/20261105_pos_checkout_idempotency.sql` — ledger privado de cobro, nueva RPC idempotente, consulta y cancelación terminal.
2. `supabase/migrations/20261106_pos_layaway_payments.sql` — abonos atómicos, liquidación con detalle y bloqueo de anulación de venta por apartado liquidado.
3. `supabase/migrations/20261106_pos_pending_recovery.sql` — reserva previa obligatoria, recuperación entre dispositivos y ACK.
4. `supabase/migrations/20261106_pos_operator_read_guards.sql` — RLS restrictiva de lecturas financieras; revoca el checkout antiguo y los INSERT financieros directos.

**IMPORTANTE:** desde el paso 3, el trigger de reserva ya puede impedir cobros enviados por el frontend antiguo sin una reserva previa. Desde el paso 4, se revoca formalmente su RPC legacy. Mantener la caja cerrada durante **los cuatro pasos y la publicación**, sin confiar en que la interfaz antigua seguirá cobrando. No reabrir hasta finalizar todas las comprobaciones.

### C. Controles obligatorios después del SQL y antes del dominio

- Ejecutar **`tests/sql/pos_release_postflight_readonly.sql`** con conexión a la base correspondiente: exige **6/6 `PASS`** antes de volver a habilitar el cobro. El reporte verifica ledger/pendientes privados con RLS, RPC nuevas, bloqueo del RPC anterior, denegación de INSERT financiero directo, políticas RESTRICTIVE para administradores y ambos triggers. Si aparece `NO_GO`, detener el corte y no publicar el frontend. Se ha validado este reporte en PostgreSQL 17 desechable mediante GitHub Actions (`POSTFLIGHT_6_6_PASS`); **no se ha ejecutado en producción**, porque allí aún faltan las migraciones.

- Existen las dos tablas privadas con RLS, sin permisos directos para `anon` ni `authenticated`.
- Nuevas RPC disponibles y `anon` sin EXECUTE; las comprobaciones de `auth.uid()`, `role='admin'` y `active=true` siguen en el código publicado.
- `authenticated` dejó de poder llamar al checkout legado, y dejó de poder INSERT directo en `sales`, `sale_items`, `layaways`, `layaway_payments`.
- Trigger de liquidación instalado; política RESTRICTIVE de lectura de admin instalada; `anon` sin acceso a `products.cost`.
- Tras la creación de nuevas funciones, comprobar que PostgREST reconoce las nuevas RPC. Ante error `PGRST202` o caché de esquema obsoleta, mantener caja cerrada y aplicar, **solo en ventana autorizada**, la operación de recarga de caché documentada por Supabase (`NOTIFY pgrst, 'reload schema'`), luego volver a verificar; nunca usar el error para omitir controles.
- Si alguna condición falla, **DETENER**, mantener la caja cerrada y no publicar un frontend que dependa de una API incompleta.

### D. Un solo cambio de frontend y observación

- **Única vía elegida: Git automático de Vercel**, no promoción manual. Solo después del paso C, **fusionar PR #19 una única vez a `main`** con autorización explícita para producción; esperar el despliegue `production` correspondiente exactamente a ese SHA. NO fusionar PR #16 por separado, y NO ejecutar en paralelo otro `vercel promote`/deploy.
- Validar login de admin, consulta de inventario e historial, carga de apartados, consulta de operaciones pendientes, lectura normal de productos y ausencia de errores de red. No generar un cobro real artificial sin aprobación separada.
- Confirmar que no se expongan datos de costo/utilidad por `anon`, que la sesión suspendida no opere y que operador siga inhabilitado.
- Ante alerta de recibo pendiente o reserva, NO iniciar un UUID nuevo ni borrar almacenamiento local; usar conciliación.

## 4. Procedimiento asistido de reserva abandonada (sin SQL destructivo)

1. Mismo administrador autenticado entra al POS. **No** volver a presionar `Cobrar venta` mientras haya mensaje pendiente.
2. Recuperar estado con `donatello_payment_recover()` / botón de consulta:
   - **`completed`**: recuperar **el mismo comprobante**, verificarlo y hacer ACK con `donatello_payment_ack(operation_id)`; nunca cobrar otra vez.
   - **`reserved` / estado no definitivo**: consultar el mismo UUID; si no existe comprobante, usar la cancelación **terminal** `donatello_checkout_cancel(operation_id)` de la UI para garantizar que la petición tardía no cobre. Después de un resultado `cancelled` confirmado, hacer ACK. Si la cancelación devuelve un recibo, tratarlo como cobro confirmado.
   - **Conexión/estado no verificable**: conservar el bloqueo y escalar. No confiar en un `NULL` aislado ni en que no haya fila visible en historial.
   - **`layaway_payment`**: usar el flujo de Apartados/confirmación del mismo UUID y la misma cuenta; no generar otro abono en sustitución.
3. Nunca `DELETE` manual de `private.pos_checkout_requests` ni de `private.pos_payment_pending`; nunca eliminar tombstones `cancelled` para «destrabar» una caja. No automatizar expiración de esas reservas.
4. Documentar solo folio/UUID, estado y resultado necesarios para auditoría, sin copiar nombres ni teléfonos de clientes a incidencias.

## 5. Criterios de detener / GO

**NO-GO** si: cliente externo legacy no descartado; frontend viejo puede seguir cobrando durante el corte; CI no verde; aparecen conflictos de migración; la reserva no concilia; SQL RLS/ACL no coincide; no existe una forma de publicar un solo frontend final; se requiere habilitar operadores; no hay aprobación expresa del cambio productivo.

**GO** solo después de: solucionar lo anterior, aprobar responsablemente el corte, confirmar objetivos exactos Vercel + Supabase y acordar quién valida resultados. Que el laboratorio funcione **no autoriza** por sí mismo a tocar producción.

## 6. Fuentes de operación verificables

- Preflight SQL de solo lectura: `tests/sql/pos_release_preflight_readonly.sql`. La validación del 7 nov 2026 devolvió **6/6 PASS**: 52/52 columnas, 5 apartados pagados y 0 activos, catalogo anon sin costos, 1 administrador activo y 0 operadores. Volver a consultar inmediatamente antes de un eventual corte.
- Postflight SQL de solo lectura: `tests/sql/pos_release_postflight_readonly.sql`. **6/6 PASS en PostgreSQL 17 desechable**, luego de aplicar las cuatro migraciones. Solo se ejecutará en producción con la liberación autorizada y antes de reabrir caja; no sustituye validar las RPC desde GoTrue/PostgREST en producción.
- Supabase Knowledge Base: https://supabase.com/kb/troubleshooting/refresh-postgrest-schema (recarga de caché tras funciones nuevas; **NO ejecutada**).
- Panel Vercel: `donatello-pos-react` / `pos.ventasdonatello.com`, despliegue productivo desde `main`.

## 7. Pendientes separados, sin mezclar con la publicación financiera

- Supabase Advisor: protección contra contraseñas filtradas deshabilitada; evaluar activación desde Auth.
- `pg_net` en esquema `public`; revisar dependencias antes de cualquier cambio de esquema.
- Tablas `donatello_internal` con RLS sin políticas: revisar si son intencionalmente privadas. No crear permisos generales.
- Definir una política documental para conservación de recibos y UUID cancelados; cualquier purga requiere una solución demostrable frente a peticiones tardías, no una TTL arbitraria.

# Atlas Integrador — MVP comercial

## Objetivo
Sistema operativo ligero especializado para integradores de seguridad electrónica y telecomunicaciones. La demo inicial no usa backend ni Supabase y no modifica la operación productiva de Donatello.

## Referencia funcional
La interfaz compartida por Javier se toma como referencia de cobertura funcional: Clientes, Proveedores, Cotizaciones, Punto de Venta, Mano de obra, Inventario, Finanzas, Facturación, Compras, Gráficas y Reportes. No se copiará su diseño; Atlas Integrador tendrá una UX más moderna y un flujo centrado en proyectos.

## Flujo principal
Prospecto/Cliente → Cotización → Aprobación → Proyecto → Material + Mano de obra → Compras/Salidas → Cobranza → Cierre → Utilidad real.

## MVP vendible
1. Dashboard ejecutivo
   - Cotizaciones en análisis
   - Proyectos aprobados/en ejecución
   - Proyectos cerrados
   - Venta mensual
   - Cobranza pendiente
   - Margen/utilidad por proyecto
2. Clientes y prospectos
3. Cotizaciones
   - Materiales
   - Mano de obra
   - Margen
   - Estatus
4. Proyectos/Servicios
   - En análisis, aprobado, ejecución, cerrado
   - Conversión de cotización aprobada a proyecto
5. Inventario
   - Existencias
   - Entradas/salidas
   - Salidas asociadas a proyecto
6. Compras y proveedores
7. Cobranza
8. Rentabilidad por proyecto
9. Reportes básicos

## Fuera del MVP
Facturación fiscal, integración SYSCOM, IA, app móvil de técnicos, evidencias fotográficas, mantenimientos recurrentes, garantías avanzadas y automatizaciones. Se incorporan después de validar demanda/pago.

## Arquitectura de demo
- Frontend separado lógicamente dentro de la rama atlas-pyme-demo.
- Datos simulados/localStorage para la etapa comercial.
- Sin proyecto adicional de Supabase.
- Sin tocar producción de Donatello.
- Preparado conceptualmente para multi-tenant cuando exista el primer cliente.

## Principio de producto
No vender un ERP genérico. Vender control operativo para integradores: saber qué se cotizó, qué material salió, cuánto costó la mano de obra, cuánto falta cobrar y cuánto dejó realmente cada proyecto.

## Validación comercial
La demo debe permitir contar una historia completa en pocos minutos: crear/ver cliente → cotización → proyecto → consumo de material → cobranza → utilidad. El siguiente desarrollo se prioriza por lo que los prospectos estén dispuestos a pagar.
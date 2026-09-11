# Atlas Integrador — Cotizador / Análisis de precios

## Flujo observado en el sistema actual
1. El usuario entra a **Análisis de precios**.
2. Primero debe seleccionar el **cliente** al que se le generará el análisis/cotización.
3. Al seleccionar cliente, el sistema muestra información general del cliente y su histórico de análisis/cotizaciones, junto con indicadores del cliente y actividad general.
4. El usuario vuelve a entrar a **Análisis de precios** para construir la nueva cotización.
5. Captura datos generales:
   - Moneda
   - Descripción del proyecto
   - Tipo de cambio/FIX cuando aplica
   - Totales de cliente, costo estimado, utilidad y utilidad neta
6. Agrega **materiales** desde un catálogo de artículos.
   - Búsqueda por artículo
   - Filtro/categoría
   - Categorías técnicas como CCTV, WiFi, cableado, etc.
   - Precio y moneda por artículo
7. Agrega **mano de obra** si el proyecto la requiere.
   - Selección de actividad
   - Posibilidad de asociar la actividad a materiales
   - La actividad despliega personal/puestos disponibles y su costo/precio por hora
   - La actividad puede manejar una utilidad de mano de obra
8. Se agregan **gastos indirectos**.
   - En Atlas Integrador serán parametrizables por empresa y podrán quedar precargados/fijos según la configuración del cliente.
9. El sistema debe recalcular en tiempo real costo estimado, total al cliente, utilidad y margen.

## Principios para Atlas Integrador
- Conservar la lógica de costos, no la interfaz actual.
- Hacer el flujo más continuo: **Cliente → Datos generales → Materiales → Mano de obra → Indirectos → Resumen → Enviar a aprobación**.
- Evitar obligar al usuario a regresar al menú lateral entre pasos.
- Mantener permisos granulares: no todos los roles pueden ver costos, márgenes, precios por hora o autorizar el análisis.
- Las categorías de materiales deben ser configurables por empresa.
- Los gastos indirectos deben ser parametrizables por empresa y poder aplicarse automática o manualmente.
- Mano de obra debe permitir costo por persona/puesto/actividad y precio de venta independiente cuando la empresa lo requiera.

## Roles/permisos relevantes
Ejemplos de permisos independientes:
- Crear cotización
- Ver costo de material
- Ver margen/utilidad
- Modificar margen
- Ver costo del personal
- Agregar mano de obra
- Agregar/modificar indirectos
- Enviar a aprobación
- Aprobar análisis
- Activar proyecto

## Diseño propuesto de la pantalla de cotización
### Encabezado fijo
- Cliente
- Proyecto
- Moneda / tipo de cambio
- Responsable/promotor
- Estado

### Tabs o pasos
1. Materiales
2. Mano de obra
3. Gastos indirectos
4. Resumen

### Resumen financiero persistente
Visible durante toda la cotización para usuarios con permiso:
- Venta al cliente
- Costo de materiales
- Costo de mano de obra
- Gastos indirectos
- Costo total
- Utilidad
- Margen %

## Mejora comercial clave
Atlas Integrador debe permitir que el dueño del integrador sepa antes de enviar una propuesta no solo cuánto va a cobrar, sino **cuánto le cuesta realmente ejecutar el proyecto y qué margen deja**.

## Pendiente por levantar
- Flujo exacto de **Aceptar análisis**
- Qué cambia al **Activar proyecto**
- Formato/documento final que se imprime o envía al cliente
- Reglas de impuestos/IVA dentro del cotizador
- Si el costo de materiales se congela al aceptar la cotización o se actualiza posteriormente
- Cómo se maneja la vigencia de precios/cotización
- Cómo se maneja descuento autorizado

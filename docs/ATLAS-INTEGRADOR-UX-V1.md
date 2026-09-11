# Atlas Integrador — UX / Navegación V1

## Objetivo
Convertir la arquitectura funcional en una experiencia moderna, rápida y especializada para integradores. La interfaz debe reducir clics, respetar permisos y mantener al proyecto como eje del sistema.

## Navegación principal

1. Inicio
2. Clientes
3. Cotizaciones
4. Proyectos
5. Inventario
6. Compras
7. Mano de obra
8. Almacén
9. Reportes
10. Configuración

Módulos ocultables por empresa/rol:
- POS
- Finanzas
- Facturación
- Paquetes de ingeniería

## 1. Inicio / Dashboard

El dashboard no debe ser una colección de gráficas. Debe responder qué requiere atención hoy.

### KPIs principales
- Cotizaciones pendientes de respuesta
- Proyectos activos
- Proyectos con desviación de costo
- OC pendientes/parciales
- Material crítico/bajo mínimo
- Proyectos por cerrar
- Utilidad estimada del mes
- Utilidad real del mes

### Bandejas de acción
- Proyectos con margen en riesgo
- OC con recepción parcial
- Proyectos con material extra no presupuestado
- Inventario por debajo del mínimo
- Cotizaciones sin seguimiento

### Vista por rol
Ingeniero: solo sus proyectos, cotizaciones y pendientes.
Almacén: recepciones, surtidos, devoluciones, mínimos.
Compras: requisiciones/OC y recepción pendiente.
Dirección: KPIs globales, utilidad, riesgos y comparativos.

## 2. Clientes

Lista con búsqueda rápida y tarjetas/resumen.

Ficha del cliente:
- Datos generales
- Contactos
- Cotizaciones
- Proyectos
- Ventas acumuladas
- Proyectos activos/cerrados
- Historial/seguimiento

Acción principal: Nueva cotización.

## 3. Cotizaciones

### Bandeja
Filtros por estado, promotor, cliente, fecha y moneda.

Estados:
- Borrador
- Cotizada
- En seguimiento
- Aprobada
- Cancelada

### Editor de cotización
Flujo por pasos en una sola experiencia:
1. Cliente y datos generales
2. Materiales
3. Mano de obra
4. Indirectos
5. Paquetes de ingeniería
6. Resumen
7. Enviar / aprobar

La barra lateral o superior mantiene visible:
- Venta al cliente
- Costo estimado
- Utilidad
- Margen
- Moneda / TC

### Materiales
Buscador por modelo, marca, descripción o código. Señalar existencia y costo vigente según permisos.

### Aprobación
Captura tipo de autorización, referencia/OC, fecha y observaciones. Al aprobar, genera proyecto y bloquea edición directa.

## 4. Proyectos

Es el centro del producto.

### Bandeja
Cada fila/tarjeta debe mostrar:
- Proyecto
- Cliente
- Promotor
- Estado
- Fecha aprobación
- Referencia/OC
- Avance operativo
- Margen presupuestado
- Margen real/proyectado si existe
- Alertas

### Ficha de proyecto
Pestañas:
- Resumen
- Presupuesto
- Materiales
- Compras
- Salidas/devoluciones
- Mano de obra
- Historial
- Rentabilidad

Acciones privilegiadas:
- Reabrir para modificación
- Cambiar promotor
- Cambiar cliente
- Cancelar
- Cerrar

### Timeline
Historial visual cronológico: creación, revisión, aprobación, OC, recepciones, salidas, devoluciones, MO, cambios administrativos, reapertura, cierre.

## 5. Inventario

### Catálogo
Columnas principales:
- Modelo
- Marca
- Descripción
- Existencia
- Mínimo
- Ubicación
- Costo vigente (según permiso)
- Estado

Acciones:
- Nuevo artículo
- Editar
- Ajuste autorizado
- Imágenes
- Desactivar
- Kardex

### Alta
Búsqueda automática de posibles duplicados mientras se captura. Antes de guardar, segunda validación obligatoria.

### Kardex
Cada artículo debe permitir entender entradas, salidas, devoluciones y ajustes, con usuario, proyecto/OC y costo histórico.

## 6. Compras

### Bandeja
- OC pendientes
- Parciales
- Completas
- Por proveedor
- Por proyecto

### OC
Encabezado:
- Proveedor
- Proyecto
- Requisitor
- Moneda
- Forma de pago
- Fecha
- Logística/paquetería opcional

Detalle por partida:
- Artículo
- Cantidad
- Precio
- Total
- Recibido
- Pendiente

Recepción física no se ejecuta aquí salvo usuarios autorizados; Almacén tiene su vista especializada.

## 7. Mano de obra

Pantalla rápida por proyecto.

Flujo:
Proyecto → actividad → empleado → fecha → horas/días → agregar.

Tabla inferior editable mientras proyecto esté abierto. Costos/hora ocultos para quien no tenga permiso.

## 8. Almacén

Debe sentirse como una aplicación aparte aunque use el mismo backend.

Pantalla inicial de dos grandes acciones:
- Recibir OC
- Surtir / devolver proyecto

### Recibir OC
Buscar/escanear OC → ver partidas pendientes → seleccionar partida → capturar cantidad recibida → guardar.

Recepción parcial conserva la OC en pendientes. Completa la elimina de la bandeja operativa, no del historial.

### Surtir proyecto
Proyecto → PIN → Salida/Devolución → escanear/buscar/seleccionar material → cantidad → preselección → técnico receptor → Guardar lote.

Permitir material extra no cotizado, claramente marcado.

## 9. Reportes

Separados de Dashboard.

Dashboard = decisiones.
Reportes = detalle, auditoría, filtros y exportación.

Reportes prioritarios:
- Rentabilidad por proyecto
- Material presupuestado vs real
- MO presupuestada vs real
- Inventario/Kardex
- OC y recepciones
- Material extra por proyecto
- Proyectos terminados
- Desempeño por promotor

## 10. Configuración

Secciones:
- Empresa
- Usuarios
- Roles y permisos
- Empleados
- Puestos
- Actividades
- Categorías
- Marcas
- Formas de pago
- Monedas / TC
- Módulos habilitados
- Paquetes de ingeniería

## Paquetes de ingeniería

Editor tipo receta:
- Nombre del paquete
- Unidad base
- Material/componente
- Factor por unidad
- Redondeo
- Merma

Ejemplo visual:
`Tubería 3/4" → por cada tramo: 2 abrazaderas + 2 pijas + 2 taquetes + 1 cople + 1 conector`

El cotizador puede aplicar el paquete, revisar el resultado y modificar antes de incorporar.

## Principios visuales

- Sidebar simple, no árboles interminables.
- Máximo una acción primaria destacada por pantalla.
- Estados con chips/semáforos consistentes.
- Formularios por bloques, no pantallas saturadas.
- Datos sensibles ocultos por permiso, no solo deshabilitados.
- Mobile/tablet especialmente cuidado para Almacén.
- Desktop prioritario para Cotizaciones, Compras, Dirección y Reportes.
- Todo cambio sensible debe tener feedback y auditoría.

## Primera maqueta funcional

La primera maqueta debe incluir:
- Dashboard
- Bandeja de proyectos
- Ficha de proyecto con rentabilidad
- Inventario
- Vista Almacén

No necesita backend todavía. Debe trabajar con datos demo y servir para validar navegación antes de construir la base de datos definitiva.

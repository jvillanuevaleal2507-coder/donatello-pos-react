# Atlas Integrador — Arquitectura funcional V1

> Documento de diseño derivado del levantamiento operativo del sistema actual de un integrador. No pretende copiar su interfaz: conserva las reglas operativas valiosas y corrige fricciones, controles débiles y trazabilidad insuficiente.

## 1. Principio del producto

Atlas Integrador será un sistema operativo especializado para integradores de CCTV, control de acceso, redes, WiFi, cableado, fibra y servicios relacionados.

La unidad central no es la venta aislada: es el **proyecto**.

Flujo principal:

**Cliente/Prospecto → Cotización/Análisis → Aprobación → Proyecto → Compras/Recepciones → Inventario → Mano de obra → Cierre financiero → Rentabilidad real**

Objetivo clave: responder en cualquier momento:

- ¿Qué se cotizó?
- ¿Qué se autorizó?
- ¿Qué se compró y a qué costo real?
- ¿Qué se recibió?
- ¿Qué material salió y quién lo recibió?
- ¿Qué regresó?
- ¿Qué mano de obra se utilizó?
- ¿Cuánto se esperaba ganar?
- ¿Cuánto se ganó realmente?

## 2. Seguridad y permisos

El sistema debe separar tres conceptos.

### 2.1 Rol
Define qué acciones puede ejecutar un usuario.

Roles base configurables:
- Propietario / Dirección
- Administración
- Operaciones
- Ingeniero / Promotor
- Compras
- Almacén
- Finanzas
- Facturación
- Caja / Tienda
- Técnico

### 2.2 Alcance de registros
Un ingeniero/promotor normal ve únicamente sus proyectos asignados. Los roles globales autorizados pueden ver todos los proyectos.

### 2.3 Permisos sensibles
Independientes del rol general:
- Ver costos
- Ver márgenes/utilidad
- Ver costo/hora de empleados
- Modificar existencia
- Reabrir proyecto
- Cancelar proyecto
- Cambiar promotor
- Cambiar cliente
- Cerrar financieramente
- Facturar
- Autorizar ajustes

Toda operación sensible genera auditoría: usuario/sesión, fecha-hora, valor anterior, valor nuevo, motivo cuando aplique y entidad afectada.

## 3. Clientes y prospectos

Ficha con datos fiscales/comerciales, contactos, historial de cotizaciones y proyectos, ventas acumuladas, proyectos en proceso/cerrados y actividad reciente.

El cliente se selecciona antes de iniciar una nueva cotización.

## 4. Cotizador / análisis de precios

Flujo continuo propuesto:

**Cliente → Datos generales → Materiales → Mano de obra → Indirectos → Resumen → Aprobación**

### Materiales
- Marca
- Modelo
- Descripción
- Categoría
- Cantidad
- Costo vigente al momento de cotizar
- Moneda
- Precio al cliente
- Margen/utilidad

### Mano de obra presupuestada
Se selecciona una actividad y los recursos/personas requeridos. Los costos/hora son información restringida.

### Indirectos
Configurables por empresa y/o proyecto.

### Aprobación
Al aprobar se registra:
- Tipo de autorización: OC, anticipo, contrato u otro
- Número/referencia de OC
- Fecha de autorización
- Observaciones

Una cotización aprobada queda bloqueada para edición normal.

## 5. Reapertura y revisiones

No se utilizará un cierre ficticio para modificar un proyecto aprobado.

Acción privilegiada: **Reabrir para modificación**.

Debe:
- solicitar motivo;
- devolver presupuesto/cotización a estado editable;
- crear una nueva revisión (Rev 0, Rev 1, Rev 2...);
- preservar completamente salidas, devoluciones, compras, recepciones y mano de obra históricas;
- registrar quién reabrió y cuándo;
- exigir una nueva aprobación al terminar los cambios.

Cambiar promotor NO crea revisión. Solo transfiere responsabilidad/acceso y registra promotor anterior, nuevo, autor del cambio, fecha y motivo.

## 6. Inventario maestro

Campos base:
- Código interno / código de barras
- Marca
- Modelo
- Descripción
- Categoría(s)
- Unidad
- Unidad/clave SAT opcional según configuración fiscal
- Ubicación
- Existencia
- Mínimo
- Máximo
- Costo vigente
- Moneda
- Precio tienda opcional
- Imágenes opcionales
- Estado activo/inactivo

### Prevención de duplicados
Antes de guardar un artículo se busca coincidencia por modelo, marca, código y descripción.

Si existe una coincidencia suficientemente fuerte, el sistema **bloquea el alta duplicada**, no solo muestra una advertencia. Un usuario privilegiado podrá resolver una excepción explícita con justificación y auditoría.

### Modificación de existencia
Solo usuarios autorizados pueden sumar/restar inventario manualmente. Cada ajuste requiere registro de:
- existencia anterior;
- ajuste;
- existencia resultante;
- usuario/sesión;
- fecha-hora;
- motivo.

Editar descripción, categoría o ubicación no debe alterar movimientos históricos.

### Eliminación
Si el artículo nunca ha sido utilizado y cumple las reglas de eliminación, se mostrará confirmación explícita antes de eliminar.

Si el artículo ya tiene cualquier relación histórica (proyecto, cotización aprobada, compra, recepción, salida, devolución, venta u otro movimiento), **no puede eliminarse**. Se desactiva/archiva para conservar integridad histórica.

## 7. Costos de inventario

El costo utilizado al cotizar queda congelado en la revisión de la cotización.

Cuando Compras genera una OC y Almacén recibe el producto, el costo real recibido actualiza el costo vigente del artículo conforme a la política contable/configurada.

Las salidas posteriores toman el costo vigente/real correspondiente al movimiento, alimentando el costo real del proyecto.

Una actualización de costo NO reescribe cotizaciones, salidas o proyectos históricos.

## 8. Recepción de órdenes de compra

Almacén puede consultar/scanear una OC y ver sus partidas pendientes.

Por partida:
- Cantidad comprada
- Cantidad recibida acumulada
- Cantidad pendiente
- Precio/costo de compra
- Moneda

Se permiten recepciones parciales.

Ejemplo: compradas 10, recibidas 6 → quedan 4 pendientes y la OC sigue visible. Cuando todas las partidas cumplen **recibido = comprado**, la OC sale de la bandeja de pendientes y pasa al historial de recibidas/completadas; no se elimina.

Cada recepción aumenta inventario y registra trazabilidad.

## 9. Salidas y devoluciones de proyecto

Acceso rápido desde el sistema principal y una interfaz simplificada/kiosco para Almacén pueden operar sobre el mismo backend y la misma bitácora.

### Identificación
1. Capturar/escanear número completo de proyecto.
2. Validar PIN propio del proyecto.
3. Mostrar cliente, proyecto y materiales relacionados.

### Salida
Permite tres vías:
- escanear artículo;
- buscar artículo;
- seleccionar artículo cotizado del proyecto.

También permite agregar material extra no presupuestado, identificado explícitamente como extra.

El sistema valida existencia antes de permitir la preselección/salida. Nunca permite stock negativo salvo una política administrativa explícita (deshabilitada por defecto).

Se pueden preseleccionar varios artículos, modificar cantidades y quitar partidas antes de guardar.

Antes de guardar se selecciona **a qué empleado/técnico se entrega el material**.

Un solo Guardar genera la salida agrupada, con detalle por artículo, proyecto, receptor, usuario de almacén y fecha-hora.

### Devolución
Proceso inverso ligado al proyecto. Incrementa inventario y reduce/ajusta el consumo real del proyecto conservando tanto la salida original como la devolución.

## 10. Mano de obra real

Los empleados provienen del catálogo de empleados/configuración.

Para cada proyecto se registra:
- actividad;
- puesto/recurso;
- empleado específico;
- fecha;
- horas o días/cantidad.

Se permite agregar, editar o borrar registros según permisos, siempre con auditoría cuando impacten el costo real.

La mano de obra real alimenta la rentabilidad final del proyecto.

## 11. Compras

Módulo base:
- Orden de compra
- Paquetería/datos logísticos
- Editar compra
- Buscar proveedor
- Historial por proveedor
- Estado recibido/parcial/pendiente
- Estado de pago cuando Finanzas lo proporcione

La recepción física pertenece a Almacén; la generación/edición de OC pertenece a Compras según permisos.

## 12. Finanzas y facturación

Deben existir como módulos aislados por permisos. Operaciones no necesita acceso a información financiera sensible solo porque tenga control de proyectos.

### Finanzas
Incluye conceptualmente:
- Gastos
- Cuentas por cobrar
- Bancos/movimientos
- Cierre financiero de proyecto

El cierre real de proyecto corresponde a Finanzas. Debe validar que existan/estén conciliados los movimientos requeridos de materiales y mano de obra.

### Facturación
Se diseñará como módulo integrable con proveedor autorizado/PAC y obligaciones fiscales aplicables. No forma parte del núcleo inicial del MVP hasta definir integración y requisitos.

## 13. Cierre y rentabilidad real

Un proyecto cerrado debe conservar presupuesto y realidad.

Indicadores ejecutivos mínimos:
- Venta/cotizado al cliente
- Material presupuestado vs real
- Mano de obra presupuestada vs real
- Indirectos presupuestados vs reales
- Utilidad bruta
- Utilidad después de indirectos
- Margen presupuestado vs margen real

Debe existir drill-down a todos los movimientos que explican cada cifra.

## 14. Reportes

Reportes consolidados por módulo, con filtros de periodo, cliente, promotor, proyecto y estado cuando aplique.

Base funcional:
- Cartera de clientes
- Inventario
- Análisis/cotizaciones
- Mano de obra por proyecto
- Inventario por proyecto
- Proyectos terminados
- Órdenes de compra
- Cuentas por pagar
- Gastos operativos
- Cuentas por cobrar
- Mano de obra
- Movimientos bancarios
- Cartera de proveedores
- Límites de inventario
- Cambios/ajustes de inventario
- Detalle/kardex de artículo

La UI priorizará KPIs y excepciones; las tablas completas quedarán como detalle/exportación.

## 15. Configuración

Catálogos configurables:
- Actividades
- Puestos
- Empleados
- Categorías
- Marcas
- Formas de pago
- Tipo de cambio fijo cuando aplique
- Usuarios
- Roles/permisos
- Módulos habilitados
- Datos de empresa

## 16. Paquetes de ingeniería

Función diferenciadora.

Un paquete representa una regla de materiales auxiliares derivada de una actividad o unidad de instalación.

Ejemplo conceptual: instalar X metros/tramos de tubería puede calcular automáticamente abrazaderas, pijas, taquetes, coples, conectores y demás accesorios conforme a reglas configuradas.

Cada regla debe tener:
- actividad/base;
- unidad de cálculo;
- componente;
- cantidad/factor;
- regla de redondeo;
- merma opcional;
- vigencia/versión.

El resultado se propone al cotizador, pero el usuario puede revisarlo antes de incorporarlo.

### Evolución con Atlas IA
En una fase posterior, Atlas podrá interpretar el alcance en lenguaje natural, seleccionar paquetes, sugerir cantidades, detectar omisiones y explicar por qué recomienda cada material. La IA propone; las reglas determinísticas y el usuario validan.

## 17. Imágenes de artículos

Función opcional. No debe ser requisito para crear inventario.

Se podrán subir imágenes y posteriormente integrar búsqueda/asistencia automática para localizar imágenes o fichas técnicas del modelo. Siempre habrá validación humana antes de asociar contenido encontrado externamente.

## 18. Estados conceptuales del proyecto

- Cotizado
- Aprobado
- En ejecución
- Reabierto para modificación
- Terminado / cerrado financieramente
- Cancelado

Cancelar nunca borra información. Registra motivo, usuario, autorización y fecha.

## 19. Auditoría transversal

Entidades críticas tendrán historial inmutable de eventos. Como mínimo:
- inventario y costos;
- compras/recepciones;
- salidas/devoluciones;
- cambios de promotor/cliente;
- reaperturas;
- aprobaciones/cancelaciones/cierres;
- mano de obra;
- permisos y acciones administrativas.

La filosofía es: **corregir sin borrar la historia**.

## 20. Alcance del MVP comercial

Primera versión vendible:
1. Dashboard operativo
2. Clientes/prospectos
3. Cotizador/análisis de precios
4. Proyectos y revisiones
5. Inventario + kardex + controles de duplicado
6. Compras y recepciones parciales
7. Salidas/devoluciones por proyecto y PIN
8. Mano de obra real
9. Proveedores
10. Rentabilidad por proyecto
11. Reportes básicos
12. Usuarios, roles, alcance y auditoría
13. Paquetes de ingeniería determinísticos

Posterior al MVP:
- Facturación fiscal/PAC
- Bancos avanzados
- IA operacional
- búsqueda inteligente de fichas/imágenes
- integraciones con distribuidores
- app móvil/técnicos/evidencias
- mantenimientos recurrentes
- garantías/RMA
- automatizaciones avanzadas

## 21. Criterio de diseño

Atlas Integrador debe reducir clics sin destruir la separación de funciones. No se copiarán menús fragmentados únicamente por herencia del sistema actual, pero tampoco se fusionarán procesos que deben permanecer separados por control interno.

El resultado debe sentirse como un sistema moderno de operación de proyectos, no como un ERP genérico adaptado a la fuerza.

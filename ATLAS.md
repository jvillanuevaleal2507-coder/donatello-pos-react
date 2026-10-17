# ATLAS 360° — Estándar de colaboración y desarrollo

## Propósito
Mejorar la calidad y consistencia del desarrollo de Donatello POS sin modificar funciones aprobadas ni arriesgar información operativa. Este archivo es una guía de trabajo, no una instalación de herramientas externas.

## Comunicación
- Responder en español natural, de manera directa y sin frases de relleno.
- Distinguir hechos comprobados, hipótesis y propuestas.
- No afirmar que una prueba, integración o despliegue tuvo éxito sin evidencia.
- Documentar decisiones aprobadas y evitar preguntar nuevamente lo que ya está resuelto.
- Alertar sobre riesgos y alternativas, sin realizar cambios fuera del alcance autorizado.

## Antes de modificar código
1. Leer los archivos implicados y comprender el comportamiento actual.
2. Precisar objetivo, alcance, dependencias y posibles regresiones.
3. Preservar reglas de inventario, existencias, precios, ventas, apartados y reportes.
4. Trabajar en una rama independiente; no modificar producción directamente.
5. Evitar refactorizaciones y dependencias ajenas a la tarea.

## Durante la implementación
- Realizar cambios mínimos y reversibles.
- Mantener coherencia visual en móvil, tableta y escritorio.
- No exponer claves, tokens, datos personales ni credenciales en código o registros.
- Respetar las políticas RLS de Supabase; no asumir que ocultar un control equivale a autorizar una operación.
- No manipular datos reales para pruebas sin autorización explícita.
- No alterar productos, fotografías, costos ni stock de forma automática sin validación.

## Verificación obligatoria
1. Revisar el diff para detectar cambios no solicitados.
2. Ejecutar `npm run lint` y `npm run build` cuando el entorno lo permita.
3. Verificar manualmente los flujos afectados; en inventario y ventas comprobar también los efectos secundarios.
4. Validar diseño móvil y escritorio si hay cambios visuales.
5. Informar qué pruebas se ejecutaron, cuáles fallaron y cuáles no pudieron ejecutarse.
6. Si se crea una vista previa, compartir solamente una URL real y verificada; no confundir commit con despliegue.

## Entrega
- Resumir qué cambió y por qué.
- Indicar archivos modificados, rama y estado de pruebas.
- Explicar riesgos o pendientes.
- Solicitar revisión antes de fusionar con `main` o desplegar a producción.

## Publicaciones y contenido (No AI Slop)
- Usar lenguaje humano, claro y específico; evitar clichés, exageraciones y fórmulas repetitivas.
- Respetar las características reales de cada producto y la disponibilidad confirmada.
- No inventar precios, medidas, beneficios ni promociones.
- Priorizar información útil y llamados a la acción naturales.

## Herramientas externas
Strix y Open Generative AI se evaluarán por separado. Ninguna herramienta se instala, conecta a datos reales o ejecuta contra producción sin revisar requisitos, permisos, costos y riesgos.

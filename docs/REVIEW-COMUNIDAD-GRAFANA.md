# Revision de Publicacion Comunitaria - ToBeFlow Chart Panel

Fecha: 2026-03-16
Ruta revisada: /mnt/data/infra/grafana/dev/plugins/svg-flow-panel
Rol simulado: revisor senior extremadamente exigente del ecosistema de plugins de Grafana

## Veredicto final

Rechazado por ahora.

## Resumen ejecutivo

El plugin intenta resolver un problema real y valioso: visualizacion operativa sobre SVG para infraestructura, con mapeo entre elementos graficos, hosts y metricas. Esa propuesta tiene mercado dentro de Grafana y, en principio, justifica la existencia del plugin.

El rechazo no viene por falta de idea ni por falta de trabajo. Viene porque el nivel actual de fiabilidad, seguridad, coherencia documental y disciplina de calidad aun no llega al umbral que deberia exigirse a un plugin comunitario. Compila y genera build, pero no sostiene su propia base funcional ni su cadena de calidad.

## Estado validado

Se ejecutaron comprobaciones reales sobre el proyecto:

- `npm test -- --runInBand`: falla
- `npm run typecheck`: pasa
- `npm run build`: pasa
- `npm run lint`: falla porque `eslint` no esta instalado

Resultado exacto de tests:

- 3 suites fallidas
- 8 tests fallidos
- 11 suites totales
- 244 tests totales

## Motivos de rechazo

### 1. La base funcional no esta cerrada

El plugin falla en areas que no son perifericas, sino nucleares:

- extraccion de metricas esperadas por host
- conversion y deteccion de porcentajes
- calculo de severidad
- aplicacion de umbrales personalizados
- manejo de dataframes vacios
- adaptacion visual de `light-dark(rgb(...), rgb(...))`

Evidencia directa en tests:

- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L101)
- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L136)
- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L264)
- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L393)
- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L408)
- [src/utils/__tests__/integration.test.ts](../src/utils/__tests__/integration.test.ts#L469)
- [src/utils/__tests__/svgSanitizer.test.ts](../src/utils/__tests__/svgSanitizer.test.ts#L119)

Impacto:

- colores potencialmente incorrectos
- severidad incorrecta
- metricas ausentes o mal interpretadas
- perdida de confianza total en el panel

Cambio minimo para salvarlo:

- dejar la suite en verde
- alinear implementacion, documentacion y expectativas de tests

### 2. La integracion draw.io no esta endurecida de forma aceptable

El codigo afirma que solo acepta mensajes de diagrams.net, pero no valida realmente `evt.origin` y usa `postMessage` con `*` como destino.

Evidencia:

- comentario engañoso en [src/components/DrawioEditorButton.tsx](../src/components/DrawioEditorButton.tsx#L81)
- `postMessage(..., '*')` en [src/components/DrawioEditorButton.tsx](../src/components/DrawioEditorButton.tsx#L92)
- `postMessage(..., '*')` en [src/components/DrawioEditorButton.tsx](../src/components/DrawioEditorButton.tsx#L120)
- `postMessage(..., '*')` en [src/components/DrawioEditorButton.tsx](../src/components/DrawioEditorButton.tsx#L126)
- escucha global en [src/components/DrawioEditorButton.tsx](../src/components/DrawioEditorButton.tsx#L158)

Impacto:

- superficie de confianza mal definida
- objecion de seguridad inmediata en una revision seria
- riesgo de comportamiento no confiable alrededor del editor externo

Cambio minimo para salvarlo:

- validar `evt.origin` contra origen esperado
- usar `targetOrigin` explicito en `postMessage`
- documentar claramente la dependencia externa

### 3. La cadena de calidad esta rota

El proyecto define lint, pero no puede ejecutarlo porque falta `eslint`.

Evidencia:

- script en [package.json](../package.json#L11)

Impacto:

- no hay control reproducible de calidad basica
- la revision comunitaria interpreta esto como mantenimiento incompleto
- dificulta CI y colaboracion externa

Cambio minimo para salvarlo:

- instalar y configurar `eslint`
- dejar `npm run lint` ejecutable y limpio

### 4. La documentacion no es totalmente confiable

Hay contradicciones y enlaces rotos entre README, guia de usuario, manual de instalacion y manifiesto.

Evidencia:

- README orientado a Grafana 11 en [README.md](../README.md#L13)
- guia indicando Grafana >= 11.0.0 en [docs/USER-GUIDE.md](./USER-GUIDE.md#L34)
- guia con referencia rota a `INSTALL.md` en [docs/USER-GUIDE.md](./USER-GUIDE.md#L40)
- manual diciendo compatibilidad Grafana >= 10.0.0 en [docs/MANUAL-INSTALACION.md](./MANUAL-INSTALACION.md#L5)
- manifiesto declarando `>=10.0.0` en [src/plugin.json](../src/plugin.json#L20)

Impacto:

- instalacion confusa
- expectativas tecnicas incoherentes
- soporte innecesario
- baja confianza de cara a catalogo comunitario

Cambio minimo para salvarlo:

- unificar version minima soportada
- corregir referencias de archivos
- revisar toda la documentacion contra el estado real del plugin

### 5. El endurecimiento general aun es insuficiente

No es el peor problema, pero suma mal. El panel abre enlaces con `window.open` y hay varios flujos basados en eventos globales de `window` que funcionan como solucion practica, no como arquitectura especialmente robusta.

Evidencia:

- apertura de enlaces en [src/components/SvgFlowPanel.tsx](../src/components/SvgFlowPanel.tsx#L627)
- eventos globales en [src/hooks/useSvgFlowHooks.ts](../src/hooks/useSvgFlowHooks.ts#L397)
- eventos globales en [src/components/CellMappingsEditor.tsx](../src/components/CellMappingsEditor.tsx#L211)
- eventos globales en [src/components/SvgFlowPanel.tsx](../src/components/SvgFlowPanel.tsx#L439)

Impacto:

- mayor fragilidad conceptual
- mas puntos de acoplamiento implícito
- peor mantenibilidad a medio plazo

Cambio minimo para salvarlo:

- revisar fronteras entre editor, panel y overlays
- reducir acoplamiento global donde sea viable

## Fallos importantes no bloqueantes

### UX e intuicion

El plugin ofrece mucha funcionalidad real, pero la experiencia parece demasiado cargada para usuario medio. La cantidad de opciones, precedencias y modos hace que el producto exija demasiado conocimiento interno para ser considerado intuitivo de primeras.

Señales:

- amplitud funcional muy alta en [README.md](../README.md#L35)
- guia extensa y densa en [docs/USER-GUIDE.md](./USER-GUIDE.md#L66)

### Mezcla intensa de React con DOM imperativo

Para un panel SVG esto puede ser razonable, pero el grado actual es alto:

- inyeccion de HTML en [src/components/SvgFlowPanel.tsx](../src/components/SvgFlowPanel.tsx#L388)
- tooltips por `innerHTML` en [src/utils/tooltipManager.ts](../src/utils/tooltipManager.ts#L285)
- tooltips por `innerHTML` en [src/utils/tooltipManager.ts](../src/utils/tooltipManager.ts#L387)

No bloquea por si solo, pero complica razonamiento, pruebas y mantenimiento.

### Deriva entre marketing y realidad

Hay afirmaciones fuertes que hoy quedan por encima del nivel real de confianza del proyecto:

- alternativa moderna y mantenida en [README.md](../README.md#L13)
- cifra de tests documentada en [README.md](../README.md#L243)

No es un defecto tecnico puro, pero si una señal de producto aun no calibrado para publicacion.

## Evaluacion numerica

- Utilidad real: 8/10
- UX e intuicion: 5/10
- Integracion con Grafana: 6/10
- Calidad tecnica: 4/10
- Seguridad y fiabilidad: 4/10
- Documentacion: 6/10
- Madurez para comunidad: 4/10

## Señales de producto inmaduro

- build y typecheck correctos, pero pruebas funcionales nucleares fallando
- lint definido pero no operativo
- documentacion amplia pero no totalmente fiable
- integracion externa no endurecida adecuadamente
- demasiada ambicion funcional sobre una base aun no cerrada

## Comparacion con el estandar esperado

No esta al nivel de los plugins comunitarios serios que transmiten confianza tecnica desde el primer contacto. Tiene mejor propuesta que muchos plugins flojos, pero sigue pareciendo una base prometedora en evolucion, no un producto listo para exponer publicamente con expectativas de soporte y adopcion.

## Plan de rescate priorizado

### Prioridad 0 - Obligatorio antes de publicar

1. Corregir la suite de tests hasta dejarla en verde.
2. Resolver la inconsistencia entre extraccion de metricas, umbrales, severidad y tipos de dato.
3. Endurecer draw.io: `origin` valido, `targetOrigin` explicito, control de mensajes.
4. Instalar y configurar `eslint`; dejar `npm run lint` funcionando.
5. Unificar compatibilidad minima de Grafana en manifiesto y documentacion.
6. Corregir el enlace roto a instalacion y revisar README/docs completos.

### Prioridad 1 - Necesario para no dar mala impresion

1. Simplificar la UX del editor o al menos hacer mas obvios los defaults y la jerarquia de opciones.
2. Reducir acoplamiento mediante eventos globales cuando sea posible.
3. Revisar aperturas de enlaces y otros bordes de seguridad menores.
4. Reescribir claims del README para que reflejen estado real, no aspiracional.

### Prioridad 2 - Deseable para aspirar a muy buen nivel

1. Añadir smoke tests de integracion de panel real.
2. Documentar casos de uso curados y limites conocidos.
3. Reducir DOM imperativo donde no sea estrictamente necesario.
4. Añadir una matriz realista de compatibilidad por datasource y escenario.

## Hoja de trabajo accionable

### Bloque A - Recuperar confianza funcional

Objetivo: dejar de romper el nucleo del plugin.

Tareas:

1. Revisar `applyDataType` y decidir contrato final de `auto`, `pct100` y `pct1`.
2. Reconciliar expectativas de tests con comportamiento real de `extractMetrics`.
3. Revisar `computeHostSeverity` y thresholds personalizados con casos de borde.
4. Corregir `adaptSvgForDarkTheme` para `light-dark(rgb(...), rgb(...))`.
5. Ejecutar de nuevo `npm test -- --runInBand` hasta dejarlo limpio.

### Bloque B - Cerrar seguridad y fronteras de confianza

Objetivo: eliminar objeciones faciles en revision.

Tareas:

1. Validar `evt.origin` en el editor embebido.
2. Reemplazar `'*'` por origen explicito en `postMessage`.
3. Revisar sanitizacion y documentar limites.
4. Endurecer comportamiento de enlaces externos.

### Bloque C - Profesionalizar publicacion

Objetivo: que el repositorio parezca mantenible por terceros.

Tareas:

1. Instalar ESLint y dejar reglas basicas activas.
2. Corregir documentacion rota o inconsistente.
3. Añadir pasos de validacion en README o contribucion.
4. Alinear claims de marketing con estado real del producto.

## Decision final de publicacion

Yo no lo publicaria hoy.

Motivo: porque aun no ofrece la combinacion minima de fiabilidad, seguridad, coherencia documental y disciplina de calidad que se espera de un plugin comunitario serio, aunque su propuesta de valor si merezca seguir invirtiendo en el.

## Siguiente paso recomendado

Si quieres usar este documento como hoja de ruta, el orden correcto es:

1. arreglar tests rotos
2. cerrar draw.io y eventos de confianza
3. restaurar lint
4. unificar documentacion
5. volver a evaluar publicacion
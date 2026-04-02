# ToBeFlow Chart Panel — User Guide

Guia completa de uso del plugin **ToBeFlow Chart Panel** para Grafana 11.x.

---

## Indice

1. [Introduccion](#introduccion)
2. [Instalacion](#instalacion)
3. [Carga de diagramas SVG](#carga-de-diagramas-svg)
4. [Cell Mappings](#cell-mappings)
5. [Metricas y campos](#metricas-y-campos)
6. [Tipos de dato](#tipos-de-dato)
7. [Agregaciones](#agregaciones)
8. [Umbrales (Thresholds)](#umbrales-thresholds)
9. [Value Mappings](#value-mappings)
10. [Texto en elementos SVG](#texto-en-elementos-svg)
11. [Visibilidad de elementos](#visibilidad-de-elementos)
12. [Tooltips configurables](#tooltips-configurables)
13. [Queries dinamicas (Terms Aggregation)](#queries-dinamicas)
14. [Per-metric hostField y filterPattern](#per-metric-hostfield-y-filterpattern)
15. [Soporte draw.io](#soporte-drawio)
16. [Debug Mode](#debug-mode)
17. [Opciones del panel (referencia)](#opciones-del-panel)
18. [Estructura del proyecto](#estructura-del-proyecto)

---

## Introduccion

ToBeFlow Chart Panel es un plugin de panel para Grafana que permite visualizar infraestructura sobre diagramas SVG personalizados. Cada elemento del SVG se vincula a un host y a metricas especificas del datasource, cambiando de color en tiempo real segun los valores recibidos.

**Requisitos**: Grafana >= 11.0.0

---

## Instalacion

Consulta [INSTALL.md](../INSTALL.md) para instrucciones detalladas de instalacion y despliegue.

Resumen rapido:

```bash
cd plugins/svg-flow-panel
npm install
npm run build
# dist/ se monta como volumen en Grafana
docker restart grafana-lab
```

Variable de entorno necesaria:
```
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=tobeit-tobeflow-panel
```

---

## Carga de diagramas SVG

### SVG inline

Pega el contenido SVG directamente en la opcion **"SVG Source"** del panel. El contenido se sanitiza automaticamente con DOMPurify para evitar XSS.

### SVG por URL

Apunta a un fichero `.svg` externo en **"SVG URL"**. El plugin lo descarga y renderiza.

### draw.io (ver seccion dedicada)

El plugin detecta automaticamente ficheros `.drawio` (XML de diagrams.net) y los convierte a SVG internamente.

**Importante**: Cada elemento SVG que quieras monitorizar debe tener un atributo `data-cell-id` con un identificador unico. Los editores de SVG como draw.io lo generan automaticamente; en SVGs manuales, anadelo a la etiqueta `<g>`, `<rect>`, o similar.

---

## Cell Mappings

Los Cell Mappings son el nucleo del plugin. Cada mapping vincula un elemento SVG a un host y sus metricas.

### Crear un mapping

| Metodo | Descripcion |
|---|---|
| **+ Mapping** | Crea un mapping vacio manualmente |
| **Seleccionar del SVG** | Modo pick interactivo — click en un elemento del diagrama |
| **Fijar Host** (icono link) | Reasigna el `data-cell-id` haciendo click en otro elemento |

### Campos de un mapping

| Campo | Descripcion |
|---|---|
| **Cell ID** | Atributo `data-cell-id` del elemento SVG |
| **Host** | Hostname del servidor en el datasource |
| **Label** | Etiqueta descriptiva (mostrada en el editor) |
| **refId** | Query de Grafana a usar (A, B, C...). Vacio = todas |
| **hostField** | Campo host alternativo (ej: `monitor.name`) |
| **Data Link** | URL de navegacion. Soporta `{{host}}` y `{{cellId}}` |
| **Visibility** | Modo de visibilidad del elemento SVG |
| **Metrics** | Lista de metricas a monitorizar |

### Autodiscover

El boton "Auto" en cada mapping anade un conjunto predefinido de metricas comunes:
- CPU (`system.cpu.total.norm.pct`)
- RAM (`system.memory.actual.used.pct`)
- Estado (`summary.up` / `monitor.status`)
- Disco (`system.filesystem.used.pct`)

Es solo un shortcut inicial. Puedes modificar, eliminar o anadir metricas despues.

### Cards colapsables

Cada mapping se muestra como una card colapsable. El header muestra Cell ID, hostname y numero de metricas. Usa el chevron para expandir/contraer.

### Boton Localizar (ojo)

- **Hover sostenido**: el elemento SVG parpadea con pulso azul infinito
- **Click**: 3 pulsos azules y se detiene

---

## Metricas y campos

Cada mapping puede tener multiples metricas. El dropdown muestra **todos los campos disponibles** del datasource activo, obtenidos dinamicamente de los DataFrames.

Tags de tipo en el desplegable:
- `[N]` Numerico
- `[S]` String
- `[D]` Date/Time
- `[B]` Boolean

Tambien puedes escribir un nombre de campo personalizado si no aparece en la query actual.

### Propiedades de cada metrica

| Propiedad | Descripcion |
|---|---|
| **Field** | Campo del datasource (ej: `system.cpu.total.norm.pct`) |
| **Alias** | Nombre amigable para tooltip (ej: "CPU") |
| **Data Type** | Formato de visualizacion del valor |
| **Aggregation** | Tipo de agregacion (default: `last`) |
| **Thresholds** | Umbrales individuales (opcionales) |
| **Value Mappings** | Transformacion de valores (opcionales) |
| **Text Mode** | Modo de texto SVG (`off`, `metric`, `custom`) |
| **Text Template** | Plantilla para textMode=custom |
| **hostField** | Campo host alternativo para esta metrica |
| **filterPattern** | Filtro wildcard para metricas string |
| **refId** | Query especifica de esta metrica |

---

## Tipos de dato

| Tipo | Comportamiento | Ejemplo |
|---|---|---|
| `auto` | Valor nativo sin transformacion | `0.85` |
| `pct100` | Valor numerico con sufijo `%` | `85%` |
| `pct1` | Multiplica por 100 y muestra como `%` | `0.85` → `85%` |
| `number` | Valor numerico directo | `1024` |
| `bytes` | Formatea a B/KB/MB/GB/TB | `1073741824` → `1 GB` |
| `text` | Cadena de texto | `"running"` |
| `boolean` | Muestra SI/NO | `1` → `SI` |
| `date` | Fecha legible | timestamp → `2026-03-03 20:00` |
| `short` | Formato corto (K/M/B) | `1500` → `1.5K` |
| `ms` | Milisegundos | `1500` → `1500 ms` |
| `seconds` | Segundos | `120` → `120 s` |

---

## Agregaciones

Cuando un host tiene multiples valores para un campo (por ejemplo, varias filas con distinto timestamp), el plugin necesita reducirlos a un solo valor. La agregacion se configura **por metrica**.

| Agregacion | Descripcion |
|---|---|
| `last` | Ultimo valor del array (default) |
| `lastNotNull` | Ultimo valor no-nulo ni NaN |
| `first` | Primer valor |
| `firstNotNull` | Primer valor no-nulo ni NaN |
| `min` | Valor minimo |
| `max` | Valor maximo |
| `sum` | Suma de todos los valores |
| `avg` | Media aritmetica |
| `count` | Numero de valores |
| `delta` | Diferencia entre ultimo y primero |
| `range` | Diferencia entre maximo y minimo |
| `diff` | Diferencia absoluta entre los dos ultimos |
| `timeOfLastPoint` | Mismo que `last` (compatibilidad) |

---

## Umbrales (Thresholds)

### Dos niveles de prioridad

1. **Umbrales por metrica**: definidos directamente en cada metrica. **Maxima prioridad**.
2. **Umbrales globales** (Global Thresholds): editor visual en la seccion "Cell Mappings". Se aplican a metricas **sin umbrales propios**.

### Editor de umbrales por metrica

Cada metrica puede tener sus propios umbrales con:
- **Valor**: umbral numerico
- **Color**: color personalizado (color picker)
- **Operador**: `>`, `>=`, `<`, `<=`, `=`, `!=`

### Editor global

Editor visual estilo Grafana nativo:
- Boton "+ Add threshold" para anadir
- Circulo de color con color picker
- Valor numerico editable
- "Base" siempre presente como color por defecto
- Toggle Absolute / Percentage

### Logica de evaluacion

Los umbrales se evaluan `>=` de mayor a menor. Si el valor es >= 85 usa rojo, si es >= 60 usa naranja, el resto usa el color base.

### Coloreado de elementos

- Solo se colorean elementos con metricas asignadas
- Sin datos → gris (`SIN_DATOS`)
- El color final es el del **peor umbral** de todas las metricas
- Severidad critica activa animacion de pulso CSS

---

## Value Mappings

Transforman valores del datasource en textos personalizados. Util para estados, booleanos, o cualquier valor discreto.

### Tipos de value mapping

| Tipo | Descripcion | Ejemplo |
|---|---|---|
| `value` | Match exacto de valor | `"0"` → `"NOK"`, `"1"` → `"OK"` |
| `range` | Rango numerico (`from` / `to`) | `0-50` → `"Bajo"`, `50-100` → `"Alto"` |
| `regex` | Patron regex | `/running/` → `"Activo"` |
| `comparison` | Operador de comparacion | `> 80` → `"Critico"` |

### Campos de un value mapping

| Campo | Descripcion |
|---|---|
| **type** | Tipo: `value`, `range`, `regex`, `comparison` |
| **value** | Valor a comparar (para `value` y `comparison`) |
| **from** / **to** | Rango (para `range`) |
| **pattern** | Regex (para `regex`) |
| **op** | Operador (para `comparison`): `<`, `>`, `<=`, `>=`, `=`, `!=` |
| **text** | Texto a mostrar |
| **color** | Color opcional (hex) |

### Ejemplo: estado de servicio

```json
[
  { "type": "value", "value": "1", "text": "OK", "color": "#73BF69" },
  { "type": "value", "value": "0", "text": "NOK", "color": "#F2495C" }
]
```

---

## Texto en elementos SVG

Cada metrica puede escribir texto directamente sobre el elemento SVG.

### Modos de texto (textMode)

| Modo | Comportamiento |
|---|---|
| `off` | No escribe texto (default) |
| `metric` | Muestra el valor formateado de la metrica |
| `custom` | Usa una plantilla personalizada |

### Variables para textTemplate

Cuando `textMode = 'custom'`, la plantilla soporta:

| Variable | Descripcion |
|---|---|
| `{{value}}` | Valor numerico formateado |
| `{{alias}}` | Alias de la metrica |
| `{{field}}` | Nombre del campo |
| `{{status}}` | Texto del value mapping (si aplica) |
| `{{status:OK:NOK}}` | Texto condicional: OK si valor > 0, NOK si no |
| `{{host}}` | Hostname del mapping |
| `{{color}}` | Color hex actual del umbral |

### Ejemplo

```
textMode: "custom"
textTemplate: "{{alias}}: {{value}}%"
```

Resultado en el SVG: `CPU: 85%`

---

## Visibilidad de elementos

Cada mapping puede controlar cuando se muestra su elemento SVG.

| Modo | Comportamiento |
|---|---|
| `always` | Siempre visible (default) |
| `when-data` | Visible solo si hay datos |
| `when-ok` | Visible solo si severidad = NORMAL |
| `when-alert` | Visible solo si severidad >= WARNING |
| `when-nodata` | Visible solo si no hay datos |

Cuando el elemento se oculta, se aplica `display: none` al grupo SVG.

---

## Tooltips configurables

El tooltip se muestra al pasar el raton sobre un elemento mapeado.

### Modos de tooltip

| Modo | Descripcion |
|---|---|
| `detailed` | Muestra todas las metricas con badge de severidad y timestamp (default) |
| `compact` | Muestra una linea por metrica, sin timestamp ni badges extras |
| `off` | Desactiva tooltips |

### Opciones de configuracion

| Opcion | Tipo | Default | Descripcion |
|---|---|---|---|
| **Tooltip Mode** | select | `detailed` | Modo de visualizacion |
| **Max Width** | number | `350` | Ancho maximo del tooltip (px) |
| **Font Size** | number | `13` | Tamano de fuente base (px) |
| **Show Severity** | boolean | `true` | Mostrar badge de severidad |
| **Show Timestamp** | boolean | `true` | Mostrar timestamp de los datos |

Estas opciones se encuentran en el panel de opciones bajo "Tooltip".

---

## Queries dinamicas

### Terms Aggregation (Elasticsearch)

Cuando usas una query con Terms aggregation en Elasticsearch y un alias dinamico como `sonda {{term monitor.name}}`, Grafana genera multiples DataFrames — uno por cada valor unico del termino.

### Como configurar

1. **refId**: En el mapping, selecciona la query especifica (A, B, C...)
2. **hostField**: Indica el campo que contiene el identificador (ej: `monitor.name`)
3. **Metric field**: Selecciona el campo de la metrica (ej: `summary.up`)

### Comportamiento

- El plugin detecta automaticamente que una query genera multiples frames
- Al seleccionar una query dinamica, se sugiere el refId y hostField
- Las metricas se anadenjuan manualmente — **no se auto-expanden** todos los hosts
- Puedes usar `filterPattern` para seleccionar hosts por patron wildcard

---

## Per-metric hostField y filterPattern

### hostField por metrica

Cada metrica puede tener su propio `hostField`, independiente del hostField global del mapping. Esto permite combinar datos de distintas queries con campos host diferentes en un solo elemento SVG.

**Ejemplo**: Un elemento SVG muestra CPU de una query (host.name) y estado HTTP de otra (monitor.name).

### filterPattern

Pattern de coincidencia con wildcards (`*`) para filtrar valores de un campo string.

| Patron | Comportamiento |
|---|---|
| `*BAMBOO*` | Coincide con cualquier valor que contenga "BAMBOO" |
| `PING-*` | Coincide con valores que empiecen por "PING-" |
| `*-WEB` | Coincide con valores que terminen en "-WEB" |
| `exact-match` | Coincidencia exacta (sin wildcards) |

**Requisito**: `filterPattern` requiere que `hostField` este configurado en la misma metrica.

---

## Soporte draw.io

El plugin soporta ficheros `.drawio` (diagrams.net) nativamente.

### Como funciona

1. Carga el contenido XML del fichero `.drawio` en **"SVG Source"** (o sirviendolo por URL)
2. El plugin detecta automaticamente el formato (`<mxfile>` o `<mxGraphModel>`)
3. Convierte internamente el XML a SVG con:
   - Formas: rect, ellipse, rhombus, cylinder, triangle, hexagon, cloud, parallelogram
   - Texto con fuente, tamano, color, alineacion
   - Conexiones (edges) con flechas
   - Atributo `data-cell-id` en cada elemento para Cell Mappings

### Formas soportadas

| Forma | Descripcion |
|---|---|
| rect | Rectangulo (con bordes redondeados opcionales) |
| ellipse | Elipse / circulo |
| rhombus | Rombo / diamante |
| cylinder | Cilindro (databases) |
| triangle | Triangulo |
| hexagon | Hexagono |
| cloud | Nube |
| parallelogram | Paralelogramo |
| text-only | Solo texto, sin forma de fondo |

### Estilos

El conversor respeta:
- `fillColor`, `strokeColor`, `fontColor`
- `strokeWidth`, `rounded`, `opacity`
- `fontSize`, `fontFamily`, `fontStyle` (bold)
- `align`, `verticalAlign`
- `dashed` (para conexiones)
- Flechas (`endArrow`)

---

## Debug Mode

Activa **"Debug Mode"** en las opciones del panel para mostrar un overlay sobre cada elemento SVG con:
- `data-cell-id` del elemento
- Hostname resuelto (si tiene mapping)

Util para identificar elementos y verificar que los mappings estan correctos.

El overlay usa la clase CSS `.svgflow-debug-overlay` y se inyecta una sola vez.

---

## Opciones del panel

| Opcion | Categoria | Tipo | Descripcion |
|---|---|---|---|
| SVG Source | General | text | Contenido SVG inline |
| SVG URL | General | string | URL del fichero SVG |
| Target Selector | General | string | Selector CSS para targets (`g[data-cell-id]`) |
| Shape Selector | General | string | Selector CSS para formas a colorear |
| Host Field | General | string | Campo del DataFrame con el hostname |
| Click URL Template | General | string | Template URL para navegacion |
| Debug Mode | General | boolean | Overlay de debug |
| Cell Mappings | Cell Mappings | custom | Editor visual de mapeos |
| Global Thresholds | Cell Mappings | custom | Editor visual de umbrales globales |
| Host Mapping | Advanced | json | Alias SVG → hostname real |
| Custom Thresholds | Advanced | json | Umbrales por servidor |
| Tooltip Mode | Tooltip | select | `detailed` / `compact` / `off` |
| Tooltip Max Width | Tooltip | number | Ancho maximo (px) |
| Tooltip Font Size | Tooltip | number | Tamano fuente (px) |
| Show Severity | Tooltip | boolean | Mostrar badge severidad |
| Show Timestamp | Tooltip | boolean | Mostrar timestamp |

---

## Estructura del proyecto

```
svg-flow-panel/
  src/
    module.ts                          # Entry point, registro del plugin
    types.ts                           # Tipos, interfaces, configuracion
    plugin.json                        # Metadata del plugin para Grafana
    components/
      SvgFlowPanel.tsx                 # Componente principal del panel
      CellMappingsEditor.tsx           # Editor de cell mappings
      GlobalThresholdsEditor.tsx       # Editor de umbrales globales
      editor/
        constants.ts                   # Constantes del editor (colores, opciones)
        CellMappingCard.tsx            # Card de mapping individual
        MetricAssignmentRow.tsx        # Fila de metrica en el editor
        MetricThresholdsMini.tsx       # Mini-editor de umbrales
        ValueMappingsMini.tsx          # Mini-editor de value mappings
        index.ts                       # Re-exportaciones
    utils/
      aggregation.ts                   # Funciones de agregacion
      aliasResolver.ts                 # Parsing de alias/Lucene/validacion
      cellProcessor.ts                 # Procesamiento de celdas SVG
      dataFormatter.ts                 # Formateo de datos y colores
      drawioConverter.ts               # Conversion draw.io XML → SVG
      hostMapping.ts                   # Normalizacion de hostnames
      hostResolver.ts                  # Busqueda de hosts en metricas
      metricExtractor.ts               # Extraccion de metricas de DataFrames
      metricsIndex.ts                  # Indices invertidos para busqueda rapida
      svgSanitizer.ts                  # Sanitizacion SVG + dark theme
      tooltipManager.ts               # Gestion de tooltips flotantes
      index.ts                         # Re-exportaciones de utils
      __tests__/                       # Tests unitarios
        aggregation.test.ts
        aliasResolver.test.ts
        cellProcessor.test.ts
        dataFormatter.test.ts
        drawioConverter.test.ts
        hostMapping.test.ts
        hostResolver.test.ts
        metricExtractor.test.ts
        metricsIndex.test.ts
    __mocks__/                         # Mocks para tests
      @grafana/data.ts
      @grafana/ui.ts
      dompurify.ts
    img/
      logo.svg                         # Logo del plugin
  dist/                                # Build compilado
  docs/                                # Documentacion
  webpack.config.ts                    # Configuracion de build
  jest.config.ts                       # Configuracion de tests
  tsconfig.json                        # Configuracion TypeScript
  package.json                         # Dependencias y scripts
```

---

## Referencia rapida de severidades

| Severidad | Color | Cuando |
|---|---|---|
| NORMAL | Verde | Metricas dentro de umbrales |
| WARNING | Amarillo | Superado primer umbral |
| MINOR | Naranja claro | Superado segundo umbral |
| MAJOR | Naranja | Superado tercer umbral |
| CRITICO | Rojo | Superado umbral critico. Activa pulso CSS |
| SIN_DATOS | Gris | Host no encontrado en datos |

---

*ToBeFlow Chart Panel v1.0.0 — Documentacion generada 2026-03-03*

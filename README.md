# ToBeFlow Chart Panel

**Plugin de panel para Grafana** que permite visualizar infraestructura de forma interactiva sobre diagramas SVG personalizados, coloreando elementos en tiempo real segun las metricas de tus datasources.

Desarrollado por **Dylan Fiego**.

---

## Que es

ToBeFlow Chart Panel es un plugin de tipo panel para Grafana 11.x que toma un diagrama SVG (rack de servidores, topologia de red, plano de CPD, etc.) y lo convierte en un mapa de estado en vivo. Cada elemento del SVG se vincula a un host y a metricas especificas del datasource, cambiando de color y mostrando tooltips detallados segun los valores recibidos.

Es la alternativa moderna y mantenida al antiguo plugin **Flowcharting** de Grafana, construido desde cero con React, TypeScript y la API de Grafana 11.

---

## Para que fue hecho

- **Monitorizar infraestructura visual**: representar servidores, switches, servicios o cualquier componente sobre un diagrama SVG real.
- **Mapeo flexible SVG-a-datos**: vincular cualquier elemento SVG (identificado por `data-cell-id`) a un host y a campos especificos del datasource (Elasticsearch, Prometheus, etc.).
- **Sustituir Flowcharting**: ofrecer la misma funcionalidad con tecnologia actual, sin depender de plugins abandonados ni APIs deprecated.

---

## Stack Tecnologico

| Componente | Tecnologia |
|---|---|
| Framework | Grafana Plugin SDK (PanelPlugin) |
| Lenguaje | TypeScript + React 18 |
| Build | Webpack 5 + SWC Loader |
| Sanitizacion SVG | DOMPurify |
| Datasources compatibles | Cualquiera (Elasticsearch, Prometheus, InfluxDB, etc.) |
| Grafana requerido | >= 11.0.0 |

---

## Funcionalidades

### 1. Carga de SVG

- **SVG inline**: pega directamente el contenido SVG en las opciones del panel.
- **SVG por URL**: apunta a un fichero `.svg` externo.
- Sanitizacion automatica con DOMPurify para evitar XSS.

### 2. Cell Mappings (Mapeo de Celdas)

Sistema central del plugin. Cada "mapping" vincula:

| Campo | Descripcion |
|---|---|
| **Cell ID** | El atributo `data-cell-id` del elemento SVG |
| **Host** | El hostname del servidor/dispositivo en el datasource |
| **Metrics** | Lista de campos del datasource a monitorizar |

#### Modos de creacion

- **Manual**: boton "+ Mapping" y seleccionar Cell ID + Host.
- **Seleccionar del SVG**: modo pick interactivo — click en un elemento del diagrama y se crea el mapping automaticamente con el host resuelto.
- **Fijar Host (Reasignar)**: boton de link en cada card para reasignar el `data-cell-id` haciendo click en otro elemento del SVG.
- **Autodiscover**: shortcut que anade un conjunto predefinido de metricas comunes (CPU, RAM, Estado, Disco) con tipo `auto` y sin umbrales. Es solo una ayuda inicial, no afecta a los campos disponibles en el selector.

### 3. Metricas por Mapping

Cada mapping puede tener multiples metricas, cada una con:

| Propiedad | Descripcion |
|---|---|
| **Field** | Campo del indice/datasource (ej: `system.cpu.total.norm.pct`) |
| **Alias** | Nombre amigable para el tooltip (ej: "CPU") |
| **Data Type** | Formato de visualizacion del valor |
| **Aggregation** | Tipo de agregacion: last, avg, min, max, sum, count, etc. |
| **Thresholds** | Umbrales de color individuales por metrica (opcionales) |
| **Value Mappings** | Transformar valores discretos en textos (ej: 0→NOK, 1→OK) |
| **Text Mode** | Escribir texto sobre el elemento SVG (off/metric/custom) |
| **hostField** | Campo host alternativo para esta metrica especifica |
| **filterPattern** | Filtro wildcard para seleccionar hosts por patron |
| **refId** | Query especifica de Grafana para esta metrica |

#### Tipos de dato soportados

| Tipo | Comportamiento |
|---|---|
| `Auto` | Muestra el valor nativo del datasource sin transformacion |
| `Percent (0-100)` | Valor numerico con sufijo `%` |
| `Percent (0-1.0)` | Multiplica por 100 y muestra como `%` |
| `Number` | Valor numerico directo |
| `Bytes` | Formatea a B/KB/MB/GB/TB automaticamente |
| `Text` | Muestra como cadena de texto |
| `Boolean` | Muestra SI/NO |
| `Date` | Formatea como fecha legible |

### 4. Sistema de Umbrales (Thresholds)

Dos niveles de umbrales con prioridad clara:

1. **Umbrales por metrica**: se definen directamente en cada metrica del mapping. Tienen maxima prioridad.
2. **Umbrales globales** (Global Thresholds): editor visual estilo Grafana nativo en la seccion "Cell Mappings". Se aplican a todas las metricas que **no tengan umbrales propios**.

El editor visual permite:
- Anadir umbrales con "+ Add threshold"
- Cada umbral tiene un circulo de color (color picker) y un valor numerico
- "Base" siempre presente como color por defecto
- Toggle Absolute / Percentage

La logica evalua `>=` de mayor a menor: si el valor es >= 85 usa rojo, si es >= 60 usa naranja, el resto usa el color base.

### 5. Coloreado Inteligente

- Los elementos SVG **solo se colorean si tienen metricas asignadas**. Sin metricas, permanecen en su color original.
- Si un host no se encuentra en los datos, se colorea como `SIN_DATOS` (gris).
- El color final de la forma es el del **peor umbral** entre todas sus metricas.
- Severidad critica activa una animacion de pulso CSS.

### 6. Tooltips Configurables

Al pasar el raton sobre un elemento mapeado, se muestra un tooltip flotante configurable:

- Hostname, timestamp y metricas con alias, valor formateado y color de estado
- **Modos**: `detailed` (completo), `compact` (una linea por metrica), `off` (desactivado)
- **Opciones**: ancho maximo, tamano de fuente, mostrar/ocultar severidad y timestamp

### 7. Value Mappings

Transforman valores del datasource en textos personalizados. Tipos:
- **value**: match exacto (`"0"` → `"NOK"`)
- **range**: rango numerico (`0-50` → `"Bajo"`)
- **regex**: patron regex
- **comparison**: operador (`> 80` → `"Critico"`)

### 8. Texto en Elementos SVG

Cada metrica puede escribir texto directamente sobre el elemento SVG:
- `off`: sin texto (default)
- `metric`: muestra el valor formateado
- `custom`: plantilla libre con `{{value}}`, `{{alias}}`, `{{status}}`, `{{host}}`, `{{color}}`

### 9. Visibilidad de Elementos

Cada mapping controla cuando se muestra su elemento:
- `always` (default), `when-data`, `when-ok`, `when-alert`, `when-nodata`

### 10. Soporte draw.io

Carga ficheros `.drawio` nativamente. El plugin detecta el formato XML y convierte automaticamente a SVG con formas (rect, ellipse, rhombus, cylinder, triangle, hexagon, cloud), texto, conexiones y `data-cell-id`.

### 11. Queries Dinamicas

Soporte completo para Terms Aggregation de Elasticsearch con alias dinamicos (`{{term monitor.name}}`). Configura refId + hostField en el mapping para vincular hosts especificos sin auto-expansion.

### 12. Boton Localizar (Eye)

Cada card de mapping tiene un boton con icono de ojo:

- **Hover sostenido**: el elemento SVG parpadea con un pulso azul infinito para identificarlo visualmente.
- **Click**: 3 pulsos azules y se detiene.

### 8. Cards Colapsables

Las cards de mapping en el editor son colapsables. Cada una muestra un chevron en el header que permite contraer/expandir el contenido. Cuando esta colapsada, muestra un resumen compacto con el Cell ID, hostname y cantidad de metricas.

### 9. Data Link por Mapping

Cada mapping puede tener su propia URL de navegacion en el campo "Data Link". Soporta los mismos placeholders:

- `{{host}}` -- hostname del servidor
- `{{cellId}}` -- identificador del elemento SVG

Si un mapping no tiene Data Link, se usa el Click URL Template global como fallback.

### 10. Selector de Campos del Datasource

El dropdown de metricas en cada mapping muestra **todos los campos disponibles** en el datasource activo. Los campos se obtienen dinamicamente desde los DataFrames (`panelData.series[].fields`), no desde una lista estatica.

Cada campo se muestra con un tag indicando su tipo:

- `[N]` Numerico
- `[S]` String
- `[D]` Date/Time
- `[B]` Boolean

El selector permite tambien introducir valores custom para campos que no aparezcan en la query actual.

> **Nota**: Autodiscover y el selector de campos son independientes. Autodiscover solo anade metricas predefinidas como shortcut. El selector muestra todos los campos reales del datasource.

---

## Opciones del Panel

| Opcion | Categoria | Descripcion |
|---|---|---|
| SVG Source | General | Contenido SVG inline |
| SVG URL | General | URL del fichero SVG |
| Target Selector | General | Selector CSS para targets (`g[data-cell-id]`) |
| Shape Selector | General | Selector CSS para las formas a colorear |
| Host Field | General | Campo del DataFrame con el hostname |
| Click URL Template | General | Template de URL para navegacion |
| Cell Mappings | Cell Mappings | Editor visual de mapeos |
| Global Thresholds | Cell Mappings | Editor visual de umbrales globales |
| Host Mapping | Advanced | JSON de alias SVG -> hostname real |
| Custom Thresholds | Advanced | Umbrales por servidor en JSON |
| Debug Mode | General | Overlay con cell-id y host en cada elemento |
| Tooltip Mode | Tooltip | Modo: detailed / compact / off |
| Tooltip Max Width | Tooltip | Ancho maximo del tooltip (px) |
| Tooltip Font Size | Tooltip | Tamano de fuente base (px) |
| Show Severity | Tooltip | Mostrar badge de severidad |
| Show Timestamp | Tooltip | Mostrar timestamp de los datos |

---

## Estructura del Proyecto

```
svg-flow-panel/
  src/
    module.ts                          # Entry point
    types.ts                           # Tipos, interfaces, configuracion
    plugin.json                        # Metadata del plugin
    components/
      SvgFlowPanel.tsx                 # Componente principal del panel
      CellMappingsEditor.tsx           # Editor de cell mappings
      GlobalThresholdsEditor.tsx       # Editor de umbrales globales
      editor/
        constants.ts                   # Constantes del editor
        CellMappingCard.tsx            # Card de mapping individual
        MetricAssignmentRow.tsx        # Fila de metrica
        MetricThresholdsMini.tsx       # Mini-editor de umbrales
        ValueMappingsMini.tsx          # Mini-editor de value mappings
        index.ts                       # Re-exportaciones
    utils/
      aggregation.ts                   # Funciones de agregacion (14 tipos)
      aliasResolver.ts                 # Parsing de alias, Lucene, validacion
      cellProcessor.ts                 # Procesamiento de celdas SVG
      dataFormatter.ts                 # Formateo de datos y colores
      drawioConverter.ts               # Conversion draw.io XML a SVG
      hostMapping.ts                   # Normalizacion de hostnames
      hostResolver.ts                  # Busqueda de hosts en metricas
      metricExtractor.ts               # Extraccion de metricas de DataFrames
      metricsIndex.ts                  # Indices invertidos (busqueda rapida)
      svgSanitizer.ts                  # Sanitizacion SVG + dark theme
      tooltipManager.ts               # Gestion de tooltips flotantes
      index.ts                         # Re-exportaciones
      __tests__/                       # 9 test suites, 197 tests
    __mocks__/                         # Mocks para @grafana/*, dompurify
    img/
      logo.svg
  docs/
    USER-GUIDE.md                      # Guia completa de uso
  dist/                                # Build compilado (113 KiB)
  webpack.config.ts
  jest.config.ts
  tsconfig.json
  package.json
```

> **Documentacion completa**: ver [docs/USER-GUIDE.md](docs/USER-GUIDE.md)

---

## Como usar

1. **Preparar el SVG**: asegurate de que los elementos que quieres monitorizar tengan el atributo `data-cell-id` con un identificador unico.

2. **Crear el panel**: en Grafana, crea un nuevo panel y selecciona "ToBeFlow Chart Panel".

3. **Cargar el SVG**: pega el contenido SVG o proporciona una URL.

4. **Configurar datasource**: anade tu datasource (Elasticsearch, Prometheus, etc.) como query del panel.

5. **Crear mappings**: usa "+ Mapping" o "Seleccionar del SVG" para vincular elementos a hosts.

6. **Asignar metricas**: anade campos del datasource a cada mapping. Usa Autodiscover para las metricas comunes o selecciona manualmente del desplegable.

7. **Configurar tipos de dato**: si el valor nativo necesita transformacion (ej: 0-1 a porcentaje), cambia el Data Type.

8. **Definir umbrales**: opcionalmente, configura umbrales globales o por metrica para controlar los colores.

---

## Compilacion y Despliegue

```bash
# Instalar dependencias
cd plugins/svg-flow-panel
npm install

# Build de produccion
npm run build

# El directorio dist/ se monta como volumen en Grafana
docker restart grafana-lab
```

Variable de entorno necesaria en Grafana:
```
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=tobeflow-chart-panel
```

---

## Licencia

Apache 2.0

---

*ToBeFlow Chart Panel v1.0.0 — ToBeIT, 2026*

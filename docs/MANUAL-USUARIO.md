# ToBeFlow Chart Panel — Manual de Usuario

**Versión:** 1.3.0  
**Autor:** ToBeIT ([tobeit.es](https://tobeit.es))  
**Compatibilidad:** Grafana ≥ 10.0.0

---

## Índice

1. [¿Qué es ToBeFlow?](#1-qué-es-tobeflow)
2. [Crear tu primer panel](#2-crear-tu-primer-panel)
3. [Paso 1 — Fuente SVG](#3-paso-1--fuente-svg)
4. [Paso 2 — Configurar datos](#4-paso-2--configurar-datos)
5. [Paso 3 — Mapear celdas](#5-paso-3--mapear-celdas)
6. [Paso 4 — Interacción](#6-paso-4--interacción)
7. [Umbrales y severidades](#7-umbrales-y-severidades)
8. [Tooltips](#8-tooltips)
9. [Capas SVG (Multi-Layer)](#9-capas-svg-multi-layer)
10. [Modo Debug](#10-modo-debug)
11. [Export / Import de configuración](#11-export--import-de-configuración)
12. [Opciones avanzadas](#12-opciones-avanzadas)
13. [Herramientas del editor](#13-herramientas-del-editor)
14. [Referencia de severidades y colores](#14-referencia-de-severidades-y-colores)
15. [Preguntas frecuentes](#15-preguntas-frecuentes)

---

## 1. ¿Qué es ToBeFlow?

ToBeFlow es un panel de Grafana que renderiza diagramas SVG interactivos alimentados por datos en tiempo real. Conecta cada elemento visual de tu diagrama (servidores, switches, servicios) con métricas de tus datasources (Elasticsearch, Prometheus, InfluxDB, etc.) para mostrar:

- **Coloreado por severidad** — verde (normal), amarillo (warning), rojo (crítico)
- **Tooltips informativos** — al pasar el ratón ves las métricas de cada elemento
- **Animaciones** — pulso en elementos críticos, resaltado al localizar
- **Navegación** — click en un elemento abre su dashboard de detalle

Casos de uso típicos:
- Mapa de datacenter con estado de servidores
- Diagrama de red con estado de enlaces
- Plano de edificio con sensores IoT
- Topología de microservicios

---

## 2. Crear tu primer panel

1. En tu dashboard, click en **Add panel** → **Add a new panel**
2. Selecciona **ToBeFlow Chart Panel** como tipo de visualización
3. Añade al menos un datasource con datos de hosts (ej: Elasticsearch con Metricbeat)
4. Configura el SVG, datos y mapeos siguiendo los pasos de abajo

---

## 3. Paso 1 — Fuente SVG

El panel necesita un SVG con elementos que tengan atributos `data-cell-id`. Hay tres formas de proporcionarlo:

### Opción A: Editor inline con vista previa

En la sección **01. Fuente** → **Fuente SVG / Draw.io (inline)**, pega directamente tu SVG o XML de Draw.io. El editor incluye:

- Resaltado de sintaxis
- Vista previa en tiempo real
- Detección automática de `data-cell-id`

### Opción B: Editor visual Draw.io

Click en **Editor Draw.io** para abrir el editor visual integrado. Crea o modifica tu diagrama con drag & drop y al guardar se inyecta automáticamente como SVG.

> **Importante:** Los elementos de Draw.io generan automáticamente `data-cell-id`. No necesitas añadirlos manualmente.

### Opción C: URL externa

En **URL SVG / Draw.io**, proporciona una URL a un archivo SVG. Solo se usa cuando el campo inline está vacío. Soporta variables de Grafana (ej: `${var_svg_url}`).

### Capas SVG (Multi-Layer)

Puedes añadir SVGs adicionales como capas superpuestas. Cada capa tiene:
- **Nombre** y **fuente SVG**
- **Visible** — mostrar/ocultar
- **Opacidad** — 0 (transparente) a 1 (opaco)
- **Z-Index** — orden de apilamiento

Útil para: planos multi-planta, overlays de red sobre mapa físico.

---

## 4. Paso 2 — Configurar datos

### Campo Host Principal

En **02. Datos** → **Campo Host Principal**, indica qué campo de tus datos identifica cada host. Ejemplos:

| Datasource | Campo típico |
|---|---|
| Metricbeat / Elastic | `host.name` |
| Prometheus | `instance` |
| Telegraf | `host` |
| SNMP | `agent` |
| Heartbeat | `monitor.name` |

Por defecto es `host.name`.

### Queries

Añade una o más queries en la pestaña de datos del panel. Cada query puede tener un `refId` (A, B, C...) que luego usarás en los mapeos para indicar de qué query viene cada métrica.

---

## 5. Paso 3 — Mapear celdas

La sección **03. Mapeo** → **Mapeos de Celdas** es el corazón del plugin. Aquí vinculas cada elemento SVG con un host y sus métricas.

### Crear un mapeo

1. Click en **+ Añadir Mapeo**
2. **Cell ID**: selecciona el ID del elemento SVG (se detectan automáticamente)
3. **Host name**: el hostname que identifica este elemento en los datos
4. **Label**: nombre visible para referencia

### Modo Pick (selección visual)

Click en el icono 🎯 para activar el modo pick. Luego haz click en cualquier elemento del SVG y se rellenará automáticamente el Cell ID y el host resuelto.

### Configurar métricas por celda

Dentro de cada mapeo, añade métricas:

| Campo | Descripción | Ejemplo |
|---|---|---|
| **Field** | Campo/métrica de los datos | `system.cpu.total.norm.pct` |
| **Alias** | Nombre visible en tooltip | `CPU` |
| **Data Type** | Tipo de dato para formato | `pct1` (0-1), `pct100` (0-100), `bytes` |
| **Thresholds** | Umbrales personalizados | `[{value: 80, color: "yellow"}, {value: 95, color: "red"}]` |
| **Aggregation** | Cómo reducir múltiples valores | `last`, `avg`, `max`, `min` |
| **ref ID** | Query específica (A, B, C) | `A` |
| **Host Field** | Override del campo host | `monitor.name` |
| **Filter Pattern** | Filtro regex para agrupar | `filesystem.*` |

### Tipos de dato (Data Type)

| Tipo | Rango | Formato | Ejemplo |
|---|---|---|---|
| `auto` | Detecta automáticamente | — | — |
| `pct100` | 0–100 | `75.5%` | CPU usage |
| `pct1` | 0–1 | `0.75 → 75%` | Metricbeat normalized |
| `number` | Cualquiera | `1,234.5` | Contadores |
| `bytes` | Bytes | `1.2 GB` | Disco, memoria |
| `text` | String | Tal cual | Estado |
| `boolean` | 0/1 | UP/DOWN | Ping |
| `ms` | Milisegundos | `123 ms` | Latencia |
| `seconds` | Segundos | `45 s` | Duración |
| `short` | Números grandes | `1.2K` | Contadores |
| `date` | Timestamp | Fecha formateada | Última vez |

### Agregaciones

| Agregación | Descripción |
|---|---|
| `last` | Último valor (por defecto) |
| `lastNotNull` | Último valor no nulo |
| `avg` | Media aritmética |
| `max` / `min` | Máximo / mínimo |
| `sum` | Suma total |
| `count` | Número de registros |
| `delta` | Diferencia entre primero y último |
| `range` | Máximo - mínimo |

### Visibilidad condicional

Cada mapeo puede tener una regla de visibilidad:

| Modo | Comportamiento |
|---|---|
| `always` | Siempre visible (por defecto) |
| `when-data` | Solo si tiene datos |
| `when-ok` | Solo si severidad es NORMAL |
| `when-alert` | Solo si severidad ≥ WARNING |
| `when-nodata` | Solo si NO tiene datos |

### Text templates

Puedes mostrar texto dentro del SVG sobre cada celda:

- **Mode: metric** — muestra el valor de la métrica
- **Mode: custom** — template personalizado con variables:
  - `{{value}}` — valor de la métrica
  - `{{host}}` — hostname
  - `{{severity}}` — severidad actual
  - `{{label}}` — alias de la métrica
  - `\\n` — salto de línea

---

## 6. Paso 4 — Interacción

### URL al hacer click

En **04. Interacción** → **URL al Hacer Click**, configura qué pasa al hacer click en un elemento:

```
/d/host-detail?var-host={{host}}
```

Variables disponibles:
- `{{host}}` — hostname del elemento
- `{{cellId}}` — ID de la celda SVG

Cada mapeo también puede tener su propio **Data Link** que sobreescribe el global.

---

## 7. Umbrales y severidades

### Umbrales globales

En **03. Mapeo** → **Umbrales Globales**, define umbrales que se aplican cuando una métrica no tiene umbrales personalizados. Usa el editor visual de steps con colores.

### Umbrales por defecto (integrados)

| Severidad | CPU/RAM/Swap/Disco |
|---|---|
| NORMAL | < 60% |
| WARNING | ≥ 60% |
| MINOR | ≥ 70% |
| MAJOR | ≥ 80% |
| CRITICO | ≥ 90% |

### Umbrales personalizados (JSON avanzado)

En **06. Avanzado** → **Custom Thresholds (JSON)**:

```json
{
  "SERVIDOR1": {
    "cpu": { "MAJOR": 85, "CRITICO": 95 },
    "disco": { "MAJOR": 90, "CRITICO": 98 }
  }
}
```

### Umbrales por métrica individual

En cada métrica de un mapeo, puedes definir thresholds específicos con operadores: `>`, `>=`, `<`, `<=`, `=`, `!=`.

---

## 8. Tooltips

Al pasar el ratón por un elemento, aparece un tooltip con las métricas. Configuración en **07. Tooltip**:

| Opción | Descripción | Default |
|---|---|---|
| Modo | `detailed` / `compact` / `off` | `detailed` |
| Ancho máximo | Píxeles | 380 |
| Tamaño fuente | Píxeles | 12 |
| Familia fuente | CSS font-family | `inherit` |
| Color fondo | Color CSS | `rgba(15, 23, 42, 0.95)` |
| Color texto | Color CSS | `#ffffff` |
| Color borde | Color CSS | `rgba(255, 255, 255, 0.1)` |
| Radio borde | Píxeles | 4 |
| Padding | Píxeles | 12 |
| Opacidad | 0–1 | 0.95 |
| Mostrar severidad | Sí/No | Sí |
| Mostrar timestamp | Sí/No | Sí |

---

## 9. Capas SVG (Multi-Layer)

En **01. Fuente** → **Capas SVG (Multi-Layer)**, añade capas superpuestas:

1. Click en **+ Añadir capa**
2. Pega el SVG de la capa
3. Ajusta opacidad, zIndex y visibilidad
4. Las celdas de las capas participan en los mapeos igual que las del SVG base

**Ejemplo:** Capa base = plano del datacenter, Capa 1 = red eléctrica, Capa 2 = red de datos.

---

## 10. Modo Debug

Activa **05. Diagnóstico** → **Modo Debug** para:

### Overlays visuales
Cada celda SVG muestra un overlay con `cellId → host resuelto`.

### Logs en consola (F12)
- **📊 Data Summary** — series recibidas, campos, advertencias de campos faltantes
- **🖥 Hosts Extracted** — hosts detectados con sus métricas y severidades
- **🗺 Cell Mappings** — validación de mapeos (hosts encontrados ✓ / no encontrados ✗)
- **🔄 Render Cycle** — targets, mappings, layers, cache hit/miss, timestamp
- **🔧 Cells Processed** — resumen final: severidades, problemas, celdas ocultas

---

## 11. Export / Import de configuración

### Exportar

En el editor de mapeos, click en **📤 Export Config**. Se descarga un JSON con:

- Todos los `cellMappings`
- `svgSource`, `svgUrl`
- `layers` (capas)
- `hostMappingJson`, `customThresholdsJson`, `metricsConfigJson`
- `globalThresholds`, `tooltipConfig`
- `debugMode`, `hostField`, `clickUrlTemplate`
- Versión del envelope (`_svgFlowVersion: "1.3.0"`)

### Importar

Click en **📥 Import Config** y selecciona un archivo JSON previamente exportado. Se aplican automáticamente los `cellMappings`. Los campos extra detectados se listan para referencia.

### Coverage / Validación

El editor muestra un resumen de cobertura:
- **Total cells** en el SVG
- **Mapped** — con mapeo configurado
- **Unmapped** — sin mapeo
- **Orphans** — mapeos que apuntan a celdas que no existen en el SVG
- **Duplicates** — celdas con más de un mapeo
- **Coverage %** — porcentaje de cobertura

---

## 12. Opciones avanzadas

### Host Mapping (JSON)

Alias para resolver nombres del SVG a hostnames reales:

```json
{
  "LIDO": "w12desa",
  "SERVER-*": "prod-server-*"
}
```

Soporta wildcards con `*`.

### Metrics Config (JSON)

Personaliza la detección de métricas:

```json
{
  "_preset": "metricbeat",
  "cpu": {
    "campos": ["system.cpu.total.norm.pct"]
  },
  "custom_metric": {
    "nombre": "Mi Métrica",
    "campos": ["my.custom.field"],
    "tipo": "porcentaje",
    "umbrales": { "CRITICO": 95, "MAJOR": 85 }
  }
}
```

**Preset `metricbeat`**: autoconfigura campos de Elastic Metricbeat para cpu, memoria, swap, ping, disco y proceso.

---

## 13. Herramientas del editor

En **08. Herramientas** → **Buscar y Resumen**:

- **Buscar**: localiza celdas por ID o texto. Las no coincidentes se atenúan.
- **Resumen de estados**: distribución de severidades en tiempo real.
- **Localizar celda**: hover sobre un mapeo resalta la celda en el SVG con pulso azul.

---

## 14. Referencia de severidades y colores

| Severidad | Color | Hex | Significado |
|---|---|---|---|
| NORMAL | 🟢 Verde | `#2fda2f` | Todo OK |
| WARNING | 🔵 Azul | `#42a5f5` | Atención |
| MINOR | 🟡 Amarillo claro | `#faec2d` | Problema menor |
| MAJOR | 🟠 Amarillo/naranja | `#f7b911` | Problema importante |
| CRITICO | 🔴 Rojo | `#da2020` | Crítico (con animación pulso) |
| SIN_DATOS | ⚪ Gris | `#90a4ae` | Sin datos (borde punteado) |

---

## 15. Preguntas frecuentes

### ¿Qué formatos de SVG soporta?

SVG estándar, SVG exportado de Draw.io, y XML nativo de Draw.io (se convierte automáticamente). Se adapta al tema oscuro de Grafana.

### ¿Puedo usar variables de Grafana?

Sí. En `hostName`, `clickUrlTemplate`, `svgUrl` y `textTemplate` puedes usar `${variable}` y se resuelven en tiempo real.

### ¿Cuántas celdas puede manejar?

Diseñado para 500+ celdas con procesamiento en batches adaptativos. SVGs pequeños (< 50 celdas) se procesan de golpe; los grandes (200+) en chunks para mantener 60fps.

### ¿Funciona con múltiples queries?

Sí. Usa el campo `refId` en cada mapeo o métrica para indicar de qué query provienen los datos (A, B, C, etc.).

### ¿Cómo hago un diagrama con `data-cell-id`?

En Draw.io los IDs se generan automáticamente. Para SVGs manuales, añade `data-cell-id="mi-id"` a los elementos `<g>` que quieras mapear.

### ¿Puedo tener el mismo host en varias celdas?

Sí. Múltiples celdas pueden apuntar al mismo host con métricas diferentes.

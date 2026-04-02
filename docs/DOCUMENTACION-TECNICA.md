# ToBeFlow Chart Panel — Documentación Técnica

**Versión:** 1.3.0  
**Plugin ID:** `tobeit-tobeflow-panel`  
**Tipo:** Panel (frontend-only)  
**Licencia:** Apache 2.0  
**Autor:** ToBeIT ([tobeit.es](https://tobeit.es))

---

## Índice

1. [Descripción general](#1-descripción-general)
2. [Arquitectura](#2-arquitectura)
3. [Flujo de datos](#3-flujo-de-datos)
4. [Módulos y componentes](#4-módulos-y-componentes)
5. [Sistema de severidades](#5-sistema-de-severidades)
6. [Pipeline de procesamiento](#6-pipeline-de-procesamiento)
7. [Rendimiento y optimizaciones](#7-rendimiento-y-optimizaciones)
8. [Consumo de recursos](#8-consumo-de-recursos)
9. [Seguridad](#9-seguridad)
10. [Stack tecnológico](#10-stack-tecnológico)
11. [Limitaciones conocidas](#11-limitaciones-conocidas)

---

## 1. Descripción general

ToBeFlow Chart Panel es un plugin de visualización para Grafana que renderiza diagramas SVG interactivos con datos en tiempo real. Cada elemento del SVG se vincula a un host/servicio y muestra su estado de salud mediante colores, animaciones y tooltips enriquecidos.

### ¿Para qué sirve?

- **Monitorización visual**: representar infraestructura (servidores, switches, servicios) como diagramas interactivos
- **Detección de incidencias**: identificar problemas al instante por el color del elemento
- **Navegación contextual**: click en un elemento para acceder a su dashboard de detalle
- **Correlación de métricas**: agregar CPU, memoria, disco, ping, procesos y métricas custom en un solo panel

### ¿Qué implica tenerlo?

| Aspecto | Impacto |
|---|---|
| **Tipo de plugin** | Frontend-only — no requiere backend ni proceso adicional |
| **Ejecución** | Se ejecuta íntegramente en el navegador del usuario |
| **Servidor** | Solo ocupa espacio en disco (~1.5 MB) en el directorio de plugins de Grafana |
| **Base de datos** | No añade tablas ni carga a la DB de Grafana |
| **Red** | No realiza llamadas a APIs externas — solo consume datos de los datasources configurados |
| **RAM extra servidor** | Despreciable — Grafana solo sirve el archivo JS estático |
| **Firma** | Plugin sin firma oficial — requiere `allow_loading_unsigned_plugins` |

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────┐
│                    Grafana                       │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │              Dashboard                      │ │
│  │  ┌───────────────────────────────────────┐  │ │
│  │  │        ToBeFlow Chart Panel           │  │ │
│  │  │                                       │  │ │
│  │  │  ┌─────────────┐  ┌───────────────┐  │  │ │
│  │  │  │  SVG Layer   │  │  Data Layer   │  │  │ │
│  │  │  │  Manager     │  │  Processor    │  │  │ │
│  │  │  └──────┬──────┘  └───────┬───────┘  │  │ │
│  │  │         │                  │          │  │ │
│  │  │  ┌──────▼──────────────────▼───────┐  │  │ │
│  │  │  │      Cell Processor Engine      │  │  │ │
│  │  │  │  (mapeos + umbrales + color)    │  │  │ │
│  │  │  └──────┬──────────────────┬───────┘  │  │ │
│  │  │         │                  │          │  │ │
│  │  │  ┌──────▼───────┐  ┌──────▼───────┐  │  │ │
│  │  │  │  Tooltip Mgr │  │  Animation   │  │  │ │
│  │  │  │              │  │  Engine       │  │  │ │
│  │  │  └──────────────┘  └──────────────┘  │  │ │
│  │  └───────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  Datasources: Elasticsearch, Prometheus,         │
│               InfluxDB, MySQL, etc.              │
└─────────────────────────────────────────────────┘
```

**Frontend-only**: El plugin se compila a un único archivo JavaScript (`module.js`) que Grafana sirve como estático. Todo el procesamiento ocurre en el navegador.

---

## 3. Flujo de datos

```
Datasource Query
       │
       ▼
  DataFrame[] (series de Grafana)
       │
       ▼
  useSortedSeries() — ordena series por antigüedad
       │
       ▼
  extractHostsFromData() — extrae hosts y métricas
       │
       ▼
  MetricsCache — cachea si fingerprint no cambió
       │
       ▼
  cellProcessor.processCells() — por cada mapeo:
       │   1. Resolver host (hostResolver)
       │   2. Buscar métricas del host
       │   3. Evaluar umbrales → severidad
       │   4. Aplicar color al elemento SVG
       │   5. Configurar tooltip data
       │   6. Evaluar visibilidad condicional
       │   7. Aplicar text template
       ▼
  DOM SVG actualizado con colores + tooltips
```

### Ciclo de actualización

1. **Grafana envía datos** al panel cuando hay un refresh o cambio de rango temporal
2. **El panel calcula un fingerprint** de los datos (basado en cantidad de series, campos y valores)
3. **Si el fingerprint no cambió**, se usan datos en cache → render rápido
4. **Si cambió**, se reprocesa todo el pipeline
5. **El DOM se actualiza** con `setAttribute` directo (no re-render React del SVG)

---

## 4. Módulos y componentes

### Archivos principales

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `SvgFlowPanel.tsx` | 601 | Componente principal, orquestación |
| `useSvgFlowHooks.ts` | 511 | 9 hooks (cache, animaciones, SVG loader, etc.) |
| `CellMappingsEditor.tsx` | 1424 | Editor de mapeos con export/import |
| `cellProcessor.ts` | ~400 | Motor de procesamiento de celdas |
| `hostResolver.ts` | ~200 | Resolución de hosts con wildcards |
| `tooltipManager.ts` | ~350 | Gestión de tooltips hover |
| `types.ts` | 460 | Tipos, interfaces, constantes, severidades |
| `module.ts` | 245 | Registro del plugin y opciones de editor |
| `debugLogger.ts` | ~200 | Sistema de logging estructurado |
| `svgUtils.ts` | ~250 | Utilidades SVG (DOMPurify, Draw.io parser) |

**Total**: ~31 archivos fuente, ~9.400 líneas de código (sin tests)

### Hooks del panel

| Hook | Función |
|---|---|
| `useSvgLoader` | Carga SVG (inline, URL) y extrae cell IDs |
| `useParsedOptions` | Parsea JSON de opciones con fallback |
| `useSortedSeries` | Ordena series cronológicamente |
| `useDataTimestamp` | Extrae timestamp más reciente de datos |
| `useLayerLoader` | Carga capas SVG adicionales |
| `useAnimationStyles` | Inyecta CSS animaciones con ref-counting |
| `usePickMode` | Modo selección visual de celdas |
| `useSearchFilter` | Búsqueda/filtrado visual de celdas |
| `useMetricsCache` | Cache de métricas con fingerprint |

---

## 5. Sistema de severidades

### Jerarquía

```
NORMAL < WARNING < MINOR < MAJOR < CRITICO
                                         └── SIN_DATOS (especial)
```

### Umbrales por defecto

La configuración `DEFAULT_METRICAS_CONFIG` define:

| Métrica | Campos Elastic (Metricbeat) | Umbrales por defecto |
|---|---|---|
| CPU | `system.cpu.total.norm.pct` | 60% → WARNING, 70% → MINOR, 80% → MAJOR, 90% → CRITICO |
| Memoria | `system.memory.actual.used.pct` | Igual |
| Swap | `system.memory.swap.used.pct` | Igual |
| Disco | `system.filesystem.used.pct` | Igual |
| Ping | `monitor.status` (Heartbeat) | 0 = CRITICO |
| Proceso | `system.process.cpu.total.norm.pct` | Igual esquema |

### Resolución de severidad

Para cada celda la severidad final es la **más grave** entre todas sus métricas:

```
celda.severidad = max(metrica1.severidad, metrica2.severidad, ...)
```

Prioridad de umbrales (de mayor a menor):
1. Umbrales definidos en la métrica individual del mapeo
2. Custom thresholds JSON (por host y métrica)
3. Umbrales globales del panel
4. Umbrales por defecto integrados

---

## 6. Pipeline de procesamiento

### 6.1 Extracción de hosts

`extractHostsFromData(series, hostField)`:

1. Recorre cada `DataFrame` de las series
2. Busca el campo `hostField` (default: `host.name`)
3. Agrupa métricas por hostname
4. Para cada host, almacena los valores de todos los campos numéricos

### 6.2 Resolución de hosts

`hostResolver.resolveHost(cellMapping, hostData, hostMappings)`:

1. Intenta match directo del `hostName` del mapeo
2. Si hay `hostMappingJson`, aplica aliases (con soporte wildcards `*`)
3. Match case-insensitive como fallback

### 6.3 Procesamiento de celdas

`cellProcessor.processCells()`:

1. Itera cada `cellMapping`
2. Resuelve el host
3. Extrae métricas según `metricAssignments`
4. Para cada métrica:
   - Aplica aggregation (`last`, `avg`, `max`, etc.)
   - Evalúa umbrales → determina severidad
   - Formatea valor según `dataType`
5. Calcula severidad final de la celda
6. Aplica color al elemento SVG (fill + stroke)
7. Si severidad = CRITICO → añade animación pulso
8. Si severidad = SIN_DATOS → borde punteado gris
9. Evalúa visibilidad condicional
10. Aplica text template si configurado

### 6.4 Procesamiento adaptativo

Para paneles con muchas celdas, el procesamiento se divide en chunks:

| Celdas | Chunk size | Comportamiento |
|---|---|---|
| < 50 | Todo de golpe | Síncrono |
| 50–200 | 30 celdas/chunk | requestAnimationFrame entre chunks |
| > 200 | 20 celdas/chunk | Con mayor espaciado para mantener 60fps |

---

## 7. Rendimiento y optimizaciones

### Cache de métricas

- Se genera un **fingerprint** basado en: nº de series, nº de campos, nº de valores y último valor
- Si los datos no cambian entre renders, se reutiliza la caché → evita reprocesar
- Reduce ~80% del trabajo en paneles con refresh frecuente sin cambios reales

### Ref-counting de animaciones CSS

- Las reglas `@keyframes` se inyectan una sola vez en `<head>` aunque haya múltiples paneles
- Un contador de referencias se incrementa/decrementa al montar/desmontar paneles
- Solo se eliminan las reglas cuando el último panel se desmonta

### Manipulación directa del DOM

- El SVG se manipula con `setAttribute` nativo, no con re-renders de React
- Evita reconciliación virtual DOM para el SVG (que puede ser muy grande)
- React solo gestiona el contenedor y las opciones del editor

### Sanitización

- Todo SVG pasa por **DOMPurify** antes de inyectarse en el DOM
- Se eliminan scripts, event handlers, y elementos peligrosos
- Los SVGs de URL también se sanitizan

---

## 8. Consumo de recursos

### En el servidor (Grafana)

| Recurso | Consumo |
|---|---|
| **Disco** | ~1.5 MB (directorio `dist/`) |
| **RAM extra** | Despreciable — es un fichero estático |
| **CPU extra** | Cero — solo se sirve por HTTP |
| **Red** | Una carga inicial del JS (~1.5 MB), luego cacheado por el navegador |
| **Base de datos** | Cero tablas adicionales — la config se guarda en el JSON del dashboard |

### En el navegador (cliente)

| Recurso | Consumo típico | Panel complejo (200+ celdas) |
|---|---|---|
| **RAM JS heap** | 5–15 MB | 20–40 MB |
| **CPU (refresh)** | < 50ms | 100–300ms (chunked) |
| **CPU (idle)** | ~0% | ~0% (no polling propio) |
| **DOM nodes** | Depende del SVG | 1.000–10.000 nodos |

> **Nota:** El consumo en el navegador depende del tamaño del SVG y del número de celdas mapeadas. El plugin no tiene polling propio; solo se actualiza cuando Grafana le envía nuevos datos.

### Despliegue Docker recomendado

| Recurso | Valor |
|---|---|
| **Memoria Grafana** | 512 MB (incluye Grafana + todos sus plugins) |
| **CPU** | 1 core |
| **Disco** | 1.5 MB adicionales para el plugin |

Estos son los valores **totales de Grafana**, no exclusivos del plugin. ToBeFlow no necesita recursos adicionales más allá de lo que Grafana ya consume.

---

## 9. Seguridad

### Plugin sin firma

ToBeFlow no está firmado en el registro oficial de Grafana. Esto requiere:

```ini
[plugins]
allow_loading_unsigned_plugins = tobeit-tobeflow-panel
```

Implicaciones:
- Grafana muestra un aviso de "plugin sin firmar" en la UI
- El administrador asume la responsabilidad de la integridad del plugin
- Se recomienda montar el directorio del plugin como **read-only** (`:ro`) en producción

### Sanitización SVG

- Todo contenido SVG se procesa con **DOMPurify v3.1+**
- Se eliminan: `<script>`, `onclick`, `onerror`, `onload`, `javascript:` URIs
- Los SVGs cargados por URL también pasan por sanitización
- Se respeta la política CSP de Grafana

### Sin acceso a backend

- El plugin es `type: "panel"` — no tiene componente backend
- No puede acceder al filesystem del servidor
- No puede hacer peticiones HTTP propias (depende de los datasources de Grafana)
- No almacena datos fuera del JSON del dashboard

---

## 10. Stack tecnológico

### Build

| Componente | Versión |
|---|---|
| TypeScript | 5.5 |
| React | 18 |
| Webpack | 5 |
| SWC (transpilador) | swc-loader (reemplazo de Babel) |
| Target | ES2021 |

### Dependencias runtime

| Paquete | Versión | Uso |
|---|---|---|
| `@grafana/data` | ^11.0.0 | Tipos y utils de Grafana |
| `@grafana/ui` | ^11.0.0 | Componentes UI de Grafana |
| `dompurify` | ^3.1.0 | Sanitización de SVG |
| `react` | 18.x | UI framework (peer) |
| `react-dom` | 18.x | DOM rendering (peer) |

### Herramientas de desarrollo

- **ESLint** + config Grafana
- **Jest** + React Testing Library para tests
- **LiveReloadPlugin** para hot-reload en desarrollo
- Build custom (no usa `@grafana/create-plugin`)

---

## 11. Limitaciones conocidas

| Limitación | Detalle |
|---|---|
| **Sin firma oficial** | No está en el catálogo de Grafana; requiere configuración manual |
| **Frontend-only** | No puede ejecutar alerting propio, solo visualización |
| **SVG en DOM** | SVGs muy grandes (10.000+ nodos) pueden ralentizar el navegador |
| **Sin persistencia propia** | Toda la configuración vive en el JSON del dashboard |
| **Draw.io embebido** | Requiere conexión a internet para el editor visual Draw.io (diagrams.net) |
| **Tooltips** | No persistentes — desaparecen al mover el ratón fuera del elemento |
| **Multi-panel** | Múltiples paneles en un dashboard multiplican el consumo de RAM del navegador |
| **Variables Grafana** | Soportadas en campos específicos, no en todos los campos de configuración |

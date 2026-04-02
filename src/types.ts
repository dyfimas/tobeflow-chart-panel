// ─────────────────────────────────────────────────────────────
// types.ts – Tipos y configuración del plugin SVG Flow Panel
// Replica la CONFIG del script de producción jsATC_optimizado
// ─────────────────────────────────────────────────────────────

/** Tipos de dato para formato de valor en tooltip.
 *  Acepta tanto los tipos legacy ('auto','pct100',...) como unidades nativas
 *  de Grafana devueltas por UnitPicker (ej: 'percent','percentunit','bytes','s','ms','short','none','bool','dateTimeAsIso'). */
export type MetricDataType = string;

/** Modo de texto para un elemento SVG */
export type TextMode = 'off' | 'metric' | 'custom';

/** Operador de comparacion para umbrales */
export type ThresholdOp = '>' | '>=' | '<' | '<=' | '=' | '!=';

/** Tipo de agregación para reducir múltiples valores a uno solo */
export type AggregationType =
  | 'last'
  | 'lastNotNull'
  | 'first'
  | 'firstNotNull'
  | 'min'
  | 'max'
  | 'sum'
  | 'avg'
  | 'count'
  | 'delta'
  | 'range'
  | 'diff'
  | 'timeOfLastPoint';

/** Modo de visibilidad de un elemento SVG */
export type VisibilityMode = 'always' | 'when-data' | 'when-ok' | 'when-alert' | 'when-nodata';

/** An SVG overlay layer (Multi-SVG layer support) */
export interface SvgLayer {
  id: string;
  name: string;
  svgSource: string;
  visible: boolean;
  opacity: number;
  zIndex: number;
}

/** Umbral de color personalizado para una metrica */
export interface MetricThreshold {
  value: number;
  color: string;
  op?: ThresholdOp;
}

/** Value mapping: transforma un valor numérico/string en un texto personalizado */
export interface ValueMapping {
  type?: 'value' | 'range' | 'regex' | 'comparison';  // default 'value'
  value: string;   // valor a comparar (como string, ej: "0", "1", "true") — para type='value' y 'comparison'
  from?: string;   // rango inicio (para type='range')
  to?: string;     // rango fin (para type='range')
  pattern?: string; // regex pattern (para type='regex')
  op?: '<' | '>' | '<=' | '>=' | '=' | '!=';  // operador de comparación (para type='comparison')
  text: string;    // texto a mostrar, ej: "OK", "NOK"
  color?: string;  // color opcional, ej: "#73BF69" o "#F2495C"
}

/** Asignación de una métrica individual con alias, tipo de dato y umbrales */
export interface MetricAssignment {
  field: string;
  alias: string;
  dataType: MetricDataType;
  thresholds?: MetricThreshold[];
  /** Campo opcional para agrupar (e.g. system.filesystem.mount_point).
   *  Si se define, se muestra una entrada por cada valor único de este campo. */
  groupByField?: string;
  /** Value mappings: transforma valores en textos personalizados.
   *  Ej: [{value: "0", text: "NOK"}, {value: "1", text: "OK"}] */
  valueMappings?: ValueMapping[];
  /** Modo de texto SVG: 'off' = no reemplaza, 'metric' = muestra valor, 'custom' = plantilla libre */
  textMode?: TextMode;
  /** Plantilla libre (solo si textMode='custom').
   *  Usa {{value}}, {{alias}}, {{field}}, {{status}}, {{status:OK:NOK}}, {{host}}, {{color}}. */
  textTemplate?: string;
  /** Tipo de agregación. Default: 'last' (último valor). */
  aggregation?: AggregationType;
  /** Campo host alternativo para esta métrica (ej: monitor.name). Sobreescribe el global. */
  hostField?: string;
  /** Patrón de filtrado para métricas string. Soporta wildcards (*). Ej: *BAMBOO* */
  filterPattern?: string;
  /** refId de la query de Grafana para esta métrica. Si vacío, usa el del CellMapping. */
  refId?: string;
  /** Si true, el color de esta métrica en el tooltip se muestra siempre como NORMAL (verde). */
  skipThresholdColor?: boolean;
  /** Si true, esta métrica no contribuye a la severidad (color) de la celda. */
  skipCellSeverity?: boolean;
}

/** Mapeo manual de un elemento SVG a un host y métricas específicas */
export interface CellMapping {
  id: string;
  cellId: string;
  hostName: string;
  metrics: MetricAssignment[];
  label: string;
  /** Optional description for documentation/notes */
  description?: string;
  dataLink?: string;
  /** refId de la query de Grafana a utilizar (A, B, C...). Si vacío, usa todas. */
  refId?: string;
  /** Campo host alternativo para este mapeo (ej: monitor.name). Sobreescribe el global. */
  hostField?: string;
  /** Modo de visibilidad del elemento SVG. Default: 'always'. */
  visibility?: VisibilityMode;
  /** Si true, todas las métricas de este mapeo se muestran en verde (ignora thresholds). */
  skipThresholdColor?: boolean;
  /** Si true, ninguna métrica de este mapeo contribuye al color de la celda. */
  skipCellSeverity?: boolean;
}

/** Tooltip display mode */
export type TooltipMode = 'detailed' | 'compact' | 'off';
export type TooltipPinKey = 'alt' | 'shift' | 'ctrl' | 'meta';

/** Configurable tooltip appearance */
export interface TooltipConfig {
  /** Display mode: detailed (default) shows full grid, compact shows single-line summary, off disables */
  mode: TooltipMode;
  /** Max width in px (default 380) */
  maxWidth: number;
  /** Font size in px (default 12) */
  fontSize: number;
  /** Font family (default: inherit) */
  fontFamily: string;
  /** Background color (default: rgba(15, 23, 42, 0.95)) */
  backgroundColor: string;
  /** Text color (default: #ffffff) */
  textColor: string;
  /** Border color (default: rgba(255, 255, 255, 0.1)) */
  borderColor: string;
  /** Border radius in px (default: 4) */
  borderRadius: number;
  /** Padding in px (default: 12) */
  padding: number;
  /** Opacity 0-1 (default: 0.95) */
  opacity: number;
  /** Backdrop blur in px */
  backdropBlur: number;
  /** Tooltip shadow color */
  shadowColor: string;
  /** Tooltip shadow blur radius in px */
  shadowBlur: number;
  /** Tooltip header background color */
  headerBackgroundColor: string;
  /** Show severity badge in header */
  showSeverity: boolean;
  /** Show timestamp row */
  showTimestamp: boolean;
  /** Show tiny evolution charts per metric */
  showMiniCharts: boolean;
  /** Height of mini charts in px */
  miniChartHeight: number;
  /** Maximum number of points rendered in each mini chart */
  miniChartPoints: number;
  /** Key used to keep tooltip pinned and interactive */
  pinKey: TooltipPinKey;
  /** Extra CSS for advanced tooltip styling. Use :tooltip as the selector root. */
  customCss: string;
  /** Optional HTML template for tooltip content. Placeholders: {{hostname}}, {{severity}}, {{time}}, {{metricsHtml}}, {{severityColor}} */
  htmlTemplate: string;
}

/** Visual theme configuration for the panel shell and SVG effects */
export interface VisualStyleConfig {
  panelBackgroundColor: string;
  panelBorderColor: string;
  panelBorderRadius: number;
  panelPadding: number;
  panelBoxShadow: string;
  panelBackdropBlur: number;
  hoverGlowColor: string;
  hoverGlowRadius: number;
  hoverBrightness: number;
  criticalGlowColor: string;
  criticalGlowMin: number;
  criticalGlowMax: number;
  criticalPulseDuration: number;
  locateGlowColor: string;
  locateGlowRadius: number;
  noDataStrokeColor: string;
  noDataStrokeDasharray: string;
  noDataOpacity: number;
  containerColorCritical: string;
  containerColorMajor: string;
  containerColorMinor: string;
  containerColorWarning: string;
  containerColorNormal: string;
  containerColorNoData: string;
  clickFlashColor: string;
  clickFlashDuration: number;
  /** Extra CSS for advanced panel/SVG styling. Use :scope as the selector root. */
  customCss: string;
}

/** Opciones del panel que el usuario configura en el editor */
export interface SvgFlowOptions {
  svgSource: string;
  svgUrl: string;
  clickUrlTemplate: string;
  debugMode: boolean;
  hostField: string;
  hostMappingJson: string;
  customThresholdsJson: string;
  /** P4: Override METRICAS_CONFIG from the panel editor (JSON). */
  metricsConfigJson: string;
  /** Editable autodiscover metric templates (JSON array of MetricAssignment). */
  autodiscoverTemplatesJson: string;
  cellMappings: CellMapping[];
  globalThresholds: { mode: string; steps: MetricThreshold[] };
  /** Tooltip appearance configuration */
  tooltipConfig: TooltipConfig;
  /** Panel shell and SVG visual styling */
  visualStyle: VisualStyleConfig;
  /** Multi-SVG overlay layers (stacked on top of the base SVG) */
  layers?: SvgLayer[];
  /** Show severity color legend overlay in a corner of the panel */
  showSeverityLegend?: boolean;
  /** Show a "no data" message when no metrics are available */
  showNoDataMessage?: boolean;
  /** Show a loading spinner while the SVG is being fetched/processed */
  showLoadingIndicator?: boolean;
  /** Show a visual indicator when pick-mode (cell selection) is active */
  showPickModeIndicator?: boolean;
}

export const DEFAULT_TOOLTIP_CONFIG: TooltipConfig = {
  mode: 'detailed',
  maxWidth: 380,
  fontSize: 12,
  fontFamily: 'inherit',
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: 4,
  padding: 12,
  opacity: 0.95,
  backdropBlur: 14,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowBlur: 32,
  headerBackgroundColor: 'transparent',
  showSeverity: true,
  showTimestamp: true,
  showMiniCharts: true,
  miniChartHeight: 26,
  miniChartPoints: 40,
  pinKey: 'alt',
  customCss: '',
  htmlTemplate: '',
};

export const DEFAULT_VISUAL_STYLE: VisualStyleConfig = {
  panelBackgroundColor: 'transparent',
  panelBorderColor: 'transparent',
  panelBorderRadius: 0,
  panelPadding: 0,
  panelBoxShadow: 'none',
  panelBackdropBlur: 0,
  hoverGlowColor: 'rgba(255, 255, 255, 0.3)',
  hoverGlowRadius: 8,
  hoverBrightness: 1.15,
  criticalGlowColor: 'rgba(218, 32, 32, 0.9)',
  criticalGlowMin: 4,
  criticalGlowMax: 12,
  criticalPulseDuration: 2,
  locateGlowColor: 'rgba(60, 140, 255, 0.9)',
  locateGlowRadius: 35,
  noDataStrokeColor: '#90a4ae',
  noDataStrokeDasharray: '6 3',
  noDataOpacity: 0.6,
  containerColorCritical: '#da2020',
  containerColorMajor: '#f7b911',
  containerColorMinor: '#faec2d',
  containerColorWarning: '#42a5f5',
  containerColorNormal: '#2fda2f',
  containerColorNoData: '#90a4ae',
  clickFlashColor: '#00ff88',
  clickFlashDuration: 600,
  customCss: '',
};

// ─── Severidades ────────────────────────────────────────────

/** Ordered metric keys for tooltip rendering */
export const METRIC_DISPLAY_ORDER = ['cpu', 'memoria', 'swap', 'ping', 'disco', 'proceso'] as const;

/** Common host identity field names across providers */
export const HOST_IDENTITY_FIELDS = [
  'host.name',
  'host.hostname',
  'host_name',
  'hostname',
  'agent.name',
  'agent_name',
  'host',
  'instance',
  'node',
  'server',
  'computer',
  'monitor.name',
] as const;

export enum Severity {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  CRITICO = 'CRITICO',
  SIN_DATOS = 'SIN_DATOS',
}

// ─── Colores de producción ──────────────────────────────────

export const COLORES: Record<string, string> = {
  CRITICO: '#da2020',
  MAJOR: '#f7b911',
  MINOR: '#faec2d',
  WARNING: '#42a5f5',
  NORMAL: '#2fda2f',
  SIN_DATOS: '#90a4ae',
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  [Severity.CRITICO]: COLORES.CRITICO,
  [Severity.MAJOR]: COLORES.MAJOR,
  [Severity.MINOR]: COLORES.MINOR,
  [Severity.WARNING]: COLORES.WARNING,
  [Severity.NORMAL]: COLORES.NORMAL,
  [Severity.SIN_DATOS]: COLORES.SIN_DATOS,
};

// ─── Umbrales ───────────────────────────────────────────────

export interface Umbrales {
  CRITICO: number;
  MAJOR: number;
  MINOR?: number;
  WARNING?: number;
}

export const UMBRALES_DEFAULT: Umbrales = {
  CRITICO: 90,
  MAJOR: 80,
};

export interface UmbralesServidor {
  cpu?: Umbrales;
  memoria?: Umbrales;
  disco?: Umbrales;
  swap?: Umbrales;
}

// ─── Umbrales personalizados por servidor ───────────────────
// Los umbrales por servidor se configuran desde el panel con customThresholdsJson.
// Este objeto se mantiene vacío por defecto.

export const UMBRALES_PERSONALIZADOS: Record<string, UmbralesServidor> = {};

// ─── Configuración de métricas ──────────────────────────────

export type MetricType = 'porcentaje' | 'boolean';

export interface MetricConfig {
  nombre: string;
  campos: string[];
  tipo: MetricType;
  umbrales: Umbrales | null;
}

/**
 * Configuración por defecto — campos genéricos, agnósticos del proveedor.
 * Para campos específicos (Metricbeat, Prometheus, etc.) configúralos desde
 * el panel editor en "06. Avanzado → Metrics Config (JSON)".
 */
export const DEFAULT_METRICAS_CONFIG: Record<string, MetricConfig> = {
  cpu: {
    nombre: 'CPU',
    campos: ['cpu', 'cpu_usage', 'cpu_percent', 'cpu_total'],
    tipo: 'porcentaje',
    umbrales: { CRITICO: 90, MAJOR: 80, MINOR: 70, WARNING: 60 },
  },
  memoria: {
    nombre: 'RAM',
    campos: ['memory', 'mem_usage', 'ram', 'memory_percent'],
    tipo: 'porcentaje',
    umbrales: { CRITICO: 90, MAJOR: 80, MINOR: 70, WARNING: 60 },
  },
  swap: {
    nombre: 'SWAP',
    campos: ['swap', 'swap_usage', 'swap_percent'],
    tipo: 'porcentaje',
    umbrales: { CRITICO: 90, MAJOR: 80, MINOR: 70, WARNING: 60 },
  },
  ping: {
    nombre: 'PING',
    campos: ['status', 'up', 'ping', 'reachable'],
    tipo: 'boolean',
    umbrales: null,
  },
  disco: {
    nombre: 'DISCO AVG',
    campos: ['disk_usage', 'filesystem', 'disco', 'disk_percent'],
    tipo: 'porcentaje',
    umbrales: { CRITICO: 90, MAJOR: 85, MINOR: 75, WARNING: 65 },
  },
  proceso: {
    nombre: 'PROCESS',
    campos: ['count', 'value', 'process'],
    tipo: 'boolean',
    umbrales: null,
  },
};

/**
 * Preset de campos Metricbeat/Elastic para infraestructura.
 * Úsalo como base para metricsConfigJson en el panel editor.
 */
export const METRICBEAT_PRESET: Record<string, Partial<MetricConfig>> = {
  cpu: { campos: ['system.cpu.total.norm.pct', 'system.cpu.usage'] },
  memoria: { campos: ['system.memory.actual.used.pct', 'system.memory.usage'] },
  swap: { campos: ['system.memory.swap.used.pct', 'system.memory.swap.usage'] },
  ping: { campos: ['summary.up'] },
  disco: { campos: ['system.filesystem.used.pct', 'system.fsstat.total_size.used'] },
  proceso: { campos: ['Count', 'process.name', 'process.cmd', 'process.exe'] },
};

export const PROMETHEUS_PRESET: Record<string, Partial<MetricConfig>> = {
  cpu: { campos: ['node_cpu_seconds_total', 'cpu_usage_idle', '1 - avg(rate(node_cpu_seconds_total{mode="idle"}))'] },
  memoria: { campos: ['node_memory_MemAvailable_bytes', 'node_memory_MemTotal_bytes', 'memory_usage_percent'] },
  swap: { campos: ['node_memory_SwapFree_bytes', 'node_memory_SwapTotal_bytes'] },
  ping: { campos: ['up', 'probe_success'] },
  disco: { campos: ['node_filesystem_avail_bytes', 'node_filesystem_size_bytes', 'disk_usage_percent'] },
  proceso: { campos: ['namedprocess_namegroup_num_procs', 'process_resident_memory_bytes'] },
};

export const TELEGRAF_PRESET: Record<string, Partial<MetricConfig>> = {
  cpu: { campos: ['usage_idle', 'usage_system', 'usage_user', 'cpu_usage_idle'] },
  memoria: { campos: ['mem_used_percent', 'mem_available_percent'] },
  swap: { campos: ['swap_used_percent', 'swap_total', 'swap_free'] },
  ping: { campos: ['ping_result_code', 'ping_average_response_ms'] },
  disco: { campos: ['disk_used_percent', 'disk_total', 'disk_free'] },
  proceso: { campos: ['procstat_num_threads', 'procstat_memory_rss', 'processes_total'] },
};

export const NODE_EXPORTER_PRESET: Record<string, Partial<MetricConfig>> = {
  cpu: { campos: ['node_cpu_seconds_total', 'instance:node_cpu_utilisation:rate5m'] },
  memoria: { campos: ['node_memory_MemAvailable_bytes', 'instance:node_memory_utilisation:ratio'] },
  swap: { campos: ['node_memory_SwapFree_bytes', 'instance:node_memory_swap_io_pages:rate5m'] },
  ping: { campos: ['up'] },
  disco: { campos: ['node_filesystem_avail_bytes', 'node_filesystem_size_bytes'] },
  proceso: { campos: ['node_procs_running', 'node_procs_blocked'] },
};

/**
 * P4: Resuelve la configuración de métricas efectiva.
 * Si se proporciona un JSON personalizado, lo parsea y fusiona con los defaults.
 * Las claves del JSON sobreescriben las del default; campos se fusionan (union).
 * Soporta una clave especial "_preset": "metricbeat" para cargar campos predefinidos.
 */
export function resolveMetricsConfig(json?: string): Record<string, MetricConfig> {
  if (!json || !json.trim()) return DEFAULT_METRICAS_CONFIG;
  try {
    const custom: Record<string, Partial<MetricConfig>> & { _preset?: string } = JSON.parse(json);

    // Apply preset first, then custom overrides
    const PRESETS: Record<string, Record<string, Partial<MetricConfig>>> = {
      metricbeat: METRICBEAT_PRESET,
      prometheus: PROMETHEUS_PRESET,
      telegraf: TELEGRAF_PRESET,
      node_exporter: NODE_EXPORTER_PRESET,
    };

    let base: Record<string, MetricConfig> = { ...DEFAULT_METRICAS_CONFIG };
    if (custom._preset && PRESETS[custom._preset]) {
      base = resolveMetricsConfigInternal(PRESETS[custom._preset], base);
    }

    // Remove special keys
    const { _preset, ...metricOverrides } = custom;

    return resolveMetricsConfigInternal(metricOverrides as Record<string, Partial<MetricConfig>>, base);
  } catch {
    return DEFAULT_METRICAS_CONFIG;
  }
}

function resolveMetricsConfigInternal(
  overrides: Record<string, Partial<MetricConfig>>,
  base: Record<string, MetricConfig>
): Record<string, MetricConfig> {
  const merged: Record<string, MetricConfig> = { ...base };
  for (const [key, val] of Object.entries(overrides)) {
    if (!val || typeof val !== 'object') continue;
    const existing = merged[key];
    if (existing) {
      merged[key] = {
        nombre: val.nombre ?? existing.nombre,
        campos: val.campos ? [...new Set([...val.campos, ...existing.campos])] : existing.campos,
        tipo: val.tipo ?? existing.tipo,
        umbrales: val.umbrales !== undefined ? val.umbrales : existing.umbrales,
      };
    } else {
      merged[key] = {
        nombre: val.nombre ?? key,
        campos: val.campos ?? [],
        tipo: val.tipo ?? 'porcentaje',
        umbrales: val.umbrales !== undefined ? val.umbrales : null,
      };
    }
  }
  return merged;
}

// ─── Mapeo de hosts por defecto ─────────────────────────────
// Los mapeos se configuran desde el panel con hostMappingJson.
// Este objeto se mantiene vacío por defecto.

export const MAPEO_HOSTS_DEFAULT: Record<string, string> = {};

// ─── Datos extraídos ────────────────────────────────────────

export interface MetricValue {
  value: number;
  severity: Severity;
  label: string;
  unit: string;
  raw?: number;
}

export interface HostMetrics {
  hostname: string;
  normalizedHost: string;
  cellId: string;
  metrics: Map<string, MetricValue>;
  severity: Severity;
  isCombined?: boolean;
}

export interface HostMapping {
  hostAliases: Record<string, string>;
  multiHost: Record<string, string[]>;
}

// ─── Funciones de umbrales ──────────────────────────────────

export function obtenerUmbralesParaServidor(
  servidor: string,
  metricKey: string,
  customThresholds?: Record<string, UmbralesServidor>,
  metricsConfig?: Record<string, MetricConfig>
): Umbrales {
  const thresholds = customThresholds || UMBRALES_PERSONALIZADOS;
  const serverThresholds = thresholds[servidor];
  if (serverThresholds) {
    const metricThresholds = serverThresholds[metricKey as keyof UmbralesServidor];
    if (metricThresholds) return metricThresholds;
  }
  const cfg = metricsConfig || DEFAULT_METRICAS_CONFIG;
  const metricConfig = cfg[metricKey];
  if (metricConfig?.umbrales) return metricConfig.umbrales;
  return UMBRALES_DEFAULT;
}

export function determinarSeveridad(valor: number, umbrales: Umbrales): Severity {
  if (valor >= umbrales.CRITICO) return Severity.CRITICO;
  if (valor >= umbrales.MAJOR) return Severity.MAJOR;
  if (umbrales.MINOR !== undefined && valor >= umbrales.MINOR) return Severity.MINOR;
  if (umbrales.WARNING !== undefined && valor >= umbrales.WARNING) return Severity.WARNING;
  return Severity.NORMAL;
}

export function obtenerColorFinal(
  metrics: Map<string, MetricValue>,
  servidor: string,
  customThresholds?: Record<string, UmbralesServidor>,
  metricsConfig?: Record<string, MetricConfig>
): { color: string; severity: Severity } {
  if (metrics.size === 0) {
    return { color: COLORES.SIN_DATOS, severity: Severity.SIN_DATOS };
  }

  const cfg = metricsConfig || DEFAULT_METRICAS_CONFIG;

  const severityOrder: Record<Severity, number> = {
    [Severity.NORMAL]: 0,
    [Severity.WARNING]: 1,
    [Severity.MINOR]: 2,
    [Severity.MAJOR]: 3,
    [Severity.CRITICO]: 4,
    [Severity.SIN_DATOS]: -1,
  };

  let worstSeverity = Severity.NORMAL;

  for (const [key, mv] of metrics) {
    const metricConfig = cfg[key];

    // Boolean metrics: 0 = down/stopped = CRITICAL
    if (metricConfig?.tipo === 'boolean') {
      if (mv.value === 0 || mv.value < 1) {
        return { color: COLORES.CRITICO, severity: Severity.CRITICO };
      }
      continue;
    }

    // Percentage metrics: use per-server thresholds
    const umbrales = obtenerUmbralesParaServidor(servidor, key, customThresholds);
    const sev = determinarSeveridad(mv.value, umbrales);
    if (sev === Severity.CRITICO) {
      return { color: COLORES.CRITICO, severity: Severity.CRITICO };
    }
    if (severityOrder[sev] > severityOrder[worstSeverity]) {
      worstSeverity = sev;
    }
  }

  return { color: SEVERITY_COLORS[worstSeverity], severity: worstSeverity };
}

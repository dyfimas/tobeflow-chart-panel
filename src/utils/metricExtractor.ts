// ─────────────────────────────────────────────────────────────
// metricExtractor.ts – Extrae métricas de Grafana DataFrames
// Replica MetricasExtractor del script de producción
// ─────────────────────────────────────────────────────────────
import { DataFrame, Field } from '@grafana/data';
import {
  HostMetrics,
  MetricValue,
  Severity,
  DEFAULT_METRICAS_CONFIG,
  MetricConfig,
  UmbralesServidor,
  obtenerUmbralesParaServidor,
  determinarSeveridad,
  obtenerColorFinal,
} from '../types';
import { normHost } from './hostMapping';

// ─── Identificar campos por nombre ──────────────────────────

/**
 * Busca un campo en un DataFrame. Soporta nombres con puntos
 * (como system.cpu.total.norm.pct) comparando de forma flexible.
 */
function findFieldByName(frame: DataFrame, ...names: string[]): Field | undefined {
  for (const name of names) {
    const lower = name.toLowerCase();
    const field = frame.fields.find((f) => {
      const fn = (f.name || '').toLowerCase();
      const displayName = (f.config?.displayName || '').toLowerCase();
      return fn === lower || displayName === lower ||
        fn.endsWith(lower) || lower.endsWith(fn);
    });
    if (field) return field;
  }
  return undefined;
}

/**
 * Busca campos que coincidan con un patrón parcial.
 * Para filesystem, puede haber múltiples campos (uno por mount point).
 */
function findFieldsByPattern(frame: DataFrame, pattern: string): Field[] {
  const lower = pattern.toLowerCase();
  return frame.fields.filter((f) => {
    const fn = (f.name || '').toLowerCase();
    return fn.includes(lower) && f.type === 'number';
  });
}

/**
 * Obtiene el último valor numérico de un field.
 * P6: Si hay un campo de tipo time en el frame, usa el timestamp más reciente
 * en lugar de confiar en el orden del array.
 */
function lastNumericValue(field: Field, timeField?: Field): number | null {
  if (!field.values || field.values.length === 0) return null;

  // If we have a time field, find the index with the highest timestamp
  // among rows that have a valid numeric value
  if (timeField && timeField.values && timeField.values.length === field.values.length) {
    let bestIdx = -1;
    let bestTs = -Infinity;
    for (let i = 0; i < field.values.length; i++) {
      const val = field.values[i];
      const ts = timeField.values[i];
      const numVal = typeof val === 'number' ? val : typeof val === 'string' ? parseFloat(val) : NaN;
      if (!isNaN(numVal) && ts != null && ts > bestTs) {
        bestTs = ts as number;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const val = field.values[bestIdx];
      return typeof val === 'number' ? val : parseFloat(String(val));
    }
  }

  // Fallback: iterate from end to find last non-null/non-NaN value
  for (let i = field.values.length - 1; i >= 0; i--) {
    const val = field.values[i];
    if (typeof val === 'number' && !isNaN(val) && val !== null) return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// ─── Extracción principal ───────────────────────────────────

/**
 * Extrae métricas de todos los DataFrames agrupándolas por host.
 * 
 * Soporta el formato de Elasticsearch que usa el script de producción:
 * - Campos: @timestamp, host.name, system.cpu.total.norm.pct, etc.
 * - Múltiples filas por host (toma la última)
 * - Filesystem con múltiples mount points (calcula media)
 * 
 * También soporta formatos genéricos:
 * - CSV con campos host, cpu, ram, etc.
 * - DataFrames wide y long
 */
export function extractMetrics(
  series: DataFrame[],
  hostFieldName: string = 'host.name',
  filterRefId?: string,
  metricsConfig?: Record<string, MetricConfig>
): Map<string, HostMetrics> {
  const cfg = metricsConfig || DEFAULT_METRICAS_CONFIG;
  const result = new Map<string, HostMetrics>();

  // When using a custom host field (not standard names), be strict:
  // only process frames that actually have that field as a column.
  const standardHostFields = ['host.name', 'host', 'hostname', 'host_name', 'instance', 'server'];
  const isCustomHostField = !standardHostFields.includes(hostFieldName);

  for (const frame of series) {
    // Filter by refId if specified
    if (filterRefId && frame.refId && frame.refId !== filterRefId) {
      continue;
    }

    // Intentar encontrar el campo host
    let hostField: Field | undefined;
    if (isCustomHostField) {
      // Strict: only match exact custom field name (e.g. monitor.name)
      hostField = frame.fields.find(
        (f) => (f.name || '').toLowerCase() === hostFieldName.toLowerCase()
      );
    } else {
      // Standard: use fallback chain
      hostField = findFieldByName(
        frame,
        hostFieldName, 'host.name', 'host', 'hostname', 'host_name',
        'instance', 'server'
      );
    }

    if (hostField) {
      processFrameWithHosts(frame, hostField, result, cfg);
    } else {
      // Column not found: try label-based fallback (covers ES Terms aggregation
      // where identity is in field.labels, not in columns)
      const host = extractHostFromFrame(frame, hostFieldName);
      if (host) {
        processFrameAsHost(frame, host, result, cfg);
      }
    }
  }

  return result;
}

/**
 * Procesa un DataFrame con campo host explícito.
 * Agrupa filas por host y toma el último valor de cada métrica.
 */
function processFrameWithHosts(
  frame: DataFrame,
  hostField: Field,
  result: Map<string, HostMetrics>,
  cfg: Record<string, MetricConfig> = DEFAULT_METRICAS_CONFIG
): void {
  const len = hostField.values.length;

  // Agrupar por host: use the RAW value as primary key so exact lookups work
  // (e.g. service.address = "http://harvard.condis.es:9273/metrics")
  const hostLastRows = new Map<string, number[]>();
  for (let i = 0; i < len; i++) {
    const rawHost = String(hostField.values[i] || '').trim();
    if (!rawHost) continue;
    if (!hostLastRows.has(rawHost)) {
      hostLastRows.set(rawHost, []);
    }
    hostLastRows.get(rawHost)!.push(i);
  }

  // Procesar cada host
  for (const [rawHost, rows] of hostLastRows) {
    const host = getOrCreateHost(result, rawHost);

    // P6: Find the time field for timestamp-based lookups
    const timeField = frame.fields.find((f) => f.type === 'time' || f.name === '@timestamp');

    // Extraer métricas conocidas
    for (const [metricKey, config] of Object.entries(cfg)) {
      const value = extractMetricValue(frame, config, rows, timeField);
      if (value !== null) {
        const severity = getMetricSeverity(value, metricKey, config, rawHost);
        const metricValue: MetricValue = {
          value: config.tipo === 'porcentaje' && value <= 1 ? value * 100 : value,
          severity,
          label: config.nombre,
          unit: config.tipo === 'porcentaje' ? '%' : '',
          raw: value,
        };
        host.metrics.set(metricKey, metricValue);
        // Also store under exact field name so cell mapping dropdown selections match
        for (const campo of config.campos) {
          const field = findFieldByName(frame, campo);
          if (field && field.name !== metricKey && !host.metrics.has(field.name)) {
            host.metrics.set(field.name, { ...metricValue, label: field.config?.displayName || field.name });
          }
        }
      }
    }

    // Extraer filesystem/disco como media
    const discoAvg = extractFilesystemAverage(frame, rows);
    if (discoAvg !== null && !host.metrics.has('disco')) {
      const metricConfig = cfg['disco'] || DEFAULT_METRICAS_CONFIG['disco'];
      const displayVal = discoAvg <= 1 ? discoAvg * 100 : discoAvg;
      const severity = getMetricSeverity(displayVal, 'disco', metricConfig, rawHost);
      host.metrics.set('disco', {
        value: displayVal,
        severity,
        label: 'DISCO AVG',
        unit: '%',
        raw: discoAvg,
      });
    }

    // Extraer métricas adicionales no conocidas
    extractDynamicMetrics(frame, rows, host, cfg);
  }
}

/**
 * Extrae el valor de una métrica buscando por sus campos conocidos.
 * P6: Usa campo timestamp para encontrar la fila más reciente, no asume orden por índice.
 */
function extractMetricValue(
  frame: DataFrame,
  config: MetricConfig,
  rows: number[],
  timeField?: Field
): number | null {
  for (const fieldName of config.campos) {
    const field = findFieldByName(frame, fieldName);
    if (field) {
      // P6: If we have a time field, find the row with the latest timestamp
      if (timeField && timeField.values.length === field.values.length) {
        let bestIdx = -1;
        let bestTs = -Infinity;
        for (const rowIdx of rows) {
          const val = field.values[rowIdx];
          const ts = timeField.values[rowIdx];
          const numVal = typeof val === 'number' ? val : typeof val === 'string' ? parseFloat(val) : NaN;
          if (!isNaN(numVal) && ts != null && (ts as number) > bestTs) {
            bestTs = ts as number;
            bestIdx = rowIdx;
          }
        }
        if (bestIdx >= 0) {
          const val = field.values[bestIdx];
          return typeof val === 'number' ? val : parseFloat(String(val));
        }
      }

      // Fallback: scan from end to find last valid value
      for (let i = rows.length - 1; i >= 0; i--) {
        const val = field.values[rows[i]];
        if (typeof val === 'number' && !isNaN(val)) return val;
        if (typeof val === 'string') {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) return parsed;
        }
      }
    }
  }
  return null;
}

/**
 * Extrae la media de uso de filesystem (disco).
 * En Elasticsearch, hay múltiples registros por host con system.filesystem.mount_point
 * y system.filesystem.used.pct para cada uno.
 */
function extractFilesystemAverage(frame: DataFrame, rows: number[]): number | null {
  const mountField = findFieldByName(frame, 'system.filesystem.mount_point', 'mount_point');
  const usedField = findFieldByName(frame, 'system.filesystem.used.pct', 'filesystem.used.pct');

  if (!mountField || !usedField) return null;

  const values: number[] = [];
  const seenMounts = new Set<string>();

  // Take the latest value per mount point
  for (let i = rows.length - 1; i >= 0; i--) {
    const idx = rows[i];
    const mount = String(mountField.values[idx] || '');
    const val = usedField.values[idx];

    if (mount && !seenMounts.has(mount) && typeof val === 'number' && !isNaN(val)) {
      seenMounts.add(mount);
      values.push(val);
    }
  }

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Extrae métricas dinámicas (no en METRICAS_CONFIG).
 * P6: Usa timestamp para determinar la fila más reciente.
 */
function extractDynamicMetrics(
  frame: DataFrame,
  rows: number[],
  host: HostMetrics,
  cfg: Record<string, MetricConfig> = DEFAULT_METRICAS_CONFIG
): void {
  const knownFields = new Set<string>();
  for (const config of Object.values(cfg)) {
    config.campos.forEach((c) => knownFields.add(c.toLowerCase()));
  }
  knownFields.add('host.name');
  knownFields.add('host');
  knownFields.add('hostname');
  knownFields.add('@timestamp');
  knownFields.add('timestamp');
  knownFields.add('system.filesystem.mount_point');

  const timeField = frame.fields.find((f) => f.type === 'time' || f.name === '@timestamp');

  for (const field of frame.fields) {
    if (field.type !== 'number') continue;
    const fn = (field.name || '').toLowerCase();
    if (knownFields.has(fn)) continue;

    // P6: Use timestamp to find the most recent row
    let val: number | undefined;
    if (timeField && timeField.values.length === field.values.length) {
      let bestIdx = -1;
      let bestTs = -Infinity;
      for (const rowIdx of rows) {
        const v = field.values[rowIdx];
        const ts = timeField.values[rowIdx];
        if (typeof v === 'number' && !isNaN(v) && ts != null && (ts as number) > bestTs) {
          bestTs = ts as number;
          bestIdx = rowIdx;
        }
      }
      if (bestIdx >= 0) val = field.values[bestIdx] as number;
    }
    if (val === undefined) {
      // Fallback: last row
      const lastRow = rows[rows.length - 1];
      const v = field.values[lastRow];
      if (typeof v === 'number' && !isNaN(v)) val = v;
    }

    if (val !== undefined) {
      const key = fn.replace(/\./g, '_');
      const isPct = fn.includes('pct');
      const metricVal: MetricValue = {
        value: val <= 1 && isPct ? val * 100 : val,
        severity: Severity.NORMAL,
        label: field.config?.displayName || field.name || key,
        unit: isPct ? '%' : '',
        raw: val,
      };
      if (!host.metrics.has(key)) {
        host.metrics.set(key, metricVal);
      }
      if (field.name && !host.metrics.has(field.name) && field.name !== key) {
        host.metrics.set(field.name, { ...metricVal, label: field.config?.displayName || field.name });
      }
    }
  }
}

/**
 * Determina la severidad de un valor de métrica.
 */
function getMetricSeverity(
  value: number,
  metricKey: string,
  config: MetricConfig,
  _hostNorm: string
): Severity {
  if (config.tipo === 'boolean') {
    return value > 0 ? Severity.NORMAL : Severity.CRITICO;
  }
  const displayVal = value <= 1 && config.tipo === 'porcentaje' ? value * 100 : value;
  if (config.umbrales) {
    return determinarSeveridad(displayVal, config.umbrales);
  }
  return Severity.NORMAL;
}

/**
 * Procesa un DataFrame como un solo host.
 * Para queries de métricas (ES Terms agg), cada frame representa un host/monitor.
 * Almacena métricas bajo la clave de config Y bajo el nombre exacto del field
 * para que los cell mappings puedan encontrarlas por el nombre del dropdown.
 */
function processFrameAsHost(
  frame: DataFrame,
  rawHost: string,
  result: Map<string, HostMetrics>,
  cfg: Record<string, MetricConfig> = DEFAULT_METRICAS_CONFIG
): void {
  const norm = normHost(rawHost);
  if (!norm && !rawHost) return;
  const host = getOrCreateHost(result, rawHost);

  // Count numeric fields to detect Terms-agg single-value frames
  const numericFields = frame.fields.filter((f) => f.type === 'number');
  const timeField = frame.fields.find((f) => f.type === 'time');

  for (const field of frame.fields) {
    if (field.type !== 'number') continue;
    const val = lastNumericValue(field, timeField);
    if (val !== null) {
      const metricKey = identifyMetric(field.name, cfg);
      if (metricKey) {
        const config = cfg[metricKey];
        const displayVal = config.tipo === 'porcentaje' && val <= 1 ? val * 100 : val;
        const metricValue: MetricValue = {
          value: displayVal,
          severity: getMetricSeverity(val, metricKey, config, rawHost),
          label: config.nombre,
          unit: config.tipo === 'porcentaje' ? '%' : '',
          raw: val,
        };
        host.metrics.set(metricKey, metricValue);
        // Also store under exact field name so cell mapping dropdown selections match
        if (field.name !== metricKey && !host.metrics.has(field.name)) {
          host.metrics.set(field.name, { ...metricValue, label: field.config?.displayName || field.name });
        }
      } else {
        // Unmatched numeric field - store as dynamic metric (same logic as extractDynamicMetrics)
        const key = field.name.replace(/\./g, '_');
        if (!host.metrics.has(key)) {
          const isPct = field.name.toLowerCase().includes('pct');
          host.metrics.set(key, {
            value: val <= 1 && isPct ? val * 100 : val,
            severity: Severity.NORMAL,
            label: field.config?.displayName || field.name || key,
            unit: isPct ? '%' : '',
            raw: val,
          });
        }
        // Also under exact field name for dropdown matching
        if (!host.metrics.has(field.name)) {
          const isPct = field.name.toLowerCase().includes('pct');
          host.metrics.set(field.name, {
            value: val <= 1 && isPct ? val * 100 : val,
            severity: Severity.NORMAL,
            label: field.config?.displayName || field.name,
            unit: isPct ? '%' : '',
            raw: val,
          });
        }
      }
    }
  }

  // For Terms aggregation frames: the alias expansion changes the field name
  // (e.g. "sonda BAMBOO-PING" instead of "summary.up"). Store the value under
  // a generic '_value' key so cell mappings can find it regardless of alias.
  // P7: Store under namespaced key '_value:<refId>' to avoid collisions
  // when multiple queries target the same host with different single-value frames.
  // Also store under generic '_value' only if not already set by a previous refId,
  // plus an indexed fallback '_value:N' for consumers without refId awareness.
  if (numericFields.length === 1) {
    const singleField = numericFields[0];
    const val = lastNumericValue(singleField, timeField);
    if (val !== null) {
      const isPct = singleField.name.toLowerCase().includes('pct');
      const metricValue: MetricValue = {
        value: val <= 1 && isPct ? val * 100 : val,
        severity: Severity.NORMAL,
        label: singleField.config?.displayName || singleField.name,
        unit: isPct ? '%' : '',
        raw: val,
      };
      // Generic fallback (first writer wins)
      if (!host.metrics.has('_value')) {
        host.metrics.set('_value', metricValue);
      } else {
        // P7: Store subsequent values as _value:2, _value:3, etc.
        let idx = 2;
        while (host.metrics.has(`_value:${idx}`)) idx++;
        host.metrics.set(`_value:${idx}`, metricValue);
      }
      // Namespaced key so different refIds don't collide
      const refId = frame.refId || '';
      if (refId) {
        host.metrics.set(`_value:${refId}`, metricValue);
      }
    }
  }
}

/**
 * Identifica a qué métrica pertenece un campo.
 */
function identifyMetric(
  fieldName: string,
  cfg: Record<string, MetricConfig> = DEFAULT_METRICAS_CONFIG
): string | null {
  const lower = fieldName.toLowerCase();
  for (const [key, config] of Object.entries(cfg)) {
    for (const campo of config.campos) {
      if (lower === campo.toLowerCase() || lower.includes(campo.toLowerCase())) {
        return key;
      }
    }
  }
  return null;
}

/**
 * Extrae hostname de labels del frame.
 * Soporta campo personalizado (e.g. 'monitor.name') para queries de métricas
 * con Terms aggregation donde el host está en los labels, no en columnas.
 */
function extractHostFromFrame(frame: DataFrame, hostFieldName?: string): string | null {
  for (const field of frame.fields) {
    if (field.labels) {
      // Check custom host field first (e.g. monitor.name from ES Terms agg)
      // Try both dot notation (monitor.name) and underscore (monitor_name)
      if (hostFieldName) {
        const customHost = field.labels[hostFieldName];
        if (customHost) return customHost;
        // ES/Grafana converts dots to underscores in label keys
        const normKey = hostFieldName.replace(/\./g, '_');
        if (normKey !== hostFieldName) {
          const normHost = field.labels[normKey];
          if (normHost) return normHost;
        }
      }
      const host =
        field.labels['host.name'] || field.labels['host_name'] ||
        field.labels['host'] || field.labels['hostname'] || field.labels['instance'];
      if (host) return host;
    }
  }
  return frame.name || frame.refId || null;
}

/**
 * Obtiene o crea un HostMetrics.
 * Stores under the raw value AND the normalized value so both exact and
 * normalized lookups work (e.g. "http://harvard.condis.es:9273/metrics" and "harvard").
 */
/**
 * Obtiene o crea un HostMetrics.
 * P5: Solo almacena bajo la clave raw para evitar colisiones cuando
 * distintos hosts normalizan al mismo nombre (e.g. "harvard.condis.es" y
 * "http://harvard.condis.es:9273/metrics" ambos normalizan a "harvard").
 * La búsqueda normalizada se hace en findHostInMetrics del hostResolver.
 */
function getOrCreateHost(
  map: Map<string, HostMetrics>,
  rawHost: string
): HostMetrics {
  // Try raw first
  let host = map.get(rawHost);
  if (host) return host;

  // Create new – only store under raw key
  const norm = normHost(rawHost);
  host = {
    hostname: rawHost,
    normalizedHost: norm || rawHost,
    cellId: '',
    metrics: new Map(),
    severity: Severity.SIN_DATOS,
  };
  map.set(rawHost, host);
  return host;
}

/**
 * Calcula la severidad final de un host.
 */
export function computeHostSeverity(
  host: HostMetrics,
  customThresholds?: Record<string, UmbralesServidor>,
  metricsConfig?: Record<string, MetricConfig>
): Severity {
  const { severity } = obtenerColorFinal(host.metrics, host.normalizedHost, customThresholds, metricsConfig);
  return severity;
}

/**
 * Combina métricas de múltiples hosts.
 */
export function combineHosts(
  hosts: HostMetrics[],
  combinedName: string
): HostMetrics {
  const combined: HostMetrics = {
    hostname: combinedName,
    normalizedHost: combinedName,
    cellId: combinedName,
    metrics: new Map(),
    severity: Severity.NORMAL,
    isCombined: true,
  };

  for (const host of hosts) {
    for (const [key, val] of host.metrics) {
      combined.metrics.set(`${host.normalizedHost}.${key}`, {
        ...val,
        label: `${host.hostname} ${val.label}`,
      });
    }
  }

  const severityOrder: Record<Severity, number> = {
    [Severity.SIN_DATOS]: -1,
    [Severity.NORMAL]: 0,
    [Severity.WARNING]: 1,
    [Severity.MINOR]: 2,
    [Severity.MAJOR]: 3,
    [Severity.CRITICO]: 4,
  };
  combined.severity = hosts
    .map((h) => h.severity)
    .reduce((worst, s) =>
      severityOrder[s] > severityOrder[worst] ? s : worst,
      Severity.NORMAL
    );

  return combined;
}

// ─── Timeline support ───────────────────────────────────────

/**
 * Collect all unique, sorted timestamps from the given DataFrames.
 * Returns an ascending array of epoch milliseconds.
 */
export function collectTimestamps(series: DataFrame[]): number[] {
  const set = new Set<number>();
  for (const frame of series) {
    const tf = frame.fields.find((f) => f.type === 'time' || f.name === '@timestamp');
    if (!tf) continue;
    for (let i = 0; i < tf.values.length; i++) {
      const v = tf.values[i];
      if (typeof v === 'number' && isFinite(v)) {
        set.add(v);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Extract metrics at a specific timestamp (or the closest row before it).
 * For each host, picks the row whose timestamp is closest to `targetTs`
 * without exceeding it. Falls back to the nearest row if no exact match.
 */
export function extractMetricsAtTime(
  series: DataFrame[],
  hostFieldName: string,
  targetTs: number,
  metricsConfig?: Record<string, MetricConfig>
): Map<string, HostMetrics> {
  // Filter each frame to only the rows at/near the target timestamp,
  // then delegate to the standard extractMetrics.
  const cfg = metricsConfig || DEFAULT_METRICAS_CONFIG;
  const filtered: DataFrame[] = [];

  for (const frame of series) {
    const tf = frame.fields.find((f) => f.type === 'time' || f.name === '@timestamp');
    if (!tf || tf.values.length === 0) {
      filtered.push(frame);
      continue;
    }

    // Find the best row index per host for this timestamp
    // Strategy: for each distinct timestamp, find the one closest to targetTs
    let bestIdx = 0;
    let bestDiff = Math.abs((tf.values[0] as number) - targetTs);
    for (let i = 1; i < tf.values.length; i++) {
      const diff = Math.abs((tf.values[i] as number) - targetTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    // Collect all rows at that exact timestamp
    const targetRowTs = tf.values[bestIdx] as number;
    const rowIndices: number[] = [];
    for (let i = 0; i < tf.values.length; i++) {
      if (tf.values[i] === targetRowTs) {
        rowIndices.push(i);
      }
    }

    // Build a new frame with only those rows
    const slicedFrame: DataFrame = {
      ...frame,
      length: rowIndices.length,
      fields: frame.fields.map((f) => ({
        ...f,
        values: rowIndices.map((idx) => f.values[idx]),
      })),
    };
    filtered.push(slicedFrame);
  }

  return extractMetrics(filtered, hostFieldName, undefined, cfg);
}

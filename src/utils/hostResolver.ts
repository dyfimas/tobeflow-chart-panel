// ─────────────────────────────────────────────────────────────
// hostResolver.ts – Búsqueda de hosts y valores en DataFrames
// Extraído de SvgFlowPanel.tsx para mejor mantenibilidad
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import { HostMetrics, MetricValue } from '../types';
import { normHost } from './hostMapping';

/**
 * Busca un host en el mapa de métricas (case-insensitive).
 */
export function findHostInMetrics(
  metrics: Map<string, HostMetrics>,
  hostName: string
): HostMetrics | null {
  const direct = metrics.get(hostName);
  if (direct) return direct;

  // Intentar normalizado
  const norm = normHost(hostName);
  if (norm) {
    const byNorm = metrics.get(norm);
    if (byNorm) return byNorm;
  }

  // Case-insensitive fallback
  const lower = hostName.toLowerCase();
  for (const [key, val] of metrics) {
    if (key.toLowerCase() === lower) return val;
  }

  // Substring/contains fallback — P5: require significant overlap to avoid false positives
  if (norm && norm.length >= 4) {
    let bestMatch: HostMetrics | null = null;
    let bestScore = 0;
    for (const [key, val] of metrics) {
      const keyNorm = normHost(key);
      if (!keyNorm || keyNorm.length < 4) continue;
      if (keyNorm.includes(norm) || norm.includes(keyNorm)) {
        const shorter = Math.min(keyNorm.length, norm.length);
        const longer = Math.max(keyNorm.length, norm.length);
        const score = shorter / longer;
        if (score > 0.5 && score > bestScore) {
          bestScore = score;
          bestMatch = val;
        }
      }
    }
    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Busca una métrica específica en un HostMetrics.
 * Soporta claves conocidas (cpu, memoria...) y campos raw (system.cpu.total.norm.pct).
 * P7: Si se proporciona refId, intenta primero _value:<refId> antes del genérico _value.
 */
export function findMetricInHost(host: HostMetrics, metricKey: string, refId?: string): MetricValue | null {
  // Lookup directo
  const direct = host.metrics.get(metricKey);
  if (direct) return direct;

  // Intentar con puntos → underscores (formato de extractDynamicMetrics)
  const normalized = metricKey.replace(/\./g, '_');
  const byNorm = host.metrics.get(normalized);
  if (byNorm) return byNorm;

  // Coincidencia parcial con límites de segmento (., _, -, inicio/fin)
  const segRe = (needle: string) => new RegExp(`(^|[._\\-])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([._\\-]|$)`, 'i');
  for (const [key, val] of host.metrics) {
    if (key === '_value' || key.startsWith('_value:')) continue; // skip generic/namespaced fallback in partial phase
    if (segRe(metricKey).test(key) || segRe(key).test(metricKey)) return val;
  }

  // P7: Fallback — prefer namespaced _value:<refId> when refId is known
  if (refId) {
    const namespaced = host.metrics.get(`_value:${refId}`);
    if (namespaced) return namespaced;
  }

  // Generic _value fallback (Terms aggregation single-value frames)
  const fallback = host.metrics.get('_value');
  if (fallback) return fallback;

  return null;
}

/**
 * Busca el valor raw de un campo en los DataFrames para un host dado.
 * Soporta dos patrones:
 * 1. Column-based: el host está en una columna del DataFrame (queries de logs/tabla)
 * 2. Label-based: el host está en los labels del field o en frame.name (queries de métricas con Terms agg)
 */
export function findRawFieldValue(
  series: DataFrame[],
  hostname: string,
  fieldName: string,
  hostFieldName: string = 'host.name'
): string | number | null {
  const normTarget = normHost(hostname);

  // Pass 1: Column-based lookup (original behavior for log/table queries)
  for (const frame of series) {
    const hostField = frame.fields.find(
      (f) => f.name === hostFieldName || f.name === 'host.name' ||
             f.name === 'host' || f.name === 'hostname'
    );
    const targetField = frame.fields.find((f) => f.name === fieldName);
    if (!hostField || !targetField) continue;

    for (let i = hostField.values.length - 1; i >= 0; i--) {
      const h = String(hostField.values[i] || '');
      if (h === hostname || normHost(h) === normTarget) {
        const val = targetField.values[i];
        if (val !== null && val !== undefined) return val;
      }
    }
  }

  // Pass 2: Label-based lookup (for metric queries with ES Terms aggregation)
  for (const frame of series) {
    let frameHost: string | null = null;
    for (const field of frame.fields) {
      if (field.labels) {
        const labelHost = field.labels[hostFieldName] ||
          field.labels[hostFieldName.replace(/\./g, '_')] ||
          field.labels['host.name'] || field.labels['host_name'] || field.labels['host'];
        if (labelHost) { frameHost = labelHost; break; }
      }
    }
    if (!frameHost) frameHost = frame.name || null;
    if (!frameHost) continue;
    if (frameHost !== hostname && normHost(frameHost) !== normTarget) continue;

    // Found the frame for this host - get the target field's last value
    const targetField = frame.fields.find((f) => f.name === fieldName);
    if (targetField && targetField.values.length > 0) {
      const val = targetField.values[targetField.values.length - 1];
      if (val !== null && val !== undefined) return val;
    }

    // Fallback: field name doesn't match (alias expansion in Terms agg).
    // If there's exactly one numeric field, use it.
    const numericFields = frame.fields.filter((f) => f.type === 'number');
    if (numericFields.length === 1 && numericFields[0].values.length > 0) {
      const val = numericFields[0].values[numericFields[0].values.length - 1];
      if (val !== null && val !== undefined) return val;
    }
  }

  return null;
}

/**
 * Busca el timestamp del último punto de datos para un host.
 * Usa el campo de timestamp (time type) para encontrar el valor más reciente,
 * en lugar de confiar en el índice del array (P6).
 */
export function findLastTimestamp(
  series: DataFrame[],
  hostname: string,
  hostFieldName: string = 'host.name'
): number | null {
  const normTarget = normHost(hostname);
  let bestTs: number | null = null;

  for (const frame of series) {
    const hostField = frame.fields.find(
      (f) => f.name === hostFieldName || f.name === 'host.name' ||
             f.name === 'host' || f.name === 'hostname'
    );
    const timeField = frame.fields.find((f) => f.type === 'time');
    if (!timeField) continue;

    if (hostField) {
      for (let i = 0; i < hostField.values.length; i++) {
        const h = String(hostField.values[i] || '');
        if (h === hostname || normHost(h) === normTarget) {
          const ts = timeField.values[i] as number;
          if (ts != null && (bestTs === null || ts > bestTs)) {
            bestTs = ts;
          }
        }
      }
    } else {
      // Label-based
      let frameHost: string | null = null;
      for (const field of frame.fields) {
        if (field.labels) {
          const labelHost = field.labels[hostFieldName] || field.labels['host.name'] || field.labels['host'];
          if (labelHost) { frameHost = labelHost; break; }
        }
      }
      if (!frameHost) frameHost = frame.name || null;
      if (frameHost && (frameHost === hostname || normHost(frameHost) === normTarget)) {
        // Scan all time values to find the maximum (most recent)
        for (let i = 0; i < timeField.values.length; i++) {
          const ts = timeField.values[i] as number;
          if (ts != null && (bestTs === null || ts > bestTs)) {
            bestTs = ts;
          }
        }
      }
    }
  }
  return bestTs;
}

// ─────────────────────────────────────────────────────────────
// aggregation.ts – Funciones de agregación y recopilación de valores
// Extraído de SvgFlowPanel.tsx para mejor mantenibilidad
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import { AggregationType } from '../types';
import { normHost } from './hostMapping';

function hostMatchesCandidate(hostname: string, candidate: string): boolean {
  const targetNorm = normHost(hostname);
  const candNorm = normHost(candidate);
  if (!targetNorm || !candNorm) return false;
  if (candNorm === targetNorm) return true;
  // Terms/alias series names may include both host + group token
  // e.g. "grumman - Q:\\". Accept contains in either direction.
  return candNorm.includes(targetNorm) || targetNorm.includes(candNorm);
}

function inferGroupFromSeriesName(
  frameName: string,
  hostname: string,
  groupByFieldName: string
): string {
  const raw = String(frameName || '').trim();
  if (!raw) return '';

  // Common filesystem mount token in Windows (C:\, D:\, ...)
  if (groupByFieldName.toLowerCase().includes('mount_point')) {
    const m = raw.match(/[A-Za-z]:\\/);
    if (m) return m[0];
  }

  // Split aliases like "host - group" or "group | host"
  const parts = raw
    .split(/\s+-\s+|\s+\|\s+|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const nonHost = parts.find((p) => !hostMatchesCandidate(hostname, p));
    if (nonHost) return nonHost;
  }

  // Last resort: remove hostname text if present
  const hostRe = new RegExp(hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  const cleaned = raw.replace(hostRe, '').replace(/^\W+|\W+$/g, '').trim();
  return cleaned || raw;
}

/**
 * Agrega un array de valores numéricos según el tipo de agregación.
 */
export function aggregateValues(values: number[], agg: AggregationType): number | null {
  if (values.length === 0) return null;
  switch (agg) {
    case 'first':
      return values[0];
    case 'firstNotNull':
      return values.find(v => v !== null && !isNaN(v)) ?? null;
    case 'last':
      return values[values.length - 1];
    case 'lastNotNull':
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] !== null && !isNaN(values[i])) return values[i];
      }
      return null;
    case 'min':
      return Math.min(...values.filter(v => !isNaN(v)));
    case 'max':
      return Math.max(...values.filter(v => !isNaN(v)));
    case 'sum':
      return values.filter(v => !isNaN(v)).reduce((s, v) => s + v, 0);
    case 'avg': {
      const valid = values.filter(v => !isNaN(v));
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    }
    case 'count':
      return values.filter(v => v !== null && v !== undefined).length;
    case 'delta':
      return values.length >= 2 ? values[values.length - 1] - values[0] : values[0];
    case 'range': {
      const valid2 = values.filter(v => !isNaN(v));
      return valid2.length >= 2 ? Math.max(...valid2) - Math.min(...valid2) : 0;
    }
    case 'diff':
      return values.length >= 2 ? Math.abs(values[values.length - 1] - values[values.length - 2]) : 0;
    case 'timeOfLastPoint':
      return values[values.length - 1];
    default:
      return values[values.length - 1];
  }
}

/**
 * Recopila TODOS los valores numéricos de un campo en los DataFrames para un host dado.
 * Soporta column-based y label-based host identification.
 */
export function collectAllFieldValues(
  series: DataFrame[],
  hostname: string,
  fieldName: string,
  hostFieldName: string = 'host.name'
): number[] {
  const values: number[] = [];
  const normTarget = normHost(hostname);

  // Pass 1: Column-based
  for (const frame of series) {
    const hostField = frame.fields.find(
      (f) => f.name === hostFieldName || f.name === 'host.name' ||
             f.name === 'host' || f.name === 'hostname'
    );
    const targetField = frame.fields.find((f) => f.name === fieldName);
    if (!hostField || !targetField) continue;

    for (let i = 0; i < hostField.values.length; i++) {
      const h = String(hostField.values[i] || '');
      if (h === hostname || normHost(h) === normTarget) {
        const val = targetField.values[i];
        if (val !== null && val !== undefined) {
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (!isNaN(num)) values.push(num);
        }
      }
    }
  }

  // Pass 2: Label-based
  if (values.length === 0) {
    for (const frame of series) {
      let frameHost: string | null = null;
      for (const field of frame.fields) {
        if (field.labels) {
          const labelHost = field.labels[hostFieldName] ||
            field.labels[hostFieldName.replace(/\./g, '_')] ||
            field.labels['host.name'] || field.labels['host'];
          if (labelHost) { frameHost = labelHost; break; }
        }
      }
      if (!frameHost) frameHost = frame.name || null;
      if (!frameHost) continue;
      if (!hostMatchesCandidate(hostname, frameHost)) continue;

      const targetField = frame.fields.find((f) => f.name === fieldName);
      if (targetField) {
        for (let i = 0; i < targetField.values.length; i++) {
          const val = targetField.values[i];
          if (val !== null && val !== undefined) {
            const num = typeof val === 'number' ? val : parseFloat(String(val));
            if (!isNaN(num)) values.push(num);
          }
        }
      }
    }
  }

  return values;
}

/**
 * Busca TODOS los valores de un campo agrupados por otro campo para un host dado.
 * Retorna un array de {group, value} – uno por cada valor único del groupByField.
 * Toma el último valor disponible para cada grupo (más reciente).
 * Soporta column-based y label-based host identification.
 */
export function findGroupedFieldValues(
  series: DataFrame[],
  hostname: string,
  valueFieldName: string,
  groupByFieldName: string,
  hostFieldName: string = 'host.name'
): Array<{ group: string; value: number | string }> {
  const groups = new Map<string, number | string>();
  const normTarget = normHost(hostname);

  // Pass 1: Column-based lookup
  for (const frame of series) {
    const hostField = frame.fields.find(
      (f) => f.name === hostFieldName || f.name === 'host.name' ||
             f.name === 'host' || f.name === 'hostname'
    );
    const valueField = frame.fields.find((f) => f.name === valueFieldName);
    const groupField = frame.fields.find((f) => f.name === groupByFieldName);
    if (!hostField || !valueField || !groupField) continue;

    for (let i = 0; i < hostField.values.length; i++) {
      const h = String(hostField.values[i] || '');
      if (h !== hostname && normHost(h) !== normTarget) continue;

      const val = valueField.values[i];
      const grp = String(groupField.values[i] ?? '');
      if (val !== null && val !== undefined && grp) {
        groups.set(grp, val);
      }
    }
  }

  // Pass 2: Label-based lookup
  if (groups.size === 0) {
    for (const frame of series) {
      let frameHost: string | null = null;
      for (const field of frame.fields) {
        if (field.labels) {
          const labelHost = field.labels[hostFieldName] ||
            field.labels[hostFieldName.replace(/\./g, '_')] ||
            field.labels['host.name'] || field.labels['host'];
          if (labelHost) { frameHost = labelHost; break; }
        }
      }
      if (!frameHost) frameHost = frame.name || null;
      if (!frameHost) continue;
      if (!hostMatchesCandidate(hostname, frameHost)) continue;

      const valueField = frame.fields.find((f) => f.name === valueFieldName);
      const groupField = frame.fields.find((f) => f.name === groupByFieldName);
      if (valueField && groupField) {
        for (let i = 0; i < valueField.values.length; i++) {
          const val = valueField.values[i];
          const grp = String(groupField.values[i] ?? '');
          if (val !== null && val !== undefined && grp) {
            groups.set(grp, val);
          }
        }
        continue;
      }

      // Terms-query fallback: dynamic series often has only [Time, Value]
      // and the group value encoded in frame.name or alias.
      const numericField = valueField || frame.fields.find((f) => f.type === 'number');
      if (!numericField || numericField.values.length === 0) continue;
      const lastVal = numericField.values[numericField.values.length - 1];
      if (lastVal === null || lastVal === undefined) continue;
      const grp = inferGroupFromSeriesName(frame.name || frameHost, hostname, groupByFieldName);
      if (!grp) continue;
      groups.set(grp, lastVal as any);
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, value]) => ({ group, value }));
}

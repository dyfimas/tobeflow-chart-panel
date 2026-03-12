// ─────────────────────────────────────────────────────────────
// metricsIndex.ts – Pre-computed indexes for O(1) lookups
// P13: Pre-index field values per host
// P14: Pre-compute host search index for fast resolution
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import { HostMetrics } from '../types';
import { normHost } from './hostMapping';

// ─── P13: Field value index ────────────────────────────────

/**
 * Pre-computed index: hostname → fieldName → numeric values[].
 * Built once per data refresh, queried O(1) per cell-metric.
 */
export interface FieldValueIndex {
  /** Exact lookup: host → field → values */
  byHost: Map<string, Map<string, number[]>>;
  /** Lookup keyed by normHost(hostname) → field → values (for fuzzy match) */
  byNormHost: Map<string, Map<string, number[]>>;
}

/**
 * Pre-index all field values grouped by host.
 * Scans all DataFrames once and builds two maps:
 * - byHost: exact hostname key → fieldName → number[]
 * - byNormHost: normHost(hostname) → fieldName → number[]
 *
 * Supports both column-based and label-based host identification.
 */
export function buildFieldValueIndex(
  series: DataFrame[],
  hostFieldName: string = 'host.name'
): FieldValueIndex {
  const byHost = new Map<string, Map<string, number[]>>();
  const byNormHost = new Map<string, Map<string, number[]>>();

  const standardHostFields = new Set([
    hostFieldName, 'host.name', 'host', 'hostname',
  ]);

  for (const frame of series) {
    // Detect host identification mode
    const hostField = frame.fields.find((f) => standardHostFields.has(f.name));

    if (hostField) {
      // Column-based: each row has a host value
      const numericFields = frame.fields.filter(
        (f) => f.type === 'number' || f.type === 'string'
      );
      for (let i = 0; i < hostField.values.length; i++) {
        const h = String(hostField.values[i] || '');
        if (!h) continue;

        const hostMap = getOrCreateMap(byHost, h);
        const norm = normHost(h);
        const normMap = norm ? getOrCreateMap(byNormHost, norm) : hostMap;

        for (const field of numericFields) {
          if (field === hostField) continue;
          const val = field.values[i];
          if (val === null || val === undefined) continue;
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (isNaN(num)) continue;

          const fieldName = field.name;
          pushToFieldArray(hostMap, fieldName, num);
          if (normMap !== hostMap) {
            pushToFieldArray(normMap, fieldName, num);
          }
        }
      }
    } else {
      // Label-based: host from field.labels or frame.name
      let frameHost: string | null = null;
      for (const field of frame.fields) {
        if (field.labels) {
          const labelHost = field.labels[hostFieldName] ||
            field.labels['host.name'] || field.labels['host'];
          if (labelHost) { frameHost = labelHost; break; }
        }
      }
      if (!frameHost) frameHost = frame.name || null;
      if (!frameHost) continue;

      const hostMap = getOrCreateMap(byHost, frameHost);
      const norm = normHost(frameHost);
      const normMap = norm ? getOrCreateMap(byNormHost, norm) : hostMap;

      for (const field of frame.fields) {
        if (field.type !== 'number') continue;
        const fieldName = field.name;
        for (let i = 0; i < field.values.length; i++) {
          const val = field.values[i];
          if (val === null || val === undefined) continue;
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (!isNaN(num)) {
            pushToFieldArray(hostMap, fieldName, num);
            if (normMap !== hostMap) {
              pushToFieldArray(normMap, fieldName, num);
            }
          }
        }
      }
    }
  }

  return { byHost, byNormHost };
}

/**
 * Query the field value index for a specific host + field.
 * Falls back from exact → normalized match.
 */
export function queryFieldIndex(
  index: FieldValueIndex,
  hostname: string,
  fieldName: string
): number[] {
  // Exact match first
  const exactHost = index.byHost.get(hostname);
  if (exactHost) {
    const vals = exactHost.get(fieldName);
    if (vals && vals.length > 0) return vals;
  }

  // Normalized match
  const norm = normHost(hostname);
  if (norm) {
    const normHost = index.byNormHost.get(norm);
    if (normHost) {
      const vals = normHost.get(fieldName);
      if (vals && vals.length > 0) return vals;
    }
  }

  return [];
}

// ─── P14: Host search index ────────────────────────────────

/**
 * Pre-computed index mapping all host name variants to the
 * canonical key in the metrics Map. Built once per extractMetrics() call.
 */
export interface HostSearchIndex {
  /** Exact key → canonical key */
  exact: Map<string, string>;
  /** normHost(key) → canonical key */
  normalized: Map<string, string>;
  /** lowercase key → canonical key */
  lower: Map<string, string>;
}

/**
 * Build a search index from the metrics map. Maps:
 * - exact key → canonical key
 * - normHost(key) → canonical key
 * - lowercase key → canonical key
 *
 * findHostFast() then does O(1) lookups instead of O(n) scans.
 */
export function buildHostSearchIndex(
  metrics: Map<string, HostMetrics>
): HostSearchIndex {
  const exact = new Map<string, string>();
  const normalized = new Map<string, string>();
  const lower = new Map<string, string>();
  // P5: Track ambiguous normalized forms so collisions fall through to other lookups
  const ambiguousNorms = new Set<string>();

  for (const key of metrics.keys()) {
    exact.set(key, key);
    const norm = normHost(key);
    if (norm) {
      if (ambiguousNorms.has(norm)) {
        // Already known ambiguous — skip
      } else if (normalized.has(norm)) {
        // Collision detected — remove and mark ambiguous
        normalized.delete(norm);
        ambiguousNorms.add(norm);
      } else {
        normalized.set(norm, key);
      }
    }
    const lo = key.toLowerCase();
    if (!lower.has(lo)) {
      lower.set(lo, key);
    }
  }

  return { exact, normalized, lower };
}

/**
 * O(1) host lookup using the pre-computed search index.
 * Tries: exact → normHost → lowercase → partial (fallback O(n)).
 */
export function findHostFast(
  metrics: Map<string, HostMetrics>,
  index: HostSearchIndex,
  hostName: string
): HostMetrics | null {
  // 1. Exact match
  const exactKey = index.exact.get(hostName);
  if (exactKey) return metrics.get(exactKey) || null;

  // 2. Normalized match
  const norm = normHost(hostName);
  if (norm) {
    const normKey = index.normalized.get(norm);
    if (normKey) return metrics.get(normKey) || null;
  }

  // 3. Case-insensitive
  const lo = hostName.toLowerCase();
  const loKey = index.lower.get(lo);
  if (loKey) return metrics.get(loKey) || null;

  // 4. Partial/contains fallback (O(n) — only reached for truly ambiguous names)
  // P5: Require minimum 4 chars and significant overlap to avoid false positives
  if (norm && norm.length >= 4) {
    let bestMatch: HostMetrics | null = null;
    let bestScore = 0;
    for (const [key, val] of metrics) {
      const keyNorm = normHost(key);
      if (!keyNorm || keyNorm.length < 4) continue;
      // Calculate overlap ratio to prevent tiny substrings matching large hostnames
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

// ─── Helpers ────────────────────────────────────────────────

function getOrCreateMap(
  parent: Map<string, Map<string, number[]>>,
  key: string
): Map<string, number[]> {
  let child = parent.get(key);
  if (!child) {
    child = new Map();
    parent.set(key, child);
  }
  return child;
}

function pushToFieldArray(
  hostMap: Map<string, number[]>,
  fieldName: string,
  value: number
): void {
  let arr = hostMap.get(fieldName);
  if (!arr) {
    arr = [];
    hostMap.set(fieldName, arr);
  }
  arr.push(value);
}

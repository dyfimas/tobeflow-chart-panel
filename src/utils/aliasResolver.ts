// ─────────────────────────────────────────────────────────────
// aliasResolver.ts – Dynamic alias detection, Elasticsearch
// query parsing, and Cell Mapping validation
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';

// ─── Types ──────────────────────────────────────────────────

/** A template variable extracted from a Grafana alias string */
export interface AliasVariable {
  /** Type of template variable */
  type: 'term' | 'field' | 'tag' | 'value' | 'unknown';
  /** The field name referenced (e.g., 'monitor.name') */
  field: string;
  /** The raw template expression (e.g., '{{term monitor.name}}') */
  raw: string;
}

/** Analysis result for a single refId */
export interface RefIdAnalysis {
  refId: string;
  /** True if this refId produces multiple frames (= dynamic alias / Terms agg) */
  isDynamic: boolean;
  /** Number of DataFrames for this refId */
  frameCount: number;
  /** Label keys that have different values across frames (= grouping fields) */
  groupingLabels: string[];
  /** All unique values from grouping labels (= available hosts/identifiers) */
  expandedValues: string[];
  /** All label keys → Set of their unique values across all frames */
  allLabels: Map<string, Set<string>>;
  /** All unique numeric/time/string field names */
  fieldNames: string[];
  /** Frame names (often = expanded alias value) */
  frameNames: string[];
}

/** Result of matching a wildcard pattern against a list of values */
export interface PatternMatchResult {
  count: number;
  matches: string[];
}

/** A single validation item for a Cell Mapping */
export interface MappingValidation {
  level: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
}

// ─── Alias Template Parsing ─────────────────────────────────

/**
 * Parses a Grafana alias template string and extracts variable references.
 *
 * Supported patterns:
 *   {{term monitor.name}}        → Terms aggregation value
 *   {{field}}                    → Field name/value
 *   {{tag_host.name}}            → Tag (Prometheus style)
 *   {{value}}                    → Metric value
 *   {{monitor.name.keyword}}     → Arbitrary field reference
 */
export function parseAliasTemplate(alias: string): AliasVariable[] {
  if (!alias) return [];

  const results: AliasVariable[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = re.exec(alias)) !== null) {
    const inner = match[1].trim();
    const raw = match[0];

    if (inner.startsWith('term ')) {
      results.push({ type: 'term', field: inner.slice(5).trim(), raw });
    } else if (inner.startsWith('tag_')) {
      results.push({ type: 'tag', field: inner.slice(4).trim(), raw });
    } else if (inner === 'field') {
      results.push({ type: 'field', field: '', raw });
    } else if (inner === 'value') {
      results.push({ type: 'value', field: '', raw });
    } else if (inner.includes('.') || inner.includes('_')) {
      // Looks like a field path: {{monitor.name}}, {{host_name}}
      results.push({ type: 'term', field: inner, raw });
    } else {
      results.push({ type: 'unknown', field: inner, raw });
    }
  }

  return results;
}

/**
 * Checks if an alias string contains dynamic template variables.
 */
export function isDynamicAlias(alias: string): boolean {
  return /\{\{.+?\}\}/.test(alias || '');
}

// ─── Lucene Query Parsing ───────────────────────────────────

/**
 * Extracts values for a specific field from a Lucene query string.
 *
 * Supported patterns:
 *   field:(val1 val2 val3)             → ["val1", "val2", "val3"]
 *   field:(*BEACH* *PURPLE*)           → ["*BEACH*", "*PURPLE*"]
 *   field:value                        → ["value"]
 *   field:"exact value"                → ["exact value"]
 *   field:val1 OR field:val2           → ["val1", "val2"]
 *   field:(val1 OR val2 OR val3)       → ["val1", "val2", "val3"]
 */
export function parseLuceneFieldValues(query: string, fieldName: string): string[] {
  if (!query || !fieldName) return [];

  const values: string[] = [];
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern 1: field:(val1 val2 val3)  or  field:(val1 OR val2)
  const groupRe = new RegExp(escaped + ':\\s*\\(([^)]+)\\)', 'gi');
  let m;
  while ((m = groupRe.exec(query)) !== null) {
    const inner = m[1].trim();
    const tokens = tokenizeLucene(inner);
    for (const token of tokens) {
      const clean = token.replace(/^"|"$/g, '').trim();
      if (clean && clean.toUpperCase() !== 'OR' && clean.toUpperCase() !== 'AND') {
        values.push(clean);
      }
    }
  }

  // Pattern 2: field:value  (single value, not in parens)
  const singleRe = new RegExp(escaped + ':([^\\s()]+)', 'gi');
  while ((m = singleRe.exec(query)) !== null) {
    const val = m[1].trim();
    if (val.startsWith('(')) continue; // already handled above
    const clean = val.replace(/^"|"$/g, '').trim();
    if (clean && !values.includes(clean)) values.push(clean);
  }

  // Deduplicate
  return [...new Set(values)];
}

/**
 * Tokenizes a Lucene expression respecting quoted strings.
 */
function tokenizeLucene(expr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if ((ch === ' ' || ch === '\t') && !inQuote) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  return tokens;
}

// ─── DataFrame Analysis ─────────────────────────────────────

/**
 * Analyzes all DataFrames for a given refId to determine if it's dynamic
 * (produces multiple frames, typically from Terms aggregation with
 * a dynamic alias like `sonda {{term monitor.name}}`).
 */
export function analyzeRefId(series: DataFrame[], refId: string): RefIdAnalysis {
  const frames = series.filter((f) => f.refId === refId);
  const isDynamic = frames.length > 1;

  // Collect all labels across frames
  const allLabels = new Map<string, Set<string>>();
  const frameNames: string[] = [];
  const fieldNameSet = new Set<string>();

  for (const frame of frames) {
    if (frame.name) frameNames.push(frame.name);

    for (const field of frame.fields) {
      if (field.name) fieldNameSet.add(field.name);

      if (field.labels) {
        for (const [key, val] of Object.entries(field.labels)) {
          if (!allLabels.has(key)) allLabels.set(key, new Set());
          allLabels.get(key)!.add(val);
        }
      }
    }
  }

  // Labels that vary (more than 1 unique value) are the grouping fields
  const groupingLabels: string[] = [];
  for (const [key, values] of allLabels) {
    if (values.size > 1) {
      groupingLabels.push(key);
    }
  }

  // If only 1 unique value but multiple frames, the label is still grouping
  if (isDynamic && groupingLabels.length === 0) {
    for (const [key, values] of allLabels) {
      if (values.size >= 1) {
        groupingLabels.push(key);
      }
    }
  }

  // Expanded values: all unique values from grouping labels
  const expandedValues: string[] = [];
  const seenValues = new Set<string>();
  for (const label of groupingLabels) {
    const vals = allLabels.get(label);
    if (vals) {
      for (const v of vals) {
        if (!seenValues.has(v)) {
          seenValues.add(v);
          expandedValues.push(v);
        }
      }
    }
  }

  // Fallback: use frame names if no labels found
  if (expandedValues.length === 0 && frameNames.length > 1) {
    for (const name of frameNames) {
      if (!seenValues.has(name)) {
        seenValues.add(name);
        expandedValues.push(name);
      }
    }
  }

  return {
    refId,
    isDynamic,
    frameCount: frames.length,
    groupingLabels,
    expandedValues: expandedValues.sort(),
    allLabels,
    fieldNames: Array.from(fieldNameSet).sort(),
    frameNames,
  };
}

/**
 * Analyzes all refIds present in the DataFrames.
 * Returns a Map of refId → RefIdAnalysis.
 */
export function analyzeAllRefIds(series: DataFrame[]): Map<string, RefIdAnalysis> {
  const refIds = new Set<string>();
  for (const frame of series) {
    if (frame.refId) refIds.add(frame.refId);
  }

  const results = new Map<string, RefIdAnalysis>();
  for (const refId of refIds) {
    results.set(refId, analyzeRefId(series, refId));
  }
  return results;
}

// ─── Pattern Matching ───────────────────────────────────────

/**
 * Counts how many values in a list match a wildcard pattern.
 * Pattern uses `*` as wildcard (e.g., "*BAMBOO*", "PING-*").
 */
export function matchPattern(values: string[], pattern: string): PatternMatchResult {
  if (!pattern || !pattern.trim()) {
    return { count: values.length, matches: [...values] };
  }

  const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
  try {
    const re = new RegExp(regexStr, 'i');
    const matches = values.filter((v) => re.test(v));
    return { count: matches.length, matches };
  } catch {
    return { count: 0, matches: [] };
  }
}

// ─── Validation ─────────────────────────────────────────────

/**
 * Validates a Cell Mapping configuration against the available data.
 * Returns an array of warnings/errors/info items.
 */
export function validateMapping(
  mapping: {
    refId?: string;
    hostName: string;
    hostField?: string;
    metrics: Array<{ hostField?: string; filterPattern?: string; field: string }>;
  },
  analyses: Map<string, RefIdAnalysis>,
  availableHosts: string[]
): MappingValidation[] {
  const warnings: MappingValidation[] = [];

  // 1. Check if refId exists in data
  if (mapping.refId && !analyses.has(mapping.refId)) {
    warnings.push({
      level: 'error',
      message: `Query "${mapping.refId}" no tiene datos.`,
      field: 'refId',
    });
  }

  // 2. If refId is dynamic, check if hostName or filterPattern is configured
  if (mapping.refId) {
    const analysis = analyses.get(mapping.refId);
    if (analysis?.isDynamic) {
      const hasAnyHostConfig =
        mapping.hostName ||
        mapping.metrics.some((met) => met.filterPattern || met.hostField);

      if (!hasAnyHostConfig) {
        warnings.push({
          level: 'warning',
          message: `Query "${mapping.refId}" genera ${analysis.frameCount} series (alias dinamico). Configura hostName o filterPattern para seleccionar la correcta.`,
          field: 'hostName',
        });
      }

      // Info about available grouping labels
      if (analysis.groupingLabels.length > 0) {
        const maxShow = 8;
        const vals = analysis.expandedValues.slice(0, maxShow);
        const more = analysis.expandedValues.length > maxShow
          ? ` (+${analysis.expandedValues.length - maxShow} mas)`
          : '';
        warnings.push({
          level: 'info',
          message: `Agrupado por: ${analysis.groupingLabels.join(', ')} | Valores: ${vals.join(', ')}${more}`,
        });
      }
    }
  }

  // 3. Check if hostName exists in available hosts
  if (mapping.hostName && !mapping.hostName.includes('*') && !mapping.hostName.includes('$')) {
    const found = availableHosts.some(
      (h) => h.toLowerCase() === mapping.hostName.toLowerCase()
    );
    if (!found && availableHosts.length > 0) {
      warnings.push({
        level: 'warning',
        message: `Host "${mapping.hostName}" no encontrado en los datos actuales.`,
        field: 'hostName',
      });
    }
  }

  // 4. Per-metric validations
  for (let i = 0; i < mapping.metrics.length; i++) {
    const met = mapping.metrics[i];

    // filterPattern without hostField
    if (met.filterPattern && !met.hostField) {
      warnings.push({
        level: 'warning',
        message: `Metrica #${i + 1}: filterPattern requiere un hostField configurado.`,
        field: `metrics[${i}].hostField`,
      });
    }

    // hostField not found in data
    if (met.hostField && mapping.refId) {
      const analysis = analyses.get(mapping.refId);
      if (analysis) {
        const hfNorm = met.hostField.replace(/\./g, '_');
        const hasInLabels =
          analysis.allLabels.has(met.hostField) ||
          analysis.allLabels.has(hfNorm);
        const hasInFields = analysis.fieldNames.includes(met.hostField);

        if (!hasInLabels && !hasInFields) {
          warnings.push({
            level: 'warning',
            message: `Metrica #${i + 1}: hostField "${met.hostField}" no encontrado en Query "${mapping.refId}".`,
            field: `metrics[${i}].hostField`,
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Gets the list of available host/identifier values for a specific refId + label key.
 * Checks both field.labels and column values.
 */
export function getAvailableValuesForField(
  series: DataFrame[],
  refId: string,
  fieldName: string
): string[] {
  const values = new Set<string>();
  const normalizedKey = fieldName.replace(/\./g, '_');
  const frames = series.filter((f) => f.refId === refId);

  for (const frame of frames) {
    // Check labels
    for (const field of frame.fields) {
      if (field.labels) {
        const val = field.labels[fieldName] || field.labels[normalizedKey];
        if (val) values.add(val);
      }
    }
    // Check column values
    for (const field of frame.fields) {
      if (field.name === fieldName || field.name === normalizedKey) {
        for (let i = 0; i < field.values.length; i++) {
          const v = field.values[i];
          if (v && typeof v === 'string') values.add(v);
        }
      }
    }
    // Frame name as fallback — only if no label/column values were found
    // (frame.name is the expanded alias, e.g. "sonda BAMBOO-PING",
    //  but the label value is the raw term, e.g. "BAMBOO-PING")
    if (values.size === 0 && frame.name) values.add(frame.name);
  }

  return Array.from(values).sort();
}

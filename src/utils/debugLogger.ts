// ─────────────────────────────────────────────────────────────
// debugLogger.ts – Structured console logging for debug mode
// Only outputs when debugMode is enabled. Groups related logs.
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import { HostMetrics, CellMapping, Severity } from '../types';

const PREFIX = '%c[ToBeFlow]';
const STYLE_HEADER = 'color: #00bcd4; font-weight: bold; font-size: 12px;';
const STYLE_OK = 'color: #4caf50; font-weight: bold;';
const STYLE_WARN = 'color: #ff9800; font-weight: bold;';
const STYLE_ERR = 'color: #f44336; font-weight: bold;';
const STYLE_DIM = 'color: #90a4ae;';

let _enabled = false;

export function setDebugEnabled(enabled: boolean): void {
  _enabled = enabled;
}

export function isDebugEnabled(): boolean {
  return _enabled;
}

// ─── Data / Series ──────────────────────────────────────────

export function logDataSummary(series: DataFrame[], hostField: string): void {
  if (!_enabled) return;
  console.groupCollapsed(PREFIX + ' 📊 Data Summary', STYLE_HEADER);
  console.log(`%cSeries count: ${series.length}`, STYLE_DIM);
  console.log(`%cHost field: "${hostField}"`, STYLE_DIM);
  for (const frame of series) {
    const rows = frame.fields[0]?.values?.length ?? 0;
    const fieldNames = frame.fields.map(f => f.name);
    const hasHostField = fieldNames.some(f => f === hostField);
    console.log(
      `%c  [${frame.refId || '?'}] ${frame.name || '(unnamed)'} — ${rows} rows, ${frame.fields.length} fields`,
      STYLE_DIM,
    );
    console.log(`%c    Fields: ${fieldNames.join(', ')}`, STYLE_DIM);
    if (!hasHostField) {
      console.log(`%c    ⚠ Host field "${hostField}" NOT found in this frame`, STYLE_WARN);
    }
  }
  console.groupEnd();
}

// ─── Hosts Extracted ────────────────────────────────────────

export function logHostsExtracted(metricsMap: Map<string, HostMetrics>): void {
  if (!_enabled) return;
  console.groupCollapsed(PREFIX + ` 🖥 Hosts Extracted (${metricsMap.size})`, STYLE_HEADER);
  const bySeverity: Record<string, string[]> = {};
  for (const [key, host] of metricsMap) {
    const sev = host.severity || Severity.SIN_DATOS;
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(key);
    const metricKeys = Array.from(host.metrics.keys());
    console.log(
      `%c  ${key} → severity=${sev}, metrics=[${metricKeys.join(', ')}]`,
      sev === Severity.CRITICO ? STYLE_ERR :
      sev === Severity.WARNING || sev === Severity.MAJOR ? STYLE_WARN :
      sev === Severity.NORMAL ? STYLE_OK : STYLE_DIM,
    );
  }
  console.log('%cSeverity distribution:', STYLE_DIM);
  for (const [sev, hosts] of Object.entries(bySeverity)) {
    console.log(`%c  ${sev}: ${hosts.length}`, STYLE_DIM);
  }
  console.groupEnd();
}

// ─── Cell Mappings ──────────────────────────────────────────

export function logCellMappings(cellMappings: CellMapping[], metricsMap: Map<string, HostMetrics>): void {
  if (!_enabled) return;
  const hostsAvailable = new Set(metricsMap.keys());
  const problems: string[] = [];
  const mapped: string[] = [];

  console.groupCollapsed(PREFIX + ` 🗺 Cell Mappings (${cellMappings.length})`, STYLE_HEADER);
  for (const cm of cellMappings) {
    const host = cm.hostName || cm.cellId;
    const found = hostsAvailable.has(host);
    const metricCount = cm.metrics?.length || 0;
    if (!found && metricCount > 0) {
      problems.push(`Cell "${cm.cellId}" → host "${host}" NOT in data`);
    }
    mapped.push(cm.cellId);
    console.log(
      `%c  [${cm.cellId}] host="${host}" refId=${cm.refId || '-'} metrics=${metricCount} ${found ? '✓' : '✗ NOT FOUND'}`,
      found ? STYLE_OK : STYLE_WARN,
    );
  }
  if (problems.length) {
    console.log(`%c⚠ Problems (${problems.length}):`, STYLE_WARN);
    for (const p of problems) {
      console.log(`%c  • ${p}`, STYLE_WARN);
    }
  }
  console.groupEnd();
}

// ─── Single Cell Processing ─────────────────────────────────

export interface CellDebugInfo {
  cellId: string;
  resolvedHost: string | null;
  hostFound: boolean;
  severity: Severity;
  color: string;
  metricsCount: number;
  shapesCount: number;
  visible: boolean;
  problems: string[];
}

const _cellDebugBatch: CellDebugInfo[] = [];

export function logCellProcessed(info: CellDebugInfo): void {
  if (!_enabled) return;
  _cellDebugBatch.push(info);
}

export function flushCellDebugBatch(): void {
  if (!_enabled || _cellDebugBatch.length === 0) return;

  const total = _cellDebugBatch.length;
  const withProblems = _cellDebugBatch.filter(c => c.problems.length > 0);
  const noHost = _cellDebugBatch.filter(c => !c.hostFound);
  const noData = _cellDebugBatch.filter(c => c.severity === Severity.SIN_DATOS);
  const hidden = _cellDebugBatch.filter(c => !c.visible);

  console.groupCollapsed(
    PREFIX + ` 🔧 Cells Processed: ${total} (${withProblems.length} issues)`,
    withProblems.length > 0 ? STYLE_WARN : STYLE_HEADER,
  );

  // Severity summary
  const sevCounts: Record<string, number> = {};
  for (const c of _cellDebugBatch) {
    sevCounts[c.severity] = (sevCounts[c.severity] || 0) + 1;
  }
  console.log('%cSeverity summary:', STYLE_DIM);
  for (const [sev, count] of Object.entries(sevCounts)) {
    console.log(`%c  ${sev}: ${count}`, STYLE_DIM);
  }

  // Problems
  if (withProblems.length > 0) {
    console.groupCollapsed(`%c⚠ Cells with problems (${withProblems.length})`, STYLE_WARN);
    for (const c of withProblems) {
      console.log(`%c  [${c.cellId}] host="${c.resolvedHost || '?'}" severity=${c.severity}`, STYLE_WARN);
      for (const p of c.problems) {
        console.log(`%c    • ${p}`, STYLE_WARN);
      }
    }
    console.groupEnd();
  }

  // No host found
  if (noHost.length > 0) {
    console.groupCollapsed(`%c❌ Cells with no host data (${noHost.length})`, STYLE_ERR);
    for (const c of noHost) {
      console.log(`%c  [${c.cellId}] expected host="${c.resolvedHost || '?'}"`, STYLE_ERR);
    }
    console.groupEnd();
  }

  // Hidden cells
  if (hidden.length > 0) {
    console.log(`%cHidden cells (visibility rule): ${hidden.length}`, STYLE_DIM);
  }

  // No data
  if (noData.length > 0 && noData.length < 20) {
    console.groupCollapsed(`%c🔇 Cells with SIN_DATOS (${noData.length})`, STYLE_DIM);
    for (const c of noData) {
      console.log(`%c  [${c.cellId}] host="${c.resolvedHost || '?'}" shapes=${c.shapesCount}`, STYLE_DIM);
    }
    console.groupEnd();
  } else if (noData.length >= 20) {
    console.log(`%c🔇 ${noData.length} cells with SIN_DATOS (too many to list)`, STYLE_DIM);
  }

  console.groupEnd();
  _cellDebugBatch.length = 0;
}

// ─── Render Cycle  ──────────────────────────────────────────

export function logRenderCycle(info: {
  svgLoaded: boolean;
  totalTargets: number;
  totalMappings: number;
  totalHosts: number;
  totalLayers: number;
  cacheHit: boolean;
  timestamp: number | null;
}): void {
  if (!_enabled) return;
  console.log(
    PREFIX + ` 🔄 Render cycle — SVG=${info.svgLoaded ? 'ok' : 'pending'}, targets=${info.totalTargets}, ` +
    `mappings=${info.totalMappings}, hosts=${info.totalHosts}, layers=${info.totalLayers}, ` +
    `cache=${info.cacheHit ? 'HIT' : 'MISS'}, ts=${info.timestamp ? new Date(info.timestamp).toISOString() : 'null'}`,
    STYLE_HEADER,
  );
}

// ─── Warnings / Errors ──────────────────────────────────────

export function logWarning(msg: string, detail?: any): void {
  if (!_enabled) return;
  console.warn(PREFIX + ' ⚠ ' + msg, STYLE_WARN, detail ?? '');
}

export function logError(msg: string, detail?: any): void {
  if (!_enabled) return;
  console.error(PREFIX + ' ❌ ' + msg, STYLE_ERR, detail ?? '');
}

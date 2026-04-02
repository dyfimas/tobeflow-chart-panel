// ─────────────────────────────────────────────────────────────
// debugLogger.ts – Debug helpers (no-op in production builds)
// All logging removed for Grafana marketplace compliance.
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import { HostMetrics, CellMapping, Severity } from '../types';

let _enabled = false;

export function setDebugEnabled(enabled: boolean): void {
  _enabled = enabled;
}

export function isDebugEnabled(): boolean {
  return _enabled;
}

export function logDataSummary(_series: DataFrame[], _hostField: string): void {}

export function logHostsExtracted(_metricsMap: Map<string, HostMetrics>): void {}

export function logCellMappings(_cellMappings: CellMapping[], _metricsMap: Map<string, HostMetrics>): void {}

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

export function logCellProcessed(_info: CellDebugInfo): void {}

export function flushCellDebugBatch(): void {}

export function logRenderCycle(_info: {
  svgLoaded: boolean;
  totalTargets: number;
  totalMappings: number;
  totalHosts: number;
  totalLayers: number;
  cacheHit: boolean;
  timestamp: number | null;
}): void {}

export function logWarning(_msg: string, _detail?: any): void {}

export function logError(_msg: string, _detail?: any): void {}

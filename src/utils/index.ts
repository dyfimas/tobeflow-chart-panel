// ─────────────────────────────────────────────────────────────
// index.ts – re-export de utilidades
// ─────────────────────────────────────────────────────────────
export { normHost, resolverHost, defaultMapping, defaultHostMapping, buscarMapeoHost } from './hostMapping';
export { extractMetrics, computeHostSeverity, combineHosts, collectTimestamps, extractMetricsAtTime } from './metricExtractor';
export { sanitizeSvg, adaptSvgForDarkTheme } from './svgSanitizer';
export { isDrawioXml, drawioToSvg } from './drawioConverter';
export { showCustomTooltip, hideTooltip, destroyTooltip, createTooltipScope, setTooltipScope, isTooltipPinned } from './tooltipManager';
export type { TooltipEntry } from './tooltipManager';
export { aggregateValues, collectAllFieldValues, findGroupedFieldValues } from './aggregation';
export { applyDataType, colorToSeverity, resolveThresholdColor, applyValueMapping, escapeRegex } from './dataFormatter';
export { findHostInMetrics, findMetricInHost, findRawFieldValue, findLastTimestamp } from './hostResolver';
export {
  resolveHostForCell,
  resolveMetricEntries,
  resolveTextTemplates,
  applyTextToSvg,
  selectBestShape,
  resolveCellVisibility,
} from './cellProcessor';
export type { MetricsContext, CellResult } from './cellProcessor';
export {
  analyzeAllRefIds,
  analyzeRefId,
  matchPattern,
  validateMapping,
  parseAliasTemplate,
  isDynamicAlias,
  parseLuceneFieldValues,
  getAvailableValuesForField,
} from './aliasResolver';
export type {
  RefIdAnalysis,
  AliasVariable,
  PatternMatchResult,
  MappingValidation,
} from './aliasResolver';
export {
  buildFieldValueIndex,
  queryFieldIndex,
  buildHostSearchIndex,
  findHostFast,
} from './metricsIndex';
export type { FieldValueIndex, HostSearchIndex } from './metricsIndex';

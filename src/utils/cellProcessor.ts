// ─────────────────────────────────────────────────────────────
// cellProcessor.ts – Procesa una celda SVG: métricas, color, texto
// Extraído de SvgFlowPanel.tsx useEffect para descomponer P2
// ─────────────────────────────────────────────────────────────
import { DataFrame } from '@grafana/data';
import {
  HostMetrics,
  MetricThreshold,
  MetricDataType,
  AggregationType,
  CellMapping,
  Severity,
  COLORES,
} from '../types';
import type { TooltipEntry } from './tooltipManager';
import { findMetricInHost, findRawFieldValue, findLastTimestamp } from './hostResolver';
import { collectAllFieldValues, findGroupedFieldValues } from './aggregation';
import { aggregateValues } from './aggregation';
import { applyDataType, colorToSeverity, resolveThresholdColor, applyValueMapping, escapeRegex } from './dataFormatter';
import { combineHosts } from './metricExtractor';
import { findHostFast, queryFieldIndex, buildHostSearchIndex } from './metricsIndex';
import type { HostSearchIndex, FieldValueIndex } from './metricsIndex';

// ─── Tipos internos ────────────────────────────────────────

export interface MetricsContext {
  metricsMap: Map<string, HostMetrics>;
  perRefIdMaps: Map<string, Map<string, HostMetrics>>;
  perMappingMaps: Map<string, Map<string, HostMetrics>>;
  /** P13: Pre-computed field value index for O(1) aggregation lookups */
  fieldValueIndex?: FieldValueIndex;
  /** P14: Pre-computed host search index for O(1) host lookups */
  hostSearchIndex?: HostSearchIndex;
}

export interface CellResult {
  color: string;
  severity: Severity;
  tooltip: TooltipEntry[] | null;
  skipColor: boolean;
  hostData: HostMetrics | null;
  resolvedHost: string | null;
  latestMetricTs: number | null;
}

// ─── Host resolution ────────────────────────────────────────

/**
 * Resuelve el hostData y host name para una celda mapeada.
 */
export function resolveHostForCell(
  cellMapping: CellMapping,
  autoHost: string | null,
  effectiveMetrics: Map<string, HostMetrics>,
  replaceVariables: (s: string) => string,
  hostIndex?: HostSearchIndex
): { resolvedHost: string | null; hostData: HostMetrics | null } {
  if (cellMapping.hostName) {
    const rawHostName = replaceVariables(cellMapping.hostName);

    if (rawHostName.includes(',')) {
      const hostNames = rawHostName.split(',').map(h => h.trim()).filter(Boolean);
      const foundHosts: HostMetrics[] = [];
      // B2: Always use O(1) fast index; build ad-hoc if not provided
      const idx = hostIndex || buildHostSearchIndex(effectiveMetrics);
      for (const hn of hostNames) {
        const hd = findHostFast(effectiveMetrics, idx, hn);
        if (hd) foundHosts.push(hd);
      }
      if (foundHosts.length > 1) {
        return { resolvedHost: rawHostName, hostData: combineHosts(foundHosts, rawHostName) };
      } else if (foundHosts.length === 1) {
        return { resolvedHost: hostNames[0], hostData: foundHosts[0] };
      }
      return { resolvedHost: rawHostName, hostData: null };
    }

    // B2: Always use O(1) fast index; build ad-hoc if not provided
    const idx2 = hostIndex || buildHostSearchIndex(effectiveMetrics);
    const hd = findHostFast(effectiveMetrics, idx2, rawHostName);
    return { resolvedHost: rawHostName, hostData: hd };
  }

  return {
    resolvedHost: autoHost,
    hostData: autoHost ? effectiveMetrics.get(autoHost) ?? null : null,
  };
}

// ─── Metric entries resolution ──────────────────────────────

/**
 * Procesa todas las métricas de un cellMapping y genera las tooltip entries,
 * severidad y color resultante.
 */
export function resolveMetricEntries(
  cellMapping: CellMapping,
  hostData: HostMetrics | null,
  resolvedHost: string | null,
  ctx: {
    sortedSeries: DataFrame[];
    metricsCache: MetricsContext;
    effectiveMetrics: Map<string, HostMetrics>;
    effectiveSeries: DataFrame[];
    mappingRefId: string;
    defaultHostFieldName: string;
    globalThresholds: MetricThreshold[];
    replaceVariables: (s: string) => string;
    /** P13: Pre-computed field value index for O(1) aggregation */
    fieldValueIndex?: FieldValueIndex;
    /** P14: Pre-computed host search index for O(1) host lookups */
    hostSearchIndex?: HostSearchIndex;
  }
): { entries: TooltipEntry[]; severity: Severity; color: string; latestMetricTs: number | null } {
  const entries: TooltipEntry[] = [];
  let worstColor: string | null = null;
  let severity: Severity = Severity.NORMAL;
  let latestMetricTs: number | null = null;

  for (const metric of cellMapping.metrics || []) {
    const { alias, dataType, thresholds, valueMappings,
      aggregation, refId: metricRefId, skipThresholdColor: metricSkipColor, skipCellSeverity: metricSkipSev } = metric;
    // Mapping-level flags cascade to metrics (metric can also override individually)
    const skipThresholdColor = metricSkipColor || cellMapping.skipThresholdColor;
    const skipCellSeverity = metricSkipSev || cellMapping.skipCellSeverity;
    // P2: Resolve Grafana dashboard variables in metric fields
    const field = metric.field ? ctx.replaceVariables(metric.field) : metric.field;
    const filterPattern = metric.filterPattern ? ctx.replaceVariables(metric.filterPattern) : metric.filterPattern;
    const metricHostField = metric.hostField ? ctx.replaceVariables(metric.hostField) : metric.hostField;
    const groupByField = metric.groupByField ? ctx.replaceVariables(metric.groupByField) : metric.groupByField;
    const dt: MetricDataType = dataType || 'auto';
    const agg: AggregationType = aggregation || 'last';
    const effectiveMetricRefId = metricRefId || ctx.mappingRefId;

    // Per-metric host resolution
    let metricHostData: HostMetrics | null = null;
    let filterMatches: HostMetrics[] = [];
    let metricEffectiveMetrics = ctx.effectiveMetrics;
    let metricHostFieldName = ctx.defaultHostFieldName;
    let metricSeries = ctx.effectiveSeries;

    if (metricHostField || metricRefId) {
      if (metricHostField) metricHostFieldName = metricHostField;
      const metricKey = `${effectiveMetricRefId}::${metricHostField || ''}`;
      metricEffectiveMetrics = ctx.metricsCache.perMappingMaps.get(metricKey) || ctx.effectiveMetrics;
      metricSeries = effectiveMetricRefId
        ? ctx.sortedSeries.filter(f => f.refId === effectiveMetricRefId)
        : ctx.sortedSeries;
    }

    if (filterPattern && filterPattern.trim()) {
      const regexStr = '^' + filterPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      try {
        const re = new RegExp(regexStr, 'i');
        for (const [, hostEntry] of metricEffectiveMetrics) {
          if (re.test(hostEntry.hostname)) {
            filterMatches.push(hostEntry);
          }
        }
        if (filterMatches.length > 0) {
          metricHostData = filterMatches[0];
        }
      } catch { /* invalid pattern */ }
    } else if (metricHostField && hostData) {
      const rawHostName = cellMapping.hostName ? ctx.replaceVariables(cellMapping.hostName) : '';
      if (rawHostName) {
        // B2: Always use O(1) fast index; build ad-hoc if not provided
        const mIdx = ctx.hostSearchIndex || buildHostSearchIndex(metricEffectiveMetrics);
        metricHostData = findHostFast(metricEffectiveMetrics, mIdx, rawHostName);
      }
      if (!metricHostData) {
        for (const [hostKey, hostEntry] of metricEffectiveMetrics) {
          if (hostKey.toLowerCase().includes((resolvedHost || '').toLowerCase())) {
            metricHostData = hostEntry;
            break;
          }
        }
      }
    } else {
      metricHostData = hostData;
    }

    if (!metricHostData) {
      entries.push({ label: alias || field, value: 'N/A', unit: '', color: COLORES.SIN_DATOS, isPercentage: false });
      continue;
    }

    // Multi-match filterPattern: create an entry per matched host
    if (filterMatches.length > 1) {
      for (const matchedHost of filterMatches) {
        const mTs = findLastTimestamp(metricSeries, matchedHost.hostname, metricHostFieldName);
        if (mTs !== null && (latestMetricTs === null || mTs > latestMetricTs)) {
          latestMetricTs = mTs;
        }
        let rawVal: number | string | null = null;
        if (agg === 'timeOfLastPoint') {
          rawVal = findLastTimestamp(metricSeries, matchedHost.hostname, metricHostFieldName);
        } else if (agg !== 'last' && agg !== 'lastNotNull') {
          let allValues: number[];
          if (ctx.fieldValueIndex) {
            allValues = queryFieldIndex(ctx.fieldValueIndex, matchedHost.hostname, field);
            if (allValues.length === 0) {
              allValues = collectAllFieldValues(metricSeries, matchedHost.hostname, field, metricHostFieldName);
            }
          } else {
            allValues = collectAllFieldValues(metricSeries, matchedHost.hostname, field, metricHostFieldName);
          }
          rawVal = aggregateValues(allValues, agg);
        } else {
          const mv = findMetricInHost(matchedHost, field, effectiveMetricRefId || undefined);
          if (mv) {
            rawVal = mv.value;
          } else {
            rawVal = findRawFieldValue(metricSeries, matchedHost.hostname, field, metricHostFieldName);
          }
        }
        if (rawVal !== null) {
          const fmt = applyDataType(rawVal, dt);
          const effectiveThresholds = (thresholds && thresholds.length > 0) ? thresholds : ctx.globalThresholds;
          const thColor = resolveThresholdColor(fmt.value, effectiveThresholds);
          const mapped = applyValueMapping(fmt.value, fmt.unit, fmt.isPercentage, valueMappings);
          const history = collectMetricHistory(metricSeries, matchedHost.hostname, field, metricHostFieldName, dt);
          const entryColor = skipThresholdColor ? COLORES.NORMAL : (mapped.color || thColor || COLORES.NORMAL);
          entries.push({
            label: matchedHost.hostname,
            value: mapped.value, unit: mapped.unit,
            color: entryColor, isPercentage: mapped.isPercentage, history,
            skipCellSeverity,
          });
        }
      }
      continue;
    }

    // Grouped metric
    if (groupByField && groupByField !== field) {
      const grouped = findGroupedFieldValues(metricSeries, metricHostData.hostname, field, groupByField, metricHostFieldName);
      if (grouped.length > 0) {
        for (const { group, value: rawVal } of grouped) {
          const fmt = applyDataType(rawVal, dt);
          const effectiveThresholds = (thresholds && thresholds.length > 0) ? thresholds : ctx.globalThresholds;
          const thColor = resolveThresholdColor(fmt.value, effectiveThresholds);
          const entryColor = skipThresholdColor ? COLORES.NORMAL : (thColor || COLORES.NORMAL);
          const mapped = applyValueMapping(fmt.value, fmt.unit, fmt.isPercentage, valueMappings);
          entries.push({
            label: alias ? `${alias} ${group}` : `${group}`,
            value: mapped.value, unit: mapped.unit,
            color: skipThresholdColor ? entryColor : (mapped.color || entryColor), isPercentage: mapped.isPercentage,
            skipCellSeverity,
          });
        }
      } else {
        entries.push({ label: alias || field, value: 'N/A', unit: '', color: COLORES.SIN_DATOS, isPercentage: false });
      }
      continue;
    }

    // Single metric – timestamp tracking
    const metricTs = findLastTimestamp(metricSeries, metricHostData.hostname, metricHostFieldName);
    if (metricTs !== null && (latestMetricTs === null || metricTs > latestMetricTs)) {
      latestMetricTs = metricTs;
    }

    // Resolve value
    let resolvedValue: number | string | null = null;
    let resolvedLabel = alias || field;

    if (agg === 'timeOfLastPoint') {
      resolvedValue = findLastTimestamp(metricSeries, metricHostData.hostname, metricHostFieldName);
    } else if (agg !== 'last' && agg !== 'lastNotNull') {
      // P13: Use pre-computed field value index for O(1) lookup when available
      let allValues: number[];
      if (ctx.fieldValueIndex) {
        allValues = queryFieldIndex(ctx.fieldValueIndex, metricHostData.hostname, field);
        // Fallback to full scan if index returned nothing (e.g. per-metric series filter)
        if (allValues.length === 0) {
          allValues = collectAllFieldValues(metricSeries, metricHostData.hostname, field, metricHostFieldName);
        }
      } else {
        allValues = collectAllFieldValues(metricSeries, metricHostData.hostname, field, metricHostFieldName);
      }
      resolvedValue = aggregateValues(allValues, agg);
    } else {
      const mv = findMetricInHost(metricHostData, field, effectiveMetricRefId || undefined);
      if (mv) {
        resolvedValue = mv.value;
        resolvedLabel = alias || mv.label || field;
      } else {
        resolvedValue = findRawFieldValue(metricSeries, metricHostData.hostname, field, metricHostFieldName);
      }
    }

    if (resolvedValue !== null) {
      const fmt = applyDataType(resolvedValue, dt);
      const effectiveThresholds = (thresholds && thresholds.length > 0) ? thresholds : ctx.globalThresholds;
      const thColor = resolveThresholdColor(fmt.value, effectiveThresholds);
      const mapped = applyValueMapping(fmt.value, fmt.unit, fmt.isPercentage, valueMappings);
      const history = collectMetricHistory(metricSeries, metricHostData.hostname, field, metricHostFieldName, dt);
      const entryColor = skipThresholdColor ? COLORES.NORMAL : (mapped.color || thColor || COLORES.NORMAL);
      entries.push({
        label: resolvedLabel, value: mapped.value, unit: mapped.unit,
        color: entryColor, isPercentage: mapped.isPercentage, history,
        skipCellSeverity,
      });
    } else {
      const effectiveThresholds2 = (thresholds && thresholds.length > 0) ? thresholds : ctx.globalThresholds;
      const thColor = resolveThresholdColor('N/A', effectiveThresholds2);
      const mapped = applyValueMapping('N/A', '', false, valueMappings);
      entries.push({
        label: alias || field, value: mapped.value, unit: mapped.unit,
        color: mapped.color || thColor || COLORES.SIN_DATOS, isPercentage: mapped.isPercentage,
        skipCellSeverity,
      });
    }
  }

  // Worst severity across all entries
  let worstSevOrd = 0;
  for (const entry of entries) {
    if (entry.skipCellSeverity) continue;
    const { severity: entrySev, order: entryOrd } = colorToSeverity(entry.color);
    if (entryOrd > worstSevOrd) {
      worstSevOrd = entryOrd;
      severity = entrySev;
      worstColor = entry.color;
    }
  }

  return {
    entries,
    severity,
    color: worstColor || COLORES.NORMAL,
    latestMetricTs,
  };
}

function collectMetricHistory(
  series: DataFrame[],
  hostname: string,
  fieldName: string,
  hostFieldName: string,
  dataType: MetricDataType
): Array<{ ts: number; value: number }> {
  const points: Array<{ ts: number; value: number }> = [];
  const hostNorm = hostname.toLowerCase();

  for (const frame of series) {
    const targetField = frame.fields.find((f) => f.name === fieldName);
    const timeField = frame.fields.find((f) => f.type === 'time' || f.name === '@timestamp');
    if (!targetField || !timeField) {
      continue;
    }

    const hostField = frame.fields.find(
      (f) => f.name === hostFieldName || f.name === 'host.name' || f.name === 'host' || f.name === 'hostname'
    );

    for (let i = 0; i < targetField.values.length; i++) {
      if (hostField) {
        const rowHost = String(hostField.values[i] ?? '').toLowerCase();
        if (!rowHost || (!rowHost.includes(hostNorm) && !hostNorm.includes(rowHost))) {
          continue;
        }
      }

      const tsRaw = timeField.values[i];
      const valRaw = targetField.values[i];
      const ts = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw);
      const valNum = typeof valRaw === 'number' ? valRaw : parseFloat(String(valRaw));
      if (!Number.isFinite(ts) || !Number.isFinite(valNum)) {
        continue;
      }

      const fmt = applyDataType(valNum, dataType);
      const displayNum = typeof fmt.value === 'number' ? fmt.value : parseFloat(String(fmt.value));
      points.push({ ts, value: Number.isFinite(displayNum) ? displayNum : valNum });
    }
  }

  points.sort((a, b) => a.ts - b.ts);
  if (points.length <= 1) {
    return [];
  }

  const dedup = new Map<number, number>();
  for (const p of points) {
    dedup.set(p.ts, p.value);
  }

  return Array.from(dedup.entries()).map(([ts, value]) => ({ ts, value }));
}

// ─── Text template replacement ──────────────────────────────

/**
 * Genera los textos para insertar en las celdas SVG a partir de templates.
 */
export function resolveTextTemplates(
  cellMapping: CellMapping,
  hostData: HostMetrics | null,
  resolvedHost: string | null,
  severity: Severity,
  color: string,
  mappedTooltip: TooltipEntry[] | null,
  replaceVariables: (s: string) => string
): string[] {
  const parts: string[] = [];
  if (!cellMapping?.metrics) return parts;

  for (const met of cellMapping.metrics) {
    const mode = met.textMode || 'off';
    if (mode === 'off') continue;

    if (mode === 'metric') {
      if (mappedTooltip) {
        const metricAlias = met.alias || met.field || '';
        const matching = mappedTooltip.filter(e => {
          if (metricAlias && (e.label === metricAlias || e.label.startsWith(metricAlias + ' '))) return true;
          if (met.field && e.label === met.field) return true;
          return false;
        });
        if (matching.length > 0) {
          for (const entry of matching) {
            const fmtVal = typeof entry.value === 'number'
              ? parseFloat(entry.value.toFixed(2)).toString()
              : String(entry.value);
            parts.push(entry.unit ? `${fmtVal}${entry.unit}` : fmtVal);
          }
        } else {
          parts.push('N/A');
        }
      } else {
        parts.push('N/A');
      }
      continue;
    }

    // mode === 'custom'
    if (!met.textTemplate) continue;
    let txt = met.textTemplate;

    txt = txt.replace(/\{\{status\}\}/gi, severity);
    txt = txt.replace(/\{\{status:([^}]+)\}\}/gi, (_match, args: string) => {
      const p = args.split(':');
      if (p.length === 2) return severity === Severity.NORMAL ? p[0] : p[1];
      if (p.length >= 4) {
        switch (severity) {
          case Severity.NORMAL: return p[0];
          case Severity.MAJOR: return p[1];
          case Severity.CRITICO: return p[2];
          case Severity.SIN_DATOS: return p[3];
          default: return p[p.length - 1];
        }
      }
      if (p.length === 3) {
        switch (severity) {
          case Severity.NORMAL: return p[0];
          case Severity.MAJOR: return p[1];
          default: return p[2];
        }
      }
      return p[0];
    });

    if (met.field && hostData) {
      const mv = findMetricInHost(hostData, met.field, met.refId || undefined);
      if (mv) {
        const dt = met.dataType || 'auto';
        const fmt = applyDataType(mv.value, dt);
        const fmtVal = typeof fmt.value === 'number'
          ? parseFloat(fmt.value.toFixed(2)).toString()
          : String(fmt.value);
        const display = fmt.unit ? `${fmtVal}${fmt.unit}` : fmtVal;
        txt = txt.replace(/\{\{value\}\}/gi, display);
        txt = txt.replace(new RegExp(`\\{\\{${escapeRegex(met.field)}\\}\\}`, 'gi'), display);
      }
    }

    txt = txt.replace(/\{\{alias\}\}/gi, met.alias || met.field || '');
    txt = txt.replace(/\{\{field\}\}/gi, met.field || '');
    txt = txt.replace(/\{\{pattern\}\}/gi, met.filterPattern || '');

    if (mappedTooltip) {
      for (const entry of mappedTooltip) {
        const fmtVal = typeof entry.value === 'number'
          ? parseFloat(entry.value.toFixed(2)).toString()
          : String(entry.value);
        const display = entry.unit ? `${fmtVal}${entry.unit}` : fmtVal;
        txt = txt.replace(new RegExp(`\\{\\{${escapeRegex(entry.label)}\\}\\}`, 'gi'), display);
      }
    }

    txt = txt.replace(/\{\{host\}\}/gi, resolvedHost || '');
    txt = txt.replace(/\{\{color\}\}/gi, color);
    txt = replaceVariables(txt);
    parts.push(txt);
  }

  return parts;
}

// ─── DOM helpers ────────────────────────────────────────────

/**
 * Aplica texto multi-línea a los elementos <text> dentro de un target SVG.
 */
export function applyTextToSvg(target: Element, textParts: string[]): void {
  if (textParts.length === 0) return;
  const textEls = target.querySelectorAll('text');
  if (textEls.length === 0) return;

  const finalText = textParts.join('\\n');
  const mainText = textEls[textEls.length - 1];
  if (!mainText) return;

  const lines = finalText.split('\\n');
  if (lines.length > 1) {
    const ns = 'http://www.w3.org/2000/svg';
    const x = mainText.getAttribute('x') || '0';
    const fontSize = parseFloat(mainText.getAttribute('font-size') || '12');
    const lineHeight = fontSize * 1.3;
    const totalH = lines.length * lineHeight;
    const baseY = parseFloat(mainText.getAttribute('y') || '0');
    const startY = baseY - (totalH / 2) + (lineHeight / 2);
    mainText.textContent = '';
    lines.forEach((line, li) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('y', String(startY + li * lineHeight));
      tspan.textContent = line;
      mainText.appendChild(tspan);
    });
  } else {
    const tspans = mainText.querySelectorAll('tspan');
    if (tspans.length > 0) {
      tspans[tspans.length - 1].textContent = finalText;
    } else {
      mainText.textContent = finalText;
    }
  }
}

/**
 * Selecciona el mejor shape dentro de un target SVG para aplicar fill.
 * Prioriza shapes gris (#cccbcb), fallback al más grande.
 */
export function selectBestShape(shapes: Element[]): SVGElement | null {
  let bestShape: SVGElement | null = null;
  let bestArea = 0;

  // 1. Gray shapes
  for (const shape of shapes) {
    const svgEl = shape as SVGGraphicsElement;
    const fill = (svgEl.getAttribute('fill') || '').toLowerCase();
    if (fill === '#cccbcb') {
      try {
        const bbox = svgEl.getBBox();
        const area = bbox.width * bbox.height;
        if (area > 500 && area > bestArea) {
          bestArea = area;
          bestShape = svgEl;
        }
      } catch { /* getBBox may fail */ }
    }
  }

  // 2. Fallback: largest shape
  if (!bestShape) {
    for (const shape of shapes) {
      const svgEl = shape as SVGGraphicsElement;
      try {
        const bbox = svgEl.getBBox();
        const area = bbox.width * bbox.height;
        if (area > bestArea) {
          bestArea = area;
          bestShape = svgEl;
        }
      } catch { /* getBBox may fail */ }
    }
  }

  return bestShape;
}

/**
 * Determina la visibilidad de una celda según su modo y severidad.
 */
export function resolveCellVisibility(
  visMode: string,
  severity: Severity,
  hostData: HostMetrics | null
): boolean {
  switch (visMode) {
    case 'when-data':
      return severity !== Severity.SIN_DATOS && hostData !== null;
    case 'when-ok':
      return severity === Severity.NORMAL;
    case 'when-alert':
      return severity !== Severity.NORMAL && severity !== Severity.SIN_DATOS;
    case 'when-nodata':
      return severity === Severity.SIN_DATOS || hostData === null;
    case 'always':
    default:
      return true;
  }
}

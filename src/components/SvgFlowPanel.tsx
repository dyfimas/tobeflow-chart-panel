// ─────────────────────────────────────────────────────────────
// SvgFlowPanel.tsx – Componente principal del panel
// Replica la lógica de SVGManager + main del script de producción
// ─────────────────────────────────────────────────────────────
import { PanelProps, DataFrame } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import React, { useRef, useEffect, useState } from 'react';
import {
  SvgFlowOptions,
  HostMetrics,
  CellMapping,
  Severity,
  COLORES,
  SEVERITY_COLORS,
  DEFAULT_TOOLTIP_CONFIG,
  DEFAULT_VISUAL_STYLE,
  VisualStyleConfig,
} from '../types';
import {
  resolverHost,
  defaultMapping,
  showCustomTooltip,
  hideTooltip,
  destroyTooltip,
  createTooltipScope,
  setTooltipScope,
  isTooltipPinned,
} from '../utils';
import type { TooltipEntry } from '../utils';
import {
  setDebugEnabled, logDataSummary, logHostsExtracted, logCellMappings,
  logCellProcessed, flushCellDebugBatch, logRenderCycle, logWarning,
  type CellDebugInfo,
} from '../utils/debugLogger';

import {
  resolveHostForCell,
  resolveMetricEntries,
  resolveTextTemplates,
  applyTextToSvg,
  selectBestShape,
  resolveCellVisibility,
} from '../utils/cellProcessor';
import type { FieldValueIndex, HostSearchIndex } from '../utils/metricsIndex';
import {
  useParsedOptions, useSvgLoader, useSortedSeries, useDataTimestamp, useLayerLoader,
  useAnimationStyles, usePickMode, useSearchFilter, useMetricsCache,
  emptyMetricsCache,
  type MetricsCache,
} from '../hooks/useSvgFlowHooks';

// ─── Chunk size for batch DOM updates (P10: adaptive) ───────
const ADAPTIVE_TARGET_MS = 8; // half frame budget at 60fps

function processTargetsInBatches(targets: Element[], ctx: CellProcessingContext): void {
  let chunkSize = targets.length <= 50 ? targets.length : 15;

  function processChunk(startIdx: number) {
    const endIdx = Math.min(startIdx + chunkSize, targets.length);
    const t0 = performance.now();

    for (let i = startIdx; i < endIdx; i++) {
      processSingleCell(targets[i], ctx);
    }

    const elapsed = performance.now() - t0;

    // Adapt chunk size based on actual time
    if (elapsed < ADAPTIVE_TARGET_MS * 0.5 && chunkSize < targets.length) {
      chunkSize = Math.min(chunkSize * 2, targets.length);
    } else if (elapsed > ADAPTIVE_TARGET_MS && chunkSize > 4) {
      chunkSize = Math.max(4, Math.floor(chunkSize / 2));
    }

    if (endIdx < targets.length) {
      requestAnimationFrame(() => processChunk(endIdx));
    } else {
      flushCellDebugBatch();
      window.dispatchEvent(new CustomEvent('svgflow-severity-summary', { detail: ctx.severityCounts }));
    }
  }

  requestAnimationFrame(() => processChunk(0));
}

/** Inject SVG into container, clean debug overlays, normalize SVG sizing */
function prepareSvgContainer(container: HTMLDivElement, svgHtml: string, debugMode: boolean): void {
  container.innerHTML = svgHtml;

  if (!debugMode) {
    container.querySelectorAll('.svgflow-debug-overlay').forEach(el => el.remove());
  }

  container.querySelectorAll('svg').forEach((svgEl) => {
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.style.maxWidth = '100%';
    svgEl.style.maxHeight = '100%';
    svgEl.style.display = 'block';
    svgEl.style.overflow = 'hidden';
  });
}

/** Build O(1) cellId → CellMapping lookup from the array */
function buildCellMappingIndex(cellMappings: CellMapping[]): Map<string, CellMapping> {
  const map = new Map<string, CellMapping>();
  for (const m of cellMappings) {
    map.set(m.cellId, m);
  }
  return map;
}

/** Context passed into processSingleCell */
interface CellProcessingContext {
  metricsCache: MetricsCache;
  metrics: Map<string, HostMetrics>;
  mapping: ReturnType<typeof defaultMapping>;
  hMapping: Record<string, string>;
  hostsDisponibles: Set<string>;
  cellMappingsIndex: Map<string, CellMapping>;
  sortedSeries: DataFrame[];
  globalThresholds: any;
  replaceVariables: (s: string) => string;
  options: SvgFlowOptions;
  dataTimestamp: number | null;
  listenersRef: React.MutableRefObject<Array<() => void>>;
  pickModeRef: React.MutableRefObject<boolean>;
  cellTimestampsRef: React.MutableRefObject<Map<string, number>>;
  severityCounts: Record<string, number>;
}

interface LayerRenderData {
  id: string;
  html: string;
  visible: boolean;
}

function syncLayerContainers(
  layerRefsMap: React.MutableRefObject<Map<string, HTMLDivElement>>,
  processedLayers: LayerRenderData[],
  debugMode: boolean
): void {
  for (const pl of processedLayers) {
    const layerEl = layerRefsMap.current.get(pl.id);
    if (!layerEl) continue;
    if (pl.visible && pl.html) {
      layerEl.innerHTML = pl.html;
      layerEl.querySelectorAll('svg').forEach((svgEl) => {
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.maxWidth = '100%';
        svgEl.style.maxHeight = '100%';
        svgEl.style.display = 'block';
        svgEl.style.overflow = 'hidden';
      });
      if (!debugMode) {
        layerEl.querySelectorAll('.svgflow-debug-overlay').forEach(el => el.remove());
      }
    } else {
      layerEl.innerHTML = '';
    }
  }
}

function collectTargetCells(
  container: HTMLDivElement,
  layerRefsMap: React.MutableRefObject<Map<string, HTMLDivElement>>,
  processedLayers: LayerRenderData[]
): Element[] {
  const targets = Array.from(container.querySelectorAll('g[data-cell-id]'));
  for (const pl of processedLayers) {
    const layerEl = layerRefsMap.current.get(pl.id);
    if (layerEl && pl.visible) {
      targets.push(...Array.from(layerEl.querySelectorAll('g[data-cell-id]')));
    }
  }
  return targets;
}

/**
 * P2: Process a single SVG cell (g[data-cell-id]) — extracted from the main useEffect loop.
 * Returns early if the cell should be skipped.
 */
function processSingleCell(target: Element, ctx: CellProcessingContext): void {
  const cellId = target.getAttribute('data-cell-id') || '';
  if (!cellId || cellId === '0' || cellId === '1') return;

  const autoHost = resolverHost(cellId, ctx.mapping, ctx.hMapping, ctx.hostsDisponibles);

  // Unmapped cells: only register pick-mode listener
  const cellMapping = ctx.cellMappingsIndex.get(cellId);
  if (!cellMapping) {
    logCellProcessed({
      cellId, resolvedHost: autoHost || null, hostFound: false,
      severity: Severity.SIN_DATOS, color: COLORES.SIN_DATOS,
      metricsCount: 0, shapesCount: 0, visible: true,
      problems: ['No cellMapping configured'],
    });
    target.classList.add('svgflow-target');
    const pickClick = (e: Event) => {
      if (ctx.pickModeRef.current) {
        e.preventDefault(); e.stopPropagation();
        ctx.pickModeRef.current = false;
        window.dispatchEvent(new CustomEvent('svgflow-cell-selected', {
          detail: { cellId, resolvedHost: autoHost || '' },
        }));
      }
    };
    target.addEventListener('click', pickClick);
    ctx.listenersRef.current.push(() => target.removeEventListener('click', pickClick));
    return;
  }

  // ── Resolve host ──
  const mappingRefId = cellMapping.refId || '';
  const defaultMappingKey = `${mappingRefId}::`;
  const effectiveMetrics = mappingRefId
    ? (ctx.metricsCache.perMappingMaps.get(defaultMappingKey) || ctx.metricsCache.perRefIdMaps.get(mappingRefId) || ctx.metrics)
    : ctx.metrics;
  const effectiveSeries = mappingRefId
    ? ctx.sortedSeries.filter(f => f.refId === mappingRefId)
    : ctx.sortedSeries;
  const defaultHostFieldName = ctx.options.hostField || 'host.name';

  const effectiveHostIndex = mappingRefId
    ? (ctx.metricsCache.perMappingHostIndexes.get(defaultMappingKey)
      || ctx.metricsCache.perMappingHostIndexes.get(mappingRefId)
      || ctx.metricsCache.hostSearchIndex)
    : ctx.metricsCache.hostSearchIndex;

  const { resolvedHost, hostData } = resolveHostForCell(
    cellMapping, autoHost, effectiveMetrics, ctx.replaceVariables, effectiveHostIndex
  );

  // ── Find shapes ──
  let shapes = Array.from(target.querySelectorAll('path[fill], rect[fill], ellipse[fill], polygon[fill], circle[fill]'));
  if (shapes.length === 0) shapes = Array.from(target.querySelectorAll('.svgflow-shape'));
  if (shapes.length === 0) shapes = Array.from(target.querySelectorAll('path, rect, ellipse, polygon, circle'));
  shapes = shapes.filter((s) => {
    const parentCell = s.closest('g[data-cell-id]');
    return !parentCell || parentCell === target;
  });

  // ── Resolve metrics & severity ──
  let color: string = COLORES.SIN_DATOS;
  let severity: Severity = Severity.SIN_DATOS;
  let mappedTooltip: TooltipEntry[] | null = null;
  let skipColor = !(cellMapping?.metrics?.length);

  if (cellMapping?.metrics?.length) {
    const result = resolveMetricEntries(cellMapping, hostData, resolvedHost, {
      sortedSeries: ctx.sortedSeries, metricsCache: ctx.metricsCache, effectiveMetrics, effectiveSeries,
      mappingRefId, defaultHostFieldName, globalThresholds: ctx.globalThresholds, replaceVariables: ctx.replaceVariables,
      fieldValueIndex: ctx.metricsCache.fieldValueIndex,
      hostSearchIndex: effectiveHostIndex,
    });
    severity = result.severity;
    color = resolveContainerSeverityColor(result.color, severity, ctx.options.visualStyle);
    mappedTooltip = result.entries;
    skipColor = false;
    if (result.latestMetricTs != null) {
      ctx.cellTimestampsRef.current.set(cellId, result.latestMetricTs);
    }
    if (hostData) {
      hostData.severity = severity;
      hostData.cellId = cellId;
    }
  } else if (hostData) {
    hostData.cellId = cellId;
  }

  // M5: Count severity for sidebar summary
  ctx.severityCounts[severity] = (ctx.severityCounts[severity] || 0) + 1;

  // ── Visibility ──
  const isVisible = resolveCellVisibility(cellMapping?.visibility || 'always', severity, hostData);
  const targetEl = target as SVGElement;
  if (!isVisible) {
    const problems: string[] = [];
    if (!hostData) problems.push('Host not found in data');
    logCellProcessed({
      cellId, resolvedHost: resolvedHost, hostFound: !!hostData,
      severity, color, metricsCount: cellMapping?.metrics?.length || 0,
      shapesCount: shapes.length, visible: false,
      problems,
    });
    targetEl.style.display = 'none'; return;
  }
  targetEl.style.display = '';

  // ── Apply color ──
  if (!skipColor) {
    const bestShape = selectBestShape(shapes);
    if (bestShape) {
      bestShape.classList.add('svgflow-shape');
      bestShape.setAttribute('fill', color);
      bestShape.style.fill = color;
      bestShape.style.transition = 'fill 0.5s ease';
      if (severity === Severity.CRITICO) {
        bestShape.classList.add('svgflow-shape-critico');
      } else {
        bestShape.classList.remove('svgflow-shape-critico');
      }
      if (severity === Severity.SIN_DATOS) {
        bestShape.classList.add('svgflow-nodata');
      } else {
        bestShape.classList.remove('svgflow-nodata');
      }
    }
  }

  // ── Text templates ──
  const textParts = resolveTextTemplates(
    cellMapping, hostData, resolvedHost, severity, color, mappedTooltip, ctx.replaceVariables
  );
  applyTextToSvg(target, textParts);

  // ── Debug overlay ──
  if (ctx.options.debugMode) {
    addDebugOverlay(target as SVGElement, cellId, resolvedHost || '?');
    const cellProblems: string[] = [];
    if (!hostData) cellProblems.push('Host not found in data');
    if (shapes.length === 0) cellProblems.push('No SVG shapes found in cell');
    if (severity === Severity.SIN_DATOS && (cellMapping?.metrics?.length ?? 0) > 0) {
      cellProblems.push('Metrics configured but no data received');
    }
    logCellProcessed({
      cellId, resolvedHost, hostFound: !!hostData,
      severity, color, metricsCount: cellMapping?.metrics?.length || 0,
      shapesCount: shapes.length, visible: true,
      problems: cellProblems,
    });
  } else {
    target.querySelectorAll('.svgflow-debug-overlay').forEach(el => el.remove());
  }

  // ── Listeners ──
  if (hostData || shapes.length > 0) {
    attachCellListeners(
      target, shapes, hostData, cellId, resolvedHost, cellMapping,
      severity, color, mappedTooltip, ctx.dataTimestamp, ctx.options, ctx.replaceVariables,
      ctx.listenersRef, hideTooltip, showCustomTooltip, ctx.pickModeRef, ctx.cellTimestampsRef
    );
  }
}

function resolveContainerSeverityColor(baseColor: string, severity: Severity, visualStyle: VisualStyleConfig): string {
  const mapped: Record<Severity, string> = {
    [Severity.CRITICO]: visualStyle.containerColorCritical,
    [Severity.MAJOR]: visualStyle.containerColorMajor,
    [Severity.MINOR]: visualStyle.containerColorMinor,
    [Severity.WARNING]: visualStyle.containerColorWarning,
    [Severity.NORMAL]: visualStyle.containerColorNormal,
    [Severity.SIN_DATOS]: visualStyle.containerColorNoData,
  };
  const next = mapped[severity];
  return typeof next === 'string' && next.trim() ? next : baseColor;
}

// ─── Componente ─────────────────────────────────────────────

// B1: ErrorBoundary — catches render-time errors from our own code.
// Cannot intercept errors from Grafana-core siblings (e.g. TooltipPlugin2)
// but protects the panel from our own regressions showing the error banner.
interface EBState { hasError: boolean; message: string }
class SvgFlowErrorBoundary extends React.Component<{ width: number; height: number; children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message || 'Unknown error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ width: this.props.width, height: this.props.height, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#f85149', fontSize: 13 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️ SvgFlow render error</div>
            <div>{this.state.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SvgFlowPanel: React.FC<PanelProps<SvgFlowOptions>> = (props) => (
  <SvgFlowErrorBoundary width={props.width} height={props.height}>
    <SvgFlowPanelInner {...props} />
  </SvgFlowErrorBoundary>
);

const SvgFlowPanelInner: React.FC<PanelProps<SvgFlowOptions>> = ({
  data,
  width,
  height,
  options,
  replaceVariables,
}) => {
  const theme = useTheme2();
  const containerRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<Array<() => void>>([]);
  const [timelineIndex, setTimelineIndex] = useState<number | null>(null);
  const [pickModeActive, setPickModeActive] = useState(false);
  const cellTimestampsRef = useRef<Map<string, number>>(new Map());
  const panelScopeRef = useRef(`svgflow-panel-${Math.random().toString(36).slice(2, 10)}`);
  const visualStyle: VisualStyleConfig = normalizeVisualStyle(options.visualStyle);
  const tooltipConfig = normalizeTooltipConfig(options.tooltipConfig);

  // F2: Multi-panel tooltip isolation
  const tooltipScopeRef = useRef(createTooltipScope());
  useEffect(() => { setTooltipScope(tooltipScopeRef.current); }, []);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const msg = String(event.message || '');
      const stack = String((event.error as any)?.stack || '');
      const isKnownTooltipBug =
        msg.includes("Cannot read properties of null (reading 'contains')") &&
        stack.includes('TooltipPlugin2');
      if (!isKnownTooltipBug) {
        return;
      }
      event.preventDefault();
      if (typeof (event as any).stopImmediatePropagation === 'function') {
        (event as any).stopImmediatePropagation();
      }
      logWarning('Ignored known TooltipPlugin2 null.contains runtime error');
    };

    window.addEventListener('error', onWindowError);
    return () => {
      window.removeEventListener('error', onWindowError);
    };
  }, []);

  useEffect(() => {
    const styleId = `svgflow-custom-style-${panelScopeRef.current}`;
    const existing = document.getElementById(styleId) as HTMLStyleElement | null;
    if (existing) {
      existing.remove();
    }
    if (typeof visualStyle.customCss !== 'string' || !visualStyle.customCss.trim()) {
      return;
    }
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = scopePanelCss(visualStyle.customCss, panelScopeRef.current);
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, [visualStyle.customCss]);

  // L2: Extracted hooks
  const { svgContentRef, svgLoaded, error } = useSvgLoader(options, theme.isDark, replaceVariables);
  const { hostMappingData, customThresholdsData, metricsConfig, globalThresholds, globalThresholdMode, parseErrors } = useParsedOptions(options);
  const { sortedSeries, allTimestamps } = useSortedSeries(data.series);
  const dataTimestamp = useDataTimestamp(data.series);
  const processedLayers = useLayerLoader(options.layers, theme.isDark);
  const layerRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // P3: Extracted hooks for further decomposition
  useAnimationStyles();
  const pickModeRef = usePickMode();
  useSearchFilter(containerRef);
  const getMetrics = useMetricsCache(
    data, sortedSeries, allTimestamps,
    options.hostField || '', options.cellMappings || [],
    customThresholdsData, metricsConfig, timelineIndex,
  );

  // Track pick-mode state for visual indicator
  useEffect(() => {
    const onPickStart = () => setPickModeActive(true);
    const onPickEnd = () => setPickModeActive(false);
    window.addEventListener('svgflow-pick-start', onPickStart);
    window.addEventListener('svgflow-pick-cancel', onPickEnd);
    window.addEventListener('svgflow-cell-selected', onPickEnd);
    return () => {
      window.removeEventListener('svgflow-pick-start', onPickStart);
      window.removeEventListener('svgflow-pick-cancel', onPickEnd);
      window.removeEventListener('svgflow-cell-selected', onPickEnd);
    };
  }, []);

  // ── Debug mode toggle ──
  setDebugEnabled(!!options.debugMode);

  // ── 3. Aplicar colores, listeners, animaciones (P2: decomposed) ──
  useEffect(() => {
    if (!svgLoaded || !containerRef.current) return;

    const container = containerRef.current;

    // P2: SVG injection + sizing + debug cleanup (base layer)
    prepareSvgContainer(container, svgContentRef.current || '', !!options.debugMode);

    syncLayerContainers(layerRefsMap, processedLayers, !!options.debugMode);

    cleanupListeners();

    const metricsCache = getMetrics();
    const metrics = metricsCache.metricsMap;
    const cacheHit = metricsCache.fingerprint === (containerRef.current as any)?._lastFp;
    (containerRef.current as any)._lastFp = metricsCache.fingerprint;

    // Debug: log data and hosts
    logDataSummary(sortedSeries, options.hostField || 'host.name');
    logHostsExtracted(metrics);
    logCellMappings(options.cellMappings || [], metrics);

    // P2: O(1) cellMapping lookup via Map instead of .find() per cell
    const cellMappingsIndex = buildCellMappingIndex(options.cellMappings || []);

    const ctx: CellProcessingContext = {
      metricsCache,
      metrics,
      mapping: defaultMapping(),
      hMapping: hostMappingData,
      hostsDisponibles: new Set(metrics.keys()),
      cellMappingsIndex,
      sortedSeries,
      globalThresholds,
      replaceVariables,
      options: { ...options, tooltipConfig, visualStyle },
      dataTimestamp,
      listenersRef,
      pickModeRef,
      cellTimestampsRef,
      severityCounts: {},
    };

    const targets = collectTargetCells(container, layerRefsMap, processedLayers);

    // Debug: log render cycle
    logRenderCycle({
      svgLoaded: true,
      totalTargets: targets.length,
      totalMappings: (options.cellMappings || []).length,
      totalHosts: metrics.size,
      totalLayers: processedLayers.length,
      cacheHit,
      timestamp: dataTimestamp,
    });

    processTargetsInBatches(targets, ctx);

    // Locate event listeners
    const onLocateCell = (e: Event) => handleLocateCell(e, containerRef);
    const onLocateStop = (e: Event) => handleLocateStop(e, containerRef);
    window.addEventListener('svgflow-locate-cell', onLocateCell);
    window.addEventListener('svgflow-locate-stop', onLocateStop);

    return () => {
      cleanupListeners();
      destroyTooltip();
      window.removeEventListener('svgflow-locate-cell', onLocateCell);
      window.removeEventListener('svgflow-locate-stop', onLocateStop);
    };
  }, [svgLoaded, getMetrics, options, width, height, hostMappingData, customThresholdsData, dataTimestamp, replaceVariables, timelineIndex, processedLayers]);

  function cleanupListeners() {
    listenersRef.current.forEach((fn) => fn());
    listenersRef.current = [];
  }

  // ── Render ──
  if (error) {
      return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          color: theme.colors.warning.text,
          background: theme.colors.background.secondary,
          borderRadius: 8,
          textAlign: 'center',
          fontFamily: theme.typography.fontFamily,
        }}
      >
        <div>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 14 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-svgflow-scope={panelScopeRef.current}
      className="svgflow-panel-shell"
      style={{
        width,
        height,
        overflow: 'hidden',
        position: 'relative',
        background: visualStyle.panelBackgroundColor,
        border: `1px solid ${visualStyle.panelBorderColor}`,
        borderRadius: visualStyle.panelBorderRadius,
        boxShadow: visualStyle.panelBoxShadow,
        backdropFilter: visualStyle.panelBackdropBlur > 0 ? `blur(${visualStyle.panelBackdropBlur}px)` : undefined,
        WebkitBackdropFilter: visualStyle.panelBackdropBlur > 0 ? `blur(${visualStyle.panelBackdropBlur}px)` : undefined,
        padding: visualStyle.panelPadding,
        boxSizing: 'border-box',
        ['--svgflow-hover-glow-color' as any]: visualStyle.hoverGlowColor,
        ['--svgflow-hover-glow-radius' as any]: `${visualStyle.hoverGlowRadius}px`,
        ['--svgflow-hover-brightness' as any]: String(visualStyle.hoverBrightness),
        ['--svgflow-critical-glow-color' as any]: visualStyle.criticalGlowColor,
        ['--svgflow-critical-glow-min' as any]: `${visualStyle.criticalGlowMin}px`,
        ['--svgflow-critical-glow-max' as any]: `${visualStyle.criticalGlowMax}px`,
        ['--svgflow-critical-pulse-duration' as any]: `${visualStyle.criticalPulseDuration}s`,
        ['--svgflow-locate-glow-color' as any]: visualStyle.locateGlowColor,
        ['--svgflow-locate-glow-radius' as any]: `${visualStyle.locateGlowRadius}px`,
        ['--svgflow-nodata-stroke-color' as any]: visualStyle.noDataStrokeColor,
        ['--svgflow-nodata-stroke-dasharray' as any]: visualStyle.noDataStrokeDasharray,
        ['--svgflow-nodata-opacity' as any]: String(visualStyle.noDataOpacity),
      }}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', borderRadius: 'inherit' }}>
      {/* B1: JSON parse error feedback */}
      {parseErrors.length > 0 && (
        <div style={{
          position: 'absolute', top: 4, left: 4, right: 4, zIndex: 100,
          fontSize: 11, padding: '4px 8px', borderRadius: 4,
          background: 'rgba(248,81,73,0.15)', color: '#f85149',
          border: '1px solid rgba(248,81,73,0.3)',
        }}>
          {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {/* Base SVG layer */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
        }}
      />
      {/* Multi-SVG overlay layers */}
      {processedLayers.map((pl) => (
        <div
          key={pl.id}
          ref={(el) => { if (el) layerRefsMap.current.set(pl.id, el); else layerRefsMap.current.delete(pl.id); }}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: pl.zIndex,
            opacity: pl.visible ? pl.opacity : 0,
            pointerEvents: pl.visible ? 'auto' : 'none',
            display: pl.visible ? '' : 'none',
          }}
        />
      ))}
      {/* NF-1: Severity legend overlay (toggleable) */}
      {options.showSeverityLegend && (
        <div style={{
          position: 'absolute', bottom: 6, right: 6, zIndex: 90,
          display: 'flex', flexDirection: 'column', gap: 2,
          padding: '4px 6px', borderRadius: 4,
          background: 'rgba(15, 23, 42, 0.85)', fontSize: 9,
          fontFamily: 'monospace', color: '#e0e0e0', pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
        }}>
          {([Severity.NORMAL, Severity.WARNING, Severity.MINOR, Severity.MAJOR, Severity.CRITICO] as const).map(sev => (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SEVERITY_COLORS[sev], flexShrink: 0 }} />
              <span>{sev}</span>
            </div>
          ))}
        </div>
      )}
      {/* NF-2: No-data message overlay (toggleable) */}
      {options.showNoDataMessage && svgLoaded && getMetrics().metricsMap.size === 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '12px 20px', borderRadius: 6,
            background: 'rgba(15, 23, 42, 0.8)', color: '#90a4ae',
            fontSize: 13, textAlign: 'center', backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📡</div>
            <div>Sin datos disponibles</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Verifica el datasource y los mappings</div>
          </div>
        </div>
      )}
      {/* UX-5: Loading spinner (toggleable) */}
      {options.showLoadingIndicator && !svgLoaded && !error && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 95,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 28, height: 28, border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#42a5f5', borderRadius: '50%',
            animation: 'svgflow-spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes svgflow-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {/* UX-3: Pick mode indicator overlay (toggleable) */}
      {options.showPickModeIndicator && pickModeActive && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 85,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(66, 165, 245, 0.06)', cursor: 'crosshair',
          border: '2px dashed rgba(66, 165, 245, 0.4)', borderRadius: 'inherit',
        }}>
          <div style={{
            padding: '6px 14px', borderRadius: 4,
            background: 'rgba(15, 23, 42, 0.85)', color: '#42a5f5',
            fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
          }}>
            Haz click en una celda del SVG
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

/**
 * P2: Extracted locate-cell event handler.
 */
function handleLocateCell(e: Event, containerRef: React.RefObject<HTMLDivElement | null>): void {
  const { cellId: locCellId, mode } = (e as CustomEvent).detail as { cellId: string; mode: 'hover' | 'click' };
  if (!containerRef.current || !locCellId) return;
  const locTarget = containerRef.current.querySelector(`[data-cell-id="${locCellId}"]`);
  if (!locTarget) return;
  const locShapes = Array.from(locTarget.querySelectorAll('.svgflow-shape'));
  const els = locShapes.length > 0 ? locShapes : Array.from(locTarget.querySelectorAll('path, rect'));

  if (mode === 'hover') {
    els.forEach((el) => { el.classList.remove('svgflow-locate-3x'); el.classList.add('svgflow-locating'); });
    (locTarget as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
  } else if (mode === 'click') {
    els.forEach((el) => { el.classList.remove('svgflow-locating'); el.classList.add('svgflow-locate-3x'); });
    (locTarget as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => { els.forEach((el) => el.classList.remove('svgflow-locate-3x')); }, 2500);
  }
}

/**
 * P2: Extracted locate-stop event handler.
 */
function handleLocateStop(e: Event, containerRef: React.RefObject<HTMLDivElement | null>): void {
  const { cellId: locCellId } = (e as CustomEvent).detail as { cellId: string };
  if (!containerRef.current || !locCellId) return;
  const locTarget = containerRef.current.querySelector(`[data-cell-id="${locCellId}"]`);
  if (!locTarget) return;
  locTarget.querySelectorAll('.svgflow-locating').forEach((el) => el.classList.remove('svgflow-locating'));
}

/**
 * Registra event listeners de hover, tooltip y click en una celda SVG.
 */
function attachCellListeners(
  target: Element,
  shapes: Element[],
  hostData: HostMetrics | null,
  cellId: string,
  resolvedHost: string | null,
  cellMapping: CellMapping | undefined,
  severity: Severity,
  color: string,
  mappedTooltip: TooltipEntry[] | null,
  dataTimestamp: number | null,
  options: SvgFlowOptions,
  replaceVariables: (s: string) => string,
  listenersRef: React.MutableRefObject<Array<() => void>>,
  hideTooltipFn: typeof hideTooltip,
  showCustomTooltipFn: typeof showCustomTooltip,
  pickModeRef: React.MutableRefObject<boolean>,
  cellTimestampsRef: React.MutableRefObject<Map<string, number>>
): void {
  const hd = hostData;
  target.classList.add('svgflow-target');
  const visualStyle = { ...DEFAULT_VISUAL_STYLE, ...(options.visualStyle || {}) };
  const tooltipConfig = { ...DEFAULT_TOOLTIP_CONFIG, ...(options.tooltipConfig || {}) };

  const onMouseEnter = () => {
    shapes.forEach((s) => {
      (s as SVGElement).style.filter = `drop-shadow(0 0 ${visualStyle.hoverGlowRadius}px ${visualStyle.hoverGlowColor || color}) brightness(${visualStyle.hoverBrightness})`;
    });
  };

  const onMouseLeave = () => {
    shapes.forEach((s) => { (s as SVGElement).style.filter = ''; });
    hideTooltipFn();
  };

  let lastTooltipTime = 0;
  const onMouseMove = (e: Event) => {
    if (isTooltipPinned()) {
      return;
    }
    const now = Date.now();
    if (now - lastTooltipTime < 50) return;
    lastTooltipTime = now;
    const me = e as MouseEvent;
    if (mappedTooltip && mappedTooltip.length > 0) {
      const cellTs = cellTimestampsRef.current.get(cellId) ?? dataTimestamp;
      showCustomTooltipFn(cellMapping?.label || resolvedHost || cellId, severity, mappedTooltip, me.clientX, me.clientY, cellTs, tooltipConfig);
    }
  };

  const onClick = (e: Event) => {
    if (pickModeRef.current) {
      e.preventDefault(); e.stopPropagation();
      pickModeRef.current = false;
      window.dispatchEvent(new CustomEvent('svgflow-cell-selected', {
        detail: { cellId, resolvedHost: resolvedHost || '' },
      }));
      shapes.forEach((s) => {
        (s as SVGElement).style.filter = `brightness(1.8) drop-shadow(0 0 ${Math.max(visualStyle.hoverGlowRadius, 14)}px ${visualStyle.clickFlashColor})`;
        setTimeout(() => { (s as SVGElement).style.filter = ''; }, visualStyle.clickFlashDuration);
      });
      return;
    }
    const urlTemplate = cellMapping?.dataLink || options.clickUrlTemplate;
    if (urlTemplate && hd) {
      let url = urlTemplate
        .replace(/\{\{host\}\}/g, hd.normalizedHost)
        .replace(/\{\{cellId\}\}/g, cellId);
      url = replaceVariables(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  target.addEventListener('mouseenter', onMouseEnter);
  target.addEventListener('mouseleave', onMouseLeave);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('click', onClick);

  listenersRef.current.push(
    () => target.removeEventListener('mouseenter', onMouseEnter),
    () => target.removeEventListener('mouseleave', onMouseLeave),
    () => target.removeEventListener('mousemove', onMouseMove),
    () => target.removeEventListener('click', onClick),
  );
}

function scopePanelCss(css: string, scopeId: string): string {
  if (typeof css !== 'string' || !css.trim()) {
    return '';
  }
  return css.replace(/:scope\b/g, `[data-svgflow-scope="${scopeId}"]`);
}

function normalizeVisualStyle(value?: Partial<VisualStyleConfig> | null): VisualStyleConfig {
  const merged = { ...DEFAULT_VISUAL_STYLE, ...(value || {}) } as any;
  return {
    ...DEFAULT_VISUAL_STYLE,
    ...merged,
    panelBackgroundColor: typeof merged.panelBackgroundColor === 'string' ? merged.panelBackgroundColor : DEFAULT_VISUAL_STYLE.panelBackgroundColor,
    panelBorderColor: typeof merged.panelBorderColor === 'string' ? merged.panelBorderColor : DEFAULT_VISUAL_STYLE.panelBorderColor,
    panelBorderRadius: Number.isFinite(merged.panelBorderRadius) ? merged.panelBorderRadius : DEFAULT_VISUAL_STYLE.panelBorderRadius,
    panelPadding: Number.isFinite(merged.panelPadding) ? merged.panelPadding : DEFAULT_VISUAL_STYLE.panelPadding,
    panelBoxShadow: typeof merged.panelBoxShadow === 'string' ? merged.panelBoxShadow : DEFAULT_VISUAL_STYLE.panelBoxShadow,
    panelBackdropBlur: Number.isFinite(merged.panelBackdropBlur) ? merged.panelBackdropBlur : DEFAULT_VISUAL_STYLE.panelBackdropBlur,
    hoverGlowColor: typeof merged.hoverGlowColor === 'string' ? merged.hoverGlowColor : DEFAULT_VISUAL_STYLE.hoverGlowColor,
    hoverGlowRadius: Number.isFinite(merged.hoverGlowRadius) ? merged.hoverGlowRadius : DEFAULT_VISUAL_STYLE.hoverGlowRadius,
    hoverBrightness: Number.isFinite(merged.hoverBrightness) ? merged.hoverBrightness : DEFAULT_VISUAL_STYLE.hoverBrightness,
    criticalGlowColor: typeof merged.criticalGlowColor === 'string' ? merged.criticalGlowColor : DEFAULT_VISUAL_STYLE.criticalGlowColor,
    criticalGlowMin: Number.isFinite(merged.criticalGlowMin) ? merged.criticalGlowMin : DEFAULT_VISUAL_STYLE.criticalGlowMin,
    criticalGlowMax: Number.isFinite(merged.criticalGlowMax) ? merged.criticalGlowMax : DEFAULT_VISUAL_STYLE.criticalGlowMax,
    criticalPulseDuration: Number.isFinite(merged.criticalPulseDuration) ? merged.criticalPulseDuration : DEFAULT_VISUAL_STYLE.criticalPulseDuration,
    locateGlowColor: typeof merged.locateGlowColor === 'string' ? merged.locateGlowColor : DEFAULT_VISUAL_STYLE.locateGlowColor,
    locateGlowRadius: Number.isFinite(merged.locateGlowRadius) ? merged.locateGlowRadius : DEFAULT_VISUAL_STYLE.locateGlowRadius,
    noDataStrokeColor: typeof merged.noDataStrokeColor === 'string' ? merged.noDataStrokeColor : DEFAULT_VISUAL_STYLE.noDataStrokeColor,
    noDataStrokeDasharray: typeof merged.noDataStrokeDasharray === 'string' ? merged.noDataStrokeDasharray : DEFAULT_VISUAL_STYLE.noDataStrokeDasharray,
    noDataOpacity: Number.isFinite(merged.noDataOpacity) ? merged.noDataOpacity : DEFAULT_VISUAL_STYLE.noDataOpacity,
    containerColorCritical: typeof merged.containerColorCritical === 'string' ? merged.containerColorCritical : DEFAULT_VISUAL_STYLE.containerColorCritical,
    containerColorMajor: typeof merged.containerColorMajor === 'string' ? merged.containerColorMajor : DEFAULT_VISUAL_STYLE.containerColorMajor,
    containerColorMinor: typeof merged.containerColorMinor === 'string' ? merged.containerColorMinor : DEFAULT_VISUAL_STYLE.containerColorMinor,
    containerColorWarning: typeof merged.containerColorWarning === 'string' ? merged.containerColorWarning : DEFAULT_VISUAL_STYLE.containerColorWarning,
    containerColorNormal: typeof merged.containerColorNormal === 'string' ? merged.containerColorNormal : DEFAULT_VISUAL_STYLE.containerColorNormal,
    containerColorNoData: typeof merged.containerColorNoData === 'string' ? merged.containerColorNoData : DEFAULT_VISUAL_STYLE.containerColorNoData,
    clickFlashColor: typeof merged.clickFlashColor === 'string' ? merged.clickFlashColor : DEFAULT_VISUAL_STYLE.clickFlashColor,
    clickFlashDuration: Number.isFinite(merged.clickFlashDuration) ? merged.clickFlashDuration : DEFAULT_VISUAL_STYLE.clickFlashDuration,
    customCss: typeof merged.customCss === 'string' ? merged.customCss : DEFAULT_VISUAL_STYLE.customCss,
  };
}

function normalizeTooltipConfig(value?: Partial<typeof DEFAULT_TOOLTIP_CONFIG> | null) {
  const merged = { ...DEFAULT_TOOLTIP_CONFIG, ...(value || {}) } as any;
  const pinKey = merged.pinKey;
  return {
    ...DEFAULT_TOOLTIP_CONFIG,
    ...merged,
    showMiniCharts: typeof merged.showMiniCharts === 'boolean' ? merged.showMiniCharts : DEFAULT_TOOLTIP_CONFIG.showMiniCharts,
    miniChartHeight: Number.isFinite(merged.miniChartHeight) ? merged.miniChartHeight : DEFAULT_TOOLTIP_CONFIG.miniChartHeight,
    miniChartPoints: Number.isFinite(merged.miniChartPoints) ? merged.miniChartPoints : DEFAULT_TOOLTIP_CONFIG.miniChartPoints,
    pinKey: pinKey === 'shift' || pinKey === 'ctrl' || pinKey === 'meta' ? pinKey : DEFAULT_TOOLTIP_CONFIG.pinKey,
    customCss: typeof merged.customCss === 'string' ? merged.customCss : DEFAULT_TOOLTIP_CONFIG.customCss,
    htmlTemplate: typeof merged.htmlTemplate === 'string' ? merged.htmlTemplate : DEFAULT_TOOLTIP_CONFIG.htmlTemplate,
  };
}

/**
 * Añade overlay de debug sobre un target SVG.
 */
function addDebugOverlay(target: SVGElement, cellId: string, resolvedHost: string): void {
  // P12: Remove any previous debug overlay for this target
  target.querySelectorAll('.svgflow-debug-overlay').forEach(el => el.remove());

  const bbox = (target as any).getBBox?.();
  if (!bbox) return;

  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.classList.add('svgflow-debug-overlay');
  g.setAttribute('pointer-events', 'none');

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', String(bbox.x));
  bg.setAttribute('y', String(bbox.y));
  bg.setAttribute('width', String(Math.min(bbox.width, 120)));
  bg.setAttribute('height', '16');
  bg.setAttribute('fill', 'rgba(0,0,0,0.7)');
  bg.setAttribute('rx', '3');

  const text = document.createElementNS(ns, 'text');
  text.setAttribute('x', String(bbox.x + 4));
  text.setAttribute('y', String(bbox.y + 12));
  text.setAttribute('font-size', '9');
  text.setAttribute('fill', '#0f0');
  text.setAttribute('font-family', 'monospace');
  text.textContent = `${cellId} → ${resolvedHost}`;

  g.appendChild(bg);
  g.appendChild(text);
  target.appendChild(g);
}

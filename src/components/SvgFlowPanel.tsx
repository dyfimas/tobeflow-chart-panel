// ─────────────────────────────────────────────────────────────
// SvgFlowPanel.tsx – Componente principal del panel
// Replica la lógica de SVGManager + main del script de producción
// ─────────────────────────────────────────────────────────────
import { PanelProps, DataFrame } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { useRef, useEffect, useState } from 'react';
import {
  SvgFlowOptions,
  HostMetrics,
  CellMapping,
  Severity,
  COLORES,
} from '../types';
import {
  resolverHost,
  defaultMapping,
  showCustomTooltip,
  hideTooltip,
  destroyTooltip,
  createTooltipScope,
  setTooltipScope,
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
function getChunkSize(targetCount: number): number {
  if (targetCount <= 50) return targetCount; // small SVG: process all at once
  if (targetCount <= 200) return 25;
  return 10; // large SVG: keep small chunks
}

// ─── P2: Extracted helpers for main useEffect decomposition ──

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

function processTargetsInBatches(targets: Element[], ctx: CellProcessingContext): void {
  function processChunk(startIdx: number) {
    const chunkSize = getChunkSize(targets.length);
    const endIdx = Math.min(startIdx + chunkSize, targets.length);

    for (let i = startIdx; i < endIdx; i++) {
      processSingleCell(targets[i], ctx);
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
    color = result.color;
    severity = result.severity;
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

// ─── Componente ─────────────────────────────────────────────

export const SvgFlowPanel: React.FC<PanelProps<SvgFlowOptions>> = ({
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
  const cellTimestampsRef = useRef<Map<string, number>>(new Map());

  // F2: Multi-panel tooltip isolation
  const tooltipScopeRef = useRef(createTooltipScope());
  useEffect(() => { setTooltipScope(tooltipScopeRef.current); }, []);

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
      options,
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
    <div style={{ width, height, overflow: 'hidden', position: 'relative', background: 'transparent' }}>
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

  const onMouseEnter = () => {
    shapes.forEach((s) => {
      (s as SVGElement).style.filter = `drop-shadow(0 0 8px ${color}) brightness(1.15)`;
    });
  };

  const onMouseLeave = () => {
    shapes.forEach((s) => { (s as SVGElement).style.filter = ''; });
    hideTooltipFn();
  };

  let lastTooltipTime = 0;
  const onMouseMove = (e: Event) => {
    const now = Date.now();
    if (now - lastTooltipTime < 50) return;
    lastTooltipTime = now;
    const me = e as MouseEvent;
    if (mappedTooltip && mappedTooltip.length > 0) {
      const cellTs = cellTimestampsRef.current.get(cellId) ?? dataTimestamp;
      showCustomTooltipFn(hd?.hostname || cellId, severity, mappedTooltip, me.clientX, me.clientY, cellTs, options.tooltipConfig);
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
        (s as SVGElement).style.filter = 'brightness(1.8) drop-shadow(0 0 14px #00ff88)';
        setTimeout(() => { (s as SVGElement).style.filter = ''; }, 600);
      });
      return;
    }
    const urlTemplate = cellMapping?.dataLink || options.clickUrlTemplate;
    if (urlTemplate && hd) {
      let url = urlTemplate
        .replace(/\{\{host\}\}/g, hd.normalizedHost)
        .replace(/\{\{cellId\}\}/g, cellId);
      url = replaceVariables(url);
      window.open(url, '_blank');
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

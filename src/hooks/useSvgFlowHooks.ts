// ─────────────────────────────────────────────────────────────
// useSvgFlowHooks.ts – L2: Custom hooks extracted from SvgFlowPanel
// Reduces component complexity by encapsulating cohesive logic.
// ─────────────────────────────────────────────────────────────
import { useRef, useEffect, useState, useMemo, useCallback, type RefObject } from 'react';
import { DataFrame, PanelData } from '@grafana/data';
import {
  SvgFlowOptions,
  SvgLayer,
  MetricThreshold,
  MetricConfig,
  UmbralesServidor,
  HostMetrics,
  CellMapping,
  UMBRALES_PERSONALIZADOS,
  resolveMetricsConfig,
} from '../types';
import {
  sanitizeSvg,
  adaptSvgForDarkTheme,
  isDrawioXml,
  drawioToSvg,
  collectTimestamps,
  defaultHostMapping,
  extractMetrics,
  extractMetricsAtTime,
  computeHostSeverity,
} from '../utils';
import {
  buildHostSearchIndex,
  buildFieldValueIndex,
} from '../utils/metricsIndex';
import type { FieldValueIndex, HostSearchIndex } from '../utils/metricsIndex';

// ─── useParsedOptions ───────────────────────────────────────

export interface ParsedOptions {
  hostMappingData: Record<string, string>;
  customThresholdsData: Record<string, UmbralesServidor>;
  metricsConfig: Record<string, MetricConfig>;
  globalThresholds: MetricThreshold[];
  globalThresholdMode: string;
  parseErrors: string[];
}

/**
 * Memoized parsing of JSON-based panel options.
 */
export function useParsedOptions(options: SvgFlowOptions): ParsedOptions {
  const hostMappingData = useMemo((): { data: Record<string, string>; error?: string } => {
    const base = defaultHostMapping();
    try {
      if (options.hostMappingJson?.trim()) {
        const parsed = JSON.parse(options.hostMappingJson);
        return { data: { ...base, ...parsed } };
      }
    } catch (e) {
      return { data: base, error: `Host mapping JSON: ${e instanceof Error ? e.message : 'invalid'}` };
    }
    return { data: base };
  }, [options.hostMappingJson]);

  const customThresholdsData = useMemo((): { data: Record<string, UmbralesServidor>; error?: string } => {
    const base = { ...UMBRALES_PERSONALIZADOS };
    try {
      if (options.customThresholdsJson?.trim()) {
        const parsed = JSON.parse(options.customThresholdsJson);
        return { data: { ...base, ...parsed } };
      }
    } catch (e) {
      return { data: base, error: `Custom thresholds JSON: ${e instanceof Error ? e.message : 'invalid'}` };
    }
    return { data: base };
  }, [options.customThresholdsJson]);

  const metricsConfig = useMemo((): Record<string, MetricConfig> => {
    return resolveMetricsConfig(options.metricsConfigJson);
  }, [options.metricsConfigJson]);

  const globalThresholds = useMemo((): MetricThreshold[] => {
    try {
      const gt = options.globalThresholds;
      if (gt && Array.isArray(gt.steps)) {
        return gt.steps
          .filter((s: any) => s.value !== -Infinity && isFinite(s.value))
          .map((s: any) => ({ value: s.value, color: s.color, op: s.op || '>=' }));
      }
    } catch { /* ignore */ }
    return [];
  }, [options.globalThresholds]);

  const globalThresholdMode = useMemo((): string => {
    try {
      return options.globalThresholds?.mode || 'absolute';
    } catch { return 'absolute'; }
  }, [options.globalThresholds]);

  const parseErrors = useMemo((): string[] => {
    const errs: string[] = [];
    if (hostMappingData.error) errs.push(hostMappingData.error);
    if (customThresholdsData.error) errs.push(customThresholdsData.error);
    return errs;
  }, [hostMappingData.error, customThresholdsData.error]);

  return {
    hostMappingData: hostMappingData.data,
    customThresholdsData: customThresholdsData.data,
    metricsConfig,
    globalThresholds,
    globalThresholdMode,
    parseErrors,
  };
}

// ─── useSvgLoader ───────────────────────────────────────────

export interface SvgLoaderResult {
  svgContentRef: React.MutableRefObject<string>;
  svgLoaded: boolean;
  error: string | null;
}

/**
 * Loads and processes SVG from inline source or URL.
 * Handles DrawIO conversion, dark theme adaptation, and sanitization.
 */
export function useSvgLoader(
  options: SvgFlowOptions,
  isDark: boolean,
  replaceVariables: (s: string) => string,
): SvgLoaderResult {
  const svgContentRef = useRef<string>('');
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function processSvgSource(source: string): Promise<string> {
      let raw = source;
      if (isDrawioXml(raw)) {
        raw = drawioToSvg(raw);
      }
      if (isDark) {
        raw = adaptSvgForDarkTheme(raw);
      }
      return sanitizeSvg(raw);
    }

    async function loadSvg() {
      try {
        let raw = '';
        if (options.svgSource?.trim()) {
          raw = options.svgSource;
        } else if (options.svgUrl?.trim()) {
          const resolvedUrl = replaceVariables(options.svgUrl);
          const resp = await fetch(resolvedUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          raw = await resp.text();
        }
        if (cancelled) return;

        if (!raw.trim()) {
          setError('Configura un SVG: pega el contenido o proporciona una URL.');
          return;
        }

        svgContentRef.current = await processSvgSource(raw);
        setError(null);
        setSvgLoaded(true);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Error cargando SVG');
      }
    }

    setSvgLoaded(false);
    loadSvg();
    return () => { cancelled = true; };
  }, [options.svgSource, options.svgUrl, isDark, replaceVariables]);

  return { svgContentRef, svgLoaded, error };
}

// ─── useSortedSeries ────────────────────────────────────────

/**
 * Sorts DataFrame series by @timestamp ascending and collects unique timestamps.
 */
export function useSortedSeries(series: DataFrame[]): { sortedSeries: DataFrame[]; allTimestamps: number[] } {
  const sortedSeries = useMemo((): DataFrame[] => {
    return series.map((frame) => {
      const field = frame.fields.find(
        (f) => f.name === '@timestamp' || f.type === 'time'
      );
      if (!field || field.values.length <= 1) return frame;

      const indices = Array.from({ length: field.values.length }, (_, i) => i);
      indices.sort((a, b) => {
        const va = field.values[a];
        const vb = field.values[b];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (va < vb) return -1;
        if (va > vb) return 1;
        return 0;
      });

      return {
        ...frame,
        fields: frame.fields.map((f) => ({
          ...f,
          values: indices.map((i) => f.values[i]),
        })),
      };
    });
  }, [series]);

  const allTimestamps = useMemo((): number[] => {
    return collectTimestamps(sortedSeries);
  }, [sortedSeries]);

  return { sortedSeries, allTimestamps };
}

// ─── useDataTimestamp ───────────────────────────────────────

/**
 * Extracts the last timestamp from the data series.
 */
export function useDataTimestamp(series: DataFrame[]): number | null {
  return useMemo((): number | null => {
    for (const frame of series) {
      const tf = frame.fields.find((f) => f.type === 'time');
      if (tf && tf.values.length > 0) {
        const last = tf.values[tf.values.length - 1];
        if (typeof last === 'number') return last;
      }
    }
    return null;
  }, [series]);
}

// ─── useLayerLoader ─────────────────────────────────────────

export interface ProcessedLayer {
  id: string;
  name: string;
  html: string;
  visible: boolean;
  opacity: number;
  zIndex: number;
}

/**
 * Loads and processes all SVG overlay layers.
 * Returns ready-to-inject HTML for each visible layer.
 */
export function useLayerLoader(
  layers: SvgLayer[] | undefined,
  isDark: boolean,
): ProcessedLayer[] {
  return useMemo((): ProcessedLayer[] => {
    if (!layers || layers.length === 0) return [];
    return layers.map((layer) => {
      let html = '';
      if (layer.svgSource?.trim()) {
        let raw = layer.svgSource;
        if (isDrawioXml(raw)) {
          try { raw = drawioToSvg(raw); } catch { raw = ''; }
        }
        if (isDark && raw) {
          raw = adaptSvgForDarkTheme(raw);
        }
        html = raw ? sanitizeSvg(raw) : '';
      }
      return {
        id: layer.id,
        name: layer.name,
        html,
        visible: layer.visible,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
      };
    });
  }, [layers, isDark]);
}

// ─── MetricsCache ───────────────────────────────────────────

export interface MetricsCache {
  fingerprint: string;
  metricsMap: Map<string, HostMetrics>;
  /** Per-refId metrics maps (only populated when cell mappings use refId) */
  perRefIdMaps: Map<string, Map<string, HostMetrics>>;
  /** Per-mapping metrics maps (refId + custom hostField combinations) */
  perMappingMaps: Map<string, Map<string, HostMetrics>>;
  /** P14: Pre-computed host search index for O(1) lookups */
  hostSearchIndex: HostSearchIndex;
  /** P13: Pre-computed field value index for O(1) aggregation */
  fieldValueIndex: FieldValueIndex;
  /** Per-mapping host search indexes */
  perMappingHostIndexes: Map<string, HostSearchIndex>;
}

export function emptyMetricsCache(): MetricsCache {
  return {
    fingerprint: '',
    metricsMap: new Map(),
    perRefIdMaps: new Map(),
    perMappingMaps: new Map(),
    hostSearchIndex: { exact: new Map(), normalized: new Map(), lower: new Map() },
    fieldValueIndex: { byHost: new Map(), byNormHost: new Map() },
    perMappingHostIndexes: new Map(),
  };
}

// ─── useAnimationStyles (P11: ref-counted for multi-panel) ──

const ANIMATION_STYLES = `
  @keyframes svgflow-pulso-critico {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(218, 32, 32, 0.6)); }
    50% { filter: drop-shadow(0 0 12px rgba(218, 32, 32, 0.9)); }
  }
  .svgflow-shape {
    transition: fill 0.4s ease, filter 0.3s ease;
  }
  .svgflow-shape-critico {
    animation: svgflow-pulso-critico 2s ease-in-out infinite;
  }
  .svgflow-target {
    cursor: pointer;
  }
  .svgflow-target:hover .svgflow-shape {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3)) brightness(1.15);
  }
  @keyframes svgflow-locate-pulse {
    0% { filter: drop-shadow(0 0 0px rgba(60, 140, 255, 0)) brightness(1); }
    30% { filter: drop-shadow(0 0 20px rgba(60, 140, 255, 0.9)) brightness(1.4); }
    60% { filter: drop-shadow(0 0 35px rgba(60, 140, 255, 0.5)) brightness(1.2); }
    100% { filter: drop-shadow(0 0 0px rgba(60, 140, 255, 0)) brightness(1); }
  }
  .svgflow-locating {
    animation: svgflow-locate-pulse 1s ease-in-out infinite;
    z-index: 9999;
  }
  .svgflow-locate-3x {
    animation: svgflow-locate-pulse 0.8s ease-in-out 3;
    z-index: 9999;
  }
  .svgflow-nodata {
    stroke: #90a4ae !important;
    stroke-dasharray: 6 3;
    stroke-width: 2;
    opacity: 0.6;
  }
`;
const STYLE_ID = 'svgflow-animation-styles';
let _styleRefCount = 0;

function acquireAnimationStyles(): void {
  _styleRefCount++;
  if (_styleRefCount === 1) {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = ANIMATION_STYLES;
      document.head.appendChild(el);
    }
  }
}

function releaseAnimationStyles(): void {
  _styleRefCount = Math.max(0, _styleRefCount - 1);
  if (_styleRefCount === 0) {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }
}

export function useAnimationStyles(): void {
  useEffect(() => {
    acquireAnimationStyles();
    return () => { releaseAnimationStyles(); };
  }, []);
}

// ─── usePickMode (M4: scoped via events) ────────────────────

export function usePickMode() {
  const pickModeRef = useRef(false);
  useEffect(() => {
    const onPickStart = () => { pickModeRef.current = true; };
    const onPickCancel = () => { pickModeRef.current = false; };
    const onCellSelected = () => { pickModeRef.current = false; };
    window.addEventListener('svgflow-pick-start', onPickStart);
    window.addEventListener('svgflow-pick-cancel', onPickCancel);
    window.addEventListener('svgflow-cell-selected', onCellSelected);
    return () => {
      window.removeEventListener('svgflow-pick-start', onPickStart);
      window.removeEventListener('svgflow-pick-cancel', onPickCancel);
      window.removeEventListener('svgflow-cell-selected', onCellSelected);
    };
  }, []);
  return pickModeRef;
}

// ─── useSearchFilter ────────────────────────────────────────

export function useSearchFilter(containerRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    function onSearchEvent(e: Event) {
      const q = ((e as CustomEvent).detail?.query || '').trim().toLowerCase();
      if (!containerRef.current) return;
      const cells = containerRef.current.querySelectorAll<SVGGElement>('g[data-cell-id]');
      if (!q) {
        cells.forEach((g) => { g.style.opacity = ''; });
        return;
      }
      let firstMatch: SVGGElement | null = null;
      cells.forEach((g) => {
        const cellId = (g.getAttribute('data-cell-id') || '').toLowerCase();
        const textContent = (g.textContent || '').toLowerCase();
        const match = cellId.includes(q) || textContent.includes(q);
        g.style.opacity = match ? '' : '0.15';
        if (match && !firstMatch) firstMatch = g;
      });
      if (firstMatch) {
        (firstMatch as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
    window.addEventListener('svgflow-search', onSearchEvent);
    return () => window.removeEventListener('svgflow-search', onSearchEvent);
  }, []);
}

// ─── useMetricsCache ────────────────────────────────────────

export function useMetricsCache(
  data: { structureRev?: number },
  sortedSeries: DataFrame[],
  allTimestamps: number[],
  hostField: string,
  cellMappings: CellMapping[],
  customThresholdsData: Record<string, UmbralesServidor>,
  metricsConfig: Record<string, MetricConfig>,
  timelineIndex: number | null,
): () => MetricsCache {
  const cacheRef = useRef<MetricsCache>(emptyMetricsCache());

  return useCallback((): MetricsCache => {
    const mappingKeys = cellMappings.map(m => {
      const metricHosts = (m.metrics || []).map(mt => `${mt.refId || ''}/${mt.hostField || ''}`).join(',');
      return `${m.refId || ''}:${metricHosts}`;
    });
    const timelineTs = (timelineIndex != null && allTimestamps[timelineIndex] != null) ? allTimestamps[timelineIndex] : null;
    const fp = `${data.structureRev ?? 0}_${sortedSeries.length}_${
      sortedSeries.reduce((acc, s) => acc + (s.fields[0]?.values?.length ?? 0), 0)
    }_${JSON.stringify(mappingKeys)}_tl${timelineTs ?? 'live'}`;

    if (cacheRef.current.fingerprint === fp) {
      return cacheRef.current;
    }

    const defaultHostField = hostField || 'host.name';
    const ct = customThresholdsData;

    const doExtract = (series: DataFrame[], hf: string, refId?: string) => {
      if (timelineTs != null) {
        return extractMetricsAtTime(series, hf, timelineTs, metricsConfig);
      }
      return extractMetrics(series, hf, refId, metricsConfig);
    };

    const map = doExtract(sortedSeries, defaultHostField);
    for (const [, host] of map) {
      host.severity = computeHostSeverity(host, ct, metricsConfig);
    }

    const perRefIdMaps = new Map<string, Map<string, HostMetrics>>();
    const perMappingMaps = new Map<string, Map<string, HostMetrics>>();

    for (const cm of cellMappings) {
      const refId = cm.refId || '';

      for (const mt of (cm.metrics || [])) {
        const hField = mt.hostField || '';
        const mtRefId = mt.refId || refId;
        const key = `${mtRefId}::${hField}`;
        if (!perMappingMaps.has(key) && (mtRefId || hField)) {
          const effectiveHostField = hField || defaultHostField;
          const filteredSeries = mtRefId ? sortedSeries.filter(f => f.refId === mtRefId) : sortedSeries;
          const filteredMap = doExtract(filteredSeries, effectiveHostField);
          for (const [, host] of filteredMap) {
            host.severity = computeHostSeverity(host, ct, metricsConfig);
          }
          perMappingMaps.set(key, filteredMap);
        }
      }

      if (refId && !perRefIdMaps.has(refId)) {
        const refIdSeries = sortedSeries.filter(f => f.refId === refId);
        const refIdMap = doExtract(refIdSeries, defaultHostField);
        for (const [, host] of refIdMap) {
          host.severity = computeHostSeverity(host, ct, metricsConfig);
        }
        perRefIdMaps.set(refId, refIdMap);
      }
    }

    const hostSearchIndex = buildHostSearchIndex(map);
    const fieldValueIndex = buildFieldValueIndex(sortedSeries, defaultHostField);
    const perMappingHostIndexes = new Map<string, HostSearchIndex>();
    for (const [key, mMap] of perMappingMaps) {
      perMappingHostIndexes.set(key, buildHostSearchIndex(mMap));
    }
    for (const [key, rMap] of perRefIdMaps) {
      if (!perMappingHostIndexes.has(key)) {
        perMappingHostIndexes.set(key, buildHostSearchIndex(rMap));
      }
    }

    cacheRef.current = {
      fingerprint: fp, metricsMap: map, perRefIdMaps, perMappingMaps,
      hostSearchIndex, fieldValueIndex, perMappingHostIndexes,
    };
    return cacheRef.current;
  }, [data, sortedSeries, hostField, cellMappings, customThresholdsData, metricsConfig, timelineIndex, allTimestamps]);
}

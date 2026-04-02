// ─────────────────────────────────────────────────────────────
// tooltipManager.ts – Tooltip estilo producción (dark glass)
// Replica el TooltipManager del script jsATC_optimizado
// Configurable via TooltipConfig
// ─────────────────────────────────────────────────────────────
import { HostMetrics, Severity, SEVERITY_COLORS, COLORES, DEFAULT_METRICAS_CONFIG, MetricConfig, TooltipConfig, METRIC_DISPLAY_ORDER } from '../types';
import DOMPurify from 'dompurify';

const TOOLTIP_ID_PREFIX = 'svgflow-tooltip';
let tooltipIdCounter = 0;
let activeTooltipId = `${TOOLTIP_ID_PREFIX}-${tooltipIdCounter}`;

/** Create a unique tooltip scope for each panel instance */
export function createTooltipScope(): string {
  tooltipIdCounter++;
  return `${TOOLTIP_ID_PREFIX}-${tooltipIdCounter}`;
}

/** Set the active tooltip scope (call from each panel) */
export function setTooltipScope(id: string): void {
  activeTooltipId = id;
}

/** Default tooltip config used when no config is provided */
const DEFAULT_TOOLTIP_CONFIG: TooltipConfig = {
  mode: 'detailed',
  maxWidth: 380,
  fontSize: 12,
  fontFamily: 'inherit',
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: 4,
  padding: 12,
  opacity: 0.95,
  backdropBlur: 14,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowBlur: 32,
  headerBackgroundColor: 'transparent',
  showSeverity: true,
  showTimestamp: true,
  showMiniCharts: true,
  miniChartHeight: 26,
  miniChartPoints: 40,
  pinKey: 'alt',
  customCss: '',
  htmlTemplate: '',
};

function toPinKey(value: unknown): 'alt' | 'shift' | 'ctrl' | 'meta' {
  if (value === 'shift' || value === 'ctrl' || value === 'meta') {
    return value;
  }
  return 'alt';
}

/** Format a timestamp as clock + relative "hace X min" / "X min ago" */
function formatTimestamp(ts?: number | null): string {
  const locale = navigator.language || 'es-ES';
  const isEs = locale.startsWith('es');
  if (ts && Number.isFinite(ts)) {
    const clock = new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const diffMs = Date.now() - ts;
    if (diffMs < 0 || diffMs > 86_400_000) return clock;
    if (diffMs < 60_000) return `${clock} <span style="opacity:0.6">(${isEs ? 'ahora' : 'now'})</span>`;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${clock} <span style="opacity:0.6">(${isEs ? `hace ${mins} min` : `${mins} min ago`})</span>`;
    const hrs = Math.floor(mins / 60);
    return `${clock} <span style="opacity:0.6">(${isEs ? `hace ${hrs}h ${mins % 60}m` : `${hrs}h ${mins % 60}m ago`})</span>`;
  }
  return new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Merge partial user config with defaults */
function resolveConfig(cfg?: Partial<TooltipConfig>): TooltipConfig {
  if (!cfg) return DEFAULT_TOOLTIP_CONFIG;
  const merged = { ...DEFAULT_TOOLTIP_CONFIG, ...cfg } as any;
  return {
    ...DEFAULT_TOOLTIP_CONFIG,
    ...merged,
    mode: merged.mode === 'compact' || merged.mode === 'off' ? merged.mode : 'detailed',
    maxWidth: Number.isFinite(merged.maxWidth) ? merged.maxWidth : DEFAULT_TOOLTIP_CONFIG.maxWidth,
    fontSize: Number.isFinite(merged.fontSize) ? merged.fontSize : DEFAULT_TOOLTIP_CONFIG.fontSize,
    fontFamily: typeof merged.fontFamily === 'string' && merged.fontFamily.trim() ? merged.fontFamily : DEFAULT_TOOLTIP_CONFIG.fontFamily,
    backgroundColor: typeof merged.backgroundColor === 'string' ? merged.backgroundColor : DEFAULT_TOOLTIP_CONFIG.backgroundColor,
    textColor: typeof merged.textColor === 'string' ? merged.textColor : DEFAULT_TOOLTIP_CONFIG.textColor,
    borderColor: typeof merged.borderColor === 'string' ? merged.borderColor : DEFAULT_TOOLTIP_CONFIG.borderColor,
    borderRadius: Number.isFinite(merged.borderRadius) ? merged.borderRadius : DEFAULT_TOOLTIP_CONFIG.borderRadius,
    padding: Number.isFinite(merged.padding) ? merged.padding : DEFAULT_TOOLTIP_CONFIG.padding,
    opacity: Number.isFinite(merged.opacity) ? merged.opacity : DEFAULT_TOOLTIP_CONFIG.opacity,
    backdropBlur: Number.isFinite(merged.backdropBlur) ? merged.backdropBlur : DEFAULT_TOOLTIP_CONFIG.backdropBlur,
    shadowColor: typeof merged.shadowColor === 'string' ? merged.shadowColor : DEFAULT_TOOLTIP_CONFIG.shadowColor,
    shadowBlur: Number.isFinite(merged.shadowBlur) ? merged.shadowBlur : DEFAULT_TOOLTIP_CONFIG.shadowBlur,
    headerBackgroundColor: typeof merged.headerBackgroundColor === 'string' ? merged.headerBackgroundColor : DEFAULT_TOOLTIP_CONFIG.headerBackgroundColor,
    showSeverity: typeof merged.showSeverity === 'boolean' ? merged.showSeverity : DEFAULT_TOOLTIP_CONFIG.showSeverity,
    showTimestamp: typeof merged.showTimestamp === 'boolean' ? merged.showTimestamp : DEFAULT_TOOLTIP_CONFIG.showTimestamp,
    showMiniCharts: typeof merged.showMiniCharts === 'boolean' ? merged.showMiniCharts : DEFAULT_TOOLTIP_CONFIG.showMiniCharts,
    miniChartHeight: Number.isFinite(merged.miniChartHeight) ? merged.miniChartHeight : DEFAULT_TOOLTIP_CONFIG.miniChartHeight,
    miniChartPoints: Number.isFinite(merged.miniChartPoints) ? merged.miniChartPoints : DEFAULT_TOOLTIP_CONFIG.miniChartPoints,
    pinKey: toPinKey(merged.pinKey),
    customCss: typeof merged.customCss === 'string' ? merged.customCss : DEFAULT_TOOLTIP_CONFIG.customCss,
    htmlTemplate: typeof merged.htmlTemplate === 'string' ? merged.htmlTemplate : DEFAULT_TOOLTIP_CONFIG.htmlTemplate,
  };
}

function buildTooltipStyles(cfg: TooltipConfig, tooltipId: string): string {
  const fontFamily = cfg.fontFamily === 'inherit' 
    ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    : cfg.fontFamily;
  const scopedCustomCss = scopeTooltipCss(cfg.customCss, tooltipId);
  
  return `
  #${tooltipId} {
    position: fixed;
    z-index: 99999;
    pointer-events: none;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    max-width: ${cfg.maxWidth}px;
    min-width: 200px;
    padding: ${cfg.padding}px;
    border-radius: ${cfg.borderRadius}px;
    background: ${cfg.backgroundColor};
    backdrop-filter: blur(${cfg.backdropBlur}px);
    -webkit-backdrop-filter: blur(${cfg.backdropBlur}px);
    border: 1px solid ${cfg.borderColor};
    box-shadow: 0 8px ${cfg.shadowBlur}px ${cfg.shadowColor};
    font-family: ${fontFamily};
    font-size: ${cfg.fontSize}px;
    color: ${cfg.textColor};
    line-height: 1.5;
  }
  #${tooltipId}.visible {
    opacity: ${cfg.opacity};
    transform: translateY(0);
  }
  #${tooltipId} .tt-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 8px;
    background: ${cfg.headerBackgroundColor};
  }
  #${tooltipId} .tt-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }
  #${tooltipId} .tt-hostname {
    font-weight: 600;
    font-size: ${Math.round(cfg.fontSize * 1.16)}px;
    color: #fff;
    letter-spacing: 0.5px;
  }
  #${tooltipId} .tt-severity {
    margin-left: auto;
    font-size: ${Math.max(9, cfg.fontSize - 2)}px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  #${tooltipId} .tt-time {
    font-size: ${Math.max(9, cfg.fontSize - 2)}px;
    color: #999;
    margin-bottom: 8px;
  }
  #${tooltipId} .tt-metrics {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 4px 12px;
    align-items: center;
  }
  #${tooltipId} .tt-metric-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  #${tooltipId} .tt-metric-label {
    color: #bbb;
    font-size: ${Math.max(9, cfg.fontSize - 1)}px;
  }
  #${tooltipId} .tt-metric-value {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: ${cfg.fontSize}px;
  }
  #${tooltipId} .tt-sparkline-wrap {
    grid-column: 1 / -1;
    margin: 1px 0 2px;
  }
  #${tooltipId} .tt-sparkline {
    width: 100%;
    display: block;
    border-radius: 3px;
    background: rgba(255,255,255,0.04);
  }
  #${tooltipId} .tt-chart-hover-time {
    margin-top: 6px;
    min-height: 14px;
    font-size: ${Math.max(9, cfg.fontSize - 2)}px;
    color: #9ca3af;
    text-align: right;
  }
  #${tooltipId} .tt-bar-container {
    grid-column: 1 / -1;
    height: 3px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    margin: 2px 0;
    overflow: hidden;
  }
  #${tooltipId} .tt-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }
  #${tooltipId} .tt-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  #${tooltipId} .tt-compact-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: ${Math.max(9, cfg.fontSize - 1)}px;
  }
  ${scopedCustomCss}
`;
}

function scopeTooltipCss(css: string, tooltipId: string): string {
  if (typeof css !== 'string' || !css.trim()) {
    return '';
  }
  return css.replace(/:tooltip\b/g, `#${tooltipId}`);
}

let tooltipStyleEl: HTMLStyleElement | null = null;
let lastConfigKey = '';
let tooltipKeyListenersBound = false;
let tooltipAltPressed = false;
let tooltipPinKey: 'alt' | 'shift' | 'ctrl' | 'meta' = 'alt';

function isPinEvent(eventKey: string): boolean {
  const key = (eventKey || '').toLowerCase();
  switch (tooltipPinKey) {
    case 'shift':
      return key === 'shift';
    case 'ctrl':
      return key === 'control' || key === 'ctrl';
    case 'meta':
      return key === 'meta';
    case 'alt':
    default:
      return key === 'alt';
  }
}

function bindTooltipKeyListeners(): void {
  if (tooltipKeyListenersBound || typeof window === 'undefined') return;
  window.addEventListener('keydown', (e) => {
    if (isPinEvent(e.key)) {
      tooltipAltPressed = true;
      updateTooltipInteractivity();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (isPinEvent(e.key)) {
      tooltipAltPressed = false;
      updateTooltipInteractivity();
    }
  });
  window.addEventListener('blur', () => {
    tooltipAltPressed = false;
    updateTooltipInteractivity();
  });
  tooltipKeyListenersBound = true;
}

export function isTooltipPinned(): boolean {
  return tooltipAltPressed;
}

function updateTooltipInteractivity(): void {
  const el = document.getElementById(activeTooltipId) as HTMLDivElement | null;
  if (!el) return;
  el.style.pointerEvents = tooltipAltPressed ? 'auto' : 'none';
}

function bindSparklineInteractions(el: HTMLDivElement): void {
  if ((el as any).__sparklineBound) return;
  (el as any).__sparklineBound = true;

  el.addEventListener('mousemove', (evt) => {
    try {
      const targetNode = evt.target;
      if (!(targetNode instanceof Element)) {
        return;
      }

      const svg = targetNode.closest('.tt-sparkline') as SVGSVGElement | null;
      if (!svg) return;

      const rawPoints = svg.dataset.points;
      if (!rawPoints) return;
      const points = decodeSparklinePoints(rawPoints);
      if (points.length < 2) return;

      const rect = svg.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, evt.clientX - rect.left));
      const idx = Math.round((x / Math.max(1, rect.width)) * (points.length - 1));
      const boundedIdx = Math.max(0, Math.min(points.length - 1, idx));
      const point = points[boundedIdx];
      const hoverTime = el.querySelector('.tt-chart-hover-time') as HTMLDivElement | null;
      if (hoverTime) {
        hoverTime.textContent = `t: ${new Date(point.ts).toLocaleString(navigator.language || 'es-ES')}`;
      }

      const marker = svg.querySelector('.tt-sparkline-marker') as SVGLineElement | null;
      if (marker) {
        const markerX = (boundedIdx / Math.max(1, points.length - 1)) * 100;
        marker.setAttribute('x1', `${markerX}`);
        marker.setAttribute('x2', `${markerX}`);
        marker.style.opacity = '1';
      }
    } catch {
      // Avoid breaking panel render due to tooltip interaction edge cases.
    }
  });

  el.addEventListener('mouseleave', () => {
    try {
      const hoverTime = el.querySelector('.tt-chart-hover-time') as HTMLDivElement | null;
      if (hoverTime) hoverTime.textContent = '';
      el.querySelectorAll('.tt-sparkline-marker').forEach((m) => {
        (m as SVGLineElement).style.opacity = '0';
      });
    } catch {
      // Ignore tooltip cleanup errors to prevent plugin crash banners.
    }
  });
}

function ensureTooltipElement(cfg: TooltipConfig): HTMLDivElement {
  tooltipPinKey = toPinKey((cfg as any).pinKey);
  bindTooltipKeyListeners();
  let el = document.getElementById(activeTooltipId) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = activeTooltipId;
    document.body.appendChild(el);
  }
  // Re-inject styles when config changes
  const key = `${activeTooltipId}_${cfg.maxWidth}_${cfg.fontSize}_${cfg.fontFamily}_${cfg.backgroundColor}_${cfg.textColor}_${cfg.borderColor}_${cfg.borderRadius}_${cfg.padding}_${cfg.opacity}_${cfg.backdropBlur}_${cfg.shadowColor}_${cfg.shadowBlur}_${cfg.headerBackgroundColor}_${cfg.customCss}`;
  if (key !== lastConfigKey) {
    if (tooltipStyleEl) tooltipStyleEl.remove();
    tooltipStyleEl = document.createElement('style');
    tooltipStyleEl.textContent = buildTooltipStyles(cfg, activeTooltipId);
    document.head.appendChild(tooltipStyleEl);
    lastConfigKey = key;
  }
  bindSparklineInteractions(el);
  updateTooltipInteractivity();
  return el;
}

/**
 * Formatea un valor de métrica para mostrar en tooltip.
 */
function formatMetricValue(value: number, unit: string): string {
  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  }
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

/**
 * Genera el HTML para una métrica individual en el tooltip.
 */
function renderMetricRow(
  label: string,
  value: number,
  unit: string,
  color: string,
  cfg: TooltipConfig,
  history?: Array<{ ts: number; value: number }>
): string {
  const formattedVal = formatMetricValue(value, unit);
  const c = sanitizeColor(color);
  const sparkline = cfg.showMiniCharts && history && history.length > 1
    ? renderMiniChart(history, c, cfg)
    : '';
  return `
    <span class="tt-metric-dot" style="background:${c}"></span>
    <span class="tt-metric-label">${escapeHtml(label)}</span>
    <span class="tt-metric-value" style="color:${c}">${formattedVal}</span>
    ${sparkline}
    ${unit === '%' ? `
      <div class="tt-bar-container">
        <div class="tt-bar" style="width:${Math.min(100, value)}%;background:${c}"></div>
      </div>
    ` : ''}
  `;
}

function encodeSparklinePoints(points: Array<{ ts: number; value: number }>): string {
  return points.map((p) => `${p.ts},${p.value}`).join(';');
}

function decodeSparklinePoints(encoded: string): Array<{ ts: number; value: number }> {
  return encoded
    .split(';')
    .map((chunk) => {
      const [tsStr, valStr] = chunk.split(',');
      const ts = Number(tsStr);
      const value = Number(valStr);
      return Number.isFinite(ts) && Number.isFinite(value) ? { ts, value } : null;
    })
    .filter((p): p is { ts: number; value: number } => p !== null);
}

function renderMiniChart(points: Array<{ ts: number; value: number }>, color: string, cfg: TooltipConfig): string {
  const maxPoints = Math.max(8, Math.min(200, cfg.miniChartPoints || 40));
  const sliced = points.length > maxPoints ? points.slice(points.length - maxPoints) : points;
  if (sliced.length < 2) return '';

  const min = Math.min(...sliced.map((p) => p.value));
  const max = Math.max(...sliced.map((p) => p.value));
  const span = Math.max(1e-9, max - min);

  const d = sliced
    .map((p, i) => {
      const x = (i / Math.max(1, sliced.length - 1)) * 100;
      const y = 100 - ((p.value - min) / span) * 100;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const encoded = encodeSparklinePoints(sliced);
  const h = Math.max(16, cfg.miniChartHeight || 26);

  return `
    <div class="tt-sparkline-wrap">
      <svg class="tt-sparkline" data-points="${encoded}" viewBox="0 0 100 100" preserveAspectRatio="none" style="height:${h}px">
        <path d="${d}" fill="none" stroke="${sanitizeColor(color)}" stroke-width="2" vector-effect="non-scaling-stroke"></path>
        <line class="tt-sparkline-marker" x1="0" y1="0" x2="0" y2="100" stroke="rgba(255,255,255,0.7)" stroke-width="1" style="opacity:0"></line>
      </svg>
    </div>
  `;
}

/**
 * Muestra el tooltip para un host (legacy API, used by auto-detection mode).
 */
export function showTooltip(
  host: HostMetrics, x: number, y: number,
  tooltipCfg?: Partial<TooltipConfig>,
  metricsConfig?: Record<string, MetricConfig>
): void {
  const cfg = resolveConfig(tooltipCfg);
  const mCfg = metricsConfig || DEFAULT_METRICAS_CONFIG;
  if (cfg.mode === 'off') return;

  const el = ensureTooltipElement(cfg);
  const color = sanitizeColor(SEVERITY_COLORS[host.severity]);

  let metricsHtml = '';

  const orderedKeys: readonly string[] = METRIC_DISPLAY_ORDER;

  if (cfg.mode === 'compact') {
    // Compact: single-line summary with colored dots
    const items: string[] = [];
    for (const key of orderedKeys) {
      const mv = host.metrics.get(key);
      if (!mv) continue;
      const mColor = sanitizeColor(SEVERITY_COLORS[mv.severity]);
      const val = formatMetricValue(mv.value, mv.unit);
      items.push(`<span class="tt-compact-item"><span class="tt-metric-dot" style="background:${mColor}"></span>${escapeHtml(mv.label)}: ${val}${mv.unit === '%' ? '' : (' ' + mv.unit)}</span>`);
    }
    for (const [key, mv] of host.metrics) {
      if (orderedKeys.includes(key)) continue;
      const mColor = sanitizeColor(SEVERITY_COLORS[mv.severity]);
      const val = formatMetricValue(mv.value, mv.unit);
      items.push(`<span class="tt-compact-item"><span class="tt-metric-dot" style="background:${mColor}"></span>${escapeHtml(mv.label)}: ${val}${mv.unit === '%' ? '' : (' ' + mv.unit)}</span>`);
    }
    metricsHtml = `<div class="tt-compact">${items.join('')}</div>`;
  } else {
    // Detailed: full grid
    for (const key of orderedKeys) {
      const mv = host.metrics.get(key);
      if (!mv) continue;
      const mConfig = mCfg[key];
      if (mConfig?.tipo === 'boolean') {
        const isUp = mv.value > 0;
        const statusText = key === 'ping' ? (isUp ? 'UP' : 'DOWN') : (isUp ? 'RUNNING' : 'STOPPED');
        const statusColor = sanitizeColor(isUp ? COLORES.NORMAL : COLORES.CRITICO);
        metricsHtml += `
          <span class="tt-metric-dot" style="background:${statusColor}"></span>
          <span class="tt-metric-label">${escapeHtml(mv.label)}</span>
          <span class="tt-metric-value" style="color:${statusColor}">${statusText}</span>
        `;
      } else {
        metricsHtml += renderMetricRow(mv.label, mv.value, mv.unit, SEVERITY_COLORS[mv.severity], cfg);
      }
    }
    for (const [key, mv] of host.metrics) {
      if (orderedKeys.includes(key)) continue;
      metricsHtml += renderMetricRow(mv.label, mv.value, mv.unit, SEVERITY_COLORS[mv.severity], cfg);
    }
    if (!metricsHtml) {
      metricsHtml = '<span style="color:#666;grid-column:1/-1;text-align:center;padding:4px 0">Sin datos disponibles</span>';
    }
    metricsHtml = `<div class="tt-metrics">${metricsHtml}</div><div class="tt-chart-hover-time"></div>`;
  }

  const timeHtml = cfg.showTimestamp
    ? `<div class="tt-time">${formatTimestamp()}</div>`
    : '';

  const severityHtml = cfg.showSeverity
    ? `<span class="tt-severity" style="background:${color}22;color:${color}">${host.severity}</span>`
    : '';

  el.innerHTML = renderTooltipMarkup(cfg, {
    hostname: host.hostname,
    severity: host.severity,
    severityColor: color,
    timeHtml,
    metricsHtml,
    defaultHtml: `
    <div class="tt-header">
      <span class="tt-dot" style="background:${color};color:${color}"></span>
      <span class="tt-hostname">${escapeHtml(host.hostname)}</span>
      ${severityHtml}
    </div>
    ${timeHtml}
    ${metricsHtml}
    ${host.isCombined ? '<div style="margin-top:8px;color:#666;font-size:10px;text-align:center">Hosts combinados</div>' : ''}
  `,
  });

  positionTooltip(el, x, y);
}

export function hideTooltip(): void {
  if (tooltipAltPressed) return;
  const el = document.getElementById(activeTooltipId);
  if (el) el.classList.remove('visible');
}

export function destroyTooltip(): void {
  const el = document.getElementById(activeTooltipId);
  if (el) el.remove();
  if (tooltipStyleEl) { tooltipStyleEl.remove(); tooltipStyleEl = null; }
  lastConfigKey = '';
}

// ─── Tooltip personalizado para Cell Mappings ───────────────

export interface TooltipEntry {
  label: string;
  value: number | string;
  unit: string;
  color: string;
  isPercentage: boolean;
  history?: Array<{ ts: number; value: number }>;
  /** When true, this entry is excluded from the cell worst-severity calculation */
  skipCellSeverity?: boolean;
}

export function showCustomTooltip(
  hostname: string,
  severity: Severity,
  entries: TooltipEntry[],
  x: number,
  y: number,
  dataTimestamp?: number | null,
  tooltipCfg?: Partial<TooltipConfig>
): void {
  const cfg = resolveConfig(tooltipCfg);
  if (cfg.mode === 'off') return;

  const el = ensureTooltipElement(cfg);
  const color = sanitizeColor(SEVERITY_COLORS[severity]);

  let metricsHtml = '';

  if (cfg.mode === 'compact') {
    // Compact: single-line summary
    const items: string[] = [];
    for (const entry of entries) {
      const ec = sanitizeColor(entry.color);
      const val = typeof entry.value === 'number' ? formatMetricValue(entry.value, entry.unit) : String(entry.value);
      items.push(`<span class="tt-compact-item"><span class="tt-metric-dot" style="background:${ec}"></span>${escapeHtml(entry.label)}: ${escapeHtml(val)}</span>`);
    }
    metricsHtml = items.length > 0
      ? `<div class="tt-compact">${items.join('')}</div>`
      : '<span style="color:#666;text-align:center;padding:4px 0">Sin datos</span>';
  } else {
    // Detailed: full grid
    for (const entry of entries) {
      const ec = sanitizeColor(entry.color);
      if (entry.isPercentage && typeof entry.value === 'number') {
        metricsHtml += renderMetricRow(entry.label, entry.value, '%', ec, cfg, entry.history);
      } else if (typeof entry.value === 'number') {
        const fmt = Number.isInteger(entry.value) ? entry.value.toString() : entry.value.toFixed(2);
        metricsHtml += `
          <span class="tt-metric-dot" style="background:${ec}"></span>
          <span class="tt-metric-label">${escapeHtml(entry.label)}</span>
          <span class="tt-metric-value" style="color:${ec}">${fmt}${entry.unit ? ' ' + entry.unit : ''}</span>
          ${cfg.showMiniCharts && entry.history && entry.history.length > 1 ? renderMiniChart(entry.history, ec, cfg) : ''}
        `;
      } else {
        metricsHtml += `
          <span class="tt-metric-dot" style="background:${ec}"></span>
          <span class="tt-metric-label">${escapeHtml(entry.label)}</span>
          <span class="tt-metric-value" style="color:${ec}">${escapeHtml(String(entry.value))}</span>
        `;
      }
    }
    if (!metricsHtml) {
      metricsHtml = '<span style="color:#666;grid-column:1/-1;text-align:center;padding:4px 0">Sin datos</span>';
    }
    metricsHtml = `<div class="tt-metrics">${metricsHtml}</div><div class="tt-chart-hover-time"></div>`;
  }

  const timeHtml = cfg.showTimestamp ? `<div class="tt-time">${formatTimestamp(dataTimestamp)}</div>` : '';

  const severityHtml = cfg.showSeverity
    ? `<span class="tt-severity" style="background:${color}22;color:${color}">${severity}</span>`
    : '';

  el.innerHTML = renderTooltipMarkup(cfg, {
    hostname,
    severity,
    severityColor: color,
    timeHtml,
    metricsHtml,
    defaultHtml: `
    <div class="tt-header">
      <span class="tt-dot" style="background:${color};color:${color}"></span>
      <span class="tt-hostname">${escapeHtml(hostname)}</span>
      ${severityHtml}
    </div>
    ${timeHtml}
    ${metricsHtml}
  `,
  });

  positionTooltip(el, x, y);
}

// ─── Shared positioning logic ───────────────────────────────

function positionTooltip(el: HTMLDivElement, x: number, y: number): void {
  if (tooltipAltPressed && el.classList.contains('visible')) {
    return;
  }
  const pad = 16;
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > vw - pad) left = x - rect.width - pad;
    if (top + rect.height > vh - pad) top = y - rect.height - pad;
    // Ensure tooltip never goes off-screen
    left = Math.max(pad, Math.min(left, vw - rect.width - pad));
    top = Math.max(pad, Math.min(top, vh - rect.height - pad));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.add('visible');
  });
}

function renderTooltipMarkup(
  cfg: TooltipConfig,
  data: {
    hostname: string;
    severity: Severity;
    severityColor: string;
    timeHtml: string;
    metricsHtml: string;
    defaultHtml: string;
  }
): string {
  const template = typeof cfg.htmlTemplate === 'string' ? cfg.htmlTemplate.trim() : '';
  if (!template) {
    return data.defaultHtml;
  }

  const raw = template
    .replace(/\{\{hostname\}\}/g, escapeHtml(data.hostname))
    .replace(/\{\{severity\}\}/g, escapeHtml(data.severity))
    .replace(/\{\{severityColor\}\}/g, sanitizeColor(data.severityColor))
    .replace(/\{\{time\}\}/g, data.timeHtml)
    .replace(/\{\{metricsHtml\}\}/g, data.metricsHtml);

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['div', 'span', 'strong', 'em', 'b', 'i', 'small', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
  });
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

/** S1: Sanitize CSS color values to prevent XSS via style injection */
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.,\s%]+\)|transparent|currentColor|inherit)$/;
function sanitizeColor(color: string): string {
  return SAFE_COLOR_RE.test(color) ? color : '#90a4ae';
}

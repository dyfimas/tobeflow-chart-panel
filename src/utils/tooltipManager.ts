// ─────────────────────────────────────────────────────────────
// tooltipManager.ts – Tooltip estilo producción (dark glass)
// Replica el TooltipManager del script jsATC_optimizado
// Configurable via TooltipConfig
// ─────────────────────────────────────────────────────────────
import { HostMetrics, Severity, SEVERITY_COLORS, COLORES, DEFAULT_METRICAS_CONFIG, MetricConfig, TooltipConfig, METRIC_DISPLAY_ORDER } from '../types';

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
  showSeverity: true,
  showTimestamp: true,
};

/** Merge partial user config with defaults */
function resolveConfig(cfg?: Partial<TooltipConfig>): TooltipConfig {
  if (!cfg) return DEFAULT_TOOLTIP_CONFIG;
  return { ...DEFAULT_TOOLTIP_CONFIG, ...cfg };
}

function buildTooltipStyles(cfg: TooltipConfig, tooltipId: string): string {
  const fontFamily = cfg.fontFamily === 'inherit' 
    ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    : cfg.fontFamily;
  
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
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid ${cfg.borderColor};
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
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
`;
}

let tooltipStyleEl: HTMLStyleElement | null = null;
let lastConfigKey = '';

function ensureTooltipElement(cfg: TooltipConfig): HTMLDivElement {
  let el = document.getElementById(activeTooltipId) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = activeTooltipId;
    document.body.appendChild(el);
  }
  // Re-inject styles when config changes
  const key = `${activeTooltipId}_${cfg.maxWidth}_${cfg.fontSize}_${cfg.fontFamily}_${cfg.backgroundColor}_${cfg.textColor}_${cfg.borderColor}_${cfg.borderRadius}_${cfg.padding}_${cfg.opacity}`;
  if (key !== lastConfigKey) {
    if (tooltipStyleEl) tooltipStyleEl.remove();
    tooltipStyleEl = document.createElement('style');
    tooltipStyleEl.textContent = buildTooltipStyles(cfg, activeTooltipId);
    document.head.appendChild(tooltipStyleEl);
    lastConfigKey = key;
  }
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
function renderMetricRow(label: string, value: number, unit: string, color: string): string {
  const formattedVal = formatMetricValue(value, unit);
  const c = sanitizeColor(color);
  return `
    <span class="tt-metric-dot" style="background:${c}"></span>
    <span class="tt-metric-label">${escapeHtml(label)}</span>
    <span class="tt-metric-value" style="color:${c}">${formattedVal}</span>
    ${unit === '%' ? `
      <div class="tt-bar-container">
        <div class="tt-bar" style="width:${Math.min(100, value)}%;background:${c}"></div>
      </div>
    ` : ''}
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
        metricsHtml += renderMetricRow(mv.label, mv.value, mv.unit, SEVERITY_COLORS[mv.severity]);
      }
    }
    for (const [key, mv] of host.metrics) {
      if (orderedKeys.includes(key)) continue;
      metricsHtml += renderMetricRow(mv.label, mv.value, mv.unit, SEVERITY_COLORS[mv.severity]);
    }
    if (!metricsHtml) {
      metricsHtml = '<span style="color:#666;grid-column:1/-1;text-align:center;padding:4px 0">Sin datos disponibles</span>';
    }
    metricsHtml = `<div class="tt-metrics">${metricsHtml}</div>`;
  }

  const timeHtml = cfg.showTimestamp
    ? `<div class="tt-time">${new Date().toLocaleTimeString(navigator.language || 'es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>`
    : '';

  const severityHtml = cfg.showSeverity
    ? `<span class="tt-severity" style="background:${color}22;color:${color}">${host.severity}</span>`
    : '';

  el.innerHTML = `
    <div class="tt-header">
      <span class="tt-dot" style="background:${color};color:${color}"></span>
      <span class="tt-hostname">${escapeHtml(host.hostname)}</span>
      ${severityHtml}
    </div>
    ${timeHtml}
    ${metricsHtml}
    ${host.isCombined ? '<div style="margin-top:8px;color:#666;font-size:10px;text-align:center">Hosts combinados</div>' : ''}
  `;

  positionTooltip(el, x, y);
}

export function hideTooltip(): void {
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
        metricsHtml += renderMetricRow(entry.label, entry.value, '%', ec);
      } else if (typeof entry.value === 'number') {
        const fmt = Number.isInteger(entry.value) ? entry.value.toString() : entry.value.toFixed(2);
        metricsHtml += `
          <span class="tt-metric-dot" style="background:${ec}"></span>
          <span class="tt-metric-label">${escapeHtml(entry.label)}</span>
          <span class="tt-metric-value" style="color:${ec}">${fmt}${entry.unit ? ' ' + entry.unit : ''}</span>
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
    metricsHtml = `<div class="tt-metrics">${metricsHtml}</div>`;
  }

  const locale = navigator.language || 'es-ES';
  const now = dataTimestamp
    ? new Date(dataTimestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const timeHtml = cfg.showTimestamp ? `<div class="tt-time">${now}</div>` : '';

  const severityHtml = cfg.showSeverity
    ? `<span class="tt-severity" style="background:${color}22;color:${color}">${severity}</span>`
    : '';

  el.innerHTML = `
    <div class="tt-header">
      <span class="tt-dot" style="background:${color};color:${color}"></span>
      <span class="tt-hostname">${escapeHtml(hostname)}</span>
      ${severityHtml}
    </div>
    ${timeHtml}
    ${metricsHtml}
  `;

  positionTooltip(el, x, y);
}

// ─── Shared positioning logic ───────────────────────────────

function positionTooltip(el: HTMLDivElement, x: number, y: number): void {
  const pad = 16;
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > window.innerWidth - pad) left = x - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = y - rect.height - pad;
    el.style.left = `${Math.max(pad, left)}px`;
    el.style.top = `${Math.max(pad, top)}px`;
    el.classList.add('visible');
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

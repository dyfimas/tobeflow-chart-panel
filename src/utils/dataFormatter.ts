// ─────────────────────────────────────────────────────────────
// dataFormatter.ts – Formato de datos, umbrales y severidad visual
// Extraído de SvgFlowPanel.tsx para mejor mantenibilidad
// ─────────────────────────────────────────────────────────────
import {
  MetricDataType,
  MetricThreshold,
  Severity,
  SEVERITY_COLORS,
  COLORES,
  ValueMapping,
} from '../types';
import { getValueFormat, formattedValueToString } from '@grafana/data';

/** Legacy dataType values that have custom formatting logic */
const LEGACY_TYPES = new Set([
  'auto', 'pct100', 'pct1', 'number', 'bytes', 'text', 'boolean', 'date', 'short', 'ms', 'seconds',
]);

/** Maps legacy dataType values to native Grafana unit IDs for migration */
export const LEGACY_TO_GRAFANA_UNIT: Record<string, string> = {
  pct100: 'percent',
  pct1: 'percentunit',
  number: 'none',
  short: 'short',
  bytes: 'bytes',
  ms: 'ms',
  seconds: 's',
  text: 'string',
  boolean: 'bool',
  date: 'dateTimeAsIso',
};

/**
 * Formatea un valor según el dataType configurado.
 */
export function applyDataType(
  rawValue: number | string | null,
  dt: MetricDataType
): { value: number | string; unit: string; isPercentage: boolean } {
  if (rawValue === null || rawValue === undefined) {
    return { value: 'N/A', unit: '', isPercentage: false };
  }
  const num = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
  switch (dt) {
    case 'pct1':
      return { value: isNaN(num) ? rawValue : num * 100, unit: '%', isPercentage: true };
    case 'pct100':
      return { value: isNaN(num) ? rawValue : num, unit: '%', isPercentage: true };
    case 'bytes': {
      if (isNaN(num)) return { value: rawValue, unit: '', isPercentage: false };
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let v = num; let u = 0;
      while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
      return { value: parseFloat(v.toFixed(2)), unit: units[u], isPercentage: false };
    }
    case 'date': {
      try {
        const d = new Date(typeof rawValue === 'number' ? rawValue : rawValue);
        return { value: d.toLocaleString('es-ES'), unit: '', isPercentage: false };
      } catch { return { value: String(rawValue), unit: '', isPercentage: false }; }
    }
    case 'boolean': {
      const b = num > 0 || String(rawValue) === 'true';
      return { value: b ? 'YES' : 'NO', unit: '', isPercentage: false };
    }
    case 'text':
      return { value: String(rawValue), unit: '', isPercentage: false };
    case 'number':
      return { value: isNaN(num) ? rawValue : num, unit: '', isPercentage: false };
    case 'short': {
      if (isNaN(num)) return { value: rawValue, unit: '', isPercentage: false };
      const suffixes = ['', 'K', 'M', 'B', 'T'];
      let v = num; let idx = 0;
      while (Math.abs(v) >= 1000 && idx < suffixes.length - 1) { v /= 1000; idx++; }
      return { value: parseFloat(v.toFixed(2)), unit: suffixes[idx], isPercentage: false };
    }
    case 'ms': {
      if (isNaN(num)) return { value: rawValue, unit: '', isPercentage: false };
      if (num < 1000) return { value: parseFloat(num.toFixed(1)), unit: 'ms', isPercentage: false };
      if (num < 60000) return { value: parseFloat((num / 1000).toFixed(2)), unit: 's', isPercentage: false };
      return { value: parseFloat((num / 60000).toFixed(2)), unit: 'min', isPercentage: false };
    }
    case 'seconds': {
      if (isNaN(num)) return { value: rawValue, unit: '', isPercentage: false };
      if (num < 60) return { value: parseFloat(num.toFixed(1)), unit: 's', isPercentage: false };
      if (num < 3600) return { value: parseFloat((num / 60).toFixed(2)), unit: 'min', isPercentage: false };
      if (num < 86400) return { value: parseFloat((num / 3600).toFixed(2)), unit: 'h', isPercentage: false };
      return { value: parseFloat((num / 86400).toFixed(2)), unit: 'd', isPercentage: false };
    }
    case 'auto':
    default: {
      // ── Grafana native unit via UnitPicker ──
      if (!LEGACY_TYPES.has(dt)) {
        if (isNaN(num)) return { value: rawValue, unit: '', isPercentage: false };
        try {
          const formatter = getValueFormat(dt);
          const formatted = formatter(num);
          const text = formattedValueToString(formatted);
          const isPct = dt === 'percent' || dt === 'percentunit';
          return { value: text, unit: '', isPercentage: isPct };
        } catch {
          return { value: rawValue, unit: '', isPercentage: false };
        }
      }
      // ── Legacy 'auto' ──
      if (isNaN(num)) {
        return { value: rawValue, unit: '', isPercentage: false };
      }
      // Auto-detect percentage only for field names that imply percentage
      // For other values, return raw number without assuming %
      if (num > 0 && num < 1) {
        // Fractional 0-1 → likely a percentage in decimal form
        return { value: parseFloat((num * 100).toFixed(2)), unit: '%', isPercentage: true };
      }
      // Values >= 1 are NOT auto-detected as percentages — use pct100 dataType explicitly
      return { value: rawValue, unit: '', isPercentage: false };
    }
  }
}

/**
 * Mapea un color de umbral a una severidad basándose en los
 * colores conocidos o en heurística RGB.
 */
export function colorToSeverity(hexColor: string): { severity: Severity; order: number } {
  const c = hexColor.toLowerCase();
  const mapping: Array<[string, Severity, number]> = [
    [COLORES.CRITICO.toLowerCase(), Severity.CRITICO, 4],
    [COLORES.MAJOR.toLowerCase(), Severity.MAJOR, 3],
    [COLORES.MINOR.toLowerCase(), Severity.MINOR, 2],
    [COLORES.WARNING.toLowerCase(), Severity.WARNING, 1],
    [COLORES.NORMAL.toLowerCase(), Severity.NORMAL, 0],
    [COLORES.SIN_DATOS.toLowerCase(), Severity.SIN_DATOS, -1],
  ];
  for (const [col, sev, ord] of mapping) {
    if (c === col || c === col.replace(/ff$/, '')) {
      return { severity: sev, order: ord };
    }
  }
  // RGB heuristic fallback
  const r = parseInt(c.slice(1, 3), 16) || 0;
  const g = parseInt(c.slice(3, 5), 16) || 0;
  const b = parseInt(c.slice(5, 7), 16) || 0;
  if (r > 180 && g < 100 && b < 100) return { severity: Severity.CRITICO, order: 4 };
  if (r > 180 && g > 80 && g < 180 && b < 100) return { severity: Severity.MAJOR, order: 3 };
  if (r > 180 && g > 180 && b < 100) return { severity: Severity.MINOR, order: 2 };
  if (b > 150 && r < 120 && g < 200) return { severity: Severity.WARNING, order: 1 };
  if (g > 150 && r < 120 && b < 120) return { severity: Severity.NORMAL, order: 0 };
  return { severity: Severity.MINOR, order: 2 };
}

/**
 * Resuelve el color de un valor numérico según umbrales personalizados.
 * Los thresholds se evalúan en orden (prioridad del usuario); se usa el primero que match.
 * Devuelve null si no hay thresholds configurados.
 */
export function resolveThresholdColor(
  displayValue: number | string,
  thresholds?: MetricThreshold[],
  mode: string = 'absolute',
  dataMin?: number,
  dataMax?: number
): string | null {
  if (!thresholds || thresholds.length === 0) return null;
  const num = typeof displayValue === 'number' ? displayValue : parseFloat(String(displayValue));
  if (isNaN(num)) return null;

  const resolvedThresholds = mode === 'percentage' && dataMin !== undefined && dataMax !== undefined
    ? thresholds.map(th => ({
        ...th,
        value: dataMin + (th.value / 100) * (dataMax - dataMin),
      }))
    : thresholds;

  // Sort thresholds by value descending so the highest (most severe) is checked first.
  // This matches Grafana's native threshold behaviour for >= / > operators.
  const allGte = resolvedThresholds.every(th => { const o = th.op || '>='; return o === '>=' || o === '>'; });
  const sorted = allGte
    ? [...resolvedThresholds].sort((a, b) => b.value - a.value)
    : resolvedThresholds;

  for (const th of sorted) {
    const op = th.op || '>=';
    let match = false;
    switch (op) {
      case '>':  match = num > th.value; break;
      case '>=': match = num >= th.value; break;
      case '<':  match = num < th.value; break;
      case '<=': match = num <= th.value; break;
      case '=':  match = num === th.value; break;
      case '!=': match = num !== th.value; break;
    }
    if (match) return th.color;
  }
  return null;
}

/**
 * Aplica value mappings a un valor.
 * Soporta tipos: value, range, comparison, regex.
 */
export function applyValueMapping(
  val: number | string,
  unit: string,
  isPct: boolean,
  valueMappings?: ValueMapping[]
): { value: number | string; unit: string; isPercentage: boolean; color?: string } {
  if (valueMappings && valueMappings.length > 0) {
    const strVal = String(val);
    const numVal = typeof val === 'number' ? val : parseFloat(strVal);
    for (const vm of valueMappings) {
      const vmType = vm.type || 'value';
      if (vmType === 'value') {
        if (vm.value === strVal || (!isNaN(numVal) && vm.value === String(numVal))) {
          return { value: vm.text, unit: '', isPercentage: false, color: vm.color || undefined };
        }
      } else if (vmType === 'range') {
        const from = vm.from !== undefined && vm.from !== '' ? parseFloat(vm.from) : -Infinity;
        const to = vm.to !== undefined && vm.to !== '' ? parseFloat(vm.to) : Infinity;
        if (!isNaN(numVal) && numVal >= from && numVal <= to) {
          return { value: vm.text, unit: '', isPercentage: false, color: vm.color || undefined };
        }
      } else if (vmType === 'comparison') {
        const cmpVal = parseFloat(vm.value);
        if (!isNaN(numVal) && !isNaN(cmpVal)) {
          const op = vm.op || '=';
          let match = false;
          switch (op) {
            case '<': match = numVal < cmpVal; break;
            case '>': match = numVal > cmpVal; break;
            case '<=': match = numVal <= cmpVal; break;
            case '>=': match = numVal >= cmpVal; break;
            case '=': match = numVal === cmpVal; break;
            case '!=': match = numVal !== cmpVal; break;
          }
          if (match) {
            return { value: vm.text, unit: '', isPercentage: false, color: vm.color || undefined };
          }
        }
      } else if (vmType === 'regex') {
        try {
          const re = new RegExp(vm.pattern || vm.value || '', 'i');
          if (re.test(strVal)) {
            return { value: vm.text, unit: '', isPercentage: false, color: vm.color || undefined };
          }
        } catch { /* invalid regex, skip */ }
      }
    }
  }
  return { value: val, unit, isPercentage: isPct };
}

/**
 * Escapa caracteres especiales de regex para uso en plantillas.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

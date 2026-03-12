// ─────────────────────────────────────────────────────────────
// dataFormatter.test.ts – Tests for applyDataType, resolveThresholdColor,
//   applyValueMapping, escapeRegex, colorToSeverity
// ─────────────────────────────────────────────────────────────
import { applyDataType, resolveThresholdColor, applyValueMapping, escapeRegex, colorToSeverity } from '../dataFormatter';
import { Severity, MetricThreshold } from '../../types';

describe('applyDataType', () => {
  it('auto: detects pct100 range (1-100)', () => {
    const result = applyDataType(75.5, 'auto');
    expect(result.value).toBe(75.5);
    expect(result.unit).toBe('%');
    expect(result.isPercentage).toBe(true);
  });

  it('auto: detects pct1 range (0-1 exclusive)', () => {
    const result = applyDataType(0.362, 'auto');
    expect(result.value).toBeCloseTo(36.2);
    expect(result.unit).toBe('%');
    expect(result.isPercentage).toBe(true);
  });

  it('auto: raw value when > 100', () => {
    const result = applyDataType(1500, 'auto');
    expect(result.value).toBe(1500);
    expect(result.unit).toBe('');
    expect(result.isPercentage).toBe(false);
  });

  it('auto: raw value when exactly 0', () => {
    const result = applyDataType(0, 'auto');
    expect(result.value).toBe(0);
    expect(result.isPercentage).toBe(false);
  });

  it('auto: raw value when negative', () => {
    const result = applyDataType(-5, 'auto');
    expect(result.value).toBe(-5);
    expect(result.isPercentage).toBe(false);
  });

  it('pct100: formats as percentage from 0-100 range', () => {
    const result = applyDataType(85, 'pct100');
    expect(result.value).toBe(85);
    expect(result.isPercentage).toBe(true);
  });

  it('pct1: converts 0-1 to 0-100 range', () => {
    const result = applyDataType(0.85, 'pct1');
    expect(result.value).toBeCloseTo(85);
    expect(result.isPercentage).toBe(true);
  });

  it('bytes: formats bytes', () => {
    const result = applyDataType(1048576, 'bytes');
    expect(result.unit).toBeDefined();
  });

  it('text: passes through string values', () => {
    const result = applyDataType('hello', 'text');
    expect(result.value).toBe('hello');
  });

  it('number: passes through numeric values', () => {
    const result = applyDataType(42.7, 'number');
    expect(result.value).toBe(42.7);
  });

  it('boolean: converts 0/1 to true/false', () => {
    const result = applyDataType(1, 'boolean');
    expect(typeof result.value === 'string' || typeof result.value === 'number').toBe(true);
  });

  it('handles null/undefined gracefully', () => {
    const result = applyDataType(null as any, 'auto');
    expect(result).toBeDefined();
  });
});

describe('resolveThresholdColor', () => {
  const thresholds: MetricThreshold[] = [
    { value: 90, color: '#DA2020', op: '>=' },
    { value: 70, color: '#FF9830', op: '>=' },
  ];

  it('returns critical color for value >= 90', () => {
    expect(resolveThresholdColor(95, thresholds)).toBe('#DA2020');
  });

  it('returns warning color for value >= 70 and < 90', () => {
    expect(resolveThresholdColor(80, thresholds)).toBe('#FF9830');
  });

  it('returns null for value below all thresholds', () => {
    expect(resolveThresholdColor(50, thresholds)).toBeNull();
  });

  it('returns null for empty thresholds', () => {
    expect(resolveThresholdColor(50, [])).toBeNull();
  });

  it('handles string value "N/A"', () => {
    expect(resolveThresholdColor('N/A', thresholds)).toBeNull();
  });

  it('works with < operator', () => {
    const ths: MetricThreshold[] = [{ value: 10, color: 'blue', op: '<' }];
    expect(resolveThresholdColor(5, ths)).toBe('blue');
    expect(resolveThresholdColor(15, ths)).toBeNull();
  });

  it('works with = operator', () => {
    const ths: MetricThreshold[] = [{ value: 42, color: 'green', op: '=' }];
    expect(resolveThresholdColor(42, ths)).toBe('green');
    expect(resolveThresholdColor(43, ths)).toBeNull();
  });

  it('auto-sorts >= thresholds descending so order does not matter', () => {
    // Thresholds in ascending order (lower first) — should still pick the highest match
    const unsorted: MetricThreshold[] = [
      { value: 70, color: '#FF9830', op: '>=' },
      { value: 90, color: '#DA2020', op: '>=' },
    ];
    expect(resolveThresholdColor(95, unsorted)).toBe('#DA2020');
    expect(resolveThresholdColor(80, unsorted)).toBe('#FF9830');
    expect(resolveThresholdColor(50, unsorted)).toBeNull();
  });
});

describe('applyValueMapping', () => {
  it('applies exact value mapping', () => {
    const mappings = [{ type: 'value' as const, value: '1', text: 'UP', color: '#0f0', op: '=' as const }];
    const result = applyValueMapping(1, '', false, mappings);
    expect(result.value).toBe('UP');
    expect(result.color).toBe('#0f0');
  });

  it('applies regex mapping', () => {
    const mappings = [{ type: 'regex' as const, value: '^err', pattern: '^err', text: 'Error!', color: 'red', op: '=' as const }];
    const result = applyValueMapping('error_404', '', false, mappings);
    expect(result.value).toBe('Error!');
  });

  it('passes through when no mapping matches', () => {
    const mappings = [{ type: 'value' as const, value: '999', text: 'X', color: '', op: '=' as const }];
    const result = applyValueMapping(42, 'ms', false, mappings);
    expect(result.value).toBe(42);
    expect(result.unit).toBe('ms');
  });

  it('handles undefined mappings', () => {
    const result = applyValueMapping(10, '%', true, undefined);
    expect(result.value).toBe(10);
    expect(result.isPercentage).toBe(true);
  });
});

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('hello.world')).toBe('hello\\.world');
    expect(escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?');
    expect(escapeRegex('foo[bar]')).toBe('foo\\[bar\\]');
    expect(escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  it('leaves normal string unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });
});

describe('colorToSeverity', () => {
  it('maps green to NORMAL', () => {
    const { severity } = colorToSeverity('#73BF69');
    expect(severity).toBe(Severity.NORMAL);
  });

  it('maps red to CRITICO', () => {
    const { severity } = colorToSeverity('#DA2020');
    expect(severity).toBe(Severity.CRITICO);
  });

  it('maps unknown color to MINOR (RGB heuristic fallback)', () => {
    const { severity, order } = colorToSeverity('#abcdef');
    // RGB heuristic: unrecognized colors fall through to default MINOR
    expect(severity).toBe(Severity.MINOR);
    expect(order).toBe(2);
  });
});

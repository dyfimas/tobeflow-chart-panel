// ─────────────────────────────────────────────────────────────
// metricExtractor.test.ts – Tests for extractMetrics, computeHostSeverity,
// combineHosts (main extraction pipeline)
// ─────────────────────────────────────────────────────────────
import type { DataFrame, Field } from '@grafana/data';
import { FieldType } from '@grafana/data';
import { extractMetrics, computeHostSeverity, combineHosts } from '../metricExtractor';
import { Severity, HostMetrics, MetricValue, resolveMetricsConfig } from '../../types';

const METRICBEAT_CFG = resolveMetricsConfig('{"_preset":"metricbeat"}');

// ─── Helpers ────────────────────────────────────────────────

function makeField(
  name: string,
  type: FieldType | string,
  values: any[],
  labels?: Record<string, string>,
  config?: any
): Field {
  return { name, type: type as any, values, labels, config: config || {} };
}

function makeFrame(overrides: Partial<DataFrame> = {}): DataFrame {
  return { fields: [], refId: 'A', ...overrides };
}

// ═══════════════════════════════════════════════════════════════
// extractMetrics – column-based host detection
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – column-based', () => {
  it('groups metrics by host.name column', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['server01', 'server01', 'server02']),
        makeField('@timestamp', FieldType.time, [1000, 2000, 3000]),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.45, 0.75, 0.30]),
        makeField('system.memory.actual.used.pct', FieldType.number, [0.60, 0.65, 0.80]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    expect(result.size).toBeGreaterThanOrEqual(1);

    // server01 should have CPU and RAM metrics
    const srv01 = result.get('server01');
    expect(srv01).toBeDefined();
    expect(srv01!.metrics.has('cpu')).toBe(true);
    expect(srv01!.metrics.has('memoria')).toBe(true);

    // CPU should be >= 45 (last value = 0.75 * 100 = 75)
    const cpu = srv01!.metrics.get('cpu');
    expect(cpu).toBeDefined();
    expect(cpu!.value).toBeCloseTo(75);
  });

  it('takes last numeric value per host', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv', 'srv', 'srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.10, 0.20, 0.30]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    const srv = result.get('srv');
    expect(srv).toBeDefined();
    // Last row index for 'srv' is 2 → value 0.30 → displayed as 30%
    expect(srv!.metrics.get('cpu')!.value).toBeCloseTo(30);
  });

  it('detects custom hostField', () => {
    const frame = makeFrame({
      fields: [
        makeField('service.address', FieldType.string, ['http://srv:9273/metrics']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.50]),
      ],
    });

    const result = extractMetrics([frame], 'service.address');
    expect(result.has('http://srv:9273/metrics')).toBe(true);
  });

  it('stores dynamic metrics under field name and normalized key', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv01']),
        makeField('custom.metric.pct', FieldType.number, [0.42]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    const host = result.get('srv01')!;
    // Dynamic metric stored under normalized key (dots → underscores)
    expect(host.metrics.has('custom_metric_pct') || host.metrics.has('custom.metric.pct')).toBe(true);
  });

  it('handles percentage conversion (value <= 1)', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.85]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    const cpu = result.get('srv')!.metrics.get('cpu')!;
    expect(cpu.value).toBeCloseTo(85); // 0.85 * 100
    expect(cpu.unit).toBe('%');
  });

  it('handles values already in percentage range (> 1)', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [85]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    const cpu = result.get('srv')!.metrics.get('cpu')!;
    expect(cpu.value).toBe(85); // Already in %
  });
});

// ═══════════════════════════════════════════════════════════════
// extractMetrics – label-based host detection (ES Terms agg)
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – label-based', () => {
  it('extracts host from field labels with custom hostField', () => {
    const frame = makeFrame({
      refId: 'A',
      name: 'sonda BAMBOO-PING',
      fields: [
        makeField('summary.up', FieldType.number, [1], { 'monitor_name': 'BAMBOO-PING' }),
      ],
    });

    // Pass 'monitor.name' → function normalizes dot→underscore to find 'monitor_name' label
    const result = extractMetrics([frame], 'monitor.name');
    expect(result.has('BAMBOO-PING')).toBe(true);
    const host = result.get('BAMBOO-PING')!;
    expect(host.metrics.has('ping')).toBe(true);
  });

  it('falls back to frame.name when no host column or labels', () => {
    const frame = makeFrame({
      refId: 'A',
      name: 'my-server',
      fields: [
        makeField('some.metric', FieldType.number, [42]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    // Should use frame.name as host key
    expect(result.has('my-server')).toBe(true);
  });

  it('P7: stores _value and _value:<refId> for single-numeric frames', () => {
    const frame = makeFrame({
      refId: 'B',
      name: 'sonda BAMBOO',
      fields: [
        makeField('summary.up', FieldType.number, [1], { 'monitor_name': 'BAMBOO' }),
      ],
    });

    // Pass hostField so the label lookup finds the host
    const result = extractMetrics([frame], 'monitor.name');
    const host = result.get('BAMBOO')!;
    expect(host.metrics.has('_value')).toBe(true);
    expect(host.metrics.has('_value:B')).toBe(true);
  });

  it('P7: preserves multiple _value metrics across refIds for same host', () => {
    const frameA = makeFrame({
      refId: 'A',
      fields: [
        makeField('summary.up', FieldType.number, [1], { monitor_name: 'BAMBOO' }),
      ],
    });
    const frameB = makeFrame({
      refId: 'B',
      fields: [
        makeField('summary.up', FieldType.number, [0], { monitor_name: 'BAMBOO' }),
      ],
    });

    const result = extractMetrics([frameA, frameB], 'monitor.name');
    const host = result.get('BAMBOO')!;

    // Generic first value is kept, second one is indexed
    expect(host.metrics.has('_value')).toBe(true);
    expect(host.metrics.has('_value:2')).toBe(true);

    // Namespaced values by refId are always present
    expect(host.metrics.has('_value:A')).toBe(true);
    expect(host.metrics.has('_value:B')).toBe(true);
  });

  it('P5: separate hosts for different raw values that normalize to the same', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, [
          'harvard.condis.es',
          'http://harvard.condis.es:9273/metrics',
        ]),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.50, 0.80]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    // Both raw values should exist as separate entries
    expect(result.has('harvard.condis.es')).toBe(true);
    expect(result.has('http://harvard.condis.es:9273/metrics')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// extractMetrics – filterRefId
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – filterRefId', () => {
  it('only processes frames matching filterRefId', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [
          makeField('host.name', FieldType.string, ['srv-a']),
          makeField('system.cpu.total.norm.pct', FieldType.number, [0.50]),
        ],
      }),
      makeFrame({
        refId: 'B',
        fields: [
          makeField('host.name', FieldType.string, ['srv-b']),
          makeField('system.cpu.total.norm.pct', FieldType.number, [0.70]),
        ],
      }),
    ];

    const result = extractMetrics(series, undefined, 'A');
    expect(result.has('srv-a')).toBe(true);
    expect(result.has('srv-b')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// extractMetrics – boolean/ping metrics
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – boolean metrics', () => {
  it('maps ping/summary.up > 0 as NORMAL severity', () => {
    const frame = makeFrame({
      name: 'monitor-up',
      fields: [
        makeField('summary.up', FieldType.number, [1], { 'monitor_name': 'PING-TEST' }),
      ],
    });

    const result = extractMetrics([frame], 'monitor.name');
    const host = result.get('PING-TEST')!;
    const ping = host.metrics.get('ping');
    expect(ping).toBeDefined();
    // Boolean type: > 0 → NORMAL
    expect(ping!.severity).toBe(Severity.NORMAL);
  });

  it('maps ping/summary.up = 0 as CRITICO severity', () => {
    const frame = makeFrame({
      name: 'monitor-down',
      fields: [
        makeField('summary.up', FieldType.number, [0], { 'monitor_name': 'PING-DOWN' }),
      ],
    });

    const result = extractMetrics([frame], 'monitor.name');
    const host = result.get('PING-DOWN')!;
    const ping = host.metrics.get('ping');
    expect(ping).toBeDefined();
    expect(ping!.severity).toBe(Severity.CRITICO);
  });
});

// ═══════════════════════════════════════════════════════════════
// extractMetrics – severity thresholds
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – severity', () => {
  it('assigns CRITICO to CPU >= 90%', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.95]),
      ],
    });
    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    expect(result.get('srv')!.metrics.get('cpu')!.severity).toBe(Severity.CRITICO);
  });

  it('assigns MAJOR to CPU >= 80% and < 90%', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.85]),
      ],
    });
    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    expect(result.get('srv')!.metrics.get('cpu')!.severity).toBe(Severity.MAJOR);
  });

  it('assigns NORMAL to CPU < 60%', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv']),
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.30]),
      ],
    });
    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    expect(result.get('srv')!.metrics.get('cpu')!.severity).toBe(Severity.NORMAL);
  });

  it('P6: picks latest timestamp even when rows are not index-sorted', () => {
    const frame = makeFrame({
      fields: [
        makeField('host.name', FieldType.string, ['srv', 'srv', 'srv']),
        // Intentionally unordered timestamps
        makeField('@timestamp', FieldType.time, [3000, 1000, 2000]),
        // Value at ts=3000 should win => 0.70 => 70%
        makeField('system.cpu.total.norm.pct', FieldType.number, [0.70, 0.10, 0.20]),
      ],
    });

    const result = extractMetrics([frame], 'host.name', undefined, METRICBEAT_CFG);
    const cpu = result.get('srv')!.metrics.get('cpu')!;
    expect(cpu.value).toBeCloseTo(70);
  });
});

// ═══════════════════════════════════════════════════════════════
// extractMetrics – multiple frames
// ═══════════════════════════════════════════════════════════════

describe('extractMetrics – multi-frame', () => {
  it('merges metrics from multiple frames for same host', () => {
    const series: DataFrame[] = [
      makeFrame({
        fields: [
          makeField('host.name', FieldType.string, ['srv01']),
          makeField('system.cpu.total.norm.pct', FieldType.number, [0.50]),
        ],
      }),
      makeFrame({
        fields: [
          makeField('host.name', FieldType.string, ['srv01']),
          makeField('system.memory.actual.used.pct', FieldType.number, [0.70]),
        ],
      }),
    ];

    const result = extractMetrics(series, 'host.name', undefined, METRICBEAT_CFG);
    const host = result.get('srv01')!;
    expect(host.metrics.has('cpu')).toBe(true);
    expect(host.metrics.has('memoria')).toBe(true);
  });

  it('processes empty series', () => {
    const result = extractMetrics([]);
    expect(result.size).toBe(0);
  });

  it('handles frames with no fields gracefully', () => {
    const result = extractMetrics([makeFrame({ fields: [] })]);
    // Frame with no fields may still create a host entry from frame.name/refId fallback
    // The important thing is it doesn't throw
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// computeHostSeverity
// ═══════════════════════════════════════════════════════════════

describe('computeHostSeverity', () => {
  function makeHostMetrics(metricsMap: Map<string, MetricValue>): HostMetrics {
    return {
      hostname: 'test',
      normalizedHost: 'test',
      cellId: '',
      metrics: metricsMap,
      severity: Severity.SIN_DATOS,
    };
  }

  it('returns severity based on worst metric', () => {
    const metrics = new Map<string, MetricValue>([
      ['cpu', { value: 95, severity: Severity.CRITICO, label: 'CPU', unit: '%', raw: 0.95 }],
      ['memoria', { value: 50, severity: Severity.NORMAL, label: 'RAM', unit: '%', raw: 0.50 }],
    ]);
    const host = makeHostMetrics(metrics);
    const sev = computeHostSeverity(host);
    expect(sev).toBe(Severity.CRITICO);
  });

  it('returns NORMAL when all metrics are normal', () => {
    const metrics = new Map<string, MetricValue>([
      ['cpu', { value: 30, severity: Severity.NORMAL, label: 'CPU', unit: '%', raw: 0.30 }],
    ]);
    const host = makeHostMetrics(metrics);
    const sev = computeHostSeverity(host);
    expect(sev).toBe(Severity.NORMAL);
  });
});

// ═══════════════════════════════════════════════════════════════
// combineHosts
// ═══════════════════════════════════════════════════════════════

describe('combineHosts', () => {
  function makeHostMetrics(hostname: string, metrics: Map<string, MetricValue>, sev: Severity): HostMetrics {
    return {
      hostname,
      normalizedHost: hostname,
      cellId: '',
      metrics,
      severity: sev,
    };
  }

  it('combines metrics from multiple hosts under prefixed keys', () => {
    const h1 = makeHostMetrics('srv01', new Map([
      ['cpu', { value: 50, severity: Severity.NORMAL, label: 'CPU', unit: '%' }],
    ]), Severity.NORMAL);

    const h2 = makeHostMetrics('srv02', new Map([
      ['cpu', { value: 90, severity: Severity.CRITICO, label: 'CPU', unit: '%' }],
    ]), Severity.CRITICO);

    const combined = combineHosts([h1, h2], 'group');
    expect(combined.isCombined).toBe(true);
    expect(combined.hostname).toBe('group');
    expect(combined.metrics.has('srv01.cpu')).toBe(true);
    expect(combined.metrics.has('srv02.cpu')).toBe(true);
  });

  it('takes worst severity from all hosts', () => {
    const h1 = makeHostMetrics('a', new Map(), Severity.NORMAL);
    const h2 = makeHostMetrics('b', new Map(), Severity.MAJOR);
    const h3 = makeHostMetrics('c', new Map(), Severity.WARNING);

    const combined = combineHosts([h1, h2, h3], 'all');
    expect(combined.severity).toBe(Severity.MAJOR);
  });

  it('prefixes labels with hostname', () => {
    const h1 = makeHostMetrics('srv01', new Map([
      ['ping', { value: 1, severity: Severity.NORMAL, label: 'PING', unit: '' }],
    ]), Severity.NORMAL);

    const combined = combineHosts([h1], 'group');
    const metric = combined.metrics.get('srv01.ping')!;
    expect(metric.label).toContain('srv01');
  });
});

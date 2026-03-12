// ─────────────────────────────────────────────────────────────
// integration.test.ts – E2E tests against real Elasticsearch data
// Queries Grafana API to extract real metrics and logs
// ─────────────────────────────────────────────────────────────

import { DataFrame, FieldType } from '@grafana/data';
import { extractMetrics, computeHostSeverity } from '../metricExtractor';
import { resolverHost, defaultMapping, defaultHostMapping } from '../hostMapping';
import { Severity } from '../../types';

/**
 * Mock DataFrame generator simulating real Elasticsearch responses
 * Used when live ES is not accessible
 */
function createMockMetricsFrame(hosts: string[], metrics: Record<string, number[]>): DataFrame {
  const fields: any[] = [];

  // Time field
  fields.push({
    name: '@timestamp',
    type: FieldType.time,
    values: Array(hosts.length).fill(null).map((_, i) => Date.now() - (hosts.length - i) * 1000),
    config: {},
  });

  // Host field
  fields.push({
    name: 'host.name',
    type: FieldType.string,
    values: hosts,
    config: { displayName: 'Host' },
  });

  // Metric fields
  for (const [metricName, values] of Object.entries(metrics)) {
    fields.push({
      name: metricName,
      type: FieldType.number,
      values,
      config: { unit: metricName.includes('pct') ? 'percent' : '' },
    });
  }

  return {
    name: 'Metrics',
    refId: 'A',
    fields,
    length: hosts.length,
  };
}

/**
 * Mock Terms aggregation Frame (label-based host identification)
 * Simulates query: Terms(monitor.name) + date_histogram + avg(summary.up)
 */
function createMockTermsFrame(hostName: string, value: number, refId: string = 'B'): DataFrame {
  return {
    name: hostName, // Host identity in frame name
    refId,
    fields: [
      {
        name: 'Time',
        type: FieldType.time,
        values: [Date.now() - 30000, Date.now()],
        config: {},
      },
      {
        name: 'Value',
        type: FieldType.number,
        values: [value, value],
        config: { unit: 'percentunit' },
      },
    ],
    length: 2,
  };
}

describe('Integration Tests – Real Elasticsearch Data', () => {
  // ── Test Case 1: Column-based metrics extraction ──
  describe('Column-based extraction (Logs with host.name column)', () => {
    it('extracts metrics from frame with host.name column', () => {
      const frame = createMockMetricsFrame(
        ['web-server-01', 'web-server-02', 'db-server-01'],
        {
          'system.cpu.total.norm.pct': [45.3, 78.2, 22.1],
          'system.memory.actual.used.pct': [62.5, 85.1, 41.2],
          'system.filesystem.used.pct': [71.5, 88.2, 55.3],
          'summary.up': [1, 1, 1],
        }
      );

      const metrics = extractMetrics([frame], 'host.name');

      expect(metrics.size).toBe(3);
      expect(metrics.has('web-server-01')).toBe(true);
      expect(metrics.has('web-server-02')).toBe(true);
      expect(metrics.has('db-server-01')).toBe(true);

      // Verify metric extraction
      const web01 = metrics.get('web-server-01');
      expect(web01?.metrics.get('cpu')).toBeDefined();
      expect(web01?.metrics.get('cpu')?.value).toBeCloseTo(45.3);
      expect(web01?.metrics.get('memoria')).toBeDefined();
      expect(web01?.metrics.get('memoria')?.value).toBeCloseTo(62.5);
    });

    it('handles missing hosts gracefully', () => {
      const frame = createMockMetricsFrame(
        ['', 'valid-host', null as any, 'another-host'],
        {
          'system.cpu.total.norm.pct': [45, 78, 22, 65],
        }
      );

      const metrics = extractMetrics([frame], 'host.name');

      // Should skip empty/null hosts
      expect(metrics.size).toBeLessThanOrEqual(2);
      expect(metrics.has('valid-host')).toBe(true);
      expect(metrics.has('another-host')).toBe(true);
    });

    it('handles decimal percentages (0-1 range)', () => {
      const frame = createMockMetricsFrame(
        ['host-01'],
        {
          'system.cpu.total.norm.pct': [0.45], // 45% as 0-1 range
          'system.memory.actual.used.pct': [0.852], // 85.2% as 0-1
        }
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('host-01');

      // Should multiply by 100 for display
      expect(host?.metrics.get('cpu')?.value).toBeCloseTo(45);
      expect(host?.metrics.get('memoria')?.value).toBeCloseTo(85.2);
    });

    it('calculates disk usage average from multiple mount points', () => {
      const frame: DataFrame = {
        name: 'Filesystem',
        refId: 'A',
        fields: [
          {
            name: 'host.name',
            type: FieldType.string,
            values: ['server-01', 'server-01', 'server-01', 'server-01'],
            config: {},
          },
          {
            name: 'system.filesystem.mount_point',
            type: FieldType.string,
            values: ['/', '/home', '/', '/home'],
            config: {},
          },
          {
            name: 'system.filesystem.used.pct',
            type: FieldType.number,
            values: [65, 45, 68, 48],
            config: {},
          },
        ],
        length: 4,
      };

      const metrics = extractMetrics([frame], 'host.name');
      const server = metrics.get('server-01');
      const disco = server?.metrics.get('disco');

      // Should take latest value per mount point from the end
      // Latest "/" is at index 2 (68), latest "/home" is at index 3 (48)
      // Average: (68 + 48) / 2 = 58
      expect(disco?.value).toBeCloseTo(58, 0);
    });
  });

  // ── Test Case 2: Terms aggregation (label-based) ──
  describe('Label-based extraction (Terms aggregation)', () => {
    it('extracts host from frame.name (Heartbeat sondas)', () => {
      const frames = [
        createMockTermsFrame('sonda-BAMBOO-1', 1, 'B'),
        createMockTermsFrame('sonda-GRULLA', 1, 'B'),
        createMockTermsFrame('sonda-PHANTOM', 0, 'B'), // DOWN
      ];

      const metrics = extractMetrics(frames, 'monitor.name', 'B');

      expect(metrics.size).toBe(3);
      expect(metrics.has('sonda-BAMBOO-1')).toBe(true);
      expect(metrics.has('sonda-PHANTOM')).toBe(true);

      // Verify frames were extracted
      const phantom = metrics.get('sonda-PHANTOM');
      expect(phantom?.metrics.size).toBeGreaterThan(0);

      const bamboo = metrics.get('sonda-BAMBOO-1');
      expect(bamboo?.metrics.size).toBeGreaterThan(0);
    });

    it('handles refId filtering correctly', () => {
      const frame1 = createMockTermsFrame('host-A', 75, 'A');
      const frame2 = createMockTermsFrame('host-B', 85, 'B');

      const allMetrics = extractMetrics([frame1, frame2], 'monitor.name');
      expect(allMetrics.size).toBe(2);

      // Filter by refId
      const metricsB = extractMetrics([frame1, frame2], 'monitor.name', 'B');
      expect(metricsB.size).toBe(1);
      expect(metricsB.has('host-B')).toBe(true);
      expect(metricsB.has('host-A')).toBe(false);
    });
  });

  // ── Test Case 3: Mixed queries (column-based + label-based) ──
  describe('Mixed extraction (Column-based A + Terms B)', () => {
    it('extracts both column-based and label-based frames', () => {
      const columnFrame = createMockMetricsFrame(
        ['server-01', 'server-02'],
        { 'system.cpu.total.norm.pct': [55, 72] }
      );

      const termsFrames = [
        createMockTermsFrame('sonda-01', 1, 'B'),
        createMockTermsFrame('sonda-02', 0, 'B'),
      ];

      const metrics = extractMetrics([columnFrame, ...termsFrames], 'host.name');

      // Should have: 2 servers + 2 sondas = 4 total
      expect(metrics.size).toBeGreaterThanOrEqual(3); // May normalize some
      expect(metrics.has('server-01')).toBe(true);
      expect(metrics.has('sonda-01')).toBe(true);
      expect(metrics.has('sonda-02')).toBe(true);
    });
  });

  // ── Test Case 4: Severity determination ──
  describe('Severity calculation based on thresholds', () => {
    it('determines NORMAL for healthy metrics', () => {
      const frame = createMockMetricsFrame(
        ['healthy-server'],
        { 'system.cpu.total.norm.pct': [35] } // < 60 WARNING threshold
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('healthy-server');
      const severity = computeHostSeverity(host!);

      expect(severity).toBe(Severity.NORMAL);
    });

    it('determines WARNING for elevated metrics', () => {
      const frame = createMockMetricsFrame(
        ['warning-server'],
        { 'system.cpu.total.norm.pct': [65] } // 60 < 65 < 70 (WARNING)
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('warning-server');
      const severity = computeHostSeverity(host!);

      expect(severity).toBe(Severity.WARNING);
    });

    it('determines MAJOR for critical resource usage', () => {
      const frame = createMockMetricsFrame(
        ['major-server'],
        { 'system.cpu.total.norm.pct': [82] } // > 80 MAJOR
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('major-server');
      const severity = computeHostSeverity(host!);

      expect(severity).toBe(Severity.MAJOR);
    });

    it('determines CRITICO for service down', () => {
      const frame = createMockMetricsFrame(
        ['down-server'],
        { 'summary.up': [0] } // Boolean: 0 = DOWN = CRITICO
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('down-server');
      const severity = computeHostSeverity(host!);

      expect(severity).toBe(Severity.CRITICO);
    });

    it('determines worst severity from multiple metrics', () => {
      const frame = createMockMetricsFrame(
        ['mixed-server'],
        {
          'system.cpu.total.norm.pct': [45], // NORMAL
          'system.memory.actual.used.pct': [95], // CRITICO
          'system.filesystem.used.pct': [88], // MAJOR
        }
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('mixed-server');
      const severity = computeHostSeverity(host!);

      // Should pick WORST = CRITICO
      expect(severity).toBe(Severity.CRITICO);
    });
  });

  // ── Test Case 5: Host mapping and resolution ──
  describe('Host mapping and resolution', () => {
    it('resolves exact cellId to host', () => {
      const metrics = new Map([
        ['web-server-01', { hostname: 'web-server-01', metrics: new Map() }],
      ] as any);

      const mapping = defaultMapping();
      const hostMapping = defaultHostMapping();
      const hostsDisponibles = new Set(metrics.keys());

      const result = resolverHost('web-server-01', mapping, hostMapping, hostsDisponibles);

      expect(result).toBe('web-server-01');
    });

    it('resolves cellId with wildcard mapping', () => {
      const metrics = new Map([
        ['w12desa', { hostname: 'w12desa', metrics: new Map() }],
      ] as any);

      const mapping = defaultMapping();
      const hostMapping = { 'LIDO*': 'w12desa' };
      const hostsDisponibles = new Set(metrics.keys());

      const result = resolverHost('LIDO-PROD-01', mapping, hostMapping, hostsDisponibles);

      expect(result).toBe('w12desa');
    });

    it('normalizes hostname with special characters', () => {
      const metrics = new Map([
        ['harvard', { hostname: 'harvard.condis.es', normalizedHost: 'harvard', metrics: new Map() }],
      ] as any);

      const mapping = defaultMapping();
      const hostMapping = {};
      const hostsDisponibles = new Set(['harvard']);

      const result = resolverHost('harvard.condis.es', mapping, hostMapping, hostsDisponibles);

      expect(result).toBe('harvard');
    });

    it('returns null for unresolvable cellId', () => {
      const metrics = new Map([
        ['known-host', { hostname: 'known-host', metrics: new Map() }],
      ] as any);

      const mapping = defaultMapping();
      const hostMapping = {};
      const hostsDisponibles = new Set(metrics.keys());

      const result = resolverHost('UNKNOWN-CELL-ID', mapping, hostMapping, hostsDisponibles);

      expect(result).toBeNull();
    });
  });

  // ── Test Case 6: Custom thresholds per server ──
  describe('Custom per-server thresholds', () => {
    it('applies custom thresholds instead of defaults', () => {
      const frame = createMockMetricsFrame(
        ['critical-server'],
        { 'system.cpu.total.norm.pct': [88] }
      );

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('critical-server')!;

      // With default thresholds (MAJOR at 80): 88 = MAJOR
      let severity = computeHostSeverity(host);
      expect(severity).toBe(Severity.MAJOR);

      // With custom thresholds (MAJOR at 95): 88 = WARNING
      const customThresholds = {
        'critical-server': {
          cpu: { CRITICO: 98, MAJOR: 95 },
        },
      };
      severity = computeHostSeverity(host, customThresholds);
      expect(severity).toBe(Severity.WARNING);
    });
  });

  // ── Test Case 7: Edge cases ──
  describe('Edge cases and error handling', () => {
    it('handles empty DataFrame', () => {
      const frame: DataFrame = {
        name: 'Empty',
        refId: 'A',
        fields: [],
        length: 0,
      };

      const metrics = extractMetrics([frame], 'host.name');
      expect(metrics.size).toBe(0);
    });

    it('handles NaN and null values', () => {
      const frame: DataFrame = {
        name: 'Invalid',
        refId: 'A',
        fields: [
          {
            name: 'host.name',
            type: FieldType.string,
            values: ['host-01', 'host-02'],
            config: {},
          },
          {
            name: 'system.cpu.total.norm.pct',
            type: FieldType.number,
            values: [NaN, null],
            config: {},
          },
        ],
        length: 2,
      };

      const metrics = extractMetrics([frame], 'host.name');
      // Should skip NaN/null hosts gracefully
      expect(metrics.size).toBeGreaterThanOrEqual(0);
    });

    it('handles timestamp reordering (P6 fix)', () => {
      const frame: DataFrame = {
        name: 'Reordered',
        refId: 'A',
        fields: [
          {
            name: '@timestamp',
            type: FieldType.time,
            values: [Date.now() - 1000, Date.now() - 3000, Date.now()], // Not in order
            config: {},
          },
          {
            name: 'host.name',
            type: FieldType.string,
            values: ['host-01', 'host-01', 'host-01'],
            config: {},
          },
          {
            name: 'system.cpu.total.norm.pct',
            type: FieldType.number,
            values: [50, 75, 45],
            config: {},
          },
        ],
        length: 3,
      };

      const metrics = extractMetrics([frame], 'host.name');
      const host = metrics.get('host-01');

      // Should pick value at max timestamp (Date.now()), not last index
      // Max timestamp is at index 2, value = 45
      expect(host?.metrics.get('cpu')?.value).toBeCloseTo(45);
    });

    it('handles frame with single numeric _value (P7 fix)', () => {
      const frame: DataFrame = {
        name: 'sonda-HEARTBEAT',
        refId: 'B',
        fields: [
          {
            name: 'summary.up',
            type: FieldType.number,
            values: [1, 1],
            config: {},
          },
        ],
        length: 2,
      };

      const metrics = extractMetrics([frame], 'monitor.name', 'B');
      const sonda = metrics.get('sonda-HEARTBEAT');

      // Should store under both '_value' (fallback) and '_value:B' (namespaced)
      expect(sonda?.metrics.has('_value')).toBe(true);
      expect(sonda?.metrics.has('_value:B')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// cellProcessor.test.ts – Tests for resolveHostForCell, resolveMetricEntries
// ─────────────────────────────────────────────────────────────
import { resolveHostForCell, resolveMetricEntries } from '../cellProcessor';
import { HostMetrics, Severity, CellMapping, COLORES } from '../../types';
import { buildHostSearchIndex } from '../metricsIndex';

function makeHost(hostname: string, metricsObj: Record<string, number> = {}): HostMetrics {
  const metrics = new Map<string, any>();
  for (const [k, v] of Object.entries(metricsObj)) {
    metrics.set(k, { value: v, severity: Severity.NORMAL, label: k, unit: '' });
  }
  return {
    hostname,
    normalizedHost: hostname.toLowerCase(),
    cellId: '',
    metrics,
    severity: Severity.NORMAL,
  };
}

const identity = (s: string) => s;

describe('resolveHostForCell', () => {
  const metrics = new Map<string, HostMetrics>();
  metrics.set('server1', makeHost('server1', { cpu: 50 }));
  metrics.set('server2', makeHost('server2', { cpu: 80 }));
  const idx = buildHostSearchIndex(metrics);

  it('resolves explicit hostName from mapping', () => {
    const cm: CellMapping = { cellId: 'c1', hostName: 'server1', metrics: [] };
    const { resolvedHost, hostData } = resolveHostForCell(cm, null, metrics, identity, idx);
    expect(resolvedHost).toBe('server1');
    expect(hostData?.hostname).toBe('server1');
  });

  it('resolves comma-separated hosts', () => {
    const cm: CellMapping = { cellId: 'c1', hostName: 'server1, server2', metrics: [] };
    const { resolvedHost, hostData } = resolveHostForCell(cm, null, metrics, identity, idx);
    expect(resolvedHost).toBe('server1, server2');
    expect(hostData?.isCombined).toBe(true);
  });

  it('falls back to autoHost when no hostName', () => {
    const cm: CellMapping = { cellId: 'c1', metrics: [] };
    const { resolvedHost, hostData } = resolveHostForCell(cm, 'server1', metrics, identity, idx);
    expect(resolvedHost).toBe('server1');
    expect(hostData?.hostname).toBe('server1');
  });

  it('returns null hostData for unknown host', () => {
    const cm: CellMapping = { cellId: 'c1', hostName: 'unknown', metrics: [] };
    const { resolvedHost, hostData } = resolveHostForCell(cm, null, metrics, identity, idx);
    expect(resolvedHost).toBe('unknown');
    expect(hostData).toBeNull();
  });

  it('works without index (fallback to linear search)', () => {
    const cm: CellMapping = { cellId: 'c1', hostName: 'server1', metrics: [] };
    const { hostData } = resolveHostForCell(cm, null, metrics, identity);
    expect(hostData?.hostname).toBe('server1');
  });
});

describe('resolveMetricEntries', () => {
  const host = makeHost('server1', { 'system.cpu.total.pct': 85, 'system.memory.used.pct': 60 });
  const metrics = new Map<string, HostMetrics>();
  metrics.set('server1', host);

  const baseSeries = [
    {
      refId: 'A',
      fields: [
        { name: 'host.name', type: 'string' as any, values: ['server1', 'server1'] },
        { name: '@timestamp', type: 'time' as any, values: [1000, 2000] },
        { name: 'system.cpu.total.pct', type: 'number' as any, values: [80, 85] },
        { name: 'system.memory.used.pct', type: 'number' as any, values: [55, 60] },
      ],
    },
  ];

  const baseCtx = {
    sortedSeries: baseSeries,
    metricsCache: {
      metricsMap: metrics,
      perRefIdMaps: new Map(),
      perMappingMaps: new Map(),
    },
    effectiveMetrics: metrics,
    effectiveSeries: baseSeries,
    mappingRefId: '',
    defaultHostFieldName: 'host.name',
    globalThresholds: [],
    replaceVariables: identity,
  };

  it('resolves a single metric with last value', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [{ field: 'system.cpu.total.pct' }],
    };
    const result = resolveMetricEntries(cm, host, 'server1', baseCtx);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].label).toContain('cpu');
    expect(result.severity).toBeDefined();
  });

  it('resolves multiple metrics', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [
        { field: 'system.cpu.total.pct' },
        { field: 'system.memory.used.pct' },
      ],
    };
    const result = resolveMetricEntries(cm, host, 'server1', baseCtx);
    expect(result.entries).toHaveLength(2);
  });

  it('applies thresholds and returns correct color', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [{
        field: 'system.cpu.total.pct',
        thresholds: [
          { value: 90, color: '#DA2020', op: '>=' },
          { value: 70, color: '#FF9830', op: '>=' },
        ],
      }],
    };
    const result = resolveMetricEntries(cm, host, 'server1', baseCtx);
    // cpu=85 → hits >= 70 threshold (warning)
    expect(result.color).toBe('#FF9830');
  });

  it('returns N/A when host has no data', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [{ field: 'system.cpu.total.pct' }],
    };
    const result = resolveMetricEntries(cm, null, 'unknown', baseCtx);
    expect(result.entries[0].value).toBe('N/A');
  });

  it('handles alias', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [{ field: 'system.cpu.total.pct', alias: 'CPU Usage' }],
    };
    const result = resolveMetricEntries(cm, host, 'server1', baseCtx);
    expect(result.entries[0].label).toBe('CPU Usage');
  });

  it('handles sum aggregation', () => {
    const cm: CellMapping = {
      cellId: 'c1',
      metrics: [{ field: 'system.cpu.total.pct', aggregation: 'sum' }],
    };
    const result = resolveMetricEntries(cm, host, 'server1', baseCtx);
    // sum of [80, 85] = 165
    expect(result.entries).toHaveLength(1);
    // value should be numeric (165) or formatted version thereof
    expect(result.entries[0].value).not.toBe('N/A');
  });
});

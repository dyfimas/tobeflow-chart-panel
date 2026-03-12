// ─────────────────────────────────────────────────────────────
// hostResolver.test.ts – Tests for findHostInMetrics, findMetricInHost,
//   findRawFieldValue, findLastTimestamp
// ─────────────────────────────────────────────────────────────
import { findHostInMetrics, findMetricInHost, findRawFieldValue, findLastTimestamp } from '../hostResolver';
import { HostMetrics, Severity } from '../../types';

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

describe('findHostInMetrics', () => {
  it('finds exact match', () => {
    const map = new Map<string, HostMetrics>();
    map.set('server1', makeHost('server1'));
    map.set('server2', makeHost('server2'));
    expect(findHostInMetrics(map, 'server1')).toBeTruthy();
    expect(findHostInMetrics(map, 'server1')?.hostname).toBe('server1');
  });

  it('finds case-insensitive match', () => {
    const map = new Map<string, HostMetrics>();
    map.set('Server1', makeHost('Server1'));
    const result = findHostInMetrics(map, 'server1');
    expect(result).toBeTruthy();
  });

  it('returns null for non-existent host', () => {
    const map = new Map<string, HostMetrics>();
    map.set('server1', makeHost('server1'));
    expect(findHostInMetrics(map, 'unknown')).toBeNull();
  });

  it('finds by normalized host (strips domain)', () => {
    const map = new Map<string, HostMetrics>();
    map.set('server1.example.com', makeHost('server1.example.com'));
    // normHost strips the domain, so searching for 'server1' should find it
    const result = findHostInMetrics(map, 'server1');
    expect(result).toBeTruthy();
  });
});

describe('findMetricInHost', () => {
  it('finds exact metric key', () => {
    const host = makeHost('s1', { 'system.cpu.total.pct': 75 });
    const result = findMetricInHost(host, 'system.cpu.total.pct');
    expect(result).toBeTruthy();
    expect(result?.value).toBe(75);
  });

  it('returns null for non-existent metric', () => {
    const host = makeHost('s1', { cpu: 50 });
    expect(findMetricInHost(host, 'memory')).toBeNull();
  });
});

describe('findRawFieldValue', () => {
  it('finds field value from column-based series', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['s1', 's2'] },
          { name: 'cpu', type: 'number' as any, values: [80, 90] },
        ],
      },
    ];
    const result = findRawFieldValue(series, 's1', 'cpu');
    expect(result).toBe(80);
  });

  it('returns null if host not found', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['s1'] },
          { name: 'cpu', type: 'number' as any, values: [80] },
        ],
      },
    ];
    expect(findRawFieldValue(series, 'unknown', 'cpu')).toBeNull();
  });
});

describe('findLastTimestamp', () => {
  it('returns last timestamp for matching host', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['s1', 's1'] },
          { name: '@timestamp', type: 'time' as any, values: [1000, 2000] },
          { name: 'cpu', type: 'number' as any, values: [50, 60] },
        ],
      },
    ];
    const result = findLastTimestamp(series, 's1');
    expect(result).toBe(2000);
  });

  it('returns null when host not found', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['s1'] },
          { name: '@timestamp', type: 'time' as any, values: [1000] },
        ],
      },
    ];
    expect(findLastTimestamp(series, 'unknown')).toBeNull();
  });
});

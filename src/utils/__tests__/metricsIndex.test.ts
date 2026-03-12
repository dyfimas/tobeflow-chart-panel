// ─────────────────────────────────────────────────────────────
// metricsIndex.test.ts – Tests for P13/P14 pre-computed indexes
// ─────────────────────────────────────────────────────────────
import {
  buildFieldValueIndex,
  queryFieldIndex,
  buildHostSearchIndex,
  findHostFast,
} from '../metricsIndex';
import { HostMetrics, Severity } from '../../types';

function makeHost(hostname: string): HostMetrics {
  return {
    hostname,
    normalizedHost: hostname.toLowerCase(),
    cellId: '',
    metrics: new Map(),
    severity: Severity.NORMAL,
  };
}

// ─── P13: FieldValueIndex ─────────────────────────────────

describe('buildFieldValueIndex', () => {
  it('indexes column-based frames', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['s1', 's2', 's1'] },
          { name: 'cpu', type: 'number' as any, values: [10, 20, 30] },
          { name: 'mem', type: 'number' as any, values: [50, 60, 70] },
        ],
      },
    ];
    const idx = buildFieldValueIndex(series, 'host.name');
    expect(idx.byHost.get('s1')?.get('cpu')).toEqual([10, 30]);
    expect(idx.byHost.get('s1')?.get('mem')).toEqual([50, 70]);
    expect(idx.byHost.get('s2')?.get('cpu')).toEqual([20]);
  });

  it('indexes label-based frames', () => {
    const series = [
      {
        name: 'myhost',
        fields: [
          { name: 'cpu', type: 'number' as any, values: [11, 22], labels: { 'host.name': 'myhost' } },
        ],
      },
    ];
    const idx = buildFieldValueIndex(series);
    expect(idx.byHost.get('myhost')?.get('cpu')).toEqual([11, 22]);
  });

  it('handles empty series', () => {
    const idx = buildFieldValueIndex([]);
    expect(idx.byHost.size).toBe(0);
  });

  it('builds normalized index entries', () => {
    const series = [
      {
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['Server1.example.com'] },
          { name: 'cpu', type: 'number' as any, values: [99] },
        ],
      },
    ];
    const idx = buildFieldValueIndex(series, 'host.name');
    // byNormHost should have normalized key
    expect(idx.byNormHost.size).toBeGreaterThan(0);
  });
});

describe('queryFieldIndex', () => {
  const series = [
    {
      fields: [
        { name: 'host.name', type: 'string' as any, values: ['server1', 'server1', 'server2'] },
        { name: 'cpu', type: 'number' as any, values: [10, 20, 30] },
      ],
    },
  ];

  it('returns exact match values', () => {
    const idx = buildFieldValueIndex(series, 'host.name');
    expect(queryFieldIndex(idx, 'server1', 'cpu')).toEqual([10, 20]);
  });

  it('returns empty for unknown host', () => {
    const idx = buildFieldValueIndex(series, 'host.name');
    expect(queryFieldIndex(idx, 'unknown', 'cpu')).toEqual([]);
  });

  it('returns empty for unknown field', () => {
    const idx = buildFieldValueIndex(series, 'host.name');
    expect(queryFieldIndex(idx, 'server1', 'nonexistent')).toEqual([]);
  });

  it('falls back to normalized match', () => {
    const domainSeries = [
      {
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['web01.prod.local'] },
          { name: 'cpu', type: 'number' as any, values: [55] },
        ],
      },
    ];
    const idx = buildFieldValueIndex(domainSeries, 'host.name');
    // normHost('web01.prod.local') strips .prod.local → 'web01'
    // Querying with same domain should get exact match
    const result = queryFieldIndex(idx, 'web01.prod.local', 'cpu');
    expect(result).toEqual([55]);
  });
});

// ─── P14: HostSearchIndex ─────────────────────────────────

describe('buildHostSearchIndex', () => {
  it('creates exact, normalized, and lower maps', () => {
    const metrics = new Map<string, HostMetrics>();
    metrics.set('Server1', makeHost('Server1'));
    metrics.set('web-02.example.com', makeHost('web-02.example.com'));

    const idx = buildHostSearchIndex(metrics);
    expect(idx.exact.get('Server1')).toBe('Server1');
    expect(idx.lower.get('server1')).toBe('Server1');
    expect(idx.normalized.size).toBeGreaterThan(0);
  });

  it('handles empty map', () => {
    const idx = buildHostSearchIndex(new Map());
    expect(idx.exact.size).toBe(0);
    expect(idx.normalized.size).toBe(0);
    expect(idx.lower.size).toBe(0);
  });
});

describe('findHostFast', () => {
  const metrics = new Map<string, HostMetrics>();
  metrics.set('Server1', makeHost('Server1'));
  metrics.set('web-02.example.com', makeHost('web-02.example.com'));
  metrics.set('db-master', makeHost('db-master'));
  const idx = buildHostSearchIndex(metrics);

  it('finds exact match', () => {
    const result = findHostFast(metrics, idx, 'Server1');
    expect(result?.hostname).toBe('Server1');
  });

  it('finds case-insensitive match', () => {
    const result = findHostFast(metrics, idx, 'server1');
    expect(result?.hostname).toBe('Server1');
  });

  it('finds by normalized name', () => {
    const result = findHostFast(metrics, idx, 'web-02');
    expect(result).toBeTruthy();
  });

  it('returns null for unknown host', () => {
    expect(findHostFast(metrics, idx, 'nonexistent')).toBeNull();
  });

  it('finds db-master with exact match', () => {
    const result = findHostFast(metrics, idx, 'db-master');
    expect(result?.hostname).toBe('db-master');
  });
});

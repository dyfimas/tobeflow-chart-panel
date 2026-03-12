// ─────────────────────────────────────────────────────────────
// aggregation.test.ts – Tests for aggregateValues & collectAllFieldValues
// ─────────────────────────────────────────────────────────────
import { aggregateValues, collectAllFieldValues, findGroupedFieldValues } from '../aggregation';

describe('aggregateValues', () => {
  it('returns null for empty array', () => {
    expect(aggregateValues([], 'last')).toBeNull();
  });

  it('returns last value', () => {
    expect(aggregateValues([10, 20, 30], 'last')).toBe(30);
  });

  it('returns first value', () => {
    expect(aggregateValues([10, 20, 30], 'first')).toBe(10);
  });

  it('returns min value', () => {
    expect(aggregateValues([5, 2, 8, 1, 9], 'min')).toBe(1);
  });

  it('returns max value', () => {
    expect(aggregateValues([5, 2, 8, 1, 9], 'max')).toBe(9);
  });

  it('returns sum', () => {
    expect(aggregateValues([1, 2, 3, 4], 'sum')).toBe(10);
  });

  it('returns avg', () => {
    expect(aggregateValues([10, 20, 30], 'avg')).toBeCloseTo(20);
  });

  it('returns count', () => {
    expect(aggregateValues([1, 2, 3], 'count')).toBe(3);
  });

  it('returns delta (last - first)', () => {
    expect(aggregateValues([10, 15, 25], 'delta')).toBe(15);
  });

  it('returns range (max - min)', () => {
    expect(aggregateValues([5, 2, 8], 'range')).toBe(6);
  });

  it('returns diff (|last - secondLast|)', () => {
    expect(aggregateValues([10, 20, 35], 'diff')).toBe(15);
  });

  it('returns lastNotNull skipping NaN', () => {
    expect(aggregateValues([10, 20, NaN], 'lastNotNull')).toBe(20);
  });

  it('returns firstNotNull skipping NaN', () => {
    expect(aggregateValues([NaN, 30, 40], 'firstNotNull')).toBe(30);
  });

  it('returns timeOfLastPoint (same as last)', () => {
    expect(aggregateValues([100, 200, 300], 'timeOfLastPoint')).toBe(300);
  });
});

describe('collectAllFieldValues', () => {
  const makeSeries = () => [
    {
      refId: 'A',
      fields: [
        { name: 'host.name', type: 'string' as any, values: ['server1', 'server2', 'server1'] },
        { name: 'cpu', type: 'number' as any, values: [10, 20, 30] },
        { name: 'memory', type: 'number' as any, values: [50, 60, 70] },
      ],
    },
  ];

  it('collects values for matching host and field (column-based)', () => {
    const result = collectAllFieldValues(makeSeries(), 'server1', 'cpu', 'host.name');
    expect(result).toEqual([10, 30]);
  });

  it('returns empty for non-existent host', () => {
    const result = collectAllFieldValues(makeSeries(), 'unknown', 'cpu', 'host.name');
    expect(result).toEqual([]);
  });

  it('returns empty for non-existent field', () => {
    const result = collectAllFieldValues(makeSeries(), 'server1', 'disk', 'host.name');
    expect(result).toEqual([]);
  });

  it('collects values from label-based frames', () => {
    const series = [
      {
        name: 'myhost',
        refId: 'B',
        fields: [
          {
            name: 'cpu',
            type: 'number' as any,
            values: [11, 22],
            labels: { 'host.name': 'myhost' },
          },
        ],
      },
    ];
    const result = collectAllFieldValues(series, 'myhost', 'cpu', 'host.name');
    expect(result).toEqual([11, 22]);
  });

  it('collects values when frame.name includes host + group (terms alias)', () => {
    const series = [
      {
        name: 'grumman - Q:\\',
        refId: 'C',
        fields: [
          { name: 'Time', type: 'time' as any, values: [1, 2] },
          { name: 'Value', type: 'number' as any, values: [81, 84] },
        ],
      },
    ];
    const result = collectAllFieldValues(series, 'grumman', 'Value', 'host.name');
    expect(result).toEqual([81, 84]);
  });
});

describe('findGroupedFieldValues', () => {
  it('groups by real groupBy field in column-based frames', () => {
    const series = [
      {
        refId: 'A',
        fields: [
          { name: 'host.name', type: 'string' as any, values: ['grumman', 'grumman'] },
          { name: 'system.filesystem.mount_point', type: 'string' as any, values: ['C:\\', 'Q:\\'] },
          { name: 'system.filesystem.used.pct', type: 'number' as any, values: [71, 83] },
        ],
      },
    ];
    const grouped = findGroupedFieldValues(
      series,
      'grumman',
      'system.filesystem.used.pct',
      'system.filesystem.mount_point',
      'host.name'
    );
    expect(grouped).toEqual([
      { group: 'C:\\', value: 71 },
      { group: 'Q:\\', value: 83 },
    ]);
  });

  it('groups by inferring mount from terms-style frame names', () => {
    const series = [
      {
        name: 'grumman - Q:\\',
        refId: 'C',
        fields: [
          { name: 'Time', type: 'time' as any, values: [1, 2] },
          { name: 'Value', type: 'number' as any, values: [81, 84] },
        ],
      },
      {
        name: 'grumman - L:\\',
        refId: 'C',
        fields: [
          { name: 'Time', type: 'time' as any, values: [1, 2] },
          { name: 'Value', type: 'number' as any, values: [65, 66] },
        ],
      },
      {
        name: 'grumman - C:\\',
        refId: 'C',
        fields: [
          { name: 'Time', type: 'time' as any, values: [1, 2] },
          { name: 'Value', type: 'number' as any, values: [55, 59] },
        ],
      },
    ];

    const grouped = findGroupedFieldValues(
      series,
      'grumman',
      'system.filesystem.used.pct',
      'system.filesystem.mount_point',
      'host.name'
    );

    expect(grouped).toEqual([
      { group: 'C:\\', value: 59 },
      { group: 'L:\\', value: 66 },
      { group: 'Q:\\', value: 84 },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// aliasResolver.test.ts – Tests for alias parsing, Lucene parsing,
// DataFrame analysis, pattern matching, and validation
// ─────────────────────────────────────────────────────────────
import type { DataFrame, Field } from '@grafana/data';
import {
  parseAliasTemplate,
  isDynamicAlias,
  parseLuceneFieldValues,
  analyzeRefId,
  analyzeAllRefIds,
  matchPattern,
  validateMapping,
  getAvailableValuesForField,
} from '../aliasResolver';

// ─── Helpers ────────────────────────────────────────────────

function makeFrame(overrides: Partial<DataFrame> = {}): DataFrame {
  return {
    fields: [],
    refId: 'A',
    ...overrides,
  };
}

function makeField(name: string, type: string, values: any[], labels?: Record<string, string>): Field {
  return { name, type: type as any, values, labels, config: {} };
}

// ═══════════════════════════════════════════════════════════════
// parseAliasTemplate
// ═══════════════════════════════════════════════════════════════

describe('parseAliasTemplate', () => {
  it('returns empty array for empty string', () => {
    expect(parseAliasTemplate('')).toEqual([]);
  });

  it('returns empty array for string without templates', () => {
    expect(parseAliasTemplate('static alias name')).toEqual([]);
  });

  it('parses {{term field}} pattern', () => {
    const vars = parseAliasTemplate('sonda {{term monitor.name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toEqual({
      type: 'term',
      field: 'monitor.name',
      raw: '{{term monitor.name}}',
    });
  });

  it('parses {{field}} pattern', () => {
    const vars = parseAliasTemplate('metric: {{field}}');
    expect(vars).toHaveLength(1);
    expect(vars[0].type).toBe('field');
    expect(vars[0].field).toBe('');
  });

  it('parses {{tag_X}} pattern', () => {
    const vars = parseAliasTemplate('host: {{tag_host.name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({ type: 'tag', field: 'host.name' });
  });

  it('parses {{value}} pattern', () => {
    const vars = parseAliasTemplate('val={{value}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({ type: 'value', field: '' });
  });

  it('parses field-path template (dot notation)', () => {
    const vars = parseAliasTemplate('{{monitor.name.keyword}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({ type: 'term', field: 'monitor.name.keyword' });
  });

  it('parses field-path template (underscore notation)', () => {
    const vars = parseAliasTemplate('{{host_name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({ type: 'term', field: 'host_name' });
  });

  it('parses unknown single-word variable', () => {
    const vars = parseAliasTemplate('{{hostname}}');
    expect(vars).toHaveLength(1);
    expect(vars[0].type).toBe('unknown');
  });

  it('parses multiple templates in one alias', () => {
    const vars = parseAliasTemplate('{{term host.name}} - {{field}} ({{value}})');
    expect(vars).toHaveLength(3);
    expect(vars.map((v) => v.type)).toEqual(['term', 'field', 'value']);
  });
});

// ═══════════════════════════════════════════════════════════════
// isDynamicAlias
// ═══════════════════════════════════════════════════════════════

describe('isDynamicAlias', () => {
  it('returns true for alias with template vars', () => {
    expect(isDynamicAlias('sonda {{term monitor.name}}')).toBe(true);
  });

  it('returns false for static alias', () => {
    expect(isDynamicAlias('my static alias')).toBe(false);
  });

  it('returns false for empty/null', () => {
    expect(isDynamicAlias('')).toBe(false);
    expect(isDynamicAlias(undefined as any)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// parseLuceneFieldValues
// ═══════════════════════════════════════════════════════════════

describe('parseLuceneFieldValues', () => {
  it('returns empty for empty input', () => {
    expect(parseLuceneFieldValues('', 'host')).toEqual([]);
    expect(parseLuceneFieldValues('host:val', '')).toEqual([]);
  });

  it('parses group pattern: field:(val1 val2 val3)', () => {
    const result = parseLuceneFieldValues(
      'monitor.name:(BAMBOO-PING PURPLE-PING BEACH-PING)',
      'monitor.name'
    );
    expect(result).toEqual(['BAMBOO-PING', 'PURPLE-PING', 'BEACH-PING']);
  });

  it('parses group with wildcards: field:(*BEACH* *PURPLE*)', () => {
    const result = parseLuceneFieldValues(
      'monitor.name:(*BEACH* *PURPLE*)',
      'monitor.name'
    );
    expect(result).toEqual(['*BEACH*', '*PURPLE*']);
  });

  it('parses single value: field:value', () => {
    const result = parseLuceneFieldValues('host.name:server01', 'host.name');
    expect(result).toEqual(['server01']);
  });

  it('parses quoted value in group: field:("exact value")', () => {
    const result = parseLuceneFieldValues('host.name:("my server")', 'host.name');
    expect(result).toEqual(['my server']);
  });

  it('parses single quoted value (captures first word)', () => {
    // Limitation: single field:"quoted" pattern captures up to first space
    const result = parseLuceneFieldValues('host.name:"server01"', 'host.name');
    expect(result).toEqual(['server01']);
  });

  it('parses OR chain: field:val1 OR field:val2', () => {
    const result = parseLuceneFieldValues(
      'host:alpha OR host:beta OR host:gamma',
      'host'
    );
    expect(result).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('parses group with OR: field:(val1 OR val2 OR val3)', () => {
    const result = parseLuceneFieldValues(
      'name:(alpha OR beta OR gamma)',
      'name'
    );
    expect(result).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('deduplicates values', () => {
    // field:(val1) AND field:val1 → should not duplicate
    const result = parseLuceneFieldValues(
      'host:(server01) AND host:server01',
      'host'
    );
    expect(result).toEqual(['server01']);
  });

  it('handles special regex chars in field name', () => {
    const result = parseLuceneFieldValues(
      'monitor.name.keyword:TEST',
      'monitor.name.keyword'
    );
    expect(result).toEqual(['TEST']);
  });

  it('is case-insensitive for field matching', () => {
    const result = parseLuceneFieldValues('HOST.NAME:server01', 'host.name');
    expect(result).toEqual(['server01']);
  });
});

// ═══════════════════════════════════════════════════════════════
// analyzeRefId
// ═══════════════════════════════════════════════════════════════

describe('analyzeRefId', () => {
  it('returns non-dynamic for single frame', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [makeField('host.name', 'string', ['srv01'])],
      }),
    ];
    const result = analyzeRefId(series, 'A');
    expect(result.isDynamic).toBe(false);
    expect(result.frameCount).toBe(1);
    expect(result.refId).toBe('A');
  });

  it('returns dynamic for multiple frames', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'B',
        name: 'sonda BAMBOO',
        fields: [
          makeField('summary.up', 'number', [1], { 'monitor_name': 'BAMBOO' }),
        ],
      }),
      makeFrame({
        refId: 'B',
        name: 'sonda PURPLE',
        fields: [
          makeField('summary.up', 'number', [0], { 'monitor_name': 'PURPLE' }),
        ],
      }),
    ];
    const result = analyzeRefId(series, 'B');
    expect(result.isDynamic).toBe(true);
    expect(result.frameCount).toBe(2);
    expect(result.groupingLabels).toContain('monitor_name');
    expect(result.expandedValues).toContain('BAMBOO');
    expect(result.expandedValues).toContain('PURPLE');
  });

  it('returns empty analysis for non-existent refId', () => {
    const result = analyzeRefId([], 'Z');
    expect(result.isDynamic).toBe(false);
    expect(result.frameCount).toBe(0);
    expect(result.expandedValues).toEqual([]);
  });

  it('uses frame names as fallback when no labels', () => {
    const series: DataFrame[] = [
      makeFrame({ refId: 'C', name: 'frame-alpha', fields: [makeField('val', 'number', [1])] }),
      makeFrame({ refId: 'C', name: 'frame-beta', fields: [makeField('val', 'number', [2])] }),
    ];
    const result = analyzeRefId(series, 'C');
    expect(result.isDynamic).toBe(true);
    expect(result.expandedValues).toContain('frame-alpha');
    expect(result.expandedValues).toContain('frame-beta');
  });

  it('collects fieldNames from all frames', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'D',
        fields: [
          makeField('cpu', 'number', [50]),
          makeField('ram', 'number', [70]),
        ],
      }),
    ];
    const result = analyzeRefId(series, 'D');
    expect(result.fieldNames).toContain('cpu');
    expect(result.fieldNames).toContain('ram');
  });

  it('ignores frames from other refIds', () => {
    const series: DataFrame[] = [
      makeFrame({ refId: 'A', fields: [makeField('f', 'number', [1])] }),
      makeFrame({ refId: 'B', fields: [makeField('g', 'number', [2])] }),
    ];
    const result = analyzeRefId(series, 'A');
    expect(result.frameCount).toBe(1);
    expect(result.fieldNames).toContain('f');
    expect(result.fieldNames).not.toContain('g');
  });
});

// ═══════════════════════════════════════════════════════════════
// analyzeAllRefIds
// ═══════════════════════════════════════════════════════════════

describe('analyzeAllRefIds', () => {
  it('maps all refIds from series', () => {
    const series: DataFrame[] = [
      makeFrame({ refId: 'A', fields: [] }),
      makeFrame({ refId: 'B', fields: [] }),
      makeFrame({ refId: 'B', fields: [] }),
    ];
    const result = analyzeAllRefIds(series);
    expect(result.size).toBe(2);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.get('B')!.frameCount).toBe(2);
  });

  it('returns empty map for empty series', () => {
    expect(analyzeAllRefIds([]).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// matchPattern
// ═══════════════════════════════════════════════════════════════

describe('matchPattern', () => {
  const values = ['BAMBOO-PING', 'PURPLE-PING', 'BEACH-HTTP', 'ALPHA-PING', 'BETA-HTTP'];

  it('matches all when pattern is empty', () => {
    const result = matchPattern(values, '');
    expect(result.count).toBe(5);
    expect(result.matches).toEqual(values);
  });

  it('matches suffix wildcard: *-PING', () => {
    const result = matchPattern(values, '*-PING');
    expect(result.count).toBe(3);
    expect(result.matches).toEqual(['BAMBOO-PING', 'PURPLE-PING', 'ALPHA-PING']);
  });

  it('matches prefix wildcard: BAMBOO*', () => {
    const result = matchPattern(values, 'BAMBOO*');
    expect(result.matches).toEqual(['BAMBOO-PING']);
  });

  it('matches middle wildcard: *-*', () => {
    const result = matchPattern(values, '*-*');
    expect(result.count).toBe(5);
  });

  it('matches exact value', () => {
    const result = matchPattern(values, 'BEACH-HTTP');
    expect(result.matches).toEqual(['BEACH-HTTP']);
  });

  it('is case-insensitive', () => {
    const result = matchPattern(values, 'bamboo-ping');
    expect(result.matches).toEqual(['BAMBOO-PING']);
  });

  it('returns empty for non-matching pattern', () => {
    const result = matchPattern(values, 'NOPE*');
    expect(result.count).toBe(0);
    expect(result.matches).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// validateMapping
// ═══════════════════════════════════════════════════════════════

describe('validateMapping', () => {
  const staticAnalysis = new Map([
    ['A', {
      refId: 'A',
      isDynamic: false,
      frameCount: 1,
      groupingLabels: [],
      expandedValues: [],
      allLabels: new Map<string, Set<string>>(),
      fieldNames: ['cpu', 'ram'],
      frameNames: [],
    }],
  ]);

  const dynamicAnalysis = new Map([
    ['B', {
      refId: 'B',
      isDynamic: true,
      frameCount: 3,
      groupingLabels: ['monitor_name'],
      expandedValues: ['BAMBOO', 'PURPLE', 'BEACH'],
      allLabels: new Map([['monitor_name', new Set(['BAMBOO', 'PURPLE', 'BEACH'])]]),
      fieldNames: ['summary.up'],
      frameNames: ['sonda BAMBOO', 'sonda PURPLE', 'sonda BEACH'],
    }],
  ]);

  it('returns error when refId has no data', () => {
    const warnings = validateMapping(
      { refId: 'Z', hostName: '', metrics: [] },
      staticAnalysis,
      []
    );
    expect(warnings.some((w) => w.level === 'error' && w.field === 'refId')).toBe(true);
  });

  it('warns when dynamic refId has no host config', () => {
    const warnings = validateMapping(
      { refId: 'B', hostName: '', metrics: [{ field: 'summary.up' }] },
      dynamicAnalysis,
      []
    );
    expect(warnings.some((w) => w.level === 'warning' && w.field === 'hostName')).toBe(true);
  });

  it('shows info about grouping labels for dynamic queries', () => {
    const warnings = validateMapping(
      { refId: 'B', hostName: '', metrics: [] },
      dynamicAnalysis,
      []
    );
    expect(warnings.some((w) => w.level === 'info' && w.message.includes('monitor_name'))).toBe(true);
  });

  it('no warning when dynamic refId has hostName', () => {
    const warnings = validateMapping(
      { refId: 'B', hostName: 'BAMBOO', metrics: [] },
      dynamicAnalysis,
      ['BAMBOO']
    );
    // Should not have the "configura hostName" warning
    const hostWarnings = warnings.filter((w) => w.level === 'warning' && w.field === 'hostName');
    // We might have the info message but hostName-related warning should not appear
    expect(hostWarnings.every((w) => !w.message.includes('Configura'))).toBe(true);
  });

  it('warns when hostName not in available hosts', () => {
    const warnings = validateMapping(
      { refId: 'A', hostName: 'unknown-host', metrics: [] },
      staticAnalysis,
      ['server01', 'server02']
    );
    expect(warnings.some((w) => w.level === 'warning' && w.message.includes('unknown-host'))).toBe(true);
  });

  it('no host warning when hostName contains wildcard', () => {
    const warnings = validateMapping(
      { refId: 'A', hostName: '*server*', metrics: [] },
      staticAnalysis,
      ['server01']
    );
    expect(warnings.filter((w) => w.message.includes('no encontrado')).length).toBe(0);
  });

  it('warns when filterPattern used without hostField', () => {
    const warnings = validateMapping(
      {
        refId: 'A',
        hostName: 'srv',
        metrics: [{ field: 'cpu', filterPattern: '*PING*' }],
      },
      staticAnalysis,
      ['srv']
    );
    expect(warnings.some((w) => w.message.includes('filterPattern'))).toBe(true);
  });

  it('warns when hostField not found in data', () => {
    const warnings = validateMapping(
      {
        refId: 'B',
        hostName: 'BAMBOO',
        metrics: [{ field: 'summary.up', hostField: 'nonexistent_field' }],
      },
      dynamicAnalysis,
      ['BAMBOO']
    );
    expect(warnings.some((w) => w.message.includes('nonexistent_field'))).toBe(true);
  });

  it('returns empty array for valid static mapping', () => {
    const warnings = validateMapping(
      { refId: 'A', hostName: 'server01', metrics: [{ field: 'cpu' }] },
      staticAnalysis,
      ['server01']
    );
    expect(warnings.filter((w) => w.level === 'error' || w.level === 'warning')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getAvailableValuesForField
// ═══════════════════════════════════════════════════════════════

describe('getAvailableValuesForField', () => {
  it('returns label values from frames', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [makeField('val', 'number', [1], { 'monitor_name': 'BAMBOO' })],
      }),
      makeFrame({
        refId: 'A',
        fields: [makeField('val', 'number', [2], { 'monitor_name': 'PURPLE' })],
      }),
    ];
    const result = getAvailableValuesForField(series, 'A', 'monitor_name');
    expect(result).toContain('BAMBOO');
    expect(result).toContain('PURPLE');
  });

  it('returns column values when no labels match', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [makeField('host.name', 'string', ['srv01', 'srv02', 'srv01'])],
      }),
    ];
    const result = getAvailableValuesForField(series, 'A', 'host.name');
    expect(result).toEqual(['srv01', 'srv02']);
  });

  it('handles dot→underscore normalization in label keys', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [makeField('val', 'number', [1], { 'monitor_name': 'TEST' })],
      }),
    ];
    // Querying with dot notation should find underscore key
    const result = getAvailableValuesForField(series, 'A', 'monitor.name');
    expect(result).toContain('TEST');
  });

  it('uses frame.name as fallback', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        name: 'sonda BAMBOO',
        fields: [makeField('val', 'number', [1])],
      }),
    ];
    const result = getAvailableValuesForField(series, 'A', 'nonexistent');
    expect(result).toEqual(['sonda BAMBOO']);
  });

  it('ignores frames with different refId', () => {
    const series: DataFrame[] = [
      makeFrame({
        refId: 'A',
        fields: [makeField('host.name', 'string', ['srv01'])],
      }),
      makeFrame({
        refId: 'B',
        fields: [makeField('host.name', 'string', ['srv02'])],
      }),
    ];
    const result = getAvailableValuesForField(series, 'A', 'host.name');
    expect(result).toEqual(['srv01']);
    expect(result).not.toContain('srv02');
  });

  it('returns empty sorted array when no match', () => {
    const result = getAvailableValuesForField([], 'A', 'host');
    expect(result).toEqual([]);
  });
});

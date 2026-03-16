// ─────────────────────────────────────────────────────────────
// CellMappingsEditor.tsx – Editor de mapeos SVG → Host → Métricas
// Sin emojis. Todos los campos del índice ES via _field_caps.
// Decomposed: constants, MetricThresholdsMini, ValueMappingsMini,
//             MetricAssignmentRow and CellMappingCard extracted.
// ─────────────────────────────────────────────────────────────
import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Button, Input, Select, UnitPicker, useTheme2 } from '@grafana/ui';
import {
  CellMapping,
  MetricAssignment,
  MetricDataType,
  MetricThreshold,
  ValueMapping,
  AggregationType,
  VisibilityMode,
  SvgLayer,
} from '../types';
import { analyzeAllRefIds, matchPattern, validateMapping, getAvailableValuesForField } from '../utils/aliasResolver';
import type { RefIdAnalysis, MappingValidation, PatternMatchResult } from '../utils/aliasResolver';
import { normHost } from '../utils/hostMapping';
import { t } from '../i18n';
import { CellMappingCard, HOST_IDENTITY_FIELDS } from './editor';
import type { EditorStyles } from './editor';

type Props = StandardEditorProps<CellMapping[]>;

const GENERIC_VALUE_FIELDS = new Set(['_value', 'value']);

function isGenericValueField(field?: string): boolean {
  return GENERIC_VALUE_FIELDS.has((field || '').trim().toLowerCase());
}

function pickPreferredGroupByLabel(labels: string[]): string | undefined {
  if (!labels || labels.length === 0) return undefined;

  const hostLike = (l: string) => /(^|[._])host([._]|$)|hostname/i.test(l);
  const mountLike = (l: string) => /mount[_\.]?point|filesystem|disk|device|volume|path/i.test(l);

  const nonHost = labels.filter((l) => !hostLike(l));
  if (nonHost.length === 0) return labels[0];

  const mount = nonHost.find((l) => mountLike(l));
  return mount || nonHost[0];
}

function defaultAliasForGroupBy(groupByField?: string): string {
  const norm = (groupByField || '').toLowerCase();
  if (norm.includes('mount') || norm.includes('filesystem')) {
    return t('autoAlias.disk');
  }
  return '{{group}}';
}

function cloneMetricTemplate(metric: MetricAssignment): MetricAssignment {
  return {
    ...metric,
    thresholds: [...(metric.thresholds || [])],
    valueMappings: [...(metric.valueMappings || [])],
  };
}

function findExactHostForCellId(cellId: string, hosts: string[]): string | null {
  const cellNorm = normHost(cellId);
  if (!cellNorm) return null;

  for (const host of hosts) {
    const hostNorm = normHost(host);
    if (hostNorm === cellNorm) {
      return host;
    }
  }

  return null;
}

/** Auto-detect dataType based on field name patterns (Metricbeat conventions) */
function inferDataType(fieldName: string): MetricDataType | null {
  const f = (fieldName || '').toLowerCase();
  if (f.endsWith('.norm.pct') || f.endsWith('.used.pct')) return 'pct1';
  if (f.endsWith('.bytes')) return 'bytes';
  if (f.endsWith('.ms')) return 'ms';
  return null;
}

let _nextId = 1;
function genId(): string {
  return `cm_${Date.now()}_${_nextId++}`;
}

function extractCellIdsFromSvgText(src?: string): string[] {
  if (!src) return [];
  const ids = new Set<string>();
  const re = /data-cell-id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const id = match[1];
    if (id && id !== '0' && id !== '1') ids.add(id);
  }
  return Array.from(ids);
}

// ─── Component ──────────────────────────────────────────────

export const CellMappingsEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const fg = isDark ? '#fff' : '#000';
  const fgMuted = isDark ? '#ccc' : '#444';
  const borderAlpha = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const bgSubtle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const bgSubtleHl = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const mappings = value || [];
  const [pickMode, setPickMode] = useState<false | 'new' | string>(false);
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSearchFilter = useCallback((val: string) => {
    setSearchFilter(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedFilter(val), 200);
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoFillSummary, setAutoFillSummary] = useState<string | null>(null);
  const [importPending, setImportPending] = useState<{ mappings: CellMapping[]; extra: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'none' | 'host' | 'cellId' | 'label'>('none');

  // ── M2: Undo/Redo history ──
  const MAX_HISTORY = 20;
  const historyRef = useRef<CellMapping[][]>([]);
  const redoRef = useRef<CellMapping[][]>([]);
  const skipHistoryRef = useRef(false);
  const prevMappingsRef = useRef<CellMapping[]>(mappings);

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      prevMappingsRef.current = mappings;
      return;
    }
    if (prevMappingsRef.current !== mappings) {
      historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), prevMappingsRef.current];
      redoRef.current = [];
      prevMappingsRef.current = mappings;
    }
  }, [mappings]);

  const undo = useCallback(() => {
    const stack = historyRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    historyRef.current = [...stack];
    redoRef.current = [...redoRef.current, mappings];
    skipHistoryRef.current = true;
    onChange(prev);
  }, [onChange, mappings]);

  const redo = useCallback(() => {
    const stack = redoRef.current;
    if (stack.length === 0) return;
    const next = stack.pop()!;
    redoRef.current = [...stack];
    historyRef.current = [...historyRef.current, mappings];
    skipHistoryRef.current = true;
    onChange(next);
  }, [onChange, mappings]);

  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    const el = editorRef.current;
    if (el) {
      el.addEventListener('keydown', handler);
      return () => el.removeEventListener('keydown', handler);
    }
    return;
  }, [undo, redo]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const lastSelectedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mappingsRef = useRef(mappings);
  mappingsRef.current = mappings;

  // ── M4: Sync pick mode via events (no global state) ──
  useEffect(() => {
    if (pickMode) {
      window.dispatchEvent(new CustomEvent('svgflow-pick-start'));
    } else {
      window.dispatchEvent(new CustomEvent('svgflow-pick-cancel'));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('svgflow-pick-cancel'));
    };
  }, [pickMode]);

  // ── Listen for SVG click events ──
  useEffect(() => {
    function onCellSelected(e: Event) {
      const detail = (e as CustomEvent).detail as { cellId: string; resolvedHost: string };
      if (!detail?.cellId) return;

      const { cellId, resolvedHost } = detail;
      const currentPick = pickMode;

      setPickMode(false);
      setLastSelected(cellId);
      if (lastSelectedTimer.current) clearTimeout(lastSelectedTimer.current);
      lastSelectedTimer.current = setTimeout(() => setLastSelected(null), 3000);

      const current = mappingsRef.current;

      if (typeof currentPick === 'string' && currentPick !== 'new') {
        const updated = current.map((m) =>
          m.id === currentPick ? { ...m, cellId } : m
        );
        onChange(updated);
        return;
      }

      if (current.find((m) => m.cellId === cellId)) return;
      onChange([...current, {
        id: genId(),
        cellId,
        hostName: resolvedHost || '',
        metrics: [],
        label: '',
      }]);
    }

    window.addEventListener('svgflow-cell-selected', onCellSelected);
    return () => {
      window.removeEventListener('svgflow-cell-selected', onCellSelected);
      if (lastSelectedTimer.current) clearTimeout(lastSelectedTimer.current);
    };
  }, [onChange, pickMode]);

  // ── DrawIO integration: auto-create stubs for new cell IDs ──
  useEffect(() => {
    function onNewCells(e: Event) {
      const { cellIds } = (e as CustomEvent).detail as { cellIds: string[] };
      if (!cellIds || cellIds.length === 0) return;
      const current: CellMapping[] = value || [];
      const existingIds = new Set(current.map(m => m.cellId));
      const newMappings = cellIds
        .filter(id => !existingIds.has(id))
        .map(cellId => ({
          id: genId(),
          cellId,
          hostName: '',
          metrics: [],
          label: '',
        }));
      if (newMappings.length > 0) {
        onChange([...current, ...newMappings]);
      }
    }
    window.addEventListener('svgflow-new-cells', onNewCells);
    return () => window.removeEventListener('svgflow-new-cells', onNewCells);
  }, [value, onChange]);

  // ── Field options from DataFrame ──
  const fieldOptions = useMemo<Array<SelectableValue<string>>>(() => {
    const opts: Array<SelectableValue<string>> = [];
    const seen = new Set<string>();

    if (context.data) {
      for (const frame of context.data) {
        for (const field of frame.fields) {
          if (field.name && !seen.has(field.name)) {
            seen.add(field.name);
            const tag = field.type === 'number' ? '[N]'
              : field.type === 'time' ? '[D]'
              : field.type === 'boolean' ? '[B]'
              : field.type === 'string' ? '[S]'
              : '[?]';
            opts.push({ label: `${tag} ${field.name}`, value: field.name, description: field.type });
          }
        }
      }
    }
    opts.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return opts;
  }, [context.data]);

  // ── RefId analysis ──
  const refIdAnalyses = useMemo<Map<string, RefIdAnalysis>>(() => {
    if (!context.data) return new Map();
    return analyzeAllRefIds(context.data);
  }, [context.data]);

  // ── RefId options ──
  const refIdOptions = useMemo<Array<SelectableValue<string>>>(() => {
    const ids = new Set<string>();
    if (context.data) {
      for (const frame of context.data) {
        if (frame.refId) ids.add(frame.refId);
      }
    }
    const opts: Array<SelectableValue<string>> = [
      { label: 'All queries', value: '', description: 'Usa datos de todas las queries' },
    ];
    for (const id of Array.from(ids).sort()) {
      const analysis = refIdAnalyses.get(id);
      if (analysis?.isDynamic) {
        const groupInfo = analysis.groupingLabels.length > 0
          ? analysis.groupingLabels.join(', ')
          : 'multiple frames';
        opts.push({
          label: `Query ${id}  [Dynamic: ${analysis.frameCount} series]`,
          value: id,
          description: `Agrupado por: ${groupInfo} (${analysis.expandedValues.length} valores)`,
        });
      } else {
        opts.push({
          label: `Query ${id}`,
          value: id,
          description: analysis ? `${analysis.frameCount} frame, ${analysis.fieldNames.length} fields` : `refId: ${id}`,
        });
      }
    }
    return opts;
  }, [context.data, refIdAnalyses]);

  // ── Field options filtered by refId ──
  const getFieldOptionsForRefId = useCallback((refId?: string): Array<SelectableValue<string>> => {
    if (!refId || !context.data) return fieldOptions;

    const analysis = refIdAnalyses.get(refId);
    const isDynamic = analysis?.isDynamic;

    const opts: Array<SelectableValue<string>> = [];
    const seen = new Set<string>();

    const fieldNamesByFrame: string[][] = [];
    const numericFieldsByFrame: string[][] = [];
    const labelKeys = new Set<string>();

    for (const frame of context.data) {
      if (frame.refId !== refId) continue;
      const frameFields: string[] = [];
      const frameNumeric: string[] = [];
      for (const field of frame.fields) {
        if (field.name) {
          frameFields.push(field.name);
          if (field.type === 'number') frameNumeric.push(field.name);
        }
        if (field.labels) {
          for (const lk of Object.keys(field.labels)) {
            labelKeys.add(lk);
          }
        }
      }
      fieldNamesByFrame.push(frameFields);
      numericFieldsByFrame.push(frameNumeric);
    }

    if (isDynamic && fieldNamesByFrame.length > 1) {
      const allFieldNames = new Set(fieldNamesByFrame[0]);
      for (let i = 1; i < fieldNamesByFrame.length; i++) {
        const set = new Set(fieldNamesByFrame[i]);
        for (const name of allFieldNames) {
          if (!set.has(name)) allFieldNames.delete(name);
        }
      }

      const allNumericNames = new Set<string>();
      for (const nf of numericFieldsByFrame) {
        for (const n of nf) allNumericNames.add(n);
      }
      const varyingNumeric = new Set<string>();
      for (const name of allNumericNames) {
        if (!allFieldNames.has(name)) varyingNumeric.add(name);
      }

      if (varyingNumeric.size > 0) {
        const sampleNames = Array.from(varyingNumeric).slice(0, 3).join(', ');
        const more = varyingNumeric.size > 3 ? ` +${varyingNumeric.size - 3}` : '';
        opts.push({
          label: '[N] _value  (valor agregado por serie)',
          value: '_value',
          description: `Series dinámicas por ${analysis?.groupingLabels.join(', ') || 'labels'}: ${sampleNames}${more}`,
        });
        seen.add('_value');
      }

      for (const frame of context.data) {
        if (frame.refId !== refId) continue;
        for (const field of frame.fields) {
          if (!field.name || seen.has(field.name)) continue;
          if (varyingNumeric.has(field.name)) continue;
          seen.add(field.name);
          const tag = field.type === 'number' ? '[N]'
            : field.type === 'time' ? '[D]'
            : field.type === 'boolean' ? '[B]'
            : field.type === 'string' ? '[S]'
            : '[?]';
          const isGenericNumericValue = field.type === 'number' && isGenericValueField(field.name);
          opts.push({
            label: isGenericNumericValue ? `${tag} ${field.name}  (valor agregado)` : `${tag} ${field.name}`,
            value: field.name,
            description: isGenericNumericValue
              ? `Valor final por serie dinámica (${analysis?.groupingLabels.join(', ') || 'labels'})`
              : field.type,
          });
        }
        break;
      }

      for (const lk of Array.from(labelKeys).sort()) {
        if (!seen.has(lk)) {
          seen.add(lk);
          opts.push({
            label: `[L] ${lk}`,
            value: lk,
            description: 'Label key (from field.labels)',
          });
        }
      }
    } else {
      for (const frame of context.data) {
        if (frame.refId !== refId) continue;
        for (const field of frame.fields) {
          if (field.name && !seen.has(field.name)) {
            seen.add(field.name);
            const tag = field.type === 'number' ? '[N]'
              : field.type === 'time' ? '[D]'
              : field.type === 'boolean' ? '[B]'
              : field.type === 'string' ? '[S]'
              : '[?]';
            opts.push({ label: `${tag} ${field.name}`, value: field.name, description: field.type });
          }
        }
      }
    }

    opts.sort((a, b) => {
      const aIsValue = a.value === '_value' ? 0 : 1;
      const bIsValue = b.value === '_value' ? 0 : 1;
      if (aIsValue !== bIsValue) return aIsValue - bIsValue;
      return (a.label || '').localeCompare(b.label || '');
    });
    return opts;
  }, [context.data, fieldOptions, refIdAnalyses]);

  // ── Host options ──
  const hostOptions = useMemo<Array<SelectableValue<string>>>(() => {
    const hosts = new Set<string>();
    const hfn = (context.options?.hostField as string) || 'host.name';
    const lookupFields = new Set([hfn, ...HOST_IDENTITY_FIELDS]);
    if (context.data) {
      for (const frame of context.data) {
        for (const field of frame.fields) {
          if (lookupFields.has(field.name)) {
            for (let i = 0; i < field.values.length; i++) {
              const v = field.values[i];
              if (v && typeof v === 'string') hosts.add(v);
            }
          }
        }
        for (const field of frame.fields) {
          if (field.labels) {
            for (const lf of lookupFields) {
              const norm = lf.replace(/\./g, '_');
              const val = field.labels[lf] || field.labels[norm];
              if (val) hosts.add(val);
            }
          }
        }
        if (frame.name) hosts.add(frame.name);
      }
    }
    return Array.from(hosts).sort().map((h) => ({ label: h, value: h }));
  }, [context.data, context.options?.hostField]);

  // ── Host options filtered by refId ──
  const getHostOptionsForMapping = useCallback((refId?: string, customHostField?: string): Array<SelectableValue<string>> => {
    if (!context.data) return hostOptions;
    if (!refId && !customHostField) return hostOptions;
    const hosts = new Set<string>();
    const hfn = customHostField || (context.options?.hostField as string) || 'host.name';
    const lookupFields = customHostField ? [customHostField] : new Set([hfn, ...HOST_IDENTITY_FIELDS]);
    const lookupSet = lookupFields instanceof Set ? lookupFields : new Set(lookupFields);

    for (const frame of context.data) {
      if (refId && frame.refId !== refId) continue;
      for (const field of frame.fields) {
        if (lookupSet.has(field.name)) {
          for (let i = 0; i < field.values.length; i++) {
            const v = field.values[i];
            if (v && typeof v === 'string') hosts.add(v);
          }
        }
      }
      for (const field of frame.fields) {
        if (field.labels) {
          for (const lf of lookupSet) {
            const norm = lf.replace(/\./g, '_');
            const val = field.labels[lf] || field.labels[norm];
            if (val) hosts.add(val);
          }
        }
      }
      if (frame.name) hosts.add(frame.name);
    }
    return Array.from(hosts).sort().map((h) => ({ label: h, value: h }));
  }, [context.data, context.options?.hostField, hostOptions, refIdAnalyses]);

  // ── Filter pattern suggestions ──
  const getFilterPatternSuggestions = useCallback((refId?: string, hostField?: string): Array<SelectableValue<string>> => {
    if (!context.data) return [];
    const allValues = new Set<string>();
    const refIds = refId ? [refId] : Array.from(refIdAnalyses.keys());

    for (const rid of refIds) {
      const analysis = refIdAnalyses.get(rid);
      if (!analysis) continue;
      const hf = hostField || (analysis.isDynamic ? analysis.groupingLabels[0] : '') || '';
      let values: string[];
      if (hf) {
        values = getAvailableValuesForField(context.data, rid, hf);
      } else {
        values = [...analysis.frameNames];
      }
      for (const v of values) allValues.add(v);
    }
    return Array.from(allValues).sort().map((v) => ({ label: v, value: v }));
  }, [context.data, refIdAnalyses]);

  // ── Pattern match info ──
  const getPatternMatchInfo = useCallback((refId: string | undefined, hostField: string | undefined, pattern: string | undefined): PatternMatchResult | null => {
    if (!pattern?.trim() || !refId || !context.data) return null;
    const hfield = hostField || (context.options?.hostField as string) || 'host.name';
    const available = getAvailableValuesForField(context.data, refId, hfield);
    if (available.length === 0) return null;
    return matchPattern(available, pattern);
  }, [context.data, context.options?.hostField]);

  // ── Validation ──
  const getMappingWarnings = useCallback((m: CellMapping): MappingValidation[] => {
    const allHosts = Array.from(
      new Set(
        (context.data || []).flatMap((frame) => {
          const hfn = (context.options?.hostField as string) || 'host.name';
          const hf = frame.fields.find(
            (f) => f.name === hfn || f.name === 'host.name' || f.name === 'host'
          );
          if (!hf) return [];
          return hf.values.filter((v: unknown) => v && typeof v === 'string') as string[];
        })
      )
    );
    return validateMapping(m, refIdAnalyses, allHosts, (context.options?.hostField as string) || 'host.name');
  }, [context.data, context.options?.hostField, refIdAnalyses]);

  // ── Cell ID options from SVG ──
  const cellIdOptions = useMemo<Array<SelectableValue<string>>>(() => {
    const ids = new Set<string>();
    const svgSrc = context.options?.svgSource as string | undefined;
    for (const id of extractCellIdsFromSvgText(svgSrc)) {
      ids.add(id);
    }

    // Include IDs from overlay layers as well
    const layers = (context.options?.layers as SvgLayer[] | undefined) || [];
    for (const layer of layers) {
      for (const id of extractCellIdsFromSvgText(layer?.svgSource)) {
        ids.add(id);
      }
    }

    return Array.from(ids).sort().map((id) => ({ label: id, value: id }));
  }, [context.options?.svgSource, context.options?.layers]);

  // ── Mapping CRUD ──
  const addMapping = useCallback(() => {
    onChange([...mappings, { id: genId(), cellId: '', hostName: '', metrics: [], label: '' }]);
  }, [mappings, onChange]);

  const removeMapping = useCallback(
    (id: string) => onChange(mappings.filter((m) => m.id !== id)),
    [mappings, onChange]
  );

  const updateMapping = useCallback(
    (id: string, patch: Partial<CellMapping>) => {
      onChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    [mappings, onChange]
  );

  // ── Metric CRUD ──
  const addMetric = useCallback(
    (mappingId: string) => {
      onChange(
        mappings.map((m) =>
          m.id === mappingId
            ? { ...m, metrics: [...m.metrics, { field: '', alias: '', dataType: 'auto' as MetricDataType, thresholds: [] }] }
            : m
        )
      );
    },
    [mappings, onChange]
  );

  const removeMetric = useCallback(
    (mappingId: string, idx: number) => {
      onChange(
        mappings.map((m) =>
          m.id === mappingId ? { ...m, metrics: m.metrics.filter((_, i) => i !== idx) } : m
        )
      );
    },
    [mappings, onChange]
  );

  const removeMetrics = useCallback(
    (mappingId: string, indices: number[]) => {
      const indexSet = new Set(indices);
      onChange(
        mappings.map((m) =>
          m.id === mappingId ? { ...m, metrics: m.metrics.filter((_, i) => !indexSet.has(i)) } : m
        )
      );
    },
    [mappings, onChange]
  );

  const updateMetric = useCallback(
    (mappingId: string, idx: number, patch: Partial<MetricAssignment>) => {
      onChange(
        mappings.map((m) =>
          m.id === mappingId
            ? {
                ...m,
                metrics: m.metrics.map((mt, i) => {
                  if (i !== idx) return mt;

                  const next: MetricAssignment = { ...mt, ...patch };
                  const effectiveRefId = next.refId || m.refId;
                  const analysis = effectiveRefId ? refIdAnalyses.get(effectiveRefId) : undefined;

                  const shouldAutoSuggest =
                    analysis?.isDynamic &&
                    isGenericValueField(next.field) &&
                    (patch.field !== undefined || patch.refId !== undefined);

                  if (shouldAutoSuggest) {
                    if (!next.groupByField) {
                      next.groupByField = pickPreferredGroupByLabel(analysis?.groupingLabels || []);
                    }

                    if (!next.alias && patch.alias === undefined) {
                      next.alias = defaultAliasForGroupBy(next.groupByField);
                    }
                  }

                  return next;
                }),
              }
            : m
        )
      );
    },
    [mappings, onChange, refIdAnalyses]
  );

  // ── Threshold CRUD ──
  const replaceThresholds = useCallback(
    (mappingId: string, metricIdx: number, newThresholds: MetricThreshold[]) => {
      onChange(
        mappings.map((m) => {
          if (m.id !== mappingId) return m;
          return {
            ...m,
            metrics: m.metrics.map((mt, i) =>
              i === metricIdx ? { ...mt, thresholds: newThresholds } : mt
            ),
          };
        })
      );
    },
    [mappings, onChange]
  );

  // ── Value Mappings ──
  const replaceValueMappings = useCallback(
    (mappingId: string, metricIdx: number, newMappings: ValueMapping[]) => {
      onChange(
        mappings.map((m) => {
          if (m.id !== mappingId) return m;
          return {
            ...m,
            metrics: m.metrics.map((mt, i) =>
              i === metricIdx ? { ...mt, valueMappings: newMappings } : mt
            ),
          };
        })
      );
    },
    [mappings, onChange]
  );

  // ── Autodiscover ──
  // P4: Use generic field names; actual field detection happens via metricsConfig
  const AUTO_METRICS: MetricAssignment[] = [
    { field: 'system.cpu.total.norm.pct', alias: 'CPU', dataType: 'percent', thresholds: [
      { value: 80, color: '#FF9830', op: '>=' },
      { value: 90, color: '#F2495C', op: '>=' },
    ] },
    { field: 'system.memory.actual.used.pct', alias: 'RAM', dataType: 'percent', thresholds: [
      { value: 80, color: '#FF9830', op: '>=' },
      { value: 90, color: '#F2495C', op: '>=' },
    ] },
    { field: 'system.filesystem.used.pct', alias: t('Disk Avg'), dataType: 'percent', thresholds: [
      { value: 80, color: '#FF9830', op: '>=' },
      { value: 90, color: '#F2495C', op: '>=' },
    ] },
    { field: 'system.filesystem.used.pct', alias: t('Disks'), dataType: 'percentunit', groupByField: 'system.filesystem.mount_point', thresholds: [
      { value: 80, color: '#FF9830', op: '>=' },
      { value: 90, color: '#F2495C', op: '>=' },
    ] },
  ];

  const autodiscover = useCallback(
    (mappingId: string) => {
      onChange(
        mappings.map((m) => {
          if (m.id !== mappingId) return m;
          const existing = new Set(m.metrics.map((mt) => mt.field));
          const toAdd = AUTO_METRICS.filter((am) => !existing.has(am.field));
          return toAdd.length > 0 ? { ...m, metrics: [...m.metrics, ...toAdd] } : m;
        })
      );
    },
    [mappings, onChange]
  );

  const autodiscoverAll = useCallback(() => {
    onChange(
      mappings.map((m) => {
        const existing = new Set(m.metrics.map((mt) => mt.field));
        const toAdd = AUTO_METRICS.filter((am) => !existing.has(am.field));
        return toAdd.length > 0 ? { ...m, metrics: [...m.metrics, ...toAdd] } : m;
      })
    );
  }, [mappings, onChange]);

  const autoFillMappings = useCallback(() => {
    const cellIds = cellIdOptions.map((o) => o.value).filter((v): v is string => !!v);
    const hosts = hostOptions.map((o) => o.value).filter((v): v is string => !!v);

    if (cellIds.length === 0) {
      setAutoFillSummary(t('autofill.noCellIds'));
      return;
    }
    if (hosts.length === 0) {
      setAutoFillSummary(t('autofill.noHosts'));
      return;
    }

    const byCell = new Map<string, CellMapping>();
    for (const m of mappings) {
      if (m.cellId) byCell.set(m.cellId, m);
    }

    const nextMappings: CellMapping[] = [];
    let linked = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const cellId of cellIds) {
      const matchedHost = findExactHostForCellId(cellId, hosts);

      if (!matchedHost) {
        skipped++;
        continue;
      }

      const existing = byCell.get(cellId);

      const base = existing || {
        id: genId(),
        cellId,
        hostName: '',
        metrics: [],
        label: '',
      };

      const existingFields = new Set(base.metrics.map((mt) => mt.field));
      const metrics = [...base.metrics];
      for (const tpl of AUTO_METRICS) {
        if (!existingFields.has(tpl.field)) {
          metrics.push(cloneMetricTemplate(tpl));
        }
      }

      const next: CellMapping = {
        ...base,
        cellId,
        hostName: matchedHost,
        metrics,
      };

      if (existing) updated++; else created++;
      linked++;
      nextMappings.push(next);
    }

    // Keep manual mappings without cellId
    for (const m of mappings) {
      if (!m.cellId) {
        nextMappings.push(m);
      }
    }

    onChange(nextMappings);
    setAutoFillSummary(
      t('autofill.summary', { linked: String(linked), total: String(cellIds.length), created: String(created), updated: String(updated), skipped: String(skipped) })
    );
  }, [cellIdOptions, hostOptions, mappings, onChange]);

  // ── Auto-suggest for query ──
  const autoSuggestForQuery = useCallback(
    (mappingId: string, refId: string) => {
      if (!refId || !context.data) return;
      const analysis = refIdAnalyses.get(refId);
      const frames = context.data.filter((f) => f.refId === refId);
      if (frames.length === 0) return;

      onChange(
        mappings.map((m) => {
          if (m.id !== mappingId) return m;
          if (m.metrics.length > 0) return { ...m, refId };

          if (analysis?.isDynamic) {
            const groupLabel = analysis.groupingLabels[0] || '';
            // Don't auto-expand all hosts — let the user add them manually
            return {
              ...m,
              refId,
              hostName: '',
              hostField: groupLabel || undefined,
              metrics: [],
            };
          } else {
            const frameName = frames[0]?.name || '';
            const numericFields = frames[0]?.fields.filter((f) => f.type === 'number') || [];
            const fieldName = numericFields.length === 1 ? '_value' : (numericFields[0]?.name || '_value');
            return {
              ...m,
              refId,
              hostName: frameName,
              metrics: [{
                field: fieldName,
                alias: frameName || refId,
                dataType: 'auto' as MetricDataType,
                thresholds: [],
              }],
            };
          }
        })
      );
    },
    [mappings, onChange, context.data, refIdAnalyses]
  );

  // ── Add metric from query ──
  const addMetricFromQuery = useCallback(
    (mappingId: string, refId: string) => {
      if (!refId || !context.data) return;
      const analysis = refIdAnalyses.get(refId);
      const frames = context.data.filter((f) => f.refId === refId);
      if (frames.length === 0) return;

      onChange(
        mappings.map((m) => {
          if (m.id !== mappingId) return m;

          if (analysis?.isDynamic) {
            const groupLabel = pickPreferredGroupByLabel(analysis.groupingLabels) || '';
            // Don't auto-expand all hosts — add a single blank metric template
            const newMetric: MetricAssignment = {
              field: '_value',
              alias: defaultAliasForGroupBy(groupLabel),
              dataType: 'auto' as MetricDataType,
              thresholds: [],
              groupByField: groupLabel || undefined,
              filterPattern: '',
              refId,
            };
            return { ...m, metrics: [...m.metrics, newMetric] };
          } else {
            const frameName = frames[0]?.name || '';
            const numericFields = frames[0]?.fields.filter((f) => f.type === 'number') || [];
            const fieldName = numericFields.length === 1 ? '_value' : (numericFields[0]?.name || '_value');
            return {
              ...m,
              metrics: [...m.metrics, {
                field: fieldName,
                alias: frameName || refId,
                dataType: 'auto' as MetricDataType,
                thresholds: [],
                refId,
              }],
            };
          }
        })
      );
    },
    [mappings, onChange, context.data, refIdAnalyses]
  );

  // ── Collapse/Expand all ──
  const collapseAll = useCallback(() => {
    setCollapsed(new Set(mappings.map((m) => m.id)));
  }, [mappings]);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  // ── Clone handler ──
  const cloneMapping = useCallback((m: CellMapping) => {
    const clone: CellMapping = {
      ...m,
      id: genId(),
      cellId: '',
      label: m.label ? `${m.label} ${t('clone.suffix')}` : '',
    };
    onChange([...mappings, clone]);
  }, [mappings, onChange]);

  // ── Selection handlers ──
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const q = searchFilter.toLowerCase();
    const visible = mappings.filter((m) => {
      if (!q) return true;
      return (m.hostName || '').toLowerCase().includes(q)
        || (m.cellId || '').toLowerCase().includes(q)
        || (m.label || '').toLowerCase().includes(q);
    });
    setSelected(new Set(visible.map((m) => m.id)));
  }, [mappings, searchFilter]);

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    onChange(mappings.filter((m) => !selected.has(m.id)));
    setSelected(new Set());
  }, [mappings, onChange, selected]);

  const cloneSelected = useCallback(() => {
    if (selected.size === 0) return;
    const clones = mappings
      .filter((m) => selected.has(m.id))
      .map((m) => ({
        ...m,
        id: genId(),
        cellId: '',
        label: m.label ? `${m.label} ${t('clone.suffix')}` : '',
      }));
    onChange([...mappings, ...clones]);
    setSelected(new Set());
  }, [mappings, onChange, selected]);

  const filteredMappings = useMemo(() => {
    let result = mappings.filter((m) => {
      if (!debouncedFilter) return true;
      const q = debouncedFilter.toLowerCase();
      return (m.hostName || '').toLowerCase().includes(q)
        || (m.cellId || '').toLowerCase().includes(q)
        || (m.label || '').toLowerCase().includes(q);
    });
    if (sortBy !== 'none') {
      result = [...result].sort((a, b) => {
        const av = (sortBy === 'host' ? a.hostName : sortBy === 'cellId' ? a.cellId : a.label) || '';
        const bv = (sortBy === 'host' ? b.hostName : sortBy === 'cellId' ? b.cellId : b.label) || '';
        return av.localeCompare(bv);
      });
    }
    return result;
  }, [mappings, debouncedFilter, sortBy]);

  const exportSelected = useCallback(() => {
    const toExport = selected.size > 0
      ? mappings.filter((m) => selected.has(m.id))
      : searchFilter
        ? filteredMappings
        : mappings;
    const json = JSON.stringify(toExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cell-mappings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mappings, selected, searchFilter, filteredMappings]);

  /** Export full panel config envelope (cellMappings + advanced JSON settings) */
  const exportGlobalConfig = useCallback(() => {
    const opts = context.options as Record<string, unknown> | undefined;
    const envelope: Record<string, unknown> = {
      _svgFlowVersion: '1.3.0',
      _exportedAt: new Date().toISOString(),
      cellMappings: mappings,
    };
    if (opts) {
      if (opts.svgSource) envelope.svgSource = opts.svgSource;
      if (opts.svgUrl) envelope.svgUrl = opts.svgUrl;
      if (opts.layers) envelope.layers = opts.layers;
      if (opts.debugMode !== undefined) envelope.debugMode = opts.debugMode;
      if (opts.hostField) envelope.hostField = opts.hostField;
      if (opts.clickUrlTemplate) envelope.clickUrlTemplate = opts.clickUrlTemplate;
      if (opts.hostMappingJson) envelope.hostMappingJson = opts.hostMappingJson;
      if (opts.customThresholdsJson) envelope.customThresholdsJson = opts.customThresholdsJson;
      if (opts.metricsConfigJson) envelope.metricsConfigJson = opts.metricsConfigJson;
      if (opts.globalThresholds) envelope.globalThresholds = opts.globalThresholds;
      if (opts.tooltipConfig) envelope.tooltipConfig = opts.tooltipConfig;
    }
    const json = JSON.stringify(envelope, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `svgflow-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mappings, context.options]);

  const importMappings = useCallback(() => {
    const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > MAX_IMPORT_SIZE) {
        setImportError(t('import.tooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }));
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);

          // Detect envelope format (has _svgFlowVersion key)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._svgFlowVersion) {
            const envCm = Array.isArray(parsed.cellMappings) ? parsed.cellMappings : [];
            const imported: CellMapping[] = envCm
              .filter((m: any) => m && typeof m.cellId === 'string')
              .map((m: any) => ({ ...m, id: genId() }));
            // Collect extra keys the user needs to paste manually
            const extras: string[] = [];
            for (const key of [
              'svgSource', 'svgUrl', 'layers', 'debugMode',
              'hostField', 'clickUrlTemplate',
              'hostMappingJson', 'customThresholdsJson', 'metricsConfigJson',
            ]) {
              if (parsed[key]) extras.push(key);
            }
            if (parsed.globalThresholds) extras.push('globalThresholds');
            if (parsed.tooltipConfig) extras.push('tooltipConfig');
            if (imported.length > 0) {
              setImportPending({ mappings: imported, extra: extras });
            }
            return;
          }

          // Legacy: plain CellMapping[] array
          if (!Array.isArray(parsed)) return;
          const imported: CellMapping[] = parsed
            .filter((m: any) => m && typeof m.cellId === 'string')
            .map((m: any) => ({ ...m, id: genId() }));
          if (imported.length > 0) {
            setImportPending({ mappings: imported, extra: [] });
          }
        } catch (err) {
          setImportError(`${t('import.error')} ${err instanceof Error ? err.message : t('import.invalidJson')}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  /** Apply pending import: merge (append) or replace */
  const applyImport = useCallback((mode: 'merge' | 'replace') => {
    if (!importPending) return;
    if (mode === 'replace') {
      onChange(importPending.mappings);
    } else {
      onChange([...mappings, ...importPending.mappings]);
    }
    setImportPending(null);
  }, [importPending, mappings, onChange]);

  const setDataTypeForSelected = useCallback((dt: MetricDataType) => {
    if (selected.size === 0) return;
    onChange(
      mappings.map((m) => {
        if (!selected.has(m.id)) return m;
        return { ...m, metrics: m.metrics.map((mt) => ({ ...mt, dataType: dt })) };
      })
    );
  }, [mappings, onChange, selected]);

  // ── Styles ──
  const S: EditorStyles & Record<string, React.CSSProperties> = {
    card: {
      background: bgSubtle,
      border: `1px solid ${borderAlpha}`,
      borderRadius: 6,
      padding: 8,
      marginBottom: 4,
    },
    cardHl: {
      background: bgSubtleHl,
      border: `1px solid ${fg}`,
      borderRadius: 6,
      padding: 8,
      marginBottom: 4,
    },
    metricRow: {
      display: 'flex',
      gap: 4,
      alignItems: 'flex-start',
      marginBottom: 4,
      marginLeft: 4,
      padding: '4px 0 4px 8px',
      borderLeft: `2px solid ${borderAlpha}`,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    badge: { fontSize: 11, fontWeight: 600, color: fg },
    stats: {
      display: 'flex', gap: 12, fontSize: 11, color: fgMuted, padding: '2px 0',
      borderBottom: `1px solid ${borderAlpha}`, marginBottom: 4, flexWrap: 'wrap' as const,
    },
    pickBanner: {
      padding: '6px 12px', background: bgSubtle,
      border: `1px solid ${fg}`, borderRadius: 6,
      fontSize: 12, color: fg, textAlign: 'center' as const,
    },
    selectedBanner: {
      padding: '5px 12px', background: bgSubtleHl,
      border: `1px solid ${fg}`, borderRadius: 6,
      fontSize: 12, color: fg, textAlign: 'center' as const, fontWeight: 600,
    },
    empty: {
      padding: 16, textAlign: 'center' as const, color: fgMuted, fontSize: 12,
      border: `1px dashed ${borderAlpha}`, borderRadius: 6,
    },
  };

  const pickLabel =
    pickMode === 'new' ? t('pickMode.new') :
    typeof pickMode === 'string' ? t('pickMode.reassign') :
    '';

  const defaultHostField = (context.options?.hostField as string) || 'host.name';

  const coverageSummary = useMemo(() => {
    const svgIds = new Set(cellIdOptions.map((o) => o.value).filter((v): v is string => !!v));
    const mappedIds = mappings
      .map((m) => (m.cellId || '').trim())
      .filter((id) => !!id);
    const mappedUnique = new Set(mappedIds);

    const duplicateCountById = new Map<string, number>();
    for (const id of mappedIds) {
      duplicateCountById.set(id, (duplicateCountById.get(id) || 0) + 1);
    }
    const duplicatedIds = Array.from(duplicateCountById.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const orphanIds = Array.from(mappedUnique)
      .filter((id) => !svgIds.has(id))
      .sort();

    const unmappedIds = Array.from(svgIds)
      .filter((id) => !mappedUnique.has(id))
      .sort();

    const totalCells = svgIds.size;
    const mappedCells = Array.from(svgIds).filter((id) => mappedUnique.has(id)).length;
    const coveragePct = totalCells > 0 ? Math.round((mappedCells / totalCells) * 100) : 0;

    return {
      totalCells,
      mappedCells,
      unmappedCount: unmappedIds.length,
      orphanCount: orphanIds.length,
      duplicatedCount: duplicatedIds.length,
      duplicatedIds,
      orphanIds,
      coveragePct,
    };
  }, [cellIdOptions, mappings]);

  return (
    <div ref={editorRef} tabIndex={-1} style={{ display: 'flex', flexDirection: 'column', gap: 6, outline: 'none' }}>
      {/* Quick start */}
      <div style={{
        fontSize: 11,
        color: fgMuted,
        background: bgSubtle,
        border: `1px solid ${borderAlpha}`,
        borderRadius: 6,
        padding: '6px 8px',
        lineHeight: 1.45,
      }}>
        <strong style={{ color: fg }}>{t('quickStart.title')}</strong> {t('quickStart')}
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <span>Cells: {cellIdOptions.length}</span>
        <span>Hosts: {hostOptions.length}</span>
        <span>Fields: {fieldOptions.length}</span>
        <span>Queries: {refIdOptions.length - 1}</span>
      </div>

      {/* Coverage + validation summary */}
      <div style={{
        fontSize: 11,
        color: fg,
        background: bgSubtle,
        border: `1px solid ${borderAlpha}`,
        borderRadius: 6,
        padding: '6px 8px',
        lineHeight: 1.45,
      }}>
        <strong>Coverage:</strong> {coverageSummary.mappedCells}/{coverageSummary.totalCells} ({coverageSummary.coveragePct}%)
        {' · '}<strong>{t('coverage.unmapped')}</strong> {coverageSummary.unmappedCount}
        {' · '}<strong>{t('coverage.orphan')}</strong> {coverageSummary.orphanCount}
        {' · '}<strong>{t('coverage.duplicated')}</strong> {coverageSummary.duplicatedCount}

        {coverageSummary.duplicatedIds.length > 0 && (
          <div style={{ marginTop: 4, color: fgMuted }}>
            {t('coverage.duplicated')} {coverageSummary.duplicatedIds.slice(0, 8).map((d) => `${d.id} (x${d.count})`).join(', ')}
            {coverageSummary.duplicatedIds.length > 8 ? ' ...' : ''}
          </div>
        )}

        {coverageSummary.orphanIds.length > 0 && (
          <div style={{ marginTop: 2, color: fgMuted }}>
            {t('coverage.orphan')} {coverageSummary.orphanIds.slice(0, 8).join(', ')}
            {coverageSummary.orphanIds.length > 8 ? ' ...' : ''}
          </div>
        )}
      </div>

      {autoFillSummary && (
        <div style={{
          fontSize: 11,
          color: fg,
          background: bgSubtle,
          border: `1px solid ${borderAlpha}`,
          borderRadius: 6,
          padding: '6px 8px',
          lineHeight: 1.45,
        }}>
          {autoFillSummary}
        </div>
      )}

      {/* Pick banner */}
      {pickMode && (
        <div style={S.pickBanner}>
          {pickLabel} &mdash;{' '}
          <Button size="sm" variant="secondary" fill="text" onClick={() => setPickMode(false)}>
            {t('btn.cancel')}
          </Button>
        </div>
      )}

      {/* Selected feedback */}
      {lastSelected && (
        <div style={S.selectedBanner}>{t('btn.assigned')} {lastSelected}</div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button icon="plus" variant="secondary" size="sm" onClick={addMapping} style={{ flex: '1 1 170px', minWidth: 0 }}>
          {t('btn.newMapping')}
        </Button>
        <Button
          icon="crosshair"
          variant={pickMode === 'new' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setPickMode(pickMode === 'new' ? false : 'new')}
          style={{ flex: '1 1 170px', minWidth: 0 }}
        >
          {pickMode === 'new' ? t('btn.cancelSelection') : t('btn.captureCell')}
        </Button>
        <Button icon="bolt" variant="primary" size="sm" onClick={autoFillMappings} style={{ flex: '1 1 170px', minWidth: 0 }}>
          {t('autofill')}
        </Button>
        <Button
          icon="history"
          variant="secondary"
          size="sm"
          onClick={undo}
          disabled={historyRef.current.length === 0}
          title={t('btn.undo.title')}
          style={{ minWidth: 0 }}
        >
          {t('btn.undo')}
        </Button>
        <Button
          icon="repeat"
          variant="secondary"
          size="sm"
          onClick={redo}
          disabled={redoRef.current.length === 0}
          title={t('btn.redo.title')}
          style={{ minWidth: 0 }}
        >
          {t('btn.redo')}
        </Button>
      </div>

      {/* Import error */}
      {importError && (
        <div style={{
          fontSize: 11, color: '#f85149', padding: '4px 8px',
          background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
          borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{importError}</span>
          <Button size="sm" variant="secondary" fill="text" onClick={() => setImportError(null)}>✕</Button>
        </div>
      )}

      {/* Toolbar */}
      {mappings.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Button icon="angle-double-down" variant="secondary" size="sm" fill="text" onClick={expandAll}>
            {t('btn.expandAll')}
          </Button>
          <Button icon="angle-double-up" variant="secondary" size="sm" fill="text" onClick={collapseAll}>
            {t('btn.collapseAll')}
          </Button>
          <Button icon="bolt" variant="secondary" size="sm" fill="text" onClick={autodiscoverAll}>
            {t('btn.autodiscoverAll')}
          </Button>
          <Button icon="check-square" variant="secondary" size="sm" fill="text" onClick={selectAll}>
            {t('btn.selectAll')}
          </Button>
          {selected.size > 0 && (
            <Button icon="minus-circle" variant="secondary" size="sm" fill="text" onClick={deselectAll}>
              {t('btn.deselect')}
            </Button>
          )}
          <Select
            options={[
              { label: t('sort.none'), value: 'none' as const },
              { label: 'Host', value: 'host' as const },
              { label: 'Cell ID', value: 'cellId' as const },
              { label: t('sort.label'), value: 'label' as const },
            ]}
            value={sortBy}
            onChange={(v) => setSortBy((v?.value as any) || 'none')}
            width={16}
            menuPlacement="auto"
          />
          <span style={{ flex: 1 }} />
          <Button icon="import" variant="secondary" size="sm" fill="text" onClick={importMappings}>
            {t('btn.import')}
          </Button>
          <Button icon="download-alt" variant="secondary" size="sm" fill="text" onClick={exportSelected}>
            {selected.size > 0 ? t('btn.exportSelected', { n: selected.size }) : searchFilter ? t('btn.exportFiltered', { n: filteredMappings.length }) : t('btn.exportAll')}
          </Button>
          <Button icon="share-alt" variant="secondary" size="sm" fill="text" onClick={exportGlobalConfig}>
            {t('btn.globalConfig')}
          </Button>
        </div>
      )}

      {/* Import merge/replace dialog */}
      {importPending && (
        <div style={{
          padding: '8px 12px', borderRadius: 4, fontSize: 12,
          background: isDark ? 'rgba(87,148,242,0.12)' : 'rgba(87,148,242,0.08)',
          border: `1px solid ${isDark ? 'rgba(87,148,242,0.4)' : 'rgba(87,148,242,0.3)'}`,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t('import.heading', { n: importPending.mappings.length })}
          </div>
          {importPending.extra.length > 0 && (
            <div style={{ fontSize: 11, color: fgMuted, marginBottom: 4 }}>
              {t('import.envelope')} {importPending.extra.join(', ')}
              <br />
              {t('import.envelopeNote')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" variant="primary" onClick={() => applyImport('replace')}>
              {t('import.replace', { n: importPending.mappings.length })}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyImport('merge')}>
              {t('import.merge', { n: importPending.mappings.length })}
            </Button>
            <Button size="sm" variant="secondary" fill="text" onClick={() => setImportPending(null)}>
              {t('btn.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap',
          padding: '4px 8px', background: isDark ? 'rgba(87,148,242,0.1)' : 'rgba(87,148,242,0.06)',
          border: `1px solid ${isDark ? 'rgba(87,148,242,0.3)' : 'rgba(87,148,242,0.2)'}`,
          borderRadius: 4, fontSize: 11,
        }}>
          <span style={{ color: fg, fontWeight: 600 }}>{t('bulk.selected', { n: selected.size })}</span>
          <Button icon="trash-alt" variant="destructive" size="sm" fill="text" onClick={deleteSelected}>
            {t('btn.delete')}
          </Button>
          <Button icon="copy" variant="secondary" size="sm" fill="text" onClick={cloneSelected}>
            {t('btn.duplicate')}
          </Button>
          <UnitPicker
            value=""
            onChange={(unit) => { if (unit) setDataTypeForSelected(unit); }}
          />
        </div>
      )}

      {/* Search filter */}
      {mappings.length > 0 && (
        <Input
          value={searchFilter}
          onChange={(e) => updateSearchFilter(e.currentTarget.value)}
          placeholder={t('filter.placeholder')}
          prefix={<span style={{ color: fg, fontSize: 13 }}>&#128269;</span>}
          style={{ fontSize: 12 }}
        />
      )}

      {mappings.length > 0 && searchFilter && (
        <div style={{ fontSize: 11, color: fgMuted }}>
          {t('filter.showing', { shown: filteredMappings.length, total: mappings.length })}
        </div>
      )}

      {/* Empty */}
      {mappings.length === 0 && (
        <div style={S.empty}>
          {t('empty.noMappings')}
        </div>
      )}

      {/* Cards */}
      {filteredMappings.map((m, idx) => (
        <CellMappingCard
          key={m.id}
          mapping={m}
          index={idx}
          isHighlighted={lastSelected === m.cellId}
          isPinning={pickMode === m.id}
          isCollapsed={collapsed.has(m.id)}
          isSelected={selected.has(m.id)}
          isDark={isDark}
          fg={fg}
          fgMuted={fgMuted}
          styles={S}
          cellIdOptions={cellIdOptions}
          refIdOptions={refIdOptions}
          refIdAnalyses={refIdAnalyses}
          defaultHostField={defaultHostField}
          getHostOptionsForMapping={getHostOptionsForMapping}
          getFieldOptionsForRefId={getFieldOptionsForRefId}
          getFilterPatternSuggestions={getFilterPatternSuggestions}
          getPatternMatchInfo={getPatternMatchInfo}
          getMappingWarnings={getMappingWarnings}
          fieldOptions={fieldOptions}
          allMappings={mappings}
          onToggleCollapse={toggleCollapse}
          onToggleSelect={toggleSelect}
          onUpdateMapping={updateMapping}
          onRemoveMapping={removeMapping}
          onSetPickMode={setPickMode}
          onCloneMapping={cloneMapping}
          onAddMetric={addMetric}
          onAutodiscover={autodiscover}
          onAddMetricFromQuery={addMetricFromQuery}
          onUpdateMetric={updateMetric}
          onRemoveMetric={removeMetric}
          onRemoveMetrics={removeMetrics}
          onReplaceThresholds={replaceThresholds}
          onReplaceValueMappings={replaceValueMappings}
        />
      ))}
    </div>
  );
};

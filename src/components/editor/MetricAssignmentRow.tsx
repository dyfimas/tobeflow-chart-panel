// ─────────────────────────────────────────────────────────────
// editor/MetricAssignmentRow.tsx – Per-metric row editor
// Field select, host field, filter pattern, group-by,
// data type, aggregation, alias, text mode, thresholds, mappings
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { SelectableValue } from '@grafana/data';
import { Checkbox, IconButton, Select, Input, UnitPicker } from '@grafana/ui';
import type {
  MetricAssignment,
  MetricDataType,
  MetricThreshold,
  AggregationType,
  ValueMapping,
} from '../../types';
import type { PatternMatchResult } from '../../utils/aliasResolver';
import { t } from '../../i18n';
import { AGGREGATION_OPTIONS, TEXT_MODE_OPTIONS } from './constants';
import { LEGACY_TO_GRAFANA_UNIT } from '../../utils/dataFormatter';
import { MetricThresholdsMini } from './MetricThresholdsMini';
import { ValueMappingsMini } from './ValueMappingsMini';

export interface MetricAssignmentRowProps {
  metric: MetricAssignment;
  metricIndex: number;
  mappingId: string;
  mappingRefId?: string;
  /** Field options already filtered by the effective refId */
  fieldOptions: Array<SelectableValue<string>>;
  /** Filter pattern suggestions for the effective refId */
  filterPatternSuggestions: Array<SelectableValue<string>>;
  /** Resolved pattern match info (null if no pattern) */
  patternMatchInfo: PatternMatchResult | null;
  /** Default host field name from panel options */
  defaultHostField: string;
  isDark: boolean;
  /** Style for the metric row container */
  rowStyle: React.CSSProperties;
  // ─ Collapse & Select ─
  isMetricCollapsed: boolean;
  onToggleMetricCollapse: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  // ─ Handlers ─
  onUpdateMetric: (mappingId: string, idx: number, patch: Partial<MetricAssignment>) => void;
  onRemoveMetric: (mappingId: string, idx: number) => void;
  onReplaceThresholds: (mappingId: string, metricIdx: number, ths: MetricThreshold[]) => void;
  onReplaceValueMappings: (mappingId: string, metricIdx: number, vms: ValueMapping[]) => void;
}

export const MetricAssignmentRow: React.FC<MetricAssignmentRowProps> = ({
  metric: mt,
  metricIndex: mi,
  mappingId,
  mappingRefId,
  fieldOptions: metricFieldOpts,
  filterPatternSuggestions,
  patternMatchInfo: info,
  defaultHostField,
  isDark,
  rowStyle,
  isMetricCollapsed,
  onToggleMetricCollapse,
  isSelected,
  onToggleSelect,
  onUpdateMetric: updateMetric,
  onRemoveMetric: removeMetric,
  onReplaceThresholds: replaceThresholds,
  onReplaceValueMappings: replaceValueMappings,
}) => {
  const isGenericValueField = ['_value', 'value'].includes((mt.field || '').toLowerCase());

  if (isMetricCollapsed) {
    return (
      <div style={{ ...rowStyle, alignItems: 'center', padding: '2px 0 2px 8px', marginBottom: 2 }}>
        <span onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(); }} style={{ display: 'flex', alignItems: 'center', marginRight: 2 }}>
          <Checkbox value={isSelected} onChange={() => onToggleSelect()} />
        </span>
        <IconButton
          name="angle-right"
          size="sm"
          tooltip={t('metric.expand')}
          variant="secondary"
          onClick={onToggleMetricCollapse}
        />
        <span
          style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer' }}
          onClick={onToggleMetricCollapse}
        >
          {mt.field || t('metric.noField')}
        </span>
        {mt.dataType && mt.dataType !== 'auto' && (
          <span style={{ fontSize: 9, opacity: 0.7, marginRight: 4, flexShrink: 0 }}>{mt.dataType}</span>
        )}
        {mt.alias && (
          <span style={{ fontSize: 9, opacity: 0.5, marginRight: 4, flexShrink: 0 }}>{mt.alias}</span>
        )}
        <IconButton name="times" size="sm" tooltip={t('metric.remove')} onClick={() => removeMetric(mappingId, mi)} />
      </div>
    );
  }

  return (
    <React.Fragment>
      <div style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, marginRight: 4, paddingTop: 4 }}>
          <Checkbox value={isSelected} onChange={() => onToggleSelect()} />
          <IconButton name="angle-down" size="sm" tooltip={t('metric.collapse')} variant="secondary" onClick={onToggleMetricCollapse} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Per-metric Query badge (if different from mapping refId) */}
          {mt.refId && mt.refId !== mappingRefId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#5794F2', fontWeight: 600 }}>
                Query {mt.refId}
              </span>
              <IconButton name="times" size="sm" tooltip={t('metric.removeQuery')}
                onClick={() => updateMetric(mappingId, mi, { refId: undefined })}
              />
            </div>
          )}
          {/* Value field (X) */}
          <Select
            options={metricFieldOpts}
            value={
              mt.field
                ? metricFieldOpts.find((o) => o.value === mt.field) || { label: mt.field, value: mt.field }
                : undefined
            }
            onChange={(v) => updateMetric(mappingId, mi, { field: v?.value || '' })}
            allowCustomValue
            isClearable
            placeholder={t('metric.valueField')}
            menuPlacement="auto"
          />
          {isGenericValueField && (
            <div style={{ fontSize: 10, opacity: 0.75, marginTop: -1 }}>
              {t('metric.metricsQueryDetected')} (ej: <code>system.filesystem.mount_point</code>)
            </div>
          )}
          {/* Host field + filter pattern row (per-metric) */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px', minWidth: 100 }}>
              <Select
                options={metricFieldOpts}
                value={
                  mt.hostField
                    ? metricFieldOpts.find((o) => o.value === mt.hostField) || { label: mt.hostField, value: mt.hostField }
                    : undefined
                }
                onChange={(v) => updateMetric(mappingId, mi, { hostField: v?.value || '' })}
                allowCustomValue
                isClearable
                placeholder={`Host field: ${defaultHostField}`}
                menuPlacement="auto"
              />
            </div>
            <div style={{ flex: '1 1 120px', minWidth: 100 }}>
              <Select
                options={filterPatternSuggestions}
                value={mt.filterPattern ? { label: mt.filterPattern, value: mt.filterPattern } : undefined}
                onChange={(v) => updateMetric(mappingId, mi, { filterPattern: v?.value || '' })}
                allowCustomValue
                isClearable
                placeholder="Pattern (ej: *BAMBOO*)"
                menuPlacement="auto"
              />
            </div>
          </div>
          {/* Pattern match count indicator */}
          {info && (() => {
            const isOk = info.count > 0;
            const maxShow = 5;
            const matchList = info.matches.slice(0, maxShow).join(', ');
            const more = info.count > maxShow ? ` (+${info.count - maxShow})` : '';
            return (
              <div style={{
                fontSize: 10, padding: '2px 8px', marginTop: -1,
                color: isOk ? (isDark ? '#73BF69' : '#37872D') : (isDark ? '#FF7383' : '#C4162A'),
                lineHeight: 1.4,
              }}>
                {isOk
                  ? `${info.count} match${info.count !== 1 ? 'es' : ''}: ${matchList}${more}`
                  : t('metric.noMatches')
                }
              </div>
            );
          })()}
          {/* Group by field (Y) */}
          <Select
            options={metricFieldOpts}
            value={
              mt.groupByField
                ? metricFieldOpts.find((o) => o.value === mt.groupByField) || { label: mt.groupByField, value: mt.groupByField }
                : undefined
            }
            onChange={(v) => updateMetric(mappingId, mi, { groupByField: v?.value || '' })}
            allowCustomValue
            isClearable
            placeholder={t('metric.groupBy')}
            menuPlacement="auto"
          />
          {/* Data type (UnitPicker) */}
          <UnitPicker
            value={LEGACY_TO_GRAFANA_UNIT[mt.dataType || 'auto'] || mt.dataType || ''}
            onChange={(unit) => updateMetric(mappingId, mi, { dataType: unit || 'auto' })}
          />
          {/* Aggregation + alias row */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 110px', minWidth: 90 }}>
              <Select
                options={AGGREGATION_OPTIONS}
                value={AGGREGATION_OPTIONS.find((o) => o.value === (mt.aggregation || 'last'))}
                onChange={(v) => updateMetric(mappingId, mi, { aggregation: (v?.value || 'last') as AggregationType })}
                placeholder="Aggregation"
                menuPlacement="auto"
              />
            </div>
            <div style={{ flex: '1 1 90px', minWidth: 70 }}>
              <Input
                value={mt.alias || ''}
                onChange={(e) => updateMetric(mappingId, mi, { alias: e.currentTarget.value })}
                placeholder="Alias"
                style={{ fontSize: 11 }}
              />
            </div>
          </div>
          {/* Text mode selector + custom template */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 120, flex: '0 1 140px' }}>
              <Select
                options={TEXT_MODE_OPTIONS}
                value={TEXT_MODE_OPTIONS.find((o) => o.value === (mt.textMode || 'off'))}
                onChange={(v) => updateMetric(mappingId, mi, { textMode: (v?.value || 'off') as any })}
                placeholder="SVG Text"
                menuPlacement="auto"
              />
            </div>
            {(mt.textMode === 'custom') && (
              <Input
                value={mt.textTemplate || ''}
                onChange={(e) => updateMetric(mappingId, mi, { textTemplate: e.currentTarget.value })}
                placeholder="{{value}} | {{alias}} | {{status:OK:NOK}}"
                title={t('metric.templateTitle')}
                style={{ fontSize: 11 }}
              />
            )}
            {(mt.textMode === 'metric') && (
              <span style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>{t('metric.showsValue')}</span>
            )}
          </div>
        </div>
        <IconButton name="times" size="sm" tooltip={t('metric.remove')} onClick={() => removeMetric(mappingId, mi)} />
      </div>
      {/* Thresholds for this metric */}
      <MetricThresholdsMini
        thresholds={mt.thresholds || []}
        onChange={(ths) => replaceThresholds(mappingId, mi, ths)}
      />
      {/* Value Mappings for this metric */}
      <ValueMappingsMini
        mappings={mt.valueMappings || []}
        onChange={(vms) => replaceValueMappings(mappingId, mi, vms)}
      />
    </React.Fragment>
  );
};

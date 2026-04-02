// ─────────────────────────────────────────────────────────────
// editor/MetricAssignmentRow.tsx – Per-metric row editor
// Field select, host field, filter pattern, group-by,
// data type, aggregation, alias, text mode, thresholds, mappings
// ─────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import { SelectableValue } from '@grafana/data';
import { Checkbox, IconButton, Select, Input, UnitPicker, Tooltip } from '@grafana/ui';
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

/* ── Inline helper: label + info tooltip ── */
const FieldRow: React.FC<{
  label: string;
  info?: string;
  isDark: boolean;
  children: React.ReactNode;
}> = ({ label, info, isDark, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 500, opacity: 0.75, letterSpacing: 0.2,
        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
      }}>
        {label}
      </span>
      {info && (
        <Tooltip content={info} placement="top">
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%', cursor: 'help',
            fontSize: 9, fontWeight: 700, lineHeight: 1, flexShrink: 0,
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
            transition: 'background 0.15s, color 0.15s',
          }}>
            ?
          </span>
        </Tooltip>
      )}
    </div>
    {children}
  </div>
);

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
        <span style={{
          fontSize: 9, fontWeight: 600, flexShrink: 0, marginRight: 4,
          padding: '1px 5px', borderRadius: 3,
          background: isGenericValueField ? 'rgba(87,148,242,0.15)' : 'rgba(115,191,105,0.15)',
          color: isGenericValueField ? '#5794F2' : '#73BF69',
        }}>
          {isGenericValueField ? t('metric.typeBadge.query') : t('metric.typeBadge.metric')}
        </span>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
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

          {isGenericValueField ? (
            /* ─── QUERY TYPE (_value/value): simplified layout ─── */
            <>
              {/* ── Type badge + Title ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 600, opacity: 0.85,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                paddingBottom: 4, marginBottom: 2,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(87,148,242,0.15)', color: '#5794F2',
                }}>{t('metric.typeBadge.query')}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {mt.field || t('metric.noField')}
                </span>
                {mt.alias && <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 10 }}>({mt.alias})</span>}
              </div>

              {/* ── Pattern filter ── */}
              <FieldRow label={t('metric.pattern.label')} info={t('metric.info.pattern')} isDark={isDark}>
                <Select
                  options={filterPatternSuggestions}
                  value={mt.filterPattern ? { label: mt.filterPattern, value: mt.filterPattern } : undefined}
                  onChange={(v) => {
                    const pat = v?.value || '';
                    const patch: Partial<MetricAssignment> = { filterPattern: pat };
                    if (pat && !mt.alias) {
                      patch.alias = pat.replace(/\*/g, '').trim() || pat;
                    }
                    updateMetric(mappingId, mi, patch);
                  }}
                  allowCustomValue
                  isClearable
                  placeholder={t('metric.pattern.placeholder')}
                  menuPlacement="auto"
                />
              </FieldRow>
              {/* Pattern match indicator */}
              {info && (() => {
                const isOk = info.count > 0;
                const maxShow = 5;
                const matchList = info.matches.slice(0, maxShow).join(', ');
                const more = info.count > maxShow ? ` (+${info.count - maxShow})` : '';
                return (
                  <div style={{
                    fontSize: 10, padding: '2px 8px', marginTop: -2,
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

              {/* ── Unit ── */}
              <FieldRow label={t('metric.unit.short')} info={t('metric.info.unit')} isDark={isDark}>
                <UnitPicker
                  value={LEGACY_TO_GRAFANA_UNIT[mt.dataType || 'auto'] || mt.dataType || ''}
                  onChange={(unit) => updateMetric(mappingId, mi, { dataType: unit || 'auto' })}
                />
              </FieldRow>

              {/* ── Aggregation ── */}
              <FieldRow label={t('metric.aggregation.label')} info={t('metric.info.aggregation')} isDark={isDark}>
                <Select
                  options={AGGREGATION_OPTIONS}
                  value={AGGREGATION_OPTIONS.find((o) => o.value === (mt.aggregation || 'last'))}
                  onChange={(v) => updateMetric(mappingId, mi, { aggregation: (v?.value || 'last') as AggregationType })}
                  placeholder={t('metric.aggregation.placeholder')}
                  menuPlacement="auto"
                />
              </FieldRow>

              {/* ── Alias ── */}
              <FieldRow label={t('metric.alias.label')} info={t('metric.info.alias')} isDark={isDark}>
                <Input
                  value={mt.alias || ''}
                  onChange={(e) => updateMetric(mappingId, mi, { alias: e.currentTarget.value })}
                  placeholder={t('metric.alias.placeholder')}
                  style={{ fontSize: 11 }}
                />
              </FieldRow>

              {/* ── SVG Text ── */}
              <FieldRow label={t('metric.svgText.short')} info={t('metric.info.svgText')} isDark={isDark}>
                <Select
                  options={TEXT_MODE_OPTIONS}
                  value={TEXT_MODE_OPTIONS.find((o) => o.value === (mt.textMode || 'off'))}
                  onChange={(v) => updateMetric(mappingId, mi, { textMode: (v?.value || 'off') as any })}
                  placeholder="SVG Text"
                  menuPlacement="auto"
                />
                {(mt.textMode === 'custom') && (
                  <Input
                    value={mt.textTemplate || ''}
                    onChange={(e) => updateMetric(mappingId, mi, { textTemplate: e.currentTarget.value })}
                    placeholder="{{value}} | {{alias}} | {{status:OK:NOK}}"
                    title={t('metric.templateTitle')}
                    style={{ fontSize: 11, marginTop: 3 }}
                  />
                )}
                {(mt.textMode === 'metric') && (
                  <span style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>{t('metric.showsValue')}</span>
                )}
              </FieldRow>
            </>
          ) : (
            /* ─── METRIC TYPE (specific field): original full layout ─── */
            <>
              {/* ── Type badge ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                paddingBottom: 4, marginBottom: 2,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(115,191,105,0.15)', color: '#73BF69',
                }}>{t('metric.typeBadge.metric')}</span>
              </div>
              {/* Value field (X) */}
              <FieldRow label={t('metric.valueField')} info={t('metric.info.valueField')} isDark={isDark}>
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
              </FieldRow>
              {/* Host field + filter pattern row (per-metric) */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                  <FieldRow label={`Host field`} info={t('metric.info.hostField')} isDark={isDark}>
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
                      placeholder={`${defaultHostField}`}
                      menuPlacement="auto"
                    />
                  </FieldRow>
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                  <FieldRow label={t('metric.pattern.label')} info={t('metric.info.pattern')} isDark={isDark}>
                    <Select
                      options={filterPatternSuggestions}
                      value={mt.filterPattern ? { label: mt.filterPattern, value: mt.filterPattern } : undefined}
                      onChange={(v) => updateMetric(mappingId, mi, { filterPattern: v?.value || '' })}
                      allowCustomValue
                      isClearable
                      placeholder="*BAMBOO*"
                      menuPlacement="auto"
                    />
                  </FieldRow>
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
                    fontSize: 10, padding: '2px 8px', marginTop: -2,
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
              <FieldRow label={t('metric.groupBy')} info={t('metric.info.groupBy')} isDark={isDark}>
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
              </FieldRow>
              {/* Data type (UnitPicker) */}
              <FieldRow label={t('metric.unit.short')} info={t('metric.info.unit')} isDark={isDark}>
                <UnitPicker
                  value={LEGACY_TO_GRAFANA_UNIT[mt.dataType || 'auto'] || mt.dataType || ''}
                  onChange={(unit) => updateMetric(mappingId, mi, { dataType: unit || 'auto' })}
                />
              </FieldRow>
              {/* Aggregation + alias row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 110px', minWidth: 90 }}>
                  <FieldRow label={t('metric.aggregation.label')} info={t('metric.info.aggregation')} isDark={isDark}>
                    <Select
                      options={AGGREGATION_OPTIONS}
                      value={AGGREGATION_OPTIONS.find((o) => o.value === (mt.aggregation || 'last'))}
                      onChange={(v) => updateMetric(mappingId, mi, { aggregation: (v?.value || 'last') as AggregationType })}
                      placeholder={t('metric.aggregation.label')}
                      menuPlacement="auto"
                    />
                  </FieldRow>
                </div>
                <div style={{ flex: '1 1 90px', minWidth: 70 }}>
                  <FieldRow label={t('metric.alias.label')} info={t('metric.info.alias')} isDark={isDark}>
                    <Input
                      value={mt.alias || ''}
                      onChange={(e) => updateMetric(mappingId, mi, { alias: e.currentTarget.value })}
                      placeholder="Alias"
                      style={{ fontSize: 11 }}
                    />
                  </FieldRow>
                </div>
              </div>
              {/* Text mode selector + custom template */}
              <FieldRow label={t('metric.svgText.short')} info={t('metric.info.svgText')} isDark={isDark}>
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
              </FieldRow>
            </>
          )}
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
      {/* Skip threshold toggles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '2px 4px', marginTop: 2 }}>
        <Tooltip content={t('metric.info.skipThresholdColor')} placement="top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Checkbox
              value={!!mt.skipThresholdColor}
              onChange={(e) => updateMetric(mappingId, mi, { skipThresholdColor: e.currentTarget.checked })}
            />
            <span style={{ fontSize: 10, opacity: 0.8, cursor: 'help' }}>{t('metric.skipThresholdColor')}</span>
          </div>
        </Tooltip>
        <Tooltip content={t('metric.info.skipCellSeverity')} placement="top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Checkbox
              value={!!mt.skipCellSeverity}
              onChange={(e) => updateMetric(mappingId, mi, { skipCellSeverity: e.currentTarget.checked })}
            />
            <span style={{ fontSize: 10, opacity: 0.8, cursor: 'help' }}>{t('metric.skipCellSeverity')}</span>
          </div>
        </Tooltip>
      </div>
    </React.Fragment>
  );
};

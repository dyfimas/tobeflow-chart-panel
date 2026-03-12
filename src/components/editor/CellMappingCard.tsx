// ─────────────────────────────────────────────────────────────
// editor/CellMappingCard.tsx – Single cell-mapping card
// Header bar, cell ID / query / host / visibility fields,
// metrics list, validation warnings
// ─────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, Checkbox, IconButton, Select, Input, InlineField } from '@grafana/ui';
import type {
  CellMapping,
  MetricAssignment,
  MetricThreshold,
  ValueMapping,
  VisibilityMode,
} from '../../types';
import type { RefIdAnalysis, MappingValidation, PatternMatchResult } from '../../utils/aliasResolver';
import { t } from '../../i18n';
import { VISIBILITY_OPTIONS } from './constants';
import { MetricAssignmentRow } from './MetricAssignmentRow';

export interface EditorStyles {
  card: React.CSSProperties;
  cardHl: React.CSSProperties;
  metricRow: React.CSSProperties;
  header: React.CSSProperties;
  badge: React.CSSProperties;
}

export interface CellMappingCardProps {
  mapping: CellMapping;
  index: number;
  isHighlighted: boolean;
  isPinning: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  isDark: boolean;
  fg: string;
  fgMuted: string;
  styles: EditorStyles;
  // ─ Options ─
  cellIdOptions: Array<SelectableValue<string>>;
  refIdOptions: Array<SelectableValue<string>>;
  refIdAnalyses: Map<string, RefIdAnalysis>;
  defaultHostField: string;
  // ─ Callbacks that compute from data ─
  getHostOptionsForMapping: (refId?: string, customHostField?: string) => Array<SelectableValue<string>>;
  getFieldOptionsForRefId: (refId?: string) => Array<SelectableValue<string>>;
  getFilterPatternSuggestions: (refId?: string, hostField?: string) => Array<SelectableValue<string>>;
  getPatternMatchInfo: (refId: string | undefined, hostField: string | undefined, pattern: string | undefined) => PatternMatchResult | null;
  getMappingWarnings: (m: CellMapping) => MappingValidation[];
  fieldOptions: Array<SelectableValue<string>>;
  // ─ All mappings ref (for clone) ─
  allMappings: CellMapping[];
  // ─ Handlers ─
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onUpdateMapping: (id: string, patch: Partial<CellMapping>) => void;
  onRemoveMapping: (id: string) => void;
  onSetPickMode: (mode: false | 'new' | string) => void;
  onCloneMapping: (mapping: CellMapping) => void;
  onAddMetric: (mappingId: string) => void;
  onAutodiscover: (mappingId: string) => void;
  onAddMetricFromQuery: (mappingId: string, refId: string) => void;
  onUpdateMetric: (mappingId: string, idx: number, patch: Partial<MetricAssignment>) => void;
  onRemoveMetric: (mappingId: string, idx: number) => void;
  onRemoveMetrics: (mappingId: string, indices: number[]) => void;
  onReplaceThresholds: (mappingId: string, metricIdx: number, ths: MetricThreshold[]) => void;
  onReplaceValueMappings: (mappingId: string, metricIdx: number, vms: ValueMapping[]) => void;
}

export const CellMappingCard: React.FC<CellMappingCardProps> = ({
  mapping: m,
  index: idx,
  isHighlighted: isHl,
  isPinning,
  isCollapsed,
  isSelected,
  isDark,
  fg,
  fgMuted,
  styles: S,
  cellIdOptions,
  refIdOptions,
  refIdAnalyses,
  defaultHostField,
  getHostOptionsForMapping,
  getFieldOptionsForRefId,
  getFilterPatternSuggestions,
  getPatternMatchInfo,
  getMappingWarnings,
  fieldOptions,
  allMappings,
  onToggleCollapse: toggleCollapse,
  onToggleSelect: toggleSelect,
  onUpdateMapping: updateMapping,
  onRemoveMapping: removeMapping,
  onSetPickMode: setPickMode,
  onCloneMapping: cloneMapping,
  onAddMetric: addMetric,
  onAutodiscover: autodiscover,
  onAddMetricFromQuery: addMetricFromQuery,
  onUpdateMetric: updateMetric,
  onRemoveMetric: removeMetric,
  onRemoveMetrics: removeMetrics,
  onReplaceThresholds: replaceThresholds,
  onReplaceValueMappings: replaceValueMappings,
}) => {
  const [collapsedMetrics, setCollapsedMetrics] = useState<Set<number>>(() => new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<number>>(() => new Set());

  React.useEffect(() => { setSelectedMetrics(new Set()); }, [m.metrics.length]);

  const toggleMetricCollapse = useCallback((idx: number) => {
    setCollapsedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const toggleMetricSelect = useCallback((idx: number) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const allMetricsCollapsed = m.metrics.length > 0 && collapsedMetrics.size >= m.metrics.length;

  const collapseAllMetrics = useCallback(() => {
    setCollapsedMetrics(new Set(m.metrics.map((_, i) => i)));
  }, [m.metrics]);

  const expandAllMetrics = useCallback(() => {
    setCollapsedMetrics(new Set());
  }, []);

  const deleteSelectedMetrics = useCallback(() => {
    if (selectedMetrics.size === 0) return;
    removeMetrics(m.id, Array.from(selectedMetrics));
    setSelectedMetrics(new Set());
  }, [selectedMetrics, m.id, removeMetrics]);

  return (
    <div style={{
      ...(isHl ? S.cardHl : S.card),
      ...(isSelected ? { borderColor: isDark ? '#5794F2' : '#3D71D9', borderWidth: 2 } : {}),
    }}>
      {/* Header */}
      <div style={{ ...S.header, cursor: 'pointer' }} onClick={() => toggleCollapse(m.id)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <span onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleSelect(m.id); }} style={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox value={isSelected} onChange={() => toggleSelect(m.id)} />
          </span>
          <IconButton
            name={isCollapsed ? 'angle-right' : 'angle-down'}
            size="sm"
            tooltip={isCollapsed ? t('card.expand') : t('card.collapse')}
            variant="secondary"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleCollapse(m.id); }}
          />
          <span style={S.badge}>
            #{idx + 1}
            {m.cellId && (
              <span style={{ color: fg, marginLeft: 6 }}>{m.cellId}</span>
            )}
          </span>
          {isCollapsed && m.hostName && (
            <span style={{ fontSize: 11, color: fg, marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {m.hostName}
            </span>
          )}
          {isCollapsed && m.refId && (
            <span style={{ fontSize: 10, color: '#5794F2', marginLeft: 4, fontWeight: 600 }}>
              [{m.refId}]
            </span>
          )}
          {isCollapsed && m.metrics.length > 0 && (
            <span style={{ fontSize: 10, color: fgMuted, marginLeft: 4 }}>
              [{m.metrics.length} metric{m.metrics.length !== 1 ? 's' : ''}]
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <IconButton
            name="eye"
            size="sm"
            tooltip={t('card.locate')}
            variant="secondary"
            onMouseEnter={() => {
              if (m.cellId) {
                window.dispatchEvent(new CustomEvent('svgflow-locate-cell', {
                  detail: { cellId: m.cellId, mode: 'hover' },
                }));
              }
            }}
            onMouseLeave={() => {
              if (m.cellId) {
                window.dispatchEvent(new CustomEvent('svgflow-locate-stop', {
                  detail: { cellId: m.cellId },
                }));
              }
            }}
            onClick={() => {
              if (m.cellId) {
                window.dispatchEvent(new CustomEvent('svgflow-locate-cell', {
                  detail: { cellId: m.cellId, mode: 'click' },
                }));
              }
            }}
          />
          <IconButton
            name="link"
            size="sm"
            tooltip={t('card.pinHost')}
            variant={isPinning ? 'primary' : 'secondary'}
            onClick={() => setPickMode(isPinning ? false : m.id)}
          />
          <IconButton
            name="copy"
            size="sm"
            tooltip={t('card.duplicateMapping')}
            onClick={() => cloneMapping(m)}
          />
          <IconButton
            name="trash-alt"
            size="sm"
            tooltip={t('card.deleteMapping')}
            onClick={() => removeMapping(m.id)}
          />
        </div>
      </div>

      {isPinning && (
        <div style={{ fontSize: 11, color: fg, padding: '2px 0 6px', textAlign: 'center' }}>
          {t('card.clickToReassign')}
        </div>
      )}

      {!isCollapsed && (<>
        {/* Cell ID */}
        <InlineField label="Cell ID" labelWidth={8} grow>
          <Select
            options={cellIdOptions}
            value={m.cellId ? { label: m.cellId, value: m.cellId } : undefined}
            onChange={(v) => updateMapping(m.id, { cellId: v?.value || '' })}
            allowCustomValue
            isClearable
            placeholder="data-cell-id"
          />
        </InlineField>

        {/* Query (refId) */}
        <InlineField label="Query" labelWidth={8} grow tooltip={t('card.queryTooltip')}>
          <Select
            options={refIdOptions}
            value={refIdOptions.find((o) => o.value === (m.refId || '')) || refIdOptions[0]}
            onChange={(v) => updateMapping(m.id, { refId: v?.value || '' })}
            isClearable={false}
            placeholder="All queries"
          />
        </InlineField>

        {/* Dynamic alias info banner */}
        {m.refId && (() => {
          const analysis = refIdAnalyses.get(m.refId);
          if (!analysis?.isDynamic) return null;
          const maxShow = 6;
          const vals = analysis.expandedValues.slice(0, maxShow);
          const more = analysis.expandedValues.length > maxShow
            ? ` (+${analysis.expandedValues.length - maxShow})`
            : '';
          return (
            <div style={{
              fontSize: 10, padding: '4px 8px', marginBottom: 4,
              background: isDark ? 'rgba(87, 148, 242, 0.08)' : 'rgba(87, 148, 242, 0.06)',
              border: `1px solid ${isDark ? 'rgba(87, 148, 242, 0.25)' : 'rgba(87, 148, 242, 0.2)'}`,
              borderRadius: 4, color: isDark ? '#8AB8FF' : '#3D71D9',
              lineHeight: 1.5,
            }}>
              <strong>Dynamic:</strong> {analysis.frameCount} series |
              {t('field.groupedBy')} <strong>{analysis.groupingLabels.join(', ') || 'frame.name'}</strong> |
              Valores: {vals.join(', ')}{more}
            </div>
          );
        })()}

        {/* Host */}
        <InlineField label="Host" labelWidth={8} grow>
          <Select
            options={getHostOptionsForMapping(m.refId, m.hostField)}
            value={m.hostName ? { label: m.hostName, value: m.hostName } : undefined}
            onChange={(v) => updateMapping(m.id, { hostName: v?.value || '' })}
            allowCustomValue
            isClearable
            placeholder="host.name"
          />
        </InlineField>

        {/* Data Link */}
        <InlineField label="Link" labelWidth={8} grow tooltip={t('card.linkTooltip')}>
          <Input
            value={m.dataLink || ''}
            onChange={(e) => updateMapping(m.id, { dataLink: e.currentTarget.value })}
            placeholder="/d/host-detail?var-host={{host}}"
            style={{ fontSize: 12 }}
          />
        </InlineField>

        {/* Description */}
        <InlineField label="Desc" labelWidth={8} grow tooltip={t('card.descTooltip')}>
          <Input
            value={m.description || ''}
            onChange={(e) => updateMapping(m.id, { description: e.currentTarget.value })}
            placeholder={t('card.descPlaceholder')}
            style={{ fontSize: 12 }}
          />
        </InlineField>

        {/* Visibility */}
        <InlineField label="Visib." labelWidth={8} grow tooltip={t('card.visTooltip')}>
          <Select
            options={VISIBILITY_OPTIONS}
            value={VISIBILITY_OPTIONS.find(o => o.value === (m.visibility || 'always'))}
            onChange={(v) => updateMapping(m.id, { visibility: (v?.value || 'always') as VisibilityMode })}
            menuPlacement="auto"
          />
        </InlineField>

        {/* Metrics section */}
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: fg, marginBottom: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconButton
              name={allMetricsCollapsed ? 'angle-right' : 'angle-down'}
              size="sm"
              tooltip={allMetricsCollapsed ? 'Expandir todas las métricas' : 'Colapsar todas las métricas'}
              variant="secondary"
              onClick={allMetricsCollapsed ? expandAllMetrics : collapseAllMetrics}
            />
            <span>Metrics ({m.metrics.length})</span>
            {selectedMetrics.size > 0 && (
              <Button icon="trash-alt" variant="destructive" size="sm" fill="text" onClick={deleteSelectedMetrics}>
                ({selectedMetrics.size})
              </Button>
            )}
          </div>

          {m.metrics.map((mt, mi) => {
            const effectiveRefId = mt.refId || m.refId;
            const metricFieldOpts = effectiveRefId ? getFieldOptionsForRefId(effectiveRefId) : fieldOptions;
            const suggestions = getFilterPatternSuggestions(effectiveRefId, mt.hostField);
            const patternInfo = (mt.filterPattern && mt.filterPattern.trim())
              ? getPatternMatchInfo(m.refId, mt.hostField, mt.filterPattern)
              : null;
            return (
              <MetricAssignmentRow
                key={mi}
                metric={mt}
                metricIndex={mi}
                mappingId={m.id}
                mappingRefId={m.refId}
                fieldOptions={metricFieldOpts}
                filterPatternSuggestions={suggestions}
                patternMatchInfo={patternInfo}
                defaultHostField={defaultHostField}
                isDark={isDark}
                rowStyle={S.metricRow}
                isMetricCollapsed={collapsedMetrics.has(mi)}
                onToggleMetricCollapse={() => toggleMetricCollapse(mi)}
                isSelected={selectedMetrics.has(mi)}
                onToggleSelect={() => toggleMetricSelect(mi)}
                onUpdateMetric={updateMetric}
                onRemoveMetric={removeMetric}
                onReplaceThresholds={replaceThresholds}
                onReplaceValueMappings={replaceValueMappings}
              />
            );
          })}

          {/* Add metric + Autodiscover + Add from Query */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 12, marginTop: 2, flexWrap: 'wrap' }}>
            <Button icon="plus" variant="secondary" size="sm" fill="text" onClick={() => addMetric(m.id)}>
              Metric
            </Button>
            <Button icon="bolt" variant="secondary" size="sm" fill="text" onClick={() => autodiscover(m.id)}>
              Autodiscover
            </Button>
            {/* Add metric from another query */}
            <Select
              options={refIdOptions.filter(o => o.value).map(o => ({ ...o, label: `+ ${o.label}` }))}
              value={null}
              onChange={(v) => { if (v?.value) addMetricFromQuery(m.id, v.value); }}
              placeholder="+ Query..."
              isClearable
              width={16}
              menuPlacement="auto"
            />
          </div>
        </div>

        {/* Validation warnings */}
        {renderWarnings(getMappingWarnings(m), isDark)}
      </>)}
    </div>
  );
};

// ── Warning badges (pure render helper) ─────────────────────

function renderWarnings(warnings: MappingValidation[], isDark: boolean): React.ReactNode {
  if (warnings.length === 0) return null;
  return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {warnings.map((w, wi) => {
        const bgColor = w.level === 'error'
          ? (isDark ? 'rgba(218,32,32,0.1)' : 'rgba(218,32,32,0.06)')
          : w.level === 'warning'
            ? (isDark ? 'rgba(247,185,17,0.1)' : 'rgba(247,185,17,0.06)')
            : (isDark ? 'rgba(87,148,242,0.08)' : 'rgba(87,148,242,0.04)');
        const borderColor = w.level === 'error'
          ? (isDark ? 'rgba(218,32,32,0.3)' : 'rgba(218,32,32,0.2)')
          : w.level === 'warning'
            ? (isDark ? 'rgba(247,185,17,0.3)' : 'rgba(247,185,17,0.2)')
            : (isDark ? 'rgba(87,148,242,0.2)' : 'rgba(87,148,242,0.15)');
        const textColor = w.level === 'error'
          ? (isDark ? '#FF7383' : '#C4162A')
          : w.level === 'warning'
            ? (isDark ? '#FADE2A' : '#8A6D00')
            : (isDark ? '#8AB8FF' : '#3D71D9');
        const icon = w.level === 'error' ? 'x' : w.level === 'warning' ? '!' : 'i';
        return (
          <div key={wi} style={{
            fontSize: 10, padding: '3px 8px',
            background: bgColor, border: `1px solid ${borderColor}`,
            borderRadius: 3, color: textColor, lineHeight: 1.4,
          }}>
            <strong>[{icon}]</strong> {w.message}
          </div>
        );
      })}
    </div>
  );
}

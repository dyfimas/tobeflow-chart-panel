// ─────────────────────────────────────────────────────────────
// editor/constants.ts – Static options for CellMappingsEditor
// ─────────────────────────────────────────────────────────────
import { SelectableValue } from '@grafana/data';
import type {
  MetricDataType,
  AggregationType,
  ThresholdOp,
  VisibilityMode,
} from '../../types';
import { t } from '../../i18n';

export const THRESHOLD_OP_OPTIONS: Array<SelectableValue<ThresholdOp>> = [
  { label: '>=', value: '>=' },
  { label: '>',  value: '>' },
  { label: '<=', value: '<=' },
  { label: '<',  value: '<' },
  { label: '=',  value: '=' },
  { label: '!=', value: '!=' },
];

export function getDataTypeOptions(): Array<SelectableValue<MetricDataType>> {
  return [
    { label: 'Auto',                       value: 'auto' },
    { label: t('dataType.pct100'),          value: 'pct100' },
    { label: t('dataType.pct1'),            value: 'pct1' },
    { label: t('dataType.number'),          value: 'number' },
    { label: t('dataType.short'),           value: 'short',    description: 'Auto K/M/B/T' },
    { label: 'Bytes',                       value: 'bytes' },
    { label: t('dataType.ms'),              value: 'ms' },
    { label: t('dataType.seconds'),         value: 'seconds' },
    { label: t('dataType.text'),            value: 'text' },
    { label: t('dataType.boolean'),         value: 'boolean' },
    { label: t('dataType.date'),            value: 'date' },
  ];
}

/** @deprecated Use getDataTypeOptions() for i18n support */
export const DATA_TYPE_OPTIONS = getDataTypeOptions();

export function getAggregationOptions(): Array<SelectableValue<AggregationType>> {
  return [
    { label: t('agg.last'),              value: 'last',            description: t('agg.last.desc') },
    { label: t('agg.lastNotNull'),       value: 'lastNotNull',     description: t('agg.lastNotNull.desc') },
    { label: t('agg.first'),             value: 'first',           description: t('agg.first.desc') },
    { label: t('agg.firstNotNull'),      value: 'firstNotNull',    description: t('agg.firstNotNull.desc') },
    { label: t('agg.min'),               value: 'min',             description: t('agg.min.desc') },
    { label: t('agg.max'),               value: 'max',             description: t('agg.max.desc') },
    { label: t('agg.sum'),               value: 'sum',             description: t('agg.sum.desc') },
    { label: t('agg.avg'),               value: 'avg',             description: t('agg.avg.desc') },
    { label: t('agg.count'),             value: 'count',           description: t('agg.count.desc') },
    { label: t('agg.delta'),             value: 'delta',           description: 'Last - First' },
    { label: t('agg.range'),             value: 'range',           description: t('agg.range.desc') },
    { label: t('agg.diff'),              value: 'diff',            description: '|Last - Previous|' },
    { label: t('agg.timeOfLastPoint'),   value: 'timeOfLastPoint', description: t('agg.timeOfLastPoint.desc') },
  ];
}

/** @deprecated Use getAggregationOptions() for i18n support */
export const AGGREGATION_OPTIONS = getAggregationOptions();

export function getVisibilityOptions(): Array<SelectableValue<VisibilityMode>> {
  return [
    { label: t('vis.always'),      value: 'always',      description: t('vis.always.desc') },
    { label: t('vis.whenData'),    value: 'when-data',   description: t('vis.whenData.desc') },
    { label: t('vis.whenOk'),      value: 'when-ok',     description: t('vis.whenOk.desc') },
    { label: t('vis.whenAlert'),   value: 'when-alert',  description: t('vis.whenAlert.desc') },
    { label: t('vis.whenNodata'),  value: 'when-nodata', description: t('vis.whenNodata.desc') },
  ];
}

/** @deprecated Use getVisibilityOptions() for i18n support */
export const VISIBILITY_OPTIONS = getVisibilityOptions();

export const VALUE_MAPPING_TYPE_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Value', value: 'value', description: 'Exact match (=)' },
  { label: 'Compare', value: 'comparison', description: '< > <= >= = !=' },
  { label: 'Range', value: 'range', description: 'From - To' },
  { label: 'Regex', value: 'regex', description: 'Pattern match' },
];

export const VM_OP_OPTIONS: Array<SelectableValue<string>> = [
  { label: '<', value: '<' },
  { label: '>', value: '>' },
  { label: '<=', value: '<=' },
  { label: '>=', value: '>=' },
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
];

export const THRESHOLD_PRESET_COLORS = [
  '#F2495C', '#FF9830', '#FADE2A', '#73BF69', '#5794F2', '#B877D9',
  '#C4162A', '#37872D', '#8AB8FF', '#FF7383',
];

export function getTextModeOptions(): Array<SelectableValue<string>> {
  return [
    { label: 'Off', value: 'off', description: t('textMode.off.desc') },
    { label: 'Metric', value: 'metric', description: t('textMode.metric.desc') },
    { label: 'Custom', value: 'custom', description: t('textMode.custom.desc') },
  ];
}

/** @deprecated Use getTextModeOptions() for i18n support */
export const TEXT_MODE_OPTIONS = getTextModeOptions();

/** Common identity fields — re-exported from types.ts for backward compatibility */
export { HOST_IDENTITY_FIELDS } from '../../types';

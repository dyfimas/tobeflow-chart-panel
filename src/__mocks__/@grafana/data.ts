// Mock for @grafana/data – provides enough to satisfy imports
export enum FieldType {
  time = 'time',
  number = 'number',
  string = 'string',
  boolean = 'boolean',
  other = 'other',
  trace = 'trace',
  enum = 'enum',
}

export interface Field {
  name: string;
  type: FieldType | string;
  values: any[];
  labels?: Record<string, string>;
  config?: any;
}

export interface DataFrame {
  name?: string;
  refId?: string;
  fields: Field[];
  length?: number;
}

export interface SelectableValue<T = any> {
  label?: string;
  value?: T;
  description?: string;
}

export class MutableDataFrame implements DataFrame {
  name?: string;
  refId?: string;
  fields: Field[] = [];
  length?: number;
}

export interface PanelProps<T = any> {
  data: { series: DataFrame[]; structureRev?: number };
  width: number;
  height: number;
  options: T;
  replaceVariables: (s: string) => string;
}

export class FieldConfigProperty {
  static readonly Thresholds = 'thresholds';
}

export function getFieldDisplayName(field: Field): string {
  return field.name;
}

export const PanelPlugin = class {
  constructor(public panel: any) {}
  setPanelOptions(fn: any) { return this; }
  useFieldConfig() { return this; }
};

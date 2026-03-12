// ─────────────────────────────────────────────────────────────
// editor/ValueMappingsMini.tsx – Inline value-mapping editor
// Supports value, comparison, range, regex types
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { Button, IconButton, Select, Input, ColorPicker, useTheme2 } from '@grafana/ui';
import { t } from '../../i18n';
import type { ValueMapping } from '../../types';
import { VALUE_MAPPING_TYPE_OPTIONS, VM_OP_OPTIONS } from './constants';

interface Props {
  mappings: ValueMapping[];
  onChange: (vms: ValueMapping[]) => void;
}

export const ValueMappingsMini: React.FC<Props> = ({ mappings, onChange: onVmChange }) => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const fgMuted = isDark ? '#999' : '#666';
  const borderAlpha = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)';

  const addVm = () => {
    onVmChange([...mappings, { type: 'value', value: '', text: '', color: '' }]);
  };

  const updateVm = (idx: number, patch: Partial<ValueMapping>) => {
    onVmChange(mappings.map((vm, i) => (i === idx ? { ...vm, ...patch } : vm)));
  };

  const removeVm = (idx: number) => {
    onVmChange(mappings.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ marginLeft: 24, marginBottom: 6 }}>
      <Button icon="exchange-alt" variant="secondary" size="sm" fill="text" onClick={addVm}
        style={{ fontSize: 10, padding: '0 4px', marginBottom: 2 }}>
        Value mapping
      </Button>
      {mappings.map((vm, vi) => (
        <div
          key={vi}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
            padding: '2px 0',
            flexWrap: 'wrap',
          }}
        >
          {/* Color circle */}
          <ColorPicker color={vm.color || '#73BF69'} onChange={(c) => updateVm(vi, { color: c })} />
          {/* Type selector */}
          <div style={{ width: 80, flexShrink: 0 }}>
            <Select
              options={VALUE_MAPPING_TYPE_OPTIONS}
              value={VALUE_MAPPING_TYPE_OPTIONS.find(o => o.value === (vm.type || 'value'))}
              onChange={(v) => updateVm(vi, { type: (v?.value || 'value') as any })}
              menuPlacement="auto"
            />
          </div>
          {/* Inputs based on type */}
          {(!vm.type || vm.type === 'value') && (
            <Input
              value={vm.value}
              onChange={(e) => updateVm(vi, { value: e.currentTarget.value })}
              placeholder={t('vm.valuePlaceholder')}
              style={{ fontSize: 11, width: 70, flexShrink: 0 }}
            />
          )}
          {vm.type === 'comparison' && (
            <>
              <div style={{ width: 56, flexShrink: 0 }}>
                <Select
                  options={VM_OP_OPTIONS}
                  value={VM_OP_OPTIONS.find(o => o.value === (vm.op || '='))}
                  onChange={(v) => updateVm(vi, { op: (v?.value || '=') as any })}
                  menuPlacement="auto"
                />
              </div>
              <Input
                value={vm.value}
                onChange={(e) => updateVm(vi, { value: e.currentTarget.value })}
                placeholder={t('vm.valuePlaceholder2')}
                style={{ fontSize: 11, width: 70, flexShrink: 0 }}
              />
            </>
          )}
          {vm.type === 'range' && (
            <>
              <Input
                value={vm.from || ''}
                onChange={(e) => updateVm(vi, { from: e.currentTarget.value })}
                placeholder="From"
                style={{ fontSize: 11, width: 55, flexShrink: 0 }}
              />
              <span style={{ color: fgMuted, fontSize: 11, flexShrink: 0 }}>~</span>
              <Input
                value={vm.to || ''}
                onChange={(e) => updateVm(vi, { to: e.currentTarget.value })}
                placeholder="To"
                style={{ fontSize: 11, width: 55, flexShrink: 0 }}
              />
            </>
          )}
          {vm.type === 'regex' && (
            <Input
              value={vm.pattern || vm.value}
              onChange={(e) => updateVm(vi, { pattern: e.currentTarget.value, value: e.currentTarget.value })}
              placeholder="/pattern/i"
              style={{ fontSize: 11, width: 90, flexShrink: 0 }}
            />
          )}
          <span style={{ color: fgMuted, fontSize: 11, flexShrink: 0 }}>&rarr;</span>
          <Input
            value={vm.text}
            onChange={(e) => updateVm(vi, { text: e.currentTarget.value })}
            placeholder={t('vm.textPlaceholder')}
            style={{ fontSize: 11, flex: 1, minWidth: 60 }}
          />
          <IconButton name="trash-alt" size="sm" tooltip={t('vm.delete')} onClick={() => removeVm(vi)} />
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// GlobalThresholdsEditor.tsx – Editor visual de umbrales globales
// Con operadores de comparacion y reordenamiento drag-and-drop
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useRef, useState } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Button, IconButton, Input, Select, ColorPicker, useTheme2 } from '@grafana/ui';
import { ThresholdOp } from '../types';
import { t } from '../i18n';

interface ThresholdStep {
  value: number;
  color: string;
  op?: ThresholdOp;
}

interface ThresholdsConfig {
  mode: 'absolute' | 'percentage';
  steps: ThresholdStep[];
}

type Props = StandardEditorProps<ThresholdsConfig>;

const DEFAULT_THRESHOLDS: ThresholdsConfig = {
  mode: 'absolute',
  steps: [{ value: -Infinity, color: '#73BF69', op: '>=' }],
};

const PRESET_COLORS = [
  '#73BF69', '#FF9830', '#F2495C', '#5794F2', '#B877D9',
  '#FADE2A', '#37872D', '#C4162A', '#8AB8FF', '#FF7383',
];

const OP_OPTIONS: Array<SelectableValue<ThresholdOp>> = [
  { label: '>=', value: '>=' },
  { label: '>',  value: '>' },
  { label: '<=', value: '<=' },
  { label: '<',  value: '<' },
  { label: '=',  value: '=' },
  { label: '!=', value: '!=' },
];

export const GlobalThresholdsEditor: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const fg = isDark ? '#fff' : '#000';
  const fgMuted = isDark ? '#ccc' : '#444';
  const borderAlpha = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)';

  const config = value || DEFAULT_THRESHOLDS;
  const steps = config.steps || [{ value: -Infinity, color: '#73BF69', op: '>=' }];

  // Separate base (always last) from user steps (keep user order)
  const baseIdx = steps.findIndex((s) => !isFinite(s.value));
  const base = baseIdx >= 0 ? steps[baseIdx] : { value: -Infinity, color: '#73BF69', op: '>=' as ThresholdOp };
  const userSteps = steps.filter((s) => isFinite(s.value));

  // ── Drag state ──
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const updateStep = useCallback(
    (userIdx: number, patch: Partial<ThresholdStep>) => {
      const updated = userSteps.map((s, i) => (i === userIdx ? { ...s, ...patch } : s));
      onChange({ ...config, steps: [...updated, base] });
    },
    [userSteps, base, config, onChange]
  );

  const updateBase = useCallback(
    (patch: Partial<ThresholdStep>) => {
      onChange({ ...config, steps: [...userSteps, { ...base, ...patch }] });
    },
    [userSteps, base, config, onChange]
  );

  const removeStep = useCallback(
    (userIdx: number) => {
      onChange({ ...config, steps: [...userSteps.filter((_, i) => i !== userIdx), base] });
    },
    [userSteps, base, config, onChange]
  );

  const addStep = useCallback(() => {
    const maxVal = userSteps.length > 0 ? Math.max(...userSteps.map((s) => s.value)) : 0;
    const newVal = maxVal > 0 ? maxVal + 10 : 80;
    const usedColors = new Set([...userSteps.map((s) => s.color), base.color]);
    const nextColor = PRESET_COLORS.find((c) => !usedColors.has(c)) || '#F2495C';
    const newStep: ThresholdStep = { value: newVal, color: nextColor, op: '>=' };
    onChange({ ...config, steps: [...userSteps, newStep, base] });
  }, [userSteps, base, config, onChange]);

  // ── Drag handlers ──
  const onDragStart = useCallback((idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const onDrop = useCallback(
    (dropIdx: number) => {
      const fromIdx = dragRef.current;
      if (fromIdx === null || fromIdx === dropIdx) {
        setDragIdx(null);
        setDragOverIdx(null);
        return;
      }
      const reordered = [...userSteps];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(dropIdx, 0, moved);
      onChange({ ...config, steps: [...reordered, base] });
      setDragIdx(null);
      setDragOverIdx(null);
      dragRef.current = null;
    },
    [userSteps, base, config, onChange]
  );

  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
    dragRef.current = null;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Add threshold button */}
      <div style={{ marginBottom: 6 }}>
        <Button icon="plus" variant="secondary" size="sm" fill="text" onClick={addStep}>
          Add threshold
        </Button>
      </div>

      {/* User threshold rows (draggable) */}
      {userSteps.map((step, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={(e) => onDragOver(e, idx)}
          onDrop={() => onDrop(idx)}
          onDragEnd={onDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
            padding: '3px 0',
            opacity: dragIdx === idx ? 0.4 : 1,
            borderTop: dragOverIdx === idx && dragIdx !== idx ? '2px solid #aaa' : '2px solid transparent',
            cursor: 'grab',
          }}
        >
          {/* Drag handle */}
          <div style={{ cursor: 'grab', color: fg, fontSize: 14, width: 14, textAlign: 'center', flexShrink: 0 }}>
            &#x2630;
          </div>

          {/* Color swatch */}
          <ColorPicker color={step.color} onChange={(c) => updateStep(idx, { color: c })} />

          {/* Operator select */}
          <div style={{ width: 60, flexShrink: 0 }}>
            <Select
              options={OP_OPTIONS}
              value={OP_OPTIONS.find((o) => o.value === (step.op || '>='))}
              onChange={(v) => updateStep(idx, { op: (v?.value || '>=') as ThresholdOp })}
              menuPlacement="auto"
            />
          </div>

          {/* Value input */}
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              value={step.value}
              onChange={(e) => updateStep(idx, { value: parseFloat(e.currentTarget.value) || 0 })}
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Delete */}
          <IconButton name="trash-alt" size="sm" tooltip={t('globalTh.delete')} onClick={() => removeStep(idx)} />
        </div>
      ))}

      {/* Base row (non-draggable) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          padding: '3px 0',
        }}
      >
        <div style={{ width: 14, flexShrink: 0 }} />
        <ColorPicker color={base.color} onChange={(c) => updateBase({ color: c })} />
        <div style={{ flex: 1, fontSize: 13, color: fg, paddingLeft: 4, fontWeight: 600 }}>
          Base
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: fg, marginBottom: 4 }}>
          Thresholds mode
          <div style={{ fontSize: 10, color: fgMuted }}>
            Percentage means thresholds relative to min &amp; max
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            onClick={() => onChange({ ...config, mode: 'absolute' })}
            style={{
              padding: '4px 12px', fontSize: 12,
              border: `1px solid ${borderAlpha}`,
              borderRadius: '4px 0 0 4px', cursor: 'pointer',
              background: config.mode === 'absolute' ? fg : 'transparent',
              color: config.mode === 'absolute' ? (isDark ? '#000' : '#fff') : fg,
              fontWeight: config.mode === 'absolute' ? 600 : 400,
            }}
          >
            Absolute
          </button>
          <button
            onClick={() => onChange({ ...config, mode: 'percentage' })}
            style={{
              padding: '4px 12px', fontSize: 12,
              border: `1px solid ${borderAlpha}`, borderLeft: 'none',
              borderRadius: '0 4px 4px 0', cursor: 'pointer',
              background: config.mode === 'percentage' ? fg : 'transparent',
              color: config.mode === 'percentage' ? (isDark ? '#000' : '#fff') : fg,
              fontWeight: config.mode === 'percentage' ? 600 : 400,
            }}
          >
            Percentage
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// editor/MetricThresholdsMini.tsx – Inline threshold editor
// Drag-and-drop reorder, color picker, operator, value, delete
// ─────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { Button, IconButton, Select, Input, ColorPicker, useTheme2 } from '@grafana/ui';
import { t } from '../../i18n';
import type { MetricThreshold, ThresholdOp } from '../../types';
import { THRESHOLD_OP_OPTIONS, THRESHOLD_PRESET_COLORS } from './constants';

interface Props {
  thresholds: MetricThreshold[];
  onChange: (ths: MetricThreshold[]) => void;
}

export const MetricThresholdsMini: React.FC<Props> = ({ thresholds, onChange: onThChange }) => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const fgMuted = isDark ? '#999' : '#666';
  const borderAlpha = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)';
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const addTh = () => {
    const maxVal = thresholds.length > 0 ? Math.max(...thresholds.map((t) => t.value)) : 0;
    const newVal = maxVal > 0 ? maxVal + 10 : 80;
    const used = new Set(thresholds.map((t) => t.color));
    const nextColor = THRESHOLD_PRESET_COLORS.find((c) => !used.has(c)) || '#F2495C';
    onThChange([...thresholds, { value: newVal, color: nextColor, op: '>=' }]);
  };

  const updateTh = (idx: number, patch: Partial<MetricThreshold>) => {
    onThChange(thresholds.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeTh = (idx: number) => {
    onThChange(thresholds.filter((_, i) => i !== idx));
  };

  const onDragStart = (idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const onDrop = (dropIdx: number) => {
    const from = dragRef.current;
    if (from === null || from === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...thresholds];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIdx, 0, moved);
    onThChange(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    dragRef.current = null;
  };
  const onDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
    dragRef.current = null;
  };

  return (
    <div style={{ marginLeft: 24, marginBottom: 6 }}>
      <Button icon="plus" variant="secondary" size="sm" fill="text" onClick={addTh}
        style={{ fontSize: 10, padding: '0 4px', marginBottom: 2 }}>
        Threshold
      </Button>
      {thresholds.map((th, ti) => (
        <div
          key={ti}
          draggable
          onDragStart={() => onDragStart(ti)}
          onDragOver={(e) => onDragOver(e, ti)}
          onDrop={() => onDrop(ti)}
          onDragEnd={onDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2,
            padding: '2px 0',
            opacity: dragIdx === ti ? 0.4 : 1,
            borderTop: dragOverIdx === ti && dragIdx !== ti ? '2px solid #aaa' : '2px solid transparent',
            cursor: 'grab',
          }}
        >
          {/* Drag handle */}
          <div style={{ cursor: 'grab', color: fgMuted, fontSize: 12, width: 12, textAlign: 'center', flexShrink: 0 }}>
            &#x2630;
          </div>
          {/* Color circle */}
          <ColorPicker color={th.color} onChange={(c) => updateTh(ti, { color: c })} />
          {/* Operator */}
          <div style={{ width: 56, flexShrink: 0 }}>
            <Select
              options={THRESHOLD_OP_OPTIONS}
              value={THRESHOLD_OP_OPTIONS.find((o) => o.value === (th.op || '>='))}
              onChange={(v) => updateTh(ti, { op: (v?.value || '>=') as ThresholdOp })}
              menuPlacement="auto"
            />
          </div>
          {/* Value */}
          <div style={{ flex: 1 }}>
            <Input
              type="number"
              value={th.value}
              onChange={(e) => updateTh(ti, { value: parseFloat(e.currentTarget.value) || 0 })}
              style={{ fontSize: 12 }}
            />
          </div>
          {/* Delete */}
          <IconButton name="trash-alt" size="sm" tooltip={t('threshold.delete')} onClick={() => removeTh(ti)} />
        </div>
      ))}
    </div>
  );
};

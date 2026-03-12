// ─────────────────────────────────────────────────────────────
// LayersEditor.tsx – Multi-SVG layer management
// Add/remove/reorder overlay SVG layers that stack on the base SVG.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, useTheme2 } from '@grafana/ui';
import { SvgLayer } from '../types';
import { t } from '../i18n';

type Props = StandardEditorProps<SvgLayer[]>;

export const LayersEditor: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme2();
  const layers: SvgLayer[] = value || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addLayer = useCallback(() => {
    const id = `layer-${Date.now()}`;
    const newLayer: SvgLayer = {
      id,
      name: t('layers.defaultName', { n: String(layers.length + 1) }),
      svgSource: '',
      visible: true,
      opacity: 1,
      zIndex: layers.length + 1,
    };
    onChange([...layers, newLayer]);
    setExpandedId(id);
  }, [layers, onChange]);

  const removeLayer = useCallback((id: string) => {
    onChange(layers.filter(l => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [layers, onChange, expandedId]);

  const updateLayer = useCallback((id: string, patch: Partial<SvgLayer>) => {
    onChange(layers.map(l => l.id === id ? { ...l, ...patch } : l));
  }, [layers, onChange]);

  const moveLayer = useCallback((idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    const copy = [...layers];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    // Re-assign zIndex based on position
    const updated = copy.map((l, i) => ({ ...l, zIndex: i + 1 }));
    onChange(updated);
  }, [layers, onChange]);

  const sectionStyle: React.CSSProperties = {
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: 4,
    marginBottom: 6,
    background: theme.colors.background.secondary,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: 13,
  };

  return (
    <div>
      {layers.map((layer, idx) => (
        <div key={layer.id} style={sectionStyle}>
          <div style={headerStyle} onClick={() => setExpandedId(expandedId === layer.id ? null : layer.id)}>
            <span style={{ flex: 1, fontWeight: 500 }}>
              {expandedId === layer.id ? '▼' : '▶'} {layer.name}
            </span>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: e.target.checked }); }}
              />
              Visible
            </label>
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); moveLayer(idx, -1); }} title={t('layers.moveUp')}>↑</Button>
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); moveLayer(idx, 1); }} title={t('layers.moveDown')}>↓</Button>
            <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} title={t('layers.delete')}>✕</Button>
          </div>

          {expandedId === layer.id && (
            <div style={{ padding: '6px 8px' }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12 }}>{t('layers.name')}</label>
                <input
                  type="text"
                  value={layer.name}
                  onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 12,
                    background: theme.colors.background.canvas,
                    color: theme.colors.text.primary,
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 3,
                  }}
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12 }}>{t('layers.opacity')} {Math.round(layer.opacity * 100)}%</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(e) => updateLayer(layer.id, { opacity: parseFloat(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12 }}>SVG / Draw.io XML</label>
                <textarea
                  value={layer.svgSource}
                  onChange={(e) => updateLayer(layer.id, { svgSource: e.target.value })}
                  rows={8}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    background: theme.colors.background.canvas,
                    color: theme.colors.text.primary,
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 3,
                    resize: 'vertical',
                  }}
                  placeholder={t('layers.svgPlaceholder')}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <Button size="sm" variant="secondary" icon="plus" onClick={addLayer}>
        {t('layers.add')}
      </Button>
    </div>
  );
};

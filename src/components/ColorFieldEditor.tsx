import { StandardEditorProps } from '@grafana/data';
import { ColorPicker } from '@grafana/ui';

export const ColorFieldEditor: React.FC<StandardEditorProps<string>> = ({ value, onChange }) => {
  const current = value || 'rgba(15, 23, 42, 0.95)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ColorPicker color={current} onChange={onChange} />
      <span style={{ fontSize: 12, opacity: 0.7 }}>{current}</span>
    </div>
  );
};

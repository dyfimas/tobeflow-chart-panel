// ─────────────────────────────────────────────────────────────
// SvgInlineEditor.tsx – WYSIWYG SVG editor with code + preview
// Replaces the plain textarea for svgSource editing.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, useTheme2 } from '@grafana/ui';
import { isDrawioXml, drawioToSvg, sanitizeSvg } from '../utils';
import { t } from '../i18n';

type Props = StandardEditorProps<string>;

type ViewMode = 'code' | 'preview' | 'split';

export const SvgInlineEditor: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const [mode, setMode] = useState<ViewMode>('code');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  // Compute preview SVG
  useEffect(() => {
    if (!value?.trim()) {
      setPreviewHtml('');
      return;
    }
    let raw = value;
    if (isDrawioXml(raw)) {
      try {
        raw = drawioToSvg(raw);
      } catch {
        setPreviewHtml(`<em>${t('svgEditor.convertError')}</em>`);
        return;
      }
    }
    setPreviewHtml(sanitizeSvg(raw));
  }, [value]);

  // Attach hover listeners to preview for cell ID detection
  useEffect(() => {
    const container = previewRef.current;
    if (!container || mode === 'code') return;

    // Inject HTML
    container.innerHTML = previewHtml;

    // Resize SVG
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.setAttribute('width', '100%');
      svgEl.setAttribute('height', '100%');
      svgEl.style.maxWidth = '100%';
    }

    // Cell ID hover detection
    const groups = container.querySelectorAll('g[data-cell-id]');
    const listeners: Array<() => void> = [];

    groups.forEach((g) => {
      const cellId = g.getAttribute('data-cell-id') || '';
      if (!cellId || cellId === '0' || cellId === '1') return;

      const enter = () => {
        setHoveredCell(cellId);
        const shapes = g.querySelectorAll('path, rect, ellipse, polygon, circle');
        shapes.forEach((s) => {
          (s as SVGElement).style.outline = '2px solid #5794f2';
          (s as SVGElement).style.outlineOffset = '1px';
        });
      };
      const leave = () => {
        setHoveredCell(null);
        const shapes = g.querySelectorAll('path, rect, ellipse, polygon, circle');
        shapes.forEach((s) => {
          (s as SVGElement).style.outline = '';
          (s as SVGElement).style.outlineOffset = '';
        });
      };
      const click = () => {
        // Copy cell ID to clipboard
        navigator.clipboard?.writeText(cellId);
        setHoveredCell(`${cellId} ${t('svgEditor.copied')}`);
        setTimeout(() => setHoveredCell(null), 1200);
      };

      g.addEventListener('mouseenter', enter);
      g.addEventListener('mouseleave', leave);
      g.addEventListener('click', click);
      listeners.push(
        () => g.removeEventListener('mouseenter', enter),
        () => g.removeEventListener('mouseleave', leave),
        () => g.removeEventListener('click', click)
      );
    });

    return () => listeners.forEach((fn) => fn());
  }, [previewHtml, mode]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const bgCode = isDark ? '#0d1117' : '#fafbfc';
  const fgCode = isDark ? '#c9d1d9' : '#24292e';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <Button
          size="sm" fill={mode === 'code' ? 'solid' : 'text'}
          variant={mode === 'code' ? 'primary' : 'secondary'}
          onClick={() => setMode('code')}
        >
          {t('svgEditor.code')}
        </Button>
        <Button
          size="sm" fill={mode === 'preview' ? 'solid' : 'text'}
          variant={mode === 'preview' ? 'primary' : 'secondary'}
          onClick={() => setMode('preview')}
        >
          {t('svgEditor.preview')}
        </Button>
        <Button
          size="sm" fill={mode === 'split' ? 'solid' : 'text'}
          variant={mode === 'split' ? 'primary' : 'secondary'}
          onClick={() => setMode('split')}
        >
          Split
        </Button>
        {hoveredCell && (
          <span style={{
            marginLeft: 8, fontSize: 11, fontFamily: 'monospace',
            background: isDark ? '#1a1a2e' : '#eee', padding: '2px 6px', borderRadius: 3,
          }}>
            cell-id: {hoveredCell}
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{
        display: 'flex', gap: 4,
        height: mode === 'split' ? 300 : mode === 'code' ? 'auto' : 250,
      }}>
        {/* Code pane */}
        {(mode === 'code' || mode === 'split') && (
          <textarea
            value={value || ''}
            onChange={handleCodeChange}
            spellCheck={false}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: '1.5',
              background: bgCode,
              color: fgCode,
              border: `1px solid ${borderColor}`,
              borderRadius: 4,
              padding: 8,
              resize: mode === 'code' ? 'vertical' : 'none',
              minHeight: mode === 'code' ? 180 : undefined,
              overflow: 'auto',
              tabSize: 2,
            }}
          />
        )}

        {/* Preview pane */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            ref={previewRef}
            style={{
              flex: 1,
              border: `1px solid ${borderColor}`,
              borderRadius: 4,
              padding: 4,
              overflow: 'auto',
              background: isDark ? '#1a1a2e' : '#fff',
              cursor: 'crosshair',
              minHeight: mode === 'preview' ? 250 : undefined,
            }}
          />
        )}
      </div>
    </div>
  );
};

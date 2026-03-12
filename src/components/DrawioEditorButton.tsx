// ─────────────────────────────────────────────────────────────
// DrawioEditorButton.tsx – Embeds draw.io editor via iframe
// Uses the embed API: https://www.drawio.com/doc/faq/embed-mode
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, useTheme2 } from '@grafana/ui';
import { isDrawioXml } from '../utils';
import { t } from '../i18n';

type Props = StandardEditorProps<string>;

const DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&configure=1';

/** Detect if content looks like SVG markup */
function isSvgContent(s: string): boolean {
  const trimmed = s.trimStart();
  return trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'));
}

/** Convert plain SVG to mxGraphModel XML wrapping it as an image shape */
function svgToDrawioXml(svg: string): string {
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  // %3B and %2C escape ; and , so mxGraph style-parser doesn't split the data URI
  const imgUri = 'data:image/svg+xml%3Bbase64%2C' + b64;
  // Extract dimensions from SVG attributes or viewBox
  const wAttr = svg.match(/\bwidth=["'](\d+)/);
  const hAttr = svg.match(/\bheight=["'](\d+)/);
  const vb = svg.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
  const w = wAttr ? wAttr[1] : vb ? String(Math.round(parseFloat(vb[1]))) : '800';
  const h = hAttr ? hAttr[1] : vb ? String(Math.round(parseFloat(vb[2]))) : '600';
  return (
    '<mxGraphModel><root>' +
    '<mxCell id="0"/>' +
    '<mxCell id="1" parent="0"/>' +
    '<mxCell id="2" value="" style="shape=image;aspect=fixed;imageAspect=0;image=' + imgUri + ';" vertex="1" parent="1">' +
    '<mxGeometry width="' + w + '" height="' + h + '" as="geometry"/>' +
    '</mxCell></root></mxGraphModel>'
  );
}

/**
 * Extract embedded Draw.io XML from SVG exported as xmlsvg.
 * Draw.io stores the diagram data URL-encoded in the content attribute of <svg>.
 */
function extractEmbeddedDrawio(svg: string): string | null {
  const m = svg.match(/\bcontent="([^"]+)"/);
  if (!m) { return null; }
  try {
    const decoded = decodeURIComponent(m[1]);
    return isDrawioXml(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export const DrawioEditorButton: React.FC<Props> = ({ value, onChange, context }) => {
  const theme = useTheme2();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedXmlRef = useRef<string>(value || '');

  // Keep savedXmlRef in sync with value
  useEffect(() => {
    savedXmlRef.current = value || '';
  }, [value]);

  // Detect cell IDs in SVG content for post-save notification
  const detectCellIds = useCallback((svgContent: string): string[] => {
    const ids: string[] = [];
    const re = /data-cell-id="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svgContent)) !== null) {
      if (m[1] !== '0' && m[1] !== '1') ids.push(m[1]);
    }
    return ids;
  }, []);

  const handleMessage = useCallback((evt: MessageEvent) => {
    // Only accept messages from diagrams.net
    if (!evt.data || typeof evt.data !== 'string') return;
    let msg: { event: string; xml?: string; data?: string };
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.event === 'configure') {
      // Send configuration to drawio
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          action: 'configure',
          config: {
            darkMode: theme.isDark,
            defaultFonts: ['Arial', 'Helvetica', 'monospace'],
          },
        }),
        '*'
      );
    } else if (msg.event === 'init') {
      setLoading(false);
      const src = savedXmlRef.current;
      let xmlToLoad = '';
      if (src && isDrawioXml(src)) {
        // Native Draw.io XML → load directly
        xmlToLoad = src;
      } else if (src && isSvgContent(src)) {
        // SVG — check for embedded Draw.io data (from a previous xmlsvg export)
        const embedded = extractEmbeddedDrawio(src);
        if (embedded) {
          // Re-edit: load the embedded mxGraphModel
          xmlToLoad = embedded;
        } else {
          // Plain SVG: wrap as image shape so it appears on the canvas
          xmlToLoad = svgToDrawioXml(src);
        }
      }
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ action: 'load', xml: xmlToLoad }),
        '*'
      );
    } else if (msg.event === 'save') {
      // Export as xmlsvg: SVG renderable by the panel + embedded Draw.io data for re-editing
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ action: 'export', format: 'xmlsvg' }),
        '*'
      );
    } else if (msg.event === 'export') {
      let result = msg.data || '';
      // xmlsvg format returns a data URI — decode to raw SVG string
      if (typeof result === 'string' && result.startsWith('data:image/svg+xml;base64,')) {
        try {
          result = decodeURIComponent(
            escape(atob(result.substring('data:image/svg+xml;base64,'.length)))
          );
        } catch { /* keep raw */ }
      }
      if (result) {
        // Detect new cell IDs vs previous version
        const prevIds = new Set(detectCellIds(savedXmlRef.current));
        const newIds = detectCellIds(result).filter(id => !prevIds.has(id));
        onChange(result);
        if (newIds.length > 0) {
          window.dispatchEvent(new CustomEvent('svgflow-new-cells', { detail: { cellIds: newIds } }));
        }
      }
      setOpen(false);
    } else if (msg.event === 'exit') {
      setOpen(false);
    }
  }, [onChange, theme.isDark, detectCellIds]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, handleMessage]);

  const hasDrawio = value ? isDrawioXml(value) : false;
  const hasSvg = !hasDrawio && value ? isSvgContent(value) : false;
  const hasContent = hasDrawio || hasSvg;

  if (open) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: theme.isDark ? '#1a1a2e' : '#f0f0f0',
          borderBottom: `1px solid ${theme.isDark ? '#333' : '#ccc'}`,
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span>Draw.io Editor — SVG Flow Panel</span>
          <Button icon="times" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {t('drawio.closeNoSave')}
          </Button>
        </div>
        {loading && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff', fontSize: 14, zIndex: 10001,
          }}>
            {t('drawio.loading')}
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={DRAWIO_EMBED_URL}
          style={{ flex: 1, border: 'none', width: '100%' }}
          title="Draw.io Editor"
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Button
        icon="pen"
        variant={hasContent ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {hasDrawio ? t('drawio.edit') : hasSvg ? t('drawio.editSvg') : t('drawio.create')}
      </Button>
      {hasDrawio && (
        <span style={{ fontSize: 11, color: theme.isDark ? '#aaa' : '#666' }}>
          {t('drawio.xmlDetected')}
        </span>
      )}
      {hasSvg && (
        <span style={{ fontSize: 11, color: theme.isDark ? '#aaa' : '#666' }}>
          {t('drawio.svgDetected')}
        </span>
      )}
    </div>
  );
};

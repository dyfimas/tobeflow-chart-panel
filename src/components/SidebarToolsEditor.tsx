// ─────────────────────────────────────────────────────────────
// SidebarToolsEditor.tsx – Sidebar: search + severity summary
// M5: Severity summary counts from panel
// P6: Search input dispatches events to panel
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Input, useTheme2 } from '@grafana/ui';
import { Severity, SEVERITY_COLORS } from '../types';
import { t } from '../i18n';

type Props = StandardEditorProps<undefined>;

const SEVERITY_LABELS: Record<string, string> = {
  [Severity.NORMAL]: 'OK',
  [Severity.WARNING]: 'Warning',
  [Severity.MINOR]: 'Minor',
  [Severity.MAJOR]: 'Major',
  [Severity.CRITICO]: t('severity.critico'),
  [Severity.SIN_DATOS]: t('severity.sinDatos'),
};

const SEVERITY_ORDER = [
  Severity.CRITICO,
  Severity.MAJOR,
  Severity.MINOR,
  Severity.WARNING,
  Severity.NORMAL,
  Severity.SIN_DATOS,
];

export const SidebarToolsEditor: React.FC<Props> = () => {
  const theme = useTheme2();
  const isDark = theme.isDark;
  const fg = isDark ? '#fff' : '#000';
  const fgMuted = isDark ? '#ccc' : '#444';
  const borderAlpha = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const bgSubtle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatchSearch = useCallback((q: string) => {
    window.dispatchEvent(new CustomEvent('svgflow-search', { detail: { query: q } }));
  }, []);

  const onSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.currentTarget.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => dispatchSearch(q), 200);
  }, [dispatchSearch]);

  const onSearchClear = useCallback(() => {
    setSearchQuery('');
    dispatchSearch('');
  }, [dispatchSearch]);

  // Clean up search on unmount (restore full opacity)
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('svgflow-search', { detail: { query: '' } }));
    };
  }, []);

  // ── Severity summary ──
  const [summary, setSummary] = useState<Record<string, number>>({});

  useEffect(() => {
    const onSummary = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') {
        setSummary({ ...detail });
      }
    };
    window.addEventListener('svgflow-severity-summary', onSummary);
    return () => window.removeEventListener('svgflow-severity-summary', onSummary);
  }, []);

  const total = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Search */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: fg, marginBottom: 4 }}>{t('sidebar.searchCell')}</div>
        <Input
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Cell ID o texto..."
          prefix={<span style={{ fontSize: 13 }}>&#128269;</span>}
          suffix={searchQuery ? (
            <span
              onClick={onSearchClear}
              style={{ cursor: 'pointer', fontSize: 13, color: fgMuted }}
              title={t('sidebar.clear')}
            >&times;</span>
          ) : undefined}
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Severity summary */}
      {total > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: fg, marginBottom: 4 }}>
            {t('sidebar.statusSummary', { n: String(total) })}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 3,
          }}>
            {SEVERITY_ORDER.map((sev) => {
              const count = summary[sev] || 0;
              if (count === 0) return null;
              const sevColor = SEVERITY_COLORS[sev];
              return (
                <div
                  key={sev}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: bgSubtle,
                    border: `1px solid ${borderAlpha}`,
                    fontSize: 11,
                  }}
                >
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: sevColor,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: fgMuted, flex: 1 }}>{SEVERITY_LABELS[sev] || sev}</span>
                  <span style={{ fontWeight: 700, color: fg }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

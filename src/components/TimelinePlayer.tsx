// ─────────────────────────────────────────────────────────────
// TimelinePlayer.tsx – Playback controls for time-series replay
// Renders a scrubber bar with play/pause/speed controls.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

interface TimelinePlayerProps {
  timestamps: number[];
  currentIndex: number | null;
  onIndexChange: (idx: number | null) => void;
}

const SPEEDS = [1, 2, 4, 0.5];

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  timestamps,
  currentIndex,
  onIndexChange,
}) => {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(currentIndex);

  // Keep ref in sync
  indexRef.current = currentIndex;

  const speed = SPEEDS[speedIdx % SPEEDS.length];

  const stop = useCallback(() => {
    setPlaying(false);
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (timestamps.length <= 1) return;
    stop();
    setPlaying(true);
    // If at end or not started, start from beginning
    let startIdx = indexRef.current ?? 0;
    if (startIdx >= timestamps.length - 1) startIdx = 0;
    onIndexChange(startIdx);

    timerRef.current = setInterval(() => {
      const next = (indexRef.current ?? 0) + 1;
      if (next >= timestamps.length) {
        stop();
        return;
      }
      onIndexChange(next);
    }, 1000 / speed);
  }, [timestamps, speed, onIndexChange, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current != null) clearInterval(timerRef.current); };
  }, []);

  // Restart interval when speed changes during playback
  useEffect(() => {
    if (playing) {
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedIdx]);

  const goLive = useCallback(() => {
    stop();
    onIndexChange(null);
  }, [stop, onIndexChange]);

  const isLive = currentIndex == null;

  if (timestamps.length <= 1) return null;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 4,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 6,
    fontSize: 11,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    userSelect: 'none',
    backdropFilter: 'blur(4px)',
  };

  const btnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    borderRadius: 3,
    color: '#e0e0e0',
    cursor: 'pointer',
    padding: '2px 8px',
    fontSize: 11,
    fontFamily: 'monospace',
  };

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(47, 218, 47, 0.25)',
    color: '#2fda2f',
  };

  return (
    <div style={containerStyle}>
      {/* Play / Pause */}
      <button
        style={btnStyle}
        onClick={() => { if (playing) stop(); else play(); }}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Speed */}
      <button
        style={btnStyle}
        onClick={() => setSpeedIdx((speedIdx + 1) % SPEEDS.length)}
        title={t('timeline.speed', { n: String(speed) })}
      >
        {speed}x
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={timestamps.length - 1}
        value={currentIndex ?? timestamps.length - 1}
        onChange={(e) => {
          const idx = parseInt(e.target.value, 10);
          if (playing) stop();
          onIndexChange(idx);
        }}
        style={{ width: 140, accentColor: '#42a5f5' }}
      />

      {/* Current timestamp label */}
      <span style={{ minWidth: 64, textAlign: 'center' }}>
        {isLive ? 'LIVE' : formatTs(timestamps[currentIndex])}
      </span>

      {/* Live button */}
      <button
        style={isLive ? activeBtnStyle : btnStyle}
        onClick={goLive}
        title={t('timeline.goLive')}
      >
        LIVE
      </button>
    </div>
  );
};

import { memo } from 'react';
import { formatNumber } from '../domain/format';
import type { HistogramBucket } from '../store/logStore';

interface VolumeChartProps {
  buckets: readonly HistogramBucket[];
  width?: number;
  height?: number;
}

/** 60-second stacked event-rate sparkline (INFO / WARN / ERROR). */
export const VolumeChart = memo(function VolumeChart({ buckets, width = 180, height = 28 }: VolumeChartProps) {
  const max = Math.max(1, ...buckets.map((b) => b.INFO + b.WARN + b.ERROR));
  const barW = width / Math.max(1, buckets.length);
  const last = buckets[buckets.length - 2]; // last *complete* second
  const lastTotal = last ? last.INFO + last.WARN + last.ERROR : 0;
  const errors = buckets.reduce((sum, b) => sum + b.ERROR, 0);

  return (
    <figure className="volume" aria-label={`Event volume, last 60 seconds. ${lastTotal} events per second, ${errors} errors.`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        {buckets.map((b, i) => {
          const scale = (height - 2) / max;
          const hE = b.ERROR * scale;
          const hW = b.WARN * scale;
          const hI = b.INFO * scale;
          const x = i * barW + 0.5;
          const w = Math.max(1, barW - 1);
          return (
            <g key={b.t}>
              <rect x={x} y={height - hI} width={w} height={hI} className="vol-info" />
              <rect x={x} y={height - hI - hW} width={w} height={hW} className="vol-warn" />
              <rect x={x} y={height - hI - hW - hE} width={w} height={hE} className="vol-error" />
            </g>
          );
        })}
      </svg>
      <figcaption className="volume-caption mono">
        <strong>{formatNumber(lastTotal)}</strong>
        <span className="muted">/s</span>
      </figcaption>
    </figure>
  );
});

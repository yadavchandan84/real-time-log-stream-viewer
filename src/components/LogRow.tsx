import { memo } from 'react';
import { formatClock, formatIso, serviceHue } from '../domain/format';
import type { LogEntry } from '../domain/types';
import { Highlight } from './Highlight';

interface LogRowProps {
  entry: LogEntry;
  index: number;
  top: number;
  selected: boolean;
  highlight: RegExp | null;
  onSelect: (entry: LogEntry) => void;
}

export const rowDomId = (id: number) => `log-row-${id}`;

/**
 * One virtualized row. Memoized on primitive/stable props so that a stream
 * tick only renders rows that were not mounted before.
 */
export const LogRow = memo(function LogRow({ entry, index, top, selected, highlight, onSelect }: LogRowProps) {
  const level = entry.level.toLowerCase();
  return (
    <div
      id={rowDomId(entry.id)}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      className={`log-row lvl-${level}${entry.incidentId ? ' is-alert' : ''}${selected ? ' is-selected' : ''}`}
      style={{ transform: `translateY(${top}px)` }}
      onClick={() => onSelect(entry)}
    >
      <span role="gridcell" className="cell cell-time" title={formatIso(entry.ts)}>
        {formatClock(entry.ts)}
      </span>
      <span role="gridcell" className="cell cell-level">
        <span className={`level-badge level-${level}`}>{entry.level}</span>
      </span>
      <span
        role="gridcell"
        className="cell cell-service"
        style={{ '--svc-hue': serviceHue(entry.service) } as React.CSSProperties}
      >
        <span className="service-dot" aria-hidden="true" />
        <span className="truncate">{entry.service}</span>
      </span>
      <span role="gridcell" className="cell cell-host truncate">
        {entry.host}
      </span>
      <span role="gridcell" className="cell cell-message">
        <span className="truncate">
          <Highlight text={entry.message} pattern={highlight} />
        </span>
        {entry.incidentId && <span className="incident-chip">{entry.incidentId}</span>}
      </span>
    </div>
  );
});

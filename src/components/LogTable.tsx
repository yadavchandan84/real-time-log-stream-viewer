import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { formatNumber } from '../domain/format';
import type { LogEntry } from '../domain/types';
import { useVirtualRows } from '../hooks/useVirtualRows';
import { indexOfId } from '../store/logStore';
import { useSnapshot } from '../store/StoreContext';
import { Icon } from './Icon';
import { LogRow, rowDomId } from './LogRow';

export interface LogTableHandle {
  /** Move the selection by `delta` rows (clamped). Selects the newest row if nothing is selected. */
  move: (delta: number) => void;
  jumpToLatest: () => void;
  jumpToFirst: () => void;
  focus: () => void;
}

interface LogTableProps {
  ref?: Ref<LogTableHandle>;
  rowHeight: number;
  selectedId: number | null;
  /** open is true for pointer selection (opens the inspector), false for keyboard moves. */
  onSelect: (entry: LogEntry, open: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}

const HEADER_HEIGHT = 32;

/** First index whose id is > `id` (for selections that were filtered out). */
function upperBound(list: readonly LogEntry[], count: number, id: number) {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id <= id) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function LogTable({ ref, rowHeight, selectedId, onSelect, onOpen, onClose }: LogTableProps) {
  const visible = useSnapshot((s) => s.visible);
  const count = useSnapshot((s) => s.visibleCount);
  const offset = useSnapshot((s) => s.visibleOffset);
  const epoch = useSnapshot((s) => s.filterEpoch);
  const highlight = useSnapshot((s) => s.query.highlight);
  const hasQuery = useSnapshot((s) => !s.query.isEmpty || s.filters.services.length > 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Live tail. Turns off when the user scrolls up or picks a row, back on at the bottom.
  const [following, setFollow] = useState(true);
  const { start, end, totalHeight, viewportHeight, scrollToIndex } = useVirtualRows(scrollRef, count, rowHeight, {
    overscan: 12,
    anchorBottom: following,
    headerHeight: HEADER_HEIGHT,
  });

  // --- live tail: pin to bottom in the same frame rows are appended -------
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (following && el) el.scrollTop = el.scrollHeight;
  }, [following, count, rowHeight, viewportHeight]);

  // --- keep the viewport stable when old rows are trimmed from the front --
  const prevOffset = useRef(offset);
  const prevEpoch = useRef(epoch);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const sameList = prevEpoch.current === epoch;
    const dropped = offset - prevOffset.current;
    prevOffset.current = offset;
    prevEpoch.current = epoch;
    if (el && sameList && dropped > 0 && !following) el.scrollTop = Math.max(0, el.scrollTop - dropped * rowHeight);
  }, [offset, epoch, following, rowHeight]);

  // --- after a filter change, keep the selected row in view if it survived
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  const firstEpoch = useRef(epoch);
  useLayoutEffect(() => {
    if (epoch === firstEpoch.current) return;
    const sel = selectedRef.current;
    const idx = sel === null ? -1 : indexOfId(visible, visible.length, sel);
    if (idx >= 0) scrollToIndex(idx, 'center');
    else setFollow(true);
    // Only react to structural list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // --- "N new rows" pill while scrolled away from the tail ---------------
  const absolute = count + offset;
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (following) setAnchor(null);
    else setAnchor((a) => (a === null ? absolute : a));
  }, [following, absolute]);
  useEffect(() => setAnchor(null), [epoch]);
  const unseen = anchor === null ? 0 : Math.max(0, absolute - anchor);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= rowHeight / 2 + 1;
    setFollow(atBottom);
  }, [rowHeight]);

  const jumpToLatest = useCallback(() => {
    setFollow(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (count === 0) return;
      let idx: number;
      if (selectedId === null) {
        idx = delta < 0 ? count - 1 : Math.min(count - 1, Math.floor(scrollRef.current!.scrollTop / rowHeight));
      } else {
        const cur = indexOfId(visible, count, selectedId);
        if (cur >= 0) idx = cur + delta;
        else {
          const ub = upperBound(visible, count, selectedId);
          idx = delta > 0 ? ub + delta - 1 : ub + delta;
        }
      }
      idx = Math.max(0, Math.min(count - 1, idx));
      const entry = visible[idx];
      if (!entry) return;
      setFollow(false);
      onSelect(entry, false);
      scrollToIndex(idx);
    },
    [count, visible, selectedId, rowHeight, onSelect, scrollToIndex],
  );

  const selectFromClick = useCallback(
    (entry: LogEntry) => {
      setFollow(false);
      onSelect(entry, true);
    },
    [onSelect],
  );

  const jumpToFirst = useCallback(() => {
    setFollow(false);
    scrollToIndex(0, 'start');
  }, [scrollToIndex]);

  useImperativeHandle(
    ref,
    () => ({ move, jumpToLatest, jumpToFirst, focus: () => scrollRef.current?.focus() }),
    [move, jumpToLatest, jumpToFirst],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor((viewportHeight - HEADER_HEIGHT) / rowHeight) - 1);
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      PageDown: () => move(page),
      PageUp: () => move(-page),
      Home: () => {
        const first = visible[0];
        if (first) onSelect(first, false);
        jumpToFirst();
      },
      End: () => {
        const last = visible[count - 1];
        if (last) onSelect(last, false);
        jumpToLatest();
      },
      Enter: onOpen,
      Escape: onClose,
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  };

  const rows: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const entry = visible[i]!;
    rows.push(
      <LogRow
        key={entry.id}
        entry={entry}
        index={i}
        top={i * rowHeight}
        selected={entry.id === selectedId}
        highlight={highlight}
        onSelect={selectFromClick}
      />,
    );
  }

  const selectedIndex = selectedId === null ? -1 : indexOfId(visible, count, selectedId);
  const selectedRendered = selectedIndex >= start && selectedIndex < end;

  return (
    <section className="log-table" aria-label="Log stream">
      <div
        ref={scrollRef}
        className="log-scroll"
        role="grid"
        aria-label="Log events"
        aria-rowcount={count + 1}
        aria-colcount={5}
        aria-activedescendant={selectedRendered && selectedId !== null ? rowDomId(selectedId) : undefined}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        style={{ '--row-h': `${rowHeight}px`, '--header-h': `${HEADER_HEIGHT}px` } as React.CSSProperties}
      >
        <div role="row" aria-rowindex={1} className="log-header">
          <span role="columnheader" className="cell cell-time">
            Time
          </span>
          <span role="columnheader" className="cell cell-level">
            Level
          </span>
          <span role="columnheader" className="cell cell-service">
            Service
          </span>
          <span role="columnheader" className="cell cell-host">
            Host
          </span>
          <span role="columnheader" className="cell cell-message">
            Message
          </span>
        </div>
        <div className="log-sizer" style={{ height: totalHeight }} role="rowgroup">
          {rows}
        </div>
        {count === 0 && (
          <div className="log-empty" role="status">
            <Icon name="filter" size={20} />
            <p>{hasQuery ? 'No log lines match the current filters.' : 'Waiting for log events…'}</p>
          </div>
        )}
      </div>

      {!following && count > 0 && (
        <button type="button" className="tail-pill" onClick={jumpToLatest}>
          <Icon name="arrowDown" size={14} />
          {unseen > 0 ? `${formatNumber(unseen)} new ${unseen === 1 ? 'line' : 'lines'}` : 'Jump to latest'}
          <kbd>G</kbd>
        </button>
      )}
    </section>
  );
}

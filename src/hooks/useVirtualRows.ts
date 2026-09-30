import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

export type ScrollAlign = 'auto' | 'start' | 'center' | 'end';

export interface VirtualWindow {
  /** First rendered index (inclusive). */
  start: number;
  /** Last rendered index (exclusive). */
  end: number;
  totalHeight: number;
  viewportHeight: number;
  scrollToIndex: (index: number, align?: ScrollAlign) => void;
}

interface Options {
  overscan?: number;
  /**
   * Live-tail mode: derive the window from the end of the list instead of the
   * last observed scrollTop. The caller pins scrollTop to the bottom in a
   * layout effect, so rows appended by the stream are painted in the same
   * frame — no one-frame blank gap while tailing.
   */
  anchorBottom?: boolean;
  /** Height of a sticky header inside the scroll container (reduces the usable viewport). */
  headerHeight?: number;
}

/**
 * Fixed-row-height windowing.
 *
 * Fixed heights make index ↔ offset mapping pure arithmetic (no measurement,
 * no layout thrash), which keeps scrolling smooth with hundreds of thousands
 * of rows. Only `viewport / rowHeight + 2 * overscan` rows are ever mounted.
 */
export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  { overscan = 10, anchorBottom = false, headerHeight = 0 }: Options = {},
): VirtualWindow {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef]);

  const visibleRows = Math.ceil(Math.max(0, viewportHeight - headerHeight) / rowHeight) + 1;
  const maxFirst = Math.max(0, count - visibleRows + 1);
  const first = anchorBottom ? maxFirst : Math.min(Math.floor(scrollTop / rowHeight), maxFirst);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visibleRows + overscan);

  const scrollToIndex = useCallback(
    (index: number, align: ScrollAlign = 'auto') => {
      const el = scrollRef.current;
      if (!el) return;
      const top = index * rowHeight;
      const bottom = top + rowHeight;
      const view = el.clientHeight - headerHeight;
      let next = el.scrollTop;
      if (align === 'start') next = top;
      else if (align === 'end') next = bottom - view;
      else if (align === 'center') next = top - view / 2 + rowHeight / 2;
      else if (top < el.scrollTop) next = top;
      else if (bottom > el.scrollTop + view) next = bottom - view;
      next = Math.max(0, next);
      if (next !== el.scrollTop) {
        el.scrollTop = next;
        // Sync immediately so the target row is rendered this frame.
        setScrollTop(el.scrollTop);
      }
    },
    [scrollRef, rowHeight, headerHeight],
  );

  return { start, end, totalHeight: count * rowHeight, viewportHeight, scrollToIndex };
}

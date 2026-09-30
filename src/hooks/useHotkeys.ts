import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

/**
 * Global single-key shortcuts. Ignored while the user is typing in a field
 * (except Escape) or when a modifier is held, so browser shortcuts keep working.
 * Handlers are read from a ref so callers can pass inline closures freely.
 */
export function useHotkeys(map: HotkeyMap) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'Escape' && isTypingTarget(e.target)) return;
      const handler = ref.current[e.key];
      if (handler) {
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

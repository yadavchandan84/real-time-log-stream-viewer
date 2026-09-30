import { memo } from 'react';

/** Renders `text` with every match of `pattern` wrapped in <mark>. */
export const Highlight = memo(function Highlight({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index;
    const len = m[0].length;
    if (len === 0) continue; // zero-width regex matches (e.g. /a*/) highlight nothing
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<mark key={start}>{m[0]}</mark>);
    last = start + len;
    if (parts.length > 64) break; // pathological patterns: stop decorating, keep text intact
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
});

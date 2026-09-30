const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** HH:MM:SS.mmm in local time — cheap, allocation-light, used per visible row. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatDateTime = (ts: number) => dateFmt.format(ts);

export const formatIso = (ts: number) => new Date(ts).toISOString();

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${pad(m % 60)}m`;
}

export function formatRelative(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 5_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}

const numberFmt = new Intl.NumberFormat();
export const formatNumber = (n: number) => numberFmt.format(n);

/** Stable per-service hue so a service keeps its colour across sessions. */
export function serviceHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

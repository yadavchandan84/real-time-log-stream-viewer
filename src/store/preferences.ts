import { LEVELS, type LogLevel } from '../domain/types';
import { DEFAULT_FILTERS, type Filters } from './logStore';

export type Theme = 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

export interface Preferences {
  theme: Theme;
  density: Density;
  rate: number;
}

const PREFS_KEY = 'rivyn.prefs';
const THEME_KEY = 'rivyn.theme';

export const RATE_OPTIONS = [5, 20, 100, 500] as const;

function systemTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function loadPreferences(): Preferences {
  const defaults: Preferences = { theme: systemTheme(), density: 'comfortable', rate: 20 };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Preferences>;
    const theme = localStorage.getItem(THEME_KEY);
    return {
      theme: theme === 'light' || theme === 'dark' ? theme : defaults.theme,
      density: raw.density === 'compact' ? 'compact' : 'comfortable',
      rate: RATE_OPTIONS.includes(raw.rate as (typeof RATE_OPTIONS)[number]) ? (raw.rate as number) : defaults.rate,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(p: Preferences) {
  try {
    localStorage.setItem(THEME_KEY, p.theme);
    localStorage.setItem(PREFS_KEY, JSON.stringify({ density: p.density, rate: p.rate }));
  } catch {
    /* storage unavailable (private mode) — preferences are best-effort */
  }
}

// ---- URL state: filters are shareable via the query string -----------------

export function readFiltersFromUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  const levelsParam = params.get('levels');
  let levels = DEFAULT_FILTERS.levels;
  if (levelsParam !== null) {
    const on = new Set(levelsParam.toUpperCase().split(',').filter(Boolean));
    const parsed = Object.fromEntries(LEVELS.map((l) => [l, on.has(l)])) as Record<LogLevel, boolean>;
    if (LEVELS.some((l) => parsed[l])) levels = parsed;
  }
  const services = (params.get('services') ?? '').split(',').filter(Boolean);
  return { levels, query: params.get('q') ?? '', services };
}

export function writeFiltersToUrl(filters: Filters) {
  const params = new URLSearchParams(window.location.search);
  const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key));
  set('q', filters.query.trim() || null);
  const allOn = LEVELS.every((l) => filters.levels[l]);
  set('levels', allOn ? null : LEVELS.filter((l) => filters.levels[l]).join(','));
  set('services', filters.services.length ? filters.services.join(',') : null);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', url);
  }
}

/** `?rows=50000` lets reviewers stress-test the virtualized table. */
export function readInitialRowCount(fallback: number): number {
  const n = Number(new URLSearchParams(window.location.search).get('rows'));
  return Number.isFinite(n) && n >= 100 ? Math.min(Math.floor(n), 500_000) : fallback;
}

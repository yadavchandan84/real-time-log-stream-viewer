import { RATE_OPTIONS, type Density, type Theme } from '../store/preferences';
import { useSnapshot, useStores } from '../store/StoreContext';
import { Icon } from './Icon';
import { VolumeChart } from './VolumeChart';

interface TopBarProps {
  theme: Theme;
  density: Density;
  onThemeChange: (t: Theme) => void;
  onDensityChange: (d: Density) => void;
  onRateChange: (rate: number) => void;
}

export function TopBar({ theme, density, onThemeChange, onDensityChange, onRateChange }: TopBarProps) {
  const { stream, store } = useStores();
  const { running, rate } = useSnapshot((s) => s.stream);
  const histogram = useSnapshot((s) => s.histogram);

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect width="32" height="32" rx="7" className="brand-bg" />
          <path d="M7 10h11M7 16h18M7 22h8" className="brand-lines" strokeWidth="3" strokeLinecap="round" />
          <circle cx="23" cy="22" r="3" className="brand-dot" />
        </svg>
        <span className="brand-name">Rivyn</span>
        <span className="brand-sep" aria-hidden="true">/</span>
        <h1 className="brand-title">Log Stream</h1>
        <span className="env-chip mono">prod · eu-central-1</span>
      </div>

      <div className="topbar-center">
        <span className={`live-indicator${running ? ' is-live' : ''}`} role="status">
          <span className="live-dot" aria-hidden="true" />
          {running ? 'Live' : 'Paused'}
        </span>
        <VolumeChart buckets={histogram} />
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className={`btn${running ? '' : ' is-active'}`}
          onClick={() => stream.toggle()}
          aria-label={running ? 'Pause stream' : 'Resume stream'}
          title={`${running ? 'Pause' : 'Resume'} stream (P)`}
        >
          <Icon name={running ? 'pause' : 'play'} size={14} />
          <span className="hide-sm">{running ? 'Pause' : 'Resume'}</span>
        </button>

        <label className="select-wrap" title="Simulated ingest rate">
          <Icon name="bolt" size={13} />
          <span className="sr-only">Events per second</span>
          <select className="select mono" value={rate} onChange={(e) => onRateChange(Number(e.target.value))}>
            {RATE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} ev/s
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="icon-btn"
          onClick={() => store.clear()}
          aria-label="Clear buffer"
          title="Clear buffer"
        >
          <Icon name="trash" size={15} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
          aria-label={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} density`}
          title="Row density"
        >
          <Icon name={density === 'compact' ? 'rows' : 'rowsCompact'} size={15} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme (T)"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
      </div>
    </header>
  );
}

import { formatNumber } from '../domain/format';
import { useSnapshot } from '../store/StoreContext';

export function StatusBar() {
  const visible = useSnapshot((s) => s.visibleCount);
  const buffered = useSnapshot((s) => s.entryCount);
  const capacity = useSnapshot((s) => s.capacity);
  const ingested = useSnapshot((s) => s.ingested);
  const filterMs = useSnapshot((s) => s.filterMs);
  const hasFiltered = useSnapshot((s) => s.filterEpoch > 0);

  return (
    <footer className="statusbar mono">
      <span>
        <strong>{formatNumber(visible)}</strong> of {formatNumber(buffered)} lines
      </span>
      <span className="hide-sm">
        buffer {Math.round((buffered / capacity) * 100)}% of {formatNumber(capacity)}
      </span>
      <span className="hide-sm">{formatNumber(ingested)} ingested</span>
      <span title="Duration of the last full filter pass over the buffer (new rows are filtered incrementally)">
        filter {hasFiltered ? `${filterMs.toFixed(1)} ms` : '—'}
      </span>
      <span className="statusbar-keys hide-md" aria-label="Keyboard shortcuts">
        <kbd>/</kbd> search <kbd>j</kbd>
        <kbd>k</kbd> move <kbd>↵</kbd> inspect <kbd>Esc</kbd> close <kbd>G</kbd> latest <kbd>P</kbd> pause <kbd>T</kbd> theme
      </span>
    </footer>
  );
}

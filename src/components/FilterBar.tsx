import { useCallback, type Ref } from 'react';
import { formatNumber } from '../domain/format';
import { LEVELS } from '../domain/types';
import { DEFAULT_FILTERS } from '../store/logStore';
import { useSnapshot, useStores } from '../store/StoreContext';
import { ServicePicker } from './ServicePicker';
import { SearchInput } from './SearchInput';

interface FilterBarProps {
  searchRef?: Ref<HTMLInputElement>;
}

export function FilterBar({ searchRef }: FilterBarProps) {
  const { store } = useStores();
  const filters = useSnapshot((s) => s.filters);
  const facets = useSnapshot((s) => s.facets);
  const queryError = useSnapshot((s) => s.query.error);
  const alertsOnly = useSnapshot((s) => s.query.alertsOnly);

  const setQuery = useCallback((query: string) => store.setFilters({ query }), [store]);
  const toggleAlerts = () => {
    const q = filters.query.replace(/(^|\s)is:(alert|incident)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    store.setFilters({ query: alertsOnly ? q : `is:alert ${q}`.trim() });
  };

  const isFiltered =
    filters.query.trim() !== '' || filters.services.length > 0 || LEVELS.some((l) => !filters.levels[l]);

  return (
    <div className="filter-bar" role="search">
      <SearchInput ref={searchRef} value={filters.query} error={queryError} onChange={setQuery} />

      <div className="filter-group" role="group" aria-label="Log levels (Alt+click to solo)">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`level-toggle level-${level.toLowerCase()}`}
            aria-pressed={filters.levels[level]}
            title={`Toggle ${level} · Alt/Shift+click to show only ${level}`}
            onClick={(e) => store.toggleLevel(level, e.altKey || e.shiftKey)}
          >
            <span className="level-toggle-dot" aria-hidden="true" />
            <span>{level}</span>
            <span className="level-toggle-count mono">{formatNumber(facets[level])}</span>
          </button>
        ))}
      </div>

      <div className="filter-group">
        <button type="button" className={`btn${alertsOnly ? ' is-active' : ''}`} aria-pressed={alertsOnly} onClick={toggleAlerts}>
          Alerts only
        </button>
        <ServicePicker selected={filters.services} onChange={(services) => store.setFilters({ services })} />
        {isFiltered && (
          <button type="button" className="btn ghost" onClick={() => store.setFilters(DEFAULT_FILTERS)}>
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}

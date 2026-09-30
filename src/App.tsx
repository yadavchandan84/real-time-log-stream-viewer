import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterBar } from './components/FilterBar';
import { IncidentStrip } from './components/IncidentStrip';
import { InspectorDrawer } from './components/InspectorDrawer';
import { LogTable, type LogTableHandle } from './components/LogTable';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import type { LogEntry } from './domain/types';
import { useHotkeys } from './hooks/useHotkeys';
import { loadPreferences, savePreferences, writeFiltersToUrl, type Preferences } from './store/preferences';
import { useSnapshot, useStores } from './store/StoreContext';

interface Selection {
  entry: LogEntry | null;
  incidentId: string | null;
  open: boolean;
}

const ROW_HEIGHT = { comfortable: 30, compact: 23 } as const;

export function App() {
  const { store, stream } = useStores();
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [selection, setSelection] = useState<Selection>({ entry: null, incidentId: null, open: false });
  const tableRef = useRef<LogTableHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = useSnapshot((s) => s.filters);

  // ---- preferences / URL sync ---------------------------------------------
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    savePreferences(prefs);
  }, [prefs]);

  useEffect(() => writeFiltersToUrl(filters), [filters]);

  const updatePrefs = useCallback((patch: Partial<Preferences>) => setPrefs((p) => ({ ...p, ...patch })), []);

  const setRate = useCallback(
    (rate: number) => {
      stream.setRate(rate);
      updatePrefs({ rate });
    },
    [stream, updatePrefs],
  );

  // ---- selection ------------------------------------------------------------
  const selectEntry = useCallback((entry: LogEntry, open: boolean) => {
    setSelection((s) => ({ entry, incidentId: entry.incidentId ?? null, open: open || s.open }));
  }, []);

  const openIncident = useCallback(
    (incidentId: string) => {
      const logs = store.getIncidentLogs(incidentId);
      setSelection({ entry: logs[logs.length - 1] ?? null, incidentId, open: true });
    },
    [store],
  );

  const openSelection = useCallback(() => setSelection((s) => (s.entry ? { ...s, open: true } : s)), []);

  const closeDrawer = useCallback(() => {
    setSelection((s) => ({ ...s, open: false }));
    tableRef.current?.focus();
  }, []);

  const applyQuery = useCallback((query: string) => store.setFilters({ query }), [store]);

  // ---- global shortcuts -----------------------------------------------------
  useHotkeys({
    '/': (e) => {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    j: () => tableRef.current?.move(1),
    k: () => tableRef.current?.move(-1),
    Enter: () => {
      if (document.activeElement === document.body) openSelection();
    },
    Escape: (e) => {
      if (selection.open) {
        e.preventDefault();
        closeDrawer();
      }
    },
    G: () => tableRef.current?.jumpToLatest(),
    g: () => tableRef.current?.jumpToFirst(),
    p: () => stream.toggle(),
    t: () => updatePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' }),
  });

  const drawerOpen = selection.open && (selection.entry !== null || selection.incidentId !== null);

  return (
    <div className="app" data-density={prefs.density}>
      <a href="#log-stream" className="skip-link">
        Skip to log stream
      </a>
      <TopBar
        theme={prefs.theme}
        density={prefs.density}
        onThemeChange={(theme) => updatePrefs({ theme })}
        onDensityChange={(density) => updatePrefs({ density })}
        onRateChange={setRate}
      />
      <IncidentStrip activeIncidentId={drawerOpen ? selection.incidentId : null} onOpen={openIncident} />
      <FilterBar searchRef={searchRef} />

      <main id="log-stream" className={`workspace${drawerOpen ? ' has-drawer' : ''}`}>
        <LogTable
          ref={tableRef}
          rowHeight={ROW_HEIGHT[prefs.density]}
          selectedId={selection.entry?.id ?? null}
          onSelect={selectEntry}
          onOpen={openSelection}
          onClose={closeDrawer}
        />
        {drawerOpen && (
          <InspectorDrawer
            entry={selection.entry}
            incidentId={selection.incidentId}
            onClose={closeDrawer}
            onSelectEntry={(entry) => selectEntry(entry, true)}
            onApplyQuery={applyQuery}
          />
        )}
      </main>

      <StatusBar />
    </div>
  );
}

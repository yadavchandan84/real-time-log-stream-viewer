import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { LogSimulator } from './domain/simulator';
import { LogStore } from './store/logStore';
import { loadPreferences, readFiltersFromUrl, readInitialRowCount } from './store/preferences';
import { StoreProvider } from './store/StoreContext';
import { StreamController } from './store/streamController';

/** Rows generated on boot. Override with `?rows=100000` to stress-test. */
const INITIAL_ROWS = readInitialRowCount(10_000);
/** Sliding-window size; the oldest rows are dropped beyond this. */
const CAPACITY = Math.max(50_000, Math.ceil(INITIAL_ROWS * 1.25));
/** Backfill is spread as if it had been ingested at this rate. */
const BACKFILL_RATE = 20;

const prefs = loadPreferences();
const store = new LogStore({
  capacity: CAPACITY,
  filters: readFiltersFromUrl(),
  stream: { running: true, rate: prefs.rate },
});
const simulator = new LogSimulator({ seed: 20261006 });
store.ingest(simulator.backfill(INITIAL_ROWS, Date.now(), (INITIAL_ROWS / BACKFILL_RATE) * 1000));

const stream = new StreamController(store, simulator);
stream.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider value={{ store, stream }}>
      <App />
    </StoreProvider>
  </StrictMode>,
);

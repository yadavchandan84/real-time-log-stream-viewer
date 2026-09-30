import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { LogStore, Snapshot } from './logStore';
import type { StreamController } from './streamController';

interface StoreContextValue {
  store: LogStore;
  stream: StreamController;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ value, children }: { value: StoreContextValue; children: ReactNode }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStores(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStores must be used inside <StoreProvider>');
  return ctx;
}

/**
 * Subscribe to a slice of the store. The selector must return a value that is
 * referentially stable when unchanged (a snapshot field, a primitive) so that
 * components only re-render when their slice actually changes.
 */
export function useSnapshot<T>(selector: (s: Snapshot) => T): T {
  const { store } = useStores();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}

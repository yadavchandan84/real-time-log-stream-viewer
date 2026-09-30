import { compileMatcher, parseQuery, type Matcher, type ParsedQuery } from '../domain/query';
import { emptyCounts, LEVELS, type Emission, type Incident, type LevelCounts, type LogEntry, type LogLevel } from '../domain/types';

/**
 * Framework-agnostic store for the log stream, consumed from React through
 * `useSyncExternalStore`.
 *
 * Performance model
 * -----------------
 * - `entries` and `visible` are append-only between structural changes
 *   (filter change / trim). Snapshots carry an explicit `visibleCount`, so a
 *   render that reads an older snapshot never observes rows appended later.
 * - New rows are filtered incrementally: an ingest batch of N rows costs O(N),
 *   independent of buffer size. A full O(buffer) scan only happens when the
 *   filter itself changes.
 * - The buffer is a bounded window: once `capacity` is exceeded the oldest 10%
 *   is dropped in a single slice (amortised O(1) per row).
 */

export interface Filters {
  readonly levels: Readonly<Record<LogLevel, boolean>>;
  readonly query: string;
  /** Empty = all services. */
  readonly services: readonly string[];
}

export interface HistogramBucket extends LevelCounts {
  /** Bucket start, epoch ms (1 s resolution). */
  readonly t: number;
}

export interface StreamState {
  readonly running: boolean;
  /** Target events per second. */
  readonly rate: number;
}

export interface Snapshot {
  readonly version: number;
  /** Changes whenever `visible` is rebuilt from scratch (filter change / clear). */
  readonly filterEpoch: number;
  readonly entries: readonly LogEntry[];
  readonly entryCount: number;
  readonly visible: readonly LogEntry[];
  readonly visibleCount: number;
  /** Cumulative number of visible rows dropped from the front by trimming. */
  readonly visibleOffset: number;
  /** Per-level counts of rows matching query + service filter (ignores level toggles). */
  readonly facets: LevelCounts;
  /** Per-level counts of the whole buffer. */
  readonly totals: LevelCounts;
  readonly incidents: readonly Incident[];
  readonly filters: Filters;
  readonly query: ParsedQuery;
  /** Duration of the last full filter pass, ms. */
  readonly filterMs: number;
  readonly ingested: number;
  readonly capacity: number;
  readonly stream: StreamState;
  readonly histogram: readonly HistogramBucket[];
}

export const HISTOGRAM_SECONDS = 60;
const INCIDENT_LOG_CAP = 200;

export const DEFAULT_FILTERS: Filters = {
  levels: { INFO: true, WARN: true, ERROR: true },
  query: '',
  services: [],
};

export interface LogStoreOptions {
  capacity: number;
  filters?: Filters;
  stream?: StreamState;
}

const statusRank: Record<Incident['status'], number> = { open: 0, mitigated: 1, resolved: 2 };
const severityRank: Record<Incident['severity'], number> = { SEV1: 0, SEV2: 1, SEV3: 2 };

function byUpperBoundId(list: readonly LogEntry[], id: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id <= id) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the entry with `id` in an id-sorted list, or -1. */
export function indexOfId(list: readonly LogEntry[], count: number, id: number): number {
  let lo = 0;
  let hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = list[mid]!.id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export class LogStore {
  private readonly capacity: number;
  private entries: LogEntry[] = [];
  private visible: LogEntry[] = [];
  private visibleOffset = 0;
  private filterEpoch = 0;
  private facets = emptyCounts();
  private totals = emptyCounts();
  private ingested = 0;
  private filterMs = 0;

  private readonly incidents = new Map<string, Incident>();
  private incidentList: Incident[] = [];
  private readonly incidentLogs = new Map<string, LogEntry[]>();

  private filters: Filters;
  private parsed: ParsedQuery;
  private matcher: Matcher;
  private serviceSet: ReadonlySet<string> | null;

  private readonly buckets = new Map<number, LevelCounts>();
  private latestSecond = 0;

  private stream: StreamState;
  private version = 0;
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();

  constructor(options: LogStoreOptions) {
    this.capacity = options.capacity;
    this.filters = options.filters ?? DEFAULT_FILTERS;
    this.stream = options.stream ?? { running: true, rate: 20 };
    this.parsed = parseQuery(this.filters.query);
    this.matcher = compileMatcher(this.parsed);
    this.serviceSet = toServiceSet(this.filters.services);
    this.snapshot = this.buildSnapshot();
  }

  // ---- subscription -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private commit() {
    this.version++;
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  // ---- ingest -------------------------------------------------------------

  ingest(batch: Emission) {
    if (batch.logs.length === 0 && batch.incidents.length === 0) return;
    const { levels } = this.filters;

    for (const e of batch.logs) {
      this.entries.push(e);
      this.totals[e.level]++;
      this.countBucket(e);
      if (e.incidentId) {
        let list = this.incidentLogs.get(e.incidentId);
        if (!list) this.incidentLogs.set(e.incidentId, (list = []));
        list.push(e);
        if (list.length > INCIDENT_LOG_CAP) list.splice(0, list.length - INCIDENT_LOG_CAP);
      }
      if (this.passesBase(e)) {
        this.facets[e.level]++;
        if (levels[e.level]) this.visible.push(e);
      }
    }
    this.ingested += batch.logs.length;

    if (batch.incidents.length > 0) {
      for (const inc of batch.incidents) this.incidents.set(inc.id, inc);
      this.incidentList = [...this.incidents.values()].sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          severityRank[a.severity] - severityRank[b.severity] ||
          b.lastSeen - a.lastSeen,
      );
    }

    this.trim();
    this.commit();
  }

  private passesBase(e: LogEntry): boolean {
    return (this.serviceSet === null || this.serviceSet.has(e.service)) && this.matcher(e);
  }

  private countBucket(e: LogEntry) {
    const sec = Math.floor(e.ts / 1000);
    let b = this.buckets.get(sec);
    if (!b) this.buckets.set(sec, (b = emptyCounts()));
    b[e.level]++;
    if (sec > this.latestSecond) {
      this.latestSecond = sec;
      // Prune occasionally rather than on every row.
      if (this.buckets.size > HISTOGRAM_SECONDS * 3) {
        for (const key of this.buckets.keys()) if (key <= sec - HISTOGRAM_SECONDS * 2) this.buckets.delete(key);
      }
    }
  }

  private trim() {
    if (this.entries.length <= this.capacity) return;
    // Drop an extra 10% so we trim rarely (hysteresis).
    const drop = this.entries.length - this.capacity + Math.floor(this.capacity * 0.1);
    const lastDroppedId = this.entries[drop - 1]!.id;
    for (let i = 0; i < drop; i++) {
      const e = this.entries[i]!;
      this.totals[e.level]--;
      if (this.passesBase(e)) this.facets[e.level]--;
    }
    this.entries = this.entries.slice(drop);
    const vDrop = byUpperBoundId(this.visible, lastDroppedId);
    if (vDrop > 0) {
      this.visible = this.visible.slice(vDrop);
      this.visibleOffset += vDrop;
    }
  }

  // ---- filters ------------------------------------------------------------

  setFilters(patch: Partial<Filters>) {
    const next: Filters = { ...this.filters, ...patch };
    const queryChanged = next.query !== this.filters.query;
    const servicesChanged = next.services !== this.filters.services;
    const levelsChanged = LEVELS.some((l) => next.levels[l] !== this.filters.levels[l]);
    if (!queryChanged && !servicesChanged && !levelsChanged) return;

    this.filters = next;
    if (queryChanged) {
      this.parsed = parseQuery(next.query);
      this.matcher = compileMatcher(this.parsed);
    }
    if (servicesChanged) this.serviceSet = toServiceSet(next.services);
    this.refilter();
    this.commit();
  }

  toggleLevel(level: LogLevel, solo = false) {
    const cur = this.filters.levels;
    const onlyThisOn = LEVELS.every((l) => cur[l] === (l === level));
    const levels = solo
      ? onlyThisOn
        ? { INFO: true, WARN: true, ERROR: true } // solo again → show all
        : { INFO: false, WARN: false, ERROR: false, [level]: true }
      : { ...cur, [level]: !cur[level] };
    this.setFilters({ levels });
  }

  /** Full O(buffer) pass. Only runs when the filter itself changes. */
  private refilter() {
    const t0 = performance.now();
    const { levels } = this.filters;
    const visible: LogEntry[] = [];
    const facets = emptyCounts();
    const entries = this.entries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (!this.passesBase(e)) continue;
      facets[e.level]++;
      if (levels[e.level]) visible.push(e);
    }
    this.visible = visible;
    this.facets = facets;
    this.visibleOffset = 0;
    this.filterEpoch++;
    this.filterMs = performance.now() - t0;
  }

  // ---- stream / misc ------------------------------------------------------

  setStream(patch: Partial<StreamState>) {
    this.stream = { ...this.stream, ...patch };
    this.commit();
  }

  clear() {
    this.entries = [];
    this.visible = [];
    this.visibleOffset = 0;
    this.facets = emptyCounts();
    this.totals = emptyCounts();
    this.buckets.clear();
    this.incidentLogs.clear();
    this.filterEpoch++;
    this.commit();
  }

  getEntry(id: number): LogEntry | undefined {
    const first = this.entries[0];
    if (!first) return undefined;
    const e = this.entries[id - first.id];
    return e?.id === id ? e : undefined;
  }

  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  /** Most recent alert rows for an incident (newest last). */
  getIncidentLogs(id: string): readonly LogEntry[] {
    return this.incidentLogs.get(id) ?? [];
  }

  private buildSnapshot(): Snapshot {
    const histogram: HistogramBucket[] = [];
    const end = this.latestSecond;
    for (let s = end - HISTOGRAM_SECONDS + 1; s <= end; s++) {
      const b = this.buckets.get(s);
      histogram.push({ t: s * 1000, INFO: b?.INFO ?? 0, WARN: b?.WARN ?? 0, ERROR: b?.ERROR ?? 0 });
    }
    return {
      version: this.version,
      filterEpoch: this.filterEpoch,
      entries: this.entries,
      entryCount: this.entries.length,
      visible: this.visible,
      visibleCount: this.visible.length,
      visibleOffset: this.visibleOffset,
      facets: { ...this.facets },
      totals: { ...this.totals },
      incidents: this.incidentList,
      filters: this.filters,
      query: this.parsed,
      filterMs: this.filterMs,
      ingested: this.ingested,
      capacity: this.capacity,
      stream: this.stream,
      histogram,
    };
  }
}

function toServiceSet(services: readonly string[]): ReadonlySet<string> | null {
  return services.length > 0 ? new Set(services) : null;
}

export const LEVELS = ['INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = (typeof LEVELS)[number];

export type LevelCounts = Record<LogLevel, number>;

export const emptyCounts = (): LevelCounts => ({ INFO: 0, WARN: 0, ERROR: 0 });

export type MetaValue = string | number | boolean;

export interface LogEntry {
  /** Monotonic sequence number. Also the stable React key. */
  readonly id: number;
  /** Epoch milliseconds. */
  readonly ts: number;
  readonly level: LogLevel;
  readonly service: string;
  readonly host: string;
  readonly traceId: string;
  readonly message: string;
  /** Set on rows that belong to an incident (alert rows). */
  readonly incidentId?: string;
  readonly meta: Readonly<Record<string, MetaValue>>;
  /**
   * Pre-lowercased search haystack, computed once at ingest so filtering
   * never allocates per keystroke.
   */
  readonly haystack: string;
}

export type Severity = 'SEV1' | 'SEV2' | 'SEV3';
export type IncidentStatus = 'open' | 'mitigated' | 'resolved';
export type Impact = 'down' | 'degraded' | 'elevated-errors';

export interface AffectedService {
  readonly name: string;
  readonly impact: Impact;
  /** Alert events attributed to this service so far. */
  readonly events: number;
  readonly isRoot: boolean;
}

export interface RootCause {
  readonly summary: string;
  readonly detail: string;
  /** The telemetry signal that triggered detection. */
  readonly signal: string;
  /** 0..1 confidence of the automated RCA. */
  readonly confidence: number;
}

export interface Incident {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly status: IncidentStatus;
  readonly rootService: string;
  readonly affected: readonly AffectedService[];
  readonly rootCause: RootCause;
  readonly firstSeen: number;
  readonly lastSeen: number;
  readonly mitigatedAt?: number;
  readonly resolvedAt?: number;
  readonly eventCount: number;
  readonly stackTrace?: string;
  readonly actions: readonly string[];
  readonly runbook: string;
  readonly owner: string;
}

/** A batch produced by a log source: new lines + created/updated incidents. */
export interface Emission {
  readonly logs: LogEntry[];
  readonly incidents: Incident[];
}

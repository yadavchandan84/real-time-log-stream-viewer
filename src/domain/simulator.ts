import { REGIONS, SCENARIOS, SERVICE_BY_NAME, SERVICES, type ScenarioDef, type ServiceDef } from './catalog';
import { hex, int, mulberry32, pick, type Rng } from './random';
import type { AffectedService, Emission, Impact, Incident, IncidentStatus, LogEntry, LogLevel, MetaValue } from './types';

/**
 * Deterministic mock log source.
 *
 * Emits a realistic mix of background traffic plus incidents that follow a
 * lifecycle (open → mitigated → resolved). Alert rows produced during an
 * incident carry its `incidentId` so the UI can join a row to its incident.
 */

interface MutableAffected {
  name: string;
  impact: Impact;
  events: number;
  isRoot: boolean;
}

interface ActiveIncident {
  id: string;
  scenario: ScenarioDef;
  status: IncidentStatus;
  firstSeen: number;
  lastSeen: number;
  mitigateAt: number;
  resolveAt: number;
  mitigatedAt?: number;
  resolvedAt?: number;
  eventCount: number;
  confidence: number;
  affected: MutableAffected[];
}

export interface SimulatorOptions {
  seed?: number;
  /** Probability that any given event starts a new incident (when capacity allows). */
  incidentChance?: number;
  maxConcurrentIncidents?: number;
}

const TOTAL_WEIGHT = SERVICES.reduce((sum, s) => sum + s.weight, 0);

export class LogSimulator {
  private readonly rng: Rng;
  private readonly incidentChance: number;
  private readonly maxConcurrent: number;
  private seq = 0;
  private incidentSeq = 1040;
  private active: ActiveIncident[] = [];
  private lastScenario = '';

  constructor(options: SimulatorOptions = {}) {
    this.rng = mulberry32(options.seed ?? 0x5eed);
    this.incidentChance = options.incidentChance ?? 0.0012;
    this.maxConcurrent = options.maxConcurrentIncidents ?? 2;
  }

  /**
   * Generate `count` events spread across `[endTs - spanMs, endTs]`.
   * Guarantees at least one incident is still open at the end so the UI has
   * something to inspect on first load.
   */
  backfill(count: number, endTs: number, spanMs: number): Emission {
    const start = endTs - spanMs;
    const forceAt = Math.floor(count * 0.82);
    return this.run(count, start, endTs, (i, ts, touched) => {
      if (i !== forceAt || this.active.some((a) => a.status === 'open')) return;
      const inc = this.openIncident(ts, true);
      if (inc) touched.set(inc.id, inc);
    });
  }

  /** Generate `count` events evenly spread across `(fromTs, toTs]`. */
  emit(count: number, fromTs: number, toTs: number): Emission {
    return this.run(count, fromTs, toTs);
  }

  private run(
    count: number,
    fromTs: number,
    toTs: number,
    hook?: (i: number, ts: number, touched: Map<string, ActiveIncident>) => void,
  ): Emission {
    // Rows are pushed in timestamp order, so `id` and `ts` are both monotonic
    // across the whole stream — the store relies on this for O(1) lookups.
    const logs: LogEntry[] = [];
    const touched = new Map<string, ActiveIncident>();
    const span = Math.max(1, toTs - fromTs);

    for (let i = 0; i < count; i++) {
      // One slot per event with jitter inside the slot keeps timestamps monotonic.
      const ts = Math.round(fromTs + ((i + 0.05 + this.rng() * 0.9) / count) * span);
      hook?.(i, ts, touched);
      this.advanceLifecycle(ts, logs, touched);
      logs.push(this.nextEvent(ts, touched));
    }

    return { logs, incidents: [...touched.values()].map(toIncident) };
  }

  private advanceLifecycle(ts: number, out: LogEntry[], touched: Map<string, ActiveIncident>) {
    for (const inc of this.active) {
      if (inc.status === 'open' && ts >= inc.mitigateAt) {
        inc.status = 'mitigated';
        inc.mitigatedAt = ts;
        out.push(this.lifecycleRow(inc, ts, 'WARN', `Incident ${inc.id} mitigated: ${inc.scenario.mitigation}`));
        touched.set(inc.id, inc);
      } else if (inc.status === 'mitigated' && ts >= inc.resolveAt) {
        inc.status = 'resolved';
        inc.resolvedAt = ts;
        out.push(
          this.lifecycleRow(inc, ts, 'INFO', `Incident ${inc.id} resolved: ${inc.scenario.title.toLowerCase()} — error rate back to baseline`),
        );
        touched.set(inc.id, inc);
      }
    }
    this.active = this.active.filter((inc) => inc.status !== 'resolved');

    if (this.active.length < this.maxConcurrent && this.rng() < this.incidentChance) {
      const inc = this.openIncident(ts, false);
      if (inc) touched.set(inc.id, inc);
    }
  }

  private openIncident(ts: number, force: boolean): ActiveIncident | undefined {
    const busy = new Set(this.active.map((a) => a.scenario.key));
    const candidates = SCENARIOS.filter((s) => !busy.has(s.key) && (force || s.key !== this.lastScenario));
    if (candidates.length === 0) return undefined;
    const scenario = pick(this.rng, candidates);
    this.lastScenario = scenario.key;

    // Forced (initial) incidents stay open for a long while so the demo always has one live.
    const openFor = force ? int(this.rng, 8, 14) * 60_000 : int(this.rng, 45, 150) * 1000;
    const inc: ActiveIncident = {
      id: `INC-${++this.incidentSeq}`,
      scenario,
      status: 'open',
      firstSeen: ts,
      lastSeen: ts,
      mitigateAt: ts + openFor,
      resolveAt: ts + openFor + int(this.rng, 20, 60) * 1000,
      eventCount: 0,
      confidence: 0.72 + this.rng() * 0.25,
      affected: [
        { name: scenario.rootService, impact: 'down', events: 0, isRoot: true },
        ...scenario.affected.map((a) => ({ ...a, events: 0, isRoot: false })),
      ],
    };
    this.active.push(inc);
    return inc;
  }

  private nextEvent(ts: number, touched: Map<string, ActiveIncident>): LogEntry {
    const r = this.rng;
    const firing = this.active.filter((a) => a.status === 'open');

    // While an incident is open a sizeable share of traffic is alert noise.
    if (firing.length > 0 && r() < 0.3) {
      const inc = pick(r, firing);
      const target = r() < 0.55 ? inc.affected[0]! : pick(r, inc.affected.slice(1));
      const isRoot = target.isRoot;
      const template = pick(r, isRoot ? inc.scenario.rootErrors : inc.scenario.symptoms);
      const level: LogLevel = isRoot || target.impact === 'down' || r() < 0.55 ? 'ERROR' : 'WARN';
      target.events++;
      inc.eventCount++;
      inc.lastSeen = ts;
      touched.set(inc.id, inc);
      return this.makeEntry(ts, level, SERVICE_BY_NAME.get(target.name)!, template(r), inc.id);
    }

    const service = this.pickService();
    const roll = r();
    if (roll < 0.022) return this.makeEntry(ts, 'ERROR', service, pick(r, service.error)(r));
    if (roll < 0.1) return this.makeEntry(ts, 'WARN', service, pick(r, service.warn)(r));
    return this.makeEntry(ts, 'INFO', service, pick(r, service.info)(r));
  }

  private lifecycleRow(inc: ActiveIncident, ts: number, level: LogLevel, message: string): LogEntry {
    return this.makeEntry(ts, level, SERVICE_BY_NAME.get(inc.scenario.rootService)!, message, inc.id);
  }

  private pickService(): ServiceDef {
    let roll = this.rng() * TOTAL_WEIGHT;
    for (const s of SERVICES) {
      roll -= s.weight;
      if (roll <= 0) return s;
    }
    return SERVICES[0]!;
  }

  private makeEntry(ts: number, level: LogLevel, service: ServiceDef, message: string, incidentId?: string): LogEntry {
    const r = this.rng;
    const host = `${service.hostPrefix}-${int(r, 1, 4)}.${pick(r, REGIONS)}`;
    const traceId = hex(r, 16);
    const meta: Record<string, MetaValue> = {
      pod: `${service.name}-${hex(r, 5)}-${hex(r, 5)}`,
      team: service.team,
      version: `v${int(r, 1, 3)}.${int(r, 0, 20)}.${int(r, 0, 9)}`,
      span_id: hex(r, 8),
    };
    const statusMatch = /\s([1-5]\d\d)\s/.exec(message);
    if (statusMatch) meta.http_status = Number(statusMatch[1]);
    const latency = /(\d+)ms/.exec(message);
    if (latency) meta.duration_ms = Number(latency[1]);

    return {
      id: ++this.seq,
      ts,
      level,
      service: service.name,
      host,
      traceId,
      message,
      incidentId,
      meta,
      haystack: `${message} ${service.name} ${host} ${traceId} ${incidentId ?? ''}`.toLowerCase(),
    };
  }
}

function toIncident(inc: ActiveIncident): Incident {
  const s = inc.scenario;
  return {
    id: inc.id,
    title: s.title,
    severity: s.severity,
    status: inc.status,
    rootService: s.rootService,
    affected: inc.affected.map((a): AffectedService => ({ ...a })),
    rootCause: { ...s.rootCause, confidence: inc.confidence },
    firstSeen: inc.firstSeen,
    lastSeen: inc.lastSeen,
    mitigatedAt: inc.mitigatedAt,
    resolvedAt: inc.resolvedAt,
    eventCount: inc.eventCount,
    stackTrace: s.stackTrace,
    actions: s.actions,
    runbook: s.runbook,
    owner: SERVICE_BY_NAME.get(s.rootService)?.team ?? 'unknown',
  };
}

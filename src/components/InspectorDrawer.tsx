import { useEffect, useId, useRef, useState } from 'react';
import {
  formatClock,
  formatDateTime,
  formatDuration,
  formatIso,
  formatNumber,
  formatRelative,
} from '../domain/format';
import type { Incident, LogEntry } from '../domain/types';
import { useNow } from '../hooks/useNow';
import { useSnapshot, useStores } from '../store/StoreContext';
import { LevelBadge, ServiceTag, SeverityBadge, StatusBadge } from './Badges';
import { Icon } from './Icon';

interface InspectorDrawerProps {
  entry: LogEntry | null;
  incidentId: string | null;
  onClose: () => void;
  onSelectEntry: (entry: LogEntry) => void;
  onApplyQuery: (query: string) => void;
}

const impactLabel = { down: 'Down', degraded: 'Degraded', 'elevated-errors': 'Elevated errors' } as const;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="btn ghost small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined);
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

function TimeBadge({ label, ts, now, tone }: { label: string; ts: number; now?: number; tone?: string }) {
  return (
    <div className={`time-badge${tone ? ` tone-${tone}` : ''}`} title={formatIso(ts)}>
      <span className="time-badge-label">{label}</span>
      <span className="time-badge-value mono">{formatClock(ts)}</span>
      {now !== undefined && <span className="time-badge-rel">{formatRelative(ts, now)}</span>}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const id = useId();
  return (
    <section className="drawer-section" aria-labelledby={id}>
      <header className="drawer-section-head">
        <h3 id={id}>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function IncidentDetails({
  incident,
  entry,
  now,
  onSelectEntry,
  onApplyQuery,
}: {
  incident: Incident;
  entry: LogEntry | null;
  now: number;
  onSelectEntry: (e: LogEntry) => void;
  onApplyQuery: (q: string) => void;
}) {
  const { store } = useStores();
  useSnapshot((s) => s.version); // re-render as new alert rows arrive
  const related = store.getIncidentLogs(incident.id);
  const recent = related.slice(-8).reverse();
  const end = incident.resolvedAt ?? now;
  const rc = incident.rootCause;

  return (
    <>
      <div className="time-badges">
        {entry && <TimeBadge label="Event" ts={entry.ts} />}
        <TimeBadge label="First seen" ts={incident.firstSeen} now={now} tone="error" />
        <TimeBadge label="Last seen" ts={incident.lastSeen} now={now} />
        {incident.mitigatedAt && <TimeBadge label="Mitigated" ts={incident.mitigatedAt} tone="warn" />}
        {incident.resolvedAt && <TimeBadge label="Resolved" ts={incident.resolvedAt} tone="ok" />}
        <div className="time-badge">
          <span className="time-badge-label">{incident.resolvedAt ? 'Duration' : 'Open for'}</span>
          <span className="time-badge-value mono">{formatDuration(end - incident.firstSeen)}</span>
          <span className="time-badge-rel">{formatNumber(incident.eventCount)} events</span>
        </div>
      </div>

      <Section title="Root cause">
        <div className="rca">
          <p className="rca-summary">{rc.summary}</p>
          <p className="rca-detail">{rc.detail}</p>
          <dl className="rca-meta">
            <div>
              <dt>Detected by</dt>
              <dd>
                <code>{rc.signal}</code>
              </dd>
            </div>
            <div>
              <dt>RCA confidence</dt>
              <dd className="confidence">
                <span className="confidence-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(rc.confidence * 100)}%` }} />
                </span>
                <span className="mono">{Math.round(rc.confidence * 100)}%</span>
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd className="mono">@{incident.owner}</dd>
            </div>
          </dl>
        </div>
      </Section>

      <Section title={`Affected services (${incident.affected.length})`}>
        <ul className="affected-list">
          {incident.affected.map((svc) => (
            <li key={svc.name} className="affected-item">
              <ServiceTag name={svc.name} />
              {svc.isRoot && <span className="root-tag">root cause</span>}
              <span className={`impact-pill impact-${svc.impact}`}>{impactLabel[svc.impact]}</span>
              <span className="affected-events mono">{formatNumber(svc.events)} ev</span>
              <button
                type="button"
                className="icon-btn ghost small"
                aria-label={`Show ${svc.name} alert logs`}
                title="Filter to this service's incident logs"
                onClick={() => onApplyQuery(`inc:${incident.id} service:${svc.name}`)}
              >
                <Icon name="filter" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Recent alert events"
        aside={
          <button type="button" className="btn ghost small" onClick={() => onApplyQuery(`inc:${incident.id}`)}>
            <Icon name="filter" size={13} />
            All {formatNumber(incident.eventCount)}
          </button>
        }
      >
        <ol className="event-timeline">
          {recent.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`timeline-item${e.id === entry?.id ? ' is-current' : ''}`}
                onClick={() => onSelectEntry(e)}
              >
                <span className={`timeline-dot lvl-${e.level.toLowerCase()}`} aria-hidden="true" />
                <span className="mono muted">{formatClock(e.ts)}</span>
                <span className="mono timeline-svc">{e.service}</span>
                <span className="timeline-msg truncate">{e.message}</span>
              </button>
            </li>
          ))}
          {recent.length === 0 && <li className="muted small">Alert rows have rolled out of the buffer.</li>}
        </ol>
      </Section>

      {incident.stackTrace && (
        <Section title="Stack trace" aside={<CopyButton text={incident.stackTrace} label="Copy" />}>
          <pre className="code-block stack">{incident.stackTrace}</pre>
        </Section>
      )}

      <Section title="Suggested actions">
        <ol className="actions-list">
          {incident.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
        <a className="runbook-link" href={incident.runbook} target="_blank" rel="noreferrer noopener">
          <Icon name="external" size={13} />
          Open runbook
        </a>
      </Section>
    </>
  );
}

function EventDetails({ entry, onApplyQuery }: { entry: LogEntry; onApplyQuery: (q: string) => void }) {
  const payload = JSON.stringify(
    {
      id: entry.id,
      timestamp: formatIso(entry.ts),
      level: entry.level,
      service: entry.service,
      host: entry.host,
      trace_id: entry.traceId,
      incident_id: entry.incidentId,
      message: entry.message,
      ...entry.meta,
    },
    null,
    2,
  );
  const attrs: [string, string, string | null][] = [
    ['service', entry.service, `service:${entry.service}`],
    ['host', entry.host, `host:${entry.host}`],
    ['trace_id', entry.traceId, `trace:${entry.traceId}`],
    ...Object.entries(entry.meta).map(([k, v]): [string, string, string | null] => [k, String(v), null]),
  ];

  return (
    <>
      <Section title="Attributes">
        <dl className="attr-grid">
          {attrs.map(([k, v, q]) => (
            <div key={k} className="attr-row">
              <dt className="mono">{k}</dt>
              <dd className="mono">
                <span className="truncate" title={v}>
                  {v}
                </span>
                {q && (
                  <button
                    type="button"
                    className="icon-btn ghost small"
                    aria-label={`Filter by ${k} ${v}`}
                    title={`Filter: ${q}`}
                    onClick={() => onApplyQuery(q)}
                  >
                    <Icon name="filter" size={12} />
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Raw event" aside={<CopyButton text={payload} label="Copy JSON" />}>
        <pre className="code-block">{payload}</pre>
      </Section>
    </>
  );
}

/**
 * Right-hand inspection panel. Non-modal on desktop (the table stays usable
 * so j/k keeps inspecting rows), full-screen sheet with backdrop on mobile.
 */
export function InspectorDrawer({ entry, incidentId, onClose, onSelectEntry, onApplyQuery }: InspectorDrawerProps) {
  const incidents = useSnapshot((s) => s.incidents);
  const incident = incidentId ? incidents.find((i) => i.id === incidentId) : undefined;
  const now = useNow(1000);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // On small screens the drawer covers the table, so move focus into it.
  // On desktop it is non-modal and focus stays on the table for j/k browsing.
  useEffect(() => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      panelRef.current?.querySelector<HTMLButtonElement>('.drawer-head .icon-btn')?.focus();
    }
  }, []);

  // Reset scroll when inspecting a different event/incident.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [entry?.id, incidentId]);

  const heading = incident ? incident.title : entry ? `${entry.level} · ${entry.service}` : 'Event';

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className="drawer" role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <header className="drawer-head">
          <div className="drawer-head-meta">
            {incident && <SeverityBadge severity={incident.severity} />}
            {incident && <StatusBadge status={incident.status} />}
            {entry && <LevelBadge level={entry.level} />}
            <span className="mono muted">{incident ? incident.id : entry ? `#${entry.id}` : ''}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close inspector (Esc)">
            <Icon name="x" size={16} />
          </button>
          <h2 id={titleId} className="drawer-title">
            {heading}
          </h2>
          {entry && (
            <div className="drawer-message">
              <p className="mono">{entry.message}</p>
              <div className="drawer-message-meta">
                <ServiceTag name={entry.service} />
                <span className="mono muted" title={formatIso(entry.ts)}>
                  {formatDateTime(entry.ts)}.{String(entry.ts % 1000).padStart(3, '0')}
                </span>
                <CopyButton text={entry.message} label="Copy" />
              </div>
            </div>
          )}
        </header>

        <div className="drawer-body" ref={bodyRef}>
          {incident ? (
            <IncidentDetails
              incident={incident}
              entry={entry}
              now={now}
              onSelectEntry={onSelectEntry}
              onApplyQuery={onApplyQuery}
            />
          ) : (
            entry &&
            entry.level !== 'INFO' && (
              <div className="note">
                <Icon name="alert" size={14} />
                Not correlated with an active incident. Isolated {entry.level.toLowerCase()} events are tracked but
                don&apos;t page on-call.
              </div>
            )
          )}
          {entry && <EventDetails entry={entry} onApplyQuery={onApplyQuery} />}
        </div>
      </aside>
    </>
  );
}

import { formatDuration, formatNumber } from '../domain/format';
import { useNow } from '../hooks/useNow';
import { useSnapshot } from '../store/StoreContext';
import { SeverityBadge, StatusBadge } from './Badges';
import { Icon } from './Icon';

interface IncidentStripProps {
  activeIncidentId: string | null;
  onOpen: (incidentId: string) => void;
}

/** Horizontal rail of open/mitigated incidents — the "what's on fire" summary. */
export function IncidentStrip({ activeIncidentId, onOpen }: IncidentStripProps) {
  const incidents = useSnapshot((s) => s.incidents);
  const now = useNow(1000);
  const live = incidents.filter((i) => i.status !== 'resolved');
  const resolved = incidents.length - live.length;

  return (
    <section className="incident-strip" aria-label="Active incidents">
      <div className="incident-strip-label">
        <Icon name="alert" size={14} />
        <span>Incidents</span>
        <span className="count-pill">{live.length}</span>
        {resolved > 0 && <span className="muted small">{resolved} resolved</span>}
      </div>

      {live.length === 0 ? (
        <div className="all-clear" role="status">
          <span className="status-dot ok" aria-hidden="true" />
          All systems operational
        </div>
      ) : (
        <ul className="incident-cards">
          {live.map((inc) => (
            <li key={inc.id}>
              <button
                type="button"
                className={`incident-card sev-edge-${inc.severity.toLowerCase()}${inc.id === activeIncidentId ? ' is-active' : ''}`}
                onClick={() => onOpen(inc.id)}
                aria-pressed={inc.id === activeIncidentId}
              >
                <span className="incident-card-top">
                  <SeverityBadge severity={inc.severity} />
                  <span className="mono muted">{inc.id}</span>
                  <StatusBadge status={inc.status} />
                </span>
                <span className="incident-card-title">{inc.title}</span>
                <span className="incident-card-meta mono">
                  <span>{inc.rootService}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration((inc.resolvedAt ?? now) - inc.firstSeen)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatNumber(inc.eventCount)} events</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

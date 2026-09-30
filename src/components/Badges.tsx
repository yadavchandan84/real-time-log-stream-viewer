import type { IncidentStatus, LogLevel, Severity } from '../domain/types';
import { serviceHue } from '../domain/format';

export function LevelBadge({ level }: { level: LogLevel }) {
  return <span className={`level-badge level-${level.toLowerCase()}`}>{level}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev-badge sev-${severity.toLowerCase()}`}>{severity}</span>;
}

const statusLabel: Record<IncidentStatus, string> = {
  open: 'Open',
  mitigated: 'Mitigated',
  resolved: 'Resolved',
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabel[status]}
    </span>
  );
}

export function ServiceTag({ name }: { name: string }) {
  return (
    <span className="service-tag" style={{ '--svc-hue': serviceHue(name) } as React.CSSProperties}>
      <span className="service-dot" aria-hidden="true" />
      {name}
    </span>
  );
}

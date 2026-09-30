import type { LogEntry } from './types';

/**
 * Tiny query language for the search box.
 *
 *   timeout                 substring (case-insensitive) across message/service/host/trace
 *   "connection closed"     exact phrase
 *   -healthz                exclude
 *   service:payments        field filter (also: svc, host, trace, inc/incident)
 *   is:alert                only rows linked to an incident
 *   /time(d)?out/i          whole query as a regular expression on the message
 */

export type FieldKey = 'service' | 'host' | 'trace' | 'incident';

interface FieldClause {
  key: FieldKey;
  value: string;
  negate: boolean;
}

export interface ParsedQuery {
  readonly raw: string;
  readonly isEmpty: boolean;
  readonly terms: readonly string[];
  readonly excluded: readonly string[];
  readonly fields: readonly FieldClause[];
  readonly alertsOnly: boolean;
  readonly regex: RegExp | null;
  readonly error: string | null;
  /** Global regex for highlighting matches inside the message cell. */
  readonly highlight: RegExp | null;
}

const FIELD_ALIASES: Record<string, FieldKey> = {
  service: 'service',
  svc: 'service',
  host: 'host',
  trace: 'trace',
  traceid: 'trace',
  inc: 'incident',
  incident: 'incident',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /(-?)"([^"]*)"?|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m[2] !== undefined) {
      // Keep quoted phrases marked so they are never parsed as field clauses.
      if (m[2].length > 0) tokens.push(`${m[1]}\u0000${m[2]}`);
    } else if (m[3]) {
      tokens.push(m[3]);
    }
  }
  return tokens;
}

export function parseQuery(raw: string): ParsedQuery {
  const input = raw.trim();
  const base = {
    raw,
    terms: [] as string[],
    excluded: [] as string[],
    fields: [] as FieldClause[],
    alertsOnly: false,
    regex: null as RegExp | null,
    error: null as string | null,
    highlight: null as RegExp | null,
  };
  if (!input) return { ...base, isEmpty: true };

  const regexMatch = /^\/(.+)\/([a-z]*)$/.exec(input);
  if (regexMatch) {
    try {
      const flags = regexMatch[2]!.replace(/[gy]/g, '');
      const regex = new RegExp(regexMatch[1]!, flags);
      return { ...base, isEmpty: false, regex, highlight: new RegExp(regex.source, `${flags}g`) };
    } catch (e) {
      return { ...base, isEmpty: true, error: e instanceof Error ? e.message : 'Invalid regular expression' };
    }
  }

  for (let token of tokenize(input)) {
    let negate = false;
    if (token.startsWith('-') && token.length > 1) {
      negate = true;
      token = token.slice(1);
    }
    if (token.startsWith('\u0000')) {
      const phrase = token.slice(1).toLowerCase();
      (negate ? base.excluded : base.terms).push(phrase);
      continue;
    }
    const colon = token.indexOf(':');
    if (colon > 0 && colon < token.length - 1) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1).toLowerCase();
      if (key === 'is' && (value === 'alert' || value === 'incident')) {
        base.alertsOnly = !negate;
        continue;
      }
      const field = FIELD_ALIASES[key];
      if (field) {
        base.fields.push({ key: field, value, negate });
        continue;
      }
    }
    (negate ? base.excluded : base.terms).push(token.toLowerCase());
  }

  const highlight =
    base.terms.length > 0
      ? new RegExp(
          [...base.terms]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegExp)
            .join('|'),
          'gi',
        )
      : null;

  return { ...base, isEmpty: false, highlight };
}

function fieldValue(entry: LogEntry, key: FieldKey): string {
  switch (key) {
    case 'service':
      return entry.service;
    case 'host':
      return entry.host;
    case 'trace':
      return entry.traceId;
    case 'incident':
      return entry.incidentId?.toLowerCase() ?? '';
  }
}

export type Matcher = (entry: LogEntry) => boolean;

/** Compile once per query change; the returned closure is the hot path. */
export function compileMatcher(q: ParsedQuery): Matcher {
  if (q.isEmpty) return () => true;
  if (q.regex) {
    const re = q.regex;
    return (e) => re.test(e.message);
  }
  const { terms, excluded, fields, alertsOnly } = q;
  return (e) => {
    if (alertsOnly && e.incidentId === undefined) return false;
    const h = e.haystack;
    for (let i = 0; i < terms.length; i++) if (!h.includes(terms[i]!)) return false;
    for (let i = 0; i < excluded.length; i++) if (h.includes(excluded[i]!)) return false;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]!;
      const v = fieldValue(e, f.key);
      const hit = f.key === 'incident' ? v === f.value : v.includes(f.value);
      if (hit === f.negate) return false;
    }
    return true;
  };
}

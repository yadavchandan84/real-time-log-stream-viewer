import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Icon } from './Icon';

interface SearchInputProps {
  ref?: Ref<HTMLInputElement>;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  debounceMs?: number;
}

/**
 * Controlled-by-store search box with local state for instant typing feedback.
 * The store (and the O(buffer) refilter) only sees the value after a short
 * debounce, so fast typing never queues up full scans.
 */
export function SearchInput({ ref, value, error, onChange, debounceMs = 120 }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const sent = useRef(value);
  const helpId = useId();
  const errorId = useId();
  const [showHelp, setShowHelp] = useState(false);

  // External updates (e.g. "filter by trace" from the drawer, URL restore).
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === sent.current) return;
    const t = setTimeout(() => {
      sent.current = draft;
      onChange(draft);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [draft, debounceMs, onChange]);

  const commitNow = (next: string) => {
    setDraft(next);
    sent.current = next;
    onChange(next);
  };

  return (
    <div className={`search${error ? ' has-error' : ''}`}>
      <Icon name="search" size={15} className="search-icon" />
      <input
        ref={ref}
        type="search"
        className="search-input mono"
        placeholder='Search logs…  service:payments  -healthz  "timed out"  /regex/i'
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-label="Search logs"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitNow(draft);
          if (e.key === 'Escape') {
            if (draft) commitNow('');
            else e.currentTarget.blur();
            e.preventDefault();
          }
        }}
      />
      {draft && (
        <button type="button" className="icon-btn ghost small" aria-label="Clear search" onClick={() => commitNow('')}>
          <Icon name="x" size={14} />
        </button>
      )}
      <kbd className="search-kbd" aria-hidden="true">
        /
      </kbd>
      <button
        type="button"
        className="icon-btn ghost small"
        aria-label="Search syntax help"
        aria-expanded={showHelp}
        aria-controls={helpId}
        onClick={() => setShowHelp((v) => !v)}
      >
        <Icon name="help" size={15} />
      </button>
      {error && (
        <span id={errorId} className="search-error" role="alert">
          {error}
        </span>
      )}
      {showHelp && (
        <div id={helpId} className="popover search-help" role="note">
          <table>
            <tbody>
              <tr>
                <td><code>timeout</code></td>
                <td>Case-insensitive match on message, service, host, trace</td>
              </tr>
              <tr>
                <td><code>"lock timeout"</code></td>
                <td>Exact phrase</td>
              </tr>
              <tr>
                <td><code>-healthz</code></td>
                <td>Exclude a term</td>
              </tr>
              <tr>
                <td><code>service:pay</code></td>
                <td>Field filter · also <code>host:</code> <code>trace:</code> <code>inc:</code></td>
              </tr>
              <tr>
                <td><code>is:alert</code></td>
                <td>Only rows linked to an incident</td>
              </tr>
              <tr>
                <td><code>/5\d\d/</code></td>
                <td>Regular expression on the message</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

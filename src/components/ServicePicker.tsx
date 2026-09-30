import { useEffect, useId, useRef, useState } from 'react';
import { SERVICE_NAMES } from '../domain/catalog';
import { serviceHue } from '../domain/format';
import { Icon } from './Icon';

interface ServicePickerProps {
  selected: readonly string[];
  onChange: (services: string[]) => void;
}

/** Multi-select popover. Empty selection means "all services". */
export function ServicePicker({ selected, onChange }: ServicePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const set = new Set(selected);
  const toggle = (name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(SERVICE_NAMES.filter((s) => next.has(s)));
  };

  const label =
    selected.length === 0 ? 'All services' : selected.length === 1 ? selected[0] : `${selected.length} services`;

  return (
    <div className="service-picker" ref={rootRef}>
      <button
        type="button"
        className={`btn${selected.length ? ' is-active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="layers" size={14} />
        <span className="truncate">{label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div id={listId} className="popover service-menu" role="group" aria-label="Filter by service">
          {SERVICE_NAMES.map((name) => (
            <label key={name} className="service-option" style={{ '--svc-hue': serviceHue(name) } as React.CSSProperties}>
              <input type="checkbox" checked={set.has(name)} onChange={() => toggle(name)} />
              <span className="service-dot" aria-hidden="true" />
              <span className="mono">{name}</span>
            </label>
          ))}
          <div className="service-menu-footer">
            <button type="button" className="btn ghost small" onClick={() => onChange([])} disabled={!selected.length}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

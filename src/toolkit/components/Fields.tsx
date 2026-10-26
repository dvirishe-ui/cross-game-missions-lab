// Small form building blocks shared by every page. Each control takes a
// stable id so checks and [MISSING] markers can jump straight to it.

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { FieldRef, Tab } from '../model/fields';
import type { Project } from '../model/project';

export interface ToolkitCtx {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  /** Go to a tab and focus a field. */
  jump: (ref: FieldRef) => void;
  goTab: (tab: Tab) => void;
}
export const Ctx = createContext<ToolkitCtx | null>(null);
export const useToolkit = () => useContext(Ctx)!;

export function Section({ title, id, children, note, open = true, collapsible = false }: { title: string; id?: string; children: ReactNode; note?: ReactNode; open?: boolean; collapsible?: boolean }) {
  if (collapsible)
    return (
      <details className="k-section" id={id} open={open}>
        <summary>
          <h3>{title}</h3>
          {note && <span className="k-note">{note}</span>}
        </summary>
        <div className="k-section-body">{children}</div>
      </details>
    );
  return (
    <section className="k-section" id={id}>
      <div className="k-section-head">
        <h3>{title}</h3>
        {note && <span className="k-note">{note}</span>}
      </div>
      <div className="k-section-body">{children}</div>
    </section>
  );
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`k-grid k-cols-${cols}`}>{children}</div>;
}

interface Base {
  id: string;
  label: string;
  hint?: string;
  wide?: boolean;
}

export function TextField({ id, label, hint, wide, value, onChange, placeholder }: Base & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className={`k-field ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function AreaField({ id, label, hint, value, onChange, placeholder }: Base & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="k-field wide" htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Number input; an empty box is null, never 0. */
export function NumberField({ id, label, hint, wide, value, onChange, min, step, suffix }: Base & { value: number | null; onChange: (v: number | null) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <label className={`k-field ${wide ? 'wide' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <span className="k-suffix">
        <input
          id={id}
          type="number"
          min={min}
          step={step ?? 'any'}
          value={value == null || !Number.isFinite(value) ? '' : value}
          onChange={(e) => onChange(e.target.value.trim() === '' ? null : Number(e.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function DateField({ id, label, hint, value, onChange }: Base & { value: string; onChange: (v: string) => void }) {
  return (
    <label className="k-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function TimeField({ id, label, hint, value, onChange }: Base & { value: string; onChange: (v: string) => void }) {
  return (
    <label className="k-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function SelectField<T extends string>({ id, label, hint, value, options, onChange }: Base & { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="k-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function YesNo({ id, label, hint, value, onChange, yes = 'Yes', no = 'No' }: Base & { value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string }) {
  return (
    <div className="k-field">
      <span id={`${id}-label`}>{label}</span>
      <div className="k-seg" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" id={id} aria-pressed={value} onClick={() => onChange(true)}>
          {yes}
        </button>
        <button type="button" aria-pressed={!value} onClick={() => onChange(false)}>
          {no}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`k-chip ${tone}`}>{children}</span>;
}

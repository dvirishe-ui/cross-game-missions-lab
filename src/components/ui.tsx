import { useEffect, useId, useState, type ReactNode } from 'react';
import { EVIDENCE, type EvidenceKind } from '../data/evidence';
import { GAME_BY_ID, type GameId } from '../data/games';
import type { InputSource } from '../math/campaign';

export const GAME_COLOR: Record<GameId, string> = {
  aviator: 'var(--aviator)',
  'pilot-chicken': '#f59e5b',
  plinko: '#c084fc',
  mines: '#34d399',
  goal: '#60a5fa',
  keno: '#fbbf24',
  'keno-80': '#e0b44a',
  trader: '#22d3ee',
  generic: 'var(--muted)',
};

export function Badge({ kind, children, title }: { kind: EvidenceKind; children?: ReactNode; title?: string }) {
  const e = EVIDENCE[kind];
  return (
    <span className={`badge ${e.tone}`} title={title ?? e.description}>
      {children ?? e.label}
    </span>
  );
}

export function SourceBadge({ source, missing }: { source: InputSource; missing?: boolean }) {
  if (missing) return <Badge kind="missing" />;
  if (source === 'illustrative') return <Badge kind="assumption" />;
  return (
    <span className="badge published" title={source === 'measured' ? 'Measured from telemetry' : 'Documented by a game specification or provider page'}>
      {source === 'measured' ? 'Measured' : 'Documented'}
    </span>
  );
}

export function GameChip({ game }: { game: GameId }) {
  return (
    <span className={`chip game-dot ${game === 'aviator' ? 'aviator' : ''}`} style={{ ['--game-color' as string]: GAME_COLOR[game] }}>
      {GAME_BY_ID[game].name}
    </span>
  );
}

export function SourceLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="src">
      {children ?? href.replace(/^https?:\/\//, '')} ↗
    </a>
  );
}

export function SectionHead({ id, n, title, children }: { id: string; n: number; title: string; children?: ReactNode }) {
  return (
    <header className="section-head" id={`${id}-head`}>
      <span className="eyebrow">
        <b>{String(n).padStart(2, '0')}</b> / {title}
      </span>
      <h2>{title}</h2>
      {children && <div className="lede">{children}</div>}
    </header>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'block' | 'info' | 'ok'; children: ReactNode }) {
  const ico = tone === 'warn' ? '!' : tone === 'block' ? '×' : tone === 'ok' ? '✓' : 'i';
  return (
    <div className={`notice ${tone}`} role={tone === 'block' ? 'alert' : undefined}>
      <span className="ico" aria-hidden="true">
        {ico}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Stat({ k, v, s, small }: { k: ReactNode; v: ReactNode; s?: ReactNode; small?: boolean }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className={`v ${small ? 'sm' : ''}`}>{v}</span>
      {s && <span className="s">{s}</span>}
    </div>
  );
}

/** Numeric input where blank means "not supplied" (null), never zero. */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  step,
  required,
  hint,
  badge,
  id,
}: {
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  min?: number;
  step?: number | 'any';
  required?: boolean;
  hint?: string;
  badge?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value && !(Number.isNaN(parsed) && value == null)) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text.trim() !== '' && !Number.isFinite(Number(text));
  const missing = required && text.trim() === '';
  return (
    <label className="field" htmlFor={id ?? auto} title={hint}>
      <span className="lbl">
        <span>{label}</span>
        {badge}
      </span>
      <span className={suffix ? 'input-suffix' : undefined}>
        <input
          id={id ?? auto}
          className={`num-input ${missing ? 'is-missing' : ''} ${invalid ? 'is-invalid' : ''}`}
          inputMode="decimal"
          value={text}
          min={min}
          step={step}
          placeholder={required ? 'Missing' : 'Optional'}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setText(e.target.value);
            const t = e.target.value.trim();
            if (t === '') onChange(null);
            else if (Number.isFinite(Number(t))) onChange(Number(t));
          }}
        />
        {suffix && <span>{suffix}</span>}
      </span>
    </label>
  );
}

/** Percentage input that stores a decimal probability. */
export function PercentField(props: Omit<Parameters<typeof NumberField>[0], 'value' | 'onChange' | 'suffix'> & { value: number | null; onChange: (v: number | null) => void }) {
  const { value, onChange, ...rest } = props;
  return (
    <NumberField
      {...rest}
      suffix="%"
      step="any"
      value={value == null ? null : +(value * 100).toPrecision(10)}
      onChange={(v) => onChange(v == null ? null : v / 100)}
    />
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id?: string;
}) {
  const auto = useId();
  return (
    <label className="field" htmlFor={id ?? auto}>
      <span className="lbl">{label}</span>
      <select id={id ?? auto} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SourceSelect({ value, onChange, label }: { value: InputSource; onChange: (v: InputSource) => void; label: string }) {
  return (
    <select className="src-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as InputSource)}>
      <option value="measured">Measured</option>
      <option value="documented">Documented</option>
      <option value="illustrative">Illustrative</option>
    </select>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

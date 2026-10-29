// Prize pool split: suggested styles that always add up, manual editing with
// a live remainder, copy and CSV export. Saved on the project so the T&C can
// use it as the prize structure.

import { useState } from 'react';
import { Chip, Grid, NumberField, Section, TextField, useToolkit } from '../components/Fields';
import { copyText, saveFile, saveToGoogleSheets, slug } from '../model/exporting';
import { buildXlsx, toBase64, XLSX_MIME } from '../model/xlsx';
import { prizeWorkbook } from '../split/workbook';
import { fmtMoney } from '../model/money';
import { balanceToFirst, growingDailyRewards, label, perWinner, rangeSize, splitStats, suggestSplit, type GrowthMode, type PrizeRange, type SplitMode, type SplitState, type SplitStyle } from '../split/split';
import { blankDay, type DayConfig } from '../model/project';
import { dayWinners } from '../model/campaign';

const STYLES: { id: SplitStyle; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Gradual decrease' },
  { id: 'top-heavy', label: 'Top heavy', hint: 'Big top 3 / top 10' },
  { id: 'flat', label: 'Flat', hint: 'Close to equal' },
  { id: 'equal', label: 'Equal', hint: 'Everyone gets the same' },
  { id: 'custom', label: 'Custom', hint: 'Edit every row' },
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const rid = () => Math.random().toString(36).slice(2, 9);

export function PrizeSplit() {
  const { project: p, update } = useToolkit();
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<{ busy: boolean; url?: string | null; error?: string }>({ busy: false });
  const s: SplitState = p.split ?? {
    pool: p.prizes.totalPool,
    winners: p.prizes.winnersPerDay,
    currency: p.prizes.currency,
    style: 'balanced',
    mode: 'fixed',
    ranges: p.prizes.totalPool && p.prizes.winnersPerDay ? suggestSplit(p.prizes.totalPool, p.prizes.winnersPerDay, 'balanced') : [],
  };
  const set = (patch: Partial<SplitState>) => update((x) => ({ ...x, split: { ...s, ...patch } }));
  const money = (n: number) => fmtMoney(n, s.currency);
  const st = splitStats(s);
  const sorted = [...s.ranges].sort((a, b) => a.from - b.from);
  const max = Math.max(1, ...sorted.map((r) => perWinner(s, r)));

  const regenerate = (style: SplitStyle, pool = s.pool, winners = s.winners) => {
    if (style === 'custom' || !pool || !winners) return set({ style, pool, winners });
    set({ style, pool, winners, ranges: suggestSplit(pool, winners, style) });
  };
  const setRange = (id: string, patch: Partial<PrizeRange>) => set({ style: 'custom', ranges: s.ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const switchMode = (mode: SplitMode) =>
    set({
      mode,
      ranges: s.ranges.map((r) => (mode === 'percent' ? { ...r, percent: s.pool ? Math.round((perWinner(s, r) / s.pool) * 10000) / 100 : 0 } : { ...r, amount: perWinner(s, r) })),
    });
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(''), 3500);
  };
  const tsv = () =>
    [['Positions', 'Prize per winner', 'Winners', 'Range total'], ...sorted.map((r) => [label(r), money(perWinner(s, r)), String(rangeSize(r)), money(perWinner(s, r) * rangeSize(r))])]
      .map((r) => r.join('\t'))
      .join('\n');

  return (
    <div className="k-two">
      <div className="k-forms">
        <DailyGrowthSection />
        <Section title="Prize pool">
          <Grid cols={3}>
            <NumberField id="split-pool" label="Total prize pool" min={0} value={s.pool} onChange={(pool) => regenerate(s.style, pool, s.winners)} />
            <NumberField id="split-winners" label="Number of winners" min={1} value={s.winners} onChange={(winners) => regenerate(s.style, s.pool, winners)} />
            <TextField id="split-currency" label="Currency" value={s.currency} onChange={(currency) => set({ currency: currency.toUpperCase() })} />
          </Grid>
          <div className="k-row">
            <button className="k-link" onClick={() => regenerate(s.style, p.prizes.totalPool, p.prizes.winnersPerDay)}>
              Use campaign values ({fmtMoney(p.prizes.totalPool, p.prizes.currency)}, {p.prizes.winnersPerDay ?? '?'} winners)
            </button>
          </div>
        </Section>
        <Section title="Distribution">
          <div className="k-styles" role="group" aria-label="Distribution style">
            {STYLES.map((x) => (
              <button key={x.id} id={`style-${x.id}`} aria-pressed={s.style === x.id} onClick={() => regenerate(x.id)}>
                <b>{x.label}</b>
                <small>{x.hint}</small>
              </button>
            ))}
          </div>
          <div className="k-row">
            <span className="k-muted k-small">Edit as</span>
            <div className="k-seg" role="group" aria-label="Edit mode">
              <button aria-pressed={s.mode === 'fixed'} onClick={() => switchMode('fixed')}>
                Amount
              </button>
              <button aria-pressed={s.mode === 'percent'} onClick={() => switchMode('percent')}>
                % of pool
              </button>
            </div>
          </div>
          <div className="k-tablewrap">
            <table className="k-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>{s.mode === 'fixed' ? 'Prize per winner' : '% per winner'}</th>
                  <th className="num">Per winner</th>
                  <th className="num">Range total</th>
                  <th aria-label="Bar" />
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <NumCell label="From position" min={1} value={r.from} onChange={(from) => setRange(r.id, { from: Math.max(1, Math.floor(from)) })} />
                    </td>
                    <td>
                      <NumCell label="To position" min={1} value={r.to} onChange={(to) => setRange(r.id, { to: Math.max(1, Math.floor(to)) })} />
                    </td>
                    <td>
                      {s.mode === 'fixed' ? (
                        <NumCell label="Prize per winner" min={0} value={r.amount} onChange={(amount) => setRange(r.id, { amount })} />
                      ) : (
                        <NumCell label="Percent per winner" min={0} value={r.percent} onChange={(percent) => setRange(r.id, { percent })} />
                      )}
                    </td>
                    <td className="num">{money(perWinner(s, r))}</td>
                    <td className="num">{money(perWinner(s, r) * rangeSize(r))}</td>
                    <td className="k-barcell">
                      <i style={{ width: `${(perWinner(s, r) / max) * 100}%` }} />
                    </td>
                    <td>
                      <button className="k-link danger" aria-label={`Remove ${label(r)}`} onClick={() => set({ style: 'custom', ranges: s.ranges.filter((x) => x.id !== r.id) })}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="k-row">
            <button
              className="t-btn"
              onClick={() => {
                const last = sorted[sorted.length - 1];
                const from = (last?.to ?? 0) + 1;
                set({ style: 'custom', ranges: [...s.ranges, { id: rid(), from, to: Math.max(from, s.winners ?? from), amount: 0, percent: 0 }] });
              }}
            >
              + Add range
            </button>
            {st.remaining !== 0 && s.pool != null && (
              <button className="t-btn" onClick={() => set(balanceToFirst(s))}>
                {st.remaining > 0 ? `Put ${money(st.remaining)} on 1st place` : `Take ${money(-st.remaining)} off 1st place`}
              </button>
            )}
            <button
              className="t-btn ghost"
              onClick={async () => flash((await copyText(tsv())) ? 'Table copied. Paste it into a sheet.' : 'Copy is blocked here. Select the table and copy it.')}
            >
              Copy table
            </button>
            <button
              id="split-xlsx"
              className="t-btn"
              disabled={!s.ranges.length}
              onClick={async () => {
                const r = await saveFile(`${slug(p.promo.name)}-prizes.xlsx`, buildXlsx(prizeWorkbook(p, s)), XLSX_MIME);
                flash(r === 'saved' ? 'Excel file saved.' : r === 'declined' ? 'Download cancelled.' : 'Download is not available here. Use Copy table.');
              }}
            >
              Download Excel
            </button>
            <button
              id="split-gsheet"
              className="t-btn"
              disabled={!s.ranges.length || sheet.busy}
              onClick={async () => {
                setSheet({ busy: true });
                const r = await saveToGoogleSheets(`${p.promo.name || 'Promotion'} — prizes`, toBase64(buildXlsx(prizeWorkbook(p, s))));
                setSheet(r.ok ? { busy: false, url: r.url } : { busy: false, error: r.reason });
              }}
            >
              {sheet.busy ? 'Saving…' : 'Save to Google Sheets'}
            </button>
            {note && <span className="t-ok-note">{note}</span>}
          </div>
          <div className="k-row">
            {sheet.url !== undefined && !sheet.error && (
              <span className="t-ok-note">
                Created a Google Sheet in your Drive.{' '}
                {sheet.url && (
                  <a href={sheet.url} target="_blank" rel="noreferrer">
                    Open it
                  </a>
                )}
              </span>
            )}
            {sheet.error && <span className="k-small k-err">{sheet.error}</span>}
            <span className="k-muted k-small">The workbook has the split and the daily prizes, with formulas so totals update when you edit.</span>
          </div>
        </Section>
      </div>
      <aside className="k-side">
        <div className={`k-status ${st.remaining === 0 && !st.overlaps.length ? 'ok' : st.remaining < 0 || st.overlaps.length ? 'bad' : 'warn'}`}>
          <b>{st.remaining === 0 ? 'Adds up to the pool' : st.remaining > 0 ? `${money(st.remaining)} not allocated` : `${money(-st.remaining)} over the pool`}</b>
          <span>
            Allocated {money(st.allocated)} of {money(s.pool ?? 0)}
          </span>
        </div>
        <dl className="k-stats">
          <div>
            <dt>Prize pool</dt>
            <dd>{money(s.pool ?? 0)}</dd>
          </div>
          <div>
            <dt>Winners</dt>
            <dd>{s.winners ?? '—'}</dd>
          </div>
          <div>
            <dt>Allocated</dt>
            <dd>{money(st.allocated)}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd className={st.remaining === 0 ? '' : 'bad'}>{money(st.remaining)}</dd>
          </div>
          <div>
            <dt>Average prize</dt>
            <dd>{money(Math.round(st.average * 100) / 100)}</dd>
          </div>
          <div>
            <dt>Median prize</dt>
            <dd>{money(st.median)}</dd>
          </div>
          <div>
            <dt>1st place</dt>
            <dd>
              {money(st.first)} <small>{pct(st.firstShare)}</small>
            </dd>
          </div>
          <div>
            <dt>Top 3 / Top 10</dt>
            <dd>
              {pct(st.top3Share)} / {pct(st.top10Share)}
            </dd>
          </div>
        </dl>
        {st.overlaps.length > 0 && <Chip tone="bad">Positions listed twice: {st.overlaps.slice(0, 5).join(', ')}</Chip>}
        {st.gaps.length > 0 && <Chip tone="warn">{st.gaps.length} positions have no prize</Chip>}
        {st.rising.length > 0 && <Chip tone="warn">Prize rises at {st.rising.join(', ')}</Chip>}
        <label className="k-inline-check k-small">
          <input
            type="checkbox"
            checked={p.prizes.structureSource === 'split'}
            onChange={(e) => update((x) => ({ ...x, split: s, prizes: { ...x.prizes, structureSource: e.target.checked ? 'split' : 'daily' } }))}
          />{' '}
          Use this split as the prize structure in the T&C
        </label>
      </aside>
    </div>
  );
}

/** Number cell that lets the box be cleared while typing; only valid numbers are saved. */
function NumCell({ value, onChange, label: aria, min }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      aria-label={aria}
      type="number"
      min={min}
      step="any"
      value={txt ?? String(value)}
      onChange={(e) => {
        setTxt(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setTxt(null)}
    />
  );
}

/** Daily rewards that rise every day, filling the campaign's daily prizes. */
function DailyGrowthSection() {
  const { project: p, update } = useToolkit();
  const [pool, setPool] = useState<number | null>(p.prizes.totalPool);
  const [days, setDays] = useState<number | null>(p.days.length || p.promo.declaredDays || 7);
  const [winners, setWinners] = useState<number | null>(p.prizes.winnersPerDay ?? 50);
  const [mode, setMode] = useState<GrowthMode>('steps');
  const [factor, setFactor] = useState<number | null>(2.5);
  const [msg, setMsg] = useState('');
  const n = Math.max(0, Math.min(60, Math.floor(days ?? 0)));
  // Days that already exist keep their own winner counts.
  const perDay = Array.from({ length: n }, (_, i) => (p.days[i] ? dayWinners(p, p.days[i]) : null) ?? winners ?? 0);
  const g = pool && n && perDay.every((w) => w >= 1) && factor != null ? growingDailyRewards(pool, perDay, mode, factor) : null;
  const money = (v: number) => fmtMoney(v, p.prizes.currency || 'USD');
  return (
    <Section title="Daily rewards that grow every day" note="Each day pays more per winner than the day before">
      <Grid cols={4}>
        <NumberField id="grow-pool" label="Total prize pool" min={0} value={pool} onChange={setPool} />
        <NumberField id="grow-days" label="Days" min={1} value={days} onChange={setDays} />
        <NumberField id="grow-winners" label="Winners per day" min={1} value={winners} onChange={setWinners} hint={p.days.length ? 'Existing days keep their own count' : undefined} />
        <div className="k-field">
          <span>How it grows</span>
          <div className="k-seg" role="group" aria-label="Growth">
            <button type="button" aria-pressed={mode === 'steps'} onClick={() => (setMode('steps'), setFactor(2.5))}>
              Even steps
            </button>
            <button type="button" aria-pressed={mode === 'percent'} onClick={() => (setMode('percent'), setFactor(15))}>
              Same %
            </button>
          </div>
        </div>
        <NumberField
          id="grow-factor"
          label={mode === 'steps' ? 'Last day pays × the first' : 'Increase each day'}
          suffix={mode === 'steps' ? '×' : '%'}
          min={mode === 'steps' ? 1 : 0}
          step={mode === 'steps' ? 0.1 : 1}
          value={factor}
          onChange={setFactor}
        />
      </Grid>
      {g && (
        <>
          <div className="k-tablewrap">
            <table className="k-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Winners</th>
                  <th className="num">Per winner</th>
                  <th className="num">Day pool</th>
                  <th aria-label="Bar" />
                </tr>
              </thead>
              <tbody>
                {g.rewards.map((r, i) => (
                  <tr key={i}>
                    <td>Day {i + 1}</td>
                    <td className="num">{perDay[i]}</td>
                    <td className="num">{money(r)}</td>
                    <td className="num">{money(r * perDay[i])}</td>
                    <td className="k-barcell">
                      <i style={{ width: `${(r / g.rewards[g.rewards.length - 1]) * 100}%` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="k-row">
            <span className={g.remaining === 0 ? 't-ok-note' : 'k-err k-small'}>
              {g.remaining === 0 ? `Adds up to ${money(g.allocated)}.` : `${money(g.remaining)} cannot be split into whole amounts; adjust the pool or winners.`}
            </span>
            <button
              id="grow-apply"
              className="t-btn primary"
              onClick={() => {
                update((x) => ({
                  ...x,
                  prizes: {
                    ...x.prizes,
                    totalPool: x.prizes.totalPool ?? pool,
                    winnersPerDay: x.prizes.winnersPerDay ?? winners,
                    rewardStructure: x.prizes.rewardStructure || 'Progressive Reward Structure',
                    structureSource: 'daily',
                  },
                  days: [...Array.from({ length: n }, (_, i): DayConfig => ({ ...(x.days[i] ?? blankDay()), reward: g.rewards[i] })), ...x.days.slice(n)],
                }));
                setMsg(`Daily rewards set for ${n} days.`);
                setTimeout(() => setMsg(''), 4000);
              }}
            >
              Use for the campaign’s days
            </button>
            {msg && <span className="t-ok-note">{msg}</span>}
          </div>
        </>
      )}
    </Section>
  );
}

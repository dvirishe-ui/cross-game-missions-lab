import { useMemo, useState } from 'react';
import {
  COMPETITORS,
  CROSS_GAME_LABEL,
  PAYOUT_LABEL,
  PROGRESSION_LABEL,
  SUPPORTING_SOURCES,
  TASK_TYPE_LABEL,
  campaignStatus,
  type CompetitorTaskType,
  type CrossGameClass,
  type PayoutStructure,
  type Progression,
} from '../data/competitors';
import { Badge, SectionHead, SelectField, SourceLink } from '../components/ui';
import { useApp } from '../state/AppContext';
import { adaptCompetitor } from '../state/scenarios';

const TODAY = new Date();

export function Competitors() {
  const { openInBuilder } = useApp();
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('all');
  const [taskType, setTaskType] = useState<'all' | CompetitorTaskType>('all');
  const [progression, setProgression] = useState<'all' | Progression>('all');
  const [payout, setPayout] = useState<'all' | PayoutStructure>('all');
  const [cross, setCross] = useState<'all' | CrossGameClass>('all');

  const providers = [...new Set(COMPETITORS.map((c) => c.provider))];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return COMPETITORS.filter((c) => {
      if (provider !== 'all' && c.provider !== provider) return false;
      if (taskType !== 'all' && !c.tasks.some((t) => t.type === taskType)) return false;
      if (progression !== 'all' && c.progression !== progression) return false;
      if (payout !== 'all' && c.payout !== payout) return false;
      if (cross !== 'all' && c.crossGame !== cross) return false;
      if (!needle) return true;
      const hay = [c.provider, c.channel, c.title, c.dateText, c.classification, c.takeaway, ...c.facts, ...c.tasks.map((t) => `${t.text} ${t.reward ?? ''}`)].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [q, provider, taskType, progression, payout, cross]);

  const clear = () => {
    setQ('');
    setProvider('all');
    setTaskType('all');
    setProgression('all');
    setPayout('all');
    setCross('all');
  };

  return (
    <section className="section" id="competitors">
      <SectionHead id="competitors" n={3} title="Competitor research">
        Published missions from other providers and operators. All campaigns are historical and shown with their published dates. A campaign that lists several
        eligible games is not evidence that players had to play every game.
      </SectionHead>

      <div className="card flat">
        <div className="form-grid">
          <label className="field" htmlFor="comp-search" style={{ gridColumn: 'span 2' }}>
            <span className="lbl">Search</span>
            <input id="comp-search" type="search" placeholder="e.g. multiplier, first come, Keno" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <SelectField label="Provider" value={provider} onChange={setProvider} options={[{ value: 'all', label: 'All providers' }, ...providers.map((p) => ({ value: p, label: p }))]} />
          <SelectField
            label="Task type"
            value={taskType}
            onChange={setTaskType}
            options={[{ value: 'all', label: 'All task types' }, ...Object.entries(TASK_TYPE_LABEL).map(([value, label]) => ({ value: value as CompetitorTaskType, label }))]}
          />
          <SelectField
            label="Sequential / simultaneous"
            value={progression}
            onChange={setProgression}
            options={[{ value: 'all', label: 'Any structure' }, ...Object.entries(PROGRESSION_LABEL).map(([value, label]) => ({ value: value as Progression, label }))]}
          />
          <SelectField
            label="Payout structure"
            value={payout}
            onChange={setPayout}
            options={[{ value: 'all', label: 'Any payout' }, ...Object.entries(PAYOUT_LABEL).map(([value, label]) => ({ value: value as PayoutStructure, label }))]}
          />
          <SelectField
            label="Cross-game classification"
            value={cross}
            onChange={setCross}
            options={[{ value: 'all', label: 'Any classification' }, ...Object.entries(CROSS_GAME_LABEL).map(([value, label]) => ({ value: value as CrossGameClass, label }))]}
          />
        </div>
        <div className="row-between">
          <span className="small muted">
            {list.length} of {COMPETITORS.length} entries
          </span>
          <button className="ghost small" onClick={clear}>
            Clear filters
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          No competitor entries match these filters.
          <button onClick={clear}>Clear filters</button>
        </div>
      ) : (
        <div className="grid g2">
          {list.map((c) => {
            const status = campaignStatus(c, TODAY);
            return (
              <article key={c.id} className="card comp-card">
                <div className="card-head">
                  <div className="stack-sm">
                    <span className="eyebrow">
                      {c.provider} · {c.channel}
                    </span>
                    <h3>{c.title}</h3>
                    <span className="small num">{c.dateText}</span>
                  </div>
                  <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                    <Badge kind="published" />
                    <span className="badge neutral plain">{status === 'undated' ? 'Product page' : status === 'historical' ? 'Historical · ended' : 'Dated campaign'}</span>
                  </div>
                </div>
                <div className="row">
                  <span className="chip">{PROGRESSION_LABEL[c.progression]}</span>
                  <span className="chip">{PAYOUT_LABEL[c.payout]}</span>
                  <span className="chip">{CROSS_GAME_LABEL[c.crossGame]}</span>
                </div>
                <p className="small">{c.classification}</p>
                <ul className="facts">
                  {c.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {c.calculated && (
                  <div className="stack-sm">
                    {c.calculated.map((x) => (
                      <div key={x} className="row small">
                        <Badge kind="calculated" />
                        <span>{x}</span>
                      </div>
                    ))}
                  </div>
                )}
                <details>
                  <summary>Task details ({c.tasks.length})</summary>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Published task</th>
                          <th>Reward</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.tasks.map((t) => (
                          <tr key={t.text}>
                            <td>{t.text}</td>
                            <td className="small">{t.reward ?? <span className="muted">Not listed here</span>}</td>
                            <td className="small muted">{TASK_TYPE_LABEL[t.type]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                {c.caveats.length > 0 && (
                  <ul className="clean small muted">
                    {c.caveats.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
                <p className="takeaway">
                  <strong>Takeaway.</strong> {c.takeaway}
                </p>
                <div className="row-between">
                  <SourceLink href={c.sourceUrl}>Source</SourceLink>
                  <button
                    className="violet"
                    onClick={() => openInBuilder(adaptCompetitor(c), `${c.provider} – ${c.title} structure copied into the builder as a proposal. No probabilities or timings were copied.`)}
                  >
                    Adapt this mechanic
                  </button>
                </div>
                <span className="tiny muted" style={{ overflowWrap: 'anywhere' }}>
                  {c.sourceUrl}
                </span>
              </article>
            );
          })}
        </div>
      )}

      <div className="grid g2">
        {SUPPORTING_SOURCES.map((s) => (
          <article key={s.url} className="card tight">
            <div className="row-between">
              <h4>{s.title}</h4>
              <Badge kind="published" />
            </div>
            <ul className="clean small">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <SourceLink href={s.url} />
          </article>
        ))}
      </div>
    </section>
  );
}

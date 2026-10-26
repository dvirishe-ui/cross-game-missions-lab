import { useMemo, useState, type ReactElement } from 'react';
import { DaysEditor, DetailsSection, GamesSection, PrizesSection, ScheduleSection } from '../components/CampaignForm';
import { AreaField, Chip, Grid, NumberField, Section, SelectField, TextField, useToolkit, YesNo } from '../components/Fields';
import { copyText, saveFile, slug } from '../model/exporting';
import { FIELDS } from '../model/fields';
import { PAYOUT_METHODS, type Project } from '../model/project';
import { briefBlocks, checklist, missingRefs, tcBlocks, toPlain, type Block } from '../tc/generate';
import { CLAUSES, REFERENCE_WORDING, SLOTS, referenceTemplate, saveMaster, type MasterTemplate } from '../tc/master';

type Up = (fn: (p: Project) => Project) => void;
const at = <K extends keyof Project>(update: Up, key: K) => (patch: Partial<Project[K]>) => update((p) => ({ ...p, [key]: { ...(p[key] as object), ...patch } }));

export function TcGenerator({ master, setMaster }: { master: MasterTemplate; setMaster: (t: MasterTemplate) => void }) {
  const { project: p, update, jump } = useToolkit();
  const [generated, setGenerated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const mode = p.tc.mode;
  const blocks = useMemo(() => (mode === 'brief' ? briefBlocks(p, master) : tcBlocks(p, master)), [p, master, mode]);
  const plain = useMemo(() => toPlain(blocks), [blocks]);
  const items = checklist(p, master);
  const missing = missingRefs(blocks);
  const bad = items.filter((i) => !i.ok);
  const edited = p.tc.editedText != null && p.tc.mode === (p.tc.editedBase?.startsWith('mode:tc') ? 'tc' : 'brief') ? p.tc.editedText : null;
  const editedBase = p.tc.editedBase?.replace(/^mode:\w+\n/, '') ?? null;
  const stale = edited != null && editedBase !== plain;
  const output = edited ?? plain;
  const setTc = at(update, 'tc');
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(''), 3500);
  };

  return (
    <div className="k-page">
      <div className="k-page-head">
        <div>
          <h1>T&C Generator</h1>
          <p className="k-muted">Built from the approved SPRIBE Adventure T&C. Campaign data fills the gaps; wording comes only from the master template; anything missing is marked, never guessed.</p>
        </div>
      </div>

      <div className="k-two tc">
        <div className="k-forms">
          <Section title="Before you generate" note={bad.length ? `${bad.length} missing` : 'All required fields filled'}>
            <ul className="k-checklist">
              {items.map((i) => (
                <li key={i.label} className={i.ok ? 'ok' : 'bad'}>
                  <span aria-hidden="true">{i.ok ? '✓' : '✕'}</span> {i.label}
                  {!i.ok && (
                    <button className="k-link" onClick={() => jump(i.ref)}>
                      Fill in
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
          <TcSettings />
          <details className="k-section">
            <summary>
              <h3>Campaign data</h3>
              <span className="k-note">Shared with the Promo Checker</span>
            </summary>
            <div className="k-section-body k-nested">
              <DetailsSection />
              <ScheduleSection />
              <GamesSection />
              <PrizesSection />
              <DaysEditor />
            </div>
          </details>
          <MasterEditor master={master} setMaster={setMaster} />
        </div>

        <aside className="k-side k-preview-side">
          <div className="k-row between">
            <div className="k-seg" role="group" aria-label="Preview mode">
              <button id="mode-brief" aria-pressed={mode === 'brief'} onClick={() => setTc({ mode: 'brief' })}>
                Full campaign brief
              </button>
              <button id="mode-tc" aria-pressed={mode === 'tc'} onClick={() => setTc({ mode: 'tc' })}>
                T&C only
              </button>
            </div>
            {generated && (
              <div className="k-row">
                <button className="t-btn ghost" onClick={async () => flash((await copyText(output)) ? 'Copied.' : 'Copy is blocked here. Select the text and copy it.')}>
                  Copy
                </button>
                <button
                  className="t-btn ghost"
                  onClick={async () => {
                    const r = await saveFile(`${slug(p.promo.name)}-${mode === 'brief' ? 'campaign-brief' : 'terms'}.txt`, output);
                    flash(r === 'saved' ? 'Saved.' : r === 'declined' ? 'Download cancelled.' : 'Download is not available here. Use Copy.');
                  }}
                >
                  Export .txt
                </button>
                {!editing ? (
                  <button
                    id="tc-edit"
                    className="t-btn ghost"
                    onClick={() => {
                      if (edited == null) setTc({ editedText: plain, editedBase: `mode:${mode}\n${plain}` });
                      setEditing(true);
                    }}
                  >
                    Edit
                  </button>
                ) : (
                  <button className="t-btn" onClick={() => setEditing(false)}>
                    Done editing
                  </button>
                )}
              </div>
            )}
          </div>
          {note && <span className="t-ok-note">{note}</span>}

          {!generated ? (
            <div className="k-generate">
              {bad.length > 0 ? (
                <>
                  <p>
                    <b>{bad.length} required field{bad.length === 1 ? ' is' : 's are'} missing.</b> They will appear as [MISSING: …] in the draft.
                  </p>
                  <ul className="k-missing">
                    {bad.map((b) => (
                      <li key={b.label}>
                        <button className="k-link" onClick={() => jump(b.ref)}>
                          {b.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  <b>All required fields are filled.</b>
                </p>
              )}
              <button id="tc-generate" className="t-btn primary" onClick={() => setGenerated(true)}>
                {bad.length ? `Generate draft with ${bad.length} gap${bad.length === 1 ? '' : 's'} marked` : 'Generate draft'}
              </button>
            </div>
          ) : (
            <>
              {missing.length > 0 && (
                <div className="k-missing-bar">
                  <b>{missing.length} missing:</b>{' '}
                  {missing.map((m, i) => (
                    <button key={i} className="k-miss" onClick={() => jump(m)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              {edited != null && (
                <div className="k-edited">
                  <Chip tone={stale ? 'warn' : 'info'}>{stale ? 'Edited · campaign data changed since' : 'Edited by hand'}</Chip>
                  <button
                    className="k-link"
                    onClick={() => {
                      setTc({ editedText: null, editedBase: null });
                      setEditing(false);
                    }}
                  >
                    Discard edits and regenerate
                  </button>
                </div>
              )}
              {editing ? (
                <textarea id="tc-text" className="k-editor" value={p.tc.editedText ?? plain} onChange={(e) => setTc({ editedText: e.target.value })} />
              ) : edited != null ? (
                <pre className="k-doc plain">{edited}</pre>
              ) : (
                <Doc blocks={blocks} />
              )}
              <p className="k-legend k-small">
                <span className="lg-value">campaign value</span> <span className="lg-text">template wording</span> <span className="lg-missing">[MISSING]</span> — click a missing marker to jump to its field.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Doc({ blocks }: { blocks: Block[] }) {
  const { jump } = useToolkit();
  const segs = (b: Block) =>
    b.segs.map((s, i) =>
      s.k === 'missing' ? (
        <button key={i} className="k-miss" onClick={() => s.ref && jump(s.ref)}>
          {s.s}
        </button>
      ) : (
        <span key={i} className={s.k === 'value' ? 'v' : undefined}>
          {s.s}
        </span>
      ),
    );
  const out: ReactElement[] = [];
  let list: { key: number; kind: 'li' | 'bullet'; items: Block[] } | null = null;
  const flush = () => {
    if (!list) return;
    const l = list;
    out.push(
      <ul key={`l${l.key}`} className={l.kind === 'bullet' ? 'tc' : ''}>
        {l.items.map((b, i) => (
          <li key={i} className={b.category ? `cat-${b.category}` : undefined} title={b.category ? `${CLAUSES.find((c) => c.id === b.clause)?.title} · ${b.category}` : undefined}>
            {segs(b)}
          </li>
        ))}
      </ul>,
    );
    list = null;
  };
  blocks.forEach((b, i) => {
    if (b.kind === 'li' || b.kind === 'bullet') {
      if (!list || list.kind !== b.kind) {
        flush();
        list = { key: i, kind: b.kind, items: [] };
      }
      list.items.push(b);
      return;
    }
    flush();
    if (b.kind === 'title') out.push(<h2 key={i}>{segs(b)}</h2>);
    else if (b.kind === 'subtitle') out.push(<p key={i} className="sub">{segs(b)}</p>);
    else if (b.kind === 'h2') out.push(<h3 key={i}>{segs(b)}</h3>);
    else if (b.kind === 'h3') out.push(<h4 key={i}>{segs(b)}</h4>);
    else out.push(<p key={i} className="kv"><b>{b.label}:</b> {segs(b)}</p>);
  });
  flush();
  return <div className="k-doc">{out}</div>;
}

function TcSettings() {
  const { project: p, update } = useToolkit();
  const el = at(update, 'eligibility');
  const pr = at(update, 'progress');
  const pay = at(update, 'payout');
  const cl = at(update, 'clauses');
  const prizes = at(update, 'prizes');
  return (
    <>
      <Section title="Eligibility">
        <Grid cols={2}>
          <TextField id={FIELDS.markets.id} label="Eligible markets" value={p.eligibility.markets} placeholder="e.g. Nigeria" onChange={(markets) => el({ markets })} />
          <TextField id={FIELDS.operators.id} label="Eligible operators (if relevant)" value={p.eligibility.operators} onChange={(operators) => el({ operators })} />
          <TextField id={FIELDS.qualification.id} label="Qualification condition" hint="“The first N eligible players to … will receive a prize”" value={p.eligibility.qualification} onChange={(qualification) => el({ qualification })} />
          <YesNo id="f-join" label="Players must click ‘Join’" value={p.eligibility.joinRequired} onChange={(joinRequired) => el({ joinRequired })} />
          <YesNo id="f-verified" label="Verified players only" value={p.eligibility.verifiedOnly} onChange={(verifiedOnly) => el({ verifiedOnly })} />
          <AreaField id="f-conditions" label="Other eligibility conditions (shown in the brief)" value={p.eligibility.conditions} onChange={(conditions) => el({ conditions })} />
        </Grid>
      </Section>
      <Section title="Progress">
        <Grid cols={3}>
          <YesNo id="f-progress-reset" label="Progress resets each day" value={p.progress.resetDaily} onChange={(resetDaily) => pr({ resetDaily })} />
          <YesNo id="f-progress-carry" label="Progress carries over" value={p.progress.carryOver} onChange={(carryOver) => pr({ carryOver })} />
          <YesNo id="f-progress-deadline" label="Must finish before the mission ends" value={p.progress.completionDeadline} onChange={(completionDeadline) => pr({ completionDeadline })} />
          <YesNo id="f-progress-round" label="Progress updates after every round" value={p.progress.updateAfterRound} onChange={(updateAfterRound) => pr({ updateAfterRound })} />
          <YesNo id="f-progress-refresh" label="Window refresh note" value={p.progress.refreshNote} onChange={(refreshNote) => pr({ refreshNote })} />
        </Grid>
        {p.progress.resetDaily && p.progress.carryOver && <Chip tone="bad">Progress cannot both reset and carry over. Choose one.</Chip>}
      </Section>
      <Section title="Payout">
        <Grid cols={3}>
          <TextField id={FIELDS.rewardType.id} label="Reward type" value={p.prizes.rewardType} placeholder="Cash" onChange={(rewardType) => prizes({ rewardType })} />
          <SelectField id={FIELDS.payoutMethod.id} label="Payout method" value={p.payout.method} options={PAYOUT_METHODS} onChange={(method) => pay({ method })} />
          <NumberField id={FIELDS.payoutHours.id} label="Payout deadline" suffix="hours" min={1} value={p.payout.deadlineHours} onChange={(deadlineHours) => pay({ deadlineHours })} />
          <NumberField id={FIELDS.maxRewards.id} label="Max rewards per player per mission" min={1} value={p.prizes.maxRewardsPerPlayer} onChange={(maxRewardsPerPlayer) => prizes({ maxRewardsPerPlayer })} />
          <YesNo id="f-currency-rule" label="Paid in the bet’s currency" value={p.payout.currencyRule} onChange={(currencyRule) => pay({ currencyRule })} />
        </Grid>
      </Section>
      <Section title="Standard clauses">
        <Grid cols={3}>
          <YesNo id="f-variable" label="Tasks vary by day" value={p.clauses.variableTasks} onChange={(variableTasks) => cl({ variableTasks })} />
          <YesNo id="f-future" label="Winners stay eligible next days" value={p.clauses.futureEligibility} onChange={(futureEligibility) => cl({ futureEligibility })} />
          <YesNo id="f-combinable" label="Can combine with other offers" value={p.clauses.combinable} onChange={(combinable) => cl({ combinable })} />
        </Grid>
        <p className="k-muted k-small">The cheating/collusion and change/termination clauses are fixed and always included.</p>
      </Section>
    </>
  );
}

function MasterEditor({ master, setMaster }: { master: MasterTemplate; setMaster: (t: MasterTemplate) => void }) {
  const [draft, setDraft] = useState<MasterTemplate>(master);
  const [unlockFixed, setUnlockFixed] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(master);
  const isRef = JSON.stringify({ ...draft, savedAt: null }) === JSON.stringify(referenceTemplate());
  return (
    <details className="k-section" id="f-master">
      <summary>
        <h3>Master template</h3>
        <span className="k-note">{master.savedAt ? `Saved ${new Date(master.savedAt).toLocaleString()}` : 'Reference wording (SPRIBE Adventure)'}</span>
      </summary>
      <div className="k-section-body">
        <p className="k-muted k-small">
          Wording used for every promotion. {'{{placeholders}}'} are filled from campaign data. Fixed clauses are locked unless you unlock them. Empty approved alternatives are shown as
          missing in the T&C.
        </p>
        <label className="k-inline-check k-small">
          <input type="checkbox" checked={unlockFixed} onChange={(e) => setUnlockFixed(e.target.checked)} /> Unlock fixed legal clauses for editing
        </label>
        <ol className="k-clauses">
          {CLAUSES.map((c) => {
            const locked = c.category === 'fixed' && !unlockFixed;
            const changed = draft.wording[c.id] !== REFERENCE_WORDING[c.id];
            return (
              <li key={c.id}>
                <div className="k-row">
                  <b>{c.title}</b>
                  <Chip tone={c.category === 'fixed' ? 'bad' : c.category === 'conditional' ? 'warn' : 'info'}>{c.category}</Chip>
                  <span className="k-muted k-small">{c.rule}</span>
                  {changed && <Chip tone="muted">changed from reference</Chip>}
                </div>
                <textarea
                  id={`f-wording-${c.id}`}
                  rows={2}
                  readOnly={locked}
                  value={draft.wording[c.id]}
                  onChange={(e) => setDraft({ ...draft, wording: { ...draft.wording, [c.id]: e.target.value } })}
                />
              </li>
            );
          })}
        </ol>
        <h4>Approved alternatives</h4>
        <p className="k-muted k-small">Not in the reference T&C. Paste approved legal wording here before using these options.</p>
        <ol className="k-clauses">
          {SLOTS.map((s) => (
            <li key={s.id}>
              <b>{s.label}</b>
              <textarea id={`f-slot-${s.id}`} rows={2} placeholder="Not approved yet" value={draft.slots[s.id] ?? ''} onChange={(e) => setDraft({ ...draft, slots: { ...draft.slots, [s.id]: e.target.value } })} />
            </li>
          ))}
        </ol>
        <div className="k-row">
          <button
            className="t-btn primary"
            disabled={!dirty}
            onClick={() => {
              const saved = saveMaster(draft);
              setMaster(saved);
              setDraft(saved);
              setMsg('Saved as the master template for all projects.');
            }}
          >
            Save as master template
          </button>
          <button className="t-btn ghost" disabled={!dirty} onClick={() => setDraft(master)}>
            Discard changes
          </button>
          {!isRef && (
            <button className="t-btn ghost" onClick={() => setDraft({ ...referenceTemplate(), savedAt: master.savedAt })}>
              Reset to reference wording
            </button>
          )}
          {msg && <span className="t-ok-note">{msg}</span>}
        </div>
      </div>
    </details>
  );
}

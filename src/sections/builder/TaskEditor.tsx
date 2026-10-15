import { CAMPAIGN_GAMES, GAME_BY_ID, type GameId } from '../../data/games';
import type { BuilderTask, MissionType, Scenario, TaskEvaluation } from '../../math/campaign';
import { fmtDuration } from '../../math/format';
import { Badge, GAME_COLOR, NumberField, PercentField, SelectField, SourceBadge, SourceSelect } from '../../components/ui';
import { describeTask } from '../../state/scenarios';

const TYPE_OPTIONS: { value: MissionType; label: string }[] = [
  { value: 'count', label: 'Bet / round count' },
  { value: 'multiplier', label: 'Repeated multiplier' },
  { value: 'accumulate', label: 'Accumulated multipliers' },
];

export function TaskEditor({
  task,
  index,
  total,
  scenario,
  evaluation,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  task: BuilderTask;
  index: number;
  total: number;
  scenario: Scenario;
  evaluation?: TaskEvaluation;
  onChange: (t: BuilderTask) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const set = <K extends keyof BuilderTask>(k: K, v: BuilderTask[K]) => onChange({ ...task, [k]: v });
  const id = (f: string) => `task-${task.id}-${f}`;
  const missing = evaluation?.missing ?? [];
  const concurrent = scenario.progression !== 'sequential' && (scenario.progression === 'simultaneous' ? scenario.tasks.length > 1 : scenario.tasks.filter((t) => t.stage === task.stage).length > 1);
  const time = evaluation?.model?.kind === 'deterministic' ? evaluation.model.minutes : null;

  return (
    <div className={`task-row ${missing.length ? 'missing' : ''}`} style={{ borderLeft: `3px solid ${GAME_COLOR[task.game]}` }}>
      <div className="task-top">
        <div className="row">
          <span className="num tiny muted">#{index + 1}</span>
          <strong>{GAME_BY_ID[task.game].name}</strong>
          <span className="small">{task.label || describeTask(task)}</span>
        </div>
        <div className="row">
          {missing.length > 0 ? <Badge kind="missing">{missing.length} missing</Badge> : evaluation?.status === 'approximate' ? <Badge kind="assumption">Rough approx.</Badge> : evaluation?.status === 'impossible' ? <Badge kind="missing">Impossible</Badge> : <Badge kind="calculated">Ready</Badge>}
          {scenario.progression === 'sequential' && (
            <>
              <button className="ghost small" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move earlier">
                ↑
              </button>
              <button className="ghost small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move later">
                ↓
              </button>
            </>
          )}
          <button className="ghost small" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="danger small" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
      <div className="form-grid">
        <SelectField id={id('game')} label="Game" value={task.game} onChange={(v) => set('game', v as GameId)} options={[...CAMPAIGN_GAMES, 'generic' as GameId].map((g) => ({ value: g, label: GAME_BY_ID[g].name }))} />
        <SelectField id={id('type')} label="Mission type" value={task.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
        <label className="field" htmlFor={id('label')} style={{ gridColumn: 'span 2' }}>
          <span className="lbl">Mission wording</span>
          <input id={id('label')} value={task.label} placeholder={describeTask(task)} onChange={(e) => set('label', e.target.value)} />
        </label>
        <NumberField
          id={id('target')}
          label={task.type === 'count' ? `Target ${task.unit}` : task.type === 'multiplier' ? 'Required successes k' : 'Target sum S'}
          value={task.target}
          onChange={(v) => set('target', v)}
          suffix={task.type === 'accumulate' ? '×' : undefined}
          required
        />
        {task.type === 'count' && (
          <>
            <SelectField id={id('unit')} label="Counts" value={task.unit} onChange={(v) => set('unit', v)} options={[{ value: 'bets', label: 'Individual bets' }, { value: 'rounds', label: 'Rounds' }]} />
            {task.unit === 'bets' && <NumberField id={id('bpr')} label="Bets per round" value={task.betsPerRound} onChange={(v) => set('betsPerRound', v)} required />}
          </>
        )}
        {task.type === 'multiplier' && (
          <>
            <NumberField id={id('th')} label="Threshold" value={task.threshold} onChange={(v) => set('threshold', v)} suffix="×" required />
            <SelectField id={id('cond')} label="Condition" value={task.condition} onChange={(v) => set('condition', v)} options={[{ value: 'gte', label: '≥ at least' }, { value: 'eq', label: '= exactly' }]} />
            <PercentField
              id={id('p')}
              label="p per attempt"
              value={task.p}
              onChange={(v) => set('p', v)}
              required
              badge={<SourceSelect label="Source of p" value={task.pSource} onChange={(v) => set('pSource', v)} />}
            />
            <SelectField
              id={id('can')}
              label="Config can produce it?"
              value={task.canProduce}
              onChange={(v) => set('canProduce', v)}
              options={[
                { value: 'unknown', label: 'Not verified' },
                { value: 'yes', label: 'Yes, verified' },
                { value: 'no', label: 'No: impossible' },
              ]}
            />
          </>
        )}
        {task.type === 'accumulate' && (
          <NumberField
            id={id('mu')}
            label="Average counted μ"
            value={task.mu}
            onChange={(v) => set('mu', v)}
            suffix="×"
            required
            badge={<SourceSelect label="Source of μ" value={task.muSource} onChange={(v) => set('muSource', v)} />}
          />
        )}
        <NumberField
          id={id('rate')}
          label="Rounds / min (solo)"
          value={task.rate}
          onChange={(v) => set('rate', v)}
          suffix="/min"
          required
          badge={<SourceSelect label="Source of rate" value={task.rateSource} onChange={(v) => set('rateSource', v)} />}
        />
        {concurrent && (
          <NumberField
            id={id('crate')}
            label="Rounds / min (concurrent)"
            value={task.concurrentRate}
            onChange={(v) => set('concurrentRate', v)}
            suffix="/min"
            hint="Measured rate while other missions are played at the same time. Blank: solo rate × concurrency factor."
          />
        )}
        <label className="field" htmlFor={id('route')}>
          <span className="lbl">Alternative-route group</span>
          <input id={id('route')} value={task.route} placeholder="Blank = own requirement" onChange={(e) => set('route', e.target.value)} />
        </label>
        {scenario.progression === 'staged' && (
          <SelectField id={id('stage')} label="Stage" value={String(task.stage)} onChange={(v) => set('stage', Number(v))} options={scenario.stages.map((s, i) => ({ value: String(i), label: s.name }))} />
        )}
      </div>
      <div className="row-between">
        <div className="row tiny muted">
          <span>Rate:</span>
          <SourceBadge source={task.rateSource} missing={task.rate == null} />
          {task.type === 'multiplier' && (
            <>
              <span>p:</span>
              <SourceBadge source={task.pSource} missing={task.p == null} />
            </>
          )}
          {task.type === 'accumulate' && (
            <>
              <span>μ:</span>
              <SourceBadge source={task.muSource} missing={task.mu == null} />
            </>
          )}
          {time != null && <span>· single-task time {fmtDuration(time)}</span>}
        </div>
        {missing.length > 0 && <span className="tiny" style={{ color: 'var(--block)' }}>Missing: {missing.join(', ')}</span>}
      </div>
      {task.note && <p className="tiny muted">{task.note}</p>}
    </div>
  );
}

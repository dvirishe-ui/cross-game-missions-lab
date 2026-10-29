// Promo Toolkit shell: four tools on one shared Promotion Project.
// Mission Calculator → Promo Checker → Promotion Timeline → T&C Generator.

import { useEffect, useMemo, useState } from 'react';
import TimerApp, { type CalcBridge } from '../timer/TimerApp';
import { simMissionsForDay } from '../sim/days';
import { Ctx, type ToolkitCtx } from './components/Fields';
import { ProjectBar } from './components/ProjectBar';
import { ThemeToggle } from './components/ThemeToggle';
import { dayWindowMin, dayWinners } from './model/campaign';
import type { FieldRef, Tab } from './model/fields';
import { blankDay, tasksKey } from './model/project';
import { useProjects } from './model/store';
import { checkProject, countBy } from './rules/checks';
import { PromoChecker } from './pages/PromoChecker';
import { TcGenerator } from './pages/TcGenerator';
import { TimelinePage } from './pages/Timeline';
import { tcBlocks, toPlain } from './tc/generate';
import { loadMaster, type MasterTemplate } from './tc/master';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calculator', label: 'Mission Calculator' },
  { id: 'checker', label: 'Promo Checker' },
  { id: 'timeline', label: 'Promotion Timeline' },
  { id: 'tc', label: 'T&C Generator' },
];
const isTab = (h: string): h is Tab => TABS.some((t) => t.id === h);
const finite = (n: number) => (Number.isFinite(n) ? n : null);

export default function ToolkitApp() {
  const store = useProjects();
  const { current: project, update } = store;
  const [tab, setTabState] = useState<Tab>(() => {
    const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    return isTab(h) ? h : 'calculator';
  });
  const [master, setMaster] = useState<MasterTemplate>(() => loadMaster());
  const [calcKey, setCalcKey] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* the viewer may not allow URL changes */
    }
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (isTab(h)) setTabState(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Jump to a field after its tab has rendered: open any collapsed section, scroll, focus, flash.
  useEffect(() => {
    if (!pendingFocus) return;
    const t = setTimeout(() => {
      const el = document.getElementById(pendingFocus);
      if (el) {
        for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
        el.classList.add('k-flash');
        setTimeout(() => el.classList.remove('k-flash'), 1600);
      }
      setPendingFocus(null);
    }, 80);
    return () => clearTimeout(t);
  }, [pendingFocus, tab]);

  const ctx: ToolkitCtx = {
    project,
    update,
    jump: (ref: FieldRef) => {
      if (ref.tab !== tab) setTab(ref.tab);
      setPendingFocus(ref.id);
    },
    goTab: setTab,
  };

  // Estimated days from every saved project, for "close to this time before".
  const pastEstimates = useMemo(() => {
    const realKeys = new Set([1, 2, 3, 4, 5, 6, 7].map((n) => tasksKey(simMissionsForDay(n))));
    return store.state.projects.flatMap((pr) =>
      pr.days.flatMap((d, i) => {
        const e = pr.estimates[d.id];
        if (!e || e.median == null || e.key !== tasksKey(d.tasks) || realKeys.has(e.key)) return [];
        return [{ label: `${pr.promo.name || 'Untitled'} · Day ${i + 1}`, minutes: e.median, missions: d.tasks, real: false }];
      }),
    );
  }, [store.state.projects]);

  // Mission Calculator ↔ project.
  const bridge: CalcBridge = {
    initial: project.calculator,
    onChange: (s) => update((p) => ({ ...p, calculator: s })),
    onResult: (s, r) => {
      if (!s.dayId) return;
      update((p) => {
        const d = p.days.find((x) => x.id === s.dayId);
        if (!d || tasksKey(d.tasks) !== tasksKey(s.missions) || dayWindowMin(p, d) !== s.windowMin || dayWinners(p, d) !== s.prizes) return p;
        return {
          ...p,
          estimates: { ...p.estimates, [d.id]: { median: finite(r.median), perTask: r.missionNthMedian.map(finite), pAllGone: r.pAllGone, windowMin: s.windowMin, key: tasksKey(d.tasks) } },
        };
      });
    },
    days: project.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}${d.tasks.length ? ` (${d.tasks.length} tasks)` : ''}` })),
    onSavePlan: (plan, perDay) =>
      update((p) => ({
        ...p,
        promo: { ...p.promo, declaredDays: p.promo.declaredDays ?? plan.length, declaredTasksPerDay: p.promo.declaredTasksPerDay ?? perDay },
        days: plan.map((tasks, i) => ({ ...(p.days[i] ?? blankDay()), tasks: tasks.map((t) => ({ ...t })) })),
      })),
    history: pastEstimates,
    marketHint: project.eligibility.markets,
    onSaveToDay: (dayId, missions) =>
      update((p) =>
        dayId === 'new'
          ? { ...p, days: [...p.days, { ...blankDay(), tasks: missions.map((t) => ({ ...t })) }] }
          : { ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, tasks: missions.map((t) => ({ ...t })) } : d)) },
      ),
  };

  const openInCalc = (i: number) => {
    const d = project.days[i];
    if (!d) return;
    const w = dayWindowMin(project, d) ?? 300;
    update((p) => ({
      ...p,
      calculator: {
        missions: d.tasks.map((t) => ({ ...t })),
        windowMin: w,
        targetMin: p.mission.targetMin ?? w,
        tol: p.calculator?.tol ?? Math.max(5, Math.round((w * 0.1) / 5) * 5),
        prizes: dayWinners(p, d) ?? 50,
        bets: p.calculator?.bets ?? 2,
        source: `Day ${i + 1} of ${p.promo.name || 'this promotion'}`,
        dayId: d.id,
      },
    }));
    setCalcKey((k) => k + 1);
    setTab('calculator');
  };

  const counts = useMemo(() => countBy(checkProject(project, { now: Date.now(), master, tcText: project.tc.editedText ?? toPlain(tcBlocks(project, master)) })), [project, master]);

  return (
    <Ctx.Provider value={ctx}>
      <header className="t-top">
        <div className="t-wrap t-top-row">
          <span className="t-brand">
            Promo <b>Toolkit</b>
          </span>
          <nav className="k-tabs" aria-label="Tools">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setTab(t.id);
                }}
              >
                {t.label}
                {t.id === 'checker' && (counts.error > 0 || counts.warning > 0) && (
                  <span className={`k-badge ${counts.error ? 'bad' : 'warn'}`} aria-label={`${counts.error} errors, ${counts.warning} warnings`}>
                    {counts.error || counts.warning}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </div>
        <div className="t-wrap">
          <ProjectBar
            projects={store.state.projects}
            current={project}
            open={store.open}
            create={store.create}
            duplicate={store.duplicate}
            rename={store.rename}
            remove={store.remove}
          />
        </div>
      </header>

      {tab === 'calculator' && <TimerApp key={`${project.id}-${calcKey}`} bridge={bridge} />}
      {tab !== 'calculator' && (
        <main className="t-wrap t-main">
          {tab === 'checker' && <PromoChecker master={master} onOpenInCalc={openInCalc} />}
          {tab === 'timeline' && <TimelinePage />}
          {tab === 'tc' && <TcGenerator master={master} setMaster={setMaster} />}
        </main>
      )}
    </Ctx.Provider>
  );
}

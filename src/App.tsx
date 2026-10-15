import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scenario } from './math/campaign';
import { AppContext, scrollToId, type AppApi } from './state/AppContext';
import { clearState, defaultScenario, loadState, saveState, type StoredState } from './state/scenarios';
import { Modal } from './components/ui';
import { Summary } from './components/Summary';
import { Overview } from './sections/Overview';
import { PreviousCampaign } from './sections/PreviousCampaign';
import { Competitors } from './sections/Competitors';
import { Calculator } from './sections/Calculator';
import { Builder } from './sections/builder/Builder';
import { Experiments } from './sections/Experiments';
import { DataNeeded } from './sections/DataNeeded';
import { Sources } from './sections/Sources';

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'previous', label: 'Previous campaign' },
  { id: 'competitors', label: 'Competitor research' },
  { id: 'calculator', label: 'Mission calculator' },
  { id: 'builder', label: 'Campaign builder' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'data', label: 'Data needed' },
  { id: 'sources', label: 'Sources & methodology' },
];

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  try {
    return localStorage.getItem('cgml-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const initial = useMemo(() => loadState(), []);
  const [current, setCurrent] = useState<Scenario>(() => (initial?.current ? { ...defaultScenario(), ...initial.current } : defaultScenario()));
  const [saved, setSaved] = useState<Scenario[]>(() => initial?.saved ?? []);
  const [observations, setObservations] = useState<StoredState['observations']>(() => initial?.observations ?? {});
  const [checks, setChecks] = useState<Record<string, boolean>>(() => initial?.checks ?? {});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [exported, setExported] = useState<{ name: string; text: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [summary, setSummary] = useState(false);
  const [active, setActive] = useState('overview');
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    saveState({ current, saved, observations, checks });
  }, [current, saved, observations, checks]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cgml-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-130px 0px -55% 0px' },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 4500);
  }, []);

  const api: AppApi = {
    current,
    setCurrent,
    saved,
    setSaved,
    observations,
    setObservation: (day, field, value) =>
      setObservations((o) => ({ ...o, [day]: { ...{ firstFinisher: '', finalPrize: '', entrants: '', prizes: '' }, ...o[day], [field]: value } })),
    checks,
    setCheck: (k, v) => setChecks((c) => ({ ...c, [k]: v })),
    openInBuilder: (s, message) => {
      setCurrent(s);
      toast(message);
      requestAnimationFrame(() => scrollToId('builder'));
    },
    toast,
    exportFile: (filename, text, mime) => {
      try {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch {
        /* fall back to the copy dialog */
      }
      setExported({ name: filename, text });
      toast(`Exported ${filename}.`);
    },
    openSummary: () => setSummary(true),
    resetAll: () => {
      clearState();
      setCurrent(defaultScenario());
      setSaved([]);
      setObservations({});
      setChecks({});
      toast('Local data reset.');
    },
  };

  return (
    <AppContext.Provider value={api}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <a href="#overview" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="brand-mark">
                Cross-Game Missions <span>Lab</span>
              </span>
              <span className="brand-sub">SPRIBE · internal research</span>
            </a>
            <div className="top-actions">
              <button className="ghost small" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle colour theme">
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button className="small" onClick={() => setSummary(true)}>
                Research summary
              </button>
            </div>
          </div>
          <nav className="nav" aria-label="Sections">
            {NAV.map((n, i) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'active' : undefined} aria-current={active === n.id ? 'true' : undefined}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <Overview />
        <PreviousCampaign />
        <Competitors />
        <Calculator />
        <Builder />
        <Experiments />
        <DataNeeded />
        <Sources />
        <footer className="foot">
          Cross-Game Missions Lab · internal research tool. Text-based branding only. Simulated and calculated outputs are model results, not actual SPRIBE performance.
          Unknown SPRIBE game parameters are left blank until supplied.
        </footer>
      </main>
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
          {exported && toastMsg.startsWith('Exported') && (
            <>
              {' '}
              <button className="ghost small" onClick={() => setShowExport(true)}>
                Download didn’t start? Copy contents
              </button>
            </>
          )}
        </div>
      )}
      {showExport && exported && (
        <Modal title={exported.name} onClose={() => setShowExport(false)}>
          <p className="small muted">Copy these contents and save them as {exported.name}.</p>
          <textarea readOnly value={exported.text} aria-label="Exported file contents" onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button
              className="primary"
              onClick={(e) => {
                const ta = (e.currentTarget.closest('.modal') as HTMLElement).querySelector('textarea')!;
                navigator.clipboard?.writeText(exported.text).then(
                  () => toast('Copied to clipboard.'),
                  () => {
                    ta.focus();
                    ta.select();
                    toast('Press Ctrl/⌘ + C to copy the selected text.');
                  },
                );
              }}
            >
              Copy to clipboard
            </button>
          </div>
        </Modal>
      )}
      {summary && <Summary onClose={() => setSummary(false)} />}
    </AppContext.Provider>
  );
}

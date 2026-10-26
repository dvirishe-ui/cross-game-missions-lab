import { useMemo, useState } from 'react';
import { DaysEditor, DetailsSection, GamesSection, MissionTargetField, PrizesSection, ScheduleSection } from '../components/CampaignForm';
import { Section, useToolkit } from '../components/Fields';
import { IssueList, IssueSummary } from '../components/Issues';
import { checkProject } from '../rules/checks';
import { tcBlocks, toPlain } from '../tc/generate';
import type { MasterTemplate } from '../tc/master';
import { PrizeSplit } from './PrizeSplit';

export function PromoChecker({ master, onOpenInCalc }: { master: MasterTemplate; onOpenInCalc: (dayIndex: number) => void }) {
  const { project: p, goTab } = useToolkit();
  const [sub, setSub] = useState<'check' | 'split'>('check');
  const issues = useMemo(() => {
    const tcText = p.tc.editedText ?? toPlain(tcBlocks(p, master));
    return checkProject(p, { now: Date.now(), master, tcText });
  }, [p, master]);
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="k-page">
      <div className="k-page-head">
        <div>
          <h1>Promo Checker</h1>
          <p className="k-muted">Enter the campaign once. Problems show on the right; click one to jump to the field.</p>
        </div>
        <div className="k-subtabs" role="tablist" aria-label="Promo Checker views">
          <button role="tab" id="sub-check" aria-selected={sub === 'check'} onClick={() => setSub('check')}>
            Campaign check
          </button>
          <button role="tab" id="sub-split" aria-selected={sub === 'split'} onClick={() => setSub('split')}>
            Prize split
          </button>
        </div>
      </div>

      {sub === 'split' ? (
        <PrizeSplit />
      ) : (
        <div className="k-two">
          <div className="k-forms">
            <DetailsSection />
            <ScheduleSection />
            <GamesSection />
            <PrizesSection />
            <Section title="Mission timing">
              <MissionTargetField />
            </Section>
            <DaysEditor onOpenInCalc={onOpenInCalc} />
          </div>
          <aside className="k-side">
            <IssueSummary issues={issues} />
            <label className="k-small k-muted k-inline-check">
              <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> Show info
            </label>
            <IssueList issues={issues} showInfo={showInfo} />
            <div className="k-next">
              <button className="t-btn" onClick={() => goTab('timeline')}>
                Timeline →
              </button>
              <button className="t-btn" onClick={() => goTab('tc')}>
                T&C →
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

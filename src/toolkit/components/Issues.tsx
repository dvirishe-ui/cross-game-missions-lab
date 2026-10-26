// ValidationMessage list: errors first, each one a link to the field it is about.

import { AREA_LABEL, countBy, type Issue, type Level } from '../rules/checks';
import { useToolkit } from './Fields';

const ICON: Record<Level, string> = { error: '!', warning: '△', info: 'i' };
const NAME: Record<Level, string> = { error: 'Error', warning: 'Warning', info: 'Info' };

export function IssueSummary({ issues }: { issues: Issue[] }) {
  const c = countBy(issues);
  const status = c.error ? 'bad' : c.warning ? 'warn' : 'ok';
  return (
    <div className={`k-status ${status}`}>
      <b>{c.error ? 'Fix before launch' : c.warning ? 'Check the warnings' : 'No problems found'}</b>
      <span>
        <i className="e">{c.error}</i> errors · <i className="w">{c.warning}</i> warnings · <i className="n">{c.info}</i> info
      </span>
    </div>
  );
}

export function IssueList({ issues, showInfo = true }: { issues: Issue[]; showInfo?: boolean }) {
  const { jump } = useToolkit();
  const order: Level[] = ['error', 'warning', 'info'];
  const list = issues.filter((i) => showInfo || i.level !== 'info').sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  if (!list.length) return <p className="k-muted">Nothing to report.</p>;
  return (
    <ul className="k-issues">
      {list.map((i, n) => (
        <li key={n} className={i.level}>
          <span className="k-icon" aria-label={NAME[i.level]}>
            {ICON[i.level]}
          </span>
          <div>
            <small>
              {NAME[i.level]} · {AREA_LABEL[i.area]}
            </small>
            <p>{i.message}</p>
            {i.ref && (
              <button className="k-link" onClick={() => jump(i.ref!)}>
                Go to {i.ref.label}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

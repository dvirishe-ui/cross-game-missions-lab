// The prize workbook: the prize split with live formulas, plus the daily
// prizes when the project has days.

import { calculatedTotal, dayDate, dayWinners } from '../model/campaign';
import type { Project } from '../model/project';
import { fmtDate } from '../model/time';
import type { Cell, Sheet } from '../model/xlsx';
import { label, perWinner, rangeSize, type SplitState } from './split';

export function prizeWorkbook(p: Project, s: SplitState): Sheet[] {
  const cur = s.currency || p.prizes.currency || '';
  const sorted = [...s.ranges].sort((a, b) => a.from - b.from);
  const first = 7;
  const last = first + sorted.length - 1;
  const total = last + 1;
  const pool = s.pool ?? 0;
  const allocated = sorted.reduce((a, r) => a + perWinner(s, r) * rangeSize(r), 0);
  const rows: Cell[][] = [
    [{ v: `Prize split — ${p.promo.name || 'Promotion'}`, s: 'title' }],
    ['Prize pool', { v: pool, s: 'money' }, cur],
    ['Winners', s.winners ?? null],
    ['Currency', cur],
    [],
    ['Positions', 'From', 'To', 'Winners', `Prize per winner (${cur})`, `Range total (${cur})`, 'Share of pool'].map((v) => ({ v, s: 'bold' as const })),
    ...sorted.map((r, i): Cell[] => {
      const row = first + i;
      const each = perWinner(s, r);
      return [
        label(r),
        r.from,
        r.to,
        { f: `C${row}-B${row}+1`, v: rangeSize(r) },
        { v: each, s: 'money' },
        { f: `D${row}*E${row}`, v: each * rangeSize(r), s: 'money' },
        { f: `IF($B$2=0,0,F${row}/$B$2)`, v: pool ? (each * rangeSize(r)) / pool : 0, s: 'percent' },
      ];
    }),
    [
      { v: 'Total', s: 'bold' },
      null,
      null,
      { f: `SUM(D${first}:D${last})`, v: sorted.reduce((a, r) => a + rangeSize(r), 0), s: 'bold' },
      null,
      { f: `SUM(F${first}:F${last})`, v: allocated, s: 'boldMoney' },
      { f: `IF($B$2=0,0,F${total}/$B$2)`, v: pool ? allocated / pool : 0, s: 'boldPercent' },
    ],
    [{ v: 'Remaining (pool − total)', s: 'bold' }, null, null, null, null, { f: `B2-F${total}`, v: pool - allocated, s: 'boldMoney' }],
  ];
  const sheets: Sheet[] = [{ name: 'Prize split', cols: [26, 8, 8, 10, 22, 22, 14], rows }];

  if (p.days.length) {
    const d0 = 4;
    const dl = d0 + p.days.length - 1;
    const dt = dl + 1;
    const calc = calculatedTotal(p);
    sheets.push({
      name: 'Daily prizes',
      cols: [10, 14, 10, 22, 22],
      rows: [
        [{ v: `Daily prizes — ${p.promo.name || 'Promotion'}`, s: 'title' }],
        [],
        ['Day', 'Date', 'Winners', `Reward per winner (${cur})`, `Daily pool (${cur})`].map((v) => ({ v, s: 'bold' as const })),
        ...p.days.map((d, i): Cell[] => {
          const row = d0 + i;
          const w = dayWinners(p, d);
          return [`Day ${i + 1}`, fmtDate(dayDate(p, i)) || null, w, d.reward != null ? { v: d.reward, s: 'money' } : null, { f: `C${row}*D${row}`, v: w != null && d.reward != null ? w * d.reward : undefined, s: 'money' }];
        }),
        [{ v: 'Total', s: 'bold' }, null, { f: `SUM(C${d0}:C${dl})`, s: 'bold' }, null, { f: `SUM(E${d0}:E${dl})`, v: calc ?? undefined, s: 'boldMoney' }],
        [{ v: 'Configured total prize pool', s: 'bold' }, null, null, null, { v: p.prizes.totalPool ?? undefined, s: 'boldMoney' }],
        [{ v: 'Difference', s: 'bold' }, null, null, null, { f: `E${dt + 1}-E${dt}`, v: p.prizes.totalPool != null && calc != null ? p.prizes.totalPool - calc : undefined, s: 'boldMoney' }],
      ],
    });
  }
  return sheets;
}

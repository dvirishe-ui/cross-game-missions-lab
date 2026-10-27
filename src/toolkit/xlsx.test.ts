import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { referenceProject } from './model/project';
import { buildXlsx, crc32 } from './model/xlsx';
import { suggestSplit } from './split/split';
import { prizeWorkbook } from './split/workbook';

describe('xlsx export', () => {
  it('crc32 matches the standard check value', () => expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));
  it('builds a zip with the split and daily sheets', () => {
    const p = referenceProject();
    const s = { pool: 15000, winners: 50, currency: 'USD', style: 'balanced' as const, mode: 'fixed' as const, ranges: suggestSplit(15000, 50, 'balanced') };
    const bytes = buildXlsx(prizeWorkbook(p, s));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('<f>SUM(F7:F');
    expect(text).toContain('Daily prizes');
    if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, bytes);
  });
});

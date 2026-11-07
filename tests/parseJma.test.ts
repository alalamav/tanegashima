import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  countMissing,
  dailyRange,
  columns,
  parseDep,
  parseHry,
  parseIntField,
  toLines,
  JmaParseError,
  HRY_LINE_LENGTH,
  DEP_LINE_LENGTH,
} from '../src/data/parseJma.js';

const rawDir = resolve(import.meta.dirname, '../data/raw/jma');
const read = (name: string) => readFileSync(resolve(rawDir, name), 'utf8');

const MONTHS = ['09', '10', '11', '12'] as const;
const hry = Object.fromEntries(
  MONTHS.map((m) => [m, parseHry(read(`hry1999${m}TJ.txt`), `hry1999${m}`)]),
);
const dep = Object.fromEntries(
  MONTHS.map((m) => [m, parseDep(read(`dep1999${m}TJ.txt`), `dep1999${m}`)]),
);

describe('file shape', () => {
  it('has 30, 31, 30, 31 lines for Sep–Dec', () => {
    expect(MONTHS.map((m) => hry[m].length)).toEqual([30, 31, 30, 31]);
    expect(MONTHS.map((m) => dep[m].length)).toEqual([30, 31, 30, 31]);
  });

  it('has 136-character hry lines and 106-character dep lines', () => {
    for (const month of MONTHS) {
      for (const line of toLines(read(`hry1999${month}TJ.txt`))) {
        expect(line.length).toBe(HRY_LINE_LENGTH);
      }
      for (const line of toLines(read(`dep1999${month}TJ.txt`))) {
        expect(line.length).toBe(DEP_LINE_LENGTH);
      }
    }
  });

  it('dates run consecutively from the 1st', () => {
    for (const month of MONTHS) {
      hry[month].forEach((day, index) => {
        expect(day.dateJst).toBe(`1999-${month}-${String(index + 1).padStart(2, '0')}`);
      });
      dep[month].forEach((day, index) => {
        expect(day.dateJst).toBe(`1999-${month}-${String(index + 1).padStart(2, '0')}`);
      });
    }
  });
});

describe('missing values', () => {
  it('counts 28, 13, 0, 0 missing hourly values for Sep–Dec', () => {
    expect(MONTHS.map((m) => countMissing(hry[m]))).toEqual([28, 13, 0, 0]);
  });

  it('finds the same gaps in the anomaly file', () => {
    expect(MONTHS.map((m) => countMissing(dep[m]))).toEqual([28, 13, 0, 0]);
  });

  it('puts the October gap entirely on 14 Oct, 03–15 h JST', () => {
    const day = hry['10'][13];
    expect(day.dateJst).toBe('1999-10-14');
    const missing = day.hourly.flatMap((value, hour) => (value === null ? [hour] : []));
    expect(missing).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe('values read from JMA by hand', () => {
  it('parses hry for 1999-10-07, 0–23 h JST', () => {
    expect(hry['10'][6].dateJst).toBe('1999-10-07');
    expect(hry['10'][6].hourly).toEqual([
      360, 383, 411, 436, 452, 455, 441, 413, 378, 344, 320, 313, 325, 351, 386, 421, 450, 464,
      459, 439, 408, 375, 348, 335,
    ]);
  });

  it('parses dep for 1999-10-07', () => {
    expect(dep['10'][6].hourly).toEqual([
      10, 10, 9, 7, 6, 7, 7, 7, 8, 8, 9, 10, 12, 12, 11, 9, 8, 8, 6, 6, 7, 7, 8, 10,
    ]);
  });

  it('parses 1999-10-06 07 h JST as obs 379, dep 3', () => {
    expect(hry['10'][5].hourly[7]).toBe(379);
    expect(dep['10'][5].hourly[7]).toBe(3);
  });

  it('parses 1999-12-11 07 h JST as obs 413, dep −10', () => {
    expect(hry['12'][10].hourly[7]).toBe(413);
    expect(dep['12'][10].hourly[7]).toBe(-10);
  });

  it('parses the first line of hry199910TJ.txt completely', () => {
    const day = hry['10'][0];
    expect(day.hourly[0]).toBe(410);
    expect(day.dateJst).toBe('1999-10-01');
    expect(day.highs[0]).toEqual({ hour: 10, minute: 28, cm: 437 });
    expect(day.lows[0]).toEqual({ hour: 4, minute: 5, cm: 313 });
  });
});

describe('daily range', () => {
  it('matches the hand-read values for 26 Sep and 7 Oct', () => {
    expect(dailyRange(hry['09'][25])).toBe(181);
    expect(dailyRange(hry['10'][6])).toBe(151);
  });

  it('finds 68 cm on 19 Sep as the minimum and 228 cm on 24 Dec as the maximum', () => {
    const days = MONTHS.flatMap((m) =>
      hry[m].map((day) => ({ date: day.dateJst, range: dailyRange(day) })),
    ).filter((d): d is { date: string; range: number } => d.range !== null);

    const min = days.reduce((a, b) => (b.range < a.range ? b : a));
    const max = days.reduce((a, b) => (b.range > a.range ? b : a));
    expect(min).toEqual({ date: '1999-09-19', range: 68 });
    expect(max).toEqual({ date: '1999-12-24', range: 228 });
  });

  it('skips days with fewer than 19 readings', () => {
    // 14 Sep JST keeps only hours 0–5.
    expect(dailyRange(hry['09'][13])).toBeNull();
  });
});

describe('extrema blocks', () => {
  it('treats 9999999 as "no extremum" rather than a reading', () => {
    for (const month of MONTHS) {
      for (const day of hry[month]) {
        for (const extremum of [...day.highs, ...day.lows]) {
          expect(extremum.cm).toBeLessThan(999);
          expect(extremum.hour).toBeGreaterThanOrEqual(0);
          expect(extremum.hour).toBeLessThanOrEqual(23);
          expect(extremum.minute).toBeLessThanOrEqual(59);
        }
      }
    }
  });

  it('records between 1 and 4 highs and lows on a complete day', () => {
    const day = hry['10'][6];
    expect(day.highs.length).toBeGreaterThanOrEqual(1);
    expect(day.highs.length).toBeLessThanOrEqual(4);
    expect(day.lows.length).toBeGreaterThanOrEqual(1);
    expect(day.lows.length).toBeLessThanOrEqual(4);
  });
});

describe('column slicing is not whitespace splitting', () => {
  it('reads touching values apart correctly', () => {
    // The first 12 characters of hry199910TJ.txt line 1 are "410376345322".
    const line = toLines(read('hry199910TJ.txt'))[0];
    expect(columns(line, 1, 12)).toBe('410376345322');
    expect(hry['10'][0].hourly.slice(0, 4)).toEqual([410, 376, 345, 322]);
    // Splitting on whitespace would have produced one 12-digit token here.
    expect(line.slice(0, 72).trim().split(/\s+/)[0].length).toBeGreaterThan(3);
  });
});

describe('error paths', () => {
  it('rejects a short line', () => {
    expect(() => parseHry('123\n')).toThrow(JmaParseError);
  });

  it('rejects a line with a wrong station code', () => {
    const line = toLines(read('hry199910TJ.txt'))[0];
    const broken = `${line.slice(0, 78)}XX${line.slice(80)}`;
    expect(() => parseHry(`${broken}\n`)).toThrow(/station code/);
  });

  it('rejects an unreadable numeric field instead of calling it missing', () => {
    expect(() => parseIntField('4x1', { where: 'test' })).toThrow(JmaParseError);
    expect(parseIntField('   ', { where: 'test' })).toBeNull();
    expect(parseIntField(' -10', { where: 'test' })).toBe(-10);
  });
});

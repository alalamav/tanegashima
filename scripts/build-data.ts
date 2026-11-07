/**
 * raw JMA + curated events  ->  public/data/{series,events,build-meta}.json
 *
 * Deterministic: same inputs, byte-identical outputs (apart from the build
 * timestamp recorded in build-meta.json). Run once, commit the output.
 *
 *   npm run build:data
 *
 * Steps, in order:
 *   1  parse the eight raw files by fixed columns, asserting line lengths and
 *      day counts
 *   2  timestamp every value: UTC = JST - 9 h
 *   3  join observed and anomaly on timestamp; astro = obs - dep,
 *      elev = obs + datum
 *   4  fill gaps: astro from the harmonic fit, dep by linear interpolation,
 *      obs = astro + dep; every filled hour is flagged
 *   5  harmonic fit (mean + M2 S2 N2 K1 O1 Q1) over all observed astro, for
 *      gap filling only; report the residual RMS
 *   6  moon phase per hour, unwrapped to a monotonic angle
 *   7  events to UTC instants and fractional hour indices, with the series
 *      interpolated at each one
 *   8  write the three JSON files, including every provenance check
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dailyRange,
  countMissing,
  parseDep,
  parseHry,
  type DepDay,
  type HryDay,
} from '../src/data/parseJma.js';
import {
  DEFAULT_CONSTITUENTS,
  fitHarmonic,
  interpolateGapsLinear,
  type HarmonicSample,
} from '../src/data/harmonic.js';
import {
  findPhaseEvents,
  illuminatedFraction,
  phaseDegrees,
  unwrapAgainst,
  unwrapDegrees,
} from '../src/data/moon.js';
import {
  HOUR_MS,
  sampleCubic,
  sampleLinear,
  type BuildMeta,
  type EventPrecision,
  type Series,
  type TideExtremum,
  type VolcanoEvent,
} from '../src/data/series.js';
import type { Manifest } from './fetch-jma.js';

export const SCRIPT_VERSION = '1.0.0';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const rawDir = resolve(root, 'data/raw/jma');
const outDir = resolve(root, 'public/data');

const MONTHS = ['09', '10', '11', '12'] as const;
/** Expected day counts for Sep, Oct, Nov, Dec 1999. */
const EXPECTED_DAYS: Record<string, number> = { '09': 30, '10': 31, '11': 30, '12': 31 };

const JST_OFFSET_HOURS = 9;

/** The window the site opens on. */
const DEFAULT_WINDOW = { startUtc: '1999-09-26T00:00:00.000Z', endUtc: '1999-12-31T23:00:00.000Z' };

const STATION = {
  code: 'TJ',
  nameEs: 'Tanegashima',
  nameEn: 'Tanegashima',
  nameJa: '種子島',
  // JMA's Tanegashima (Nishinoomote) tide station.
  latitude: 30.4654,
  longitude: 130.9655,
  timezone: 'Asia/Tokyo',
};

/** JST calendar hour -> UTC instant. UTC = JST - 9 h. */
function jstToUtc(dateJst: string, hourJst: number): Date {
  const [year, month, day] = dateJst.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hourJst - JST_OFFSET_HOURS, 0, 0, 0));
}

const checks: BuildMeta['checks'] = [];
function check(name: string, expected: unknown, actual: unknown): void {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  const pass = e === a;
  checks.push({ name, expected: e, actual: a, pass });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : `\n       expected ${e}\n       actual   ${a}`}`);
}

interface ParsedCsvRow {
  [column: string]: string;
}

/** Minimal RFC4180 CSV reader: quoted fields, doubled quotes, no embedded newlines. */
export function parseCsv(text: string): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(cell);
        cell = '';
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  };
  const header = splitRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: ParsedCsvRow = {};
    header.forEach((name, index) => {
      row[name] = (cells[index] ?? '').trim();
    });
    return row;
  });
}

async function main(): Promise<void> {
  console.log('two clocks — data build');
  const manifest = JSON.parse(
    await readFile(resolve(root, 'data/raw/MANIFEST.json'), 'utf8'),
  ) as Manifest;

  // ---------------------------------------------------------------- step 1
  console.log('\n1  parse by fixed columns');
  const hryByMonth = new Map<string, HryDay[]>();
  const depByMonth = new Map<string, DepDay[]>();
  for (const month of MONTHS) {
    const hryText = await readFile(resolve(rawDir, `hry1999${month}TJ.txt`), 'utf8');
    const depText = await readFile(resolve(rawDir, `dep1999${month}TJ.txt`), 'utf8');
    hryByMonth.set(month, parseHry(hryText, `hry1999${month}TJ.txt`));
    depByMonth.set(month, parseDep(depText, `dep1999${month}TJ.txt`));
  }

  const hryLines: Record<string, number> = {};
  const depLines: Record<string, number> = {};
  const missingHourly: Record<string, number> = {};
  for (const month of MONTHS) {
    const hry = hryByMonth.get(month)!;
    const dep = depByMonth.get(month)!;
    hryLines[`1999-${month}`] = hry.length;
    depLines[`1999-${month}`] = dep.length;
    missingHourly[`1999-${month}`] = countMissing(hry);
    if (hry.length !== EXPECTED_DAYS[month]) {
      throw new Error(`1999-${month}: expected ${EXPECTED_DAYS[month]} hry lines, got ${hry.length}`);
    }
    if (dep.length !== EXPECTED_DAYS[month]) {
      throw new Error(`1999-${month}: expected ${EXPECTED_DAYS[month]} dep lines, got ${dep.length}`);
    }
  }
  check('day counts Sep–Dec', [30, 31, 30, 31], MONTHS.map((m) => hryByMonth.get(m)!.length));
  check('missing hourly values Sep–Dec', [28, 13, 0, 0], MONTHS.map((m) => missingHourly[`1999-${m}`]));

  // ---------------------------------------------------------------- step 2
  console.log('\n2  timestamp every value (UTC = JST − 9 h)');
  const obsByUtc = new Map<number, number | null>();
  const depByUtc = new Map<number, number | null>();
  const extremes: TideExtremum[] = [];

  for (const month of MONTHS) {
    for (const day of hryByMonth.get(month)!) {
      day.hourly.forEach((value, hour) => {
        obsByUtc.set(jstToUtc(day.dateJst, hour).getTime(), value);
      });
      for (const kind of ['high', 'low'] as const) {
        for (const extremum of kind === 'high' ? day.highs : day.lows) {
          const base = jstToUtc(day.dateJst, extremum.hour);
          extremes.push({
            utc: new Date(base.getTime() + extremum.minute * 60_000).toISOString(),
            cm: extremum.cm,
            kind,
          });
        }
      }
    }
    for (const day of depByMonth.get(month)!) {
      day.hourly.forEach((value, hour) => {
        depByUtc.set(jstToUtc(day.dateJst, hour).getTime(), value);
      });
    }
  }
  extremes.sort((a, b) => a.utc.localeCompare(b.utc));

  // ---------------------------------------------------------------- step 3
  console.log('\n3  join observed and anomaly; derive astro and elev');
  const startMs = jstToUtc('1999-09-01', 0).getTime();
  const endMs = jstToUtc('1999-12-31', 23).getTime();
  const hours = Math.round((endMs - startMs) / HOUR_MS) + 1;

  const timestamps: string[] = [];
  const rawObs: Array<number | null> = [];
  const rawDep: Array<number | null> = [];
  const rawAstro: Array<number | null> = [];

  for (let index = 0; index < hours; index += 1) {
    const ms = startMs + index * HOUR_MS;
    timestamps.push(new Date(ms).toISOString());
    const obs = obsByUtc.get(ms);
    const anomaly = depByUtc.get(ms);
    if (obs === undefined || anomaly === undefined) {
      throw new Error(`no record for ${new Date(ms).toISOString()} — the join is incomplete`);
    }
    rawObs.push(obs);
    rawDep.push(anomaly);
    rawAstro.push(obs === null || anomaly === null ? null : obs - anomaly);
  }
  console.log(`  ${hours} hourly slots, ${rawObs.filter((v) => v === null).length} without an observation`);

  // ---------------------------------------------------------------- step 5
  // (the fit is computed before step 4 because step 4 consumes it)
  console.log('\n5  harmonic fit over observed astro, for gap filling only');
  const fitSamples: HarmonicSample[] = [];
  rawAstro.forEach((value, hour) => {
    if (value !== null) fitSamples.push({ hour, value });
  });
  const fit = fitHarmonic(fitSamples, DEFAULT_CONSTITUENTS);
  console.log(`  mean ${fit.mean.toFixed(2)} cm over ${fit.sampleCount} samples`);
  for (const constituent of fit.constituents) {
    console.log(
      `  ${constituent.name.padEnd(3)} amplitude ${constituent.amplitude.toFixed(2).padStart(7)} cm` +
        `  phase ${constituent.phaseDeg.toFixed(1).padStart(6)}°`,
    );
  }
  console.log(`  residual RMS ${fit.residualRms.toFixed(2)} cm, R² ${fit.rSquared.toFixed(4)}`);

  // ---------------------------------------------------------------- step 4
  console.log('\n4  fill gaps');
  const filled = rawObs.map((value) => (value === null ? 1 : 0));
  const depFilled = interpolateGapsLinear(rawDep);
  const astro = rawAstro.map((value, hour) => (value === null ? fit.evaluate(hour) : value));
  const obs = rawObs.map((value, hour) =>
    value === null ? astro[hour] + depFilled[hour] : value,
  );

  const gaps: BuildMeta['gaps'] = [];
  for (let index = 0; index < hours; index += 1) {
    if (filled[index] !== 1) continue;
    const start = index;
    while (index + 1 < hours && filled[index + 1] === 1) index += 1;
    gaps.push({
      startUtc: timestamps[start],
      endUtc: timestamps[index],
      hours: index - start + 1,
      method: 'astro from harmonic fit (M2 S2 N2 K1 O1 Q1); dep linearly interpolated; obs = astro + dep',
    });
  }
  for (const gap of gaps) console.log(`  ${gap.hours} h  ${gap.startUtc} → ${gap.endUtc}`);

  const datumCm = manifest.datum.cm;
  const datumVerified = manifest.datum.assumedMonths.length === 0;
  const elev = obs.map((value) => value + datumCm);

  // ---------------------------------------------------------------- step 6
  console.log('\n6  moon phase per hour, unwrapped');
  const wrappedPhase = timestamps.map((iso) => phaseDegrees(new Date(iso)));
  const phase = unwrapDegrees(wrappedPhase);
  const turns = (phase[phase.length - 1] - phase[0]) / 360;
  console.log(`  ${phase[0].toFixed(1)}° → ${phase[phase.length - 1].toFixed(1)}° (${turns.toFixed(2)} synodic months)`);

  const moonPhases = findPhaseEvents(new Date(startMs), new Date(endMs + HOUR_MS)).map((e) => ({
    phase: e.phase,
    utc: e.utc,
  }));
  console.log(`  ${moonPhases.length} quarter-phase instants in the window`);

  // --------------------------------------------------------- parser checks
  console.log('\n   parser checks against values read from JMA by hand');
  const oct = hryByMonth.get('10')!;
  const octDep = depByMonth.get('10')!;
  check(
    'hry 1999-10-07 hourly (JST)',
    [360, 383, 411, 436, 452, 455, 441, 413, 378, 344, 320, 313, 325, 351, 386, 421, 450, 464, 459, 439, 408, 375, 348, 335],
    oct[6].hourly,
  );
  check(
    'dep 1999-10-07 hourly (JST)',
    [10, 10, 9, 7, 6, 7, 7, 7, 8, 8, 9, 10, 12, 12, 11, 9, 8, 8, 6, 6, 7, 7, 8, 10],
    octDep[6].hourly,
  );
  check('1999-10-06 07 h JST obs/dep', [379, 3], [oct[5].hourly[7], octDep[5].hourly[7]]);
  const dec = hryByMonth.get('12')!;
  const decDep = depByMonth.get('12')!;
  check('1999-12-11 07 h JST obs/dep', [413, -10], [dec[10].hourly[7], decDep[10].hourly[7]]);
  check('hry199910TJ.txt line 1 — 0 h value', 410, oct[0].hourly[0]);
  check('hry199910TJ.txt line 1 — date', '1999-10-01', oct[0].dateJst);
  check('hry199910TJ.txt line 1 — first high', { hour: 10, minute: 28, cm: 437 }, oct[0].highs[0]);
  check('hry199910TJ.txt line 1 — first low', { hour: 4, minute: 5, cm: 313 }, oct[0].lows[0]);
  check('daily range 1999-09-26', 181, dailyRange(hryByMonth.get('09')![25]));
  check('daily range 1999-10-07', 151, dailyRange(oct[6]));

  const allDays = MONTHS.flatMap((m) => hryByMonth.get(m)!.map((d) => ({ date: d.dateJst, range: dailyRange(d) })))
    .filter((d): d is { date: string; range: number } => d.range !== null);
  const minDay = allDays.reduce((a, b) => (b.range < a.range ? b : a));
  const maxDay = allDays.reduce((a, b) => (b.range > a.range ? b : a));
  check('minimum daily range Sep–Dec', { date: '1999-09-19', range: 68 }, minDay);
  check('maximum daily range Sep–Dec', { date: '1999-12-24', range: 228 }, maxDay);

  console.log('\n   astronomy checks against PyEphem (±5 min)');
  const referencePhases: Array<[0 | 180, string]> = [
    [0, '1999-10-09T11:34:00Z'],
    [0, '1999-11-08T03:53:00Z'],
    [0, '1999-12-07T22:31:00Z'],
    [180, '1999-09-25T10:51:00Z'],
    [180, '1999-10-24T21:02:00Z'],
    [180, '1999-11-23T07:03:00Z'],
    [180, '1999-12-22T17:31:00Z'],
  ];
  for (const [phaseValue, reference] of referencePhases) {
    const nearest = moonPhases
      .filter((e) => e.phase === phaseValue)
      .map((e) => Math.abs(Date.parse(e.utc) - Date.parse(reference)) / 60_000)
      .sort((a, b) => a - b)[0];
    check(
      `${phaseValue === 0 ? 'new' : 'full'} moon ${reference} within 5 min`,
      true,
      nearest !== undefined && nearest <= 5,
    );
  }

  // ---------------------------------------------------------------- step 7
  console.log('\n7  events to hour indices');
  const csv = parseCsv(await readFile(resolve(root, 'data/raw/events.csv'), 'utf8'));
  const events: VolcanoEvent[] = csv.map((row) => {
    const precision = row.precision as EventPrecision;
    const isDay = precision === 'day';
    const instant = isDay ? new Date(`${row.utc}T00:00:00Z`) : new Date(row.utc);
    if (Number.isNaN(instant.getTime())) throw new Error(`event ${row.id}: unreadable utc "${row.utc}"`);
    const hourIndex = (instant.getTime() - startMs) / HOUR_MS;
    const outsideWindow = hourIndex < 0 || hourIndex > hours - 1;
    const clamped = Math.min(Math.max(hourIndex, 0), hours - 1);
    const wrapped = phaseDegrees(instant);
    return {
      id: row.id,
      utc: instant.toISOString(),
      precision,
      labelEs: row.label_es,
      labelEn: row.label_en,
      plumeKm: row.plume_km === '' ? null : Number.parseFloat(row.plume_km),
      plumeRef: row.plume_ref,
      sourceUrl: row.source_url,
      notes: row.notes,
      hourIndex,
      durationHours: isDay ? 24 : 0,
      sampled: {
        elev: sampleCubic(elev, clamped),
        obs: sampleCubic(obs, clamped),
        astro: sampleCubic(astro, clamped),
        dep: sampleLinear(depFilled, clamped),
        phase: unwrapAgainst(sampleLinear(phase, clamped), wrapped),
        phaseWrapped: wrapped,
        illumination: illuminatedFraction(instant),
      },
      outsideWindow,
    };
  });
  for (const event of events) {
    console.log(
      `  ${event.id}  ${event.utc}  h=${event.hourIndex.toFixed(2)}` +
        `  phase ${event.sampled.phaseWrapped.toFixed(1)}°  elev ${event.sampled.elev.toFixed(1)} cm` +
        `  ${event.precision}${event.durationHours ? ' (24 h interval)' : ''}`,
    );
  }
  check('event count', 5, events.length);
  check('all events inside the built window', true, events.every((e) => !e.outsideWindow));

  // ---------------------------------------------------------------- step 8
  console.log('\n8  write public/data');
  await mkdir(outDir, { recursive: true });

  const round = (value: number, decimals: number): number => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };

  const series: Series = {
    station: STATION,
    window: {
      startUtc: timestamps[0],
      endUtc: timestamps[timestamps.length - 1],
      hours,
      datumCm,
      datumVerified,
    },
    defaultWindow: DEFAULT_WINDOW,
    arrays: {
      t: timestamps,
      obs: obs.map((v) => round(v, 2)),
      dep: depFilled.map((v) => round(v, 2)),
      astro: astro.map((v) => round(v, 2)),
      elev: elev.map((v) => round(v, 2)),
      phase: phase.map((v) => round(v, 4)),
      filled,
    },
    extremes,
    moonPhases,
  };

  const meta: BuildMeta = {
    scriptVersion: SCRIPT_VERSION,
    builtAtUtc: new Date().toISOString(),
    inputs: manifest.files.map((file) => ({
      path: file.path,
      url: file.url,
      retrievedUtc: file.retrievedUtc,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
    datumCm,
    datumSource: manifest.datum.source,
    datumVerified,
    harmonicFit: {
      constituents: fit.constituents.map((c) => ({
        name: c.name,
        amplitudeCm: round(c.amplitude, 3),
        phaseDeg: round(c.phaseDeg, 2),
        speedDegPerHour: c.speedDegPerHour,
      })),
      meanCm: round(fit.mean, 3),
      residualRmsCm: round(fit.residualRms, 3),
      rSquared: round(fit.rSquared, 5),
      sampleCount: fit.sampleCount,
      fitWindowUtc: [timestamps[0], timestamps[timestamps.length - 1]],
    },
    gaps,
    counts: { hryLines, depLines, missingHourly },
    checks,
  };

  await writeFile(resolve(outDir, 'series.json'), `${JSON.stringify(series)}\n`);
  await writeFile(resolve(outDir, 'events.json'), `${JSON.stringify(events, null, 2)}\n`);
  await writeFile(resolve(outDir, 'build-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const failures = checks.filter((c) => !c.pass);
  console.log(
    `\nwrote series.json (${hours} hours), events.json (${events.length} events), build-meta.json`,
  );
  console.log(`${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length > 0) {
    console.error('\nFAILED CHECKS:');
    for (const failure of failures) console.error(`  ${failure.name}: expected ${failure.expected}, got ${failure.actual}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

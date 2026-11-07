/** Apply each check's one-click fix and report whether it cleared the check. */
import { readFileSync } from 'node:fs';
import { buildWall } from '../../src/geom/wall.js';
import { DEFAULT_PARAMS, SHORT_WINDOW_PRESET, type Params } from '../../src/geom/params.js';
import { runChecks } from '../../src/geom/validate.js';
import type { Series, VolcanoEvent } from '../../src/data/series.js';

const series = JSON.parse(readFileSync('public/data/series.json', 'utf8')) as Series;
const events = JSON.parse(readFileSync('public/data/events.json', 'utf8')) as VolcanoEvent[];
const checksOf = (params: Params) => runChecks(buildWall(series, events, params), params).checks;

const cases: Array<[string, Partial<Params>]> = [
  ['defaults (synodic)', {}],
  ['springNeap', { clockMode: 'springNeap' }],
  ['linear 12 turns', { clockMode: 'linear', linearTurns: 12 }],
  ['linear 0.5 turns', { clockMode: 'linear', linearTurns: 0.5 }],
  ['r1 = 400', { r1: 400 }],
  ['k = 1.0', { k: 1 }],
  ['r0 > r1', { r0: 140, r1: 30 }],
  ['short window', SHORT_WINDOW_PRESET],
  ['short window, tiny radii', { ...SHORT_WINDOW_PRESET, r0: 8, r1: 20 }],
];

for (const [name, patch] of cases) {
  const params: Params = { ...DEFAULT_PARAMS, ...patch };
  console.log(`\n== ${name}`);
  for (const check of checksOf(params)) {
    if (check.level === 'ok') continue;
    if (!check.fix) {
      console.log(`   [${check.level}] ${check.id}: no fix — ${check.adviceEn}`);
      continue;
    }
    const after = checksOf({ ...params, ...check.fix.patch });
    const now = after.find((c) => c.id === check.id)!.level;
    const broke = after.filter((c) => c.level === 'fail' && checksOf(params).find((b) => b.id === c.id)!.level !== 'fail');
    console.log(
      `   [${check.level}] ${check.id.padEnd(15)} apply "${check.fix.labelEn}" -> ${now}${broke.length ? `  (now failing: ${broke.map((c) => c.id).join(', ')})` : ''}`,
    );
    console.log(`        advice: ${check.adviceEn}`);
  }
}

/** Apply each check's one-click fix and report whether it cleared the check. */
import { readFileSync } from 'node:fs';
import { buildWall } from '../../src/geom/wall.js';
import { DEFAULT_PARAMS, SHORT_WINDOW_PRESET, type Params } from '../../src/geom/params.js';
import { runChecks } from '../../src/geom/validate.js';
import type { Series, VolcanoEvent } from '../../src/data/series.js';

const series = JSON.parse(readFileSync('public/data/series.json', 'utf8')) as Series;
const events = JSON.parse(readFileSync('public/data/events.json', 'utf8')) as VolcanoEvent[];
const checksOf = (params: Params) => runChecks(buildWall(series, events, params), params).checks;

const SPIRAL: Partial<Params> = { clockMode: 'synodic', r0: 30, r1: 140 };

const cases: Array<[string, Partial<Params>]> = [
  ['circle defaults', {}],
  ['circle, tiny ring', { r0: 20 }],
  ['circle, past the kiln', { r0: 200 }],
  ['spiral defaults', SPIRAL],
  ['springNeap', { ...SPIRAL, clockMode: 'springNeap' }],
  ['springNeap at ring radii', { clockMode: 'springNeap', r0: 160, r1: 260 }],
  ['linear 12 turns', { ...SPIRAL, clockMode: 'linear', linearTurns: 12 }],
  ['linear 12 at ring radii', { clockMode: 'linear', linearTurns: 12, r0: 160, r1: 260 }],
  ['linear 0.5 turns', { ...SPIRAL, clockMode: 'linear', linearTurns: 0.5 }],
  ['r1 = 400', { ...SPIRAL, r1: 400 }],
  ['k = 1.0', { ...SPIRAL, k: 1 }],
  ['r0 > r1', { ...SPIRAL, r0: 140, r1: 30 }],
  ['short window', { ...SPIRAL, ...SHORT_WINDOW_PRESET, r0: 40, r1: 110 }],
  ['short window, tiny radii', { ...SPIRAL, ...SHORT_WINDOW_PRESET, r0: 8, r1: 20 }],
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

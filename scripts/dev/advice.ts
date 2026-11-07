/** Print the advice line for every failing check in a few configurations. */
import { readFileSync } from 'node:fs';
import { buildWall } from '../../src/geom/wall.js';
import { DEFAULT_PARAMS, SHORT_WINDOW_PRESET, type Params } from '../../src/geom/params.js';
import { runChecks } from '../../src/geom/validate.js';
import { turnGuidance } from '../../src/geom/advice.js';
import { measure } from '../../src/geom/validate.js';
import type { Series, VolcanoEvent } from '../../src/data/series.js';

const series = JSON.parse(readFileSync('public/data/series.json', 'utf8')) as Series;
const events = JSON.parse(readFileSync('public/data/events.json', 'utf8')) as VolcanoEvent[];

const cases: Array<[string, Partial<Params>]> = [
  ['defaults (synodic)', {}],
  ['springNeap', { clockMode: 'springNeap' }],
  ['linear 12 turns', { clockMode: 'linear', linearTurns: 12 }],
  ['linear 0.5 turns', { clockMode: 'linear', linearTurns: 0.5 }],
  ['r1 = 400', { r1: 400 }],
  ['k = 1.0', { k: 1 }],
  ['r0 > r1', { r0: 140, r1: 30 }],
  ['short window', SHORT_WINDOW_PRESET],
];

for (const [name, patch] of cases) {
  const params: Params = { ...DEFAULT_PARAMS, ...patch };
  const wall = buildWall(series, events, params);
  const m = measure(wall, params);
  const g = turnGuidance(params, m.turns, m.windowHours);
  const { checks } = runChecks(wall, params);
  console.log(`\n== ${name}`);
  console.log(
    `   turns ${g.turns.toFixed(2)} (user-set: ${g.turnsAreUserSet}) · acceptable ${g.minTurns.toFixed(2)}–${g.maxTurns.toFixed(2)}`,
  );
  for (const check of checks) {
    if (check.level === 'ok') continue;
    console.log(`   [${check.level}] ${check.labelEn} = ${check.value} (${check.limit})`);
    console.log(`         → ${check.adviceEn}`);
  }
}

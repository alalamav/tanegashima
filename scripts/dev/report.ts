/** Ad-hoc report of the measured geometry at a given parameter set. */
import { readFileSync } from 'node:fs';
import { buildWall, buildWallMesh } from '../../src/geom/wall.js';
import { DEFAULT_PARAMS, SHORT_WINDOW_PRESET, configHash } from '../../src/geom/params.js';
import { runChecks, measure, checkManifold } from '../../src/geom/validate.js';
import type { Series, VolcanoEvent } from '../../src/data/series.js';

const series = JSON.parse(readFileSync('public/data/series.json', 'utf8')) as Series;
const events = JSON.parse(readFileSync('public/data/events.json', 'utf8')) as VolcanoEvent[];

for (const [name, params] of [
  ['default', DEFAULT_PARAMS],
  ['short window', { ...DEFAULT_PARAMS, ...SHORT_WINDOW_PRESET }],
] as const) {
  const wall = buildWall(series, events, params);
  const m = measure(wall, params);
  const mesh = buildWallMesh(wall, params);
  console.log(`\n== ${name} (config ${configHash(params)})`);
  console.log(
    `  turns ${m.turns.toFixed(2)}  length ${(m.centerlineLengthMm / 1000).toFixed(3)} m  spacing ${m.turnSpacingMm.toFixed(1)} mm`,
  );
  console.log(
    `  fired OD ${m.firedOuterDiameterMm.toFixed(0)} mm  green OD ${m.greenOuterDiameterMm.toFixed(0)} mm  tide wavelength ${m.tideWavelengthMm.toFixed(1)} mm`,
  );
  console.log(
    `  height ${m.wallHeightMinMm.toFixed(1)}–${m.wallHeightMaxMm.toFixed(1)} mm  signal range ${wall.signal.range.toFixed(1)} cm  notches ${m.notchCount}  samples ${m.sampleCount}`,
  );
  console.log(
    `  mesh ${mesh.triangleCount} triangles  volume ${(mesh.volume / 1000).toFixed(1)} cm³  watertight ${checkManifold(mesh).watertight}`,
  );
  console.log(
    `  checks ${runChecks(wall, params).checks.map((c) => `${c.id}:${c.level}`).join(' ')}`,
  );
  for (const notch of wall.notches) {
    console.log(
      `    ${notch.eventId}  s=${notch.sStart.toFixed(1)}–${notch.sEnd.toFixed(1)} mm  depth ${notch.depth.toFixed(1)} mm  phase ${notch.event.sampled.phaseWrapped.toFixed(0)}°`,
    );
  }
}

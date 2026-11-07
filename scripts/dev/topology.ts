import { readFileSync } from 'node:fs';
import { buildWall, buildWallMesh } from '../../src/geom/wall.js';
import { DEFAULT_PARAMS, type Params } from '../../src/geom/params.js';
import { checkManifold } from '../../src/geom/validate.js';
import type { Series, VolcanoEvent } from '../../src/data/series.js';
const series = JSON.parse(readFileSync('public/data/series.json', 'utf8')) as Series;
const events = JSON.parse(readFileSync('public/data/events.json', 'utf8')) as VolcanoEvent[];
for (const [name, patch] of [
  ['circle', {}],
  ['synodic', { clockMode: 'synodic' as const, r0: 30, r1: 140 }],
  ['springNeap', { clockMode: 'springNeap' as const, r0: 30, r1: 140 }],
  ['linear 2', { clockMode: 'linear' as const, linearTurns: 2, r0: 30, r1: 140 }],
] as const) {
  const params: Params = { ...DEFAULT_PARAMS, ...patch };
  const wall = buildWall(series, events, params);
  const mesh = buildWallMesh(wall, params);
  const r = checkManifold(mesh);
  console.log(
    `${name.padEnd(12)} closed=${wall.spiral.closed ? 'y' : 'n'} watertight=${r.watertight ? 'y' : 'N'} chi=${r.eulerCharacteristic} V=${r.vertexCount} F=${r.triangleCount} boundary=${r.boundaryEdges} nonmanifold=${r.nonManifoldEdges} vol=${(r.volumeMm3 / 1000).toFixed(1)}cm3`,
  );
}

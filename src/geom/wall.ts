/**
 * The wall: height from the tide, solid from the centerline, notches from the
 * eruptions.
 *
 *   h(t) = h_base + k * ( s(t) - s_min )
 *
 * where s(t) is the chosen signal (sea elevation by default) and s_min is its
 * minimum over the window, so the lowest water in the window sits at h_base and
 * every height above that is the tide. k is in mm per cm, so the default
 * k = 0.25 turns the ~228 cm range of this record into ~57 mm of wall.
 *
 * The solid is the centerline offset by +/- t_wall/2 along its plan normal,
 * closed by an outer face, an inner face, a top that follows h, a flat bottom,
 * and two end caps.
 *
 * Coordinates: geometry is computed in plan (x, y) in mm with height h upward,
 * and mapped to three.js's Y-up space as (x, h, -y) — a rotation, so handedness
 * and therefore face winding are preserved.
 */

import {
  sampleCubic,
  signalStats,
  signalValues,
  type Series,
  type VolcanoEvent,
} from '../data/series.js';
import { makeClock, type Clock } from './clock.js';
import {
  computeNotches,
  depthAt,
  notchEdgeArcPositions,
  MIN_NOTCH_FLOOR_MM,
  type Notch,
} from './notches.js';
import type { Params } from './params.js';
import { buildSpiral, type Spiral, type SpiralSample } from './spiral.js';

export interface Wall {
  clock: Clock;
  spiral: Spiral;
  notches: Notch[];
  /** Events that fall outside the current window. */
  droppedEvents: VolcanoEvent[];
  /** Top edge height per spiral sample, after notches, mm. */
  top: Float64Array;
  /** Top edge height per spiral sample, before notches, mm. */
  undisturbed: Float64Array;
  /** Depth removed per sample, mm. */
  cut: Float64Array;
  /** Signal statistics over the window, in signal units (cm). */
  signal: { min: number; max: number; mean: number; range: number };
  heightRange: { min: number; max: number };
  /** Notches whose depth had to be clamped to keep a floor under the cut. */
  clampedNotches: string[];
}

/**
 * Moving average along ARC LENGTH, not along samples: the sample spacing is
 * uniform in mm, so a fixed-width window in mm is a fixed number of samples,
 * and the filter's cut-off wavelength is the same everywhere on the piece.
 * This is the optional "minimum feature wavelength" control.
 */
export function lowPassAlongArc(
  values: Float64Array,
  arcStepMm: number,
  wavelengthMm: number,
): Float64Array {
  if (wavelengthMm <= arcStepMm) return values;
  const half = Math.max(1, Math.round(wavelengthMm / 2 / arcStepMm));
  const out = new Float64Array(values.length);
  // Prefix sums keep this O(n) regardless of window width.
  const prefix = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i += 1) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < values.length; i += 1) {
    const a = Math.max(0, i - half);
    const b = Math.min(values.length - 1, i + half);
    out[i] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
  }
  return out;
}

export function buildWall(series: Series, events: VolcanoEvent[], params: Params): Wall {
  const clock = makeClock(series, params);
  const { i0, i1 } = clock.window;

  // Pass 1: a provisional centerline, used only to find where the notches fall.
  const provisional = buildSpiral(clock, params);
  const first = computeNotches(provisional, events, params, { i0, i1 });

  // Pass 2: the real centerline, with exact samples at every notch edge.
  const spiral = buildSpiral(clock, params, notchEdgeArcPositions(first.notches));
  const { notches, dropped } = computeNotches(spiral, events, params, { i0, i1 });

  // Height from the signal.
  const values = signalValues(series, params.signal);
  const windowValues = values.slice(i0, i1 + 1);
  const stats = signalStats(windowValues);

  const raw = new Float64Array(spiral.samples.length);
  for (let i = 0; i < spiral.samples.length; i += 1) {
    const value = sampleCubic(values, spiral.samples[i].hourIndex);
    raw[i] = params.hBase + params.k * (value - stats.min);
  }
  const undisturbed = lowPassAlongArc(raw, params.arcStepMm, params.smoothingMm);

  // Notches.
  const top = new Float64Array(spiral.samples.length);
  const cut = new Float64Array(spiral.samples.length);
  const clamped = new Set<string>();
  for (let i = 0; i < spiral.samples.length; i += 1) {
    const depth = depthAt(spiral.samples[i].s, notches);
    let floor = undisturbed[i] - depth;
    if (depth > 0 && floor < MIN_NOTCH_FLOOR_MM) {
      floor = MIN_NOTCH_FLOOR_MM;
      for (const notch of notches) {
        if (spiral.samples[i].s >= notch.sStart && spiral.samples[i].s <= notch.sEnd) {
          clamped.add(notch.eventId);
        }
      }
    }
    top[i] = floor;
    cut[i] = undisturbed[i] - floor;
  }

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (const value of top) {
    if (value < minHeight) minHeight = value;
    if (value > maxHeight) maxHeight = value;
  }

  return {
    clock,
    spiral,
    notches,
    droppedEvents: dropped,
    top,
    undisturbed,
    cut,
    signal: stats,
    heightRange: { min: minHeight, max: maxHeight },
    clampedNotches: [...clamped],
  };
}

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  /** Signed volume in mm^3; positive means outward-facing winding. */
  volume: number;
  triangleCount: number;
}

/** Plan + height -> three.js Y-up. A rotation, so winding is preserved. */
export function toThree(x: number, y: number, h: number): [number, number, number] {
  return [x, h, -y];
}

function signedVolume(positions: Float32Array, indices: Uint32Array): number {
  let total = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    total +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return total;
}

/**
 * Build the closed solid.
 *
 * Four vertices per station — outer bottom, outer top, inner bottom, inner top —
 * shared between neighbouring quads, so every interior edge belongs to exactly
 * two triangles by construction. `validate.ts` checks that property rather than
 * trusting it.
 */
export function buildWallMesh(wall: Wall, params: Params, scale = 1): MeshData {
  const samples: SpiralSample[] = wall.spiral.samples;
  const n = samples.length;
  const half = (params.wallThickness / 2) * scale;

  const positions = new Float32Array(n * 4 * 3);
  const write = (vertex: number, x: number, y: number, h: number): void => {
    const [vx, vy, vz] = toThree(x, y, h);
    positions[vertex * 3] = vx;
    positions[vertex * 3 + 1] = vy;
    positions[vertex * 3 + 2] = vz;
  };

  for (let i = 0; i < n; i += 1) {
    const sample = samples[i];
    const height = wall.top[i] * scale;
    // The offset is applied in already-scaled plan coordinates.
    const ox = sample.x * scale + sample.nx * half;
    const oy = sample.y * scale + sample.ny * half;
    const ix = sample.x * scale - sample.nx * half;
    const iy = sample.y * scale - sample.ny * half;
    const base = i * 4;
    write(base + 0, ox, oy, 0);
    write(base + 1, ox, oy, height);
    write(base + 2, ix, iy, 0);
    write(base + 3, ix, iy, height);
  }

  const indices: number[] = [];
  const OB = 0, OT = 1, IB = 2, IT = 3;
  const v = (station: number, corner: number) => station * 4 + corner;

  for (let i = 0; i < n - 1; i += 1) {
    const j = i + 1;
    // outer face
    indices.push(v(i, OB), v(j, OB), v(j, OT), v(i, OB), v(j, OT), v(i, OT));
    // inner face (opposite winding, it faces the other way)
    indices.push(v(j, IB), v(i, IB), v(i, IT), v(j, IB), v(i, IT), v(j, IT));
    // top, following h
    indices.push(v(i, OT), v(j, OT), v(j, IT), v(i, OT), v(j, IT), v(i, IT));
    // flat bottom
    indices.push(v(i, IB), v(j, IB), v(j, OB), v(i, IB), v(j, OB), v(i, OB));
  }

  // End caps.
  indices.push(v(0, OB), v(0, OT), v(0, IT), v(0, OB), v(0, IT), v(0, IB));
  const last = n - 1;
  indices.push(v(last, IB), v(last, IT), v(last, OT), v(last, IB), v(last, OT), v(last, OB));

  let indexArray = new Uint32Array(indices);
  let volume = signedVolume(positions, indexArray);

  // One global flip if the winding came out inward; cheaper and safer than
  // reasoning about the sign of every face by hand.
  if (volume < 0) {
    const flipped = new Uint32Array(indexArray.length);
    for (let i = 0; i < indexArray.length; i += 3) {
      flipped[i] = indexArray[i];
      flipped[i + 1] = indexArray[i + 2];
      flipped[i + 2] = indexArray[i + 1];
    }
    indexArray = flipped;
    volume = -volume;
  }

  return { positions, indices: indexArray, volume, triangleCount: indexArray.length / 3 };
}

/** Optional base disc, as its own closed solid so the wall stays watertight. */
export function buildBaseDisc(
  params: Params,
  thicknessMm = 6,
  segments = 256,
  scale = 1,
): MeshData {
  const radius = (params.r1 + params.wallThickness) * scale;
  const thickness = thicknessMm * scale;
  const positions = new Float32Array((segments * 2 + 2) * 3);
  const rim = (index: number, top: boolean) => (top ? index * 2 + 1 : index * 2);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const [bx, by, bz] = toThree(x, y, -thickness);
    positions[rim(i, false) * 3] = bx;
    positions[rim(i, false) * 3 + 1] = by;
    positions[rim(i, false) * 3 + 2] = bz;
    const [tx, ty, tz] = toThree(x, y, 0);
    positions[rim(i, true) * 3] = tx;
    positions[rim(i, true) * 3 + 1] = ty;
    positions[rim(i, true) * 3 + 2] = tz;
  }
  const centreBottom = segments * 2;
  const centreTop = segments * 2 + 1;
  const [cbx, cby, cbz] = toThree(0, 0, -thickness);
  positions[centreBottom * 3] = cbx;
  positions[centreBottom * 3 + 1] = cby;
  positions[centreBottom * 3 + 2] = cbz;
  const [ctx, cty, ctz] = toThree(0, 0, 0);
  positions[centreTop * 3] = ctx;
  positions[centreTop * 3 + 1] = cty;
  positions[centreTop * 3 + 2] = ctz;

  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    indices.push(rim(i, false), rim(j, false), rim(j, true));
    indices.push(rim(i, false), rim(j, true), rim(i, true));
    indices.push(centreTop, rim(i, true), rim(j, true));
    indices.push(centreBottom, rim(j, false), rim(i, false));
  }

  let indexArray = new Uint32Array(indices);
  let volume = signedVolume(positions, indexArray);
  if (volume < 0) {
    const flipped = new Uint32Array(indexArray.length);
    for (let i = 0; i < indexArray.length; i += 3) {
      flipped[i] = indexArray[i];
      flipped[i + 1] = indexArray[i + 2];
      flipped[i + 2] = indexArray[i + 1];
    }
    indexArray = flipped;
    volume = -volume;
  }
  return { positions, indices: indexArray, volume, triangleCount: indexArray.length / 3 };
}

export interface SurfaceData {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * An open surface covering the floor and the two sides of every notch, lifted
 * a hair clear of the wall. This is the only red geometry in the scene: it is
 * drawn with an emissive material so the cuts read as eruptions rather than as
 * shadows, and it is the only thing the bloom pass touches.
 */
export function buildNotchOverlay(
  wall: Wall,
  params: Params,
  scale = 1,
  liftMm = 0.1,
): SurfaceData {
  const samples = wall.spiral.samples;
  const half = (params.wallThickness / 2) * scale;
  const lift = liftMm * scale;
  const positions: number[] = [];
  const indices: number[] = [];

  const push = (x: number, y: number, h: number): number => {
    const [vx, vy, vz] = toThree(x, y, h);
    positions.push(vx, vy, vz);
    return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number): void => {
    indices.push(a, b, c, a, c, d);
    // Both faces, so the inside of a cut is visible from any angle.
    indices.push(a, c, b, a, d, c);
  };

  for (const notch of wall.notches) {
    const inside: number[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      if (samples[i].s >= notch.sStart && samples[i].s <= notch.sEnd) inside.push(i);
    }
    if (inside.length < 2) continue;

    // Floor strip.
    for (let k = 0; k < inside.length - 1; k += 1) {
      const i = inside[k];
      const j = inside[k + 1];
      const hi = wall.top[i] * scale + lift;
      const hj = wall.top[j] * scale + lift;
      const si = samples[i];
      const sj = samples[j];
      const a = push(si.x * scale + si.nx * half, si.y * scale + si.ny * half, hi);
      const b = push(sj.x * scale + sj.nx * half, sj.y * scale + sj.ny * half, hj);
      const c = push(sj.x * scale - sj.nx * half, sj.y * scale - sj.ny * half, hj);
      const d = push(si.x * scale - si.nx * half, si.y * scale - si.ny * half, hi);
      quad(a, b, c, d);
    }

    // The two sides of the cut.
    for (const [edge, direction] of [
      [inside[0], 1],
      [inside[inside.length - 1], -1],
    ] as const) {
      const sample = samples[edge];
      const floor = wall.top[edge] * scale;
      const crest = wall.undisturbed[edge] * scale;
      if (crest - floor < 1e-6) continue;
      const ox = sample.x * scale + sample.nx * half + sample.tx * direction * lift;
      const oy = sample.y * scale + sample.ny * half + sample.ty * direction * lift;
      const ix = sample.x * scale - sample.nx * half + sample.tx * direction * lift;
      const iy = sample.y * scale - sample.ny * half + sample.ty * direction * lift;
      const a = push(ox, oy, floor);
      const b = push(ix, iy, floor);
      const c = push(ix, iy, crest);
      const d = push(ox, oy, crest);
      quad(a, b, c, d);
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

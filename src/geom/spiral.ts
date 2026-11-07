/**
 * The spiral centerline in plan, in mm.
 *
 * Radius grows linearly with the angle, so consecutive turns are evenly spaced
 * no matter how uneven the angle is in time:
 *
 *   r(theta) = r0 + (r1 - r0) * (theta - theta_start) / (theta_end - theta_start)
 *   P(theta) = ( r cos(theta + theta_ref), r sin(theta + theta_ref) )
 *
 * The hourly points are then threaded on a centripetal Catmull-Rom spline and
 * RESAMPLED BY ARC LENGTH at a fixed step. Arc-length resampling matters for two
 * reasons: the inner turns cover far less distance per hour than the outer ones,
 * so an hourly mesh would be dense at the middle and coarse at the rim; and a
 * notch has to be a fixed width in mm, which is only meaningful against arc
 * length.
 */

import type { Clock } from './clock.js';
import type { Params } from './params.js';

export interface PlanPoint {
  x: number;
  y: number;
}

/** One resampled station along the centerline. */
export interface SpiralSample {
  /** Arc length from the start of the centerline, mm. */
  s: number;
  /** Plan position, mm. */
  x: number;
  y: number;
  /** Unit normal in plan, pointing outward (away from the origin side). */
  nx: number;
  ny: number;
  /** Unit tangent in plan. */
  tx: number;
  ty: number;
  /** Fractional hour index into the series. */
  hourIndex: number;
  /** Unwrapped angle at this station, radians (without theta_ref). */
  theta: number;
  /** Radius at this station, mm. */
  r: number;
}

export interface Spiral {
  samples: SpiralSample[];
  /**
   * True when the last sample joins back to the first. A closed centerline has
   * no ends: the mesh wraps instead of being capped, and arc length is modular.
   */
  closed: boolean;
  /** Total centerline length, mm. */
  length: number;
  /** Radial distance between consecutive turns, mm. */
  turnSpacing: number;
  /** Turns across the window. */
  turns: number;
  /** Arc length at a given fractional hour index, mm. */
  arcLengthAtHour(hourIndex: number): number;
  /** Interpolated sample at a given arc length. */
  sampleAtArcLength(s: number): SpiralSample;
}

/**
 * r(theta), linear in the unwrapped angle — except in circle mode, where the
 * radius is constant at r0 and the wall closes on itself.
 */
export function radiusAt(theta: number, clock: Clock, params: Params): number {
  if (clock.closed) return params.r0;
  const span = clock.thetaEnd - clock.thetaStart;
  if (span === 0) return params.r0;
  const u = (theta - clock.thetaStart) / span;
  return params.r0 + (params.r1 - params.r0) * u;
}

/** P(theta) in plan, mm. */
export function planPointAt(hourIndex: number, clock: Clock, params: Params): PlanPoint {
  const theta = clock.thetaAt(hourIndex);
  const r = radiusAt(theta, clock, params);
  const angle = theta + params.thetaRefDeg * (Math.PI / 180);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/**
 * Centripetal Catmull-Rom interpolation of four control points.
 * Centripetal parameterisation (alpha = 0.5) is used rather than uniform
 * because it cannot form cusps or self-intersections between samples, which
 * matters on the tight inner turns.
 */
function catmullRom(
  p0: PlanPoint,
  p1: PlanPoint,
  p2: PlanPoint,
  p3: PlanPoint,
  t: number,
): PlanPoint {
  const alpha = 0.5;
  const d = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.y - a.y) ** alpha;
  const t0 = 0;
  const t1 = t0 + Math.max(d(p0, p1), 1e-9);
  const t2 = t1 + Math.max(d(p1, p2), 1e-9);
  const t3 = t2 + Math.max(d(p2, p3), 1e-9);
  const tt = t1 + (t2 - t1) * t;

  const lerp = (a: PlanPoint, b: PlanPoint, ta: number, tb: number, u: number): PlanPoint => {
    const w = (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };

  const a1 = lerp(p0, p1, t0, t1, tt);
  const a2 = lerp(p1, p2, t1, t2, tt);
  const a3 = lerp(p2, p3, t2, t3, tt);
  const b1 = lerp(a1, a2, t0, t2, tt);
  const b2 = lerp(a2, a3, t1, t3, tt);
  return lerp(b1, b2, t1, t2, tt);
}

/**
 * Build the centerline.
 *
 * `extraArcPositions` are arc lengths that MUST appear as exact samples: notch
 * edges pass them in, so a cut starts and ends on a real vertex rather than
 * being rounded to the nearest 0.5 mm station.
 */
export function buildSpiral(
  clock: Clock,
  params: Params,
  extraArcPositions: number[] = [],
): Spiral {
  const { i0, i1 } = clock.window;

  // 1. Hourly control points.
  const control: PlanPoint[] = [];
  const controlHour: number[] = [];
  for (let hour = i0; hour <= i1; hour += 1) {
    control.push(planPointAt(hour, clock, params));
    controlHour.push(hour);
  }

  // 2. Dense walk of the spline, accumulating arc length. 8 substeps per hour is
  //    far finer than the 0.5 mm resampling step anywhere on the piece.
  const closed = clock.closed;
  const count = control.length;
  const SUBSTEPS = 8;
  const dense: Array<{ s: number; x: number; y: number; hourIndex: number }> = [];
  let accumulated = 0;
  let previous: PlanPoint | null = null;

  // A closed centerline has no ends, so the spline wraps instead of clamping.
  const at = (index: number) =>
    closed
      ? control[((index % count) + count) % count]
      : control[Math.min(Math.max(index, 0), count - 1)];

  // One more segment when closed: the last control point back to the first.
  const segments = closed ? count : count - 1;
  for (let segment = 0; segment < segments; segment += 1) {
    for (let step = 0; step < SUBSTEPS; step += 1) {
      const t = step / SUBSTEPS;
      const point = catmullRom(at(segment - 1), at(segment), at(segment + 1), at(segment + 2), t);
      if (previous) accumulated += Math.hypot(point.x - previous.x, point.y - previous.y);
      dense.push({
        s: accumulated,
        x: point.x,
        y: point.y,
        hourIndex: controlHour[0] + segment + t,
      });
      previous = point;
    }
  }
  // Close the walk: back onto the first point for a ring, onto the last control
  // point for a spiral. Either way the final entry carries the total length.
  const last = closed ? control[0] : control[count - 1];
  if (previous) accumulated += Math.hypot(last.x - previous.x, last.y - previous.y);
  dense.push({
    s: accumulated,
    x: last.x,
    y: last.y,
    hourIndex: closed ? controlHour[0] + count : controlHour[count - 1],
  });

  const length = accumulated;

  // 3. Target arc positions: the fixed grid, plus every requested extra.
  const positions: number[] = [];
  const step = Math.max(params.arcStepMm, 0.05);
  for (let s = 0; s < length; s += step) positions.push(s);
  // The point at s = length IS the point at s = 0 on a ring, so it is left out:
  // a duplicated vertex there would make the mesh non-manifold at the seam.
  if (!closed) positions.push(length);
  for (const s of extraArcPositions) {
    if (s > 0 && s < length) positions.push(s);
  }
  positions.sort((a, b) => a - b);

  // Drop near-duplicates, but keep pairs 0.01 mm apart: those are deliberate,
  // they are what makes a notch wall vertical.
  const MIN_SEPARATION = 1e-3;
  const unique: number[] = [];
  for (const s of positions) {
    if (unique.length === 0 || s - unique[unique.length - 1] > MIN_SEPARATION) unique.push(s);
  }

  // 4. Interpolate the dense walk at each target position.
  let cursor = 0;
  const interpolate = (s: number) => {
    while (cursor < dense.length - 2 && dense[cursor + 1].s < s) cursor += 1;
    while (cursor > 0 && dense[cursor].s > s) cursor -= 1;
    const a = dense[cursor];
    const b = dense[Math.min(cursor + 1, dense.length - 1)];
    const span = b.s - a.s;
    const w = span > 1e-12 ? (s - a.s) / span : 0;
    return {
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      hourIndex: a.hourIndex + (b.hourIndex - a.hourIndex) * w,
    };
  };

  const raw = unique.map((s) => ({ s, ...interpolate(s) }));

  // 5. Tangents by central difference, normals by rotating the tangent, then
  //    flipped where needed so every normal points away from the origin. A
  //    consistent outward normal is what keeps the offset walls from crossing
  //    over each other where the spiral curves hardest.
  const wrap = (index: number) => ((index % raw.length) + raw.length) % raw.length;
  const samples: SpiralSample[] = raw.map((point, index) => {
    const before = closed ? raw[wrap(index - 1)] : raw[Math.max(index - 1, 0)];
    const after = closed ? raw[wrap(index + 1)] : raw[Math.min(index + 1, raw.length - 1)];
    let tx = after.x - before.x;
    let ty = after.y - before.y;
    const normTangent = Math.hypot(tx, ty) || 1;
    tx /= normTangent;
    ty /= normTangent;

    let nx = ty;
    let ny = -tx;
    const radius = Math.hypot(point.x, point.y) || 1;
    if (nx * (point.x / radius) + ny * (point.y / radius) < 0) {
      nx = -nx;
      ny = -ny;
    }

    const theta = clock.thetaAt(point.hourIndex);
    return {
      s: point.s,
      x: point.x,
      y: point.y,
      nx,
      ny,
      tx,
      ty,
      hourIndex: point.hourIndex,
      theta,
      r: radius,
    };
  });

  const turns = clock.turns;
  // A ring has one turn and no neighbour to be spaced from.
  const turnSpacing = closed
    ? Number.POSITIVE_INFINITY
    : turns > 0
      ? (params.r1 - params.r0) / turns
      : Number.POSITIVE_INFINITY;

  // Arc length as a function of hour index, for placing events.
  const arcLengthAtHour = (hourIndex: number): number => {
    if (hourIndex <= dense[0].hourIndex) return 0;
    if (hourIndex >= dense[dense.length - 1].hourIndex) return length;
    let low = 0;
    let high = dense.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (dense[mid].hourIndex <= hourIndex) low = mid;
      else high = mid;
    }
    const a = dense[low];
    const b = dense[high];
    const span = b.hourIndex - a.hourIndex;
    const w = span > 1e-12 ? (hourIndex - a.hourIndex) / span : 0;
    return a.s + (b.s - a.s) * w;
  };

  const sampleAtArcLength = (s: number): SpiralSample => {
    // Arc length is modular on a ring: past the end is back at the start.
    const clamped = closed
      ? ((s % length) + length) % length
      : Math.min(Math.max(s, 0), length);
    let low = 0;
    let high = samples.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (samples[mid].s <= clamped) low = mid;
      else high = mid;
    }
    const a = samples[low];
    // Past the last sample of a ring the next one is the first, one step on.
    const wrapsHere = closed && clamped >= samples[samples.length - 1].s;
    const b = wrapsHere ? samples[0] : samples[high];
    const bS = wrapsHere ? length : b.s;
    const span = bS - a.s;
    const w = span > 1e-12 ? (clamped - a.s) / span : 0;
    const mix = (p: number, q: number) => p + (q - p) * w;
    return {
      s: clamped,
      x: mix(a.x, b.x),
      y: mix(a.y, b.y),
      nx: mix(a.nx, b.nx),
      ny: mix(a.ny, b.ny),
      tx: mix(a.tx, b.tx),
      ty: mix(a.ty, b.ty),
      hourIndex: mix(a.hourIndex, b.hourIndex),
      theta: mix(a.theta, b.theta),
      r: mix(a.r, b.r),
    };
  };

  return { samples, closed, length, turnSpacing, turns, arcLengthAtHour, sampleAtArcLength };
}

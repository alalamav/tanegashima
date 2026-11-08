/**
 * The wall: one scalar from the tide, laid on the path, notched by the
 * eruptions.
 *
 *   h(t) = h_base + k * ( s(t) - s_min )
 *
 * where s(t) is the chosen signal (sea elevation by default) and s_min is its
 * minimum over the window, so the lowest water in the window sits at h_base and
 * every height above that is the tide. k is in mm per cm, so the default
 * k = 0.25 turns the ~228 cm range of this record into ~57 mm of wall.
 *
 * h means one of two things, and this is the whole difference between the coiled
 * forms and the revolved one:
 *
 *   coiled    h is HEIGHT. The solid is the centerline offset by +/- t_wall/2
 *             along its plan normal, closed by an outer face, an inner face, a
 *             top that follows h, a flat bottom, and two end caps.
 *   revolved  h is RADIUS, measured out from r0, and the path is the axis. The
 *             solid is that profile swept round the axis: a vessel wall between
 *             R(z) and an inner surface eroded in from it. The tide therefore
 *             comes out of the circumference, every crest a full circle, the
 *             same on every side of the piece.
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
import { outerRadius, revolved } from './params.js';
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
  /** Topmost point of the piece above the ground, mm. */
  totalHeightMm: number;
  /**
   * Radius of the widest point of the piece, mm — what the kiln has to take
   * across. On the revolved form the tide is radial, so this is r0 plus the
   * tallest relief; on a coil it is the outer wall line.
   */
  outerRadiusMm: number;
  /** Shape of the revolved silhouette. Null on the coiled forms. */
  profile: ProfileMetrics | null;
  /**
   * Inner surface of the revolved wall, as an absolute radius per station, mm.
   * Null on the coiled forms, whose wall is offset in plan instead.
   */
  bore: Float64Array | null;
  /** Notches whose depth had to be clamped to keep a floor under the cut. */
  clampedNotches: string[];
}

/**
 * The shape of the revolved silhouette, measured on the HOURLY curve.
 *
 * The record is hourly, so anything finer than one hour is the interpolating
 * spline's own wobble rather than tide, and measuring these on the 0.5 mm
 * stations would report that wobble as a fabrication limit.
 *
 * The number that governs the form is the SLOPE, dR/dz. It is what a rib has to
 * follow, and it is also exactly what decides how thick the clay gets: the
 * inner surface is eroded in by a disc of the wall thickness t (see
 * `erodeBore`), and that erosion is bounded by
 *
 *     clay(z) <= t * sqrt( 1 + maxSlope^2 )
 *
 * so a 45 degree silhouette can force at most 1.41 t of clay, and a slope of
 * 2.83 can force 3 t. Both of the levers that move it — the pitch, which
 * stretches z, and k, which scales R — move it exactly inversely and exactly
 * proportionally, so the advice for this check needs no approximation at all.
 */
export interface ProfileMetrics {
  /** Steepest slope of the silhouette, mm of radius per mm of height. */
  maxSlope: number;
  /** Thickest section the form forces, mm. At least the wall thickness. */
  maxClayMm: number;
  /** Narrowest the bore gets, mm. */
  minBoreMm: number;
  /** Height the piece gains per hour, mm. */
  mmPerHour: number;
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
  let crest = 0;
  let totalHeight = 0;
  for (let i = 0; i < top.length; i += 1) {
    if (top[i] < minHeight) minHeight = top[i];
    if (top[i] > maxHeight) maxHeight = top[i];
    if (undisturbed[i] > crest) crest = undisturbed[i];
    const absolute = spiral.samples[i].z + undisturbed[i];
    if (absolute > totalHeight) totalHeight = absolute;
  }

  const isRevolved = revolved(params.clockMode);
  const bore = isRevolved ? erodeBore(spiral, top, params) : null;

  // The relief the record asks for at every whole hour, which is what the
  // profile metrics are measured on. It is deliberately not read back off the
  // stations: see `profileMetrics`.
  const hourlyRelief = new Float64Array(i1 - i0 + 1);
  for (let hour = i0; hour <= i1; hour += 1) {
    hourlyRelief[hour - i0] = params.hBase + params.k * (sampleCubic(values, hour) - stats.min);
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
    // The revolved form's path IS its height, so the piece is exactly as tall
    // as the profile is long; nothing stands on top of it.
    totalHeightMm: isRevolved ? spiral.length : totalHeight,
    outerRadiusMm: isRevolved
      ? params.r0 + crest
      : outerRadius(params) + params.wallThickness / 2,
    profile: isRevolved
      ? profileMetrics(spiral, hourlyRelief, undisturbed, bore!, params, clock.window)
      : null,
    bore,
    clampedNotches: [...clamped],
  };
}

/**
 * The inner surface of a revolved wall: the solid eroded by a disc of the wall
 * thickness.
 *
 * A constant-thickness offset is the wrong model and fails outright. Offsetting
 * R(z) inward by t folds through itself wherever the silhouette turns tighter
 * than t, which a tide on a vessel does constantly — and it is not what a
 * potter's hand does either. What a hand does is leave the clay THICKER at a
 * tight crest, and that is precisely a morphological erosion: keep the points
 * that a disc of radius t still fits inside.
 *
 *     R_in(z) = min over |dz| <= t of [ R(z + dz) - sqrt( t^2 - dz^2 ) ]
 *
 * The dz = 0 term is R(z) - t, so the wall is never THINNER than nominal; and
 * because the result is an erosion it can never self-intersect, whatever the
 * tide does. Beyond the two rims there is no material to constrain anything, so
 * the window is simply clipped there: a cut rim keeps its nominal thickness,
 * which is what a cut rim is.
 */
function erodeBore(spiral: Spiral, top: Float64Array, params: Params): Float64Array {
  const samples = spiral.samples;
  const n = samples.length;
  const thickness = params.wallThickness;
  const reach = Math.max(1, Math.ceil(thickness / Math.max(params.arcStepMm, 0.05)));
  const out = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    let smallest = Number.POSITIVE_INFINITY;
    const from = Math.max(0, i - reach);
    const to = Math.min(n - 1, i + reach);
    for (let j = from; j <= to; j += 1) {
      const dz = samples[j].z - samples[i].z;
      if (Math.abs(dz) > thickness) continue;
      const candidate = params.r0 + top[j] - Math.sqrt(thickness * thickness - dz * dz);
      if (candidate < smallest) smallest = candidate;
    }
    // The bore must not close through the axis, however the numbers are set.
    out[i] = Math.max(smallest, 0.05);
  }
  return out;
}

/**
 * Slope of the revolved silhouette on the hourly curve, plus how thick the
 * erosion left the clay.
 *
 * The slope is a three-point formula for UNEVEN spacing, because the piece
 * rises with the Moon's phase rather than with the clock, so one hour is not
 * quite the same height as the next:
 *
 *   R' = ( h0^2 R2 + (h1^2 - h0^2) R1 - h1^2 R0 ) / ( h0 h1 (h0 + h1) )
 *
 * It is taken on the UNDISTURBED profile: a notch is a cut with vertical walls,
 * so its slope is infinite by design and says nothing about the thrown form.
 * The clay and the bore, on the other hand, are read off the solid as built.
 */
function profileMetrics(
  spiral: Spiral,
  hourlyRelief: Float64Array,
  undisturbed: Float64Array,
  bore: Float64Array,
  params: Params,
  window: { i0: number; i1: number },
): ProfileMetrics {
  const hours = window.i1 - window.i0;
  const mmPerHour = spiral.length / Math.max(hours, 1);

  // The slope is read off the HOURLY relief, not off the mesh's own stations.
  // Reading it off the stations made it a measure of the sampling rather than
  // of the form: squash the piece down until one station spans several hours
  // and the interpolation flattens the tide away, so a badly squashed profile
  // would report a gentle slope and the advice solved from it would land
  // nowhere near the limit. The record is hourly; the form it asks for is the
  // same whatever the mesh does with it.
  const relief = lowPassAlongArc(hourlyRelief, mmPerHour, params.smoothingMm);
  let maxSlope = 0;
  for (let i = 1; i < relief.length - 1; i += 1) {
    const z0 = spiral.arcLengthAtHour(window.i0 + i - 1);
    const z1 = spiral.arcLengthAtHour(window.i0 + i);
    const z2 = spiral.arcLengthAtHour(window.i0 + i + 1);
    const h0 = z1 - z0;
    const h1 = z2 - z1;
    if (h0 <= 1e-12 || h1 <= 1e-12) continue;
    const denominator = h0 * h1 * (h0 + h1);
    const first =
      (h0 * h0 * relief[i + 1] + (h1 * h1 - h0 * h0) * relief[i] - h1 * h1 * relief[i - 1]) /
      denominator;
    if (Math.abs(first) > maxSlope) maxSlope = Math.abs(first);
  }

  // The clay is measured on the THROWN form — the undisturbed profile eroded on
  // its own — because that is what the slope governs and what the advice can
  // move. A notch is a cut, and a cut needs the wall to carry its depth however
  // gentle the form is; the notch check is where that belongs.
  const thrownBore = erodeBore(spiral, undisturbed, params);
  let maxClay = 0;
  let minBore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bore.length; i += 1) {
    const clay = params.r0 + undisturbed[i] - thrownBore[i];
    if (clay > maxClay) maxClay = clay;
    if (bore[i] < minBore) minBore = bore[i];
  }

  return {
    maxSlope,
    maxClayMm: maxClay,
    minBoreMm: minBore,
    mmPerHour,
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
 *
 * A spiral is capped at both ends. A ring has no ends: the last station joins
 * back to the first and the caps are left off, which is what makes it a closed
 * cylinder rather than a tube with two lids.
 *
 * The revolved form is a different solid altogether and has its own builder.
 */
export function buildWallMesh(wall: Wall, params: Params, scale = 1): MeshData {
  if (wall.clock.revolved) return buildRevolveMesh(wall, params, scale);

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
    // In cylinder mode the wall stands on a rising line rather than a flat
    // plane, so its foot and its top both carry the coil's own climb.
    const foot = sample.z * scale;
    const height = foot + wall.top[i] * scale;
    // The offset is applied in already-scaled plan coordinates.
    const ox = sample.x * scale + sample.nx * half;
    const oy = sample.y * scale + sample.ny * half;
    const ix = sample.x * scale - sample.nx * half;
    const iy = sample.y * scale - sample.ny * half;
    const base = i * 4;
    write(base + 0, ox, oy, foot);
    write(base + 1, ox, oy, height);
    write(base + 2, ix, iy, foot);
    write(base + 3, ix, iy, height);
  }

  const indices: number[] = [];
  const OB = 0, OT = 1, IB = 2, IT = 3;
  const v = (station: number, corner: number) => station * 4 + corner;

  const closed = wall.spiral.closed;
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i += 1) {
    const j = (i + 1) % n;
    // outer face
    indices.push(v(i, OB), v(j, OB), v(j, OT), v(i, OB), v(j, OT), v(i, OT));
    // inner face (opposite winding, it faces the other way)
    indices.push(v(j, IB), v(i, IB), v(i, IT), v(j, IB), v(i, IT), v(j, IT));
    // top, following h
    indices.push(v(i, OT), v(j, OT), v(j, IT), v(i, OT), v(j, IT), v(i, IT));
    // flat bottom
    indices.push(v(i, IB), v(j, IB), v(j, OB), v(i, IB), v(j, OB), v(i, OB));
  }

  // End caps, for a spiral only: a ring has nothing to cap.
  if (!closed) {
    indices.push(v(0, OB), v(0, OT), v(0, IT), v(0, OB), v(0, IT), v(0, IB));
    const last = n - 1;
    indices.push(v(last, IB), v(last, IT), v(last, OT), v(last, IB), v(last, OT), v(last, OB));
  }

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


/**
 * Segments around the axis, at full quality.
 *
 * 128 gives 2.8 degree facets: at a 200 mm radius the chord sags 0.06 mm away
 * from the true circle, which is a hundredth of the smallest feature any clay
 * body will hold, so the faceting is below the material's own resolution.
 */
export const REVOLVE_SEGMENTS = 128;

/**
 * Vertices the revolved mesh is allowed, over all its stations and segments.
 *
 * A revolved solid costs stations x segments x 2 vertices, and the stations
 * follow the piece's HEIGHT: at the whole 97-day record the profile is 4.6 m
 * tall, which at the default 0.5 mm step is nine thousand stations and, at full
 * segments, 2.4 million vertices. WebGL will not draw that — the draw call
 * fails outright and the piece vanishes from the scene — and nothing is gained
 * by trying, since a piece that tall has already failed its kiln check.
 */
const REVOLVE_VERTEX_BUDGET = 600_000;

/**
 * Segments to use for a profile with this many stations: full quality until
 * the budget bites, then as many as will fit, down to a floor coarse enough to
 * still read as round.
 */
export function revolveSegments(stationCount: number): number {
  const affordable = Math.floor(REVOLVE_VERTEX_BUDGET / Math.max(stationCount * 2, 1));
  return Math.max(16, Math.min(REVOLVE_SEGMENTS, affordable));
}

/**
 * Build the revolved solid: the silhouette swept round the axis.
 *
 * Two vertices per station per segment — one on the outer surface at
 * R = r0 + h, one on the eroded inner surface the wall knows. The sides
 * are a regular grid, so every interior edge belongs to exactly two triangles
 * by construction, and the two ends are closed by annular rims. That makes the
 * piece a sleeve: topologically a torus, chi = 0, the same as the closed ring.
 *
 * Faces are wound outward by hand here rather than left to the global flip,
 * because the flip reverses every triangle together and so cannot repair a
 * surface whose faces disagree with each other.
 */
function buildRevolveMesh(wall: Wall, params: Params, scale: number): MeshData {
  const samples = wall.spiral.samples;
  const n = samples.length;
  const segments = revolveSegments(n);
  const thickness = params.wallThickness * scale;
  const core = params.r0 * scale;

  const cos = new Float64Array(segments);
  const sin = new Float64Array(segments);
  for (let k = 0; k < segments; k += 1) {
    const angle = (k / segments) * Math.PI * 2;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }

  const positions = new Float32Array(n * segments * 2 * 3);
  /** Vertex index: station, segment, and which of the two surfaces. */
  const v = (station: number, segment: number, inner: boolean): number =>
    (station * segments + segment) * 2 + (inner ? 1 : 0);

  const bore = wall.bore;
  for (let i = 0; i < n; i += 1) {
    const height = samples[i].z * scale;
    const outer = core + wall.top[i] * scale;
    // The eroded bore, which cannot fold; the plain offset is only a fallback
    // for a wall built without one.
    const inner = bore ? bore[i] * scale : Math.max(outer - thickness, 0.01);
    for (let k = 0; k < segments; k += 1) {
      for (const [radius, isInner] of [
        [outer, false],
        [inner, true],
      ] as const) {
        const [vx, vy, vz] = toThree(radius * cos[k], radius * sin[k], height);
        const base = v(i, k, isInner) * 3;
        positions[base] = vx;
        positions[base + 1] = vy;
        positions[base + 2] = vz;
      }
    }
  }

  // Sides: 2 quads per cell. Rims: 1 quad per segment at each end.
  const indices = new Uint32Array(((n - 1) * segments * 2 + segments * 2) * 6);
  let cursor = 0;
  const triangle = (a: number, b: number, c: number): void => {
    indices[cursor] = a;
    indices[cursor + 1] = b;
    indices[cursor + 2] = c;
    cursor += 3;
  };

  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < segments; k += 1) {
      const j = (k + 1) % segments;
      // Outer surface, facing out: around first, then up.
      triangle(v(i, k, false), v(i, j, false), v(i + 1, j, false));
      triangle(v(i, k, false), v(i + 1, j, false), v(i + 1, k, false));
      // Inner surface, facing in, so the same corners the other way round.
      triangle(v(i, k, true), v(i + 1, j, true), v(i, j, true));
      triangle(v(i, k, true), v(i + 1, k, true), v(i + 1, j, true));
    }
  }

  const top = n - 1;
  for (let k = 0; k < segments; k += 1) {
    const j = (k + 1) % segments;
    // Bottom rim, facing down.
    triangle(v(0, k, false), v(0, k, true), v(0, j, true));
    triangle(v(0, k, false), v(0, j, true), v(0, j, false));
    // Top rim, facing up.
    triangle(v(top, k, false), v(top, j, false), v(top, j, true));
    triangle(v(top, k, false), v(top, j, true), v(top, k, true));
  }

  let indexArray = indices;
  let volume = signedVolume(positions, indexArray);
  // The winding above is already outward; this is the same insurance the other
  // builders carry, and it fires only if that reasoning is ever broken.
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
  radiusMm?: number,
): MeshData {
  const radius = (radiusMm ?? outerRadius(params) + params.wallThickness) * scale;
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
  if (wall.clock.revolved) return buildRevolveNotchOverlay(wall, params, scale, liftMm);

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
      const hi = (samples[i].z + wall.top[i]) * scale + lift;
      const hj = (samples[j].z + wall.top[j]) * scale + lift;
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
      const floor = (sample.z + wall.top[edge]) * scale;
      const crest = (sample.z + wall.undisturbed[edge]) * scale;
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

/**
 * The same overlay for the revolved form, where a notch is not a slot in a top
 * edge but an incised RING: the eruption cuts the whole circumference at its
 * own height. The floor is a band of the surface of revolution, the two sides
 * are flat annuli, and the lift is radial so the band sits a hair proud of the
 * wall it covers. It uses the wall's own segment count and the same angles, so
 * the two surfaces cannot cross between facets.
 */
function buildRevolveNotchOverlay(
  wall: Wall,
  params: Params,
  scale: number,
  liftMm: number,
): SurfaceData {
  const samples = wall.spiral.samples;
  // The same segments, at the same angles, as the wall underneath: a coarser
  // overlay would sink into the facets it is meant to sit a hair proud of.
  const segments = revolveSegments(samples.length);
  const core = params.r0 * scale;
  const lift = liftMm * scale;
  const positions: number[] = [];
  const indices: number[] = [];

  const cos = new Float64Array(segments);
  const sin = new Float64Array(segments);
  for (let k = 0; k < segments; k += 1) {
    const angle = (k / segments) * Math.PI * 2;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }

  const push = (radius: number, segment: number, height: number): number => {
    const [vx, vy, vz] = toThree(radius * cos[segment], radius * sin[segment], height);
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

    // The floor: a band of the revolved surface at the cut's own radius.
    for (let step = 0; step < inside.length - 1; step += 1) {
      const i = inside[step];
      const j = inside[step + 1];
      const ri = core + wall.top[i] * scale + lift;
      const rj = core + wall.top[j] * scale + lift;
      const hi = samples[i].z * scale;
      const hj = samples[j].z * scale;
      for (let k = 0; k < segments; k += 1) {
        const next = (k + 1) % segments;
        quad(push(ri, k, hi), push(ri, next, hi), push(rj, next, hj), push(rj, k, hj));
      }
    }

    // The two sides: flat annuli from the floor out to the uncut crest.
    for (const [edge, direction] of [
      [inside[0], 1],
      [inside[inside.length - 1], -1],
    ] as const) {
      const floor = core + wall.top[edge] * scale;
      const crest = core + wall.undisturbed[edge] * scale;
      if (crest - floor < 1e-6) continue;
      const height = samples[edge].z * scale + direction * lift;
      for (let k = 0; k < segments; k += 1) {
        const next = (k + 1) % segments;
        quad(
          push(floor, k, height),
          push(floor, next, height),
          push(crest, next, height),
          push(crest, k, height),
        );
      }
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

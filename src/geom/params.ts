/**
 * The full parameter set of the piece. Every dimension is a FIRED size in mm;
 * shrinkage is applied only when exporting templates or a green-size mesh.
 *
 * This object is the single source of truth for geometry, exports, the URL hash
 * and the spec sheet, so a template, a render and a spec can always be matched
 * by their config hash.
 */

import type { SignalName } from '../data/series.js';

export type ClockMode = 'circle' | 'cylinder' | 'synodic' | 'springNeap' | 'linear';

/**
 * True for the modes whose radius grows with the angle, so the turns are spread
 * out across a flat plan. False for the two constant-radius forms — the closed
 * ring and the cylinder — where every turn has the same diameter and r₁ has
 * nothing to do.
 */
export function growsOutward(mode: ClockMode): boolean {
  return mode === 'synodic' || mode === 'springNeap' || mode === 'linear';
}

/** @deprecated use {@link growsOutward}; kept so older call sites still read. */
export const isSpiral = growsOutward;

/**
 * True for the revolved form: the cylinder.
 *
 * It is the one mode that is not a coil at all. Time runs UP the axis and the
 * signal becomes the RADIUS, so the piece is a surface of revolution — a thrown
 * vessel whose silhouette is the tide. Every tide crest is therefore a full
 * circle of its own diameter around the piece, the same on every side, which is
 * what a profile pulled against a turning wheel makes.
 */
export function revolved(mode: ClockMode): boolean {
  return mode === 'cylinder';
}
export type PageSize = 'A4' | 'A3' | 'Letter';

export interface Params {
  // ---- clock -------------------------------------------------------------
  /** How the angle is derived from time. */
  clockMode: ClockMode;
  /** Turns for the linear control mode only. */
  linearTurns: number;
  /** Window start, ISO UTC. */
  windowStartUtc: string;
  /** Window end, ISO UTC. */
  windowEndUtc: string;

  // ---- spiral, mm --------------------------------------------------------
  /**
   * Radius at the window start — and, in circle mode, the radius of the whole
   * ring, since there is nowhere for it to grow to.
   */
  r0: number;
  /** Radius at the window end. Unused, and disabled in the panel, in circle mode. */
  r1: number;
  /** Plan rotation in degrees; the default points new moon at the viewer. */
  thetaRefDeg: number;
  /**
   * Cylinder mode only: how far the piece rises per turn — per synodic month —
   * in mm. It is the vertical scale of the whole form: the height is the turns
   * times this, and it is what decides how much room each tide gets up the
   * profile, so it plays the part the radius plays on a flat spiral.
   */
  pitchMm: number;
  /** Arc-length resampling step. */
  arcStepMm: number;

  // ---- wall --------------------------------------------------------------
  /** Which signal drives the wall height. */
  signal: SignalName;
  /** Height at the signal's minimum, mm. */
  hBase: number;
  /** Height gain, mm per cm of signal. */
  k: number;
  /** Low-pass wavelength along the arc, mm; 0 disables smoothing. */
  smoothingMm: number;
  /** Slab thickness, mm. */
  wallThickness: number;

  // ---- notches -----------------------------------------------------------
  /** Width of an instant event's notch, mm. */
  notchWidth: number;
  /** Depth of a notch with no plume height, mm. */
  notchDepth0: number;
  /** Extra depth per km of plume, mm per km. */
  notchDepthPerKm: number;

  // ---- fabrication -------------------------------------------------------
  /** Clay shrinkage, percent, fired vs green. */
  shrinkagePct: number;
  /** Largest green diameter the kiln will take, mm. */
  kilnLimitMm: number;
  /** Clearance needed between turns for fingers and tools, mm. */
  clearanceMm: number;
  /** Smallest feature the clay will hold, mm. */
  minFeatureMm: number;
  /** Largest acceptable wall height, mm. */
  maxHeightMm: number;
  /** Add a base disc to the mesh. */
  baseDisc: boolean;

  // ---- output ------------------------------------------------------------
  /** Longest wall strip on one template sheet, mm. */
  stripMaxMm: number;
  pageSize: PageSize;
  /** UI language. */
  lang: 'es' | 'en';
}

/**
 * The defaults make a vessel: a revolved form whose silhouette is the tide of
 * 4-10 October 1999, carrying both of Pichincha's subplinian eruptions as
 * incised rings.
 *
 * Fired it stands 324 mm tall and swings between 184 mm across at the low
 * waters and 237 mm at the high ones, which is 270 x 368 mm green — inside a
 * 400 mm kiln in both directions with room to spare. Each tidal cycle gets
 * 24 mm of height and 26 mm of relief, so the record reads as about thirteen
 * swells up the piece.
 *
 * The WINDOW is the binding constraint, and it binds the other way round from
 * the ring. On a ring the tide has to fit around a fixed circumference, so a
 * long window packs it into teeth too fine to cut. Here the tide has to fit UP
 * a height the kiln limits, and the profile's slope is what gives out: the
 * silhouette's steepest pitch is 1.65 : 1 at these numbers, and a slope much
 * past 2 : 1 is an undercut no rib will follow. Seven days is about as much as
 * a 400 mm kiln will carry at a relief worth looking at; the twelve-day crown
 * window would need k down near 0.05, which is a 5 mm ripple on a 300 mm pot.
 *
 * Every hour of 4-10 October is observed data: not one of them is reconstructed.
 * The numbers also leave every other clock mode green, so changing mode is a
 * change of form rather than a wall of red.
 */
export const DEFAULT_PARAMS: Params = {
  clockMode: 'cylinder',
  linearTurns: 1,
  // 4-10 Oct 1999: the 5 Oct and 7 Oct subplinian eruptions with two days of
  // margin at each end, well clear of the 13 Oct data gap.
  windowStartUtc: '1999-10-04T00:00:00.000Z',
  windowEndUtc: '1999-10-10T23:00:00.000Z',

  // r0 is the core radius the tide is measured out from: the waist of the
  // vessel, 92 mm fired at the lowest water. r1 is unused wherever the radius
  // is constant and is set so the spiral modes also work at this window rather
  // than failing the moment the mode is changed.
  r0: 90,
  r1: 170,
  // Plan y points away from the default camera, so -90 deg puts phase 0
  // (new moon) toward the viewer — and, on the revolved form, puts the
  // reported meridian there too.
  thetaRefDeg: -90,
  // 1400 mm per synodic month is 1.94 mm of height per hour: the vertical
  // scale of the whole piece, and the only thing that sets how much room each
  // tide gets up the profile.
  pitchMm: 1400,
  arcStepMm: 0.5,

  signal: 'elev',
  hBase: 16,
  // 0.08 mm per cm turns the 157 cm range of this week into 26 mm of relief,
  // at a silhouette slope of 1.65 : 1 — a steep flute a rib can still follow.
  k: 0.08,
  smoothingMm: 0,
  wallThickness: 6,

  notchWidth: 3,
  notchDepth0: 4,
  // 0.8 mm/km puts the 15 km plume of 5 October at a 16 mm cut: unmistakable
  // against a 41 mm crown, and well clear of cutting through it.
  notchDepthPerKm: 0.8,

  shrinkagePct: 12,
  kilnLimitMm: 400,
  clearanceMm: 12,
  minFeatureMm: 5,
  maxHeightMm: 90,
  baseDisc: false,

  stripMaxMm: 380,
  pageSize: 'A4',
  lang: 'es',
};

/**
 * The range and granularity of every numeric parameter.
 *
 * This is the single source of truth for both the panel's sliders and the values
 * a check's one-click fix may propose. Keeping them apart was a bug waiting to
 * happen: a fix of "r₁ → 148.6 mm" fed into a slider with a 1 mm step came back
 * as 149, and a fix that rounded the other way would have silently undone
 * itself.
 */
export const PARAM_RANGES = {
  linearTurns: { min: 0.25, max: 12, step: 0.05 },
  r0: { min: 5, max: 200, step: 1 },
  r1: { min: 20, max: 400, step: 1 },
  thetaRefDeg: { min: -180, max: 180, step: 1 },
  pitchMm: { min: 10, max: 2000, step: 5 },
  arcStepMm: { min: 0.2, max: 3, step: 0.1 },
  hBase: { min: 2, max: 60, step: 0.5 },
  k: { min: 0.02, max: 1, step: 0.01 },
  smoothingMm: { min: 0, max: 40, step: 0.5 },
  wallThickness: { min: 2, max: 20, step: 0.5 },
  notchWidth: { min: 0.5, max: 20, step: 0.5 },
  notchDepth0: { min: 0.5, max: 30, step: 0.5 },
  notchDepthPerKm: { min: 0, max: 6, step: 0.1 },
  shrinkagePct: { min: 0, max: 25, step: 0.5 },
  kilnLimitMm: { min: 100, max: 1200, step: 10 },
  clearanceMm: { min: 0, max: 40, step: 1 },
  minFeatureMm: { min: 0.5, max: 20, step: 0.5 },
  maxHeightMm: { min: 20, max: 300, step: 5 },
  stripMaxMm: { min: 100, max: 1000, step: 10 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

export type RangedParam = keyof typeof PARAM_RANGES;

/** Decimal places a step implies, so snapping never leaves 148.60000000000002. */
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function clampToRange(key: RangedParam, value: number): number {
  const { min, max } = PARAM_RANGES[key];
  return Math.min(Math.max(value, min), max);
}

/**
 * Nudge away a floating-point hair before rounding to a step.
 *
 * 0.7 / 0.05 is 13.999999999999998 in binary floating point, so a bare
 * Math.floor turns an already-snapped 0.7 into 0.65 — which makes snapping
 * non-idempotent and lets a one-click fix drift a step every time it is
 * recomputed. A tolerance of a millionth of a step is far below any value
 * these parameters carry and far above the error.
 */
const STEP_EPSILON = 1e-6;

/**
 * Round a value UP to the parameter's own step: for a limit the value must stay
 * above, so that snapping can only ever move it further inside.
 */
export function snapUp(key: RangedParam, value: number): number {
  const { step } = PARAM_RANGES[key];
  const snapped = Math.ceil(clampToRange(key, value) / step - STEP_EPSILON) * step;
  return Number(clampToRange(key, snapped).toFixed(decimalsOf(step)));
}

/** Round a value DOWN to the parameter's own step, for a ceiling. */
export function snapDown(key: RangedParam, value: number): number {
  const { step } = PARAM_RANGES[key];
  const snapped = Math.floor(clampToRange(key, value) / step + STEP_EPSILON) * step;
  return Number(clampToRange(key, snapped).toFixed(decimalsOf(step)));
}

/** The window the piece is designed around: the two October eruptions. */
export const SHORT_WINDOW_PRESET: Partial<Params> = {
  windowStartUtc: '1999-10-04T00:00:00.000Z',
  windowEndUtc: '1999-10-10T23:00:00.000Z',
};

/** The whole record the brief covers, for seeing all five eruptions at once. */
export const FULL_WINDOW_PRESET: Partial<Params> = {
  windowStartUtc: '1999-09-26T00:00:00.000Z',
  windowEndUtc: '1999-12-31T23:00:00.000Z',
};

/**
 * The radius the plan is set out from: the ring radius in circle mode, the core
 * radius of the revolved form, the end of the spiral otherwise.
 *
 * On the revolved form this is NOT the widest point of the piece — the tide is
 * radial there, so the outer surface stands `relief` proud of it. What the kiln
 * has to take is `Wall.outerRadiusMm`, which knows the relief.
 */
export function outerRadius(params: Params): number {
  return growsOutward(params.clockMode) ? params.r1 : params.r0;
}

/** The parameter that `outerRadius` reads, for advice that wants to change it. */
export function outerRadiusKey(params: Params): 'r0' | 'r1' {
  return growsOutward(params.clockMode) ? 'r1' : 'r0';
}

/** Shrinkage factor: green size = fired size / (1 - shrinkage). */
export function greenScale(params: Params): number {
  return 1 / (1 - params.shrinkagePct / 100);
}

/**
 * Order-independent, stable 32-bit hash of the parameter set, rendered as 8 hex
 * characters. Printed on every export so a template, a render and a spec sheet
 * can be matched after the fact.
 */
export function configHash(params: Params): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))),
  );
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const NUMERIC_KEYS: Array<keyof Params> = [
  'linearTurns', 'r0', 'r1', 'thetaRefDeg', 'pitchMm', 'arcStepMm', 'hBase', 'k', 'smoothingMm',
  'wallThickness', 'notchWidth', 'notchDepth0', 'notchDepthPerKm', 'shrinkagePct',
  'kilnLimitMm', 'clearanceMm', 'minFeatureMm', 'maxHeightMm', 'stripMaxMm',
];

/** Serialise to a URL hash, omitting anything left at its default. */
export function paramsToHash(params: Params): string {
  const entries: string[] = [];
  for (const key of Object.keys(DEFAULT_PARAMS) as Array<keyof Params>) {
    const value = params[key];
    if (value === DEFAULT_PARAMS[key]) continue;
    entries.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return entries.join('&');
}

/** Parse a URL hash back into a parameter set, ignoring anything unrecognised. */
export function paramsFromHash(hash: string): Params {
  const params: Params = { ...DEFAULT_PARAMS };
  const text = hash.replace(/^#/, '');
  if (text === '') return params;
  for (const pair of text.split('&')) {
    const [rawKey, rawValue] = pair.split('=');
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey as keyof Params;
    if (!(key in DEFAULT_PARAMS)) continue;
    const value = decodeURIComponent(rawValue);
    if (NUMERIC_KEYS.includes(key)) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) (params[key] as number) = parsed;
    } else if (key === 'baseDisc') {
      params.baseDisc = value === 'true';
    } else {
      (params[key] as string) = value;
    }
  }
  return params;
}

/**
 * The full parameter set of the piece. Every dimension is a FIRED size in mm;
 * shrinkage is applied only when exporting templates or a green-size mesh.
 *
 * This object is the single source of truth for geometry, exports, the URL hash
 * and the spec sheet, so a template, a render and a spec can always be matched
 * by their config hash.
 */

import type { SignalName } from '../data/series.js';

export type ClockMode = 'circle' | 'synodic' | 'springNeap' | 'linear';

/** True for the modes that wind outward; false for the closed ring. */
export function isSpiral(mode: ClockMode): boolean {
  return mode !== 'circle';
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
 * The defaults make the crown of a vase: a closed ring sized to sit on a thrown
 * rim, carrying the twelve days around Pichincha's two subplinian eruptions.
 *
 * The window is the binding constraint. One tidal cycle occupies
 * circumference x 12.42 / window hours of arc, and the circumference is fixed by
 * the vase, so a long window packs the tide into teeth too fine to cut, dry or
 * fire. At r0 = 100 mm and twelve days each tooth is about 13 mm wide at green
 * size with a 3.2 : 1 height-to-width ratio — carvable by hand in a grogged or
 * paper body. The whole of 1-12 October 1999 is observed data: not one hour of
 * it is reconstructed.
 */
export const DEFAULT_PARAMS: Params = {
  clockMode: 'circle',
  linearTurns: 1,
  // 1-12 Oct 1999: the 5 Oct and 7 Oct subplinian eruptions, clear of the
  // 13 Oct data gap at both ends.
  windowStartUtc: '1999-10-01T00:00:00.000Z',
  windowEndUtc: '1999-10-12T23:00:00.000Z',

  // r0 is the ring's radius: 206 mm fired, 234 mm green — a generous but
  // throwable vase mouth. r1 is unused in circle mode and is set so that the
  // spiral modes also work at this window rather than failing the moment the
  // mode is changed.
  r0: 100,
  r1: 170,
  // Plan y points away from the default camera, so -90 deg puts phase 0
  // (new moon) toward the viewer.
  thetaRefDeg: -90,
  arcStepMm: 0.5,

  signal: 'elev',
  hBase: 15,
  k: 0.25,
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

/** A short window around the two October eruptions, offered as a preset. */
/** The window the piece is designed around: the two October eruptions. */
export const SHORT_WINDOW_PRESET: Partial<Params> = {
  windowStartUtc: '1999-10-01T00:00:00.000Z',
  windowEndUtc: '1999-10-12T23:00:00.000Z',
};

/** The whole record the brief covers, for seeing all five eruptions at once. */
export const FULL_WINDOW_PRESET: Partial<Params> = {
  windowStartUtc: '1999-09-26T00:00:00.000Z',
  windowEndUtc: '1999-12-31T23:00:00.000Z',
};

/**
 * The radius of the outermost wall, which is what the kiln has to take: the ring
 * radius in circle mode, the end of the spiral otherwise.
 */
export function outerRadius(params: Params): number {
  return isSpiral(params.clockMode) ? params.r1 : params.r0;
}

/** The parameter that `outerRadius` reads, for advice that wants to change it. */
export function outerRadiusKey(params: Params): 'r0' | 'r1' {
  return isSpiral(params.clockMode) ? 'r1' : 'r0';
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
  'linearTurns', 'r0', 'r1', 'thetaRefDeg', 'arcStepMm', 'hBase', 'k', 'smoothingMm',
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

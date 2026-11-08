/**
 * Turning a failed check into a number the user can act on.
 *
 * Every fabrication limit in `validate.ts` is a one-line inequality, so each one
 * can be solved for the parameter that is easiest to move. This module does that
 * arithmetic once, and both the panel's advice lines and the parameter tooltips
 * read from it — so the tooltip that says "1.8 to 6.1 turns" and the warning that
 * says "raise r₁ to 149 mm" can never drift apart.
 *
 * The length of the spiral is needed before it is built, so it is computed in
 * closed form for an Archimedean spiral r = a + bθ:
 *
 *     L = ∫ √(r² + b²) dθ = (1/2b)[ r√(r² + b²) + b² ln(r + √(r² + b²)) ]
 *
 * evaluated from r₀ to r₁. Mean circumference × turns is the b → 0 limit of
 * this and is off by 2–3% when the radius grows fast relative to the turn
 * spacing; the closed form is exact, so the advice never disagrees with the
 * centerline the geometry actually builds.
 */

import { M2_PERIOD_HOURS } from './validate.js';
import { growsOutward, revolved, type Params } from './params.js';

/** Arc length of a spiral of `turns` turns between two radii, mm. */
export function approximateLength(r0: number, r1: number, turns: number): number {
  const sweep = Math.abs(turns) * 2 * Math.PI;
  if (sweep === 0) return 0;

  const inner = Math.min(r0, r1);
  const outer = Math.max(r0, r1);
  const b = (outer - inner) / sweep; // radial growth per radian

  // A constant radius is a circle, where the integral degenerates.
  if (b < 1e-9) return outer * sweep;

  const antiderivative = (r: number): number => {
    const h = Math.hypot(r, b);
    return (r * h + b * b * Math.log(r + h)) / (2 * b);
  };
  return antiderivative(outer) - antiderivative(inner);
}

/** Turns that an Archimedean spiral between two radii needs to reach a length. */
export function turnsForLength(r0: number, r1: number, targetLengthMm: number): number {
  // Monotonic in turns, so a short bisection is both exact enough and obvious.
  let low = 0;
  let high = 1;
  while (approximateLength(r0, r1, high) < targetLengthMm && high < 1e6) high *= 2;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (approximateLength(r0, r1, mid) < targetLengthMm) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export interface TurnGuidance {
  /** Turns the current configuration actually produces. */
  turns: number;
  /** True when `linearTurns` is in charge, i.e. the clock mode is linear. */
  turnsAreUserSet: boolean;
  /** Most turns the radial span can hold at this wall thickness and clearance. */
  maxTurns: number;
  /** Fewest turns that keep one tidal cycle wider than the minimum feature. */
  minTurns: number;
  /** Radial span now available, mm. */
  radialSpanMm: number;
  /** Radial span these turns need, mm. */
  requiredSpanMm: number;
  /** r₁ that would satisfy the turn-spacing check at the current turns, mm. */
  suggestedR1Mm: number;
  /**
   * Largest outer radius the kiln will take, mm. That is r₁ for a spiral and
   * r₀ for a ring, since the ring has no r₁.
   */
  maxOuterRadiusMm: number;
  /**
   * Constant radius that would make the wall long enough, mm. One turn of it
   * for a ring, `turns` of it for a cylinder.
   */
  requiredRingRadiusMm: number;
  /** Centerline length the minimum-feature check needs, mm. */
  requiredLengthMm: number;
}

/**
 * @param hours  length of the window in hours; the tide-wavelength limit depends
 *               on how much time is packed into the wall, not on the clock mode.
 */
export function turnGuidance(params: Params, turns: number, hours: number): TurnGuidance {
  const pitch = params.wallThickness + params.clearanceMm;
  // A ring has no radial span to share out; the turn bracket does not apply.
  const radialSpan = growsOutward(params.clockMode) ? params.r1 - params.r0 : 0;

  // One M2 cycle must be at least minFeature wide:
  //   length · M2 / hours ≥ minFeature   ⇒   length ≥ minFeature · hours / M2
  const requiredLength = (params.minFeatureMm * Math.max(hours, 1)) / M2_PERIOD_HOURS;

  return {
    turns,
    turnsAreUserSet: params.clockMode === 'linear',
    // A span of zero or less cannot hold any turn at all; report 0 rather than a
    // negative "maximum", which would read as a nonsense range in the panel.
    maxTurns: pitch > 0 ? Math.max(radialSpan / pitch, 0) : Number.POSITIVE_INFINITY,
    minTurns: turnsForLength(params.r0, params.r1, requiredLength),
    radialSpanMm: radialSpan,
    requiredSpanMm: Math.abs(turns) * pitch,
    suggestedR1Mm: params.r0 + Math.abs(turns) * pitch,
    // The coiled forms measure the radius to the CENTERLINE, so half a wall
    // thickness still has to fit outside it. The revolved form's radius is
    // already the outer surface — its wall goes inward — so nothing is held back.
    maxOuterRadiusMm:
      (params.kilnLimitMm * (1 - params.shrinkagePct / 100)) / 2 -
      (revolved(params.clockMode) ? 0 : params.wallThickness / 2),
    requiredRingRadiusMm: requiredLength / (2 * Math.PI * Math.max(Math.abs(turns), 1e-9)),
    requiredLengthMm: requiredLength,
  };
}

/**
 * Tallest pitch the kiln will take, mm per turn.
 *
 * The revolved form's height is turns x pitch, and the kiln has to swallow the
 * GREEN piece, so the fired height may be no more than the limit times
 * (1 - shrinkage).
 */
export function maxPitchForKiln(params: Params, turns: number): number {
  const firedLimit = params.kilnLimitMm * (1 - params.shrinkagePct / 100);
  return firedLimit / Math.max(Math.abs(turns), 1e-9);
}

/**
 * Pitch that stretches the profile to a target length, mm per turn.
 *
 * The revolved profile's length IS the piece's height, which is turns x pitch,
 * so this is a division rather than an integral.
 */
export function pitchForProfileLength(targetLengthMm: number, turns: number): number {
  return targetLengthMm / Math.max(Math.abs(turns), 1e-9);
}

/**
 * Pitch that brings the revolved silhouette down to a target slope, mm/turn.
 *
 * Stretching the height by a factor a leaves R alone and divides dR/dz by a, so
 * the slope is exactly inversely proportional to the pitch and this is a plain
 * ratio — no bound, no approximation. The same stretch is what makes the piece
 * taller, which is why the kiln is what finally stops it.
 */
export function pitchForSlope(
  currentPitchMm: number,
  currentSlope: number,
  targetSlope: number,
): number {
  if (targetSlope <= 0 || currentSlope <= 0) return currentPitchMm;
  return (currentPitchMm * currentSlope) / targetSlope;
}

/**
 * Gain k that brings the revolved silhouette down to a target slope, mm per cm.
 *
 * The same relation the other way round: R is proportional to k, so dR/dz is
 * too, and the gain scales directly with the slope allowed.
 */
export function gainForSlope(
  currentK: number,
  currentSlope: number,
  targetSlope: number,
): number {
  if (currentSlope <= 0) return currentK;
  return (currentK * targetSlope) / currentSlope;
}

/** Radii scaled by this factor give the target centerline length. */
export function radiusScaleForLength(currentLengthMm: number, targetLengthMm: number): number {
  if (currentLengthMm <= 0) return 1;
  return targetLengthMm / currentLengthMm;
}

/** Largest gain k that keeps the wall under its height limit, mm per cm. */
export function maxGainForHeight(params: Params, signalRangeCm: number): number {
  if (signalRangeCm <= 0) return params.k;
  return (params.maxHeightMm - params.hBase) / signalRangeCm;
}

/** Window length in hours that would satisfy the minimum-feature check. */
export function maxWindowHoursForFeature(lengthMm: number, minFeatureMm: number): number {
  if (minFeatureMm <= 0) return Number.POSITIVE_INFINITY;
  return (lengthMm * M2_PERIOD_HOURS) / minFeatureMm;
}

const round = (value: number, step = 1): number => Math.ceil(value / step) * step;
const floor = (value: number, step = 1): number => Math.floor(value / step) * step;

export { round as roundUp, floor as roundDown };

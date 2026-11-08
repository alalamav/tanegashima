/**
 * The angular coordinate: which direction an hour points.
 *
 * Three modes, all returning an UNWRAPPED angle in radians so the spiral's
 * radius can be driven by the same number:
 *
 *   circle       theta runs once around, so the wall closes into a cylinder
 *                instead of winding outward. The angle is still lunar-paced —
 *                it is the elapsed moon phase, scaled so the window covers
 *                exactly one turn — so a window of one synodic month IS the
 *                lunar phase, with new moon at the seam, and a longer window is
 *                the same progression compressed into one turn. The radius is
 *                constant at r0; r1 has nowhere to grow to and is ignored.
 *   cylinder     the revolved form, and the one mode that is not a coil at all.
 *                theta is the unwrapped moon phase as in synodic mode, but it
 *                drives HEIGHT rather than direction: the piece rises `pitchMm`
 *                per turn, so one synodic month is one fixed slice of the axis
 *                and the whole form is `turns` x pitch tall. The tide becomes
 *                the RADIUS, measured out from r0, and the result is a surface
 *                of revolution — a thrown vessel whose silhouette is the tide.
 *                Every crest is a full circle of its own diameter, identical on
 *                every side of the piece, which is what a profile pulled
 *                against a turning wheel makes.
 *   synodic      theta = unwrapped moon phase. One turn = one synodic month.
 *                New moons land at 0 deg, full moons at 180 deg. Because the
 *                Moon's angular speed varies by about +/-12% over its orbit,
 *                this mode is slightly uneven in time. That unevenness is the
 *                Moon's, not an error, and it is kept.
 *   springNeap   theta = 2 x unwrapped moon phase. Both new and full moon land
 *                at 0 deg, so the two spring tides of each month coincide in
 *                direction.
 *   linear       theta uniform in time, with the number of turns set by hand.
 *                The control version: it lines nothing up, which is the point.
 */

import type { Series } from '../data/series.js';
import { hourIndexOf } from '../data/series.js';
import { growsOutward, revolved, type ClockMode, type Params } from './params.js';

const DEG = Math.PI / 180;

export interface ClockWindow {
  /** First hour index of the window, integer. */
  i0: number;
  /** Last hour index of the window, integer. */
  i1: number;
  /** Number of hourly samples in the window. */
  count: number;
}

export interface Clock {
  mode: ClockMode;
  /** True when the first and last samples join: a ring rather than a spiral. */
  closed: boolean;
  /** True when every turn has the same radius: the ring and the cylinder. */
  constantRadius: boolean;
  /**
   * True for the revolved form: the path runs up the axis and the signal is
   * radial, so the piece is axisymmetric rather than a coil.
   */
  revolved: boolean;
  /** Rise per turn along z, mm. Zero for every mode but the cylinder. */
  climbMmPerTurn: number;
  window: ClockWindow;
  /** Unwrapped angle in radians at a (possibly fractional) hour index. */
  thetaAt(hourIndex: number): number;
  /** Angle at the window start. */
  thetaStart: number;
  /** Angle at the window end. */
  thetaEnd: number;
  /** Total turns across the window. */
  turns: number;
  /** Wrapped angle in degrees, 0–360, for labelling. */
  wrappedDegAt(hourIndex: number): number;
}

/** Resolve the window parameters to integer hour indices inside the series. */
export function resolveWindow(series: Series, params: Params): ClockWindow {
  const n = series.arrays.t.length;
  const clamp = (value: number) => Math.min(Math.max(Math.round(value), 0), n - 1);
  const a = clamp(hourIndexOf(series, params.windowStartUtc));
  const b = clamp(hourIndexOf(series, params.windowEndUtc));
  const i0 = Math.min(a, b);
  const i1 = Math.max(a, b);
  if (i1 - i0 < 24) {
    throw new Error('clock: the window must span at least 24 hours');
  }
  return { i0, i1, count: i1 - i0 + 1 };
}

/** Linear sample of the unwrapped phase array at a fractional hour index. */
function phaseDegAt(series: Series, hourIndex: number): number {
  const phase = series.arrays.phase;
  const i0 = Math.min(Math.max(Math.floor(hourIndex), 0), phase.length - 1);
  const i1 = Math.min(i0 + 1, phase.length - 1);
  const frac = hourIndex - i0;
  return phase[i0] + (phase[i1] - phase[i0]) * frac;
}

export function makeClock(series: Series, params: Params): Clock {
  const window = resolveWindow(series, params);
  const { i0, i1 } = window;

  const phaseStart = phaseDegAt(series, i0);

  let thetaAt: (hourIndex: number) => number;
  switch (params.clockMode) {
    case 'circle': {
      // Close the ring on the hour AFTER the last sample, so the step from the
      // last sample back to the first is one hour like every other step and no
      // sample is drawn twice.
      const lastStep = phaseDegAt(series, i1) - phaseDegAt(series, i1 - 1);
      const phaseWrap = phaseDegAt(series, i1) + lastStep;
      const span = phaseWrap - phaseStart;
      thetaAt = (hourIndex) =>
        span === 0 ? 0 : ((phaseDegAt(series, hourIndex) - phaseStart) / span) * 2 * Math.PI;
      break;
    }
    case 'cylinder':
    case 'synodic':
      thetaAt = (hourIndex) => (phaseDegAt(series, hourIndex) - phaseStart) * DEG;
      break;
    case 'springNeap':
      thetaAt = (hourIndex) => 2 * (phaseDegAt(series, hourIndex) - phaseStart) * DEG;
      break;
    case 'linear': {
      const span = i1 - i0;
      const total = params.linearTurns * 2 * Math.PI;
      thetaAt = (hourIndex) => ((hourIndex - i0) / span) * total;
      break;
    }
  }

  const thetaStart = thetaAt(i0);
  const thetaEnd = thetaAt(i1);
  const closed = params.clockMode === 'circle';

  return {
    mode: params.clockMode,
    closed,
    constantRadius: !growsOutward(params.clockMode),
    revolved: revolved(params.clockMode),
    climbMmPerTurn: revolved(params.clockMode) ? params.pitchMm : 0,
    window,
    thetaAt,
    thetaStart,
    thetaEnd,
    // A closed ring is one turn by definition; thetaEnd stops one hour short of
    // 2 pi, which would otherwise read as slightly less than a full turn.
    turns: closed ? 1 : (thetaEnd - thetaStart) / (2 * Math.PI),
    wrappedDegAt: (hourIndex) => {
      // Report the real lunar phase regardless of mode, so the readout never
      // lies about where the Moon was.
      const degrees = phaseDegAt(series, hourIndex);
      return ((degrees % 360) + 360) % 360;
    },
  };
}

/**
 * Moon phase as the angular coordinate of the piece.
 *
 * `astronomy-engine`'s `MoonPhase(date)` returns the Moon's ecliptic elongation
 * from the Sun in degrees: 0 = new moon, 90 = first quarter, 180 = full moon,
 * 270 = last quarter. That is exactly the angle the spiral uses, so no phase
 * convention is invented here.
 *
 * The raw value wraps at 360. Because the spiral's radius is driven by the same
 * parameter, the angle has to be UNWRAPPED into a monotonically increasing
 * quantity, so that each synodic month becomes one further turn instead of
 * re-tracing the first one.
 */

import { Body, Illumination, MoonPhase, SearchMoonPhase } from 'astronomy-engine';

/** Mean synodic month, days. One turn of the spiral in synodic mode. */
export const SYNODIC_MONTH_DAYS = 29.530588853;

/** Wrapped phase angle in degrees, 0 = new moon, 180 = full moon. */
export function phaseDegrees(date: Date): number {
  return MoonPhase(date);
}

/** Illuminated fraction of the Moon's disc, 0 (new) to 1 (full). */
export function illuminatedFraction(date: Date): number {
  return Illumination(Body.Moon, date).phase_fraction;
}

/**
 * Unwrap a sequence of wrapped angles (degrees) into a continuous one.
 *
 * Each step adds the smallest rotation consistent with the observed change, so a
 * jump from 359 to 1 reads as +2 degrees rather than -358. Hourly sampling moves
 * the phase by about 0.5 degrees, far below the 180-degree ambiguity threshold,
 * so this is unambiguous for our data.
 */
export function unwrapDegrees(wrapped: number[]): number[] {
  if (wrapped.length === 0) return [];
  const out = [wrapped[0]];
  let turns = 0;
  for (let i = 1; i < wrapped.length; i += 1) {
    const delta = wrapped[i] - wrapped[i - 1];
    if (delta < -180) turns += 1;
    else if (delta > 180) turns -= 1;
    out.push(wrapped[i] + turns * 360);
  }
  return out;
}

/**
 * Unwrap relative to a reference instant, for a single date rather than a series.
 * Keeps events consistent with the series they are drawn onto.
 */
export function unwrapAgainst(referenceUnwrapped: number, wrapped: number): number {
  const base = Math.round((referenceUnwrapped - wrapped) / 360) * 360;
  return wrapped + base;
}

export interface MoonPhaseEvent {
  /** 0 = new, 90 = first quarter, 180 = full, 270 = last quarter. */
  phase: 0 | 90 | 180 | 270;
  utc: string;
}

/**
 * All quarter-phase instants inside [start, end), found by root-finding on the
 * elongation rather than by a mean-period formula, so the ±14 h libration of the
 * true lunation is respected.
 */
export function findPhaseEvents(
  start: Date,
  end: Date,
  phases: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270],
): MoonPhaseEvent[] {
  const out: MoonPhaseEvent[] = [];
  for (const phase of phases) {
    let cursor = new Date(start.getTime() - 24 * 3600 * 1000);
    for (let guard = 0; guard < 12; guard += 1) {
      const found = SearchMoonPhase(phase, cursor, 40);
      if (!found) break;
      const when = found.date;
      if (when.getTime() >= end.getTime()) break;
      if (when.getTime() >= start.getTime()) out.push({ phase, utc: when.toISOString() });
      cursor = new Date(when.getTime() + 2 * 24 * 3600 * 1000);
    }
  }
  return out.sort((a, b) => a.utc.localeCompare(b.utc));
}

/** Human-readable phase name, used by the readout. */
export function phaseLabel(degrees: number): { es: string; en: string } {
  const d = ((degrees % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return { es: 'luna nueva', en: 'new moon' };
  if (d < 67.5) return { es: 'creciente', en: 'waxing crescent' };
  if (d < 112.5) return { es: 'cuarto creciente', en: 'first quarter' };
  if (d < 157.5) return { es: 'gibosa creciente', en: 'waxing gibbous' };
  if (d < 202.5) return { es: 'luna llena', en: 'full moon' };
  if (d < 247.5) return { es: 'gibosa menguante', en: 'waning gibbous' };
  if (d < 292.5) return { es: 'cuarto menguante', en: 'last quarter' };
  return { es: 'menguante', en: 'waning crescent' };
}

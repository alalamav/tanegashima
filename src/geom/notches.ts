/**
 * Eruption notches: the volcano's clock, cut into the top edge of the tide.
 *
 * Each event lowers the top edge between vertical sides. Nothing else on the
 * piece is cut, and nothing else is red.
 *
 *   instant events (minute / hour / advisory precision)
 *     width  = notchWidth (3 mm by default)
 *     depth  = notchDepth0 + notchDepthPerKm * plume_km
 *     an unknown plume gets notchDepth0 and a "plume unknown" flag, so the
 *     absence of a measurement is visible rather than guessed at
 *
 *   day-precision events
 *     width  = the arc length that the whole 24 h occupies
 *     depth  = notchDepth0 / 2
 *     imprecision therefore reads as a wide, shallow cut rather than a sharp
 *     one in the wrong place
 */

import type { VolcanoEvent } from '../data/series.js';
import type { Params } from './params.js';
import type { Spiral } from './spiral.js';

/** Half-separation, in mm of arc, between a notch edge and its floor sample. */
export const NOTCH_EDGE_EPSILON = 0.01;

/** Thinnest wall left under a notch floor, mm. Deeper cuts are clamped here. */
export const MIN_NOTCH_FLOOR_MM = 1;

export interface Notch {
  eventId: string;
  /** Arc length of the notch's start, mm. */
  sStart: number;
  /** Arc length of the notch's end, mm. */
  sEnd: number;
  /** Depth below the undisturbed top edge, mm. */
  depth: number;
  /** True when the event has no reported plume height. */
  plumeUnknown: boolean;
  /** True when the event is known only to the day. */
  dayPrecision: boolean;
  /** Arc length of the event's nominal instant, mm. */
  sEvent: number;
  event: VolcanoEvent;
}

/** Depth of an event's notch, mm, before any clamping against wall height. */
export function notchDepth(event: VolcanoEvent, params: Params): number {
  if (event.durationHours > 0) return params.notchDepth0 / 2;
  if (event.plumeKm === null) return params.notchDepth0;
  return params.notchDepth0 + params.notchDepthPerKm * event.plumeKm;
}

/**
 * Place every event on the centerline. Events outside the window are dropped
 * and reported, so a shortened window never silently loses an eruption.
 */
export function computeNotches(
  spiral: Spiral,
  events: VolcanoEvent[],
  params: Params,
  window: { i0: number; i1: number },
): { notches: Notch[]; dropped: VolcanoEvent[] } {
  const notches: Notch[] = [];
  const dropped: VolcanoEvent[] = [];

  for (const event of events) {
    const endHour = event.hourIndex + event.durationHours;
    // Keep an event whose interval overlaps the window at all.
    if (endHour < window.i0 || event.hourIndex > window.i1) {
      dropped.push(event);
      continue;
    }

    const sEvent = spiral.arcLengthAtHour(event.hourIndex);
    let sStart: number;
    let sEnd: number;

    if (event.durationHours > 0) {
      sStart = sEvent;
      sEnd = spiral.arcLengthAtHour(Math.min(endHour, window.i1));
      // A day at the very inner end of the spiral can be shorter than a notch
      // would be if it were an instant; never let it be narrower than that.
      if (sEnd - sStart < params.notchWidth) sEnd = sStart + params.notchWidth;
    } else {
      sStart = sEvent - params.notchWidth / 2;
      sEnd = sEvent + params.notchWidth / 2;
    }

    sStart = Math.max(sStart, 0);
    sEnd = Math.min(sEnd, spiral.length);
    if (sEnd - sStart < 1e-6) {
      dropped.push(event);
      continue;
    }

    notches.push({
      eventId: event.id,
      sStart,
      sEnd,
      depth: notchDepth(event, params),
      plumeUnknown: event.plumeKm === null,
      dayPrecision: event.durationHours > 0,
      sEvent,
      event,
    });
  }

  notches.sort((a, b) => a.sStart - b.sStart);
  return { notches, dropped };
}

/**
 * Arc positions that must become exact samples: the two edges of every notch,
 * plus a point one epsilon inside each edge. The outer pair carries the full
 * top edge, the inner pair carries the notch floor, so the side of the cut spans
 * 0.01 mm of arc — vertical for every practical purpose, and watertight.
 */
export function notchEdgeArcPositions(notches: Notch[]): number[] {
  const out: number[] = [];
  for (const notch of notches) {
    out.push(notch.sStart, notch.sStart + NOTCH_EDGE_EPSILON);
    out.push(notch.sEnd - NOTCH_EDGE_EPSILON, notch.sEnd);
  }
  return out;
}

/**
 * Depth removed at an arc position, mm. Overlapping notches take the deeper of
 * the two rather than adding up.
 */
export function depthAt(s: number, notches: Notch[]): number {
  let depth = 0;
  for (const notch of notches) {
    if (s >= notch.sStart + NOTCH_EDGE_EPSILON / 2 && s <= notch.sEnd - NOTCH_EDGE_EPSILON / 2) {
      depth = Math.max(depth, notch.depth);
    }
  }
  return depth;
}

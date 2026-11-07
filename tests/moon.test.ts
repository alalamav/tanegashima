import { describe, expect, it } from 'vitest';

import {
  findPhaseEvents,
  illuminatedFraction,
  phaseDegrees,
  phaseLabel,
  unwrapAgainst,
  unwrapDegrees,
  SYNODIC_MONTH_DAYS,
} from '../src/data/moon.js';

/** Reference instants from PyEphem, as recorded in the brief. */
const NEW_MOONS = ['1999-10-09T11:34:00Z', '1999-11-08T03:53:00Z', '1999-12-07T22:31:00Z'];
const FULL_MOONS = [
  '1999-09-25T10:51:00Z',
  '1999-10-24T21:02:00Z',
  '1999-11-23T07:03:00Z',
  '1999-12-22T17:31:00Z',
];

const TOLERANCE_MINUTES = 5;

describe('phase convention', () => {
  it('reads ~0° at a new moon and ~180° at a full moon', () => {
    for (const utc of NEW_MOONS) {
      const degrees = phaseDegrees(new Date(utc));
      const fromNew = Math.min(degrees, 360 - degrees);
      expect(fromNew).toBeLessThan(0.1);
    }
    for (const utc of FULL_MOONS) {
      expect(Math.abs(phaseDegrees(new Date(utc)) - 180)).toBeLessThan(0.1);
    }
  });

  it('reports the illuminated fraction consistently with the phase', () => {
    expect(illuminatedFraction(new Date(NEW_MOONS[0]))).toBeLessThan(0.01);
    expect(illuminatedFraction(new Date(FULL_MOONS[0]))).toBeGreaterThan(0.99);
  });
});

describe('phase search against PyEphem, ±5 min', () => {
  const found = findPhaseEvents(
    new Date('1999-09-01T00:00:00Z'),
    new Date('2000-01-01T00:00:00Z'),
  );

  const nearest = (phase: number, reference: string): number => {
    const candidates = found
      .filter((event) => event.phase === phase)
      .map((event) => Math.abs(Date.parse(event.utc) - Date.parse(reference)) / 60_000);
    return Math.min(...candidates);
  };

  it.each(NEW_MOONS)('finds the new moon of %s', (reference) => {
    expect(nearest(0, reference)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
  });

  it.each(FULL_MOONS)('finds the full moon of %s', (reference) => {
    expect(nearest(180, reference)).toBeLessThanOrEqual(TOLERANCE_MINUTES);
  });

  it('finds four lunations of each quarter in Sep–Dec 1999', () => {
    for (const phase of [0, 90, 180, 270]) {
      const count = found.filter((event) => event.phase === phase).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  it('returns events in chronological order with no duplicates', () => {
    const times = found.map((event) => event.utc);
    expect([...times].sort()).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });
});

describe('unwrapping', () => {
  it('turns a wrap at 360° into a continuous increase', () => {
    expect(unwrapDegrees([350, 355, 359, 1, 5])).toEqual([350, 355, 359, 361, 365]);
  });

  it('handles a backwards wrap', () => {
    expect(unwrapDegrees([5, 1, 357])).toEqual([5, 1, -3]);
  });

  it('advances by ~360° per synodic month over the real series', () => {
    const hours: Date[] = [];
    const start = Date.parse('1999-09-01T00:00:00Z');
    for (let h = 0; h <= 24 * 122; h += 1) hours.push(new Date(start + h * 3600_000));
    const unwrapped = unwrapDegrees(hours.map(phaseDegrees));

    expect(unwrapped.every((value, i) => i === 0 || value > unwrapped[i - 1])).toBe(true);

    const days = (hours[hours.length - 1].getTime() - hours[0].getTime()) / 86_400_000;
    const turns = (unwrapped[unwrapped.length - 1] - unwrapped[0]) / 360;
    const meanLunation = days / turns;
    // Within 1% of the mean synodic month: the real lunation varies by ±0.5 d.
    expect(Math.abs(meanLunation - SYNODIC_MONTH_DAYS)).toBeLessThan(0.3);
  });

  it('places a single wrapped angle on the same branch as a reference', () => {
    expect(unwrapAgainst(725, 10)).toBe(730);
    expect(unwrapAgainst(725, 350)).toBe(710);
  });
});

describe('phase labels', () => {
  it('names the quarters in Spanish and English', () => {
    expect(phaseLabel(0).es).toBe('luna nueva');
    expect(phaseLabel(180).en).toBe('full moon');
    expect(phaseLabel(90).es).toBe('cuarto creciente');
    expect(phaseLabel(270).en).toBe('last quarter');
    expect(phaseLabel(359).es).toBe('luna nueva');
  });
});

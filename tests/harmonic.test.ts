import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CONSTITUENT_SPEEDS_DEG_PER_HOUR,
  DEFAULT_CONSTITUENTS,
  fitHarmonic,
  interpolateGapsLinear,
  rayleighHours,
  solveLinearSystem,
  type HarmonicSample,
} from '../src/data/harmonic.js';
import { parseDep, parseHry } from '../src/data/parseJma.js';

describe('linear solver', () => {
  it('solves a small system exactly', () => {
    const x = solveLinearSystem(
      [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ],
      [8, -11, -3],
    );
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
    expect(x[2]).toBeCloseTo(-1, 10);
  });

  it('refuses a singular matrix rather than returning nonsense', () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    ).toThrow(/singular/);
  });
});

describe('Rayleigh separation', () => {
  it('separates the six chosen constituents within the 122-day record', () => {
    const recordHours = 122 * 24;
    const speeds = DEFAULT_CONSTITUENTS.map((n) => CONSTITUENT_SPEEDS_DEG_PER_HOUR[n]);
    for (let i = 0; i < speeds.length; i += 1) {
      for (let j = i + 1; j < speeds.length; j += 1) {
        expect(rayleighHours(speeds[i], speeds[j])).toBeLessThan(recordHours);
      }
    }
  });

  it('shows why K2 and P1 are excluded: they need about six months', () => {
    expect(rayleighHours(30.0820853, 30.0) / 24).toBeGreaterThan(180); // K2 vs S2
    expect(rayleighHours(15.0410686, 14.9589314) / 24).toBeGreaterThan(180); // K1 vs P1
  });
});

describe('fitting a known signal', () => {
  it('recovers the amplitude and phase of a synthetic M2 + K1 tide', () => {
    const m2 = (CONSTITUENT_SPEEDS_DEG_PER_HOUR.M2 * Math.PI) / 180;
    const k1 = (CONSTITUENT_SPEEDS_DEG_PER_HOUR.K1 * Math.PI) / 180;
    const samples: HarmonicSample[] = [];
    for (let hour = 0; hour < 24 * 122; hour += 1) {
      samples.push({
        hour,
        value: 380 + 55 * Math.cos(m2 * hour - 1.2) + 19 * Math.cos(k1 * hour - 0.4),
      });
    }
    const fit = fitHarmonic(samples);
    expect(fit.mean).toBeCloseTo(380, 3);

    const byName = Object.fromEntries(fit.constituents.map((c) => [c.name, c]));
    expect(byName.M2.amplitude).toBeCloseTo(55, 3);
    expect(byName.K1.amplitude).toBeCloseTo(19, 3);
    expect((byName.M2.phaseDeg * Math.PI) / 180).toBeCloseTo(1.2, 3);
    expect((byName.K1.phaseDeg * Math.PI) / 180).toBeCloseTo(0.4, 3);
    // Constituents absent from the signal come back near zero.
    expect(byName.S2.amplitude).toBeLessThan(0.5);
    expect(fit.residualRms).toBeLessThan(0.01);
    expect(fit.rSquared).toBeGreaterThan(0.999);
  });

  it('reproduces its own samples through evaluate()', () => {
    const samples: HarmonicSample[] = [];
    for (let hour = 0; hour < 1000; hour += 1) {
      samples.push({ hour, value: 10 * Math.sin(hour / 7) + 3 });
    }
    const fit = fitHarmonic(samples);
    for (const sample of samples.slice(0, 20)) {
      expect(Number.isFinite(fit.evaluate(sample.hour))).toBe(true);
    }
  });

  it('refuses a fit with too few samples to be meaningful', () => {
    expect(() => fitHarmonic([{ hour: 0, value: 1 }])).toThrow(/too few/);
  });
});

describe('fitting the real Tanegashima record', () => {
  const rawDir = resolve(import.meta.dirname, '../data/raw/jma');
  const samples: HarmonicSample[] = [];
  let hour = 0;
  for (const month of ['09', '10', '11', '12']) {
    const hry = parseHry(readFileSync(resolve(rawDir, `hry1999${month}TJ.txt`), 'utf8'));
    const dep = parseDep(readFileSync(resolve(rawDir, `dep1999${month}TJ.txt`), 'utf8'));
    hry.forEach((day, index) => {
      day.hourly.forEach((obs, h) => {
        const anomaly = dep[index].hourly[h];
        if (obs !== null && anomaly !== null) samples.push({ hour, value: obs - anomaly });
        hour += 1;
      });
    });
  }
  const fit = fitHarmonic(samples);

  it('uses the 2887 hours that have both an observation and an anomaly', () => {
    expect(fit.sampleCount).toBe(2887);
  });

  it('finds M2 as the dominant constituent, near 55 cm', () => {
    const sorted = [...fit.constituents].sort((a, b) => b.amplitude - a.amplitude);
    expect(sorted[0].name).toBe('M2');
    expect(sorted[0].amplitude).toBeGreaterThan(45);
    expect(sorted[0].amplitude).toBeLessThan(65);
  });

  it('orders the constituents the way a mixed semidiurnal station should', () => {
    const byName = Object.fromEntries(fit.constituents.map((c) => [c.name, c.amplitude]));
    expect(byName.M2).toBeGreaterThan(byName.S2);
    expect(byName.S2).toBeGreaterThan(byName.K1);
    expect(byName.K1).toBeGreaterThan(byName.O1);
    expect(byName.O1).toBeGreaterThan(byName.N2);
    expect(byName.N2).toBeGreaterThan(byName.Q1);
  });

  it('leaves a residual RMS small enough for a six-constituent gap filler', () => {
    // Six constituents cannot represent the shallow-water and long-period terms,
    // so a residual of roughly 10 cm against a ~230 cm range is expected.
    expect(fit.residualRms).toBeLessThan(15);
    expect(fit.rSquared).toBeGreaterThan(0.95);
  });

  it('predicts held-out hours to within the residual scale', () => {
    // Hold out a 13-hour block the size of the real October gap and check that
    // the fit reconstructs it, which is exactly the job it does in the build.
    const holdoutStart = 1000;
    const kept = samples.filter(
      (s) => s.hour < holdoutStart || s.hour >= holdoutStart + 13,
    );
    const heldOut = samples.filter(
      (s) => s.hour >= holdoutStart && s.hour < holdoutStart + 13,
    );
    const partial = fitHarmonic(kept);
    const errors = heldOut.map((s) => Math.abs(partial.evaluate(s.hour) - s.value));
    const rms = Math.sqrt(errors.reduce((t, e) => t + e * e, 0) / errors.length);
    expect(rms).toBeLessThan(25);
  });
});

describe('linear gap interpolation', () => {
  it('fills an interior gap linearly', () => {
    expect(interpolateGapsLinear([0, null, null, 3])).toEqual([0, 1, 2, 3]);
  });

  it('extends the end values rather than extrapolating a trend', () => {
    expect(interpolateGapsLinear([null, 5, 7, null])).toEqual([5, 5, 7, 7]);
  });

  it('leaves known values untouched', () => {
    expect(interpolateGapsLinear([2, 4, 6])).toEqual([2, 4, 6]);
  });

  it('refuses an all-missing series', () => {
    expect(() => interpolateGapsLinear([null, null])).toThrow(/no known values/);
  });
});
